// The video models on Comfy Router: partner APIs, billed in Comfy credits with the same Comfy key.
// Each takes the shot's start frame and the prompt its script makes, and answers with a clip that
// becomes the take, as LTX-2.5's would. Without a Comfy key, or with COMFYTURE_OPEN_WEIGHTS set,
// none of them is offered.

import { randomUUID } from "node:crypto";

export type RouterStart = { mime: string; data: string };
type Ask = { prompt: string; start: RouterStart; seconds: number; aspect: string; seed: number };
type Model = {
  id: string;
  path: string;
  name: string;
  short: string;
  about: string;
  maker: string;
  /** about what a five-second shot costs, in Comfy credits */
  credits: number;
  /** about how long it takes, in seconds, for the bar */
  wait: number;
  sound: boolean;
  body: (a: Ask) => unknown;
  clip: (out: any) => { base64: string } | { url: string } | null;
};

const MODELS: Model[] = [];

const MAKERS: Record<string, string> = {};
const offered = () => !!process.env.COMFY_API_KEY?.trim() && !process.env.COMFYTURE_OPEN_WEIGHTS?.trim();
const find = (id: string) => (offered() ? MODELS.find((m) => m.id === id) : undefined);
export const isRouterVideo = (id: string) => !!find(id);
export const routerVideoName = (id: string) => find(id)?.name ?? id;
export const routerVideoSeconds = (id: string, seconds: number) => Math.max(30, (find(id)?.wait ?? 90) * (seconds / 5));

/** The Router's video models as the picker lists them. */
export const routerVideos = () =>
  offered() ? MODELS.map((m) => ({ id: m.id, name: m.name, short: m.short, about: m.about, maker: m.maker, makerName: MAKERS[m.maker] ?? m.maker, credits: m.credits, sound: m.sound, router: true })) : [];

/** One clip from a Router model: the start frame, the words, the length and the frame's shape. */
export async function routerVideo(id: string, v: Ask & { signal?: AbortSignal }) {
  const m = find(id);
  if (!m) throw new Error(`${id} is not on Comfy Router.`);
  const res = await fetch(`https://api.comfy.org/v2/models/${m.path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": process.env.COMFY_API_KEY!.trim(), "Idempotency-Key": randomUUID() },
    body: JSON.stringify(m.body(v)),
    signal: v.signal,
  });
  const out: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const said = out?.error?.message ?? out?.message ?? (Array.isArray(out?.detail) ? out.detail.map((d: any) => d?.msg).join("; ") : out?.detail);
    throw new Error(res.headers.get("x-comfy-error-type") === "content_policy_violation" ? `${m.name} refused the shot on content grounds.` : `${m.name}: ${said || `${res.status} ${res.statusText}`}`);
  }
  const credits = Number(res.headers.get("x-comfy-credits-used")) || null;
  if (process.env.COMFYTURE_DEBUG) console.log(`${m.path} credits ${credits}`);
  const clip = m.clip(out);
  if (!clip) throw new Error(`${m.name} answered without a clip. Try other words?`);
  if ("base64" in clip) return { bytes: Buffer.from(clip.base64, "base64"), credits };
  const got = await fetch(clip.url);
  if (!got.ok) throw new Error(`${m.name}'s clip could not be fetched (${got.status}).`);
  return { bytes: Buffer.from(await got.arrayBuffer()), credits };
}
