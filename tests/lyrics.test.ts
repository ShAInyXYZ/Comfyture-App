// Lyrics: how a line is split into timed words, laid out, and drawn in a film by ASS subtitles
// (libass), checked on real frames. Needs ffmpeg with libass.

import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { syllables, splitWords, wordsOf, layoutLyric, lyricAss, wordState, textWidth, LINE, POP, LOOKS, faceOf } from "../web/js/lyrics.js";
import { render, rgbFrame } from "./render.ts";

test("syllables, roughly", () => {
  assert.deepEqual(["sun", "made", "table", "beautiful", "rhythm", "o"].map(syllables), [1, 1, 2, 3, 1, 1]);
});

test("a line's words are timed by their syllables, and cover the line", () => {
  const w = splitWords("Beautiful dream", 4, "syllables");
  assert.equal(w.length, 2);
  assert.equal(w[0].from, 0);
  assert.equal(w[1].to, 4);
  assert.equal(w[0].to, w[1].from);
  assert.ok(Math.abs((w[0].to - w[0].from) / (w[1].to - w[1].from) - 3) < 0.05);
  // by letters and all alike
  assert.deepEqual(splitWords("a bb ccc", 6, "letters").map((x: any) => x.to - x.from), [1, 2, 3]);
  assert.deepEqual(splitWords("a bb ccc", 3, "even").map((x: any) => x.to - x.from), [1, 1, 1]);
  assert.deepEqual(splitWords("   ", 3), []);
});

test("the words an item keeps are used, kept in range and in order; none kept: the line split", () => {
  const item = { text: "a b c", length: 3, words: [{ text: "b", from: 1.5, to: 2.5 }, { text: "a", from: 0, to: 9 }, { text: " ", from: 0, to: 1 }] };
  const w = wordsOf(item);
  assert.deepEqual(w.map((x: any) => x.text), ["a", "b"]);
  assert.ok(w.every((x: any) => x.from >= 0 && x.to <= 9 && x.to > x.from));
  assert.equal(wordsOf({ text: "one two", length: 2 }).length, 2);
});

test("a line wraps into rows that fit the frame, and each word has a place on it", () => {
  const item = { text: "Sun in the jar tonight and every night after that", length: 6, style: "karaoke", size: 0.09 };
  const L = layoutLyric(item, 720, 1280);
  assert.ok(L.rows >= 2);
  for (const p of L.placed) assert.ok(p.cx - p.w / 2 >= 0 && p.cx + p.w / 2 <= 720, `${p.text} stays in the frame`);
  // a row is centred on the middle of the block
  for (let r = 0; r < L.rows; r++) {
    const row = L.placed.filter((p: any) => p.row === r);
    const left = row[0].cx - row[0].w / 2;
    const right = row.at(-1).cx + row.at(-1).w / 2;
    assert.ok(Math.abs((left + right) / 2 - 360) < 1, `row ${r} is centred`);
  }
  // text width, from the face's advances
  assert.ok(Math.abs(textWidth("HHHH", 100) - 293.6) < 0.1);
});

test("what a word does as it is sung", () => {
  const w = { text: "go", from: 1, to: 2 };
  assert.equal(wordState("karaoke", w, 0.5, 5).fill, 0);
  assert.equal(wordState("karaoke", w, 1.5, 5).fill, 0.5);
  assert.equal(wordState("karaoke", w, 3, 5).fill, 1);
  assert.equal(wordState("pop", w, 0.9, 5).show, false);
  const popped = wordState("pop", w, 1 + POP.up, 5);
  assert.ok(popped.show && popped.hi && popped.sx > 1.1);
  assert.equal(wordState("pop", w, 2.5, 5).hi, false);
  assert.ok(wordState("bounce", w, 1.08, 5).sy > 1.2);
  // the line fades in and out; before and after it nothing shows
  assert.equal(wordState("karaoke", w, 0, 5).alpha, 0);
  assert.equal(wordState("karaoke", w, 5, 5).show, false);
});

