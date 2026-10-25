// Spice's compositor: draws a shot's FX layers over its picture on a canvas, the same way for the viewer's live preview and for the
// bake (a picture at its full size, a clip frame by frame), so what is seen is what is made. Canvas 2D only: its blends (screen, add,
// overlay, soft light), its filters (blur for the glow, the matte's soft edge) and a hidden SVG filter for the matte's choke.
//
//   render(g, w, h, { base, matte, layers, frame, fps, still, sourceOf, edge, finish })
//     base      what the layers go over (a video, a picture, a canvas), drawn to the whole frame
//     matte     Roto's matte (white on the people) or null: the layers marked "behind" go under the people it holds
//     layers    the shot's layers, bottom of the stack first (spice-elements.js cleanLayer)
//     frame     the slate frame drawn (a layer plays on its own frames), fps the shot's rate; still: a picture (no motion)
//     sourceOf  (layer) => what an image or an AI layer is drawn from (loaded by the caller), or null while it loads
//     edge      the matte's { feather, choke } in the footage's pixels
//     finish    the shot's { bloom, vignette } over the whole composite, each from 0 to 1 (spice-elements.js cleanFinish), or none
// The order: the base, the layers behind the people, the people held in front of them, the LIGHT the layers cast on all of that, the layers
// in front, the finish. The motion and the particles are pure functions of the time (motionAt, particlesOf): the same frame always looks
// the same.
import { elementOf, blendOf } from "./spice-elements.js";

const FIRST = 1001;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
/** A number from 0 to 1 for a seed and an index: the same every time (particles are where they were). */
export const rand = (seed, i) => {
  let x = Math.imul((seed ^ 0x9e3779b9) + Math.imul(i, 0x85ebca6b), 0xc2b2ae35);
  x ^= x >>> 15;
  x = Math.imul(x, 0x27d4eb2d);
  x ^= x >>> 13;
  return ((x >>> 0) % 100000) / 100000;
};
const seedOf = (id) => [...String(id)].reduce((s, c) => (Math.imul(s, 31) + c.charCodeAt(0)) | 0, 7);
/** A smooth wobble from -1 to 1 (two sines out of step): a flame's flicker, a light's breathing. */
const wobble = (t, s) => 0.6 * Math.sin(t * 7.3 + s) + 0.4 * Math.sin(t * 13.1 + s * 1.7);

/** Whether a layer is on a frame, and its own time there (seconds from its first frame). */
export function timeOf(layer, frame, fps = 24) {
  const from = layer.from ?? FIRST;
  const to = layer.to ?? Infinity;
  if (frame < from || frame > to) return null;
  return (frame - from) / fps;
}

/**
 * How a layer's motion moves it at its own time t (seconds): an offset (in frame widths and heights), a scale and an angle added, an
 * opacity multiplied. A picture is still: nothing moves. Its first and last quarter second fade it in and out when it has an end.
 */
export function motionAt(layer, t, { still = false, span = null } = {}) {
  const m = { dx: 0, dy: 0, k: 1, rot: 0, a: 1 };
  if (still || t === null) return m;
  const v = layer.speed ?? 1;
  const s = seedOf(layer.id) % 100;
  switch (layer.motion) {
    case "flicker":
      m.a = 0.84 + 0.16 * wobble(t * v, s);
      m.k = 1 + 0.025 * wobble(t * v * 0.7, s + 3);
      break;
    case "pulse":
      m.k = 1 + 0.06 * Math.sin(t * v * 2.6 + s);
      m.a = 0.9 + 0.1 * Math.sin(t * v * 2.6 + s);
      break;
    case "spin":
      m.rot = t * v * 45;
      m.a = 0.92 + 0.08 * wobble(t * v, s);
      break;
    case "drift":
      m.dx = 0.025 * t * v;
      m.dy = 0.006 * Math.sin(t * v * 0.8 + s);
      break;
    case "rise":
      m.dy = -0.05 * t * v;
      m.dx = 0.01 * Math.sin(t * v + s);
      break;
    case "grow": {
      const p = clamp((t * v) / 0.7, 0, 1);
      m.k = 0.35 + 0.65 * (1 - (1 - p) ** 3);
      m.a = clamp(p * 3, 0, 1);
      break;
    }
    case "strobe": {
      // bright flashes and short dark gaps, as lightning does
      const n = Math.floor(t * v * 12);
      m.a = ((n * 2654435761) >>> 0) % 5 === 0 ? 0.08 : 0.75 + 0.25 * (((n * 40503) >>> 0) % 7) / 6;
      break;
    }
  }
  if (span) {
    const fade = Math.min(0.25, span / 3);
    if (fade > 0) m.a *= clamp(t / fade, 0, 1) * clamp((span - t) / fade, 0, 1);
  }
  return m;
}

