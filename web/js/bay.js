// Spice's state and its work: the shots kept on the server (data/spice-bays, one file each), the one open, the stage open, the engine
// chosen for each stage and what is typed for it, what is working. A shot is a clip and the takes the seven stages made of it
// (spice2-model.js holds the rules). Every change to the open shot is kept a moment after the last one. A paid run is only sent with the
// person's yes to its price (bay-ui.js: yes()); a run is a TAKE of its stage, kept whether it worked or not, so what was tried is on record.
import { api } from "./api.js";
import { changed, toast, state } from "./store.js";
import { keyedSaver } from "./saving.js";
import { editRun, editStop, editProbe, editPreview } from "./utensils-edit-api.js";
import { runnerOf, costOf } from "./utensils-cloud.js";
import { STAGE_IDS, ENGINES, ledgerText, enginesFor, engineOf, priceOf, preflight, blocked, blankBody, normaliseBody, addTake, markTake, removeTake, inputFor, inputInfo, conformPlan, passOf, pickMedia, CONFORM, recommend, mediaOf, fillSlots } from "./spice2-model.js";

const KIND = "spice-bays";
const OPEN = "comfyture.bay.open";
const STAGE = "comfyture.bay.stage";

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

export const bay = {
  /** the shots, newest first: { id, name, thumb, updatedAt, info } */
  list: [],
  /** the shot open: { id, name, body } */
  shot: null,
  stage: STAGE_IDS.includes(read(STAGE)) ? read(STAGE) : "conform",
  ready: null,
  /** what is working, by shot and stage ("shot:stage"): { label, progress, cancel } */
  busy: new Map(),
  /** the catalog of Comfy Cloud's templates (the items of the listing) once it is read, null before; `catalogError` when it could not be */
  catalog: null,
  catalogError: "",
  /** what the person has set up for each stage: { engine: template name, text, refs: [media], mode } */
  form: Object.fromEntries(STAGE_IDS.map((id) => [id, { engine: "", text: "", refs: [], mode: "" }])),
  /** the real forms of the templates, as Comfy Cloud's schema gives them (read when an engine is chosen): name -> { slots } or null when it could not be read */
  forms: new Map(),
  /** the price estimates the runner gave, by template name: { credits, perUnit, note }, null when it could not say */
  estimates: new Map(),
  /** the key waiting for its yes: { id, until } */
  armed: null,
  /** the two takes on the wipe: { a, b } as { stage, id } or "clip" */
  wipe: { a: "clip", b: null },
};
const update = () => changed("spice");

const call = async (path, init) => {
  const res = await fetch(path, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body;
};
const send = (path, method, body) => call(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });

// ---------------------------------------------------------------- the shots kept on the server

export function loadBays() {
  return (bay.ready ??= (async () => {
    try {
      bay.list = (await call(`api/${KIND}`))[KIND] ?? [];
      const id = bay.list.find((s) => s.id === read(OPEN))?.id ?? bay.list[0]?.id;
      if (id) await openShot(id);
      else await newShot();
    } catch (e) {
      console.warn("spice:", e.message);
    }
    loadCatalog();
    update();
  })());
}

export async function openShot(id) {
  await flushShots();
  const { project } = await call(`api/${KIND}/${id}`);
  bay.shot = { id: project.id, name: project.name, body: normaliseBody(project.body) };
  write(OPEN, id);
  bay.wipe = { a: "clip", b: null };
  update();
}

let named = 0;
export async function newShot(name) {
  await flushShots();
  const { project } = await send(`api/${KIND}`, "POST", { name: name || `Shot ${bay.list.length + 1 + named++}`, body: blankBody() });
  bay.list = [{ id: project.id, name: project.name, updatedAt: project.updatedAt, info: {} }, ...bay.list];
  bay.shot = { id: project.id, name: project.name, body: normaliseBody(project.body) };
  write(OPEN, project.id);
  bay.stage = "conform";
  bay.wipe = { a: "clip", b: null };
  update();
  return bay.shot;
}

