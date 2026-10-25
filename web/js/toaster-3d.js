// Toaster's 3D page, the doing: the scene's objects are made real ONE AT A TIME, in the order of the list. For each object:
//   1. its clay, alone, in four views (toaster-view.js objectSheetStill) goes to an image model (Nano Banana 2.1 unless the person picks
//      another) that draws the object's real multi-view sheet, one object per sheet;
//   2. the sheet is cut into its four views (front, back, left, right);
//   3. the four views make a textured 3D model: Trellis2 on the person's own ComfyUI (server/toaster-3d.ts, workflows/3d/), or, with no
//      ComfyUI of its own (a hosted copy), Pixal3D's multi-view template on Comfy Cloud, which takes the views laid on its own sheet;
//   4. only then the next object. The finished models are put back in a new scene (toaster-scene3d.js), each where its clay was.
// A sheet made with a router model costs its credits, so the person's yes comes first (one yes covers the queue it names); the model on
// their own GPU costs nothing, and on Cloud it asks its own price. Nothing is sent without a click, and a stopped queue finishes the
// object in hand and stops.
import { changed, toast } from "./store.js";
import { api } from "./api.js";
import { OBJECT, SHEET, TO_3D, wants3d, objectSheetPrompt, referencesFor, tagsOf } from "./toaster-model.js";
import { toaster, body, partsNow, save, modelNow, picture, request, keepPicture, runId, update, hasClay, resized } from "./toaster.js";

const GEN = "api/toaster/3d";
const TEMPLATES = "api/utensils/templates";
/** The sheet model the 3D page prefers (the router's Nano Banana 2.1), when the person has not chosen. */
export const SHEET_MODEL = "gemini-nano-banana-2.1";

export const gen = {
  /** where a model can be made: { local: { ok, url, why }, cloud: bool }, read once */
  target: null,
  /** the object in hand: { id, step: "sheet" | "cut" | "model" } */
  active: null,
  /** the ids still to come in a queue, in order */
  queue: [],
  /** the queue is to stop after the object in hand */
  stopping: false,
  /** the key waiting for its yes: { id: "queue" | a part's id, until } */
  armed: null,
  /** the sheet of one object shown beside its clay: "clay" | "sheet" */
  look: "sheet",
};

const call = async (path, options) => {
  const res = await fetch(path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `That didn't work (${res.status}).`);
  return data;
};
const send = (path, method, payload) => call(path, { method, headers: { "Content-Type": "application/json" }, body: payload ? JSON.stringify(payload) : undefined });

// ---------------------------------------------------------------- what is where

export const sheetOf = (partId) => body()?.sheets.find((s) => s.part === partId && s.status === "done" && s.photo?.file) ?? null;
export const sheetRun = (partId) => body()?.sheets.find((s) => s.part === partId) ?? null;
export const modelOf = (partId) => body()?.models.find((m) => m.part === partId && m.status === "done" && m.url) ?? null;
export const modelRun = (partId) => body()?.models.find((m) => m.part === partId) ?? null;
/** Where an object is: "waiting", "sheet" (being drawn), "drawn" (its sheet is in), "model" (being made) or "done". */
export function stateOf(partId) {
  const s = sheetRun(partId);
  const m = modelRun(partId);
  if (m?.status === "running") return "model";
  if (m?.status === "done") return "done";
  if (s?.status === "running") return "sheet";
  if (s?.status === "done") return "drawn";
  return "waiting";
}
/** The objects that are made in 3D, in the order of the list. */
export const objectsNow = () => partsNow().filter(wants3d);

/** The image model that draws the sheets: the person's pick, else Nano Banana 2.1 when there is one, else the page's model. */
export function sheetModel() {
  const list = toaster.models?.models ?? [];
  const want = body()?.sheetModel;
  return list.find((m) => m.id === want) ?? list.find((m) => m.id === SHEET_MODEL) ?? modelNow();
}
export function setSheetModel(id) {
  const b = body();
  if (!b) return;
  b.sheetModel = id;
  save();
  changed("toaster", "toaster-runs");
}
/** Whether a part is made in 3D (or left as clay): the person's say. */
export function setSolid(partId, on) {
  const p = partsNow().find((x) => x.id === partId);
  if (!p) return;
  p.solid = !!on;
  save();
  update("toaster");
  changed("toaster-runs");
}

