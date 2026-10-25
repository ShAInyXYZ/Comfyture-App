// Spice v2, the AI edit bay: what it keeps of a shot and the plain rules on it. No page, no network, so the tests read every one.
// (docs/SPICE-V2.md.) A SHOT is a clip and the seven stages that edit it. Each stage keeps TAKES: every run is one, none replaces another,
// and one is marked as the stage's pass. A stage works from the pass of the stages before it (or from the clip), unless the person
// points it at another. The ENGINES of a stage are Comfy Cloud templates (the models that do the job); the ones listed here are
// curated, and any template of the live catalog that fits a stage's pattern is added as one more engine, so a model that arrives is
// there without a change to this file.

export const FIRST = 1001;

/**
 * The seven stages, in the order a finishing editor runs them. `icon` is a sprite of the app; `verb` is what the stage's label says
 * beside its name; `makes` is what it hands on; `clip` says its pass is a clip the next stage can take (Select's is a matte beside).
 */
export const STAGES = [
  { id: "conform", name: "Conform", icon: "tool-edit-trim", verb: "Prepare the clip", makes: "the clip trimmed and set to the size and rate the editors take", clip: true, local: true },
  { id: "select", name: "Select", icon: "tool-cutout", verb: "Pick the subject", makes: "a matte of the subject, tracked through the clip", clip: false },
  { id: "clean", name: "Clean", icon: "tool-fx-remove", verb: "Take something out", makes: "the clip with the object, the subtitles or the logo gone", clip: true },
  { id: "direct", name: "Direct", icon: "tool-vfx", verb: "Change it by words", makes: "the clip edited as described, relit or recast", clip: true },
  { id: "control", name: "Control", icon: "tool-fx-relight", verb: "Redraw it under a guide", makes: "the clip drawn again by LTX under the guide of the source", clip: true },
  { id: "extend", name: "Extend", icon: "tool-edit-merge", verb: "Make it longer", makes: "the clip continued, or a bridge between two takes", clip: true },
  { id: "finish", name: "Finish", icon: "tool-upscale-video", verb: "Finish and export", makes: "the clip upscaled, with its sound, ready to deliver", clip: true },
];
export const STAGE_IDS = STAGES.map((s) => s.id);
export const stageOf = (id) => STAGES.find((s) => s.id === id) ?? null;

/** What Paprika says in each stage (the tooltip of her face) and the placeholder of her bar. */
export const SAY = {
  conform: "Show me the clip.",
  select: "Click who I should follow.",
  clean: "What is in the way?",
  direct: "What should be different?",
  control: "Which part must stay as it is?",
  extend: "How much longer, and what happens?",
  finish: "Everything is cut. Ready to finish?",
};
export const PLACEHOLDER = {
  conform: "Ask Paprika — trim to the first eight seconds, which models take this clip?",
  select: "Ask Paprika — follow the boy with the lantern, the van on the left",
  clean: "Ask Paprika — take the van out, the sign in the back, the subtitles",
  direct: "Ask Paprika — make it a rainy blue hour, swap the street sign for a hand-painted one",
  control: "Ask Paprika — keep his walk and redraw the look, hold his face from the sheet",
  extend: "Ask Paprika — continue for eight seconds, the lanterns rise",
  finish: "Ask Paprika — upscale it, add the rain and the steps, export the reel",
};

// ---------------------------------------------------------------- the engines

/**
 * The engines, by stage. `name` is the template of Comfy Cloud; `needs` what its form asks of the shot (video, image: a reference
 * picture, images: how many, text: words); `max` the longest clip it takes, in seconds; `gpu` a guess of the credits per second for an
 * open model (a partner's price is the runner's own estimate); `mode` is the way a stage's engines are grouped; `why` is the line
 * Paprika gives when she picks it. Nothing here runs by itself: a run is the person's yes.
 */
