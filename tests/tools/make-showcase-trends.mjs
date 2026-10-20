// Makes the music-video projects Jam ships from our dance trends: web/brand/jam/projects/jam-<trend>.
// Each is an edit of the trend's own sound and our crew's version of its dance (web/brand/mixer/trends/<trend>/),
// made the way the editor makes one: the beats heard by Jam's own finder (and nudged onto the picture), the
// dance cut at its bar lines and moved a little (push in, pull out), effects firing on the beats, stickers from
// the library, and the call-outs of the dance written as animated lines. The media are not copied: the project
// names the trend's files (the seeding takes them from web/brand/), so a sound replaced there is the sound here.
// The words on screen are our own (the dance's moves and the performers' names), never the song's lyrics.
//   node tests/tools/make-showcase-trends.mjs            all of them
//   node tests/tools/make-showcase-trends.mjs toc-toc    one
// Needs ffmpeg. If a trend's sound is replaced, run it again: the beats are heard again from the new sound.
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { analyseBeats } from "../../web/js/beats.js";
import { normalizeBody, barTimes } from "../../web/js/edit.js";
import { newFx } from "../../web/js/fx.js";
import { splitWords } from "../../web/js/lyrics.js";

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, "..", "..");
const trends = join(root, "web", "brand", "mixer", "trends");
const r3 = (v) => Math.round(v * 1000) / 1000;
const MOVES = {
  none: null,
  push: { from: { scale: 1, x: 0, y: 0 }, to: { scale: 1.15, x: 0, y: 0 } },
  pull: { from: { scale: 1.15, x: 0, y: 0 }, to: { scale: 1, x: 0, y: 0 } },
};

// ---------------------------------------------------------------- what each project is

