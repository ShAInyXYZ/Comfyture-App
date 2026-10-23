// Crumpet, the baby beaver who is Toaster's model maker: what he is told (the scene, the camera, the catalogue, the talk) and how his answer
// is read, keeping only his own actions, each with only what it takes. No model is called.

import { test } from "node:test";
import assert from "node:assert/strict";
import { TOASTER_BRIEF, TOASTER_OPS, TOASTER_TOOL, toasterPrompt, readToasterAnswer } from "../server/toaster-assist.ts";

const say = (actions: unknown[], reply = "Done.") => JSON.stringify({ reply, actions });

const SCENE = {
  draft: "Study", parts: [
    { name: "Desk", kind: "piece", piece: "desk", color: "brown", size: [1.4, 0.75, 0.7], at: [0, -1], y: 0, turn: 0, made: "oak" },
    { name: "Ava", kind: "character", body: "woman", pose: "sit-desk", color: "teal", size: [0.5, 1.2, 0.5], at: [0, -0.4], y: 0, turn: 180, hidden: true },
    { name: "Crate", kind: "shape", shape: "box", color: "grey", size: [0.5, 0.5, 0.5], at: [1, 1], y: 0, turn: 45 },
  ],
  selected: ["Desk"], camera: { from: [0, 1.6, 4], at: [0, 0.8, 0], frame: "16:9" }, words: { what: "a study", scene: "warm light" },
  renders: 2, turnaround: true, model3d: false,
};

test("the brief names Crumpet and Toaster and none of the other products", () => {
  assert.ok(TOASTER_BRIEF.includes("Crumpet") && TOASTER_BRIEF.includes("Toaster") && TOASTER_BRIEF.includes("the Stage's library"));
  for (const other of ["Kitchen", "Mixer", "Jam", "Macaron", "Spice", "Utensils"]) assert.ok(!TOASTER_BRIEF.includes(other), other);
});

test("the tool lists exactly his ops", () => {
  assert.equal(TOASTER_TOOL.name, "toaster_answer");
  assert.deepEqual(TOASTER_TOOL.input_schema.properties.actions.items.properties.op.enum, [...TOASTER_OPS]);
  assert.deepEqual([...TOASTER_OPS], ["add", "set", "remove", "clear", "camera", "words", "toast", "turnaround", "model3d"]);
});

test("Crumpet is told the scene, the camera, the catalogue and the talk so far", () => {
  const text = toasterPrompt(SCENE, [{ role: "user", text: "a chair for her" }, { role: "assistant", text: "Here.", did: ["Added a chair"] }, { role: "user", text: "turn it" }], { picture: true });
  for (const piece of ["THE SCENE: Study, 3 parts", "- Desk: piece desk, brown, size 1.4, 0.75, 0.7, at 0, -1, y 0, turn 0, made of oak", "character woman, pose sit-desk", "hidden", "shape box", "SELECTED: Desk", "from 0, 1.6, 4, looking at 0, 0.8, 0, frame 16:9", "2 renders, a turnaround", "A PHOTO IS ATTACHED", "office-chair", "woman 1.66 m", "Shapes: box", "Colours: grey, cream", "Crumpet: Here. [the app did: Added a chair]", "User: turn it"]) assert.ok(text.includes(piece), piece);
  assert.ok(/Poses, Sit: .*sit/.test(text), "a sit pose");
  assert.ok(toasterPrompt({}, []).includes("empty") && toasterPrompt({}, []).includes("NO PHOTO"));
});

test("his answer: a full scene is kept, names added earlier can be set, one offer last", () => {
  const out = readToasterAnswer(say([
    { op: "clear" },
    { op: "add", kind: "piece", piece: "office-chair", name: "Chair", at: [0, 0.5], turn: -90, color: "charcoal", made: "mesh" },
    { op: "add", kind: "character", body: "man", pose: "sit-desk", name: "Sam", scale: 1.1 },
    { op: "add", kind: "shape", shape: "cylinder", name: "Lamp", size: [0.2, 0.5, 0.2], y: 0.75 },
    { op: "set", part: "chair", turn: 90, hidden: false },
    { op: "camera", view: "front", frame: "4:5" },
    { op: "camera", from: [0, 1.6, 4], to: [0, 0.8, 0] },
    { op: "words", what: "an office", scene: "soft light" },
    { op: "toast" },
  ], "Built."), {});
  assert.equal(out.reply, "Built.");
  assert.deepEqual(out.actions, [
    { op: "clear" },
    { op: "add", kind: "piece", piece: "office-chair", at: [0, 0.5], turn: -90, color: "charcoal", made: "mesh", name: "Chair" },
    { op: "add", kind: "character", body: "man", pose: "sit-desk", scale: 1.1, name: "Sam" },
    { op: "add", kind: "shape", shape: "cylinder", y: 0.75, size: [0.2, 0.5, 0.2], name: "Lamp" },
    { op: "set", part: "Chair", turn: 90, hidden: false },
    { op: "camera", view: "front", frame: "4:5" },
    { op: "camera", from: [0, 1.6, 4], at: [0, 0.8, 0] },
    { op: "words", what: "an office", scene: "soft light" },
    { op: "toast" },
  ]);
});

