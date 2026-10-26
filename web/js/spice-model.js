// Spice's rules, read by the page and the server alike. A SCENARIO is a few shots. A SHOT is its PLATE (the footage: a clip LTX-2.5 made
// from a first frame and some words, or one brought in) and the CHAIN of passes the suite's tools made on it, each on the one before
// (the plate, deblurred, then turned to night, then widened: every pass keeps the clip it was run on and the clip it made, so the viewer
// wipes between them). A pass taken off the chain waits in the BIN with the ones made on top of it; put back, the chain is rebuilt to
// where it was made. Nothing is overwritten and every clip stays in the library. Plain data, no imports.

/** Frames are slate numbers: the first frame of a shot is 1001, as on a VFX stage. */
export const FIRST = 1001;
/** The IC-LoRAs' sizes: the clip's shorter side. Draft is a look at it, standard the one to keep. */
export const SIZES = { draft: 320, standard: 544 };

const str = (v, n) => (typeof v === "string" ? v.slice(0, n) : "");
const num = (v, lo, hi, fallback) => {
  const n = Number(v);
  return v !== null && v !== undefined && v !== "" && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};

/** A media of the library: a clip (the plate, a pass) or a picture (a first frame). */
export function mediaOf(m) {
  if (!m || typeof m !== "object" || typeof m.url !== "string" || typeof m.file !== "string") return null;
  const out = { kind: m.kind === "image" ? "image" : "video", url: m.url.slice(0, 400), file: m.file.slice(0, 160), width: Math.round(num(m.width, 1, 8192, 1280)), height: Math.round(num(m.height, 1, 8192, 720)) };
  if (out.kind === "video") out.seconds = Math.round(num(m.seconds ?? m.duration, 0, 600, 0) * 1000) / 1000;
  if (typeof m.still === "string") out.still = m.still.slice(0, 400);
  return out;
}

/** A pass of the chain, or a take of the bin: the tool, its words and settings, the clip it ran on, the clip it made, what it cost. */
export function passOf(p) {
  if (!p || typeof p !== "object" || typeof p.id !== "string") return null;
  const media = mediaOf(p.media);
  if (!media) return null;
  const params = p.params && typeof p.params === "object" ? p.params : {};
  const out = {
    id: p.id.slice(0, 40),
    tool: str(p.tool, 40),
    name: str(p.name, 60),
    words: str(p.words, 600),
    params: {
      ...(params.size === "standard" ? { size: "standard" } : params.size === "draft" ? { size: "draft" } : {}),
      ...(num(params.strength, 0, 3, null) !== null ? { strength: num(params.strength, 0, 3, 1) } : {}),
      ...(num(params.seconds, 1, 30, null) !== null ? { seconds: num(params.seconds, 1, 30, 2) } : {}),
      ...(num(params.aspect, 0.25, 4, null) !== null ? { aspect: num(params.aspect, 0.25, 4, 1) } : {}),
      ...(num(params.height, 256, 2160, null) !== null ? { height: num(params.height, 256, 2160, 1080) } : {}),
      ...(params.region && typeof params.region === "object" ? { region: { x: num(params.region.x, 0, 1, 0), y: num(params.region.y, 0, 1, 0), w: num(params.region.w, 0.02, 1, 0.3), h: num(params.region.h, 0.02, 1, 0.3) } } : {}),
    },
    on: typeof p.on === "string" ? p.on.slice(0, 40) : null,
    input: mediaOf(p.input),
    media,
    credits: Math.round(num(p.credits, 0, 100000, 0) * 100) / 100,
    at: str(p.at, 40),
    note: str(p.note, 200),
    source: p.source === "free" ? "free" : "cloud",
  };
  if (p.example === true) out.example = true;
  // a cut-out keeps its matte beside the green screen it made
  const extra = p.extra && typeof p.extra === "object" ? Object.fromEntries(Object.entries(p.extra).map(([k, v]) => [str(k, 20), mediaOf(v)]).filter(([k, v]) => k && v)) : {};
  if (Object.keys(extra).length) out.extra = extra;
  return out;
}

