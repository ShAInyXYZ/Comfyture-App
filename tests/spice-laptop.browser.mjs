// Spice on a laptop: at every common screen the page has no sideways scroll, the shots, the chain, the tool's key and the shelf are on
// screen or reachable by the scroll of their own area, and nothing of the suite is cut. Each size is measured on the example scenario.
// Not part of `node --test` (it needs a browser). From the repo root:
//   NODE_PATH=<a node_modules that has playwright> CHROME=<chrome or chromium binary> node tests/spice-laptop.browser.mjs
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { tempDir } from "./tools/temp.mjs";

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const root = resolve(import.meta.dirname, "..");
const dataDir = tempDir("spice-laptop-");
let failures = 0;
const ok = (cond, msg, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${msg}${extra ? `  ${extra}` : ""}`);
  if (!cond) failures++;
};
const port = await new Promise((done) => {
  const s = createServer().listen(0, () => {
    const { port } = s.address();
    s.close(() => done(port));
  });
});
const server = spawn(process.execPath, ["server/main.ts"], { cwd: root, env: { ...process.env, PORT: String(port), COMFYTURE_DATA: dataDir, COMFY_API_KEY: "" }, stdio: "ignore" });
const base = `http://127.0.0.1:${port}`;
for (let i = 0; i < 100; i++) {
  if (await fetch(`${base}/api/spice/tools`).then((r) => r.ok, () => false)) break;
  await new Promise((r) => setTimeout(r, 200));
}
const SIZES = [[1280, 720], [1366, 768], [1440, 900], [1470, 956], [1512, 982], [1536, 864], [1600, 950], [1920, 1080]];
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ["--no-sandbox"] });
try {
  for (const [width, height] of SIZES) {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await context.route((url) => !["127.0.0.1", "localhost"].includes(url.hostname), (route) => route.abort());
    await page.goto(`${base}/#/spice`);
    await page.waitForSelector(".sp-shot");
    await page.waitForTimeout(900);
    await page.locator(".sp-tchip").first().click();
    await page.waitForTimeout(400);
    // each control scrolled into its area's view and hit-tested: the top-most element at its centre is it (or inside it)
    const reach = async (sel) => page.locator(sel).first().evaluate((el) => {
      el.scrollIntoView({ block: "nearest", inline: "nearest" });
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4 || r.bottom > innerHeight || r.top < 0 || r.right > innerWidth) return `off screen (x ${Math.round(r.left)}-${Math.round(r.right)} of ${innerWidth}, y ${Math.round(r.top)}-${Math.round(r.bottom)} of ${innerHeight})`;
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return hit && (hit === el || el.contains(hit)) ? "" : `covered by ${hit?.className ?? hit?.tagName ?? "nothing"}`;
    });
    const results = {};
    for (const [name, sel] of [["a shot", ".sp-shot-main"], ["Add a shot", ".sp-add"], ["the wipe", ".sp-wipe i"], ["play", ".sp-iconkey.is-play"], ["the chain", ".sp-chain .sp-link-main"], ["the tool's key", ".sp-tool-key .sp-primary"], ["the shelf", ".sp-tchip"], ["the bin", ".sp-b-bin"], ["Paprika's bar", "#spice-chat .chat-bar"]]) results[name] = await reach(sel);
    const wide = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    const bad = Object.entries(results).filter(([, v]) => v);
    ok(!wide && !bad.length && !errors.length, `${width}x${height}: everything on screen and reachable`, [wide ? "sideways scroll" : "", ...bad.map(([k, v]) => `${k} ${v}`), ...errors].filter(Boolean).join("; "));
    if (width === 1280 || width === 1470) await page.screenshot({ path: tempDir("spice-shot-") + `/spice-${width}.png` }).catch(() => {});
    await context.close();
  }
} finally {
  await browser.close();
  server.kill();
}
console.log(failures ? `${failures} FAILED` : "all passed");
process.exit(failures ? 1 : 0);
