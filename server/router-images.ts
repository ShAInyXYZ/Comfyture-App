// The image models on Comfy Router: partner APIs (OpenAI, Google, Black Forest Labs, ByteDance,
// Qwen, Kling, Luma, Runway), billed in Comfy credits with the same Comfy key as everything else.
// Router runs each one, waits for it when the maker's own API is a queue, and hands back the
// finished answer in that maker's own shape. So a model here is a body to send and a reading of
// what came back: the picture, inline or behind a short-lived link that is fetched at once.
// Without a Comfy key, or with COMFYTURE_OPEN_WEIGHTS set, none of them is offered.

import { randomUUID } from "node:crypto";
import { ASPECTS, tagRefs } from "./images.ts";

/** A reference picture as the makers take it: its type and its bytes in base64. */
export type RouterRef = { mime: string; data: string };
type Ask = { prompt: string; aspect: string; refs: RouterRef[]; seed: number };
type Picture = { base64: string } | { url: string } | null;
type Model = {
  id: string;
  path: string;
  name: string;
  short: string;
  about: string;
  maker: string;
  /** about what a picture costs, in Comfy credits: measured (X-Comfy-Credits-Used), or Comfy's price list */
  credits: number;
  /** how many reference pictures it takes (0: words only) */
  refs: number;
  /** how its prompt names the nth reference ("" keeps the names) */
  tag: string;
  body: (a: Ask) => unknown;
  picture: (out: any) => Picture;
};

const ratio = (aspect: string) => ASPECTS[aspect] ?? 1;
/** Of the choices, the one nearest the aspect's shape. */
function nearest<T>(aspect: string, choices: [T, number][]): T {
  const r = Math.log(ratio(aspect));
  return choices.reduce((a, b) => (Math.abs(Math.log(b[1]) - r) < Math.abs(Math.log(a[1]) - r) ? b : a))[0];
}
/** About so many megapixels in the aspect, each side a multiple of 16. */
function pixels(aspect: string, mp = 1) {
  const r = ratio(aspect);
  const h = Math.sqrt((mp * 1048576) / r);
  return [Math.round((h * r) / 16) * 16, Math.round(h / 16) * 16];
}
const shapes = (list: string[]) => list.map((a) => [a, a.split(":").map(Number).reduce((w, h) => w / h)] as [string, number]);
const dataUri = (r: RouterRef) => `data:${r.mime};base64,${r.data}`;
// the first picture of a maker's answer, wherever that maker puts it
const dataList = (out: any): Picture => (out?.data?.[0]?.b64_json ? { base64: out.data[0].b64_json } : out?.data?.[0]?.url ? { url: out.data[0].url } : null);
const seed31 = (s: number) => Math.abs(s) % 2147483647;

const openai = (id: string, name: string, short: string, about: string, quality: string, credits: number): Model => ({
  id, path: `openai/${id}`, name, short, about, maker: "openai", credits, refs: 16, tag: "image {n}",
  body: (a) => ({ prompt: a.prompt, ...(a.refs.length ? { image: a.refs.map(dataUri) } : {}), size: pixels(a.aspect).join("x"), quality, n: 1, output_format: "jpeg" }),
  picture: dataList,
});
const VERTEX = shapes(["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"]);
const gemini = (id: string, name: string, short: string, about: string, credits: number): Model => ({
  id, path: `vertexai/${id}`, name, short, about, maker: "google", credits, refs: 14, tag: "image {n}",
  body: (a) => ({
    contents: [{ role: "user", parts: [...a.refs.map((r) => ({ inlineData: { mimeType: r.mime, data: r.data } })), { text: a.prompt }] }],
    generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: nearest(a.aspect, VERTEX), imageSize: "1K" } },
  }),
  picture: (out) => {
    for (const c of out?.candidates ?? []) for (const p of c?.content?.parts ?? []) {
      if (p?.inlineData?.data) return { base64: p.inlineData.data };
      if (p?.fileData?.fileUri) return { url: p.fileData.fileUri };
    }
    return null;
  },
});
const FLUX3 = shapes(["21:9", "2:1", "16:9", "3:2", "7:5", "4:3", "5:4", "1:1", "4:5", "3:4", "5:7", "2:3", "9:16", "1:2", "9:21"]);
const SEEDREAM = (aspect: string) => pixels(aspect, 1.01).join("x");
const QWEN = shapes(["16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3", "21:9"]);
const QWEN_SIZE: Record<string, string> = { "16:9": "1664*928", "9:16": "928*1664", "1:1": "1328*1328", "4:3": "1472*1104", "3:4": "1104*1472", "3:2": "1584*1056", "2:3": "1056*1584", "21:9": "2016*864" };
const KLING = shapes(["16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3", "21:9"]);
const LUMA = shapes(["3:1", "2:1", "21:9", "16:9", "3:2", "4:3", "1:1", "3:4", "2:3", "9:16", "1:2", "1:3"]);
const RUNWAY: [string, number][] = ["1920:1080", "1080:1920", "1024:1024", "1360:768", "1168:880", "1440:1080", "1080:1440", "1808:768", "2112:912"].map((p) => [p, p.split(":").map(Number).reduce((w, h) => w / h)]);

