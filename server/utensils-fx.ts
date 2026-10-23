// Utensils' free effects for clips and sounds, run on this machine with ffmpeg: a green-screen cutout, a stabiliser, smooth
// slow-motion, rain, snow and fog laid over a clip, sparks and embers and dust, a spot removed from a still camera, a sound
// cleaned of noise, a sound mastered to a loudness, a few sounds mixed into one, and an effect clip laid into a shot where it was
// placed, behind the people a matte holds (Spice's FX). Nothing here calls Comfy Cloud and nothing
// costs credits (the effects that need an AI model run through the template runner, not here).
//
// Three layers, as the Edit tools have: clean() makes what the page sent safe (numbers clamped, words from a list, never a user's
// text in a command), plan() turns safe parameters and what was probed of the files into ffmpeg steps (pure functions, so the
// tests can read every argument), and createFx() runs the steps as jobs with progress and cancel and keeps what they make in the
// library (a clip in videos/, a sound in audio/, the rest in edits/).

import { spawn, execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, copyFile, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

export const TOOLS = ["chroma", "stabilise", "slowmo", "weather", "sparks", "unlogo", "denoise", "master", "mix", "layer"] as const;
export type Tool = (typeof TOOLS)[number];
/** The tools that can show one frame of what they would make (a preview): they draw on every frame the same way. */
export const PREVIEWS: Tool[] = ["chroma", "weather", "sparks", "unlogo"];

export class FxError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

// ------------------------------------------------------------------ what a file is

export interface Probe {
  path: string;
  duration: number;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
  hasVideo: boolean;
}

/** What the plans are made from: the files probed, and where the work is done. */
export interface Ctx {
  work: string;
  /** the clip or the sound the tool works on */
  input?: Probe;
  /** a picture laid behind a cutout */
  image?: Probe;
  /** the effect clip laid into the shot, and the matte of the people it passes behind */
  layer?: Probe;
  matte?: Probe;
  /** the tracks of a mix, in order */
  tracks?: { probe: Probe; spec: Track }[];
  /** what a loudness pass measured, so the second pass can be exact */
  measured?: Measured;
  preview?: { at: number };
}
export interface Measured {
  input_i: number;
  input_tp: number;
  input_lra: number;
  input_thresh: number;
  target_offset: number;
}
export interface Step {
  args: string[];
  /** the file the step writes (not kept when `keep` is false: a pass whose product is only for the next step) */
  out: string;
  kind: "video" | "audio" | "image";
  ext: string;
  keep?: boolean;
  /** how much of the job's progress the step is (a pass that only measures is a small part of it) */
  weight?: number;
  /** a line said with the result: what changed */
  note?: string;
}
export interface Plan {
  steps: Step[];
  /** how long the result runs, for the progress of a step */
  seconds: number;
  /** files the plan needs in the work folder (name → text) */
  files?: Record<string, string>;
}

// ------------------------------------------------------------------ safe parameters

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const num = (v: unknown, lo: number, hi: number, d: number) => (v !== null && v !== "" && v !== undefined && Number.isFinite(Number(v)) ? clamp(Number(v), lo, hi) : d);
const oneOf = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);
const flag = (v: unknown, d = false) => (v === undefined || v === null ? d : v === true || v === "true" || v === 1);
const hex = (v: unknown, d: string) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v.trim()) ? v.trim().toUpperCase() : d);
/** A file's name in a library folder: letters, digits, dots, dashes and underscores, never a path. */
export const fileName = (v: unknown) => (typeof v === "string" && /^[\w][\w.-]{0,120}$/.test(v) ? v : "");
const f3 = (v: number) => (Math.round(v * 1000) / 1000).toString();
const f4 = (v: number) => (Math.round(v * 10000) / 10000).toString();
const even = (v: number) => Math.max(2, Math.floor(v / 2) * 2);

export const WEATHER = ["rain", "snow", "fog"] as const;
export const PARTICLES = ["sparks", "embers", "dust"] as const;
export const CHROMA_OUT = ["webm", "mov", "colour", "picture"] as const;
export const SLOWMO_MODES = ["mci", "blend", "dup"] as const;
export const SLOWMO_FACTORS = ["1.5", "2", "3", "4"] as const;
export const LOUDNESS = { streaming: -14, social: -16, broadcast: -23 } as const;
export const AUDIO_OUT = ["mp3", "wav", "m4a"] as const;
export const MAX_MIX_TRACKS = 6;
export const MAX_MIX_SECONDS = 600;

type Params = Record<string, any>;
export interface Track {
  /** the file's name in its library folder */
  file: string;
  from: "audio" | "videos" | "edits";
  /** gain in dB */
  volume: number;
  /** when the track starts, in seconds */
  offset: number;
  mute: boolean;
}

