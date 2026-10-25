// Builds the live demo: the app as static files, with a snapshot of the presets, the
// sample photos and the take log. Anyone can browse it (presets play, takes play, the
// exact prompts and workflows are there) without a server, a GPU or a key.
//
//   node scripts/demo-site.ts [folder]      (default: site/)
//
// It reads the data folder the server would (COMFYTURE_DATA, else data/). To publish only the examples, never your own work, build it
// from a clean folder the server has seeded: start the server once with COMFYTURE_DATA=/tmp/clean, stop it, then
//   COMFYTURE_DATA=/tmp/clean node scripts/demo-site.ts
//
// Serve the folder from any static host, GitHub Pages included; it works under a sub-path.

import { imageSize } from "../server/media.ts";
import { copyFile, cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadPresets } from "../server/presets.ts";

const root = resolve(import.meta.dirname, "..");
const out = resolve(process.argv[2] ?? join(root, "site"));
const data = resolve(root, process.env.COMFYTURE_DATA ?? "data");
const MARK = ".comfyture-site";

// only ever clear a folder this script made
if (existsSync(out) && (await readdir(out)).length) {
  if (!existsSync(join(out, MARK))) throw new Error(`${out} exists and isn't a Comfyture demo site; pick an empty folder.`);
  await rm(out, { recursive: true });
}
await mkdir(out, { recursive: true });

// server URLs are absolute; the static copy uses relative ones so it works under a sub-path
const relative = (value: unknown) =>
  JSON.parse(JSON.stringify(value).replaceAll('"/media/', '"media/').replaceAll('"/presets/', '"presets/').replaceAll('"/samples/', '"samples/'));

await cp(join(root, "web"), out, { recursive: true });
const index = join(out, "index.html");
await writeFile(index, (await readFile(index, "utf8")).replace("<html lang=\"en\">", "<html lang=\"en\" data-static>"));
await cp(join(root, "presets"), join(out, "presets"), { recursive: true });
await cp(join(root, "samples"), join(out, "samples"), { recursive: true });

const runs = [];
const photos = new Set<string>();
const tracks = new Set<string>();
for (const id of existsSync(join(data, "runs")) ? await readdir(join(data, "runs")) : []) {
  const file = join(data, "runs", id, "run.json");
  if (!existsSync(file)) continue;
  const run = JSON.parse(await readFile(file, "utf8"));
  if (run.status !== "done" || !existsSync(join(data, "runs", id, "shot.mp4"))) continue;
  const dir = join(out, "media", "runs", id);
  await mkdir(dir, { recursive: true });
  for (const name of await readdir(join(data, "runs", id))) {
    if (name === "shot.mp4" || name.endsWith(".workflow.json")) await copyFile(join(data, "runs", id, name), join(dir, name));
  }
  const r = run.request;
  for (const f of [r.start, r.end?.file, run.frameFile, r.references?.sheet, r.references?.cast, r.references?.prop, r.references?.location,
    ...(r.keyframes ?? []).map((k: { file: string }) => k.file)]) if (f) photos.add(f);
  if (r.audio?.file) tracks.add(r.audio.file);
  runs.push(run);
}
runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.take - a.take);
for (const [set, folder] of [[photos, "photos"], [tracks, "audio"]] as const) {
  await mkdir(join(out, "media", folder), { recursive: true });
  for (const f of set) if (existsSync(join(data, folder, f))) await copyFile(join(data, folder, f), join(out, "media", folder, f));
}

// films cut from takes (Build film, the Director)
const films = [];
for (const name of existsSync(join(data, "reels")) ? await readdir(join(data, "reels")) : []) {
  if (!name.endsWith(".json")) continue;
  const film = JSON.parse(await readFile(join(data, "reels", name), "utf8"));
  if (!existsSync(join(data, "reels", `${film.id}.mp4`))) continue;
  await mkdir(join(out, "media", "reels"), { recursive: true });
  await copyFile(join(data, "reels", `${film.id}.mp4`), join(out, "media", "reels", `${film.id}.mp4`));
  films.push(film);
}
films.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const repository = typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url;
const samples = (await readdir(join(root, "samples"))).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort();
await mkdir(join(out, "api"), { recursive: true });
await writeFile(join(out, "api", "info.json"), JSON.stringify({ target: "demo", url: "", workflows: "workflows", repository, reels: false, static: true }));
await writeFile(join(out, "api", "presets.json"), JSON.stringify(relative(await loadPresets(join(root, "presets")))));
await writeFile(join(out, "api", "samples.json"), JSON.stringify(samples.map((f) => ({ name: f.replace(/\.\w+$/, ""), url: `samples/${f}` }))));
await writeFile(join(out, "api", "runs.json"), JSON.stringify(relative(runs)));
await writeFile(join(out, "api", "reels.json"), JSON.stringify(relative(films)));
// the image library: the photos the takes use, with their sizes
const library = [];
for (const file of photos) {
  const path = join(data, "photos", file);
  if (!existsSync(path)) continue;
  const size = imageSize(await readFile(path));
  if (size) library.push({ file, url: `/media/photos/${file}`, ...size, createdAt: (await stat(path)).mtime.toISOString() });
}
library.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
await writeFile(join(out, "api", "photos.json"), JSON.stringify(relative(library)));
await writeFile(join(out, ".nojekyll"), "");
await writeFile(join(out, MARK), "Built by scripts/demo-site.ts; safe to delete and rebuild.\n");
console.log(`${out}: ${runs.length} takes, ${films.length} films, ${photos.size} photos, ${tracks.size} tracks`);
