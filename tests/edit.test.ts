// The edit's body: kept whole when opened again, its cuts moved onto the beat, a first edit drawn from the beat.

import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeBody, snapCuts, barTimes, draft, lyricItems, retext, resplit, editWord, textOf, TRACKS } from "../web/js/edit.js";
import { beatTimes } from "../web/js/fx.js";

const beats120 = (n = 40, extra = {}) => ({ bpm: 120, offset: 0, times: Array.from({ length: n }, (_, i) => i * 0.5), down: 0, source: "test", ...extra });

test("an empty body becomes an edit with the fixed tracks", () => {
  const b = normalizeBody();
  assert.deepEqual(b.tracks.map((t: any) => t.id), TRACKS().map((t) => t.id));
  assert.equal(b.aspect, "16:9");
  assert.equal(b.duck, true);
});

test("a body another product wrote comes out as an edit, with everything it held", () => {
  const jam = {
    aspect: "9:16",
    duck: false,
    product: "jam",
    beats: beats120(),
    tracks: [
      { id: "video", kind: "video", main: true, items: [{ id: "j1", src: { kind: "take", id: "t1" }, from: 0, to: 4, speed: 1, sound: false, join: "cut" }] },
      { id: "music", kind: "audio", role: "music", items: [{ id: "track", src: { kind: "audio", id: "song.mp3" }, start: 0, from: 0, to: 16 }] },
      { id: "captions", kind: "title", items: [{ id: "c1", text: "hello", start: 1, length: 2, style: "karaoke" }] },
    ],
    extraField: { kept: true },
  };
  const b = normalizeBody(jam);
  assert.equal(b.product, "jam");
  assert.equal(b.duck, false);
  assert.deepEqual(b.extraField, { kept: true });
  assert.equal(b.beats.times.length, 40);
  assert.equal(b.tracks.find((t: any) => t.main).items[0].id, "j1");
  assert.equal(b.tracks.find((t: any) => t.id === "a2").items[0].src.id, "song.mp3");
  assert.equal(b.tracks.find((t: any) => t.id === "t1").items[0].text, "hello");
  // nothing is dropped or doubled: seven fixed tracks, one of each
  assert.equal(b.tracks.length, 7);
  // and the same again changes nothing
  assert.deepEqual(normalizeBody(b), b);
});

test("a track of no fixed place is kept, and so is an item without an id given one", () => {
  const b = normalizeBody({ tracks: [{ id: "extra-titles", kind: "title", items: [{ text: "second titles" }] }, { id: "t1", kind: "title", items: [] }, { id: "weird", kind: "video", items: [{ text: "x" }] }] });
  const extra = b.tracks.find((t: any) => t.id === "extra-titles");
  assert.ok(extra && extra.items[0].id);
  // the video track of no id goes to the overlays, since it is not the main one
  assert.equal(b.tracks.find((t: any) => t.id === "v2").items.length, 1);
});

const clip = (id: string, to: number | null, extra = {}) => ({ id, src: { kind: "video", id }, from: 0, to, speed: 1, ...extra });
const info = (it: any) => (it.src.kind === "photo" ? { still: true, duration: 3600 } : { still: false, duration: 8 });
const filmOf = (items: any[], extra: any = {}) => ({ aspect: "9:16", beats: beats120(), tracks: [{ id: "v1", kind: "video", main: true, items }], ...extra });

test("cuts move onto the nearest beat; the last clip takes what is left so the film runs as long", () => {
  // cuts at 2.2 and 4.9 (beats are every 0.5 s), a last clip to 8
  const b: any = filmOf([clip("a", 2.2), clip("b", 2.7), clip("c", 3.1)]);
  const moved = snapCuts(b, info);
  assert.equal(moved, 2);
  const [x, y, z] = b.tracks[0].items;
  assert.equal(x.to, 2.0);
  assert.equal(y.to, 3.0, "second clip from 2.0 to 5.0");
  const total = x.to + y.to + (z.to ?? 8);
  assert.ok(Math.abs(total - 8) < 0.001, `the film still runs 8 s: ${total}`);
});

test("a clip with nothing more to show is slowed to reach the beat, not cut short", () => {
  const b: any = filmOf([clip("a", null), clip("b", 3)]);
  // the first clip is 8 s: a cut at 8 is on a beat already; make it end short of the beat instead
  b.tracks[0].items[0].to = 3.8;
  const moved = snapCuts(b, info);
  assert.equal(moved, 1);
  assert.equal(b.tracks[0].items[0].to, 4);
  // a clip that would need more than it has: 6.9 s asked of a source of 8, from 3
  const c: any = filmOf([{ ...clip("a", null), from: 3 }, clip("b", 3)], { beats: beats120(40, { offset: 0.1 }) });
  // its length is 5 s now, the cut at 5; the beats are at 0.1, 0.6 ...; the nearest to 5 is 5.1: 5.1 s of a clip with 5 s left: slowed
  snapCuts(c, info);
  assert.equal(c.tracks[0].items[0].to, null);
  assert.ok(c.tracks[0].items[0].speed < 1 && c.tracks[0].items[0].speed > 0.95);
});

