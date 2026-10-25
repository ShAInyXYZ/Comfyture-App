// Makes the passes of Spice's example shots with the app itself, free, on this machine, and puts them in the example's folder:
// Light's grade or weather (ffmpeg on the server), FX's bake (the canvas compositor of web/js/spice-layers.js, run by the page, its frames
// sent to the server) and Comp's export. They used to be baked by hand in a browser; this does it the same way, every time.
//
//   NODE_PATH=<a node_modules that has playwright> node scripts/spice-examples.mjs [examples/spice/<folder> ...] [--write] [--out <dir>] [--pictures <dir>]
//
// A spec says what to make with a top-level `"build": ["light", "fx", "comp"]` in its shot.json: the departments whose passes the app
// makes, in the pipeline's order. The settings are the spec's own `set`: set.light (grade, exposure, contrast, saturation: Light's grade;
// weather, amount: Light's weather), set.fx (layers) and set.comp (format for a clip, picFormat for a picture). Anything not in `build`
// (plate, roto, a hand-made paint) is taken as shipped. With no folder, every examples/spice/*/shot.json that has a `build` list is made.
//
// For each spec: a copy of its folder, without the passes about to be made, is seeded into a lab server (own temp data folder, no Comfy
// key, a dead render address, a free port from 5440 to 5459, COMFYTURE_EXAMPLES pointing at the copy); a headless Chromium that can reach
// nothing but that server opens Spice, opens the shot and presses each department's own key, in order, as a person does (Grade it / Add
// the weather, Bake the layers, Export), waiting for the pass to be there and fresh (its lamp green, nothing working). A pass that errors,
// or takes over ten minutes, stops the build with the shot's name. Then the shot is read back from the server and each made pass's file
// is copied from the lab's data folder as light.jpg|mp4, fx.<what the app made>|mp4, comp.webp|mp4 (a clip stays the MP4 the server
// made; a picture stays what the app made), and the spec's `passes` entries for them are written (file, seconds, width, height, note,
// source "free"), `rev` one higher when any file's bytes changed, in the style the shipped specs are written in (spice-shot-json.mjs).
//
// Nothing in examples/ is touched without --write: the outputs (each shot's folder: shot.json and the passes made) go to a scratch folder
// (--out <dir>, else a new one in the system's temp), whose path is printed. Before anything is overwritten, sizes are compared and
// what changed is printed; every file is copied, checked, and only then put in place. A file that is no longer named by the spec (an
// fx.jpg that is now an fx.png) goes once the new one is checked.
//
// --pictures <dir> also saves, for each shot built, the before/after pair the website shows: the plate and the comp (else the FX bake)
// as WebP 1280 px wide at quality 82, <short>-plate.webp and <short>-fx.webp (<short> is the folder's name without its shNNN-). A clip's
// pair is its frame at the middle, and the finished clip itself comes with them, small for the web: <short>-fx.mp4, H.264 at CRF 26,
// +faststart, no sound, at most 960 px tall.
import { spawn, execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, cp, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, extname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { tempDir } from "../tests/tools/temp.mjs";
import { buildOf, formatShot, madeEntry, withMade, withoutBuilt } from "./spice-shot-json.mjs";

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const spiceDir = join(root, "examples", "spice");
const PORTS = [5440, 5459];
const PASS_LIMIT = 10 * 60_000;
const ASSET = /^[\w.-]+\.(mp4|jpg|png|webp)$/;
/** The key each department's tool is pressed by (web/js/spice-light.js, spice-fx.js, spice-comp.js). */
const KEYS = { grade: "light:grade", weather: "light:weather", fx: "fx:bake", comp: "comp:export" };
/** Everything that would spend credits: a request for it is refused by the browser and counted (as the browser tests do). */
const PAID = /\/api\/(image|shots|reels|generate|paint|director|cutout|audio\/(music|sound)|utensils\/(upscale|cutout|upscale-video|sound)|cuts\/[\w-]+\/render|macaron\/(image|motion)|jam\/(listen|slice))(\?|$)/;

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const mb = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)} MB` : `${Math.round(n / 1e3)} KB`);
const sha = async (file) => createHash("sha256").update(await readFile(file)).digest("hex");
const size = async (file) => (await stat(file).catch(() => null))?.size ?? null;
const ff = (args) => exec("ffmpeg", ["-v", "error", "-y", ...args]);
const secs = (ms) => `${(ms / 1000).toFixed(1)} s`;

// ---------------------------------------------------------------- the command line

const USAGE = "Usage: NODE_PATH=<a node_modules that has playwright> node scripts/spice-examples.mjs [examples/spice/<folder> ...] [--write] [--out <dir>] [--pictures <dir>]";
function parse(argv) {
  const o = { folders: [], write: false, out: null, pictures: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--write") o.write = true;
    else if (a === "--out" || a === "--pictures") {
      const v = argv[++i];
      if (!v || v.startsWith("--")) throw new Error(`${a} needs a folder.\n${USAGE}`);
      o[a.slice(2)] = resolve(v);
    } else if (a === "--help" || a === "-h") {
      console.log(USAGE);
      process.exit(0);
    } else if (a.startsWith("--")) throw new Error(`Unknown option ${a}.\n${USAGE}`);
    else o.folders.push(a);
  }
  return o;
}

/** The specs to build: the folders named (a bare name is a folder of examples/spice), else every one that has a build list. */
async function specsOf(folders) {
  const dirs = folders.length
    ? folders.map((f) => resolve(existsSync(f) ? f : join(spiceDir, f)))
    : (await readdir(spiceDir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => join(spiceDir, d.name)).sort();
  const list = [];
  for (const dir of dirs) {
    const name = basename(dir);
    let spec;
    let build;
    try {
      spec = JSON.parse(await readFile(join(dir, "shot.json"), "utf8").catch((e) => (folders.length ? Promise.reject(e) : "null")));
      build = spec && buildOf(spec);
    } catch (e) {
      throw new Error(`${name}: ${e.message}`);
    }
    if (!spec) continue;
    if (!build?.length) {
      if (folders.length) throw new Error(`${name}: its shot.json has no "build" list (e.g. "build": ["light", "fx", "comp"]).`);
      continue;
    }
    if (typeof spec.id !== "string" || list.some((s) => s.spec.id === spec.id)) throw new Error(`${name}: its id ${JSON.stringify(spec.id)} is missing or used by another spec.`);
    if (build.includes("light") && !lightTools(spec).length) throw new Error(`${name}: light is in build but its set.light holds neither a grade (grade, exposure, contrast, saturation) nor a weather (weather, amount).`);
    if (!spec.passes?.plate?.file) throw new Error(`${name}: it has no plate to build on.`);
    list.push({ dir, name, short: name.replace(/^sh\d+-/, ""), spec, build });
  }
  return list;
}

// ---------------------------------------------------------------- the lab: a server of its own

const freePort = (port) => new Promise((done) => {
  const s = createServer();
  s.once("error", () => done(false));
  s.listen(port, "127.0.0.1", () => s.close(() => done(true)));
});

/** Starts the app on a data folder of its own, with no Comfy key and a dead render address, seeding the examples in `examples`. */
async function startLab(data, examples) {
  const env = { ...process.env, HOST: "127.0.0.1", COMFYTURE_DATA: data, COMFYTURE_EXAMPLES: examples, COMFY_BASE_URL: "http://127.0.0.1:9" };
  for (const k of ["COMFY_API_KEY", "COMFY_PROXY_TOKEN", "COMFYTURE_JUDGE", "COMFYTURE_FAKE_TEMPLATES"]) delete env[k];
  const start = PORTS[0] + Math.floor(Math.random() * (PORTS[1] - PORTS[0] + 1));
  for (let n = 0; n <= PORTS[1] - PORTS[0]; n++) {
    const port = PORTS[0] + ((start - PORTS[0] + n) % (PORTS[1] - PORTS[0] + 1));
    if (!(await freePort(port))) continue;
    // (in a process group of its own: the ffmpeg jobs it starts are in it, and stopping the lab stops them too, whatever the server was doing)
    const child = spawn(process.execPath, ["server/main.ts"], { cwd: root, env: { ...env, PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"], detached: true });
    const group = (signal) => { try { process.kill(-child.pid, signal); } catch {} };
    let log = "";
    let exited = null;
    for (const stream of [child.stdout, child.stderr]) stream.on("data", (b) => (log = (log + b).slice(-6000)));
    child.once("exit", (code) => (exited = code ?? "signal"));
    const lab = {
      port, log: () => log,
      base: `http://127.0.0.1:${port}`,
      async stop() {
        if (exited === null) {
          group("SIGTERM");
          for (let i = 0; i < 50 && exited === null; i++) await sleep(100);
        }
        group("SIGKILL");
      },
    };
    process.once("exit", () => group("SIGKILL"));
    for (let i = 0; i < 300 && exited === null; i++) {
      if (await fetch(`${lab.base}/api/spice-shots`).then((r) => r.ok, () => false)) return lab;
      await sleep(200);
    }
    // (taken by someone between the check and the start: the next port; anything else is an error)
    await lab.stop();
    if (/EADDRINUSE/.test(log)) continue;
    throw new Error(`The lab server did not start on port ${port}:\n${log.trim() || "(it said nothing)"}`);
  }
  throw new Error(`No free port from ${PORTS[0]} to ${PORTS[1]} for the lab server.`);
}

