// Toaster's model: the shapes and their defaults, a draft cleaned whatever came in, the mirror and the copy of a part, the turnaround
// sheet laid out where Pixal3D's template crops it, and the words sent with the clay. No browser, no three.js.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SHAPES, PALETTE, RATIOS, SHEET, VIEWS, TO_3D, shapeOf, roundLabel, hasSides, colorName, sheetScale,
  cleanPart, cleanDraft, newPart, strengthWords, plainFrame, keepOf, STRENGTH, shortOf, mirrorPart, duplicatePart, starterDraft, legendOf, describeOf, described, framePrompt, sheetPrompt, newAssetPart, isAsset, freeSpot, newCharacterPart, isCharacter, tagsOf, castOf, referencesFor, expandPrompt, RESERVED, newSceneRef, addRef, mentionsIn, idColor, familyOf, colourByKind, personColor, FAMILIES, PEOPLE,
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
  assert.deepEqual(legendOf(parts), ["teal is brushed chrome (×2)", "cream is a knob"], "each part by its description, equal ones counted; a default shape says nothing");
  const words = framePrompt({ parts, what: "A retro toaster", scene: "on a marble counter", maps: ["id", "depth", "silhouette"] });
  // the operation and the look first, then what it shows, how far it goes, who is who, the maps, what is left of the clay
  assert.match(words, /^Turn @frame, a clay blockout, into a finished image in this look: on a marble counter\. It shows: A retro toaster\. Keep its camera, framing and layout: /);
  assert.match(words, /the flat colours only say which thing is which.*@frame is in plain grey clay: it gives the forms only\. In @colour-id each flat colour is one thing: teal is brushed chrome \(×2\); cream is a knob\. /);
  assert.match(words, /@depth shows how far things are, near light and far dark; @silhouette their outlines; the maps only place things and never colour them\. No mannequin and no clay is left: .*all in the look above\.$/);
  assert.doesNotMatch(words, /glass|Body|Lid|Knob/, "no name of a part is said");
  assert.match(framePrompt({ parts: [] }), /^Turn @frame, a clay blockout, into a finished cinematic photograph, soft natural light\./, "no look said: a photograph");
  assert.doesNotMatch(framePrompt({ parts, maps: ["depth"] }), /@colour-id|@silhouette|plain grey/, "without the colour ID, the frame keeps its colours and says who is who");
  assert.match(framePrompt({ parts, maps: ["depth"] }), /In @frame each clay colour is one thing: teal is brushed chrome/);
  const sheet = sheetPrompt({ parts, what: "a toaster" });
  assert.match(sheet, /^Render @sheet as a finished turnaround sheet of one object: four views side by side, the front, the left side, the back and the right side\./);
  assert.match(sheet, /In @sheet, teal is brushed chrome \(×2\); cream is a knob\./);
  assert.match(sheet, /no floor, no shadow, no text/);
});

test("a piece of the Stage's library is a part: its piece and its own size kept, named after it, told by name in the words", () => {
  const chair = newAssetPart({ type: "office-chair", name: "Office chair", size: [0.65, 1.033, 0.621] }, [], { color: PALETTE[0][0] });
  assert.ok(isAsset(chair));
  assert.equal(chair.shape, "asset");
  assert.equal(chair.asset, "office-chair");
  assert.equal(chair.name, "Office chair");
  assert.deepEqual(chair.size, [0.65, 1.033, 0.621]);
  assert.equal(chair.pos[1], 0.517, "standing on the floor");
  assert.equal(chair.round, undefined);
  assert.equal(chair.sides, undefined);
  const again = newAssetPart({ type: "office-chair", name: "Office chair", size: [0.65, 1.033, 0.621] }, [chair]);
  assert.equal(again.name, "Office chair 2");
  assert.equal(cleanPart({ ...chair, size: [2, 3, 4] }).asset, "office-chair", "kept through a clean");
  assert.equal(cleanPart({ shape: "asset", asset: "../../etc" }).shape, "box", "a piece's name is a type id, nothing else");
  assert.equal(mirrorPart({ ...chair, pos: [1, 0.5, 0] }, [chair]).asset, "office-chair");
  assert.deepEqual(legendOf([{ ...chair, made: "black leather" }]), ["grey is black leather"]);
  assert.deepEqual(legendOf([cleanPart({ shape: "asset", asset: "box", name: "Box" })]), ["grey is a box"], "a piece is told by what it is, whatever its name");
});

