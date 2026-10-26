// Puts the lyrics of Jam's shipped songs on the times they are sung at, heard from the audio: the vocals are separated and listened to
// (scripts/lyrics-words.py, run inside the owner's ComfyUI container, which has Demucs and faster-whisper), and the written lyrics are
// matched to the words heard (web/js/lyrics-align.js). Each song's `timing` is written into its song.json: { lines: [[from, to], ...]
// (one per sung line of its lyrics), matched }, and the lyrics display, the section map and the Track's markers use it.
//
//   node scripts/jam-lyrics.mjs [<id> ...] [--raw <dir>] [--keep <dir>] [--write]
//
// (--raw is the folder scripts/jam-songs.mjs made the songs in: <id>.mp3, the whole song before it was made smaller; else the example's
// own track.mp3. --keep saves each song's heard words (<id>.words.json) in a folder, to look into a result. COMFY_CONTAINER names the container, "comfyui" by default. Without --write the result is only printed.)
import { readdir, readFile, writeFile, access, mkdtemp, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { alignLines, sungLines } from "../web/js/lyrics-align.js";

const exec = promisify(execFile);
const MIN_SHARE = 0.5;
const root = resolve(import.meta.dirname, "..");
const container = process.env.COMFY_CONTAINER ?? "comfyui";
const args = process.argv.slice(2);
const write = args.includes("--write");
const raw = args.includes("--raw") ? resolve(args[args.indexOf("--raw") + 1]) : null;
const keep = args.includes("--keep") ? resolve(args[args.indexOf("--keep") + 1]) : null;
const only = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--raw" && args[i - 1] !== "--keep");
const dir = join(root, "examples", "songs");
const work = await mkdtemp(join(tmpdir(), "jam-lyrics-"));
const has = (p) => access(p).then(() => true, () => false);

await exec("docker", ["exec", container, "mkdir", "-p", "/tmp/jam-lyrics"]);
await exec("docker", ["cp", join(root, "scripts", "lyrics-words.py"), `${container}:/tmp/jam-lyrics/lyrics-words.py`]);

for (const id of (await readdir(dir)).filter((id) => !only.length || only.includes(id)).sort()) {
  const file = join(dir, id, "song.json");
  const spec = JSON.parse(await readFile(file, "utf8"));
  const lines = sungLines(spec.song.lyrics);
  if (!lines.length) {
    console.log(`${id}: no words (instrumental)`);
    continue;
  }
  const audio = raw && (await has(join(raw, `${id}.mp3`))) ? join(raw, `${id}.mp3`) : join(dir, id, "track.mp3");
  await writeFile(join(work, `${id}.txt`), spec.song.lyrics);
  await exec("docker", ["cp", audio, `${container}:/tmp/jam-lyrics/${id}.mp3`]);
  await exec("docker", ["cp", join(work, `${id}.txt`), `${container}:/tmp/jam-lyrics/${id}.txt`]);
  const t0 = Date.now();
  try {
    await exec("docker", ["exec", container, "python3", "/tmp/jam-lyrics/lyrics-words.py", `/tmp/jam-lyrics/${id}.mp3`, spec.song.language, `/tmp/jam-lyrics/${id}.json`, `/tmp/jam-lyrics/${id}.txt`], { maxBuffer: 1 << 24 });
    await exec("docker", ["cp", `${container}:/tmp/jam-lyrics/${id}.json`, join(work, `${id}.json`)]);
  } catch (e) {
    console.log(`${id}: could not be heard: ${String(e.stderr ?? e.message).split("\n").filter(Boolean).slice(-2).join(" | ")}`);
    continue;
  }
  const heard = JSON.parse(await readFile(join(work, `${id}.json`), "utf8"));
  if (keep) await writeFile(join(keep, `${id}.words.json`), JSON.stringify(heard));
  const timing = alignLines(lines, heard.words, { seconds: heard.seconds });
  const share = timing.matched / Math.max(1, timing.total);
  const times = timing.lines.map((l) => [l.from, l.to]);
  console.log(`${id}: ${heard.words.length} words heard, ${Math.round(share * 100)}% of the written words matched, ${timing.lines.filter((l) => l.heard).length}/${lines.length} lines heard, first ${times[0][0]} s, last ends ${times.at(-1)[1]} s of ${heard.seconds} s (${Math.round((Date.now() - t0) / 1000)} s)`);
  if (write) {
    // (a song of which too little was heard has no timing worth keeping: its lines would be guesses, and the estimate by sections is as good)
    if (share < MIN_SHARE) {
      delete spec.timing;
      console.log(`${id}: only ${Math.round(share * 100)}% matched, under ${MIN_SHARE * 100}%: no timing kept`);
    } else spec.timing = { lines: times, matched: Math.round(share * 100) / 100 };
    await writeFile(file, JSON.stringify(spec, null, 2) + "\n");
  }
}
await rm(work, { recursive: true, force: true });
await exec("docker", ["exec", container, "rm", "-rf", "/tmp/jam-lyrics"]);