/** Where a model can be made, read once (free): the person's own ComfyUI, or Comfy Cloud. `fresh` asks again (a ComfyUI started since). */
export async function loadTarget(fresh = false) {
  if (gen.target && !fresh) return gen.target;
  try {
    gen.target = await call(`${GEN}/target`);
  } catch {
    gen.target = { local: { ok: false, why: "The server could not look for a ComfyUI." } };
  }
  changed("toaster-runs");
  return gen.target;
}
/** What the model of one object costs: "your GPU" on the person's ComfyUI, else Cloud's price (read once, free). */
let cloudPrice = null;
export async function loadCloudPrice() {
  if (cloudPrice) return cloudPrice;
  try {
    cloudPrice = await send(`${TEMPLATES}/${TO_3D}/estimate`, "POST");
  } catch {
    cloudPrice = { credits: null, note: "" };
  }
  changed("toaster-runs");
  return cloudPrice;
}
export const route = () => (gen.target?.local?.ok ? "local" : "cloud");
/** The price of an object's model, for a key: { words, credits }. */
export function modelPrice() {
  if (route() === "local") return { words: "your GPU", credits: 0 };
  const c = cloudPrice?.credits;
  return c > 0 ? { words: `≈ ${c} cr`, credits: c } : { words: "GPU time", credits: 0 };
}
/** What an object's sheet costs: the model's credits, or its GPU time. */
export function sheetPrice() {
  const m = sheetModel();
  return m?.router ? { words: `≈ ${m.credits} cr`, credits: m.credits } : { words: "GPU time", credits: 0 };
}
/** What making the objects named costs, as words: the sheets (those not drawn yet) and the models, in credits. */
export function costOf(ids) {
  const sheets = ids.filter((id) => !sheetOf(id)).length;
  const credits = sheets * sheetPrice().credits + ids.filter((id) => !modelOf(id)).length * modelPrice().credits;
  return { credits, words: credits > 0 ? `≈ ${credits} cr` : "free", sheets };
}

// ---------------------------------------------------------------- the yes to a price (one for a key, 8 seconds)

export const isArmed = (id) => gen.armed?.id === id && gen.armed.until > Date.now();
export function arm(id) {
  gen.armed = { id, until: Date.now() + 8000 };
  changed("toaster-runs");
  setTimeout(() => gen.armed && gen.armed.until <= Date.now() && ((gen.armed = null), changed("toaster-runs")), 8100);
}
export function disarm() {
  gen.armed = null;
  changed("toaster-runs");
}

// ---------------------------------------------------------------- one object: its sheet

