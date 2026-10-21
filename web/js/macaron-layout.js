// Macaron's layout sense, apart from drawing: where a design's layers go in another format (a reflow
// that keeps to the safe zones, never a plain scale), the layouts Brioche can suggest, applying the
// brand kit to a design, and the brand guard that reads one. Pure: a measurer is handed in (the page
// measures text with a canvas; tests and the server use the estimate below).
import { frameOf, FORMAT_KEYS, ALL_FORMATS, familyOf, shapeOf, LAYOUT_PROPS, clamp, round, uid, colorOf, contrast, luminance, newLayer, layoutOf, logoNow } from "./design.js";

export const safeRect = (format) => {
  const s = frameOf(format).safe;
  return { x: s.l, y: s.t, w: 1 - s.l - s.r, h: 1 - s.t - s.b };
};

/** A layer's pixel size in a frame ({ w, h, lines } for a text), guessed from its characters; the page measures instead. */
export function estimate(layer, W, H) {
  if (layer.type === "text") {
    const px = layer.size * W;
    const perLine = Math.max(1, Math.floor((layer.w * W) / (px * 0.56)));
    const lines = String(layer.text ?? "").replace(/\*/g, "").split("\n").reduce((n, s) => n + Math.max(1, Math.ceil(s.length / perLine)), 0);
    return { w: layer.w * W, h: layer.h > 0 ? layer.h * H : px * 0.72 + (lines - 1) * px * (layer.lineHeight ?? 1.15), lines };
  }
  if (layer.type === "logo") return { w: layer.w * W, h: (layer.w * W) / (layer.logo?.startsWith("mark") ? 0.86 : 3.025) };
  return { w: layer.w * W, h: layer.h * H };
}

const covers = (l) => l.type !== "text" && l.type !== "logo" && l.w >= 0.9 && l.h >= 0.9;
const isBand = (l) => l.type === "shape" && l.w >= 0.9 && l.h < 0.35;
const bleedsSide = (l) => l.type !== "text" && (l.x < -0.001 || l.x + l.w > 1.001 || (l.w >= 0.98 && l.x <= 0.01));
const area = (b) => b.w * b.h;

// ---------------------------------------------------------------- reflow: a design in another format

/**
 * The layout a design would have in another format, as overrides by layer id. Type and logos keep
 * their size (a format changes the frame's height, not its width), layers keep their order and their
 * place within the safe zones, what sat on a picture or card stays on it, and a frame too short for
 * it all gives way in the pictures first, then in the gaps, last in the type.
 */
export function reflow(design, to, measure = estimate) {
  // a frame of another kind (a banner from a post, a post from a wide cover) is laid out afresh by what its layers are for:
  // stretching one into the other would only squeeze it
  const [from0, to0] = [shapeOf(design.format), shapeOf(to)];
  const odd = (x) => x === "wide" || x === "strip";
  if (from0 !== to0 && (odd(from0) || odd(to0) || frameOf(to).h / frameOf(to).w > 3)) return layoutPreset(design, to, presetFor(to, design), measure);
  const A = frameOf(design.format);
  const B = frameOf(to);
  const sa = safeRect(design.format);
  const sb = safeRect(to);
  const kv = clamp((sb.h * B.h) / (sa.h * A.h), 0.55, 1.5);
  const out = {};
  const all = design.layers.filter((l) => !l.hidden).map((l) => ({ l, ...measure(l, A.w, A.h), x: l.x * A.w, y: l.y * A.h }));
  for (const i of all) if (covers(i.l)) out[i.l.id] = { x: i.l.x, y: i.l.y, w: i.l.w, h: i.l.h };
  // a strip across the frame (a footer) keeps its distance from the nearer edge
  for (const i of all) {
    if (!isBand(i.l)) continue;
    const y = i.y + i.h / 2 < A.h / 2 ? i.y : B.h - (A.h - i.y - i.h) - i.h;
    out[i.l.id] = { x: i.l.x, y: round(y / B.h), w: i.l.w, h: round(i.h / B.h) };
  }
  // what sits on a picture or a card is placed on it in the new frame too
  const rideOn = (i) => {
    if (covers(i.l) || isBand(i.l)) return null;
    const [cx, cy] = [i.x + i.w / 2, i.y + i.h / 2];
    return all.filter((c) => c !== i && (c.l.type === "image" || c.l.type === "shape") && !covers(c.l) && !isBand(c.l) && area(c) > area(i) * 1.4 && cx > c.x && cx < c.x + c.w && cy > c.y && cy < c.y + c.h).sort((a, b) => area(a) - area(b))[0] ?? null;
  };
  const rides = new Map(all.map((i) => [i, rideOn(i)]));
  const carriers = new Set([...rides.values()].filter(Boolean));
  const flow = all.filter((i) => !covers(i.l) && !isBand(i.l) && !rides.get(i));
  const flexible = (i) => !carriers.has(i) && (i.l.type === "image" || i.l.type === "shape") && i.h > 0.2 * A.h;
  const safeBottom = (sb.y + sb.h) * B.h;
  const solve = (shrink) => {
    const rows = flow.map((i) => {
      const h = flexible(i) ? i.h * clamp(kv, 0.6, 1.25) * shrink : i.h;
      const rel = clamp((i.y + i.h / 2 - sa.y * A.h) / (sa.h * A.h), 0, 1);
      return { i, h, y: (sb.y + rel * sb.h) * B.h - h / 2 };
    }).sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2));
    for (let k = 1; k < rows.length; k++) {
      const q = rows[k];
      for (const p of rows.slice(0, k)) {
        // only what shares room across the page keeps apart; two that overlapped in the design on purpose stay overlapped,
        // the others keep their gap, as far as the frame allows
        if (Math.min(p.i.x + p.i.w, q.i.x + q.i.w) - Math.max(p.i.x, q.i.x) < 2) continue;
        const was = q.i.y - p.i.y - p.i.h;
        q.y = Math.max(q.y, p.y + p.h + (was < 0 ? was : was * Math.min(1, kv) * shrink));
      }
    }
    return { rows, over: Math.max(0, ...rows.map((r) => r.y + r.h - safeBottom)) };
  };
  let plan = solve(1);
  for (const shrink of [0.85, 0.7]) if (plan.over > 1) plan = solve(shrink);
  // still too tall: the type gives, a tenth
  const type = plan.over > 1 ? 0.9 : 1;
  for (const { i, h, y } of plan.rows) {
    const l = i.l;
    const keep = bleedsSide(l);
    const w = keep ? l.w : Math.min(l.w, sb.w);
    const x = keep ? l.x : clamp(sb.x + ((l.x - sa.x) / sa.w) * sb.w, sb.x, Math.max(sb.x, sb.x + sb.w - w));
    out[l.id] = { x: round(x), y: round(y / B.h), w: round(w), h: l.type === "text" || l.type === "logo" ? l.h : round(h / B.h) };
    if (l.type === "text" && type < 1) out[l.id].size = round(l.size * type);
  }
  for (const [i, c] of rides) {
    if (!c) continue;
    const cb = out[c.l.id] ?? { x: c.l.x, y: c.l.y, w: c.l.w, h: c.l.h };
    const cx = cb.x * B.w + ((i.x + i.w / 2 - c.x) / c.w) * cb.w * B.w;
    const cy = cb.y * B.h + ((i.y + i.h / 2 - c.y) / c.h) * cb.h * B.h;
    out[i.l.id] = { x: round(clamp((cx - i.w / 2) / B.w, 0, 1 - i.l.w)), y: round((cy - i.h / 2) / B.h), w: i.l.w, h: i.l.type === "text" || i.l.type === "logo" ? i.l.h : round(i.h / B.h) };
  }
  return out;
}

