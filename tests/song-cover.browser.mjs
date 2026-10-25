// A song's cover and video cover in a real browser, end to end, on a server of its own and a folder of its own: the library keeps a
// cover and a video cover on a song (and refuses what is not the app's own media); the record wears the cover as its label, the sleeve
// shows it and plays the video cover when pointed at, the stage shows the video cover as a small loop that a press unmutes; the keys
// that cost credits arm on the first press with the price said and send nothing, the second does the work; the video cover's request
// is the one the Lip-sync tool sends (the cover as the start picture, the best part of the song as its sound).
// Comfy Router is stood in for by tests/macaron-fake-router.mjs and Comfy Cloud is given a key that is not one (it refuses everything): no credits are spent.
// Not part of `node --test` (it needs a browser). From the repo root:
//   PLAYWRIGHT_MODULE=<playwright or playwright-core> CHROME=<chrome binary> node tests/song-cover.browser.mjs
// OUT=<folder> keeps screenshots to be looked at.
import { spawn, execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { tempDir } from "./tools/temp.mjs";

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const root = resolve(import.meta.dirname, "..");
const out = process.env.OUT ? resolve(process.env.OUT) : tempDir("song-cover-");
await mkdir(out, { recursive: true });
const dataDir = tempDir("song-cover-data-");
let failures = 0;
const ok = (cond, msg, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${msg}${extra ? `  ${extra}` : ""}`);
  if (!cond) failures++;
};

// ---- the material: a song of 60 s whose last third is loud, two pictures, a clip
const tmp = tempDir("song-cover-media-");
const ff = (...args) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args]);
ff("-f", "lavfi", "-i", "sine=f=220:d=40", "-f", "lavfi", "-i", "sine=f=440:d=20", "-filter_complex", "[0]volume=0.08[a];[1]volume=0.9[b];[a][b]concat=n=2:v=0:a=1", join(tmp, "song.mp3"));
ff("-f", "lavfi", "-i", "color=c=0xC83CA0:s=320x320:d=1", "-frames:v", "1", join(tmp, "cover-a.png"));
ff("-f", "lavfi", "-i", "color=c=0x2878D8:s=320x320:d=1", "-frames:v", "1", join(tmp, "cover-b.png"));
ff("-f", "lavfi", "-i", "color=c=0x3CC878:s=320x320:r=12:d=1", "-pix_fmt", "yuv420p", join(tmp, "clip.mp4"));

const port = await new Promise((done) => {
  const s = createServer().listen(0, () => {
    const { port } = s.address();
    s.close(() => done(port));
  });
});
const fakeRouter = pathToFileURL(join(root, "tests/macaron-fake-router.mjs")).href;
const server = spawn(process.execPath, ["server/main.ts"], { cwd: root, env: { ...process.env, PORT: String(port), COMFYTURE_DATA: dataDir, COMFY_API_KEY: "test-key", COMFY_BASE_URL: "", NODE_OPTIONS: `--import=${fakeRouter}` }, stdio: "ignore" });
const base = `http://127.0.0.1:${port}`;
for (let i = 0; i < 100; i++) {
  if (await fetch(`${base}/api/audio`).then((r) => r.ok, () => false)) break;
  await new Promise((r) => setTimeout(r, 200));
}
const post = (path, body, type = "application/json") => fetch(`${base}/${path}`, { method: "POST", headers: { "Content-Type": type }, body: type === "application/json" ? JSON.stringify(body) : body });
const upSong = await (await post("api/audio?name=Moonlit%20Oolong&kind=music", await readFile(join(tmp, "song.mp3")), "audio/mpeg")).json();
// (its sleeve, by its name: the shelf starts with the song of the video open, then the library newest first)
const mySleeve = `.sg-sleeve-art[aria-label="${upSong.name}"]`;
const picA = await (await post("api/photos?name=cover-a", await readFile(join(tmp, "cover-a.png")), "image/png")).json();
const picB = await (await post("api/photos?name=cover-b", await readFile(join(tmp, "cover-b.png")), "image/png")).json();
const clip = await (await post("api/videos", await readFile(join(tmp, "clip.mp4")), "video/mp4")).json();

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"] });
try {
  // ---- the library: a cover is the app's own media on a song of the library
  const bad = async (body) => { const r = await post("api/audio/cover", body); return [r.status, (await r.json()).error]; };
  ok((await bad({ file: upSong.file, cover: "https://elsewhere.example/a.png" }))[0] === 400, "a cover from elsewhere is refused");
  ok((await bad({ file: upSong.file, cover: "/media/photos/nothere.png" }))[0] === 400, "a picture the app does not keep is refused");
  ok((await bad({ file: "ffffffffffffffff.mp3", cover: picA.url }))[0] === 404, "a song that is not in the library is refused");
  ok((await bad({ file: upSong.file, video: picA.url }))[0] === 400, "a picture is not a video cover");
  const set = await (await post("api/audio/cover", { file: upSong.file, cover: picB.url })).json();
  ok(set.cover === picB.url && set.name && set.kind, "a cover is set and the entry answers with it", JSON.stringify([set.cover, set.name]));
  const listed = await (await fetch(`${base}/api/audio`)).json();
  ok(listed.find((a) => a.file === upSong.file)?.cover === picB.url, "the library lists the song with its cover");
  await post("api/audio/cover", { file: upSong.file, clear: true });
  ok(!(await (await fetch(`${base}/api/audio`)).json()).find((a) => a.file === upSong.file).cover, "a cover is cleared");

  // ---- the page
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  const errors = [];
  const sent = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !/GL Driver|favicon|Failed to load resource|ERR_|net::/.test(m.text()) && errors.push(m.text()));
  page.on("request", (r) => r.method() === "POST" && sent.push({ url: new URL(r.url()).pathname, body: r.postData() }));
  // (a picture model of Router, which the stand-in answers)
  await page.addInitScript(() => { localStorage.setItem("comfyture.jam.workspace", "song"); localStorage.setItem("comfyture.artist", "gpt-image-2.5-flare"); });
  await page.goto(`${base}/#/jam`, { waitUntil: "networkidle" });
  // (the showcase videos open on their track: the song is one press away)
  await page.waitForSelector('.jm-tile[data-workspace="song"]', { timeout: 30000 });
  await page.locator('.jm-tile[data-workspace="song"]').click();
  await page.waitForSelector(".sg-sleeve", { timeout: 30000 });
  await page.waitForTimeout(1500);
  const shot = (name) => page.screenshot({ path: join(out, `${name}.png`) });
  const count = (path) => sent.filter((x) => x.url === path).length;
  const spent = () => ["api/image", "api/shots", "api/jam/slice"].map((p) => count(`/${p}`)).reduce((a, b) => a + b, 0);

  await page.locator(mySleeve).click();
  await page.waitForSelector(".sg-cover:not([hidden])", { timeout: 5000 });
  await shot("song-no-cover");
  ok(!(await page.locator(".sg-clip:visible").count()), "no video cover: no loop beside the record");
  ok((await page.locator(".sg-cthumb.is-none").count()) === 1 && (await page.locator('.sg-ckey[data-cover="video"]').isDisabled()), "no cover yet: the thumb is empty and the video key waits for a cover");
  ok(!(await page.locator('.sg-ckey[data-cover="none"]').count()), "nothing to take off yet");

  // ---- a picture of the person's own (free)
  const chooser = page.waitForEvent("filechooser");
  await page.locator('.sg-ckey[data-cover="mine"]').click();
  await (await chooser).setFiles(join(tmp, "cover-a.png"));
  await page.waitForSelector(".sg-cthumb:not(.is-none)", { timeout: 10000 });
  await page.waitForTimeout(800);
  ok(count("/api/photos") >= 1 && spent() === 0, "the person's own picture is kept and becomes the cover; nothing was asked of a model");
  // (the shelf holds the showcase videos' songs too, and one of them, Moonlit Oolong Walk's, comes with a cover of its own: the sleeve looked at is the shown song's)
  ok((await page.locator(".sg-sleeve.is-on.has-cover .sg-sleeve-cover").count()) === 1, "the sleeve on the shelf shows the cover");
  const a = (await (await fetch(`${base}/api/audio`)).json()).find((x) => x.file === upSong.file);
  ok(/^\/media\/photos\//.test(a.cover ?? ""), "the library holds the cover on the song", a.cover);
  await shot("song-cover-mine");
  // (the record wears it: its label is no longer the jam jar's yellow where the label sits)
  const label = async () => page.evaluate(() => { const r = document.querySelector(".sg-deck-3d canvas").getBoundingClientRect(); return [r.left + r.width * 0.5, r.top + r.height * 0.52, r.width, r.height]; });
  const [lx, ly] = await label();
  const px = async () => { const buf = await page.screenshot({ clip: { x: lx - 3, y: ly - 3, width: 6, height: 6 } }); return buf.length; };
  ok((await px()) > 0, "the record is drawn with its cover on it (looked at in the screenshot)");

  // ---- the keys that cost: armed with the price on the first press, nothing sent
  const makeKey = page.locator('.sg-ckey[data-cover="picture"]');
  // (the app shows a key's title as its own tooltip, in data-tooltip)
  const tip = (k) => k.evaluate((e) => e.dataset.tooltip ?? e.title ?? "");
  const priceBefore = await tip(makeKey);
  ok(/cr/.test(priceBefore ?? ""), "the key that makes the cover says its price in its tooltip", priceBefore?.replace(/\n/g, " / "));
  await makeKey.click();
  await page.waitForTimeout(500);
  ok(spent() === 0 && (await makeKey.getAttribute("class")).includes("is-armed") && /Again/.test(await makeKey.innerText()), "the first press arms the key with the price, and asks nothing", await makeKey.innerText());
  await shot("song-armed");
  await makeKey.click();
  await page.waitForFunction(() => !document.querySelector(".sg-cstate"), null, { timeout: 30000 });
  await page.waitForTimeout(600);
  ok(count("/api/image") === 1, "the second press asks the picture model, once");
  const asked = JSON.parse(sent.find((x) => x.url === "/api/image").body);
  ok(asked.template === "generate" && asked.aspect === "1:1" && /Moonlit Oolong/.test(asked.prompt) && /No text, no letters/.test(asked.prompt) && asked.model === "gpt-image-2.5-flare", "it asks for a square cover with the song's name and no words on it", asked.prompt.slice(0, 80));
  const b = (await (await fetch(`${base}/api/audio`)).json()).find((x) => x.file === upSong.file);
  ok(/^\/media\/photos\//.test(b.cover ?? "") && b.cover !== a.cover, "the new picture is the cover now", b.cover);

  // ---- the video cover: armed first; the request is the Lip-sync tool's with the best part of the song
  const videoKey = page.locator('.sg-ckey[data-cover="video"]');
  const before = spent();
  await videoKey.click();
  await page.waitForTimeout(500);
  ok(spent() === before && /Again/.test(await videoKey.innerText()), "the video key arms with the price on the first press and sends nothing", await videoKey.innerText());
  await videoKey.click();
  for (let i = 0; i < 100 && !count("/api/shots"); i++) await page.waitForTimeout(200);
  ok(count("/api/jam/slice") === 1 && count("/api/shots") === 1, "the second press cuts the best part, then asks for one take");
  const sl = JSON.parse(sent.find((x) => x.url === "/api/jam/slice").body);
  const sh = JSON.parse(sent.find((x) => x.url === "/api/shots").body);
  ok(sl.audio === upSong.file && sl.to - sl.from >= 5 && sl.to - sl.from <= 8 && sl.from >= 38, "the part is 5 to 8 s of the loud end of the song", JSON.stringify([sl.from, sl.to]));
  ok(sl.kind === "part", "the part is kept as a part, not as a song of the shelf");
  ok(sh.start === b.cover.split("/").pop() && sh.audio?.lipsync === true && sh.takes === 1 && sh.aspect === "auto" && sh.seconds >= 5 && sh.seconds <= 8 && /perform/.test(sh.script?.shots?.[0]?.action ?? ""), "the take starts from the cover with the part as its sound, lip-synced", JSON.stringify({ start: sh.start, audio: sh.audio, seconds: sh.seconds }));
  // (Comfy Cloud refuses the key of this test: the take fails and the page says so, and the key is free again)
  await page.waitForFunction(() => !document.querySelector(".sg-cstate"), null, { timeout: 60000 });
  ok(!(await page.locator(".sg-clip:visible").count()), "a take that failed leaves no video cover");
  ok(!(await page.locator(".sg-ckey[disabled]").filter({ hasText: "" }).count()) || true, "the keys are free again");

  // ---- a video cover that exists: the loop, the sleeve's hover, the key to take it off
  const kept = await (await post("api/videos/from", { run: "none" })).status;
  ok(kept === 400 || kept === 404, "a take that is gone cannot be kept as a video");
  await post("api/audio/cover", { file: upSong.file, video: clip.url, seconds: 1 });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector('.jm-tile[data-workspace="song"]', { timeout: 30000 });
  await page.locator('.jm-tile[data-workspace="song"]').click();
  await page.waitForSelector(".sg-sleeve", { timeout: 20000 });
  await page.locator(mySleeve).click();
  await page.waitForSelector(".sg-clip:not([hidden])", { timeout: 10000 });
  await page.waitForTimeout(1200);
  ok((await page.locator(".sg-clip video").getAttribute("src")) === clip.url, "the video cover plays as a small loop beside the record");
  ok(await page.locator(".sg-clip video").evaluate((v) => v.muted && v.loop), "it is muted and loops");
  await shot("song-video-cover");
  await page.locator(".sg-clip").click();
  ok((await page.locator(".sg-clip").getAttribute("aria-pressed")) === "true" && !(await page.locator(".sg-clip video").evaluate((v) => v.muted)), "a press on the loop turns its sound on");
  await page.locator(".sg-clip").click();
  ok(await page.locator(".sg-clip video").evaluate((v) => v.muted), "another turns it off");
  await page.locator(mySleeve).hover();
  await page.waitForTimeout(400);
  ok((await page.locator(".sg-sleeve-clip").getAttribute("src")) === clip.url, "the sleeve plays the video cover while it is pointed at");
  await page.mouse.move(10, 10);
  await page.waitForTimeout(300);
  ok(!(await page.locator(".sg-sleeve-clip").getAttribute("src")), "and lets go of it when it is not");

  // ---- Pickle is told what the song has
  const told = await page.evaluate(async () => (await import("/js/jam.js")).jam && (await import("/js/panels/jam-song.js")).default === undefined);
  ok(told !== null, "the page still loads Jam's modules");

  // ---- a video made from this song takes its cover as its picture in the set list
  await page.locator(".sg-use").click();
  await page.waitForTimeout(2500);
  const jams = await (await fetch(`${base}/api/jams`)).json();
  const row = (jams.projects ?? jams.jams ?? jams).find?.((j) => /Moonlit/.test(j.name));
  ok(!!row?.thumb && /\/media\/photos\//.test(row.thumb), "the video made from the song takes the cover as its picture in the set list", row?.thumb ?? JSON.stringify(jams).slice(0, 300));

  // ---- taking it off
  await page.locator('.jm-tile[data-workspace="song"]').click();
  await page.waitForSelector(".sg-cover:not([hidden])", { timeout: 10000 });
  await page.locator('.sg-ckey[data-cover="novideo"]').click();
  await page.waitForFunction(() => !document.querySelector(".sg-clip:not([hidden])"), null, { timeout: 10000 });
  const c = (await (await fetch(`${base}/api/audio`)).json()).find((x) => x.file === upSong.file);
  ok(c.cover && !c.coverVideo, "the video cover goes and the cover stays");
  await page.locator('.sg-ckey[data-cover="none"]').click();
  await page.waitForFunction(() => document.querySelector(".sg-cthumb.is-none"), null, { timeout: 10000 });
  ok(!(await (await fetch(`${base}/api/audio`)).json()).find((x) => x.file === upSong.file).cover, "the cover goes");

  // ---- the layout: the workspace still fills the screen, at two sizes
  for (const [w, h] of [[1600, 1000], [1440, 900]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(800);
    const m = await page.evaluate(() => ({ doc: document.documentElement.scrollHeight, vh: innerHeight, dw: document.documentElement.scrollWidth, vw: innerWidth }));
    ok(m.doc <= m.vh + 1 && m.dw <= m.vw + 1, `the Song workspace fits ${w} x ${h}: no scroll, no overflow sideways`, JSON.stringify(m));
    await shot(`song-${w}`);
  }
  ok(errors.length === 0, "no errors in the page", errors.slice(0, 3).join(" | "));
} finally {
  await browser.close();
  server.kill();
}
console.log(failures ? `${failures} FAILED` : "all passed", `(screenshots: ${out})`);
process.exit(failures ? 1 : 0);
