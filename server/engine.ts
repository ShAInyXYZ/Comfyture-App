import type { Comfy } from "@comfyorg/sdk";
import { EventEmitter } from "node:events";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile, access, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { compose, finalPrompt } from "../web/js/script.js";
import { imageSize } from "./media.ts";
import {
  EXTEND_OVERLAP, FPS, REFERENCE_SIZE, addClipGuide, applyAudio, buildCutout, buildGenerate, buildGuided, buildI2V, buildMotion, buildPaint, buildPlan,
  buildProduction, buildSound, buildSwap, buildMatte, buildMatteImage, loadGraph, outputSize, type Aspect, type Graph, type Guide, type Quality,
} from "./workflows.ts";
import { CAMERA } from "../web/js/script.js";
import { untagRefs, type ImageModels } from "./images.ts";
import { isRouterVideo, routerVideo, routerVideoName, routerVideoSeconds, routerVideoLength } from "./router-videos.ts";

export interface Dialogue { speaker?: string; language?: string; line: string }
export interface Shot {
  action: string;
  camera?: string;
  cameraText?: string;
  framing?: string;
  sound?: string;
  dialogue?: Dialogue[];
  transition?: string;
}
export interface Script { shots: Shot[]; raw?: string }

/** Everything that defines a shot. Stored on every take so it can be reused. */
export interface ShotRequest {
  name: string;
  preset?: string;
  script: Script;
  start?: string;
  end?: { file?: string; paint?: string };
  keyframes: { file: string; time: number; strength: number }[];
  /** A voice or music track the picture follows. */
  audio?: { file: string; lipsync: boolean };
  /** A reference sheet (cast, props, location) composed in the browser. */
  references?: { sheet: string; panels: string[]; texts?: Record<string, string>; cast?: string; prop?: string; location?: string };
  /** A new sound for another take's picture. */
  sound?: { from: string; text: string };
  /**
   * A clip to start from: extended where it ends, or its motion copied onto the start photo. "swap" is a
   * trend's take from its recipe: the clip is a control (a skeleton or a depth pass), the audio is the
   * trend's vocals from `from` seconds, `strength` is the control's, `length` the take's frames and
   * `build` who plays it ("human" for people).
   */
  video?: { file: string; mode: "extend" | "motion" | "swap"; control: "pose" | "edges" | "ready"; frames: number; width: number; height: number; from?: number; strength?: number; length?: number; build?: string };
  seconds: number;
  aspect: Aspect;
  quality: Quality;
  enhance: boolean;
  review: boolean;
  strengths: { start: number; end: number };
  /** The film it was made for (a story's project), so its takes show inside that project. */
  project?: string;
  /** The video model that rolls it, when not LTX-2.5: a partner's on Comfy Router. */
  model?: string;
  /** LoRAs on LTX-2.5's transformer (those made for LTX-2.3 work too): a look, a move, real sounds. */
  loras?: VideoLora[];
}
export type VideoLora = { id: string; kind: string; file: string; strength: number; words: string };
/** What opens a prompt rolled with these LoRAs: a look's trigger first (some must be the first word), then how a move is told. */
export const loraWords = (loras: VideoLora[] = []) =>
  loras.filter((l) => l.kind !== "sound" && l.words).sort((a, b) => Number(a.kind === "motion") - Number(b.kind === "motion")).map((l) => l.words).join(" ");

/**
 * The LoRAs put between LTX's transformer and everything that reads it, one after another. A sound
 * LoRA (Foley) goes on the sound pass only, the others on the picture's.
 */
export function withLoras(graph: Graph, loras: VideoLora[], sound: boolean) {
  const mine = loras.filter((l) => (l.kind === "sound") === sound);
  if (!mine.length) return;
  for (const [id, node] of Object.entries(graph)) {
    if (node.class_type !== "UNETLoader" || !String(node.inputs.unet_name ?? "").startsWith("ltx-2") || graph[`${id}_lora_1`]) continue;
    let last: [string, number] = [id, 0];
    mine.forEach((l, i) => {
      graph[`${id}_lora_${i + 1}`] = { class_type: "LoraLoaderModelOnly", inputs: { model: last, lora_name: l.file, strength_model: l.strength } };
      last = [`${id}_lora_${i + 1}`, 0];
    });
    for (const [other, n] of Object.entries(graph)) {
      if (other.startsWith(`${id}_lora_`)) continue;
      for (const [k, value] of Object.entries(n.inputs ?? {})) if (Array.isArray(value) && value[0] === id && value[1] === 0) n.inputs[k] = last;
    }
  }
}

export type RunStatus = "queued" | "frame" | "review" | "shot" | "done" | "failed" | "canceled";

export interface Run {
  id: string;
  batch: string;
  take: number;
  takes: number;
  request: ShotRequest;
  seed: number;
  frameSeed: number;
  prompt: string;
  size: { width: number; height: number };
  fps: number;
  status: RunStatus;
  stage: string;
  /** Which stage lamp is lit. */
  phase?: "frame" | "roll" | "detail" | "sound";
  progress: number;
  /** The last frame painted for this take, when the request asked for one. */
  frame?: string;
  frameFile?: string;
  video?: string;
  /** Seconds of the finished file, when it isn't the request's length (an extended clip). */
  length?: number;
  error?: string;
  jobs: string[];
  createdAt: string;
  updatedAt: string;
  seconds: Record<string, number>;
}

/** The Director's shot list: every shot becomes a tab with its own start frame and script. */
export interface PlanShot { name: string; frame: string; action: string; camera: string; framing: string; sound: string; seconds: number }
export interface Plan { title: string; look: string; cast: string; shots: PlanShot[] }

export interface Paint {
  id: string;
  status: "running" | "done" | "failed";
  progress: number;
  photo?: { file: string; url: string; width: number; height: number };
  /** a sound a workflow made: music or an effect, kept in the audio library */
  audio?: { file: string; url: string; seconds: number; name: string; kind: string };
  /** a video a workflow made (upscaled, or with new sound), kept with the uploaded videos */
  video?: { file: string; url: string; width: number; height: number; duration: number };
  /** what a song was heard to hold: its words as SRT, its tempo and beats as the nodes wrote them, its vocals */
  listen?: { srt: string; bpm: string; beats: string; vocals?: Paint["audio"]; stems?: { bass?: Paint["audio"]; drums?: Paint["audio"]; other?: Paint["audio"] } };
  error?: string;
}

const TERMINAL = new Set(["succeeded", "failed", "canceled", "expired"]);

type Kind = "paint" | "cutout" | "generate" | "plan" | "i2v" | "guided" | "references" | "production" | "sound" | "motion" | "swap" | "music" | "sfx" | "upscale" | "restore" | "listen" | "matte";
/** First guesses before any job has finished: seconds per job for paint, per unit otherwise. */
const DEFAULT_RATE: Record<Kind, number> = { paint: 25, cutout: 8, generate: 25, plan: 30, i2v: 10, guided: 14, references: 140, production: 30, sound: 7, motion: 12, swap: 19, music: 40, sfx: 15, upscale: 10, restore: 20, listen: 2, matte: 6 };
/** Kinds timed per job rather than per second of video. */
const PER_JOB = new Set<Kind>(["paint", "cutout", "generate", "plan", "upscale"]);

/** The Director's reply, read leniently: the first JSON object in it, every field checked. */
function parsePlan(reply: string, count: number, seconds: number): Plan {
  const from = reply.indexOf("{");
  const to = reply.lastIndexOf("}");
  let raw: Record<string, any>;
  try {
    raw = JSON.parse(reply.slice(from, to + 1));
  } catch {
    throw new Error("The director's plan didn't come back whole. Plan again.");
  }
  const str = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  const shots = (Array.isArray(raw.shots) ? raw.shots : [])
    .slice(0, count)
    .map((shot: Record<string, unknown>, i: number) => ({
      name: str(shot?.name, 40) || `Shot ${i + 1}`,
      frame: str(shot?.frame, 700),
      action: str(shot?.action, 700),
      camera: typeof shot?.camera === "string" && shot.camera in CAMERA ? shot.camera : "locked",
      // it ends a sentence ("ending on a medium shot"), so it starts in lower case
      framing: str(shot?.framing, 120).replace(/^[A-Z](?=[a-z])/, (c) => c.toLowerCase()),
      sound: str(shot?.sound, 400),
      seconds: Math.min(8, Math.max(3, Math.round(Number(shot?.seconds) || seconds))),
    }))
    .filter((shot: PlanShot) => shot.frame && shot.action);
  if (!shots.length) throw new Error("The director's plan had no shots. Plan again.");
  return { title: str(raw.title, 60) || "Untitled film", look: str(raw.look, 400), cast: str(raw.cast, 400), shots };
}
const random32 = () => Math.floor(Math.random() * 2 ** 32);