/** The parameters of a tool, made safe: every number clamped, every choice from its list, every name a plain file name. */
export function clean(tool: Tool, raw: Params, ctx: { duration?: number } = {}): Params {
  switch (tool) {
    case "chroma":
      return {
        colour: hex(raw.colour, "#00FF00"), similarity: num(raw.similarity, 0.01, 0.6, 0.14), blend: num(raw.blend, 0, 0.5, 0.06),
        despill: flag(raw.despill, true), output: oneOf(raw.output, CHROMA_OUT, "webm"), background: hex(raw.background, "#101012"), picture: fileName(raw.picture),
      };
    case "stabilise":
      return { shakiness: Math.round(num(raw.shakiness, 1, 10, 5)), smoothness: Math.round(num(raw.smoothness, 1, 100, 40)), zoom: oneOf(raw.zoom, ["auto", "none"] as const, "auto"), edges: oneOf(raw.edges, ["fill", "black"] as const, "fill"), sharpen: flag(raw.sharpen, true) };
    case "slowmo":
      return { factor: Number(oneOf(String(raw.factor ?? "2"), SLOWMO_FACTORS, "2")), mode: oneOf(raw.mode, SLOWMO_MODES, "mci"), audio: oneOf(raw.audio, ["slow", "mute"] as const, "mute") };
    case "weather":
      return { kind: oneOf(raw.kind, WEATHER, "rain"), amount: num(raw.amount, 0, 1, 0.55), speed: num(raw.speed, 0.2, 3, 1), angle: num(raw.angle, -40, 40, raw.kind === "snow" ? 6 : 10), seed: Math.round(num(raw.seed, 0, 99999, 7)) };
    case "sparks":
      return { kind: oneOf(raw.kind, PARTICLES, "sparks"), amount: num(raw.amount, 0, 1, 0.55), speed: num(raw.speed, 0.2, 3, 1), direction: oneOf(raw.direction, ["up", "down"] as const, "up"), seed: Math.round(num(raw.seed, 0, 99999, 7)) };
    case "unlogo":
      return { grow: Math.round(num(raw.grow, 0, 8, 2)), mask: typeof raw.mask === "string" && raw.mask.length < 6_000_000 ? raw.mask : "" };
    case "denoise":
      return { amount: num(raw.amount, 1, 40, 14), floor: num(raw.floor, -80, -20, -50), track: flag(raw.track, true), highpass: oneOf(String(raw.highpass ?? "0"), ["0", "60", "80", "120"] as const, "0"), format: oneOf(raw.format, AUDIO_OUT, "mp3") };
    case "master": {
      const preset = oneOf(raw.preset, ["streaming", "social", "broadcast", "custom"] as const, "streaming");
      return { preset, lufs: preset === "custom" ? num(raw.lufs, -30, -8, -14) : LOUDNESS[preset], peak: num(raw.peak, -6, 0, -1.5), range: num(raw.range, 1, 20, 11), format: oneOf(raw.format, AUDIO_OUT, "mp3") };
    }
    case "mix":
      return {
        tracks: (Array.isArray(raw.tracks) ? raw.tracks : []).slice(0, MAX_MIX_TRACKS).map((t: any): Track => ({
          file: fileName(t?.file), from: oneOf(t?.from, ["audio", "videos", "edits"] as const, "audio"), volume: num(t?.volume, -40, 12, 0), offset: num(t?.offset, 0, MAX_MIX_SECONDS, 0), mute: flag(t?.mute),
        })).filter((t: Track) => t.file),
        master: flag(raw.master), lufs: num(raw.lufs, -30, -8, -16), fadeOut: num(raw.fadeOut, 0, 10, 0), format: oneOf(raw.format, AUDIO_OUT, "mp3"),
      };
    case "layer":
      return {
        layer: fileName(raw.layer), matte: fileName(raw.matte),
        // where the effect starts in the shot, and where the matte's first frame is, in seconds of the shot
        at: num(raw.at, 0, 3600, 0), matteAt: num(raw.matteAt, -3600, 3600, 0),
        x: num(raw.x, 0, 1, 0.5), y: num(raw.y, 0, 1, 0.5), size: num(raw.size, 0.1, 1, 0.6),
        // the matte's edge as Roto draws it, in the footage's pixels: a feather softens it, a choke shrinks it (or grows it, negative)
        feather: num(raw.feather, 0, 40, 2), choke: Math.round(num(raw.choke, -10, 10, 0)),
      };
  }
}

// ------------------------------------------------------------------ the ffmpeg plans

const VENC = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p"];
const AENC = ["-c:a", "aac", "-b:a", "192k"];
const FAST = ["-movflags", "+faststart"];
const EVEN = "scale=trunc(iw/2)*2:trunc(ih/2)*2";
const AUDIO_ARGS: Record<(typeof AUDIO_OUT)[number], string[]> = {
  mp3: ["-c:a", "libmp3lame", "-b:a", "256k"],
  wav: ["-c:a", "pcm_s16le"],
  m4a: ["-c:a", "aac", "-b:a", "256k"],
};

/** The chain of atempo filters that makes a sound `f` times as fast (each takes 0.5 to 2). */
export function atempoChain(f: number) {
  const parts: string[] = [];
  let r = f;
  while (r > 2) (parts.push("atempo=2"), (r /= 2));
  while (r < 0.5) (parts.push("atempo=0.5"), (r /= 0.5));
  parts.push(`atempo=${f4(r)}`);
  return parts.join(",");
}

const out = (ctx: Ctx, name: string) => join(ctx.work, name);
const clip = (ctx: Ctx) => {
  if (!ctx.input) throw new FxError("Add a clip first.");
  return ctx.input;
};
const sizeOf = (p: Probe) => ({ w: even(p.width), h: even(p.height) });
const hexArg = (h: string) => `0x${h.slice(1)}`;

/** One frame as a picture (a preview) or the whole clip, encoded: the end of every video plan. */
function finishVideo(inputs: string[], graph: string[], ctx: Ctx, audio: string[] = ["-map", "0:a?", ...AENC], note?: string): Step[] {
  if (ctx.preview) return [{ args: [...inputs, ...graph, "-an", "-frames:v", "1", "-q:v", "3", out(ctx, "out.jpg")], out: out(ctx, "out.jpg"), kind: "image", ext: "jpg" }];
  return [{ args: [...inputs, ...graph, ...VENC, ...audio, ...FAST, out(ctx, "out.mp4")], out: out(ctx, "out.mp4"), kind: "video", ext: "mp4", note }];
}
/** Where a preview looks: the clip's own frame at a time (input seeking), before any filter. */
const seek = (ctx: Ctx) => (ctx.preview ? ["-ss", f3(ctx.preview.at)] : []);

/** The checkerboard a cutout is shown on, as a lavfi source (grey squares 16 pixels wide). */
const checker = (w: number, h: number) => `nullsrc=s=${w}x${h}:r=1,format=gray,geq=lum='if(eq(mod(floor(X/16)+floor(Y/16),2),0),52,34)',format=yuv420p`;

// ---- the particles: noise stretched, blurred and scrolled; a few layers; blended in RGB

interface Layer {
  /** how many times longer than wide a speck is stretched (1 is a dot) */
  len: number;
  /** the share of the picture that is lit */
  density: number;
  /** blur: across, along */
  blur: [number, number];
  /** how bright a speck's centre is, 0 to 1 and over (the blur's dimming is undone: 1 is a full white centre) */
  bright: number;
  /** the fall, in frame heights per second (at speed 1) */
  speed: number;
  /** a layer dimmer than the one in front of it (far away) */
  dim?: number;
  /** a sway across, in pixels */
  sway?: number;
}
interface Look {
  layers: Layer[];
  /** the colour of the specks: [red, green, blue] gains */
  tint: [number, number, number];
  /** the opacity at amount 1 */
  strength: number;
  /** a very soft, wide pattern instead of specks (fog) */
  cloud?: boolean;
}
const LOOKS: Record<string, Look> = {
  rain: { layers: [{ len: 30, density: 0.011, blur: [0.7, 3], bright: 0.95, speed: 1.9 }, { len: 16, density: 0.018, blur: [0.6, 2], bright: 0.6, speed: 1.35, dim: 1 }], tint: [0.86, 0.92, 1], strength: 0.75 },
  snow: { layers: [{ len: 1, density: 0.0024, blur: [2.6, 2.6], bright: 1, speed: 0.17, sway: 40 }, { len: 1, density: 0.006, blur: [1.3, 1.3], bright: 0.75, speed: 0.1, sway: 26 }], tint: [1, 1, 1], strength: 0.95 },
  fog: { layers: [], tint: [0.9, 0.93, 1], strength: 0.8, cloud: true },
  sparks: { layers: [{ len: 9, density: 0.0016, blur: [1.7, 3], bright: 1.7, speed: 0.55, sway: 22 }, { len: 5, density: 0.003, blur: [1.2, 1.8], bright: 1.3, speed: 0.34, sway: 14 }], tint: [1, 0.66, 0.24], strength: 1 },
  embers: { layers: [{ len: 1, density: 0.0011, blur: [3, 3], bright: 1.4, speed: 0.17, sway: 44 }, { len: 1, density: 0.0028, blur: [1.8, 1.8], bright: 1, speed: 0.1, sway: 30 }], tint: [1, 0.38, 0.1], strength: 1 },
  dust: { layers: [{ len: 1, density: 0.0028, blur: [1.7, 1.7], bright: 0.5, speed: 0.045, sway: 34 }, { len: 1, density: 0.006, blur: [1, 1], bright: 0.34, speed: 0.03, sway: 20 }], tint: [1, 0.95, 0.84], strength: 0.9 },
};

