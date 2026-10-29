// The Words: one timed caption editor, using the song's sync and the film's actual render path.
import { h } from "../dom.js";
import { api } from "../api.js";
import { changed, toast } from "../store.js";
import { jam, useLyrics, setCaptions, openWindow, setWorkspace, linesOf, applySyncedCaptions, save, setSpan } from "../jam.js";
import { syncedLinesForCut } from "../song-lyrics.js";
import { syncSongFile } from "../song-sync.js";
import { cut, setWord, splitLine, addLyric, removeItem, setItem, setLyricStyle, setLyricSize, setLyricColours, setLyricPlace, setLyricAnim, filmLength, commit, undo, redo } from "../cut.js";
import { lyricItems, retext } from "../edit.js";
import { wordsOf, LOOKS, ANIMS } from "../lyrics.js";
import { CAPTION_LANGUAGES, captionLanguage, captionText, captionTimingPatch, captionSubtitles, needsRomanization } from "../jam-caption-language.js";
import { editor, editorParts } from "./editor.js";
import { jicon, clock, fine, registerWindow, lamp } from "./jam-ui.js";
import { card } from "./jam-card.js";

const STYLES = [["plain", "Plain", "A quiet line"], ["karaoke", "Karaoke", "Follow the words"], ["pop", "Pop", "Word by word"], ["type", "Typewriter", "Built as you speak"], ["neon", "Neon", "A soft colour glow"], ["lower", "Lower third", "A caption strip"]];
const PLACES = [["top", 0.2, "Top"], ["mid", 0.5, "Centre"], ["bottom", 0.82, "Bottom"]];
let selectedLine = null;
let selectedProject = null;
let scope = "all";
let follow = true;
let syncArmedFor = null;
let fullSongArmedFor = null;
let romanBusy = false;
let romanError = "";
let rows = [];
let playFrame = 0;
let progressSlider = null;
let lastActive = null;
let shownProject = null;
let romanAttemptedKey = "";
let undoKey = null;
let redoKey = null;

const repaint = () => { refreshLyricRows(); refreshHistoryControls(); editor.show(); changed("jam"); };
const editItem = (item, patch) => { setItem(item.id, patch); repaint(); };
const editWord = (item, i, patch) => { if (patch.text !== undefined) delete item.romanization; setWord(item.id, i, patch); repaint(); };

const itemsOf = (b) => b && cut.project && cut.project.id === b.cut ? lyricItems(cut.project.body) : [];
const modeOf = (b) => captionLanguage(b && cut.project && cut.project.id === b.cut ? cut.project.body.captionLanguage ?? itemsOf(b)[0]?.captionLanguage ?? b?.captionLanguage : b?.captionLanguage);
const selectedOf = (b) => itemsOf(b).find((item) => item.id === selectedLine) ?? itemsOf(b)[0];
const clipDuration = (b) => Math.max(0, Number(b?.part?.seconds) || ((b?.span?.to ?? 0) - (b?.span?.from ?? 0)) || filmLength());
const stopKeys = (e) => e.stopPropagation();
const synced = (b) => !!b?.track && syncedLinesForCut(b.track, b.span) !== null;
const isFullSong = (b) => !!b?.track && (b.span?.from ?? 0) < .1 && Math.abs((b.span?.to ?? 0) - b.track.seconds) < .15;

function chooseLine(item) {
  selectedLine = item.id;
  cut.selected = item.id;
  // Pause inside the visible caption, beyond its opening fade.
  editor.seek((Number(item.start) || 0) + Math.min(.2, (Number(item.length) || 1) / 2));
  changed("jam");
}

function putText(item, value) {
  const text = value.trim();
  if (!text || text === item.text) return;
  retext(item, text.slice(0, 500));
  delete item.romanization;
  commit();
  repaint();
}

function retime(item, from, to, b) {
  try { editItem(item, captionTimingPatch(item, from, to, clipDuration(b))); }
  catch (e) { toast(e.message, { tone: "crit" }); changed("jam"); }
}

