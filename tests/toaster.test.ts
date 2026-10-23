// Toaster's model: the shapes and their defaults, a draft cleaned whatever came in, the mirror and the copy of a part, the turnaround
// sheet laid out where Pixal3D's template crops it, and the words sent with the clay. No browser, no three.js.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SHAPES, PALETTE, RATIOS, SHEET, VIEWS, TO_3D, shapeOf, roundLabel, hasSides, colorName, sheetScale,
  cleanPart, cleanDraft, newPart, mirrorPart, duplicatePart, starterDraft, legendOf, framePrompt, sheetPrompt,
} from "../web/js/toaster-model.js";

test("ten shapes, each with a size; the slider and the sides only where they mean something", () => {
  assert.deepEqual(SHAPES.map((s) => s.id), ["box", "cylinder", "sphere", "cone", "pyramid", "wedge", "torus", "capsule", "dome", "tube"]);
  for (const s of SHAPES) assert.equal(s.size.length, 3);
  assert.equal(shapeOf("nope").id, "box");
  assert.equal(roundLabel("box"), "Round");
  assert.equal(roundLabel("sphere"), null);
  assert.ok(hasSides("cylinder") && hasSides("tube") && !hasSides("pyramid"));
  assert.equal(colorName(PALETTE[3][0]), "teal");
  assert.ok(Object.keys(RATIOS).every((r) => ["1:1", "4:5", "4:3", "3:4", "16:9", "9:16"].includes(r)));
});

test("a part is cleaned: unknown shapes and colours fall back, numbers are clamped, only its own settings are kept", () => {
  const p = cleanPart({ shape: "torus", name: "", color: "#ZZZ", size: [0, 5, "x"], pos: [1, 2, 3], rot: [720, 0, 0], round: 9, sides: 3 });
  assert.equal(p.shape, "torus");
  assert.equal(p.name, "Torus");
  assert.equal(p.color, PALETTE[0][0]);
  assert.deepEqual(p.size, [0.01, 5, 1], "a number that is not one takes the shape's own");
  assert.deepEqual(p.rot, [360, 0, 0]);
  assert.equal(p.round, 1);
  assert.equal(p.sides, undefined, "a torus has no sides to set");
  const c = cleanPart({ shape: "cylinder", sides: 200 });
  assert.equal(c.sides, 64);
  assert.equal(c.round, undefined);
  assert.equal(cleanPart({ shape: "box", color: "#ABCDEF" }).color, "#abcdef", "any colour typed in is kept, in lower case");
});

test("new parts take a colour and a name nobody has, and sit on the floor", () => {
  const a = newPart("box", []);
  const b = newPart("box", [a]);
  assert.equal(a.name, "Box");
  assert.equal(b.name, "Box 2");
  assert.notEqual(a.color, b.color);
  assert.equal(a.pos[1], a.size[1] / 2);
  assert.deepEqual(newPart("sphere", [], { at: [1, 2, 3] }).pos, [1, 2, 3]);
});

test("a mirrored part stands on the other side of x = 0, turned the other way; left and right swap in its name", () => {
  const foot = cleanPart({ shape: "box", name: "Foot left", pos: [0.6, 0.1, 0.4], rot: [10, 30, -20] });
  const other = mirrorPart(foot, [foot]);
  assert.deepEqual(other.pos, [-0.6, 0.1, 0.4]);
  assert.deepEqual(other.rot, [10, -30, 20]);
  assert.equal(other.name, "Foot right");
  assert.notEqual(other.id, foot.id);
  const knob = cleanPart({ shape: "cylinder", name: "Knob" });
  assert.equal(mirrorPart(knob, [knob]).name, "Knob mirrored");
  const copy = duplicatePart(knob, [knob]);
  assert.equal(copy.name, "Knob 2");
  assert.deepEqual(copy.pos, [0.25, knob.pos[1], 0.25]);
});