const e = (stage, mode, name, title, maker, o) => ({ stage, mode, name, title, maker, ...o });
export const ENGINES = [
  // Select
  e("select", "track", "utility_video_segment_sam3", "SAM3", "Meta", { about: "Finds the subject where it was clicked and follows it through the clip", needs: { video: true, text: true }, gpu: 10, why: "follows the subject you click, free of any partner" }),
  e("select", "cut", "api_bria_video_green_screen", "Bria green screen", "Bria", { about: "Puts the subject on a flat green", needs: { video: true }, partner: true, why: "a clean green for a keyer" }),
  e("select", "cut", "api_bria_remove_video_background_transparent", "Bria cut-out", "Bria", { about: "Takes the background out and leaves it clear", needs: { video: true }, partner: true, why: "a clear background in one step" }),
  // Clean
  e("clean", "object", "utility_void_video_inpainting", "VOID", "Netflix", { about: "Finds the object by name and paints it out, with its shadows", needs: { video: true, text: true }, max: 10, gpu: 26, special: "void", why: "removes an object together with its shadow and what it did to the scene" }),
  e("clean", "object", "template_ltx2_3_obscura_remova_lora_remove_object_from_video", "Obscura Remova", "Lightricks", { about: "Removes what you describe, with no mask", needs: { video: true, text: true }, gpu: 18, why: "no mask: say what to remove" }),
  e("clean", "text", "template_ltx2_3_lora_remove_subtitles_from_video", "LTX subtitles", "Lightricks", { about: "Takes the subtitles off the clip", needs: { video: true }, gpu: 18, why: "made for burnt-in text" }),
  e("clean", "text", "template_ltx2_3_remove_watermark_from_video", "LTX watermark", "Lightricks", { about: "Takes a logo or a watermark out", needs: { video: true }, gpu: 18, why: "made for logos and watermarks" }),
  // Direct: by words
  e("direct", "words", "api_google_gemini_omni_flash_1_1_edit", "Gemini Omni 1.1 Flash", "Google", { about: "Edits by describing the change; keeps what you did not mention", needs: { video: true, text: true }, max: 10, partner: true, why: "keeps everything you do not name; ten seconds at most" }),
  e("direct", "words", "api_seedance2_5_video_editing", "Seedance 2.5", "ByteDance", { about: "Edits a clip by natural language: local replacement, style, objects", needs: { video: true, text: true }, partner: true, why: "good at replacing one thing in the shot" }),
  e("direct", "words", "api_runway_aleph2_video_edit", "Runway Aleph 2", "Runway", { about: "Applies the changes and keeps the original motion and timing", needs: { video: true, text: true, image: true, images: 2 }, partner: true, why: "keeps the motion and the timing exactly" }),
  e("direct", "words", "api_luma_ray3_2_video_edit", "Luma Ray 3.2", "Luma", { about: "Edits by natural language, one clip in, one clip out", needs: { video: true, text: true }, partner: true, why: "strong on look and mood changes" }),
  e("direct", "words", "api_kling_o3_video_edit", "Kling O3", "Kling", { about: "Edits a clip with a reference picture for what should appear", needs: { video: true, text: true, image: "optional" }, partner: true, why: "takes a reference picture for the new thing" }),
  e("direct", "words", "api_wan2_7_video_edit", "Wan 2.7", "Alibaba", { about: "Replaces characters or scenes with pictures", needs: { video: true, text: true, image: "optional" }, partner: true, why: "replaces a person or a place from a picture" }),
  e("direct", "words", "api_google_gemini_omni_flash_video_edit", "Gemini Omni Flash", "Google", { about: "Edits one clip with words", needs: { video: true, text: true }, max: 10, partner: true, why: "the first Omni Flash, cheaper" }),
  // Direct: relight and look
  e("direct", "look", "api_beeble_switchx_video_edit", "Beeble SwitchX", "Beeble", { about: "Relights the clip to match a reference picture of the place", needs: { video: true, image: true, text: true }, partner: true, why: "a true relight to a reference picture, the subject kept" }),
  e("direct", "look", "video_bernini_r_video_editing", "Bernini-R", "Bernini", { about: "Relights with consistency; portraits and products", needs: { video: true, image: true }, gpu: 20, why: "open model; steady relight on faces and products" }),
  // Direct: recast
  e("direct", "recast", "api_higgsfield_genjutsu_motion_transfer", "Higgsfield Genjutsu", "Higgsfield", { about: "The clip keeps its motion, camera and timing; the person becomes the reference", needs: { video: true, image: true, text: true }, partner: true, why: "puts your character in the same moves" }),
  e("direct", "recast", "video_wan_animate2", "Wan Animate 2", "Alibaba", { about: "Animates a still character with the motion of a clip", needs: { video: true, image: true }, gpu: 22, why: "open model; the character from a picture" }),
  e("direct", "recast", "video_wan21_scail2_character_replacement", "SCAIL-2", "Alibaba", { about: "Replaces the character with a reference, following the clip", needs: { video: true, image: true }, gpu: 22, why: "open model; character replacement" }),
  // Control: the LTX IC-LoRA bay, and H3
  e("control", "union", "video_ltx2_3_ic_lora", "LTX IC-LoRA union control", "Lightricks", { about: "Redraws the clip under a depth, pose or edge guide taken from the source", needs: { video: true, image: true, text: true }, gpu: 18, why: "keeps the motion and the framing, redraws the look" }),
  e("control", "identity", "template_ltx2_3_ic_lora_ingredients", "LTX IC-LoRA Ingredients", "Lightricks", { about: "A reference sheet of characters, props and places the clip must keep", needs: { image: true, text: true }, gpu: 18, why: "holds a character's look from a sheet across the clip" }),
  e("control", "frame", "template_ltx2_3_lora_video_outpainting", "LTX IC-LoRA outpaint", "Lightricks", { about: "Expands the clip in any direction", needs: { video: true, text: true }, gpu: 18, why: "a new aspect ratio without cropping" }),
  e("control", "frame", "video_ltx2_5_flf2v", "LTX 2.5 first and last frame", "Lightricks", { about: "The motion between two frames you give", needs: { image: true, images: 2, text: true }, gpu: 18, why: "redo the middle between two held frames" }),
  e("control", "reference", "video_fasth3_ominiref_r2v", "FastH3 OmniRef", "MiniMax", { about: "Eight-step H3 from a reference picture, with its sound", needs: { image: true, text: true }, gpu: 10, why: "open and fast: a redo from a reference in eight steps" }),
  e("control", "reference", "video_minimax_h3_r2v", "MiniMax H3 reference", "MiniMax", { about: "Up to nine pictures, three clips and three sounds as references", needs: { image: true, text: true }, gpu: 20, why: "several references at once, clips among them" }),
  // Extend
  e("extend", "continue", "api_google_gemini_omni_flash_1_1_extend", "Gemini Omni 1.1 Flash extend", "Google", { about: "Continues a clip by up to 10 seconds a step, to 40 in all", needs: { video: true, text: true }, max: 10, partner: true, why: "continues the story from the last frames" }),
  e("extend", "bridge", "video_ltx2_5_flf2v", "LTX 2.5 bridge", "Lightricks", { about: "A bridge from the last frame of one take to the first of the next", needs: { image: true, images: 2, text: true }, gpu: 18, why: "joins two takes smoothly" }),
  e("extend", "bridge", "template_ltx2_3_style_transition", "LTX style transition", "Lightricks", { about: "A transition between two frames in a style", needs: { image: true, images: 2, text: true }, gpu: 18, why: "a styled transition between two scenes" }),
  e("extend", "bridge", "video_minimax_h3_multiframe_reference", "MiniMax H3 multiframe", "MiniMax", { about: "A clip that passes through up to four pictures anywhere in time", needs: { image: true, images: 4, text: true }, gpu: 20, why: "hits several held frames in order" }),
  // Finish
  e("finish", "upscale", "utility_seedvr2_video_upscale", "SeedVR2", "ByteDance", { about: "Upscales the clip with a video-aware restorer", needs: { video: true }, gpu: 20, why: "open and faithful: sharper without redrawing" }),
  e("finish", "upscale", "api_topaz_starlight_precise25", "Topaz Starlight Precise 2.5", "Topaz", { about: "Upscales and restores with Topaz's video model", needs: { video: true }, partner: true, why: "the cleanest upscale of faces and fine detail" }),
  e("finish", "upscale", "api_topaz_video_enhance", "Topaz Astra Fast", "Topaz", { about: "A quick Topaz upscale", needs: { video: true }, partner: true, why: "fast and cheap for drafts" }),
  e("finish", "upscale", "utility_video_upscale", "Wan 2.2 Creative upscale", "Alibaba", { about: "Upscales and adds detail a little creatively", needs: { video: true, text: true }, gpu: 22, why: "open; adds texture to soft footage" }),
  e("finish", "upscale", "api_wavespeed_flshvsr_video_upscale", "WaveSpeed FlashVSR", "WaveSpeed", { about: "A fast video upscale", needs: { video: true }, partner: true, why: "quick and inexpensive" }),
  e("finish", "picture",  "utility_video_frame_interpolation", "FILM frame interpolation", "Google", { about: "Makes the frames between the frames", needs: { video: true }, gpu: 3, why: "smoother motion or slow motion" }),
  e("finish", "sound", "api_mirelo_video_to_sfx", "Mirelo SFX 2.0", "Mirelo", { about: "Foley timed to the action on screen", needs: { video: true }, partner: true, why: "sound effects locked to the picture" }),
  e("finish", "sound", "api_veed_clean_audio_video", "VEED Clean Audio", "VEED", { about: "Strips noise and music from the speech", needs: { video: true }, partner: true, why: "clean speech, 48 kHz" }),
];

