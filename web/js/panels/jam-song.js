// Jam's first workspace, the song. A calm column of three steps makes it (the idea, the shape, the sound, with the many fine
// settings folded under Advanced) and the stage shows it: a record on a turntable in a spotlight, the song's name, its tempo,
// key and length, its waveform, and the key that makes it. The sections of the lyrics stand in a slim map beside the stage and the
// songs made so far on a shelf of sleeves under it. Pickle sets the form up from the idea and every setting stays in your hands.
// Making costs credits, so it is a key with its estimate on it; nothing here makes a song by itself.
// A song made or brought in becomes the track of the video open (or of a new one): "Song made" in the pipeline, then the Track.
import { h } from "../dom.js";
import { state, toast, waitFor, writer } from "../store.js";
import { api } from "../api.js";
import { dropdown } from "../controls.js";
import { LANGUAGES, SIGNATURES, DEFAULT_SONG, PITCHES, MODES, KEYS, noteOf, modeOf, STYLE_WORDS, QUALITY, lengthLabel, SECTIONS, STRUCTURES, skeleton, costOfSong } from "../song.js";
import { jicon, pickFile, cr, clock, mins } from "./jam-ui.js";
import { createDeck } from "./jam-deck.js";
import { jam, useSong, songHook, setWorkspace } from "../jam.js";

const STORE = "comfyture.jam.song.3";
const MINE = ["idea", "structure", "tags", "lyrics", "seconds", "language", "key", "bpm", "signature", "name", "passes", "temperature", "adherence", "thinking"];
const song = { idea: "", tags: "", lyrics: "", name: "", ...DEFAULT_SONG, writing: false, making: false, made: [], shown: null, loaded: false, more: false, adv: false };
try {
  Object.assign(song, JSON.parse(localStorage.getItem(STORE) ?? "{}"));
} catch {}
const keepDraft = () => {
  try {
    localStorage.setItem(STORE, JSON.stringify(Object.fromEntries(MINE.map((k) => [k, song[k]]))));
  } catch {}
};

const MIN_SECONDS = 20;
const MAX_SECONDS = 240;
const MIN_BPM = 40;
const MAX_BPM = 220;
/** The words each row of the sound shows (one line of the column); the rest are one press away under More (a word picked stays on the row). */
const QUICK = { Genre: ["pop", "indie pop", "lo-fi hip hop", "rock"], Mood: ["dreamy", "chill", "playful", "energetic"] };

let page = null; // the elements kept between draws: the fields, the record, the song that plays
let deck = null;
let seen = null; // the video the stage was last set for
let drafting = false; // the stage shows the song being designed (the form's), not one of the shelf

// ---------------------------------------------------------------- what is shown, what is made

/** The songs on the shelf: the ones made or brought in, and the track of the video open when it is not among them. */
function shelf() {
  const track = jam.jam?.body.track;
  const own = track && !song.made.some((m) => m.file === track.file) ? [{ file: track.file, url: track.url, name: track.name, seconds: track.seconds, kind: track.kind ?? "upload", bpm: track.bpm ?? (jam.jam.body.bpm ? Math.round(jam.jam.body.bpm) : undefined), lyrics: track.lyrics }] : [];
  return [...own, ...song.made].slice(0, 14);
}
const shownSong = () => shelf().find((m) => m.file === song.shown) ?? null;
const inJam = (m) => !!m && jam.jam?.body.track?.file === m.file;

/** Pickle sets the song up from the idea, keeping what the page already holds when it is a change that is asked for. */
async function setUp() {
  if (song.writing) return;
  if (!song.idea.trim() && !song.tags.trim()) return toast("Say what the song is about first.");
  song.writing = true;
  redrawAll();
  try {
    const hasWords = song.lyrics.replace(/\[[^\]]*\]/g, "").trim();
    const got = await api.writeSong({
      idea: song.idea, seconds: song.seconds, language: song.language, structure: song.structure, model: writer(),
      current: song.tags || hasWords ? { tags: song.tags, lyrics: song.lyrics, bpm: song.bpm, key: song.key } : undefined,
    });
    Object.assign(song, { name: got.name, tags: got.tags, lyrics: got.lyrics, bpm: got.bpm, key: got.key, language: got.language, signature: got.timesignature });
    keepDraft();
    showDraft();
  } catch (e) {
    toast(e.message, { tone: "crit" });
  } finally {
    song.writing = false;
    sync();
    redrawAll();
  }
}

