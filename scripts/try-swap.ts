// One swap take on Comfy Cloud from local files, to try the workflow before it runs in the app:
//   node --env-file=.env scripts/try-swap.ts spec.json
// spec: { graph?, clip, photo, audio, from, frames, width, height, prompt, seed, face?, control?, lora?, strength?, loras?, out }
// (graph: shot-swap.json, the default, or shot-swap-dev.json; width and height are the first stage's)
// (paths relative to where it runs; loras: [{ file, strength }] chained before the IC-LoRA)
// A take that comes back "succeeded" but black (Comfy Cloud now and then returns NaN frames for one exact
// mix of words, length and inputs) is rolled again, at most twice, with another seed and the words nudged.
import { Comfy } from "@comfyorg/sdk";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { CloudLibrary } from "../server/cloud.ts";
import { loadGraph, buildSwap } from "../server/workflows.ts";
import { withLoras } from "../server/engine.ts";

const spec = JSON.parse(await readFile(process.argv[2], "utf8"));
const client = new Comfy({ clientInfo: "comfyture/0.1" });
const library = new CloudLibrary(process.env.COMFY_API_KEY!.trim());
const asset = (path: string) => client.assets.fromFile(resolve(path));
const run = promisify(execFile);

/** How bright the take is a second in (0 to 255): a black take is near 0. */
async function brightness(path: string) {
  const { stdout } = await run("ffmpeg", ["-nostdin", "-v", "error", "-i", path, "-vf", "select=gte(n\\,20),scale=64:114,format=gray", "-frames:v", "1", "-f", "rawvideo", "-"], { encoding: "buffer", maxBuffer: 1 << 20 });
  return stdout.length ? stdout.reduce((s, b) => s + b, 0) / stdout.length : 0;
}

async function take(seed: number, prompt: string) {
  const graph = buildSwap(await loadGraph(resolve(import.meta.dirname, "..", "workflows"), spec.graph ?? "shot-swap.json"), {
    ...spec,
    seed,
    prompt,
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
  if (!video) {
    console.log("error", JSON.stringify((job as unknown as { error?: unknown }).error ?? null, null, 1).slice(0, 3000));
    throw new Error(`no video (status ${job.status})`);
  }
  await video.toFile(resolve(spec.out));
  console.log("saved", spec.out, Math.round((Date.now() - started) / 1000), "s");
}

// the words nudged for a re-roll: a short closing sentence, different each time
const nudges = ["", " The light stays soft and even.", " Every detail stays sharp."];
for (let attempt = 0; attempt < nudges.length; attempt++) {
  await take(spec.seed + attempt * 1000, spec.prompt + nudges[attempt]);
  const level = await brightness(resolve(spec.out));
  if (level >= 12) break;
  console.log(`black take (brightness ${level.toFixed(1)})${attempt < nudges.length - 1 ? ", rolling again" : ", giving up"}`);
  if (attempt === nudges.length - 1) process.exit(2);
}
