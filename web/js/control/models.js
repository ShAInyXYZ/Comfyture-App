// The modelled library: the bodies, set pieces and hand props made in Blender, listed in
// models/manifest.json. The manifest is read once; each model is fetched on its own, when something
// on the Stage (or in Toaster's library) asks for it, so a page that shows no 3D loads none. Until a
// model arrives, or if it cannot, the Stage draws its own procedural one (body.js, assets.js), so
// nothing waits on them.

import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export const MODELS = { ready: false, manifest: null, bodies: new Map(), props: new Map(), modules: new Map(), hand: new Map(), animals: new Map() };

// what the manifest says of each model, by kind and key: the file to fetch and the piece's sizes
const LISTED = { bodies: new Map(), props: new Map(), modules: new Map(), hand: new Map(), animals: new Map() };

/** What a hand can hold: the hand props, and every piece of the set with a grip. { type: { name, grips } } */
export function holdables(assetByType) {
  const out = new Map();
  for (const [type, h] of LISTED.hand) out.set(type, { type, name: h.name, grips: h.grips, poses: h.poses ?? [], themes: h.themes ?? [], tags: h.tags ?? [] });
  for (const type of LISTED.props.keys()) {
    const def = assetByType(type);
    if (def?.holdable?.grips && !out.has(type)) out.set(type, { type, name: def.name, grips: def.holdable.grips, poses: def.holdable.poses ?? [], themes: def.themes ?? [], tags: def.tags ?? [], piece: true });
  }
  return out;
}

/**
 * Whether a mesh is an open sheet (a backdrop's paper, a canopy, a tablecloth) rather than a
 * closed solid: then it is drawn from both sides. Read once per geometry, which clones share.
 */
