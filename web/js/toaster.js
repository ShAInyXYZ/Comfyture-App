// Toaster's state: the drafts kept on the server (data/toasts, one file each, as Spice keeps its shots), the one open, its undo
// history, the selection and the tool, and what is toasted from it: renders of the frame, turnarounds of four views, and 3D models
// made from a turnaround on Comfy Cloud. The viewport (toaster-view.js) is told every change here (sync), so whatever edits the
// draft (the page, a key, an undo) moves the clay at once. toaster-model.js holds the rules and the words.
import { changed, toast, waitFor, jobWatchers } from "./store.js";
import { api } from "./api.js";
import { keyedSaver } from "./saving.js";
import { cleanDraft, cleanPart, starterDraft, newPart, newAssetPart, mirrorPart, duplicatePart, framePrompt, sheetPrompt, RATIOS, SHEET, TO_3D } from "./toaster-model.js";

const KIND = "toasts";
// where a draft's camera starts: the studio's own view, the floor around the object in sight
const HOME = { position: [4.6, 3.4, 6.2], target: [0, 0.8, 0] };
const OPEN = "comfyture.toaster.open";
const PREFS = "comfyture.toaster.prefs";

const read = (k) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k, v) => {
  try {
    localStorage.setItem(k, v);
  } catch {}
};
const prefs = (() => {
  try {
    return JSON.parse(read(PREFS) || "{}");
  } catch {
    return {};
  }
})();

export const toaster = {
  /** the drafts, newest first: { id, name, thumb, updatedAt } */
  list: [],
  /** the draft open: { id, name, body } (body: toaster-model.js cleanDraft) */
  draft: null,
  ready: null,
  /** the ids of the parts selected */
  selected: [],
  tool: ["select", "move", "rotate", "scale"].includes(prefs.tool) ? prefs.tool : "move",
  snap: prefs.snap !== false,
  /** the image models that can render from a picture: { models, default } */
  models: null,
  /** the key waiting for its yes: { id, until } (a run on Comfy Cloud asks first) */
  armed: null,
  /** the render shown in the Render card (an id), and how: the picture, or the clay under it with a wipe */
  shown: null,
  compare: false,
  /** the viewport, once the page has made it */
  view: null,
};
let undo = [];
let redo = [];

const update = (scope = "toaster") => {
  sync();
  changed(scope);
};
export const body = () => toaster.draft?.body ?? null;
export const partsNow = () => toaster.draft?.body.parts ?? [];
export const selectedParts = () => partsNow().filter((p) => toaster.selected.includes(p.id));

/** The viewport shown what the draft holds: its parts, the selection, the tool, the snap and the frame. */
export function sync() {
  const v = toaster.view;
  const b = body();
  if (!v || !b) return;
  v.setParts(b.parts);
  v.setSelection(toaster.selected.filter((id) => b.parts.some((p) => p.id === id && !p.hidden)));
  v.setTool(toaster.tool);
  v.setSnap(toaster.snap);
  v.setRatio(b.ratio);
}

const call = async (path, init) => {
  const res = await fetch(path, init);
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error ?? `Request failed (${res.status})`);
  return out;
};
const send = (path, method, payload) => call(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload ?? {}) });

// ---------------------------------------------------------------- the drafts kept on the server

/** Reads the drafts (once) and opens the one that was open, else the newest; a first visit starts one, so the page is never empty. */
export function loadDrafts() {
  return (toaster.ready ??= (async () => {
    try {
      toaster.list = (await call(`api/${KIND}`))[KIND] ?? [];
      const id = toaster.list.find((d) => d.id === read(OPEN))?.id ?? toaster.list[0]?.id;
      if (id) await openDraft(id);
      else await newDraft();
    } catch (e) {
      console.warn("toaster:", e.message);
    }
    update();
  })());
}

const nextName = () => {
  const taken = new Set(toaster.list.map((d) => d.name.toLowerCase()));
  for (let i = 1; ; i++) if (!taken.has(`object ${i}`)) return `Object ${i}`;
};

