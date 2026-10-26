// The IC-LoRA suite's engine: every in-context LoRA Comfy Cloud has for LTX-2.3/2.5, run on one clip with one generic graph
// (workflows/ic-lora.json: Lightricks' LTX-2.5 distilled union-control example, the graph shot-motion.json already is, with the LoRA, what the
// clip is shown to it as, the words and the size as the only things that change). The tools are data (workflows/ic-loras.json), each with
// what it takes as its guide, the words its card says, and its strength; a tool whose card asks for more than a clip (a mask, a reference
// sheet, a track) is listed with what it needs and is not offered a run until the graph can give it.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Graph } from "./workflows.ts";

/** What a tool is shown of the clip: the clip as it is, or a control made of it. */
export type Guide = "raw" | "pose" | "canny" | "depth";
export interface ICPrepare {
  /** "pad": the clip set on a larger canvas of `aspect` (width over height), the new area flat `color`; "box": a rectangle of the frame (fractions of its size) flooded `color` */
  op: "pad" | "box";
  color: string;
  aspect?: number;
  region?: { x: number; y: number; w: number; h: number };
}
export interface ICTool {
  id: string;
  /** the LoRA file on Comfy Cloud */
  file: string;
  name: string;
  /** the group of the suite's list */
  family: string;
  about: string;
  /** what the clip is shown to the LoRA as */
  guide: Guide;
  /** the words the card says to use (what the tool is told when the person adds none) */
  prompt: string;
  /** a card whose words have a fixed grammar: {scene} is the shot described, {words} what the person says of the effect */
  template?: string;
  /** the words of the effect when the person adds none (the template's {words}) */
  words?: string;
  /** a card that recommends one pass at the native size: the second, doubling pass is left out */
  single?: boolean;
  /** how the clip is made ready (a canvas to widen, a region to fill) before it is shown to the LoRA */
  prepare?: ICPrepare;
  /** what to damage a copy of the footage with, to try a restoring tool on it (the examples, and a test) */
  demo?: { damage: string; label: string };
  /** the model card, and how sure the settings are ("card", "official-workflow", "inferred") */
  source?: string;
  confidence?: string;
  /** appended to the negative prompt */
  avoid?: string;
  /** the LoRA's strength (the card's) */
  strength: number;
  /** the guide's strength in the sampler (1 unless the card says) */
  guideStrength?: number;
  /** what else it needs and the graph cannot give yet: "mask", "reference", "audio", "track", "points"; the tool is not run while this is set */
  needs?: string[];
  /** "verified" once a real run of it was looked at and did what its card says (the note says what to expect), "untested", or "failed" with what was seen */
  status: "verified" | "untested" | "failed";
  note?: string;
}

let cache: { scene: string; tools: ICTool[]; families: { id: string; name: string; about: string }[] } | null = null;
/** The suite's tools and their families, from workflows/ic-loras.json. */
export async function loadTools(dir: string) {
  cache ??= JSON.parse(await readFile(join(dir, "ic-loras.json"), "utf8"));
  return cache!;
}
/** Forgets what was read (tests write the file again). */
export const forgetTools = () => (cache = null);

const set = (graph: Graph, node: string, input: string, value: unknown) => {
  if (graph[node]) graph[node].inputs[input] = value;
};

/** What a tool is told: its template with the shot's scene and the person's words put in, else the person's words, else the card's. */
export function promptOf(tool: ICTool, v: { scene?: string; words?: string }, scene = "the footage") {
  const words = (v.words ?? "").trim();
  if (tool.template) return tool.template.replaceAll("{scene}", (v.scene ?? "").trim() || scene).replaceAll("{words}", words || tool.words || "");
  return words || tool.prompt;
}

/**
 * The ffmpeg filter that makes the clip ready for a tool that is shown more than the clip: a canvas of another shape with the new area flat
 * in the colour the LoRA reads as "draw here", or a rectangle flooded with it. null when the tool takes the clip as it is.
 */
