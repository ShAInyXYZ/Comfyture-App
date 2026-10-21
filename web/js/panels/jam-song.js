// Jam's first screen, the song. On the left one panel makes it: an idea, its shape, its style, its lyrics, its music
// (length, tempo, key, time, language) and how it is made; Pickle sets it all up from the idea and every setting stays in
// your hands. On the right is the stage the song is shown on: a record on a turntable (its cover and the cover brought to
// life come next). Making costs credits, so it is a key with its estimate on it.
import { h } from "../dom.js";
import { state, toast, waitFor, writer } from "../store.js";
import { api } from "../api.js";
import { dropdown } from "../controls.js";
import { LANGUAGES, SIGNATURES, LENGTHS, DEFAULT_SONG, PITCHES, MODES, noteOf, modeOf, STYLE_WORDS, QUALITY, lengthLabel, SECTIONS, STRUCTURES, skeleton, costOfSong } from "../song.js";
import { jicon, pickFile, cr } from "./jam-ui.js";
import { createDeck } from "./jam-deck.js";

const STORE = "comfyture.jam.song.3";
const MINE = ["idea", "structure", "tags", "lyrics", "seconds", "language", "key", "bpm", "signature", "name", "passes", "temperature", "adherence", "thinking"];
const song = { idea: "", tags: "", lyrics: "", name: "", ...DEFAULT_SONG, writing: false, making: false, made: [], shown: null, loaded: false };
try {
  Object.assign(song, JSON.parse(localStorage.getItem(STORE) ?? "{}"));
} catch {}
const keepDraft = () => {
  try {
    localStorage.setItem(STORE, JSON.stringify(Object.fromEntries(MINE.map((k) => [k, song[k]]))));
  } catch {}
};

let page = null;
let deck = null;
let redraw = () => {}; // the panel
let redrawStage = () => {}; // the stage (a song that plays is not stopped by a change in the panel)
const redrawAll = () => (redraw(), redrawStage());

// ---------------------------------------------------------------- what Pickle does and what is made

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
    song.made.unshift({ ...done.audio, tags: song.tags, key: song.key, bpm: song.bpm });
    song.shown = song.made[0].file;
  } catch (e) {
    toast(e.message, { tone: "crit" });
  } finally {
    song.making = false;
    redrawAll();
  }
}

function bring(file) {
  api.uploadAudio(file).then((a) => {
    song.made.unshift({ file: a.file, url: a.url, name: (file.name ?? "").replace(/\.\w+$/, "").slice(0, 50) || "My song", seconds: a.seconds, kind: "upload" });
    song.shown = song.made[0].file;
    redrawAll();
  }, (e) => toast(e.message, { tone: "crit" }));
}

/** The text boxes hold what the song holds. */
const sync = () => {
  if (!page) return;
  page.idea.value = song.idea;
  page.tags.value = song.tags;
  page.lyrics.value = song.lyrics;
  page.name.value = song.name;
};

// ---------------------------------------------------------------- the panel

const chips = (items, on, pick, label) =>
  h("div.sg-chips", { role: "group", "aria-label": label }, ...items.map(([value, text, desc, extra]) =>
    h("button.key", { type: "button", "aria-pressed": String(on === value), title: desc ?? "", on: { click: () => pick(value) } }, extra ?? null, text)));

/** A structure's little picture: its sections as blocks, the choruses lit. */
const blocks = (id) => h("span.sg-blocks", { "aria-hidden": "true" }, ...(STRUCTURES.find((s) => s.id === id)?.sections ?? []).map((s) => h(`i${/chorus/i.test(s) ? ".is-chorus" : /verse/i.test(s) ? ".is-verse" : ""}`)));

/** A slider with its reading beside it; it changes the song as it moves, and the keys around it are drawn again when it is let go. */
function range({ min, max, step, value, label, format, set, ends }) {
  const out = h("output.sg-out", {}, format(value));
  const input = h("input.sg-range", { type: "range", min, max, step, value, "aria-label": label, on: { input: (e) => ((out.textContent = format(Number(e.target.value))), set(Number(e.target.value))), change: () => redraw() } });
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
  redraw();
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
}

function pickStructure(id) {
  song.structure = id;
  const words = song.lyrics.replace(/\[[^\]]*\]/g, "").trim();
  if (!words) page.lyrics.value = song.lyrics = id === "instrumental" ? "[Instrumental]" : skeleton(id);
  keepDraft();
  redraw();
}

