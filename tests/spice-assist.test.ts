// Paprika, the baby chameleon who runs Spice: what she is told (the shot, its footage and frames, the passes the six departments have made,
// the department open and its key) and how her answer is read, keeping only her own actions, each with only what it takes. No model is called.

import { test } from "node:test";
import assert from "node:assert/strict";
import { SPICE_BRIEF, SPICE_OPS, SPICE_TOOL, spicePrompt, readSpiceAnswer } from "../server/spice-assist.ts";

const say = (actions: unknown[], reply = "Done.") => JSON.stringify({ reply, actions });

const SPICE = {
  department: "fx", shot: "SH010 · Rooftop portal", shots: 2,
  footage: { kind: "video", name: "rooftop.mp4", width: 1920, height: 1080, fps: 24, first: 1001, last: 1120, range: [1001, 1120] as [number, number] },
  passes: [{ dept: "plate" }, { dept: "roto", note: "Woman in raincoat", from: 1001, to: 1120 }, { dept: "paint", note: "Sign removed", from: 1001, to: 1120, shown: false }],
  subjects: [{ name: "Woman in raincoat", tracked: true, clicks: 3 }],
  fx: { element: "portal", from: 1030, to: 1120, seconds: 4, depth: "behind", intensity: 0.8, spill: 0.65, ease: "inout" },
  run: { label: "Add the portal", cost: 24, ready: true },
  today: 62, busy: ["light"],
};

test("Paprika is told the shot, its footage and frames, the passes, the department open and what it holds, the key's price, and the talk so far", () => {
  const text = spicePrompt(SPICE, [{ role: "user", text: "a portal behind her" }, { role: "assistant", text: "Set up.", did: ["FX: Portal"] }, { role: "user", text: "make it" }]);
  for (const piece of ["SH010 · Rooftop portal (2 shots in all)", "DEPARTMENT OPEN: fx", "THE FOOTAGE: a clip rooftop.mp4, 1920 × 1080, 24 fps, frames 1001 to 1120", "paint (Sign removed), frames 1001-1120, hidden", "Woman in raincoat (cut out, 3 clicks)", "FX HOLDS: portal, frames 1030 to 1120 (4 s), behind", "\"Add the portal\"", "about 24 credits", "WORKING NOW: light", "CREDITS SPENT TODAY: 62", "Paprika: Set up. [the app did: FX: Portal]", "User: make it"]) assert.ok(text.includes(piece), piece);
  assert.ok(spicePrompt({}, []).includes("THE FOOTAGE: none yet"), "an empty summary is read as no footage");
  assert.ok(spicePrompt({ ...SPICE, run: { label: "Remove it", ready: false, why: "Say what to remove first" } }, []).includes("missing something: Say what to remove first"));
  assert.ok(spicePrompt({ ...SPICE, run: { label: "Add the sparks", free: true, ready: true } }, []).includes("runs free, on this machine"));
});

