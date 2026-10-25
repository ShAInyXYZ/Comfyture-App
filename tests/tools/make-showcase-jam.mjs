// Makes the project.json of the music videos Jam ships (examples/jam/<id>/), from the media already in each folder: our own songs
// (ACE-Step, made in the app), our cast's own LTX-2.5 takes, and still pictures of our cast (Codex's GPT Image) moved as clips
// with ffmpeg. Each is made the way the editor makes one: the beats heard by Jam's own finder, the shots cut on them, the words
// timed (heard by Whisper where they are sung, our own call-outs where the song has none), effects and stickers on the beat.
//   node tests/tools/make-showcase-jam.mjs              all of them
//   node tests/tools/make-showcase-jam.mjs <id> ...     some
// A film.mp4 in a folder (the edit rendered by the app's own Export) becomes the video's finished film. Needs ffmpeg.
// Raise REV when a project is made again for good: the seeding then refreshes the copies nobody has touched.
//
// The media were made once, before this: the songs cut from our own ACE-Step songs (MP3, 128 kbps; the whole 3-minute song at 80),
// Moonlit Oolong Walk's stems separated by Demucs (htdemucs) and its words timed by Whisper (large-v3-turbo, word times checked
// against the vocals' own onsets), both run locally; the stills drawn by Codex's GPT Image from our cast's pictures, then moved by a
// 9:16 window panning or pushing over them (frames drawn with sub-pixel accuracy, H.264); the takes copied from the take log with
// their sound left out (Taro's cut from its square to 9:16 around him); film.mp4 the app's own Export of the edit, made smaller.
import { writeFile, access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { analyseBeats, findDrop, findLoud } from "../../web/js/beats.js";
import { normalizeBody } from "../../web/js/edit.js";
import { newFx } from "../../web/js/fx.js";
import { splitWords } from "../../web/js/lyrics.js";

const root = resolve(import.meta.dirname, "..", "..");
const REV = 1;
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
const has = (p) => access(p).then(() => true, () => false);

/** A sound as samples, mono (or its left channel, as the browser's singing finder reads it). */
function pcm(file, rate, { left = false } = {}) {
  const buf = execFileSync("ffmpeg", ["-nostdin", "-v", "error", "-i", file, "-vn", ...(left ? ["-af", "pan=mono|c0=c0"] : ["-ac", "1"]), "-ar", String(rate), "-f", "f32le", "-"], { maxBuffer: 1 << 29 });
  return new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
}
const seconds = (file) => r2(Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString()));
const size = (file) => {
  const [width, height] = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", file]).toString().trim().split(",").map(Number);
  return { width, height };
};

/** Where the vocals sing, as jam.js finds it (singing()): loud stretches a twentieth of a second at a time, short gaps closed. */
function singing(file) {
  const rate = 48000;
  const d = pcm(file, rate, { left: true });
  const hop = Math.round(rate / 20);
  const rms = [];
  for (let i = 0; i + hop <= d.length; i += hop) {
    let sum = 0;
    for (let k = i; k < i + hop; k += 4) sum += d[k] * d[k];
    rms.push(Math.sqrt(sum / (hop / 4)));
  }
  const loud = [...rms].sort((x, y) => x - y)[Math.floor(rms.length * 0.95)] ?? 0;
  const floor = Math.max(0.01, loud * 0.18);
  const spans = [];
  rms.forEach((v, i) => {
    if (v < floor) return;
    const t = i / 20;
    const last = spans.at(-1);
    if (last && t - last.to <= 0.5) last.to = t + 0.05;
    else spans.push({ from: t, to: t + 0.05 });
  });
  return spans.filter((x) => x.to - x.from >= 0.4).map((x) => ({ from: r2(x.from), to: r2(x.to) }));
}

// ---------------------------------------------------------------- what each video is

