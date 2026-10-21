// The VFX workspace's tools: what each one is (its card, what it takes, where it runs), the settings it starts with, and how it runs.
// Six run on this machine with ffmpeg and are free (server/utensils-fx.ts): a green-screen cutout, a stabiliser, smooth slow
// motion, weather laid over a clip, sparks and embers and dust, and a still spot removed from a clip. Five run on Comfy Cloud
// through the template runner (utensils-cloud.js): an object removed by its name, a new background, a relight, a restyle and a
// retouch; each names the official template it runs and says when it is a partner's. One opens the Edit workspace's grade.
// Every tool is on the shelf (registerTool) so the Shelf's grid lists it and Truffle can open it; the free ones she can run too.
import { registerTool, utensils, inputOf, setWorkspace, pickTool } from "./utensils.js";
import { fxRun, fxStop, asResult } from "./utensils-fx-api.js";
import { runCloud, runnerOf, costOf, priceText } from "./utensils-cloud.js";

/** The card art: a before/after pair under web/brand/utensils/vfx/ (made by scripts/utensils-fx-art.ts from the pictures in docs/brand/products/utensils-v2/vfx-art). */
export const artOf = (id) => ({ before: `brand/utensils/vfx/${id}-before.webp`, after: `brand/utensils/vfx/${id}-after.webp` });

/** What each tool starts with (a tool's settings are kept by the shelf with what it was given: inputOf(id)). */
export const DEFAULTS = {
  "vfx-chroma": { colour: "#00C800", similarity: 0.14, blend: 0.06, despill: true, output: "webm", background: "#101012" },
  "vfx-stabilise": { shakiness: 5, smoothness: 40, zoom: "auto", edges: "fill", sharpen: true },
  "vfx-slowmo": { factor: 2, mode: "mci", audio: "mute", ai: false },
  "vfx-weather": { kind: "rain", amount: 0.55, speed: 1, angle: 10 },
  "vfx-sparks": { kind: "sparks", amount: 0.55, speed: 1, direction: "up" },
  "vfx-remove": { how: "describe", words: "", engine: "void", size: 60, grow: 2, brush: "brush" },
  "vfx-background": { mode: "new" },
  "vfx-relight": { mode: "picture", words: "warm golden light from the left" },
  "vfx-restyle": { style: "anime", words: "", engine: "open" },
  "vfx-retouch": {},
};
/** A tool's settings as they stand: what it starts with, then what was changed. */
export const paramsOf = (id) => ({ ...DEFAULTS[id], ...inputOf(id) });

