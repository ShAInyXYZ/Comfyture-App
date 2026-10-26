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

test("Paprika and the seven departments: the order a shot goes through, one name and one sprite each, a line and a placeholder for every department", () => {
  assert.deepEqual(DEPARTMENTS, ["plate", "roto", "paint", "gen", "light", "fx", "comp"]);
  assert.deepEqual(m.STACK, ["comp", "fx", "light", "gen", "paint", "roto", "plate"], "the stack is drawn from the top: the comp on top, the plate at the foot");
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
  assert.deepEqual(Object.keys(b.passes), ["plate", "roto", "paint", "gen", "light", "fx", "comp"]);
  for (const junk of [null, undefined, 5, "x", []]) assert.deepEqual(Object.keys(m.normaliseBody(junk as any).set), ["roto", "paint", "gen", "light", "fx", "comp"]);
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

test("a slow motion is longer than the footage: Comp has a timeline of its own, the footage's with the range stretched", () => {
  const b = shot({ light: { media: media("/light.mp4"), from: 1001, to: 1120 } });
  assert.equal(m.warpOf(b, "comp"), null, "no comp yet");
  b.passes.comp = { media: media("/slow.mp4", 10), from: 1001, to: 1240, eye: true };
  assert.equal(m.warpOf(b, "light"), null, "only Comp has it");
  const w = m.warpOf(b, "comp")!;
  assert.deepEqual([w.in, w.out, w.n, w.m, w.last], [1001, 1240, 120, 240, 1240], "a comp of twice the footage's frames is a slow motion of 2×: the whole timeline is its");
  assert.equal(w.toComp(1061), 1121, "the footage's frame 1061 is at 1121 of the slow motion");
  assert.equal(w.toFootage(1121), 1061, "and back");
  assert.equal(w.toFootage(1240), 1120.5, "the end of the slow motion is the end of the footage");
  assert.equal(w.toComp(1001), 1001);
  assert.equal(m.layerAt(b, "comp", 1200)!.dept, "comp", "past the footage's last frame the slow motion still shows");
  assert.equal(m.layerAt(b, "comp", 1200)!.from, 1001);
  assert.equal(m.layerAt(b, "light", 1100)!.dept, "light", "and the departments before it are the footage's");
  const bars = m.barsOf(b, "comp");
  assert.deepEqual(bars.plate, [1001, 1240], "the footage's bar spans the whole of the slow motion");
  assert.deepEqual(bars.light, [1001, 1240], "so does the light's, made of the whole footage");
  assert.deepEqual(bars.comp, [1001, 1240], "and the comp's own");
  assert.deepEqual(m.barsOf(b, "light").plate, [1001, 1120], "elsewhere the bars are the footage's");
  assert.deepEqual(m.barsOf(b).comp, [1001, 1120], "(asked for no department, the bars stay inside the footage's frames, as they did)");
  b.passes.comp.eye = false;
  assert.equal(m.warpOf(b, "comp"), null, "a comp that is not shown is not played");
  b.passes.comp = { media: media("/slow.mp4", 7.5), from: 1001, eye: true };
  assert.deepEqual([m.warpOf(b, "comp")!.m, m.warpOf(b, "comp")!.last], [180, 1180], "a slow motion of 1.5×");
});

test("a slow motion of a part of the footage stretches only that part, and the footage goes on after it", () => {
  const b = shot({ paint: { media: media("/paint.mp4"), from: 1001, to: 1120 }, light: { media: media("/light.mp4"), from: 1031, to: 1090 } });
  b.range = { in: 1031, out: 1090 };
  b.passes.comp = { media: media("/slow4.mp4", 10), from: 1031, to: 1270, eye: true };
  const w = m.warpOf(b, "comp")!;
  assert.deepEqual([w.in, w.out, w.n, w.m, w.last], [1031, 1270, 60, 240, 1300], "60 frames of the range are 240 of the slow motion (4×), and the 30 after them follow");
  assert.equal(w.toComp(1020), 1020, "before the range the timeline is the footage's");
  assert.equal(w.toComp(1061), 1151, "half way into the range is half way into the slow motion");
  assert.equal(w.toComp(1091), 1271, "the frames after the range follow the slow motion");
  assert.equal(w.toFootage(1271), 1091);
  assert.equal(w.toFootage(1300), 1120, "to the footage's last frame");
  assert.equal(w.toFootage(w.toComp(1075.5)), 1075.5);
  assert.equal(m.layerAt(b, "comp", 1100)!.dept, "comp");
  assert.equal(m.layerAt(b, "comp", 1280)!.dept, "paint", "after it the passes of the footage show, read at the footage's frame (1100): the light was made of the range only");
  assert.equal(m.layerAt(b, "comp", 1020)!.dept, "paint", "and before it");
  const bars = m.barsOf(b, "comp");
  assert.deepEqual(bars.plate, [1001, 1300], "the footage's bar is as long as the timeline");
  assert.deepEqual(bars.paint, [1001, 1300], "a pass made of the whole footage is as long as the timeline");
  assert.deepEqual(bars.light, [1031, 1270], "a pass made of the range is on the slow motion");
  assert.deepEqual(bars.comp, [1031, 1270]);
  b.range = { in: 1031, out: 1100 };
  assert.equal(m.warpOf(b, "comp")!.n, 70);
  assert.equal(m.warpOf(b, "comp")!.m, 240, "the slow motion is as it was made, the range is compared with it");
  b.range = { in: 1040, out: 1099 };
  assert.equal(m.warpOf(b, "comp"), null, "a comp that does not start where the range does was made of another range: it is shown as it was");
});

test("a comp that is no slow motion is not stretched: an export or an upscale, a clip a frame longer, a picture", () => {
  const b = shot();
  b.passes.comp = { media: media("/export.mp4", 5), eye: true };
  assert.equal(m.warpOf(b, "comp"), null, "an upscale or an export is as long as what it was made from");
  b.passes.comp = { media: media("/almost.mp4", 5.04), eye: true };
  assert.equal(m.warpOf(b, "comp"), null, "a frame more is not a slow motion");
  b.passes.comp = { media: media("/shorter.mp4", 4), eye: true };
  assert.equal(m.warpOf(b, "comp"), null, "nor is a shorter clip");
  const still = shot();
  still.passes.plate.media = { kind: "image", url: "/p.png", file: "p.png", width: 1920, height: 1080 };
  still.passes.comp = { media: media("/slow.mp4", 10), eye: true };
  assert.equal(m.warpOf(still, "comp"), null, "a picture has no motion to slow");
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
  for (const piece of ["The effect is large, on the right, high in the frame.", "Make it huge and dramatic.", "Its light spills onto the surfaces around it and onto the people.", "It stays behind the people, who stay fully visible in front of it.", "It builds smoothly, peaks, then settles."]) assert.ok(text.includes(piece), piece);
  const quiet = m.fxPrompt("x", { place: { x: 0.5, y: 0.5, size: 0.2 }, intensity: 0.1, spill: 0.1, depth: "front", ease: "linear", words: "My own words." });
  assert.ok(quiet.startsWith("My own words."), "the person's words take the preset's place");
  for (const piece of ["small, in the middle, at the middle of the frame", "Keep it subtle.", "Its light does not touch the surroundings.", "It passes in front of the people."]) assert.ok(quiet.includes(piece), piece);
  assert.ok(!quiet.includes("builds"), "a linear ease says nothing");
});

test("Roto's clicks reach the segmenter as pixels of the frame: those on the subject, and those that are not", () => {
  const s = { points: [{ x: 0.5, y: 0.25 }, { x: 1.4, y: -1 }, { x: 0.1, y: 0.9, neg: true }] };
  assert.deepEqual(m.pointsOf(s, 1920, 1080), { positive: [{ x: 960, y: 270 }, { x: 1920, y: 0 }], negative: [{ x: 192, y: 972 }] });
  assert.deepEqual(m.OUTS.map((o) => o.id), ["alpha", "green", "holdout"]);
});

test("Roto asks the tracker for a subject by its first clicks, on the frame they were made on, and the matte starts there", () => {
  const s = { name: " Pickle ", points: [{ x: 0.5, y: 0.5, frame: 1030 }, { x: 0.1, y: 0.1, frame: 1030, neg: true }, { x: 0.9, y: 0.9, frame: 1060 }, { x: 0.2, y: 0.2, frame: 1001 }] };
  const ask = m.matteAsk(s, 1920, 1080, 1010);
  assert.deepEqual(ask, { text: "Pickle", positive: [{ x: 960, y: 540 }], negative: [{ x: 192, y: 108 }], key: 20, from: 1030 }, "the clicks before the range and on later frames wait");
  assert.deepEqual(m.matteAsk({ name: "car", points: [] }, 1920, 1080, 1001), { text: "car", positive: [], negative: [], key: 0, from: 1001 }, "no clicks: the name, from the first frame");
  assert.equal(m.matteAsk({ points: [{ x: 0.5, y: 0.5 }] }, 100, 100).from, m.FIRST, "a click with no frame is on the first");
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
  assert.equal(m.nextName([{ name: "SH010 · Ketkout's flambé" }, { name: "My own name" }]), "SH020");
  assert.equal(m.nextName([{ name: "sh100" }, { name: "SH030" }]), "SH110");
  assert.equal(m.titleOf({ name: "SH010 · Ketkout's flambé" }), "SH010 · Ketkout's flambé");
  assert.equal(m.titleOf(null), "Untitled shot");
});

test("Spice's example shots are whole: each has its plate, every clip and still it names is in its folder, and no id twice", async () => {
  const { readdir, readFile, stat } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const dir = join(import.meta.dirname, "..", "examples", "spice");
  const ids = new Set<string>();
  const folders = (await readdir(dir)).sort();
  const specs: any[] = [];
  assert.ok(folders.length >= 2, "at least two example shots");
  for (const folder of folders) {
    const spec = JSON.parse(await readFile(join(dir, folder, "shot.json"), "utf8"));
    specs.push(spec);
    // (the tour opens the newest example by its id)
    assert.match(spec.id, /^spice-example-[\w-]+$/);
    assert.ok(!ids.has(spec.id), `${spec.id} once`);
    ids.add(spec.id);
    assert.ok(spec.name && spec.passes?.plate, `${folder} names itself and has a plate`);
    assert.ok(String(spec.about ?? "").length > 80, `${folder} says what it shows and how its passes were made`);
    const clip = spec.passes.plate.file.endsWith(".mp4");
    for (const [dept, p] of Object.entries<any>(spec.passes)) {
      assert.ok(["plate", "roto", "paint", "gen", "light", "fx", "comp"].includes(dept), `${folder}: ${dept} is a department`);
      assert.ok((await stat(join(dir, folder, p.file))).size > 10_000, `${folder}/${p.file} is there`);
      // (a clip says how long it is; a picture how big)
      if (p.file.endsWith(".mp4")) assert.ok(Number(p.seconds) > 0, `${folder}: ${dept} says how long it is`);
      else assert.ok(Number(p.width) > 0 && Number(p.height) > 0, `${folder}: ${dept} says how big it is`);
      if (p.still) assert.ok((await stat(join(dir, folder, p.still))).size > 1_000, `${folder}/${p.still} is there`);
      // a clip's passes are clips as long as it (an effect on every frame), a picture's are pictures
      assert.equal(p.file.endsWith(".mp4"), clip, `${folder}: ${dept} is a ${clip ? "clip" : "picture"} as its plate is`);
      if (clip) assert.equal(Number(p.seconds), Number(spec.passes.plate.seconds), `${folder}: ${dept} runs as long as the plate`);
      if (dept !== "plate") assert.ok(String(p.note ?? "").trim(), `${folder}: ${dept} says how it was made`);
    }
    // the takes of the IC-LoRA suite an example ships: each a tool of the suite that was run, its clip there, and the damaged copy a restoring tool was given
    const toolIds = new Set(JSON.parse(await readFile(join(root, "workflows", "ic-loras.json"), "utf8")).tools.map((t: any) => t.id));
    for (const t of spec.set?.gen?.takes ?? []) {
      assert.ok(toolIds.has(t.tool), `${folder}: ${t.tool} is a tool of the suite`);
      assert.ok((await stat(join(dir, folder, t.media.file))).size > 5_000, `${folder}/${t.media.file} is there`);
      if (t.input) assert.ok((await stat(join(dir, folder, t.input.file))).size > 5_000 && t.inputLabel, `${folder}/${t.input.file} is there and says what it is`);
    }
    // every folder is light: pictures and short clips
    let bytes = 0;
    for (const f of await readdir(join(dir, folder))) bytes += (await stat(join(dir, folder, f))).size;
    assert.ok(bytes < 7.2e6, `${folder} is under 7 MB (${(bytes / 1e6).toFixed(1)} MB)`);
  }
  // together they show every department doing its job, on a picture and on a clip
  for (const dept of DEPARTMENTS) assert.ok(specs.some((s) => s.passes[dept]), `an example shows ${dept}`);
  assert.ok(specs.some((s) => s.passes.plate.file.endsWith(".mp4") && DEPARTMENTS.filter((d) => d !== "gen").every((d) => s.passes[d])), "a clip goes through every department of the VFX house");
  assert.ok(specs.some((s) => s.passes.plate.file.endsWith(".mp4") && s.passes.gen && (s.set?.gen?.takes?.length ?? 0) >= 10), "a clip shows the IC-LoRA suite, with a take of each tool that was run");
  assert.ok(specs.filter((s) => s.passes.light).length > 1, "Light is shown more than once");
});

test("a run's pass is its result: never the side-by-side comparison an LTX clean-up also saves, nor VOID's rough first pass", () => {
  const out = (saved: string, kind = "video") => ({ kind, url: `/media/videos/${saved}`, file: saved, width: 1920, height: 1080, seconds: 5, saved });
  assert.equal(m.pickMedia([out("video_compare_00001_.mp4"), out("video_00001_.mp4")])!.file, "video_00001_.mp4");
  assert.equal(m.pickMedia([out("VOID_pass1_00001_.mp4"), out("VOID_pass2_00001_.mp4")])!.file, "VOID_pass2_00001_.mp4");
  assert.equal(m.pickMedia([out("mask_00001_.png", "image"), out("matte_00001_.mp4")])!.file, "matte_00001_.mp4", "a clip before a picture");
  assert.equal(m.pickMedia([out("video_compare_00001_.mp4")])!.file, "video_compare_00001_.mp4", "and the comparison when it is all there is");
  assert.equal(m.pickMedia([]), null);
});

test("VOID is told the object to find and the place without it, at its own size turned to the clip's shape, over the whole clip", () => {
  const wide = m.voidExtra("Remove the man in the red coat.", "", { width: 1920, height: 1080, seconds: 5.2 });
  assert.equal(wide.sam3_object_mask_prompt, "the man in the red coat", "SAM3 gets a short name, not an order");
  assert.equal(wide.positive_prompt_inpaint_fill_, m.VOID_AFTER, "the fill says what is left, never what goes");
  assert.ok(!/man|coat/.test(wide.positive_prompt_inpaint_fill_));
  assert.deepEqual([wide.width_pass_2_, wide.height_pass_2_], [672, 384], "a wide clip at VOID's own 672 x 384");
  assert.equal(wide.clip_duration_seconds_, 6, "the whole clip, in whole seconds");
  const tall = m.voidExtra("the bin", "an empty pavement", { width: 1080, height: 1920, seconds: 30 });
  assert.deepEqual([tall.width_pass_2_, tall.height_pass_2_], [384, 672], "a tall clip is not squashed into a wide frame");
  assert.equal(tall.positive_prompt_inpaint_fill_, "an empty pavement");
  assert.equal(tall.clip_duration_seconds_, 10, "ten seconds at most");
  assert.equal(m.voidExtra(Array(30).fill("word").join(" ")).sam3_object_mask_prompt.split(" ").length, 12, "within SAM3's 32 tokens");
  assert.ok(!m.REMOVERS.includes("vace"), "Wan VACE is not a remover: it needs a reference picture and renders square");
});
