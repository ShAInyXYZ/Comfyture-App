// App state: the shot being edited (the draft), the library and the takes.
// Panels call actions and re-render when changed(scope) fires.

import { api, subscribe } from "./api.js";
import { normalize } from "./photo.js";
import { emptyShot, PANELS, finalPrompt } from "./script.js";
import { view } from "./viewer.js";
import { go, currentPage } from "./router.js";
import { stageReady } from "./control/link.js";

const KEY = "comfyture.draft.v2";
const TABS = "comfyture.tabs.v1";

function freshDraft() {
  return {
    name: "Untitled shot",
    preset: null,
    script: { shots: [emptyShot()], raw: "" },
    shot: 0,
    view: "script",
    start: null,
    end: null,
    paint: "",
    keyframes: [],
    refs: { cast: null, prop: null, location: null },
    refText: { cast: "", prop: "", location: "" },
    audio: null,
    seconds: 5,
    aspect: "auto",
    quality: "standard",
    takes: 1,
    seed: 4127,
    lockSeed: false,
    enhance: false,
    review: true,
    startMode: "photo",
    video: null,
  };
}

function loadDraft() {
  try {
    return { ...freshDraft(), ...JSON.parse(localStorage.getItem(KEY)) };
  } catch {
    return freshDraft();
  }
}

/** The tabs: the Draft (your own inputs) plus any takes you opened, each with its own working copy. */
function loadTabs() {
  try {
    const saved = JSON.parse(localStorage.getItem(TABS));
    if (saved?.tabs?.length) {
      const tabs = saved.tabs.map((t) => ({ ...t, draft: { ...freshDraft(), ...t.draft } }));
      return { tabs, tab: tabs.some((t) => t.id === saved.tab) ? saved.tab : tabs[0].id };
    }
  } catch {
    // fall back to a single Draft tab
  }
  return { tabs: [{ id: "draft", run: null, draft: loadDraft() }], tab: "draft" };
}

let saveTimer;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(TABS, JSON.stringify({ tabs: state.tabs, tab: state.tab }));
    } catch {
      // storage can be unavailable; the tabs just won't survive a reload
    }
  }, 250);
}

const EDIT = "comfyture.edit.v1";

/** The film being edited: the clips in order, each trimmed to from..to seconds of its take (to: null is the whole take). */
function loadEdit() {
  try {
    const saved = JSON.parse(localStorage.getItem(EDIT));
    if (Array.isArray(saved?.clips)) return { clips: saved.clips, fade: saved.fade !== false, name: saved.name ?? "", exporting: false };
  } catch {
    // an empty edit is fine
  }
  return { clips: [], fade: true, name: "", exporting: false };
}

const CHAT = "comfyture.chat.v1";
function loadChat() {
  try {
    const saved = JSON.parse(localStorage.getItem(CHAT));
    if (Array.isArray(saved)) return { messages: saved.slice(-40), files: [] };
    if (saved?.messages) return { messages: saved.messages.slice(-40), files: saved.files ?? [] };
  } catch {
    // a new conversation
  }
  return { messages: [], files: [] };
}

const IMAGE = "comfyture.image.v1";
/** The Image window's choices, kept between visits: model, template, frame, size, count. */
function loadImage() {
  try {
    const saved = JSON.parse(localStorage.getItem(IMAGE)) ?? {};
    return { model: saved.model ?? null, template: saved.template ?? "generate", aspect: saved.aspect ?? "16:9", megapixels: saved.megapixels ?? 1, count: saved.count ?? 1, prompt: saved.prompt ?? "", loras: Array.isArray(saved.loras) ? saved.loras : [] };
  } catch {
    return { model: null, template: "generate", aspect: "16:9", megapixels: 1, count: 1, prompt: "", loras: [] };
  }
}

const opened = loadTabs();

export const state = {
  info: null,
  presets: [],
  samples: [],
  runs: [],
  /** Films cut from takes (Edit, the Director), newest first. */
  films: [],
  previews: new Map(),
  /** One job per input slot (start, end, cast, prop, location): painting, generating, editing or cutting out. */
  jobs: {},
  group: "camera",
  selected: null,
  ab: "a",
  tabs: opened.tabs,
  tab: opened.tab,
  draft: null,
  /** The assistant's conversation: {role, text, did?, error?}; busy while it thinks or works. */
  chat: { ...loadChat(), busy: null, attaching: 0 },
  // the assistant's conversation on the Stage, apart from the shot's
  stageChat: { messages: [], busy: null },
  /** The Edit page: the clips of the film being cut. */
  edit: loadEdit(),
  /** The image library, newest first. */
  photos: [],
  /**
   * The Image window: the models (official templates) and what you chose, the references you
   * gave it, and the pictures it made this visit (newest first).
   */
  image: { ...loadImage(), open: false, catalogue: null, seed: 0, lockSeed: false, refs: [], results: [], shown: null, enhancing: false, before: null },
  /** The Director: the idea, its plan, and how far making the film has got. */
  director: { phase: "idle", idea: "", shots: 4, seconds: 5, aspect: "16:9", fromPhoto: false, plan: null, shotsState: [], film: null, error: null },
};
state.draft = state.tabs.find((t) => t.id === state.tab).draft;
state.selected = state.tabs.find((t) => t.id === state.tab).run ?? null;

export const activeTab = () => state.tabs.find((t) => t.id === state.tab);

/** Promises waiting on a job or a take to finish, fed by the live events. */
const waiting = { job: new Map(), run: new Map() };
function waitFor(kind, id) {
  return new Promise((ok, no) => waiting[kind].set(id, (x) => {
    if (!["done", "failed", "canceled"].includes(x.status)) return;
    waiting[kind].delete(id);
    if (x.status === "done") ok(x);
    else no(new Error(x.status === "canceled" ? "Canceled." : x.error ?? "That didn't work."));
  }));
}

const listeners = new Set();
export const onChange = (fn) => listeners.add(fn);
export function changed(...scopes) {
  for (const fn of listeners) fn(new Set(scopes));
}

let toastTimer;
export function toast(text, { tone, action } = {}) {
  const el = document.getElementById("toast");
  el.replaceChildren(document.createTextNode(text));
  if (action) {
    const b = document.createElement("button");
    b.className = "key is-quiet";
    b.textContent = action.label;
    b.addEventListener("click", () => {
      el.hidden = true;
      action.run();
    });
    el.append(b);
  }
  el.dataset.tone = tone ?? "";
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), action ? 7000 : 4500);
}

const fail = (error) => toast(error.message ?? String(error), { tone: "crit" });

async function attempt(fn) {
  try {
    return await fn();
  } catch (error) {
    fail(error);
  }
}

export const draft = () => state.draft;
export const currentShot = () => state.draft.script.shots[state.draft.shot] ?? state.draft.script.shots[0];
export const presetById = (id) => state.presets.find((p) => p.id === id);

/** Edits the draft in place; the scope tells which panels to redraw. */
export function edit(fn, ...scopes) {
  fn(state.draft);
  persist();
  if (scopes.length) changed(...scopes);
}

// ---------------------------------------------------------------- loading

export async function load() {
  const [info, presets, samples, runs, films, photos] = await Promise.all([api.info(), api.presets(), api.samples(), api.runs(), api.films().catch(() => []), api.photos().catch(() => [])]);
  Object.assign(state, { info, presets, samples, runs, films, photos });
  const preset = presetById(state.draft.preset);
  state.group = preset?.category ?? "camera";
  if (!state.draft.preset && !state.draft.script.shots.some((s) => s.action) && presets[0]) {
    applyPreset(presets.find((p) => p.category === "camera") ?? presets[0], false);
  }
  changed("all");
  subscribe({
    run(run) {
      const i = state.runs.findIndex((r) => r.id === run.id);
      if (i >= 0) state.runs[i] = run;
      else state.runs.unshift(run);
      if (["done", "failed", "canceled"].includes(run.status)) state.previews.delete(run.id);
      waiting.run.get(run.id)?.(run);
      changed("takes", "tabs", state.selected === run.id ? "monitor" : "none");
    },
    removed(id) {
      state.runs = state.runs.filter((r) => r.id !== id);
      for (const t of state.tabs) if (t.run === id) t.run = null;
      if (state.selected === id) state.selected = null;
      persist();
      changed("takes", "monitor", "tabs");
    },
    preview({ id, image }) {
      state.previews.set(id, image);
      changed("preview");
    },
    paint(job) {
      waiting.job.get(job.id)?.(job);
      imageJob(job);
      const slot = Object.keys(state.jobs).find((k) => state.jobs[k].id === job.id);
      if (slot) jobDone(slot, job);
    },
    async resync() {
      state.runs = await api.runs();
      changed("takes");
    },
  });
}

// ---------------------------------------------------------------- presets

function applyPreset(preset, undoable = true) {
  const before = structuredClone(state.draft);
  edit((d) => {
    d.preset = preset.id;
    d.name = preset.name;
    d.script = structuredClone(preset.script);
    d.script.raw = "";
    d.shot = 0;
    d.paint = preset.end?.paint ?? "";
    d.end = null;
    if (preset.seconds) d.seconds = preset.seconds;
  });
  state.group = preset.category;
  changed("all");
  if (undoable) {
    toast(`Script set to ${preset.name}.`, {
      action: { label: "Undo", run: () => edit((d) => Object.assign(d, before), "all") },
    });
  }
}