// ---------------------------------------------------------------- layouts Brioche can suggest

export const LAYOUTS = { stack: "Stacked, centred", left: "Type left, picture bleeding", poster: "Poster over a picture", split: "Type and picture, split", strip: "One line, for a banner" };

const SIZES = { headline: { "4:5": 0.1, "1:1": 0.092, "9:16": 0.112 }, sub: { "4:5": 0.036, "1:1": 0.034, "9:16": 0.042 }, eyebrow: { "4:5": 0.026, "1:1": 0.025, "9:16": 0.03 }, cta: { "4:5": 0.028, "1:1": 0.027, "9:16": 0.032 } }
// the type of the formats that are not the three of social posts, by the shape of the frame: a share of the classic size
const SHAPE_SIZES = {
  portrait: { headline: 0.1, sub: 0.036, eyebrow: 0.026, cta: 0.028 },
  square: { headline: 0.092, sub: 0.034, eyebrow: 0.025, cta: 0.027 },
  tall: { headline: 0.112, sub: 0.042, eyebrow: 0.03, cta: 0.032 },
  wide: { headline: 0.074, sub: 0.03, eyebrow: 0.022, cta: 0.026 },
  strip: { headline: 0.06, sub: 0.03, eyebrow: 0.024, cta: 0.032 },
};
const sizeAt = (which, format) => SIZES[which][format] ?? SHAPE_SIZES[shapeOf(format)][which];

/** The preset a format is laid out in when it is not asked for one: what suits its shape, and whether the design has a picture. */
export function presetFor(format, design) {
  const shape = shapeOf(format);
  const hero = design?.layers?.some((l) => l.role === "hero" && !l.hidden);
  if (shape === "strip") return "strip";
  if (shape === "wide") return hero ? "split" : "stack";
  if (shape === "tall") return hero ? (design?.layout === "poster" ? "poster" : "left") : "stack";
  return design?.layout && LAYOUTS[design.layout] && design.layout !== "strip" ? design.layout : "left";
};

/**
 * A layout for the layers of a design by what they are for (their role), in one format, as overrides.
 * Type sizes follow the format, text is measured so what stacks does not collide, and everything
 * stays inside the safe zone but a picture meant to bleed.
 */