/** Romanization is computed locally by the existing API, never a paid media generation. */
async function chooseLanguage(mode, { history = true } = {}) {
  const j = jam.jam;
  const project = cut.project;
  const b = j?.body;
  if (!b || !project || romanBusy) return;
  const items = itemsOf(b);
  const wanted = captionLanguage(mode);
  b.captionLanguage = wanted;
  project.body.captionLanguage = wanted;
  for (const item of items) item.captionLanguage = wanted;
  save(j);
  commit({ history });
  if (wanted === "original") return;
  const missing = items.filter((item) => needsRomanization(item.text) && !item.romanization?.trim());
  if (!missing.length) return;
  const texts = [...new Set(missing.map((item) => item.text))];
  romanAttemptedKey = JSON.stringify([project.id, texts]);
  romanBusy = true;
  romanError = "";
  changed("jam");
  try {
    const result = await api.romanizeSong({ lines: texts });
    if (jam.jam !== j || cut.project !== project) return;
    const readings = new Map(texts.map((text, i) => [text, result.lines?.[i] ?? ""]));
    for (const item of itemsOf(b)) if (!item.romanization?.trim() && readings.has(item.text)) item.romanization = readings.get(item.text);
    commit({ history: false });
  } catch (e) {
    romanError = e.message || "The reading could not be prepared. Try again.";
    toast(romanError, { tone: "crit" });
  } finally {
    romanBusy = false;
    changed("jam");
  }
}

function languageControl(b) {
  const mode = modeOf(b);
  return h("div.jw-language", {},
    h("div.jt-segs", { role: "group", "aria-label": "Caption language" }, ...CAPTION_LANGUAGES.map(([id, name]) => h("button.jt-seg", { type: "button", disabled: !itemsOf(b).length || romanBusy, "aria-pressed": String(mode === id), on: { click: () => chooseLanguage(id) } }, name))),
    romanBusy ? h("span.jw-status", { role: "status" }, "Preparing reading…") : null,
    romanError ? h("button.jw-textkey", { type: "button", title: romanError, on: { click: () => chooseLanguage(mode) } }, "Retry reading") : null);
}

function syncButton(b) {
  const busy = jam.busy.has("song-sync");
  const done = synced(b);
  return h("button.jw-sync", { type: "button", disabled: !b?.track?.file || done || busy, title: done ? "The song and captions use the same saved lyric timestamps" : b?.track?.lyrics?.trim() ? "Match the saved lyrics to this track. The confirmation uses Comfy Cloud GPU time." : "Transcribe the full audio track. The confirmation uses Comfy Cloud GPU time.", on: { click: () => syncWords(jam.jam) } }, busy ? lamp("busy") : jicon(done ? "check" : "wave"), busy ? "Syncing…" : done ? "Lyrics synced" : syncArmedFor === b?.track?.file ? "Confirm sync · GPU cost" : "Sync lyrics");
}

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

function fullSong(b) {
  if (!b?.track || isFullSong(b)) return;
  if (fullSongArmedFor !== b.track.file) { fullSongArmedFor = b.track.file; changed("jam"); return; }
  fullSongArmedFor = null;
  editor.stop();
  setSpan(0, b.track.seconds);
}

function toolbar(ctx) {
  const { b, editing } = ctx;
  const full = isFullSong(b);
  undoKey = h("button.jt-expand", { type: "button", disabled: !editing || !cut.history.length, title: "Undo caption edit", "aria-label": "Undo", on: { click: () => { undo(); repaint(); } } }, jicon("undo"));
  redoKey = h("button.jt-expand", { type: "button", disabled: !editing || !cut.future.length, title: "Redo caption edit", "aria-label": "Redo", on: { click: () => { redo(); repaint(); } } }, jicon("redo"));
  return h("header.jw-toolbar", {},
    h("div.jw-range", {}, h("b", {}, full ? "Full song" : "Selected clip"), h("span", {}, `${clock(b?.span?.from ?? 0)}–${clock(b?.span?.to ?? 0)}`),
      h("button.jw-textkey", { type: "button", disabled: !b?.track, on: { click: () => setWorkspace("track") } }, "Change range"),
      !full && b?.track ? h("button.jw-textkey", { type: "button", disabled: jam.busy.has("part"), title: "Use the complete song. Existing shot planning for the old clip is reset.", on: { click: () => fullSong(b) } }, fullSongArmedFor === b.track.file ? "Confirm full song · reset clip plan" : "Use full song") : null),
    h("div.jw-toolbar-keys", {}, syncButton(b), undoKey, redoKey));
}

