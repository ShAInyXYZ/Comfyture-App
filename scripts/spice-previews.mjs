// The preview of every tool of Spice's suite, from a real run on our own footage (Truffle's Jam Heist): a still of what the tool was given
// beside a still of what it made, in one picture (web/brand/spice/previews/<tool>.jpg, 640x360). The passes the example ships give the
// previews of the tools they were made with; every other tool that can run is run once at draft size (two seconds, a few credits) on the
// plate that suits it; a tool that needs more than a clip, or whose run failed, gets no picture (the card says so).
//   SERVER=http://127.0.0.1:5592 node scripts/spice-previews.mjs      a server of the guide branch with a key, its data folder fresh (the
//                                                                        example is then seeded in it, and the runs go into its library)
// Resumable: a preview that exists is not made again. Spends credits.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const SERVER = (process.env.SERVER ?? "http://127.0.0.1:5592").replace(/\/$/, "");
const OUT = join(root, "web", "brand", "spice", "previews");
const WORK = process.env.WORK ?? join(root, "..", "spice-previews-work");
await mkdir(OUT, { recursive: true });
await mkdir(WORK, { recursive: true });
const manifestPath = join(WORK, "previews.json");
const manifest = existsSync(manifestPath) ? JSON.parse(await readFile(manifestPath, "utf8")) : {};
const save = () => writeFile(manifestPath, JSON.stringify(manifest, null, 2));

