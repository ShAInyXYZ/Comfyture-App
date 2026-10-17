// Control, driven from outside: an agent (through scripts/control-mcp.ts, or any
// HTTP client) sends a command, the open Control page carries it out on its
// stage and replies. The same relay pushes the staged scene into Blender and
// pulls it back, through the official Blender MCP add-on's socket.

import { connect } from "node:net";
import type { IncomingMessage, ServerResponse } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";

type Reply = { ok: boolean; result?: unknown; error?: string };
type Waiting = { resolve: (r: Reply) => void; timer: NodeJS.Timeout };

const pages: ServerResponse[] = [];
const waiting = new Map<string, Waiting>();

/** The Control page's event stream; the page opened last is the one commands go to. */
export function controlEvents(req: IncomingMessage, res: ServerResponse) {
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
  res.write(`event: hello\ndata: {}\n\n`);
  pages.push(res);
  const ping = setInterval(() => res.write(": ping\n\n"), 20_000);
  req.on("close", () => {
    clearInterval(ping);
    const i = pages.indexOf(res);
    if (i >= 0) pages.splice(i, 1);
  });
}

export const controlConnected = () => pages.length > 0;

/** Sends one command to the open Control page and waits for its reply. */
export function command(op: string, args: Record<string, unknown> = {}, timeout = 20_000): Promise<Reply> {
  const page = pages.at(-1);
  if (!page) return Promise.resolve({ ok: false, error: "No Control page is open. Open /control.html first." });
  const id = randomBytes(6).toString("hex");
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      waiting.delete(id);
      resolve({ ok: false, error: `The Control page did not answer "${op}" in ${timeout / 1000} s.` });
    }, timeout);
    waiting.set(id, { resolve, timer });
    page.write(`event: command\ndata: ${JSON.stringify({ id, op, args })}\n\n`);
  });
}

/** The page's answer to a command. */
export function reply(input: Record<string, unknown>) {
  const w = waiting.get(String(input.id));
  if (!w) return false;
  waiting.delete(String(input.id));
  clearTimeout(w.timer);
  w.resolve({ ok: input.ok === true, result: input.result, error: typeof input.error === "string" ? input.error : undefined });
  return true;
}

// ------------------------------------------------------------------ Blender

const BLENDER_HOST = process.env.BLENDER_MCP_HOST ?? "localhost";
const BLENDER_PORT = Number(process.env.BLENDER_MCP_PORT ?? 9876);

/** Runs Python in Blender through the add-on's socket: JSON in, JSON out, each ended by a NUL. */
function blender(code: string, timeout = 120_000): Promise<Record<string, any>> {
  return new Promise((resolve, reject) => {
    const socket = connect(BLENDER_PORT, BLENDER_HOST);
    const chunks: Buffer[] = [];
    const fail = (message: string) => (socket.destroy(), reject(Object.assign(new Error(message), { status: 502 })));
    socket.setTimeout(timeout, () => fail(`Blender did not answer in ${timeout / 1000} s.`));
    socket.on("connect", () => socket.write(JSON.stringify({ type: "execute", code, strict_json: true }) + "\0"));
    socket.on("data", (chunk) => {
      chunks.push(chunk);
      if (!chunk.includes(0)) return;
      const text = Buffer.concat(chunks).toString("utf8");
      socket.end();
      const answer = JSON.parse(text.slice(0, text.indexOf("\0")));
      if (answer.status !== "ok") return reject(Object.assign(new Error(String(answer.message ?? "Blender failed.")), { status: 502 }));
      resolve(answer.result ?? {});
    });
    socket.on("error", (e: NodeJS.ErrnoException) =>
      fail(e.code === "ECONNREFUSED"
        ? `Blender is not listening on ${BLENDER_HOST}:${BLENDER_PORT}. Start the MCP server in Blender (or run blender --background --command blender_mcp).`
        : e.message));
  });
}

/** Data for a Python snippet, as base64 JSON, so nothing in it is ever read as code. */
const pyData = (value: unknown) => `json.loads(base64.b64decode("${Buffer.from(JSON.stringify(value)).toString("base64")}"))`;

const PY_HEAD = `import bpy, base64, json, math, mathutils, os, re, tempfile
COLL = "Comfyture Control"
`;

