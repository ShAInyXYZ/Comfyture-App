// The twelve Edit tools as the shelf knows them: their names, what each keeps in the tool's inputs (the settings: the same
// words the server takes), what a request to the server is made of, when a tool is ready, and how a result is described. Each
// is registered with the shelf (registerTool) so the Shelf's grid lists them, Truffle can open and run them and the queue names
// them. The workspace (utensils-space-edit.js) draws them; the server (server/utensils-edit.ts) runs them, free, on this machine.
import { registerTool, inputOf } from "./utensils.js";
import { editRun, editStop } from "./utensils-edit-api.js";
import { utensils } from "./utensils.js";

export const EDIT_TOOLS = [
  { key: "trim", name: "Trim", hint: "Keep one part of a clip", takes: ["video"] },
  { key: "reframe", name: "Crop and reframe", hint: "Fit a clip to 9:16, 1:1, 4:5 or 16:9", takes: ["video"] },
  { key: "speed", name: "Speed and slow-mo", hint: "Faster, slower, or smooth slow-motion", takes: ["video"] },
  { key: "reverse", name: "Reverse", hint: "Play a clip backwards, sound too", takes: ["video"] },
  { key: "loop", name: "Loop", hint: "Repeat a clip, or ping-pong it", takes: ["video"] },
  { key: "merge", name: "Merge clips", hint: "Join clips in order, with a crossfade", takes: [] },
  { key: "captions", name: "Add captions", hint: "Words on the picture, typed or from an .srt", takes: ["video"] },
  { key: "grade", name: "Grade colour", hint: "Presets, sliders and .cube LUTs", takes: ["video"] },
  { key: "logo", name: "Add a logo", hint: "A picture over a clip, in a corner", takes: ["video", "image"] },
  { key: "audio", name: "Mute or swap audio", hint: "Take the sound out, replace it or mix one in", takes: ["video"] },
  { key: "convert", name: "Convert format", hint: "MP4, WebM, MOV, GIF, or just the sound", takes: ["video"] },
  { key: "gif", name: "GIF and thumbnails", hint: "A GIF of a range, or frames as pictures", takes: ["video"] },
].map((t) => ({ ...t, id: `ed-${t.key}`, icon: `tool-edit-${t.key}` }));

export const editTool = (id) => EDIT_TOOLS.find((t) => t.id === id || t.key === id);
export const isEdit = (id) => EDIT_TOOLS.some((t) => t.id === id);

/** What each tool keeps in its inputs when nothing was set (the server clamps and checks them again). */
export const DEFAULTS = {
  trim: { start: 0, end: 0, mode: "auto" },
  reframe: { format: "9:16", x: 0.5, y: 0.5, zoom: 1, fill: "fill", colour: "#000000" },
  speed: { factor: 2, smooth: false },
  reverse: {},
  loop: { times: 2, pingpong: false },
  merge: { clips: [], crossfade: 0.5, fit: "contain", aspect: "first" },
  captions: { cues: [], style: "bold", position: "bottom", size: 6, colour: "#F2FF59", font: "sans", caps: false },
  grade: { preset: "filmic", exposure: 0, contrast: 1, saturation: 1, temperature: 0, tint: 0, vignette: false, lut: "", lutName: "" },
  logo: { corner: "br", scale: 18, opacity: 1, margin: 4, fadeIn: 0, fadeOut: 0, start: 0, end: 0 },
  audio: { mode: "replace", volume: 1, videoVolume: 1, fadeOut: 0 },
  convert: { format: "mp4", quality: "medium", height: "0", fps: "0", codec: "h264" },
  gif: { mode: "gif", start: 0, end: 0, width: 480, fps: 15, count: 6, format: "png", times: [] },
};

/** A tool's settings as they stand: the defaults under what was set. */
export const paramsOf = (key, i = inputOf(`ed-${key}`)) => {
  const p = { ...DEFAULTS[key] };
  for (const k of Object.keys(p)) if (i[k] !== undefined && i[k] !== null) p[k] = i[k];
  return p;
};

/** The range of a clip a range tool starts with: the whole of it. */
export const wholeOf = (i) => Number(i.video?.duration) || 0;

/** Whether a tool has what it works on. */
export function readyOf(key, i) {
  const p = paramsOf(key, i);
  if (key === "merge") return p.clips.length >= 2;
  if (!i.video) return false;
  if (key === "captions") return p.cues.length > 0;
  if (key === "logo") return !!i.image;
  if (key === "audio") return p.mode === "mute" || !!i.audio;
  return true;
}

