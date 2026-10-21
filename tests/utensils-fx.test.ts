// The free effects: what a request is made safe into, the ffmpeg arguments each tool builds (read as plain arrays), the weather and
// particle overlays, the loudness numbers, and every tool run for real on a short clip or sound made by ffmpeg (its output
// probed: duration, size, streams, loudness). Free and local: needs ffmpeg and ffprobe, never calls Comfy Cloud.

import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { TOOLS, clean, plan, atempoChain, overlayGraph, centre, measureArgs, readMeasured, capabilities, createFx, fileName, FxError, type Ctx, type Probe, type Tool } from "../server/utensils-fx.ts";

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, "..");

const clip = (over: Partial<Probe> = {}): Probe => ({ path: "/data/videos/a.mp4", duration: 10, width: 1280, height: 720, fps: 24, hasAudio: true, hasVideo: true, ...over });
const sound = (over: Partial<Probe> = {}): Probe => ({ path: "/data/audio/a.mp3", duration: 30, width: 0, height: 0, fps: 24, hasAudio: true, hasVideo: false, ...over });
const ctx = (over: Partial<Ctx> = {}): Ctx => ({ work: "/work", input: clip(), ...over });
const arg = (args: string[], flag: string) => args[args.indexOf(flag) + 1];
const has = (args: string[], ...parts: string[]) => parts.every((p) => args.some((a) => a.includes(p)));
const planOf = (tool: Tool, raw: Record<string, unknown>, c: Ctx = ctx()) => plan(tool, clean(tool, raw), c);

// ---------------------------------------------------------------- what a request is made safe into

test("every number is clamped, every choice comes from its list, every colour is a hex, every file a plain name", () => {
  assert.equal(clean("chroma", { similarity: 9 }).similarity, 0.6);
  assert.equal(clean("chroma", { similarity: -1 }).similarity, 0.01);
  assert.equal(clean("chroma", { colour: "red; drawbox" }).colour, "#00FF00");
  assert.equal(clean("chroma", { colour: "#abcdef" }).colour, "#ABCDEF");
  assert.equal(clean("chroma", { output: "exe" }).output, "webm");
  assert.equal(clean("chroma", { picture: "../../etc/passwd" }).picture, "");
  assert.equal(clean("stabilise", { shakiness: 99 }).shakiness, 10);
  assert.equal(clean("stabilise", { smoothness: 0 }).smoothness, 1);
  assert.equal(clean("slowmo", { factor: 99 }).factor, 2);
  assert.equal(clean("slowmo", { factor: "4" }).factor, 4);
  assert.equal(clean("slowmo", { mode: "$(evil)" }).mode, "mci");
  assert.equal(clean("weather", { kind: "lava" }).kind, "rain");
  assert.equal(clean("weather", { angle: 500 }).angle, 40);
  assert.equal(clean("weather", { speed: 0 }).speed, 0.2);
  assert.equal(clean("sparks", { kind: "rain" }).kind, "sparks");
  assert.equal(clean("sparks", { direction: "sideways" }).direction, "up");
  assert.equal(clean("unlogo", { grow: 99 }).grow, 8);
  assert.equal(clean("denoise", { amount: 1000 }).amount, 40);
  assert.equal(clean("denoise", { highpass: "999" }).highpass, "0");
  assert.equal(clean("denoise", { format: "exe" }).format, "mp3");
  assert.equal(fileName("../../etc/passwd"), "");
  assert.equal(fileName("a/b.mp4"), "");
  assert.equal(fileName("abc123.mp4"), "abc123.mp4");
  assert.equal(fileName(".hidden"), "");
});

test("a loudness job takes a preset's number, or a custom one inside the range", () => {
  assert.equal(clean("master", { preset: "streaming" }).lufs, -14);
  assert.equal(clean("master", { preset: "social" }).lufs, -16);
  assert.equal(clean("master", { preset: "broadcast" }).lufs, -23);
  assert.equal(clean("master", { preset: "custom", lufs: -3 }).lufs, -8);
  assert.equal(clean("master", { preset: "custom", lufs: -99 }).lufs, -30);
  assert.equal(clean("master", { preset: "streaming", lufs: -3 }).lufs, -14, "a preset ignores a stray number");
  assert.equal(clean("master", { peak: 5 }).peak, 0);
});