export async function blenderStatus() {
  return blender(`${PY_HEAD}
coll = bpy.data.collections.get(COLL)
result = {"version": bpy.app.version_string, "file": bpy.data.filepath or None, "background": bpy.app.background,
          "objects": len(bpy.data.objects), "staged": len(coll.all_objects) if coll else 0}
`, 10_000);
}

/** Exports the stage as GLB and rebuilds it in Blender's "Comfyture Control" collection with the shot camera. */
export async function toBlender() {
  const out = await command("export_glb", {}, 60_000);
  if (!out.ok) throw Object.assign(new Error(out.error), { status: 409 });
  const { glb, camera } = out.result as { glb: string; camera: { position: number[]; target: number[]; focal: number; ratio: string } };
  return blender(`${PY_HEAD}
glb = base64.b64decode("${glb}")
cam = ${pyData(camera)}
scene = bpy.context.scene
coll = bpy.data.collections.get(COLL)
if coll is None:
    coll = bpy.data.collections.new(COLL)
    scene.collection.children.link(coll)
for o in list(coll.all_objects):
    bpy.data.objects.remove(o, do_unlink=True)
layer = next(l for l in bpy.context.view_layer.layer_collection.children if l.collection == coll)
bpy.context.view_layer.active_layer_collection = layer
path = os.path.join(tempfile.gettempdir(), "comfyture-control.glb")
with open(path, "wb") as f:
    f.write(glb)
bpy.ops.import_scene.gltf(filepath=path)
os.remove(path)

# the shot camera: three.js is Y-up, Blender Z-up; a full-frame lens fitted vertically keeps the focal length
yup = lambda v: mathutils.Vector((v[0], -v[2], v[1]))
data = bpy.data.cameras.new("Comfyture Camera")
data.sensor_fit = "VERTICAL"
data.sensor_height = 24
data.lens = cam["focal"]
camera = bpy.data.objects.new("Comfyture Camera", data)
coll.objects.link(camera)
camera.location = yup(cam["position"])
camera.rotation_mode = "QUATERNION"
camera.rotation_quaternion = (yup(cam["target"]) - camera.location).to_track_quat("-Z", "Y")
scene.camera = camera
w, h = (int(n) for n in cam["ratio"].split(":"))
long = 1920
scene.render.resolution_x = long if w >= h else round(long * w / h / 2) * 2
scene.render.resolution_y = long if h > w else round(long * h / w / 2) * 2
result = {"collection": COLL, "objects": len(coll.all_objects), "camera": camera.name,
          "resolution": [scene.render.resolution_x, scene.render.resolution_y]}
`);
}

/** Reads the staged collection back from Blender and applies it to the stage. */
export async function fromBlender() {
  const scene = await blender(`${PY_HEAD}
coll = bpy.data.collections.get(COLL)
if coll is None:
    raise RuntimeError("There is no '" + COLL + "' collection in Blender. Send the stage to Blender first.")
# Blender Z-up back to three.js Y-up, for positions, rotations (w, x, y, z) and scales
pos = lambda v: [round(v.x, 5), round(v.z, 5), round(-v.y, 5)]
rot = lambda q: [round(q.x, 6), round(q.z, 6), round(-q.y, 6), round(q.w, 6)]
scl = lambda s: [round(s.x, 5), round(s.z, 5), round(s.y, 5)]
base = lambda name: re.sub(r"\\.\\d{3}$", "", name)
characters, props, other = [], [], []
for o in coll.all_objects:
    kind, oid = o.get("comfyture_kind"), o.get("comfyture_id")
    loc, q, s = o.matrix_world.decompose()
    if kind == "character":
        joints = {}
        for j in o.children_recursive:
            name = j.get("comfyture_joint")
            if name and j.parent:
                joints[name] = rot((j.parent.matrix_world.inverted() @ j.matrix_world).to_quaternion())
        characters.append({"id": oid, "position": pos(loc), "quaternion": rot(q), "joints": joints})
    elif kind == "prop":
        props.append({"id": oid, "position": pos(loc), "quaternion": rot(q), "scale": scl(s)})
    elif o.parent is None and o.type != "CAMERA":
        other.append(o.name)
camera = None
cam = bpy.context.scene.camera
if cam and cam.type == "CAMERA":
    loc, q, _ = cam.matrix_world.decompose()
    ahead = q @ mathutils.Vector((0, 0, -1))
    r = bpy.context.scene.render
    rx, ry = r.resolution_x * r.pixel_aspect_x, r.resolution_y * r.pixel_aspect_y
    d = cam.data
    if d.sensor_fit == "VERTICAL" or (d.sensor_fit == "AUTO" and ry > rx):
        half = (d.sensor_height if d.sensor_fit == "VERTICAL" else d.sensor_width) / 2 / d.lens
    else:
        half = d.sensor_width / 2 / d.lens * ry / rx
    camera = {"position": pos(loc), "target": pos(loc + ahead * 4), "focal": round(12 / half, 2), "aspect": rx / ry}
result = {"characters": characters, "props": props, "camera": camera, "ignored": other}
`);
  const applied = await command("apply_blender", scene, 30_000);
  if (!applied.ok) throw Object.assign(new Error(applied.error), { status: 409 });
  return { ...(applied.result as object), ignored: scene.ignored };
}

