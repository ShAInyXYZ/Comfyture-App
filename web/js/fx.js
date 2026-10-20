// Beat effects. An effect is an item on the edit's effects track (shake, zoom, flash, colour) that
// fires on the beats inside its range. This module is the only place that knows what each one does:
// fxAt(t, body) says it for a moment (the preview draws that), and fxPlan(body, size) says the
// same as ffmpeg expressions (the render applies those), both from the same numbers, so a frame of
// the preview is a frame of the film. Pure functions, no DOM: the browser and the server import it.

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v, d) => (v !== null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : d);
const ms = (v) => Math.round(v * 1000) / 1000;
const TAU = Math.PI * 2;

export const FX_KINDS = [["zoom", "Zoom pulse"], ["shake", "Shake"], ["flash", "Flash"], ["hue", "Colour"]];
/** How often an effect fires: every so many beats (0: once, where it starts; under 1: between the beats too). */
export const EVERY = [[0.5, "Twice a beat"], [1, "Every beat"], [2, "Every 2 beats"], [4, "Every bar"], [8, "Every 2 bars"], [16, "Every 4 bars"], [0, "Once, at its start"]];
export const FX_DEFAULTS = {
  zoom: { every: 1, intensity: 0.6, dur: 0.22 },
  shake: { every: 2, intensity: 0.6, dur: 0.3 },
  flash: { every: 4, intensity: 0.7, dur: 0.16 },
  hue: { every: 4, intensity: 0.6, dur: 0.4 },
};

// What one hit does at intensity 1, as the picture's own units (fractions of the frame, degrees)
const ZOOM = 0.1; // a zoom pulse swells the picture by this much, then eases back
const SHAKE = { amp: 0.022, hz: 15, roll: 0.0157, pad: 0.08 }; // frame widths, shakes a second, radians, the swell that hides its edges
const HUE = { deg: 140, sat: 0.5, bright: 0.06 };
// a hit's strength over its length: a punch (fast, then easing), or a straight fade
const punch = (u) => (u >= 0 && u < 1 ? (1 - u) * (1 - u) : 0);
const fade = (u) => (u >= 0 && u < 1 ? 1 - u : 0);

/** A frame shape "16:9" as width over height. */
export function aspectRatio(aspect) {
  const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(String(aspect ?? ""));
  return m && Number(m[2]) > 0 ? Number(m[1]) / Number(m[2]) : 16 / 9;
}

// ---------------------------------------------------------------- the whip-tilt join

/**
 * A whip-tilt into a clip (`join: "whip"`): over the last five frames of the clip before, this clip's
 * first frame is stacked above the clip before and a window sweeps up over the pair, as the camera
 * whips up from what was there to what comes. `tops` is where the window's top sits on each frame, as
 * a share of a frame's height (0.8: the window shows the clip before almost whole); each frame is blurred
 * along the way it moves, by `blur` pixels times that share on a frame this tall (at least `least`).
 * The film draws it and the preview follows it from these numbers.
 */
export const WHIP = { frames: 5, tops: [0.8, 0.6, 0.4, 0.22, 0.08], blur: 140, least: 8, tall: 1280 };
/** The vertical blur of whip frame `k` on a frame `height` tall, in pixels. */
export const whipBlur = (k, height) => Math.max(1, Math.round(Math.max(WHIP.least, WHIP.blur * WHIP.tops[k]) * (height / WHIP.tall)));

// ---------------------------------------------------------------- beats

/** The beats of an edit in seconds, as they are heard: each time moved by the global offset. */
export function beatTimes(body, upto = 0) {
  const b = body?.beats;
  if (!b) return [];
  const off = num(b.offset, 0);
  let times = Array.isArray(b.times) ? b.times.map(Number).filter(Number.isFinite) : [];
  // a tempo and no beats: the grid it makes, as far as asked
  if (!times.length && num(b.bpm, 0) > 0 && upto > 0) {
    const step = 60 / num(b.bpm, 120);
    for (let t = 0; t <= upto && times.length < 4000; t += step) times.push(t);
  }
  return times.map((t) => ms(t + off));
}

/** The times an effect fires at: on the beats inside its range, every so many of them. */
export function hitsOf(item, body) {
  const start = num(item.start, 0);
  const end = start + num(item.length, 4);
  const every = item.every === undefined || item.every === null ? (FX_DEFAULTS[item.kind]?.every ?? 1) : num(item.every, 1);
  const beats = beatTimes(body, end + 2);
  if (every <= 0 || !beats.length) return [ms(start)];
  const down = Math.round(num(body.beats?.down, 0));
  const step = Math.max(1, Math.round(every));
  const sub = every < 1 ? Math.max(2, Math.round(1 / every)) : 1;
  const hits = [];
  for (let k = 0; k < beats.length; k++) {
    if (every >= 1 && (((k - down) % step) + step) % step !== 0) continue;
    const here = beats[k];
    const next = beats[k + 1] ?? here + (here - (beats[k - 1] ?? here - 0.5));
    for (let j = 0; j < sub; j++) {
      const t = ms(here + (j * (next - here)) / sub);
      if (t >= start - 1e-6 && t < end) hits.push(t);
    }
  }
  return hits;
}

