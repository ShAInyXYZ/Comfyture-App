// Builds Utensils' knowledge of the official ComfyUI workflows: knowledge/utensils/workflows.json, one entry per workflow of Comfy
// Cloud's catalogue (data/templates/index.json, cached by server/comfy-templates.ts), saying what it does, how it works, what it takes
// and gives, how to use it here, what it costs and what usually comes before and after it. Truffle reads it to suggest the tools and
// workflows for a job (server/utensils-knowledge.ts); the Library shows it.
//
// What it reads: the index; each workflow's graph (https://cloud.comfy.org/templates/<name>.json, free, cached under
// data/templates/graphs/); the official tutorials the index links (docs.comfy.org pages as Markdown, cached under
// data/templates/tutorials/); the partner prices Cloud estimated (data/templates/credits*.json); the hand-written text of
// knowledge/utensils/curated.json. What it keeps: every field an entry of the current workflows.json lists in its `curated` array is
// never overwritten, and curated.json's fields win over what is generated. The tools' knowledge (tools.json) is written by hand and not
// touched here.
//
//   node scripts/utensils-knowledge.ts            fetch what is not cached yet, then write workflows.json
//   node scripts/utensils-knowledge.ts --offline  only what is cached
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const DATA = join(root, "data", "templates");
const OUT = join(root, "knowledge", "utensils");
const offline = process.argv.includes("--offline");
const exists = (p: string) => access(p).then(() => true, () => false);
const readJson = async (p: string, fallback: any = null) => (await exists(p) ? JSON.parse(await readFile(p, "utf8")) : fallback);

export type Kind = "image" | "video" | "audio" | "words" | "3d" | "mask" | "none";
export interface Entry {
  id: string; kind: "tool" | "workflow"; name: string; section: string; category: string;
  what: string; how: string; takes: Kind[]; gives: Kind[]; goodFor: string[]; limits: string[]; use: string[];
  models: string[]; cost: "free" | "gpu" | "partner"; credits: number | null; before: string[]; after: string[];
  tutorial: string | null; open: { workspace: string; tool?: string; workflow?: string }; keywords: string[]; curated: string[];
}

/** Partner node families: the start of a node's type, and the company it sends the job to. */
const PARTNERS: [RegExp, string][] = [
  [/^Gemini|NanoBanana|^Veo|Imagen/, "Google"], [/^OpenAI|GPTImage|Sora/, "OpenAI"], [/^ByteDance|Seedream|Seedance/, "ByteDance"],
  [/^Kling/, "Kling"], [/^Runway/, "Runway"], [/^Luma/, "Luma"], [/^Tripo/, "Tripo"], [/^Recraft/, "Recraft"], [/^Bria/, "Bria"],
  [/^Beeble/, "Beeble"], [/^Magnific/, "Magnific"], [/^ElevenLabs/, "ElevenLabs"], [/^MiniMax|Hailuo/, "MiniMax"], [/^Pika/, "Pika"],
  [/^Ideogram/, "Ideogram"], [/^StabilityStable|^StabilityAudio|^StabilityUpscale/, "Stability AI"], [/^Moonvalley/, "Moonvalley"],
  [/^Vidu/, "Vidu"], [/^Topaz/, "Topaz"], [/^Rodin/, "Rodin"], [/^Meshy/, "Meshy"], [/^Sonilo/, "Sonilo"], [/^Wan(Text|Image)ToVideoApi|^WanApi/, "Alibaba"],
  [/^Hunyuan3DApi|^Tencent/, "Tencent"], [/^Flux.*Pro|^BFL/, "Black Forest Labs"], [/^FishAudio/, "Fish Audio"], [/^Krea/, "Krea"], [/^Hitem3D/, "Hitem3D"],
  [/^Grok/, "xAI (Grok)"], [/^OpenRouter/, "OpenRouter"], [/^Claude/, "Anthropic (Claude)"], [/^Wavespeed/, "WaveSpeed"], [/^HeyGen/, "HeyGen"],
  [/^LtxApi/, "Lightricks"], [/^HappyHorse/, "HappyHorse"], [/^Pixverse/, "PixVerse"], [/^Quiver/, "Quiver"], [/^Qwen.*Api$/, "Alibaba (Qwen)"],
  [/^MetaMuse/, "Meta"], [/^Clarity/, "Clarity AI"], [/^HitPaw/, "HitPaw"], [/^Higgsfield/, "Higgsfield"], [/^Pruna/, "Pruna"], [/^Sync(LipSync|Talking)/, "Sync Labs"],
];

