// Bakes Comfyture's flagship exports through the app's own export routes, so the project that ships holds
// real files made the way a user makes them: every still by exportPng(), the intro video by renderMotion().
//   1. Start a server on an empty data folder (it seeds the flagship from brands/ on its first start):
//        PORT=5220 COMFYTURE_DATA=<an empty folder> node --env-file=.env server/main.ts
//   2. BASE=http://localhost:5220 node scripts/macaron-bake.mjs
//   3. node scripts/macaron-comfyture.ts      (writes the exports into brands/comfyture.brand.json)
// The files land in web/brand/macaron/comfyture/exports/ with a manifest, index.json.
// Needs Playwright (not a dependency of the app) and a Chromium: set CHROME to its path when it is not found.
import { createRequire } from "node:module";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const BASE = process.env.BASE;
if (!BASE) {
  console.error("Set BASE to the address of a server running on an empty data folder, e.g. BASE=http://localhost:5220");
  process.exit(1);
}
const { chromium } = createRequire(import.meta.url)("playwright");
const OUT = fileURLToPath(new URL("../web/brand/macaron/comfyture/exports/", import.meta.url));
const URL_BASE = "brand/macaron/comfyture/exports";
const JOBS = [["launch", ["4:5", "1:1", "9:16"]], ["showcase", ["4:5", "9:16"]], ["brioche", ["4:5", "1:1"]], ["rooms", ["4:5", "9:16"]], ["hero", ["4:5", "1:1"]], ["board", ["4:5", "1:1"]]];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage({ viewport: { width: 1700, height: 1000 } });
  page.on("pageerror", (e) => console.log("pageerror:", e.message.slice(0, 500)));
  await page.goto(`${BASE}/#/macaron`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  // a file the server holds, as bytes
  const grab = async (url) => Buffer.from(await page.evaluate(async (u) => {
    const b = new Uint8Array(await (await fetch(u)).arrayBuffer());
    let s = "";
    for (let i = 0; i < b.length; i += 32768) s += String.fromCharCode(...b.subarray(i, i + 32768));
    return btoa(s);
  }, url), "base64");
  const manifest = { at: new Date().toISOString(), exports: [], render: {}, thumbs: {} };
  for (const [id, formats] of JOBS) {
    for (const format of formats) {
      const rec = await page.evaluate(async ({ id, format }) => (await import("/js/macaron.js")).exportPng(id, format, { download: false }), { id, format });
      if (!rec) {
        console.log("FAILED", id, format);
        continue;
      }
      const file = `${id}-${format.replace(":", "x")}.png`;
      writeFileSync(join(OUT, file), await grab(rec.url));
      const out = { ...rec, file, url: `${URL_BASE}/${file}`, at: manifest.at };
      manifest.exports.push(out);
      if (format === "4:5") manifest.thumbs[id] = { file, url: out.url, format };
      console.log("export", id, format, `${rec.width}x${rec.height}`, rec.bytes);
    }
  }
  // the motion piece: the frames are drawn from the layers by drawDesign, the server encodes them
  const render = await page.evaluate(async () => (await import("/js/macaron.js")).renderMotion("m-intro"));
  if (!render) throw new Error("the render failed");
  const [video, poster] = ["intro-9x16.mp4", "intro-poster-9x16.png"];
  writeFileSync(join(OUT, video), await grab(render.url));
  writeFileSync(join(OUT, poster), await grab(render.poster));
  manifest.render["m-intro"] = { ...render, url: `${URL_BASE}/${video}`, file: video, poster: `${URL_BASE}/${poster}`, at: manifest.at };
  manifest.exports.push({ id: "x-intro-mp4", design: "intro", designName: "Logo and product intro", format: "9:16", kind: "mp4", url: `${URL_BASE}/${video}`, file: video, width: render.width, height: render.height, bytes: render.bytes, duration: render.duration, poster: `${URL_BASE}/${poster}`, at: manifest.at });
  manifest.thumbs.intro = { file: poster, url: `${URL_BASE}/${poster}`, format: "9:16" };
  writeFileSync(join(OUT, "index.json"), JSON.stringify(manifest, null, 1));
  console.log("render", `${render.width}x${render.height}`, `${render.duration}s`, render.bytes);
} finally {
  await browser.close();
}