class Canceled extends Error {}

/** The motion graph sizes itself from the clip: its shorter side at 544 on a 32 grid, then doubled. */
/** A trend's take is made at its control's size: the first stage at half of it, on multiples of 64. */
function swapSize(clip: { width: number; height: number }) {
  const half = (v: number) => Math.max(256, Math.round(v / 2 / 64) * 64);
  return { width: half(clip.width) * 2, height: half(clip.height) * 2 };
}

// a black take's words nudged for each roll: a short closing sentence, different each time
const SWAP_NUDGES = ["", " The light stays soft and even.", " Every detail stays sharp."];

function motionSize(clip: { width: number; height: number }) {
  const scale = 544 / Math.min(clip.width, clip.height);
  const snap = (v: number) => Math.max(256, Math.round((v * scale) / 32) * 32 * 2);
  return { width: snap(clip.width), height: snap(clip.height) };
}

/**
 * The clip's first frames, then the extension (which opens on the clip's last
 * ones), as one file at the extension's size. A clip without sound gets silence.
 */
async function joinClip(clip: string, extension: string, out: string, headFrames: number, size: { width: number; height: number }) {
  const { stdout } = await exec("ffprobe", ["-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", clip]);
  const headAudio = stdout.trim()
    ? `[0:a]atrim=end=${headFrames / FPS},asetpts=PTS-STARTPTS,aresample=48000[a0]`
    : `anullsrc=r=48000:cl=stereo,atrim=end=${headFrames / FPS}[a0]`;
  await exec("ffmpeg", [
    "-v", "error", "-y", "-i", clip, "-i", extension, "-filter_complex",
    [
      `[0:v]trim=end_frame=${headFrames},setpts=PTS-STARTPTS,scale=${size.width}:${size.height}:force_original_aspect_ratio=increase,crop=${size.width}:${size.height},setsar=1,fps=${FPS}[v0]`,
      headAudio,
      `[1:v]setpts=PTS-STARTPTS,setsar=1,fps=${FPS}[v1]`,
      `[1:a]asetpts=PTS-STARTPTS,aresample=48000[a1]`,
      `[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]`,
    ].join(";"),
    "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-crf", "16", "-preset", "medium", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out,
  ], { maxBuffer: 1 << 20 });
}

const exec = promisify(execFile);

/**
 * Preview frames can arrive still wrapped in ComfyUI's binary frame (type,
 * metadata length, metadata JSON, then the image). Cut to the image itself.
 */
