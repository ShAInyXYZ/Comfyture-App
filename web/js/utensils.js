// Utensils: a shelf of small tools, each one input and one result. Pictures: upscale, remove the
// background, variations, an edit in words. Videos: extend, lip-sync, new sound, upscale. Sound:
// music and effects. Every result is kept in a list beside them, newest first.
import { state, changed, toast, waitFor, artistFor, jobWatchers } from "./store.js";
import { api } from "./api.js";

export const TOOLS = [
  { id: "upscale", group: "Picture", name: "Upscale", icon: "tool-upscale", hint: "More detail, up to 4× larger", takes: ["image"], verb: "Upscale" },
  { id: "cutout", group: "Picture", name: "Remove background", icon: "tool-cutout", hint: "The subject alone, on a clear background", takes: ["image"], verb: "Cut out" },
  { id: "variations", group: "Picture", name: "Variations", icon: "variations", hint: "Four new takes on a picture", takes: ["image"], verb: "Vary", words: "optional" },
  { id: "edit", group: "Picture", name: "Edit with words", icon: "image-edit", hint: "Say what to change, the rest stays", takes: ["image"], verb: "Edit", words: "needed" },
  { id: "extend", group: "Video", name: "Extend", icon: "video-extend", hint: "A clip goes on: say what happens next", takes: ["video"], verb: "Extend", words: "optional" },
  { id: "lipsync", group: "Video", name: "Lip-sync", icon: "lip-sync", hint: "A photo says or sings a voice track", takes: ["image", "audio"], verb: "Lip-sync", words: "optional" },
  { id: "sound", group: "Video", name: "Add sound", icon: "tool-add-sound", hint: "Sound written for a clip, in sync with it", takes: ["video"], verb: "Add sound", words: "needed" },
  { id: "upscale-video", group: "Video", name: "Upscale video", icon: "tool-upscale-video", hint: "A clip restored larger, frame by frame (SeedVR2)", takes: ["video"], verb: "Upscale" },
  { id: "music", group: "Sound", name: "Music", icon: "audio-music", hint: "A track from a few words, with lyrics or without", takes: [], verb: "Make the track", words: "needed" },
  { id: "sfx", group: "Sound", name: "Sound effect", icon: "audio-sfx", hint: "A sound from a few words", takes: [], verb: "Make the sound", words: "needed" },
];
export const toolById = (id) => TOOLS.find((t) => t.id === id) ?? TOOLS[0];

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
  tool: toolById(kept.tool).id,
  // what each tool was given: { image, video, audio } and its words and settings
  inputs: kept.inputs ?? {},
  results: [],
  busy: null,
  progress: 0,
  started: 0,
  shown: null,
};
// the tool open and what each was given stay in this browser; the results are kept on the server
let sent = "";
const persist = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ tool: utensils.tool, inputs: utensils.inputs }));
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

// what the tools work on is shared (a picture upscaled, then cut out); their words and settings are each their own
const MEDIA = ["image", "video", "audio"];
const media = () => (utensils.inputs.media ??= {});
const own = (tool) => (utensils.inputs[tool] ??= {});
/** What a tool has to work with: the shared picture, video and sound, and its own words and settings. */
export const inputOf = (tool = utensils.tool) => ({ ...own(tool), ...media() });
function apply(patch, tool) {
  for (const [k, v] of Object.entries(patch)) (MEDIA.includes(k) ? media() : own(tool))[k] = v;
}
export function pickTool(id) {
  utensils.tool = toolById(id).id;
  utensils.shown = null;
  update();
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

/** A file given to the tool open: a picture, a video or a sound, by its kind. */
export async function give(file) {
  const t = toolById(utensils.tool);
  const kind = file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : file.type.startsWith("audio/") ? "audio" : null;
  // a video given to lip-sync is its voice track
  const as = kind === "video" && t.takes.includes("audio") && !t.takes.includes("video") ? "audio" : kind;
  if (!as || !t.takes.includes(as)) return toast(`${t.name} takes ${t.takes.length ? t.takes.map((k) => (k === "image" ? "a picture" : k === "video" ? "a video" : "a sound")).join(" and ") : "words only"}.`);
  utensils.busy = "upload";
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
    utensils.busy = null;
    update();
  }
}
export const clearInput = (k) => setInput({ [k]: null });
/** A picture already on the server (from the picker) given to the picture tools. */
export const useImage = (p) => setInput({ image: { file: p.file, url: p.url, width: p.width, height: p.height } });

const post = async (path, body) => {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error ?? `Request failed (${res.status})`);
  return out;
};

/** A job the server runs (a picture, a sound, a video), waited for while its progress shows. */
async function job(started) {
  jobWatchers.set(started.id, (j) => ((utensils.progress = j.progress ?? utensils.progress), changed("utensils")));
  try {
    return await waitFor("job", started.id);
  } finally {
    jobWatchers.delete(started.id);
  }
}
/** A take the server rolls, waited for. */
async function roll(body) {
  const [run] = await api.shoot({ review: false, takes: 1, quality: "standard", aspect: "auto", ...body });
  utensils.run = run.id;
  try {
    return await waitFor("run", run.id);
  } finally {
    utensils.run = null;
  }
}

function keep(result) {
  const r = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, tool: utensils.tool, at: new Date().toISOString(), ...result };
  utensils.results.unshift(r);
  utensils.shown = r.id;
  return r;
}