/** How a stage finds the engines it does not list: a template of the live catalog whose name matches, and that is a video one. */
export const DISCOVER = {
  select: /segment|matte|green_screen|(remove|replace)_.*background/,
  clean: /remove_(object|subtitle|watermark|text|logo)|video_inpaint|remova/,
  direct: /video_edit(ing)?$|_edit$|motion_transfer|character_replacement|relight/,
  control: /ic_lora|iclora|ltx2_5_(?!i2v|t2v|dfr)|ominiref/,
  extend: /extend|flf2v|multiframe|continuation/,
  finish: /upscale|enhance|interpolation|sfx|clean_audio/,
};
const SKIP = /image_|_image_|t2i|text_to_image|3d|_t2v$|_t2m|_i2m|^api_[a-z_]*_i2v$|speech|voice_clone|svg/;

/**
 * The engines of a stage for a catalog (the items of the template listing). The curated ones that are in the catalog come first, in
 * order; then the catalog's own templates that fit the stage's pattern (`found: true`); `missing` are the curated ones the catalog no
 * longer has (a note to the person, not an error). With no catalog (it is not loaded yet) every curated engine is offered.
 */
export function enginesFor(stage, catalog) {
  const curated = ENGINES.filter((x) => x.stage === stage);
  if (!Array.isArray(catalog)) return { engines: curated.map(withPrice), missing: [] };
  const by = new Map(catalog.map((c) => [c.name, c]));
  const engines = [];
  const missing = [];
  for (const x of curated) {
    const c = by.get(x.name);
    if (!c) missing.push(x);
    else engines.push(withPrice({ ...x, partner: x.partner ?? !!c.partner, open: !!c.openSource, tags: c.tags ?? [], catalogCredits: c.credits ?? null }));
  }
  const have = new Set(curated.map((x) => x.name));
  const rx = DISCOVER[stage];
  if (rx) {
    for (const c of catalog) {
      if (have.has(c.name) || SKIP.test(c.name) || !(c.medium === "video" || c.group === "video" || c.group === "partner") || !rx.test(c.name)) continue;
      // (a template belongs to one stage: the first that claims it among those curated elsewhere is its home)
      if (ENGINES.some((x) => x.name === c.name)) continue;
      engines.push(withPrice({ stage, mode: "other", name: c.name, title: c.title || c.name, maker: c.maker ?? "", about: c.description ?? "", needs: needsOf(c), partner: !!c.partner, open: !!c.openSource, tags: c.tags ?? [], found: true, gpu: 18, why: "new in the catalog" }));
    }
  }
  return { engines, missing };
}
const withPrice = (x) => x;

