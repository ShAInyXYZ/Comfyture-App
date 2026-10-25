// Spice, the AI edit bay, in a real browser, end to end, on a server of its own and a folder of its own: the screen (Paprika, the shot chip, the
// rail of seven stages, the viewer, the open stage with its engines, the takes), a clip brought and conformed on this machine (free, ffmpeg), the
// engines of each stage from the catalog, the checks made before a paid run (a clip over an engine's length stops it), a paid run that asks first
// (the first press only asks, the second sends, once) and becomes a take with its price in the ledger, a failed run kept as a take, taking one
// take as the stage's pass, the wipe, Paprika's answers (stood in for: no key) setting an engine up, writing the plan and asking for the run, and
// the shot kept across a reload. Comfy Cloud's templates are stood in for here, so no credit is ever spent.
// Not part of `node --test` (it needs a browser and ffmpeg). From the repo root:
//   NODE_PATH=<a node_modules that has playwright> CHROME=<chrome or chromium binary> node tests/bay.browser.mjs
// OUT=<folder> keeps screenshots, to be looked at.
import { spawn, execFileSync } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { tempDir } from "./tools/temp.mjs";

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const root = resolve(import.meta.dirname, "..");
const out = process.env.OUT ? resolve(process.env.OUT) : null;
if (out) await mkdir(out, { recursive: true });
const dataDir = tempDir("bay-data-");
const mediaDir = tempDir("bay-media-");
let failures = 0;
const ok = (cond, msg, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${msg}${extra ? `  ${extra}` : ""}`);
  if (!cond) failures++;
};

// a footage of our own: twelve seconds at 30 fps (over what most editors take, off 24 fps), a gradient that moves; and what an editor sends back
const ff = (...args) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args]);
ff("-f", "lavfi", "-i", "testsrc2=s=640x360:r=30:d=12", "-pix_fmt", "yuv420p", join(mediaDir, "yard.mp4"));
ff("-f", "lavfi", "-i", "testsrc2=s=640x360:r=24:d=6", "-vf", "hue=h=120,format=yuv420p", join(mediaDir, "edited.mp4"));

const port = await new Promise((done) => {
  const s = createServer().listen(0, () => {
    const { port } = s.address();
    s.close(() => done(port));
  });
});
const server = spawn(process.execPath, ["server/main.ts"], { cwd: root, env: { ...process.env, PORT: String(port), COMFYTURE_DATA: dataDir, COMFY_API_KEY: "" }, stdio: "ignore" });
const base = `http://127.0.0.1:${port}`;
for (let i = 0; i < 100; i++) {
  if (await fetch(`${base}/api/spice-bays`).then((r) => r.ok, () => false)) break;
  await new Promise((r) => setTimeout(r, 200));
}
const edited = await (await fetch(`${base}/api/videos`, { method: "POST", headers: { "Content-Type": "video/mp4" }, body: await readFile(join(mediaDir, "edited.mp4")) })).json();

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ["--no-sandbox"] });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  const runs = [];
  const outbound = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !/GL Driver|favicon|Failed to load resource/.test(m.text()) && errors.push(m.text()));
  await context.route((url) => !["127.0.0.1", "localhost"].includes(url.hostname), (route) => (outbound.push(route.request().url()), route.abort()));

  // Comfy Cloud's catalog and templates, stood in for: the engines the test uses, their forms and prices, and a run that answers at once
  const item = (name, title, o = {}) => ({ name, title, description: `${title}.`, group: o.partner ? "partner" : "video", medium: "video", tags: o.tags ?? [], models: [], inputs: o.inputs ?? ["video"], outputs: ["video"], partner: !!o.partner, openSource: !o.partner, credits: null, usage: 1, maker: o.maker ?? null });
  const CATALOG = [
    item("api_google_gemini_omni_flash_1_1_edit", "Gemini Omni 1.1 Flash: Video Edit", { partner: true, maker: "gemini" }),
    item("api_seedance2_5_video_editing", "Seedance2.5: Video Editing", { partner: true }),
    item("api_beeble_switchx_video_edit", "Video Edit: Beeble SwitchX", { partner: true, inputs: ["video", "image"] }),
    item("video_ltx2_3_ic_lora", "LTX 2.3 IC-LoRA Union Control", { inputs: ["video", "image"] }),
    item("template_ltx2_3_ic_lora_ingredients", "LTX-2.3 IC-LoRA: Reference Sheet Control", { inputs: ["image"] }),
    item("utility_void_video_inpainting", "Video Inpainting: VOID"),
    item("api_newmaker_video_edit", "NewMaker: Video Edit", { partner: true, inputs: ["video", "image"] }),
    item("image_qwen_image_edit", "Qwen", { inputs: ["image"] }),
  ];
  const FORMS = {
    api_google_gemini_omni_flash_1_1_edit: [["video", "video", true], ["prompt", "text"]],
    api_seedance2_5_video_editing: [["video", "video", true], ["prompt", "text"]],
    api_beeble_switchx_video_edit: [["video", "video", true], ["image", "image", true], ["prompt", "text"]],
    video_ltx2_3_ic_lora: [["video", "video", true], ["image", "image"], ["prompt", "text"]],
    template_ltx2_3_ic_lora_ingredients: [["image", "image", true], ["prompt", "text"]],
    utility_void_video_inpainting: [["video", "video", true], ["prompt", "text"]],
  };
  const PRICES = { api_google_gemini_omni_flash_1_1_edit: 40, api_seedance2_5_video_editing: 55, api_beeble_switchx_video_edit: 90 };
  let failNext = false;
  await page.route("**/api/utensils/templates?**", (route) => route.fulfill({ json: { count: CATALOG.length, total: CATALOG.length, items: CATALOG } }));
  await page.route("**/api/utensils/templates/**", (route) => {
    const url = new URL(route.request().url());
    const [, , , , name, tail] = url.pathname.split("/");
    if (tail === "estimate") return route.fulfill({ json: { credits: PRICES[name] ?? 0, perUnit: null, note: "" } });
    if (tail === "run") {
      runs.push({ name, body: route.request().postDataJSON() });
      if (failNext) return (failNext = false), route.fulfill({ status: 400, json: { error: "The model refused this clip." } });
      return route.fulfill({ json: { id: `job-${runs.length}`, status: "done", progress: 1, outputs: [{ kind: "video", url: edited.url, file: edited.file, width: edited.width, height: edited.height, duration: edited.duration }] } });
    }
    if (!tail && FORMS[name]) return route.fulfill({ json: { name, title: name, schema: { slots: FORMS[name].map(([id, kind, required]) => ({ id, kind, required: !!required, label: id })), models: [], notes: [] } } });
    return route.continue();
  });
  // Paprika's answers, stood in for: each is the next of the queue, and what she was asked is kept
  const asked = [];
  const queue = [];
  await page.route("**/api/bay/assist", (route) => (asked.push(route.request().postDataJSON()), route.fulfill({ json: queue.shift() ?? { reply: "Fine.", actions: [] } })));

  const settle = (ms = 350) => page.waitForTimeout(ms);
  const shot = (name) => out && page.screenshot({ path: join(out, `${name}.png`) });
  const step = (id) => page.locator(`.bay-step[data-stage="${id}"]`);
  const scrolls = () => page.evaluate(() => ({ v: document.documentElement.scrollHeight - innerHeight, h: document.documentElement.scrollWidth - innerWidth }));
  const key = () => page.locator(".bay-stage .bay-primary");

  await page.goto(`${base}/#/spice?bay`);
  await page.waitForSelector(".bay .bay-step");
  await settle(500);

  // ---- the screen
  ok((await page.locator(".bay-step").count()) === 7, "the rail has the seven stages");
  ok((await page.locator(".bay-step b").allTextContents()).join(",").toLowerCase() === "conform,select,clean,direct,control,extend,finish", "in the order a finishing editor runs them");
  ok(await page.locator(".bay-id b").textContent() === "Paprika", "Paprika is on the left");
  ok(await step("conform").getAttribute("aria-pressed") === "true", "Conform is open first");
  ok((await page.locator(".bay-v-empty").isVisible()), "the viewer asks for a clip");
  await shot("01-empty");
  let s = await scrolls();
  ok(s.v <= 1 && s.h <= 1, "the page fits the window with no scroll", JSON.stringify(s));

  // ---- bringing a clip: the viewer's drop and the key both take a clip; here the key
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.locator(".bay-stage .bay-ghost", { hasText: "Bring a clip" }).click()]);
  await chooser.setFiles(join(mediaDir, "yard.mp4"));
  await page.waitForFunction(() => document.querySelector(".bay-clipfacts")?.textContent.includes("640×360"), null, { timeout: 15000 });
  await settle(500);
  const facts = await page.locator(".bay-facts").textContent();
  const clipFacts = await page.locator(".bay-clipfacts").textContent();
  ok(/640×360/.test(clipFacts) && /\d+ fps/.test(clipFacts) && /12 s/.test(clipFacts), "the clip is read: size, rate, length", clipFacts);
  const plan = (await page.locator(".bay-plan-row").allTextContents()).join(" | ");
  ok(/Length.*12 → 10/.test(plan), "Conform says what it would change: the length", plan);
  ok(await page.locator(".bay-shotchip").textContent().then((t) => /yard/i.test(t)), "the shot took the clip's name");
  await shot("02-clip");

  // ---- Direct before Conform: the clip is over what Gemini takes, so the run is stopped before it is paid
  await step("direct").click();
  await settle();
  const names = await page.locator(".bay-engine b").allTextContents();
  ok(names.some((n) => /Gemini/.test(n)) && names.some((n) => /Beeble/.test(n)) && names.some((n) => /NewMaker/.test(n)), "Direct's engines come from the catalog, with a new one found", names.join(" | "));
  ok(!names.some((n) => /Runway/.test(n)), "an engine the catalog has not got is not offered");
  ok(/Not in the catalog now/.test(await page.locator(".bay-stage-body").textContent()), "and is told as missing");
  const groups = await page.locator(".bay-group-label").allTextContents();
  ok(groups.includes("Change by words") && groups.includes("Relight and look") && groups.includes("New in the catalog"), "grouped by what they are for", groups.join(" | "));
  await page.locator('.bay-engine[data-engine="api_google_gemini_omni_flash_1_1_edit"]').click();
  await settle();
  ok(/10 seconds at most/.test(await page.locator(".bay-problems").textContent()) && (await key().isDisabled()), "a 12 s clip is stopped for Gemini (10 s at most), and the key is out");
  ok(/40 cr/.test(await key().textContent()), "the price is the runner's estimate, on the key", (await key().textContent()).trim());
  await shot("03-direct-stopped");

  // ---- Conform on this machine
  await step("conform").click();
  await settle();
  await page.locator(".bay-stage .bay-primary").click();
  await page.waitForSelector('.bay-step[data-stage="conform"] .bay-lamp[data-tone="done"]', { timeout: 60000 });
  await settle(500);
  ok((await page.locator(".bay-take").count()) === 1, "Conform made a take");
  ok(/free/.test(await page.locator(".bay-take-meta").first().textContent()), "and it cost nothing");
  const conformed = await page.evaluate(async () => (await (await fetch("api/spice-bays")).json())["spice-bays"][0].id).then((id) => page.evaluate(async (id) => (await (await fetch(`api/spice-bays/${id}`)).json()).project.body, id));
  const cm = conformed.stages.conform.takes[0].media;
  ok(Math.abs(cm.seconds - 10) < 0.3, "the clip was cut to ten seconds", String(cm.seconds));
  ok(runs.length === 0, "no template was run");

  // ---- Direct now: the stage works from the conformed clip, and the run asks first
  await step("direct").click();
  await settle();
  ok(!(await key().isDisabled()), "with the clip conformed the key is back");
  await page.locator('.bay-stage textarea[data-words="direct"]').fill("Swap the street sign for a hand-painted one.");
  await settle(200);
  await key().click();
  await settle();
  ok(runs.length === 0 && /Yes, spend it/.test(await page.locator(".bay-primary").textContent()), "the first press only asks (Yes, spend it)");
  await shot("04-asking");
  await page.locator(".bay-primary", { hasText: "Yes, spend it" }).click();
  await page.waitForSelector('.bay-step[data-stage="direct"] .bay-lamp[data-tone="done"]', { timeout: 20000 });
  await settle(500);
  ok(runs.length === 1 && runs[0].name === "api_google_gemini_omni_flash_1_1_edit", "the second press sent it once");
  const sent = JSON.stringify(runs[0].body);
  ok(/hand-painted/.test(sent) && /yard|\.mp4/.test(sent), "with the words and the conformed clip", sent.slice(0, 160));
  ok((await page.locator(".bay-take").count()) === 1 && /40 cr/.test(await page.locator(".bay-take-meta").first().textContent()), "a take with its price");
  ok(/40 cr/.test(await step("direct").locator("small").textContent()), "the rail shows what the stage spent", await step("direct").locator("small").textContent());
  ok(/This shot[\s\S]*40 cr/.test(await page.locator(".bay-facts").textContent()), "and the shot's total is 40 cr");
  await shot("05-first-take");

  // ---- a second run, then a failed one; the pass; the wipe
  await key().click();
  await page.locator(".bay-primary", { hasText: "Yes, spend it" }).click();
  await page.waitForFunction(() => document.querySelectorAll(".bay-take").length === 2, null, { timeout: 20000 });
  failNext = true;
  await settle(400);
  await key().click();
  await page.locator(".bay-primary", { hasText: "Yes, spend it" }).click();
  await page.waitForFunction(() => document.querySelectorAll(".bay-take").length === 3, null, { timeout: 20000 });
  await settle(400);
  ok((await page.locator(".bay-take.is-failed").count()) === 1 && /refused/.test(await page.locator(".bay-take.is-failed").textContent()), "a run that failed is kept as a take, with what was said");
  ok(/80 cr/.test(await page.locator(".bay-facts").textContent()), "and it cost nothing (80 cr: the two that worked)");
  ok((await page.locator(".bay-take.is-marked").count()) === 1, "one take is the stage's pass");
  const second = page.locator(".bay-take:not(.is-failed)").first();
  await second.locator(".bay-iconkey").first().click();
  await settle();
  ok(await page.locator(".bay-take.is-marked").first().getAttribute("data-take") === (await second.getAttribute("data-take")), "another take is marked by hand");
  await second.locator(".bay-take-pic").click();
  await settle();
  ok(await page.locator(".bay-v-b").first().evaluate((v) => !!v.getAttribute("src")), "a take is shown on the right of the wipe");
  await page.locator(".bay-v-line").focus();
  await page.keyboard.press("ArrowRight");
  ok(Number(await page.locator(".bay-v-line").getAttribute("aria-valuenow")) === 55, "the wipe moves");
  await shot("06-takes");
  const toDelete = page.locator(".bay-take.is-failed .bay-danger");
  await toDelete.click();
  await settle(200);
  ok((await page.locator(".bay-take").count()) === 3, "a delete asks first");
  await page.locator(".bay-take.is-failed .bay-danger").click();
  await settle();
  ok((await page.locator(".bay-take").count()) === 2, "and the second press deletes");

  // ---- Control: the LTX IC-LoRA bay; an engine that needs a picture stops until it has one
  await step("control").click();
  await settle();
  await page.locator('.bay-engine[data-engine="template_ltx2_3_ic_lora_ingredients"]').click();
  await settle();
  ok(/needs a picture/.test(await page.locator(".bay-problems").textContent()), "Ingredients needs its sheet: stopped until a picture is given");
  ok(await page.locator(".bay-group-label").allTextContents().then((g) => g.includes("Keep the motion") && g.includes("Hold a character")), "Control groups the LTX engines by what they keep");
  await shot("07-control");

  // ---- Paprika: she picks an engine, writes the plan and asks for the run; the page sets it up and asks the user
  const bar = page.locator("#assistant");
  queue.push({
    reply: "Union control keeps his walk. I wrote the plan.",
    actions: [
      { op: "plan", steps: [{ stage: "conform" }, { stage: "clean", engine: "utility_void_video_inpainting", text: "the van", why: "takes the shadow too" }, { stage: "direct", engine: "api_google_gemini_omni_flash_1_1_edit", text: "a rainy blue hour" }, { stage: "control", engine: "video_ltx2_3_ic_lora" }] },
      { op: "engine", stage: "direct", engine: "api_seedance2_5_video_editing" },
      { op: "words", stage: "direct", text: "Make it a rainy blue hour and keep everything else." },
      { op: "run" },
    ],
  });
  await bar.locator("textarea, input[type=text], [contenteditable]").first().fill("make it a rainy blue hour");
  await page.keyboard.press("Enter");
  await page.waitForSelector(".msg-confirm", { timeout: 10000 });
  await settle(500);
  ok(asked.length === 1 && asked[0].bay.stage === "control" && asked[0].bay.engines.length >= 2, "she was told the stage open and its engines", `stage ${asked[0]?.bay.stage}`);
  ok(asked[0].bay.clip.seconds > 5 && asked[0].bay.stages.find((x) => x.id === "direct").takes === 2, "and the clip (the one Control works from: Direct's pass) and what Direct has made");
  ok(await step("direct").getAttribute("aria-pressed") === "true", "she opened Direct");
  ok(await page.locator('.bay-engine.is-on').getAttribute("data-engine") === "api_seedance2_5_video_editing", "picked Seedance");
  ok((await page.locator('textarea[data-words="direct"]').inputValue()).includes("rainy blue hour"), "put the words");
  const steps = await page.locator(".bay-planstep").allTextContents();
  ok(steps.length === 4 && /Conform/.test(steps[0]) && /Control/.test(steps[3]), "and wrote the plan on the left", steps.join(" | "));
  ok(await page.locator(".bay-planstep.is-done").count() === 2, "two of its steps are already done (Conform, and Direct by Gemini)");
  const confirmText = await page.locator(".msg-confirm").textContent();
  ok(/Seedance/.test(confirmText) && /55 cr/.test(confirmText), "the run is offered under her answer with its price", confirmText.replace(/\s+/g, " ").trim());
  ok(runs.length === 3, "nothing ran by itself", String(runs.length));
  await shot("08-paprika");
  await page.locator(".msg-confirm .key.is-primary").click();
  await page.waitForFunction(() => document.querySelectorAll(".bay-take").length === 3, null, { timeout: 20000 });
  ok(runs.length === 4 && runs[3].name === "api_seedance2_5_video_editing", "her yes sent it once");

  // ---- kept across a reload
  await settle(900);
  await page.reload();
  await page.waitForSelector(".bay .bay-step");
  await settle(700);
  ok((await page.locator(".bay-step .bay-lamp[data-tone=done]").count()) === 2, "after a reload the stages are as they were");
  ok(/135 cr|135/.test(await page.locator(".bay-facts").textContent()), "and the ledger", (await page.locator(".bay-facts").textContent()).replace(/\s+/g, " "));
  ok((await page.locator(".bay-planstep").count()) === 4, "and Paprika's plan");
  await shot("09-reload");

  // ---- Finish: the export is free and on this machine; the ledger is a file to keep
  await step("finish").click();
  await settle();
  await page.locator(".bay-export select[aria-label=Format]").selectOption("webm");
  await page.locator(".bay-export .bay-ghost", { hasText: "Export" }).click();
  await page.waitForSelector('.bay-step[data-stage="finish"] .bay-lamp[data-tone="done"]', { timeout: 60000 });
  await settle(400);
  ok(/Export WEBM/.test(await page.locator(".bay-take-text b").first().textContent()) && /free/.test(await page.locator(".bay-take-meta").first().textContent()), "the export is a free take of Finish");
  const [download] = await Promise.all([page.waitForEvent("download"), page.locator(".bay-export .bay-ghost", { hasText: "Ledger" }).click()]);
  const ledger = await readFile(await download.path(), "utf8");
  ok(/Total: 135 credits/.test(ledger) && /Seedance/.test(ledger) && /direct: 135 cr/.test(ledger), "the ledger is a text file with every run and the total", ledger.split("\n").slice(0, 3).join(" / "));
  await shot("11-finish");

  // ---- a laptop
  for (const [w, h] of [[1280, 720], [1366, 768], [1920, 1080]]) {
    await page.setViewportSize({ width: w, height: h });
    await settle(400);
    for (const id of ["conform", "direct", "control", "finish"]) {
      await step(id).click();
      await settle(250);
      s = await scrolls();
      ok(s.v <= 1 && s.h <= 1, `${id} fits ${w}×${h} with no page scroll`, JSON.stringify(s));
      const cut = await page.evaluate(() => {
        const side = document.querySelector(".bay-side");
        const brief = document.querySelector(".bay-brief textarea").getBoundingClientRect();
        return { side: side.scrollHeight - side.clientHeight, brief: Math.round(brief.bottom - innerHeight), briefH: Math.round(brief.height) };
      });
      ok(cut.side <= 1 && cut.brief <= 0 && cut.briefH >= 30, `${id} at ${w}×${h}: the left rail shows everything, the brief box too`, JSON.stringify(cut));
    }
    await shot(`10-${w}x${h}`);
  }

  ok(errors.length === 0, "no errors on the page", errors.join(" | "));
  ok(outbound.length === 0, "nothing left this machine", outbound.join(" | "));
} finally {
  await browser.close();
  server.kill();
}
console.log(failures ? `${failures} FAILED` : "all passed");
process.exit(failures ? 1 : 0);
