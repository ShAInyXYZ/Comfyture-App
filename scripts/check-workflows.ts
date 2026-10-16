// Builds every kind of shot graph and checks it against a ComfyUI's node
// definitions (classes, required inputs, link targets) without running it.
//
//   COMFYUI_URL=http://127.0.0.1:8188 node scripts/check-workflows.ts
//   OBJECT_INFO=object_info.json node scripts/check-workflows.ts   (a saved copy, e.g. Comfy Cloud's)

import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { everyImageGraph } from "../server/images.ts";
import {
  addClipGuide, applyAudio, buildCutout, buildGenerate, buildGuided, buildI2V, buildMotion, buildPaint, buildPlan, buildProduction, buildSound, loadGraph, type Graph,
} from "../server/workflows.ts";

const root = resolve(import.meta.dirname, "..");
const dir = join(root, "workflows");
const comfy = process.env.COMFYUI_URL ?? "http://127.0.0.1:8188";
const info: Record<string, any> = process.env.OBJECT_INFO
  ? JSON.parse(await readFile(process.env.OBJECT_INFO, "utf8"))
  : await (await fetch(`${comfy}/object_info`)).json();

const v = { prompt: "A test shot.", seconds: 5, seed: 1, width: 1152, height: 768, enhance: false };
const img = "test.png";
const cases: [string, () => Promise<Graph>][] = [
  ["start frame (two pass)", async () => buildI2V(await loadGraph(dir, "shot-i2v.json"), dir, img, v)],
  ["start frame + enhancer", async () => buildI2V(await loadGraph(dir, "shot-i2v.json"), dir, img, { ...v, enhance: true })],
  ["start frame + audio", async () => applyAudio(await buildI2V(await loadGraph(dir, "shot-i2v.json"), dir, img, v), "a.mp3", 5)],
  ["text only", async () => buildGuided(await loadGraph(dir, "shot-guided.json"), dir, [], v)],
  ["start + keyframe + end", async () => buildGuided(await loadGraph(dir, "shot-guided.json"), dir, [
    { image: img, frame: 0, strength: 1 }, { image: img, frame: 58, strength: 0.7 }, { image: img, frame: -1, strength: 0.85 },
  ], { ...v, enhance: true })],
  ["references", async () => buildGuided(await loadGraph(dir, "shot-guided.json"), dir, [], v, "sheet.png")],
  ["references + audio", async () => applyAudio(await buildGuided(await loadGraph(dir, "shot-guided.json"), dir, [], v, "sheet.png"), "a.mp3", 5)],
  ["production (DFR)", async () => buildProduction(await loadGraph(dir, "shot-production.json"), dir, img, v)],
  ["production + audio + enhancer", async () => applyAudio(await buildProduction(await loadGraph(dir, "shot-production.json"), dir, img, { ...v, enhance: true }), "a.mp3", 5)],
  ["paint", async () => buildPaint(await loadGraph(dir, "frame-edit.json"), img, "gold", 1)],
  ["cutout", async () => buildCutout(await loadGraph(dir, "cutout.json"), img)],
  ["generate", async () => buildGenerate(await loadGraph(dir, "image-generate.json"), "A test image.", "16:9", 1)],
  ["new sound", async () => buildSound(await loadGraph(dir, "sound.json"), "take.mp4", "A test shot. A loud boom.", 121, 1)],
  ["motion: pose onto a photo", async () => buildMotion(await loadGraph(dir, "shot-motion.json"), "clip.mp4", img, "pose", { prompt: v.prompt, frames: 121, seed: 1 })],
  ["motion: edges, script only", async () => buildMotion(await loadGraph(dir, "shot-motion.json"), "clip.mp4", null, "edges", { prompt: v.prompt, frames: 97, seed: 1 })],
  ["extend a clip + end frame", async () => {
    const graph = await loadGraph(dir, "shot-guided.json");
    const link = addClipGuide(graph, "clip.mp4", 240)!;
    return buildGuided(graph, dir, [{ link, frame: 0, strength: 1 }, { image: img, frame: -1, strength: 0.85 }], v);
  }],
  ["director", async () => buildPlan(await loadGraph(dir, "director.json"), "Idea: a test.", 1)],
  ["director + photo", async () => buildPlan(await loadGraph(dir, "director.json"), "Idea: a test.", 1, img)],
  ["assistant + photo", async () => buildPlan(await loadGraph(dir, "assistant.json"), "User: make it gold.", 1, img)],
  ...(await everyImageGraph(dir)).map(([name, graph]): [string, () => Promise<Graph>] => [name, async () => graph]),
];

let failed = 0;
for (const [name, build] of cases) {
  const graph = await build();
  const problems: string[] = [];
  for (const [id, node] of Object.entries(graph)) {
    const def = info[node.class_type];
    if (!def) {
      problems.push(`${id}: unknown node ${node.class_type}`);
      continue;
    }
    for (const [input, spec] of Object.entries<any>(def.input?.required ?? {})) {
      // a growing list of inputs (images.image_1, …) that may be empty isn't missing
      if (spec?.[0] === "COMFY_AUTOGROW_V3" && (spec[1]?.template?.min ?? 0) === 0) continue;
      const present = input in node.inputs || Object.keys(node.inputs).some((k) => k.startsWith(`${input}.`));
      if (!present) problems.push(`${id} ${node.class_type}: missing ${input}`);
    }
    for (const [input, value] of Object.entries(node.inputs)) {
      if (!Array.isArray(value) || value.length !== 2 || typeof value[0] !== "string") continue;
      const source = graph[value[0]];
      if (!source) problems.push(`${id}.${input}: links to missing node ${value[0]}`);
      else if (value[1] >= (info[source.class_type]?.output?.length ?? 0)) problems.push(`${id}.${input}: no output ${value[1]} on ${source.class_type}`);
    }
  }
  console.log(`${problems.length ? "FAIL" : "ok  "} ${name} (${Object.keys(graph).length} nodes)`);
  for (const p of problems) console.log(`     ${p}`);
  failed += problems.length ? 1 : 0;
}
process.exitCode = failed ? 1 : 0;