const getJson = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
};

// ---------------------------------------------------------------- the page: Spice, driven the way a person drives it

function playwright() {
  try {
    return createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ?? "playwright");
  } catch {
    throw new Error("Playwright is not installed here. Run with NODE_PATH=<a node_modules that has playwright> (or PLAYWRIGHT_MODULE=<its folder>).");
  }
}

/** A page of its own for a shot: it can reach nothing but the lab server, and a request that would spend credits is refused and counted. */
async function openPage(browser, server) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const seen = { outbound: [], paid: [], errors: [] };
  await context.route((url) => url.hostname !== "127.0.0.1", (route) => (seen.outbound.push(route.request().url()), route.abort()));
  await context.route(PAID, (route) => (route.request().method() === "POST" ? (seen.paid.push(new URL(route.request().url()).pathname), route.abort()) : route.continue()));
  // (what Spice tells the person, kept: a pass that fails says why in a toast)
  await context.addInitScript(() => {
    window.__toasts = [];
    document.addEventListener("DOMContentLoaded", () => {
      const el = document.getElementById("toast");
      if (el) new MutationObserver(() => el.textContent.trim() && !el.hidden && window.__toasts.push({ text: el.textContent.trim(), tone: el.dataset.tone || "", at: Date.now() })).observe(el, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ["hidden", "data-tone"] });
    });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  page.on("pageerror", (e) => seen.errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !/GL Driver|favicon|Failed to load resource/.test(m.text()) && seen.errors.push(m.text()));
  await page.goto(`${server.base}/#/spice`, { waitUntil: "load" });
  await page.waitForSelector(".sp-stack .sp-layer", { timeout: 60_000 });
  return { context, page, seen };
}

