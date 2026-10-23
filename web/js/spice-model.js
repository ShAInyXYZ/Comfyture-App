// What Spice keeps of a shot, and the plain rules on it: no page, no network, so the tests read every one. A SHOT is the footage and the
// passes the six departments (spice-harness.js) have made of it. Each department's pass is a picture or a clip kept in the library
// ({ media, eye, from, to, note, credits, at }): the picture passes (the plate, the clean-up, the relight, the effect) each build on the
// one before and the top one that is shown is the picture of the shot; Roto's pass is a matte beside them (what Fx and Comp may use as
// a holdout), and Comp's is the finished composite. The frames are numbered as a slate numbers them: the first is 1001.
import { DEPARTMENTS } from "./spice-harness.js";

export const FIRST = 1001;
/** The passes that are the picture of the shot, from the footage up: each is made from the one below it. */
export const PICTURES = ["plate", "paint", "light", "fx"];
/** The stack as it is drawn: the last department on top, the footage at the bottom. */
export const STACK = [...DEPARTMENTS].reverse();

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round1 = (v) => Math.round(v * 10) / 10;

// ---------------------------------------------------------------- frames

/** The slate number of the frame at a time of the clip. */
export const frameAt = (seconds, fps = 24) => FIRST + Math.max(0, Math.round(seconds * fps));
/** The time of a slate number. */
export const secondsAt = (frame, fps = 24) => Math.max(0, (frame - FIRST) / fps);
/** How many frames a clip of that length has. */
export const framesIn = (seconds, fps = 24) => Math.max(1, Math.round(seconds * fps));
/** The last slate number of the footage (a picture is one frame). */
export function lastFrame(plate) {
  const m = plate?.media;
  if (!m || m.kind === "image") return FIRST;
  return FIRST + framesIn(m.seconds ?? 0, plate.fps ?? 24) - 1;
}
/** The frame range of the shot as it is worked on: the range chosen, else the whole footage. */
export function rangeOf(body) {
  const last = lastFrame(body.passes.plate);
  const r = body.range;
  if (!r) return { in: FIRST, out: last };
  const a = clamp(Math.round(r.in), FIRST, last);
  return { in: a, out: clamp(Math.round(r.out), a, last) };
}
/** "1001 – 1120". */
export const rangeText = (r) => `${r.in} – ${r.out}`;

// ---------------------------------------------------------------- the shot

export const blankBody = () => ({
  passes: { plate: null, roto: null, paint: null, light: null, fx: null, comp: null },
  /** the analysis pass of the footage: its depth */
  depth: null,
  range: null,
  set: {
    roto: { subjects: [], open: null, feather: 2.4, choke: -0.8, out: "alpha" },
    paint: { how: "describe", words: "", after: "", engine: "void" },
    light: { look: "warm golden light from the left", words: "", reference: null, sky: null, weather: "rain", amount: 0.55, grade: "warm", exposure: 0, contrast: 1, saturation: 1 },
    fx: { element: "portal", words: "", place: { x: 0.62, y: 0.4, size: 0.6 }, when: null, ease: "inout", intensity: 0.8, spill: 0.65, depth: "behind" },
    comp: { height: 1080, factor: 2, engine: "free", format: "mp4", exports: [] },
  },
  log: [],
});

/** A shot as the server kept it, with whatever a version before this one did not know filled in. */
export function normaliseBody(raw) {
  const blank = blankBody();
  const b = raw && typeof raw === "object" ? raw : {};
  const set = {};
  for (const d of Object.keys(blank.set)) set[d] = { ...blank.set[d], ...(b.set?.[d] ?? {}) };
  set.fx.place = { ...blank.set.fx.place, ...(b.set?.fx?.place ?? {}) };
  set.roto.subjects = Array.isArray(set.roto.subjects) ? set.roto.subjects : [];
  return { ...blank, ...b, passes: { ...blank.passes, ...(b.passes ?? {}) }, set, log: Array.isArray(b.log) ? b.log.slice(-200) : [] };
}

export const passOf = (body, dept) => (dept === "depth" ? body.depth : body.passes[dept]) ?? null;
/** Whether a pass shows in the viewer's comp: it has something and its eye is open. */
export const visible = (pass) => !!pass?.media && pass.eye !== false;