// ---------------------------------------------------------------- particles

const COUNTS = { rain: 900, snow: 380, embers: 160, dust: 240, sparkles: 90 };
/**
 * Where a particle layer's specks are at a time: [{ x, y, r, len, a }] in pixels of the frame. The specks live in the layer's box (its
 * place and scale: the whole frame at scale 1) and wrap around in it; rain and snow fall along the layer's angle, embers rise, dust
 * floats, sparkles twinkle where they are.
 */
export function particlesOf(layer, w, h, t = 0, px = w / 1920) {
  const kind = layer.el;
  const base = COUNTS[kind];
  if (!base) return [];
  const v = layer.speed ?? 1;
  const box = { w: w * layer.scale, h: h * layer.scale };
  const x0 = layer.x * w - box.w / 2;
  const y0 = layer.y * h - box.h / 2;
  const n = Math.round(base * (layer.amount ?? 0.5) * clamp(layer.scale * layer.scale, 0.05, 1.6));
  const size = layer.size ?? 0.5;
  const seed = seedOf(layer.id);
  const ang = ((layer.rot ?? 0) * Math.PI) / 180;
  const out = [];
  const frac = (q) => q - Math.floor(q);
  for (let i = 0; i < n; i++) {
    const a = rand(seed, i * 4);
    const b = rand(seed, i * 4 + 1);
    const c = rand(seed, i * 4 + 2);
    const d = rand(seed, i * 4 + 3);
    let x;
    let y;
    let r;
    let len = 0;
    let alpha;
    if (kind === "rain") {
      const fall = (1.3 + c * 1.1) * v;
      y = frac(b + t * fall);
      x = frac(a + y * Math.tan(ang) * (box.h / Math.max(1, box.w)));
      len = (0.025 + 0.07 * size) * h * (0.6 + c * 0.6);
      r = (0.6 + 1.6 * size) * px * (0.7 + d * 0.6);
      alpha = 0.18 + 0.42 * d;
    } else if (kind === "snow") {
      const depth = 0.4 + c * 0.6;
      y = frac(b + t * (0.05 + 0.1 * depth) * v);
      x = frac(a + 0.012 * Math.sin(t * (0.8 + d) + a * 20) + y * Math.tan(ang) * 0.3);
      r = (1.4 + 5.5 * size) * px * depth;
      alpha = 0.45 + 0.5 * depth;
    } else if (kind === "embers") {
      const lift = (0.06 + 0.16 * c) * v;
      y = frac(b - t * lift);
      x = frac(a + 0.02 * Math.sin(t * (1.1 + d * 1.5) + a * 30));
      r = (1 + 3.5 * size) * px * (0.5 + c * 0.8);
      alpha = clamp(0.45 + 0.55 * Math.sin(t * (4 + d * 6) * v + a * 50), 0.1, 1) * (0.5 + 0.5 * (1 - y));
    } else if (kind === "dust") {
      y = frac(b + 0.02 * Math.sin(t * 0.4 * v + a * 10) - t * 0.008 * v);
      x = frac(a + 0.015 * t * v * (c - 0.5));
      r = (0.7 + 2.2 * size) * px * (0.5 + d);
      alpha = 0.2 + 0.5 * Math.abs(Math.sin(t * 0.7 + c * 9));
    } else {
      x = a;
      y = b;
      r = (2 + 7 * size) * px * (0.5 + c);
      alpha = Math.max(0, Math.sin(t * (2 + d * 3) * v + c * 40)) ** 3;
      if (t === 0) alpha = d > 0.45 ? 0.55 + 0.45 * c : 0;
    }
    out.push({ x: x0 + x * box.w, y: y0 + y * box.h, r, len, a: alpha });
  }
  return out;
}

