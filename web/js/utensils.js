// Utensils: a shelf of tools, each one input and one result, in seven workspaces (Shelf, Picture, Video, Audio, VFX, Edit,
// Templates). This module is the shelf's shared state and the contract the workspaces are built on:
//
//   utensils.workspace / setWorkspace(id)   the workspace open (kept in this browser with the tool and what it was given)
//   TOOLS, toolById, registerTool(def)      the tools; a workspace adds its own with registerTool, so the Shelf's grid, Truffle
//                                           and the queue know them (def: id, workspace, name, icon, hint, takes, words, verb,
//                                           and optionally ready(i), cost(i) and run(i, set) so Truffle can run it too)
//   trackJob({ tool, label, credits }, fn)  runs fn(setProgress) as a job of the queue: several at once, progress, a toast and
//                                           the failed state on an error; what fn returns (a result or a list) is kept
//   addResult(result)                       keeps a result at the top of the list (kept on the server), with its credits
//   inputOf / setInput / give / pickInput   what the tools work on is shared (a picture upscaled, then cut out)
//
// What every tool makes is kept in a list (newest first) that the panel shows as RECENT and the workspaces as history.
import { state, changed, toast, waitFor, artistFor, jobWatchers } from "./store.js";
import { api } from "./api.js";
import { openPicker, pictureOf } from "./picker.js";
import { h } from "./dom.js";
import { WORKSPACES } from "./utensils-harness.js";

export const WORKSPACE_IDS = WORKSPACES.map((w) => w.id);

export const TOOLS = [
  { id: "upscale", workspace: "picture", group: "Picture", name: "Upscale", icon: "tool-upscale", hint: "More detail, up to 4× larger", takes: ["image"], verb: "Upscale", options: [{ key: "scale", type: "choice", values: [2, 4] }] },
  { id: "cutout", workspace: "picture", group: "Picture", name: "Remove background", icon: "tool-cutout", hint: "The subject alone, on a clear background", takes: ["image"], verb: "Cut out" },
  { id: "variations", workspace: "picture", group: "Picture", name: "Variations", icon: "variations", hint: "Four new takes on a picture", takes: ["image"], verb: "Vary", words: "optional" },
  { id: "edit", workspace: "picture", group: "Picture", name: "Edit with words", icon: "image-edit", hint: "Say what to change, the rest stays", takes: ["image"], verb: "Edit", words: "needed" },
  { id: "extend", workspace: "video", group: "Video", name: "Extend", icon: "video-extend", hint: "A clip goes on: say what happens next", takes: ["video"], verb: "Extend", words: "optional", options: [{ key: "seconds", type: "range", min: 2, max: 10 }] },
  { id: "lipsync", workspace: "video", group: "Video", name: "Lip-sync", icon: "lip-sync", hint: "A photo says or sings a voice track", takes: ["image", "audio"], verb: "Lip-sync", words: "optional" },
  { id: "sound", workspace: "video", group: "Video", name: "Add sound", icon: "tool-add-sound", hint: "Sound written for a clip, in sync with it", takes: ["video"], verb: "Add sound", words: "needed", options: [{ key: "real", type: "flag" }] },
  { id: "upscale-video", workspace: "video", group: "Video", name: "Upscale video", icon: "tool-upscale-video", hint: "A clip restored larger, frame by frame (SeedVR2)", takes: ["video"], verb: "Upscale", options: [{ key: "height", type: "choice", values: [720, 1080, 1440] }] },
  { id: "music", workspace: "audio", group: "Sound", name: "Music", icon: "audio-music", hint: "A track from a few words, with lyrics or without", takes: [], verb: "Make the track", words: "needed", options: [{ key: "seconds", type: "range", min: 10, max: 240 }, { key: "bpm", type: "range", min: 60, max: 180 }, { key: "lyrics", type: "text" }] },
  { id: "sfx", workspace: "audio", group: "Sound", name: "Sound effect", icon: "audio-sfx", hint: "A sound from a few words", takes: [], verb: "Make the sound", words: "needed", options: [{ key: "seconds", type: "range", min: 1, max: 30 }] },
];
const GROUP = { picture: "Picture", video: "Video", audio: "Sound", vfx: "VFX", edit: "Edit", templates: "Templates" };
export const toolById = (id) => TOOLS.find((t) => t.id === id) ?? TOOLS[0];

