import { test } from "node:test";
import assert from "node:assert/strict";
import { readSong, songPrompt } from "../server/song.ts";
import { KEYS, skeleton, costOfSong } from "../web/js/song.js";

test("a song reply is checked against what ACE-Step takes", () => {
  const reply = `Here it is: ${JSON.stringify({ name: "Lobby", tags: "warm pop", lyrics: "[Verse 1]\nHi  \n\n\n\n[Chorus]\nYo", bpm: 999, key: "a minor", language: "xx", timesignature: 3 })}`;
  const song = readSong(reply, 30, "en");
  assert.equal(song.lyrics, "[Verse 1]\nHi\n\n[Chorus]\nYo");
  assert.equal(song.bpm, 220);
  assert.equal(song.key, "A minor");
  assert.equal(song.language, "en");
  assert.equal(song.timesignature, "3");
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