test("the colour ID: each kind of thing its family, each type its shade in the order it came, one type one colour, people each their own", () => {
  const lib: Record<string, any> = {
    sofa: { type: "sofa", name: "Sofa", category: "Furniture" }, armchair: { type: "armchair", name: "Armchair", category: "Furniture" },
    shelf: { type: "shelf", name: "Shelf", category: "Furniture" }, "articulated-desk-lamp": { type: "articulated-desk-lamp", name: "Articulated desk lamp", category: "Objects" },
    desk: { type: "desk", name: "Desk", category: "Furniture" }, "coffee-table": { type: "coffee-table", name: "Coffee table", category: "Furniture" },
    fireplace: { type: "fireplace", name: "Fireplace", category: "Furniture" }, "baby-chick": { type: "baby-chick", name: "Chick", category: "Animals", animal: true },
  };
  const of = (t: string) => lib[t];
  assert.equal(familyOf(of("articulated-desk-lamp")).id, "light", "a desk lamp is a lamp: its own last word counts first");
  assert.equal(familyOf(of("coffee-table")).id, "table");
  assert.equal(familyOf(of("baby-chick")).id, "animal");
  assert.equal(familyOf({ type: "mystery-gizmo", name: "Gizmo", category: "Vehicles" }).id, "vehicle", "a piece the words miss falls back on its category");
  const parts: any[] = [];
  for (const t of ["sofa", "armchair", "shelf", "shelf", "desk", "coffee-table", "fireplace"]) parts.push(newAssetPart(of(t), parts, { pieceOf: of }));
  const colour = (t: string) => parts.filter((p) => p.asset === t).map((p) => p.color);
  const seat = FAMILIES.find((f) => f.id === "seat")!.shades.map(([h]) => h);
  assert.equal(colour("sofa")[0], seat[0], "the first seat type takes the family's first shade");
  assert.equal(colour("armchair")[0], seat[1], "the next seat type its next shade");
  assert.equal(new Set(colour("shelf")).size, 1, "two shelves are one colour");
  assert.notEqual(colour("desk")[0], colour("coffee-table")[0], "two kinds of table, two shades of the tables' family");
  assert.equal(colorName(colour("sofa")[0]), "blue");
  const a = newCharacterPart({ body: "man", name: "Man", size: [0.5, 1.8, 0.3] }, parts);
  const b = newCharacterPart({ body: "man", name: "Man", size: [0.5, 1.8, 0.3] }, [...parts, a]);
  assert.equal(a.color, PEOPLE[0][0]);
  assert.notEqual(a.color, b.color, "two men are two people: two colours");
  // a draft coloured any old way is put back to the colour ID, the shapes left as they were
  const messy = [...parts.map((p) => ({ ...p, color: "#123456" })), cleanPart({ shape: "box", color: "#e0884b" })];
  const tidy = colourByKind(messy, of);
  assert.deepEqual(tidy.slice(0, -1).map((p: any) => p.color), parts.map((p) => p.color));
  assert.equal(tidy.at(-1).color, "#e0884b");
  assert.equal(idColor(of("sofa"), tidy, of), colour("sofa")[0]);
  assert.equal(personColor([]), PEOPLE[0][0]);
});

