// The IC-LoRA suite's engine, with no model and no network: the generic graph a tool is run through (the LoRA, what the clip is shown to it
// as, the size, the words, the frames), the frames a run is made of, and that the registry is one a run can trust.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildIC, icFrames, promptOf, prepareFilter, compositeGraph, IC_SIZES, forgetTools, loadTools, type ICTool } from "../server/iclora.ts";

const root = join(import.meta.dirname, "..");
const graph = () => JSON.parse(readFileSync(join(root, "workflows", "ic-lora.json"), "utf8"));
const tool = (o: Partial<ICTool> = {}): ICTool => ({ id: "t", file: "ltx-2.3-22b-ic-lora-x.safetensors", name: "X", family: "restore", about: "", guide: "raw", prompt: "The card's words.", strength: 1, status: "untested", ...o });
const run = (t: ICTool, v: Partial<Parameters<typeof buildIC>[2]> = {}) => buildIC(graph(), t, { clip: "clip.mp4", prompt: "", frames: 49, seed: 7, size: "draft", ...v });

test("a run's frames are LTX's 8n + 1, never more than the clip has", () => {
  assert.equal(icFrames(2.05, 49), 49);
  assert.equal(icFrames(2, 49), 41);
  assert.equal(icFrames(10, 49), 49, "the clip's own length is the most");
  assert.equal(icFrames(10, 400), 233);
  assert.equal(icFrames(0.1, 400), 9, "a run is never shorter than 9 frames");
});

test("the generic graph: the clip, the LoRA and its strength, the frames, the seeds, the size", () => {
  const g = run(tool({ strength: 0.8 }), { seed: 40, frames: 57, size: "standard" });
  assert.equal(g.video_in.inputs.file, "clip.mp4");
  assert.equal(g.union_lora.inputs.lora_name, "ltx-2.3-22b-ic-lora-x.safetensors");
  assert.equal(g.union_lora.inputs.strength_model, 0.8);
  assert.equal(g.clip_frames.inputs.length, 57);
  assert.equal(g.seed.inputs.noise_seed, 40);
  assert.equal(g.seed_refine.inputs.noise_seed, 41);
  assert.equal(g["5548:5026"].inputs["resize_type.shorter_size"], IC_SIZES.standard);
  assert.equal(run(tool(), { strength: 1.3 }).union_lora.inputs.strength_model, 1.3, "a strength asked for beats the card's");
});

test("the words: the person's own, else the card's", () => {
  assert.equal(run(tool()).prompt.inputs.value, "The card's words.");
  assert.equal(run(tool(), { prompt: "  A rainy night.  " }).prompt.inputs.value, "A rainy night.");
});

test("what the LoRA is shown of the clip: the clip itself, its pose, its edges, its depth", () => {
  const raw = run(tool({ guide: "raw" }));
  assert.equal(raw.control, undefined, "no preprocessor");
  assert.deepEqual(raw["5548:5028"].inputs.input, ["5548:5026", 0], "the resized clip is the guide");
  const pose = run(tool({ guide: "pose" }), { size: "standard" });
  assert.equal(pose.control.class_type, "DWPreprocessor");
  assert.equal(pose.control.inputs.resolution, IC_SIZES.standard, "the control is drawn at the size asked: it sets the size of the run");
  assert.deepEqual(pose["5548:5028"].inputs.input, ["control", 0]);
  const canny = run(tool({ guide: "canny" }));
  assert.equal(canny.control.class_type, "Canny");
  assert.deepEqual(canny.control.inputs.image, ["5548:5026", 0]);
  const depth = run(tool({ guide: "depth" }), { size: "draft" });
  assert.equal(depth.control.class_type, "DepthAnythingV2Preprocessor");
  assert.equal(depth.control.inputs.resolution, IC_SIZES.draft);
});

