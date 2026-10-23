// The Edit tools: what a request is made safe into, the ffmpeg arguments each of the twelve tools builds (read as plain
// arrays), the caption file, the cue and geometry helpers, and every tool run for real on a two-second clip made by ffmpeg
// (its output probed: duration, size, streams). Free and local: needs ffmpeg and ffprobe, never calls Comfy Cloud.

import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { TOOLS, clean, plan, atempoChain, gradeChain, captionAss, createEdit, fileName, type Ctx, type Probe, type Tool } from "../server/utensils-edit.ts";
import { parseCues, toSrt, cleanCues, seconds, timecode } from "../web/js/utensils-edit-cues.js";
import { reframeBox, letterboxFrame, frameOf } from "../web/js/utensils-edit-geometry.js";

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, "..");

const clip = (over: Partial<Probe> = {}): Probe => ({ path: "/data/videos/a.mp4", duration: 10, width: 1280, height: 720, fps: 24, hasAudio: true, hasVideo: true, ...over });
const ctx = (over: Partial<Ctx> = {}): Ctx => ({ work: "/work", videos: [clip()], ...over });
const arg = (args: string[], flag: string) => args[args.indexOf(flag) + 1];
const has = (args: string[], ...parts: string[]) => parts.every((p) => args.some((a) => a.includes(p)));

// ---------------------------------------------------------------- what a request is made safe into

test("every number is clamped, every choice comes from its list, every file is a plain name", () => {
  assert.equal(clean("speed", { factor: 99 }).factor, 4);
  assert.equal(clean("speed", { factor: 0 }).factor, 0.25);
  assert.equal(clean("loop", { times: 1000 }).times, 10);
  assert.equal(clean("reframe", { format: "21:9", zoom: -5, x: 7 }).format, "9:16");
  assert.deepEqual([clean("reframe", { zoom: -5 }).zoom, clean("reframe", { x: 7 }).x], [1, 1]);
  assert.equal(clean("convert", { format: "exe" }).format, "mp4");
  assert.equal(clean("convert", { height: "; rm -rf /" }).height, "0");
  assert.equal(clean("logo", { corner: "../../x" }).corner, "br");
  assert.equal(clean("grade", { preset: "$(evil)" }).preset, "none");
  assert.equal(clean("captions", { colour: "red; drawbox" }).colour, "#F2FF59");
  assert.equal(clean("audio", { mode: "x" }).mode, "mute");
  assert.equal(fileName("../../etc/passwd"), "");
  assert.equal(fileName("a/b.mp4"), "");
  assert.equal(fileName("abc123.mp4"), "abc123.mp4");
  assert.equal(fileName(".hidden"), "");
});

test("a trim's end stays after its start and inside the clip", () => {
  assert.deepEqual(clean("trim", { start: 3, end: 1 }, { duration: 10 }), { start: 3, end: 3.1, mode: "auto" });
  assert.equal(clean("trim", { start: 0, end: 99 }, { duration: 10 }).end, 10);
  assert.equal(clean("trim", { start: -4 }, { duration: 10 }).start, 0);
});

test("a caption's words lose their markup and the list is in time order, with nothing empty", () => {
  const cues = cleanCues([{ start: 2, end: 3, text: "{\\an8}second" }, { start: 0, end: 1, text: "first" }, { start: 1, end: 1, text: "no length" }, { start: 0, end: 1, text: "   " }], 60);
  assert.deepEqual(cues.map((c: any) => c.text), ["first", "\\an8second"]);
  assert.ok(cues.every((c: any) => !/[{}]/.test(c.text)));
});

// ---------------------------------------------------------------- the cues, the geometry