const keep = async (id, shot) => {
  const thumb = shot.body.clip?.media?.still ?? undefined;
  await send(`api/${KIND}/${id}`, "PUT", { name: shot.name, body: shot.body, ...(thumb ? { thumb } : {}) })
    .then(() => {
      const row = bay.list.find((x) => x.id === id);
      if (row) Object.assign(row, { name: shot.name, thumb, updatedAt: new Date().toISOString() });
    })
    .catch((e) => toast(e.message, { tone: "crit" }));
};
const saver = keyedSaver(500, keep);
export const flushShots = () => saver.flush();
const save = (shot = bay.shot) => shot && saver.save(shot.id, shot);

export async function removeShot(id) {
  saver.drop(id);
  const out = await call(`api/${KIND}/${id}`, { method: "DELETE" });
  bay.list = out[KIND] ?? [];
  if (bay.shot?.id === id) {
    bay.shot = null;
    if (bay.list[0]) await openShot(bay.list[0].id);
    else await newShot();
  }
  update();
}

export function rename(name) {
  if (!bay.shot) return;
  bay.shot.name = String(name).slice(0, 60);
  const row = bay.list.find((x) => x.id === bay.shot.id);
  if (row) row.name = bay.shot.name;
  save();
  update();
}

export const body = () => bay.shot?.body ?? null;

/** Changes the open shot (or the one given, which may no longer be the open one): `fn(body)` returns the new body, or edits in place. */
export function edit(fn, shot = bay.shot) {
  if (!shot) return;
  const next = fn(shot.body);
  if (next && typeof next === "object") shot.body = next;
  save(shot);
  update();
}

export function setStage(id) {
  if (!STAGE_IDS.includes(id) || bay.stage === id) return;
  bay.stage = id;
  bay.armed = null;
  write(STAGE, id);
  update();
  priceStage(id);
  ensureForm(chosen(id)?.name);
}

/** The prices of a stage's partner engines, asked one after the other (free, read-only), so each card says what it costs. */
export async function priceStage(stage = bay.stage) {
  for (const eng of enginesOfStage(stage).engines) {
    if (eng.partner && !bay.estimates.has(eng.name)) await pricing(stage, eng);
  }
}

/** A step of Paprika's plan taken up: its stage opened, its engine picked, its words put. */
export function followStep(step) {
  setStage(step.stage);
  if (step.engine) pickEngine(step.stage, step.engine);
  if (step.text) setText(step.stage, step.text);
  update();
}

/** Sets the brief of the shot (what it is for), kept quietly while it is typed. */
export function setBrief(text) {
  if (!bay.shot) return;
  bay.shot.body.brief = String(text).slice(0, 4000);
  save();
}

/** Points a stage at another input: "clip", or a stage whose pass it takes. */
export function setSource(stage, from) {
  edit((b) => {
    b.stages[stage].from = from;
  });
}

// ---------------------------------------------------------------- what is working

export const workingOn = (stage, shotId = bay.shot?.id) => bay.busy.get(`${shotId}:${stage}`) ?? null;
function setBusy(stage, state, shotId = bay.shot?.id) {
  const k = `${shotId}:${stage}`;
  state ? bay.busy.set(k, state) : bay.busy.delete(k);
  update();
}

// ---------------------------------------------------------------- the engines and their prices

/** Reads the catalog of Comfy Cloud's templates (free, no key), once; the engines of each stage come from it. */
export function loadCatalog() {
  if (bay.catalog || bay.catalogLoading) return bay.catalogLoading;
  bay.catalogLoading = (async () => {
    try {
      const out = [];
      // (the listing gives 200 at a time)
      for (let offset = 0; offset < 1200; offset += 200) {
        const page = await call(`api/utensils/templates?limit=200&offset=${offset}`);
        out.push(...(page.items ?? []));
        if (out.length >= (page.count ?? 0) || !(page.items ?? []).length) break;
      }
      bay.catalog = out;
      bay.catalogError = "";
    } catch (e) {
      bay.catalogError = e.message;
    }
    bay.catalogLoading = null;
    update();
    priceStage();
    ensureForm(chosen(bay.stage)?.name);
  })();
  return bay.catalogLoading;
}

/** The engines of a stage with what the catalog says of each, and the curated ones it no longer has. */
export function enginesOfStage(stage) {
  const found = enginesFor(stage, bay.catalog);
  // with open weights only (COMFYTURE_OPEN_WEIGHTS) a partner's model never runs: it is not offered
  if (!state.account?.openWeights) return { ...found, hidden: 0 };
  return { engines: found.engines.filter((x) => !x.partner), missing: found.missing, hidden: found.engines.filter((x) => x.partner).length };
}