/**
 * A workspace's own tool, added to the shelf: the Shelf's grid lists it, Truffle can open it, the queue can name it. `def` is
 * { id, workspace, name, icon, hint, takes?, words?, verb?, options?, ready?(inputs), cost?(inputs), run?(inputs, setProgress) }
 * (options: the settings Truffle may set, [{ key, type: choice|range|flag|text, values?, min?, max? }], kept in the tool's inputs by key); a tool
 * with a run() can be run from anywhere (Truffle's key) and its run is tracked as a job. Registering twice keeps the first. `app: true` marks
 * a mini app (utensils-templates-api.js): a tool Truffle can open, kept out of the Shelf's grid and counts, which are of the tools.
 */
export function registerTool(def) {
  if (!def?.id || TOOLS.some((t) => t.id === def.id)) return TOOLS.find((t) => t.id === def?.id);
  const tool = { group: GROUP[def.workspace] ?? "Shelf", takes: [], verb: def.name, icon: "tool-shelf", ...def };
  TOOLS.push(tool);
  changed("utensils");
  return tool;
}

const KEY = "comfyture.utensils";
const read = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
};
const kept = read();
export const utensils = {
  workspace: WORKSPACE_IDS.includes(kept.workspace) ? kept.workspace : "shelf",
  tool: toolById(kept.tool).id,
  // what each tool was given: { image, video, audio } and its words and settings
  inputs: kept.inputs ?? {},
  results: [],
  /** The queue: { id, tool, label, credits, progress, started, status: running|done|failed|canceled, error }, newest first. */
  jobs: [],
  uploading: false,
  shown: null,
  /** The tools, as the Shelf lists them (the same list as TOOLS: registerTool adds to it). */
  catalog: TOOLS,
  /** The id of the tool a job is running now (any of them), else null: what old code asks. */
  get busy() {
    return this.jobs.find((j) => j.status === "running")?.tool ?? null;
  },
};
// the workspace and the tool open and what each was given stay in this browser; the results are kept on the server
let sent = "";
const persist = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ workspace: utensils.workspace, tool: utensils.tool, inputs: utensils.inputs }));
  } catch {}
  const list = JSON.stringify(utensils.results.slice(0, 200));
  if (list !== sent && loaded) {
    sent = list;
    fetch("api/utensils/results", { method: "PUT", headers: { "Content-Type": "application/json" }, body: list }).catch(() => {});
  }
};
let loaded = false;
fetch("api/utensils/results").then((r) => r.json()).then((list) => {
  if (Array.isArray(list)) utensils.results = [...utensils.results, ...list.filter((r) => !utensils.results.some((x) => x.id === r.id))];
  sent = JSON.stringify(utensils.results.slice(0, 200));
}).catch(() => {}).finally(() => ((loaded = true), changed("utensils")));
const update = () => (persist(), changed("utensils"));

// ---------------------------------------------------------------- the workspace and the tool open

export function setWorkspace(id) {
  if (!WORKSPACE_IDS.includes(id) || utensils.workspace === id) return;
  utensils.workspace = id;
  update();
}
/** Opens a tool: its workspace comes with it. */
export function pickTool(id) {
  const t = toolById(id);
  utensils.tool = t.id;
  utensils.workspace = WORKSPACE_IDS.includes(t.workspace) ? t.workspace : utensils.workspace;
  utensils.shown = null;
  update();
}
/** The tools of a workspace (the mini apps, which are workflows shown simply, are the Templates workspace's own and are not counted among the tools). */
export const toolsOf = (workspace) => TOOLS.filter((t) => t.workspace === workspace && !t.app);
/** The tools of the shelf: all but the mini apps (registered as tools so Truffle can open them, they have their own place). */
export const shelfTools = () => TOOLS.filter((t) => !t.app);