test(".srt and .vtt files are read into cues and written back", () => {
  const srt = "1\n00:00:01,000 --> 00:00:02,500\nHello\n\n2\n00:00:03,000 --> 00:00:04,000\nTwo lines\nhere\n";
  assert.deepEqual(parseCues(srt), [{ start: 1, end: 2.5, text: "Hello" }, { start: 3, end: 4, text: "Two lines\nhere" }]);
  const vtt = "WEBVTT\n\n00:01.000 --> 00:02.000 align:start\n<c.yellow>Tag</c> gone\n\n";
  assert.deepEqual(parseCues(vtt), [{ start: 1, end: 2, text: "Tag gone" }]);
  assert.deepEqual(parseCues(toSrt(parseCues(srt))), parseCues(srt));
  assert.equal(seconds("1:02.500"), 62.5);
  assert.equal(timecode(3661.5), "01:01:01,500");
});

test("a crop frame is as big as the clip allows, even-sided, and never leaves it", () => {
  const src = { width: 1280, height: 720 };
  const b = reframeBox(src, "9:16", 1, 0.5, 0.5);
  assert.deepEqual([b.cw, b.ch], [404, 720]);
  assert.equal(b.x, 438);
  assert.ok(b.w % 2 === 0 && b.h % 2 === 0 && b.w * 16 - b.h * 9 <= 16, `${b.w}x${b.h} is 9:16`);
  const left = reframeBox(src, "9:16", 1, 0, 0);
  const right = reframeBox(src, "9:16", 1, 1, 1);
  assert.equal(left.x, 0);
  assert.equal(right.x + right.cw, 1280);
  const zoomed = reframeBox(src, "1:1", 2, 1, 0.5);
  assert.deepEqual([zoomed.cw, zoomed.ch], [360, 360]);
  assert.equal(reframeBox(src, "16:9", 1).cw, 1280);
  // a tall clip into a wide frame: the window is as wide as the clip
  const tall = reframeBox({ width: 720, height: 1280 }, "16:9", 1);
  assert.deepEqual([tall.cw, tall.ch], [720, 404]);
  assert.deepEqual(letterboxFrame(src, "9:16"), { w: 720, h: 1280 });
  assert.deepEqual(frameOf(1, 1080), { w: 1080, h: 1080 });
});

// ---------------------------------------------------------------- the plans of the twelve tools

test("trim copies the stream when the cut starts on a keyframe, else it encodes", () => {
  const p = clean("trim", { start: 2, end: 5 }, { duration: 10 });
  const copy = plan("trim", p, ctx({ startOnKeyframe: true })).steps[0].args;
  assert.deepEqual([arg(copy, "-ss"), arg(copy, "-t"), arg(copy, "-c")], ["2", "3", "copy"]);
  const enc = plan("trim", p, ctx({ startOnKeyframe: false })).steps[0].args;
  assert.equal(arg(enc, "-c:v"), "libx264");
  assert.ok(!enc.includes("copy"));
  assert.equal(arg(plan("trim", clean("trim", { start: 2, end: 5, mode: "copy" }, { duration: 10 }), ctx()).steps[0].args, "-c"), "copy");
  assert.ok(plan("trim", p, ctx({ videos: [clip({ hasAudio: false })] })).steps[0].args.includes("-an"));
});

test("reframe crops where the frame sits, or fits the clip over a blurred or coloured ground", () => {
  const fill = plan("reframe", clean("reframe", { format: "9:16", x: 0, zoom: 1 }), ctx()).steps[0].args;
  assert.equal(arg(fill, "-vf"), "crop=404:720:0:0,scale=404:720:flags=lanczos,setsar=1");
  const blur = plan("reframe", clean("reframe", { format: "9:16", fill: "blur" }), ctx()).steps[0].args;
  assert.ok(has(blur, "gblur", "overlay=(W-w)/2:(H-h)/2", "scale=720:1280"));
  assert.equal(arg(blur, "-map"), "[v]");
  const colour = plan("reframe", clean("reframe", { format: "1:1", fill: "colour", colour: "#49378b" }), ctx()).steps[0].args;
  assert.ok(has(colour, "pad=720:720", "color=0x49378B"));
});

