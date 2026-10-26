// Runs every tool of Spice's IC-LoRA suite once on a clip (or a damaged copy of it, for the tools that mend damage), against a running server,
// keeping each result, a contact sheet of the input and the result, and what each run cost in credits. It SPENDS credits (about 2 each at draft
// size): run it only when that is meant. Resumable: a tool whose result is in the out folder is left alone.
//   node scripts/ic-survey.mjs <server url> <clip.mp4> <out dir> [--size draft|standard] [--only id,id] [--seconds 2.05] [--cap 300]
// --cap stops the survey before the credits it has spent pass it.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [base, clip, out, ...rest] = process.argv.slice(2);
if (!clip || !out) throw new Error("usage: ic-survey.mjs <server> <clip> <out dir> [--size draft|standard] [--only id,id] [--seconds n] [--cap credits]");
const opt = (name, d) => (rest.includes(`--${name}`) ? rest[rest.indexOf(`--${name}`) + 1] : d);
const size = opt("size", "draft");
const seconds = Number(opt("seconds", 2.05));
const cap = Number(opt("cap", 300));
const only = opt("only") ? new Set(opt("only").split(",")) : null;
mkdirSync(join(out, "inputs"), { recursive: true });

/** The damage a restoring tool is tried on: ffmpeg filters on a copy of the clip (the footage is kept as it is). */
const FONT = ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf"].find((f) => existsSync(f));
const DAMAGE = {
  blur: ["-vf", "gblur=sigma=7"],
  smear: ["-vf", "tmix=frames=9"],
  compress: ["-vf", "scale=iw/3:ih/3,scale=iw:ih", "-c:v", "libx264", "-crf", "48", "-preset", "veryfast"],
  interlace: ["-vf", "tblend=all_mode=average,tmix=frames=3"],
  worn: ["-vf", "scale=iw/2:ih/2,noise=alls=22:allf=t,gblur=sigma=1.5,scale=iw:ih", "-c:v", "libx264", "-crf", "38", "-preset", "veryfast"],
  gray: ["-vf", "format=gray,format=yuv420p"],
  graded: ["-vf", "colorbalance=rs=.3:gs=-.1:bs=-.4:rm=.2:bm=-.2:rh=.2:bh=-.1,curves=all='0/0 0.2/0.04 0.8/0.92 1/1',eq=contrast=1.3:saturation=1.5"],
  lowres: ["-vf", "scale=iw/4:ih/4:flags=bicubic,scale=iw:ih:flags=bicubic"],
  archive: ["-vf", "format=gray,scale=iw/3:ih/3,noise=alls=25:allf=t,gblur=sigma=1,scale=iw:ih:flags=lanczos", "-c:v", "libx264", "-crf", "40", "-preset", "veryfast"],
  subtitles: ["-vf", `drawtext=${FONT ? `fontfile=${FONT}:` : ""}text='I told you three times, the cat stays in the truck':fontsize=26:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=10:x=(w-text_w)/2:y=h-170`],
  watermark: ["-vf", `drawtext=${FONT ? `fontfile=${FONT}:` : ""}text='@shortvideo':fontsize=44:fontcolor=white@0.55:x=w-text_w-30:y=60,drawtext=${FONT ? `fontfile=${FONT}:` : ""}text='@shortvideo':fontsize=44:fontcolor=white@0.55:x=30:y=h-120`],
};
const damaged = (kind) => {
  const file = join(out, "inputs", `${kind}.mp4`);
  if (!existsSync(file)) execFileSync("ffmpeg", ["-v", "error", "-y", "-i", clip, "-an", ...DAMAGE[kind], "-pix_fmt", "yuv420p", ...(DAMAGE[kind].includes("-c:v") ? [] : ["-c:v", "libx264", "-crf", "14"]), file]);
  return file;
};

if (rest.includes("--inputs-only")) {
  // (free: the damaged copies alone, to look at)
  for (const kind of Object.keys(DAMAGE)) damaged(kind);
  console.log(`made ${Object.keys(DAMAGE).join(", ")} in ${join(out, "inputs")}`);
  process.exit(0);
}
const account = async () => (await (await fetch(`${base}/api/account?refresh=1`)).json()).balance?.credits ?? null;
const { tools, scene } = await (await fetch(`${base}/api/spice/tools`)).json();
const log = existsSync(join(out, "survey.json")) ? JSON.parse(readFileSync(join(out, "survey.json"), "utf8")) : {};
const started = await account();
let spent = 0;

async function listen(id) {
  const sse = await fetch(`${base}/api/events`);
  const reader = sse.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const t0 = Date.now();
  for (;;) {
    const { value, done } = await reader.read();
    if (done || Date.now() - t0 > 20 * 60_000) return null;
    buf += dec.decode(value);
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const data = chunk.split("\n").find((l) => l.startsWith("data:"))?.slice(5);
      if (!data) continue;
      try {
        const j = JSON.parse(data);
        if (j.id === id && ["done", "failed", "canceled"].includes(j.status)) return (reader.cancel().catch(() => {}), j);
      } catch {}
    }
  }
}

for (const t of tools) {
  if (t.needs?.length || (only && !only.has(t.id))) continue;
  const file = join(out, `${t.id}-${size}.mp4`);
  if (existsSync(file)) continue;
  if (spent >= cap) {
    console.log(`stopping: ${spent} credits spent, the cap is ${cap}`);
    break;
  }
  const input = t.demo ? damaged(t.demo.damage) : clip;
  const before = await account();
  const up = await (await fetch(`${base}/api/videos`, { method: "POST", headers: { "Content-Type": "video/mp4" }, body: readFileSync(input) })).json();
  const res = await fetch(`${base}/api/spice/run`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ video: up.file, tool: t.id, seconds, size, scene }) });
  const job = await res.json();
  if (!res.ok) {
    console.log(`${t.id}: refused: ${job.error}`);
    log[t.id] = { error: job.error };
    continue;
  }
  const t0 = Date.now();
  const done = await listen(job.id);
  const after = await account();
  const cost = before !== null && after !== null ? Math.round((before - after) * 100) / 100 : null;
  spent += cost > 0 ? cost : 0;
  if (!done || done.status !== "done") {
    console.log(`${t.id}: ${done?.status ?? "no answer"}: ${done?.error ?? ""}`);
    log[t.id] = { error: done?.error ?? "no answer", credits: cost };
  } else {
    writeFileSync(file, Buffer.from(await (await fetch(`${base}${done.video.url}`)).arrayBuffer()));
    const pick = "select='eq(n,0)+eq(n,20)+eq(n,38)',scale=168:300,tile=3x1";
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", input, "-i", file, "-filter_complex", `[0:v]${pick}[a];[1:v]${pick}[b];[a][b]vstack`, "-frames:v", "1", file.replace(/\.mp4$/, "-sheet.png")]);
    log[t.id] = { took: Math.round((Date.now() - t0) / 1000), credits: cost, input: t.demo?.damage ?? "clip", size: `${done.video.width}x${done.video.height}` };
    console.log(`${t.id}: ${log[t.id].took}s, ${cost} cr, ${log[t.id].size}${t.demo ? ` (on ${t.demo.label})` : ""}`);
  }
  writeFileSync(join(out, "survey.json"), JSON.stringify(log, null, 1));
}
console.log(`done: ${spent} credits spent in this run (balance ${started} -> ${await account()})`);
