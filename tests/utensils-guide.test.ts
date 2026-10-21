// Truffle's recipe without a page: the steps made whole, their prices and total, the golden thread's order, and what a step hands on.

import { test } from "node:test";
import assert from "node:assert/strict";
import { normalisePlan, priceOf, totalOf, threadPath, handable, isWorkflow, workflowName, MAX_STEPS } from "../web/js/utensils-guide-plan.js";

const TOOLS: Record<string, { name: string; workspace: string; hint: string; icon: string; takes: string[] }> = {
  cutout: { name: "Remove background", workspace: "picture", hint: "The subject alone, on a clear background", icon: "tool-cutout", takes: ["image"] },
  music: { name: "Music", workspace: "audio", hint: "A track from a few words", icon: "tool-music", takes: [] },
  "ed-audio": { name: "Mute or swap audio", workspace: "edit", hint: "Keep the picture, change the sound", icon: "tool-ed-audio", takes: ["video", "audio"] },
};
const opts = {
  lookup: (id: string) => TOOLS[id] ?? null,
  estimate: (id: string) => ({ cutout: 1, music: 10, "ed-audio": 3 } as Record<string, number>)[id] ?? null,
  free: (id: string) => id === "ed-audio",
};

test("a workflow's id is wf:<template name>", () => {
  assert.equal(isWorkflow("wf:video_ltx2_5_i2v"), true);
  assert.equal(isWorkflow("cutout"), false);
  assert.equal(workflowName("wf:video_ltx2_5_i2v"), "video_ltx2_5_i2v");
  assert.equal(workflowName("cutout"), null);
});

test("steps are made whole from the registry, and a workflow is a Library step", () => {
  const { title, steps } = normalisePlan({
    steps: [
      { id: "cutout", why: "Lift the product off the table" },
      { id: "wf:video_ltx2_5_i2v", why: "Make it turn", entry: { name: "LTX-2.5: Image to Video", credits: 24, cost: "gpu", use: ["Drop the cut-out", "Say how it moves"], takes: ["image"] } },
      { id: "music", how: "Say the mood, press Make" },
      { id: "ed-audio" },
    ],
  }, opts);
  assert.equal(title, "Your recipe: 4 steps");
  assert.deepEqual(steps.map((s) => s.id), ["cutout", "wf:video_ltx2_5_i2v", "music", "ed-audio"]);
  assert.deepEqual(steps.map((s) => s.section), ["picture", "library", "audio", "edit"]);
  assert.equal(steps[1].kind, "workflow");
  assert.equal(steps[1].workflow, "video_ltx2_5_i2v");
  assert.equal(steps[1].name, "LTX-2.5: Image to Video");
  assert.deepEqual(steps[1].use, ["Drop the cut-out", "Say how it moves"]);
  // without an entry: the plan's how, then what the tool does
  assert.deepEqual(steps[2].use, ["Say the mood, press Make", "A track from a few words"]);
  assert.equal(steps[0].why, "Lift the product off the table");
  assert.equal(steps[3].why, "Keep the picture, change the sound");
  assert.deepEqual(steps.map((s) => s.price), ["≈ 1 cr", "≈ 24 cr", "≈ 10 cr", "Free"]);
});

test("a step twice in a row is kept once; an unknown tool is dropped; a long chain is cut", () => {
  const { steps } = normalisePlan({ steps: [{ id: "cutout" }, { id: "cutout" }, { id: "nope" }, { id: "" }, { id: "music" }] }, opts);
  assert.deepEqual(steps.map((s) => s.id), ["cutout", "music"]);
  const long = normalisePlan({ steps: Array.from({ length: 10 }, (_, i) => ({ id: i % 2 ? "cutout" : "music" })) }, opts);
  assert.equal(long.steps.length, MAX_STEPS);
});

test("a recipe of one book says so, and Truffle's own title is kept", () => {
  assert.equal(normalisePlan({ steps: [{ id: "music" }] }, opts).title, "One book will do it");
  assert.equal(normalisePlan({ title: "A product reel", steps: [{ id: "music" }] }, opts).title, "A product reel");
  assert.deepEqual(normalisePlan(null).steps, []);
});

test("a price: free, credits, a partner's credits, or GPU time", () => {
  assert.deepEqual(priceOf({ cost: "free", credits: 5 }), { label: "Free", credits: 0, cost: "free" });
  assert.equal(priceOf({ credits: 24, cost: "gpu" }).label, "≈ 24 cr");
  assert.equal(priceOf(null, 3).label, "≈ 3 cr");
  assert.equal(priceOf({ cost: "partner" }).label, "Partner credits");
  assert.deepEqual(priceOf(null), { label: "GPU time", credits: null, cost: "gpu" });
});

test("the total adds the known credits and says when some cannot be told", () => {
  assert.equal(totalOf([{ credits: 1 }, { credits: 24 }, { credits: 10 }, { credits: 0 }]).label, "≈ 35 cr");
  assert.equal(totalOf([{ credits: 0 }]).label, "Free");
  assert.deepEqual(totalOf([{ credits: 2 }, { credits: null }]), { credits: 2, unknown: true, label: "≈ 2 cr + GPU time" });
});

test("the thread joins the books in the recipe's order and skips one that is not on screen", () => {
  assert.equal(threadPath([]), "");
  assert.equal(threadPath([{ step: 0, x: 10, y: 10 }]), "");
  const d = threadPath([{ step: 2, x: 300, y: 50 }, { step: 0, x: 10, y: 10 }, { step: 1, x: NaN, y: 0 }, { step: 1, x: 100, y: 10 }]);
  assert.ok(d.startsWith("M 10.0 10.0"));
  const ends = [...d.matchAll(/Q [\d.]+ [\d.]+ ([\d.]+) ([\d.]+)/g)].map((m) => [+m[1], +m[2]]);
  assert.deepEqual(ends, [[100, 10], [300, 50]]);
  // each span sags below the lower of its two books
  const ctl = [...d.matchAll(/Q [\d.]+ ([\d.]+)/g)].map((m) => +m[1]);
  assert.ok(ctl[0] > 10 && ctl[1] > 50);
});

test("a result is handed on only when the next step takes its kind", () => {
  assert.equal(handable({ kind: "image" }, { takes: ["image"] }), "image");
  assert.equal(handable({ kind: "audio" }, { takes: ["image"] }), null);
  assert.equal(handable(null, { takes: ["image"] }), null);
  assert.equal(handable({ kind: "image" }, null), null);
});
