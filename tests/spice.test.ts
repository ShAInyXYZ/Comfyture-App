// Spice's rules, with no browser and no network: the frames a shot is numbered in, the passes the six departments make of it and what
// the viewer wipes between, what each pass cost, how an effect's words are put together, how Roto's clicks reach the segmenter, and that
// what the pages name (the presets, the sprites, the pet's files, the templates) is there.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PAPRIKA, WORKSPACES, DEPARTMENTS, SAY, PLACEHOLDER } from "../web/js/spice-harness.js";
import * as m from "../web/js/spice-model.js";

const root = join(import.meta.dirname, "..");
const media = (url: string, seconds = 5, extra = {}) => ({ kind: "video", url, file: url.replace(/^\//, ""), width: 1920, height: 1080, seconds, ...extra });
/** A shot with its footage (5 s at 24 fps: frames 1001 to 1120) and what is given of the other passes. */
const shot = (passes: Record<string, any> = {}) => {
  const b = m.normaliseBody({});
  b.passes.plate = { media: media("/plate.mp4"), fps: 24, eye: true, from: 1001, to: 1120 };
  Object.assign(b.passes, passes);
  return b;
};

test("Paprika and the six departments: the order a shot goes through, one name and one sprite each, a line and a placeholder for every department", () => {
  assert.deepEqual(DEPARTMENTS, ["plate", "roto", "paint", "light", "fx", "comp"]);
  assert.deepEqual(m.STACK, ["comp", "fx", "light", "paint", "roto", "plate"], "the stack is drawn from the top: the comp on top, the plate at the foot");
  assert.deepEqual(WORKSPACES.map((w) => w.id), DEPARTMENTS);
  assert.deepEqual(Object.keys(SAY), DEPARTMENTS);
  assert.deepEqual(Object.keys(PLACEHOLDER), DEPARTMENTS);
  const sprite = readFileSync(join(root, "web/icons/icons.svg"), "utf8");
  for (const w of WORKSPACES) assert.ok(sprite.includes(`id="${w.icon}"`), `${w.name}'s icon ${w.icon} is in the sprite`);
  assert.ok(sprite.includes('id="product-spice"') && /id="product-spice" viewBox="140 140 744 744"/.test(sprite), "Spice's mark is in the sprite, drawn like the other products'");
  assert.ok(existsSync(join(root, "web", PAPRIKA.face)) && existsSync(join(root, "web", PAPRIKA.portrait)), "her face and her portrait are on disk");
  assert.ok(existsSync(join(root, "docs/brand/cast/paprika-sheet.png")), "her sheet is with the cast's");
  assert.ok(existsSync(join(root, "web/brand/products/covers/spice.webp")) && existsSync(join(root, "web/brand/products/spice.svg")), "her product has its cover and its mark");
});

test("a shot is numbered as a slate numbers it: its first frame is 1001", () => {
  assert.equal(m.FIRST, 1001);
  assert.equal(m.frameAt(0, 24), 1001);
  assert.equal(m.frameAt(2, 24), 1049);
  assert.equal(m.secondsAt(1049, 24), 2);
  assert.equal(m.secondsAt(900, 24), 0, "before the first frame is the first");
  assert.equal(m.framesIn(5, 24), 120);
  assert.equal(m.lastFrame(shot().passes.plate), 1120);
  assert.equal(m.lastFrame({ media: { kind: "image" } }), 1001, "a picture is one frame");
  assert.equal(m.lastFrame(null), 1001);
  assert.equal(m.rangeText({ in: 1001, out: 1120 }), "1001 – 1120");
});

test("the range a shot is worked on: the whole footage, or the part chosen, kept inside the footage", () => {
  const b = shot();
  assert.deepEqual(m.rangeOf(b), { in: 1001, out: 1120 });
  b.range = { in: 1030, out: 1090 };
  assert.deepEqual(m.rangeOf(b), { in: 1030, out: 1090 });
  b.range = { in: 900, out: 5000 };
  assert.deepEqual(m.rangeOf(b), { in: 1001, out: 1120 });
  b.range = { in: 1100, out: 1050 };
  assert.deepEqual(m.rangeOf(b), { in: 1100, out: 1100 }, "an out before the in is the in");
});

test("a shot kept by an earlier Spice is filled in, and never thrown at", () => {
  const b = m.normaliseBody({ passes: { plate: { media: media("/a.mp4") } }, set: { fx: { element: "fire", place: { x: 0.1 } } }, log: "junk" });
  assert.equal(b.set.fx.element, "fire");
  assert.deepEqual(b.set.fx.place, { x: 0.1, y: 0.4, size: 0.6 });
  assert.equal(b.set.fx.depth, "behind", "what the old one did not know has its default");
  assert.deepEqual(b.log, []);
  assert.deepEqual(Object.keys(b.passes), ["plate", "roto", "paint", "light", "fx", "comp"]);
  for (const junk of [null, undefined, 5, "x", []]) assert.deepEqual(Object.keys(m.normaliseBody(junk as any).set), ["roto", "paint", "light", "fx", "comp"]);
});

test("a department's lamp: green when its pass is there, amber while it works, hollow when it is empty; the passes done are counted", () => {
  const b = shot({ paint: { media: media("/paint.mp4") } });
  assert.equal(m.lampOf(b, "plate"), "done");
  assert.equal(m.lampOf(b, "paint"), "done");
  assert.equal(m.lampOf(b, "light"), "empty");
  assert.equal(m.lampOf(b, "light", true), "busy");
  assert.equal(m.passesDone(b), 2);
  b.depth = { media: media("/depth.mp4") };
  assert.equal(m.passesDone(b), 2, "the depth is an analysis of the plate, not a department");
  assert.equal(m.visible({ media: media("/x.mp4"), eye: false }), false, "a pass with its eye shut is not shown");
  assert.equal(m.visible({ media: media("/x.mp4") }), true);
  assert.equal(m.visible(null), false);
});

test("the viewer wipes the footage against what the open department has made of it", () => {
  const b = shot({ roto: { media: media("/matte.mp4") }, paint: { media: media("/paint.mp4") }, light: { media: media("/light.mp4") }, fx: { media: media("/fx.mp4"), from: 1030, to: 1120 } });
  const pair = (d: string) => m.pairOf(b, d);
  assert.equal(pair("plate").before!.media.url, "/plate.mp4");
  assert.equal(pair("plate").after!.dept, "plate", "the plate against itself until its depth is read");
  b.depth = { media: media("/depth.mp4") };
  assert.equal(pair("plate").after!.dept, "depth");
  assert.equal(pair("roto").after!.media.url, "/matte.mp4", "Roto: the footage against its matte");
  assert.equal(pair("paint").after!.media.url, "/paint.mp4");
  assert.equal(pair("light").after!.media.url, "/light.mp4");
  assert.equal(pair("fx").after!.media.url, "/fx.mp4");
  assert.equal(pair("comp").after!.media.url, "/fx.mp4", "the comp: the top of the stack, until the comp has a pass of its own");
  assert.equal(pair("paint").before!.media.url, "/plate.mp4", "the left is always the footage");
  b.passes.light.eye = false;
  assert.equal(pair("light").after!.dept, "paint", "a pass whose eye is shut lets the one below show");
  b.passes.comp = { media: media("/comp.mp4") };
  assert.equal(pair("comp").after!.media.url, "/comp.mp4");
  assert.equal(m.topOf(b)!.dept, "comp");
  assert.equal(m.pairOf(shot(), "roto").after, null, "no matte yet: nothing on the right");
});

test("an effect is a layer on the frames it worked on, and the footage on the others", () => {
  const b = shot({ light: { media: media("/light.mp4"), from: 1001, to: 1120 }, fx: { media: media("/fx.mp4"), from: 1030, to: 1100 } });
  assert.equal(m.layerAt(b, "fx", 1010)!.dept, "light", "before the effect starts the relit footage shows");
  assert.equal(m.layerAt(b, "fx", 1030)!.dept, "fx");
  assert.equal(m.layerAt(b, "fx", 1030)!.from, 1030, "and it is read from its own first frame");
  assert.equal(m.layerAt(b, "fx", 1101)!.dept, "light", "after it ends, too");
  assert.equal(m.layerAt(b, "light", 1050)!.dept, "light", "a department shows only what is made up to it");
  assert.equal(m.layerAt(shot(), "fx", 1050), null, "with nothing made the footage shows");
  const bars = m.barsOf(b);
  assert.deepEqual(bars.plate, [1001, 1120], "the footage's bar spans it");
  assert.deepEqual(bars.fx, [1030, 1100]);
  assert.equal(bars.roto, undefined, "a department with nothing made has no bar");
});

test("what was spent is kept with its day, and the day's credits are added up over the shots", () => {
  const noon = Date.parse("2026-10-23T12:00:00");
  const b = shot();
  m.logCredits(b, { dept: "fx", label: "Portal", credits: 24 }, noon);
  m.logCredits(b, { dept: "paint", label: "Sign", credits: 8.46 }, noon - 3600e3);
  m.logCredits(b, { dept: "light", label: "Golden", credits: 5 }, noon - 3 * 24 * 3600e3);
  assert.equal(b.log.length, 3);
  assert.equal(b.log[1].credits, 8.5, "kept to a tenth");
  assert.equal(m.creditsToday([b.log, [{ at: new Date(noon).toISOString(), credits: 10 }], []], noon), 43, "today's, over every shot: 24 + 8.5 + 10, rounded");
  assert.equal(m.creditsToday([], noon), 0);
  assert.equal(m.creditsToday([[null, { at: "nonsense", credits: 3 }] as any], noon), 0, "junk is not a day");
});

test("an LTX shot costs its seconds at 18 GPU seconds each (the mockup's portal: 24 cr for five seconds); a GPU-only template, its seconds of footage", () => {
  assert.equal(m.ltxCredits(5), 24);
  assert.equal(m.ltxCredits(2), 10);
  assert.equal(m.ltxCredits(0), 1, "never less than a credit");
  assert.equal(m.gpuCredits(26, 5), 35, "VOID on five seconds");
  assert.equal(m.gpuCredits(10, 30), 32, "a long clip is priced at twelve seconds at most");
});

test("the elements are the Kitchen presets (each a folder under presets/ with its script) and one free effect", () => {
  assert.equal(m.ELEMENTS.length, 11);
  assert.equal(new Set(m.ELEMENTS.map((e) => e.id)).size, 11, "no id twice");
  for (const e of m.ELEMENTS) {
    assert.ok(e.name && e.verb, `${e.id} has a name and a verb for its key`);
    if (e.preset) {
      const p = JSON.parse(readFileSync(join(root, "presets", e.preset, "preset.json"), "utf8"));
      assert.equal(p.category, "vfx", `${e.preset} is one of Kitchen's VFX presets`);
      assert.ok(p.script.shots[0].action.length > 30, `${e.preset} has words for LTX`);
      assert.ok(existsSync(join(root, "presets", e.preset, "poster.jpg")), `${e.preset} has a poster for its tile`);
    } else assert.equal(e.free, true, "an element with no preset is the free one");
  }
  assert.equal(m.elementById("nothing").id, "portal", "an element that is not there is the first");
  assert.equal(m.elementById("fire").preset, "set-on-fire");
});

test("an effect's frames: the second half of the range until it is chosen; its seconds are LTX's two to ten", () => {
  const b = shot();
  assert.deepEqual(m.whenOf(b), { from: 1060, to: 1120 });
  b.set.fx.when = { from: 1030, to: 1120 };
  assert.deepEqual(m.whenOf(b), { from: 1030, to: 1120 });
  b.set.fx.when = { from: 1090, to: 1010 };
  assert.deepEqual(m.whenOf(b), { from: 1090, to: 1090 }, "an end before the start is the start");
  b.range = { in: 1040, out: 1080 };
  b.set.fx.when = { from: 1001, to: 1120 };
  assert.deepEqual(m.whenOf(b), { from: 1040, to: 1080 }, "kept inside the range the shot is worked on");
  assert.equal(m.fxSeconds({ from: 1030, to: 1120 }, 24), 4);
  assert.equal(m.fxSeconds({ from: 1030, to: 1035 }, 24), 2);
  assert.equal(m.fxSeconds({ from: 1001, to: 2000 }, 24), 10);
  assert.equal(m.easeAt("linear", 0.5), 0.5);
  assert.equal(m.easeAt("in", 0.5), 0.25);
  assert.equal(m.easeAt("out", 0.5), 0.75);
  assert.equal(m.easeAt("inout", 0.5), 0.5);
  assert.deepEqual([m.easeAt("inout", -1), m.easeAt("inout", 2)], [0, 1]);
});

test("LTX is told the preset's words, then where the effect is, how big and strong, in front or behind, how its light falls and how it builds", () => {
  const set = { place: { x: 0.8, y: 0.2, size: 0.9 }, intensity: 0.9, spill: 0.7, depth: "behind", ease: "inout", words: "" };
  const text = m.fxPrompt("A ring of fire opens.", set);
  assert.ok(text.startsWith("A ring of fire opens."));
  for (const piece of ["The effect is large, on the right, high in the frame.", "Make it huge and dramatic.", "Its light spills onto the wet surfaces and onto the people.", "It stays behind the people, who stay fully visible in front of it.", "It builds smoothly, peaks, then settles."]) assert.ok(text.includes(piece), piece);
  const quiet = m.fxPrompt("x", { place: { x: 0.5, y: 0.5, size: 0.2 }, intensity: 0.1, spill: 0.1, depth: "front", ease: "linear", words: "My own words." });
  assert.ok(quiet.startsWith("My own words."), "the person's words take the preset's place");
  for (const piece of ["small, in the middle, at the middle of the frame", "Keep it subtle.", "Its light does not touch the surroundings.", "It passes in front of the people."]) assert.ok(quiet.includes(piece), piece);
  assert.ok(!quiet.includes("builds"), "a linear ease says nothing");
});

test("Roto's clicks reach the segmenter as pixels of the frame: those on the subject, and those that are not", () => {
  const s = { points: [{ x: 0.5, y: 0.25 }, { x: 1.4, y: -1 }, { x: 0.1, y: 0.9, neg: true }] };
  assert.deepEqual(m.pointsOf(s, 1920, 1080), { positive: [{ x: 960, y: 270 }, { x: 1920, y: 0 }], negative: [{ x: 192, y: 972 }] });
  const extra = m.samExtra(s, 1920, 1080);
  assert.deepEqual(JSON.parse(extra.positive_coords!), [{ x: 960, y: 270 }, { x: 1920, y: 0 }]);
  assert.deepEqual(JSON.parse(extra.negative!), [{ x: 192, y: 972 }]);
  assert.deepEqual(m.samExtra({ points: [] }, 1920, 1080), {}, "no clicks: the name alone");
  assert.deepEqual(m.samExtra(null, 1920, 1080), {});
  assert.deepEqual(m.OUTS.map((o) => o.id), ["alpha", "green", "holdout"]);
});

test("the templates each department runs are named, belong to a department and say who bills them", () => {
  for (const [id, t] of Object.entries(m.TEMPLATES) as [string, any][]) {
    assert.ok(DEPARTMENTS.includes(t.dept), `${id} belongs to a department`);
    assert.ok(/^[A-Za-z0-9._-]+$/.test(t.name), `${id}'s name is a catalogue name`);
    assert.ok(t.partner ? !t.gpu : t.gpu > 0, `${id} is a partner's (priced by the runner) or an open model (priced by its GPU time)`);
    assert.ok(t.want.video || t.want.image, `${id} takes a clip or a picture`);
  }
  assert.equal(new Set(Object.values(m.TEMPLATES).map((t: any) => t.name)).size, Object.keys(m.TEMPLATES).length, "no template twice");
  for (const id of m.REMOVERS) assert.equal((m.TEMPLATES as any)[id].dept, "paint");
  assert.equal(m.TEMPLATES.sam3.name, "utility_video_segment_sam3");
  assert.equal(m.TEMPLATES.depth.name, "utility_depth_anything3_video_depth_estimation");
});

test("a new shot is named SH010, SH020... after the ones there are", () => {
  assert.equal(m.nextName([]), "SH010");
  assert.equal(m.nextName([{ name: "SH010 · Rooftop portal" }, { name: "My own name" }]), "SH020");
  assert.equal(m.nextName([{ name: "sh100" }, { name: "SH030" }]), "SH110");
  assert.equal(m.titleOf({ name: "SH010 · Rooftop portal" }), "SH010 · Rooftop portal");
  assert.equal(m.titleOf(null), "Untitled shot");
});

test("Spice's example shots are whole: each has its plate, every clip and still it names is in its folder, and no id twice", async () => {
  const { readdir, readFile, stat } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const dir = join(import.meta.dirname, "..", "spice", "examples");
  const ids = new Set<string>();
  const folders = (await readdir(dir)).sort();
  assert.ok(folders.length >= 2, "at least two example shots");
  for (const folder of folders) {
    const spec = JSON.parse(await readFile(join(dir, folder, "shot.json"), "utf8"));
    assert.match(spec.id, /^[\w-]+$/);
    assert.ok(!ids.has(spec.id), `${spec.id} once`);
    ids.add(spec.id);
    assert.ok(spec.name && spec.passes?.plate, `${folder} names itself and has a plate`);
    for (const [dept, p] of Object.entries<any>(spec.passes)) {
      assert.ok(["plate", "roto", "paint", "light", "fx", "comp"].includes(dept), `${folder}: ${dept} is a department`);
      assert.ok((await stat(join(dir, folder, p.file))).size > 10_000, `${folder}/${p.file} is there`);
      assert.ok(Number(p.seconds) > 0, `${folder}: ${dept} says how long it is`);
      if (p.still) assert.ok((await stat(join(dir, folder, p.still))).size > 1_000, `${folder}/${p.still} is there`);
    }
  }
});