/** What a tool asks of the server: its settings and the files it works on. */
export function bodyOf(key, i) {
  const p = paramsOf(key, i);
  const video = i.video?.file;
  const d = wholeOf(i);
  switch (key) {
    case "merge": return { videos: p.clips.map((c) => c.file), crossfade: p.crossfade, fit: p.fit, aspect: p.aspect };
    case "trim": return { video, start: p.start, end: p.end > p.start ? p.end : d, mode: p.mode };
    case "logo": return { video, image: i.image?.file, ...p, end: p.end > p.start ? p.end : d };
    case "audio": return { video, ...p, audio: i.audio?.file };
    case "gif": return { video, ...p, end: p.end > p.start ? p.end : Math.min(d, p.start + 4) };
    case "grade": return { video, ...p };
    default: return { video, ...p };
  }
}

const clock = (s) => `${Math.floor(s / 60)}:${(Math.floor(s) % 60).toString().padStart(2, "0")}`;
const bytes = (n) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

/** A result in a few words: its size, its length, its weight. */
export function noteOf(key, r) {
  const size = r.width && r.height ? `${r.width} × ${r.height}` : "";
  const len = r.duration && r.kind !== "image" ? `${r.duration.toFixed(1)} s` : r.animated ? `${r.duration.toFixed(1)} s` : "";
  const weight = r.bytes ? bytes(r.bytes) : "";
  if (key === "convert") return [r.ext.toUpperCase(), size, len, weight].filter(Boolean).join(" · ");
  return [size, len, weight].filter(Boolean).join(" · ");
}

/** The settings Truffle may set, by tool (key, type: choice | range | flag | text, with its values or its range). */
const OPTIONS = {
  trim: [{ key: "start", type: "range", min: 0, max: 600 }, { key: "end", type: "range", min: 0, max: 600 }],
  reframe: [{ key: "format", type: "choice", values: ["9:16", "1:1", "4:5", "16:9"] }, { key: "fill", type: "choice", values: ["fill", "blur", "colour"] }, { key: "zoom", type: "range", min: 1, max: 4 }],
  speed: [{ key: "factor", type: "range", min: 0.25, max: 4 }, { key: "smooth", type: "flag" }],
  loop: [{ key: "times", type: "range", min: 2, max: 10 }, { key: "pingpong", type: "flag" }],
  grade: [{ key: "preset", type: "choice", values: ["none", "warm", "cool", "filmic", "punchy", "faded", "noir"] }, { key: "contrast", type: "range", min: 0.5, max: 2 }, { key: "saturation", type: "range", min: 0, max: 3 }],
  logo: [{ key: "corner", type: "choice", values: ["tl", "tr", "bl", "br", "centre"] }, { key: "scale", type: "range", min: 4, max: 60 }, { key: "opacity", type: "range", min: 0.1, max: 1 }],
  audio: [{ key: "mode", type: "choice", values: ["mute", "replace", "mix"] }],
  convert: [{ key: "format", type: "choice", values: ["mp4", "webm", "mov", "gif", "mp3", "wav", "m4a"] }, { key: "quality", type: "choice", values: ["high", "medium", "small"] }],
  gif: [{ key: "mode", type: "choice", values: ["gif", "frames"] }, { key: "count", type: "range", min: 1, max: 24 }],
};

/** One tool run: the files it made, in the shape the shelf keeps. The job's stop key stops it on the server too. */
export async function runEdit(key, i, set) {
  const tool = `ed-${key}`;
  const job = utensils.jobs.find((j) => j.tool === tool && j.status === "running");
  const made = await editRun(key, bodyOf(key, i), set, (id) => job && (job.onCancel = () => editStop(id)));
  return made.map((r) => ({
    kind: r.kind,
    // (only a clip kept in the library of clips can be handed on to another tool)
    ...(r.url.startsWith("/media/videos/") || r.kind !== "video" ? { file: r.file } : {}),
    url: r.url, width: r.width, height: r.height, seconds: r.duration, bytes: r.bytes, ext: r.ext,
    ...(r.animated ? { animated: true } : {}),
    note: noteOf(key, r),
  }));
}

let registered = false;
/** The twelve tools, on the shelf (once). */
export function registerEditTools() {
  if (registered) return;
  registered = true;
  for (const t of EDIT_TOOLS) {
    registerTool({
      id: t.id, workspace: "edit", name: t.name, icon: t.icon, hint: t.hint, takes: t.takes, verb: "Export",
      options: OPTIONS[t.key],
      ready: (i) => readyOf(t.key, i),
      cost: () => null,
      run: (i, set) => runEdit(t.key, i, set),
    });
  }
  // the tool that was open when the page was left is open again (the shelf read it before these tools were on it)
  try {
    const kept = JSON.parse(localStorage.getItem("comfyture.utensils") ?? "{}");
    if (isEdit(kept.tool)) utensils.tool = kept.tool;
  } catch {}
}
export { clock };
