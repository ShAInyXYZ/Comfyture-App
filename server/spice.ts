// Spice's engine: the AI VFX suite. Every tool is a workflow on Comfy Cloud: the IC-LoRAs of LTX-2.3 on the app's own graph
// (server/iclora.ts), the app's other graphs (SAM3's matte for a cut-out, SeedVR2's upscale, LTX-2.5's sound) and templates of the
// catalog (Wan VACE's restyle, frame interpolation). One route runs any of them on a clip of the library and answers a job; the page
// keeps what the job made as a pass of the shot (web/js/spice-model.js). The scenarios are projects of the "spice-scenarios" store, and
// the examples Spice ships (examples/spice/<id>/scenario.json) are put into it here.
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { loadTools, icFrames, promptOf, prepareFilter, compositeGraph, type ICTool, type ICSize } from "./iclora.ts";
import { normaliseBody, FIRST } from "../web/js/spice-model.js";
import { imageBlock } from "./llm.ts";
import { SPICE_READ_BRIEF, SPICE_READ_TOOL, readPrompt, readReadAnswer } from "./spice-assist.ts";

export interface Media { kind: "video" | "image"; url: string; file: string; width: number; height: number; seconds?: number; still?: string }
type Kept = { file: string; url: string; width: number; height: number; duration: number };

/** A tool of the suite as the page reads it: an IC-LoRA (its card's settings), one of the app's graphs, or a catalog template. */
export interface Tool {
  id: string;
  kind: "iclora" | "engine" | "template";
  name: string;
  family: string;
  about: string;
  /** what it takes beside the clip: words (what to do), a region (a rectangle of the frame), an aspect (a wider frame), a height (an upscale) */
  takes: ("words" | "region" | "aspect" | "height")[];
  /** the box a tool that takes a region fills when none is given (fractions of the frame) */
  region?: { x: number; y: number; w: number; h: number };
  /** the words its card gives, offered as the placeholder (an IC-LoRA's prompt, a template's) */
  prompt?: string;
  /** what the words should say, for a tool with no words of its own */
  hint?: string;
  words?: string;
  template?: string;
  strength?: number;
  status: "verified" | "untested" | "failed";
  note?: string;
  needs?: string[];
  /** a card with a fixed grammar: {scene} is the shot described, {words} the effect */
  grammar?: boolean;
  /** about what a second of footage costs in GPU seconds (an engine), or the runner's price (a template) */
  gpu?: number;
  credits?: number | null;
  /** a partner's model: refused under open weights only */
  partner?: string;
  /** the picture of a real run of it on our own footage (what it was given beside what it made), when there is one */
  preview?: string;
}

const FAMILIES_MORE = [
  { id: "matte", name: "Cut out", about: "A subject found by its name and followed through the clip: a green screen to put it anywhere" },
  { id: "finish", name: "Finish", about: "The clip's sound, a smooth slow motion" },
];

/** The app's own graphs and the catalog's templates, beside the IC-LoRAs. */
const ENGINES: Tool[] = [
  { id: "cutout", kind: "engine", name: "Cut out", family: "matte", about: "SAM3 finds the subject you name and follows it through every frame: a green screen of it, with its matte kept beside.", takes: ["words"], prompt: "the raccoon", status: "verified", gpu: 6 },
  { id: "upscale", kind: "engine", name: "Upscale", family: "upscale", about: "SeedVR2 draws the clip again larger and sharper, frame by frame: 720, 1080 or 1440 lines.", takes: ["height"], status: "verified", gpu: 10 },
  { id: "sound", kind: "engine", name: "Sound", family: "finish", about: "LTX-2.5 writes the clip's sound from what it sees and your words: footsteps, rain, a jar set down. The IC-LoRAs leave a clip silent; this gives it its sound back.", takes: ["words"], prompt: "footsteps on cobbles, a market yard at dusk, distant chatter", status: "verified", gpu: 7 },
  { id: "restyle", kind: "template", template: "video_wan_vace_14B_v2v", name: "Restyle", family: "effects", about: "Wan VACE redraws the clip in another look while it keeps the motion: anime, clay, noir, an oil painting.", takes: ["words"], prompt: "a claymation stop-motion film, hand-made clay figures, miniature set", status: "failed", note: "A real run on the dance gave the scene back nearly as it was, squared to 720: the template's own strength keeps the picture, and the runner's form does not reach the setting that would change it.", gpu: 30 },
  { id: "slowmo", kind: "template", template: "utility_video_frame_interpolation", name: "Slow motion", family: "finish", about: "Frames drawn in between the clip's own: it slows down smoothly, twice as long.", takes: [], status: "untested", gpu: 4 },
];