test("speed sets the picture's pace and the sound's pitch-kept tempo; slow-mo can be interpolated", () => {
  const two = plan("speed", clean("speed", { factor: 2 }), ctx());
  assert.equal(two.seconds, 5);
  assert.ok(has(two.steps[0].args, "setpts=PTS/2"));
  assert.equal(arg(two.steps[0].args, "-af"), "atempo=2");
  assert.equal(atempoChain(4), "atempo=2,atempo=2");
  assert.equal(atempoChain(0.25), "atempo=0.5,atempo=0.5");
  assert.equal(atempoChain(8), "atempo=2,atempo=2,atempo=2");
  assert.equal(atempoChain(0.75), "atempo=0.75");
  const slow = plan("speed", clean("speed", { factor: 0.5, smooth: true }), ctx()).steps[0].args;
  assert.ok(has(slow, "minterpolate=fps=24"));
  assert.ok(!has(plan("speed", clean("speed", { factor: 0.5 }), ctx()).steps[0].args, "minterpolate"));
  assert.ok(plan("speed", clean("speed", { factor: 2 }), ctx({ videos: [clip({ hasAudio: false })] })).steps[0].args.includes("-an"));
});

test("reverse turns picture and sound; loop repeats or ping-pongs", () => {
  const r = plan("reverse", {}, ctx()).steps[0].args;
  assert.ok(has(r, "reverse") && arg(r, "-af") === "areverse");
  const l = plan("loop", clean("loop", { times: 3 }), ctx());
  assert.equal(arg(l.steps[0].args, "-stream_loop"), "2");
  assert.equal(l.seconds, 30);
  const pp = plan("loop", clean("loop", { times: 2, pingpong: true }), ctx());
  assert.ok(has(pp.steps[0].args, "concat=n=4:v=1:a=0", "areverse", "concat=n=4:v=0:a=1"));
  assert.equal(pp.seconds, 40);
});

test("merge scales every clip to one frame and joins them, with a crossfade when asked", () => {
  const two = ctx({ videos: [clip({ duration: 4 }), clip({ path: "/data/videos/b.mp4", duration: 6, hasAudio: false, width: 640, height: 360 })] });
  const cut = plan("merge", clean("merge", {}), two);
  assert.equal(cut.seconds, 10);
  assert.ok(has(cut.steps[0].args, "concat=n=2:v=1:a=1", "anullsrc"));
  const fade = plan("merge", clean("merge", { crossfade: 1 }), two);
  assert.equal(fade.seconds, 9);
  assert.ok(has(fade.steps[0].args, "xfade=transition=fade:duration=1:offset=3", "acrossfade=d=1"));
  const vertical = plan("merge", clean("merge", { aspect: "9:16", fit: "cover" }), two).steps[0].args;
  assert.ok(has(vertical, "scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280"));
});

test("captions go into an ASS file, never into the command", () => {
  const p = clean("captions", { cues: [{ start: 1, end: 2, text: "Hello; drawbox=x=0\nsecond" }], style: "box", size: 8, caps: true });
  const made = plan("captions", p, ctx());
  assert.ok(has(made.steps[0].args, "subtitles=sub.ass:fontsdir=fonts"));
  assert.ok(!made.steps[0].args.join(" ").includes("Hello"));
  const ass = made.files!["sub.ass"];
  assert.match(ass, /PlayResX: 1280/);
  assert.match(ass, /PlayResY: 720/);
  assert.match(ass, /Dialogue: 0,0:00:01.00,0:00:02.00,Cap,,0,0,0,,HELLO; DRAWBOX=X=0\\NSECOND/);
  assert.match(ass, /Style: Cap,DejaVu Sans,58,/);
  // box: BorderStyle 3
  assert.match(ass, /,3,\d+,0,2,77,77,50,1/);
  for (const style of ["bold", "outline", "minimal"]) assert.match(captionAss({ ...p, style }, 1280, 720), /Style: Cap,/);
  assert.match(captionAss({ ...p, font: "lyric", position: "top" }, 1280, 720), /Comfyture Lyric,\d+,.*,8,/);
  assert.match(captionAss({ ...p, style: "outline", colour: "#F2FF59" }, 1280, 720), /&H0059FFF2/);
});

