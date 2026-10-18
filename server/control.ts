// Control, driven from outside: an agent (through scripts/control-mcp.ts, or any
// HTTP client) sends a command, the open Control page carries it out on its
// stage and replies. The same relay pushes the staged scene into Blender and
// pulls it back, through the official Blender MCP add-on's socket.

import { routerAsk } from "./llm.ts";
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
  if (!page) return Promise.resolve({ ok: false, error: "The Stage is not open. Open Comfyture in a browser: the Stage loads in it." });
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
export const CONTROL_BRIEF = `You are the stage manager inside Comfyture's Stage: a 3D blocking table with wooden mannequins, blockout set pieces and a camera on a timeline. People stage a scene here to make control references (depth, pose, line art, colour ID, masks) and control videos for image and video models. The user says what they want in plain words; you stage it.

Answer with JSON only, no other text:
{"reply": "one or two short sentences", "actions": [{"op": "...", "args": {...}}]}

THE STAGE
Metres, the ground at y = 0. x runs left (-) to right (+) as the default camera sees it; z runs from the back (-) to the front (+, toward the camera).
facing is degrees about the vertical: 0 looks at the camera, 90 looks right (+x), -90 looks left, 180 looks away. face_toward takes a name (or [x, z]) and turns to it.
Spacing that reads well: two people talking 1 to 1.5 m apart, fighting 0.8 to 1.2 m, a wall 1.5 to 3 m behind them. Keep everything within 5 m of the centre.

CHARACTERS
Each has a name (use names, never ids), a body type, a colour and a pose.
Body types: man, woman, teen, child, toddler, elder, heavy, athletic. Pick from the user's words: a girl or a boy is a teen, a kid a child, a baby a toddler, a grandmother an elder. Each is shaped for its silhouette (a woman's waist and hips, a child's big head, an elder's stoop, a heavy belly, an athlete's shoulders), and every pose fits every body: hands find hips, knees and faces on any of them.
Animals: the cute baby animals listed under "animals" below (a baby chick, a puppy, a kitten…) act like characters but are added as set pieces: add_prop (or props in a layout) with their type, a label that is their name ("Biscuit") and a pose: stand, sit, lie, walk or hop. pose {id, pose} changes it, and one that move_to or keys carry walks. Give them facing or face_toward like anyone. The Creatures assets are plain set dressing (a horse, a pigeon).
Colours: coral, teal, amber, violet, green, pink, blue, tan. Give each character a different one: they tell people apart in the colour ID pass.
Hand props (hold): phone, cup, book, camera, sword, pistol, umbrella, bag, guitar, steering-wheel, and every small piece listed under "what a hand can hold" (a bottle, an apple, a coffee). "hold": "phone" puts one in the right hand, {"right": "cup", "left": "bag"} fills both, null empties them. Poses that hold something bring it themselves: phone-call, walk-phone and selfie a phone, drink a cup, read a book, photo a camera, sword a sword, aim a pistol, drive a steering wheel. Give hold only for something else (an umbrella on a walk, a bag in a hand).
Pose sliders (params, in degrees; crouch from 0 to 1): look (turns the head, + to its left), nod (+ looks down), tilt, lean (+ forward), twist, side, arms (raises both), reach (arms forward), elbows (bends them), stance (feet apart), step (left foot forward), crouch. Use them to adjust a pose, for example "params": {"look": 30, "lean": 10}.

ASSETS (type: what it is; size [width, height, depth] in metres changes it)
Furniture: chair, armchair, sofa, stool, bench, table (1.2 x 0.75 x 0.7), desk, counter, bed (its headboard at the back), shelf, lamp, tv, fridge, stove, kitchen-island, office-chair, wardrobe, bathtub, piano (upright).
Architecture: plane (a wall, 4 x 2.6), doorway (a wall with an opening), window (a wall with a window), door, pillar, arch, stairs (the steps rise toward -z), ramp, platform, floor (a rug), fence.
Outdoor: car (4.3 m long, along x), tree, pine-tree, palm-tree, bush, rock, streetlamp, bus-stop (a shelter with a bench), trash-bin, mailbox, phone-booth, tent, campfire, rowing-boat, crate, barrel, traffic-cone. Basic: box, cylinder, sphere, cone.
Seats, for sit_on: chair, armchair, sofa, stool, bench, office-chair, bed (its edge), stairs, platform, bus-stop, rowing-boat, bathtub (in it), crate, barrel. Tops, for on: table, desk, counter, kitchen-island, bed, platform, crate, box.

RELATIONS: say where things are relative to each other and the app works out the numbers. Use them instead of x and z whenever the user relates things:
- against: a name. The back rests on it, touching: only for leaning or resting on it ("leans on the wall", "back to the pillar"). By or near a wall is not against: put the wall 1.5 to 3 m behind them instead.
- sit_on: a name. Seated on it, facing the way the seat faces (a chair is turned to the sitter's face_toward). A seat that does not exist yet is made.
- on: a name. Standing (or lying) on it, or a prop resting on top of another.
- between: [name, name]. Halfway between the two.
- next_to: a name, with side (left, right, front or behind) and distance in metres.

ACTIONS
- layout {clear, characters: [{name, body, color, pose, hold, x, z or a relation, facing or face_toward, height, params}], props: [{type, label, x, z or a relation, facing or face_toward, size}], camera: {...}, duration}: a whole scene at once. For a new scene use it with clear: true. Without clear it moves what is already there by name and adds the rest; for a small change, use the small actions instead.
- add_character {name, body (or rig: one of the user's own rigged characters), color, pose, hold, x, z or a relation, facing or face_toward, height, params}
- add_prop {type, label, x, z or a relation, facing or face_toward, size, pose (animals only)}
- place {id, x, z or a relation, facing or face_toward, size, height, body, color, params, hold, name}: id is a name from the scene; name renames it
- pose {id, pose, mirror, params}
- joint {id, joint, rotation: [x, y, z] in degrees}: only when the user asks to move one limb
- reach {id, effector, target}: a hand or foot (LeftHand, RightHand, LeftFoot, RightFoot) on a named thing, only when the user asks for it
- remove {id}
- camera {snap, of, focal, ratio}: of is a character name or "all"; focal in mm from 14 to 200 (24 wide, 35 natural, 50 normal, 85 portrait)

FOR A VIDEO (the shot plays over a timeline, 5 seconds unless said)
- camera_move {move, amount, duration}: the camera as it is now is the start and the move sets where it ends. Moves: locked, push-in, pull-out, orbit-left, orbit-right, crane-up, crane-down, truck-left, truck-right, tilt-up, tilt-down, zoom-in, zoom-out, handheld. Snap the camera first if it needs a new angle, then move it.
- move_to {id, to, side, distance, start, end, gait, pose, face_toward}: someone walks to a name or [x, z] between start and end (seconds), stopping short of it; gait walk, run or none.
- duration {seconds}: how long the shot is.
- to_blender {}: send the stage to Blender to refine it there. from_blender {}: bring Blender's changes back.

A PICTURE OF THE FRAME
- render_image {prompt, count}: a finished picture of what the camera frame shows: the frame is its layout, and prompt says how it looks. Write prompt in English: what each one does, calling them by @ and their name in lowercase ("@mo checks his phone, @lu waves at him"), then the place, the time of day, the light, the weather and the style ("a rainy night in Tokyo, neon reflections, cinematic"). Say who a character without a sheet is and what they wear in a few words, once ("@mo, a businessman in a grey suit, checks his phone"). The app sends the frame with its colour map, tells the image model which figure is whom, and sends each sheet's words and pictures with its @name. Never describe a character by its mannequin colour (coral, teal, amber…): those colours only tell the figures apart, and the app tells the image model which figure is which. count is 1 to 4 versions (1 unless asked). A character or piece listed with a sheet is drawn from it: the app sends its words and its pictures (a face, an outfit, a product) with the frame, so name it and say what it does, never what it looks like. Use it when the user asks to render, to make an image or a picture of the scene, or to see it for real. It runs after the other actions, so stage the changes they ask for in the same answer.
- tag {id, description}: writes on a character's sheet who they are and how they look (age, face, hair, clothes, in one or two sentences), or on a piece's sheet what it is (material, colour, brand); every render follows it. Use it when the user says how someone looks for good ("Mia has curly red hair and a striped shirt"), not for one render.

Poses by what people do. Standing: wait stand, casual stand-weight, arms-crossed, hands-on-hips, hands-in-pockets, hands-behind-back, lean on a wall lean-back (with against the wall: back on it, one foot up on it), lean on a counter or a bar lean-on, look-up, tired slouch, cold, t-pose. Moving: walk, run, sneak, jump, walking while texting walk-phone, climb, stumble fall, dance. Sitting: sit on a chair sit, sit back sit-relaxed, legs crossed sit-cross-legs, at a desk or typing sit-desk, elbows on knees sit-hunched, at the wheel drive (with sit_on the car's seat or a chair), on the floor sit-floor, hugging the knees sit-knees-up, kneel, crouch, lie down lie, lie-side, lie on the front lie-front. Gestures: talk or explain talk, argue point or arms-crossed, greet wave, think thinking, on the phone phone-call, not knowing shrug, celebrate cheer, surrender hands-up, bow, thumbs-up, facepalm, salute, stop, hand-on-heart, pray, waiting or impatient look-at-watch, confused scratch-head, shocked cover-mouth, despair hands-on-head, offer a hand handshake, welcome open-arms, selfie. Action: fight, punch, kick, hero-landing, reach up reach, aim, carry, push, pull, throw, sword, block, lift a box lift, drink, read, take a photo photo, pick-up. A pose already holds the arms and legs: do not add joint or reach for what it shows.
Every character gets facing or face_toward: people in a scene together face each other or what they act on.
To make someone look at another without moving them (seated, leaning, lying), use params look and nod; face_toward turns the whole body.
People on a stage, a podium or a platform get on: its name (anyone placed over a platform stands on it anyway).
Two people facing each other along x are seen in profile by the front snap: that is the side view of a talk or a duel. The side snap looks along the line between them and hides one behind the other.

Change only what the user asks for: the stage as it is now is below, with a picture of what the camera frame shows. If the user only asks a question, answer it with no actions. Use only the poses, assets, snaps, moves and frames listed.

EXAMPLES
User: a girl sits on the stairs while her friend waves at her, wide shot
{"reply": "She sits on the steps and her friend waves from the side.", "actions": [{"op": "layout", "args": {"clear": true, "props": [{"type": "stairs", "label": "Stairs", "x": -0.6, "z": -0.4}], "characters": [{"name": "Mia", "body": "teen", "color": "violet", "pose": "sit", "sit_on": "Stairs", "facing": 20}, {"name": "Leo", "body": "teen", "color": "teal", "pose": "wave", "next_to": "Mia", "side": "right", "distance": 1.6, "face_toward": "Mia"}], "camera": {"snap": "front", "of": "all", "focal": 24, "ratio": "16:9"}}}]}

User: a woman waits against a pillar with her hands in her pockets
{"reply": "She leans on the pillar, hands in her pockets.", "actions": [{"op": "layout", "args": {"clear": true, "props": [{"type": "pillar", "label": "Pillar", "x": 0, "z": -0.6}], "characters": [{"name": "Ava", "body": "woman", "color": "amber", "pose": "hands-in-pockets", "against": "Pillar"}], "camera": {"snap": "three-quarter-left", "of": "Ava", "focal": 35, "ratio": "16:9"}}}]}

User: then she walks to the car while the camera pushes in
{"reply": "She walks to the car as the camera pushes in.", "actions": [{"op": "add_prop", "args": {"type": "car", "label": "Car", "x": 3, "z": -1}}, {"op": "move_to", "args": {"id": "Ava", "to": "Car", "gait": "walk"}}, {"op": "camera_move", "args": {"move": "push-in"}}]}

User: render it as a rainy evening in Paris
{"reply": "Rendering her by the car on a rainy Paris evening.", "actions": [{"op": "render_image", "args": {"prompt": "A rainy evening on a Paris street, wet cobblestones reflecting warm shop lights. Ava is a young woman in a beige trench coat with dark hair, walking to a small vintage car. Cinematic, shallow depth of field.", "count": 1}}]}`;

