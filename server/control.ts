// Control, driven from outside: an agent (through scripts/control-mcp.ts, or any
// HTTP client) sends a command, the open Control page carries it out on its
// stage and replies. The same relay pushes the staged scene into Blender and
// pulls it back, through the official Blender MCP add-on's socket.

import { connect } from "node:net";
import type { IncomingMessage, ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";

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
Props: box (a 0.6 m cube), cylinder (0.6 m wide, 0.8 m tall), sphere (0.7 m), plane (a wall 2.4 m wide, 2.2 m tall; scale [2, 1, 1] makes it 4.8 m wide), stairs (1 m wide, five steps rising toward -z). y lifts a prop, e.g. y 0.6 stacks it on a box.
Spacing that reads well: two people talking 1 to 1.5 m apart, fighting 0.8 to 1.2 m, a wall 1.5 to 3 m behind them. Keep everything within 4 m of the centre.

ACTIONS
- layout {clear, characters: [{name, pose, x, z, facing or face_toward, height}], props: [{type, label, x, z, y, facing or face_toward, scale}], camera: {...}}: a whole scene at once. For a new scene use it with clear: true. Without clear it moves what is already there by name and adds the rest; for a small change, use the small actions instead.
- add_character {name, pose, x, z, facing or face_toward, height}
- add_prop {type, label, x, z, y, facing or face_toward, scale}
- place {id, x, z, y, facing or face_toward, scale, height}: id is a name from the scene
- pose {id, pose, mirror}
- joint {id, joint, rotation: [x, y, z] in degrees}
- reach {id, effector, target}: effector is LeftHand, RightHand, LeftFoot or RightFoot; target a name (the hand rests on its top) or [x, y, z]
- remove {id}
- camera {snap, of, focal, ratio}: of is a character name or "all"; focal in mm from 14 to 200 (24 wide, 35 natural, 50 normal, 85 portrait)
- to_blender {}: send the stage to Blender to refine it there. from_blender {}: bring Blender's changes back.

Poses by what people do: talk or wait stand; argue point or arms-crossed; greet wave; fight, punch or box fight; run run; kneel kneel; sit sit (seated as on a chair, so give them a box to sit on).
Every character gets facing or face_toward: people in a scene together face each other or what they act on.
Two people facing each other along x are seen in profile by the front snap: that is the side view of a talk or a duel. The side snap looks along the line between them and hides one behind the other.

Give every character a short name (the user's words when they give one) and use names, never ids. Change only what the user asks for: the stage as it is now is below, with a picture of what the camera frame shows. If the user only asks a question, answer it with no actions. The poses, snaps and frames you may use are listed with the stage; use no others.

EXAMPLE
User: a girl sits on the stairs while her friend waves at her, wide shot
{"reply": "She sits on the steps and her friend waves from the side.", "actions": [{"op": "layout", "args": {"clear": true, "props": [{"type": "stairs", "label": "Stairs", "x": -0.6, "z": -0.4}], "characters": [{"name": "Mia", "pose": "sit", "x": -0.6, "z": 0, "facing": 20}, {"name": "Leo", "pose": "wave", "x": 1.2, "z": 0.3, "face_toward": "Mia"}], "camera": {"snap": "front", "of": "all", "focal": 24, "ratio": "16:9"}}}]}`;

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
 * one shows it was due, a stray closer is dropped, trailing commas go, open ones are closed.
 */
export function mendJson(text: string) {
  const out: string[] = [];
  const open: string[] = [];
  let inString = false;
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
    if (ch === '"') inString = true;
    if (ch === "{" || ch === "[") open.push(ch === "{" ? "}" : "]");
    if (ch === "}" || ch === "]") {
      if (!open.includes(ch)) continue;
      while (open.at(-1) !== ch) close(open.pop()!);
      close(open.pop()!);
      continue;
    }
    out.push(ch);
  }
  while (open.length) close(open.pop()!);
  return out.join("");
}

/**
 * What a small model gets wrong in a layout, put right. A character left without a direction
 * (it writes facing 0 as a filler) turns to the nearest other one, or, alone, to the first thing
 * it could act on (not a wall or stairs). And people standing side by side along x are seen in
 * profile from the front: a side snap of them would look along their line, one behind the other.
 */
function faceSomething(args: Record<string, any>) {
  const characters = Array.isArray(args.characters) ? args.characters : [];
  const props = (Array.isArray(args.props) ? args.props : []).filter((p: any) => p?.label && !["plane", "wall", "stairs"].includes(String(p.type)));
  const xz = (o: any) => [Number(o?.x) || 0, Number(o?.z) || 0];
  const cam = args.camera;
  if (cam && cam.snap === "side" && (!cam.of || cam.of === "all") && characters.length > 1) {
    const span = (i: number) => Math.max(...characters.map((c: any) => xz(c)[i])) - Math.min(...characters.map((c: any) => xz(c)[i]));
    if (span(0) > 2 * span(1)) cam.snap = "front";
  }
  for (const c of characters) {
    if (!c || c.face_toward !== undefined || (c.facing !== undefined && Number(c.facing) !== 0)) continue;
    const [x, z] = xz(c);
    const others = characters.filter((o: any) => o !== c && o?.name);
    const near = others.sort((a: any, b: any) => Math.hypot(xz(a)[0] - x, xz(a)[1] - z) - Math.hypot(xz(b)[0] - x, xz(b)[1] - z))[0];
    if (near) c.face_toward = near.name;
    else if (props.length) c.face_toward = props[0].label;
    if (c.face_toward !== undefined) delete c.facing;
  }
}

/** The answer, read leniently: the first JSON object in it, only the actions Control has. */
export function readControlAnswer(text: string): { reply: string; actions: ControlAction[] } {
  if (process.env.COMFYTURE_DEBUG) console.log(`control assistant answered\n${text}`);
  let raw: Record<string, any>;
  const body = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  try {
    try {
      raw = JSON.parse(body);
    } catch {
      raw = JSON.parse(mendJson(body));
    }
  } catch {
    console.warn(`control assistant: unreadable answer\n${text}`);
    return { reply: text.replace(/[{}"]/g, "").replace(/\s+/g, " ").trim().slice(0, 600) || "Sorry, I lost my words. Say it again?", actions: [] };
  }
  const actions = (Array.isArray(raw.actions) ? raw.actions : [])
    .slice(0, 12)
    .map((a: any) => ({ op: String(a?.op ?? a?.do ?? ""), args: a?.args && typeof a.args === "object" ? a.args : {} }))
    .filter((a: ControlAction) => (CONTROL_OPS as readonly string[]).includes(a.op));
  for (const a of actions) if (a.op === "layout") faceSomething(a.args);
  return { reply: String(raw.reply ?? "").replace(/\s+/g, " ").trim().slice(0, 600) || (actions.length ? "Done." : "…"), actions };
}
