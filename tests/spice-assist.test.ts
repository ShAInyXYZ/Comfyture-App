// Paprika, the baby chameleon who runs Spice: what she is told (the shot, its footage and frames, the passes the six departments have made,
// the department open and its key) and how her answer is read, keeping only her own actions, each with only what it takes. No model is called.

import { test } from "node:test";
import assert from "node:assert/strict";
import { SPICE_BRIEF, SPICE_OPS, SPICE_TOOL, spicePrompt, readSpiceAnswer } from "../server/spice-assist.ts";

const say = (actions: unknown[], reply = "Done.") => JSON.stringify({ reply, actions });

const SPICE = {
  department: "fx", shot: "SH050 · Paprika's portal", shots: 5,
  footage: { kind: "video", name: "paprika-rooftop.mp4", width: 1920, height: 1080, fps: 24, first: 1001, last: 1120, range: [1001, 1120] as [number, number] },
  passes: [{ dept: "plate" }, { dept: "roto", note: "Paprika", from: 1001, to: 1120 }, { dept: "paint", note: "Lamp post removed", from: 1001, to: 1120, shown: false }],
  subjects: [{ name: "Paprika", tracked: true, clicks: 3 }],
  fx: { layers: [{ el: "flame", name: "Flame", x: 0.3, y: 0.7, size: 0.32, blend: "screen", made: true, light: 0.6, reach: 1.6, follow: true }, { el: "ai", name: "Portal · LTX", x: 0.7, y: 0.3, size: 0.5, blend: "normal", behind: true, made: false, from: 1030, to: 1120 }, { el: "smoke", name: "Smoke", x: 0.5, y: 0.5, size: 0.6, blend: "screen", light: 0, reach: 1.6 }], held: "Portal · LTX", matte: true, finish: { bloom: 0.45, vignette: 0.2 } },
  run: { label: "Make it", cost: 24, ready: true },
  today: 62, busy: ["light"],
};

test("Paprika is told the shot, its footage and frames, the passes, the department open and what it holds, the key's price, and the talk so far", () => {
  const text = spicePrompt(SPICE, [{ role: "user", text: "a portal behind her" }, { role: "assistant", text: "Set up.", did: ["Layer: Portal"] }, { role: "user", text: "make it" }]);
  for (const piece of ["SH050 · Paprika's portal (5 shots in all)", "DEPARTMENT OPEN: fx", "THE FOOTAGE: a clip paprika-rooftop.mp4, 1920 × 1080, 24 fps, frames 1001 to 1120", "paint (Lamp post removed), frames 1001-1120, hidden", "Paprika (cut out, 3 clicks)", "FX LAYERS (bottom first): Flame (flame, at 0.30 0.70, size 0.32, screen, light 0.60, reach 1.6, follows the subject); Portal · LTX (ai, at 0.70 0.30, size 0.50, normal, behind the people, not made yet, frames 1030-1120); Smoke (smoke, at 0.50 0.50, size 0.60, screen). HELD: Portal · LTX.", "FX FINISH (the whole shot): bloom 0.45, vignette 0.20.", "ai:portal", "spark-portal", "\"Make it\"", "about 24 credits", "WORKING NOW: light", "CREDITS SPENT TODAY: 62", "Paprika: Set up. [the app did: Layer: Portal]", "User: make it"]) assert.ok(text.includes(piece), piece);
  assert.ok(spicePrompt({}, []).includes("THE FOOTAGE: none yet"), "an empty summary is read as no footage");
  assert.ok(spicePrompt({ ...SPICE, run: { label: "Remove it", ready: false, why: "Say what to remove first" } }, []).includes("missing something: Say what to remove first"));
  assert.ok(spicePrompt({ ...SPICE, run: { label: "Bake the layers", free: true, ready: true } }, []).includes("runs free, on this machine"));
  assert.ok(spicePrompt({ ...SPICE, fx: { layers: [], matte: false } }, []).includes("FX LAYERS: none yet") && spicePrompt({ ...SPICE, fx: { layers: [], matte: false } }, []).includes("ROTO HOLDS NOBODY YET"));
});

