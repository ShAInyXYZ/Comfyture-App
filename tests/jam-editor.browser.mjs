// Jam in a real browser, end to end, on a server of its own and a folder of its own: Pickle's panel and the four
// workspaces (each a bento grid whose cards open in windows); the seeded showcase opens; beats are heard, an effect
// and stickers are put on, a lyric word is retimed; undo, redo, save, reload; the film is exported, and its frames
// are held against the preview's at the same times; Kitchen's Cut and a Mixer-built cut still open and render;
// nothing that costs credits is asked for until its own key is pressed, and nothing blocks switching jams or
// workspaces. Not part of `node --test` (it needs a browser). Run it from the repo root:
//   NODE_PATH=<a node_modules that has playwright> CHROME=<chrome or chromium binary> node tests/jam-editor.browser.mjs
// OUT=<folder> keeps the frames it compares (they are looked at, not only measured).
import { spawn, execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const root = resolve(import.meta.dirname, "..");
const out = process.env.OUT ? resolve(process.env.OUT) : await mkdtemp(join(tmpdir(), "jam-editor-"));
await mkdir(out, { recursive: true });
const dataDir = await mkdtemp(join(tmpdir(), "jam-data-"));
let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "PASS" : "FAIL"} ${msg}`);
  if (!cond) failures++;
};

// a free port, and the server on it (no Comfy: the editor needs none)
const port = await new Promise((done) => {
  const s = createServer().listen(0, () => {
    const { port } = s.address();
    s.close(() => done(port));
  });
});
const server = spawn(process.execPath, ["server/main.ts"], { cwd: root, env: { ...process.env, PORT: String(port), COMFYTURE_DATA: dataDir, COMFY_API_KEY: "", COMFY_BASE_URL: "http://127.0.0.1:9" }, stdio: "ignore" });
const base = `http://127.0.0.1:${port}`;
for (let i = 0; i < 100; i++) {
  if (await fetch(`${base}/api/jams`).then((r) => r.ok, () => false)) break;
  await new Promise((r) => setTimeout(r, 200));
}
const api = async (path, method = "GET", body) => (await fetch(`${base}/${path}`, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined })).json();
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ["--autoplay-policy=no-user-gesture-required"] });
try {
  const page = await (await browser.newContext({ viewport: { width: 1500, height: 1100 } })).newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // the requests that cost credits (ACE-Step, the words heard, a look drawn, a shot rolled): none may be made but by their own keys
  const paid = [];
  page.on("request", (r) => r.method() === "POST" && /\/api\/(audio\/music|jam\/listen|image|shots)$/.test(new URL(r.url()).pathname) && paid.push(new URL(r.url()).pathname));
  const body = () => page.evaluate(async () => JSON.parse(JSON.stringify((await import("/js/cut.js")).cut.project.body)));
  const until = async (fn, tries = 120, arg) => {
    for (let i = 0; i < tries; i++) {
      if (await page.evaluate(fn, arg)) return true;
      await page.waitForTimeout(500);
    }
    return false;
  };
  const seek = (t) => page.evaluate(async (t) => (await import("/js/panels/editor.js")).editor.seek(t), t);
  const workspace = async (ws) => {
    await page.locator(`.jm-tile[data-workspace="${ws}"]`).click();
    await page.waitForTimeout(250);
  };
  const closeWindow = async () => {
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.body.classList.contains("has-jam-window"));
  };
  const hasEdit = () => until(() => import("/js/cut.js").then((m) => !!m.cut.project && m.cut.project.body.product === "jam").catch(() => false), 40);
  const settle = () => page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((done) => {
      const t0 = performance.now();
      const tick = () => {
        const vs = [...document.querySelectorAll(".cut-layer")].filter((x) => x.tagName === "VIDEO");
        if (vs.every((v) => v.readyState >= 2 && !v.seeking) || performance.now() - t0 > 4000) setTimeout(done, 150);
        else requestAnimationFrame(tick);
      };
      tick();
    });
  });

  // ---- the seeded showcase opens as an edit (not an empty one)
  await page.goto(`${base}/#/jam`);
  await page.waitForSelector(".jam .jm-tile", { timeout: 20000 });
  // (the showcases are several: this one is the small one made for the test)
  await page.evaluate(() => import("/js/jam.js").then((m) => m.openJam("jam-test-showcase")));
  ok(await hasEdit(), "the seeded Jam opens as an edit");
  const b0 = await body();
  ok(b0.product === "jam" && b0.aspect === "9:16" && b0.tracks.find((t) => t.main).items.length === 4, "the seeded Jam opens as its edit: 9:16, its four clips, product kept");

  // ---- Pickle's panel: his portrait, the jam, the five workspaces with their state, the video's pipeline (no canned tools)
  ok(await page.locator(".jm-pet-face").getAttribute("src") === "brand/cast/pickle-face.webp" && (await page.locator(".jm-pet-text").innerText()).toLowerCase().includes("band leader"), "Pickle's portrait and tag are on the panel");
  ok((await page.locator(".jm-jam").innerText()).trim().length > 0, "the jam chip names the jam");
  const tiles = await page.locator(".jm-tile").evaluateAll((els) => els.map((e) => ({ ws: e.dataset.workspace, name: e.querySelector("b").textContent, status: e.querySelector("em").textContent, on: e.classList.contains("is-on") })));
  ok(tiles.map((t) => t.name).join() === "The song,The track,The words,The band,The edit" && tiles.map((t) => t.ws).join() === "song,track,words,band,edit", "five workspaces, in the order a video is made");
  // (a video that has a song opens on its track, not on the page that makes a song)
  ok(tiles.filter((t) => t.on).length === 1 && tiles[1].on && tiles.every((t) => t.status.length > 0), `the open one (the track) is lit, and each says its state (${tiles.map((t) => t.status).join(" | ")})`);
  const steps = await page.locator(".jm-pipe-list li").evaluateAll((els) => els.map((e) => [e.querySelector("span:not(.jm-lamp)").textContent, e.dataset.state]));
  ok(steps.map((x) => x[0]).join() === "Song made,Words heard,Captions styled,Band cast,Edit cut" && steps[0][1] === "done" && steps.filter((x) => x[1] === "next").length === 1, `the pipeline lists the five steps, the song done and one next (${steps.map((x) => x.join(":")).join(" ")})`);
  ok((await page.locator(".jm-tool").count()) === 0, "there are no canned tools on the panel");
  const bentoNames = () => page.locator(".jm-grid .jm-bento").evaluateAll((els) => els.map((e) => [...e.classList].find((c) => /^jm-b-/.test(c)).slice(5)));
  for (const [ws, want] of Object.entries({ track: "record,start,hear", words: "lyrics,styles,preview", band: "stage,dance,look", edit: "monitor,selected,timeline,foot" })) {
    await workspace(ws);
    ok((await bentoNames()).join() === want, `${ws}: its bentos are ${want}`);
    ok((await page.locator(".jm-tile.is-on").getAttribute("data-workspace")) === ws, `${ws}: its tile is the lit one`);
    // the editor's monitor is drawn where it is shown, once: in the words' preview and in the edit
    ok((await page.locator(".jam .cut-screen").count()) === (ws === "words" || ws === "edit" ? 1 : 0), `${ws}: the monitor is ${ws === "words" || ws === "edit" ? "there" : "not on this screen"}`);
  }

  // ---- every bento opens in a window of its own, centred over the page, closed by Escape or a press outside it
  const WINDOWS = { track: ["record", "start", "hear"], words: ["lyrics", "styles", "preview"], band: ["stage", "dance", "look"], edit: ["monitor"] };
  for (const [ws, ids] of Object.entries(WINDOWS)) {
    await workspace(ws);
    const opened = [];
    for (const id of ids) {
      await page.locator(`.jm-b-${id} .jm-expand`).click();
      await page.waitForSelector(".jm-layer:not([hidden]) .jm-win");
      await page.waitForTimeout(300);
      const box = await page.locator(".jm-win").boundingBox();
      const view = page.viewportSize();
      const centred = Math.abs(box.x + box.width / 2 - view.width / 2) < 4 && box.y > 0 && box.y + box.height < view.height + 1;
      opened.push(centred && (await page.evaluate(() => document.body.classList.contains("has-jam-window") && !document.body.classList.contains("has-window"))));
      if (id === "start") opened.push((await page.locator(".jm-win .jm-trend").count()) > 3);
      if (id === "styles") opened.push((await page.locator(".jm-win .jm-capstyle").count()) === 5);
      if (id === "preview") opened.push((await page.locator(".jm-win .cut-screen").count()) === 1 && (await page.locator(".jm-b-preview .cut-screen").count()) === 0);
      await closeWindow();
      opened.push(await page.locator(".jm-layer").isHidden());
    }
    ok(opened.every(Boolean), `${ws}: ${ids.join(", ")} each open centred in a window and close on Escape`);
  }
  await workspace("track");
  await page.locator(".jm-b-record .jm-expand").click();
  await page.waitForSelector(".jm-layer:not([hidden]) .jm-win");
  await page.mouse.click(8, 400);
  await page.waitForFunction(() => !document.body.classList.contains("has-jam-window"), null, { timeout: 3000 }).catch(() => {});
  ok(await page.locator(".jm-layer").isHidden(), "a press outside the window closes it");

  // ---- the record plays the part, and turns while it sounds; it stops when another workspace is shown
  await workspace("track");
  await page.locator(".jm-disc.is-key").click();
  ok(await page.waitForFunction(() => document.querySelector(".jam")?.classList.contains("is-playing"), null, { timeout: 5000 }).then(() => true, () => false), "a press on the record plays the part, and the record turns");
  await page.locator(".jm-disc.is-key").click();
  ok(await page.waitForFunction(() => !document.querySelector(".jam")?.classList.contains("is-playing"), null, { timeout: 5000 }).then(() => true, () => false), "and a second press stops it");
  await page.locator(".jm-disc.is-key").click();
  await page.waitForFunction(() => document.querySelector(".jam")?.classList.contains("is-playing"), null, { timeout: 5000 });
  await workspace("words");
  ok(await page.waitForFunction(() => !document.querySelector(".jam")?.classList.contains("is-playing"), null, { timeout: 5000 }).then(() => true, () => false), "another workspace shown puts the record away");
  await workspace("edit");

  // ---- beats: heard in the browser (the editor's own details, in a window)
  await page.locator('button[aria-label="Beats"]').click();
  await page.waitForSelector(".jm-win .cut-inspector");
  await page.locator('.jm-win .cut-inspector button:has-text("Detect")').click();
  ok(await until(() => import("/js/cut.js").then((m) => m.cut.project.body.beats.source === "web").catch(() => false)), "the beats are heard");
  const b1 = await body();
  ok(Math.abs(b1.beats.bpm - 124) < 0.6, `the tempo is 124 (heard ${b1.beats.bpm})`);
  await closeWindow();

  // ---- an effect, two stickers (one moved), a lyric word retimed
  // (the effects and the stickers are windows of the edit: a key of the timeline opens each)
  await page.locator('.jm-b-timeline .jm-chipkey[data-tooltip^="Beat effects"]').click();
  await page.locator('.jm-win .jm-fxkey[data-fx="shake"]').click();
  await page.waitForTimeout(400);
  ok((await body()).tracks.find((t) => t.kind === "fx").items.some((i) => i.kind === "shake"), "a shake is on the Beat FX track");
  ok((await page.locator('.jm-win .jm-fxkey[data-fx="shake"]').getAttribute("aria-pressed")) === "true" && (await page.locator(".jm-win .jm-fxrow.is-picked").count()) === 1, "the new effect is the one picked");
  await closeWindow();
  ok((await page.locator(".jm-selected .jm-dial-label").innerText()).includes("Shake"), "and its strength is the dial of the selected effect");
  await page.locator('.jm-b-timeline .jm-chipkey[data-tooltip^="Stickers"]').click();
  await page.locator('.jm-win .jm-sticker[data-tooltip^="Star"]').click();
  await page.waitForTimeout(400);
  await closeWindow();
  const star = (await body()).tracks.find((t) => t.id === "v2").items.find((i) => i.src?.id === "star");
  await seek(star.start + 0.5);
  await page.waitForTimeout(400);
  await page.evaluate(() => window.scrollTo(0, 0));
  const g = await page.locator(".cut-gizmo .gz-box").boundingBox();
  const sc = await page.locator(".cut-screen").boundingBox();
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  await page.mouse.move(sc.x + sc.width * 0.7, sc.y + sc.height * 0.6, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const moved = (await body()).tracks.find((t) => t.id === "v2").items.find((i) => i.id === star.id);
  ok(Math.abs(moved.x - 0.7) < 0.03 && Math.abs(moved.y - 0.6) < 0.03, `the sticker was dragged to 70%, 60% (${moved.x}, ${moved.y})`);
  await page.locator(".cut-item.is-lyric").first().dblclick();
  await page.waitForSelector('.jm-win .cut-word-row input[aria-label="Word 2 starts"]');
  const line = (await body()).tracks.find((t) => t.kind === "title").items.find((i) => i.lyric);
  await page.locator('.jm-win .cut-word-row input[aria-label="Word 2 starts"]').fill("0.85");
  await page.locator('.jm-win .cut-word-row input[aria-label="Word 2 starts"]').press("Tab");
  await page.waitForTimeout(400);
  const retimed = (await body()).tracks.find((t) => t.kind === "title").items.find((i) => i.id === line.id);
  ok(Math.abs(retimed.words[1].from - 0.85) < 1e-6, "word 2 of the first line starts at 0.85 (a double click on the line opens its details)");
  await closeWindow();
  // the same words, one by one on The words: the time shown is the film's
  await workspace("words");
  await page.waitForSelector(".jm-line-row.is-open .jm-word");
  const wordStart = await page.locator('.jm-line-row.is-open input[aria-label="Word 2 starts"]').inputValue();
  ok(Math.abs(Number(wordStart) - (Number(retimed.start) + 0.85)) < 0.011, `The words shows word 2 at ${wordStart} s of the film (the line starts at ${retimed.start})`);
  await page.locator('.jm-line-row.is-open input[aria-label="Word 2 starts"]').fill(String(Number(retimed.start) + 0.9));
  await page.locator('.jm-line-row.is-open input[aria-label="Word 2 starts"]').press("Tab");
  await page.waitForTimeout(400);
  const retimed2 = (await body()).tracks.find((t) => t.kind === "title").items.find((i) => i.id === line.id);
  ok(Math.abs(retimed2.words[1].from - 0.9) < 0.011, `a word retimed on The words moves in the edit (${retimed2.words[1].from})`);
  await page.locator(".jm-capstyle[data-style=\"bounce\"]").click();
  await page.waitForTimeout(300);
  ok((await page.evaluate(async () => (await import("/js/jam.js")).jam.jam.body.captions)) === "bounce" && (await page.locator(".jm-capstyle[data-style=\"bounce\"]").getAttribute("aria-checked")) === "true", "a caption style is picked on The words");
  await workspace("edit");

  // ---- undo and redo, then saved and reloaded
  const after = JSON.stringify(await body());
  await page.locator(".cut-screen").click({ position: { x: 3, y: 3 } });
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(250);
  ok(JSON.stringify(await body()) !== after, "undo changes the edit");
  await page.keyboard.press("Control+Shift+z");
  await page.waitForTimeout(250);
  ok(JSON.stringify(await body()) === after, "redo puts it back");
  await page.waitForTimeout(1500);
  const id = await page.evaluate(async () => (await import("/js/cut.js")).cut.project.id);
  ok(JSON.stringify((await api(`api/cuts/${id}`)).project.body) === after, "the server has it, as it is");
  await page.reload();
  await page.waitForSelector(".jam .jm-tile", { timeout: 20000 });
  ok(await hasEdit(), "the edit opens again after a reload");
  await page.waitForTimeout(1500);
  ok(JSON.stringify(await body()) === after, "after a reload it is all still there");
  ok((await page.locator(".jm-tile.is-on").getAttribute("data-workspace")) === "edit", "and Jam comes back to the workspace that was open");

  // ---- exported, and held against the preview
  await page.locator('.jm-foot [data-go="export"]').click();
  ok(await until(() => import("/js/jam.js").then((m) => !!m.jam.jam.body.film).catch(() => false), 360), "the film is exported (Export MP4, on The edit)");
  const film = await page.evaluate(async () => (await import("/js/jam.js")).jam.jam.body.film);
  await writeFile(join(out, "film.mp4"), Buffer.from(await (await fetch(`${base}${film.url}`)).arrayBuffer()));
  const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,width,height,start_time,duration", "-of", "json", join(out, "film.mp4")]).toString());
  const v = probe.streams.find((x) => x.codec_type === "video");
  const a = probe.streams.find((x) => x.codec_type === "audio");
  ok(v.width / v.height < 0.6 && v.width / v.height > 0.5, `the film is 9:16 (${v.width}x${v.height})`);
  ok(Math.abs(v.duration - 16) < 0.1 && Math.abs(a.duration - 16) < 0.1 && Math.abs(v.start_time) < 0.05 && Math.abs(a.start_time) < 0.05, `picture and sound both run 16 s from 0 (${v.duration}, ${a.duration}; starts ${v.start_time}, ${a.start_time})`);
  // the frames where something shows: a zoom hit, the sticker, a lit word, the shake; each at the same time in the film and in the preview
  const picks = await page.evaluate(async () => {
    const { fxAt } = await import("/js/fx.js");
    const c = await import("/js/cut.js");
    const b = c.cut.project.body;
    let zoom = { t: 0, s: -1 };
    for (let n = 0; n < 16 * 24; n++) {
      const f = fxAt(n / 24, b);
      if (f.zoom > zoom.s) zoom = { t: n / 24, s: f.zoom };
    }
    return { zoom: zoom.t, sticker: 2.5, word: 3.0 };
  });
  for (const [name, t] of Object.entries(picks)) {
    const f = Math.round(t * 24) / 24;
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", join(out, "film.mp4"), "-vf", `select=eq(n\\,${Math.round(f * 24)}),scale=90:160`, "-vsync", "0", "-frames:v", "1", "-pix_fmt", "gray", "-f", "rawvideo", join(out, `film-${name}.gray`)]);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", join(out, "film.mp4"), "-vf", `select=eq(n\\,${Math.round(f * 24)})`, "-vsync", "0", "-frames:v", "1", join(out, `film-${name}.png`)]);
    await seek(f);
    await settle();
    await page.locator(".cut-screen").screenshot({ path: join(out, `preview-${name}.png`) });
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", join(out, `preview-${name}.png`), "-vf", "scale=90:160", "-pix_fmt", "gray", "-f", "rawvideo", join(out, `preview-${name}.gray`)]);
    const A = await readFile(join(out, `film-${name}.gray`));
    const B = await readFile(join(out, `preview-${name}.gray`));
    // the middle, away from the preview's rounded corners
    const mid = (buf) => {
      const px = [];
      for (let y = 8; y < 152; y++) for (let x = 6; x < 84; x++) px.push(buf[y * 90 + x]);
      return px;
    };
    const [x, y] = [mid(A), mid(B)];
    const mean = (l) => l.reduce((s, q) => s + q, 0) / l.length;
    const [mx, my] = [mean(x), mean(y)];
    const cov = x.reduce((s, q, i) => s + (q - mx) * (y[i] - my), 0);
    const corr = cov / Math.sqrt(x.reduce((s, q) => s + (q - mx) ** 2, 0) * y.reduce((s, q) => s + (q - my) ** 2, 0));
    ok(corr > 0.85, `at ${f.toFixed(2)} s (${name}) the film and the preview agree (correlation ${corr.toFixed(3)})`);
  }

  // ---- Kitchen's own cut and a Mixer-built one still open, and render
  const kitchen = await api("api/cuts", "POST", { name: "Kitchen test", body: { aspect: "16:9", duck: true, tracks: [
    { id: "t1", kind: "title", name: "Titles", items: [] }, { id: "v2", kind: "video", name: "Overlays", items: [] },
    { id: "v1", kind: "video", name: "Video", main: true, items: [{ id: "k1", src: { kind: "video", id: "jamtest-clip-1.mp4", duration: 4.4 }, from: 0, to: 3, speed: 1, volume: 1, sound: true }, { id: "k2", src: { kind: "video", id: "jamtest-clip-2.mp4", duration: 4.4 }, from: 0, to: 3, speed: 1, volume: 1, sound: true, join: "dissolve" }] },
    { id: "a1", kind: "audio", role: "voice", name: "Voice", items: [] }, { id: "a2", kind: "audio", role: "music", name: "Music", items: [] }, { id: "a3", kind: "audio", role: "effects", name: "Effects", items: [] }], markers: [] } });
  const mixer = await api("api/cuts", "POST", { name: "Mixer test", body: { aspect: "9:16", tracks: [
    { id: "video", kind: "video", main: true, items: [{ id: "m1", src: { kind: "video", id: "jamtest-clip-3.mp4" }, from: 0, to: 3, speed: 1, sound: false, join: "cut" }, { id: "m2", src: { kind: "video", id: "jamtest-clip-4.mp4" }, from: 0, to: 3, speed: 1, sound: false, join: "cut" }] },
    { id: "music", kind: "audio", role: "music", items: [{ id: "edit-sound", src: { kind: "audio", id: "jamtest-track.mp3" }, start: 0, from: 0, to: 6 }] },
    { id: "caption", kind: "title", items: [{ id: "c1", text: "HOTEL LOBBY", start: 0, length: 6, style: "top" }] }], product: "mixer" } });
  await page.evaluate(() => (location.hash = "#/cut"));
  await page.waitForSelector(".cut-page .cut-screen", { timeout: 20000 });
  await page.waitForTimeout(1200);
  for (const [name, cutId, clips] of [["Kitchen test", kitchen.project.id, 2], ["Mixer test", mixer.project.id, 2]]) {
    await page.locator(`.tab:has-text("${name}")`).first().click();
    await page.waitForTimeout(1200);
    const lanes = await page.locator(".cut-lane").count();
    const items = await page.locator(".cut-lane.is-main .cut-item").count();
    ok(lanes === 7 && items === clips, `${name} opens in Cut: ${lanes} lanes, ${items} clips on its Video track`);
    if (name === "Kitchen test") {
      // (Jam draws these as bentos of its own; Kitchen's Cut is the full editor and keeps them on its toolbar)
      const keys = { fx: await page.locator(".cut-fx-key").count(), stickers: await page.locator('button[aria-label="Stickers"]').count(), beats: await page.locator('button[aria-label="Beats"]').count() };
      ok(keys.fx === 4 && keys.stickers === 1 && keys.beats === 1, `Kitchen's Cut keeps the editor's effect, sticker and beat keys (${JSON.stringify(keys)})`);
    }
    const rendered = await api(`api/cuts/${cutId}/render`, "POST", {});
    ok(rendered.seconds > 4, `${name} renders (${rendered.seconds} s)`);
  }

  // ---- the showcases made from our dance trends: each opens as its edit, with what was put on it, and exports at the picture's size and length
  await page.evaluate(() => (location.hash = "#/jam"));
  await page.waitForSelector(".jam .jm-tile", { timeout: 20000 });
  await workspace("edit");
  ok((await page.evaluate(() => import("/js/jam.js").then((m) => m.jam.list.some((j) => /ramalama/i.test(j.id + j.name))))) === false, "Ramalama is not one of the showcases");
  for (const [id, name, want] of [["jam-toc-toc", "Toc Toc", { clips: 4, fx: 6, stickers: 3, lines: 6, seconds: 9.833 }], ["jam-hotel-lobby", "Hotel Lobby", { clips: 6, fx: 7, stickers: 4, lines: 5, seconds: 18 }]]) {
    await page.evaluate((id) => import("/js/jam.js").then((m) => m.openJam(id)), id);
    await page.waitForTimeout(1500);
    const c = await body();
    const main = c.tracks.find((t) => t.main).items;
    const got = { clips: main.length, fx: c.tracks.find((t) => t.kind === "fx").items.length, stickers: c.tracks.find((t) => t.id === "v2").items.length, lines: c.tracks.find((t) => t.kind === "title").items.filter((i) => i.lyric).length };
    ok(JSON.stringify(got) === JSON.stringify({ clips: want.clips, fx: want.fx, stickers: want.stickers, lines: want.lines }), `${name} opens as its edit: ${JSON.stringify(got)}`);
    ok(c.beats?.times.length > 8 && c.beats.source === "web" && c.tracks.find((t) => t.role === "music").items.length === 1, `${name} has its beats (${c.beats?.bpm} BPM, ${c.beats?.times.length}) and its sound`);
    // each clip is the stretch of the dance that is at its own time, so the picture is in step with the sound
    ok(main.every((it, i) => Math.abs(it.from - (i ? main[i - 1].to : 0)) < 0.002), `${name}: the clips follow each other through the dance`);
    await page.locator('.jm-foot [data-go="export"]').click();
    ok(await until(() => import("/js/jam.js").then((m) => !!m.jam.jam.body.film).catch(() => false), 240), `${name} is exported`);
    const f = await page.evaluate(async () => (await import("/js/jam.js")).jam.jam.body.film);
    await writeFile(join(out, `${id}.mp4`), Buffer.from(await (await fetch(`${base}${f.url}`)).arrayBuffer()));
    const pr = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,width,height,nb_frames", "-of", "json", join(out, `${id}.mp4`)]).toString());
    const vid = pr.streams.find((x) => x.codec_type === "video");
    ok(vid.width === 720 && vid.height === 1280 && Math.abs(Number(vid.nb_frames) - Math.round(want.seconds * 24)) <= 1, `${name}'s film is 720x1280, ${vid.nb_frames} frames (${Math.round(want.seconds * 24)} wanted)`);
  }

  // ---- a whip into a clip: the film has the same length as a cut would, and the preview shows the same sweep over its last five frames
  const whipped = await api("api/cuts", "POST", { name: "Whip test", body: { aspect: "9:16", fit: "cover", tracks: [
    { id: "video", kind: "video", main: true, items: [{ id: "w1", src: { kind: "video", id: "jamtest-clip-3.mp4" }, from: 0, to: 3, speed: 1, sound: false, join: "cut" }, { id: "w2", src: { kind: "video", id: "jamtest-clip-4.mp4" }, from: 0, to: 3, speed: 1, sound: false, join: "whip" }] }] } });
  const whipFilm = await api(`api/cuts/${whipped.project.id}/render`, "POST", {});
  await writeFile(join(out, "whip.mp4"), Buffer.from(await (await fetch(`${base}${whipFilm.url}`)).arrayBuffer()));
  const frames = Number(execFileSync("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", join(out, "whip.mp4")]).toString().trim());
  ok(frames === 144, `the whipped film runs 144 frames, as a cut would (${frames})`);
  await page.evaluate((id) => import("/js/cut.js").then((m) => m.openCut(id)), whipped.project.id);
  await page.waitForTimeout(1200);
  for (let k = 0; k < 5; k++) {
    const n = 67 + k;
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", join(out, "whip.mp4"), "-vf", `select=eq(n\\,${n}),scale=90:160`, "-vsync", "0", "-frames:v", "1", "-pix_fmt", "gray", "-f", "rawvideo", join(out, `whip-film-${k}.gray`)]);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", join(out, "whip.mp4"), "-vf", `select=eq(n\\,${n})`, "-vsync", "0", "-frames:v", "1", join(out, `whip-film-${k}.png`)]);
    await seek(n / 24 + 0.004);
    await settle();
    await page.locator(".cut-screen").screenshot({ path: join(out, `whip-preview-${k}.png`) });
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", join(out, `whip-preview-${k}.png`), "-vf", "scale=90:160", "-pix_fmt", "gray", "-f", "rawvideo", join(out, `whip-preview-${k}.gray`)]);
    const [A, B] = await Promise.all([readFile(join(out, `whip-film-${k}.gray`)), readFile(join(out, `whip-preview-${k}.gray`))]);
    const mid = (buf) => {
      const px = [];
      for (let y = 8; y < 152; y++) for (let x = 6; x < 84; x++) px.push(buf[y * 90 + x]);
      return px;
    };
    const [x, y] = [mid(A), mid(B)];
    const mean = (l) => l.reduce((q, r) => q + r, 0) / l.length;
    const [mx, my] = [mean(x), mean(y)];
    const cov = x.reduce((q, r, i) => q + (r - mx) * (y[i] - my), 0);
    const corr = cov / Math.sqrt(x.reduce((q, r) => q + (r - mx) ** 2, 0) * y.reduce((q, r) => q + (r - my) ** 2, 0));
    ok(corr > 0.8, `whip frame ${k + 1} of 5: the film and the preview agree (correlation ${corr.toFixed(3)})`);
  }

  // ---- a jam started from the shelf of dance trends: the trend's own sound, our version of its dance, the lead as the artist, the beats heard here
  await page.evaluate(() => (location.hash = "#/jam"));
  await page.waitForSelector(".jm-tile", { timeout: 20000 });
  await workspace("track");
  ok((await page.locator(".jm-b-start .jm-mini").count()) === 3 && (await page.locator(".jm-b-start .jm-way").count()) === 3, "START has its three ways in: your song, a track made, a dance trend (three covers of the shelf)");
  const paidBefore = paid.length;
  await page.locator('.jm-b-start .jm-mini:has(em:text-is("Toc Toc"))').click();
  ok(await until(() => import("/js/jam.js").then((m) => m.jam.jam?.body.trend?.id === "toc-toc" && m.jam.jam.id !== "jam-toc-toc" && !m.jam.starting && !!m.jam.jam.body.part && m.jam.jam.body.shots.length > 1).catch(() => false), 120), "picking Toc Toc on the shelf starts a jam of its own");
  const started = await page.evaluate(async () => {
    const { jam } = await import("/js/jam.js");
    const b = jam.jam.body;
    return { name: jam.jam.name, kind: b.track.kind, artist: b.artist?.crew, synced: b.dance?.synced, beats: b.beats.length, bpm: b.bpm, kinds: [...new Set(b.shots.map((s) => s.kind))] };
  });
  ok(started.name === "Toc Toc" && started.kind === "trend" && started.artist === "josie" && started.synced === true, `it has the trend's sound, Josie as the artist and the dance in step (${JSON.stringify(started)})`);
  // (the catalogue says 128 for the new track made in its feel; the trend's own sound is heard at its own tempo: the dancer's hops are at about 166, and every other one at about 83)
  ok(started.beats > 8 && (Math.abs(started.bpm - 83) < 4 || Math.abs(started.bpm - 166) < 8) && started.kinds.join() === "dance", `its beats were heard here (${started.beats} at ${started.bpm} BPM) and every shot is a dance shot`);
  ok(paid.length === paidBefore, "starting from a trend asked for nothing that costs credits: no track made, no words heard");
  await page.waitForTimeout(600);
  const strip = await page.locator(".jm-tile em").allInnerTexts();
  ok(strip[1].includes("BPM") && strip[3] === "Josie", `its tiles say so: ${strip.join(" | ")}`);

  // ---- keeping the edit right
  await page.evaluate(() => (location.hash = "#/jam"));
  await page.waitForSelector(".jam .jm-tile", { timeout: 20000 });
  const openJam = (id) => page.evaluate((id) => import("/js/jam.js").then((m) => m.openJam(id)), id);
  const musicOf = () => page.evaluate(async () => {
    const c = await import("/js/cut.js");
    const it = c.cut.project.body.tracks.find((t) => t.role === "music").items[0];
    return it ? { src: it.src.duration, duration: c.sourceOf(it.src).duration, length: c.lengthOf(it) } : null;
  });

  // the music runs as long as the sound does, in the preview and for the beat finder (a sound named without its length was given five seconds)
  await openJam("jam-hotel-lobby");
  await page.waitForTimeout(1500);
  const showcaseMusic = await musicOf();
  ok(showcaseMusic.duration > 17.9 && showcaseMusic.length > 17.9, `a showcase's music runs its whole length (${showcaseMusic.length} s)`);
  const bare = await api("api/cuts", "POST", { name: "Bare music", body: { aspect: "9:16", tracks: [{ id: "a2", kind: "audio", role: "music", name: "Music", items: [{ id: "m", src: { kind: "audio", id: "trend-hotel-lobby-sound.m4a" }, start: 0, from: 0, to: null }] }] } });
  await page.evaluate((id) => import("/js/cut.js").then((m) => m.openCut(id)), bare.project.id);
  const bareMusic = await musicOf();
  ok(bareMusic.src > 17.9 && bareMusic.length > 17.9, `an edit that names its sound without its length is told it when opened (${bareMusic.src} s)`);
  await page.evaluate(() => import("/js/cut.js").then((m) => m.detectBeatsNow()));
  const heardAll = await page.evaluate(async () => (await import("/js/cut.js")).cut.project.body.beats?.times.at(-1) ?? 0);
  ok(heardAll > 16, `the beats are heard in all of the music, to ${heardAll} s (not to 5 s)`);

  // the beats heard for one edit are not given to another opened while they were being heard
  await page.evaluate(async () => {
    const real = window.fetch;
    window.__realFetch = real;
    window.fetch = (url, ...rest) => (String(url).includes("/media/audio/") ? new Promise((done) => setTimeout(done, 1500)).then(() => real(url, ...rest)) : real(url, ...rest));
    const c = await import("/js/cut.js");
    delete c.cut.project.body.beats;
    c.commit();
    window.__heard = c.detectBeatsNow();
  });
  const other = await api("api/cuts", "POST", { name: "Another edit", body: { aspect: "9:16", tracks: [] } });
  await page.evaluate((id) => import("/js/cut.js").then((m) => m.openCut(id)), other.project.id);
  await page.evaluate(() => window.__heard);
  await page.evaluate(() => (window.fetch = window.__realFetch));
  const otherBeats = await page.evaluate(async () => (await import("/js/cut.js")).cut.project.body.beats);
  ok(otherBeats === undefined, "beats heard for the first edit were not written into the one opened meanwhile");

  // Export sets up nothing that was already set up: music taken away stays away, the shape chosen in Kitchen's Cut stays
  await openJam("jam-toc-toc");
  await page.waitForTimeout(1200);
  await workspace("edit");
  const before = await page.evaluate(async () => {
    const c = await import("/js/cut.js");
    const j = await import("/js/jam.js");
    const b = c.cut.project.body;
    c.removeItem(b.tracks.find((t) => t.role === "music").items[0].id);
    b.aspect = "1:1";
    b.duck = true;
    c.commit();
    return j.jam.jam.body.film?.id ?? null;
  });
  await page.locator('.jm-foot [data-go="export"]').click();
  ok(await until((was) => import("/js/jam.js").then((m) => m.jam.jam.body.film?.id !== was && !m.jam.busy.has("render")).catch(() => false), 240, before), "it is exported again");
  const shaped = await body();
  ok(shaped.tracks.find((t) => t.role === "music").items.length === 0 && shaped.aspect === "1:1" && shaped.duck === true, `Export left the music away and the aspect (${shaped.aspect}) and ducking (${shaped.duck}) as they were set`);

  // a line's words as written: a word edited by hand is in the line's text, and timing the line again keeps it
  const lineId = (await body()).tracks.find((t) => t.kind === "title").items.find((i) => i.lyric).id;
  await page.evaluate(async (id) => {
    const c = await import("/js/cut.js");
    c.setWord(id, 1, { text: "WOW" });
    c.splitLine(id, "letters");
  }, lineId);
  const edited = (await body()).tracks.find((t) => t.kind === "title").items.find((i) => i.id === lineId);
  ok(edited.text === "HOP WOW" && edited.words[1].text === "WOW" && edited.words[0].text === "HOP", `the line says "${edited.text}" and the word edited is still there after the line is timed again`);

  // saves are not forgotten: renaming one video and then another at once keeps both; an edit left for Kitchen's Cut at once is kept
  await page.evaluate(async () => {
    const j = await import("/js/jam.js");
    await j.openJam("jam-toc-toc");
    j.rename("Alpha save");
    await j.openJam("jam-hotel-lobby");
    j.rename("Beta save");
  });
  await page.waitForTimeout(1500);
  const names = [(await api("api/jams/jam-toc-toc")).project.name, (await api("api/jams/jam-hotel-lobby")).project.name];
  ok(names.join() === "Alpha save,Beta save", `both renames were kept (${names.join(", ")})`);
  const fxBefore = (await api("api/cuts/cut-jam-hotel-lobby")).project.body.tracks.find((t) => t.kind === "fx").items.length;
  // (and then Kitchen's own edit is changed before Jam's moment is up: the second change does not cancel the first)
  const kitchenId = await page.evaluate(async () => {
    const j = await import("/js/jam.js");
    await j.openJam("jam-hotel-lobby");
    const c = await import("/js/cut.js");
    c.addFx("shake", { at: 1, length: 2 });
    location.hash = "#/cut";
    for (let i = 0; i < 60 && (c.cut.quiet || c.cut.project?.id === "cut-jam-hotel-lobby"); i++) await new Promise((r) => setTimeout(r, 50));
    c.addTitle("Kept too", 0);
    return c.cut.project.id;
  });
  await page.waitForTimeout(2500);
  const fxAfter = (await api("api/cuts/cut-jam-hotel-lobby")).project.body.tracks.find((t) => t.kind === "fx").items.length;
  ok(fxAfter === fxBefore + 1, `an edit changed in Jam and left for Kitchen's Cut at once was kept (${fxBefore} effects, then ${fxAfter})`);
  const kitchenTitles = (await api(`api/cuts/${kitchenId}`)).project.body.tracks.find((t) => t.kind === "title").items.map((i) => i.text);
  ok(kitchenId !== "cut-jam-hotel-lobby" && kitchenTitles.includes("Kept too"), `and Kitchen's own change, made before that save was due, was kept as well (${kitchenId})`);

  // ---- Pickle: a tool of his panel says its words to him; he is told it is Jam, which workspace is open, and what the jam holds
  await page.evaluate(() => (location.hash = "#/jam"));
  await page.waitForSelector(".jm-tile", { timeout: 20000 });
  await openJam("jam-test-showcase");
  await page.waitForTimeout(1500);
  await workspace("words");
  const asked = [];
  await page.route("**/api/cut/assist", async (route) => {
    asked.push(JSON.parse(route.request().postData()));
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ reply: "Bigger, and popping.", actions: [{ op: "captions", style: "pop", size: 0.12 }, { op: "open", workspace: "band" }] }) });
  });
  // (his panel has no canned keys now: the words are said through his bar, as a typed message is)
  const askLabel = "said through the bar";
  await page.evaluate(async () => (await import("/js/harnesses.js")).tell("Make the captions bigger."));
  ok(await until(() => import("/js/jam.js").then((m) => m.jam.workspace === "band").catch(() => false), 30), "words said to Pickle are answered, and what he answers is done (he opened The band)");
  const told = asked[0];
  ok(asked.length === 1 && told.product === "jam" && told.cut.jam?.workspace === "words" && told.messages.at(-1).text === "Make the captions bigger." && told.cut.jam.track?.name, `he is asked as Jam's (${askLabel}): product ${told?.product}, workspace ${told?.cut?.jam?.workspace}, the track ${told?.cut?.jam?.track?.name}`);
  const done = await page.evaluate(async () => {
    const j = await import("/js/jam.js");
    const c = await import("/js/cut.js");
    return { captions: j.jam.jam.body.captions, size: c.cut.project?.body.tracks.find((t) => t.kind === "title")?.items.find((i) => i.lyric)?.size };
  });
  ok(done.captions === "pop" && Math.abs(done.size - 0.12) < 1e-6, `his actions were applied: captions ${done.captions}, size ${done.size}`);
  const shown = await page.waitForFunction(() => /Bigger, and popping/.test(document.querySelector("#assistant")?.innerText ?? ""), null, { timeout: 8000 }).then(() => true, () => false);
  ok(shown, "his answer is in his chat bar");
  await page.unroute("**/api/cut/assist");

  // ---- nothing blocks: while a dance trend is being started (slowly), the workspaces and the other jams are free
  await page.route("**/api/mixer/trends/*/files", async (route) => {
    await new Promise((r) => setTimeout(r, 4000));
    await route.continue();
  });
  await workspace("track");
  const listLength = await page.evaluate(() => import("/js/jam.js").then((m) => m.jam.list.length));
  await page.locator('.jm-b-start .jm-mini:has(em:text-is("Hotel Lobby"))').click();
  ok(await until(() => import("/js/jam.js").then((m) => !!m.jam.starting).catch(() => false), 20), "a jam is being started from a trend");
  const t0 = Date.now();
  await workspace("band");
  await workspace("words");
  ok((await page.locator(".jm-tile.is-on").getAttribute("data-workspace")) === "words" && Date.now() - t0 < 2500, "the workspaces can be switched while it starts");
  await page.locator(".jm-jam").click();
  await page.locator('.jm-menu-open:has(b:text-is("Alpha save"))').click();
  ok(await until(() => import("/js/jam.js").then((m) => m.jam.jam?.id === "jam-toc-toc" && !!m.jam.starting).catch(() => false), 20), "and another jam can be opened from the set list");
  ok(await until(() => import("/js/jam.js").then((m) => !m.jam.starting).catch(() => false), 60), "the trend's jam finishes on its own");
  const settled = await page.evaluate(() => import("/js/jam.js").then((m) => ({ open: m.jam.jam.id, count: m.jam.list.length })));
  ok(settled.open === "jam-toc-toc" && settled.count === listLength + 1, `and the one open stays the one chosen (${settled.open}); the new one is in the set list (${settled.count} jams)`);
  await page.unroute("**/api/mixer/trends/*/files");

  // ---- a song of your own, added: cut and its beats found here, and nothing that costs credits asked for
  await page.evaluate(() => import("/js/jam.js").then((m) => m.newJam()));
  await workspace("track");
  const chooser = page.waitForEvent("filechooser");
  await page.locator(".jm-b-start .jm-way", { hasText: "Your song" }).click();
  await (await chooser).setFiles(join(root, "web", "brand", "jam", "projects", "jam-test-showcase", "media", "track.mp3"));
  ok(await until(() => import("/js/jam.js").then((m) => !!m.jam.jam.body.part && !m.jam.busy.has("part") && !m.jam.busy.has("track")).catch(() => false), 60), "a song added is cut, and its beats are found here");
  const own = await page.evaluate(() => import("/js/jam.js").then((m) => ({ kind: m.jam.jam.body.track.kind, bpm: m.jam.jam.body.bpm, name: m.jam.jam.name })));
  ok(own.kind === "upload" && own.name === "track", `the jam is named after the song (${own.name}), ${own.bpm} BPM`);
  ok(paid.length === 0, `nothing in all of that asked for credits (${paid.join(", ") || "no paid request"})`);

  // ---- what a job does is for the video it was asked for: a video that is not the open one is not told it is busy, and what is heard for it
  // after it was left (the credits are spent) is kept on it, its edit made when it is opened; the editor keeps the open video's
  const away = await page.evaluate(async () => {
    const j = await import("/js/jam.js");
    const c = await import("/js/cut.js");
    const a = j.jam.jam;
    window.__away = a;
    await j.openJam("jam-hotel-lobby");
    const open = j.jam.jam;
    j.jam.busy.add("listen", a);
    const marks = { here: j.jam.busy.has("listen"), there: j.jam.busy.has("listen", a), statusThere: j.statusOf(a).words, statusHere: j.statusOf(open).words };
    j.jam.busy.delete("listen", a);
    const kept = await j.putHeard(a, { ...a.body.span }, { file: a.body.part.file, url: a.body.part.url, seconds: a.body.part.seconds }, { srt: "1\n00:00:00,500 --> 00:00:01,500\nhello world\n\n2\n00:00:02,000 --> 00:00:03,000\nsecond line\n", bpm: "120" });
    return { id: a.id, marks, kept, stale: a.body.stale === true, lines: a.body.lines.map((l) => l.text), editorStays: c.cut.project.id === open.body.cut, stillOpen: j.jam.jam.id === open.id };
  });
  ok(!away.marks.here && away.marks.there && away.marks.statusThere === "Hearing…" && away.marks.statusHere !== "Hearing…", `a mark is its video's: busy there (${away.marks.statusThere}), not here (${away.marks.statusHere})`);
  ok(away.kept && away.stale && away.lines.join("|") === "hello world|second line" && away.editorStays && away.stillOpen, `the words heard for a video that was left are on it (${away.lines.join(" | ")}), and the editor still holds the open one's edit`);
  await page.waitForTimeout(1200);
  ok(((await api(`api/jams/${away.id}`)).project.body.lines ?? []).length === 2, "and kept on the server");
  await page.evaluate((id) => import("/js/jam.js").then((m) => m.openJam(id)), away.id);
  ok(await until(() => import("/js/jam.js").then((j) => import("/js/cut.js").then((c) => !!c.cut.project && c.cut.project.id === j.jam.jam.body.cut && !j.jam.jam.body.stale && c.lyrics().length === 2)).catch(() => false), 40), "opened again, its edit has the words");

  // ---- the paid steps are keys, each with its estimate; pressing one asks for that step only
  await page.route("**/api/jam/listen", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "not in the test" }) }));
  await page.route("**/api/audio/music", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "not in the test" }) }));
  await page.evaluate(async () => {
    const store = await import("/js/store.js");
    store.state.info = { ...(store.state.info ?? {}), target: "comfy-cloud" };
    store.changed("jam");
  });
  await page.waitForTimeout(300);
  const hearText = await page.locator(".jm-b-hear .jm-keybig").innerText();
  const makeText = await page.locator(".jm-b-start .jm-way", { hasText: "Make a track" }).innerText();
  ok(/Hear the words\s+≈ \d+ cr/.test(hearText) && /≈ \d+ cr/.test(makeText), `the keys that cost show their estimate (${hearText.replace(/\s+/g, " ")} | ${makeText.replace(/\s+/g, " ")})`);
  await page.locator(".jm-b-hear .jm-keybig").click();
  await page.waitForTimeout(600);
  ok(paid.join() === "/api/jam/listen", `Hear the words asks for the words, and only that (${paid.join()})`);
  await page.locator(".jm-b-start .jm-way", { hasText: "Make a track" }).click();
  await page.waitForSelector(".jm-win .jm-make");
  const makeKey = page.locator(".jm-win .jm-make .key.is-primary");
  ok(await makeKey.isDisabled(), "Make it waits until the music is described");
  await page.locator('.jm-win input[data-focus="make:prompt"]').fill("upbeat indie pop, handclaps");
  await page.locator('.jm-win input[data-focus="make:prompt"]').press("Tab");
  await page.locator(".jm-win .jm-make .key.is-primary").click();
  await page.waitForTimeout(500);
  ok(paid.join() === "/api/jam/listen,/api/audio/music", `Make it asks for the track, and only that (${paid.join()})`);
  ok(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(" | ")}` : ""}`);
} finally {
  await browser.close();
  server.kill();
  await rm(dataDir, { recursive: true, force: true });
  if (!process.env.OUT) await rm(out, { recursive: true, force: true });
}
console.log(failures ? `${failures} failed` : "all passed");
process.exit(failures ? 1 : 0);