const GOOD_FOR: Record<string, string[]> = {
  "Text to Image": ["a picture from words", "generate an image"], "Image Edit": ["edit a picture with words", "change part of a photo"],
  "Image to Video": ["animate a picture", "bring a photo to life"], "Text to Video": ["a video from words", "a short clip from a description"],
  "Image Upscale": ["upscale a picture", "make a photo sharper"], "Video Upscale": ["upscale a video", "a sharper clip"],
  "Image to 3D": ["a 3d model from a picture"], "Text to 3D": ["a 3d model from words"], "3D": ["a 3d asset"],
  "Lip Sync": ["make a face talk or sing"], "Remove Background": ["remove the background"], "Relight": ["change the lighting"],
  Inpainting: ["fill or replace part of a picture"], Outpainting: ["extend a picture beyond its edges"], "Style Reference": ["match a style"],
  "Character Reference": ["keep the same character"], "Motion Control": ["copy a motion onto a character"], "Text to Audio": ["a sound or music from words"],
  "Video Edit": ["edit a video with words"], FLF2V: ["a clip between a first and a last frame"], "Reference to Video": ["a video from reference pictures"],
  ControlNet: ["follow the pose, edges or depth of a picture"], Anime: ["anime style"], "Text Generation": ["write or expand a prompt"],
  "Video to Video": ["restyle a video"], "Text to Speech": ["a voice from text"], Music: ["music from words"],
};
const CATEGORY_GOOD: Record<string, string[]> = {
  "Product & Ads": ["product shots", "ad visuals"], "Character & Fashion": ["try on clothes", "a character in many poses"],
  "Brand & Design": ["logos and brand visuals"], Vector: ["svg vector art"], LLM: ["write or describe with a language model"],
};
const NOUN: Record<string, string> = { image: "a picture", video: "a clip", audio: "a sound", words: "your words", "3d": "a 3D model", mask: "a mask" };
const FILE: Record<string, string> = { image: "a picture (PNG)", video: "a clip (MP4)", audio: "a sound", "3d": "a 3D model (GLB)", words: "text" };

const join_ = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const clean = (s: string) => String(s ?? "").replace(/\s+/g, " ").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").trim();
/** What it is: the first sentence of the description that says what it makes, not only what to upload. */
const ASK = /^(Upload|Input|Provide|Select|Enter|Load|Drop|Add|Choose|Give|Type|Write|Set)\b/i;
const DOES = /\b(generat|creat|make|turn|transform|produc|get|receiv|convert|edit|appl|replac|remov|upscal|extend|swap|animat)/i;
function whatOf(desc: string, title: string) {
  const sentences = (clean(desc).match(/(?:[^.!?]|[.!?](?!\s|$))+[.!?]*(?=\s|$)/g) ?? [clean(desc)]).map((x) => x.trim()).filter(Boolean);
  const said = sentences.find((x) => x.length >= 20 && !(ASK.test(x) && !DOES.test(x)));
  if (said) return firstSentence(said);
  return firstSentence(`${clean(title)}: ${(sentences[0] ?? "").replace(/^./, (c) => c.toLowerCase())}`);
}
/** The first sentence of a description, ending with a full stop. */
function firstSentence(s: string) {
  const c = clean(s);
  const m = c.match(/^(.{20,240}?[.!?])(\s|$)/);
  const out = cap((m ? m[1] : c.slice(0, 220)).trim());
  return /[.!?]$/.test(out) ? out : `${out}.`;
}
/** A sentence starts with a capital (a model's lower-case name too: wan2.2 is Wan2.2 at the start). */
const cap = (s: string) => s.replace(/^[a-z]/, (c) => c.toUpperCase());