/** What a catalog template asks of the shot, from the kinds of its inputs. */
export function needsOf(item) {
  const ins = item?.inputs ?? [];
  const n = { video: ins.includes("video"), text: true };
  const imgs = ins.filter((i) => i === "image").length;
  if (imgs) n.image = true;
  return n;
}

/** The engine of a template name, in the curated list. */
export const engineOf = (name) => ENGINES.find((x) => x.name === name) ?? null;

/** The modes a stage's engines come in, in order of first appearance (the groups of the engine menu). */
export const MODES = {
  select: { track: "Follow a subject", cut: "Cut the background" },
  clean: { object: "Remove an object", text: "Subtitles and logos" },
  direct: { words: "Change by words", look: "Relight and look", recast: "Recast a person" },
  control: { union: "Keep the motion", identity: "Hold a character", frame: "Frame and bridge", reference: "From references" },
  extend: { continue: "Continue", bridge: "Bridge two takes" },
  finish: { upscale: "Upscale", picture: "Motion", sound: "Sound" },
};

// ---------------------------------------------------------------- the price

/**
 * What a run costs, in credits, or null while it is not known: a partner's is the runner's own estimate (`estimate`: { credits }), an
 * open model's is a guess of its GPU time (credits per second, 0.266 credits per GPU unit, at most 12 s counted); a local one is free.
 */
export function priceOf(engine, seconds = 5, estimate = null) {
  if (!engine || engine.local) return 0;
  if (estimate && typeof estimate.credits === "number" && estimate.credits > 0) return estimate.credits;
  if (engine.partner) return null;
  const s = Math.min(12, Math.max(1, seconds || 5));
  return Math.max(1, Math.round(s * (engine.gpu ?? 18) * 0.266));
}

// ---------------------------------------------------------------- the shot

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const str = (v, n) => (typeof v === "string" ? v.slice(0, n) : "");
const num = (v, lo, hi, d) => (Number.isFinite(Number(v)) && v !== null && v !== "" ? clamp(Number(v), lo, hi) : d);

const media = (m) =>
  m && typeof m === "object" && typeof m.url === "string"
    ? { kind: m.kind === "image" ? "image" : "video", url: str(m.url, 600), file: str(m.file, 300), width: num(m.width, 1, 16384, undefined), height: num(m.height, 1, 16384, undefined), ...(m.kind === "image" ? {} : { seconds: num(m.seconds ?? m.duration, 0, 7200, undefined) }), ...(typeof m.still === "string" ? { still: str(m.still, 600) } : {}) }
    : null;

function take(t, i = 0) {
  if (!t || typeof t !== "object") return null;
  const m = media(t.media);
  if (!m && t.state !== "failed") return null;
  return {
    id: str(t.id, 40) || `t${i}`,
    engine: str(t.engine, 200),
    title: str(t.title, 80),
    mode: str(t.mode, 20),
    prompt: str(t.prompt, 2000),
    media: m,
    // the stage this take was made from ("clip" or a stage id) and its take
    from: str(t.from, 20) || "clip",
    fromTake: str(t.fromTake, 40),
    credits: num(t.credits, 0, 1e6, 0),
    // ("example": a result an example ships to stand in for a run, drawn another way and said so)
    source: ["local", "open", "partner", "example"].includes(t.source) ? t.source : "local",
    seconds: num(t.seconds, 0, 7200, 0),
    at: str(t.at, 40) || new Date(0).toISOString(),
    note: str(t.note, 300),
    // the pictures given to the engine (a reference sheet, a frame), kept with the take so it can be asked again
    refs: Array.isArray(t.refs) ? t.refs.slice(0, 9).map(media).filter(Boolean) : [],
    state: t.state === "failed" ? "failed" : "done",
  };
}

