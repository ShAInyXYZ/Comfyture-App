// Utensils' Templates: the official ComfyUI workflow templates, browsed, filled in as a friendly form, run on Comfy Cloud, and
// what they make kept in the library. Research and sources: docs/research/comfy-templates.md.
//
// How it works. The catalog is Cloud's own copy of the MIT repo Comfy-Org/workflow_templates (cloud.comfy.org/templates/index.json,
// about 700 templates, no key needed), cached on disk for a day with a jsDelivr fallback; thumbnails are proxied and cached. The
// templates are UI-format workflows, which Cloud's prompt API refuses, so a run goes through Cloud's hosted MCP server
// (cloud.comfy.org/mcp, header X-API-Key): get_template_schema names what can be changed, estimate_credits prices it,
// run_template converts and submits it. The form is made from that schema plus the template's own workflow file (labels,
// defaults and loader nodes of its subgraph). Everything after the submit is plain REST: the job's status, its outputs and the
// files (re-hosted here: signed URLs last about six hours).
//
// OPEN QUESTIONS that only a paid run can settle (nothing here has been run against Cloud; the request builders are pure
// functions with tests, and COMFYTURE_FAKE_TEMPLATES=1 swaps the paid calls for a stand-in):
//   1. Whether a job started by run_template is visible through GET /api/job/{id}/status and GET /api/jobs/{id}, as every job made
//      through the other routes is (the docs say prompt_id is the same id).
//   2. Whether the name an upload returns is accepted as LoadImage.image / LoadVideo.file / LoadAudio.audio in input_overrides.
//      Images use POST /api/upload/image (returns {name}); video and audio use POST /api/assets (the loader name is then the
//      content hash plus the extension, as the engine's own submitted graphs show: see loaderName()).
//   3. Whether node ids of a flattened subgraph ("57:12") are accepted in input_overrides. This module only ever overrides
//      top-level loader nodes (input_overrides) and declared subgraph inputs (slot_overrides, the documented route).
//   4. Subgraph slot defaults in get_template_schema are shifted against the slot names (image_qwen_image_edit_2509 shows the
//      prompt text as the default of 'image'): they are not used; defaults come from the instance node's widgets_values when
//      their count matches the subgraph's widget inputs, else the field is left empty and the template's own value runs.
//   5. The widgets a subgraph instance PROMOTES onto its face (the schema marks them route "input_overrides": the prompt of the
//      object-removal template, for one) are written as input_overrides keyed by the instance's id, the route the schema's own note
//      names. Documented, not yet seen to work on a run.
//
// THE MINI APPS (appsOf, splitSlots): a template shown simply. ComfyUI's own apps (isApp: the author's short form is
// extra.linearData = { inputs: [[node, widget]], outputs }) and a hand-picked set of the easy, popular templates; each has a plain
// promise written for the card, what it asks for, and its form split into the one to three slots that are its own (pictures, clips and
// sounds first, then the words, then a choice) and More settings. An app whose form cannot take the files its author's form asks for
// (a clip through a loader of a custom node) is left out: it would run on its sample. The forms, prices and pictures of every app are
// read in the background a moment after the server starts (free calls), so the cards open fast.
//
// THE CLOUD CLIENT: every MCP call has its own JSON-RPC id and the answer's id is checked. With one id for all of them, calls made at
// once on a session were answered with each other's results (a form of another template, another's price); the caches written then are
// not read (credits-2.json, forms-2/).

import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { deflateSync } from "node:zlib";
import { makerOf, makerById } from "../web/js/utensils-makers.js";
import { spend } from "./judge.ts";

const exec = promisify(execFile);

export const CLOUD = "https://cloud.comfy.org";
const INDEX_URLS = [`${CLOUD}/templates/index.json`, "https://cdn.jsdelivr.net/gh/Comfy-Org/workflow_templates@v0.11.93/templates/index.json"];
const DAY = 24 * 3600 * 1000;
// (the second version of the price and form caches: the first were written while calls made at once could be answered with each
// other's results, so a price or a form kept then may belong to another template)
const CREDITS_FILE = "credits-2.json";
const FORMS_DIR = "forms-2";
const NAME = /^[A-Za-z0-9._-]+$/;

// ------------------------------------------------------------------ the catalog

export type Group = "image" | "video" | "audio" | "3d" | "utility" | "partner";
export type Medium = "image" | "video" | "audio" | "3d";
export interface Item {
  name: string;
  title: string;
  description: string;
  group: Group;
  medium: Medium;
  tags: string[];
  models: string[];
  inputs: string[];
  outputs: string[];
  thumb: string;
  thumbKind: "image" | "audio";
  /** the template has an "after" picture (thumb?n=2): the card dissolves to it on hover */
  variant: string | null;
  partner: boolean;
  credits: number | null;
  openSource: boolean;
  creator: string;
  usage: number;
  size: number;
  needsImport: boolean;
  /** one of ComfyUI's own apps: a template with a simplified form of its author's (extra.linearData) */
  isApp: boolean;
  /** the Cloud category it is listed under (Image, Video Tools, Product & Ads...): the Library's bookcase it stands in */
  category: string;
  /** the official tutorial on docs.comfy.org, when it has one */
  tutorial: string | null;
  /** who made the model at its core (web/js/utensils-makers.js): its logo is pressed into the book's spine, the Library filters by it */
  maker: string | null;
}

/** The categories the app leaves out: text generation and the node tutorials make no picture, clip or sound. */
const SKIP_CATEGORY = new Set(["llm", "Node Basics"]);
const TEXTY = /text|edit|style|prompt|reference|relight|inpaint|outpaint|character|lip sync|motion|voice|speech|music|generation/i;

/** The catalog as the cards need it, from Cloud's index.json (an array of categories, each with its templates). */
export function flatten(index: any[]): Item[] {
  const out = new Map<string, Item>();
  for (const cat of Array.isArray(index) ? index : []) {
    if (SKIP_CATEGORY.has(cat?.type) || SKIP_CATEGORY.has(cat?.title)) continue;
    for (const t of Array.isArray(cat?.templates) ? cat.templates : []) {
      if (!t?.name || !NAME.test(t.name) || out.has(t.name)) continue;
      if (t.status === "archived" || t.status === "deprecated") continue;
      const tags: string[] = Array.isArray(t.tags) ? t.tags.map(String) : [];
      const partner = tags.includes("API") || t.name.startsWith("api_");
      const tools = /Tools$/.test(cat.title ?? "");
      const medium: Medium = cat.type === "video" ? "video" : cat.type === "audio" ? "audio" : cat.type === "3d" ? "3d" : "image";
      const media = [...new Set<string>((t.io?.inputs ?? []).map((i: any) => String(i.mediaType)).filter((m: string) => ["image", "video", "audio"].includes(m)))];
      const inputs = [...media, ...(TEXTY.test(tags.join(" ")) || !media.length ? ["text"] : [])];
      const outputs = [...new Set<string>((t.io?.outputs ?? []).map((o: any) => String(o.mediaType)).filter(Boolean))];
      const subtype = t.mediaSubtype === "mp3" ? "mp3" : "webp";
      out.set(t.name, {
        name: t.name,
        title: String(t.title ?? t.name),
        description: String(t.description ?? ""),
        group: partner ? "partner" : tools ? "utility" : medium,
        medium,
        tags,
        models: Array.isArray(t.models) ? t.models.map(String) : [],
        inputs,
        outputs: outputs.length ? outputs : [medium],
        thumb: `api/utensils/templates/thumb/${t.name}`,
        thumbKind: subtype === "mp3" ? "audio" : "image",
        variant: ["compareSlider", "hoverDissolve", "hoverZoom", "zoomHover"].includes(t.thumbnailVariant) ? t.thumbnailVariant : null,
        partner,
        credits: null,
        openSource: t.openSource === true,
        creator: String(t.username ?? ""),
        usage: Number(t.usage) || 0,
        size: Number(t.size) || 0,
        needsImport: false,
        isApp: t.isApp === true,
        category: String(cat.title ?? cat.category ?? "Other"),
        tutorial: typeof t.tutorialUrl === "string" && /^https:\/\/docs\.comfy\.org\//.test(t.tutorialUrl) ? t.tutorialUrl : null,
        maker: makerOf({ providers: (Array.isArray(t.logos) ? t.logos : []).map((l: any) => l?.provider), models: Array.isArray(t.models) ? t.models.map(String) : [], title: String(t.title ?? "") }),
      });
    }
  }
  return [...out.values()];
}

/**
 * The first frame of an animated WebP as a still WebP, cut out of its container without decoding anything: a template's picture at
 * rest in a grid (Cloud's animated previews weigh up to 4 MB; their first frame a fraction of it). Null when the picture is not
 * animated or its first frame cannot be cut out.
 */
export function firstFrame(webp: Buffer): Buffer | null {
  if (webp.length < 20 || webp.toString("ascii", 0, 4) !== "RIFF" || webp.toString("ascii", 8, 12) !== "WEBP") return null;
  const chunk = (id: string, payload: Buffer) => {
    const head = Buffer.alloc(8);
    head.write(id, 0, "ascii");
    head.writeUInt32LE(payload.length, 4);
    return Buffer.concat([head, payload, payload.length & 1 ? Buffer.alloc(1) : Buffer.alloc(0)]);
  };
  for (let at = 12; at + 8 <= webp.length; ) {
    const id = webp.toString("ascii", at, at + 4);
    const size = webp.readUInt32LE(at + 4);
    const body = at + 8;
    if (body + size > webp.length) return null;
    if (id === "ANMF" && size > 16) {
      // a frame: where it sits and its size (16 bytes), then its own chunks (ALPH and VP8, or VP8L)
      const w = 1 + webp.readUIntLE(body + 6, 3);
      const h = 1 + webp.readUIntLE(body + 9, 3);
      const parts = new Map<string, Buffer>();
      for (let p = body + 16; p + 8 <= body + size; ) {
        const cid = webp.toString("ascii", p, p + 4);
        const csize = webp.readUInt32LE(p + 4);
        if (p + 8 + csize > body + size) return null;
        parts.set(cid, webp.subarray(p + 8, p + 8 + csize));
        p += 8 + csize + (csize & 1);
      }
      const image = parts.get("VP8L") ? chunk("VP8L", parts.get("VP8L")!) : parts.get("VP8 ") ? chunk("VP8 ", parts.get("VP8 ")!) : null;
      if (!image) return null;
      // a lossy frame with its own alpha needs the extended header to carry it; a lossless one holds its alpha itself
      let payload = image;
      if (parts.get("ALPH") && !parts.get("VP8L")) {
        const x = Buffer.alloc(10);
        x[0] = 0x10;
        x.writeUIntLE(w - 1, 4, 3);
        x.writeUIntLE(h - 1, 7, 3);
        payload = Buffer.concat([chunk("VP8X", x), chunk("ALPH", parts.get("ALPH")!), image]);
      }
      const riff = Buffer.alloc(12);
      riff.write("RIFF", 0, "ascii");
      riff.writeUInt32LE(4 + payload.length, 4);
      riff.write("WEBP", 8, "ascii");
      return Buffer.concat([riff, payload]);
    }
    at = body + size + (size & 1);
  }
  return null;
}

