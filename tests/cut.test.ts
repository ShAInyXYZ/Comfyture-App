// The planner: a film's frame from its aspect, clips filled to it, overlays and stickers placed with
// their alpha kept, a film with no clips, picture and sound in step. Rendered with ffmpeg, read as pixels.

import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { frameSize, planCut, readCutAnswer, cutPrompt, cutBrief, jamBrief } from "../server/cut.ts";
import { WHIP, whipBlur } from "../web/js/fx.js";
import { makeClip, render, rgbFrame } from "./render.ts";

const exec = promisify(execFile);
const tmp = async (t: any) => {
  const dir = await mkdtemp(join(tmpdir(), "cut-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
};
const px = (frame: Uint8Array, w: number, x: number, y: number) => [...frame.slice((Math.floor(y) * w + Math.floor(x)) * 3, (Math.floor(y) * w + Math.floor(x)) * 3 + 3)];
const near = (a: number[], b: number[], tol = 14) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
/** A PNG: `w` x `h`, a colour with an alpha, made by ffmpeg. */
const png = (path: string, w: number, h: number, color: string, extra = "") => exec("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", `color=c=${color}:s=${w}x${h},format=rgba${extra}`, "-frames:v", "1", path]);

test("a frame's size is its aspect's, as large as the clip it starts with", () => {
  assert.deepEqual(frameSize("9:16", { width: 1280, height: 720 }), { width: 720, height: 1280 });
  assert.deepEqual(frameSize("9:16", { width: 608, height: 1088 }), { width: 608, height: 1088 });
  assert.deepEqual(frameSize("16:9", null), { width: 1280, height: 720 });
  assert.deepEqual(frameSize(undefined, { width: 1920, height: 1080 }), { width: 1920, height: 1080 });
  assert.deepEqual(frameSize("1:1", null), { width: 1280, height: 1280 });
});

test("a 16:9 clip in a 9:16 film fills the frame (cover), or leaves bars (contain)", async (t) => {
  const dir = await tmp(t);
  await makeClip(join(dir, "wide.mp4"), 640, 360, 2, "solid", "0x30a030");
  const S = { path: join(dir, "wide.mp4"), still: false, hasAudio: false, duration: 2 };
  const mk = (fit?: string): any => ({ aspect: "9:16", fit, tracks: [{ id: "v1", kind: "video", main: true, items: [{ id: "c", src: { kind: "video", id: "w" } }] }] });
  const cover = await render(mk("cover"), { c: S }, join(dir, "a"), { size: { width: 180, height: 320 } });
  const f = await rgbFrame(cover.film, 0.5);
  assert.ok(near(px(f, 180, 90, 4), [48, 160, 48], 30) && near(px(f, 180, 90, 315), [48, 160, 48], 30), "cover: green to the top and the bottom");
  const contain = await render(mk("contain"), { c: S }, join(dir, "b"), { size: { width: 180, height: 320 } });
  const g = await rgbFrame(contain.film, 0.5);
  assert.ok(near(px(g, 180, 90, 4), [0, 0, 0], 20) && near(px(g, 180, 90, 160), [48, 160, 48], 30), "contain: bars above and below");
});

test("a film with no clips has a dark stage as long as its sound", async (t) => {
  const dir = await tmp(t);
  await exec("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=f=440:d=3", join(dir, "tone.wav")]);
  const body: any = { aspect: "9:16", tracks: [{ id: "a2", kind: "audio", role: "music", items: [{ id: "m", src: { kind: "audio", id: "tone" }, start: 0 }] }] };
  const out = await render(body, { m: { path: join(dir, "tone.wav"), still: false, hasAudio: true, duration: 3 } }, join(dir, "r"), { size: { width: 90, height: 160 } });
  assert.equal(Math.round(out.plan.seconds * 10) / 10, 3);
  const { stdout } = await exec("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,duration", "-of", "csv=p=0", out.film]);
  const durations = stdout.trim().split("\n").map((l) => Number(l.split(",")[1]));
  assert.ok(durations.every((d) => Math.abs(d - 3) < 0.06), `picture and sound both run 3 s: ${durations}`);
  // nothing at all is an error
  assert.throws(() => planCut({ tracks: [{ id: "v1", kind: "video", main: true, items: [] }] } as any, () => null, { width: 90, height: 160, font: null, titleFile: () => "" }), /nothing to render/);
});

