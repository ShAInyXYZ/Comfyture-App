// Toaster's state: the drafts kept on the server (data/toasts, one file each, as Spice keeps its shots), the one open, its undo
// history, the selection and the tool, and what is toasted from it: renders of the frame, turnarounds of four views, and 3D models
// made from a turnaround on Comfy Cloud. The viewport (toaster-view.js) is told every change here (sync), so whatever edits the
// draft (the page, a key, an undo) moves the clay at once. toaster-model.js holds the rules and the words.
import { changed, toast, waitFor, jobWatchers, writer } from "./store.js";
import { api } from "./api.js";
import { keyedSaver } from "./saving.js";
import { cleanDraft, cleanPart, starterDraft, newPart, newAssetPart, newCharacterPart, freeSpot, colourByKind, mirrorPart, duplicatePart, framePrompt, factsOf, factsKey, promptStale, sheetPrompt, RATIOS, SHEET, TO_3D, MAPS, plainFrame, keepOf, described, tagsOf, castOf, referencesFor, pickMaps, expandPrompt, newSceneRef, addRef, mentionsIn, colorName } from "./toaster-model.js";

const KIND = "toasts";
// where a draft's camera starts: the studio's own view, the floor around the object in sight
const HOME = { position: [4.6, 3.4, 6.2], target: [0, 0.8, 0], focal: 50 };
const OPEN = "comfyture.toaster.open";
const PREFS = "comfyture.toaster.prefs";
const MODE = "comfyture.toaster.mode";

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
  /** why the drafts could not be read, when they could not */
  error: null,
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
  /** what the page shows: the "scene" (the viewport in the middle) or the "render" studio (the viewport small, on the right) */
  mode: read(MODE) === "render" ? "render" : "scene",
  /** the library's piece of a type (the page sets it once the library is read): what a part is called in words */
  pieceOf: () => null,
  /** whether the writer is writing the prompt */
  writing: false,
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
      toaster.error = null;
    } catch (e) {
      // (a server started before Toaster existed does not know its drafts: the page says so, and a visit later tries again)
      console.warn("toaster:", e.message);
      toaster.error = e.message;
      toaster.ready = null;
    }
    update();
  })());
}

const nextName = () => {
  const taken = new Set(toaster.list.map((d) => d.name.toLowerCase()));
  for (let i = 1; ; i++) if (!taken.has(`project ${i}`)) return `Project ${i}`;
};

// the lamp of the project bar: whether the draft open is kept ("ok", and when), being kept ("busy") or could not be ("crit", why)
toaster.saving = { tone: "ok", at: Date.now(), error: null };
const lamp = (tone, extra = {}) => {
  const was = toaster.saving.tone;
  toaster.saving = { tone, at: toaster.saving.at, error: null, ...extra };
  if (tone !== was || tone !== "busy") changed("toaster-saved");
};

function opened(project) {
  toaster.draft = { id: project.id, name: project.name, body: cleanDraft(project.body) };
  toaster.selected = [];
  toaster.shown = toaster.draft.body.renders.find((r) => r.status === "done")?.id ?? null;
  toaster.compare = false;
  undo = [];
  redo = [];
  write(OPEN, project.id);
  lamp("ok", { at: project.updatedAt ? new Date(project.updatedAt).getTime() : Date.now() });
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

/** A new project, open at once: empty (the starter box) or from a body (a copy, an import). */
export async function newDraft(name, body) {
  await flushDrafts();
  const { project } = await send(`api/${KIND}`, "POST", { name: name || nextName(), body: body ?? starterDraft() });
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
      if (toaster.draft?.id === id) lamp("ok", { at: Date.now() });
      else changed("toaster-saved");
    })
    .catch((e) => {
      toast(e.message, { tone: "crit" });
      if (toaster.draft?.id === id) lamp("crit", { error: e.message });
    });
};
const saver = keyedSaver(600, keep);
export const flushDrafts = () => saver.flush();
export function save(draft = toaster.draft) {
  if (!draft) return;
  saver.save(draft.id, draft);
  if (draft === toaster.draft) lamp("busy");
}

/** Keeps the draft open now (Ctrl+S): what waits for its moment is sent at once, else it is sent as it is. Answers whether it is kept. */
export async function saveNow() {
  const d = toaster.draft;
  if (!d) return false;
  lamp("busy");
  if (saver.has(d.id)) await saver.flush(d.id);
  else await keep(d.id, d);
  return toaster.saving.tone === "ok";
}