// ------------------------------------------------------------------ the assistant

/** Who the assistant is on the Control page, what it can do there, and how the stage measures. */
export const CONTROL_BRIEF = `You are the stage manager inside Comfyture's Control page: a 3D blocking table with wooden mannequins, simple props and a camera. People stage a scene here to make reference pictures (depth, pose) for image and video models. The user says what they want in plain words; you stage it.

Answer with JSON only, no other text:
{"reply": "one or two short sentences", "actions": [{"op": "...", "args": {...}}]}

THE STAGE
Metres, the ground at y = 0. x runs left (-) to right (+) as the default camera sees it; z runs from the back (-) to the front (+, toward the camera).
facing is degrees about the vertical: 0 looks at the camera, 90 looks right (+x), -90 looks left, 180 looks away. face_toward takes a name (or [x, z]) and turns to it: use it for people who talk, fight or look at something.
Props: box (a 0.6 m cube; a table is a box of size [1.2, 0.75, 0.7]), cylinder (0.6 m wide, 0.8 m tall), sphere (0.7 m), plane (a wall, size [4, 2.5, 0.1] by default 2.4 × 2.2 m), stairs (1 m wide, five steps rising toward -z). Use on to stack a prop on another.
Spacing that reads well: two people talking 1 to 1.5 m apart, fighting 0.8 to 1.2 m, a wall 1.5 to 3 m behind them. Keep everything within 4 m of the centre.

RELATIONS: say where things are relative to each other and the app works out the numbers. Use them instead of x and z whenever the user relates things:
- against: a name. The back rests on it, touching: only for leaning or resting on it ("leans on the wall", "back to the pillar"). By or near a wall is not against: put the wall 1.5 to 3 m behind them instead.
- sit_on: a name. Seated on it; a box becomes the chair, sized and put under the hips.
- on: a name. Standing on it, or a prop resting on top of another.
- between: [name, name]. Halfway between the two.
- next_to: a name, with side (left, right, front or behind) and distance in metres.

ACTIONS
- layout {clear, characters: [{name, pose, x, z or a relation, facing or face_toward, height}], props: [{type, label, x, z or a relation, facing or face_toward, size}], camera: {...}}: a whole scene at once. For a new scene use it with clear: true. Without clear it moves what is already there by name and adds the rest; for a small change, use the small actions instead.
- add_character {name, pose, x, z or a relation, facing or face_toward, height}
- add_prop {type, label, x, z or a relation, facing or face_toward, size}: size is [width, height, depth] in metres
- place {id, x, z or a relation, facing or face_toward, size, height}: id is a name from the scene
- pose {id, pose, mirror}
- joint {id, joint, rotation: [x, y, z] in degrees}: only when the user asks to move one limb
- reach {id, effector, target}: effector is LeftHand, RightHand, LeftFoot or RightFoot; target a name (the hand rests on its top). Only when the user asks for a hand or foot on something.
- remove {id}
- camera {snap, of, focal, ratio}: of is a character name or "all"; focal in mm from 14 to 200 (24 wide, 35 natural, 50 normal, 85 portrait)
- to_blender {}: send the stage to Blender to refine it there. from_blender {}: bring Blender's changes back.

Poses by what people do: talk or wait stand; argue point or arms-crossed; greet wave; fight, punch or box fight; run run; kneel kneel; sit sit (with sit_on a box); hands in pockets hands-in-pockets; lean on a wall lean-back (with against the wall: back on it, hands in pockets, one foot up on it). A pose already holds the arms and legs: do not add joint or reach for what it shows.
Every character gets facing or face_toward: people in a scene together face each other or what they act on.
Two people facing each other along x are seen in profile by the front snap: that is the side view of a talk or a duel. The side snap looks along the line between them and hides one behind the other.

Give every character a short name (the user's words when they give one) and use names, never ids. Change only what the user asks for: the stage as it is now is below, with a picture of what the camera frame shows. If the user only asks a question, answer it with no actions. The poses, snaps and frames you may use are listed with the stage; use no others.

EXAMPLE
User: a girl sits on the stairs while her friend waves at her, wide shot
{"reply": "She sits on the steps and her friend waves from the side.", "actions": [{"op": "layout", "args": {"clear": true, "props": [{"type": "stairs", "label": "Stairs", "x": -0.6, "z": -0.4}], "characters": [{"name": "Mia", "pose": "sit", "sit_on": "Stairs", "facing": 20}, {"name": "Leo", "pose": "wave", "next_to": "Mia", "side": "right", "distance": 1.6, "face_toward": "Mia"}], "camera": {"snap": "front", "of": "all", "focal": 24, "ratio": "16:9"}}}]}

User: a woman waits against a pillar with her hands in her pockets
{"reply": "She leans on the pillar, hands in her pockets.", "actions": [{"op": "layout", "args": {"clear": true, "props": [{"type": "cylinder", "label": "Pillar", "x": 0, "z": -0.6, "size": [0.6, 2.6, 0.6]}], "characters": [{"name": "Ava", "pose": "hands-in-pockets", "against": "Pillar"}], "camera": {"snap": "three-quarter-left", "of": "Ava", "focal": 35, "ratio": "16:9"}}}]}`;

