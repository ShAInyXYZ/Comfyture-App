// Utensils' Edit tools: twelve free tools that run on this machine with ffmpeg (trim, reframe, speed, reverse, loop, merge,
// captions, colour grade, a logo, the sound, the format, GIFs and frames). Nothing here calls Comfy Cloud and nothing costs
// credits. The module has three layers: clean() makes what the page sent safe (numbers clamped, words from a list, never a
// user's text in a command), plan() turns safe parameters and what was probed of the clips into ffmpeg steps (pure functions,
// so the tests can read every argument), and createEdit() runs the steps as jobs with progress and cancel and keeps what
// they make in the library (a clip in videos/, a sound in audio/, a picture in photos/, the rest in edits/).

import { spawn, execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, copyFile, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { cleanCues } from "../web/js/utensils-edit-cues.js";
import { FORMATS, reframeBox, letterboxFrame, frameOf } from "../web/js/utensils-edit-geometry.js";

const exec = promisify(execFile);

export const TOOLS = ["trim", "reframe", "speed", "reverse", "loop", "merge", "captions", "grade", "logo", "audio", "convert", "gif"] as const;
export type Tool = (typeof TOOLS)[number];
/** The tools that can show one frame of what they would make (a preview), because they draw on every frame the same way. */
export const PREVIEWS: Tool[] = ["reframe", "grade", "logo", "captions"];

export class EditError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

// ------------------------------------------------------------------ what a clip is

export interface Probe {
  path: string;
  duration: number;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
  hasVideo: boolean;
}

/** What the plans are made from: the clips probed, the files the tool names, and where the work is done. */
export interface Ctx {
  work: string;
  videos: Probe[];
  image?: Probe;
  audio?: Probe;
  lut?: boolean;
  /** whether a trim's start is on a keyframe, so the stream can be copied and the cut stays exact */
  startOnKeyframe?: boolean;
  preview?: { at: number };
}

export interface Step {
  args: string[];
  out: string;
  kind: "video" | "audio" | "image";
  ext: string;
}
export interface Plan {
  steps: Step[];
  /** how long the result runs, for the progress of a step */
  seconds: number;
  /** text files the plan needs in the work folder (name → text) */
  files?: Record<string, string>;
}

// ------------------------------------------------------------------ safe parameters

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const num = (v: unknown, lo: number, hi: number, d: number) => (v !== null && v !== "" && v !== undefined && Number.isFinite(Number(v)) ? clamp(Number(v), lo, hi) : d);
const oneOf = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);
const flag = (v: unknown) => v === true || v === "true" || v === 1;
const hex = (v: unknown, d: string) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v.trim()) ? v.trim().toUpperCase() : d);
/** A file's name in a library folder: letters, digits, dots, dashes and underscores, never a path. */
export const fileName = (v: unknown) => (typeof v === "string" && /^[\w][\w.-]{0,120}$/.test(v) ? v : "");
const f3 = (v: number) => (Math.round(v * 1000) / 1000).toString();
const f4 = (v: number) => (Math.round(v * 10000) / 10000).toString();

export const GRADES = ["none", "warm", "cool", "filmic", "punchy", "faded", "noir"] as const;
export const CORNERS = ["tl", "tr", "bl", "br", "centre"] as const;
export const CONVERTS = ["mp4", "webm", "mov", "gif", "mp3", "wav", "m4a"] as const;
export const CAPTION_STYLES = ["bold", "outline", "box", "minimal"] as const;
export const MAX_TOTAL_SECONDS = 180;

type Params = Record<string, any>;