/** A copy of the draft open, with its own name, open in a project of its own (its renders and models are kept: their pictures live in the Library). */
export async function duplicateDraft() {
  const d = toaster.draft;
  if (!d) return null;
  await flushDrafts();
  return newDraft(`${d.name} copy`, structuredClone(d.body));
}

/** The draft open as a file to share: { kind, version, name, body } in JSON, downloaded as "<name>.toaster.json". */
export async function exportDraft() {
  const d = toaster.draft;
  if (!d) return;
  await flushDrafts();
  const file = JSON.stringify({ kind: "comfyture-toaster", version: 1, name: d.name, body: d.body }, null, 2);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([file], { type: "application/json" }));
  a.download = `${d.name.replace(/[\\/:*?"<>|]+/g, "-").trim() || "project"}.toaster.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/** A project someone exported, from its file: opened as a project of its own. A file that is not one throws. */
export async function importDraft(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error("That file is not a Toaster project.");
  }
  if (data?.kind !== "comfyture-toaster" || typeof data.body !== "object" || !data.body) throw new Error("That file is not a Toaster project.");
  return newDraft(String(data.name ?? "").trim().slice(0, 60) || undefined, cleanDraft(data.body));
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
  if (toaster.poseMode && !(toaster.selected.length === 1 && toaster.selected[0] === toaster.poseMode)) {
    toaster.poseMode = null;
    toaster.view?.setPoseMode?.(null);
  }
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

/**
 * A piece of the Stage's library as a new part ({ type, name, category, tags, size }), in its colour ID (its kind's family, its type's
 * shade), set down on the floor beside what is there instead of on top of it. `pieceOf(type)` answers the library's piece of a type.
 */
export function addPiece(piece, pieceOf = () => null) {
  if (!piece?.type) return;
  setDown(newAssetPart(piece, partsNow(), { pieceOf }));
}

/** Every piece and character coloured again by the colour ID, in the draft's order (the shapes keep their colours); one step for Undo. */
export function colourAllByKind(pieceOf = () => null) {
  editParts((list) => colourByKind(list, pieceOf));
}

/** One of the Stage's characters as a new part ({ body, rig?, name, size }), standing, set down on the floor beside the others. */
export function addCharacter(who) {
  if (!who?.body && !who?.rig) return;
  setDown(newCharacterPart({ ...who, body: who.body ?? "man" }, partsNow()));
}

/** A new part set down on the floor beside what is there, edge to edge, never on it (freeSpot); then selected. */
function setDown(part) {
  const parts = partsNow();
  // what stands on the floor already, as footprints (the viewport measures them as they are turned)
  const footprint = (p) => {
    const b = toaster.view?.bounds([p.id]);
    return b ? { min: [b.min[0], b.min[2]], max: [b.max[0], b.max[2]] } : { min: [p.pos[0] - p.size[0] / 2, p.pos[2] - p.size[2] / 2], max: [p.pos[0] + p.size[0] / 2, p.pos[2] + p.size[2] / 2] };
  };
  const taken = parts.filter((p) => !p.hidden).map(footprint);
  // as near the middle of everything as can be, so the pieces gather in rows instead of trailing off in a line
  const mid = (k) => (Math.min(...taken.map((t) => t.min[k])) + Math.max(...taken.map((t) => t.max[k]))) / 2;
  const near = taken.length ? [mid(0), mid(1)] : [0, 0];
  const [x, z] = freeSpot([part.size[0], part.size[2]], taken, { near });
  part.pos = [x, Math.round((part.size[1] / 2) * 1000) / 1000, z];
  editParts((list) => void list.push(part));
  select([part.id]);
  if (toaster.tool === "select") setTool("move");
}

/**
 * A character posed again: `patch` is { pose, params, joints } (a new preset lets go of the joints edited by hand). `measure(part)` answers
 * the figure's own box in a pose (toaster-assets.js characterSize); the part keeps how it was stretched, and its feet stay where they were.
 */
export function reposeCharacter(id, patch, measure, { coalesce } = {}) {
  setProps((p) => repose(p, patch, measure), { ids: [id], coalesce });
}
/** The fields of a character posed again (see reposeCharacter): for the page and for Crumpet's builds. */
export function repose(p, patch, measure) {
  const next = { ...p, ...patch };
  if (patch.pose && patch.pose !== p.pose && !("joints" in patch)) next.joints = undefined;
  if (patch.params) {
    const params = { ...(p.params ?? {}), ...patch.params };
    for (const k of Object.keys(params)) if (!params[k]) delete params[k];
    next.params = Object.keys(params).length ? params : undefined;
  }
  const r = (v) => Math.round(v * 1000) / 1000;
  const was = measure(p);
  const now = measure(next);
  const size = now.map((v, i) => Math.max(0.01, r(v * (p.size[i] / Math.max(0.01, was[i])))));
  const bottom = p.pos[1] - p.size[1] / 2;
  return { pose: next.pose, params: next.params, joints: next.joints, size, pos: [p.pos[0], r(bottom + size[1] / 2), p.pos[2]] };
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

/**
 * What a piece or a character is, written in its What it is when that is empty (a data fix: kept with the draft, not a step of Undo). Pieces
 * wait for the library (their names); returns whether anything was written.
 */
export function describeParts(pieceOf = toaster.pieceOf) {
  const b = body();
  if (!b) return false;
  const next = described(b.parts, pieceOf);
  if (next.every((p, i) => p === b.parts[i])) return false;
  b.parts = next.map(cleanPart);
  save();
  update();
  return true;
}

/** A picture of the Library put on a part's sheet (six at most, none twice); Undo takes it back. */
export function addPartRef(id, photo) {
  editParts((list) => {
    const p = list.find((x) => x.id === id);
    if (p) p.refs = addRef(p.refs, photo);
  });
}
export function removePartRef(id, file) {
  editParts((list) => {
    const p = list.find((x) => x.id === id);
    if (p?.refs) p.refs = p.refs.filter((r) => r.file !== file);
  });
}

/** The page shown: the "scene" or the "render" studio (kept for the next visit). */
export function setMode(mode) {
  const m = mode === "render" ? "render" : "scene";
  if (toaster.mode === m) return;
  toaster.mode = m;
  write(MODE, m);
  changed("toaster");
}

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
  const cam = cameraNow();
  // (a draft opened puts its own camera back: that is not a change to keep)
  if (JSON.stringify(cam) === JSON.stringify(b.camera)) return;
  b.camera = cam;
  save();
}

/** The camera as it is now: where it stands, what it looks at, its lens. */
function cameraNow() {
  const r = (a) => a.map((v) => Math.round(v * 1000) / 1000);
  const { position, target, focal } = toaster.view.cameraState();
  return { position: r(position), target: r(target), focal };
}

/** The lens, in mm: the frame stays, what it takes in changes. */
export function setFocal(mm) {
  if (!toaster.view) return;
  toaster.view.setFocal(mm);
  keepCamera();
  changed("toaster");
}

// ---------------------------------------------------------------- the cameras kept in slots

/** The camera as it is (its place, its aim, its lens and the frame) kept in a slot, with a small picture of what it shows. */
export function saveCamera(name) {
  const b = body();
  if (!b || !toaster.view) return null;
  const taken = new Set(b.cameras.map((k) => k.name.toLowerCase()));
  let n = String(name ?? "").trim().slice(0, 30);
  if (!n) for (let i = 1; !n || taken.has(n.toLowerCase()); i++) n = `Camera ${i}`;
  const old = b.cameras.find((k) => k.name.toLowerCase() === n.toLowerCase());
  const slot = { id: old?.id ?? runId(), name: old?.name ?? n, ...cameraNow(), ratio: b.ratio, thumb: toaster.view.frameStill({ long: 220, type: "image/jpeg", quality: 0.8 }) };
  b.cameras = old ? b.cameras.map((k) => (k === old ? slot : k)) : [...b.cameras, slot].slice(-12);
  save();
  changed("toaster");
  return slot;
}

/** Back to a kept camera, to the pixel: its frame first (the frame sets what the lens takes in), then its place, aim and lens. */
export function recallCamera(id) {
  const k = body()?.cameras.find((x) => x.id === id || x.name.toLowerCase() === String(id).toLowerCase());
  if (!k || !toaster.view) return false;
  if (body().ratio !== k.ratio) setRatio(k.ratio);
  toaster.view.setCameraState({ position: k.position, target: k.target, focal: k.focal });
  keepCamera();
  changed("toaster");
  return true;
}

/** Whether the camera is on a kept one now (to light its slot). */
export function onCamera(id) {
  const k = body()?.cameras.find((x) => x.id === id);
  if (!k || !toaster.view) return false;
  const c = cameraNow();
  const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-3);
  return near(c.position, k.position) && near(c.target, k.target) && c.focal === k.focal && body().ratio === k.ratio;
}

export function removeCamera(id) {
  const b = body();
  if (!b) return;
  b.cameras = b.cameras.filter((k) => k.id !== id);
  save();
  changed("toaster");
}

export function renameCamera(id, name) {
  const k = body()?.cameras.find((x) => x.id === id);
  const n = String(name ?? "").trim().slice(0, 30);
  if (!k || !n) return;
  k.name = n;
  save();
  changed("toaster");
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
function request(model, prompt, refs, aspect, name, keep = 0.97) {
  return { model: model.id, template: "edit", prompt, aspect, refs: [refs].flat().map((r) => ({ file: r.file, name: r.name })), count: 1, megapixels: model.megapixels?.[0] ?? 1, keep, seed: Math.floor(Math.random() * 2 ** 32), name };
}

/** How far the renders go from the clay (0 to 1): kept with the draft; the automatic prompt and the frame sent follow it. */
export function setStrength(value, { draw = true } = {}) {
  const b = body();
  if (!b) return;
  b.strength = Math.min(1, Math.max(0, Math.round(Number(value) * 100) / 100));
  save();
  if (draw) changed("toaster");
}

/** Which control maps the renders send beside the clay frame (the colour ID, the depth, the silhouette). */
export function toggleMap(id) {
  const b = body();
  if (!b) return;
  // (one of them must go: the render takes its layout from the first one on)
  if (b.maps.length === 1 && b.maps[0] === id) return void toast("One of them must stay on: the render takes its layout from the first one.", { tone: "warn" });
  b.maps = b.maps.includes(id) ? b.maps.filter((x) => x !== id) : MAPS.map((m) => m.id).filter((x) => x === id || b.maps.includes(x));
  save();
  changed("toaster");
}

/** Whether there is anything to toast: a visible part. */
export const hasClay = () => partsNow().some((p) => !p.hidden);

/** A picture of the Library as a reference for the whole render (a style, a mood, a material, a place), called by an @name of its own. */
export function addSceneRef(photo) {
  const b = body();
  if (!b) return null;
  const ref = newSceneRef(photo, b.parts, b.refs);
  if (!ref) {
    toast("The render holds six reference pictures, none twice.", { tone: "warn" });
    return null;
  }
  b.refs = [...b.refs, ref];
  save();
  changed("toaster");
  return ref;
}
export function removeSceneRef(name) {
  const b = body();
  if (!b) return;
  b.refs = b.refs.filter((r) => r.name !== name);
  save();
  changed("toaster");
}

/**
 * A picture made in the Oven for Toaster (makeToasterRef) taken where it was asked for: on its part's sheet, or in the render's
 * references, of its project; the project open takes it at once (Undo takes a part's back), another is changed where it is kept.
 */
export async function takeRef(ref, photo) {
  const pic = { file: photo.file, url: photo.url, width: photo.width, height: photo.height, name: photo.name ?? ref.name };
  const where = ref.kind === "scene" ? "in the render's references" : `on ${ref.name}'s sheet`;
  if (toaster.draft?.id === ref.draftId) {
    if (ref.kind === "scene") addSceneRef(pic);
    else if (partsNow().some((p) => p.id === ref.partId)) addPartRef(ref.partId, pic);
    else return toast(`${ref.name} is gone from the project: the picture is in the Library.`);
  } else {
    await flushDrafts();
    const { project } = await call(`api/${KIND}/${ref.draftId}`);
    const b = cleanDraft(project.body);
    if (ref.kind === "scene") {
      const r = newSceneRef(pic, b.parts, b.refs);
      if (!r) return toast("That project's render holds six references: the picture is in the Library.");
      b.refs.push(r);
    } else {
      const part = b.parts.find((p) => p.id === ref.partId);
      if (!part) return toast(`${ref.name} is gone from that project: the picture is in the Library.`);
      part.refs = addRef(part.refs, pic);
    }
    await send(`api/${KIND}/${ref.draftId}`, "PUT", { name: project.name, body: b });
  }
  toast(`The picture is ${where} now.`);
}

