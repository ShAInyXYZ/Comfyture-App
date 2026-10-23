import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdir, readdir, readFile, writeFile, access, rm, stat, open, copyFile } from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { basename, join, normalize, resolve, sep } from "node:path";
import { Comfy } from "@comfyorg/sdk";
import { Engine, type ShotRequest, type Shot, type VideoLora } from "./engine.ts";
import { assistantPrompt, fillTransitions, fillUses, readAnswer, wantsNext, wantsRoll, type ChatFile, type ShotState, type Turn } from "./assistant.ts";
import { manual } from "./manual.ts";
import { LIMITS } from "./limits.ts";
import { CloudLibrary } from "./cloud.ts";
import { ASPECTS, ImageModels } from "./images.ts";
import { askClaude, blenderStatus, command, CONTROL_BRIEF, controlConnected, controlEvents, controlPrompt, fromBlender, readControlAnswer, reply, toBlender, type ControlTurn } from "./control.ts";
import { llms, defaultLlm, pickLlm, onRouter, llmName, routerAsk, imageBlock, takesTools } from "./llm.ts";
import { CATEGORIES, loadPresets, savePreset, type Preset } from "./presets.ts";
import { IMAGE_EXT, imageSize, sendFile } from "./media.ts";
import { readStory, storyBrief, storyPrompt, STORY_ASSIST_BRIEF, storyAssistPrompt, readStoryAssist, IDEAS_BRIEF, ideasPrompt, readIdeas, type StoryStep } from "./story.ts";
import { isRouterImage, routerImages, routerDraw } from "./router-images.ts";
import { isRouterVideo, routerVideos } from "./router-videos.ts";
import { planCut, ffmpegArgs, frameSize, cutBrief, jamBrief, cutPrompt, readCutAnswer, type CutBody, type CutItem, type Source } from "./cut.ts";
import { splitEdit } from "./mixer.ts";
import { macaronBrief, macaronTool, spaceOf, macaronPrompt, readMacaronAnswer, topUpBrand, keepExport, keepFrame, encodeFrames, dropFrames, frameJob, validJob, sweepFrames, ledgerLine } from "./macaron.ts";
import { SONG_BRIEF, songPrompt, readSong } from "./song.ts";
import { KEYS, LANGUAGES, SIGNATURES, MAX_SECONDS, DEFAULT_SONG } from "../web/js/song.js";
import { LYRIC_FILES } from "../web/js/lyrics.js";
import { MIXER_BRIEF, MIXER_TOOL, mixerPrompt, readMixerAnswer } from "./mixer-assist.ts";
import { UTENSILS_BRIEF, UTENSILS_TOOL, utensilsPrompt, readUtensilsAnswer, utensilsCandidates } from "./utensils-assist.ts";
import { SPICE_BRIEF, SPICE_TOOL, spicePrompt, readSpiceAnswer } from "./spice-assist.ts";
import { normaliseBody as spiceBody, FIRST as SPICE_FIRST } from "../web/js/spice-model.js";
import { searchKnowledge, knowledgeById } from "./utensils-knowledge.ts";
import { createEdit } from "./utensils-edit.ts";
import { createFx } from "./utensils-fx.ts";
import { createTemplates, realCloud, fakeRun } from "./comfy-templates.ts";
import { readCoverRequest, mergeCover, CoverError, type AudioEntry } from "./audio-cover.ts";

const root = resolve(import.meta.dirname, "..");
const port = Number(process.env.PORT ?? 5177);
const host = process.env.HOST ?? "127.0.0.1";
const data = resolve(root, process.env.COMFYTURE_DATA ?? "data");
const workflowSet = process.env.COMFYTURE_WORKFLOWS === "dev" ? "workflows/dev" : "workflows";

// No base URL and no key: talk to a local ComfyUI through comfy-api-proxy's default port.
if (!process.env.COMFY_BASE_URL?.trim() && !process.env.COMFY_API_KEY?.trim()) {
  process.env.COMFY_BASE_URL = "http://127.0.0.1:8189";
}
const base = process.env.COMFY_BASE_URL?.trim() || "https://cloud.comfy.org";
const target = { kind: new URL(base).hostname === "cloud.comfy.org" ? "comfy-cloud" : "self-hosted", url: base };

const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const repository: string | undefined = typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url;

let presets = new Map<string, Preset>();
// the LoRAs a take can be rolled with (workflows/video-loras.json)
const videoLoras: (VideoLora & { name: string; about: string; source: string })[] = JSON.parse(await readFile(join(root, "workflows", "video-loras.json"), "utf8")).loras;
/** The LoRAs a request asks for, by id, each at a strength within reason; three at most. */
function parseLoras(v: unknown): VideoLora[] {
  if (!Array.isArray(v)) return [];
  const out: VideoLora[] = [];
  for (const x of v.slice(0, 3)) {
    const l = videoLoras.find((k) => k.id === (typeof x === "string" ? x : x?.id));
    if (l && !out.some((o) => o.id === l.id)) out.push({ id: l.id, kind: l.kind, file: l.file, words: l.words, strength: num(typeof x === "string" ? undefined : x?.strength, 0, 2, l.strength) });
  }
  return out;
}
async function reloadPresets() {
  presets = new Map((await loadPresets(join(root, "presets"))).map((p) => [p.id, p]));
}

const exec = promisify(execFile);
/** Reels are cut with ffmpeg when it is installed; without it the feature stays hidden. */
const ffmpeg = await exec("ffmpeg", ["-version"]).then(() => true, () => false);
/** Utensils' free edit tools (trim, reframe, speed, captions...): ffmpeg on this machine, jobs with progress. */
const edit = createEdit({ data, root });
/** Utensils' free effects (green screen, stabilise, slow motion, weather, particles, a spot removed, clean and master a sound, a mix): ffmpeg here. */
const fx = createFx({ data, root, keepAudio: (bytes, ext, meta) => keepAudio(bytes, ext, meta) });
/** Utensils' Templates: the official ComfyUI workflows, browsed and run on Comfy Cloud (COMFYTURE_FAKE_TEMPLATES=1 swaps the paid calls for a stand-in). */
const cloudKey = process.env.COMFY_API_KEY?.trim();
const templates = createTemplates({
  data,
  root,
  cloud: cloudKey ? (process.env.COMFYTURE_FAKE_TEMPLATES ? fakeRun(realCloud(cloudKey)) : realCloud(cloudKey)) : null,
  keepAudio: (bytes, ext, meta) => keepAudio(bytes, ext, meta),
});

const library = target.kind === "comfy-cloud" && process.env.COMFY_API_KEY?.trim() ? new CloudLibrary(process.env.COMFY_API_KEY.trim()) : null;
const engine = new Engine(
  new Comfy({ clientInfo: "comfyture/0.1" }),
  { data, workflows: join(root, workflowSet) },
  library ? (graph) => library.resolve(graph) : undefined,
  { black: workflowSet !== "workflows/dev", ffmpeg },
);
// the Image window's models are the official templates, in every workflow set
const images = new ImageModels(join(root, "workflows"));
engine.images = images;

// ---------------------------------------------------------------- helpers

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

const bad = (message: string, status = 400) => Object.assign(new Error(message), { status });

async function body(req: IncomingMessage, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw bad("Upload is too large.", 413);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function jsonBody(req: IncomingMessage, limit = 256 * 1024) {
  try {
    return JSON.parse((await body(req, limit)).toString("utf8") || "{}");
  } catch {
    throw bad("The request body is not valid JSON.");
  }
}

/** Resolves a URL path inside a folder, or null if it tries to leave it. */
function inside(folder: string, rel: string) {
  const path = normalize(join(folder, decodeURIComponent(rel)));
  return path.startsWith(folder + sep) ? path : null;
}

async function exists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

const VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime", "video/x-matroska"]);
const VIDEO_MAX_SECONDS = LIMITS.video.seconds;

/** Stores a video once, normalized: 24 fps (the rate LTX-2.5 works in), H.264, at most the size and length limits. */
async function storeVideo(bytes: Buffer) {
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
  await mkdir(join(data, "videos"), { recursive: true });
  const file = `${hash}.mp4`;
  const out = join(data, "videos", file);
  if (!(await exists(out))) {
    const raw = join(data, "videos", `${hash}.upload`);
    await writeFile(raw, bytes);
    try {
      await exec("ffmpeg", ["-v", "error", "-y", "-i", raw, "-t", String(VIDEO_MAX_SECONDS),
        "-vf", `scale='if(gt(iw,ih),min(${LIMITS.video.pixels},iw),-2)':'if(gt(iw,ih),-2,min(${LIMITS.video.pixels},ih))',scale=trunc(iw/2)*2:trunc(ih/2)*2,fps=24,format=yuv420p`,
        "-c:v", "libx264", "-crf", "17", "-preset", "medium", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out], { maxBuffer: 1 << 20 });
    } catch {
      throw bad("That video can't be read.", 415);
    } finally {
      await rm(raw, { force: true });
    }
  }
  return { file, url: `/media/videos/${file}`, ...(await probeVideo(out)) };
}

/** Seconds, size and frame count of a stored video (always 24 fps after upload). */
async function probeVideo(path: string) {
  const { stdout } = await exec("ffprobe", ["-v", "error", "-select_streams", "v:0", "-count_frames", "-show_entries",
    "stream=width,height,nb_read_frames:format=duration", "-of", "json", path]);
  const info = JSON.parse(stdout);
  const v = info.streams?.[0] ?? {};
  return { width: Number(v.width), height: Number(v.height), frames: Number(v.nb_read_frames), duration: Number(info.format?.duration) };
}

const AUDIO_EXT: Record<string, string> = {
  "audio/mpeg": ".mp3", "audio/mp3": ".mp3", "audio/wav": ".wav", "audio/x-wav": ".wav", "audio/wave": ".wav",
  "audio/ogg": ".ogg", "audio/flac": ".flac", "audio/x-flac": ".flac", "audio/mp4": ".m4a", "audio/x-m4a": ".m4a", "audio/aac": ".m4a",
};

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;

/** A file name in the photo library, or undefined. */
async function photo(v: unknown) {
  if (typeof v !== "string" || !v) return undefined;
  const path = inside(join(data, "photos"), v);
  if (!path || !(await exists(path))) throw bad("One of the frames is missing. Add it again.");
  return v;
}

/** A clip from the video library, with its frame count and size read from the file. */
async function clip(v: Record<string, any> | undefined): Promise<ShotRequest["video"]> {
  if (!v || typeof v.file !== "string" || !v.file) return undefined;
  const path = inside(join(data, "videos"), v.file);
  if (!path || !(await exists(path))) throw bad("The video is missing. Add it again.");
  const info = await probeVideo(path);
  if (!(info.frames > 8)) throw bad("That video is too short.");
  return {
    file: v.file,
    mode: v.mode === "motion" ? "motion" : v.mode === "swap" ? "swap" : "extend",
    control: v.mode === "swap" || v.control === "ready" ? "ready" : v.control === "edges" ? "edges" : "pose",
    frames: info.frames,
    width: info.width,
    height: info.height,
    // a trend's take: where in the trend's vocals it starts, and how firmly the control holds
    ...(v.mode === "swap" ? { from: num(v.from, 0, 600, 0), strength: num(v.strength, 0.1, 1, 0.8), ...(typeof v.length === "number" ? { length: Math.round(num(v.length, 9, 257, 257)) } : {}), ...(v.build === "human" ? { build: "human" } : {}) } : {}),
  };
}

function parseShots(v: unknown): Shot[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 4).map((s) => ({
    action: text(s?.action, 1200),
    camera: text(s?.camera, 40),
    cameraText: text(s?.cameraText, 400),
    framing: text(s?.framing, 120),
    sound: text(s?.sound, 600),
    dialogue: Array.isArray(s?.dialogue)
      ? s.dialogue.slice(0, 6).map((d: Record<string, unknown>) => ({
          speaker: text(d?.speaker, 40),
          language: text(d?.language, 40),
          line: text(d?.line, 400),
        })).filter((d: { line: string }) => d.line)
      : [],
    transition: text(s?.transition, 20),
  }));
}

async function audioFile(v: unknown) {
  if (typeof v !== "string" || !v) return undefined;
  const path = inside(join(data, "audio"), v);
  if (!path || !(await exists(path))) throw bad("The audio track is missing. Add it again.");
  return v;
}

async function parseShot(input: Record<string, any>): Promise<{ request: ShotRequest; takes: number; seed?: number }> {
  const seconds = Math.round(num(input.seconds, 2, 10, 5));
  const audio = await audioFile(input.audio?.file);
  const sheet = await photo(input.references?.sheet);
  // the images the sheet was laid out from, so a take's settings can be restored slot by slot
  const refs: Record<string, string> = {};
  const texts: Record<string, string> = {};
  for (const k of ["cast", "prop", "location"]) {
    const file = sheet ? await photo(input.references?.[k]) : undefined;
    if (file) refs[k] = file;
    const what = sheet ? text(input.references?.texts?.[k], 160) : "";
    if (what) texts[k] = what;
  }
  const video = await clip(input.video);
  // an extended clip starts on its own last frames, not on a photo
  const start = video?.mode === "extend" ? undefined : await photo(input.start);
  if (video?.mode === "swap" && (!start || !audio)) throw bad("A trend's take needs its first frame and its sound.");
  const endFile = await photo(input.end?.file);
  const paint = text(input.end?.paint, 600);
  if (paint && !endFile && !start) throw bad("Painting a last frame needs a start frame.");
  const keyframes = [];
  for (const k of Array.isArray(input.keyframes) ? input.keyframes.slice(0, 6) : []) {
    keyframes.push({
      file: (await photo(k?.file))!,
      time: num(k?.time, 0.1, seconds - 0.1, seconds / 2),
      strength: num(k?.strength, 0, 1, 0.7),
    });
  }
  const request: ShotRequest = {
    name: text(input.name, 60) || "Untitled shot",
    preset: presets.has(input.preset) ? input.preset : undefined,
    script: { shots: parseShots(input.script?.shots), raw: text(input.script?.raw, 4000) || undefined },
    start,
    end: endFile ? { file: endFile } : paint ? { paint } : undefined,
    keyframes: keyframes.filter((k) => k.file),
    audio: audio ? { file: audio, lipsync: input.audio?.lipsync === true } : undefined,
    video,
    references: sheet && !video ? { sheet, ...refs, texts, panels: Object.keys(refs).length ? Object.keys(refs) : ["cast", "prop", "location"] } : undefined,
    seconds,
    aspect: ["auto", "16:9", "9:16", "1:1"].includes(input.aspect) ? input.aspect : "auto",
    quality: ["draft", "standard", "production"].includes(input.quality) ? input.quality : "standard",
    enhance: input.enhance === true,
    review: input.review !== false,
    strengths: { start: num(input.strengths?.start, 0, 1, 1), end: num(input.strengths?.end, 0, 1, 0.85) },
    project: projectId(input.project),
    model: typeof input.model === "string" && isRouterVideo(input.model) ? input.model : undefined,
    loras: parseLoras(input.loras),
  };
  const takes = Math.round(num(input.takes, 1, 4, 1));
  const seed = Number.isSafeInteger(input.seed) && input.seed >= 0 ? input.seed : undefined;
  return { request, takes, seed };
}

// about how long LTX-2.5 runs on Comfy Cloud for a five-second shot at 720p, for its price on the picker
const LTX_SHOT_SECONDS = 90;

/** A project's id as the pages send it: the id of the story a film grew from. */
const projectId = (v: unknown) => (typeof v === "string" && /^[\w-]{1,80}$/.test(v) ? v : undefined);
const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);

// ------------------------------------------------------------------ the Stage's saved poses