const MODELS: Model[] = [
  openai("gpt-image-2.5-flare", "GPT Image 2.5 Flare", "GPT Flare", "Fast, for trying ideas", "medium", 3),
  openai("gpt-image-2.5-sunburst", "GPT Image 2.5 Sunburst", "GPT Sunburst", "Detail and faces that hold", "high", 9),
  gemini("gemini-nano-banana-2.1", "Nano Banana 2.1", "Nano Banana", "Follows references closely", 12),
  gemini("gemini-3-pro-image", "Nano Banana Pro", "Banana Pro", "Gemini 3 Pro's pictures, the most faithful", 35),
  {
    id: "flux-2-pro", path: "bfl/flux-2-pro", name: "FLUX.2 Pro", short: "FLUX.2 Pro", about: "Photographic, up to nine references", maker: "bfl", credits: 6, refs: 9, tag: "image {n}",
    body: (a) => {
      const [width, height] = pixels(a.aspect);
      return { prompt: a.prompt, width, height, seed: seed31(a.seed), output_format: "jpeg", prompt_upsampling: false, ...Object.fromEntries(a.refs.slice(0, 9).map((r, i) => [i ? `input_image_${i + 1}` : "input_image", r.data])) };
    },
    picture: (out) => (out?.result?.sample ? { url: out.result.sample } : null),
  },
  {
    id: "flux-3-image", path: "bfl/flux-3-image", name: "FLUX 3", short: "FLUX 3", about: "Black Forest Labs' newest, early access", maker: "bfl", credits: 14, refs: 10, tag: "image {n}",
    body: (a) => ({ prompt: a.prompt, aspect_ratio: nearest(a.aspect, FLUX3), resolution: "1k", grounding: false, ...(a.refs.length ? { images: a.refs.map((r) => r.data) } : {}) }),
    picture: (out) => (out?.result?.sample ? { url: out.result.sample } : null),
  },
  ...(["seedream-5-0-pro-260628", "seedream-5-0-flash-260915"] as const).map((id, i): Model => ({
    id, path: `byteplus/${id}`, name: i ? "Seedream 5 Flash" : "Seedream 5 Pro", short: i ? "Seedream Flash" : "Seedream Pro", about: i ? "Quick and cheap" : "Rich detail, up to ten references", maker: "bytedance", credits: i ? 5 : 10, refs: 10, tag: "image {n}",
    body: (a) => ({ prompt: a.prompt, size: SEEDREAM(a.aspect), ...(a.refs.length ? { image: a.refs.map(dataUri) } : {}), seed: seed31(a.seed), watermark: false, response_format: "b64_json", output_format: "jpeg" }),
    picture: dataList,
  })),
  {
    id: "qwen-image-3.0-pro", path: "qwen/qwen-image-3.0-pro", name: "Qwen Image 3.0 Pro", short: "Qwen 3.0 Pro", about: "Qwen's newest, words in the picture", maker: "qwen", credits: 12, refs: 3, tag: "image {n}",
    body: (a) => ({
      input: { messages: [{ role: "user", content: [...a.refs.slice(0, 3).map((r) => ({ image: dataUri(r) })), { text: a.prompt }] }] },
      parameters: { size: QWEN_SIZE[nearest(a.aspect, QWEN)], n: 1, seed: seed31(a.seed), prompt_extend: false, watermark: false },
    }),
    picture: (out) => {
      for (const c of out?.output?.choices ?? []) for (const p of c?.message?.content ?? []) if (p?.image) return { url: p.image };
      return null;
    },
  },
  {
    id: "kling-image-o1", path: "kling/kling-image-o1", name: "Kling Image O1", short: "Kling O1", about: "Cinematic, up to ten references", maker: "kling", credits: 6, refs: 10, tag: "<<<image_{n}>>>",
    body: (a) => ({ prompt: a.prompt.slice(0, 2500), aspect_ratio: nearest(a.aspect, KLING), resolution: "1k", n: 1, ...(a.refs.length ? { image_list: a.refs.slice(0, 10).map((r) => ({ image: r.data })) } : {}) }),
    picture: (out) => (out?.data?.task_result?.images?.[0]?.url ? { url: out.data.task_result.images[0].url } : null),
  },
  {
    // Luma turns down words that name "the reference image": its references are called by their names
    id: "uni-1", path: "luma_2/uni-1", name: "Luma Uni-1", short: "Luma Uni-1", about: "Luma's picture model, up to nine references", maker: "luma", credits: 9, refs: 9, tag: "",
    body: (a) => ({ prompt: a.prompt.slice(0, 6000), type: "image", aspect_ratio: nearest(a.aspect, LUMA), output_format: "jpeg", ...(a.refs.length ? { image_ref: a.refs.slice(0, 9).map((r) => ({ data: r.data, media_type: r.mime })) } : {}) }),
    picture: (out) => (out?.output?.find?.((o: any) => o?.url)?.url ? { url: out.output.find((o: any) => o?.url).url } : null),
  },
  {
    id: "gen4_image", path: "runway/gen4_image", name: "Runway Gen-4 Image", short: "Runway Gen-4", about: "Keeps a face from up to three references", maker: "runway", credits: 24, refs: 3, tag: "image {n}",
    body: (a) => ({ promptText: a.prompt.slice(0, 1000), ratio: nearest(a.aspect, RUNWAY), ...(a.refs.length ? { referenceImages: a.refs.slice(0, 3).map((r) => ({ uri: dataUri(r) })) } : {}) }),
    picture: (out) => (typeof out?.output?.[0] === "string" ? { url: out.output[0] } : null),
  },
];