// what the tools work on is shared (a picture upscaled, then cut out); their words and settings are each their own
const MEDIA = ["image", "video", "audio"];
const media = () => (utensils.inputs.media ??= {});
const own = (tool) => (utensils.inputs[tool] ??= {});
/** What a tool has to work with: the shared picture, video and sound, and its own words and settings. */
export const inputOf = (tool = utensils.tool) => ({ ...own(tool), ...media() });
function apply(patch, tool) {
  for (const [k, v] of Object.entries(patch)) (MEDIA.includes(k) ? media() : own(tool))[k] = v;
}
export function setInput(patch, tool = utensils.tool) {
  apply(patch, tool);
  update();
}
/** Words or settings typed in: kept, without drawing the screen again under the cursor. */
export function setQuietly(patch, tool = utensils.tool) {
  apply(patch, tool);
  persist();
}

const ACCEPT = { image: "image/*", video: "video/*", audio: "audio/*,video/*" };
const pickFile = (accept, fn) => {
  const input = h("input", { type: "file", accept, hidden: true, on: { change: () => (input.files[0] && fn(input.files[0]), input.remove()) } });
  document.body.append(input);
  input.click();
};
/** Where an input comes from: a picture from the picker; a video or a sound from the computer. */
export function pickInput(kind, anchor) {
  if (kind !== "image") return pickFile(ACCEPT[kind], give);
  openPicker(anchor, { title: "A picture to work on", onPick: async (choice) => { try { useImage(await pictureOf(choice)); } catch (e) { toast(e.message, { tone: "crit" }); } } });
}

/** A file given to the tool open: a picture, a video or a sound, by its kind. */
export async function give(file) {
  const t = toolById(utensils.tool);
  const kind = file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : file.type.startsWith("audio/") ? "audio" : null;
  // a video given to lip-sync is its voice track
  const as = kind === "video" && t.takes.includes("audio") && !t.takes.includes("video") ? "audio" : kind;
  if (!as || !t.takes.includes(as)) return toast(`${t.name} takes ${t.takes.length ? t.takes.map((k) => (k === "image" ? "a picture" : k === "video" ? "a video" : "a sound")).join(" and ") : "words only"}.`);
  utensils.uploading = true;
  update();
  try {
    if (as === "image") {
      const p = await api.upload(file, file.name);
      setInput({ image: { file: p.file, url: p.url, width: p.width, height: p.height } });
    } else if (as === "video") {
      const v = await api.uploadVideo(file);
      setInput({ video: { file: v.file, url: v.url, width: v.width, height: v.height, duration: v.duration } });
    } else {
      const a = await api.uploadAudio(file);
      // a voice taken from a video comes back without its length: read it here
      let seconds = a.seconds;
      if (!seconds) {
        const ctx = new AudioContext();
        seconds = (await ctx.decodeAudioData(await (await fetch(a.url)).arrayBuffer())).duration;
        ctx.close();
      }
      setInput({ audio: { file: a.file, url: a.url, seconds: Math.round(seconds * 10) / 10, name: file.name || a.name } });
    }
  } catch (e) {
    toast(e.message, { tone: "crit" });
  } finally {
    utensils.uploading = false;
    update();
  }
}
export const clearInput = (k) => setInput({ [k]: null });
/** A picture already on the server (from the picker) given to the picture tools. */
export const useImage = (p) => setInput({ image: { file: p.file, url: p.url, width: p.width, height: p.height } });

// ---------------------------------------------------------------- the queue and the results

