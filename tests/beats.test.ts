// Beats: the finder, held against made-up music whose beats are known; the readers of typed beats.

import { test } from "node:test";
import assert from "node:assert/strict";
import { analyseBeats, parseBeats, gridBeats, gridTimes, beatsFromTimes, halveBeats, doubleBeats, nearestBeat, findDrop, findLoud } from "../web/js/beats.js";
import { song } from "./synth.ts";

/** How far each found beat is from the real one nearest it, and which real beat the first bar line is. */
function judge(found: { times: number[]; down: number }, real: number[]) {
  const errs = found.times.map((t) => {
    const k = nearestBeat(real, t);
    return { k, err: t - real[k] };
  });
  const inside = errs.filter((e) => found.times[errs.indexOf(e)] <= real.at(-1)! + 0.1);
  const mean = inside.reduce((s, e) => s + Math.abs(e.err), 0) / inside.length;
  const worst = Math.max(...inside.map((e) => Math.abs(e.err)));
  return { mean, worst, down: errs[found.down].k % 4 };
}

test("the beats of made-up music are found, at tempos from 75 to 140", () => {
  for (const [bpm, offset, rate] of [[75, 0.1, 22050], [90, 0.05, 22050], [100, 0.37, 44100], [110, 0.15, 22050], [120, 0.13, 22050], [128, 0, 22050], [140, 0.2, 48000]] as const) {
    const s = song({ bpm, offset, rate, seconds: 24 });
    const found = analyseBeats(s.samples, s.rate);
    assert.ok(Math.abs(found.bpm - bpm) < bpm * 0.004, `${bpm} bpm: found ${found.bpm}`);
    const j = judge(found, s.beats);
    assert.ok(j.mean < 0.012 && j.worst < 0.025, `${bpm} bpm: beats ${(j.mean * 1000).toFixed(1)} ms off on average, ${(j.worst * 1000).toFixed(0)} at worst`);
    assert.equal(j.down, 0, `${bpm} bpm: the bar line is on the first beat of the bar`);
  }
});

test("swing does not throw it", () => {
  const s = song({ bpm: 124, offset: 0.27, seconds: 24, swing: 0.08 });
  const found = analyseBeats(s.samples, s.rate);
  assert.ok(Math.abs(found.bpm - 124) < 0.6);
  assert.ok(judge(found, s.beats).worst < 0.025);
});

test("a tempo already known settles a tempo heard an octave out", () => {
  const s = song({ bpm: 150, offset: 0.25, seconds: 24 });
  const found = analyseBeats(s.samples, s.rate, { bpm: 150 });
  assert.ok(Math.abs(found.bpm - 150) < 0.6, `found ${found.bpm}`);
  assert.ok(judge(found, s.beats).worst < 0.025);
});

test("music with no beat in it says so", () => {
  const quiet = new Float32Array(22050 * 10);
  const found = analyseBeats(quiet, 22050);
  assert.ok(found.confidence < 0.5);
});

test("beats typed in: a tempo, a tempo and an offset, a list, json", () => {
  assert.deepEqual(parseBeats("128"), { bpm: 128, offset: 0 });
  assert.deepEqual(parseBeats("128 bpm"), { bpm: 128, offset: 0 });
  assert.deepEqual(parseBeats("128 @ 0.35"), { bpm: 128, offset: 0.35 });
  assert.deepEqual(parseBeats("120 offset 250ms"), { bpm: 120, offset: 0.25 });
  assert.deepEqual(parseBeats("0.5 1.0, 1.5\n2"), { times: [0.5, 1, 1.5, 2] });
  assert.deepEqual(parseBeats("250ms 750ms 0:01.25"), { times: [0.25, 0.75, 1.25] });
  assert.deepEqual(parseBeats('{"bpm": 90, "offset": 0.1}'), { bpm: 90, offset: 0.1 });
  assert.deepEqual(parseBeats("[0.4, 0.9]"), { times: [0.4, 0.9] });
  assert.equal(parseBeats(""), null);
  assert.equal(parseBeats("hello"), null);
});

test("a grid, a list of times, and the octave fixes", () => {
  assert.deepEqual(gridTimes(120, 0.1, 1.5).slice(0, 4), [0.1, 0.6, 1.1, 1.6]);
  const g = gridBeats(120, 0, 8);
  assert.equal(g.times.length, 18); // one beat past the end, so the last bar is covered
  const l = beatsFromTimes([0, 0.5, 1, 1.5, 2]);
  assert.equal(l.bpm, 120);
  const half = halveBeats({ ...g, down: 0 });
  assert.equal(half.bpm, 60);
  assert.equal(half.times[1], 1);
  const twice = doubleBeats({ ...half });
  assert.equal(twice.bpm, 120);
  assert.equal(twice.times[1], 0.5);
  assert.equal(nearestBeat([0, 1, 2, 3], 1.4), 1);
  assert.equal(nearestBeat([0, 1, 2, 3], 1.6), 2);
  assert.equal(nearestBeat([], 1), -1);
});

/** A sound of `parts`: [seconds, loudness] each, as a noise burst train (so the loudness is what it is, whatever the tempo). */
function levels(parts: [number, number][], rate = 8000) {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
  const out: number[] = [];
  for (const [seconds, level] of parts) for (let i = 0; i < seconds * rate; i++) out.push(rnd() * level);
  return new Float32Array(out);
}

test("the drop is where the loudness lifts, and a sound that stays level has none", () => {
  const rate = 8000;
  const x = levels([[10, 0.05], [12, 0.6]], rate);
  const drop = findDrop(x, rate);
  assert.ok(drop !== null && Math.abs(drop - 10) <= 0.75, `the drop is at ${drop} s (10 s made)`);
  assert.equal(findDrop(levels([[24, 0.3]], rate), rate), null, "even music has no drop");
  assert.equal(findDrop(levels([[3, 0.1], [3, 0.8]], rate), rate), null, "a few seconds are too short to have one");
});

test("the loudest stretch is where the loudness is greatest over the length asked", () => {
  const rate = 8000;
  // quiet, loud for 6 s, quiet, louder for 6 s (16 to 22 s): the 8 s asked for hold all of the louder part, so begin between 14 and 16 s
  const x = levels([[4, 0.05], [6, 0.4], [6, 0.05], [6, 0.7], [8, 0.05]], rate);
  const at = findLoud(x, rate, 8)!;
  assert.ok(at >= 14 && at <= 16.1, `the loudest 8 s begin at ${at} s (the loudest part runs from 16 to 22 s)`);
  assert.equal(findLoud(levels([[5, 0.4]], rate), rate, 15), null, "a sound shorter than the stretch has none");
});