async function make() {
  if (song.making) return;
  if (!song.tags.trim()) return toast("Let Pickle set the song up first: say what it is about.");
  song.making = true;
  redrawAll();
  try {
    const job = await api.makeSong({ tags: song.tags, lyrics: song.lyrics, seconds: song.seconds, bpm: song.bpm, key: song.key, language: song.language, timesignature: song.signature, passes: song.passes, temperature: song.temperature, adherence: song.adherence, thinking: song.thinking, name: song.name || "New song" });
    const done = await waitFor("job", job.id);
    const made = { ...done.audio, tags: song.tags, lyrics: song.lyrics, key: song.key, bpm: song.bpm };
    song.made.unshift(made);
    show(made.file);
    // a video that has no song takes this one at once (free: the part is cut here); one that has keeps its own until you say
    if (!jam.jam?.body.track) await useSong(made);
  } catch (e) {
    toast(e.message, { tone: "crit" });
  } finally {
    song.making = false;
    redrawAll();
  }
}

/** A song brought in (a sound, or a video's sound): on the shelf, shown, and the video's song when it has none. */
export function bringSong(file) {
  return api.uploadAudio(file).then(async (a) => {
    const made = { file: a.file, url: a.url, name: (file.name ?? "").replace(/\.\w+$/, "").slice(0, 50) || "My song", seconds: a.seconds, kind: "upload" };
    song.made.unshift(made);
    show(made.file);
    if (!jam.jam?.body.track) await useSong(made);
    redrawAll();
  }, (e) => toast(e.message, { tone: "crit" }));
}

/** The shown song becomes the video's: of the open one when it has none, else of a new one; then the track opens. */
async function useIt() {
  const m = shownSong();
  if (!m) return;
  const j = await useSong(m);
  if (j) setWorkspace("track");
}

/** The stage shows the song being designed (the form's), not one of the shelf: a song that was playing stops. */
function showDraft() {
  drafting = true;
  song.shown = null;
  page?.audio.pause();
  page?.audio.removeAttribute("src");
}

/** The text boxes hold what the song holds. */
const sync = () => {
  if (!page) return;
  page.idea.value = song.idea;
  page.tags.value = song.tags;
  page.lyrics.value = song.lyrics;
  page.name.value = song.name;
  page.count.textContent = `${song.idea.length}/500`;
};

// ---------------------------------------------------------------- the steps

const chips = (items, on, pick, label, cls = "") =>
  h(`div.sg-chips${cls}`, { role: "group", "aria-label": label }, ...items.map(([value, text, desc, extra]) =>
    h("button.key", { type: "button", "aria-pressed": String(on === value), title: desc ?? "", on: { click: () => pick(value) } }, extra ?? null, text)));

/** A structure's little picture: its sections as blocks, the choruses lit. */
const blocks = (id) => h("span.sg-blocks", { "aria-hidden": "true" }, ...(STRUCTURES.find((s) => s.id === id)?.sections ?? []).map((s) => h(`i${/chorus/i.test(s) ? ".is-chorus" : /verse/i.test(s) ? ".is-verse" : ""}`)));

/** A slider with its reading beside it; it changes the song as it moves, and the keys around it are drawn again when it is let go. */
function range({ min, max, step, value, label, format, set, ends }) {
  const out = h("output.sg-out", {}, format(value));
  const input = h("input.sg-range", { type: "range", min, max, step, value, "aria-label": label, on: { input: (e) => ((out.textContent = format(Number(e.target.value))), set(Number(e.target.value))), change: () => redrawSteps() } });
  return h("div.sg-slider", {}, input, out, ends ? h("div.sg-ends", {}, h("span", {}, ends[0]), h("span", {}, ends[1])) : null);
}

const tagList = () => song.tags.split(",").map((t) => t.trim()).filter(Boolean);
const hasWord = (w) => tagList().some((t) => t.toLowerCase() === w.toLowerCase());
/** A word of style added to the tags, or taken out when it is there. */
function toggleWord(w) {
  const list = tagList();
  song.tags = (hasWord(w) ? list.filter((t) => t.toLowerCase() !== w.toLowerCase()) : [...list, w]).join(", ");
  page.tags.value = song.tags;
  keepDraft();
  redrawSteps();
}

/** A section tag put into the lyrics where the cursor is, on lines of its own. */
function addSection(tag) {
  const box = page.lyrics;
  const at = box.selectionStart ?? box.value.length;
  const before = box.value.slice(0, at);
  const lead = !before || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  box.setRangeText(`${lead}[${tag}]\n`, at, box.selectionEnd ?? at, "end");
  song.lyrics = box.value;
  keepDraft();
  box.focus();
  redrawStage();
}

function pickStructure(id) {
  song.structure = id;
  const words = song.lyrics.replace(/\[[^\]]*\]/g, "").trim();
  if (!words) page.lyrics.value = song.lyrics = id === "instrumental" ? "[Instrumental]" : skeleton(id);
  keepDraft();
  redrawAll();
}

