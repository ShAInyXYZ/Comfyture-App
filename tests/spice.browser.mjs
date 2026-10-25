// Spice in a real browser, end to end, on a server of its own and a folder of its own: the page (Paprika's comp stack on the left with the six
// departments from the plate at the foot to the comp on top, each a row with its picture, its lamp and its eye; the shot chip; the facts of
// the shot), the footage imported by drop and kept with its frame rate, every department's bento grid fitting the screen at three sizes with
// no scroll, the viewer (the wipe dragged, the frame counter and the transport, the timeline's bars, Roto's rubylith and clicks, Paint's brush),
// a bento opening as a window, and the work itself: the free passes run for real on this machine (sparks, weather, grade, a spot painted out,
// slow motion, an export); the paid ones ask first (the first press only asks, a second one sends, once) and are stood in for here, so no
// credit is ever spent: Comfy Cloud's templates answer from this test, LTX's shot is refused by the browser and counted. Then Paprika's
// answers (stood in for: no key), her setting-up and her yes; the shots kept across a reload. Last, a layer that follows Roto's subject, on a
// clip whose matte drifts across the frame: its handles and the pixels the compositor draws are on the subject at every frame.
// Not part of `node --test` (it needs a browser and ffmpeg). From the repo root:
//   NODE_PATH=<a node_modules that has playwright> CHROME=<chrome or chromium binary> node tests/spice.browser.mjs
// OUT=<folder> keeps screenshots of every department, to be looked at.
import { spawn, execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { tempDir } from "./tools/temp.mjs";

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const root = resolve(import.meta.dirname, "..");
const out = process.env.OUT ? resolve(process.env.OUT) : null;
if (out) await mkdir(out, { recursive: true });
const dataDir = tempDir("spice-data-");
const mediaDir = tempDir("spice-media-");
let failures = 0;
const ok = (cond, msg, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${msg}${extra ? `  ${extra}` : ""}`);
  if (!cond) failures++;
};

// the footage and its matte, from our own cast (examples/spice): Truffle at his workbench, five seconds at 24 fps pushed in slowly, and
// his matte pushed in the same way
const ff = (...args) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args]);
const truffle = join(root, "examples", "spice", "sh040-truffle");
const push = "scale=1280:-2,crop=1280:720,zoompan=z='1+0.05*on/119':x='iw*0.3*(1-1/zoom)':y='ih*0.5*(1-1/zoom)':d=120:s=640x360:fps=24";
ff("-loop", "1", "-i", join(truffle, "plate.jpg"), "-vf", `${push},format=yuv420p`, "-frames:v", "120", join(mediaDir, "plate.mp4"));
ff("-loop", "1", "-i", join(truffle, "roto.png"), "-vf", `${push},format=gray,format=yuv420p`, "-frames:v", "120", join(mediaDir, "matte.mp4"));
// and a slow motion of the footage as the free one makes it: twice the frames at the same rate (made here, not interpolated, to be quick)
ff("-i", join(mediaDir, "plate.mp4"), "-vf", "setpts=2*PTS,fps=24,format=yuv420p", join(mediaDir, "slow.mp4"));
// and a clip whose subject moves a long way, for a layer that follows it: a yellow block drifts across a dark frame (up and down a little
// too), three seconds at 24 fps, and its matte is the same block in white
const drift = "overlay=x='60+t*150':y='100+40*sin(t*2)':shortest=1";
ff("-f", "lavfi", "-i", "color=c=0x203040:s=640x360:r=24:d=3", "-f", "lavfi", "-i", "color=c=0xf2c14e:s=96x150:r=24:d=3", "-filter_complex", `[0][1]${drift},format=yuv420p`, "-frames:v", "72", join(mediaDir, "drift.mp4"));
ff("-f", "lavfi", "-i", "color=c=black:s=640x360:r=24:d=3", "-f", "lavfi", "-i", "color=c=white:s=96x150:r=24:d=3", "-filter_complex", `[0][1]${drift},format=gray,format=yuv420p`, "-frames:v", "72", join(mediaDir, "drift-matte.mp4"));

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
const slowClip = await (await fetch(`${base}/api/videos`, { method: "POST", headers: { "Content-Type": "video/mp4" }, body: await readFile(join(mediaDir, "slow.mp4")) })).json();
const driftClip = await (await fetch(`${base}/api/videos`, { method: "POST", headers: { "Content-Type": "video/mp4" }, body: await readFile(join(mediaDir, "drift.mp4")) })).json();
const driftMatte = await (await fetch(`${base}/api/videos`, { method: "POST", headers: { "Content-Type": "video/mp4" }, body: await readFile(join(mediaDir, "drift-matte.mp4")) })).json();

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
  ok((await js(() => [...document.querySelectorAll(".products .product span")].map((s) => s.textContent))).join() === "Kitchen,Mixer,Jam,Macaron,Spice,Toaster,Utensils", "seven products, Spice between Macaron and Toaster");
  ok((await page.locator(".sp-layer").evaluateAll((l) => l.map((x) => x.dataset.dept))).join() === "comp,fx,light,paint,roto,plate", "the stack is drawn from the top: the comp on top, the plate at the foot");
  ok((await page.locator(".sp-id-text").innerText()).replace(/\s+/g, " ").includes("Paprika · VFX house"), "Paprika and her house are at the top of the panel");
  // a first visit finds the example shots (examples/spice), the newest open, its passes made: the great jam chase, a real take through
  // all six departments
  const examples = await js(async () => {
    const { spice } = await import("/js/spice.js");
    const b = spice.shot.body;
    return { names: spice.list.map((x) => x.name), open: spice.shot.name, kind: b.passes.plate?.media.kind, done: Object.values(b.passes).filter((p) => p?.media).length, roto: b.passes.roto?.type, subject: !!b.set.roto.subjects[0]?.media, fx: b.passes.fx?.to - b.passes.fx?.from + 1, plate: b.passes.plate?.to - b.passes.plate?.from + 1, exported: (b.set.comp.exports ?? []).map((e) => `${e.format} ${e.url === b.passes.comp?.media.url}`) };
  });
  ok(examples.exported.join() === "mp4 true", "a shipped comp is its export too: Comp offers it to download", JSON.stringify(examples.exported));
  ok(["Ketkout's flambé", "Pickle's spell", "Brioche's first snow", "Truffle's spark of genius", "Paprika's portal", "Taro's wish", "Taro's fireworks", "The great jam chase"].every((n) => examples.names.includes(n)), "the example shots are there on a first visit", JSON.stringify(examples.names));
  ok(examples.open === "The great jam chase" && examples.kind === "video" && examples.done === 6, "the newest is open: a real take with a pass made in each of the six departments", JSON.stringify(examples));
  ok(examples.roto === "matte" && examples.subject && examples.fx === examples.plate, "its Roto pass is its subject's matte, and its effect is laid into every frame of the shot", JSON.stringify(examples));
  // Paprika's example: in FX its layers are drawn live, the portal of sparks behind her bright over the night sky above her head, where the plate is dark
  const glow = await js(async () => {
    const s = await import("/js/spice.js");
    await s.openShot("spice-example-paprika");
    s.setDept("fx");
    await new Promise((r) => setTimeout(r, 3000));
    const c = document.querySelector(".sp-live");
    const plate = [...document.querySelectorAll(".sp-plane.is-before img, .sp-plane.is-before video")].find((v) => !v.hidden);
    const red = (src, w, h) => {
      const t = document.createElement("canvas");
      t.width = w;
      t.height = h;
      const g = t.getContext("2d");
      g.drawImage(src, 0, 0, w, h);
      const d = g.getImageData(Math.round(w * 0.14), Math.round(h * 0.06), Math.round(w * 0.26), Math.round(h * 0.16)).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) n += d[i];
      return n / (d.length / 4);
    };
    return { layers: s.spice.shot.body.set.fx.layers.map((l) => l.el).join(), live: red(c, c.width, c.height), plate: plate ? red(plate, c.width, c.height) : null };
  });
  ok(glow.layers.startsWith("spark-portal") && glow.plate !== null && glow.live > glow.plate + 8, "Paprika's portal is a layer drawn live over the night sky", JSON.stringify(glow));
  ok((await page.locator(".sp-about-link").getAttribute("href")) === "#/utensils" && /nothing is overwritten/.test(await page.locator(".sp-about").innerText()), "the panel says what Spice is for, and points a quick fix to Utensils");
  // a new shot of the person's own starts empty
  await js(async () => (await import("/js/spice.js")).newShot());
  await page.waitForTimeout(800);
  ok(/SH010/.test(await page.locator(".sp-shotchip").innerText()), "a new shot is made at once, named SH010");
  ok((await page.locator(".sp-lamp[data-tone='done']").count()) === 0 && (await page.locator(".sp-lamp[data-tone='empty']").count()) === 6, "six hollow lamps before any footage");
  ok((await page.locator(".sp-facts").innerText()).includes("0 / 6"), "the facts count the passes done");
  const bar = await js(() => ({ pet: document.getElementById("assistant").dataset.pet, src: document.querySelector("#assistant .pet-face img").getAttribute("src"), docked: document.getElementById("assistant").parentElement.id, ph: document.querySelector("#assistant .chat-input").dataset.placeholder, h: document.querySelector("#assistant .chat-bar").getBoundingClientRect().height }));
  ok(bar.pet === "paprika" && bar.src === "brand/cast/paprika-face.webp" && bar.docked === "spice-chat", "Paprika's bar is docked at the foot of the page");
  ok(bar.ph.startsWith("Ask Paprika — ") && bar.h >= 100 && bar.h <= 140, "it asks her by name, in the tall card: the words on top, the keys under them", `${bar.ph} · ${bar.h} px`);
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
  // (measured again: with a layer, the timeline under the picture is one row, so the picture is taller and wider)
  const nowStage = await page.locator(".sp-stage").boundingBox();
  const gz = await page.locator(".sp-gizmo").boundingBox();
  await page.mouse.move(gz.x + gz.width / 2, gz.y + gz.height / 2);
  await page.mouse.down();
  await page.mouse.move(gz.x + gz.width / 2 + nowStage.width * 0.2, gz.y + gz.height / 2, { steps: 6 });
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
  await page.locator(".sp-fxl.is-on .sp-fxl-text b").dblclick();
  await page.locator(".sp-fxl-rename").fill("Big flame");
  await page.keyboard.press("Enter");
  await settle();
  const renamed = await state();
  ok(renamed.set.fx.layers.find((l) => l.id === renamed.set.fx.sel)?.name === "Big flame" && (await page.locator(".sp-fxl.is-on").innerText()).includes("Big flame"), "a double-click on a layer's name renames it");
  await shot("2-fx");
  // the bake: free, on this machine, the whole range
  ok(/Bake 2 layers/.test(await page.locator('.sp-primary[data-key="fx:bake"]').innerText()) && /free/.test(await page.locator('.sp-primary[data-key="fx:bake"]').innerText()), "the key bakes the two layers, free");
  await page.locator('.sp-primary[data-key="fx:bake"]').click();
  await page.waitForFunction(() => /Baked/.test(document.querySelector('.sp-primary[data-key="fx:bake"]')?.innerText ?? ""), null, { timeout: 120000 });
  st = await state();
  ok(st.passes.fx?.kind === "video" && st.passes.fx.from === 1001 && st.passes.fx.to === 1120 && paid.length === 0 && st.log.length === 0, "the layers are baked into the FX pass, on every frame, and nothing was sent", JSON.stringify(st.passes.fx));
  ok(Math.abs((st.passes.fx.seconds ?? 0) - 5) < 0.1, "a clip as long as the footage", String(st.passes.fx.seconds));
  // read back from the server, the layers (one renamed) are still the ones baked
  await page.waitForTimeout(1500);
  await js(async () => { const s = await import("/js/spice.js"); await s.openShot(s.spice.shot.id); });
  await settle();
  ok(/Baked/.test(await page.locator('.sp-primary[data-key="fx:bake"]').innerText()), "read back from the server, a renamed layer is still baked", await page.locator('.sp-primary[data-key="fx:bake"]').innerText());
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
  await page.locator('.sp-fxl').nth(1).click();
  await page.locator(".sp-b-look .ut-seg", { hasText: "Overlay" }).click();
  await settle();
  ok((await row("fx").locator(".sp-lamp").getAttribute("data-tone")) === "stale" && /Bake again/.test(await page.locator('.sp-primary[data-key="fx:bake"]').innerText()), "a layer changed after the bake: FX's lamp is hollow yellow and its key bakes again");
  await page.locator(".sp-fxl").first().click();
  await settle();
  ok((await page.locator(".sp-winhost:not([hidden])").count()) === 0, "a click on a layer's row holds it, and opens no window");
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
  ok((await page.locator(".sp-pending").count()) === 1, "Comp says FX has layers not baked, and offers to bake them");
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
  const face = await page.locator(".sp-subject-pic").first().evaluate((e) => e.style.backgroundImage);
  ok(/url\(/.test(face) && !/url\("?true"?\)/.test(face), "the subject's circle shows the picture where it was clicked", face);
  ok(/Track subject/i.test(await page.locator('.sp-out .sp-primary').innerText()) || /Track/.test(await page.locator('.sp-out .sp-primary').innerText()), "the yellow key tracks it", await page.locator(".sp-out .sp-primary").innerText());
  await page.locator(".sp-subject-name").fill("Truffle");
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
  ok(sent.text === "Truffle" && sent.positive.length === 2 && sent.negative.length === 1 && sent.key === 0 && /\.mp4$/.test(sent.video), "with the subject's name, its clicks in pixels of the frame they were made on, and the footage", JSON.stringify(sent));
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
  await page.locator('.sp-target .sp-words').fill("the desk lamp");
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
  ok(voidSent.sam3_object_mask_prompt === "the desk lamp" && voidSent.positive_prompt_inpaint_fill_ === "a bare brick wall" && voidSent.width_pass_2_ === 672 && voidSent.height_pass_2_ === 384 && voidSent.clip_duration_seconds_ >= 1 && voidSent.clip_duration_seconds_ <= 5 && voidSent.source_video,
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

  // ---- Comp behind a slow motion: the viewer plays the whole of it. It stopped at the footage's last frame (half of a slow motion of 2×),
  // and the footage beside it ran at its own speed, out of step with the slow motion it is compared with
  await js(async (m) => {
    const s = await import("/js/spice.js");
    s.setPass("comp", { kind: "video", url: m.url, file: m.file, width: m.width, height: m.height, seconds: m.duration }, { from: 1001, to: 1240, note: "2× · ffmpeg", source: "free" });
  }, slowClip);
  await settle(900);
  const clips = () => js(() => {
    const v = (side) => document.querySelector(`.sp-plane.is-${side} video.sp-media:not([hidden])`);
    return { frame: Number(document.querySelector(".sp-counter").textContent), footage: v("before")?.currentTime, slow: v("after")?.currentTime, rate: v("before")?.playbackRate, slowRate: v("after")?.playbackRate };
  });
  const scrubAt = async (x) => page.locator(".sp-scrub").click({ position: { x: (await page.locator(".sp-scrub").boundingBox()).width * x, y: 5 } });
  const plateBar = await page.locator('.sp-row[data-dept="plate"] .sp-bar').evaluate((b) => b.getBoundingClientRect().width / b.parentElement.getBoundingClientRect().width);
  ok((await page.locator(".sp-ruler span").last().innerText()) === "1240" && plateBar > 0.99, "behind a slow motion of 2× the timeline is the slow motion's (to frame 1240, the footage's bar across all of it), not the footage's 1120", `bar ${plateBar.toFixed(2)}`);
  await page.locator('.sp-transport .sp-iconkey[aria-label="Last frame"]').click();
  ok(await page.locator(".sp-counter").innerText() === "1240", "the last frame key goes to the end of the slow motion");
  await scrubAt(0.5);
  await settle(500);
  const mid = await clips();
  ok(mid.frame >= 1118 && mid.frame <= 1124 && Math.abs(mid.slow - (mid.frame - 1001) / 24) < 0.15 && Math.abs(mid.footage - (mid.frame - 1001) / 48) < 0.15, "the footage is held at the moment of the slow motion: half the time into its own clip", JSON.stringify(mid));
  await page.locator(".sp-transport .is-play").click();
  await page.waitForFunction(() => Number(document.querySelector(".sp-counter").textContent) > 1135, null, { timeout: 40000 });
  const going = await clips();
  ok(going.frame > 1120 && going.rate === 0.5 && going.slowRate === 1 && Math.abs(going.footage * 2 - going.slow) < 0.5, "it plays past the footage's last frame, the footage at half speed beside the slow motion, the two at the same moment", JSON.stringify(going));
  await page.locator(".sp-transport .is-play").click();
  await page.evaluate(() => import("/js/spice.js").then((s) => s.setFrame(1228)));
  await settle(300);
  await page.locator(".sp-transport .is-play").click();
  const playing = () => js(() => import("/js/spice.js").then((s) => s.spice.playing));
  for (let i = 0; i < 160 && (await playing()); i++) await page.waitForTimeout(250);
  const ended = Number(await page.locator(".sp-counter").innerText());
  ok(!(await playing()) && ended >= 1236, "it plays to the end of the slow motion and stops there, as a clip does", `stopped at ${ended}`);
  await scrubAt(0.5);
  const there = Number(await page.locator(".sp-counter").innerText());
  await open("light");
  const lightAt = Number(await page.locator(".sp-counter").innerText());
  ok(lightAt === 1001 + Math.round((there - 1001) / 2) && (await page.locator(".sp-ruler span").last().innerText()) === "1120", "another department keeps the moment: that frame of the slow motion is that frame of the footage", `${there} -> ${lightAt}`);
  await open("comp");
  ok(Math.abs(Number(await page.locator(".sp-counter").innerText()) - there) <= 1, "and Comp gets it back");
  // ... and a slow motion of a part of the footage (frames 1031 to 1090, four times slower): only the range is stretched, the footage goes on after it
  await js(async (m) => {
    const s = await import("/js/spice.js");
    s.edit((b) => (b.range = { in: 1031, out: 1090 }));
    s.setPass("comp", { kind: "video", url: m.url, file: m.file, width: m.width, height: m.height, seconds: m.duration }, { from: 1031, to: 1270, note: "4× · ffmpeg", source: "free" });
  }, slowClip);
  await settle(900);
  const rangeBar = await page.locator(".sp-range").evaluate((r) => { const t = r.parentElement.getBoundingClientRect(), b = r.getBoundingClientRect(); return [(b.left - t.left) / t.width, (b.right - t.left) / t.width]; });
  ok((await page.locator(".sp-ruler span").last().innerText()) === "1300" && Math.abs(rangeBar[0] - 30 / 299) < 0.01 && Math.abs(rangeBar[1] - 270 / 299) < 0.01, "behind a slow motion of a trimmed range the timeline is the footage's with the range stretched (to frame 1300), the range being the slow motion's frames", JSON.stringify(rangeBar));
  await page.locator('.sp-transport .sp-iconkey[aria-label="First frame"]').click();
  await page.locator('.sp-transport .sp-iconkey[aria-label="Last frame"]').click();
  ok(await page.locator(".sp-counter").innerText() === "1270", "the keys go to the ends of the slow motion (1031 and 1270)");
  await scrubAt(150 / 299);
  await settle(500);
  const part = await clips();
  ok(Math.abs(part.frame - 1151) <= 2 && Math.abs(part.slow - (part.frame - 1031) / 24) < 0.15 && Math.abs(part.footage - (1031 + (part.frame - 1031) / 4 - 1001) / 24) < 0.15, "half way into the slow motion the footage is a quarter of the way into the range (its frame 1061), the two at the same moment", JSON.stringify(part));
  await page.locator(".sp-transport .is-play").click();
  await page.waitForFunction(() => Number(document.querySelector(".sp-counter").textContent) > 1175, null, { timeout: 40000 });
  const partGoing = await clips();
  ok(partGoing.rate === 0.25 && partGoing.slowRate === 1 && Math.abs(1031 + (partGoing.frame - 1031) / 4 - 1001 - partGoing.footage * 24) < 8, "it plays on, the footage at a quarter of its speed beside the slow motion", JSON.stringify(partGoing));
  await page.locator(".sp-transport .is-play").click();
  await js(async () => {
    const s = await import("/js/spice.js");
    s.clearPass("comp");
    s.edit((b) => (b.range = null));
  });
  await settle(600);
  ok((await page.locator(".sp-ruler span").last().innerText()) === "1120" && Number(await page.locator(".sp-counter").innerText()) <= 1120, "with the slow motion gone the timeline is the footage's again");
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
  // (beside the example shots, the person's own)
  const own = list["spice-shots"].find((x) => x.name === "SH010");
  const shipped = (await readdir(join(root, "examples", "spice"), { withFileTypes: true })).filter((d) => d.isDirectory()).length;
  ok(list["spice-shots"].length === shipped + 1 && own?.info.passes >= 5, "the server keeps it as a shot with its passes counted, beside the examples", JSON.stringify(own?.info));

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
  queue.push({ reply: "Trimmed, and his screwdriver is a subject.", actions: [{ op: "trim", in: 1010, out: 1100 }, { op: "subject", name: "the screwdriver" }, { op: "open", department: "comp" }] });
  await page.locator("#assistant .chat-input").click();
  await page.keyboard.type("trim it and cut out the screwdriver");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelector(".sp-dept.is-comp:not([hidden])"), null, { timeout: 15000 });
  st = await state();
  ok(st.range?.in === 1010 && st.range?.out === 1100 && st.set.roto.subjects.some((s) => s.name === "the screwdriver") && st.dept === "comp", "she trims, adds a subject and opens a department");
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

  // ---- a layer that follows Roto's subject: a clip whose matte drifts a long way (a block, 450 pixels across the frame in three seconds, and
  // up and down a little). A layer turned to follow at the first frame keeps its place on the block at the others; the same layer left
  // alone stays where it was placed. Measured on the handles, and in the pixels the compositor draws (the bake draws the same way)
  await js(async ({ clip, matte }) => {
    const s = await import("/js/spice.js");
    // (her talk so far is put away: the thread of it would lie over the foot of the cards)
    (await import("/js/spice-assist.js")).clearSpiceChat();
    const m = (x) => ({ kind: "video", url: x.url, file: x.file, width: x.width, height: x.height, seconds: x.duration });
    await s.newShot("FOLLOW");
    const at = new Date().toISOString();
    s.edit((b) => {
      b.passes.plate = { media: m(clip), eye: true, fps: 24, name: "drift.mp4", from: 1001, to: 1072, at };
      b.passes.roto = { media: m(matte), eye: true, from: 1001, to: 1072, note: "The drifter · a test matte", credits: 0, at, source: "free", type: "matte" };
      b.set.roto.subjects = [{ id: "s-drift", name: "The drifter", points: [], media: m(matte), eye: true, from: 1001, to: 1072, stale: false, at, credits: 0 }];
    });
    s.setDept("fx");
  }, { clip: driftClip, matte: driftMatte });
  await page.waitForSelector(".sp-dept.is-fx:not([hidden])");
  // (the clips the viewer draws from are there at their frame: none is still seeking)
  const clipsAt = () => page.waitForFunction(() => { const v = [...document.querySelectorAll("video.sp-media")]; return v.length > 1 && v.every((x) => !x.seeking && x.readyState >= 2); }, null, { timeout: 30000 });
  await clipsAt();
  await settle(900);
  // where the block's middle is at a frame, in shares of the frame, from how it was drawn
  const block = (frame) => { const t = (frame - 1001) / 24; return { x: (60 + 150 * t + 48) / 640, y: (100 + 40 * Math.sin(2 * t) + 75) / 360 }; };
  const goto = async (frame) => {
    const track = await page.locator(".sp-scrub").boundingBox();
    await page.mouse.click(track.x + Math.min(track.width - 1, (track.width * (frame - 1001)) / 71), track.y + track.height / 2);
    await clipsAt();
    await settle(600);
  };
  const handles = async () => {
    const stage = await page.locator(".sp-stage").boundingBox();
    const g = await page.locator(".sp-gizmo").boundingBox();
    return { x: (g.x + g.width / 2 - stage.x) / stage.width, y: (g.y + g.height / 2 - stage.y) / stage.height };
  };
  const near = (a, b, tol = 0.02) => Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol;
  const at2 = (p) => `${p.x.toFixed(3)}, ${p.y.toFixed(3)}`;
  const lastLayer = async () => (await state()).set.fx.layers.at(-1);
  await goto(1001);
  // a layer placed on the block at the first frame, that does not shine and does not move by itself (what is drawn is its own)
  const placed = block(1001);
  await page.locator('.sp-lib-tile[data-el="starburst"]').click();
  await settle(500);
  await js(async (p) => {
    const o = await import("/js/spice-fx-ops.js");
    o.patchLayer(o.selected().id, { x: p.x, y: p.y, light: 0, glow: 0, motion: "still" });
  }, placed);
  await settle(600);
  const sw = page.locator(".sp-b-look .uf-switch");
  ok((await sw.count()) === 1 && (await sw.innerText()).trim() === "Follows The drifter" && (await sw.getAttribute("aria-checked")) === "false", "on a clip with Roto's matte a layer has a switch, Follows the subject, off to begin with", (await sw.count()) ? (await sw.innerText()).trim() : "no switch");
  await sw.evaluate((el) => el.click());
  await settle(700);
  let layer = await lastLayer();
  ok(layer.follow === true && layer.pin && near(layer.pin, placed, 0.015) && near(layer, placed, 1e-6) && (await sw.getAttribute("aria-checked")) === "true", "turned on at the first frame, the layer is pinned to the subject's anchor there and has not moved", JSON.stringify(layer.pin));
  for (const f of [1025, 1049, 1072]) {
    await goto(f);
    const on = await handles();
    ok(near(on, block(f)), `at frame ${f} the layer's handles are on the block`, `${at2(on)} against ${at2(block(f))}`);
  }
  // in the pixels: a layer that follows and one that does not, each drawn alone on black, over the frames, with the matte as the bake loads it
  const drawn = await js(async ({ frames, placed, pin }) => {
    const bake = await import("/js/spice-bake.js");
    const { render } = await import("/js/spice-layers.js");
    const { cleanLayer, elementOf } = await import("/js/spice-elements.js");
    const { spice } = await import("/js/spice.js");
    const matte = await bake.loadVideo(spice.shot.body.passes.roto.media.url);
    const star = await bake.loadImage(elementOf("starburst").src);
    const W = 640, H = 360;
    const dark = Object.assign(document.createElement("canvas"), { width: W, height: H });
    dark.getContext("2d").fillRect(0, 0, W, H);
    const mk = (follow) => cleanLayer({ id: follow ? "t-follows" : "t-stays", el: "starburst", x: placed.x, y: placed.y, scale: 0.3, light: 0, glow: 0, motion: "still", blend: "add", follow, pin: follow ? pin : null });
    const middle = (layer, frame) => {
      const g = Object.assign(document.createElement("canvas"), { width: W, height: H }).getContext("2d", { willReadFrequently: true });
      render(g, W, H, { base: dark, matte, matteFrom: 1001, layers: [layer], frame, fps: 24, still: false, sourceOf: () => star, edge: { feather: 0, choke: 0 }, footageWidth: W });
      const d = g.getImageData(0, 0, W, H).data;
      let n = 0, sx = 0, sy = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; const v = d[i] + d[i + 1] + d[i + 2]; n += v; sx += v * x; sy += v * y; }
      return n ? { x: sx / n / W, y: sy / n / H } : null;
    };
    const rows = [];
    for (const f of frames) {
      await bake.seekTo(matte, (f - 1001) / 24);
      rows.push({ frame: f, stays: middle(mk(false), f), follows: middle(mk(true), f) });
    }
    return rows;
  }, { frames: [1001, 1025, 1049, 1072], placed, pin: layer.pin });
  // (the star's own middle is a little off its box's: what is compared is where each is against where it was at the first frame)
  for (const r of drawn) {
    const moved = { x: r.follows.x - drawn[0].follows.x, y: r.follows.y - drawn[0].follows.y };
    const onBlock = { x: block(r.frame).x - block(1001).x, y: block(r.frame).y - block(1001).y };
    ok(r.stays && r.follows && near(r.stays, drawn[0].stays, 0.003) && near(moved, onBlock, 0.02), `drawn at frame ${r.frame}, the layer that does not follow is where it was placed and the one that follows has gone as far as the block`, `stays ${at2(r.stays)}, follows moved ${at2(moved)}, block moved ${at2(onBlock)}`);
  }
  // dragged at a frame, it goes where it is put down, pinned to the anchor there; later it keeps that place on the block
  await goto(1049);
  const was = await handles();
  const stageBox = await page.locator(".sp-stage").boundingBox();
  const gb = await page.locator(".sp-gizmo").boundingBox();
  await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2);
  await page.mouse.down();
  await page.mouse.move(gb.x + gb.width / 2 + 20, gb.y + gb.height / 2 + 5, { steps: 4 });
  await page.mouse.move(gb.x + gb.width / 2 + 40, gb.y + gb.height / 2 + 10, { steps: 4 });
  await page.mouse.up();
  await settle(700);
  const put = await handles();
  layer = await lastLayer();
  ok(near({ x: put.x - was.x, y: put.y - was.y }, { x: 40 / stageBox.width, y: 10 / stageBox.height }, 0.008), "dragged at a frame, the layer goes where it is put down", `${at2(was)} to ${at2(put)}`);
  ok(near(layer.pin, block(1049), 0.015) && near(layer, put, 0.01), "and is pinned to the subject's anchor there, its place being where it was put", `pin ${at2(layer.pin)}, place ${at2(layer)}`);
  await goto(1072);
  const later = await handles();
  ok(near(later, { x: put.x + block(1072).x - block(1049).x, y: put.y + block(1072).y - block(1049).y }, 0.02), "later it keeps that place on the block", `${at2(later)}`);
  // turned off, it stays where it is seen; undone, it follows again
  await goto(1025);
  const seen = await handles();
  await sw.evaluate((el) => el.click());
  await settle(700);
  layer = await lastLayer();
  ok(layer.follow === false && layer.pin === null && near(layer, seen, 0.01), "turned off at a frame, the layer stays where it was seen", JSON.stringify([layer.x, layer.y, layer.pin]));
  await goto(1072);
  ok(near(await handles(), seen, 0.01), "and no longer follows");
  await page.locator('.sp-fxls-head .sp-iconkey[aria-label="Undo (Ctrl+Z)"]').click();
  await settle(700);
  layer = await lastLayer();
  ok(layer.follow === true && near(layer.pin, block(1049), 0.015), "undone, it follows again as it did", JSON.stringify(layer.pin));
  // the bake is signed with follow and its pin while it follows (and as it was when it does not: nothing to bake again for a layer that never followed)
  const signed = await js(async () => {
    const ops = await import("/js/spice-fx-ops.js");
    const { spice, edit } = await import("/js/spice.js");
    const { fxPending } = await import("/js/spice-fx.js");
    const { cleanLayer } = await import("/js/spice-elements.js");
    const { fxGround } = await import("/js/spice-engines.js");
    const b = spice.shot.body;
    const g = fxGround(b);
    edit((x) => { x.passes.fx = { media: x.passes.plate.media, eye: true, from: 1001, to: 1072, note: "1 layer baked", at: new Date().toISOString() }; x.set.fx.dirty = false; });
    const sign = (strip) => JSON.stringify([ops.layersOf().filter((l) => l.eye !== false && (l.el !== "ai" || l.media)).map((l) => { const c = cleanLayer(l); if (!(c.light > 0)) (delete c.light, delete c.reach); if (strip || !c.follow) (delete c.follow, delete c.pin); return c; }), g.base?.url, g.matte?.url, b.range, b.set.roto.feather, b.set.roto.choke]);
    const pending = (baked) => (edit((x) => { x.set.fx.baked = baked; x.set.fx.dirty = false; }), fxPending().pending);
    const withFollow = sign(false);
    const out = { with: pending(withFollow), without: pending(sign(true)), keys: /"follow":true,"pin":\{"x":[\d.]+,"y":[\d.]+\}/.test(withFollow) };
    ops.patchLayer(ops.selected().id, { follow: false });
    const off = sign(false);
    out.off = [pending(off), !off.includes('"follow"') && !off.includes('"pin"')];
    return out;
  });
  ok(signed.keys && signed.with === false && signed.without === true, "a layer that follows is in the bake's signature with its pin: a bake made without them is not its layers", JSON.stringify(signed));
  ok(signed.off[0] === false && signed.off[1], "and one that does not follow is signed as it was before it could", JSON.stringify(signed.off));
  // a layer turned to follow where no matte could be read is pinned the first time one can (the viewer does it, quietly)
  await js(async () => { const { spice, edit } = await import("/js/spice.js"); edit((b) => { const l = b.set.fx.layers.at(-1); l.follow = true; l.pin = null; }); });
  await settle(900);
  layer = await lastLayer();
  ok(layer.follow === true && layer.pin && near(layer.pin, block(1072), 0.015), "a layer that follows with no pin takes one from the subject as soon as the viewer can read it", JSON.stringify(layer.pin));
  // Paprika: follow is a layer's field like light, set where a matte holds a subject, and refused with a reason where none does
  const hers = await js(async () => (await import("/js/spice-assist.js")).apply({ op: "layer", element: "starburst", x: 0.5, y: 0.5, follow: true }));
  layer = await lastLayer();
  ok(hers.failed.length === 0 && layer.follow === true && layer.pin && near(layer.pin, block(1072), 0.015), "Paprika can lay a layer that follows: pinned where the subject is", JSON.stringify([hers, layer.pin]));
  await js(async () => { await (await import("/js/spice.js")).newShot("NOMATTE"); });
  await page.waitForSelector(".sp-dept.is-plate:not([hidden])");
  const refused = await js(async () => (await import("/js/spice-assist.js")).apply({ op: "layer", element: "flame", follow: true }));
  layer = await lastLayer();
  ok(refused.failed.some((m) => /Follow needs a clip with Roto's matte/.test(m)) && layer.follow === false, "and where no matte holds a subject she is refused, with the reason", JSON.stringify(refused));

  ok(errors.length === 0, "no page errors", errors.join(" | ").slice(0, 300));
  ok(outbound.length === 0, "nothing left this machine", outbound.slice(0, 2).join(" "));
} finally {
  await browser.close();
  server.kill();
}
console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);
