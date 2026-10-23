// Spice's library of effects: what can be laid on a shot as a LAYER and moved by hand on the picture. Three kinds:
//   image      a VFX element shot on pure black (web/brand/spice/elements, made with GPT Image from docs/brand/products/spice-v2/elements),
//              laid with a light blend (screen or add) so its black disappears; it moves with its motion on a clip
//   particles  drawn here, frame by frame (rain, snow, embers, dust, sparkles): they fall, drift or rise on a clip
//   ai         made by a model on Comfy Cloud from words (LTX on a clip, Qwen Image Edit on a picture): the whole frame again, kept only
//              in a soft circle where it was placed, behind the people when Roto holds them
// Every one starts with the look it is best with (its blend, its size, its motion); the person changes any of it. Pure data and pure
// functions: the page and the tests read them.

const SRC = "brand/spice/elements";

export const GROUPS = [
  ["all", "All"],
  ["fire", "Fire"],
  ["light", "Light"],
  ["magic", "Magic"],
  ["weather", "Weather"],
  ["particles", "Particles"],
];

/** How each layer can lie on the picture: the canvas compositing operation of each blend. Light elements are on black: screen and add lose it. */
export const BLENDS = [
  { id: "screen", name: "Screen", op: "screen", about: "Lightens: the black of the element disappears" },
  { id: "add", name: "Add", op: "lighter", about: "Adds its light: brighter and hotter than screen" },
  { id: "overlay", name: "Overlay", op: "overlay", about: "Mixes its colour into the picture's contrast" },
  { id: "soft", name: "Soft light", op: "soft-light", about: "A gentle wash of its colour" },
  { id: "normal", name: "Normal", op: "source-over", about: "Laid as it is (an AI layer, or particles)" },
];
export const blendOf = (id) => BLENDS.find((b) => b.id === id) ?? BLENDS[0];

/** How a layer moves on a clip (a picture shows it still). */
export const MOTIONS = [
  ["still", "Still"],
  ["flicker", "Flicker"],
  ["pulse", "Pulse"],
  ["spin", "Spin"],
  ["drift", "Drift"],
  ["rise", "Rise"],
  ["grow", "Grow"],
  ["strobe", "Strobe"],
];

const img = (id, name, group, o = {}) => ({ id, name, group, kind: "image", src: `${SRC}/${id}.webp`, thumb: `${SRC}/${id}-t.webp`, w: o.wide ? 1536 : 1024, h: 1024, blend: "screen", scale: 0.4, motion: "still", ...o });
const parts = (id, name, group, o = {}) => ({ id, name, group, kind: "particles", blend: "screen", scale: 1, motion: "still", amount: 0.5, size: 0.5, ...o });

