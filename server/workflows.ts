import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type Graph = Record<string, { class_type: string; inputs: Record<string, unknown> }>;
export type Aspect = "auto" | "16:9" | "9:16" | "1:1";
export type Quality = "draft" | "standard" | "production";

export const FPS = 24;

const RATIOS: Record<Exclude<Aspect, "auto">, number> = { "16:9": 16 / 9, "9:16": 9 / 16, "1:1": 1 };
const PIXELS: Record<Quality, number> = { draft: 0.4e6, standard: 0.9e6, production: 0.9e6 };

const files = new Map<string, string>();

/** A fresh copy of an API-format workflow, safe to edit per run. */
export async function loadGraph(dir: string, name: string): Promise<Graph> {
  const path = join(dir, name);
  if (!files.has(path)) files.set(path, await readFile(path, "utf8"));
  return JSON.parse(files.get(path)!);
}

function set(graph: Graph, node: string, input: string, value: unknown) {
  if (graph[node]) graph[node].inputs[input] = value;
}

/**
 * Output size: the shape of the start frame (clamped between 9:16 and
 * 16:9), or 16:9 without one, at the quality's pixel budget. Multiples of
 * 64 keep the half-size first pass on LTX's 32-pixel grid.
 */
export function outputSize(frame: { width: number; height: number } | null, aspect: Aspect, quality: Quality) {
  const shape = frame ? frame.width / frame.height : 16 / 9;
  const ratio = aspect === "auto" ? Math.min(16 / 9, Math.max(9 / 16, shape)) : RATIOS[aspect];
  const h = Math.sqrt(PIXELS[quality] / ratio);
  const snap = (v: number) => Math.max(256, Math.round(v / 64) * 64);
  return { width: snap(h * ratio), height: snap(h) };
}

export interface ShotInputs {
  prompt: string;
  seconds: number;
  seed: number;
  width: number;
  height: number;
  enhance: boolean;
}

export interface Guide {
  /** A library image, loaded and fitted to the shot. */
  image?: unknown;
  /** Or frames already in the graph, at the shot's size (a clip being extended). */
  link?: [string, number];
  /** Pixel frame index; -1 is the last frame. */
  frame: number;
  strength: number;
}

function common(graph: Graph, v: ShotInputs) {
  set(graph, "prompt", "value", v.prompt);
  set(graph, "seconds", "value", v.seconds);
  set(graph, "seed", "noise_seed", v.seed);
  set(graph, "seed_refine", "noise_seed", v.seed + 1);
  set(graph, "width", "value", v.width);
  set(graph, "height", "value", v.height);
}

/** Routes the prompt through LTX-2.5's prompt enhancer before encoding. */
async function enhance(graph: Graph, dir: string, encoder: string, image?: [string, number]) {
  const part = await loadGraph(dir, "parts/enhancer.json");
  if (!graph[encoder]) return;
  graph.enhancer_clip = part.enhancer_clip;
  graph.enhancer = part.enhancer;
  graph.enhancer.inputs.clip = ["enhancer_clip", 0];
  graph.enhancer.inputs.prompt = ["prompt", 0];
  if (image) graph.enhancer.inputs.image = image;
  graph[encoder].inputs.text = ["enhancer", 0];
}

/** Two-pass image-to-video: the start frame only, with a detail pass. */
export async function buildI2V(graph: Graph, dir: string, start: unknown, v: ShotInputs, strength = 1) {
  common(graph, v);
  set(graph, "photo", "image", start);
  set(graph, "first_frame_refine", "strength", strength);
  if (v.enhance) await enhance(graph, dir, "364", ["350", 0]);
  return graph;
}

/** The IC-LoRA that keeps cast, props and location consistent with a reference sheet. */
export const REFERENCE_LORA = "ltx-2.3-22b-ic-lora-ingredients-0.9.safetensors";
/**
 * The reference IC-LoRA was trained on the dev model with real guidance: on the distilled model at cfg 1
 * the sheet wins and the clip just animates its panels. Settings from the LoRA's model card.
 */