export const loadPreset = (id) => {
  const preset = presetById(id);
  if (preset) applyPreset(preset);
};

export function setGroup(group) {
  state.group = group;
  changed("presets");
}

export const savePreset = (fields) =>
  attempt(async () => {
    const d = state.draft;
    const preset = await api.savePreset({
      ...fields,
      script: d.script,
      end: d.paint ? { paint: d.paint } : undefined,
      seconds: d.seconds,
    });
    state.presets = await api.presets();
    edit((x) => (x.preset = preset.id));
    state.group = preset.category;
    changed("presets");
    toast(`Saved preset ${preset.name}.`);
    return preset;
  });

// ---------------------------------------------------------------- sources

const upload = (file) => normalize(file).then((blob) => api.upload(blob, file.name));

export const setFrame = (slot, file) =>
  attempt(async () => {
    const photo = await upload(file);
    edit((d) => (d[slot] = photo), "sources", "monitor", "settings");
    if (slot === "end") state.ab = "b";
  });

export const useSample = (name) =>
  attempt(async () => {
    const photo = await api.sample(name);
    edit((d) => (d.start = photo), "sources", "monitor", "settings");
    state.ab = "a";
  });

export const clearFrame = (slot) => edit((d) => (d[slot] = null), "sources", "monitor", "settings");

export const addKeyframe = (file, time) =>
  attempt(async () => {
    const photo = await upload(file);
    edit((d) => {
      const t = Math.min(d.seconds - 0.2, Math.max(0.2, time ?? d.seconds / 2));
      d.keyframes.push({ photo, time: Math.round(t * 10) / 10, strength: 0.7 });
      d.keyframes.sort((a, b) => a.time - b.time);
    }, "sources", "monitor", "settings");
  });

const REF_SLOTS = new Set(["cast", "prop", "location"]);
const slotPhoto = (d, slot) => (REF_SLOTS.has(slot) ? d.refs?.[slot] : d[slot]);

function putPhoto(slot, photo) {
  edit((d) => {
    if (REF_SLOTS.has(slot)) d.refs = { ...d.refs, [slot]: photo };
    else d[slot] = photo;
  }, "sources", "settings", "script", "monitor");
  if (slot === "end") state.ab = "b";
}

// cast and props read best as clean cutouts on black; a location stays a whole picture
async function cutout(slot, photo) {
  state.jobs[slot] = { ...(await api.cutout({ source: photo.file })), kind: "cutout", source: photo.file, tab: state.tab };
  changed("sources");
}

/** A job on a slot reported back: progress, or the photo it made. */
function jobDone(slot, job) {
  const mine = state.jobs[slot];
  if (job.status === "running") {
    state.jobs[slot] = { ...mine, ...job };
    return changed("paint");
  }
  delete state.jobs[slot];
  const tab = state.tabs.find((t) => t.id === mine.tab);
  if (job.status === "failed") {
    changed("sources");
    return mine.kind === "cutout" ? toast("Couldn't cut that one out, so it's used as it is.") : fail(new Error(job.error ?? "That didn't work."));
  }
  if (!tab) return changed("sources");
  // a cutout or an edit only lands if the slot still holds the photo it started from
  if ((mine.kind === "cutout" || mine.kind === "edit") && slotPhoto(tab.draft, slot)?.file !== mine.source) return changed("sources");
  if (tab.id !== state.tab) {
    if (REF_SLOTS.has(slot)) tab.draft.refs = { ...tab.draft.refs, [slot]: job.photo };
    else tab.draft[slot] = job.photo;
    return persist();
  }
  if (mine.kind === "generate" && slot === "start") state.draft.startMode = "photo";
  putPhoto(slot, job.photo);
  if (mine.kind !== "cutout" && (slot === "cast" || slot === "prop")) cutout(slot, job.photo);
}

export const setRef = (slot, file) =>
  attempt(async () => {
    const photo = await upload(file);
    putPhoto(slot, photo);
    if (slot !== "location") await cutout(slot, photo);
  });

export const clearRef = (slot) => {
  delete state.jobs[slot];
  edit((d) => (d.refs = { ...d.refs, [slot]: null }), "sources", "settings", "script", "monitor");
};

/** A new image for a slot, from a description (Qwen Image 2.1). */
export const generateImage = (slot, prompt, aspect) =>
  attempt(async () => {
    if (!prompt.trim()) throw new Error("Describe the image first.");
    state.jobs[slot] = { ...(await api.generate({ prompt: prompt.trim(), aspect })), kind: "generate", tab: state.tab };
    changed("sources");
  });

/** Edits a slot's photo with an instruction ("make it night, add rain"); the result replaces it. */
export const editImage = (slot, instruction) =>
  attempt(async () => {
    const photo = slotPhoto(state.draft, slot);
    if (!photo) throw new Error("Add a photo first.");
    if (!instruction.trim()) throw new Error("Say how to change it.");
    state.jobs[slot] = { ...(await api.paint({ source: photo.file, instruction: instruction.trim() })), kind: "edit", source: photo.file, tab: state.tab };
    changed("sources");
  });

/** A video to start from: extend it, or copy its motion onto the start photo. */
export const setVideo = (file) =>
  attempt(async () => {
    if (!file.type.startsWith("video/")) throw new Error("That isn't a video.");
    toast("Preparing the video…");
    const video = await api.uploadVideo(file);
    edit((d) => {
      d.video = { ...video, name: file.name, mode: d.video?.mode ?? "extend", control: d.video?.control ?? "pose" };
      d.startMode = "video";
    }, "sources", "settings", "monitor");
  });

export const clearVideo = () => edit((d) => (d.video = null), "sources", "settings", "monitor");

export const hasRefs = (d = state.draft) => Object.values(d.refs ?? {}).some(Boolean);
/** Which reference slots hold an image, in sheet order. */
export const refPanels = (d = state.draft) => PANELS.filter((k) => d.refs?.[k]);
/** The sheet's panels and what the user said each one shows, for the prompt. */
export const refInfo = (d = state.draft) => ({ panels: refPanels(d), texts: Object.fromEntries(refPanels(d).map((k) => [k, d.refText?.[k]?.trim() ?? ""])) });

export const setAudio = (file) =>
  attempt(async () => {
    if (!file.type.startsWith("audio/") && !file.type.startsWith("video/")) throw new Error("Drop an audio file, or a video with sound.");
    const saved = await api.uploadAudio(file);
    const ctx = new AudioContext();
    const decoded = await ctx.decodeAudioData(await (await fetch(saved.url)).arrayBuffer());
    ctx.close();
    if (decoded.duration < 2) throw new Error("The track needs at least 2 seconds.");
    edit((d) => {
      d.audio = { ...saved, name: file.name, duration: Math.round(decoded.duration * 10) / 10, lipsync: d.audio?.lipsync ?? true };
      d.seconds = Math.max(2, Math.min(10, Math.floor(decoded.duration), d.seconds));
    }, "sources", "settings", "script", "monitor");
  });

export const clearAudio = () => edit((d) => (d.audio = null), "sources", "settings", "script", "monitor");

