// Spice in a real browser on a fresh install: the example scenario opens (Truffle's Jam Heist, every pass a real run), its shots and the
// chain, the viewer's wipe between what a pass ran on and what it made, the tools by family with the dot of what a real run showed, a
// tool picked with its price, the key that asks first and sends once (Comfy Cloud is not reachable here: the run is refused by the browser
// and counted, so no credit is ever spent), the window that adds a shot, and the tour. Opening Spice and the tour save nothing: the
// shipped example stays as it was shipped (byte-compared).
// Not part of `node --test` (it needs a browser). From the repo root:
//   NODE_PATH=<a node_modules that has playwright> CHROME=<chrome or chromium binary> node tests/spice.browser.mjs
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { tempDir } from "./tools/temp.mjs";

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const root = resolve(import.meta.dirname, "..");
const dataDir = tempDir("spice-data-");
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
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ["--no-sandbox"] });
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  const page = await context.newPage();
  const errors = [];
  const asked = [];
  const puts = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !/GL Driver|favicon|Failed to load resource/.test(m.text()) && errors.push(m.text()));
  page.on("request", (r) => r.method() === "PUT" && r.url().includes("/api/spice-scenarios/") && puts.push(r.url()));
  await context.route((url) => !["127.0.0.1", "localhost"].includes(url.hostname), (route) => route.abort());
  await page.route("**/api/spice/run", (route) => (asked.push(route.request().postDataJSON()), route.abort()));
  // a key is saved, so a run can be asked for
  await page.route("**/api/account", (route) => (route.request().method() === "GET" ? route.fulfill({ json: { target: { kind: "comfy-cloud", url: "https://cloud.comfy.org" }, key: { set: true, last4: "abcd", source: "env" }, openWeights: false, balance: { credits: 500, usd: 2 } } }) : route.continue()));
  const settle = (ms = 400) => page.waitForTimeout(ms);
  const chip = (name) => page.locator(".sp-tchip").filter({ has: page.locator("span", { hasText: new RegExp(`^${name}$`) }) });
  const stored = async () => JSON.stringify((await (await fetch(`${base}/api/spice-scenarios/spice-example-heist`)).json()).project);
  const shipped = await stored();

  // ---- a first visit: the example scenario, its shots and its chain
  await page.goto(`${base}/#/spice`);
  await page.waitForSelector(".sp-shot");
  await settle(1200);
  ok((await page.locator(".sp-shotchip .sel-label").innerText()).includes("Truffle's Jam Heist"), "a first visit opens the example scenario");
  const shots = await page.locator(".sp-shot").count();
  ok(shots === 5, `its five shots are on the strip (${shots})`);
  ok((await page.locator(".sp-shot.is-on").count()) === 1, "one is open");
  const links = await page.locator(".sp-chain .sp-link").count();
  ok(links >= 3, `the chain under the viewer: the plate and the passes (${links})`);
  ok((await page.locator(".sp-chain .sp-link.is-on").count()) === 1 && !(await page.locator(".sp-chain .sp-link.is-on").first().innerText()).includes("Plate"), "the last pass is looked at");
  ok(!(await page.locator(".sp-wipe").isHidden()), "the viewer wipes what the pass ran on against what it made");
  const beforeSrc = await page.locator(".sp-plane.is-before video").getAttribute("src");
  const afterSrc = await page.locator(".sp-plane.is-after video").getAttribute("src");
  ok(beforeSrc && afterSrc && beforeSrc !== afterSrc, "two different clips, before and after", `${beforeSrc?.split("/").pop()} | ${afterSrc?.split("/").pop()}`);
  // the plate looked at: no wipe
  await page.locator(".sp-chain .sp-link", { hasText: /^Plate$/ }).locator(".sp-link-main").click();
  await settle();
  ok(await page.locator(".sp-wipe").isHidden(), "the plate alone has no wipe");
  await page.locator(".sp-chain .sp-link").nth(1).locator(".sp-link-main").click();
  await settle();
  ok(!(await page.locator(".sp-wipe").isHidden()), "a pass looked at wipes again");
  // another shot
  await page.locator(".sp-shot").nth(1).locator(".sp-shot-main").click();
  await settle(600);
  ok((await page.locator(".sp-shot.is-on").count()) === 1 && (await page.locator(".sp-shot").nth(1).evaluate((e) => e.classList.contains("is-on"))), "a click opens another shot");
  ok((await page.locator(".sp-viewer-title b").innerText()).startsWith("SH020"), "the viewer says which", await page.locator(".sp-viewer-title").innerText());

  // ---- the tools: by family, each with its dot; one picked, its card and its price
  const chips = await page.locator(".sp-tchip").count();
  ok(chips >= 40, `the suite's tools are on the shelf (${chips})`);
  const families = await page.locator(".sp-family > .ut-label").allTextContents();
  ok(["Restore", "Clean", "Frame", "Camera", "Cut out", "Finish"].every((f) => families.includes(f)), "by family", families.join(" | "));
  ok((await page.locator(".sp-tchip .sp-dot.is-verified").count()) >= 20 && (await page.locator(".sp-tchip .sp-dot.is-failed").count()) >= 1 && (await page.locator(".sp-tchip .sp-dot.is-needs").count()) >= 5, "each with the dot of what a real run showed");
  await chip("Outpaint").click();
  await settle();
  ok((await page.locator(".sp-tool-name b").innerText()) === "Outpaint", "a tool is picked");
  ok((await page.locator(".sp-tool .uf-chip", { hasText: "Scope 2.39" }).count()) === 1, "a widening tool offers the frame to widen to");
  ok(/≈ \d+ cr/.test(await page.locator(".sp-tool-key .sp-primary").innerText()), "the key says what a run costs", (await page.locator(".sp-tool-key .sp-primary").innerText()).replace(/\s+/g, " "));
  await chip("Ingredients").click();
  await settle();
  ok(await page.locator(".sp-tool-key .sp-primary").isDisabled(), "a tool that needs more than a clip has its key out");
  await chip("Cut out").click();
  await settle();
  ok(await page.locator(".sp-tool-key .sp-primary").isDisabled(), "a cut-out with nobody named has its key out");
  await page.locator('.sp-tool textarea[aria-label="Who, or what, to cut out"]').fill("the green frog");
  await page.locator('.sp-tool textarea[aria-label="Who, or what, to cut out"]').blur();
  await settle();
  ok(!(await page.locator(".sp-tool-key .sp-primary").isDisabled()), "named, it is in");

  // ---- the key asks first and sends once, on the pass looked at
  await chip("Deblur").click();
  await settle();
  await page.locator(".sp-tool-key .sp-primary").click();
  await settle();
  ok(asked.length === 0 && /Yes, spend it/.test(await page.locator(".sp-tool-key .sp-primary").innerText()), "the first press only asks");
  await page.locator(".sp-tool-key .sp-primary", { hasText: "Yes, spend it" }).click();
  await settle(800);
  ok(asked.length === 1 && asked[0].tool === "deblur" && asked[0].size === "draft" && typeof asked[0].video === "string", "the second sends it once, with the tool, the size and the clip it goes on", JSON.stringify(asked[0] ?? {}).slice(0, 160));

  // ---- the window that adds a shot
  await page.locator(".sp-add").click();
  await settle(800);
  ok((await page.locator(".sp-win").count()) === 1 && /first frame/i.test(await page.locator(".sp-win").innerText()), "Add a shot opens the window: a first frame, the words, the seconds, the key");
  ok(await page.locator('.sp-win .sp-primary[data-key="spice:roll"]').isDisabled(), "with no frame and no words the roll key is out");
  await page.keyboard.press("Escape");
  await settle();
  ok((await page.locator(".sp-win").count()) === 0, "Escape closes it");

  // ---- the tour: every step, nothing paid, nothing saved
  await page.locator("#tour-key").click();
  await page.waitForSelector(".tour-card");
  let steps = 0;
  const titles = [];
  for (;;) {
    await settle(450);
    titles.push(await page.locator(".tour-title").textContent());
    steps++;
    const show = page.locator(".tour-show");
    if (await show.isVisible()) {
      await show.click();
      await page.waitForFunction(() => !document.querySelector(".tour-show")?.disabled, null, { timeout: 20000 });
    }
    const next = page.locator(".tour-next");
    if (/Done|Finish|End/i.test((await next.textContent()) ?? "")) break;
    await next.click();
    if (steps > 20) break;
  }
  ok(steps === 10 && /AI VFX suite/.test(titles[0]) && /suite/.test(titles.at(-1)), `the tour has its ten steps (${steps})`, titles.join(" | "));
  await page.keyboard.press("Escape");
  await settle(800);
  ok(asked.length === 1, "the tour sent nothing that spends");
  ok(puts.length === 0, "opening Spice and the tour saved nothing", puts.join(","));
  ok((await stored()) === shipped, "the shipped example is byte for byte as it was");
  ok(errors.length === 0, "no errors on the page", errors.join(" | "));
} finally {
  await browser.close();
  server.kill();
}
console.log(failures ? `${failures} FAILED` : "all passed");
process.exit(failures ? 1 : 0);