/** Opens the example's shot: Spice reads its shots first, then this one is the shot open, its footage drawn. */
async function openShot(page, id) {
  await page.evaluate(async (shot) => {
    const spice = await import("/js/spice.js");
    await spice.loadShots();
    await spice.openShot(shot);
  }, id);
  await page.waitForSelector('.sp-layer[data-dept="plate"] .sp-lamp[data-tone="done"]');
  await page.waitForFunction(() => { const m = document.querySelector(".sp-stage .sp-media:not([hidden])"); return !m || (m.tagName === "VIDEO" ? m.readyState >= 2 : m.complete); }, null, { timeout: 60_000 }).catch(() => {});
  await sleep(500);
}

/** A department opened by its row in the stack. */
async function openDept(page, dept) {
  await page.locator(`.sp-layer[data-dept="${dept}"] .sp-layer-main`).click();
  await page.waitForSelector(`.sp-dept.is-${dept}:not([hidden])`);
  await sleep(400);
}

/** What the page says of a department now: is it working, its lamp, its pass, what Spice has told. */
const look = (page, dept) => page.evaluate(async (d) => {
  const { spice, workingOn } = await import("/js/spice.js");
  const p = spice.shot?.body.passes[d] ?? null;
  const w = workingOn(d);
  return {
    busy: !!w, progress: w?.progress ?? null, label: w?.label ?? null,
    lamp: document.querySelector(`.sp-layer[data-dept="${d}"] .sp-lamp`)?.dataset.tone ?? null,
    pass: p?.media ? { at: p.at, kind: p.media.kind, url: p.media.url, note: p.note } : null,
    toasts: window.__toasts.slice(),
  };
}, dept);