export function layoutPreset(design, format, preset, measure = estimate) {
  const [W, H] = [frameOf(format).w, frameOf(format).h];
  const shape = shapeOf(format);
  // a strip has room for one line only; a wide frame has no height for a column: type left and picture right, or centred
  if (shape === "strip") preset = "strip";
  else if (preset === "strip") preset = presetFor(format, design);
  else if (shape === "wide" && (preset === "stack" || preset === "left")) preset = design.layers.some((l) => l.role === "hero" && !l.hidden) ? "split" : "stack";
  const tallFrame = shape === "tall";
  const S = safeRect(format);
  const role = (r) => design.layers.find((l) => l.role === r && !l.hidden);
  const [headline, sub, eyebrow, cta, logo, hero] = ["headline", "sub", "eyebrow", "cta", "logo", "hero"].map(role);
  const out = {};
  const put = (l, patch) => l && (out[l.id] = { ...(out[l.id] ?? {}), ...patch });
  const tall = (l, patch) => (l ? measure({ ...l, ...patch }, W, H).h / H : 0);
  const logoW = (l, wide) => (l?.logo?.startsWith("mark") ? 0.13 : wide);
  // the biggest size a headline sets in within so many lines
  const biggest = (l, w, max, lines) => {
    let size = max;
    while (size > 0.04 && measure({ ...l, w, size }, W, H).lines > lines) size -= 0.004;
    return round(size);
  };
  const g = (n) => n * 0.012;
  const align = preset === "stack" ? "center" : "left";
  let y = S.y;
  // a frame short on height sets its type smaller, step by step, until the column fits
  let scaleK = 1;
  // a text laid down at y; moves y past it
  const lay = (l, which, x, w, lines = 4) => {
    if (!l) return;
    const size = which === "headline" ? biggest(l, w, sizeAt("headline", format) * scaleK * (preset === "poster" ? 1.05 : 1), lines) : round(Math.max(0.0235, sizeAt(which, format) * scaleK));
    put(l, { x: round(x), y: round(y), w: round(w), h: 0, size, align });
    y += tall(l, { w, size }) + (which === "headline" ? g(2.2) : g(1.6));
  };
  const top = (wide) => {
    if (!logo) return;
    put(logo, { x: preset === "stack" ? round(0.5 - logoW(logo, wide) / 2) : S.x, y: S.y, w: logoW(logo, wide) });
    y = S.y + tall(logo, { w: logoW(logo, wide) }) + g(tallFrame ? 3 : 2.4);
  };
  if (preset === "stack") {
    top(0.34);
    lay(eyebrow, "eyebrow", S.x, S.w, 1);
    lay(headline, "headline", S.x, S.w, tallFrame ? 4 : 3);
    lay(sub, "sub", S.x + S.w * 0.07, S.w * 0.86, 3);
    const ctaH = cta ? tall(cta, { w: S.w, size: sizeAt("cta", format) }) : 0;
    const room = S.y + S.h - ctaH - (cta ? g(2.4) : 0) - y;
    if (hero && room > 0.12) put(hero, { x: S.x, y: round(y), w: S.w, h: round(Math.min(room, (S.w * W * 1.05) / H)), fit: "cover" });
    put(cta, { x: S.x, y: round(S.y + S.h - ctaH), w: S.w, h: 0, size: sizeAt("cta", format), align: "center" });
  } else if (preset === "left") {
    const w = tallFrame ? 0.84 : 0.6;
    top(0.3);
    lay(eyebrow, "eyebrow", S.x, w, 1);
    lay(headline, "headline", S.x, w, tallFrame ? 4 : 5);
    lay(sub, "sub", S.x, w * 0.92, 5);
    if (cta) (put(cta, { x: S.x, y: round(y + g(0.8)), w: 0.5, h: 0, size: sizeAt("cta", format), align: "left" }), (y += tall(cta, { w: 0.5 }) + g(1)));
    if (hero) {
      const wide = tallFrame ? 0.96 : 0.8;
      const hy = Math.max(y + 0.03, tallFrame ? 0.5 : 0.52);
      put(hero, { x: tallFrame ? 0.12 : 1 - wide + 0.16, y: round(hy), w: wide, h: round(1.04 - hy), fit: "cover", radius: 0.04 });
    }
  } else if (preset === "poster") {
    // a photograph fills the frame behind the type; a cut-out (a product on a clear ground, kept whole) is not stretched over it:
    // it stands in the lower part, and the type keeps the upper
    const cutOut = !!hero && (hero.clear === true || hero.fit === "contain");
    if (cutOut) put(hero, { x: 0.14, y: 0.42, w: 0.72, h: 0.54, fit: "contain", radius: 0 });
    else put(hero, { x: 0, y: 0, w: 1, h: 1, fit: "cover", radius: 0 });
    const w = tallFrame ? 0.84 : 0.82;
    const size = headline ? biggest(headline, w, sizeAt("headline", format) * 1.05, 3) : 0;
    const hh = headline ? tall(headline, { w, size }) : 0;
    const sh = sub ? tall(sub, { w: w * 0.9, size: sizeAt("sub", format) }) : 0;
    const ch = cta ? tall(cta, { w: 0.5, size: sizeAt("cta", format) }) : 0;
    let at = cutOut ? S.y + 0.1 : S.y + S.h - ch - (cta ? g(2.4) : 0) - sh - (sub ? g(1.8) : 0) - hh;
    if (logo) put(logo, { x: S.x, y: S.y, w: logoW(logo, 0.3) });
    if (headline) (put(headline, { x: S.x, y: round(at), w, h: 0, size, align: "left" }), (at += hh + g(1.8)));
    if (sub) (put(sub, { x: S.x, y: round(at), w: w * 0.9, h: 0, size: sizeAt("sub", format), align: "left" }), (at += sh + g(2.4)));
    if (cta) put(cta, { x: S.x, y: round(at), w: 0.5, h: 0, size: sizeAt("cta", format), align: "left" });
    const from = Math.max(0, Math.min(0.5, (headline ? out[headline.id].y : 0.6) - 0.16));
    for (const s of design.layers.filter((l) => l.role === "deco" && l.grad)) put(s, { x: 0, y: round(from), w: 1, h: round(1 - from) });
  } else if (preset === "split") {
    if (tallFrame) {
      top(0.3);
      lay(eyebrow, "eyebrow", S.x, S.w, 1);
      lay(headline, "headline", S.x, S.w, 4);
      lay(sub, "sub", S.x, S.w * 0.92, 4);
      if (cta) (put(cta, { x: S.x, y: round(y), w: 0.5, h: 0, size: sizeAt("cta", format), align: "left" }), (y += tall(cta, { w: 0.5 }) + g(1)));
      const hy = Math.max(y + 0.02, 0.5);
      put(hero, { x: 0, y: round(hy), w: 1, h: round(1 - hy), fit: "cover", radius: 0 });
    } else {
      // (a frame with little height has its type in a column of the left half, the picture the right half)
      const w = 0.4;
      for (const k of shape === "wide" ? [1, 0.9, 0.8, 0.7, 0.6, 0.5] : [1]) {
        scaleK = k;
        y = S.y;
        top(shape === "wide" ? 0.24 : 0.26);
        lay(eyebrow, "eyebrow", S.x, w, 1);
        lay(headline, "headline", S.x, w, shape === "wide" ? 4 : format === "1:1" ? 5 : 6);
        lay(sub, "sub", S.x, w, shape === "wide" ? 4 : 7);
        // it fits when what is above the call to action ends before it begins
        if (y <= S.y + S.h - (cta ? tall(cta, { w, size: round(Math.max(0.0235, sizeAt("cta", format) * k)) }) : 0) + 0.002) break;
      }
      const ctaSize = round(Math.max(0.0235, sizeAt("cta", format) * scaleK));
      if (cta) put(cta, { x: S.x, y: round(S.y + S.h - tall(cta, { w, size: ctaSize })), w, h: 0, size: ctaSize, align: "left" });
      put(hero, { x: 0.5, y: 0, w: 0.5, h: 1, fit: "cover", radius: 0 });
    }
  } else if (preset === "strip") {
    // one line across: the logo, the words, the picture, the call to action; centred on the middle of the strip. A short strip
    // (a leaderboard) says the headline only; a taller one (an email header) its subhead too, when it has the room. What it
    // has not the width for goes, the picture first, then the call to action's width shrinks.
    const short = H < 220;
    const mid = S.y + S.h / 2;
    const col = (l, patch) => {
      const hh = tall(l, patch);
      put(l, { ...patch, y: round(mid - hh / 2) });
      return hh;
    };
    const lw = logo ? logoW(logo, short ? 0.2 : 0.22) : 0;
    const left = S.x + (logo ? lw + 0.035 : 0);
    let ctaW = cta ? (short ? 0.17 : 0.2) : 0;
    let heroW = hero && !short ? Math.min(0.2, (S.h * H) / W * 1.1) : 0;
    const room = (S.x + S.w) - left - (ctaW ? ctaW + 0.03 : 0) - (heroW ? heroW + 0.03 : 0);
    if (room < 0.34) heroW = 0;
    if ((S.x + S.w) - left - (ctaW ? ctaW + 0.03 : 0) - (heroW ? heroW + 0.03 : 0) < 0.3) ctaW = cta ? 0.15 : 0;
    const w = Math.max(0.2, (S.x + S.w) - left - (ctaW ? ctaW + 0.03 : 0) - (heroW ? heroW + 0.03 : 0));
    if (logo) col(logo, { x: round(S.x), w: lw });
    let right = S.x + S.w;
    if (cta) {
      right -= ctaW;
      col(cta, { x: round(right), w: ctaW, h: 0, size: sizeAt("cta", format), align: "right" });
      right -= 0.03;
    }
    if (hero && heroW) {
      right -= heroW;
      put(hero, { x: round(right), y: round(S.y), w: round(heroW), h: round(S.h), fit: "contain", radius: 0 });
    } else if (hero) put(hero, { hidden: true });
    const x = left;
    if (eyebrow) put(eyebrow, { hidden: true });
    if (headline) {
      const lines = short ? 2 : 3;
      const avail = S.h * 0.98;
      let subH = sub && !short ? tall(sub, { w, size: sizeAt("sub", format) }) + g(1) : 0;
      // the biggest it sets in, in so many lines, that leaves the strip's height for the rest
      let size = biggest(headline, w, sizeAt("headline", format) * (short ? 0.82 : 1), lines);
      // a subhead that would take most of the height is left out
      if (subH && tall(headline, { w, size }) + subH > avail) subH = 0;
      while (size > 0.03 && tall(headline, { w, size }) + subH > avail) size = round(size - 0.004);
      const hh = tall(headline, { w, size });
      const top = mid - (hh + subH) / 2;
      put(headline, { x: round(x), y: round(top), w: round(w), h: 0, size, align: "left" });
      if (sub && subH) put(sub, { x: round(x), y: round(top + hh + g(1)), w: round(w), h: 0, size: sizeAt("sub", format), align: "left" });
      else if (sub) put(sub, { hidden: true });
    } else if (sub) put(sub, { hidden: true });
    // everything else is left out of a strip: there is no room for a badge, a stamp or a mascot
    for (const l of design.layers) if (!out[l.id]) put(l, { hidden: true });
  }
  carry(design, out, format, measure);
  return out;
}

