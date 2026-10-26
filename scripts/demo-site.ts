// Builds the live demo: the whole app as static files, every product open on its shipped example and every tour playable, with no
// server, no GPU and no key. Anyone can browse it; rendering is off.
//
//   node scripts/demo-site.ts [folder]      (default: site/)
//
// How: it starts the app's own server on a free port, on a fresh data folder the server seeds with every product's examples
// (examples/), and with no key and no Comfy to reach, so nothing can render or be spent. A headless browser (Playwright, which
// the build needs: PLAYWRIGHT_MODULE=<its folder> if it is not installed here) then opens every page at two sizes and plays its
// tour; each read of the API the pages make is written down in site/api/, and each file they fetch (media, models...) is copied.
// In the browser, js/static-demo.js answers the reads from those files. Your own data/ folder is never read.
//
// Serve the folder from any static host, GitHub Pages included; it works under a sub-path.

import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { PAGES, VIEWPORTS, playTour } from "./demo-pages.mjs";
import { FILE_FOLDERS, relativeUrls, snapshotFile } from "../web/js/snapshot.js";

const root = resolve(import.meta.dirname, "..");
const out = resolve(process.argv[2] ?? join(root, "site"));
const web = join(root, "web");
const MARK = ".comfyture-site";

// only ever clear a folder this script made
if (existsSync(out) && (await readdir(out)).length) {
  if (!existsSync(join(out, MARK))) throw new Error(`${out} exists and isn't a Comfyture demo site; pick an empty folder.`);
  await rm(out, { recursive: true });
}
await mkdir(out, { recursive: true });

// ---- the server: the app's own, on a folder of its own, able to reach nothing
const freePort = () =>
  new Promise<number>((done) => {
    const s = createServer().listen(0, () => {
      const { port } = (s.address() as { port: number });
      s.close(() => done(port));
    });
  });
const port = await freePort();
const base = `http://127.0.0.1:${port}`;
const data = await mkdtemp(join(tmpdir(), "comfyture-demo-"));
const env = { ...process.env, PORT: String(port), COMFYTURE_DATA: data, COMFY_BASE_URL: "http://127.0.0.1:9" };
delete env.COMFY_API_KEY;
delete env.COMFY_PROXY_TOKEN;
// (and if some code reached for Comfy's hosts anyway, it would throw; only the public catalog of the official templates is let through,
// its index and its pictures, which ask for no key: the home's storefront and Utensils' Library show them)
env.NODE_OPTIONS = `--import=data:text/javascript,${encodeURIComponent('const real = globalThis.fetch; globalThis.fetch = (input, init) => { const url = typeof input === "string" ? input : input?.url ?? String(input); if (/comfy\\.org/.test(url) && !/^https:\\/\\/cloud\\.comfy\\.org\\/templates\\//.test(url)) throw new Error("blocked outbound call: " + url); return real(input, init); };')}`;
const server = spawn(process.execPath, ["server/main.ts"], { cwd: root, env, stdio: "ignore" });
const stop = async () => {
  server.kill();
  await rm(data, { recursive: true, force: true });
};
process.on("SIGINT", () => stop().then(() => process.exit(1)));

type Recorded = { api: Map<string, Buffer>; files: Set<string>; pictures: Map<string, string>; other: Map<string, number>; skipped: Set<string> };
const recorded: Recorded = { api: new Map(), files: new Set(), pictures: new Map(), other: new Map(), skipped: new Set() };

try {
  for (let i = 0; ; i++) {
    if (await fetch(`${base}/api/info`).then((r) => r.ok, () => false)) break;
    if (i === 150) throw new Error("The app's server did not start.");
    await new Promise((r) => setTimeout(r, 200));
  }
  await record();
  await write();
} finally {
  await stop();
}

