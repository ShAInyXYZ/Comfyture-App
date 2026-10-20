// One Seedance 2.5 video on Comfy Cloud from references (pictures, videos, sounds), through the partner node:
//   node --env-file=.env scripts/try-seedance.ts spec.json
// spec: { prompt, seconds, resolution?, ratio?, images?: [path], videos?: [path], audios?: [path], audio?: boolean, seed?, out }
// A request the node refuses (a reference it will not take) fails when it is submitted, before anything is billed.
import { Comfy } from "@comfyorg/sdk";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { CloudLibrary } from "../server/cloud.ts";

const spec = JSON.parse(await readFile(process.argv[2], "utf8"));
const client = new Comfy({ clientInfo: "comfyture/0.1" });
const library = new CloudLibrary(process.env.COMFY_API_KEY!.trim());
const asset = (path: string) => client.assets.fromFile(resolve(path));

const node: Record<string, unknown> = {
  model: "Seedance 2.5", "model.resolution": spec.resolution ?? "480p", "model.ratio": spec.ratio ?? "9:16", "model.duration": spec.seconds,
  "model.generate_audio": spec.audio ?? true, "model.task_type": "reference", "model.output_format": "mp4", "model.prompt": spec.prompt, seed: spec.seed ?? 1, watermark: false,
};
const graph: Record<string, { class_type: string; inputs: Record<string, unknown> }> = {};
(spec.images ?? []).forEach((p: string, i: number) => { graph[`img${i + 1}`] = { class_type: "LoadImage", inputs: { image: asset(p) } }; node[`model.reference_images.image_${i + 1}`] = [`img${i + 1}`, 0]; });
(spec.videos ?? []).forEach((p: string, i: number) => { graph[`vid${i + 1}`] = { class_type: "LoadVideo", inputs: { file: asset(p) } }; graph[`vidc${i + 1}`] = { class_type: "GetVideoComponents", inputs: { video: [`vid${i + 1}`, 0] } }; node[`model.reference_videos.video_${i + 1}`] = [`vid${i + 1}`, 0]; });
(spec.audios ?? []).forEach((p: string, i: number) => { graph[`aud${i + 1}`] = { class_type: "LoadAudio", inputs: { audio: asset(p) } }; node[`model.reference_audios.audio_${i + 1}`] = [`aud${i + 1}`, 0]; });
for (const k of Object.keys(graph)) if (k.startsWith("vidc")) delete graph[k];
graph.seedance = { class_type: "ByteDance2ReferenceNodeV2", inputs: node };
graph.video = { class_type: "SaveVideo", inputs: { video: ["seedance", 0], filename_prefix: "comfyture/seedance", format: "auto", codec: "auto" } };

await library.resolve(graph);
const started = Date.now();
const job = await client.submit(client.workflows.fromJson(graph), { apiKey: process.env.COMFY_API_KEY!.trim() }); // partner nodes bill through the same key
console.log("submitted", job.id);
let last = "";
for await (const ev of job.events()) {
  const line = ev.kind === "statusChange" ? ev.status : ev.kind === "progress" ? `${Math.round((ev as { value?: number }).value ?? 0)}/${(ev as { max?: number }).max ?? "?"}` : "";
  if (line && line !== last) console.log(Math.round((Date.now() - started) / 1000), ev.kind, line);
  last = line;
  if (ev.kind === "statusChange" && ["succeeded", "failed", "canceled"].includes(ev.status)) break;
}
await job.wait().catch((e: Error) => console.log("error", e.message));
const [video] = job.getOutputs("video");
if (!video) {
  console.log("error", JSON.stringify((job as unknown as { error?: unknown }).error ?? null, null, 1).slice(0, 3000));
  process.exit(1);
}
await video.toFile(resolve(spec.out));
console.log("saved", spec.out, Math.round((Date.now() - started) / 1000), "s");