test("a free spot on the floor: the middle when it is free, else the nearest place beside what is there, never overlapping", () => {
  assert.deepEqual(freeSpot([1, 1], []), [0, 0]);
  const sofa = { min: [-1, -0.45], max: [1, 0.45] };
  const [x, z] = freeSpot([0.8, 0.8], [sofa], { gap: 0.1 });
  const overlaps = (a, b) => a.min[0] < b.max[0] && a.max[0] > b.min[0] && a.min[1] < b.max[1] && a.max[1] > b.min[1];
  const placed = { min: [x - 0.4, z - 0.4], max: [x + 0.4, z + 0.4] };
  assert.ok(!overlaps(placed, sofa), `not on the sofa: ${x}, ${z}`);
  assert.ok(Math.hypot(x, z) < 1.6, `right beside it: ${x}, ${z}`);
  assert.deepEqual([x, z], [1.5, 0], "edge to edge on its right, lined up with it, a gap between");
  // a row: the pieces go to the sides before they go behind, and behind before they go in front (toward the camera)
  const row = [{ min: [-0.5, -0.5], max: [0.5, 0.5] }];
  const spots = [];
  for (let i = 0; i < 4; i++) {
    const [px, pz] = freeSpot([1, 1], row, { near: [0, 0], gap: 0.1 });
    spots.push([px, pz]);
    row.push({ min: [px - 0.5, pz - 0.5], max: [px + 0.5, pz + 0.5] });
  }
  assert.ok(spots.slice(0, 2).every(([, z]) => z === 0), `the first two beside it, in its row: ${JSON.stringify(spots)}`);
  assert.ok(spots.every(([, z]) => z <= 0), `none in front: ${JSON.stringify(spots)}`);
  // a row of pieces added one after another stays a cluster with no overlaps
  const taken = [sofa];
  for (let i = 0; i < 8; i++) {
    const [px, pz] = freeSpot([0.6, 0.6], taken, { near: [0, 0] });
    const box = { min: [px - 0.3, pz - 0.3], max: [px + 0.3, pz + 0.3] };
    assert.ok(taken.every((t) => !overlaps(box, t)), `piece ${i} overlaps`);
    taken.push(box);
  }
  assert.ok(taken.every((t) => Math.hypot((t.min[0] + t.max[0]) / 2, (t.min[1] + t.max[1]) / 2) < 3), "they stay together");
});

test("one of the Stage's characters is a part: its body, its rig and its pose kept, a colour of its own, told by name", () => {
  const man = newCharacterPart({ body: "man", name: "Man", size: [0.55, 1.78, 0.3] }, [], { pose: "sit-chair" });
  assert.ok(isCharacter(man));
  assert.equal(man.shape, "character");
  assert.equal(man.body, "man");
  assert.equal(man.pose, "sit-chair");
  assert.equal(man.rig, undefined);
  assert.deepEqual(man.size, [0.55, 1.78, 0.3]);
  assert.equal(man.pos[1], 0.89, "standing on the floor");
  const other = newCharacterPart({ body: "man", name: "Man", size: [0.55, 1.78, 0.3] }, [man]);
  assert.equal(other.name, "Man 2");
  assert.notEqual(other.color, man.color, "each character is someone: a colour of its own");
  assert.equal(other.pose, "stand");
  const mine = cleanPart({ shape: "character", body: "man", rig: "rig-bob-1a2b3c", pose: "../x", name: "Bob" });
  assert.equal(mine.rig, "rig-bob-1a2b3c");
  assert.equal(mine.pose, "stand", "an odd pose falls back to standing");
  assert.equal(cleanPart({ shape: "character" }).shape, "box", "a character needs its body");
  assert.deepEqual(legendOf([{ ...man, made: "a chef in whites" }]), ["vermilion is a chef in whites"]);
  assert.equal(describeOf({ ...man, made: "" }), "a man", "a character is a person");
});

