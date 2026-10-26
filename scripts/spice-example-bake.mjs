// The example folder of Spice's scenario, Truffle's Jam Heist (examples/spice/heist/), from what the shots and passes steps made (the
// manifest OUT/heist.json and the clips in the lab server's library, VIDEOS=<folder>). Every clip is re-encoded small enough for the
// repository (about a megabyte for five seconds), a still is taken of each plate, and scenario.json is written as server/spice.ts reads it.
// Called by scripts/spice-example.mjs bake.
import { mkdir, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const VIDEOS = process.env.VIDEOS ?? "";
const CRF = Number(process.env.CRF ?? 29);

export async function bake({ OUT, manifest, SHOTS, root }) {
  if (!VIDEOS) throw new Error("VIDEOS=<the lab server's data/videos> names where the clips are");
  const dir = join(root, "examples", "spice", "heist");
  await mkdir(dir, { recursive: true });
  const probe = (f) => {
    const out = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "json", f]).toString();
    const j = JSON.parse(out);
    return { width: j.streams[0].width, height: j.streams[0].height, seconds: Math.round(Number(j.format.duration) * 1000) / 1000 };
  };
  const small = (src, name, sound) => {
    const out = join(dir, name);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", src, "-c:v", "libx264", "-crf", String(CRF), "-preset", "slow", "-pix_fmt", "yuv420p", ...(sound ? ["-c:a", "aac", "-b:a", "96k"] : ["-an"]), "-movflags", "+faststart", out]);
    return { file: name, ...probe(out) };
  };
  const hasSound = (src) => execFileSync("ffprobe", ["-v", "error", "-select_streams", "a", "-show_entries", "stream=codec_type", "-of", "csv=p=0", src]).toString().includes("audio");
  const still = (src, name) => {
    execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", "0.5", "-i", src, "-frames:v", "1", "-vf", "scale=640:-2", "-q:v", "4", join(dir, name)]);
    return name;
  };
  const shots = [];
  let bytes = 0;
  for (const s of SHOTS) {
    const m = manifest.shots[s.id];
    if (!m?.plate) continue;
    const src = join(VIDEOS, m.plate.file);
    const plate = { ...small(src, `${s.id}-plate.mp4`, hasSound(src)), still: still(src, `${s.id}-plate.jpg`) };
    const passes = [];
    for (const [i, p] of (m.passes ?? []).entries()) {
      if (!p?.media) continue;
      const psrc = join(VIDEOS, p.media.file);
      const media = small(psrc, `${s.id}-p${i + 1}.mp4`, hasSound(psrc));
      const extra = {};
      for (const [k, v] of Object.entries(p.extra ?? {})) if (v?.file) extra[k] = small(join(VIDEOS, v.file), `${s.id}-p${i + 1}-${k}.mp4`, false);
      passes.push({ tool: p.tool, name: p.name ?? toolName(p.tool), words: p.words ?? "", ...(p.scene ? { scene: p.scene } : {}), params: p.params ?? {}, note: p.note ?? "", media, ...(Object.keys(extra).length ? { extra } : {}), credits: p.credits ?? null });
    }
    // the first frame the shot was rolled from (docs/brand/products/spice-v3/<id>.png, drawn from the cast's sheets), as a small still
    const png = join(root, "docs", "brand", "products", "spice-v3", `${s.id}.png`);
    let frame = null;
    try {
      await stat(png);
      execFileSync("ffmpeg", ["-v", "error", "-y", "-i", png, "-vf", "scale=1280:-2", "-q:v", "4", join(dir, `${s.id}-frame.jpg`)]);
      frame = { file: `${s.id}-frame.jpg`, width: 1280, height: 720 };
    } catch {}
    shots.push({ id: s.id, name: s.name, about: s.about, plate, made: { words: s.action, seconds: s.seconds, ...(frame ? { frame } : {}) }, passes });
  }
  const spec = {
    id: "spice-example-heist",
    rev: Number(process.env.REV ?? 1),
    name: "Truffle's Jam Heist",
    logline: "Truffle, the lovable little bandit, lifts a jar of jam from the market yard while Pickle keeps watch; a flashback to the first heist of 1958; the two dance on the counter as the bulbs come on. Five shots rolled by LTX-2.5 from first frames drawn from the cast's sheets, then the suite's tools on each.",
    shots,
  };
  await writeFile(join(dir, "scenario.json"), `${JSON.stringify(spec, null, 1)}\n`);
  for (const s of shots) for (const f of [s.plate.file, s.plate.still, s.made.frame?.file, ...s.passes.flatMap((p) => [p.media.file, ...Object.values(p.extra ?? {}).map((x) => x.file)])].filter(Boolean)) bytes += (await stat(join(dir, f))).size;
  console.log(`examples/spice/heist: ${shots.length} shots, ${shots.reduce((n, s) => n + s.passes.length, 0)} passes, ${(bytes / 1e6).toFixed(1)} MB`);
}

const NAMES = { inpaint: "Inpaint", obscura: "Obscura", "day-to-night": "Day to night", outpaint: "Outpaint", "in-outpainting": "In-outpainting", sound: "Sound", water: "Water", crossview: "Crossview", cutout: "Cut out", refocus: "Refocus", upscale: "Upscale", restoration: "Restoration", colorization: "Colorization", "union-pose": "Union control: pose", restyle: "Restyle", slowmo: "Slow motion" };
const toolName = (id) => NAMES[id] ?? id;