test("a mix keeps at most six tracks, each with a clamped gain and start, a plain file name and a known folder", () => {
  const tracks = Array.from({ length: 9 }, (_, i) => ({ file: `s${i}.mp3`, from: "audio", volume: 99, offset: -5 }));
  const p = clean("mix", { tracks: [...tracks, { file: "../x.mp3" }, { from: "audio" }] });
  assert.equal(p.tracks.length, 6);
  assert.deepEqual([p.tracks[0].volume, p.tracks[0].offset], [12, 0]);
  assert.equal(clean("mix", { tracks: [{ file: "a.mp3", from: "../../etc" }] }).tracks[0].from, "audio");
  assert.equal(clean("mix", { tracks: [{ file: "a.mp3", offset: 99999 }] }).tracks[0].offset, 600);
  assert.equal(clean("mix", { tracks: [{ file: "a.mp3", mute: "true" }] }).tracks[0].mute, true);
  assert.deepEqual(clean("mix", { tracks: "nope" }).tracks, []);
});

// ---------------------------------------------------------------- the ffmpeg plans

test("a cutout keys the colour picked, takes the spill out of a green or blue one and ends in the format asked", () => {
  const webm = planOf("chroma", { colour: "#00C800", similarity: 0.2, blend: 0.1, output: "webm" }).steps[0];
  assert.ok(has(webm.args, "chromakey=color=0x00C800:similarity=0.2:blend=0.1", "despill=type=green"));
  assert.equal(arg(webm.args, "-c:v"), "libvpx-vp9");
  assert.equal(arg(webm.args, "-pix_fmt"), "yuva420p");
  assert.equal(arg(webm.args, "-auto-alt-ref"), "0");
  assert.equal(webm.ext, "webm");
  const blue = planOf("chroma", { colour: "#0040ff", output: "webm" }).steps[0];
  assert.ok(has(blue.args, "despill=type=blue"));
  const red = planOf("chroma", { colour: "#ff0000", output: "webm" }).steps[0];
  assert.ok(!has(red.args, "despill"), "no spill to take out of a red key");
  assert.ok(!has(planOf("chroma", { despill: false }).steps[0].args, "despill"));
  const mov = planOf("chroma", { output: "mov" }).steps[0];
  assert.equal(arg(mov.args, "-c:v"), "prores_ks");
  assert.equal(arg(mov.args, "-pix_fmt"), "yuva444p10le");
  assert.equal(mov.ext, "mov");
});

test("a cutout laid on a colour or a picture is an mp4 as long as the clip, and a preview is one frame on squares", () => {
  const on = planOf("chroma", { output: "colour", background: "#F2FF59" }).steps[0];
  assert.ok(has(on.args, "color=c=0xF2FF59:s=1280x720", "overlay=shortest=1"));
  assert.equal(on.ext, "mp4");
  const pic = planOf("chroma", { output: "picture", picture: "bg.png" }, ctx({ image: { ...clip(), path: "/data/photos/bg.png", width: 1000, height: 500, hasAudio: false } })).steps[0];
  assert.ok(has(pic.args, "-loop", "/data/photos/bg.png", "force_original_aspect_ratio=increase"));
  const shown = plan("chroma", clean("chroma", { output: "webm" }), ctx({ preview: { at: 2.5 } })).steps[0];
  assert.equal(shown.ext, "jpg");
  assert.equal(arg(shown.args, "-frames:v"), "1");
  assert.equal(arg(shown.args, "-ss"), "2.5");
  assert.ok(has(shown.args, "geq=lum='if(eq(mod(floor(X/16)+floor(Y/16),2)"), "the squares a cutout is judged on");
});

