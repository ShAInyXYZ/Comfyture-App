// The words: the lyrics with each word's timing, the captions' style, and a live preview. Typed words cost
// nothing; hearing them (Comfy finds the vocals and their times) is a key on the track's screen, with its estimate.
import { h } from "../dom.js";
import { changed } from "../store.js";
import { jam, setLine, useLyrics, setCaptions, openWindow, setWorkspace, linesOf } from "../jam.js";
import { cut, setWord, splitLine, addLyric, setLyricSize, setLyricColours, filmLength } from "../cut.js";
import { lyricItems } from "../edit.js";
import { wordsOf } from "../lyrics.js";
import { editor, editorParts } from "./editor.js";
import { bento, jicon, fine, registerWindow } from "./jam-ui.js";

const STYLES = [["karaoke", "Karaoke"], ["pop", "Pop-in"], ["bounce", "Bounce"], ["lower", "Lower third"], ["none", "None"]];
const SIZES = [["S", 0.07], ["M", 0.09], ["L", 0.12], ["XL", 0.16]];
let openLine = null; // the lyric item whose words are shown one by one (null: none was chosen yet, the first; "": none)

/** The lines in the edit: the items, with their words. */
const itemsOf = (b) => (cut.project?.id === b?.cut ? lyricItems(cut.project.body) : []);

// ---------------------------------------------------------------- the lyrics

function wordBlocks(it) {
  const length = Number(it.length) || 3;
  const start = Number(it.start) || 0;
  return h("div.jm-words", {}, ...wordsOf(it).map((w, i) => {
    const dur = Math.max(0.02, w.to - w.from);
    return h("div.jm-word", {},
      h("input.jm-word-text", { value: w.text, "aria-label": `Word ${i + 1}`, on: { change: (e) => setWord(it.id, i, { text: e.target.value.trim() || w.text }), keydown: (e) => e.stopPropagation() } }),
      h("label.jm-word-time", { title: "When the word starts (s, in the film)" }, h("input", { type: "number", step: 0.01, min: 0, value: (start + w.from).toFixed(2), "aria-label": `Word ${i + 1} starts`, on: { change: (e) => setWord(it.id, i, { from: Number(e.target.value) - start }), keydown: (e) => e.stopPropagation() } })),
      h("span.jm-word-bar", {}, h("i", { style: { width: `${Math.min(100, (dur / length) * 100)}%` } })),
      h("label.jm-word-len", { title: "How long the word lasts (s)" }, h("input", { type: "number", step: 0.01, min: 0.02, value: dur.toFixed(2), "aria-label": `Word ${i + 1} lasts`, on: { change: (e) => setWord(it.id, i, { to: w.from + Number(e.target.value) }), keydown: (e) => e.stopPropagation() } }), h("em", {}, "s")));
  }));
}

function lyricRows(b) {
  const items = itemsOf(b);
  if (openLine && !items.some((x) => x.id === openLine)) openLine = null; // (another video's lines)
  const open = openLine === null ? items[0]?.id : items.find((x) => x.id === openLine)?.id;
  return items.map((it, i) => {
    const on = it.id === open;
    return h(`div.jm-line-row${on ? ".is-open" : ""}`, { dataset: { line: String(i) } },
      h("div.jm-line", {},
        h("button.jm-line-at", { type: "button", title: "Play from here", on: { click: () => (editor.seek(Number(it.start) || 0), editor.play()) } }, on ? jicon("play") : null, h("span", {}, fine(Number(it.start) || 0))),
        h("input.jm-line-text", { value: it.text, "aria-label": `Line ${i + 1}`, dataset: { focus: `line:${i}` }, on: { input: (e) => setLine(i, e.target.value, { history: false }), change: (e) => setLine(i, e.target.value), keydown: (e) => e.stopPropagation() } }),
        h("button.jm-line-more", { type: "button", "aria-expanded": String(on), title: on ? "Hide its words" : "Its words, one by one", "aria-label": "Its words", on: { click: () => ((openLine = on ? "" : it.id), changed("jam")) } }, jicon("caret"))),
      on ? wordBlocks(it) : null);
  });
}