/** Lays the reference images out as one sheet on black, the way the reference model expects. */
/** The box around whatever isn't black, with a little room, for cutouts. */
function subjectBox(img) {
  const c = new OffscreenCanvas(img.width, img.height);
  const g = c.getContext("2d");
  g.drawImage(img, 0, 0);
  const { data } = g.getImageData(0, 0, img.width, img.height);
  let x0 = img.width, y0 = img.height, x1 = -1, y1 = -1;
  for (let y = 0; y < img.height; y += 2) {
    for (let x = 0; x < img.width; x += 2) {
      const i = (y * img.width + x) * 4;
      if (Math.max(data[i], data[i + 1], data[i + 2]) > 12) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return [0, 0, img.width, img.height];
  const pad = Math.round(Math.max(x1 - x0, y1 - y0) * 0.06);
  const bx = Math.max(0, x0 - pad), by = Math.max(0, y0 - pad);
  return [bx, by, Math.min(img.width, x1 + pad) - bx, Math.min(img.height, y1 + pad) - by];
}

async function composeSheet(refs) {
  const images = await Promise.all(
    ["cast", "prop", "location"].filter((k) => refs[k]).map((k) => new Promise((ok, no) => {
      const img = new Image();
      img.onload = () => ok(img);
      img.onerror = () => no(new Error("A reference image could not be read."));
      img.src = refs[k].url;
    })),
  );
  const W = 1536, H = 896, M = 24;
  const canvas = new OffscreenCanvas(W, H);
  const g = canvas.getContext("2d");
  g.fillStyle = "#000";
  g.fillRect(0, 0, W, H);
  const rects =
    images.length === 1 ? [[0, 0, W, H]]
    : images.length === 2 ? [[0, 0, W / 2, H], [W / 2, 0, W / 2, H]]
    : [[0, 0, W / 2, H], [W / 2, 0, W / 2, H / 2], [W / 2, H / 2, W / 2, H / 2]];
  const keys = ["cast", "prop", "location"].filter((k) => refs[k]);
  images.forEach((img, i) => {
    const [x, y, w, h] = rects[i];
    // a cutout fills its panel: the more room an element gets, the better it carries over
    const [sx, sy, sw, sh] = keys[i] === "location" ? [0, 0, img.width, img.height] : subjectBox(img);
    const scale = Math.min((w - 2 * M) / sw, (h - 2 * M) / sh);
    const dw = sw * scale, dh = sh * scale;
    g.drawImage(img, sx, sy, sw, sh, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  });
  return api.upload(await canvas.convertToBlob({ type: "image/png" }), "reference sheet");
}

export const paintEnd = () =>
  attempt(async () => {
    const d = state.draft;
    if (!d.start) throw new Error("Add a start frame to paint from.");
    if (!d.paint.trim()) throw new Error("Write the paint instruction first.");
    state.jobs.end = { ...(await api.paint({ source: d.start.file, instruction: d.paint })), kind: "paint", tab: state.tab };
    changed("sources");
  });

// ------------------------------------------------------------------ takes

export async function request(d = state.draft, tab = state.tab) {
  if (Object.values(state.jobs).some((j) => j.tab === tab)) throw new Error("Wait a moment: an input is still being made.");
  const video = d.startMode === "video" && d.video ? { file: d.video.file, mode: d.video.mode, control: d.video.control } : undefined;
  const sheet = hasRefs(d) ? await composeSheet(d.refs) : null;
  return {
    name: d.name,
    preset: d.preset ?? undefined,
    script: { shots: d.script.shots, raw: d.script.raw || undefined },
    start: video?.mode === "extend" ? undefined : d.start?.file,
    video,
    end: d.end ? { file: d.end.file } : d.paint.trim() ? { paint: d.paint.trim() } : undefined,
    keyframes: d.keyframes.map((k) => ({ file: k.photo.file, time: k.time, strength: k.strength })),
    audio: d.audio ? { file: d.audio.file, lipsync: d.audio.lipsync } : undefined,
    references: sheet ? { sheet: sheet.file, ...Object.fromEntries(refPanels(d).map((k) => [k, d.refs[k].file])), texts: refInfo(d).texts } : undefined,
    seconds: d.seconds,
    aspect: d.aspect,
    quality: d.quality,
    enhance: d.enhance,
    review: d.review,
    takes: d.takes,
    seed: d.lockSeed ? d.seed : undefined,
  };
}

export const roll = () =>
  attempt(async () => {
    const runs = await api.shoot(await request());
    if (runs[0]) showRun(runs[0].id);
    changed("takes", "monitor", "tabs");
    return runs;
  });

export const remix = (run) =>
  attempt(() => api.shoot({ ...run.request, end: run.request.end, takes: 1, seed: undefined }));

/** Everything a take was made with, as a draft. */
function draftFromRun(run) {
  const r = run.request;
  const photo = (file) => (file ? { file, url: `media/photos/${file}` } : null);
  return {
    ...freshDraft(),
    name: r.name,
    preset: r.preset ?? null,
    script: { shots: structuredClone(r.script.shots), raw: r.script.raw ?? "" },
    start: photo(r.start),
    end: photo(r.end?.file ?? run.frameFile),
    paint: r.end?.paint ?? "",
    keyframes: r.keyframes.map((k) => ({ photo: photo(k.file), time: k.time, strength: k.strength })),
    audio: r.audio ? { file: r.audio.file, url: `media/audio/${r.audio.file}`, name: "Track", lipsync: r.audio.lipsync, duration: r.seconds } : null,
    refs: r.references?.panels
      ? Object.fromEntries(PANELS.map((k) => [k, photo(r.references[k])]))
      : { cast: photo(r.references?.sheet), prop: null, location: null },
    refText: { cast: "", prop: "", location: "", ...r.references?.texts },
    video: r.video ? { ...r.video, url: `media/videos/${r.video.file}`, name: "Video" } : null,
    startMode: r.video ? "video" : "photo",
    seconds: r.seconds,
    aspect: r.aspect,
    quality: r.quality,
    enhance: r.enhance,
    review: r.review,
    seed: run.seed,
    lockSeed: true,
  };
}

/** Copies a take's inputs and settings into the Draft tab and goes there. */
export function useSettings(run) {
  const draft = state.tabs.find((t) => t.id === "draft");
  draft.draft = draftFromRun(run);
  switchTab("draft");
  toast(`The Draft now has the settings of ${run.request.name}, take ${run.take}.`);
}

// ---------------------------------------------------------------- tabs

/** Shows a take in the open tab (the tab follows the take it last rolled or opened). */
function showRun(id) {
  state.selected = id;
  activeTab().run = id;
  state.ab = "a";
  persist();
}

export function switchTab(id) {
  const tab = state.tabs.find((t) => t.id === id);
  if (!tab) return;
  state.tab = id;
  state.draft = tab.draft;
  state.selected = tab.run ?? null;
  state.ab = "a";
  state.group = presetById(tab.draft.preset)?.category ?? state.group;
  persist();
  changed("all");
}

/** Opens a take in its own tab, with the inputs that made it; a second click goes back to that tab. */
export function openTake(id) {
  const run = state.runs.find((r) => r.id === id);
  if (!run) return;
  const existing = state.tabs.find((t) => t.run === id && t.id !== "draft");
  if (existing) return switchTab(existing.id);
  const tab = { id: `take-${id}`, run: id, draft: draftFromRun(run) };
  const at = state.tabs.findIndex((t) => t.id === state.tab);
  state.tabs.splice(at + 1, 0, tab);
  switchTab(tab.id);
}

export function newTab() {
  const tab = { id: `shot-${Date.now().toString(36)}`, run: null, draft: { ...freshDraft(), name: "New shot" } };
  state.tabs.push(tab);
  switchTab(tab.id);
}

export function closeTab(id) {
  if (id === "draft") return;
  const i = state.tabs.findIndex((t) => t.id === id);
  if (i < 0) return;
  state.tabs.splice(i, 1);
  if (state.tab === id) switchTab(state.tabs[Math.max(0, i - 1)].id);
  else {
    persist();
    changed("tabs");
  }
}

/** Drag a tab before another one; the Draft stays first. */
export function moveTab(id, beforeId) {
  if (id === "draft" || id === beforeId) return;
  const from = state.tabs.findIndex((t) => t.id === id);
  const [tab] = state.tabs.splice(from, 1);
  let to = beforeId ? state.tabs.findIndex((t) => t.id === beforeId) : state.tabs.length;
  if (to <= 0) to = 1;
  state.tabs.splice(to, 0, tab);
  persist();
  changed("tabs");
}

/** The finished takes the tabs show, in tab order: what "Edit takes" sends to Edit. */
export const filmTakes = () =>
  state.tabs.map((t) => state.runs.find((r) => r.id === t.run)).filter((r) => r?.status === "done");

// ------------------------------------------------------------------ edit

let editTimer;
function saveEdit() {
  clearTimeout(editTimer);
  editTimer = setTimeout(() => {
    try {
      const { clips, fade, name } = state.edit;
      localStorage.setItem(EDIT, JSON.stringify({ clips, fade, name }));
    } catch {
      // the edit just won't survive a reload
    }
  }, 250);
}

export const setEdit = (patch) => {
  Object.assign(state.edit, patch);
  saveEdit();
  changed("edit");
};

/** How long a take is, in seconds. */
export const takeLength = (run) => run.length ?? run.request.seconds;

/** Adds finished takes to the end of the film being edited. */
export function addToEdit(...ids) {
  // in the order they were picked, not the order of the log
  const have = ids.map((id) => state.runs.find((r) => r.id === id)).filter((r) => r?.status === "done");
  if (!have.length) return toast("Pick finished takes to add.");
  state.edit.clips.push(...have.map((r) => ({ run: r.id, from: 0, to: null })));
  saveEdit();
  changed("edit");
  toast(`${have.length} take${have.length > 1 ? "s" : ""} added to Cut.`, { action: { label: "Open Cut", run: () => go("cut") } });
}

/** Starts the film from the takes the tabs show, in tab order, and opens Edit. */
export function editFromTabs() {
  const takes = filmTakes();
  if (!takes.length) return toast("Open finished takes in tabs first, then send them to Edit.");
  state.edit.clips = takes.map((r) => ({ run: r.id, from: 0, to: null }));
  saveEdit();
  changed("edit");
  go("cut");
}

export function removeClip(i) {
  state.edit.clips.splice(i, 1);
  saveEdit();
  changed("edit");
}

/** Moves clip `from` so it sits before the clip at `to` (the end when to is past the last one). */
export function moveClip(from, to) {
  const clips = state.edit.clips;
  if (from === to || from + 1 === to) return;
  const [clip] = clips.splice(from, 1);
  clips.splice(to > from ? to - 1 : to, 0, clip);
  saveEdit();
  changed("edit");
}

export function trimClip(i, patch) {
  Object.assign(state.edit.clips[i], patch);
  saveEdit();
}

export const clearEdit = () => {
  state.edit.clips = [];
  saveEdit();
  changed("edit");
};

/** Cuts the film: the trimmed clips in order, with a cut or a cross-dissolve between them. */
export const exportFilm = () =>
  attempt(async () => {
    const e = state.edit;
    const clips = e.clips.filter((c) => state.runs.find((r) => r.id === c.run && r.status === "done"));
    if (clips.length < 2) throw new Error("Add at least two finished takes to cut a film.");
    e.exporting = true;
    changed("edit");
    try {
      const film = await api.reel({ clips: clips.map((c) => ({ id: c.run, from: c.from, to: c.to ?? undefined })), transition: e.fade ? "fade" : "cut", name: e.name.trim() || undefined });
      addFilm(film);
      toast(`Film ready: ${film.takes.length} clips, ${film.seconds} s.`, { action: { label: "Open Library", run: () => go("library") } });
      return film;
    } finally {
      e.exporting = false;
      changed("edit");
    }
  });

function addFilm(film) {
  state.films = [film, ...state.films.filter((f) => f.id !== film.id)];
  changed("takes");
}

export const removeFilm = (id) =>
  attempt(async () => {
    await api.removeFilm(id);
    state.films = state.films.filter((f) => f.id !== id);
    changed("takes");
  });

/** The take's final frame, grabbed in the browser and saved as a photo. */
async function lastFrame(run) {
  const video = document.createElement("video");
  video.muted = true;
  video.preload = "auto";
  video.src = run.video;
  await new Promise((ok, no) => {
    video.onloadedmetadata = ok;
    video.onerror = () => no(new Error("The take's video could not be read."));
  });
  video.currentTime = Math.max(0, video.duration - 0.05);
  await new Promise((ok) => (video.onseeked = ok));
  const canvas = new OffscreenCanvas(video.videoWidth, video.videoHeight);
  canvas.getContext("2d").drawImage(video, 0, 0);
  return api.upload(await canvas.convertToBlob({ type: "image/png" }), `${run.request.name} last frame`);
}

/** Makes the take's last frame the open tab's start frame. */
export const useLastFrame = (run) =>
  attempt(async () => {
    const photo = await lastFrame(run);
    edit((d) => {
      d.start = photo;
      d.end = null;
      d.startMode = "photo";
    }, "sources", "monitor", "settings");
    state.ab = "a";
    toast("The take's last frame is now the start frame.");
  });

/**
 * The next shot of a film: a new tab right after the take, starting on its last
 * frame, with the same look, cast and settings. Only what happens is left to write.
 */
export const continueFrom = (run) =>
  attempt(async () => {
    const photo = await lastFrame(run);
    const base = draftFromRun(run);
    const last = base.script.shots.at(-1) ?? emptyShot();
    const tab = {
      id: `shot-${Date.now().toString(36)}`,
      run: null,
      draft: {
        ...base,
        name: `${run.request.name} · next`,
        script: { shots: [{ ...emptyShot(), camera: last.camera, cameraText: last.cameraText, framing: last.framing, sound: last.sound }], raw: "" },
        start: photo,
        end: null,
        paint: "",
        keyframes: [],
        audio: null,
        video: null,
        startMode: "photo",
        lockSeed: false,
      },
    };
    const from = state.tabs.findIndex((t) => t.run === run.id);
    state.tabs.splice((from >= 0 ? from : state.tabs.findIndex((t) => t.id === state.tab)) + 1, 0, tab);
    switchTab(tab.id);
    toast("A new shot that starts where this take ends. Write what happens next.");
  });

export const approve = (id) => attempt(() => api.approve(id));
export const reframe = (id, instruction) => attempt(() => api.reframe(id, instruction));
export const cancel = (id) => attempt(() => api.cancel(id));
export const remove = (id) => attempt(() => api.remove(id));

/** Keeps a take's picture and rolls a new sound for it, as a new take. */
export const newSound = (run, sound) =>
  attempt(async () => {
    await api.resound(run.id, sound);
    toast("Writing a new sound for the same picture.");
  });

/**
 * A 9:16 clip to post: the photo above the take (or the take alone when there is no
 * photo or it is already vertical), the shot's name on top, the take's own sound.
 * The text layer is drawn here so it uses the app's type; the server composes the rest.
 */
export const shareClip = (run) =>
  attempt(async () => {
    toast("Cutting a 9:16 clip to share…");
    const pair = !!(run.request.start ?? run.request.references?.sheet) && run.size.width >= run.size.height;
    await Promise.all(['500 84px "IBM Plex Mono"', '500 30px "IBM Plex Mono"'].map((f) => document.fonts.load(f)));
    const c = new OffscreenCanvas(1080, 1920);
    const g = c.getContext("2d");
    g.textAlign = "center";
    g.fillStyle = "#fafafa";
    g.font = '500 84px "IBM Plex Mono"';
    let name = run.request.name || "Untitled shot";
    while (g.measureText(name).width > 980 && name.length > 4) name = name.slice(0, -2).trimEnd() + "…";
    g.fillText(name, 540, pair ? 158 : 190);
    g.font = '500 30px "IBM Plex Mono"';
    const preset = state.presets.find((p) => p.id === run.request.preset);
    g.letterSpacing = "6px";
    g.fillStyle = "#f2ff59";
    g.fillText((preset ? preset.category : `take ${run.take}`).toUpperCase(), 540, pair ? 214 : 246);
    const tag = (text, y) => {
      g.font = '500 26px "IBM Plex Mono"';
      g.letterSpacing = "4px";
      const w = g.measureText(text).width + 28;
      g.fillStyle = "rgba(10, 10, 12, .55)";
      g.beginPath();
      g.roundRect(40, y, w, 46, 8);
      g.fill();
      g.fillStyle = "#ffffff";
      g.textAlign = "left";
      g.fillText(text, 54, y + 32);
      g.textAlign = "center";
    };
    if (pair) {
      tag(run.request.references ? "REFERENCES" : "PHOTO", 294);
      tag("SHOT", 1034);
    }
    g.font = '500 28px "IBM Plex Mono"';
    g.letterSpacing = "5px";
    g.fillStyle = "rgba(250, 250, 250, .8)";
    g.fillText("MADE WITH COMFYTURE · OPEN SOURCE ON COMFYUI", 540, 1850);
    const clip = await api.share(run.id, await c.convertToBlob({ type: "image/png" }));
    const file = `comfyture-${(run.request.name || "shot").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-take${run.take}-9x16.mp4`;
    toast("Clip ready.", { action: { label: "Download", run: () => (location.href = `${clip.url}?download=${file}`) } });
  });

/** Shows a take on the monitor of the open tab without opening a new one. */
export function select(id) {
  showRun(id);
  changed("takes", "monitor", "tabs");
}

// --------------------------------------------------------------- director

/**
 * The Director is a small harness on the desk: an idea becomes a shot list
 * (an LLM inside ComfyUI), every shot becomes a tab, each tab gets its first
 * frame (Qwen Image 2.1) and its take (LTX-2.5), and the takes are cut into
 * one film in tab order. Every step is an ordinary tab you can open and redo.
 */
export function setDirector(patch) {
  Object.assign(state.director, patch);
  changed("director");
}

export const planFilm = () =>
  attempt(async () => {
    const dir = state.director;
    if (!dir.idea.trim()) throw new Error("Say what the film is about.");
    setDirector({ phase: "planning", error: null, film: null });
    try {
      const plan = await api.director({
        idea: dir.idea.trim(),
        shots: dir.shots,
        seconds: dir.seconds,
        aspect: dir.aspect,
        photo: dir.fromPhoto ? state.draft.start?.file : undefined,
      });
      setDirector({ phase: "planned", plan, start: dir.fromPhoto ? state.draft.start : null, shotsState: plan.shots.map(() => ({ step: "waiting" })) });
    } catch (error) {
      setDirector({ phase: "idle" });
      throw error;
    }
  });

/** A tab's draft for one planned shot. */
function shotDraft(plan, shot) {
  return {
    ...freshDraft(),
    name: shot.name,
    script: { shots: [{ ...emptyShot(), action: shot.action, camera: shot.camera, framing: shot.framing, sound: shot.sound }], raw: "" },
    seconds: shot.seconds,
    aspect: state.director.aspect,
    review: false,
  };
}

/** Opens the plan as tabs, one per shot, after the open tab. */
function openPlan() {
  const { plan } = state.director;
  const stamp = Date.now().toString(36);
  const tabs = plan.shots.map((shot, i) => ({ id: `film-${stamp}-${i + 1}`, run: null, film: plan.title, draft: shotDraft(plan, shot) }));
  const at = state.tabs.findIndex((t) => t.id === state.tab);
  state.tabs.splice(at + 1, 0, ...tabs);
  persist();
  changed("tabs");
  return tabs;
}

export const openPlanAsTabs = () =>
  attempt(async () => {
    const tabs = openPlan();
    switchTab(tabs[0].id);
    setDirector({ phase: "idle" });
    toast(`${tabs.length} shots open as tabs. Give each a first frame and roll it.`);
  });

function shotState(i, patch) {
  state.director.shotsState[i] = { ...state.director.shotsState[i], ...patch };
  changed("director");
}

/** One shot of the Director's film: its first frame, then its take. Resolves to the finished take. */
async function filmShot(i) {
  const dir = state.director;
  const { plan } = dir;
  const shot = plan.shots[i];
  const tab = state.tabs.find((t) => t.id === dir.tabs[i]);
  try {
    if (!tab) throw new Error("Its tab was closed.");
    let photo = tab.draft.start ?? (i === 0 ? dir.start : null);
    if (!photo) {
      shotState(i, { step: "frame", error: null });
      const job = await api.generate({ prompt: [shot.frame, plan.look].filter(Boolean).join(" "), aspect: dir.aspect });
      photo = (await waitFor("job", job.id)).photo;
    }
    tab.draft.start = photo;
    tab.run = null;
    persist();
    changed("tabs", ...(tab.id === state.tab ? ["sources", "monitor", "settings"] : []));
    shotState(i, { step: "shot", photo, error: null });
    const [run] = await api.shoot({ ...(await request(tab.draft, tab.id)), takes: 1 });
    tab.run = run.id;
    persist();
    changed("tabs");
    const done = await waitFor("run", run.id);
    shotState(i, { step: "done", run: done.id });
    return done;
  } catch (error) {
    shotState(i, { step: "failed", error: error.message });
    throw error;
  }
}

/** Once no shot is still working: cut the film, or say which shots to roll again. */
async function settle() {
  const states = state.director.shotsState;
  if (states.some((s) => s.step === "frame" || s.step === "shot")) return;
  const failed = states.filter((s) => s.step === "failed").length;
  if (failed) {
    return setDirector({ phase: "partial", error: `${failed} shot${failed > 1 ? "s" : ""} didn't make it. Roll ${failed > 1 ? "them" : "it"} again; the film is cut when every shot is in.` });
  }
  const { plan } = state.director;
  setDirector({ phase: "cutting" });
  const film = await api.reel({ takes: states.map((s) => s.run), name: plan.title, transition: "cut" });
  addFilm(film);
  setDirector({ phase: "done", film });
  toast(`${plan.title}: ${states.length} shots cut into one film.`, {
    action: { label: "Download", run: () => (location.href = `${film.url}?download=comfyture-${plan.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.mp4`) },
  });
}

export const makeFilm = () =>
  attempt(async () => {
    const tabs = openPlan();
    setDirector({ phase: "making", error: null, film: null, tabs: tabs.map((t) => t.id), shotsState: state.director.plan.shots.map(() => ({ step: "waiting" })) });
    // every shot draws its first frame and rolls as soon as the frame is in; the server queues the work
    await Promise.allSettled(tabs.map((_, i) => filmShot(i)));
    await settle().catch((error) => setDirector({ phase: "partial", error: error.message }));
  });

/** Rolls the shots that failed again (a new seed; a first frame that was drawn is kept). */
export const rollMissing = () =>
  attempt(async () => {
    const missing = state.director.shotsState.map((s, i) => (s.step === "failed" ? i : -1)).filter((i) => i >= 0);
    if (!missing.length) return;
    setDirector({ phase: "making", error: null });
    await Promise.allSettled(missing.map((i) => filmShot(i)));
    await settle().catch((error) => setDirector({ phase: "partial", error: error.message }));
  });

// ---------------------------------------------------------------- library

export const loadPhotos = () =>
  attempt(async () => {
    state.photos = await api.photos().catch(() => []);
    changed("library");
  });

/** Makes a library image the open tab's start frame and goes to Create. */
export function useImage(photo) {
  edit((d) => {
    d.start = { file: photo.file, url: photo.url, width: photo.width, height: photo.height };
    d.end = null;
    d.startMode = "photo";
  }, "sources", "monitor", "settings");
  state.ab = "a";
  go("shot");
  toast("That image is the start frame now.");
}

// -------------------------------------------------------------- assistant

function saveChat() {
  try {
    localStorage.setItem(CHAT, JSON.stringify({ messages: state.chat.messages.slice(-40).map(({ undo, ...m }) => m), files: state.chat.files }));
  } catch {
    // the conversation just won't survive a reload
  }
}

const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const LABEL = { "push-in": "Push in", "pull-out": "Pull out", "crane-up": "Crane up", locked: "Locked", orbit: "Orbit", handheld: "Handheld" };
const clip = (t, n = 40) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

/** Which workflow the open tab will run, in a few words (the manual explains each). */
function madeAs(d) {
  if (d.startMode === "video" && d.video) return d.video.mode === "extend" ? "extending a video" : `copying a video's motion (${d.video.control})`;
  if (hasRefs(d)) return "references (Ingredients IC-LoRA, 768×448)";
  if (!d.start) return "the script alone (text to video)";
  if (d.end || d.paint.trim() || d.keyframes.length) return "a guided pass (start, keyframes, end)";
  if (d.quality === "production") return "production (keyframes, detail pass, 48 fps)";
  return d.quality === "draft" ? "a draft guided pass" : "two passes from the start photo";
}

/** Everything the assistant needs to know about the open tab, and what was made lately. */
function shotSummary() {
  const d = state.draft;
  const tab = activeTab();
  return {
    section: currentPage(),
    name: d.name,
    preset: d.preset ?? undefined,
    made: madeAs(d),
    startMode: d.startMode,
    start: d.start ? { width: d.start.width, height: d.start.height } : null,
    video: d.video ? { mode: d.video.mode, control: d.video.control, seconds: Math.round((d.video.duration ?? 0) * 10) / 10 } : null,
    end: d.end ? "an end frame image" : d.paint.trim() ? `painted from the start: ${d.paint.trim()}` : "",
    keyframes: d.keyframes.map((k) => k.time),
    references: Object.fromEntries(PANELS.map((k) => [k, d.refs?.[k] ? d.refText?.[k] ?? "" : null])),
    audio: d.audio ? { name: d.audio.name, seconds: d.audio.duration, lipsync: d.audio.lipsync } : null,
    shots: d.script.shots,
    current: d.shot,
    seconds: d.seconds,
    aspect: d.aspect,
    quality: d.quality,
    takes: d.takes,
    enhance: d.enhance,
    review: d.review,
    prompt: finalPrompt(d.script, { lipsync: !!d.audio?.lipsync, references: refInfo(d) }),
    recent: state.runs.slice(0, 5).map((r) => ({ name: r.request.name, status: r.status, seconds: r.length ?? r.request.seconds, error: r.error, here: r.id === tab?.run })),
    library: { takes: state.runs.length, films: state.films.length },
  };
}

/** Waits until no job is working on a slot (a generated cast or prop is cut out right after). */
async function settled(slot) {
  for (let quiet = 0, i = 0; quiet < 2 && i < 720; i++) {
    await sleep(500);
    quiet = state.jobs[slot] ? 0 : quiet + 1;
  }
}

/** Applies the assistant's actions to the open tab, in order, and says what changed. */
async function perform(actions) {
  const did = [];
  // a next shot opens first, so every change lands in it; rolling waits for everything else
  const ordered = [...actions.filter((a) => a.do === "next"), ...actions.filter((a) => a.do !== "roll" && a.do !== "next"), ...actions.filter((a) => a.do === "roll")];
  for (const a of ordered) {
    if (a.do === "preset") {
      const preset = presetById(a.id);
      if (!preset) continue;
      applyPreset(preset, false);
      did.push(`Preset · ${preset.name}`);
    } else if (a.do === "script") {
      edit(() => {
        const shot = currentShot();
        if (a.action) shot.action = a.action;
        if (a.camera) Object.assign(shot, { camera: a.camera, cameraText: "" });
        if (a.framing) shot.framing = a.framing;
        if (a.sound) shot.sound = a.sound;
        if (a.dialogue) shot.dialogue = a.dialogue;
      }, "script", "monitor", "settings");
      if (a.action) did.push("Action");
      if (a.camera) did.push(`Camera · ${LABEL[a.camera] ?? a.camera}`);
      if (a.framing) did.push(`Ends on ${clip(a.framing, 28)}`);
      if (a.sound) did.push("Sound");
      if (a.dialogue) did.push(a.dialogue.length ? `Dialogue · ${a.dialogue.length} line${a.dialogue.length > 1 ? "s" : ""}` : "No dialogue");
    } else if (a.do === "settings") {
      // only what actually changes is applied, and listed
      const d0 = state.draft;
      for (const k of Object.keys(a)) if (k !== "do" && d0[k] === a[k]) delete a[k];
      if (Object.keys(a).length === 1) continue;
      edit((d) => Object.assign(d, Object.fromEntries(Object.entries(a).filter(([k]) => k !== "do"))), "settings", "monitor", "script");
      if (a.seconds) did.push(`${a.seconds} s`);
      if (a.aspect) did.push(a.aspect === "auto" ? "Frame · auto" : a.aspect);
      if (a.quality) did.push(a.quality[0].toUpperCase() + a.quality.slice(1));
      if (a.takes) did.push(`${a.takes} take${a.takes > 1 ? "s" : ""}`);
      if (a.enhance !== undefined) did.push(`Prompt enhancer ${a.enhance ? "on" : "off"}`);
      if (a.review !== undefined) did.push(a.review ? "Stops at the painted frame" : "Doesn't stop at the painted frame");
    } else if (a.do === "name") {
      edit((d) => (d.name = a.name), "script", "tabs");
      did.push(`Named “${clip(a.name, 30)}”`);
    } else if (a.do === "paint") {
      edit((d) => {
        d.paint = a.instruction;
        d.end = null;
      }, "sources", "settings", "monitor");
      did.push(`Last frame · ${clip(a.instruction, 34)}`);
    } else if (a.do === "use") {
      const f = state.chat.files.find((x) => x.name === a.name);
      if (!f) continue;
      const photo = f.kind === "image" ? { file: f.file, url: f.url, width: f.width, height: f.height } : null;
      if (photo && a.as === "start") edit((d) => ((d.start = photo), (d.startMode = "photo")), "sources", "monitor", "settings");
      else if (photo && a.as === "end") edit((d) => (d.end = photo), "sources", "monitor", "settings");
      else if (photo && a.as === "keyframe") {
        edit((d) => {
          const t = Math.min(d.seconds - 0.2, Math.max(0.2, a.time ?? d.seconds / 2));
          d.keyframes.push({ photo, time: Math.round(t * 10) / 10, strength: 0.7 });
          d.keyframes.sort((x, y) => x.time - y.time);
        }, "sources", "monitor", "settings");
      } else if (photo && ["cast", "prop", "location"].includes(a.as)) {
        putPhoto(a.as, photo);
        if (a.as !== "location") await cutout(a.as, photo);
        if (a.words) edit((d) => (d.refText = { ...d.refText, [a.as]: a.words }), "sources", "script");
        await settled(a.as);
      } else if (f.kind === "video" && a.as === "video") {
        if (!f.file) {
          state.chat.busy = `Preparing @${f.name}…`;
          changed("assistant");
          Object.assign(f, await api.videoFrom(f.run ? { run: f.run } : { film: f.film }));
          saveChat();
        }
        edit((d) => {
          d.video = { file: f.file, url: f.url, width: f.width, height: f.height, frames: f.frames, duration: f.duration, name: f.title, mode: a.mode ?? d.video?.mode ?? "extend", control: a.control ?? "pose" };
          d.startMode = "video";
        }, "sources", "settings", "monitor");
      } else if (f.kind === "audio" && a.as === "sound") {
        edit((d) => {
          d.audio = { file: f.file, url: f.url, name: f.title, duration: f.duration, lipsync: d.audio?.lipsync ?? true };
          d.seconds = Math.max(2, Math.min(10, Math.floor(f.duration), d.seconds));
        }, "sources", "settings", "script", "monitor");
      } else continue;
      did.push(`@${f.name} → ${{ start: "start", end: "end frame", keyframe: "keyframe", cast: "cast", prop: "prop", location: "place", video: "start video", sound: "sound" }[a.as]}`);
    } else if (a.do === "shots") {
      edit((d) => {
        d.script = { shots: a.shots.map((x, i) => ({ ...emptyShot(), ...x, transition: i ? x.transition ?? "hard-cut" : "hard-cut" })), raw: "" };
        d.shot = 0;
      }, "script", "monitor", "settings");
      did.push(`Script · ${a.shots.length} shot${a.shots.length > 1 ? "s" : ""}`);
    } else if (a.do === "edit_start") {
      if (!state.draft.start) continue;
      state.chat.busy = "Editing the start photo…";
      changed("assistant");
      await editImage("start", a.instruction);
      await settled("start");
      did.push(`Start photo · ${clip(a.instruction, 30)}`);
    } else if (a.do === "reference" && actions.some((x) => x.do === "use" && x.as === a.slot)) {
      if (a.words) edit((d) => (d.refText = { ...d.refText, [a.slot]: a.words }), "sources", "script");
    } else if (a.do === "reference") {
      if (a.words) edit((d) => (d.refText = { ...d.refText, [a.slot]: a.words }), "sources", "script");
      if (a.prompt) {
        state.chat.busy = `Drawing the ${a.slot === "location" ? "place" : a.slot}…`;
        changed("assistant");
        await generateImage(a.slot, a.prompt, a.slot === "location" ? "16:9" : "1:1");
        await settled(a.slot);
      }
      did.push(`${a.slot === "location" ? "Place" : a.slot[0].toUpperCase() + a.slot.slice(1)}${a.words ? ` · ${clip(a.words, 26)}` : ""}`);
    } else if (a.do === "video") {
      if (!state.draft.video) continue;
      edit((d) => {
        d.startMode = "video";
        if (a.mode) d.video.mode = a.mode;
        if (a.control) d.video.control = a.control;
      }, "sources", "settings", "monitor");
      did.push(a.mode === "motion" || (!a.mode && state.draft.video.mode === "motion") ? `Copy motion · ${state.draft.video.control === "pose" ? "body and face" : "edges"}` : "Extend the clip");
    } else if (a.do === "lipsync") {
      if (!state.draft.audio) continue;
      edit((d) => (d.audio.lipsync = a.on), "sources", "script");
      did.push(`Lip sync ${a.on ? "on" : "off"}`);
    } else if (a.do === "clear") {
      const d0 = state.draft;
      const has = { end: d0.end || d0.paint.trim(), keyframes: d0.keyframes.length, references: hasRefs(d0), sound: d0.audio, video: d0.video }[a.what];
      if (!has) continue;
      const what = { end: "End frame", keyframes: "Keyframes", references: "References", sound: "Sound track", video: "Video" }[a.what];
      if (a.what === "end") edit((d) => ((d.end = null), (d.paint = "")), "sources", "monitor", "settings");
      if (a.what === "keyframes") edit((d) => (d.keyframes = []), "sources", "monitor", "settings");
      if (a.what === "references") PANELS.forEach((k) => clearRef(k));
      if (a.what === "sound") clearAudio();
      if (a.what === "video") clearVideo();
      did.push(`Removed ${what.toLowerCase()}`);
    } else if (a.do === "next") {
      const tab = activeTab();
      const named = a.from && state.chat.files.find((x) => x.name === a.from && x.run);
      const from = (named && state.runs.find((r) => r.id === named.run)) ?? state.runs.find((r) => r.id === tab?.run && r.status === "done") ?? state.runs.find((r) => r.status === "done");
      if (!from) continue;
      state.chat.busy = "Opening the next shot…";
      changed("assistant");
      await continueFrom(from);
      did.push(`Next shot after ${clip(from.request.name, 24)}`);
    } else if (a.do === "start") {
      state.chat.busy = "Drawing the start photo…";
      changed("assistant");
      await generateImage("start", a.prompt, a.aspect);
      for (let i = 0; i < 600 && state.jobs.start; i++) await sleep(500);
      if (state.draft.start) did.push("New start photo");
    } else if (a.do === "roll") {
      state.chat.busy = "Rolling…";
      changed("assistant");
      const runs = await roll();
      if (runs !== undefined) did.push(`Rolling ${state.draft.takes} take${state.draft.takes > 1 ? "s" : ""}`);
    }
  }
  return did;
}

// ---- the conversation's files: attached once, used by name (@name) in any message

const KINDS = [["image", /^image\//], ["video", /^video\//], ["audio", /^audio\//], ["text", /^text\/|json$|markdown$/]];
const kindOf = (file) => KINDS.find(([, re]) => re.test(file.type))?.[0] ?? (/\.(md|txt|json|csv)$/i.test(file.name) ? "text" : null);

/** A short, unique @name from a file name: "Chef Portrait (2).jpg" becomes chef-portrait. */
function nameFor(file) {
  const base = file.name.replace(/\.[^.]+$/, "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "file";
  const taken = new Set(state.chat.files.map((f) => f.name));
  let name = base;
  for (let i = 2; taken.has(name); i++) name = `${base}-${i}`;
  return name;
}

/** Attaches images, videos, sounds or text files to the conversation. */
export const attach = (files) =>
  attempt(async () => {
    for (const file of files) {
      const kind = kindOf(file);
      if (!kind) {
        toast(`${file.name} can't be used here: attach images, videos, sounds or text.`);
        continue;
      }
      state.chat.attaching++;
      changed("assistant");
      try {
        const name = nameFor(file);
        let item;
        if (kind === "image") item = { ...(await upload(file)) };
        else if (kind === "video") item = { ...(await api.uploadVideo(file)) };
        else if (kind === "audio") {
          const saved = await api.uploadAudio(file);
          const ctx = new AudioContext();
          const decoded = await ctx.decodeAudioData(await (await fetch(saved.url)).arrayBuffer());
          ctx.close();
          item = { ...saved, duration: Math.round(decoded.duration * 10) / 10 };
        } else item = { text: (await file.text()).slice(0, 6000) };
        state.chat.files.push({ ...item, name, kind, title: file.name });
        saveChat();
      } finally {
        state.chat.attaching--;
        changed("assistant");
      }
    }
  });

export function detach(name) {
  state.chat.files = state.chat.files.filter((f) => f.name !== name);
  saveChat();
  changed("assistant");
}

const slugOf = (t) => t.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "take";

/**
 * Everything @ can name: the conversation's files first, then the Library's finished takes, films
 * and images. Library names are stable: a take is its name, with part of its id when names repeat.
 */
export function mentionables() {
  const out = state.chat.files.map((f) => ({ ...f, source: f.source ?? "attached" }));
  const taken = new Set(out.map((f) => f.name));
  const held = new Set(out.map((f) => f.run ?? f.film ?? f.file));
  const group = (items, base, id) => {
    const count = {};
    for (const it of items) count[base(it)] = (count[base(it)] ?? 0) + 1;
    return items.map((it) => {
      let name = count[base(it)] > 1 ? `${base(it)}-${id(it).slice(-4)}` : base(it);
      while (taken.has(name)) name = `${name}-${id(it).slice(-2)}`;
      taken.add(name);
      return name;
    });
  };
  const library = [];
  const takes = state.runs.filter((r) => r.status === "done" && !held.has(r.id));
  group(takes, (r) => slugOf(r.request.name), (r) => r.id).forEach((name, i) => {
    const r = takes[i];
    library.push({ name, kind: "video", source: "take", run: r.id, url: r.video, width: r.size.width, height: r.size.height, duration: r.length ?? r.request.seconds, title: r.request.name, date: r.createdAt });
  });
  const films = state.films.filter((f) => !held.has(f.id));
  group(films, (f) => slugOf(f.name), (f) => f.id).forEach((name, i) => {
    const f = films[i];
    library.push({ name, kind: "video", source: "film", film: f.id, url: f.url, duration: f.seconds, title: f.name, date: f.createdAt });
  });
  // images go by the name the Library knows them by; @img-… only when it knows none
  for (const p of state.photos.filter((p) => !held.has(p.file))) {
    const base = p.name ? slugOf(p.name) : `img-${p.file.slice(0, 4)}`;
    let name = base;
    for (let i = 4; taken.has(name); i += 2) name = `${base}-${p.file.slice(0, i)}`;
    taken.add(name);
    library.push({ name, kind: "image", source: "image", file: p.file, url: p.url, width: p.width, height: p.height, title: p.name ?? "Library image", date: p.createdAt });
  }
  // presets are JSON the assistant can read: their script, length and paint
  for (const p of state.presets) {
    const name = `preset-${p.id}`;
    if (taken.has(name) || held.has(name)) continue;
    taken.add(name);
    const { id, name: title, category, blurb, seconds, script, end } = p;
    library.push({ name, kind: "text", source: "preset", title, poster: p.poster, text: JSON.stringify({ id, name: title, category, blurb, seconds, script, end }), date: "" });
  }
  // the Library mixed by date, newest first, so images and videos sit together
  library.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  return [...out, ...library];
}

/** A Library item named with @ joins the conversation's files, so it can be seen and placed. */
export function adopt(name) {
  if (state.chat.files.some((f) => f.name === name)) return;
  const item = mentionables().find((f) => f.name === name);
  if (!item) return;
  state.chat.files.push(item);
  saveChat();
  changed("assistant");
}

/** The @names a text mentions that @ can name (attached or in the Library). */
export const mentions = (text) => {
  const names = new Set(mentionables().map((f) => f.name));
  return [...new Set([...text.matchAll(/@([a-z0-9][a-z0-9-]*)/gi)].map((m) => m[1].toLowerCase()))].filter((n) => names.has(n));
};

/**
 * The assistant sees one picture: the images a message mentions (or the latest attached ones),
 * laid out on a sheet with their @names, so it can tell which is which.
 */
async function sheetOf(images) {
  const cells = images.slice(0, 4);
  const loaded = await Promise.all(cells.map((f) => new Promise((ok, no) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => no(new Error(`@${f.name} could not be read.`));
    img.src = f.url;
  })));
  const W = 1536, H = cells.length === 1 ? 1024 : 1152;
  const cols = cells.length === 1 ? 1 : 2, rows = cells.length > 2 ? 2 : 1;
  const cw = W / cols, ch = H / rows;
  const canvas = new OffscreenCanvas(W, H);
  const g = canvas.getContext("2d");
  g.fillStyle = "#000";
  g.fillRect(0, 0, W, H);
  loaded.forEach((img, i) => {
    const x = (i % cols) * cw, y = Math.floor(i / cols) * ch;
    const s = Math.min((cw - 24) / img.width, (ch - 72) / img.height);
    g.drawImage(img, x + (cw - img.width * s) / 2, y + 60 + (ch - 72 - img.height * s) / 2, img.width * s, img.height * s);
    g.fillStyle = "#f2ff59";
    g.font = '600 40px "IBM Plex Mono", monospace';
    g.fillText(`@${cells[i].name}`, x + 16, y + 44);
  });
  return api.upload(await canvas.convertToBlob({ type: "image/png" }), "assistant sheet");
}

const SPOTS = { 1: ["the whole picture"], 2: ["left", "right"], 3: ["top left", "top right", "bottom left"], 4: ["top left", "top right", "bottom left", "bottom right"] };

/** Sends a message to the assistant; its answer sets up the shot (and rolls it, if you asked). */
export async function ask(text) {
  const words = text.trim();
  if (!words || state.chat.busy) return;
  const chat = state.chat;
  const named = mentions(words);
  // a Library item typed out by name joins the conversation like a picked one
  named.forEach(adopt);
  chat.messages.push({ role: "user", text: words, files: named });
  chat.busy = "Thinking…";
  saveChat();
  changed("assistant");
  try {
    // the picture it sees: the images you named, else the latest ones you attached, else the start photo
    const images = chat.files.filter((f) => f.kind === "image");
    const shown = named.length ? images.filter((f) => named.includes(f.name)) : images.slice(-2);
    const sheet = shown.length ? await sheetOf(shown) : null;
    const spots = SPOTS[Math.min(4, shown.length)] ?? [];
    const answer = await api.assistant({
      messages: chat.messages.filter((m) => !m.error).map((m) => ({ role: m.role, text: m.text, did: m.did })),
      shot: shotSummary(),
      photo: sheet?.file ?? state.draft.start?.file,
      sees: sheet ? `a sheet of the user's images: ${shown.map((f, i) => `@${f.name} ${spots[i]}`).join(", ")}` : state.draft.start ? "the start photo" : "",
      files: chat.files.map((f) => ({
        name: f.name,
        kind: f.kind,
        width: f.width,
        height: f.height,
        seconds: f.duration,
        text: f.kind === "text" ? f.text : undefined,
        source: f.source ?? "attached",
        mentioned: named.includes(f.name),
      })),
    });
    const before = structuredClone(state.draft);
    const message = { role: "assistant", text: answer.reply, did: [] };
    chat.messages.push(message);
    changed("assistant");
    message.did = await perform(answer.actions);
    // what it changed can be put back, except a take that already rolls
    if (message.did.length) message.undo = before;
  } catch (error) {
    chat.messages.push({ role: "assistant", text: error.message ?? String(error), error: true });
  } finally {
    chat.busy = null;
    saveChat();
    changed("assistant");
  }
}

export function undoAssistant(message) {
  if (!message.undo) return;
  const before = message.undo;
  delete message.undo;
  edit((d) => Object.assign(d, before), "all");
  message.did = [...message.did, "Undone"];
  saveChat();
  changed("assistant");
}

export function clearChat() {
  if (currentPage() === "stage") {
    state.stageChat.messages = [];
    return changed("assistant");
  }
  state.chat.messages = [];
  state.chat.files = [];
  saveChat();
  changed("assistant");
}

// -------------------------------------------------------------- the assistant on the Stage

/** Asks the assistant to stage something: it answers with Control commands, run on the stage. */
export async function askStage(text) {
  const words = text.trim();
  const chat = state.stageChat;
  if (!words || chat.busy) return;
  chat.messages.push({ role: "user", text: words });
  chat.busy = "Staging";
  changed("assistant");
  try {
    const [{ stageAssist }, api] = await Promise.all([import("./control/assist.js"), stageReady]);
    chat.messages.push(adoptRenders(await stageAssist(api, chat.messages, (busy) => ((chat.busy = busy), changed("assistant")))));
  } catch (error) {
    chat.messages.push({ role: "assistant", stage: true, text: error.message ?? String(error), error: true });
  } finally {
    chat.busy = null;
    changed("assistant");
  }
}

/**
 * The pictures an answer started become the Image window's results too, so they fill in as
 * they render; the message keeps their ids.
 */
function adoptRenders(message) {
  const renders = message.renders ?? [];
  message.renders = renders.flatMap((r) => r.jobs.map((j) => j.id));
  for (const r of renders) {
    state.image.results.unshift(...r.jobs.map((j) => ({ id: j.id, status: "running", progress: 0, prompt: r.look || r.prompt, label: "Stage render", aspect: r.aspect })));
  }
  if (renders.length) changed("image");
  return message;
}

/** A finished picture of the Stage's frame, in the look the words describe, in the Stage's conversation. */
export async function renderStageImage(words = "") {
  const look = words.trim();
  const chat = state.stageChat;
  if (chat.busy) return;
  chat.messages.push({ role: "user", text: look ? `Render it: ${look}` : "Render the frame as an image." });
  chat.busy = "Rendering";
  changed("assistant");
  try {
    const { ops } = await stageReady;
    const render = await ops.render_image({ prompt: look });
    chat.messages.push(adoptRenders({ role: "assistant", stage: true, text: look ? "Rendering the frame in that look." : "Rendering the frame as a film still. Type a look first to change it (a rainy night, a 90s sitcom, Pixar)…", did: ["Rendering an image"], renders: [render] }));
  } catch (error) {
    chat.messages.push({ role: "assistant", stage: true, text: error.message ?? String(error), error: true });
  } finally {
    chat.busy = null;
    changed("assistant");
  }
}

/** A picture rendered from the Stage starts a shot: it is the open tab's start frame. */
export const useStageRender = (photo) => placePhoto("start", photo);

/** Puts the stage back as it was before an answer (one step, or two when it mended itself). */
export async function undoStage(message) {
  if (!message.undo) return;
  const { stage } = await stageReady;
  for (let i = 0; i < (message.steps ?? 1); i++) stage.undo();
  message.undo = false;
  message.did = [...(message.did ?? []), "Undone"];
  changed("assistant");
}

/** A control video from the Stage becomes the shot's video: its motion drives the shot. */
export function useStageVideo(video, name, channel) {
  edit((d) => {
    // depth, pose and lines are already control passes; a clay render is read for its edges
    d.video = { ...video, name, mode: "motion", control: channel === "clay" ? "edges" : "ready" };
    d.startMode = "video";
  }, "sources", "settings", "monitor");
  go("shot");
  toast(`${name} drives the shot's motion. Add a start photo for the look, or let the script set it.`);
}

// -------------------------------------------------------------- the Image window

function saveImage() {
  const { model, template, aspect, megapixels, count, prompt, loras } = state.image;
  try {
    localStorage.setItem(IMAGE, JSON.stringify({ model, template, aspect, megapixels, count, prompt, loras }));
  } catch {
    // the choices just won't survive a reload
  }
}

/** The chosen model and template, falling back to what exists. */
export function imageChoice() {
  const im = state.image;
  const c = im.catalogue;
  if (!c) return null;
  const model = c.models.find((m) => m.id === im.model) ?? c.models.find((m) => m.id === c.default) ?? c.models[0];
  const template = model.templates.find((t) => t.id === im.template) ?? model.templates[0];
  // the LoRAs this model and template can load
  const loras = model.loras.filter((l) => !l.templates || l.templates.includes(template.id));
  return { model, template, takesRefs: template.refs > 0, loras };
}

/** Changes the window's choices; a reference given to a model that can take one picks its reference template. */
export function setImage(patch) {
  Object.assign(state.image, patch);
  const choice = imageChoice();
  if (choice) {
    state.image.model = choice.model.id;
    if (patch.model && state.image.refs.length && !choice.takesRefs) {
      const withRefs = choice.model.templates.find((t) => t.refs > 0);
      if (withRefs) state.image.template = withRefs.id;
    }
    if (!choice.model.templates.some((t) => t.id === state.image.template)) state.image.template = choice.model.templates[0].id;
    if (!choice.model.megapixels.includes(state.image.megapixels)) state.image.megapixels = choice.model.megapixels[0];
    // a LoRA only stays while the model and template can load it
    const fits = new Set(imageChoice().loras.map((l) => l.file));
    state.image.loras = state.image.loras.filter((l) => fits.has(l.file));
  }
  saveImage();
  changed("image");
}

/** Opens the window, with pictures to start from if any (an end frame starts from the start frame). */
export const openImage = ({ refs = [], template } = {}) =>
  attempt(async () => {
    const im = state.image;
    im.open = true;
    for (const r of refs) addImageRef(r);
    changed("image");
    if (!im.catalogue) im.catalogue = await api.imageModels();
    setImage(template ? { template } : {});
  });

/** Adds a LoRA (up to three), takes one away, or changes its strength. */
export function addImageLora(file) {
  const im = state.image;
  const l = imageChoice()?.loras.find((x) => x.file === file);
  if (!l || im.loras.length >= 3 || im.loras.some((x) => x.file === file)) return;
  setImage({ loras: [...im.loras, { file, strength: l.strength ?? 1 }] });
}
export const removeImageLora = (file) => setImage({ loras: state.image.loras.filter((l) => l.file !== file) });
export function setLoraStrength(file, strength) {
  setImage({ loras: state.image.loras.map((l) => (l.file === file ? { ...l, strength: Math.round(Math.min(2, Math.max(0, strength)) * 10) / 10 } : l)) });
}

/** What's typed in the window, kept as you type (no redraw). */
export function setImagePrompt(text) {
  state.image.prompt = text;
  state.image.before = null;
  saveImage();
}

export function closeImage() {
  state.image.open = false;
  changed("image");
}

/** A short @name for a reference, unique in the window and the Library. */
function refName(base) {
  const taken = new Set([...state.image.refs.map((r) => r.name)]);
  const slug = slugOf(base || "ref");
  let name = slug;
  for (let i = 2; taken.has(name); i++) name = `${slug}-${i}`;
  return name;
}

/** Adds a picture to the window's references: {file, url, width, height, name?}. */
export function addImageRef(photo) {
  const im = state.image;
  if (!photo?.file || im.refs.some((r) => r.file === photo.file)) return;
  const known = mentionables().find((f) => f.kind === "image" && f.file === photo.file);
  im.refs.push({ file: photo.file, url: photo.url, width: photo.width, height: photo.height, name: known?.name ?? refName(photo.name), title: photo.name ?? known?.title });
  const choice = imageChoice();
  if (choice && !choice.takesRefs) {
    const withRefs = choice.model.templates.find((t) => t.refs > 0);
    if (withRefs) im.template = withRefs.id;
  }
  changed("image");
}

export function removeImageRef(file) {
  state.image.refs = state.image.refs.filter((r) => r.file !== file);
  changed("image");
}

/** Pictures dropped, pasted or picked into the window become references. */
export const uploadImageRefs = (files) =>
  attempt(async () => {
    for (const file of files) {
      if (!file.type?.startsWith("image/")) continue;
      const photo = await upload(file);
      addImageRef({ ...photo, name: photo.name ?? file.name });
    }
  });

/** Images @ can name in the window: its references first, then the Library's pictures. */
export function imageMentionables() {
  const im = state.image;
  const held = new Set(im.refs.map((r) => r.file));
  return [...im.refs.map((r) => ({ ...r, kind: "image", source: "attached" })), ...mentionables().filter((f) => f.kind === "image" && !held.has(f.file))];
}

/** References in the order the prompt names them, then the others; only as many as the template takes. */
function orderedRefs() {
  const im = state.image;
  const named = [...im.prompt.matchAll(/@([a-z0-9][a-z0-9-]*)/gi)].map((m) => m[1].toLowerCase());
  const first = named.map((n) => im.refs.find((r) => r.name === n)).filter(Boolean);
  const rest = im.refs.filter((r) => !first.includes(r));
  return [...new Set([...first, ...rest])].slice(0, imageChoice()?.template.refs ?? 0);
}

function imageRequest() {
  const im = state.image;
  const { model, template } = imageChoice();
  return { model: model.id, template: template.id, prompt: im.prompt, aspect: im.aspect, refs: orderedRefs().map((r) => ({ file: r.file, name: r.name })), loras: im.loras };
}

/** Rewrites the prompt with the template's own enhancer; the words before can be put back. */
export const enhanceImage = () =>
  attempt(async () => {
    const im = state.image;
    if (!im.prompt.trim() || im.enhancing) return;
    im.enhancing = true;
    changed("image");
    try {
      const { prompt } = await api.enhanceImage(imageRequest());
      im.before = im.prompt;
      im.prompt = prompt;
      saveImage();
    } finally {
      im.enhancing = false;
      changed("image");
    }
  });

export function unenhanceImage() {
  const im = state.image;
  if (im.before === null) return;
  im.prompt = im.before;
  im.before = null;
  saveImage();
  changed("image");
}

/** Starts the pictures: one job each, shown in the window as they come in. */
export const generateImages = () =>
  attempt(async () => {
    const im = state.image;
    if (!im.prompt.trim()) throw new Error("Describe the picture first.");
    const choice = imageChoice();
    if (choice.takesRefs && !im.refs.length) throw new Error(`${choice.template.id === "style" ? "Style reference" : "Image edit"} works from a picture: add a reference, or pick Text to image.`);
    const seed = im.lockSeed ? im.seed : Math.floor(Math.random() * 2 ** 32);
    im.seed = seed;
    const jobs = await api.image({ ...imageRequest(), megapixels: im.megapixels, count: im.count, seed });
    const label = `${choice.model.name} · ${im.catalogue.templates[choice.template.id]?.name ?? choice.template.id}`;
    im.results.unshift(...jobs.map((j, i) => ({ id: j.id, status: "running", progress: 0, prompt: im.prompt, label, seed: seed + i, aspect: im.aspect })));
    im.shown = jobs[0]?.id ?? im.shown;
    changed("image");
  });

/** A paint event for one of the window's pictures. */
function imageJob(job) {
  const r = state.image.results.find((x) => x.id === job.id);
  if (!r) return;
  Object.assign(r, { status: job.status, progress: job.progress ?? r.progress, photo: job.photo ?? r.photo, error: job.error });
  if (job.status === "failed") toast(job.error ?? "That picture didn't work.", { tone: "crit" });
  if (job.status === "done") api.photos().then((photos) => ((state.photos = photos), changed("library"))).catch(() => {});
  changed("image");
  // a picture the Stage asked for fills in in its conversation, and in the stage's own pictures
  if (state.stageChat.messages.some((m) => m.renders?.includes(job.id))) changed("assistant");
  stageReady.then(({ stage }) => stage.runDone(job));
}

/**
 * Sends a picture to an input of the open tab: start, end, a keyframe at the middle of the shot,
 * cast, prop or place. Cast and props are cut out onto black, as when you drop one in.
 */
export function placePhoto(slot, photo) {
  const p = { file: photo.file, url: photo.url, width: photo.width, height: photo.height };
  if (slot === "keyframe") {
    edit((d) => {
      d.keyframes.push({ photo: p, time: Math.round(d.seconds * 5) / 10, strength: 0.7 });
      d.keyframes.sort((a, b) => a.time - b.time);
    }, "sources", "monitor", "settings");
    if (currentPage() !== "shot") go("shot");
    return toast("That picture is a keyframe now, in the middle of the shot.");
  }
  if (slot === "start") state.draft.startMode = "photo";
  putPhoto(slot, p);
  if (slot === "cast" || slot === "prop") attempt(() => cutout(slot, p));
  const where = { start: "the start frame", end: "the end frame", cast: "the cast", prop: "the prop", location: "the place" }[slot];
  if (currentPage() !== "shot") go("shot");
  toast(`That picture is ${where} now.`);
}