/** The parameters of a tool, made safe: every number clamped, every choice from its list, every name a plain file name. */
export function clean(tool: Tool, raw: Params, ctx: { duration?: number } = {}): Params {
  const d = ctx.duration ?? 3600;
  const at = (v: unknown, def: number) => num(v, 0, d, def);
  switch (tool) {
    case "trim": {
      const start = at(raw.start, 0);
      const end = clamp(num(raw.end, 0, d, d), start + 0.1, Math.max(start + 0.1, d));
      return { start, end, mode: oneOf(raw.mode, ["auto", "copy", "encode"] as const, "auto") };
    }
    case "reframe":
      return {
        format: oneOf(raw.format, Object.keys(FORMATS) as (keyof typeof FORMATS)[], "9:16"),
        x: num(raw.x, 0, 1, 0.5), y: num(raw.y, 0, 1, 0.5), zoom: num(raw.zoom, 1, 4, 1),
        fill: oneOf(raw.fill, ["fill", "blur", "colour"] as const, "fill"), colour: hex(raw.colour, "#000000"),
      };
    case "speed":
      return { factor: num(raw.factor, 0.25, 4, 1), smooth: flag(raw.smooth) };
    case "reverse":
      return {};
    case "loop":
      return { times: Math.round(num(raw.times, 2, 10, 2)), pingpong: flag(raw.pingpong) };
    case "merge":
      return { crossfade: num(raw.crossfade, 0, 2, 0), fit: oneOf(raw.fit, ["cover", "contain"] as const, "contain"), aspect: oneOf(raw.aspect, ["first", ...Object.keys(FORMATS)] as const, "first") };
    case "captions":
      return {
        cues: cleanCues(raw.cues, d), style: oneOf(raw.style, CAPTION_STYLES, "bold"), position: oneOf(raw.position, ["bottom", "middle", "top"] as const, "bottom"),
        size: num(raw.size, 3, 14, 6), colour: hex(raw.colour, "#F2FF59"), font: oneOf(raw.font, ["sans", "lyric"] as const, "sans"), caps: flag(raw.caps),
      };
    case "grade":
      return {
        preset: oneOf(raw.preset, GRADES, "none"), exposure: num(raw.exposure, -1, 1, 0), contrast: num(raw.contrast, 0.5, 2, 1), saturation: num(raw.saturation, 0, 3, 1),
        temperature: num(raw.temperature, -1, 1, 0), tint: num(raw.tint, -1, 1, 0), vignette: flag(raw.vignette), lut: fileName(raw.lut),
      };
    case "logo":
      return {
        corner: oneOf(raw.corner, CORNERS, "br"), scale: num(raw.scale, 4, 60, 18), opacity: num(raw.opacity, 0.1, 1, 1), margin: num(raw.margin, 0, 15, 4),
        fadeIn: num(raw.fadeIn, 0, 3, 0), fadeOut: num(raw.fadeOut, 0, 3, 0), start: at(raw.start, 0), end: num(raw.end, 0, d, d),
      };
    case "audio":
      return { mode: oneOf(raw.mode, ["mute", "replace", "mix"] as const, "mute"), volume: num(raw.volume, 0, 2, 1), videoVolume: num(raw.videoVolume, 0, 2, 1), fadeOut: num(raw.fadeOut, 0, 5, 0) };
    case "convert":
      return {
        format: oneOf(raw.format, CONVERTS, "mp4"), quality: oneOf(raw.quality, ["high", "medium", "small"] as const, "medium"),
        height: oneOf(String(raw.height ?? "0"), ["0", "360", "480", "720", "1080", "1440"] as const, "0"), fps: oneOf(String(raw.fps ?? "0"), ["0", "12", "15", "24", "30", "60"] as const, "0"),
        codec: oneOf(raw.codec, ["h264", "prores"] as const, "h264"),
      };
    case "gif": {
      const start = at(raw.start, 0);
      return {
        mode: oneOf(raw.mode, ["gif", "frames"] as const, "gif"), start, end: clamp(num(raw.end, 0, d, Math.min(d, start + 4)), start + 0.2, Math.max(start + 0.2, d)),
        width: Math.round(num(raw.width, 120, 1280, 480) / 2) * 2, fps: Math.round(num(raw.fps, 5, 24, 15)),
        count: Math.round(num(raw.count, 1, 24, 6)), format: oneOf(raw.format, ["png", "jpg"] as const, "png"),
        times: (Array.isArray(raw.times) ? raw.times : []).slice(0, 24).map((t: unknown) => num(t, 0, d, 0)),
      };
    }
  }
}

// ------------------------------------------------------------------ the ffmpeg plans

const VENC = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p"];
const AENC = ["-c:a", "aac", "-b:a", "192k"];
const FAST = ["-movflags", "+faststart"];
const EVEN = "scale=trunc(iw/2)*2:trunc(ih/2)*2";

/** The chain of atempo filters that makes a sound `f` times as fast (each takes 0.5 to 2). */
export function atempoChain(f: number) {
  const parts: string[] = [];
  let r = f;
  while (r > 2) (parts.push("atempo=2"), (r /= 2));
  while (r < 0.5) (parts.push("atempo=0.5"), (r /= 0.5));
  parts.push(`atempo=${f4(r)}`);
  return parts.join(",");
}

/** A picture and its encoding: one frame at a time (a preview), or the whole clip. */
function finish(inputs: string[], filter: string, label: string | null, ctx: Ctx, audio: string[] = ["-map", "0:a?", ...AENC]): Step[] {
  const graph = label ? ["-filter_complex", filter, "-map", `[${label}]`] : ["-vf", filter, "-map", "0:v"];
  if (ctx.preview) return [{ args: [...inputs, ...graph, "-an", "-ss", f3(ctx.preview.at), "-frames:v", "1", "-q:v", "3", join(ctx.work, "out.jpg")], out: join(ctx.work, "out.jpg"), kind: "image", ext: "jpg" }];
  return [{ args: [...inputs, ...graph, ...VENC, ...audio, ...FAST, join(ctx.work, "out.mp4")], out: join(ctx.work, "out.mp4"), kind: "video", ext: "mp4" }];
}

const out = (ctx: Ctx, ext: string) => join(ctx.work, `out.${ext}`);

const OVERLAY_AT: Record<string, (m: string) => string> = {
  tl: (m) => `x=${m}:y=${m}`, tr: (m) => `x=W-w-${m}:y=${m}`, bl: (m) => `x=${m}:y=H-h-${m}`, br: (m) => `x=W-w-${m}:y=H-h-${m}`, centre: () => "x=(W-w)/2:y=(H-h)/2",
};

const GRADE_PRESETS: Record<string, { exposure?: number; contrast?: number; saturation?: number; temperature?: number; tint?: number; vignette?: boolean; curves?: string }> = {
  none: {},
  warm: { temperature: 0.35, saturation: 1.08 },
  cool: { temperature: -0.35, saturation: 1.04 },
  filmic: { contrast: 1.1, saturation: 0.92, curves: "0/0.03 0.25/0.22 0.75/0.8 1/0.97", tint: -0.08 },
  punchy: { contrast: 1.22, saturation: 1.35 },
  faded: { contrast: 0.92, saturation: 0.85, exposure: 0.05, curves: "0/0.08 1/0.94" },
  noir: { contrast: 1.3, saturation: 0, vignette: true },
};