// ---------------------------------------------------------------- canvases

const pool = new Map();
/** A scratch canvas of a size, kept for the next frame (one per use). */
function scratch(name, w, h) {
  let c = pool.get(name);
  if (!c) pool.set(name, (c = document.createElement("canvas")));
  if (c.width !== w || c.height !== h) ((c.width = w), (c.height = h));
  const g = c.getContext("2d");
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.globalCompositeOperation = "source-over";
  g.filter = "none";
  g.clearRect(0, 0, w, h);
  return { c, g };
}

const sprites = new Map();
/** A soft round speck of a colour (embers, snow, dust), or a four-pointed star (sparkles): drawn once. */
function sprite(kind, colour) {
  const k = `${kind}:${colour}`;
  if (sprites.has(k)) return sprites.get(k);
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, colour);
  grad.addColorStop(kind === "snow" ? 0.45 : 0.25, colour);
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  if (kind === "sparkles") {
    g.globalAlpha = 0.9;
    g.beginPath();
    for (const [dx, dy] of [[1, 0.06], [0.06, 1]]) g.ellipse(32, 32, 32 * dx, 32 * dy, 0, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
    g.beginPath();
    g.arc(32, 32, 9, 0, Math.PI * 2);
    g.fill();
  } else g.fillRect(0, 0, 64, 64);
  sprites.set(k, c);
  return c;
}

/** The hidden SVG filter the matte is drawn through for its choke (grown or shrunk) and its feather, at the size it is drawn. */
function holdFilter(edge, k) {
  if (!edge || (!edge.choke && !edge.feather)) return "none";
  let svg = document.getElementById("sp-hold-defs");
  if (!svg) {
    svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.id = "sp-hold-defs";
    svg.setAttribute("width", "0");
    svg.setAttribute("height", "0");
    svg.style.position = "absolute";
    svg.innerHTML = '<filter id="sp-hold" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB"><feMorphology operator="dilate" radius="0"/><feGaussianBlur stdDeviation="0"/></filter>';
    document.body.append(svg);
  }
  const morph = svg.querySelector("feMorphology");
  morph.setAttribute("operator", edge.choke > 0 ? "erode" : "dilate");
  morph.setAttribute("radius", String(Math.round(Math.abs(edge.choke ?? 0) * k * 10) / 10));
  svg.querySelector("feGaussianBlur").setAttribute("stdDeviation", String(Math.round((edge.feather ?? 0) * k * 10) / 10));
  return "url(#sp-hold)";
}

// ---------------------------------------------------------------- one layer

/** The box a layer is drawn in, in pixels: its centre, its size before its motion, its angle. An AI layer's box is its soft circle. */
export function layerBox(layer, w, h, src) {
  const e = elementOf(layer.el);
  const bw = layer.scale * w;
  const ratio = e?.kind === "image" ? (src?.naturalHeight || e.h) / (src?.naturalWidth || e.w) : e?.kind === "ai" ? 1 : h / w;
  return { cx: layer.x * w, cy: layer.y * h, bw, bh: bw * ratio, rot: e?.kind === "particles" ? 0 : layer.rot ?? 0 };
}