/** Tapping the beat sets the tempo: the last few taps, averaged, forgotten after two seconds of rest. */
let taps = [];
function tap() {
  const now = performance.now();
  taps = [...taps.filter((t) => now - t < 2000), now].slice(-6);
  if (taps.length < 2) return;
  const gap = (taps.at(-1) - taps[0]) / (taps.length - 1);
  song.bpm = Math.min(220, Math.max(40, Math.round(60000 / gap)));
  keepDraft();
  redraw();
}

const set = (field) => (e) => ((song[field] = e.target.value), keepDraft());
const group = (label, ...body) => h("section.sg-group", {}, h("span.sg-label", {}, label), ...body);
const row = (label, ...body) => h("div.sg-row", {}, h("span.sg-field", {}, label), h("div.sg-ctl", {}, ...body));
const pick = (field) => (v) => ((song[field] = v), keepDraft(), redraw());

function drawPanel() {
  const cost = state.info?.target === "comfy-cloud" ? costOfSong(song.seconds, song.passes) : null;
  const lang = dropdown({ label: "Language", value: song.language, items: LANGUAGES.map((l) => ({ value: l.value, label: l.label })), onChange: pick("language"), width: "fit" });
  const here = noteOf(song.key);
  return [
    h("div.sg-panel-head", {}, h("h1.sg-title", {}, "The song"),
      h("button.key.is-quiet", { type: "button", title: "Import a song", "aria-label": "Import a song", on: { click: () => pickFile("audio/*,video/*", bring) } }, jicon("upload"), "Import")),
    h("div.sg-scroll", {},
      group("The idea",
        h("div.sg-ask", {}, h("img.sg-pickle", { src: "brand/cast/pickle-face.webp", alt: "Pickle", draggable: false }), page.idea),
        h("button.key.is-primary.sg-set", { type: "button", disabled: song.writing, on: { click: setUp } }, jicon("pencil"), song.writing ? "Pickle is writing…" : "Pickle, set it up")),
      group("Shape", chips(STRUCTURES.map((s) => [s.id, s.label, s.desc, blocks(s.id)]), song.structure, pickStructure, "Shape")),
      group("Style",
        ...STYLE_WORDS.map(([name, words]) => h("div.sg-words", {}, h("span.sg-field", {}, name),
          h("div.sg-chips", {}, ...words.map((w) => h("button.key", { type: "button", "aria-pressed": String(hasWord(w)), on: { click: () => toggleWord(w) } }, w))))),
        page.tags),
      group("Lyrics",
        row("Title", page.name),
        h("div.sg-tags", {}, ...SECTIONS.map((sec) => h("button.key.is-quiet", { type: "button", title: `Add [${sec}]`, on: { click: () => addSection(sec) } }, sec))),
        page.lyrics),
      group("Music",
        row("Length", range({ min: 20, max: 240, step: 5, value: song.seconds, label: "Length in seconds", format: lengthLabel, set: (v) => ((song.seconds = v), keepDraft()) })),
        row("", chips(LENGTHS.map((l) => [l, lengthLabel(l)]), song.seconds, pick("seconds"), "Length")),
        row("Tempo", h("div.sg-tempo", {}, range({ min: 60, max: 200, step: 1, value: song.bpm, label: "Beats per minute", format: (v) => `${v} bpm`, set: (v) => ((song.bpm = v), keepDraft()) }), h("button.key", { type: "button", title: "Tap the beat", on: { click: tap } }, "Tap"))),
        row("Key", chips(PITCHES.map((n) => [n, n]), here, (n) => pick("key")(`${n} ${modeOf(song.key)}`), "Note")),
        row("", chips(MODES.map((m) => [m, m[0].toUpperCase() + m.slice(1)]), modeOf(song.key), (m) => pick("key")(`${here} ${m}`), "Mode")),
        row("Time", chips(SIGNATURES.map((x) => [x.value, x.label, x.desc]), song.signature, pick("signature"), "Time signature")),
        row("Language", lang)),
      group("How it is made",
        row("Quality", chips(QUALITY, song.passes, pick("passes"), "Quality")),
        row("Creativity", range({ min: 0.4, max: 1.1, step: 0.05, value: song.temperature, label: "Creativity", format: (v) => v.toFixed(2), set: (v) => ((song.temperature = v), keepDraft()), ends: ["steady", "wild"] })),
        row("Follows the words", range({ min: 1, max: 5, step: 0.5, value: song.adherence, label: "How closely it follows the words and the style", format: (v) => v.toFixed(1), set: (v) => ((song.adherence = v), keepDraft()), ends: ["loose", "strict"] })),
        row("Plans first", h("button.key", { type: "button", "aria-pressed": String(song.thinking), title: "The model plans the song's structure before it sounds it: better built, slower", on: { click: () => pick("thinking")(!song.thinking) } }, song.thinking ? "On" : "Off")))),
    h("div.sg-foot", {},
      h(`button.key.is-primary.sg-go${song.making ? ".is-busy" : ""}`, { type: "button", disabled: song.making, on: { click: make } },
        jicon("note"), song.making ? "Making the song…" : "Make the song", cost ? h("span.sg-cr", {}, cr(cost)) : null),
      h("p.sg-hint", {}, song.passes === 1 ? "A draft: quicker and cheaper. Make it Full for the final." : "Full songs sound best. Cut your favourite part next.")),
  ];
}