/** The prompt written by hand (it is then the user's, sent as written); "" gives it back to the writer. */
export function setPrompt(text) {
  const b = body();
  if (!b) return;
  b.prompt = String(text ?? "").slice(0, 6000);
  b.promptBy = b.prompt.trim() ? "you" : "";
  b.promptFor = null;
  save();
}

/**
 * What a render would send from the draft as it is: the maps (as many as the model's room takes beside the frame), the pictures (the scene's
 * references, then the parts'), the template prompt (the fallback), the facts the writer writes from, and who is in the frame.
 */
export function framePlan() {
  const b = body();
  const model = modelNow();
  const total = model?.templates?.find((t) => t.id === "edit")?.refs ?? 4;
  const parts = b.parts;
  // (a model with little room for pictures keeps the pictures put on the parts' sheets before the depth or the silhouette)
  const pictured = parts.filter((p) => !p.hidden && p.refs?.length).length;
  // (the clay frame is one of them: all share the model's room, the first one on leads)
  const picked = pickMaps({ wanted: b.maps, strength: b.strength, room: total, people: pictured });
  const maps = MAPS.filter((m) => picked.includes(m.id));
  // (only the user's own prompt picks the pictures: a written one must not change the facts it was written from)
  const mentioned = mentionsIn(`${b.promptBy === "you" ? b.prompt : ""} ${b.what} ${b.scene}`);
  const { refs, named } = referencesFor({ parts, sceneRefs: b.refs, room: Math.max(0, total - maps.length), mentioned });
  const tags = tagsOf(parts, b.refs.map((r) => r.name));
  const ids = maps.map((m) => m.id);
  const auto = framePrompt({ parts, what: b.what, scene: b.scene, maps: ids, sceneRefs: b.refs, named, tags, pieceOf: toaster.pieceOf, strength: b.strength });
  const cast = castOf(parts, b.refs, toaster.pieceOf);
  const facts = factsOf({
    parts, what: expandPrompt(b.what, cast, named), scene: expandPrompt(b.scene, cast, named), maps: ids, sceneRefs: b.refs, refs, named, tags, pieceOf: toaster.pieceOf,
    strength: b.strength, plain: plainFrame(b.strength, ids), model: model && { id: model.id, name: model.short ?? model.name, total },
  });
  const key = factsKey(facts);
  return { model, maps, refs, named, auto, cast, facts, key, stale: promptStale(b, model?.id, key), prompt: b.prompt.trim() };
}

