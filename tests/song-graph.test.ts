// The song workflow as the engine sets it for a song: the style, words and settings in, three passes with their own seeds, a style LoRA on the
// owner's own ComfyUI only (before the shift, its trigger word first in the style), a draft as the first pass alone.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { songGraph } from "../server/engine.ts";
import { SONG_LORAS, LORA_STRENGTH } from "../server/song-guide.ts";

const root = resolve(import.meta.dirname, "..");
const base = async () => JSON.parse(await readFile(join(root, "workflows", "audio", "song.json"), "utf8"));
const song = { prompt: "lo-fi hip hop, chill study beat, warm Rhodes", seconds: 240, lyrics: "[Instrumental]", bpm: 76, seed: 1000, key: "E minor", language: "en", timesignature: "4", passes: 3, temperature: 0.75, adherence: 2.5, thinking: true };

test("a song sets the text node, the length and the three passes' seeds, and uses heun like the owner's jkass_quality (Cloud has no jkass)", async () => {
  const g = songGraph(await base(), song, false);
  assert.deepEqual([g.text.inputs.tags, g.text.inputs.keyscale, g.text.inputs.bpm, g.text.inputs.duration, g.latent.inputs.seconds], [song.prompt, "E minor", 76, 240, 240]);
  assert.deepEqual([g.first.inputs.seed, g.second.inputs.seed, g.third.inputs.seed], [1000, 1001, 1002]);
  assert.deepEqual([g.first, g.second, g.third].map((k) => k.inputs.sampler_name), ["heun", "heun", "heun"]);
  assert.deepEqual([g.first, g.second, g.third].map((k) => [k.inputs.steps, k.inputs.denoise]), [[30, 1], [20, 0.25], [15, 0.15]], "the owner's 30, 20 and 15 steps");
  assert.equal(g.decode.inputs.samples[0], "third");
  assert.equal(g.lora, undefined, "no LoRA unless asked");
  assert.deepEqual(g.shift.inputs.model, ["unet", 0]);
});

test("a style LoRA is loaded before the shift with its trigger word first, on the owner's own ComfyUI only", async () => {
  for (const l of SONG_LORAS) {
    const g = songGraph(await base(), { ...song, lora: l.id }, true);
    assert.equal(g.lora.class_type, "LoraLoaderModelOnly");
    assert.match(g.lora.inputs.lora_name, /^ace-step\/[\w.-]+\/[\w.-]+\.safetensors$/, `${l.id}: the file under the LoRAs' folder`);
    assert.deepEqual(g.lora.inputs.model, ["unet", 0], "on the model as loaded");
    assert.equal(g.lora.inputs.strength_model, LORA_STRENGTH, "at the strength the LoRA's documentation gives");
    assert.equal(LORA_STRENGTH, 1);
    assert.deepEqual(g.shift.inputs.model, ["lora", 0], "the shift takes the LoRA's model");
    assert.equal(g.text.inputs.tags, `${l.trigger}, ${song.prompt}`, "the trigger word first");
  }
  // the file names are the real ones on the owner's machine (acoustic-acestep1.5-xl-v1/acoustic-xl-v1.safetensors, j_pop-xl-v1/j_pop-xl-v1.safetensors)
  assert.equal(songGraph(await base(), { ...song, lora: "acoustic" }, true).lora.inputs.lora_name, "ace-step/acoustic-acestep1.5-xl-v1/acoustic-xl-v1.safetensors");
  assert.equal(songGraph(await base(), { ...song, lora: "j_pop" }, true).lora.inputs.lora_name, "ace-step/j_pop-xl-v1/j_pop-xl-v1.safetensors");
  // Comfy Cloud has no LoRAs: asked for one, the song is made without
  const cloud = songGraph(await base(), { ...song, lora: "lo_fi" }, false);
  assert.equal(cloud.lora, undefined);
  assert.equal(cloud.text.inputs.tags, song.prompt, "and no trigger word in the style");
  // an unknown one is no LoRA
  assert.equal(songGraph(await base(), { ...song, lora: "not-a-lora" }, true).lora, undefined);
});

test("a draft is the first pass alone", async () => {
  const g = songGraph(await base(), { ...song, passes: 1 }, false);
  assert.deepEqual(g.decode.inputs.samples, ["first", 0]);
  assert.equal(g.second, undefined);
  assert.equal(g.third, undefined);
});