const api = async (path, init) => {
  const res = await fetch(`${SERVER}${path}`, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path}: ${body.error ?? res.status}`);
  return body;
};
const post = (path, body) => api(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

// the example, seeded in the server's library: its plates and passes by the names the seeder gives them
const EX = "spice-example-heist";
const plate = (shot) => `${EX}-${shot}-plate.mp4`;
const pass = (shot, n) => `${EX}-${shot}-p${n}.mp4`;
const scenario = JSON.parse(await readFile(join(root, "examples", "spice", "heist", "scenario.json"), "utf8"));
const wordsOf = (shot) => scenario.shots.find((s) => s.id === shot)?.made?.words ?? "";

/** The tools whose preview is a pass the example ships: [tool, the clip it ran on, the clip it made]. */
const SHIPPED = {
  inpaint: [plate("sh010"), pass("sh010", 1)],
  "day-to-night": [pass("sh010", 1), pass("sh010", 2)],
  "in-outpainting": [pass("sh010", 2), pass("sh010", 3)],
  sound: [pass("sh010", 3), pass("sh010", 4)],
  water: [plate("sh020"), pass("sh020", 1)],
  crossview: [pass("sh020", 1), pass("sh020", 2)],
  cutout: [pass("sh020", 2), pass("sh020", 3)],
  refocus: [plate("sh030"), pass("sh030", 1)],
  upscale: [pass("sh030", 1), pass("sh030", 2)],
  restoration: [plate("sh040"), pass("sh040", 1)],
  colorization: [pass("sh040", 1), pass("sh040", 2)],
  "union-pose": [plate("sh050"), pass("sh050", 1)],
};

/** The tools run once for their preview: the plate that suits each, its words, and what else it takes. */
const RUNS = {
  deblur: { on: plate("sh030") },
  motiondeblur: { on: plate("sh030") },
  decompression: { on: plate("sh040") },
  uncompress: { on: plate("sh040") },
  dearchive: { on: plate("sh040") },
  deinterlace: { on: plate("sh040") },
  "video-upscale": { on: plate("sh040") },
  "upscale-refine": { on: plate("sh030") },
  ungrade: { on: plate("sh010") },
  colorizer: { on: plate("sh040"), words: "a grey raccoon with a dark eye mask and a dark flat cap, red jam in the jar, cream stone houses, cream and rust striped awnings, golden afternoon light" },
  subtitles: { on: plate("sh020"), copy: "subtitles" },
  watermark: { on: plate("sh020"), copy: "watermark" },
  obscura: { on: plate("sh050"), words: "jar of red jam" },
  "clean-plate": { on: plate("sh020"), words: "the empty wooden crate beside the jam stall, nobody on it, the same stalls, awnings and cobbles, golden afternoon light" },
  "edit-anything": { on: plate("sh030"), words: "Add a red knitted scarf around the raccoon's neck." },
  outpaint: { on: plate("sh030"), aspect: 1 },
  cameraman: { on: plate("sh020"), words: "the camera slowly pushes in towards the frog on the crate" },
  "union-canny": { on: plate("sh050"), words: "a raccoon and a frog dancing on a market counter, drawn as a paper cut-out pop-up book, bright flat colours" },
  "union-depth": { on: plate("sh020"), words: "a small green frog in a woolly red hat sits on a crate in a snowy night market, lanterns glowing" },
  shave: { on: plate("sh030") },
  "cross-eyed": { on: plate("sh020") },
  slowmo: { on: plate("sh050") },
};

// a copy of a plate with something on it that the tool takes off (the only previews made on a prepared copy, and the cards say so)
const FONT = ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf"].find((f) => existsSync(f));
const COPIES = {
  subtitles: ["-vf", `drawtext=${FONT ? `fontfile=${FONT}:` : ""}text='Keep watch. If anyone comes, whistle twice.':fontsize=28:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=10:x=(w-text_w)/2:y=h-70`],
  watermark: ["-vf", `drawtext=${FONT ? `fontfile=${FONT}:` : ""}text='@jamheist':fontsize=46:fontcolor=white@0.6:x=w-text_w-40:y=50`],
};
async function copied(kind, source) {
  const file = join(WORK, `${kind}.mp4`);
  if (!existsSync(file)) {
    const src = join(WORK, "src", source);
    await mkdir(join(WORK, "src"), { recursive: true });
    if (!existsSync(src)) await writeFile(src, Buffer.from(await (await fetch(`${SERVER}/media/videos/${source}`)).arrayBuffer()));
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", src, ...COPIES[kind], "-c:v", "libx264", "-crf", "17", "-preset", "fast", "-an", file]);
  }
  const res = await fetch(`${SERVER}/api/videos`, { method: "POST", headers: { "Content-Type": "video/mp4" }, body: await readFile(file) });
  const v = await res.json();
  if (!res.ok) throw new Error(v.error);
  return v.file;
}

/** A frame of a clip of the server's library, at a second, as a PNG in the work folder. */
async function frame(file, at, tag) {
  const src = join(WORK, "src", file);
  await mkdir(join(WORK, "src"), { recursive: true });
  if (!existsSync(src)) await writeFile(src, Buffer.from(await (await fetch(`${SERVER}/media/videos/${file}`)).arrayBuffer()));
  const out = join(WORK, `${tag}.png`);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", String(at), "-i", src, "-frames:v", "1", "-vf", "scale=320:360:force_original_aspect_ratio=decrease,pad=320:360:(ow-iw)/2:(oh-ih)/2:color=0x0d0d0f", out]);
  return out;
}
/** The preview: what the tool was given on the left, what it made on the right, a thin yellow line between. */
async function preview(tool, before, after, at = 1.0) {
  const a = await frame(before, at, `${tool}-a`);
  const b = await frame(after, at, `${tool}-b`);
  const out = join(OUT, `${tool}.jpg`);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", a, "-i", b, "-filter_complex", "[0][1]hstack=2,drawbox=x=319:y=0:w=2:h=360:color=0xF2FF59:t=fill", "-q:v", "5", out]);
  return out;
}

async function waitJob(id) {
  const sse = await fetch(`${SERVER}/api/events`);
  const reader = sse.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const t0 = Date.now();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value);
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const chunk = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const data = chunk.split("\n").find((l) => l.startsWith("data:"))?.slice(5);
        if (!data) continue;
        try {
          const j = JSON.parse(data);
          if (j.id === id && j.status === "done") return j.video;
          if (j.id === id && (j.status === "failed" || j.status === "canceled")) throw new Error(j.error ?? j.status);
        } catch (e) {
          if (!(e instanceof SyntaxError)) throw e;
        }
      }
      if (Date.now() - t0 > 20 * 60_000) throw new Error("took too long");
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  throw new Error("the stream ended");
}
async function waitTemplate(id) {
  for (let i = 0; i < 400; i++) {
    const j = await api(`/api/utensils/templates/job/${id}`);
    if (j.status === "done") return (j.outputs ?? []).find((o) => o.kind === "video");
    if (j.status === "failed" || j.status === "canceled") throw new Error(j.error ?? j.status);
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error("took too long");
}

// the example is seeded by the first read of its store
await api("/api/spice-scenarios");
const balance = async () => (await api("/api/account").catch(() => ({}))).balance?.credits ?? null;
console.log(`balance ${await balance()}`);

for (const [tool, [before, after]] of Object.entries(SHIPPED)) {
  if (existsSync(join(OUT, `${tool}.jpg`))) continue;
  await preview(tool, before, after);
  manifest[tool] = { from: "the example", before, after };
  console.log(`${tool}: from the example`);
}
await save();
for (const [tool, plan] of Object.entries(RUNS)) {
  if (existsSync(join(OUT, `${tool}.jpg`)) || manifest[tool]?.failed) continue;
  try {
    const on = plan.copy ? await copied(plan.copy, plan.on) : plan.on;
    const shot = plan.on.match(/-(sh\d+)-/)?.[1];
    const before = await balance();
    const body = { video: on, tool, words: plan.words ?? "", scene: wordsOf(shot), size: "draft", seconds: 2, ...(plan.aspect ? { aspect: plan.aspect } : {}) };
    console.log(`${tool}: running on ${on}${plan.copy ? ` (a copy with ${plan.copy})` : ""}`);
    const started = await post("/api/spice/run", body);
    const made = started.template ? await waitTemplate(started.id) : await waitJob(started.id);
    const after = await balance();
    await preview(tool, on, made.file, 1.0);
    manifest[tool] = { on, copy: plan.copy ?? null, made: made.file, size: `${made.width}x${made.height}`, credits: before !== null && after !== null ? Math.round((before - after) * 100) / 100 : null };
    console.log(`  made ${made.file} ${made.width}x${made.height}, ${manifest[tool].credits ?? "?"} credits`);
  } catch (e) {
    manifest[tool] = { failed: e.message };
    console.log(`  ${tool} failed: ${e.message}`);
  }
  await save();
}
console.log(`previews: ${Object.keys(manifest).length} tools; balance ${await balance()}`);
