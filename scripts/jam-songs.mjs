// Makes the songs Jam ships (examples/songs/<id>/song.json) on the owner's own ComfyUI with their AceStep1.5XL-Superior graph: the
// app's song workflow (workflows/audio/song.json: ACE-Step 1.5 XL sft, three passes) with the jkass_quality sampler on every pass and
// their AudioQualityEnhancer master between the decode and the save, at 0.75 as their OtiaFlow flow sets it (the saved graph says 0.5). Neither is on Comfy Cloud, which is why the
// shipped songs are made here; it costs nothing.
//
//   node scripts/jam-songs.mjs [<id> ...] [--lora [--strength <0 to 1>]] [--write] [--raw <dir>]
//
// (--lora makes the song with its style LoRA, the id its `song.lora` names: loaded on the model, its trigger word first in the tags, as the
// app does on a self-hosted ComfyUI; a song with none is skipped. The result is kept as <id>.lora.mp3, beside the plain one.)
//
// (COMFY_LOCAL_URL names another ComfyUI, http://127.0.0.1:8188 by default. Each song's whole result is kept in --raw, a folder of the
// system's temp by default, and a song already there is not made again. With --write, each is put into its example's folder as
// track.mp3, loudness-matched to -14 LUFS (ffmpeg's loudnorm, two passes) at 96 kbps; raise the example's rev so installs take it.)
import { readdir, readFile, writeFile, access, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { SONG_LORAS, LORA_STRENGTH } from "../server/song-guide.ts";

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const COMFY = process.env.COMFY_LOCAL_URL ?? "http://127.0.0.1:8188";
const args = process.argv.slice(2);
const write = args.includes("--write");
const withLora = args.includes("--lora");
const strength = args.includes("--strength") ? Number(args[args.indexOf("--strength") + 1]) : LORA_STRENGTH;
const raw = args.includes("--raw") ? resolve(args[args.indexOf("--raw") + 1]) : join(tmpdir(), "comfyture-jam-songs");
const only = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--raw" && args[i - 1] !== "--strength");
const dir = join(root, "examples", "songs");
const base = JSON.parse(await readFile(join(root, "workflows", "audio", "song.json"), "utf8"));
await mkdir(raw, { recursive: true });

/** The Superior graph for a song: its settings and seed in the text node and the three passes, the master before the save. */
function graphOf(spec) {
  const g = structuredClone(base);
  const s = spec.song;
  const lora = withLora ? SONG_LORAS.find((l) => l.id === s.lora) : null;
  if (lora) {
    g.lora = { class_type: "LoraLoaderModelOnly", inputs: { model: ["unet", 0], lora_name: `ace-step/${lora.folder}/${lora.folder.replace(/-acestep1\.5-xl-v1$/, "-xl-v1")}.safetensors`, strength_model: strength } };
    g.shift.inputs.model = ["lora", 0];
  }
  Object.assign(g.text.inputs, { tags: lora ? `${lora.trigger}, ${s.tags}` : s.tags, lyrics: s.lyrics, seed: s.seed, duration: s.seconds, bpm: s.bpm, keyscale: s.key, language: s.language, timesignature: s.timesignature, temperature: 0.75, cfg_scale: 2.5, generate_audio_codes: true });
  g.latent.inputs.seconds = s.seconds;
  for (const [k, seed] of [["first", s.seed], ["second", s.seed + 1], ["third", s.seed + 2]]) Object.assign(g[k].inputs, { seed, sampler_name: "jkass_quality" });
  g.enhance = { class_type: "AudioQualityEnhancer", inputs: { audio: ["decode", 0], enhancement_level: 0.75, use_source_separation: true, demucs_model: "htdemucs", device: "cuda", vocals_enhance: 0.65, drums_enhance: 0.5, bass_enhance: 0.45, other_enhance: 0.25, clarity: 0.6, dynamics: 0.4, warmth: 0.25, air: 0.3, dolby_effect: 0, simple_mode: "Standard", apply_limiter: true } };
  g.out.inputs.audio = ["enhance", 0];
  g.out.inputs.filename_prefix = `comfyture/jam-${spec.id}${lora ? "-lora" : ""}`;
  return g;
}

/** A request to ComfyUI, asked again while it is too busy to answer (a long job on its CPU can hold it for minutes). */
async function ask(path, init = {}) {
  for (;;) {
    const res = await fetch(`${COMFY}${path}`, { ...init, signal: AbortSignal.timeout(120000) }).catch(() => null);
    if (res) return res;
    await new Promise((r) => setTimeout(r, 5000));
  }
}

async function make(id) {
  const spec = JSON.parse(await readFile(join(dir, id, "song.json"), "utf8"));
  if (withLora && !spec.song.lora) return null;
  const name = `${id}${withLora ? `.lora${strength}` : ""}`;
  const out = join(raw, `${name}.mp3`);
  if (await access(out).then(() => true, () => false)) return out;
  // (a song queued by an earlier run is followed, not queued again)
  const queued = join(raw, `${name}.prompt`);
  let prompt = (await readFile(queued, "utf8").catch(() => "")).trim();
  if (!prompt) {
    const res = await ask("/prompt", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: graphOf(spec), client_id: "comfyture-jam-songs" }) });
    const sent = await res.json();
    if (!res.ok || !sent.prompt_id) throw new Error(`refused: ${JSON.stringify(sent).slice(0, 400)}`);
    await writeFile(queued, (prompt = sent.prompt_id));
  }
  console.log(`${id}: queued`);
  const t0 = Date.now();
  for (;;) {
    await new Promise((r) => setTimeout(r, 5000));
    const h = (await (await ask(`/history/${prompt}`)).json().catch(() => ({})))[prompt];
    if (!h) continue;
    if (h.status?.status_str === "error") throw new Error(`failed: ${JSON.stringify(h.status.messages).slice(-600)}`);
    const file = Object.values(h.outputs ?? {}).flatMap((o) => o.audio ?? [])[0];
    if (!h.status?.completed || !file) continue;
    const bytes = Buffer.from(await (await ask(`/view?${new URLSearchParams({ filename: file.filename, subfolder: file.subfolder ?? "", type: file.type ?? "output" })}`)).arrayBuffer());
    await writeFile(out, bytes);
    console.log(`${id}: made in ${Math.round((Date.now() - t0) / 1000)} s`);
    return out;
  }
}

/** The song into its example's folder: -14 LUFS (loudnorm measured first, then applied linearly), 96 kbps, no tags. */
async function ship(id, from) {
  const norm = "loudnorm=I=-14:TP=-1:LRA=11";
  const { stderr } = await exec("ffmpeg", ["-hide_banner", "-nostats", "-i", from, "-af", `${norm}:print_format=json`, "-f", "null", "-"], { maxBuffer: 1 << 24 });
  const m = JSON.parse(/\{[^{}]*"input_i"[^{}]*\}/.exec(stderr)[0]);
  const af = `${norm}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
  await exec("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", from, "-af", af, "-ar", "48000", "-ac", "2", "-c:a", "libmp3lame", "-b:a", "96k", "-map_metadata", "-1", join(dir, id, "track.mp3")]);
  console.log(`${id}: written (from ${m.input_i} LUFS)`);
}

for (const id of (await readdir(dir)).filter((id) => !only.length || only.includes(id)).sort()) {
  try {
    const made = await make(id);
    if (made && write) await ship(id, made);
  } catch (e) {
    console.log(`${id}: ${e.message}`);
  }
}