/** The object's sheet: its clay alone in four views, drawn for real by the image model. Answers the run (done or failed). */
export async function makeSheet(partId) {
  const draft = toaster.draft;
  const b = body();
  const part = partsNow().find((p) => p.id === partId);
  const v = toaster.view;
  if (!draft || !part || !v) return null;
  const model = sheetModel();
  if (!model) {
    toast("No image model can draw the sheet: connect Comfy Cloud or a partner key.", { tone: "crit" });
    return null;
  }
  const run = { id: runId(), part: partId, status: "running", progress: 0, ratio: OBJECT.aspect, model: model.id, modelName: model.short ?? model.name, cost: sheetPrice().words, at: new Date().toISOString() };
  b.sheets.unshift(run);
  update("toaster-runs");
  try {
    const clay = v.objectSheetStill(partId, { cell: 512 });
    if (!clay) throw new Error(`${part.name} is not in the scene.`);
    run.frame = await keepPicture(clay.url, `${draft.name} ${part.name} clay`);
    // the object's own pictures go along (the model's room permitting): its @tag is what the words call them by
    const room = Math.max(0, (model.templates?.find((t) => t.id === "edit")?.refs ?? 4) - 1);
    const { refs, named } = referencesFor({ parts: [part], room });
    run.prompt = objectSheetPrompt({ part, what: part.made, scene: b.scene || b.what, named: refs.length > 0, pieceOf: toaster.pieceOf });
    run.refs = refs.map((r) => ({ name: r.name, url: r.url }));
    const done = await picture(run, request(model, run.prompt, [{ ...run.frame, name: "sheet" }, ...refs], OBJECT.aspect, `${draft.name} · ${part.name} sheet`));
    run.photo = await keepPicture(await resized(done.photo.url, OBJECT.cell * 2, OBJECT.cell * 2), `${draft.name} · ${part.name} sheet`);
    run.status = "done";
  } catch (e) {
    Object.assign(run, { status: "failed", error: e.message });
    toast(`${part.name}: ${e.message}`, { tone: "crit" });
  } finally {
    save(draft);
    update("toaster-runs");
  }
  return run;
}

// ---------------------------------------------------------------- one object: the cut, and its model

/** A sheet's four views, cut: each cell as a square PNG of the cell's own size, [{ view, blob }] in OBJECT.views's order. */
export async function cutSheet(url) {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;
  await img.decode();
  const cell = Math.round(Math.min(img.naturalWidth, img.naturalHeight) / 2);
  const out = [];
  for (const { view, col, row } of OBJECT.views) {
    const c = document.createElement("canvas");
    Object.assign(c, { width: OBJECT.cell, height: OBJECT.cell });
    const ctx = c.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, col * cell, row * cell, cell, cell, 0, 0, OBJECT.cell, OBJECT.cell);
    out.push({ view, blob: await new Promise((ok) => c.toBlob(ok, "image/png")) });
  }
  return out;
}
/** The four views laid on Pixal3D's own sheet (SHEET: front, left, back, right, each in its window), as a JPEG blob. */
async function pixalSheet(url) {
  const views = await cutSheet(url);
  const by = Object.fromEntries(await Promise.all(views.map(async (v) => [v.view, await createImageBitmap(v.blob)])));
  const c = document.createElement("canvas");
  Object.assign(c, { width: SHEET.width, height: SHEET.height });
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, SHEET.width, SHEET.height);
  for (const win of SHEET.windows) {
    const side = Math.min(win.w, SHEET.height);
    ctx.drawImage(by[win.view], win.x + (win.w - side) / 2, (SHEET.height - side) / 2, side, side);
  }
  return new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.93));
}

/** The object's model, from its sheet: cut, sent, followed to its end, kept. Answers the model's record (done or failed). */
export async function makeModel(partId, { quality = "web" } = {}) {
  const draft = toaster.draft;
  const b = body();
  const part = partsNow().find((p) => p.id === partId);
  const sheet = sheetOf(partId);
  if (!draft || !part || !sheet) return null;
  await loadTarget(gen.target?.local?.ok === false);
  const via = route();
  const m = { id: runId(), part: partId, sheet: sheet.id, via, quality, status: "running", progress: 0.02, stage: "Cutting the four views", at: new Date().toISOString() };
  b.models.unshift(m);
  update("toaster-runs");
  try {
    if (via === "local") {
      const cuts = await cutSheet(sheet.photo.url);
      const files = {};
      for (const { view, blob } of cuts) files[view] = (await api.upload(blob, `${draft.name} · ${part.name} ${view}`)).file;
      const job = await send(`${GEN}/make`, "POST", { views: files, name: part.name, quality, seed: Math.floor(Math.random() * 2 ** 31) });
      m.job = job.id;
      save(draft);
      await follow(draft, m);
    } else {
      const { schema } = await call(`${TEMPLATES}/${TO_3D}`);
      const slot = schema?.slots?.find((s) => s.kind === "image")?.id ?? "image";
      const photo = await api.upload(await pixalSheet(sheet.photo.url), `${draft.name} · ${part.name} for Pixal3D`);
      const started = await send(`${TEMPLATES}/${TO_3D}/run`, "POST", { inputs: { [slot]: photo.file }, confirm: true });
      m.job = started.id;
      m.stage = "Pixal3D on Comfy Cloud";
      save(draft);
      await follow(draft, m);
    }
  } catch (e) {
    Object.assign(m, { status: "failed", error: e.message });
    toast(`${part.name}: ${e.message}`, { tone: "crit" });
  } finally {
    save(draft);
    update("toaster-runs");
  }
  return m;
}