/** Whether the writer has anything to write from: some words, or someone named. */
const hasFacts = (f) => !!(f.what || f.scene || f.who.length);

/** The writer (the assistants' model) writes the prompt for the image model from its guide; answers the text. `frame` is the clay frame, kept. */
async function askWriter(draft, plan, lead) {
  const b = draft.body;
  // one picture of each sheet is shown to the writer, after the picture that leads (the clay frame, or the map that leads without it)
  const firsts = [...plan.named].map(([, names]) => plan.refs.find((r) => r.name === names[0])).filter(Boolean);
  const out = await send("api/toaster/write", "POST", {
    model: writer("assistant"), imageModel: plan.model.id, facts: plan.facts, prompt: b.promptBy === "you" ? b.prompt.trim() || undefined : undefined,
    refs: [{ name: lead.name, file: lead.file }, ...firsts.map((r) => ({ name: r.name, file: r.file }))],
  });
  const text = String(out.prompt ?? "").slice(0, 6000);
  if (!text.trim()) throw new Error("The writer answered nothing.");
  return text;
}
/** The writer's prompt kept on the draft, with what it was written for. */
function keepWritten(b, plan, text) {
  b.prompt = text;
  b.promptBy = "writer";
  b.promptFor = { model: plan.model.id, key: plan.key };
}