test("a sticker lands where it was put, as big as it was made, turned as it was turned, with its alpha", async (t) => {
  const dir = await tmp(t);
  await makeClip(join(dir, "bg.mp4"), 360, 640, 3, "solid", "0x2040c0");
  // a red square, opaque in its left half and half see-through in its right
  await png(join(dir, "sq.png"), 100, 100, "red@1", `,drawbox=x=50:y=0:w=50:h=100:color=red@0.5:t=fill:replace=1`);
  const S = { path: join(dir, "bg.mp4"), still: false, hasAudio: false, duration: 3 };
  const P = { path: join(dir, "sq.png"), still: true, hasAudio: false, duration: 3600 };
  const body = (items: any[]): any => ({ aspect: "9:16", tracks: [{ id: "v2", kind: "video", items }, { id: "v1", kind: "video", main: true, items: [{ id: "c", src: { kind: "video", id: "bg" } }] }] });
  const items = [{ id: "s", src: { kind: "sticker", id: "sq" }, start: 0.5, length: 2, x: 0.75, y: 0.25, w: 0.25, rot: 0 }];
  const out = await render(body(items), { c: S, s: P }, join(dir, "a"), { size: { width: 360, height: 640 } });
  // before it: the background; during it: the sticker's pixels, centred at (270, 160), 90 px wide
  const before = await rgbFrame(out.film, 0.25);
  assert.ok(near(px(before, 360, 270, 160), [32, 64, 192], 12));
  const during = await rgbFrame(out.film, 1.5);
  assert.ok(near(px(during, 360, 240, 160), [255, 0, 0], 40), "the opaque half is red");
  const half = px(during, 360, 290, 160);
  assert.ok(half[0] > 120 && half[0] < 230 && half[2] > 60 && half[2] < 170, `the see-through half lets the blue behind show: ${half}`);
  assert.ok(near(px(during, 360, 270 - 49, 160), [32, 64, 192], 12) && near(px(during, 360, 270 + 49, 160), [32, 64, 192], 12), "and nothing beyond its width");
  assert.ok(near(px(during, 360, 270, 160 - 49), [32, 64, 192], 12) && near(px(during, 360, 270, 160 + 49), [32, 64, 192], 12), "nor its height");
  const after = await rgbFrame(out.film, 2.6);
  assert.ok(near(px(after, 360, 240, 160), [32, 64, 192], 12), "gone when its time is up");
  // turned a quarter: a square's corners reach out where its edges were
  const turned = await render(body([{ ...items[0], rot: 45 }]), { c: S, s: P }, join(dir, "b"), { size: { width: 360, height: 640 } });
  const f = await rgbFrame(turned.film, 1.5);
  assert.ok(near(px(f, 360, 270, 160 - 60), [255, 0, 0], 60) || px(f, 360, 270, 160 - 60)[0] > 100, "a corner points up at 45 degrees");
  assert.ok(near(px(f, 360, 270 - 40, 160 - 40), [32, 64, 192], 12), "where the unturned corner was is clear");
});

