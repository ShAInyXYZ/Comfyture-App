// The first three departments of Spice's flagship shot, run for real on Comfy Cloud (they cost credits; run it only when that is meant):
// Roto tracks the rancher with SAM3, Paint takes the cat out with Obscura Remova, Gen runs an IC-LoRA of the suite on what Paint left. Light, FX and
// Comp (all free) are then baked by scripts/spice-examples.mjs from the shot's spec.
//   node scripts/ic-flagship.mjs <server url> <clip.mp4> <out dir> [--gen <tool id>] [--size draft|standard] [--only roto,paint,gen]
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fillSlots } from "../web/js/spice2-model.js";

const [base, clip, out, ...rest] = process.argv.slice(2);
if (!base || !clip || !out) throw new Error("usage: ic-flagship.mjs <server> <clip> <out dir> [--gen tool] [--size draft|standard] [--only roto,paint,gen]");
const opt = (name, d) => (rest.includes(`--${name}`) ? rest[rest.indexOf(`--${name}`) + 1] : d);
const only = opt("only") ? new Set(opt("only").split(",")) : new Set(["roto", "paint", "gen"]);
mkdirSync(out, { recursive: true });
const credits = async () => (await (await fetch(`${base}/api/account?refresh=1`)).json()).balance?.credits ?? null;
const json = (r) => r.json();
const post = (path, body) => fetch(`${base}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

async function upload(file) {
  const v = await json(await fetch(`${base}/api/videos`, { method: "POST", headers: { "Content-Type": "video/mp4" }, body: readFileSync(file) }));
  return { kind: "video", file: v.file, url: v.url, width: v.width, height: v.height, seconds: v.duration };
}
/** A job of the server's (a video job), by its events. */
async function jobDone(id) {
  const sse = await fetch(`${base}/api/events`);
  const reader = sse.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const t0 = Date.now();
  for (;;) {
    const { value, done } = await reader.read();
    if (done || Date.now() - t0 > 25 * 60_000) throw new Error("no answer");
    buf += dec.decode(value);
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const data = chunk.split("\n").find((l) => l.startsWith("data:"))?.slice(5);
      try {
        const j = data && JSON.parse(data);
        if (j && j.id === id && ["done", "failed", "canceled"].includes(j.status)) return (reader.cancel().catch(() => {}), j);
      } catch {}
    }
  }
}
const save = async (url, file) => (writeFileSync(file, Buffer.from(await (await fetch(`${base}${url}`)).arrayBuffer())), file);
const step = async (name, run) => {
  if (!only.has(name)) return;
  const before = await credits();
  const t0 = Date.now();
  const made = await run();
  const after = await credits();
  console.log(`${name}: ${Math.round((Date.now() - t0) / 1000)}s, ${before !== null && after !== null ? Math.round((before - after) * 100) / 100 : "?"} cr -> ${made}`);
};

const plate = await upload(clip);
const info = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=width,height,nb_frames", "-of", "json", clip]).toString()).streams[0];

// Roto: SAM3 follows the rancher from the first frame, by his name
await step("roto", async () => {
  const res = await post("api/spice/matte", { video: plate.file, text: "the old man in the straw hat", positive: [], negative: [], key: 0 });
  const job = await json(res);
  if (!res.ok) throw new Error(job.error);
  const done = await jobDone(job.id);
  if (done.status !== "done") throw new Error(`roto: ${done.error}`);
  return save(done.video.url, join(out, "roto.mp4"));
});

// Paint: Obscura Remova (Paint's second engine, the template of Comfy Cloud) takes the cat out of the foreground, no mask. VOID is Paint's first,
// but its form, run through the template runner, is answered by "expected INT, got string": the runner takes its slots for the wrong widgets.
await step("paint", async () => {
  const name = "template_ltx2_3_obscura_remova_lora_remove_object_from_video";
  const schema = (await json(await fetch(`${base}/api/utensils/templates/${name}`))).schema;
  const { inputs } = fillSlots(schema, { video: plate, text: "Remove the grey cat from the foreground." });
  const started = await json(await post(`api/utensils/templates/${name}/run`, { inputs, confirm: true }));
  if (!started.id) throw new Error(JSON.stringify(started));
  for (let i = 0; i < 600; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const j = await json(await fetch(`${base}/api/utensils/templates/job/${started.id}`));
    if (j.status === "failed") throw new Error(`paint: ${j.error}`);
    if (j.status === "done") {
      const outputs = (j.outputs ?? []).filter((o) => o.kind === "video");
      // the result, never the side-by-side comparison the template also saves
      const pick = outputs.find((o) => !/compar|stitch/i.test(o.saved ?? "")) ?? outputs[0];
      return save(pick.url, join(out, "paint.mp4"));
    }
  }
  throw new Error("paint: gave up");
});

// Gen: a tool of the suite, on the clean-up (the cat is gone)
await step("gen", async () => {
  const painted = existsSync(join(out, "paint.mp4")) ? await upload(join(out, "paint.mp4")) : plate;
  const tool = opt("gen", "day-to-night");
  const res = await post("api/spice/ic", { video: painted.file, tool, seconds: 2.05, size: opt("size", "standard"), scene: "an old Texan rancher in a cream straw hat leans out of a yellow pickup truck window, autumn trees behind him" });
  const job = await json(res);
  if (!res.ok) throw new Error(job.error);
  const done = await jobDone(job.id);
  if (done.status !== "done") throw new Error(`gen: ${done.error}`);
  return save(done.video.url, join(out, "gen.mp4"));
});