/** The grade as one chain of filters (the LUT first, then the sliders on top of the preset). */
export function gradeChain(p: Params, lutFile: string | null): string {
  const pre = GRADE_PRESETS[p.preset] ?? {};
  const exposure = clamp((pre.exposure ?? 0) + p.exposure, -1, 1);
  const contrast = clamp((pre.contrast ?? 1) * p.contrast, 0.3, 3);
  const saturation = clamp((pre.saturation ?? 1) * p.saturation, 0, 3);
  const temp = clamp((pre.temperature ?? 0) + p.temperature, -1, 1);
  const tint = clamp((pre.tint ?? 0) + p.tint, -1, 1);
  const parts: string[] = [];
  if (lutFile) parts.push(`lut3d=file=${lutFile}`);
  parts.push(`eq=brightness=${f4(exposure * 0.3)}:contrast=${f4(contrast)}:saturation=${f4(saturation)}`);
  if (temp || tint) parts.push(`colorbalance=rm=${f4(temp * 0.14)}:bm=${f4(-temp * 0.14)}:rh=${f4(temp * 0.1)}:bh=${f4(-temp * 0.1)}:gm=${f4(-tint * 0.12)}:rs=${f4(temp * 0.04)}:bs=${f4(-temp * 0.04)}`);
  if (pre.curves) parts.push(`curves=all='${pre.curves}'`);
  if (p.vignette || pre.vignette) parts.push("vignette=PI/5");
  return parts.join(",");
}

/** A caption file (ASS) for cues drawn the way the style says, at the size of the picture. */
export function captionAss(p: Params, w: number, h: number): string {
  const fs = Math.max(10, Math.round((h * p.size) / 100));
  const bgr = (c: string) => `${c.slice(5, 7)}${c.slice(3, 5)}${c.slice(1, 3)}`;
  const font = p.font === "lyric" ? "Comfyture Lyric" : "DejaVu Sans";
  const align = { bottom: 2, middle: 5, top: 8 }[p.position as "bottom"] ?? 2;
  const white = "&H00FFFFFF";
  const ink = "&H00191921";
  const styles: Record<string, string> = {
    // Name, Fontname, Fontsize, Primary, Secondary, Outline, Back, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
    bold: `${white},${white},${ink},&H00000000,-1,0,0,0,100,100,0,0,1,${Math.round(fs * 0.14)},0`,
    outline: `${white},${white},&H00${bgr(p.colour)},&H00000000,-1,0,0,0,100,100,0,0,1,${Math.round(fs * 0.2)},0`,
    box: `${white},${white},&H70000000,&H00000000,-1,0,0,0,100,100,0,0,3,${Math.round(fs * 0.3)},0`,
    minimal: `${white},${white},&H90000000,&H90000000,0,0,0,0,100,100,0,0,1,${Math.round(fs * 0.05)},${Math.max(1, Math.round(fs * 0.06))}`,
  };
  const t = (s: number) => {
    const cs = Math.round(s * 100);
    return `${Math.floor(cs / 360000)}:${String(Math.floor(cs / 6000) % 60).padStart(2, "0")}:${String(Math.floor(cs / 100) % 60).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
  };
  const lines = (p.cues as { start: number; end: number; text: string }[]).map((c) => {
    const text = (p.caps ? c.text.toUpperCase() : c.text).replace(/\\/g, "").replace(/\n/g, "\\N");
    return `Dialogue: 0,${t(c.start)},${t(c.end)},Cap,,0,0,0,,${text}`;
  });
  return [
    "[Script Info]", "ScriptType: v4.00+", `PlayResX: ${w}`, `PlayResY: ${h}`, "WrapStyle: 0", "ScaledBorderAndShadow: yes", "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Cap,${font},${fs},${styles[p.style]},${align},${Math.round(w * 0.06)},${Math.round(w * 0.06)},${Math.round(h * 0.07)},1`,
    "", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text", ...lines, "",
  ].join("\n");
}