/** erf, to 1e-7 (Abramowitz and Stegun 7.1.26): how much of a speck's light is left in its centre after a blur. */
const erf = (x: number) => {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
};
/** What a one-pixel-wide speck, `len` pixels tall, keeps of its brightness at its centre after a Gaussian blur: the gain that brings it back is 1 over this. */
export const centre = (len: number, sx: number, sv: number) => erf(1 / (2 * Math.SQRT2 * sx)) * erf(len / (2 * Math.SQRT2 * sv));

/** Specks of noise: a hash of the pixel's place (the expression evaluator's own random() repeats in lattices), lit with the chance `density`. */
const specks = (seed: number, density: number) => `geq=lum='st(0,abs(sin(X*12.9898+Y*78.233+${f3(seed * 37.719)}))*43758.5453);if(gt(ld(0)-floor(ld(0)),${f4(1 - density)}),255,0)'`;
/** Smooth noise (clouds): the same hash, as a grey level. */
const clouds = (seed: number) => `geq=lum='st(0,abs(sin(X*12.9898+Y*78.233+${f3(seed * 37.719)}))*43758.5453);255*(ld(0)-floor(ld(0)))'`;

/** The picture a look is laid in: a black-and-white overlay, `w` by `h`, as a filter graph that ends in the label [fx]. */
export function overlayGraph(kind: string, p: { amount: number; speed: number; angle?: number; direction?: "up" | "down"; seed?: number }, w: number, h: number, fps: number, seconds: number): string {
  const look = LOOKS[kind];
  if (!look) throw new FxError("No such effect.");
  const diag = even(Math.ceil(Math.hypot(w, h)) + 8);
  const dirs: string[] = [];
  const labels: string[] = [];
  if (look.cloud) {
    // fog: a soft cloud pattern, drifting across; as wide as the drift needs and no wider than 4000 pixels (it is never repeated)
    const drift = Math.min(28 * p.speed, 3600 / Math.max(1, seconds));
    const wide = even(w + Math.ceil(drift * seconds) + 40);
    const lw = Math.max(4, Math.round(wide / 120));
    const lh = Math.max(4, Math.round(h / 120));
    dirs.push(`nullsrc=s=${lw}x${lh}:r=${f3(fps)},format=gray,${clouds(p.seed ?? 7)},loop=loop=-1:size=1:start=0,scale=${wide}:${h}:flags=bicubic,gblur=sigma=${Math.max(16, Math.round(h / 9))}:steps=3,lut=y='clip((val-104)*2.6,0,255)',format=gray,crop=${w}:${h}:'min(t*${f3(drift)},${wide - w})':0,fps=${f3(fps)}[fx]`);
    return dirs.join(";");
  }
  look.layers.forEach((l, i) => {
    const lenH = Math.max(2, Math.ceil(diag / l.len));
    const density = clamp(l.density * (0.2 + p.amount * 1.2), 0.0002, 0.2);
    const speed = l.speed * p.speed * diag;
    const sway = l.sway ?? 0;
    const up = p.direction === "up" || (p.direction === undefined && ["sparks", "embers"].includes(kind));
    // the texture is scrolled by cropping a window out of it twice as tall as the window (the commas sit in quotes, so they are kept)
    const y = up ? `${diag}-mod(t*${f3(speed)},${diag})` : `mod(t*${f3(speed)},${diag})`;
    const texW = diag + sway * 2;
    const x = sway ? `${sway}+${sway}*sin(t*${f3(1.1 + i * 0.7)})` : "0";
    const seed = (p.seed ?? 7) + i * 3;
    dirs.push(
      `nullsrc=s=${texW}x${lenH}:r=${f3(fps)},format=gray,${specks(seed, density)},loop=loop=-1:size=1:start=0,scale=${texW}:${diag}:flags=neighbor,gblur=sigma=${f3(l.blur[0])}:sigmaV=${f3(l.blur[1])}:steps=3,lut=y='clip(val*${f3((l.bright / centre(l.len, l.blur[0], l.blur[1])))},0,255)',format=gray,split[ta${i}][tb${i}];[ta${i}][tb${i}]vstack,crop=${texW}:${diag}:0:'${y}',crop=${diag}:${diag}:'${x}':0[l${i}]`,
    );
    labels.push(`[l${i}]`);
  });
  const angle = (p.angle ?? 0) * (Math.PI / 180);
  const merged = labels.length > 1 ? `${labels.join("")}blend=all_mode=lighten` : `${labels[0]}null`;
  // (rotated as packed RGB: the filter bends the colours of planar and YUV pictures it is given)
  const rot = Math.abs(angle) > 0.002 ? `format=rgb24,rotate=${f4(angle)}:ow=iw:oh=ih:c=black,format=gray,` : "";
  dirs.push(`${merged},${rot}crop=${w}:${h},fps=${f3(fps)}[fx]`);
  return dirs.join(";");
}

/** Lays an overlay graph over the clip: a screen blend in RGB (the picture's colours stay as they are), tinted, at the amount's opacity. */
function overlayOver(kind: string, p: Params, ctx: Ctx): { inputs: string[]; graph: string[] } {
  const v = clip(ctx);
  const { w, h } = sizeOf(v);
  const look = LOOKS[kind];
  const opacity = clamp(look.strength * (0.2 + p.amount * 0.8), 0.05, 1);
  const [r, g, b] = look.tint;
  const fx = overlayGraph(kind, p as any, w, h, v.fps, ctx.preview ? 4 : v.duration);
  const filter = `${fx};[0:v]${EVEN},format=gbrp[v];[fx]format=gbrp,colorchannelmixer=rr=${f3(r)}:gg=${f3(g)}:bb=${f3(b)}[o];[v][o]blend=all_mode=screen:all_opacity=${f3(opacity)}:shortest=1,format=yuv420p[out]`;
  return { inputs: [...seek(ctx), "-i", v.path], graph: ["-filter_complex", filter, "-map", "[out]"] };
}