test("the sticker with the higher z is on top; a picture overlay keeps its alpha and fades through it", async (t) => {
  const dir = await tmp(t);
  await makeClip(join(dir, "bg.mp4"), 180, 320, 3, "solid", "0x000000");
  await png(join(dir, "red.png"), 80, 80, "red@1");
  await png(join(dir, "green.png"), 80, 80, "green@1");
  await png(join(dir, "ring.png"), 180, 320, "white@0", `,drawbox=x=60:y=100:w=60:h=60:color=white@1:t=fill:replace=1`);
  const S = { path: join(dir, "bg.mp4"), still: false, hasAudio: false, duration: 3 };
  const mk = (z1: number, z2: number): any => ({ aspect: "9:16", tracks: [{ id: "v2", kind: "video", items: [
    { id: "r", src: { kind: "sticker", id: "red" }, start: 0, length: 3, x: 0.5, y: 0.5, w: 0.3, z: z1 },
    { id: "g", src: { kind: "sticker", id: "green" }, start: 0, length: 3, x: 0.55, y: 0.5, w: 0.3, z: z2 }] },
  { id: "v1", kind: "video", main: true, items: [{ id: "c", src: { kind: "video", id: "bg" } }] }] });
  const files = { c: S, r: { path: join(dir, "red.png"), still: true, hasAudio: false, duration: 3600 }, g: { path: join(dir, "green.png"), still: true, hasAudio: false, duration: 3600 } };
  const a = await render(mk(1, 2), files, join(dir, "a"), { size: { width: 180, height: 320 } });
  const b = await render(mk(2, 1), files, join(dir, "b"), { size: { width: 180, height: 320 } });
  const fa = await rgbFrame(a.film, 1);
  const fb = await rgbFrame(b.film, 1);
  // the overlap is around x = 90..95 (the red one's right part, the green one's left part)
  assert.ok(near(px(fa, 180, 92, 160), [0, 128, 0], 30), "green on top when it has the higher z");
  assert.ok(near(px(fb, 180, 92, 160), [255, 0, 0], 30), "red on top when it has");
  // a full-frame picture overlay with transparency: the transparent part shows the clip beneath, and a fade-in starts clear
  const over: any = { aspect: "9:16", tracks: [{ id: "v2", kind: "video", items: [{ id: "o", src: { kind: "photo", id: "ring" }, start: 0, length: 3, fadeIn: 1 }] }, { id: "v1", kind: "video", main: true, items: [{ id: "c", src: { kind: "video", id: "bg" } }] }] };
  const o = await render(over, { c: S, o: { path: join(dir, "ring.png"), still: true, hasAudio: false, duration: 3600 } }, join(dir, "c"), { size: { width: 180, height: 320 } });
  const start = await rgbFrame(o.film, 0);
  const full = await rgbFrame(o.film, 2);
  assert.ok(near(px(start, 180, 90, 130), [0, 0, 0], 8), "the overlay is clear at the start of its fade");
  assert.ok(near(px(full, 180, 90, 130), [255, 255, 255], 12), "and opaque after");
  assert.ok(near(px(full, 180, 10, 10), [0, 0, 0], 8), "its transparent part leaves the clip showing, not a black or a white");
});

test("a long effect graph goes in a script file and still renders", async (t) => {
  const dir = await tmp(t);
  await makeClip(join(dir, "bg.mp4"), 180, 320, 24, "square", "0x405080");
  // beats a little uneven (a hand on them), an effect firing twice a beat for 22 s: far more than a command line holds
  const times = Array.from({ length: 70 }, (_, i) => Math.round((0.2 + i * 0.4839 + Math.sin(i * 12.9898) * 0.012) * 1000) / 1000);
  const body: any = { aspect: "9:16", beats: { bpm: 124, offset: 0, times, down: 0, source: "test" }, tracks: [
    { id: "fx", kind: "fx", items: [
      { id: "s", kind: "shake", every: 0.5, intensity: 1, dur: 0.12, start: 0, length: 22 },
      { id: "z", kind: "zoom", every: 0.5, intensity: 1, dur: 0.12, start: 0, length: 22 },
      { id: "f", kind: "flash", every: 1, intensity: 0.6, dur: 0.1, start: 0, length: 22 }] },
    { id: "v1", kind: "video", main: true, items: [{ id: "c", src: { kind: "video", id: "bg" } }] }] };
  const out = await render(body, { c: { path: join(dir, "bg.mp4"), still: false, hasAudio: false, duration: 24 } }, join(dir, "r"), { size: { width: 180, height: 320 } });
  assert.ok(out.plan.video.length > 24000, `the graph is long: ${out.plan.video.length} characters`);
  const { stdout } = await exec("ffprobe", ["-v", "error", "-show_entries", "stream=nb_frames,width,height", "-of", "csv=p=0", out.picture]);
  assert.equal(stdout.trim(), "180,320,576");
});

