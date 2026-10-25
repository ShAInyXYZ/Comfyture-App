// What a judge with no key sees of the bay (#/spice?bay) on a fresh data folder: the example the app ships ("The yard at dusk") already open
// with its takes, each of a stage that has one, said to be an example's result; the wipe between the footage and a take; the plan with its steps
// ticked; the way to the VFX house; Paprika's tour played through, free, from its first step to its last; and nothing sent that would spend
// credits. Comfy Cloud is not reachable here: a request for a template run is refused by the browser and counted.
// Not part of `node --test` (it needs a browser). From the repo root:
//   NODE_PATH=<a node_modules that has playwright> CHROME=<chrome or chromium binary> node tests/bay-example.browser.mjs
// OUT=<folder> keeps screenshots.
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { tempDir } from "./tools/temp.mjs";

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const root = resolve(import.meta.dirname, "..");
const out = process.env.OUT ? resolve(process.env.OUT) : null;
if (out) await mkdir(out, { recursive: true });
const dataDir = tempDir("bay-ex-data-");
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
const server = spawn(process.execPath, ["server/main.ts"], { cwd: root, env: { ...process.env, PORT: String(port), COMFYTURE_DATA: dataDir, COMFY_API_KEY: "", COMFYTURE_JUDGE: "1" }, stdio: "ignore" });
const base = `http://127.0.0.1:${port}`;
for (let i = 0; i < 100; i++) {
  if (await fetch(`${base}/api/spice-bays`).then((r) => r.ok, () => false)) break;
  await new Promise((r) => setTimeout(r, 200));
}

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ["--no-sandbox"] });
try {
  for (const [w, h] of [[1280, 720], [1600, 950]]) {
    const context = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await context.newPage();
    const errors = [];
    const sent = [];
    const outbound = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && !/GL Driver|favicon|Failed to load resource/.test(m.text()) && errors.push(m.text()));
    await context.route((url) => !["127.0.0.1", "localhost"].includes(url.hostname), (route) => (outbound.push(route.request().url()), route.abort()));
    await page.route(/\/api\/(utensils\/templates\/[\w.-]+\/run|bay\/assist)/, (route) => (sent.push(route.request().url()), route.abort()));
    const settle = (ms = 350) => page.waitForTimeout(ms);
    const shot = (name) => out && page.screenshot({ path: join(out, `${name}-${w}.png`) });
    const tag = `${w}×${h}`;

    await page.goto(`${base}/#/spice?bay`);
    await page.waitForSelector(".bay .bay-step");
    await settle(900);
    ok((await page.locator(".bay-side .bay-shotchip").textContent()).includes("The yard at dusk"), `${tag}: a fresh visit opens on the example`);
    ok((await page.locator(".bay-v-empty").isHidden()), `${tag}: with its clip in the viewer`);
    const lamps = await page.locator(".bay-step").evaluateAll((els) => els.map((e) => [e.dataset.stage, e.querySelector(".bay-lamp").dataset.tone]));
    const done = lamps.filter(([, t]) => t === "done").map(([s]) => s);
    ok(["conform", "clean", "direct", "finish"].every((s) => done.includes(s)), `${tag}: the stages the example shows have their pass`, done.join(","));
    ok((await page.locator(".bay-planstep").count()) >= 3 && (await page.locator(".bay-planstep.is-done").count()) >= 3, `${tag}: Paprika's plan is there, its steps ticked`);
    ok(/Classic Spice/.test(await page.locator(".bay-classic").textContent()), `${tag}: the way to the VFX house is on the screen`);
    await page.locator('.bay-step[data-stage="clean"]').click();
    await settle();
    ok((await page.locator(".bay-take").count()) >= 1 && /example result/.test(await page.locator(".bay-take-meta").first().textContent()), `${tag}: a take says it is an example's result`);
    ok(await page.locator(".bay-v-stage").evaluate((s) => !s.classList.contains("is-single")), `${tag}: the footage is against the take on the wipe`);
    const sizes = await page.evaluate(() => [...document.querySelectorAll(".bay-v-stage video")].filter((v) => v.getAttribute("src")).map((v) => v.readyState));
    ok(sizes.length === 2 && sizes.every((r) => r >= 2), `${tag}: both clips are loaded`, sizes.join(","));
    const side = await page.evaluate(() => {
      const s = document.querySelector(".bay-side");
      const b = document.querySelector(".bay-brief textarea").getBoundingClientRect();
      return { cut: s.scrollHeight - s.clientHeight, brief: Math.round(b.bottom - innerHeight) };
    });
    ok(side.cut <= 1 && side.brief <= 0, `${tag}: nothing in the left rail is cut off`, JSON.stringify(side));
    await shot("example-clean");
    await page.locator('.bay-step[data-stage="direct"]').click();
    await settle();
    await shot("example-direct");
    // the paid key asks, and the example sends nothing
    const key = page.locator(".bay-stage .bay-primary");
    ok(!(await key.isDisabled()) || /key/.test(await page.locator(".bay-problems").textContent()), `${tag}: Direct says what it needs before a press`);

    // ---- the tour, from the compass in the header, to its last step
    await page.locator("#tour-key").click();
    await page.waitForSelector(".tour-card");
    let steps = 0;
    const titles = [];
    for (;;) {
      await settle(450);
      titles.push(await page.locator(".tour-title").textContent());
      steps++;
      if (steps === 6) await shot("tour-step");
      const show = page.locator(".tour-show");
      if (await show.isVisible()) {
        await show.click();
        await page.waitForSelector(".tour-sim", { state: "detached", timeout: 15000 });
      }
      const next = page.locator(".tour-next");
      if (/Done|Finish|End/i.test((await next.textContent()) ?? "")) break;
      await next.click();
      if (steps > 20) break;
    }
    ok(steps >= 10 && /AI edit bay/.test(titles[0]) && /VFX house/.test(titles.at(-1)), `${tag}: the tour has its own steps, from the bay to the VFX house`, `${steps} steps: ${titles.join(" | ")}`);
    ok((await page.locator(".tour-card").count()) === 1, `${tag}: the last step is on screen`);
    await page.keyboard.press("Escape");
    ok(sent.length === 0, `${tag}: the tour and the example sent nothing that spends`, sent.join(","));

    // ---- the way to the VFX house, and back
    await page.locator(".bay-classic").click();
    await page.waitForSelector(".spice .sp-layer");
    ok(page.url().endsWith("#/spice"), `${tag}: the key leads to the VFX house`, page.url());
    await page.locator(".sp-id-go[aria-label='Open the AI edit bay']").click();
    await page.waitForSelector(".bay .bay-step");
    ok(page.url().endsWith("#/spice?bay"), `${tag}: and the VFX house has a key back`);
    ok(errors.length === 0, `${tag}: no errors on the page`, errors.join(" | "));
    ok(outbound.length === 0, `${tag}: nothing left this machine`, outbound.join(" | "));
    await context.close();
  }
} finally {
  await browser.close();
  server.kill();
}
console.log(failures ? `${failures} FAILED` : "all passed");
process.exit(failures ? 1 : 0);