/** The ffmpeg steps of a tool: from safe parameters and the files probed. Pure: nothing is run or read here. */
export function plan(tool: Tool, p: Params, ctx: Ctx): Plan {
  switch (tool) {
    case "chroma": {
      const v = clip(ctx);
      const { w, h } = sizeOf(v);
      const [rr, gg, bb] = [1, 3, 5].map((i) => parseInt(p.colour.slice(i, i + 2), 16));
      const spill = p.despill && (gg >= rr || bb >= rr) && Math.max(gg, bb) > 90 ? `,despill=type=${gg >= bb ? "green" : "blue"}:mix=0.6:expand=0.25` : "";
      const key = `[0:v]${EVEN},chromakey=color=${hexArg(p.colour)}:similarity=${f3(p.similarity)}:blend=${f3(p.blend)},format=gbrap${spill}`;
      const base = [...seek(ctx), "-i", v.path];
      // a preview is one frame shown on the squares a cutout is judged on (or on what it will be laid on)
      if (ctx.preview) {
        const behind = p.output === "colour" ? `color=c=${hexArg(p.background)}:s=${w}x${h}:r=1,format=yuv420p` : checker(w, h);
        const filter = `${key},format=yuva420p[fg];${behind}[bg];[bg][fg]overlay=format=auto,format=yuv420p[out]`;
        return { steps: [{ args: [...base, "-filter_complex", filter, "-map", "[out]", "-an", "-frames:v", "1", "-q:v", "3", out(ctx, "out.jpg")], out: out(ctx, "out.jpg"), kind: "image", ext: "jpg" }], seconds: 0 };
      }
      const audioArgs = (codec: string[]) => (v.hasAudio ? ["-map", "0:a?", ...codec] : ["-an"]);
      if (p.output === "webm") {
        return { seconds: v.duration, steps: [{ args: [...base, "-filter_complex", `${key},format=yuva420p[out]`, "-map", "[out]", ...audioArgs(["-c:a", "libopus", "-b:a", "128k"]), "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-b:v", "0", "-crf", "30", "-auto-alt-ref", "0", "-row-mt", "1", "-cpu-used", "4", out(ctx, "out.webm")], out: out(ctx, "out.webm"), kind: "video", ext: "webm", note: "Clear background (WebM)" }] };
      }
      if (p.output === "mov") {
        return { seconds: v.duration, steps: [{ args: [...base, "-filter_complex", `${key},format=yuva444p10le[out]`, "-map", "[out]", ...audioArgs(["-c:a", "pcm_s16le"]), "-c:v", "prores_ks", "-profile:v", "4", "-pix_fmt", "yuva444p10le", "-vendor", "apl0", out(ctx, "out.mov")], out: out(ctx, "out.mov"), kind: "video", ext: "mov", note: "Clear background (ProRes 4444)" }] };
      }
      // laid on a colour, or on a picture
      const behind = p.output === "picture" && ctx.image
        ? { inputs: ["-loop", "1", "-framerate", f3(v.fps), "-i", ctx.image.path], bg: `[1:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},format=yuv420p[bg]` }
        : { inputs: ["-f", "lavfi", "-i", `color=c=${hexArg(p.background)}:s=${w}x${h}:r=${f3(v.fps)}`], bg: `[1:v]format=yuv420p[bg]` };
      const filter = `${key},format=yuva420p[fg];${behind.bg};[bg][fg]overlay=shortest=1:format=auto,format=yuv420p[out]`;
      return { seconds: v.duration, steps: [{ args: [...base, ...behind.inputs, "-filter_complex", filter, "-map", "[out]", ...audioArgs(AENC), ...VENC, ...FAST, "-shortest", out(ctx, "out.mp4")], out: out(ctx, "out.mp4"), kind: "video", ext: "mp4", note: p.output === "picture" ? "On a new background" : "On a colour" }] };
    }
    case "stabilise": {
      const v = clip(ctx);
      const smoothing = Math.round(2 + p.smoothness * 0.58);
      const detect: Step = { args: ["-i", v.path, "-vf", `${EVEN},vidstabdetect=shakiness=${p.shakiness}:accuracy=15:result=transforms.trf`, "-f", "null", "-"], out: out(ctx, "transforms.trf"), kind: "video", ext: "trf", keep: false, weight: 0.4 };
      const transform = `${EVEN},vidstabtransform=input=transforms.trf:smoothing=${smoothing}:optzoom=${p.zoom === "auto" ? 1 : 0}:crop=${p.edges === "fill" ? "keep" : "black"}:interpol=bicubic${p.sharpen ? ",unsharp=5:5:0.7:3:3:0.3" : ""}`;
      const steps = finishVideo(["-i", v.path], ["-vf", transform, "-map", "0:v"], ctx, v.hasAudio ? ["-map", "0:a?", "-c:a", "aac", "-b:a", "192k"] : ["-an"], "Stabilised");
      steps[0].weight = 0.6;
      return { steps: [detect, ...steps], seconds: v.duration };
    }
    case "slowmo": {
      const v = clip(ctx);
      const F = p.factor as number;
      const target = Math.min(120, Math.round(v.fps * F));
      const mi = p.mode === "mci" ? `:mc_mode=aobmc:me_mode=bidir:vsbmc=1` : "";
      const vf = p.mode === "dup" ? `${EVEN},setpts=${f3(F)}*PTS` : `${EVEN},minterpolate=fps=${target}:mi_mode=${p.mode}${mi},setpts=${f3(F)}*PTS`;
      const audio = v.hasAudio && p.audio === "slow" ? ["-map", "0:a?", "-af", atempoChain(1 / F), ...AENC] : ["-an"];
      return { seconds: v.duration * F, steps: finishVideo(["-i", v.path], ["-vf", vf, "-map", "0:v"], ctx, audio, `${F}× slower`) };
    }
    case "weather":
    case "sparks": {
      const v = clip(ctx);
      const { inputs, graph } = overlayOver(p.kind, p, ctx);
      const steps = finishVideo(inputs, [...graph, "-t", f3(v.duration)], ctx, v.hasAudio ? ["-map", "0:a?", ...AENC] : ["-an"], `${p.kind[0].toUpperCase()}${p.kind.slice(1)} over the clip`);
      return { steps, seconds: v.duration };
    }
    case "unlogo": {
      const v = clip(ctx);
      // the mask drawn on the picture: scaled to the clip, made black and white and grown a little, so the edges of the spot go too
      const grown = Array.from({ length: p.grow }, () => "dilation").join(",");
      const prep: Step = { args: ["-i", "mask-src.png", "-vf", `scale=${v.width}:${v.height}:flags=neighbor,format=gray,lut=y='if(gt(val,40),255,0)'${grown ? `,${grown}` : ""}`, "-frames:v", "1", out(ctx, "mask.png")], out: out(ctx, "mask.png"), kind: "image", ext: "png", keep: false, weight: 0.02 };
      const steps = finishVideo(seek(ctx).concat(["-i", v.path]), ["-vf", `removelogo=filename=mask.png,${EVEN}`, "-map", "0:v"], ctx, v.hasAudio ? ["-map", "0:a?", "-c:a", "copy"] : ["-an"], "A spot removed");
      return { steps: [prep, ...steps], seconds: v.duration, files: {} };
    }
    case "denoise": {
      const a = clip(ctx);
      const filter = [p.highpass !== "0" ? `highpass=f=${p.highpass}` : "", `afftdn=nr=${f3(p.amount)}:nf=${f3(p.floor)}:tn=${p.track ? 1 : 0}`].filter(Boolean).join(",");
      if (a.hasVideo) return { seconds: a.duration, steps: [{ args: ["-i", a.path, "-map", "0:v", "-map", "0:a", "-c:v", "copy", "-af", filter, ...AENC, ...FAST, out(ctx, "out.mp4")], out: out(ctx, "out.mp4"), kind: "video", ext: "mp4", note: "Cleaner sound" }] };
      return { seconds: a.duration, steps: [{ args: ["-i", a.path, "-vn", "-af", filter, ...AUDIO_ARGS[p.format as (typeof AUDIO_OUT)[number]], out(ctx, `out.${p.format}`)], out: out(ctx, `out.${p.format}`), kind: "audio", ext: p.format, note: `Noise down ${f3(p.amount)} dB` }] };
    }
    case "master": {
      const a = clip(ctx);
      const m = ctx.measured;
      const target = `I=${f3(p.lufs)}:TP=${f3(p.peak)}:LRA=${f3(p.range)}`;
      // the second pass knows what the first measured, so the gain is one steady change instead of a moving one
      const loud = m ? `loudnorm=${target}:measured_I=${f3(m.input_i)}:measured_LRA=${f3(m.input_lra)}:measured_TP=${f3(m.input_tp)}:measured_thresh=${f3(m.input_thresh)}:offset=${f3(m.target_offset)}:linear=true` : `loudnorm=${target}`;
      const note = m ? `${f3(m.input_i)} → ${f3(p.lufs)} LUFS` : `To ${f3(p.lufs)} LUFS`;
      if (a.hasVideo) return { seconds: a.duration, steps: [{ args: ["-i", a.path, "-map", "0:v", "-map", "0:a", "-c:v", "copy", "-af", `${loud},aresample=48000`, ...AENC, ...FAST, out(ctx, "out.mp4")], out: out(ctx, "out.mp4"), kind: "video", ext: "mp4", note }] };
      return { seconds: a.duration, steps: [{ args: ["-i", a.path, "-vn", "-af", `${loud},aresample=48000`, ...AUDIO_ARGS[p.format as (typeof AUDIO_OUT)[number]], out(ctx, `out.${p.format}`)], out: out(ctx, `out.${p.format}`), kind: "audio", ext: p.format, note }] };
    }
    case "layer": {
      const v = clip(ctx);
      const fx = ctx.layer;
      if (!fx?.hasVideo) throw new FxError("The effect is missing. Add it again.");
      const { w, h } = sizeOf(v);
      const fps = v.fps > 0 ? v.fps : 24;
      // counted in frames, so no frame of the shot is lost or doubled where it is cut
      const total = Math.max(1, Math.round(v.duration * fps));
      const atF = Math.min(Math.max(0, Math.round(p.at * fps)), total - 1);
      const lenF = Math.max(1, Math.min(Math.round(fx.duration * fps), total - atF));
      const endF = atF + lenF;
      // where the effect is: a soft circle around the spot it was placed on (the place dot's circle, size x 45% of the width across,
      // given room for its glow), full inside, fading out to its edge; drawn once
      const r = Math.max(16, p.size * 0.225 * w * 1.8);
      const cx = Math.round(p.x * w);
      const cy = Math.round(p.y * h);
      const region: Step = { args: ["-f", "lavfi", "-i", `color=c=black:s=${w}x${h}:d=1,format=gray,geq=lum='255*clip((${f3(r)}-hypot(X-${cx},Y-${cy}))/${f3(r * 0.45)},0,1)'`, "-frames:v", "1", out(ctx, "region.png")], out: out(ctx, "region.png"), kind: "image", ext: "png", keep: false, weight: 0.02 };
      // the shot in up to three parts: before the effect, under it, after it (an empty part is left out)
      const parts = [atF >= 1 ? "a" : "", "b", total - endF >= 1 ? "c" : ""].filter(Boolean);
      const cut: Record<string, string> = { a: `trim=end_frame=${atF}`, b: `trim=start_frame=${atF}:end_frame=${endF}`, c: `trim=start_frame=${endF}` };
      // (a stream a frame short is held on its last frame, so the part under the effect is never shorter than its frames)
      const hold = `tpad=stop_mode=clone:stop_duration=1,trim=end_frame=${lenF}`;
      const graph = [
        `[0:v]${EVEN},setsar=1,format=yuv420p,split=${parts.length}${parts.map((x) => `[s${x}]`).join("")}`,
        ...parts.map((x) => `[s${x}]${cut[x]},setpts=PTS-STARTPTS[${x === "b" ? "under" : x}]`),
        `[1:v]fps=${f3(fps)},${hold},setpts=PTS-STARTPTS,scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1,format=yuv420p[fx]`,
        `[2:v]format=gray,scale=${w}:${h},trim=end_frame=${lenF}[region]`,
      ];
      let alpha = "[region]";
      if (ctx.matte) {
        // the people held in front: the matte at the shot's time (black, nobody, before it starts; its last frame held after it ends),
        // its edge as Roto draws it, turned over so it is 0 on them, and taken out of the region
        const fromF = atF - Math.round(p.matteAt * fps);
        const time = fromF >= 0 ? `trim=start_frame=${fromF},setpts=PTS-STARTPTS` : `setpts=PTS-STARTPTS,tpad=start=${-fromF}:start_mode=add:color=black`;
        const edge = [...Array(Math.abs(p.choke)).fill(p.choke > 0 ? "erosion" : "dilation"), p.feather > 0 ? `gblur=sigma=${f3(p.feather)}` : ""].filter(Boolean).join(",");
        graph.push(`[3:v]fps=${f3(fps)},${time},tpad=stop_mode=clone:stop=${lenF},trim=end_frame=${lenF},scale=${w}:${h},format=gray${edge ? `,${edge}` : ""},negate[open]`);
        graph.push(`[region][open]blend=all_mode=multiply:shortest=1[alpha]`);
        alpha = "[alpha]";
      }
      graph.push(`[fx]${alpha}alphamerge[fxa]`, `[under][fxa]overlay=format=auto:shortest=1,format=yuv420p[b]`);
      graph.push(parts.length > 1 ? `${parts.map((x) => `[${x}]`).join("")}concat=n=${parts.length}:v=1:a=0[out]` : `[b]null[out]`);
      const inputs = ["-i", v.path, "-i", fx.path, "-loop", "1", "-framerate", f3(fps), "-i", out(ctx, "region.png"), ...(ctx.matte ? ["-i", ctx.matte.path] : [])];
      const steps = finishVideo(inputs, ["-filter_complex", graph.join(";"), "-map", "[out]"], ctx, v.hasAudio ? ["-map", "0:a?", ...AENC] : ["-an"], ctx.matte ? "The effect laid in, behind the people" : "The effect laid in");
      return { steps: [region, ...steps], seconds: v.duration };
    }
    case "mix": {
      const tracks = ctx.tracks ?? [];
      if (!tracks.length) throw new FxError("Add a sound to the mix.");
      const parts = tracks.map(({ spec }, i) => {
        const ms = Math.round(spec.offset * 1000);
        return `[${i}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${f3(spec.volume)}dB,adelay=${ms}|${ms}[a${i}]`;
      });
      const end = Math.max(...tracks.map(({ probe, spec }) => spec.offset + probe.duration));
      const fade = p.fadeOut > 0 ? `,afade=t=out:st=${f3(Math.max(0, end - p.fadeOut))}:d=${f3(p.fadeOut)}` : "";
      const tail = p.master ? `,loudnorm=I=${f3(p.lufs)}:TP=-1.5:LRA=11,aresample=48000` : "";
      const mixed = tracks.length === 1 ? `[a0]alimiter=limit=0.97${fade}${tail}[out]` : `${tracks.map((_, i) => `[a${i}]`).join("")}amix=inputs=${tracks.length}:normalize=0:duration=longest,alimiter=limit=0.97${fade}${tail}[out]`;
      const inputs = tracks.flatMap(({ probe }) => ["-i", probe.path]);
      return { seconds: Math.min(MAX_MIX_SECONDS, end), steps: [{ args: [...inputs, "-filter_complex", `${parts.join(";")};${mixed}`, "-map", "[out]", "-t", f3(Math.min(MAX_MIX_SECONDS, end)), ...AUDIO_ARGS[p.format as (typeof AUDIO_OUT)[number]], out(ctx, `out.${p.format}`)], out: out(ctx, `out.${p.format}`), kind: "audio", ext: p.format, note: `${tracks.length} ${tracks.length === 1 ? "sound" : "sounds"} mixed` }] };
    }
  }
}