const FINISHED_STAYS = { done: 6000, failed: 14000, canceled: 3000 };
/**
 * Runs a job of the queue. fn(setProgress, job) does the work and answers a result or a list of them (the shape addResult
 * takes, without the tool: it is the job's); they are kept, newest first, each with its share of the credits. An error is a toast
 * and the failed state. Several jobs run at once. Answers what was kept (a list), or [] when it failed.
 */
export async function trackJob({ tool, label, credits = null }, fn) {
  const job = { id: `j${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, tool, label: label ?? toolById(tool).name, credits, progress: 0, started: Date.now(), status: "running", error: null };
  utensils.jobs.unshift(job);
  update();
  const setProgress = (p) => {
    if (job.status !== "running") return;
    job.progress = Math.max(job.progress, Math.min(1, Number(p) || 0));
    changed("utensils");
  };
  const finish = (status, error = null) => {
    job.status = status;
    job.error = error;
    if (status === "done") job.progress = 1;
    changed("utensils");
    setTimeout(() => ((utensils.jobs = utensils.jobs.filter((j) => j.id !== job.id)), changed("utensils")), FINISHED_STAYS[status]);
  };
  try {
    const out = await fn(setProgress, job);
    if (job.status === "canceled") return [];
    const list = (Array.isArray(out) ? out : out ? [out] : []).filter(Boolean);
    const share = typeof credits === "number" && list.length ? Math.round((credits / list.length) * 10) / 10 : null;
    const made = list.map((r) => addResult({ credits: share, ...r, tool }));
    finish("done");
    return made;
  } catch (e) {
    if (job.status === "canceled") return [];
    finish("failed", e.message);
    toast(`${toolById(tool).name}: ${e.message}`, { tone: "crit" });
    return [];
  }
}
/** Stops waiting for a job (its work may go on on the server; what it makes is not kept). A job may name how to stop in job.onCancel. */
export function cancelJob(id) {
  const job = utensils.jobs.find((j) => j.id === id);
  if (!job || job.status !== "running") return;
  job.status = "canceled";
  try {
    job.onCancel?.();
  } catch {}
  changed("utensils");
  setTimeout(() => ((utensils.jobs = utensils.jobs.filter((j) => j.id !== id)), changed("utensils")), FINISHED_STAYS.canceled);
}

/** Keeps a result at the top of the list: { kind: image|video|audio, url, file, width, height, seconds, tool, note, from, credits, clear, ... }. */
export function addResult(result) {
  const r = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, tool: utensils.tool, at: new Date().toISOString(), credits: null, ...result };
  utensils.results.unshift(r);
  utensils.shown = r.id;
  update();
  return r;
}
export function forget(id) {
  utensils.results = utensils.results.filter((r) => r.id !== id);
  if (utensils.shown === id) utensils.shown = null;
  update();
}
export const show = (id) => ((utensils.shown = id), update());
/** A result shown in its tool: the tool opens (with its workspace) and the result is on its stage. */
export function openResult(r) {
  if (TOOLS.some((t) => t.id === r.tool)) pickTool(r.tool);
  show(r.id);
}
/** The newest results (of a tool, when one is named). */
export const recent = (n = 8, tool) => utensils.results.filter((r) => !tool || r.tool === tool).slice(0, n);

const sameDay = (iso) => new Date(iso).toDateString() === new Date().toDateString();
/** The credits the results of today cost, and how they spread over the hours of the day (24 numbers). */
export function creditsToday() {
  const hours = Array(24).fill(0);
  let total = 0;
  for (const r of utensils.results) {
    if (typeof r.credits !== "number" || !sameDay(r.at)) continue;
    total += r.credits;
    hours[new Date(r.at).getHours()] += r.credits;
  }
  return { total: Math.round(total), hours };
}

/** A result handed to another tool (an upscaled picture to cut out): it becomes that tool's input, and the tool opens. */
export function handOn(r, toolId) {
  const t = toolById(toolId);
  const given = r.kind === "image" ? { image: { file: r.file, url: r.url, width: r.width, height: r.height } }
    : r.kind === "video" && r.file ? { video: { file: r.file, url: r.url, width: r.width, height: r.height, duration: r.seconds } }
    : r.kind === "audio" ? { audio: { file: r.file, url: r.url, seconds: r.seconds, name: r.name } } : null;
  const k = given && Object.keys(given)[0];
  if (!given || !t.takes.includes(k)) return toast(`${t.name} doesn't take that.`);
  apply(given, t.id);
  pickTool(t.id);
}
/** The tools that take a result, to offer it to: the ones whose input is of its kind. */
export const takersOf = (r) => TOOLS.filter((t) => !t.app && t.takes.includes(r.kind) && (r.kind !== "video" || r.file));
/** A result handed to the tool open (an upscaled picture to cut out, say). */
export const useResult = (r) => handOn(r, utensils.tool);

// ---------------------------------------------------------------- what the tools run

const post = async (path, body) => {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error ?? `Request failed (${res.status})`);
  return out;
};

