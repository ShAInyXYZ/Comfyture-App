// One take reframed on Comfy Cloud: the take as it was made (at its source's own shape) laid on a taller or
// wider frame as a band, and the rest of every frame painted by LTX-2.5's in/outpainting IC-LoRA:
//   node --env-file=.env scripts/try-outpaint.ts spec.json
// spec: { video, prompt, seed, width, height, band: { height, top }, start?, avoid?, out }
// (video: the take, with its sound, 8n + 1 frames; band: the take's height once scaled to the frame's width, and
// how far down the frame it sits; start: the last frame of the reframed take before, for a shot in chained takes)
// One attempt: it is not rolled again by itself.
import { Comfy } from "@comfyorg/sdk";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { CloudLibrary } from "../server/cloud.ts";
import { loadGraph, buildOutpaint } from "../server/workflows.ts";

const spec = JSON.parse(await readFile(process.argv[2], "utf8"));
const client = new Comfy({ clientInfo: "comfyture/0.1" });
const library = new CloudLibrary(process.env.COMFY_API_KEY!.trim());
const asset = (path: string) => client.assets.fromFile(resolve(path));

const graph = buildOutpaint(await loadGraph(resolve(import.meta.dirname, "..", "workflows"), "video-outpaint.json"), {
  ...spec,
  video: asset(spec.video),
  ...(spec.start ? { start: asset(spec.start) } : {}),
});
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
const [video] = job.getOutputs("video");
if (!video) {
  console.log("error", JSON.stringify((job as unknown as { error?: unknown }).error ?? null, null, 1).slice(0, 3000));
  process.exit(1);
}
await video.toFile(resolve(spec.out));
console.log("saved", spec.out, Math.round((Date.now() - started) / 1000), "s");
