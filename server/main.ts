import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdir, readdir, readFile, writeFile, access, rm, stat, open } from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join, normalize, resolve, sep } from "node:path";
import { Comfy } from "@comfyorg/sdk";
import { Engine, type ShotRequest, type Shot } from "./engine.ts";
import { assistantPrompt, fillTransitions, fillUses, readAnswer, wantsNext, wantsRoll, type ChatFile, type ShotState, type Turn } from "./assistant.ts";
import { manual } from "./manual.ts";
import { LIMITS } from "./limits.ts";
import { CloudLibrary } from "./cloud.ts";
import { ASPECTS, ImageModels } from "./images.ts";
import { askClaude, blenderStatus, command, CONTROL_BRIEF, CONTROL_MODEL, controlConnected, controlEvents, controlModelName, controlPrompt, fromBlender, readControlAnswer, reply, toBlender, type ControlTurn } from "./control.ts";
import { CATEGORIES, loadPresets, savePreset, type Preset } from "./presets.ts";
import { IMAGE_EXT, imageSize, sendFile } from "./media.ts";
import { readStory, storyBrief, storyPrompt, STORY_ASSIST_BRIEF, storyAssistPrompt, readStoryAssist, type StoryStep } from "./story.ts";
import { planCut, CUT_BRIEF, cutPrompt, readCutAnswer, type CutBody, type CutItem, type Source } from "./cut.ts";

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
async function reloadPresets() {
  presets = new Map((await loadPresets(join(root, "presets"))).map((p) => [p.id, p]));
}

const exec = promisify(execFile);
/** Reels are cut with ffmpeg when it is installed; without it the feature stays hidden. */
const ffmpeg = await exec("ffmpeg", ["-version"]).then(() => true, () => false);

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
    mode: v.mode === "motion" ? "motion" : "extend",
    control: v.control === "edges" ? "edges" : v.control === "ready" ? "ready" : "pose",
    frames: info.frames,
    width: info.width,
    height: info.height,
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
  };
  const takes = Math.round(num(input.takes, 1, 4, 1));
  const seed = Number.isSafeInteger(input.seed) && input.seed >= 0 ? input.seed : undefined;
  return { request, takes, seed };
}

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
type StageFile = { id: string; name: string; createdAt: string; updatedAt: string; scene: unknown; thumb?: string; renders?: unknown[] };
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
  return all.filter((x): x is StageFile => !!x).map(({ id, name, createdAt, updatedAt, thumb }) => ({ id, name, createdAt, updatedAt, thumb })).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
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
type Project = { id: string; name: string; createdAt: string; updatedAt: string; thumb?: string; body: unknown };
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
  return all.filter((x): x is Project => !!x).map(({ id, name, createdAt, updatedAt, thumb, body }) => ({ id, name, createdAt, updatedAt, thumb, info: summary(kind, body) })).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