test("the subtitles have an event for each word, in the film's own pixels", () => {
  const items = [{ text: "HOME NOW", start: 1, length: 3, style: "karaoke" }, { text: "Hey you", start: 5, length: 2, style: "pop" }, { text: "Bounce it", start: 8, length: 2, style: "bounce" }, { text: "plain", start: 0, length: 1, style: "lower" }];
  const ass = lyricAss(items.filter((i) => ["karaoke", "pop", "bounce"].includes(i.style)), { W: 720, H: 1280 }) as string;
  assert.match(ass, /PlayResX: 720/);
  assert.match(ass, /PlayResY: 1280/);
  const events = ass.split("\n").filter((l) => l.startsWith("Dialogue"));
  assert.ok(events.length >= 6);
  assert.ok(events.some((e) => e.includes("\\kf")));
  assert.ok(events.some((e) => e.includes("\\fscx")));
  assert.equal(lyricAss([], { W: 720, H: 1280 }), null);
});

// ---- on the film

const W = 720;
const H = 1280;
const bright = (rgb: number[]) => rgb[0] + rgb[1] + rgb[2] > 330;
/** The pixels of a frame inside a box that are lit (white or the highlight) and the share of those that are yellow. */
function look(frame: Uint8Array, x0: number, x1: number, y0: number, y1: number) {
  let lit = 0;
  let yellow = 0;
  let xs = 0;
  let xe = 0;
  let ys = 0;
  let ye = 0;
  let first = true;
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(H, y1); y++) {
    for (let x = Math.max(0, Math.floor(x0)); x < Math.min(W, x1); x++) {
      const o = (y * W + x) * 3;
      const px = [frame[o], frame[o + 1], frame[o + 2]];
      if (!bright(px)) continue;
      lit++;
      if (px[2] < px[0] * 0.75) yellow++;
      if (first) (xs = x), (ys = y), (first = false);
      xs = Math.min(xs, x);
      xe = Math.max(xe, x);
      ys = Math.min(ys, y);
      ye = Math.max(ye, y);
    }
  }
  return { lit, yellow, share: lit ? yellow / lit : 0, xs, xe, ys, ye };
}

test("karaoke lights the words as they are sung, where the layout put them", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "lyr-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const item = { id: "l", text: "HOME NOW HERE", start: 1, length: 3, style: "karaoke", words: [{ text: "HOME", from: 0, to: 1 }, { text: "NOW", from: 1, to: 2 }, { text: "HERE", from: 2, to: 3 }], size: 0.1, y: 0.5 };
  const body: any = { aspect: "9:16", tracks: [{ id: "t1", kind: "title", items: [item] }, { id: "a2", kind: "audio", role: "music", items: [{ id: "m", src: { kind: "audio", id: "x" }, start: 0 }] }] };
  // a silent sound gives the film its length
  const { writeFile } = await import("node:fs/promises");
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  await promisify(execFile)("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", "5", join(dir, "x.wav")]);
  const out = await render(body, { m: { path: join(dir, "x.wav"), still: false, hasAudio: true, duration: 5 } }, join(dir, "r"), { size: { width: W, height: H } });
  assert.equal(Math.round(out.plan.seconds), 5);
  const L = layoutLyric(item, W, H);
  const at = (s: number) => Math.round(s * 24) / 24;
  // before the line: nothing
  const before = look(await rgbFrame(out.film, at(0.5)), 0, W, 0, H);
  assert.equal(before.lit, 0);
  // at 2.0 s into the film (1 s in) HOME is lit through, NOW has begun: its share of yellow follows wordState
  for (const [time, rel] of [[at(1.6), 0.6], [at(2.5), 1.5], [at(3.4), 2.4]]) {
    const frame = await rgbFrame(out.film, time);
    for (const p of L.placed) {
      const w = L.words[p.i];
      const state = wordState("karaoke", w, rel, 3);
      const got = look(frame, p.cx - p.w / 2 - 2, p.cx + p.w / 2 + 2, p.cy - L.em * 0.55, p.cy + L.em * 0.55);
      assert.ok(got.lit > 200, `${w.text} is there at ${time}`);
      assert.ok(Math.abs(got.share - state.fill) < 0.14, `${w.text} at ${time}: ${got.share.toFixed(2)} lit, wordState says ${state.fill.toFixed(2)}`);
      // and sits where it was laid out: its ink's middle is its centre (capitals: the line box's middle)
      assert.ok(Math.abs((got.xs + got.xe) / 2 - p.cx) < 5, `${w.text} is centred on ${p.cx.toFixed(0)}, ink ${(got.xs + got.xe) / 2}`);
      assert.ok(Math.abs((got.ys + got.ye) / 2 - p.cy) < L.em * 0.06, `${w.text} is at row ${p.cy.toFixed(0)}, ink ${(got.ys + got.ye) / 2}`);
    }
  }
  assert.ok(LINE.box > 1);
});