export interface ControlTurn { role: "user" | "assistant"; text: string; did?: string[]; failed?: string[] }
export const CONTROL_OPS = ["layout", "add_character", "add_prop", "place", "pose", "joint", "reach", "remove", "camera", "to_blender", "from_blender"] as const;
type ControlAction = { op: (typeof CONTROL_OPS)[number]; args: Record<string, unknown> };

const at = (p: unknown) => (Array.isArray(p) ? `x ${p[0]} z ${p[2]}` : "?");
const list = (v: unknown) => (Array.isArray(v) ? v.slice(0, 40).map(String).join(", ") : "");

/** The prompt: the stage as the page reported it, and the conversation so far. */
export function controlPrompt(scene: Record<string, any>, turns: ControlTurn[], sees: boolean) {
  const cam = scene.camera ?? {};
  const lines = [
    "THE STAGE NOW",
    `frame ${cam.ratio ?? "16:9"}, lens ${cam.focal ?? 35} mm, camera at [${(cam.position ?? []).join(", ")}] looking at [${(cam.target ?? []).join(", ")}]`,
    "characters:",
    ...((scene.characters ?? []) as any[]).slice(0, 12).map((c) => `- ${c.name}: pose ${c.pose ?? "custom"}, ${c.height} m tall, at ${at(c.position)}, facing ${c.facing}${c.visible === false ? ", hidden" : ""}`),
    ...(scene.characters?.length ? [] : ["none"]),
    "props:",
    ...((scene.props ?? []) as any[]).slice(0, 24).map((p) => `- ${p.label}: ${p.type}, ${(p.size ?? []).join(" × ")} m, at ${at(p.position)}${p.position?.[1] > 0.01 && p.type !== "sphere" ? ` lifted ${p.position[1]}` : ""}, facing ${p.facing}`),
    ...(scene.props?.length ? [] : ["none"]),
    `poses you can use: ${list(scene.poses)}`,
    `camera snaps: ${list(scene.snaps)}`,
    `frames: ${list(scene.frames)}`,
    `joints: ${list(scene.joints)}`,
    `the picture attached: ${sees ? "what the camera frame shows now" : "none"}`,
    "",
    "CONVERSATION:",
    ...turns.slice(-8).map((t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.text.slice(0, 800)}${t.did?.length ? ` [the app applied: ${t.did.join(", ")}]` : ""}${t.failed?.length ? ` [the app could not do: ${t.failed.join("; ")}]` : ""}`),
  ];
  return lines.join("\n");
}

/**
 * Mends the brackets of JSON a small model wrote: a closer it forgot is put back where the next
 * one shows it was due (or where a new object starts in place of a key), a stray closer is
 * dropped, trailing commas go, and whatever is still open at the end is closed.
 */
export function mendJson(text: string) {
  const out: string[] = [];
  const open: string[] = [];
  let inString = false;
  // inside an object after { or a comma, only a key may come
  let wantKey = false;
  // a comma right before a closer is dropped
  const close = (c: string) => {
    let k = out.length;
    while (k && /\s/.test(out[k - 1])) k--;
    if (out[k - 1] === ",") out.splice(k - 1, 1);
    out.push(c);
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      out.push(ch);
      if (ch === "\\") out.push(text[++i] ?? "");
      else if (ch === '"') inString = false;
      continue;
    }
    if (/\s/.test(ch)) {
      out.push(ch);
      continue;
    }
    // {"op": ..., "args": {...}, {"op": ... : the object before this one was never closed
    if (wantKey && (ch === "{" || ch === "[") && open.includes("]")) {
      while (open.at(-1) === "}") close(open.pop()!);
      out.push(",");
    }
    wantKey = false;
    if (ch === '"') inString = true;
    if (ch === "{") (open.push("}"), (wantKey = true));
    if (ch === "[") open.push("]");
    if (ch === ",") wantKey = open.at(-1) === "}";
    if (ch === "}" || ch === "]") {
      if (!open.includes(ch)) continue;
      while (open.at(-1) !== ch) close(open.pop()!);
      close(open.pop()!);
      continue;
    }
    out.push(ch);
  }
  if (inString) out.push('"');
  while (open.length) close(open.pop()!);
  return out.join("");
}

/** Numbers and lists of numbers a model wrote as strings ("[0.5, 0.4, 0.5]", "1.2") become numbers. */
function unquote(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(unquote);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, unquote(v)]));
  if (typeof value === "string") {
    const t = value.trim();
    if (/^\[\s*-?\d+(\.\d+)?(\s*,\s*-?\d+(\.\d+)?)*\s*\]$/.test(t)) return JSON.parse(t);
    if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  }
  return value;
}

const RELATION_KEYS = ["face_toward", "against", "sit_on", "on", "between", "next_to"];

/**
 * The shapes a small model invents for relations, made into the one Control reads: a relation
 * named as its own op ({"op": "face_toward", "args": {"id", "target"}}), or wrapped in a
 * place ({"relation": "next_to", "args": {"target", "side", "distance"}}).
 */
function reshape(a: { op: string; args: Record<string, any> }): ControlAction {
  const unwrap = (args: Record<string, any>) => {
    const kind = typeof args.relation === "string" ? args.relation.trim().toLowerCase().replace(/\s+/g, "_") : null;
    if (!kind || !RELATION_KEYS.includes(kind)) return args;
    const inner = args.args && typeof args.args === "object" ? args.args : args;
    const { relation, args: _, target, ...rest } = { ...args, ...inner };
    return { ...rest, [kind]: inner.target ?? inner.name ?? inner.id ?? target };
  };
  if (RELATION_KEYS.includes(a.op)) {
    const { id, name, target, of, ...rest } = a.args;
    return { op: "place", args: { ...rest, id: id ?? name, [a.op]: target ?? of ?? rest[a.op] } };
  }
  if (["place", "add_character", "add_prop"].includes(a.op)) return { op: a.op as ControlAction["op"], args: unwrap(a.args) };
  if (a.op === "layout") {
    for (const k of ["characters", "props"]) if (Array.isArray(a.args[k])) a.args[k] = a.args[k].map((t: any) => (t && typeof t === "object" ? unwrap(t) : t));
  }
  return a as ControlAction;
}

const SEAT = /chair|stool|bench|seat|sofa|couch|throne/i;
const SITS = /^(sit|sitting|seated)$/i;

/**
 * A small model's habits, put right across the whole answer: a name written as facing is a
 * face_toward; y is a filler it sets to a centre height, so it goes (on stacks things); a scale in
 * metres is capped; and someone told to sit, with a chair about and no sit_on, sits on it.
 */
function tidy(actions: ControlAction[], scene: Record<string, any>) {
  const things: Record<string, any>[] = [];
  for (const { op, args } of actions) {
    if (op === "layout") things.push(...(Array.isArray(args.characters) ? args.characters : []), ...(Array.isArray(args.props) ? args.props : []));
    if (op === "add_character" || op === "add_prop" || op === "place") things.push(args);
  }
  for (const t of things) {
    if (!t || typeof t !== "object") continue;
    if (typeof t.facing === "string" && !Number.isFinite(Number(t.facing))) {
      t.face_toward ??= t.facing;
      delete t.facing;
    }
    delete t.y;
    // against a wall while facing someone else is standing by it, not leaning on it
    if (t.against !== undefined && t.face_toward !== undefined && lc(t.face_toward) !== lc(t.against) && !/lean/i.test(String(t.pose))) delete t.against;
    if (t.against !== undefined && t.face_toward !== undefined) delete t.face_toward;
    if (Array.isArray(t.scale)) t.scale = t.scale.map((v: unknown) => Math.min(4, Math.max(0.1, Number(v) || 1)));
    else if (t.scale !== undefined) t.scale = Math.min(4, Math.max(0.1, Number(t.scale) || 1));
  }
  for (const a of actions) if (a.op === "layout") faceSomething(a.args, scene);
  // seats: the chairs on the stage and the ones this answer adds
  const seats = [
    ...((scene.props ?? []) as any[]).map((p) => p.label),
    ...actions.flatMap(({ op, args }) => (op === "add_prop" ? [args.label] : op === "layout" && Array.isArray(args.props) ? args.props.map((p: any) => p?.label) : [])),
  ].filter((l) => typeof l === "string" && SEAT.test(l));
  const sitters = actions.flatMap(({ op, args }) =>
    op === "layout" && Array.isArray(args.characters) ? args.characters.filter((c: any) => SITS.test(String(c?.pose)) && c.sit_on === undefined).map((c: any) => c.name)
    : (op === "add_character" || op === "pose") && SITS.test(String(args.pose)) && args.sit_on === undefined ? [args.name ?? args.id] : []).filter(Boolean);
  const free = [...new Set(seats)];
  const seated = new Set(actions.filter((a) => a.op === "place" && a.args.sit_on !== undefined).map((a) => String(a.args.id).toLowerCase()));
  for (const who of [...new Set(sitters)].filter((w) => !seated.has(String(w).toLowerCase()))) {
    if (!free.length) break;
    actions.push({ op: "place", args: { id: who, sit_on: free.shift() } });
  }
  seatInOrder(actions);
}

const PLACING = ["x", "z", "next_to", "between", "side", "distance"];
const placing = (args: Record<string, any>) => Object.fromEntries(PLACING.filter((k) => args[k] !== undefined).map((k) => [k, args[k]]));
const lc = (v: unknown) => String(v ?? "").toLowerCase();

/**
 * Sitting comes last for whoever sits: first they go where the seat was meant to be (when only
 * the seat was given a place), then they turn, then they sit, and the seat is moved under them.
 */
function seatInOrder(actions: ControlAction[]) {
  // someone added already seated sits once everything else in the answer is there
  for (const a of actions.filter((a) => a.op === "add_character" && a.args.sit_on !== undefined && a.args.name)) {
    actions.push({ op: "place", args: { id: a.args.name, sit_on: a.args.sit_on } });
    delete a.args.sit_on;
  }
  for (const sit of actions.filter((a) => a.op === "place" && a.args.sit_on !== undefined)) {
    const who = lc(sit.args.id);
    const seat = lc(sit.args.sit_on);
    const about = (name: string) => actions.flatMap(({ op, args }) =>
      op === "layout" ? [...(args.characters ?? []), ...(args.props ?? [])].filter((t: any) => lc(t?.name ?? t?.label) === name)
      : (op === "add_character" && lc(args.name) === name) || (op === "add_prop" && lc(args.label) === name) || (op === "place" && args !== sit.args && lc(args.id) === name) ? [args] : []);
    const mine = Object.assign({}, ...about(who).map(placing));
    const theirs = Object.assign({}, ...about(seat).map(placing));
    // the turns this person makes, taken out to come just before the sitting
    const turns = actions.filter((a) => a !== sit && a.op === "place" && lc(a.args.id) === who && Object.keys(a.args).every((k) => ["id", "face_toward", "facing"].includes(k)));
    for (const t of turns) actions.splice(actions.indexOf(t), 1);
    // the seat is made before anyone sits on it
    const made = actions.find((a) => a.op === "add_prop" && lc(a.args.label) === seat);
    if (made && actions.indexOf(made) > actions.indexOf(sit)) actions.splice(actions.indexOf(made), 1);
    const before: ControlAction[] = made && !actions.includes(made) ? [made] : [];
    if (!Object.keys(mine).length && Object.keys(theirs).length) {
      before.push({ op: "place", args: { id: sit.args.id, ...theirs } });
      // moved, so whoever they look at is looked at again from the new place
      const look = about(who).map((t: any) => t.face_toward).find((v: unknown) => v !== undefined);
      if (look !== undefined && !turns.length) before.push({ op: "place", args: { id: sit.args.id, face_toward: look } });
    }
    before.push(...turns);
    actions.splice(actions.indexOf(sit), 0, ...before);
  }
}

/**
 * What a small model gets wrong in a layout, put right. A character left without a direction
 * (it writes facing 0 as a filler) turns to the nearest other one, or, alone, to the first thing
 * it could act on (not a wall or stairs). And people standing side by side along x are seen in
 * profile from the front: a side snap of them would look along their line, one behind the other.
 */
function faceSomething(args: Record<string, any>, scene: Record<string, any>) {
  const characters = Array.isArray(args.characters) ? args.characters : [];
  // without clear, someone already on the stage keeps their place and the way they face, unless told
  const staged = new Set(args.clear ? [] : ((scene.characters ?? []) as any[]).map((c) => String(c.name).toLowerCase()));
  const isNew = (c: any) => !staged.has(String(c?.name).toLowerCase());
  for (const c of characters) if (c && !isNew(c) && Number(c.facing) === 0) delete c.facing;
  const props = (Array.isArray(args.props) ? args.props : []).filter((p: any) => p?.label && !["plane", "wall", "stairs"].includes(String(p.type)));
  const xz = (o: any) => [Number(o?.x) || 0, Number(o?.z) || 0];
  // nobody given a place: side by side along x, 1.2 m apart, facing each other below
  const unplaced = characters.filter((c: any) => c && isNew(c) && c.x === undefined && c.z === undefined && !["against", "sit_on", "on", "between", "next_to"].some((k) => c[k] !== undefined));
  if (unplaced.length > 1 && unplaced.length === characters.filter(isNew).length) {
    unplaced.forEach((c: any, i: number) => {
      c.x = Math.round((i - (unplaced.length - 1) / 2) * 1.2 * 100) / 100;
      c.z = 0;
      if (Number(c.facing) === 180 || Number(c.facing) === 0) delete c.facing;
    });
  }
  const cam = args.camera;
  if (cam && cam.snap === "side" && (!cam.of || cam.of === "all") && characters.length > 1) {
    const span = (i: number) => Math.max(...characters.map((c: any) => xz(c)[i])) - Math.min(...characters.map((c: any) => xz(c)[i]));
    if (span(0) > 2 * span(1)) cam.snap = "front";
  }
  for (const c of characters) {
    // leaning sets its own direction; someone seated or standing on something still looks at people, not at it
    if (!c || !isNew(c) || c.against !== undefined) continue;
    if (c.face_toward !== undefined || (c.facing !== undefined && Number(c.facing) !== 0)) continue;
    const [x, z] = xz(c);
    const others = characters.filter((o: any) => o !== c && o?.name);
    const near = others.sort((a: any, b: any) => Math.hypot(xz(a)[0] - x, xz(a)[1] - z) - Math.hypot(xz(b)[0] - x, xz(b)[1] - z))[0];
    if (near) c.face_toward = near.name;
    else if (props.length && c.sit_on === undefined && c.on === undefined) c.face_toward = props[0].label;
    if (c.face_toward !== undefined) delete c.facing;
  }
}

/** The answer, read leniently: the first JSON object in it, only the actions Control has. */
export function readControlAnswer(text: string, scene: Record<string, any> = {}): { reply: string; actions: ControlAction[]; unreadable?: boolean } {
  if (process.env.COMFYTURE_DEBUG) console.log(`control assistant answered\n${text}`);
  let raw: Record<string, any>;
  const start = text.indexOf("{");
  const body = start < 0 ? "" : text.slice(start);
  try {
    try {
      raw = JSON.parse(body.slice(0, body.lastIndexOf("}") + 1));
    } catch {
      raw = JSON.parse(mendJson(body.replace(/```\s*$/, "").trim()));
    }
  } catch {
    // plain words with no JSON are a reply; broken JSON is never shown
    if (start < 0 && text.trim()) return { reply: text.replace(/\s+/g, " ").trim().slice(0, 600), actions: [] };
    console.warn(`control assistant: unreadable answer\n${text}`);
    return { reply: "", actions: [], unreadable: true };
  }
  const actions = (Array.isArray(raw.actions) ? raw.actions : [])
    .slice(0, 12)
    .map((a: any) => reshape({ op: String(a?.op ?? a?.do ?? ""), args: a?.args && typeof a.args === "object" ? (unquote(a.args) as Record<string, any>) : {} }))
    .filter((a: ControlAction) => (CONTROL_OPS as readonly string[]).includes(a.op));
  tidy(actions, scene);
  return { reply: String(raw.reply ?? "").replace(/\s+/g, " ").trim().slice(0, 600) || (actions.length ? "Done." : "…"), actions };
}