test("grade chains the LUT, the exposure, contrast and saturation, the colour balance and the preset's curve", () => {
  assert.equal(gradeChain(clean("grade", {}), null), "eq=brightness=0:contrast=1:saturation=1");
  const filmic = gradeChain(clean("grade", { preset: "filmic" }), null);
  assert.ok(has([filmic], "curves=all='0/0.03", "colorbalance"));
  const noir = gradeChain(clean("grade", { preset: "noir" }), null);
  assert.ok(has([noir], "saturation=0", "vignette"));
  assert.ok(gradeChain(clean("grade", { preset: "warm", temperature: 0.2 }), "lut.cube").startsWith("lut3d=file=lut.cube,"));
  assert.equal(arg(plan("grade", clean("grade", { preset: "punchy" }), ctx()).steps[0].args, "-vf").includes("contrast=1.22"), true);
});

test("logo is placed in its corner at its size, opacity and fades, over the clip's whole length", () => {
  const p = clean("logo", { corner: "tr", scale: 20, opacity: 0.5, margin: 5, fadeIn: 1, fadeOut: 2 }, { duration: 10 });
  const made = plan("logo", p, ctx({ image: clip({ path: "/data/photos/l.png", width: 200, height: 80, duration: 0 }) }));
  const args = made.steps[0].args;
  assert.ok(has(args, "scale=256:-2", "colorchannelmixer=aa=0.5", "fade=t=in:st=0:d=1:alpha=1", "fade=t=out:st=8:d=2:alpha=1", "overlay=x=W-w-64:y=64:shortest=1", "between(t,0,10)"));
  assert.equal(arg(args, "-i"), "/data/videos/a.mp4");
  assert.ok(args.includes("/data/photos/l.png"));
});

test("audio mutes, replaces or mixes; a new sound is looped and cut to the clip", () => {
  const sound = clip({ path: "/data/audio/s.mp3", duration: 2, hasVideo: false });
  const mute = plan("audio", clean("audio", { mode: "mute" }), ctx()).steps[0].args;
  assert.ok(mute.includes("-an") && arg(mute, "-c:v") === "copy");
  const replace = plan("audio", clean("audio", { mode: "replace", volume: 0.5 }), ctx({ audio: sound })).steps[0].args;
  assert.ok(has(replace, "[1:a]volume=0.5") && replace.includes("-stream_loop") && arg(replace, "-t") === "10");
  const mix = plan("audio", clean("audio", { mode: "mix", volume: 0.5, videoVolume: 0.8, fadeOut: 2 }), ctx({ audio: sound })).steps[0].args;
  assert.ok(has(mix, "[0:a]volume=0.8", "amix=inputs=2:duration=first", "afade=t=out:st=8:d=2"));
  // a clip with no sound of its own: a mix is the new sound alone
  const alone = plan("audio", clean("audio", { mode: "mix" }), ctx({ audio: sound, videos: [clip({ hasAudio: false })] })).steps[0].args;
  assert.ok(!has(alone, "amix"));
});

test("convert makes each format with the right codecs", () => {
  const f = (o: any, c = ctx()) => plan("convert", clean("convert", o), c).steps[0];
  assert.deepEqual([f({ format: "mp4" }).ext, arg(f({ format: "mp4" }).args, "-c:v")], ["mp4", "libx264"]);
  assert.equal(arg(f({ format: "mp4", quality: "small" }).args, "-crf"), "28");
  assert.equal(arg(f({ format: "mp4", height: "720" }).args, "-vf"), "scale=-2:720");
  assert.equal(arg(f({ format: "mp4", fps: "30" }).args, "-vf"), "scale=trunc(iw/2)*2:trunc(ih/2)*2,fps=30");
  assert.equal(arg(f({ format: "webm" }).args, "-c:v"), "libvpx-vp9");
  assert.equal(arg(f({ format: "mov", codec: "prores" }).args, "-c:v"), "prores_ks");
  assert.equal(arg(f({ format: "mov" }).args, "-c:v"), "libx264");
  assert.ok(has(f({ format: "gif" }).args, "palettegen", "paletteuse") && f({ format: "gif" }).kind === "image");
  const mp3 = f({ format: "mp3", quality: "high" });
  assert.deepEqual([mp3.kind, mp3.ext, arg(mp3.args, "-c:a"), arg(mp3.args, "-b:a")], ["audio", "mp3", "libmp3lame", "256k"]);
  assert.ok(f({ format: "wav" }).args.includes("pcm_s16le") && f({ format: "m4a" }).args.includes("aac"));
  assert.ok(f({ format: "mp4" }, ctx({ videos: [clip({ hasAudio: false })] })).args.includes("-an"));
});