/**
 * What a preset does not place (a badge, a mascot, a stamp) travels with what it belongs to: a picture or
 * card it sits on, else the layer it shares a row with. It keeps its place on it, as the layer is resized.
 */
function carry(design, out, format, measure) {
  const [W, H] = [frameOf(format).w, frameOf(format).h];
  // what a layer was is read in the frame it was laid out in (the design's own), what it becomes in this one
  const [W0, H0] = [frameOf(design.format).w, frameOf(design.format).h];
  const S = safeRect(format);
  const live = design.layers.filter((l) => !l.hidden);
  const box = (l, patch) => {
    const o = { ...l, ...(patch ?? {}) };
    const [w, h] = patch ? [W, H] : [W0, H0];
    const m = measure(o, w, h);
    return { x: o.x * w, y: o.y * h, w: m.w, h: m.h };
  };
  const common = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const placed = live.filter((l) => out[l.id]);
  for (const r of live.filter((l) => !out[l.id])) {
    const rb = box(r);
    let anchor = placed.filter((p) => (p.type === "image" || p.type === "shape") && common(rb, box(p)) > 0).sort((a, b) => common(rb, box(b)) - common(rb, box(a)))[0];
    if (!anchor) {
      const gap = (p) => Math.max(0, Math.max(rb.x, box(p).x) - Math.min(rb.x + rb.w, box(p).x + box(p).w));
      anchor = placed.filter((p) => Math.min(rb.y + rb.h, box(p).y + box(p).h) - Math.max(rb.y, box(p).y) >= rb.h * 0.5).sort((a, b) => gap(a) - gap(b))[0];
    }
    if (!anchor) continue;
    const [was, now] = [box(anchor), box(anchor, out[anchor.id])];
    const [sx, sy] = anchor.type === "text" || anchor.type === "logo" ? [1, 1] : [now.w / was.w, now.h / was.h];
    const cx = now.x + now.w / 2 + (rb.x + rb.w / 2 - was.x - was.w / 2) * sx;
    const cy = now.y + now.h / 2 + (rb.y + rb.h / 2 - was.y - was.h / 2) * sy;
    const kept = r.type === "text" || r.type === "logo" || r.role === "badge";
    const [x0, x1, y0, y1] = kept ? [S.x * W, (S.x + S.w) * W, S.y * H, (S.y + S.h) * H] : [0, W, 0, H];
    const x = clamp(cx - rb.w / 2, x0, Math.max(x0, x1 - rb.w));
    let y = clamp(cy - rb.h / 2, y0, Math.max(y0, y1 - rb.h));
    // something that rides a picture does not land on type: it slides down onto the picture; and nothing that is type or a
    // badge lands on other type, where it was carried to (it slides down below what it met)
    if (anchor.type === "image" || anchor.type === "shape" || kept) {
      for (let pass = 0; pass < 3; pass++) {
        let moved = false;
        for (const t of placed.filter((p) => (p.type === "text" || p.type === "logo") && !out[p.id]?.hidden)) {
          const tb = box(t, out[t.id]);
          if (Math.min(x + rb.w, tb.x + tb.w) - Math.max(x, tb.x) > 4 && Math.min(y + rb.h, tb.y + tb.h) - Math.max(y, tb.y) > 4) ((y = tb.y + tb.h + 0.012 * H), (moved = true));
        }
        if (!moved) break;
      }
    }
    out[r.id] = { x: round(x / W), y: round(y / H) };
  }
}