test("no sound is made: the clip is drawn again silent (it can be given back its own)", () => {
  const g = run(tool());
  assert.equal(g["5518:4848"], undefined, "no audio decode");
  assert.equal(g["5518:4849"].inputs.audio, undefined, "the video takes no audio");
  assert.equal(g["5518:4849"].class_type, "CreateVideo");
});

test("no first frame is pinned: the picture guides are bypassed and still valid", () => {
  const g = run(tool());
  assert.equal(g.photo.class_type, "ImageFromBatch");
  const pins = Object.values(g).filter((n: any) => n.class_type === "LTXVImgToVideoInplace");
  assert.ok(pins.length >= 2 && pins.every((n: any) => n.inputs.bypass === true));
});

test("what a tool must avoid is added to the negative prompt; the guide's strength is the card's", () => {
  const g = run(tool({ avoid: "blur, text", guideStrength: 0.7 }));
  assert.match(g["5014:2612"].inputs.text, /^blur, text, /);
  assert.equal(g["9002:5012"].inputs.strength, 0.7);
  assert.equal(run(tool())["9002:5012"].inputs.strength, 1);
});

test("the registry: ids are unique, every tool is in a family, has a LoRA file on Cloud's naming, a valid guide and status, and words", async () => {
  forgetTools();
  const { tools, families } = await loadTools(join(root, "workflows"));
  const ids = new Set<string>();
  for (const t of tools) {
    assert.ok(!ids.has(t.id), `${t.id} twice`);
    ids.add(t.id);
    assert.ok(families.some((f) => f.id === t.family), `${t.id}: family ${t.family}`);
    assert.match(t.file, /\.safetensors$/, t.id);
    assert.ok(["raw", "pose", "canny", "depth"].includes(t.guide), `${t.id}: guide`);
    assert.ok(["verified", "untested", "failed"].includes(t.status), `${t.id}: status`);
    assert.ok(t.name && t.about && t.strength > 0 && t.strength <= 2.5, t.id);
    assert.ok(t.prompt || t.template || t.hint || t.needs?.length, `${t.id}: words of its own (a prompt or a template), or a hint for the person's, unless it needs more than a clip`);
    if (t.hint) assert.ok(!t.prompt && !/rancher|pickup|grey cat/i.test(t.hint), `${t.id}: a hint says what to write, never the survey's clip`);
    if (t.template) assert.ok(/\{scene\}|\{words\}/.test(t.template), `${t.id}: a template says where the scene or the words go`);
    assert.ok(t.source?.startsWith("https://"), `${t.id}: a model card to read`);
    assert.ok(["card", "official-workflow", "inferred"].includes(t.confidence ?? ""), `${t.id}: how sure the settings are`);
    for (const need of t.needs ?? []) assert.ok(typeof need === "string" && need.length > 3, `${t.id}: what it needs is said in words`);
    if (t.prepare) assert.ok(["pad", "box"].includes(t.prepare.op) && /^[0-9a-f]{6}$/i.test(t.prepare.color), `${t.id}: how its clip is made ready`);
    if (t.demo) assert.ok(t.demo.damage && t.demo.label, `${t.id}: the damage to try it on`);
  }
  forgetTools();
});

test("what a tool is told: a card's grammar with the shot and the effect put in, else the person's words, else the card's", () => {
  const grammar = tool({ template: "Reference shows {scene}. ADD WATER {words}. Only water differs.", words: "heavy rain" });
  assert.equal(promptOf(grammar, {}, "the footage"), "Reference shows the footage. ADD WATER heavy rain. Only water differs.");
  assert.equal(promptOf(grammar, { scene: "a truck", words: "a flood" }), "Reference shows a truck. ADD WATER a flood. Only water differs.");
  assert.equal(promptOf(tool(), { words: "  mine " }), "mine");
  assert.equal(promptOf(tool(), {}), "The card's words.");
  // a tool with no words of its own (the survey's words are its `example`, never sent) is told the shot, else the footage
  assert.equal(promptOf({ ...tool(), prompt: "" }, { scene: "a raccoon in a market yard" }), "a raccoon in a market yard");
  assert.equal(promptOf({ ...tool(), prompt: "" }, {}, "the footage"), "the footage");
  assert.equal(promptOf(tool({ template: "{scene} and {scene}" }), { scene: "x" }), "x and x", "every place the scene goes");
});