export interface ControlTurn { role: "user" | "assistant"; text: string; did?: string[]; failed?: string[] }
export const CONTROL_OPS = ["layout", "add_character", "add_prop", "place", "rename", "pose", "joint", "reach", "remove", "camera", "camera_move", "move_to", "key", "duration", "clear_keys", "to_blender", "from_blender", "render_image", "tag"] as const;
type ControlAction = { op: (typeof CONTROL_OPS)[number]; args: Record<string, unknown> };

const at = (p: unknown) => (Array.isArray(p) ? `x ${p[0]} z ${p[2]}` : "?");
const list = (v: unknown) => (Array.isArray(v) ? v.slice(0, 60).map(String).join(", ") : "");
/** Every asset type, grouped by its category: "Furniture: chair, sofa…; Food: …". */
const byCategory = (assets: unknown) => {
  const groups = new Map<string, string[]>();
  for (const a of (Array.isArray(assets) ? assets : []) as any[]) groups.set(a.category ?? "Other", [...(groups.get(a.category ?? "Other") ?? []), a.type]);
  return [...groups].map(([c, l]) => `${c}: ${l.join(", ")}`).join("; ");
};

/** A character's or piece's sheet, as the brief lists it: its words, and how many pictures go with them. */
const sheet = (v: any) => {
  if (!v || typeof v !== "object") return "";
  const words = String(v.description ?? "").replace(/\s+/g, " ").trim().slice(0, 300).replace(/"/g, "'");
  const pics = Number(v.pictures) || 0;
  return `, with a sheet${words ? ` ("${words}")` : ""}${pics ? ` and ${pics} ${pics === 1 ? "picture" : "pictures"}` : ""}`;
};

/** The prompt: the stage as the page reported it, and the conversation so far. */
export function controlPrompt(scene: Record<string, any>, turns: ControlTurn[], sees: boolean) {
  const cam = scene.camera ?? {};
  const tl = scene.timeline ?? {};
  const params = (p: Record<string, number> | undefined) => (p && Object.keys(p).length ? `, sliders ${Object.entries(p).map(([k, v]) => `${k} ${v}`).join(" ")}` : "");
  const lines = [
    "THE STAGE NOW",
    `frame ${cam.ratio ?? "16:9"}, lens ${cam.focal ?? 35} mm, camera at [${(cam.position ?? []).join(", ")}] looking at [${(cam.target ?? []).join(", ")}]`,
    `timeline: ${tl.duration ?? 5} s, camera move ${tl.camera_move ?? "locked"}`,
    "characters:",
    ...((scene.characters ?? []) as any[]).slice(0, 12).map((c) => `- ${c.name}: ${c.rig ? "the user's own rigged character" : c.body ?? "man"}, ${c.color ?? "?"}, pose ${c.pose ?? "custom"}${params(c.params)}, ${c.height} m tall, at ${at(c.position)}, facing ${c.facing}${c.seated_on ? `, seated on ${c.seated_on}` : ""}${sheet(c.sheet)}${c.hold ? `, holding ${Object.entries(c.hold).map(([h, t]) => `${t} (${h} hand)`).join(" and ")}` : ""}${c.keys?.length ? `, keyed at ${c.keys.join(", ")} s` : ""}${c.visible === false ? ", hidden" : ""}`),
    ...(scene.characters?.length ? [] : ["none"]),
    "props:",
    ...((scene.props ?? []) as any[]).slice(0, 30).map((p) => `- ${p.label}: ${p.animal ? `the animal ${p.type}, pose ${p.pose}` : p.type}${sheet(p.sheet)}, ${(p.size ?? []).join(" x ")} m, at ${at(p.position)}${p.position?.[1] > 0.01 ? ` lifted ${p.position[1]}` : ""}, facing ${p.facing}`),
    ...(scene.props?.length ? [] : ["none"]),
    `poses you can use: ${list(scene.poses)}`,
    `assets by category: ${byCategory(scene.assets)}`,
    `what a hand can hold: ${(scene.hand_props ?? []).map(String).join(", ")}`,
    ...(scene.animals?.length ? [`animals (add_prop with type and pose): ${(scene.animals as any[]).map((a) => `${a.type} (${(a.poses ?? []).join("/")})`).join(", ")}`] : []),
    ...(scene.user_characters?.length ? [`the user's own rigged characters (add_character with rig: their name): ${(scene.user_characters as any[]).map((r) => `${r.name} (${r.height} m)`).join(", ")}`] : []),
    `camera snaps: ${list(scene.snaps)}`,
    `camera moves: ${list(scene.moves)}`,
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
  makeBeforeUse(actions);
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

/**
 * Things are made before anything refers to them: an add_prop or add_character that comes after
 * an action naming it (leaning on it, sitting on it, walking to it) is moved in front of that action.
 */
function makeBeforeUse(actions: ControlAction[]) {
  const names = (a: ControlAction) => {
    const out: string[] = [];
    const take = (v: unknown) => {
      if (typeof v === "string") out.push(v.toLowerCase());
      else if (Array.isArray(v)) v.forEach(take);
    };
    const scan = (args: any) => ["against", "sit_on", "on", "between", "next_to", "face_toward", "to", "target", "of"].forEach((k) => take(args?.[k]));
    scan(a.args);
    if (a.op === "layout") for (const t of [...(a.args.characters ?? []), ...(a.args.props ?? [])]) scan(t);
    return out;
  };
  const made = (a: ControlAction) => (a.op === "add_prop" ? lc(a.args.label ?? a.args.type) : a.op === "add_character" ? lc(a.args.name) : null);
  for (let guard = 0; guard < 24; guard++) {
    let moved = false;
    for (let i = 0; i < actions.length && !moved; i++) {
      const wanted = names(actions[i]);
      const j = actions.findIndex((b, k) => k > i && made(b) && wanted.includes(made(b)!) && !names(b).includes(made(actions[i]) ?? "\u0000"));
      if (j > i) {
        const [b] = actions.splice(j, 1);
        actions.splice(i, 0, b);
        moved = true;
      }
    }
    if (!moved) return;
  }
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
  const SET = ["plane", "wall", "stairs", "doorway", "window", "pillar", "arch", "ramp", "platform", "floor", "fence", "tree", "bush", "rock", "streetlamp"];
  const props = (Array.isArray(args.props) ? args.props : []).filter((p: any) => p?.label && !SET.includes(String(p.type)));
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

/** The Stage assistant on Claude (Comfy Router): its answer always comes as the stage tool's input, so always JSON. */
export const askClaude = (model: string, prompt: string, picture?: { type: string; data: string }) =>
  routerAsk(model, CONTROL_BRIEF, prompt, { maxTokens: 2000, temperature: 0.5, image: picture ? { type: `image/${picture.type}`, data: picture.data } : undefined, tool: STAGE_TOOL });