function opened(project) {
  toaster.draft = { id: project.id, name: project.name, body: cleanDraft(project.body) };
  toaster.selected = [];
  toaster.shown = toaster.draft.body.renders.find((r) => r.status === "done")?.id ?? null;
  toaster.compare = false;
  undo = [];
  redo = [];
  write(OPEN, project.id);
  // a picture that was rendering when the page was left is not followed again (it lands in the Library); a 3D model is
  const b = toaster.draft.body;
  for (const r of [...b.renders, ...b.sheets]) if (r.status === "running") Object.assign(r, { status: "failed", error: "The page was left while it rendered: look for it in the Library." });
  for (const m of b.models) if (m.status === "running" && m.job) void follow3d(toaster.draft, m);
  if (toaster.view) toaster.view.setCameraState(b.camera ?? HOME);
}

export async function openDraft(id) {
  await flushDrafts();
  const { project } = await call(`api/${KIND}/${id}`);
  opened(project);
  update();
}

export async function newDraft(name) {
  await flushDrafts();
  const { project } = await send(`api/${KIND}`, "POST", { name: name || nextName(), body: starterDraft() });
  toaster.list = [{ id: project.id, name: project.name, updatedAt: project.updatedAt }, ...toaster.list];
  opened(project);
  update();
  return toaster.draft;
}

const keep = async (id, draft) => {
  // the card's picture: the clay as the camera frames it now, small (only for the draft on screen)
  const thumb = toaster.view && toaster.draft === draft ? toaster.view.frameStill({ long: 240, type: "image/jpeg", quality: 0.82 }) : undefined;
  await send(`api/${KIND}/${id}`, "PUT", { name: draft.name, body: draft.body, ...(thumb ? { thumb } : {}) })
    .then(() => {
      const row = toaster.list.find((x) => x.id === id);
      if (row) Object.assign(row, { name: draft.name, ...(thumb ? { thumb } : {}), updatedAt: new Date().toISOString() });
    })
    .catch((e) => toast(e.message, { tone: "crit" }));
};
const saver = keyedSaver(600, keep);
export const flushDrafts = () => saver.flush();
export function save(draft = toaster.draft) {
  if (draft) saver.save(draft.id, draft);
}

export async function removeDraft(id) {
  saver.drop(id);
  const out = await call(`api/${KIND}/${id}`, { method: "DELETE" });
  toaster.list = out[KIND] ?? [];
  if (toaster.draft?.id === id) {
    toaster.draft = null;
    if (toaster.list[0]) await openDraft(toaster.list[0].id);
    else await newDraft();
  }
  update();
}

export function renameDraft(name) {
  const d = toaster.draft;
  const n = String(name ?? "").trim().slice(0, 60);
  if (!d || !n || n === d.name) return;
  d.name = n;
  save();
  update();
}

// ---------------------------------------------------------------- the parts, with undo

const snapshot = () => JSON.stringify({ parts: partsNow(), selected: toaster.selected });
let lastKey = null;
let lastAt = 0;
/**
 * Changes the parts: fn(parts) edits the list in place (or answers a new one). Undo keeps the parts as they were; a run of changes
 * with the same `coalesce` key (a slider dragged, a number typed again) within a second is one step.
 */
export function editParts(fn, { coalesce } = {}) {
  const b = body();
  if (!b) return;
  const now = Date.now();
  if (!coalesce || coalesce !== lastKey || now - lastAt > 1000) {
    undo.push(snapshot());
    if (undo.length > 120) undo.shift();
    redo = [];
  }
  lastKey = coalesce ?? null;
  lastAt = now;
  const out = fn(b.parts);
  if (Array.isArray(out)) b.parts = out;
  b.parts = b.parts.map(cleanPart);
  toaster.selected = toaster.selected.filter((id) => b.parts.some((p) => p.id === id));
  save();
  update();
}

function restore(from, to) {
  const b = body();
  if (!b || !from.length) return;
  to.push(snapshot());
  const s = JSON.parse(from.pop());
  b.parts = s.parts.map(cleanPart);
  toaster.selected = s.selected.filter((id) => b.parts.some((p) => p.id === id));
  lastKey = null;
  save();
  update();
}
export const undoParts = () => restore(undo, redo);
export const redoParts = () => restore(redo, undo);
export const canUndo = () => undo.length > 0;
export const canRedo = () => redo.length > 0;

