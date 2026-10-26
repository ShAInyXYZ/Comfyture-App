// Runs one tool of Spice's IC-LoRA suite on a clip against a running server, waits for it, and keeps what came back with a contact sheet of
// the clip and the result side by side, and what the run cost (the account's credits before and after). Spends credits: run it only when the
// run is meant. Usage:
//   node scripts/ic-run.mjs <server url> <clip.mp4> <tool id> <out dir> [--seconds 2] [--size draft|standard] [--prompt "..."] [--strength 1] [--tag name]
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";

const [base, clip, tool, out, ...rest] = process.argv.slice(2);
if (!base || !clip || !tool || !out) throw new Error("usage: ic-run.mjs <server> <clip> <tool> <out dir> [--seconds n] [--size draft|standard] [--prompt words] [--strength n]");
const opt = (name, d) => (rest.includes(`--${name}`) ? rest[rest.indexOf(`--${name}`) + 1] : d);
mkdirSync(out, { recursive: true });
const credits = async () => (await (await fetch(`${base}/api/account?refresh=1`)).json()).balance?.credits ?? null;

const before = await credits();
const up = await (await fetch(`${base}/api/videos`, { method: "POST", headers: { "Content-Type": "video/mp4" }, body: readFileSync(clip) })).json();
const body = { video: up.file, tool, seconds: Number(opt("seconds", 2.05)), size: opt("size", "draft"), ...(opt("prompt") ? { prompt: opt("prompt") } : {}), ...(opt("strength") ? { strength: Number(opt("strength")) } : {}) };
const res = await fetch(`${base}/api/spice/ic`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const job = await res.json();
if (!res.ok) throw new Error(job.error ?? `refused (${res.status})`);
console.log(`started ${tool}: ${JSON.stringify(body)} (credits before: ${before})`);

// the job's events, until it ends
const sse = await fetch(`${base}/api/events`);
const reader = sse.body.getReader();
const dec = new TextDecoder();
let buf = "";
let done = null;
const t0 = Date.now();
while (!done) {
  const { value, done: end } = await reader.read();
  if (end) break;
  buf += dec.decode(value);
  let i;
  while ((i = buf.indexOf("\n\n")) >= 0) {
    const chunk = buf.slice(0, i);
    buf = buf.slice(i + 2);
    const data = chunk.split("\n").find((l) => l.startsWith("data:"))?.slice(5);
    if (!data) continue;
    try {
      const j = JSON.parse(data);
      if (j.id === job.id && ["done", "failed", "canceled"].includes(j.status)) done = j;
    } catch {}
  }
  if (Date.now() - t0 > 25 * 60_000) throw new Error("gave up after 25 minutes");
}
await reader.cancel().catch(() => {});
if (!done || done.status !== "done") throw new Error(`${tool}: ${done?.status ?? "no answer"}: ${done?.error ?? ""}`);
const bytes = Buffer.from(await (await fetch(`${base}${done.video.url}`)).arrayBuffer());
const stamp = new Date().toISOString().slice(11, 19).replaceAll(":", "");
const file = join(out, `${tool}-${opt("tag", stamp)}.mp4`);
writeFileSync(file, bytes);
const after = await credits();
const probe = execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=width,height,nb_frames", "-of", "csv=p=0", file]).toString().trim().split("\n")[0];
// the clip and the result, three frames each, in a sheet
const sheet = file.replace(/\.mp4$/, "-sheet.png");
const pick = "select='eq(n,0)+eq(n,20)+eq(n,38)',scale=168:300,tile=3x1";
execFileSync("ffmpeg", ["-v", "error", "-y", "-i", clip, "-i", file, "-filter_complex", `[0:v]${pick}[a];[1:v]${pick}[b];[a][b]vstack`, "-frames:v", "1", sheet]);
console.log(JSON.stringify({ tool, took: Math.round((Date.now() - t0) / 1000), result: probe, credits: before !== null && after !== null ? Math.round((before - after) * 100) / 100 : null, after, file, sheet }));
