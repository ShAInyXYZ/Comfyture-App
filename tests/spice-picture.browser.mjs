// Spice on a shot that is a PICTURE, in a real browser, on a server and a folder of its own: every department takes the picture and gives
// a picture back. The free passes run for real on this machine (a spot painted out, the weather and the grade laid on it, the FX layers
// baked, an export to WebP); the paid ones ask first and are stood in for, so no credit is ever spent (Roto's cut-out, Paint's object taken
// out by Qwen, the upscale refused by the browser and counted). The FX compositor's layers go behind the person Roto holds; the light a
// layer casts, the rim it lights on the person and the shot's bloom and vignette are measured in pixels, and their controls are used.
// Not part of `node --test` (it needs a browser and ffmpeg). From the repo root:
//   PLAYWRIGHT_MODULE=<playwright's folder> node tests/spice-picture.browser.mjs        (OUT=<folder> keeps screenshots)
import { spawn, execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { tempDir } from "./tools/temp.mjs";

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const root = resolve(import.meta.dirname, "..");
const out = process.env.OUT ? resolve(process.env.OUT) : null;
if (out) await mkdir(out, { recursive: true });
const dataDir = tempDir("spice-pic-data-");
const mediaDir = tempDir("spice-pic-media-");
let failures = 0;
const ok = (cond, msg, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${msg}${extra ? `  ${extra}` : ""}`);
  if (!cond) failures++;
};

// the picture and its matte, from our own cast (examples/spice): Truffle at his workbench, and Truffle cut out
const ff = (...args) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args]);
const truffle = join(root, "examples", "spice", "sh040-truffle");
ff("-i", join(truffle, "plate.jpg"), "-vf", "scale=640:-2,crop=640:360", "-frames:v", "1", join(mediaDir, "picture.png"));
ff("-i", join(truffle, "roto.png"), "-vf", "scale=640:-2,crop=640:360,format=gray", "-frames:v", "1", join(mediaDir, "matte.png"));

const port = await new Promise((done) => {
  const s = createServer().listen(0, () => {
    const { port } = s.address();
    s.close(() => done(port));
  });
});
const server = spawn(process.execPath, ["server/main.ts"], { cwd: root, env: { ...process.env, PORT: String(port), COMFYTURE_DATA: dataDir, COMFY_API_KEY: "" }, stdio: "ignore" });
const base = `http://127.0.0.1:${port}`;
for (let i = 0; i < 100; i++) {
  if (await fetch(`${base}/api/spice-shots`).then((r) => r.ok, () => false)) break;
  await new Promise((r) => setTimeout(r, 200));
}
const upload = async (file) => (await fetch(`${base}/api/photos`, { method: "POST", headers: { "Content-Type": "image/png" }, body: await readFile(join(mediaDir, file)) })).json();
const matte = await upload("matte.png");

const PAID = /\/api\/(image|shots|reels|generate|paint|director|cutout|audio\/(music|sound)|utensils\/(upscale|cutout|upscale-video|sound)|cuts\/[\w-]+\/render|macaron\/(image|motion)|jam\/(listen|slice))(\?|$)/;

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ["--no-sandbox"] });
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  const paid = [];
  const runs = [];
  const outbound = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !/GL Driver|favicon|Failed to load resource/.test(m.text()) && errors.push(m.text()));
  await context.route((url) => !["127.0.0.1", "localhost"].includes(url.hostname), (route) => (outbound.push(route.request().url()), route.abort()));
  await context.route(PAID, (route) => (route.request().method() === "POST" ? (paid.push({ path: new URL(route.request().url()).pathname, body: route.request().postDataJSON?.() }), route.abort()) : route.continue()));
  // Comfy Cloud's templates, stood in for: Qwen Image Edit's form, its price, and a run that answers at once with a picture
  await page.route("**/api/utensils/templates/**", (route) => {
    const url = new URL(route.request().url());
    const [, , , , name, tail] = url.pathname.split("/");
    if (tail === "estimate") return route.fulfill({ json: { credits: 0, perUnit: null, note: "No partner credits." } });
    if (tail === "run") {
      runs.push({ name, body: route.request().postDataJSON() });
      return route.fulfill({ json: { id: `job-${runs.length}`, status: "done", progress: 1, outputs: [{ kind: "image", url: matte.url, file: matte.file, width: 640, height: 360 }] } });
    }
    if (!tail) return route.fulfill({ json: { name, title: name, schema: { slots: [{ id: "image", kind: "image", required: true, label: "image" }, { id: "prompt", kind: "text", label: "prompt" }], models: [], notes: [] } } });
    return route.continue();
  });
  // Roto's cut-out of a picture (the server's own SAM3 graph), stood in for: it answers at once with the matte
  await page.route("**/api/spice/matte-picture", (route) => {
    runs.push({ name: "spice/matte-picture", body: route.request().postDataJSON() });
    return route.fulfill({ status: 202, json: { id: "m1", status: "done", progress: 1, photo: { file: matte.file, url: matte.url, width: 640, height: 360 } } });
  });

  const js = (fn, arg) => page.evaluate(fn, arg);
  const settle = (ms = 350) => page.waitForTimeout(ms);
  const row = (d) => page.locator(`.sp-layer[data-dept="${d}"]`);
  const open = async (d) => {
    await row(d).locator(".sp-layer-main").click();
    await page.waitForSelector(`.sp-dept.is-${d}:not([hidden])`);
    await settle();
  };
  const shot = (name) => out && page.screenshot({ path: join(out, `${name}.png`) });
  const state = () => js(async () => {
    const { spice } = await import("/js/spice.js");
    const b = spice.shot.body;
    return { passes: Object.fromEntries(Object.entries(b.passes).map(([k, v]) => [k, v ? { url: v.media?.url, kind: v.media?.kind, file: v.media?.file, note: v.note, type: v.type, width: v.media?.width } : null])), set: b.set, log: b.log };
  });
  // (a pass is waited for by asking the page, every third of a second, for a minute and a half at most)
  const waitPass = async (dept, test = (p) => !!p) => {
    for (let i = 0; i < 270; i++) {
      if (test((await state()).passes[dept])) return true;
      await page.waitForTimeout(330);
    }
    return false;
  };
  const yes = async (key) => {
    await page.locator(key).click();
    await settle();
    await page.locator('.sp-primary[data-armed="1"]').click();
  };

  // ---- a new shot, the picture its footage
  await page.goto(`${base}/#/spice`, { waitUntil: "networkidle" });
  await page.waitForSelector(".sp-stack .sp-layer", { timeout: 30000 });
  const pic = await upload("picture.png");
  await js(async (p) => {
    const s = await import("/js/spice.js");
    if (s.spice.shot?.name !== "PIC010") await s.newShot("PIC010");
    const e = await import("/js/spice-engines.js");
    const blob = await (await fetch(p.url)).blob();
    await e.importFootage(new File([blob], "picture.png", { type: "image/png" }));
  }, pic);
  await settle(800);
  let st = await state();
  ok(st.passes.plate?.kind === "image", "a picture is the plate", JSON.stringify(st.passes.plate));
  const facts = (await page.locator(".sp-facts").innerText()).replace(/\s+/g, " ");
  ok(/A picture/.test(facts) && /640 × 360/.test(facts), "the facts say it is a picture and its size", facts);
  ok(await page.locator(".sp-picbar:not([hidden])").count() === 1 && /PICTURE · 640 × 360/.test(await page.locator(".sp-picbar").innerText()) && await page.locator(".sp-time[hidden]").count() === 1, "under the picture a quiet bar, not a timeline");
  ok(!(await page.locator('.sp-primary[data-key="plate:depth"]').isDisabled()), "its depth can be read");

  // ---- Roto: a click on the person, the cut-out asks first, then the picture's matte
  await open("roto");
  await page.locator(".sp-add-subject").click();
  await settle();
  const rs = await page.locator(".sp-stage").boundingBox();
  await page.mouse.click(rs.x + rs.width * 0.31, rs.y + rs.height * 0.55);
  await settle(500);
  ok(/Cut out/.test(await page.locator(".sp-out .sp-primary").innerText()), "the key cuts the subject out (a picture has nothing to track)", await page.locator(".sp-out .sp-primary").innerText());
  await yes(".sp-out .sp-primary");
  await waitPass("roto");
  st = await state();
  const cut = runs.find((r) => r.name === "spice/matte-picture");
  ok(cut && cut.body.picture === st.passes.plate.file && cut.body.positive.length === 1 && Math.abs(cut.body.positive[0].x - 198) < 8, "the cut-out is asked for the picture, with the click in its pixels", JSON.stringify(cut?.body));
  ok(st.passes.roto?.type === "matte" && st.passes.roto.kind === "image", "Roto's pass is the picture's matte");
  await shot("p-roto");

  // ---- Paint: a spot painted out for free; an object asks first and Qwen is told what to take out and what is left
  await open("paint");
  await page.locator('.sp-target-tile[data-how="brush"]').click();
  await settle();
  const ps = await page.locator(".sp-stage").boundingBox();
  await page.mouse.move(ps.x + ps.width * 0.8, ps.y + ps.height * 0.15);
  await page.mouse.down();
  await page.mouse.move(ps.x + ps.width * 0.9, ps.y + ps.height * 0.2, { steps: 5 });
  await page.mouse.up();
  await settle();
  await page.locator('.sp-primary[data-key="paint:run"]').click();
  await waitPass("paint", (p) => p?.note?.includes("ffmpeg"));
  st = await state();
  ok(st.passes.paint?.kind === "image" && /\.png$/.test(st.passes.paint.file), "the spot is painted out of the picture, free: a picture back", JSON.stringify(st.passes.paint));
  await page.locator('.sp-target-tile[data-how="describe"]').click();
  await settle();
  await page.locator(".sp-target .sp-words").fill("the desk lamp");
  await page.locator(".sp-target .sp-words").dispatchEvent("change");
  await page.locator(".sp-target .sp-after").fill("a bare brick wall");
  await page.locator(".sp-target .sp-after").dispatchEvent("change");
  await settle();
  const before = runs.length;
  await yes('.sp-primary[data-key="paint:run"]');
  await waitPass("paint", (p) => p?.note?.includes("Qwen"));
  const told = runs.slice(before).find((r) => r.name === "image_qwen_image_edit_2509")?.body.inputs ?? {};
  ok(/^Remove the desk lamp\. Fill the space with a bare brick wall\./.test(told.prompt ?? "") && told.image, "Qwen is told what to take out, and what is left", told.prompt);

  // ---- Light: the grade and the weather, free, a picture each
  await open("light");
  await page.locator('.sp-primary[data-key="light:grade"]').click();
  await waitPass("light", (p) => p?.note?.includes("ffmpeg"));
  st = await state();
  ok(st.passes.light?.kind === "image", "the grade is laid on the picture, free", JSON.stringify(st.passes.light));

  // ---- FX: a layer behind the person Roto holds, baked into a picture
  await open("fx");
  await page.locator('.sp-looks .sp-pill[data-look="storm"]').click();
  await settle(500);
  st = await state();
  ok(st.set.fx.layers.map((l) => l.el).join() === "lightning,rain" && st.set.fx.layers[0].behind === true, "a look lays its layers in one click, the lightning behind the person", JSON.stringify(st.set.fx.layers.map((l) => [l.el, l.behind])));
  await page.locator('.sp-lib-tile[data-el="spark-portal"]').click();
  await settle(600);
  st = await state();
  ok(st.set.fx.layers.at(-1)?.behind === true, "an element that likes to be behind the people is, now that Roto holds someone");
  // an AI layer on a picture: Qwen Image Edit is told the effect and where it is, after a yes; the layer keeps what comes back
  await page.locator('.sp-lib-tile[data-el="ai"]').click();
  await settle();
  await page.locator(".sp-b-look textarea.sp-words").fill("a glowing ring of blue fire");
  await page.locator(".sp-b-look textarea.sp-words").dispatchEvent("change");
  await settle();
  const runsBefore = runs.length;
  await yes(".sp-b-look .sp-primary");
  for (let i = 0; i < 60 && !(await state()).set.fx.layers.at(-1)?.media; i++) await page.waitForTimeout(300);
  st = await state();
  const qwen = runs.slice(runsBefore).find((r) => r.name === "image_qwen_image_edit_2509")?.body.inputs ?? {};
  ok(/^a glowing ring of blue fire\. The effect is /.test(qwen.prompt ?? "") && /Keep everything else/.test(qwen.prompt) && st.set.fx.layers.at(-1)?.media?.kind === "image", "an AI layer on a picture: Qwen is told the effect and where it is, and the layer keeps the picture that comes back", qwen.prompt?.slice(0, 90));
  await page.locator('.sp-primary[data-key="fx:bake"]').click();
  await waitPass("fx", (p) => p?.note?.includes("baked"));
  st = await state();
  ok(st.passes.fx?.kind === "image" && st.passes.fx.width === 640 && /\.jpg$/.test(st.passes.fx.file), "the layers are baked into a picture as big as the footage, a JPEG (the bake is the whole frame, never clear)", JSON.stringify(st.passes.fx));
  await shot("p-fx");

  // ---- FX: the light a layer casts, the rim it lights on the person, the shot's finish. First the pixels, drawn into canvases by the
  // compositor the viewer and the bake share (render), on the shot's footage and its matte (what the Paint stand-in made is a black and
  // white picture, so the picture itself is the base here): a layer behind the person with light makes the picture around it brighter
  // and the person's edge brighter; a bloom and a vignette change the frame
  const proof = await js(async (from) => {
    const { spice } = await import("/js/spice.js");
    const { render } = await import("/js/spice-layers.js");
    const { cleanLayer } = await import("/js/spice-elements.js");
    const { loadImage } = await import("/js/spice-bake.js");
    const b = spice.shot.body;
    const base = await loadImage(from.picture);
    const matte = await loadImage(from.matte);
    const portal = await loadImage("brand/spice/elements/spark-portal.webp");
    const w = base.naturalWidth;
    const h = base.naturalHeight;
    const canvas = () => Object.assign(document.createElement("canvas"), { width: w, height: h });
    const m = (() => { const c = canvas(); const g = c.getContext("2d"); g.drawImage(matte, 0, 0, w, h); return g.getImageData(0, 0, w, h).data; })();
    const white = (i) => m[i * 4] > 200;
    const black = (i) => m[i * 4] < 50;
    // the person: the middle of what is white, its edge (white with black within 5 pixels), its inside (none within 16), and the picture around it
    let sx = 0, sy = 0, n = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (white(y * w + x)) (sx += x, sy += y, n++);
    const cx = sx / n, cy = sy / n;
    const blackNear = (x, y, r) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && X < w && Y >= 0 && Y < h && black(Y * w + X)) return true; } return false; };
    const edge = [], inside = [], around = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (white(i)) { if (blackNear(x, y, 5)) edge.push(i); else if (!blackNear(x, y, 16)) inside.push(i); }
      else if (black(i) && Math.hypot(x - cx, y - cy) < 0.3 * w) around.push(i);
    }
    const dark = canvas();
    dark.getContext("2d").fillRect(0, 0, w, h);
    const draw = (layers, finish, over = base) => {
      const c = canvas();
      const g = c.getContext("2d");
      render(g, w, h, { base: over, matte, layers, frame: 1001, fps: 24, still: true, sourceOf: () => portal, edge: { feather: b.set.roto.feather, choke: b.set.roto.choke }, finish, footageWidth: w });
      return g.getImageData(0, 0, w, h).data;
    };
    const luma = (d, idx) => idx.reduce((s, i) => s + (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3, 0) / idx.length;
    const layer = (light, behind = true) => cleanLayer({ id: "t1", el: "spark-portal", x: cx / w, y: cy / h, scale: 0.7, behind, light });
    const same = (a, c) => { for (let i = 0; i < a.length; i++) if (a[i] !== c[i]) return false; return true; };
    const off = draw([layer(0)]);
    const lit = draw([layer(0.6)]);
    // (in front of the person the layer is drawn over them either way: only its light differs)
    const frontOff = draw([layer(0, false)]);
    const frontLit = draw([layer(0.6, false)]);
    const black0 = draw([layer(0)], undefined, dark);
    const black1 = draw([layer(0.6)], undefined, dark);
    const none = draw([]);
    const everything = [...Array(w * h).keys()];
    const bloom = draw([], { bloom: 0.8, vignette: 0 });
    const vignette = draw([], { bloom: 0, vignette: 0.8 });
    let biggest = 0;
    for (let i = 0; i < none.length; i += 4) biggest = Math.max(biggest, Math.abs(bloom[i] - none[i]), Math.abs(bloom[i + 1] - none[i + 1]), Math.abs(bloom[i + 2] - none[i + 2]));
    const patch = (d, x0, y0) => { const idx = []; for (let y = y0; y < y0 + 12; y++) for (let x = x0; x < x0 + 12; x++) idx.push(y * w + x); return luma(d, idx); };
    const corners = (d) => (patch(d, 0, 0) + patch(d, w - 12, 0) + patch(d, 0, h - 12) + patch(d, w - 12, h - 12)) / 4;
    return {
      people: { edge: edge.length, inside: inside.length, around: around.length },
      around: [luma(off, around), luma(lit, around)],
      edge: [luma(off, edge), luma(lit, edge)],
      inside: [luma(off, inside), luma(lit, inside)],
      insideFront: [luma(frontOff, inside), luma(frontLit, inside)],
      onBlack: { edge: [luma(black0, edge), luma(black1, edge)], inside: [luma(black0, inside), luma(black1, inside)] },
      pure: same(lit, draw([layer(0.6)])),
      // (a layer kept before there was any light has none: drawn as a layer with light 0)
      old: same(off, draw([{ ...layer(0), light: undefined, reach: undefined }])),
      bloom: { mean: [luma(none, everything), luma(bloom, everything)], biggest },
      vignette: { corners: [corners(none), corners(vignette)], middle: [patch(none, w / 2 - 6, h / 2 - 6), patch(vignette, w / 2 - 6, h / 2 - 6)] },
    };
  }, { picture: pic.url, matte: matte.url });
  const gain = (pair) => pair[1] - pair[0];
  ok(proof.people.edge > 500 && proof.people.inside > 500 && proof.people.around > 5000, "the person's edge, its inside and the picture around it are measured", JSON.stringify(proof.people));
  ok(gain(proof.around) > 10, "a layer behind the person with light makes the picture around it brighter", proof.around.map((v) => v.toFixed(1)).join(" → "));
  ok(gain(proof.edge) > 10 && gain(proof.edge) > gain(proof.inside), "and the person's edge brighter, more than the person's inside (the rim)", `edge ${proof.edge.map((v) => v.toFixed(1)).join(" → ")}, inside ${proof.inside.map((v) => v.toFixed(1)).join(" → ")}`);
  ok(gain(proof.onBlack.edge) > 25 && gain(proof.onBlack.edge) > 8 * gain(proof.onBlack.inside), "on a black picture the light behind lights the person's edge and hardly the person's inside", JSON.stringify(proof.onBlack));
  ok(gain(proof.insideFront) > 1.5 * gain(proof.inside), "the person gets much less of a light behind them on their face than of one in front of them", `behind +${gain(proof.inside).toFixed(1)}, in front +${gain(proof.insideFront).toFixed(1)}`);
  ok(proof.pure && proof.old, "a frame is the same every time, and a layer with no light is drawn as it was before there was any");
  ok(gain(proof.bloom.mean) >= 1 && proof.bloom.biggest >= 20, "a bloom brightens the bright parts of the frame and their surroundings", JSON.stringify(proof.bloom));
  ok(proof.vignette.corners[1] < 0.5 * proof.vignette.corners[0] && Math.abs(gain(proof.vignette.middle)) < 0.5, "a vignette darkens the corners and leaves the middle", JSON.stringify(proof.vignette));

  // Then the controls and the bake: a picture layer has a Light row (and a Reach row once it shines), the shot's Finish is in the library,
  // each change draws the viewer at once and makes the bake wait to be made again; the baked picture is the one the viewer showed
  const lookRows = async () => (await page.locator(".sp-b-look .sp-look-row .ut-label").allInnerTexts()).map((t) => t.trim().toLowerCase());
  const liveSum = () => js(() => {
    const c = document.querySelector("canvas.sp-live");
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let s = 0;
    for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2];
    return s;
  });
  /** A slider moved and let go, as a hand does. */
  const slide = (locator, value) => locator.evaluate((el, v) => { el.value = String(v); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); }, value);
  const bakeKey = () => page.locator('.sp-primary[data-key="fx:bake"]');
  const keyText = async () => (await bakeKey().innerText()).replace(/\s+/g, " ").trim();
  await page.locator('.sp-lib-tile[data-el="smoke"]').click();
  await settle(500);
  let labels = await lookRows();
  ok(labels.includes("light") && !labels.includes("reach"), "a layer that casts no light (smoke) has a Light row and no Reach row", labels.join());
  await page.locator('.sp-lib-tile[data-el="rain"]').click();
  await settle(400);
  labels = await lookRows();
  ok(!labels.includes("light") && !labels.includes("reach"), "particles have neither: only a picture shines", labels.join());
  const portalId = (await state()).set.fx.layers.find((l) => l.el === "spark-portal").id;
  await js(async (id) => (await import("/js/spice-fx-ops.js")).selectLayer(id), portalId);
  await settle(500);
  labels = await lookRows();
  let portal = (await state()).set.fx.layers.find((l) => l.id === portalId);
  ok(portal.light === 0.5 && portal.reach === 1.6 && labels.includes("light") && labels.includes("reach"), "a new portal starts with the light of its element, so its Reach row is there", `${portal.light} ${portal.reach} ${labels.join()}`);
  const lightRange = page.locator('.sp-b-look input.uf-range[aria-label="How much light it casts on the shot"]');
  const reachRange = page.locator('.sp-b-look input.uf-range[aria-label="How far its light reaches"]');
  ok((await lightRange.getAttribute("min")) === "0" && (await lightRange.getAttribute("max")) === "1" && (await reachRange.getAttribute("min")) === "0.3" && (await reachRange.getAttribute("max")) === "4", "Light goes from 0 to 1, Reach from 0.3 to 4");
  // (baked as it stands, then the light is changed: the viewer draws at once and the bake is made of other layers)
  await bakeKey().click();
  await waitPass("fx", (p) => p?.note?.includes("baked") && p.file !== st.passes.fx.file);
  st = await state();
  const baked1 = st.passes.fx;
  await settle(500);
  ok(/Baked/.test(await keyText()) && (await bakeKey().isDisabled()), "baked: the key says so", await keyText());
  const beforeLight = await liveSum();
  await slide(lightRange, 0.9);
  await settle(700);
  portal = (await state()).set.fx.layers.find((l) => l.id === portalId);
  ok(portal.light === 0.9, "Light sets the layer's light", String(portal.light));
  ok((await liveSum()) !== beforeLight, "the viewer draws the layer's new light at once");
  ok(/Bake again/.test(await keyText()) && !(await bakeKey().isDisabled()), "and the bake is of other layers: the key bakes again", await keyText());
  await slide(reachRange, 3);
  await settle(500);
  portal = (await state()).set.fx.layers.find((l) => l.id === portalId);
  ok(portal.reach === 3 && portal.light === 0.9, "Reach sets how far it reaches", String(portal.reach));
  await bakeKey().click();
  await waitPass("fx", (p) => p?.note?.includes("baked") && p.file !== baked1.file);
  st = await state();
  const baked2 = st.passes.fx;
  await settle(500);
  ok(/Baked/.test(await keyText()), "baked again", await keyText());
  // the finish is the shot's own: in the library, whatever layer is held
  const bloomRange = page.locator('.sp-lib-finish input.uf-range[aria-label="A soft glow around the bright parts of the whole shot"]');
  const vignetteRange = page.locator('.sp-lib-finish input.uf-range[aria-label="Darker corners over the whole shot"]');
  ok((await bloomRange.count()) === 1 && (await vignetteRange.count()) === 1 && (await bloomRange.inputValue()) === "0" && (await vignetteRange.inputValue()) === "0", "the shot's Finish has a Bloom and a Vignette, none to begin with");
  const beforeBloom = await liveSum();
  await slide(bloomRange, 0.6);
  await settle(700);
  st = await state();
  ok(st.set.fx.finish?.bloom === 0.6 && st.set.fx.finish.vignette === 0, "Bloom sets the shot's bloom", JSON.stringify(st.set.fx.finish));
  ok((await liveSum()) !== beforeBloom, "the viewer draws the bloom at once");
  ok(/Bake again/.test(await keyText()), "and the bake waits to be made again", await keyText());
  const beforeVignette = await liveSum();
  await slide(vignetteRange, 0.7);
  await settle(700);
  st = await state();
  ok(st.set.fx.finish.bloom === 0.6 && st.set.fx.finish.vignette === 0.7 && (await liveSum()) < beforeVignette, "Vignette sets the shot's vignette, and the viewer is darker for it", JSON.stringify(st.set.fx.finish));
  // (it can be undone like a layer: one step is the vignette)
  await page.locator('.sp-fxls-head .sp-iconkey[aria-label="Undo (Ctrl+Z)"]').click();
  await settle(600);
  st = await state();
  ok(st.set.fx.finish.bloom === 0.6 && st.set.fx.finish.vignette === 0, "Undo takes the vignette away and keeps the bloom", JSON.stringify(st.set.fx.finish));
  await page.locator('.sp-fxls-head .sp-iconkey[aria-label="Redo (Ctrl+Shift+Z)"]').click();
  await settle(600);
  st = await state();
  ok(st.set.fx.finish.vignette === 0.7, "and Redo puts it back", JSON.stringify(st.set.fx.finish));
  // the bake carries it: the picture baked now has dark corners the one before had not
  await bakeKey().click();
  await waitPass("fx", (p) => p?.note?.includes("baked") && p.file !== baked2.file);
  st = await state();
  const baked3 = st.passes.fx;
  const corners = await js(async ([a, c]) => {
    const { loadImage } = await import("/js/spice-bake.js");
    const read = async (url) => {
      const img = await loadImage(url);
      const cv = document.createElement("canvas");
      cv.width = img.naturalWidth;
      cv.height = img.naturalHeight;
      const g = cv.getContext("2d");
      g.drawImage(img, 0, 0);
      const px = (x, y) => [...g.getImageData(x, y, 12, 12).data].reduce((s, v, i) => s + (i % 4 < 3 ? v : 0), 0) / (12 * 12 * 3);
      return (px(0, 0) + px(cv.width - 12, 0) + px(0, cv.height - 12) + px(cv.width - 12, cv.height - 12)) / 4;
    };
    return [await read(a), await read(c)];
  }, [baked2.url, baked3.url]);
  ok(corners[1] < 0.75 * corners[0], "the baked picture is the one the viewer showed: its corners are darker once the vignette is on", corners.map((v) => v.toFixed(1)).join(" → "));
  // a bake made before there was any light or finish is still its layers: signed as it was, nothing to bake again
  const old = await js(async () => {
    const ops = await import("/js/spice-fx-ops.js");
    const { spice } = await import("/js/spice.js");
    const { fxPending } = await import("/js/spice-fx.js");
    const { cleanLayer } = await import("/js/spice-elements.js");
    const { fxGround } = await import("/js/spice-engines.js");
    const b = spice.shot.body;
    for (const l of [...ops.layersOf()]) ops.patchLayer(l.id, { light: 0 });
    ops.setFinish({ bloom: 0, vignette: 0 });
    const g = fxGround(b);
    const layers = ops.layersOf().filter((l) => l.eye !== false && (l.el !== "ai" || l.media)).map((l) => { const c = cleanLayer(l); delete c.light; delete c.reach; return c; });
    b.set.fx.baked = JSON.stringify([layers, g.base?.url, g.matte?.url, b.range, b.set.roto.feather, b.set.roto.choke]);
    b.set.fx.dirty = false;
    return fxPending();
  });
  ok(old.layers > 0 && old.pending === false, "a bake signed before there was any light or finish is still the layers: nothing to bake again", JSON.stringify(old));

  // ---- Comp: no slow motion for a picture; the upscale asks first and is refused here; the export is a WebP
  await open("comp");
  ok(await page.locator(".sp-finish.is-still").count() === 1, "a picture has no motion to slow: no key that cannot be pressed");
  await page.locator(".sp-b-export .uf-chip", { hasText: "WebP" }).click();
  await settle();
  await page.locator('.sp-primary[data-key="comp:export"]').click();
  await page.waitForSelector(".sp-download", { timeout: 60000 });
  st = await state();
  ok(/\.webp$/.test(await page.locator(".sp-download").getAttribute("download")) && st.passes.comp?.kind === "image", "the export is a WebP of the picture, and is the comp", JSON.stringify(st.passes.comp));
  const paidBefore = paid.length;
  await yes('.sp-primary[data-key="comp:upscale"]');
  await page.waitForTimeout(1500);
  ok(paid.length === paidBefore + 1 && paid.at(-1).path === "/api/utensils/upscale" && paid.at(-1).body.scale === 2, "the upscale of a picture asks first, then sends the picture to be made twice as large", JSON.stringify(paid.at(-1)));
  await shot("p-comp");

  ok(st.log.every((e) => typeof e.credits === "number"), "what was spent is in the ledger");
  ok(errors.length === 0, "no page errors", errors.join(" | ").slice(0, 300));
  ok(outbound.length === 0, "nothing left this machine", outbound.slice(0, 2).join(" "));
} finally {
  await browser.close();
  server.kill();
}
console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);