export const REFERENCE_TRANSFORMER = "ltx-2.5-22b-dev-transformer-bf16.safetensors";
const REFERENCE = { strength: 1.4, steps: 30, videoCfg: 4, audioCfg: 7 };
/** The one size the reference IC-LoRA was trained at. */
export const REFERENCE_SIZE = { width: 768, height: 448 };

/**
 * One pass with any number of guide frames: none is text-to-video, a frame
 * at 0 is the start, -1 the end, anything between a keyframe. With a
 * reference sheet, the sheet guides the whole clip through the IC-LoRA.
 */
export async function buildGuided(graph: Graph, dir: string, guides: Guide[], v: ShotInputs, sheet?: unknown) {
  common(graph, v);
  if (graph.base) {
    // GPU-free stand-in: show the sheet or the first guide, if any, as a still clip.
    const still = sheet ?? guides.find((g) => g.image)?.image;
    if (still) graph.base = { class_type: "LoadImage", inputs: { image: still } };
    return graph;
  }
  let pos: [string, number] = ["202", 0];
  let neg: [string, number] = ["202", 1];
  let lat: [string, number] = ["201", 0];
  if (sheet) {
    // Wired the way Lightricks' Ingredients example is: the IC-LoRA loader also reports how far the
    // reference is downscaled, and the sheet rides along as a still video that is cropped off before decoding.
    graph.model.inputs.unet_name = REFERENCE_TRANSFORMER;
    graph.ref_lora = { class_type: "LTXICLoRALoaderModelOnly", inputs: { model: ["model", 0], lora_name: REFERENCE_LORA, strength_model: REFERENCE.strength } };
    Object.assign(graph["235"].inputs, { model: ["ref_lora", 0], video_cfg: REFERENCE.videoCfg, audio_cfg: REFERENCE.audioCfg });
    graph["239"] = {
      class_type: "LTXVScheduler",
      inputs: { steps: REFERENCE.steps, max_shift: 2.05, base_shift: 0.95, stretch: true, terminal: 0.1, latent: ["210", 0] },
    };
    graph.ref_image = { class_type: "LoadImage", inputs: { image: sheet } };
    graph.ref_fit = {
      class_type: "ResizeImageMaskNode",
      inputs: {
        input: ["ref_image", 0],
        resize_type: "scale dimensions",
        scale_method: "lanczos",
        "resize_type.width": ["width", 0],
        "resize_type.height": ["height", 0],
        "resize_type.crop": "center",
      },
    };
    graph.ref_clip = { class_type: "RepeatImageBatch", inputs: { image: ["ref_fit", 0], amount: ["226", 1] } };
    graph.ref_guide = {
      class_type: "LTXAddVideoICLoRAGuide",
      inputs: {
        positive: pos, negative: neg, vae: ["229", 0], latent: lat, image: ["ref_clip", 0],
        frame_idx: 0, strength: 1, latent_downscale_factor: ["ref_lora", 1],
        crop: "disabled", use_tiled_encode: false, tile_size: 256, tile_overlap: 64,
      },
    };
    pos = ["ref_guide", 0];
    neg = ["ref_guide", 1];
    lat = ["ref_guide", 2];
  }
  [...guides]
    .sort((a, b) => (a.frame < 0 ? Infinity : a.frame) - (b.frame < 0 ? Infinity : b.frame))
    .forEach((g, i) => {
      const id = `guide${i + 1}`;
      if (g.link) {
        graph[id] = {
          class_type: "LTXVAddGuide",
          inputs: { positive: pos, negative: neg, vae: ["229", 0], latent: lat, image: g.link, frame_idx: g.frame, strength: g.strength },
        };
        pos = [id, 0];
        neg = [id, 1];
        lat = [id, 2];
        return;
      }
      graph[`${id}_image`] = { class_type: "LoadImage", inputs: { image: g.image } };
      graph[`${id}_fit`] = {
        class_type: "ResizeImageMaskNode",
        inputs: {
          input: [`${id}_image`, 0],
          resize_type: "scale dimensions",
          scale_method: "lanczos",
          "resize_type.width": ["width", 0],
          "resize_type.height": ["height", 0],
          "resize_type.crop": "center",
        },
      };
      graph[`${id}_prep`] = { class_type: "LTXVPreprocess", inputs: { image: [`${id}_fit`, 0], img_compression: 18 } };
      graph[id] = {
        class_type: "LTXVAddGuide",
        inputs: {
          positive: pos,
          negative: neg,
          vae: ["229", 0],
          latent: lat,
          image: [`${id}_prep`, 0],
          frame_idx: g.frame,
          strength: g.strength,
        },
      };
      pos = [id, 0];
      neg = [id, 1];
      lat = [id, 2];
    });
  Object.assign(graph["200"].inputs, { positive: pos, negative: neg });
  graph["210"].inputs.video_latent = lat;
  Object.assign(graph["235"].inputs, { positive: pos, negative: neg });
  if (v.enhance) await enhance(graph, dir, "222", guides.find((g) => g.frame === 0 && g.image) ? ["guide1_prep", 0] : undefined);
  return graph;
}