export function select(ids) {
  toaster.selected = [...new Set(ids)].filter((id) => partsNow().some((p) => p.id === id));
  update();
}
/** A click in the viewport or on a row: the part alone, or added to (taken from) the selection with Shift. */
export function pick(id, { shift = false } = {}) {
  if (!id) return shift ? null : select([]);
  if (shift) return select(toaster.selected.includes(id) ? toaster.selected.filter((x) => x !== id) : [...toaster.selected, id]);
  select([id]);
}
export const selectAll = () => select(partsNow().filter((p) => !p.hidden).map((p) => p.id));

export function setTool(tool) {
  toaster.tool = tool;
  write(PREFS, JSON.stringify({ tool, snap: toaster.snap }));
  update();
}
export function toggleSnap() {
  toaster.snap = !toaster.snap;
  write(PREFS, JSON.stringify({ tool: toaster.tool, snap: toaster.snap }));
  update();
}

/** A new part: on top of the selection when there is one (blocking out goes upward), else on the floor in the middle. */
export function addPart(shape) {
  place(newPart(shape, partsNow()));
}

/** A piece of the Stage's library as a new part ({ type, name, size }), placed the way a shape is. */
export function addPiece(piece) {
  if (!piece?.type) return;
  place(newAssetPart(piece, partsNow()));
}

function place(part) {
  const box = toaster.selected.length ? toaster.view?.bounds(toaster.selected) : null;
  if (box) part.pos = [(box.min[0] + box.max[0]) / 2, box.max[1] + part.size[1] / 2, (box.min[2] + box.max[2]) / 2].map((v) => Math.round(v * 1000) / 1000);
  editParts((list) => void list.push(part));
  select([part.id]);
  if (toaster.tool === "select") setTool("move");
}

/** Sets values of the selected parts (or of `ids`): { name, color, made, size, pos, rot, round, sides, hidden }. */
export function setProps(patch, { ids = toaster.selected, coalesce } = {}) {
  if (!ids.length) return;
  editParts((list) => {
    for (const p of list) if (ids.includes(p.id)) Object.assign(p, typeof patch === "function" ? patch(p) : patch);
  }, { coalesce });
}

/** What the viewport's gizmo did, at the end of a drag: the parts' new places, turns and sizes. */
export function applyTransforms(changes) {
  if (!changes?.length) return;
  editParts((list) => {
    for (const c of changes) {
      const p = list.find((x) => x.id === c.id);
      if (p) Object.assign(p, { pos: c.pos ?? p.pos, rot: c.rot ?? p.rot, size: c.size ?? p.size });
    }
  });
}

export function removeSelected() {
  const ids = toaster.selected;
  if (!ids.length) return;
  editParts((list) => list.filter((p) => !ids.includes(p.id)));
  toaster.selected = [];
  update();
}
export const removePart = (id) => editParts((list) => list.filter((p) => p.id !== id));

export function duplicateSelected() {
  const sel = selectedParts();
  if (!sel.length) return;
  const made = [];
  editParts((list) => {
    for (const p of sel) {
      const copy = duplicatePart(p, [...list, ...made]);
      made.push(copy);
    }
    list.push(...made);
  });
  select(made.map((p) => p.id));
}

/** The selection mirrored to the other side of the middle (x = 0): a pair of feet, arms, wheels. */
export function mirrorSelected() {
  const sel = selectedParts();
  if (!sel.length) return;
  const made = [];
  editParts((list) => {
    for (const p of sel) made.push(mirrorPart(p, [...list, ...made]));
    list.push(...made);
  });
  select(made.map((p) => p.id));
}

