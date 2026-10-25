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

test("the light a layer casts: kept from 0 to 1 and how far it reaches from 0.3 to 4, for a picture of the library only, none when it is not said", () => {
  const l = e.cleanLayer({ id: "l-a", el: "flame", light: 0.456, reach: 2.5 });
  assert.deepEqual([l.light, l.reach], [0.456, 2.5]);
  const over = e.cleanLayer({ id: "l-b", el: "flame", light: 9, reach: 99 });
  assert.deepEqual([over.light, over.reach], [1, 4], "no more light than 1, no more reach than 4");
  const under = e.cleanLayer({ id: "l-c", el: "flame", light: -3, reach: 0 });
  assert.deepEqual([under.light, under.reach], [0, 0.3], "no less light than 0, no less reach than 0.3");
  const odd = e.cleanLayer({ id: "l-d", el: "flame", light: "lots", reach: NaN });
  assert.deepEqual([odd.light, odd.reach], [0, 1.6], "what is not a number is not said");
  // (a layer kept before there was any light has none, and its keys are what they were with its light and reach added after them)
  const old = e.cleanLayer({ id: "l-e", el: "flame", x: 0.2 });
  assert.deepEqual([old.light, old.reach], [0, 1.6]);
  const keys = Object.keys(old);
  assert.deepEqual(keys.slice(-4), ["from", "to", "light", "reach"], "a baked layer's signature is what it was once light and reach are left out");
  // (particles and an AI layer cast none)
  for (const el of ["rain", "embers", "ai"]) {
    const p = e.cleanLayer({ id: "l-f", el, light: 0.9, reach: 3 });
    assert.ok(!("light" in p) && !("reach" in p), `${el} has no light`);
  }
});

test("each element that shines starts with its own light as part of its look, the others with none", () => {
  const lights: Record<string, number> = {
    flame: 0.6, "fire-wall": 0.6, "muzzle-flash": 0.6, lightning: 0.6, fireball: 0.8,
    "sparks-burst": 0.4, "electric-arc": 0.4, "neon-ring": 0.4, "rune-circle": 0.4, hologram: 0.4, shockwave: 0.4,
    "energy-orb": 0.7, "spark-portal": 0.5, starburst: 0.5, "magic-swirl": 0.3, "lens-flare": 0.2, "embers-cloud": 0.2, "god-rays": 0.1,
    smoke: 0, "light-leak": 0, bokeh: 0,
  };
  const images = e.LIBRARY.filter((x: any) => x.kind === "image");
  assert.deepEqual(images.map((x: any) => x.id).sort(), Object.keys(lights).sort(), "every picture is told its light, and only pictures");
  for (const [id, light] of Object.entries(lights)) {
    assert.equal((e.elementOf(id) as any).light, light, `${id}'s light in the library`);
    const layer = e.newLayer(id) as any;
    assert.equal(layer.light, light, `a new ${id} casts ${light}`);
    assert.equal(layer.reach, 1.6, `and reaches 1.6 boxes`);
  }
  for (const id of ["rain", "snow", "embers", "dust", "sparkles", "ai"]) assert.ok(!("light" in (e.newLayer(id) as any)), `a new ${id} casts none`);
  // (a look's layers are new layers: the portal of Sorcery shines)
  assert.equal(e.lookLayers("sorcery")[0].light, 0.5);
});

test("the shot's finish: a bloom and a vignette from 0 to 1, none to begin with, cleaned as it is read", () => {
  assert.deepEqual(e.cleanFinish(undefined), { bloom: 0, vignette: 0 });
  assert.deepEqual(e.cleanFinish({ bloom: 0.45, vignette: 0.3, grain: 1 }), { bloom: 0.45, vignette: 0.3 }, "nothing else is kept");
  assert.deepEqual(e.cleanFinish({ bloom: 4, vignette: -1 }), { bloom: 1, vignette: 0 });
  assert.deepEqual(e.cleanFinish({ bloom: "x", vignette: null }), { bloom: 0, vignette: 0 });
  assert.deepEqual(e.cleanFinish({ bloom: 0.2 }), { bloom: 0.2, vignette: 0 }, "one of them said");
  assert.deepEqual(normaliseBody({}).set.fx.finish, { bloom: 0, vignette: 0 }, "a shot starts with no finish");
  assert.deepEqual(normaliseBody({ set: { fx: { finish: { bloom: 0.5, vignette: 7 } } } }).set.fx.finish, { bloom: 0.5, vignette: 1 }, "a shot keeps its finish cleaned");
  assert.deepEqual(normaliseBody({ set: { fx: { finish: "dark" } } }).set.fx.finish, { bloom: 0, vignette: 0 }, "and not what is not one");
  assert.deepEqual(normaliseBody({ set: { fx: { layers: [{ id: "l-1", el: "flame", light: 0.5 }] } } }).set.fx.layers[0].light, 0.5, "a shot keeps its layers' light");
});

test("a shot keeps its layers cleaned and one of them selected", () => {
  const b = normaliseBody({ set: { fx: { layers: [{ id: "l-1", el: "flame" }, { el: "unknown" }, { id: "l-2", el: "rain" }], sel: "l-9" } } });
  assert.deepEqual(b.set.fx.layers.map((l: any) => l.id), ["l-1", "l-2"]);
  assert.equal(b.set.fx.sel, null, "a selection that is gone holds nothing: the shot opens clean");
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

test("a look is a few layers of the library that go together, each a layer like any other, with what differs from its element", () => {
  for (const k of e.LOOKS) {
    const list = e.lookLayers(k.id);
    assert.equal(list.length, k.layers.length, `${k.id}: every layer is made`);
    assert.equal(new Set(list.map((l: any) => l.id)).size, list.length, `${k.id}: an id each`);
  }
  const inferno = e.lookLayers("inferno");
  assert.deepEqual(inferno.map((l: any) => l.el), ["smoke", "fire-wall", "light-leak", "embers"]);
  assert.equal(inferno[2].tint, "#ff7a1a");
  assert.equal(inferno[1].y, 0.86, "a place of its own");
  assert.deepEqual(e.lookLayers("nothing"), []);
});