export const LIGHTS = [
  ["warm golden light from the left", "Golden"],
  ["soft window light from the side", "Window"],
  ["neon night glow in pink and blue", "Neon"],
  ["dramatic hard side light with deep shadows", "Dramatic"],
  ["overcast soft daylight", "Overcast"],
];
export const STYLES = [
  ["anime", "Anime", "anime film style, hand-painted backgrounds, cel shading, clean linework"],
  ["clay", "Clay", "claymation, stop-motion clay figures, soft studio light, visible fingerprints"],
  ["noir", "Film noir", "black and white film noir, hard shadows, high contrast, 1940s cinema"],
  ["watercolour", "Watercolour", "watercolour painting, soft washes of colour, paper texture"],
  ["comic", "Comic", "comic book style, bold ink outlines, halftone dots, flat colours"],
  ["pixel", "Pixel art", "pixel art, 16-bit video game style, limited palette"],
];
/** The official templates the cloud tools run, by engine: the name in the catalogue, what it is, who runs it, what it takes. */
export const TEMPLATES = {
  void: { name: "utility_void_video_inpainting", title: "VOID", about: "Finds the object by its name and paints it out, with its shadows", partner: null, want: { video: true, text: true }, gpu: 26 },
  obscura: { name: "template_ltx2_3_obscura_remova_lora_remove_object_from_video", title: "Obscura Remova", about: "Removes what you describe, with no mask", partner: null, want: { video: true, text: true }, gpu: 18 },
  vace: { name: "video_wan_vace_inpainting", title: "Wan VACE", about: "Finds the object by its name and fills the space", partner: null, want: { video: true, text: true }, gpu: 22 },
  "bg-new": { name: "api_bria_video_replace_background", title: "Bria", about: "Puts a new background behind the people in a clip", partner: "Bria", want: { video: true, image: true }, gpu: 0 },
  "bg-clear": { name: "api_bria_remove_video_background_transparent", title: "Bria", about: "Takes the background out and leaves it clear", partner: "Bria", want: { video: true }, gpu: 0 },
  "light-picture": { name: "image_qwen_image_edit_2509_relight", title: "Qwen Image Edit relight", about: "Changes the light of a picture", partner: null, want: { image: true, text: true }, gpu: 9 },
  "light-clip": { name: "api_beeble_switchx_video_edit", title: "Beeble SwitchX", about: "Relights a clip to match a reference picture", partner: "Beeble", want: { video: true, image: true, text: true }, gpu: 0 },
  "style-open": { name: "video_wan_vace_14B_v2v", title: "Wan VACE", about: "Restyles a clip, following its motion", partner: null, want: { video: true, text: true }, gpu: 24 },
  "style-partner": { name: "api_runway_aleph2_video_edit", title: "Runway Aleph 2", about: "Restyles a clip from a few words", partner: "Runway", want: { video: true, text: true }, gpu: 0 },
  retouch: { name: "api_magnific_skin_enhancer", title: "Magnific", about: "Evens out skin and brings back its texture", partner: "Magnific", want: { image: true }, gpu: 0 },
  interpolate: { name: "utility_video_frame_interpolation", title: "FILM", about: "Makes the frames between the frames with an AI model", partner: null, want: { video: true }, gpu: 3 },
};

/** The template a cloud tool runs with its settings as they stand. */
export function templateOf(id, p) {
  switch (id) {
    case "vfx-remove": return TEMPLATES[p.engine] ?? TEMPLATES.void;
    case "vfx-background": return p.mode === "clear" ? TEMPLATES["bg-clear"] : TEMPLATES["bg-new"];
    case "vfx-relight": return p.mode === "clip" ? TEMPLATES["light-clip"] : TEMPLATES["light-picture"];
    case "vfx-restyle": return p.engine === "partner" ? TEMPLATES["style-partner"] : TEMPLATES["style-open"];
    case "vfx-retouch": return TEMPLATES.retouch;
    case "vfx-slowmo": return TEMPLATES.interpolate;
    default: return null;
  }
}

// ---------------------------------------------------------------- what each tool is