/**
 * Presses a department's own key and waits for its pass: there (made since the press), fresh (its lamp green: for FX, the layers it was
 * baked from are the layers there are) and nothing working. Throws, with the reason, if the key is not lit, the work fails or stops, or it
 * takes over ten minutes.
 */
async function make(page, dept, key, say) {
  await openDept(page, dept);
  const button = page.locator(`.sp-primary[data-key="${key}"]`);
  await button.waitFor({ state: "visible" });
  await page.waitForFunction((k) => { const b = document.querySelector(`.sp-primary[data-key="${k}"]`); return b && !b.disabled; }, key, { timeout: 15_000 }).catch(() => {});
  if (await button.isDisabled()) throw new Error(`${dept}'s key (${key}) is not lit: ${(await button.getAttribute("title")) || "no reason given"}`);
  const label = (await button.innerText()).replace(/\s+/g, " ").trim();
  const pressed = Date.now();
  await button.click();
  say(`${dept}: pressed "${label}"`);
  let seenBusy = false;
  let shown = -1;
  let stale = 0;
  for (;;) {
    const s = await look(page, dept);
    seenBusy ||= s.busy;
    const fresh = s.pass && Date.parse(s.pass.at) >= pressed - 1000;
    if (s.busy && s.progress !== null && Math.floor(s.progress * 10) > shown) {
      shown = Math.floor(s.progress * 10);
      say(`${dept}: ${s.label ?? "working"} ${shown * 10}%`);
    }
    if (fresh && !s.busy) {
      if (s.lamp === "done") return s.pass;
      stale ||= Date.now();
      if (Date.now() - stale > 15_000) throw new Error(`${dept}'s pass is there but its lamp says "${s.lamp}", not done`);
    }
    if (!s.busy && !fresh && (seenBusy || Date.now() - pressed > 5000)) {
      const why = s.toasts.filter((t) => t.at >= pressed && t.tone === "crit").at(-1)?.text;
      throw new Error(`${dept} made nothing${why ? `: ${why}` : " (it stopped without a pass or a word)"}`);
    }
    if (Date.now() - pressed > PASS_LIMIT) throw new Error(`${dept} took over ${PASS_LIMIT / 60_000} minutes`);
    await sleep(500);
  }
}

/** Light's tools the spec's set.light asks for: the grade (grade, exposure, contrast, saturation), then the weather (weather, amount). */
function lightTools(spec) {
  const set = spec.set?.light ?? {};
  const tools = [];
  if (["grade", "exposure", "contrast", "saturation"].some((k) => k in set)) tools.push("grade");
  if ("weather" in set) tools.push("weather");
  return tools;
}

// ---------------------------------------------------------------- what the app made

/** A file's pixels, frames and seconds, read back (a picture has one frame). The seconds are the picture's own, not the sound's tail. */
async function probe(file) {
  const { stdout } = await exec("ffprobe", ["-v", "error", "-select_streams", "v:0", "-count_frames", "-show_entries", "stream=width,height,nb_read_frames,duration:format=duration", "-of", "json", file]);
  const j = JSON.parse(stdout);
  const s = j.streams?.[0] ?? {};
  return { width: s.width, height: s.height, frames: Number(s.nb_read_frames) || 0, seconds: Number(s.duration) || Number(j.format?.duration) || 0 };
}

