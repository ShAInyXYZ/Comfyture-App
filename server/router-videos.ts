// The video models on Comfy Router: partner APIs, billed in Comfy credits with the same Comfy key.
// Each takes the shot's start frame and the prompt its script makes, and answers with a clip that
// becomes the take, as LTX-2.5's would. Without a Comfy key, or with COMFYTURE_OPEN_WEIGHTS set,
// none of them is offered.

import { randomUUID } from "node:crypto";
import { spend } from "./judge.ts";

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
  /** about how long it takes, in seconds, for the bar (measured on a five-second shot, Router's queue aside) */
  wait: number;
  sound: boolean;
  /** the length it makes for a shot of so many seconds (its own steps and bounds) */
  lengthOf: (seconds: number) => number;
  body: (a: Ask) => unknown;
  clip: (out: any) => { base64: string } | { url: string } | null;
};

const dataUri = (s: RouterStart) => `data:${s.mime};base64,${s.data}`;
const seed32 = (s: number) => Math.abs(s) % 4294967295;
const clamp = (v: number, lo: number, hi: number) => Math.round(Math.min(hi, Math.max(lo, v)));
// Veo makes 4, 6 or 8 seconds: the shot's length, rounded up to one of them
const veoSeconds = (s: number) => [4, 6, 8].find((x) => x >= s) ?? 8;

const veo = (id: string, name: string, short: string, about: string, perSecond: number, wait: number): Model => ({
  id, path: `veo/${id}`, name, short, about, maker: "google", credits: Math.round(perSecond * 6), wait, sound: true,
  lengthOf: veoSeconds,
  body: (a) => ({
    instances: [{ prompt: a.prompt, image: { bytesBase64Encoded: a.start.data, mimeType: a.start.mime === "image/png" ? "image/png" : "image/jpeg" } }],
    // no square: a square frame is padded into the wide one
    parameters: { durationSeconds: veoSeconds(a.seconds), aspectRatio: a.aspect === "9:16" ? "9:16" : "16:9", resolution: "720p", generateAudio: true, sampleCount: 1, seed: seed32(a.seed) },
  }),
  clip: (out) => {
    const v = (out?.response?.videos ?? out?.videos ?? [])[0];
    return v?.bytesBase64Encoded ? { base64: v.bytesBase64Encoded } : v?.gcsUri ? { url: v.gcsUri } : null;
  },
});

const MODELS: Model[] = [
  veo("veo-3.1-fast-generate-001", "Veo 3.1 Fast", "Veo Fast", "Google's, with sound; four, six or eight seconds", 21.1, 70),
  veo("veo-3.1-generate-001", "Veo 3.1", "Veo 3.1", "Google's best, with sound; four, six or eight seconds", 84.4, 150),
  {
    id: "kling-v3-omni", path: "kling/kling-v3-omni", name: "Kling 3 Omni", short: "Kling 3", about: "Kling's, with sound, from three to fifteen seconds", maker: "kling", credits: 118, wait: 120, sound: true,
    lengthOf: (s) => clamp(s, 3, 15),
    body: (a) => ({ prompt: a.prompt.slice(0, 2500), image_list: [{ image_url: a.start.data, type: "first_frame" }], duration: String(clamp(a.seconds, 3, 15)), mode: "std", sound: "on" }),
    clip: (out) => {
      const v = (out?.data?.task_result?.videos ?? []).find((x: any) => x?.url);
      return v ? { url: v.url } : null;
    },
  },
  {
    id: "dreamina-seedance-2-5-260628", path: "byteplus/dreamina-seedance-2-5-260628", name: "Seedance 2.5", short: "Seedance 2.5", about: "Cinematic, with sound; the frame's own shape", maker: "bytedance", credits: 349, wait: 300, sound: true,
    lengthOf: (s) => clamp(s, 4, 30),
    // it follows the start frame's shape: a set ratio is refused
    body: (a) => ({ content: [{ type: "text", text: a.prompt }, { type: "image_url", image_url: { url: dataUri(a.start) }, role: "first_frame" }], duration: clamp(a.seconds, 4, 30), resolution: "720p", generate_audio: true, seed: seed32(a.seed), watermark: false }),
    clip: (out) => (out?.content?.video_url ? { url: out.content.video_url } : null),
  },
  {
    id: "minimax-h3", path: "minimax/minimax-h3", name: "MiniMax H3", short: "MiniMax H3", about: "MiniMax's, always with sound, 768p", maker: "minimax", credits: 136, wait: 240, sound: true,
    lengthOf: (s) => clamp(s, 5, 15),
    body: (a) => ({ content: [{ type: "text", text: a.prompt }, { type: "image_url", image_url: { url: dataUri(a.start) }, role: "first_frame" }], duration: clamp(a.seconds, 5, 15), resolution: "768P", seed: seed32(a.seed) }),
    clip: (out) => (out?.task?.content?.url ? { url: out.task.content.url } : out?.content?.url ? { url: out.content.url } : null),
  },
  {
    id: "wan3.0-video", path: "wan/wan3.0-video", name: "Wan 3.0", short: "Wan 3.0", about: "Wan's, with sound, two to thirty seconds", maker: "wan", credits: 151, wait: 180, sound: true,
    lengthOf: (s) => clamp(s, 2, 30),
    body: (a) => ({ input: { prompt: a.prompt.slice(0, 20000), media: [{ type: "first_frame", url: dataUri(a.start) }] }, parameters: { resolution: "720P", duration: clamp(a.seconds, 2, 30), ratio: "adaptive", audio: true, prompt_extend: false, seed: Math.abs(a.seed) % 2147483647 } }),
    clip: (out) => (out?.output?.video_url ? { url: out.output.video_url } : null),
  },
  {
    id: "gen4_turbo", path: "runway/gen4_turbo", name: "Runway Gen-4 Turbo", short: "Gen-4 Turbo", about: "Quick and cheap, silent", maker: "runway", credits: 75, wait: 90, sound: false,
    lengthOf: (s) => clamp(s, 2, 10),
    body: (a) => ({ promptImage: dataUri(a.start), promptText: a.prompt.slice(0, 1000), ratio: a.aspect === "9:16" ? "720:1280" : a.aspect === "1:1" ? "960:960" : "1280:720", duration: clamp(a.seconds, 2, 10), seed: seed32(a.seed) }),
    clip: (out) => (typeof out?.output?.[0] === "string" ? { url: out.output[0] } : null),
  },
];