test("stabilising is two passes: it measures the shake, then removes it, with a zoom that hides the edges", () => {
  const { steps } = planOf("stabilise", { shakiness: 7, smoothness: 50, zoom: "auto", edges: "fill" });
  assert.equal(steps.length, 2);
  assert.equal(steps[0].keep, false, "the measuring pass leaves nothing in the library");
  assert.ok(has(steps[0].args, "vidstabdetect=shakiness=7:accuracy=15:result=transforms.trf"));
  assert.deepEqual(steps[0].args.slice(-3), ["-f", "null", "-"]);
  assert.ok(has(steps[1].args, "vidstabtransform=input=transforms.trf", "smoothing=31", "optzoom=1", "crop=keep"));
  assert.ok(has(planOf("stabilise", { zoom: "none", edges: "black", sharpen: false }).steps[1].args, "optzoom=0", "crop=black"));
  assert.ok(!has(planOf("stabilise", { sharpen: false }).steps[1].args, "unsharp"));
  assert.ok(Math.abs(steps[0].weight! + steps[1].weight! - 1) < 1e-9);
});

test("slow motion makes the frames it lacks, then stretches time: a 2x slowing of 24 fps is 48 fps stretched twice", () => {
  const p = planOf("slowmo", { factor: 2, mode: "mci", audio: "mute" });
  const vf = arg(p.steps[0].args, "-vf");
  assert.ok(vf.includes("minterpolate=fps=48:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1"));
  assert.ok(vf.includes("setpts=2*PTS"));
  assert.ok(p.steps[0].args.includes("-an"));
  assert.equal(p.seconds, 20, "progress is counted on the slowed clip's own length");
  const slow = planOf("slowmo", { factor: 4, mode: "blend", audio: "slow" });
  assert.ok(arg(slow.steps[0].args, "-vf").includes("minterpolate=fps=96:mi_mode=blend"));
  assert.ok(slow.steps[0].args.includes("atempo=0.5,atempo=0.5"), "a sound slowed four times is two halvings");
  assert.ok(!arg(planOf("slowmo", { mode: "dup" }).steps[0].args, "-vf").includes("minterpolate"));
  assert.ok(arg(planOf("slowmo", { factor: 4 }, ctx({ input: clip({ fps: 60 }) })).steps[0].args, "-vf").includes("fps=120"), "never more than 120 frames a second");
  assert.equal(atempoChain(0.25), "atempo=0.5,atempo=0.5");
  assert.equal(atempoChain(3), "atempo=2,atempo=1.5");
});

test("weather lays a screen blend in RGB over the clip, as long as the clip, and a preview is one frame", () => {
  const rain = planOf("weather", { kind: "rain", amount: 0.5, angle: 10 }).steps[0];
  const fc = arg(rain.args, "-filter_complex");
  assert.ok(fc.includes("[0:v]scale=trunc(iw/2)*2:trunc(ih/2)*2,format=gbrp[v]"), "the clip is blended as RGB: its colours do not move");
  assert.ok(fc.includes("blend=all_mode=screen") && fc.includes("shortest=1"), "a source that never ends does not make the job endless");
  assert.equal(arg(rain.args, "-t"), "10");
  assert.equal(rain.ext, "mp4");
  assert.ok(rain.args.includes("0:a?"), "the sound goes with it");
  const frame = plan("weather", clean("weather", { kind: "snow" }), ctx({ preview: { at: 3 } })).steps[0];
  assert.equal(frame.ext, "jpg");
  assert.equal(arg(frame.args, "-ss"), "3");
});