/** Copies a file to its place the safe way: to a name beside it, checked byte for byte against the original, then put in place. */
async function place(from, to) {
  await mkdir(resolve(to, ".."), { recursive: true });
  const part = `${to}.part`;
  await copyFile(from, part);
  if ((await sha(part)) !== (await sha(from))) {
    await rm(part, { force: true });
    throw new Error(`${to}: the copy is not the file it was made from.`);
  }
  await rename(part, to);
}

// ---------------------------------------------------------------- one shot

/** Builds one spec in the lab: returns what the app made, read back from the server and copied into `stage`. */
async function build(s, server, data, browser, stage, say) {
  const { page, context, seen } = await openPage(browser, server);
  try {
    await openShot(page, s.spec.id);
    for (const dept of s.build) {
      // (Light has two free tools: the spec's set.light says which; the others have one key each)
      const tools = dept === "light" ? lightTools(s.spec) : [dept];
      for (const tool of tools) {
        const t0 = Date.now();
        const pass = await make(page, dept, KEYS[tool], say);
        say(`${dept}: made "${pass.note}" in ${secs(Date.now() - t0)}`);
      }
    }
    await page.evaluate(async () => (await import("/js/spice.js")).flushShots());
    await sleep(300);
    if (seen.paid.length) throw new Error(`a request that would spend credits was refused: ${seen.paid.join(", ")}`);
    if (seen.errors.length) say(`(the page reported: ${seen.errors.slice(0, 3).join(" | ").slice(0, 300)})`);
    if (seen.outbound.length) say(`(blocked ${seen.outbound.length} request(s) to other hosts, e.g. ${seen.outbound[0]})`);
  } finally {
    await context.close();
  }
  // the shot as the server kept it
  const { project } = await getJson(`${server.base}/api/spice-shots/${s.spec.id}`);
  const plate = project.body.passes.plate?.media;
  const made = {};
  for (const dept of s.build) {
    const pass = project.body.passes[dept];
    const media = pass?.media;
    if (!media?.file) throw new Error(`${dept}: the shot kept no pass for it`);
    if (media.kind !== plate?.kind) throw new Error(`${dept}: the app made ${media.kind === "image" ? "a picture" : "a clip"} for a shot that is ${plate?.kind === "image" ? "a picture" : "a clip"}`);
    const ext = extname(media.file).slice(1).toLowerCase().replace("jpeg", "jpg");
    const file = `${dept}.${ext}`;
    if (!ASSET.test(file)) throw new Error(`${dept}: the app made a .${ext}, and the seeder takes mp4, jpg, png and webp`);
    const from = join(data, media.kind === "image" ? "photos" : "videos", media.file);
    if (!(await size(from))) throw new Error(`${dept}: its file ${media.file} is not in the lab's library`);
    await place(from, join(stage, file));
    made[dept] = { file, note: pass.note ?? "", media, entry: null };
  }
  return made;
}