interface Graph { nodes?: any[]; definitions?: { subgraphs?: { nodes?: any[] }[] } }
const nodesOf = (g: Graph | null) => [...(g?.nodes ?? []), ...(g?.definitions?.subgraphs ?? []).flatMap((s) => s.nodes ?? [])];

/** What a graph does, read from its node types. */
function readGraph(g: Graph | null, open = false) {
  const types = new Set(nodesOf(g).map((n) => String(n?.type ?? "")));
  const has = (re: RegExp) => [...types].some((t) => re.test(t));
  // in an open workflow, only real API nodes count (GeminiNode, KlingFirstLastFrameNode...): open model nodes share partner names (MiniMaxH3..., Flux3...)
  const api = (t: string) => !open || /Node(V\d+)?$|Api/.test(t);
  const partners = [...new Set([...types].filter(api).flatMap((t) => PARTNERS.filter(([re]) => re.test(t)).map(([, p]) => p)))];
  const loras = nodesOf(g).filter((n) => /^LoraLoader/.test(n?.type ?? "")).map((n) => String(n?.widgets_values?.[0] ?? "")).filter(Boolean);
  return {
    partners,
    words: has(/TextEncode|PrimitiveStringMultiline|StringMultiline|TextGenerate|Prompt/) || partners.length > 0,
    llm: has(/^TextGenerate/),
    sampler: has(/KSampler|SamplerCustom|^SamplerCustomAdvanced|Guider/),
    video: has(/LTXV|EmptyHunyuanLatentVideo|WanVaceToVideo|WanImageToVideo|EmptyLTXVLatentVideo|WanVideo|CosmosImageToVideo|Wan22/),
    av: has(/LTXVConcatAVLatent|LTXVAudioVAE/),
    upsample: has(/LatentUpsampler|LatentUpscale|UpscaleModel|ImageUpscaleWithModel|SeedVR2/),
    control: has(/Canny|Depth|DWPose|OpenPose|Lineart|ControlNet/),
    mask: has(/LoadImageMask|ImageToMask|SolidMask|MaskComposite|InpaintModelConditioning/),
    loras: loras.length,
    reference: has(/ReferenceLatent|CLIPVisionEncode|IPAdapter|StyleModel/),
    threeD: has(/SaveGLB|Save3D|Hunyuan3D|TripoSG|Trellis|VoxelToMesh/),
    svg: has(/SaveSVG/),
    text: has(/SaveText|PreviewAny/) && !has(/SaveImage|SaveVideo|SaveAudio|SaveGLB/),
    saves: [...new Set([...types].flatMap((t) => (/^SaveImage|^SaveAnimated|PreviewImage$/.test(t) ? ["image"] : /^SaveVideo|VHS_VideoCombine/.test(t) ? ["video"] : /^SaveAudio/.test(t) ? ["audio"] : /SaveGLB|Save3D/.test(t) ? ["3d"] : /SaveSVG/.test(t) ? ["image"] : [])))] as Kind[],
  };
}