/** A box of the frame in words: how big it is and where it starts, in percent. */
/** A box of the frame as given, when it is one: fractions of the frame, at least 2% a side. */
const boxOf = (r) => (r && typeof r === "object" && [r.x, r.y, r.w, r.h].every((n) => num(n, 0, 1) !== undefined) && num(r.w, 0, 1) >= 0.02 && num(r.h, 0, 1) >= 0.02 ? { x: num(r.x, 0, 1), y: num(r.y, 0, 1), w: num(r.w, 0, 1), h: num(r.h, 0, 1) } : null);
export const boxWords = (r) => `a box ${Math.round(r.w * 100)}% × ${Math.round(r.h * 100)}%, ${Math.round(r.x * 100)}% from the left, ${Math.round(r.y * 100)}% from the top`;

/** A chain Paprika proposed: its name, why, and its steps (a tool, its words, its size, the box it fills or the aspect it widens to). */
export function chainOf(c) {
  if (!c || typeof c !== "object") return null;
  const steps = (Array.isArray(c.steps) ? c.steps.slice(0, 5) : []).filter((x) => x && typeof x.tool === "string").map((x) => ({ tool: str(x.tool, 40), words: str(x.words, 600), ...(x.size === "standard" ? { size: "standard" } : x.size === "draft" ? { size: "draft" } : {}), ...(boxOf(x.region) ? { region: boxOf(x.region) } : {}), ...(num(x.aspect, 0.25, 4) !== undefined ? { aspect: num(x.aspect, 0.25, 4) } : {}) }));
  return steps.length ? { title: str(c.title, 40) || "A chain", why: str(c.why, 200), steps } : null;
}
/** Paprika's read of a shot: what it is, what looks off, her question, the chains she proposed. */
export function readOf(r) {
  if (!r || typeof r !== "object") return null;
  const suggestions = (Array.isArray(r.suggestions) ? r.suggestions.slice(0, 6) : []).map(chainOf).filter(Boolean);
  const text = str(r.text, 500);
  return text || suggestions.length ? { at: str(r.at, 40), text, off: str(r.off, 200), question: str(r.question, 160), suggestions } : null;
}

export function shotOf(s) {
  if (!s || typeof s !== "object" || typeof s.id !== "string") return null;
  const passes = Array.isArray(s.passes) ? s.passes.slice(0, 40).map(passOf).filter(Boolean) : [];
  const bin = Array.isArray(s.bin) ? s.bin.slice(0, 60).map(passOf).filter(Boolean) : [];
  const made = s.made && typeof s.made === "object" ? { words: str(s.made.words, 1200), seconds: Math.round(num(s.made.seconds, 2, 10, 5)), frame: mediaOf(s.made.frame), run: str(s.made.run, 40) } : null;
  return {
    id: s.id.slice(0, 40),
    name: str(s.name, 40) || "Shot",
    about: str(s.about, 300),
    plate: mediaOf(s.plate),
    fps: 24,
    passes,
    bin,
    made,
    // the pass the viewer looks at (its id, or "plate"): the last one when it says nothing
    sel: typeof s.sel === "string" ? s.sel.slice(0, 40) : "",
    read: readOf(s.read),
  };
}

/** A new scenario: no shots yet. */
export const blankBody = () => ({ v: 3, logline: "", shots: [], open: null, log: [] });

/** A scenario as it is kept, whatever was sent: every shot, pass and take within the rules, the rest dropped. */
export function normaliseBody(raw) {
  const b = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const shots = Array.isArray(b.shots) ? b.shots.slice(0, 24).map(shotOf).filter(Boolean) : [];
  const open = typeof b.open === "string" && shots.some((s) => s.id === b.open) ? b.open : shots[0]?.id ?? null;
  const log = Array.isArray(b.log) ? b.log.slice(-200).map((e) => ({ at: str(e?.at, 40), shot: str(e?.shot, 40), tool: str(e?.tool, 40), label: str(e?.label, 80), credits: Math.round(num(e?.credits, 0, 100000, 0) * 100) / 100 })) : [];
  return { v: 3, logline: str(b.logline, 300), shots, open, log };
}

// ---------------------------------------------------------------- reading a scenario

export const shotIn = (b, id) => b?.shots.find((s) => s.id === id) ?? null;
/** The shot open: the one the scenario says, else its first. */
export const openShotOf = (b) => (b ? shotIn(b, b.open) ?? b.shots[0] ?? null : null);
/** What a shot is now: the clip its last pass made, else its plate. */
export const outputOf = (shot) => (shot ? shot.passes.at(-1)?.media ?? shot.plate : null);
/** The pass the viewer looks at: the one picked, else the last; null for the plate (or a shot without passes). */
export function lookingAt(shot) {
  if (!shot) return null;
  if (shot.sel === "plate") return null;
  return shot.passes.find((p) => p.id === shot.sel) ?? shot.passes.at(-1) ?? null;
}
/** The clip a new run goes on: the output of the pass looked at (so a run can branch from the middle of the chain), else the plate. */
export const inputFor = (shot) => (shot ? lookingAt(shot)?.media ?? shot.plate : null);

