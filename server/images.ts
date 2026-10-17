// The Image window's models. Each one is an official Comfy template's wiring
// (workflows/image/*.json, catalogued in models.json), and each template's
// prompt enhancer is the one the template ships: its language model, its
// brief and its sampling, so "improve" follows the rules of the model it is for.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { loadGraph, type Graph } from "./workflows.ts";

export type TemplateId = "generate" | "edit" | "style";

interface RefSlots {
  node: string;
  input: string;
  first: number;
  max: number;
  /** How the model's prompt names a reference ("<image{n}>" from tagFirst), and the words for a lone one. */
  tag?: string;
  tagFirst?: number;
  single?: string;
}

export interface ImageTemplate { graph: string; official: string; enhance: string; steps: number; refs?: RefSlots }

export interface ImageModel {
  id: string;
  name: string;
  about: string;
  multiple: number;
  megapixels: number[];
  templates: Partial<Record<TemplateId, ImageTemplate>>;
}

interface Enhancer {
  clip: string;
  type: string;
  brief: string;
  /** The brief and the request go in as one prompt (no system prompt), as the template does. */
  inline?: boolean;
  /** It looks at the references too. */
  sees?: boolean;
  /** Comfyture wrote this brief from the model's own guide, because its template has no enhancer. */
  written?: boolean;
  /** Reasons first, in the model's thinking channel, so only the prompt comes back. */
  thinking?: boolean;
  max_length: number;
  sampling: Record<string, number>;
  mtp?: string;
}

/** A LoRA from Comfy Cloud's library that the model can load, with the words that call it. */
export interface Lora { file: string; name: string; words: string; strength: number; source: string; about?: string; templates?: TemplateId[] }

interface Catalogue {
  default: string;
  models: ImageModel[];
  templates: Record<TemplateId, { name: string; about: string }>;
  enhancers: Record<string, Enhancer>;
}

export const ASPECTS: Record<string, number> = {
  "1:1": 1, "4:3": 4 / 3, "3:4": 3 / 4, "3:2": 3 / 2, "2:3": 2 / 3, "16:9": 16 / 9, "9:16": 9 / 16, "21:9": 21 / 9,
};

export class ImageModels {
  private dir: string;
  private catalogue!: Catalogue;
  private briefs = new Map<string, string>();
  private loras: Record<string, Lora[]> = {};
  ready: Promise<void>;

  constructor(workflows: string) {
    this.dir = join(workflows, "image");
    this.ready = this.load();
  }

  private async load() {
    this.catalogue = JSON.parse(await readFile(join(this.dir, "models.json"), "utf8"));
    this.loras = JSON.parse(await readFile(join(this.dir, "loras.json"), "utf8"));
    for (const [id, e] of Object.entries(this.catalogue.enhancers)) this.briefs.set(id, await readFile(join(this.dir, e.brief), "utf8"));
  }

  /** What the window shows: models, their templates and sizes. */
  list() {
    const c = this.catalogue;
    return {
      default: c.default,
      templates: c.templates,
      aspects: Object.keys(ASPECTS),
      models: c.models.map((m) => ({
        id: m.id,
        name: m.name,
        about: m.about,
        megapixels: m.megapixels,
        multiple: m.multiple,
        loras: this.loras[m.id] ?? [],
        templates: Object.entries(m.templates).map(([id, t]) => ({
          id,
          official: t!.official,
          steps: t!.steps,
          refs: t!.refs?.max ?? 0,
          enhancer: c.enhancers[t!.enhance]?.written ? "written" : "official",
        })),
      })),
    };
  }

  /** The model and template asked for, or a clear error. */
  pick(modelId: string, templateId: string) {
    const model = this.catalogue.models.find((m) => m.id === modelId);
    if (!model) throw new Error(`No image model called ${modelId}.`);
    const template = model.templates[templateId as TemplateId];
    if (!template) throw new Error(`${model.name} has no ${templateId} template.`);
    return { model, template };
  }

  /** Width and height for an aspect at a pixel budget, on the model's grid. */
  size(model: ImageModel, aspect: string, megapixels: number, firstRef?: { width: number; height: number }) {
    const ratio = aspect === "auto" && firstRef ? firstRef.width / firstRef.height : ASPECTS[aspect] ?? 1;
    const mp = model.megapixels.includes(megapixels) ? megapixels : model.megapixels[0];
    const h = Math.sqrt((mp * 1024 * 1024) / ratio);
    const snap = (v: number) => Math.max(256, Math.round(v / model.multiple) * model.multiple);
    return { width: snap(h * ratio), height: snap(h) };
  }

  /** The template's graph with the prompt, size, seed and references filled in. */
  /** The LoRAs asked for that this model and template can load, at a sane strength. */
  lorasFor(modelId: string, templateId: string, picks: { file: string; strength?: number }[]) {
    const known = (this.loras[modelId] ?? []).filter((l) => !l.templates || l.templates.includes(templateId as TemplateId));
    return picks.slice(0, 3).flatMap((p) => {
      const l = known.find((k) => k.file === p.file);
      const strength = Number.isFinite(p.strength) ? Math.min(2, Math.max(0, p.strength!)) : l?.strength;
      return l ? [{ ...l, strength: strength ?? 1 }] : [];
    });
  }

  async build(modelId: string, templateId: string, v: { prompt: string; names?: string[]; width: number; height: number; seed: number; refs: unknown[]; loras?: { file: string; strength?: number }[] }): Promise<Graph> {
    const { template } = this.pick(modelId, templateId);
    const graph = await loadGraph(this.dir, template.graph);
    const loras = this.lorasFor(modelId, templateId, v.loras ?? []);
    addLoras(graph, loras);
    // each LoRA is called by its words, after the description, as the official templates do
    const words = loras.map((l) => l.words).filter(Boolean);
    graph.text.inputs.value = [tagRefs(v.prompt, v.names ?? [], template.refs), ...words].join(", ");
    graph.seed.inputs.value = v.seed;
    graph.width.inputs.value = v.width;
    graph.height.inputs.value = v.height;
    if (template.refs) {
      if (!v.refs.length) throw new Error("Add a reference picture first: this template works from one.");
      wireRefs(graph, template.refs, v.refs);
    }
    return graph;
  }