// ---------------------------------------------------------------- the stage

function drawStage() {
  const shown = song.made.find((m) => m.file === song.shown) ?? null;
  const title = (shown?.name ?? song.name) || "New song";
  const readout = shown ? `${lengthLabel(Math.round(shown.seconds || 0))}${shown.key ? ` · ${shown.key}` : ""}${shown.bpm ? ` · ${shown.bpm} bpm` : ""}` : `${song.key} · ${song.bpm} bpm · ${lengthLabel(song.seconds)}`;
  deck ??= createDeck();
  const audio = shown ? h("audio.sg-audio", { controls: true, preload: "metadata", src: shown.url, on: { play: () => deck.play(true), pause: () => deck.play(false), ended: () => deck.play(false) } }) : null;
  page.audio = audio;
  deck.play(false);
  return [
    h("div.sg-record", {}, h("div.sg-deck", { title: shown ? "Play or pause" : "", on: { click: () => audio && (audio.paused ? audio.play() : audio.pause()) } }, deck.el),
      h("div.sg-label-block", {}, h("h2.sg-name", {}, title), h("p.sg-readout", {}, readout), shown ? audio : h("p.sg-hint", {}, song.making ? "Making it…" : "Not made yet"))),
    song.made.length ? h("div.sg-shelf", {}, h("span.sg-label", {}, "Songs"),
      h("div.sg-sleeves", {}, ...song.made.map((m) => h(`button.sg-sleeve${m.file === song.shown ? ".is-on" : ""}`, { type: "button", title: m.name, on: { click: () => ((song.shown = m.file), redrawAll()) } },
        h("span.sg-sleeve-art", {}, jicon("disc")), h("b", {}, m.name), h("em", {}, lengthLabel(Math.round(m.seconds || 0))))))) : null,
  ];
}

// ---------------------------------------------------------------- the page

/** Jam's screen: the panel that makes the song on the left, the stage that shows it on the right. */
export function renderSong(el) {
  if (!page || !el.contains(page.root)) {
    const area = (field, rows, placeholder, cls = "") => h(`textarea.field.sg-text${cls}`, { rows, placeholder, spellcheck: false, "aria-label": placeholder, on: { input: set(field) } });
    page = {
      idea: area("idea", 3, "What is the song about?"),
      tags: area("tags", 3, "Its style: genre, mood, instruments, the voice", ".is-mono"),
      lyrics: area("lyrics", 14, "Its lyrics, in sections: [Verse 1], [Chorus]…", ".is-mono"),
      name: h("input.field.sg-name-field", { type: "text", maxlength: 40, placeholder: "A title", "aria-label": "Title", on: { input: set("name") } }),
    };
    sync();
    const panel = h("aside.sg-panel", { "aria-label": "Make the song" });
    const stage = h("main.sg-stage");
    page.root = h("div.song", {}, panel, stage);
    redraw = () => panel.replaceChildren(...drawPanel());
    redrawStage = () => stage.replaceChildren(...drawStage());
  }
  el.replaceChildren(page.root);
  redrawAll();
  if (!song.loaded) {
    song.loaded = true;
    api.songs().then((list) => {
      const have = new Set(song.made.map((m) => m.file));
      song.made.push(...list.filter((a) => a.kind === "music" && !have.has(a.file)).slice(0, 6));
      redrawStage();
    }, () => {});
  }
}
