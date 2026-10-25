// Crumpet, the baby beaver who is Toaster's model maker: what he is told (the scene, the camera, the catalogue, the talk) and how his answer
// is read, keeping only his own actions, each with only what it takes. No model is called.

import { test } from "node:test";
import assert from "node:assert/strict";
import { TOASTER_BRIEF, TOASTER_OPS, TOASTER_TOOL, toasterPrompt, readToasterAnswer, TOASTER_WRITE_BRIEF, writePrompt, readImprovedPrompt } from "../server/toaster-assist.ts";

const say = (actions: unknown[], reply = "Done.") => JSON.stringify({ reply, actions });

const SCENE = {
  draft: "Study", parts: [
    { name: "Desk", kind: "piece", piece: "desk", color: "brown", size: [1.4, 0.75, 0.7], at: [0, -1], y: 0, turn: 0, made: "oak" },
    { name: "Ava", kind: "character", body: "woman", pose: "sit-desk", color: "teal", size: [0.5, 1.2, 0.5], at: [0, -0.4], y: 0, turn: 180, hidden: true },
    { name: "Crate", kind: "shape", shape: "box", color: "grey", size: [0.5, 0.5, 0.5], at: [1, 1], y: 0, turn: 45 },
  ],
  selected: ["Desk"], camera: { from: [0, 1.6, 4], at: [0, 0.8, 0], frame: "16:9" }, words: { what: "a study", scene: "warm light" },
  renders: 2, sheets: 2, models: 0,
};

test("the brief names Crumpet and Toaster and none of the other products", () => {
  assert.ok(TOASTER_BRIEF.includes("Crumpet") && TOASTER_BRIEF.includes("Toaster") && TOASTER_BRIEF.includes("the Stage's library"));
  for (const other of ["Kitchen", "Mixer", "Jam", "Macaron", "Spice", "Utensils"]) assert.ok(!TOASTER_BRIEF.includes(other), other);
});

test("the tool lists exactly his ops", () => {
  assert.equal(TOASTER_TOOL.name, "toaster_answer");
  assert.deepEqual(TOASTER_TOOL.input_schema.properties.actions.items.properties.op.enum, [...TOASTER_OPS]);
  assert.deepEqual([...TOASTER_OPS], ["add", "set", "remove", "clear", "camera", "words", "toast", "model3d"]);
});