/** How it works, in plain words, from the graph and the index. */
/** The model names worth saying: a family is not said twice (Wan and Wan2.2 is Wan2.2). */
function modelNames(ms: string[]) {
  const norm = (m: string) => m.toLowerCase().replace(/[^a-z0-9]/g, "");
  const list = [...new Set(ms)];
  return list.filter((m) => !list.some((o) => o !== m && norm(o).startsWith(norm(m)) && norm(o) !== norm(m))).slice(0, 3);
}
function howOf(t: any, r: ReturnType<typeof readGraph>, takes: Kind[], gives: Kind[]) {
  const models = modelNames(t.models ?? []);
  const what = join_(takes.filter((k) => k !== "none").map((k) => NOUN[k]));
  const out = join_(gives.filter((k) => k !== "none").map((k) => (k === "image" && r.svg ? "an SVG vector picture" : FILE[k] ?? k)));
  if (r.partners.length || t.openSource === false) {
    const who = r.partners.length ? join_(r.partners) : models.length ? `the partner behind ${join_(models)}` : "a partner service";
    const named = models.filter((m) => !r.partners.some((p) => p.toLowerCase().startsWith(m.toLowerCase()) || m.toLowerCase().startsWith(p.toLowerCase())));
    return `This workflow sends ${what || "your request"} to ${who}${named.length && r.partners.length ? ` (${join_(named)})` : ""} through Comfy's partner nodes; their model does the work on their side and Comfy Cloud brings back ${out || "the result"}. It is billed in partner credits, at the price Cloud estimates before the run.`;
  }
  const s: string[] = [];
  s.push(`${models.length ? join_(models) : "An open model"} run${models.length > 1 ? "" : "s"} on Comfy Cloud${what ? `: the workflow takes ${what}` : ""}.`);
  const steps: string[] = [];
  if (r.llm) steps.push("a language model first expands your words into a detailed prompt");
  if (r.control) steps.push("it reads the structure of your picture (its edges, depth or pose) and follows it");
  if (r.reference) steps.push("your reference pictures guide the look");
  if (r.loras) steps.push(r.loras > 1 ? "LoRAs steer the model toward their specialty" : "a LoRA steers the model toward its specialty");
  if (r.sampler) steps.push(r.video ? (r.av ? "the model generates the frames and their sound together, step by step from noise" : "the model generates the frames of the clip step by step from noise") : r.threeD ? "the model builds the shape step by step" : gives.includes("audio") ? "the model generates the sound step by step from noise" : "the model draws the result step by step from noise");
  if (r.upsample) steps.push(r.sampler ? "a second pass upscales it for detail" : "the model re-draws it at a larger size with fine detail");
  if (!steps.length && r.threeD) steps.push("the model turns it into a 3D shape");
  if (steps.length) s.push(`${steps[0][0].toUpperCase()}${steps[0].slice(1)}${steps.length > 1 ? `, then ${join_(steps.slice(1))}` : ""}.`);
  if (out) s.push(`It saves ${out}.`);
  return s.join(" ");
}

/** The steps to use it here, in the Library's form. */
function useOf(takes: Kind[], cost: string, credits: number | null) {
  const u: string[] = [];
  for (const k of takes) if (k === "image") u.push("Drop a picture on its well"); else if (k === "video") u.push("Drop the clip on its well"); else if (k === "audio") u.push("Drop the sound on its well"); else if (k === "mask") u.push("Paint the area to change");
  if (takes.includes("words")) u.push("Write what you want in the words field");
  if (cost === "gpu") u.push("Open More settings for the seed, size or steps if you need them");
  u.push(`Press Run on Comfy Cloud and confirm the price${credits ? ` (about ${credits} cr)` : cost === "gpu" ? " (GPU time)" : ""}`);
  return u;
}

const WORDS = (s: string) => s.toLowerCase().replace(/[^a-z0-9.+ -]/g, " ").split(/\s+/).filter((w) => w.length > 1);