/** The whole catalogue for the Library's hall, in Cloud's own order: what a book and its card need, without the paging of listing(). */
export function library(items: Item[]) {
  const order: string[] = [];
  const counts = new Map<string, number>();
  for (const i of items) {
    if (!counts.has(i.category)) order.push(i.category);
    counts.set(i.category, (counts.get(i.category) ?? 0) + 1);
  }
  // the makers, the busiest first (the Library's row of logos)
  const made = new Map<string, number>();
  for (const i of items) if (i.maker) made.set(i.maker, (made.get(i.maker) ?? 0) + 1);
  return {
    total: items.length,
    categories: order.map((name) => ({ name, count: counts.get(name) ?? 0 })),
    makers: [...made].sort((a, b) => b[1] - a[1]).map(([id, count]) => ({ id, name: makerById(id)?.name ?? id, by: makerById(id)?.by ?? null, count })),
    items: items.map((i) => ({ name: i.name, title: i.title, description: i.description, category: i.category, medium: i.medium, partner: i.partner, openSource: i.openSource, isApp: i.isApp, usage: i.usage, models: i.models, inputs: i.inputs, outputs: i.outputs, tags: i.tags, thumbKind: i.thumbKind, variant: i.variant, tutorial: i.tutorial, credits: i.credits, maker: i.maker })),
  };
}

const GROUPS: Group[] = ["image", "video", "audio", "3d", "utility", "partner"];
const GROUP_NAME: Record<Group, string> = { image: "Image", video: "Video", audio: "Audio", "3d": "3D", utility: "Utility", partner: "Partner" };

/** What a search asks: every word must be somewhere in the title, description, tags or models. */
export function search(items: Item[], q: string) {
  const words = q.toLowerCase().split(/[\s,]+/).filter(Boolean);
  if (!words.length) return items;
  return items
    .map((i) => {
      const title = i.title.toLowerCase();
      const hay = `${title} ${i.name} ${i.description} ${i.tags.join(" ")} ${i.models.join(" ")}`.toLowerCase();
      if (!words.every((w) => hay.includes(w))) return null;
      return { i, score: words.reduce((n, w) => n + (title.includes(w) ? 3 : 0) + (i.tags.some((t) => t.toLowerCase().includes(w)) ? 2 : 0) + (i.models.some((m) => m.toLowerCase().includes(w)) ? 1 : 0), 0) };
    })
    .filter((x): x is { i: Item; score: number } => !!x)
    .sort((a, b) => b.score - a.score || b.i.usage - a.i.usage)
    .map((x) => x.i);
}

/** The listing the page asks for: filtered, sorted (the featured ones first when asked), paged, with the category counts. */
export function listing(items: Item[], q: { q?: string; group?: string; tag?: string; featured?: boolean; limit?: number; offset?: number }, featured: string[]) {
  const counts = new Map<Group, number>();
  for (const i of items) counts.set(i.group, (counts.get(i.group) ?? 0) + 1);
  const categories = [{ id: "all", name: "All", count: items.length }, ...GROUPS.map((g) => ({ id: g, name: GROUP_NAME[g], count: counts.get(g) ?? 0 }))];
  let list = search(items, q.q ?? "");
  const group = q.group && q.group !== "all" ? q.group : "";
  if (group) list = list.filter((i) => i.group === group);
  if (q.tag) list = list.filter((i) => i.tags.some((t) => t.toLowerCase() === String(q.tag).toLowerCase()));
  if (!q.q) {
    const rank = new Map(featured.map((n, i) => [n, i]));
    list = [...list].sort((a, b) => {
      const ra = rank.get(a.name);
      const rb = rank.get(b.name);
      if (q.featured && (ra !== undefined || rb !== undefined)) return (ra ?? 1e6) - (rb ?? 1e6) || b.usage - a.usage;
      return b.usage - a.usage;
    });
  }
  const offset = Math.max(0, Math.floor(q.offset ?? 0));
  const limit = Math.min(200, Math.max(1, Math.floor(q.limit ?? 48)));
  return { count: list.length, total: items.length, categories, items: list.slice(offset, offset + limit) };
}

// ------------------------------------------------------------------ the form

export type SlotKind = "image" | "video" | "audio" | "text" | "number" | "seed" | "combo" | "boolean";
export type Target = { via: "slot"; address: string } | { via: "input"; node: string; input: string };
export interface Slot {
  id: string;
  label: string;
  kind: SlotKind;
  required: boolean;
  advanced: boolean;
  /** in a mini app: one of the one to three things the person has to give (the others are under More settings) */
  primary?: boolean;
  multiline?: boolean;
  default?: unknown;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  hint?: string;
  target: Target;
  /** more places the same value is written (a duration the prompt and the latent both carry) */
  also?: Target[];
}
export interface Form {
  slots: Slot[];
  models: string[];
  notes: string[];
}

const LOADERS: Record<string, { input: string; kind: "image" | "video" | "audio" }> = {
  LoadImage: { input: "image", kind: "image" },
  LoadImageMask: { input: "image", kind: "image" },
  LoadVideo: { input: "file", kind: "video" },
  LoadAudio: { input: "audio", kind: "audio" },
};
const RANGES: Record<string, [number, number, number]> = {
  width: [256, 2048, 64], height: [256, 2048, 64], duration: [1, 30, 1], seconds: [1, 30, 1], length: [1, 30, 1], fps: [8, 60, 1], steps: [1, 60, 1],
  cfg: [0, 20, 0.5], denoise: [0, 1, 0.05], strength: [0, 1, 0.05], batch_size: [1, 4, 1], bpm: [40, 220, 1],
};
const PRIMARY_NUMBERS = new Set(["width", "height", "duration", "seconds", "length"]);
const DURATION = new Set(["duration", "seconds", "length"]);
const PROMPT = /^(prompt|positive[ _]?prompt|text|description|instructions?|caption|tags|lyrics|input[ _]?text)$/;
const NEGATIVE = /negative/;
const FRIENDLY_COMBO = /^(aspect[ _]?ratio|resolution|size|style|quality|mode|language|voice|format|orientation)$/;
const MODEL_COMBO = /(^|_)(name|model|lora|ckpt|unet|clip|vae|checkpoint|encoder)(_\d+)?$/;
const WIDGET_TYPES = new Set(["STRING", "INT", "FLOAT", "BOOLEAN", "COMBO"]);

const LABELS: Record<string, string> = { fps: "Frame rate", cfg: "CFG", bpm: "BPM", seed: "Seed", batch_size: "Batch", denoise: "Denoise", steps: "Steps", prompt_enhance: "Enhance the prompt" };
const nice = (s: string) => {
  const known = LABELS[s.toLowerCase().replace(/\s+/g, "_")];
  if (known) return known;
  const t = s.replace(/[_.]+/g, " ").replace(/\s*\(optional\)\s*/i, "").trim();
  return t ? t[0].toUpperCase() + t.slice(1) : s;
};
const norm = (s: string) => s.toLowerCase().replace(/\s*\(optional\)\s*/, "").replace(/_\d+$/, "").trim();

/**
 * The default of every widget input of a subgraph instance, by instance id and input name. Three sources, best first: the instance's
 * promoted widgets (properties.proxyWidgets lists [interior node, widget] in the order the schema's defaults come in); the instance's
 * widgets_values when they line up with the subgraph's widget inputs; the schema's defaults skipping the picture/clip/sound sockets.
 * (The schema lists its defaults in a promoted-widget order that does not follow its slots when some slots are sockets.)
 */
function subgraphDefaults(slots: any[], instances: Map<string, any>, subgraphs: Map<string, any>) {
  const out = new Map<string, Map<string, unknown>>();
  for (const [id, node] of instances) {
    const sg = subgraphs.get(node.type);
    if (!sg) continue;
    const mine = slots.filter((s) => String(s.node_id) === id);
    const widgets = (sg.inputs ?? []).filter((i: any) => WIDGET_TYPES.has(String(i.type).split(",")[0]));
    const map = new Map<string, unknown>();
    const proxy: any[] = node.properties?.proxyWidgets;
    if (Array.isArray(proxy) && proxy.length) {
      for (const input of sg.inputs ?? []) {
        const link = (sg.links ?? []).find((l: any) => l.id === input.linkIds?.[0]);
        const target = link ? (sg.nodes ?? []).find((n: any) => n.id === link.target_id) : null;
        const inputName = target?.inputs?.[link.target_slot]?.name;
        const at = proxy.findIndex((p) => String(p[0]) === String(target?.id) && p[1] === inputName);
        if (at >= 0 && mine[at] !== undefined && WIDGET_TYPES.has(String(input.type).split(",")[0])) map.set(input.name, mine[at].default);
      }
    } else if (Array.isArray(node.widgets_values) && widgets.length === node.widgets_values.length) {
      widgets.forEach((w: any, i: number) => map.set(w.name, node.widgets_values[i]));
    } else {
      widgets.forEach((w: any, i: number) => map.set(w.name, mine[i]?.default));
    }
    out.set(id, map);
  }
  return out;
}

/** A number slot with the range its name suggests. */
function numberSlot(id: string, label: string, name: string, value: unknown, target: Target): Slot {
  const r = RANGES[norm(name)];
  const dflt = typeof value === "number" ? value : undefined;
  // a default beyond the usual range (a two-minute song) widens it
  const max = r && dflt !== undefined && dflt > r[1] ? Math.max(r[1], Math.ceil(dflt * 4)) : r?.[1];
  return { id, label, kind: "number", required: false, advanced: !PRIMARY_NUMBERS.has(norm(name)), default: dflt, ...(r ? { min: r[0], max, step: r[2] } : {}), target };
}

/**
 * The form of a template made from get_template_schema's answer (`schema`) and the template's own workflow file (`wf`, optional):
 *  - a template that exposes its inputs through a subgraph: one slot per declared input, labelled by the subgraph's own labels;
 *  - a template that does not: its loader nodes, its positive prompt, its seed and a few well-known numbers, from the executed graph.
 * Model pickers (unet, clip, vae, LoRA...) are left out of the form and listed in `models`.
 */
