// Jam's first screen, the song: it is imported, or made from an idea (ACE-Step 1.5 XL). Pickle sets a song up from an
// idea (its style, its lyrics laid out in sections, tempo, key, language, time signature); every setting stays in your
// hands. Making costs credits, so it is a key with its estimate on it, and nothing here starts by itself.
import { h } from "../dom.js";
import { state, toast, waitFor, writer } from "../store.js";
import { api } from "../api.js";
import { dropdown } from "../controls.js";
import { KEYS, LANGUAGES, SIGNATURES, LENGTHS, DEFAULT_SONG, lengthLabel, SECTIONS, STRUCTURES, skeleton, costOfSong } from "../song.js";
import { jicon, pickFile, cr } from "./jam-ui.js";

const STORE = "comfyture.jam.song";
const MINE = ["idea", "structure", "tags", "lyrics", "seconds", "language", "key", "bpm", "signature", "name"];
const song = { idea: "", tags: "", lyrics: "", name: "", ...DEFAULT_SONG, writing: false, making: false, made: [], loaded: false };
try {
  Object.assign(song, JSON.parse(localStorage.getItem(STORE) ?? "{}"));
} catch {}
const keepDraft = () => {
  try {
    localStorage.setItem(STORE, JSON.stringify(Object.fromEntries(MINE.map((k) => [k, song[k]]))));
  } catch {}
};

let page = null;
let redraw = () => {};

// ---------------------------------------------------------------- what Pickle does and what is made

/** Pickle sets the song up from the idea, keeping what the page already holds when it is a change that is asked for. */
async function setUp() {
  if (song.writing) return;
  if (!song.idea.trim() && !song.tags.trim()) return toast("Say what the song is about first.");
  song.writing = true;
  redraw();
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
    redraw();
    for (const [field, value] of [["tags", song.tags], ["lyrics", song.lyrics]]) if (page?.[field]) page[field].value = value;
  }
}

async function make() {
  if (song.making) return;
  if (!song.tags.trim()) return toast("Say what the song is like: the style comes first.");
  song.making = true;
  redraw();
  try {
    const job = await api.makeSong({ tags: song.tags, lyrics: song.lyrics, seconds: song.seconds, bpm: song.bpm, key: song.key, language: song.language, timesignature: song.signature, name: song.name || "New song" });
    const done = await waitFor("job", job.id);
    song.made.unshift({ ...done.audio, tags: song.tags });
  } catch (e) {
    toast(e.message, { tone: "crit" });
  } finally {
    song.making = false;
    redraw();
  }
}

function bring(file) {
  api.uploadAudio(file).then((a) => {
    song.made.unshift({ file: a.file, url: a.url, name: (file.name ?? "").replace(/\.\w+$/, "").slice(0, 50) || "My song", seconds: a.seconds, kind: "upload" });
    redraw();
  }, (e) => toast(e.message, { tone: "crit" }));
}

// ---------------------------------------------------------------- parts

const chips = (items, on, pick, label) =>
  h("div.sg-chips", { role: "group", "aria-label": label }, ...items.map(([value, text, desc]) =>
    h("button.key", { type: "button", "aria-pressed": String(on === value), title: desc ?? "", on: { click: () => pick(value) } }, text)));

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

const set = (field) => (e) => ((song[field] = e.target.value), keepDraft());

function drawIdea() {
  return h("section.sg-card.sg-idea", {},
    h("header.sg-head", {}, h("span.sg-label", {}, "The idea"),
      h("button.key.is-primary", { type: "button", disabled: song.writing, on: { click: setUp } }, jicon("pencil"), song.writing ? "Pickle is writing…" : "Pickle, set it up")),
    page.idea,
    chips(STRUCTURES.map((s) => [s.id, s.label, s.desc]), song.structure, pickStructure, "Structure"));
}

function drawWords() {
  return h("section.sg-card.sg-words", {},
    h("header.sg-head", {}, h("span.sg-label", {}, "The lyrics"),
      h("div.sg-tags", {}, ...SECTIONS.map((s) => h("button.key.is-quiet", { type: "button", title: `Add [${s}]`, on: { click: () => addSection(s) } }, s)))),
    page.lyrics);
}