test("each look builds a graph that ends in [fx] at the clip's size, and a bigger amount lights more of the picture", () => {
  for (const kind of ["rain", "snow", "fog", "sparks", "embers", "dust"]) {
    const g = overlayGraph(kind, { amount: 0.5, speed: 1, angle: kind === "rain" ? 12 : 0 }, 1280, 704, 24, 8);
    assert.ok(g.endsWith("[fx]"), kind);
    assert.ok(g.includes("crop=1280:704") || g.includes("crop=1280:704:'min("), `${kind} is cut to the clip's size`);
    assert.ok(!/random\(/.test(g), `${kind} uses a hash of the place, not the evaluator's lattice`);
    assert.ok(g.includes("format=gray"), `${kind} keeps to one grey plane before it is tinted`);
  }
  const density = (amount: number) => Number(/gt\(ld\(0\)-floor\(ld\(0\)\),([0-9.]+)\)/.exec(overlayGraph("rain", { amount, speed: 1 }, 640, 360, 24, 5))![1]);
  assert.ok(density(0.9) < density(0.1), "the threshold falls as the amount rises: more is lit");
  assert.ok(overlayGraph("rain", { amount: 0.5, speed: 1, angle: 12 }, 640, 360, 24, 5).includes("format=rgb24,rotate=0.2094"), "slanted as packed RGB");
  assert.ok(!overlayGraph("embers", { amount: 0.5, speed: 1, angle: 0 }, 640, 360, 24, 5).includes("rotate"), "no angle, no rotation");
  assert.ok(overlayGraph("sparks", { amount: 0.5, speed: 1, direction: "up" }, 640, 360, 24, 5).includes("-mod(t*"), "sparks rise");
  assert.ok(!overlayGraph("rain", { amount: 0.5, speed: 1, direction: "down" }, 640, 360, 24, 5).includes("-mod(t*"), "rain falls");
  assert.throws(() => overlayGraph("lava", { amount: 0.5, speed: 1 }, 640, 360, 24, 5), FxError);
});

test("a speck's brightness is brought back after the blur: a bigger blur needs a bigger gain", () => {
  assert.ok(centre(1, 1, 1) > centre(1, 3, 3));
  assert.ok(centre(30, 0.7, 3) > centre(1, 0.7, 3), "a long streak keeps more of its centre than a dot");
  assert.ok(centre(1, 2.6, 2.6) < 0.1);
});

test("a spot is removed with a mask made black and white, grown and as big as the clip", () => {
  const p = planOf("unlogo", { grow: 3, mask: "data:image/png;base64,AAAA" });
  assert.equal(p.steps.length, 2);
  assert.equal(p.steps[0].keep, false);
  const prep = arg(p.steps[0].args, "-vf");
  assert.ok(prep.includes("scale=1280:720:flags=neighbor") && prep.includes("dilation,dilation,dilation") && prep.includes("format=gray"));
  assert.ok(has(p.steps[1].args, "removelogo=filename=mask.png"));
  assert.ok(!planOf("unlogo", { grow: 0, mask: "x" }).steps[0].args.some((a) => a.includes("dilation")));
});

test("cleaning a sound lifts the rumble out and takes the noise down; a clip keeps its picture untouched", () => {
  const a = plan("denoise", clean("denoise", { amount: 18, floor: -45, highpass: "80", format: "wav" }), ctx({ input: sound() })).steps[0];
  assert.equal(arg(a.args, "-af"), "highpass=f=80,afftdn=nr=18:nf=-45:tn=1");
  assert.equal(a.ext, "wav");
  assert.equal(arg(a.args, "-c:a"), "pcm_s16le");
  const v = plan("denoise", clean("denoise", {}), ctx()).steps[0];
  assert.deepEqual([arg(v.args, "-c:v"), v.kind, v.ext], ["copy", "video", "mp4"]);
});

test("mastering reads the loudness first, then moves it once to the target, with a ceiling for the peaks", () => {
  const p = clean("master", { preset: "streaming", peak: -1, range: 9 });
  assert.deepEqual(measureArgs(p, "/in.mp3").slice(-5), ["-af", "loudnorm=I=-14:TP=-1:LRA=9:print_format=json", "-f", "null", "-"]);
  const measured = readMeasured(`junk\n{ "input_i" : "-22.40", "input_tp" : "-12.90", "input_lra" : "0.10", "input_thresh" : "-33.00", "output_i": "-14.4", "target_offset" : "0.40" }\n`)!;
  assert.deepEqual(measured, { input_i: -22.4, input_tp: -12.9, input_lra: 0.1, input_thresh: -33, target_offset: 0.4 });
  const second = plan("master", p, ctx({ input: sound(), measured })).steps[0];
  assert.equal(arg(second.args, "-af"), "loudnorm=I=-14:TP=-1:LRA=9:measured_I=-22.4:measured_LRA=0.1:measured_TP=-12.9:measured_thresh=-33:offset=0.4:linear=true,aresample=48000");
  assert.equal(second.note, "-22.4 → -14 LUFS");
  assert.equal(second.ext, "mp3");
  assert.ok(arg(plan("master", p, ctx({ input: sound() })).steps[0].args, "-af").startsWith("loudnorm=I=-14:TP=-1:LRA=9,"), "without a measuring it is one pass");
  assert.equal(readMeasured("nothing here"), null);
  assert.equal(readMeasured("{ \"input_i\" : \"-inf\" }"), null);
});

test("a mix delays and scales each sound, adds them without shrinking them, keeps the peaks in and can master it", () => {
  const tracks = [
    { probe: sound({ path: "/a.mp3", duration: 10 }), spec: { file: "a.mp3", from: "audio" as const, volume: -3, offset: 0, mute: false } },
    { probe: clip({ path: "/b.mp4", duration: 4 }), spec: { file: "b.mp4", from: "videos" as const, volume: 6, offset: 2.5, mute: false } },
  ];
  const p = plan("mix", clean("mix", { master: true, lufs: -16, fadeOut: 2, format: "wav" }), { work: "/work", tracks });
  const step = p.steps[0];
  const fc = arg(step.args, "-filter_complex");
  assert.ok(fc.includes("[0:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=-3dB,adelay=0|0[a0]"));
  assert.ok(fc.includes("volume=6dB,adelay=2500|2500[a1]"));
  assert.ok(fc.includes("[a0][a1]amix=inputs=2:normalize=0:duration=longest,alimiter=limit=0.97,afade=t=out:st=8:d=2,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[out]"));
  assert.deepEqual(step.args.filter((a) => a === "-i").length, 2);
  assert.equal(arg(step.args, "-t"), "10");
  assert.equal(step.ext, "wav");
  assert.equal(p.seconds, 10);
  const one = plan("mix", clean("mix", {}), { work: "/work", tracks: [tracks[0]] }).steps[0];
  assert.ok(arg(one.args, "-filter_complex").includes("[a0]alimiter=limit=0.97[out]"), "a single track is not mixed with nothing");
  assert.throws(() => plan("mix", clean("mix", {}), { work: "/work", tracks: [] }), FxError);
});

test("no tool can be planned without what it works on", () => {
  assert.throws(() => plan("stabilise", clean("stabilise", {}), { work: "/work" }), /Add a clip/);
  assert.throws(() => plan("denoise", clean("denoise", {}), { work: "/work" }), /Add a clip/);
});

test("only a request in the tools' list is a route", async () => {
  const dir = await mkdtemp(join(tmpdir(), "fx-routes-"));
  try {
    const fx = createFx({ data: dir, root });
    await assert.rejects(() => fx.handle("POST", "nothing", {}), /No such effect/);
    await assert.rejects(() => fx.handle("GET", "jobs/abc", {}), /No such job/);
    await assert.rejects(() => fx.handle("POST", "chroma", { video: "../../etc/passwd" }), /missing/);
    await assert.rejects(() => fx.handle("POST", "preview", { tool: "slowmo", video: "a.mp4" }), /no preview|missing/);
    const caps = (await fx.handle("GET", "capabilities", {})).body as Record<string, boolean>;
    assert.deepEqual(Object.keys(caps).sort(), [...TOOLS].sort());
    assert.ok(Object.values(caps).every((v) => typeof v === "boolean"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- every tool, run for real on a clip made by ffmpeg

const make = (args: string[]) => exec("ffmpeg", ["-hide_banner", "-v", "error", "-y", ...args], { maxBuffer: 1 << 20 });
const info = async (path: string) => {
  const { stdout } = await exec("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height,pix_fmt:format=duration", "-of", "json", path]);
  const j = JSON.parse(stdout);
  return { duration: Number(j.format.duration), streams: j.streams as any[] };
};
const loudness = async (path: string) => {
  const { stderr } = await exec("ffmpeg", ["-hide_banner", "-nostdin", "-i", path, "-af", "loudnorm=print_format=json", "-f", "null", "-"], { maxBuffer: 1 << 20 });
  return readMeasured(stderr)!.input_i;
};

test("each tool runs on a real clip and sound and makes a file that plays", async () => {
  const caps = await capabilities();
  const dir = await mkdtemp(join(tmpdir(), "fx-run-"));
  try {
    for (const d of ["videos", "audio", "photos"]) await mkdir(join(dir, d), { recursive: true });
    // a green screen with a moving square on it, a plain clip with sound, a noisy tone, a quiet tone
    await make(["-f", "lavfi", "-i", "color=c=0x00c800:s=320x180:r=24:d=1.5", "-f", "lavfi", "-i", "testsrc2=s=100x100:r=24:d=1.5", "-f", "lavfi", "-i", "sine=frequency=330:duration=1.5", "-filter_complex", "[0][1]overlay=x=60+40*sin(t*3):y=40[v]", "-map", "[v]", "-map", "2:a", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", join(dir, "videos", "green.mp4")]);
    await make(["-f", "lavfi", "-i", "testsrc2=s=320x180:r=24:d=1.5", "-f", "lavfi", "-i", "sine=frequency=220:duration=1.5", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", join(dir, "videos", "plain.mp4")]);
    await make(["-f", "lavfi", "-i", "sine=f=220:d=2", "-f", "lavfi", "-i", "anoisesrc=d=2:c=pink:a=0.05", "-filter_complex", "[0]aformat=channel_layouts=stereo[a];[1]aformat=channel_layouts=stereo[b];[a][b]amix=inputs=2:normalize=0", "-c:a", "libmp3lame", join(dir, "audio", "noisy.mp3")]);
    await make(["-f", "lavfi", "-i", "sine=f=440:d=1", "-c:a", "libmp3lame", join(dir, "audio", "tone.mp3")]);
    await make(["-f", "lavfi", "-i", "testsrc2=s=160x90:d=1", "-frames:v", "1", join(dir, "photos", "back.png")]);

    const kept: { name: string; file: string; kind: string }[] = [];
    const fx = createFx({
      data: dir, root,
      keepAudio: async (bytes, ext, meta) => {
        const file = `kept-${kept.length}${ext}`;
        await (await import("node:fs/promises")).writeFile(join(dir, "audio", file), bytes);
        kept.push({ name: meta.name, file, kind: meta.kind });
        return { file, url: `/media/audio/${file}`, seconds: 0 };
      },
    });
    const run = async (tool: Tool, body: Record<string, unknown>) => {
      let job = await fx.start(tool, body);
      for (let i = 0; i < 600 && !["done", "failed", "canceled"].includes(job.status); i++) {
        await new Promise((r) => setTimeout(r, 100));
        job = fx.get(job.id)!;
      }
      assert.equal(job.status, "done", `${tool}: ${job.error}`);
      assert.equal(job.progress, 1);
      return job.results;
    };
    const path = (r: { url: string }) => join(dir, r.url.replace(/^\/media\//, ""));

    if (caps.chroma) {
      const [webm] = await run("chroma", { video: "green.mp4", colour: "#00C800", output: "webm" });
      const w = await info(path(webm));
      assert.deepEqual([w.streams.find((s) => s.codec_type === "video").codec_name, webm.width, webm.height], ["vp9", 320, 180]);
      assert.ok(w.streams.some((s) => s.codec_type === "audio"), "the sound is kept");
      const [mov] = await run("chroma", { video: "green.mp4", output: "mov" });
      assert.equal((await info(path(mov))).streams.find((s) => s.codec_type === "video").codec_name, "prores");
      const [on] = await run("chroma", { video: "green.mp4", output: "colour", background: "#F2FF59" });
      assert.equal(on.ext, "mp4");
      assert.ok(Math.abs(on.duration - 1.5) < 0.2, `a cutout on a colour runs as long as the clip (${on.duration})`);
      const [pic] = await run("chroma", { video: "green.mp4", output: "picture", picture: "back.png" });
      assert.equal(pic.width, 320);
      const frame = await fx.preview("chroma", { video: "green.mp4", output: "webm", at: 0.5 });
      assert.match(frame.url, /^\/media\/edits\/preview\/[0-9a-f]+\.jpg$/);
    }
    if (caps.stabilise) {
      const [r] = await run("stabilise", { video: "plain.mp4" });
      assert.deepEqual([r.width, r.height, Math.round(r.duration)], [320, 180, 2]);
      assert.ok((await info(path(r))).streams.some((s) => s.codec_type === "audio"));
    }
    if (caps.slowmo) {
      const [r] = await run("slowmo", { video: "plain.mp4", factor: 2, mode: "blend" });
      assert.ok(r.duration > 2.7 && r.duration < 3.3, `2x slower is about 3 s (${r.duration})`);
      assert.ok(!(await info(path(r))).streams.some((s) => s.codec_type === "audio"), "muted by default");
      const [dup] = await run("slowmo", { video: "plain.mp4", factor: 2, mode: "dup", audio: "slow" });
      assert.ok((await info(path(dup))).streams.some((s) => s.codec_type === "audio"));
    }
    if (caps.weather) {
      for (const kind of ["rain", "snow", "fog"]) {
        const [r] = await run("weather", { video: "plain.mp4", kind, amount: 0.7 });
        assert.deepEqual([r.width, r.height, Math.round(r.duration)], [320, 180, 2], kind);
      }
      for (const kind of ["sparks", "embers", "dust"]) {
        const [r] = await run("sparks", { video: "plain.mp4", kind, direction: kind === "dust" ? "down" : "up" });
        assert.deepEqual([r.width, r.height], [320, 180], kind);
      }
      const frame = await fx.preview("weather", { video: "plain.mp4", kind: "rain", at: 0.5 });
      assert.ok(frame.url.endsWith(".jpg"));
    }
    if (caps.unlogo) {
      // a white square painted on a black picture as big as the clip
      await make(["-f", "lavfi", "-i", "color=c=black:s=320x180:d=1", "-vf", "drawbox=x=100:y=60:w=60:h=40:color=white:t=fill", "-frames:v", "1", join(dir, "mask.png")]);
      const mask = `data:image/png;base64,${(await (await import("node:fs/promises")).readFile(join(dir, "mask.png"))).toString("base64")}`;
      const [r] = await run("unlogo", { video: "plain.mp4", mask, grow: 2 });
      assert.deepEqual([r.width, r.height], [320, 180]);
      await assert.rejects(() => fx.start("unlogo", { video: "plain.mp4", mask: "" }), /Paint over the spot/);
      await assert.rejects(() => fx.start("unlogo", { video: "plain.mp4", mask: "data:image/png;base64,AAAAAAAAAAAA" }), /Paint over the spot/);
    }
    if (caps.denoise) {
      const [r] = await run("denoise", { file: "noisy.mp3", amount: 20, highpass: "80" });
      assert.equal(r.kind, "audio");
      assert.ok(Math.abs(r.duration - 2) < 0.2);
      assert.equal(kept.at(-1)!.kind, "fx", "a sound goes into the library with its name");
      const [v] = await run("denoise", { file: "plain.mp4" });
      assert.deepEqual([v.kind, v.width], ["video", 320]);
    }
    if (caps.master) {
      const before = await loudness(join(dir, "audio", "noisy.mp3"));
      const [r] = await run("master", { file: "noisy.mp3", preset: "streaming" });
      const after = await loudness(path(r));
      assert.ok(Math.abs(after - -14) < 1, `mastered to -14 LUFS (${before.toFixed(1)} → ${after.toFixed(1)})`);
      assert.match(r.note ?? "", /→ -14 LUFS/);
    }
    if (caps.mix) {
      const [r] = await run("mix", { tracks: [{ file: "noisy.mp3", from: "audio", volume: -3 }, { file: "tone.mp3", from: "audio", volume: -6, offset: 1.5 }, { file: "plain.mp4", from: "videos", volume: -12, mute: true }], format: "wav" });
      assert.equal(r.ext, "wav");
      assert.ok(Math.abs(r.duration - 2.5) < 0.2, `the mix runs to where the last sound ends (${r.duration})`);
      await assert.rejects(() => fx.start("mix", { tracks: [{ file: "plain.mp4", from: "videos", mute: true }] }), /muted/);
      await assert.rejects(() => fx.start("mix", { tracks: [{ file: "nothere.mp3", from: "audio" }] }), /missing/);
    }
    // a job can be stopped
    if (caps.slowmo) {
      const job = await fx.start("slowmo", { video: "plain.mp4", factor: 4, mode: "mci" });
      const stopped = (await fx.handle("DELETE", `jobs/${job.id}`, {})).body as { status: string };
      for (let i = 0; i < 100 && !["canceled", "done", "failed"].includes(fx.get(job.id)!.status); i++) await new Promise((r) => setTimeout(r, 50));
      assert.ok(["canceled", "done"].includes(fx.get(job.id)!.status), `stopped or already finished (${stopped.status})`);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