  /** The template's own prompt enhancer, reading the request (and the references, if it looks at them). */
  async buildEnhancer(modelId: string, templateId: string, v: { prompt: string; names?: string[]; aspect: string; seed: number; refs: unknown[] }): Promise<Graph> {
    const { template } = this.pick(modelId, templateId);
    const e = this.catalogue.enhancers[template.enhance];
    const brief = this.briefs.get(template.enhance)!;
    const graph = await loadGraph(this.dir, "enhance.json");
    graph.llm.inputs.clip_name = e.clip;
    graph.llm.inputs.type = e.type;
    const plan = graph.plan.inputs;
    // a new picture's frame is part of its brief, so the enhancer composes for it; an edit keeps its references' frame
    const words = tagRefs(v.prompt.trim(), v.names ?? [], template.refs);
    const request = !template.refs && v.aspect && v.aspect !== "auto" ? `${words}\n\nAspect ratio: ${v.aspect}.` : words;
    if (e.inline) {
      plan.prompt = `${brief}${request}`;
      delete plan.system_prompt;
      delete graph.brief;
    } else {
      graph.brief.inputs.value = brief;
      plan.prompt = request;
    }
    plan.max_length = e.max_length;
    for (const [k, value] of Object.entries(e.sampling)) plan[`sampling_mode.${k}`] = value;
    plan["sampling_mode.seed"] = v.seed;
    if (e.mtp) plan.mtp = e.mtp;
    if (e.thinking) plan.thinking = true;
    if (e.sees && v.refs.length) {
      // the enhancer reads each reference at about a megapixel, whatever its size
      graph.batch = { class_type: "BatchImagesNode", inputs: {} };
      v.refs.forEach((ref, i) => {
        graph[`ref_${i + 1}`] = { class_type: "LoadImage", inputs: { image: ref } };
        graph[`seen_${i + 1}`] = { class_type: "ImageScaleToTotalPixels", inputs: { image: [`ref_${i + 1}`, 0], upscale_method: "lanczos", megapixels: 1, resolution_steps: 1 } };
        graph.batch.inputs[`images.image${i}`] = [`seen_${i + 1}`, 0];
      });
      plan.image = ["batch", 0];
    }
    return graph;
  }
}

/**
 * "@chef wears @jacket" in the model's own words: "<image1> wears <image2>" for Qwen, "<ref_image_0>…"
 * for FLUX 3, "the image" when there is only one. Names that aren't references become plain words.
 */
export function tagRefs(prompt: string, names: string[], slots?: RefSlots) {
  return prompt.replace(/@([a-z0-9][a-z0-9-]*)/gi, (_, name: string) => {
    const i = names.indexOf(name.toLowerCase());
    if (i < 0 || !slots?.tag) return name.replace(/-/g, " ");
    if (names.length === 1 && slots.single) return slots.single;
    return slots.tag.replace("{n}", String((slots.tagFirst ?? 0) + i));
  });
}

/** LoRAs between the model loader and everything that used it, one after another. */
function addLoras(graph: Graph, loras: Lora[]) {
  if (!loras.length) return;
  let last: [string, number] = ["unet", 0];
  loras.forEach((l, i) => {
    graph[`user_lora_${i + 1}`] = { class_type: "LoraLoaderModelOnly", inputs: { model: last, lora_name: l.file, strength_model: l.strength } };
    last = [`user_lora_${i + 1}`, 0];
  });
  for (const [id, node] of Object.entries(graph)) {
    if (id.startsWith("user_lora_")) continue;
    for (const [k, value] of Object.entries(node.inputs)) if (Array.isArray(value) && value[0] === "unet" && value[1] === 0) node.inputs[k] = last;
  }
}

/** One LoadImage per reference, plugged into the template's reference inputs in order. */
function wireRefs(graph: Graph, slots: RefSlots, refs: unknown[]) {
  refs.slice(0, slots.max).forEach((ref, i) => {
    graph[`ref_${i + 1}`] = { class_type: "LoadImage", inputs: { image: ref } };
    graph[slots.node].inputs[slots.input.replace("{n}", String(slots.first + i))] = [`ref_${i + 1}`, 0];
  });
}

/** Every model and template, built with stand-in inputs, for checking against a server's nodes. */
export async function everyImageGraph(workflows: string) {
  const models = new ImageModels(workflows);
  await models.ready;
  const out: [string, Graph][] = [];
  for (const m of models.list().models) {
    for (const t of m.templates) {
      const refs = t.refs ? ["a.png", "b.png"] : [];
      out.push([`image: ${m.name} · ${t.id}`, await models.build(m.id, t.id, { prompt: "A test image.", width: 1024, height: 1024, seed: 1, refs })]);
      const loras = m.loras.filter((l) => !l.templates || l.templates.includes(t.id as TemplateId)).slice(0, 2);
      if (loras.length) out.push([`image: ${m.name} · ${t.id} · ${loras.length} LoRAs`, await models.build(m.id, t.id, { prompt: "A test image.", width: 1024, height: 1024, seed: 1, refs, loras })]);
      out.push([`image: ${m.name} · ${t.id} · enhance`, await models.buildEnhancer(m.id, t.id, { prompt: "A test image.", aspect: "16:9", seed: 1, refs })]);
    }
  }
  return out;
}