/** Follows a model's job to its end (a poll: it takes minutes), and keeps what it made. A page left and come back to follows it again. */
export async function follow(draft, m) {
  const where = m.via === "cloud" ? `${TEMPLATES}/job` : `${GEN}/job`;
  for (let i = 0; i < 4800 && m.status === "running"; i++) {
    await new Promise((ok) => setTimeout(ok, i === 0 ? 700 : 2000));
    let job;
    try {
      job = await call(`${where}/${m.job}`);
    } catch (e) {
      // the server no longer knows the job (it was restarted, or it is over an hour old)
      if (/gone|404|over an hour/i.test(e.message)) Object.assign(m, { status: "failed", error: "The server lost this job (it was restarted). Make the model again." });
      continue;
    }
    m.progress = Math.max(m.progress ?? 0, job.progress ?? 0);
    if (job.stages) m.stage = job.stages.find((s) => s.status === "running")?.title ?? m.stage;
    if (job.status === "done") {
      const out = (job.outputs ?? []).find((o) => o.kind === "model");
      if (!out) Object.assign(m, { status: "failed", error: "It finished without a 3D file." });
      else Object.assign(m, { status: "done", progress: 1, stage: undefined, url: out.url, file: out.file, path: out.path });
    } else if (job.status !== "running") Object.assign(m, { status: "failed", error: job.error ?? "That didn't work." });
    changed("toaster-runs");
  }
  save(draft);
  update("toaster-runs");
}

// ---------------------------------------------------------------- the objects, one after the other

/** One object, from its clay to its model: the sheet (unless it has one), then the model. Answers whether the model is done. */
export async function makeObject(partId, opts = {}) {
  gen.active = { id: partId, step: "sheet" };
  changed("toaster-runs");
  try {
    if (!sheetOf(partId) || opts.again) {
      const s = await makeSheet(partId);
      if (s?.status !== "done") return false;
    }
    gen.active = { id: partId, step: "model" };
    changed("toaster-runs");
    return (await makeModel(partId, opts))?.status === "done";
  } finally {
    gen.active = null;
    changed("toaster-runs");
  }
}

/**
 * The objects named, one after the other, in the order given: each is finished (its sheet, its cut, its model) before the next one starts.
 * An object that fails is passed over (it says why on its card); a stop finishes the one in hand and goes no further.
 */
export async function makeThem(ids) {
  if (gen.active || gen.queue.length) return;
  gen.queue = ids.filter((id) => !modelOf(id));
  gen.stopping = false;
  changed("toaster-runs");
  while (gen.queue.length && !gen.stopping) {
    const id = gen.queue[0];
    await makeObject(id);
    gen.queue.shift();
    changed("toaster-runs");
  }
  const left = gen.queue.length;
  gen.queue = [];
  gen.stopping = false;
  changed("toaster-runs");
  if (!left) toast("The objects are made: look at them in the new scene.", { tone: "ok" });
}
export function stopQueue() {
  gen.stopping = true;
  changed("toaster-runs");
}
/** An object's sheet and model forgotten (their files stay in the Library). */
export function forgetObject(partId) {
  const b = body();
  if (!b) return;
  b.sheets = b.sheets.filter((s) => s.part !== partId);
  b.models = b.models.filter((m) => m.part !== partId);
  save();
  update("toaster-runs");
}
export { hasClay };
