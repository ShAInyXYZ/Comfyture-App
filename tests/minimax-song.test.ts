import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { minimaxSongGraph } from "../server/engine.ts";

test("MiniMax Music 3 receives the song and connects its predicted duration to the latent", async () => {
  const graph = JSON.parse(await readFile(new URL("../workflows/audio/song-minimax.json", import.meta.url), "utf8"));
  minimaxSongGraph(graph, { prompt: "Japanese pop", lyrics: "[Verse]\n歌", seconds: 180, seed: 42 });
  assert.equal(graph.text.inputs.caption, "Japanese pop");
  assert.equal(graph.text.inputs.lyrics, "[Verse]\n歌");
  assert.equal(graph.text.inputs.max_duration, 180);
  assert.equal(graph.text.inputs.seed, 42);
  assert.equal(graph.sample.inputs.seed, 42);
  assert.deepEqual(graph.latent.inputs.seconds, ["text", 1]);
  assert.equal(graph.out.class_type, "SaveAudioMP3");
});
