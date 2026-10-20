// Macaron in a real browser, end to end, on a server of its own and a folder of its own: the flagship
// project opens from the seed; a layer is picked, moved, retyped, laid out in another format, given a new
// picture and colour; undo and redo; a variation; save, reload, a PNG export; the kit, the timeline, the
// pictures, the layers, the variations and the content list; Brioche's answer applied as one undo step
// (the model's answer is stood in for, so it needs no key); a new brand with its colours and a logo as
// SVG and as PNG; a brand saved by an earlier Macaron; the intro rendered to a video, and a first timing
// for a new motion piece. Not part of `node --test` (it needs a browser and ffmpeg). From the repo root:
//   NODE_PATH=<a node_modules that has playwright> CHROME=<chrome or chromium binary> node tests/macaron-ui.browser.mjs
// OUT=<folder> keeps screenshots of the sections and the exported files, to be looked at.
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)("playwright");
const root = resolve(import.meta.dirname, "..");
const out = process.env.OUT ? resolve(process.env.OUT) : await mkdtemp(join(tmpdir(), "macaron-ui-"));
await mkdir(out, { recursive: true });
const dataDir = await mkdtemp(join(tmpdir(), "macaron-data-"));
let failures = 0;
const ok = (cond, msg, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${msg}${extra ? `  ${extra}` : ""}`);
  if (!cond) failures++;
};

// a free port, and the server on it (no Comfy and no key: Macaron's editing needs neither)
const port = await new Promise((done) => {
  const s = createServer().listen(0, () => {
    const { port } = s.address();
    s.close(() => done(port));
  });
});
const server = spawn(process.execPath, ["server/main.ts"], { cwd: root, env: { ...process.env, PORT: String(port), COMFYTURE_DATA: dataDir, COMFY_API_KEY: "", COMFY_BASE_URL: "http://127.0.0.1:9" }, stdio: "ignore" });
const base = `http://127.0.0.1:${port}`;
for (let i = 0; i < 100; i++) {
  if (await fetch(`${base}/api/brands`).then((r) => r.ok, () => false)) break;
  await new Promise((r) => setTimeout(r, 200));
}
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ["--no-sandbox"] });
try {
  const page = await (await browser.newContext({ viewport: { width: 1700, height: 1000 } })).newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !/GL Driver|favicon|Failed to load resource/.test(m.text()) && errors.push(m.text()));
  await page.goto(`${base}/#/macaron`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.querySelector(".mc-frame:not(.is-motion) canvas"), null, { timeout: 30000 });
  await page.waitForTimeout(2000);

  const S = () => page.evaluate(async () => {
    const m = await import("/js/macaron.js");
    const b = m.macaron.brand.body;
    const d = b.designs.find((x) => x.id === m.macaron.design);
    return {
      design: d.id, format: m.macaron.format, layer: m.macaron.layer, past: m.macaron.past.length, count: b.designs.length, status: d.status, bg: d.bg.color, entry: m.macaron.entry, rules: b.kit.rules.length, palette: b.kit.palette.map((p) => p.hex.toUpperCase()),
      layers: d.layers.map((l) => ({ id: l.id, type: l.type, text: l.text, src: l.src, x: l.x, y: l.y, w: l.w, size: l.size, hidden: l.hidden, colorRole: l.colorRole, logo: l.logo })), formats: JSON.parse(JSON.stringify(d.formats)),
    };
  });
  const go = async (id) => { await page.evaluate((i) => document.getElementById(i).scrollIntoView({ block: "start" }), id); await page.waitForTimeout(500); };
  const frame = () => page.locator(".mc-frame:not(.is-motion)").boundingBox();
  const shot = (name) => page.screenshot({ path: join(out, `${name}.png`) });
  const png = (url) => page.evaluate(async (u) => { const res = await fetch(u); const b = new Uint8Array(await res.arrayBuffer()); return { type: res.headers.get("content-type"), len: b.length, w: (b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19], h: (b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23] }; }, url);

  // ---- the flagship, from the seed
  let s = await S();
  ok(s.design === "launch" && s.format === "4:5" && s.count === 13, "the flagship opens on its launch design in 4:5", `${s.count} designs`);
  const listed = await page.evaluate(async () => (await (await fetch("api/brands")).json()).brands.map((x) => x.name));
  ok(listed.length === 1 && listed[0] === "Comfyture", "it is the one brand a first start has", listed.join(", "));

  // ---- studio: pick, retype, move, undo and redo
  await go("mc-studio");
  let f = await frame();
  await page.mouse.click(f.x + f.width * 0.3, f.y + f.height * 0.23);
  await page.waitForTimeout(400);
  s = await S();
  ok(s.layer === "headline", "clicking the headline on the canvas picks it", s.layer);
  const words = page.locator(".mc-inspector textarea.mc-text").first();
  await words.fill("Direct a shot.\nOr a *whole* film.");
  await page.waitForTimeout(300);
  await page.locator(".mc-inspector .mc-head .card-label").first().click();
  await page.waitForTimeout(500);
  s = await S();
  ok(s.layers.find((l) => l.id === "headline").text === "Direct a shot.\nOr a *whole* film." && s.past >= 1, "typing in the words changes the design, one step back kept");
  f = await frame();
  const y0 = s.layers.find((l) => l.id === "headline").y;
  await page.mouse.move(f.x + f.width * 0.3, f.y + f.height * 0.23);
  await page.mouse.down();
  await page.mouse.move(f.x + f.width * 0.3, f.y + f.height * 0.27, { steps: 6 });
  await page.mouse.move(f.x + f.width * 0.3, f.y + f.height * 0.31, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  s = await S();
  const y1 = s.layers.find((l) => l.id === "headline").y;
  ok(y1 > y0 + 0.04, "dragging moves the layer", `y ${y0} -> ${y1}`);
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(300);
  ok(Math.abs((await S()).layers.find((l) => l.id === "headline").y - y0) < 0.001, "Ctrl Z puts it back");
  await page.keyboard.press("Control+Shift+z");
  await page.waitForTimeout(300);
  ok(Math.abs((await S()).layers.find((l) => l.id === "headline").y - y1) < 0.001, "Ctrl Shift Z does it again");

  // ---- another format: an edit writes that format's own layout
  await page.locator(".mc-stage-formats .segment button", { hasText: "9:16" }).click();
  await page.waitForTimeout(500);
  f = await frame();
  await page.mouse.click(f.x + f.width * 0.3, f.y + f.height * 0.46);
  await page.waitForTimeout(300);
  const subY = (await S()).layers.find((l) => l.id === "sub").y;
  await page.keyboard.press("Shift+ArrowDown");
  await page.waitForTimeout(800);
  s = await S();
  ok(s.layer === "sub" && s.formats["9:16"].layers.sub.y !== undefined && Math.abs(s.layers.find((l) => l.id === "sub").y - subY) < 0.0001, "an edit in 9:16 writes the 9:16 layout and leaves the portrait's alone");
  await shot("story");
  await page.locator(".mc-stage-formats .segment button", { hasText: "4:5" }).click();

  // ---- a picture and a colour
  await page.locator(".mc-layer", { hasText: "The app" }).first().click();
  await page.locator(".mc-inspector button", { hasText: "Replace" }).click();
  await page.locator(".mc-pop-pic").nth(4).click();
  await page.waitForTimeout(700);
  ok((await S()).layers.find((l) => l.id === "window").src.includes("app/cut.webp"), "replacing a picture sets the layer's source");
  await page.locator(".mc-layer", { hasText: "Headline" }).first().click();
  await page.locator(".mc-inspector .mc-row", { hasText: "Colour" }).locator(".mc-dot").nth(0).click();
  await page.waitForTimeout(500);
  ok((await S()).layers.find((l) => l.id === "headline").colorRole === "yellow", "a palette colour is set on the layer");

  // ---- layers: add, order, duplicate, hide, delete, align, size, resize, guard
  await go("mc-assets");
  await page.locator(".mc-filters button", { hasText: "Mascot" }).first().click();
  const n0 = (await S()).layers.length;
  await page.locator(".mc-asset").first().hover();
  await page.locator(".mc-asset-keys .key").first().click();
  await page.waitForTimeout(600);
  s = await S();
  ok(s.layers.length === n0 + 1, "a picture can be put in the open design", `${n0} -> ${s.layers.length}`);
  await go("mc-studio");
  const added = s.layer;
  await page.locator(".mc-layer.is-on .mc-layer-keys .key").nth(3).click();
  await page.waitForTimeout(400);
  s = await S();
  ok(s.layers.findIndex((l) => l.id === added) === s.layers.length - 2, "a layer can go down in the stack");
  await page.keyboard.press("Control+d");
  await page.waitForTimeout(500);
  ok((await S()).layers.length === n0 + 2, "Ctrl D duplicates it");
  await page.locator(".mc-layer.is-on .mc-layer-keys .key").nth(0).click();
  await page.waitForTimeout(400);
  ok((await S()).layers.some((l) => l.hidden), "a layer can be hidden");
  await page.keyboard.press("Delete");
  await page.waitForTimeout(500);
  ok((await S()).layers.length === n0 + 1, "Delete removes the picked layer");
  await page.locator(".mc-layers .card-tools .key").first().click();
  await page.waitForTimeout(500);
  const tid = (await S()).layer;
  await page.locator(".mc-inspector textarea.mc-text").first().fill("A new line of words");
  await page.locator(".mc-align .key").nth(1).click();
  await page.waitForTimeout(400);
  const t = (await S()).layers.find((l) => l.id === tid);
  ok(t.type === "text" && Math.abs(t.x + t.w / 2 - 0.5) < 0.2, "a text layer can be added and centred across the safe frame", `x=${t.x} w=${t.w}`);
  const slider = page.locator(".mc-inspector .mc-row", { hasText: "Size" }).locator("input[type=range]");
  await slider.evaluate((el) => { el.value = "0.09"; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); });
  await page.waitForTimeout(400);
  ok(Math.abs((await S()).layers.find((l) => l.id === tid).size - 0.09) < 0.002, "a slider changes the type size");
  const handle = await page.locator(".mc-handle.is-se").boundingBox();
  const w0 = (await S()).layers.find((l) => l.id === tid).w;
  await page.mouse.move(handle.x + 5, handle.y + 5);
  await page.mouse.down();
  await page.mouse.move(handle.x + 45, handle.y + 25, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  ok((await S()).layers.find((l) => l.id === tid).w !== w0, "a corner handle resizes it");
  ok(/notes?|Nothing to flag/.test(await page.locator(".mc-guard summary").innerText()), "the brand guard reports");
  await shot("studio");

  // ---- the kit and the timeline
  await go("mc-kit");
  const colour = (hex) => page.locator(".mc-block input[type=color]").nth(0).evaluate((el, v) => { el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); }, hex);
  await colour("#f4ff70");
  await page.waitForTimeout(600);
  ok((await S()).palette[0] === "#F4FF70", "a palette colour can be changed");
  const rules = (await S()).rules;
  await page.locator(".is-rules .mc-add").first().click();
  await page.waitForTimeout(500);
  ok((await S()).rules === rules + 1, "a rule can be added");
  await colour("#f2ff59");
  await page.waitForTimeout(500);
  await shot("kit");
  await go("mc-history");
  const e0 = (await S()).entry;
  await page.locator(".mc-node").nth(2).click();
  await page.waitForTimeout(500);
  const e1 = (await S()).entry;
  ok(e1 && e1 !== e0, "a timeline step can be opened", e1);
  await page.locator(".is-timeline .card-tools .key").first().click();
  await page.waitForTimeout(400);
  ok((await S()).entry !== e1, "the arrows step back");

  // ---- variations: make one, revise a copy variation on its card, compare two
  await go("mc-variations");
  const count0 = (await S()).count;
  await page.locator(".mc-var-new button", { hasText: "Colour" }).click();
  await page.waitForTimeout(900);
  ok((await S()).count === count0 + 1, "making a colour variation adds a design", `${count0} -> ${(await S()).count}`);
  const copyCard = page.locator('.mc-var[data-kind="copy"]');
  const area = copyCard.locator(".mc-rev", { hasText: "Headline" }).locator("textarea");
  await area.fill("One sentence in.\nA *whole* film out.");
  await area.blur();
  await page.waitForTimeout(700);
  const rev = await page.evaluate(async () => (await import("/js/macaron.js")).macaron.brand.body.designs.find((d) => d.id === "launch-copy").layers.find((l) => l.id === "headline").text);
  ok(rev.includes("whole"), "a variation's copy can be revised on its card", rev.replace(/\n/g, " / "));
  await copyCard.locator(".mc-var-keys .key").nth(1).click();
  await page.locator('.mc-var[data-kind="colour"]').first().locator(".mc-var-keys .key").nth(1).click();
  await page.waitForTimeout(700);
  ok((await page.locator(".mc-compare figure").count()) === 2, "two variations can be compared side by side");
  await shot("variations");

  // ---- content: filters, groups, a status
  await go("mc-content");
  await page.locator(".mc-filter-row", { hasText: "Status" }).locator("button", { hasText: "Review" }).click();
  await page.waitForTimeout(500);
  const shown = await page.locator(".mc-item").count();
  ok(shown >= 2 && shown <= 5, "content can be filtered by status", `${shown} shown`);
  await page.locator(".mc-filter-row", { hasText: "Status" }).locator("button", { hasText: "All" }).click();
  await page.locator(".mc-filter-row", { hasText: "Group by" }).locator("button", { hasText: "Status" }).click();
  await page.waitForTimeout(500);
  ok((await page.locator(".mc-group").count()) === 4, "content can be grouped by status (a board)");
  await page.locator(".mc-filter-row", { hasText: "Group by" }).locator("button", { hasText: "Nothing" }).click();
  await shot("content");

  // ---- save, reload, export
  await page.waitForTimeout(900);
  const saved = await page.evaluate(async () => (await (await fetch("api/brands/brand-comfyture")).json()).project.body.designs.length);
  ok(saved === count0 + 1, "the project is saved on the server", `${saved} designs`);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() => document.querySelector(".mc-frame:not(.is-motion) canvas"), null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  ok((await S()).count === count0 + 1, "after a reload the work is there");
  await go("mc-studio");
  await page.locator(".mc-stage-tools button", { hasText: "PNG 4:5" }).click();
  await page.waitForTimeout(3500);
  const exported = await page.evaluate(async () => (await import("/js/macaron.js")).macaron.brand.body.exports[0]);
  const pic = exported ? await png(exported.url) : null;
  ok(exported?.kind === "png" && pic?.w === 1080 && pic?.h === 1350, "a PNG export is kept, 1080×1350", pic ? JSON.stringify(pic) : "none");
  if (exported) await writeFile(join(out, "export-4x5.png"), Buffer.from(await page.evaluate(async (u) => { const b = new Uint8Array(await (await fetch(u)).arrayBuffer()); let x = ""; for (let i = 0; i < b.length; i += 32768) x += String.fromCharCode(...b.subarray(i, i + 32768)); return btoa(x); }, exported.url), "base64"));

  // ---- Brioche: the model's answer is stood in for; what she does is one step, and one undo takes it back
  await page.evaluate(async () => { const m = await import("/js/macaron.js"); m.openDesign("launch"); m.setFormat("4:5"); });
  await page.waitForTimeout(500);
  const before = await S();
  await page.route("**/api/macaron/assist", (route) => route.fulfill({ json: { reply: "Done: a shorter headline on yellow.", actions: [
    { op: "edit_text", layer: "headline", text: "Say it.\n*Done.*" }, { op: "set_background", color: "yellow" }, { op: "apply_kit" }, { op: "set_status", status: "review" }, { op: "nonsense" },
  ] } }));
  await page.locator("#assistant .pill-field, #assistant .chat-input").first().click();
  await page.keyboard.type("Shorter headline, yellow ground.");
  await page.keyboard.press("Enter");
  await page.waitForFunction(async () => (await import("/js/macaron.js")).macaron.chat.messages.at(-1)?.role === "assistant", null, { timeout: 15000 });
  s = await S();
  ok(s.layers.find((l) => l.id === "headline").text === "Say it.\n*Done.*" && s.bg === "yellow" && s.status === "review", "Brioche's answer is applied: words, ground, status");
  ok(s.layers.find((l) => l.id === "wordmark").logo === "wordmark-ink" && s.layers.find((l) => l.id === "headline").colorRole === "ink", "and the kit is applied: the logo and the type read on yellow");
  ok(s.past === before.past + 1, "it is one step in the undo history", `${before.past} -> ${s.past}`);
  await page.locator("#assistant .msg .undo").last().click();
  await page.waitForTimeout(600);
  s = await S();
  ok(s.layers.find((l) => l.id === "headline").text === before.layers.find((l) => l.id === "headline").text && s.bg === before.bg && s.status === before.status && s.past === before.past, "one Undo takes all of it back");
  await page.unroute("**/api/macaron/assist");

  // ---- a new brand: colours, then a logo as SVG (sizeless, as design tools save them) and as PNG
  const svg = (await readFile(join(root, "web/brand/wordmark-ink.svg"), "utf8")).replace(/<svg([^>]*?)\s(width|height)="[^"]*"/g, "<svg$1").replace(/<svg([^>]*?)\s(width|height)="[^"]*"/g, "<svg$1");
  const yellowPng = (await readFile(join(root, "web/brand/wordmark-2400.png"))).toString("base64");
  const made = await page.evaluate(async ({ svg, yellowPng }) => {
    const m = await import("/js/macaron.js");
    await m.newBrand("Logo test");
    const kit0 = { palette: m.macaron.brand.body.kit.palette.length, logos: m.macaron.brand.body.kit.logos.length };
    for (const hex of ["#1F6FEB", "#F7F7F2", "#101418"]) { m.addColour(); m.setColour(m.macaron.brand.body.kit.palette.length - 1, hex); }
    await m.addLogoFile(new File([svg], "my-logo.svg", { type: "image/svg+xml" }));
    await m.addLogoFile(new File([Uint8Array.from(atob(yellowPng), (c) => c.charCodeAt(0))], "my-logo-yellow.png", { type: "image/png" }));
    const kit = m.macaron.brand.body.kit;
    const d = m.addDesign({ name: "First", format: "4:5" });
    await new Promise((r) => setTimeout(r, 1500));
    const rec = await m.exportPng(d.id, "4:5", { download: false });
    return { kit0, tones: kit.logos.map((l) => l.tone), urls: kit.logos.map((l) => l.url), palette: kit.palette.map((p) => p.hex), ground: kit.palette.find((p) => p.id === d.bg.color)?.hex, export: rec && { url: rec.url, w: rec.width, h: rec.height } };
  }, { svg, yellowPng });
  ok(made.kit0.palette === 0 && made.kit0.logos === 0 && made.palette.length === 3 && made.urls.length === 2, "a blank brand takes colours and two logo files", JSON.stringify(made.kit0));
  ok(made.urls[0].endsWith(".png") && made.tones[0] === "#211927" && made.tones[1] === "#F2FF59", "the SVG is kept as a PNG and each file's colour is read", made.tones.join(" "));
  ok(made.ground === "#F7F7F2", "its first design takes the ground its logo reads on", made.ground);
  if (made.export) {
    await writeFile(join(out, "new-brand-export.png"), Buffer.from(await page.evaluate(async (u) => { const b = new Uint8Array(await (await fetch(u)).arrayBuffer()); let x = ""; for (let i = 0; i < b.length; i += 32768) x += String.fromCharCode(...b.subarray(i, i + 32768)); return btoa(x); }, made.export.url), "base64"));
    // the logo is on the picture: dark pixels in the top left, where the logo layer is
    const dark = await page.evaluate(async (u) => {
      const img = await new Promise((ok2) => Object.assign(new Image(), { onload() { ok2(this); }, src: u }));
      const c = Object.assign(document.createElement("canvas"), { width: 1080, height: 1350 });
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(70, 85, 340, 130).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] < 90 && d[i + 1] < 90) n++;
      return n;
    }, made.export.url);
    ok(dark > 2000, "the uploaded logo is drawn in the design and its export", `${dark} dark pixels where it sits`);
  }

  // ---- a brand saved by the earlier Macaron: no kit, no designs; it opens, gets a kit, and starts a design
  const legacy = await page.evaluate(async () => {
    const m = await import("/js/macaron.js");
    const body = { logo: { file: "x.png", url: "brand/wordmark-2400.png", width: 2400, height: 793 }, colours: ["#F2FF59", "#211927", "#49378B", "#F0EFED"], fonts: ["Manrope", "IBM Plex Mono"], voice: ["warm"], dos: "Stay sunny", donts: "Hard sell", headline: "Taste the season", tagline: "Sweet days ahead", products: [], product: null, outputs: [], shoot: { formats: {}, count: 2 } };
    await m.newBrand("Earlier brand", body);
    await new Promise((r) => setTimeout(r, 1500));
    const b = m.macaron.brand.body;
    const kit = { palette: b.kit.palette.length, logos: b.kit.logos.length, designs: b.designs.length, tone: b.kit.logos[0]?.tone };
    const d = m.addDesign({ name: "First", format: "4:5" });
    return { kit, ground: b.kit.palette.find((p) => p.id === d.bg.color)?.hex, guard: m.guardOf().filter((g) => g.level === "bad").length };
  });
  ok(legacy.kit.palette === 4 && legacy.kit.logos === 1 && legacy.kit.designs === 0 && legacy.kit.tone === "#F2FF59", "an earlier brand gets a kit from its colours and logo", JSON.stringify(legacy.kit));
  ok(legacy.ground === "#211927" && legacy.guard === 0, "and a first design with its yellow logo on ink, nothing bad", `ground ${legacy.ground}`);

  // ---- motion: the intro rendered to a video from the same layers; a new piece gets a first timing
  await page.evaluate(async () => { const m = await import("/js/macaron.js"); await m.openBrand("brand-comfyture"); });
  await page.waitForTimeout(2000);
  const render = await page.evaluate(async () => (await import("/js/macaron.js")).renderMotion("m-intro"));
  ok(render && render.width === 1080 && render.height === 1920 && render.duration === 7 && render.sound && render.bytes > 200000, "the intro renders to a 7 s video, 1080×1920, with sound", render && `${render.width}×${render.height} ${render.duration} s ${Math.round(render.bytes / 1024)} KB`);
  if (render) {
    const head = await page.evaluate(async (u) => { const r = await fetch(u); const b = new Uint8Array(await r.arrayBuffer()); return { type: r.headers.get("content-type"), box: String.fromCharCode(...b.subarray(4, 8)) }; }, render.url);
    ok(head.box === "ftyp" && /video\/mp4/.test(head.type), "it is an MP4", JSON.stringify(head));
  }
  const fresh = await page.evaluate(async () => {
    const m = await import("/js/macaron.js");
    m.openDesign("brioche");
    const piece = m.addMotion();
    const d = m.designNow();
    const moving = d.layers.filter((l) => l.anim);
    return { piece: piece.duration, moving: moving.length, of: d.layers.length, lid: !!moving.find((l) => l.type === "logo")?.anim.lid, first: moving.find((l) => l.type === "logo")?.anim.in.fx, pops: piece.sound.pops.length, out: moving.some((l) => l.anim.t1 !== undefined) };
  });
  ok(fresh.moving === fresh.of && fresh.lid && fresh.first === "wipe-r" && fresh.pops === 1 && !fresh.out, "a new motion piece starts with a timing: the logo and its lid, then the rest in", JSON.stringify(fresh));

  ok(errors.length === 0, "no errors in the page", errors.slice(0, 3).join(" | "));
} finally {
  await browser.close();
  server.kill();
  await rm(dataDir, { recursive: true, force: true });
  if (!process.env.OUT) await rm(out, { recursive: true, force: true });
}
console.log(failures ? `${failures} FAILED` : "all passed");
process.exit(failures ? 1 : 0);
