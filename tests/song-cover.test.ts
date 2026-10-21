// A song's cover and video cover: what the server accepts and does to a song's entry (server/audio-cover.ts), which stretch of a
// song the video cover is made on, what is asked of the picture model and of LTX, and what each costs (web/js/song-cover.js).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readCoverRequest, mergeCover, CoverError, pictureUrl, videoUrl, COVER_FIELDS, type AudioEntry } from "../server/audio-cover.ts";
import { bestPart, coverPrompt, COVER_VIDEO_PROMPT, costOfCover, costOfCoverVideo, coverOf, fileOfUrl, stepWords, COVER_SECONDS } from "../web/js/song-cover.js";

const entry = (extra: Partial<AudioEntry> = {}): AudioEntry => ({ file: "abc123.mp3", url: "/media/audio/abc123.mp3", name: "Moonlit Oolong", kind: "music", seconds: 180, createdAt: "2026-10-21T00:00:00.000Z", ...extra });
const refuses = (input: unknown, words: RegExp) => assert.throws(() => readCoverRequest(input as any), (e: unknown) => e instanceof CoverError && words.test(e.message));

test("only the app's own media are a cover: a kept picture, a kept clip or a take", () => {
  assert.equal(pictureUrl("/media/photos/9f2c1e.png"), "/media/photos/9f2c1e.png");
  assert.equal(pictureUrl("/media/photos/../../etc/passwd"), null);
  assert.equal(pictureUrl("https://elsewhere.example/cover.png"), null);
  assert.equal(pictureUrl("/media/videos/clip.mp4"), null);
  assert.equal(videoUrl("/media/videos/ab12.mp4"), "/media/videos/ab12.mp4");
  assert.equal(videoUrl("/media/runs/r-8f2/shot.mp4"), "/media/runs/r-8f2/shot.mp4");
  assert.equal(videoUrl("/media/runs/r-8f2/../shot.mp4"), null);
  assert.equal(videoUrl("/media/photos/a.png"), null);
});

test("a cover request names a song of the library and says what the cover is, or clears it", () => {
  assert.deepEqual(readCoverRequest({ file: "abc123.mp3", cover: "/media/photos/p1.png" }), { file: "abc123.mp3", cover: "/media/photos/p1.png" });
  assert.deepEqual(readCoverRequest({ file: "abc123.mp3", video: "/media/videos/v1.mp4", seconds: "6.5" }), { file: "abc123.mp3", video: "/media/videos/v1.mp4", seconds: 6.5 });
  assert.deepEqual(readCoverRequest({ file: "abc123.mp3", clear: true }), { file: "abc123.mp3", clear: "all" });
  assert.deepEqual(readCoverRequest({ file: "abc123.mp3", clear: "video" }), { file: "abc123.mp3", clear: "video" });
  refuses({}, /song/i);
  refuses({ file: "../secret.mp3", cover: "/media/photos/p1.png" }, /song/i);
  refuses({ file: "notasound.txt", cover: "/media/photos/p1.png" }, /song/i);
  refuses({ file: "abc123.mp3" }, /cover is|clear/i);
  refuses({ file: "abc123.mp3", cover: "/etc/passwd" }, /picture/i);
  refuses({ file: "abc123.mp3", video: "/media/photos/p1.png" }, /clip/i);
  refuses({ file: "abc123.mp3", video: "/media/videos/v1.mp4", seconds: 90 }, /between/i);
  refuses({ file: "abc123.mp3", video: "/media/videos/v1.mp4", seconds: "soon" }, /between/i);
  refuses({ file: "abc123.mp3", cover: "/media/photos/p1.png", clear: true }, /not both/i);
});

test("a cover is merged into the song's entry; the entry given is left as it was", () => {
  const first = entry();
  const covered = mergeCover(first, { file: first.file, cover: "/media/photos/p1.png" });
  assert.equal(covered.cover, "/media/photos/p1.png");
  assert.equal(first.cover, undefined);
  const moving = mergeCover(covered, { file: first.file, video: "/media/videos/v1.mp4", seconds: 6 });
  assert.deepEqual([moving.cover, moving.coverVideo, moving.coverSeconds], ["/media/photos/p1.png", "/media/videos/v1.mp4", 6]);
  assert.equal(moving.name, "Moonlit Oolong");
});

test("a new picture drops the video made from the old one, unless the request brings its own; a cleared cover takes its video along", () => {
  const full = entry({ cover: "/media/photos/old.png", coverVideo: "/media/videos/old.mp4", coverSeconds: 6 });
  const again = mergeCover(full, { file: full.file, cover: "/media/photos/new.png" });
  assert.deepEqual([again.cover, again.coverVideo, again.coverSeconds], ["/media/photos/new.png", undefined, undefined]);
  const same = mergeCover(full, { file: full.file, cover: "/media/photos/old.png" });
  assert.equal(same.coverVideo, "/media/videos/old.mp4");
  const both = mergeCover(full, { file: full.file, cover: "/media/photos/new.png", video: "/media/videos/new.mp4", seconds: 5 });
  assert.deepEqual([both.cover, both.coverVideo, both.coverSeconds], ["/media/photos/new.png", "/media/videos/new.mp4", 5]);
  const noVideo = mergeCover(full, { file: full.file, clear: "video" });
  assert.deepEqual([noVideo.cover, noVideo.coverVideo, noVideo.coverSeconds], ["/media/photos/old.png", undefined, undefined]);
  const none = mergeCover(full, { file: full.file, clear: "all" });
  for (const f of COVER_FIELDS) assert.equal(none[f], undefined, f);
  assert.ok(!("cover" in none) && !("coverVideo" in none), "the fields are gone, not left empty");
});