// ------------------------------------------------------------------ the assistant on Claude

/**
 * Which model answers on the Control page: Claude Haiku through Comfy Router when there is a Comfy
 * key (billed in Comfy credits like everything else), else Gemma 4 in ComfyUI.
 */
export const CONTROL_MODEL = (() => {
  const want = process.env.COMFYTURE_ASSISTANT?.trim().toLowerCase();
  if (want === "gemma") return "gemma";
  if (process.env.COMFY_API_KEY?.trim()) return "claude";
  return "gemma";
})();
const CLAUDE_MODEL = process.env.COMFYTURE_CLAUDE_MODEL?.trim() || "claude-haiku-4-5-20251001";
export const controlModelName = () => (CONTROL_MODEL === "claude" ? CLAUDE_MODEL : "gemma-4-e4b");

// the answer as a tool call, so it always arrives as JSON in this shape
const STAGE_TOOL = {
  name: "stage",
  description: "Stage the scene: a short reply to the user and the Control actions that carry out what they asked.",
  input_schema: {
    type: "object",
    properties: {
      reply: { type: "string", description: "One or two short sentences to the user." },
      actions: {
        type: "array",
        items: {
          type: "object",
          properties: { op: { type: "string", enum: [...CONTROL_OPS] }, args: { type: "object" } },
          required: ["op", "args"],
        },
      },
    },
    required: ["reply", "actions"],
  },
};