/** Tapping the beat sets the tempo: the last few taps, averaged, forgotten after two seconds of rest. */
let taps = [];
function tap() {
  const now = performance.now();
  taps = [...taps.filter((t) => now - t < 2000), now].slice(-6);
  if (taps.length < 2) return;
  const gap = (taps.at(-1) - taps[0]) / (taps.length - 1);
  song.bpm = Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(60000 / gap)));
  keepDraft();
  redrawSteps();
  redrawStage();
}

const set = (field) => (e) => ((song[field] = e.target.value), keepDraft(), field === "lyrics" && redrawMap());
const pick = (field) => (v) => ((song[field] = v), keepDraft(), redrawAll());

/** The tempo as a dial: dragged round, or with the arrow keys; its reading in the middle, a key beside it that taps the beat. */
function tempoDial() {
  const R = 44;
  const C = 2 * Math.PI * R;
  const SWEEP = 0.75;
  const arc = (v) => `${C * SWEEP * v} ${C}`;
  const share = (bpm) => (bpm - MIN_BPM) / (MAX_BPM - MIN_BPM);
  const svg = h("div.sg-dial-face", {});
  const reading = h("b", {}, String(song.bpm));
  const draw = () => {
    svg.innerHTML = `<svg viewBox="0 0 108 108" aria-hidden="true">
      <circle cx="54" cy="54" r="${R}" fill="none" stroke="#2a2a2f" stroke-width="7" stroke-linecap="round" stroke-dasharray="${arc(1)}" transform="rotate(135 54 54)"/>
      <circle cx="54" cy="54" r="${R}" fill="none" stroke="#F2FF59" stroke-width="7" stroke-linecap="round" stroke-dasharray="${arc(share(song.bpm))}" transform="rotate(135 54 54)"/>
    </svg>`;
    svg.append(h("div.sg-dial-read", {}, reading, h("span", {}, "BPM")));
    reading.textContent = String(song.bpm);
  };
  const at = (e) => {
    const r = svg.getBoundingClientRect();
    const a = Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * (180 / Math.PI);
    const turn = (((a - 135) % 360) + 360) % 360;
    return turn > 270 ? (turn > 315 ? 0 : 1) : turn / 270;
  };
  const put = (bpm, done) => {
    song.bpm = Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(bpm)));
    draw();
    el.setAttribute("aria-valuenow", String(song.bpm));
    if (done) (keepDraft(), redrawStage());
  };
  const el = h("div.sg-dial", { role: "slider", tabindex: "0", "aria-label": "Tempo in beats per minute", "aria-valuemin": String(MIN_BPM), "aria-valuemax": String(MAX_BPM), "aria-valuenow": String(song.bpm) }, svg);
  el.addEventListener("pointerdown", (e) => {
    el.setPointerCapture(e.pointerId);
    put(MIN_BPM + at(e) * (MAX_BPM - MIN_BPM), false);
    const move = (ev) => put(MIN_BPM + at(ev) * (MAX_BPM - MIN_BPM), false);
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      put(song.bpm, true);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  });
  el.addEventListener("keydown", (e) => {
    const d = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    put(song.bpm + d * (e.shiftKey ? 5 : 1), true);
  });
  draw();
  return h("div.sg-tempo", {}, el, h("button.key.is-quiet.sg-tap", { type: "button", title: "Tap the beat: the tempo follows", on: { click: tap } }, jicon("pulse"), "Tap"));
}

/** The length: its reading big, a slider under it, and the usual lengths marked on it (a press on one sets it). */
function lengthControl() {
  const big = h("b.sg-big", {}, lengthLabel(song.seconds));
  const input = h("input.sg-range", { type: "range", min: MIN_SECONDS, max: MAX_SECONDS, step: 5, value: song.seconds, "aria-label": "Length in seconds",
    on: { input: (e) => ((song.seconds = Number(e.target.value)), (big.textContent = lengthLabel(song.seconds)), keepDraft(), redrawStage()), change: () => redrawSteps() } });
  const place = (v) => `${((v - MIN_SECONDS) / (MAX_SECONDS - MIN_SECONDS)) * 100}%`;
  return h("div.sg-length", {},
    h("div.sg-length-head", {}, h("span.sg-field", {}, "Length"), big),
    input,
    h("div.sg-marks", {}, ...[30, 60, 120, 200, 240].map((v) => h("button", { type: "button", style: { left: place(v) }, title: `Make it ${lengthLabel(v)}`, on: { click: () => ((song.seconds = v), keepDraft(), redrawAll()) } }, clock(v)))));
}