test("a whip joins a clip by sweeping the clip before up into it, in the last five frames, with the film no longer or shorter", async (t) => {
  const dir = await tmp(t);
  const [W, H] = [180, 320];
  await makeClip(join(dir, "a.mp4"), W, H, 3, "solid", "0xc02020");
  await makeClip(join(dir, "b.mp4"), W, H, 3, "solid", "0x2040c0");
  await makeClip(join(dir, "c.mp4"), W, H, 3, "solid", "0x20a040");
  const files = Object.fromEntries(["a", "b", "c"].map((id) => [id, { path: join(dir, `${id}.mp4`), still: false, hasAudio: false, duration: 3 }]));
  const film = (join2: "cut" | "whip") => ({ aspect: "9:16", fit: "cover", tracks: [{ id: "v1", kind: "video", main: true, items: [
    { id: "a", src: { kind: "video", id: "a" }, from: 0, to: 3 },
    { id: "b", src: { kind: "video", id: "b" }, from: 0, to: 3, join: join2 },
    { id: "c", src: { kind: "video", id: "c" }, from: 0, to: 3, join: join2 },
  ] }] });
  const frames = async (path: string) => Number((await exec("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", path])).stdout.trim());
  const cut = await render(film("cut") as any, files, join(dir, "cut"), { size: { width: W, height: H } });
  const whip = await render(film("whip") as any, files, join(dir, "whip"), { size: { width: W, height: H } });
  // the same length, to the frame: the five whip frames stand where the clip before's last five were
  assert.equal(whip.plan.seconds, cut.plan.seconds);
  assert.equal(await frames(whip.picture), 216);
  assert.equal(await frames(cut.picture), 216);
  const red = (p: number[]) => p[0] > p[2] + 60;
  const blue = (p: number[]) => p[2] > p[0] + 60 && p[2] > p[1] + 60;
  const green = (p: number[]) => p[1] > p[0] + 40 && p[1] > p[2] + 40;
  // before the whip, the clip itself; after it, the next one whole
  assert.ok(red(px(await rgbFrame(whip.picture, 66 / 24), W, 90, 160)), "frame 66 is still the red clip");
  assert.ok(blue(px(await rgbFrame(whip.picture, 72 / 24), W, 90, 160)), "frame 72 is the blue clip");
  assert.ok(green(px(await rgbFrame(whip.picture, 144 / 24), W, 90, 160)), "frame 144 is the green clip");
  // each whip frame: the window is where the numbers put it: the next clip above its seam, the one before below
  for (const [first, next, now, was] of [[67, 72, blue, red], [139, 144, green, blue]] as const) {
    for (let k = 0; k < WHIP.frames; k++) {
      const frame = await rgbFrame(whip.picture, (first + k) / 24);
      const seam = Math.round((1 - WHIP.tops[k]) * H);
      const r = whipBlur(k, H) + 3;
      if (seam - r > 4) assert.ok(now(px(frame, W, 90, (seam - r) / 2)), `frame ${first + k}: the next clip above the seam at ${seam}`);
      assert.ok(was(px(frame, W, 90, (seam + r + H) / 2)), `frame ${first + k}: the clip before below the seam at ${seam}`);
      // the blur is a smear across the seam: on it, the two colours are mixed
      const mid = px(frame, W, 90, seam);
      assert.ok(!now(mid) && !was(mid), `frame ${first + k}: the seam at ${seam} is a smear, not an edge (${mid})`);
    }
    assert.ok(now(px(await rgbFrame(whip.picture, next / 24), W, 90, 160)), `frame ${next} is the next clip`);
  }
});