const media = (i) => i.video?.file;
export const VFX = [
  { id: "vfx-remove", name: "Remove an object", hint: "Erase an object or a person from a clip", icon: "tool-fx-remove", way: "mixed", takes: ["video"], verb: "Remove it", tag: "Cloud · or free" },
  { id: "vfx-background", name: "Replace the background", hint: "A new background behind the people, or none at all", icon: "tool-fx-background", way: "cloud", takes: ["video"], verb: "Change it", tag: "Cloud · partner" },
  { id: "vfx-chroma", name: "Green-screen cutout", hint: "Take out a green or blue screen and keep the subject", icon: "tool-fx-chroma", way: "local", takes: ["video"], verb: "Cut it out", tag: "Free · this machine" },
  { id: "vfx-relight", name: "Relight", hint: "Change the light and mood of a picture or a clip", icon: "tool-fx-relight", way: "cloud", takes: ["image"], verb: "Relight", tag: "Cloud" },
  { id: "vfx-restyle", name: "Restyle", hint: "Anime, clay, film noir: the same motion, a new look", icon: "tool-fx-restyle", way: "cloud", takes: ["video"], verb: "Restyle", tag: "Cloud" },
  { id: "vfx-weather", name: "Add rain, snow or fog", hint: "Weather laid over the clip, as an overlay effect", icon: "tool-fx-weather", way: "local", takes: ["video"], verb: "Add it", tag: "Free · this machine" },
  { id: "vfx-stabilise", name: "Stabilise", hint: "Take the shake out of a handheld shot", icon: "tool-fx-stabilise", way: "local", takes: ["video"], verb: "Stabilise", tag: "Free · this machine" },
  { id: "vfx-slowmo", name: "Slow motion", hint: "Smooth slow motion by making the frames between", icon: "tool-fx-slowmo", way: "local", takes: ["video"], verb: "Slow it", tag: "Free · or Cloud" },
  { id: "vfx-retouch", name: "Face and skin retouch", hint: "Even out skin and keep its texture, in a picture", icon: "tool-fx-retouch", way: "cloud", takes: ["image"], verb: "Retouch", tag: "Cloud · partner" },
  { id: "vfx-grade", name: "Colour grade and LUTs", hint: "Looks, curves and .cube LUTs: this lives in Edit", icon: "tool-edit-grade", way: "link", takes: [], verb: "Open it", tag: "Free · in Edit" },
  { id: "vfx-sparks", name: "Add particles and sparks", hint: "Sparks, embers or drifting dust over the clip", icon: "tool-fx-sparks", way: "local", takes: ["video"], verb: "Add it", tag: "Free · this machine" },
];
export const vfxById = (id) => VFX.find((t) => t.id === id) ?? VFX[0];
export const isVfx = (id) => VFX.some((t) => t.id === id);
export const cloudTool = (id) => ["cloud", "mixed"].includes(vfxById(id).way);
/** Whether a tool, with its settings as they stand, runs on Comfy Cloud now (a few have both a free way and a cloud way). */
export function cloudNow(id, p = paramsOf(id)) {
  if (id === "vfx-remove") return p.how !== "paint";
  if (id === "vfx-slowmo") return !!p.ai;
  return vfxById(id).way === "cloud";
}
/** The mask painted on the stage, kept by the clip (a tool that removes a spot reads it; the stage sets it). */
export const masks = new Map();

// ---------------------------------------------------------------- what is wanted to run, what it costs

/** Whether a tool has what it needs now. */
export function readyOf(id, i = inputOf(id)) {
  const p = { ...DEFAULTS[id], ...i };
  switch (id) {
    case "vfx-chroma": case "vfx-stabilise": case "vfx-weather": case "vfx-sparks": case "vfx-slowmo": return !!i.video?.file;
    case "vfx-remove": return !!i.video?.file && (p.how === "paint" ? masks.has(i.video.url) : !!String(p.words ?? "").trim());
    case "vfx-background": return !!i.video?.file && (p.mode === "clear" || !!p.picture?.file);
    case "vfx-relight": return p.mode === "clip" ? !!i.video?.file && !!p.picture?.file && !!String(p.words ?? "").trim() : !!i.image?.file && !!String(p.words ?? "").trim();
    case "vfx-restyle": return !!i.video?.file && !!String(p.words || STYLES.find((s) => s[0] === p.style)?.[2] || "").trim();
    case "vfx-retouch": return !!i.image?.file;
    default: return false;
  }
}

/** What the picture of the tool is told: the clip or the picture, the words, the other picture. */
export function givenOf(id, p, i) {
  const given = {};
  if (i.video?.file) given.video = { file: i.video.file, url: i.video.url, name: "clip" };
  if (id === "vfx-relight" && p.mode === "picture" && i.image?.file) given.image = { file: i.image.file, url: i.image.url, name: "picture" };
  else if (id === "vfx-retouch" && i.image?.file) given.image = { file: i.image.file, url: i.image.url, name: "picture" };
  else if (p.picture?.file) given.image = { file: p.picture.file, url: p.picture.url, name: "picture" };
  const words = String(p.words ?? "").trim();
  if (id === "vfx-restyle") given.text = words || STYLES.find((s) => s[0] === p.style)?.[2] || "";
  else if (id === "vfx-remove") given.text = p.engine === "obscura" && !/^remove/i.test(words) ? `Remove ${words}.` : words;
  else if (id === "vfx-relight") given.text = `relight the image using ${words}`;
  else if (words) given.text = words;
  return given;
}