function refreshHistoryControls() {
  const b = jam.jam?.body;
  const editing = !!b && cut.project?.id === b.cut;
  if (undoKey) undoKey.disabled = !editing || !cut.history.length;
  if (redoKey) redoKey.disabled = !editing || !cut.future.length;
}

function lyricRows(b) {
  const items = itemsOf(b);
  const mode = modeOf(b);
  rows = [];
  return items.map((item, index) => {
    const active = item.id === selectedOf(b)?.id;
    const copy = h("span.jw-caption-copy");
    const from = h("span"), to = h("span");
    const row = h(`button.jw-caption-row${active ? ".is-selected" : ""}`, { type: "button", "aria-pressed": String(active), dataset: { line: item.id }, on: { click: () => chooseLine(item) } },
      h("span.jw-caption-index", {}, String(index + 1).padStart(2, "0")),
      copy, h("span.jw-caption-time", {}, from, to));
    const entry = { el: row, it: item, copy, from, to };
    paintLyricRow(entry, item, mode);
    rows.push(entry);
    return row;
  });
}

function paintLyricRow(row, item, mode) {
  row.it = item;
  const primary = mode === "romaji" && item.romanization ? item.romanization : item.text;
  const secondary = mode === "both" && item.romanization && item.romanization !== item.text ? item.romanization : "";
  row.copy.replaceChildren(h("span.jw-caption-original", {}, primary), ...(secondary ? [h("span.jw-caption-roman", {}, secondary)] : []));
  row.from.textContent = fine(Number(item.start) || 0);
  row.to.textContent = fine((Number(item.start) || 0) + (Number(item.length) || 0));
}

/** The app defers page redraws while a field has focus. Update read-only output
 * directly so tabbing from lyrics to timing still shows the committed edit. */
function refreshLyricRows() {
  const b = jam.jam?.body;
  const items = new Map(itemsOf(b).map((item) => [item.id, item]));
  const mode = modeOf(b);
  for (const row of rows) {
    const item = items.get(row.it.id);
    if (item && row.el.isConnected) paintLyricRow(row, item, mode);
  }
}

function wordBlocks(item) {
  const start = Number(item.start) || 0;
  // The renderer sorts normalized copies. Keep the source index so moving a word
  // past its neighbour does not redirect the next edit to that neighbour.
  const words = item.words?.length
    ? item.words.flatMap((word, index) => word && String(word.text ?? "").trim() ? [{ ...wordsOf({ ...item, words: [word] })[0], index }] : []).sort((a, b) => a.from - b.from)
    : wordsOf(item).map((word, index) => ({ ...word, index }));
  return h("div.jw-word-table", {},
    h("div.jw-word-head", {}, h("span", {}, "Word / phrase"), h("span", {}, "Start (s)"), h("span", {}, "End (s)")),
    ...words.map((word, i) => h("div.jw-word-edit", {},
      h("input.field", { value: word.text, "aria-label": `Word ${i + 1}`, on: { change: (e) => editWord(item, word.index, { text: e.target.value.trim() || word.text }), keydown: stopKeys } }),
      h("input.field", { type: "number", step: .01, min: start, max: start + item.length, value: (start + word.from).toFixed(2), "aria-label": `Word ${i + 1} starts at seconds`, on: { change: (e) => editWord(item, word.index, { from: Number(e.target.value) - start }), keydown: stopKeys } }),
      h("input.field", { type: "number", step: .01, min: start, max: start + item.length, value: (start + word.to).toFixed(2), "aria-label": `Word ${i + 1} ends at seconds`, on: { change: (e) => editWord(item, word.index, { to: Number(e.target.value) - start }), keydown: stopKeys } }))));
}