test("placing by relations: against a wall facing in, beside a part facing it, on its top, the room brought in to its walls", async () => {
  const { roomOf, placeAgainst, placeNear, topOf, faceTurn, footprintOf } = await import("../web/js/toaster-model.js");
  const floor = cleanPart({ shape: "box", name: "Floor", size: [8, 0.1, 6], pos: [0, 0.05, 0] });
  const back = cleanPart({ shape: "box", name: "Back wall", size: [8, 2.7, 0.12], pos: [0, 1.35, -3] });
  const left = cleanPart({ shape: "box", name: "Left wall", size: [0.12, 2.7, 6], pos: [-4, 1.35, 0] });
  const room = roomOf([floor, back, left]);
  assert.deepEqual(room.min.map((v) => Math.round(v * 100) / 100), [-3.94, -2.94], "the room starts at the inner face of the walls");
  assert.deepEqual(room.max, [4, 3]);
  const shelf = cleanPart({ shape: "box", name: "Shelf", size: [1, 2, 0.4] });
  const a = placeAgainst(shelf, "back", room, [floor, back, left]);
  assert.equal(a.turn, 0, "against the back wall it faces the front");
  assert.ok(Math.abs(a.pos[1] - (-2.94 + 0.2 + 0.01)) < 1e-3, `its back on the wall: ${a.pos}`);
  const placed = { ...shelf, pos: [a.pos[0], 1, a.pos[1]] };
  const b = placeAgainst(shelf, "back", room, [floor, back, left, placed]);
  assert.ok(Math.abs(b.pos[0] - a.pos[0]) >= 1 - 1e-3, "a second shelf slides along the wall, beside the first");
  const l = placeAgainst(shelf, "left", room, [floor]);
  assert.equal(l.turn, 90, "against the left wall it faces right, into the room");
  assert.ok(Math.abs(l.pos[0] - (-3.94 + 0.2 + 0.01)) < 1e-3);
  // a desk whose user's side faces the back wall (turn 180), its chair at its front, a visitor's chair at its back
  const desk = cleanPart({ shape: "box", name: "Desk", size: [1.6, 0.75, 0.8], pos: [0, 0.375, -1], rot: [0, 180, 0] });
  const chair = cleanPart({ shape: "box", name: "Chair", size: [0.6, 1, 0.6] });
  const boss = placeNear(chair, desk, "front", 0.1);
  assert.ok(Math.abs(boss.pos[1] - (-1 - (0.4 + 0.1 + 0.3))) < 1e-3, `the boss's chair behind the desk, toward the wall: ${boss.pos}`);
  assert.equal(Math.abs(boss.turn), 0, "and faces the desk (toward the room)");
  const guest = placeNear(chair, desk, "back", 0.5);
  assert.ok(Math.abs(guest.pos[1] - (-1 + 0.4 + 0.5 + 0.3)) < 1e-3, `a visitor's chair before it: ${guest.pos}`);
  assert.equal(Math.abs(guest.turn), 180, "facing the desk");
  const side = placeNear(chair, desk, "right", 0.2);
  assert.ok(Math.abs(Math.abs(side.pos[0]) - (0.8 + 0.2 + 0.3)) < 1e-3, `at its side: ${side.pos}`);
  assert.equal(topOf(desk), 0.75, "a lamp on the desk stands at its top");
  assert.equal(faceTurn([0, 0], [1, 0]), 90);
  assert.deepEqual(footprintOf({ size: [2, 1, 1], pos: [0, 0, 0], rot: [0, 90, 0] }).max.map((v) => Math.round(v * 1000) / 1000), [0.5, 1], "a turned part's footprint turns with it");
});

// ---------------------------------------------------------------- tags and sheets

const desk = (extra = {}) => cleanPart({ id: "p-desk", shape: "asset", asset: "desk", name: "Desk", color: "#9a5a2a", made: "a walnut mid-century desk with brass handles", refs: [{ file: "d1.png", url: "/media/photos/d1.png", width: 800, height: 600 }, { file: "d2.png", url: "/media/photos/d2.png" }], ...extra });
const mia = (extra = {}) => cleanPart({ id: "p-mia", shape: "character", body: "woman", name: "Mia", color: "#ff6b3d", made: "A woman in her thirties, curly red hair.", refs: [{ file: "m1.png", url: "/media/photos/m1.png" }], ...extra });

test("tagsOf: the slug of each visible part's name, unique, never a reserved name nor a taken one", () => {
  const parts = [cleanPart({ id: "a", name: "Office Chair" }), cleanPart({ id: "b", name: "Office chair" }), cleanPart({ id: "c", name: "Frame" }), cleanPart({ id: "d", name: "Box 3" }), cleanPart({ id: "e", name: "Ghost", hidden: true }), cleanPart({ id: "f", name: "Mood" }), cleanPart({ id: "g", name: "Café Crème" })];
  const tags = tagsOf(parts, ["mood"]);
  assert.deepEqual([...tags], [["a", "office-chair"], ["b", "office-chair-2"], ["c", "frame-2"], ["d", "box-3"], ["f", "mood-2"], ["g", "cafe-creme"]]);
  assert.ok(!tags.has("e"), "a hidden part has no tag");
  for (const r of RESERVED) assert.ok(![...tagsOf([cleanPart({ name: r })]).values()].includes(r), r);
  assert.deepEqual([...tagsOf([cleanPart({ id: "x", name: "!!!" })].map((p) => p)).values()], ["part"]);
});

