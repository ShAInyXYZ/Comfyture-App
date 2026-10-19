// One swap take on Comfy Cloud from local files, to try the workflow before it runs in the app:
//   node --env-file=.env scripts/try-swap.ts spec.json
// spec: { clip, photo, audio, from, frames, width, height, prompt, seed, face?, control?, lora?, loras?, out }
// (paths relative to where it runs; loras: [{ file, strength }] chained before the IC-LoRA)
import { Comfy } from "@comfyorg/sdk";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { CloudLibrary } from "../server/cloud.ts";
import { loadGraph, buildSwap } from "../server/workflows.ts";
import { withLoras } from "../server/engine.ts";

const spec = JSON.parse(await readFile(process.argv[2], "utf8"));
const client = new Comfy({ clientInfo: "comfyture/0.1" });
const library = new CloudLibrary(process.env.COMFY_API_KEY!.trim());
const asset = (path: string) => client.assets.fromFile(resolve(path));
const graph = buildSwap(await loadGraph(resolve(import.meta.dirname, "..", "workflows"), "shot-swap.json"), {
  ...spec,
  clip: asset(spec.clip),
  photo: asset(spec.photo),
  audio: asset(spec.audio),
});
if (spec.loras?.length) withLoras(graph, spec.loras.map((l: { file: string; strength: number }) => ({ id: l.file, kind: "style", file: l.file, strength: l.strength, words: "" })), false);
await library.resolve(graph);
const started = Date.now();
const job = await client.submit(client.workflows.fromJson(graph));
console.log("submitted", job.id);
let last = "";
for await (const ev of job.events()) {
  const line = ev.kind === "statusChange" ? ev.status : ev.kind === "progress" ? `${Math.round((ev as { value?: number; max?: number }).value ?? 0)}/${(ev as { max?: number }).max ?? "?"}` : "";
  if (line && line !== last) console.log(Math.round((Date.now() - started) / 1000), ev.kind, line);
  last = line;
  if (ev.kind === "statusChange" && ["succeeded", "failed", "canceled"].includes(ev.status)) break;
}
await job.wait().catch((e: Error) => console.log("error", e.message));
const [video] = job.getOutputs("video");
if (!video) throw new Error(`no video (status ${job.status})`);
await video.toFile(resolve(spec.out));
console.log("saved", spec.out, Math.round((Date.now() - started) / 1000), "s");
