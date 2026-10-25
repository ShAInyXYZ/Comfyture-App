// Spice v2's rules, with no browser and no network: the seven stages, the engines each one offers from a catalog, the takes and the
// marked pass, the clip a stage works from, what a run costs and what stands in its way before it is paid.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as m from "../web/js/spice2-model.js";

const root = join(import.meta.dirname, "..");
const clip = (seconds = 8, extra = {}) => ({ kind: "video", url: "/c.mp4", file: "c.mp4", width: 1920, height: 1080, seconds, ...extra });
const take = (url: string, extra = {}) => ({ engine: "x", title: "X", media: clip(5, { url, file: url.slice(1) }), credits: 4, source: "partner", ...extra });
const shot = () => {
  const b = m.blankBody();
  b.clip = { media: clip(8), fps: 24, name: "yard.mp4", at: "2026-10-25T10:00:00.000Z" };
  return m.normaliseBody(b);
};

test("seven stages in the order a finishing editor runs them, each with a line, a placeholder and a place in the engine list", () => {
  assert.deepEqual(m.STAGE_IDS, ["conform", "select", "clean", "direct", "control", "extend", "finish"]);
  for (const s of m.STAGES) {
    assert.ok(s.name && s.icon && s.verb && s.makes, s.id);
    assert.ok(m.SAY[s.id] && m.PLACEHOLDER[s.id], `${s.id} has Paprika's line and her bar's words`);
    if (!s.local) assert.ok(m.ENGINES.some((x) => x.stage === s.id), `${s.id} has an engine`);
  }
  assert.equal(m.stageOf("direct").name, "Direct");
  assert.equal(m.stageOf("nope"), null);
});

test("every engine names a stage and a mode of that stage, a title, and what it needs; no template is listed twice in a stage", () => {
  const seen = new Set();
  for (const x of m.ENGINES) {
    assert.ok(m.STAGE_IDS.includes(x.stage), x.name);
    assert.ok(m.MODES[x.stage]?.[x.mode], `${x.name}: mode ${x.mode} of ${x.stage}`);
    assert.ok(x.title && x.about && x.why && x.needs, x.name);
    assert.ok(x.partner || x.gpu, `${x.name} has a price: a partner's estimate or a GPU guess`);
    const key = `${x.stage}:${x.name}`;
    assert.ok(!seen.has(key), `${key} twice`);
    seen.add(key);
  }
});

test("the engines are templates the live catalog has (checked against the catalog cached on this machine, when there is one)", (t) => {
  const file = join(root, "data/templates/index.json");
  if (!existsSync(file)) return t.skip("no cached catalog");
  const names = new Set(JSON.parse(readFileSync(file, "utf8")).flatMap((c: any) => (c.templates ?? []).map((x: any) => x.name)));
  const gone = m.ENGINES.filter((x) => !names.has(x.name)).map((x) => x.name);
  assert.deepEqual(gone, [], "engines the catalog has not got");
});

test("a stage's engines from a catalog: the curated ones present come first, those gone are told, new templates that fit are added", () => {
  const cat = [
    { name: "api_google_gemini_omni_flash_1_1_edit", title: "Gemini", partner: true, openSource: false, medium: "video", group: "partner", tags: ["Video Edit"], inputs: ["video"] },
    { name: "api_seedance2_5_video_editing", title: "Seedance", partner: true, medium: "video", group: "partner", inputs: ["video"] },
    { name: "api_newmaker_video_edit", title: "New Maker Edit", partner: true, medium: "video", group: "partner", inputs: ["video", "image"], description: "edits" },
    { name: "image_qwen_image_edit", title: "Qwen", medium: "image", group: "image", inputs: ["image"] },
    { name: "api_pixverse_v6_max_i2v", title: "PixVerse", partner: true, medium: "video", group: "partner", inputs: ["image"] },
  ];
  const { engines, missing } = m.enginesFor("direct", cat);
  assert.deepEqual(engines.slice(0, 2).map((x: any) => x.name), ["api_google_gemini_omni_flash_1_1_edit", "api_seedance2_5_video_editing"]);
  const added = engines.find((x: any) => x.name === "api_newmaker_video_edit");
  assert.ok(added?.found && added.mode === "other" && added.needs.video && added.needs.image, "a new edit template is an engine of Direct");
  assert.ok(!engines.some((x: any) => /image_qwen|pixverse/.test(x.name)), "a picture editor and an image-to-video are not Direct's");
  assert.ok(missing.some((x: any) => x.name === "api_runway_aleph2_video_edit"), "Runway is told as missing");
  // with no catalog yet, every curated engine is offered
  assert.equal(m.enginesFor("direct", null).engines.length, m.ENGINES.filter((x) => x.stage === "direct").length);
});