test("a part keeps its words (400) and up to six pictures; bad pictures and doubles are dropped", () => {
  const p = cleanPart({ name: "Desk", made: "x".repeat(500), refs: [...Array.from({ length: 9 }, (_, i) => ({ file: `f${i}.png`, url: `/m/f${i}.png`, width: 10, height: 20 })), { file: "f0.png", url: "/m/f0.png" }, { url: "/no-file" }, null, { file: "", url: "/x" }] });
  assert.equal(p.made.length, 400);
  assert.equal(p.refs.length, 6);
  assert.deepEqual(p.refs[0], { file: "f0.png", url: "/m/f0.png", width: 10, height: 20 });
  assert.equal(cleanPart({ name: "A" }).refs, undefined, "no pictures, no key");
  assert.equal(duplicatePart(desk()).refs.length, 2, "a copy keeps the pictures");
  assert.equal(mirrorPart(desk()).refs.length, 2);
});

test("a draft keeps its scene references (named by themselves, never a part's tag) and its own prompt", () => {
  const b = cleanDraft({
    parts: [desk(), cleanPart({ name: "Mood" })],
    refs: [{ file: "a.png", url: "/m/a.png", name: "Desk" }, { file: "b.png", url: "/m/b.png", name: "Frame" }, { file: "c.png", url: "/m/c.png", name: "Mood" }, { file: "d.png", url: "/m/d.png" }, { file: "a.png", url: "/m/a.png", name: "again" }, { url: "/bad" }, "no"],
    prompt: "My own words".padEnd(7000, "!"),
  });
  assert.deepEqual(b.refs.map((r) => r.name), ["desk-2", "frame-2", "mood-2", "d"]);
  assert.equal(b.prompt.length, 6000);
  assert.equal(cleanDraft({}).prompt, "");
  assert.deepEqual(cleanDraft({}).refs, []);
  assert.equal(cleanDraft({ refs: Array.from({ length: 10 }, (_, i) => ({ file: `${i}.png`, url: `/m/${i}.png`, name: `r${i}` })) }).refs.length, 6);
  const run = cleanDraft({ renders: [{ id: "r1", status: "done", prompt: "sent", refs: [{ name: "desk", url: "/m/d1.png" }, { name: "bad" }] }] }).renders[0];
  assert.deepEqual(run.refs, [{ name: "desk", url: "/m/d1.png" }]);
});

test("referencesFor: scene references first, then the parts' pictures round-robin, the named parts first, never past the room", () => {
  const parts = [desk(), mia({ refs: [{ file: "m1.png", url: "/m/m1.png" }, { file: "m2.png", url: "/m/m2.png" }] }), cleanPart({ id: "p-box", name: "Box" })];
  const sceneRefs = [{ file: "s1.png", url: "/m/s1.png", name: "mood" }];
  const all = referencesFor({ parts, sceneRefs, room: 10 });
  assert.deepEqual(all.refs.map((r) => r.name), ["mood", "desk", "mia", "desk-2", "mia-2"]);
  assert.deepEqual([...all.named], [["mood", ["mood"]], ["desk", ["desk", "desk-2"]], ["mia", ["mia", "mia-2"]]]);
  assert.deepEqual(referencesFor({ parts, sceneRefs, room: 3 }).refs.map((r) => r.name), ["mood", "desk", "mia"]);
  assert.deepEqual(referencesFor({ parts, sceneRefs, room: 3, mentioned: ["mia"] }).refs.map((r) => r.name), ["mood", "mia", "desk"]);
  assert.deepEqual(referencesFor({ parts, sceneRefs, room: 1 }).refs.map((r) => r.name), ["mood"], "the scene's own pictures come first");
  assert.deepEqual(referencesFor({ parts, sceneRefs, room: 0 }).refs, []);
  assert.deepEqual(referencesFor({ parts: [{ ...parts[0], hidden: true }], room: 4 }).refs, [], "a hidden part sends nothing");
  // a name taken by a part's tag is skipped for a picture
  const tricky = referencesFor({ parts: [desk(), cleanPart({ id: "p-d2", name: "Desk 2" })], room: 4 });
  assert.deepEqual(tricky.refs.map((r) => r.name), ["desk", "desk-3"]);
});