/** A row of word pills; the ones picked that the row does not list stay on it. */
function pills(group, more) {
  const all = STYLE_WORDS.find(([name]) => name === group)?.[1] ?? [];
  const words = [...new Set([...all.filter(hasWord), ...QUICK[group]])];
  return h("div.sg-pills", { role: "group", "aria-label": group }, ...words.map((w) => h("button.sg-pill", { type: "button", "aria-pressed": String(hasWord(w)), on: { click: () => toggleWord(w) } }, w)),
    more ? h("button.sg-pill.is-more", { type: "button", "aria-expanded": String(song.more), title: "Every word of style, and the style as typed", on: { click: () => ((song.more = !song.more), redrawSteps()) } }, "More", jicon("caret")) : null);
}

/** What More holds: every word of style, and the style as typed. */
function moreWords() {
  return h("div.sg-more", {},
    ...STYLE_WORDS.map(([name, words]) => h("div.sg-words", {}, h("span.sg-field", {}, name),
      h("div.sg-pills.is-small", {}, ...words.map((w) => h("button.sg-pill", { type: "button", "aria-pressed": String(hasWord(w)), on: { click: () => toggleWord(w) } }, w))))),
    h("div.sg-words", {}, h("span.sg-field", {}, "The style, as typed"), page.tags));
}

const step = (n, label, meta, ...body) =>
  h("section.sg-step", {}, h("header.sg-step-head", {}, h("span.sg-num", {}, String(n)), h("h2", {}, label), meta ? h("span.sg-meta", {}, meta) : null), ...body);
const row = (label, ...body) => h("div.sg-row", {}, h("span.sg-field", {}, label), h("div.sg-ctl", {}, ...body));

function drawSteps() {
  const lang = dropdown({ label: "Language", value: song.language, items: LANGUAGES.map((l) => ({ value: l.value, label: l.label })), onChange: pick("language"), width: "fit" });
  const here = noteOf(song.key);
  const lines = song.lyrics.split("\n").filter((l) => l.trim() && !/^\s*\[[^\]]*\]\s*$/.test(l)).length;
  return [
    step(1, "The idea", null,
      h("div.sg-ask", {}, h("img.sg-pickle", { src: "brand/cast/pickle-face.webp", alt: "Pickle", draggable: false }), h("div.sg-idea", {}, page.idea, page.count)),
      h("button.key.is-primary.sg-set", { type: "button", disabled: song.writing, on: { click: setUp } }, jicon("pencil"), song.writing ? "Pickle is writing…" : "Pickle, set it up")),
    step(2, "The shape", STRUCTURES.find((x) => x.id === song.structure)?.desc,
      h("div.sg-shapes", { role: "group", "aria-label": "Shape" }, ...STRUCTURES.map((x) =>
        h("button.sg-shape", { type: "button", "aria-pressed": String(song.structure === x.id), title: x.desc, on: { click: () => pickStructure(x.id) } }, blocks(x.id), h("b", {}, x.label))))),
    step(3, "The sound", null,
      h("div.sg-line", {}, h("span.sg-field", {}, "Genre"), pills("Genre", true)),
      h("div.sg-line", {}, h("span.sg-field", {}, "Mood"), pills("Mood", false)),
      song.more ? moreWords() : null,
      h("div.sg-dials", {},
        lengthControl(),
        tempoDial())),
    h("details.sg-adv", { open: song.adv, on: { toggle: (e) => (song.adv = e.target.open) } },
      h("summary", {}, jicon("caret"), h("b", {}, "Advanced"), h("span", {}, "Key · Time · Language · Quality · Lyrics")),
      h("div.sg-adv-body", {},
        row("Title", page.name),
        row("Key",
          chips(PITCHES.map((n) => [n, n]), here, (n) => pick("key")(`${n} ${modeOf(song.key)}`), "Note", ".is-notes"),
          chips(MODES.map((m) => [m, m[0].toUpperCase() + m.slice(1)]), modeOf(song.key), (m) => pick("key")(`${here} ${m}`), "Mode", ".is-seg")),
        row("Time", chips(SIGNATURES.map((x) => [x.value, x.label, x.desc]), song.signature, pick("signature"), "Time signature", ".is-seg")),
        row("Language", lang),
        row("Quality", chips(QUALITY, song.passes, pick("passes"), "Quality", ".is-seg")),
        row("Creativity", range({ min: 0.4, max: 1.1, step: 0.05, value: song.temperature, label: "Creativity", format: (v) => v.toFixed(2), set: (v) => ((song.temperature = v), keepDraft()), ends: ["steady", "wild"] })),
        row("Follows the words", range({ min: 1, max: 5, step: 0.5, value: song.adherence, label: "How closely it follows the words and the style", format: (v) => v.toFixed(1), set: (v) => ((song.adherence = v), keepDraft()), ends: ["loose", "strict"] })),
        row("Plans first", h("button.key", { type: "button", "aria-pressed": String(song.thinking), title: "The model plans the song's structure before it sounds it: better built, slower", on: { click: () => pick("thinking")(!song.thinking) } }, song.thinking ? "On" : "Off")),
        h("div.sg-lyrics", {}, h("div.sg-lyrics-head", {}, h("span.sg-field", {}, "Lyrics"), h("span.sg-meta", {}, lines ? `${lines} lines` : "none yet")),
          h("div.sg-tags", {}, ...SECTIONS.map((sec) => h("button.key.is-quiet", { type: "button", title: `Add [${sec}]`, on: { click: () => addSection(sec) } }, jicon("plus"), sec))),
          page.lyrics))),
  ];
}