export function prepareFilter(tool: ICTool, v: { aspect?: number; region?: { x: number; y: number; w: number; h: number } } = {}): string | null {
  const p = tool.prepare;
  if (!p) return null;
  const hex = /^[0-9a-f]{6}$/i.test(p.color) ? p.color : "000000";
  if (p.op === "pad") {
    const a = Math.min(4, Math.max(0.25, Number(v.aspect ?? p.aspect ?? 1) || 1));
    const w = `ceil(max(iw\\,ih*${a})/2)*2`;
    const h = `ceil(max(ih\\,iw/${a})/2)*2`;
    return `pad=w=${w}:h=${h}:x=(ow-iw)/2:y=(oh-ih)/2:color=0x${hex}`;
  }
  const r = { ...(p.region ?? { x: 0.35, y: 0.35, w: 0.3, h: 0.3 }), ...(v.region ?? {}) };
  const f = (n: number) => Math.min(1, Math.max(0, Number(n) || 0)).toFixed(4);
  return `drawbox=x=iw*${f(r.x)}:y=ih*${f(r.y)}:w=iw*${f(r.w)}:h=ih*${f(r.h)}:color=0x${hex}:t=fill`;
}

/**
 * What gives back the footage outside the new area: the picture a widened or filled run drew is merged with the clip itself where the clip
 * stood (the centre of the canvas, or everything but the region), through a soft edge, since the LoRA draws the whole frame again and the
 * footage it was given should not change (the official workflow blends it back with a Laplacian pyramid: this is the plain merge).
 * Answers the ffmpeg filter graph (inputs: 0 the drawn clip, 1 the footage as it was cut) and its output label, or null for a tool that
 * takes the clip as it is. `gen` is the drawn clip's size, `orig` the footage's.
 */
export function compositeGraph(tool: ICTool, gen: { w: number; h: number }, orig: { w: number; h: number }, v: { aspect?: number; region?: { x: number; y: number; w: number; h: number } } = {}): string | null {
  const p = tool.prepare;
  if (!p) return null;
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  const soft = Math.max(2, Math.round(Math.min(gen.w, gen.h) / 90));
  if (p.op === "pad") {
    const a = Math.min(4, Math.max(0.25, Number(v.aspect ?? p.aspect ?? 1) || 1));
    const cw = Math.ceil(Math.max(orig.w, orig.h * a) / 2) * 2;
    const s = gen.w / cw;
    const w = even(orig.w * s);
    const h = even(orig.h * s);
    const x = Math.round((gen.w - w) / 2);
    const y = Math.round((gen.h - h) / 2);
    const m = soft * 2;
    return `[1:v]scale=${w}:${h}:flags=lanczos,pad=${gen.w}:${gen.h}:${x}:${y}:color=black,format=gbrp[b];[0:v]scale=${gen.w}:${gen.h},format=gbrp[g];color=c=black:s=${gen.w}x${gen.h}:r=24,drawbox=x=${x + m}:y=${y + m}:w=${Math.max(2, w - 2 * m)}:h=${Math.max(2, h - 2 * m)}:color=white:t=fill,boxblur=${soft},format=gray[k];[g][b][k]maskedmerge,format=yuv420p[out]`;
  }
  const r = { ...(p.region ?? { x: 0.35, y: 0.35, w: 0.3, h: 0.3 }), ...(v.region ?? {}) };
  const f = (n: number) => Math.min(1, Math.max(0, Number(n) || 0));
  const grow = 0.02;
  const bx = Math.round(Math.max(0, f(r.x) - grow) * gen.w);
  const by = Math.round(Math.max(0, f(r.y) - grow) * gen.h);
  const bw = Math.max(2, Math.round(Math.min(1, f(r.x) + f(r.w) + grow) * gen.w) - bx);
  const bh = Math.max(2, Math.round(Math.min(1, f(r.y) + f(r.h) + grow) * gen.h) - by);
  return `[1:v]scale=${gen.w}:${gen.h}:flags=lanczos,format=gbrp[b];[0:v]scale=${gen.w}:${gen.h},format=gbrp[g];color=c=white:s=${gen.w}x${gen.h}:r=24,drawbox=x=${bx}:y=${by}:w=${bw}:h=${bh}:color=black:t=fill,boxblur=${soft},format=gray[k];[g][b][k]maskedmerge,format=yuv420p[out]`;
}

