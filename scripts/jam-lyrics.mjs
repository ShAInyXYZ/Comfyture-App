// Puts the lyrics of Jam's shipped songs on the times they are sung at, heard from the audio: the vocals are separated and listened to
// (scripts/lyrics-words.py, run inside the owner's ComfyUI container, which has Demucs and faster-whisper), and the written lyrics are
// matched to the words heard (web/js/lyrics-align.js). Each song's `timing` is written into its song.json: { lines: [[from, to], ...]
// (one per sung line of its lyrics), matched }, and the lyrics display, the section map and the Track's markers use it.
//
//   node scripts/jam-lyrics.mjs [<id> ...] [--raw <dir>] [--keep <dir>] [--write]
//   node scripts/jam-lyrics.mjs --jam <video id> [--keep <dir>] [--write]      (a shipped video's own song: examples/jam/<id>/)
//
// (--raw is the folder scripts/jam-songs.mjs made the songs in: <id>.mp3, the whole song before it was made smaller; else the example's
// own track.mp3. --keep saves each song's heard words (<id>.words.json) in a folder, to look into a result. COMFY_CONTAINER names the container, "comfyui" by default. Without --write the result is only printed.)
import { readdir, readFile, writeFile, access, mkdtemp, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { alignLines, alignByVoice, sungLines } from "../web/js/lyrics-align.js";

const exec = promisify(execFile);
const MIN_SHARE = 0.5;
const root = resolve(import.meta.dirname, "..");
const container = process.env.COMFY_CONTAINER ?? "comfyui";
const args = process.argv.slice(2);
const write = args.includes("--write");
const raw = args.includes("--raw") ? resolve(args[args.indexOf("--raw") + 1]) : null;
const jamId = args.includes("--jam") ? args[args.indexOf("--jam") + 1] : null;
const keep = args.includes("--keep") ? resolve(args[args.indexOf("--keep") + 1]) : null;
const only = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--raw" && args[i - 1] !== "--keep" && args[i - 1] !== "--jam");
const dir = join(root, "examples", "songs");
const work = await mkdtemp(join(tmpdir(), "jam-lyrics-"));
const has = (p) => access(p).then(() => true, () => false);

await exec("docker", ["exec", container, "mkdir", "-p", "/tmp/jam-lyrics"]);
await exec("docker", ["cp", join(root, "scripts", "lyrics-words.py"), `${container}:/tmp/jam-lyrics/lyrics-words.py`]);

/** The songs to hear: the shipped songs (examples/songs/<id>/song.json), or with --jam the one song of a shipped video (examples/jam/<id>/project.json). */
async function targets() {
  if (jamId) {
    const file = join(root, "examples", "jam", jamId, "project.json");
    const project = JSON.parse(await readFile(file, "utf8"));
    const track = project.jam.track;
    return [{ id: jamId, file, lyrics: track.lyrics, language: "en", audio: join(root, "examples", "jam", jamId, "track.mp3"), keep: (timing) => (timing ? (track.timing = timing) : delete track.timing, JSON.stringify(project, null, 1) + "\n") }];
  }
  return Promise.all((await readdir(dir)).filter((id) => !only.length || only.includes(id)).sort().map(async (id) => {
    const file = join(dir, id, "song.json");
    const spec = JSON.parse(await readFile(file, "utf8"));
    const audio = raw && (await has(join(raw, `${id}.mp3`))) ? join(raw, `${id}.mp3`) : join(dir, id, "track.mp3");
    return { id, file, lyrics: spec.song.lyrics, language: spec.song.language, audio, keep: (timing) => (timing ? (spec.timing = timing) : delete spec.timing, JSON.stringify(spec, null, 2) + "\n") };
  }));
}

for (const { id, file, lyrics, language, audio, keep: put } of await targets()) {
  const lines = sungLines(lyrics);
  if (!lines.length) {
    console.log(`${id}: no words (instrumental)`);
    continue;
  }
  await writeFile(join(work, `${id}.txt`), lyrics);
  await exec("docker", ["cp", audio, `${container}:/tmp/jam-lyrics/${id}.mp3`]);
  await exec("docker", ["cp", join(work, `${id}.txt`), `${container}:/tmp/jam-lyrics/${id}.txt`]);
  const t0 = Date.now();
  try {
    await exec("docker", ["exec", container, "python3", "/tmp/jam-lyrics/lyrics-words.py", `/tmp/jam-lyrics/${id}.mp3`, language, `/tmp/jam-lyrics/${id}.json`, `/tmp/jam-lyrics/${id}.txt`], { maxBuffer: 1 << 24 });
    await exec("docker", ["cp", `${container}:/tmp/jam-lyrics/${id}.json`, join(work, `${id}.json`)]);
  } catch (e) {
    console.log(`${id}: could not be heard: ${String(e.stderr ?? e.message).split("\n").filter(Boolean).slice(-2).join(" | ")}`);
    continue;
  }
  const heard = JSON.parse(await readFile(join(work, `${id}.json`), "utf8"));
  if (keep) await writeFile(join(keep, `${id}.words.json`), JSON.stringify(heard));
  let timing = alignLines(lines, heard.words, { seconds: heard.seconds, chars: ["ja", "zh", "yue"].includes(language) });
  let share = timing.matched / Math.max(1, timing.total);
  let method = "words";
  // (too little was heard to trust the words, as with sung Japanese: the structure of the lyrics laid over the voice's loudness, the lyrics giving the order and the shape)
  if (share < MIN_SHARE && heard.voice?.length) {
    timing = { lines: alignByVoice(lines, heard.voice, { hop: heard.hop, seconds: heard.seconds }), matched: 0, total: timing.total };
    method = "voice";
  }
  const times = timing.lines.map((l) => [l.from, l.to]);
  console.log(`${id}: by the ${method}: ${heard.words.length} words heard, ${Math.round(share * 100)}% of the written words matched, ${timing.lines.filter((l) => l.heard).length}/${lines.length} lines heard, first ${times[0][0]} s, last ends ${times.at(-1)[1]} s of ${heard.seconds} s (${Math.round((Date.now() - t0) / 1000)} s)`);
  if (write) {
    await writeFile(file, put({ lines: times, matched: Math.round(share * 100) / 100, ...(method === "voice" ? { method } : {}) }));
  }
}
await rm(work, { recursive: true, force: true });
await exec("docker", ["exec", container, "rm", "-rf", "/tmp/jam-lyrics"]);
