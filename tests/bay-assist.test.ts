// Paprika's side of the bay, with no model and no network: what she is told, and that her answer is read whole and checked (only her actions, only
// engines Spice lists for the stage or the page told her of, the plan bounded, run once and last).

import { test } from "node:test";
import assert from "node:assert/strict";
import { BAY_OPS, BAY_TOOL, BAY_BRIEF, bayPrompt, readBayAnswer } from "../server/bay-assist.ts";
import { STAGE_IDS, ENGINES } from "../web/js/spice2-model.js";

const summary = (extra = {}) => ({
  stage: "direct", shot: "yard", shots: 2, brief: "Taro carries a lantern; the van must go, then rain.",
  clip: { seconds: 10, width: 1920, height: 1080, fps: 24 },
  stages: STAGE_IDS.map((id) => ({ id, takes: id === "conform" ? 1 : 0 })),
  engines: [{ name: "api_google_gemini_omni_flash_1_1_edit", title: "Gemini", mode: "words", max: 10, partner: true, about: "Edits by words" }, { name: "api_newmaker_video_edit", title: "NewMaker", partner: true, about: "new" }],
  chosen: "api_google_gemini_omni_flash_1_1_edit", words: "", refs: 0, problems: [], price: 40, today: 12, busy: [], plan: [],
  ...extra,
});
const answer = (obj: unknown, s = summary()) => readBayAnswer(JSON.stringify(obj), s);

test("her tool and her brief name the same operations and every stage, and her brief lists the engines she picks from", () => {
  const ops = BAY_TOOL.input_schema.properties.actions.items.properties.op.enum;
  assert.deepEqual(ops, [...BAY_OPS]);
  for (const op of BAY_OPS) assert.ok(BAY_BRIEF.includes(`${op} {`) || BAY_BRIEF.includes(`- ${op}`), `the brief explains ${op}`);
  for (const id of STAGE_IDS) assert.ok(BAY_BRIEF.includes(id), `the brief names ${id}`);
  for (const t of ["Gemini Omni 1.1 Flash", "Beeble SwitchX", "IC-LoRA", "FastH3 OmniRef", "Mirelo"]) assert.ok(BAY_BRIEF.includes(t), t);
});

test("what she is told: the shot, its brief and clip, what each stage has made, the engines of the stage open, the price", () => {
  const p = bayPrompt(summary(), [{ role: "user", text: "make it rain" }]);
  assert.match(p, /THE SHOT: yard \(2 shots in all\)\. STAGE OPEN: direct/);
  assert.match(p, /the van must go/);
  assert.match(p, /THE CLIP: 10 s, 1920x1080, 24 fps/);
  assert.match(p, /MADE SO FAR: conform \(1 take\)/);
  assert.match(p, /- api_google_gemini_omni_flash_1_1_edit = Gemini \[words\], 10 s at most, partner \(paid\)/);
  assert.match(p, /about 40 credits/);
  assert.match(p, /USER: make it rain/);
  assert.match(bayPrompt(summary({ clip: null, stages: [] }), []), /nothing can run until one is brought/);
  assert.match(bayPrompt(summary({ price: null }), []), /partner price not known yet/);
  assert.match(bayPrompt(summary({ problems: ["Gemini takes 10 seconds at most"] }), []), /STANDING IN THE WAY: Gemini takes 10 seconds/);
});

