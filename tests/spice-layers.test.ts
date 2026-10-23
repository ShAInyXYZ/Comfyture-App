// Spice's FX layers, with no browser: the library of effects (each element's picture on disk, its look), a layer as it is kept (every
// value inside its range), how a layer moves on a clip and stays still on a picture, and where the particles are at a time.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import * as e from "../web/js/spice-elements.js";
import { motionAt, particlesOf, timeOf, rand } from "../web/js/spice-layers.js";
import { normaliseBody } from "../web/js/spice-model.js";

const web = join(import.meta.dirname, "..", "web");

test("the library: every element named once, in a group, with a blend and a motion it knows; every picture and its thumbnail on disk", () => {
  const ids = new Set();
  const groups = new Set(e.GROUPS.map(([id]) => id));
  for (const el of e.LIBRARY) {
    assert.ok(!ids.has(el.id), `${el.id} once`);
    ids.add(el.id);
    assert.ok(el.kind === "ai" || groups.has(el.group), `${el.id} is in a group`);
    assert.ok(e.BLENDS.some((b) => b.id === el.blend), `${el.id}'s blend`);
    assert.ok(e.MOTIONS.some(([m]) => m === el.motion), `${el.id}'s motion`);
    if (el.kind === "image") {
      for (const f of [el.src, el.thumb]) assert.ok(existsSync(join(web, f)) && statSync(join(web, f)).size > 400, `${f} is there`);
    }
  }
  assert.ok(e.LIBRARY.filter((x) => x.kind === "image").length >= 20, "twenty elements shot on black");
  assert.deepEqual(e.LIBRARY.filter((x) => x.kind === "particles").map((x) => x.id), ["rain", "snow", "embers", "dust", "sparkles"]);
  for (const [g] of e.GROUPS) assert.equal(e.tilesOf(g).at(-1)?.kind, "ai", `${g} ends with the AI tile`);
  assert.equal(e.tilesOf("all").length, e.LIBRARY.length);
  assert.ok(e.tilesOf("fire").every((x) => x.group === "fire" || x.kind === "ai"));
});

test("a new layer has its element's look, where it was dropped, and an id of its own", () => {
  const a = e.newLayer("spark-portal", { x: 0.7, y: 0.3 });
  assert.deepEqual([a.el, a.x, a.y, a.scale, a.blend, a.motion, a.behind], ["spark-portal", 0.7, 0.3, 0.5, "screen", "spin", true]);
  const wall = e.newLayer("fire-wall");
  assert.deepEqual([wall.x, wall.y, wall.scale], [0.5, 0.72, 1], "an element that covers the frame keeps its own place");
  const rain = e.newLayer("rain");
  assert.deepEqual([rain.amount, rain.size, rain.rot, rain.colour], [0.55, 0.5, 8, "#cfdcff"], "particles have their amount, size, angle and colour");
  assert.notEqual(e.newLayer("flame").id, e.newLayer("flame").id);
  assert.equal(e.newLayer("nothing"), null);
});

test("a layer as it is kept: every value inside its range, words from lists, and nothing that is not a layer", () => {
  const l = e.cleanLayer({ id: "l-a", el: "flame", x: 9, y: -9, scale: 99, rot: 999, opacity: 7, glow: -1, blend: "melt", motion: "dance", tint: "red", speed: 0, from: 1010.4, to: "x", extra: "no" });
  assert.deepEqual([l.x, l.y, l.scale, l.rot, l.opacity, l.glow, l.blend, l.motion, l.tint, l.speed, l.from, l.to], [1.5, -0.5, 3, 360, 1, 0, "screen", "flicker", "", 0.1, 1010, null]);
  assert.equal((l as any).extra, undefined, "nothing else is kept");
  assert.equal(e.cleanLayer({ el: "nope" }), null);
  assert.equal(e.cleanLayer(null), null);
  const ai = e.cleanLayer({ el: "ai", preset: "../x", words: "a portal", media: { url: "/media/videos/a.mp4", file: "a.mp4" } });
  assert.deepEqual([ai.preset, ai.words, ai.media.file], ["", "a portal", "a.mp4"]);
  assert.equal(e.cleanLayer({ el: "ai", media: { file: "a.mp4" } }).media, null, "a clip with no address is no clip");
  assert.equal(e.cleanLayer({ el: "snow", colour: "#ABCDEF" }).colour, "#abcdef");
  assert.equal(e.layerName({ el: "ai", note: "Portal · LTX" }), "Portal · LTX");
  assert.equal(e.layerName({ el: "embers" }), "Embers");
});