const guessed = (id, p, i) => {
  const t = templateOf(id, p);
  if (!t || t.partner || !t.gpu) return null;
  const seconds = id === "vfx-relight" ? 1 : Math.min(12, i.video?.duration ?? 5);
  return Math.max(1, Math.round(seconds * t.gpu * 0.266));
};
const estimates = new Map();
/**
 * What a cloud tool costs, as { credits, label, partner }: the runner's own estimate once it has answered (the screen is drawn again
 * then). A partner's price is the runner's (credits, per unit when the node prices that way); an open model has none, only GPU time,
 * which is guessed from the clip's length ("≈ 7 cr of GPU time"). Free ways answer { credits: 0 }. null while nothing is known.
 */
export function costFor(id, i = inputOf(id), redraw = () => {}) {
  const p = paramsOf(id);
  if (!cloudNow(id, p)) return { credits: 0, label: "Free", partner: null };
  const t = templateOf(id, p);
  if (!t) return null;
  if (!estimates.has(t.name)) {
    estimates.set(t.name, undefined);
    costOf(t.name).then((e) => (estimates.set(t.name, e ?? null), redraw()));
  }
  const e = estimates.get(t.name);
  if (t.partner) return e && typeof e.credits === "number" && e.credits > 0 ? { credits: e.credits, label: priceText(e), partner: t.partner } : { credits: null, label: "≈ ? cr", partner: t.partner };
  const g = guessed(id, p, i);
  return g === null ? null : { credits: g, label: `≈ ${g} cr`, partner: null, gpu: true };
}

// ---------------------------------------------------------------- how each runs

/** The running job of a tool (the queue made it a moment ago), so it can be stopped on the server too. */
const jobOf = (tool) => utensils.jobs.find((j) => j.tool === tool && j.status === "running");
async function local(tool, server, body, set, note) {
  const job = jobOf(tool);
  const made = await fxRun(server, body, set, (id) => job && (job.onCancel = () => fxStop(id)));
  return made.map((r) => asResult(r, note ?? r.note));
}

/** The free tools, run: from what they were given and their settings. Answers the results (the queue keeps them). */
export const RUN = {
  "vfx-chroma": (i, set) => {
    const p = paramsOf("vfx-chroma");
    return local("vfx-chroma", "chroma", { video: media(i), colour: p.colour, similarity: p.similarity, blend: p.blend, despill: p.despill, output: p.output, background: p.background, picture: p.picture?.file, title: i.video?.name }, set);
  },
  "vfx-stabilise": (i, set) => {
    const p = paramsOf("vfx-stabilise");
    return local("vfx-stabilise", "stabilise", { video: media(i), shakiness: p.shakiness, smoothness: p.smoothness, zoom: p.zoom, edges: p.edges, sharpen: p.sharpen }, set);
  },
  "vfx-slowmo": (i, set) => {
    const p = paramsOf("vfx-slowmo");
    return local("vfx-slowmo", "slowmo", { video: media(i), factor: p.factor, mode: p.mode, audio: p.audio }, set);
  },
  "vfx-weather": (i, set) => {
    const p = paramsOf("vfx-weather");
    return local("vfx-weather", "weather", { video: media(i), kind: p.kind, amount: p.amount, speed: p.speed, angle: p.angle }, set);
  },
  "vfx-sparks": (i, set) => {
    const p = paramsOf("vfx-sparks");
    return local("vfx-sparks", "sparks", { video: media(i), kind: p.kind, amount: p.amount, speed: p.speed, direction: p.direction }, set);
  },
  "vfx-remove:paint": (i, set) => {
    const p = paramsOf("vfx-remove");
    return local("vfx-remove", "unlogo", { video: media(i), grow: p.grow, mask: masks.get(i.video.url) }, set, "A spot removed");
  },
};

