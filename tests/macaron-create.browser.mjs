// Macaron's Create workspace in a real browser, end to end, on a server of its own and a folder of its own: the workspace fills
// the screen at its height and its families lead in turn; a format with no layout is made from a dimmed preview; the starters
// make a design in the format of their family and the editor lets it be seen in the others; an A4 leaves as 2480 x 3508 and a
// banner as 728 x 90; the mockup window places a design in a scene (the preview is drawn at the page, a picture is only asked
// for on the second press, with the price said first) and the picture is kept as a mockup; Brioche's answer in Create adds
// a banner and opens the mockup window, and leaves another workspace's action and a scene the app does not have alone.
// Comfy Router is stood in for by tests/macaron-fake-router.mjs: no credits are spent.
// Not part of `node --test` (it needs a browser). From the repo root:
//   NODE_PATH=<a node_modules that has playwright> CHROME=<chrome or chromium binary> node tests/macaron-create.browser.mjs
// OUT=<folder> keeps screenshots to be looked at.
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const root = resolve(import.meta.dirname, "..");
const out = process.env.OUT ? resolve(process.env.OUT) : await mkdtemp(join(tmpdir(), "macaron-create-"));
await mkdir(out, { recursive: true });
const dataDir = await mkdtemp(join(tmpdir(), "macaron-data-"));
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
const fakeRouter = pathToFileURL(join(root, "tests/macaron-fake-router.mjs")).href;
const server = spawn(process.execPath, ["server/main.ts"], { cwd: root, env: { ...process.env, PORT: String(port), COMFYTURE_DATA: dataDir, COMFY_API_KEY: "test-key", COMFY_BASE_URL: "http://127.0.0.1:9", NODE_OPTIONS: `--import=${fakeRouter}`, MACARON_FAKE_LOG: join(dataDir, "writer-requests.jsonl") }, stdio: "ignore" });
const base = `http://127.0.0.1:${port}`;
for (let i = 0; i < 100; i++) {
  if (await fetch(`${base}/api/brands`).then((r) => r.ok, () => false)) break;
  await new Promise((r) => setTimeout(r, 200));
}
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ["--no-sandbox"] });
try {
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !/GL Driver|favicon|Failed to load resource/.test(m.text()) && errors.push(m.text()));
  await page.addInitScript(() => localStorage.setItem("comfyture.macaron.space", "create"));
  await page.goto(`${base}/#/macaron`, { waitUntil: "networkidle" });
  await page.waitForSelector(".mc-side .mcb-card", { timeout: 30000 });
  await page.waitForSelector(".mc-grid.is-create .mc-bento", { timeout: 30000 });
  await page.waitForTimeout(2000);
  const store = (fn, arg) => page.evaluate(async ({ src, arg }) => { const m = await import("/js/macaron.js"); return new Function("m", "arg", `return (${src})(m, arg)`)(m, arg); }, { src: fn.toString(), arg });
  const shot = (name) => page.screenshot({ path: join(out, `${name}.png`) });
  const closeAll = async () => { for (let i = 0; i < 4 && (await page.locator(".mc-win").count()); i++) { await page.keyboard.press("Escape"); await page.waitForTimeout(250); } };
  const familyBar = () => page.locator(".mc-fambar .mc-seg").evaluateAll((els) => els.map((e) => [e.dataset.family, e.getAttribute("aria-pressed")]));
  // (the brand as the page holds it: what is kept on the server follows a moment later)
  const brandBody = () => store((m) => JSON.parse(JSON.stringify(m.macaron.brand.body)));

  // ---- the workspace: five workspaces, the one of Create fills the height, and the families lead in turn
  const ws = await page.locator(".mcb-card").evaluateAll((els) => els.map((e) => e.dataset.space));
  ok(ws.join() === "kit,idea,studio,create,book" && (await page.locator('.mcb-card[data-space="create"]').getAttribute("aria-pressed")) === "true", "Create is the fourth of five workspaces and is the one open");
  ok((await page.locator(".mc-tool").count()) === 0 && (await page.locator(".mcb-health .mcb-line").count()) > 0, "no canned tools under the workspaces: the brand's health instead");
  await shot("create-social");
  let m = await page.evaluate(() => { const g = document.querySelector(".mc-grid.is-create").getBoundingClientRect(); const bar = document.getElementById("assistant")?.getBoundingClientRect(); return { doc: document.documentElement.scrollHeight, vh: innerHeight, gridBottom: g.bottom, barTop: bar?.top ?? 0, bentos: [...document.querySelectorAll(".mc-grid.is-create > .mc-bento")].map((b) => b.className.replace(/mc-bento|\s+/g, " ").trim()), cols: [...document.querySelectorAll(".mc-grid.is-create > .mc-bento")].map((b) => Math.round(b.getBoundingClientRect().width)) }; });
  ok(m.doc <= m.vh + 1 && m.gridBottom <= m.barTop + 2, "the grid fills the screen at 1600 x 1000: no scroll, and it ends above Brioche's bar", JSON.stringify([m.doc, m.vh, Math.round(m.gridBottom), Math.round(m.barTop)]));
  ok(m.bentos.length === 8 && m.bentos[0].includes("is-mock") && m.bentos[0].includes("is-lead") && m.cols[0] > m.cols[1], "eight bentos, mockups leading by default", m.bentos.join(" | "));
  ok((await familyBar()).map((x) => x.join(":")).join() === "social:true,ads:false,print:false,web:false,app:false,video:false", "the family bar: Social, Ads, Print, Web, App, Video; Social lit");
  ok((await page.locator(".mc-fi").count()) >= 10 && (await page.locator(".mc-fi canvas").count()) >= 10, "the bentos show the brand's real designs, drawn by the app's renderer");
  ok((await page.locator(".mc-fi.is-ghost").count()) > 0 && (await page.locator(".mc-fi.is-ghost canvas").count()) > 0, "a format with no layout of its own is shown dimmed, as it would lay out");
  for (const f of ["ads", "print", "web", "app", "video"]) {
    await page.locator(`.mc-seg[data-family="${f}"]`).click();
    await page.waitForTimeout(500);
    const lead = await page.evaluate(() => { const l = document.querySelector(".mc-grid.is-create > .is-lead"); const o = document.querySelector(".mc-grid.is-create > .is-r1"); return { cls: l.className, w: l.getBoundingClientRect().width, h: l.getBoundingClientRect().height, rw: o.getBoundingClientRect().width, grid: document.querySelector(".mc-grid.is-create").dataset.family }; });
    const id = { ads: "is-ads", print: "is-print", web: "is-web", app: "is-app", video: "is-vid" }[f];
    ok(lead.cls.includes(id) && lead.grid === f && lead.w > lead.rw && lead.h > 300, `${f} leads: it takes the big place`, `${Math.round(lead.w)} x ${Math.round(lead.h)}`);
    await shot(`create-${f}`);
  }
  await page.locator('.mc-seg[data-family="social"]').click();
  await page.waitForTimeout(400);

  // ---- a banner from a dimmed preview: the design is laid out for it, and the editor shows the family
  await page.locator('.mc-seg[data-family="ads"]').click();
  await page.waitForTimeout(400);
    await page.locator('.mc-fi.is-ghost[data-format="ad-728x90"]').first().click();
  await page.waitForSelector(".mc-win.is-full .mc-segs", { timeout: 10000 });
  await page.waitForTimeout(1200);
  let ed = await page.evaluate(async () => { const m = await import("/js/macaron.js"); const d = m.designNow(); return { format: m.macaron.format, own: Object.keys(d.formats), segs: [...document.querySelectorAll('.mc-win [aria-label="Format"] .mc-seg')].map((s) => [s.textContent.trim(), s.getAttribute("aria-pressed")]), layers: m.layoutNow().layers.filter((l) => !l.hidden).map((l) => l.id) }; });
  ok(ed.format === "ad-728x90" && ed.own.includes("ad-728x90") && ed.segs.some(([t, p]) => /728/.test(t) && p === "true") && ed.segs.length === 4, "the banner is laid out and opened: the editor shows the family's formats, 728 x 90 lit", JSON.stringify(ed.segs));
  ok(ed.layers.join() === "wordmark,headline", "the strip keeps the logo and the headline, and leaves the badge and the mascot out", ed.layers.join());
  await shot("create-editor-banner");
  const noise = await page.evaluate(() => document.querySelector(".mc-win .mc-win-body").scrollWidth - document.querySelector(".mc-win .mc-win-body").clientWidth);
  ok(noise <= 2, "no horizontal overflow in the editor");
  // another family's format is added from the menu
  await page.locator('.mc-win .sel-trigger[aria-label="Add a format"]').click();
  await page.waitForTimeout(300);
  // (the menu lists the families; one opens when its name is tapped)
  await page.locator(".sel-group").filter({ hasText: "Print" }).first().click();
  await page.waitForTimeout(300);
  await page.locator('[role="listbox"] [role="option"]').filter({ hasText: "A4 flyer" }).first().click();
  await page.waitForTimeout(900);
  ok((await store((mm) => mm.macaron.format)) === "a4", "a format of another family is added from the menu, and opened");
  // the exported PNG of an A4 is 2480 x 3508, a banner's is 728 x 90
  await store(async (mm) => { await mm.exportPng(mm.macaron.design, "a4", { download: false }); await mm.exportPng(mm.macaron.design, "ad-728x90", { download: false }); });
  const ex = (await brandBody()).exports;
  const sizeOf = (f) => ex.find((x) => x.format === f);
  ok(sizeOf("a4")?.width === 2480 && sizeOf("a4")?.height === 3508, "an A4 leaves as 2480 x 3508", JSON.stringify([sizeOf("a4")?.width, sizeOf("a4")?.height]));
  ok(sizeOf("ad-728x90")?.width === 728 && sizeOf("ad-728x90")?.height === 90, "a leaderboard leaves as 728 x 90", JSON.stringify([sizeOf("ad-728x90")?.width, sizeOf("ad-728x90")?.height]));
  await closeAll();

  // ---- the starters: a design from the kit in a format of the family, opened in the editor
  await page.locator(".mc-fambar .mc-primary").click();
  await page.waitForSelector(".mc-st", { timeout: 5000 });
  ok((await page.locator(".mc-st").count()) === 13, "the starters window offers thirteen starters in six families");
  await shot("create-starters");
  const before = (await brandBody()).designs.length;
  await page.locator('.mc-st[data-starter="flyer"]').click();
  await page.waitForSelector(".mc-win.is-full .mc-segs", { timeout: 10000 });
  await page.waitForTimeout(900);
  const flyer = await store((mm) => { const d = mm.designNow(); return { n: mm.macaron.brand.body.designs.length, format: d.format, layout: d.layout, ctas: d.layers.filter((l) => l.role === "cta").length, bad: mm.guardOf(d, d.format).filter((g) => g.level === "bad").length }; });
  ok(flyer.n === before + 1 && flyer.format === "a4" && flyer.layout === "left" && flyer.ctas === 1 && flyer.bad === 0, "a flyer starts as an A4 from the kit, with a call to action and nothing the guard calls bad", JSON.stringify(flyer));
  await closeAll();
  await page.locator(".mc-fambar .mc-primary").click();
  await page.waitForSelector(".mc-st");
  await page.locator('.mc-st[data-starter="leaderboard"]').click();
  await page.waitForSelector(".mc-win.is-full .mc-segs", { timeout: 10000 });
  await page.waitForTimeout(900);
  const board = await store((mm) => { const d = mm.designNow(); const lay = mm.layoutNow().layers.filter((l) => !l.hidden).map((l) => l.id); return { format: d.format, lay }; });
  ok(board.format === "ad-728x90" && board.lay.includes("cta") && board.lay.includes("headline"), "a leaderboard starts as a strip: logo, headline, call to action", board.lay.join());
  await closeAll();
  ok((await page.locator('.mc-fi[data-format="ad-728x90"]:not(.is-ghost):not(.is-hollow)').count()) >= 1, "and the Ads bento shows it as a design of its own now");

  // ---- the mockup window: the preview is drawn here, a picture is paid for on the second press
  await page.locator('.mc-seg[data-family="social"]').click();
  await page.waitForTimeout(300);
  await page.locator(".mc-b-head .mc-primary.is-sm").click();
  await page.waitForSelector(".mc-scn", { timeout: 5000 });
  await page.waitForTimeout(1500);
  ok((await page.locator(".mc-scn").count()) === 12 && (await page.locator(".mc-scene-group").count()) === 3, "twelve scenes in three groups: print, packaging, digital");
  await page.locator('.mc-scn[data-scene="phone-hand"]').click();
  await page.waitForTimeout(900);
  const px = await page.evaluate(() => { const c = document.querySelector(".mc-mcanvas"); const x = c.getContext("2d"); const w = c.width, h = c.height; const at = (u, v) => [...x.getImageData(Math.round(u * w), Math.round(v * h), 1, 1).data].slice(0, 3); return { screen: at(0.5, 0.45), outside: at(0.15, 0.2), w, h }; });
  ok(Math.abs(px.screen[0] - 255) + Math.abs(px.screen[1] - 255) > 60, "the design is drawn on the phone's screen in the preview (the blank white is gone)", JSON.stringify(px.screen));
  await shot("create-mockup");
  const assets0 = (await brandBody()).assets.length;
  await page.locator(".mc-win-foot .mc-primary").click();
  await page.waitForTimeout(500);
  const armed = await page.evaluate(() => ({ label: document.querySelector(".mc-win-foot .mc-primary").textContent, cost: document.querySelector(".mc-win-foot .mc-cost").textContent }));
  ok(/Yes, place it/.test(armed.label) && /cr/.test(armed.label) && /spends credits/.test(armed.cost) && (await brandBody()).assets.length === assets0, "the first press asks and says the price; nothing is made yet", JSON.stringify(armed));
  await page.locator(".mc-win-foot .mc-primary").click();
  for (let i = 0; i < 100 && !(await store((mm) => mm.macaron.brand.body.mockups.length >= 1 && !mm.macaron.busy.has("mockup"))); i++) await page.waitForTimeout(300);
  await page.waitForTimeout(400);
  const made = await brandBody();
  const k = made.mockups[0];
  const asset = made.assets.find((a) => a.id === k?.asset);
  ok(made.assets.length === assets0 + 1 && k.scene === "phone-hand" && asset?.kind === "mockup" && asset.credits !== undefined, "the second press asks the model: a picture is kept as a mockup, with what it cost", JSON.stringify([k?.scene, asset?.kind, asset?.credits]));
  await closeAll();
  ok((await page.locator(".mc-mkgrid .mc-mk:not(.is-scene)").count()) === 1, "the Mockups bento shows the picture that was made");
  await shot("create-mockups-bento");

  // ---- Brioche in Create: a banner and a mockup to look at; another workspace's action and a scene the app does not have are left alone
  const typeIn = async (text) => {
    const n0 = await store((mm) => mm.macaron.chat.messages.length);
    await page.locator("#assistant .pill-field, #assistant .chat-input").first().click();
    await page.keyboard.type(text);
    await page.keyboard.press("Enter");
    await page.waitForFunction(async (n) => { const mm = await import("/js/macaron.js"); return mm.macaron.chat.messages.length >= n + 2 && !mm.macaron.chat.busy; }, n0, { timeout: 20000 });
  };
  const writerLog = async () => (await readFile(join(dataDir, "writer-requests.jsonl"), "utf8").catch(() => "")).trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const pitch0 = (await brandBody()).brief.pitch;
  const designs1 = (await brandBody()).designs.length;
  await typeIn("A leaderboard for the sale, and show me the poster on a wall.");
  const req = (await writerLog()).at(-1);
  const opsIn = req.tools[0].input_schema.properties.actions.items.properties.op.enum;
  ok(/THE OPEN WORKSPACE: Create/.test(req.system) && opsIn.includes("propose_mockup") && opsIn.includes("add_design") && !opsIn.includes("write_brief") && /WORKSPACE OPEN: Create/.test(req.prompt), "through the server in Create: the model is given Create's tool and brief");
  // (the design open is the leaderboard just made: an ad, so it is the ads' formats she is told)
  ok(/FORMATS OF ITS FAMILY \(ads\): ad-300x250 Medium rectangle 300x250px.*ad-728x90 Leaderboard 728x90px \(has its layout\)/.test(req.prompt) && /safe x 0\.02-0\.98 y 0\.1-0\.9/.test(req.prompt) && /MOCKUPS MADE: phone-hand of /.test(req.prompt) && /RECENT ASSETS/.test(req.prompt) && req.prompt.length < 9000, "what she is told: the family's formats with their safe zones, the mockups made, the recent assets, kept short", String(req.prompt.length));
  await page.waitForTimeout(800);
  const after = await store((mm) => ({ designs: mm.macaron.brand.body.designs.length, format: mm.designNow()?.format, win: mm.macaron.win, mockup: mm.macaron.mockup, pitch: mm.macaron.brand.body.brief.pitch }));
  ok(after.designs === designs1 + 1 && after.format === "ad-728x90", "the banner she proposed is made, in the family's format");
  ok(after.win === "mockup" && after.mockup?.scene === "poster-wall", "the mockup window is open on the scene she named, and spent nothing", JSON.stringify(after.mockup));
  ok(after.pitch === pitch0, "the brief, another workspace's action, is left alone");
  ok((await brandBody()).mockups.length === 1, "no picture was made by her: a mockup is proposed, not paid for");
  await shot("create-brioche");

  ok(errors.length === 0, "no errors in the console", errors.slice(0, 3).join(" | "));
} finally {
  await browser.close();
  server.kill();
}
console.log(failures ? `${failures} FAILED` : "all passed");
process.exit(failures ? 1 : 0);