test("bars, not beats, when asked; a dissolve cuts in its middle; stills take a length", () => {
  const b: any = filmOf([clip("a", 3.3), clip("b", 3)]);
  assert.deepEqual(barTimes(b).slice(0, 3), [0, 2, 4]);
  snapCuts(b, info, { to: "bar" });
  assert.equal(b.tracks[0].items[0].to, 4);
  const stills: any = filmOf([{ id: "p", src: { kind: "photo", id: "p" }, length: 2.7 }, clip("c", 3)]);
  snapCuts(stills, info);
  assert.equal(stills.tracks[0].items[0].length, 2.5);
  // one clip, or no beats: nothing to do
  assert.equal(snapCuts(filmOf([clip("a", 3)]), info), 0);
  assert.equal(snapCuts(filmOf([clip("a", 3.3), clip("b", 3)], { beats: undefined }), info), 0);
});

test("a first edit: a zoom on every bar, a flash every four, karaoke; made again it replaces itself, not what was added", () => {
  const b: any = normalizeBody({ aspect: "9:16", beats: beats120(60), tracks: [{ id: "t1", kind: "title", items: [{ id: "l1", lyric: true, text: "hello there world", start: 1, length: 3, style: "pop" }, { id: "l2", lyric: true, text: "again", start: 5, length: 2 }, { id: "x", text: "a title" }] }] });
  b.tracks.find((t: any) => t.kind === "fx").items.push({ id: "mine", kind: "shake", start: 2, length: 1, every: 0 });
  const did = draft(b, 30);
  assert.ok(did.length >= 3);
  const fx = b.tracks.find((t: any) => t.kind === "fx").items;
  assert.equal(fx.filter((i: any) => i.auto).length, 2);
  assert.ok(fx.some((i: any) => i.id === "mine"));
  assert.equal(fx.find((i: any) => i.kind === "zoom" && i.auto).every, 4);
  const lines = lyricItems(b);
  assert.deepEqual(lines.map((l: any) => l.style), ["pop", "karaoke"], "a style chosen stays; a line with none becomes karaoke");
  assert.ok(lines.every((l: any) => l.words.length));
  draft(b, 30);
  assert.equal(b.tracks.find((t: any) => t.kind === "fx").items.filter((i: any) => i.auto).length, 2, "not doubled");
  // no beats: no pulses
  const quiet: any = normalizeBody({ tracks: [] });
  assert.ok(!draft(quiet, 30).some((s) => /zoom/i.test(s)));
});

test("a line's text changed keeps the times of its words when their number holds", () => {
  const it: any = { text: "one two three", start: 0, length: 3 };
  resplit(it);
  const before = JSON.stringify(it.words.map((w: any) => [w.from, w.to]));
  retext(it, "uno dos tres");
  assert.equal(JSON.stringify(it.words.map((w: any) => [w.from, w.to])), before);
  assert.deepEqual(it.words.map((w: any) => w.text), ["uno", "dos", "tres"]);
  retext(it, "just two");
  assert.equal(it.words, undefined);
  assert.equal(beatTimes({ beats: { times: [1], offset: 0.5 } })[0], 1.5);
});

test("a word edited by hand is in the line's text, and splitting the line again keeps it", () => {
  const item: any = { id: "c1", lyric: true, text: "Sun in the jar", start: 1, length: 2, style: "karaoke" };
  assert.equal(editWord(item, 1, { text: "on" }), true);
  assert.equal(item.text, "Sun on the jar", "the line says what its words say");
  assert.deepEqual(item.words.map((w: any) => w.text), ["Sun", "on", "the", "jar"]);
  // split again, by letters: the words are timed again, the edited one is not written over
  resplit(item, "letters");
  assert.deepEqual(item.words.map((w: any) => w.text), ["Sun", "on", "the", "jar"]);
  assert.equal(item.text, "Sun on the jar");
  // a word left empty keeps what it was; a word that is not there is not edited
  editWord(item, 0, { text: "   " });
  assert.equal(item.words[0].text, "Sun");
  assert.equal(editWord(item, 9, { text: "x" }), false);
});

test("a line whose text is stale (its words were edited before the text followed them) is split from its words", () => {
  const item: any = { id: "c2", lyric: true, text: "Sun in the jar", start: 0, length: 2, words: [{ text: "Sun", from: 0, to: 0.5 }, { text: "ON", from: 0.5, to: 1 }, { text: "the", from: 1, to: 1.5 }, { text: "jar", from: 1.5, to: 2 }] };
  assert.equal(textOf(item), "Sun ON the jar");
  resplit(item, "even");
  assert.deepEqual(item.words.map((w: any) => w.text), ["Sun", "ON", "the", "jar"]);
  assert.equal(item.text, "Sun ON the jar");
  // a word's times are kept in range
  editWord(item, 2, { from: 5, to: 9 });
  assert.ok(item.words[2].from <= 2 && item.words[2].to <= 4 && item.words[2].to > item.words[2].from);
});
