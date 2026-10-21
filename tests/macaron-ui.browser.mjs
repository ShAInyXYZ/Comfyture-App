// Macaron in a real browser, end to end, on a server of its own and a folder of its own. The room: Brioche's panel
// (her portrait, the brand open, the three workspaces with their counts, her tools for the one that is open), and the
// grids of bentos of Design idea, Brand kit and Content, each fitting one screen; a bento opening as a window over a
// dimmed screen (closed by Esc, by its key and by the veil), windows stacking (the editor, then its variations) and
// coming back; the Advanced switch; the logos' marquee. Then the work itself, through the windows: the flagship opens
// from the seed; a layer is picked, moved, retyped, laid out in another format, given a new picture and colour; undo
// and redo; a variation; save, reload, a PNG export; the kit, the story, the pictures, the layers, the variations and
// the posts; Download all; Brioche's answers applied as one undo step in each workspace (the model's answer is stood
// in for, so it needs no key), the workspace she is told about and the tool she was asked through; a new brand with its
// colours and a logo as SVG and as PNG; a brand saved by an earlier Macaron; the intro rendered to a video, and a first
// timing for a new motion piece; then what must hold between brands and pieces: one brand's unfinished edit is never
// undone into another, a save is not lost when the brand is switched, the motion controls change the piece they show,
// a layer hidden in one format shows in the others, and a new picture keeps its cost and its job (Comfy Router is stood
// in for by tests/macaron-fake-router.mjs: no credits are spent).
// Not part of `node --test` (it needs a browser and ffmpeg). From the repo root:
//   NODE_PATH=<a node_modules that has playwright> CHROME=<chrome or chromium binary> node tests/macaron-ui.browser.mjs
// OUT=<folder> keeps screenshots of the workspaces and windows, and the exported files, to be looked at.
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
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
// (a key that opens nothing, and Router's picture models stood in for)
const fakeRouter = pathToFileURL(join(root, "tests/macaron-fake-router.mjs")).href;
const server = spawn(process.execPath, ["server/main.ts"], { cwd: root, env: { ...process.env, PORT: String(port), COMFYTURE_DATA: dataDir, COMFY_API_KEY: "test-key", COMFY_BASE_URL: "http://127.0.0.1:9", NODE_OPTIONS: `--import=${fakeRouter}`, MACARON_FAKE_LOG: join(dataDir, "writer-requests.jsonl") }, stdio: "ignore" });
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
  await page.waitForSelector(".mc-side .mcb-card", { timeout: 30000 });
  await page.waitForFunction(() => document.querySelector(".mc-grid:not([hidden]) .mc-bento"), null, { timeout: 30000 });
  await page.waitForTimeout(2500);

  const S = () => page.evaluate(async () => {
    const m = await import("/js/macaron.js");
    const b = m.macaron.brand.body;
    const d = b.designs.find((x) => x.id === m.macaron.design);
    const shown = m.layoutNow().layers;
    return {
      design: d.id, format: m.macaron.format, layer: m.macaron.layer, past: m.macaron.past.length, count: b.designs.length, status: d.status, bg: d.bg.color, entry: m.macaron.entry, rules: b.kit.rules.length, palette: b.kit.palette.map((p) => p.hex.toUpperCase()),
      // whether a layer is hidden is the open format's: it is read from the layout, not from the layer
      layers: d.layers.map((l) => ({ id: l.id, type: l.type, text: l.text, src: l.src, x: l.x, y: l.y, w: l.w, size: l.size, hidden: shown.find((x) => x.id === l.id)?.hidden, colorRole: l.colorRole, logo: l.logo })), formats: JSON.parse(JSON.stringify(d.formats)),
    };
  });
  // where a user goes: a workspace by its tile in Brioche's panel, a window by its bento, the editor by a post
  const closeAll = async () => {
    for (let n = 0; await page.locator(".mc-winhost:not([hidden])").count(); n++) {
      if (n > 6) throw new Error("a window will not close");
      await page.locator(".mc-winhost:not([hidden]) .mc-close").click();
      await page.waitForTimeout(250);
    }
  };
  const space = async (id) => { await closeAll(); await page.locator(`.mcb-card[data-space="${id}"]`).click(); await page.waitForTimeout(500); };
  const openBento = async (cls) => { await closeAll(); await page.locator(`.mc-bento.is-${cls} .mc-expand`).click(); await page.locator(".mc-winhost:not([hidden]) .mc-win").waitFor(); await page.waitForTimeout(600); };
  const openEditor = async (nth = 0) => { await space("content"); await page.locator(".mc-post").nth(nth).click(); await page.waitForSelector('.mc-win[data-win="editor"] .mc-frame:not(.is-motion) canvas', { timeout: 15000 }); await page.waitForTimeout(900); };
  const winNow = () => page.evaluate(async () => { const m = await import("/js/macaron.js"); return { win: m.macaron.win, stack: [...m.macaron.winStack], space: m.macaron.space }; });
  const store = (fn, arg) => page.evaluate(async ({ src, arg }) => { const m = await import("/js/macaron.js"); return new Function("m", "arg", `return (${src})(m, arg)`)(m, arg); }, { src: fn.toString(), arg });
  const frame = () => page.locator(".mc-frame:not(.is-motion)").boundingBox();
  const shot = (name) => page.screenshot({ path: join(out, `${name}.png`) });
  const png = (url) => page.evaluate(async (u) => { const res = await fetch(u); const b = new Uint8Array(await res.arrayBuffer()); return { type: res.headers.get("content-type"), len: b.length, w: (b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19], h: (b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23] }; }, url);

  // ---- the room: Brioche's panel, and a grid of bentos for each of the three workspaces
  const side = await page.evaluate(() => ({
    name: document.querySelector(".mcb-eyebrow")?.textContent.split("·").pop().trim(), tag: document.querySelector(".mcb-eyebrow")?.textContent,
    pic: (() => { const i = document.querySelector(".mcb-seal img"); return !!i && i.complete && i.naturalWidth > 0; })(),
    round: getComputedStyle(document.querySelector(".mcb-seal img")).borderRadius, project: document.querySelector(".mcb-brand .sel-label")?.textContent,
    spaces: [...document.querySelectorAll(".mcb-card")].map((b) => [b.querySelector(".mcb-face b").textContent, b.querySelector(".mcb-chip span:last-child").textContent, b.classList.contains("is-on"), b.querySelector("img")?.naturalWidth > 0]),
    label: document.querySelector(".mc-tools-label")?.textContent, tools: [...document.querySelectorAll(".mc-tool .mc-tool-name")].map((t) => t.textContent),
  }));
  ok(side.name === "Brioche" && /brand room/i.test(side.tag) && side.pic && side.round === "50%" && side.project === "Comfyture", "Brioche's panel: her round portrait, her name and room, the brand open", JSON.stringify([side.name, side.tag, side.project]));
  ok(side.spaces.map((x) => x[0]).join() === "Design idea,Brand kit,Content" && side.spaces.every((x) => x[3]) && side.spaces.map((x) => x[1]).join() === "12,11,07", "three workspaces, each with its picture and its count", side.spaces.map((x) => `${x[0]} ${x[1]}`).join(", "));
  ok(side.spaces.filter((x) => x[2]).map((x) => x[0]).join() === "Brand kit" && /brioche's tools/i.test(side.label) && side.tools.join() === "Make a colourway,Check contrast,Export the kit", "the open workspace is lit, and her tools are its own", side.tools.join(", "));
  const kitGrid = await page.evaluate(() => {
    const grid = document.querySelector(".mc-grid.is-kit");
    const boxes = [...grid.querySelectorAll(":scope > .mc-bento")].map((b) => ({ label: b.querySelector(".mc-b-label").textContent, rect: b.getBoundingClientRect(), expand: !!b.querySelector(".mc-expand") }));
    const g = grid.getBoundingClientRect();
    return { labels: boxes.map((b) => b.label), paletteFirst: boxes[0].rect.top === Math.min(...boxes.map((b) => b.rect.top)), paletteWide: boxes[0].rect.width / g.width, expands: boxes.every((b) => b.expand), swatches: grid.querySelectorAll(".mc-sw").length, share: grid.querySelectorAll(".mc-share i").length, hidden: [...document.querySelectorAll(".mc-grid")].filter((x) => x.hidden).length };
  });
  ok(kitGrid.labels.join() === "Palette,Logos,Type,Voice,Rules,Product" && kitGrid.expands, "Brand kit is six bentos, each with its expand key: palette, logos, type, voice, rules, product", kitGrid.labels.join(", "));
  ok(kitGrid.paletteFirst && kitGrid.paletteWide > 0.97 && kitGrid.swatches === 4 && kitGrid.share === 4 && kitGrid.hidden === 2, "the palette comes first, the width of the screen: four big swatches and the bar of how much each takes", `${Math.round(kitGrid.paletteWide * 100)}% wide`);
  const fits = () => page.evaluate(() => ({ h: document.documentElement.scrollHeight, vh: innerHeight, w: document.documentElement.scrollWidth, vw: innerWidth }));
  let fit = await fits();
  ok(fit.h <= fit.vh + 2 && fit.w <= fit.vw, "Brand kit fits one screen", `${fit.h} of ${fit.vh}`);
  await shot("room-kit");

  // the logos: the wordmark, the mark and the app icon, and the other colourways passing by like a marquee
  const logosEl = await page.evaluate(() => ({
    hero: [...document.querySelectorAll(".mc-logo-hero .mc-ctile")].map((t) => t.dataset.kind), ways: document.querySelectorAll(".mc-marq-track .mc-ctile").length, arrows: document.querySelectorAll(".mc-marq-arrow").length,
    fade: getComputedStyle(document.querySelector(".mc-marq-view")).maskImage || getComputedStyle(document.querySelector(".mc-marq-view")).webkitMaskImage, srcs: [...document.querySelectorAll(".mc-logo-hero img")].map((i) => i.getAttribute("src")),
  }));
  ok(logosEl.hero.join() === "wordmark,mark,icon" && logosEl.ways === 16 && logosEl.arrows === 2 && /gradient/.test(logosEl.fade), "the logos bento: wordmark, mark and app icon big, the other colourways in a marquee with arrows and faded edges", `${logosEl.ways} tiles`);
  const slide = () => page.evaluate(() => document.querySelector(".mc-marq-track").style.transform);
  const m0 = await slide();
  await page.waitForTimeout(1400);
  const m1 = await slide();
  ok(m0 !== m1, "the marquee moves by itself", `${m0} -> ${m1}`);
  await page.hover(".mc-marq-view");
  const h0 = await slide();
  await page.waitForTimeout(700);
  ok(h0 === (await slide()), "and holds still while it is pointed at");
  await page.mouse.move(20, 20);
  const a0 = await slide();
  await page.locator(".mc-marq-arrow").last().click();
  await page.waitForTimeout(600);
  const a1 = await slide();
  const px = (t) => parseFloat(t.match(/\((-?[\d.]+)/)[1]);
  ok(Math.abs(px(a1) - px(a0)) > 100, "an arrow moves it on", `${a0} -> ${a1}`);
  await page.locator('.mc-ctile.is-way[data-kind="wordmark"][data-tone="plum"]').first().dispatchEvent("click");
  await page.waitForTimeout(500);
  const plum = await page.evaluate(() => [...document.querySelectorAll(".mc-logo-hero img")].map((i) => i.getAttribute("src")));
  ok(plum.every((s) => /plum/.test(s)), "a colourway in the marquee is put in the big tiles", plum.join(" "));
  await page.locator('.mc-ctile.is-way[data-kind="wordmark"][data-tone="yellow"]').first().dispatchEvent("click").catch(() => {});
  await store((m) => m.setColourway(null));

  // Design idea
  await space("idea");
  const idea = await page.evaluate(() => {
    const grid = document.querySelector(".mc-grid.is-idea");
    return {
      shown: !grid.hidden, labels: [...grid.querySelectorAll(":scope > .mc-bento .mc-b-label")].map((x) => x.textContent), pitch: grid.querySelector(".mc-pitch")?.textContent, goals: [...grid.querySelectorAll(".mc-chips.is-goals .mc-chip")].map((x) => x.textContent),
      briefPic: !!grid.querySelector(".mc-brief-pic img")?.complete, tiles: grid.querySelectorAll(".mc-mtile").length, steps: [...grid.querySelectorAll(".mc-step b")].map((x) => x.textContent), dirs: [...grid.querySelectorAll(".mc-dir")].map((d) => [d.querySelector("b").textContent, d.classList.contains("is-picked")]),
      tools: [...document.querySelectorAll(".mc-tool .mc-tool-name")].map((t) => t.textContent), lit: document.querySelector(".mcb-card.is-on .mcb-face b")?.textContent,
    };
  });
  ok(idea.shown && idea.labels.join() === "The brief,Moodboard,The story,Directions" && /warm, playful/i.test(idea.pitch) && idea.goals.length === 3 && idea.briefPic, "Design idea: the brief (its idea in two lines, three goals, a picture), the moodboard, the story, the directions", idea.labels.join(", "));
  ok(idea.tiles === 6 && idea.steps.join() === "The spark,The palette,The mark,The room" && idea.dirs.length === 3 && idea.dirs.filter((d) => d[1]).map((d) => d[0]).join() === "Warm and bold", "a moodboard of six, a story of four chapters, three directions with one picked", `${idea.steps.join(" > ")}`);
  ok(idea.lit === "Design idea" && idea.tools.join() === "New direction,Add references,Write the brief", "the tools follow the workspace: New direction, Add references, Write the brief", idea.tools.join(", "));
  ok((await page.evaluate(async () => (await import("/js/harnesses.js")).roomOf("macaron"))) === "idea", "the bar is told which workspace is open");
  fit = await fits();
  ok(fit.h <= fit.vh + 2 && fit.w <= fit.vw, "Design idea fits one screen", `${fit.h} of ${fit.vh}`);
  await shot("room-idea");
  await page.locator(".mc-dir").nth(1).click();
  await page.waitForTimeout(500);
  let picked = await store((m) => m.macaron.brand.body.directions.map((d) => d.picked));
  ok(picked.join() === "false,true,false", "a direction is picked by its card", picked.join());
  await page.locator(".mc-dir").nth(0).click();
  await page.waitForTimeout(400);
  picked = await store((m) => m.macaron.brand.body.directions.map((d) => d.picked));
  ok(picked.join() === "true,false,false", "and the first again", picked.join());

  // Content
  await space("content");
  const content = await page.evaluate(() => {
    const grid = document.querySelector(".mc-grid.is-content");
    const frameBox = grid.querySelector(".mc-reel-frame").getBoundingClientRect();
    const pics = [...grid.querySelectorAll(".mc-post-pic")].map((p) => Math.round(p.getBoundingClientRect().height));
    return {
      labels: [...grid.querySelectorAll(":scope > .mc-bento .mc-b-label")].map((x) => x.textContent),
      week: [...grid.querySelectorAll(".mc-wk")].map((w) => [w.querySelector("em").textContent, w.querySelector("b").textContent, w.querySelector(".mc-wk-status").textContent.trim()]),
      ratio: frameBox.width / frameBox.height, time: grid.querySelector(".mc-reel-time")?.textContent, play: !!grid.querySelector(".mc-play-big"), tag: grid.querySelector(".mc-reel-tag")?.textContent.replace(/\s+/g, " ").trim(),
      posts: [...grid.querySelectorAll(".mc-post .mc-post-foot")].map((f) => `${f.querySelector(".mc-fmtchip").textContent.trim()} ${f.querySelector("b").textContent.trim()}`), pics, chips: [...grid.querySelectorAll(".mc-xchip")].map((c) => [c.textContent.trim(), c.getAttribute("aria-pressed")]), all: grid.querySelector(".mc-dlall")?.textContent.trim(),
      tools: [...document.querySelectorAll(".mc-tool .mc-tool-name")].map((t) => t.textContent),
    };
  });
  ok(content.labels.join() === "This week,Motion,Posts,Export" && content.week.map((w) => w.join(" ")).join() === "MON Post Ready,WED Story Ready,FRI Reel Scheduled,SUN Post In review", "Content: this week's four posts by day, kind and status", content.week.map((w) => w.join(" ")).join(", "));
  ok(Math.abs(content.ratio - 9 / 16) < 0.02 && content.time === "0:08" && content.play && /9:16/.test(content.tag), "the motion bento is a 9:16 frame with a play key, its length and its format", `${content.ratio.toFixed(3)} ${content.time} ${content.tag}`);
  ok(content.posts.join() === "4:5 Post,1:1 Post,9:16 Story,4:5 Post" && Math.max(...content.pics) - Math.min(...content.pics) <= 2, "the posts are shown by format, side by side at one height", `${content.posts.join(", ")} ${content.pics.join("/")} px`);
  ok(content.chips.map((c) => c[0]).join() === "PNG,JPG,MP4,WEBM" && /Download all/.test(content.all) && content.tools.join() === "A post from a design,A story version,Animate it", "the export bento: PNG, JPG, MP4, WEBM and Download all; the tools are Content's", content.chips.map((c) => c.join("=")).join(" "));
  fit = await fits();
  ok(fit.h <= fit.vh + 2 && fit.w <= fit.vw, "Content fits one screen", `${fit.h} of ${fit.vh}`);
  await shot("room-content");
  await page.locator(".mc-xchip", { hasText: "JPG" }).first().click();
  await page.waitForTimeout(300);
  ok((await store((m) => m.macaron.exportKinds.jpg)) === true, "an export kind is a toggle");
  await page.locator(".mc-xchip", { hasText: "JPG" }).first().click();

  // ---- a bento opens as a window over a dimmed screen
  await space("kit");
  await page.locator(".is-palette .mc-b-label").click();
  await page.locator(".mc-winhost:not([hidden]) .mc-win").waitFor();
  await page.waitForTimeout(500);
  const win1 = await page.evaluate(() => {
    const w = document.querySelector(".mc-win");
    const veil = getComputedStyle(document.querySelector(".mc-veil"));
    return { id: w.dataset.win, title: w.querySelector(".mc-win-head h2").textContent, sub: w.querySelector(".mc-win-sub").textContent, adv: w.querySelector(".mc-switch")?.getAttribute("aria-checked"), cards: w.querySelectorAll(".mc-pcard").length, dim: veil.backgroundColor, centred: Math.abs((w.getBoundingClientRect().left + w.getBoundingClientRect().right) / 2 - innerWidth / 2) < 2, bottom: w.getBoundingClientRect().bottom, bar: document.querySelector("#assistant").getBoundingClientRect().top, body: document.body.classList.contains("mc-has-win") };
  });
  ok(win1.id === "palette" && win1.title === "Palette" && win1.sub === "Comfyture" && win1.cards === 4 && win1.adv === "false" && win1.centred && win1.body, "a bento opens as a centred window with its title, the brand's name and an Advanced switch", JSON.stringify([win1.id, win1.title, win1.adv]));
  ok(/rgba\(/.test(win1.dim) && win1.bottom <= win1.bar + 1, "the screen behind is dimmed, and Brioche's bar stays below the window", `window ends ${Math.round(win1.bottom)}, the bar starts ${Math.round(win1.bar)}`);
  await shot("window-palette");
  ok((await page.locator(".mc-win .mc-hex").count()) === 0, "the finer controls are hidden");
  await page.locator(".mc-switch").click();
  await page.waitForTimeout(400);
  ok((await page.locator(".mc-win .mc-hex").count()) === 4 && (await page.locator(".mc-switch").getAttribute("aria-checked")) === "true" && (await page.locator(".mc-pair-chip").count()) === 6, "Advanced shows each colour's hex and how colours read on each other", `${await page.locator(".mc-win .mc-hex").count()} hex fields`);
  await page.locator(".mc-switch").click();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(350);
  ok((await winNow()).win === null && (await page.locator(".mc-winhost:not([hidden])").count()) === 0, "Esc closes the window");
  await page.locator(".is-logos .mc-b-label").click();
  await page.locator(".mc-winhost:not([hidden]) .mc-win").waitFor();
  await page.waitForTimeout(500);
  const lw = await page.evaluate(() => ({ rows: [...document.querySelectorAll(".mc-lrow")].map((r) => [r.querySelector(".mc-lrow-label").textContent, r.querySelectorAll(".mc-lcell:not(.is-empty)").length, r.querySelectorAll(".mc-lcell.is-empty").length]), names: [...document.querySelectorAll(".mc-lrow:first-child .mc-lcell-name")].map((n) => n.textContent), dl: document.querySelectorAll(".mc-lcell-dl").length }));
  ok(lw.rows.map((r) => r.join(":")).join() === "WORDMARK:4:0,MARK:4:0,APP ICON:3:1" && lw.names.join() === "Yellow on ink,Ink on yellow,White on plum,Plum on white" && lw.dl === 11, "the logos window: wordmark, mark and app icon in their colourways, each with its download", lw.rows.map((r) => r.join(":")).join(" "));
  await shot("window-logos");
  await page.mouse.click(8, 600);
  await page.waitForTimeout(350);
  ok((await winNow()).win === null, "a click on the dimmed screen closes it");
  await page.locator(".is-logos .mc-expand").click();
  await page.locator(".mc-winhost:not([hidden]) .mc-win").waitFor();
  await page.locator(".mc-win .mc-close").click();
  await page.waitForTimeout(350);
  ok((await winNow()).win === null, "and so does its key");
  await page.locator(".is-type").click({ position: { x: 40, y: 120 } });
  await page.waitForTimeout(500);
  ok((await winNow()).win === "type", "a click anywhere on a bento opens it");
  await closeAll();

  // ---- every bento has its window, and what the seven sections held before is in them
  const windows = [
    ["kit", "palette", "Palette", true], ["kit", "logos", "Logos", true], ["kit", "type", "Type", true], ["kit", "voice", "Voice", true], ["kit", "rules", "Rules", true], ["kit", "product", "Product and pictures", false],
    ["idea", "brief", "The brief", false], ["idea", "mood", "Moodboard", false], ["idea", "story", "The story", false], ["idea", "dirs", "Directions", false],
    ["content", "week", "This week", false], ["content", "motion", "Motion", false], ["content", "posts", "Posts", false], ["content", "export", "Export", false],
  ];
  const wrong = [];
  for (const [sp, cls, title, adv] of windows) {
    await space(sp);
    await openBento(cls);
    const w = await page.evaluate(() => { const e = document.querySelector(".mc-winhost:not([hidden]) .mc-win"); return { title: e.querySelector("h2").textContent, adv: !!e.querySelector(".mc-switch:not([hidden])"), filled: e.querySelector(".mc-win-body").innerText.trim().length > 20 }; });
    if (w.title !== title || w.adv !== adv || !w.filled) wrong.push(`${cls}: ${JSON.stringify(w)}`);
  }
  await closeAll();
  ok(wrong.length === 0, "every bento opens its window, with an Advanced switch where there are finer controls: palette, logos, type, voice, rules", wrong.join(" | ") || `${windows.length} windows`);
  await space("kit");
  await openBento("logos");
  await page.locator(".mc-switch").click();
  await page.waitForTimeout(500);
  ok((await page.locator(".mc-lfile").count()) === 11 && (await page.locator(".mc-lcell.is-empty").count()) >= 1, "the logos window's Advanced lists the files: name, kind, colour, grounds", `${await page.locator(".mc-lfile").count()} files`);
  await page.locator(".mc-switch").click();
  await closeAll();

  // ---- windows stack: the editor, its variations over it, and back
  await space("content");
  await page.locator(".mc-post").first().click();
  await page.locator('.mc-win[data-win="editor"]').waitFor();
  await page.waitForTimeout(700);
  await page.locator(".mc-win-tools button", { hasText: "Variations" }).click();
  await page.waitForTimeout(500);
  let stacked = await winNow();
  ok(stacked.win === "variations" && stacked.stack.join() === "editor", "a window opens over another", JSON.stringify(stacked));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(350);
  stacked = await winNow();
  ok(stacked.win === "editor" && stacked.stack.length === 0, "Esc brings the one under it back", JSON.stringify(stacked));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(350);
  ok((await winNow()).win === null, "and the next Esc closes that");
  await closeAll();

  // ---- the flagship, from the seed
  let s = await S();
  ok(s.design === "launch" && s.format === "4:5" && s.count === 13, "the flagship opens on its launch design in 4:5", `${s.count} designs`);
  const listed = await page.evaluate(async () => (await (await fetch("api/brands")).json()).brands.map((x) => x.name));
  ok(listed.length === 1 && listed[0] === "Comfyture", "it is the one brand a first start has", listed.join(", "));

  // ---- the editor: a post opens in it, in a window over the content; pick, retype, move, undo and redo
  await openEditor();
  const ew = await page.evaluate(() => ({ title: document.querySelector(".mc-win-head h2").textContent, keys: [...document.querySelectorAll(".mc-win-tools .key")].map((k) => k.textContent.trim()), canvas: !!document.querySelector(".mc-win .mc-stage-canvas"), layers: document.querySelectorAll(".mc-win .mc-layer").length }));
  ok(/launch/i.test(ew.title) && ew.keys.includes("Variations") && ew.keys.includes("Animate") && ew.canvas && ew.layers >= 8, "a post opens in the layered editor, in its window: the post's name, Variations and Animate beside it", `${ew.title} · ${ew.keys.join(", ")} · ${ew.layers} layers`);
  const fitsIn = await page.evaluate(() => { const w = document.querySelector(".mc-win").getBoundingClientRect(); const t = document.querySelector(".mc-win .mc-stage-tools").getBoundingClientRect(); return { tools: Math.round(t.bottom), win: Math.round(w.bottom), bar: Math.round(document.querySelector("#assistant").getBoundingClientRect().top) }; });
  ok(fitsIn.tools <= fitsIn.win && fitsIn.win <= fitsIn.bar, "the whole editor is in its window, above Brioche's bar: the canvas, the layers, the keys under it", JSON.stringify(fitsIn));
  await shot("window-editor");
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
  await page.locator(".mc-pop").waitFor();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  ok((await page.locator(".mc-pop").count()) === 0 && (await winNow()).win === "editor", "Esc closes a picture's picker and leaves the window under it open");
  await page.locator(".mc-inspector button", { hasText: "Replace" }).click();
  await page.locator(".mc-pop-pic").nth(4).click();
  await page.waitForTimeout(700);
  ok((await S()).layers.find((l) => l.id === "window").src.includes("app/cut.webp"), "replacing a picture sets the layer's source");
  await page.locator(".mc-layer", { hasText: "Headline" }).first().click();
  await page.locator(".mc-inspector .mc-row", { hasText: "Colour" }).locator(".mc-dot").nth(0).click();
  await page.waitForTimeout(500);
  ok((await S()).layers.find((l) => l.id === "headline").colorRole === "yellow", "a palette colour is set on the layer");

  // ---- layers: the Picture key opens the product window over the editor; add, order, duplicate, hide, delete, align, size, resize, guard
  await page.locator(".mc-stage-tools").getByRole("button", { name: "Picture", exact: true }).click();
  await page.locator('.mc-win[data-win="product"]').waitFor();
  await page.waitForTimeout(500);
  let wn = await winNow();
  ok(wn.win === "product" && wn.stack.join() === "editor", "the Picture key opens the product window over the editor", JSON.stringify(wn));
  ok((await page.locator(".mc-ptabs button").allInnerTexts()).join() === "Product,Pictures,Make a picture,Shoot", "its tabs: the product, its pictures, making one, the shoot");
  await page.locator(".mc-ptabs button", { hasText: "Pictures" }).click();
  await page.waitForTimeout(400);
  await page.locator(".mc-filters button", { hasText: "Mascot" }).first().click();
  const n0 = (await S()).layers.length;
  await page.locator(".mc-asset").first().hover();
  await page.locator(".mc-asset-keys .key").first().click();
  await page.waitForTimeout(600);
  s = await S();
  ok(s.layers.length === n0 + 1, "a picture can be put in the open design", `${n0} -> ${s.layers.length}`);
  await page.locator(".mc-winhost:not([hidden]) .mc-close").click();
  await page.waitForTimeout(500);
  ok((await winNow()).win === "editor" && (await page.locator(".mc-win .mc-stage-canvas").count()) === 1, "closing the product window brings the editor back");
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

  // ---- the kit: a colour changed in the palette window, a rule added in the rules window
  await space("kit");
  await openBento("palette");
  const colour = (hex) => page.locator(".mc-pblock input[type=color]").nth(0).evaluate((el, v) => { el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); }, hex);
  await colour("#f4ff70");
  await page.waitForTimeout(600);
  ok((await S()).palette[0] === "#F4FF70", "a palette colour can be changed");
  await closeAll();
  await openBento("rules");
  const rules = (await S()).rules;
  await page.locator(".mc-w.is-rules .mc-add").first().click();
  await page.waitForTimeout(500);
  ok((await S()).rules === rules + 1, "a rule can be added");
  await closeAll();
  await openBento("palette");
  await colour("#f2ff59");
  await page.waitForTimeout(500);
  await closeAll();
  await shot("kit");

  // ---- the story: a step opened, the arrows, a note of one's own
  await space("idea");
  await openBento("story");
  const e0 = (await S()).entry;
  await page.locator(".mc-node").nth(2).click();
  await page.waitForTimeout(500);
  const e1 = (await S()).entry;
  ok(e1 && e1 !== e0, "a story step can be opened", e1);
  await page.locator(".mc-strip").focus();
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(400);
  ok((await S()).entry !== e1, "the arrows step back");
  await page.locator(".mc-story-add input").fill("A note from the test");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);
  ok(await store((m) => m.macaron.brand.body.history.some((x) => x.title === "A note from the test" && x.kind === "note")), "a note of one's own joins the story");
  await closeAll();

  // ---- variations: the editor's key opens them over it; make one, revise a copy variation on its card, compare two
  await openEditor();
  await page.locator(".mc-win-tools button", { hasText: "Variations" }).click();
  await page.locator('.mc-win[data-win="variations"]').waitFor();
  await page.waitForTimeout(700);
  wn = await winNow();
  ok(wn.win === "variations" && wn.stack.join() === "editor", "the Variations key opens them over the editor", JSON.stringify(wn));
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
  await page.locator(".mc-winhost:not([hidden]) .mc-close").click();
  await page.waitForTimeout(400);
  ok((await winNow()).win === "editor", "closing them brings the editor back");
  await closeAll();

  // ---- the posts: filters, groups, a status
  await space("content");
  await openBento("posts");
  await page.locator(".mc-filter-row", { hasText: "Status" }).locator("button", { hasText: "Review" }).click();
  await page.waitForTimeout(500);
  const shown = await page.locator(".mc-item").count();
  ok(shown >= 2 && shown <= 5, "content can be filtered by status", `${shown} shown`);
  await page.locator(".mc-filter-row", { hasText: "Status" }).locator("button", { hasText: "All" }).click();
  await page.locator(".mc-filter-row", { hasText: "Group by" }).locator("button", { hasText: "Status" }).click();
  await page.waitForTimeout(500);
  ok((await page.locator(".mc-group").count()) === 4, "content can be grouped by status (a board)");
  await page.locator(".mc-filter-row", { hasText: "Group by" }).locator("button", { hasText: "Nothing" }).click();
  await shot("window-posts");
  await closeAll();

  // ---- save, reload, export
  await page.waitForTimeout(900);
  const saved = await page.evaluate(async () => (await (await fetch("api/brands/brand-comfyture")).json()).project.body.designs.length);
  ok(saved === count0 + 1, "the project is saved on the server", `${saved} designs`);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(".mc-side .mcb-card", { timeout: 30000 });
  await page.waitForTimeout(2500);
  ok((await S()).count === count0 + 1, "after a reload the work is there");
  wn = await winNow();
  ok(wn.space === "content" && wn.win === null, "the workspace that was open is open again, with no window over it", JSON.stringify(wn));
  await openEditor();
  await page.locator(".mc-stage-tools button", { hasText: "PNG 4:5" }).click();
  await page.waitForTimeout(3500);
  const exported = await page.evaluate(async () => (await import("/js/macaron.js")).macaron.brand.body.exports[0]);
  const pic = exported ? await png(exported.url) : null;
  ok(exported?.kind === "png" && pic?.w === 1080 && pic?.h === 1350, "a PNG export is kept, 1080×1350", pic ? JSON.stringify(pic) : "none");
  if (exported) await writeFile(join(out, "export-4x5.png"), Buffer.from(await page.evaluate(async (u) => { const b = new Uint8Array(await (await fetch(u)).arrayBuffer()); let x = ""; for (let i = 0; i < b.length; i += 32768) x += String.fromCharCode(...b.subarray(i, i + 32768)); return btoa(x); }, exported.url), "base64"));

  // ---- Download all: this week's plan as pictures, one after the other (MP4 off, the plan's scope on)
  await space("content");
  await openBento("export");
  await page.locator(".mc-w.is-export .mc-xchip", { hasText: "MP4" }).click();
  await page.locator(".mc-w.is-export .segment button", { hasText: "This week" }).click();
  await page.waitForTimeout(300);
  const plan = await page.evaluate(async () => {
    const m = await import("/js/macaron.js");
    const { ownFormats } = await import("/js/design.js");
    const pool = m.macaron.brand.body.designs.filter((d) => !d.variant && d.plan?.day);
    return { jobs: pool.reduce((n, d) => n + (d.motion ? 1 : ownFormats(d).length), 0), ids: pool.map((d) => d.id), had: m.macaron.brand.body.exports.length, kinds: m.macaron.exportKinds, scope: m.macaron.exportScope };
  });
  ok(plan.ids.join() === "launch,brioche,intro" && plan.kinds.png && !plan.kinds.mp4 && plan.scope === "week" && plan.jobs >= 5, "the export window picks the kinds and the posts: pictures only, this week's plan", `${plan.jobs} files from ${plan.ids.join(", ")}`);
  await page.locator(".mc-w.is-export .mc-dlall").click();
  const sawProgress = await page.waitForFunction(() => /\d+ \/ \d+/.test(document.querySelector(".mc-w.is-export .mc-dlall")?.textContent ?? ""), null, { timeout: 8000 }).then(() => true, () => false);
  await page.waitForFunction(async () => { const m = await import("/js/macaron.js"); return !m.macaron.bulk; }, null, { timeout: 90000 });
  await page.waitForTimeout(1200);
  const made3 = await store((m) => m.macaron.brand.body.exports.length);
  ok(made3 === plan.had + plan.jobs, "Download all makes every picture of the plan, in every layout a post has of its own", `${plan.had} -> ${made3} (${plan.jobs} expected)${sawProgress ? ", with its progress on the key" : ""}`);
  ok((await page.locator(".mc-w.is-export .mc-export").count()) >= Math.min(40, made3), "and the window lists what has left");
  await closeAll();

  // ---- the other kinds a post can leave as: a JPG, and a short piece as a WebM
  const jpg = await page.evaluate(async () => {
    const m = await import("/js/macaron.js");
    const rec = await m.exportPng("launch", "4:5", { download: false, kind: "jpg" });
    const bytes = rec ? new Uint8Array(await (await fetch(rec.url)).arrayBuffer()) : null;
    return rec && { kind: rec.kind, url: rec.url, w: rec.width, h: rec.height, magic: [...bytes.subarray(0, 3)] };
  });
  ok(jpg?.kind === "jpg" && /\.jpg$/.test(jpg.url) && jpg.magic.join() === "255,216,255" && jpg.w === 1080 && jpg.h === 1350, "a post can leave as a JPG, 1080×1350", jpg && JSON.stringify([jpg.kind, jpg.w, jpg.h, jpg.magic]));
  const webm = await page.evaluate(async () => {
    const m = await import("/js/macaron.js");
    const piece = m.addMotion("board", { name: "Short test", duration: 2 });
    m.setMotion(piece.id, { fps: 12 });
    const r = await m.renderMotion(piece.id, { container: "webm", download: false });
    const head = r ? [...new Uint8Array(await (await fetch(r.url)).arrayBuffer()).subarray(0, 4)] : null;
    const type = r ? (await fetch(r.url)).headers.get("content-type") : null;
    return r && { container: r.container, url: r.url, d: r.duration, sound: r.sound, head, type, kind: m.macaron.brand.body.exports[0].kind };
  });
  ok(webm?.container === "webm" && /\.webm$/.test(webm.url) && webm.head.join() === "26,69,223,163" && /video\/webm/.test(webm.type) && Math.abs(webm.d - 2) < 0.1 && webm.kind === "webm", "a motion piece can leave as a WebM: an EBML file of video/webm, its length the piece's", webm && JSON.stringify([webm.container, webm.d, webm.head, webm.type]));
  await space("content");
  await openBento("motion");
  ok((await page.locator(".mc-w.is-motion .is-render .segment button").allInnerTexts()).filter((x) => /MP4|WEBM/.test(x)).join() === "MP4,WEBM", "the motion window renders either kind");
  await closeAll();

  // ---- Brioche, through the server: the stand-in writer answers as a careless model would (an action of the open
  // workspace, and one of another). What the server sends the model is the open workspace's brief, tool and things only,
  // and what is answered that does not belong there is dropped, by the server and by the page.
  const typeIn = async (text) => {
    const n0 = await store((m) => m.macaron.chat.messages.length);
    await page.locator("#assistant .pill-field, #assistant .chat-input").first().click();
    await page.keyboard.type(text);
    await page.keyboard.press("Enter");
    await page.waitForFunction(async (n) => { const m = await import("/js/macaron.js"); return m.macaron.chat.messages.length >= n + 2 && !m.macaron.chat.busy; }, n0, { timeout: 20000 });
    return store((m) => m.macaron.chat.messages.at(-1));
  };
  const fold = () => page.locator('#assistant [aria-label="Fold the conversation"]').click({ timeout: 2000 }).catch(() => {});
  const undoLast = async () => { await page.locator("#assistant .msg .undo").last().click(); await page.waitForTimeout(600); };
  const writerLog = async () => (await readFile(join(dataDir, "writer-requests.jsonl"), "utf8").catch(() => "")).trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const opsIn = (r) => r.tools[0].input_schema.properties.actions.items.properties.op.enum;
  const through = async (sp, text) => {
    await space(sp);
    const n = (await writerLog()).length;
    const message = await typeIn(text);
    const reqs = (await writerLog()).slice(n);
    return { message, req: reqs.at(-1), count: reqs.length };
  };
  const directions0 = await store((m) => m.macaron.brand.body.directions.map((d) => d.name).join());
  let e2e = await through("idea", "Try a night direction.");
  ok(e2e.count === 1 && e2e.req.tools.length === 1 && e2e.req.tools[0].name === "macaron_answer" && opsIn(e2e.req).includes("write_brief") && !opsIn(e2e.req).some((o) => ["edit_text", "set_layer", "set_colour"].includes(o)), "through the server in Design idea: the model is given Design idea's tool, with its actions and no other workspace's", opsIn(e2e.req).join());
  ok(/THE OPEN WORKSPACE: Design idea/.test(e2e.req.system) && !/edit_text|set_layer|add_colourway/.test(e2e.req.system) && /WORKSPACE OPEN: Design idea/.test(e2e.req.prompt) && /DIRECTIONS \(ids\)/.test(e2e.req.prompt) && !/Layers, bottom to top|Colourways saved/.test(e2e.req.prompt), "its brief and what it is told are the idea's: the directions, no layers, no kit");
  ok((await store((m) => m.macaron.brand.body.directions.map((d) => d.name).join())) === `${directions0},Stand-in direction` && (e2e.message.did ?? []).join() === "Direction: Stand-in direction" && e2e.message.undo === true && (await store((m) => m.designById("launch").status)) !== "approved-by-leak", "her answer is made, and what belongs to Content is not", JSON.stringify(e2e.message).slice(0, 200));
  await undoLast();
  await fold();
  e2e = await through("kit", "A red accent, please.");
  ok(opsIn(e2e.req).includes("add_colourway") && !opsIn(e2e.req).includes("edit_text") && /THE OPEN WORKSPACE: Brand kit/.test(e2e.req.system) && /Palette \(ids\)/.test(e2e.req.prompt) && /Pairs that do not read/.test(e2e.req.prompt) && !/Layers, bottom to top|DIRECTIONS/.test(e2e.req.prompt), "through the server in Brand kit: the kit's tool and the kit's things (palette ids, rules, the pairs that do not read)");
  ok((await store((m) => m.macaron.brand.body.kit.palette.some((p) => p.name === "Stand-in red" && p.hex === "#C0392B"))) && (await S()).layers.find((l) => l.id === "headline").text !== "leaks", "a colour added; the layer's text, a Content action, is left alone");
  await undoLast();
  await fold();
  e2e = await through("content", "Rename this one.");
  ok(opsIn(e2e.req).includes("edit_text") && opsIn(e2e.req).includes("plan_design") && !opsIn(e2e.req).includes("write_brief") && /THE OPEN WORKSPACE: Content/.test(e2e.req.system) && /THE DESIGN OPEN: id launch/.test(e2e.req.prompt) && /Layers, bottom to top/.test(e2e.req.prompt), "through the server in Content: the design's tool and the design's layers, and its week and motion", opsIn(e2e.req).length + " actions");
  ok((await store((m) => m.designById("launch").name)) === "Renamed by the stand-in" && (await store((m) => m.macaron.brand.body.brief.pitch)) !== "leaks", "the design is renamed; the brief, an Design idea action, is left alone");
  await undoLast();
  ok((await store((m) => m.designById("launch").name)) === "Launch · Direct a shot", "and one Undo takes it back");
  await fold();
  // a tool of her panel goes through the server with what it asks of her
  await space("idea");
  let nlog = (await writerLog()).length;
  await page.locator('.mc-tool[data-tool="direction"]').click();
  await page.waitForFunction(async () => { const m = await import("/js/macaron.js"); return m.macaron.chat.messages.at(-1)?.role === "assistant" && !m.macaron.chat.busy; }, null, { timeout: 20000 });
  const toolReq = (await writerLog()).slice(nlog).at(-1);
  ok(/picked the tool New direction/.test(toolReq.prompt) && /Give me a new direction for the mark and the look\./.test(toolReq.prompt), "a tool's own instructions go to the model with its words", toolReq.prompt.slice(-200).replace(/\n/g, " "));
  await undoLast();
  await fold();
  ok((await store((m) => m.macaron.brand.body.directions.map((d) => d.name).join()) === directions0), "Undo leaves the directions as they were");

  // ---- Brioche with the model's answer stood in for at the page: she is told about the workspace that is open, what she
  // does is one step, and one Undo takes it back. The page does not trust her: what belongs to another workspace is left alone.
  const asked = [];
  let reply = { reply: "Done.", actions: [] };
  await page.route("**/api/macaron/assist", (route) => { asked.push(route.request().postDataJSON()); route.fulfill({ json: reply }); });
  const say = async (text) => { await typeIn(text); return asked.at(-1); };

  // Content: the design open, as before
  await space("content");
  await page.evaluate(async () => { const m = await import("/js/macaron.js"); m.openDesign("launch"); m.setFormat("4:5"); });
  await page.waitForTimeout(500);
  const before = await S();
  reply = { reply: "Done: a shorter headline on yellow.", actions: [
    { op: "edit_text", layer: "headline", text: "Say it.\n*Done.*" }, { op: "set_background", color: "yellow" }, { op: "apply_kit" }, { op: "set_status", status: "review" }, { op: "plan_design", design: "launch", day: "tue" }, { op: "write_brief", fields: { pitch: "not here" } }, { op: "nonsense" },
  ] };
  const req = await say("Shorter headline, yellow ground.");
  s = await S();
  ok(s.layers.find((l) => l.id === "headline").text === "Say it.\n*Done.*" && s.bg === "yellow" && s.status === "review", "Brioche's answer is applied: words, ground, status");
  ok(s.layers.find((l) => l.id === "wordmark").logo === "wordmark-ink" && s.layers.find((l) => l.id === "headline").colorRole === "ink", "and the kit is applied: the logo and the type read on yellow");
  ok((await store((m) => m.designById("launch").plan?.day)) === "tue" && (await store((m) => m.macaron.brand.body.brief.pitch)) !== "not here", "a day for a post is Content's to give; the brief is not, there");
  ok(s.past === before.past + 1, "it is one step in the undo history", `${before.past} -> ${s.past}`);
  ok(req.space === "content" && req.brand.space === "content" && req.brand.design?.id === "launch" && req.brand.designs.length >= 7 && req.brand.directions === undefined && req.brand.colourways === undefined && req.brand.rules === undefined, "she is told about Content: the design open and the others, not the directions or the kit's colourways", Object.keys(req.brand).join(","));
  await undoLast();
  s = await S();
  ok(s.layers.find((l) => l.id === "headline").text === before.layers.find((l) => l.id === "headline").text && s.bg === before.bg && s.status === before.status && s.past === before.past, "one Undo takes all of it back");
  ok((await store((m) => m.designById("launch").plan?.day)) === "mon", "the day too");
  await fold();

  // Brand kit: colours, the voice, a rule, a colourway; a post's status is not hers to change here
  await space("kit");
  const kitState = () => store((m) => { const b = m.macaron.brand.body; return { past: m.macaron.past.length, palette: b.kit.palette.map((p) => `${p.id}:${p.name}:${p.hex}`), words: b.kit.voice.words.join(), summary: b.kit.voice.summary, rules: b.kit.rules.length, ways: (b.kit.colourways ?? []).length, status: m.designById("launch").status, colours: b.colours.length }; });
  const kit0 = await kitState();
  reply = { reply: "A jam colour, a plainer voice, one rule and a colourway.", actions: [
    { op: "add_colour", name: "Jam", hex: "#B0305C", role: "Accent" }, { op: "set_colour", id: "plum", name: "Deep plum" }, { op: "set_voice", words: ["warm", "plain"], summary: "Warm and plain." },
    { op: "add_rule", kind: "dont", text: "No glows on the logo." }, { op: "add_colourway", name: "Ink on yellow", ground: "yellow", logo: "wordmark-ink" }, { op: "set_colour", id: "nope", hex: "#000000" }, { op: "set_status", status: "approved" }, { op: "set_layer", layer: "headline", props: { size: 0.2 } },
  ] };
  const kreq = await say("Add a jam colour and tidy the voice.");
  let k1 = await kitState();
  ok(k1.palette.length === kit0.palette.length + 1 && k1.palette.includes("plum:Deep plum:#49378B") && k1.palette.at(-1).endsWith(":Jam:#B0305C") && k1.colours === kit0.colours + 1, "Brand kit: a colour added, another renamed", k1.palette.at(-1));
  ok(k1.words === "warm,plain" && k1.summary === "Warm and plain." && k1.rules === kit0.rules + 1 && k1.ways === 1, "the voice, a rule and a colourway", `${k1.words} · ${k1.rules} rules · ${k1.ways} colourway`);
  ok(k1.status === kit0.status && (await S()).layers.find((l) => l.id === "headline").size === before.layers.find((l) => l.id === "headline").size, "a status and a layer are Content's: left alone in Brand kit");
  ok(k1.past === kit0.past + 1, "all of it is one step", `${kit0.past} -> ${k1.past}`);
  ok(kreq.space === "kit" && kreq.brand.space === "kit" && kreq.brand.rules.length >= 9 && kreq.brand.kit.palette.length === kit0.palette.length && kreq.brand.design === undefined && kreq.brand.brief === undefined && kreq.brand.lowContrast.length >= 1, "she is told about the kit: its rules, its colourways and the pairs that do not read; not a design or the brief", Object.keys(kreq.brand).join(","));
  await undoLast();
  const k2 = await kitState();
  ok(JSON.stringify(k2) === JSON.stringify(kit0), "one Undo takes the colours, the voice, the rule and the colourway back");
  await fold();

  // Design idea: a brief, a direction, a pick, a note
  await space("idea");
  const ideaState = () => store((m) => { const b = m.macaron.brand.body; return { past: m.macaron.past.length, pitch: b.brief.pitch, tone: b.brief.tone, goals: b.brief.goals.join(), dirs: b.directions.map((d) => `${d.name}${d.picked ? "*" : ""}`).join(), history: b.history.length, status: m.designById("launch").status }; });
  const idea0 = await ideaState();
  reply = { reply: "A brief, a night direction, the craft one picked, and a note.", actions: [
    { op: "write_brief", fields: { pitch: "A warm home for films.", tone: "Plain.", evil: "x" }, goals: ["Feel welcoming", "Make it simple", "Stay playful", "A fourth"] }, { op: "add_direction", name: "Midnight jam", note: "Deep and glossy.", logo: "wordmark-white" },
    { op: "pick_direction", id: "dir-craft" }, { op: "pick_direction", id: "nope" }, { op: "add_note", title: "Tried a night direction", note: "Too dark for the jar." }, { op: "set_status", status: "approved" },
  ] };
  const ireq = await say("Write the brief and try a night direction.");
  const idea1 = await ideaState();
  ok(idea1.pitch === "A warm home for films." && idea1.tone === "Plain." && idea1.goals === "Feel welcoming,Make it simple,Stay playful", "Design idea: the brief written, three goals at most, only the brief's own fields", `${idea1.pitch} · ${idea1.goals}`);
  ok(idea1.dirs === "Warm and bold,Quiet craft*,After hours,Midnight jam" && idea1.history === idea0.history + 3 && idea1.status === idea0.status, "a direction added, another picked (the unknown id left alone), a note in the story; a status is Content's", idea1.dirs);
  ok(idea1.past === idea0.past + 1, "all of it is one step", `${idea0.past} -> ${idea1.past}`);
  ok(ireq.space === "idea" && ireq.brand.space === "idea" && ireq.brand.directions.length === 3 && ireq.brand.refs.length >= 6 && ireq.brand.story.length >= 5 && ireq.brand.design === undefined && ireq.brand.rules === undefined, "she is told about the idea: the brief, the directions, the references and the story; not a design or the kit's rules", Object.keys(ireq.brand).join(","));
  await undoLast();
  ok(JSON.stringify(await ideaState()) === JSON.stringify(idea0), "one Undo takes the brief, the direction, the pick and the note back, the story too");
  await fold();

  // her tools: the words go to her with the tool's id, in the workspace they belong to; the others are the page's own
  await space("kit");
  reply = { reply: "A colourway.", actions: [{ op: "add_colourway", name: "Plum on white", ground: "white", logo: "wordmark-plum" }] };
  let n = asked.length;
  await page.locator('.mc-tool[data-tool="colourway"]').click();
  await page.waitForFunction(async () => { const m = await import("/js/macaron.js"); return m.macaron.chat.messages.at(-1)?.role === "assistant" && !m.macaron.chat.busy; }, null, { timeout: 15000 });
  let treq = asked.at(-1);
  ok(asked.length === n + 1 && treq.space === "kit" && treq.preset === "colourway" && /^Make a colourway/.test(treq.messages.at(-1).text), "a tool sends Brioche its words and its id, in its workspace", `${treq.preset}: ${treq.messages.at(-1).text.slice(0, 40)}`);
  ok((await kitState()).ways === 1, "and her answer is made");
  await undoLast();
  await fold();
  await page.locator('.mc-tool[data-tool="contrast"]').click();
  await page.waitForTimeout(600);
  wn = await winNow();
  ok(wn.win === "palette" && (await page.locator(".mc-switch").getAttribute("aria-checked")) === "true" && (await page.locator(".mc-pair-chip").count()) === 6, "Check contrast opens the palette with Advanced on: how colours read on each other", JSON.stringify(wn));
  await closeAll();
  await page.evaluate(async () => { const m = await import("/js/macaron.js"); m.macaron.adv = { ...m.macaron.adv, palette: false }; });
  await page.locator('.mc-tool[data-tool="export"]').click();
  await page.waitForTimeout(600);
  ok((await winNow()).win === "exportkit" && (await page.locator(".mc-xkey").count()) === 3, "Export the kit opens its window: the palette as CSS, the kit as data, every logo file");
  await closeAll();
  await space("idea");
  await page.locator('.mc-tool[data-tool="references"]').click();
  await page.locator(".picker").waitFor({ timeout: 5000 });
  ok(true, "Add references opens the picture picker (the Library, the computer)");
  // (the picker listens for its Escape a moment after it opens)
  await page.waitForTimeout(700);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  ok((await page.locator(".picker").count()) === 0, "and Escape closes it");
  await space("content");
  reply = { reply: "A story layout.", actions: [{ op: "adapt_format", format: "9:16" }] };
  n = asked.length;
  await page.locator('.mc-tool[data-tool="story"]').click();
  await page.waitForFunction(async () => { const m = await import("/js/macaron.js"); return m.macaron.chat.messages.at(-1)?.role === "assistant" && !m.macaron.chat.busy; }, null, { timeout: 15000 });
  treq = asked.at(-1);
  ok(asked.length === n + 1 && treq.space === "content" && treq.preset === "story" && treq.brand.design?.id === "launch", "a Content tool is told about the design it works on", `${treq.preset}`);
  await fold();
  // the words typed are not a tool's: no id goes with them
  reply = { reply: "Nothing to change.", actions: [] };
  treq = await say("What do you think of the headline?");
  ok(treq.preset === undefined && treq.space === "content", "what is typed goes without a tool's id");
  await fold();
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
  ok(render && render.width === 1080 && render.height === 1920 && render.duration === 8 && render.sound && render.bytes > 200000, "the intro renders to an 8 s video, 1080×1920, with sound", render && `${render.width}×${render.height} ${render.duration} s ${Math.round(render.bytes / 1024)} KB`);
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


  // ---- brands do not lend each other their history: a field focused and left in one, another brand opened and edited
  const names = await page.evaluate(async () => (await import("/js/macaron.js")).macaron.list.map((b) => ({ id: b.id, name: b.name })));
  const other = names.find((b) => b.name === "Earlier brand").id;
  const crossUndo = (leave) => page.evaluate(async ({ other, leave }) => {
    const m = await import("/js/macaron.js");
    const field = document.querySelector(".mc-inspector textarea.mc-text");
    document.activeElement?.blur?.();
    field.focus();
    if (leave) field.blur();
    const ids = m.macaron.brand.body.designs.map((d) => d.id);
    await m.openBrand(other);
    const before = m.macaron.brand.body.designs.map((d) => d.id);
    m.addDesign({ name: "Only in the other brand", format: "4:5" });
    const during = m.macaron.brand.body.designs.length;
    m.undo();
    const after = m.macaron.brand.body.designs.map((d) => d.id);
    await m.openBrand("brand-comfyture");
    return { before, after, during, leaked: after.filter((id) => ids.includes(id)), past: m.macaron.past.length };
  }, { other, leave });
  await page.evaluate(async () => { const m = await import("/js/macaron.js"); await m.openBrand("brand-comfyture"); m.openDesign("launch"); m.pickLayer(null); });
  await openEditor();
  let cross = await crossUndo(false);
  ok(cross.during === cross.before.length + 1 && cross.leaked.length === 0 && cross.after.join() === cross.before.join(), "a field focused in one brand, then another brand edited and undone: nothing of the first comes back", `${cross.before.length} -> ${cross.during} -> ${cross.after.length}`);
  ok((await winNow()).win === null, "and the brand that was opened has no window open", JSON.stringify(await winNow()));
  // a page with a field in use is not drawn: it is, as soon as the field is left
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.waitForTimeout(700);
  ok((await page.locator(".mc-winhost:not([hidden])").count()) === 0, "the page catches up when the field that was in use is left");
  await openEditor();
  cross = await crossUndo(true);
  ok(cross.leaked.length === 0 && cross.after.join() === cross.before.join(), "the same when the field was left (blurred) without a change");
  ok(cross.past === 0, "and a brand that is opened starts with no steps back");
  await page.waitForTimeout(600);
  ok((await winNow()).win === null && (await page.locator(".mc-winhost:not([hidden])").count()) === 0, "and no window of the other brand is left open over it");

  // ---- a save waiting for its 400 ms is not lost to the next brand's edit
  const saved2 = await page.evaluate(async ({ other }) => {
    const m = await import("/js/macaron.js");
    await m.openBrand("brand-comfyture");
    m.setDesign("launch", { intent: "Awareness, saved just before the switch" }, "Intent");
    await m.openBrand(other);
    m.setBrief({ goal: "A goal in the other brand" });
    await new Promise((r) => setTimeout(r, 1800));
    const a = (await (await fetch("api/brands/brand-comfyture")).json()).project.body.designs.find((d) => d.id === "launch").intent;
    const b = (await (await fetch(`api/brands/${other}`)).json()).project.body.brief.goal;
    await m.openBrand("brand-comfyture");
    return { a, b };
  }, { other });
  ok(saved2.a === "Awareness, saved just before the switch" && saved2.b === "A goal in the other brand", "both brands are saved when one is edited right after the switch from the other", JSON.stringify(saved2));

  // ---- the motion controls change the piece they show, not the design that happens to be open in the studio
  await page.evaluate(async () => { const m = await import("/js/macaron.js"); m.openDesign("launch"); m.pickMotion("m-intro"); });
  await space("content");
  await openBento("motion");
  const wm = async () => page.evaluate(async () => { const m = await import("/js/macaron.js"); const get = (id) => m.designById(id).layers.find((l) => l.id === "wordmark").anim; return { intro: get("intro"), launch: get("launch") ?? null }; });
  const wm0 = await wm();
  await page.getByLabel("Comes in: Wordmark", { exact: true }).selectOption("fade");
  await page.waitForTimeout(500);
  let wm1 = await wm();
  ok(wm1.intro.in.fx === "fade" && wm0.intro.in.fx !== "fade" && JSON.stringify(wm1.launch) === JSON.stringify(wm0.launch), "the Comes in choice of the selected piece changes that piece's design, not the studio's", `${wm0.intro.in.fx} -> ${wm1.intro.in.fx}, studio design ${wm1.launch ? "has" : "has no"} timing`);
  await page.getByRole("button", { name: "Stays on" }).first().click();
  await page.waitForTimeout(500);
  wm1 = await wm();
  ok(wm1.intro.lid === undefined && wm0.intro.lid !== undefined && JSON.stringify(wm1.launch) === JSON.stringify(wm0.launch), "and so does the lid", `lid ${JSON.stringify(wm1.intro.lid)}`);
  await page.evaluate(async () => { const m = await import("/js/macaron.js"); m.undo(); m.undo(); });
  await closeAll();

  // ---- a layer hidden in one format shows in the others
  await page.evaluate(async () => { const m = await import("/js/macaron.js"); document.activeElement?.blur?.(); m.openDesign("launch", "4:5"); });
  await openEditor();
  const shows = () => page.evaluate(async () => { const m = await import("/js/macaron.js"); const d = m.designNow(); return Object.fromEntries(["4:5", "1:1", "9:16"].map((f) => [f, !m.layoutNow(d, f).layers.find((l) => l.id === "sub").hidden])); });
  await page.locator(".mc-layer", { hasText: "Subhead" }).first().locator('button[aria-label="Hide in this format"]').click();
  await page.waitForTimeout(400);
  let vis = await shows();
  ok(!vis["4:5"] && vis["1:1"] && vis["9:16"], "Hide in this format hides the layer in this format only", JSON.stringify(vis));
  await page.locator(".mc-layer", { hasText: "Subhead" }).first().locator('button[aria-label="Show in this format"]').click();
  await page.waitForTimeout(400);
  vis = await shows();
  ok(vis["4:5"] && vis["1:1"] && vis["9:16"], "and Show brings it back");

  // ---- a new picture keeps what it cost and the job that made it (Router stood in for: nothing is spent)
  const made2 = await page.evaluate(async () => {
    const m = await import("/js/macaron.js");
    const asset = await m.makePicture({ prompt: "A test picture, no words", model: "gpt-image-2.5-flare", aspect: "4:5", refs: [], quality: "medium", name: "Test picture" });
    await new Promise((r) => setTimeout(r, 1500));
    const kept = (await (await fetch("api/brands/brand-comfyture")).json()).project.body.assets.find((a) => a.id === asset.id);
    return { asset, kept: kept && { credits: kept.credits, job: kept.job } };
  });
  const ledger = (await readFile(join(dataDir, "macaron", "ledger.jsonl"), "utf8")).trim().split("\n").map((l) => JSON.parse(l));
  ok(made2.asset.credits === 3.66 && /^[a-f0-9]{8}$/.test(made2.asset.job) && made2.asset.model === "gpt-image-2.5-flare", "a new picture keeps its cost, its job and its model on the asset", JSON.stringify({ credits: made2.asset.credits, job: made2.asset.job }));
  ok(made2.kept?.credits === 3.66 && made2.kept?.job === made2.asset.job, "and they are saved with the brand");
  ok(ledger.at(-1)?.job === made2.asset.job && ledger.at(-1)?.credits === 3.66, "the ledger line names the same job", JSON.stringify(ledger.at(-1)));


  // ---- what finishes after another brand was opened belongs to the brand it was asked in
  const late = await page.evaluate(async ({ other }) => {
    const m = await import("/js/macaron.js");
    await m.openBrand("brand-comfyture");
    const had = { assets: m.macaron.brand.body.assets.length, exports: m.macaron.brand.body.exports.length };
    const picture = m.makePicture({ prompt: "A picture that finishes late", model: "gpt-image-2.5-flare", aspect: "4:5", refs: [], name: "Late picture" });
    const exported = m.exportPng("launch", "4:5", { download: false });
    await m.openBrand(other);
    const [asset, rec] = await Promise.all([picture, exported]);
    await new Promise((r) => setTimeout(r, 1500));
    const get = async (id) => (await (await fetch(`api/brands/${id}`)).json()).project.body;
    const [a, b] = [await get("brand-comfyture"), await get(other)];
    return { had, a: { assets: a.assets.length, hasAsset: a.assets.some((x) => x.id === asset.id), exports: a.exports.length, hasExport: a.exports.some((x) => x.id === rec.id) }, b: { hasAsset: b.assets.some((x) => x.id === asset.id), hasExport: b.exports.some((x) => x.id === rec.id) }, open: m.macaron.brand.id === other };
  }, { other });
  ok(late.open && late.a.hasAsset && late.a.hasExport && !late.b.hasAsset && !late.b.hasExport && late.a.assets === late.had.assets + 1 && late.a.exports === late.had.exports + 1, "a picture and an export that finish after another brand was opened are kept, saved, with the brand they were asked in", JSON.stringify(late));

  // ---- no brand at all: the welcome shows, and the example brings the room back with Brioche's bar at its foot
  await page.evaluate(async () => { const m = await import("/js/macaron.js"); for (const b of [...m.macaron.list]) await m.removeBrand(b.id); });
  await page.waitForTimeout(1500);
  ok((await page.locator(".mc-welcome h1").count()) === 1 && (await page.locator(".mc-side").count()) === 0 && (await page.locator(".mc-winhost").count()) === 0, "with no brand left Macaron shows its welcome");
  await page.locator(".mc-welcome .mc-go").click();
  await page.waitForSelector(".mc-side .mcb-card", { timeout: 30000 });
  await page.waitForTimeout(1500);
  ok(await page.evaluate(() => { const bar = document.getElementById("assistant"); return !!bar && bar.parentElement?.id === "macaron-chat" && !bar.hidden && document.querySelectorAll(".mc-grid").length === 3; }), "and the example opens the room again, Brioche's bar in its slot at the foot");

  ok(errors.length === 0, "no errors in the page", errors.slice(0, 3).join(" | "));
} finally {
  await browser.close();
  server.kill();
  await rm(dataDir, { recursive: true, force: true });
  if (!process.env.OUT) await rm(out, { recursive: true, force: true });
}
console.log(failures ? `${failures} FAILED` : "all passed");
process.exit(failures ? 1 : 0);