function drawImageLayer(g, w, h, layer, src, m) {
  const box = layerBox(layer, w, h, src);
  const bw = Math.max(1, Math.round(box.bw * m.k));
  const bh = Math.max(1, Math.round(box.bh * m.k));
  const { c, g: e } = scratch("element", bw, bh);
  e.drawImage(src, 0, 0, bw, bh);
  // a tint is the colour's hue and saturation over the element's own light (its black stays black)
  if (layer.tint) {
    e.globalCompositeOperation = "color";
    e.globalAlpha = layer.tintAmt ?? 0.8;
    e.fillStyle = layer.tint;
    e.fillRect(0, 0, bw, bh);
    e.globalAlpha = 1;
    e.globalCompositeOperation = "destination-in";
    e.drawImage(src, 0, 0, bw, bh);
  }
  // a soft edge fades it to nothing towards its box's edge
  if (layer.soft > 0) {
    e.globalCompositeOperation = "destination-in";
    const r = Math.max(bw, bh) / 2;
    const grad = e.createRadialGradient(bw / 2, bh / 2, r * (1 - layer.soft) * 0.95, bw / 2, bh / 2, r);
    grad.addColorStop(0, "#000");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    e.fillStyle = grad;
    e.fillRect(0, 0, bw, bh);
  }
  e.globalCompositeOperation = "source-over";
  g.save();
  g.translate(box.cx + m.dx * w, box.cy + m.dy * h);
  g.rotate(((box.rot + m.rot) * Math.PI) / 180);
  g.scale(layer.flipX ? -1 : 1, layer.flipY ? -1 : 1);
  const alpha = clamp(layer.opacity * m.a, 0, 1);
  // its glow: the element blurred and added under it
  if (layer.glow > 0) {
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = alpha * layer.glow * 0.9;
    g.filter = `blur(${Math.max(1, Math.round(layer.glow * 0.05 * Math.max(bw, bh)))}px)`;
    g.drawImage(c, -bw / 2, -bh / 2);
    g.filter = "none";
  }
  g.globalCompositeOperation = blendOf(layer.blend).op;
  g.globalAlpha = alpha;
  g.drawImage(c, -bw / 2, -bh / 2);
  g.restore();
}

function drawParticles(g, w, h, layer, t, m, px) {
  const specks = particlesOf(layer, w, h, t ?? 0, px ?? w / 1920);
  if (!specks.length) return;
  const { c, g: p } = scratch("particles", w, h);
  const colour = layer.colour ?? "#ffffff";
  if (layer.el === "rain") {
    p.strokeStyle = colour;
    p.lineCap = "round";
    const ang = ((layer.rot ?? 0) * Math.PI) / 180;
    const sx = Math.sin(ang);
    const sy = Math.cos(ang);
    for (const s of specks) {
      p.globalAlpha = s.a;
      // (a streak never thinner than most of a pixel: rain drawn small stays rain)
      p.lineWidth = Math.max(0.75, s.r);
      p.beginPath();
      p.moveTo(s.x, s.y);
      p.lineTo(s.x - sx * s.len, s.y - sy * s.len);
      p.stroke();
    }
  } else {
    const sp = sprite(layer.el, colour);
    for (const s of specks) {
      if (s.a <= 0.01) continue;
      p.globalAlpha = clamp(s.a, 0, 1);
      const d = s.r * (layer.el === "sparkles" ? 3 : 2.4);
      p.drawImage(sp, s.x - d / 2, s.y - d / 2, d, d);
    }
  }
  g.save();
  const alpha = clamp(layer.opacity * m.a, 0, 1);
  if (layer.glow > 0) {
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = alpha * layer.glow;
    g.filter = `blur(${Math.max(1, Math.round(layer.glow * 6 * (px ?? w / 1920)))}px)`;
    g.drawImage(c, 0, 0);
    g.filter = "none";
  }
  g.globalCompositeOperation = blendOf(layer.blend).op;
  g.globalAlpha = alpha;
  g.drawImage(c, 0, 0);
  g.restore();
}

