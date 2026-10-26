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

test("the lyrics display's timeline: the song's own words, shared out over its sections, a line current at each moment", async () => {
  const { lyricTimeline, entryAt, parseSections } = await import("../web/js/song-lyrics.js");
  const lyrics = "[Intro]\nOne\n\n[Verse 1 - whispered]\nTwo\nThree\n\n[Chorus]\nFour\nFive\n\n[Instrumental]\n\n[Outro]\nSix";
  assert.deepEqual(parseSections(lyrics).map((s) => [s.label, s.lines.length]), [["Intro", 1], ["Verse 1", 2], ["Chorus", 2], ["Instrumental", 0], ["Outro", 1]]);
  const tl = lyricTimeline(lyrics, 240);
  const lines = tl.filter((e) => e.kind === "line");
  assert.deepEqual(lines.map((e) => e.text), ["One", "Two", "Three", "Four", "Five", "Six"], "every line, in order");
  assert.equal(tl.filter((e) => e.kind === "tag").length, 5, "a heading for each section");
  assert.ok(tl.every((e, i) => i === 0 || e.from >= tl[i - 1].from - 1e-9), "in time order");
  assert.ok(lines.every((e) => e.to > e.from) && tl.at(-1).to <= 240 + 1e-6, "each line has a stretch inside the song");
  assert.equal(tl.find((e) => e.text === "Verse 1").hint, "whispered", "the hint after the dash is kept");
  // what is current moves with the time: a heading, then its lines, an instrumental as its own marker
  const at = (t: number) => tl[entryAt(tl, t)];
  assert.equal(entryAt(tl, -1), -1);
  assert.equal(at(0).text, "Intro");
  const three = lines.find((e) => e.text === "Three")!;
  assert.equal(at((three.from + three.to) / 2).text, "Three");
  assert.equal(at(239.9).text, "Six");
  const mid = tl.find((e) => e.text === "Instrumental")!;
  assert.equal(at((mid.from + mid.to) / 2).text, "Instrumental", "a section with no words is a marker while it plays");
  // a song with no words is one marker
  assert.deepEqual(lyricTimeline("[Instrumental]", 200).map((e) => [e.kind, e.text]), [["tag", "Instrumental"]]);
  assert.deepEqual(lyricTimeline("", 200), []);
});

test("with the lyrics put on the times heard, the sections are where they are really sung, an instrumental takes the stretch between", async () => {
  const { lyricTimeline, sectionSpans, entryAt } = await import("../web/js/song-lyrics.js");
  const lyrics = "[Intro]\nOne\n\n[Verse 1]\nTwo\nThree\n\n[Instrumental]\n\n[Chorus]\nFour";
  const timing = { lines: [[2, 3], [10, 12], [12, 14], [30, 32]] };
  const spans = sectionSpans(lyrics, 40, timing);
  assert.deepEqual(spans.map((s) => [s.label, s.from, s.to]), [["Intro", 0, 9], ["Verse 1", 9, 14], ["Instrumental", 14, 29], ["Chorus", 29, 40]], "each begins just before its first line (a second at most) and runs to the next; the instrumental from the last line sung to the chorus' breath");
  const tl = lyricTimeline(lyrics, 40, timing);
  assert.deepEqual(tl.filter((e) => e.kind === "line").map((e) => [e.text, e.from, e.to]), [["One", 2, 3], ["Two", 10, 12], ["Three", 12, 14], ["Four", 30, 32]], "the lines on their heard times");
  assert.equal(tl[entryAt(tl, 20)].text, "Instrumental", "the instrumental while it plays");
  assert.equal(tl[entryAt(tl, 11)].text, "Two");
  // a timing with the wrong number of lines is not used: the estimate stays
  const estimated = lyricTimeline(lyrics, 40, { lines: [[1, 2]] });
  assert.notDeepEqual(estimated.filter((e) => e.kind === "line").map((e) => e.from), [2, 10, 12, 30]);
  assert.equal(sectionSpans("", 40, timing).length, 0);
});

test("lyrics on their heard times place a song's sections only when they cover the song", async () => {
  const { timingCovers } = await import("../web/js/song-lyrics.js");
  assert.equal(timingCovers({ lines: [[12, 14], [200, 210]] }, 220), true, "first line in the first quarter, last in the last third");
  assert.equal(timingCovers({ lines: [[84.4, 86.9], [107.6, 111.6]] }, 180), false, "words for one chorus in the middle of a three-minute song say nothing about the rest");
  assert.equal(timingCovers({ lines: [[2, 3], [60, 62]] }, 220), false, "ends too early");
  assert.equal(timingCovers(undefined, 220), false);
  assert.equal(timingCovers({ lines: [] }, 220), false);
});