/** The chains around a workflow: the tools that often come before and after, by what it takes and gives. */
function chainsOf(t: any, takes: Kind[], gives: Kind[], tags: string[]) {
  const before: string[] = [];
  const after: string[] = [];
  const is = (re: RegExp) => tags.some((x) => re.test(x)) || re.test(t.title ?? "");
  if (takes.includes("image")) before.push(...(is(/background/i) ? ["upscale"] : is(/upscale/i) ? ["cutout", "edit"] : ["cutout", "upscale", "edit"]));
  if (takes.includes("video")) before.push("ed-trim");
  if (takes.includes("audio")) before.push(...(is(/lip|sync|sing/i) ? ["au-voice", "au-stems"] : ["au-clean"]));
  if (gives.includes("image")) after.push(...(is(/upscale/i) ? ["cutout", "wf:video_ltx2_3_i2v"] : is(/background/i) ? ["upscale", "wf:video_ltx2_3_i2v"] : ["upscale", "cutout", "wf:video_ltx2_3_i2v"]));
  if (gives.includes("video")) after.push(...(is(/upscale/i) ? ["ed-reframe", "ed-captions"] : ["upscale-video", "ed-reframe", "ed-captions"]));
  if (gives.includes("audio")) after.push(...(is(/speech|tts|voice/i) ? ["lipsync", "au-mix"] : ["au-master", "ed-audio"]));
  const self = `wf:${t.name}`;
  const uniq = (xs: string[]) => [...new Set(xs)].filter((x) => x !== self).slice(0, 4);
  return { before: uniq(before), after: uniq(after) };
}