/** A design with a layout preset applied in a format (its layout there, nothing else touched). */
export function withPreset(design, format, preset, measure = estimate) {
  const next = structuredClone(design);
  const over = layoutPreset(next, format, preset, measure);
  if (format === next.format) next.layers = next.layers.map((l) => ({ ...l, ...(over[l.id] ?? {}) }));
  else (next.formats ??= {})[format] = { ...(next.formats[format] ?? {}), layers: { ...reflow(next, format, measure), ...over } };
  return next;
}

// ---------------------------------------------------------------- the brand kit applied

const nearest = (kit, hex) => kit.palette.map((p) => [p, Math.abs(luminance(p.hex) - luminance(hex)) + (p.hex.toLowerCase() === hex.toLowerCase() ? -1 : 0)]).sort((a, b) => a[1] - b[1])[0]?.[0];

/** The colour behind a layer in a format: the card it rides on, else the design's ground; not known over a picture. */
export function groundOf(design, layer, kit, measure = estimate, format = design.format) {
  const F = frameOf(format);
  const lay = layoutOf(design, format, { reflow: (d, f) => reflow(d, f, measure) });
  const at = lay.layers.findIndex((l) => l.id === layer.id);
  const me = lay.layers[at] ?? layer;
  const m = measure(me, F.w, F.h);
  const [cx, cy] = [me.x * F.w + m.w / 2, me.y * F.h + m.h / 2];
  const under = lay.layers.slice(0, Math.max(0, at)).filter((l) => !l.hidden && (l.type === "shape" || l.type === "image") && cx > l.x * F.w && cx < (l.x + l.w) * F.w && cy > l.y * F.h && cy < (l.y + l.h) * F.h);
  const top = under.at(-1);
  if (top?.type === "shape" && !top.grad && top.shape !== "ring") return { hex: colorOf(kit, top.colorRole), known: true };
  if (top?.type === "image" || top?.grad) return { hex: null, known: false };
  if (lay.bg.src && !(lay.bg.dim?.alpha >= 0.55)) return { hex: null, known: false };
  return { hex: colorOf(kit, lay.bg.color, "#211927"), known: true };
}

const isRole = (kit, v) => typeof v === "string" && (v.startsWith("#") || kit.palette.some((p) => p.id === v));
const bestText = (kit, ground, prefer, big) => {
  const need = big ? 3 : 4.5;
  if (isRole(kit, prefer) && contrast(colorOf(kit, prefer), ground) >= need) return prefer;
  const ranked = kit.palette.map((p) => [p, contrast(p.hex, ground)]).sort((a, b) => b[1] - a[1]);
  return (ranked.find(([, c]) => c >= need) ?? ranked[0])?.[0].id;
};