/** Write: the writer writes the prompt now, or again; it becomes the draft's, marked as the writer's. */
export async function writeWords() {
  const draft = toaster.draft;
  const b = body();
  const v = toaster.view;
  if (!draft || !b || !v || toaster.writing) return;
  if (!hasClay()) return toast("Block something out first: add a shape.", { tone: "warn" });
  if (!modelNow()) return toast("No image model can render from the clay: connect Comfy Cloud or a partner key.", { tone: "crit" });
  toaster.writing = true;
  changed("toaster-runs");
  try {
    const plan = framePlan();
    const first = plan.maps[0] ?? MAPS[0];
    const lead = await keepPicture(first.id === "clay" ? v.frameStill({ long: 1536, plain: plainFrame(b.strength, plan.maps.map((m) => m.id)) }) : v.frameStill({ long: 1536, channel: first.id }), `${draft.name} ${first.id === "clay" ? "clay" : first.name}`);
    keepWritten(b, plan, await askWriter(draft, plan, { ...lead, name: first.name }));
    save(draft);
  } catch (e) {
    toast(e.message, { tone: "crit" });
  } finally {
    toaster.writing = false;
    changed("toaster-runs");
    changed("toaster");
  }
}

/** The frame as the camera sees it, rendered: the clay is the layout, the words what it becomes. */
export async function renderFrame() {
  const draft = toaster.draft;
  const b = body();
  const v = toaster.view;
  if (!draft || !v) return;
  if (!hasClay()) return toast("Block something out first: add a shape.", { tone: "warn" });
  const model = modelNow();
  if (!model) return toast("No image model can render from the clay: connect Comfy Cloud or a partner key.", { tone: "crit" });
  const run = { id: runId(), status: "running", progress: 0, camera: v.cameraState(), ratio: b.ratio, model: model.id, strength: b.strength, at: new Date().toISOString() };
  b.renders.unshift(run);
  toaster.shown = run.id;
  toaster.compare = false;
  b.camera = run.camera;
  update("toaster-runs");
  try {
    // the pictures that go (the frame first, the control maps, the references within the room left) and the facts the writer reads
    const plan = framePlan();
    const ids = plan.maps.map((m) => m.id);
    const sendsClay = ids.includes("clay");
    // (strong enough, with the colour ID sent to say who is who, the frame goes in plain grey clay: its colours would pull the picture to
    // them; left out, it is still kept, for the wipe against the clay)
    run.frame = await keepPicture(v.frameStill({ long: 1536, plain: sendsClay && plainFrame(b.strength, ids) }), `${draft.name} clay`);
    run.maps = [];
    for (const m of plan.maps.filter((m) => m.id !== "clay")) run.maps.push({ ...(await keepPicture(v.frameStill({ long: 1536, channel: m.id }), `${draft.name} ${m.name}`)), name: m.name });
    const lead = sendsClay ? { ...run.frame, name: "frame" } : run.maps[0];
    const sent = plan.refs;
    // the user's own prompt is sent as written; else the writer's, written now when there is none or it is out of date (if the writer fails, the template)
    if (b.promptBy !== "you" && (!b.prompt.trim() || plan.stale) && hasFacts(plan.facts)) {
      toaster.writing = true;
      changed("toaster-runs");
      try {
        keepWritten(b, plan, await askWriter(draft, plan, lead));
        save(draft);
      } catch (e) {
        toast(`The writer could not write the prompt (${e.message}): the template is used.`, { tone: "warn" });
        run.prompt = expandPrompt(plan.auto, plan.cast, plan.named);
      } finally {
        toaster.writing = false;
        changed("toaster-runs");
        changed("toaster");
      }
    }
    run.prompt ||= b.prompt.trim() || expandPrompt(plan.auto, plan.cast, plan.named);
    run.refs = sent.map((r) => ({ name: r.name, url: r.url }));
    // (an open-weights edit starts from the clay frame, kept as much as the strength says; from a map it would start grey, so it starts new)
    const done = await picture(run, request(model, run.prompt, [...(sendsClay ? [{ ...run.frame, name: "frame" }] : []), ...run.maps, ...sent], b.ratio, draft.name, sendsClay ? keepOf(b.strength) : undefined));
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
    // the parts' pictures go along (the model's room permitting), and the words call the parts by their tags
    const room = Math.max(0, (model.templates?.find((t) => t.id === "edit")?.refs ?? 4) - 1);
    const { refs, named } = referencesFor({ parts: b.parts, room });
    run.prompt = expandPrompt(sheetPrompt({ ...b, tags: tagsOf(b.parts), named, pieceOf: toaster.pieceOf }), castOf(b.parts, [], toaster.pieceOf), named);
    run.refs = refs.map((r) => ({ name: r.name, url: r.url }));
    const done = await picture(run, request(model, run.prompt, [{ ...run.frame, name: "sheet" }, ...refs], SHEET.aspect, `${draft.name} turnaround`));
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