function planStep(x) {
  if (!x || typeof x !== "object" || !STAGE_IDS.includes(x.stage)) return null;
  return { stage: x.stage, engine: str(x.engine, 200), text: str(x.text, 500), why: str(x.why, 140), done: !!x.done };
}

/** The body with Paprika's plan written (a new plan replaces the old one). */
export function withPlan(body, steps) {
  const next = normaliseBody(JSON.parse(JSON.stringify(body)));
  next.plan = (steps ?? []).slice(0, 40).map(planStep).filter(Boolean).slice(0, 8);
  return next;
}
/** A step of the plan is done once its stage has a pass made by that engine (or any pass, for a step with no engine). */
export function stepDone(body, step) {
  const p = passOf(body, step.stage);
  return !!p && (!step.engine || p.engine === step.engine || p.engine === "local:conform");
}

export function blankBody() {
  return {
    v: 2,
    brief: "",
    // Paprika's plan of the edit: [{ stage, engine, text, why, done }], in the order to run it
    plan: [],
    clip: null,
    range: null,
    stages: Object.fromEntries(STAGE_IDS.map((id) => [id, { takes: [], mark: "", from: "" }])),
    log: [],
  };
}

/** A body as the server and the page keep it: shaped, bounded, with no stranger's keys. */
export function normaliseBody(raw) {
  const b = blankBody();
  if (!raw || typeof raw !== "object") return b;
  b.brief = str(raw.brief, 4000);
  b.plan = (Array.isArray(raw.plan) ? raw.plan : []).slice(0, 40).map(planStep).filter(Boolean).slice(0, 8);
  const c = raw.clip && typeof raw.clip === "object" ? raw.clip : null;
  if (c && media(c.media)) b.clip = { media: media(c.media), fps: num(c.fps, 1, 240, 24), name: str(c.name, 120), at: str(c.at, 40) };
  if (raw.range && typeof raw.range === "object") {
    const a = clamp(Math.round(Number(raw.range.in) || 0), 0, 7200);
    b.range = { in: a, out: clamp(Math.round(Number(raw.range.out) || a), a, 7200) };
  }
  for (const id of STAGE_IDS) {
    const s = raw.stages?.[id];
    if (!s || typeof s !== "object") continue;
    const takes = (Array.isArray(s.takes) ? s.takes : []).slice(0, 200).map(take).filter(Boolean);
    const seen = new Set();
    b.stages[id].takes = takes.filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));
    const mark = str(s.mark, 40);
    b.stages[id].mark = b.stages[id].takes.some((t) => t.id === mark && t.state === "done") ? mark : "";
    b.stages[id].from = STAGE_IDS.includes(s.from) || s.from === "clip" ? s.from : "";
  }
  b.log = (Array.isArray(raw.log) ? raw.log : []).slice(-400).map((l) => ({ at: str(l?.at, 40), stage: STAGE_IDS.includes(l?.stage) ? l.stage : "", engine: str(l?.engine, 200), credits: num(l?.credits, 0, 1e6, 0) }));
  return b;
}

/** The takes of a stage that worked, newest first. */
export const takesOf = (body, stage) => (body.stages[stage]?.takes ?? []).filter((t) => t.state === "done").slice().reverse();
/** The take that is the stage's pass: the one marked, else the newest that worked; null when there is none. */
export function passOf(body, stage) {
  const s = body.stages[stage];
  if (!s) return null;
  return s.takes.find((t) => t.id === s.mark && t.state === "done") ?? takesOf(body, stage)[0] ?? null;
}
/** A stage's lamp: done (it has a pass), working (`busy`), or empty. */
export const lampOf = (body, stage, busy = false) => (busy ? "working" : passOf(body, stage) ? "done" : "empty");

/**
 * The clip a stage works from: { media, from, take }. `from` is the stage the person pointed it at ("clip" is the footage itself); else
 * the pass of the nearest stage before it that makes a clip; else the footage. Conform's pass is the footage made ready.
 */
export function inputFor(body, stage) {
  const i = STAGE_IDS.indexOf(stage);
  const pick = body.stages[stage]?.from;
  const via = (id) => {
    const p = id === "clip" ? null : passOf(body, id);
    return p?.media?.kind === "video" ? { media: p.media, from: id, take: p.id } : null;
  };
  if (pick) {
    const got = via(pick);
    if (got) return got;
    if (pick === "clip" && body.clip?.media) return { media: body.clip.media, from: "clip", take: "" };
  }
  for (let j = i - 1; j >= 0; j--) {
    if (!STAGES[j].clip) continue;
    const got = via(STAGE_IDS[j]);
    if (got) return got;
  }
  return body.clip?.media ? { media: body.clip.media, from: "clip", take: "" } : null;
}

/** The seconds and the rate of the clip a stage works from. */
export function inputInfo(body, stage) {
  const input = inputFor(body, stage);
  return { input, seconds: input?.media?.seconds ?? 0, fps: body.clip?.fps ?? 24, width: input?.media?.width ?? 0, height: input?.media?.height ?? 0 };
}