/** The logo file of a kind that reads best on a ground: yellow or white on dark, ink on yellow and on light. */
export function logoFor(kit, kind, ground) {
  const of = kit.logos.filter((l) => l.kind === kind);
  return of.map((l) => [l, l.tone ? contrast(colorOf(kit, l.tone, "#888888"), ground) : 1]).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/**
 * Brings a design into line with the brand kit, in place: the type roles by what each text is for,
 * colours snapped to the palette and legible on their ground, the logo in the file that reads on its
 * ground, and a logo there at all. Answers what it changed, in words.
 */
export function applyKit(design, kit, measure = estimate) {
  const did = [];
  const note = (s) => !did.includes(s) && did.push(s);
  const roleFont = { headline: "display", eyebrow: "mono", label: "mono", cta: "mono", sub: "text", badge: "mono" };
  const snap = (v) => (typeof v === "string" && v.startsWith("#") ? nearest(kit, v)?.id ?? v : v);
  if (design.bg?.color) {
    const was = design.bg.color;
    design.bg.color = snap(was);
    if (was !== design.bg.color) note("Ground snapped to the palette");
  }
  // shapes first, so the type on them reads against what they turn out to be: a shape lost on its ground changes colour
  for (const l of design.layers.filter((x) => x.type === "shape")) {
    const was = l.colorRole;
    l.colorRole = snap(l.colorRole);
    if (!isRole(kit, l.colorRole)) l.colorRole = kit.palette[0]?.id ?? l.colorRole;
    const ground = l.grad || l.opacity < 0.5 ? { known: false } : groundOf(design, l, kit, measure);
    if (ground.known && contrast(colorOf(kit, l.colorRole), ground.hex) < 1.6) {
      const pick = kit.palette.map((p) => [p, contrast(p.hex, ground.hex)]).filter(([p]) => p.id !== l.colorRole).sort((a, b) => b[1] - a[1])[0]?.[0];
      if (pick) ((l.colorRole = pick.id), note("Shapes kept visible on their ground"));
    }
    if (was !== l.colorRole && !did.includes("Shapes kept visible on their ground")) note("Shapes snapped to the palette");
  }
  for (const l of design.layers) {
    if (l.type === "text") {
      const font = roleFont[l.role];
      if (font && l.fontRole !== font) ((l.fontRole = font), note("Type roles set"));
      const was = l.colorRole;
      l.colorRole = snap(l.colorRole);
      const ground = groundOf(design, l, kit, measure);
      // a colour the kit does not have (a template's "white" in a kit without one) is chosen again from the palette
      if (!isRole(kit, l.colorRole)) l.colorRole = ground.known ? bestText(kit, ground.hex, null, l.size >= 0.06) : [...kit.palette].sort((a, b) => luminance(b.hex) - luminance(a.hex))[0]?.id;
      if (l.accent && !isRole(kit, l.accent)) l.accent = undefined;
      if (ground.known) {
        l.colorRole = bestText(kit, ground.hex, l.colorRole, l.size >= 0.06) ?? l.colorRole;
        const accent = kit.palette.find((p) => p.id === (luminance(ground.hex) < 0.4 ? "yellow" : "plum")) ?? kit.palette[0];
        if (l.accent && accent && contrast(colorOf(kit, l.accent), ground.hex) < 3) l.accent = accent.id;
      }
      if (was !== l.colorRole) note("Text colours made legible");
    } else if (l.type === "logo") {
      const ground = groundOf(design, l, kit, measure);
      const pick = ground.known ? logoFor(kit, kit.logos.find((x) => x.id === l.logo)?.kind ?? "wordmark", ground.hex) : null;
      if (pick && pick.id !== l.logo) ((l.logo = pick.id), note("Logo set in the file that reads on its ground"));
    }
  }
  if (!design.layers.some((l) => l.type === "logo" && !l.hidden)) {
    const pick = logoFor(kit, "wordmark", colorOf(kit, design.bg?.color, "#211927")) ?? kit.logos[0];
    if (pick) {
      design.layers.push(newLayer("logo", { name: "Logo", logo: pick.id, x: 0.07, y: 0.07, w: pick.kind === "mark" ? 0.13 : 0.3 }));
      note("Logo added");
    }
  }
  // nothing outside the safe zone but what is meant to bleed, in every format that has a layout (and the family's others)
  for (const format of ALL_FORMATS.filter((f) => familyOf(f) === familyOf(design.format) || f === design.format || design.formats?.[f])) {
    const [s, F] = [safeRect(format), frameOf(format)];
    const lay = layoutOf(design, format, { reflow: (d, f) => reflow(d, f, measure) });
    for (const l of lay.layers) {
      if (l.hidden || covers(l) || isBand(l) || l.type === "image" || l.type === "shape") continue;
      const m = measure(l, F.w, F.h);
      const h = m.h / F.h;
      const patch = {};
      if (l.x < s.x - 0.002) patch.x = round(s.x);
      else if (l.x + l.w > s.x + s.w + 0.002) patch.x = round(Math.max(s.x, s.x + s.w - l.w));
      if (l.y < s.y - 0.002) patch.y = round(s.y);
      else if (l.y + h > s.y + s.h + 0.002) patch.y = round(Math.max(s.y, s.y + s.h - h));
      if (!Object.keys(patch).length) continue;
      note("Kept inside the safe zones");
      if (format === design.format) Object.assign(design.layers.find((x) => x.id === l.id), patch);
      else {
        design.formats ??= {};
        design.formats[format] ??= { layers: reflow(design, format, measure) };
        design.formats[format].layers[l.id] = { ...(design.formats[format].layers[l.id] ?? {}), ...patch };
      }
    }
  }
  return did;
}

// ---------------------------------------------------------------- the brand guard

/** A moving design as it looks at a time: the layers that are in, minus what a full-bleed layer above has covered. */
export function onScreen(design, t) {
  const inAt = (l) => !l.anim || ((l.anim.t0 ?? 0) <= t && t < (l.anim.t1 ?? Infinity));
  const layers = [];
  let covered = false;
  for (const l of [...design.layers].reverse()) {
    if (covered || !inAt(l)) continue;
    layers.unshift(l);
    if (!l.hidden && covers(l) && (l.opacity ?? 1) >= 0.9 && !l.grad) covered = true;
  }
  const keep = new Set(layers.map((l) => l.id));
  const next = { ...design, motion: false, layers, formats: Object.fromEntries(Object.entries(design.formats ?? {}).map(([f, v]) => [f, { ...v, layers: Object.fromEntries(Object.entries(v.layers ?? {}).filter(([id]) => keep.has(id))) }])) };
  // the layers' own timing is no longer in play: what is on screen at that time is shown whole
  return { ...next, layers: layers.map(({ anim, ...rest }) => rest) };
}

/**
 * What is off about a design in a format, against its kit: no logo, a small one, a logo lost on its
 * ground, type that is hard to read, colours outside the palette, type in the zones a story's app
 * covers, type crowding type or a logo's clear space. Each is { level: "bad" | "warn", rule, text, layer }.
 */
export function guard(design, format, kit, measure = estimate, sizes = {}) {
  // a design that moves is read at the moments that matter (its poster, its end card), with what is on screen then
  if (design.motion && design.checkAt?.length) {
    const seen = new Set();
    return design.checkAt.flatMap((t) => guard(onScreen(design, t), format, kit, measure, sizes)).filter((i) => !seen.has(`${i.rule}|${i.layer}|${i.text}`) && seen.add(`${i.rule}|${i.layer}|${i.text}`));
  }
  const issues = [];
  const add = (level, rule, text, layer) => issues.push({ level, rule, text, layer: layer?.id });
  const [F, S] = [frameOf(format), safeRect(format)];
  const lay = layoutOf(design, format, { reflow: (d, f) => reflow(d, f, measure) });
  const live = lay.layers.filter((l) => !l.hidden && l.opacity !== 0);
  const box = Object.fromEntries(live.map((l) => [l.id, { ...measure(l, F.w, F.h), x: l.x * F.w, y: l.y * F.h }]));
  const logos = live.filter((l) => l.type === "logo");
  if (!logos.length) add("warn", "logo", "No logo on it");
  for (const l of logos) {
    const file = kit.logos.find((x) => x.id === l.logo);
    if (l.w < (file?.kind === "mark" ? 0.07 : 0.16)) add("warn", "logo-size", "The logo is small: it should stay readable on a phone", l);
    const ground = groundOf(design, l, kit, measure, format);
    // a tile (the app icon) carries its own ground; the wordmark and the mark are the colour they are drawn in
    if (ground.known && file?.tone && file.kind !== "icon" && contrast(colorOf(kit, file.tone), ground.hex) < 3) add("bad", "logo-ground", "The logo is lost on this ground: use the other colour", l);
    const b = box[l.id];
    if (b.y < (S.y - 0.01) * F.h || b.y + b.h > (S.y + S.h + 0.01) * F.h) add("warn", "safe", "The logo is outside the safe zone", l);
  }
  const palette = new Set(kit.palette.map((p) => p.hex.toLowerCase()));
  const roles = new Set(kit.palette.map((p) => p.id));
  const off = new Set();
  for (const v of [lay.bg.color, ...live.flatMap((l) => [l.colorRole, l.accent])]) {
    if (typeof v !== "string") continue;
    if (v.startsWith("#") ? !palette.has(v.toLowerCase()) : !roles.has(v)) off.add(v.toUpperCase());
  }
  if (off.size) add("warn", "palette", `Colours outside the palette: ${[...off].slice(0, 3).join(", ")}`);
  const texts = live.filter((l) => l.type === "text");
  for (const l of texts) {
    const b = box[l.id];
    const ground = groundOf(design, l, kit, measure, format);
    if (ground.known) {
      const c = contrast(colorOf(kit, l.colorRole, "#ffffff"), ground.hex);
      if (c < (l.size >= 0.06 ? 3 : 4.5)) add("bad", "contrast", `Text is hard to read (${c.toFixed(1)} : 1)`, l);
    }
    if (l.size < 0.0225) add("warn", "small", "Text is too small for a phone", l);
    const inside = b.x >= (S.x - 0.01) * F.w && b.x + b.w <= (S.x + S.w + 0.01) * F.w && b.y >= (S.y - 0.01) * F.h && b.y + b.h <= (S.y + S.h + 0.01) * F.h;
    if (!inside) add("warn", "safe", format === "9:16" ? "Text sits where a story's app covers it" : "Text is outside the safe margin", l);
  }
  for (let i = 0; i < texts.length; i++) {
    for (let k = i + 1; k < texts.length; k++) {
      const [a, b] = [box[texts[i].id], box[texts[k].id]];
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ox > 8 && oy > Math.min(a.h, b.h) * 0.25) add("warn", "overlap", "Text runs into other text", texts[k]);
    }
  }
  // the clear space round a logo is a quarter of its height
  // (a logo whose file has not been read yet has no drawn size: its layer's own box is only a guess, taller than the wordmark, so
  // nothing is said about its clear space until the file is known: a warning that comes and goes with the load order is no help)
  for (const l of logos.filter((x) => kit.logos.find((f) => f.id === x.logo)?.kind !== "icon" && logoNow(kit.logos.find((f) => f.id === x.logo)?.url))) {
    const b = box[l.id];
    const x = b.h * 0.25;
    for (const o of live.filter((q) => q !== l && (q.type === "text" || q.type === "logo"))) {
      const c = box[o.id];
      if (c.x < b.x + b.w + x && c.x + c.w > b.x - x && c.y < b.y + b.h + x && c.y + c.h > b.y - x) add("warn", "clear", "Something is inside the logo's clear space", o);
    }
  }
  for (const l of live.filter((x) => x.type === "image" && x.src && sizes[x.src] && !covers(x))) {
    if ((l.w * F.w) / (sizes[l.src].w * (l.crop?.w ?? 1)) > 1.6) add("warn", "soft", "A picture is stretched past its size and will look soft", l);
  }
  const seen = new Set();
  return issues.filter((i) => !seen.has(`${i.rule}|${i.layer}|${i.text}`) && seen.add(`${i.rule}|${i.layer}|${i.text}`));
}