export function openSurface(geometry) {
  if (geometry.userData.open !== undefined) return geometry.userData.open;
  const pos = geometry.attributes.position;
  const index = geometry.index;
  // corners at one place are one corner, whatever normals split them
  const weld = new Map();
  const ids = new Int32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const key = `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
    if (!weld.has(key)) weld.set(key, weld.size);
    ids[i] = weld.get(key);
  }
  // an edge only one face has is a border
  const edges = new Map();
  const count = index ? index.count : pos.count;
  const at = (i) => ids[index ? index.getX(i) : i];
  for (let t = 0; t + 2 < count; t += 3) {
    for (let k = 0; k < 3; k++) {
      const a = at(t + k);
      const b = at(t + ((k + 1) % 3));
      const key = a < b ? a * 2 ** 21 + b : b * 2 ** 21 + a;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  let border = 0;
  for (const n of edges.values()) if (n === 1) border++;
  return (geometry.userData.open = border > 0.05 * edges.size);
}

let reading = null;
let where = "models/";

/** Reads the manifest (once): which model each body, piece, hand prop and animal has. Resolves to MODELS either way. */
export function loadManifest(base = "models/") {
  reading ??= (async () => {
    const res = await fetch(`${base}manifest.json`);
    if (!res.ok) throw new Error(`no model manifest (${res.status})`);
    const manifest = await res.json();
    MODELS.manifest = manifest;
    where = base;
    const list = (kind, items, key) => items?.forEach((item) => LISTED[kind].set(item[key], item));
    list("bodies", manifest.bodies, "id");
    list("hand", manifest.handProps, "type");
    list("animals", manifest.animals, "type");
    for (const a of manifest.assets ?? []) {
      list("props", [a], "type");
      list("modules", a.modules, "type");
    }
    MODELS.ready = true;
    return MODELS;
  })().catch((e) => {
    console.warn("models:", e.message);
    MODELS.ready = true;
    return MODELS;
  });
  return reading;
}

// ------------------------------------------------------------------ the models, one at a time

const loader = new GLTFLoader();
// the models on their way, and the ones that could not come
const coming = new Map();
const failed = new Set();
// what a build is asking for just now (see watching)
const watchers = [];
const arrivals = new Set();

/** Called with (kind, key) whenever a model has arrived: the pieces made of it can take it. */
export const onModel = (fn) => (arrivals.add(fn), () => arrivals.delete(fn));

/**
 * Asks for one model ("bodies", "props", "modules", "hand" or "animals", and its id or type). It is fetched
 * once, behind whatever asked, and everyone listening is told when it is in. Returns its promise, or null when
 * it is here already, has no model, or could not come: what asked then draws its built stand-in.
 */
export function wantModel(kind, key) {
  if (MODELS[kind].has(key)) return null;
  const entry = LISTED[kind].get(key);
  const id = `${kind}:${key}`;
  if (!entry || failed.has(id)) return null;
  let job = coming.get(id);
  if (!job) {
    job = loader.loadAsync(where + entry.file).then((g) => {
      // the animals come with their clips; the rest are plain scenes
      MODELS[kind].set(key, kind === "animals" ? { ...entry, scene: g.scene, clips: g.animations } : { ...entry, scene: g.scene });
      coming.delete(id);
      arrivals.forEach((fn) => fn(kind, key));
    }).catch((e) => {
      console.warn(`models: ${id} did not load:`, e.message);
      failed.add(id);
      coming.delete(id);
    });
    coming.set(id, job);
  }
  for (const w of watchers) w.add(job);
  return job;
}

/** A hand prop or a piece of the set held in a hand, asked for by its type. */
export const wantHeld = (type) => wantModel(LISTED.hand.has(type) ? "hand" : "props", type);

/**
 * Runs `build` (which makes a piece, a body, a picture's subject) and says which models it asked for that
 * were not here: it drew its stand-ins for those. { result, asked: [promises] }
 */
export function watching(build) {
  const mine = new Set();
  watchers.push(mine);
  try {
    return { result: build(), asked: [...mine] };
  } finally {
    watchers.pop();
  }
}

/**
 * Makes something with the models it needs: `build` runs, and if it asked for models that were not here it
 * runs again once they have come (a few rounds at most), then `finish(built)` uses what it made, in the
 * same turn, so nothing else can change what was built meanwhile. Resolves to what `finish` gives.
 */
export async function made(build, finish = (built) => built, rounds = 4) {
  for (let i = 0; ; i++) {
    const { result, asked } = watching(build);
    if (!asked.length || i >= rounds) return finish(result);
    await Promise.allSettled(asked);
  }
}

/** Once every model asked for so far has come (or failed); a model that does not come in `wait` ms is not waited for. */
export async function modelsSettled(wait = 15000) {
  const until = Date.now() + wait;
  while (coming.size && Date.now() < until) await Promise.race([Promise.allSettled([...coming.values()]), new Promise((r) => setTimeout(r, Math.max(0, until - Date.now())))]);
}

// ------------------------------------------------------------------ the models people bring

// what the server keeps (characters with their rigs, props), and the loaded rigs and props
export const USER = { list: [], rigs: new Map(), props: new Map(), failed: new Map() };
/** One of the user's rigged characters, by its id. */
export const rigById = (id) => (id ? USER.rigs.get(id) ?? null : null);
const listeners = new Set();
/** Called (with the model's entry) whenever one of the user's models has loaded or gone. */
export const onUserModels = (fn) => (listeners.add(fn), () => listeners.delete(fn));
const tell = (entry) => listeners.forEach((fn) => fn(entry));

async function readFile3d(entry) {
  const url = `api/control/models/file/${entry.file}`;
  if (entry.ext === "fbx") {
    const { FBXLoader } = await import("three/addons/loaders/FBXLoader.js");
    return new FBXLoader().loadAsync(url);
  }
  if (entry.ext === "obj") {
    const { OBJLoader } = await import("three/addons/loaders/OBJLoader.js");
    return new OBJLoader().loadAsync(url);
  }
  return (await new GLTFLoader().loadAsync(url)).scene;
}

/** A plain model as a prop: in metres, on the ground, centred, with its size. */
async function readProp(model) {
  const THREE = await import("three");
  const scene = new THREE.Group();
  scene.add(model);
  scene.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(model, true);
  const tall = box.max.y - box.min.y;
  model.scale.multiplyScalar(tall > 5000 ? 0.001 : tall > 50 ? 0.01 : 1);
  scene.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(model, true);
  model.position.sub(new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2));
  scene.updateMatrixWorld(true);
  return { scene, size: new THREE.Box3().setFromObject(scene, true).getSize(new THREE.Vector3()).toArray() };
}

async function loadUserModel(entry) {
  try {
    const model = await readFile3d(entry);
    if (entry.kind === "character") {
      const { readRig } = await import("./rigs.js");
      USER.rigs.set(entry.id, { ...entry, ...readRig(model) });
    } else USER.props.set(entry.id, { ...entry, ...(await readProp(model)) });
    USER.failed.delete(entry.id);
  } catch (e) {
    USER.failed.set(entry.id, e.message);
    throw e;
  } finally {
    tell(entry);
  }
}

let userLoading = null;
/** The user's models, from the server (once). */
export function loadUserModels() {
  userLoading ??= fetch("api/control/models").then((r) => (r.ok ? r.json() : { models: [] })).then(async ({ models }) => {
    USER.list = models ?? [];
    await Promise.allSettled(USER.list.map(loadUserModel));
    return USER;
  }).catch(() => USER);
  return userLoading;
}

/** Loads what the server has that is not here yet (after a shared stage brought its models). */
export async function loadNewUserModels() {
  const res = await fetch("api/control/models");
  const { models = [] } = res.ok ? await res.json() : {};
  const fresh = models.filter((m) => !USER.list.some((k) => k.id === m.id));
  USER.list = models;
  await Promise.allSettled(fresh.map(loadUserModel));
}

/** Brings a model file: kept on the server, then loaded as a rigged character or a prop. */
export async function importModel(file, kind) {
  const res = await fetch(`api/control/models?name=${encodeURIComponent(file.name)}&kind=${kind}`, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: file });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error ?? "The model was not kept.");
  USER.list = out.models;
  try {
    await loadUserModel(out.model);
  } catch (e) {
    // a file the Stage cannot read is not kept
    await forgetModel(out.model.id);
    throw e;
  }
  return out.model;
}

/** Forgets one of the user's models. */
export async function forgetModel(id) {
  const res = await fetch(`api/control/models/${encodeURIComponent(id)}`, { method: "DELETE" });
  const out = await res.json().catch(() => ({}));
  USER.list = out.models ?? USER.list.filter((m) => m.id !== id);
  const entry = USER.rigs.get(id) ?? USER.props.get(id) ?? { id };
  USER.rigs.delete(id);
  USER.props.delete(id);
  tell({ ...entry, gone: true });
}
