import { test } from "node:test";
import { strict as assert } from "node:assert";
import { captionLanguage, captionText, captionTimingPatch, captionSubtitles, needsRomanization } from "../web/js/jam-caption-language.js";

const line = { text: "帰り道で", romanization: "kaerimichi de", start: 7.25, length: 3, words: [{ text: "帰り道で", from: .25, to: 2.8 }] };

test("display language never replaces the original lyric and missing readings fall back safely", () => {
  assert.equal(captionText(line, "original"), "帰り道で");
  assert.equal(captionText(line, "romaji"), "kaerimichi de");
  assert.equal(captionText(line, "both"), "帰り道で\nkaerimichi de");
  assert.equal(captionText({ text: "帰り道で" }, "romaji"), "帰り道で");
  assert.equal(line.text, "帰り道で");
  assert.equal(captionLanguage("unexpected"), "original");
  assert.equal(captionText({ text: "hello", romanization: "hello" }, "both"), "hello");
  assert.equal(needsRomanization("帰り道で"), true);
  assert.equal(needsRomanization("Été, déjà vu!"), false);
});

test("retiming preserves word proportions and rejects captions outside the clip", () => {
  assert.deepEqual(captionTimingPatch(line, 10, 16, 30), {
    start: 10, length: 6, words: [{ text: "帰り道で", from: .5, to: 5.6 }],
  });
  assert.deepEqual(captionTimingPatch(line, 1, 4, 30).words, line.words);
  for (const [from, to] of [[8, 7], [-1, 5], [0, 31], [NaN, 10], [7, 7]]) assert.throws(() => captionTimingPatch(line, from, to, 30));
  assert.equal(line.start, 7.25);
});

test("SRT and WebVTT export the actual edited timing and selected caption language", () => {
  const second = { text: "次の行", romanization: "tsugi no gyō", start: 12, length: 2 };
  assert.equal(captionSubtitles([second, line], { language: "both", format: "srt" }), "1\n00:00:07,250 --> 00:00:10,250\n帰り道で\nkaerimichi de\n\n2\n00:00:12,000 --> 00:00:14,000\n次の行\ntsugi no gyō\n");
  assert.equal(captionSubtitles([line], { language: "romaji", format: "vtt" }), "WEBVTT\n\n1\n00:00:07.250 --> 00:00:10.250\nkaerimichi de\n");
  assert.equal(captionSubtitles([], { format: "vtt" }), "WEBVTT\n\n");
});