// ---------------------------------------------------------------- variations

/** A saved alternative of a design: the whole design, copied, saying what it is an alternative of and how. */
export function cloneDesign(design, { name, kind, note } = {}) {
  const copy = structuredClone(design);
  copy.id = uid("d");
  copy.name = name ?? `${design.name} copy`;
  copy.createdAt = copy.updatedAt = new Date().toISOString();
  copy.history = [{ at: copy.createdAt, who: "you", note: `Made from ${design.name}` }];
  copy.status = "draft";
  // a copy is not on the plan: the day belongs to the post it was made from
  delete copy.plan;
  delete copy.thumb;
  if (kind) copy.variant = { of: design.variant?.of ?? design.id, from: design.id, kind, note: note ?? "" };
  else delete copy.variant;
  return copy;
}

// ---------------------------------------------------------------- motion

/** A pop of sound where each logo lid lands (the lid is the one moment with a beat to it). */
export const soundPops = (design) => design.layers.filter((l) => l.anim?.lid).map((l) => Math.round((l.anim.lid.t0 + (l.anim.lid.dur ?? 0.6) * 0.45) * 100) / 100).slice(0, 4);

/**
 * A first timing for a design that does not move yet, as { layer id: anim }: the logo wipes in and its lid lifts and
 * lands, then the rest comes in from the top down, each layer the way it suits (type rises or fades, a picture rises
 * or pops, a line is drawn), a text that sits on a shape or a picture arriving with it. Nothing leaves.
 */