/** A job the server runs (a picture, a sound, a video), waited for while its progress shows. */
async function serverJob(started, setProgress) {
  jobWatchers.set(started.id, (j) => setProgress(j.progress ?? 0));
  try {
    return await waitFor("job", started.id);
  } finally {
    jobWatchers.delete(started.id);
  }
}
/** A take the server rolls, waited for. */
async function roll(body) {
  const [run] = await api.shoot({ review: false, takes: 1, quality: "standard", aspect: "auto", ...body });
  return waitFor("run", run.id);
}

/** What each built-in tool makes: its results, from what it was given (i) and its words. */
const MAKE = {
  async upscale(i, _words, set) {
    const j = await serverJob(await post("api/utensils/upscale", { source: i.image.file, scale: i.scale === 2 ? 2 : 4 }), set);
    return { kind: "image", from: i.image.url, ...j.photo, note: `${j.photo.width} × ${j.photo.height}` };
  },
  async cutout(i, _words, set) {
    const j = await serverJob(await post("api/utensils/cutout", { source: i.image.file }), set);
    return { kind: "image", clear: true, from: i.image.url, ...j.photo, note: "PNG · clear" };
  },
  async variations(i, words, set) {
    return picturesFrom(i, words, true, set);
  },
  async edit(i, words, set) {
    return picturesFrom(i, words, false, set);
  },
  async extend(i, words) {
    const seconds = Math.min(10, Math.max(2, Math.round(i.seconds ?? 5)));
    const run = await roll({ name: "Extended clip", video: { file: i.video.file, mode: "extend" }, seconds, script: { shots: [{ action: words || "The moment carries on naturally, the same people, place and light.", camera: "", sound: "", framing: "" }], raw: "" } });
    return { kind: "video", url: run.video, run: run.id, seconds: run.length ?? seconds, note: `${run.size.width} × ${run.size.height}` };
  },
  async lipsync(i, words) {
    const seconds = Math.min(10, Math.max(2, Math.ceil(i.audio.seconds ?? 5)));
    const run = await roll({ name: "Lip-sync", start: i.image.file, audio: { file: i.audio.file, lipsync: true }, seconds, script: { shots: [{ action: words || "They say the words to the camera, their lips in sync with the voice, natural small movements.", camera: "", sound: "", framing: "" }], raw: "" } });
    return { kind: "video", url: run.video, run: run.id, seconds: run.length ?? seconds, note: `${run.size.width} × ${run.size.height}` };
  },
  async sound(i, words, set) {
    const j = await serverJob(await post("api/utensils/sound", { video: i.video.file, prompt: words, real: i.real === true }), set);
    return { kind: "video", ...j.video, seconds: j.video.duration, note: `${j.video.width} × ${j.video.height}` };
  },
  async "upscale-video"(i, _words, set) {
    const j = await serverJob(await post("api/utensils/upscale-video", { video: i.video.file, height: i.height ?? 1080 }), set);
    return { kind: "video", ...j.video, seconds: j.video.duration, note: `${j.video.width} × ${j.video.height}` };
  },
  async music(i, words, set) {
    const j = await serverJob(await post("api/audio/music", { prompt: words, lyrics: (i.lyrics ?? "").trim(), seconds: i.seconds ?? 30, bpm: i.bpm ?? 100 }), set);
    return { ...j.audio, kind: "audio", note: `${Math.round(j.audio.seconds)} s` };
  },
  async sfx(i, words, set) {
    const j = await serverJob(await post("api/audio/sound", { prompt: words, seconds: i.seconds ?? 6 }), set);
    return { ...j.audio, kind: "audio", note: `${Math.round(j.audio.seconds)} s` };
  },
};
async function picturesFrom(i, words, vary, set) {
  const prompt = vary
    ? `A new take on @photo: the same subject, look and style, ${words || "a different moment, pose and composition"}. No text.`
    : `${words.includes("@photo") ? words : `In @photo: ${words}`}. Everything else stays exactly as it is.`;
  const jobs = await api.image({ model: artistFor("edit"), template: "edit", prompt, refs: [{ file: i.image.file, name: "photo" }], aspect: "auto", count: vary ? 4 : 1, megapixels: 1, seed: Math.floor(Math.random() * 2 ** 31), name: vary ? "Variation" : "Edit" });
  const done = await Promise.allSettled(jobs.map((x) => serverJob(x, (p) => set(p))));
  const pics = done.filter((d) => d.status === "fulfilled").map((d) => d.value.photo);
  if (!pics.length) throw new Error(done.find((d) => d.status === "rejected")?.reason?.message ?? "No picture came back.");
  return pics.map((p) => ({ kind: "image", from: i.image.url, ...p, note: `${p.width} × ${p.height}` }));
}