/** The assistant's answer from Claude through Comfy Router (Anthropic's Messages format), as the JSON text the Gemma path would give. */
export async function askClaude(prompt: string, picture?: { type: string; data: string }) {
  const content: Record<string, unknown>[] = [];
  if (picture) content.push({ type: "image", source: { type: "base64", media_type: `image/${picture.type}`, data: picture.data } });
  content.push({ type: "text", text: prompt });
  const res = await fetch(`https://api.comfy.org/v2/models/anthropic/${CLAUDE_MODEL}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": process.env.COMFY_API_KEY!.trim(), "Idempotency-Key": randomUUID() },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 2000,
      system: [{ type: "text", text: CONTROL_BRIEF, cache_control: { type: "ephemeral" } }],
      tools: [STAGE_TOOL],
      tool_choice: { type: "tool", name: "stage" },
      messages: [{ role: "user", content }],
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(`Claude: ${body?.error?.message ?? body?.message ?? `${res.status} ${res.statusText}`}`), { status: 502 });
  const call = (body.content ?? []).find((c: any) => c.type === "tool_use");
  if (process.env.COMFYTURE_DEBUG) console.log(`claude usage ${JSON.stringify(body.usage)}`);
  return call ? JSON.stringify(call.input) : String((body.content ?? []).map((c: any) => c.text ?? "").join(" "));
}