/** The size a run is made at: the clip's shorter side in pixels. 320 is a look at it, 544 (the graph's own) the one to keep. */
export const IC_SIZES = { draft: 320, standard: 544 } as const;
export type ICSize = keyof typeof IC_SIZES;

/** LTX reads 8n + 1 frames: the frames of a run of `seconds`, no more than the clip has. */
export const icFrames = (seconds: number, clipFrames: number, fps = 24) => Math.max(9, Math.floor((Math.min(Math.round(seconds * fps), clipFrames) - 1) / 8) * 8 + 1);

/**
 * The generic graph for a tool on a clip. The clip's frames are resized to the size asked, shown to the LoRA as the tool's guide (the clip
 * as it is, or its pose, its edges, its depth), and the LoRA draws the clip again from its words. No first frame is pinned: the guide
 * and the words say what it is (the first frame of a swap is the person's to give, which a tool of this suite does not ask).
 */
export function buildIC(graph: Graph, tool: ICTool, v: { clip: unknown; prompt: string; frames: number; seed: number; size: ICSize; strength?: number }): Graph {
  set(graph, "video_in", "file", v.clip);
  set(graph, "prompt", "value", v.prompt.trim() || tool.prompt);
  set(graph, "clip_frames", "length", v.frames);
  set(graph, "seed", "noise_seed", v.seed);
  set(graph, "seed_refine", "noise_seed", v.seed + 1);
  set(graph, "union_lora", "lora_name", tool.file);
  set(graph, "union_lora", "strength_model", v.strength ?? tool.strength);
  set(graph, "5548:5026", "resize_type.shorter_size", IC_SIZES[v.size]);
  if (tool.avoid && graph["5014:2612"]) graph["5014:2612"].inputs.text = `${tool.avoid}, ${graph["5014:2612"].inputs.text}`;
  if (tool.guideStrength !== undefined) set(graph, "9002:5012", "strength", tool.guideStrength);
  // no first frame is pinned: the pictures nodes are bypassed (they still need an image to be valid)
  graph.photo = { class_type: "ImageFromBatch", inputs: { image: ["clip_frames", 0], batch_index: 0, length: 1 } };
  for (const node of Object.values(graph)) if (node.class_type === "LTXVImgToVideoInplace") node.inputs.bypass = true;
  // a card that recommends one pass at the native size: the second pass (doubling, drawn without the guide) is left out
  if (tool.single) graph["5518:5538"].inputs.samples = ["5549", 2];
  // no sound is made: the model's own is never wanted on a clip drawn again (and at a small size its decoded sound can hold NaNs that stop the file's encoder)
  delete graph["5518:4848"];
  delete graph["5518:4849"].inputs.audio;
  // what the LoRA is shown of the clip
  const frames: [string, number] = ["5548:5026", 0];
  if (tool.guide === "raw") {
    delete graph.control;
    graph["5548:5028"].inputs.input = frames;
  } else if (tool.guide === "canny") graph.control = { class_type: "Canny", inputs: { image: frames, low_threshold: 0.4, high_threshold: 0.8 } };
  else if (tool.guide === "depth") graph.control = { class_type: "DepthAnythingV2Preprocessor", inputs: { image: frames, ckpt_name: "depth_anything_v2_vitl.pth", resolution: 512 } };
  // (pose is the graph's own DWPreprocessor: body, hands and face)
  // the preprocessors draw their control at their own "resolution", which sets the size the run is made at: it is the size asked
  if (graph.control && "resolution" in graph.control.inputs) graph.control.inputs.resolution = IC_SIZES[v.size];
  return graph;
}
