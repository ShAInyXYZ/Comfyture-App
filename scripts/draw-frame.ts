// One first frame from a GPT Image model on Comfy Router, at the take's own size, from local reference
// pictures (named "image 1", "image 2"… in the prompt, in the order given):
//   node --env-file=.env scripts/draw-frame.ts spec.json
// spec: { model?: "gpt-image-2.5-flare" | "gpt-image-2.5-sunburst", quality?: "low" | "medium" | "high" | "xhigh" | "max",
//         size?: "1152x2048", prompt, refs: [paths], out }
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";

const spec = JSON.parse(await readFile(process.argv[2], "utf8"));
const mime = (p: string) => ({ ".png": "image/png", ".webp": "image/webp" })[extname(p).toLowerCase()] ?? "image/jpeg";
const image = await Promise.all((spec.refs ?? []).map(async (p: string) => `data:${mime(p)};base64,${(await readFile(resolve(p))).toString("base64")}`));
const started = Date.now();
const res = await fetch(`https://api.comfy.org/v2/models/openai/${spec.model ?? "gpt-image-2.5-flare"}`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-API-Key": process.env.COMFY_API_KEY!.trim(), "Idempotency-Key": randomUUID() },
  body: JSON.stringify({ prompt: spec.prompt, ...(image.length ? { image } : {}), size: spec.size ?? "1152x2048", quality: spec.quality ?? "high", n: 1, output_format: "png" }),
});
const out: any = await res.json().catch(() => ({}));
if (!res.ok) throw new Error(`${res.status}: ${out?.error?.message ?? out?.message ?? JSON.stringify(out).slice(0, 400)}`);
const picture = out?.data?.[0]?.b64_json ? Buffer.from(out.data[0].b64_json, "base64") : out?.data?.[0]?.url ? Buffer.from(await (await fetch(out.data[0].url)).arrayBuffer()) : null;
if (!picture) throw new Error(`no picture: ${JSON.stringify(out).slice(0, 400)}`);
await writeFile(resolve(spec.out), picture);
console.log(`saved ${spec.out} in ${Math.round((Date.now() - started) / 1000)} s, ${res.headers.get("x-comfy-credits-used") ?? "?"} credits`);
