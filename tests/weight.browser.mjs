// What a page loads on a first visit, in a real browser, on a server and a folder of its own: a page that shows no 3D fetches no model and does
// not mount the Stage; the Stage room fetches the models of its scene (and of the tiles in view), never the library's four hundred; an outside
// agent's first command (the control MCP, through the server) mounts the Stage from any page and is answered, on the one stream the page opened
// at the start; Toaster's library lists its pieces from the manifest and fetches a model only to draw its piece. Every call to Comfy's hosts is
// refused, so nothing can be spent. A product's modules and styles come with its page: the first visit to Mixer loads Mixer's and no other
// product's, a product's page is drawn only once its styles are in, and the next product is loaded when it is first shown.
// Not part of `node --test` (it needs a browser). From the repo root:
//   PLAYWRIGHT_MODULE=<playwright's folder> node tests/weight.browser.mjs
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const root = resolve(import.meta.dirname, "..");
const dataDir = await mkdtemp(join(tmpdir(), "weight-data-"));
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
const guard = `data:text/javascript,${encodeURIComponent('const real = globalThis.fetch; globalThis.fetch = (input, init) => { const url = typeof input === "string" ? input : input?.url ?? String(input); if (/comfy\\.org/.test(url)) throw new Error("blocked outbound call: " + url); return real(input, init); };')}`;
const server = spawn(process.execPath, ["server/main.ts"], { cwd: root, env: { ...process.env, PORT: String(port), COMFYTURE_DATA: dataDir, COMFY_API_KEY: "test-key", COMFY_BASE_URL: "http://127.0.0.1:9", NODE_OPTIONS: `--import=${guard}` }, stdio: "ignore" });
const base = `http://127.0.0.1:${port}`;
for (let i = 0; i < 100; i++) {
  if (await fetch(`${base}/api/info`).then((r) => r.ok, () => false)) break;
  await new Promise((r) => setTimeout(r, 200));
}

const browser = await chromium.launch({ args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const send = async (op, args = {}) => {
  const res = await fetch(`${base}/api/control/command`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op, args }) });
  return { ok: res.ok, ...(await res.json()) };
};

