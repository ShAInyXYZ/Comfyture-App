// The words: the lyrics as a timed list (each line with when it is sung and a dot for each of its words, which can be dragged), the
// video in a phone with the captions drawn live, a gallery of eight caption styles, the few controls of how they read (size, where,
// colour, how a word arrives), and at the foot the two keys: hear the words (Comfy writes them down with their times, it costs
// credits) and style the captions. Typed words cost nothing.
import { h } from "../dom.js";
import { changed, toast } from "../store.js";
import { jam, setLine, useLyrics, setCaptions, openWindow, setWorkspace, linesOf, applySyncedCaptions, save } from "../jam.js";
import { syncedLinesForCut } from "../song-lyrics.js";
import { syncSongFile } from "../song-sync.js";
import { cut, setWord, splitLine, addLyric, setLyricSize, setLyricColours, setLyricPlace, setLyricAnim, filmLength } from "../cut.js";
import { lyricItems } from "../edit.js";
import { wordsOf, LOOKS, ANIMS } from "../lyrics.js";
import { editor, editorParts } from "./editor.js";
import { jicon, clock, fine, registerWindow, lamp } from "./jam-ui.js";
import { card } from "./jam-card.js";
import { captionSample } from "./jam-words-look.js";

/** The eight styles of the gallery, in the order it shows them; the older plain ones are chips under it. */
const GALLERY = ["karaoke", "stack", "type", "neon", "outline", "hand", "minimal", "comic"];
const PLAIN = [["pop", "Pop-in"], ["bounce", "Bounce"], ["lower", "Lower third"], ["none", "Off"]];
const SIZES = [["S", 0.07], ["M", 0.09], ["L", 0.12], ["XL", 0.16]];
const PLACES = [["top", 0.2, "At the top"], ["mid", 0.5, "In the middle"], ["bottom", 0.74, "At the bottom"]];
/** The brand's colours as a caption may wear them: yellow, ink, white, plum. */
const BRAND = ["#F2FF59", "#211927", "#FFFFFF", "#49378B"];
let openLine = null; // the lyric item whose words are shown one by one (null: none was chosen yet, the first; "": none)

/** The lines in the edit: the items, with their words. */
const itemsOf = (b) => (b && cut.project && cut.project.id === b.cut ? lyricItems(cut.project.body) : []);

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
      h("label.jm-word-len", { title: "How long the word lasts (s)" }, h("input", { type: "number", step: 0.01, min: 0.02, value: dur.toFixed(2), "aria-label": `Word ${i + 1} lasts`, on: { change: (e) => setWord(it.id, i, { to: w.from + Number(e.target.value) }), keydown: (e) => e.stopPropagation() } })));
  }));
}

/** A dot for each word along a line, where the word starts; dragged, a dot moves its word (and ends the one before it there). */
function dotsOf(it) {
  const len = Number(it.length) || 3;
  const ws = wordsOf(it);
  const track = h("div.jw-dots", { dataset: { id: it.id } }, ...ws.map((w, i) => h("i.jw-dot", { dataset: { i: String(i) }, style: { left: `${Math.min(97, (w.from / len) * 100)}%` }, title: `${w.text}: ${w.from.toFixed(2)} s (drag to move it)` })));
  track.addEventListener("pointerdown", (e) => {
    const dot = e.target.closest(".jw-dot");
    if (!dot) return;
    e.preventDefault();
    e.stopPropagation();
    const i = Number(dot.dataset.i);
    const box = track.getBoundingClientRect();
    const lo = i > 0 ? ws[i - 1].from + 0.03 : 0;
    const hi = (ws[i + 1]?.from ?? len) - 0.03;
    let at = ws[i].from;
    dot.setPointerCapture(e.pointerId);
    dot.classList.add("is-drag");
    const move = (ev) => {
      at = Math.round(Math.min(hi, Math.max(lo, ((ev.clientX - box.left) / box.width) * len)) * 100) / 100;
      dot.style.left = `${Math.min(97, (at / len) * 100)}%`;
    };
    const up = () => {
      dot.removeEventListener("pointermove", move);
      dot.classList.remove("is-drag");
      if (Math.abs(at - ws[i].from) < 0.005) return;
      if (i > 0) setWord(it.id, i - 1, { to: at }, { history: false });
      setWord(it.id, i, { from: at });
    };
    dot.addEventListener("pointermove", move);
    dot.addEventListener("pointerup", up, { once: true });
  });
  return track;
}