/** How far a project has come, for its card on the welcome screen: a story's scenes, shots and frames, an edit's clips. */
function summary(kind: string, body: any) {
  if (kind === "stories") {
    const blocks: any[] = Array.isArray(body?.blocks) ? body.blocks : [];
    const shots = blocks.length ? blocks.filter((b) => b?.kind === "shot") : Array.isArray(body?.board?.shots) ? body.board.shots : [];
    const scenes = blocks.length ? blocks.filter((b) => b?.kind === "scene").length : body?.script?.scenes?.length ?? 0;
    const pic = (s: any) => (s?.still ?? s?.photo)?.url;
    return { logline: text(body?.idea?.logline, 200), scenes, shots: shots.length, drawn: shots.filter((s: any) => s?.photo).length, rolled: shots.filter((s: any) => s?.run).length, cast: body?.cast?.length ?? 0, frames: shots.map(pic).filter(Boolean).slice(0, 6) };
  }
  if (kind === "cuts") {
    const tracks: any[] = Array.isArray(body?.tracks) ? body.tracks : [];
    const main = tracks.find((t) => t?.main)?.items ?? [];
    return { clips: main.length, titles: tracks.find((t) => t?.kind === "title")?.items?.length ?? 0, sounds: tracks.filter((t) => t?.kind === "audio").reduce((n, t) => n + (t.items?.length ?? 0), 0) };
  }
  return {};
}
/** GET/POST /api/<kind>, GET/PUT/DELETE /api/<kind>/<id>: answers when the path is one of these. */
async function projectRoute(kind: string, path: string, method: string, req: IncomingMessage, res: ServerResponse) {
  if (path === `/api/${kind}` && method === "GET") return json(res, 200, { [kind]: await listProjects(kind) });
  if (path === `/api/${kind}` && method === "POST") {
    const input = await jsonBody(req, 32 * 1024 * 1024);
    const now = new Date().toISOString();
    const name = text(input.name, 60) || "Untitled";
    const p: Project = { id: `${kind.slice(0, 5)}-${slug(name) || "new"}-${randomBytes(3).toString("hex")}`, name, createdAt: now, updatedAt: now, thumb: typeof input.thumb === "string" ? input.thumb.slice(0, 400_000) : undefined, body: input.body ?? {} };
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

/** Every sound kept: uploads, music, effects and voice lines, with a name, a kind and a length. */
type AudioEntry = { file: string; url: string; name: string; kind: string; seconds: number; prompt?: string; createdAt: string };
const audioIndexPath = () => join(data, "audio", "index.json");
async function readAudioIndex(): Promise<Record<string, AudioEntry>> {
  try {
    return JSON.parse(await readFile(audioIndexPath(), "utf8"));
  } catch {
    return {};
  }
}
let audioWrite: Promise<unknown> = Promise.resolve();
async function noteAudio(entry: AudioEntry) {
  audioWrite = audioWrite.then(async () => {
    const index = await readAudioIndex();
    index[entry.file] = { ...index[entry.file], ...entry };
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

/** The first font on this machine drawtext can use, for titles. */
const TITLE_FONTS = ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf", "/System/Library/Fonts/Supplemental/Arial Bold.ttf", "/Library/Fonts/Arial Bold.ttf", "C:/Windows/Fonts/arialbd.ttf"];
let titleFont: Promise<string | null> | null = null;
const findFont = () => (titleFont ??= (async () => {
  for (const f of TITLE_FONTS) if (await exists(f)) return f;
  return null;
})());

/** Where a timeline item's file is: a take, a film, an uploaded video, a picture or a sound. */
function itemPath(src: CutItem["src"]) {
  const id = String(src?.id ?? src?.file ?? "");
  if (!/^[\w.-]+$/.test(id)) return null;
  if (src?.kind === "take") return join(data, "runs", id, "shot.mp4");
  if (src?.kind === "film") return join(data, "reels", `${id}.mp4`);
  if (src?.kind === "video") return join(data, "videos", id);
  if (src?.kind === "photo") return engine.photoPath(id);
  if (src?.kind === "audio") return join(data, "audio", id);
  return null;
}

/** Renders a cut's timeline into a film in the Library: picture and sound apart, then joined. */
async function renderCut(project: { id: string; name: string; body: any }) {
  const body = project.body as CutBody;
  if (!Array.isArray(body?.tracks)) throw bad("This cut has no timeline.");
  const sources = new Map<string, Source>();
  for (const t of body.tracks) {
    for (const it of t.items ?? []) {
      if (t.kind === "title") continue;
      const path = itemPath(it.src);
      if (!path || !(await exists(path))) continue;
      const still = it.src?.kind === "photo";
      const m = still ? { duration: 3600, hasAudio: false } : await probeMedia(path);
      sources.set(it.id, { path, still, hasAudio: m.hasAudio, duration: m.duration });
    }
  }
  // the film's frame: its first video clip's, else 1280 wide in the cut's shape
  const main = body.tracks.find((t) => t.kind === "video" && t.main) ?? body.tracks.find((t) => t.kind === "video");
  const firstVideo = main?.items.map((it) => sources.get(it.id)).find((x) => x && !x.still);
  const probe = firstVideo ? await probeMedia(firstVideo.path) : null;
  const ratio = { "16:9": 16 / 9, "9:16": 9 / 16, "1:1": 1, "4:3": 4 / 3, "21:9": 21 / 9 }[(project.body as any).aspect as string] ?? 16 / 9;
  const width = probe?.width || (ratio >= 1 ? 1280 : Math.round((1280 * ratio) / 2) * 2);
  const height = probe?.height || (ratio >= 1 ? Math.round(1280 / ratio / 2) * 2 : 1280);
  const id = `${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomBytes(3).toString("hex")}`;
  await mkdir(join(data, "reels"), { recursive: true });
  const work = join(data, "reels", `${id}.work`);
  await mkdir(work, { recursive: true });
  try {
    // each title's words in a file of its own, so no text is ever escaped into the graph
    const titleTexts = body.tracks.filter((t) => t.kind === "title" && !t.mute).flatMap((t) => t.items).filter((it) => it.text?.trim());
    await Promise.all(titleTexts.map((it, i) => writeFile(join(work, `title-${i}.txt`), String(it.text).slice(0, 200))));
    const plan = planCut(body, (it) => sources.get(it.id) ?? null, { width, height, font: await findFont(), titleFile: (i) => join(work, `title-${i}.txt`) });
    const inputs = plan.inputs.flat();
    const picture = join(work, "picture.mp4");
    const sound = join(work, "sound.m4a");
    const out = join(data, "reels", `${id}.mp4`);
    await Promise.all([
      exec("ffmpeg", ["-v", "error", "-y", ...inputs, "-filter_complex", plan.video, "-map", "[v]", "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p", "-r", "24", picture], { maxBuffer: 1 << 22 }),
      exec("ffmpeg", ["-v", "error", "-y", ...inputs, "-filter_complex", plan.audio, "-map", "[a]", "-c:a", "aac", "-b:a", "192k", sound], { maxBuffer: 1 << 22 }),
    ]).catch((e) => {
      throw new Error(`The film didn't render: ${String(e.stderr ?? e.message).split("\n").filter(Boolean).slice(-2).join(" ")}`);
    });
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
    return json(res, 200, { target: target.kind, url: new URL(target.url).origin, workflows: workflowSet, repository, reels: ffmpeg });
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
    const reply = await engine.write(CUT_BRIEF, cutPrompt(input.cut, turns), { maxLength: 1200, temperature: 0.4 });
    return json(res, 200, readCutAnswer(reply));
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
  if (path === "/api/image/models" && method === "GET") {
    await images.ready;
    return json(res, 200, images.list());
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
    const answer = readAnswer(await engine.ask(assistantPrompt(shot, turns, sees, files), seen, manual(list)), new Set(list.map((p) => p.id)), files);
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
    const reply = await engine.write(storyBrief(step), storyPrompt(step, input.story ?? {}, text(input.ask, 800), only), { maxLength: step === "idea" ? 1200 : 3600 });
    return json(res, 200, readStory(step, reply));
  }
  if (path === "/api/story/assist" && method === "POST") {
    // the story assistant, with the whole story in mind: it answers with the edits to make
    const input = await jsonBody(req, 8 * 1024 * 1024);
    const turns = (Array.isArray(input.messages) ? input.messages : []).map((m: any) => ({ role: m?.role === "assistant" ? "assistant" : "user", text: text(m?.text, 1200) })).filter((m: any) => m.text);
    if (!turns.length) throw bad("Say what to change.");
    const prompt = storyAssistPrompt(input.story ?? {}, text(input.selected, 300) || null, turns);
    let reply = await engine.write(STORY_ASSIST_BRIEF, prompt, { maxLength: 2400, temperature: 0.4 });
    if (process.env.COMFYTURE_DEBUG) console.log(`story assistant answered\n${reply}`);
    let out = readStoryAssist(reply);
    // a small writer sometimes drops a brace: once more, with its answer to mend
    if (out.broken) {
      reply = await engine.write(STORY_ASSIST_BRIEF, `${prompt}\n\nYOUR LAST ANSWER WAS NOT VALID JSON:\n${reply.slice(0, 4000)}\n\nWrite the same answer again as valid JSON only: {"reply": "...", "ops": [{"op": ...}, ...]}`, { maxLength: 2400, temperature: 0.2 });
      if (process.env.COMFYTURE_DEBUG) console.log(`story assistant answered again\n${reply}`);
      out = readStoryAssist(reply);
    }
    const { broken, ...answer } = out;
    return json(res, 200, answer);
  }
  for (const kind of ["stories", "cuts"]) {
    if (path === `/api/${kind}` || path.startsWith(`/api/${kind}/`)) {
      const answered = await projectRoute(kind, path, method, req, res);
      if (answered !== false) return answered;
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
  if (path === "/api/reels" && method === "GET") {
    const dir = join(data, "reels");
    const films = [];
    for (const name of (await readdir(dir).catch(() => [] as string[])).filter((n) => n.endsWith(".json"))) {
      try {
        films.push(JSON.parse(await readFile(join(dir, name), "utf8")));
      } catch {
        // a film without readable details is skipped
      }
    }
    return json(res, 200, films.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }
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
  if (path === "/api/control/status" && method === "GET") return json(res, 200, { page: controlConnected(), assistant: controlModelName() });
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
    // Gemma reads the picture from a file it uploads; Claude takes it inline
    if (png && CONTROL_MODEL === "gemma") {
      await mkdir(join(data, "control"), { recursive: true });
      picture = join(data, "control", `look-${randomBytes(4).toString("hex")}.${png[1] === "png" ? "png" : "jpg"}`);
      await writeFile(picture, Buffer.from(png[2], "base64"));
    }
    const ask = (prompt: string) =>
      CONTROL_MODEL === "claude"
        ? askClaude(prompt, png ? { type: png[1], data: png[2] } : undefined)
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
    const stage: StageFile = { id: newStageId(name), name, createdAt: now, updatedAt: now, scene: input.scene ?? { version: 2 }, thumb: typeof input.thumb === "string" ? input.thumb.slice(0, 400_000) : undefined, renders: stageRenders(input.renders) };
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
await reloadPresets();
await engine.init();
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
  console.log(`Control    assistant ${controlModelName()}`);
});