test("a whip does not stall ffmpeg when a clip's length does not fall on a whole frame (4.917 s of a 5.375 s take)", { timeout: 120000 }, async (t) => {
  const dir = await tmp(t);
  const [W, H] = [180, 320];
  await makeClip(join(dir, "a.mp4"), W, H, 5.375, "bars");
  await makeClip(join(dir, "b.mp4"), W, H, 5.375, "square", "0x2040c0");
  const files = Object.fromEntries(["a", "b"].map((id) => [id, { path: join(dir, `${id}.mp4`), still: false, hasAudio: false, duration: 5.375 }]));
  const frames = async (path: string) => Number((await exec("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", path])).stdout.trim());
  // these lengths counted one frame more than the planner's estimate (119 against 118, 75 against 74, 63 against 62), and ffmpeg 4's graph stopped answering
  for (const use of [4.917, 3.1, 2.6, 3.083, 4.9]) {
    const film = (how: string) => ({ aspect: "9:16", tracks: [{ id: "v1", kind: "video", main: true, items: [
      { id: "a", src: { kind: "video", id: "a" }, from: 0, to: use },
      { id: "b", src: { kind: "video", id: "b" }, from: 0, to: use, join: how },
    ] }] });
    const whip = await render(film("whip") as any, files, join(dir, `w${use}`), { size: { width: W, height: H }, timeout: 20000 });
    const cut = await render(film("cut") as any, files, join(dir, `c${use}`), { size: { width: W, height: H }, timeout: 20000 });
    const [w, c] = [await frames(whip.picture), await frames(cut.picture)];
    // the same length as a cut would be, give or take the frame resampling counts differently
    assert.ok(Math.abs(w - c) <= 2, `${use} s: ${w} frames with a whip, ${c} with a cut`);
  }
});

test("a whip between two full-size takes (1152x2048, 129 frames, 4.917 s of each) renders in a minute, as long as a cut", { timeout: 300000 }, async (t) => {
  const dir = await tmp(t);
  const [W, H] = [1152, 2048];
  await makeClip(join(dir, "a.mp4"), W, H, 5.375, "square", "0xc02020");
  await makeClip(join(dir, "b.mp4"), W, H, 5.375, "square", "0x2040c0");
  const files = { t1: { path: join(dir, "a.mp4"), still: false, hasAudio: false, duration: 5.375 }, t2: { path: join(dir, "b.mp4"), still: false, hasAudio: false, duration: 5.375 } };
  const film = (how: string) => ({ aspect: "9:16", product: "mixer", tracks: [{ id: "video", kind: "video", main: true, items: [
    { id: "t1", src: { kind: "video", id: "a" }, from: 0, to: 4.917, sound: false, join: "cut" },
    { id: "t2", src: { kind: "video", id: "b" }, from: 0, to: 4.917, sound: false, join: how },
  ] }] });
  const t0 = Date.now();
  const whip = await render(film("whip") as any, files, join(dir, "whip"), { size: { width: W, height: H }, timeout: 90000 });
  const took = (Date.now() - t0) / 1000;
  const cut = await render(film("cut") as any, files, join(dir, "cut"), { size: { width: W, height: H }, timeout: 90000 });
  const probe = async (path: string) => (await exec("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=width,height,nb_read_frames", "-of", "csv=p=0", path])).stdout.trim();
  const [w, c] = [await probe(whip.picture), await probe(cut.picture)];
  assert.match(w, /^1152,2048,\d+$/, w);
  assert.ok(Math.abs(Number(w.split(",")[2]) - Number(c.split(",")[2])) <= 1, `${w} with a whip, ${c} with a cut`);
  assert.ok(took < 90, `the whip took ${took} s`);
});

