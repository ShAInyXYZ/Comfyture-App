// The beat effects, held against themselves and against the film: the expressions the render uses
// must say what fxAt says (so the preview and the film agree), and a film rendered with ffmpeg must
// show them where and as strongly as fxAt says. Needs ffmpeg.

import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { fxAt, fxPlan, hitsOf, beatTimes, newFx, effectsOf, colourMatrix } from "../web/js/fx.js";
import { makeClip, render, grayFrame, rgbFrame, box, meanOf } from "./render.ts";

/** An ffmpeg expression in t, evaluated here (the functions it uses, as ffmpeg means them). */
function evaluate(expr: string, t: number) {
  const f = new Function("t", "between", "pow", "max", "mod", "sin", `return ${expr.replace(/\\,/g, ",")};`);
  return f(t, (x: number, a: number, b: number) => +(x >= a && x <= b), Math.pow, Math.max, (a: number, b: number) => a % b, Math.sin);
}

const beats = (bpm: number, seconds: number, offset = 0) => ({ bpm, offset, times: Array.from({ length: Math.floor((seconds * bpm) / 60) + 1 }, (_, i) => Math.round((i * 60000) / bpm) / 1000), down: 0, source: "test" });

const body = (items: any[], extra: any = {}) => ({ aspect: "9:16", beats: beats(120, 20), tracks: [{ id: "fx", kind: "fx", items }], ...extra });

test("an effect fires on the beats inside its range, every so many of them", () => {
  const b = body([]);
  assert.deepEqual(hitsOf({ kind: "zoom", start: 1, length: 2, every: 1 }, b), [1, 1.5, 2, 2.5]);
  assert.deepEqual(hitsOf({ kind: "zoom", start: 0, length: 4, every: 4 }, b), [0, 2]);
  assert.deepEqual(hitsOf({ kind: "zoom", start: 0, length: 1, every: 0.5 }, b), [0, 0.25, 0.5, 0.75]);
  assert.deepEqual(hitsOf({ kind: "flash", start: 3.2, length: 1, every: 0 }, b), [3.2]);
  // the first beat of a bar is a beat the grid says: down moves where "every bar" lands
  assert.deepEqual(hitsOf({ kind: "zoom", start: 0, length: 4, every: 4 }, { ...b, beats: { ...b.beats, down: 1 } }), [0.5, 2.5]);
  // moved by the offset
  assert.deepEqual(hitsOf({ kind: "zoom", start: 0, length: 1.4, every: 1 }, { ...b, beats: { ...b.beats, offset: 0.1 } }), [0.1, 0.6, 1.1]);
});

test("a tempo with no beats is a grid; no tempo at all is one hit, at the start", () => {
  assert.deepEqual(hitsOf({ kind: "zoom", start: 0, length: 1.2, every: 1 }, { beats: { bpm: 120, times: [] } }), [0, 0.5, 1]);
  assert.deepEqual(hitsOf({ kind: "zoom", start: 2, length: 4, every: 1 }, {}), [2]);
});

test("switched off, an effect does nothing; so does a muted track", () => {
  const item = newFx("zoom", 0, 4);
  assert.ok(fxAt(0.01, body([item])).zoom > 1);
  assert.equal(fxAt(0.01, body([{ ...item, on: false }])).zoom, 1);
  const b = body([item]);
  (b.tracks[0] as any).mute = true;
  assert.equal(fxAt(0.01, b).zoom, 1);
});

test("the render's expressions say what fxAt says", () => {
  const items = [
    { id: "a", kind: "zoom", every: 1, intensity: 1, dur: 0.3, start: 0, length: 8 },
    { id: "b", kind: "shake", every: 2, intensity: 0.8, dur: 0.4, start: 2, length: 3 },
    { id: "c", kind: "hue", every: 4, intensity: 1.2, dur: 0.5, start: 1, length: 12 },
    { id: "d", kind: "flash", every: 2, intensity: 0.7, dur: 0.2, start: 0, length: 6 },
    { id: "e", kind: "shake", every: 0.5, intensity: 1, dur: 0.15, start: 9, length: 1.2 },
  ];
  // an irregular grid too (a beat nudged), so the term-by-term form is held to it as well
  const b: any = body(items);
  b.beats.times[5] += 0.05;
  const plan = fxPlan(b);
  const list = effectsOf(b);
  let worst = 0;
  for (let t = 0; t < 12; t += 0.0137) {
    const want = fxAt(t, b, list);
    const got = {
      zoom: plan.zoom ? evaluate(plan.zoom, t) : 1,
      dx: plan.dx ? evaluate(plan.dx, t) : 0,
      dy: plan.dy ? evaluate(plan.dy, t) : 0,
      rot: plan.rot ? evaluate(plan.rot, t) : 0,
      hue: plan.hue ? evaluate(plan.hue, t) : 0,
      sat: plan.sat ? evaluate(plan.sat, t) : 1,
      bright: plan.bright ? evaluate(plan.bright, t) : 0,
      flash: Math.min(1, plan.flashes.reduce((s: number, f: any) => s + (t >= f.at && t <= f.at + f.dur ? f.amount * (1 - (t - f.at) / f.dur) : 0), 0)),
    };
    for (const k of Object.keys(got) as (keyof typeof got)[]) worst = Math.max(worst, Math.abs(got[k] - want[k]) / Math.max(1, Math.abs(want[k])));
  }
  assert.ok(worst < 2e-4, `the expressions drift from fxAt by ${worst}`);
});