export const ready = (t = toolById(utensils.tool), i = inputOf(t.id)) =>
  t.takes.every((k) => i[k]) && (t.words !== "needed" || (i.prompt ?? "").trim()) && (t.ready ? !!t.ready(i) : true);

/** The tool (the one open, or the one named), run on what it was given, as a job of the queue. */
export async function runTool(id = utensils.tool) {
  const t = toolById(id);
  const i = inputOf(t.id);
  if (!ready(t, i)) return void toast(t.takes.some((k) => !i[k]) ? "Give it what it works on first." : "Say what you want first.");
  const words = (i.prompt ?? "").trim();
  const make = t.run ?? MAKE[t.id];
  if (!make) return void toast(`${t.name} runs from its own workspace.`);
  return trackJob({ tool: t.id, label: t.name, credits: estimate(t, i) }, (set, job) => make(i, t.run ? set : words, t.run ? job : set));
}

/** Roughly what the tool costs, in Comfy credits. */
export function estimate(t = toolById(utensils.tool), i = inputOf(t.id)) {
  if (t.cost) return t.cost(i);
  if (state.info?.target !== "comfy-cloud") return null;
  const gpu = 0.266;
  const look = (state.image.catalogue?.models ?? []).find((x) => x.id === artistFor("edit"));
  const pic = look?.router ? look.credits ?? 8 : (look?.seconds ?? 10) * gpu;
  return Math.max(1, Math.round({
    upscale: 6 * gpu,
    cutout: 4 * gpu,
    variations: pic * 4,
    edit: pic,
    extend: (i.seconds ?? 5) * 18 * gpu,
    lipsync: Math.min(10, Math.ceil(i.audio?.seconds ?? 5)) * 18 * gpu,
    sound: Math.min(10, i.video?.duration ?? 5) * 7 * gpu,
    "upscale-video": Math.min(12, i.video?.duration ?? 5) * 20 * gpu,
    music: (i.seconds ?? 30) * 1.3 * gpu,
    sfx: (i.seconds ?? 6) * 2.5 * gpu,
  }[t.id] ?? 1));
}