async function fetchMissing(names: string[], tutorials: string[]) {
  const g = join(DATA, "graphs"), d = join(DATA, "tutorials");
  await mkdir(g, { recursive: true });
  await mkdir(d, { recursive: true });
  const jobs: (() => Promise<void>)[] = [];
  for (const n of names) jobs.push(async () => {
    const p = join(g, `${n}.json`);
    if (await exists(p)) return;
    const r = await fetch(`https://cloud.comfy.org/templates/${encodeURIComponent(n)}.json`).catch(() => null);
    if (r?.ok) await writeFile(p, await r.text());
  });
  for (const u of tutorials) jobs.push(async () => {
    const p = join(d, `${tutorialSlug(u)}.md`);
    if (await exists(p) || !/docs\.comfy\.org/.test(u)) return;
    const r = await fetch(`${u.replace(/\/$/, "")}.md`).catch(() => null);
    if (r?.ok) await writeFile(p, `<!-- ${u} -->\n${await r.text()}`);
  });
  let i = 0;
  await Promise.all(Array.from({ length: 4 }, async () => { while (i < jobs.length) await jobs[i++](); }));
}
const tutorialSlug = (u: string) => u.replace(/^https?:\/\/[^/]+\//, "").replace(/[^a-z0-9]+/gi, "_").replace(/_+$/, "");

/** The opening of a tutorial: its title and first paragraph, for a workflow whose own description is thin. */
async function tutorialLead(u: string | null) {
  if (!u) return null;
  const p = join(DATA, "tutorials", `${tutorialSlug(u)}.md`);
  if (!(await exists(p))) return null;
  const text = (await readFile(p, "utf8")).split("\n").filter((l) => !/^\s*>|^<!--|^\s*$|^#|^!\[|^\|/.test(l)).map(clean).filter((l) => l.length > 60 && !/http/.test(l));
  return text[0] ? firstSentence(text[0]) : null;
}

export async function build() {
  const index = await readJson(join(DATA, "index.json"), []);
  const list: { category: string; t: any }[] = index.flatMap((c: any) => (c.templates ?? []).map((t: any) => ({ category: c.title ?? c.category ?? "Other", t })));
  if (!offline) await fetchMissing(list.map((x) => x.t.name), [...new Set(list.map((x) => x.t.tutorialUrl).filter(Boolean))] as string[]);
  const credits: Record<string, any> = { ...(await readJson(join(DATA, "credits.json"), {})), ...(await readJson(join(DATA, "credits-2.json"), {})) };
  const curatedFile: Record<string, Partial<Entry>> = await readJson(join(OUT, "curated.json"), {});
  const previous: Entry[] = await readJson(join(OUT, "workflows.json"), []);
  const kept = new Map(previous.map((e) => [e.id, e]));
  const ids = new Set(list.map((x) => `wf:${x.t.name}`));
  const tools: Entry[] = await readJson(join(OUT, "tools.json"), []);
  const known = new Set([...ids, ...tools.map((t) => t.id)]);
  const out: Entry[] = [];
  for (const { category, t } of list) {
    const g: Graph | null = await readJson(join(DATA, "graphs", `${t.name}.json`), null);
    const r = readGraph(g, t.openSource === true);
    const ins = [...new Set((t.io?.inputs ?? []).map((x: any) => x.mediaType).filter(Boolean))] as Kind[];
    const outs = [...new Set((t.io?.outputs ?? []).map((x: any) => x.mediaType).filter(Boolean))] as Kind[];
    const tags: string[] = t.tags ?? [];
    const takes: Kind[] = [...ins];
    if ((r.words || t.openSource === false) && !takes.includes("words")) takes.push("words");
    if ((r.mask || tags.includes("Inpainting")) && takes.includes("image") && !takes.includes("mask")) takes.push("mask");
    if (!takes.length) takes.push("none");
    const gives: Kind[] = [...outs];
    for (const k of r.saves) if (!gives.includes(k)) gives.push(k);
    if (r.threeD && !gives.includes("3d")) gives.push("3d");
    if (r.text && !gives.length) gives.push("words");
    if (!gives.length) gives.push(r.svg ? "image" : "none");
    const partner = r.partners.length > 0 || t.openSource === false;
    const cost = partner ? "partner" : "gpu";
    const c = credits[t.name]?.credits;
    const price = typeof c === "number" && c > 0 ? c : null;
    const lead = await tutorialLead(t.tutorialUrl ?? null);
    const goodFor = [...new Set([...tags.flatMap((x) => GOOD_FOR[x] ?? []), ...(CATEGORY_GOOD[category] ?? [])])].slice(0, 6);
    const limits: string[] = [];
    if (partner) limits.push("partner credits, priced at the run");
    if (gives.includes("video") && !partner) limits.push("a few seconds per clip; longer clips cost more GPU time");
    if ((t.size ?? 0) > 40e9) limits.push("a very large model: the first run takes a while to load");
    const chains = chainsOf(t, takes, gives, tags);
    const models: string[] = t.models ?? [];
    const keywords = [...new Set([...tags, ...models, category, ...WORDS(t.title ?? ""), ...models.flatMap((m: string) => WORDS(m)), ...gives, ...takes.filter((k) => k !== "none"), partner ? "api partner" : "open weights", ...r.partners].map((x) => String(x).toLowerCase()))].filter(Boolean).slice(0, 40);
    const base: Entry = {
      id: `wf:${t.name}`, kind: "workflow", name: clean(t.title ?? t.name), section: "library", category,
      what: t.description ? whatOf(t.description, t.title ?? t.name) : firstSentence(lead || t.title),
      how: cap(howOf(t, r, takes, gives)),
      takes, gives, goodFor: goodFor.length ? goodFor : [clean(t.title ?? "").toLowerCase()], limits: limits.slice(0, 3), use: useOf(takes, cost, price),
      models, cost, credits: price, before: chains.before, after: chains.after, tutorial: t.tutorialUrl ?? null,
      open: { workspace: "templates", workflow: t.name }, keywords, curated: [],
    };
    // hand-written text wins: curated.json, then what the current file marks as curated
    const hand = curatedFile[base.id] ?? {};
    const prev = kept.get(base.id);
    const curated = new Set<string>([...(prev?.curated ?? []), ...Object.keys(hand)]);
    const e: any = { ...base };
    for (const f of prev?.curated ?? []) if (prev && f in prev) e[f] = (prev as any)[f];
    for (const [f, v] of Object.entries(hand)) e[f] = v;
    e.curated = [...curated].filter((f) => f !== "id" && f !== "curated");
    e.before = e.before.filter((x: string) => known.has(x));
    e.after = e.after.filter((x: string) => known.has(x));
    out.push(e as Entry);
  }
  await mkdir(OUT, { recursive: true });
  await writeFile(join(OUT, "workflows.json"), `${JSON.stringify(out, null, 1)}\n`);
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = await build();
  const curated = out.filter((e) => e.curated.length).length;
  console.log(`workflows.json: ${out.length} workflows, ${curated} with hand-written fields, ${out.filter((e) => e.tutorial).length} with a tutorial`);
}