/** The lamp of a department's row: green when its pass is there, amber while it works, hollow when it is empty. */
export const lampOf = (body, dept, working = false) => (working ? "busy" : passOf(body, dept)?.media ? "done" : "empty");

/** How many of the six departments have made their pass. */
export const passesDone = (body) => DEPARTMENTS.filter((d) => !!passOf(body, d)?.media).length;

/**
 * What the viewer wipes between in a department: the footage on the left, and on the right what the shot is with this department's work
 * on it (the top pass that is shown, from the footage up to this department). Roto shows the footage against its matte; Comp the footage
 * against the finished composite, or the stack as it stands; the plate against its depth when that has been read.
 * Answers { before, after } as { media, dept } or null.
 */
export function pairOf(body, dept) {
  const plate = visible(body.passes.plate) ? { media: body.passes.plate.media, dept: "plate" } : null;
  const top = (list) => {
    for (const d of [...list].reverse()) if (visible(body.passes[d])) return { media: body.passes[d].media, dept: d };
    return null;
  };
  if (dept === "roto") return { before: plate, after: visible(body.passes.roto) ? { media: body.passes.roto.media, dept: "roto" } : null };
  if (dept === "plate") return { before: plate, after: visible(body.depth) ? { media: body.depth.media, dept: "depth" } : plate };
  const upto = dept === "comp" ? [...PICTURES, "comp"] : PICTURES.slice(0, PICTURES.indexOf(dept) + 1);
  return { before: plate, after: top(upto) ?? plate };
}

/** Whether a pass covers a frame: a pass has the frames it worked on (all of the footage when it names none). */
const covers = (pass, frame, last) => frame >= (pass.from ?? FIRST) && frame <= (pass.to ?? last);

/**
 * What the right side of the viewer shows at a frame in a department: the top pass, from the footage up to the department, that is shown
 * and has worked on that frame ({ media, dept, from }), else null (the footage itself shows). An effect that plays only on some frames
 * is a layer on those frames only.
 */
export function layerAt(body, dept, frame) {
  const last = lastFrame(body.passes.plate);
  const list = dept === "roto" ? ["roto"] : dept === "plate" ? ["depth"] : dept === "comp" ? [...PICTURES, "comp"] : PICTURES.slice(0, PICTURES.indexOf(dept) + 1);
  for (const d of [...list].reverse()) {
    const p = passOf(body, d);
    if (d !== "plate" && visible(p) && covers(p, frame, last)) return { media: p.media, dept: d, from: p.from ?? FIRST };
  }
  return null;
}

/** The picture of the shot now: the top pass of the picture passes that is shown (what Comp makes of the stack). */
export function topOf(body) {
  for (const d of ["comp", ...[...PICTURES].reverse()]) if (visible(body.passes[d])) return { media: body.passes[d].media, dept: d };
  return null;
}

/** The frames each department has worked on, for the timeline's bars: { dept: [from, to] }. */
export function barsOf(body) {
  const r = { in: FIRST, out: lastFrame(body.passes.plate) };
  const bars = {};
  for (const d of DEPARTMENTS) {
    const p = body.passes[d];
    if (p?.media) bars[d] = [clamp(p.from ?? r.in, r.in, r.out), clamp(p.to ?? r.out, r.in, r.out)];
  }
  return bars;
}

// ---------------------------------------------------------------- credits

const sameDay = (iso, now) => new Date(iso).toDateString() === new Date(now).toDateString();
/** Keeps what a pass cost: the day, the department, what it was, the credits. */
export function logCredits(body, entry, now = Date.now()) {
  body.log = [...(body.log ?? []), { at: new Date(now).toISOString(), dept: entry.dept, label: entry.label, credits: Math.round((Number(entry.credits) || 0) * 10) / 10 }].slice(-200);
  return body;
}
/** The credits spent today on the shots given (each shot's body or its list entry). */
export const creditsToday = (logs, now = Date.now()) => Math.round(logs.flat().filter((e) => e && sameDay(e.at, now)).reduce((n, e) => n + (Number(e.credits) || 0), 0));

// ---------------------------------------------------------------- what the engines cost