// ---------------------------------------------------------------- the effects of an edit

/** An effect's numbers, kept in range. */
export function fxParams(item) {
  const d = FX_DEFAULTS[item.kind] ?? FX_DEFAULTS.zoom;
  return { intensity: ms(clamp(num(item.intensity, d.intensity), 0, 2)), dur: ms(clamp(num(item.dur, d.dur), 0.04, 2)) };
}

/** The effects that are on: every item of an effects track not switched off (nor the track), with the times it fires. */
export function effectsOf(body) {
  const out = [];
  for (const t of body?.tracks ?? []) {
    if (t.kind !== "fx" || t.mute) continue;
    for (const it of t.items ?? []) {
      if (it.on === false || !FX_DEFAULTS[it.kind]) continue;
      out.push({ item: it, kind: it.kind, ...fxParams(it), hits: hitsOf(it, body) });
    }
  }
  return out;
}

/** What the effects do to the picture at a time: zoom (1 is none), a shift and a turn, light, colour, a white flash. */
export function fxAt(t, body, list = effectsOf(body)) {
  const out = { zoom: 1, dx: 0, dy: 0, rot: 0, bright: 0, sat: 1, hue: 0, flash: 0 };
  const ratio = aspectRatio(body?.aspect);
  for (const e of list) {
    for (const h of e.hits) {
      const u = (t - h) / e.dur;
      if (u < 0 || u >= 1) continue;
      if (e.kind === "zoom") out.zoom += ZOOM * e.intensity * punch(u);
      else if (e.kind === "shake") {
        const k = SHAKE.amp * e.intensity * punch(u);
        const s = t - h;
        out.dx += k * Math.sin(TAU * SHAKE.hz * s + 0.9);
        out.dy += k * ratio * Math.sin(TAU * SHAKE.hz * 1.27 * s + 2.3);
        out.rot += SHAKE.roll * e.intensity * punch(u) * Math.sin(TAU * SHAKE.hz * 0.83 * s + 0.4);
        out.zoom += SHAKE.pad * e.intensity * punch(u);
      } else if (e.kind === "flash") out.flash += Math.min(1, e.intensity) * fade(u);
      else if (e.kind === "hue") {
        out.hue += HUE.deg * e.intensity * punch(u);
        out.sat += HUE.sat * e.intensity * punch(u);
        out.bright += HUE.bright * e.intensity * punch(u);
      }
    }
  }
  out.flash = Math.min(1, out.flash);
  return out;
}

// ---------------------------------------------------------------- the same as ffmpeg expressions

// numbers as they go into an expression: times to the millisecond, factors to the millionth
const c = (v) => String(Math.round(v * 1e6) / 1e6);
/** A number in an expression, bracketed when it is negative. */
const lit = (v) => (v < 0 ? `(${c(v)})` : c(v));

/**
 * The sum of f(h) over an effect's hits as one expression of t. Hits on a steady grid (the usual
 * case) become one periodic term; others a term each.
 */
function sumOver(hits, dur, f) {
  if (!hits.length) return "";
  const p = hits.length > 3 ? (hits.at(-1) - hits[0]) / (hits.length - 1) : 0;
  const steady = p >= dur && hits.every((h, i) => Math.abs(h - (hits[0] + i * p)) < 0.0015);
  if (steady) {
    const rel = `mod(t-${lit(hits[0])},${c(p)})`;
    return `between(t,${c(hits[0] - 0.0005)},${c(hits.at(-1) + dur)})*${f(rel, true)}`;
  }
  return hits.map((h) => `between(t,${c(h)},${c(h + dur)})*${f(`(t-${lit(h)})`, false)}`).join("+");
}

/**
 * The effects as ffmpeg expressions in t (plain commas: the planner escapes them): zoom, dx and dy
 * (fractions of the frame), rot (radians), hue (degrees), sat, bright, each null when nothing
 * moves it, and flashes: [{ at, dur, amount }], one windowed blend each. Same numbers as fxAt.
 */
