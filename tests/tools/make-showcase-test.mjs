// Makes the small test project Jam ships to prove the seeding works: examples/jam/jam-test-showcase.
// A made-up track (a kick, a snare, hats and a bass at 124 BPM), four light-show clips, four lines of words, and an
// edit with a first draft on it. The real showcase projects replace it: same folder layout, see docs-private/goals/overnight/jam-editor.md.
//   node tests/tools/make-showcase-test.mjs
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { song, wav } from "../synth.ts";
import { normalizeBody, draft } from "../../web/js/edit.js";
import { splitWords } from "../../web/js/lyrics.js";

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, "..", "..");
const id = "jam-test-showcase";
const dir = join(root, "examples", "jam", id);
const media = join(dir, "media");
await rm(dir, { recursive: true, force: true });
await mkdir(media, { recursive: true });

const BPM = 124;
const OFFSET = 0.2;
const SECONDS = 16;
const s = song({ bpm: BPM, offset: OFFSET, seconds: SECONDS, rate: 44100 });
await writeFile(join(media, "track.wav"), wav(s));
await exec("ffmpeg", ["-v", "error", "-y", "-i", join(media, "track.wav"), "-ac", "2", "-b:a", "128k", join(media, "track.mp3")]);
await rm(join(media, "track.wav"));

// four plasmas, a colour way each
const WAYS = [
  "r='128+127*sin(X/37+T*2.1)':g='90+60*sin(Y/29+T*1.3)':b='160+90*sin((X+Y)/53+T*2.9)'",
  "r='140+110*sin((X-Y)/41+T*1.7)':g='60+50*sin(X/23+T*2.6)':b='110+100*sin(Y/35+T*1.1)'",
  "r='200+55*sin(Y/31+T*2.3)':g='150+100*sin((X+Y)/47+T*1.5)':b='60+50*sin(X/27+T*3.1)'",
  "r='70+60*sin(X/33+T*1.9)':g='150+100*sin(Y/25+T*2.4)':b='170+85*sin((X-Y)/45+T*1.2)'",
];
for (const [i, way] of WAYS.entries()) {
  await exec("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", `color=c=black:s=360x640:r=24:d=4.4,format=rgb24,geq=${way},format=yuv420p`, "-c:v", "libx264", "-crf", "27", "-preset", "medium", "-pix_fmt", "yuv420p", "-movflags", "+faststart", join(media, `clip-${i + 1}.mp4`)]);
}
await exec("ffmpeg", ["-v", "error", "-y", "-ss", "1", "-i", join(media, "clip-1.mp4"), "-frames:v", "1", "-vf", "scale=180:-2", "-q:v", "4", join(dir, "thumb.jpg")]);

// what the project says: the files go into data/ under these names
const files = { track: "jamtest-track.mp3", clips: WAYS.map((_, i) => `jamtest-clip-${i + 1}.mp4`) };
const beat = 60 / BPM;
const bar2 = beat * 8;
const cuts = [0, OFFSET + bar2 * 1 - 0.2, OFFSET + bar2 * 2 - 0.2, OFFSET + bar2 * 3 - 0.2, SECONDS].map((t) => Math.round(t * 1000) / 1000);
const shots = WAYS.map((_, i) => ({ from: cuts[i], to: cuts[i + 1], kind: i % 2 ? "broll" : "performance", run: null, clip: { file: files.clips[i], url: `/media/videos/${files.clips[i]}`, duration: 4.4, name: `Light show ${i + 1}` } }));
const lines = [
  { from: 0.9, to: 3.6, text: "Sun in the jar tonight" },
  { from: 4.1, to: 7.5, text: "Dance with me till the morning light" },
  { from: 8.0, to: 11.3, text: "Hands up, hearts up, hold it tight" },
  { from: 12.0, to: 15.5, text: "Sing it loud, we feel alright" },
];
const heard = s.beats.map((t) => Math.round(t * 1000) / 1000);

const cutBody = normalizeBody({ aspect: "9:16", duck: false, fit: "cover", product: "jam", beats: { bpm: BPM, offset: 0, times: heard, down: 0, source: "comfy" } });
cutBody.tracks.find((t) => t.main).items = shots.map((x, i) => ({ id: `j${i + 1}`, shot: i, src: { kind: "video", id: files.clips[i], duration: 4.4, name: x.clip.name }, from: 0, to: Math.round((x.to - x.from) * 1000) / 1000, speed: 1, sound: false, join: "cut" }));
cutBody.tracks.find((t) => t.role === "music").items = [{ id: "track", src: { kind: "audio", id: files.track }, start: 0, from: 0, to: SECONDS }];
cutBody.tracks.find((t) => t.kind === "title").items = lines.map((l, i) => ({ id: `c${i + 1}`, lyric: true, text: l.text, start: l.from, length: Math.round((l.to - l.from) * 100) / 100, style: "karaoke", words: splitWords(l.text, l.to - l.from) }));
cutBody.tracks.find((t) => t.id === "v2").items = [{ id: "st1", src: { kind: "sticker", id: "new" }, start: 0.5, length: 3.2, x: 0.82, y: 0.14, w: 0.24, rot: 12, z: 1 }];
draft(cutBody, SECONDS);

const jamBody = {
  track: { file: files.track, url: `/media/audio/${files.track}`, seconds: SECONDS, name: "Sun in the jar", kind: "upload", bpm: BPM },
  span: { from: 0, to: SECONDS },
  part: { file: files.track, url: `/media/audio/${files.track}`, seconds: SECONDS },
  vocals: null,
  sung: lines.map((l) => ({ from: l.from, to: l.to })),
  lines,
  bpm: BPM,
  beats: heard,
  captions: "karaoke",
  artist: null,
  dance: null,
  style: "",
  every: 2,
  shots,
  looks: {},
  film: null,
  cut: "cut-jam-test-showcase",
};
const project = {
  name: "Sun in the jar (test)",
  thumb: "thumb.jpg",
  jam: jamBody,
  cut: { id: "cut-jam-test-showcase", name: "Sun in the jar (test)", body: cutBody },
  media: [
    { file: "media/track.mp3", to: `audio/${files.track}`, name: "Sun in the jar", kind: "music" },
    ...files.clips.map((f, i) => ({ file: `media/clip-${i + 1}.mp4`, to: `videos/${f}` })),
  ],
};
await writeFile(join(dir, "project.json"), JSON.stringify(project, null, 1));
console.log(`${id}: ${(await exec("du", ["-sh", dir])).stdout.trim()}`);