test("castOf: the visible tagged parts with their words and pictures, then the references", () => {
  const cast = castOf([desk(), mia(), cleanPart({ name: "Ghost", hidden: true }), cleanPart({ id: "p-b", name: "Box" })], [{ file: "s.png", url: "/m/s.png", name: "mood" }]);
  assert.deepEqual(cast.map((c) => [c.tag, c.kind]), [["desk", "piece"], ["mia", "character"], ["box", "shape"], ["mood", undefined]]);
  assert.equal(cast[0].words, "a walnut mid-century desk with brass handles");
  assert.equal(cast[0].name, "a walnut mid-century desk with brass handles", "its name is what it is");
  assert.equal(cast[2].name, "a box" === cast[2].name ? "a box" : cast[2].label, "a default shape has no description: its name");
  assert.equal(cast[0].pictures.length, 2);
  assert.equal(cast[0].color, "#9a5a2a");
  assert.deepEqual(cast.at(-1), { tag: "mood", ref: true, pictures: [{ file: "s.png", url: "/m/s.png", name: "mood" }] });
});

test("the legend names each thing by what it is (someone by their name), people first; a part with pictures adds its @tag; expandPrompt turns the user's @tags into words", () => {
  const parts = [desk(), mia(), cleanPart({ id: "p-box", name: "Box", color: "#e3c35a" }), cleanPart({ id: "p-ch", shape: "asset", asset: "office-chair", name: "Guest_1", color: "#76aef2" }), cleanPart({ id: "p-ch2", shape: "asset", asset: "office-chair", name: "Guest_2", color: "#76aef2" })];
  const sceneRefs = [{ file: "s1.png", url: "/m/s1.png", name: "mood" }];
  const { named } = referencesFor({ parts, sceneRefs, room: 6 });
  const text = framePrompt({ parts, what: "A study. @mia reads at @desk.", scene: "Late light, like @mood.", maps: ["id", "depth"], sceneRefs, named });
  assert.match(text, /^Turn @frame, a clay blockout/);
  assert.match(text, /In @colour-id each flat colour is one thing: vermilion is Mia, exactly as in @mia; walnut is a walnut mid-century desk with brass handles, exactly as in @desk and @desk-2; sky blue is an office chair \(×2\)\./);
  assert.doesNotMatch(text, /Guest|guest|Box/, "no part name or id in the words");
  assert.match(text, /@mood is a reference picture for the look/);
  assert.match(text, /^Turn @frame, a clay blockout, into a finished image in this look: Late light, like @mood\. It shows: A study\. @mia reads at @desk\./);
  const sent = expandPrompt(text, castOf(parts, sceneRefs), named);
  assert.match(sent, /It shows: A study\. Mia \(exactly as in @mia\) reads at a walnut mid-century desk with brass handles \(exactly as in @desk and @desk-2\)\./, "the first mention points at the pictures: someone by their name, a thing by what it is");
  const unseen = expandPrompt("@mia waits.", castOf([mia({ refs: undefined })]), new Map());
  assert.equal(unseen, "Mia (a woman in her thirties, curly red hair) waits.", "without pictures, someone's words say who they are");
  assert.match(sent, /walnut is a walnut mid-century desk with brass handles, exactly as in @desk and @desk-2;/, "a tag said as a picture is left alone");
  assert.match(sent, /like @mood\./, "a scene reference stays as it is");
  // later mentions: "the …"; words alone when no picture was sent; no description, the name
  const cast = [{ tag: "lamp", name: "an articulated desk lamp", kind: "piece", pictures: [] }, { tag: "rug", name: "rug", kind: "piece", pictures: [] }];
  assert.equal(expandPrompt("@lamp and @rug, @lamp-2 and @lamp again @lamp", cast, new Map()), "an articulated desk lamp and rug, @lamp-2 and the articulated desk lamp again the articulated desk lamp");
  assert.equal(expandPrompt("@lamp", cast, new Map([["lamp", ["lamp"]]])), "an articulated desk lamp (exactly as in @lamp)");
  assert.match(sheetPrompt({ parts }), /In @sheet, vermilion is Mia; walnut is a walnut mid-century desk with brass handles/);
});