/** The steps that make a tool's result from its safe parameters and the clips it works on. */
export function plan(tool: Tool, p: Params, ctx: Ctx): Plan {
  const v = ctx.videos[0];
  const src = v?.path ?? "";
  const hasA = !!v?.hasAudio;
  const dur = v?.duration ?? 0;
  switch (tool) {
    case "trim": {
      const len = p.end - p.start;
      const copy = p.mode === "copy" || (p.mode === "auto" && !!ctx.startOnKeyframe);
      const args = copy
        ? ["-ss", f3(p.start), "-i", src, "-t", f3(len), "-c", "copy", "-avoid_negative_ts", "make_zero", ...FAST, out(ctx, "mp4")]
        : ["-ss", f3(p.start), "-i", src, "-t", f3(len), ...VENC, ...(hasA ? AENC : ["-an"]), ...FAST, out(ctx, "mp4")];
      return { steps: [{ args, out: out(ctx, "mp4"), kind: "video", ext: "mp4" }], seconds: len };
    }
    case "reframe": {
      let filter: string;
      let label: string | null = null;
      if (p.fill === "fill") {
        const b = reframeBox(v, p.format, p.zoom, p.x, p.y);
        filter = `crop=${b.cw}:${b.ch}:${b.x}:${b.y},scale=${b.w}:${b.h}:flags=lanczos,setsar=1`;
      } else {
        const f = letterboxFrame(v, p.format);
        if (p.fill === "blur") {
          filter = `[0:v]split[a][b];[a]scale=${f.w}:${f.h}:force_original_aspect_ratio=increase,crop=${f.w}:${f.h},gblur=sigma=28,eq=brightness=-0.08[bg];[b]scale=${f.w}:${f.h}:force_original_aspect_ratio=decrease,setsar=1[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1[v]`;
          label = "v";
        } else {
          filter = `scale=${f.w}:${f.h}:force_original_aspect_ratio=decrease,pad=${f.w}:${f.h}:(ow-iw)/2:(oh-ih)/2:color=0x${p.colour.slice(1)},setsar=1`;
        }
      }
      return { steps: finish(["-i", src], filter, label, ctx), seconds: dur };
    }
    case "speed": {
      const f = p.factor;
      const fps = clamp(Math.round(v.fps || 24), 12, 30);
      const video = f < 1 && p.smooth ? `setpts=PTS/${f4(f)},minterpolate=fps=${fps}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1,${EVEN}` : `setpts=PTS/${f4(f)},${EVEN}`;
      const args = ["-i", src, "-vf", video, ...(hasA ? ["-af", atempoChain(f), ...AENC] : ["-an"]), ...VENC, ...FAST, out(ctx, "mp4")];
      return { steps: [{ args, out: out(ctx, "mp4"), kind: "video", ext: "mp4" }], seconds: dur / f };
    }
    case "reverse": {
      const args = ["-i", src, "-vf", `reverse,${EVEN}`, ...(hasA ? ["-af", "areverse", ...AENC] : ["-an"]), ...VENC, ...FAST, out(ctx, "mp4")];
      return { steps: [{ args, out: out(ctx, "mp4"), kind: "video", ext: "mp4" }], seconds: dur };
    }
    case "loop": {
      if (!p.pingpong) {
        const args = ["-stream_loop", String(p.times - 1), "-i", src, "-vf", EVEN, ...VENC, ...(hasA ? AENC : ["-an"]), ...FAST, out(ctx, "mp4")];
        return { steps: [{ args, out: out(ctx, "mp4"), kind: "video", ext: "mp4" }], seconds: dur * p.times };
      }
      const k = p.times;
      const names = (c: string) => Array.from({ length: k }, (_, i) => `[${c}${i}]`).join("");
      const order = Array.from({ length: k }, (_, i) => `[f${i}][r${i}]`).join("");
      const pieces = [`[0:v]split=2[fa][ra]`, `[fa]split=${k}${names("f")}`, `[ra]reverse,split=${k}${names("r")}`];
      const parts = [...pieces, `${order}concat=n=${2 * k}:v=1:a=0,${EVEN}[v]`];
      if (hasA) parts.push(`[0:a]asplit=2[xa][ya]`, `[xa]asplit=${k}${names("x")}`, `[ya]areverse,asplit=${k}${names("y")}`, `${Array.from({ length: k }, (_, i) => `[x${i}][y${i}]`).join("")}concat=n=${2 * k}:v=0:a=1[a]`);
      const args = ["-i", src, "-filter_complex", parts.join(";"), "-map", "[v]", ...(hasA ? ["-map", "[a]", ...AENC] : ["-an"]), ...VENC, ...FAST, out(ctx, "mp4")];
      return { steps: [{ args, out: out(ctx, "mp4"), kind: "video", ext: "mp4" }], seconds: dur * 2 * k };
    }
    case "merge": {
      const clips = ctx.videos;
      const first = clips[0];
      const ratio = p.aspect === "first" ? first.width / first.height : FORMATS[p.aspect as "9:16"][0] / FORMATS[p.aspect as "9:16"][1];
      const long = Math.min(1920, Math.max(first.width, first.height));
      const size = frameOf(ratio, ratio >= 1 ? long / ratio : long * ratio);
      const fps = clamp(Math.round(first.fps || 24), 12, 60);
      const cf = clips.length > 1 ? Math.min(p.crossfade, Math.min(...clips.map((c) => c.duration)) / 2) : 0;
      const inputs = clips.flatMap((c) => ["-i", c.path]);
      const parts: string[] = [];
      clips.forEach((c, i) => {
        const fit = p.fit === "cover" ? `scale=${size.w}:${size.h}:force_original_aspect_ratio=increase,crop=${size.w}:${size.h}` : `scale=${size.w}:${size.h}:force_original_aspect_ratio=decrease,pad=${size.w}:${size.h}:(ow-iw)/2:(oh-ih)/2:color=black`;
        parts.push(`[${i}:v]${fit},setsar=1,fps=${fps},format=yuv420p[v${i}]`);
        parts.push(c.hasAudio ? `[${i}:a]aresample=48000,aformat=channel_layouts=stereo[a${i}]` : `anullsrc=r=48000:cl=stereo,atrim=0:${f3(c.duration)},asetpts=PTS-STARTPTS[a${i}]`);
      });
      let seconds = clips.reduce((s, c) => s + c.duration, 0);
      if (cf > 0 && clips.length > 1) {
        let acc = clips[0].duration;
        let prev = "v0";
        let aprev = "a0";
        for (let i = 1; i < clips.length; i++) {
          const label = i === clips.length - 1 ? "v" : `x${i}`;
          const alabel = i === clips.length - 1 ? "a" : `y${i}`;
          parts.push(`[${prev}][v${i}]xfade=transition=fade:duration=${f3(cf)}:offset=${f3(acc - cf)}[${label}]`);
          parts.push(`[${aprev}][a${i}]acrossfade=d=${f3(cf)}[${alabel}]`);
          acc += clips[i].duration - cf;
          prev = label;
          aprev = alabel;
        }
        seconds = acc;
      } else {
        parts.push(`${clips.map((_, i) => `[v${i}][a${i}]`).join("")}concat=n=${clips.length}:v=1:a=1[v][a]`);
      }
      const args = [...inputs, "-filter_complex", parts.join(";"), "-map", "[v]", "-map", "[a]", ...VENC, ...AENC, ...FAST, out(ctx, "mp4")];
      return { steps: [{ args, out: out(ctx, "mp4"), kind: "video", ext: "mp4" }], seconds };
    }
    case "captions": {
      const ass = captionAss(p, v.width, v.height);
      return { steps: finish(["-i", src], "subtitles=sub.ass:fontsdir=fonts", null, ctx), seconds: dur, files: { "sub.ass": ass } };
    }
    case "grade": {
      return { steps: finish(["-i", src], gradeChain(p, ctx.lut ? "lut.cube" : null), null, ctx), seconds: dur };
    }
    case "logo": {
      const lw = Math.max(2, Math.round((v.width * p.scale) / 100 / 2) * 2);
      const m = `${Math.round((v.width * p.margin) / 100)}`;
      const end = Math.min(p.end, dur);
      const fades = `${p.fadeIn ? `,fade=t=in:st=${f3(p.start)}:d=${f3(p.fadeIn)}:alpha=1` : ""}${p.fadeOut ? `,fade=t=out:st=${f3(Math.max(p.start, end - p.fadeOut))}:d=${f3(p.fadeOut)}:alpha=1` : ""}`;
      const filter = `[1:v]scale=${lw}:-2,format=rgba,colorchannelmixer=aa=${f3(p.opacity)}${fades}[lg];[0:v][lg]overlay=${OVERLAY_AT[p.corner](m)}:shortest=1:enable='between(t,${f3(p.start)},${f3(end)})',${EVEN}[v]`;
      return { steps: finish(["-i", src, "-loop", "1", "-framerate", String(clamp(Math.round(v.fps || 24), 12, 60)), "-t", f3(dur + 1), "-i", ctx.image?.path ?? ""], filter, "v", ctx), seconds: dur };
    }
    case "audio": {
      const a = ctx.audio;
      const one = (args: string[]): Plan => ({ steps: [{ args, out: out(ctx, "mp4"), kind: "video", ext: "mp4" }], seconds: dur });
      if (p.mode === "mute" || !a) return one(["-i", src, "-map", "0:v", "-an", "-c:v", "copy", ...FAST, out(ctx, "mp4")]);
      const fade = p.fadeOut ? `,afade=t=out:st=${f3(Math.max(0, dur - p.fadeOut))}:d=${f3(p.fadeOut)}` : "";
      // the new sound is looped to the clip's length (and cut at it)
      const base = ["-i", src, "-stream_loop", "-1", "-i", a.path];
      const tail = ["-map", "0:v", "-map", "[a]", "-t", f3(dur), "-c:v", "copy", ...AENC, ...FAST, out(ctx, "mp4")];
      if (p.mode === "replace" || !hasA) return one([...base, "-filter_complex", `[1:a]volume=${f3(p.volume)}${fade},asetpts=PTS-STARTPTS[a]`, ...tail]);
      return one([...base, "-filter_complex", `[0:a]volume=${f3(p.videoVolume)}[x];[1:a]volume=${f3(p.volume)}${fade}[y];[x][y]amix=inputs=2:duration=first:dropout_transition=0,volume=2[a]`, ...tail]);
    }
    case "convert": {
      const q = p.quality as "high" | "medium" | "small";
      const scale = Number(p.height) ? `scale=-2:${p.height}` : EVEN;
      const rate = Number(p.fps) ? `,fps=${p.fps}` : "";
      switch (p.format) {
        case "mp4": {
          const crf = { high: "16", medium: "21", small: "28" }[q];
          return { steps: [{ args: ["-i", src, "-vf", `${scale}${rate}`, "-c:v", "libx264", "-preset", "veryfast", "-crf", crf, "-pix_fmt", "yuv420p", ...(hasA ? AENC : ["-an"]), ...FAST, out(ctx, "mp4")], out: out(ctx, "mp4"), kind: "video", ext: "mp4" }], seconds: dur };
        }
        case "webm": {
          const crf = { high: "26", medium: "33", small: "40" }[q];
          return { steps: [{ args: ["-i", src, "-vf", `${scale}${rate}`, "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", crf, "-row-mt", "1", "-deadline", "good", "-cpu-used", "4", ...(hasA ? ["-c:a", "libopus", "-b:a", "128k"] : ["-an"]), out(ctx, "webm")], out: out(ctx, "webm"), kind: "video", ext: "webm" }], seconds: dur };
        }
        case "mov": {
          const codec = p.codec === "prores" ? ["-c:v", "prores_ks", "-profile:v", "3", "-pix_fmt", "yuv422p10le", ...(hasA ? ["-c:a", "pcm_s16le"] : ["-an"])] : [...VENC, ...(hasA ? AENC : ["-an"])];
          return { steps: [{ args: ["-i", src, "-vf", `${scale}${rate}`, ...codec, out(ctx, "mov")], out: out(ctx, "mov"), kind: "video", ext: "mov" }], seconds: dur };
        }
        case "gif": {
          const w = Number(p.height) ? `-2:${p.height}` : `${clamp(Math.min(v.width, 640), 2, 640)}:-2`;
          const fps = Number(p.fps) || 15;
          return { steps: [{ args: ["-i", src, "-vf", `fps=${fps},scale=${w}:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`, "-loop", "0", out(ctx, "gif")], out: out(ctx, "gif"), kind: "image", ext: "gif" }], seconds: dur };
        }
        default: {
          const codec = { mp3: ["-c:a", "libmp3lame", "-b:a", { high: "256k", medium: "192k", small: "128k" }[q]], wav: ["-c:a", "pcm_s16le"], m4a: ["-c:a", "aac", "-b:a", { high: "256k", medium: "192k", small: "128k" }[q]] }[p.format as "mp3"];
          return { steps: [{ args: ["-i", src, "-vn", "-ac", "2", "-ar", "48000", ...codec, out(ctx, p.format)], out: out(ctx, p.format), kind: "audio", ext: p.format }], seconds: dur };
        }
      }
    }
    case "gif": {
      if (p.mode === "gif") {
        const len = Math.min(15, p.end - p.start);
        const w = Math.min(p.width, even(v.width));
        const args = ["-ss", f3(p.start), "-t", f3(len), "-i", src, "-vf", `fps=${p.fps},scale=${w}:-2:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`, "-loop", "0", out(ctx, "gif")];
        return { steps: [{ args, out: out(ctx, "gif"), kind: "image", ext: "gif" }], seconds: len };
      }
      const times = p.times.length ? p.times : Array.from({ length: p.count }, (_, i) => p.start + ((i + 0.5) * (p.end - p.start)) / p.count);
      const steps = times.map((t: number, i: number): Step => ({
        args: ["-ss", f3(Math.min(t, Math.max(0, dur - 0.05))), "-i", src, "-frames:v", "1", ...(p.format === "jpg" ? ["-q:v", "2"] : []), join(ctx.work, `frame-${i}.${p.format}`)],
        out: join(ctx.work, `frame-${i}.${p.format}`), kind: "image", ext: p.format,
      }));
      return { steps, seconds: steps.length };
    }
  }
}
const even = (v: number) => Math.max(2, Math.floor(v / 2) * 2);

