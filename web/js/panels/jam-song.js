// Jam's first screen, the song. On the left one panel makes it: an idea, a shape, a length, and a key that makes the
// song; Pickle sets the rest up (the style, the lyrics in sections, tempo, key, language, time signature) and every
// setting stays in your hands behind "Edit". The rest of the screen is the stage the song is shown on (its cover and
// the cover brought to life come next). Making costs credits, so it is a key with its estimate on it.
import { h } from "../dom.js";
import { state, toast, waitFor, writer } from "../store.js";
import { api } from "../api.js";
import { dropdown } from "../controls.js";
import { KEYS, LANGUAGES, SIGNATURES, LENGTHS, DEFAULT_SONG, lengthLabel, SECTIONS, STRUCTURES, skeleton, costOfSong } from "../song.js";
import { jicon, pickFile, cr, vinyl, tonearm } from "./jam-ui.js";

const STORE = "comfyture.jam.song.2";
const MINE = ["idea", "structure", "tags", "lyrics", "seconds", "language", "key", "bpm", "signature", "name"];
const song = { idea: "", tags: "", lyrics: "", name: "", ...DEFAULT_SONG, more: false, writing: false, making: false, made: [], shown: null, loaded: false };
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
    sync();
    redraw();
  }
}

async function make() {
  if (song.making) return;
  if (!song.tags.trim()) return toast("Let Pickle set the song up first: say what it is about.");
  song.making = true;
  redraw();
  try {
    const job = await api.makeSong({ tags: song.tags, lyrics: song.lyrics, seconds: song.seconds, bpm: song.bpm, key: song.key, language: song.language, timesignature: song.signature, name: song.name || "New song" });
    const done = await waitFor("job", job.id);
    song.made.unshift({ ...done.audio, tags: song.tags, key: song.key, bpm: song.bpm });
    song.shown = song.made[0].file;
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
    song.shown = song.made[0].file;
    redraw();
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
const languageName = () => LANGUAGES.find((l) => l.value === song.language)?.label ?? song.language;
const lines = () => song.lyrics.split("\n").filter((l) => l.trim() && !/^\s*\[[^\]]+\]\s*$/.test(l)).length;

/** What Pickle set up, as pills: the details behind "Edit". */
function drawSetup() {
  const ready = song.tags.trim();
  const row = (label, ...body) => h("div.sg-row", {}, h("span.sg-field", {}, label), ...body);
  const lang = dropdown({ label: "Language", value: song.language, items: LANGUAGES.map((l) => ({ value: l.value, label: l.label })), onChange: (v) => ((song.language = v), keepDraft(), redraw()), width: "fit" });
  const key = dropdown({ label: "Key", value: song.key, items: KEYS.map((k) => ({ value: k, label: k })), onChange: (v) => ((song.key = v), keepDraft(), redraw()), width: "fit" });
  return h("section.sg-setup", {},
    h("div.sg-setup-head", {},
      h("span.sg-label", {}, "Pickle's setup"),
      ready ? h("button.key.is-quiet", { type: "button", "aria-expanded": String(song.more), on: { click: () => ((song.more = !song.more), redraw()) } }, jicon("pencil"), song.more ? "Done" : "Edit") : null),
    ready || song.more
      ? h("div.sg-pills", {}, ...[song.key, `${song.bpm} bpm`, SIGNATURES.find((s) => s.value === song.signature)?.label, languageName(), lines() ? `${lines()} lines` : "no words"].filter(Boolean).map((t) => h("span.sg-pill", {}, t)))
      : h("p.sg-hint", {}, "Pickle writes the style, the lyrics and the settings from your idea."),
    song.more ? h("div.sg-more", {},
      row("Title", page.name),
      h("div.sg-lyrics-head", {}, h("span.sg-field", {}, "Lyrics"), h("div.sg-tags", {}, ...SECTIONS.map((s) => h("button.key.is-quiet", { type: "button", title: `Add [${s}]`, on: { click: () => addSection(s) } }, s)))),
      page.lyrics,
      h("span.sg-field", {}, "Style"),
      page.tags,
      row("Language", lang),
      row("Key", key),
      row("Tempo", h("div.sg-inline", {}, h("input.field.sg-bpm", { type: "number", min: 40, max: 220, step: 1, value: song.bpm, "aria-label": "Beats per minute", on: { change: (e) => ((song.bpm = Math.min(220, Math.max(40, Math.round(Number(e.target.value) || 120)))), (e.target.value = song.bpm), keepDraft(), redraw()) } }), h("span.sg-unit", {}, "bpm"))),
      row("Time", chips(SIGNATURES.map((s) => [s.value, s.label, s.desc]), song.signature, (v) => ((song.signature = v), keepDraft(), redraw()), "Time signature"))) : null);
}

function drawPanel() {
  const cost = state.info?.target === "comfy-cloud" ? costOfSong(song.seconds) : null;
  return [
    h("div.sg-panel-head", {}, h("h1.sg-title", {}, "The song"),
      h("button.key.is-quiet", { type: "button", title: "Import a song", "aria-label": "Import a song", on: { click: () => pickFile("audio/*,video/*", bring) } }, jicon("upload"), "Import")),
    h("div.sg-scroll", {},
      h("section.sg-idea", {},
        h("div.sg-ask", {}, h("img.sg-pickle", { src: "brand/cast/pickle-face.webp", alt: "Pickle", draggable: false }), page.idea),
        h("button.key.is-primary.sg-set", { type: "button", disabled: song.writing, on: { click: setUp } }, jicon("pencil"), song.writing ? "Pickle is writing…" : "Pickle, set it up")),
      h("section.sg-field-block", {}, h("span.sg-label", {}, "Shape"), chips(STRUCTURES.map((s) => [s.id, s.label, s.desc, blocks(s.id)]), song.structure, pickStructure, "Shape")),
      h("section.sg-field-block", {}, h("span.sg-label", {}, "Length"), chips(LENGTHS.map((s) => [s, lengthLabel(s)]), song.seconds, (s) => ((song.seconds = s), keepDraft(), redraw()), "Length")),
      drawSetup()),
    h("div.sg-foot", {},
      h(`button.key.is-primary.sg-go${song.making ? ".is-busy" : ""}`, { type: "button", disabled: song.making, on: { click: make } },
        jicon("note"), song.making ? "Making the song…" : "Make the song", cost ? h("span.sg-cr", {}, cr(cost)) : null),
      h("p.sg-hint", {}, "Full songs sound best. Cut your favourite part next.")),
  ];
}

// ---------------------------------------------------------------- the stage

function drawStage() {
  const shown = song.made.find((m) => m.file === song.shown) ?? null;
  const title = (shown?.name ?? song.name) || "New song";
  const readout = shown ? `${lengthLabel(Math.round(shown.seconds || 0))}${shown.key ? ` · ${shown.key}` : ""}${shown.bpm ? ` · ${shown.bpm} bpm` : ""}` : `${song.key} · ${song.bpm} bpm · ${lengthLabel(song.seconds)}`;
  const audio = shown ? h("audio.sg-audio", { controls: true, preload: "metadata", src: shown.url, on: { play: () => page.root.classList.add("is-playing"), pause: () => page.root.classList.remove("is-playing"), ended: () => page.root.classList.remove("is-playing") } }) : null;
  return [
    h("div.sg-record", {}, h("div.sg-deck", {}, vinyl(), tonearm()),
      h("div.sg-label-block", {}, h("h2.sg-name", {}, title), h("p.sg-readout", {}, readout), shown ? audio : h("p.sg-hint", {}, song.making ? "Making it…" : "Not made yet"))),
    song.made.length ? h("div.sg-shelf", {}, h("span.sg-label", {}, "Songs"),
      h("div.sg-sleeves", {}, ...song.made.map((m) => h(`button.sg-sleeve${m.file === song.shown ? ".is-on" : ""}`, { type: "button", title: m.name, on: { click: () => ((song.shown = m.file), page.root.classList.remove("is-playing"), redraw()) } },
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
      lyrics: area("lyrics", 12, "Its lyrics, in sections: [Verse 1], [Chorus]…", ".is-mono"),
      name: h("input.field.sg-name-field", { type: "text", maxlength: 40, placeholder: "A title", "aria-label": "Title", on: { input: set("name") } }),
    };
    sync();
    const panel = h("aside.sg-panel", { "aria-label": "Make the song" });
    const stage = h("main.sg-stage");
    page.root = h("div.song", {}, panel, stage);
    redraw = () => {
      panel.replaceChildren(...drawPanel());
      stage.replaceChildren(...drawStage());
    };
  }
  el.replaceChildren(page.root);
  redraw();
  if (!song.loaded) {
    song.loaded = true;
    api.songs().then((list) => {
      const have = new Set(song.made.map((m) => m.file));
      song.made.push(...list.filter((a) => a.kind === "music" && !have.has(a.file)).slice(0, 6));
      redraw();
    }, () => {});
  }
}