export const LIBRARY = [
  img("flame", "Flame", "fire", { scale: 0.32, motion: "flicker" }),
  img("fireball", "Fireball", "fire", { scale: 0.55, motion: "grow", blend: "add" }),
  img("fire-wall", "Fire wall", "fire", { wide: true, scale: 1, y: 0.72, motion: "flicker" }),
  img("smoke", "Smoke", "fire", { scale: 0.6, motion: "rise", opacity: 0.8 }),
  img("sparks-burst", "Sparks burst", "fire", { scale: 0.45, motion: "grow", blend: "add" }),
  img("muzzle-flash", "Flash", "fire", { scale: 0.3, motion: "strobe", blend: "add" }),
  img("embers-cloud", "Ember cloud", "fire", { wide: true, scale: 1, motion: "rise" }),
  img("lens-flare", "Lens flare", "light", { wide: true, scale: 0.9, motion: "pulse" }),
  img("starburst", "Starburst", "light", { scale: 0.35, motion: "pulse" }),
  img("light-leak", "Light leak", "light", { wide: true, scale: 1, motion: "drift", opacity: 0.85 }),
  img("god-rays", "God rays", "light", { wide: true, scale: 1, y: 0.4, motion: "pulse", opacity: 0.8 }),
  img("bokeh", "Bokeh", "light", { wide: true, scale: 1, motion: "drift", opacity: 0.7 }),
  img("neon-ring", "Neon ring", "light", { scale: 0.4, motion: "pulse" }),
  img("spark-portal", "Spark portal", "magic", { scale: 0.5, motion: "spin", behind: true }),
  img("energy-orb", "Energy orb", "magic", { scale: 0.3, motion: "pulse", blend: "add" }),
  img("lightning", "Lightning", "magic", { scale: 0.5, y: 0.4, motion: "strobe", blend: "add" }),
  img("magic-swirl", "Magic swirl", "magic", { scale: 0.45, motion: "spin" }),
  img("rune-circle", "Rune circle", "magic", { scale: 0.45, motion: "spin" }),
  img("shockwave", "Shockwave", "magic", { scale: 0.7, motion: "grow" }),
  img("electric-arc", "Electric arc", "magic", { wide: true, scale: 0.7, motion: "strobe", blend: "add" }),
  img("hologram", "Hologram", "magic", { scale: 0.45, motion: "flicker" }),
  parts("rain", "Rain", "weather", { amount: 0.55, size: 0.5, rot: 8, colour: "#cfdcff" }),
  parts("snow", "Snow", "weather", { amount: 0.45, size: 0.5, colour: "#ffffff" }),
  parts("embers", "Embers", "particles", { amount: 0.4, size: 0.5, colour: "#ff8a2a", blend: "add" }),
  parts("dust", "Dust", "particles", { amount: 0.4, size: 0.4, colour: "#ffe9c8", opacity: 0.7 }),
  parts("sparkles", "Sparkles", "particles", { amount: 0.35, size: 0.5, colour: "#fff6d8", blend: "add" }),
  { id: "ai", name: "Describe it", group: "ai", kind: "ai", blend: "normal", scale: 0.6, motion: "still", behind: true, soft: 0.45 },
];
export const elementOf = (id) => LIBRARY.find((e) => e.id === id) ?? null;
/** The library's tiles for a group (the AI tile ends every group). */
export const tilesOf = (group) => LIBRARY.filter((e) => e.kind === "ai" || group === "all" || e.group === group);

/**
 * Looks: a few layers that go together, laid in one click (each a layer like any other afterwards). Their elements' own look, with what
 * differs from it.
 */
export const LOOKS = [
  { id: "rain-night", name: "Rain at night", layers: [{ el: "bokeh", opacity: 0.25, behind: true }, { el: "lens-flare", x: 0.3, y: 0.25, scale: 0.7, opacity: 0.8 }, { el: "rain", amount: 0.65 }] },
  { id: "inferno", name: "Inferno", layers: [{ el: "smoke", x: 0.8, y: 0.22, scale: 0.55, opacity: 0.32 }, { el: "fire-wall", y: 0.86 }, { el: "light-leak", tint: "#ff7a1a", opacity: 0.7 }, { el: "embers", amount: 0.55 }] },
  { id: "sorcery", name: "Sorcery", layers: [{ el: "spark-portal", x: 0.68, y: 0.4, behind: true }, { el: "magic-swirl", x: 0.35, y: 0.55, scale: 0.35 }, { el: "sparkles", amount: 0.4 }] },
  { id: "storm", name: "Storm", layers: [{ el: "lightning", x: 0.72, y: 0.3, scale: 0.45, behind: true }, { el: "rain", amount: 0.8, rot: 14 }] },
  { id: "dream", name: "Dream", layers: [{ el: "bokeh", opacity: 0.38, soft: 0.3, behind: true }, { el: "light-leak", tint: "#ff3b6b", opacity: 0.6 }, { el: "dust", amount: 0.5 }, { el: "starburst", x: 0.75, y: 0.2, scale: 0.25 }] },
  { id: "winter", name: "Winter", layers: [{ el: "god-rays", tint: "#3fa9ff", opacity: 0.55 }, { el: "snow", amount: 0.6 }] },
];
/** The layers of a look, made new (bottom first). */
export const lookLayers = (id) => (LOOKS.find((l) => l.id === id)?.layers ?? []).map(({ el, x, y, ...more }, i) => {
  const l = newLayer(el, { x, y }, Date.now() + i);
  return l && cleanLayer({ ...l, ...more });
}).filter(Boolean);