// ---------------------------------------------------------------- the sections: where each falls

const KIND = (n) => (/pre/i.test(n) ? "pre" : /chorus|hook/i.test(n) ? "chorus" : /verse/i.test(n) ? "verse" : /bridge/i.test(n) ? "bridge" : /intro|outro/i.test(n) ? "edge" : "other");
const WEIGHT = { edge: 0.55, pre: 0.6, bridge: 0.8, verse: 1, chorus: 1.1, other: 0.8 };
/** The sections of some lyrics in order ([Verse 1], [Chorus - chant hook]…), else the shape's own. */
const sectionsOf = (lyrics = song.lyrics) => {
  const tags = [...lyrics.matchAll(/^[ \t]*\[([^\]\n]+)\][ \t]*$/gm)].map((m) => m[1].trim());
  return (tags.length ? tags : (STRUCTURES.find((s) => s.id === song.structure)?.sections ?? [])).map((name) => ({ name, label: name.replace(/\s+-\s+.*$/, ""), kind: KIND(name) }));
};

/**
 * Each section with the stretch of the song it should fall in (the song's length shared out by what each usually takes). The map is
 * the plan of the form; a song shown that was made with lyrics of its own (here) shows its own plan, in its own length.
 */
function sectionTimes() {
  const m = shownSong();
  const own = m?.lyrics && /\[[^\]]+\]/.test(m.lyrics) ? m : null;
  const total = own?.seconds || song.seconds;
  const list = sectionsOf(own ? own.lyrics : song.lyrics).map((s) => ({ ...s, weight: /final/i.test(s.name) ? 1.25 : WEIGHT[s.kind] }));
  const sum = list.reduce((t, s) => t + s.weight, 0) || 1;
  let at = 0;
  return list.map((s) => {
    const from = at;
    at += (s.weight / sum) * total;
    return { ...s, from, to: at };
  });
}

function drawMap() {
  const list = sectionTimes();
  if (!list.length) return [h("span.sg-label", {}, "Section map"), h("p.sg-hint", {}, "A song with no words has no sections.")];
  return [
    h("span.sg-label", {}, "Section map"),
    h("ol.sg-secs", {}, ...list.map((s, i) =>
      h("li", { style: { "--w": String(s.weight) }, dataset: { kind: s.kind } },
        h("button.sg-sec", { type: "button", title: `${s.name}: it should fall between ${mins(s.from)} and ${mins(s.to)}\nShow it in the lyrics`, on: { click: () => showSection(i) } },
          h("i", {}), h("b", {}, s.label), h("em", {}, `${mins(s.from)} – ${mins(s.to)}`))))),
  ];
}

/** A section of the map is found in the lyrics: Advanced opens and the cursor stands on its tag. */
function showSection(n) {
  song.adv = true;
  redrawSteps();
  const tags = [...page.lyrics.value.matchAll(/^[ \t]*\[[^\]\n]+\][ \t]*$/gm)];
  const m = tags[n];
  page.steps.querySelector(".sg-adv")?.setAttribute("open", "");
  requestAnimationFrame(() => {
    page.lyrics.focus();
    if (m) page.lyrics.setSelectionRange(m.index, m.index + m[0].length);
    page.lyrics.scrollIntoView({ block: "center" });
  });
}

// ---------------------------------------------------------------- the stage

const peaks = new Map();
/** A song's waveform: bars of its loudest peaks, read once (free, in the browser). */
async function peaksOf(m) {
  if (peaks.has(m.url)) return peaks.get(m.url);
  peaks.set(m.url, null);
  try {
    const ctx = new AudioContext();
    const buf = await ctx.decodeAudioData(await (await fetch(m.url)).arrayBuffer());
    ctx.close();
    const d = buf.getChannelData(0);
    const n = 180;
    const step = Math.max(1, Math.floor(d.length / n));
    const out = Array.from({ length: n }, (_, i) => {
      let top = 0;
      for (let k = i * step; k < (i + 1) * step; k += 24) top = Math.max(top, Math.abs(d[k] ?? 0));
      return top;
    });
    const loud = Math.max(...out, 0.05);
    peaks.set(m.url, out.map((v) => v / loud));
  } catch {
    peaks.set(m.url, null);
  }
  drawWave();
}