// `shots`: where the dance is cut ("bars" are the bar lines found in the sound; a number is a time), what each shot is, how it moves.
// `lines`: the call-outs: [from, to, text, style, { x, y, size, color }]. `fx`: [kind, from, to, { every, intensity, dur }].
// `stickers`: [id, from, to, x, y, w, rot]. Times are the film's, which are the dance's: the picture is time-aligned with the sound.
const SPECS = {
  "toc-toc": {
    name: "Toc Toc",
    crew: "josie",
    hint: 0,
    // the finder's beats land a little after the foot meets the floor in the picture: the global offset moves them onto it
    offset: -0.05,
    thumb: 1.55,
    shots: [
      { to: "bar1", kind: "dance", move: "none" },
      { to: "bar2", kind: "dance", move: "push" },
      { to: "bar3", kind: "dance", move: "pull" },
      { to: "end", kind: "dance", move: "push" },
    ],
    fx: [
      ["zoom", 0, 99, { every: 1, intensity: 0.45, dur: 0.2 }],
      ["flash", 1.5, 99, { every: 4, intensity: 0.45, dur: 0.14 }],
      // a shake where the dancer knocks: the first knock, the knock at the head on the way, the last one
      ["shake", 1.3, 2.0, { every: 1, intensity: 0.7, dur: 0.3 }],
      ["shake", 5.65, 6.25, { every: 1, intensity: 0.7, dur: 0.3 }],
      ["shake", 7.35, 7.8, { every: 0.5, intensity: 0.7, dur: 0.3 }],
      ["hue", 8.2, 99, { every: 1, intensity: 0.55, dur: 0.4 }],
    ],
    stickers: [
      ["notes", 0.25, 1.9, 0.2, 0.2, 0.2, -10],
      ["bolt", 1.3, 2.1, 0.66, 0.3, 0.17, 10],
      ["wow", 8.1, 9.7, 0.78, 0.22, 0.3, 8],
    ],
    lines: [
      [0.3, 1.26, "HOP HOP", "pop", { y: 0.1 }],
      [1.3, 2.3, "TOC TOC", "bounce", { y: 0.1 }],
      [4.99, 5.7, "HEEL KICKS", "pop", { y: 0.1 }],
      [5.74, 6.6, "TOC TOC", "bounce", { y: 0.1 }],
      [7.2, 7.95, "TOC!", "bounce", { y: 0.1, size: 0.12 }],
      [8.55, 9.8, "TA-DA", "pop", { y: 0.1, size: 0.12 }],
    ],
  },
  "hotel-lobby": {
    name: "Hotel Lobby",
    crew: "dre",
    hint: 128,
    offset: 0,
    thumb: 3.2,
    // the shots of our version: a wide one, then four at the hanging microphone (the picture's own cuts)
    shots: [
      { to: 2.583, kind: "broll", move: "none" },
      { to: 4.958, kind: "performance", move: "push" },
      { to: 7.042, kind: "performance", move: "push" },
      { to: 10.375, kind: "performance", move: "pull" },
      { to: 14.208, kind: "performance", move: "push" },
      { to: "end", kind: "performance", move: "none" },
    ],
    fx: [
      ["zoom", 2.6, 99, { every: 2, intensity: 0.4, dur: 0.22 }],
      // a flash on each cut of the picture
      ["flash", 2.583, 3.4, { every: 0, intensity: 0.5, dur: 0.14 }],
      ["flash", 4.958, 5.8, { every: 0, intensity: 0.5, dur: 0.14 }],
      ["flash", 7.042, 7.9, { every: 0, intensity: 0.5, dur: 0.14 }],
      ["flash", 10.375, 11.2, { every: 0, intensity: 0.5, dur: 0.14 }],
      ["flash", 14.208, 15.0, { every: 0, intensity: 0.5, dur: 0.14 }],
      // Theo points at the camera on the beat
      ["shake", 5.0, 7.0, { every: 1, intensity: 0.45, dur: 0.28 }],
    ],
    stickers: [
      ["live", 0, 18, 0.2, 0.07, 0.22, 0],
      ["crown", 2.7, 4.6, 0.3, 0.115, 0.17, -10],
      ["mic", 7.2, 9.6, 0.82, 0.22, 0.17, 12],
      ["fire", 15.0, 17.8, 0.82, 0.2, 0.2, 8],
    ],
    lines: [
      [0.25, 1.25, "DRE", "pop", { x: 0.3, y: 0.12, size: 0.1 }],
      [1.3, 2.35, "THEO", "pop", { x: 0.7, y: 0.12, size: 0.1 }],
      [2.75, 4.7, "HOTEL LOBBY", "karaoke", { y: 0.91, size: 0.1 }],
      [14.7, 15.8, "SHHH", "bounce", { y: 0.5, size: 0.16 }],
      [16.9, 17.95, "SALUTE", "pop", { y: 0.9, size: 0.1 }],
    ],
  },
  ramalama: {
    name: "Ramalama",
    crew: "margot",
    hint: 0,
    offset: 0,
    thumb: 9.0,
    // our version is one handheld take whose whip up to the faces is in the picture: it is kept in the clips, not made again
    shots: [
      { to: 3.708, kind: "broll", move: "none" },
      { to: 7.583, kind: "broll", move: "none" },
      { to: 11.292, kind: "performance", move: "none" },
      { to: "end", kind: "dance", move: "none" },
    ],
    fx: [
      ["zoom", 0, 7.4, { every: 2, intensity: 0.3, dur: 0.22 }],
      // the reveal: a flash and a swell as the camera lands on the faces, then colour on the beats
      ["flash", 7.55, 8.4, { every: 0, intensity: 0.8, dur: 0.22 }],
      ["zoom", 7.55, 8.4, { every: 0, intensity: 1.0, dur: 0.35 }],
      ["zoom", 8.4, 99, { every: 2, intensity: 0.45, dur: 0.22 }],
      ["hue", 7.6, 11.3, { every: 2, intensity: 0.45, dur: 0.4 }],
      ["shake", 3.0, 7.3, { every: 2, intensity: 0.25, dur: 0.3 }],
    ],
    stickers: [
      ["sparkles", 7.7, 10.4, 0.2, 0.18, 0.3, -8],
      ["crown", 8.0, 10.6, 0.5, 0.15, 0.2, 0],
      ["star", 12.0, 14.6, 0.84, 0.2, 0.18, 14],
    ],
    lines: [
      [7.8, 9.0, "RAMA LAMA", "pop", { y: 0.1, size: 0.11 }],
      [9.2, 10.3, "MARGOT", "pop", { x: 0.5, y: 0.82, size: 0.1 }],
      [10.4, 11.3, "JOSIE", "pop", { x: 0.2, y: 0.82, size: 0.1 }],
      [11.4, 12.4, "IVY", "pop", { x: 0.8, y: 0.82, size: 0.1 }],
      [13.2, 14.9, "WAVE", "bounce", { y: 0.1, size: 0.12 }],
    ],
  },
};

// ---------------------------------------------------------------- making one

async function sound(id) {
  const rate = 22050;
  const buf = execFileSync("ffmpeg", ["-nostdin", "-v", "error", "-i", join(trends, id, "sound.m4a"), "-vn", "-ac", "1", "-ar", String(rate), "-f", "f32le", "-"], { maxBuffer: 1 << 28 });
  return { samples: new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4), rate };
}