export const framesIn = (seconds, fps = 24) => Math.max(1, Math.round((Number(seconds) || 0) * fps));
export const secondsAt = (frame, fps = 24) => Math.max(0, (frame - FIRST) / fps);
export const frameAt = (t, fps = 24) => FIRST + Math.round(Math.max(0, t) * fps);
/** The last slate number of a clip (a picture has one frame). */
export const lastFrame = (media, fps = 24) => (media?.kind === "video" ? FIRST + framesIn(media.seconds ?? 0, fps) - 1 : FIRST);

/** The chain rebuilt with a take of the bin put back: the passes up to the one it was made on, then it; the rest go to the bin. */
export function putBack(shot, takeId) {
  const take = shot.bin.find((t) => t.id === takeId);
  if (!take) return false;
  const at = take.on ? shot.passes.findIndex((p) => p.id === take.on) : -1;
  if (take.on && at < 0) return false;
  const kept = shot.passes.slice(0, at + 1);
  const off = shot.passes.slice(at + 1);
  shot.bin = [...shot.bin.filter((t) => t.id !== takeId), ...off];
  shot.passes = [...kept, take];
  shot.sel = take.id;
  return true;
}

/** A pass taken off the chain, with every pass made on top of it: they wait in the bin. */
export function takeOff(shot, passId) {
  const at = shot.passes.findIndex((p) => p.id === passId);
  if (at < 0) return false;
  const off = shot.passes.slice(at);
  shot.passes = shot.passes.slice(0, at);
  shot.bin = [...shot.bin, ...off];
  shot.sel = shot.passes.at(-1)?.id ?? "plate";
  return true;
}

/** A take forgotten for good (its clip stays in the library). */
export const forget = (shot, takeId) => void (shot.bin = shot.bin.filter((t) => t.id !== takeId));

// ---------------------------------------------------------------- credits

/** What the day's runs cost, on this scenario. */
export function creditsToday(b, now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  return Math.round(b.log.filter((e) => e.at.startsWith(day)).reduce((n, e) => n + e.credits, 0) * 100) / 100;
}
export function logCredits(b, { shot, tool, label, credits }) {
  if (!(credits > 0)) return;
  b.log = [...b.log, { at: new Date().toISOString(), shot, tool, label, credits: Math.round(credits * 100) / 100 }].slice(-200);
}

/** About what a run costs, in credits: measured on Comfy Cloud (an IC-LoRA draft is a credit or two a second at 320, a standard run about six). */
export const icCredits = (seconds, size = "draft") => Math.max(1, Math.round(Math.min(10, Math.max(1, seconds)) * (size === "standard" ? 6 : 1.2)));
/** About what an LTX-2.5 shot costs: a five-second clip at 720p is about 24 credits. */
export const shotCredits = (seconds) => Math.max(1, Math.round(seconds * 18 * 0.266));
/** About what a workflow that bills GPU time costs: the seconds of footage times its seconds of GPU per second, in credits. */
export const gpuCredits = (gpuPerSecond, seconds) => Math.max(1, Math.round(Math.min(12, Math.max(1, seconds)) * gpuPerSecond * 0.266));

/** The price of a tool on a clip of `seconds`, as the registry describes the tool (kind, gpu, credits). */
export function priceOf(tool, { seconds = 5, size = "draft" } = {}) {
  if (!tool) return null;
  if (tool.kind === "iclora") return icCredits(seconds, size);
  if (typeof tool.credits === "number" && tool.credits > 0) return Math.round(tool.credits);
  if (typeof tool.gpu === "number") return gpuCredits(tool.gpu, seconds);
  return null;
}

// ---------------------------------------------------------------- names

const pad = (n) => String(n).padStart(3, "0");
/** The next shot's name on the slate: SH010, SH020... */
export const nextShotName = (shots) => `SH${pad((shots.length + 1) * 10)}`;
export const nextScenarioName = (list) => {
  const taken = new Set(list.map((s) => s.name));
  for (let i = 1; i < 999; i++) if (!taken.has(`Scenario ${i}`)) return `Scenario ${i}`;
  return "Scenario";
};
export const newId = (prefix = "p") => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