/** An AI layer: the frame a model made again, kept only in its soft circle (the rest is the shot). */
function drawAiLayer(g, w, h, layer, src, m) {
  const { c, g: s } = scratch("ai", w, h);
  s.drawImage(src, 0, 0, w, h);
  s.globalCompositeOperation = "destination-in";
  const r = Math.max(4, (layer.scale * w) / 2);
  const grad = s.createRadialGradient(layer.x * w, layer.y * h, r * (1 - clamp(layer.soft || 0.01, 0.01, 1)), layer.x * w, layer.y * h, r);
  grad.addColorStop(0, "#000");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  s.fillStyle = grad;
  s.fillRect(0, 0, w, h);
  g.save();
  g.globalCompositeOperation = blendOf(layer.blend).op;
  g.globalAlpha = clamp(layer.opacity * m.a, 0, 1);
  g.drawImage(c, 0, 0);
  g.restore();
}

/** Where a layer is on a frame: its own time and its motion then ({ t, m }), or null when it is not on that frame. */
function stateOf(layer, ctx) {
  const t = ctx.still ? 0 : timeOf(layer, ctx.frame ?? FIRST, ctx.fps ?? 24);
  if (t === null) return null;
  const span = layer.to !== null && layer.to !== undefined ? (layer.to - (layer.from ?? FIRST) + 1) / (ctx.fps ?? 24) : null;
  return { t, m: motionAt(layer, t, { still: ctx.still, span }) };
}

function drawLayer(g, w, h, layer, ctx) {
  const at = stateOf(layer, ctx);
  if (!at) return;
  const { t, m } = at;
  const e = elementOf(layer.el);
  if (e.kind === "particles") return drawParticles(g, w, h, layer, ctx.still ? 0 : t, m, ctx.pixel);
  const src = ctx.sourceOf?.(layer);
  if (!src) return;
  if (e.kind === "ai") return drawAiLayer(g, w, h, layer, src, m);
  drawImageLayer(g, w, h, layer, src, m);
}

// ---------------------------------------------------------------- the light the layers cast

// The numbers of the look, found by eye on a prototype: they are the look, so they stay as they are.
const PEOPLE = 0.7; // how much of a light behind the people does not fall on their faces (they get it on their edge instead)
const RIM_W = 0.006; // the rim's width: a share of the frame's width, blurred
const RIM_GAIN = 3; // how bright the rim is (the light behind, times this)
const LIGHT_K = 3; // how strongly a light lifts what it falls on
const HAZE = 0.12; // how much of a light hangs in the air
const LIT = 0.08; // a pixel of an element is lit (counts for its colour) when its brightest channel is above this
/** How a light falls off from its middle (0) to the edge of its reach (1): [where, how much of it is left]. */
const FALL = [[0, 1], [0.1, 0.75], [0.25, 0.38], [0.5, 0.13], [0.75, 0.04], [1, 0]];

/** A frame's scratch canvas that starts black (a light is added to black). */
function dark(name, w, h) {
  const s = scratch(name, w, h);
  s.g.fillStyle = "#000";
  s.g.fillRect(0, 0, w, h);
  return s;
}

const shines = new WeakMap();
/**
 * The colour an element shines in: the mean of the pixels it is lit in (its brightest channel above LIT, read once from a small copy of
 * it), raised until its own brightest channel is 1. [r, g, b] from 0 to 1; white for an element with nothing lit.
 */