export const ready = (t = toolById(utensils.tool), i = inputOf(t.id)) =>
  t.takes.every((k) => i[k]) && (t.words !== "needed" || (i.prompt ?? "").trim());

/** The tool open, run on what it was given. */
export async function runTool() {
  const t = toolById(utensils.tool);
  const i = inputOf(t.id);
  if (utensils.busy) return;
  if (!ready(t, i)) return toast(t.takes.some((k) => !i[k]) ? "Give it what it works on first." : "Say what you want first.");
  utensils.busy = t.id;
  utensils.progress = 0;
  utensils.started = Date.now();
  update();
  const words = (i.prompt ?? "").trim();
  try {
    if (t.id === "upscale") {
      const j = await job(await post("api/utensils/upscale", { source: i.image.file, scale: i.scale === 2 ? 2 : 4 }));
      keep({ kind: "image", from: i.image.url, ...j.photo, note: `${j.photo.width} × ${j.photo.height}` });
    } else if (t.id === "cutout") {
      const j = await job(await post("api/utensils/cutout", { source: i.image.file }));
      keep({ kind: "image", clear: true, from: i.image.url, ...j.photo, note: "PNG · clear" });
    } else if (t.id === "variations" || t.id === "edit") {
      const vary = t.id === "variations";
      const prompt = vary
        ? `A new take on @photo: the same subject, look and style, ${words || "a different moment, pose and composition"}. No text.`
        : `${words.includes("@photo") ? words : `In @photo: ${words}`}. Everything else stays exactly as it is.`;
      const jobs = await api.image({ model: artistFor("edit"), template: "edit", prompt, refs: [{ file: i.image.file, name: "photo" }], aspect: "auto", count: vary ? 4 : 1, megapixels: 1, seed: Math.floor(Math.random() * 2 ** 31), name: vary ? "Variation" : "Edit" });
      const done = await Promise.allSettled(jobs.map((x) => job(x)));
      const pics = done.filter((d) => d.status === "fulfilled").map((d) => d.value.photo);
      if (!pics.length) throw new Error(done.find((d) => d.status === "rejected")?.reason?.message ?? "No picture came back.");
      for (const p of pics.reverse()) keep({ kind: "image", from: i.image.url, ...p, note: `${p.width} × ${p.height}` });
    } else if (t.id === "extend") {
      const seconds = Math.min(10, Math.max(2, Math.round(i.seconds ?? 5)));
      const run = await roll({ name: "Extended clip", video: { file: i.video.file, mode: "extend" }, seconds, script: { shots: [{ action: words || "The moment carries on naturally, the same people, place and light.", camera: "", sound: "", framing: "" }], raw: "" } });
      keep({ kind: "video", url: run.video, run: run.id, seconds: run.length ?? seconds, note: `${run.size.width} × ${run.size.height}` });
    } else if (t.id === "lipsync") {
      const seconds = Math.min(10, Math.max(2, Math.ceil(i.audio.seconds ?? 5)));
      const run = await roll({ name: "Lip-sync", start: i.image.file, audio: { file: i.audio.file, lipsync: true }, seconds, script: { shots: [{ action: words || "They say the words to the camera, their lips in sync with the voice, natural small movements.", camera: "", sound: "", framing: "" }], raw: "" } });
      keep({ kind: "video", url: run.video, run: run.id, seconds: run.length ?? seconds, note: `${run.size.width} × ${run.size.height}` });
    } else if (t.id === "sound" || t.id === "upscale-video") {
      const j = await job(await post(`api/utensils/${t.id}`, t.id === "sound" ? { video: i.video.file, prompt: words, real: i.real === true } : { video: i.video.file, height: i.height ?? 1080 }));
      keep({ kind: "video", ...j.video, seconds: j.video.duration, note: `${j.video.width} × ${j.video.height}` });
    } else if (t.id === "music" || t.id === "sfx") {
      const music = t.id === "music";
      const body = music ? { prompt: words, lyrics: (i.lyrics ?? "").trim(), seconds: i.seconds ?? 30, bpm: i.bpm ?? 100 } : { prompt: words, seconds: i.seconds ?? 6 };
      const j = await job(await post(music ? "api/audio/music" : "api/audio/sound", body));
      keep({ ...j.audio, kind: "audio", note: `${Math.round(j.audio.seconds)} s` });
    }
  } catch (e) {
    toast(`${t.name}: ${e.message}`, { tone: "crit" });
  } finally {
    utensils.busy = null;
    update();
  }
}

export function forget(id) {
  utensils.results = utensils.results.filter((r) => r.id !== id);
  if (utensils.shown === id) utensils.shown = null;
  update();
}
export const show = (id) => ((utensils.shown = id), update());

/** A result handed to the tool open (an upscaled picture to cut out, say). */
export function useResult(r) {
  const t = toolById(utensils.tool);
  if (r.kind === "image" && t.takes.includes("image")) setInput({ image: { file: r.file, url: r.url, width: r.width, height: r.height } });
  else if (r.kind === "video" && t.takes.includes("video") && r.file) setInput({ video: { file: r.file, url: r.url, width: r.width, height: r.height, duration: r.seconds } });
  else if (r.kind === "audio" && t.takes.includes("audio")) setInput({ audio: { file: r.file, url: r.url, seconds: r.seconds, name: r.name } });
  else toast(`${t.name} doesn't take that.`);
}

/** Roughly what the tool open costs, in Comfy credits. */
export function estimate(t = toolById(utensils.tool), i = inputOf(t.id)) {
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