function lineEditor(b) {
  const item = selectedOf(b);
  if (!item) return null;
  const index = itemsOf(b).indexOf(item);
  return h("section.jw-line-editor", { "aria-label": `Edit caption ${index + 1}` },
    h("header.jw-subhead", {}, h("b", {}, `Caption ${index + 1}`), h("button.jw-textkey", { type: "button", on: { click: () => (editor.seek(Number(item.start) || 0), editor.play()) } }, jicon("play"), "Listen"),
      h("button.jt-expand", { type: "button", title: "Delete this caption (Undo restores it)", "aria-label": "Delete selected caption", on: { click: () => { removeItem(item.id); selectedLine = null; } } }, jicon("trash"))),
    h("label.jw-field", {}, h("span.label", {}, "Original text"), h("textarea.field.jw-caption-input", { rows: 2, value: item.text, dataset: { focus: `caption-text:${item.id}` }, "aria-label": "Original caption text", on: { change: (e) => putText(item, e.target.value), keydown: stopKeys } })),
    modeOf(b) !== "original" || item.romanization ? h("label.jw-field", {}, h("span.label", {}, "Romaji / pronunciation"), h("textarea.field.jw-caption-input.is-reading", { rows: 2, value: item.romanization ?? "", placeholder: romanBusy ? "Preparing the reading…" : "Add or correct the reading", dataset: { focus: `caption-roman:${item.id}` }, "aria-label": "Romanized caption text", on: { change: (e) => editItem(item, { romanization: e.target.value.trim() }), keydown: stopKeys } })) : null,
    h("div.jw-line-times", {},
      h("label.jw-field", {}, h("span.label", {}, "Start · seconds"), h("input.field", { type: "number", step: .01, min: 0, max: clipDuration(b), value: Number(item.start).toFixed(2), "aria-label": "Caption start in seconds", on: { change: (e) => retime(item, e.target.value, Number(item.start) + Number(item.length), b), keydown: stopKeys } })),
      h("label.jw-field", {}, h("span.label", {}, "End · seconds"), h("input.field", { type: "number", step: .01, min: 0, max: clipDuration(b), value: (Number(item.start) + Number(item.length)).toFixed(2), "aria-label": "Caption end in seconds", on: { change: (e) => retime(item, item.start, e.target.value, b), keydown: stopKeys } }))),
    h("details.jw-word-details", {}, h("summary", {}, "Fine-tune word timing"), h("p.jw-note", {}, "Line timings come from sync. Word highlights are estimated; adjust them here."), wordBlocks(item),
      h("button.jw-textkey", { type: "button", on: { click: () => splitLine(item.id, "syllables") } }, "Redistribute words across this line")));
}

function lyricsCard(ctx) {
  const { b, editing } = ctx;
  const items = itemsOf(b);
  const empty = !b?.track ? "Add a song or a podcast in The Track to begin." : !editing ? "Preparing this clip…" : "No captions in this range. Add a line or edit the source lyrics.";
  return card({ id: "lyrics", title: "Lyrics & timing", cls: "is-label", win: null, tools: [h("button.jt-expand", { type: "button", disabled: !editing, title: "Add a caption at the playhead", "aria-label": "Add caption", on: { click: () => {
    const remaining = clipDuration(b) - cut.playhead;
    if (remaining < .05) return toast("Move the playhead before the end of the clip.");
    const item = addLyric("New caption", { length: Math.min(3, remaining) });
    if (item) { item.captionLanguage = modeOf(b); selectedLine = item.id; commit({ history: false }); }
  } } }, jicon("plus"))] },
    languageControl(b),
    h("div.jw-list-tools", {}, h("span", {}, `${items.length} ${items.length === 1 ? "caption" : "captions"}`), h("button.jw-textkey", { type: "button", disabled: !b?.track, on: { click: () => openWindow("lyrics") } }, "Source lyrics"),
      h("button.jw-textkey", { type: "button", "aria-pressed": String(follow), on: { click: () => { follow = !follow; changed("jam"); } } }, follow ? "Following playback" : "Follow playback")),
    h("div.jw-lines", { dataset: { scrollKey: "jw-lines" }, "aria-label": "Timed captions" }, ...(items.length ? lyricRows(b) : [h("p.jw-empty", {}, empty)])),
    lineEditor(b));
}