test("a template belongs to one stage: one curated for Control is not found again as Extend's", () => {
  const cat = [{ name: "video_ltx2_5_flf2v", title: "FLF2V", medium: "video", group: "video", inputs: ["image", "image"] }];
  const control = m.enginesFor("control", cat).engines.filter((x: any) => x.name === "video_ltx2_5_flf2v");
  const extend = m.enginesFor("extend", cat).engines.filter((x: any) => x.name === "video_ltx2_5_flf2v");
  assert.equal(control.length, 1);
  assert.equal(extend.length, 1);
  assert.ok(!control[0].found && !extend[0].found, "both are the curated engine, not a find");
});

test("a price: free for local work, the runner's estimate for a partner, a GPU guess for an open model, unknown for a partner before the estimate", () => {
  const gem = m.engineOf("api_google_gemini_omni_flash_1_1_edit");
  const void_ = m.engineOf("utility_void_video_inpainting");
  assert.equal(m.priceOf({ local: true }), 0);
  assert.equal(m.priceOf(gem, 8), null);
  assert.equal(m.priceOf(gem, 8, { credits: 120 }), 120);
  assert.equal(m.priceOf(void_, 8), Math.round(8 * 26 * 0.266));
  assert.equal(m.priceOf(void_, 60), Math.round(12 * 26 * 0.266), "at most twelve seconds are counted");
  assert.equal(m.priceOf(null), 0);
});

test("takes: the first that worked is the pass, a later one is marked by hand, a failed one is never the pass, nothing replaces another", () => {
  let b = shot();
  b = m.addTake(b, "direct", take("/a.mp4"));
  b = m.addTake(b, "direct", take("/b.mp4"));
  b = m.addTake(b, "direct", { engine: "x", state: "failed", credits: 6, note: "Refused." });
  const [a, c] = b.stages.direct.takes;
  assert.equal(b.stages.direct.takes.length, 3);
  assert.equal(m.passOf(b, "direct").id, a.id, "the first that worked is the pass");
  assert.deepEqual(m.takesOf(b, "direct").map((t: any) => t.media.url), ["/b.mp4", "/a.mp4"], "newest first, failed ones left out");
  b = m.markTake(b, "direct", c.id);
  assert.equal(m.passOf(b, "direct").id, c.id);
  b = m.markTake(b, "direct", b.stages.direct.takes[2].id);
  assert.equal(m.passOf(b, "direct").id, c.id, "a failed take cannot be marked");
  b = m.removeTake(b, "direct", c.id);
  assert.equal(m.passOf(b, "direct").id, a.id, "the newest that worked takes the mark's place");
  assert.equal(m.lampOf(b, "direct"), "done");
  assert.equal(m.lampOf(b, "clean"), "empty");
  assert.equal(m.lampOf(b, "clean", true), "working");
});

test("the clip a stage works from: the nearest earlier stage that made a clip, else the footage; Select's matte is not a clip; the person can point it elsewhere", () => {
  let b = shot();
  assert.equal(m.inputFor(b, "clean").from, "clip");
  b = m.addTake(b, "conform", take("/conform.mp4"));
  assert.equal(m.inputFor(b, "clean").media.url, "/conform.mp4");
  b = m.addTake(b, "select", { ...take("/matte.png"), media: { kind: "image", url: "/matte.png", file: "matte.png" } });
  assert.equal(m.inputFor(b, "clean").from, "conform", "a matte beside is not the clip of the next stage");
  b = m.addTake(b, "clean", take("/clean.mp4"));
  b = m.addTake(b, "direct", take("/direct.mp4"));
  assert.equal(m.inputFor(b, "control").media.url, "/direct.mp4");
  assert.equal(m.inputFor(b, "control").take, b.stages.direct.mark);
  b.stages.control.from = "clean";
  assert.equal(m.inputFor(b, "control").media.url, "/clean.mp4", "pointed at Clean");
  b.stages.control.from = "clip";
  assert.equal(m.inputFor(b, "control").media.url, "/c.mp4", "pointed at the footage");
  b.stages.control.from = "extend";
  assert.equal(m.inputFor(b, "control").media.url, "/direct.mp4", "pointed at a stage with no pass: it falls back");
  assert.equal(m.inputFor(m.blankBody(), "clean"), null, "no footage, no input");
});