/** What each made file is, next to what the folder had: sizes, pixels, frames; and the changes to put in the spec. */
async function compare(s, made, stage, say) {
  const platePath = join(s.dir, s.spec.passes?.plate?.file ?? "plate.jpg");
  const plate = await probe(platePath).catch(() => null);
  let changed = false;
  const lines = [];
  for (const [dept, m] of Object.entries(made)) {
    const now = join(stage, m.file);
    const info = await probe(now);
    const bytes = await size(now);
    const old = s.spec.passes?.[dept]?.file;
    const before = old ? await size(join(s.dir, old)) : null;
    const same = before !== null && old === m.file && (await sha(join(s.dir, old))) === (await sha(now));
    if (!same) changed = true;
    // (a clip's seconds are those of its picture, as the shipped specs say them: 73 frames at 24 are 3.042 for every pass, whatever the sound adds)
    const seconds = m.media.kind === "video" ? Math.round(info.seconds * 1000) / 1000 : undefined;
    m.entry = madeEntry({ file: m.file, seconds, width: info.width, height: info.height, note: m.note });
    const frames = m.media.kind === "video" ? ` · ${info.frames} frames${plate?.frames ? (info.frames === plate.frames ? ` (the plate's ${plate.frames})` : ` (!) the plate has ${plate.frames}`) : ""}` : "";
    const dims = plate && (info.width !== plate.width || info.height !== plate.height) ? ` (!) the plate is ${plate.width}x${plate.height}` : "";
    const was = before === null ? (old ? `${old} is not there` : "a new pass") : same ? `identical to ${old}` : `${old} ${before} -> ${bytes} bytes${old === m.file ? ` (${bytes >= before ? "+" : ""}${(((bytes - before) / before) * 100).toFixed(1)}%)` : ""}`;
    lines.push(`  ${dept.padEnd(5)} ${m.file.padEnd(9)} ${`${info.width}x${info.height}`.padEnd(10)} ${mb(bytes).padStart(8)}${frames}${dims} · "${m.note}" · ${was}`);
  }
  say(`${s.name}:\n${lines.join("\n")}`);
  return changed;
}

// ---------------------------------------------------------------- the website's pictures

/** A picture, or a clip's frame at `at` seconds, as a WebP 1280 px wide (no wider than it is) at quality 82. */
const webp = (input, output, at) => ff([...(at === undefined ? [] : ["-ss", at.toFixed(3)]), "-i", input, "-frames:v", "1", "-vf", "scale='min(1280,iw)':-1:flags=lanczos", "-c:v", "libwebp", "-quality", "82", "-compression_level", "6", output]);

/** The pair the website shows for a shot: the plate and the comp (else the FX bake), and for a clip its middle frames and the clip itself. */
async function pictures(s, made, stage, out, say) {
  await mkdir(out, { recursive: true });
  const after = ["comp", "fx", "light", "paint"].find((d) => made[d] || s.spec.passes?.[d]);
  if (!after) throw new Error(`${s.name}: no pass to show after the plate`);
  const fileOf = (dept) => (made[dept] ? join(stage, made[dept].file) : join(s.dir, s.spec.passes[dept].file));
  const plate = join(s.dir, s.spec.passes.plate.file);
  const clip = extname(plate).toLowerCase() === ".mp4";
  const names = [`${s.short}-plate.webp`, `${s.short}-fx.webp`];
  if (clip) {
    const mid = async (file) => (await probe(file)).seconds / 2;
    await webp(plate, join(out, names[0]), await mid(plate));
    await webp(fileOf(after), join(out, names[1]), await mid(fileOf(after)));
    await ff(["-i", fileOf(after), "-vf", "scale=-2:'min(960,ih)':flags=lanczos,format=yuv420p", "-c:v", "libx264", "-crf", "26", "-preset", "slow", "-profile:v", "high", "-an", "-movflags", "+faststart", join(out, `${s.short}-fx.mp4`)]);
    names.push(`${s.short}-fx.mp4`);
  } else {
    await webp(plate, join(out, names[0]));
    await webp(fileOf(after), join(out, names[1]));
  }
  for (const n of names) {
    const info = await probe(join(out, n));
    say(`${n}  ${info.width}x${info.height}${info.frames > 1 ? ` · ${info.frames} frames` : ""}  ${mb(await size(join(out, n)))}`);
  }
}

// ---------------------------------------------------------------- the run

async function main() {
  const o = parse(process.argv.slice(2));
  const specs = await specsOf(o.folders);
  if (!specs.length) return console.log("No example has a build list (a top-level \"build\": [\"light\", \"fx\", \"comp\"] in its shot.json): nothing to make.");
  const { chromium } = playwright();
  const lab = tempDir("spice-examples-");
  const data = join(lab, "data");
  const examples = join(lab, "examples");
  const outRoot = o.write ? tempDir("spice-examples-out-") : o.out ?? (await mkdtemp(join(tmpdir(), "spice-examples-out-")));
  await mkdir(outRoot, { recursive: true });

  // each folder copied without the passes about to be made, its spec to match
  for (const s of specs) {
    const seeded = withoutBuilt(s.spec);
    const left = new Set(Object.values(seeded.passes ?? {}).flatMap((p) => [p.file, p.still]).filter(Boolean));
    const going = new Set(Object.values(s.spec.passes ?? {}).flatMap((p) => [p.file, p.still]).filter((f) => f && !left.has(f)));
    const dest = join(examples, "spice", s.name);
    await cp(s.dir, dest, { recursive: true, filter: (from) => !(dirnameIs(from, s.dir) && (going.has(basename(from)) || basename(from) === "shot.json")) });
    await writeFile(join(dest, "shot.json"), formatShot(seeded));
  }

  const started = Date.now();
  const server = await startLab(data, examples);
  console.log(`The lab: ${server.base} (data ${data}, no Comfy key, nothing behind it)`);
  let browser;
  const results = [];
  try {
    const listed = (await getJson(`${server.base}/api/spice-shots`))["spice-shots"].map((x) => x.id);
    const missing = specs.filter((s) => !listed.includes(s.spec.id));
    if (missing.length) throw new Error(`The lab did not seed ${missing.map((s) => s.name).join(", ")}:\n${server.log().trim()}`);
    browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ["--no-sandbox"] });
    for (const s of specs) {
      const say = (text) => console.log(`[${s.short}] ${text}`);
      const t0 = Date.now();
      try {
        const stage = join(outRoot, s.name);
        await rm(stage, { recursive: true, force: true });
        await mkdir(stage, { recursive: true });
        say(`building ${s.build.join(", ")}`);
        const made = await build(s, server, data, browser, stage, say);
        const took = Date.now() - t0;
        const changed = await compare(s, made, stage, say);
        const next = withMade(s.spec, Object.fromEntries(Object.entries(made).map(([d, m]) => [d, m.entry])), changed);
        await writeFile(join(stage, "shot.json"), formatShot(next));
        say(`built in ${secs(took)}${changed ? `, rev ${s.spec.rev ?? 1} -> ${next.rev}` : ", nothing changed"}`);
        if (o.write) await publish(s, made, next, stage, say);
        else say(`outputs: ${stage}`);
        if (o.pictures) await pictures(s, made, o.write ? s.dir : stage, o.pictures, say);
        results.push({ s, took, stage, made });
      } catch (e) {
        throw new Error(`${s.name} (${s.spec.name}): ${e.message}`);
      }
    }
  } finally {
    await browser?.close().catch(() => {});
    await server.stop();
  }
  console.log(`\nDone: ${results.map((r) => `${r.s.name} ${secs(r.took)}`).join(", ")} · ${secs(Date.now() - started)} in all`);
  if (!o.write) console.log(`Nothing in examples/ was changed. The outputs are in ${outRoot} (--write puts them in the example folders).`);
  if (o.pictures) console.log(`The website's pictures are in ${o.pictures}.`);
}

/** Whether a path is directly in a folder (the folder itself is not). */
const dirnameIs = (path, dir) => resolve(path, "..") === resolve(dir);

/** The made files and the new spec put into the example's folder, each checked before it is in place; a file the spec no longer names goes last. */
async function publish(s, made, next, stage, say) {
  for (const m of Object.values(made)) await place(join(stage, m.file), join(s.dir, m.file));
  await place(join(stage, "shot.json"), join(s.dir, "shot.json"));
  for (const dept of Object.keys(made)) {
    const old = s.spec.passes?.[dept]?.file;
    const kept = Object.values(next.passes).some((p) => p.file === old || p.still === old);
    if (old && !kept && (await size(join(s.dir, old))) !== null) {
      await rm(join(s.dir, old));
      say(`removed ${old} (the spec names ${made[dept].file} now)`);
    }
  }
  say(`written into ${s.dir}`);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(`\nFAILED: ${e.message}`);
    process.exit(1);
  },
);
// (stopped from outside: the lab server, its jobs and the browser go with it, and the temp folders are removed)
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.once(signal, () => process.exit(130));