test("a GIF takes a range with a palette; frames come out one by one, evenly or at the times asked", () => {
  const g = plan("gif", clean("gif", { mode: "gif", start: 1, end: 3, width: 320, fps: 12 }, { duration: 10 }), ctx());
  assert.deepEqual([arg(g.steps[0].args, "-ss"), arg(g.steps[0].args, "-t")], ["1", "2"]);
  assert.ok(has(g.steps[0].args, "fps=12,scale=320:-2", "palettegen", "paletteuse"));
  const even = plan("gif", clean("gif", { mode: "frames", start: 0, end: 10, count: 4, format: "jpg" }, { duration: 10 }), ctx());
  assert.deepEqual(even.steps.map((s) => arg(s.args, "-ss")), ["1.25", "3.75", "6.25", "8.75"]);
  assert.ok(even.steps.every((s) => s.args.includes("-frames:v") && s.ext === "jpg" && arg(s.args, "-q:v") === "2"));
  const at = plan("gif", clean("gif", { mode: "frames", times: [0, 5, 99], format: "png" }, { duration: 10 }), ctx());
  assert.deepEqual(at.steps.map((s) => arg(s.args, "-ss")), ["0", "5", "9.95"]);
});

test("every tool has a plan, and none of them puts a user's words into a command", () => {
  const sound = clip({ path: "/data/audio/s.mp3", duration: 2 });
  const evil = "x'; rm -rf / #";
  for (const tool of TOOLS) {
    const p = clean(tool, { cues: [{ start: 0, end: 2, text: evil }], text: evil, mode: evil, style: evil, format: evil, preset: evil, corner: evil, fill: evil }, { duration: 10 });
    const c = ctx({ audio: sound, image: clip({ path: "/data/photos/l.png" }), videos: tool === "merge" ? [clip(), clip({ path: "/data/videos/b.mp4" })] : [clip()] });
    const made = plan(tool as Tool, p, c);
    assert.ok(made.steps.length && made.steps.every((s) => s.args.length && s.out), `${tool} has steps`);
    assert.ok(!made.steps.flatMap((s) => s.args).join("\n").includes("rm -rf"), `${tool}: the command is free of the words`);
  }
});

// ---------------------------------------------------------------- every tool, run for real

const work = async (t: any) => {
  const dir = await mkdtemp(join(tmpdir(), "edit-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  for (const d of ["videos", "photos", "audio"]) await mkdir(join(dir, d), { recursive: true });
  await exec("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=320x180:r=24:d=2", "-f", "lavfi", "-i", "sine=f=440:d=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", join(dir, "videos", "clip.mp4")]);
  await exec("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=160x90:r=24:d=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-an", join(dir, "videos", "mute.mp4")]);
  await exec("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=0xF2FF59:s=120x50,format=rgba", "-frames:v", "1", join(dir, "photos", "logo.png")]);
  await exec("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=f=880:d=1", "-c:a", "libmp3lame", join(dir, "audio", "tone.mp3")]);
  const edit = createEdit({ data: dir, root });
  const run = async (tool: Tool, body: any) => {
    const job = await edit.start(tool, body);
    for (let i = 0; i < 400; i++) {
      const j = edit.get(job.id)!;
      if (j.status === "done" || j.status === "failed" || j.status === "canceled") return j;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error(`${tool} did not finish`);
  };
  return { dir, edit, run };
};