function lyricsBento(ctx) {
  const { b, editing } = ctx;
  const items = b?.track ? itemsOf(b) : [];
  const empty = !b?.track
    ? h("div.jm-empty", {}, h("p", {}, "Add a song first: the words are timed to it."), h("button.key", { type: "button", on: { click: () => setWorkspace("track") } }, jicon("disc"), "Go to the track"))
    : !editing
      ? h("div.jm-empty", {}, h("p", {}, b.part ? "Opening the edit…" : "The part is being cut…"))
      : !items.length
        ? h("div.jm-empty", {}, h("p", {}, "No words yet. Type them (free), or have them heard on the track's screen (it shows what that costs)."),
          h("div.jm-row", {}, h("button.key.is-primary", { type: "button", on: { click: () => openWindow("lyrics") } }, jicon("pencil"), "Type the lyrics"), h("button.key", { type: "button", on: { click: () => (setWorkspace("track"), openWindow("hear")) } }, jicon("wave"), "Hear the words")))
        : null;
  return bento({ id: "lyrics", title: "LYRICS", tools: editing ? [h("button.jm-tool-key", { type: "button", title: "A new line at the playhead", "aria-label": "Add a line", on: { click: () => addLyric("New line") } }, jicon("plus"))] : [] },
    empty ?? h("div.jm-lines", { dataset: { scrollKey: "jm-lines" } }, ...lyricRows(b)));
}

// ---------------------------------------------------------------- the captions' style

/** A style shown as it reads, over the artist's picture: the lit word is the one being sung. */
function capSample(style, text) {
  const words = (text || "Feel the rhythm").split(/\s+/).slice(0, 3);
  const mid = Math.min(1, words.length - 1);
  const inner = style === "karaoke" ? [h("b", {}, words[0]), ` ${words.slice(1).join(" ")}`] : style === "pop" ? [...words.slice(0, mid), " ", h("b.is-big", {}, words[mid]), ` ${words.slice(mid + 1).join(" ")}`] : style === "bounce" ? [words.slice(0, mid).join(" "), " ", h("b.is-up", {}, words[mid]), ` ${words.slice(mid + 1).join(" ")}`] : [words.join(" ")];
  return h(`span.jm-cap.is-${style}`, {}, ...(style === "none" ? [] : inner));
}

function styleTiles(b, { big = false } = {}) {
  const now = b?.captions ?? "karaoke";
  const text = linesOf(b)[0]?.text ?? "";
  // the made look of the artist when there is one; else the artist's own picture (a crew picture is on a studio white: it goes into the lilac light)
  const scene = b?.looks?.performance?.url;
  const pic = scene ?? b?.artist?.url ?? "img/jam/stage.svg";
  const crew = !scene && !!b?.artist?.crew;
  return h(`div.jm-capstyles${big ? ".is-big" : ""}`, { role: "radiogroup", "aria-label": "Caption style" }, ...STYLES.map(([id, label]) =>
    h("button.jm-capstyle", { type: "button", role: "radio", "aria-checked": String(now === id), "aria-pressed": String(now === id), dataset: { style: id }, disabled: !b?.track, on: { click: () => setCaptions(id) } },
      h(`span.jm-cap-pic${crew ? ".is-crew" : ""}`, { style: { "--pic": `url("${new URL(pic, document.baseURI).href}")` } }, capSample(id, text)),
      h("span.jm-cap-name", {}, h("i"), label))));
}

function stylesBento(ctx) {
  return bento({ id: "styles", title: "CAPTION STYLES" }, styleTiles(ctx.b));
}

// ---------------------------------------------------------------- the preview

/** The monitor (the editor's: the picture, its captions drawn as they will be in the film) in a phone's frame, with its transport under it. */
export function phone(ctx) {
  const { editing, parts, b } = ctx;
  const progress = h("div.jm-progress", { role: "slider", "aria-label": "Where the film is", on: { pointerdown: (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    const at = (ev) => editor.seek(Math.min(1, Math.max(0, (ev.clientX - box.left) / box.width)) * filmLength());
    at(e);
    const move = (ev) => at(ev);
    const up = () => (removeEventListener("pointermove", move), removeEventListener("pointerup", up));
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
  } } }, h("i", { style: { width: `${Math.min(100, (cut.playhead / (filmLength() || 1)) * 100)}%` } }));
  return editing
    ? h("div.jm-phone-wrap", {}, h("div.jm-phone", {}, parts.stage, h("span.jm-ratio", {}, cut.project?.body.aspect ?? "9:16")), progress, h("div.jm-phone-transport", {}, parts.transport))
    : h("div.jm-phone-wrap", {}, h("div.jm-phone.is-empty", {}, h("img", { src: "img/jam/stage.svg", alt: "", draggable: false }), h("span", {}, b?.track ? "The edit is being made…" : "The video plays here")));
}