test("Paprika's answer: her eight actions, each with only what it takes, every number within its range, run once and last", () => {
  const out = readSpiceAnswer(say([
    { op: "run" },
    { op: "open", department: "roto" },
    { op: "open", department: "kitchen" },
    { op: "trim", in: 1010, out: 5000 },
    { op: "subject", name: "  the woman   in the raincoat " },
    { op: "subject", name: "" },
    { op: "fx", element: "portal", words: "a calm ring", from: 1030, to: 9999, depth: "front", intensity: 3, spill: 0.456, ease: "wobble", x: 0.2, y: -4, size: 0.01, colour: "red" },
    { op: "fx", element: "meteor" },
    { op: "paint", what: "object", words: "the sign", engine: "obscura" },
    { op: "paint", what: "brush", words: "x" },
    { op: "light", tool: "weather", weather: "snow", amount: 2, words: "ignored" },
    { op: "light", tool: "grade", grade: "noir", exposure: -3, saturation: 9 },
    { op: "light", tool: "relight", words: "golden hour" },
    { op: "finish", tool: "upscale", height: 1440 },
    { op: "finish", tool: "upscale", height: 999 },
    { op: "finish", tool: "slow", factor: 3, engine: "film" },
    { op: "finish", tool: "export", format: "webm" },
    { op: "run" },
  ], "A portal behind her, coming up."), SPICE);
  assert.equal(out.reply, "A portal behind her, coming up.");
  assert.deepEqual(out.actions.slice(0, 5), [
    { op: "open", department: "roto" },
    { op: "trim", in: 1010, out: 1120 },
    { op: "subject", name: "the woman in the raincoat" },
    { op: "fx", element: "portal", words: "a calm ring", from: 1030, to: 1120, depth: "front", intensity: 1, spill: 0.46, x: 0.2, y: 0, size: 0.1 },
    { op: "paint", what: "object", words: "the sign", engine: "obscura" },
  ], "a department that does not exist, an empty subject and an element that is not one are dropped; frames stay inside the footage");
  const all = readSpiceAnswer(say([
    { op: "light", tool: "weather", weather: "snow", amount: 2, words: "ignored" }, { op: "light", tool: "grade", grade: "noir", exposure: -3, saturation: 9 }, { op: "light", tool: "relight", words: "golden hour" },
    { op: "finish", tool: "upscale", height: 1440 }, { op: "finish", tool: "upscale", height: 999 }, { op: "finish", tool: "slow", factor: 3, engine: "film" }, { op: "finish", tool: "export", format: "webm" }, { op: "run" },
  ]), SPICE).actions;
  assert.deepEqual(all, [
    { op: "light", tool: "weather", weather: "snow", amount: 1 },
    { op: "light", tool: "grade", grade: "noir", exposure: -1, saturation: 3 },
    { op: "light", tool: "relight", words: "golden hour" },
    { op: "finish", tool: "upscale", height: 1440 },
    { op: "finish", tool: "upscale" },
    { op: "finish", tool: "slow", factor: 3, engine: "film" },
    { op: "finish", tool: "export", format: "webm" },
    { op: "run" },
  ]);
  assert.equal(out.actions.filter((a: any) => a.op === "run").length <= 1, true);
  assert.equal(readSpiceAnswer(say(Array.from({ length: 20 }, () => ({ op: "open", department: "fx" }))), SPICE).actions.length, 8, "a few actions at most");
  assert.deepEqual(readSpiceAnswer(say([{ op: "run" }]), {}).actions, [], "there is nothing to run before a department is open");
  assert.deepEqual(readSpiceAnswer(say([{ op: "run" }]), SPICE).actions, [{ op: "run" }], "the department that is open has its key");
  assert.deepEqual(readSpiceAnswer("Paprika is thinking.", SPICE), { reply: "Paprika is thinking.", actions: [] });
});

test("Paprika's reader accepts only her own actions, and the Cut's trim is not hers without frames", () => {
  const foreign = [{ do: "roll" }, { op: "make_it" }, { op: "pick_trend", trend: "hotel-lobby" }, { op: "edit_text", layer: "headline", text: "x" }, { op: "pick_tool", tool: "cutout" }, { op: "camera_move", args: { move: "push-in" } }, { op: "render" }, { op: "rename", name: "x" }, { op: "trim", clip: 1, seconds: 3 }];
  assert.deepEqual(readSpiceAnswer(say(foreign), SPICE).actions, []);
  assert.deepEqual(readSpiceAnswer(say([...foreign, { op: "open", department: "paint" }]), SPICE).actions, [{ op: "open", department: "paint" }]);
});

test("her brief teaches each of her eight actions, tells her what she cannot do, and her tool answers with exactly those", () => {
  assert.equal(SPICE_OPS.length, 8);
  for (const op of SPICE_OPS) assert.ok(new RegExp(`^- ${op} \\{`, "m").test(SPICE_BRIEF), `${op} is in the brief`);
  for (const w of ["plate", "roto", "paint", "light", "fx", "comp", "1001"]) assert.ok(SPICE_BRIEF.includes(w), `she knows ${w}`);
  assert.ok(/cannot click in the viewer, paint a mask or import a file/.test(SPICE_BRIEF), "the user's own hands stay theirs");
  assert.deepEqual(SPICE_TOOL.input_schema.properties.actions.items.properties.op.enum, [...SPICE_OPS]);
  assert.deepEqual(SPICE_TOOL.input_schema.required, ["reply", "actions"]);
});

test("a summary with junk in its lists is read as far as it makes sense, and never thrown at", () => {
  const junk: any = { department: "fx", passes: [null, 5, "x", { dept: "paint" }], subjects: "none", footage: { range: "all" }, run: null, busy: [null, "light"], fx: [] };
  assert.ok(spicePrompt(junk, [{ role: "user", text: "hi" }]).includes("paint"));
  assert.deepEqual(readSpiceAnswer(say([{ op: "open", department: "light" }, { op: "run" }]), junk).actions, [{ op: "open", department: "light" }, { op: "run" }]);
  for (const nothing of [{}, { passes: 5, footage: 5 }, { department: 7 }]) assert.deepEqual(readSpiceAnswer(say([{ op: "fx", element: "portal", from: 1050 }]), nothing as any).actions.map((a: any) => a.op), ["fx"], "frames are kept inside the footage, which is at least its first frame");
});
