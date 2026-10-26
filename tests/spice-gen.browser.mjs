// Spice's Gen department, the IC-LoRA suite, in a real browser on a fresh install with the flagship example (State Property): the department
// opens with the tools by family and a dot for what a real run of each showed, the tool in use (its fields, the price on its key), a tool
// picked, a restoring tool's example take put back as the pass and shown against the damaged copy it was given, the key that asks first and
// sends once. Comfy Cloud is not reachable here: a request for a run is refused by the browser and counted, so no credit is ever spent.
// Not part of `node --test` (it needs a browser). From the repo root:
//   NODE_PATH=<a node_modules that has playwright> CHROME=<chrome or chromium binary> node tests/spice-gen.browser.mjs
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { tempDir } from "./tools/temp.mjs";

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const root = resolve(import.meta.dirname, "..");
const dataDir = tempDir("gen-data-");
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
  if (await fetch(`${base}/api/spice/ic`).then((r) => r.ok, () => false)) break;
  await new Promise((r) => setTimeout(r, 200));
}
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ["--no-sandbox"] });
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  const page = await context.newPage();
  const errors = [];
  const asked = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !/GL Driver|favicon|Failed to load resource/.test(m.text()) && errors.push(m.text()));
  await context.route((url) => !["127.0.0.1", "localhost"].includes(url.hostname), (route) => route.abort());
  await page.route("**/api/spice/ic", (route) => (route.request().method() === "POST" ? (asked.push(route.request().postDataJSON()), route.abort()) : route.continue()));
  // a key is saved, so the run can be asked for
  await page.route("**/api/account", (route) => (route.request().method() === "GET" ? route.fulfill({ json: { target: { kind: "comfy-cloud", url: "https://cloud.comfy.org" }, key: { set: true, last4: "abcd", source: "env" }, openWeights: false, balance: { credits: 500, usd: 2 } } }) : route.continue()));
  const settle = (ms = 400) => page.waitForTimeout(ms);
  // a tool by its name as it is written ("Deblur" is not "Motion deblur")
  const chip = (name) => page.locator(".sp-gen-chip").filter({ has: page.locator("span", { hasText: new RegExp(`^${name}$`) }) });
  const takeOf = (name) => page.locator(".sp-gen-take").filter({ has: page.locator("b", { hasText: new RegExp(`^${name}$`) }) });

  // opening Spice, and the flagship in it, saves nothing: an example stays as it was shipped (its date is how a newer one replaces it)
  const puts = [];
  page.on("request", (r) => r.method() === "PUT" && r.url().includes("/api/spice-shots/") && puts.push(r.url()));
  await page.goto(`${base}/#/spice`);
  await page.waitForSelector(".sp-layer");
  await settle(900);
  ok((await page.locator(".sp-layer").evaluateAll((l) => l.map((x) => x.dataset.dept))).includes("gen"), "Gen is a department of the stack");
  ok((await page.locator(".sp-shotchip").innerText()).includes("State Property"), "a first visit opens the flagship");
  await page.locator('.sp-layer[data-dept="gen"] .sp-layer-main').click();
  await page.waitForSelector(".sp-dept.is-gen:not([hidden]) .sp-gen-chip");
  await settle(500);
  await settle(900);
  ok(puts.length === 0, "opening Spice, the flagship and Gen's tools saved nothing", puts.join(","));
  const chips = await page.locator(".sp-gen-chip").count();
  ok(chips >= 30, `the suite's tools are listed (${chips})`);
  const families = await page.locator(".sp-gen-family .ut-label").allTextContents();
  ok(["Control", "Restore", "Upscale", "Clean", "Frame", "Camera"].every((f) => families.includes(f)), "by family", families.join(" | "));
  ok((await page.locator(".sp-gen-chip .sp-dot.is-verified").count()) >= 20 && (await page.locator(".sp-gen-chip .sp-dot.is-failed").count()) >= 1, "each with the dot of what a real run showed");
  ok((await page.locator(".sp-gen-name b").innerText()) === "Day to night", "the flagship's tool is the one in use");

  // the tour's "Look at one" on the shipped example puts a take on the viewer and changes nothing: no PUT, the same example on the server
  const stored = async () => (await (await fetch(`${base}/api/spice-shots/spice-example-state-property`)).json()).project;
  const first = await stored();
  await page.locator("#tour-key").click();
  await page.waitForSelector(".tour-card");
  for (let i = 0; i < 30 && !/What each tool made/.test(await page.locator(".tour-title").textContent()); i++) {
    await page.locator(".tour-next").click();
    await settle(350);
  }
  ok(/What each tool made/.test(await page.locator(".tour-title").textContent()), "the tour reaches the Gen takes");
  await page.locator(".tour-show").click();
  await settle(900);
  ok((await page.locator(".sp-gen-take.is-on").count()) === 1, "while it looks, a take is the pass");
  await page.waitForFunction(() => !document.querySelector(".tour-show")?.disabled, null, { timeout: 15000 });
  await settle(900);
  const after = await stored();
  ok(puts.length === 0, "the look saved nothing", puts.join(","));
  ok(after.updatedAt === first.updatedAt && JSON.stringify(after.body.passes.gen) === JSON.stringify(first.body.passes.gen), "the example on the server is as it was shipped", `${first.updatedAt} -> ${after.updatedAt}`);
  ok((await page.locator(".sp-gen-take.is-on").count()) === 0, "and the example's own pass is back (day to dusk, no take of the list)");
  await page.keyboard.press("Escape");
  await settle();

  // a tool picked: its own words and price
  await chip("Deblur").click();
  await settle();
  ok((await page.locator(".sp-gen-name b").innerText()) === "Deblur", "a tool is picked");
  ok((await page.locator('.sp-gen-tool textarea[aria-label="The shot, described"]').count()) === 1, "a card with a fixed grammar asks for the shot once");
  ok(/≈ \d+ cr/.test(await page.locator(".sp-gen-key .sp-primary").innerText()), "the key says what a run costs", (await page.locator(".sp-gen-key .sp-primary").innerText()).replace(/\s+/g, " "));

  // a tool that needs more than a clip is said, and cannot be run
  await chip("Ingredients").click();
  await settle();
  ok(await page.locator(".sp-gen-key .sp-primary").isDisabled(), "a tool that needs a reference sheet has its key out");
  const why = await page.locator(".sp-gen-key .sp-primary").evaluate((e) => e.getAttribute("title") || e.dataset.tooltip || e.getAttribute("aria-label") || "");
  ok(/needs .* not offered yet/.test(why), "and says why", why);

  // an example take of a restoring tool, put back as the pass: shown against the damaged copy it was given
  const take = takeOf("Deblur");
  ok(/on a soft copy/.test(await take.innerText()), "a restoring tool's take says what it was run on");
  await take.locator(".sp-iconkey").first().click();
  await settle(600);
  ok((await takeOf("Deblur").evaluate((e) => e.classList.contains("is-on"))), "put back as the pass");

  // the key asks first and sends once
  await chip("Deblur").click();
  await settle();
  await page.locator(".sp-gen-key .sp-primary").click();
  await settle();
  ok(asked.length === 0 && /Yes, spend it/.test(await page.locator(".sp-gen-key .sp-primary").innerText()), "the first press only asks");
  await page.locator(".sp-gen-key .sp-primary", { hasText: "Yes, spend it" }).click();
  await settle(700);
  ok(asked.length === 1 && asked[0].tool === "deblur" && asked[0].size === "draft" && typeof asked[0].video === "string", "the second sends it once, with the tool, the size and the clip", JSON.stringify(asked[0] ?? {}).slice(0, 200));
  ok(errors.length === 0, "no errors on the page", errors.join(" | "));
} finally {
  await browser.close();
  server.kill();
}
console.log(failures ? `${failures} FAILED` : "all passed");
process.exit(failures ? 1 : 0);
