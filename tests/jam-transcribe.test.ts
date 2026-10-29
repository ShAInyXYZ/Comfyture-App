import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { romanizeLyrics } from "../server/romanize.ts";

test("lyric transcription listens to the original mix without stem separation", async () => {
  const graph = JSON.parse(await readFile(new URL("../workflows/jam-transcribe.json", import.meta.url), "utf8"));
  assert.deepEqual(graph.words.inputs.audio, ["track", 0]);
  assert.equal(graph.words.inputs.generate_srt, true);
  assert.ok(!Object.values(graph).some((node: any) => node.class_type === "AudioStemSeparate"));
});

test("Japanese lyrics retain their reading when romanized", async () => {
  assert.deepEqual(await romanizeLyrics(["夜空に輝く星", "ありがとう"]), ["yozora ni kagayaku hoshi", "arigatō"]);
});
