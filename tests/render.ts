// Renders an edit the way the server does (its plan, its arguments), for the tests: a plan to files in a
// work folder, then the frames of it as raw pixels to look at. Needs ffmpeg and ffprobe.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile, copyFile, rm, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { planCut, ffmpegArgs, frameSize, type CutBody, type CutItem, type Source } from "../server/cut.ts";

const exec = promisify(execFile);
export const root = resolve(import.meta.dirname, "..");
export const FONT = join(root, "web", "fonts", "comfyture-lyric.ttf");

/** A clip of a pattern with a white square in the middle (for measuring where the picture is), `w` x `h`, 24 fps. */
export async function makeClip(path: string, w: number, h: number, seconds: number, pattern: "square" | "bars" | "solid" = "square", color = "0x203050") {
  const base = pattern === "bars" ? `testsrc2=s=${w}x${h}:r=24:d=${seconds}` : `color=c=${color}:s=${w}x${h}:r=24:d=${seconds}`;
  const box = pattern === "square" ? `,drawbox=x=${Math.round(w * 0.4)}:y=${Math.round(h * 0.4)}:w=${Math.round(w * 0.2)}:h=${Math.round(h * 0.2)}:color=white:t=fill` : "";
  await exec("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", `${base}${box},format=yuv420p`, "-c:v", "libx264", "-crf", "12", "-pix_fmt", "yuv420p", path]);
}

/** What a render of a body made: the picture's file, and the plan. */
export async function render(body: CutBody, files: Record<string, Source>, dir: string, { size, ass = true, timeout = 0 }: { size?: { width: number; height: number }; ass?: boolean; timeout?: number } = {}) {
  await mkdir(join(dir, "fonts"), { recursive: true });
  await copyFile(FONT, join(dir, "fonts", "comfyture-lyric.ttf"));
  const { width, height } = size ?? frameSize(body.aspect, null);
  const plan = planCut(body, (it: CutItem) => files[it.id] ?? null, { width, height, font: null, titleFile: (i) => join(dir, `title-${i}.txt`), ass });
  await Promise.all(plan.texts.map((line: string, i: number) => writeFile(join(dir, `title-${i}.txt`), line)));
  if (plan.ass) await writeFile(join(dir, "lyrics.ass"), plan.ass);
  const out = { picture: join(dir, "picture.mp4"), sound: join(dir, "sound.m4a"), script: join(dir, "graph.txt") };
  const args = ffmpegArgs(plan, out);
  if (args.long) await writeFile(out.script, plan.video);
  // a render that hangs is stopped (when a time limit is asked for) and said so, not waited on
  const run = (a: string[]) => exec("ffmpeg", a, { cwd: dir, maxBuffer: 1 << 24, ...(timeout ? { timeout, killSignal: "SIGKILL" as const } : {}) }).catch((e) => {
    throw new Error(e.killed ? `ffmpeg did not finish in ${timeout / 1000} s` : `ffmpeg failed: ${String(e.stderr ?? e.message).split("\n").filter(Boolean).slice(-4).join(" | ")}`);
  });
  await run(args.picture);
  await run(args.sound);
  await exec("ffmpeg", ["-v", "error", "-y", "-i", out.picture, "-i", out.sound, "-c", "copy", "-movflags", "+faststart", join(dir, "film.mp4")], { cwd: dir });
  return { plan, film: join(dir, "film.mp4"), picture: out.picture, width: width - (width % 2), height: height - (height % 2) };
}

/** The frame of a 24 fps video that is on screen at a time, as raw bytes in a pixel format. */
async function frameBytes(video: string, t: number, pixFmt: string) {
  const n = Math.round(t * 24);
  const { stdout } = await exec("ffmpeg", ["-v", "error", "-i", video, "-vf", `select=eq(n\\,${n})`, "-vsync", "0", "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", pixFmt, "-"], { encoding: "buffer", maxBuffer: 1 << 26 } as any);
  const b = stdout as unknown as Buffer;
  return new Uint8Array(b.buffer, b.byteOffset, b.length);
}
/** A frame of a video as gray bytes (w x h): the one on screen at a time. */
export const grayFrame = (video: string, t: number, _w: number, _h: number) => frameBytes(video, t, "gray");
/** A frame of a video as RGB bytes (w x h x 3). */
export const rgbFrame = (video: string, t: number) => frameBytes(video, t, "rgb24");

/** The bounding box of the pixels above a level in a gray frame. */
export function box(g: Uint8Array, w: number, h: number, level = 200) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (g[y * w + x] > level) (x0 = Math.min(x0, x)), (x1 = Math.max(x1, x)), (y0 = Math.min(y0, y)), (y1 = Math.max(y1, y));
  return x1 < 0 ? null : { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1, cx: (x0 + x1 + 1) / 2, cy: (y0 + y1 + 1) / 2 };
}
export const meanOf = (g: Uint8Array) => g.reduce((a, b) => a + b, 0) / g.length;
export { rm, readFile, writeFile };