test("pop-in words appear when they are sung and stay", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "lyr-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const item = { id: "l", text: "ONE TWO", start: 0.5, length: 3, style: "pop", words: [{ text: "ONE", from: 0, to: 1 }, { text: "TWO", from: 1.5, to: 2.5 }], size: 0.1, y: 0.5 };
  const body: any = { aspect: "9:16", tracks: [{ id: "t1", kind: "title", items: [item] }, { id: "a2", kind: "audio", role: "music", items: [{ id: "m", src: { kind: "audio", id: "x" }, start: 0 }] }] };
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  await promisify(execFile)("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", "5", join(dir, "x.wav")]);
  const out = await render(body, { m: { path: join(dir, "x.wav"), still: false, hasAudio: true, duration: 5 } }, join(dir, "r"), { size: { width: W, height: H } });
  const L = layoutLyric(item, W, H);
  const [one, two] = L.placed;
  const near = (frame: Uint8Array, p: any) => look(frame, p.cx - p.w / 2 - 2, p.cx + p.w / 2 + 2, p.cy - L.em * 0.6, p.cy + L.em * 0.6).lit;
  const early = await rgbFrame(out.film, Math.round(0.9 * 24) / 24);
  assert.ok(near(early, one) > 150 && near(early, two) === 0, "ONE is up, TWO is not yet");
  const late = await rgbFrame(out.film, Math.round(3 * 24) / 24);
  assert.ok(near(late, one) > 150 && near(late, two) > 150, "both are up");
  // the lit word is the one being sung: ONE is yellow while sung, white after
  const sung = look(early, one.cx - one.w / 2, one.cx + one.w / 2, one.cy - L.em / 2, one.cy + L.em / 2);
  assert.ok(sung.share > 0.7, "the word being sung is lit");
  const after = look(late, one.cx - one.w / 2, one.cx + one.w / 2, one.cy - L.em / 2, one.cy + L.em / 2);
  assert.ok(after.share < 0.3, "a word sung is back to the base colour");
});

