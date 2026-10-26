// Makes Spice's example scenario, Truffle's Jam Heist, for real on Comfy Cloud through a running server (its key), step by step:
//   node scripts/spice-example.mjs shots    the five plates: each first frame (docs/brand/products/spice-v3/sh0N0.png, drawn with Codex
//                                           from the cast's sheets) rolled by LTX-2.5 for five seconds
//   node scripts/spice-example.mjs passes   the suite's tools on them, each pass on the one before (api/spice/run)
//   node scripts/spice-example.mjs bake     the example folder (examples/spice/heist/) from what was made
// SERVER=http://127.0.0.1:5590 names the server (a lab one, never the person's); OUT=<folder> where the manifest and the clips go.
// Every step is resumable: what the manifest already holds is not made again. Every run spends credits: the balance is read before and after.
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";

const root = resolve(import.meta.dirname, "..");
const SERVER = (process.env.SERVER ?? "http://127.0.0.1:5590").replace(/\/$/, "");
const OUT = process.env.OUT ?? join(root, "..", "spice-heist-work");
const FRAMES = join(root, "docs", "brand", "products", "spice-v3");
await mkdir(OUT, { recursive: true });
const manifestPath = join(OUT, "heist.json");
const manifest = existsSync(manifestPath) ? JSON.parse(await readFile(manifestPath, "utf8")) : { shots: {} };
const save = () => writeFile(manifestPath, JSON.stringify(manifest, null, 2));

const api = async (path, init) => {
  const res = await fetch(`${SERVER}${path}`, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path}: ${body.error ?? res.status}`);
  return body;
};
const post = (path, body) => api(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const balance = async () => (await api("/api/account").catch(() => ({}))).balance?.credits ?? null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The scenario: five shots, their first frames and what LTX-2.5 is told of the motion (and the sound) of each. */
export const SHOTS = [
  { id: "sh010", name: "SH010 · The yard", about: "Truffle crosses the yard with the jar. A white van is in the plate.", seconds: 5,
    action: "A small grey raccoon tiptoes across a sunlit cobbled market yard from the left to the right of the frame, hugging a big jar of red jam to his chest with both paws, glancing back over his shoulder with a sly smile; his ringed tail sways behind him; the striped awnings and the strings of bulbs stir in a light breeze; the camera is locked off at eye level, warm golden-hour light, long soft shadows.",
    sound: "soft padding footsteps on cobbles, a light breeze in cloth awnings, distant birds" },
  { id: "sh020", name: "SH020 · The lookout", about: "Pickle keeps watch on a crate by the jam stall.", seconds: 5,
    action: "A small bright-green frog sits on a wooden crate beside a jam stall, keeping watch: his huge round eyes dart to the left, then to the right, one webbed hand shading his eyes like a visor; he leans forward, then gives a quick thumbs-up towards the left of the frame; the awning and the string of bulbs sway gently; the camera is locked off at the frog's eye level, golden-hour light.",
    sound: "a quiet market yard, a gentle breeze, a tiny frog chirp" },
  { id: "sh030", name: "SH030 · The jar", about: "Close on Truffle and the jar. The focus puller missed.", seconds: 5,
    action: "Close-up: a grey raccoon hugs a big jar of red jam under his chin, his eyes half closed in bliss; he opens them, looks down at the jar and grins wider, squeezing it; the whole picture stays softly out of focus throughout, a smooth even lens blur, warm golden light; the camera is locked off.",
    sound: "a soft contented chuckle, the creak of a jar lid, a quiet yard" },
  { id: "sh040", name: "SH040 · 1958", about: "The first heist, from a newsreel. Scratched, grainy, black and white.", seconds: 5,
    action: "Old black-and-white newsreel footage from 1958, heavy film grain, flicker, dust and thin scratches: a grey raccoon wearing a tiny flat cap runs on his hind legs from the right to the left of the frame across a cobbled market yard, hugging a jar of jam, his cap tilting and slipping over one eye; a stall's striped awning flaps; the camera is locked off; no colour anywhere.",
    sound: "the clatter of a film projector, muffled footsteps, an old recording's hiss" },
  { id: "sh050", name: "SH050 · The dance", about: "Truffle and Pickle dance on the counter as the bulbs come on.", seconds: 5,
    action: "A grey raccoon and a small bright-green frog dance side by side on a wooden jam stall counter at dusk, a big jar of red jam between them: the frog bounces with both arms thrown up, the raccoon sways with one paw raised and the other on the jar, his ringed tail swinging; strings of warm bulbs glow and sway behind them under a striped awning; the camera is locked off at the counter's level.",
    sound: "a playful accordion tune, two happy little laughs, bulbs clinking in the breeze" },
];

async function waitRun(id) {
  for (let i = 0; i < 900; i++) {
    const runs = await api("/api/runs");
    const r = (Array.isArray(runs) ? runs : runs.runs ?? []).find((x) => x.id === id);
    if (!r) throw new Error(`run ${id} is gone`);
    if (r.status === "done") return r;
    if (r.status === "failed" || r.status === "canceled") throw new Error(`run ${id} ${r.status}: ${r.error ?? ""}`);
    if (i % 15 === 0) console.log(`  ${id}: ${r.status} ${r.stage ?? ""} ${Math.round((r.progress ?? 0) * 100)}%`);
    await sleep(2000);
  }
  throw new Error(`run ${id} took too long`);
}

async function shots() {
  for (const s of SHOTS) {
    manifest.shots[s.id] ??= {};
    const m = manifest.shots[s.id];
    if (m.plate) {
      console.log(`${s.id}: made already (${m.plate.file})`);
      continue;
    }
    const png = join(FRAMES, `${s.id}.png`);
    if (!existsSync(png)) throw new Error(`${png} is missing: draw it first (docs/brand/products/spice-v3/run.sh)`);
    if (!m.frame) {
      const res = await fetch(`${SERVER}/api/photos?name=${encodeURIComponent(`${s.name} · first frame`)}`, { method: "POST", headers: { "Content-Type": "image/png" }, body: await readFile(png) });
      m.frame = await res.json();
      if (!res.ok) throw new Error(`upload: ${m.frame.error}`);
      await save();
    }
    const before = await balance();
    console.log(`${s.id}: rolling LTX-2.5 (${s.seconds} s) from ${m.frame.file}, balance ${before}`);
    const [run] = await post("/api/shots", { name: s.name, start: m.frame.file, seconds: s.seconds, aspect: "16:9", quality: "standard", enhance: false, review: false, takes: 1, script: { shots: [{ action: s.action, camera: "locked", framing: "", sound: s.sound }] } });
    m.run = run.id;
    await save();
    const done = await waitRun(run.id);
    const v = await post("/api/videos/from", { run: done.id });
    const after = await balance();
    m.plate = { file: v.file, url: v.url, width: v.width, height: v.height, seconds: v.duration };
    m.credits = before !== null && after !== null ? Math.round((before - after) * 100) / 100 : null;
    m.prompt = done.prompt ?? s.action;
    await save();
    console.log(`${s.id}: ${v.file} ${v.width}x${v.height} ${v.duration}s, ${m.credits ?? "?"} credits`);
  }
}

const step = process.argv[2];
if (step === "shots") await shots();
else if (step === "passes") (await import("./spice-example-passes.mjs")).passes({ SERVER, OUT, manifest, save, api, post, balance, SHOTS });
else if (step === "bake") (await import("./spice-example-bake.mjs")).bake({ OUT, manifest, SHOTS, root, copyFile });
else console.log("node scripts/spice-example.mjs shots | passes | bake");