export function updateWordsPlayback() {
  cancelAnimationFrame(playFrame);
  const t = cut.playhead;
  let current = null;
  for (const { el, it } of rows) {
    if (!el.isConnected) continue;
    const now = t >= Number(it.start) && t < Number(it.start) + Number(it.length);
    el.classList.toggle("is-now", now);
    if (now) current = el;
  }
  if (follow && current && current !== lastActive && editor.playing) {
    const list = current.parentElement;
    const bounds = list.getBoundingClientRect();
    const line = current.getBoundingClientRect();
    const delta = line.top < bounds.top ? line.top - bounds.top : line.bottom > bounds.bottom ? line.bottom - bounds.bottom : 0;
    if (delta) list.scrollBy({ top: delta, behavior: "smooth" });
  }
  lastActive = current;
  if (progressSlider?.isConnected) progressSlider.value = String(t);
  if (editor.playing) playFrame = requestAnimationFrame(updateWordsPlayback);
}
document.addEventListener("editor:play", () => requestAnimationFrame(updateWordsPlayback));
document.addEventListener("editor:stop", () => requestAnimationFrame(updateWordsPlayback));
document.addEventListener("editor:live", () => requestAnimationFrame(updateWordsPlayback));

/** The real editor monitor: its preview and final export share the same caption renderer. */
export function phone(ctx) {
  const { editing, parts, b } = ctx;
  if (!editing || !parts) return h("div.jw-monitor-empty", {}, jicon("film"), h("p", {}, b?.track ? "Preparing the preview…" : "Your captioned video plays here"));
  progressSlider = h("input.jw-scrub", { type: "range", min: 0, max: Math.max(.01, clipDuration(b)), step: .01, value: cut.playhead, "aria-label": "Preview playhead", on: { input: (e) => { editor.seek(Number(e.target.value)); updateWordsPlayback(); }, keydown: stopKeys } });
  const [width, height] = (cut.project.body.aspect ?? "9:16").split(":").map(Number);
  return h("div.jw-monitor", {}, h("div.jw-monitor-stage", { style: { "--jw-ratio": String(width / height) } }, parts.stage), progressSlider, h("div.jw-monitor-transport", {}, parts.transport));
}

function aspectChoices(ctx) {
  return h("div.jt-segs.jw-aspects", { role: "group", "aria-label": "Video aspect ratio" }, ...[["16:9", "Landscape"], ["9:16", "Portrait"], ["1:1", "Square"]].map(([value, name]) => h("button.jt-seg", { type: "button", disabled: !ctx.editing, "aria-pressed": String(cut.project?.body.aspect === value), title: `${name} · ${value}`, on: { click: () => { cut.project.body.aspect = value; if (ctx.b) ctx.b.aspect = value; save(); commit(); } } }, value)));
}

function previewCard(ctx) {
  return card({ id: "preview", title: "Preview", cls: "is-label.jw-preview", win: "preview", tools: [aspectChoices(ctx)] },
    jam.win === "preview" ? h("div.jw-monitor-empty", {}, "Preview is open in its window") : phone(ctx),
    h("p.jw-preview-note", {}, modeOf(ctx.b) === "both" ? "Original + romaji · included in the video" : modeOf(ctx.b) === "romaji" ? "Romaji · included in the video" : "Original lyrics · included in the video"));
}

function applyStyle(style, b) {
  if (scope === "selected") setLyricStyle(style, selectedOf(b)?.id);
  else setCaptions(style);
  repaint();
}
const targetId = (b) => scope === "selected" ? selectedOf(b)?.id : null;