/** The selection set down on the floor (its lowest point at y = 0), all of it together. */
export function dropSelected() {
  const ids = toaster.selected.length ? toaster.selected : partsNow().map((p) => p.id);
  const low = toaster.view?.minY(ids);
  if (low === null || low === undefined || Math.abs(low) < 1e-4) return;
  setProps((p) => ({ pos: [p.pos[0], Math.round((p.pos[1] - low) * 1000) / 1000, p.pos[2]] }), { ids });
}

export const toggleHidden = (id) => setProps((p) => ({ hidden: !p.hidden }), { ids: [id] });

// ---------------------------------------------------------------- the draft's words and frame

/** The words typed (what it is, the scene): kept quietly, the page not drawn again under the cursor. */
export function setWords(key, value) {
  const b = body();
  if (!b || !["what", "scene"].includes(key)) return;
  b[key] = String(value ?? "").slice(0, 600);
  save();
}
export function setRatio(ratio) {
  const b = body();
  if (!b || !(ratio in RATIOS)) return;
  b.ratio = ratio;
  save();
  update();
}
export function setModel(id) {
  const b = body();
  if (!b) return;
  b.model = id;
  save();
  update();
}
/** The camera, kept with the draft when it stops moving. */
export function keepCamera() {
  const b = body();
  if (!b || !toaster.view) return;
  const r = (a) => a.map((v) => Math.round(v * 1000) / 1000);
  const { position, target } = toaster.view.cameraState();
  const cam = { position: r(position), target: r(target) };
  // (a draft opened puts its own camera back: that is not a change to keep)
  if (JSON.stringify(cam) === JSON.stringify(b.camera)) return;
  b.camera = cam;
  save();
}

// ---------------------------------------------------------------- the image models

/** The models that can render from a picture (an edit), read once. */
export async function loadModels() {
  if (toaster.models) return toaster.models;
  try {
    const all = await api.imageModels();
    toaster.models = { default: all.default, models: (all.models ?? []).filter((m) => m.templates?.some((t) => t.id === "edit")) };
  } catch (e) {
    toaster.models = { default: null, models: [] };
    console.warn("toaster: no image models:", e.message);
  }
  changed("toaster");
  return toaster.models;
}
export function modelNow() {
  const list = toaster.models?.models ?? [];
  const want = body()?.model;
  return list.find((m) => m.id === want) ?? list.find((m) => m.id === toaster.models?.default) ?? list[0] ?? null;
}

// ---------------------------------------------------------------- toasting: the frame, the turnaround