function shineOf(src) {
  let rgb = shines.get(src);
  if (rgb) return rgb;
  rgb = [1, 1, 1];
  try {
    const probe = document.createElement("canvas");
    probe.width = probe.height = 32;
    const p = probe.getContext("2d", { willReadFrequently: true });
    p.drawImage(src, 0, 0, 32, 32);
    const px = p.getImageData(0, 0, 32, 32).data;
    const sum = [0, 0, 0];
    let n = 0;
    for (let i = 0; i < px.length; i += 4) {
      if (Math.max(px[i], px[i + 1], px[i + 2]) <= LIT * 255) continue;
      sum[0] += px[i];
      sum[1] += px[i + 1];
      sum[2] += px[i + 2];
      n++;
    }
    if (n && Math.max(...sum) > 0) rgb = sum.map((v) => v / Math.max(...sum));
  } catch {
    // (a picture that cannot be read shines white)
  }
  shines.set(src, rgb);
  return rgb;
}

/** The colour a layer's light has: its element's own, or that mixed with its tint (as much as the tint is laid on), its brightest channel 1. */
function lightOf(layer, src) {
  const own = shineOf(src);
  if (!layer.tint) return own;
  const amount = layer.tintAmt ?? 0.8;
  const tint = [1, 3, 5].map((i) => parseInt(layer.tint.slice(i, i + 2), 16) / 255);
  const mix = own.map((c, i) => c * (1 - amount) + tint[i] * amount);
  const top = Math.max(...mix);
  return top > 0 ? mix.map((c) => c / top) : own;
}

/** `rgb()` of a colour at a strength, opaque (a light is added to black, so its strength is how bright it is). */
const rgbAt = (col, k) => `rgb(${col.map((c) => Math.round(clamp(c * k, 0, 1) * 255)).join(",")})`;

/**
 * The matte drawn at the frame's size (w x h) with its edge pixels carried on outward by `p` on every side: a canvas blur reads black
 * past the frame's edge, which would make a person who is cut by the frame look as if their body ended there (and light a rim on it).
 * The people go on past the frame, so what is blurred has them go on.
 */
function carried(matte, w, h, p) {
  const { c, g } = scratch("matte-carried", w + 2 * p, h + 2 * p);
  const mw = matte.videoWidth || matte.naturalWidth || matte.width;
  const mh = matte.videoHeight || matte.naturalHeight || matte.height;
  g.drawImage(matte, p, p, w, h);
  // (one pixel of each side, stretched over the margin; then of each corner)
  g.drawImage(matte, 0, 0, 1, mh, 0, p, p, h);
  g.drawImage(matte, mw - 1, 0, 1, mh, p + w, p, p, h);
  g.drawImage(matte, 0, 0, mw, 1, p, 0, w, p);
  g.drawImage(matte, 0, mh - 1, mw, 1, p, p + h, w, p);
  for (const [sx, sy, dx, dy] of [[0, 0, 0, 0], [mw - 1, 0, p + w, 0], [0, mh - 1, 0, p + h], [mw - 1, mh - 1, p + w, p + h]]) g.drawImage(matte, sx, sy, 1, 1, dx, dy, p, p);
  return c;
}

/**
 * Adds the light of each layer of a list that shines on a frame to a black frame `into`: a picture layer with `light` above 0 (a
 * particle or an AI layer casts none) that is on the frame and loaded. The light is an ellipse centred where the layer is (its motion
 * moves it), `reach` boxes of the layer wide and high (its motion scales them), turned as the layer is, in the layer's colour, fading
 * as FALL says and as bright as the layer's light and its motion's opacity say. Answers how many were added.
 */
