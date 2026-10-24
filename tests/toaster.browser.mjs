// Toaster in a real browser, on a server and a folder of its own: an object is blocked out (shapes added, stacked, sized, coloured,
// mirrored, undone and done again, removed), its words are kept with the draft across a reload, and it is toasted: a render of the
// frame, a turnaround sheet brought back to the 6336 x 2688 that Pixal3D's template crops, and a 3D model made from it, shown and put
// on the Stage. What would spend credits is stood in for (the image model answers with the clay it was sent; the template answers
// with a small GLB), the 3D model waits for a yes, and every call to Comfy's hosts is refused, so no credit can be spent.
// The page has two modes (Scene, Render studio): the viewport moves to the right column in the studio and still draws, a part gets a sheet
// (words and a picture, uploaded to this server's own Library) and an @tag, the scene gets a reference picture, an @ in the words picks a
// tag as a pill, Improve (the writer stood in for) writes an own prompt, and the next render sends the pictures by their @names.
// Not part of `node --test` (it needs a browser). From the repo root:
//   PLAYWRIGHT_MODULE=<playwright's folder> node tests/toaster.browser.mjs        (OUT=<folder> keeps screenshots)
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { deflateSync, crc32 } from "node:zlib";

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const root = resolve(import.meta.dirname, "..");
const out = process.env.OUT ? resolve(process.env.OUT) : null;
if (out) await mkdir(out, { recursive: true });
const dataDir = await mkdtemp(join(tmpdir(), "toaster-data-"));
let failures = 0;
const ok = (cond, msg, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${msg}${extra ? `  ${extra}` : ""}`);
  if (!cond) failures++;
};

// a small GLB (one triangle), as the template would make: kept where the server keeps 3D files
function glb() {
  const bin = Buffer.alloc(36);
  [0, 0, 0, 1, 0, 0, 0, 1, 0].forEach((v, i) => bin.writeFloatLE(v, i * 4));
  const gltf = { asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }], meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], buffers: [{ byteLength: 36 }], bufferViews: [{ buffer: 0, byteLength: 36 }], accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] }] };
  let json = Buffer.from(JSON.stringify(gltf));
  json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
  const head = Buffer.alloc(12);
  head.writeUInt32LE(0x46546c67, 0);
  head.writeUInt32LE(2, 4);
  head.writeUInt32LE(12 + 8 + json.length + 8 + bin.length, 8);
  const chunk = (type, data) => {
    const h = Buffer.alloc(8);
    h.writeUInt32LE(data.length, 0);
    h.writeUInt32LE(type, 4);
    return Buffer.concat([h, data]);
  };
  return Buffer.concat([head, chunk(0x4e4f534a, json), chunk(0x004e4942, bin)]);
}
// a small PNG of one colour (a sheet's picture, a scene reference)
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
await mkdir(join(dataDir, "models"), { recursive: true });
await writeFile(join(dataDir, "models", "toaster-test.glb"), glb());

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
  if (await fetch(`${base}/api/toasts`).then((r) => r.ok, () => false)) break;
  await new Promise((r) => setTimeout(r, 200));
}

const browser = await chromium.launch({ args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  const page = await context.newPage();
  const errors = [];
  const outbound = [];
  const pictures = [];
  const runs = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !/GL Driver|favicon|Failed to load resource|WebGL/.test(m.text()) && errors.push(m.text()));
  await context.route((url) => !["127.0.0.1", "localhost"].includes(url.hostname), (route) => (outbound.push(route.request().url()), route.abort()));
  // the live events, kept so a picture's paint event can be sent by hand
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
  // the image model, stood in for: it answers at once with the clay it was sent (a picture of the library)
  await page.route("**/api/image", async (route) => {
    const body = route.request().postDataJSON();
    pictures.push(body);
    const file = body.refs?.[0]?.file;
    const photos = await (await fetch(`${base}/api/photos`)).json();
    const p = photos.find((x) => x.file === file);
    return route.fulfill({ status: 202, json: [{ id: `pic-${pictures.length}`, status: "done", progress: 1, photo: { file, url: `/media/photos/${file}`, width: p?.width, height: p?.height } }] });
  });
  // Pixal3D's multi-view template on Comfy Cloud, stood in for: its form, its price, and a run that is over at once with a GLB
  await page.route("**/api/utensils/templates/**", (route) => {
    const url = new URL(route.request().url());
    const [, name, tail] = url.pathname.match(/templates\/([^/]+)(?:\/([\w-]+))?$/) ?? [];
    if (tail === "estimate") return route.fulfill({ json: { credits: 0, perUnit: null, note: "No partner credits: it runs on Cloud GPU time." } });
    if (tail === "run") {
      runs.push({ name, body: route.request().postDataJSON() });
      return route.fulfill({ status: 202, json: { id: "tpl-test", status: "running", progress: 0.02, outputs: [] } });
    }
    if (name === "job") return route.fulfill({ json: { id: "tpl-test", status: "done", progress: 1, outputs: [{ kind: "model", url: "/media/models/toaster-test.glb", file: "toaster-test.glb" }] } });
    if (!tail) return route.fulfill({ json: { name, title: name, schema: { slots: [{ id: "image", kind: "image", required: true, label: "Image" }, { id: "seed", kind: "seed", label: "Seed" }], models: [], notes: [] } } });
    return route.continue();
  });

  const js = (fn, arg) => page.evaluate(fn, arg);
  const draft = () => js(async () => {
    const { toaster } = await import("/js/toaster.js");
    return JSON.parse(JSON.stringify({ name: toaster.draft?.name, body: toaster.draft?.body, selected: toaster.selected }));
  });
  const shot = async (name) => out && (await page.screenshot({ path: join(out, `${name}.png`) }));

  // ---------------------------------------------------------------- the page
  await page.goto(`${base}/#/toaster`);
  await page.waitForSelector(".ts-stage canvas", { timeout: 20000 });
  await page.waitForFunction(() => !document.querySelector(".ts-boot"));
  // the page's state, for the waits (a wait's test must answer at once: a promise would count as yes)
  const expose = () => js(async () => (window.__toaster = (await import("/js/toaster.js")).toaster));
  await expose();
  const until = (fn, arg, timeout = 15000) => page.waitForFunction(fn, arg, { timeout }).catch(() => {});
  ok((await page.title()) === "Toaster · Comfyture", "the page is Toaster's");
  ok((await js(() => [...document.querySelectorAll(".products .product span")].map((s) => s.textContent))).join() === "Kitchen,Mixer,Jam,Macaron,Spice,Toaster,Utensils", "seven products, Toaster between Spice and Utensils");
  ok((await js(() => document.querySelector('.products .product[aria-current="page"] use')?.getAttribute("href"))) === "icons/icons.svg#product-toaster", "its mark is lit in the bar");
  let d = await draft();
  ok(d.body.parts.length === 1 && d.body.parts[0].shape === "box", "a first visit starts a draft with a box", d.name);
  ok((await page.locator(".ts-tile").count()) === 10, "ten shapes to add");
  ok(await page.locator(".ts-stage .ctl-frame, .ts-frame").first().isVisible(), "the frame is drawn over the viewport");

  // ---------------------------------------------------------------- blocking out
  await page.locator(".ts-part").first().click();
  ok((await draft()).selected.length === 1, "a row click selects its part");
  await page.locator('.ts-tile[aria-label="Add a cylinder"]').click();
  d = await draft();
  const box = d.body.parts[0];
  const cyl = d.body.parts[1];
  ok(cyl?.shape === "cylinder" && Math.abs(cyl.pos[1] - (box.pos[1] + box.size[1] / 2 + cyl.size[1] / 2)) < 1e-3, "a shape added with a part selected sits on top of it", JSON.stringify(cyl?.pos));
  ok(d.selected[0] === cyl.id, "the new part is selected");
  ok(cyl.color !== box.color, "and wears a colour of its own");
  // its size typed in the inspector
  const sx = page.locator('.ts-inspector input[data-key="size"][data-axis="0"]');
  await sx.fill("0.4");
  await sx.press("Enter");
  ok((await draft()).body.parts[1].size[0] === 0.4, "a size typed is kept");
  // its colour
  await page.locator('.ts-swatch[aria-label="orange"]').click();
  ok((await draft()).body.parts[1].color === "#e0884b", "a swatch colours the part");
  await page.locator('.ts-inspector textarea[aria-label="What it is"]').fill("walnut");
  await page.locator(".ts-view").click({ position: { x: 20, y: 300 } });
  ok((await draft()).body.parts[1].made === "walnut", "what the part is (its sheet words) is kept");
  // moved off the middle, mirrored, undone and done again
  await page.locator(".ts-part").nth(1).click();
  const px = page.locator('.ts-inspector input[data-key="pos"][data-axis="0"]');
  await px.fill("0.8");
  await px.press("Enter");
  await page.locator(".ts-view").hover();
  await page.keyboard.press("m");
  d = await draft();
  const twin = d.body.parts[2];
  ok(d.body.parts.length === 3 && twin?.pos[0] === -0.8, "M mirrors the part to the other side", JSON.stringify(twin?.pos));
  await page.keyboard.press("Control+z");
  ok((await draft()).body.parts.length === 2, "Ctrl Z takes the mirror back");
  await page.keyboard.press("Control+Shift+z");
  ok((await draft()).body.parts.length === 3, "Ctrl Shift Z puts it back");
  await page.keyboard.press("Delete");
  ok((await draft()).body.parts.length === 2, "Delete removes the selection");
  // more shapes, for the turnaround
  await page.locator(".ts-part").first().click();
  await page.locator('.ts-tile[aria-label="Add a dome"]').click();
  await page.locator('.ts-tile[aria-label="Add a torus"]').click();
  await page.keyboard.press("Escape");
  ok((await draft()).selected.length === 0, "Esc lets the selection go");
  await page.waitForFunction(() => document.querySelectorAll(".ts-parts .ts-part").length === 4, null, { timeout: 3000 }).catch(() => {});
  ok((await js(() => document.querySelectorAll(".ts-parts .ts-part").length)) === 4, "the parts list shows every part", String(await js(() => document.querySelectorAll(".ts-parts .ts-part").length)));

  // ---------------------------------------------------------------- a piece of the Stage's library
  await page.locator(".ts-library-key", { hasText: "Library" }).click();
  await page.waitForSelector(".ts-library .ts-piece", { timeout: 30000 }).catch(() => {});
  const pieces = await page.locator(".ts-library .ts-piece").count();
  ok(pieces > 300, "the library holds the Stage's pieces", String(pieces));
  ok((await js(() => [...document.querySelectorAll(".ts-lib-cat")].map((b) => b.textContent))).includes("Furniture"), "by the Stage's categories");
  await page.locator(".ts-lib-search input").fill("office chair");
  await page.waitForTimeout(200);
  const found = await page.locator(".ts-library .ts-piece").count();
  ok(found >= 1 && found < 6 && (await page.locator('.ts-library .ts-piece[aria-label="Add office chair"]').count()) === 1, "a search finds the office chair", String(found));
  await page.waitForFunction(() => document.querySelector('.ts-library .ts-piece[aria-label="Add office chair"] img')?.src.startsWith("data:image/"), null, { timeout: 15000 }).catch(() => {});
  ok(await js(() => document.querySelector('.ts-library .ts-piece[aria-label="Add office chair"] img')?.src.startsWith("data:image/")), "its thumbnail is drawn");
  await page.locator('.ts-library .ts-piece[aria-label="Add office chair"]').click();
  d = await draft();
  const chair = d.body.parts.at(-1);
  ok(chair?.shape === "asset" && chair.asset === "office-chair" && chair.name === "Office chair", "a click adds the piece as a part", JSON.stringify(chair));
  ok(Math.abs(chair.size[1] - 1.033) < 0.02 && Math.abs(chair.pos[1] - chair.size[1] / 2) < 0.02, "at its own size, standing on the floor", JSON.stringify(chair?.size));
  ok(chair.color !== "#c9c4bb" && d.body.parts.slice(0, -1).every((p) => p.color !== chair.color), "in a colour of its own kind, worn by no other part", chair.color);
  // a second chair: the same colour, set down beside the first, never on it
  await page.locator('.ts-library .ts-piece[aria-label="Add office chair"]').click();
  d = await draft();
  const chair2 = d.body.parts.at(-1);
  const foot = (p) => ({ x0: p.pos[0] - p.size[0] / 2, x1: p.pos[0] + p.size[0] / 2, z0: p.pos[2] - p.size[2] / 2, z1: p.pos[2] + p.size[2] / 2 });
  const [f1, f2] = [foot(chair), foot(chair2)];
  ok(chair2.asset === "office-chair" && chair2.color === chair.color, "a second chair wears the first one's colour", chair2.color);
  ok(Math.abs(chair2.pos[1] - chair.pos[1]) < 1e-3 && (f2.x0 >= f1.x1 || f2.x1 <= f1.x0 || f2.z0 >= f1.z1 || f2.z1 <= f1.z0), "and stands on the floor beside it, not on top", JSON.stringify([chair.pos, chair2.pos]));
  const others = await js((id) => window.__toaster.draft.body.parts.filter((p) => p.id !== id && !p.hidden).map((p) => window.__toaster.view.bounds([p.id])), chair2.id);
  const b2 = await js((id) => window.__toaster.view.bounds([id]), chair2.id);
  ok(others.every((o) => b2.min[0] >= o.max[0] - 1e-3 || b2.max[0] <= o.min[0] + 1e-3 || b2.min[2] >= o.max[2] - 1e-3 || b2.max[2] <= o.min[2] + 1e-3), "touching no other part");
  ok(others.some((o) => Math.max(o.min[0] - b2.max[0], b2.min[0] - o.max[0], o.min[2] - b2.max[2], b2.min[2] - o.max[2]) < 0.15), "edge to edge with one of them");
  await page.keyboard.press("Delete");
  await page.locator(".ts-part").last().click();
  await page.waitForFunction((id) => { const b = window.__toaster.view.bounds([id]); return b && b.max[1] - b.min[1] > 0.9; }, chair.id, { timeout: 15000 }).catch(() => {});
  const cb = await js((id) => window.__toaster.view.bounds([id]), chair.id);
  ok(cb && Math.abs(cb.max[1] - cb.min[1] - chair.size[1]) < 0.02 && Math.abs(cb.max[0] - cb.min[0] - chair.size[0]) < 0.02, "its model fills its size box in the viewport", JSON.stringify(cb));
  // the categories scroll sideways under the wheel
  await page.locator(".ts-lib-search input").fill("");
  await page.locator(".ts-lib-cats").hover();
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(200);
  ok((await page.locator(".ts-lib-cats").evaluate((e) => e.scrollLeft)) > 0, "the wheel scrolls the categories sideways");
  await page.locator(".ts-view").click({ position: { x: 900, y: 40 } }).catch(() => {});
  await page.keyboard.press("Escape");
  ok(await page.locator(".ts-library").isHidden(), "Esc shuts the library");

  // ---------------------------------------------------------------- one of the Stage's characters
  await page.locator(".ts-library-key", { hasText: "Characters" }).click();
  await page.waitForSelector(".ts-library .ts-piece.is-person", { timeout: 30000 }).catch(() => {});
  ok((await page.locator(".ts-library .ts-piece.is-person").count()) === 8, "the characters drawer holds the Stage's eight body types", String(await page.locator(".ts-library .ts-piece.is-person").count()));
  ok((await page.locator(".ts-library .ts-lib-group", { hasText: "Animals" }).count()) === 1, "and the animals");
  await page.locator('.ts-library .ts-piece[aria-label="Add woman"]').click();
  d = await draft();
  const woman = d.body.parts.at(-1);
  ok(woman?.shape === "character" && woman.body === "woman" && woman.pose === "stand" && woman.size[1] > 1.4 && woman.size[1] < 2, "a click adds a woman, standing, at her height", JSON.stringify(woman));
  ok(d.body.parts.slice(0, -1).every((p) => p.color !== woman.color), "in a colour of her own");
  await page.keyboard.press("Escape");
  await page.locator(".ts-pose .sel-trigger").click();
  await page.locator(".sel-group", { hasText: /^Sit/ }).first().click();
  await page.locator(".sel-item", { hasText: /^Sit$/ }).first().click();
  await page.waitForTimeout(300);
  d = await draft();
  const sat = d.body.parts.find((p) => p.id === woman.id);
  ok(sat?.pose === "sit" && sat.size[1] < woman.size[1] - 0.2, "the pose picker sits her down: her box is the seated figure's", JSON.stringify(sat?.size));
  ok(Math.abs(sat.pos[1] - sat.size[1] / 2) < 0.01, "her feet stay on the floor", JSON.stringify(sat?.pos));
  await page.waitForFunction((id) => { const b = window.__toaster.view.bounds([id]); return b && Math.abs(b.max[1] - b.min[1] - window.__toaster.draft.body.parts.find((p) => p.id === id).size[1]) < 0.02; }, woman.id, { timeout: 15000 }).catch(() => {});
  const wb = await js((id) => window.__toaster.view.bounds([id]), woman.id);
  ok(wb && Math.abs(wb.max[1] - wb.min[1] - sat.size[1]) < 0.02, "the seated figure fills her box in the viewport", JSON.stringify(wb));
  // her pose tweaked: the sliders laid over the preset, her box measured again, her feet still on the floor
  await page.locator(".ts-pose-keys .ts-map", { hasText: "Tweak" }).click();
  await page.locator('.ts-tweaks input[aria-label="Look"]').waitFor({ timeout: 3000 });
  await page.locator('.ts-tweaks input[aria-label="Look"]').evaluate((el) => ((el.value = "40"), el.dispatchEvent(new Event("input", { bubbles: true }))));
  await page.locator('.ts-tweaks input[aria-label="Arms up"]').evaluate((el) => ((el.value = "90"), el.dispatchEvent(new Event("input", { bubbles: true }))));
  await page.waitForTimeout(300);
  d = await draft();
  const tweaked = d.body.parts.find((p) => p.id === woman.id);
  ok(tweaked?.params?.look === 40 && tweaked.params.arms === 90, "the sliders tweak her pose", JSON.stringify(tweaked?.params));
  ok(tweaked.size[0] > sat.size[0] + 0.3 && Math.abs(tweaked.pos[1] - tweaked.size[1] / 2) < 0.01, "her arms out to her sides widen her box (measured again), her feet stay on the floor", JSON.stringify([sat.size, tweaked.size]));
  // the joints mode: on with J, its hint in Selected, off with Esc
  await page.locator(".ts-view").hover();
  await page.keyboard.press("j");
  await page.waitForTimeout(200);
  ok((await js(() => window.__toaster.poseMode)) === woman.id && (await page.locator(".ts-hint-line").isVisible()), "J puts her in the joints mode");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  ok(!(await js(() => window.__toaster.poseMode)), "Esc takes her out of it");
  await page.locator('.ts-pose-keys [aria-label="Back to the preset"]').click();
  await page.waitForTimeout(200);
  d = await draft();
  ok(!d.body.parts.find((p) => p.id === woman.id)?.params, "the key takes her back to the preset");
  await shot("0b-characters");
  await page.locator(".ts-view").hover();
  await page.keyboard.press("Delete");
  ok(!(await draft()).body.parts.some((p) => p.id === woman.id), "Delete takes her away");
  await page.locator(".ts-part").last().click();
  const sy = page.locator('.ts-inspector input[data-key="size"][data-axis="1"]');
  await sy.fill("1.5");
  await sy.press("Enter");
  ok((await draft()).body.parts.at(-1).size[1] === 1.5, "a piece is sized like any part");
  await page.locator('.ts-swatch[aria-label="blue"]').click();
  await page.locator(".ts-view").click({ position: { x: 20, y: 300 } });
  await shot("0-library");

  // ---------------------------------------------------------------- the Render mode, and the words kept across a reload
  ok((await js(() => window.__toaster.mode)) === "scene" && (await page.locator(".ts-modes .ts-mode[aria-pressed=true]").innerText()) === "Scene", "the page opens in the Scene");
  ok(!(await page.locator(".ts-look, .ts-draft").count()), "the old look fields and the draft chip are gone from the scene");
  // one view at a time: the scene is two areas, and nothing of the render is in sight
  ok(!(await page.locator(".ts-render, .ts-sheet, .ts-model, .ts-studio, .ts-camera-card").count()), "in the Scene there is no render card, no turnaround, no 3D model, no studio");
  const sceneBox = await page.locator(".ts-view").boundingBox();
  const leftBox = await page.locator(".ts-left").boundingBox();
  ok(sceneBox.x >= leftBox.x + leftBox.width && sceneBox.x + sceneBox.width > 1600 - 40 && sceneBox.width > 1000, "and the viewport fills the width left of the parts", JSON.stringify(sceneBox));
  await page.locator(".ts-modes .ts-mode", { hasText: "Render" }).click();
  await page.waitForSelector(".toaster.is-render .ts-studio", { timeout: 5000 });
  ok((await js(() => window.__toaster.mode)) === "render", "the Render key switches the page to the studio");
  ok(!(await page.locator(".ts-view").isVisible()) && !(await page.locator(".ts-view .ts-tools").isVisible()), "in the Render no viewport is in sight");
  ok(await page.locator(".ts-add-keys").isHidden() && (await page.locator(".ts-parts-card .ts-label").first().innerText()) === "IN THE FRAME", "the parts are 'In the frame', and Add is gone");
  ok(await page.locator(".ts-camera-card").isVisible() && await page.locator(".ts-right .ts-sheet").isVisible() && await page.locator(".ts-right .ts-model").isVisible(), "on the right: Camera, Turnaround and 3D model");
  await page.waitForTimeout(700);
  ok(await page.locator(".ts-studio .ts-pic.is-clay img").isVisible(), "the studio shows the clay still although the viewport is hidden");
  await page.locator(".ts-part").first().click();
  await page.waitForSelector(".ts-inspector .ts-sheet-box", { timeout: 3000 }).catch(() => {});
  ok(!(await page.locator(".ts-inspector .ts-swatch, .ts-inspector input[data-key]").count()) && await page.locator(".ts-inspector .ts-sheet-box").isVisible(), "Selected shows only the part's sheet in the Render: no colours, no size, move or turn", await page.locator(".ts-inspector").innerHTML());
  await page.keyboard.press("t");
  await page.waitForSelector(".toaster.is-scene");
  await page.waitForTimeout(500);
  ok((await js(() => window.__toaster.mode)) === "scene" && await page.locator(".ts-mid > .ts-view").count() === 1, "T goes back to the scene: the viewport is in the middle again");
  ok(await js(() => { const c = document.querySelector(".ts-stage canvas"); const f = document.querySelector(".ts-frame").getBoundingClientRect(); return c.clientWidth > 600 && c.width > 1 && c.height > 1 && f.width > 200 && f.height > 100; }), "and its canvas is sized and its frame right again");
  ok((await page.locator(".ts-view").boundingBox()).width > 1000 && !(await page.locator(".ts-sheet, .ts-model").count()), "(the whole width, nothing of the render)");
  await page.keyboard.press("t");
  await page.waitForSelector(".toaster.is-render .ts-studio");
  ok(await page.locator('.ts-studio [aria-label="What it is"]').isVisible() && await page.locator('.ts-studio [aria-label="Scene"]').isVisible(), "the studio has What it is and Scene");
  await page.locator('.ts-studio [aria-label="What it is"]').click();
  await page.keyboard.type("A retro 1950s toaster, chrome body");
  await page.locator('.ts-studio [aria-label="Scene"]').click();
  await page.keyboard.type("On a marble counter, morning light");
  await page.waitForTimeout(900);
  await page.reload();
  // (the page comes back in the Render, where the viewport is kept hidden)
  await page.waitForSelector(".ts-stage canvas", { state: "attached", timeout: 20000 });
  await expose();
  await until(() => document.querySelectorAll(".ts-part").length === 5, null, 10000);
  d = await draft();
  ok(d.body.parts.length === 5 && d.body.what === "A retro 1950s toaster, chrome body" && d.body.scene.startsWith("On a marble"), "the draft, its parts and its words are kept across a reload");
  ok((await js(() => window.__toaster.mode)) === "render", "and the mode");
  await page.waitForTimeout(500);
  ok((await page.locator('.ts-studio [aria-label="What it is"]').innerText()) === "A retro 1950s toaster, chrome body", "the words are back in their field");
  ok(await page.locator(".ts-studio .ts-pic.is-clay img").isVisible(), "with no render yet the studio shows the clay frame, as Toaster sends it");
  await page.waitForSelector("img.ts-clay-strip", { timeout: 5000 }).catch(() => {});
  ok(await page.locator("img.ts-clay-strip").isVisible(), "the four clay views are drawn in the Turnaround card");
  await shot("1-blockout");

  // ---------------------------------------------------------------- toasting the frame
  await page.locator(".ts-studio .ts-toast").click();
  await until(() => window.__toaster.draft.body.renders[0]?.status === "done");
  await page.waitForSelector(".ts-studio .ts-pic img", { timeout: 5000 }).catch(() => {});
  const frameAsk = pictures[0];
  ok(frameAsk?.template === "edit" && frameAsk.refs?.[0]?.name === "frame" && frameAsk.aspect === "1:1", "Toast it sends the clay frame to an image edit, at the frame's aspect", JSON.stringify(frameAsk && { template: frameAsk.template, refs: frameAsk.refs, aspect: frameAsk.aspect }));
  ok(JSON.stringify(frameAsk?.refs?.map((r) => r.name)) === JSON.stringify(["frame", "colour-id", "depth"]), "with its control maps: the colour ID and the depth", JSON.stringify(frameAsk?.refs));
  ok(/@colour-id shows them flat/.test(frameAsk?.prompt) && /@depth shows how far things are/.test(frameAsk?.prompt), "the words name the maps and what they say");
  {
    const lib = await (await fetch(`${base}/api/photos`)).json();
    const [fr, id, dp] = frameAsk.refs.map((r) => lib.find((p) => p.file === r.file));
    ok(fr && id && dp && fr.width === id.width && fr.height === dp.height, "the maps are the frame's very size", JSON.stringify([fr, id, dp].map((p) => p && `${p.width}x${p.height}`)));
  }
  ok(/^Turn @frame, a clay blockout/.test(frameAsk?.prompt) && /orange is walnut/.test(frameAsk?.prompt) && /blue is a swivel office chair with/.test(frameAsk?.prompt) && !/Cylinder|Office chair/.test(frameAsk?.prompt) && /A retro 1950s toaster/.test(frameAsk?.prompt) && /marble counter/i.test(frameAsk?.prompt), "its words tell the clay's colours (a piece by the library's description of it), the object and the scene", frameAsk?.prompt);
  d = await draft();
  ok(d.body.renders[0]?.status === "done" && d.body.renders[0].photo?.url && d.body.renders[0].camera, "the render is kept with its camera");
  ok(await page.locator(".ts-studio .ts-pic img").isVisible(), "the render shows in the studio");
  ok(d.body.renders[0].prompt === frameAsk.prompt && Array.isArray(d.body.renders[0].refs), "the render keeps what was sent");
  await page.locator('.ts-studio [aria-label="Compare with the clay"]').click();
  await page.waitForSelector(".ts-pic.is-compare", { timeout: 3000 }).catch(() => {});
  ok(await page.locator(".ts-pic.is-compare .ts-wipe").isVisible(), "Compare shows the clay under the render with a wipe");
  await shot("2-render");

  // ---------------------------------------------------------------- the turnaround
  await page.locator(".ts-sheet .key.is-primary").click();
  await until(() => ["done", "failed"].includes(window.__toaster.draft.body.sheets[0]?.status), null, 30000);
  const sheetAsk = pictures[1];
  ok(sheetAsk?.aspect === "21:9" && sheetAsk.refs?.[0]?.name === "sheet" && /^Render @sheet as a finished turnaround sheet/.test(sheetAsk.prompt), "the turnaround sends the four clay views as one sheet, at 21:9");
  const photos = await (await fetch(`${base}/api/photos`)).json();
  const clay = photos.find((p) => p.file === sheetAsk?.refs?.[0]?.file);
  ok(clay?.width === 2112 && clay?.height === 896, "the clay sheet is the template's layout at a third", `${clay?.width}x${clay?.height}`);
  d = await draft();
  const sheet = d.body.sheets[0];
  ok(sheet?.status === "done" && sheet.photo?.width === 6336 && sheet.photo?.height === 2688, "the rendered sheet is brought back to 6336 x 2688, the size Pixal3D crops", JSON.stringify(sheet?.photo ?? sheet?.error));

  // ---------------------------------------------------------------- the 3D model
  await page.locator(".ts-model .key.is-primary").click();
  await page.waitForSelector(".ts-model .ts-armed", { timeout: 3000 }).catch(() => {});
  ok(runs.length === 0 && (await page.locator(".ts-model .ts-armed").isVisible()), "Make the 3D model asks for a yes first, and nothing runs");
  ok(/GPU time/.test(await page.locator(".ts-model .ts-armed").innerText()), "its price is said", await page.locator(".ts-model .ts-armed").innerText());
  await page.locator(".ts-model .ts-armed .key.is-primary").click();
  await until(() => ["done", "failed"].includes(window.__toaster.draft.body.models[0]?.status));
  ok(runs[0]?.name === "3d_pixal3d_multi_views" && runs[0].body.inputs?.image === sheet?.photo?.file && runs[0].body.confirm === true, "the yes runs Pixal3D's multi-view template on the sheet", JSON.stringify(runs[0]));
  d = await draft();
  ok(d.body.models[0]?.url === "/media/models/toaster-test.glb", "the 3D file is kept with the draft", JSON.stringify(d.body.models[0]));
  await page.waitForSelector(".ts-model-view canvas", { timeout: 10000 }).catch(() => {});
  ok(await page.locator(".ts-model-view canvas").isVisible(), "the model turns in its well");
  await page.locator('.ts-model [aria-label="Put it on the Stage, as a prop"]').click();
  await page.waitForTimeout(1500);
  const models = await (await fetch(`${base}/api/control/models`)).json();
  ok(models.models?.some((m) => m.kind === "prop" && m.ext === "glb"), "Put on the Stage keeps it in the Stage's assets, as a prop", JSON.stringify(models.models?.map((m) => m.name)));
  await shot("3-toasted");

  // ---------------------------------------------------------------- drafts (the project bar has the tabs; here a new one is made through the page's state)
  await js(async () => (await import("/js/toaster.js")).newDraft());
  await until(() => window.__toaster.list.length === 2, null, 5000);
  d = await draft();
  ok(/^Project 2$/.test(d.name) && d.body.parts.length === 1, "a new draft starts with a box", d.name);
  await page.keyboard.press("t");
  await page.waitForSelector(".toaster.is-scene");

  // ---------------------------------------------------------------- Crumpet builds a scene
  // his answer stood in for: a scene from scratch (a sofa, an armchair turned toward it, a woman sitting on the sofa, a lamp on a box),
  // the camera placed low, the words set, and a render offered
  const asked = [];
  await page.route("**/api/toaster/assist", (route) => {
    asked.push(route.request().postDataJSON());
    return route.fulfill({ json: { reply: "A cosy corner, ready to toast.", actions: [
      { op: "clear" },
      { op: "add", kind: "shape", shape: "box", name: "Floor", at: [0, 0], size: [8, 0.1, 6], color: "grey" },
      { op: "add", kind: "shape", shape: "box", name: "Back wall", at: [0, -3], size: [8, 2.7, 0.12], color: "grey" },
      { op: "add", kind: "piece", piece: "sofa", name: "Sofa", at: [0, -1], turn: 0, color: "teal" },
      { op: "add", kind: "piece", piece: "bookcase", name: "Books", against: "back" },
      { op: "add", kind: "piece", piece: "coffee-table", name: "Low table", near: "Sofa", side: "front", gap: 0.45 },
      { op: "add", kind: "piece", piece: "armchair", name: "Armchair", at: [1.7, -0.2], face: "Sofa", color: "orange" },
      { op: "add", kind: "character", body: "woman", pose: "sit", name: "Reader", at: [0.3, -0.9], y: 0.1, color: "pink", tweak: { look: 25, nod: 15 } },
      { op: "add", kind: "shape", shape: "box", name: "Side table", at: [-1.4, -1], size: [0.5, 0.5, 0.5], color: "brown", made: "oak" },
      { op: "set", part: "Side table", made: "walnut" },
      { op: "add", kind: "piece", piece: "desk-lamp", name: "Lamp", on: "Side table" },
      { op: "camera", from: [0.5, 0.6, 3.5], at: [0, 0.5, -0.8], frame: "16:9", lens: 28, save: "Reading corner" },
      { op: "camera", subject: "Sofa", side: "front", height: 1.2, margin: 1.8, save: "Sofa front-on" },
      { op: "words", what: "A cosy reading corner", scene: "Warm lamp light, evening" },
      { op: "toast" },
    ] } });
  });
  await page.locator("#toaster-chat #assistant").waitFor({ timeout: 10000 });
  ok(await js(() => document.querySelector("#assistant .pet-face img")?.getAttribute("src") === "brand/cast/crumpet-face.webp"), "Crumpet's bar is docked under the viewport, his face in it");
  // a photo for him to look at, from the Library
  await js(async (photo) => (await import("/js/toaster-assist.js")).addToasterPhoto({ ...photo, name: "corner" }), sheet.photo);
  await page.locator("#assistant .file-chip", { hasText: "Photo" }).waitFor({ timeout: 3000 }).catch(() => {});
  ok(await page.locator("#assistant .file-chip", { hasText: "Photo" }).isVisible(), "the photo waits on the bar");
  await page.locator("#assistant .chat-input").click();
  await page.keyboard.type("Make a cosy reading corner like this photo");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelectorAll("#assistant .chat-thread .msg.is-ai:not(.is-busy)").length >= 1, null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(500);
  const sent = asked[0];
  ok(sent?.toaster?.parts?.length === 1 && sent.toaster.parts[0].kind === "shape" && Array.isArray(sent.toaster.parts[0].at) && typeof sent.toaster.parts[0].y === "number", "he is told the parts as places on the floor (at, y, turn, size)", JSON.stringify(sent?.toaster?.parts?.[0]));
  ok(sent?.toaster?.camera?.from?.length === 3 && sent.toaster.camera.frame, "and the camera", JSON.stringify(sent?.toaster?.camera));
  ok(sent?.picture?.file === sheet.photo.file, "the photo goes with the words");
  // a click on a message copies its words (the clipboard is stood in for: the test's browser has none to read)
  await js(() => {
    window.__copied = null;
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (t) => void (window.__copied = t) } });
  });
  const answer = page.locator("#assistant .chat-thread .msg.is-ai:not(.is-busy) p").first();
  const answerText = await answer.textContent();
  await answer.click();
  await page.waitForTimeout(150);
  ok((await js(() => window.__copied)) === answerText && (await page.locator("#assistant .msg.is-ai.is-copied").count()) === 1, "a click on Crumpet's answer copies its words, and the bubble says so", await js(() => window.__copied));
  await page.locator("#assistant .chat-thread .msg.is-user p").first().click();
  await page.waitForTimeout(100);
  ok((await js(() => window.__copied)) === "Make a cosy reading corner like this photo", "and a click on what was asked copies that");
  d = await draft();
  const named = (n) => d.body.parts.find((p) => p.name === n);
  const sofa = named("Sofa");
  const arm = named("Armchair");
  const reader = named("Reader");
  const tbl = named("Side table");
  ok(d.body.parts.length === 9 && sofa?.asset === "sofa" && arm?.asset === "armchair" && reader?.shape === "character" && tbl?.shape === "box", "he cleared the floor and built the corner: a floor, a wall, pieces, a character and a shape", d.body.parts.map((p) => p.name).join(", "));
  const books = named("Books");
  const low = named("Low table");
  const lamp = named("Lamp");
  ok(books && books.rot[1] === 0 && Math.abs(books.pos[2] - books.size[2] / 2 - (-3 + 0.06)) < 0.02, "the bookcase stands against the back wall, its back on it, facing the room", JSON.stringify(books?.pos));
  ok(low && low.pos[2] > sofa.pos[2] + sofa.size[2] / 2 && Math.abs(Math.abs(low.rot[1]) - 180) < 1 && Math.abs(low.pos[2] - low.size[2] / 2 - (sofa.pos[2] + sofa.size[2] / 2) - 0.45) < 0.02, "the coffee table stands before the sofa, 45 cm from it, facing it", JSON.stringify([low?.pos, low?.rot]));
  ok(lamp && Math.abs(lamp.pos[1] - lamp.size[1] / 2 - (tbl.pos[1] + tbl.size[1] / 2)) < 0.01, "the lamp stands on the side table", JSON.stringify(lamp?.pos));
  ok(sofa && Math.abs(sofa.pos[0]) < 1e-3 && Math.abs(sofa.pos[2] + 1) < 1e-3 && Math.abs(sofa.pos[1] - sofa.size[1] / 2) < 1e-3, "the sofa stands where he said, on the floor", JSON.stringify(sofa?.pos));
  ok(arm && arm.rot[1] === Math.round((Math.atan2(0 - 1.7, -1 + 0.2) * 180) / Math.PI), "the armchair faces the sofa (he said face, the page turned it)", JSON.stringify(arm?.rot));
  ok(sofa.color === "#3d7fd9" && arm.color === "#76aef2" && reader.color === "#ff6b3d" && tbl.color === "#b07a52", "pieces and people wear their colour ID (seats in blues, a person their own), whatever colour he said; a shape takes his", JSON.stringify([sofa.color, arm.color, reader.color, tbl.color]));
  ok(reader && reader.pose === "sit" && Math.abs(reader.pos[1] - reader.size[1] / 2 - 0.1) < 1e-3, "the reader sits, her bottom at the height he said", JSON.stringify(reader?.pos));
  ok(reader?.params?.look === 25 && reader.params.nod === 15, "her pose tweaked as he said: looking aside and down", JSON.stringify(reader?.params));
  ok(tbl && tbl.made === "walnut" && tbl.size[0] === 0.5, "the side table sized and then changed by name", JSON.stringify(tbl));
  const aimed = d.body.cameras.find((k) => k.name === "Sofa front-on");
  ok(aimed && Math.abs(aimed.position[0] - sofa.pos[0]) < 1e-3 && aimed.position[2] > sofa.pos[2] + 1 && Math.abs(aimed.position[1] - 1.2) < 1e-3 && Math.abs(aimed.target[2] - sofa.pos[2]) < 1e-3, "a camera aimed at the sofa stands on its axis, before it, at the height he said, looking at it", JSON.stringify(aimed && [aimed.position, aimed.target]));
  await page.locator('.ts-cams [aria-label="Go to Reading corner"]').click();
  await page.waitForTimeout(200);
  const cam = await js(() => window.__toaster.view.cameraState());
  ok(Math.abs(cam.position[1] - 0.6) < 0.01 && Math.abs(cam.target[2] + 0.8) < 0.01 && d.body.ratio === "16:9" && cam.focal === 28, "the camera placed low, in a wide frame, with a 28 mm lens", JSON.stringify(cam));
  const slot = d.body.cameras.find((k) => k.name === "Reading corner");
  ok(slot && slot.focal === 28 && slot.ratio === "16:9" && slot.thumb?.startsWith("data:image/"), "and kept in a slot with its picture", JSON.stringify(slot && { ...slot, thumb: !!slot.thumb }));
  await page.waitForSelector(".ts-cams .ts-cam.is-on", { timeout: 3000 }).catch(() => {});
  ok(await page.locator(".ts-cams .ts-cam.is-on .ts-cam-name", { hasText: "Reading corner" }).isVisible(), "its slot is lit while the camera is on it");
  // back to the slot, to the pixel: the frame drawn before and after a trip elsewhere is the same picture
  const before = await js(() => window.__toaster.view.frameStill({ long: 480 }));
  await page.locator(".ts-view-key", { hasText: "Top" }).click();
  await js(() => window.__toaster.view.setFocal(85));
  await page.waitForTimeout(300);
  ok((await js(() => window.__toaster.view.frameStill({ long: 480 }))) !== before, "the camera went elsewhere, with another lens");
  ok(!(await page.locator(".ts-cams .ts-cam.is-on").count()), "and the slot is no longer lit");
  await page.locator('.ts-cams [aria-label="Go to Reading corner"]').click();
  await page.waitForTimeout(300);
  ok((await js(() => window.__toaster.view.frameStill({ long: 480 }))) === before, "a click on the slot brings the very picture back: place, aim, lens and frame");
  // a camera of yours, kept with the key
  await page.locator(".ts-cam-add").click();
  await page.waitForTimeout(200);
  ok((await draft()).body.cameras.length === 3, "the key keeps the camera as it is in a new slot");
  ok(d.body.what === "A cosy reading corner" && d.body.scene === "Warm lamp light, evening", "the render's words set");
  ok(await page.locator("#assistant .msg-confirm .key.is-primary", { hasText: "Toast it" }).isVisible(), "the render is only offered, with its price");
  ok(pictures.length === 2, "nothing was rendered without a yes");
  await shot("4-crumpet");
  await page.locator("#assistant .undo").click();
  d = await draft();
  ok(d.body.parts.length === 1 && d.body.parts[0].shape === "box", "Undo puts the draft back as it was before his build");
  // ---------------------------------------------------------------- the studio: a sheet per part, references, @tags, Improve, the pictures sent
  // (Crumpet's thread is folded: it opens over the page)
  await page.locator("#assistant .msg-confirm .key", { hasText: "Not now" }).click().catch(() => {});
  await page.locator('#assistant [aria-label="Fold the conversation"]').click().catch(() => {});
  await page.keyboard.press("t");
  await page.waitForSelector(".toaster.is-render .ts-studio");
  // the camera card: the slots kept in the Scene; a click puts the camera there and the studio's clay follows
  await page.keyboard.press("t");
  await page.waitForSelector(".toaster.is-scene");
  await js(async () => {
    const t = await import("/js/toaster.js");
    t.saveCamera("Wide");
    t.toaster.view.view("top");
    t.saveCamera("Above");
    t.toaster.view.view("front");
  });
  await page.keyboard.press("t");
  await page.waitForSelector(".toaster.is-render .ts-camera-card .ts-cam");
  await page.waitForTimeout(800);
  ok((await page.locator(".ts-camera-card .ts-cam").allInnerTexts()).join().endsWith("Wide,Above") && (await page.locator(".ts-camera-card .ts-cam").first().innerText()) === "Current view" && (await page.locator(".ts-camera-card .ts-cam.is-on").innerText()) === "Current view", "the Camera card has a tile per slot and the view as it was left, lit", (await page.locator(".ts-camera-card .ts-cam").allInnerTexts()).join());
  const clayA = await page.locator(".ts-clay-live").getAttribute("src");
  await page.locator('.ts-camera-card [aria-label^="Above"]').click();
  await page.waitForTimeout(1200);
  const clayB = await page.locator(".ts-clay-live").getAttribute("src");
  ok(clayA !== clayB && (await page.locator(".ts-camera-card .ts-cam.is-on .ts-cam-name").innerText()) === "Above" && (await js(() => window.__toaster.view.cameraState().position[1])) > 2, "a click on a tile puts the camera there: the clay still changes and the tile is lit", JSON.stringify([clayA === clayB, await page.locator(".ts-camera-card .ts-cam.is-on .ts-cam-name").allInnerTexts(), await js(() => window.__toaster.view.cameraState().position)]));
  // the control maps are the draft's choice: the silhouette added, the depth taken away
  await page.locator(".ts-map", { hasText: "Silhouette" }).click();
  await page.locator(".ts-map", { hasText: "Depth" }).click();
  ok(JSON.stringify((await draft()).body.maps) === JSON.stringify(["id", "silhouette"]), "the Control keys choose the maps sent with the clay");
  await page.locator(".ts-map", { hasText: "Silhouette" }).click();
  ok(JSON.stringify((await draft()).body.maps) === JSON.stringify(["id"]), "(the colour ID alone is sent)");
  // a part's sheet, in Selected: renamed (its tag follows), its words, a picture uploaded to the server's own Library
  await page.locator(".ts-part").first().click();
  await page.locator('.ts-inspector input[aria-label="Name"]').fill("Desk");
  await page.locator('.ts-inspector input[aria-label="Name"]').press("Enter");
  await page.waitForFunction(() => document.querySelector(".ts-inspector .ts-at")?.textContent === "@desk", null, { timeout: 3000 }).catch(() => {});
  ok((await page.locator(".ts-inspector .ts-at").textContent()) === "@desk", "renamed, the part's tag follows its name", await page.locator(".ts-inspector .ts-at").textContent());
  ok(await page.locator('.ts-inspector textarea[aria-label="What it is"]').isVisible() && await page.locator(".ts-inspector .ts-pic-add").isVisible(), "Selected holds the part's sheet: what it is, and its pictures");
  ok((await page.locator('.ts-inspector textarea[aria-label="What it is"]').getAttribute("placeholder")).startsWith("brushed chrome"), "a shape's words are asked for by their kind");
  await page.locator('.ts-inspector textarea[aria-label="What it is"]').fill("a walnut mid-century desk with brass handles");
  await page.locator('.ts-inspector input[aria-label="Name"]').click();
  // the add tile asks where the pictures come from: the computer, the Library, or made here in the Oven
  await page.locator(".ts-inspector .ts-pic-add").click();
  ok((await page.locator(".ts-add-menu [role=menuitem]").allInnerTexts()).join(" | ") === "From your computer | From the Library | Make it in the Oven", "the add tile asks: the computer, the Library, or made here", (await page.locator(".ts-add-menu [role=menuitem]").allInnerTexts()).join(" | "));
  let [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.locator(".ts-add-menu [role=menuitem]", { hasText: "From your computer" }).click()]);
  await chooser.setFiles({ name: "desk.png", mimeType: "image/png", buffer: png([150, 90, 40]) });
  await until(() => window.__toaster.draft.body.parts[0].refs?.length === 1, null, 8000);
  d = await draft();
  const deskPart = d.body.parts[0];
  ok(deskPart.name === "Desk" && deskPart.made.startsWith("a walnut") && deskPart.refs?.length === 1 && deskPart.refs[0].url.startsWith("/media/photos/"), "its words and its picture (uploaded to the Library) are on its sheet", JSON.stringify(deskPart.refs));
  ok(await page.locator(".ts-inspector .ts-pic-tile img").isVisible() && (await page.locator(".ts-parts .ts-mini-pic img").count()) === 1, "the picture is a tile in Selected and a small thumb in the parts list");
  await page.locator(".ts-parts .ts-part").first().hover();
  await page.waitForSelector(".peek:not([hidden])", { timeout: 2000 }).catch(() => {});
  ok(/Desk/.test(await page.locator(".peek").innerText()) && /walnut/.test(await page.locator(".peek").innerText()) && (await page.locator(".peek img").count()) === 1, "hovering its row shows its sheet");
  await page.mouse.move(700, 500);
  // undo covers the sheet
  await page.locator(".ts-pic-tile").first().hover();
  await page.locator(".ts-pic-off").first().click();
  ok(!(await draft()).body.parts[0].refs, "a picture is taken off its sheet");
  await page.keyboard.press("Control+z");
  ok((await draft()).body.parts[0].refs?.length === 1, "and Undo puts it back");
  // made here: the Oven opens with a reference sheet of what the part is, and what it makes lands on the part's sheet
  await page.locator(".ts-inspector .ts-pic-add").click();
  await page.locator(".ts-add-menu [role=menuitem]", { hasText: "Make it in the Oven" }).click();
  await page.waitForSelector("#image:not([hidden])", { timeout: 5000 }).catch(() => {});
  const asked3 = await js(async () => {
    const { state } = await import("/js/store.js");
    return { open: state.image.open, prompt: state.image.prompt, origin: state.image.origin };
  });
  ok(asked3.open && asked3.prompt.startsWith("A reference sheet of a walnut mid-century desk with brass handles") && asked3.origin?.toasterRef?.partId === (await draft()).body.parts[0].id, "Make it here opens the Oven with a reference sheet of what the part is (nothing is made until you press its key)", JSON.stringify(asked3).slice(0, 300));
  const made3 = await page.evaluate(async (bytes) => (await fetch("api/photos?name=made%20here", { method: "POST", headers: { "Content-Type": "image/png" }, body: new Uint8Array(bytes) })).json(), [...png([200, 160, 90])]);
  // the Oven is called the Oven; a picture it finishes does not land on the sheet by itself
  await page.waitForSelector("#image .img-window .img-title", { timeout: 5000 });
  ok((await page.locator("#image .img-title").textContent()).trim() === "Oven", "the window's title is Oven");
  await js(async (photo) => {
    const { state } = await import("/js/store.js");
    state.image.results.unshift({ id: "oven-1", status: "running", progress: 0, prompt: state.image.prompt, label: "test", seed: 1, aspect: "16:9", origin: state.image.origin, model: "Qwen 2.1", credits: null, started: Date.now(), seconds: null });
    state.image.shown = "oven-1";
    window.__paint({ id: "oven-1", status: "done", progress: 1, photo: { file: photo.file, url: `/media/photos/${photo.file}`, width: photo.width, height: photo.height } });
  }, made3);
  await page.waitForSelector("#image .img-shown", { timeout: 5000 });
  await page.waitForTimeout(400);
  ok((await draft()).body.parts[0].refs?.length === 1, "a finished picture does not land on the sheet by itself");
  ok(await page.locator("#image .img-send").isVisible(), "it waits in the window, with its Send to key");
  // Send to lists the section's targets: the sheet it was asked for first, the render's references, then the other parts
  await page.locator("#image .img-send").click();
  await page.waitForSelector(".send-menu [role=menuitem]", { timeout: 3000 });
  const items = await page.locator(".send-menu [role=menuitem]").allInnerTexts();
  const parts = (await draft()).body.parts;
  ok(/^Desk's sheet/.test(items[0]) && /asked for/.test(items[0]), "Send to puts the sheet it was asked for first", items[0]);
  ok(items[1] === "The render's references" && items.length === 2 + parts.length - 1, "then the render's references and the other parts", items.join(" | "));
  ok(parts.slice(1).every((p) => items.includes(`${p.name}'s sheet`)) && (await page.locator(".send-menu .send-chip").count()) === parts.length, "every part is listed as its sheet, with its colour chip", items.join(" | "));
  await shot("oven-send-menu");
  await page.locator(".send-menu [role=menuitem]").first().click();
  await until(() => window.__toaster.draft.body.parts[0].refs?.length === 2, null, 8000);
  ok((await draft()).body.parts[0].refs?.length === 2 && (await draft()).body.parts[0].refs[1].file === made3.file && (await page.locator("#image:not([hidden]) .img-window").count()) === 1, "sending puts the picture on that sheet and the window stays open");
  await page.locator("#image .img-send").click();
  await page.waitForSelector(".send-menu [role=menuitem]", { timeout: 3000 });
  ok((await page.locator(".send-menu [role=menuitem]").first().locator(".send-check").count()) === 1, "the sheet it went to shows as sent");
  await page.keyboard.press("Escape");
  await js(async () => {
    const { state, changed } = await import("/js/store.js");
    state.image.open = false;
    changed("image");
  });
  ok((await draft()).body.parts[0].refs?.length === 2 && (await draft()).body.parts[0].refs[1].file === made3.file, "the picture it made lands on the part's sheet", JSON.stringify((await draft()).body.parts[0].refs));
  await page.locator(".ts-inspector .ts-pic-tile").nth(1).hover();
  await page.locator(".ts-inspector .ts-pic-off").nth(1).click();
  // a reference for the whole render, from a file; a second one pasted on the composer
  await page.locator(".ts-refs .ts-pic-add").click();
  [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.locator(".ts-add-menu [role=menuitem]", { hasText: "From your computer" }).click()]);
  await chooser.setFiles({ name: "Mood Board.png", mimeType: "image/png", buffer: png([40, 90, 150]) });
  await until(() => window.__toaster.draft.body.refs?.length === 1, null, 8000);
  d = await draft();
  ok(d.body.refs[0]?.name === "mood-board" && d.body.refs[0].url.startsWith("/media/photos/"), "a reference picture is called by an @name of its own", JSON.stringify(d.body.refs));
  await page.locator(".ts-compose").evaluate((el, bytes) => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(bytes)], "paste.png", { type: "image/png" }));
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, [...png([90, 150, 40])]);
  await until(() => window.__toaster.draft.body.refs?.length === 2, null, 8000);
  ok((await draft()).body.refs.length === 2, "pictures pasted on the composer are references too");
  await page.locator(".ts-refs .ts-pic-tile").nth(1).hover();
  await page.locator(".ts-refs .ts-pic-off").nth(1).click();
  ok((await draft()).body.refs.length === 1, "a reference is taken off with its cross");
  // the Library picker: the pictures of this server's Library, lit when on the render
  await page.locator('.ts-refs [aria-label="From the Library"]').click();
  await page.waitForSelector(".ts-refs .ts-lib-photo", { timeout: 5000 });
  ok((await page.locator(".ts-refs .ts-lib-photo[aria-pressed=true]").count()) === 1 && (await page.locator(".ts-refs .ts-lib-photo").count()) >= 3, "the Library picker lists the pictures, the one on the render lit");
  await page.locator('.ts-refs [aria-label="From the Library"]').click();
  // "In the frame" is the left column: the part's row shows its @tag and its picture
  ok(/@desk/.test(await page.locator(".ts-parts .ts-part").first().innerText()) && !(await page.locator(".ts-who").count()), "the part's row says @desk (the composer has no chips)");
  // an @ in the words opens the tags; Enter puts one in as a pill
  await page.locator('.ts-studio [aria-label="What it is"]').click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" on @d");
  await page.waitForSelector(".ts-tags:not([hidden])", { timeout: 3000 });
  ok((await page.locator(".ts-tags .ts-tag-row").first().innerText()).includes("@desk"), "typing an @ opens the list of tags, the part first", await page.locator(".ts-tags").innerText());
  await page.keyboard.press("Enter");
  await page.waitForSelector('.ts-studio [aria-label="What it is"] .pill[data-name="desk"]', { timeout: 3000 }).catch(() => {});
  ok(await page.locator('.ts-studio [aria-label="What it is"] .pill[data-name="desk"]').isVisible() && (await page.locator(".ts-tags").isHidden()), "Enter puts @desk in as a pill");
  await page.keyboard.type("under a lamp, like @mo");
  ok((await page.locator(".ts-tags .ts-tag-row").first().innerText()).includes("@mood-board"), "the scene's references are in the list too");
  await page.keyboard.press("Tab");
  await page.waitForTimeout(900);
  d = await draft();
  ok(/^A cosy reading corner on @desk under a lamp, like @mood-board $/.test(d.body.what) || /on @desk under a lamp, like @mood-board/.test(d.body.what), "the words keep the tags as plain @names", d.body.what);
  await page.locator('.ts-studio [aria-label="What it is"] .pill[data-name="desk"]').hover();
  await page.waitForSelector(".peek:not([hidden])", { timeout: 2000 }).catch(() => {});
  ok(/walnut/.test(await page.locator(".peek").innerText()), "hovering a pill shows its sheet");
  await page.mouse.move(700, 500);
  // the prompt: automatic (dimmed, Auto) until it is written
  ok((await page.locator(".ts-prompt-head .ts-badge").textContent()) === "Auto" && (await page.locator(".ts-pills.is-prompt.is-auto").count()) === 1, "the prompt is automatic: dimmed, with an Auto badge");
  const autoText = await page.locator(".ts-pills.is-prompt").textContent();
  ok(/^Turn @frame, a clay blockout/.test(autoText) && /exactly as in @desk/.test(autoText) && /@mood-board is a reference picture/.test(autoText), "it shows the words with their @tags, unexpanded", autoText);
  // Improve, with the writer stood in for
  const improved = [];
  await page.route("**/api/toaster/improve", (route) => {
    improved.push(route.request().postDataJSON());
    return route.fulfill({ json: { prompt: "Render @frame as a warm photograph: @desk is the desk, exactly as in that picture, lit like @mood-board." } });
  });
  await page.locator(".ts-improve").click();
  await until(() => window.__toaster.draft.body.prompt.startsWith("Render @frame as a warm"), null, 8000);
  const ask = improved[0];
  ok(ask?.what.includes("@desk") && ask.cast?.some((c) => c.tag === "desk" && c.kind === "shape" && c.words.startsWith("a walnut") && c.pictures.join() === "desk") && ask.cast.some((c) => c.tag === "mood-board" && c.kind === "reference"), "Improve sends the words and the cast with its sheets", JSON.stringify(ask?.cast));
  ok(JSON.stringify(ask?.refs?.map((r) => r.name)) === JSON.stringify(["frame", "mood-board", "desk"]) && ask.refs.every((r) => r.file) && typeof ask.model === "string", "and the clay frame, then a picture of each sheet", JSON.stringify(ask?.refs));
  ok(/^Turn @frame, a clay blockout/.test(ask.prompt), "the draft to improve is the automatic prompt");
  await page.waitForFunction(() => document.querySelector(".ts-pills.is-prompt")?.textContent.startsWith("Render @frame as a warm"), null, { timeout: 3000 }).catch(() => {});
  ok((await page.locator(".ts-prompt-head .ts-badge").textContent()) === "Yours" && (await page.locator(".ts-pills.is-prompt.is-auto").count()) === 0 && /sent as written/.test(await page.locator(".ts-prompt-head").textContent()), "the Prompt field holds it as the user's own", await page.locator(".ts-prompt-head").textContent());
  // toasted: the own prompt as written, with the pictures by their @names
  await page.locator(".ts-studio .ts-toast").click();
  await until(() => window.__toaster.draft.body.renders[0]?.status === "done" && window.__toaster.draft.body.renders[0].prompt.startsWith("Render @frame as a warm"));
  const own = pictures.at(-1);
  const names = own.refs.map((r) => r.name);
  ok(["frame", "colour-id", "desk", "mood-board"].every((n) => names.includes(n)), "Toast it sends the frame, the map, the part's picture and the scene reference", names.join());
  ok(own.prompt === "Render @frame as a warm photograph: @desk is the desk, exactly as in that picture, lit like @mood-board.", "its prompt is the user's own, as written");
  d = await draft();
  ok(d.body.renders[0].refs.map((r) => r.name).join() === "mood-board,desk" && d.body.renders[0].prompt === own.prompt, "the render keeps what was sent: its prompt and the pictures by name", JSON.stringify(d.body.renders[0].refs));
  await page.locator('.ts-studio [aria-label^="What was sent"]').click();
  await page.waitForSelector(".ts-sent:not([hidden]) figure", { timeout: 3000 });
  ok(/warm photograph/.test(await page.locator(".ts-sent-prompt").innerText()) && (await page.locator(".ts-sent figcaption").allInnerTexts()).join() === "@frame,@colour-id,@mood-board,@desk", "What was sent shows the prompt and the pictures by @name", (await page.locator(".ts-sent figcaption").allInnerTexts()).join());
  await shot("5-studio");
  // back to automatic: the next render's words carry the sheet
  await page.locator('.ts-studio [aria-label="Back to automatic"]').click();
  ok((await page.locator(".ts-prompt-head .ts-badge").textContent()) === "Auto" && (await draft()).body.prompt === "", "Back to automatic clears the user's own prompt");
  await page.locator(".ts-studio .ts-toast").click();
  await until(() => window.__toaster.draft.body.renders.length === 2 && window.__toaster.draft.body.renders[0].status === "done");
  const auto = pictures.at(-1);
  ok(/a walnut mid-century desk with brass handles \(exactly as in @desk\)/.test(auto.prompt) && /, exactly as in @desk[;.]/.test(auto.prompt) && /@mood-board is a reference picture/.test(auto.prompt) && /like @mood-board\./.test(auto.prompt), "the automatic prompt names the part by its sheet: exactly as in @desk, its words", auto.prompt);
  ok(["frame", "colour-id", "desk", "mood-board"].every((n) => auto.refs.map((r) => r.name).includes(n)), "and sends the same pictures");
  // Crumpet is told the tag and the pictures
  const told = await js(async () => (await import("/js/toaster-assist.js")).summary().parts[0]);
  ok(told.tag === "desk" && told.pictures === 1 && told.made.startsWith("a walnut"), "Crumpet is told each part's tag and its pictures", JSON.stringify(told));
  await shot("6-studio-auto");

  ok(outbound.length === 0, "no call left the machine", outbound.join(" "));
  ok(errors.length === 0, "no error on the page", errors.join(" | "));
} finally {
  await browser.close();
  server.kill();
}
console.log(failures ? `${failures} failed` : "all passed");
process.exit(failures ? 1 : 0);