function previewBento(ctx) {
  // (its window takes the monitor while it is open: the bento shows the frame empty meanwhile)
  return bento({ id: "preview", title: "PREVIEW", cls: "is-phone" }, jam.win === "preview" ? h("div.jm-phone-wrap", {}, h("div.jm-phone.is-empty", {}, h("span", {}, "In its window"))) : phone(ctx));
}

export function wordsWorkspace(ctx) {
  return [lyricsBento(ctx), stylesBento(ctx), previewBento(ctx)];
}

// ---------------------------------------------------------------- windows

registerWindow("lyrics", {
  title: "LYRICS",
  wide: true,
  build() {
    const b = jam.jam?.body;
    if (!b?.track) return h("p.jm-hint", {}, "Add a song first.");
    const lines = linesOf(b);
    const edited = { text: b.track.lyrics ?? lines.map((l) => l.text).join("\n") };
    const items = itemsOf(b);
    return [
      h("p.jm-note", {}, "A line each. They go on the singing heard, or are spread over the part when none was heard; every word is then timed again, and can be moved in the lyrics."),
      h("textarea.field.jm-lyrics-edit", { rows: 10, value: edited.text, placeholder: "[verse]\nThe words, a line each\n[chorus]\n…", dataset: { focus: "lyrics-text" }, on: { input: (e) => (edited.text = e.target.value), keydown: (e) => e.stopPropagation() } }),
      h("div.jm-row", {},
        h("button.key.is-primary", { type: "button", disabled: !b.part, on: { click: () => (useLyrics(edited.text), openWindow(null)) } }, jicon("check"), "Put them on the singing"),
        items[0] ? h("div.jm-row", {}, ...[["syllables", "Time the words by syllables"], ["even", "Time them evenly"]].map(([how, label]) => h("button.key", { type: "button", on: { click: () => items.forEach((it) => splitLine(it.id, how)) } }, label))) : null),
    ];
  },
});

registerWindow("styles", {
  title: "CAPTION STYLES",
  wide: true,
  build() {
    const b = jam.jam?.body;
    const first = itemsOf(b)[0];
    const size = Number(first?.size) || 0.09;
    const color = first?.color ?? "#FFFFFF";
    const hi = first?.hi ?? "#F2FF59";
    return [
      styleTiles(b, { big: true }),
      h("div.jm-fields", {},
        h("div", {}, h("span.label", {}, "Size"), h("div.jm-lengths", {}, ...SIZES.map(([label, v]) => h("button.jm-chip", { type: "button", "aria-pressed": String(Math.abs(size - v) < 0.012), disabled: !first, on: { click: () => setLyricSize(v) } }, label)))),
        h("label", {}, h("span.label", {}, "The words"), h("input.jm-colour", { type: "color", value: color.toLowerCase(), disabled: !first, on: { change: (e) => setLyricColours({ color: e.target.value }) } })),
        h("label", {}, h("span.label", {}, "The word being sung"), h("input.jm-colour", { type: "color", value: hi.toLowerCase(), disabled: !first, on: { change: (e) => setLyricColours({ hi: e.target.value }) } }))),
      first ? null : h("p.jm-note", {}, "Size and colours go on the words once there are some."),
    ];
  },
});

registerWindow("preview", {
  title: "PREVIEW",
  build() {
    const ctx = { editing: !!jam.jam?.body.part && cut.project?.id === jam.jam.body.cut, parts: editorParts(), b: jam.jam?.body };
    return ctx.editing && ctx.parts ? phone(ctx) : h("p.jm-hint", {}, "The preview is there once the part is cut.");
  },
});