test("a shot keeps its layers cleaned and one of them selected", () => {
  const b = normaliseBody({ set: { fx: { layers: [{ id: "l-1", el: "flame" }, { el: "unknown" }, { id: "l-2", el: "rain" }], sel: "l-9" } } });
  assert.deepEqual(b.set.fx.layers.map((l: any) => l.id), ["l-1", "l-2"]);
  assert.equal(b.set.fx.sel, "l-2", "a selection that is gone falls on the top layer");
  assert.deepEqual(normaliseBody({}).set.fx.layers, []);
});

test("a layer plays on its own frames; a picture is still; motion is the same every time for the same frame", () => {
  const l = { ...e.newLayer("flame"), id: "l-x", from: 1010, to: 1033 };
  assert.equal(timeOf(l, 1009, 24), null);
  assert.equal(timeOf(l, 1010, 24), 0);
  assert.equal(timeOf(l, 1034, 24), null);
  assert.equal(timeOf({ ...l, from: null, to: null }, 1200, 24), (1200 - 1001) / 24, "with no frames it plays on the whole shot");
  assert.deepEqual(motionAt(l, 0.5, { still: true }), { dx: 0, dy: 0, k: 1, rot: 0, a: 1 }, "a picture does not move");
  assert.deepEqual(motionAt(l, 0.5), motionAt(l, 0.5));
  const grow = { ...l, motion: "grow" };
  assert.ok(motionAt(grow, 0).k < 0.5 && Math.abs(motionAt(grow, 2).k - 1) < 1e-9, "grow starts small and ends at its size");
  assert.ok(motionAt({ ...l, motion: "spin", speed: 2 }, 1).rot === 90, "spin turns 45 degrees a second at speed 1");
  assert.ok(motionAt({ ...l, motion: "rise" }, 2).dy < 0, "rise goes up");
  const span = 1;
  assert.equal(motionAt({ ...l, motion: "still" }, 0, { span }).a, 0, "it fades in from nothing");
  assert.equal(motionAt({ ...l, motion: "still" }, 0.5, { span }).a, 1);
  for (let t = 0; t < 3; t += 0.1) {
    const a = motionAt({ ...l, motion: "strobe" }, t).a;
    assert.ok(a >= 0 && a <= 1);
  }
});

test("particles: as many as their amount says, in their box, where they were for the same time, falling as time goes", () => {
  const rain = { ...e.newLayer("rain"), id: "l-rain" };
  const a = particlesOf(rain, 1920, 1080, 0.4);
  assert.deepEqual(a, particlesOf(rain, 1920, 1080, 0.4), "the same frame looks the same");
  assert.equal(particlesOf({ ...rain, amount: 0 }, 1920, 1080, 0).length, 0);
  assert.ok(particlesOf({ ...rain, amount: 1 }, 1920, 1080, 0).length > a.length);
  const small = { ...e.newLayer("snow"), id: "l-snow", x: 0.25, y: 0.25, scale: 0.5 };
  for (const s of particlesOf(small, 1000, 1000, 1.3)) assert.ok(s.x >= 0 && s.x <= 500 && s.y >= 0 && s.y <= 500, "inside its box");
  const snow0 = particlesOf({ ...small, rot: 0 }, 1000, 1000, 0);
  const snow1 = particlesOf({ ...small, rot: 0 }, 1000, 1000, 0.1);
  const fell = snow0.filter((s, i) => snow1[i].y > s.y).length;
  assert.ok(fell > snow0.length * 0.9, "snow falls");
  const embers = { ...e.newLayer("embers"), id: "l-e" };
  const e0 = particlesOf(embers, 1000, 1000, 0);
  const e1 = particlesOf(embers, 1000, 1000, 0.1);
  assert.ok(e0.filter((s, i) => e1[i].y < s.y).length > e0.length * 0.9, "embers rise");
  assert.ok([0, 1, 2, 3].every((i) => rand(7, i) >= 0 && rand(7, i) < 1) && rand(7, 1) === rand(7, 1));
});