async function make(id) {
  const spec = SPECS[id];
  const folder = join(root, "web", "brand", "jam", "projects", `jam-${id}`);
  await mkdir(folder, { recursive: true });
  const recipe = JSON.parse(await readFile(join(trends, id, "recipe.json"), "utf8"));
  const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,width,height,duration", "-of", "json", join(trends, id, "preview.mp4")]).toString());
  const size = probe.streams.find((s) => s.codec_type === "video");
  const seconds = r3(size.duration);
  const song = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "json", join(trends, id, "sound.m4a")]).toString());
  const trackSeconds = r3(song.format.duration);

  // the beats, heard by the finder the editor uses
  const { samples, rate } = await sound(id);
  const found = analyseBeats(samples, rate, { bpm: spec.hint });
  const beats = { bpm: r3(found.bpm), offset: spec.offset, times: found.times.map(r3), down: found.down, source: "web", sure: r3(found.confidence) };
  console.log(`${id}: ${beats.bpm} BPM, ${beats.times.length} beats from ${beats.times[0]} s, bar line on beat ${beats.down}, sure ${beats.sure}, offset ${beats.offset}`);

  // the names the files go by in the app's folders
  const files = { sound: `trend-${id}-sound.m4a`, dance: `trend-${id}-dance.mp4`, artist: `crew-${spec.crew}.png` };
  const crewPng = join(root, "web", "brand", "mixer", "crew", `${spec.crew}.png`);
  const artistSize = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=width,height", "-of", "json", crewPng]).toString()).streams[0];

  // the shots: the dance cut at its bar lines (or where the picture is cut), each a stretch of the dance at its own time
  const body = normalizeBody({ aspect: "9:16", duck: false, fit: "cover", product: "jam", beats });
  const bars = barTimes(body).filter((t) => t > 1 && t < seconds - 1);
  const at = (to) => (to === "end" ? seconds : typeof to === "number" ? to : r3(bars[Number(String(to).replace("bar", "")) - 1]));
  const cuts = [0, ...spec.shots.map((s) => at(s.to))];
  const shots = spec.shots.map((s, i) => ({
    from: cuts[i],
    to: cuts[i + 1],
    kind: s.kind,
    run: null,
    clip: { file: files.dance, url: `/media/videos/${files.dance}`, duration: seconds, name: spec.name, from: cuts[i] },
  }));
  console.log(`${id}: shots at ${cuts.join(", ")}`);

  const dance = { file: files.dance, url: `/media/videos/${files.dance}`, duration: seconds, width: size.width, height: size.height, synced: true };
  const main = body.tracks.find((t) => t.main);
  main.items = shots.map((s, i) => ({
    id: `j${i + 1}`,
    shot: i,
    src: { kind: "video", id: files.dance, duration: seconds, name: spec.name },
    from: s.from,
    to: s.to,
    speed: 1,
    sound: false,
    join: "cut",
    ...(MOVES[spec.shots[i].move] ? { motion: structuredClone(MOVES[spec.shots[i].move]) } : {}),
  }));
  body.tracks.find((t) => t.role === "music").items = [{ id: "track", src: { kind: "audio", id: files.sound }, start: 0, from: 0, to: trackSeconds }];
  body.tracks.find((t) => t.id === "fx").items = spec.fx.map(([kind, from, to, extra]) => newFx(kind, from, Math.min(to, seconds) - from, extra));
  body.tracks.find((t) => t.id === "v2").items = spec.stickers.map(([sticker, from, to, x, y, w, rot], i) => ({ id: `st${i + 1}`, src: { kind: "sticker", id: sticker }, start: from, length: r3(to - from), x, y, w, rot, z: i + 1 }));
  const lines = spec.lines.map(([from, to, text]) => ({ from, to, text }));
  body.tracks.find((t) => t.kind === "title").items = spec.lines.map(([from, to, text, style, look], i) => ({ id: `c${i + 1}`, lyric: true, text, start: from, length: r3(to - from), style, words: splitWords(text, to - from), ...look }));

  const jam = {
    track: { file: files.sound, url: `/media/audio/${files.sound}`, seconds: trackSeconds, name: spec.name, kind: "trend", bpm: beats.bpm },
    span: { from: 0, to: trackSeconds },
    part: { file: files.sound, url: `/media/audio/${files.sound}`, seconds: trackSeconds },
    vocals: null,
    sung: [],
    lines,
    bpm: beats.bpm,
    down: beats.down,
    sure: beats.sure,
    beats: beats.times,
    captions: "pop",
    artist: { file: files.artist, url: `/media/photos/${files.artist}`, width: artistSize.width, height: artistSize.height, crew: spec.crew },
    dance,
    style: "",
    every: 2,
    shots,
    looks: {},
    film: null,
    cut: `cut-jam-${id}`,
    trend: { id, name: spec.name },
  };
  const project = {
    name: spec.name,
    thumb: `brand/jam/projects/jam-${id}/thumb.jpg`,
    jam,
    cut: { id: `cut-jam-${id}`, name: spec.name, body },
    media: [
      { file: `web/brand/mixer/trends/${id}/sound.m4a`, to: `audio/${files.sound}`, name: `${spec.name} sound`, kind: "music" },
      { file: `web/brand/mixer/trends/${id}/preview.mp4`, to: `videos/${files.dance}` },
      { file: `web/brand/mixer/crew/${spec.crew}.png`, to: `photos/${files.artist}` },
    ],
  };
  await exec("ffmpeg", ["-v", "error", "-y", "-ss", String(spec.thumb), "-i", join(trends, id, "preview.mp4"), "-frames:v", "1", "-vf", "scale=180:-2", "-q:v", "4", join(folder, "thumb.jpg")]);
  await writeFile(join(folder, "project.json"), JSON.stringify(project, null, 1));
  console.log(`${id}: ${spec.fx.length} effects, ${spec.stickers.length} stickers, ${spec.lines.length} lines of words; recipe ${recipe.seconds} s, picture ${seconds} s, sound ${trackSeconds} s`);
}

for (const id of process.argv.length > 2 ? process.argv.slice(2) : Object.keys(SPECS)) {
  if (!SPECS[id]) throw new Error(`No such trend here: ${id}`);
  await make(id);
}