let rows = []; // the rows on screen: [{ el, it }], for the lit line and the lit dots while the film plays
function lyricRows(b) {
  const items = itemsOf(b);
  if (openLine && !items.some((x) => x.id === openLine)) openLine = null; // (another video's lines)
  const open = openLine === null ? null : items.find((x) => x.id === openLine)?.id ?? null;
  rows = [];
  return items.map((it, i) => {
    const on = it.id === open;
    const row = h(`div.jm-line-row.jw-row${on ? ".is-open" : ""}`, { dataset: { line: String(i) } },
      h("div.jm-line.jw-line", {},
        h("button.jw-at", { type: "button", title: `Play from here (${fine(Number(it.start) || 0)})`, on: { click: () => (editor.seek(Number(it.start) || 0), editor.play()) } }, clock(Number(it.start) || 0)),
        h("div.jw-body", {},
          h("input.jw-text", { value: it.text, "aria-label": `Line ${i + 1}`, dataset: { focus: `line:${i}` }, on: { input: (e) => setLine(i, e.target.value, { history: false }), change: (e) => setLine(i, e.target.value), keydown: (e) => e.stopPropagation() } }),
          dotsOf(it)),
        h("button.jw-more", { type: "button", "aria-expanded": String(on), title: on ? "Hide its words" : "Its words, one by one", "aria-label": "Its words", on: { click: () => ((openLine = on ? "" : it.id), changed("jam")) } }, jicon("expand"))),
      on ? wordBlocks(it) : null);
    rows.push({ el: row, it });
    return row;
  });
}

// the line being sung is lit, and the dots of the words already sung, while the film plays
let lit = 0;
function light() {
  cancelAnimationFrame(lit);
  const t = cut.playhead;
  for (const { el, it } of rows) {
    if (!el.isConnected) continue;
    const rel = t - (Number(it.start) || 0);
    const len = Number(it.length) || 3;
    const now = rel >= 0 && rel < len;
    el.classList.toggle("is-now", now);
    const ws = wordsOf(it);
    el.querySelectorAll(".jw-dot").forEach((dot, i) => {
      const w = ws[i];
      dot.classList.toggle("is-sung", now && !!w && rel >= w.from);
      dot.classList.toggle("is-on", now && !!w && rel >= w.from && rel < w.to);
    });
  }
  if (editor.playing) lit = requestAnimationFrame(light);
}
document.addEventListener("editor:play", () => requestAnimationFrame(light));
document.addEventListener("editor:stop", () => requestAnimationFrame(light));

function lyricsCard(ctx) {
  const { b, editing } = ctx;
  const items = b?.track ? itemsOf(b) : [];
  const empty = !b?.track
    ? h("div.jw-empty", {}, h("p", {}, "Add a song first: the words are timed to it."), h("button.key", { type: "button", on: { click: () => setWorkspace("track") } }, jicon("disc"), "Go to the track"))
    : !editing
      ? h("div.jw-empty", {}, h("p", {}, b.part ? "Opening the edit…" : "The part is being cut…"))
      : !items.length
        ? h("div.jw-empty", {}, h("p", {}, "No words yet. Type them (free), or have them heard (it shows what that costs)."),
          h("div.jm-row", {}, h("button.key.is-primary", { type: "button", on: { click: () => openWindow("lyrics") } }, jicon("pencil"), "Type the lyrics")))
        : null;
  return card({ id: "lyrics", title: "LYRICS & TIMING", cls: "is-label", win: "lyrics", tools: editing ? [h("button.jt-expand", { type: "button", title: "A new line at the playhead", "aria-label": "Add a line", on: { click: () => addLyric("New line") } }, jicon("plus"))] : [] },
    empty ?? h("div.jw-lines", { dataset: { scrollKey: "jw-lines" } }, ...lyricRows(b)));
}

// ---------------------------------------------------------------- the captions' style

/** The picture a style is shown over: the made look of the artist, else the artist's own picture, else the stage. */
function pictureOf(b) {
  const scene = b?.looks?.performance?.url;
  const pic = scene ?? b?.artist?.url ?? "img/jam/stage.svg";
  return { url: new URL(pic, document.baseURI).href, crew: !scene && !!b?.artist?.crew };
}

function styleTiles(b, { big = false } = {}) {
  const now = b?.captions ?? "karaoke";
  const text = linesOf(b)[0]?.text ?? "";
  const first = itemsOf(b)[0];
  const pic = pictureOf(b);
  // (the colours a line names are worn by the samples too: what is on screen is what the film will have)
  const wear = { color: first?.color, hi: first?.hi };
  return h(`div.jw-styles${big ? ".is-big" : ""}`, { role: "radiogroup", "aria-label": "Caption style" },
    ...GALLERY.map((id) =>
      h("button.jw-style", { type: "button", role: "radio", "aria-checked": String(now === id), "aria-pressed": String(now === id), dataset: { style: id }, disabled: !b?.track, title: LOOKS[id].name, on: { click: () => setCaptions(id) } },
        h(`span.jw-style-pic${pic.crew ? ".is-crew" : ""}`, { style: { "--pic": `url("${pic.url}")` } }, captionSample(id, text, wear)),
        h("span.jw-style-name", {}, LOOKS[id].name))));
}