test("the ledger: every run in time order, what each stage and the shot spent (a deleted take's credits were spent), the day's total", () => {
  let b = shot();
  b = m.addTake(b, "clean", take("/1.mp4", { credits: 10, at: "2026-10-25T09:00:00.000Z" }));
  b = m.addTake(b, "direct", take("/2.mp4", { credits: 30, at: "2026-10-25T11:00:00.000Z" }));
  b = m.addTake(b, "direct", take("/3.mp4", { credits: 25, at: "2026-10-24T11:00:00.000Z" }));
  const id = b.stages.direct.takes[1].id;
  b = m.removeTake(b, "direct", id);
  const l = m.ledger(b);
  assert.equal(l.spent, 65, "the removed take's 25 stays spent");
  assert.deepEqual(l.byStage.direct, 55);
  assert.deepEqual(l.rows.map((r: any) => r.take).length, 2, "rows are the takes kept");
  assert.ok(l.rows[0].at <= l.rows[1].at);
  assert.equal(m.creditsOnDay([b, m.blankBody()], new Date("2026-10-25T20:00:00Z")), 40);
});

test("before a run: no clip, a clip over the engine's length, a missing reference stop it; no words and an odd size only warn", () => {
  const gem = m.engineOf("api_google_gemini_omni_flash_1_1_edit");
  const beeble = m.engineOf("api_beeble_switchx_video_edit");
  const ing = m.engineOf("template_ltx2_3_ic_lora_ingredients");
  const flf = m.engineOf("video_ltx2_5_flf2v");
  let b = shot();
  assert.deepEqual(m.preflight(gem, b, "direct", { text: "make it rain" }), [], "ready");
  assert.ok(m.blocked(m.preflight(gem, m.blankBody(), "direct", { text: "x" })), "no clip");
  const long = shot();
  long.clip.media.seconds = 14;
  const p = m.preflight(gem, long, "direct", { text: "x" });
  assert.ok(m.blocked(p) && /10 seconds at most/.test(p[0].text) && /Conform/.test(p[0].text));
  assert.ok(m.blocked(m.preflight(beeble, b, "direct", { text: "x", images: 0 })), "Beeble needs its reference picture");
  assert.ok(!m.blocked(m.preflight(beeble, b, "direct", { text: "x", images: 1 })));
  assert.ok(m.blocked(m.preflight(ing, b, "control", { text: "x", images: 0 })), "Ingredients needs its sheet even with a clip");
  assert.ok(m.blocked(m.preflight(flf, b, "extend", { text: "x", images: 1 })), "two frames are needed");
  assert.ok(!m.blocked(m.preflight(flf, b, "extend", { text: "x", images: 2 })));
  const warn = m.preflight(gem, b, "direct", {});
  assert.deepEqual(warn.map((w: any) => w.level), ["warn"]);
  const odd = shot();
  odd.clip.media.width = 1081;
  odd.clip.fps = 15;
  assert.equal(m.preflight(gem, odd, "direct", { text: "x" }).filter((w: any) => w.level === "warn").length, 2, "an odd size and a slow rate are both told");
  assert.deepEqual(m.preflight({ local: true }, m.blankBody(), "conform"), [], "local work has nothing to check here");
});

