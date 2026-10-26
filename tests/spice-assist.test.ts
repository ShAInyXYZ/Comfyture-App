// Paprika's reader (server/spice-assist.ts): what she is told of the scenario, and her answer read whole and checked against it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SPICE_BRIEF, SPICE_OPS, SPICE_TOOL, spicePrompt, readSpiceAnswer, SPICE_READ_BRIEF, SPICE_READ_TOOL, readPrompt, readReadAnswer } from "../server/spice-assist.ts";

const SUMMARY = {
  scenario: "Truffle's Jam Heist",
  logline: "A raccoon, a jar of jam, a market yard.",
  shots: [{ id: "sh010", name: "SH010 · The yard", passes: 2, plate: true }, { id: "sh020", name: "SH020 · The lookout", passes: 0, plate: true }, { id: "sh030", name: "SH030", passes: 0, plate: false }],
  shot: { id: "sh010", name: "SH010 · The yard", about: "Truffle crosses the yard.", plate: { width: 1280, height: 704, seconds: 5 }, passes: [{ id: "p1", tool: "obscura", name: "Obscura", words: "the van" }, { id: "p2", tool: "day-to-night", name: "Day to night", words: "night" }], looking: "p2", bin: 1 },
  tools: [
    { id: "deblur", name: "Deblur", family: "restore", about: "Sharpens lens blur", takes: ["words"], status: "verified" },
    { id: "outpaint", name: "Outpaint", family: "frame", about: "Widens the frame", takes: ["aspect"], status: "verified" },
    { id: "upscale", name: "Upscale", family: "upscale", about: "SeedVR2", takes: ["height"], status: "verified" },
    { id: "cutout", name: "Cut out", family: "matte", about: "SAM3", takes: ["words"], status: "verified" },
    { id: "inpaint", name: "Inpaint", family: "frame", about: "Fills a box", takes: ["words", "region"], status: "verified" },
    { id: "ingredients", name: "Ingredients", family: "more", about: "Needs a sheet", takes: ["words"], status: "untested", needs: ["a reference sheet"] },
  ],
  tool: { id: "deblur", words: "", strength: null, size: "draft", seconds: 5 },
  run: { label: "Deblur", cost: 6, ready: true, why: "" },
  today: 12,
};

test("her brief names every op she has, and stays within the pet brief's room", () => {
  for (const op of SPICE_OPS) assert.ok(SPICE_BRIEF.includes(`- ${op} {`), `the brief teaches ${op}`);
  assert.ok(SPICE_BRIEF.length < 3000, `the brief is ${SPICE_BRIEF.length} characters`);
  assert.deepEqual(SPICE_TOOL.input_schema.properties.actions.items.properties.op.enum, [...SPICE_OPS]);
});

test("what she is told: the shots by id, the chain of the shot open, the tools by id, the tool picked and the key's price", () => {
  const p = spicePrompt(SUMMARY as any, [{ role: "user", text: "take the van out" }]);
  assert.match(p, /THE SHOTS \(id = name, passes\): sh010 = SH010 · The yard, 2 passes; sh020 = SH020 · The lookout, 0 passes; sh030 = SH030, 0 passes, no plate yet/);
  assert.match(p, /ITS PASSES, in order \(id = tool, words\): p1 = Obscura, "the van"; p2 = Day to night, "night"\. LOOKING AT: p2/);
  assert.match(p, /1 take waits in the bin/);
  assert.match(p, /ingredients = Ingredients, more, Needs a sheet \[needs a reference sheet\]/);
  assert.match(p, /outpaint = Outpaint, frame, Widens the frame \[no words\]/);
  assert.match(p, /THE TOOL PICKED: deblur/);
  assert.match(p, /Running it costs about 6 credits/);
  assert.match(p, /CREDITS SPENT TODAY: 12/);
  assert.match(p, /User: take the van out/);
});

test("her answer is read whole: only her ops, only the ids listed, every number within its range, run once and last", () => {
  const reply = JSON.stringify({
    reply: "On it.",
    actions: [
      { op: "open", shot: "sh020" },
      { op: "open", shot: "nope" },
      { op: "look", pass: "p1" },
      { op: "look", pass: "zzz" },
      { op: "tool", tool: "outpaint", words: "ignored: it takes no words", aspect: 9, strength: 7, size: "huge", seconds: 40 },
      { op: "tool", tool: "upscale", height: 1080 },
      { op: "tool", tool: "upscale", height: 999 },
      { op: "tool", tool: "notatool" },
      { op: "tool", tool: "ingredients", words: "x" },
      { op: "shot", words: "Truffle runs", seconds: 30 },
      { op: "layer", element: "flame" },
      { op: "run" },
      { op: "run" },
    ],
  });
  const out = readSpiceAnswer(reply, SUMMARY as any);
  assert.equal(out.reply, "On it.");
  assert.deepEqual(out.actions, [
    { op: "open", shot: "sh020" },
    { op: "look", pass: "p1" },
    { op: "tool", tool: "outpaint", strength: 2, seconds: 10, aspect: 4 },
    { op: "tool", tool: "upscale", height: 1080 },
    { op: "tool", tool: "upscale" },
    { op: "tool", tool: "ingredients", words: "x" },
    { op: "shot", words: "Truffle runs", seconds: 10 },
    { op: "run" },
  ]);
});