/** A loudness for each half second: quiet, a verse, a chorus, a verse, a louder last chorus, an outro. */
function song() {
  const at = (t: number) => (t < 10 ? 0.15 : t < 40 ? 0.4 : t < 70 ? 0.8 : t < 100 ? 0.42 : t < 130 ? 0.95 : t < 150 ? 0.7 : 0.2);
  return Array.from({ length: 360 }, (_, i) => at(i * 0.5));
}

test("the best part is the loudest stretch, kept inside the song and a few seconds long", () => {
  const p = bestPart(song(), 180, { seconds: 6 });
  assert.ok(p.start >= 100 && p.start <= 124.5, `inside the loudest chorus: ${p.start}`);
  assert.equal(p.length, 6);
  const q = bestPart(song(), 180, { seconds: 30 });
  assert.equal(q.length, COVER_SECONDS.max, "a part is never longer than a cover video may be");
  const r = bestPart(song(), 180, { seconds: 1 });
  assert.equal(r.length, COVER_SECONDS.min);
});

test("a chorus that begins near the loudest stretch, and is nearly as loud, is where the part starts; a quieter one is not", () => {
  const sections = [{ from: 40, to: 70, kind: "chorus" }, { from: 100, to: 130, kind: "chorus" }];
  const loud = bestPart(song(), 180, { sections });
  assert.equal(loud.start, 100);
  const flat = Array.from({ length: 360 }, (_, i) => (i * 0.5 >= 104 && i * 0.5 < 116 ? 1 : 0.3));
  const quiet = bestPart(flat, 180, { sections: [{ from: 40, to: 70, kind: "chorus" }, { from: 98, to: 128, kind: "verse" }] });
  assert.ok(Math.abs(quiet.start - 104) <= 6, `no chorus near it: it stays on the loud stretch (${quiet.start})`);
});

test("the part falls on a bar when the tempo is known", () => {
  const bpm = 100; // a bar is 2.4 s
  const p = bestPart(song(), 180, { bpm });
  const bar = 2.4;
  assert.ok(Math.abs(p.start / bar - Math.round(p.start / bar)) < 0.01, `on a bar: ${p.start}`);
});

test("a short song is used whole, a silent one starts at the top, a bad tempo is ignored", () => {
  assert.deepEqual(bestPart([0.5, 0.6, 0.7, 0.4, 0.3, 0.2], 3), { start: 0, length: 3 });
  assert.deepEqual(bestPart([], 120), { start: 0, length: 6 });
  assert.deepEqual(bestPart(Array(240).fill(0), 120), { start: 0, length: 6 });
  const p = bestPart(song(), 180, { bpm: 9000 });
  assert.ok(p.start >= 100);
  const end = bestPart(Array.from({ length: 360 }, (_, i) => (i > 350 ? 1 : 0.1)), 180);
  assert.ok(end.start + end.length <= 180 + 1e-6, "it never runs past the end");
});

test("the cover is asked for with the song's words and never with words on the picture", () => {
  const p = coverPrompt({ name: "Moonlit Oolong", idea: "a late-night walk with a cold tea", tags: "indie pop, dreamy, soft Rhodes" });
  assert.match(p, /Moonlit Oolong/);
  assert.match(p, /late-night walk/);
  assert.match(p, /dreamy/);
  assert.match(p, /No text, no letters/);
  assert.match(coverPrompt({}), /Untitled/);
  assert.ok(coverPrompt({ name: "x".repeat(500), idea: "y".repeat(2000) }).length < 900, "a long idea is cut");
  assert.match(COVER_VIDEO_PROMPT, /loop/i);
});

test("a cover costs what the picture model costs and a video cover what its seconds of LTX cost; nothing on your own GPU", () => {
  assert.equal(costOfCover({ router: true, credits: 6 }), 6);
  assert.equal(costOfCover({ router: false, seconds: 40 }), Math.round(40 * 0.266));
  assert.equal(costOfCover(undefined), 8);
  assert.equal(costOfCover({ router: true, credits: 6 }, false), 6, "a model of Comfy Router is billed wherever ComfyUI runs");
  assert.equal(costOfCover({ router: false, seconds: 40 }, false), null, "a workflow on your own GPU costs nothing");
  assert.equal(costOfCoverVideo(6), Math.round(6 * 18 * 0.266));
  assert.equal(costOfCoverVideo(40), Math.round(10 * 18 * 0.266), "LTX makes at most ten seconds in a shot");
  assert.equal(costOfCoverVideo(6, false), null);
});

test("what a song has of a cover is read from its entry; a kept picture's file is its url's last part", () => {
  assert.deepEqual(coverOf(entry({ cover: "/media/photos/p1.png", coverVideo: "/media/videos/v1.mp4", coverSeconds: 6 })), { picture: "/media/photos/p1.png", video: "/media/videos/v1.mp4", seconds: 6 });
  assert.deepEqual(coverOf(entry()), { picture: null, video: null, seconds: null });
  assert.deepEqual(coverOf(null), { picture: null, video: null, seconds: null });
  assert.equal(fileOfUrl("/media/photos/9f2c1e.png"), "9f2c1e.png");
  assert.equal(fileOfUrl("/media/photos/9f2c1e.png?x=1"), "9f2c1e.png");
  assert.equal(stepWords("shot"), "Making the video");
  assert.equal(stepWords("zzz"), "Working");
});