test("describeOf: the sheet words, else the library's description of the piece, the person or the shape's own name", () => {
  const ARM = "a deep armchair with a padded back, rolled arms and a loose seat cushion";
  const pieceOf = (t) => ({ "armchair": { name: "Armchair", description: ARM }, "desk-lamp": { name: "Articulated desk lamp" } })[t] ?? null;
  assert.equal(describeOf(cleanPart({ shape: "asset", asset: "armchair", name: "Guest_1" }), pieceOf), ARM, "never the part's name: the library's description");
  assert.equal(describeOf(cleanPart({ shape: "asset", asset: "desk-lamp", name: "Lamp" }), pieceOf), "an articulated desk lamp", "no description: the piece's name");
  assert.equal(describeOf(cleanPart({ shape: "asset", asset: "wall-clock", name: "x" })), "a wall clock", "no library: the type's words");
  assert.equal(describeOf(cleanPart({ shape: "asset", asset: "armchair", made: "A charcoal leather chesterfield." }), pieceOf), "a charcoal leather chesterfield");
  assert.equal(describeOf(cleanPart({ shape: "character", body: "elder", name: "Gran" })), "an older person");
  assert.equal(describeOf(cleanPart({ shape: "character", body: "man", rig: "rig-bob-1", name: "Bob" })), "a bob");
  assert.equal(describeOf(cleanPart({ shape: "box", name: "Back wall" })), "a back wall");
  assert.equal(describeOf(cleanPart({ shape: "box", name: "Floor" })), "the floor");
  assert.equal(describeOf(cleanPart({ shape: "cylinder", name: "Cylinder 2" })), "", "a default shape says nothing");
});

test("What it is starts as the piece's identity from the library; a character's is the user's to write; the bare names written before are mended", () => {
  const ARM = "a deep armchair with a padded back, rolled arms and a loose seat cushion";
  const pieceOf = (t) => ({ "armchair": { name: "Armchair", description: ARM }, "sofa": { name: "Sofa", description: "a three-seat sofa" }, "rug": { name: "Rug" } })[t] ?? null;
  assert.equal(newAssetPart({ type: "armchair", name: "Armchair", description: ARM, size: [1, 1, 1] }, []).made, ARM, "a piece added starts with its description");
  assert.equal(newAssetPart({ type: "rug", name: "Rug", size: [1, 1, 1] }, []).made, "a rug", "a piece the library does not describe: its name");
  assert.equal(newCharacterPart({ body: "child", name: "Child" }, []).made, "", "who a character is is the user's to say");
  const parts = [
    cleanPart({ shape: "asset", asset: "armchair" }),
    cleanPart({ shape: "asset", asset: "armchair", made: "an armchair" }),
    cleanPart({ shape: "character", body: "woman", made: "a woman" }),
    cleanPart({ shape: "character", body: "woman", made: "a nurse in scrubs" }),
    cleanPart({ shape: "box", name: "Floor" }),
    cleanPart({ shape: "asset", asset: "sofa", made: "mine" }),
    cleanPart({ shape: "asset", asset: "rug" }),
    cleanPart({ shape: "asset", asset: "sofa", name: "guest_sofa_2", made: "mine" }),
  ];
  assert.deepEqual(described(parts, () => null).map((p) => p.made), ["", "an armchair", "", "a nurse in scrubs", "", "mine", "", "mine"], "the pieces wait for the library");
  assert.deepEqual(described(parts, pieceOf).map((p) => p.made), [ARM, ARM, "", "a nurse in scrubs", "", "mine", "", "mine"]);
  assert.equal(described(parts, pieceOf)[5], parts[5], "what is written stays");
  assert.equal(described(parts, pieceOf)[7].name, "Guest sofa 2", "a name written as an id reads as a name");
  assert.equal(described([cleanPart({ shape: "box", name: "Guest_1" })], pieceOf)[0].name, "Guest 1");
});