/** The engine chosen for a stage: the one the person picked, else Paprika's pick for the words typed (or the stage's first). */
export function chosen(stage) {
  const f = bay.form[stage];
  const { engines } = enginesOfStage(stage);
  const own = engines.find((x) => x.name === f.engine);
  if (own) return own;
  const seconds = inputInfo(bay.shot?.body ?? blankBody(), stage).seconds;
  const pick = recommend(stage, f.text, { seconds });
  return engines.find((x) => x.name === pick?.name) ?? engines[0] ?? null;
}

export function pickEngine(stage, name) {
  bay.form[stage].engine = name;
  bay.armed = null;
  update();
  pricing(stage);
  ensureForm(name);
}

const formWaits = new Map();
/** Reads a template's real form (what it requires of the shot), once: the guess Spice has of an engine gives way to it. */
export function ensureForm(name) {
  if (!name || formWaits.has(name)) return formWaits.get(name) ?? Promise.resolve();
  const p = runnerOf()
    .then((api2) => api2?.getTemplate(name))
    .then((t) => bay.forms.set(name, t?.schema ?? null))
    .catch(() => bay.forms.set(name, null))
    .then(update);
  formWaits.set(name, p);
  return p;
}

const waits = new Map();
/** Asks the runner what the chosen engine of the open stage costs (a partner's price is its own estimate; free to ask). Answers when it is known. */
export function pricing(stage = bay.stage, which = null) {
  const eng = which ?? chosen(stage);
  if (!eng || eng.local || !eng.partner) return Promise.resolve();
  if (waits.has(eng.name)) return waits.get(eng.name);
  bay.estimates.set(eng.name, undefined);
  const p = costOf(eng.name).then((e) => {
    bay.estimates.set(eng.name, e ?? null);
    update();
  });
  waits.set(eng.name, p);
  return p;
}

/** What the open stage's run would cost now, in credits (null when unknown). */
export function priceNow(stage = bay.stage) {
  const eng = chosen(stage);
  if (!eng) return 0;
  const { seconds } = inputInfo(bay.shot.body, stage);
  return priceOf(eng, Math.min(seconds || 5, eng.max ?? 99), bay.estimates.get(eng.name));
}

/** What stands in the way of the open stage's run. */
export function problems(stage = bay.stage) {
  const eng = chosen(stage);
  if (!eng || !bay.shot) return [];
  const f = bay.form[stage];
  const out = preflight(eng, bay.shot.body, stage, { text: f.text, images: f.refs.length }, bay.forms.get(eng.name) ?? null);
  // a template runs on Comfy Cloud: with no key saved (a first visit renders on a ComfyUI here, where templates do not run) it cannot be sent
  if (!eng.local && state.account && state.account.key && !state.account.key.set) out.unshift({ level: "stop", text: "Templates run on Comfy Cloud: save a Comfy key in the account window (top right) to run this. Conform and the export work without one." });
  return out;
}

export function setText(stage, text) {
  bay.form[stage].text = String(text).slice(0, 2000);
}

// ---------------------------------------------------------------- reference pictures

/** A picture from the computer, added to the references of a stage (a sheet, a frame, a look). */
export async function addRef(stage, file) {
  if (!file?.type?.startsWith("image/")) return toast("A reference is a picture.");
  try {
    const p = await api.upload(file, file.name);
    bay.form[stage].refs = [...bay.form[stage].refs, { kind: "image", url: p.url, file: p.file, width: p.width, height: p.height }].slice(0, 9);
    update();
  } catch (e) {
    toast(e.message, { tone: "crit" });
  }
}
export function dropRef(stage, i) {
  bay.form[stage].refs = bay.form[stage].refs.filter((_, j) => j !== i);
  update();
}

// ---------------------------------------------------------------- the clip

