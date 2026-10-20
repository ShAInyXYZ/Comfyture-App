// Jam's editor in a real browser, end to end, on a server of its own and a folder of its own: the
// seeded showcase opens; beats are heard, an effect and stickers are put on, a lyric word is retimed;
// undo, redo, save, reload; the film is exported, and its frames are held against the preview's at the
// same times; Kitchen's Cut and a Mixer-built cut still open and render. Not part of `node --test`
// (it needs a browser). Run it from the repo root:
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
  const body = () => page.evaluate(async () => JSON.parse(JSON.stringify((await import("/js/cut.js")).cut.project.body)));
  const until = async (fn, tries = 120) => {
    for (let i = 0; i < tries; i++) {
      if (await page.evaluate(fn)) return true;
      await page.waitForTimeout(500);
    }
    return false;
  };
  const seek = (t) => page.evaluate(async (t) => (await import("/js/panels/editor.js")).editor.seek(t), t);
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
  await page.waitForSelector(".jam .cut-screen", { timeout: 20000 });
  // (the showcases are several: this one is the small one made for the test)
  await page.evaluate(() => import("/js/jam.js").then((m) => m.openJam("jam-test-showcase")));
  await page.waitForTimeout(1200);
  const b0 = await body();
  ok(b0.product === "jam" && b0.aspect === "9:16" && b0.tracks.find((t) => t.main).items.length === 4, "the seeded Jam opens as its edit: 9:16, its four clips, product kept");

  // ---- beats: heard in the browser
  await page.locator('button[aria-label="Beats"]').click();
  await page.locator('.cut-inspector button:has-text("Detect")').click();
  ok(await until(() => import("/js/cut.js").then((m) => m.cut.project.body.beats.source === "web").catch(() => false)), "the beats are heard");
  const b1 = await body();
  ok(Math.abs(b1.beats.bpm - 124) < 0.6, `the tempo is 124 (heard ${b1.beats.bpm})`);

  // ---- an effect, two stickers (one moved), a lyric word retimed
  await page.locator('button[aria-label="Shake"]').click();
  await page.waitForTimeout(400);
  ok((await body()).tracks.find((t) => t.kind === "fx").items.some((i) => i.kind === "shake"), "a shake is on the Beat FX track");
  await page.locator('button[aria-label="Stickers"]').click();
  await page.waitForSelector(".cut-tray-item");
  await page.locator('.cut-tray-item[data-tooltip^="Star"]').click();
  await page.waitForTimeout(400);
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
  await page.locator(".cut-item.is-lyric").first().click();
  await page.waitForSelector('.cut-word-row input[aria-label="Word 2 starts"]');
  const line = (await body()).tracks.find((t) => t.kind === "title").items.find((i) => i.lyric);
  await page.locator('.cut-word-row input[aria-label="Word 2 starts"]').fill("0.85");
  await page.locator('.cut-word-row input[aria-label="Word 2 starts"]').press("Tab");
  await page.waitForTimeout(400);
  const retimed = (await body()).tracks.find((t) => t.kind === "title").items.find((i) => i.id === line.id);
  ok(Math.abs(retimed.words[1].from - 0.85) < 1e-6, "word 2 of the first line starts at 0.85");

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
  await page.waitForSelector(".jam .cut-screen", { timeout: 20000 });
  await page.waitForTimeout(1500);
  ok(JSON.stringify(await body()) === after, "after a reload it is all still there");

  // ---- exported, and held against the preview
  await page.locator('.jm-transport button:has-text("Export")').click();
  ok(await until(() => import("/js/jam.js").then((m) => !!m.jam.jam.body.film).catch(() => false), 360), "the film is exported");
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
    const rendered = await api(`api/cuts/${cutId}/render`, "POST", {});
    ok(rendered.seconds > 4, `${name} renders (${rendered.seconds} s)`);
  }

  // ---- the showcases made from our dance trends: each opens as its edit, with what was put on it, and exports at the picture's size and length
  await page.evaluate(() => (location.hash = "#/jam"));
  await page.waitForSelector(".jam .cut-screen", { timeout: 20000 });
  for (const [id, name, want] of [["jam-toc-toc", "Toc Toc", { clips: 4, fx: 6, stickers: 3, lines: 6, seconds: 9.833 }], ["jam-hotel-lobby", "Hotel Lobby", { clips: 6, fx: 7, stickers: 4, lines: 5, seconds: 18 }], ["jam-ramalama", "Ramalama", { clips: 4, fx: 6, stickers: 3, lines: 5, seconds: 15 }]]) {
    await page.evaluate((id) => import("/js/jam.js").then((m) => m.openJam(id)), id);
    await page.waitForTimeout(1500);
    const c = await body();
    const main = c.tracks.find((t) => t.main).items;
    const got = { clips: main.length, fx: c.tracks.find((t) => t.kind === "fx").items.length, stickers: c.tracks.find((t) => t.id === "v2").items.length, lines: c.tracks.find((t) => t.kind === "title").items.filter((i) => i.lyric).length };
    ok(JSON.stringify(got) === JSON.stringify({ clips: want.clips, fx: want.fx, stickers: want.stickers, lines: want.lines }), `${name} opens as its edit: ${JSON.stringify(got)}`);
    ok(c.beats?.times.length > 8 && c.beats.source === "web" && c.tracks.find((t) => t.role === "music").items.length === 1, `${name} has its beats (${c.beats?.bpm} BPM, ${c.beats?.times.length}) and its sound`);
    // each clip is the stretch of the dance that is at its own time, so the picture is in step with the sound
    ok(main.every((it, i) => Math.abs(it.from - (i ? main[i - 1].to : 0)) < 0.002), `${name}: the clips follow each other through the dance`);
    await page.locator('.jm-transport button:has-text("Export")').click();
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
  await page.waitForSelector(".jm-trend", { timeout: 20000 });
  await page.locator('.jm-trend-open:has(b:text-is("Toc Toc"))').click();
  ok(await until(() => import("/js/jam.js").then((m) => m.jam.jam?.body.trend?.id === "toc-toc" && m.jam.jam.id !== "jam-toc-toc" && !m.jam.starting && !!m.jam.jam.body.part && m.jam.jam.body.shots.length > 1).catch(() => false), 120), "picking Toc Toc on the shelf starts a jam of its own");
  const started = await page.evaluate(async () => {
    const { jam } = await import("/js/jam.js");
    const b = jam.jam.body;
    return { name: jam.jam.name, kind: b.track.kind, artist: b.artist?.crew, synced: b.dance?.synced, beats: b.beats.length, bpm: b.bpm, kinds: [...new Set(b.shots.map((s) => s.kind))] };
  });
  ok(started.name === "Toc Toc" && started.kind === "trend" && started.artist === "josie" && started.synced === true, `it has the trend's sound, Josie as the artist and the dance in step (${JSON.stringify(started)})`);
  // (the catalogue says 128 for the new track made in its feel; the trend's own sound is heard at its own tempo: the dancer's hops are at about 166, and every other one at about 83)
  ok(started.beats > 8 && (Math.abs(started.bpm - 83) < 4 || Math.abs(started.bpm - 166) < 8) && started.kinds.join() === "dance", `its beats were heard here (${started.beats} at ${started.bpm} BPM) and every shot is a dance shot`);
  ok(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(" | ")}` : ""}`);
} finally {
  await browser.close();
  server.kill();
  await rm(dataDir, { recursive: true, force: true });
  if (!process.env.OUT) await rm(out, { recursive: true, force: true });
}
console.log(failures ? `${failures} failed` : "all passed");
process.exit(failures ? 1 : 0);
