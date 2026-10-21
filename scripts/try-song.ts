// One song on Comfy Cloud, from the song workflow (ACE-Step 1.5 XL sft, three passes):
//   node --env-file=.env scripts/try-song.ts spec.json
// spec: { tags, lyrics, seconds, bpm, key, language, timesignature, seed, sampler?, out }
// One attempt: it is not rolled again by itself.
import { Comfy } from "@comfyorg/sdk";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { CloudLibrary } from "../server/cloud.ts";
import { loadGraph } from "../server/workflows.ts";

const spec = JSON.parse(await readFile(process.argv[2], "utf8"));
const client = new Comfy({ clientInfo: "comfyture/0.1" });
const library = new CloudLibrary(process.env.COMFY_API_KEY!.trim());
const graph = await loadGraph(resolve(import.meta.dirname, "..", "workflows"), "audio/song.json");
Object.assign(graph.text.inputs, { tags: spec.tags, lyrics: spec.lyrics || "[Instrumental]", seed: spec.seed ?? 1, duration: spec.seconds, bpm: spec.bpm, keyscale: spec.key, language: spec.language, timesignature: spec.timesignature });
graph.latent.inputs.seconds = spec.seconds;
graph.first.inputs.seed = spec.seed ?? 1;
for (const id of ["first", "second", "third"]) if (spec.sampler) graph[id].inputs.sampler_name = spec.sampler;
await library.resolve(graph);
const started = Date.now();
const job = await client.submit(client.workflows.fromJson(graph));
console.log("submitted", job.id);
let last = "";
for await (const ev of job.events()) {
  const line = ev.kind === "statusChange" ? ev.status : ev.kind === "progress" ? `${Math.round((ev as { value?: number }).value ?? 0)}/${(ev as { max?: number }).max ?? "?"}` : "";
  if (line && line !== last) console.log(Math.round((Date.now() - started) / 1000), ev.kind, line);
  last = line;
  if (ev.kind === "statusChange" && ["succeeded", "failed", "canceled"].includes(ev.status)) break;
}
await job.wait().catch((e: Error) => console.log("error", e.message));
const [audio] = job.getOutputs("out");
if (!audio) {
  console.log("error", JSON.stringify((job as unknown as { error?: unknown }).error ?? null, null, 1).slice(0, 3000));
  process.exit(1);
}
await audio.toFile(resolve(spec.out));
console.log("saved", spec.out, Math.round((Date.now() - started) / 1000), "s");