let counter = 0;
const newId = () => `t${Date.now().toString(36)}${(counter++).toString(36)}`;

/** The body with a take added to a stage (marked when it is the first that worked, or `mark: true`), and the run in the log. Pure. */
export function addTake(body, stage, t, { mark = false } = {}) {
  const next = normaliseBody(JSON.parse(JSON.stringify(body)));
  const made = take({ ...t, id: t.id || newId(), at: t.at || new Date().toISOString() });
  if (!made) return next;
  const s = next.stages[stage];
  s.takes.push(made);
  if (made.state === "done" && (mark || !s.takes.some((x) => x.id === s.mark))) s.mark = made.id;
  next.log.push({ at: made.at, stage, engine: made.engine, credits: made.credits });
  return normaliseBody(next);
}
/** The body with one take marked as the stage's pass. */
export function markTake(body, stage, id) {
  const next = normaliseBody(JSON.parse(JSON.stringify(body)));
  if (next.stages[stage].takes.some((t) => t.id === id && t.state === "done")) next.stages[stage].mark = id;
  return next;
}
/** The body without a take (its cost stays in the log: it was spent). If it was the mark, the newest that worked takes its place. */
export function removeTake(body, stage, id) {
  const next = normaliseBody(JSON.parse(JSON.stringify(body)));
  const s = next.stages[stage];
  s.takes = s.takes.filter((t) => t.id !== id);
  if (s.mark === id) s.mark = "";
  return normaliseBody(next);
}

// ---------------------------------------------------------------- the ledger

/** Every run, oldest first, with its stage; and what it all cost. */
export function ledger(body) {
  const rows = [];
  for (const id of STAGE_IDS) for (const t of body.stages[id].takes) rows.push({ stage: id, take: t.id, engine: t.engine, title: t.title, credits: t.credits, at: t.at, source: t.source, state: t.state, marked: body.stages[id].mark === t.id });
  rows.sort((a, b) => a.at.localeCompare(b.at));
  const spent = body.log.reduce((n, l) => n + (l.credits || 0), 0);
  const byStage = Object.fromEntries(STAGE_IDS.map((id) => [id, body.log.filter((l) => l.stage === id).reduce((n, l) => n + (l.credits || 0), 0)]));
  return { rows, spent, byStage };
}
/** The ledger as a plain text to keep or hand over: every run in time order with its stage, engine, outcome, price and time, and the total. */
export function ledgerText(body, name = "Shot") {
  const l = ledger(body);
  const rows = l.rows.map((r) => [r.at.slice(0, 19).replace("T", " "), r.stage, r.title || r.engine, r.state === "failed" ? "failed" : r.marked ? "pass" : "take", r.credits ? `${r.credits} cr` : "free"]);
  const widths = [0, 1, 2, 3, 4].map((i) => Math.max(...rows.map((r) => r[i].length), 4));
  const line = (r) => r.map((c, i) => c.padEnd(widths[i])).join("  ").trimEnd();
  return [`Spice ledger: ${name}`, "", ...rows.map(line), "", `Total: ${l.spent} credits`, ...STAGE_IDS.filter((id) => l.byStage[id]).map((id) => `  ${id}: ${l.byStage[id]} cr`), ""].join("\n");
}
/** The credits spent on the day of `now`, from the logs of the shots given. */
export function creditsOnDay(bodies, now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  return bodies.reduce((n, b) => n + (b?.log ?? []).filter((l) => l.at.slice(0, 10) === day).reduce((m, l) => m + (l.credits || 0), 0), 0);
}

// ---------------------------------------------------------------- before the run

/**
 * What stands in the way of a run, said before the person pays: [{ level: "stop" | "warn", text }]. A "stop" cannot run (no clip, a clip
 * longer than the engine takes, a reference it needs and has not got); a "warn" can (words missing, a size the engines round, a rate off 24).
 * `given`: { text, images: n of reference pictures, frames: n of held frames }.
 */