/** A clip from the computer: the shot's footage, kept in the library, read (its rate), a still of it for the shot's card. */
export async function importClip(file) {
  if (!file) return;
  if (!file.type.startsWith("video/")) return toast("Spice takes a clip.");
  const shot = bay.shot;
  setBusy("conform", { label: "Importing", progress: 0 }, shot.id);
  try {
    const v = await api.uploadVideo(file);
    const media = { kind: "video", url: v.url, file: v.file, width: v.width, height: v.height, seconds: v.duration };
    const probe = await editProbe(v.file).catch(() => null);
    const fps = probe?.fps ? Math.round(probe.fps * 100) / 100 : 24;
    media.still = await editPreview("grade", { video: v.file, preset: "none" }, Math.min(0.5, (v.duration || 1) / 2)).then((s) => s.url).catch(() => undefined);
    edit((b) => {
      const next = blankBody();
      next.brief = b.brief;
      next.clip = { media, fps, name: file.name, at: new Date().toISOString() };
      next.log = b.log;
      return normaliseBody(next);
    }, shot);
    if (shot.name.startsWith("Shot ")) rename(file.name.replace(/\.[^.]+$/, "").slice(0, 40));
  } catch (e) {
    toast(e.message, { tone: "crit" });
  } finally {
    setBusy("conform", null, shot.id);
  }
}

/** A clip of the library (a take, a film) as the shot's footage. */
export async function useLibraryClip(source, name) {
  const shot = bay.shot;
  setBusy("conform", { label: "Importing", progress: 0 }, shot.id);
  try {
    const v = await api.videoFrom(source);
    const media = { kind: "video", url: v.url, file: v.file, width: v.width, height: v.height, seconds: v.duration };
    const probe = await editProbe(v.file).catch(() => null);
    media.still = await editPreview("grade", { video: v.file, preset: "none" }, Math.min(0.5, (v.duration || 1) / 2)).then((s) => s.url).catch(() => undefined);
    edit((b) => {
      const next = blankBody();
      next.brief = b.brief;
      next.log = b.log;
      next.clip = { media, fps: probe?.fps ? Math.round(probe.fps * 100) / 100 : 24, name: name ?? "Take", at: new Date().toISOString() };
      return normaliseBody(next);
    }, shot);
  } catch (e) {
    toast(e.message, { tone: "crit" });
  } finally {
    setBusy("conform", null, shot.id);
  }
}

export function pickClip() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "video/*";
  input.hidden = true;
  input.addEventListener("change", () => (input.files[0] && importClip(input.files[0]), input.remove()));
  document.body.append(input);
  input.click();
}
export function pickRef(stage) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.multiple = true;
  input.hidden = true;
  input.addEventListener("change", async () => {
    for (const f of [...input.files]) await addRef(stage, f);
    input.remove();
  });
  document.body.append(input);
  input.click();
}

// ---------------------------------------------------------------- Conform: the local stage

/**
 * Sets the clip to what the editors take: cut to the length they accept and set to 24 fps with an even size, on this machine (ffmpeg, free).
 * The result is Conform's take and the input of the stages after it.
 */
export async function conform({ maxSeconds = CONFORM.maxSeconds, fps = CONFORM.fps } = {}) {
  const shot = bay.shot;
  const clip = shot?.body.clip;
  if (!clip) return toast("Bring a clip first.");
  const plan = conformPlan(clip, { fps, maxSeconds });
  const label = "Conforming";
  const stage = "conform";
  if (bay.busy.has(`${shot.id}:${stage}`)) return;
  const mark = { label, progress: 0, cancel: null };
  setBusy(stage, mark, shot.id);
  const t0 = Date.now();
  try {
    let current = clip.media;
    const steps = [];
    if (plan.some((p) => p.what === "length")) steps.push(["trim", { video: current.file, start: 0, end: maxSeconds, mode: "encode" }]);
    steps.push(["convert", { format: "mp4", quality: "high", height: "0", fps: String(fps), codec: "h264" }]);
    let i = 0;
    for (const [tool, params] of steps) {
      const bodyOf = tool === "convert" ? { ...params, video: current.file } : params;
      const made = await editRun(tool, bodyOf, (p) => ((mark.progress = (i + Math.min(1, p)) / steps.length), update()), (id) => (mark.cancel = () => editStop(id)));
      const m = pickMedia(made);
      if (!m) throw new Error("Nothing came back.");
      current = { ...m, seconds: m.seconds ?? made[0]?.duration };
      i++;
    }
    const still = await editPreview("grade", { video: current.file, preset: "none" }, Math.min(0.5, (current.seconds || 1) / 2)).then((s) => s.url).catch(() => undefined);
    if (still) current.still = still;
    edit((b) => addTake(b, stage, { engine: "local:conform", title: "Conform", mode: "local", media: current, from: "clip", credits: 0, source: "local", seconds: (Date.now() - t0) / 1000, note: plan.length ? plan.map((p) => `${p.what}: ${p.from} → ${p.to}`).join("; ") : "Already ready: re-encoded as it is." }, { mark: true }), shot);
    toast("The clip is ready for the editors.");
  } catch (e) {
    if (!/^Stopped\.?$/.test(e.message)) toast(`Conform: ${e.message}`, { tone: "crit" });
  } finally {
    setBusy(stage, null, shot.id);
    flushShots();
  }
}