function stylesControl(b) {
  const item = scope === "selected" ? selectedOf(b) : itemsOf(b)[0];
  const now = item?.style ?? b?.captions ?? "plain";
  return h("section.jw-style-picks", {}, h("div.jw-field", {}, h("span.label", {}, "Caption style"),
    h("div.jw-style-buttons", { role: "group", "aria-label": "Caption style" }, ...STYLES.map(([id, label, description]) => h(`button.jw-style-choice${id === "plain" ? ".is-plain" : ""}`, { type: "button", disabled: !item, "aria-pressed": String(now === id), on: { click: () => applyStyle(id, b) } }, h("b", {}, label), h("span", {}, description))))),
    h("label.jw-field", {}, h("span.label", {}, "All styles"), h("select.field", { "aria-label": "All caption styles", disabled: !item, on: { change: (e) => applyStyle(e.target.value, b) } }, ...[...Object.entries(LOOKS).map(([id, look]) => [id, look.name]), ["lower", "Lower third"], ["none", "Hide captions"]].map(([id, label]) => h("option", { value: id, selected: now === id }, label)))));
}

function controls(b) {
  const item = scope === "selected" ? selectedOf(b) : itemsOf(b)[0];
  const disabled = !item;
  const id = targetId(b);
  const look = LOOKS[item?.style] ?? LOOKS.plain ?? {};
  const anim = item?.anim ?? look.anim ?? "none";
  const size = Number(item?.size) || .09;
  return h("section.jw-ctl", {},
    h("label.jw-field.is-wide", {}, h("span.jw-label-value", {}, h("span.label", {}, "Size"), h("span", {}, `${Math.round(size * 100)}%`)), h("input.jw-slider", { type: "range", min: .04, max: .2, step: .005, value: size, disabled, "aria-label": "Caption size", on: { input: (e) => {
      const value = Number(e.target.value); for (const it of scope === "selected" ? [item] : itemsOf(b)) if (it) it.size = value; editor.show(); e.target.previousElementSibling.lastElementChild.textContent = `${Math.round(value * 100)}%`;
    }, change: (e) => setLyricSize(Number(e.target.value), id) } })),
    h("div.jw-field", {}, h("span.label", {}, "Position"), h("div.jt-segs.is-icons", { role: "group", "aria-label": "Caption position" }, ...PLACES.map(([name, y, label]) => h("button.jt-seg", { type: "button", disabled, title: label, "aria-label": label, "aria-pressed": String(Math.abs((Number(item?.y) || .74) - y) < .09), on: { click: () => setLyricPlace(y, id) } }, jicon(name))))),
    h("label.jw-field", {}, h("span.label", {}, "Motion"), h("select.field", { disabled, "aria-label": "Caption animation", on: { change: (e) => { setLyricAnim(e.target.value, id); repaint(); } } }, ...ANIMS.map(([value, label]) => h("option", { value, selected: value === anim }, label)))),
    h("div.jw-field.is-wide", {}, h("span.label", {}, "Colour"), h("div.jw-colours", {},
      ...[["color", "Text", item?.color ?? look.color ?? "#FFFFFF"], ["hi", "Highlight", item?.hi ?? look.hi ?? "#F2FF59"]].map(([key, label, value]) => h("label.jw-colour", {}, h("input", { type: "color", value, disabled, "aria-label": `${label} colour`, on: { change: (e) => { setLyricColours({ [key]: e.target.value }, id); repaint(); } } }), h("span", {}, label))))));
}

