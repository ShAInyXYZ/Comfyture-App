// Spice in a real browser, end to end, on a server of its own and a folder of its own: the page (Paprika's comp stack on the left with the six
// departments from the plate at the foot to the comp on top, each a row with its picture, its lamp and its eye; the shot chip; the facts of
// the shot), the footage imported by drop and kept with its frame rate, every department's bento grid fitting the screen at three sizes with
// no scroll, the viewer (the wipe dragged, the frame counter and the transport, the timeline's bars, Roto's rubylith and clicks, Paint's brush),
// a bento opening as a window, and the work itself: the free passes run for real on this machine (sparks, weather, grade, a spot painted out,
// slow motion, an export); the paid ones ask first (the first press only asks, a second one sends, once) and are stood in for here, so no
// credit is ever spent: Comfy Cloud's templates answer from this test, LTX's shot is refused by the browser and counted. Then Paprika's
// answers (stood in for: no key), her setting-up and her yes; the shots kept across a reload.
// Not part of `node --test` (it needs a browser and ffmpeg). From the repo root:
//   NODE_PATH=<a node_modules that has playwright> CHROME=<chrome or chromium binary> node tests/spice.browser.mjs
// OUT=<folder> keeps screenshots of every department, to be looked at.
import { spawn, execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const root = resolve(import.meta.dirname, "..");
const out = process.env.OUT ? resolve(process.env.OUT) : null;
if (out) await mkdir(out, { recursive: true });
const dataDir = await mkdtemp(join(tmpdir(), "spice-data-"));
const mediaDir = await mkdtemp(join(tmpdir(), "spice-media-"));
let failures = 0;
const ok = (cond, msg, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${msg}${extra ? `  ${extra}` : ""}`);
  if (!cond) failures++;
};

// the footage and a matte, made here: five seconds of colour bars at 24 fps, and a white ellipse on black
const ff = (...args) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args]);
ff("-f", "lavfi", "-i", "testsrc2=s=640x360:r=24:d=5", "-pix_fmt", "yuv420p", join(mediaDir, "plate.mp4"));
ff("-f", "lavfi", "-i", "color=c=black:s=640x360:d=5:r=24,format=gray,geq=lum='if(lt(pow((X-320)/120,2)+pow((Y-200)/150,2),1),255,0)'", "-pix_fmt", "yuv420p", join(mediaDir, "matte.mp4"));

const port = await new Promise((done) => {
  const s = createServer().listen(0, () => {
    const { port } = s.address();
    s.close(() => done(port));
  });
});
// no Comfy and no key: Spice's free passes need neither, and the paid ones are stood in for in the browser
const server = spawn(process.execPath, ["server/main.ts"], { cwd: root, env: { ...process.env, PORT: String(port), COMFYTURE_DATA: dataDir, COMFY_API_KEY: "" }, stdio: "ignore" });
const base = `http://127.0.0.1:${port}`;
for (let i = 0; i < 100; i++) {
  if (await fetch(`${base}/api/spice-shots`).then((r) => r.ok, () => false)) break;
  await new Promise((r) => setTimeout(r, 200));
}
const caps = await (await fetch(`${base}/api/utensils/fx/capabilities`)).json().catch(() => ({}));
// the matte as the library keeps it: what a Cloud template would answer with
const matte = await (await fetch(`${base}/api/videos`, { method: "POST", headers: { "Content-Type": "video/mp4" }, body: await readFile(join(mediaDir, "matte.mp4")) })).json();

// everything that would spend credits: a request for it is refused by the browser and counted
const PAID = /\/api\/(image|shots|reels|generate|paint|director|cutout|audio\/(music|sound)|utensils\/(upscale|cutout|upscale-video|sound)|cuts\/[\w-]+\/render|macaron\/(image|motion)|jam\/(listen|slice))(\?|$)/;

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ["--no-sandbox"] });
try {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1200 } });
  const page = await context.newPage();
  const errors = [];
  const paid = [];
  const runs = [];
  const outbound = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !/GL Driver|favicon|Failed to load resource/.test(m.text()) && errors.push(m.text()));
  await context.route((url) => !["127.0.0.1", "localhost"].includes(url.hostname), (route) => (outbound.push(route.request().url()), route.abort()));
  await context.route(PAID, (route) => (route.request().method() === "POST" ? (paid.push({ path: new URL(route.request().url()).pathname, body: route.request().postDataJSON?.() }), route.abort()) : route.continue()));

  // Comfy Cloud's templates, stood in for: the form of each, its price, and a run that answers at once with the matte
  const FORMS = {
    utility_video_segment_sam3: [["video", "video", true], ["prompt", "text"], ["positive_coords", "text"], ["negative", "text"], ["threshold", "number"]],
    api_bria_video_green_screen: [["video", "video", true]],
    utility_void_video_inpainting: [["source_video", "video", true], ["positive_prompt_inpaint_fill_", "text"], ["negative", "text"], ["sam3_object_mask_prompt", "text"], ["width_pass_2_", "number"], ["height_pass_2_", "number"], ["clip_duration_seconds_", "number"]],
    template_ltx2_3_remove_watermark_from_video: [["video", "video", true]],
    api_beeble_switchx_video_edit: [["video", "video", true], ["image", "image", true], ["prompt", "text"]],
    utility_depth_anything3_video_depth_estimation: [["video", "video", true]],
  };
  await page.route("**/api/utensils/templates/**", (route) => {
    const url = new URL(route.request().url());
    const [, , , , name, tail] = url.pathname.split("/");
    if (tail === "estimate") return route.fulfill({ json: name === "api_beeble_switchx_video_edit" ? { credits: 40, perUnit: null, note: "" } : { credits: 0, perUnit: null, note: "No partner credits." } });
    if (tail === "run") {
      runs.push({ name, body: route.request().postDataJSON() });
      return route.fulfill({ json: { id: `job-${runs.length}`, status: "done", progress: 1, outputs: [{ kind: "video", url: matte.url, file: matte.file, width: matte.width, height: matte.height, seconds: matte.duration }] } });
    }
    if (!tail && FORMS[name]) return route.fulfill({ json: { name, title: name, schema: { slots: FORMS[name].map(([id, kind, required]) => ({ id, kind, required: !!required, label: id })), models: [], notes: [] } } });
    return route.continue();
  });
  // Roto's tracker (the server's own SAM3 graph), stood in for: it answers at once with the matte, and what it was asked is kept with the runs
  await page.route("**/api/spice/matte", (route) => {
    runs.push({ name: "spice/matte", body: route.request().postDataJSON() });
    return route.fulfill({ status: 202, json: { id: `matte-${runs.length}`, status: "done", progress: 1, video: { file: matte.file, url: matte.url, width: matte.width, height: matte.height, duration: matte.duration } } });
  });
  // Paprika's answers, stood in for: each is the next of the queue, and what she was asked is kept
  const asked = [];
  const queue = [];
  await page.route("**/api/spice/assist", (route) => (asked.push(route.request().postDataJSON()), route.fulfill({ json: queue.shift() ?? { reply: "Fine.", actions: [] } })));

  const js = (fn, arg) => page.evaluate(fn, arg);
  // the page draws on the next frame after a change: what is read after a click is read after it
  const settle = (ms = 350) => page.waitForTimeout(ms);
  const row = (d) => page.locator(`.sp-layer[data-dept="${d}"]`);
  const open = async (d) => {
    await row(d).locator(".sp-layer-main").click();
    await page.waitForSelector(`.sp-dept.is-${d}:not([hidden])`);
    await page.waitForTimeout(350);
  };
  const shot = (name) => out && page.screenshot({ path: join(out, `${name}.png`) });
  const scrolls = () => js(() => ({ v: document.documentElement.scrollHeight - innerHeight, h: document.documentElement.scrollWidth - innerWidth }));
  const state = () => js(async () => {
    const { spice } = await import("/js/spice.js");
    const b = spice.shot.body;
    return { name: spice.shot.name, dept: spice.dept, passes: Object.fromEntries(Object.entries(b.passes).map(([k, v]) => [k, v ? { url: v.media?.url, kind: v.media?.kind, seconds: v.media?.seconds, from: v.from, to: v.to, note: v.note, eye: v.eye, type: v.type } : null])), set: b.set, range: b.range, log: b.log, frame: spice.frame, depth: !!b.depth };
  });

  // ---- the page: the stack, the shot chip, the facts
  await page.goto(`${base}/#/spice`, { waitUntil: "networkidle" });
  await page.waitForSelector(".sp-stack .sp-layer", { timeout: 30000 });
  await page.waitForTimeout(800);
  ok(await page.locator('.products .product[aria-current="page"] span').innerText() === "Spice", "Spice is lit in the top bar");
  ok((await js(() => [...document.querySelectorAll(".products .product span")].map((s) => s.textContent))).join() === "Kitchen,Mixer,Jam,Macaron,Spice,Utensils", "six products, Spice between Macaron and Utensils");
  ok((await page.locator(".sp-layer").evaluateAll((l) => l.map((x) => x.dataset.dept))).join() === "comp,fx,light,paint,roto,plate", "the stack is drawn from the top: the comp on top, the plate at the foot");
  ok((await page.locator(".sp-id-text").innerText()).replace(/\s+/g, " ").includes("Paprika · VFX house"), "Paprika and her house are at the top of the panel");
  // a first visit finds the example shots (spice/examples), the newest open, its passes made
  const examples = await js(async () => {
    const { spice } = await import("/js/spice.js");
    const b = spice.shot.body;
    return { names: spice.list.map((x) => x.name), open: spice.shot.name, done: Object.values(b.passes).filter((p) => p?.media).length, roto: b.passes.roto?.type, subject: !!b.set.roto.subjects[0]?.media, fx: b.passes.fx?.to - b.passes.fx?.from + 1, plate: b.passes.plate?.to - b.passes.plate?.from + 1 };
  });
  ok(examples.names.includes("Rooftop explosion") && examples.names.includes("Neon street portal") && examples.done >= 4, "the example shots are there on a first visit, one open with its passes", JSON.stringify(examples));
  ok(examples.roto === "matte" && examples.subject && examples.fx === examples.plate, "its Roto pass is its subject's matte, and its effect is laid into every frame of the shot", JSON.stringify(examples));
  ok((await page.locator(".sp-about-link").getAttribute("href")) === "#/utensils" && /nothing is overwritten/.test(await page.locator(".sp-about").innerText()), "the panel says what Spice is for, and points a quick fix to Utensils");
  // a new shot of the person's own starts empty
  await js(async () => (await import("/js/spice.js")).newShot());
  await page.waitForTimeout(800);
  ok(/SH010/.test(await page.locator(".sp-shotchip").innerText()), "a new shot is made at once, named SH010");
  ok((await page.locator(".sp-lamp[data-tone='done']").count()) === 0 && (await page.locator(".sp-lamp[data-tone='empty']").count()) === 6, "six hollow lamps before any footage");
  ok((await page.locator(".sp-facts").innerText()).includes("0 / 6"), "the facts count the passes done");
  const bar = await js(() => ({ pet: document.getElementById("assistant").dataset.pet, src: document.querySelector("#assistant .pet-face img").getAttribute("src"), docked: document.getElementById("assistant").parentElement.id, ph: document.querySelector("#assistant .chat-input").dataset.placeholder, h: document.querySelector("#assistant .chat-bar").getBoundingClientRect().height }));
  ok(bar.pet === "paprika" && bar.src === "brand/cast/paprika-face.webp" && bar.docked === "spice-chat", "Paprika's bar is docked at the foot of the page");
  ok(bar.ph.startsWith("Ask Paprika — ") && bar.h >= 56 && bar.h <= 72, "it asks her by name, in one row", bar.ph);
  await shot("0-empty");
  ok((await page.locator(".sp-stage.is-empty .sp-drop").count()) === 1, "the viewer asks for the footage");

  // ---- the footage: a clip dropped (the file chooser stands in for the drop), read for its frame rate
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.locator(".sp-drop").click()]);
  await chooser.setFiles(join(mediaDir, "plate.mp4"));
  await page.waitForFunction(() => document.querySelector(".sp-stage:not(.is-empty)") && document.querySelector('.sp-layer[data-dept="plate"] .sp-lamp[data-tone="done"]'), null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  let st = await state();
  ok(st.passes.plate?.kind === "video" && st.passes.plate.from === 1001 && st.passes.plate.to === 1120, "the footage is the plate: 120 frames, 1001 to 1120", JSON.stringify(st.passes.plate));
  const facts = (await page.locator(".sp-facts").innerText()).replace(/\s+/g, " ");
  ok(facts.includes("1001 – 1120") && facts.includes("640 × 360 · 24 fps") && facts.includes("1 / 6"), "the facts say the frame range, the size and rate, the passes done", facts);
  ok(await page.locator(".sp-counter").innerText() === "1001", "the counter is on the first frame");
  ok((await js(() => document.querySelector(".sp-strip").style.backgroundImage)).includes("/media/edits/strips/"), "the timeline has the footage's frames");
  ok((await page.locator(".sp-row").count()) === 6 && (await page.locator('.sp-row[data-dept="plate"] .sp-bar').count()) === 1, "one row for each department, and the plate's bar spans the footage");
  await shot("1-plate");

  // ---- the transport and the wipe
  await page.locator('.sp-transport .sp-iconkey[aria-label="Next frame (Right)"]').click();
  await page.locator('.sp-transport .sp-iconkey[aria-label="Next frame (Right)"]').click();
  ok(await page.locator(".sp-counter").innerText() === "1003", "the next frame key steps the counter");
  await page.locator('.sp-transport .sp-iconkey[aria-label="Last frame"]').click();
  ok(await page.locator(".sp-counter").innerText() === "1120", "the last frame key goes to 1120");
  await page.locator(".sp-scrub").click({ position: { x: 1, y: 5 } });
  ok(await page.locator(".sp-counter").innerText() === "1001", "a click at the start of the timeline is the first frame");

  // ---- every department's grid fits the screen at three sizes, with no scroll of the page or of its main cards
  for (const [w, h] of [[1920, 1200], [1600, 1000], [1440, 900]]) {
    await page.setViewportSize({ width: w, height: h });
    for (const d of ["plate", "roto", "paint", "light", "fx", "comp"]) {
      await open(d);
      const r = await js(() => {
        const dept = document.querySelector(".sp-dept:not([hidden])");
        const bentos = [...dept.querySelectorAll(".sp-bento")].map((b) => b.getBoundingClientRect());
        const chat = document.querySelector("#assistant .composer").getBoundingClientRect();
        return { doc: [document.documentElement.scrollHeight - innerHeight, document.documentElement.scrollWidth - innerWidth], below: Math.max(...bentos.map((b) => b.bottom)) - chat.top, side: document.querySelector(".sp-side").scrollHeight - document.querySelector(".sp-side").clientHeight };
      });
      ok(r.doc[0] <= 1 && r.doc[1] <= 1 && r.below <= 1 && r.side <= 1, `${w}x${h}: ${d} fills the screen down to the chat bar, nothing scrolls`, JSON.stringify(r));
    }
  }
  await page.setViewportSize({ width: 1920, height: 1200 });
  await open("fx");

  // ---- Fx: a compositor. A tile dropped on the picture is a layer where it fell; its handles move, scale and turn it; its look changes
  // live; the layers bake for free; an AI layer asks first and sends one LTX shot
  ok((await page.locator(".sp-lib-tile").count()) === 27, "the library has its twenty-one elements, five particles and the AI tile");
  await page.locator(".sp-lib-groups .sp-pill", { hasText: "Fire" }).click();
  await settle();
  ok((await page.locator(".sp-lib-tile").count()) === 8, "a group shows its own, and the AI tile");
  await page.locator(".sp-lib-groups .sp-pill", { hasText: "All" }).click();
  await settle();
  ok(await page.locator('.sp-primary[data-key="fx:bake"]').isDisabled(), "with no layer, nothing to bake");
  const fxStage = await page.locator(".sp-stage").boundingBox();
  await page.locator('.sp-lib-tile[data-el="flame"]').dragTo(page.locator(".sp-stage"), { targetPosition: { x: fxStage.width * 0.3, y: fxStage.height * 0.6 } });
  await settle(600);
  st = await state();
  let flame = st.set.fx.layers.at(-1);
  ok(st.set.fx.layers.length === 1 && flame?.el === "flame" && Math.abs(flame.x - 0.3) < 0.03 && Math.abs(flame.y - 0.6) < 0.03 && st.set.fx.sel === flame.id, "a tile dropped on the picture is a layer where it fell, held", JSON.stringify(flame));
  ok(await page.locator(".sp-gizmo:not([hidden])").count() === 1 && (await page.locator(".sp-gz-name").innerText()) === "FLAME", "its handles are on the picture, with its name");
  // the live composite: the flame lightens the picture where it is
  const lit = () => js(() => {
    const c = document.querySelector(".sp-live");
    const g = c.getContext("2d");
    const at = (x, y) => { const d = g.getImageData(Math.round(x * c.width), Math.round(y * c.height), 1, 1).data; return d[0] + d[1] + d[2]; };
    return { flame: at(0.3, 0.6), far: at(0.85, 0.15), w: c.width };
  });
  const l1 = await lit();
  ok(l1.w > 100 && l1.flame > 200, "the viewer draws the flame live over the footage", JSON.stringify(l1));
  // its handles: moved, scaled by a corner, turned by the knob
  const gz = await page.locator(".sp-gizmo").boundingBox();
  await page.mouse.move(gz.x + gz.width / 2, gz.y + gz.height / 2);
  await page.mouse.down();
  await page.mouse.move(gz.x + gz.width / 2 + fxStage.width * 0.2, gz.y + gz.height / 2, { steps: 6 });
  await page.mouse.up();
  await settle();
  const se = await page.locator(".sp-gz-corner.is-se").boundingBox();
  await page.mouse.move(se.x + se.width / 2, se.y + se.height / 2);
  await page.mouse.down();
  await page.mouse.move(se.x + 40, se.y + 40, { steps: 6 });
  await page.mouse.up();
  await settle();
  const knob = await page.locator(".sp-gz-rot").boundingBox();
  const g2 = await page.locator(".sp-gizmo").boundingBox();
  await page.mouse.move(knob.x + knob.width / 2, knob.y + knob.height / 2);
  await page.mouse.down();
  await page.mouse.move(g2.x + g2.width + 60, g2.y + g2.height / 2, { steps: 8 });
  await page.mouse.up();
  await settle();
  st = await state();
  const moved = st.set.fx.layers[0];
  ok(Math.abs(moved.x - 0.5) < 0.04 && moved.scale > flame.scale * 1.1 && moved.rot > 45, "dragged, it moves; by a corner, it grows; by its knob, it turns", JSON.stringify({ x: moved.x, scale: moved.scale, rot: moved.rot }));
  // the arrows nudge it, Escape lets go of it, a click on it holds it again
  await page.keyboard.press("ArrowLeft");
  await settle(500);
  ok((await state()).set.fx.layers[0].x < moved.x, "an arrow nudges it");
  // its look: a blend, a tint, a glow
  await page.locator(".sp-b-look .ut-seg", { hasText: "Add" }).click();
  await settle();
  await page.locator(".sp-b-look .sp-swatch").nth(5).click();
  await settle();
  st = await state();
  ok(st.set.fx.layers[0].blend === "add" && /^#[0-9a-f]{6}$/.test(st.set.fx.layers[0].tint), "its blend and its tint are chosen in Look", JSON.stringify(st.set.fx.layers[0]));
  // a second layer by a click, then the stack: hidden, put back, reordered
  await page.locator('.sp-lib-tile[data-el="rain"]').click();
  await settle();
  ok((await page.locator(".sp-fxl").count()) === 2 && (await page.locator(".sp-fxl").first().innerText()).includes("Rain"), "a click adds one in the middle, on top of the stack");
  await page.locator(".sp-fxl").first().locator('.sp-fxl-key[aria-label="Shown"]').click();
  await settle();
  ok((await state()).set.fx.layers[1].eye === false, "the eye hides a layer");
  await page.locator(".sp-fxl").first().locator('.sp-fxl-key[aria-label="Shown"]').click();
  await page.locator(".sp-fxl").nth(1).dragTo(page.locator(".sp-fxl").first());
  await settle();
  ok((await state()).set.fx.layers.map((l) => l.el).join() === "rain,flame", "a layer dragged on another takes its place in the stack");
  await shot("2-fx");
  // the bake: free, on this machine, the whole range
  ok(/Bake 2 layers/.test(await page.locator('.sp-primary[data-key="fx:bake"]').innerText()) && /free/.test(await page.locator('.sp-primary[data-key="fx:bake"]').innerText()), "the key bakes the two layers, free");
  await page.locator('.sp-primary[data-key="fx:bake"]').click();
  await page.waitForFunction(() => /Baked/.test(document.querySelector('.sp-primary[data-key="fx:bake"]')?.innerText ?? ""), null, { timeout: 120000 });
  st = await state();
  ok(st.passes.fx?.kind === "video" && st.passes.fx.from === 1001 && st.passes.fx.to === 1120 && paid.length === 0 && st.log.length === 0, "the layers are baked into the FX pass, on every frame, and nothing was sent", JSON.stringify(st.passes.fx));
  ok(Math.abs((st.passes.fx.seconds ?? 0) - 5) < 0.1, "a clip as long as the footage", String(st.passes.fx.seconds));
  // an AI layer: placed, described, its key asks first, then one LTX shot goes
  await page.locator('.sp-lib-tile[data-el="ai"]').click();
  await settle();
  await page.locator(".sp-b-look select.ut-select").selectOption("portal");
  await settle();
  ok(/Make it/.test(await page.locator('.sp-b-look .sp-primary').innerText()) && /≈ \d+ cr/.test(await page.locator('.sp-b-look .sp-primary').innerText()), "an AI layer's key says its price");
  await page.locator(".sp-b-look .sp-primary").click();
  await settle();
  ok(paid.length === 0 && (await page.locator('.sp-primary[data-armed="1"]').count()) === 1, "the first press only asks");
  await page.locator('.sp-primary[data-armed="1"]').click();
  await page.waitForFunction(() => document.querySelector(".toast:not([hidden])")?.textContent, null, { timeout: 30000 }).catch(() => {});
  ok(paid.length === 1 && paid[0].path === "/api/shots", "the second sends one LTX shot", paid.map((p) => p.path).join());
  const told = paid[0]?.body?.script?.shots?.[0]?.action ?? "";
  ok(/swirling ring of glowing orange energy/.test(told) && /The effect is /.test(told) && paid[0].body.start && paid[0].body.seconds >= 2, "told the portal's own words and where it is, from a frame of the footage", told.slice(0, 90));
  st = await state();
  ok(st.set.fx.layers.at(-1).el === "ai" && !st.set.fx.layers.at(-1).media && st.log.length === 0, "a shot that did not come back leaves the layer to make and no spend");
  // Delete takes the layer held away
  await page.locator(".sp-stage").hover();
  await page.keyboard.press("Delete");
  await settle();
  ok((await state()).set.fx.layers.length === 2, "Delete takes the layer held away");
  ok((await page.locator(".sp-rows.is-layers .sp-row.is-layer").count()) === 2, "on a clip, the timeline's rows are the layers, a bar each");
  await page.keyboard.press("Control+z");
  await settle();
  ok((await state()).set.fx.layers.length === 3, "Ctrl+Z puts it back");
  await page.keyboard.press("Control+Shift+z");
  await settle();
  ok((await state()).set.fx.layers.length === 2, "Ctrl+Shift+Z takes it away again");

  // ---- the viewer's wipe: dragged, and the stack's eye (in Comp: in FX the wipe comes with its compare key)
  await open("comp");
  const handle = await page.locator(".sp-wipe").boundingBox();
  const stage = await page.locator(".sp-stage").boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(stage.x + stage.width * 0.8, handle.y + 20, { steps: 6 });
  await page.mouse.up();
  const wipe = parseFloat(await js(() => document.querySelector(".sp-stage").style.getPropertyValue("--wipe")));
  ok(wipe > 70 && wipe < 90, "the wipe follows the pointer", `${wipe}%`);
  await row("fx").locator(".sp-eye").click();
  await page.waitForTimeout(300);
  ok((await state()).passes.fx.eye === false && (await row("fx").locator(".sp-eye").getAttribute("aria-pressed")) === "false" && (await page.locator(".sp-wipe:not([hidden])").count()) === 0, "the eye hides the pass: the viewer has nothing to wipe to");
  await row("fx").locator(".sp-eye").click();
  await page.waitForTimeout(300);

  // ---- windows: a bento opens one, Escape closes it
  await open("fx");
  await page.locator(".sp-b-look .sp-expand").click();
  await page.waitForSelector(".sp-win");
  ok((await page.locator(".sp-win h2").innerText()) === "LOOK" && (await page.locator(".sp-win .uf-range").count()) >= 3, "the expand key opens the bento's window");
  await shot("3-window");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.querySelector(".sp-winhost")?.hidden);
  await page.locator(".sp-b-library .sp-expand").click();
  await page.waitForSelector(".sp-win");
  ok((await page.locator(".sp-win .sp-lib-tile").count()) === 27, "the library's window has every tile, larger");
  await page.keyboard.press("Escape");

  // ---- Roto: a subject clicked, the points in the viewer, the paid tracking asks first and sends the name and the clicks
  await open("roto");
  await page.locator(".sp-add-subject").click();
  await settle();
  const rs = await page.locator(".sp-stage").boundingBox();
  await page.mouse.click(rs.x + rs.width * 0.5, rs.y + rs.height * 0.5);
  await page.waitForTimeout(500);
  await page.mouse.click(rs.x + rs.width * 0.52, rs.y + rs.height * 0.3);
  await page.keyboard.down("Shift");
  await page.mouse.click(rs.x + rs.width * 0.2, rs.y + rs.height * 0.8);
  await page.keyboard.up("Shift");
  await page.waitForTimeout(500);
  st = await state();
  const subject = st.set.roto.subjects[0];
  ok(st.set.roto.subjects.length === 1 && subject.points.length === 3 && subject.points.filter((p) => p.neg).length === 1, "clicking the viewer makes a subject, and its clicks: two on it and one that is not", JSON.stringify(subject?.points));
  ok((await page.locator(".sp-point").count()) === 3 && (await page.locator(".sp-point.is-neg").count()) === 1, "its clicks are drawn on the picture: green +, red −");
  ok(/Track subject/i.test(await page.locator('.sp-out .sp-primary').innerText()) || /Track/.test(await page.locator('.sp-out .sp-primary').innerText()), "the yellow key tracks it", await page.locator(".sp-out .sp-primary").innerText());
  await page.locator(".sp-subject-name").fill("Woman in raincoat");
  await page.locator(".sp-subject-name").dispatchEvent("change");
  await page.waitForTimeout(400);
  ok(runs.length === 0, "nothing was sent while it was only set up");
  await page.locator('.sp-out .sp-primary').click();
  await settle();
  ok(runs.length === 0 && (await page.locator('.sp-primary[data-armed="1"]').count()) === 1, "the first press of the tracking only asks");
  await page.locator('.sp-primary[data-armed="1"]').click();
  await page.waitForFunction(() => document.querySelector('.sp-layer[data-dept="roto"] .sp-lamp[data-tone="done"]'), null, { timeout: 30000 });
  ok(runs.length === 1 && runs[0].name === "spice/matte", "the second asks the tracker, once", runs.map((r) => r.name).join());
  const sent = runs[0].body;
  ok(sent.text === "Woman in raincoat" && sent.positive.length === 2 && sent.negative.length === 1 && sent.key === 0 && /\.mp4$/.test(sent.video), "with the subject's name, its clicks in pixels of the frame they were made on, and the footage", JSON.stringify(sent));
  const px = sent.positive[0];
  ok(px.x > 280 && px.x < 360 && px.y > 150 && px.y < 210, "the first click is in the footage's own pixels (640 × 360)", JSON.stringify(px));
  st = await state();
  ok(st.passes.roto?.url === matte.url && st.passes.roto.type === "matte", "the matte is Roto's pass");
  ok((await page.locator(".sp-subject .sp-lamp[data-tone='done']").count()) === 1 && (await page.locator(".sp-ruby:not([hidden])").count()) === 1, "its lamp is green and the footage is tinted red under the wipe");
  ok(/Pass to Paint/.test(await page.locator(".sp-out .sp-primary").innerText()), "the yellow key now passes the matte to Paint");
  await page.locator('.sp-out-tile[data-out="holdout"]').click();
  await page.waitForTimeout(300);
  ok((await state()).set.roto.out === "holdout", "the output is a choice of three: alpha, green screen, holdout");
  await page.locator('.sp-b-edge .uf-range').first().fill("6");
  await page.locator('.sp-b-edge .uf-range').first().dispatchEvent("change");
  await page.waitForTimeout(400);
  ok((await state()).set.roto.feather === 6 && (await js(() => document.querySelector(".sp-edge-defs feGaussianBlur").getAttribute("stdDeviation"))) !== "0", "the feather is kept and draws the matte's edge softer");
  await shot("4-roto");
  await page.locator('.sp-out-tile[data-out="green"]').click();
  await page.waitForTimeout(300);
  ok(/Key the green/.test(await page.locator(".sp-out .sp-primary").innerText()), "the green screen is keyed by its own template");
  await page.locator('.sp-out-tile[data-out="alpha"]').click();
  await page.locator(".sp-out .sp-primary").click();
  await page.waitForFunction(() => document.querySelector(".sp-dept.is-paint:not([hidden])"));
  ok(true, "Pass to Paint opens Paint");

  // ---- Paint: the brush paints a spot, the free removal runs for real; an object by its name asks first
  await page.locator('.sp-target-tile[data-how="describe"]').click();
  ok(await page.locator('.sp-primary[data-key="paint:run"]').isDisabled(), "an object needs its words: the key waits");
  await page.locator('.sp-target .sp-words').fill("the street sign");
  await page.locator('.sp-target .sp-words').dispatchEvent("change");
  await page.waitForTimeout(400);
  ok(!(await page.locator('.sp-primary[data-key="paint:run"]').isDisabled()) && /≈ \d+ cr/.test(await page.locator('.sp-primary[data-key="paint:run"]').innerText()), "with its words the key has its price");
  await page.locator('.sp-primary[data-key="paint:run"]').click();
  await settle();
  ok(runs.length === 1 && (await page.locator('.sp-primary[data-armed="1"]').count()) === 1, "and asks first");
  await page.locator('.sp-target .sp-after').fill("a bare brick wall");
  await page.locator('.sp-target .sp-after').dispatchEvent("change");
  await page.waitForTimeout(300);
  if (!(await page.locator('.sp-primary[data-armed="1"]').count())) {
    await page.locator('.sp-primary[data-key="paint:run"]').click();
    await settle();
  }
  await page.locator('.sp-primary[data-armed="1"]').click();
  await page.waitForFunction(() => document.querySelector('.sp-layer[data-dept="paint"] .sp-lamp[data-tone="done"]'), null, { timeout: 30000 });
  const voidSent = runs[1]?.body.inputs ?? {};
  ok(runs.length === 2 && runs[1].name === "utility_void_video_inpainting", "the yes sends VOID, once", runs.map((r) => r.name).join());
  ok(voidSent.sam3_object_mask_prompt === "the street sign" && voidSent.positive_prompt_inpaint_fill_ === "a bare brick wall" && voidSent.width_pass_2_ === 672 && voidSent.height_pass_2_ === 384 && voidSent.clip_duration_seconds_ >= 1 && voidSent.clip_duration_seconds_ <= 5 && voidSent.source_video,
    "VOID is told the object to find and what is left, at its own size in the footage's shape, over the whole clip", JSON.stringify(voidSent));
  await page.locator('.sp-target-tile[data-how="brush"]').click();
  await settle();
  ok(await page.locator('.sp-primary[data-key="paint:run"]').isDisabled(), "a spot needs its brush first");
  const ps = await page.locator(".sp-stage").boundingBox();
  await page.mouse.move(ps.x + ps.width * 0.1, ps.y + ps.height * 0.15);
  await page.mouse.down();
  await page.mouse.move(ps.x + ps.width * 0.2, ps.y + ps.height * 0.2, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  ok(!(await page.locator('.sp-primary[data-key="paint:run"]').isDisabled()) && !/cr/.test(await page.locator('.sp-primary[data-key="paint:run"]').innerText()), "once there is a spot, the free key is lit and has no price");
  await shot("5-paint");
  if (caps.unlogo !== false) {
    await page.locator('.sp-primary[data-key="paint:run"]').click();
    // (the lamp is already green from VOID's pass: the spot's own pass is waited for)
    for (let i = 0; i < 180 && !/ffmpeg/.test((await state()).passes.paint?.note ?? ""); i++) await page.waitForTimeout(500);
    st = await state();
    ok(st.passes.paint?.kind === "video" && /ffmpeg/.test(st.passes.paint.note) && runs.length === 2, "the spot was painted out on this machine: the Paint pass is there, and nothing was sent", JSON.stringify(st.passes.paint));
  }

  // ---- Light: the free weather runs on the clean-up; the paid relight needs a picture and asks first
  await open("light");
  await page.locator('.sp-b-weather .uf-chip', { hasText: "Snow" }).click();
  await page.waitForTimeout(300);
  if (caps.weather !== false) {
    await page.locator('.sp-b-weather .sp-keys .sp-ghost').click();
    await page.waitForFunction(() => document.querySelector(".sp-chip.is-right")?.textContent.includes("Preview"), null, { timeout: 60000 });
    ok(/preview · 1 frame/i.test(await page.locator(".sp-chip.is-right").innerText()) && (await page.locator(".sp-wipe:not([hidden])").count()) === 1, "one real frame of the weather shows on the right of the wipe");
    await page.locator('.sp-primary[data-key="light:weather"]').click();
    await page.waitForFunction(() => document.querySelector('.sp-layer[data-dept="light"] .sp-lamp[data-tone="done"]'), null, { timeout: 90000 });
    st = await state();
    ok(st.passes.light?.kind === "video" && /snow/.test(st.passes.light.note) && runs.length === 2, "the weather ran on this machine: the Light pass is there", JSON.stringify(st.passes.light));
  }
  ok(await page.locator('.sp-primary[data-key="light:relight"]').isDisabled(), "a relight of a clip needs a picture of the light: the key waits");
  await shot("6-light");

  // ---- Comp: the ledger, the free slow motion and the export run for real
  await open("comp");
  ok((await page.locator(".sp-ledger-row").count()) >= 3, "the comp lists the passes it is made of");
  ok(/37|\d+ cr/.test(await page.locator(".sp-ledger-foot").innerText()), "and what the shot cost");
  await page.locator('.sp-b-export .uf-chip', { hasText: "WebM" }).click();
  await page.locator('.sp-primary[data-key="comp:export"]').click();
  await page.waitForSelector(".sp-download", { timeout: 120000 });
  st = await state();
  ok(/\.webm$/.test(await page.locator(".sp-download").getAttribute("download")) && st.set.comp.exports[0].format === "webm" && st.passes.comp?.url, "the export is a WebM in the library, with a download link, and is the comp's pass", JSON.stringify(st.set.comp.exports[0]));
  ok(paid.length === 1, "no paid request was made but the one LTX shot that was refused", paid.map((p) => p.path).join());
  await shot("7-comp");

  // ---- the shot is kept: after a reload every pass is where it was
  await page.waitForTimeout(900);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(".sp-stack .sp-layer", { timeout: 30000 });
  await page.waitForTimeout(800);
  const kept = await state();
  ok(kept.name === "SH010" && kept.passes.plate?.kind === "video" && kept.passes.roto?.type === "matte" && kept.passes.light && kept.passes.comp && kept.passes.fx && kept.set.fx.layers.length >= 2, "the shot, its passes, its layers and its settings come back after a reload", JSON.stringify(kept.set.fx.layers.map((l) => l.el)));
  ok((await page.locator(".sp-lamp[data-tone='done']").count()) >= 5, "the lamps are green again");
  const list = await (await fetch(`${base}/api/spice-shots`)).json();
  // (beside the two example shots, the person's own)
  const own = list["spice-shots"].find((x) => x.name === "SH010");
  ok(list["spice-shots"].length === 3 && own?.info.passes >= 5, "the server keeps it as a shot with its passes counted, beside the examples", JSON.stringify(own?.info));

  // ---- a second shot, switched to and back
  await page.locator(".sp-shotchip .sel-trigger").click();
  await page.getByRole("option", { name: "A new shot" }).click();
  await page.waitForFunction(() => document.querySelector(".sp-shotchip")?.textContent.includes("SH020"), null, { timeout: 15000 });
  ok((await page.locator(".sp-lamp[data-tone='done']").count()) === 0 && (await page.locator(".sp-stage.is-empty").count()) === 1, "a new shot is empty: SH020, no footage");
  await page.locator(".sp-shotchip .sel-trigger").click();
  await page.getByRole("option", { name: "SH010" }).click();
  await page.waitForFunction(() => document.querySelector('.sp-layer[data-dept="plate"] .sp-lamp[data-tone="done"]'), null, { timeout: 15000 });
  ok(true, "and SH010 comes back with its passes");

  // ---- Paprika: what she is told, what she sets up, the yes
  await open("fx");
  queue.push({ reply: "A portal behind her, from frame 1030.", actions: [{ op: "layer", element: "ai:portal", from: 1030, x: 0.7, y: 0.35, size: 0.6, behind: true }, { op: "run" }] });
  await page.locator("#assistant .chat-input").click();
  await page.keyboard.type("a portal behind her");
  await page.keyboard.press("Enter");
  await page.waitForSelector("#assistant .msg-confirm");
  const told2 = asked.at(-1)?.spice ?? {};
  ok(told2.department === "fx" && told2.shot === "SH010" && told2.footage?.last === 1120 && told2.passes?.some((p) => p.dept === "plate") && told2.run?.label, "she is told the department, the shot, the footage's frames, the passes and the key", JSON.stringify(told2).slice(0, 160));
  st = await state();
  const herLayer = st.set.fx.layers.at(-1);
  ok(herLayer?.el === "ai" && herLayer.preset === "portal" && herLayer.from === 1030 && herLayer.x === 0.7 && st.set.fx.sel === herLayer.id && herLayer.behind === true, "her setting-up is made at once: an AI portal layer, from 1030, where she said, behind the woman Roto holds", JSON.stringify(herLayer));
  const before = paid.length;
  ok(/Make it/.test(await page.locator("#assistant .msg-confirm").innerText()) && /≈ \d+ cr/.test(await page.locator("#assistant .msg-confirm").innerText()), "running is only offered, with its price", (await page.locator("#assistant .msg-confirm").innerText()).replace(/\s+/g, " "));
  ok(paid.length === before, "nothing was sent for her answer");
  await page.locator("#assistant .msg-confirm .is-primary").click();
  await page.waitForFunction((n) => true, before);
  await page.waitForTimeout(2500);
  ok(paid.length === before + 1 && paid.at(-1).path === "/api/shots", "the user's yes sends the shot, once", paid.map((p) => p.path).join());
  // opening a department, the shot trimmed, a subject
  queue.push({ reply: "Trimmed, and the woman is a subject.", actions: [{ op: "trim", in: 1010, out: 1100 }, { op: "subject", name: "the umbrella" }, { op: "open", department: "comp" }] });
  await page.locator("#assistant .chat-input").click();
  await page.keyboard.type("trim it and cut out the umbrella");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelector(".sp-dept.is-comp:not([hidden])"), null, { timeout: 15000 });
  st = await state();
  ok(st.range?.in === 1010 && st.range?.out === 1100 && st.set.roto.subjects.some((s) => s.name === "the umbrella") && st.dept === "comp", "she trims, adds a subject and opens a department");
  ok((await page.locator(".sp-facts").innerText()).includes("1010 – 1100"), "the facts show the new range");
  await shot("8-paprika");

  // ---- the range is respected: the engines take the footage cut to it (made once, kept with the plate), and what they make starts at its first frame
  const input = await js(async () => {
    const { inputFor, footage } = await import("/js/spice-engines.js");
    const { spice } = await import("/js/spice.js");
    const first = await inputFor("paint");
    const again = await footage();
    const plate = spice.shot.body.passes.plate;
    return { from: first.from, seconds: first.media.seconds, same: again.url === first.media.url, cut: plate.cut && [plate.cut.in, plate.cut.out], whole: plate.media.url !== first.media.url };
  });
  ok(input.from === 1010 && input.whole && input.same && input.cut?.join() === "1010,1100" && Math.abs(input.seconds - 91 / 24) < 0.3, "the footage is cut to the range once, kept with the plate, and its first frame is the range's", JSON.stringify(input));

  ok(errors.length === 0, "no page errors", errors.join(" | ").slice(0, 300));
  ok(outbound.length === 0, "nothing left this machine", outbound.slice(0, 2).join(" "));
} finally {
  await browser.close();
  server.kill();
}
console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);