/** A tool that runs on Comfy Cloud: the template, filled from the tool's fields, run with the person's yes to the price; the runner keeps what it made as results of the tool. */
export async function runCloudTool(id) {
  const i = inputOf(id);
  const p = paramsOf(id);
  const t = templateOf(id, p);
  if (!t || !(await runnerOf())) return null;
  return runCloud(t.name, t.want, givenOf(id, p, i), { tool: id, label: vfxById(id).name, extra: p.extra, credits: costFor(id, i)?.credits ?? null, note: t.partner ? `${t.title} (partner)` : t.title });
}

/** What runs on this machine for a tool, with its settings as they stand: the free tools and the free ways of two others. */
function runFree(id, i, set) {
  const p = paramsOf(id);
  if (cloudNow(id, p)) throw new Error("This one runs on Comfy Cloud from its own workbench: open VFX and press its yellow key.");
  return (id === "vfx-remove" ? RUN["vfx-remove:paint"] : RUN[id])(i, set);
}
/** Opens the grade tool of the Edit workspace (the grade is made there, once). */
export function openGrade() {
  setWorkspace("edit");
  pickTool("ed-grade");
}

let registered = false;
/** The tools, on the shelf (once). */
export function registerVfxTools() {
  if (registered) return;
  registered = true;
  const OPTIONS = {
    "vfx-chroma": [{ key: "colour", type: "text" }, { key: "similarity", type: "range", min: 0.01, max: 0.6 }, { key: "blend", type: "range", min: 0, max: 0.5 }, { key: "output", type: "choice", values: ["webm", "mov", "colour", "picture"] }],
    "vfx-stabilise": [{ key: "shakiness", type: "range", min: 1, max: 10 }, { key: "smoothness", type: "range", min: 1, max: 100 }, { key: "zoom", type: "choice", values: ["auto", "none"] }],
    "vfx-slowmo": [{ key: "factor", type: "choice", values: [1.5, 2, 3, 4] }, { key: "mode", type: "choice", values: ["mci", "blend", "dup"] }, { key: "audio", type: "choice", values: ["slow", "mute"] }],
    "vfx-weather": [{ key: "kind", type: "choice", values: ["rain", "snow", "fog"] }, { key: "amount", type: "range", min: 0, max: 1 }, { key: "speed", type: "range", min: 0.2, max: 3 }],
    "vfx-sparks": [{ key: "kind", type: "choice", values: ["sparks", "embers", "dust"] }, { key: "amount", type: "range", min: 0, max: 1 }, { key: "direction", type: "choice", values: ["up", "down"] }],
  };
  for (const t of VFX) {
    const free = !!RUN[t.id] || t.id === "vfx-remove";
    registerTool({
      id: t.id, workspace: "vfx", name: t.name, icon: t.icon, hint: t.hint, takes: t.takes, verb: t.verb,
      options: OPTIONS[t.id],
      ready: (i) => readyOf(t.id, { ...inputOf(t.id), ...i }),
      cost: () => costFor(t.id)?.credits ?? null,
      // the free ways Truffle can run; the cloud ways ask for a yes in their own bench
      ...(free ? { run: (i, set) => runFree(t.id, i, set) } : {}),
    });
  }
  // the tool that was open when the page was left is open again (the shelf read it before these tools were on it)
  try {
    const kept = JSON.parse(localStorage.getItem("comfyture.utensils") ?? "{}");
    if (isVfx(kept.tool)) utensils.tool = kept.tool;
  } catch {}
}
