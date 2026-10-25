// The Oven (the shared picture-making window) in a real browser, on a server and a folder of its own. What would spend credits is stood in
// for (the image call answers with jobs that this test then moves by hand through the live events), and every call to Comfy's hosts is refused.
// It checks: the window's name, that a picture's progress does not draw the window again (only its percent changes), that the caret goes
// where you click and a drag selects (idle, and while a picture is coming), that the grid, the tabs and the compare view fill in when
// pictures finish, and what the models cost (the rail, the Generate key, the Spent list, the picture's tag).
// Not part of `node --test` (it needs a browser). From the repo root:
//   PLAYWRIGHT_MODULE=<playwright's folder> node tests/oven.browser.mjs        (OUT=<folder> keeps screenshots)
import { spawn } from "node:child_process";
import { mkdtemp, mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { deflateSync, crc32 } from "node:zlib";
import { tempDir } from "./tools/temp.mjs";

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const root = process.env.ROOT ? resolve(process.env.ROOT) : resolve(import.meta.dirname, "..");
const out = process.env.OUT ? resolve(process.env.OUT) : null;
if (out) await mkdir(out, { recursive: true });
const dataDir = tempDir("oven-data-");
let failures = 0;
const ok = (cond, msg, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${msg}${extra ? `  ${extra}` : ""}`);
  if (!cond) failures++;
};

function png([r, g, b], size = 16) {
  const chunk = (type, data) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, "latin1");
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "latin1"), data])), 0);
    return Buffer.concat([head, data, tail]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: size }, () => [r, g, b]).flat())]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.concat(Array.from({ length: size }, () => row)))), chunk("IEND", Buffer.alloc(0))]);
}

const port = await new Promise((done) => {
  const s = createServer().listen(0, () => {
    const { port } = s.address();
    s.close(() => done(port));
  });
});
const guard = `data:text/javascript,${encodeURIComponent('const real = globalThis.fetch; globalThis.fetch = (input, init) => { const url = typeof input === "string" ? input : input?.url ?? String(input); if (/comfy\\.org/.test(url)) throw new Error("blocked outbound call: " + url); return real(input, init); };')}`;
const server = spawn(process.execPath, ["server/main.ts"], { cwd: root, env: { ...process.env, PORT: String(port), COMFYTURE_DATA: dataDir, COMFY_API_KEY: "test-key", COMFY_BASE_URL: "http://127.0.0.1:9", NODE_OPTIONS: `--import=${guard}` }, stdio: "ignore" });
const base = `http://127.0.0.1:${port}`;
for (let i = 0; i < 100; i++) {
  if (await fetch(`${base}/api/image/models`).then((r) => r.ok, () => false)) break;
  await new Promise((r) => setTimeout(r, 200));
}

const browser = await chromium.launch({ args: ["--no-sandbox"] });
try {
  const context = await browser.newContext({ viewport: { width: 1500, height: 1150 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !/GL Driver|favicon|Failed to load resource|WebGL/.test(m.text()) && errors.push(m.text()));
  await context.route((url) => !["127.0.0.1", "localhost"].includes(url.hostname), (route) => route.abort());
  // the live events, kept so the test can send paint events by hand
  await page.addInitScript(() => {
    const Real = window.EventSource;
    window.__es = {};
    window.EventSource = class extends Real {
      addEventListener(name, fn, o) {
        (window.__es[name] ??= []).push(fn);
        return super.addEventListener(name, fn, o);
      }
    };
    window.__paint = (job) => (window.__es.paint ?? []).forEach((f) => f({ data: JSON.stringify(job) }));
  });
  // the image call, stood in for: jobs that stay running until the test moves them
  const asked = [];
  let nextJob = 1;
  await page.route("**/api/image", (route) => {
    const body = route.request().postDataJSON();
    asked.push(body);
    return route.fulfill({ status: 202, json: Array.from({ length: body.count ?? 1 }, () => ({ id: `job-${nextJob++}`, status: "running", progress: 0 })) });
  });

  const js = (fn, arg) => page.evaluate(fn, arg);
  const shot = async (name) => out && (await page.screenshot({ path: join(out, `${name}.png`) }));
  const settle = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 60)))));
  const upload = (name, color) => page.evaluate(async ([n, bytes]) => (await fetch(`api/photos?name=${n}`, { method: "POST", headers: { "Content-Type": "image/png" }, body: new Uint8Array(bytes) })).json(), [name, [...png(color)]]);
  let photo, photo2;
  const done = (id, p) => js(([i, ph]) => window.__paint({ id: i, status: "done", progress: 1, photo: { file: ph.file, url: `/media/photos/${ph.file}`, width: ph.width, height: ph.height } }), [id, p]);
  const progress = (id, p) => js(([i, v]) => window.__paint({ id: i, status: "running", progress: v }), [id, p]);

  await page.goto(`${base}/#/toaster`);
  await page.waitForFunction(() => document.querySelector(".products"), null, { timeout: 20000 });
  photo = await upload("oven%20test", [200, 120, 60]);
  photo2 = await upload("oven%20test%202", [60, 120, 200]);
  await page.evaluate(async () => {
    const { openImage } = await import("/js/store.js");
    await openImage();
  });
  await page.waitForSelector("#image:not([hidden]) .img-window .img-rail", { timeout: 10000 });

  // ---------------------------------------------------------------- the name
  ok((await page.locator(".img-title").textContent()).trim() === "Oven" && (await page.locator(".img-window").getAttribute("aria-label")) === "Oven", "the window is called the Oven");

  // ---------------------------------------------------------------- the cost, before anything is made
  ok((await page.locator(".img-price").innerText()) === "Comfy Cloud GPU time" && (await page.locator(".img-go-cost").textContent()) === "GPU time", "an open-weights model shows Comfy Cloud GPU time, on the rail and on the key", await page.locator(".img-price").innerText());
  const router = await js(async () => {
    const m = (await import("/js/store.js")).state.image.catalogue.models.find((x) => x.router);
    return m && { id: m.id, credits: m.credits };
  });
  ok(!!router && router.credits > 0, "the catalogue lists a router model with credits", JSON.stringify(router));
  await js(async (id) => (await import("/js/store.js")).setImage({ model: id, count: 2 }), router.id);
  await settle();
  ok((await page.locator(".img-price").innerText()) === `≈ ${router.credits} cr a picture` && (await page.locator(".img-go-cost").textContent()) === `≈ ${router.credits * 2} cr`, "a router model shows its credits a picture, and the key shows count times that", `${await page.locator(".img-price").innerText()} | ${await page.locator(".img-go-cost").textContent()}`);
  await js(async () => (await import("/js/store.js")).setImage({ model: "qwen-2.1", count: 1 }));
  await settle();
  await shot("oven-1-idle");

  // ---------------------------------------------------------------- the caret, idle
  const field = page.locator(".img-window .pill-field");
  await field.click();
  await page.keyboard.type("a red fox in the snow at dawn");
  const at = (offset) => page.locator(".img-window .pill-field").evaluate((el, o) => {
    const r = document.createRange();
    r.setStart(el.firstChild, o);
    r.collapse(true);
    const b = r.getBoundingClientRect();
    return { x: b.left, y: b.top + b.height / 2 };
  }, offset);
  const value = () => js(async () => (await import("/js/store.js")).state.image.prompt);
  const clickAt = async (offset) => {
    const p = await at(offset);
    await page.mouse.click(p.x, p.y);
  };
  await clickAt(8); // between "fo" and "x"
  await page.keyboard.type("Z");
  ok((await value()) === "a red foZx in the snow at dawn", "idle: a click puts the caret where it landed", await value());
  await page.keyboard.press("Backspace");
  await clickAt(10); // before "in"
  await page.keyboard.type("big ");
  ok((await value()) === "a red fox big in the snow at dawn", "idle: a second click, between two words, lands there too", await value());
  const sel = async (from, to) => {
    const a = await at(from);
    const b = await at(to);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move((a.x + b.x) / 2, b.y, { steps: 4 });
    await page.mouse.move(b.x, b.y, { steps: 4 });
    await page.mouse.up();
    await settle();
    return js(() => getSelection().toString());
  };
  ok((await sel(2, 5)) === "red", "idle: a drag selects the words it crosses");
  await page.keyboard.type("blue");
  ok((await value()) === "a blue fox big in the snow at dawn", "and typing replaces the selection", await value());

  // ---------------------------------------------------------------- a picture is coming: the window is not drawn again
  await page.locator(".img-go").click();
  await page.waitForSelector('.img-wait[data-job="job-1"]', { timeout: 5000 });
  ok(asked.length === 1 && asked[0].prompt === "a blue fox big in the snow at dawn", "Generate asks for the picture with the words as typed");
  ok((await page.locator(".spent-row").count()) === 2 && /GPU/.test(await page.locator(".spent-row .spent-cost").first().innerText()), "the Spent list holds the picture and a total", await page.locator(".spent-row").allInnerTexts().then((t) => t.join(" / ")));
  await js(() => (window.__root = document.querySelector(".img-window")));
  await progress("job-1", 0.3);
  await settle();
  ok(await js(() => document.querySelector(".img-window") === window.__root), "a progress event does not draw the window again");
  ok((await page.locator('[data-job="job-1"] .img-pct').innerText()) === "30%", "but the percent changes in place", await page.locator('[data-job="job-1"] .img-pct').innerText());
  await progress("job-1", 0.7);
  await settle();
  ok((await page.locator('[data-job="job-1"] .img-pct').innerText()) === "70%" && (await js(() => document.querySelector(".img-window") === window.__root)), "and again");

  // ---------------------------------------------------------------- the caret, while it is coming
  await js(() => {
    let v = 0.7;
    window.__tick = setInterval(() => window.__paint({ id: "job-1", status: "running", progress: (v = Math.min(0.99, v + 0.002)) }), 40);
  });
  await clickAt(9);
  await page.keyboard.type("Q");
  ok((await value()) === "a blue foQx big in the snow at dawn", "coming: a click puts the caret where it landed", await value());
  await page.keyboard.press("Backspace");
  ok((await sel(2, 6)) === "blue", "coming: a drag selects the word");
  await page.keyboard.type("green");
  ok((await value()) === "a green fox big in the snow at dawn", "coming: and typing replaces the selection", await value());
  {
    const a = await at(2);
    const b = await at(7);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.waitForTimeout(900);
    await page.mouse.move(b.x, b.y, { steps: 10 });
    await page.waitForTimeout(300);
    await page.mouse.up();
    await settle();
    ok((await js(() => getSelection().toString())) === "green", "coming: a slow drag keeps its selection", await js(() => getSelection().toString()));
  }
  await js(() => clearInterval(window.__tick));

  // ---------------------------------------------------------------- finishing: the tabs, the grid and the compare view follow
  await done("job-1", photo);
  await settle();
  ok((await page.locator(".img-shown").count()) === 1, "the finished picture is shown");
  ok((await page.locator(".spent-row .spent-cost").first().innerText()).startsWith("GPU · "), "its seconds are in the Spent list", await page.locator(".spent-row .spent-cost").first().innerText());
  ok((await page.locator(".img-actions .img-cost").innerText()).startsWith("GPU"), "and its cost is a tag next to its actions", await page.locator(".img-actions .img-cost").innerText());
  await js(async () => (await import("/js/store.js")).setImage({ count: 2 }));
  await page.locator(".img-go").click();
  await page.waitForSelector('.img-wait[data-job="job-3"]', { timeout: 5000 }).catch(() => {});
  ok((await page.locator(".notch-tab").count()) === 3 && (await page.locator(".notch-tab.is-running").count()) === 2, "three pictures: three tabs, two still coming");
  await progress("job-2", 0.5);
  await done("job-2", photo2);
  await done("job-3", photo);
  await settle();
  ok((await page.locator(".notch-tab.is-done").count()) === 3, "the tabs turn done when the pictures finish");
  await page.locator('.notch-key[aria-label="Show all pictures"]').click();
  await settle();
  ok((await page.locator(".grid-cell img").count()) === 3, "the grid shows every finished picture");
  await shot("oven-2-grid");
  await page.locator('.notch-key[aria-label="Show one picture"]').click();
  await page.locator('.notch-key[aria-label="Compare two pictures"]').click();
  await settle();
  ok((await page.locator(".img-compare").count()) === 1, "and the compare view holds two finished pictures");
  await page.locator('.notch-key[aria-label="Stop comparing"]').click();
  await settle();
  ok((await page.locator(".spent-row").count()) === 4 && /GPU/.test(await page.locator(".spent-row.is-total .spent-cost").innerText()), "Spent lists the three pictures and the total", await page.locator(".spent-row.is-total .spent-cost").innerText());

  // a router picture keeps its credits
  await js(async (id) => (await import("/js/store.js")).setImage({ model: id, count: 1 }), router.id);
  await page.locator(".img-go").click();
  await page.waitForSelector('.img-wait[data-job="job-4"]', { timeout: 5000 });
  await done("job-4", photo);
  await settle();
  ok((await page.locator(".img-actions .img-cost").innerText()) === `${router.credits} cr` && /cr/.test(await page.locator(".spent-row.is-total .spent-cost").innerText()), "a router picture is priced in credits, in its tag and in the total", `${await page.locator(".img-actions .img-cost").innerText()} | ${await page.locator(".spent-row.is-total .spent-cost").innerText()}`);
  ok((await page.locator(".img-send").getAttribute("data-tooltip")) === "Send it to a part's sheet or the render's references", "on Toaster the Send key says where it sends", await page.locator(".img-send").getAttribute("data-tooltip"));
  await shot("oven-3-spent");

  ok(errors.length === 0, "no error on the page", errors.join(" | "));
} finally {
  await browser.close();
  server.kill();
}
console.log(failures ? `${failures} failed` : "all passed");
process.exit(failures ? 1 : 0);