/** How many of a clip's last frames start the shot that extends it (guides take 8n + 1 frames). */
export const EXTEND_OVERLAP = 17;

/**
 * Adds a clip's last frames to a guided graph, at the shot's size, and returns
 * the link to guide frame 0 with: the new shot picks up where the clip ends.
 * Returns null on a stand-in graph, which has no size nodes to fit to.
 */
export function addClipGuide(graph: Graph, clip: unknown, frames: number): [string, number] | null {
  if (graph.base || !graph.width) return null;
  graph.clip_in = { class_type: "LoadVideo", inputs: { file: clip } };
  graph.clip_parts = { class_type: "GetVideoComponents", inputs: { video: ["clip_in", 0] } };
  graph.clip_tail = {
    class_type: "ImageFromBatch",
    inputs: { image: ["clip_parts", 0], batch_index: Math.max(0, frames - EXTEND_OVERLAP), length: EXTEND_OVERLAP },
  };
  graph.clip_fit = {
    class_type: "ResizeImageMaskNode",
    inputs: {
      input: ["clip_tail", 0],
      resize_type: "scale dimensions",
      scale_method: "lanczos",
      "resize_type.width": ["width", 0],
      "resize_type.height": ["height", 0],
      "resize_type.crop": "center",
    },
  };
  return ["clip_fit", 0];
}

/**
 * Copies a clip's motion with the union-control IC-LoRA: its pose (body, hands,
 * face) or its edges drive the shot, and the start photo, when there is one,
 * gives the look. Without a photo the script alone does.
 */
export function buildMotion(graph: Graph, clip: unknown, photo: unknown | null, control: "pose" | "edges", v: { prompt: string; frames: number; seed: number }): Graph {
  set(graph, "video_in", "file", clip);
  set(graph, "prompt", "value", v.prompt);
  set(graph, "clip_frames", "length", v.frames);
  set(graph, "seed", "noise_seed", v.seed);
  set(graph, "seed_refine", "noise_seed", v.seed + 1);
  if (!graph.clip_frames) return graph;
  if (photo) set(graph, "photo", "image", photo);
  else {
    // the image guides are switched off; they still need an image to be valid
    graph.photo = { class_type: "ImageFromBatch", inputs: { image: ["clip_frames", 0], batch_index: 0, length: 1 } };
    for (const node of Object.values(graph)) if (node.class_type === "LTXVImgToVideoInplace") node.inputs.bypass = true;
  }
  if (control === "edges") graph.control = { class_type: "Canny", inputs: { image: graph.control.inputs.image, low_threshold: 0.4, high_threshold: 0.8 } };
  return graph;
}