/** About what a Comfy Cloud run of LTX costs: its seconds of video at 18 s of GPU for each, 0.266 credits a GPU second. */
export const ltxCredits = (seconds) => Math.max(1, Math.round(seconds * 18 * 0.266));
/** About what a template that bills only GPU time costs: the seconds of footage times the template's seconds of GPU per second. */
export const gpuCredits = (gpuPerSecond, seconds) => Math.max(1, Math.round(Math.min(12, Math.max(1, seconds)) * gpuPerSecond * 0.266));

// ---------------------------------------------------------------- Fx

/**
 * The elements: each a tile of the Elements bento. `preset` is the Kitchen preset it comes from (presets/<id>/preset.json: its script is what
 * LTX is told); the free one runs on this machine with ffmpeg and costs nothing.
 */
export const ELEMENTS = [
  { id: "portal", name: "Portal", verb: "Add the portal", preset: "portal" },
  { id: "fire", name: "Fire", verb: "Add the fire", preset: "set-on-fire" },
  { id: "explosion", name: "Explosion", verb: "Add the explosion", preset: "explosion" },
  { id: "lightning", name: "Lightning", verb: "Add the lightning", preset: "thunder-god" },
  { id: "disintegrate", name: "Disintegrate", verb: "Disintegrate it", preset: "disintegrate" },
  { id: "hologram", name: "Hologram", verb: "Make it a hologram", preset: "hologram" },
  { id: "freeze", name: "Freeze", verb: "Freeze it", preset: "freeze" },
  { id: "petals", name: "Petal storm", verb: "Add the petal storm", preset: "petal-storm" },
  { id: "levitate", name: "Levitate", verb: "Make it float", preset: "levitate" },
  { id: "shatter", name: "Shatter", verb: "Shatter it", preset: "shatter" },
  { id: "sparks", name: "Sparks", verb: "Add the sparks", free: true },
];
export const elementById = (id) => ELEMENTS.find((e) => e.id === id) ?? ELEMENTS[0];

export const EASES = [["linear", "Linear"], ["in", "Ease in"], ["out", "Ease out"], ["inout", "Ease in out"]];
/** An ease curve at t (0 to 1): the shape of the WHEN bento's curve. */
export function easeAt(kind, t) {
  const x = clamp(t, 0, 1);
  if (kind === "in") return x * x;
  if (kind === "out") return 1 - (1 - x) * (1 - x);
  if (kind === "inout") return x < 0.5 ? 2 * x * x : 1 - 2 * (1 - x) * (1 - x);
  return x;
}

/** The frames the effect plays on: what was chosen, else the second half of the range. */
export function whenOf(body) {
  const r = rangeOf(body);
  const w = body.set.fx.when;
  if (!w) return { from: r.in + Math.floor((r.out - r.in) / 2), to: r.out };
  const from = clamp(Math.round(w.from), r.in, r.out);
  return { from, to: clamp(Math.round(w.to), from, r.out) };
}
/** How many seconds of video the effect is made as (LTX makes two to ten). */
export const fxSeconds = (when, fps = 24) => clamp(Math.round((when.to - when.from + 1) / fps), 2, 10);

/**
 * What LTX is told for an element: the preset's own action (or the words the person put in its place), then where it is, how big, how
 * strong, behind or in front of the people, how its light falls and how it builds. Every sentence is a plain statement of the mix.
 */
export function fxPrompt(base, set) {
  const p = set.place ?? {};
  const x = p.x ?? 0.5;
  const y = p.y ?? 0.5;
  const size = (p.size ?? 0.6) < 0.4 ? "small" : (p.size ?? 0.6) < 0.75 ? "medium sized" : "large";
  const where = `${x < 0.34 ? "on the left" : x > 0.66 ? "on the right" : "in the middle"}, ${y < 0.34 ? "high in the frame" : y > 0.66 ? "low in the frame" : "at the middle of the frame"}`;
  const strength = (set.intensity ?? 0.8) < 0.35 ? "Keep it subtle." : (set.intensity ?? 0.8) > 0.75 ? "Make it huge and dramatic." : "";
  const spill = (set.spill ?? 0.5) >= 0.5 ? "Its light spills onto the wet surfaces and onto the people." : (set.spill ?? 0.5) < 0.2 ? "Its light does not touch the surroundings." : "";
  const depth = set.depth === "front" ? "It passes in front of the people." : "It stays behind the people, who stay fully visible in front of it.";
  const ease = { in: "It starts slowly and builds.", out: "It starts fast and fades away gently.", inout: "It builds smoothly, peaks, then settles." }[set.ease] ?? "";
  return [String(set.words ?? "").trim() || base, `The effect is ${size}, ${where}.`, strength, spill, depth, ease].filter(Boolean).join(" ");
}