export function preflight(engine, body, stage, given = {}, form = null) {
  const out = [];
  if (!engine) return [{ level: "stop", text: "Pick an engine." }];
  if (engine.local) return out;
  const { input, seconds, width, height } = inputInfo(body, stage);
  const n = engine.needs ?? {};
  if (n.video && !input) out.push({ level: "stop", text: "Bring a clip first." });
  if (n.video && input && engine.max && seconds > engine.max + 0.05) out.push({ level: "stop", text: `${engine.title} takes ${engine.max} seconds at most; this clip is ${Math.round(seconds * 10) / 10}. Trim it in Conform.` });
  const refs = given.images ?? 0;
  if (form) {
    // (the template's own form says how many pictures it requires)
    const need = needsFromForm(form).images;
    if (refs < need) out.push({ level: "stop", text: need === 1 ? `${engine.title} needs a picture (${n.video ? "what it should look like" : "to start from or to keep"}).` : `${engine.title} needs ${need} pictures; ${refs} given.` });
  } else {
    if (n.image === true && !n.video && refs < Math.max(1, n.images ?? 1)) out.push({ level: "stop", text: n.images > 1 ? `${engine.title} needs ${n.images} pictures; ${refs} given.` : `${engine.title} needs a picture to start from or to keep.` });
    if (n.image === true && n.video && refs < 1) out.push({ level: "stop", text: `${engine.title} needs a reference picture (what it should look like).` });
  }
  if (n.text === true && !String(given.text ?? "").trim()) out.push({ level: "warn", text: "No words given: it will run on the template's own." });
  if (input && width && height && (width % 2 || height % 2)) out.push({ level: "warn", text: `The clip is ${width}×${height}: an odd size is rounded by most editors. Conform sets it.` });
  if (input && body.clip?.fps && (body.clip.fps < 20 || body.clip.fps > 31)) out.push({ level: "warn", text: `The clip runs at ${body.clip.fps} fps; the editors expect about 24. Conform sets it.` });
  if (engine.stage === "extend" && engine.mode === "continue" && seconds > 30) out.push({ level: "warn", text: "Continuing a clip this long may pass the 40 seconds the engine builds up to." });
  return out;
}
/** Whether any of the problems stops the run. */
export const blocked = (problems) => problems.some((p) => p.level === "stop");

// ---------------------------------------------------------------- the pick

const RULES = [
  { stage: "clean", rx: /subtitle|caption/i, mode: "text", name: "template_ltx2_3_lora_remove_subtitles_from_video" },
  { stage: "clean", rx: /logo|watermark/i, mode: "text", name: "template_ltx2_3_remove_watermark_from_video" },
  { stage: "clean", rx: /./, mode: "object", name: "utility_void_video_inpainting" },
  { stage: "direct", rx: /relight|\blight|sunset|golden|blue hour|\brain|night|dusk|dawn|\blit\b/i, mode: "look", name: "api_beeble_switchx_video_edit", needsImage: true },
  { stage: "direct", rx: /recast|replace (him|her|the (boy|girl|man|woman|person|character))|swap (him|her|the (boy|girl|man|woman|person|character))|become|turn (him|her|them|it|the \w+) into|turn into/i, mode: "recast", name: "api_higgsfield_genjutsu_motion_transfer", needsImage: true },
  { stage: "direct", rx: /./, mode: "words", name: "api_google_gemini_omni_flash_1_1_edit", long: "api_seedance2_5_video_editing" },
  { stage: "control", rx: /sheet|ingredient|same (face|look|character)|identity|hold his|hold her/i, mode: "identity", name: "template_ltx2_3_ic_lora_ingredients" },
  { stage: "control", rx: /aspect|wider|widen|expand|outpaint|portrait|vertical|9:16|16:9/i, mode: "frame", name: "template_ltx2_3_lora_video_outpainting" },
  { stage: "control", rx: /./, mode: "union", name: "video_ltx2_3_ic_lora" },
  { stage: "extend", rx: /bridge|between|transition|join/i, mode: "bridge", name: "video_ltx2_5_flf2v" },
  { stage: "extend", rx: /./, mode: "continue", name: "api_google_gemini_omni_flash_1_1_extend" },
  { stage: "finish", rx: /upscal|sharper|4k|1080|1440|resolution|detail|restor/i, mode: "upscale", name: "utility_seedvr2_video_upscale" },
  { stage: "finish", rx: /sound|rain|steps|foley|sfx|noise/i, mode: "sound", name: "api_mirelo_video_to_sfx" },
  { stage: "finish", rx: /speech|voice|clean/i, mode: "sound", name: "api_veed_clean_audio_video" },
  { stage: "finish", rx: /./, mode: "picture", name: "utility_video_frame_interpolation" },
  { stage: "select", rx: /./, mode: "track", name: "utility_video_segment_sam3" },
];
/**
 * The engine Paprika would pick without being asked at length (the model behind her bar may choose otherwise): the first rule of the stage
 * that matches the words, as { name, why, mode }, with a clip over what the engine takes sent to a longer-lived one. `null` for Conform.
 */
export function recommend(stage, ask = "", { seconds = 0 } = {}) {
  const r = RULES.find((x) => x.stage === stage && x.rx.test(ask));
  if (!r) return null;
  const name = r.long && seconds > (engineOf(r.name)?.max ?? Infinity) ? r.long : r.name;
  const eng = engineOf(name);
  return eng ? { name, mode: eng.mode, why: eng.why, needsImage: !!r.needsImage } : null;
}

// ---------------------------------------------------------------- local work

