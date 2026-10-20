// The inspector: what the picked thing on the timeline (or the frame) can be changed in. Nothing
// picked: the edit itself, its beats and a first edit. An effect, a sticker, a line of lyrics, a title, a clip, a sound.
import { h, icon, sprite } from "../dom.js";
import { state } from "../store.js";
import {
  cut, FPS, GRADES, findItem, sourceOf, mainTrack, filmLength, totalLength, setItem, removeItem, commit, renameCut, renderFilm, setJoin, isPlaced,
  detectBeatsNow, importBeats, setBeatOffset, nudgeBeat, removeBeat, setBarLine, tempoOctave, snapToBeats, draftEdit, replaceSticker, stepSticker,
  STICKERS, setLyricStyle, setWord, splitLine, wordsToEdit, newSound, extendClip, lipSync, MOTIONS,
} from "../cut.js";
import { hitsOf, FX_KINDS, FX_DEFAULTS, EVERY } from "../fx.js";
import { wordsOf, LYRIC_STYLES, ANIMATED } from "../lyrics.js";
import { retext } from "../edit.js";

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const key = (glyph, label, run, extra = {}) => h("button.key.is-icon", { type: "button", title: label, "aria-label": label, on: { click: run }, ...extra }, glyph);
const tc = (t) => {
  const f = Math.max(0, Math.round(t * FPS));
  const s = Math.floor(f / FPS);
  return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}:${String(f % FPS).padStart(2, "0")}`;
};
const hexOf = (v, d) => (/^#[0-9a-f]{6}$/i.test(String(v ?? "")) ? v : d);

function num(label, value, set, { min = 0, max = 600, step = 0.1, unit = "s", digits } = {}) {
  const places = digits ?? (step < 0.1 ? 2 : step < 1 ? 1 : 0);
  return h("label.cut-num", {}, h("span", {}, label),
    h("input.field", { type: "number", value: Number(value).toFixed(places), min, max, step, "aria-label": label, on: { change: (e) => set(clamp(Number(e.target.value) || 0, min, max)), keydown: (e) => e.stopPropagation() } }),
    unit ? h("i", {}, unit) : null);
}
const section = (label, ...kids) => h("section.cut-sec", {}, h("span.cut-label", {}, label), ...kids);
const segment = (items, current, set, label) => h("div.segment", { role: "group", "aria-label": label }, ...items.map(([v, text]) => h("button", { type: "button", "aria-pressed": String(current === v), on: { click: () => set(v) } }, text)));

export function renderInspector(host, ctx) {
  const f = cut.selected && findItem(cut.selected);
  const p = cut.project;
  if (!f) return host.replaceChildren(...editPanel(p, ctx));
  const { track: t, item: it } = f;
  const s = sourceOf(it.src);
  const head = h("div.cut-panel-head", {}, h("span.card-label", {}, t.kind === "fx" ? "Beat FX" : isPlaced(it) ? "Sticker" : it.lyric ? "Lyrics" : "Inspector"), h("span.spacer"), key(icon("trash"), "Remove it", () => removeItem(it.id)));
  if (t.kind === "fx") return host.replaceChildren(head, ...fxPanel(it, t, ctx));
  if (isPlaced(it)) return host.replaceChildren(head, ...stickerPanel(it, ctx));
  if (t.kind === "title" && it.lyric) return host.replaceChildren(head, ...lyricPanel(it, ctx));
  const name = h("b.cut-ins-name", {}, t.kind === "title" ? "Title" : s?.name ?? it.name ?? "Clip");
  if (t.kind === "title") {
    return host.replaceChildren(head, name,
      h("textarea.field.cut-title-text", { rows: 2, value: it.text, "aria-label": "Words", on: { input: (e) => ((it.text = e.target.value), ctx.show()), change: () => commit(), keydown: (e) => e.stopPropagation() } }),
      h("div.segment", { role: "group", "aria-label": "Where" }, ...[["center", "Centre"], ["lower", "Lower third"]].map(([v, l]) => h("button", { type: "button", "aria-pressed": String((it.style ?? "center") === v), on: { click: () => setItem(it.id, { style: v }) } }, l))),
      h("div.cut-nums", {}, num("Start", it.start ?? 0, (v) => setItem(it.id, { start: v })), num("Length", it.length ?? 3, (v) => setItem(it.id, { length: v }), { min: 0.5, max: 60 })),
      h("div.cut-keys", {}, h("button.key.is-sm", { type: "button", title: "Sing it: the words light up one by one, as lyrics do (karaoke, pop-in, bounce)", on: { click: () => setItem(it.id, { lyric: true, style: "karaoke" }) } }, sprite("prompt-enhance"), "Animate the words")));
  }
  return host.replaceChildren(...clipPanel(it, t, s, head, name, ctx));
}

// ---------------------------------------------------------------- the edit itself

function editPanel(p, ctx) {
  const b = p.body;
  const out = [];
  if (ctx.mode !== "jam") {
    out.push(
      h("div.cut-panel-head", {}, h("span.card-label", {}, "Edit")),
      h("input.field.cut-name", { value: p.name, "aria-label": "Name", on: { change: (e) => renameCut(e.target.value), keydown: (e) => e.stopPropagation() } }),
      h("div.cut-facts", {}, h("span", {}, "Length"), h("b", {}, tc(filmLength())), h("span", {}, "Clips"), h("b", {}, String(mainTrack()?.items.length ?? 0)),
        h("span", {}, "Sounds"), h("b", {}, String(b.tracks.filter((t) => t.kind === "audio").reduce((n, t) => n + t.items.length, 0)))),
      h("span.cut-label", {}, "Frame"),
      h("div.segment", { role: "group" }, ...["16:9", "9:16", "1:1"].map((a) => h("button", { type: "button", "aria-pressed": String(b.aspect === a), on: { click: () => ((b.aspect = a), commit()) } }, a))),
      h("div.segment", { role: "group", "aria-label": "Fit" }, ...[["contain", "Whole picture"], ["cover", "Fill the frame"]].map(([v, l]) => h("button", { type: "button", title: v === "cover" ? "A clip of another shape is cropped to fill the frame" : "A clip of another shape keeps its edges, with bars", "aria-pressed": String((b.fit ?? "contain") === v), on: { click: () => ((b.fit = v), commit()) } }, l))),
      h("label.cut-check", { title: "Music gets quieter under the voices" }, h("input", { type: "checkbox", checked: b.duck !== false, on: { change: (e) => ((b.duck = e.target.checked), commit()) } }), "Music ducks under voices"),
      h("button.roll.cut-render", { type: "button", disabled: cut.busy.has("render") || (!mainTrack()?.items.length && !totalLength()), on: { click: renderFilm } }, icon("film"), cut.busy.has("render") ? "RENDERING…" : "RENDER THE FILM"));
  }
  out.push(...beatsPanel(b, ctx));
  if (ctx.mode !== "jam") out.push(h("p.cut-hint", {}, "Pick a clip, a sound, a title, an effect or a sticker to change it. Space plays, S cuts at the playhead, Delete removes."));
  return out;
}

/** The beats: found by listening, typed in, moved as a whole or one by one; the cuts snapped onto them. */
function beatsPanel(b, ctx) {
  const beats = b.beats;
  const n = beats?.times?.length ?? 0;
  const bt = cut.beat !== null && beats?.times ? beats.times[cut.beat] : undefined;
  let typed = null;
  const importForm = h("div.cut-beat-import", { hidden: true },
    typed = h("input.field.is-line", { placeholder: "128, 128 @ 0.35, or 0.5 1.0 1.5 …", "aria-label": "Beats to import", on: { keydown: (e) => (e.stopPropagation(), e.key === "Enter" && go()) } }),
    h("button.key.is-sm", { type: "button", on: { click: () => go() } }, "Use"));
  // applied: the form closes and the panel is drawn afresh (it was left alone while the field had the focus)
  const go = () => {
    if (!importBeats(typed.value)) return;
    typed.value = "";
    importForm.hidden = true;
    typed.blur();
    requestAnimationFrame(() => ctx.redraw());
  };
  const status = n ? `${Math.round(beats.bpm * 10) / 10} BPM · ${n} beats · ${beats.source === "web" ? "heard" : beats.source === "comfy" ? "from the track" : beats.source === "import" ? "imported" : beats.source}${beats.sure !== undefined && beats.sure < 0.25 ? " · unsure" : ""}` : "No beats yet";
  const out = [
    h("div.cut-draft", {}, h("button.key.is-primary", { type: "button", disabled: cut.busy.has("draft"), title: "No words needed: the beats heard, the cuts on them, a zoom pulse on every bar, a flash every four, the lyrics as karaoke. One undo step; what it adds you can change.", on: { click: () => draftEdit() } }, sprite("prompt-enhance"), cut.busy.has("draft") ? "Drafting…" : "Draft edit"),
      h("span.cut-hint", {}, "Cuts on the beat, a zoom on every bar, karaoke lyrics.")),
    section("Beats",
      h("div.cut-beat-status", {}, h("b", {}, status)),
      h("div.cut-keys", {},
        h("button.key.is-sm", { type: "button", disabled: cut.busy.has("beats"), title: "Listen to the music and find its beats", on: { click: () => detectBeatsNow() } }, sprite("audio-music"), cut.busy.has("beats") ? "Listening…" : "Detect"),
        h("button.key.is-sm", { type: "button", "aria-pressed": "false", title: "Type a tempo or a list of times", on: { click: () => ((importForm.hidden = !importForm.hidden), !importForm.hidden && typed.focus()) } }, icon("upload"), "Import"),
        h("button.key.is-sm", { type: "button", disabled: !n, title: "The tempo was heard twice too fast: every other beat", on: { click: () => tempoOctave("halve") } }, "½×"),
        h("button.key.is-sm", { type: "button", disabled: !n, title: "The tempo was heard half as fast: a beat between each two", on: { click: () => tempoOctave("double") } }, "2×")),
      importForm,
      n ? h("div.cut-nums", {},
        num("Offset", beats.offset ?? 0, (v) => setBeatOffset(v), { min: -5, max: 5, step: 0.01, unit: "s" }),
        h("div.cut-nudge", {}, h("span", {}, "All beats"), h("div", {},
          ...[["−10", -0.01], ["−1", -0.001], ["+1", 0.001], ["+10", 0.01]].map(([label, d]) => h("button.key.is-sm", { type: "button", title: `${d > 0 ? "Later" : "Earlier"} by ${Math.abs(d * 1000)} ms`, on: { click: () => setBeatOffset((beats.offset ?? 0) + d) } }, label))))) : null,
      bt !== undefined ? h("div.cut-beat-pick", {}, h("b", {}, `Beat ${cut.beat + 1} at ${(bt + (beats.offset ?? 0)).toFixed(3)} s`),
        h("div.cut-keys", {},
          ...[["−10", -0.01], ["−1", -0.001], ["+1", 0.001], ["+10", 0.01]].map(([label, d]) => h("button.key.is-sm", { type: "button", title: `This beat ${d > 0 ? "later" : "earlier"} by ${Math.abs(d * 1000)} ms`, on: { click: () => nudgeBeat(cut.beat, d) } }, label)),
          h("button.key.is-sm", { type: "button", title: "The bars count from this beat: every fourth after it", on: { click: () => setBarLine(cut.beat) } }, "Bar line"),
          h("button.key.is-sm", { type: "button", title: "Take this beat away", on: { click: () => removeBeat() } }, icon("trash")))) : n ? h("p.cut-hint", {}, "Click a beat on the ruler to nudge it; drag it to move it; double-click the lane to add one.") : null,
      n ? h("div.cut-keys", {}, h("button.key.is-sm", { type: "button", title: "Move every cut between clips onto the nearest beat, trimming each clip a little (nothing is lost)", on: { click: () => snapToBeats("beat") } }, sprite("edit-scissors"), "Cuts to beats"),
        h("button.key.is-sm", { type: "button", title: "Move every cut onto the nearest bar line", on: { click: () => snapToBeats("bar") } }, "to bars")) : null),
  ];
  return out;
}

// ---------------------------------------------------------------- an effect

function fxPanel(it, t, ctx) {
  const hits = hitsOf(it, cut.project.body).filter((x) => x >= (Number(it.start) || 0) && x < (Number(it.start) || 0) + (Number(it.length) || 4)).length;
  const d = FX_DEFAULTS[it.kind] ?? FX_DEFAULTS.zoom;
  return [
    h("b.cut-ins-name", {}, FX_KINDS.find(([k]) => k === it.kind)?.[1] ?? it.kind),
    h("div.cut-fx-top", {},
      segment([[true, "On"], [false, "Off"]], it.on !== false, (v) => setItem(it.id, { on: v }), "Effect on or off"),
      t.mute ? h("span.cut-hint", {}, "The Beat FX track is off.") : null),
    section("What", segment(FX_KINDS, it.kind, (v) => setItem(it.id, { kind: v }), "Effect")),
    section("When",
      h("label.cut-num.is-wide", {}, h("span", {}, "Fires"), h("select.chip-select", { "aria-label": "How often", on: { change: (e) => setItem(it.id, { every: Number(e.target.value) }) } }, ...EVERY.map(([v, label]) => h("option", { value: v, selected: Number(it.every ?? d.every) === v }, label)))),
      h("div.cut-nums", {}, num("Start", it.start ?? 0, (v) => setItem(it.id, { start: v })), num("Length", it.length ?? 4, (v) => setItem(it.id, { length: v }), { min: 0.5, max: 600 })),
      h("p.cut-hint", {}, `${hits} hit${hits === 1 ? "" : "s"} between its start and its end, on the beats.`)),
    section("How",
      h("label.cut-range", {}, h("span", {}, "Intensity"), h("input", { type: "range", min: 0, max: 200, step: 5, value: Math.round((it.intensity ?? d.intensity) * 100), "aria-label": "Intensity", on: { input: (e) => ((it.intensity = Number(e.target.value) / 100), (e.target.nextSibling.textContent = `${e.target.value}%`), ctx.show()), change: () => commit() } }), h("b", {}, `${Math.round((it.intensity ?? d.intensity) * 100)}%`)),
      num("Each hit lasts", it.dur ?? d.dur, (v) => setItem(it.id, { dur: v }), { min: 0.04, max: 2, step: 0.01, unit: "s" })),
  ];
}

// ---------------------------------------------------------------- a sticker

function stickerPanel(it, ctx) {
  const s = sourceOf(it.src);
  const pct = (v) => Math.round(v * 1000) / 10;
  return [
    h("div.cut-sticker-head", {}, s?.url ? h("img", { src: s.url, alt: "", draggable: false }) : null, h("b.cut-ins-name", {}, s?.name ?? "Sticker")),
    section("Where",
      h("div.cut-nums", {},
        num("Across", pct(it.x ?? 0.5), (v) => setItem(it.id, { x: v / 100 }), { min: -50, max: 150, step: 1, unit: "%" }),
        num("Down", pct(it.y ?? 0.5), (v) => setItem(it.id, { y: v / 100 }), { min: -50, max: 150, step: 1, unit: "%" }),
        num("Size", pct(it.w ?? 0.25), (v) => setItem(it.id, { w: v / 100 }), { min: 3, max: 200, step: 1, unit: "%" }),
        num("Turn", it.rot ?? 0, (v) => setItem(it.id, { rot: v }), { min: -360, max: 360, step: 1, unit: "°" })),
      h("div.cut-keys", {},
        h("button.key.is-sm", { type: "button", title: "In front of the other stickers", on: { click: () => stepSticker(it.id, 1) } }, "Forward"),
        h("button.key.is-sm", { type: "button", title: "Behind the other stickers", on: { click: () => stepSticker(it.id, -1) } }, "Back"),
        h("button.key.is-sm", { type: "button", title: "Straight, in the middle", on: { click: () => setItem(it.id, { x: 0.5, y: 0.5, rot: 0 }) } }, "Centre")),
      h("p.cut-hint", {}, "Drag it on the frame to move it; the corner sizes it, the knob above turns it.")),
    section("When",
      h("div.cut-nums", {}, num("Start", it.start ?? 0, (v) => setItem(it.id, { start: v })), num("Length", it.length ?? 3, (v) => setItem(it.id, { length: v }), { min: 0.3, max: 600 }),
        num("Fade in", it.fadeIn ?? 0, (v) => setItem(it.id, { fadeIn: v }), { max: 5 }), num("Fade out", it.fadeOut ?? 0, (v) => setItem(it.id, { fadeOut: v }), { max: 5 })),
      h("label.cut-range", {}, h("span", {}, "Opacity"), h("input", { type: "range", min: 0, max: 100, step: 1, value: Math.round((it.opacity ?? 1) * 100), "aria-label": "Opacity", on: { input: (e) => ((it.opacity = Number(e.target.value) / 100), (e.target.nextSibling.textContent = `${e.target.value}%`), ctx.show()), change: () => commit() } }), h("b", {}, `${Math.round((it.opacity ?? 1) * 100)}%`))),
    it.src?.kind === "sticker" ? section("Another sticker", h("div.cut-sticker-pick", { dataset: { scrollKey: "sticker-pick" } }, ...STICKERS.list.map((x) => h("button", { type: "button", "aria-pressed": String(it.src.id === x.id), title: x.name, on: { click: () => replaceSticker(it.id, x.id) } }, h("img", { src: `brand/jam/stickers/${x.file}`, alt: x.name, draggable: false, loading: "lazy" }))))) : null,
  ].filter(Boolean);
}

// ---------------------------------------------------------------- a line of lyrics

function lyricPanel(it, ctx) {
  const len = Number(it.length) || 3;
  const words = wordsOf(it);
  const pct = (v) => Math.round(v * 1000) / 10;
  const style = ANIMATED.has(it.style) || it.style === "lower" || it.style === "none" ? it.style : "karaoke";
  const text = h("textarea.field.cut-title-text", { rows: 2, value: it.text, "aria-label": "Words", on: { input: (e) => (retext(it, e.target.value), ctx.show()), change: () => commit(), keydown: (e) => e.stopPropagation() } });
  // the line's length with its words along it: a boundary dragged moves the end of one word and the start of the next
  const bar = h("div.cut-wordbar", {});
  const drawBar = () => {
    const ws = wordsOf(it);
    bar.replaceChildren(...ws.map((w, i) => h("span.wb-chip", { style: { left: `${(w.from / len) * 100}%`, width: `${Math.max(0.5, ((w.to - w.from) / len) * 100)}%` }, title: `${w.text}: ${w.from.toFixed(2)} to ${w.to.toFixed(2)} s` }, h("em", {}, w.text), i > 0 ? h("i.wb-edge", { dataset: { i: String(i) } }) : null)));
  };
  drawBar();
  bar.addEventListener("pointerdown", (e) => {
    const edge = e.target.closest?.(".wb-edge");
    if (!edge) return;
    e.preventDefault();
    const i = Number(edge.dataset.i);
    const rect = bar.getBoundingClientRect();
    const ws = wordsToEdit(it);
    const joined = Math.abs(ws[i - 1].to - ws[i].from) < 0.015;
    let moved = false;
    const move = (ev) => {
      moved = true;
      const at = Math.round(clamp(((ev.clientX - rect.left) / rect.width) * len, ws[i - 1].from + 0.03, Math.min(len, ws[i].to - 0.03)) * 100) / 100;
      ws[i].from = at;
      if (joined) ws[i - 1].to = at;
      drawBar();
      ctx.show();
      // the numbers in the table follow
      document.querySelectorAll(".cut-word-row").forEach((row) => row.dispatchEvent(new CustomEvent("sync")));
    };
    const up = () => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      if (moved) commit();
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
  });
  const rows = words.map((w, i) => {
    const row = h("div.cut-word-row", {});
    const fields = () => row.replaceChildren(
      h("input.field", { value: w.text, "aria-label": `Word ${i + 1}`, on: { change: (e) => setWord(it.id, i, { text: e.target.value.trim() || w.text }), keydown: (e) => e.stopPropagation() } }),
      h("input.field", { type: "number", step: 0.01, min: 0, max: len, value: wordsOf(it)[i].from.toFixed(2), "aria-label": `Word ${i + 1} starts`, on: { change: (e) => setWord(it.id, i, { from: Number(e.target.value) }), keydown: (e) => e.stopPropagation() } }),
      h("input.field", { type: "number", step: 0.01, min: 0, max: len + 2, value: wordsOf(it)[i].to.toFixed(2), "aria-label": `Word ${i + 1} ends`, on: { change: (e) => setWord(it.id, i, { to: Number(e.target.value) }), keydown: (e) => e.stopPropagation() } }));
    fields();
    row.addEventListener("sync", fields);
    return row;
  });
  const swatch = (label, prop, fallback) => h("label.cut-swatch", { title: label }, h("span", {}, label), h("input", { type: "color", value: hexOf(it[prop], fallback), "aria-label": label, on: { input: (e) => ((it[prop] = e.target.value.toUpperCase()), ctx.show()), change: () => commit() } }));
  return [
    text,
    section("Style",
      segment(LYRIC_STYLES, style, (v) => setItem(it.id, { style: v }), "How the words are drawn"),
      h("div.cut-keys", {}, h("button.key.is-sm", { type: "button", title: "Every line of lyrics in this style", on: { click: () => setLyricStyle(style) } }, "Same for every line"))),
    section("Where and how big",
      h("div.cut-nums", {},
        num("Across", pct(it.x ?? 0.5), (v) => setItem(it.id, { x: v / 100 }), { min: 0, max: 100, step: 1, unit: "%" }),
        num("Down", pct(it.y ?? 0.74), (v) => setItem(it.id, { y: v / 100 }), { min: 0, max: 100, step: 1, unit: "%" }),
        num("Size", pct(it.size ?? 0.09), (v) => setItem(it.id, { size: v / 100 }), { min: 3, max: 25, step: 0.5, unit: "%", digits: 1 })),
      h("div.cut-swatches", {}, swatch("Words", "color", "#FFFFFF"), swatch("Lit", "hi", "#F2FF59")),
      h("p.cut-hint", {}, "Drag the words on the frame to move them; the corner sizes them.")),
    section("When",
      h("div.cut-nums", {}, num("Start", it.start ?? 0, (v) => setItem(it.id, { start: v })), num("Length", it.length ?? 3, (v) => setItem(it.id, { length: v }), { min: 0.5, max: 60 })),
      h("div.cut-keys", {}, h("button.key.is-sm", { type: "button", on: { click: () => ctx.seek(Number(it.start) || 0) } }, "Go to the line"))),
    section("Words",
      bar,
      h("div.cut-word-head", {}, h("span", {}, "Word"), h("span", {}, "From"), h("span", {}, "To")),
      h("div.cut-words", {}, ...rows),
      h("div.cut-keys", {},
        ...[["syllables", "By syllables"], ["letters", "By letters"], ["even", "Even"]].map(([by, label]) => h("button.key.is-sm", { type: "button", title: `Time every word again, ${label.toLowerCase()}`, on: { click: () => splitLine(it.id, by) } }, label))),
      h("p.cut-hint", {}, "Each word is timed from the line's start. Drag the dividers above, or type the times.")),
  ];
}

// ---------------------------------------------------------------- a clip, a sound

function clipPanel(it, t, s, head, name, ctx) {
  const dur = s?.duration ?? 0;
  const clip = h("section.cut-sec", {}, h("span.cut-label", {}, "Clip"),
    h("div.cut-nums", {},
      s?.still ? num("Length", it.length ?? 4, (v) => setItem(it.id, { length: v }), { min: 0.5, max: 60 }) : num("In", it.from ?? 0, (v) => setItem(it.id, { from: Math.min(v, (it.to ?? dur) - 0.2) }), { max: dur }),
      s?.still ? null : num("Out", it.to ?? dur, (v) => setItem(it.id, { to: v >= dur - 0.05 ? null : Math.max(v, (it.from ?? 0) + 0.2) }), { max: dur }),
      !t.main ? num("Start", it.start ?? 0, (v) => setItem(it.id, { start: v })) : null),
    s?.still || t.kind === "audio" ? null : h("label.cut-num", {}, h("span", {}, "Speed"), h("select.chip-select", { "aria-label": "Speed", on: { change: (e) => setItem(it.id, { speed: Number(e.target.value) }) } }, ...[0.5, 0.75, 1, 1.25, 1.5, 2].map((v) => h("option", { value: v, selected: (it.speed ?? 1) === v }, `${v}×`)))));
  const sections = [head, name, clip];
  if (t.kind === "video") {
    const current = MOTIONS.find(([, , m]) => JSON.stringify(m) === JSON.stringify(it.motion ?? null))?.[0] ?? (it.motion ? "custom" : "none");
    sections.push(h("section.cut-sec", {}, h("span.cut-label", {}, "Motion"),
      h("div.cut-moves", { role: "group", "aria-label": "Motion" }, ...MOTIONS.map(([id, label, m]) => h("button", { type: "button", "aria-pressed": String(current === id), title: label, on: { click: () => setItem(it.id, { motion: m && structuredClone(m) }) } }, label))),
      it.motion ? h("div.cut-nums", {}, num("Zoom from", it.motion.from.scale * 100, (v) => setItem(it.id, { motion: { ...it.motion, from: { ...it.motion.from, scale: v / 100 } } }), { min: 100, max: 300, step: 1, unit: "%" }), num("to", it.motion.to.scale * 100, (v) => setItem(it.id, { motion: { ...it.motion, to: { ...it.motion.to, scale: v / 100 } } }), { min: 100, max: 300, step: 1, unit: "%" })) : null));
    sections.push(h("section.cut-sec", {}, h("span.cut-label", {}, "Look"),
      h("div.cut-nums", {},
        !t.main ? num("Opacity", (it.opacity ?? 1) * 100, (v) => setItem(it.id, { opacity: v / 100 }), { min: 0, max: 100, step: 1, unit: "%" }) : null,
        num("Fade in", it.fadeIn ?? 0, (v) => setItem(it.id, { fadeIn: v }), { max: 5 }), num("Fade out", it.fadeOut ?? 0, (v) => setItem(it.id, { fadeOut: v }), { max: 5 })),
      h("div.cut-grades", { role: "group", "aria-label": "Colour" }, ...GRADES.map(([g, label, css]) => h("button", { type: "button", title: label, "aria-pressed": String((it.grade ?? "natural") === g), on: { click: () => setItem(it.id, { grade: g === "natural" ? undefined : g }) } },
        s?.still || it.src?.kind !== "take" ? h("i", { style: { filter: css } }) : h("img", { src: state.runs.find((r) => r.id === it.src.id)?.request?.start ? `/media/photos/${state.runs.find((r) => r.id === it.src.id).request.start}` : "", alt: "", style: { filter: css }, draggable: false }),
        h("span", {}, label))))));
    if (t.main && t.items.indexOf(it) > 0) sections.push(h("section.cut-sec", {}, h("span.cut-label", {}, "Into this clip"),
      h("div.segment", { role: "group" }, ...[["cut", "Cut", "A straight cut"], ["dissolve", "Dissolve", "A one-second dissolve"], ["whip", "Whip", "A fast tilt up into the clip, over the last fifth of a second of the one before: for a reveal"]].map(([id, label, tip]) =>
        h("button", { type: "button", title: tip, "aria-pressed": String((it.join ?? "cut") === id || (id === "cut" && it.join !== "dissolve" && it.join !== "whip")), on: { click: () => setJoin(it.id, id) } }, label)))));
  }
  if (!s?.still) sections.push(h("section.cut-sec", {}, h("span.cut-label", {}, "Audio"),
    h("label.cut-range", {}, h("span", {}, "Volume"), h("input", { type: "range", min: 0, max: 150, step: 1, value: Math.round((it.volume ?? 1) * 100), "aria-label": "Volume", on: { input: (e) => ((it.volume = Number(e.target.value) / 100), ctx.show(), (e.target.nextSibling.textContent = `${e.target.value}%`)), change: () => commit() } }), h("b", {}, `${Math.round((it.volume ?? 1) * 100)}%`)),
    t.kind === "audio" ? h("div.cut-nums", {}, num("Fade in", it.fadeIn ?? 0, (v) => setItem(it.id, { fadeIn: v }), { max: 10 }), num("Fade out", it.fadeOut ?? 0, (v) => setItem(it.id, { fadeOut: v }), { max: 10 }))
      : h("label.cut-check", {}, h("input", { type: "checkbox", checked: it.sound !== false, on: { change: (e) => setItem(it.id, { sound: e.target.checked }) } }), "The clip's own sound")));
  // AI: the clip made again in a new way, on its take
  if (t.kind === "video" && it.src?.kind === "take") {
    const busy = (k) => cut.busy.has(`${k}:${it.id}`);
    const words = h("input.field.is-line", { placeholder: "New sound: rain on the window, a dog barks", "aria-label": "New sound", on: { keydown: (e) => (e.stopPropagation(), e.key === "Enter" && e.target.value.trim() && newSound(it.id, e.target.value.trim())) } });
    sections.push(h("section.cut-sec", {}, h("span.cut-label", {}, "AI actions"),
      h("div.cut-ai", {},
        h("button.key", { type: "button", disabled: busy("extend"), title: "Carry the shot on for 4 seconds more", on: { click: () => extendClip(it.id, 4) } }, sprite("video-extend"), busy("extend") ? "Extending…" : "Extend"),
        h("button.key", { type: "button", disabled: busy("lipsync") || !t.main, title: "Make it again with its mouth following the voice line under it on the Voice track", on: { click: () => lipSync(it.id) } }, sprite("lip-sync"), busy("lipsync") ? "Syncing…" : "Lip sync"),
        h("button.key", { type: "button", disabled: busy("sound"), title: "Make its sound again from the words", on: { click: () => (words.value.trim() ? newSound(it.id, words.value.trim()) : words.focus()) } }, icon("sound"), busy("sound") ? "Sounding…" : "New sound")),
      words));
  }
  return sections;
}
