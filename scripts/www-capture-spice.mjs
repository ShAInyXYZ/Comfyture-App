// Spice's two screens for the website (www/media/app/spice.webp and tour.webp), captured from a lab server with the shipped examples:
// Paprika's portal in FX with the portal layer picked (its handles on the picture, its Look with Light and Reach), and Paprika's tour
// on FX's library. 1600x950 at twice the pixels, as www/README.md says; then CAPTURES=<out's parent> python3 scripts/www-media.py.
//
//   env -u COMFY_API_KEY PORT=5421 COMFYTURE_DATA=<scratch>/data COMFY_BASE_URL=http://127.0.0.1:9 node server/main.ts
//   NODE_PATH=<node_modules with playwright> node scripts/www-capture-spice.mjs http://127.0.0.1:5421 <capture folder>/b
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const [base, out] = process.argv.slice(2);
const b = await chromium.launch({ args: ["--disable-gpu"] });
const ctx = await b.newContext({ viewport: { width: 1600, height: 950 }, deviceScaleFactor: 2 });
await ctx.route("**/*", (r) => (new URL(r.request().url()).hostname === "127.0.0.1" ? r.continue() : r.abort()));
const p = await ctx.newPage();
const errs = []; p.on("pageerror", (e) => errs.push(e.message));
// the tours have been seen (no first-visit tour over the screen)
await p.addInitScript(() => { try { localStorage.setItem("comfyture:tours", JSON.stringify({ spice: 1, home: 1, kitchen: 1 })); } catch {} });
await p.goto(`${base}/#/spice`, { waitUntil: "load" });
await p.waitForTimeout(2500);
await p.evaluate(async () => {
  const s = await import("/js/spice.js");
  await s.openShot("spice-example-paprika");
  s.setDept("fx");
  const ops = await import("/js/spice-fx-ops.js");
  ops.selectLayer("l-paprika-1");
});
await p.waitForTimeout(3500);
await p.screenshot({ path: `${out}/spice-25-paprika-fx-handles.png` });
await p.evaluate(async () => { const t = await import("/js/tour.js"); await t.startTour("spice", 7); });
await p.waitForTimeout(3500);
await p.screenshot({ path: `${out}/spice-35-tour-fx-library.png` });
console.log(errs.length ? "errors: " + errs.join(" | ") : "no page errors");
await b.close();
