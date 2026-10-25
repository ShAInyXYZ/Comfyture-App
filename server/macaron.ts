// Macaron's server side: Brioche, the brand's assistant (a brief, the tool she answers through, her
// answer read and checked), and the files a design leaves as: its exported pictures and the video
// encoded from its frames.
import { createHash, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, open, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { SPACES as SPACE_LIST, spaceOf as spaceId, briefOf, toolOf, cleanAnswer, promptOf } from "../web/js/brioche/harness.js";
import { deadlineOf, LATE } from "./utensils-fx.ts";

const exec = promisify(execFile);
/** ffmpeg on a video's frames, killed past its deadline (a minute per second of video, ten at least): an encode never hangs for good. */
const encode = (args: string[], seconds: number) =>
  exec("ffmpeg", args, { maxBuffer: 1 << 20, timeout: deadlineOf(seconds), killSignal: "SIGKILL" }).catch((e) => {
    throw e?.killed ? Object.assign(new Error(LATE), { status: 500 }) : e;
  });

// ------------------------------------------------------------------ Brioche, the assistant

// Her brief, her tool, her answer read and what she is told are made by web/js/brioche/harness.js from the five workspaces'
// specs (one file each, in web/js/brioche/); this file offers them under the names the server has always used.

/** The workspaces of Macaron: Brioche works in the one that is open, with a brief and a tool of its own. */
export const SPACES = SPACE_LIST as readonly ["kit", "idea", "studio", "create", "book"];
export type Space = (typeof SPACES)[number];
export const spaceOf = spaceId as (v: unknown) => Space;
/** Her brief for a workspace: who she is, what the room is, and only what she can do there. */
export const macaronBrief = (space: Space = "create"): string => briefOf(space);
export const MACARON_BRIEF = macaronBrief("create");
/** How Brioche answers in a workspace: the tool she is made to call, with only the actions of that workspace. */
export const macaronTool = (space: Space = "create") => toolOf(space);
export const MACARON_TOOL = macaronTool("create");
/** What Brioche is told each time: the workspace open and its things, the talk so far. */
export const macaronPrompt = (s: Record<string, any>, turns: { role: string; text: string }[]): string => promptOf(s, turns);
/** Brioche's answer, read whole and checked: only the actions of the workspace it was asked in, with their fields kept to what is allowed. */
export const readMacaronAnswer = (reply: string, space: Space = "create"): { reply: string; actions: any[] } => cleanAnswer(reply, space);

/** One line of the picture ledger: when, the job that made the picture, the model, the size of the ask, and what Router charged. */
export const ledgerLine = (v: { job: string; model: string; aspect: string; refs: number; credits: number | null; prompt: string }) =>
  `${JSON.stringify({ at: new Date().toISOString(), job: v.job, model: v.model, aspect: v.aspect, refs: v.refs, credits: v.credits, prompt: v.prompt.slice(0, 120) })}\n`;

// ------------------------------------------------------------------ the flagship, kept up to date

/**
 * A flagship that an earlier version put in gains what the newer one has, once: the brief's idea, the directions, the
 * moodboard, the story's chapters, the week's plan, the product's scene. Only what is empty or missing is filled (a picture,
 * a chapter or a day by its id); what a person has written, changed or taken out is never touched. Answers the new body, or
 * null when there is nothing to do (it is up to date, or the seed carries no revision).
 */
export function topUpBrand(body: any, seed: any) {
  const rev = Number(seed?.seedRev) || 0;
  if (!rev || (Number(body?.seedRev) || 0) >= rev) return null;
  const out = structuredClone(body ?? {});
  const empty = (v: unknown) => v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length);
  out.brief = { ...(out.brief ?? {}) };
  for (const k of ["pitch", "goals", "image"]) if (empty(out.brief[k]) && !empty(seed.brief?.[k])) out.brief[k] = seed.brief[k];
  if (empty(out.directions)) out.directions = structuredClone(seed.directions ?? []);
  const refs: any[] = out.refs ?? [];
  const had = new Set(refs.map((r) => r.id));
  out.refs = [...(seed.refs ?? []).filter((r: any) => r.kind === "inspiration" && !had.has(r.id)), ...refs];
  const history: any[] = (out.history ??= []);
  for (const h of seed.history ?? []) {
    const mine = history.find((x) => x.id === h.id);
    if (!mine && h.beat) history.push(h);
    else if (mine && h.beat && !mine.beat) mine.beat = h.beat;
  }
  const planned = (out.designs ?? []).some((d: any) => d.plan);
  for (const d of seed.designs ?? []) {
    const mine = (out.designs ?? []).find((x: any) => x.id === d.id);
    if (mine && d.plan && !planned && !mine.plan) mine.plan = d.plan;
  }
  for (const p of seed.products ?? []) {
    const mine = (out.products ?? []).find((x: any) => x.id === p.id);
    if (mine && p.scene && !mine.scene) mine.scene = p.scene;
  }
  out.kit = { ...(out.kit ?? {}) };
  if (empty(out.kit.sizes) && seed.kit?.sizes) out.kit.sizes = seed.kit.sizes;
  // the example's UGC stories, when the brand has none of its own yet (a story a person wrote or started is never replaced)
  if (empty(out.ugc) && !empty(seed.ugc)) out.ugc = structuredClone(seed.ugc);
  // and an example story an earlier version put in says which product it shows (the app, not the jar)
  for (const u of seed.ugc ?? []) {
    const mine = (out.ugc ?? []).find((x: any) => x.id === u.id);
    if (mine && u.product && !mine.product) mine.product = u.product;
  }
  // the white files sit on plum first, as the kit's tiles name them
  for (const l of out.kit.logos ?? []) if (/^(wordmark|mark)-white$/.test(l.id) && l.ground === "ink, plum") l.ground = "plum, ink";
  out.seedRev = rev;
  return out;
}

