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
    control: v.control === "edges" ? "edges" : "pose",
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
    const file = `${createHash("sha256").update(bytes).digest("hex").slice(0, 16)}${ext}`;
    const path = join(data, "audio", file);
    if (!(await exists(path))) await writeFile(path, bytes);
    return json(res, 200, { file, url: `/media/audio/${file}` });
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
