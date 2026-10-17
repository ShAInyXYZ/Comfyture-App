// The modelled library: the bodies, set pieces and hand props made in Blender, listed in
// models/manifest.json and loaded once. Until they arrive, or if they cannot, the Stage draws
// its own procedural ones (body.js, assets.js), so nothing waits on them.

import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export const MODELS = { ready: false, bodies: new Map(), props: new Map(), modules: new Map(), hand: new Map() };

let loading = null;

/** Loads the manifest and every model in it (once); resolves to MODELS either way. */
export function loadModels(base = "models/") {
  loading ??= (async () => {
    const res = await fetch(`${base}manifest.json`);
    if (!res.ok) throw new Error(`no model manifest (${res.status})`);
    const manifest = await res.json();
    const loader = new GLTFLoader();
    const scene = (file) => loader.loadAsync(base + file).then((g) => g.scene);
    const jobs = [];
    for (const b of manifest.bodies ?? []) jobs.push(scene(b.file).then((s) => MODELS.bodies.set(b.id, { ...b, scene: s })));
    for (const a of manifest.assets ?? []) {
      jobs.push(scene(a.file).then((s) => MODELS.props.set(a.type, { ...a, scene: s })));
      for (const m of a.modules ?? []) jobs.push(scene(m.file).then((s) => MODELS.modules.set(m.type, { ...m, scene: s })));
    }
    for (const h of manifest.handProps ?? []) jobs.push(scene(h.file).then((s) => MODELS.hand.set(h.type, { ...h, scene: s })));
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