// ---------------------------------------------------------------- Finish: the export, and the ledger to keep

/** What the export has chosen (not kept with the shot): the container and the height (0 is the clip's own). */
bay.exporting = { format: "mp4", height: "0" };

/** The clip Finish works from, written as a file of the format asked, on this machine (free): a take of Finish. */
export async function exportClip({ format = bay.exporting.format, height = bay.exporting.height } = {}) {
  const shot = bay.shot;
  const stage = "finish";
  const input = shot && inputFor(shot.body, stage);
  if (!input) return toast("Bring a clip first.");
  if (bay.busy.has(`${shot.id}:${stage}`)) return toast("Finish is still working on the last one.");
  const mark = { label: "Exporting", progress: 0, cancel: null };
  setBusy(stage, mark, shot.id);
  const t0 = Date.now();
  try {
    const made = await editRun("convert", { video: input.media.file, format, quality: "high", height: String(height), fps: "0", codec: "h264" }, (p) => ((mark.progress = p), update()), (id) => (mark.cancel = () => editStop(id)));
    const media = pickMedia(made);
    if (!media) throw new Error("Nothing came back.");
    media.still = await editPreview("grade", { video: media.file, preset: "none" }, Math.min(0.5, (media.seconds || 1) / 2)).then((x) => x.url).catch(() => undefined);
    edit((b) => addTake(b, stage, { engine: "local:export", title: `Export ${format.toUpperCase()}${Number(height) ? ` ${height}p` : ""}`, mode: "local", media, from: input.from, fromTake: input.take, credits: 0, source: "local", seconds: (Date.now() - t0) / 1000, note: "Exported on this machine." }), shot);
    toast(`Exported as ${format.toUpperCase()}.`);
    return media;
  } catch (e) {
    if (!/^Stopped\.?$/.test(e.message)) toast(`Export: ${e.message}`, { tone: "crit" });
    return null;
  } finally {
    setBusy(stage, null, shot.id);
    flushShots();
  }
}