const MAKERS: Record<string, string> = { openai: "OpenAI", google: "Google", bfl: "Black Forest Labs", bytedance: "ByteDance", qwen: "Qwen", kling: "Kling", luma: "Luma", runway: "Runway" };
const offered = () => !!process.env.COMFY_API_KEY?.trim() && !process.env.COMFYTURE_OPEN_WEIGHTS?.trim();
const find = (id: string) => (offered() ? MODELS.find((m) => m.id === id) : undefined);
export const isRouterImage = (id: string) => !!find(id);

/** The Router's image models as the Image window and the pickers list them, beside the open-weights ones. */
export const routerImages = () =>
  offered()
    ? MODELS.map((m) => ({
        id: m.id, name: m.name, short: m.short, about: m.about, maker: m.maker, makerName: MAKERS[m.maker], credits: m.credits, router: true, megapixels: [1], multiple: 16, loras: [],
        templates: [{ id: "generate", official: m.path, steps: 0, refs: 0, enhancer: "none" }, ...(m.refs ? [{ id: "edit", official: m.path, steps: 0, refs: m.refs, enhancer: "none" }] : [])],
      }))
    : [];

/**
 * One picture from a Router model: the words (each @name of a reference turned into the way the
 * model calls it), the frame's shape, the references. Answers with the picture's bytes and what
 * Comfy says it cost.
 */
export async function routerDraw(id: string, v: { prompt: string; aspect: string; refs: RouterRef[]; names: string[]; seed: number }) {
  const m = find(id);
  if (!m) throw new Error(`${id} is not on Comfy Router.`);
  const refs = v.refs.slice(0, m.refs);
  const prompt = tagRefs(v.prompt, v.names, refs.length && m.tag ? { node: "", input: "", first: 0, max: m.refs, tag: m.tag, tagFirst: 1, single: "the reference image" } : undefined);
  const res = await fetch(`https://api.comfy.org/v2/models/${m.path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": process.env.COMFY_API_KEY!.trim(), "Idempotency-Key": randomUUID() },
    body: JSON.stringify(m.body({ prompt, aspect: v.aspect, refs, seed: v.seed })),
  });
  const out: any = await res.json().catch(() => ({}));
  const why = res.headers.get("x-comfy-error-type");
  if (!res.ok) {
    const said = out?.error?.message ?? out?.message ?? (Array.isArray(out?.detail) ? out.detail.map((d: any) => d?.msg).join("; ") : out?.detail);
    throw new Error(why === "content_policy_violation" ? `${m.name} refused the picture on content grounds.` : `${m.name}: ${said || `${res.status} ${res.statusText}`}`);
  }
  const credits = Number(res.headers.get("x-comfy-credits-used")) || null;
  if (process.env.COMFYTURE_DEBUG) console.log(`${m.path} credits ${credits}`);
  const pic = m.picture(out);
  if (!pic) throw new Error(`${m.name} answered without a picture${out?.data?.[0]?.is_image_safe === false || out?.block_reason ? " (it was blocked)" : ""}. Try other words?`);
  if ("base64" in pic) return { bytes: Buffer.from(pic.base64, "base64"), credits };
  // links last from an hour to a day: the picture is fetched now
  const got = await fetch(pic.url);
  if (!got.ok) throw new Error(`${m.name}'s picture could not be fetched (${got.status}).`);
  return { bytes: Buffer.from(await got.arrayBuffer()), credits };
}
