// Renders each preset's gallery preview through a running Comfyture server.
//
//   node scripts/previews.ts                  every preset without a preview
//   node scripts/previews.ts crash-zoom zombie only these
//   node scripts/previews.ts --force          redo everything
//
// Each preset names its sample photo in preset.json ("sample"). The shot is
// copied to presets/<id>/preview.mp4 and a still to poster.jpg (needs ffmpeg).

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const api = process.env.COMFYTURE_URL ?? "http://127.0.0.1:5177";
const args = process.argv.slice(2);
const force = args.includes("--force");
const only = args.filter((a) => !a.startsWith("--"));
const parallel = Number(process.env.PREVIEW_JOBS ?? 2);

interface Preset {
  id: string;
  name: string;
  sample?: string;
  seconds?: number;
  script: unknown;
  end?: { paint: string };
}

async function call(path: string, init?: RequestInit) {
  const res = await fetch(api + path, init);
  const body = await res.json();
  if (!res.ok) throw new Error(`${path}: ${body.error ?? res.status}`);
  return body;
}

function ffmpeg(...a: string[]) {
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", ...a]);
}

async function render(preset: Preset) {
  const sample = preset.sample ?? "rain-coat";
  const photo = await call(`/api/photos?sample=${sample}.jpg`, { method: "POST" });
  let [run] = await call("/api/shots", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: preset.name,
      preset: preset.id,
      script: preset.script,
      start: photo.file,
      end: preset.end,
      seconds: preset.seconds ?? 5,
      quality: process.env.PREVIEW_QUALITY ?? "standard",
      review: false,
      takes: 1,
    }),
  });
  const started = Date.now();
  while (!["done", "failed", "canceled"].includes(run.status)) {
    await new Promise((r) => setTimeout(r, 3000));
    run = await call(`/api/runs/${run.id}`);
  }
  if (run.status !== "done") throw new Error(`${preset.id}: ${run.status} ${run.error ?? ""}`);
  const shot = join(root, "data", "runs", run.id, "shot.mp4");
  const folder = join(root, "presets", preset.id);
  // Small, fast-starting loop for the gallery; the sound stays in.
  ffmpeg("-i", shot, "-vf", "scale=-2:480", "-c:v", "libx264", "-crf", "26", "-preset", "slow",
    "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", join(folder, "preview.mp4"));
  const seconds = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration",
    "-of", "csv=p=0", shot]).toString()) || 4;
  ffmpeg("-ss", String(seconds * 0.7), "-i", shot, "-frames:v", "1", "-vf", "scale=-2:480", "-q:v", "3",
    join(folder, "poster.jpg"));
  console.log(`${preset.id}: done in ${Math.round((Date.now() - started) / 1000)} s (run ${run.id})`);
}

const presets: Preset[] = readdirSync(join(root, "presets"))
  .filter((d) => existsSync(join(root, "presets", d, "preset.json")))
  .map((d) => JSON.parse(readFileSync(join(root, "presets", d, "preset.json"), "utf8")))
  .filter((p) => (only.length ? only.includes(p.id) : force || !existsSync(join(root, "presets", p.id, "preview.mp4"))));

console.log(`${presets.length} preset(s) to render against ${api}`);
const queue = [...presets];
let failed = 0;
await Promise.all(
  Array.from({ length: Math.max(1, parallel) }, async () => {
    for (let p = queue.shift(); p; p = queue.shift()) {
      try {
        await render(p);
      } catch (error) {
        failed++;
        console.error((error as Error).message);
      }
    }
  }),
);
if (failed) process.exitCode = 1;