test("a clip too short to give its last frames is cut into, a whip or not; the sound is the same either way", async (t) => {
  const dir = await tmp(t);
  const [W, H] = [90, 160];
  await makeClip(join(dir, "a.mp4"), W, H, 3, "solid", "0xc02020");
  await makeClip(join(dir, "b.mp4"), W, H, 3, "solid", "0x2040c0");
  const files = Object.fromEntries(["a", "b"].map((id) => [id, { path: join(dir, `${id}.mp4`), still: false, hasAudio: false, duration: 3 }]));
  const film = (join2: string) => ({ aspect: "9:16", fit: "cover", tracks: [{ id: "v1", kind: "video", main: true, items: [
    { id: "a", src: { kind: "video", id: "a" }, from: 0, to: 0.5 },
    { id: "b", src: { kind: "video", id: "b" }, from: 0, to: 1, join: join2 },
  ] }] });
  const cut = await render(film("cut") as any, files, join(dir, "cut"), { size: { width: W, height: H } });
  const whip = await render(film("whip") as any, files, join(dir, "whip"), { size: { width: W, height: H } });
  assert.equal(whip.plan.seconds, cut.plan.seconds);
  assert.equal(whip.plan.video.includes("vstack"), false, "no whip was built");
  // a clip that can give them: the whip is built, and the sound is what the cut's would be
  const long = (join2: string) => ({ ...film(join2), tracks: [{ id: "v1", kind: "video", main: true, items: [
    { id: "a", src: { kind: "video", id: "a" }, from: 0, to: 2 },
    { id: "b", src: { kind: "video", id: "b" }, from: 0, to: 1, join: join2 },
  ] }] });
  const [p1, p2] = [long("cut"), long("whip")].map((b) => planCut(b as any, (it: any) => files[it.id] as any, { width: W, height: H, font: null, titleFile: (i) => `t${i}.txt` }));
  assert.equal(p2.audio, p1.audio);
  assert.equal(p2.seconds, p1.seconds);
  assert.ok(p2.video.includes("vstack"));
});

test("the assistant's actions are checked: known ones only, fields in range", () => {
  // (the beats, effects, stickers and lyrics are the music video's: Pickle's answer carries them)
  const r = readCutAnswer(JSON.stringify({ reply: "ok", actions: [
    { op: "effect", kind: "zoom", every: 4, intensity: 9, dur: 0.01, from: 0, to: 30 },
    { op: "effect", kind: "explode" },
    { op: "beats", action: "detect" },
    { op: "beats", bpm: 1000 },
    { op: "sticker", name: "star", at: 3, x: 3, w: 0 },
    { op: "lyrics", style: "bounce", line: 2, shift: 0.2 },
    { op: "lyrics", style: "disco" },
    { op: "snap", to: "bar" },
    { op: "draft" },
    { op: "format-disk" },
    { op: "join", clip: 3, join: "whip" },
    { op: "join", clip: 2, join: "spin" },
  ] }), "jam");
  assert.equal(r.actions.length, 10);
  const [zoom, detect, bpm, sticker, lyrics, bad, snap, , whip, spin] = r.actions as any[];
  assert.deepEqual([whip.clip, whip.join], [3, "whip"]);
  assert.equal(spin.join, "cut");
  assert.equal(zoom.intensity, 2);
  assert.equal(zoom.dur, 0.04);
  assert.equal(detect.action, "detect");
  assert.equal(bpm.bpm, 300);
  assert.equal(sticker.x, 1.5);
  assert.equal(sticker.w, 0.03);
  assert.deepEqual([lyrics.style, lyrics.line, lyrics.shift], ["bounce", 2, 0.2]);
  assert.equal(bad.style, undefined);
  assert.equal(snap.to, "bar");
  assert.match(cutPrompt({ length: 12, aspect: "9:16", clips: [], sounds: [], titles: [], beats: { bpm: 120, count: 24, first: 0.1, offset: 0, source: "web", down: 0 }, effects: [{ kind: "zoom", every: 4, intensity: 0.6, start: 0, length: 12 }], stickers: [], lyrics: [{ n: 1, text: "hi", start: 1, length: 2, style: "karaoke" }] }, [{ role: "user", text: "more pulse" }]), /120 bpm, 24 beats/);
  assert.match(jamBrief(["star", "heart"]), /names: star, heart/);
});