/** The ledger of the open shot as a text file, handed to the browser to save. */
export function downloadLedger() {
  if (!bay.shot) return;
  const url = URL.createObjectURL(new Blob([ledgerText(bay.shot.body, bay.shot.name)], { type: "text/plain" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: `${bay.shot.name.replace(/[^\w-]+/g, "-").toLowerCase() || "shot"}-ledger.txt` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ---------------------------------------------------------------- a run on Comfy Cloud

/**
 * Runs the open stage's chosen engine on the clip the stage works from, with the person's yes (the caller has asked: nothing here asks
 * again). What comes back is a take of the stage, marked when it is the first; a failure is a take too, with what Cloud said.
 */
export async function run(stage = bay.stage) {
  const shot = bay.shot;
  const eng = chosen(stage);
  if (!shot || !eng) return;
  const ps = problems(stage);
  if (blocked(ps)) return toast(ps.find((p) => p.level === "stop").text);
  if (bay.busy.has(`${shot.id}:${stage}`)) return toast("That stage is still working on the last run.");
  const f = bay.form[stage];
  const { input, seconds } = inputInfo(shot.body, stage);
  const credits = priceNow(stage);
  const mark = { label: eng.title, progress: 0, cancel: null };
  setBusy(stage, mark, shot.id);
  const t0 = Date.now();
  const base = { engine: eng.name, title: eng.title, mode: eng.mode, prompt: f.text, from: input?.from ?? "clip", fromTake: input?.take ?? "", source: eng.partner ? "partner" : "open", refs: f.refs };
  try {
    const api2 = await runnerOf();
    if (!api2) throw new Error("The template runner is not on this page yet.");
    const schema = (await api2.getTemplate(eng.name))?.schema;
    const { inputs, unmet } = fillSlots(schema, { video: input?.media, images: f.refs, text: f.text, special: eng.special, shape: { width: input?.media?.width, height: input?.media?.height, seconds } });
    if (unmet.images) throw new Error(`${eng.title} needs ${unmet.images} more ${unmet.images === 1 ? "picture" : "pictures"}.`);
    const job = { onCancel: null };
    mark.cancel = () => job.onCancel?.();
    const made = await api2.execTemplate(eng.name, inputs, { setProgress: (p) => ((mark.progress = Math.max(mark.progress, Math.min(1, Number(p) || 0))), update()), queued: job, label: `${eng.title} · ${stage}`, confirmed: true });
    const media = pickMedia(made);
    if (!media) throw new Error("Nothing came back.");
    if (media.kind === "video" && media.file) media.still = await editPreview("grade", { video: media.file, preset: "none" }, Math.min(0.5, (media.seconds || 1) / 2)).then((x) => x.url).catch(() => undefined);
    edit((b) => addTake(b, stage, { ...base, media, credits: typeof credits === "number" ? credits : 0, seconds: (Date.now() - t0) / 1000 }), shot);
    return media;
  } catch (e) {
    if (!/^Stopped\.?$|^Canceled\.?$/.test(e.message)) {
      edit((b) => addTake(b, stage, { ...base, state: "failed", media: null, credits: 0, seconds: (Date.now() - t0) / 1000, note: e.message.slice(0, 280) }), shot);
      toast(`${eng.title}: ${e.message}`, { tone: "crit" });
    }
    return null;
  } finally {
    setBusy(stage, null, shot.id);
    flushShots();
  }
}

export function stopRun(stage = bay.stage) {
  workingOn(stage)?.cancel?.();
}

// ---------------------------------------------------------------- takes

export const mark = (stage, id) => edit((b) => markTake(b, stage, id));
export const drop = (stage, id) => edit((b) => removeTake(b, stage, id));

/** What the viewer shows: the media of a side of the wipe ("clip", or { stage, id }). */
export function mediaOfSide(side, b = bay.shot?.body) {
  if (!b) return null;
  if (side === "clip" || !side) return b.clip?.media ?? null;
  const t = b.stages[side.stage]?.takes.find((x) => x.id === side.id);
  return t?.media ?? null;
}
/** Shows a take on the right of the wipe (the clip is on the left). */
export function showTake(stage, id) {
  bay.wipe = { a: bay.wipe.a, b: { stage, id } };
  update();
}
export function setWipeSide(which, side) {
  bay.wipe = { ...bay.wipe, [which]: side };
  update();
}

export { ENGINES, STAGE_IDS, engineOf, passOf, inputFor, inputInfo, mediaOf };

// ---------------------------------------------------------------- hand-over from another product

const PENDING = "comfyture.spice.pending";
/** A clip sent to Spice from another product (Utensils' VFX: "Open in Spice") becomes the footage of a new shot, once. */
export async function takePending() {
  let p = null;
  try {
    p = JSON.parse(sessionStorage.getItem(PENDING) || "null");
    sessionStorage.removeItem(PENDING);
  } catch {}
  if (!p?.media?.file) return;
  if (p.media.kind === "image") return toast("Spice edits clips; a picture goes to Utensils.");
  await loadBays();
  const shot = await newShot(p.name ? String(p.name).slice(0, 40) : undefined);
  const m = p.media;
  const media = { kind: "video", url: m.url, file: m.file, width: m.width, height: m.height, seconds: m.seconds ?? m.duration };
  edit((b) => {
    b.clip = { media, fps: 24, name: p.name ?? "From Utensils", at: new Date().toISOString() };
  }, shot);
}
/** A clip of the library sent to Spice from another product; Spice opens on it. */
export function sendToSpice(media, name) {
  if (media?.file) {
    try {
      sessionStorage.setItem(PENDING, JSON.stringify({ media, name }));
    } catch {}
  }
  location.hash = "#/spice";
}
export const hasPending = () => {
  try {
    return !!sessionStorage.getItem(PENDING);
  } catch {
    return false;
  }
};