test("a new scene reference is named after its picture, never a part's tag; a part's sheet takes six pictures, none twice", () => {
  const parts = [desk()];
  const a = newSceneRef({ file: "x1.png", url: "/m/x1.png", name: "Desk" }, parts, []);
  assert.equal(a.name, "desk-2", "a part's tag is not taken");
  assert.equal(newSceneRef({ file: "x2.png", url: "/m/x2.png", name: "Colour ID" }, parts, [a]).name, "colour-id-2");
  assert.equal(newSceneRef({ file: "x1.png", url: "/m/x1.png", name: "again" }, parts, [a]), null, "a picture is not twice a reference");
  assert.equal(newSceneRef({ url: "/bad" }, parts, []), null);
  assert.equal(newSceneRef({ file: "z.png", url: "/m/z.png" }, [], []).name, "z", "no name: the file's");
  assert.equal(addRef(Array.from({ length: 6 }, (_, i) => ({ file: `${i}.png`, url: `/m/${i}.png` })), { file: "7.png", url: "/m/7.png" }).length, 6);
  assert.deepEqual(addRef([{ file: "a.png", url: "/m/a.png" }], { file: "a.png", url: "/m/a.png" }).length, 1);
  assert.deepEqual(mentionsIn("The @Desk and @mood-board, not an@email"), ["desk", "mood-board", "email"]);
});

test("the strength: how far a render goes from the clay, in its words, the frame it sends and an open-weights edit's keep", () => {
  assert.equal(cleanDraft({}).strength, STRENGTH, "a draft starts at the middle");
  assert.equal(cleanDraft({ strength: 7 }).strength, 1, "kept within 0 to 1");
  assert.match(strengthWords(0.1), /Keep its camera, framing, layout and colours/);
  assert.match(strengthWords(0.5), /the flat colours only say which thing is which/);
  assert.match(strengthWords(0.9), /Keep only its camera, framing and layout: .*nothing of the clay, its flat colours or its plastic look remains/);
  assert.equal(plainFrame(0.6, ["id", "depth"]), true, "strong, with the colour ID to say who is who: the frame in plain clay");
  assert.equal(plainFrame(0.6, ["depth"]), false, "without the colour ID, the frame's colours say who is who");
  assert.equal(plainFrame(0.3, ["id"]), false, "weak: the clay's colours are wanted");
  assert.ok(keepOf(0) < keepOf(0.6) && keepOf(0.6) < keepOf(1) && keepOf(1) <= 0.98 && keepOf(0) >= 0.5, "the edit's keep grows with the strength, within what the server takes");
  const parts = [cleanPart({ shape: "box", name: "Body", color: "#4fb3a9", made: "brushed chrome" })];
  assert.doesNotMatch(framePrompt({ parts, maps: ["id"], strength: 0.2 }), /plain grey clay/);
  assert.match(framePrompt({ parts, maps: ["id"], strength: 0.9 }), /@frame is in plain grey clay: it gives the forms only\./);
  // a short name for the legend: the head of the library's description, the user's own words whole, someone by their name
  const pieceOf = () => ({ name: "Desk", description: "a rectangular writing desk with a flat top and a shallow drawer" });
  assert.equal(shortOf(cleanPart({ shape: "asset", asset: "desk", made: "a rectangular writing desk with a flat top and a shallow drawer" }), pieceOf), "a rectangular writing desk");
  assert.equal(shortOf(cleanPart({ shape: "asset", asset: "desk", made: "a mahogany desk with brass handles" }), pieceOf), "a mahogany desk with brass handles");
  assert.equal(shortOf(cleanPart({ shape: "character", body: "man", name: "Giorno", made: "a slim young man" })), "Giorno");
  assert.equal(shortOf(cleanPart({ shape: "character", body: "man", name: "Man 2", made: "a chef in whites" })), "a chef in whites", "a body's name says nothing: the words do");
});
