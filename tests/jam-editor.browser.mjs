// Jam in a real browser, end to end, on a server of its own and a folder of its own. Jam ships three music videos made with our own songs
// and cast (Moonlit Oolong Walk, which it opens first, then La Calabaza and Three Kittens), each with its song, stems, words, band, edit
// and finished film, and no others (the Toc Toc and Hotel Lobby videos, which played commercial recordings, were retired on 25 October);
// this test leans on those. It holds: the videos Jam ships (each opens as its edit, cut on its beats, its film a film of the
// Library, none worked on by being looked at); Pickle's panel and the five workspaces each in its own right (the song with its cover, the
// track, the words, the band, the edit) and every card opening in a window; the record played; beats heard, an effect and stickers put on,
// a lyric word retimed; undo, redo, save, reload; the film exported and its frames held against the preview's at the same times;
// Kitchen's Cut and a Mixer-built cut still open and render; a whip; a jam started from a dance trend (its dance, no sound of its own, a
// track to make in its feel); the edit kept right; Pickle's words answered; a song of your own added; and that nothing which costs credits is asked for
// until its own key is pressed and nothing blocks switching jams or workspaces.
// Not part of `node --test` (it needs a browser). Run it from the repo root:
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
const ok = (cond, msg, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${msg}${extra ? `  ${extra}` : ""}`);
  if (!cond) failures++;
};
/** A part of the test: one that stops (a wait that never ends, a missing key) is said so, and the parts after it still run. */
const section = async (name, run) => {
  try {
    await run();
  } catch (e) {
    ok(false, `${name}: it stopped`, String(e?.message ?? e).split("\n")[0].slice(0, 240));
  }
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
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"] });
try {
  const context = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
  // (the page talks to this server alone)
  await context.route((u) => new URL(u).hostname !== "127.0.0.1", (r) => r.abort());
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // the requests that cost credits (ACE-Step's tracks and songs, the words heard, a look drawn, a shot rolled): none may be made but by their own keys
  const paid = [];
  page.on("request", (r) => r.method() === "POST" && /\/api\/(audio\/music|audio\/song|jam\/listen|image|shots)$/.test(new URL(r.url()).pathname) && paid.push(new URL(r.url()).pathname));
  // the requests this server refused or could not answer: a feature that asks for a file it no longer has shows here
  const failed = [];
  page.on("response", (r) => r.status() >= 400 && failed.push(`${r.status()} ${new URL(r.url()).pathname}`));
  const body = () => page.evaluate(async () => JSON.parse(JSON.stringify((await import("/js/cut.js")).cut.project.body)));
  const until = async (fn, tries = 120, arg) => {
    for (let i = 0; i < tries; i++) {
      if (await page.evaluate(fn, arg)) return true;
      await page.waitForTimeout(500);
    }
    return false;
  };
  /** What the page says, waited for as `until` does, and the test stops when it never comes. (Playwright's waitForFunction does not wait for an async predicate: it answers at its first call, so what needs a module read is asked this way.) */
  const wait = async (what, fn, arg, tries = 40) => {
    if (!(await until(fn, tries, arg))) throw new Error(`waited for ${what}, and it never came`);
  };
  const seek = (t) => page.evaluate(async (t) => (await import("/js/panels/editor.js")).editor.seek(t), t);
  /** A workspace shown: its tile pressed, and its page drawn. */
  const workspace = async (ws) => {
    await page.locator(`.jm-tile[data-workspace="${ws}"]`).click();
    await page.waitForFunction((ws) => document.querySelector(".jam")?.dataset.workspace === ws && !!document.querySelector(".jm-grid")?.firstElementChild, ws);
  };
  const closeWindow = async () => {
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.body.classList.contains("has-jam-window"));
  };
  const hasEdit = () => until(() => import("/js/cut.js").then((m) => !!m.cut.project && m.cut.project.body.product === "jam").catch(() => false), 40);
  /** A video opened (as Jam's set list does) and its edit open in the editor. */
  const openJam = async (id) => {
    await page.evaluate((id) => import("/js/jam.js").then((m) => m.openJam(id)), id);
    return until((id) => Promise.all([import("/js/jam.js"), import("/js/cut.js")]).then(([j, c]) => j.jam.jam?.id === id && !!c.cut.project && c.cut.project.id === j.jam.jam.body.cut).catch(() => false), 120, id);
  };
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
  const OURS = ["jam-walk-moonlit-oolong", "jam-three-kittens", "jam-la-calabaza"];

  // ---- Jam opens on the first of the videos it ships, our Moonlit Oolong Walk, on its track (a video that has a song)
  await page.goto(`${base}/#/jam`);
  await page.waitForSelector(".jam .jm-tile", { timeout: 20000 });
  ok(await until(() => import("/js/jam.js").then((m) => m.jam.jam?.id === "jam-walk-moonlit-oolong" && m.jam.jam.name === "Moonlit Oolong Walk" && m.jam.workspace === "track").catch(() => false), 60), "Jam opens on Moonlit Oolong Walk, the first of our three videos, on its track");

  // ---- the videos Jam ships: each opens as its edit, cut on its beats, its film a film of the Library; looking at them is not working on them
  await section("the videos Jam ships", async () => {
    const shipped = await page.evaluate(() => import("/js/jam.js").then((m) => m.jam.list.map((j) => j.id).filter((id) => id.startsWith("jam-")).sort()));
    ok(shipped.join() === [...OURS].sort().join(), `Jam ships our three videos and no other (${shipped.join(", ")})`);
    ok((await page.evaluate(() => import("/js/jam.js").then((m) => m.jam.list.some((j) => /ramalama/i.test(j.id + j.name))))) === false, "Ramalama is not one of them");
    // (each is opened, and every workspace of it looked at: the song, the track, the words, the band, the edit)
    for (const id of shipped) {
      ok(await openJam(id), `${id} opens as its edit`);
      for (const ws of ["song", "track", "words", "band", "edit"]) await workspace(ws);
    }
    await workspace("track");
    const [jams, cuts] = await Promise.all([api("api/jams"), api("api/cuts")]);
    const worked = [...jams.jams, ...cuts.cuts].filter((x) => /^(cut-)?jam-/.test(x.id) && x.updatedAt !== x.createdAt).map((x) => x.id);
    ok(worked.length === 0, "the videos Jam ships, opened and looked at in every workspace, are not worked on: a newer version of one still replaces it", worked.join(", "));
    const reels = await api("api/reels");
    for (const id of OURS) {
      const { project } = await api(`api/jams/${id}`);
      const film = project.body.film;
      const reel = reels.find((r) => r.id === film?.id);
      ok(!!reel && reel.url === film.url && reel.cut === project.body.cut && (await fetch(`${base}${film.url}`, { method: "HEAD" })).ok, `${project.name}'s finished film is a film of the Library, which plays (${film?.id})`);
      // each cut of the video falls on a beat Jam's finder heard: the edit is cut on the beat
      const c = (await api(`api/cuts/${project.body.cut}`)).project.body;
      const beats = c.beats.times.map((t) => t + (c.beats.offset ?? 0));
      const ends = [];
      let at = 0;
      for (const it of c.tracks.find((t) => t.main).items.slice(0, -1)) ends.push((at += (it.to - it.from) / (it.speed || 1)));
      const worst = Math.max(...ends.map((e) => Math.min(...beats.map((b) => Math.abs(b - e)))));
      ok(ends.length >= 5 && worst < 0.03, `${project.name}: its ${ends.length + 1} shots are cut on the beat (the worst cut is ${(worst * 1000).toFixed(0)} ms from one)`);
    }
    // a video whose song has no drop or loudness stored has them measured when it is opened, and the video saved: that save is not working on it
    const src = (await api("api/jams/jam-la-calabaza")).project.body;
    const unmeasured = { ...src, track: { ...src.track } };
    delete unmeasured.track.drop;
    delete unmeasured.track.loud;
    const mine = await api("api/jams", "POST", { name: "Measured", body: unmeasured });
    const saved = page.waitForRequest((r) => r.method() === "PUT" && new URL(r.url()).pathname === `/api/jams/${mine.project.id}`, { timeout: 30000 }).then(() => true, () => false);
    await page.evaluate((id) => import("/js/jam.js").then((m) => m.openJam(id)), mine.project.id);
    ok(await saved, "opening a video whose song has no drop or loudness measures them and saves the video");
    await page.waitForTimeout(600);
    const measured = (await api(`api/jams/${mine.project.id}`)).project;
    ok(measured.body.track.loud !== undefined && measured.updatedAt === measured.createdAt, "and that save is not an edit: the video is as untouched as it was");
    await page.evaluate((id) => import("/js/jam.js").then((m) => m.removeJam(id)), mine.project.id);
  });

  // ---- the seeded showcase opens as an edit (not an empty one)
  // (the videos are several: this one is La Calabaza, the short one, whose words are call-outs)
  await workspace("track");
  ok(await openJam("jam-la-calabaza"), "the seeded Jam opens as an edit");
  const b0 = await body();
  ok(b0.product === "jam" && b0.aspect === "9:16" && b0.tracks.find((t) => t.main).items.length === 8, "the seeded Jam opens as its edit: 9:16, its eight clips, product kept");

  // ---- Pickle's panel: his portrait, the jam, the five workspaces with their state, the video's pipeline (no canned tools)
  ok(await page.locator(".jm-pet-face").getAttribute("src") === "brand/cast/pickle-face.webp" && (await page.locator(".jm-pet-text").innerText()).toLowerCase().includes("band leader"), "Pickle's portrait and tag are on the panel");
  ok((await page.locator(".jm-jam").innerText()).trim().length > 0, "the jam chip names the jam");
  const tiles = await page.locator(".jm-tile").evaluateAll((els) => els.map((e) => ({ ws: e.dataset.workspace, name: e.querySelector("b").textContent, status: e.querySelector("em").textContent, on: e.classList.contains("is-on") })));
  ok(tiles.map((t) => t.name).join() === "The song,The track,The words,The band,The edit" && tiles.map((t) => t.ws).join() === "song,track,words,band,edit", "five workspaces, in the order a video is made");
  // (a video that has a song opens on its track, not on the page that makes a song)
  ok(tiles.filter((t) => t.on).length === 1 && tiles[1].on && tiles.every((t) => t.status.length > 0), `the open one (the track) is lit, and each says its state (${tiles.map((t) => t.status).join(" | ")})`);
  const steps = await page.locator(".jm-pipe-list li").evaluateAll((els) => els.map((e) => [e.querySelector("span:not(.jm-lamp)").textContent, e.dataset.state]));
  // (a showcase comes finished: its song, its words and their look, its band, and its film)
  ok(steps.map((x) => x[0]).join() === "Song made,Words heard,Captions styled,Band cast,Edit cut" && steps.every((x) => x[1] === "done"), `the pipeline lists the five steps, every one done (${steps.map((x) => x.join(":")).join(" ")})`);
  ok((await page.locator(".jm-tool").count()) === 0, "there are no canned tools on the panel");
  // (the song, the track and the words are pages of cards, data-card; the band and the edit are the grid's bentos)
  const bentoNames = (ws) => ws === "track" || ws === "words"
    ? page.locator(".jam [data-card]").evaluateAll((els) => els.map((e) => e.dataset.card))
    : page.locator(".jm-grid .jm-bento").evaluateAll((els) => els.map((e) => [...e.classList].find((c) => /^jm-b-/.test(c)).slice(5)));
  for (const [ws, want] of Object.entries({ track: "hero,stems,beat,cut", words: "lyrics,preview,styles,controls", band: "stage,dance,look", edit: "monitor,selected,timeline,foot" })) {
    await workspace(ws);
    ok((await bentoNames(ws)).join() === want, `${ws}: its cards are ${want}`, (await bentoNames(ws)).join());
    ok((await page.locator(".jm-tile.is-on").getAttribute("data-workspace")) === ws, `${ws}: its tile is the lit one`);
    // the editor's monitor is drawn where it is shown, once: in the words' preview and in the edit
    ok((await page.locator(".jam .cut-screen").count()) === (ws === "words" || ws === "edit" ? 1 : 0), `${ws}: the monitor is ${ws === "words" || ws === "edit" ? "there" : "not on this screen"}`);
  }

  // ---- the song: the page that makes it (three steps beside a stage), and the cover the shipped song wears
  await section("the song", async () => {
    await openJam("jam-walk-moonlit-oolong");
    await workspace("song");
    await page.waitForSelector(".sg-stage .sg-deck-3d canvas");
    // (the covers of the songs are read once the page is drawn: the record, the stage's picture and the sleeve wear it when they have come)
    await page.waitForSelector(".sg-cthumb:not(.is-none)", { timeout: 20000 });
    await page.waitForSelector(".sg-sleeve.is-track.has-cover", { timeout: 20000 });
    const f = await page.evaluate(() => ({
      steps: [...document.querySelectorAll(".sg-step .sg-num")].map((x) => x.textContent).join(),
      name: document.querySelector(".sg-name")?.textContent,
      read: document.querySelector(".sg-readout")?.textContent,
      make: document.querySelector(".sg-make")?.textContent.trim(),
      use: document.querySelector(".sg-use")?.textContent.trim(),
      here: document.querySelector(".sg-use")?.dataset.here,
      thumb: document.querySelector(".sg-cthumb")?.getAttribute("src"),
      sleeve: document.querySelector(".sg-sleeve.is-track .sg-sleeve-cover")?.getAttribute("src"),
      first: document.querySelector(".sg-sleeve")?.classList.contains("is-track"),
      keys: [...document.querySelectorAll(".sg-ckey")].map((k) => k.dataset.cover).join(),
    }));
    ok(f.steps === "1,2,3" && /Make the song/.test(f.make) && f.first, `The song: its three steps beside the stage, the make key, and the song of the video first on the shelf (${f.make})`);
    ok(f.name === "Moonlit Oolong Walk" && /3 min/.test(f.read) && /On to the track/.test(f.use) && f.here === "1", `the stage shows the song of the video (${f.name}, ${f.read}), with its key on to the track`);
    const cover = (await api("api/audio")).find((a) => a.file === "jam-walk-moonlit-oolong-track.mp3")?.cover;
    ok(cover === "/media/photos/jam-walk-moonlit-oolong-artist.jpg" && f.thumb === cover && f.sleeve === cover, "its song wears Taro's picture as its cover: under the song's name on the stage, and on its sleeve (the record's label is the same picture)", `${f.thumb} ${f.sleeve}`);
    ok(f.keys === "picture,mine,video,none", "with the keys of a song that has one: a new cover, my picture, a video cover, and taking it off", f.keys);
    await shot("song");
    await page.locator(".sg-use").click();
    ok(await until(() => import("/js/jam.js").then((m) => m.jam.workspace === "track").catch(() => false), 20), "On to the track goes to the track");
  });

  // ---- the track: the whole song as a waveform with its sections, drop and beats, its stems, its beat and its cut
  await section("the track", async () => {
    await workspace("track");
    await page.waitForSelector(".jt-sec", { timeout: 20000 });
    await page.waitForSelector(".jt-c-stems .jt-lane-wave");
    const f = await page.evaluate(() => ({
      name: document.querySelector(".jt-song-name b")?.textContent,
      tempo: document.querySelector(".jt-song-name span")?.textContent,
      ready: !!document.querySelector(".jt-ready"),
      secs: [...document.querySelectorAll(".jt-sec b")].map((x) => x.textContent),
      drop: !!document.querySelector(".jt-flag") && !document.querySelector(".jt-flag").hidden,
      total: document.querySelector("[data-song-total]")?.dataset.songTotal,
      part: document.querySelector(".jt-part")?.style.width,
      lanes: [...document.querySelectorAll(".jt-c-stems .jt-lane")].map((l) => l.dataset.stem).join(),
      ghost: !!document.querySelector(".jt-c-stems .jt-lanes.is-ghost"),
      stemKey: document.querySelector(".jt-c-stems .jt-primary")?.textContent.trim().replace(/\s+/g, " "),
      bpm: document.querySelector(".jt-bpm b")?.textContent,
      facts: [...document.querySelectorAll(".jt-facts b")].map((b) => b.textContent).join(),
      on: document.querySelectorAll('.jt-dots i[data-on="true"]').length,
      first: document.querySelectorAll('.jt-dots i[data-first="true"]').length,
      lengths: [...document.querySelectorAll(".jt-segs.is-lengths .jt-seg")].map((s) => s.textContent).join(),
      range: document.querySelector(".jt-readout b")?.textContent,
      chorus: !document.querySelector(".jt-c-cut .jt-primary")?.disabled,
    }));
    ok(f.name === "Moonlit Oolong Walk" && f.tempo === "105 BPM" && f.ready, `The track: the song's name, its tempo and that it is ready (${f.name}, ${f.tempo})`);
    ok(f.secs.length >= 3 && f.drop && Number(f.total) > 179, `the song is one waveform with its sections named (${f.secs.join(", ")}) and its drop flagged`);
    ok(Number.parseFloat(f.part) > 12 && Number.parseFloat(f.part) < 16, `and the part the video uses lit on it (${f.part} of the song)`);
    ok(f.lanes === "vocals,drums,bass,other" && !f.ghost && /Split again/.test(f.stemKey), `the four stems are lanes of their own, with a key to split again (${f.lanes})`);
    ok(f.bpm === "105" && f.facts === "4/4,44" && f.on === 16 && f.first === 4, `the beat: 105 BPM in 4/4, 44 beats found, a grid of four bars (${f.facts})`);
    ok(f.lengths === "15 s,30 s,60 s,Full" && f.range === "25 SECONDS" && f.chorus, `the cut: the lengths to choose, the part's range (${f.range}), and the key to trim to the chorus`);
    // the track of a video made of a song with no stems: ghosts of the four lanes, and a key to split them
    await openJam("jam-la-calabaza");
    await workspace("track");
    await page.waitForSelector(".jt-c-stems .jt-lanes.is-ghost");
    const g = await page.evaluate(() => ({ key: document.querySelector(".jt-c-stems .jt-primary")?.textContent.trim().replace(/\s+/g, " "), chorus: !document.querySelector(".jt-c-cut .jt-primary")?.disabled, drop: document.querySelector(".jt-flag")?.hidden, note: document.querySelector(".jt-c-stems .jt-note")?.textContent }));
    ok(/Split the stems/.test(g.key) && g.chorus === false && g.drop === true, `a song with no stems, drop or loud stretch shows ghost lanes and a key to split them, and offers no chorus (${g.note})`);
  });

  // ---- the words: the lyrics as a timed list, the video in a phone, the gallery of caption styles, the controls and the two keys
  await section("the words", async () => {
    await openJam("jam-walk-moonlit-oolong");
    await workspace("words");
    await page.waitForSelector(".jw-preview .cut-screen");
    const f = await page.evaluate(() => ({
      rows: [...document.querySelectorAll(".jw-row .jw-text")].map((i) => i.value),
      dots: [...document.querySelectorAll(".jw-row")].map((r) => r.querySelectorAll(".jw-dot").length),
      times: [...document.querySelectorAll(".jw-at")].map((b) => b.textContent),
      styles: [...document.querySelectorAll(".jw-style")].map((b) => b.dataset.style).join(),
      on: [...document.querySelectorAll('.jw-style[aria-checked="true"]')].map((b) => b.dataset.style).join(),
      plain: [...document.querySelectorAll(".jw-plain .jt-fchip")].map((b) => b.textContent).join(),
      size: document.querySelector(".jw-size input")?.value,
      places: document.querySelectorAll(".jw-ctl .jt-segs.is-icons .jt-seg").length,
      anim: document.querySelector(".jw-anim")?.value,
      chips: document.querySelectorAll(".jw-colours .jw-chip").length,
      ratio: document.querySelector(".jw-preview .jm-ratio")?.textContent,
      progress: !!document.querySelector(".jw-preview .jm-progress"),
      hear: document.querySelector(".jw-hear")?.textContent.trim().replace(/\s+/g, " "),
      styleIt: document.querySelector(".jw-style-it")?.disabled,
    }));
    ok(f.rows.length === 6 && f.rows[0] === "Cool and golden on my lip" && f.times[0] === "00:00" && f.dots.join() === "6,6,4,5,5,5", `The words: six lines, each with when it is sung and a dot for each of its words (${f.dots.join("+")})`);
    ok(f.styles === "karaoke,stack,type,neon,outline,hand,minimal,comic" && f.on === "karaoke" && f.plain === "Pop-in,Bounce,Lower third,Off", `a gallery of eight caption styles with the video's lit, and four plainer ones (${f.on})`);
    ok(f.size === "0.09" && f.places === 3 && f.anim === "fill" && f.chips === 10, "the controls: the size, where the words sit, how a word arrives, and the colours of the word sung and of the words");
    ok(f.ratio === "9:16" && f.progress, "the video plays in a phone beside them, with its progress");
    ok(/Hear them again/.test(f.hear) && f.styleIt === false, `the two keys at the foot: hear the words (heard already: "${f.hear}") and style the captions`);
    // a line's words one by one, and a dot on a line that can be dragged
    await page.locator(".jw-row .jw-more").first().click();
    await page.waitForSelector(".jm-line-row.is-open .jm-word");
    ok((await page.locator(".jm-line-row.is-open .jm-word").count()) === 6 && (await page.locator('.jm-line-row.is-open input[aria-label="Word 2 starts"]').inputValue()) === "0.69", "a line opened shows its words one by one, each with its start and its length (in the film's time)");
    await page.locator(".jw-row .jw-more").first().click();
    // the page looks at a line that is sung when the film plays
    await page.locator(".jw-at").nth(1).click();
    ok(await page.waitForFunction(() => document.querySelector(".jam")?.classList.contains("is-playing") || !!document.querySelector(".jw-row.is-now"), null, { timeout: 8000 }).then(() => true, () => false), "a press on a line's time plays the film from it");
    await page.evaluate(() => import("/js/panels/editor.js").then((m) => m.editor.stop()));
    // Moonlit has no band: the band's page asks for one
    await workspace("band");
    ok(/2 places left/.test(await page.locator(".jm-b-stage .jm-cast-add").innerText()), "Taro stands alone on the band's stage, with room for two performers beside him");
  });

  // ---- the band: the stage with the lead and what the video is cast with, the dance to copy, the look, the key that casts
  await section("the band", async () => {
    await openJam("jam-la-calabaza");
    await workspace("band");
    const f = await page.evaluate(() => ({
      cast: [...document.querySelectorAll(".jm-b-stage .jm-cast")].map((c) => [c.dataset.slot, c.querySelector(".jm-cast-who b")?.textContent, c.querySelector(".jm-role")?.textContent].join(":")).join(" "),
      add: !!document.querySelector(".jm-b-stage .jm-cast-add"),
      shots: document.querySelector(".jm-b-stage .jm-chipkey")?.textContent.trim(),
      lipsync: document.querySelector(".jm-b-stage .jm-switch")?.getAttribute("aria-checked"),
      figures: document.querySelectorAll(".jm-b-stage .jm-fig").length,
      dance: document.querySelector(".jm-b-dance .jm-phone.is-add")?.textContent.replace(/\s+/g, " ").trim(),
      looks: [...document.querySelectorAll(".jm-b-look .jm-look-name")].map((x) => x.textContent).join(),
      vibe: document.querySelector(".jm-b-look .jm-b-tools .jm-fine")?.textContent,
      key: document.querySelector(".jm-cast-key")?.textContent.trim().replace(/\s+/g, " "),
      keyOff: document.querySelector(".jm-cast-key")?.disabled,
    }));
    ok(f.cast === "lead:Pickle:Lead 0:Praline:Dancer 1:Sesame:Drummer" && !f.add && f.figures === 3 && f.lipsync === "true", `The band: Pickle leads, with Praline and Sesame beside him (${f.cast}), and the stage is full`);
    ok(f.shots === "8 shots", `the stage keeps the shots the video is planned in (${f.shots})`);
    ok(/Add a dance/.test(f.dance) && f.looks === "Soft daylight,Studio,Concert" && /a night parade/.test(f.vibe), `the dance to copy waits for a video of moves, the look is chosen from three, and says its vibe in words (${f.vibe})`);
    ok(f.key === "Cast the band" && f.keyOff === false, `the key that casts the band has nothing to ask for: every shot is made (${f.key})`);
  });

  // ---- the edit: the monitor, the shot that is picked, the timeline, the frame and the keys that finish the video
  await section("the edit", async () => {
    await workspace("edit");
    await page.waitForSelector(".jm-b-timeline .cut-lane.is-main .cut-item");
    const f = await page.evaluate(() => ({
      frame: document.querySelector(".jm-b-monitor .jm-frame-tag")?.textContent.replace(/\s+/g, " ").trim(),
      facts: [...document.querySelectorAll(".jm-ed-facts .jm-fact")].map((d) => d.textContent.trim().replace(/\s+/g, " ")).join(" | "),
      clips: document.querySelectorAll(".jm-b-timeline .cut-lane.is-main .cut-item").length,
      lines: document.querySelectorAll(".jm-b-timeline .cut-item.is-lyric").length,
      quiet: document.querySelector(".jm-b-selected .jm-pick-empty b")?.textContent,
      aspect: [...document.querySelectorAll(".jm-b-foot .jm-seg")].map((b) => `${b.textContent}=${b.getAttribute("aria-pressed")}`).join(),
      exportKey: !!document.querySelector('.jm-b-foot [data-go="export"]'),
      makeKey: !!document.querySelector('.jm-b-foot [data-go="make"]'),
      keys: [...document.querySelectorAll(".jm-b-timeline .jm-chipkey")].map((k) => k.textContent.trim() || k.getAttribute("aria-label")).join(),
    }));
    ok(/^9:16VERTICAL$/.test(f.frame) && f.facts === "Length0:13 | Shots8/8made | Tempo133bpm", `The edit: the monitor says the frame and the film's length, shots and tempo (${f.frame}; ${f.facts})`);
    ok(f.clips === 8 && f.lines === 7, `the timeline holds its eight clips and the seven lines of its words (${f.clips}, ${f.lines})`);
    ok(f.quiet === "Pick a shot on the timeline", "with nothing picked, the shot's bento asks for a shot");
    ok(f.aspect === "9:16=true,16:9=false,1:1=false" && f.exportKey && !f.makeKey, "the foot: the frame to cut for, and Export (nothing is left to roll, so no Make key)");
    ok(/Smart/.test(f.keys), `the timeline's keys: the smart ones, the beat effects and the stickers (${f.keys})`);
    // a shot picked on the timeline: its source, its length, its move
    await page.locator(".jm-b-timeline .cut-lane.is-main .cut-item").nth(2).click();
    await page.waitForSelector(".jm-b-selected .jm-shotno");
    const s = await page.evaluate(() => ({ no: document.querySelector(".jm-shotno")?.textContent, title: document.querySelector(".jm-b-selected .jm-b-label")?.textContent, source: [...document.querySelectorAll(".jm-b-selected .jm-segs .jm-seg")].map((b) => `${b.textContent}=${b.getAttribute("aria-pressed")}`).join(), dur: document.querySelector(".jm-b-selected .jm-big")?.textContent, move: document.querySelector('.jm-b-selected .jm-chip[aria-pressed="true"]')?.textContent, state: document.querySelector(".jm-shotstate")?.textContent.trim() }));
    ok(s.title === "SELECTED SHOT" && s.no === "SHOT 03" && s.source === "Performance=false,Dance=false,B-roll=true" && s.dur === "1.8 s" && s.move === "None" && s.state === "made", `a shot picked shows its number, its source, its length and its move (${s.no}, ${s.dur}, ${s.state})`);
    await page.evaluate(() => import("/js/cut.js").then((m) => m.select(null)));
  });

  // ---- every card opens in a window of its own, centred over the page, closed by Escape or a press outside it
  await section("the windows", async () => {
    await openJam("jam-la-calabaza");
    const WINDOWS = {
      track: [[".jt-hero .jt-expand", "THE SONG"], [".jt-c-stems .jt-expand", "STEMS"], [".jt-c-beat .jt-expand", "THE BEAT"], [".jt-c-cut .jt-expand", "THE CUT"]],
      words: [['button[aria-label="LYRICS & TIMING in a window"]', "LYRICS"], ['button[aria-label="The preview in a window"]', "PREVIEW"], ['button[aria-label="CAPTION STYLES in a window"]', "CAPTION STYLES"], ['button[aria-label="STYLE CONTROLS in a window"]', "CAPTION STYLES"]],
      band: [[".jm-b-stage .jm-expand", "THE CAST"], [".jm-b-stage .jm-chipkey", "THE SHOTS"], [".jm-b-dance .jm-expand", "THE DANCE"], [".jm-b-look .jm-expand", "THE LOOK"]],
      edit: [[".jm-b-monitor .jm-expand", "THE EDITOR'S DETAILS"], [".jm-b-selected .jm-expand", "THE EDITOR'S DETAILS"], ['.jm-b-foot [aria-label="The video in a window"]', "MAKE"], ['.jm-b-timeline .jm-chipkey[data-tooltip^="Beat effects"]', "EFFECTS"], ['.jm-b-timeline .jm-chipkey[data-tooltip^="Stickers"]', "STICKERS"]],
    };
    // what each window holds that tells it from the others
    const HOLDS = {
      "THE SONG": ".jt-wavebox", STEMS: ".jt-lanes", "THE BEAT": ".jt-bpm", "THE CUT": ".jt-range", LYRICS: "textarea.jm-lyrics-edit", PREVIEW: ".cut-screen",
      "CAPTION STYLES": ".jw-style", "THE CAST": ".jm-crew", "THE SHOTS": ".jm-shot-row", "THE DANCE": ".jm-moves", "THE LOOK": "textarea.jm-style-field",
      "THE EDITOR'S DETAILS": ".cut-inspector", MAKE: ".jm-makebig", EFFECTS: ".jm-fxkey", STICKERS: ".jm-sticker",
    };
    for (const [ws, list] of Object.entries(WINDOWS)) {
      await workspace(ws);
      const wrong = [];
      for (const [key, title] of list) {
        await page.locator(key).first().click();
        await page.waitForSelector(".jm-layer:not([hidden]) .jm-win");
        await page.waitForFunction((t) => document.querySelector(".jm-win-title")?.textContent === t, title);
        const box = await page.locator(".jm-win").boundingBox();
        const view = page.viewportSize();
        const centred = Math.abs(box.x + box.width / 2 - view.width / 2) < 4 && box.y > 0 && box.y + box.height < view.height + 1;
        const only = (await page.evaluate(() => document.body.classList.contains("has-jam-window") && !document.body.classList.contains("has-window")));
        const holds = (await page.locator(`.jm-win ${HOLDS[title]}`).count()) > 0;
        // a window that takes the monitor (the preview, the editor's details) leaves the card's frame empty meanwhile: it is drawn where it is shown, once
        const screens = await page.locator(".jam .cut-screen, .jm-win .cut-screen").count();
        const once = !["PREVIEW"].includes(title) || (screens === 1 && (await page.locator(".jm-win .cut-screen").count()) === 1);
        await closeWindow();
        if (!(centred && only && holds && once && (await page.locator(".jm-layer").isHidden()))) wrong.push(`${title}: ${JSON.stringify({ centred, only, holds, once })}`);
      }
      ok(wrong.length === 0, `${ws}: ${list.map(([, t]) => t.toLowerCase()).join(", ")} each open centred in a window with what is theirs, and close on Escape`, wrong.join(" | "));
    }
    // the styles' window: the eight styles and the controls, and a style picked in it is picked on the page too
    await workspace("words");
    await page.locator('button[aria-label="CAPTION STYLES in a window"]').click();
    await page.waitForSelector(".jm-win .jw-style");
    ok((await page.locator(".jm-win .jw-style").count()) === 8 && (await page.locator(".jm-win .jw-ctl").count()) === 1, "the styles' window shows the eight styles and the controls beside them");
    await closeWindow();
    await workspace("track");
    await page.locator(".jt-hero .jt-expand").click();
    await page.waitForSelector(".jm-layer:not([hidden]) .jm-win");
    await page.mouse.click(8, 400);
    await page.waitForFunction(() => !document.body.classList.contains("has-jam-window"), null, { timeout: 3000 }).catch(() => {});
    ok(await page.locator(".jm-layer").isHidden(), "a press outside the window closes it");
  });

  // ---- the record plays the song, and turns while it sounds; it stops when another workspace is shown
  await section("the record", async () => {
    await workspace("track");
    const playing = (on) => page.waitForFunction((on) => !!document.querySelector(".jam")?.classList.contains("is-playing") === on, on, { timeout: 8000 }).then(() => true, () => false);
    await page.locator(".jt-disc").click();
    ok(await playing(true) && (await page.locator(".jt-bigplay").getAttribute("data-playing")) === "true", "a press on the record plays the song, and the record turns (the big key says it plays)");
    await page.locator(".jt-disc").click();
    ok(await playing(false) && (await page.locator(".jt-bigplay").getAttribute("data-playing")) === "false", "and a second press stops it");
    await page.locator(".jt-bigplay").click();
    ok(await playing(true), "the big key plays it as well");
    await workspace("words");
    ok(await playing(false), "another workspace shown puts the record away");
  });

  // ---- one video worked on: beats heard here, an effect, stickers, a lyric word retimed; undo, redo, save, reload; exported and held against the preview
  const edited = {};
  await section("the edit worked on", async () => {
    await workspace("edit");
    // beats: heard in the browser (the editor's own details, in a window: the shot's bento offers the beat tools when nothing is picked)
    await page.locator('.jm-b-selected button:has-text("Beat tools")').click();
    await page.waitForSelector(".jm-win .cut-inspector");
    // (the showcase's beats were heard by the same finder: they are taken away first, so these are heard again here)
    await page.evaluate(async () => {
      const c = await import("/js/cut.js");
      delete c.cut.project.body.beats;
      c.commit();
    });
    await page.locator('.jm-win .cut-inspector button:has-text("Detect")').click();
    ok(await until(() => import("/js/cut.js").then((m) => m.cut.project.body.beats.source === "web").catch(() => false)), "the beats are heard");
    const b1 = await body();
    ok(Math.abs(b1.beats.bpm - 133.1) < 0.6, `the tempo is 133 (heard ${b1.beats.bpm})`);
    await closeWindow();

    // an effect, two stickers (one moved), a lyric word retimed
    // (the effects and the stickers are windows of the edit: a key of the timeline opens each)
    await page.locator('.jm-b-timeline .jm-chipkey[data-tooltip^="Beat effects"]').click();
    const fx0 = (await body()).tracks.find((t) => t.kind === "fx").items.length;
    await page.locator('.jm-win .jm-fxkey[data-fx="shake"]').click();
    await wait("the shake to be added", (n) => import("/js/cut.js").then((m) => m.cut.project.body.tracks.find((t) => t.kind === "fx").items.length === n), fx0 + 1);
    ok((await body()).tracks.find((t) => t.kind === "fx").items.some((i) => i.kind === "shake"), "a shake is on the Beat FX track");
    await page.waitForFunction(() => document.querySelector('.jm-win .jm-fxkey[data-fx="shake"]')?.getAttribute("aria-pressed") === "true");
    ok((await page.locator('.jm-win .jm-fxkey[data-fx="shake"]').getAttribute("aria-pressed")) === "true" && (await page.locator(".jm-win .jm-fxrow.is-picked").count()) === 1, "the new effect is the one picked");
    await closeWindow();
    ok((await page.locator(".jm-selected .jm-dial-label").innerText()).includes("Shake"), "and its strength is the dial of the selected effect");
    const before = new Set((await body()).tracks.find((t) => t.id === "v2").items.map((i) => i.id));
    await page.locator('.jm-b-timeline .jm-chipkey[data-tooltip^="Stickers"]').click();
    await page.locator('.jm-win .jm-sticker[data-tooltip^="Star"]').click();
    await wait("the star to be added", (n) => import("/js/cut.js").then((m) => m.cut.project.body.tracks.find((t) => t.id === "v2").items.length === n), before.size + 1);
    await closeWindow();
    const star = (await body()).tracks.find((t) => t.id === "v2").items.find((i) => i.src?.id === "star" && !before.has(i.id));
    await seek(star.start + 0.5);
    await settle();
    await page.evaluate(() => window.scrollTo(0, 0));
    const g = await page.locator(".cut-gizmo .gz-box").boundingBox();
    const sc = await page.locator(".cut-screen").boundingBox();
    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
    await page.mouse.down();
    await page.mouse.move(sc.x + sc.width * 0.7, sc.y + sc.height * 0.6, { steps: 8 });
    await page.mouse.up();
    await wait("the sticker to be moved", async (id) => Math.abs((await import("/js/cut.js")).cut.project.body.tracks.find((t) => t.id === "v2").items.find((i) => i.id === id).x - 0.7) < 0.05, star.id);
    const moved = (await body()).tracks.find((t) => t.id === "v2").items.find((i) => i.id === star.id);
    ok(Math.abs(moved.x - 0.7) < 0.03 && Math.abs(moved.y - 0.6) < 0.03, `the sticker was dragged to 70%, 60% (${moved.x}, ${moved.y})`);
    await page.locator(".cut-item.is-lyric").first().dblclick();
    await page.waitForSelector('.jm-win .cut-word-row input[aria-label="Word 2 starts"]');
    const line = (await body()).tracks.find((t) => t.kind === "title").items.find((i) => i.lyric);
    await page.locator('.jm-win .cut-word-row input[aria-label="Word 2 starts"]').fill("0.85");
    await page.locator('.jm-win .cut-word-row input[aria-label="Word 2 starts"]').press("Tab");
    await wait("word 2 to be retimed", async (id) => Math.abs((await import("/js/cut.js")).cut.project.body.tracks.find((t) => t.kind === "title").items.find((i) => i.id === id).words[1].from - 0.85) < 1e-6, line.id);
    const retimed = (await body()).tracks.find((t) => t.kind === "title").items.find((i) => i.id === line.id);
    ok(Math.abs(retimed.words[1].from - 0.85) < 1e-6, "word 2 of the first line starts at 0.85 (a double click on the line opens its details)");
    await closeWindow();
    // the same words, one by one on The words: the time shown is the film's
    await workspace("words");
    await page.locator(".jw-row .jw-more").first().click();
    await page.waitForSelector(".jm-line-row.is-open .jm-word");
    const wordStart = await page.locator('.jm-line-row.is-open input[aria-label="Word 2 starts"]').inputValue();
    ok(Math.abs(Number(wordStart) - (Number(retimed.start) + 0.85)) < 0.011, `The words shows word 2 at ${wordStart} s of the film (the line starts at ${retimed.start})`);
    await page.locator('.jm-line-row.is-open input[aria-label="Word 2 starts"]').fill(String(Number(retimed.start) + 0.9));
    await page.locator('.jm-line-row.is-open input[aria-label="Word 2 starts"]').press("Tab");
    await wait("the word retimed on The words to move in the edit", async (id) => Math.abs((await import("/js/cut.js")).cut.project.body.tracks.find((t) => t.kind === "title").items.find((i) => i.id === id).words[1].from - 0.9) < 0.011, line.id);
    const retimed2 = (await body()).tracks.find((t) => t.kind === "title").items.find((i) => i.id === line.id);
    ok(Math.abs(retimed2.words[1].from - 0.9) < 0.011, `a word retimed on The words moves in the edit (${retimed2.words[1].from})`);
    // a caption style of the gallery is picked on The words, and a plainer one beside it
    const captions = () => page.evaluate(async () => (await import("/js/jam.js")).jam.jam.body.captions);
    await page.locator('.jw-style[data-style="neon"]').click();
    await page.waitForFunction(() => document.querySelector('.jw-style[data-style="neon"]')?.getAttribute("aria-checked") === "true");
    ok((await captions()) === "neon" && (await page.locator('.jw-style[aria-checked="true"]').count()) === 1, "a caption style of the gallery is picked on The words");
    await page.locator(".jw-plain .jt-fchip", { hasText: "Bounce" }).click();
    await page.waitForFunction(() => document.querySelector(".jw-plain .jt-fchip[aria-pressed=true]")?.textContent === "Bounce");
    ok((await captions()) === "bounce" && (await page.locator('.jw-style[aria-checked="true"]').count()) === 0, "and a plainer one, which takes the gallery's mark off");
    await page.locator(".jw-style-it").click();
    ok(await until(() => import("/js/jam.js").then((m) => m.jam.workspace === "band" && m.jam.jam.body.captionsSet === true).catch(() => false), 20), "Style the captions says they are done and goes on to the band");
    await workspace("edit");
    Object.assign(edited, { star, moved, line, retimed2 });

    // undo and redo, then saved and reloaded
    const after = JSON.stringify(await body());
    await page.locator(".cut-screen").click({ position: { x: 3, y: 3 } });
    await page.keyboard.press("Control+z");
    ok(await until(async (was) => JSON.stringify((await import("/js/cut.js")).cut.project.body) !== was, 16, after), "undo changes the edit");
    await page.keyboard.press("Control+Shift+z");
    ok(await until(async (was) => JSON.stringify((await import("/js/cut.js")).cut.project.body) === was, 16, after), "redo puts it back");
    const id = await page.evaluate(async () => (await import("/js/cut.js")).cut.project.id);
    ok(await until(async ({ id, after }) => JSON.stringify((await (await fetch(`api/cuts/${id}`)).json()).project.body) === after, 20, { id, after }), "the server has it, as it is");
    await page.reload();
    await page.waitForSelector(".jam .jm-tile", { timeout: 20000 });
    ok(await hasEdit(), "the edit opens again after a reload");
    ok(await until(async (after) => JSON.stringify((await import("/js/cut.js")).cut.project.body) === after, 20, after), "after a reload it is all still there");
    ok((await page.locator(".jm-tile.is-on").getAttribute("data-workspace")) === "edit", "and Jam comes back to the workspace that was open");
  });

  // ---- exported, and held against the preview
  await section("the film exported", async () => {
    const was = await page.evaluate(async () => (await import("/js/jam.js")).jam.jam.body.film?.id ?? null);
    await page.locator('.jm-foot [data-go="export"]').click();
    ok(await until((was) => import("/js/jam.js").then((m) => (m.jam.jam.body.film?.id ?? null) !== was && !m.jam.busy.has("render")).catch(() => false), 360, was), "the film is exported (Export the video, on The edit)");
    const film = await page.evaluate(async () => (await import("/js/jam.js")).jam.jam.body.film);
    ok((await api("api/reels")).some((r) => r.id === film.id), "and it is a film of the Library, with the ones that came with Jam");
    await writeFile(join(out, "film.mp4"), Buffer.from(await (await fetch(`${base}${film.url}`)).arrayBuffer()));
    const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,width,height,start_time,duration", "-of", "json", join(out, "film.mp4")]).toString());
    const v = probe.streams.find((x) => x.codec_type === "video");
    const a = probe.streams.find((x) => x.codec_type === "audio");
    ok(v.width / v.height < 0.6 && v.width / v.height > 0.5, `the film is 9:16 (${v.width}x${v.height})`);
    const length = await page.evaluate(async () => (await import("/js/cut.js")).filmLength());
    ok(Math.abs(v.duration - length) < 0.1 && Math.abs(a.duration - length) < 0.1 && Math.abs(v.start_time) < 0.05 && Math.abs(a.start_time) < 0.05, `picture and sound both run the edit's ${length.toFixed(2)} s from 0 (${v.duration}, ${a.duration}; starts ${v.start_time}, ${a.start_time})`);
    // the frames where something shows: a zoom hit, the sticker that was moved, a lit word of the line that was retimed; each at the same time in the film and in the preview
    const zoom = await page.evaluate(async (length) => {
      const { fxAt } = await import("/js/fx.js");
      const c = await import("/js/cut.js");
      const b = c.cut.project.body;
      let top = { t: 0, s: -1 };
      for (let n = 0; n < length * 24; n++) {
        const f = fxAt(n / 24, b);
        if (f.zoom > top.s) top = { t: n / 24, s: f.zoom };
      }
      return top.t;
    }, length);
    const picks = { zoom, sticker: edited.star.start + 0.6, word: Number(edited.line.start) + 0.95 };
    for (const [name, t] of Object.entries(picks)) {
      const f = Math.round(t * 24) / 24;
      execFileSync("ffmpeg", ["-v", "error", "-y", "-i", join(out, "film.mp4"), "-vf", `select=eq(n\\,${Math.round(f * 24)}),scale=45:80`, "-vsync", "0", "-frames:v", "1", "-pix_fmt", "gray", "-f", "rawvideo", join(out, `film-${name}.gray`)]);
      execFileSync("ffmpeg", ["-v", "error", "-y", "-i", join(out, "film.mp4"), "-vf", `select=eq(n\\,${Math.round(f * 24)})`, "-vsync", "0", "-frames:v", "1", join(out, `film-${name}.png`)]);
      await seek(f);
      await settle();
      await page.locator(".cut-screen").screenshot({ path: join(out, `preview-${name}.png`) });
      execFileSync("ffmpeg", ["-v", "error", "-y", "-i", join(out, `preview-${name}.png`), "-vf", "scale=45:80", "-pix_fmt", "gray", "-f", "rawvideo", join(out, `preview-${name}.gray`)]);
      const A = await readFile(join(out, `film-${name}.gray`));
      const B = await readFile(join(out, `preview-${name}.gray`));
      // the middle, away from the preview's rounded corners
      const mid = (buf) => {
        const px = [];
        for (let y = 4; y < 76; y++) for (let x = 3; x < 42; x++) px.push(buf[y * 45 + x]);
        return px;
      };
      const [x, y] = [mid(A), mid(B)];
      const mean = (l) => l.reduce((s, q) => s + q, 0) / l.length;
      const [mx, my] = [mean(x), mean(y)];
      const cov = x.reduce((s, q, i) => s + (q - mx) * (y[i] - my), 0);
      const corr = cov / Math.sqrt(x.reduce((s, q) => s + (q - mx) ** 2, 0) * y.reduce((s, q) => s + (q - my) ** 2, 0));
      ok(corr > 0.85, `at ${f.toFixed(2)} s (${name}) the film and the preview agree (correlation ${corr.toFixed(3)})`);
    }
  });

  // ---- Kitchen's own cut and a Mixer-built one still open, and render
  await section("Kitchen's Cut and a Mixer cut", async () => {
    const kitchen = await api("api/cuts", "POST", { name: "Kitchen test", body: { aspect: "16:9", duck: true, tracks: [
      { id: "t1", kind: "title", name: "Titles", items: [] }, { id: "v2", kind: "video", name: "Overlays", items: [] },
      { id: "v1", kind: "video", name: "Video", main: true, items: [{ id: "k1", src: { kind: "video", id: "jam-walk-moonlit-oolong-promenade.mp4", duration: 5.17 }, from: 0, to: 3, speed: 1, volume: 1, sound: true }, { id: "k2", src: { kind: "video", id: "jam-walk-moonlit-oolong-dance.mp4", duration: 5.17 }, from: 0, to: 3, speed: 1, volume: 1, sound: true, join: "dissolve" }] },
      { id: "a1", kind: "audio", role: "voice", name: "Voice", items: [] }, { id: "a2", kind: "audio", role: "music", name: "Music", items: [] }, { id: "a3", kind: "audio", role: "effects", name: "Effects", items: [] }], markers: [] } });
    const mixer = await api("api/cuts", "POST", { name: "Mixer test", body: { aspect: "9:16", tracks: [
      { id: "video", kind: "video", main: true, items: [{ id: "m1", src: { kind: "video", id: "jam-walk-moonlit-oolong-vending.mp4" }, from: 0, to: 3, speed: 1, sound: false, join: "cut" }, { id: "m2", src: { kind: "video", id: "jam-walk-moonlit-oolong-take.mp4" }, from: 0, to: 3, speed: 1, sound: false, join: "cut" }] },
      { id: "music", kind: "audio", role: "music", items: [{ id: "edit-sound", src: { kind: "audio", id: "jam-walk-moonlit-oolong-part.mp3" }, start: 0, from: 0, to: 6 }] },
      { id: "caption", kind: "title", items: [{ id: "c1", text: "MOONLIT", start: 0, length: 6, style: "top" }] }], product: "mixer" } });
    await page.evaluate(() => (location.hash = "#/cut"));
    await page.waitForSelector(".cut-page .cut-screen", { timeout: 20000 });
    for (const [name, cutId, clips] of [["Kitchen test", kitchen.project.id, 2], ["Mixer test", mixer.project.id, 2]]) {
      await page.locator(`.tab:has-text("${name}")`).first().click();
      await wait(`${name} to be open`, async (id) => (await import("/js/cut.js")).cut.project?.id === id, cutId);
      await page.waitForSelector(".cut-lane.is-main .cut-item");
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
  });

  // ---- the videos of our own, each opened as its edit with what was put on it, and exported at the picture's size and length
  await section("the videos of our own exported", async () => {
    await page.evaluate(() => (location.hash = "#/jam"));
    await page.waitForSelector(".jam .jm-tile", { timeout: 20000 });
    for (const [id, name, want] of [["jam-walk-moonlit-oolong", "Moonlit Oolong Walk", { clips: 7, fx: 3, stickers: 3, lines: 6, seconds: 25.058, bpm: 105 }], ["jam-three-kittens", "Three Kittens", { clips: 8, fx: 5, stickers: 4, lines: 7, seconds: 7.552, bpm: 128 }]]) {
      ok(await openJam(id), `${name} opens as its edit`);
      await workspace("edit");
      const c = await body();
      const main = c.tracks.find((t) => t.main).items;
      const got = { clips: main.length, fx: c.tracks.find((t) => t.kind === "fx").items.length, stickers: c.tracks.find((t) => t.id === "v2").items.length, lines: c.tracks.find((t) => t.kind === "title").items.filter((i) => i.lyric).length };
      ok(JSON.stringify(got) === JSON.stringify({ clips: want.clips, fx: want.fx, stickers: want.stickers, lines: want.lines }), `${name} opens as its edit: ${JSON.stringify(got)}`);
      ok(c.beats?.times.length > 8 && c.beats.source === "web" && Math.abs(c.beats.bpm - want.bpm) < 1 && c.tracks.find((t) => t.role === "music").items.length === 1, `${name} has its beats (${c.beats?.bpm} BPM, ${c.beats?.times.length}) and its sound`);
      // each clip is one of the folder's, and plays
      const clips = await Promise.all(main.map((it) => fetch(`${base}/media/videos/${it.src.id}`, { method: "HEAD" }).then((r) => r.ok)));
      ok(clips.every(Boolean), `${name}: every clip of its edit is in the library and plays`);
      const was = await page.evaluate(async () => (await import("/js/jam.js")).jam.jam.body.film?.id ?? null);
      await page.locator('.jm-foot [data-go="export"]').click();
      ok(await until((was) => import("/js/jam.js").then((m) => (m.jam.jam.body.film?.id ?? null) !== was && !m.jam.busy.has("render")).catch(() => false), 240, was), `${name} is exported`);
      const f = await page.evaluate(async () => (await import("/js/jam.js")).jam.jam.body.film);
      await writeFile(join(out, `${id}.mp4`), Buffer.from(await (await fetch(`${base}${f.url}`)).arrayBuffer()));
      const pr = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,width,height,nb_frames", "-of", "json", join(out, `${id}.mp4`)]).toString());
      const vid = pr.streams.find((x) => x.codec_type === "video");
      ok(vid.width === 720 && vid.height === 1280 && Math.abs(Number(vid.nb_frames) - Math.round(want.seconds * 24)) <= 1, `${name}'s film is 720x1280, ${vid.nb_frames} frames (${Math.round(want.seconds * 24)} wanted)`);
    }
  });

  // ---- a whip into a clip: the film has the same length as a cut would, and the preview shows the same sweep over its last five frames
  await section("a whip", async () => {
    const whipped = await api("api/cuts", "POST", { name: "Whip test", body: { aspect: "9:16", fit: "cover", tracks: [
      { id: "video", kind: "video", main: true, items: [{ id: "w1", src: { kind: "video", id: "jam-walk-moonlit-oolong-vending.mp4" }, from: 0, to: 3, speed: 1, sound: false, join: "cut" }, { id: "w2", src: { kind: "video", id: "jam-walk-moonlit-oolong-take.mp4" }, from: 0, to: 3, speed: 1, sound: false, join: "whip" }] }] } });
    const whipFilm = await api(`api/cuts/${whipped.project.id}/render`, "POST", {});
    await writeFile(join(out, "whip.mp4"), Buffer.from(await (await fetch(`${base}${whipFilm.url}`)).arrayBuffer()));
    const frames = Number(execFileSync("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", join(out, "whip.mp4")]).toString().trim());
    ok(frames === 144, `the whipped film runs 144 frames, as a cut would (${frames})`);
    // (the preview of an edit that is not Jam's is drawn on Kitchen's Cut page)
    await page.evaluate(() => (location.hash = "#/cut"));
    await page.waitForSelector(".cut-page .cut-screen", { timeout: 20000 });
    await page.evaluate((id) => import("/js/cut.js").then((m) => m.openCut(id)), whipped.project.id);
    await wait("the whipped edit to be open", async (id) => (await import("/js/cut.js")).cut.project?.id === id, whipped.project.id);
    await page.waitForSelector(".cut-lane.is-main .cut-item");
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
  });

  // ---- a jam started from the shelf of dance trends: the lead as the artist and our version of its dance (silent: an original's recording is not
  // shipped), no track yet, with "Make a track" ready in the trend's feel (whichever trend of ours has a dance to copy: none is named here)
  const { shelf, trend } = await page.evaluate(async () => {
    const { DANCES } = await import("/js/panels/jam-track.js");
    const { crewById } = await import("/js/mixer-trends.js");
    const t = DANCES.find((x) => x.recipe);
    return { shelf: DANCES.length, trend: t ? { id: t.id, name: t.name, crew: t.cast?.[0]?.crew, lead: crewById(t.cast?.[0]?.crew)?.name } : null };
  });
  let ownId = null;
  await section("a jam started from a dance trend", async () => {
    await page.evaluate(() => (location.hash = "#/jam"));
    await page.waitForSelector(".jam .jm-tile", { timeout: 20000 });
    // (a video with no song shows the three ways to start: your song, a song made, a dance trend)
    await page.evaluate(() => import("/js/jam.js").then((m) => m.newJam()));
    await workspace("track");
    const empty = await page.evaluate(() => ({ ways: document.querySelectorAll(".jt-ways > .jt-way").length, minis: document.querySelectorAll(".jt-ways .jt-mini").length, names: [...document.querySelectorAll(".jt-ways > .jt-way > b")].map((b) => b.textContent).join() }));
    ok(empty.ways === 3 && empty.minis === Math.min(3, shelf) && empty.names === "Your song,Make a song,From a dance trend", `A video with no song offers three ways in: your song, a song made, a dance trend (${empty.minis} covers of the shelf)`);
    const emptyId = await page.evaluate(() => import("/js/jam.js").then((m) => m.jam.jam.id));
    if (!trend) return void console.log("SKIP no dance trend of ours has a dance to copy: the jam started from one is not tried");
    const paidBefore = paid.length;
    const failedBefore = failed.length;
    await page.locator(`.jt-ways .jt-mini:has(em:text-is("${trend.name}"))`).click();
    ok(await until((t) => import("/js/jam.js").then((m) => m.jam.jam?.body.trend?.id === t && m.jam.jam.id !== undefined && !m.jam.starting && !!m.jam.jam.body.feel).catch(() => false), 120, trend.id), `picking ${trend.name} on the shelf starts a jam of its own`);
    const started = await page.evaluate(async () => {
      const { jam } = await import("/js/jam.js");
      const b = jam.jam.body;
      return { id: jam.jam.id, name: jam.jam.name, track: !!b.track, artist: b.artist?.crew, dance: !!b.dance?.file, synced: b.dance?.synced, feel: b.feel, shots: b.shots.length };
    });
    ok(started.name === trend.name && started.artist === trend.crew && started.dance && started.synced === false, `it has ${trend.lead} as the artist and our version of the dance, not in step with a sound it does not have (${JSON.stringify({ ...started, feel: undefined })})`);
    ok(!started.track && started.shots === 0, "and no track: the trend's own recording is not shipped, so there is nothing to cut and no beats to find");
    ok(/original catchy instrumental/.test(started.feel?.prompt ?? "") && started.feel.bpm > 60 && started.feel.seconds >= 10, `"Make a track" is ready in the trend's feel (${started.feel?.prompt}, ${started.feel?.bpm} BPM)`);
    ok(paid.length === paidBefore, "starting from a trend asked for nothing that costs credits: no track made, no words heard");
    ok(failed.length === failedBefore, `and no request failed (${failed.slice(failedBefore).join(", ") || "none"})`);
    await page.waitForFunction(() => document.querySelectorAll(".jm-tile em").length === 5);
    const strip = await page.locator(".jm-tile em").allInnerTexts();
    ok(strip[0] === "No song yet" && strip[3] === trend.lead, `its tiles say so: ${strip.join(" | ")}`);
    // the START window's form carries the feel (the form was first drawn on the empty video that offered the shelf), and its key can be pressed
    await page.evaluate(() => import("/js/jam.js").then((m) => m.openWindow("start")));
    await page.waitForSelector(".jm-make input.field");
    const form = await page.evaluate(() => ({ prompt: document.querySelector(".jm-make input.field").value, key: document.querySelector(".jm-sec .key.is-primary")?.disabled }));
    ok(/original catchy instrumental/.test(form.prompt) && form.key === false, `the form that makes the track starts from the trend's feel, its key ready (${form.prompt})`);
    ok(paid.length === paidBefore, "and opening it asked for nothing");
    await closeWindow();
    // the empty video that offered the shelf is not kept
    await page.evaluate((id) => import("/js/jam.js").then((m) => m.removeJam(id)), emptyId);
  });

  // ---- keeping the edit right
  await page.evaluate(() => (location.hash = "#/jam"));
  await page.waitForSelector(".jam .jm-tile", { timeout: 20000 });
  const musicOf = () => page.evaluate(async () => {
    const c = await import("/js/cut.js");
    const it = c.cut.project.body.tracks.find((t) => t.role === "music").items[0];
    return it ? { src: it.src.duration, duration: c.sourceOf(it.src).duration, length: c.lengthOf(it) } : null;
  });
  await section("the music runs as long as the sound does", async () => {
    // the music runs as long as the sound does, in the preview and for the beat finder (a sound named without its length was given five seconds)
    await openJam("jam-walk-moonlit-oolong");
    const shipped = await musicOf();
    ok(shipped.duration > 24.9 && shipped.length > 24.9, `a video's music runs its whole length (${shipped.length} s)`);
    const bare = await api("api/cuts", "POST", { name: "Bare music", body: { aspect: "9:16", tracks: [{ id: "a2", kind: "audio", role: "music", name: "Music", items: [{ id: "m", src: { kind: "audio", id: "jam-walk-moonlit-oolong-part.mp3" }, start: 0, from: 0, to: null }] }] } });
    await page.evaluate((id) => import("/js/cut.js").then((m) => m.openCut(id)), bare.project.id);
    await wait("the bare edit to be open", async (id) => (await import("/js/cut.js")).cut.project?.id === id, bare.project.id);
    const bareMusic = await until(async () => { const c = await import("/js/cut.js"); const it = c.cut.project.body.tracks.find((t) => t.role === "music").items[0]; return it.src.duration > 24.9; }, 40).then(() => musicOf());
    ok(bareMusic.src > 24.9 && bareMusic.length > 24.9, `an edit that names its sound without its length is told it when opened (${bareMusic.src} s)`);
    await page.evaluate(() => import("/js/cut.js").then((m) => m.detectBeatsNow()));
    const heardAll = await page.evaluate(async () => (await import("/js/cut.js")).cut.project.body.beats?.times.at(-1) ?? 0);
    ok(heardAll > 20, `the beats are heard in all of the music, to ${heardAll} s (not to 5 s)`);
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
  });
  await section("an export sets up nothing that was set up", async () => {
    // Export sets up nothing that was already set up: music taken away stays away, the shape chosen in Kitchen's Cut stays
    await openJam("jam-three-kittens");
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
    const first = shaped.tracks.find((t) => t.kind === "title").items.find((i) => i.lyric);
    await page.evaluate(async (id) => {
      const c = await import("/js/cut.js");
      c.setWord(id, 1, { text: "WOW" });
      c.splitLine(id, "letters");
    }, first.id);
    const edit = (await body()).tracks.find((t) => t.kind === "title").items.find((i) => i.id === first.id);
    const lead = first.words[0].text;
    ok(edit.text === `${lead} WOW` && edit.words[1].text === "WOW" && edit.words[0].text === lead, `the line says "${edit.text}" and the word edited is still there after the line is timed again`);
  });
  await section("saves are not forgotten", async () => {
    // saves are not forgotten: renaming one video and then another at once keeps both; an edit left for Kitchen's Cut at once is kept
    await page.evaluate(async () => {
      const j = await import("/js/jam.js");
      await j.openJam("jam-three-kittens");
      j.rename("Alpha save");
      await j.openJam("jam-la-calabaza");
      j.rename("Beta save");
    });
    await until(async () => (await (await fetch("api/jams/jam-la-calabaza")).json()).project.name === "Beta save", 20);
    const names = [(await api("api/jams/jam-three-kittens")).project.name, (await api("api/jams/jam-la-calabaza")).project.name];
    ok(names.join() === "Alpha save,Beta save", `both renames were kept (${names.join(", ")})`);
    const fxBefore = (await api("api/cuts/cut-jam-la-calabaza")).project.body.tracks.find((t) => t.kind === "fx").items.length;
    // (and then Kitchen's own edit is changed before Jam's moment is up: the second change does not cancel the first)
    const kitchenId = await page.evaluate(async () => {
      const j = await import("/js/jam.js");
      await j.openJam("jam-la-calabaza");
      const c = await import("/js/cut.js");
      c.addFx("shake", { at: 1, length: 2 });
      location.hash = "#/cut";
      // (Kitchen's Cut puts its own edit back in two steps, the project away and then the edit opened: wait for the second, not the first)
      for (let i = 0; i < 60 && (c.cut.quiet || !c.cut.project || c.cut.project.id === "cut-jam-la-calabaza"); i++) await new Promise((r) => setTimeout(r, 50));
      c.addTitle("Kept too", 0);
      return c.cut.project.id;
    });
    const fxAfter = await until(async (n) => (await (await fetch("api/cuts/cut-jam-la-calabaza")).json()).project.body.tracks.find((t) => t.kind === "fx").items.length === n, 20, fxBefore + 1);
    ok(fxAfter, `an edit changed in Jam and left for Kitchen's Cut at once was kept (${fxBefore} effects, then ${fxBefore + 1})`);
    const kitchenTitles = await until(async (id) => (await (await fetch(`api/cuts/${id}`)).json()).project.body.tracks.find((t) => t.kind === "title")?.items.some((i) => i.text === "Kept too"), 20, kitchenId);
    ok(kitchenId !== "cut-jam-la-calabaza" && kitchenTitles, `and Kitchen's own change, made before that save was due, was kept as well (${kitchenId})`);
  });

  // ---- Pickle: his words are answered; he is told it is Jam, which workspace is open, and what the jam holds
  await section("Pickle", async () => {
    await page.evaluate(() => (location.hash = "#/jam"));
    await page.waitForSelector(".jam .jm-tile", { timeout: 20000 });
    await openJam("jam-la-calabaza");
    await workspace("words");
    const asked = [];
    await page.route("**/api/cut/assist", async (route) => {
      asked.push(JSON.parse(route.request().postData()));
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ reply: "Bigger, and popping.", actions: [{ op: "captions", style: "pop", size: 0.12 }, { op: "open", workspace: "band" }] }) });
    });
    // (his panel has no canned keys: the words are said through his bar, as a typed message is)
    await page.evaluate(async () => (await import("/js/harnesses.js")).tell("Make the captions bigger."));
    ok(await until(() => import("/js/jam.js").then((m) => m.jam.workspace === "band").catch(() => false), 30), "words said to Pickle are answered, and what he answers is done (he opened The band)");
    const told = asked[0];
    ok(asked.length === 1 && told.product === "jam" && told.cut.jam?.workspace === "words" && told.messages.at(-1).text === "Make the captions bigger." && told.cut.jam.track?.name, `he is asked as Jam's (said through the bar): product ${told?.product}, workspace ${told?.cut?.jam?.workspace}, the track ${told?.cut?.jam?.track?.name}`);
    const done = await page.evaluate(async () => {
      const j = await import("/js/jam.js");
      const c = await import("/js/cut.js");
      return { captions: j.jam.jam.body.captions, size: c.cut.project?.body.tracks.find((t) => t.kind === "title")?.items.find((i) => i.lyric)?.size };
    });
    ok(done.captions === "pop" && Math.abs(done.size - 0.12) < 1e-6, `his actions were applied: captions ${done.captions}, size ${done.size}`);
    ok(await page.waitForFunction(() => /Bigger, and popping/.test(document.querySelector("#assistant")?.innerText ?? ""), null, { timeout: 8000 }).then(() => true, () => false), "his answer is in his chat bar");
    await page.unroute("**/api/cut/assist");
    // (the conversation is read and folded: it stands over the foot of the page while it is open)
    await page.locator('#assistant [aria-label="Fold the conversation"]').click({ timeout: 3000 }).catch(() => {});
  });

  // ---- nothing blocks: while a dance trend is being started (slowly), the workspaces and the other jams are free
  await section("nothing blocks", async () => {
    if (!trend) return void console.log("SKIP no dance trend of ours has a dance to copy: a jam being started from one is not tried");
    await page.route("**/api/mixer/trends/*/files", async (route) => {
      await new Promise((r) => setTimeout(r, 4000));
      await route.continue();
    });
    await workspace("track");
    const listLength = await page.evaluate(() => import("/js/jam.js").then((m) => m.jam.list.length));
    // (started as the shelf's cover starts it)
    await page.evaluate((id) => import("/js/panels/jam-track.js").then(async (m) => { const t = m.DANCES.find((x) => x.id === id); import("/js/jam.js").then((j) => j.startFromTrend(t)); }), trend.id);
    ok(await until(() => import("/js/jam.js").then((m) => !!m.jam.starting).catch(() => false), 20), "a jam is being started from a trend");
    const t0 = Date.now();
    await workspace("band");
    await workspace("words");
    ok((await page.locator(".jm-tile.is-on").getAttribute("data-workspace")) === "words" && Date.now() - t0 < 2500, "the workspaces can be switched while it starts");
    await page.locator(".jm-jam").click();
    await page.locator('.jm-menu-open:has(b:text-is("Alpha save"))').click();
    ok(await until(() => import("/js/jam.js").then((m) => m.jam.jam?.id === "jam-three-kittens" && !!m.jam.starting).catch(() => false), 20), "and another jam can be opened from the set list");
    ok(await until(() => import("/js/jam.js").then((m) => !m.jam.starting).catch(() => false), 60), "the trend's jam finishes on its own");
    const settled = await page.evaluate(() => import("/js/jam.js").then((m) => ({ open: m.jam.jam.id, count: m.jam.list.length })));
    ok(settled.open === "jam-three-kittens" && settled.count === listLength + 1, `and the one open stays the one chosen (${settled.open}); the new one is in the set list (${settled.count} jams)`);
    await page.unroute("**/api/mixer/trends/*/files");
  });

  // ---- a song of your own, added: cut and its beats found here, and nothing that costs credits asked for
  await section("a song of your own", async () => {
    await page.evaluate(() => import("/js/jam.js").then((m) => m.newJam()));
    await workspace("track");
    const chooser = page.waitForEvent("filechooser");
    await page.locator(".jt-ways .jt-way", { hasText: "Your song" }).click();
    await (await chooser).setFiles(join(root, "examples", "jam", "jam-la-calabaza", "track.mp3"));
    ok(await until(() => import("/js/jam.js").then((m) => !!m.jam.jam.body.part && !m.jam.busy.has("part") && !m.jam.busy.has("track")).catch(() => false), 60), "a song added is cut, and its beats are found here");
    const own = await page.evaluate(() => import("/js/jam.js").then((m) => ({ id: m.jam.jam.id, kind: m.jam.jam.body.track.kind, bpm: m.jam.jam.body.bpm, name: m.jam.jam.name })));
    ownId = own.id;
    ok(own.kind === "upload" && own.name === "track", `the jam is named after the song (${own.name}), ${own.bpm} BPM`);
    ok(paid.length === 0, `nothing in all of that asked for credits (${paid.join(", ") || "no paid request"})`);
  });

  // ---- what a job does is for the video it was asked for: a video that is not the open one is not told it is busy, and what is heard for it
  // after it was left (the credits are spent) is kept on it, its edit made when it is opened; the editor keeps the open video's
  await section("a job is for its own video", async () => {
    const away = await page.evaluate(async () => {
      const j = await import("/js/jam.js");
      const c = await import("/js/cut.js");
      const a = j.jam.jam;
      window.__away = a;
      await j.openJam("jam-three-kittens");
      const open = j.jam.jam;
      j.jam.busy.add("listen", a);
      const marks = { here: j.jam.busy.has("listen"), there: j.jam.busy.has("listen", a), statusThere: j.statusOf(a).words, statusHere: j.statusOf(open).words };
      j.jam.busy.delete("listen", a);
      const kept = await j.putHeard(a, { ...a.body.span }, { file: a.body.part.file, url: a.body.part.url, seconds: a.body.part.seconds }, { srt: "1\n00:00:00,500 --> 00:00:01,500\nhello world\n\n2\n00:00:02,000 --> 00:00:03,000\nsecond line\n", bpm: "120" });
      return { id: a.id, marks, kept, stale: a.body.stale === true, lines: a.body.lines.map((l) => l.text), editorStays: c.cut.project.id === open.body.cut, stillOpen: j.jam.jam.id === open.id };
    });
    ok(!away.marks.here && away.marks.there && away.marks.statusThere === "Hearing…" && away.marks.statusHere !== "Hearing…", `a mark is its video's: busy there (${away.marks.statusThere}), not here (${away.marks.statusHere})`);
    ok(away.kept && away.stale && away.lines.join("|") === "hello world|second line" && away.editorStays && away.stillOpen, `the words heard for a video that was left are on it (${away.lines.join(" | ")}), and the editor still holds the open one's edit`);
    ok(await until(async (id) => ((await (await fetch(`api/jams/${id}`)).json()).project.body.lines ?? []).length === 2, 20, away.id), "and kept on the server");
    await page.evaluate((id) => import("/js/jam.js").then((m) => m.openJam(id)), away.id);
    ok(await until(() => import("/js/jam.js").then((j) => import("/js/cut.js").then((c) => !!c.cut.project && c.cut.project.id === j.jam.jam.body.cut && !j.jam.jam.body.stale && c.lyrics().length === 2)).catch(() => false), 40), "opened again, its edit has the words");
  });

  // ---- the paid steps are keys, each with its estimate; pressing one asks for that step only
  await section("the keys that cost credits", async () => {
    for (const path of ["**/api/jam/listen", "**/api/audio/song", "**/api/image"]) await page.route(path, (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "not in the test" }) }));
    /** The paid requests so far are these (waited for: a request leaves a moment after the press). */
    const asked = async (want) => {
      for (let i = 0; i < 40 && paid.join() !== want; i++) await page.waitForTimeout(250);
      return paid.join() === want;
    };
    await openJam("jam-walk-moonlit-oolong");
    await page.evaluate(async () => {
      const store = await import("/js/store.js");
      store.state.info = { ...(store.state.info ?? {}), target: "comfy-cloud" };
      store.changed("jam");
    });
    // the words: the key that has them heard shows its estimate, and nothing is asked until it is pressed
    await workspace("words");
    await page.waitForFunction(() => /Hear them again\s*≈ \d+ cr/.test(document.querySelector(".jw-hear")?.textContent.replace(/\s+/g, " ") ?? ""));
    const hearText = (await page.locator(".jw-hear").innerText()).replace(/\s+/g, " ");
    ok(/Hear them again\s*≈ \d+ cr/.test(hearText) && paid.length === 0, `the key that has the words heard shows its estimate, and nothing was asked yet (${hearText})`);
    await page.locator(".jw-hear").click({ timeout: 10000 }).catch(async (e) => {
      console.log("the key could not be pressed:", JSON.stringify(await page.locator(".jw-hear").evaluate((el) => { const r = el.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { disabled: el.disabled, rect: [r.left, r.top, r.width, r.height].map(Math.round), top: `${top?.tagName}.${top?.className}`, win: document.body.className, layer: !document.querySelector(".jm-layer")?.hidden, scrollY, toasts: document.querySelectorAll(".toast").length }; })));
      throw e;
    });
    ok(await asked("/api/jam/listen"), `Hear the words asks for the words, and only that (${paid.join()})`);
    // the song: Make the song shows its estimate; it asks for the song, and only that
    await workspace("song");
    await page.waitForFunction(() => /Make the song\s*≈ \d+ cr/.test(document.querySelector(".sg-make")?.textContent.replace(/\s+/g, " ") ?? ""));
    const makeText = (await page.locator(".sg-make").innerText()).replace(/\s+/g, " ");
    ok(/Make the song\s*≈ \d+ cr/.test(makeText), `Make the song shows its estimate (${makeText})`);
    await page.locator(".sg-pill.is-more").click();
    await page.locator('textarea[aria-label^="Its style"]').fill("upbeat indie pop, handclaps");
    await page.locator(".sg-make").click();
    ok(await asked("/api/jam/listen,/api/audio/song"), `Make the song asks for the song, and only that (${paid.join()})`);
    // a shipped video's band has everything made: its key has no price even on Comfy Cloud
    await openJam("jam-la-calabaza");
    await workspace("band");
    ok(!/cr/.test(await page.locator(".jm-cast-key").innerText()), "the band of a shipped video has everything made: its key has no price even on Comfy Cloud");
    // the band of a jam made on a song of the person's own has shots to roll: its key says what they cost, and asks twice
    if (ownId) {
      await openJam(ownId);
      // (one of the crew as its artist, free: the key needs a lead before it can be pressed)
      await page.evaluate(() => import("/js/jam.js").then((m) => m.useCrew("praline")));
      await workspace("band");
      await page.waitForFunction(() => /Cast the band\s*≈ \d+ cr/.test(document.querySelector(".jm-cast-key")?.textContent.replace(/\s+/g, " ") ?? ""));
      const sent = paid.join();
      await page.locator(".jm-cast-key").click();
      await page.waitForFunction(() => /Press again to cast/.test(document.querySelector(".jm-cast-key")?.textContent ?? ""));
      await page.waitForTimeout(600);
      ok(paid.join() === sent, "the first press of the key that casts the band says what it will cost, and asks for nothing");
      await page.locator(".jm-cast-key").click();
      ok(await asked(`${sent},/api/image`), `the second press asks for the looks of the shots, and only that (${paid.join()})`);
    } else console.log("SKIP no jam was made on a song of the person's own: the key that casts its band is not tried");
  });
  ok(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(" | ")}` : ""}`);

  /** A look at a page, kept in OUT when it is asked for. */
  async function shot(name) {
    if (process.env.OUT) await page.screenshot({ path: join(out, `${name}.png`) });
  }
} finally {
  await browser.close();
  server.kill();
  await rm(dataDir, { recursive: true, force: true });
  if (!process.env.OUT) await rm(out, { recursive: true, force: true });
}
console.log(failures ? `${failures} failed` : "all passed");
process.exit(failures ? 1 : 0);