/** The tints offered as swatches (a layer's colour: its hue and saturation laid over its own light). */
export const TINTS = ["#ff7a1a", "#ffd23f", "#ff3b6b", "#b56bff", "#3fa9ff", "#3fffd2"];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v, lo, hi, d) => (typeof v === "number" && Number.isFinite(v) ? clamp(v, lo, hi) : d);
const hex = (v) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : "");
const ids = new Set(LIBRARY.map((e) => e.id));

/** A new layer of an element, where it was dropped (x, y: 0 to 1 of the frame), with the element's own look. */
export function newLayer(id, at = {}, n = Date.now()) {
  const e = elementOf(id);
  if (!e) return null;
  return cleanLayer({
    id: `l-${n.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    el: e.id, x: at.x ?? e.x ?? 0.5, y: at.y ?? e.y ?? 0.5, scale: e.scale, rot: e.rot ?? 0,
    blend: e.blend, opacity: e.opacity ?? 1, glow: e.kind === "image" ? 0.15 : 0, soft: e.soft ?? 0, behind: !!e.behind,
    motion: e.motion, speed: 1, amount: e.amount, size: e.size, colour: e.colour, eye: true,
  });
}

/** A layer as it is kept: every value known and inside its range, whatever the page or Paprika sent. null when it is not a layer. */
export function cleanLayer(raw) {
  if (!raw || typeof raw !== "object" || !ids.has(raw.el)) return null;
  const e = elementOf(raw.el);
  const m = raw.media && typeof raw.media === "object" && typeof raw.media.url === "string" ? raw.media : null;
  return {
    id: typeof raw.id === "string" && /^[\w-]{1,40}$/.test(raw.id) ? raw.id : `l-${Math.random().toString(36).slice(2, 10)}`,
    el: e.id,
    ...(typeof raw.name === "string" && raw.name.trim() ? { name: raw.name.trim().slice(0, 40) } : {}),
    x: num(raw.x, -0.5, 1.5, 0.5), y: num(raw.y, -0.5, 1.5, 0.5), scale: num(raw.scale, 0.03, 3, e.scale), rot: num(raw.rot, -360, 360, 0),
    flipX: raw.flipX === true, flipY: raw.flipY === true,
    blend: BLENDS.some((b) => b.id === raw.blend) ? raw.blend : e.blend,
    opacity: num(raw.opacity, 0, 1, 1), glow: num(raw.glow, 0, 1, 0), soft: num(raw.soft, 0, 1, 0),
    tint: hex(raw.tint), tintAmt: num(raw.tintAmt, 0, 1, 0.8),
    behind: raw.behind === true, eye: raw.eye !== false,
    motion: MOTIONS.some(([v]) => v === raw.motion) ? raw.motion : e.motion, speed: num(raw.speed, 0.1, 4, 1),
    from: typeof raw.from === "number" ? Math.round(raw.from) : null, to: typeof raw.to === "number" ? Math.round(raw.to) : null,
    ...(e.kind === "particles" ? { amount: num(raw.amount, 0, 1, e.amount), size: num(raw.size, 0, 1, e.size), colour: hex(raw.colour) || e.colour } : {}),
    ...(e.kind === "ai" ? { media: m, preset: typeof raw.preset === "string" && /^[\w-]{1,40}$/.test(raw.preset) ? raw.preset : "", words: typeof raw.words === "string" ? raw.words.slice(0, 600) : "", note: typeof raw.note === "string" ? raw.note.slice(0, 120) : "", credits: num(raw.credits, 0, 100000, 0) } : {}),
  };
}
/** A shot's layers, cleaned (bottom of the stack first), and the one selected. */
export const cleanLayers = (list) => (Array.isArray(list) ? list.map(cleanLayer).filter(Boolean).slice(0, 40) : []);
/** A layer's name: the one given, else its element's. */
export const layerName = (l) => l.name ?? (l.el === "ai" ? l.note || (l.words ? `AI · ${l.words.split(/\s+/).slice(0, 3).join(" ")}` : "AI effect") : elementOf(l.el)?.name ?? "Layer");