/** Opens every page at both sizes, plays its tour, and notes what the pages read. */
async function record() {
  const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ?? "playwright");
  const browser = await chromium.launch({ args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  for (const viewport of VIEWPORTS) {
    for (const { hash } of PAGES) {
      const context = await browser.newContext({ viewport });
      // nothing but the app's own server is reachable, Comfy's hosts least of all
      await context.route((url: URL) => url.origin !== base, (route: { abort(): Promise<void> }) => route.abort());
      const page = await context.newPage();
      const pending: Promise<void>[] = [];
      page.on("request", (req: { method(): string; url(): string }) => {
        if (req.method() === "GET") return;
        const key = `${req.method()} ${new URL(req.url()).pathname}`;
        recorded.other.set(key, (recorded.other.get(key) ?? 0) + 1);
      });
      page.on("response", (res: { request(): { method(): string }; url(): string; status(): number; headers(): Record<string, string>; body(): Promise<Buffer> }) => {
        if (res.request().method() !== "GET") return;
        const url = new URL(res.url());
        if (url.origin !== base) return;
        if (url.pathname.startsWith("/api/")) {
          if (res.status() !== 200) return;
          // (a picture the API serves, as the templates' thumbnails are, is kept as a file at its own path, where an <img> asks for it: a
          // static host leaves the query out, so the still a grid asks for, "?still=1", is the one kept, never the whole animation)
          if (/^image\//.test(res.headers()["content-type"] ?? "")) {
            const path = decodeURIComponent(url.pathname.slice(1));
            if (!recorded.pictures.has(path) || url.searchParams.has("still")) recorded.pictures.set(path, url.search);
            return;
          }
          if (!/json/.test(res.headers()["content-type"] ?? "")) return void recorded.skipped.add(url.pathname);
          pending.push(res.body().then((body) => void recorded.api.set(url.pathname.slice(1) + url.search, body), () => {}));
          // (media comes back as 206 pieces when it plays: the file is fetched whole later)
        } else if (res.status() === 200 || res.status() === 206) recorded.files.add(decodeURIComponent(url.pathname.slice(1)));
      });
      await page.goto(`${base}/${hash}`);
      await page.waitForTimeout(2500);
      const steps = await playTour(page);
      await page.waitForTimeout(500);
      await openInside(page, hash);
      await Promise.all(pending);
      console.log(`${viewport.width}x${viewport.height} ${hash}: ${steps < 0 ? "tour did not end" : `tour of ${steps} steps`}`);
      await context.close();
    }
  }
  await browser.close();
}

/** Where a tour may not have gone: Jam's workspaces and Spice's departments, each opened in turn (through the page's own modules). */
async function openInside(page: { evaluate(fn: (hash: string) => Promise<void>, arg: string): Promise<void> }, hash: string) {
  if (hash !== "#/jam" && !hash.startsWith("#/spice")) return;
  await page.evaluate(async (h) => {
    const jam = h === "#/jam";
    const { WORKSPACES } = await import(jam ? "./js/jam-harness.js" : "./js/spice-harness.js");
    const open = (await import(jam ? "./js/jam.js" : "./js/spice.js"))[jam ? "setWorkspace" : "setDept"];
    for (const w of WORKSPACES) {
      open(w.id);
      await new Promise((r) => setTimeout(r, 1200));
    }
  }, hash);
}

/** Writes the site: the app, the snapshot of what its pages read, the files they fetched. */
async function write() {
  await cp(web, out, { recursive: true });
  const index = join(out, "index.html");
  await writeFile(index, (await readFile(index, "utf8")).replace("<html lang=\"en\">", "<html lang=\"en\" data-static>"));
  await cp(join(root, "presets"), join(out, "presets"), { recursive: true });
  await cp(join(root, "samples"), join(out, "samples"), { recursive: true });

  // the header says "Live demo" from the info
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const repository = typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url;
  const info = JSON.parse(recorded.api.get("api/info")?.toString() ?? "{}");
  recorded.api.set("api/info", Buffer.from(JSON.stringify({ ...info, target: "demo", url: "", workflows: "workflows", repository, reels: false, static: true })));
  for (const [path, body] of recorded.api) {
    const file = join(out, snapshotFile(path));
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, relativeUrls(body.toString("utf8")));
  }

  // the files the pages fetched (the app's own are in the copy of web/ already), whole, from the server
  let copied = 0;
  for (const path of recorded.files) {
    const to = join(out, path);
    if (existsSync(to)) continue;
    const res = await fetch(`${base}/${path.split("/").map(encodeURIComponent).join("/")}`).catch(() => null);
    if (!res?.ok) continue;
    await mkdir(dirname(to), { recursive: true });
    await writeFile(to, Buffer.from(await res.arrayBuffer()));
    copied++;
  }
  for (const [path, search] of recorded.pictures) {
    const res = await fetch(`${base}/${path.split("/").map(encodeURIComponent).join("/")}${search}`).catch(() => null);
    if (!res?.ok) continue;
    await mkdir(dirname(join(out, path)), { recursive: true });
    await writeFile(join(out, path), Buffer.from(await res.arrayBuffer()));
    copied++;
  }
  const strays = [...recorded.files].filter((f) => !FILE_FOLDERS.includes(f.split("/")[0]) && !existsSync(join(web, f)));
  if (strays.length) console.log(`Files from folders the replay does not know (see FILE_FOLDERS in web/js/snapshot.js): ${strays.slice(0, 5).join(", ")}`);
  await writeFile(join(out, ".nojekyll"), "");
  await writeFile(join(out, MARK), "Built by scripts/demo-site.ts; safe to delete and rebuild.\n");

  console.log(`${out}: ${recorded.api.size} answers, ${copied} files copied`);
  console.log(`Requests other than GET the pages made (none was paid: no key, no Comfy to reach): ${recorded.other.size ? "" : "none"}`);
  for (const [key, n] of recorded.other) console.log(`  ${n} x ${key}`);
  if (recorded.skipped.size) console.log(`API answers that are not JSON, left out: ${[...recorded.skipped].join(", ")}`);
  await sizeReport();
  await noKeys();
}

/** The site is public: it may hold no key. Any text file with what looks like a Comfy key in it fails the build. */
async function noKeys() {
  const found: string[] = [];
  const walk = async (dir: string) => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, e.name);
      if (e.isDirectory()) await walk(path);
      else if (/\.(json|js|mjs|html|css|md|txt|svg)$/i.test(e.name) && /comfyui-[A-Za-z0-9_-]{20,}/.test(await readFile(path, "utf8"))) found.push(relative(out, path));
    }
  };
  await walk(out);
  if (found.length) throw new Error(`What looks like a Comfy key is in ${found.join(", ")}: the site is not safe to publish.`);
}

/** The site's size, and its ten largest files. */
async function sizeReport() {
  const all: { path: string; size: number }[] = [];
  const walk = async (dir: string) => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      if (e.isDirectory()) await walk(join(dir, e.name));
      else all.push({ path: relative(out, join(dir, e.name)), size: (await stat(join(dir, e.name))).size });
    }
  };
  await walk(out);
  const mb = (n: number) => (n / 1e6).toFixed(1);
  console.log(`${all.length} files, ${mb(all.reduce((sum, f) => sum + f.size, 0))} MB. The ten largest:`);
  for (const f of all.sort((a, b) => b.size - a.size).slice(0, 10)) console.log(`  ${mb(f.size).padStart(6)} MB  ${f.path}`);
}
