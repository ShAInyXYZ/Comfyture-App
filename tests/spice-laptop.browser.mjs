// Spice's departments on a laptop: at six screen sizes, from 1366×768 to 2560×1440, the six departments of a clip (the great jam chase, the
// first example) and of a picture (Paprika's portal), on a fresh install. Every card (the panel, the viewer, each bento) holds all it has: it
// scrolls by no more than a pixel, and nothing in it (a key, a line, a field) is cut by a box of its own card; the page itself never
// scrolls. A department taller than its area scrolls the area, not the cards (web/css/sp-depts.css). Lists that are meant to scroll when
// they are long (the library, the ledger, the layers, the subjects) and the frames that show part of a picture on purpose are not counted.
// A pass with a long note (what Paint says it took out) is looked at too: its card keeps its keys. Nothing is spent: no key, no render address.
// Not part of `node --test` (it needs a browser). From the repo root:
//   NODE_PATH=<a node_modules that has playwright> CHROME=<chrome or chromium binary> node tests/spice-laptop.browser.mjs
// OUT=<folder> keeps a screenshot of every view that fails.
import { spawn } from "node:child_process";
import { mkdtemp, mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const root = resolve(import.meta.dirname, "..");
const out = process.env.OUT ? resolve(process.env.OUT) : null;
if (out) await mkdir(out, { recursive: true });
const dataDir = await mkdtemp(join(tmpdir(), "spice-laptop-"));
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
// no key and a dead render address: nothing can be spent
const server = spawn(process.execPath, ["server/main.ts"], { cwd: root, env: { ...process.env, PORT: String(port), COMFYTURE_DATA: dataDir, COMFY_API_KEY: "", COMFY_BASE_URL: "http://127.0.0.1:9" }, stdio: "ignore" });
const base = `http://127.0.0.1:${port}`;
for (let i = 0; i < 150; i++) {
  if (await fetch(`${base}/api/spice-shots`).then((r) => r.ok, () => false)) break;
  await new Promise((r) => setTimeout(r, 200));
}

const SIZES = [[1366, 768], [1440, 900], [1536, 864], [1600, 950], [1920, 1080], [2560, 1440]];
const DEPTS = ["plate", "roto", "paint", "light", "fx", "comp"];
const SHOTS = { clip: "spice-example-jam-chase", picture: "spice-example-paprika" };

/** In the page: what each card of the open department holds, and what is cut. */
function measure() {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width >= 1 && r.height >= 1 && cs.visibility !== "hidden" && cs.display !== "none";
  };
  const name = (el) => (typeof el.className === "string" && el.className.trim() ? `.${el.className.trim().split(/\s+/).slice(0, 2).join(".")}` : el.tagName.toLowerCase());
  // (lists that scroll when long, and the frames that show a part of a picture on purpose)
  const LISTS = ".sp-lib-grid, .sp-ledger-list, .sp-fxls, .sp-subject-list, .sp-tiles";
  const FRAMES = ".sp-thumb, .sp-tile-pic, .sp-lib-art, .sp-out-art, .sp-stage, .sp-stage-host, .sp-plane, .sp-ruby, .sp-edge-zoom, .sp-subject-pic, .sp-place-frame, .sp-fxl-pic, .sp-cutout, .sp-track-strip, .sp-when-strip, .sp-strip, .sp-curve, .sp-dial";
  const cut = (card) => {
    const found = [];
    for (const el of card.querySelectorAll("*")) {
      if (!visible(el) || el.closest(FRAMES) || el.closest(LISTS)) continue;
      const position = getComputedStyle(el).position;
      if (position === "absolute" || position === "fixed") continue;
      if (!(el.matches("button, input, textarea, select, a, svg, b, em, p, label, .ut-label") || [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))) continue;
      const r = el.getBoundingClientRect();
      for (let p = el.parentElement; p; p = p.parentElement) {
        if (getComputedStyle(p).overflowY !== "visible" && r.bottom - p.getBoundingClientRect().bottom > 1) found.push(`${name(el)} by ${name(p)}`);
        if (p === card) break;
      }
    }
    return found;
  };
  const dept = document.querySelector(".sp-dept:not([hidden])");
  const cards = [document.querySelector(".sp-side"), ...dept.querySelectorAll(".sp-bento")].map((c) => ({ name: name(c), over: c.scrollHeight - c.clientHeight, cut: cut(c) }));
  return { cards, page: document.documentElement.scrollHeight - innerHeight };
}

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  const outbound = [];
  const errors = [];
  for (const [w, h] of SIZES) {
    const context = await browser.newContext({ viewport: { width: w, height: h } });
    await context.route((url) => !["127.0.0.1", "localhost"].includes(url.hostname), (route) => (outbound.push(route.request().url()), route.abort()));
    // what the checks change is not kept
    await context.route(/\/api\/spice-shots\/[\w-]+$/, (route) => (route.request().method() === "PUT" ? route.fulfill({ json: {} }) : route.continue()));
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${base}/#/spice`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".sp-stack .sp-layer", { timeout: 60000 });
    for (const [kind, id] of Object.entries(SHOTS)) {
      await page.evaluate(async (shot) => {
        const s = await import("/js/spice.js");
        await s.openShot(shot);
        // a Paint pass with the long note a paid removal leaves: what it took out, which engine, what it cost
        if (shot === "spice-example-jam-chase") {
          const b = s.spice.shot.body;
          s.setPass("paint", b.passes.plate.media, { from: b.passes.plate.from, to: b.passes.plate.to, note: "the sign on the wall and the man in the background · VOID, objects out of a video", credits: 14, source: "cloud" });
        }
      }, id);
      for (const d of DEPTS) {
        await page.locator(`.sp-layer[data-dept="${d}"] .sp-layer-main`).click();
        await page.waitForSelector(`.sp-dept.is-${d}:not([hidden])`);
        // the picture of the shot is there, and the layout has held still for a few frames
        await page.waitForFunction(() => { const m = document.querySelector(".sp-stage .sp-media:not([hidden])"); return !m || (m.tagName === "VIDEO" ? m.readyState >= 2 : m.complete); }, null, { timeout: 60000 }).catch(() => {});
        await page.evaluate(async () => {
          await document.fonts?.ready;
          const key = () => [".sp-dept:not([hidden])", ".sp-viewer", ".sp-side", ".sp-stage-host"].map((s) => { const r = document.querySelector(s)?.getBoundingClientRect(); return r ? [r.x, r.y, r.width, r.height].map(Math.round).join(",") : "-"; }).join("|");
          let last = "", same = 0;
          const t0 = performance.now();
          while (same < 4 && performance.now() - t0 < 15000) {
            await new Promise((r) => requestAnimationFrame(() => r()));
            const k = key();
            same = k === last ? same + 1 : 0;
            last = k;
          }
        });
        const m = await page.evaluate(measure);
        const bad = m.cards.filter((c) => c.over > 1 || c.cut.length);
        ok(!bad.length && m.page <= 1, `${w}x${h} ${kind} ${d}: every card holds what it has, the page does not scroll`, bad.map((c) => `${c.name} ${c.over > 1 ? `scrolls ${c.over}` : ""} ${c.cut.slice(0, 3).join(", ")}`).join(" | ") + (m.page > 1 ? ` page ${m.page}` : ""));
        if (out && (bad.length || m.page > 1)) await page.screenshot({ path: join(out, `${w}x${h}-${kind}-${d}.png`) });
      }
    }
    await context.close();
  }
  ok(errors.length === 0, "no page errors", errors.join(" | ").slice(0, 300));
  ok(outbound.length === 0, "nothing left this machine", outbound.slice(0, 2).join(" "));
} finally {
  await browser.close();
  server.kill();
}
console.log(failures ? `${failures} FAILED` : "all passed");
process.exit(failures ? 1 : 0);