test("a clip made ready for a tool that is shown more: a canvas of another shape with the new area flat in its colour, or a region flooded", () => {
  assert.equal(prepareFilter(tool()), null, "a tool that takes the clip as it is");
  const pad = prepareFilter(tool({ prepare: { op: "pad", color: "66FF00", aspect: 1 } }))!;
  assert.match(pad, /^pad=w=ceil\(max\(iw\\,ih\*1\)\/2\)\*2:h=.*color=0x66FF00$/);
  assert.match(prepareFilter(tool({ prepare: { op: "pad", color: "000000", aspect: 1 } }), { aspect: 1.78 })!, /ih\*1\.78/, "an aspect asked for beats the tool's");
  assert.match(prepareFilter(tool({ prepare: { op: "pad", color: "zzz", aspect: 99 } }))!, /color=0x000000/, "a colour that is not one is black");
  assert.match(prepareFilter(tool({ prepare: { op: "pad", color: "000000", aspect: 99 } }))!, /ih\*4\)/, "an aspect is kept within 1:4 to 4:1");
  const box = prepareFilter(tool({ prepare: { op: "box", color: "FF00FF", region: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 } } }), { region: { x: 0.5, y: 2, w: 0.3, h: 0.1 } })!;
  assert.equal(box, "drawbox=x=iw*0.5000:y=ih*1.0000:w=iw*0.3000:h=ih*0.1000:color=0xFF00FF:t=fill", "a region asked for beats the tool's, within the frame");
});

test("a tool whose card recommends one pass at the native size has its second pass left out", () => {
  const g = run(tool({ single: true }));
  assert.deepEqual(g["5518:5538"].inputs.samples, ["5549", 2], "the picture is decoded from the first pass's cropped latent");
  assert.deepEqual(run(tool())["5518:5538"].inputs.samples, ["5517:4973", 0], "else from the second pass");
});

test("a widened or filled run is merged with the footage where the footage stood, through a soft edge; a tool that takes the clip as it is has nothing to merge", () => {
  assert.equal(compositeGraph(tool(), { w: 640, h: 640 }, { w: 720, h: 1280 }), null);
  // widened to a square: the 720x1280 footage is 360x640 in a 640x640 drawing, 140 px from the left, and the merge keeps its middle
  const pad = compositeGraph(tool({ prepare: { op: "pad", color: "66FF00", aspect: 1 } }), { w: 640, h: 640 }, { w: 720, h: 1280 })!;
  assert.match(pad, /\[1:v\]scale=360:640:flags=lanczos,pad=640:640:140:0:color=black/);
  assert.match(pad, /maskedmerge/);
  assert.match(pad, /\[out\]$/);
  // a region filled: the footage everywhere but the region (grown a little), the drawing inside it
  const box = compositeGraph(tool({ prepare: { op: "box", color: "FF00FF", region: { x: 0.1, y: 0.2, w: 0.3, h: 0.3 } } }), { w: 640, h: 1088 }, { w: 720, h: 1280 })!;
  assert.match(box, /color=c=white:s=640x1088/);
  assert.match(box, /drawbox=x=51:y=196:w=218:h=370:color=black:t=fill/, "the region, grown by 2% each way, as pixels of the drawing");
  assert.match(compositeGraph(tool({ prepare: { op: "box", color: "FF00FF" } }), { w: 640, h: 640 }, { w: 640, h: 640 }, { region: { x: 0, y: 0, w: 1, h: 1 } })!, /drawbox=x=0:y=0:w=640:h=640/, "a region cannot leave the frame");
});