test("a line whose first word starts a moment late still fades in, and the plain-title fallback draws it when libass is missing", async (t) => {
  const items = [{ text: "LATE START", start: 1, length: 3, style: "karaoke", words: [{ text: "LATE", from: 0.05, to: 1.2 }, { text: "START", from: 1.2, to: 2.4 }], size: 0.1, y: 0.5 }];
  const ass = lyricAss(items, { W: 720, H: 1280 }) as string;
  const events = ass.split("\n").filter((l) => l.startsWith("Dialogue"));
  // the first word waits 0.05 s in the base colour, then sweeps; its fade-in carries on where the wait left it
  assert.ok(events.some((e) => e.includes("\\alpha&H") && e.includes("\\t(0,")), "the fade continues across the two events");
  const dir = await mkdtemp(join(tmpdir(), "lyr-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  await promisify(execFile)("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", "5", join(dir, "x.wav")]);
  const body: any = { aspect: "9:16", tracks: [{ id: "t1", kind: "title", items: items.map((i, k) => ({ ...i, id: `l${k}` })) }, { id: "a2", kind: "audio", role: "music", items: [{ id: "m", src: { kind: "audio", id: "x" }, start: 0 }] }] };
  const out = await render(body, { m: { path: join(dir, "x.wav"), still: false, hasAudio: true, duration: 5 } }, join(dir, "r"), { size: { width: W, height: H } });
  const L = layoutLyric(items[0], W, H);
  const lit = (frame: Uint8Array) => look(frame, 0, W, L.placed[0].cy - L.em, L.placed[0].cy + L.em).lit;
  const early = lit(await rgbFrame(out.film, Math.round(1.07 * 24) / 24));
  const full = lit(await rgbFrame(out.film, Math.round(1.8 * 24) / 24));
  assert.ok(full > 300 && early > 0 && early < full, `fading in: ${early} lit pixels at its start, ${full} once it is up`);
  // without libass the same line is a plain title (drawn by drawtext): the planner is told so
  const { planCut } = await import("../server/cut.ts");
  const plain = planCut(body, () => ({ path: "/x", still: false, hasAudio: true, duration: 5 }), { width: W, height: H, font: "/font.ttf", titleFile: (i: number) => `/t${i}.txt`, ass: false });
  assert.ok(plain.video.includes("drawtext") && !plain.video.includes("ass=") && plain.ass === null);
});

test("every caption style is a look the engine knows, laid out and written as subtitles", () => {
  const words = [{ text: "Feel", from: 0, to: 0.6 }, { text: "the", from: 0.6, to: 1 }, { text: "rhythm", from: 1, to: 1.8 }];
  for (const style of Object.keys(LOOKS)) {
    const item = { id: "a", start: 0, length: 3, text: "Feel the rhythm", style, words, y: 0.6 };
    const L = layoutLyric(item, 540, 960);
    assert.equal(L.look.style, style);
    assert.equal(L.placed.length, 3);
    for (const p of L.placed) assert.ok(p.cx - p.w / 2 > -1 && p.cx + p.w / 2 < 541, `${style}: ${p.text} stays in the frame`);
    const ass = lyricAss([item], { W: 540, H: 960 });
    assert.ok(ass && ass.includes("Dialogue:"), `${style} makes subtitles`);
    // a word never shows before it is sung in the styles that bring words in one by one
    if (["pop", "cut", "fade"].includes(L.look.anim)) assert.equal(wordState(style, words[2], 0.5, 3).show, false, `${style}: not yet`);
    assert.equal(wordState(style, words[0], 0.3, 3).show, true);
  }
});

test("a stack is one word to a row in capitals; the typewriter boxes each row; neon glows; hand and comic are turned", () => {
  const item = (style: string) => ({ id: "a", start: 0, length: 3, text: "Feel the rhythm", style, words: [{ text: "Feel", from: 0, to: 1 }, { text: "the", from: 1, to: 2 }, { text: "rhythm", from: 2, to: 3 }] });
  const stack = layoutLyric(item("stack"), 540, 960);
  assert.equal(stack.rows, 3);
  assert.deepEqual(stack.placed.map((p: any) => p.text), ["FEEL", "THE", "RHYTHM"]);
  const type = layoutLyric(item("type"), 540, 960);
  assert.equal(type.boxes.length, 3);
  assert.equal(type.look.face, "type");
  assert.ok(lyricAss([item("type")], { W: 540, H: 960 })!.includes("\\p1}m 0 0 l"), "a box is drawn behind each row");
  assert.ok(lyricAss([item("neon")], { W: 540, H: 960 })!.includes("\\blur"), "neon has a glow layer");
  for (const s of ["hand", "comic"]) {
    const ass = lyricAss([item(s)], { W: 540, H: 960 })!;
    assert.ok(ass.includes("\\frz4") || ass.includes("\\frz5"), `${s} is turned`);
    assert.ok(ass.includes(`\\fn${faceOf(layoutLyric(item(s), 540, 960).look.face).family}`), `${s} is drawn in its own face`);
  }
  // the three first styles are drawn as they always were: the lyric face, nothing added to their tags
  const plain = lyricAss([item("karaoke")], { W: 540, H: 960 })!;
  assert.ok(!plain.includes("\\fn") && !plain.includes("\\frz") && !plain.includes("\\fsp"));
});

test("the film draws each new style on real frames: its words show where the layout put them", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "lyr-looks-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const { writeFile } = await import("node:fs/promises");
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  await promisify(execFile)("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", "4", join(dir, "x.wav")]);
  for (const style of ["stack", "type", "neon", "outline", "hand", "minimal", "comic"]) {
    const item = { id: "l", text: "HOME NOW", start: 0.5, length: 3, style, words: [{ text: "HOME", from: 0, to: 1.2 }, { text: "NOW", from: 1.2, to: 2.4 }], size: 0.1, y: 0.5, color: "#FFFFFF", hi: "#FFFFFF" };
    const body: any = { aspect: "9:16", tracks: [{ id: "t1", kind: "title", items: [item] }, { id: "a2", kind: "audio", role: "music", items: [{ id: "m", src: { kind: "audio", id: "x" }, start: 0 }] }] };
    const out = await render(body, { m: { path: join(dir, "x.wav"), still: false, hasAudio: true, duration: 4 } }, join(dir, `r-${style}`), { size: { width: W, height: H } });
    const L = layoutLyric(item, W, H);
    const frame = await rgbFrame(out.film, Math.round(3 * 24) / 24);
    for (const p of L.placed) {
      const got = look(frame, p.cx - p.w / 2 - 4, p.cx + p.w / 2 + 4, p.cy - L.em * 0.7, p.cy + L.em * 0.7);
      assert.ok(got.lit > 80, `${style}: ${p.text} is on the frame (${got.lit} lit pixels)`);
    }
  }
});