test("Paprika's answer: her ten actions, each with only what it takes, every number within its range, run once and last", () => {
  const out = readSpiceAnswer(say([
    { op: "run" },
    { op: "open", department: "roto" },
    { op: "open", department: "kitchen" },
    { op: "trim", in: 1010, out: 5000 },
    { op: "subject", name: "  the frog   on the stage " },
    { op: "subject", name: "" },
    { op: "layer", element: "ai:portal", words: "a calm ring", from: 1030, to: 9999, x: 0.2, y: -4, size: 9, angle: 400.4, blend: "melt", opacity: 3, tint: "red", behind: true, motion: "dance", colour: "red" },
    { op: "layer", element: "meteor" },
    { op: "tweak" },
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
    { op: "subject", name: "the frog on the stage" },
    { op: "layer", element: "ai:portal", words: "a calm ring", from: 1030, to: 1120, x: 0.2, y: -0.5, size: 3, angle: 360, opacity: 1, behind: true },
    { op: "paint", what: "object", words: "the sign", engine: "obscura" },
  ], "a department that does not exist, an empty subject and an element that is not one are dropped; frames stay inside the footage");
  assert.deepEqual(readSpiceAnswer(say([{ op: "tweak", glow: 0.456, tint: "#FF8800", blend: "add", motion: "spin" }]), SPICE).actions, [{ op: "tweak", glow: 0.46, tint: "#ff8800", blend: "add", motion: "spin" }], "a tweak keeps what it changes");
  // the light a layer casts and how far it reaches: kept inside their ranges (0 to 1, 0.3 to 4), on a layer or a tweak
  assert.deepEqual(readSpiceAnswer(say([{ op: "tweak", light: 0.456, reach: 9 }, { op: "tweak", light: 7, reach: 0.1 }, { op: "tweak", light: "lots" }, { op: "layer", element: "fireball", light: 0.8, reach: 2.345 }]), SPICE).actions, [
    { op: "tweak", light: 0.46, reach: 4 },
    { op: "tweak", light: 1, reach: 0.3 },
    { op: "layer", element: "fireball", light: 0.8, reach: 2.35 },
  ], "a layer's light and reach are kept inside their ranges, and words are not a number");
  // follow is a yes or a no, on a layer or a tweak, and nothing else is one
  assert.deepEqual(readSpiceAnswer(say([{ op: "tweak", follow: true }, { op: "tweak", follow: false, glow: 0.2 }, { op: "tweak", follow: "yes" }, { op: "layer", element: "flame", follow: true, behind: true }]), SPICE).actions, [
    { op: "tweak", follow: true },
    { op: "tweak", glow: 0.2, follow: false },
    { op: "layer", element: "flame", behind: true, follow: true },
  ], "follow is kept as true or false and nothing else");
  // the finish of the whole shot (hers is `polish`: `finish` is Comp's): its bloom and its vignette, inside 0 to 1, one is enough, none is dropped
  assert.deepEqual(readSpiceAnswer(say([{ op: "polish", bloom: 0.456, vignette: 3 }, { op: "polish", vignette: -2 }, { op: "polish" }, { op: "polish", bloom: "much", tint: "#fff" }]), SPICE).actions, [
    { op: "polish", bloom: 0.46, vignette: 1 },
    { op: "polish", vignette: 0 },
  ], "the finish keeps only the bloom and the vignette, each from 0 to 1");
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

test("her brief teaches each of her eleven actions, tells her what she cannot do, and her tool answers with exactly those", () => {
  assert.equal(SPICE_OPS.length, 11);
  for (const op of SPICE_OPS) assert.ok(new RegExp(`^- ${op} \\{`, "m").test(SPICE_BRIEF), `${op} is in the brief`);
  // the light a layer casts, how far it reaches and the shot's own finish (bloom, vignette: Fx's, told apart from Comp's `finish`)
  assert.ok(/layer \{[^}]*\blight, reach\b/.test(SPICE_BRIEF) && /light 0 to 1: the light it casts on the shot and the people/.test(SPICE_BRIEF) && /reach 0\.3 to 4/.test(SPICE_BRIEF), "she knows a layer can shine and how far");
  assert.ok(/layer \{[^}]*\bfollow, tint\b/.test(SPICE_BRIEF) && /follow true: stays on Roto's subject as it moves \(clips\)/.test(SPICE_BRIEF), "she knows a layer can stay on Roto's subject");
  assert.ok(/^- polish \{bloom, vignette\}: Fx's whole-shot finish \(not Comp's\)/m.test(SPICE_BRIEF), "she knows the shot has a bloom and a vignette of its own");
  const fields = SPICE_TOOL.input_schema.properties.actions.items.properties as Record<string, { description?: string }>;
  for (const k of ["light", "reach", "follow", "bloom", "vignette"]) assert.ok(fields[k]?.description, `her tool has ${k}`);
  assert.equal((fields.follow as any).type, "boolean", "follow is a yes or a no");
  for (const w of ["plate", "roto", "paint", "gen", "light", "fx", "comp", "1001"]) assert.ok(SPICE_BRIEF.includes(w), `she knows ${w}`);
  assert.ok(/cannot click in the viewer, paint a mask or import a file/.test(SPICE_BRIEF), "the user's own hands stay theirs");
  assert.deepEqual(SPICE_TOOL.input_schema.properties.actions.items.properties.op.enum, [...SPICE_OPS]);
  assert.deepEqual(SPICE_TOOL.input_schema.required, ["reply", "actions"]);
});

test("a summary with junk in its lists is read as far as it makes sense, and never thrown at", () => {
  const junk: any = { department: "fx", passes: [null, 5, "x", { dept: "paint" }], subjects: "none", footage: { range: "all" }, run: null, busy: [null, "light"], fx: [] };
  assert.ok(spicePrompt(junk, [{ role: "user", text: "hi" }]).includes("paint"));
  assert.deepEqual(readSpiceAnswer(say([{ op: "open", department: "light" }, { op: "run" }]), junk).actions, [{ op: "open", department: "light" }, { op: "run" }]);
  for (const nothing of [{}, { passes: 5, footage: 5 }, { department: 7 }]) assert.deepEqual(readSpiceAnswer(say([{ op: "layer", element: "flame", from: 1050 }]), nothing as any).actions.map((a: any) => a.op), ["layer"], "frames are kept inside the footage, which is at least its first frame");
});

test("Gen: she may set up only a tool the page listed, with its words, a strength in 0 to 2, seconds in 1 to 10 and a size of draft or standard", () => {
  const gen = { tools: [{ id: "deblur", name: "Deblur", family: "restore", about: "Sharpens a soft clip" }, { id: "outpaint", name: "Outpaint", family: "frame", about: "Widens the frame", needs: ["mask"] }], tool: "deblur" };
  const out = readSpiceAnswer(say([
    { op: "gen", tool: "deblur", words: "  Sharpen   the footage ", strength: 9, seconds: 40, size: "standard" },
    { op: "gen", tool: "not-a-tool", words: "x" },
    { op: "gen", words: "no tool" },
    { op: "gen", tool: "outpaint", size: "huge", seconds: 0 },
    { op: "run" },
  ]), { department: "gen", gen } as any);
  assert.deepEqual(out.actions, [
    { op: "gen", tool: "deblur", words: "Sharpen the footage", strength: 2, seconds: 10, size: "standard" },
    { op: "gen", tool: "outpaint", seconds: 1 },
    { op: "run" },
  ]);
  const p = spicePrompt({ department: "gen", gen } as any, [{ role: "user", text: "sharpen it" }]);
  assert.match(p, /THE IC-LORA TOOLS[^:]*: deblur = Deblur, restore, Sharpens a soft clip \| outpaint = Outpaint, frame, Widens the frame \[needs mask\]/);
  assert.match(p, /GEN HOLDS: tool deblur/);
});