export function buildForm(schema: any, wf?: any): Form {
  const slots: Slot[] = [];
  const models: string[] = [];
  const notes: string[] = [];
  const used = new Set<string>();
  const unique = (base: string) => {
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}${n}`;
    used.add(id);
    return id;
  };

  if (Array.isArray(schema?.slots) && schema.slots.length) {
    const instances = new Map<string, any>((wf?.nodes ?? []).map((n: any) => [String(n.id), n]));
    const subgraphs = new Map<string, any>((wf?.definitions?.subgraphs ?? []).map((s: any) => [s.id, s]));
    const links = new Map<number, any[]>((wf?.links ?? []).map((l: any) => [l[0], l]));
    const defaults = subgraphDefaults(schema.slots, instances, subgraphs);
    // the inputs a subgraph instance declares go in slot_overrides; the widgets it merely promotes onto its face (route: input_overrides)
    // go in input_overrides keyed by the instance's id: the route the schema's own note names. A name the instance declares is not listed twice.
    const declared = new Set<string>(schema.slots.filter((x: any) => x.source === "subgraph_input").map((x: any) => `${x.node_id}:${x.input_name}`));
    for (const s of schema.slots) {
      const promoted = s.source === "promoted_widget" && s.route === "input_overrides" && !declared.has(`${s.node_id}:${s.input_name}`) && String(s.type) !== "*";
      if (s.source !== "subgraph_input" && !promoted) continue;
      const node = instances.get(String(s.node_id));
      const input = subgraphs.get(node?.type)?.inputs?.find((i: any) => i.name === s.input_name);
      const rawLabel = String(input?.label ?? input?.name ?? s.input_name);
      const label = norm(rawLabel);
      const optional = /\(optional\)/i.test(rawLabel);
      const type = String(s.type ?? input?.type ?? "").split(",")[0];
      const dflt = promoted ? s.default : defaults.get(String(s.node_id))?.get(s.input_name);
      // where a value for this slot is written
      const at: Target = promoted ? { via: "input", node: String(s.node_id), input: String(s.input_name) } : { via: "slot", address: s.address };

      if (!promoted && (type === "IMAGE" || type === "VIDEO" || type === "AUDIO")) {
        const kind = type.toLowerCase() as "image" | "video" | "audio";
        let target: Target | null = null;
        // the loader that feeds this input: through the instance's link, else the one the schema names
        const link = links.get(node?.inputs?.find((i: any) => i.name === s.input_name)?.link);
        const origin = link ? instances.get(String(link[1])) : null;
        if (origin && LOADERS[origin.type]) target = { via: "input", node: String(origin.id), input: LOADERS[origin.type].input };
        else if (s.wired_to?.node_id && s.wired_to.inputs) target = { via: "input", node: String(s.wired_to.node_id), input: Object.keys(s.wired_to.inputs)[0] };
        if (!target) continue;
        slots.push({ id: unique(label.replace(/\W+/g, "_") || kind), label: nice(rawLabel), kind, required: !optional, advanced: false, target });
        continue;
      }
      if (type === "COMBO") {
        if (MODEL_COMBO.test(label) || !FRIENDLY_COMBO.test(label)) {
          if (dflt && (!promoted || MODEL_COMBO.test(label))) models.push(String(dflt));
          continue;
        }
        slots.push({ id: unique(label), label: nice(rawLabel), kind: "combo", required: false, advanced: false, default: dflt, target: at });
        continue;
      }
      if (/seed/.test(label)) {
        slots.push({ id: unique("seed"), label: "Seed", kind: "seed", required: false, advanced: false, default: typeof dflt === "number" ? dflt : undefined, target: at });
        continue;
      }
      if (type === "STRING") {
        const negative = NEGATIVE.test(label);
        const primary = PROMPT.test(label);
        slots.push({ id: unique(negative ? "negative" : primary ? "prompt" : label.replace(/\W+/g, "_")), label: negative ? "Negative prompt" : primary ? "Prompt" : nice(rawLabel), kind: "text", required: false, advanced: negative || !primary, multiline: true, default: typeof dflt === "string" ? dflt : undefined, target: at });
        continue;
      }
      if (type === "BOOLEAN") {
        slots.push({ id: unique(label.replace(/\W+/g, "_")), label: nice(rawLabel), kind: "boolean", required: false, advanced: true, default: typeof dflt === "boolean" ? dflt : undefined, target: at });
        continue;
      }
      if (type === "INT" || type === "FLOAT") {
        slots.push(numberSlot(unique(label.replace(/\W+/g, "_")), nice(rawLabel), label, dflt, at));
      }
    }
    if (!slots.length) notes.push("This template shows no inputs of its own: it runs as it is.");
    return { slots: order(slots), models: [...new Set(models)], notes };
  }

  // no subgraph: the executed graph's own nodes (their ids are the keys of input_overrides)
  const nodes: any[] = Array.isArray(schema?.nodes) ? schema.nodes : [];
  const negatives = new Set<string>();
  for (const n of nodes) for (const key of ["negative"]) if (Array.isArray(n.inputs?.[key])) negatives.add(String(n.inputs[key][0]));
  // a text encoder behind a conditioning pass-through is still the negative one
  for (const n of nodes) if (negatives.has(String(n.id))) for (const v of Object.values(n.inputs ?? {})) if (Array.isArray(v)) negatives.add(String(v[0]));
  let sawPrompt = false;
  for (const n of nodes) {
    const loader = LOADERS[n.class_type];
    const id = String(n.id);
    if (loader && n.inputs && loader.input in n.inputs) {
      slots.push({ id: unique(slots.some((x) => x.kind === loader.kind) ? `${loader.kind}${id}` : loader.kind), label: nice(slots.some((x) => x.kind === loader.kind) ? `${loader.kind} ${id}` : loader.kind), kind: loader.kind, required: true, advanced: false, target: { via: "input", node: id, input: loader.input } });
      continue;
    }
    for (const [name, value] of Object.entries<any>(n.inputs ?? {})) {
      if (Array.isArray(value) || value === null || typeof value === "object") continue;
      const key = norm(name);
      const target: Target = { via: "input", node: id, input: name };
      if (models.length < 8 && MODEL_COMBO.test(key) && typeof value === "string" && /\.(safetensors|ckpt|pt|pth|gguf)$/i.test(value)) {
        models.push(value);
        continue;
      }
      if (typeof value === "string" && PROMPT.test(key)) {
        const negative = negatives.has(id) || NEGATIVE.test(key);
        if (!negative) sawPrompt = true;
        slots.push({ id: unique(negative ? "negative" : key === "text" || key === "prompt" ? (sawPrompt && slots.some((x) => x.id === "prompt") ? `prompt${id}` : "prompt") : key), label: negative ? "Negative prompt" : key === "tags" ? "Style tags" : nice(name), kind: "text", required: false, advanced: negative, multiline: true, default: value, target });
        continue;
      }
      if (/^(noise_)?seed$/.test(key) && typeof value === "number") {
        if (!slots.some((x) => x.kind === "seed")) slots.push({ id: unique("seed"), label: "Seed", kind: "seed", required: false, advanced: false, default: value, target });
        continue;
      }
      if (typeof value === "number" && RANGES[key]) {
        // a length the prompt and the latent both carry is one field written in both places
        const twin = DURATION.has(key) ? slots.find((x) => x.kind === "number" && DURATION.has(norm(x.id)) && x.default === value) : null;
        if (twin) (twin.also ??= []).push(target);
        else slots.push(numberSlot(unique(key), nice(name), key, value, target));
      }
    }
  }
  if (!slots.length) notes.push("This template shows no inputs of its own: it runs as it is.");
  return { slots: order(slots), models: [...new Set(models)], notes };
}

/** Pictures, clips and sounds first, then the words, the rest, and the advanced ones last. */
function order(slots: Slot[]) {
  const rank = (s: Slot) => (s.advanced ? 3 : ["image", "video", "audio"].includes(s.kind) ? 0 : s.kind === "text" ? 1 : 2);
  return slots.map((s, i) => ({ s, i })).sort((a, b) => rank(a.s) - rank(b.s) || a.i - b.i).map((x) => x.s);
}

/** A slot as the page sees it (where it writes to stays on the server). */
export const publicSlot = ({ target: _t, also: _a, ...rest }: Slot) => rest;

// ------------------------------------------------------------------ the mini apps

/**
 * A mini app is a template shown simplified: a big picture, the one to three things the person has to give, one key. They are the
 * apps ComfyUI itself publishes (`isApp`: their author's own short form is extra.linearData, [[node, widget]] for each input worth
 * showing) and a hand-picked set of the easy, popular templates. The page and Truffle know an app by its short `id`.
 */
export type Need = "image" | "video" | "audio" | "words";
export interface AppDef {
  id: string;
  name: string;
  title: string;
  promise: string;
  /** what it asks for (the catalog's inputs say so too: this is for the ones it cannot say) */
  needs?: Need[];
  /** never shown (a step of a chain, an app the form cannot drive) */
  hide?: boolean;
}

/** The hand-picked apps, in the order the cards show them. */
export const CURATED_APPS: AppDef[] = [
  { id: "bg-remove", name: "utility_birefnet_remove_background", title: "Remove background", promise: "Cuts the subject out and leaves it on a clear background.", needs: ["image"] },
  { id: "upscale-pic", name: "utility_seedvr2_7b_int8_upscale_image", title: "Upscale a picture", promise: "Makes a picture larger and sharper, restoring its fine detail.", needs: ["image"] },
  { id: "pic-words", name: "image_z_image_turbo", title: "Picture from words", promise: "Describe it, get a picture in seconds.", needs: ["words"] },
  { id: "flux-pic", name: "image_flux2", title: "Picture with FLUX.2", promise: "Photorealistic pictures from words, and from reference pictures if you have them.", needs: ["words"] },
  { id: "edit-words", name: "image_qwen_image_edit_2509", title: "Edit with words", promise: "Say what to change in a picture; everything else stays.", needs: ["image", "words"] },
  { id: "restyle-pic", name: "flux_kontext_dev_basic", title: "Restyle a picture", promise: "Changes the style or the scene of a picture and keeps its subject.", needs: ["image", "words"] },
  { id: "nano-edit", name: "api_nano_banana_2_1_image_edit", title: "Edit with Nano Banana", promise: "A partner model edits your picture from one sentence.", needs: ["image", "words"] },
  { id: "relight-pic", name: "image_qwen_image_edit_2509_relight", title: "Relight a picture", promise: "Changes the light and the mood of a picture.", needs: ["image", "words"] },
  { id: "angles", name: "templates-1_click_multiple_character_angles-v1.0", title: "Character angles", promise: "One character picture, seen from many sides.", needs: ["image"] },
  { id: "pic-video", name: "video_ltx2_3_i2v", title: "Picture to video", promise: "Brings a picture to life as a short clip, with its sound.", needs: ["image", "words"] },
  { id: "words-video", name: "video_ltx2_3_t2v", title: "Video from words", promise: "Describe a shot and get a short clip, with its sound.", needs: ["words"] },
  { id: "wan-video", name: "video_wan2_2_14B_i2v", title: "Animate a picture", promise: "A calm, cinematic move out of a single picture.", needs: ["image", "words"] },
  { id: "sing", name: "video_ltx2_3_ia2v", title: "Make a picture sing", promise: "A picture speaks or sings the sound you give it.", needs: ["image", "audio"] },
  { id: "slow-mo", name: "utility_video_frame_interpolation", title: "Smooth slow motion", promise: "Adds the frames in between so a clip slows down smoothly.", needs: ["video"] },
  { id: "upscale-clip", name: "utility_seedvr2_3b_int8_upscale_video", title: "Upscale a clip", promise: "Restores a clip larger and sharper, frame by frame.", needs: ["video"] },
  { id: "remove-object", name: "template_ltx2_3_obscura_remova_lora_remove_object_from_video", title: "Remove an object from a clip", promise: "Say what to take out of the clip and it is painted out.", needs: ["video", "words"] },
  { id: "restyle-clip", name: "video_wan_vace_14B_v2v", title: "Restyle a clip", promise: "Turns a clip into another look: anime, clay, noir.", needs: ["video", "words"] },
  { id: "green-screen", name: "api_bria_video_green_screen", title: "Green screen", promise: "A partner service takes the background out of a clip.", needs: ["video"] },
  { id: "music", name: "audio_ace_step1_5_xl_turbo", title: "Music from words", promise: "A track from a few words, with lyrics or without.", needs: ["words"] },
  { id: "sounds", name: "audio_stable_audio_3_medium", title: "Sounds from words", promise: "Sound effects, ambience or music from a sentence.", needs: ["words"] },
  { id: "voice", name: "audio-chatterbox_tts", title: "Voice from text", promise: "Says a text in a natural voice, or in a voice you give it.", needs: ["words"] },
  { id: "split-track", name: "audio_melbandroformer_audio_separation", title: "Split a track", promise: "Separates the voice from the music.", needs: ["audio"] },
  { id: "sfx-partner", name: "api_elevenlabs_text_to_sound_effects", title: "Sound effects, partner", promise: "A partner model makes a clean sound effect from a sentence.", needs: ["words"] },
  { id: "to-3d", name: "3d_hunyuan3d-v2.1", title: "Picture to 3D", promise: "Turns a picture into a 3D model.", needs: ["image"] },
  { id: "to-splat", name: "3d_triposplat_image_to_gaussian_splat", title: "Picture to a 3D scene", promise: "A picture becomes a 3D scene you can orbit.", needs: ["image"] },
];

/** ComfyUI's own apps, named for the cards (the catalog's titles are long and technical). */
export const OFFICIAL_APPS: AppDef[] = [
  { id: "make-real", name: "templates_rob_image_to_real.app", title: "Make it real", promise: "Turns an illustration or a render into a realistic photo." },
  { id: "illustration", name: "template_qwen_image_illustration_lora", title: "Illustration style", promise: "Pictures from words in a soft, illustrated style." },
  { id: "variations", name: "templates_rob_realistic_2k_images_quick_variations.app", title: "Quick variations", promise: "Several realistic takes on one picture." },
  { id: "many-styles", name: "templates-1_input-multiple_styles_prompt.app", title: "Many styles at once", promise: "One picture, many different styles." },
  { id: "gummy", name: "template_sugar_coated_gummy_style_qwen", title: "Gummy style", promise: "Pictures from words as glossy, sugar-coated gummies." },
  { id: "new-angle", name: "template_qwen_multiangle.app", title: "Change the angle", promise: "See the same picture from another camera angle." },
  { id: "upscale-2k", name: "utility_z_image_turbo_2k_upscaler.app", title: "2K upscaler", promise: "Enlarges a picture to 2K with crisp detail." },
  { id: "product-ad", name: "template_sferro21_product_ad.app", title: "Product ad", promise: "Puts your product into an ad picture with a person." },
  { id: "product-swap", name: "templates-subject_product_swap.app", title: "Swap the product", promise: "Replaces the product in a picture with yours." },
  { id: "holding-product", name: "templates-subject_holding_product.app", title: "Holding your product", promise: "A person holds your product in a natural photo." },
  { id: "contact-sheet", name: "template_contact_sheet-step_1.app", title: "Contact sheet", promise: "A character, shown in a contact sheet of poses.", hide: true },
  { id: "contact-sheet-2", name: "template_contact_sheet-step_2.app", title: "Contact sheet, step 2", promise: "The second step of a chain.", hide: true },
  { id: "contact-sheet-3", name: "template_contact_sheet-step_3.app", title: "Contact sheet, step 3", promise: "The third step of a chain.", hide: true },
  { id: "fashion-shoot", name: "templates_rob_fashion_shoot_vton-4in1.app", title: "Fashion shoot", promise: "A try-on shoot from a person and a garment." },
  { id: "portrait-light", name: "templates_rob_portrait_light_migration.app", title: "Portrait light", promise: "Moves the light of one picture onto a portrait." },
  { id: "live-portrait", name: "templates_liveportrait.app", title: "Live portrait", promise: "A portrait takes on the expression of a clip." },
  { id: "game-style", name: "templates_3d_match_game_art_style.app", title: "Match an art style", promise: "Redraws a picture in the style of another." },
  { id: "sky-360", name: "templates_text_prompt_to_360hdr.app", title: "A 360° sky from words", promise: "A 360 degree environment from one sentence." },
];

export interface App {
  id: string;
  name: string;
  title: string;
  promise: string;
  group: Group;
  medium: Medium;
  thumb: string;
  thumbKind: "image" | "audio";
  /** the picture it dissolves to (a before/after), when the template has one */
  after: string | null;
  needs: Need[];
  outputs: string[];
  partner: boolean;
  credits: number | null;
  curated: boolean;
  isApp: boolean;
  models: string[];
  /** the slots that matter and the ones under More settings, once the form has been read (else null) */
  primary: string[] | null;
  advanced: string[] | null;
}

const slug = (name: string) => name.replace(/\.app$/, "").replace(/^(templates?|utility|image|video|audio)[_-]/, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 22) || "app";
/** The first sentence of a long description, as a promise when nobody wrote one. */
const firstSentence = (text: string) => {
  const one = text.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s/)[0] ?? "";
  return one.length > 90 ? `${one.slice(0, 88).trim()}…` : one;
};

/**
 * The apps of a catalog: the hand-picked ones that are in it (the others are skipped), then ComfyUI's own, in the order of
 * their definitions, then any app the catalog has gained since (named and promised from its own title and description).
 */
export function appsOf(items: Item[], curated: AppDef[] = CURATED_APPS, official: AppDef[] = OFFICIAL_APPS): App[] {
  const by = new Map(items.map((i) => [i.name, i]));
  const out: App[] = [];
  const seen = new Set<string>();
  const make = (def: AppDef | null, i: Item, isCurated: boolean) => {
    const needs: Need[] = def?.needs ?? [...(["image", "video", "audio"] as const).filter((k) => i.inputs.includes(k)), ...(i.inputs.includes("text") ? (["words"] as const) : [])];
    out.push({
      id: def?.id ?? slug(i.name),
      name: i.name,
      title: def?.title ?? i.title,
      promise: def?.promise ?? firstSentence(i.description),
      group: i.group,
      medium: i.medium,
      thumb: i.thumb,
      thumbKind: i.thumbKind,
      after: i.variant && i.thumbKind === "image" ? `${i.thumb}?n=2` : null,
      needs,
      outputs: i.outputs,
      partner: i.partner,
      credits: i.credits,
      curated: isCurated,
      isApp: i.isApp,
      models: i.models,
      primary: null,
      advanced: null,
    });
    seen.add(i.name);
  };
  for (const def of curated) {
    const i = by.get(def.name);
    if (i && !def.hide && !seen.has(def.name)) make(def, i, true);
  }
  for (const def of official) {
    const i = by.get(def.name);
    if (i && !def.hide && !seen.has(def.name)) make(def, i, false);
  }
  const known = new Set([...curated, ...official].map((d) => d.name));
  for (const i of items) if (i.isApp && !known.has(i.name) && !seen.has(i.name)) make(null, i, false);
  // two apps never share an id
  const ids = new Set<string>();
  for (const a of out) {
    let id = a.id;
    for (let n = 2; ids.has(id); n++) id = `${a.id}-${n}`;
    ids.add((a.id = id));
  }
  return out;
}

const MEDIA_KINDS = ["image", "video", "audio"];
/** A widget of an app's own form that is a file the person gives (the loader nodes' names: image, video, "choose video to upload"...). */
const MEDIA_WIDGET = /^(images?|video|audio|choose (video|audio|file|image)|upload|file)\b/i;
const PROMPT_WIDGET = /^(prompt|text|positive[ _]?prompt|description|instructions?|caption|input[ _]?text)$/i;

/**
 * Which slots of a form are the app's own and which are More settings. Three at most, the pictures, clips and sounds first, then
 * the words, then a choice (an aspect, a resolution) the author put in the app's own form:
 *  - an app with `linearData` (ComfyUI's author-made short form): its inputs say what matters: as many files as it has loaders, the
 *    prompt if it lists one, a choice it names. `partial` is true when the app asks for more files than this form can take (a loader of a
 *    custom node): such an app would run on its sample, so it is not shown;
 *  - any other template: the files it needs (the first one when none is required), then its main prompt, and nothing else.
 * The slots come back in that order with `primary` and `advanced` set; `needs` is what the primary ones ask for.
 */
export function splitSlots(form: Form, linear?: { inputs?: unknown[] } | null): { slots: Slot[]; primary: string[]; advanced: string[]; needs: Need[]; partial: boolean; files: number } {
  const media = form.slots.filter((s) => MEDIA_KINDS.includes(s.kind));
  const tail = (s: Slot) => (s.target.via === "slot" ? s.target.address.split(".").pop() ?? "" : s.target.input).toLowerCase();
  const widgets = (Array.isArray(linear?.inputs) ? linear!.inputs! : []).map((e) => String(Array.isArray(e) ? e[1] : "").toLowerCase().trim()).filter(Boolean);
  // the slot an author's widget is: by the name it writes to, else by the slot's own name or label
  const slotFor = (w: string) => form.slots.find((x) => tail(x) === w || x.id === w.replace(/\s+/g, "_") || x.label.toLowerCase() === w);
  const texts = form.slots.filter((s) => s.kind === "text" && !/negative/.test(s.id));
  const named = widgets.map(slotFor).find((x) => x?.kind === "text");
  const prompt = named ?? texts.find((s) => s.id === "prompt") ?? texts[0];
  let chosen: Slot[] = [];
  let partial = false;
  let files = 0;
  if (widgets.length) {
    files = widgets.filter((w) => MEDIA_WIDGET.test(w) && !/preview/.test(w)).length;
    const wantsPrompt = !!prompt && (!!named || widgets.some((w) => PROMPT_WIDGET.test(w)));
    chosen = [...media.slice(0, Math.min(files, media.length, wantsPrompt ? 2 : 3))];
    if (wantsPrompt) chosen.push(prompt!);
    for (const w of widgets) {
      const c = slotFor(w);
      if (c?.kind === "combo" && !chosen.includes(c) && chosen.length < 3) chosen.push(c);
    }
    // it asks for more files than the form can take, or for nothing the form can take at all: it would run on its sample
    partial = files > media.length || !chosen.length;
  } else {
    // the first file of each kind that must be given (a picture and a sound), else the first file there is, then the main prompt
    const must = MEDIA_KINDS.map((k) => media.find((s) => s.kind === k && s.required)).filter((s): s is Slot => !!s);
    chosen = [...(must.length ? must : media.slice(0, 1))];
    files = chosen.length;
    if (prompt) chosen.push(prompt);
  }
  chosen = chosen.slice(0, 3);
  const mark = (s: Slot, primary: boolean): Slot => ({
    ...s,
    primary,
    advanced: !primary,
    // a prompt the subgraph calls "value" is just "Prompt" to the person
    ...(primary && s.kind === "text" && /^(value|text|string|string a|user input|input)$/i.test(s.label) ? { label: "Prompt" } : {}),
  });
  const rest = form.slots.filter((s) => !chosen.includes(s));
  const slots = [...chosen.map((s) => mark(s, true)), ...rest.map((s) => mark(s, false))];
  const needs: Need[] = [...(MEDIA_KINDS.filter((k) => chosen.some((s) => s.kind === k)) as Need[]), ...(chosen.some((s) => s.kind === "text") ? (["words"] as Need[]) : [])];
  return { slots, primary: chosen.map((s) => s.id), advanced: rest.map((s) => s.id), needs, partial, files };
}

// ------------------------------------------------------------------ the request

export interface Uploaded {
  /** the name Cloud knows an uploaded file by: what the loader's input takes */
  name: string;
}
export interface RunRequest {
  name: string;
  slot_overrides: Record<string, unknown>;
  input_overrides: Record<string, Record<string, unknown>>;
}

/**
 * The run_template request for a form, the values the person gave (by slot id) and the files already uploaded (by slot id). Only
 * what was given is sent: an empty field leaves the template's own value. Numbers are clamped to the slot's range, a combo to its
 * options, a missing required picture/clip/sound is an error.
 */
/**
 * Settings of a template's own nodes, by node id, beyond what its form shows: what a product's pipeline sets on a template it
 * runs (a voice, an instruction to a writer node). Only node ids, input names and plain values are kept; the rest is dropped.
 */
export function withOverrides(req: RunRequest, overrides: unknown): RunRequest {
  if (!overrides || typeof overrides !== "object") return req;
  for (const [node, inputs] of Object.entries(overrides as Record<string, unknown>)) {
    if (!/^\d+$/.test(node) || !inputs || typeof inputs !== "object") continue;
    for (const [k, v] of Object.entries(inputs as Record<string, unknown>)) {
      if (!/^[a-z_][\w.]*$/i.test(k)) continue;
      if (typeof v === "string") (req.input_overrides[node] ??= {})[k] = v.slice(0, 8000);
      else if ((typeof v === "number" && Number.isFinite(v)) || typeof v === "boolean") (req.input_overrides[node] ??= {})[k] = v;
    }
  }
  return req;
}

export function buildRunRequest(name: string, form: Form, values: Record<string, unknown>, uploaded: Record<string, Uploaded> = {}): RunRequest {
  const req: RunRequest = { name, slot_overrides: {}, input_overrides: {} };
  const write = (t: Target, value: unknown) => {
    if (t.via === "slot") req.slot_overrides[t.address] = value;
    else (req.input_overrides[t.node] ??= {})[t.input] = value;
  };
  let current: Slot | null = null;
  const put = (t: Target, value: unknown) => {
    write(t, value);
    for (const more of current?.also ?? []) write(more, value);
  };
  for (const s of form.slots) {
    current = s;
    const v = values[s.id];
    if (s.kind === "image" || s.kind === "video" || s.kind === "audio") {
      const up = uploaded[s.id];
      if (!up) {
        if (s.required) throw Object.assign(new Error(`${s.label} needs a ${s.kind === "image" ? "picture" : s.kind === "video" ? "clip" : "sound"}.`), { status: 400 });
        continue;
      }
      put(s.target, up.name);
      continue;
    }
    if (v === undefined || v === null || v === "") continue;
    if (s.kind === "text") {
      const text = String(v).slice(0, 4000);
      if (text.trim() && text !== s.default) put(s.target, text);
    } else if (s.kind === "number" || s.kind === "seed") {
      let n = Number(v);
      if (!Number.isFinite(n)) continue;
      if (s.kind === "seed") n = Math.min(4294967295, Math.max(0, Math.floor(n)));
      else {
        if (s.min !== undefined) n = Math.max(s.min, n);
        if (s.max !== undefined) n = Math.min(s.max, n);
        if (s.step && Number.isInteger(s.step)) n = Math.round(n);
      }
      put(s.target, n);
    } else if (s.kind === "boolean") put(s.target, v === true || v === "true");
    else if (s.kind === "combo") {
      const opt = String(v);
      if (!s.options || s.options.includes(opt)) put(s.target, opt);
    }
  }
  return req;
}

/** The loader name of an uploaded file: Cloud stores by content hash, and the loaders take `<hash>.<ext>`. */
export function loaderName(asset: { name?: string; asset_hash?: string; hash?: string }, ext: string) {
  if (asset.name && /^[a-f0-9]{64}\./i.test(asset.name)) return asset.name;
  // (Cloud's /assets answers the stored name as `hash`, "<64 hex>.mp4"; an older answer gave `asset_hash`, "blake3:<64 hex>")
  if (asset.hash && /^[a-f0-9]{64}\.\w+$/i.test(asset.hash)) return asset.hash;
  const hex = String(asset.hash ?? asset.asset_hash ?? "").replace(/^blake3:/, "").replace(/\.\w+$/, "");
  return /^[a-f0-9]{64}$/i.test(hex) ? `${hex}.${ext}` : asset.name ?? `${hex}.${ext}`;
}

// ------------------------------------------------------------------ prices, answers, outputs

/** What estimate_credits said, as a number when it gives one: a total, else a per-unit rate (flagged), else zero partner credits. */
export function parseCredits(text: string): { credits: number | null; perUnit: string | null; note: string } {
  const zero = /^\s*0 credits/.test(text);
  if (zero) return { credits: 0, perUnit: null, note: "No partner credits: it runs on Cloud GPU time." };
  const total = text.match(/Estimated total:\s*~?\s*([\d.]+)\s*credits?/i);
  if (total) return { credits: Math.round(Number(total[1]) * 10) / 10, perUnit: null, note: "Estimated total, without GPU time." };
  const rates = [...text.matchAll(/~\s*([\d.]+)\s*credits?\s*\/\s*([A-Za-z]+)/g)];
  if (rates.length) {
    const sum = rates.reduce((n, m) => n + Number(m[1]), 0);
    return { credits: Math.round(sum * 10) / 10, perUnit: rates[0][2].toLowerCase(), note: `About ${Math.round(sum * 10) / 10} credits per ${rates[0][2].toLowerCase()}, plus GPU time.` };
  }
  return { credits: null, perUnit: null, note: "The price is not known before the run." };
}

/** A failure of Cloud, said plainly: a model it lacks is a note to import it, not a wall of JSON. */
export function explainError(raw: string): { message: string; needsImport: boolean } {
  const text = String(raw ?? "");
  if (/value not in list|missing.*model|model.*not found|invalid_workflow/i.test(text) && /safetensors|ckpt|model|lora|unet|vae/i.test(text)) {
    const file = text.match(/([\w.\-]+\.(?:safetensors|ckpt|gguf|pt))/i)?.[1];
    return { message: `Comfy Cloud is missing a model this template needs${file ? ` (${file})` : ""}. It has to be imported into your Cloud library first.`, needsImport: true };
  }
  if (/402|insufficient|credits/i.test(text) && /credit|402/i.test(text)) return { message: "Not enough credits on Comfy Cloud for this run.", needsImport: false };
  if (/429|queue_full/i.test(text)) return { message: "Comfy Cloud's queue is full. Try again in a minute.", needsImport: false };
  if (/subscription|plan/i.test(text) && /active|required/i.test(text)) return { message: "Running on Comfy Cloud needs an active plan.", needsImport: false };
  return { message: text.replace(/\s+/g, " ").trim().slice(0, 300) || "That didn't work.", needsImport: false };
}

/** The first text of an MCP tool result. */
export const mcpText = (result: any): string => (result?.content ?? []).map((c: any) => (typeof c?.text === "string" ? c.text : "")).join("\n").trim();

export interface Output {
  filename: string;
  subfolder: string;
  type: string;
  kind: "image" | "video" | "audio" | "model";
  ext: string;
  node: string;
  width?: number;
  height?: number;
  seconds?: number;
}
const EXT_KIND: Record<string, Output["kind"]> = {
  png: "image", jpg: "image", jpeg: "image", webp: "image", gif: "image", bmp: "image",
  mp4: "video", webm: "video", mov: "video", mkv: "video",
  mp3: "audio", wav: "audio", flac: "audio", ogg: "audio", m4a: "audio", opus: "audio",
  glb: "model", gltf: "model", obj: "model", ply: "model", splat: "model", stl: "model", fbx: "model",
};

/** The files a finished job made (from GET /api/jobs/{id}): the saved ones, not the inputs it echoed or its temp previews. */
export function jobOutputs(detail: any): Output[] {
  const out: Output[] = [];
  const temp: Output[] = [];
  for (const [node, groups] of Object.entries<any>(detail?.outputs ?? {})) {
    for (const list of Object.values<any>(groups ?? {})) {
      if (!Array.isArray(list)) continue;
      for (const f of list) {
        if (!f || typeof f.filename !== "string" || f.type === "input") continue;
        const ext = f.filename.split(".").pop()?.toLowerCase() ?? "";
        const kind = EXT_KIND[ext];
        if (!kind) continue;
        const o: Output = { filename: f.filename, subfolder: String(f.subfolder ?? ""), type: String(f.type ?? "output"), kind, ext, node, width: f.metadata?.width, height: f.metadata?.height, seconds: f.metadata?.duration };
        (f.type === "temp" ? temp : out).push(o);
      }
    }
  }
  return out.length ? out : temp;
}

/** The words of Cloud's job status that end a job well, and the ones that end it badly or by a cancel; any other word is a job on its way. */
export const isDone = (s: string) => /^(success|completed|succeeded)$/.test(s);
export const isOver = (s: string) => /^(error|errored|failed|failure|cancelled|canceled|timeout|timed_out|expired|rejected)$/.test(s);

/** The error a failed job carries, from its execution messages. */
export function jobError(detail: any): string {
  const msgs: any[] = detail?.execution_status?.messages ?? [];
  const e = msgs.find((m) => m?.[0] === "execution_error")?.[1];
  if (e) return `${e.node_type ? `${e.node_type}: ` : ""}${e.exception_message ?? e.exception_type ?? "failed"}`;
  return String(detail?.error ?? detail?.execution_status?.status_str ?? "That didn't work.");
}

// ------------------------------------------------------------------ Cloud

export interface Cloud {
  /** a read-only MCP tool (get_template_schema, estimate_credits...) as its text */
  mcp(tool: string, args: Record<string, unknown>): Promise<string>;
  /** the paid ones: run_template, cancel_job */
  mcpRun(tool: string, args: Record<string, unknown>): Promise<string>;
  /** GET a Cloud REST path as JSON */
  rest(path: string): Promise<any>;
  /** a Cloud output file's bytes by its view parameters */
  view(file: { filename: string; subfolder: string; type: string }): Promise<{ bytes: Buffer; type: string }>;
  /** sends a file Cloud's loaders can name; answers that name */
  upload(kind: "image" | "video" | "audio", file: { name: string; bytes: Buffer; type: string }): Promise<string>;
}

export function realCloud(key: string, f: typeof fetch = fetch): Cloud {
  let session = "";
  /** Every call has its own id: with one id for all of them, calls made at once on a session could be answered with each other's results. */
  let seq = 1;
  const url = `${CLOUD}/mcp`;
  const headers = (extra: Record<string, string> = {}) => ({ "Content-Type": "application/json", Accept: "application/json, text/event-stream", "X-API-Key": key, "MCP-Protocol-Version": "2025-06-18", ...(session ? { "mcp-session-id": session } : {}), ...extra });
  const parse = (body: string) => {
    const data = body.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).pop() ?? body;
    return JSON.parse(data);
  };
  async function init() {
    session = "";
    const res = await f(url, { method: "POST", headers: headers(), signal: AbortSignal.timeout(30_000), body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "comfyture", version: "0.1" } } }) });
    if (!res.ok) throw new Error(`Comfy Cloud's tools answered ${res.status}.`);
    session = res.headers.get("mcp-session-id") ?? "";
    await f(url, { method: "POST", headers: headers(), body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) }).catch(() => {});
  }
  async function call(tool: string, args: Record<string, unknown>, retry = true): Promise<string> {
    if (!session) await init();
    const id = ++seq;
    const res = await f(url, { method: "POST", headers: headers(), signal: AbortSignal.timeout(60_000), body: JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name: tool, arguments: args } }) });
    if ((res.status === 400 || res.status === 404 || res.status === 401) && retry) {
      session = "";
      return call(tool, args, false);
    }
    const text = await res.text();
    if (!res.ok) throw new Error(`Comfy Cloud's tools answered ${res.status}: ${text.slice(0, 200)}`);
    const msg = parse(text);
    // an answer that is not to this call is never taken for it
    if (msg.id !== undefined && msg.id !== id) {
      if (retry) return call(tool, args, false);
      throw new Error("Comfy Cloud's tools answered out of turn. Try again.");
    }
    if (msg.error) throw new Error(String(msg.error.message ?? "Comfy Cloud's tools failed."));
    const out = mcpText(msg.result);
    if (msg.result?.isError) throw new Error(out || "Comfy Cloud's tools failed.");
    return out;
  }
  const api = (path: string, init: RequestInit = {}) => f(`${CLOUD}/api${path}`, { signal: AbortSignal.timeout(init.method === "POST" ? 120_000 : 30_000), ...init, headers: { "X-API-Key": key, ...(init.headers as Record<string, string> | undefined) } });
  return {
    mcp: (tool, args) => call(tool, args),
    mcpRun: (tool, args) => call(tool, args),
    async rest(path) {
      const res = await api(path);
      if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
      return res.json();
    },
    async view({ filename, subfolder, type }) {
      const q = new URLSearchParams({ filename, subfolder, type });
      const first = await api(`/view?${q}`, { redirect: "manual" });
      // the redirect is to signed storage: no key goes there
      const res = first.status >= 300 && first.status < 400 && first.headers.get("location") ? await f(first.headers.get("location")!) : first;
      if (!res.ok) throw new Error(`The file ${filename} could not be downloaded (${res.status}).`);
      return { bytes: Buffer.from(await res.arrayBuffer()), type: res.headers.get("content-type") ?? "" };
    },
    async upload(kind, file) {
      const form = new FormData();
      if (kind === "image") {
        form.set("image", new Blob([file.bytes], { type: file.type }), file.name);
        const res = await api("/upload/image", { method: "POST", body: form });
        if (!res.ok) throw new Error(`The picture could not be sent to Comfy Cloud (${res.status}).`);
        return String((await res.json()).name);
      }
      form.set("file", new Blob([file.bytes], { type: file.type }), file.name);
      form.set("tags", "input");
      form.set("name", file.name);
      form.set("mime_type", file.type);
      const res = await api("/assets", { method: "POST", body: form });
      if (!res.ok) throw new Error(`The ${kind} could not be sent to Comfy Cloud (${res.status}).`);
      return loaderName(await res.json(), file.name.split(".").pop() ?? "bin");
    },
  };
}