/** What a song that is not made yet might look like: louder in the choruses, quieter at the edges (a sketch, not a promise). */
function ghost() {
  const list = sectionTimes();
  const total = list.at(-1)?.to || song.seconds;
  const level = { chorus: 0.85, pre: 0.65, verse: 0.5, bridge: 0.58, edge: 0.3, other: 0.5 };
  return Array.from({ length: 180 }, (_, i) => {
    const t = ((i + 0.5) / 180) * total;
    const s = list.find((x) => t >= x.from && t < x.to);
    const n = Math.sin(i * 12.9898) * 43758.5453;
    return (level[s?.kind ?? "other"] ?? 0.5) * (0.62 + (n - Math.floor(n)) * 0.38);
  });
}

function drawWave() {
  const c = page?.wave;
  if (!c) return;
  const w = c.clientWidth;
  const hgt = c.clientHeight;
  if (!w || !hgt) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(hgt * dpr)) {
    c.width = Math.round(w * dpr);
    c.height = Math.round(hgt * dpr);
  }
  const g = c.getContext("2d");
  g.clearRect(0, 0, c.width, c.height);
  const m = shownSong();
  const real = m ? peaks.get(m.url) : null;
  const data = real ?? ghost();
  const at = m && page.audio.duration ? page.audio.currentTime / page.audio.duration : 0;
  const bar = c.width / data.length;
  data.forEach((v, i) => {
    g.fillStyle = real ? (i / data.length < at ? "#F2FF59" : "rgba(150,128,230,.82)") : "rgba(240,239,237,.16)";
    const bh = Math.max(3 * dpr, v * c.height * 0.92);
    g.fillRect(i * bar + bar * 0.18, (c.height - bh) / 2, Math.max(1, bar * 0.64), bh);
  });
}

/** One song shown on the stage: its record, its readings, its sound ready to play. */
function show(file) {
  drafting = false;
  song.shown = file;
  const m = shownSong();
  if (m && page.audio.getAttribute("src") !== m.url) {
    page.audio.pause();
    page.audio.src = m.url;
  }
  if (m) peaksOf(m);
  redrawAll();
}

function toggle(m) {
  if (m && song.shown !== m.file) show(m.file);
  if (!page.audio.src) return;
  page.audio.paused ? page.audio.play().catch(() => {}) : page.audio.pause();
}

const keyLabel = (m) => (inJam(m) ? "On to the track" : jam.jam?.body.track ? "Use it in a new video" : "Use it for the video");

/** The stage's readings and keys, set again when the song, the form or the video changes (the record and the sound are never rebuilt). */
function drawStage() {
  if (!page) return;
  const m = shownSong();
  const cost = state.info?.target === "comfy-cloud" ? costOfSong(song.seconds, song.passes) : null;
  const title = (m?.name ?? song.name) || "New song";
  page.name_.textContent = title;
  page.read.textContent = m
    ? `${m.bpm ? `${m.bpm} BPM · ` : ""}${m.key ? `${m.key} · ` : ""}${lengthLabel(Math.round(m.seconds || 0))}`
    : `${song.bpm} BPM · ${song.key} · ${lengthLabel(song.seconds)}`;
  if (!m) page.time.textContent = "00:00 / 00:00";
  page.state.textContent = song.making ? "Making the song…" : m ? "" : "Not made yet";
  page.state.hidden = !page.state.textContent;
  page.stage.classList.toggle("is-making", song.making);
  page.play.disabled = !m;
  page.play.replaceChildren(jicon(page.audio.paused ? "play" : "pause"));
  page.play.title = m ? "Play or pause" : "Nothing to play yet";
  page.make.disabled = song.making;
  page.make.className = `key is-primary sg-make${song.making ? " is-busy" : ""}`;
  page.make.replaceChildren(jicon("note"), song.making ? "Making the song…" : "Make the song", cost && !song.making ? h("span.sg-cr", {}, cr(cost)) : null);
  page.hint.textContent = song.passes === 1 ? "A draft: quicker and cheaper. Make it Full for the final." : "Full songs sound best. Cut your favourite part next.";
  page.use.hidden = !m;
  if (m) {
    page.use.dataset.here = inJam(m) ? "1" : "";
    page.use.replaceChildren(inJam(m) ? jicon("check") : null, h("span", {}, keyLabel(m)), jicon("next"));
    page.use.title = inJam(m) ? "This song is the video's track: go on to it" : jam.jam?.body.track ? "The video open has a song already: a new video is made for this one" : "This song becomes the video's track (free), then the track opens";
  }
  drawWave();
}

