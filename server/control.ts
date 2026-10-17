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
