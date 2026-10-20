// One picture for a Macaron project, from GPT Image 2.5 Flare or FLUX 3 on Comfy Router, made from
// reference pictures on disk (named "image 1", "image 2"... in the prompt, in the order given):
//   node --env-file=.env scripts/macaron-image.ts spec.json
// spec: { provider: "flare" | "flux3", prompt, refs?: [paths], out,
//         size?: "1152x2048", quality?: "low" | "medium" | "high"   (flare: pixels and quality)
//         aspect?: "4:5", resolution?: "1k"                          (flux3: ratio and tier) }
// Prints what Router charged (X-Comfy-Credits-Used) and keeps a line of it in the ledger given by
// MACARON_LEDGER (default docs-private/goals/overnight/macaron-ledger.jsonl), so costs add up.
import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";

const spec = JSON.parse(await readFile(process.argv[2], "utf8"));
const provider: string = spec.provider ?? "flare";
const mime = (p: string) => ({ ".png": "image/png", ".webp": "image/webp" })[extname(p).toLowerCase()] ?? "image/jpeg";
const files: Buffer[] = await Promise.all((spec.refs ?? []).map((p: string) => readFile(resolve(p))));
const started = Date.now();

let url: string;
let body: Record<string, unknown>;
if (provider === "flux3") {
  url = "https://api.comfy.org/v2/models/bfl/flux-3-image";
  body = { prompt: spec.prompt, aspect_ratio: spec.aspect ?? "1:1", resolution: spec.resolution ?? "1k", grounding: false, ...(files.length ? { images: files.map((b) => b.toString("base64")) } : {}) };
} else {
  url = `https://api.comfy.org/v2/models/openai/${spec.model ?? "gpt-image-2.5-flare"}`;
  const image = files.map((b, i) => `data:${mime(spec.refs[i])};base64,${b.toString("base64")}`);
  body = { prompt: spec.prompt, ...(image.length ? { image } : {}), size: spec.size ?? "1024x1024", quality: spec.quality ?? "medium", n: 1, output_format: "png" };
}
const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-API-Key": process.env.COMFY_API_KEY!.trim(), "Idempotency-Key": randomUUID() },
  body: JSON.stringify(body),
});
const out: any = await res.json().catch(() => ({}));
if (!res.ok) throw new Error(`${res.status}: ${out?.error?.message ?? out?.message ?? JSON.stringify(out).slice(0, 400)}`);
const link = provider === "flux3" ? out?.result?.sample : out?.data?.[0]?.url;
const picture = out?.data?.[0]?.b64_json ? Buffer.from(out.data[0].b64_json, "base64") : link ? Buffer.from(await (await fetch(link)).arrayBuffer()) : null;
if (!picture) throw new Error(`no picture: ${JSON.stringify(out).slice(0, 400)}`);
await mkdir(dirname(resolve(spec.out)), { recursive: true });
await writeFile(resolve(spec.out), picture);
const credits = Number(res.headers.get("x-comfy-credits-used")) || null;
const seconds = Math.round((Date.now() - started) / 1000);
const ledger = resolve(process.env.MACARON_LEDGER ?? "docs-private/goals/overnight/macaron-ledger.jsonl");
await appendFile(ledger, `${JSON.stringify({ at: new Date().toISOString(), provider, model: provider === "flux3" ? "flux-3-image" : spec.model ?? "gpt-image-2.5-flare", size: spec.size ?? `${spec.aspect}/${spec.resolution ?? "1k"}`, quality: spec.quality, refs: files.length, credits, seconds, out: spec.out, prompt: String(spec.prompt).slice(0, 160) })}\n`);
console.log(`saved ${spec.out} in ${seconds} s, ${credits ?? "?"} credits`);
