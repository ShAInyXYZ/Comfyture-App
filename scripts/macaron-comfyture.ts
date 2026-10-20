// Builds Comfyture's own Macaron project (the flagship) and writes it to brands/comfyture.brand.json, which
// the server puts into data/brands the first time it starts:
//   node scripts/macaron-comfyture.ts
// The pictures are in web/brand/macaron/comfyture/ (scripts/macaron-assets.py), the logos in web/brand/.
// The exports and the rendered video are added to it by scripts/macaron-bake.mjs.
import { existsSync } from "node:fs";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { A, kit } from "./macaron-comfyture-kit.ts";
import * as made from "./macaron-comfyture-designs.ts";
import { content } from "./macaron-comfyture-content.ts";

const now = new Date().toISOString();
const designs = content.designs(made, now);
// what was baked through the app's own export (web/brand/macaron/comfyture/exports/index.json): the pictures and the video
const baked = existsSync(`web/${A}/exports/index.json`) ? JSON.parse(await readFile(`web/${A}/exports/index.json`, "utf8")) : null;
// they are the last thing that happened: stamped with the time the project is built
if (baked) {
  baked.exports = baked.exports.map((x: any) => ({ ...x, at: now }));
  for (const k of Object.keys(baked.render)) baked.render[k].at = now;
}
if (baked) {
  for (const d of designs) if (baked.thumbs[d.id]) d.thumb = baked.thumbs[d.id];
  for (const d of designs.filter((x: any) => x.variant)) delete d.thumb;
}
const body = {
  // the revision of what this project holds: a copy a person already has gains what is new once (server/macaron.ts, topUpBrand)
  seedRev: 2,
  // the shoot sends this to the image model as the logo: a picture it can read, not the SVG
  logo: { url: "brand/wordmark-2400.png", width: 2400, height: 793 },
  colours: kit.palette.map((p) => p.hex),
  fonts: ["Manrope", "IBM Plex Mono"],
  voice: kit.voice.words,
  dos: kit.voice.dos[0],
  donts: kit.voice.donts[0],
  headline: "Direct a shot. Or a whole film.",
  tagline: kit.tagline,
  products: content.products,
  product: "jar",
  outputs: [],
  shoot: { formats: {}, count: 2 },
  kit: { ...kit, palette: kit.palette.map((p, i) => ({ ...p, share: [8, 56, 14, 22][i] })) },
  brief: content.brief,
  directions: content.directions,
  refs: content.refs(now),
  assets: content.assets,
  history: [...content.history(designs), ...(baked?.exports ?? []).filter((x: any, i: number, all: any[]) => all.findIndex((y) => y.design === x.design) === i).map((x: any) => ({ id: `h-${x.design}-${x.format.replace(":", "x")}-${x.kind}`, at: x.at, kind: "export", title: `${x.designName} exported`, note: `${x.kind === "mp4" ? `MP4 ${x.width}×${x.height}, ${x.duration} s` : `PNG ${x.width}×${x.height}`}`, src: x.poster ?? x.url, designId: x.design }))],
  designs,
  motion: content.motion.map((m: any) => (baked?.render[m.id] ? { ...m, render: baked.render[m.id] } : m)),
  exports: baked?.exports ?? [],
};
const project = { id: "brand-comfyture", name: "Comfyture", createdAt: "2026-10-16T22:00:00.000Z", updatedAt: now, thumb: `${A}/thumb.webp`, body };
await mkdir("brands", { recursive: true });
await writeFile("brands/comfyture.brand.json", JSON.stringify(project, null, 1));
console.log(`brands/comfyture.brand.json: ${designs.length} designs, ${body.assets.length} pictures, ${body.refs.length} references, ${body.history.length} steps`);