test("an effects-free body plans no effect", () => {
  const plan = fxPlan(body([{ id: "x", kind: "zoom", on: false, start: 0, length: 4 }]));
  assert.equal(plan.zoom, null);
  assert.deepEqual(plan.flashes, []);
});

// ---- the film itself

const W = 360;
const H = 640;
const S = { still: false, hasAudio: false, duration: 12 };

test("a rendered film shows the swell, the shake, the flash and the colour fxAt says", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "fx-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await makeClip(join(dir, "square.mp4"), W, H, 12, "square", "0x808080");
  
  const b: any = {
    aspect: "9:16",
    beats: beats(120, 12),
    tracks: [
      { id: "fx", kind: "fx", items: [
        { id: "z", kind: "zoom", every: 1, intensity: 1, dur: 0.3, start: 0, length: 3 },
        { id: "s", kind: "shake", every: 2, intensity: 1, dur: 0.4, start: 3, length: 3 },
        { id: "f", kind: "flash", every: 2, intensity: 0.8, dur: 0.24, start: 6, length: 2 },
      ] },
      { id: "v1", kind: "video", main: true, items: [{ id: "c1", src: { kind: "video", id: "square" } }] },
    ],
  };
  const out = await render(b, { c1: { path: join(dir, "square.mp4"), ...S } }, join(dir, "r"), { size: { width: W, height: H } });
  const list = effectsOf(b);
  const base = box(await grayFrame(out.film, 70 / 24, W, H), W, H);
  assert.ok(base && Math.abs(base.w - W * 0.2) < 4, "the square is where it should be before anything");

  // the swell: the square's width against its width at rest, at the instants of a hit
  for (const at of [1 / 24, 2 / 24, 4 / 24, 12 / 24, 25 / 24, 28 / 24]) {
    const want = fxAt(at, b, list).zoom;
    const seen = box(await grayFrame(out.film, at, W, H), W, H)!;
    assert.ok(Math.abs(seen.w / base.w - want) < 0.012, `zoom at ${at}: saw ${(seen.w / base.w).toFixed(3)}, fxAt ${want.toFixed(3)}`);
  }
  // the shake: the square's middle moves by dx and dy (as a part of the frame); a rotation leaves the middle where it is
  for (const at of [72 / 24, 74 / 24, 76 / 24, 80 / 24, 121 / 24, 124 / 24]) {
    const f = fxAt(at, b, list);
    const seen = box(await grayFrame(out.film, at, W, H), W, H)!;
    assert.ok(Math.abs(seen.cx - (W / 2 + f.dx * W)) < 2.5 && Math.abs(seen.cy - (H / 2 + f.dy * H)) < 2.5, `shake at ${at}: saw ${seen.cx.toFixed(1)},${seen.cy.toFixed(1)}, fxAt ${(W / 2 + f.dx * W).toFixed(1)},${(H / 2 + f.dy * H).toFixed(1)}`);
  }
  // the flash: the grey lifts toward white by the flash's strength
  const corner = (g: Uint8Array) => g[40 * W + 40];
  const rest = corner(await grayFrame(out.film, 180 / 24, W, H));
  for (const at of [144 / 24, 145 / 24, 146 / 24, 148 / 24, 192 / 24, 194 / 24]) {
    const f = fxAt(at, b, list).flash;
    const seen = corner(await grayFrame(out.film, at, W, H));
    const want = rest * (1 - f) + 255 * f;
    assert.ok(Math.abs(seen - want) < 6, `flash at ${at}: saw ${seen}, wanted ${want.toFixed(0)} (flash ${f.toFixed(2)})`);
  }
});

test("a rendered film changes colour as the preview's matrix says", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "fx-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await makeClip(join(dir, "red.mp4"), 64, 64, 6, "solid", "0xc83020");
  const b: any = {
    aspect: "1:1",
    beats: beats(120, 6),
    tracks: [
      { id: "fx", kind: "fx", items: [{ id: "h", kind: "hue", every: 2, intensity: 1, dur: 0.6, start: 1, length: 3 }] },
      { id: "v1", kind: "video", main: true, items: [{ id: "c1", src: { kind: "video", id: "red" } }] },
    ],
  };
  const out = await render(b, { c1: { path: join(dir, "red.mp4"), still: false, hasAudio: false, duration: 6 } }, join(dir, "r"), { size: { width: 64, height: 64 } });
  const centre = (px: Uint8Array) => [...px.slice((32 * 64 + 32) * 3, (32 * 64 + 32) * 3 + 3)];
  // what the preview does to a colour: the matrix its SVG filter is given
  const matrixed = (rgb: number[], f: { hue: number; sat: number; bright: number }) => {
    const m = colourMatrix(f);
    return [0, 1, 2].map((r) => Math.max(0, Math.min(255, m[r * 5] * rgb[0] + m[r * 5 + 1] * rgb[1] + m[r * 5 + 2] * rgb[2] + m[r * 5 + 4] * 255)));
  };
  const rest = centre(await rgbFrame(out.film, 6 / 24));
  const list = effectsOf(b);
  for (const at of [24 / 24, 26 / 24, 30 / 24, 34 / 24]) {
    const f = fxAt(at, b, list);
    const want = matrixed(rest, f);
    const seen = centre(await rgbFrame(out.film, at));
    const worst = Math.max(...want.map((v, i) => Math.abs(v - seen[i])));
    assert.ok(worst < 10, `colour at ${at}: saw ${seen}, the preview's matrix gives ${want.map(Math.round)} (hue ${f.hue.toFixed(0)}, sat ${f.sat.toFixed(2)})`);
  }
});