function downloadCaptions(b, format) {
  const text = captionSubtitles(itemsOf(b), { language: modeOf(b), format });
  const url = URL.createObjectURL(new Blob([text], { type: format === "vtt" ? "text/vtt;charset=utf-8" : "application/x-subrip;charset=utf-8" }));
  const link = h("a", { href: url, download: `${(jam.jam?.name ?? "captions").replace(/[^\p{L}\p{N} _-]/gu, "").slice(0, 70) || "captions"}.${format}` });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function inspector(ctx) {
  const { b } = ctx;
  return card({ id: "styles", title: "Caption design", cls: "is-label.jw-inspector", win: null },
    h("div.jt-segs.jw-scope", { role: "group", "aria-label": "Style applies to" }, ...[["all", "All captions"], ["selected", "Selected line"]].map(([value, label]) => h("button.jt-seg", { type: "button", "aria-pressed": String(scope === value), on: { click: () => { scope = value; changed("jam"); } } }, label))),
    h("div.jw-inspector-scroll", { dataset: { scrollKey: "jw-inspector" } }, stylesControl(b), controls(b),
      h("section.jw-export", {}, h("span.label", {}, "Caption files"), h("p.jw-note", {}, "Save the selected language and edited timing for another video editor."),
        h("div.jw-export-keys", {}, ...["srt", "vtt"].map((format) => h("button.key", { type: "button", disabled: !itemsOf(b).length, on: { click: () => downloadCaptions(b, format) } }, jicon("download"), format.toUpperCase()))))),
    h("button.jt-primary.jw-ready", { type: "button", disabled: !b?.track, on: { click: () => { if (jam.jam) { jam.jam.body.captionsSet = true; save(); } setWorkspace("edit"); } } }, jicon("scissors"), "Open the edit"));
}

export function wordsWorkspace(ctx) {
  if (selectedProject !== ctx.b?.cut) { selectedProject = ctx.b?.cut; selectedLine = null; romanError = ""; }
  if (ctx.b?.part && synced(ctx.b)) applySyncedCaptions(jam.jam).catch((e) => toast(e.message, { tone: "crit" }));
  const first = itemsOf(ctx.b)[0];
  if (first && shownProject !== ctx.b?.cut && !editor.playing) {
    shownProject = ctx.b.cut;
    if (cut.playhead < .05) requestAnimationFrame(() => { editor.seek((Number(first.start) || 0) + Math.min(.2, (Number(first.length) || 1) / 2)); updateWordsPlayback(); });
  }
  const currentItems = itemsOf(ctx.b);
  const missingReadings = [...new Set(currentItems.filter((item) => needsRomanization(item.text) && !item.romanization?.trim()).map((item) => item.text))];
  const readingKey = JSON.stringify([cut.project?.id, missingReadings]);
  if (!romanBusy && modeOf(ctx.b) !== "original" && missingReadings.length && romanAttemptedKey !== readingKey) requestAnimationFrame(() => chooseLanguage(modeOf(ctx.b), { history: false }));
  requestAnimationFrame(updateWordsPlayback);
  return [h("div.jw", {}, toolbar(ctx), lyricsCard(ctx), previewCard(ctx), inspector(ctx))];
}

registerWindow("lyrics", {
  title: "SOURCE LYRICS", wide: true,
  build() {
    const b = jam.jam?.body;
    if (!b?.track) return h("p.jm-hint", {}, "Add a song or podcast first.");
    const draft = { text: b.track.lyrics ?? linesOf(b).map((line) => line.text).join("\n") };
    return [h("p.jm-note", {}, "One sung or spoken line per row. Keep section markers such as [Verse] and [Chorus]. Changing the source requires syncing it again; caption-only corrections can be made in the selected line editor."),
      h("textarea.field.jm-lyrics-edit", { rows: 16, value: draft.text, "aria-label": "Source lyrics", dataset: { focus: "source-lyrics" }, on: { input: (e) => draft.text = e.target.value, keydown: stopKeys } }),
      h("div.jm-row", {}, h("button.key.is-primary", { type: "button", disabled: !b.part, on: { click: () => { if (draft.text !== b.track.lyrics) useLyrics(draft.text); openWindow(null); } } }, "Save source lyrics"))];
  },
});
registerWindow("styles", { title: "CAPTION DESIGN", wide: true, build: () => inspector({ b: jam.jam?.body }) });
registerWindow("preview", {
  title: "PREVIEW", wide: true,
  build() {
    const b = jam.jam?.body;
    return h("div.jw-preview-window", {}, phone({ editing: !!b?.part && cut.project?.id === b.cut, parts: editorParts(), b }));
  },
});
