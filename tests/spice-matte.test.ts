// Spice's Roto matte graph (workflows/matte.json), with no network: what SAM3 is asked for with clicks and with only a name, and that
// every node it names is one Comfy Cloud has (the catalogue the app reads, checked at the time the graph was written).

import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { loadGraph, buildMatte, buildMatteImage } from "../server/workflows.ts";

const dir = join(import.meta.dirname, "..", "workflows");
// the reachable nodes of an API graph, from its output
const reach = (g: Record<string, any>, from = "video", seen = new Set<string>()) => {
  if (seen.has(from) || !g[from]) return seen;
  seen.add(from);
  for (const v of Object.values<any>(g[from].inputs)) if (Array.isArray(v) && typeof v[0] === "string") reach(g, v[0], seen);
  return seen;
};

test("with clicks, SAM3 finds the subject from them on their frame and its tracker follows that one subject from there", async () => {
  const g = buildMatte(await loadGraph(dir, "matte.json"), "clip.mp4", { text: "Pickle", positive: [{ x: 960, y: 540 }], negative: [{ x: 10, y: 10 }], key: 20 });
  assert.equal(g.video_in.inputs.file, "clip.mp4");
  assert.equal(g.key.inputs.batch_index, 20, "the frame the clicks were made on");
  assert.equal(g.frames.inputs.batch_index, 20, "and the tracker starts there");
  assert.deepEqual(JSON.parse(String(g.pick.inputs.positive_coords)), [{ x: 960, y: 540 }]);
  assert.deepEqual(JSON.parse(String(g.pick.inputs.negative_coords)), [{ x: 10, y: 10 }]);
  assert.deepEqual(g.track.inputs.initial_mask, ["pick", 0]);
  assert.equal(g.track.inputs.max_objects, 1, "one subject");
  assert.equal(g.words, undefined, "the name is not asked for too: it would add every other thing of that name");
  assert.deepEqual([...reach(g)].sort(), ["clip", "frames", "key", "masks", "parts", "pick", "pictures", "sam", "track", "video", "video_in"]);
});

test("with only a name, the tracker follows everything that name is, from the first frame", async () => {
  const g = buildMatte(await loadGraph(dir, "matte.json"), "clip.mp4", { text: "car", positive: [], negative: [], key: 0 });
  assert.equal(g.pick, undefined);
  assert.equal(g.track.inputs.initial_mask, undefined);
  assert.deepEqual(g.track.inputs.conditioning, ["words", 0]);
  assert.equal(g.words.inputs.text, "car");
  assert.equal(g.frames.inputs.batch_index, 0);
  assert.ok(!reach(g).has("key"));
});

test("the matte is saved as a clip, at the footage's frame rate, white where the subject is", async () => {
  const g = await loadGraph(dir, "matte.json");
  assert.equal(g.video.class_type, "SaveVideo");
  assert.deepEqual(g.clip.inputs.fps, ["parts", 2]);
  assert.equal(g.pictures.class_type, "MaskToImage");
  assert.equal(g.sam.inputs.ckpt_name, "sam3.1_multiplex_fp16.safetensors");
});

test("a picture's matte: SAM3 takes the subject its clicks are on (not every thing of its name), or with only a name everything it is", async () => {
  const clicked = buildMatteImage(await loadGraph(dir, "matte-image.json"), "pic.png", { text: "Pickle", positive: [{ x: 10, y: 20 }], negative: [] });
  assert.equal(clicked.photo.inputs.image, "pic.png");
  assert.deepEqual(JSON.parse(String(clicked.pick.inputs.positive_coords)), [{ x: 10, y: 20 }]);
  assert.equal(clicked.pick.inputs.conditioning, undefined);
  assert.equal(clicked.words, undefined);
  const named = buildMatteImage(await loadGraph(dir, "matte-image.json"), "pic.png", { text: "car", positive: [], negative: [] });
  assert.equal(named.words.inputs.text, "car");
  assert.deepEqual(named.pick.inputs.conditioning, ["words", 0]);
  assert.equal(named.pick.inputs.positive_coords, undefined);
  assert.equal(named.frame.class_type, "SaveImage");
  assert.deepEqual(named.frame.inputs.images, ["pictures", 0]);
});