const MAKERS: Record<string, string> = { google: "Google", kling: "Kling", bytedance: "ByteDance", minimax: "MiniMax", wan: "Wan", runway: "Runway" };
const offered = () => !!process.env.COMFY_API_KEY?.trim() && !process.env.COMFYTURE_OPEN_WEIGHTS?.trim();
const find = (id: string) => (offered() ? MODELS.find((m) => m.id === id) : undefined);
export const isRouterVideo = (id: string) => !!find(id);
export const routerVideoName = (id: string) => find(id)?.name ?? id;
export const routerVideoSeconds = (id: string, seconds: number) => Math.max(30, (find(id)?.wait ?? 90) * (seconds / 5));
/** The clip's length for a shot of so many seconds, when the model's steps make it another. */
export const routerVideoLength = (id: string, seconds: number) => find(id)?.lengthOf(seconds) ?? seconds;
export const routerVideoSound = (id: string) => find(id)?.sound ?? true;

/** The Router's video models as the picker lists them. */
export const routerVideos = () =>
  offered() ? MODELS.map((m) => ({ id: m.id, name: m.name, short: m.short, about: m.about, maker: m.maker, makerName: MAKERS[m.maker] ?? m.maker, credits: m.credits, sound: m.sound, router: true })) : [];

const wait = (ms: number, signal?: AbortSignal) => new Promise<void>((ok, no) => {
  const t = setTimeout(ok, ms);
  signal?.addEventListener("abort", () => (clearTimeout(t), no(new Error("Canceled."))), { once: true });
});
const why = (m: Model, res: Response, out: any) => {
  const said = out?.error?.message ?? out?.message ?? (Array.isArray(out?.detail) ? out.detail.map((d: any) => d?.msg).join("; ") : out?.detail);
  return new Error(res.headers.get("x-comfy-error-type") === "content_policy_violation" || out?.error_type === "content_policy_violation" ? `${m.name} refused the shot on content grounds.` : `${m.name}: ${said || out?.error_type || `${res.status} ${res.statusText}`}`);
};

/**
 * One clip from a Router model: the start frame, the words, the length and the frame's shape. It
 * goes through Router's queue (a clip can take minutes, longer than a connection is held), asked
 * every few seconds until it is done; fallback to another provider is off, so it runs where it is
 * billed as listed.
 */
export async function routerVideo(id: string, v: Ask & { signal?: AbortSignal }) {
  spend("render");
  const m = find(id);
  if (!m) throw new Error(`${id} is not on Comfy Router.`);
  const base = `https://api.comfy.org/v2/models/${m.path}`;
  const headers = { "Content-Type": "application/json", "X-API-Key": process.env.COMFY_API_KEY!.trim() };
  const sent = await fetch(`${base}/requests?fallback_provider=false`, { method: "POST", headers: { ...headers, "Idempotency-Key": randomUUID() }, body: JSON.stringify(m.body(v)), signal: v.signal });
  const ticket: any = await sent.json().catch(() => ({}));
  if (!sent.ok) throw why(m, sent, ticket);
  const status = ticket.status_url ?? `${base}/requests/${ticket.request_id}/status`;
  const result = ticket.response_url ?? `${base}/requests/${ticket.request_id}`;
  const cancel = ticket.cancel_url ?? `${base}/requests/${ticket.request_id}/cancel`;
  v.signal?.addEventListener("abort", () => void fetch(cancel, { method: "PUT", headers }).catch(() => {}), { once: true });
  for (let i = 0; ; i++) {
    await wait(i < 6 ? 5000 : 8000, v.signal);
    const s = await fetch(status, { headers, signal: v.signal });
    const st: any = await s.json().catch(() => ({}));
    if (s.ok && st.status === "COMPLETED") break;
    if (!s.ok && s.status !== 429 && s.status < 500) throw why(m, s, st);
    if (i > 240) throw new Error(`${m.name} took longer than half an hour.`);
  }
  const res = await fetch(result, { headers, signal: v.signal });
  const out: any = await res.json().catch(() => ({}));
  if (!res.ok || out?.error_type) throw why(m, res, out);
  const credits = Number(res.headers.get("x-comfy-credits-used")) || null;
  if (process.env.COMFYTURE_DEBUG) console.log(`${m.path} credits ${credits}`);
  const clip = m.clip(out);
  if (!clip) throw new Error(`${m.name} answered without a clip. Try other words?`);
  if ("base64" in clip) return { bytes: Buffer.from(clip.base64, "base64"), credits };
  const got = await fetch(clip.url);
  if (!got.ok) throw new Error(`${m.name}'s clip could not be fetched (${got.status}).`);
  return { bytes: Buffer.from(await got.arrayBuffer()), credits };
}
