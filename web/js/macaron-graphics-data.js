// Motion graphics, the plain part: the six kinds (a logo sting, a lower third, an end card, a title card, a counter, a subscribe
// nudge), the fields each has, and buildGraphic(), which makes one as a design with motion from the brand's kit: its ground, its
// accent, its type, its wordmark. The result is an ordinary design (layers that carry their timing, d.graphic says what it
// is) and a motion piece's numbers, so the Motion window, the editor and the renderer treat it like any other.
import { newLayer, uid, luminance, contrast, FORMATS } from "./design.js";

export const GRAPHIC_KINDS = [
  { id: "sting", band: 0.5, name: "Logo sting", seconds: 3, hint: "The logo lands, a line follows", fields: [["line", "Line under the logo"]] },
  { id: "lower", band: 0.74, name: "Lower third", seconds: 4, hint: "A name and a role, on a bar", fields: [["name", "Name"], ["role", "Role"]] },
  { id: "end", band: 0.4, name: "End card", seconds: 3, hint: "The logo, a closing line, where to go", fields: [["line", "Closing line"], ["url", "Where"]] },
  { id: "title", band: 0.5, name: "Title card", seconds: 4, hint: "A big title and a quiet line under it", fields: [["title", "Title"], ["sub", "Subtitle"]] },
  { id: "counter", band: 0.45, name: "Counter", seconds: 4, hint: "One big number and what it counts", fields: [["number", "Number"], ["label", "What it counts"]] },
  { id: "nudge", band: 0.5, name: "Subscribe nudge", seconds: 4, hint: "A line and a button that pops", fields: [["line", "Line"], ["cta", "Button"]] },
];
export const GRAPHIC_IDS = GRAPHIC_KINDS.map((k) => k.id);
export const kindOfGraphic = (id) => GRAPHIC_KINDS.find((k) => k.id === id) ?? GRAPHIC_KINDS[0];
export const GRAPHIC_FORMATS = ["9:16", "1:1", "4:5"];
export const EASINGS = [["out", "Smooth"], ["back", "Bouncy"], ["inout", "Soft"], ["expo", "Snappy"]];

/** The first words of how a brand talks (up to a few words of its first clause): a line it could say, when it has no tagline. */
const firstWords = (text, n = 8) => String(text ?? "").split(/[.;:!?\n]/)[0].trim().split(/\s+/).filter(Boolean).slice(0, n).join(" ").replace(/[,\s]+$/, "");

/**
 * What each field says until it is written: from the brand's own words, never from a made-up line. The tagline, else the first words
 * of how the brand talks, else nothing (a blank line is drawn as no line); where to go is the brand's address when the kit has one,
 * else blank. These are not kept with a graphic: they are worked out each time it is drawn, so a tagline written later shows up.
 */
export function defaultFields(kind, { brandName = "Your brand", tagline = "", voice = "", url = "" } = {}) {
  const said = String(tagline ?? "").replace(/\s+/g, " ").trim().slice(0, 80) || firstWords(voice);
  return {
    sting: { line: said },
    lower: { name: brandName, role: "Creative team" },
    end: { line: said || brandName, url: String(url ?? "").trim().slice(0, 60) },
    title: { title: said || brandName, sub: said ? brandName : "" },
    counter: { number: "10K", label: "happy customers" },
    nudge: { line: `Like what you see?`, cta: `Follow ${brandName}` },
  }[kind] ?? {};
}