function drawStyle() {
  return h("section.sg-card.sg-style", {}, h("header.sg-head", {}, h("span.sg-label", {}, "The style")), page.tags);
}

function drawSettings() {
  const lang = dropdown({ label: "Language", value: song.language, items: LANGUAGES.map((l) => ({ value: l.value, label: l.label })), onChange: (v) => ((song.language = v), keepDraft(), redraw()), width: "fit" });
  const key = dropdown({ label: "Key", value: song.key, items: KEYS.map((k) => ({ value: k, label: k })), onChange: (v) => ((song.key = v), keepDraft(), redraw()), width: "fit" });
  const row = (label, ...body) => h("div.sg-row", {}, h("span.sg-field", {}, label), ...body);
  return h("section.sg-card.sg-settings", {},
    h("header.sg-head", {}, h("span.sg-label", {}, "The settings")),
    row("Length", chips(LENGTHS.map((s) => [s, lengthLabel(s)]), song.seconds, (s) => ((song.seconds = s), keepDraft(), redraw()), "Length")),
    row("Language", lang),
    row("Key", key),
    row("Tempo", h("div.sg-inline", {}, h("input.field.sg-bpm", { type: "number", min: 40, max: 220, step: 1, value: song.bpm, "aria-label": "Beats per minute", on: { change: (e) => ((song.bpm = Math.min(220, Math.max(40, Math.round(Number(e.target.value) || 120)))), (e.target.value = song.bpm), keepDraft()) } }), h("span.sg-unit", {}, "bpm"))),
    row("Time", chips(SIGNATURES.map((s) => [s.value, s.label, s.desc]), song.signature, (v) => ((song.signature = v), keepDraft(), redraw()), "Time signature")));
}

function drawMake() {
  const cost = state.info?.target === "comfy-cloud" ? costOfSong(song.seconds) : null;
  return h("section.sg-card.sg-make", {},
    h("header.sg-head", {}, h("span.sg-label", {}, "The song")),
    h(`button.key.is-primary.sg-go${song.making ? ".is-busy" : ""}`, { type: "button", disabled: song.making, on: { click: make } },
      jicon("note"), song.making ? "Making the song…" : "Make the song", cost ? h("span.sg-cr", {}, cr(cost)) : null),
    h("div.sg-made", {}, ...song.made.map((m) =>
      h("div.sg-track", {}, h("b", {}, m.name), h("em", {}, lengthLabel(Math.round(m.seconds || 0))), h("audio", { controls: true, preload: "metadata", src: m.url })))));
}

// ---------------------------------------------------------------- the page

/** Jam's screen: the song's idea, lyrics and style on the left, its settings and the key that makes it on the right. */
export function renderSong(el) {
  if (!page || !el.contains(page.root)) {
    const area = (field, rows, placeholder, cls = "") => h(`textarea.field.sg-text${cls}`, { rows, placeholder, spellcheck: false, "aria-label": placeholder, on: { input: set(field) } });
    page = { idea: area("idea", 3, "What is the song about?"), tags: area("tags", 4, "Its style: genre, mood, instruments, the voice", ".is-mono"), lyrics: area("lyrics", 14, "Its lyrics, in sections: [Verse 1], [Chorus]…", ".is-mono") };
    page.idea.value = song.idea;
    page.tags.value = song.tags;
    page.lyrics.value = song.lyrics;
    const left = h("div.sg-col");
    const right = h("div.sg-col");
    page.root = h("div.song", {},
      h("header.sg-top", {}, h("h1.jm-h1", {}, "The song"),
        h("button.key", { type: "button", on: { click: () => pickFile("audio/*,video/*", bring) } }, jicon("upload"), "Import a song")),
      h("div.sg-grid", {}, left, right));
    Object.assign(page, { left, right, el });
    redraw = () => {
      left.replaceChildren(drawIdea(), drawWords(), drawStyle());
      right.replaceChildren(drawSettings(), drawMake());
    };
  }
  el.replaceChildren(page.root);
  redraw();
  if (!song.loaded) {
    song.loaded = true;
    api.songs().then((list) => {
      const have = new Set(song.made.map((m) => m.file));
      song.made.push(...list.filter((a) => a.kind === "music" && !have.has(a.file)).slice(0, 4));
      redraw();
    }, () => {});
  }
}