test("a draft is cleaned: renders, turnarounds and models keep their own fields; a run left running is taken as it is", () => {
  const d = cleanDraft({
    parts: [{ shape: "box" }],
    camera: { position: [1, 2, 3], target: [0, 0, 0] },
    ratio: "7:3",
    what: "a toaster",
    renders: [{ id: "r1", status: "done", photo: { url: "/media/photos/a.png", file: "a.png", width: 1024, height: 1024 }, ratio: "1:1", junk: 1 }],
    sheets: [{ id: "s1", status: "weird" }],
    models: [{ id: "m1", status: "running", job: "tpl-1", url: "/media/models/x.glb" }],
  });
  assert.equal(d.ratio, "1:1", "an unknown frame falls back to square");
  assert.equal(d.renders[0].photo.file, "a.png");
  assert.equal(d.renders[0].junk, undefined);
  assert.equal(d.sheets[0].status, "failed");
  assert.equal(d.models[0].status, "running");
  assert.equal(d.models[0].job, "tpl-1");
  assert.equal(starterDraft().parts.length, 1);
  assert.deepEqual(cleanDraft(null as any).parts, []);
});

test("the turnaround is laid out where Pixal3D's multi-view template crops it: front, left, back, right across 6336 x 2688", () => {
  assert.equal(TO_3D, "3d_pixal3d_multi_views");
  assert.deepEqual([SHEET.width, SHEET.height], [6336, 2688]);
  assert.deepEqual(SHEET.windows.map((w) => w.view), ["front", "left", "back", "right"]);
  // the template's crops, as its workflow has them (ImageCropV2 x and width, full height)
  assert.deepEqual(SHEET.windows.map((w) => [w.x, w.w]), [[0, 1669], [1652, 1492], [3182, 1476], [4728, 1608]]);
  for (const w of SHEET.windows) assert.ok(w.x + w.w <= SHEET.width);
  // the camera of "left" stands at the object's right side (its front faces the right of the picture), "right" the other way
  assert.deepEqual(VIEWS.left.dir, [-1, 0, 0]);
  assert.deepEqual(VIEWS.right.dir, [1, 0, 0]);
  assert.equal(SHEET.aspect, "21:9");
});

test("one scale for the four views, so the widest side fits the narrowest window and the height fits the sheet", () => {
  const narrow = Math.min(...SHEET.windows.map((w) => w.w));
  const flat = sheetScale([4, 1, 1]);
  assert.ok(Math.abs(flat * 4 - narrow * SHEET.fill) < 1e-6, "a wide object is held by the narrowest window");
  const deep = sheetScale([1, 1, 3]);
  assert.ok(Math.abs(deep * 3 - narrow * SHEET.fill) < 1e-6, "its depth counts too: the side views show it");
  const tall = sheetScale([0.5, 6, 0.5]);
  assert.ok(Math.abs(tall * 6 - SHEET.height * SHEET.fill) < 1e-6, "a tall object is held by the sheet's height");
  assert.ok(Number.isFinite(sheetScale([0, 0, 0])), "an empty box does not divide by zero");
});

test("the words: what each clay colour becomes, the object, the scene; hidden parts are not told", () => {
  const parts = [
    cleanPart({ shape: "box", name: "Body", color: "#4fb3a9", made: "brushed chrome." }),
    cleanPart({ shape: "box", name: "Lid", color: "#4fb3a9", made: "brushed chrome" }),
    cleanPart({ shape: "cylinder", name: "Knob", color: "#ece4d2" }),
    cleanPart({ shape: "box", name: "Box 3", color: "#e0884b" }),
    cleanPart({ shape: "box", name: "Ghost", color: "#d65a5a", made: "glass", hidden: true }),
  ];
  assert.deepEqual(legendOf(parts), ["the teal clay (body, lid) becomes brushed chrome", "the cream clay is the knob"]);
  const words = framePrompt({ parts, what: "A retro toaster", scene: "on a marble counter" });
  assert.match(words, /^Render @frame as a finished photograph of one object\./);
  assert.match(words, /In @frame, the teal clay \(body, lid\) becomes brushed chrome; the cream clay is the knob\./);
  assert.match(words, /The object: A retro toaster\. On a marble counter\./i);
  assert.doesNotMatch(words, /glass/);
  assert.match(framePrompt({ parts: [] }), /A plain studio backdrop/);
  const sheet = sheetPrompt({ parts, what: "a toaster" });
  assert.match(sheet, /^Render @sheet as a finished turnaround sheet of one object: four views side by side, the front, the left side, the back and the right side\./);
  assert.match(sheet, /no floor, no shadow, no text/);
});