test("bad answers are dropped or clamped", () => {
  const out = readToasterAnswer(say([
    { op: "add", kind: "piece", piece: "unicorn-statue" },
    { op: "add", kind: "character", body: "man", pose: "moonwalk" },
    { op: "set", part: "Nobody", color: "red" },
    { op: "set", part: "DESK", color: "#ff0000" },
    { op: "set", part: "desk", at: [500, -500], y: 99, turn: 450, size: [0, 100, 1], color: "red" },
    { op: "add", kind: "shape", shape: "box", scale: 99, color: "#00ff00" },
    { op: "clear" },
    { op: "turnaround" },
    { op: "model3d" },
    { op: "add", kind: "shape", shape: "dome" },
    { op: "paint" },
  ]), SCENE);
  assert.deepEqual(out.actions, [
    { op: "set", part: "Desk", at: [60, -60], y: 60, turn: 90, size: [0.01, 60, 1], color: "red" },
    { op: "add", kind: "shape", shape: "box", scale: 20 },
    { op: "add", kind: "shape", shape: "dome" },
    { op: "turnaround" },
  ]);
  assert.deepEqual(readToasterAnswer(say([{ op: "toast" }, { op: "add", kind: "shape", shape: "box" }, { op: "model3d" }]), SCENE).actions, [{ op: "add", kind: "shape", shape: "box" }, { op: "toast" }], "the offer is moved last");
  assert.equal(readToasterAnswer(say(Array.from({ length: 60 }, () => ({ op: "add", kind: "shape", shape: "box" }))), SCENE).actions.length, 40);
  assert.equal(readToasterAnswer(say([], "x".repeat(900)), SCENE).reply.length, 600);
  const bad = readToasterAnswer("sorry, no json", SCENE);
  assert.deepEqual(bad.actions, []);
  assert.ok(bad.reply.length > 0);
  assert.deepEqual(readToasterAnswer(say([{ op: "remove", part: "crate" }, { op: "set", part: "Crate", color: "red" }]), SCENE).actions, [{ op: "remove", part: "Crate" }], "a part removed can no longer be set");
});

test("a part faces a point or another part (even one added later in the answer); the camera takes a lens, goes back to a slot, or is kept in one", () => {
  const scene = { ...SCENE, cameras: [{ name: "Hero", from: [1, 1.5, 3], at: [0, 1, 0], frame: "16:9", focal: 35 }] };
  const out = readToasterAnswer(say([
    { op: "add", kind: "piece", piece: "armchair", name: "Chair A", at: [1, 1], face: "Desk B" },
    { op: "add", kind: "piece", piece: "desk", name: "Desk B", at: [0, -1], face: [0, 5] },
    { op: "set", part: "Crate", face: "Nobody" },
    { op: "camera", from: [2, 1.4, 3], to: [0, 0.8, 0], lens: 400, save: "Wide corner" },
    { op: "camera", slot: "hero" },
    { op: "camera", slot: "No such camera" },
  ]), scene).actions;
  assert.equal(out[0].face, "Desk B", "a face named after a part added later is kept");
  assert.deepEqual(out[1].face, [0, 5], "a face can be a point");
  assert.ok(!out.some((a) => a.op === "set" && a.part === "Crate"), "a face on nobody is dropped, and the set with it");
  assert.deepEqual(out[2], { op: "camera", from: [2, 1.4, 3], at: [0, 0.8, 0], lens: 200, save: "Wide corner" }, "the lens is kept within 14 to 200 mm");
  assert.deepEqual(out[3], { op: "camera", slot: "Hero" }, "a slot is named as it was saved");
  assert.equal(out.length, 4, "a slot nobody saved is dropped");
  const prompt = toasterPrompt(scene, [{ role: "user", text: "go" }]);
  assert.match(prompt, /SAVED CAMERAS: Hero \(from/);
  assert.match(prompt, /COMPOSING. A piece's front is the side it is used from/);
  assert.match(TOASTER_BRIEF, /turn or face/);
});

test("a part is placed by a relation: against a wall, near another on one of its sides with a gap, or on another; the parts named must exist", () => {
  const out = readToasterAnswer(say([
    { op: "add", kind: "piece", piece: "bookcase", name: "Books", against: "back" },
    { op: "add", kind: "piece", piece: "office-chair", name: "Seat", near: "Desk", side: "front", gap: 0.1 },
    { op: "add", kind: "piece", piece: "desk-lamp", name: "Lamp", on: "Desk" },
    { op: "add", kind: "piece", piece: "armchair", name: "Guest", near: "Nobody", side: "back" },
    { op: "set", part: "Crate", against: "ceiling" },
    { op: "add", kind: "piece", piece: "armchair", name: "Far", near: "Desk", side: "under", gap: 99 },
  ]), SCENE).actions;
  assert.deepEqual(out[0], { op: "add", kind: "piece", piece: "bookcase", name: "Books", against: "back" });
  assert.deepEqual(out[1], { op: "add", kind: "piece", piece: "office-chair", name: "Seat", near: "Desk", side: "front", gap: 0.1 });
  assert.deepEqual(out[2], { op: "add", kind: "piece", piece: "desk-lamp", name: "Lamp", on: "Desk" });
  assert.equal(out[3].near, undefined, "near a part nobody has is dropped (the page sets it down beside the others)");
  assert.ok(!out.some((a) => a.op === "set"), "a wall that is not one is dropped, and the change with it");
  assert.equal(out.at(-1).side, undefined, "a side that is not one is dropped");
  assert.equal(out.at(-1).gap, 5, "the gap is kept within 5 m");
  assert.match(TOASTER_BRIEF, /against \(back, left, right, front/);
});