export function firstTiming(design, duration = 6, kit = null, measure = estimate) {
  const F = frameOf(design.format);
  const layers = layoutOf(design, design.format, {}).layers.filter((l) => !l.hidden && !covers(l));
  const centre = (l) => {
    const m = measure(l, F.w, F.h);
    return [l.x * F.w + m.w / 2, l.y * F.h + m.h / 2];
  };
  const inside = (p, l) => p[0] > l.x * F.w && p[0] < (l.x + l.w) * F.w && p[1] > l.y * F.h && p[1] < (l.y + l.h) * F.h;
  const anims = {};
  const stack = (l) => design.layers.findIndex((x) => x.id === l.id);
  // the logo that leads is the first one not laid on a picture (a logo on a product's label comes in with the product)
  const onPicture = (l) => layers.some((o) => o.type === "image" && stack(o) < stack(l) && inside(centre(l), o));
  const logo = layers.find((l) => l.type === "logo" && !onPicture(l));
  const T0 = 0.2;
  if (logo) {
    const kind = kit?.logos.find((x) => x.id === logo.logo)?.kind ?? (String(logo.logo).startsWith("icon") ? "icon" : "wordmark");
    anims[logo.id] = { t0: T0, in: { fx: "wipe-r", dur: 0.9, ease: "inout" }, ...(kind === "icon" ? {} : { lid: { t0: T0 + 1.1, dur: 0.5, lift: 0.45, rot: -18, ease: "back" } }) };
  }
  const rest = layers.filter((l) => l !== logo).sort((a, b) => a.y - b.y || stack(a) - stack(b));
  // what sits on a shape or a picture comes in with it, and so does a small shape that touches a larger one (a speech tail)
  const near = (a, b) => a.x * F.w < (b.x + b.w) * F.w + 12 && (a.x + a.w) * F.w > b.x * F.w - 12 && a.y * F.h < (b.y + b.h) * F.h + 12 && (a.y + a.h) * F.h > b.y * F.h - 12;
  const slots = [];
  for (const l of rest) {
    const host = l.type === "text" ? slots.findLast((s) => s.lead && inside(centre(l), s.lead))
      : l.type === "logo" ? slots.findLast((s) => s.lead?.type === "image" && inside(centre(l), s.lead))
      : l.type === "shape" ? slots.findLast((s) => s.lead?.type === "shape" && l.w * l.h < s.lead.w * s.lead.h * 0.15 && near(l, s.lead)) : null;
    if (host) host.riders.push(l);
    else slots.push({ lead: l.type === "shape" || l.type === "image" ? l : null, own: l, riders: [] });
  }
  const fx = (l) => {
    if (l.type === "text") return l.role === "headline" || l.role === "sub" ? { fx: "rise", dur: 0.7, ease: "out" } : { fx: "fade", dur: 0.5, ease: "out" };
    if (l.type === "image") return l.w >= 0.6 ? { fx: "rise", dur: 0.9, ease: "out" } : { fx: "pop", dur: 0.6, ease: "back" };
    if (l.type === "shape") {
      if (l.shape === "ring") return { fx: "ripple", dur: 0.85, ease: "out" };
      if (l.grad) return { fx: "fade", dur: 0.8, ease: "out" };
      if (l.h < 0.02 || l.w < 0.02) return { fx: "wipe-r", dur: 0.6, ease: "out" };
      return l.h < 0.12 ? { fx: "pop", dur: 0.5, ease: "back" } : { fx: "rise", dur: 0.8, ease: "out" };
    }
    return { fx: "fade", dur: 0.5, ease: "out" };
  };
  const start = logo ? T0 + 1.3 : 0.3;
  const step = slots.length > 1 ? Math.max(0.12, Math.min(0.5, (duration - 1.2 - start) / (slots.length - 1))) : 0;
  slots.forEach((s, i) => {
    const t0 = Math.round((start + i * step) * 100) / 100;
    anims[s.own.id] = { t0, in: fx(s.own) };
    for (const r of s.riders) anims[r.id] = r.type === "shape" ? { t0, in: fx(s.own) } : { t0: Math.round((t0 + 0.12) * 100) / 100, in: r.role === "headline" || r.role === "sub" ? fx(r) : { fx: "fade", dur: 0.5, ease: "out" } };
  });
  return anims;
}

// ---------------------------------------------------------------- one layer, changed

/**
 * A change to one layer, written where it belongs. What a format holds of a layer (its place, size, type size, crop,
 * and whether it shows) is the format's layout; the rest belongs to the layer. The first format's layout is the layer
 * itself, except for whether it shows: that is kept per format, so hiding a layer in one format leaves every other
 * format as it was. A format with no layout of its own is laid out first (what it was reflowed to is kept).
 */
export function patchLayerIn(design, layerId, patch, format, reflowFn) {
  const base = design.layers.find((l) => l.id === layerId);
  if (!base) return;
  const first = format === design.format;
  if (!first) {
    design.formats ??= {};
    design.formats[format] ??= { layers: reflowFn(design, format) };
  }
  for (const [k, v] of Object.entries(patch)) {
    if (k === "hidden" && first) showIn(design, format, base, !!v);
    else if (first || !LAYOUT_PROPS.includes(k)) base[k] = v;
    else (design.formats[format].layers[layerId] ??= {})[k] = v;
  }
}
/** Whether a layer is hidden in the design's first format, kept in that format's layout (nothing is kept when it is as the layer is). */
function showIn(design, format, layer, hidden) {
  const formats = (design.formats ??= {});
  if (hidden === !!layer.hidden) {
    const layers = formats[format]?.layers;
    if (layers?.[layer.id]) {
      delete layers[layer.id].hidden;
      if (!Object.keys(layers[layer.id]).length) delete layers[layer.id];
    }
    if (formats[format] && !Object.keys(formats[format].layers ?? {}).length && !formats[format].bg) delete formats[format];
    return;
  }
  ((formats[format] ??= { layers: {} }).layers[layer.id] ??= {}).hidden = hidden;
}

/** The text layers of a design in reading order: the ones a copy variation rewrites. */
export const copyLayers = (design) => design.layers.filter((l) => l.type === "text" && !l.hidden).sort((a, b) => a.y - b.y || a.x - b.x);
