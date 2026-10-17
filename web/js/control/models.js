// The modelled library: the bodies, set pieces and hand props made in Blender, listed in
// models/manifest.json and loaded once. Until they arrive, or if they cannot, the Stage draws
// its own procedural ones (body.js, assets.js), so nothing waits on them.

import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export const MODELS = { ready: false, manifest: null, bodies: new Map(), props: new Map(), modules: new Map(), hand: new Map(), rigs: new Map() };

/** What a hand can hold: the hand props, and every piece of the set with a grip. { type: { name, scene, grips } } */
export function holdables(assetByType) {
  const out = new Map();
  for (const [type, h] of MODELS.hand) out.set(type, { type, name: h.name, scene: h.scene, grips: h.grips, poses: h.poses ?? [], themes: h.themes ?? [], tags: h.tags ?? [] });
  for (const [type, p] of MODELS.props) {
    const def = assetByType(type);
    if (def?.holdable?.grips && !out.has(type)) out.set(type, { type, name: def.name, scene: p.scene, grips: def.holdable.grips, poses: def.holdable.poses ?? [], themes: def.themes ?? [], tags: def.tags ?? [], piece: true });
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

let loading = null;

/** Loads the manifest and every model in it (once); resolves to MODELS either way. */
export function loadModels(base = "models/") {
  loading ??= (async () => {
    const res = await fetch(`${base}manifest.json`);
    if (!res.ok) throw new Error(`no model manifest (${res.status})`);
    const manifest = await res.json();
    MODELS.manifest = manifest;
    const loader = new GLTFLoader();
    const scene = (file) => loader.loadAsync(base + file).then((g) => g.scene);
    const jobs = [];
    for (const b of manifest.bodies ?? []) jobs.push(scene(b.file).then((s) => MODELS.bodies.set(b.id, { ...b, scene: s })));
    for (const a of manifest.assets ?? []) {
      jobs.push(scene(a.file).then((s) => MODELS.props.set(a.type, { ...a, scene: s })));
      for (const m of a.modules ?? []) jobs.push(scene(m.file).then((s) => MODELS.modules.set(m.type, { ...m, scene: s })));
    }
    for (const h of manifest.handProps ?? []) jobs.push(scene(h.file).then((s) => MODELS.hand.set(h.type, { ...h, scene: s })));
    // the library's own rigged characters (the baby animals), read onto the Stage's skeleton like the user's
    for (const c of manifest.characters ?? []) {
      jobs.push(Promise.all([scene(c.file), import("./rigs.js")]).then(([s, { readRig }]) => MODELS.rigs.set(c.id, { ...c, ...readRig(s), builtIn: true })));
    }
    const results = await Promise.allSettled(jobs);
    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length) console.warn(`models: ${failed.length} of ${results.length} did not load`, failed[0].reason);
    MODELS.ready = true;
    return MODELS;
  })().catch((e) => {
    console.warn("models:", e.message);
    MODELS.ready = true;
    return MODELS;
  });
  return loading;
}

// ------------------------------------------------------------------ the models people bring

// what the server keeps (characters with their rigs, props), and the loaded rigs and props
export const USER = { list: [], rigs: new Map(), props: new Map(), failed: new Map() };
/** A rigged character by its id: one of the user's, or one of the library's. */
export const rigById = (id) => (id ? USER.rigs.get(id) ?? MODELS.rigs.get(id) ?? null : null);
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
