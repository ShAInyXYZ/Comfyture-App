import { test } from "node:test";
import assert from "node:assert/strict";
import { readSong, songPrompt, SONG_BRIEF } from "../server/song.ts";
import { KEYS, skeleton, costOfSong, DEFAULT_SONG, MAX_SECONDS } from "../web/js/song.js";
import { SONG_GUIDE, SONG_GUIDE_CORE, SONG_LORAS } from "../server/song-guide.ts";
import { jamBrief } from "../server/cut.ts";

test("a song reply is checked against what ACE-Step takes", () => {
  const reply = `Here it is: ${JSON.stringify({ name: "Lobby", tags: "warm pop", lyrics: "[Verse 1]\nHi  \n\n\n\n[Chorus]\nYo", bpm: 999, key: "a minor", language: "xx", timesignature: 3 })}`;
  const song = readSong(reply, 30, "en");
  assert.equal(song.lyrics, "[Verse 1]\nHi\n\n[Chorus]\nYo");
  assert.equal(song.bpm, 220);
  assert.equal(song.key, "A minor");
  assert.equal(song.language, "en");
  assert.equal(song.timesignature, "3");
  assert.equal(song.lora, "");
  assert.throws(() => readSong(JSON.stringify({ lyrics: "[Verse]\nx" }), 30, "en"), /no style/);
});

test("the prompt carries the length, the language and the structure asked for", () => {
  const p = songPrompt({ idea: "a chant", seconds: 45, language: "ja", structure: "short" });
  assert.match(p, /LENGTH: 45 seconds/);
  assert.match(p, /LANGUAGE: ja/);
  assert.match(p, /\[Verse 1\] \[Chorus\]/);
});

test("the shared choices are the model's own", () => {
  assert.equal(KEYS.length, 34);
  assert.equal(skeleton("short"), "[Verse 1]\n\n[Chorus]\n");
  assert.ok(costOfSong(30) < costOfSong(120));
});

test("Pickle writes songs by the guide: whole songs of 200 to 300 s in E minor, tags and lyrics that agree, the LoRAs with their trigger words", () => {
  assert.deepEqual([DEFAULT_SONG.key, DEFAULT_SONG.seconds, MAX_SECONDS], ["E minor", 240, 300]);
  for (const fact of [/200 to 300 s/, /E minor works great/, /Never write the BPM in the tags/, /6 to 10 syllables/, /word for word/, /Never an empty \[Chorus\]/, /must agree/]) assert.match(SONG_GUIDE, fact);
  assert.ok(SONG_GUIDE_CORE.length > 3000 && !/## Recipes|## Style LoRAs/.test(SONG_GUIDE_CORE), "the core is the rules, without the recipes and the LoRAs");
  // both Pickles have it: the one that sets a song up (all of it), the one in the chat bar (the core)
  assert.ok(SONG_BRIEF.includes(SONG_GUIDE) && SONG_BRIEF.includes("roti-l0f1y"), "the setup brief holds the guide, the recipes and the LoRAs");
  assert.ok(jamBrief([]).includes(SONG_GUIDE_CORE), "the chat bar's Pickle holds the core");
  assert.deepEqual(SONG_LORAS.map((l) => l.id), ["lo_fi", "jazz", "pop", "indie", "acoustic", "dream_pop", "electropop", "j_pop", "experimental"]);
  assert.ok(SONG_LORAS.every((l) => /^roti-\w+$/.test(l.trigger) && l.folder), "each with its trigger word and its folder");
  // a LoRA id the model made up is dropped, a real one kept
  const reply = (lora: string) => JSON.stringify({ name: "x", tags: "lo-fi", lyrics: "[Instrumental]", lora });
  assert.equal(readSong(reply("lo_fi"), 240, "en").lora, "lo_fi");
  assert.equal(readSong(reply("made-up"), 240, "en").lora, "");
});
