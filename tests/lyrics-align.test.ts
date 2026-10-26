// The lyrics put on the times they are sung at: the written text kept, the heard times used, a wrong or missing word forgiven.
import { test } from "node:test";
import assert from "node:assert/strict";
import { alignLines, alignByVoice, likeness, norm, sungLines } from "../web/js/lyrics-align.js";

const say = (text: string, from: number, each = 0.4) => text.split(" ").map((w, i) => ({ w, s: from + i * each, e: from + (i + 1) * each - 0.05 }));

test("words are compared by their letters, a sung slip is forgiven, a different word is not", () => {
  assert.equal(norm("Crown!"), "crown");
  assert.equal(norm("Café,"), "cafe");
  assert.equal(likeness("crown", "crown"), 1);
  assert.ok(likeness("garden", "gardens") > 0.5, "a letter more");
  assert.ok(likeness("quiet", "quite") > 0, "two letters swapped");
  assert.equal(likeness("king", "bell"), 0);
  assert.equal(likeness("to", "do"), 0, "a very short word must be exact");
  assert.deepEqual(sungLines("[Verse 1]\nOne two\n\n[Chorus - hook]\nThree\n[Instrumental]\n"), ["One two", "Three"]);
});

test("each written line takes the times of the words heard for it, in order, a chorus sung twice found twice", () => {
  const lines = ["I woke up in the garden", "The snails all stopped to stare", "Paper crown riot tonight", "Never sit quiet", "Paper crown riot tonight", "Never sit quiet"];
  const words = [
    { w: "Thank", s: 0.5, e: 0.8 }, { w: "you", s: 0.8, e: 1.1 }, // (Whisper's own, not in the lyrics)
    ...say("I woke up in the garden", 2),
    ...say("The snails all stopped to stare", 5.5),
    ...say("Paper crown riot tonight", 9),
    ...say("Never sit quite", 11.5), // (a slip)
    ...say("Paper crown riot tonight", 30),
    ...say("Never sit quiet", 32.5),
  ];
  const r = alignLines(lines, words, { seconds: 40 });
  assert.equal(r.lines.length, 6);
  const starts = r.lines.map((l) => l.from);
  assert.deepEqual(starts.map((s) => Math.round(s)), [2, 6, 9, 12, 30, 33], "every line on the moment it was sung (the repeated chorus at both of its places)");
  assert.ok(r.lines.every((l, i) => l.to > l.from && (i === 0 || l.from >= r.lines[i - 1].from)), "in order, each with a length");
  assert.ok(r.lines.every((l) => l.heard), "all heard");
  assert.ok(r.matched / r.total > 0.9, `almost every word matched (${r.matched}/${r.total})`);
});

test("a line that was not heard is placed between its neighbours, and no heard word at all spreads the lines over the song", () => {
  const lines = ["First line sung here", "A line nobody heard at all", "Last line sung here"];
  const r = alignLines(lines, [...say("First line sung here", 4), ...say("Last line sung here", 20)], { seconds: 40 });
  assert.deepEqual(r.lines.map((l) => l.heard), [true, false, true]);
  assert.ok(r.lines[1].from >= r.lines[0].to - 0.01 && r.lines[1].to <= r.lines[2].from + 0.01, "between the two");
  assert.ok(Math.abs(r.lines[0].from - 4) < 0.2 && Math.abs(r.lines[2].from - 20) < 0.2);
  const none = alignLines(lines, [], { seconds: 30 });
  assert.equal(none.matched, 0);
  assert.ok(none.lines[0].from === 0 && none.lines[2].to === 30 && none.lines.every((l) => !l.heard), "spread over the whole song");
});

test("Japanese is matched one character at a time, a heard word's time shared over its characters", () => {
  const lines = ["朝の台所 ちいさなひよこ", "最後のジャムだ 見つけたんだ"];
  // Whisper's words for sung Japanese: pieces of any size
  const words = [{ w: "朝の", s: 10, e: 11 }, { w: "台所", s: 11, e: 12 }, { w: "ちいさな", s: 12, e: 13.2 }, { w: "ひよこ", s: 13.2, e: 14 }, { w: "最後のジャムだ", s: 30, e: 32.1 }, { w: "見つけたんだ", s: 32.1, e: 34 }];
  const r = alignLines(lines, words, { seconds: 60, chars: true });
  assert.ok(Math.abs(r.lines[0].from - 10) < 0.3 && Math.abs(r.lines[0].to - 14) < 0.3, JSON.stringify(r.lines[0]));
  assert.ok(Math.abs(r.lines[1].from - 30) < 0.3 && Math.abs(r.lines[1].to - 34) < 0.3, JSON.stringify(r.lines[1]));
  assert.ok(r.matched / r.total > 0.9);
  assert.equal(likeness("朝", "朝"), 1);
  assert.equal(likeness("朝", "夜"), 0, "a different character is not a near word");
});

test("with no words heard, the lines are laid over the singing time by their length, the silence falling where the voice is not", () => {
  // the voice's loudness every 0.1 s: singing 0 to 20 s and 30 to 50 s, silent 20 to 30 s (a solo)
  const voice = Array.from({ length: 600 }, (_, i) => ((i < 200 || (i >= 300 && i < 500)) ? 0.8 : 0.02));
  const lines = ["あああああ", "あああああ", "あああああ", "あああああ"];
  const r = alignByVoice(lines, voice, { hop: 0.1, seconds: 60 });
  const mid = r.map((l) => Math.round(l.from));
  assert.deepEqual(mid, [0, 10, 30, 40], "two lines in the first stretch, two in the second, the solo between them empty");
  assert.ok(r[1].to <= 20.3 && r[2].from >= 29.9, "no line is put in the silence");
  assert.ok(r.every((l) => l.heard), "the voice was there for each");
  // a longer line takes longer
  const long = alignByVoice(["あ", "ああああああああああ"], Array(100).fill(0.8), { hop: 0.1, seconds: 10 });
  assert.ok(long[1].to - long[1].from > 3 * (long[0].to - long[0].from));
  // no voice at all: spread over the song
  assert.deepEqual(alignByVoice(["a", "b"], Array(100).fill(0), { hop: 0.1, seconds: 10 }).map((l) => l.heard), [false, false]);
});