// ------------------------------------------------------------------ probing and files

async function probe(path: string): Promise<Probe> {
  const { stdout } = await exec("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,width,height,avg_frame_rate,r_frame_rate:format=duration", "-of", "json", path], { maxBuffer: 1 << 20 }).catch(() => {
    throw new EditError("That file can't be read.", 415);
  });
  const j = JSON.parse(stdout);
  const streams: any[] = j.streams ?? [];
  const video = streams.find((s) => s.codec_type === "video");
  const rate = String(video?.avg_frame_rate && video.avg_frame_rate !== "0/0" ? video.avg_frame_rate : video?.r_frame_rate ?? "24/1").split("/");
  return {
    path, duration: Number(j.format?.duration) || 0, width: Number(video?.width) || 0, height: Number(video?.height) || 0,
    fps: Number(rate[0]) / (Number(rate[1]) || 1) || 24, hasAudio: streams.some((s) => s.codec_type === "audio"), hasVideo: !!video,
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

/** Whether a time is on a keyframe of a clip (so a cut there can copy the stream and stay exact). */
async function onKeyframe(path: string, t: number, fps: number) {
  if (t < 0.01) return true;
  const { stdout } = await exec("ffprobe", ["-v", "error", "-select_streams", "v:0", "-skip_frame", "nokey", "-show_entries", "frame=pts_time", "-of", "csv=p=0", "-read_intervals", `${f3(Math.max(0, t - 0.5))}%${f3(t + 0.5)}`, path]).catch(() => ({ stdout: "" }));
  return stdout.split("\n").some((l) => l.trim() && Math.abs(Number(l) - t) <= 0.5 / (fps || 24));
}

export interface Result {
  kind: "video" | "audio" | "image";
  file: string;
  url: string;
  width: number;
  height: number;
  duration: number;
  bytes: number;
  ext: string;
  animated?: boolean;
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

// ------------------------------------------------------------------ the module

export interface EditDeps {
  data: string;
  root: string;
}

export function createEdit({ data, root }: EditDeps) {
  const jobs = new Map<string, JobState & { child?: ReturnType<typeof spawn>; stop?: boolean }>();
  const editsDir = join(data, "edits");
  const FONT = join(root, "web", "fonts", "comfyture-lyric.ttf");
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

  /** A library file by its folder and name, or a clear error. */
  const find = async (dir: string, v: unknown, what: string) => {
    const name = fileName(v);
    const path = name ? join(data, dir, name) : "";
    if (!path || !(await exists(path))) throw new EditError(`${what} is missing. Add it again.`);
    return path;
  };
  const video = async (v: unknown) => {
    const name = fileName(v);
    for (const dir of ["videos", "edits"]) if (name && (await exists(join(data, dir, name)))) return join(data, dir, name);
    throw new EditError("The clip is missing. Add it again.");
  };

  async function keep(step: Step): Promise<Result> {
    const hash = await sha(step.out);
    const file = `${hash}.${step.ext}`;
    const dir = step.kind === "video" && step.ext === "mp4" ? "videos" : step.kind === "audio" ? "audio" : step.kind === "image" && (step.ext === "png" || step.ext === "jpg") ? "photos" : "edits";
    await mkdir(join(data, dir), { recursive: true });
    const target = join(data, dir, file);
    if (!(await exists(target))) await rename(step.out, target).catch(async () => (await copyFile(step.out, target), await rm(step.out, { force: true })));
    const info = await probe(target).catch(() => null);
    return {
      kind: step.kind, file, url: `/media/${dir}/${file}`, width: info?.width ?? 0, height: info?.height ?? 0, duration: Math.round((info?.duration ?? 0) * 100) / 100,
      bytes: (await stat(target)).size, ext: step.ext, ...(step.ext === "gif" ? { animated: true } : {}),
    };
  }

  /** Everything a tool needs, found and probed: the clips, the picture, the sound, the LUT. */
  async function prepare(tool: Tool, body: Params) {
    const id = randomBytes(6).toString("hex");
    const work = join(editsDir, `work-${id}`);
    const sources = tool === "merge" ? (Array.isArray(body.videos) ? body.videos : []).slice(0, 12) : [body.video];
    if (tool === "merge" && sources.length < 2) throw new EditError("Add at least two clips to join.");
    const videos: Probe[] = [];
    for (const s of sources) {
      const p = await probe(await video(s));
      if (!p.hasVideo) throw new EditError("That file has no picture.");
      videos.push(p);
    }
    const d = videos[0].duration;
    const p = clean(tool, body, { duration: d });
    if (tool === "captions" && !p.cues.length) throw new EditError("Add at least one caption line.");
    if (tool === "reverse" && d > 60) throw new EditError("Reverse clips of up to 60 seconds.");
    if (tool === "loop" && d * p.times * (p.pingpong ? 2 : 1) > MAX_TOTAL_SECONDS) throw new EditError(`The loop would run past ${MAX_TOTAL_SECONDS} seconds.`);
    if (tool === "speed" && p.smooth && p.factor < 1 && d > 30) throw new EditError("Smooth slow-motion takes clips of up to 30 seconds.");
    if (tool === "merge" && videos.reduce((s, c) => s + c.duration, 0) > MAX_TOTAL_SECONDS) throw new EditError(`The film would run past ${MAX_TOTAL_SECONDS} seconds.`);
    const ctx: Ctx = { work, videos };
    await mkdir(work, { recursive: true });
    if (tool === "logo") {
      ctx.image = await probe(await find("photos", body.image, "The logo picture"));
    }
    if (tool === "audio" && p.mode !== "mute") ctx.audio = await probe(await find("audio", body.audio, "The sound"));
    if (tool === "audio" && p.mode !== "mute" && !ctx.audio?.duration) throw new EditError("That sound can't be read.");
    if (tool === "grade" && p.lut) {
      await copyFile(await find("edits/luts", p.lut, "The LUT"), join(work, "lut.cube"));
      ctx.lut = true;
    }
    if (tool === "captions") {
      await mkdir(join(work, "fonts"), { recursive: true });
      await copyFile(FONT, join(work, "fonts", "comfyture-lyric.ttf")).catch(() => {});
    }
    if (tool === "trim") ctx.startOnKeyframe = p.mode !== "encode" && (await onKeyframe(videos[0].path, p.start, videos[0].fps));
    return { id, work, ctx, params: p };
  }

  async function writeFiles(work: string, files?: Record<string, string>) {
    for (const [name, text] of Object.entries(files ?? {})) await writeFile(join(work, name), text);
  }

  function runStep(job: JobState & { child?: ReturnType<typeof spawn>; stop?: boolean }, step: Step, work: string, span: number, base: number, seconds: number) {
    return new Promise<void>((ok, bad) => {
      const child = spawn("ffmpeg", ["-hide_banner", "-v", "error", "-nostdin", "-y", "-progress", "pipe:1", "-nostats", ...step.args], { cwd: work });
      job.child = child;
      let err = "";
      let buf = "";
      child.stdout.on("data", (c: Buffer) => {
        buf += c.toString();
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const l of lines) {
          const m = /^out_time_(?:us|ms)=(\d+)/.exec(l);
          if (m && seconds > 0) job.progress = Math.min(0.99, base + (span * Math.min(1, Number(m[1]) / 1e6 / seconds)));
        }
      });
      child.stderr.on("data", (c: Buffer) => (err = (err + c.toString()).slice(-2000)));
      child.on("error", (e) => bad(new Error(e.message)));
      child.on("close", (code) => (code === 0 ? ok() : bad(new Error(job.stop ? "stopped" : why(err, code)))));
    });
  }

  /** Starts a tool: everything is checked and probed first (a bad request fails here), then it runs in the background. */
  async function start(tool: Tool, body: Params): Promise<JobState> {
    const { id, work, ctx, params } = await prepare(tool, body);
    const made = plan(tool, params, ctx);
    const job: JobState & { child?: ReturnType<typeof spawn>; stop?: boolean } = { id, tool, status: "queued", progress: 0, results: [], at: Date.now() };
    jobs.set(id, job);
    for (const [k, j] of jobs) if (Date.now() - j.at > 30 * 60_000 && j.status !== "running") jobs.delete(k);
    (async () => {
      await slot();
      try {
        if (job.stop) throw new Error("stopped");
        job.status = "running";
        await writeFiles(work, made.files);
        const n = made.steps.length;
        for (let i = 0; i < n; i++) {
          await runStep(job, made.steps[i], work, 1 / n, i / n, n > 1 ? 0 : made.seconds);
          job.progress = (i + 1) / n;
          job.results.push(await keep(made.steps[i]));
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
    if (!PREVIEWS.includes(tool)) throw new EditError("That tool has no preview.");
    const { work, ctx, params } = await prepare(tool, body);
    try {
      const d = ctx.videos[0].duration;
      ctx.preview = { at: clamp(Number(body.at) || 0, 0, Math.max(0, d - 0.04)) };
      const made = plan(tool, params, ctx);
      await writeFiles(work, made.files);
      await exec("ffmpeg", ["-hide_banner", "-v", "error", "-nostdin", "-y", ...made.steps[0].args], { cwd: work, maxBuffer: 1 << 20 }).catch((e) => {
        throw new EditError(why(String(e.stderr ?? ""), e.code ?? null));
      });
      const hash = await sha(made.steps[0].out);
      await mkdir(join(editsDir, "preview"), { recursive: true });
      const file = `${hash}.jpg`;
      await copyFile(made.steps[0].out, join(editsDir, "preview", file));
      return { url: `/media/edits/preview/${file}` };
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  }

  /** A strip of thumbnails of a clip in one picture, `count` frames side by side. */
  async function strip(file: unknown, count: unknown) {
    const path = await video(file);
    const info = await probe(path);
    const n = Math.round(num(count, 4, 24, 12));
    const h = 96;
    const w = Math.max(2, Math.round((h * info.width) / Math.max(1, info.height) / 2) * 2);
    const name = `${createHash("sha256").update(`${path}:${n}:${(await stat(path)).size}`).digest("hex").slice(0, 16)}.jpg`;
    await mkdir(join(editsDir, "strips"), { recursive: true });
    const target = join(editsDir, "strips", name);
    if (!(await exists(target))) {
      const d = Math.max(0.1, info.duration);
      await exec("ffmpeg", ["-hide_banner", "-v", "error", "-nostdin", "-y", "-i", path, "-vf", `fps=${n}/${f4(d)},tpad=stop_mode=clone:stop_duration=${f3(d)},scale=${w}:${h},tile=${n}x1:padding=0`, "-frames:v", "1", "-q:v", "5", target], { maxBuffer: 1 << 20 }).catch((e) => {
        throw new EditError(why(String(e.stderr ?? ""), e.code ?? null));
      });
    }
    return { url: `/media/edits/strips/${name}`, count: n, width: w, height: h };
  }

  /** A .cube LUT kept for the grade tool (checked: a text with a LUT size and numbers). */
  async function keepLut(bytes: Buffer) {
    const text = bytes.toString("utf8");
    if (!/^\s*(?:#.*\n|TITLE.*\n|DOMAIN_M(?:IN|AX).*\n)*\s*LUT_3D_SIZE\s+\d+/m.test(text) || bytes.length > 4 * 1024 * 1024) throw new EditError("That is not a .cube LUT.", 415);
    const file = `${createHash("sha256").update(bytes).digest("hex").slice(0, 16)}.cube`;
    await mkdir(join(editsDir, "luts"), { recursive: true });
    await writeFile(join(editsDir, "luts", file), bytes);
    return { file };
  }

  /** What the page asks of the module: a route under api/utensils/edit/. */
  async function handle(method: string, rest: string, body: Params): Promise<{ status: number; body: unknown }> {
    if (method === "POST" && (TOOLS as readonly string[]).includes(rest)) return { status: 202, body: await start(rest as Tool, body) };
    if (method === "POST" && rest === "preview") return { status: 200, body: await preview(oneOf(body.tool, TOOLS, "grade"), body) };
    if (method === "POST" && rest === "strip") return { status: 200, body: await strip(body.video, body.count) };
    if (method === "POST" && rest === "probe") {
      const p = await probe(await video(body.file));
      return { status: 200, body: { duration: p.duration, width: p.width, height: p.height, fps: p.fps, hasAudio: p.hasAudio, hasVideo: p.hasVideo } };
    }
    const job = /^jobs\/(\w+)$/.exec(rest);
    if (job) {
      const j = jobs.get(job[1]);
      if (!j) throw new EditError("No such job.", 404);
      if (method === "DELETE") {
        j.stop = true;
        j.child?.kill("SIGKILL");
        if (j.status === "queued") j.status = "canceled";
      }
      return { status: 200, body: view(j) };
    }
    throw new EditError("No such edit tool.", 404);
  }

  return { start, preview, strip, keepLut, handle, get: (id: string) => jobs.get(id) && view(jobs.get(id)!), readText: (p: string) => readFile(p, "utf8") };
}