// ---------------------------------------------------------------- Roto

/** The points of a subject as the segmenter takes them, in pixels of the frame: [{x, y}] for the ones that are on it, and for the ones that are not. */
export function pointsOf(subject, width, height) {
  const px = (p) => ({ x: Math.round(clamp(p.x, 0, 1) * width), y: Math.round(clamp(p.y, 0, 1) * height) });
  const pts = Array.isArray(subject?.points) ? subject.points : [];
  return { positive: pts.filter((p) => !p.neg).map(px), negative: pts.filter((p) => p.neg).map(px) };
}
/**
 * What Roto asks the tracker for a subject (the server's spice/matte, workflows/matte.json): its name, and its clicks on the first frame
 * it was clicked on within the range, as pixels of that frame, with that frame counted from the clip's first (`key`). The tracker follows
 * the subject from there to the end, so the matte starts on that frame (`from`); with no clicks, the name is followed from the first.
 */
export function matteAsk(subject, width, height, rangeIn = FIRST) {
  const at = (p) => p.frame ?? FIRST;
  const pts = (Array.isArray(subject?.points) ? subject.points : []).filter((p) => at(p) >= rangeIn);
  const key = pts.length ? Math.min(...pts.map(at)) : rangeIn;
  const { positive, negative } = pointsOf({ points: pts.filter((p) => at(p) === key) }, width, height);
  return { text: String(subject?.name ?? "").trim().slice(0, 120), positive, negative, key: key - rangeIn, from: positive.length ? key : rangeIn };
}

/** What each of Roto's three outputs hands on, for its tile's tooltip. */
export const OUTS = [
  { id: "alpha", name: "Alpha", about: "A black and white matte: the subject in white" },
  { id: "green", name: "Green screen", about: "The subject on a flat green, ready to key" },
  { id: "holdout", name: "Holdout", about: "The matte kept to hold the subject in front of what is added behind it" },
];

// ---------------------------------------------------------------- a shot's name and what its card says

/** A new shot's name: SH010, SH020... after the ones there are. */
export function nextName(list) {
  const used = list.map((s) => /^SH(\d+)/i.exec(String(s.name ?? ""))?.[1]).filter(Boolean).map(Number);
  const n = (used.length ? Math.max(...used) : 0) + 10;
  return `SH${String(n).padStart(3, "0")}`;
}
/** A shot's name as the panel shows it: "SH010 · Rooftop portal". */
export const titleOf = (shot) => String(shot?.name ?? "Untitled shot");

// ---------------------------------------------------------------- the Comfy Cloud templates each department runs

/**
 * The official templates (the catalogue's names) the departments run through the template runner, what they take and who bills them: a
 * partner's price is the runner's own estimate, an open model has only GPU time, guessed from the seconds of footage (`gpu` seconds of
 * GPU for each second, the same numbers Utensils' VFX tools use). `dept` is the department that runs it.
 */