function drawShelf() {
  const list = shelf();
  return [
    h("div.sg-shelf-head", {}, h("span.sg-label", {}, "Your songs"), h("span.sg-meta", {}, list.length ? String(list.length) : "")),
    h("div.sg-sleeves", { dataset: { scrollKey: "sg-sleeves" } },
      ...list.map((m) => {
        const hue = [...(m.name ?? "")].reduce((t, ch) => (t * 31 + ch.charCodeAt(0)) % 360, 17);
        const playing = song.shown === m.file && page.audio && !page.audio.paused;
        return h(`div.sg-sleeve${m.file === song.shown ? ".is-on" : ""}${inJam(m) ? ".is-track" : ""}`, { style: { "--hue": String(hue) } },
          h("button.sg-sleeve-art", { type: "button", title: `${m.name}\nShow it on the stage`, "aria-label": m.name, on: { click: () => show(m.file) } },
            h("span.sg-disc", {}), h("span.sg-sleeve-jar", {}, jicon("jar"))),
          h("button.sg-sleeve-play", { type: "button", title: playing ? "Pause" : "Play", "aria-label": playing ? `Pause ${m.name}` : `Play ${m.name}`, on: { click: () => toggle(m) } }, jicon(playing ? "pause" : "play")),
          h("b", { title: m.name }, m.name), h("em", {}, lengthLabel(Math.round(m.seconds || 0))));
      }),
      h("button.sg-import", { type: "button", title: "A sound or a video's sound becomes a song of the shelf", on: { click: () => pickFile("audio/*,video/*", bringSong) } }, jicon("upload"), h("b", {}, "Import a song"), h("em", {}, "MP3, WAV or video"))),
  ];
}

// ---------------------------------------------------------------- the redraws

function redrawSteps() {
  if (!page) return;
  const at = page.steps.scrollTop;
  page.steps.replaceChildren(...drawSteps());
  page.steps.scrollTop = at;
}
function redrawMap() {
  if (page) page.map.replaceChildren(...drawMap());
}
function redrawStage() {
  drawStage();
  redrawMap();
}
function redrawShelf() {
  if (page) page.shelf.replaceChildren(...drawShelf());
}
function redrawAll() {
  redrawSteps();
  redrawStage();
  redrawShelf();
}

// ---------------------------------------------------------------- the workspace

/**
 * The song workspace: one element, made once and put in the grid, that draws itself again when its own state or the video's
 * changes. (What plays, the record and the fields are never rebuilt under you.)
 */