export function fxPlan(body) {
  const list = effectsOf(body);
  const ratio = aspectRatio(body?.aspect);
  const terms = { zoom: [], dx: [], dy: [], rot: [], hue: [], sat: [], bright: [] };
  const flashes = [];
  for (const e of list) {
    if (!e.hits.length) continue;
    const I = e.intensity;
    const d = e.dur;
    // the strength over the hit, from the time since it, as an expression: a punch or a fade
    const env = (rel, steady, kind) => (steady ? `pow(max(0,1-${rel}/${c(d)}),${kind})` : `pow(1-${rel}/${c(d)},${kind})`);
    if (e.kind === "zoom") terms.zoom.push(sumOver(e.hits, d, (rel, steady) => `${c(ZOOM * I)}*${env(rel, steady, 2)}`));
    else if (e.kind === "shake") {
      terms.dx.push(sumOver(e.hits, d, (rel, steady) => `${c(SHAKE.amp * I)}*${env(rel, steady, 2)}*sin(${c(TAU * SHAKE.hz)}*${rel}+0.9)`));
      terms.dy.push(sumOver(e.hits, d, (rel, steady) => `${c(SHAKE.amp * I * ratio)}*${env(rel, steady, 2)}*sin(${c(TAU * SHAKE.hz * 1.27)}*${rel}+2.3)`));
      terms.rot.push(sumOver(e.hits, d, (rel, steady) => `${c(SHAKE.roll * I)}*${env(rel, steady, 2)}*sin(${c(TAU * SHAKE.hz * 0.83)}*${rel}+0.4)`));
      terms.zoom.push(sumOver(e.hits, d, (rel, steady) => `${c(SHAKE.pad * I)}*${env(rel, steady, 2)}`));
    } else if (e.kind === "hue") {
      terms.hue.push(sumOver(e.hits, d, (rel, steady) => `${c(HUE.deg * I)}*${env(rel, steady, 2)}`));
      terms.sat.push(sumOver(e.hits, d, (rel, steady) => `${c(HUE.sat * I)}*${env(rel, steady, 2)}`));
      terms.bright.push(sumOver(e.hits, d, (rel, steady) => `${c(HUE.bright * I)}*${env(rel, steady, 2)}`));
    } else if (e.kind === "flash") for (const h of e.hits) flashes.push({ at: h, dur: d, amount: ms(Math.min(1, I)) });
  }
  const join = (list, base) => {
    const parts = list.filter(Boolean);
    return parts.length ? `${base}${parts.map((p) => `+${p}`).join("")}`.replace(/^0\+/, "") : null;
  };
  return {
    zoom: join(terms.zoom, "1"),
    dx: join(terms.dx, "0"),
    dy: join(terms.dy, "0"),
    rot: join(terms.rot, "0"),
    hue: join(terms.hue, "0"),
    sat: join(terms.sat, "1"),
    bright: join(terms.bright, "0"),
    flashes,
  };
}

/**
 * The colour change as the film makes it, as the 4 x 5 matrix an SVG filter takes (row by row, an
 * offset last in each): ffmpeg's hue turns the picture's chroma by an angle (and scales it), its
 * brightness lifts the light; both are done here on the same terms (BT.601), so the preview's
 * colours are the film's, not a near match.
 */
export function colourMatrix({ hue = 0, sat = 1, bright = 0 } = {}) {
  const Kr = 0.299;
  const Kb = 0.114;
  const Kg = 1 - Kr - Kb;
  const toYCC = [[Kr, Kg, Kb], [-Kr / (2 * (1 - Kb)), -Kg / (2 * (1 - Kb)), 0.5], [0.5, -Kg / (2 * (1 - Kr)), -Kb / (2 * (1 - Kr))]];
  const a = (hue * Math.PI) / 180;
  const c = Math.cos(a) * sat;
  const sn = Math.sin(a) * sat;
  // Cb' = c Cb - s Cr, Cr' = c Cr + s Cb: the chroma turned and scaled, the light left alone
  const turn = [[1, 0, 0], [0, c, -sn], [0, sn, c]];
  const back = [[1, 0, 2 * (1 - Kr)], [1, -(2 * (1 - Kb) * Kb) / Kg, -(2 * (1 - Kr) * Kr) / Kg], [1, 2 * (1 - Kb), 0]];
  const mul = (A, B) => A.map((row) => B[0].map((_, j) => row.reduce((sum, v, k) => sum + v * B[k][j], 0)));
  const M = mul(back, mul(turn, toYCC));
  // eq's brightness adds to the light in 8-bit codes, a little more than a whole step of full range
  const off = (bright * 256) / 219;
  return [...M[0], 0, off, ...M[1], 0, off, ...M[2], 0, off, 0, 0, 0, 1, 0].map((v) => Math.round(v * 1e6) / 1e6);
}

/** Whether an edit has any effect on (so the render needs no effect filters for it when not). */
export const hasFx = (body) => effectsOf(body).some((e) => e.hits.length);

// ---------------------------------------------------------------- making effects

let n = 0;
const uid = () => `fx${Date.now().toString(36)}${(n++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;
/** A new effect item: its kind's defaults, from a time for a length. */
export function newFx(kind, start = 0, length = 8, extra = {}) {
  const d = FX_DEFAULTS[kind] ?? FX_DEFAULTS.zoom;
  return { id: uid(), kind, on: true, every: d.every, intensity: d.intensity, dur: d.dur, start: ms(Math.max(0, start)), length: ms(Math.max(0.5, length)), ...extra };
}