test("run is dropped when nothing could run: a tool that needs more than a clip, no tool at all, or a shot without a plate", () => {
  const ask = (actions: unknown[], s: any = SUMMARY) => readSpiceAnswer(JSON.stringify({ reply: "", actions }), s).actions;
  assert.deepEqual(ask([{ op: "tool", tool: "ingredients" }, { op: "run" }]), [{ op: "tool", tool: "ingredients" }], "the last tool set up needs a sheet");
  assert.deepEqual(ask([{ op: "run" }], { ...SUMMARY, tool: { id: "" } }), [], "no tool picked");
  assert.deepEqual(ask([{ op: "run" }], { ...SUMMARY, shot: { ...SUMMARY.shot, plate: null } }), [], "no plate");
  assert.deepEqual(ask([{ op: "run" }]), [{ op: "run" }], "the tool picked runs on the shot open");
});

test("prose instead of JSON is answered as words, with no action", () => {
  const out = readSpiceAnswer("I'd widen it first.", SUMMARY as any);
  assert.equal(out.reply, "I'd widen it first.");
  assert.deepEqual(out.actions, []);
});

test("a chain she answers with: two to five steps, each a tool listed and runnable, with its words and size; a tool that needs more than a clip is dropped", () => {
  const reply = JSON.stringify({ reply: "Here is a chain.", actions: [{ op: "chain", title: "A night heist", steps: [{ tool: "deblur", words: "x", size: "standard", region: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } }, { tool: "ingredients", words: "no" }, { tool: "nope" }, { tool: "outpaint", words: "ignored", size: "huge", aspect: 2.39 }, { tool: "upscale" }, { tool: "cutout", words: "the frog" }, { tool: "inpaint", words: "a wall", region: { x: 0.6, y: 0.1, w: 0.25, h: 0.3 } }, { tool: "deblur" }] }, { op: "chain", steps: [{ tool: "ingredients" }] }] });
  const out = readSpiceAnswer(reply, SUMMARY as any);
  // (a box only on a tool that takes a region, an aspect only on one that widens)
  assert.deepEqual(out.actions, [{ op: "chain", title: "A night heist", steps: [{ tool: "deblur", words: "x", size: "standard" }, { tool: "outpaint", aspect: 2.39 }, { tool: "upscale" }, { tool: "cutout", words: "the frog" }, { tool: "inpaint", words: "a wall", region: { x: 0.6, y: 0.1, w: 0.25, h: 0.3 } }] }]);
  assert.ok(SPICE_BRIEF.includes("- chain {"));
});

test("Paprika's read: what she is told with the frame, and her answer checked against the tools", () => {
  const tools = SUMMARY.tools as any;
  const prompt = readPrompt({ name: "SH010 · The yard", about: "Truffle crosses the yard.", words: "a raccoon tiptoes", width: 1280, height: 704, seconds: 5 }, tools);
  assert.match(prompt, /THE SHOT: SH010 · The yard \(Truffle crosses the yard\.\), 1280 × 704, 5 s/);
  assert.match(prompt, /ROLLED BY LTX-2.5 FROM: "a raccoon tiptoes"/);
  assert.match(prompt, /deblur = Deblur, restore, Sharpens lens blur \[verified\]/);
  assert.match(prompt, /outpaint = Outpaint, frame, Widens the frame \[no words\] \[aspect\] \[verified\]/);
  assert.match(prompt, /inpaint = Inpaint, frame, Fills a box \[region\] \[verified\]/);
  assert.ok(!prompt.includes("ingredients ="), "a tool that needs more than a clip is not offered to her");
  assert.ok(SPICE_READ_BRIEF.length < 1500 && SPICE_READ_TOOL.input_schema.required.includes("suggestions"));
  const out = readReadAnswer(JSON.stringify({ read: "A wide shot of a market yard at golden hour; a raccoon with a jar.", off: "A white van is parked in the background.", question: "What do you want of it?", suggestions: [{ title: "Night heist", why: "The story is a heist.", steps: [{ tool: "deblur" }, { tool: "outpaint", size: "standard", aspect: 1 }, { tool: "inpaint", words: "the wall", region: { x: 0.7, y: 0.05, w: 0.2, h: 0.4 } }, { tool: "ingredients" }] }, { title: "Nothing", steps: [{ tool: "nope" }] }] }), tools);
  assert.equal(out.text, "A wide shot of a market yard at golden hour; a raccoon with a jar.");
  assert.equal(out.off, "A white van is parked in the background.");
  assert.equal(out.question, "What do you want of it?");
  assert.deepEqual(out.suggestions, [{ title: "Night heist", why: "The story is a heist.", steps: [{ tool: "deblur" }, { tool: "outpaint", size: "standard", aspect: 1 }, { tool: "inpaint", words: "the wall", region: { x: 0.7, y: 0.05, w: 0.2, h: 0.4 } }] }]);
  const prose = readReadAnswer("I see a yard.", tools);
  assert.equal(prose.text, "I see a yard.");
  assert.deepEqual(prose.suggestions, []);
});