/** The stand-in for the paid calls (COMFYTURE_FAKE_TEMPLATES=1 and the tests): a job that takes a few seconds and makes a picture. */
export function fakeRun(base: Cloud, seconds = 4): Cloud {
  const jobs = new Map<string, number>();
  const calls: { tool: string; args: any }[] = [];
  return {
    ...base,
    mcpRun: async (tool, args) => {
      calls.push({ tool, args });
      if (tool === "run_template") {
        const id = `fake-${randomBytes(6).toString("hex")}`;
        jobs.set(id, Date.now());
        return JSON.stringify({ prompt_id: id, status: "submitted" });
      }
      return "cancelled";
    },
    rest: async (path) => {
      const id = path.split("/").filter(Boolean).find((p) => p.startsWith("fake-"));
      if (!id) return base.rest(path);
      const started = jobs.get(id) ?? 0;
      const done = Date.now() - started > seconds * 1000;
      // (the words are Cloud's own: a job just sent is queued_waiting, then in_progress, and a finished one answers success)
      if (path.startsWith("/job/")) return { id, status: done ? "success" : Date.now() - started > 500 ? "in_progress" : "queued_waiting" };
      return { id, status: done ? "completed" : "in_progress", outputs: done ? { 9: { images: [{ filename: `${id}.png`, subfolder: "fake", type: "output", metadata: { width: 256, height: 256 } }] } } : {} };
    },
    view: async () => ({ bytes: png(256, 256), type: "image/png" }),
    upload: async (_kind, file) => `fake-${createHash("sha256").update(file.bytes).digest("hex").slice(0, 16)}-${file.name}`,
    ...({ calls } as object),
  } as Cloud;
}