function shine(into, w, h, list, ctx) {
  let n = 0;
  into.globalCompositeOperation = "lighter";
  for (const layer of list) {
    if (!(layer.light > 0) || elementOf(layer.el)?.kind !== "image") continue;
    const at = stateOf(layer, ctx);
    const src = at && ctx.sourceOf?.(layer);
    if (!src) continue;
    const { m } = at;
    const box = layerBox(layer, w, h, src);
    const col = lightOf(layer, src);
    const grad = into.createRadialGradient(0, 0, 0, 0, 0, 1);
    for (const [where, left] of FALL) grad.addColorStop(where, rgbAt(col, layer.light * m.a * left));
    const reach = layer.reach ?? 1.6;
    into.save();
    into.translate(box.cx + m.dx * w, box.cy + m.dy * h);
    into.rotate(((box.rot + m.rot) * Math.PI) / 180);
    into.scale(reach * box.bw * m.k, reach * box.bh * m.k);
    into.fillStyle = grad;
    into.fillRect(-1, -1, 2, 2);
    into.restore();
    n++;
  }
  into.globalCompositeOperation = "source-over";
  return n;
}

/**
 * The light the layers cast on the shot, on g where it holds the picture and the people (before the layers in front are laid). The lights
 * of the layers behind the people (held by the matte) go in one black frame, the lights of all the others in another. Then:
 *   the rim      the people's inner edge (the matte times one minus its own blur) times the light behind them, kept for the end;
 *   the people   get little of a light behind them on their faces: it is multiplied by one minus PEOPLE of the matte;
 *   the spill    that light and the others added: where light falls on the shot;
 *   the picture  is lit by the spill in its own colours: the picture times the spill, lifted LIGHT_K times and added, so its texture stays;
 *   the haze     a little of the spill is screened over it, as light hangs in the air;
 *   and last the rim is added.
 */
function castLight(g, w, h, behind, front, ctx, holdOf) {
  const { c: back, g: bg } = dark("light-behind", w, h);
  const { c: others, g: og } = dark("light-front", w, h);
  const nb = shine(bg, w, h, behind, ctx);
  const nf = shine(og, w, h, front, ctx);
  if (!nb && !nf) return;
  let spill = others;
  let rim = null;
  if (nb) {
    const hold = holdOf();
    // the rim: the matte (held as the people are), times one minus its blur (only its inner edge is left), times the light behind it
    const edge = scratch("rim", w, h);
    edge.g.filter = hold;
    edge.g.drawImage(ctx.matte, 0, 0, w, h);
    edge.g.globalCompositeOperation = "multiply";
    edge.g.filter = `blur(${RIM_W * w}px) invert(1)`;
    const reach = Math.ceil(RIM_W * w * 3);
    edge.g.drawImage(carried(ctx.matte, w, h, reach), -reach, -reach);
    edge.g.filter = "none";
    edge.g.drawImage(back, 0, 0);
    rim = edge.c;
    // the people in front of a light behind them: back x (1 - PEOPLE x matte)
    bg.globalCompositeOperation = "multiply";
    bg.globalAlpha = PEOPLE;
    bg.filter = hold === "none" ? "invert(1)" : `${hold} invert(1)`;
    bg.drawImage(ctx.matte, 0, 0, w, h);
    bg.filter = "none";
    bg.globalAlpha = 1;
    // the spill: what is behind and what is not, added
    bg.globalCompositeOperation = "lighter";
    if (nf) bg.drawImage(others, 0, 0);
    bg.globalCompositeOperation = "source-over";
    spill = back;
  }
  // the picture lit in its own colours, texture and all: (picture x spill) x LIGHT_K, added
  const lit = scratch("lit", w, h);
  lit.g.drawImage(g.canvas, 0, 0, w, h, 0, 0, w, h);
  lit.g.globalCompositeOperation = "multiply";
  lit.g.drawImage(spill, 0, 0);
  g.globalCompositeOperation = "lighter";
  g.filter = `brightness(${LIGHT_K})`;
  g.drawImage(lit.c, 0, 0);
  g.filter = "none";
  // a little of it hangs in the air
  g.globalCompositeOperation = "screen";
  g.globalAlpha = HAZE;
  g.drawImage(spill, 0, 0);
  g.globalAlpha = 1;
  // and the people's edge, lit from behind
  if (rim) {
    g.globalCompositeOperation = "lighter";
    g.filter = `brightness(${RIM_GAIN})`;
    g.drawImage(rim, 0, 0);
    g.filter = "none";
  }
  g.globalCompositeOperation = "source-over";
}