function plainChips(b) {
  const now = b?.captions ?? "karaoke";
  return h("div.jt-fchips.jw-plain", {}, h("span.label", {}, "Also"), ...PLAIN.map(([id, label]) => h("button.jt-fchip", { type: "button", "aria-pressed": String(now === id), disabled: !b?.track, on: { click: () => setCaptions(id) } }, label)));
}

function stylesCard(ctx) {
  return card({ id: "styles", title: "CAPTION STYLES", cls: "is-label" }, styleTiles(ctx.b), plainChips(ctx.b));
}

const near = (a, b) => Math.abs(a - b) < 0.012;
function controlsCard(ctx) {
  const { b } = ctx;
  const items = itemsOf(b);
  const first = items[0];
  const off = !first;
  const size = Number(first?.size) || 0.09;
  const y = Number(first?.y) || 0.74;
  const color = (first?.color ?? "#FFFFFF").toUpperCase();
  const hi = (first?.hi ?? LOOKS[b?.captions]?.hi ?? "#F2FF59").toUpperCase();
  const anim = first?.anim ?? LOOKS[b?.captions ?? "karaoke"]?.anim ?? "fill";
  const chips = (value, set, label) => h("div.jw-chips", { role: "group", "aria-label": label, dataset: { for: label === "The words" ? "Words" : "Lit" } },
    ...BRAND.map((c) => h("button.jw-chip", { type: "button", disabled: off, "aria-pressed": String(c === value), title: `${label} ${c}`, style: { "--c": c }, on: { click: () => set(c) } })),
    h("label.jw-chip.is-custom", { title: `${label}: another colour` }, h("input", { type: "color", value: value.toLowerCase(), disabled: off, "aria-label": `${label}, another colour`, on: { change: (e) => set(e.target.value) } })));
  return card({ id: "controls", title: "STYLE CONTROLS", cls: "is-label", win: "styles" },
    h("div.jw-ctl", {},
      h("div.jw-field.is-wide", {}, h("span.label", {}, "Size"),
        h("div.jw-size", {}, h("i", {}, "A"), h("input", { type: "range", min: 0.05, max: 0.18, step: 0.005, value: size, disabled: off, "aria-label": "Size of the captions", title: "How big the words are", on: { input: (e) => setLyricSizeQuietly(Number(e.target.value)), change: (e) => setLyricSize(Number(e.target.value)) } }), h("b", {}, "A"))),
      h("div.jw-field", {}, h("span.label", {}, "Position"),
        h("div.jt-segs.is-icons", { role: "group", "aria-label": "Where the captions sit" }, ...PLACES.map(([id, v, title]) => h("button.jt-seg", { type: "button", disabled: off, "aria-pressed": String(near(y, v)), title, "aria-label": title, on: { click: () => setLyricPlace(v) } }, jicon(id))))),
      h("div.jw-field", {}, h("span.label", {}, "Animation"),
        h("select.field.jw-anim", { disabled: off, "aria-label": "How a word arrives", title: "How a word arrives (the style's own is the first)", on: { change: (e) => setLyricAnim(e.target.value === (LOOKS[b?.captions]?.anim ?? "fill") ? null : e.target.value) } },
          ...ANIMS.map(([v, label]) => h("option", { value: v, selected: v === anim }, label)))),
      h("div.jw-field.is-wide", {}, h("span.label", {}, "Brand colour"), h("div.jw-colours", {}, chips(hi, (c) => setLyricColours({ hi: c }), "The word being sung"), chips(color, (c) => setLyricColours({ color: c }), "The words"))),
      off ? h("p.jt-note.is-wide", {}, "Size, place and colours go on the words once there are some.") : null));
}
// (the size slider moves the words as it is dragged, without an undo step for each tick: the step is made when it is let go)
function setLyricSizeQuietly(v) {
  for (const it of itemsOf(jam.jam?.body)) it.size = Math.round(v * 1000) / 1000;
  editor.show();
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
  // (before there is a picture of the video, the artist's, or the stage, is behind the captions)
  const back = pictureOf(b);
  parts?.stage?.style.setProperty("--back", `url("${back.url}")`);
  return editing
    ? h("div.jm-phone-wrap", {}, h("div.jm-phone", {}, parts.stage, h("span.jm-ratio", {}, cut.project?.body.aspect ?? "9:16")), progress, h("div.jm-phone-transport", {}, parts.transport))
    : h("div.jm-phone-wrap", {}, h("div.jm-phone.is-empty", {}, h("img", { src: "img/jam/stage.svg", alt: "", draggable: false }), h("span", {}, b?.track ? "The edit is being made…" : "The video plays here")));
}

