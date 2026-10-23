// Spice on a shot that is a PICTURE, in a real browser, on a server and a folder of its own: every department takes the picture and gives
// a picture back. The free passes run for real on this machine (a spot painted out, the weather and the grade laid on it, the FX layers
// baked, an export to WebP); the paid ones ask first and are stood in for, so no credit is ever spent (Roto's cut-out, Paint's object taken
// out by Qwen, the upscale refused by the browser and counted). The FX compositor's layers go behind the person Roto holds.
// Not part of `node --test` (it needs a browser and ffmpeg). From the repo root:
//   PLAYWRIGHT_MODULE=<playwright's folder> node tests/spice-picture.browser.mjs        (OUT=<folder> keeps screenshots)
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
const dataDir = await mkdtemp(join(tmpdir(), "spice-pic-data-"));
const mediaDir = await mkdtemp(join(tmpdir(), "spice-pic-media-"));
let failures = 0;
const ok = (cond, msg, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${msg}${extra ? `  ${extra}` : ""}`);
  if (!cond) failures++;
};

// the picture and its matte, from our own cast (spice/examples): Truffle at his workbench, and Truffle cut out
const ff = (...args) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args]);
const truffle = join(root, "spice", "examples", "sh040-truffle");
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
  ok(st.passes.fx?.kind === "image" && st.passes.fx.width === 640, "the layers are baked into a picture as big as the footage", JSON.stringify(st.passes.fx));
  await shot("p-fx");

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