// ------------------------------------------------------------------ the files a design leaves as

export const exportsDir = (data: string) => join(data, "macaron", "exports");
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "design";

/** An exported picture or video, kept under the data folder with a name that says what it is. */
export async function keepExport(data: string, bytes: Buffer, name: string, ext: "png" | "jpg" | "mp4" | "webm" | "gif") {
  await mkdir(exportsDir(data), { recursive: true });
  const file = `${slug(name)}-${createHash("sha256").update(bytes).digest("hex").slice(0, 8)}.${ext}`;
  await writeFile(join(exportsDir(data), file), bytes);
  return { file, url: `/media/macaron/exports/${file}`, bytes: bytes.length };
}

const framesDir = (data: string, job: string) => join(data, "macaron", "frames", job);
export const frameJob = () => randomBytes(5).toString("hex");
export const validJob = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{6,20}$/.test(v);

/** One frame of a motion render, as a PNG, kept until the video is encoded. */
export async function keepFrame(data: string, job: string, n: number, bytes: Buffer) {
  const dir = framesDir(data, job);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${String(n).padStart(5, "0")}.png`), bytes);
}
export const dropFrames = (data: string, job: string) => rm(framesDir(data, job), { recursive: true, force: true });

/**
 * A soft sound for a motion piece, made from sines: a short wooden pop where each lid lands, and a
 * quiet pad under the whole (two fifths, breathing slowly). As an aevalsrc expression of time.
 */
function soundExpr(pops: number[], pad: boolean) {
  const pop = (at: number) => `gt(t,${at})*(0.34*sin(2*PI*196*(t-${at}))*exp(-(t-${at})*34)+0.13*sin(2*PI*784*(t-${at}))*exp(-(t-${at})*52)+0.06*sin(2*PI*1568*(t-${at}))*exp(-(t-${at})*90))`;
  const drone = "(0.035*sin(2*PI*130.81*t)+0.028*sin(2*PI*196*t)+0.02*sin(2*PI*261.63*t))*(0.75+0.25*sin(2*PI*0.35*t))";
  return [...pops.slice(0, 4).map(pop), ...(pad ? [drone] : [])].join("+") || "0";
}

const refuse = (message: string, status = 400) => Object.assign(new Error(message), { status });

/** The size a PNG says it has, read from its first bytes; null when it is not a PNG. */
async function pngSize(path: string) {
  const file = await open(path, "r");
  try {
    const { buffer, bytesRead } = await file.read(Buffer.alloc(24), 0, 24, 0);
    const ok = bytesRead === 24 && buffer.readUInt32BE(0) === 0x89504e47 && buffer.readUInt32BE(4) === 0x0d0a1a0a && buffer.toString("ascii", 12, 16) === "IHDR";
    return ok ? { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) } : null;
  } finally {
    await file.close();
  }
}

/**
 * The frames of a job, all of them: numbered from 0 with none missing (ffmpeg reads them in order and stops at the
 * first gap, calling the rest done), each a picture, all the same size. Answers how many there are.
 */
async function wholeFrames(dir: string) {
  const names = (await readdir(dir).catch(() => [] as string[])).filter((f) => /^\d{5}\.png$/.test(f)).sort();
  if (names.length < 8) throw refuse("A video needs at least 8 frames.");
  let first: { width: number; height: number } | null = null;
  for (let i = 0; i < names.length; i++) {
    const want = `${String(i).padStart(5, "0")}.png`;
    if (names[i] !== want) throw refuse(`Frame ${i} is missing: a video needs every frame, in order.`);
    const size = await pngSize(join(dir, want));
    if (!size) throw refuse(`Frame ${i} is not a picture.`);
    first ??= size;
    if (size.width !== first.width || size.height !== first.height) throw refuse(`Frame ${i} is another size (${size.width}×${size.height}; the first is ${first.width}×${first.height}).`);
  }
  return names.length;
}

/**
 * Frames sent one by one, encoded as one H.264 video at the size they are, with a soft sound under it when asked.
 * What comes out is probed before it is reported: the frames and seconds it holds, and its sound, are the ones asked for.
 */
export async function encodeFrames(data: string, job: string, v: { fps: number; name: string; sound?: { pops?: number[]; pad?: boolean }; container?: "mp4" | "webm" | "gif" }) {
  const dir = framesDir(data, job);
  try {
    const frames = await wholeFrames(dir);
    if (v.container === "gif") return await encodeGif(data, dir, frames, v);
    const webm = v.container === "webm";
    const out = join(dir, webm ? "video.webm" : "video.mp4");
    const seconds = frames / v.fps;
    const sound = v.sound && (v.sound.pops?.length || v.sound.pad);
    const args = ["-v", "error", "-y", "-framerate", String(v.fps), "-start_number", "0", "-i", join(dir, "%05d.png")];
    if (sound) args.push("-f", "lavfi", "-i", `aevalsrc='${soundExpr((v.sound!.pops ?? []).filter(Number.isFinite), !!v.sound!.pad)}':d=${seconds.toFixed(3)}:s=48000:c=stereo`);
    args.push("-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p");
    if (webm) args.push("-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "31", "-row-mt", "1", "-deadline", "good", "-cpu-used", "3");
    else args.push("-c:v", "libx264", "-crf", "17", "-preset", "slow", "-movflags", "+faststart");
    if (sound) args.push("-af", `afade=t=in:st=0:d=0.4,afade=t=out:st=${Math.max(0, seconds - 0.8).toFixed(3)}:d=0.8,alimiter=limit=0.8`, ...(webm ? ["-c:a", "libopus", "-b:a", "128k"] : ["-c:a", "aac", "-b:a", "160k"]));
    args.push("-t", seconds.toFixed(3), out);
    await encode(args, seconds);
    const probed = JSON.parse((await exec("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,width,height,nb_frames,duration:format=duration", "-of", "json", out])).stdout);
    const video = (probed.streams ?? []).find((s: any) => s.codec_type === "video");
    const audio = (probed.streams ?? []).find((s: any) => s.codec_type === "audio");
    // the container says how many frames it holds; a build that does not is asked to count them
    let got = Number(video?.nb_frames);
    if (video && !Number.isFinite(got)) got = Number(JSON.parse((await exec("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "json", out])).stdout).streams?.[0]?.nb_read_frames);
    const length = Number(video?.duration) || Number(probed.format?.duration);
    if (!video || got !== frames || !(Math.abs(length - seconds) < 0.06) || (sound && !audio)) {
      throw refuse(`The video came out with ${Number.isFinite(got) ? got : "no"} frames in ${Number.isFinite(length) ? length.toFixed(2) : "no"} s, not the ${frames} in ${seconds.toFixed(2)} s that were sent${sound && !audio ? ", and without its sound" : ""}.`, 500);
    }
    const kept = await keepExport(data, await readFile(out), v.name, webm ? "webm" : "mp4");
    return { ...kept, width: Number(video.width), height: Number(video.height), duration: Math.round(length * 100) / 100, frames: got, sound: !!audio };
  } finally {
    // the frames of a job are for one video: made or refused, they are not kept
    await dropFrames(data, job);
  }
}

/**
 * The frames as a looping GIF: its own palette (palettegen, so brand colours stay true), at most 15 frames a second and 720 px
 * wide, no sound. What comes out is probed: it must last as long as the frames do.
 */
async function encodeGif(data: string, dir: string, frames: number, v: { fps: number; name: string }) {
  const out = join(dir, "video.gif");
  const seconds = frames / v.fps;
  const fps = Math.min(15, v.fps);
  await encode(["-v", "error", "-y", "-framerate", String(v.fps), "-start_number", "0", "-i", join(dir, "%05d.png"), "-filter_complex", `fps=${fps},scale='min(720,iw)':-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`, "-loop", "0", out], seconds);
  const probed = JSON.parse((await exec("ffprobe", ["-v", "error", "-show_entries", "stream=width,height:format=duration", "-of", "json", out])).stdout);
  const size = (probed.streams ?? [])[0];
  if (!size?.width) throw refuse("The GIF could not be made.");
  const kept = await keepExport(data, await readFile(out), v.name, "gif");
  return { ...kept, width: Number(size.width), height: Number(size.height), duration: Math.round(seconds * 100) / 100, frames: Math.round(seconds * fps), sound: false };
}

/** The pictures of an old job are cleared at start, so a render that was cut off leaves nothing behind. */
export async function sweepFrames(data: string) {
  const root = join(data, "macaron", "frames");
  for (const job of await readdir(root).catch(() => [] as string[])) {
    const at = await stat(join(root, job)).catch(() => null);
    if (at && Date.now() - at.mtimeMs > 3_600_000) await rm(join(root, job), { recursive: true, force: true });
  }
}