/** The first pass of a loudness job: measures the sound (ffmpeg prints the numbers as JSON on its error output). */
export function measureArgs(p: Params, input: string) {
  return ["-hide_banner", "-nostdin", "-i", input, "-vn", "-af", `loudnorm=I=${f3(p.lufs)}:TP=${f3(p.peak)}:LRA=${f3(p.range)}:print_format=json`, "-f", "null", "-"];
}
/** The numbers a loudnorm measuring pass printed, or null when they are not there. */
export function readMeasured(stderr: string): Measured | null {
  const at = stderr.lastIndexOf("{");
  const end = stderr.lastIndexOf("}");
  if (at < 0 || end < at) return null;
  try {
    const j = JSON.parse(stderr.slice(at, end + 1));
    const m: Measured = { input_i: Number(j.input_i), input_tp: Number(j.input_tp), input_lra: Number(j.input_lra), input_thresh: Number(j.input_thresh), target_offset: Number(j.target_offset) };
    return Object.values(m).every(Number.isFinite) ? m : null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ probing and files

async function probe(path: string): Promise<Probe> {
  const { stdout } = await exec("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,width,height,avg_frame_rate,r_frame_rate:format=duration", "-of", "json", path], { maxBuffer: 1 << 20 }).catch(() => {
    throw new FxError("That file can't be read.", 415);
  });
  const j = JSON.parse(stdout);
  const streams: any[] = j.streams ?? [];
  const video = streams.find((s) => s.codec_type === "video");
  const rate = String(video?.avg_frame_rate && video.avg_frame_rate !== "0/0" ? video.avg_frame_rate : video?.r_frame_rate ?? "24/1").split("/");
  return {
    path, duration: Number(j.format?.duration) || 0, width: Number(video?.width) || 0, height: Number(video?.height) || 0,
    fps: clamp(Number(rate[0]) / (Number(rate[1]) || 1) || 24, 1, 120), hasAudio: streams.some((s) => s.codec_type === "audio"), hasVideo: !!video,
  };
}

async function exists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

const sha = (path: string) => new Promise<string>((ok, bad) => {
  const h = createHash("sha256");
  createReadStream(path).on("data", (c) => h.update(c)).on("error", bad).on("end", () => ok(h.digest("hex").slice(0, 16)));
});

export interface Result {
  kind: "video" | "audio" | "image";
  file: string;
  url: string;
  width: number;
  height: number;
  duration: number;
  bytes: number;
  ext: string;
  note?: string;
  name?: string;
}
export interface JobState {
  id: string;
  tool: Tool;
  status: "queued" | "running" | "done" | "failed" | "canceled";
  progress: number;
  results: Result[];
  error?: string;
  at: number;
}

/** What ffmpeg's failure says, in a few words. */
function why(stderr: string, code: number | null) {
  const said = stderr.split("\n").map((l) => l.trim()).filter(Boolean).slice(-2).join(" ").slice(0, 280);
  return said || `ffmpeg ended with code ${code}`;
}

/** The filters the server's ffmpeg has, for the ones the effects need (a card can say it cannot work here). */
export async function capabilities() {
  const text = await exec("ffmpeg", ["-hide_banner", "-filters"], { maxBuffer: 4 << 20 }).then((r) => r.stdout, () => "");
  const has = (name: string) => new RegExp(`\\s${name}\\s`).test(text);
  return {
    chroma: has("chromakey") && has("despill"), stabilise: has("vidstabdetect") && has("vidstabtransform"), slowmo: has("minterpolate"), weather: has("geq") && has("blend"),
    sparks: has("geq") && has("blend"), unlogo: has("removelogo") && has("dilation"), denoise: has("afftdn"), master: has("loudnorm"), mix: has("amix") && has("adelay"),
    layer: has("alphamerge") && has("geq") && has("gblur") && has("tpad"),
  };
}

// ------------------------------------------------------------------ the module

export interface FxDeps {
  data: string;
  root: string;
  /** Puts a sound in the library with its name noted (the server's own); without it the file is only kept. */
  keepAudio?: (bytes: Buffer, ext: string, meta: { name: string; kind: string; prompt?: string }) => Promise<{ file: string; url: string; seconds: number }>;
}

export function createFx({ data, keepAudio }: FxDeps) {
  const jobs = new Map<string, JobState & { child?: ReturnType<typeof spawn>; stop?: boolean }>();
  const fxDir = join(data, "edits");
  let running = 0;
  const waiting: (() => void)[] = [];
  const slot = async () => {
    if (running >= 2) await new Promise<void>((ok) => waiting.push(ok));
    running++;
  };
  const free = () => {
    running--;
    waiting.shift()?.();
  };

  /** A library file by its folders and name, or a clear error. */
  const find = async (dirs: string[], v: unknown, what: string) => {
    const name = fileName(v);
    for (const dir of dirs) if (name && (await exists(join(data, dir, name)))) return join(data, dir, name);
    throw new FxError(`${what} is missing. Add it again.`);
  };

  async function keep(step: Step, name: string): Promise<Result> {
    const hash = await sha(step.out);
    const file = `${hash}.${step.ext}`;
    const info = await probe(step.out).catch(() => null);
    if (step.kind === "audio" && keepAudio) {
      const kept = await keepAudio(await readFile(step.out), `.${step.ext}`, { name, kind: "fx" });
      return { kind: "audio", file: kept.file, url: kept.url, width: 0, height: 0, duration: Math.round((kept.seconds || info?.duration || 0) * 100) / 100, bytes: (await stat(step.out)).size, ext: step.ext, note: step.note, name };
    }
    const dir = step.kind === "video" && step.ext === "mp4" ? "videos" : step.kind === "audio" ? "audio" : step.kind === "image" && (step.ext === "png" || step.ext === "jpg") ? "photos" : "edits";
    await mkdir(join(data, dir), { recursive: true });
    const target = join(data, dir, file);
    if (!(await exists(target))) await rename(step.out, target).catch(async () => (await copyFile(step.out, target), await rm(step.out, { force: true })));
    return { kind: step.kind, file, url: `/media/${dir}/${file}`, width: info?.width ?? 0, height: info?.height ?? 0, duration: Math.round((info?.duration ?? 0) * 100) / 100, bytes: (await stat(target)).size, ext: step.ext, note: step.note, name };
  }

  /** Everything a tool needs, found and probed. */
  async function prepare(tool: Tool, body: Params) {
    const id = randomBytes(6).toString("hex");
    const work = join(fxDir, `fx-${id}`);
    const ctx: Ctx = { work };
    const files: Record<string, Buffer> = {};
    let params: Params;
    if (tool === "mix") {
      params = clean(tool, body);
      if (!params.tracks.length) throw new FxError("Add a sound to the mix.");
      ctx.tracks = [];
      for (const spec of params.tracks as Track[]) {
        const path = await find([spec.from], spec.file, "A sound of the mix");
        const p = await probe(path);
        if (!p.hasAudio) throw new FxError("One of the clips has no sound.");
        ctx.tracks.push({ probe: p, spec });
      }
      if (!ctx.tracks.some((t) => !t.spec.mute)) throw new FxError("Every track is muted.");
      ctx.tracks = ctx.tracks.filter((t) => !t.spec.mute);
    } else {
      const audioTool = tool === "denoise" || tool === "master";
      const path = audioTool ? await find(["audio", "videos", "edits"], body.file ?? body.audio ?? body.video, "The file") : await find(["videos", "edits"], body.video, "The clip");
      const input = await probe(path);
      if (audioTool ? !input.hasAudio : !input.hasVideo) throw new FxError(audioTool ? "That file has no sound." : "That file has no picture.");
      ctx.input = input;
      params = clean(tool, body, { duration: input.duration });
      if (tool === "stabilise" && input.duration > 120) throw new FxError("Stabilise clips of up to two minutes.");
      if (tool === "slowmo" && params.mode !== "dup" && input.duration > 30) throw new FxError("Smooth slow-motion takes clips of up to 30 seconds.");
      if ((tool === "weather" || tool === "sparks") && input.duration > 180) throw new FxError("Lay effects over clips of up to three minutes.");
      if (tool === "chroma" && params.output === "picture") ctx.image = await probe(await find(["photos"], params.picture, "The background picture"));
      if (tool === "chroma" && params.output === "picture" && !params.picture) throw new FxError("Pick the picture to put behind.");
      if (tool === "layer") {
        ctx.layer = await probe(await find(["videos", "edits"], params.layer, "The effect"));
        if (params.matte) ctx.matte = await probe(await find(["videos", "edits"], params.matte, "Roto's matte"));
        if (input.duration > 180) throw new FxError("Lay effects into clips of up to three minutes.");
      }
      if (tool === "unlogo") {
        const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(params.mask);
        const bytes = m ? Buffer.from(m[1], "base64") : null;
        if (!bytes || bytes.length < 8 || bytes.readUInt32BE(0) !== 0x89504e47) throw new FxError("Paint over the spot to remove first.");
        files["mask-src.png"] = bytes;
      }
    }
    await mkdir(work, { recursive: true });
    for (const [name, bytes] of Object.entries(files)) await writeFile(join(work, name), bytes);
    return { id, work, ctx, params };
  }

  function runStep(job: JobState & { child?: ReturnType<typeof spawn>; stop?: boolean }, step: Step, work: string, span: number, base: number, seconds: number, capture?: (stderr: string) => void) {
    return new Promise<void>((ok, bad) => {
      const child = spawn("ffmpeg", ["-hide_banner", "-v", capture ? "info" : "error", "-nostdin", "-y", "-progress", "pipe:1", "-nostats", ...step.args], { cwd: work });
      job.child = child;
      let err = "";
      let buf = "";
      child.stdout.on("data", (c: Buffer) => {
        buf += c.toString();
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const l of lines) {
          const m = /^out_time_(?:us|ms)=(\d+)/.exec(l);
          if (m && seconds > 0) job.progress = Math.min(0.99, base + span * Math.min(1, Number(m[1]) / 1e6 / seconds));
        }
      });
      child.stderr.on("data", (c: Buffer) => (err = (err + c.toString()).slice(-(capture ? 20000 : 2000))));
      child.on("error", (e) => bad(new Error(e.message)));
      child.on("close", (code) => {
        if (code !== 0) return bad(new Error(job.stop ? "stopped" : why(err, code)));
        capture?.(err);
        ok();
      });
    });
  }

  /** A loudness job's first pass: measures the sound, answers the numbers. */
  async function measure(job: JobState & { child?: ReturnType<typeof spawn>; stop?: boolean }, params: Params, input: string, work: string) {
    let said = "";
    await new Promise<void>((ok, bad) => {
      const child = spawn("ffmpeg", measureArgs(params, input), { cwd: work });
      job.child = child;
      child.stderr.on("data", (c: Buffer) => (said = (said + c.toString()).slice(-20000)));
      child.on("error", (e) => bad(new Error(e.message)));
      child.on("close", (code) => (code === 0 ? ok() : bad(new Error(job.stop ? "stopped" : why(said, code)))));
    });
    return readMeasured(said);
  }

  /** Starts a tool: everything is checked and probed first (a bad request fails here), then it runs in the background. */
  async function start(tool: Tool, body: Params): Promise<JobState> {
    const { id, work, ctx, params } = await prepare(tool, body);
    const job: JobState & { child?: ReturnType<typeof spawn>; stop?: boolean } = { id, tool, status: "queued", progress: 0, results: [], at: Date.now() };
    jobs.set(id, job);
    for (const [k, j] of jobs) if (Date.now() - j.at > 30 * 60_000 && j.status !== "running") jobs.delete(k);
    const label = fileLabel(tool, body);
    (async () => {
      await slot();
      try {
        if (job.stop) throw new Error("stopped");
        job.status = "running";
        if (tool === "master") {
          ctx.measured = (await measure(job, params, ctx.input!.path, work)) ?? undefined;
          job.progress = 0.3;
        }
        const made = plan(tool, params, ctx);
        const total = made.steps.reduce((s, x) => s + (x.weight ?? 1), 0);
        const first = tool === "master" ? 0.3 : 0;
        let done = 0;
        for (const [i, step] of made.steps.entries()) {
          const span = ((step.weight ?? 1) / total) * (1 - first);
          await runStep(job, step, work, span, first + (done / total) * (1 - first), made.seconds);
          done += step.weight ?? 1;
          job.progress = Math.min(0.99, first + (done / total) * (1 - first));
          if (step.keep !== false) job.results.push(await keep(step, label));
        }
        job.status = "done";
        job.progress = 1;
      } catch (e) {
        job.status = job.stop ? "canceled" : "failed";
        job.error = job.stop ? "Stopped." : (e as Error).message;
      } finally {
        free();
        job.child = undefined;
        await rm(work, { recursive: true, force: true });
      }
    })();
    return view(job);
  }

  const view = (j: JobState): JobState => ({ id: j.id, tool: j.tool, status: j.status, progress: Math.round(j.progress * 1000) / 1000, results: j.results, ...(j.error ? { error: j.error } : {}), at: j.at });

  /** One frame of what a tool would make, as a picture under edits/preview. */
  async function preview(tool: Tool, body: Params) {
    if (!PREVIEWS.includes(tool)) throw new FxError("That tool has no preview.");
    const { work, ctx, params } = await prepare(tool, body);
    try {
      const d = ctx.input!.duration;
      ctx.preview = { at: clamp(Number(body.at) || 0, 0, Math.max(0, d - 0.04)) };
      const made = plan(tool, params, ctx);
      for (const step of made.steps) {
        await exec("ffmpeg", ["-hide_banner", "-v", "error", "-nostdin", "-y", ...step.args], { cwd: work, maxBuffer: 1 << 20 }).catch((e) => {
          throw new FxError(why(String(e.stderr ?? ""), e.code ?? null));
        });
      }
      const last = made.steps[made.steps.length - 1];
      const hash = await sha(last.out);
      await mkdir(join(fxDir, "preview"), { recursive: true });
      const file = `${hash}.jpg`;
      await copyFile(last.out, join(fxDir, "preview", file));
      return { url: `/media/edits/preview/${file}` };
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  }

  /** What a file holds: its length, size, rate and streams. */
  async function info(body: Params) {
    const path = await find(oneOf(body.from, ["audio", "videos", "edits", "any"] as const, "any") === "any" ? ["videos", "audio", "edits"] : [body.from], body.file, "The file");
    const p = await probe(path);
    return { duration: p.duration, width: p.width, height: p.height, fps: p.fps, hasAudio: p.hasAudio, hasVideo: p.hasVideo };
  }

  /** What the page asks of the module: a route under api/utensils/fx/. */
  async function handle(method: string, rest: string, body: Params): Promise<{ status: number; body: unknown }> {
    if (method === "GET" && rest === "capabilities") return { status: 200, body: await capabilities() };
    if (method === "POST" && (TOOLS as readonly string[]).includes(rest)) return { status: 202, body: await start(rest as Tool, body) };
    if (method === "POST" && rest === "preview") return { status: 200, body: await preview(oneOf(body.tool, TOOLS, "chroma"), body) };
    if (method === "POST" && rest === "probe") return { status: 200, body: await info(body) };
    const job = /^jobs\/(\w+)$/.exec(rest);
    if (job) {
      const j = jobs.get(job[1]);
      if (!j) throw new FxError("No such job.", 404);
      if (method === "DELETE") {
        j.stop = true;
        j.child?.kill("SIGKILL");
        if (j.status === "queued") j.status = "canceled";
      }
      return { status: 200, body: view(j) };
    }
    throw new FxError("No such effect.", 404);
  }

  return { start, preview, handle, get: (id: string) => (jobs.get(id) ? view(jobs.get(id)!) : null) };
}

/** A name for what a job made: the tool's, and the file it worked on. */
function fileLabel(tool: Tool, body: Params) {
  const names: Record<Tool, string> = { chroma: "Cutout", stabilise: "Stabilised", slowmo: "Slow motion", weather: "Weather", sparks: "Particles", unlogo: "Spot removed", denoise: "Cleaned sound", master: "Mastered sound", mix: "Mix", layer: "Effect laid in" };
  const src = String(body.title ?? body.name ?? "").replace(/[^\w .-]/g, "").trim().slice(0, 40);
  return src ? `${names[tool]}: ${src}` : names[tool];
}
