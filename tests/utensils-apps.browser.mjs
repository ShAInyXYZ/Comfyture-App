// Utensils' mini apps in a real browser, end to end, on a server of its own and a folder of its own: the Library (the workspace whose
// id is "templates") opens on its Mini apps filter, their books alone on its shelves; an app is a panel with only what it needs (a picture well and the words), the price is asked before anything
// is sent (the first press arms the key, no request is made; the second sends one), what it made shows against the picture it was given
// and is kept; a poster on Home's wall of mini apps opens an app; the apps are tools for Truffle (opened by id, listed apart from the shelf's tools).
// Comfy Cloud's paid calls are stood in for (COMFYTURE_FAKE_TEMPLATES=1): nothing is spent. The reads that name the forms and the prices are
// free and real, so this needs a COMFY_API_KEY (in .env or the environment); without one it says so and stops.
// Not part of `node --test` (it needs a browser). From the repo root:
//   NODE_PATH=<a node_modules that has playwright> CHROME=<chrome or chromium binary> node tests/utensils-apps.browser.mjs
// OUT=<folder> keeps screenshots to be looked at.
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const root = resolve(import.meta.dirname, "..");
const env = await readFile(join(root, ".env"), "utf8").catch(() => "");
if (!process.env.COMFY_API_KEY && !/^COMFY_API_KEY=\S+/m.test(env)) {
  console.log("SKIP this needs a COMFY_API_KEY (in .env or the environment): the apps' forms are read from Comfy Cloud, which is free");
  process.exit(0);
}
const out = process.env.OUT ? resolve(process.env.OUT) : await mkdtemp(join(tmpdir(), "utensils-apps-"));
await mkdir(out, { recursive: true });
const dataDir = await mkdtemp(join(tmpdir(), "utensils-data-"));
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
const server = spawn(process.execPath, ["--env-file-if-exists=.env", "server/main.ts"], { cwd: root, env: { ...process.env, PORT: String(port), COMFYTURE_DATA: dataDir, COMFYTURE_FAKE_TEMPLATES: "1" }, stdio: "ignore" });
const base = `http://127.0.0.1:${port}`;
for (let i = 0; i < 100; i++) {
  if (await fetch(`${base}/api/utensils/results`).then((r) => r.ok, () => false)) break;
  await new Promise((r) => setTimeout(r, 200));
}
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ["--no-sandbox"] });
try {
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
  const errors = [];
  const runs = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !/GL Driver|favicon|Failed to load resource/.test(m.text()) && errors.push(m.text()));
  page.on("request", (r) => r.method() === "POST" && /\/templates\/[^/]+\/run$/.test(new URL(r.url()).pathname) && runs.push(new URL(r.url()).pathname));
  const shot = (name) => page.screenshot({ path: join(out, `${name}.png`) });
  await page.goto(`${base}/#/utensils`, { waitUntil: "networkidle" });
  await page.waitForSelector(".hp", { timeout: 30000 });
  await page.waitForTimeout(2500);

  // Home: a wall of six mini-app posters (and no panel); a poster opens that app in the Library
  await page.waitForSelector(".hm-poster", { timeout: 30000 });
  ok((await page.locator(".hm-poster").count()) === 6, "Home hangs six mini apps");
  ok((await page.locator('.ut-quick-tool[data-tool^="app-"]').count()) === 0, "the apps are not among the quick tools");
  await shot("1-home");
  await page.click('.hm-poster[data-app="bg-remove"]');
  await page.waitForSelector(".ut-app-body", { timeout: 30000 });
  ok(/REMOVE BACKGROUND/.test(await page.locator(".ut-tpl-detail .ut-b-label").innerText()), "a poster of Home opens its app in the Library");
  ok(((await page.locator(".lbp-trigger").first().textContent()) ?? "").includes("Mini apps"), "on the Mini apps filter");

  // the Mini apps filter: only their books on the shelves, no page scroll
  await page.waitForSelector(".lb-book[data-app]", { timeout: 30000 });
  const m = await page.evaluate(() => ({ books: document.querySelectorAll(".lb-book").length, apps: document.querySelectorAll(".lb-book[data-app]").length, v: (() => { const f = document.querySelector(".lbx-frame"); return f ? f.scrollHeight - f.clientHeight : document.documentElement.scrollHeight - innerHeight; })(), h: document.documentElement.scrollWidth - innerWidth }));
  ok(m.apps >= 30 && m.books === m.apps, "the Mini apps filter shelves the apps alone", `${m.apps} apps of ${m.books} books`);
  ok(m.v <= 1 && m.h <= 1, "the workspace fills the screen without scroll", `v ${m.v} h ${m.h}`);
  await shot("2-apps");

  // an app is a panel with only what it needs (the panel open is closed first: the hall is where it was)
  await page.click(".ut-tpl-detail .ut-expand");
  await page.click('.lb-book[data-app="edit-words"]');
  await page.waitForSelector(".ut-app-body .ut-tpl-well", { timeout: 30000 });
  ok((await page.locator(".ut-app-form .ut-tpl-field").count()) === 2, "Edit with words asks for two things: a picture and words");
  ok(/more settings/i.test(await page.locator(".ut-tpl-adv summary").innerText()), "the rest is under More settings");
  ok(await page.locator(".ut-tpl-go").isDisabled(), "it cannot run before it has what it needs");
  await shot("3-app");
  await page.evaluate(async () => {
    const blob = await (await fetch("brand/cast/brioche.png")).blob();
    const dt = new DataTransfer();
    dt.items.add(new File([blob], "brioche.png", { type: "image/png" }));
    document.querySelector(".ut-app-body .ut-tpl-well").dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  await page.waitForSelector(".ut-tpl-well img", { timeout: 30000 });
  ok(await page.locator(".ut-tpl-go").isDisabled(), "a picture alone is not enough: the app is run with the person's own words");
  await page.fill(".ut-app-body textarea", "Give the bunny a small red scarf");
  await page.waitForTimeout(300);
  ok(!(await page.locator(".ut-tpl-go").isDisabled()), "the picture and the words make it ready");
  // the price is asked first: the first press sends nothing
  await page.click(".ut-tpl-go");
  await page.waitForTimeout(400);
  ok(/Confirm/.test(await page.locator(".ut-tpl-go").innerText()) && runs.length === 0, "the first press asks for the price and sends nothing", `requests ${runs.length}`);
  await shot("4-armed");
  await page.click(".ut-tpl-go");
  await page.waitForSelector(".ut-app-stage[data-result]", { timeout: 60000 });
  await page.waitForTimeout(500);
  ok(runs.length === 1 && runs[0].includes("image_qwen_image_edit_2509"), "the second press sends the run", runs.join(","));
  ok(await page.locator(".ut-app-stage .ut-compare").count() > 0, "what it made shows against the picture it was given");
  ok(await page.locator(".ut-pill.is-kept").count() > 0, "and is kept");
  ok(await page.evaluate(async () => (await import("/js/utensils.js")).utensils.results.some((r) => String(r.tool).startsWith("app-"))), "Recent keeps it");
  await shot("5-result");

  // the apps are tools for Truffle
  const t = await page.evaluate(async () => {
    const u = await import("/js/utensils.js");
    const a = await import("/js/utensils-assist.js");
    const s = a.summary({ items: new Map(), view: { images: [], clips: [], sounds: [] } });
    const before = u.shelfTools().length;
    u.pickTool("app-bg-remove");
    await new Promise((ok) => setTimeout(ok, 1500));
    return { apps: s.apps.length, inTools: s.tools.filter((x) => x.app).length + s.others.filter((x) => x.app).length, before, shelf: u.shelfTools().length, title: document.querySelector(".ut-tpl-detail .ut-b-label")?.textContent, tool: u.utensils.tool };
  });
  ok(t.apps >= 30 && t.inTools === 0, "Truffle is told the apps apart from the tools", `${t.apps} apps`);
  ok(t.shelf === t.before, "the apps are not counted among the shelf's tools", `${t.shelf}`);
  ok(/REMOVE BACKGROUND/.test(t.title ?? "") && t.tool === "app-bg-remove", "the app Truffle opens is the one in the panel");

  // the server went on reading the apps' forms: the list is read again, and the app whose form cannot take what it asks for (a clip through a
  // loader of a custom node) is gone, while the others know their own inputs
  if (!((await page.locator(".lbp-trigger").first().textContent()) ?? "").includes("Mini apps")) (await page.locator(".lbp-trigger").first().click(), await page.locator(".lbp-row", { hasText: "Mini apps" }).click());
  const gone = await page.waitForFunction(() => !document.querySelector('.lb-book[data-app="live-portrait"]') && document.querySelectorAll(".lb-book[data-app]").length > 20, null, { timeout: 90000 }).then(() => true, () => false);
  ok(gone, "the list refreshes itself: the app that cannot be driven drops out", `${await page.locator(".lb-book[data-app]").count()} books`);

  // the whole Library: every workflow a book, its card says what it is and how it works, a book opens its form
  await page.click(".ut-tpl-detail .ut-expand").catch(() => {});
  await page.locator(".lbp-trigger").first().click();
  await page.locator(".lbp-row", { hasText: "All workflows" }).click();
  await page.waitForTimeout(600);
  const lib = await page.evaluate(() => ({ books: document.querySelectorAll(".lb-book").length, total: String(parseInt(document.querySelector(".lb-title-count")?.textContent ?? "", 10)), v: (() => { const f = document.querySelector(".lbx-frame"); return f ? f.scrollHeight - f.clientHeight : document.documentElement.scrollHeight - innerHeight; })(), h: document.documentElement.scrollWidth - innerWidth }));
  ok(lib.books > 600 && String(lib.books) === lib.total, "every workflow is a book, and the Library's title counts them", `${lib.books} books, tile ${lib.total}`);
  ok(lib.v <= 1 && lib.h <= 1, "the hall walks sideways: the page does not scroll", `v ${lib.v} h ${lib.h}`);
  await page.locator('.lb-book[data-workflow="image_z_image_turbo"]').hover();
  await page.waitForTimeout(500);
  const card = await page.evaluate(() => ({ on: document.querySelector(".lb-card")?.classList.contains("is-on"), what: !!document.querySelector(".lb-card .lb-what")?.textContent, how: !!document.querySelector(".lb-card .lb-how")?.textContent }));
  ok(card.on && card.what && card.how, "a book pointed at opens its card: what it does and how it works");
  await shot("6-library");

  ok(errors.length === 0, "no errors in the page", errors.slice(0, 3).join(" | "));
} finally {
  await browser.close();
  server.kill();
}
console.log(failures ? `\n${failures} FAILED (screenshots in ${out})` : `\nall passed (screenshots in ${out})`);
process.exit(failures ? 1 : 0);