// ---------------------------------------------------------------- the finish

/**
 * The finish of the whole composite: a bloom (the bright parts of the frame, blurred, screened over it) and a vignette (the corners
 * darkened). Each is from 0 (none) to 1; sizes are shares of the frame, so a preview and a bake finish alike.
 */
function finishShot(g, w, h, finish) {
  const bloom = clamp(finish?.bloom ?? 0, 0, 1);
  const vignette = clamp(finish?.vignette ?? 0, 0, 1);
  if (bloom > 0) {
    // the bright parts only (darkened a little, then pushed apart), at half size: it is blurred wide anyway
    const bw = Math.max(1, Math.round(w / 2));
    const bh = Math.max(1, Math.round(h / 2));
    const { c: bright, g: b } = scratch("bloom", bw, bh);
    b.filter = "brightness(0.7) contrast(3)";
    b.drawImage(g.canvas, 0, 0, w, h, 0, 0, bw, bh);
    b.filter = "none";
    g.globalCompositeOperation = "screen";
    g.globalAlpha = bloom;
    g.filter = `blur(${0.012 * w}px)`;
    g.drawImage(bright, 0, 0, w, h);
    g.filter = "none";
    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";
  }
  if (vignette > 0) {
    // clear to the middle, darkening from 0.45 of the way to the corner to black at the corner
    const reach = Math.hypot(w / 2, h / 2);
    const grad = g.createRadialGradient(w / 2, h / 2, 0.45 * reach, w / 2, h / 2, reach);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, `rgba(0,0,0,${vignette})`);
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  }
}

// ---------------------------------------------------------------- the composite

/**
 * The composite of a frame on g (w x h): the base, the layers behind the people, the people again from the base through the matte, the
 * light the layers cast on all of that (only when a layer shines), the layers in front, the finish. A layer hidden (its eye off) is not
 * drawn. Answers how many layers were drawn.
 */
export function render(g, w, h, ctx) {
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.globalCompositeOperation = "source-over";
  g.filter = "none";
  if (ctx.base) g.drawImage(ctx.base, 0, 0, w, h);
  else g.clearRect(0, 0, w, h);
  const shown = (ctx.layers ?? []).filter((l) => l.eye !== false);
  const behind = ctx.matte ? shown.filter((l) => l.behind) : [];
  const front = shown.filter((l) => !behind.includes(l));
  // (the matte's edge, as a filter at this size: made once for the people held and the light that falls on them)
  let hold = null;
  const holdOf = () => (hold ??= holdFilter(ctx.edge, w / (ctx.footageWidth || w)));
  for (const l of behind) drawLayer(g, w, h, l, ctx);
  if (behind.length && ctx.base) {
    // the people held in front: what is drawn kept where the matte is black, the base where it is white (C x (1 - m) + base x m)
    const filter = holdOf();
    const { c: held, g: hg } = scratch("held", w, h);
    hg.drawImage(ctx.base, 0, 0, w, h);
    hg.globalCompositeOperation = "multiply";
    hg.filter = filter;
    hg.drawImage(ctx.matte, 0, 0, w, h);
    g.globalCompositeOperation = "multiply";
    g.filter = filter === "none" ? "invert(1)" : `${filter} invert(1)`;
    g.drawImage(ctx.matte, 0, 0, w, h);
    g.filter = "none";
    g.globalCompositeOperation = "lighter";
    g.drawImage(held, 0, 0);
    g.globalCompositeOperation = "source-over";
  }
  if (ctx.base && shown.some((l) => l.light > 0)) castLight(g, w, h, behind, front, ctx, holdOf);
  for (const l of front) drawLayer(g, w, h, l, ctx);
  finishShot(g, w, h, ctx.finish);
  g.restore();
  return shown.length;
}