test("Kitchen's Cut room is told its own actions only: not the beats, the effects, the stickers or the lyrics, and not Jam's", () => {
  const brief = cutBrief();
  for (const op of ["trim", "move", "remove", "join", "motion", "fade", "grade", "speed", "title", "music", "sound", "voice", "volume", "render"]) assert.ok(brief.includes(`{"op": "${op}"`), `it has ${op}`);
  for (const op of ["beats", "snap", "effect", "sticker", "lyrics", "draft", "part", "words", "captions", "artist", "vibe", "shots", "open"]) assert.ok(!brief.includes(`{"op": "${op}"`), `it has no ${op}`);
  assert.doesNotMatch(brief, /Pickle|Jam|music video/);
  // and what comes back for it is read the same way: an action it was not told of is not done
  const r = readCutAnswer(JSON.stringify({ reply: "ok", actions: [{ op: "trim", clip: 1, seconds: 2 }, { op: "effect", kind: "zoom" }, { op: "beats", action: "detect" }, { op: "captions", style: "pop" }, { op: "open", workspace: "edit" }, { op: "music", prompt: "piano" }] }));
  assert.deepEqual(r.actions.map((a: any) => a.op), ["trim", "music"]);
  // the beats, effects, stickers and lyrics are in its picture of the edit only when the edit has some
  const plain = cutPrompt({ length: 5, aspect: "16:9", clips: [{ n: 1, name: "a", start: 0, length: 5 }], sounds: [], titles: [] }, [{ role: "user", text: "hi" }]);
  assert.doesNotMatch(plain, /Beats:|Effects:|Stickers:|Lyrics:/);
  assert.match(cutPrompt({ length: 5, aspect: "16:9", clips: [], effects: [{ kind: "zoom", every: 4, intensity: 0.6, start: 0, length: 5 }] }, [{ role: "user", text: "hi" }]), /Effects:\n- zoom/);
});