/** A page opened in a browser of its own (nothing cached), with the models, scripts and styles it fetches noted. */
async function open(hash, paint = false) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  const page = await context.newPage();
  // (the live events, kept so a picture's paint event can be sent by hand)
  if (paint) {
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
  }
  const seen = { models: [], scripts: [], styles: [], streams: 0, errors: [], outbound: [] };
  page.on("pageerror", (e) => seen.errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !/GL Driver|favicon|Failed to load resource|WebGL|ERR_NETWORK_CHANGED/.test(m.text()) && seen.errors.push(m.text()));
  page.on("request", (r) => {
    const path = new URL(r.url()).pathname;
    if (/\.glb$/.test(path)) seen.models.push(path.replace(/^.*\/models\//, ""));
    else if (/\.js$/.test(path) && !path.includes("/vendor/")) seen.scripts.push(path.replace(/^\//, ""));
    else if (/\.css$/.test(path)) seen.styles.push(path.replace(/^\/css\//, "").replace(/\.css$/, ""));
    else if (/\/api\/control\/events$/.test(path)) seen.streams++;
  });
  await context.route((url) => !["127.0.0.1", "localhost"].includes(url.hostname), (route) => (seen.outbound.push(route.request().url()), route.abort()));
  await page.goto(`${base}/${hash}`, { waitUntil: "load" });
  return { page, seen, context };
}
const quiet = (ms) => new Promise((r) => setTimeout(r, ms));
const staged = (page) => page.evaluate(() => Boolean(window.controlStage));

try {
  // ---------------------------------------------------------------- a page that shows no 3D
  for (const hash of ["", "#/kitchen", "#/mixer", "#/utensils"]) {
    const { page, seen, context } = await open(hash);
    await page.waitForFunction(() => document.querySelector(".page:not([hidden])")?.childElementCount > 0 || document.querySelector("#monitor")?.childElementCount > 0, null, { timeout: 30000 }).catch(() => {});
    // (the browser is idle a moment after the page: everything that would load in the background has begun)
    await quiet(3500);
    ok(seen.models.length === 0, `${hash || "home"}: no model is fetched`, seen.models.slice(0, 3).join(", "));
    ok(!(await staged(page)), `${hash || "home"}: the Stage is not mounted`);
    ok(seen.errors.length === 0 && seen.outbound.length === 0, `${hash || "home"}: no error on the page, nothing left the machine`, [...seen.errors, ...seen.outbound].join(" | "));
    await context.close();
  }

  // ---------------------------------------------------------------- the Stage room
  {
    const { page, seen, context } = await open("#/stage");
    await page.waitForFunction(() => window.controlStage?.characters.length + window.controlStage?.props.length > 0, null, { timeout: 60000, polling: 250 }).catch(() => {});
    await page.evaluate(async () => { await window.controlStage.settled(); });
    await quiet(1500);
    const scene = await page.evaluate(() => {
      const s = window.controlStage;
      return { characters: s.characters.map((c) => [c.name, !!c.model]), props: s.props.map((p) => [p.userData.type, !!p.userData.modelled]) };
    });
    ok(scene.characters.length + scene.props.length > 0 && scene.characters.every(([, m]) => m) && scene.props.every(([, m]) => m), "the Stage room shows its scene with the modelled pieces", JSON.stringify(scene));
    ok(seen.models.length > 0 && seen.models.length < 60, "the Stage room fetches the models its scene and its tiles in view use, not the library", `${seen.models.length} of about 400`);
    ok(seen.errors.length === 0 && seen.outbound.length === 0, "the Stage room: no error on the page, nothing left the machine", [...seen.errors, ...seen.outbound].join(" | "));
    // a piece added from the library brings its own model
    const before = seen.models.length;
    await page.locator('.ctl-tabs button[role="tab"]', { hasText: "Assets" }).click();
    await page.locator(".ctl-search-head input").fill("croissant");
    await page.locator('.ctl-asset[aria-label="Add croissant"]').click();
    await page.waitForFunction(() => window.controlStage.props.at(-1)?.userData.type === "croissant" && window.controlStage.props.at(-1).userData.modelled, null, { timeout: 30000, polling: 250 }).catch(() => {});
    ok(await page.evaluate(() => window.controlStage.props.at(-1)?.userData.modelled === true), "a piece added from the library takes its model as it comes");
    ok(seen.models.slice(before).includes("props/croissant.glb"), "and that model is the one fetched for it", seen.models.slice(before).join(", "));
    await context.close();
  }

  // ---------------------------------------------------------------- an outside agent, from a page that shows no 3D
  {
    const { page, seen, context } = await open("#/utensils");
    for (let i = 0; i < 100; i++) {
      if ((await (await fetch(`${base}/api/control/status`)).json()).page) break;
      await quiet(200);
    }
    ok((await (await fetch(`${base}/api/control/status`)).json()).page === true, "a page that shows no 3D is open for an agent (the server sees its stream)");
    ok(!(await staged(page)) && seen.models.length === 0, "and has loaded no model and no Stage");
    const scene = await send("scene");
    ok(scene.ok && scene.result.assets.length > 300, "the first command mounts the Stage and is answered with the library's pieces", scene.error ?? String(scene.result?.assets?.length));
    const layout = await send("layout", { clear: true, props: [{ type: "table", label: "Table", x: 0, z: 0 }, { type: "kitten", x: 1, z: 1 }], characters: [{ name: "Ana", body: "woman", pose: "phone-call", x: -1, hold: "phone" }] });
    ok(layout.ok, "a layout is staged on it", layout.error ?? "");
    const look = await send("look", { width: 320 });
    const picture = typeof look.result === "string" ? look.result : Object.values(look.result ?? {}).find((v) => typeof v === "string" && v.startsWith("data:image"));
    ok(look.ok && picture?.startsWith("data:image/png"), "and a look at it comes back as a picture", look.error ?? "");
    const after = await send("scene");
    ok(after.result?.characters?.length === 1 && after.result?.props?.length === 2 && after.result.characters[0].hold?.right === "phone", "the scene holds what was staged, the phone in her hand");
    const fresh = await page.evaluate(() => { const s = window.controlStage; return { modelled: s.props.every((p) => p.userData.modelled), body: !!s.characters[0].model, held: !!s.characters[0].held?.right }; });
    ok(fresh.modelled && fresh.body && fresh.held, "everything on it was drawn with its model by the time the picture was taken", JSON.stringify(fresh));
    ok(seen.streams === 1, "one stream served the agent, before the Stage and after", String(seen.streams));
    ok(seen.models.length > 0 && seen.models.length < 80, "and the models fetched were those of the scene", `${seen.models.length}`);
    ok(seen.errors.length === 0 && seen.outbound.length === 0, "no error on the page, nothing left the machine", [...seen.errors, ...seen.outbound].join(" | "));
    await context.close();
  }

  // ---------------------------------------------------------------- a picture the Stage waited on, finishing after the page was loaded again
  {
    const { page, seen, context } = await open("#/stage", true);
    await page.waitForFunction(() => window.controlStage && document.querySelector(".ctl-stage canvas"), null, { timeout: 60000, polling: 250 });
    // (the stage that was open last is open: a stage opening replaces the pictures it holds with its own)
    await page.evaluate(async () => (await import("/js/control/link.js")).needStage());
    await page.evaluate(() => window.controlStage.addRun({ id: "job-late", status: "running", progress: 0.2, look: "rain", camera: window.controlStage.cameraState(), at: new Date().toISOString() }));
    await page.waitForFunction(() => /Saved/.test(document.querySelector(".ctl-saved")?.dataset.tooltip ?? ""), null, { timeout: 30000, polling: 250 }).catch(() => {});
    await page.goto(`${base}/#/utensils`, { waitUntil: "load" });
    await page.reload({ waitUntil: "load" });
    await quiet(3000);
    ok(!(await staged(page)), "a page loaded again on a page that shows no 3D has no Stage");
    await page.evaluate(() => window.__paint({ id: "job-late", status: "done", progress: 1, photo: { file: "late.png", url: "/media/photos/late.png", width: 640, height: 360 } }));
    await page.waitForFunction(() => window.controlStage?.runs.some((r) => r.id === "job-late" && r.status === "done"), null, { timeout: 60000, polling: 250 }).catch(() => {});
    ok(await page.evaluate(() => window.controlStage?.runs.find((r) => r.id === "job-late")?.status === "done"), "the Stage comes up for a picture it was waiting on, and keeps it with its stage");
    await page.evaluate(() => window.__paint({ id: "someone-else", status: "done", progress: 1, photo: { file: "x.png", url: "/media/photos/x.png", width: 8, height: 8 } }));
    await context.close();
    const other = await open("#/mixer", true);
    await quiet(2500);
    await other.page.evaluate(() => window.__paint({ id: "someone-else", status: "done", progress: 1, photo: { file: "x.png", url: "/media/photos/x.png", width: 8, height: 8 } }));
    await quiet(1500);
    ok(!(await staged(other.page)), "a picture the Stage did not ask for leaves it unmounted");
    ok(seen.errors.length === 0 && other.seen.errors.length === 0, "no error on the page", [...seen.errors, ...other.seen.errors].join(" | "));
    await other.context.close();
  }

  // ---------------------------------------------------------------- a product's code and styles come with its page
  {
    const { page, seen, context } = await open("#/mixer");
    // (what the page had when its first element was drawn: the product's first sheet, loaded or not)
    await page.waitForFunction(() => document.querySelector("#page-mixer")?.childElementCount > 0, null, { timeout: 60000 });
    await quiet(2500);
    const others = /^(ut-|macaron|mc-|sp-|jm-|jam|toaster)/;
    ok(seen.styles.includes("mixer") && !seen.styles.some((s) => others.test(s)), "Mixer's first visit loads Mixer's styles and no other product's", seen.styles.join(" "));
    ok(seen.scripts.some((s) => s.endsWith("panels/mixer.js")) && !seen.scripts.some((s) => /(panels\/(utensils|macaron|spice|toaster|jam)|macaron-assist|utensils-assist|spice-assist|toaster-assist)\.js$/.test(s)), "and its modules, none of the other products'");
    ok(seen.scripts.length < 90 && seen.styles.length < 12, "so a first visit is a few dozen modules and a handful of styles, not two hundred and fifty", `${seen.scripts.length} scripts, ${seen.styles.length} styles`);
    // the next product is loaded when it is first shown, and drawn once its styles are in
    await page.evaluate(() => {
      window.__first = {};
      new MutationObserver(() => {
        const el = document.querySelector("#page-jam");
        if (el?.childElementCount > 0 && window.__first.styled === undefined) window.__first.styled = document.querySelector('link[href="css/jm-shell.css"]')?.sheet != null && document.querySelector('link[href="css/jam.css"]')?.sheet != null;
      }).observe(document.body, { childList: true, subtree: true });
      location.hash = "#/jam";
    });
    await page.waitForFunction(() => window.__first.styled !== undefined, null, { timeout: 60000 }).catch(() => {});
    ok(seen.scripts.some((s) => s.endsWith("panels/jam.js")) && seen.styles.includes("jm-shell"), "Jam's modules and styles are loaded when it is first shown");
    ok(await page.evaluate(() => window.__first.styled === true), "and its page is first drawn with its styles in, not before");
    ok(seen.errors.length === 0 && seen.outbound.length === 0, "no error on the page, nothing left the machine", [...seen.errors, ...seen.outbound].join(" | "));
    await context.close();
  }

  // ---------------------------------------------------------------- Toaster's library
  {
    const { page, seen, context } = await open("#/toaster");
    await page.waitForSelector(".ts-library-key", { timeout: 60000 });
    await page.locator(".ts-library-key", { hasText: "Library" }).click();
    await page.waitForSelector(".ts-library .ts-piece", { timeout: 60000 });
    ok((await page.locator(".ts-library .ts-piece").count()) > 300, "Toaster's library lists the Stage's pieces from the manifest");
    await page.locator(".ts-lib-search input").fill("office chair");
    await page.waitForFunction(() => document.querySelector('.ts-library .ts-piece[aria-label="Add office chair"] img')?.src.startsWith("data:image/"), null, { timeout: 60000, polling: 250 }).catch(() => {});
    ok(await page.evaluate(() => document.querySelector('.ts-library .ts-piece[aria-label="Add office chair"] img')?.src.startsWith("data:image/")), "a piece's picture is drawn when it is in view");
    ok(seen.models.includes("props/office-chair.glb"), "from its own model");
    ok(seen.models.length > 0 && seen.models.length < 100, "and the library's other models are not fetched", `${seen.models.length} of about 400`);
    ok(seen.errors.length === 0 && seen.outbound.length === 0, "no error on the page, nothing left the machine", [...seen.errors, ...seen.outbound].join(" | "));
    await context.close();
  }
} finally {
  await browser.close();
  server.kill();
}
console.log(failures ? `${failures} FAILED` : "all passed");
process.exit(failures ? 1 : 0);