const posesFile = () => join(data, "control", "poses.json");
async function readPoses(): Promise<{ id: string; name: string; quaternions: Record<string, number[]>; savedAt?: string }[]> {
  try {
    const list = JSON.parse(await readFile(posesFile(), "utf8"));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}
async function writePoses(poses: unknown[]) {
  await mkdir(join(data, "control"), { recursive: true });
  await writeFile(posesFile(), JSON.stringify(poses, null, 1));
}

// ------------------------------------------------------------------ the Stage's imported models

// characters with their rigs and plain props, as people bring them: one file each
const MODEL_EXT = new Set(["glb", "gltf", "vrm", "fbx", "obj"]);
type UserModel = { id: string; name: string; kind: "character" | "prop"; file: string; ext: string; bytes: number; addedAt: string };
const modelsDir = () => join(data, "control", "models");
const modelsFile = () => join(data, "control", "models.json");
async function readModels(): Promise<UserModel[]> {
  try {
    const list = JSON.parse(await readFile(modelsFile(), "utf8"));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}
async function writeModels(list: UserModel[]) {
  await mkdir(join(data, "control"), { recursive: true });
  await writeFile(modelsFile(), JSON.stringify(list, null, 1));
}
/** Whether the bytes look like the format the name says. */
function looksLike(ext: string, b: Buffer) {
  if (ext === "glb" || ext === "vrm") return b.subarray(0, 4).toString("latin1") === "glTF";
  if (ext === "fbx") return b.subarray(0, 18).toString("latin1") === "Kaydara FBX Binary" || /FBX/.test(b.subarray(0, 512).toString("latin1"));
  if (ext === "gltf") return b.subarray(0, 64).toString("utf8").trimStart().startsWith("{");
  return true;
}

// ------------------------------------------------------------------ the Stage's projects

// a stage as its own project: its name, its scene (characters, props, camera, timeline) and a
// small picture of its frame, kept one file each; shared as one file with the user's models in it
type StageFile = { id: string; name: string; createdAt: string; updatedAt: string; scene: unknown; thumb?: string; renders?: unknown[]; project?: string };
/** The pictures rendered from a stage, as the page keeps them (the pictures themselves are in the Library). */
const stageRenders = (v: unknown) => (Array.isArray(v) ? v.filter((r) => r && typeof r === "object").slice(0, 200) : undefined);
const stagesDir = () => join(data, "control", "stages");
const stageId = (s: string) => /^stage-[\w-]{1,80}$/.test(s);
async function readStage(id: string): Promise<StageFile | null> {
  if (!stageId(id)) return null;
  try {
    return JSON.parse(await readFile(join(stagesDir(), `${id}.json`), "utf8"));
  } catch {
    return null;
  }
}
async function writeStage(stage: StageFile) {
  await mkdir(stagesDir(), { recursive: true });
  await writeFile(join(stagesDir(), `${stage.id}.json`), JSON.stringify(stage));
}
async function listStages() {
  let files: string[] = [];
  try {
    files = (await readdir(stagesDir())).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  const all = await Promise.all(files.map((f) => readStage(f.slice(0, -5))));
  const made = (renders: unknown[] = []) => renders.map((r: any) => r?.status === "done" && r.photo?.url ? { url: r.photo.url, at: r.at } : null).filter(Boolean).reverse().slice(0, 8);
  return all.filter((x): x is StageFile => !!x).map(({ id, name, createdAt, updatedAt, thumb, project, renders }) => ({ id, name, createdAt, updatedAt, thumb, project, renders: made(renders) })).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
/** The user's models a scene uses: its rigged characters and its own props. */
function modelsIn(scene: any): string[] {
  const ids = new Set<string>();
  for (const c of scene?.characters ?? []) if (typeof c?.rig === "string") ids.add(c.rig);
  for (const p of scene?.props ?? []) if (typeof p?.type === "string" && /^obj-/.test(p.type)) ids.add(p.type);
  return [...ids];
}
const newStageId = (name: string) => `stage-${slug(name) || "stage"}-${randomBytes(3).toString("hex")}`;
const stageName = (v: unknown, fallback = "Stage") => text(v, 60) || fallback;

/**
 * The projects of a kind that live on the server, one JSON file each: Story's stories and Cut's
 * edits. Each is { id, name, createdAt, updatedAt, thumb?, body }, the body the page's own.
 */
type Project = { id: string; name: string; createdAt: string; updatedAt: string; thumb?: string; body: unknown; project?: string };
const projectsDir = (kind: string) => join(data, kind);
async function readProject(kind: string, id: string): Promise<Project | null> {
  if (!/^[\w-]+$/.test(id)) return null;
  try {
    return JSON.parse(await readFile(join(projectsDir(kind), `${id}.json`), "utf8"));
  } catch {
    return null;
  }
}
async function writeProject(kind: string, p: Project) {
  await mkdir(projectsDir(kind), { recursive: true });
  await writeFile(join(projectsDir(kind), `${p.id}.json`), JSON.stringify(p));
}
async function listProjects(kind: string) {
  const files = (await readdir(projectsDir(kind)).catch(() => [] as string[])).filter((f) => f.endsWith(".json"));
  const all = await Promise.all(files.map((f) => readProject(kind, f.slice(0, -5))));
  return all.filter((x): x is Project => !!x).map(({ id, name, createdAt, updatedAt, thumb, body, project }) => ({ id, name, createdAt, updatedAt, thumb, project, info: summary(kind, body) })).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
/** How far a project has come, for its card on the welcome screen: a story's scenes, shots and frames, an edit's clips. */
function summary(kind: string, body: any) {
  if (kind === "stories") {
    const blocks: any[] = Array.isArray(body?.blocks) ? body.blocks : [];
    const shots = blocks.length ? blocks.filter((b) => b?.kind === "shot") : Array.isArray(body?.board?.shots) ? body.board.shots : [];
    const scenes = blocks.length ? blocks.filter((b) => b?.kind === "scene").length : body?.script?.scenes?.length ?? 0;
    const pic = (s: any) => (s?.still ?? s?.photo)?.url;
    return { logline: text(body?.idea?.logline, 200), scenes, shots: shots.length, drawn: shots.filter((s: any) => s?.photo).length, rolled: shots.filter((s: any) => s?.run).length, cast: body?.cast?.length ?? 0, frames: shots.map(pic).filter(Boolean).slice(0, 8), runs: shots.map((s: any) => s?.run).filter((r: unknown) => typeof r === "string") };
  }
  if (kind === "cuts") {
    const tracks: any[] = Array.isArray(body?.tracks) ? body.tracks : [];
    const main = tracks.find((t) => t?.main)?.items ?? [];
    // an edit another product made for its own video (a Mixer remix, a Jam music video) says which
    return { clips: main.length, titles: tracks.find((t) => t?.kind === "title")?.items?.length ?? 0, sounds: tracks.filter((t) => t?.kind === "audio").reduce((n, t) => n + (t.items?.length ?? 0), 0), product: typeof body?.product === "string" ? body.product : undefined };
  }
  if (kind === "brands") {
    // Macaron's brand: its designs by status, its motion pieces and what it has exported
    const designs: any[] = Array.isArray(body?.designs) ? body.designs.filter((d: any) => !d?.variant) : [];
    return { designs: designs.length, approved: designs.filter((d) => d?.status === "approved").length, motion: Array.isArray(body?.motion) ? body.motion.length : 0, exports: Array.isArray(body?.exports) ? body.exports.length : 0 };
  }
  if (kind === "spice-shots") {
    // Spice's shot: how many departments have made their pass, and what each cost (the panel adds up the day's credits)
    const passes: any[] = Object.values(body?.passes ?? {}).filter((p: any) => p?.media);
    const log: any[] = Array.isArray(body?.log) ? body.log : [];
    return { passes: passes.length, log: log.slice(-60).map((e) => ({ at: String(e?.at ?? ""), credits: Number(e?.credits) || 0 })) };
  }
  return {};
}
/** How long a script or a storyboard may run: a five-minute film needs room for fifteen scenes and their shots. */
const storyRoom = (length: unknown) => Math.round(Math.min(9000, Math.max(3600, (Number(length) || 60) * 30)));

/** A writer's answer from the model the page picked: Claude on Comfy Router, or Gemma 4 inside ComfyUI. */
async function write(model: string, brief: string, prompt: string, opts: { maxLength?: number; temperature?: number; picture?: string } = {}) {
  if (!onRouter(model)) return engine.write(brief, prompt, opts);
  const image = opts.picture ? await imageBlock(engine.photoPath(opts.picture)) : undefined;
  return routerAsk(model, brief, prompt, { maxTokens: Math.max(1024, opts.maxLength ?? 3000), temperature: opts.temperature ?? 0.7, image });
}

/** A pet's answer (Praline's, Truffle's): through its tool on Claude, so it is data; as JSON in plain text on the others. */
async function petAnswer(model: string, brief: string, tool: { name: string; description: string; input_schema: unknown }, prompt: string) {
  const forced = onRouter(model) && takesTools(model);
  const system = forced ? brief : `${brief}\n\nAnswer with JSON only, no other words: {"reply": "...", "actions": [{"op": "...", ...}]}`;
  return onRouter(model)
    ? routerAsk(model, system, prompt, { maxTokens: 3000, temperature: 0.3, ...(forced ? { tool } : {}) })
    : engine.write(system, prompt, { maxLength: 1200, temperature: 0.3 });
}
/** What a pet's page said to it: the last turns as they were, each with what the app did for it. */
function petTurns(messages: unknown) {
  return (Array.isArray(messages) ? messages : []).slice(-12).map((m: any) => ({
    role: m?.role === "assistant" ? "assistant" : "user",
    text: text(m?.text, 1200),
    did: Array.isArray(m?.did) ? m.did.slice(0, 8).map((d: unknown) => text(d, 80)).filter(Boolean) : undefined,
  })).filter((m) => m.text);
}

/** The films rendered in Cut, newest first. */
async function listReels() {
  const dir = join(data, "reels");
  const films: any[] = [];
  for (const name of (await readdir(dir).catch(() => [] as string[])).filter((n) => n.endsWith(".json"))) {
    try {
      films.push(JSON.parse(await readFile(join(dir, name), "utf8")));
    } catch {
      // a film without readable details is skipped
    }
  }
  return films.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

/**
 * The films: a story with everything made for it (the stages its shots were blocked on, its takes,
 * its edits), and every stage or edit made on its own as a film of its own, newest first. A thing
 * made for a story names it (its project); older ones are matched by the names they were given
 * ("Ocean's Glowing Gift — 2A", "1A · Ocean's Glowing Gift").
 */
async function listFilms() {
  const [stories, cuts, stages, reels] = await Promise.all([listProjects("stories"), listProjects("cuts"), listStages(), listReels()]);
  const runs = engine.list();
  const take = (r: any) => ({ id: r.id, name: r.request.name, status: r.status, video: r.video, still: r.request.start ? `/media/photos/${r.request.start}` : r.frame, seconds: r.request.seconds, createdAt: r.createdAt });
  type Film = { id: string; kind: string; name: string; updatedAt: string; thumb?: string; story: any; stages: any[]; cuts: any[]; takes: any[]; reels: any[] };
  const films = new Map<string, Film>();
  const add = (id: string, kind: string, name: string, updatedAt: string) => {
    if (!films.has(id)) films.set(id, { id, kind, name, updatedAt, story: null, stages: [], cuts: [], takes: [], reels: [] });
    return films.get(id)!;
  };
  for (const s of stories) add(s.id, "story", s.name, s.updatedAt).story = s;
  const byName = new Map(stories.map((s) => [s.name.toLowerCase(), s.id]));
  const owner = (project: string | undefined, name: string, pattern?: RegExp) => {
    if (project && films.has(project)) return project;
    const m = pattern ? pattern.exec(name) : null;
    return byName.get((m ? m[1] : name).toLowerCase());
  };
  for (const st of stages) {
    const id = owner(st.project, st.name, /^(.*) — \d+[A-Z]$/);
    (id ? films.get(id)! : add(st.id, "stage", st.name, st.updatedAt)).stages.push(st);
  }
  // Kitchen's films only: the edits Mixer and Jam made for their videos stay with them
  const elsewhere = new Set(cuts.filter((c) => (c.info as any).product).map((c) => c.id));
  for (const c of cuts) {
    if (elsewhere.has(c.id)) continue;
    const id = owner(c.project, c.name);
    (id ? films.get(id)! : add(c.id, "cut", c.name, c.updatedAt)).cuts.push(c);
  }
  // a story's takes: the ones its shots were rolled into, and the ones made from its shots in Shot
  const rolled = new Map(stories.flatMap((s) => ((s.info as any).runs ?? []).map((r: string) => [r, s.id] as const)));
  const placed = new Map<string, string>();
  for (const r of runs) {
    const named = /^\d+[A-Z] · (.+)$/.exec(r.request.name);
    const id = (r.request.project && films.has(r.request.project) ? r.request.project : undefined) ?? rolled.get(r.id) ?? (named ? byName.get(named[1].toLowerCase()) : undefined);
    if (id) films.get(id)!.takes.push(take(r)), placed.set(r.id, id);
  }
  // a film rendered in Cut belongs where its edit (or its takes) are; rendered from loose takes, it is a project of its own
  const ofCut = new Map([...films.values()].flatMap((f) => f.cuts.map((c) => [c.id, f.id] as const)));
  for (const reel of reels) {
    if (reel.cut && elsewhere.has(reel.cut)) continue;
    const id = (reel.cut && ofCut.get(reel.cut)) ?? (reel.takes ?? []).map((t: string) => placed.get(t)).find(Boolean);
    const film = id ? films.get(id)! : add(`film-${reel.id}`, "film", reel.name || "Film", reel.createdAt);
    if (!id) for (const t of reel.takes ?? []) {
      const r = runs.find((x) => x.id === t);
      if (r && !placed.has(t)) film.takes.push(take(r)), placed.set(t, film.id);
    }
    const first = runs.find((x) => x.id === reel.takes?.[0]);
    film.reels.push({ id: reel.id, url: reel.url, name: reel.name, seconds: reel.seconds, createdAt: reel.createdAt, still: first ? take(first).still : undefined });
  }
  return [...films.values()].map((f) => {
    const info = (f.story?.info ?? {}) as any;
    const { runs: _runs, ...story } = info;
    const done = f.takes.filter((t) => t.status === "done" && t.video).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const renders = f.stages.flatMap((s) => s.renders ?? []).sort((a: any, b: any) => String(b.at).localeCompare(String(a.at)));
    const frames: string[] = info.frames ?? [];
    // what each section has made: the storyboard, the stages' renders, the takes, the films
    const outputs = {
      story: { count: info.drawn ?? frames.length, pic: frames[0] },
      stage: { count: renders.length, pic: renders[0]?.url },
      shot: { count: done.length, pic: done[0]?.still, video: done[0]?.video, seconds: done[0]?.seconds, id: done[0]?.id },
      cut: { count: f.reels.length, pic: f.reels[0]?.still, video: f.reels[0]?.url, seconds: f.reels[0]?.seconds },
    };
    // the cover: the finished film if there is one, else the newest output down the line
    const cover = f.reels[0] ? { kind: "film", pic: f.reels[0].still, video: f.reels[0].url, seconds: f.reels[0].seconds }
      : done[0] ? { kind: "take", pic: done[0].still, video: done[0].video, seconds: done[0].seconds }
      : renders[0] ? { kind: "render", pic: renders[0].url }
      : frames.length ? { kind: "storyboard", pic: frames[frames.length - 1] }
      : { kind: f.kind, pic: f.story?.thumb ?? f.stages.find((x) => x.thumb)?.thumb ?? f.cuts.find((x) => x.thumb)?.thumb };
    const times = [f.updatedAt, ...f.stages.map((x) => x.updatedAt), ...f.cuts.map((x) => x.updatedAt), ...f.takes.map((x) => x.createdAt), ...f.reels.map((x) => x.createdAt)].filter(Boolean).sort();
    return {
      id: f.id, kind: f.kind, name: f.name,
      updatedAt: times.at(-1) ?? f.updatedAt,
      cover, outputs,
      story: f.story ? { id: f.story.id, name: f.story.name, thumb: f.story.thumb, updatedAt: f.story.updatedAt, ...story } : null,
      stages: f.stages.map(({ id, name, thumb }) => ({ id, name, thumb })),
      cuts: f.cuts.map(({ id, name, thumb }) => ({ id, name, thumb })),
      takes: done.slice(0, 12),
      reels: f.reels,
      counts: { scenes: info.scenes ?? 0, shots: info.shots ?? 0, drawn: info.drawn ?? 0, stages: f.stages.length, renders: renders.length, takes: done.length, cuts: f.cuts.length, films: f.reels.length },
    };
  }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** GET/POST /api/<kind>, GET/PUT/DELETE /api/<kind>/<id>: answers when the path is one of these. */
async function projectRoute(kind: string, path: string, method: string, req: IncomingMessage, res: ServerResponse) {
  if (path === `/api/${kind}` && method === "GET") return json(res, 200, { [kind]: await listProjects(kind) });
  if (path === `/api/${kind}` && method === "POST") {
    const input = await jsonBody(req, 32 * 1024 * 1024);
    const now = new Date().toISOString();
    const name = text(input.name, 60) || "Untitled";
    const p: Project = { id: `${kind.slice(0, 5)}-${slug(name) || "new"}-${randomBytes(3).toString("hex")}`, name, createdAt: now, updatedAt: now, thumb: typeof input.thumb === "string" ? input.thumb.slice(0, 400_000) : undefined, body: input.body ?? {}, project: projectId(input.project) };
    await writeProject(kind, p);
    return json(res, 201, { project: p });
  }
  const m = new RegExp(`^/api/${kind}/([\\w-]+)$`).exec(path);
  if (!m) return false;
  const p = await readProject(kind, m[1]);
  if (!p) throw bad("No such project.", 404);
  if (method === "GET") return json(res, 200, { project: p });
  if (method === "PUT") {
    const input = await jsonBody(req, 32 * 1024 * 1024);
    if (input.name !== undefined) p.name = text(input.name, 60) || p.name;
    if (input.body !== undefined) p.body = input.body;
    if (typeof input.thumb === "string") p.thumb = input.thumb.slice(0, 400_000);
    p.updatedAt = new Date().toISOString();
    await writeProject(kind, p);
    return json(res, 200, { project: { id: p.id, name: p.name, updatedAt: p.updatedAt } });
  }
  if (method === "DELETE") {
    await rm(join(projectsDir(kind), `${p.id}.json`), { force: true });
    return json(res, 200, { [kind]: await listProjects(kind) });
  }
  return false;
}

// ------------------------------------------------------------------ the audio library

/** Every sound kept: uploads, music, effects and voice lines, with a name, a kind and a length (a song may also have a cover and a video cover: server/audio-cover.ts). */
const audioIndexPath = () => join(data, "audio", "index.json");
async function readAudioIndex(): Promise<Record<string, AudioEntry>> {
  try {
    return JSON.parse(await readFile(audioIndexPath(), "utf8"));
  } catch {
    return {};
  }
}
let audioWrite: Promise<unknown> = Promise.resolve();
async function noteAudio(entry: AudioEntry, replace = false) {
  audioWrite = audioWrite.then(async () => {
    const index = await readAudioIndex();
    index[entry.file] = replace ? entry : { ...index[entry.file], ...entry };
    await mkdir(join(data, "audio"), { recursive: true });
    await writeFile(audioIndexPath(), JSON.stringify(index, null, 1));
  });
  await audioWrite;
  return entry;
}
/** How long a sound or a video runs, and whether it has a picture and a sound. */
const probed = new Map<string, Promise<{ duration: number; hasAudio: boolean; hasVideo: boolean; width: number; height: number }>>();
function probeMedia(path: string) {
  if (!probed.has(path)) {
    probed.set(path, exec("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height", "-of", "json", path]).then(({ stdout }) => {
      const j = JSON.parse(stdout);
      const video = (j.streams ?? []).find((x: any) => x.codec_type === "video");
      return { duration: Number(j.format?.duration) || 0, hasAudio: (j.streams ?? []).some((x: any) => x.codec_type === "audio"), hasVideo: !!video, width: Number(video?.width) || 0, height: Number(video?.height) || 0 };
    }).catch(() => ({ duration: 0, hasAudio: false, hasVideo: false, width: 0, height: 0 })));
  }
  return probed.get(path)!;
}
/** A sound into the library: its bytes kept by their hash, its name and kind noted. */
async function keepAudio(bytes: Buffer, ext: string, meta: { name: string; kind: string; prompt?: string }) {
  const file = `${createHash("sha256").update(bytes).digest("hex").slice(0, 16)}${ext}`;
  const path = join(data, "audio", file);
  await mkdir(join(data, "audio"), { recursive: true });
  if (!(await exists(path))) await writeFile(path, bytes);
  const seconds = Math.round((await probeMedia(path)).duration * 100) / 100;
  return noteAudio({ file, url: `/media/audio/${file}`, name: text(meta.name, 60) || meta.kind, kind: meta.kind, seconds, prompt: meta.prompt, createdAt: new Date().toISOString() });
}

// ------------------------------------------------------------------ a cut, rendered

/** The lyric face: bundled, so the subtitles read the same on every machine (libass looks in a folder of fonts for it). */
const LYRIC_FONT_FILE = join(root, "web", "fonts", "comfyture-lyric.ttf");
/** The first font on this machine drawtext can use, for titles (the lyric face when none of the usual ones is there). */
const TITLE_FONTS = ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf", "/System/Library/Fonts/Supplemental/Arial Bold.ttf", "/Library/Fonts/Arial Bold.ttf", "C:/Windows/Fonts/arialbd.ttf", LYRIC_FONT_FILE];
let titleFont: Promise<string | null> | null = null;
const findFont = () => (titleFont ??= (async () => {
  for (const f of TITLE_FONTS) if (await exists(f)) return f;
  return null;
})());
/** Whether this ffmpeg can draw subtitles (libass), so lyrics are drawn word by word. */
let subtitles: Promise<boolean> | null = null;
const canSubtitle = () => (subtitles ??= exec("ffmpeg", ["-hide_banner", "-filters"]).then(({ stdout }) => /\bass\b/.test(stdout), () => false));

/** The stickers Jam ships: their ids, for the assistant to name them by. */
async function stickerIds(): Promise<string[]> {
  try {
    const list = JSON.parse(await readFile(join(root, "web", "brand", "jam", "stickers", "stickers.json"), "utf8"));
    return (Array.isArray(list.stickers) ? list.stickers : []).map((x: any) => String(x.id)).filter((id: string) => /^[\w-]+$/.test(id));
  } catch {
    return [];
  }
}

/** Where a timeline item's file is: a take, a film, an uploaded video, a picture, a sound, or a sticker of ours. */
function itemPath(src: CutItem["src"]) {
  const id = String(src?.id ?? src?.file ?? "");
  if (!/^[\w.-]+$/.test(id)) return null;
  if (src?.kind === "take") return join(data, "runs", id, "shot.mp4");
  if (src?.kind === "film") return join(data, "reels", `${id}.mp4`);
  if (src?.kind === "video") return join(data, "videos", id);
  if (src?.kind === "photo") return engine.photoPath(id);
  if (src?.kind === "audio") return join(data, "audio", id);
  if (src?.kind === "sticker") return join(root, "web", "brand", "jam", "stickers", `${id}.png`);
  return null;
}

/** Renders a cut's timeline into a film in the Library: picture and sound apart, then joined. */
/** What ffmpeg's failure says, in a few words: its last lines, else that it took too long, else how it ended (never the whole command, never nothing). */
function whyFfmpegFailed(e: any): string {
  const said = String(e?.stderr ?? "").split("\n").map((l) => l.trim()).filter(Boolean).slice(-2).join(" ").slice(0, 300);
  if (said) return said;
  if (e?.killed || e?.signal) return e?.killed ? "it did not finish in time and was stopped" : `it was stopped (${e.signal})`;
  if (e?.code !== undefined) return `ffmpeg ended with code ${e.code}`;
  return String(e?.message ?? "ffmpeg ended without saying why").split("\n")[0].slice(0, 200);
}

async function renderCut(project: { id: string; name: string; body: any }) {
  const body = project.body as CutBody;
  if (!Array.isArray(body?.tracks)) throw bad("This cut has no timeline.");
  const sources = new Map<string, Source>();
  for (const t of body.tracks) {
    for (const it of t.items ?? []) {
      if (t.kind === "title" || t.kind === "fx") continue;
      // a plain colour stands in for a picture that is not made yet
      if (it.src?.kind === "color") {
        const hex = /^#?([0-9a-f]{6})$/i.exec(String(it.src.id ?? ""));
        if (hex) sources.set(it.id, { path: "", still: true, hasAudio: false, duration: 3600, color: `#${hex[1]}` });
        continue;
      }
      const path = itemPath(it.src);
      if (!path || !(await exists(path))) continue;
      const still = it.src?.kind === "photo" || it.src?.kind === "sticker";
      const m = still ? { duration: 3600, hasAudio: false } : await probeMedia(path);
      sources.set(it.id, { path, still, hasAudio: m.hasAudio, duration: m.duration });
    }
  }
  // the film's frame is its aspect's shape, as large as the first clip (kept as it is when it is that shape already)
  const main = body.tracks.find((t) => t.kind === "video" && t.main) ?? body.tracks.find((t) => t.kind === "video");
  const firstVideo = main?.items.map((it) => sources.get(it.id)).find((x) => x && !x.still && x.path);
  const native = firstVideo ? await probeMedia(firstVideo.path) : null;
  const { width, height } = frameSize(body.aspect, native);
  const id = `${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomBytes(3).toString("hex")}`;
  await mkdir(join(data, "reels"), { recursive: true });
  const work = join(data, "reels", `${id}.work`);
  await mkdir(work, { recursive: true });
  try {
    const plan = planCut(body, (it) => sources.get(it.id) ?? null, { width, height, font: await findFont(), titleFile: (i) => join(work, `title-${i}.txt`), ass: await canSubtitle() });
    // each title line's words in a file of its own, so no text is ever escaped into the graph
    await Promise.all(plan.texts.map((line, i) => writeFile(join(work, `title-${i}.txt`), line)));
    // the lyrics' subtitles, and the face they are drawn in, where ffmpeg runs
    if (plan.ass) {
      await mkdir(join(work, "fonts"), { recursive: true });
      await writeFile(join(work, "lyrics.ass"), plan.ass);
      // every face a caption style may be drawn in (the lyric face, the typewriter's, the handwriting, the comic's)
      for (const file of LYRIC_FILES) await copyFile(join(root, "web", "fonts", file), join(work, "fonts", file));
    }
    const picture = join(work, "picture.mp4");
    const sound = join(work, "sound.m4a");
    const out = join(data, "reels", `${id}.mp4`);
    const args = ffmpegArgs(plan, { picture, sound, script: join(work, "graph.txt") });
    if (args.long) await writeFile(join(work, "graph.txt"), plan.video);
    // a render that hangs is stopped, not waited on forever; when one of the two (the picture, the sound) fails the other is stopped too,
    // and both are done with before the work folder goes (a sibling left running would write into a folder that is not there, for good)
    const stop = new AbortController();
    const limit = { maxBuffer: 1 << 22, timeout: 20 * 60 * 1000, cwd: work, killSignal: "SIGKILL" as const, signal: stop.signal };
    const settled = await Promise.allSettled([args.picture, args.sound].map((a) => exec("ffmpeg", a, limit).catch((e) => (stop.abort(), Promise.reject(e)))));
    const failed = settled.find((r): r is PromiseRejectedResult => r.status === "rejected" && r.reason?.name !== "AbortError") ?? settled.find((r): r is PromiseRejectedResult => r.status === "rejected");
    if (failed) throw new Error(`The film didn't render: ${whyFfmpegFailed(failed.reason)}`);
    await exec("ffmpeg", ["-v", "error", "-y", "-i", picture, "-i", sound, "-c", "copy", "-movflags", "+faststart", out], { maxBuffer: 1 << 20 });
    const takes = body.tracks.flatMap((t) => t.items).filter((it) => it.src?.kind === "take").map((it) => String(it.src!.id));
    const film = { id, url: `/media/reels/${id}.mp4`, name: text(project.name, 60) || "Film", takes: [...new Set(takes)], cut: project.id, seconds: Math.round(plan.seconds * 10) / 10, createdAt: new Date().toISOString() };
    await writeFile(join(data, "reels", `${id}.json`), JSON.stringify(film, null, 2));
    return film;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

/** Every picture on a scene's sheets (its characters' and pieces'), each once. */
function sheetRefs(scene: any): any[] {
  const refs = [...(scene?.characters ?? []), ...(scene?.props ?? [])].flatMap((t: any) => (Array.isArray(t?.tag?.refs) ? t.tag.refs : []));
  return refs.filter((r: any) => typeof r?.file === "string" && /^[\w.-]+$/.test(r.file));
}

/** A stage file someone shared, kept as a new stage: its scene, and the models of theirs it uses. */
async function importStage(input: any, when = new Date()) {
  if (input?.format !== "comfyture-stage" || !input.scene) throw bad("That is not a Comfyture stage file.");
  const known = await readModels();
  for (const m of Array.isArray(input.models) ? input.models : []) {
    const entry = m?.entry;
    if (!entry || typeof m.data !== "string" || !/^(rig|obj)-[\w-]+$/.test(entry.id) || !MODEL_EXT.has(entry.ext)) continue;
    if (known.some((k) => k.id === entry.id)) continue;
    const bytes = Buffer.from(m.data, "base64");
    if (!looksLike(entry.ext, bytes)) continue;
    await mkdir(modelsDir(), { recursive: true });
    await writeFile(join(modelsDir(), `${entry.id}.${entry.ext}`), bytes);
    known.push({ id: entry.id, name: text(entry.name, 60) || entry.id, kind: entry.kind === "character" ? "character" : "prop", file: `${entry.id}.${entry.ext}`, ext: entry.ext, bytes: bytes.length, addedAt: new Date().toISOString() });
  }
  await writeModels(known);
  const now = when.toISOString();
  const name = stageName(input.name, "Shared stage");
  // the pictures on its sheets: each into the Library, the sheets pointing at them
  const kept = new Map<string, { file: string; url: string; width: number; height: number }>();
  for (const pic of Array.isArray(input.pictures) ? input.pictures.slice(0, 200) : []) {
    if (typeof pic?.file !== "string" || typeof pic.data !== "string" || kept.has(pic.file)) continue;
    try {
      const photo = await engine.storeImage(Buffer.from(pic.data, "base64"), text(pic.name, 60) || `${name} sheet`);
      kept.set(pic.file, { file: photo.file, url: photo.url, width: photo.width, height: photo.height });
    } catch {}
  }
  for (const t of [...(input.scene.characters ?? []), ...(input.scene.props ?? [])] as any[]) {
    if (Array.isArray(t?.tag?.refs)) t.tag.refs = t.tag.refs.map((r: any) => kept.get(r?.file) ?? null).filter(Boolean);
  }
  // the renders that came with it: each picture into the Library, its run pointing at it (and at the sheets it sent)
  const renders = [];
  for (const r of Array.isArray(input.renders) ? input.renders.slice(0, 50) : []) {
    if (!r || typeof r.data !== "string") continue;
    try {
      const photo = await engine.storeImage(Buffer.from(r.data, "base64"), `${name} render`);
      const { data: _data, frame: _frame, ...run } = r;
      if (Array.isArray(run.settings?.refs)) run.settings = { ...run.settings, refs: run.settings.refs.map((x: any) => (kept.has(x?.file) ? { ...x, ...kept.get(x.file) } : x)) };
      renders.push({ ...run, status: "done", photo: { file: photo.file, url: photo.url, width: photo.width, height: photo.height } });
    } catch {}
  }
  const stage: StageFile = { id: newStageId(name), name, createdAt: now, updatedAt: now, scene: input.scene, thumb: typeof input.thumb === "string" ? input.thumb.slice(0, 400_000) : undefined, renders: renders.length ? renders : undefined };
  await writeStage(stage);
  return { stage, models: known };
}

// the first time the Stage opens, the example stages are there to open, change and delete;
// after that the folder is the user's, and a deleted example stays deleted
let seeding: Promise<void> | null = null;
async function seedStages() {
  if (await access(stagesDir()).then(() => true, () => false)) return;
  await mkdir(stagesDir(), { recursive: true });
  const dir = join(root, "stages");
  const files = (await readdir(dir).catch(() => [] as string[])).filter((f) => f.endsWith(".stage.json")).sort();
  // the first example is the newest, so it is the one that opens
  const start = Date.now();
  for (const [i, file] of files.entries()) {
    try {
      await importStage(JSON.parse(await readFile(join(dir, file), "utf8")), new Date(start - i * 1000));
    } catch (e) {
      console.warn(`stages: ${file} was not added:`, (e as Error).message);
    }
  }
}

// the brands that come with the app (brands/*.brand.json, Comfyture's own among them) are there to open the
// first time Macaron lists them; one that is deleted stays deleted, so the ids already seeded are kept
let seedingBrands: Promise<void> | null = null;
/**
 * Spice's example shots (spice/examples/<shot>/shot.json beside its clips), put in once: each pass's clip goes into the library of
 * clips (data/videos) so every department can work on it like footage of the person's own, and the shot is written as Spice keeps one.
 * A shot the person took out is not put back (the ids put in are kept in .seeded).
 */
let seedingShots: Promise<void> | null = null;
/** Spice's bakes on their way: the frames sent so far (a folder under edits), the rate, and the clip whose sound goes with them. */
const bakes = new Map<string, { dir: string; at: number; fps: number; frames: number; audio: string; audioFrom: number }>();
async function seedShots() {
  const dir = join(root, "spice", "examples");
  const kept = join(projectsDir("spice-shots"), ".seeded");
  const seeded: string[] = await readFile(kept, "utf8").then((t) => JSON.parse(t), () => []);
  let added = false;
  for (const folder of (await readdir(dir).catch(() => [] as string[])).sort()) {
    try {
      const spec = JSON.parse(await readFile(join(dir, folder, "shot.json"), "utf8"));
      // a newer version of an example (its rev) replaces the one kept only while the person has not touched it; a deleted one stays deleted
      const tag = Number(spec.rev) > 1 ? `${spec.id}@${Number(spec.rev)}` : spec.id;
      if (!/^[\w-]+$/.test(spec.id) || seeded.includes(tag)) continue;
      if (seeded.some((x) => x === spec.id || x.startsWith(`${spec.id}@`))) {
        const kept = await readProject("spice-shots", spec.id);
        if (!kept || kept.updatedAt !== kept.createdAt) {
          seeded.push(tag);
          added = true;
          continue;
        }
      }
      const body: any = spiceBody({ set: spec.set });
      const at = new Date().toISOString();
      let thumb: string | undefined;
      const rev = Number(spec.rev) > 1 ? `-r${Number(spec.rev)}` : "";
      for (const [dept, p] of Object.entries<any>(spec.passes ?? {})) {
        // a pass is a clip (in videos) or a picture (in photos), at the size its spec says
        if (!(dept in body.passes) || !/^[\w.-]+\.(mp4|jpg|png|webp)$/.test(p.file)) continue;
        const ext = p.file.split(".").pop().toLowerCase();
        const pic = ext !== "mp4";
        const file = `${spec.id}-${dept}${rev}.${ext}`;
        await mkdir(join(data, pic ? "photos" : "videos"), { recursive: true });
        await copyFile(join(dir, folder, p.file), join(data, pic ? "photos" : "videos", file));
        const size = { width: Number(p.width) || 720, height: Number(p.height) || 480 };
        const media: any = pic ? { kind: "image", url: `/media/photos/${file}`, file, ...size } : { kind: "video", url: `/media/videos/${file}`, file, ...size, seconds: p.seconds };
        if (pic && dept === "plate") thumb ??= media.url;
        if (p.still && /^[\w.-]+\.(jpg|png|webp)$/.test(p.still)) {
          const still = `${spec.id}-${dept}${rev}.${p.still.split(".").pop()}`;
          await mkdir(join(data, "photos"), { recursive: true });
          await copyFile(join(dir, folder, p.still), join(data, "photos", still));
          media.still = `/media/photos/${still}`;
          thumb ??= media.still;
        }
        const to = pic ? SPICE_FIRST : SPICE_FIRST + Math.max(1, Math.round((Number(p.seconds) || 5) * 24)) - 1;
        body.passes[dept] = dept === "plate"
          ? { media, eye: true, fps: 24, name: String(p.name ?? "Plate"), from: SPICE_FIRST, to, at }
          : { media, eye: true, from: SPICE_FIRST, to, note: String(p.note ?? ""), credits: 0, at, source: p.source === "cloud" ? "cloud" : "free", ...(dept === "roto" ? { type: "matte" } : {}) };
        // Roto's pass is its subject's matte
        const subject = dept === "roto" ? body.set.roto.subjects.find((x: any) => !x.media) : null;
        if (subject) Object.assign(subject, { media, from: SPICE_FIRST, to, stale: false, at, credits: 0 });
      }
      // the clips its FX layers hold (an AI layer's clip), kept in the library beside its passes
      for (const [i, l] of (body.set.fx.layers ?? []).entries()) {
        const raw = spec.set?.fx?.layers?.[i]?.media;
        if (!raw || !/^[\w.-]+\.mp4$/.test(raw.file ?? "")) continue;
        const file = `${spec.id}-layer${i}${rev}.mp4`;
        await copyFile(join(dir, folder, raw.file), join(data, "videos", file));
        l.media = { kind: "video", url: `/media/videos/${file}`, file, width: Number(raw.width) || 720, height: Number(raw.height) || 480, seconds: Number(raw.seconds) || 5 };
      }
      await writeProject("spice-shots", { id: spec.id, name: String(spec.name ?? "Example"), createdAt: at, updatedAt: at, ...(thumb ? { thumb } : {}), body } as Project);
      seeded.push(tag);
      added = true;
    } catch (e) {
      console.warn(`spice: the example ${folder} was not added:`, (e as Error).message);
    }
  }
  // an example that is no longer one (retired): its copy goes from the shots, unless the person has worked on it
  const current = new Set<string>();
  for (const folder of await readdir(dir).catch(() => [] as string[])) {
    const spec = await readFile(join(dir, folder, "shot.json"), "utf8").then((t) => JSON.parse(t), () => null);
    if (spec?.id) current.add(spec.id);
  }
  for (const id of new Set(seeded.map((t) => t.split("@")[0]))) {
    if (current.has(id) || seeded.includes(`${id}@retired`) || !/^[\w-]+$/.test(id)) continue;
    const kept = await readProject("spice-shots", id);
    if (kept && kept.updatedAt === kept.createdAt) await rm(join(projectsDir("spice-shots"), `${id}.json`), { force: true });
    seeded.push(`${id}@retired`);
    added = true;
  }
  if (added) await writeFile(kept, JSON.stringify(seeded));
}

async function seedBrands() {
  const dir = join(root, "brands");
  const kept = join(projectsDir("brands"), ".seeded");
  const seeded: string[] = await readFile(kept, "utf8").then((t) => JSON.parse(t), () => []);
  let added = false;
  for (const file of (await readdir(dir).catch(() => [] as string[])).filter((f) => f.endsWith(".brand.json")).sort()) {
    try {
      const brand: Project = JSON.parse(await readFile(join(dir, file), "utf8"));
      if (!/^[\w-]+$/.test(brand.id)) continue;
      if (seeded.includes(brand.id)) {
        // one an earlier version put in gains what the newer one has, once (never what a person wrote, changed or took out)
        const have = await readProject("brands", brand.id);
        const body = have && topUpBrand(have.body, brand.body);
        if (have && body) await writeProject("brands", { ...have, body, updatedAt: new Date().toISOString() });
        continue;
      }
      seeded.push(brand.id);
      added = true;
      // the newest one is the one that opens
      if (!(await readProject("brands", brand.id))) await writeProject("brands", { ...brand, updatedAt: new Date().toISOString() });
    } catch (e) {
      console.warn(`brands: ${file} was not added:`, (e as Error).message);
    }
  }
  if (added) await writeFile(kept, JSON.stringify(seeded));
}

/**
 * The showcase projects Jam ships (web/brand/jam/projects/<id>/project.json with its media) are
 * copied in the first time they are missing: their media into the library, their video into
 * data/jams and its edit into data/cuts. One a person deletes stays deleted (data/jams/.seeded
 * lists what was copied in), and a showcase added in a later version still comes.
 * project.json: { name, thumb?, jam: the Jam body, cut: { id, name, body }, media: [{ file, to, name?, kind? }] },
 * where `to` is where the file goes in data (audio/…, videos/…, photos/…).
 */
async function seedJams() {
  const dir = join(root, "web", "brand", "jam", "projects");
  const ids = (await readdir(dir, { withFileTypes: true }).catch(() => [])).filter((d) => d.isDirectory() && /^[\w-]+$/.test(d.name)).map((d) => d.name).sort();
  if (!ids.length) return;
  const seededPath = join(projectsDir("jams"), ".seeded");
  // the showcases already put in, each with the version it had then ("id", or "id@2")
  const seeded = new Map<string, number>();
  for (const line of (await readFile(seededPath, "utf8").catch(() => "")).split("\n").filter(Boolean)) {
    const [id, v] = line.split("@");
    seeded.set(id, Number(v) > 1 ? Number(v) : 1);
  }
  for (const id of ids) {
    try {
      const m = JSON.parse(await readFile(join(dir, id, "project.json"), "utf8"));
      const version = Number.isInteger(m.version) && m.version > 1 ? m.version : 1;
      const had = seeded.get(id) ?? 0;
      if (had >= version) continue;
      const jamNow = await readProject("jams", id);
      const cutNow = m.cut?.id && /^[\w-]+$/.test(m.cut.id) ? await readProject("cuts", m.cut.id) : null;
      // a video of that name that did not come from here is the user's; one that did, of an older version, is replaced while nobody has touched it
      const untouched = (p: Project | null) => !p || p.updatedAt === p.createdAt;
      if (jamNow && (!had || !untouched(jamNow) || !untouched(cutNow))) {
        if (had) seeded.set(id, version);
        continue;
      }
      for (const f of Array.isArray(m.media) ? m.media : []) {
        const to = /^(audio|videos|photos)\/[\w.-]+$/.exec(String(f?.to ?? ""));
        const from = String(f?.file ?? "");
        if (!to || !/^[\w./-]+$/.test(from) || from.includes("..")) continue;
        const target = join(data, to[0]);
        await mkdir(join(data, to[1]), { recursive: true });
        // a file of the project's own folder, or one the app already ships (web/brand/...: a trend's sound and dance, a crew picture);
        // an older version's copy is made again (a sound replaced there is the sound here)
        if (had || !(await exists(target))) await copyFile(/^web\/brand\//.test(from) ? join(root, from) : join(dir, id, from), target);
        if (to[1] === "audio") {
          const name = basename(to[0]);
          await noteAudio({ file: name, url: `/media/audio/${name}`, name: text(f.name, 60) || name, kind: text(f.kind, 20) || "music", seconds: Math.round((await probeMedia(target)).duration * 100) / 100, createdAt: new Date().toISOString() });
        }
      }
      const now = new Date().toISOString();
      if (m.cut?.id && /^[\w-]+$/.test(m.cut.id) && (had || !cutNow)) await writeProject("cuts", { id: m.cut.id, name: text(m.cut.name, 60) || text(m.name, 60), createdAt: now, updatedAt: now, body: m.cut.body ?? {} });
      await writeProject("jams", { id, name: text(m.name, 60) || id, createdAt: now, updatedAt: now, thumb: typeof m.thumb === "string" ? m.thumb.slice(0, 400) : undefined, body: m.jam ?? {} });
      seeded.set(id, version);
    } catch (e) {
      console.warn(`jam: the showcase ${id} was not added:`, (e as Error).message);
    }
  }
  await mkdir(projectsDir("jams"), { recursive: true });
  await writeFile(seededPath, [...seeded].map(([id, v]) => (v > 1 ? `${id}@${v}` : id)).join("\n"));
}

// ------------------------------------------------------------------ events

const listeners = new Set<ServerResponse>();
function broadcast(event: string, payload: unknown) {
  const frame = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of listeners) res.write(frame);
}
engine.on("run", (run) => broadcast("run", run));
engine.on("removed", (id) => broadcast("removed", { id }));
engine.on("preview", (id, image) => broadcast("preview", { id, image }));
engine.on("paint", (job) => broadcast("paint", job));

// ------------------------------------------------------------------ routes

async function route(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://local");
  const path = url.pathname;
  const method = req.method ?? "GET";

  if (path === "/api/info" && method === "GET") {
    return json(res, 200, { target: target.kind, url: new URL(target.url).origin, workflows: workflowSet, repository, reels: ffmpeg, llms: { models: llms(), default: defaultLlm("writer"), assistant: defaultLlm("assistant") } });
  }
  if (path === "/api/presets" && method === "GET") {
    if (url.searchParams.has("reload")) await reloadPresets();
    return json(res, 200, [...presets.values()]);
  }
  if (path === "/api/presets" && method === "POST") {
    const input = await jsonBody(req);
    const name = text(input.name, 60);
    const preset: Preset = {
      id: slug(text(input.id, 48) || name),
      name,
      category: CATEGORIES.includes(input.category) ? input.category : "camera",
      blurb: text(input.blurb, 80),
      script: { shots: parseShots(input.script?.shots) },
      end: text(input.end?.paint, 600) ? { paint: text(input.end.paint, 600) } : undefined,
      seconds: Math.round(num(input.seconds, 2, 10, 5)),
    };
    await savePreset(join(root, "presets"), preset);
    await reloadPresets();
    return json(res, 201, presets.get(preset.id));
  }
  if (path === "/api/samples" && method === "GET") {
    const dir = join(root, "samples");
    const files = (await readdir(dir).catch(() => [])).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).sort();
    return json(res, 200, files.map((f) => ({ name: f.replace(/\.\w+$/, ""), url: `/samples/${f}` })));
  }
  if (path === "/api/photos" && method === "GET") {
    // the image library, newest first, with sizes read from each file's header
    const dir = join(data, "photos");
    const names = (await readdir(dir).catch(() => [] as string[])).filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
    const stamped = await Promise.all(names.map(async (file) => ({ file, mtime: (await stat(join(dir, file))).mtimeMs })));
    const photos = [];
    for (const { file, mtime } of stamped.sort((a, b) => b.mtime - a.mtime).slice(0, 160)) {
      const fh = await open(join(dir, file), "r");
      try {
        const head = Buffer.alloc(131072);
        const { bytesRead } = await fh.read(head, 0, head.length, 0);
        const size = imageSize(head.subarray(0, bytesRead));
        if (size) photos.push({ file, url: `/media/photos/${file}`, ...size, name: engine.imageName(file), createdAt: new Date(mtime).toISOString() });
      } finally {
        await fh.close();
      }
    }
    return json(res, 200, photos);
  }
  if (path === "/api/photos" && method === "POST") {
    const sample = url.searchParams.get("sample");
    let bytes: Buffer;
    if (sample) {
      const file = inside(join(root, "samples"), sample);
      if (!file || !(await exists(file))) return json(res, 404, { error: "No such sample." });
      bytes = await readFile(file);
    } else {
      const type = (req.headers["content-type"] ?? "").split(";")[0].trim();
      if (!IMAGE_EXT[type]) throw bad("Use a PNG, JPEG or WebP image.", 415);
      bytes = await body(req, 30 * 1024 * 1024);
    }
    if (!imageSize(bytes)) throw bad("That image can't be read.", 415);
    // a sample keeps its own name ("chef"); an upload, its file's name
    return json(res, 200, await engine.storeImage(bytes, sample ?? (url.searchParams.get("name") || undefined)));
  }
  if (path === "/api/videos" && method === "POST") {
    if (!ffmpeg) throw bad("Videos need ffmpeg on the server.", 501);
    const type = (req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
    if (!VIDEO_TYPES.has(type)) throw bad("Use an MP4, WebM or MOV video.", 415);
    return json(res, 200, await storeVideo(await body(req, 300 * 1024 * 1024)));
  }
  if (path === "/api/videos/from" && method === "POST") {
    // a take or a film from the library, as a video input (the assistant's @take, @film)
    if (!ffmpeg) throw bad("Videos need ffmpeg on the server.", 501);
    const input = await jsonBody(req);
    const id = text(input.run ?? input.film, 40);
    if (!/^[\w-]+$/.test(id)) throw bad("Name a take or a film.");
    const source = input.run ? join(data, "runs", id, "shot.mp4") : join(data, "reels", `${id}.mp4`);
    if (!(await exists(source))) throw bad("That take or film is gone.", 404);
    return json(res, 200, await storeVideo(await readFile(source)));
  }
  if (path === "/api/audio" && method === "GET") {
    // every sound kept, newest first: those noted, and any file on disk from before the index
    const index = await readAudioIndex();
    const files = (await readdir(join(data, "audio")).catch(() => [] as string[])).filter((f) => /\.(mp3|wav|ogg|flac|m4a)$/i.test(f));
    const list: AudioEntry[] = [];
    for (const file of files) {
      const known = index[file];
      if (known) list.push(known);
      else {
        const p = join(data, "audio", file);
        list.push({ file, url: `/media/audio/${file}`, name: file.replace(/\.\w+$/, ""), kind: "upload", seconds: Math.round((await probeMedia(p)).duration * 100) / 100, createdAt: (await stat(p)).mtime.toISOString() });
      }
    }
    return json(res, 200, list.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }
  if (path === "/api/audio/cover" && method === "POST") {
    // a song's cover picture and its video cover (a few seconds of a character performing a part of it): the app's own media, noted on the song
    let ask;
    try {
      ask = readCoverRequest(await jsonBody(req));
    } catch (e) {
      if (e instanceof CoverError) throw bad(e.message);
      throw e;
    }
    const known = (await readAudioIndex())[ask.file];
    const onDisk = join(data, "audio", ask.file);
    if (!known && !(await exists(onDisk))) throw bad("That song is not in the library.", 404);
    for (const u of [ask.cover, ask.video]) {
      const there = u ? inside(data, u.slice("/media/".length)) : null;
      if (u && (!there || !(await exists(there)))) throw bad("That picture or clip is not kept by the app.");
    }
    const entry: AudioEntry = known ?? { file: ask.file, url: `/media/audio/${ask.file}`, name: ask.file.replace(/\.\w+$/, ""), kind: "upload", seconds: Math.round((await probeMedia(onDisk)).duration * 100) / 100, createdAt: (await stat(onDisk)).mtime.toISOString() };
    return json(res, 200, await noteAudio(mergeCover(entry, ask), true));
  }
  if ((path === "/api/audio/music" || path === "/api/audio/sound") && method === "POST") {
    const input = await jsonBody(req);
    const prompt = text(input.prompt, 800);
    if (!prompt) throw bad(path.endsWith("music") ? "Say what the music is like." : "Say what the sound is.");
    const music = path.endsWith("music");
    const seconds = num(input.seconds, 1, music ? 240 : 30, music ? 30 : 6);
    const name = text(input.name, 60) || prompt.slice(0, 40);
    const job = engine.audioJob(music ? "music" : "sfx", { prompt, seconds, lyrics: text(input.lyrics, 2000), bpm: num(input.bpm, 40, 220, 100), seed: randomBytes(4).readUInt32BE(0) }, async (bytes) => {
      const kept = await keepAudio(bytes, ".mp3", { name, kind: music ? "music" : "sound", prompt });
      return { file: kept.file, url: kept.url, seconds: kept.seconds, name: kept.name, kind: kept.kind };
    });
    return json(res, 202, job);
  }
  if (path === "/api/audio/song" && method === "POST") {
    // a song from ACE-Step 1.5 XL (three passes): its style as tags, its lyrics in sections, its tempo, key, language and time signature
    const input = await jsonBody(req);
    const tags = text(input.tags, 800);
    if (!tags) throw bad("Say what the song is like.");
    const seconds = num(input.seconds, 10, MAX_SECONDS, DEFAULT_SONG.seconds);
    const name = text(input.name, 60) || tags.slice(0, 40);
    const job = engine.audioJob("song", {
      prompt: tags,
      seconds,
      lyrics: text(input.lyrics, 3000),
      bpm: num(input.bpm, 40, 220, DEFAULT_SONG.bpm),
      key: KEYS.includes(input.key) ? input.key : DEFAULT_SONG.key,
      language: LANGUAGES.some((l) => l.value === input.language) ? input.language : "en",
      timesignature: SIGNATURES.some((s) => s.value === String(input.timesignature)) ? String(input.timesignature) : "4",
      passes: input.passes === 1 ? 1 : 3,
      temperature: Math.min(1.2, Math.max(0.3, Number(input.temperature) || DEFAULT_SONG.temperature)),
      adherence: Math.min(6, Math.max(1, Number(input.adherence) || DEFAULT_SONG.adherence)),
      thinking: input.thinking !== false,
      // (a seed that is kept makes the same song again from the same words)
      seed: Number.isInteger(input.seed) && input.seed > 0 ? Math.min(input.seed, 2 ** 32 - 4) : randomBytes(4).readUInt32BE(0) % (2 ** 32 - 4),
    }, async (bytes) => {
      const kept = await keepAudio(bytes, ".mp3", { name, kind: "music", prompt: tags });
      return { file: kept.file, url: kept.url, seconds: kept.seconds, name: kept.name, kind: kept.kind };
    });
    return json(res, 202, job);
  }
  if (path === "/api/audio/song/write" && method === "POST") {
    // Pickle sets a song up from an idea (and what is there already): a short writer answer, no song is made
    const input = await jsonBody(req);
    const seconds = num(input.seconds, 10, MAX_SECONDS, DEFAULT_SONG.seconds);
    const language = LANGUAGES.some((l) => l.value === input.language) ? input.language : "en";
    const reply = await write(pickLlm(input.model), SONG_BRIEF, songPrompt({ ...input, seconds, language }), { maxLength: 2200, temperature: 0.8 });
    return json(res, 200, readSong(reply, seconds, language));
  }
  if (path === "/api/audio/from" && method === "POST") {
    // a take's own sound (a voice line LTX-2.5 said) into the library
    if (!ffmpeg) throw bad("Taking the sound from a take needs ffmpeg on the server.", 501);
    const input = await jsonBody(req);
    const run = engine.get(String(input.run ?? ""));
    if (!run || run.status !== "done") throw bad("That take isn't finished.");
    const src = join(data, "runs", run.id, "shot.mp4");
    const tmp = join(data, "audio", `${run.id}.voice.mp3`);
    await mkdir(join(data, "audio"), { recursive: true });
    const from = num(input.from, 0, 60, 0);
    const to = input.to === undefined ? undefined : num(input.to, from + 0.1, 60, from + 5);
    try {
      await exec("ffmpeg", ["-v", "error", "-y", "-ss", String(from), ...(to ? ["-to", String(to)] : []), "-i", src, "-vn", "-ac", "2", "-ar", "48000", "-b:a", "192k", tmp], { maxBuffer: 1 << 20 });
      const bytes = await readFile(tmp);
      return json(res, 200, await keepAudio(bytes, ".mp3", { name: text(input.name, 60) || `${run.request.name} sound`, kind: text(input.kind, 20) || "voice", prompt: text(input.prompt, 300) }));
    } catch (e) {
      throw bad(`That take's sound couldn't be read: ${(e as Error).message.slice(0, 120)}`);
    } finally {
      await rm(tmp, { force: true });
    }
  }
  if (path === "/api/cut/assist" && method === "POST") {
    // the editor's assistant: Gemma 4 reads the edit and answers with the changes to make
    const input = await jsonBody(req, 2 * 1024 * 1024);
    const turns = (Array.isArray(input.messages) ? input.messages : []).map((m: any) => ({ role: m?.role === "assistant" ? "assistant" : "user", text: text(m?.text, 1200) })).filter((m: any) => m.text);
    if (!turns.length) throw bad("Say what to change.");
    // asked from Jam, it is Pickle's: Jam's work only, and what costs credits is left to the keys
    const brief = input.product === "jam" ? jamBrief(await stickerIds()) : cutBrief();
    const reply = await write(pickLlm(input.model), brief, cutPrompt(input.cut, turns), { maxLength: 1600, temperature: 0.4 });
    return json(res, 200, readCutAnswer(reply, input.product === "jam" ? "jam" : undefined));
  }
  const cutRender = /^\/api\/cuts\/([\w-]+)\/render$/.exec(path);
  if (cutRender && method === "POST") {
    if (!ffmpeg) throw bad("Films need ffmpeg on the server.", 501);
    const project = await readProject("cuts", cutRender[1]);
    if (!project) throw bad("No such cut.", 404);
    return json(res, 201, await renderCut(project));
  }
  if (path === "/api/audio" && method === "POST") {
    const type = (req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
    if (VIDEO_TYPES.has(type)) {
      // a video's own sound becomes the track (a voice to lip-sync to, or music)
      if (!ffmpeg) throw bad("Taking the sound from a video needs ffmpeg on the server.", 501);
      const bytes = await body(req, 300 * 1024 * 1024);
      const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
      const file = `${hash}.mp3`;
      const path = join(data, "audio", file);
      if (!(await exists(path))) {
        const raw = join(data, "audio", `${hash}.upload`);
        await writeFile(raw, bytes);
        try {
          await exec("ffmpeg", ["-v", "error", "-y", "-i", raw, "-vn", "-ac", "2", "-ar", "48000", "-b:a", "192k", path], { maxBuffer: 1 << 20 });
        } catch {
          throw bad("That video has no sound I can read.", 415);
        } finally {
          await rm(raw, { force: true });
        }
      }
      return json(res, 200, { file, url: `/media/audio/${file}` });
    }
    const ext = AUDIO_EXT[type];
    if (!ext) throw bad("Use an MP3, WAV, OGG, FLAC or M4A file, or a video with sound.", 415);
    const bytes = await body(req, 25 * 1024 * 1024);
    const kept = await keepAudio(bytes, ext, { name: url.searchParams.get("name") || "Sound", kind: url.searchParams.get("kind") || "upload" });
    return json(res, 200, kept);
  }
  if (path === "/api/paint" && method === "POST") {
    const input = await jsonBody(req);
    const source = await photo(input.source);
    const instruction = text(input.instruction, 600);
    if (!source) throw bad("Add a start frame to paint from.");
    if (!instruction) throw bad("Describe the frame to paint.");
    return json(res, 202, engine.paint(source, instruction, Number.isSafeInteger(input.seed) ? input.seed : undefined));
  }
  if (path === "/api/generate" && method === "POST") {
    const input = await jsonBody(req);
    const prompt = text(input.prompt, 1200);
    if (!prompt) throw bad("Describe the image.");
    const aspect = ["3:2", "16:9", "9:16", "1:1"].includes(input.aspect) ? input.aspect : "3:2";
    return json(res, 202, engine.generate(prompt, aspect, Number.isSafeInteger(input.seed) ? input.seed : undefined));
  }
  // the video models that roll the shots: LTX-2.5 in ComfyUI, then the partners' on Comfy Router
  if (path === "/api/video/loras" && method === "GET") return json(res, 200, { loras: videoLoras.map(({ id, kind, name, about, words, strength, source }) => ({ id, kind, name, about, words, strength, source })) });
  if (path === "/api/video/models" && method === "GET") {
    return json(res, 200, { default: "ltx-2.5", models: [{ id: "ltx-2.5", name: "LTX-2.5", short: "LTX-2.5", about: "Open weights: picture and sound in one pass", maker: "open", router: false, seconds: LTX_SHOT_SECONDS, sound: true }, ...routerVideos()] });
  }
  if (path === "/api/image/models" && method === "GET") {
    await images.ready;
    // the open-weights models in ComfyUI, then the partners' on Comfy Router
    const list = images.list();
    return json(res, 200, { ...list, models: [...list.models, ...routerImages()] });
  }
  if ((path === "/api/image" || path === "/api/image/enhance") && method === "POST") {
    const input = await jsonBody(req);
    const prompt = text(input.prompt, path === "/api/image" ? 6000 : 1500);
    if (!prompt) throw bad("Describe the image.");
    // references in order, each with the @name the prompt calls it by
    const refs: string[] = [];
    const names: string[] = [];
    for (const r of (Array.isArray(input.refs) ? input.refs : []).slice(0, 10)) {
      const file = await photo(typeof r === "string" ? r : r?.file);
      if (!file || refs.includes(file)) continue;
      refs.push(file);
      names.push(text(r?.name, 40).toLowerCase());
    }
    await images.ready;
    const model = text(input.model, 40) || images.list().default;
    const template = ["generate", "edit", "style"].includes(input.template) ? input.template : "generate";
    if (isRouterImage(model)) {
      if (path === "/api/image/enhance") return json(res, 200, { prompt });
      // "auto" follows the first reference's shape, to the nearest frame there is
      let aspect = input.aspect in ASPECTS ? input.aspect : "1:1";
      const first = refs[0] ? imageSize(await readFile(engine.photoPath(refs[0]))) : null;
      if (input.aspect === "auto" && first) aspect = Object.entries(ASPECTS).reduce((a, b) => (Math.abs(Math.log(b[1] / (first.width / first.height))) < Math.abs(Math.log(a[1] / (first.width / first.height))) ? b : a))[0];
      const pics = template === "generate" ? [] : await Promise.all(refs.map(async (f) => imageBlock(engine.photoPath(f))));
      const count = Math.round(num(input.count, 1, 4, 1));
      const seed = Number.isSafeInteger(input.seed) && input.seed >= 0 ? input.seed : randomBytes(4).readUInt32BE(0);
      const name = text(input.name, 80) || prompt;
      const jobs = Array.from({ length: count }, (_, i) =>
        engine.externalPhotoJob(name, async () => (await routerDraw(model, { prompt, aspect, refs: pics.map((p) => ({ mime: p.type, data: p.data })), names, seed: seed + i })).bytes));
      return json(res, 202, jobs);
    }
    try {
      images.pick(model, template);
    } catch (error) {
      throw bad((error as Error).message);
    }
    const aspect = input.aspect === "auto" || input.aspect in ASPECTS ? input.aspect : "1:1";
    if (path === "/api/image/enhance") return json(res, 200, { prompt: await engine.enhanceImage({ model, template, prompt, aspect, refs, names }) });
    const jobs = await engine.image({
      model,
      template,
      prompt,
      aspect,
      refs,
      names,
      loras: (Array.isArray(input.loras) ? input.loras : []).slice(0, 3).map((l: Record<string, any>) => ({ file: text(l?.file, 200), strength: Number(l?.strength) })).filter((l: { file: string }) => l.file),
      megapixels: num(input.megapixels, 0.5, 4, 1),
      count: Math.round(num(input.count, 1, 4, 1)),
      seed: Number.isSafeInteger(input.seed) && input.seed >= 0 ? input.seed : randomBytes(4).readUInt32BE(0),
      // what the Library calls the picture, when the prompt's first words would not say it
      name: text(input.name, 80) || undefined,
      // an edit that starts from its first reference keeps that reference's layout (the Stage's render)
      keep: Number.isFinite(input.keep) ? Math.min(0.98, Math.max(0.5, input.keep)) : undefined,
    });
    return json(res, 202, jobs);
  }
  if (path === "/api/assistant" && method === "POST") {
    const input = await jsonBody(req);
    const turns: Turn[] = (Array.isArray(input.messages) ? input.messages : [])
      .slice(-12)
      .map((t: Record<string, any>) => ({
        role: t?.role === "assistant" ? "assistant" : "user",
        text: text(t?.text, 1500),
        did: Array.isArray(t?.did) ? t.did.slice(0, 12).map((d: unknown) => text(d, 60)).filter(Boolean) : undefined,
      }))
      .filter((t: Turn) => t.text);
    if (!turns.length || turns.at(-1)!.role !== "user") throw bad("Say something to the assistant first.");
    const list = [...presets.values()];
    const shot: ShotState = typeof input.shot === "object" && input.shot ? input.shot : {};
    const seen = await photo(input.photo).catch(() => undefined);
    const files: ChatFile[] = (Array.isArray(input.files) ? input.files : []).slice(0, 24).map((f: Record<string, any>) => ({
      name: text(f?.name, 40).toLowerCase(),
      kind: ["image", "video", "audio", "text"].includes(f?.kind) ? f.kind : "text",
      source: ["attached", "take", "film", "image", "preset"].includes(f?.source) ? f.source : "attached",
      width: Number(f?.width) || undefined,
      height: Number(f?.height) || undefined,
      seconds: Number(f?.seconds) || undefined,
      text: f?.kind === "text" ? text(f?.text, 6000) : undefined,
      mentioned: f?.mentioned === true,
    })).filter((f: ChatFile) => f.name);
    const sees = seen ? text(input.sees, 400) || "the start photo" : "";
    const model = pickLlm(input.model, "assistant");
    const prompt = assistantPrompt(shot, turns, sees, files);
    const said = onRouter(model)
      ? await routerAsk(model, `${await engine.assistantBrief()}\n\n${manual(list)}`, prompt, { maxTokens: 1600, temperature: 0.5, image: seen ? await imageBlock(engine.photoPath(seen)) : undefined })
      : await engine.ask(prompt, seen, manual(list));
    const answer = readAnswer(said, new Set(list.map((p) => p.id)), files);
    fillTransitions(answer.actions, turns.at(-1)!.text);
    fillUses(answer.actions, turns.at(-1)!.text, files);
    // references set start photos aside, so drawing one for a reference shot is wasted work
    const refShot = answer.actions.some((a) => a.do === "use" && ["cast", "prop", "location"].includes(a.as)) || Object.values(shot.references ?? {}).some((v) => v !== null && v !== undefined);
    if (refShot) answer.actions = answer.actions.filter((a) => a.do !== "start");
    // a slot the user filled with their own file is never redrawn over it
    const placed = new Set(answer.actions.flatMap((a) => (a.do === "use" ? [a.as] : [])));
    answer.actions = answer.actions.flatMap((a) => (a.do === "reference" && placed.has(a.slot) ? (a.words ? [{ do: "reference", slot: a.slot, words: a.words } as const] : []) : [a]));
    // "continue from this take" opens the next shot on its last frame before anything is changed
    const last = turns.at(-1)!.text;
    const namedTake = [...last.matchAll(/@([a-z0-9][a-z0-9-]*)/gi)].map((m) => m[1].toLowerCase()).find((n) => files.find((f) => f.name === n)?.source === "take");
    const next = answer.actions.find((a) => a.do === "next");
    if (next && namedTake && !next.from) next.from = namedTake;
    if (!next && wantsNext(last) && (namedTake || (shot.recent ?? []).some((r) => r.status === "done"))) answer.actions.unshift(namedTake ? { do: "next", from: namedTake } : { do: "next" });
    // a plain "roll it" always rolls, whether or not the model remembered to say so
    if (wantsRoll(turns.at(-1)!.text) && !answer.actions.some((a) => a.do === "roll")) {
      answer.actions.push({ do: "roll" });
      answer.reply = `${answer.reply.replace(/\s*(When you('| a)re ready|Let me know|Tell me|Say|Just)[^.]*\.?$/i, "")} Rolling it now.`.trim();
    }
    return json(res, 200, answer);
  }
  // a story's step, written (or changed, when asked) by Gemma 4 from the steps before it
  if (path === "/api/story/write" && method === "POST") {
    const input = await jsonBody(req, 8 * 1024 * 1024);
    const step = ["idea", "script", "world", "board"].includes(input.step) ? (input.step as StoryStep) : null;
    if (!step) throw bad("Which step?");
    const only = Math.round(Number(input.only)) || undefined;
    // the user's references (pictures, frames of videos) on one sheet the writer sees
    const sheet = step === "board" ? undefined : await photo(input.sheet).catch(() => undefined);
    const reply = await write(pickLlm(input.model), storyBrief(step), storyPrompt(step, input.story ?? {}, text(input.ask, 800), only, !!sheet), { maxLength: step === "idea" ? 1200 : storyRoom(input.story?.idea?.length), picture: sheet });
    return json(res, 200, readStory(step, reply));
  }
  // a prompt as one, two or four takes, each the idea of a different film with what its moodboard shows
  if (path === "/api/story/ideas" && method === "POST") {
    const input = await jsonBody(req, 8 * 1024 * 1024);
    const count = [1, 2, 4].includes(Number(input.count)) ? Number(input.count) : 4;
    const sheet = await photo(input.sheet).catch(() => undefined);
    const reply = await write(pickLlm(input.model), IDEAS_BRIEF, ideasPrompt(input.story ?? {}, count, !!sheet), { maxLength: 600 + count * 900, picture: sheet });
    const ideas = readIdeas(reply, count);
    if (!ideas.length) throw Object.assign(new Error("The writer wrote no takes. Try again?"), { status: 502 });
    return json(res, 200, { ideas });
  }
  if (path === "/api/story/assist" && method === "POST") {
    // the story assistant, with the whole story in mind: it answers with the edits to make
    const input = await jsonBody(req, 8 * 1024 * 1024);
    const turns = (Array.isArray(input.messages) ? input.messages : []).map((m: any) => ({ role: m?.role === "assistant" ? "assistant" : "user", text: text(m?.text, 1200) })).filter((m: any) => m.text);
    if (!turns.length) throw bad("Say what to change.");
    const prompt = storyAssistPrompt(input.story ?? {}, text(input.selected, 300) || null, turns);
    const model = pickLlm(input.model);
    let reply = await write(model, STORY_ASSIST_BRIEF, prompt, { maxLength: 2400, temperature: 0.4 });
    if (process.env.COMFYTURE_DEBUG) console.log(`story assistant answered\n${reply}`);
    let out = readStoryAssist(reply);
    // a small writer sometimes drops a brace: once more, with its answer to mend
    if (out.broken) {
      reply = await write(model, STORY_ASSIST_BRIEF, `${prompt}\n\nYOUR LAST ANSWER WAS NOT VALID JSON:\n${reply.slice(0, 4000)}\n\nWrite the same answer again as valid JSON only: {"reply": "...", "ops": [{"op": ...}, ...]}`, { maxLength: 2400, temperature: 0.2 });
      if (process.env.COMFYTURE_DEBUG) console.log(`story assistant answered again\n${reply}`);
      out = readStoryAssist(reply);
    }
    const { broken, ...answer } = out;
    return json(res, 200, answer);
  }
  if (path === "/api/projects" && method === "GET") {
    await (seeding ??= seedStages().catch((e) => console.warn("stages: the examples were not added:", e.message)));
    return json(res, 200, { projects: await listFilms() });
  }
  // Macaron: the brands that come with the app, Brioche, new pictures, and what a design leaves as
  if (path === "/api/brands" && method === "GET") await (seedingBrands ??= seedBrands().catch((e) => console.warn("brands: the examples were not added:", e.message)));
  if (path === "/api/macaron/assist" && method === "POST") {
    // Brioche reads the workspace that is open (its things only) and answers with the changes to make there
    const input = await jsonBody(req, 2 * 1024 * 1024);
    const space = spaceOf(input.space);
    const turns = (Array.isArray(input.messages) ? input.messages : []).map((m: any) => ({ role: m?.role === "assistant" ? "assistant" : "user", text: text(m?.text, 1200) })).filter((m: any) => m.text);
    if (!turns.length) throw bad("Say what to change.");
    const model = pickLlm(input.model);
    const prompt = macaronPrompt({ ...(input.brand ?? {}), space, preset: text(input.preset, 24) }, turns);
    const tool = onRouter(model) && takesTools(model);
    const brief = tool ? macaronBrief(space) : `${macaronBrief(space)}\n\nAnswer with JSON only, no other words: {"reply": "...", "actions": [{"op": "...", ...}]}`;
    const reply = onRouter(model) ? await routerAsk(model, brief, prompt, { maxTokens: 4000, temperature: 0.5, ...(tool ? { tool: macaronTool(space) } : {}) }) : await engine.write(brief, prompt, { maxLength: 2400, temperature: 0.4 });
    if (process.env.COMFYTURE_DEBUG) console.log(`brioche answered\n${reply}`);
    return json(res, 200, readMacaronAnswer(reply, space));
  }
  if (path === "/api/macaron/image" && method === "POST") {
    // a picture for a design (a ground, a product scene), from an image model on Comfy Router, at the post's own size
    const input = await jsonBody(req, 64 * 1024);
    const model = text(input.model, 60) || "gpt-image-2.5-flare";
    if (!isRouterImage(model)) throw bad("That picture model is not here: pictures on Comfy Router need a Comfy key.");
    const prompt = text(input.prompt, 4000);
    if (!prompt) throw bad("Say what the picture shows.");
    const aspect = ["4:5", "1:1", "9:16", "16:9"].includes(input.aspect) ? input.aspect : "1:1";
    const refs: { mime: string; data: string }[] = [];
    const names: string[] = [];
    for (const r of (Array.isArray(input.refs) ? input.refs : []).slice(0, 8)) {
      // a library picture, a picture that ships with the app (under web/), or one kept under /media/
      const url = text(typeof r === "string" ? r : r?.url, 300);
      const file = text(typeof r === "string" ? "" : r?.file, 120);
      const from = file ? (await photo(file), engine.photoPath(file)) : url.startsWith("/media/") ? inside(data, url.slice(7)) : url && !url.startsWith("/") ? inside(join(root, "web"), url) : null;
      if (!from || !(await exists(from))) throw bad("A picture named for this one is missing.");
      const pic = await imageBlock(from);
      refs.push({ mime: pic.type, data: pic.data });
      names.push(text(r?.name, 40).toLowerCase());
    }
    const gpt = model.startsWith("gpt-image");
    const size = { "4:5": "1088x1360", "1:1": "1280x1280", "9:16": "1152x2048", "16:9": "1536x864" }[aspect as "4:5"];
    const seed = Number.isSafeInteger(input.seed) && input.seed >= 0 ? input.seed : randomBytes(4).readUInt32BE(0);
    const job = engine.externalPhotoJob(text(input.name, 80) || prompt.slice(0, 60), async () => {
      const made = await routerDraw(model, { prompt, aspect, refs, names, seed, ...(gpt ? { size, quality: ["low", "medium", "high"].includes(input.quality) ? input.quality : "medium" } : {}), ...(model === "flux-3-image" && input.resolution === "2k" ? { resolution: "2k" } : {}) });
      // what it cost goes with the job (the finished job carries it to the page, which keeps it on the asset)
      // and into the ledger under the job's id, so a project's pictures add up and each can be found
      Object.assign(job, { credits: made.credits, model });
      await mkdir(join(data, "macaron"), { recursive: true });
      await writeFile(join(data, "macaron", "ledger.jsonl"), ledgerLine({ job: job.id, model, aspect, refs: refs.length, credits: made.credits, prompt }), { flag: "a" });
      return made.bytes;
    });
    return json(res, 202, [job]);
  }
  if (path === "/api/macaron/exports" && method === "POST") {
    // a design exported as a PNG or a JPG, kept under a name that says what it is
    const type = (req.headers["content-type"] ?? "").split(";")[0].trim();
    if (type !== "image/png" && type !== "image/jpeg") throw bad("Send the design as a PNG or a JPG.", 415);
    const bytes = await body(req, 40 * 1024 * 1024);
    const size = imageSize(bytes);
    if (!size) throw bad("That picture can't be read.", 415);
    return json(res, 201, { ...(await keepExport(data, bytes, url.searchParams.get("name") ?? "design", type === "image/jpeg" ? "jpg" : "png")), width: size.width, height: size.height });
  }
  if (path === "/api/macaron/frames" && (method === "POST" || method === "DELETE")) {
    // a motion render's frames, one at a time (a PNG each), until the video is asked for
    if (!ffmpeg) throw bad("Videos need ffmpeg on the server.", 501);
    const job = url.searchParams.get("job") || frameJob();
    if (!validJob(job)) throw bad("That render is not one of ours.");
    if (method === "DELETE") return (await dropFrames(data, job), json(res, 200, { ok: true }));
    const n = Number(url.searchParams.get("n"));
    if (!Number.isInteger(n) || n < 0 || n > 899) throw bad("A render has up to 900 frames.");
    await keepFrame(data, job, n, await body(req, 24 * 1024 * 1024));
    return json(res, 200, { job });
  }
  if (path === "/api/macaron/motion" && method === "POST") {
    // the frames of a render, encoded as an H.264 video (or a VP9 one, as WebM) at the size they are, with a soft sound when asked
    if (!ffmpeg) throw bad("Videos need ffmpeg on the server.", 501);
    const input = await jsonBody(req);
    if (!validJob(input.job)) throw bad("Send the frames first.");
    const pops = (Array.isArray(input.sound?.pops) ? input.sound.pops : []).map(Number).filter((n: number) => Number.isFinite(n) && n >= 0 && n < 30);
    return json(res, 201, await encodeFrames(data, input.job, { fps: Math.round(num(input.fps, 12, 60, 30)), name: text(input.name, 60) || "motion", sound: input.sound ? { pops, pad: input.sound.pad === true } : undefined, container: input.container === "webm" ? "webm" : input.container === "gif" ? "gif" : "mp4" }));
  }
  // Kitchen's stories and edits, Mixer's mixes, Macaron's brands, Jam's videos, Spice's shots, Toaster's drafts
  if (path === "/api/spice-shots" && method === "GET") await (seedingShots ??= seedShots().catch((e) => console.warn("spice: the examples were not added:", e.message)));
  for (const kind of ["stories", "cuts", "mixes", "brands", "jams", "spice-shots", "toasts"]) {
    if (path === `/api/${kind}` || path.startsWith(`/api/${kind}/`)) {
      const answered = await projectRoute(kind, path, method, req, res);
      if (answered !== false) return answered;
    }
  }
  if (path === "/api/utensils/assist" && method === "POST") {
    // Truffle reads the shelf, the tool open and the library's newest files, and answers with what to set up; nothing runs here
    const input = await jsonBody(req, 256 * 1024);
    const turns = petTurns(input.messages);
    if (!turns.length) throw bad("Say what to do.");
    const summary = input.utensils && typeof input.utensils === "object" ? input.utensils : {};
    // the knowledge base's best matches for the job: told to her, and the only ids her guide may name
    const candidates = utensilsCandidates(turns);
    const reply = await petAnswer(pickLlm(input.model, "assistant"), UTENSILS_BRIEF, UTENSILS_TOOL, utensilsPrompt(summary, turns, candidates));
    if (process.env.COMFYTURE_DEBUG) console.log(`truffle answered\n${reply}`);
    return json(res, 200, readUtensilsAnswer(reply, summary, candidates));
  }
  if (path === "/api/spice/assist" && method === "POST") {
    // Paprika reads the shot, its passes and the department open, and answers with what to set up; nothing runs here
    const input = await jsonBody(req, 256 * 1024);
    const turns = petTurns(input.messages);
    if (!turns.length) throw bad("Say what to do.");
    const summary = input.spice && typeof input.spice === "object" ? input.spice : {};
    const reply = await petAnswer(pickLlm(input.model, "assistant"), SPICE_BRIEF, SPICE_TOOL, spicePrompt(summary, turns));
    if (process.env.COMFYTURE_DEBUG) console.log(`paprika answered\n${reply}`);
    return json(res, 200, readSpiceAnswer(reply, summary));
  }
  // Utensils' knowledge: what every tool and Library workflow is and how it works, searched (?q=&k=&kind=) or read by id
  if (path === "/api/utensils/knowledge" && method === "GET") {
    const kind = url.searchParams.get("kind");
    const hits = searchKnowledge(url.searchParams.get("q") ?? "", { k: Number(url.searchParams.get("k")) || 12, kinds: kind ? [kind] : undefined });
    return json(res, 200, { items: hits.map(({ entry, score }) => ({ ...entry, score })) });
  }
  if (path.startsWith("/api/utensils/knowledge/") && method === "GET") {
    const entry = knowledgeById(decodeURIComponent(path.slice("/api/utensils/knowledge/".length)));
    return entry ? json(res, 200, entry) : json(res, 404, { error: "No such tool or workflow." });
  }
  // Utensils: one tool, one job; what they made is listed in one file, newest first
  if (path === "/api/utensils/results" && method === "GET") {
    try {
      return json(res, 200, JSON.parse(await readFile(join(data, "utensils.json"), "utf8")));
    } catch {
      return json(res, 200, []);
    }
  }
  if (path === "/api/utensils/results" && method === "PUT") {
    const list = await jsonBody(req, 2 * 1024 * 1024);
    if (!Array.isArray(list)) throw bad("Send the list of results.");
    await writeFile(join(data, "utensils.json"), JSON.stringify(list.slice(0, 200)));
    return json(res, 200, { ok: true });
  }
  if (path === "/api/utensils/templates" || path.startsWith("/api/utensils/templates/")) {
    const answer = await templates.handle(method, path.slice("/api/utensils/templates".length), url.searchParams, method === "POST" ? await jsonBody(req, 1024 * 1024) : {});
    if (answer.raw) {
      res.writeHead(answer.status, { "Content-Type": answer.type ?? "application/octet-stream", "Cache-Control": answer.cache ?? "no-store" });
      return void res.end(answer.raw);
    }
    return json(res, answer.status, answer.body);
  }
  if (path.startsWith("/api/utensils/edit/")) {
    if (!ffmpeg) throw bad("The edit tools need ffmpeg on the server.", 501);
    const rest = path.slice("/api/utensils/edit/".length);
    if (rest === "lut" && method === "POST") return json(res, 200, await edit.keepLut(await body(req, 4 * 1024 * 1024)));
    const done = await edit.handle(method, rest, method === "POST" ? await jsonBody(req, 2 * 1024 * 1024) : {});
    return json(res, done.status, done.body);
  }
  if (path.startsWith("/api/utensils/fx/")) {
    if (!ffmpeg) throw bad("The effects need ffmpeg on the server.", 501);
    const done = await fx.handle(method, path.slice("/api/utensils/fx/".length), method === "POST" ? await jsonBody(req, 8 * 1024 * 1024) : {});
    return json(res, done.status, done.body);
  }
  if (path === "/api/utensils/upscale" && method === "POST") {
    const input = await jsonBody(req);
    const source = await photo(input.source);
    if (!source) throw bad("Add a picture to upscale.");
    return json(res, 202, await engine.upscale(source, input.scale === 2 ? 2 : 4));
  }
  if (path === "/api/utensils/cutout" && method === "POST") {
    const source = await photo((await jsonBody(req)).source);
    if (!source) throw bad("Add a picture to cut out.");
    return json(res, 202, engine.clearCutout(source));
  }
  // Spice's bake of FX's layers on a clip: the page draws every frame of the composite (spice-layers.js, what the viewer showed) and sends
  // it here as a JPEG; ffmpeg makes the clip of them with the sound of the clip they were drawn over, kept in the library
  if (path === "/api/spice/bake" && method === "POST") {
    if (!ffmpeg) throw bad("Spice needs ffmpeg on the server.", 501);
    const input = await jsonBody(req);
    const audio = typeof input.audio === "string" ? inside(join(data, "videos"), input.audio) : "";
    const id = randomBytes(6).toString("hex");
    const dir = join(data, "edits", `bake-${id}`);
    await mkdir(dir, { recursive: true });
    for (const [k, b] of bakes) if (Date.now() - b.at > 60 * 60_000) (bakes.delete(k), await rm(b.dir, { recursive: true, force: true }));
    bakes.set(id, { dir, at: Date.now(), fps: num(input.fps, 1, 120, 24), frames: Math.round(num(input.frames, 1, 24 * 120, 1)), audio: audio && (await exists(audio)) ? audio : "", audioFrom: num(input.audioFrom, 0, 36_000, 0) });
    return json(res, 200, { id });
  }
  const bakeStep = /^\/api\/spice\/bake\/([a-f0-9]{12})\/(\d{1,5}|done)$/.exec(path);
  if (bakeStep) {
    const b = bakes.get(bakeStep[1]);
    if (!b) throw bad("That bake is over. Bake again.", 404);
    if (bakeStep[2] !== "done" && method === "PUT") {
      const n = Number(bakeStep[2]);
      if (n >= b.frames) throw bad("That frame is past the end.");
      const bytes = await body(req, 40 * 1024 * 1024);
      if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw bad("A frame is a JPEG.", 415);
      await writeFile(join(b.dir, `f${String(n).padStart(5, "0")}.jpg`), bytes);
      b.at = Date.now();
      return json(res, 200, { ok: true });
    }
    if (bakeStep[2] === "done" && method === "POST") {
      try {
        const out = join(b.dir, "out.mp4");
        const args = ["-v", "error", "-y", "-framerate", String(b.fps), "-start_number", "0", "-i", join(b.dir, "f%05d.jpg")];
        if (b.audio) args.push("-ss", b.audioFrom.toFixed(3), "-i", b.audio);
        args.push("-map", "0:v", ...(b.audio ? ["-map", "1:a?", "-c:a", "aac", "-b:a", "192k", "-shortest"] : []),
          "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p", "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-movflags", "+faststart", "-frames:v", String(b.frames), out);
        await exec("ffmpeg", args);
        const bytes = await readFile(out);
        const name = `${createHash("sha256").update(bytes).digest("hex").slice(0, 16)}.mp4`;
        const kept = join(data, "videos", name);
        if (!(await exists(kept))) await writeFile(kept, bytes);
        const v = await probeVideo(kept);
        return json(res, 200, { kind: "video", file: name, url: `/media/videos/${name}`, width: v.width, height: v.height, seconds: v.duration });
      } finally {
        bakes.delete(bakeStep[1]);
        await rm(b.dir, { recursive: true, force: true });
      }
    }
  }
  if (path === "/api/spice/matte-picture" && method === "POST") {
    // Spice's Roto on a picture: the subject's matte from its clicks (pixels of the picture) or its name
    const input = await jsonBody(req);
    const source = await photo(input.picture);
    if (!source) throw bad("The picture is missing. Add it again.");
    const points = (list: unknown) => (Array.isArray(list) ? list : []).slice(0, 24).filter((p: any) => Number.isFinite(p?.x) && Number.isFinite(p?.y)).map((p: any) => ({ x: Math.round(Math.max(0, p.x)), y: Math.round(Math.max(0, p.y)) }));
    const positive = points(input.positive);
    const name = text(input.text, 120);
    if (!positive.length && !name) throw bad("Click the subject or name it.");
    return json(res, 202, engine.matteImage(source, { text: name, positive, negative: points(input.negative) }));
  }
  if ((path === "/api/utensils/upscale-video" || path === "/api/utensils/sound" || path === "/api/spice/matte") && method === "POST") {
    if (!ffmpeg) throw bad("Video tools need ffmpeg on the server.", 501);
    const input = await jsonBody(req);
    const file = typeof input.video === "string" ? input.video : "";
    const where = inside(join(data, "videos"), file);
    if (!where || !(await exists(where))) throw bad("The video is missing. Add it again.");
    const info = await probeVideo(where);
    // the workflow's video kept as it came (an upscaled one is past the size uploads are cut to)
    const keep = async (bytes: Buffer) => {
      const name = `${createHash("sha256").update(bytes).digest("hex").slice(0, 16)}.mp4`;
      const out = join(data, "videos", name);
      if (!(await exists(out))) await writeFile(out, bytes);
      const v = await probeVideo(out);
      return { file: name, url: `/media/videos/${name}`, width: v.width, height: v.height, duration: v.duration };
    };
    const seed = randomBytes(4).readUInt32BE(0);
    if (path.endsWith("matte")) {
      // Spice's Roto: a subject tracked through the clip as a matte, from its clicks (pixels of the frame they were made on) or its name
      const points = (list: unknown) => (Array.isArray(list) ? list : []).slice(0, 24).filter((p: any) => Number.isFinite(p?.x) && Number.isFinite(p?.y))
        .map((p: any) => ({ x: Math.round(Math.min(Math.max(p.x, 0), info.width)), y: Math.round(Math.min(Math.max(p.y, 0), info.height)) }));
      const positive = points(input.positive);
      const name = text(input.text, 120);
      if (!positive.length && !name) throw bad("Click the subject or name it.");
      const key = Math.round(num(input.key, 0, Math.max(0, info.frames - 1), 0));
      return json(res, 202, engine.videoJob("matte", file, { seed, frames: info.frames, matte: { text: name, positive, negative: points(input.negative), key } }, keep));
    }
    if (path.endsWith("upscale-video")) {
      if (info.duration > 12) throw bad("Upscale clips of up to 12 seconds.");
      const height = [720, 1080, 1440].includes(input.height) ? input.height : 1080;
      return json(res, 202, engine.videoJob("upscale", file, { height, frames: info.frames, seed }, keep));
    }
    const prompt = text(input.prompt, 600);
    if (!prompt) throw bad("Say what the sound is.");
    // LTX-2.5 reads 8n + 1 frames: the clip is cut to the most it holds, ten seconds at most
    const frames = Math.floor((Math.min(info.frames, 10 * 24 + 1) - 1) / 8) * 8 + 1;
    if (frames < 17) throw bad("That video is too short to score.");
    const cut = `${file.replace(/\.\w+$/, "")}-${frames}f.mp4`;
    const cutPath = join(data, "videos", cut);
    // and its sides to multiples of 32, as LTX-2.5 needs (a few pixels cropped at most)
    if (!(await exists(cutPath))) await exec("ffmpeg", ["-v", "error", "-y", "-i", where, "-frames:v", String(frames), "-an", "-vf", "crop=trunc(iw/32)*32:trunc(ih/32)*32,format=yuv420p", "-c:v", "libx264", "-crf", "17", "-preset", "fast", cutPath]);
    // real sounds only: the Foley LoRA keeps music and score out
    return json(res, 202, engine.videoJob("sound", cut, { prompt, frames, seed, loras: input.real === true ? parseLoras(["foley"]) : undefined }, keep));
  }
  // Jam: a song heard (its vocals, its words and their times, its beat), sliced for its shots
  if ((path === "/api/jam/listen" || path === "/api/jam/slice") && method === "POST") {
    if (!ffmpeg) throw bad("Jam needs ffmpeg on the server.", 501);
    const input = await jsonBody(req);
    const file = typeof input.audio === "string" ? input.audio : "";
    const where = inside(join(data, "audio"), file);
    if (!where || !(await exists(where))) throw bad("The track is missing. Add it again.");
    const length = (await probeMedia(where)).duration;
    const from = num(input.from, 0, Math.max(0, length - 1), 0);
    const to = num(input.to, from + 0.5, length, length);
    // the part of the track asked for, kept as a sound of its own
    const tmp = join(data, "audio", `${randomBytes(6).toString("hex")}.part.mp3`);
    try {
      await exec("ffmpeg", ["-v", "error", "-y", "-ss", from.toFixed(3), "-i", where, "-t", (to - from).toFixed(3), "-vn", "-ac", "2", "-ar", "48000", "-b:a", "256k", tmp]);
      const part = await keepAudio(await readFile(tmp), ".mp3", { name: text(input.name, 60) || "Track part", kind: text(input.kind, 20) || "music" });
      if (path.endsWith("slice")) return json(res, 200, part);
      const job = engine.listenJob(part.file, part.seconds, async (bytes, stem = "vocals") => {
        const v = await keepAudio(bytes, ".mp3", { name: `${part.name} ${stem}`, kind: stem === "vocals" ? "voice" : "stem" });
        return { file: v.file, url: v.url, seconds: v.seconds, name: v.name, kind: v.kind };
      });
      return json(res, 202, { job, track: part });
    } finally {
      await rm(tmp, { force: true });
    }
  }
  if (path === "/api/jam/clip" && method === "POST") {
    // a stretch of a video (a dance to copy), as a clip of its own
    if (!ffmpeg) throw bad("Jam needs ffmpeg on the server.", 501);
    const input = await jsonBody(req);
    const file = typeof input.video === "string" ? input.video : "";
    const where = inside(join(data, "videos"), file);
    if (!where || !(await exists(where))) throw bad("The video is missing. Add it again.");
    const info = await probeVideo(where);
    const from = num(input.from, 0, Math.max(0, info.duration - 0.5), 0);
    const len = num(input.seconds, 0.5, 10, 4);
    const out = `${file.replace(/\.\w+$/, "")}-${Math.round(from * 1000)}-${Math.round(len * 1000)}.mp4`;
    const outPath = join(data, "videos", out);
    if (!(await exists(outPath))) await exec("ffmpeg", ["-v", "error", "-y", "-ss", from.toFixed(3), "-i", where, "-t", len.toFixed(3), "-an", "-vf", "fps=24,format=yuv420p", "-c:v", "libx264", "-crf", "17", "-preset", "fast", "-movflags", "+faststart", outPath]);
    const v = await probeVideo(outPath);
    return json(res, 200, { file: out, url: `/media/videos/${out}`, ...v });
  }
  if (path === "/api/mixer/assist" && method === "POST") {
    // Praline reads the shelf, the trend open and its cast, and answers with the picks to make; nothing is made here
    const input = await jsonBody(req, 256 * 1024);
    const turns = petTurns(input.messages);
    if (!turns.length) throw bad("Say what to pick.");
    const summary = input.mixer && typeof input.mixer === "object" ? input.mixer : {};
    const reply = await petAnswer(pickLlm(input.model, "assistant"), MIXER_BRIEF, MIXER_TOOL, mixerPrompt(summary, turns));
    if (process.env.COMFYTURE_DEBUG) console.log(`praline answered\n${reply}`);
    return json(res, 200, readMixerAnswer(reply, summary));
  }
  // Mixer's stars: the photos people cast into trends (their pet, themselves), newest first
  if (path === "/api/mixer/stars" && method === "GET") {
    try {
      return json(res, 200, JSON.parse(await readFile(join(data, "mixer-stars.json"), "utf8")));
    } catch {
      return json(res, 200, []);
    }
  }
  if (path === "/api/mixer/stars" && method === "PUT") {
    const list = await jsonBody(req);
    if (!Array.isArray(list)) throw bad("Send the list of stars.");
    const stars = [];
    for (const s of list.slice(0, 40)) if (await photo(s?.file).catch(() => undefined)) stars.push({ file: s.file, url: `/media/photos/${s.file}`, name: text(s.name, 30) || "Star" });
    await writeFile(join(data, "mixer-stars.json"), JSON.stringify(stars));
    return json(res, 200, stars);
  }
  const trendFiles = /^\/api\/mixer\/trends\/([\w-]+)\/files$/.exec(path);
  if (trendFiles && method === "POST") {
    // a trend we have made ourselves, to make again: its recipe's controls and sound into the library
    if (!ffmpeg) throw bad("Mixer needs ffmpeg on the server.", 501);
    const dir = join(root, "web", "brand", "mixer", "trends", trendFiles[1]);
    const recipe = await readFile(join(dir, "recipe.json"), "utf8").then(JSON.parse).catch(() => null);
    if (!recipe) throw bad("That trend has no recipe.", 404);
    const controls: Record<string, unknown> = {};
    for (const s of Array.isArray(recipe.shots) ? recipe.shots : []) {
      const name = s?.pose ?? s?.guide;
      const where = typeof name === "string" ? inside(dir, name) : null;
      if (!where || name in controls || !(await exists(where))) continue;
      // kept as made (no upload re-encode): the control's own size sets the take's
      const bytes = await readFile(where);
      const file = `${createHash("sha256").update(bytes).digest("hex").slice(0, 16)}-control.mp4`;
      const out = join(data, "videos", file);
      await mkdir(join(data, "videos"), { recursive: true });
      if (!(await exists(out))) await writeFile(out, bytes);
      controls[name] = { file, url: `/media/videos/${file}`, ...(await probeVideo(out)) };
    }
    const sound = async (name: unknown, label: string) => {
      const where = typeof name === "string" ? inside(dir, name) : null;
      if (!where || !(await exists(where))) return null;
      const { stdout } = await exec("ffmpeg", ["-nostdin", "-v", "error", "-i", where, "-vn", "-ac", "2", "-ar", "48000", "-b:a", "192k", "-f", "mp3", "-"], { encoding: "buffer", maxBuffer: 64 << 20 });
      return keepAudio(stdout as unknown as Buffer, ".mp3", { name: `${text(recipe.id, 40)} ${label}`, kind: label === "vocals" ? "voice" : "music" });
    };
    return json(res, 200, { controls, vocals: await sound(recipe.sound?.vocals, "vocals"), mix: await sound(recipe.sound?.mix, "sound") });
  }
  if (path === "/api/mixer/split" && method === "POST") {
    // an edit to remix, at its cuts: each shot's first frame and clip, and the edit's sound
    if (!ffmpeg) throw bad("Mixer needs ffmpeg on the server.", 501);
    const input = await jsonBody(req);
    const file = typeof input.video === "string" ? input.video : "";
    const where = inside(join(data, "videos"), file);
    if (!where || !/^[\w-]+\.mp4$/.test(file) || !(await exists(where))) throw bad("The edit is missing. Add it again.");
    try {
      return json(res, 200, await splitEdit({
        exec, data, file, name: text(input.name, 50) || "Mix",
        probe: probeVideo,
        hasSound: async (p) => (await probeMedia(p)).hasAudio,
        store: (bytes, name) => engine.storeImage(bytes, name),
        keep: (bytes, name) => keepAudio(bytes, ".mp3", { name, kind: "music" }),
      }));
    } catch (e) {
      throw bad((e as Error).message.slice(0, 200));
    }
  }
  if (path === "/api/director" && method === "POST") {
    const input = await jsonBody(req);
    const idea = text(input.idea, 1500);
    if (!idea) throw bad("Say what the film is about.");
    const plan = await engine.plan(idea, {
      shots: Math.round(num(input.shots, 2, 8, 4)),
      seconds: Math.round(num(input.seconds, 3, 8, 5)),
      aspect: ["16:9", "9:16", "1:1"].includes(input.aspect) ? input.aspect : "16:9",
      photo: await photo(input.photo),
    });
    return json(res, 200, plan);
  }
  if (path === "/api/cutout" && method === "POST") {
    const source = await photo((await jsonBody(req)).source);
    if (!source) throw bad("Add a photo to cut out.");
    return json(res, 202, engine.cutout(source));
  }
  if (path === "/api/shots" && method === "POST") {
    const { request, takes, seed } = await parseShot(await jsonBody(req));
    return json(res, 201, await engine.roll(request, takes, seed));
  }
  if (path === "/api/runs" && method === "GET") return json(res, 200, engine.list());
  const runFrame = /^\/api\/runs\/([\w-]+)\/frame$/.exec(path);
  if (runFrame && method === "POST") {
    // one frame of a finished take as a photo: where the next of a trend's chained takes starts
    if (!ffmpeg) throw bad("Taking a frame needs ffmpeg on the server.", 501);
    const run = engine.get(runFrame[1]);
    if (!run || run.status !== "done") throw bad("That take isn't finished.");
    const n = Math.round(num((await jsonBody(req)).frame, 0, 100000, 0));
    const { stdout } = await exec("ffmpeg", ["-nostdin", "-v", "error", "-i", join(data, "runs", run.id, "shot.mp4"), "-vf", `select=eq(n\\,${n})`, "-frames:v", "1", "-f", "image2pipe", "-c:v", "png", "-"], { encoding: "buffer", maxBuffer: 64 << 20 });
    const bytes = stdout as unknown as Buffer;
    if (!bytes.length) throw bad("That take is shorter than that.");
    return json(res, 200, await engine.storeImage(bytes, `${run.request.name} · frame ${n}`));
  }
  if (path === "/api/reels" && method === "POST") {
    if (!ffmpeg) throw bad("Films need ffmpeg on the server.", 501);
    const input = await jsonBody(req);
    // clips: {id, from, to} in seconds of each take; a plain list of take ids joins them whole
    const wanted: Record<string, any>[] = (Array.isArray(input.clips) ? input.clips : (Array.isArray(input.takes) ? input.takes : []).map((id: string) => ({ id }))).slice(0, 24);
    const clips = [];
    for (const c of wanted) {
      const run = engine.get(String(c?.id));
      if (!run) continue;
      if (run.status !== "done") throw bad("Every take in a film must be finished.");
      const file = join(data, "runs", run.id, "shot.mp4");
      const length = (await probeVideo(file)).duration;
      const from = num(c.from, 0, Math.max(0, length - 0.5), 0);
      const to = num(c.to, from + 0.5, length, length);
      clips.push({ run, file, from, to, len: to - from });
    }
    if (clips.length < 2) throw bad("Pick at least two finished takes.");
    const { width, height } = clips[0].run.size;
    const fade = input.transition === "fade";
    const f = fade ? Math.min(0.5, ...clips.map((c) => c.len / 2)) : 0;
    const n = clips.length;
    // picture and sound are cut in two passes and joined after: a single graph that holds both
    // makes ffmpeg 4 duplicate and drop frames at the joins
    const vf: string[] = [];
    const af: string[] = [];
    clips.forEach((c, i) => {
      vf.push(`[${i}:v]trim=start=${c.from.toFixed(3)}:end=${c.to.toFixed(3)},setpts=PTS-STARTPTS,scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,fps=24,setsar=1,format=yuv420p[v${i}]`);
      af.push(`[${i}:a]atrim=start=${c.from.toFixed(3)}:end=${c.to.toFixed(3)},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo[a${i}]`);
    });
    let vOut = "[v]";
    let aOut = "[a]";
    let seconds: number;
    if (fade) {
      // each join overlaps by f seconds: picture cross-dissolves, sound cross-fades
      let v = "[v0]";
      let a = "[a0]";
      let cum = clips[0].len;
      for (let i = 1; i < n; i++) {
        vf.push(`${v}[v${i}]xfade=transition=fade:duration=${f.toFixed(3)}:offset=${(cum - f).toFixed(3)}[vx${i}]`);
        af.push(`${a}[a${i}]acrossfade=d=${f.toFixed(3)}[ax${i}]`);
        v = `[vx${i}]`;
        a = `[ax${i}]`;
        cum += clips[i].len - f;
      }
      vOut = v;
      aOut = a;
      seconds = cum;
    } else {
      vf.push(`${clips.map((_, i) => `[v${i}]`).join("")}concat=n=${n}:v=1:a=0[v]`);
      af.push(`${clips.map((_, i) => `[a${i}]`).join("")}concat=n=${n}:v=0:a=1[a]`);
      seconds = clips.reduce((t, c) => t + c.len, 0);
    }
    const id = `${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomBytes(3).toString("hex")}`;
    await mkdir(join(data, "reels"), { recursive: true });
    const out = join(data, "reels", `${id}.mp4`);
    const pictureFile = join(data, "reels", `${id}.picture.mp4`);
    const soundFile = join(data, "reels", `${id}.sound.m4a`);
    const inputs = clips.flatMap((c) => ["-i", c.file]);
    try {
      await Promise.all([
        exec("ffmpeg", ["-v", "error", "-y", ...inputs, "-filter_complex", vf.join(";"), "-map", vOut, "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p", pictureFile], { maxBuffer: 1 << 20 }),
        exec("ffmpeg", ["-v", "error", "-y", ...inputs, "-filter_complex", af.join(";"), "-map", aOut, "-c:a", "aac", "-b:a", "192k", soundFile], { maxBuffer: 1 << 20 }),
      ]);
      await exec("ffmpeg", ["-v", "error", "-y", "-i", pictureFile, "-i", soundFile, "-c", "copy", "-movflags", "+faststart", out], { maxBuffer: 1 << 20 });
    } finally {
      await rm(pictureFile, { force: true });
      await rm(soundFile, { force: true });
    }
    // the film's card in the library: its name, its clips and its length
    const film = {
      id,
      url: `/media/reels/${id}.mp4`,
      name: text(input.name, 60) || `Film · ${clips.length} shots`,
      takes: clips.map((c) => c.run.id),
      clips: clips.map((c) => ({ id: c.run.id, from: Math.round(c.from * 100) / 100, to: Math.round(c.to * 100) / 100 })),
      transition: fade ? "fade" : "cut",
      seconds: Math.round(seconds * 10) / 10,
      createdAt: new Date().toISOString(),
    };
    await writeFile(join(data, "reels", `${id}.json`), JSON.stringify(film, null, 2));
    return json(res, 201, film);
  }
  if (path === "/api/reels" && method === "GET") return json(res, 200, await listReels());
  const reel = path.match(/^\/api\/reels\/([\w-]+)$/);
  if (reel && method === "DELETE") {
    await rm(join(data, "reels", `${reel[1]}.mp4`), { force: true });
    await rm(join(data, "reels", `${reel[1]}.json`), { force: true });
    return json(res, 200, { ok: true });
  }
  const resound = path.match(/^\/api\/runs\/([\w-]+)\/sound$/);
  if (resound && method === "POST") {
    const input = await jsonBody(req);
    return json(res, 201, await engine.resound(resound[1], text(input.sound, 400)));
  }
  const share = path.match(/^\/api\/runs\/([\w-]+)\/share$/);
  if (share && method === "POST") {
    // A 9:16 clip to post: the photo above the take (or the take alone), with the
    // text layer the browser drew in the app's own type, and the take's sound.
    if (!ffmpeg) throw bad("Share clips need ffmpeg on the server.", 501);
    const run = engine.get(share[1]);
    if (!run || run.status !== "done") throw bad("Share a finished take.");
    const overlay = await body(req, 8 << 20);
    const size = imageSize(overlay);
    if (!size || size.width !== 1080 || size.height !== 1920) throw bad("The text layer must be a 1080 × 1920 PNG.");
    const before = run.request.start ?? run.request.references?.sheet;
    const pair = !!before && run.size.width >= run.size.height;
    const dur = (run.request.seconds + 0.2).toFixed(2);
    await mkdir(join(data, "shares"), { recursive: true });
    const layer = join(data, "shares", `${run.id}.png`);
    await writeFile(layer, overlay);
    const out = join(data, "shares", `${run.id}.mp4`);
    const shot = join(data, "runs", run.id, "shot.mp4");
    const args = ["-v", "error", "-y"];
    let graph: string;
    if (pair) {
      args.push("-loop", "1", "-t", dur, "-i", join(data, "photos", before!), "-i", shot, "-loop", "1", "-t", dur, "-i", layer);
      graph = `color=c=0x121214:s=1080x1920:r=30:d=${dur}[bg];` +
        `[0:v]scale=1080:720:force_original_aspect_ratio=increase,crop=1080:720,setsar=1[top];` +
        `[1:v]scale=1080:720:force_original_aspect_ratio=increase,crop=1080:720,fps=30,setsar=1[shot];` +
        `[bg][top]overlay=0:270:shortest=1[b0];[b0][shot]overlay=0:1010:eof_action=repeat[b1];[2:v]format=rgba[t];[b1][t]overlay=0:0,format=yuv420p[v]`;
    } else {
      args.push("-i", shot, "-loop", "1", "-t", dur, "-i", layer);
      graph = `color=c=0x121214:s=1080x1920:r=30:d=${dur}[bg];` +
        `[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,fps=30,setsar=1[shot];` +
        `[bg][shot]overlay=(W-w)/2:(H-h)/2:shortest=1:eof_action=repeat[b1];[1:v]format=rgba[t];[b1][t]overlay=0:0,format=yuv420p[v]`;
    }
    args.push("-filter_complex", graph, "-map", "[v]", "-map", `${pair ? 1 : 0}:a?`, "-t", dur,
      "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out);
    await exec("ffmpeg", args, { maxBuffer: 1 << 20 });
    return json(res, 201, { url: `/media/shares/${run.id}.mp4`, layout: pair ? "pair" : "single" });
  }
  if (path === "/api/events" && method === "GET") {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
    res.write(`event: hello\ndata: {}\n\n`);
    listeners.add(res);
    const ping = setInterval(() => res.write(": ping\n\n"), 20_000);
    req.on("close", () => {
      clearInterval(ping);
      listeners.delete(res);
    });
    return;
  }
  if (path === "/api/control/events" && method === "GET") return controlEvents(req, res);
  if (path === "/api/control/status" && method === "GET") return json(res, 200, { page: controlConnected(), assistant: llmName(defaultLlm("assistant")) });
  if (path === "/api/control/command" && method === "POST") {
    const input = await jsonBody(req);
    const answer = await command(text(input.op, 40), input.args && typeof input.args === "object" ? input.args : {});
    return json(res, answer.ok ? 200 : 409, answer.ok ? { result: answer.result } : { error: answer.error });
  }
  if (path === "/api/control/reply" && method === "POST") {
    return json(res, reply(await jsonBody(req, 48 * 1024 * 1024)) ? 200 : 404, {});
  }
  if (path === "/api/control/assist" && method === "POST") {
    // the assistant on the Control page: the stage as the page sees it, and a picture of the frame
    const input = await jsonBody(req, 8 * 1024 * 1024);
    const turns: ControlTurn[] = (Array.isArray(input.messages) ? input.messages : [])
      .slice(-12)
      .map((t: Record<string, any>) => ({
        role: t?.role === "assistant" ? "assistant" : "user",
        text: text(t?.text, 1500),
        did: Array.isArray(t?.did) ? t.did.slice(0, 12).map((d: unknown) => text(d, 80)).filter(Boolean) : undefined,
        failed: Array.isArray(t?.failed) ? t.failed.slice(0, 6).map((d: unknown) => text(d, 300)).filter(Boolean) : undefined,
      }))
      .filter((t: ControlTurn) => t.text);
    if (!turns.length || turns.at(-1)!.role !== "user") throw bad("Say something to the assistant first.");
    const scene = input.scene && typeof input.scene === "object" ? input.scene : {};
    let picture: string | undefined;
    const png = typeof input.look === "string" ? /^data:image\/(png|jpeg);base64,(.+)$/.exec(input.look) : null;
    const model = pickLlm(input.model, "assistant");
    const claude = onRouter(model);
    // Gemma reads the picture from a file it uploads; Claude takes it inline
    if (png && !claude) {
      await mkdir(join(data, "control"), { recursive: true });
      picture = join(data, "control", `look-${randomBytes(4).toString("hex")}.${png[1] === "png" ? "png" : "jpg"}`);
      await writeFile(picture, Buffer.from(png[2], "base64"));
    }
    const ask = (prompt: string) =>
      claude
        ? askClaude(model, prompt, png ? { type: png[1], data: png[2] } : undefined)
        : engine.ask(prompt, undefined, undefined, { brief: CONTROL_BRIEF, picture });
    try {
      const prompt = controlPrompt(scene, turns, !!png);
      let answer = readControlAnswer(await ask(prompt), scene);
      // JSON it could not close is asked for once more, never shown
      if (answer.unreadable) answer = readControlAnswer(await ask(`${prompt}\n\nYour last answer was not valid JSON. Answer again: one JSON object, every bracket closed.`), scene);
      if (answer.unreadable) answer = { reply: "I could not put that together. Try it in smaller steps?", actions: [] };
      return json(res, 200, answer);
    } finally {
      if (picture) await rm(picture, { force: true });
    }
  }
  if (path === "/api/control/poses" && method === "GET") return json(res, 200, { poses: await readPoses() });
  if (path === "/api/control/poses" && method === "POST") {
    // a pose someone saved on the Stage: its joints as quaternions, under a name
    const input = await jsonBody(req, 64 * 1024);
    const name = text(input.name, 40);
    if (!name) throw bad("Name the pose.");
    const q = input.quaternions && typeof input.quaternions === "object" ? input.quaternions : {};
    const quaternions = Object.fromEntries(Object.entries(q).filter(([k, v]) => /^[A-Za-z]{2,16}$/.test(k) && Array.isArray(v) && v.length === 4 && v.every((n) => typeof n === "number" && Number.isFinite(n))).slice(0, 40));
    if (Object.keys(quaternions).length < 10) throw bad("That pose has no joints.");
    const poses = await readPoses();
    const id = `mine-${slug(name)}-${randomBytes(2).toString("hex")}`;
    poses.push({ id, name, quaternions, savedAt: new Date().toISOString() });
    await writePoses(poses);
    return json(res, 201, { id, poses });
  }
  const poseId = /^\/api\/control\/poses\/(mine-[\w-]+)$/.exec(path);
  if (poseId && method === "DELETE") {
    const poses = (await readPoses()).filter((p) => p.id !== poseId[1]);
    await writePoses(poses);
    return json(res, 200, { poses });
  }
  if (path === "/api/control/models" && method === "GET") return json(res, 200, { models: await readModels() });
  if (path === "/api/control/models" && method === "POST") {
    // a model someone brings: a rigged character to pose, or a prop to stage
    const name = text(url.searchParams.get("name") ?? "", 80) || "Model";
    const kind = url.searchParams.get("kind") === "character" ? "character" : "prop";
    const ext = (/\.([a-z0-9]+)$/i.exec(name)?.[1] ?? "").toLowerCase();
    if (!MODEL_EXT.has(ext)) throw bad("Bring a GLB, glTF, VRM, FBX or OBJ file.");
    const bytes = await body(req, 300 * 1024 * 1024);
    if (!bytes.length || !looksLike(ext, bytes)) throw bad(`That file is not a ${ext.toUpperCase()}.`);
    const id = `${kind === "character" ? "rig" : "obj"}-${slug(name.replace(/\.[^.]+$/, "")) || "model"}-${randomBytes(3).toString("hex")}`;
    await mkdir(modelsDir(), { recursive: true });
    await writeFile(join(modelsDir(), `${id}.${ext}`), bytes);
    const entry: UserModel = { id, name: name.replace(/\.[^.]+$/, "").slice(0, 60), kind, file: `${id}.${ext}`, ext, bytes: bytes.length, addedAt: new Date().toISOString() };
    const list = await readModels();
    list.push(entry);
    await writeModels(list);
    return json(res, 201, { model: entry, models: list });
  }
  const modelFile = /^\/api\/control\/models\/file\/((?:rig|obj)-[\w-]+\.(?:glb|gltf|vrm|fbx|obj))$/.exec(path);
  if (modelFile && method === "GET") return sendFile(req, res, join(modelsDir(), modelFile[1]), "private, max-age=31536000, immutable");
  const modelId = /^\/api\/control\/models\/((?:rig|obj)-[\w-]+)$/.exec(path);
  if (modelId && method === "DELETE") {
    const list = await readModels();
    const gone = list.find((m) => m.id === modelId[1]);
    if (gone) await rm(join(modelsDir(), gone.file), { force: true });
    const left = list.filter((m) => m.id !== modelId[1]);
    await writeModels(left);
    return json(res, 200, { models: left });
  }
  if (path === "/api/control/stages" && method === "GET") {
    await (seeding ??= seedStages().catch((e) => console.warn("stages: the examples were not added:", e.message)));
    return json(res, 200, { stages: await listStages() });
  }
  if (path === "/api/control/stages" && method === "POST") {
    const input = await jsonBody(req, 64 * 1024 * 1024);
    const now = new Date().toISOString();
    const name = stageName(input.name);
    const stage: StageFile = { id: newStageId(name), name, createdAt: now, updatedAt: now, scene: input.scene ?? { version: 2 }, thumb: typeof input.thumb === "string" ? input.thumb.slice(0, 400_000) : undefined, renders: stageRenders(input.renders), project: projectId(input.project) };
    await writeStage(stage);
    return json(res, 201, { stage });
  }
  if (path === "/api/control/stages/import" && method === "POST") {
    // a stage someone shared: its scene, and the models of their own it uses
    return json(res, 201, await importStage(await jsonBody(req, 450 * 1024 * 1024)));
  }
  const stageRoute = /^\/api\/control\/stages\/(stage-[\w-]+)(\/export)?$/.exec(path);
  if (stageRoute) {
    const id = stageRoute[1];
    const stage = await readStage(id);
    if (!stage) throw bad("No such stage.", 404);
    if (stageRoute[2] && method === "GET") {
      // one file to share: the stage, and the user's own models it uses
      const list = await readModels();
      const models = [];
      for (const mid of modelsIn(stage.scene)) {
        const entry = list.find((m) => m.id === mid);
        if (!entry) continue;
        try {
          models.push({ entry: { id: entry.id, name: entry.name, kind: entry.kind, ext: entry.ext }, data: (await readFile(join(modelsDir(), entry.file))).toString("base64") });
        } catch {}
      }
      // its renders, with their pictures
      const renders = [];
      for (const r of (stage.renders ?? []) as any[]) {
        if (r?.status !== "done" || typeof r.photo?.file !== "string" || !/^[\w.-]+$/.test(r.photo.file)) continue;
        try {
          const { frame: _frame, ...run } = r;
          renders.push({ ...run, data: (await readFile(engine.photoPath(r.photo.file))).toString("base64") });
        } catch {}
      }
      // the pictures on its sheets
      const pictures = [];
      for (const r of sheetRefs(stage.scene)) {
        if (pictures.some((p) => p.file === r.file)) continue;
        try {
          pictures.push({ file: r.file, name: engine.imageName(r.file), data: (await readFile(engine.photoPath(r.file))).toString("base64") });
        } catch {}
      }
      const file = JSON.stringify({ format: "comfyture-stage", version: 1, name: stage.name, scene: stage.scene, thumb: stage.thumb, models, renders, pictures });
      res.writeHead(200, { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${(slug(stage.name) || "stage")}.stage.json"`, "Cache-Control": "no-store" });
      return res.end(file);
    }
    if (method === "GET") return json(res, 200, { stage });
    if (method === "PUT") {
      const input = await jsonBody(req, 64 * 1024 * 1024);
      if (input.name !== undefined) stage.name = stageName(input.name, stage.name);
      if (input.scene !== undefined) stage.scene = input.scene;
      if (typeof input.thumb === "string") stage.thumb = input.thumb.slice(0, 400_000);
      if (input.renders !== undefined) stage.renders = stageRenders(input.renders);
      stage.updatedAt = new Date().toISOString();
      await writeStage(stage);
      const { scene: _scene, renders: _renders, ...meta } = stage;
      return json(res, 200, { stage: meta });
    }
    if (method === "DELETE") {
      await rm(join(stagesDir(), `${id}.json`), { force: true });
      return json(res, 200, { stages: await listStages() });
    }
  }
  if (path === "/api/control/video" && method === "POST") {
    // the Stage's timeline, frame by frame, as a control video in the library
    if (!ffmpeg) throw bad("Videos need ffmpeg on the server.", 501);
    const input = await jsonBody(req, 160 * 1024 * 1024);
    const frames: string[] = Array.isArray(input.frames) ? input.frames.slice(0, 24 * 20 + 1) : [];
    if (frames.length < 9) throw bad("A video needs at least 9 frames.");
    const fps = Math.round(num(input.fps, 8, 60, 24));
    const dir = join(data, "control", `frames-${randomBytes(4).toString("hex")}`);
    await mkdir(dir, { recursive: true });
    try {
      for (const [i, frame] of frames.entries()) {
        const m = /^data:image\/(jpeg|png);base64,(.+)$/.exec(String(frame));
        if (!m) throw bad("Frames must be JPEG or PNG data URLs.");
        await writeFile(join(dir, `${String(i).padStart(4, "0")}.${m[1] === "png" ? "png" : "jpg"}`), Buffer.from(m[2], "base64"));
      }
      const ext = String(frames[0]).startsWith("data:image/png") ? "png" : "jpg";
      const out = join(dir, "video.mp4");
      await exec("ffmpeg", ["-v", "error", "-y", "-framerate", String(fps), "-i", join(dir, `%04d.${ext}`), "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p", "-c:v", "libx264", "-crf", "16", "-preset", "medium", "-movflags", "+faststart", out], { maxBuffer: 1 << 20 });
      const video = await storeVideo(await readFile(out));
      return json(res, 201, { ...video, name: text(input.name, 60) || "Stage video" });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
  const bridge = /^\/api\/control\/blender\/(status|push|pull)$/.exec(path);
  if (bridge && method === "POST") {
    const result = bridge[1] === "status" ? await blenderStatus() : bridge[1] === "push" ? await toBlender() : await fromBlender();
    return json(res, 200, { result });
  }
  const flow = /^\/api\/runs\/([\w-]+)\/workflow$/.exec(path);
  if (flow && method === "GET") {
    const stage = url.searchParams.get("stage") === "frame" ? "frame" : "shot";
    const text = await engine.workflow(flow[1], stage);
    if (!text) return json(res, 404, { error: "This take has no saved workflow yet." });
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="comfyture-${flow[1]}-${stage}.json"`,
    });
    return void res.end(text);
  }
  const action = /^\/api\/runs\/([\w-]+)(?:\/(approve|reframe|cancel))?$/.exec(path);
  if (action) {
    const [, id, verb] = action;
    if (!verb && method === "GET") {
      const run = engine.get(id);
      return run ? json(res, 200, run) : json(res, 404, { error: "No such take." });
    }
    if (!verb && method === "DELETE") {
      await engine.remove(id);
      return json(res, 200, { ok: true });
    }
    if (verb && method === "POST") {
      const input = await jsonBody(req, 16 * 1024);
      const run =
        verb === "approve" ? await engine.approve(id)
        : verb === "reframe" ? await engine.reframe(id, text(input.instruction, 600))
        : await engine.cancel(id);
      return json(res, 200, run);
    }
  }

  if (method !== "GET" && method !== "HEAD") return json(res, 405, { error: "Method not allowed." });

  const mounts: [string, string][] = [
    ["/media/", data],
    ["/presets/", join(root, "presets")],
    ["/samples/", join(root, "samples")],
  ];
  for (const [prefix, folder] of mounts) {
    if (path.startsWith(prefix)) {
      const file = inside(folder, path.slice(prefix.length));
      if (!file || file.endsWith(".json")) return json(res, 404, { error: "Not found." });
      const download = url.searchParams.get("download") ?? undefined;
      return sendFile(req, res, file, prefix === "/media/" ? "no-cache" : "public, max-age=300", download);
    }
  }
  const web = join(root, "web");
  const file = path === "/" ? join(web, "index.html") : inside(web, path.slice(1));
  if (!file) return json(res, 404, { error: "Not found." });
  return sendFile(req, res, file);
}

// ------------------------------------------------------------------- start

await mkdir(join(data, "photos"), { recursive: true });
await mkdir(join(data, "audio"), { recursive: true });
await sweepFrames(data).catch(() => {});
await reloadPresets();
await engine.init();
await seedJams().catch((e) => console.warn("jam: the showcase projects were not added:", e.message));
// samples added before images had names get theirs ("chef", "dog")
for (const f of (await readdir(join(root, "samples")).catch(() => [] as string[])).filter((f) => /\.(jpe?g|png|webp)$/i.test(f))) {
  const bytes = await readFile(join(root, "samples", f));
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
  if ((await readdir(join(data, "photos")).catch(() => [] as string[])).some((p) => p.startsWith(hash))) await engine.storeImage(bytes, f);
}

createServer((req, res) => {
  route(req, res).catch((error) => {
    const status = (error as { status?: number }).status ?? 400;
    if (!res.headersSent) json(res, status, { error: (error as Error).message });
    else res.end();
  });
}).listen(port, host, () => {
  console.log(`Comfyture  http://${host}:${port}`);
  console.log(`ComfyUI    ${target.kind} · ${target.url} · ${workflowSet}`);
  console.log(`Presets    ${presets.size}`);
  console.log(`Writers    ${llmName(defaultLlm("writer"))} · assistants ${llmName(defaultLlm("assistant"))}${onRouter(defaultLlm("writer")) ? " on Comfy Router" : " in ComfyUI"}`);
});