// Times are the part's (seconds from where the part starts in the song). `cuts`: where each shot ends. A shot is a clip of the folder
// (`at`: where in it the shot starts). `lines`: [text, [[word, from, to]...]] for sung words (their times in the song), or
// [text, from, to] for a call-out. `fx`: [kind, from, to, { every, intensity, dur }]. `stickers`: [id, from, to, x, y, w, rot].
const SPECS = {
  "jam-walk-moonlit-oolong": {
    name: "Moonlit Oolong Walk",
    about:
      "Taro, the baby sea otter who sings for Little Otter Tea, sings the chorus of Moonlit Oolong Walk, our own dreamy city-pop song made in the app with ACE-Step 1.5 (3 minutes; the part used is 86.6 to 111.6 s: the last line of the pre-chorus and the chorus). " +
      "Shot 4 is a real LTX-2.5 take of him, lip-synced to that very stretch of the song (the take made for the song's video cover). The six other shots are still pictures of him (Codex's GPT Image, from the cover) moved with ffmpeg (push-ins, pans, a tilt): animated stills, not footage; Roll a shot with LTX-2.5 to make it real. " +
      "The stems and the words' times were heard the way Jam hears them, with Demucs and Whisper, run on our own machine for free; the cuts and the effects are on the beats Jam's own finder heard. The film is the edit as the app exports it.",
    track: { file: "track.mp3", name: "Moonlit Oolong Walk", prompt: "dreamy city-pop, indie-pop, nostalgic warm late-night mood, gentle bouncy groove, glossy electric piano, funky clean guitar, round slap bass, soft synth pads, light live drums, soft female-leaning lead vocal, airy harmony backing vocals, no autotune, raw human voice, wide and glossy", lyrics: "[Pre-Chorus]\nTwist the cap, a little sip\nCool and golden on my lip\nAll my worries start to slip\n[Chorus]\nMoonlit oolong, shining bright\nWalking home in silver light\nMoonlit oolong, cold and sweet\nDancing on my tiny feet" },
    span: [86.55, 111.608],
    // the beats of the whole song (the finder hears a part's first bar better with the song before it), and the bar lines it heard there
    beatsFrom: "track",
    stems: true,
    artist: { file: "artist.jpg", name: "Taro" },
    band: [],
    look: { kind: "broll", file: "look.jpg" },
    style: "a sleepy seaside town at night under a huge full moon: paper lanterns, fireflies, soft pink and teal neon, the wet boards shining",
    captions: { style: "karaoke", y: 0.8, size: 0.09, color: "#FFFFFF", hi: "#FF8FE3" },
    shots: [
      { clip: "bottle.mp4", kind: "broll", name: "The bottle of oolong" },
      { clip: "promenade.mp4", kind: "broll", name: "Along the promenade" },
      { clip: "moon.mp4", kind: "broll", name: "The moon over the bay" },
      // the take is lip-synced to the song from 96.0 s: the shot starts at its own time in it
      { clip: "take.mp4", kind: "performance", name: "Taro sings (LTX-2.5)", at: 86.55 + 9.628 - 96.0 },
      { clip: "vending.mp4", kind: "broll", name: "The vending machine" },
      { clip: "dance.mp4", kind: "broll", name: "Dancing on the boards" },
      { clip: "pier.mp4", kind: "broll", name: "At the end of the pier", fadeOut: 0.9 },
    ],
    cuts: [2.767, 7.341, 9.628, 15.34, 18.777, 23.34, 25.058],
    lines: [
      ["Cool and golden on my lip", [["Cool", 86.97, 87.24], ["and", 87.24, 87.48], ["golden", 87.48, 87.82], ["on", 87.82, 88.24], ["my", 88.24, 88.52], ["lip", 88.52, 88.9]]],
      ["All my worries start to slip", [["All", 89.27, 89.74], ["my", 89.74, 90.32], ["worries", 90.32, 91.39], ["start", 91.57, 91.96], ["to", 91.96, 92.65], ["slip", 92.75, 93.13]]],
      ["Moonlit oolong, shining bright", [["Moonlit", 93.85, 94.69], ["oolong,", 94.89, 95.55], ["shining", 95.62, 96.76], ["bright", 96.76, 98.13]]],
      ["Walking home in silver light", [["Walking", 98.35, 99.2], ["home", 99.2, 99.78], ["in", 99.78, 100.57], ["silver", 100.73, 101.48], ["light", 101.48, 102.67]]],
      ["Moonlit oolong, cold and sweet", [["Moonlit", 102.99, 103.87], ["oolong,", 104.03, 105.15], ["cold", 105.27, 105.88], ["and", 105.88, 106.15], ["sweet", 106.27, 107.43]]],
      ["Dancing on my tiny feet", [["Dancing", 107.59, 108.4], ["on", 108.4, 108.86], ["my", 108.86, 109.79], ["tiny", 109.87, 110.85], ["feet", 111.03, 111.59]]],
    ],
    fx: [
      ["flash", 7.341, 7.9, { every: 0, intensity: 0.35, dur: 0.3 }],
      ["zoom", 7.341, 18.777, { every: 4, intensity: 0.3, dur: 0.32 }],
      ["zoom", 18.777, 23.34, { every: 2, intensity: 0.3, dur: 0.26 }],
    ],
    stickers: [
      ["notes", 0.45, 2.7, 0.22, 0.17, 0.2, -10],
      ["sparkles", 7.4, 9.6, 0.78, 0.17, 0.26, 8],
      ["heart", 19.0, 23.2, 0.2, 0.2, 0.16, -10],
    ],
    musicFade: 0.6,
  },
  "jam-three-kittens": {
    name: "Three Kittens",
    about:
      "Praline, Sesame and Meringue, Mixer's cats, as a very serious street crew for seven seconds: Three Kittens track is our own punchy electronic instrumental made in the app with ACE-Step 1.5 (its music runs 7 s, then the song is silent, so the part is its first 7.5 s). " +
      "Shots 4 and 7 are real LTX-2.5 takes of Meringue, made in Mixer for the Face Dance trend (her face keeps that trend's beat; their sound is left out); the others are still pictures of the three (Codex's GPT Image, from their pictures) moved with ffmpeg: animated stills, not footage; Roll a shot with LTX-2.5 to make it real. " +
      "A cut on every other beat Jam's finder heard (the bar line set on the kick), our own call-outs as comic captions, a zoom on every beat, a flash on every bar, shakes and a colour hit at the end. The film is the edit as the app exports it.",
    track: { file: "track.mp3", name: "Three Kittens track", prompt: "punchy electronic dance, mock-serious street crew, kick, clap, rubbery synth bass, short synth accents, an original catchy instrumental for a short video", lyrics: "", bpm: 128 },
    span: [0, 7.552],
    beatsFrom: "part",
    // the finder hears the bar start a beat late: the low kick lands on its first beat
    down: 0,
    stems: false,
    artist: { crew: "praline" },
    band: [{ crew: "sesame", name: "Sesame", role: "dancer" }, { crew: "meringue", name: "Meringue", role: "dancer" }],
    look: { kind: "broll", file: "look.jpg" },
    style: "a lilac music-video studio, a glossy pale floor, soft light and haze: a mock-serious street crew",
    captions: { style: "comic", y: 0.8, size: 0.1 },
    shots: [
      { clip: "pose.mp4", kind: "broll", name: "The pose" },
      { clip: "praline.mp4", kind: "broll", name: "Praline" },
      { clip: "sesame.mp4", kind: "broll", name: "Sesame" },
      { clip: "meringue-1.mp4", kind: "broll", name: "Meringue (LTX-2.5)" },
      { clip: "paws.mp4", kind: "broll", name: "Paws up" },
      { clip: "walk.mp4", kind: "broll", name: "The walk" },
      { clip: "meringue-2.mp4", kind: "broll", name: "Meringue keeps the beat (LTX-2.5)" },
      { clip: "finale.mp4", kind: "broll", name: "The final pose" },
    ],
    cuts: [0.989, 1.927, 2.864, 3.802, 4.74, 5.677, 6.146, 7.552],
    lines: [
      ["THREE KITTENS", 0.06, 0.96],
      ["THE BOSS", 0.99, 1.9],
      ["THE SIDE-EYE", 1.93, 2.84],
      ["THE BABY", 2.87, 3.78],
      ["PAWS UP", 3.8, 4.72],
      ["THE CREW", 4.74, 6.12],
      ["OKAY. CUTE.", 6.15, 7.55],
    ],
    fx: [
      ["zoom", 0, 6.146, { every: 1, intensity: 0.4, dur: 0.18 }],
      ["flash", 1.927, 6.146, { every: 4, intensity: 0.5, dur: 0.14 }],
      ["shake", 1.927, 2.4, { every: 1, intensity: 0.6, dur: 0.3 }],
      ["shake", 3.802, 4.3, { every: 1, intensity: 0.7, dur: 0.3 }],
      ["hue", 6.146, 7.552, { every: 2, intensity: 0.3, dur: 0.4 }],
    ],
    stickers: [
      ["crown", 0.99, 1.92, 0.5, 0.1, 0.22, -6],
      ["heart", 2.87, 3.78, 0.78, 0.2, 0.16, 10],
      ["bolt", 3.8, 4.72, 0.8, 0.3, 0.17, 12],
      ["wow", 6.2, 7.5, 0.76, 0.16, 0.3, 8],
    ],
    musicFade: 0,
  },
  "jam-la-calabaza": {
    name: "La Calabaza",
    about:
      "Pickle, Jam's band leader, leads a night parade with a glowing pumpkin (la calabaza), Praline on the maracas and Sesame on the drum (Mochi tags along with a cowbell). La Calabaza track is our own guaracha-style instrumental made in the app with ACE-Step 1.5 (its music runs 13 s; the part stops where it does). " +
      "Every shot is a still picture of our cast (Codex's GPT Image, from their pictures) moved with ffmpeg: animated stills, not footage; Roll a shot with LTX-2.5 to make it real. " +
      "A cut on every bar Jam's finder heard (the bar line set on the kick), faster cuts in the last bars, our own call-outs as bold stacked captions, a zoom on every beat, a flash on every bar, a shake on ¡Vamos! and a colour hit at the end. The film is the edit as the app exports it.",
    track: { file: "track.mp3", name: "La Calabaza track", prompt: "guaracha-inspired dance, playful night parade, four-on-floor kick, Latin hand percussion, bright synth stab, an original catchy instrumental for a short video", lyrics: "", bpm: 132 },
    span: [0, 13.104],
    beatsFrom: "part",
    // the finder puts the bar line on the clap: the low kick lands a beat later
    down: 1,
    stems: false,
    artist: { brand: "web/brand/cast/pickle.png", to: "cast-pickle.png", name: "Pickle" },
    band: [{ crew: "praline", name: "Praline", role: "dancer" }, { crew: "sesame", name: "Sesame", role: "drummer" }],
    look: { kind: "broll", file: "look.jpg" },
    style: "a night parade through an old town square: strings of warm lights, paper flags, glowing pumpkin lanterns, confetti, a full moon",
    captions: { style: "stack", y: 0.78, size: 0.095 },
    shots: [
      { clip: "square.mp4", kind: "broll", name: "The square" },
      { clip: "pickle.mp4", kind: "broll", name: "Pickle leads" },
      { clip: "band.mp4", kind: "broll", name: "The band" },
      { clip: "face.mp4", kind: "broll", name: "Pickle and the pumpkin" },
      { clip: "step.mp4", kind: "broll", name: "The side step" },
      { clip: "pickle-close.mp4", kind: "broll", name: "Pickle, closer" },
      { clip: "band-close.mp4", kind: "broll", name: "The band, closer" },
      { clip: "finale.mp4", kind: "broll", name: "The leap" },
    ],
    cuts: [2.286, 4.089, 5.892, 7.695, 9.498, 10.4, 11.301, 13.104],
    lines: [
      ["¡LA CALABAZA!", 0.48, 2.22],
      ["PICKLE LEADS", 2.29, 4.02],
      ["THE BAND", 4.09, 5.82],
      ["¡VAMOS!", 5.89, 7.62],
      ["SIDE STEP", 7.7, 9.43],
      ["¡OTRA VEZ!", 9.5, 11.23],
      ["¡CALABAZA!", 11.3, 13.1],
    ],
    fx: [
      ["zoom", 0.483, 13.104, { every: 1, intensity: 0.35, dur: 0.2 }],
      ["flash", 2.286, 13.104, { every: 4, intensity: 0.4, dur: 0.14 }],
      ["shake", 5.892, 6.8, { every: 1, intensity: 0.6, dur: 0.3 }],
      ["hue", 11.301, 13.104, { every: 2, intensity: 0.3, dur: 0.4 }],
    ],
    stickers: [
      ["notes", 0.3, 2.2, 0.2, 0.2, 0.2, -10],
      ["star", 5.9, 7.6, 0.8, 0.2, 0.16, 12],
      ["sparkles", 9.5, 11.2, 0.22, 0.24, 0.24, -8],
      ["wow", 11.4, 13.0, 0.76, 0.17, 0.3, 8],
    ],
    musicFade: 0.3,
  },
};