export interface Deps {
  data: string;
  root: string;
  ffmpeg: boolean;
  engine: any;
  templates: any;
  probeVideo: (path: string) => Promise<{ width: number; height: number; frames: number; duration: number }>;
  exec: (cmd: string, args: string[], opts?: any) => Promise<{ stdout: string | Buffer }>;
  inside: (folder: string, rel: string) => string | null;
  exists: (path: string) => Promise<boolean>;
  readProject: (kind: string, id: string) => Promise<any>;
  writeProject: (kind: string, p: any) => Promise<void>;
  stamp: () => string;
  /** a pet's answer through the app's model (a judges' copy counts it as words): the brief, the tool, the prompt, and a picture */
  ask: (model: unknown, brief: string, tool: unknown, prompt: string, image?: { type: string; data: string }) => Promise<string>;
}
export type Answer = { status: number; body: unknown };

export const STORE = "spice-scenarios";
const bad = (message: string, status = 400) => Object.assign(new Error(message), { status });
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Number(v);
  return v !== null && v !== undefined && v !== "" && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

export function createSpice(deps: Deps) {
  const { data, root } = deps;
  const videos = join(data, "videos");

  // ---------------------------------------------------------------- the tools

  async function registry() {
    const suite = await loadTools(join(root, "workflows"));
    const ic: Tool[] = suite.tools.map((t: ICTool) => ({
      id: t.id, kind: "iclora" as const, name: t.name, family: t.family, about: t.about,
      takes: [...(t.template && !t.template.includes("{words}") ? [] : ["words" as const]), ...(t.prepare?.op === "pad" ? ["aspect" as const] : t.prepare?.op === "box" ? ["region" as const] : [])],
      prompt: t.prompt, hint: t.hint, words: t.words, strength: t.strength, status: t.status, note: t.note, needs: t.needs, grammar: !!t.template,
      ...(t.prepare?.op === "box" ? { region: { x: 0.35, y: 0.35, w: 0.3, h: 0.3, ...(t.prepare.region ?? {}) } } : {}),
    }));
    // a template's price is the runner's, when it has read it
    const engines = ENGINES.map((e) => (e.kind === "template" ? { ...e, credits: deps.templates?.credits?.get?.(e.template)?.credits ?? null, partner: deps.templates?.partnerOf?.(e.template) } : e));
    const families = [...suite.families, ...FAMILIES_MORE];
    // (the engines go after the IC-LoRAs of their family; a family of theirs alone goes last)
    const tools = [...ic, ...engines];
    for (const t of tools) if (await previewOf(t.id)) t.preview = `brand/spice/previews/${t.id}.jpg`;
    return { scene: suite.scene, families, tools };
  }
  const toolOf = async (id: unknown) => (await registry()).tools.find((t) => t.id === id) ?? null;
  const previews = new Map<string, boolean>();
  async function previewOf(id: string) {
    if (!previews.has(id)) previews.set(id, await deps.exists(join(root, "web", "brand", "spice", "previews", `${id}.jpg`)));
    return previews.get(id)!;
  }

  /** A clip of the library, as a path and what ffprobe reads of it. */
  async function clipOf(file: unknown) {
    const name = typeof file === "string" ? file : "";
    const where = deps.inside(videos, name);
    if (!where || !(await deps.exists(where))) throw bad("The clip is missing. Add it again.");
    return { file: name, where, info: await deps.probeVideo(where) };
  }
  /** A clip the workflow made, kept once in the library (by its hash), with what it is. */
  async function keepClip(bytes: Buffer): Promise<Kept> {
    const name = `${createHash("sha256").update(bytes).digest("hex").slice(0, 16)}.mp4`;
    const out = join(videos, name);
    if (!(await deps.exists(out))) await writeFile(out, bytes);
    const v = await deps.probeVideo(out);
    return { file: name, url: `/media/videos/${name}`, width: v.width, height: v.height, duration: v.duration };
  }

  // ---------------------------------------------------------------- one run

  /** POST api/spice/run: a tool on a clip. Answers the job (an engine's, watched on the event stream; a template's, polled from the runner). */
  async function run(input: any): Promise<Answer> {
    if (!deps.ffmpeg) throw bad("Video tools need ffmpeg on the server.", 501);
    const tool = await toolOf(input.tool);
    if (!tool) throw bad("That tool is not in the suite.");
    if (tool.needs?.length) throw bad(`${tool.name} needs ${tool.needs.join(" and ")}: not offered yet.`);
    const clip = await clipOf(input.video);
    const seed = randomBytes(4).readUInt32BE(0);
    const words = text(input.words ?? input.prompt, 600);
    if (tool.kind === "iclora") return { status: 202, body: await runIC(tool, clip, input, seed, words) };
    if (tool.kind === "template") return { status: 202, body: await runTemplate(tool, clip, words) };
    if (tool.id === "cutout") {
      if (!words) throw bad("Name what to cut out.");
      const { info } = clip;
      const key = Math.round(num(input.key, 0, Math.max(0, info.frames - 1), 0));
      // the matte SAM3 makes (white on black) becomes a green screen of the clip, kept with the matte beside it
      const keep = async (bytes: Buffer) => {
        const matte = await keepClip(bytes);
        const out = join(videos, `${createHash("sha256").update(bytes).update("green").digest("hex").slice(0, 16)}.mp4`);
        if (!(await deps.exists(out))) {
          const graph = `[1:v]scale=${info.width}:${info.height},format=gbrp[c];color=c=0x00ff00:s=${info.width}x${info.height}:r=24,format=gbrp[g];[0:v]scale=${info.width}:${info.height},format=gray[m];[g][c][m]maskedmerge,format=yuv420p[out]`;
          await deps.exec("ffmpeg", ["-nostdin", "-v", "error", "-y", "-i", join(videos, matte.file), "-i", clip.where, "-filter_complex", graph, "-map", "[out]", "-frames:v", String(info.frames), "-c:v", "libx264", "-crf", "14", "-preset", "fast", "-an", out]);
        }
        const v = await deps.probeVideo(out);
        const name = out.split("/").pop()!;
        return { file: name, url: `/media/videos/${name}`, width: v.width, height: v.height, duration: v.duration, extra: { matte: { kind: "video", ...matte, seconds: matte.duration } } };
      };
      return { status: 202, body: deps.engine.videoJob("matte", clip.file, { seed, frames: info.frames, matte: { text: words, positive: [], negative: [], key } }, keep) };
    }
    if (tool.id === "upscale") {
      if (clip.info.duration > 12) throw bad("Upscale clips of up to 12 seconds.");
      const height = [720, 1080, 1440].includes(Number(input.height)) ? Number(input.height) : 1080;
      return { status: 202, body: deps.engine.videoJob("upscale", clip.file, { height, frames: clip.info.frames, seed }, keepClip) };
    }
    if (tool.id === "sound") {
      if (!words) throw bad("Say what the sound is.");
      // LTX-2.5 reads 8n + 1 frames, sides in multiples of 32: the clip is cut to the most it holds, ten seconds at most
      const frames = Math.floor((Math.min(clip.info.frames, 10 * 24 + 1) - 1) / 8) * 8 + 1;
      if (frames < 17) throw bad("That clip is too short to score.");
      const cut = `${clip.file.replace(/\.\w+$/, "")}-${frames}f.mp4`;
      const cutPath = join(videos, cut);
      if (!(await deps.exists(cutPath))) await deps.exec("ffmpeg", ["-v", "error", "-y", "-i", clip.where, "-frames:v", String(frames), "-an", "-vf", "crop=trunc(iw/32)*32:trunc(ih/32)*32,format=yuv420p", "-c:v", "libx264", "-crf", "17", "-preset", "fast", cutPath]);
      return { status: 202, body: deps.engine.videoJob("sound", cut, { prompt: words, frames, seed }, keepClip) };
    }
    throw bad("That tool cannot run yet.");
  }

  /** An IC-LoRA on the clip: made ready when the tool needs more than the clip (a canvas to widen, a region to fill), merged back after. */
  async function runIC(tool: Tool, clip: { file: string; where: string; info: { width: number; height: number; frames: number; duration: number } }, input: any, seed: number, words: string) {
    const suite = await loadTools(join(root, "workflows"));
    const ic = suite.tools.find((t: ICTool) => t.id === tool.id)!;
    const size: ICSize = input.size === "standard" ? "standard" : "draft";
    const seconds = num(input.seconds, 1, 10, Math.min(10, Math.max(1, Math.round(clip.info.duration))));
    const frames = icFrames(seconds, clip.info.frames);
    const region = input.region && typeof input.region === "object" ? { x: num(input.region.x, 0, 1, 0), y: num(input.region.y, 0, 1, 0), w: num(input.region.w, 0.02, 1, 0.3), h: num(input.region.h, 0.02, 1, 0.3) } : undefined;
    const aspect = input.aspect === undefined || input.aspect === null ? undefined : num(input.aspect, 0.25, 4, 1);
    let file = clip.file;
    const vf = prepareFilter(ic, { aspect, region });
    if (vf) {
      const made = `${clip.file.replace(/\.\w+$/, "")}-${createHash("sha256").update(`${ic.id}${vf}`).digest("hex").slice(0, 8)}.mp4`;
      const out = join(videos, made);
      if (!(await deps.exists(out))) await deps.exec("ffmpeg", ["-nostdin", "-v", "error", "-y", "-i", clip.where, "-an", "-vf", `${vf},format=yuv420p`, "-c:v", "libx264", "-crf", "12", "-preset", "fast", out]);
      file = made;
    }
    const keep = async (made: Buffer) => {
      let bytes = made;
      // a widened or filled run is merged with the footage where the footage stood (server/iclora.ts compositeGraph)
      if (vf) {
        const tmp = join(videos, `ic-draw-${randomBytes(4).toString("hex")}.mp4`);
        const merged = `${tmp}.merged.mp4`;
        try {
          await writeFile(tmp, made);
          const drawn = await deps.probeVideo(tmp);
          const graph = compositeGraph(ic, { w: drawn.width, h: drawn.height }, { w: clip.info.width, h: clip.info.height }, { aspect, region });
          if (graph) {
            await deps.exec("ffmpeg", ["-nostdin", "-v", "error", "-y", "-i", tmp, "-i", clip.where, "-filter_complex", graph, "-map", "[out]", "-frames:v", String(drawn.frames), "-c:v", "libx264", "-crf", "14", "-preset", "fast", "-an", merged]);
            bytes = await readFile(merged);
          }
        } catch (e) {
          console.warn("the run could not be merged with the footage:", e instanceof Error ? e.message : e);
        } finally {
          await rm(tmp, { force: true });
          await rm(merged, { force: true });
        }
      }
      return keepClip(bytes);
    };
    const strength = input.strength === undefined || input.strength === null ? undefined : num(input.strength, 0, 2.5, ic.strength);
    const prompt = promptOf(ic, { scene: text(input.scene, 400), words }, suite.scene || "the footage");
    return deps.engine.videoJob("iclora", file, { prompt, frames, seed, ic: { tool: ic, size, strength } }, keep);
  }

  /** A template of the catalog on the clip, through the runner: its clip slot and its prompt slot filled, the rest the template's own. */
  async function runTemplate(tool: Tool, clip: { file: string; where: string }, words: string) {
    const t = deps.templates;
    if (!t) throw bad("The template runner is not on this server.", 501);
    const form = await t.schemaOf(tool.template);
    const slots: any[] = form.slots ?? [];
    const video = slots.find((s) => s.kind === "video");
    if (!video) throw bad(`${tool.name} takes no clip on Comfy Cloud as it stands.`);
    const prompt = slots.find((s) => s.kind === "text" && s.id === "prompt") ?? slots.find((s) => s.kind === "text" && !/negative/i.test(`${s.id}${s.label}`));
    const inputs: Record<string, unknown> = { [video.id]: clip.file };
    if (words && prompt) inputs[prompt.id] = words;
    // a template that asks for a picture beside the clip (a reference for the look) is given the clip's first frame
    for (const s of slots) {
      if (s.kind !== "image" || !s.required) continue;
      const { stdout } = await deps.exec("ffmpeg", ["-nostdin", "-v", "error", "-i", clip.where, "-frames:v", "1", "-f", "image2pipe", "-c:v", "png", "-"], { encoding: "buffer", maxBuffer: 64 << 20 });
      const still = await deps.engine.storeImage(stdout as Buffer, `${tool.name} · first frame`);
      inputs[s.id] = still.file;
    }
    const job = await t.run(tool.template, { inputs, confirm: true });
    return { id: job.id, status: job.status, progress: job.progress, template: true, credits: job.credits ?? null };
  }

  // ---------------------------------------------------------------- Paprika's read

  /** POST api/spice/read: Paprika looks at one frame of the clip (a second in), says what it is and what looks off, and proposes chains. */
  async function read(input: any): Promise<Answer> {
    if (!deps.ffmpeg) throw bad("Reading a clip needs ffmpeg on the server.", 501);
    const clip = await clipOf(input.video);
    const { stdout } = await deps.exec("ffmpeg", ["-nostdin", "-v", "error", "-ss", String(Math.min(1, Math.max(0, clip.info.duration / 2))), "-i", clip.where, "-frames:v", "1", "-vf", "scale=1024:-2", "-f", "image2pipe", "-c:v", "mjpeg", "-q:v", "4", "-"], { encoding: "buffer", maxBuffer: 16 << 20 });
    const still = join(data, "photos", `read-${createHash("sha256").update(stdout as Buffer).digest("hex").slice(0, 12)}.jpg`);
    await mkdir(join(data, "photos"), { recursive: true });
    await writeFile(still, stdout as Buffer);
    const image = await imageBlock(still);
    const { tools } = await registry();
    const shot = { name: text(input.name, 40), about: text(input.about, 300), words: text(input.words, 1200), width: clip.info.width, height: clip.info.height, seconds: clip.info.duration };
    const reply = await deps.ask(input.model, SPICE_READ_BRIEF, SPICE_READ_TOOL, readPrompt(shot, tools as any), image);
    if (process.env.COMFYTURE_DEBUG) console.log(`paprika read ${clip.file}:\n${reply.slice(0, 1500)}`);
    const out = readReadAnswer(reply, tools as any);
    return { status: 200, body: { at: new Date().toISOString(), ...out } };
  }

  // ---------------------------------------------------------------- the routes

  async function route(method: string, path: string, body: () => Promise<any>): Promise<Answer | false> {
    if (path === "/api/spice/tools" && method === "GET") return { status: 200, body: await registry() };
    if (path === "/api/spice/run" && method === "POST") return run(await body());
    if (path === "/api/spice/read" && method === "POST") return read(await body());
    return false;
  }

  /** What the welcome screen's card says of a scenario: its shots, the passes made, what its runs cost. */
  function info(body: any) {
    const shots: any[] = Array.isArray(body?.shots) ? body.shots : [];
    const log: any[] = Array.isArray(body?.log) ? body.log : [];
    return { shots: shots.length, passes: shots.reduce((n, s) => n + (Array.isArray(s?.passes) ? s.passes.length : 0), 0), log: log.slice(-60).map((e) => ({ at: String(e?.at ?? ""), credits: Number(e?.credits) || 0 })) };
  }

  // ---------------------------------------------------------------- the examples

  /**
   * One of Spice's example scenarios (examples/spice/<id>/scenario.json beside its clips): every clip goes into the library, so the suite
   * can run on it like footage of the person's own, and the scenario is written as Spice keeps one. The spec: { id, rev, name, logline,
   * thumb?, shots: [{ id, name, about, plate: { file, width, height, seconds, still? }, made?: { words, seconds }, passes: [{ tool, name,
   * words, params, media: { file... }, input?: { file... }, credits, note, extra? }] }] }; a pass with no `input` ran on the one before (the plate first).
   */
  async function putExample(spec: any, folder: string, id: string, version: number) {
    const at = deps.stamp();
    const rev = version > 1 ? `-r${version}` : "";
    await mkdir(videos, { recursive: true });
    await mkdir(join(data, "photos"), { recursive: true });
    const put = async (m: any): Promise<Media | null> => {
      if (!m || !/^[\w.-]+\.(mp4|jpg|png|webp)$/.test(String(m.file ?? ""))) return null;
      const ext = String(m.file).split(".").pop()!.toLowerCase();
      const pic = ext !== "mp4";
      const file = `${id}${rev}-${String(m.file).replace(/\.\w+$/, "")}.${ext}`;
      await copyFile(join(folder, m.file), join(data, pic ? "photos" : "videos", file));
      const media: Media = { kind: pic ? "image" : "video", url: `/media/${pic ? "photos" : "videos"}/${file}`, file, width: Number(m.width) || 1280, height: Number(m.height) || 720 };
      if (!pic) media.seconds = Number(m.seconds) || 5;
      if (!pic && /^[\w.-]+\.(jpg|png|webp)$/.test(String(m.still ?? ""))) {
        const still = `${id}${rev}-${String(m.still).replace(/\.\w+$/, "")}.${String(m.still).split(".").pop()}`;
        await copyFile(join(folder, m.still), join(data, "photos", still));
        media.still = `/media/photos/${still}`;
      }
      return media;
    };
    let thumb: string | undefined;
    const shots = [];
    for (const [i, s] of (Array.isArray(spec.shots) ? spec.shots.slice(0, 24) : []).entries()) {
      const plate = await put(s.plate);
      if (!plate) continue;
      thumb ??= plate.still;
      const passes = [];
      let before: Media = plate;
      let on: string | null = null;
      for (const [j, p] of (Array.isArray(s.passes) ? s.passes.slice(0, 40) : []).entries()) {
        const media = await put(p.media);
        if (!media) continue;
        const input = (await put(p.input)) ?? before;
        const pid = `ex-${i}-${j}`;
        passes.push({ id: pid, tool: String(p.tool ?? ""), name: String(p.name ?? p.tool ?? ""), words: String(p.words ?? ""), params: p.params && typeof p.params === "object" ? p.params : {}, on, input, media, credits: 0, at, note: String(p.note ?? ""), source: "cloud", example: true, ...(p.extra ? { extra: Object.fromEntries(await Promise.all(Object.entries(p.extra).map(async ([k, v]) => [k, await put(v)]))) } : {}) });
        before = media;
        on = pid;
      }
      const frame = await put(s.made?.frame);
      shots.push({ id: String(s.id ?? `sh${(i + 1) * 10}`), name: String(s.name ?? `SH${String((i + 1) * 10).padStart(3, "0")}`), about: String(s.about ?? ""), plate, fps: 24, passes, bin: [], made: s.made ? { words: String(s.made.words ?? ""), seconds: Number(s.made.seconds) || 5, frame, run: "" } : null, sel: passes.at(-1)?.id ?? "plate", ...(s.read ? { read: s.read } : {}) });
    }
    const body = normaliseBody({ logline: spec.logline, shots, open: shots[0]?.id ?? null, log: [] });
    await deps.writeProject(STORE, { id, name: String(spec.name ?? "Example"), createdAt: at, updatedAt: at, ...(thumb ? { thumb } : {}), body });
  }

  return { route, info, putExample, registry, run, read, FIRST };
}