let shown = "";
/** The preview of a video shows a caption when it is first looked at: it stands in the middle of the first line (not on the film's first frame). */
function showFirstLine(b) {
  const first = itemsOf(b)[0];
  if (!first || shown === cut.project.id || editor.playing || cut.playhead > 0.05) return;
  shown = cut.project.id;
  requestAnimationFrame(() => editor.seek((Number(first.start) || 0) + Math.min(1.4, (Number(first.length) || 3) * 0.4)));
}

function previewCard(ctx) {
  showFirstLine(ctx.b);
  // (its window takes the monitor while it is open: the card shows the frame empty meanwhile)
  return h("section.jt-card.jw-preview", { dataset: { card: "preview" } },
    h("button.jt-expand.is-corner", { type: "button", title: "The preview in a window", "aria-label": "The preview in a window", on: { click: () => openWindow("preview") } }, jicon("expand")),
    jam.win === "preview" ? h("div.jm-phone-wrap", {}, h("div.jm-phone.is-empty", {}, h("span", {}, "In its window"))) : phone(ctx));
}

// ---------------------------------------------------------------- the foot: the two keys

let syncArmedFor = null;
async function syncWords(j) {
  const track = j?.body.track;
  if (!track || jam.busy.has("song-sync", j)) return;
  if (syncArmedFor !== track.file) { syncArmedFor = track.file; changed("jam"); return; }
  syncArmedFor = null;
  jam.busy.add("song-sync", j);
  changed("jam");
  try {
    const result = await syncSongFile(track);
    if (j.body.track?.file !== track.file) return;
    Object.assign(j.body.track, result);
    save(j);
    await applySyncedCaptions(j);
  } catch (e) { toast(e.message, { tone: "crit" }); }
  finally { jam.busy.delete("song-sync", j); changed("jam"); }
}

function foot(ctx) {
  const { b } = ctx;
  const synced = !!b?.track && syncedLinesForCut(b.track, b.span) !== null;
  const busy = jam.busy.has("song-sync");
  const has = !!b?.track && itemsOf(b).length > 0;
  return h("footer.jw-foot", {},
    h("button.jw-hear", { type: "button", disabled: !b?.track?.lyrics?.trim() || synced || busy, title: synced ? "The song's lyrics are already synced" : "Transcribe the full mix and match its lyrics. Uses Comfy Cloud GPU time.", on: { click: () => syncWords(jam.jam) } },
      busy ? lamp("busy") : jicon("play"), h("b", {}, busy ? "Syncing lyrics…" : synced ? "Lyrics synced" : syncArmedFor === b?.track?.file ? "Confirm sync · Cloud GPU cost" : "Sync lyrics")),
    h("button.jt-primary.jw-style-it", { type: "button", disabled: !has, title: has ? "These captions are done: the band is next" : "Words first: type them, or have them heard", on: { click: () => styleDone() } },
      jicon("sparkle"), h("span", {}, "Style the captions")));
}
/** The captions are as they should be: the step is done, and the band is next. */
function styleDone() {
  const j = jam.jam;
  if (!j) return;
  j.body.captionsSet = true;
  save();
  changed("jam");
  setWorkspace("band");
}

// ---------------------------------------------------------------- the workspace

export function wordsWorkspace(ctx) {
  if (ctx.b?.part && syncedLinesForCut(ctx.b.track, ctx.b.span) !== null) applySyncedCaptions(jam.jam).catch((e) => toast(e.message, { tone: "crit" }));
  return [h("div.jw", {}, lyricsCard(ctx), previewCard(ctx), h("div.jw-right", {}, stylesCard(ctx), controlsCard(ctx)), foot(ctx))];
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
    return [styleTiles(b, { big: true }), plainChips(b), controlsCard({ b }).querySelector(".jw-ctl")];
  },
});

registerWindow("preview", {
  title: "PREVIEW",
  build() {
    const ctx = { editing: !!jam.jam?.body.part && cut.project?.id === jam.jam.body.cut, parts: editorParts(), b: jam.jam?.body };
    return ctx.editing && ctx.parts ? phone(ctx) : h("p.jm-hint", {}, "The preview is there once the part is cut.");
  },
});