test("Pickle's brief is Jam's only: its four workspaces and its own actions, no other product, and nothing that spends credits", () => {
  const brief = jamBrief(["star", "heart"]);
  assert.match(brief, /You are Pickle/);
  assert.match(brief, /band leader/);
  for (const w of ["the track", "the words", "the band", "the edit"]) assert.ok(brief.includes(w), `it knows ${w}`);
  for (const op of ["part", "words", "captions", "artist", "vibe", "shots", "open"]) assert.ok(brief.includes(`{"op": "${op}"`), `it has the ${op} action`);
  assert.match(brief, /names: star, heart/);
  assert.doesNotMatch(brief, /Kitchen|Mixer|Macaron|Utensils|Brioche|Ketkout|Truffle/, "nothing of the rest of the app");
  assert.doesNotMatch(brief, /\{"op": "(music|sound|voice)"/, "it is not offered what makes a track, a sound or a voice");
  assert.match(brief, /never start anything that costs credits/i);
  // Kitchen's Cut keeps its own brief, with the actions that make sounds
  assert.match(cutBrief(), /\{"op": "music"/);
  assert.doesNotMatch(cutBrief(), /You are Pickle/);
});

test("Pickle is told which workspace is open and what the jam holds, before the edit's own state", () => {
  const jam = { workspace: "words", track: { name: "Toc Toc", seconds: 9.833, bpm: 124.2, from: 0, to: 9.8, drop: 2.4, loud: 4 }, words: { count: 5, heard: false, style: "pop" }, artist: "Josie", dance: 9.8, vibe: "pastel room", shots: [{ kind: "dance", from: 0, to: 2.1 }, { kind: "broll", from: 2.1, to: 4 }], costs: { track: "≈ 8 cr for 30 s", words: "≈ 2 cr", video: "nothing more to make" } };
  const text = cutPrompt({ jam }, [{ role: "user", text: "bigger captions" }]);
  assert.match(text, /^JAM NOW$/m);
  assert.match(text, /workspace open: words/);
  assert.match(text, /track: "Toc Toc", 9.8 s, 124.2 bpm; the part used runs 0 to 9.8 s; the drop is at 2.4 s; the loudest stretch starts at 4 s/);
  assert.match(text, /words: 5 lines, typed; captions pop/);
  assert.match(text, /artist: Josie/);
  assert.match(text, /dance to copy: 9.8 s/);
  assert.match(text, /shots: 1\. dance 0-2.1 s; 2\. broll 2.1-4 s/);
  assert.match(text, /keys that cost credits: make a track ≈ 8 cr for 30 s, hear the words ≈ 2 cr, make the video nothing more to make/);
  // before there is an edit, it says so (he can answer all the same)
  assert.match(text, /THE EDIT NOW\n\(no edit yet/);
  assert.match(text, /User: bigger captions/);
  // a workspace he was not told of is the track; a jam with no song yet says so
  assert.match(cutPrompt({ jam: { workspace: "kitchen" } }, [{ role: "user", text: "hi" }]), /workspace open: track\ntrack: \(none yet\)/);
  // Kitchen's Cut is told nothing of Jam
  assert.doesNotMatch(cutPrompt({ length: 5, aspect: "16:9", clips: [] }, [{ role: "user", text: "hi" }]), /JAM NOW/);
});

test("Pickle's actions are checked: Jam's own, fields in range, a workspace or a window only if it exists, nothing that spends", () => {
  const raw = [
    { op: "part", seconds: 0 }, { op: "part", seconds: 9000, from: -4 }, { op: "part", drop: true }, { op: "part", chorus: "yes" },
    { op: "words", text: "one\ntwo" }, { op: "words", text: "   " },
    { op: "captions", style: "bounce", size: 9 }, { op: "captions", style: "disco", size: 0.001 },
    { op: "artist", name: " Josie " }, { op: "artist" },
    { op: "vibe", text: "pastel room" },
    { op: "shots", every: 4 }, { op: "shots", every: 3 }, { op: "shots", shot: 2, kind: "dance" }, { op: "shots", kind: "karaoke" },
    { op: "open", workspace: "edit", window: "make" }, { op: "open", workspace: "stage" }, { op: "open", window: "the-vault" },
    { op: "music", prompt: "a hit" }, { op: "sound", prompt: "a bang" }, { op: "voice", line: "hello" },
    { op: "effect", kind: "zoom", every: 4 },
  ];
  const r = readCutAnswer(JSON.stringify({ reply: "ok", actions: raw }), "jam");
  const ops = r.actions.map((a: any) => a.op);
  assert.ok(!ops.some((o: string) => ["music", "sound", "voice"].includes(o)), "what spends credits is not carried");
  assert.equal(ops.at(-1), "effect", "the editor's own actions still are");
  const by = (op: string) => r.actions.filter((a: any) => a.op === op) as any[];
  const [zero, far, drop, chorus] = by("part");
  assert.deepEqual([zero.seconds, far.seconds, far.from, drop.drop, chorus.chorus], [0, 600, 0, true, undefined]);
  assert.deepEqual(by("words").map((a) => a.text), ["one\ntwo"], "empty words are not an action");
  const [bounce, disco] = by("captions");
  assert.deepEqual([bounce.style, bounce.size, disco.style, disco.size], ["bounce", 0.2, undefined, 0.04]);
  assert.deepEqual(by("artist").map((a) => a.name), ["Josie"]);
  assert.deepEqual(by("vibe").map((a) => a.text), ["pastel room"]);
  assert.deepEqual(by("shots").map((a) => [a.every, a.shot, a.kind]), [[4, undefined, undefined], [undefined, 2, "dance"]], "every 1, 2 or 4 bars; a shot's kind among the three");
  assert.deepEqual(by("open").map((a) => [a.workspace, a.window]), [["edit", "make"]], "a workspace or a window that does not exist is not opened");
  // the same answer for Kitchen's Cut (no product) still carries the sound ones
  const kitchen = readCutAnswer(JSON.stringify({ reply: "ok", actions: raw }));
  assert.ok(kitchen.actions.some((a: any) => a.op === "music"));
});