test("her answer is read whole: her own actions with only what they take; anything else is dropped", () => {
  const out = answer({
    reply: "Seedance keeps the rest.",
    actions: [
      { op: "open", stage: "clean" },
      { op: "open", stage: "nonsense" },
      { op: "engine", stage: "direct", engine: "api_seedance2_5_video_editing" },
      { op: "engine", stage: "direct", engine: "utility_void_video_inpainting" },
      { op: "engine", stage: "direct", engine: "api_newmaker_video_edit" },
      { op: "engine", stage: "clean", engine: "api_newmaker_video_edit" },
      { op: "words", stage: "direct", text: "  A rainy   blue hour. " },
      { op: "words", stage: "direct", text: "" },
      { op: "source", stage: "control", from: "direct" },
      { op: "source", stage: "direct", from: "control" },
      { op: "source", stage: "direct", from: "direct" },
      { op: "source", stage: "clean", from: "clip" },
      { op: "delete_everything" },
      { op: "conform", junk: 1 },
    ],
  });
  assert.equal(out.reply, "Seedance keeps the rest.");
  assert.deepEqual(out.actions, [
    { op: "open", stage: "clean" },
    { op: "engine", stage: "direct", engine: "api_seedance2_5_video_editing" },
    { op: "engine", stage: "direct", engine: "api_newmaker_video_edit" },
    { op: "words", stage: "direct", text: "A rainy blue hour." },
    { op: "source", stage: "control", from: "direct" },
    { op: "source", stage: "clean", from: "clip" },
    { op: "conform" },
  ]);
});

test("a find the page told her of is an engine of the stage open only; a curated engine is one of the stages that list it", () => {
  const flf = answer({ reply: "", actions: [{ op: "engine", stage: "extend", engine: "video_ltx2_5_flf2v" }, { op: "engine", stage: "control", engine: "video_ltx2_5_flf2v" }, { op: "engine", stage: "finish", engine: "video_ltx2_5_flf2v" }] });
  assert.deepEqual(flf.actions.map((a: any) => a.stage), ["extend", "control"], "the LTX 2.5 first-and-last-frame is Control's and Extend's, not Finish's");
  assert.ok(ENGINES.filter((e) => e.name === "video_ltx2_5_flf2v").length === 2);
});

test("the plan: at most eight steps, each with a stage and (but for conform) an engine Spice knows; the words and the why are bounded", () => {
  const steps = [
    { stage: "conform" },
    { stage: "clean", engine: "utility_void_video_inpainting", text: "the van", why: "it takes the shadow too" },
    { stage: "direct", engine: "no_such_template", text: "x" },
    { stage: "direct" },
    { stage: "control", engine: "video_ltx2_3_ic_lora", text: "y".repeat(900), why: "z".repeat(400) },
    ...Array.from({ length: 12 }, () => ({ stage: "finish", engine: "api_mirelo_video_to_sfx" })),
  ];
  const out = answer({ reply: "Here is the plan.", actions: [{ op: "plan", steps }, { op: "plan", steps: [] }] });
  assert.equal(out.actions.length, 1, "an empty plan is dropped");
  const plan = out.actions[0].steps;
  assert.equal(plan.length, 8);
  assert.deepEqual(plan.slice(0, 2).map((s: any) => s.stage), ["conform", "clean"]);
  assert.ok(!plan.some((s: any) => s.engine === "no_such_template"));
  assert.equal(plan[2].stage, "control");
  assert.equal(plan[2].text.length, 500);
  assert.equal(plan[2].why.length, 140);
});

test("run is asked for once, last, and only with a stage open; it is never an action to take at once", () => {
  const out = answer({ reply: "Ready.", actions: [{ op: "run" }, { op: "words", stage: "direct", text: "rain" }, { op: "run" }] });
  assert.deepEqual(out.actions.map((a: any) => a.op), ["words", "run"]);
  assert.deepEqual(answer({ reply: "x", actions: [{ op: "run" }] }, summary({ stage: undefined })).actions, [], "no stage open, nothing to run");
});

test("an answer that is not JSON is told plainly, and a long one is cut", () => {
  const bad = readBayAnswer("I think {rain", summary());
  assert.ok(bad.reply && bad.actions.length === 0);
  assert.equal(answer({ reply: "w ".repeat(600), actions: [] }).reply.length <= 500, true);
  assert.deepEqual(readBayAnswer("", summary()).actions, []);
});
