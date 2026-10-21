// The makers of Utensils' books (web/js/utensils-makers.js): who made the model at the core of a workflow or a tool, whose logo is
// pressed into its spine. The rules, the logo files and their CSS (scripts/utensils-makers.mjs), and the Library's catalogue carrying
// them (server/comfy-templates.ts). Nothing here reaches Comfy Cloud: the catalogue is the fixture of tests/fixtures/comfy-templates.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { MAKERS, makerOf, makerById } from "../web/js/utensils-makers.js";
import { flatten, library } from "../server/comfy-templates.ts";

const root = join(import.meta.dirname, "..");

test("a maker is found from the title first, then the models, then Comfy's own provider; the families before their companies", () => {
  assert.equal(makerOf({ title: "LTX-2.5: Image to Video", models: ["LTX-2.5"] }), "lightricks");
  // the title names the model at the core: a Gemini only writes this one's prompt
  assert.equal(makerOf({ title: "Seedance 2.0 + LLM Prompt Helper", models: ["Gemini 3 Flash", "Seedance 2.0"], providers: ["ByteDance", "Google"] }), "bytedance");
  // a family before its company
  assert.equal(makerOf({ title: "Nano Banana Pro", providers: ["Google"] }), "nanobanana");
  assert.equal(makerOf({ title: "Qwen Image Edit 2509", models: ["Qwen-Image-Edit"] }), "qwen");
  assert.equal(makerOf({ title: "Wan 2.2 14B Image to Video", models: ["Wan2.2"] }), "wan");
  // the models, when the title says only the job
  assert.equal(makerOf({ title: "Image Upscale", models: ["SeedVR2 3B"] }), "bytedance");
  // the provider, when nothing else names it
  assert.equal(makerOf({ title: "Generate 3D Model From Single Image", providers: ["Rodin"] }), "rodin");
  assert.equal(makerOf({ title: "Product shots", providers: [["Black Forest Labs"]] }), "flux");
  // none: a tool that runs ffmpeg on this machine, a workflow of a small lab
  assert.equal(makerOf({ title: "Trim", models: ["ffmpeg"] }), null);
  assert.equal(makerOf({ title: "MOSS-Image: Text to Image", models: ["MOSS-Image"] }), null);
});

test("every maker has its one-colour logo, its pressed logo and its CSS rule; their ids are unique", () => {
  assert.equal(new Set(MAKERS.map((m) => m.id)).size, MAKERS.length);
  const css = readFileSync(join(root, "web/css/ut-makers.css"), "utf8");
  for (const m of MAKERS) {
    assert.ok(existsSync(join(root, "web/brand/makers/mono", `${m.id}.svg`)), `${m.id}: its logo`);
    const pressed = readFileSync(join(root, "web/brand/makers/pressed", `${m.id}.svg`), "utf8");
    // the recess (a see-through dark) over its lit lower lip (a faint light, a hair lower)
    assert.match(pressed, /fill="#000" fill-opacity="\.\d+"/, `${m.id}: pressed`);
    assert.match(pressed, /y="\.9" fill="#fff"/, `${m.id}: its lit edge`);
    assert.ok(css.includes(`[data-maker="${m.id}"]`), `${m.id}: its CSS rule`);
    assert.equal(makerById(m.id), m);
  }
});

test("the Library's catalogue gives each workflow its maker and counts the makers, the busiest first", async () => {
  const index = JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", "comfy-templates", "index.json"), "utf8"));
  const lib = library(flatten(index));
  const by = Object.fromEntries(lib.items.map((i) => [i.name, i]));
  assert.equal(by.video_ltx2_3_i2v.maker, "lightricks");
  assert.equal(by.api_nano_banana_2_1_image_edit.maker, "nanobanana");
  assert.equal(by.image_qwen_image_edit_2509.maker, "qwen");
  assert.equal(by.audio_ace_step1_5_xl_turbo.maker, "ace");
  const made = lib.items.filter((i) => i.maker);
  assert.equal(lib.makers.reduce((n, m) => n + m.count, 0), made.length, "every book with a maker is counted once");
  for (let k = 1; k < lib.makers.length; k++) assert.ok(lib.makers[k - 1].count >= lib.makers[k].count, "the busiest first");
  for (const m of lib.makers) assert.equal(m.name, makerById(m.id)?.name);
});