/** What a file holds: its streams and its length, from ffprobe. */
async function look(path: string) {
  const { stdout } = await exec("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height:format=duration", "-of", "json", path]);
  const j = JSON.parse(stdout);
  const v = j.streams.find((s: any) => s.codec_type === "video");
  return { duration: Number(j.format.duration), video: v, audio: j.streams.find((s: any) => s.codec_type === "audio"), width: Number(v?.width), height: Number(v?.height) };
}
const where = (dir: string, r: { url: string }) => join(dir, r.url.replace(/^\/media\//, ""));

test("the clip tools run: trim, reframe, speed, reverse, loop, merge", async (t) => {
  const { dir, run } = await work(t);
  const trim = await run("trim", { video: "clip.mp4", start: 0.5, end: 1.5 });
  assert.equal(trim.status, "done", trim.error);
  const a = await look(where(dir, trim.results[0]));
  assert.ok(Math.abs(a.duration - 1) < 0.15 && a.width === 320 && a.audio, `trim: ${a.duration}`);

  const tall = await run("reframe", { video: "clip.mp4", format: "9:16", x: 0 });
  const b = await look(where(dir, tall.results[0]));
  assert.ok(b.height > b.width && Math.abs(b.width / b.height - 9 / 16) < 0.02, `reframe ${b.width}x${b.height}`);
  assert.ok(Math.abs(b.duration - 2) < 0.15 && b.audio);
  for (const fill of ["blur", "colour"]) {
    const r = await run("reframe", { video: "clip.mp4", format: "1:1", fill, colour: "#49378B" });
    const s = await look(where(dir, r.results[0]));
    assert.equal(r.status, "done", r.error);
    assert.equal(s.width, s.height);
  }

  const fast = await run("speed", { video: "clip.mp4", factor: 2 });
  assert.ok(Math.abs((await look(where(dir, fast.results[0]))).duration - 1) < 0.2);
  const slow = await run("speed", { video: "clip.mp4", factor: 0.5, smooth: true });
  assert.equal(slow.status, "done", slow.error);
  assert.ok(Math.abs((await look(where(dir, slow.results[0]))).duration - 4) < 0.3);
  const quiet = await run("speed", { video: "mute.mp4", factor: 2 });
  assert.equal((await look(where(dir, quiet.results[0]))).audio, undefined);

  const rev = await run("reverse", { video: "clip.mp4" });
  const c = await look(where(dir, rev.results[0]));
  assert.ok(Math.abs(c.duration - 2) < 0.15 && c.audio);

  const loop = await run("loop", { video: "clip.mp4", times: 3 });
  assert.ok(Math.abs((await look(where(dir, loop.results[0]))).duration - 6) < 0.3, "loop 3x");
  const pong = await run("loop", { video: "clip.mp4", times: 2, pingpong: true });
  assert.equal(pong.status, "done", pong.error);
  assert.ok(Math.abs((await look(where(dir, pong.results[0]))).duration - 8) < 0.4, "ping-pong 2x");

  const merged = await run("merge", { videos: ["clip.mp4", "mute.mp4"], crossfade: 0.5 });
  assert.equal(merged.status, "done", merged.error);
  const d = await look(where(dir, merged.results[0]));
  assert.ok(Math.abs(d.duration - 2.5) < 0.2 && d.audio && d.width === 320, `merge ${d.duration}`);
  const joined = await run("merge", { videos: ["clip.mp4", "mute.mp4"], aspect: "9:16", fit: "cover" });
  const e = await look(where(dir, joined.results[0]));
  assert.ok(e.height > e.width && Math.abs(e.duration - 3) < 0.2);
});

test("the drawing tools run: captions, grade (with a LUT), logo", async (t) => {
  const { dir, edit, run } = await work(t);
  const caps = await run("captions", { video: "clip.mp4", cues: [{ start: 0, end: 1.5, text: "Hello jam" }], style: "outline", size: 9 });
  assert.equal(caps.status, "done", caps.error);
  assert.equal((await look(where(dir, caps.results[0]))).width, 320);
  const lyric = await run("captions", { video: "clip.mp4", cues: [{ start: 0, end: 1, text: "Lyric face" }], font: "lyric", style: "box" });
  assert.equal(lyric.status, "done", lyric.error);
  assert.equal((await run("captions", { video: "clip.mp4", cues: [] }).catch((e) => e)).message, "Add at least one caption line.");

  const graded = await run("grade", { video: "clip.mp4", preset: "noir", contrast: 1.1 });
  assert.equal(graded.status, "done", graded.error);
  const cube = ["LUT_3D_SIZE 2", "0 0 0", "1 0 0", "0 1 0", "1 1 0", "0 0 1", "1 0 1", "0 1 1", "1 1 1"].join("\n");
  const { file } = await edit.keepLut(Buffer.from(cube));
  const lut = await run("grade", { video: "clip.mp4", lut: file });
  assert.equal(lut.status, "done", lut.error);
  await assert.rejects(edit.keepLut(Buffer.from("not a lut")), /not a \.cube LUT/);

  const logo = await run("logo", { video: "clip.mp4", image: "logo.png", corner: "tr", scale: 25, opacity: 0.8, fadeIn: 0.3, fadeOut: 0.3 });
  assert.equal(logo.status, "done", logo.error);
  const l = await look(where(dir, logo.results[0]));
  assert.ok(Math.abs(l.duration - 2) < 0.15, `logo kept the length: ${l.duration}`);

  // one frame of what a tool would make
  for (const tool of ["grade", "logo", "captions", "reframe"] as Tool[]) {
    const p = await edit.preview(tool, { video: "clip.mp4", image: "logo.png", at: 1, preset: "warm", format: "4:5", cues: [{ start: 0, end: 2, text: "Hi" }] });
    assert.match(p.url, /^\/media\/edits\/preview\/\w+\.jpg$/);
    assert.equal((await look(join(dir, p.url.replace("/media/", "")))).video.codec_name, "mjpeg");
  }
  await assert.rejects(edit.preview("trim", { video: "clip.mp4" }), /no preview/);
});

test("the sound, format, GIF and frame tools run", async (t) => {
  const { dir, run } = await work(t);
  const mute = await run("audio", { video: "clip.mp4", mode: "mute" });
  assert.equal((await look(where(dir, mute.results[0]))).audio, undefined);
  const swap = await run("audio", { video: "clip.mp4", mode: "replace", audio: "tone.mp3", volume: 0.7 });
  const s = await look(where(dir, swap.results[0]));
  assert.ok(s.audio && s.video && Math.abs(s.duration - 2) < 0.15, `replace: the 1 s tone is looped to ${s.duration}`);
  const mix = await run("audio", { video: "clip.mp4", mode: "mix", audio: "tone.mp3", volume: 0.5, videoVolume: 0.8 });
  assert.equal(mix.status, "done", mix.error);
  assert.ok((await look(where(dir, mix.results[0]))).audio);
  const dub = await run("audio", { video: "mute.mp4", mode: "mix", audio: "tone.mp3" });
  assert.ok((await look(where(dir, dub.results[0]))).audio, "a mix on a silent clip is the new sound");

  const webm = await run("convert", { video: "clip.mp4", format: "webm", quality: "small" });
  assert.equal(webm.status, "done", webm.error);
  assert.equal((await look(where(dir, webm.results[0]))).video.codec_name, "vp9");
  const mov = await run("convert", { video: "clip.mp4", format: "mov", codec: "prores" });
  assert.equal((await look(where(dir, mov.results[0]))).video.codec_name, "prores");
  const small = await run("convert", { video: "clip.mp4", format: "mp4", height: "360", fps: "12" });
  assert.equal((await look(where(dir, small.results[0]))).height, 360);
  const mp3 = await run("convert", { video: "clip.mp4", format: "mp3" });
  const m = await look(where(dir, mp3.results[0]));
  assert.ok(m.audio && !m.video && mp3.results[0].kind === "audio" && mp3.results[0].url.startsWith("/media/audio/"));
  const gifc = await run("convert", { video: "clip.mp4", format: "gif" });
  assert.equal((await look(where(dir, gifc.results[0]))).video.codec_name, "gif");

  const gif = await run("gif", { video: "clip.mp4", mode: "gif", start: 0.5, end: 1.5, width: 160, fps: 10 });
  const g = await look(where(dir, gif.results[0]));
  assert.equal(g.video.codec_name, "gif");
  assert.equal(g.width, 160);
  assert.equal(gif.results[0].animated, true);

  const frames = await run("gif", { video: "clip.mp4", mode: "frames", count: 3, format: "png" });
  assert.equal(frames.results.length, 3);
  assert.ok(frames.results.every((r) => r.kind === "image" && r.url.startsWith("/media/photos/") && r.width === 320));
  const atTimes = await run("gif", { video: "clip.mp4", mode: "frames", times: [0, 1], format: "jpg" });
  assert.equal(atTimes.results.length, 2);
});

test("a bad request fails before anything runs, and a job can be stopped", async (t) => {
  const { edit } = await work(t);
  await assert.rejects(edit.start("trim", { video: "../../etc/passwd" }), /clip is missing/);
  await assert.rejects(edit.start("trim", { video: "nope.mp4" }), /clip is missing/);
  await assert.rejects(edit.start("merge", { videos: ["clip.mp4"] }), /at least two/);
  await assert.rejects(edit.start("logo", { video: "clip.mp4", image: "missing.png" }), /logo picture is missing/);
  await assert.rejects(edit.start("audio", { video: "clip.mp4", mode: "replace", audio: "missing.mp3" }), /sound is missing/);
  // stopping: a slow-motion job asked to stop ends as canceled
  const job = await edit.start("speed", { video: "clip.mp4", factor: 0.25, smooth: true });
  const h = await edit.handle("DELETE", `jobs/${job.id}`, {});
  assert.equal(h.status, 200);
  for (let i = 0; i < 100 && !["canceled", "done", "failed"].includes(edit.get(job.id)!.status); i++) await new Promise((r) => setTimeout(r, 50));
  assert.ok(["canceled", "done"].includes(edit.get(job.id)!.status));
  await assert.rejects(edit.handle("GET", "jobs/doesnotexist", {}), /No such job/);
});

test("a clip's strip of thumbnails is one picture with its frames side by side", async (t) => {
  const { dir, edit } = await work(t);
  const s = await edit.strip("clip.mp4", 8);
  assert.equal(s.count, 8);
  const info = await look(join(dir, s.url.replace("/media/", "")));
  assert.equal(info.width, s.width * 8);
  assert.equal(info.height, s.height);
  const probe = await edit.handle("POST", "probe", { file: "clip.mp4" });
  assert.deepEqual(probe.body, { duration: 2, width: 320, height: 180, fps: 24, hasAudio: true, hasVideo: true });
});

test("a picture in, a picture out: the grade is one frame saved as a PNG, the export a PNG, JPG or WebP, and a clip's formats are refused", () => {
  const still: Probe = { path: "/data/photos/a.png", duration: 0, width: 640, height: 360, fps: 25, hasAudio: false, hasVideo: true } as any;
  const ctx = { work: "/w", videos: [still], still: true } as any;
  const graded = plan("grade", clean("grade", { preset: "filmic" }, { duration: 0 }), ctx);
  assert.equal(graded.steps.length, 1);
  assert.deepEqual([graded.steps[0].kind, graded.steps[0].ext], ["image", "png"]);
  assert.ok(graded.steps[0].args.includes("-frames:v") && !graded.steps[0].args.includes("libx264"), "one frame, no clip");
  const webp = plan("convert", clean("convert", { format: "webp", quality: "high" }, { duration: 0 }), ctx);
  assert.deepEqual([webp.steps[0].ext, webp.steps[0].args.includes("libwebp")], ["webp", true]);
  const jpg = plan("convert", clean("convert", { format: "jpg", height: "360" }, { duration: 0 }), ctx);
  assert.ok(jpg.steps[0].args.includes("scale=-2:360") && jpg.steps[0].ext === "jpg");
  assert.throws(() => plan("convert", clean("convert", { format: "mp4" }, { duration: 0 }), ctx), /PNG, JPG or WebP/);
  assert.throws(() => plan("convert", clean("convert", { format: "png" }, { duration: 5 }), { ...ctx, still: false }), /MP4, WebM, MOV or GIF/);
});