// ---------------------------------------------------------------- making one

const CREW_SIZE = { width: 369, height: 389 };

async function make(id) {
  const spec = SPECS[id];
  const folder = join(root, "examples", "jam", id);
  const own = (f) => join(folder, f);
  const named = (f) => `${id}-${f}`;
  const media = [];
  const put = (file, shelf, extra = {}) => (media.push({ file, to: `${shelf}/${named(file)}`, ...extra }), { file: named(file), url: `/media/${shelf}/${named(file)}` });

  // the song and the part of it the video uses
  const [A, B] = spec.span;
  const trackFile = put(spec.track.file, "audio", { name: spec.track.name, kind: "music" });
  const trackSeconds = seconds(own(spec.track.file));
  const t8 = pcm(own(spec.track.file), 8000);
  const track = { ...trackFile, seconds: trackSeconds, name: spec.track.name, kind: "made", prompt: spec.track.prompt, lyrics: spec.track.lyrics, ...(spec.track.bpm ? { bpm: spec.track.bpm } : {}), drop: findDrop(t8, 8000), loud: findLoud(t8, 8000, 15) };
  const partFile = put("part.mp3", "audio", { name: `${spec.track.name} · part`, kind: "part" });
  const part = { ...partFile, seconds: seconds(own("part.mp3")) };

  // the beats, heard by the finder the editor uses (of the part, or of the whole song and then the part's stretch of them)
  let bpm;
  let times;
  let down;
  let sure;
  if (spec.beatsFrom === "track") {
    const found = analyseBeats(pcm(own(spec.track.file), 22050), 22050, { bpm: spec.track.bpm ?? 0 });
    const inPart = found.times.map((t, k) => ({ t: r3(t - A), k })).filter(({ t }) => t >= 0 && t < B - A);
    times = inPart.map(({ t }) => t);
    down = inPart.findIndex(({ k }) => (((k - found.down) % 4) + 4) % 4 === 0);
    bpm = r3(found.bpm);
    sure = r2(found.confidence);
  } else {
    const found = analyseBeats(pcm(own("part.mp3"), 22050), 22050, { bpm: spec.track.bpm ?? 0 });
    times = found.times.map(r3);
    down = spec.down ?? found.down;
    bpm = r3(found.bpm);
    sure = r2(found.confidence);
  }
  console.log(`${id}: ${bpm} BPM, ${times.length} beats from ${times[0]} s, bar line on beat ${down}, sure ${sure}`);

  // the stems (the vocals the lips follow, and the rest), where the vocals sing
  let vocals = null;
  let stems = null;
  let sung = [];
  if (spec.stems) {
    stems = {};
    for (const s of ["vocals", "drums", "bass", "other"]) stems[s] = put(`stem-${s}.mp3`, "audio", { name: `${spec.track.name} · part ${s}`, kind: s === "vocals" ? "voice" : "stem" });
    vocals = stems.vocals;
    sung = singing(own("stem-vocals.mp3"));
  }

  // who performs
  const crewPic = (crew) => (media.push({ file: `web/brand/mixer/crew/${crew}.png`, to: `photos/crew-${crew}.png` }), { file: `crew-${crew}.png`, url: `/media/photos/crew-${crew}.png`, ...CREW_SIZE });
  let artist;
  if (spec.artist.crew) artist = { ...crewPic(spec.artist.crew), crew: spec.artist.crew };
  else if (spec.artist.brand) {
    media.push({ file: spec.artist.brand, to: `photos/${spec.artist.to}` });
    artist = { file: spec.artist.to, url: `/media/photos/${spec.artist.to}`, ...size(join(root, spec.artist.brand)), name: spec.artist.name };
  } else artist = { ...put(spec.artist.file, "photos"), ...size(own(spec.artist.file)), name: spec.artist.name };
  const band = spec.band.map((p) => ({ ...crewPic(p.crew), name: p.name, crew: p.crew, role: p.role, show: true }));
  const looks = { [spec.look.kind]: put(spec.look.file, "photos") };
  if (spec.shots.some((s) => s.kind === "performance")) looks.performance = { file: artist.file, url: artist.url };

  // the shots: a clip each, cut where the spec says
  const clips = new Map();
  for (const s of spec.shots) if (!clips.has(s.clip)) clips.set(s.clip, { ...put(s.clip, "videos"), duration: seconds(own(s.clip)) });
  const edges = [0, ...spec.cuts];
  const shots = spec.shots.map((s, i) => {
    const c = clips.get(s.clip);
    return { from: edges[i], to: edges[i + 1], kind: s.kind, run: null, clip: { file: c.file, url: c.url, duration: c.duration, name: s.name, from: r3(s.at ?? 0) } };
  });

  // the words: lines, each word timed from where its line starts
  const lines = spec.lines.map((l, i) => {
    if (Array.isArray(l[1])) {
      const [text, words] = l;
      const from = r2(words[0][1] - A);
      const next = spec.lines[i + 1];
      const nextFrom = next ? (Array.isArray(next[1]) ? next[1][0][1] - A : next[1]) : B - A;
      const to = r2(Math.min(nextFrom - 0.06, words.at(-1)[2] - A + 0.9));
      return { from, to, text, words: words.map(([w, a, b]) => ({ text: w, from: r2(a - A - from), to: r2(Math.min(b - A, to) - from) })) };
    }
    const [text, from, to] = l;
    return { from, to, text, words: splitWords(text, r2(to - from)) };
  });

  // the edit: the editor's own body, filled as Jam fills it
  const beats = { bpm, offset: 0, times, down, source: "web", sure };
  const body = normalizeBody({ aspect: "9:16", duck: false, fit: "cover", product: "jam", beats });
  body.tracks.find((t) => t.main).items = shots.map((s, i) => {
    const at = s.clip.from;
    const extra = spec.shots[i].fadeOut ? { fadeOut: spec.shots[i].fadeOut } : {};
    return { id: `j${i + 1}`, shot: i, src: { kind: "video", id: s.clip.file, duration: s.clip.duration, name: s.clip.name }, from: at, to: r3(at + s.to - s.from), speed: 1, sound: false, join: "cut", ...extra };
  });
  body.tracks.find((t) => t.role === "music").items = [{ id: "track", src: { kind: "audio", id: part.file, duration: part.seconds, name: spec.track.name }, start: 0, from: 0, to: part.seconds, ...(spec.musicFade ? { fadeOut: spec.musicFade } : {}) }];
  body.tracks.find((t) => t.id === "fx").items = spec.fx.map(([kind, from, to, extra], i) => ({ ...newFx(kind, from, r3(to - from), extra), id: `fx${i + 1}` }));
  body.tracks.find((t) => t.id === "v2").items = spec.stickers.map(([sticker, from, to, x, y, w, rot], i) => ({ id: `st${i + 1}`, src: { kind: "sticker", id: sticker }, start: from, length: r3(to - from), x, y, w, rot, z: i + 1 }));
  const { y, size: em, color, hi } = spec.captions;
  const look = { y, size: em, ...(color ? { color } : {}), ...(hi ? { hi } : {}) };
  body.tracks.find((t) => t.kind === "title").items = lines.map((l, i) => ({ id: `c${i + 1}`, lyric: true, text: l.text, start: l.from, length: r2(l.to - l.from), style: spec.captions.style, words: l.words, ...look }));

  // the finished film, when the edit was rendered (the app's Export) and kept in the folder
  let film = null;
  if (await has(own("film.mp4"))) film = { ...put("film.mp4", "videos"), seconds: seconds(own("film.mp4")) };

  const jam = {
    track,
    span: { from: A, to: B },
    part,
    vocals,
    stems,
    sung,
    lines: lines.map(({ from, to, text }) => ({ from, to, text })),
    bpm,
    down,
    sure,
    beats: times,
    captions: spec.captions.style,
    captionsSet: true,
    artist,
    band,
    dance: null,
    style: spec.style,
    every: 2,
    shots,
    looks,
    film: film ? { url: film.url, seconds: film.seconds } : null,
    cut: `cut-${id}`,
    musicIn: part.file,
    linesInEdit: true,
  };
  const project = { name: spec.name, rev: REV, about: spec.about, thumb: "thumb.jpg", jam, cut: { id: `cut-${id}`, name: spec.name, body }, media };
  await writeFile(own("project.json"), JSON.stringify(project, null, 1));
  console.log(`${id}: ${shots.length} shots, ${lines.length} lines, ${spec.fx.length} effects, ${spec.stickers.length} stickers, part ${part.seconds} s of ${trackSeconds} s${film ? `, film ${film.seconds} s` : ""}`);
}

for (const id of process.argv.length > 2 ? process.argv.slice(2) : Object.keys(SPECS)) {
  if (!SPECS[id]) throw new Error(`No such showcase here: ${id}`);
  await make(id);
}