/** The roles a kit's colours play in a graphic: the ground (darkest), the light (lightest), the accent and the second ground. */
export function rolesOf(kit) {
  const pal = kit?.palette?.length ? kit.palette : [{ id: "ink", hex: "#111111" }, { id: "white", hex: "#ffffff" }];
  const sorted = [...pal].sort((a, b) => luminance(a.hex) - luminance(b.hex));
  const ground = sorted[0];
  const chroma = (p) => {
    const n = parseInt(p.hex.slice(1, 7), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    return Math.max(...c) - Math.min(...c);
  };
  // the light is a light colour that is not loud (a warm white, not a yellow): else simply the lightest
  const pale = sorted.filter((p) => luminance(p.hex) > 0.5 && chroma(p) < 60);
  const light = pale.length ? pale[pale.length - 1] : sorted[sorted.length - 1];
  const rest = pal.filter((p) => p.id !== ground.id && p.id !== light.id);
  const accent = pal.find((p) => /signal|accent/i.test(p.role ?? "") && p.id !== ground.id) ?? [...rest].sort((a, b) => chroma(b) - chroma(a))[0] ?? light;
  const second = pal.find((p) => /second/i.test(p.role ?? "") && p.id !== ground.id) ?? rest.find((p) => p.id !== accent.id) ?? ground;
  return { ground: ground.id, light: light.id, accent: accent.id, second: second.id };
}

const upper = (s) => String(s ?? "").toUpperCase();
const clip = (s, n) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/**
 * A graphic as a design with motion and the piece's numbers. `seconds` is how long it lasts (a shorter one is played faster:
 * the times are scaled), `ease` how things settle, `format` where it is drawn. Answers { design, motion: { name, duration, format, sound } }.
 */
export function buildGraphic({ kind, fields = {}, kit, brandName = "", url = "", format = "9:16", seconds, ease = "out", id, name }) {
  const spec = kindOfGraphic(kind);
  // (what is written wins over what the brand would say; a field written blank is a blank line)
  const f = { ...defaultFields(kind, { brandName, tagline: kit?.tagline, voice: kit?.voice?.summary, url }), ...fields };
  const R = rolesOf(kit);
  const dur = Math.max(1.5, Math.min(12, Number(seconds) || spec.seconds));
  const k = Math.min(1, dur / spec.seconds);
  const T = (t) => Math.round(t * k * 100) / 100;
  const D = (d) => Math.round(d * Math.max(0.5, k) * 100) / 100;
  const inn = (fx, t0, d = 0.7, e = ease) => ({ t0: T(t0), in: { fx, dur: D(d), ease: e } });
  const wordmark = (kit?.logos ?? []).find((l) => l.kind === "wordmark" && l.tone === R.accent) ?? (kit?.logos ?? []).find((l) => l.kind === "wordmark") ?? kit?.logos?.[0];
  const W = FORMATS[format]?.w ?? 1080;
  const H = FORMATS[format]?.h ?? 1920;
  const text = (id, role, value, o) => newLayer("text", { id, name: o.name ?? role, role, text: value, fontRole: o.font ?? "text", colorRole: o.color ?? R.light, size: o.size, x: o.x ?? 0.08, y: o.y, w: o.w ?? 0.84, align: o.align ?? "center", lineHeight: o.lh ?? 1.12, tracking: o.tracking ?? 0, caps: !!o.caps, anim: o.anim });
  const shape = (id, kindOfShape, o) => newLayer("shape", { id, name: o.name ?? "Shape", shape: kindOfShape, colorRole: o.color ?? R.accent, x: o.x, y: o.y, w: o.w, h: o.h, radius: o.radius ?? 0.02, ...(o.stroke ? { stroke: o.stroke } : {}), role: "deco", anim: o.anim });
  // the logo sits where the middle of its wordmark is (a wordmark is about three times as wide as it is tall)
  const logoAt = (w, cy) => ({ x: (1 - w) / 2, y: Math.max(0, cy - (w * W) / 3.3 / (2 * H)), w, h: (w * W) / 3.3 / H });
  const logo = (o, anim) => (wordmark ? [newLayer("logo", { id: "logo", name: "Logo", logo: wordmark.id, ...o, anim })] : []);
  const lid = (t0) => ({ t0: T(t0), dur: D(0.5), lift: 0.45, rot: -18, ease: "back" });
  let layers = [];
  let bg = R.ground;
  let pops = [];

  if (kind === "sting") {
    layers = [
      shape("ring", "ring", { name: "Ripple", x: 0.5 - 0.2, y: 0.46 - 0.2 * (W / H), w: 0.4, h: 0.4 * (W / H), stroke: 0.006, anim: { t0: T(1.7), t1: T(2.6), in: { fx: "ripple", dur: D(0.85), ease: "out" } } }),
      ...logo(logoAt(0.74, 0.46), { t0: T(0.25), in: { fx: "wipe-r", dur: D(0.9), ease: "inout" }, lid: lid(1.3) }),
      text("line", "sub", f.line, { y: 0.56, size: 0.03, font: "mono", color: R.accent, caps: true, tracking: 0.12, anim: inn("fade", 2, 0.6) }),
    ];
    pops = [T(1.3) + D(0.5) * 0.55];
  } else if (kind === "lower") {
    bg = R.ground;
    layers = [
      shape("bar", "round", { name: "Bar", x: 0.07, y: 0.696, w: 0.012, h: 150 / H, radius: 0.5, anim: inn("wipe-u", 0.2, 0.5, "out") }),
      text("name", "headline", f.name, { y: 0.7, x: 0.1, w: 0.82, size: 0.058, font: "display", align: "left", anim: inn("slide-l", 0.4, 0.7) }),
      text("role", "sub", upper(f.role), { y: 0.768, x: 0.1, w: 0.82, size: 0.026, font: "mono", color: R.accent, align: "left", tracking: 0.14, anim: inn("fade", 0.9, 0.6) }),
    ];
  } else if (kind === "end") {
    bg = R.second;
    // (text on the second colour is the palette's light or its ground, whichever reads; the accent only where it does)
    const palette = kit?.palette ?? [];
    const hexOf = (id) => palette.find((p) => p.id === id)?.hex ?? "#000000";
    const reads = (id) => contrast(hexOf(id), hexOf(bg));
    const ink = reads(R.light) >= reads(R.ground) ? R.light : R.ground;
    const note = reads(R.accent) >= 3 ? R.accent : ink;
    layers = [
      ...logo(logoAt(0.62, 0.36), { t0: T(0.2), in: { fx: "pop", dur: D(0.7), ease: "back" }, lid: lid(0.9) }),
      text("line", "headline", f.line, { y: 0.47, size: 0.074, font: "display", color: ink, anim: inn("rise", 0.8, 0.8) }),
      shape("rule", "round", { name: "Rule", x: 0.44, y: 0.64, w: 0.12, h: 0.006, radius: 0.5, color: note, anim: inn("wipe-r", 1.3, 0.5, "out") }),
      text("url", "label", f.url, { y: 0.67, size: 0.034, font: "mono", color: ink, tracking: 0.04, anim: inn("fade", 1.5, 0.6) }),
    ];
    pops = [T(0.9) + D(0.5) * 0.55];
  } else if (kind === "title") {
    layers = [
      shape("tick", "round", { name: "Tick", x: 0.08, y: 0.33, w: 0.16, h: 0.008, radius: 0.5, anim: inn("wipe-r", 0.1, 0.6, "out") }),
      text("title", "headline", f.title, { y: 0.37, size: 0.118, font: "display", align: "left", lh: 1.02, tracking: -0.02, anim: inn("rise", 0.4, 0.8) }),
      text("sub", "sub", f.sub, { y: 0.66, size: 0.038, align: "left", color: R.light, anim: { ...inn("rise", 1.1, 0.7), } }),
    ];
    layers[2].opacity = 0.82;
  } else if (kind === "counter") {
    bg = R.second;
    layers = [
      text("number", "headline", f.number, { y: 0.3, size: 0.3, font: "display", color: R.accent, tracking: -0.03, lh: 1, anim: { t0: T(0.3), in: { fx: "pop", dur: D(0.8), ease: "back" } } }),
      shape("rule", "round", { name: "Rule", x: 0.44, y: 0.6, w: 0.12, h: 0.006, radius: 0.5, anim: inn("wipe-r", 1, 0.5, "out") }),
      text("label", "label", upper(f.label), { y: 0.63, size: 0.034, font: "mono", tracking: 0.14, anim: inn("fade", 1.1, 0.7) }),
    ];
  } else {
    // the button's middle is at cy; the sizes in pixels turned to fractions of this format's height
    const cy = 0.62;
    layers = [
      text("line", "headline", f.line, { y: 0.34, size: 0.075, font: "display", anim: inn("rise", 0.3, 0.8) }),
      shape("ring", "ring", { name: "Ripple", x: 0.14, y: cy - 90 / H, w: 0.72, h: 180 / H, radius: 0.5, stroke: 0.005, anim: { t0: T(1.7), t1: T(2.6), in: { fx: "ripple", dur: D(0.85), ease: "out" } } }),
      shape("button", "pill", { name: "Button", x: 0.2, y: cy - 65 / H, w: 0.6, h: 130 / H, radius: 0.5, color: R.accent, anim: { t0: T(1), in: { fx: "pop", dur: D(0.6), ease: "back" } } }),
      text("cta", "cta", f.cta, { y: cy - 22 / H, x: 0.2, w: 0.6, size: 0.036, font: "mono", color: R.ground, anim: { t0: T(1.2), in: { fx: "fade", dur: D(0.4), ease: "out" } } }),
    ];
    pops = [T(1) + D(0.6) * 0.5];
  }

  const now = new Date().toISOString();
  const design = {
    id: id ?? uid("g"), name: name ?? `${spec.name} · ${clip(brandName, 30) || "brand"}`, purpose: "Motion", status: "draft", format, intent: "", createdAt: now, updatedAt: now, layout: "stack",
    bg: { color: bg }, formats: {}, motion: true, poster: Math.round(dur * 0.8 * 100) / 100,
    history: [{ at: now, who: "you", note: `Started from the ${spec.name.toLowerCase()} template` }],
    // (only the words the person wrote are kept: the rest follow the brand each time the graphic is drawn)
    graphic: { kind, fields: { ...fields }, seconds: dur, ease },
    layers,
  };
  // a line with no words is no line: its layer is hidden, not drawn empty
  for (const l of design.layers) if (l.type === "text" && !String(l.text ?? "").trim()) l.hidden = true;
  return { design, motion: { name: design.name, duration: dur, format, fps: 30, sound: { pad: true, pops: pops.map((p) => Math.round(p * 100) / 100) } } };
}

/** Brioche's fields for a graphic, checked: only the kind's own fields, as short plain text. */
export function cleanFields(kind, raw = {}) {
  const out = {};
  for (const [key] of kindOfGraphic(kind).fields) if (typeof raw?.[key] === "string" && raw[key].trim()) out[key] = clip(raw[key], 80);
  return out;
}