function previewImage(data: Uint8Array): { bytes: Buffer; type: string } | null {
  const buf = Buffer.from(data);
  const jpeg = buf.indexOf(Buffer.from([0xff, 0xd8, 0xff]));
  const png = buf.indexOf(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  if (jpeg >= 0 && (png < 0 || jpeg < png)) return { bytes: buf.subarray(jpeg), type: "image/jpeg" };
  if (png >= 0) return { bytes: buf.subarray(png), type: "image/png" };
  return null;
}

/**
 * Now and then LTX hands back a clip whose picture is all black (NaNs) while
 * its sound is fine. Such a file is tiny: the audio alone, about 22 KB/s,
 * against 150 KB/s and up for a real shot. With ffmpeg around, the first
 * frame's brightness confirms it.
 */
async function looksBlack(path: string, seconds: number, ffmpeg: boolean) {
  const { size } = await stat(path);
  const rate = size / Math.max(1, seconds);
  if (!ffmpeg) return rate < 40 * 1024;
  try {
    // A failed render is black all over, or for most of its length with the picture coming in at
    // the end (whose bytes alone can look like a whole shot's); a dark scene still has something
    // bright in it. Its head, middle and tail are looked at: black in two of them, it is black.
    let dark = 0;
    for (const at of [Math.min(0.5, seconds / 4), seconds / 2, Math.max(0.5, seconds - 0.6)]) {
      const { stdout } = await exec(
        "ffmpeg",
        ["-nostdin", "-v", "error", "-ss", at.toFixed(2), "-i", path, "-frames:v", "1", "-vf", "scale=64:-1", "-f", "rawvideo", "-pix_fmt", "gray", "-"],
        { encoding: "buffer", maxBuffer: 1 << 20 },
      );
      const pixels = stdout as unknown as Buffer;
      // black renders peak at 4 to 12; the darkest real shots still reach 60 and up somewhere
      if (!pixels.length || pixels.reduce((top, v) => Math.max(top, v), 0) <= 32) dark++;
    }
    return dark >= 2;
  } catch {
    return rate < 40 * 1024;
  }
}

function phaseOf(cls: string | null, pass: number, stage: "frame" | "shot"): Run["phase"] | null {
  if (!cls) return null;
  if (stage === "frame") return "frame";
  if (cls === "LTXVLatentUpsampler" || (cls.startsWith("SamplerCustom") && pass > 1)) return "detail";
  if (/Audio|VAEDecode|Save|CreateVideo/.test(cls)) return "sound";
  return "roll";
}

function label(cls: string | null, pass: number, stage: "frame" | "shot"): string | null {
  if (!cls) return null;
  if (/Loader/.test(cls)) return "Loading models";
  if (cls === "TextGenerateLTX2Prompt") return "Enhancing prompt";
  if (/TextEncode/.test(cls)) return "Reading the script";
  if (cls === "KSampler") return "Painting the last frame";
  if (cls.startsWith("SamplerCustom")) return pass > 1 ? "Adding detail" : "Rolling camera";
  if (cls === "LTXVLatentUpsampler") return "Upscaling";
  if (/Audio/.test(cls)) return "Mixing sound";
  if (/VAEDecode/.test(cls)) return stage === "frame" ? "Painting the last frame" : "Developing frames";
  if (/Save|CreateVideo/.test(cls)) return "Finishing";
  return null;
}

function describe(error: unknown): string {
  if (error instanceof Canceled) return "Canceled.";
  const e = error as { message?: string; details?: unknown; job?: { error?: unknown } };
  const detail = e.job?.error ?? e.details;
  const text = [e.message, detail && JSON.stringify(detail)].filter(Boolean).join(" ");
  if (/value_not_in_list|not in list/i.test(text) && /safetensors|gguf/.test(text)) {
    const file = /([\w.-]+\.(?:safetensors|gguf))/.exec(text)?.[1];
    return `ComfyUI is missing a model${file ? `: ${file}` : ""}. See "Models" in the README.`;
  }
  const message = (detail as { message?: string } | undefined)?.message ?? e.message ?? String(error);
  return message.slice(0, 400);
}

async function exists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** An enhancer's answer as the prompt alone: some answer in JSON ({"rewritten_prompt": "..."}) or in a code fence. */
export function unwrapPrompt(text: string) {
  const bare = text.trim().replace(/^```(?:json|text)?\s*/i, "").replace(/\s*```$/, "").trim();
  if (!bare.startsWith("{")) return bare;
  try {
    const o = JSON.parse(bare);
    const v = o.rewritten_prompt ?? o.prompt ?? o.text ?? Object.values(o).find((x) => typeof x === "string");
    return typeof v === "string" && v.trim() ? v.trim() : bare;
  } catch {
    return bare;
  }
}

export class Engine extends EventEmitter {
  client: Comfy;
  private runs = new Map<string, Run>();
  private paints = new Map<string, Paint>();
  private aborts = new Map<string, AbortController>();
  private assetNames = new WeakMap<object, string>();
  /**
   * Jobs run one at a time. Two LTX jobs side by side on Comfy Cloud came back
   * with black video (healthy sound, NaN picture); one at a time they don't.
   */
  private slots = Math.max(1, Number(process.env.COMFYTURE_CONCURRENCY ?? 1));
  private waiting: (() => void)[] = [];

  private async acquire(run: Run | undefined, signal: AbortSignal) {
    if (this.slots > 0) {
      this.slots--;
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const go = () => {
        signal.removeEventListener("abort", quit);
        resolve();
      };
      const quit = () => {
        this.waiting = this.waiting.filter((w) => w !== go);
        reject(new Canceled());
      };
      signal.addEventListener("abort", quit, { once: true });
      this.waiting.push(go);
      if (run) void this.update(run, { stage: `Waiting · ${this.waiting.length} ahead` }, false);
    });
  }

  private release() {
    const next = this.waiting.shift();
    if (next) next();
    else this.slots++;
    this.refreshQueue();
  }

  /** Keeps the "N ahead" labels of waiting takes true as the queue moves. */
  private refreshQueue() {
    const queued = [...this.runs.values()].filter((r) => r.stage.startsWith("Waiting ·")).sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
    queued.forEach((r, i) => void this.update(r, { stage: `Waiting · ${i} ahead` }, false));
  }
  private dirs: { data: string; workflows: string };

  /** Last step before a graph is sent, e.g. pointing models at Cloud imports. */
  private prepare: (graph: Graph) => Promise<Graph>;
  private checks: { black: boolean; ffmpeg: boolean };

  constructor(
    client: Comfy,
    dirs: { data: string; workflows: string },
    prepare?: (graph: Graph) => Promise<Graph>,
    checks = { black: true, ffmpeg: false },
  ) {
    super();
    this.client = client;
    this.dirs = dirs;
    this.prepare = prepare ?? (async (graph) => graph);
    this.checks = checks;
  }

  private runDir(id: string) {
    return join(this.dirs.data, "runs", id);
  }

  photoPath(file: string) {
    return join(this.dirs.data, "photos", file);
  }

  audioPath(file: string) {
    return join(this.dirs.data, "audio", file);
  }

  videoPath(file: string) {
    return join(this.dirs.data, "videos", file);
  }

  async init() {
    const root = join(this.dirs.data, "runs");
    await mkdir(root, { recursive: true });
    try {
      this.timings = JSON.parse(await readFile(join(this.dirs.data, "timings.json"), "utf8"));
    } catch {
      this.timings = {};
    }
    try {
      this.imageNames = JSON.parse(await readFile(join(this.dirs.data, "photos", "names.json"), "utf8"));
    } catch {
      this.imageNames = {};
    }
    for (const id of await readdir(root)) {
      try {
        const run = JSON.parse(await readFile(join(root, id, "run.json"), "utf8")) as Run;
        if (!run.request) continue; // a run from an older format
        if (["queued", "frame", "shot"].includes(run.status)) {
          Object.assign(run, { status: "failed", stage: "", error: "Interrupted: the server restarted." });
        }
        this.runs.set(run.id, run);
      } catch {
        // a folder without a readable run.json is not a run
      }
    }
  }

  list(): Run[] {
    return [...this.runs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.take - a.take);
  }

  get(id: string) {
    return this.runs.get(id);
  }

  private async frameSize(file?: string) {
    if (!file) return null;
    try {
      return imageSize(await readFile(this.photoPath(file)));
    } catch {
      return null;
    }
  }

  /** Rolls one or more takes of a shot. */
  async roll(request: ShotRequest, takes: number, seed?: number): Promise<Run[]> {
    const frames = [request.start, request.end?.file, request.references?.sheet, ...request.keyframes.map((k) => k.file)];
    for (const file of frames) {
      if (file && !(await exists(this.photoPath(file)))) throw new Error("One of the frames is no longer on disk. Add it again.");
    }
    if (request.audio && !(await exists(this.audioPath(request.audio.file)))) throw new Error("The audio track is no longer on disk. Add it again.");
    if (request.video && !(await exists(this.videoPath(request.video.file)))) throw new Error("The video is no longer on disk. Add it again.");
    const written = finalPrompt(request.script, { lipsync: request.audio?.lipsync, references: request.references && { panels: request.references.panels, texts: request.references.texts ?? {} } });
    if (!written) throw new Error("Write what happens in the shot first.");
    // a LoRA's words (its trigger, or how its move is told) open the prompt
    const words = loraWords(request.loras);
    const prompt = words ? `${words} ${written}` : written;
    const guided = request.end || request.keyframes.length || !request.start || request.quality === "draft" || request.video;
    const quality: Quality = guided && request.quality === "production" ? "standard" : request.quality;
    const size = request.references
      ? { ...REFERENCE_SIZE }
      : request.video?.mode === "motion"
      ? motionSize(request.video)
      : request.video?.mode === "swap"
      ? swapSize(request.video)
      : outputSize(request.video ?? (await this.frameSize(request.start ?? request.end?.file)), request.video ? "auto" : request.aspect, quality);
    const batch = randomBytes(3).toString("hex");
    const now = Date.now();
    const runs: Run[] = [];
    for (let i = 0; i < takes; i++) {
      const stamp = new Date(now + i).toISOString();
      const run: Run = {
        id: `${stamp.slice(0, 10).replaceAll("-", "")}-${randomBytes(4).toString("hex")}`,
        batch,
        take: i + 1,
        takes,
        request,
        seed: seed !== undefined ? seed + i : random32(),
        frameSeed: random32(),
        prompt,
        size,
        fps: quality === "production" && !guided ? FPS * 2 : FPS,
        status: "queued",
        stage: "Waiting",
        progress: 0,
        jobs: [],
        createdAt: stamp,
        updatedAt: stamp,
        seconds: {},
      };
      await mkdir(this.runDir(run.id), { recursive: true });
      this.runs.set(run.id, run);
      await this.save(run);
      this.emit("run", run);
      runs.push(run);
      void this.process(run, request.end?.paint && !request.end.file ? "frame" : "shot");
    }
    return runs;
  }

  /** A new take with another take's picture and a new sound written for it. */
  async resound(id: string, sound: string): Promise<Run> {
    const source = this.runs.get(id);
    if (!source || source.status !== "done") throw new Error("Pick a finished take.");
    if (source.request.audio) throw new Error("This take follows your own track.");
    if (source.fps !== FPS) throw new Error(`New sound works on ${FPS} fps takes.`);
    if (!sound.trim()) throw new Error("Describe the sound.");
    const request: ShotRequest = { ...source.request, name: `${source.request.name} · new sound`, sound: { from: source.request.sound?.from ?? id, text: sound.trim() } };
    // the picture as scripted, with the new sound where the old one was
    const picture = request.script.raw ? "" : compose({ shots: request.script.shots.map((s) => ({ ...s, sound: "" })) });
    const stamp = new Date().toISOString();
    const run: Run = {
      ...source,
      id: `${stamp.slice(0, 10).replaceAll("-", "")}-${randomBytes(4).toString("hex")}`,
      batch: randomBytes(3).toString("hex"),
      take: 1,
      takes: 1,
      request,
      seed: random32(),
      prompt: `${picture || source.prompt} ${sound.trim()}`.trim(),
      status: "queued",
      stage: "Waiting",
      progress: 0,
      jobs: [],
      createdAt: stamp,
      updatedAt: stamp,
      seconds: {},
      video: undefined,
      error: undefined,
    };
    await mkdir(this.runDir(run.id), { recursive: true });
    this.runs.set(run.id, run);
    await this.save(run);
    this.emit("run", run);
    void this.process(run, "shot");
    return run;
  }

  /** A shot that copies a clip's motion: its pose or edges drive the picture. */
  private async motionShot(run: Run, signal: AbortSignal) {
    const started = Date.now();
    const r = run.request;
    const clip = r.video!;
    await this.update(run, { status: "shot", stage: "Reading the motion", phase: "roll", progress: 0, error: undefined });
    // as many of the clip's frames as the shot is long, on LTX's 8n + 1 grid
    const frames = Math.floor((Math.min(r.seconds * FPS, clip.frames - 1)) / 8) * 8 + 1;
    const graph = buildMotion(
      await loadGraph(this.dirs.workflows, "shot-motion.json"),
      this.assetFor(this.videoPath(clip.file)),
      r.start ? this.assetFor(this.photoPath(r.start)) : null,
      clip.control,
      { prompt: run.prompt, frames, seed: run.seed },
    );
    if (r.audio) applyAudio(graph, this.assetFor(this.audioPath(r.audio.file)), (frames - 1) / FPS);
    const units = (frames / FPS) * ((run.size.width * run.size.height) / 1e6);
    const job = await this.execute(graph, signal, { run, stage: "shot", span: [0, 1], kind: "motion", units });
    const [video] = job.getOutputs("video");
    if (!video) throw new Error("The motion workflow returned no video.");
    await video.toFile(join(this.runDir(run.id), "shot.mp4"));
    run.seconds.shot = Math.round((Date.now() - started) / 1000);
    run.length = Math.round(((frames - 1) / FPS) * 10) / 10;
    await this.update(run, { status: "done", stage: "", progress: 1, video: `/media/runs/${run.id}/shot.mp4` });
  }

  /**
   * A trend's take from its recipe (shot-swap-dev.json): the recipe's control (a skeleton laid out for
   * the cast, or a depth pass) drives the motion, the start frame says who is in it, and the trend's
   * vocals are frozen in from where the take starts, so the mouths follow them. Comfy Cloud now and
   * then returns a black take for one exact mix of words, length and inputs: it is rolled again with
   * another seed and its words nudged, twice at most.
   */
  private async swapShot(run: Run, signal: AbortSignal, attempt = 0) {
    const started = Date.now();
    const r = run.request;
    const clip = r.video!;
    await this.update(run, { status: "shot", stage: attempt ? "Black picture: rolling again" : "Rolling the take", phase: "roll", progress: 0, error: undefined });
    // the recipe's length, or as many of the control's frames as the take is long, on LTX's 8n + 1 grid
    const frames = Math.floor((Math.min(clip.length ?? Math.round(r.seconds * FPS), clip.frames) - 1) / 8) * 8 + 1;
    const graph = buildSwap(await loadGraph(this.dirs.workflows, "shot-swap-dev.json"), {
      clip: this.assetFor(this.videoPath(clip.file)),
      photo: this.assetFor(this.photoPath(r.start!)),
      audio: this.assetFor(this.audioPath(r.audio!.file)),
      from: clip.from ?? 0,
      prompt: run.prompt + SWAP_NUDGES[attempt],
      frames,
      width: run.size.width / 2,
      height: run.size.height / 2,
      seed: run.seed,
      control: "ready",
      strength: clip.strength,
      build: clip.build,
      // a drawn last frame, when the take must land where the next shot starts
      ...(r.end?.file ? { end: this.assetFor(this.photoPath(r.end.file)) } : {}),
    });
    const units = (frames / FPS) * ((run.size.width * run.size.height) / 1e6);
    const job = await this.execute(graph, signal, { run, stage: "shot", span: [0, 1], kind: "swap", units });
    const [video] = job.getOutputs("video");
    if (!video) throw new Error("The take's workflow returned no video.");
    const file = join(this.runDir(run.id), "shot.mp4");
    await video.toFile(file);
    if (this.checks.ffmpeg && (await looksBlack(file, frames / FPS, true))) {
      if (attempt + 1 >= SWAP_NUDGES.length) throw new Error("LTX-2.5 returned a black picture three times. Roll the take again.");
      run.seed += 1000;
      return this.swapShot(run, signal, attempt + 1);
    }
    run.seconds.shot = Math.round((Date.now() - started) / 1000);
    run.length = Math.round((frames / FPS) * 1000) / 1000;
    await this.update(run, { status: "done", stage: "", progress: 1, video: `/media/runs/${run.id}/shot.mp4` });
  }

  /**
   * The Director: an idea becomes a shot list. An open-weights LLM (Gemma 4)
   * plans it inside ComfyUI, so planning is a workflow like every other step.
   */
  async plan(idea: string, options: { shots: number; seconds: number; aspect: string; photo?: string }): Promise<Plan> {
    if (options.photo && !(await exists(this.photoPath(options.photo)))) throw new Error("That photo is no longer on disk.");
    const lines = [`Idea: ${idea}`, `Shots: ${options.shots}`, `Frame: ${options.aspect}`, `About ${options.seconds} seconds per shot.`];
    if (options.photo) lines.push("The attached photo is the first frame of shot 1: keep its people, place and light.");
    const graph = buildPlan(
      await loadGraph(this.dirs.workflows, "director.json"),
      lines.join("\n"),
      random32(),
      options.photo ? this.client.assets.fromFile(this.photoPath(options.photo)) : undefined,
    );
    const job = await this.execute(graph, new AbortController().signal, { kind: "plan", stage: "frame" });
    const [out] = job.getOutputs("out");
    if (!out) throw new Error("The director returned nothing. Plan again.");
    return parsePlan(Buffer.from(await out.toBytes()).toString("utf8"), options.shots, options.seconds);
  }

  /**
   * The assistant's answer to a prompt (assistant.json, Gemma 4), as text. It doesn't wait in the render queue.
   * `brief` replaces the shot assistant's brief (Control has its own); `picture` is any image file it should see.
   */
  /**
   * Gemma 4 in ComfyUI writes text from a brief and a prompt (a story step, as JSON), out of the
   * render queue like the assistant's answers, so it never waits behind takes.
   */
  /** Gemma 4 writes from a brief and a prompt; a picture (a photo's file), when given, is in its view as it writes. */
  async write(brief: string, prompt: string, { maxLength = 3000, temperature = 0.7, picture }: { maxLength?: number; temperature?: number; picture?: string } = {}): Promise<string> {
    const image = picture && (await exists(this.photoPath(picture))) ? this.client.assets.fromFile(this.photoPath(picture)) : undefined;
    const graph = buildPlan(await loadGraph(this.dirs.workflows, "director.json"), prompt, random32(), image);
    if (graph.brief) graph.brief.inputs.value = brief;
    if (graph.plan) Object.assign(graph.plan.inputs, { max_length: maxLength, "sampling_mode.temperature": temperature });
    const job = await this.execute(graph, new AbortController().signal, { kind: "plan", stage: "frame", queue: false });
    const [out] = job.getOutputs("out");
    if (!out) throw new Error("The writer returned nothing. Try again?");
    return Buffer.from(await out.toBytes()).toString("utf8");
  }

  /** The Shot assistant's own brief, as its workflow carries it, for a writer outside ComfyUI. */
  async assistantBrief() {
    const graph = await loadGraph(this.dirs.workflows, "assistant.json");
    return String(graph.brief?.inputs?.value ?? "");
  }

  async ask(prompt: string, photo?: string, manual?: string, { brief, picture }: { brief?: string; picture?: string } = {}): Promise<string> {
    if (photo && !(await exists(this.photoPath(photo)))) photo = undefined;
    const image = picture ?? (photo ? this.photoPath(photo) : undefined);
    const graph = buildPlan(await loadGraph(this.dirs.workflows, "assistant.json"), prompt, random32(), image ? this.client.assets.fromFile(image) : undefined);
    if (brief && graph.brief) graph.brief.inputs.value = brief;
    // the brief says who it is and what it may do; the manual, how the app works today
    if (manual && graph.brief) graph.brief.inputs.value = `${graph.brief.inputs.value}\n\n${manual}`;
    const job = await this.execute(graph, new AbortController().signal, { kind: "plan", stage: "frame", queue: false });
    const [out] = job.getOutputs("out");
    if (!out) throw new Error("The assistant returned nothing. Say it again?");
    return Buffer.from(await out.toBytes()).toString("utf8");
  }

  private async soundShot(run: Run, signal: AbortSignal) {
    const started = Date.now();
    const picture = join(this.runDir(run.request.sound!.from), "shot.mp4");
    if (!(await exists(picture))) throw new Error("The take this sound is for is gone.");
    await this.update(run, { status: "shot", stage: "Writing the sound", phase: "sound", progress: 0, error: undefined });
    const units = run.request.seconds * ((run.size.width * run.size.height) / 1e6);
    const graph = buildSound(await loadGraph(this.dirs.workflows, "sound.json"), this.assetFor(picture), run.prompt, run.request.seconds * FPS + 1, run.seed);
    const job = await this.execute(graph, signal, { run, stage: "shot", span: [0, 1], kind: "sound", units });
    const [video] = job.getOutputs("video");
    if (!video) throw new Error("The sound workflow returned no video.");
    await video.toFile(join(this.runDir(run.id), "shot.mp4"));
    run.seconds.shot = Math.round((Date.now() - started) / 1000);
    await this.update(run, { status: "done", stage: "", progress: 1, video: `/media/runs/${run.id}/shot.mp4` });
  }

  /** Accept a take's painted last frame and animate. */
  async approve(id: string) {
    const run = this.mustBe(id, ["review"]);
    void this.process(run, "shot");
    return run;
  }

  /** Paint a take's last frame again, with a new seed and optionally a new instruction. */
  async reframe(id: string, instruction?: string) {
    const run = this.mustBe(id, ["review", "failed"]);
    if (!run.request.end?.paint) throw new Error("This take has no painted last frame.");
    run.frameSeed = random32();
    if (instruction?.trim()) run.request = { ...run.request, end: { paint: instruction.trim().slice(0, 600) } };
    void this.process(run, "frame");
    return run;
  }

  async cancel(id: string) {
    const run = this.mustBe(id, ["queued", "frame", "review", "shot"]);
    this.aborts.get(id)?.abort();
    if (run.status === "review" || !this.aborts.has(id)) await this.update(run, { status: "canceled", stage: "" });
    return run;
  }

  async remove(id: string) {
    if (!this.runs.has(id)) return;
    this.aborts.get(id)?.abort();
    this.runs.delete(id);
    await rm(this.runDir(id), { recursive: true, force: true });
    this.emit("removed", id);
  }

  /** The API-format workflow a take ran, or null. */
  async workflow(id: string, stage: "shot" | "frame") {
    try {
      return await readFile(join(this.runDir(id), `${stage}.workflow.json`), "utf8");
    } catch {
      return null;
    }
  }

  /** Paints a new image from a source photo, outside any take (the Sources "Paint" key). */
  paint(source: string, instruction: string, seed = random32()): Paint {
    return this.photoJob("paint", source, instruction, async (photo) =>
      buildPaint(await loadGraph(this.dirs.workflows, "frame-edit.json"), photo, instruction, seed));
  }

  /** Cuts the subject out onto black, the way a reference sheet wants its cast and props. */
  cutout(source: string): Paint {
    return this.photoJob("cutout", source, `${this.imageNames[source] ?? "subject"} cutout`, async (photo) => buildCutout(await loadGraph(this.dirs.workflows, "cutout.json"), photo));
  }

  /** The subject alone, on a clear background (a PNG with its alpha), for Utensils. */
  clearCutout(source: string): Paint {
    return this.photoJob("cutout", source, `${this.imageNames[source] ?? "subject"} cut out`, async (photo) => {
      const graph = await loadGraph(this.dirs.workflows, "cutout-alpha.json");
      graph.photo.inputs.image = photo;
      return graph;
    });
  }

  /** Spice's Roto on a picture: the subject's matte, from its clicks or its name (SAM3). */
  matteImage(source: string, v: Parameters<typeof buildMatteImage>[2]): Paint {
    return this.photoJob("matte", source, `${this.imageNames[source] ?? "subject"} matte`, async (photo) => buildMatteImage(await loadGraph(this.dirs.workflows, "matte-image.json"), photo, v));
  }

  /** A picture two or four times larger (4x-UltraSharp), its long side kept within 4096 pixels. */
  async upscale(source: string, scale: 2 | 4): Promise<Paint> {
    const size = imageSize(await readFile(this.photoPath(source)));
    if (!size) throw new Error("That picture can't be read.");
    // a big picture is made smaller first, so the result stays within 4096 pixels
    const before = Math.min(1, 4096 / (Math.max(size.width, size.height) * scale));
    return this.photoJob("upscale", source, `${this.imageNames[source] ?? "picture"} ${scale}x`, async (photo) => {
      const graph = await loadGraph(this.dirs.workflows, "upscale.json");
      graph.photo.inputs.image = photo;
      graph.fit.inputs.scale_by = Math.round(before * 1000) / 1000;
      graph.size.inputs.scale_by = scale / 4;
      return graph;
    });
  }

  /**
   * A video a workflow makes from another one, kept with the uploads: SeedVR2 restoring it larger, LTX-2.5 writing its sound, or
   * SAM3 tracking a subject through it as a matte (Spice's Roto). keep(bytes) stores the result.
   */
  videoJob(kind: "upscale" | "sound" | "matte", source: string, v: { height?: number; prompt?: string; frames?: number; seed: number; loras?: VideoLora[]; matte?: Parameters<typeof buildMatte>[2] }, keep: (bytes: Buffer) => Promise<NonNullable<Paint["video"]>>): Paint {
    const job: Paint = { id: randomBytes(4).toString("hex"), status: "running", progress: 0 };
    this.paints.set(job.id, job);
    const emit = () => this.emit("paint", job);
    (async () => {
      try {
        if (!(await exists(this.videoPath(source)))) throw new Error("That video is no longer on disk.");
        const asset = this.assetFor(this.videoPath(source));
        let graph: Graph;
        if (kind === "upscale") {
          graph = await loadGraph(this.dirs.workflows, "upscale-video.json");
          graph.video_in.inputs.file = asset;
          Object.assign(graph.up.inputs, { seed: v.seed, resolution: v.height ?? 1080, max_resolution: Math.round(((v.height ?? 1080) * 16) / 9 / 2) * 2 });
        } else if (kind === "matte") graph = buildMatte(await loadGraph(this.dirs.workflows, "matte.json"), asset, v.matte!);
        else graph = buildSound(await loadGraph(this.dirs.workflows, "sound.json"), asset, v.prompt ?? "", v.frames ?? 121, v.seed);
        const result = await this.execute(graph, new AbortController().signal, { kind: kind === "upscale" ? "restore" : kind, stage: "shot", units: (v.frames ?? 121) / FPS, loras: v.loras, onProgress: (p) => ((job.progress = p), emit()) });
        const [out] = result.getOutputs("video");
        if (!out) throw new Error("The workflow returned no video.");
        job.video = await keep(Buffer.from(await out.toBytes()));
        job.status = "done";
      } catch (error) {
        job.status = "failed";
        job.error = describe(error);
      }
      emit();
    })();
    return job;
  }

  /** A new image from a description, for any input slot. */
  generate(prompt: string, aspect: string, seed = random32()): Paint {
    return this.photoJob("generate", null, prompt, async () => buildGenerate(await loadGraph(this.dirs.workflows, "image-generate.json"), prompt, aspect, seed));
  }

  /** The Image window's models (official templates); set by the server. */
  images?: ImageModels;

  private async refAssets(refs: string[]) {
    for (const f of refs) if (!(await exists(this.photoPath(f)))) throw new Error("One of the references is no longer on disk.");
    return refs.map((f) => this.client.assets.fromFile(this.photoPath(f)));
  }

  /** Pictures from the Image window: one job per picture, each with its own seed. */
  async image(v: { model: string; template: string; prompt: string; aspect: string; megapixels: number; seed: number; count: number; refs: string[]; names: string[]; loras: { file: string; strength?: number }[]; name?: string; keep?: number }): Promise<Paint[]> {
    const images = this.images!;
    await images.ready;
    const { model } = images.pick(v.model, v.template);
    const first = v.refs[0] ? imageSize(await readFile(this.photoPath(v.refs[0]))) ?? undefined : undefined;
    const size = images.size(model, v.aspect, v.megapixels, first);
    return Array.from({ length: v.count }, (_, i) =>
      this.photoJob(v.template === "generate" ? "generate" : "paint", null, v.name || v.prompt, async () =>
        images.build(v.model, v.template, { prompt: v.prompt, names: v.names, loras: v.loras, ...size, seed: v.seed + i, refs: await this.refAssets(v.refs), keep: v.keep })));
  }

  /** The prompt rewritten by the template's own enhancer. It doesn't wait in the render queue. */
  async enhanceImage(v: { model: string; template: string; prompt: string; aspect: string; refs: string[]; names: string[] }): Promise<string> {
    const images = this.images!;
    await images.ready;
    const graph = await images.buildEnhancer(v.model, v.template, { prompt: v.prompt, names: v.names, aspect: v.aspect, seed: random32(), refs: await this.refAssets(v.refs) });
    const job = await this.execute(graph, new AbortController().signal, { kind: "plan", stage: "frame", queue: false });
    const [out] = job.getOutputs("out");
    if (!out) throw new Error("The enhancer returned nothing. Try again?");
    // its tags back to the names the prompt calls the references by, so they read as pills again
    return untagRefs(unwrapPrompt(Buffer.from(await out.toBytes()).toString("utf8")), v.names, images.pick(v.model, v.template).template.refs);
  }

  /**
   * Music (ACE-Step 1.5) or a sound effect (Stable Audio 3 small SFX) from words, tracked like a
   * paint job; keep() stores what it made in the audio library.
   */
  audioJob(kind: "music" | "song" | "sfx", v: { prompt: string; seconds: number; lyrics?: string; bpm?: number; seed: number; key?: string; language?: string; timesignature?: string; passes?: number; temperature?: number; adherence?: number; thinking?: boolean }, keep: (bytes: Buffer) => Promise<Paint["audio"]>): Paint {
    const job: Paint = { id: randomBytes(4).toString("hex"), status: "running", progress: 0 };
    this.paints.set(job.id, job);
    const emit = () => this.emit("paint", job);
    (async () => {
      try {
        const graph = await loadGraph(this.dirs.workflows, kind === "music" ? "audio/music.json" : kind === "song" ? "audio/song.json" : "audio/sfx.json");
        if (kind === "song") {
          // ACE-Step 1.5 XL in three passes: the first from nothing, the two after light refinements of it
          Object.assign(graph.text.inputs, { tags: v.prompt, lyrics: v.lyrics?.trim() || "[Instrumental]", seed: v.seed, duration: v.seconds, bpm: Math.round(v.bpm ?? 140), keyscale: v.key ?? "A minor", language: v.language ?? "en", timesignature: v.timesignature ?? "4", temperature: v.temperature ?? 0.75, cfg_scale: v.adherence ?? 2.5, generate_audio_codes: v.thinking ?? true });
          graph.latent.inputs.seconds = v.seconds;
          graph.first.inputs.seed = v.seed;
          graph.second.inputs.seed = v.seed + 1;
          graph.third.inputs.seed = v.seed + 2;
          // a draft is the first pass alone
          if (v.passes === 1) {
            graph.decode.inputs.samples = ["first", 0];
            delete graph.second;
            delete graph.third;
          }
        } else if (kind === "music") {
          Object.assign(graph.text.inputs, { tags: v.prompt, lyrics: v.lyrics?.trim() || "[Instrumental]", seed: v.seed, duration: v.seconds, bpm: Math.round(v.bpm ?? 100) });
          Object.assign(graph.latent.inputs, { seconds: v.seconds });
          graph.sample.inputs.seed = v.seed;
        } else {
          graph.positive.inputs.text = v.prompt;
          graph.latent.inputs.seconds = v.seconds;
          graph.sample.inputs.seed = v.seed;
        }
        const result = await this.execute(graph, new AbortController().signal, { kind: kind === "song" ? "music" : kind, stage: "frame", queue: false, onProgress: (p) => ((job.progress = p), emit()) });
        const [out] = result.getOutputs("out");
        if (!out) throw new Error(`The ${kind === "sfx" ? "sound" : "music"} workflow returned nothing.`);
        job.audio = await keep(Buffer.from(await out.toBytes()));
        job.status = "done";
      } catch (error) {
        job.status = "failed";
        job.error = describe(error);
      }
      emit();
    })();
    return job;
  }

  /**
   * A song listened to: its vocals separated (Demucs), their words written with their times
   * (Whisper, as SRT) and its tempo and beats read. keep(bytes) stores the vocals.
   */
  listenJob(file: string, seconds: number, keep: (bytes: Buffer, stem?: string) => Promise<Paint["audio"]>): Paint {
    const job: Paint = { id: randomBytes(4).toString("hex"), status: "running", progress: 0 };
    this.paints.set(job.id, job);
    const emit = () => this.emit("paint", job);
    (async () => {
      try {
        if (!(await exists(this.audioPath(file)))) throw new Error("That track is no longer on disk.");
        const graph = await loadGraph(this.dirs.workflows, "jam-analyze.json");
        graph.track.inputs.audio = this.assetFor(this.audioPath(file));
        const result = await this.execute(graph, new AbortController().signal, { kind: "listen", stage: "frame", units: seconds, onProgress: (p) => ((job.progress = p), emit()) });
        const read = async (id: string) => {
          const [out] = result.getOutputs(id);
          return out ? Buffer.from(await out.toBytes()).toString("utf8") : "";
        };
        const [srt, bpm, beats] = await Promise.all([read("srt"), read("bpm"), read("beats")]);
        const [vocals] = result.getOutputs("vocals");
        // the other three stems of the same separation (Demucs gives four: no extra work, only more files to keep)
        const stem = async (id: string) => {
          const [out] = result.getOutputs(id);
          return out ? keep(Buffer.from(await out.toBytes()), id) : undefined;
        };
        const [bass, drums, other] = await Promise.all([stem("bass"), stem("drums"), stem("other")]);
        job.listen = { srt, bpm, beats, vocals: vocals ? await keep(Buffer.from(await vocals.toBytes())) : undefined, stems: { bass, drums, other } };
        job.status = "done";
      } catch (error) {
        job.status = "failed";
        job.error = describe(error);
      }
      emit();
    })();
    return job;
  }

  /** A picture made outside ComfyUI (a partner model on Comfy Router), tracked like a paint job. */
  externalPhotoJob(name: string, make: () => Promise<Buffer>, seconds = 25): Paint {
    const job: Paint = { id: randomBytes(4).toString("hex"), status: "running", progress: 0 };
    this.paints.set(job.id, job);
    const emit = () => this.emit("paint", job);
    // the maker sends no readings: the bar follows the time such a picture takes
    const started = Date.now();
    const tick = setInterval(() => ((job.progress = Math.min(0.95, (Date.now() - started) / 1000 / seconds)), emit()), 1000);
    (async () => {
      try {
        job.photo = await this.storeImage(await make(), name);
        job.status = "done";
      } catch (error) {
        job.status = "failed";
        job.error = describe(error);
      }
      clearInterval(tick);
      emit();
    })();
    return job;
  }

  /** A workflow that makes a photo (from another one, or from nothing), tracked like a paint job. */
  private photoJob(kind: "paint" | "cutout" | "generate" | "upscale" | "matte", source: string | null, name: string, build: (photo: unknown) => Promise<Graph>): Paint {
    const job: Paint = { id: randomBytes(4).toString("hex"), status: "running", progress: 0 };
    this.paints.set(job.id, job);
    const emit = () => this.emit("paint", job);
    (async () => {
      try {
        if (source && !(await exists(this.photoPath(source)))) throw new Error("That photo is no longer on disk.");
        const graph = await build(source ? this.client.assets.fromFile(this.photoPath(source)) : null);
        const result = await this.execute(graph, new AbortController().signal, {
          kind,
          stage: "frame",
          onProgress: (p) => {
            job.progress = p;
            emit();
          },
        });
        const [out] = result.getOutputs("frame");
        if (!out) throw new Error(`The ${kind} workflow returned no image.`);
        job.photo = await this.storeImage(Buffer.from(await out.toBytes()), name);
        job.status = "done";
      } catch (error) {
        job.status = "failed";
        job.error = describe(error);
      }
      emit();
    })();
    return job;
  }

  /**
   * What each library image is called: its file's name when it was uploaded, a sample's name,
   * the first words of the description it was generated from. Kept in photos/names.json.
   */
  imageNames: Record<string, string> = {};

  private async nameImage(file: string, name?: string) {
    const words = String(name ?? "").replace(/\.[a-z0-9]{2,4}$/i, "").replace(/@/g, "").replace(/[_\s]+/g, " ").trim().split(" ").slice(0, 4).join(" ").slice(0, 40);
    if (!words || this.imageNames[file]) return;
    this.imageNames[file] = words;
    await writeFile(join(this.dirs.data, "photos", "names.json"), JSON.stringify(this.imageNames, null, 1)).catch(() => {});
  }

  /** Saves image bytes into the photo library under their hash, with a name if one is known. */
  async storeImage(bytes: Buffer, name?: string) {
    const size = imageSize(bytes);
    if (!size) throw new Error("The workflow returned an image I can't read.");
    const ext = bytes.readUInt32BE(0) === 0x89504e47 ? ".png" : bytes.toString("ascii", 8, 12) === "WEBP" ? ".webp" : ".jpg";
    const file = `${createHash("sha256").update(bytes).digest("hex").slice(0, 16)}${ext}`;
    const path = this.photoPath(file);
    if (!(await exists(path))) await writeFile(path, bytes);
    await this.nameImage(file, name);
    return { file, url: `/media/photos/${file}`, ...size, name: this.imageNames[file] };
  }

  /** A library image's name: the one it was given, else what a take used it for ("Plush Toy start"). */
  imageName(file: string) {
    if (this.imageNames[file]) return this.imageNames[file];
    for (const run of this.list()) {
      const r = run.request;
      const role = r.start === file ? "start" : r.end?.file === file || run.frameFile === file ? "end" : r.keyframes?.some((k) => k.file === file) ? "keyframe"
        : r.references?.sheet === file ? "sheet" : r.references?.cast === file ? "cast" : r.references?.prop === file ? "prop" : r.references?.location === file ? "place" : null;
      if (role) return `${r.name} ${role}`;
    }
    return undefined;
  }

  private mustBe(id: string, states: RunStatus[]) {
    const run = this.runs.get(id);
    if (!run) throw new Error("No such take.");
    if (!states.includes(run.status)) throw new Error(`The take is ${run.status}.`);
    return run;
  }

  private async save(run: Run) {
    await writeFile(join(this.runDir(run.id), "run.json"), JSON.stringify(run, null, 2));
  }

  private async update(run: Run, patch: Partial<Run>, persist = true) {
    Object.assign(run, patch, { updatedAt: new Date().toISOString() });
    this.emit("run", run);
    if (persist) await this.save(run);
  }

  private async process(run: Run, from: "frame" | "shot") {
    const abort = new AbortController();
    this.aborts.set(run.id, abort);
    try {
      if (from === "frame") {
        await this.paintFrame(run, abort.signal);
        if (run.request.review) {
          await this.update(run, { status: "review", stage: "Last frame ready", phase: "frame", progress: 0.2 });
          return;
        }
      }
      if (run.request.sound) await this.soundShot(run, abort.signal);
      else if (run.request.video?.mode === "motion") await this.motionShot(run, abort.signal);
      else if (run.request.video?.mode === "swap") await this.swapShot(run, abort.signal);
      else await this.shoot(run, abort.signal);
    } catch (error) {
      const canceled = abort.signal.aborted || error instanceof Canceled;
      await this.update(run, {
        status: canceled ? "canceled" : "failed",
        stage: "",
        error: canceled ? undefined : describe(error),
      });
    } finally {
      if (this.aborts.get(run.id) === abort) this.aborts.delete(run.id);
    }
  }

  private async paintFrame(run: Run, signal: AbortSignal) {
    const started = Date.now();
    if (!run.request.start) throw new Error("Painting a last frame needs a start frame.");
    await this.update(run, { status: "frame", stage: "Painting the last frame", phase: "frame", progress: 0, error: undefined });
    const graph = buildPaint(
      await loadGraph(this.dirs.workflows, "frame-edit.json"),
      this.assetFor(this.photoPath(run.request.start)),
      run.request.end?.paint ?? "",
      run.frameSeed,
    );
    const job = await this.execute(graph, signal, { run, stage: "frame", span: [0, 0.2], kind: "paint" });
    const [out] = job.getOutputs("frame");
    if (!out) throw new Error("The paint workflow returned no image.");
    const photo = await this.storeImage(Buffer.from(await out.toBytes()), `${run.request.name} end`);
    run.seconds.frame = Math.round((Date.now() - started) / 1000);
    await this.update(run, { frame: photo.url, frameFile: photo.file, progress: 0.2 });
  }

  /** Rolls the shot. A black picture rolls again with a new seed, then on the single-pass graph. */
  private async shoot(run: Run, signal: AbortSignal, attempt = 0): Promise<void> {
    const started = Date.now();
    const r = run.request;
    if (r.model && isRouterVideo(r.model)) return this.routerShoot(run, signal);
    const start = r.end?.paint && !r.end.file ? 0.2 : 0;
    await this.update(run, { status: "shot", stage: "Rolling camera", phase: "roll", progress: start, error: undefined });
    const asset = (file: string) => this.assetFor(this.photoPath(file));
    const guides: Guide[] = [];
    let graph: Graph | null = null;
    let clipLink: [string, number] | null = null;
    if (r.video) {
      graph = await loadGraph(this.dirs.workflows, "shot-guided.json");
      clipLink = addClipGuide(graph, this.assetFor(this.videoPath(r.video.file)), r.video.frames);
      if (clipLink) guides.push({ link: clipLink, frame: 0, strength: 1 });
    }
    if (!r.references) {
      if (r.start && !r.video) guides.push({ image: asset(r.start), frame: 0, strength: r.strengths.start });
      for (const k of r.keyframes) guides.push({ image: asset(k.file), frame: Math.max(1, Math.round(k.time * FPS)), strength: k.strength });
      const end = r.end?.file ?? run.frameFile;
      if (end) guides.push({ image: asset(end), frame: -1, strength: r.strengths.end });
    }
    const inputs = { prompt: run.prompt, seconds: r.seconds, seed: run.seed, ...run.size, enhance: r.enhance };
    const startOnly = !r.references && !r.video && guides.length === 1 && guides[0].frame === 0 && attempt < 2;
    const kind: Kind = r.references ? "references" : startOnly && r.quality === "production" ? "production" : startOnly && r.quality !== "draft" ? "i2v" : "guided";
    const units = r.seconds * ((run.size.width * run.size.height) / 1e6);
    graph = graph
      ? await buildGuided(graph, this.dirs.workflows, guides, inputs)
      : startOnly && r.quality === "production"
      ? await buildProduction(await loadGraph(this.dirs.workflows, "shot-production.json"), this.dirs.workflows, guides[0].image, inputs)
      : startOnly && r.quality !== "draft"
      ? await buildI2V(await loadGraph(this.dirs.workflows, "shot-i2v.json"), this.dirs.workflows, guides[0].image, inputs)
      : await buildGuided(
          await loadGraph(this.dirs.workflows, "shot-guided.json"),
          this.dirs.workflows,
          guides,
          inputs,
          r.references ? asset(r.references.sheet) : undefined,
        );
    if (r.audio) applyAudio(graph, this.assetFor(this.audioPath(r.audio.file)), r.seconds);
    // the enhancer rewrites the prompt in its own words: a LoRA's trigger opens its answer again
    const words = loraWords(r.loras);
    if (words && graph.enhancer) {
      for (const n of Object.values(graph)) if (Array.isArray(n.inputs.text) && n.inputs.text[0] === "enhancer") n.inputs.text = ["lora_words", 0];
      graph.lora_words = { class_type: "StringConcatenate", inputs: { string_a: words, string_b: ["enhancer", 0], delimiter: " " } };
    }
    const job = await this.execute(graph, signal, { run, stage: "shot", span: [start, 1], kind, units });
    const [video] = job.getOutputs("video");
    if (!video) throw new Error("The shot workflow returned no video.");
    const file = join(this.runDir(run.id), "shot.mp4");
    if (r.video && clipLink) {
      // the extension starts on the clip's last frames: the clip's head goes in front of it
      const part = join(this.runDir(run.id), "extension.mp4");
      await video.toFile(part);
      await joinClip(this.videoPath(r.video.file), part, file, r.video.frames - EXTEND_OVERLAP, run.size);
      run.length = Math.round(((r.video.frames - EXTEND_OVERLAP) / FPS + r.seconds) * 10) / 10;
    } else await video.toFile(file);
    if (this.checks.black && (await looksBlack(file, r.seconds, this.checks.ffmpeg))) {
      // some frames come back black from the two-pass graph every time; the single pass renders them
      const fallback = attempt === 1 && kind !== "guided" && kind !== "references";
      if (attempt >= 1 && !fallback) throw new Error("LTX-2.5 returned a black picture again. Roll the take again.");
      run.seed = random32();
      await this.update(run, { stage: fallback ? "Black picture twice: rolling in one pass" : "Black picture: rolling again with a new seed", progress: start });
      return this.shoot(run, signal, attempt + 1);
    }
    run.seconds.shot = Math.round((Date.now() - started) / 1000);
    await this.update(run, { status: "done", stage: "", progress: 1, video: `/media/runs/${run.id}/shot.mp4` });
  }

  /**
   * A take rolled by a partner's video model on Comfy Router: the start frame and the prompt the
   * script makes, the clip downloaded into the take's folder like LTX-2.5's. The maker sends no
   * readings, so the bar follows the time such a clip takes.
   */
  private async routerShoot(run: Run, signal: AbortSignal) {
    const started = Date.now();
    const r = run.request;
    if (!r.start) throw new Error("A partner's video model starts from a picture: give the shot a start frame.");
    const expected = routerVideoSeconds(r.model!, r.seconds);
    await this.update(run, { status: "shot", stage: `Rolling with ${routerVideoName(r.model!)}`, phase: "roll", progress: 0, error: undefined });
    const tick = setInterval(() => void this.update(run, { progress: Math.min(0.95, (Date.now() - started) / 1000 / expected) }, false), 2000);
    try {
      const bytes = await readFile(this.photoPath(r.start));
      const mime = bytes[0] === 0x89 ? "image/png" : bytes.toString("ascii", 8, 12) === "WEBP" ? "image/webp" : "image/jpeg";
      const { bytes: clip } = await routerVideo(r.model!, { prompt: run.prompt, start: { mime, data: bytes.toString("base64") }, seconds: r.seconds, aspect: r.aspect === "auto" ? (run.size.width >= run.size.height * 1.2 ? "16:9" : run.size.height >= run.size.width * 1.2 ? "9:16" : "1:1") : r.aspect, seed: run.seed, signal });
      const file = join(this.runDir(run.id), "shot.mp4");
      // a silent clip gets a silent track, so the edit mixes it like every other take
      const raw = join(this.runDir(run.id), "router.mp4");
      await writeFile(raw, clip);
      const streams = this.checks.ffmpeg ? String((await exec("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type", "-of", "csv=p=0", raw]).catch(() => ({ stdout: "audio" }))).stdout) : "audio";
      if (!streams.includes("audio")) await exec("ffmpeg", ["-nostdin", "-v", "error", "-y", "-i", raw, "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-shortest", "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "128k", file]);
      else await writeFile(file, clip);
      await rm(raw, { force: true });
    } finally {
      clearInterval(tick);
    }
    // Veo makes four, six or eight seconds, Kling at least three: the take is as long as the clip
    const made = routerVideoLength(r.model!, r.seconds);
    if (made !== r.seconds) run.length = made;
    run.seconds.shot = Math.round((Date.now() - started) / 1000);
    await this.update(run, { status: "done", stage: "", progress: 1, video: `/media/runs/${run.id}/shot.mp4` });
  }

  /** An asset handle for a library file, remembered so saved workflows can name it. */
  private assetFor(path: string) {
    const asset = this.client.assets.fromFile(path);
    this.assetNames.set(asset, path.split("/").pop()!);
    return asset;
  }

  private async saveWorkflow(run: Run, name: string, graph: Graph) {
    const text = JSON.stringify(graph, (_key, value) => (this.assetNames.has(value) ? this.assetNames.get(value) : value), 2);
    await writeFile(join(this.runDir(run.id), name), text);
  }

  /** Seconds per unit of work, learned from finished jobs (a unit is one second of video at one megapixel). */
  private timings: Record<string, number> = {};

  private expected(kind: Kind, units: number) {
    const rate = this.timings[kind] ?? DEFAULT_RATE[kind];
    return PER_JOB.has(kind) ? rate : Math.max(10, rate * units);
  }

  private async learn(kind: Kind, units: number, seconds: number) {
    const rate = PER_JOB.has(kind) ? seconds : seconds / Math.max(0.1, units);
    const before = this.timings[kind];
    this.timings[kind] = before ? before * 0.7 + rate * 0.3 : rate;
    await writeFile(join(this.dirs.data, "timings.json"), JSON.stringify(this.timings, null, 2)).catch(() => {});
  }

  private async execute(
    graph: Graph,
    signal: AbortSignal,
    track: {
      run?: Run;
      stage?: "frame" | "shot";
      span?: [number, number];
      kind?: Kind;
      units?: number;
      onProgress?: (p: number) => void;
      /** false: run now, beside whatever renders (small text jobs, so a chat answer doesn't wait for a shot) */
      queue?: boolean;
      /** LoRAs for a job without a take (a new sound for any clip) */
      loras?: VideoLora[];
    },
  ) {
    if (signal.aborted) throw new Canceled();
    const loras = track.loras ?? track.run?.request.loras;
    if (loras?.length) withLoras(graph, loras, track.kind === "sound");
    if (track.run) await this.saveWorkflow(track.run, `${track.stage ?? "shot"}.workflow.json`, graph);
    if (track.queue === false) return this.runJob(graph, signal, track);
    await this.acquire(track.run, signal);
    try {
      return await this.runJob(graph, signal, track);
    } finally {
      this.release();
    }
  }

  private async runJob(
    graph: Graph,
    signal: AbortSignal,
    track: {
      run?: Run;
      stage?: "frame" | "shot";
      span?: [number, number];
      kind?: Kind;
      units?: number;
      onProgress?: (p: number) => void;
    },
  ) {
    const job = await this.client.submit(this.client.workflows.fromJson(await this.prepare(graph)), { signal });
    const { run, stage = "shot", span = [0, 1] } = track;
    const kind: Kind = track.kind ?? (stage === "frame" ? "paint" : "guided");
    const units = track.units ?? 1;
    run?.jobs.push(job.id);
    const stop = () => void job.cancel().catch(() => {});
    signal.addEventListener("abort", stop, { once: true });

    // Comfy Cloud reports no per-node progress, so between real readings the
    // estimate comes from elapsed time against what similar jobs took, and the
    // stage from the bursts of live preview frames each sampling pass sends.
    const expected = this.expected(kind, units);
    const passes = stage === "frame" ? ["Painting the last frame"] : ["Rolling camera", "Adding detail", "Doubling the frame rate"];
    let runningSince = 0;
    let detailed = false;
    let node = "";
    let pass = 0;
    let bursts = 0;
    let lastPreview = 0;
    let lastSent = 0;
    const report = async (progress: number, label: string, phase: Run["phase"]) => {
      track.onProgress?.(progress);
      if (run) await this.update(run, { progress: span[0] + (span[1] - span[0]) * progress, stage: label, phase }, false);
    };
    const tick = setInterval(() => {
      if (!runningSince || detailed) return;
      const elapsed = (Date.now() - runningSince) / 1000;
      const progress = Math.min(0.97, elapsed / expected);
      const quiet = lastPreview && Date.now() - lastPreview > 2500;
      if (stage === "frame") return void report(progress, quiet ? "Finishing the frame" : "Painting the last frame", "frame");
      if (!bursts) return void report(progress, elapsed < 4 ? "Loading models" : "Rolling camera", "roll");
      if (quiet) return void report(progress, "Developing frames and sound", "sound");
      const i = Math.min(bursts, passes.length) - 1;
      void report(progress, passes[i], i === 0 ? "roll" : "detail");
    }, 1000);

    try {
      for await (const ev of job.events(signal)) {
        if (process.env.COMFYTURE_DEBUG) {
          const { data: _d, output: _o, ...rest } = ev as Record<string, unknown>;
          console.log(`[${job.id.slice(0, 8)}] ${JSON.stringify(rest)}`);
        }
        if (ev.kind === "statusChange") {
          if (ev.status === "queued" && run) {
            await this.update(run, { stage: ev.queuePosition ? `In line · ${ev.queuePosition} ahead` : "In line" }, false);
          }
          if (ev.status === "running" && !runningSince) runningSince = Date.now();
          if (TERMINAL.has(ev.status)) break;
        } else if (ev.kind === "progress") {
          runningSince ||= Date.now();
          if (!ev.currentNodeClass) continue;
          // A self-hosted ComfyUI says which node runs: use the real reading.
          detailed = true;
          if (ev.currentNode && ev.currentNode !== node) {
            node = ev.currentNode;
            if (ev.currentNodeClass.startsWith("SamplerCustom")) pass++;
          }
          const done = Math.min(1, Math.max(0, ev.value ?? (ev.nodesTotal ? (ev.nodesDone ?? 0) / ev.nodesTotal : 0)));
          await report(done, label(ev.currentNodeClass, pass, stage) ?? run?.stage ?? "", phaseOf(ev.currentNodeClass, pass, stage) ?? run?.phase);
        } else if (ev.kind === "preview") {
          runningSince ||= Date.now();
          if (Date.now() - lastPreview > 2500) bursts++;
          lastPreview = Date.now();
          const image = run && Date.now() - lastSent > 400 ? previewImage(ev.data) : null;
          if (run && image) {
            lastSent = Date.now();
            this.emit("preview", run.id, `data:${image.type};base64,${image.bytes.toString("base64")}`);
          }
        }
      }
      await job.wait(undefined, signal);
    } finally {
      clearInterval(tick);
      signal.removeEventListener("abort", stop);
    }
    if (signal.aborted) throw new Canceled();
    if (job.status !== "succeeded") {
      throw Object.assign(new Error(`The ${stage === "frame" ? "paint" : "shot"} job ${job.status}.`), { job: { error: job.error } });
    }
    if (runningSince) await this.learn(kind, units, (Date.now() - runningSince) / 1000);
    return job;
  }
}
