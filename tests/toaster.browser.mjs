// Toaster in a real browser, on a server and a folder of its own: an object is blocked out (shapes added, stacked, sized, coloured,
// mirrored, undone and done again, removed), its words are kept with the draft across a reload, and it is toasted: a render of the
// frame, a turnaround sheet brought back to the 6336 x 2688 that Pixal3D's template crops, and a 3D model made from it, shown and put
// on the Stage. What would spend credits is stood in for (the image model answers with the clay it was sent; the template answers
// with a small GLB), the 3D model waits for a yes, and every call to Comfy's hosts is refused, so no credit can be spent.
// Not part of `node --test` (it needs a browser). From the repo root:
//   PLAYWRIGHT_MODULE=<playwright's folder> node tests/toaster.browser.mjs        (OUT=<folder> keeps screenshots)
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

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
  await page.locator('.ts-inspector input[aria-label="Made of"]').fill("walnut");
  await page.locator('.ts-inspector input[aria-label="Made of"]').press("Enter");
  await page.locator(".ts-view").click({ position: { x: 20, y: 300 } });
  ok((await draft()).body.parts[1].made === "walnut", "what it is made of is kept");
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

  // ---------------------------------------------------------------- the words, kept across a reload
  await page.locator('input[aria-label="What it is"]').fill("A retro 1950s toaster, chrome body");
  await page.locator('input[aria-label="Scene"]').fill("On a marble counter, morning light");
  await page.waitForTimeout(900);
  await page.reload();
  await page.waitForSelector(".ts-stage canvas", { timeout: 20000 });
  await expose();
  await until(() => document.querySelectorAll(".ts-part").length === 5, null, 10000);
  d = await draft();
  ok(d.body.parts.length === 5 && d.body.what === "A retro 1950s toaster, chrome body" && d.body.scene.startsWith("On a marble"), "the draft, its parts and its words are kept across a reload");
  ok((await page.locator('input[aria-label="What it is"]').inputValue()) === "A retro 1950s toaster, chrome body", "the words are back in their field");
  await page.waitForSelector("img.ts-clay-strip", { timeout: 5000 }).catch(() => {});
  ok(await page.locator("img.ts-clay-strip").isVisible(), "the four clay views are drawn in the Turnaround card");
  await shot("1-blockout");

  // ---------------------------------------------------------------- toasting the frame
  await page.locator(".ts-toast").click();
  await until(() => window.__toaster.draft.body.renders[0]?.status === "done");
  await page.waitForSelector(".ts-render .ts-pic img", { timeout: 5000 }).catch(() => {});
  const frameAsk = pictures[0];
  ok(frameAsk?.template === "edit" && frameAsk.refs?.[0]?.name === "frame" && frameAsk.aspect === "1:1", "Toast it sends the clay frame to an image edit, at the frame's aspect", JSON.stringify(frameAsk && { template: frameAsk.template, refs: frameAsk.refs, aspect: frameAsk.aspect }));
  ok(JSON.stringify(frameAsk?.refs?.map((r) => r.name)) === JSON.stringify(["frame", "colour-id", "depth"]), "with its control maps: the colour ID and the depth", JSON.stringify(frameAsk?.refs));
  ok(/In @frame and @colour-id, /.test(frameAsk?.prompt) && /@depth shows how far everything is/.test(frameAsk?.prompt), "the words name the maps and what they say");
  {
    const lib = await (await fetch(`${base}/api/photos`)).json();
    const [fr, id, dp] = frameAsk.refs.map((r) => lib.find((p) => p.file === r.file));
    ok(fr && id && dp && fr.width === id.width && fr.height === dp.height, "the maps are the frame's very size", JSON.stringify([fr, id, dp].map((p) => p && `${p.width}x${p.height}`)));
  }
  ok(/^Render @frame/.test(frameAsk?.prompt) && /the orange clay \(cylinder\) becomes walnut|the orange clay becomes walnut/.test(frameAsk?.prompt) && /the blue clay is the office chair/.test(frameAsk?.prompt) && /A retro 1950s toaster/.test(frameAsk?.prompt) && /marble counter/i.test(frameAsk?.prompt), "its words tell the clay's colours, the object and the scene", frameAsk?.prompt);
  d = await draft();
  ok(d.body.renders[0]?.status === "done" && d.body.renders[0].photo?.url && d.body.renders[0].camera, "the render is kept with its camera");
  ok(await page.locator(".ts-render .ts-pic img").isVisible(), "the render shows in the Render card");
  await page.locator('.ts-render [aria-label="Compare with the clay"]').click();
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

  // ---------------------------------------------------------------- drafts
  await page.locator('.ts-draft [aria-label="Every draft"]').click();
  await page.locator(".ts-draft-new").click();
  await until(() => window.__toaster.list.length === 2, null, 5000);
  d = await draft();
  ok(d.name === "Object 2" && d.body.parts.length === 1, "a new draft starts with a box", d.name);

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
      { op: "add", kind: "character", body: "woman", pose: "sit", name: "Reader", at: [0.3, -0.9], y: 0.1, color: "pink" },
      { op: "add", kind: "shape", shape: "box", name: "Side table", at: [-1.4, -1], size: [0.5, 0.5, 0.5], color: "brown", made: "oak" },
      { op: "set", part: "Side table", made: "walnut" },
      { op: "add", kind: "piece", piece: "desk-lamp", name: "Lamp", on: "Side table" },
      { op: "camera", from: [0.5, 0.6, 3.5], at: [0, 0.5, -0.8], frame: "16:9", lens: 28, save: "Reading corner" },
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
  ok(tbl && tbl.made === "walnut" && tbl.size[0] === 0.5, "the side table sized and then changed by name", JSON.stringify(tbl));
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
  ok((await draft()).body.cameras.length === 2, "the key keeps the camera as it is in a new slot");
  ok(d.body.what === "A cosy reading corner" && (await page.locator('input[aria-label="Scene"]').inputValue()) === "Warm lamp light, evening", "the render's words set, in their fields");
  ok(await page.locator("#assistant .msg-confirm .key.is-primary", { hasText: "Toast it" }).isVisible(), "the render is only offered, with its price");
  ok(pictures.length === 2, "nothing was rendered without a yes");
  await shot("4-crumpet");
  await page.locator("#assistant .undo").click();
  d = await draft();
  ok(d.body.parts.length === 1 && d.body.parts[0].shape === "box", "Undo puts the draft back as it was before his build");
  // the control maps are the draft's choice: the silhouette added, the depth taken away
  await page.locator(".ts-map", { hasText: "Silhouette" }).click();
  await page.locator(".ts-map", { hasText: "Depth" }).click();
  ok(JSON.stringify((await draft()).body.maps) === JSON.stringify(["id", "silhouette"]), "the Control keys choose the maps sent with the clay");
  ok(outbound.length === 0, "no call left the machine", outbound.join(" "));
  ok(errors.length === 0, "no error on the page", errors.join(" | "));
} finally {
  await browser.close();
  server.kill();
}
console.log(failures ? `${failures} failed` : "all passed");
process.exit(failures ? 1 : 0);