test("Paprika's pick without a model: the rule of the stage that fits the words, a long clip sent past an engine that cannot take it", () => {
  assert.equal(m.recommend("clean", "take the subtitles off").name, "template_ltx2_3_lora_remove_subtitles_from_video");
  assert.equal(m.recommend("clean", "remove the van").name, "utility_void_video_inpainting");
  assert.equal(m.recommend("direct", "make it a rainy blue hour").name, "api_beeble_switchx_video_edit");
  assert.equal(m.recommend("direct", "turn him into the fox").name, "api_higgsfield_genjutsu_motion_transfer");
  assert.equal(m.recommend("direct", "swap the sign for a painted one", { seconds: 6 }).name, "api_google_gemini_omni_flash_1_1_edit");
  assert.equal(m.recommend("direct", "swap the sign for a painted one", { seconds: 14 }).name, "api_seedance2_5_video_editing", "past Gemini's ten seconds");
  assert.equal(m.recommend("control", "hold his face from the sheet").name, "template_ltx2_3_ic_lora_ingredients");
  assert.equal(m.recommend("control", "keep his walk").name, "video_ltx2_3_ic_lora");
  assert.equal(m.recommend("control", "make it vertical 9:16").name, "template_ltx2_3_lora_video_outpainting");
  assert.equal(m.recommend("extend", "continue for eight seconds").name, "api_google_gemini_omni_flash_1_1_extend");
  assert.equal(m.recommend("finish", "add rain and steps").name, "api_mirelo_video_to_sfx");
  assert.equal(m.recommend("conform", "trim it"), null, "Conform is local: no model to pick");
  for (const r of ["clean", "direct", "control", "extend", "finish", "select"]) assert.ok(m.recommend(r, "x"), `${r} always has a pick`);
});

test("Conform's plan: a rate off 24, an odd size and a clip over ten seconds are each told; a ready clip needs nothing", () => {
  assert.deepEqual(m.conformPlan({ media: clip(8), fps: 24 }), []);
  assert.deepEqual(m.conformPlan({ media: clip(12, { width: 1921 }), fps: 30 }).map((x: any) => x.what), ["rate", "size", "length"]);
  assert.deepEqual(m.conformPlan(null), []);
  assert.equal(m.frameAt(1, 24), 1025);
  assert.equal(m.secondsAt(1025, 24), 1);
});

test("a body from anywhere is shaped: junk is dropped, a mark that points at nothing is cleared, lists are bounded, a take with no media is dropped unless it failed", () => {
  assert.deepEqual(m.normaliseBody(null).log, []);
  const b = m.normaliseBody({
    brief: 5,
    clip: { media: { url: "/c.mp4", kind: "video", seconds: "9" }, fps: 9999 },
    range: { in: 40, out: 10 },
    stages: {
      direct: { mark: "ghost", from: "nowhere", takes: [{ id: "a", media: { url: "/a.mp4" } }, { id: "a", media: { url: "/dup.mp4" } }, { id: "b" }, { id: "c", state: "failed" }, "junk"] },
      bogus: { takes: [] },
    },
    log: [{ at: "2026-10-25", stage: "direct", credits: "7" }, { stage: "nope", credits: -3 }],
  });
  assert.equal(b.brief, "");
  assert.equal(b.clip.fps, 240);
  assert.equal(b.clip.media.seconds, 9);
  assert.deepEqual(b.range, { in: 40, out: 40 });
  assert.deepEqual(b.stages.direct.takes.map((t: any) => t.id), ["a", "c"]);
  assert.equal(b.stages.direct.mark, "");
  assert.equal(b.stages.direct.from, "");
  assert.equal(b.log[0].credits, 7);
  assert.equal(b.log[1].stage, "");
  assert.equal(b.log[1].credits, 0);
  assert.equal(b.stages.bogus, undefined);
});

test("Paprika's plan: written whole, bounded to eight steps, a step is done when its stage has a pass by its engine", () => {
  let b = shot();
  const steps = [{ stage: "conform" }, { stage: "clean", engine: "utility_void_video_inpainting", text: "the van", why: "shadow too" }, { stage: "nope" }, ...Array.from({ length: 12 }, () => ({ stage: "direct", engine: "x" }))];
  b = m.withPlan(b, steps);
  assert.equal(b.plan.length, 8);
  assert.equal(b.plan[1].why, "shadow too");
  assert.equal(m.normaliseBody(b).plan.length, 8, "kept across a save");
  assert.equal(m.stepDone(b, b.plan[1]), false);
  b = m.addTake(b, "clean", take("/c.mp4", { engine: "utility_void_video_inpainting" }));
  assert.equal(m.stepDone(b, b.plan[1]), true);
  b = m.addTake(b, "conform", take("/k.mp4", { engine: "local:conform" }));
  assert.equal(m.stepDone(b, { stage: "conform", engine: "" }), true);
  assert.equal(m.stepDone(b, { stage: "direct", engine: "y" }), false);
  assert.deepEqual(m.withPlan(b, null).plan, []);
});