/** The Director: an LLM inside ComfyUI turns an idea into a shot list (JSON text). */
export function buildPlan(graph: Graph, prompt: string, seed: number, photo?: unknown): Graph {
  set(graph, "plan", "prompt", prompt);
  set(graph, "plan", "sampling_mode.seed", seed);
  if (photo && graph.plan) {
    graph.photo = { class_type: "LoadImage", inputs: { image: photo } };
    graph.plan.inputs.image = ["photo", 0];
  }
  return graph;
}

/**
 * Drives the shot with a supplied track: the track is encoded and frozen,
 * so every pass keeps it and the picture follows it, and the original sound
 * goes into the file.
 */
export function applyAudio(graph: Graph, audio: unknown, seconds: number) {
  const empty = Object.keys(graph).find((id) => graph[id].class_type === "LTXVEmptyLatentAudio");
  if (!empty) return graph;
  const vae = graph[empty].inputs.audio_vae;
  graph.audio_in = { class_type: "LoadAudio", inputs: { audio } };
  graph.audio_cut = { class_type: "TrimAudioDuration", inputs: { audio: ["audio_in", 0], start_index: 0, duration: seconds } };
  graph.audio_latent = { class_type: "LTXVAudioVAEEncode", inputs: { audio: ["audio_cut", 0], audio_vae: vae } };
  graph.audio_frozen = { class_type: "LTXVFreezeLatent", inputs: { latent: ["audio_latent", 0] } };
  for (const node of Object.values(graph)) {
    if (node.class_type === "LTXVConcatAVLatent") node.inputs.audio_latent = ["audio_frozen", 0];
    if (node.class_type === "CreateVideo") node.inputs.audio = ["audio_cut", 0];
  }
  delete graph[empty];
  return graph;
}

/** LTX-2.5's DFR recipe: keyframes first, a detail pass and a 48 fps pass. Start frame only. */
export async function buildProduction(graph: Graph, dir: string, start: unknown, v: ShotInputs) {
  common(graph, v);
  set(graph, "photo", "image", start);
  set(graph, "seed_temporal", "noise_seed", v.seed + 2);
  if (v.enhance) await enhance(graph, dir, "5771", ["5790", 0]);
  return graph;
}

/** Qwen Image 2.1 edit: paints a new frame from a source image and an instruction. */
/**
 * A new sound for a finished picture: the take is encoded and frozen, so LTX-2.5
 * only writes the audio, following what it sees.
 */
export function buildSound(graph: Graph, video: unknown, prompt: string, frames: number, seed: number): Graph {
  set(graph, "video_in", "file", video);
  set(graph, "prompt", "value", prompt);
  set(graph, "frames", "value", frames);
  set(graph, "seed", "noise_seed", seed);
  return graph;
}

/** Pixel sizes for a generated image, about one megapixel, in multiples of 8. */
export const IMAGE_SIZES: Record<string, { width: number; height: number }> = {
  "3:2": { width: 1248, height: 832 }, "16:9": { width: 1360, height: 768 }, "9:16": { width: 768, height: 1360 }, "1:1": { width: 1024, height: 1024 },
};

/** A new image from a description (Qwen Image 2.1). */
export function buildGenerate(graph: Graph, prompt: string, aspect: string, seed: number): Graph {
  const size = IMAGE_SIZES[aspect] ?? IMAGE_SIZES["3:2"];
  set(graph, "prompt", "prompt", prompt);
  set(graph, "size", "width", size.width);
  set(graph, "size", "height", size.height);
  set(graph, "base", "width", size.width);
  set(graph, "base", "height", size.height);
  set(graph, "sampler", "seed", seed);
  return graph;
}

/** ComfyUI's background removal, with the subject composited onto black. */
export function buildCutout(graph: Graph, source: unknown): Graph {
  set(graph, "photo", "image", source);
  return graph;
}

export function buildPaint(graph: Graph, source: unknown, instruction: string, seed: number): Graph {
  set(graph, "photo", "image", source);
  set(graph, "edit", "prompt", instruction);
  set(graph, "sampler", "seed", seed);
  return graph;
}