/** A plain PNG (a soft gradient), written here so the stand-in needs no image library. */
export function png(w: number, h: number): Buffer {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = 242 - Math.round((y / h) * 100);
      raw[o + 1] = 255 - Math.round((x / w) * 120);
      raw[o + 2] = 89 + Math.round(((x + y) / (w + h)) * 100);
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const head = Buffer.alloc(13);
  head.writeUInt32BE(w, 0);
  head.writeUInt32BE(h, 4);
  head.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", head), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

// ------------------------------------------------------------------ the service

export interface Deps {
  data: string;
  root: string;
  cloud: Cloud | null;
  /** plain GETs (the catalog, workflows, thumbnails: no key) */
  fetch?: typeof fetch;
  /** read the apps' forms, prices and pictures in the background once the catalog is in (off in tests) */
  warm?: boolean;
  /** a sound into the app's audio library (main.ts's keepAudio) */
  keepAudio?: (bytes: Buffer, ext: string, meta: { name: string; kind: string; prompt?: string }) => Promise<{ file: string; url: string; seconds: number }>;
}
export interface Job {
  id: string;
  status: "running" | "done" | "failed" | "canceled";
  progress: number;
  template: string;
  promptId: string;
  outputs: { kind: string; url: string; file: string; width?: number; height?: number; seconds?: number; name?: string; saved?: string }[];
  error?: string;
  needsImport?: boolean;
  credits?: number | null;
}
export type Answer = { status: number; body?: unknown; raw?: Buffer; type?: string; cache?: string };

const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex").slice(0, 16);
const fail = (message: string, status = 400) => Object.assign(new Error(message), { status });
const exists = (p: string) => stat(p).then(() => true, () => false);

export function createTemplates(deps: Deps) {
  const f = deps.fetch ?? fetch;
  const dir = join(deps.data, "templates");
  let items: Item[] = [];
  let loaded = 0;
  let loading: Promise<void> | null = null;
  const credits = new Map<string, { credits: number | null; perUnit: string | null; note: string }>();
  const forms = new Map<string, { form: Form; linear: any; at: number }>();
  /** what reading an app's form found: its slots split into its own and More settings, and whether the form can drive it */
  const appInfo = new Map<string, { primary: string[]; advanced: string[]; needs: Need[]; partial: boolean; files: number }>();
  const jobs = new Map<string, Job & { stop?: () => void }>();
  let featured: string[] = [];
  let timings: Record<string, number> = {};

  async function ready() {
    if (items.length && Date.now() - loaded < DAY) return;
    loading ??= (async () => {
      await mkdir(dir, { recursive: true });
      const cache = join(dir, "index.json");
      let index: any[] | null = null;
      const fresh = await stat(cache).then((s) => Date.now() - s.mtimeMs < DAY, () => false);
      if (fresh) index = JSON.parse(await readFile(cache, "utf8").catch(() => "null"));
      for (const url of INDEX_URLS) {
        if (index) break;
        try {
          const res = await f(url);
          if (res.ok) {
            index = await res.json();
            await writeFile(cache, JSON.stringify(index));
          }
        } catch {}
      }
      // offline: the last copy, however old
      index ??= JSON.parse(await readFile(cache, "utf8").catch(() => "null"));
      if (!index) throw fail("The template catalog could not be reached. Check the connection and try again.", 503);
      items = flatten(index);
      loaded = Date.now();
      try {
        featured = JSON.parse(await readFile(join(deps.root, "docs", "research", "comfy-templates-shortlist.json"), "utf8")).map((x: any) => String(x.id));
      } catch {
        featured = [];
      }
      try {
        const c = JSON.parse(await readFile(join(dir, CREDITS_FILE), "utf8"));
        for (const [k, v] of Object.entries<any>(c)) credits.set(k, v);
      } catch {}
      try {
        timings = JSON.parse(await readFile(join(dir, "timings.json"), "utf8"));
      } catch {}
    })().finally(() => (loading = null));
    await loading;
  }
  const withCredits = (i: Item): Item => ({ ...i, credits: credits.get(i.name)?.credits ?? null });
  const find = async (name: string) => {
    await ready();
    const i = NAME.test(name) ? items.find((x) => x.name === name) : null;
    if (!i) throw fail("That template is not in the catalog.", 404);
    return i;
  };

  /** A template's form, and the short form its author made for it when it is an app (extra.linearData), read once a day. */
  async function formOf(name: string): Promise<{ form: Form; linear: any }> {
    const isApp = items.find((x) => x.name === name)?.isApp === true;
    const usable = (e: any) => e && Date.now() - e.at < DAY && (e.linear !== undefined || !isApp);
    const hit = forms.get(name);
    if (usable(hit)) return { form: hit!.form, linear: hit!.linear ?? null };
    const file = join(dir, FORMS_DIR, `${name}.json`);
    const cached = await readFile(file, "utf8").then((t) => JSON.parse(t), () => null);
    if (usable(cached)) {
      forms.set(name, cached);
      return { form: cached.form, linear: cached.linear ?? null };
    }
    if (!deps.cloud) throw fail("Connect Comfy Cloud to see what this template asks for: paste a Comfy API key in the account window (top right).", 501);
    const text = await deps.cloud.mcp("get_template_schema", { template_id: name });
    let schema: any;
    try {
      schema = JSON.parse(text);
    } catch {
      throw fail(`Comfy Cloud could not describe this template: ${text.slice(0, 160)}`, 502);
    }
    // the template's own workflow gives its labels and loaders; without it the form is made from the schema alone
    const wf = await f(`${CLOUD}/templates/${name}.json`, { signal: AbortSignal.timeout(20_000) }).then((r) => (r.ok ? r.json() : null), () => null);
    const form = buildForm(schema, wf);
    const entry = { form, linear: wf?.extra?.linearData ?? null, at: Date.now() };
    forms.set(name, entry);
    await mkdir(join(dir, FORMS_DIR), { recursive: true });
    await writeFile(file, JSON.stringify(entry)).catch(() => {});
    return { form, linear: entry.linear };
  }
  const schemaOf = async (name: string): Promise<Form> => (await formOf(name)).form;

  const appDefs = () => appsOf(items);
  const appNamed = (name: string) => appDefs().find((a) => a.name === name) ?? null;
  /** An app's form with its slots split (and remembered): the same form the page draws, its own inputs first. */
  async function appFormOf(name: string) {
    const { form, linear } = await formOf(name);
    const split = splitSlots(form, linear);
    appInfo.set(name, { primary: split.primary, advanced: split.advanced, needs: split.needs, partial: split.partial, files: split.files });
    return { form, split };
  }
  /** An app that cannot be shown simply: its form cannot take all the files it asks for, or it asks for more than a few. */
  const unusable = (info?: { partial: boolean; files: number }) => !!info && (info.partial || info.files > 3);

  async function estimate(name: string) {
    await find(name);
    if (!deps.cloud) return { credits: null, perUnit: null, note: "Connect Comfy Cloud to see the price: a Comfy API key in the account window." };
    const got = credits.get(name);
    if (got) return got;
    const text = await deps.cloud.mcp("estimate_credits", { template_name: name });
    const out = parseCredits(text);
    credits.set(name, out);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, CREDITS_FILE), JSON.stringify(Object.fromEntries(credits))).catch(() => {});
    return out;
  }

  async function thumb(name: string, n: number, still = false): Promise<Answer> {
    const item = await find(name);
    const ext = n === 1 && item.thumbKind === "audio" ? "mp3" : "webp";
    const file = join(dir, "thumbs", `${name}-${n}.${ext}`);
    const type = ext === "mp3" ? "audio/mpeg" : "image/webp";
    // a still: the first frame of an animated picture, cut once and kept beside it (one that does not move is sent as it is)
    const stillFile = join(dir, "thumbs", `${name}-${n}.still.webp`);
    if (still && ext === "webp" && (await exists(stillFile))) return { status: 200, raw: await readFile(stillFile), type, cache: "public, max-age=86400" };
    let bytes: Buffer;
    if (await exists(file)) bytes = await readFile(file);
    else {
      const res = await f(`${CLOUD}/templates/${name}-${n}.${ext}`, { signal: AbortSignal.timeout(20_000) }).catch(() => null);
      if (!res?.ok) return { status: 404, body: { error: "No picture for that one." } };
      bytes = Buffer.from(await res.arrayBuffer());
      await mkdir(join(dir, "thumbs"), { recursive: true });
      await writeFile(file, bytes).catch(() => {});
    }
    if (still && ext === "webp") {
      const first = firstFrame(bytes);
      if (first) {
        await writeFile(stillFile, first).catch(() => {});
        return { status: 200, raw: first, type, cache: "public, max-age=86400" };
      }
    }
    return { status: 200, raw: bytes, type, cache: "public, max-age=86400" };
  }

  /** A library file by its name: the photos, clips and sounds the app keeps (and what the edit tools made). */
  async function localFile(kind: "image" | "video" | "audio", name: unknown) {
    const file = typeof name === "string" ? name.replace(/^.*[\\/]/, "") : "";
    if (!file || !NAME.test(file)) throw fail("That file is missing. Add it again.");
    const dirs = kind === "image" ? ["photos"] : kind === "video" ? ["videos", "edits", "reels"] : ["audio", "videos"];
    for (const d of dirs) {
      const path = join(deps.data, d, file);
      if (await exists(path)) return { path, file };
    }
    throw fail("That file is missing. Add it again.");
  }
  const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", ogg: "audio/ogg", flac: "audio/flac" };

  /** Re-hosts a finished file in the library; answers what the page needs to show it. */
  async function keep(o: Output, bytes: Buffer, job: Job) {
    const ext = o.ext === "jpeg" ? "jpg" : o.ext;
    const name = `${sha(bytes)}.${ext}`;
    const place = async (folder: string) => {
      await mkdir(join(deps.data, folder), { recursive: true });
      const path = join(deps.data, folder, name);
      if (!(await exists(path))) await writeFile(path, bytes);
      return path;
    };
    if (o.kind === "image") {
      const path = await place("photos");
      const info = await probe(path);
      return { kind: "image", url: `/media/photos/${name}`, file: name, width: info.width || o.width, height: info.height || o.height, saved: o.filename };
    }
    if (o.kind === "video") {
      const path = await place(ext === "mp4" ? "videos" : "edits");
      const info = await probe(path);
      return { kind: "video", url: `/media/${ext === "mp4" ? "videos" : "edits"}/${name}`, file: name, width: info.width || o.width, height: info.height || o.height, seconds: info.duration || o.seconds, saved: o.filename };
    }
    if (o.kind === "audio") {
      if (deps.keepAudio) {
        const a = await deps.keepAudio(bytes, `.${ext}`, { name: items.find((i) => i.name === job.template)?.title ?? "Template sound", kind: "template", prompt: job.template });
        return { kind: "audio", url: a.url, file: a.file, seconds: a.seconds, name: items.find((i) => i.name === job.template)?.title };
      }
      const path = await place("audio");
      return { kind: "audio", url: `/media/audio/${name}`, file: name, seconds: (await probe(path)).duration };
    }
    await place("models");
    return { kind: "model", url: `/media/models/${name}`, file: name };
  }
  async function probe(path: string) {
    try {
      const { stdout } = await exec("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height", "-of", "json", path]);
      const j = JSON.parse(stdout);
      const v = (j.streams ?? []).find((s: any) => s.codec_type === "video");
      return { duration: Math.round((Number(j.format?.duration) || 0) * 100) / 100, width: Number(v?.width) || 0, height: Number(v?.height) || 0 };
    } catch {
      return { duration: 0, width: 0, height: 0 };
    }
  }

  async function run(name: string, body: any): Promise<Job> {
    const item = await find(name);
    // open weights only (COMFYTURE_OPEN_WEIGHTS): a partner's model never runs, whatever page asks
    if (item.partner && process.env.COMFYTURE_OPEN_WEIGHTS?.trim()) throw fail(`Open weights only is on: ${item.title || name} runs a partner's model.`, 403);
    spend("render");
    if (!deps.cloud) throw fail("Connect Comfy Cloud to run templates: paste a Comfy API key in the account window (top right). The examples and tours work without one.", 501);
    const form = await schemaOf(name);
    const values = body?.inputs && typeof body.inputs === "object" ? body.inputs : {};
    // the pictures, clips and sounds go to Cloud first, each under the name its loader takes
    const uploaded: Record<string, Uploaded> = {};
    // (a file two slots take, the clip and its "before" of a comparison, is sent once)
    const sent = new Map<string, string>();
    for (const s of form.slots) {
      if (s.kind !== "image" && s.kind !== "video" && s.kind !== "audio") continue;
      const v = values[s.id];
      const file = typeof v === "string" ? v : v?.file;
      if (!file) continue;
      const key = `${s.kind}:${file}`;
      if (!sent.has(key)) {
        const local = await localFile(s.kind, file);
        const ext = local.file.split(".").pop()?.toLowerCase() ?? "";
        sent.set(key, await deps.cloud.upload(s.kind, { name: local.file, bytes: await readFile(local.path), type: MIME[ext] ?? "application/octet-stream" }));
      }
      uploaded[s.id] = { name: sent.get(key)! };
    }
    const req = withOverrides(buildRunRequest(name, form, values, uploaded), body?.overrides);
    const confirm = body?.confirm === true;
    let text: string;
    try {
      text = await deps.cloud.mcpRun("run_template", { ...req, ...(confirm ? { confirm: true } : {}) });
    } catch (e: any) {
      throw fail(explainError(e.message).message, 502);
    }
    let promptId = "";
    try {
      promptId = String(JSON.parse(text).prompt_id ?? "");
    } catch {
      promptId = text.match(/prompt_id["'\s:=]+([0-9a-zA-Z-]{8,})/)?.[1] ?? "";
    }
    if (!promptId) {
      // spend-gated: Cloud asked for a yes the person has not given
      if (/confirm/i.test(text) && !confirm) throw fail("This template spends credits: confirm the price to run it.", 402);
      throw fail(`Comfy Cloud did not start the template: ${text.slice(0, 200)}`, 502);
    }
    // finished jobs are kept an hour, for a page that asks late
    for (const [id, j] of jobs) if (j.status !== "running" && Date.now() - ((j as any).ended ?? Date.now()) > 3600_000) jobs.delete(id);
    const job: Job & { stop?: () => void } = { id: `tpl-${randomBytes(6).toString("hex")}`, status: "running", progress: 0.02, template: name, promptId, outputs: [], credits: credits.get(name)?.credits ?? null };
    jobs.set(job.id, job);
    const ended = () => ((job as any).ended = Date.now());
    void follow(job, item).catch((e) => {
      // (what a run could not do is told in the server's log as well as to the person: a job that finished on Cloud and still failed here is read from it)
      console.warn(`template ${name} (${promptId}) failed here:`, e instanceof Error ? e.stack ?? e.message : e);
      job.status = "failed";
      const x = explainError(e.message);
      job.error = x.message;
      job.needsImport = x.needsImport;
    }).finally(ended);
    return job;
  }

  /** Follows a job on Cloud to its end: progress from the time similar runs took, then the files, kept. */
  async function follow(job: Job & { stop?: () => void }, item: Item) {
    const cloud = deps.cloud!;
    const began = Date.now();
    const expected = timings[item.name] ?? (item.medium === "video" ? 120 : item.medium === "3d" ? 90 : 40);
    let canceled = false;
    job.stop = () => {
      canceled = true;
      void cloud.mcpRun("cancel_job", { prompt_id: job.promptId }).catch(() => {});
    };
    for (let i = 0; i < 1500 && !canceled; i++) {
      await sleep(i === 0 ? 400 : 2000);
      const st: any = await cloud.rest(`/job/${job.promptId}/status`).catch(() => null);
      const s = String(st?.status ?? "");
      if (process.env.COMFYTURE_DEBUG) console.log(`template ${item.name} (${job.promptId}) poll ${i}: ${s || "(no answer)"}`);
      if (isDone(s)) break;
      if (isOver(s)) {
        const detail = await cloud.rest(`/jobs/${job.promptId}`).catch(() => null);
        const e = explainError(jobError(detail ?? { error: s }));
        job.status = /^cancel/.test(s) ? "canceled" : "failed";
        job.error = job.status === "canceled" ? "Canceled." : e.message;
        job.needsImport = e.needsImport;
        return;
      }
      // anything else is a job still on its way (Cloud says waiting_to_dispatch, queued_waiting, pending, in_progress...): only a word that
      // ends a job ends the wait, so a new word of Cloud's is waited through, never taken for a failure (a job taken for one had run on)
      if (/progress|running|execut/.test(s)) job.progress = Math.max(job.progress, Math.min(0.95, 0.05 + ((Date.now() - began) / 1000 / expected) * 0.9));
      else job.progress = Math.max(job.progress, 0.03);
      continue;
    }
    if (canceled) {
      job.status = "canceled";
      job.error = "Canceled.";
      return;
    }
    if (job.status !== "running") return;
    const detail = await cloud.rest(`/jobs/${job.promptId}`);
    const files = jobOutputs(detail);
    if (!files.length) throw fail("The template finished without making a file.");
    for (const o of files) {
      const { bytes } = await cloud.view(o);
      job.outputs.push(await keep(o, bytes, job));
    }
    job.progress = 1;
    job.status = "done";
    // the next run of this template is timed by this one
    timings[item.name] = timings[item.name] ? timings[item.name] * 0.6 + ((Date.now() - began) / 1000) * 0.4 : (Date.now() - began) / 1000;
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "timings.json"), JSON.stringify(timings)).catch(() => {});
  }

  const view = (j: Job) => ({ id: j.id, status: j.status, progress: j.progress, template: j.template, outputs: j.outputs, error: j.error, needsImport: j.needsImport, credits: j.credits });

  /** The workflow's nodes and models in a few lines: what "View graph" shows. */
  async function graph(name: string) {
    await find(name);
    const wf: any = await f(`${CLOUD}/templates/${name}.json`).then((r) => (r.ok ? r.json() : null), () => null);
    if (!wf) throw fail("The template's workflow could not be fetched.", 502);
    const counts = new Map<string, number>();
    const add = (type: string) => counts.set(type, (counts.get(type) ?? 0) + 1);
    const models = new Set<string>();
    const walk = (nodes: any[]) => {
      for (const n of nodes ?? []) {
        if (["Note", "MarkdownNote", "Reroute", "PrimitiveNode"].includes(n.type) || n.mode === 4) continue;
        if (!/^[0-9a-f]{8}-/.test(String(n.type))) add(String(n.type));
        for (const m of n.properties?.models ?? []) if (m?.name) models.add(String(m.name));
      }
    };
    walk(wf.nodes);
    for (const sg of wf.definitions?.subgraphs ?? []) walk(sg.nodes);
    return { nodes: [...counts].sort((a, b) => b[1] - a[1]).map(([type, count]) => ({ type, count })), models: [...models], subgraphs: (wf.definitions?.subgraphs ?? []).length };
  }

  /** The apps, with what is known of them (price, own inputs), filtered by a search and a group; the ones that cannot be driven are left out. */
  async function appsView(query: { q?: string; group?: string; limit?: number; offset?: number }) {
    await ready();
    if (deps.warm !== false) void warmApps();
    const words = (query.q ?? "").toLowerCase().split(/[\s,]+/).filter(Boolean);
    let list = appDefs().map((a): App => {
      const info = appInfo.get(a.name);
      return { ...a, credits: credits.get(a.name)?.credits ?? null, ...(info ? { primary: info.primary, advanced: info.advanced, needs: info.needs.length || !a.needs.length ? info.needs : a.needs } : {}) };
    }).filter((a) => !unusable(appInfo.get(a.name)));
    const total = list.length;
    const groups = new Map<string, number>();
    for (const a of list) groups.set(a.medium, (groups.get(a.medium) ?? 0) + 1);
    if (words.length) list = list.filter((a) => { const hay = `${a.title} ${a.promise} ${a.name} ${a.models.join(" ")} ${a.needs.join(" ")}`.toLowerCase(); return words.every((w) => hay.includes(w)); });
    if (query.group && query.group !== "all") list = list.filter((a) => a.medium === query.group || a.group === query.group);
    const offset = Math.max(0, Math.floor(query.offset ?? 0));
    const limit = Math.min(200, Math.max(1, Math.floor(query.limit ?? 100)));
    return { count: list.length, total, categories: [{ id: "all", name: "All", count: total }, ...(["image", "video", "audio", "3d"] as const).map((g) => ({ id: g, name: GROUP_NAME[g], count: groups.get(g) ?? 0 }))], items: list.slice(offset, offset + limit) };
  }

  let warming: Promise<void> | null = null;
  /**
   * Reads every app's form, price and pictures in the background (free calls), a few at a time, so the cards open fast, show their
   * price, and the apps that cannot be driven drop out. Nothing here costs credits; a failure of one app leaves it as it was.
   */
  function warmApps() {
    if (!deps.cloud) return Promise.resolve();
    return (warming ??= (async () => {
      const list = appDefs();
      let at = 0;
      const lane = async () => {
        while (at < list.length) {
          const a = list[at++];
          await thumb(a.name, 1).catch(() => {});
          if (a.after) await thumb(a.name, 2).catch(() => {});
          await appFormOf(a.name).catch(() => {});
          await estimate(a.name).catch(() => {});
        }
      };
      await Promise.all([lane(), lane(), lane()]);
    })().catch(() => {}));
  }

  /** Estimates the partner templates of a page of the catalog in the background (free calls), so their cards can show a price. */
  function warm(list: Item[]) {
    if (!deps.cloud) return;
    const todo = list.filter((i) => i.partner && !credits.has(i.name)).slice(0, 12);
    let at = 0;
    const lane = async () => {
      while (at < todo.length) await estimate(todo[at++].name).catch(() => {});
    };
    void Promise.all([lane(), lane()]);
  }

  // the apps' forms, prices and pictures are read a moment after the server starts, out of the way of everything else
  if (deps.cloud && deps.warm !== false) setTimeout(() => void ready().then(() => warmApps()).catch(() => {}), 2500).unref?.();

  return {
    /** The routes under api/utensils/templates; `rest` is what follows that prefix. */
    async handle(method: string, rest: string, query: URLSearchParams, body: any): Promise<Answer> {
      const parts = rest.split("/").filter(Boolean);
      if (!parts.length && method === "GET" && query.get("apps") === "1") return { status: 200, body: await appsView({ q: query.get("q") ?? "", group: query.get("group") ?? "", limit: Number(query.get("limit")) || undefined, offset: Number(query.get("offset")) || undefined }) };
      if (!parts.length && method === "GET") {
        await ready();
        const out = listing(items, { q: query.get("q") ?? "", group: query.get("group") ?? query.get("category") ?? "", tag: query.get("tag") ?? "", featured: query.get("featured") === "1", limit: Number(query.get("limit") ?? 48), offset: Number(query.get("offset") ?? 0) }, featured);
        if (query.get("featured") === "1") warm(out.items);
        return { status: 200, body: { ...out, items: out.items.map(withCredits) } };
      }
      if (parts[0] === "library" && !parts[1] && method === "GET") {
        await ready();
        const out = library(items);
        return { status: 200, body: { ...out, items: out.items.map((i) => ({ ...i, credits: credits.get(i.name)?.credits ?? i.credits })) } };
      }
      if (parts[0] === "apps" && !parts[1] && method === "GET") return { status: 200, body: await appsView({ q: query.get("q") ?? "", group: query.get("group") ?? "", limit: Number(query.get("limit")) || undefined, offset: Number(query.get("offset")) || undefined }) };
      if (parts[0] === "thumb" && parts[1] && method === "GET") return thumb(parts[1], query.get("n") === "2" ? 2 : 1, query.get("still") === "1");
      if (parts[0] === "job" && parts[1]) {
        const j = jobs.get(parts[1]);
        if (!j) return { status: 404, body: { error: "That job is gone." } };
        if (method === "DELETE") {
          j.stop?.();
          return { status: 200, body: view(j) };
        }
        return { status: 200, body: view(j) };
      }
      const name = parts[0];
      if (!name) return { status: 404, body: { error: "Not found." } };
      if (!parts[1] && method === "GET") {
        const item = withCredits(await find(name));
        const app = appNamed(name);
        // an app comes with its slots split: its own first, the rest under More settings
        if (app) {
          const { form, split } = await appFormOf(name);
          return { status: 200, body: { ...item, app: { id: app.id, title: app.title, promise: app.promise, needs: split.needs, partial: split.partial, usable: !unusable(split) }, schema: { slots: split.slots.map(publicSlot), models: form.models, notes: form.notes } } };
        }
        const form = await schemaOf(name);
        return { status: 200, body: { ...item, schema: { slots: form.slots.map(publicSlot), models: form.models, notes: form.notes } } };
      }
      if (parts[1] === "graph" && method === "GET") return { status: 200, body: await graph(name) };
      if (parts[1] === "estimate" && method === "POST") return { status: 200, body: await estimate(name) };
      if (parts[1] === "run" && method === "POST") return { status: 202, body: view(await run(name, body)) };
      return { status: 404, body: { error: "Not found." } };
    },
    /** For tests and the page-free callers. */
    flatten,
    schemaOf,
    formOf,
    appsView,
    warmApps,
    appFormOf,
    estimate,
    run,
    jobs,
    ready,
  };
}
