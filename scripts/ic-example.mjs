// Builds Spice's flagship example, "State Property: the suite", from what the real runs made: the footage, Roto's matte, Paint's clean-up and
// Gen's pass (scripts/ic-flagship.mjs), and one take for each tool of the IC-LoRA suite that was run (scripts/ic-survey.mjs, with the damaged
// copy each restoring tool was given). It writes examples/spice/sh070-state-property/ with its shot.json; Light, FX and Comp (free) are then
// baked by scripts/spice-examples.mjs from the spec. Every file is re-encoded small: the whole folder is for a repository.
//   node scripts/ic-example.mjs <survey dir> <flagship dir> <clip.mp4> [<out dir>]
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [survey, flag, clip, out = "examples/spice/sh070-state-property"] = process.argv.slice(2);
if (!survey || !flag || !clip) throw new Error("usage: ic-example.mjs <survey dir> <flagship dir> <clip.mp4> [<out dir>]");
mkdirSync(out, { recursive: true });
const { tools } = JSON.parse(readFileSync("workflows/ic-loras.json", "utf8"));
const log = JSON.parse(readFileSync(join(survey, "survey.json"), "utf8"));

/** A clip re-encoded small, without sound, at the size it has; answers its facts. */
function small(from, to, crf = 27) {
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", from, "-an", "-c:v", "libx264", "-crf", String(crf), "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart", join(out, to)]);
  const p = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=width,height,nb_frames,r_frame_rate", "-show_entries", "format=duration", "-of", "json", join(out, to)]).toString());
  return { file: to, width: p.streams[0].width, height: p.streams[0].height, seconds: Math.round(Number(p.format.duration) * 1000) / 1000 };
}

const passes = {};
passes.plate = { ...small(clip, "plate.mp4", 22), name: "State Property · Earl and Mochi (our crew)" };
execFileSync("ffmpeg", ["-v", "error", "-y", "-i", join(out, "plate.mp4"), "-frames:v", "1", "-vf", "select='eq(n,12)'", "-q:v", "3", join(out, "plate.jpg")]);
passes.plate.still = "plate.jpg";
const notes = { roto: "The old rancher · SAM3 on Comfy Cloud", paint: "The cat · Obscura Remova on Comfy Cloud", gen: "Day to dusk · Day to night, an IC-LoRA of the suite, on Comfy Cloud" };
for (const dept of ["roto", "paint", "gen"]) {
  if (!existsSync(join(flag, `${dept}.mp4`))) continue;
  // (a run is drawn at a size of its own, to a multiple of 32: cut to the footage's shape, so the passes above it are not stretched)
  const shaped = join(flag, `${dept}-shaped.mp4`);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", join(flag, `${dept}.mp4`), "-an", "-vf", `crop='min(iw,ih*${passes.plate.width}/${passes.plate.height})':ih,scale=${passes.plate.width}:${passes.plate.height}:flags=lanczos,setsar=1`, "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", shaped]);
  passes[dept] = { ...small(shaped, `${dept}.mp4`, 24), note: notes[dept], source: "cloud" };
}

// a take for each tool of the suite that was run and looked at, with the damaged copy a restoring tool was given
const takes = [];
for (const t of tools) {
  const result = join(survey, `${t.id}-draft.mp4`);
  // (only the tools whose real run looked right: the registry says which, and a tool that did not shows its dot red and says why)
  if (t.needs?.length || t.status !== "verified" || !existsSync(result) || !log[t.id] || log[t.id].error) continue;
  const take = { tool: t.id, words: t.words || t.prompt || "", strength: t.strength, size: "draft", media: small(result, `gen-${t.id}.mp4`, 29) };
  if (t.demo && existsSync(join(survey, "inputs", `${t.demo.damage}.mp4`))) {
    const name = `gen-in-${t.demo.damage}.mp4`;
    if (!existsSync(join(out, name))) small(join(survey, "inputs", `${t.demo.damage}.mp4`), name, 29);
    take.input = { file: name, width: take.media.width, height: take.media.height, seconds: take.media.seconds };
    take.inputLabel = t.demo.label;
  }
  takes.push(take);
}

const spec = {
  id: "spice-example-state-property",
  rev: 1,
  name: "State Property: the IC-LoRA suite",
  about: "Earl and Mochi in the pickup, our crew's State Property clip, two seconds of it, through the departments with real runs on Comfy Cloud: Roto follows the rancher with SAM3, Gen turns the golden hour to dusk with an IC-LoRA of the suite, Light grades it cool, FX lays rain, bokeh and a lens flare, and Comp exports it. And in Gen's takes, a real run of every other tool of the suite that looked right on this clip, each restoring tool on a damaged copy of it, to put back as the pass.",
  build: ["light", "fx", "comp"],
  passes,
  set: {
    roto: { subjects: [{ id: "s-hero", name: "The old rancher", points: [], media: null, eye: true }], open: "s-hero" },
    gen: { tool: "day-to-night", takes },
    light: { grade: "cool", exposure: -0.05, contrast: 1.05, saturation: 0.95 },
    fx: { layers: [{ id: "l-bokeh", el: "bokeh", opacity: 0.25, behind: true }, { id: "l-flare", el: "lens-flare", x: 0.3, y: 0.25, scale: 0.7, opacity: 0.8 }, { id: "l-rain", el: "rain", amount: 0.65 }], finish: { bloom: 0.2, vignette: 0.3 } },
    comp: { format: "mp4" },
  },
};
writeFileSync(join(out, "shot.json"), `${JSON.stringify(spec, null, 1)}\n`);
console.log(`${out}: ${Object.keys(passes).join(", ")} and ${takes.length} takes`);