export const TEMPLATES = {
  // (priced and named as the official template, run through Comfyture's own graph: SAM3 finds the subject and its tracker follows it)
  sam3: { dept: "roto", name: "utility_video_segment_sam3", title: "SAM3", about: "Finds the subject where it was clicked and tracks it through the footage", want: { video: true, text: true }, gpu: 10 },
  green: { dept: "roto", name: "api_bria_video_green_screen", title: "Bria", partner: "Bria", about: "Puts the subject on a flat green", want: { video: true } },
  cutout: { dept: "roto", name: "api_bria_remove_video_background_transparent", title: "Bria", partner: "Bria", about: "Takes the background out and leaves it clear", want: { video: true } },
  depth: { dept: "plate", name: "utility_depth_anything3_video_depth_estimation", title: "Depth Anything 3", about: "A depth map of every frame", want: { video: true }, gpu: 8 },
  // (VOID takes its words as two of its own, its object and the place without it: voidExtra below)
  void: { dept: "paint", name: "utility_void_video_inpainting", title: "VOID", about: "Finds the object by its name and paints it out, with its shadows", want: { video: true }, gpu: 26 },
  obscura: { dept: "paint", name: "template_ltx2_3_obscura_remova_lora_remove_object_from_video", title: "Obscura Remova", about: "Removes what you describe, with no mask", want: { video: true, text: true }, gpu: 18 },
  watermark: { dept: "paint", name: "template_ltx2_3_remove_watermark_from_video", title: "LTX 2.3 watermark", about: "Takes a logo or a watermark out of the footage", want: { video: true }, gpu: 18 },
  subtitles: { dept: "paint", name: "template_ltx2_3_lora_remove_subtitles_from_video", title: "LTX 2.3 subtitles", about: "Takes the subtitles off the footage", want: { video: true }, gpu: 18 },
  beeble: { dept: "light", name: "api_beeble_switchx_video_edit", title: "Beeble SwitchX", partner: "Beeble", about: "Relights the footage to match a reference picture", want: { video: true, image: true, text: true } },
  background: { dept: "light", name: "api_bria_video_replace_background", title: "Bria", partner: "Bria", about: "Puts a new sky or background behind the people", want: { video: true, image: true } },
  qwen: { dept: "light", name: "image_qwen_image_edit_2509_relight", title: "Qwen Image Edit", about: "Changes the light of a picture", want: { image: true, text: true }, gpu: 9 },
  film: { dept: "comp", name: "utility_video_frame_interpolation", title: "FILM", about: "Makes the frames between the frames with an AI model", want: { video: true }, gpu: 3 },
};
/** What a template run brought back, as a pass's media. */
export const mediaOf = (r) => ({
  kind: r.kind === "image" ? "image" : "video",
  url: r.url, file: r.file, width: r.width, height: r.height,
  ...(r.kind === "image" ? {} : { seconds: r.duration ?? r.seconds }),
});
/**
 * The clip of what came back, else its picture: a template that also saves a side-by-side comparison (the LTX clean-ups) or a rough
 * first pass (VOID) has its result told by the name Cloud saved it under, so the comparison and the rough pass are never the pass.
 */
const rank = (r) => (r.kind === "video" ? 0 : 4) + (/compar/i.test(r.saved ?? "") ? 2 : 0) + (/pass_?1\b|pass1/i.test(r.saved ?? "") ? 1 : 0);
export const pickMedia = (list) => {
  const all = (Array.isArray(list) ? list : [list]).filter((r) => r?.url && (r.kind === "video" || r.kind === "image"));
  const m = all.slice().sort((a, b) => rank(a) - rank(b))[0];
  return m ? mediaOf(m) : null;
};


/**
 * VOID's own inputs, for Spice's Paint and Utensils' Remove (it takes two sets of words, not one): SAM3 finds the object by a short name (32 tokens at most), and the hole is
 * filled from words that say how the place looks without it, never naming what is gone (or it comes back). It works at its model's own
 * size, about 672 x 384 pixels, turned to the clip's shape, over the whole clip in whole seconds (ten at most).
 */
export const VOID_AFTER = "The same place with nothing there: what was behind carries on naturally, the same light and colours, a steady camera.";
export function voidExtra(words, after, { width, height, seconds } = {}) {
  const what = String(words ?? "").trim().replace(/^remove\s+/i, "").replace(/[.!]+$/, "").split(/\s+/).slice(0, 12).join(" ");
  const shape = width > 0 && height > 0 ? width / height : 16 / 9;
  const w = Math.max(256, Math.round(Math.sqrt(672 * 384 * shape) / 16) * 16);
  const h = Math.max(256, Math.round(Math.sqrt((672 * 384) / shape) / 16) * 16);
  return {
    sam3_object_mask_prompt: what,
    positive_prompt_inpaint_fill_: String(after ?? "").trim() || VOID_AFTER,
    width_pass_2_: w, height_pass_2_: h,
    start_frame_index: 0, clip_duration_seconds_: Math.max(1, Math.min(10, Math.ceil(seconds || 5))),
  };
}

/** The engines of Paint's object removal, by id (the first is the one it starts with). */
export const REMOVERS = ["void", "obscura"];