const media = (p) => (p ? { url: p.url, file: p.file, width: p.width, height: p.height } : null);
async function keepPicture(dataUrl, name) {
  const blob = await (await fetch(dataUrl)).blob();
  return media(await api.upload(blob, name));
}
const runId = () => `r-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Follows a picture's job to its end (its progress drawn on the run); answers the job done, or throws. */
async function picture(run, request) {
  const [job] = await api.image(request);
  if (!job?.id) throw new Error("The picture was not started.");
  run.job = job.id;
  // (a job may come back already over)
  if (job.status === "done") return job;
  if (job.status === "failed") throw new Error(job.error ?? "That didn't work.");
  jobWatchers.set(job.id, (j) => {
    run.progress = j.progress ?? run.progress;
    changed("toaster-runs");
  });
  try {
    return await waitFor("job", job.id);
  } finally {
    jobWatchers.delete(job.id);
  }
}

/** The request every render makes: the model's edit, its first size, the clay kept a little (the layout stays the clay's). */
function request(model, prompt, ref, aspect, name) {
  return { model: model.id, template: "edit", prompt, aspect, refs: [{ file: ref.file, name: ref.name }], count: 1, megapixels: model.megapixels?.[0] ?? 1, keep: 0.97, seed: Math.floor(Math.random() * 2 ** 32), name };
}

/** Whether there is anything to toast: a visible part. */
export const hasClay = () => partsNow().some((p) => !p.hidden);

/** The frame as the camera sees it, rendered: the clay is the layout, the words what it becomes. */
export async function renderFrame() {
  const draft = toaster.draft;
  const b = body();
  const v = toaster.view;
  if (!draft || !v) return;
  if (!hasClay()) return toast("Block something out first: add a shape.", { tone: "warn" });
  const model = modelNow();
  if (!model) return toast("No image model can render from the clay: connect Comfy Cloud or a partner key.", { tone: "crit" });
  const run = { id: runId(), status: "running", progress: 0, camera: v.cameraState(), ratio: b.ratio, model: model.id, at: new Date().toISOString() };
  b.renders.unshift(run);
  toaster.shown = run.id;
  toaster.compare = false;
  b.camera = run.camera;
  update("toaster-runs");
  try {
    run.frame = await keepPicture(v.frameStill({ long: 1536 }), `${draft.name} clay`);
    run.prompt = framePrompt(b);
    const done = await picture(run, request(model, run.prompt, { ...run.frame, name: "frame" }, b.ratio, draft.name));
    run.photo = media(done.photo);
    run.status = "done";
  } catch (e) {
    Object.assign(run, { status: "failed", error: e.message });
    toast(e.message, { tone: "crit" });
  } finally {
    save(draft);
    update("toaster-runs");
  }
}

/** A picture stretched (or squeezed) to an exact size, as a JPEG data URL: the rendered sheet back to the template's own size. */
async function resized(url, width, height) {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;
  await img.decode();
  const c = document.createElement("canvas");
  Object.assign(c, { width, height });
  const ctx = c.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, width, height);
  return c.toDataURL("image/jpeg", 0.93);
}

/**
 * The turnaround: the four clay views on one sheet (front, left, back, right, where Pixal3D's template crops them), rendered in one
 * picture so the four agree, then brought back to the template's size and kept: the sheet a 3D model is made from.
 */
export async function renderSheet() {
  const draft = toaster.draft;
  const b = body();
  const v = toaster.view;
  if (!draft || !v) return;
  if (!hasClay()) return toast("Block something out first: add a shape.", { tone: "warn" });
  const model = modelNow();
  if (!model) return toast("No image model can render from the clay: connect Comfy Cloud or a partner key.", { tone: "crit" });
  const run = { id: runId(), status: "running", progress: 0, ratio: SHEET.aspect, model: model.id, at: new Date().toISOString() };
  b.sheets.unshift(run);
  update("toaster-runs");
  try {
    run.frame = await keepPicture(v.sheetStill({ scale: 1 / 3 }).url, `${draft.name} turnaround clay`);
    run.prompt = sheetPrompt(b);
    const done = await picture(run, request(model, run.prompt, { ...run.frame, name: "sheet" }, SHEET.aspect, `${draft.name} turnaround`));
    run.photo = await keepPicture(await resized(done.photo.url, SHEET.width, SHEET.height), `${draft.name} turnaround`);
    run.status = "done";
  } catch (e) {
    Object.assign(run, { status: "failed", error: e.message });
    toast(e.message, { tone: "crit" });
  } finally {
    save(draft);
    update("toaster-runs");
  }
}

/** A render, a turnaround or a 3D model forgotten (its files stay in the Library). */
export function forget(kind, id) {
  const b = body();
  if (!b || !["renders", "sheets", "models"].includes(kind)) return;
  b[kind] = b[kind].filter((r) => r.id !== id);
  if (toaster.shown === id) toaster.shown = b.renders.find((r) => r.status === "done")?.id ?? null;
  save();
  update("toaster-runs");
}

/** A render shown, and the viewport put back where it was made from. */
export function showRender(id) {
  const r = body()?.renders.find((x) => x.id === id);
  if (!r) return;
  toaster.shown = id;
  if (r.camera && toaster.view) toaster.view.setCameraState(r.camera);
  if (r.ratio && r.ratio in RATIOS && body().ratio !== r.ratio) setRatio(r.ratio);
  changed("toaster-runs");
}
export function setCompare(on) {
  toaster.compare = !!on;
  changed("toaster-runs");
}

// ---------------------------------------------------------------- the 3D model (Comfy Cloud)

const TEMPLATES = "api/utensils/templates";
let price = null;
/** What a 3D model costs, as Cloud says (free to ask): { credits, note }, read once. */
export async function price3d() {
  if (price) return price;
  try {
    price = await send(`${TEMPLATES}/${TO_3D}/estimate`, "POST");
  } catch {
    price = { credits: null, note: "" };
  }
  changed("toaster-runs");
  return price;
}
export const priceNow = () => price;

/**
 * A textured 3D model made from a turnaround, by Pixal3D's multi-view template on Comfy Cloud. The person has said yes to the
 * price (the page asks first). The job is kept with the draft, so it is followed again if the page is left and comes back.
 */
export async function make3d(sheetId) {
  const draft = toaster.draft;
  const b = body();
  const sheet = b?.sheets.find((s) => s.id === sheetId && s.status === "done" && s.photo?.file);
  if (!sheet) return toast("Toast a turnaround first: the 3D model is made from it.", { tone: "warn" });
  const m = { id: runId(), status: "running", progress: 0.02, sheet: sheet.id, at: new Date().toISOString() };
  b.models.unshift(m);
  update("toaster-runs");
  try {
    // the picture goes to the template's first picture slot (its schema is read once on the server, free)
    const { schema } = await call(`${TEMPLATES}/${TO_3D}`);
    const slot = schema?.slots?.find((s) => s.kind === "image")?.id ?? "image";
    const started = await send(`${TEMPLATES}/${TO_3D}/run`, "POST", { inputs: { [slot]: sheet.photo.file }, confirm: true });
    m.job = started.id;
    save(draft);
    await follow3d(draft, m);
  } catch (e) {
    Object.assign(m, { status: "failed", error: e.message });
    toast(e.message, { tone: "crit" });
    save(draft);
    update("toaster-runs");
  }
}

/** Follows a 3D job on the server (a poll: Cloud may take minutes) to its end, and keeps what it made. */
async function follow3d(draft, m) {
  for (let i = 0; i < 2400 && m.status === "running"; i++) {
    await new Promise((ok) => setTimeout(ok, i === 0 ? 700 : 2000));
    let job;
    try {
      job = await call(`${TEMPLATES}/job/${m.job}`);
    } catch (e) {
      // the server no longer knows the job (it was restarted, or the job is over an hour old)
      if (/gone|404/i.test(e.message)) Object.assign(m, { status: "failed", error: "The server lost this job: look for the model in Utensils' results." });
      continue;
    }
    m.progress = job.progress ?? m.progress;
    if (job.status === "done") {
      const out = job.outputs ?? [];
      const model = out.find((o) => o.kind === "model");
      if (!model) Object.assign(m, { status: "failed", error: "The template finished without a 3D file." });
      else Object.assign(m, { status: "done", url: model.url, file: model.file, views: out.filter((o) => o.kind === "image").slice(0, 4).map(media) });
    } else if (job.status !== "running") Object.assign(m, { status: "failed", error: job.error ?? "That didn't work." });
    changed("toaster-runs");
  }
  save(draft);
  update("toaster-runs");
}

/** A 3D model put in the Stage's asset library, as a prop to stage in Kitchen. */
export async function putOnStage(m) {
  if (!m?.url) return;
  const blob = await (await fetch(m.url)).blob();
  const ext = (m.file ?? m.url).split(".").pop().toLowerCase();
  const name = `${toaster.draft?.name ?? "Toaster"}.${["glb", "gltf", "obj", "fbx"].includes(ext) ? ext : "glb"}`;
  const { importModel } = await import("./control/models.js");
  const entry = await importModel(new File([blob], name), "prop");
  toast(`${entry.name} is in the Stage's assets.`, { action: { label: "Open the Stage", run: () => (location.hash = "#/stage") } });
}

// ---------------------------------------------------------------- the yes to a price

export const isArmed = (id) => toaster.armed?.id === id && toaster.armed.until > Date.now();
export function arm(id) {
  toaster.armed = { id, until: Date.now() + 8000 };
  changed("toaster-runs");
  setTimeout(() => toaster.armed?.id === id && toaster.armed.until <= Date.now() && ((toaster.armed = null), changed("toaster-runs")), 8100);
}
export function disarm() {
  toaster.armed = null;
  changed("toaster-runs");
}
