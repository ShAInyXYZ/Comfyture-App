// The live demo, built and played again with no app server: scripts/demo-site.ts builds site/ into a folder of its own, a tiny static
// server serves it under the sub-path /Comfyture/ (as GitHub Pages would), and every page is opened from there: it throws no error, it draws
// the example its product ships, and its tour plays to the end. Requests that reach a path the site does not have are listed; the ones the
// app tolerates (a read the snapshot does not hold answers "Not in the live demo") are reported, a missing file is a failure.
// Not part of `node --test` (it needs a browser, and the build records the pages with one). From the repo root:
//   PLAYWRIGHT_MODULE=<playwright's folder> node tests/demo-site.browser.mjs
import { spawnSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { extname, join, resolve } from "node:path";
import { PAGES, VIEWPORTS, playTour } from "../scripts/demo-pages.mjs";
import { tempDir } from "./tools/temp.mjs";

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const root = resolve(import.meta.dirname, "..");
let failures = 0;
const ok = (cond, msg, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${msg}${extra ? `  ${extra}` : ""}`);
  if (!cond) failures++;
};

// ---- the build, in a folder of its own
const site = join(tempDir("demo-site-"), "site");
const built = spawnSync("nice", [process.execPath, "scripts/demo-site.ts", site], { cwd: root, encoding: "utf8", env: { ...process.env, COMFY_API_KEY: "", COMFY_PROXY_TOKEN: "" } });
ok(built.status === 0, "the site builds", built.status === 0 ? "" : (built.stderr || built.stdout).slice(-600));
if (built.status !== 0) process.exit(1);
const buildLog = built.stdout;
ok(/Requests other than GET[^\n]*/.test(buildLog), "the build lists the requests other than GET the pages made");
ok(!/comfy\.org/.test(buildLog), "no call to Comfy's hosts in the build");

// ---- the site, served under /Comfyture/ and nowhere else
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".woff2": "font/woff2", ".glb": "model/gltf-binary", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" };
const missing = new Set();
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const file = path.startsWith("/Comfyture/") ? resolve(site, `.${path.slice("/Comfyture".length)}`) : null;
  const target = file?.startsWith(site) ? (path.endsWith("/") ? join(file, "index.html") : file) : null;
  const info = target ? await stat(target).catch(() => null) : null;
  if (!info?.isFile()) {
    missing.add(path);
    res.writeHead(404).end("not here");
    return;
  }
  const type = TYPES[extname(target)] ?? "application/octet-stream";
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? "");
  if (range) {
    const from = Number(range[1] || 0);
    const to = Math.min(Number(range[2] || info.size - 1), info.size - 1);
    res.writeHead(206, { "Content-Type": type, "Content-Range": `bytes ${from}-${to}/${info.size}`, "Content-Length": to - from + 1, "Accept-Ranges": "bytes" });
    createReadStream(target, { start: from, end: to }).pipe(res);
    return;
  }
  res.writeHead(200, { "Content-Type": type, "Content-Length": info.size, "Accept-Ranges": "bytes" });
  createReadStream(target).pipe(res);
}).listen(0);
await new Promise((r) => server.once("listening", r));
const base = `http://127.0.0.1:${server.address().port}/Comfyture/`;

// ---- every page, at both sizes
const browser = await chromium.launch({ args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const gone = new Map();
const toursPlayed = new Set();
for (const viewport of VIEWPORTS) {
  for (const { hash, name } of PAGES) {
    const label = `${viewport.width}x${viewport.height} ${hash}`;
    const context = await browser.newContext({ viewport });
    await context.route((url) => url.origin !== new URL(base).origin, (route) => route.abort());
    const page = await context.newPage();
    const errors = [];
    const outside = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("request", (req) => {
      if (req.method() !== "GET" && new URL(req.url()).origin === new URL(base).origin) outside.push(`${req.method()} ${req.url()}`);
      if (new URL(req.url()).pathname.startsWith("/api/")) outside.push(`GET ${req.url()} (above the site's folder)`);
    });
    page.on("response", (res) => {
      if (res.status() === 404 && new URL(res.url()).origin === new URL(base).origin) gone.set(new URL(res.url()).pathname.replace("/Comfyture/", ""), label);
    });
    await page.goto(`${base}${hash}`);
    await page.waitForTimeout(3000);
    ok((await page.locator("html[data-static]").count()) === 1, `${label}: the page is the static one`);
    if (name) ok(await page.getByText(name, { exact: false }).first().isVisible().catch(() => false), `${label}: "${name}" is drawn`);
    else ok((await page.locator("main, .page, body").first().innerText()).length > 50, `${label}: the page draws something`);
    const steps = await playTour(page);
    ok(steps !== -1, `${label}: the tour plays to its end`, steps > 0 ? `${steps} steps` : steps === 0 ? "(no tour)" : "");
    if (steps > 0) toursPlayed.add(hash);
    ok(errors.length === 0, `${label}: no page error`, errors.slice(0, 3).join(" | "));
    ok(outside.length === 0, `${label}: nothing asked of a server`, outside.slice(0, 3).join(" | "));
    await context.close();
  }
}
ok(toursPlayed.size >= 8, "a tour played for every product", [...toursPlayed].join(" "));
await browser.close();
server.close();

// ---- what the site does not have
const files = [...gone].filter(([path]) => !/^api\//.test(path));
const reads = [...gone].filter(([path]) => /^api\//.test(path));
for (const [path, where] of reads) console.log(`NOTE  no snapshot of ${path}  (first at ${where}: answered "Not in the live demo")`);
for (const [path, where] of files) console.log(`MISSING  ${path}  (first at ${where})`);
ok(files.length === 0, "no file the pages ask for is missing from the site", files.map(([p]) => p).slice(0, 5).join(" "));

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