export function songWorkspace() {
  if (!page) {
    const area = (field, rows, placeholder, cls = "", extra = {}) => h(`textarea.field.sg-text${cls}`, { rows, placeholder, spellcheck: false, "aria-label": placeholder, ...extra, on: { input: set(field) } });
    const audio = h("audio.sg-audio", { preload: "metadata" });
    page = {
      idea: area("idea", 2, "What is the song about?", "", { maxLength: 500 }),
      count: h("span.sg-count", {}, "0/500"),
      tags: area("tags", 3, "Its style: genre, mood, instruments, the voice", ".is-mono"),
      lyrics: area("lyrics", 12, "Its lyrics, in sections: [Verse 1], [Chorus]…", ".is-mono"),
      name: h("input.field.sg-name-field", { type: "text", maxlength: 40, placeholder: "A title", "aria-label": "Title", on: { input: set("name") } }),
      audio,
    };
    page.idea.addEventListener("input", () => (page.count.textContent = `${song.idea.length}/500`));
    sync();
    deck ??= createDeck();
    audio.addEventListener("play", () => (deck.play(true), drawStage(), redrawShelf()));
    audio.addEventListener("pause", () => (deck.play(false), drawStage(), redrawShelf()));
    audio.addEventListener("ended", () => (deck.play(false), drawStage(), redrawShelf()));
    audio.addEventListener("timeupdate", () => {
      drawWave();
      page.time.textContent = `${clock(audio.currentTime)} / ${clock(audio.duration || shownSong()?.seconds || 0)}`;
    });
    audio.addEventListener("loadedmetadata", () => (page.time.textContent = `${clock(0)} / ${clock(audio.duration || 0)}`));

    page.steps = h("section.sg-steps", { "aria-label": "Make the song", dataset: { scrollKey: "sg-steps" } });
    page.name_ = h("h2.sg-name", {});
    page.read = h("p.sg-readout", {});
    page.state = h("p.sg-state", {});
    page.play = h("button.sg-play", { type: "button", on: { click: () => toggle(shownSong()) } });
    page.wave = h("canvas.sg-wave", { title: "Click to jump", on: { pointerdown: (e) => {
      const r = page.wave.getBoundingClientRect();
      if (shownSong() && audio.duration) (audio.currentTime = ((e.clientX - r.left) / r.width) * audio.duration), drawWave();
    } } });
    page.time = h("span.sg-time", {}, "00:00 / 00:00");
    page.make = h("button", { type: "button", on: { click: make } });
    page.use = h("button.key.sg-use", { type: "button", on: { click: useIt } });
    page.hint = h("p.sg-hint", {});
    page.stage = h("section.sg-stage", { "aria-label": "The song" },
      h("div.sg-spot", { "aria-hidden": "true" }),
      h("div.sg-record", {}, h("div.sg-deck", { title: "Play or pause", on: { click: () => toggle(shownSong()) } }, deck.el)),
      h("div.sg-label-block", {}, page.name_, page.read, page.state),
      h("div.sg-transport", {}, page.play, page.wave, page.time),
      h("div.sg-actions", {}, page.make, page.use),
      page.hint,
      audio);
    page.map = h("aside.sg-map", { "aria-label": "The song's sections" });
    page.shelf = h("section.sg-shelf", { "aria-label": "Your songs" });
    page.root = h("div.sg-work", {}, page.steps, page.stage, page.map, page.shelf);
    new ResizeObserver(() => drawWave()).observe(page.wave);
  }
  // (what the video holds changed, or this page has just been shown again: what depends on it is set again)
  if (!song.loaded) {
    song.loaded = true;
    api.songs().then((list) => {
      const have = new Set(song.made.map((m) => m.file));
      song.made.push(...list.filter((a) => a.kind === "music" && !have.has(a.file)).slice(0, 12));
      redrawShelf();
    }, () => {});
  }
  // another video was opened: the stage shows its song
  if (seen !== (jam.jam?.id ?? null)) {
    seen = jam.jam?.id ?? null;
    drafting = false;
    song.shown = null;
  }
  // the song shown is the video's own (until the form is worked on: then the stage shows that draft)
  if (!drafting && (!song.shown || !shelf().some((m) => m.file === song.shown))) {
    const first = jam.jam?.body.track ? shelf().find((m) => m.file === jam.jam.body.track.file) : null;
    if (first) song.shown = first.file;
    if (song.shown) {
      const m = shownSong();
      if (m && page.audio.getAttribute("src") !== m.url) page.audio.src = m.url;
      if (m) peaksOf(m);
    }
  }
  redrawAll();
  return page.root;
}

/** Leaving the page, or the workspace: what plays stops (the record and the sound are kept, not rebuilt). */
export function pauseSong() {
  page?.audio.pause();
}

// ---------------------------------------------------------------- Pickle reads the form and fills it

songHook.summary = () => {
  const m = shownSong();
  const sections = [...song.lyrics.matchAll(/^[ \t]*\[([^\]\n]+)\][ \t]*$/gm)].map((x) => x[1].replace(/\s+-\s+.*$/, "").trim());
  return {
    idea: song.idea.slice(0, 280),
    shape: song.structure,
    style: song.tags.slice(0, 200),
    length: song.seconds,
    bpm: song.bpm,
    key: song.key,
    time: song.signature,
    language: song.language,
    title: song.name,
    quality: song.passes === 1 ? "draft" : "full",
    lyrics: sections.length ? `${sections.length} sections (${sections.slice(0, 12).join(", ")}), ${song.lyrics.split("\n").filter((l) => l.trim() && !/^\s*\[/.test(l)).length} lines of words` : "none",
    shown: m ? { name: m.name, seconds: Math.round(m.seconds || 0) } : null,
    shelf: shelf().slice(0, 6).map((x) => x.name),
    busy: song.writing ? "writing" : song.making ? "making" : null,
  };
};

/** Pickle's set_song: the fields he gives are put in the form (each checked), nothing is made. True when anything was. */
songHook.fill = (a) => {
  let did = false;
  const text = (k, max, to = k) => typeof a[k] === "string" && (song[to] = a[k].slice(0, max), (did = true));
  text("idea", 500);
  text("tags", 400);
  text("lyrics", 6000);
  text("name", 40);
  if (STRUCTURES.some((s) => s.id === a.structure)) (song.structure = a.structure, (did = true));
  if (Number.isFinite(Number(a.seconds)) && a.seconds !== "") (song.seconds = Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, Math.round(Number(a.seconds) / 5) * 5)), (did = true));
  if (Number.isFinite(Number(a.bpm)) && a.bpm !== "") (song.bpm = Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(Number(a.bpm)))), (did = true));
  if (KEYS.includes(a.key)) (song.key = a.key, (did = true));
  if (LANGUAGES.some((l) => l.value === a.language)) (song.language = a.language, (did = true));
  if (did) {
    keepDraft();
    sync();
    showDraft();
    redrawAll();
  }
  return did;
};