/** The settings the editors accept (what Conform makes): a rate near 24, an even size, no longer than the engine's limit. */
export const CONFORM = { fps: 24, maxSeconds: 10 };
/** What Conform would change on a clip: [{ what, from, to }], empty when the clip is ready. */
export function conformPlan(clip, { fps = CONFORM.fps, maxSeconds = CONFORM.maxSeconds } = {}) {
  const out = [];
  const m = clip?.media;
  if (!m) return out;
  const rate = clip.fps ?? 24;
  if (Math.abs(rate - fps) > 0.5) out.push({ what: "rate", from: rate, to: fps });
  if (m.width && m.height && (m.width % 2 || m.height % 2)) out.push({ what: "size", from: `${m.width}×${m.height}`, to: `${m.width - (m.width % 2)}×${m.height - (m.height % 2)}` });
  if ((m.seconds ?? 0) > maxSeconds + 0.05) out.push({ what: "length", from: m.seconds, to: maxSeconds });
  return out;
}

// ---------------------------------------------------------------- frames

/** The slate number of the frame at a time of the clip, and back. */
export const frameAt = (seconds, fps = 24) => FIRST + Math.max(0, Math.round(seconds * fps));
export const secondsAt = (frame, fps = 24) => Math.max(0, (frame - FIRST) / fps);

// ---------------------------------------------------------------- what a run brings back

/** What a template run brought back, as a take's media. */
export const mediaOf = (r) => ({
  kind: r.kind === "image" ? "image" : "video",
  url: r.url, file: r.file, width: r.width, height: r.height,
  ...(r.kind === "image" ? {} : { seconds: r.duration ?? r.seconds }),
});
/**
 * The clip of what came back, else its picture. A template that also saves a side-by-side comparison (the LTX clean-ups) or a rough
 * first pass (VOID) has them told by the name Cloud saved them under, so the comparison and the rough pass are never the take.
 */
const rank = (r) => (r.kind === "video" ? 0 : 4) + (/compar/i.test(r.saved ?? "") ? 2 : 0) + (/pass_?1\b|pass1/i.test(r.saved ?? "") ? 1 : 0);
export const pickMedia = (list) => {
  const all = (Array.isArray(list) ? list : [list]).filter((r) => r?.url && (r.kind === "video" || r.kind === "image"));
  const m = all.slice().sort((a, b) => rank(a) - rank(b))[0];
  return m ? mediaOf(m) : null;
};

// ---------------------------------------------------------------- filling a template's form

/**
 * What a template's real form asks of the shot (its slots, as the runner reads them from Comfy Cloud): how many clips and pictures it
 * REQUIRES and whether it takes words. The curated `needs` of an engine are Spice's guess; this is what the form says, and wins when it is known.
 */
export function needsFromForm(schema) {
  const slots = schema?.slots ?? [];
  const req = (kind) => slots.filter((x) => x.kind === kind && x.required).length;
  return { video: req("video") > 0, images: req("image"), text: slots.some((x) => x.kind === "text" && !/negative/i.test(x.id + x.label)) };
}

/**
 * VOID takes two sets of words, not one: SAM3 finds the object by a short name (32 tokens at most), and the hole is filled from words that say
 * how the place looks without it, never naming what is gone (or it comes back). It works at its model's own size, about 672 x 384 pixels turned
 * to the clip's shape, over the whole clip in whole seconds (ten at most).
 */
export const VOID_AFTER = "The same place with nothing there: what was behind carries on naturally, the same light and colours, a steady camera.";
export function voidInputs(words, after, { width, height, seconds } = {}) {
  const what = String(words ?? "").trim().replace(/^(take out|remove)\s+/i, "").replace(/[.!]+$/, "").split(/\s+/).slice(0, 12).join(" ");
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

/**
 * The inputs for a template's real form from what the shot has: { inputs, unmet }. The clip goes to the first clip slot, and to any other
 * REQUIRED clip slot (a "before" of a comparison takes the same clip); the pictures go to the picture slots in the form's order, the
 * required ones first; the words go to the "prompt" slot, else the first words slot that is not a negative one. `special: "void"` sends
 * VOID's own sets of words instead. `unmet` says what the form requires and the shot has not got: { images: n } (pictures short).
 */
export function fillSlots(schema, { video = null, images = [], text = "", special = "", shape = {} } = {}) {
  const slots = schema?.slots ?? [];
  const inputs = {};
  const clips = slots.filter((x) => x.kind === "video");
  if (video) for (const [i, x] of clips.entries()) if (i === 0 || x.required) inputs[x.id] = video;
  const pics = [...slots.filter((x) => x.kind === "image" && x.required), ...slots.filter((x) => x.kind === "image" && !x.required)];
  let used = 0;
  for (const x of pics) {
    if (used >= images.length) break;
    inputs[x.id] = images[used++];
  }
  if (special === "void") Object.assign(inputs, voidInputs(text, "", shape));
  else if (String(text).trim()) {
    const words = slots.find((x) => x.kind === "text" && x.id === "prompt") ?? slots.find((x) => x.kind === "text" && !/negative/i.test(x.id + x.label));
    if (words) inputs[words.id] = String(text).trim();
  }
  const required = slots.filter((x) => x.kind === "image" && x.required).length;
  return { inputs, unmet: required > images.length ? { images: required - images.length } : {} };
}