test("Crumpet is told the scene, the camera, the catalogue and the talk so far", () => {
  const text = toasterPrompt(SCENE, [{ role: "user", text: "a chair for her" }, { role: "assistant", text: "Here.", did: ["Added a chair"] }, { role: "user", text: "turn it" }], { picture: true });
  for (const piece of ["THE SCENE: Study, 3 parts", "- Desk: piece desk, brown, size 1.4, 0.75, 0.7, at 0, -1, y 0, turn 0, made: oak", "character woman, pose sit-desk", "hidden", "shape box", "SELECTED: Desk", "from 0, 1.6, 4, looking at 0, 0.8, 0, frame 16:9", "2 renders, 2 object sheets", "A PHOTO IS ATTACHED", "office-chair", "woman 1.66 m", "Shapes: box", "Colours: grey, cream", "Crumpet: Here. [the app did: Added a chair]", "User: turn it"]) assert.ok(text.includes(piece), piece);
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
    { op: "model3d" },
    { op: "toast" },
    { op: "add", kind: "shape", shape: "dome" },
    { op: "paint" },
  ]), SCENE);
  assert.deepEqual(out.actions, [
    { op: "set", part: "Desk", at: [60, -60], y: 60, turn: 90, size: [0.01, 60, 1], color: "red" },
    { op: "add", kind: "shape", shape: "box", scale: 20 },
    { op: "add", kind: "shape", shape: "dome" },
    { op: "model3d" },
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

test("an answer in words alone builds nothing and says so; actions sent as a string of JSON are read; a camera aimed at a part is kept", () => {
  const words = readToasterAnswer("I rebuilt the room around the desk, ready to toast!", SCENE);
  assert.deepEqual(words.actions, []);
  assert.doesNotMatch(words.reply, /rebuilt/, "a claim of building that built nothing is not passed on");
  const stringy = readToasterAnswer(JSON.stringify({ reply: "Done.", actions: JSON.stringify([{ op: "set", part: "Desk", turn: 90 }]) }), SCENE);
  assert.deepEqual(stringy.actions, [{ op: "set", part: "Desk", turn: 90 }]);
  const aimed = readToasterAnswer(say([{ op: "camera", subject: "desk", side: "back", height: 1.3, margin: 9, lens: 35, frame: "16:9" }]), SCENE).actions[0];
  assert.deepEqual(aimed, { op: "camera", subject: "Desk", side: "back", height: 1.3, margin: 4, frame: "16:9", lens: 35 });
  assert.equal(readToasterAnswer(say([{ op: "camera", subject: "Nobody" }]), SCENE).actions.length, 0, "a camera on nobody is dropped");
});

test("a character's pose is tweaked by the Stage's sliders, each within its range; what is not a slider is dropped", () => {
  const out = readToasterAnswer(say([
    { op: "set", part: "Ava", tweak: { look: 30, nod: -999, wiggle: 5, crouch: 0.4 } },
    { op: "add", kind: "character", body: "man", pose: "sit", name: "Boss", tweak: { lean: 12 } },
    { op: "set", part: "Ava", tweak: { wiggle: 5 } },
  ]), SCENE).actions;
  assert.deepEqual(out[0], { op: "set", part: "Ava", tweak: { look: 30, nod: -40, crouch: 0.4 } });
  assert.deepEqual(out[1].tweak, { lean: 12 });
  assert.equal(out.length, 2, "a change with no slider left is no change");
  const prompt = toasterPrompt({ ...SCENE, parts: [{ ...SCENE.parts[1], tweak: { look: 30 }, edited: true }] }, [{ role: "user", text: "go" }]);
  assert.match(prompt, /character woman, pose sit-desk, tweaked look 30, joints edited by hand/);
});

test("Crumpet is told each part's @tag and its pictures, and that the sheet words are made", () => {
  const text = toasterPrompt({ parts: [{ name: "Desk", tag: "desk", kind: "piece", piece: "desk", color: "brown", size: [1.4, 0.75, 0.7], at: [0, -1], y: 0, turn: 0, made: "a walnut desk", pictures: 2 }, { name: "Box", tag: "bad tag!", kind: "shape", shape: "box" }] }, [{ role: "user", text: "hi" }]);
  assert.match(text, /- Desk @desk: piece desk, brown/);
  assert.match(text, /made: a walnut desk, pictures: 2/);
  assert.match(text, /- Box: shape box/, "a tag that is not one is not told");
  assert.match(text, /SHEETS\..*made is the part's sheet words.*what and scene may name parts by their @tag/s);
  assert.ok(TOASTER_BRIEF.length <= 3000, "the brief stays short");
  const answer = readToasterAnswer(JSON.stringify({ reply: "ok", actions: [{ op: "add", kind: "shape", shape: "box", name: "Table", made: "m".repeat(500) }] }));
  assert.equal(answer.actions[0].made.length, 400);
});

const FACTS = {
  model: { name: "Qwen 3.0 Pro", pictures: 6 },
  pictures: [
    { name: "frame", kind: "frame", plain: true }, { name: "colour-id", kind: "map", map: "id" }, { name: "depth", kind: "map", map: "depth" },
    { name: "mood", kind: "look" }, { name: "crumpet", kind: "part", of: "Crumpet", sheet: "character" }, { name: "bad name", kind: "look" },
  ],
  what: "A boss's office", scene: "Dusk, warm lamp, anime style",
  strength: { percent: 80, band: "high" },
  who: [
    { colour: "tan", people: false, things: [{ name: "a mahogany desk", words: "a walnut desk with brass handles", count: 2 }] },
    { colour: "sky blue", people: true, things: [{ name: "Crumpet", words: "a baby beaver, brown fur", pictures: ["crumpet"] }] },
  ],
};

test("Write: the writer is told the model, the pictures in order with their roles, the strength and who is what", () => {
  const text = writePrompt({ facts: FACTS, prompt: "Make it moody.", refs: [{ name: "frame" }, { name: "mood" }] });
  assert.match(text, /THE IMAGE MODEL: Qwen 3\.0 Pro, takes 6 pictures\./);
  const order = [...text.matchAll(/^\d\. @([\w-]+): (.*)$/gm)].map((m) => m[1]);
  assert.deepEqual(order, ["frame", "colour-id", "depth", "mood", "crumpet"], "in order; a bad name is left out");
  assert.match(text, /1\. @frame: the clay frame, in plain grey clay/);
  assert.match(text, /2\. @colour-id: the colour ID map/);
  assert.match(text, /4\. @mood: a reference for the look/);
  assert.match(text, /5\. @crumpet: pictures of Crumpet \(character sheet\)/);
  assert.match(text, /THE LOOK: Dusk, warm lamp, anime style/);
  assert.match(text, /THE STRENGTH: 80%, high: only the layout and the forms stay/);
  assert.ok(text.indexOf("- sky blue: Crumpet") < text.indexOf("- tan: a mahogany desk"), "people first");
  assert.match(text, /- sky blue: Crumpet\. Their words: a baby beaver, brown fur\. Pictures: @crumpet/);
  assert.match(text, /- tan: a mahogany desk \(x2\)\. Their words: a walnut desk/);
  assert.match(text, /THE PICTURES YOU SEE: @frame, @mood\./);
  assert.match(text, /THE USER'S OWN PROMPT TO IMPROVE:\nMake it moody\./);
  assert.ok(!writePrompt({ facts: FACTS }).includes("OWN PROMPT"));
  assert.match(writePrompt({}), /You see no pictures: work from the facts/);
  assert.match(writePrompt({}), /nothing named/);
  assert.match(writePrompt({ facts: { strength: { percent: 20 } } }), /low: keep the clay's colours/);
  assert.ok(TOASTER_WRITE_BRIEF.length > 600 && TOASTER_WRITE_BRIEF.length < 2200, "a brief of a few lines");
  for (const need of [/clay blockout/, /THE MODEL'S GUIDE/, /@name exactly as given/, /only the pictures listed/, /layout, the camera/, /never a default "photograph"/, /Low: keep the clay's colours/, /never by ids/, /likeness/, /Invent nothing/, /Answer with the prompt only/]) assert.match(TOASTER_WRITE_BRIEF, need);
  assert.ok(TOASTER_BRIEF.length <= 3000, "Crumpet's brief stays under its cap");
});

test("The writer's reply is trimmed, unfenced, unquoted, without a leading Prompt: and capped; nothing is empty", () => {
  assert.equal(readImprovedPrompt('```text\n"Render @frame as a photo."\n```'), "Render @frame as a photo.");
  assert.equal(readImprovedPrompt("Prompt: Render @frame."), "Render @frame.");
  assert.equal(readImprovedPrompt("**Prompt:** \"Render @frame.\""), "Render @frame.");
  assert.equal(readImprovedPrompt("  A  b\n c "), "A b c");
  assert.equal(readImprovedPrompt("x".repeat(3000)).length, 1500);
  assert.equal(readImprovedPrompt("  "), "");
});

test("Crumpet's names are a person's: underscores become spaces and the first letter a capital, in new names and in the parts he names", () => {
  const answer = readToasterAnswer(JSON.stringify({ reply: "ok", actions: [
    { op: "add", kind: "piece", piece: "sofa", name: "guest_sofa", made: "a charcoal leather chesterfield sofa" },
    { op: "set", part: "Guest_sofa", color: "red" },
    { op: "set", part: "boss_desk", made: "a walnut desk" },
  ] }), { parts: [{ name: "Boss desk" }] });
  assert.equal(answer.actions[0].name, "Guest sofa");
  assert.equal(answer.actions[1].part, "Guest sofa");
  assert.equal(answer.actions[2].part, "Boss desk");
  assert.match(TOASTER_BRIEF + toasterPrompt({}, [{ role: "user", text: "x" }]), /full description[\s\S]*never by its name/);
  assert.ok(TOASTER_BRIEF.length <= 3000);
});
