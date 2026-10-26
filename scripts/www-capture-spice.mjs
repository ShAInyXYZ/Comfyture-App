// Spice's two screens for the website (www/media/app/spice.webp and tour.webp), captured from a lab server with the shipped example:
// Truffle's Jam Heist open on SH010's last pass with Outpaint picked (the chain under the viewer, the tools by family), and Paprika's tour
// on the chain. 1600x950 at twice the pixels, as www/README.md says; then CAPTURES=<out's parent> python3 scripts/www-media.py.
//   NODE_PATH=<a node_modules that has playwright> node scripts/www-capture-spice.mjs <out folder>   (writes <out>/c/spice-01-heist.png, c/spice-02-tour-chain.png)
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const root = resolve(import.meta.dirname, "..");
const out = resolve(process.argv[2] ?? "captures");
await mkdir(join(out, "c"), { recursive: true });
const dataDir = await mkdtemp(join(tmpdir(), "spice-capture-"));
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
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ["--no-sandbox"] });
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 950 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  // a key is saved, so the keys show their prices
  await page.route("**/api/account", (route) => (route.request().method() === "GET" ? route.fulfill({ json: { target: { kind: "comfy-cloud", url: "https://cloud.comfy.org" }, key: { set: true, last4: "abcd", source: "env" }, openWeights: false, balance: { credits: 1482, usd: 7 } } }) : route.continue()));
  await page.goto(`${base}/#/spice`);
  await page.waitForSelector(".sp-shot");
  await page.waitForTimeout(1500);
  await page.locator(".sp-shot").first().locator(".sp-shot-main").click();
  await page.waitForTimeout(800);
  // the pass whose wipe shows the most: the day turned to night
  await page.locator(".sp-chain .sp-link", { hasText: /^Day to night$/ }).locator(".sp-link-main").click();
  await page.waitForTimeout(600);
  await page.locator(".sp-tchip").filter({ has: page.locator("span", { hasText: /^Outpaint$/ }) }).click();
  await page.mouse.move(8, 700);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(out, "c", "spice-01-heist.png") });
  // the tour, to its step on the chain
  await page.locator("#tour-key").click();
  await page.waitForSelector(".tour-card");
  for (let i = 0; i < 12 && !/The chain/.test(await page.locator(".tour-title").textContent()); i++) {
    await page.locator(".tour-next").click();
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(out, "c", "spice-02-tour-chain.png") });
  console.log(`captured into ${out}/c/`);
} finally {
  await browser.close();
  server.kill();
  await rm(dataDir, { recursive: true, force: true });
}
