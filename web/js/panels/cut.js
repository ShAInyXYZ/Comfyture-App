import { h, icon, sprite } from "../dom.js";
import { state, loadPhotos, inProject, changed } from "../store.js";
import {
  cut, loadCuts, openCut, newCut, duplicateCut, closeCut, deleteCut, undo, redo, filmLength, addMedia, renderFilm, makeAudio, makeVoice,
  frameOf, loadAudio, reclaim, findItem,
} from "../cut.js";
import { currentPage } from "../router.js";
import { editorParts, drawEditor, editor, waveCanvas } from "./editor.js";

const key = (glyph, label, run, extra = {}) => h("button.key.is-icon", { type: "button", title: label, "aria-label": label, on: { click: run }, ...extra }, glyph);
const secs = (t) => `${t.toFixed(1)} s`;

// the page is built once, so the monitor's players and the timeline's scroll survive every redraw
let shell = null;
const stop = () => editor.stop();

// ---------------------------------------------------------------- the media bin

const bin = { tab: "video", query: "", form: null };
function mediaItems() {
  const q = bin.query.trim().toLowerCase();
  const has = (name) => !q || String(name ?? "").toLowerCase().includes(q);
  if (bin.tab === "video") {
    const takes = state.runs.filter((r) => r.status === "done" && has(r.request?.name)).map((r) => ({ kind: "video", name: r.request?.name ?? r.id, src: { kind: "take", id: r.id }, poster: r.request?.start ? `/media/photos/${r.request.start}` : null, url: r.video, seconds: r.length ?? r.request?.seconds }));
    const films = state.films.filter((f) => has(f.name)).map((f) => ({ kind: "video", name: f.name, src: { kind: "film", id: f.id }, url: f.url, seconds: f.seconds, film: true }));
    return [...takes, ...films].slice(0, 120);
  }
  if (bin.tab === "images") return (state.photos ?? []).filter((p) => has(p.name ?? p.file)).slice(0, 160).map((p) => ({ kind: "image", name: p.name ?? p.file, src: { kind: "photo", id: p.file, url: p.url, width: p.width, height: p.height, name: p.name }, poster: p.url }));
  const voice = bin.tab === "voice";
  return (cut.audio ?? []).filter((a) => (voice ? a.kind === "voice" : a.kind !== "voice") && has(a.name)).map((a) => ({ kind: "audio", role: voice ? "voice" : a.kind === "music" ? "music" : "effects", name: a.name, src: { kind: "audio", id: a.file, url: a.url, duration: a.seconds, name: a.name }, url: a.url, seconds: a.seconds, sort: a.kind }));
}
function binTile(m) {
  const tile = h("button.cut-media", { type: "button", draggable: true, title: `${m.name} — click to add it, or drag it onto a track`, on: { click: () => addMedia(m) } },
    m.kind === "audio" ? h("span.cut-media-wave", {}, sprite(m.role === "voice" ? "audio-voice" : m.role === "music" ? "audio-music" : "audio-sfx"), waveCanvas({ src: m.src, from: 0, to: null }, 150))
      : m.poster ? h("img", { src: m.poster, alt: "", loading: "lazy", draggable: false })
      : h("video", { src: `${m.url}#t=0.4`, muted: true, preload: "metadata", draggable: false }),
    h("span.cut-media-name", {}, m.name),
    m.seconds ? h("span.cut-media-len", {}, secs(Number(m.seconds) || 0)) : null);
  tile.addEventListener("dragstart", (e) => e.dataTransfer.setData("text/cut-media", JSON.stringify(m)));
  return tile;
}
let binShown = "";
function renderBin(force = false) {
  const sig = JSON.stringify([bin.tab, bin.query, bin.form, state.runs.filter((r) => r.status === "done").length, state.films.length, state.photos?.length ?? 0, cut.audio?.length ?? -1, [...cut.busy].filter((k) => /^(music|sound|voice):/.test(k)).length, bin.tab === "voice" && cut.selected]);
  if (!force && sig === binShown && shell.bin.childElementCount) return;
  binShown = sig;
  const tabs = [["video", "Video", () => icon("video")], ["images", "Images", () => icon("image")], ["audio", "Audio", () => icon("sound")], ["voice", "Voice", () => sprite("audio-voice")]];
  const list = mediaItems();
  const busy = [...cut.busy].filter((k) => /^(music|sound|voice):/.test(k)).length;
  const form = bin.form ? aiForm(bin.form) : null;
  shell.bin.replaceChildren(
    h("div.cut-panel-head", {}, h("span.card-label", { role: "heading", "aria-level": "2" }, "Media bin"), busy ? h("span.cut-busy", {}, h("span.lamp", { dataset: { tone: "busy" } }), `${busy} making`) : null),
    h("div.segment.cut-bin-tabs", { role: "tablist", "aria-label": "Media" }, ...tabs.map(([id, label, glyph]) => h("button", { type: "button", role: "tab", "aria-selected": String(bin.tab === id), on: { click: () => ((bin.tab = id), id === "images" && !state.photos?.length && loadPhotos(), renderBin(true)) } }, glyph(), label))),
    h("label.ctl-search-row.cut-search", {}, icon("search"), h("input.field.ctl-search", { type: "search", value: bin.query, placeholder: "Search media", "aria-label": "Search media", on: { input: (e) => ((bin.query = e.target.value), renderBinList()) } })),
    h("div.cut-media-grid", { dataset: { scrollKey: "bin" } }, ...(list.length ? list.map(binTile) : [h("p.cut-empty", {}, bin.tab === "voice" ? "Voice lines come here: the Voice key makes one." : bin.tab === "audio" ? "Music and sounds come here: make one below, or drop a file." : "Nothing here yet.")])),
    ...(form ? [form] : []),
    h("div.cut-ai-keys", {},
      h("button.key", { type: "button", "aria-pressed": String(bin.form === "music"), title: "Music for the cut, from words (ACE-Step 1.5)", on: { click: () => ((bin.form = bin.form === "music" ? null : "music"), renderBin(true)) } }, sprite("audio-music"), "Music"),
      h("button.key", { type: "button", "aria-pressed": String(bin.form === "sound"), title: "A sound effect, from words (Stable Audio 3)", on: { click: () => ((bin.form = bin.form === "sound" ? null : "sound"), renderBin(true)) } }, sprite("audio-sfx"), "Sound"),
      h("button.key", { type: "button", "aria-pressed": String(bin.form === "voice"), title: "A voice line, said by LTX-2.5", on: { click: () => ((bin.form = bin.form === "voice" ? null : "voice"), renderBin(true)) } }, sprite("audio-voice"), "Voice")));
  const drop = shell.bin;
  drop.ondragover = (e) => [...e.dataTransfer.types].includes("Files") && e.preventDefault();
  drop.ondrop = async (e) => {
    const files = [...(e.dataTransfer.files ?? [])].filter((f) => f.type.startsWith("audio/"));
    if (!files.length) return;
    e.preventDefault();
    for (const f of files) await fetch(`api/audio?name=${encodeURIComponent(f.name.replace(/\.\w+$/, ""))}`, { method: "POST", headers: { "Content-Type": f.type }, body: f });
    await loadAudio();
    bin.tab = "audio";
    renderBin(true);
  };
}
function renderBinList() {
  const grid = shell.bin.querySelector(".cut-media-grid");
  const list = mediaItems();
  grid?.replaceChildren(...(list.length ? list.map(binTile) : [h("p.cut-empty", {}, "Nothing by that name.")]));
}

/** The words for a sound to make: what it is, how long; for a voice, who says it and the line. */
function aiForm(kind) {
  const sel = cut.selected && findItem(cut.selected);
  const prompt = h("input.field.is-line", { placeholder: kind === "music" ? "Gentle piano and soft strings, hopeful, slow" : kind === "sound" ? "Waves crashing on rocks, distant thunder" : "What is said", "aria-label": kind === "voice" ? "The line" : "What it sounds like", on: { keydown: (e) => (e.stopPropagation(), e.key === "Enter" && go()) } });
  const who = kind === "voice" ? h("input.field.is-line", { placeholder: "Who says it: a girl of ten, soft and curious", "aria-label": "Who says it", on: { keydown: (e) => e.stopPropagation() } }) : null;
  const length = h("select.chip-select", { "aria-label": "Length" }, ...(kind === "music" ? [15, 30, 45, 60, 90] : [3, 6, 10, 20]).map((s) => h("option", { value: s, selected: kind === "music" ? s === Math.min(90, Math.max(15, Math.round(filmLength() / 15) * 15 || 30)) : s === 6 }, `${s} s`)));
  const fromClip = kind === "voice" && sel?.track.main ? h("label.cut-check", { title: "The line is said over this clip's frame: the take shows them saying it" }, h("input", { type: "checkbox" }), "over the clip's frame") : null;
  const go = async () => {
    const words = prompt.value.trim();
    if (!words) return prompt.focus();
    bin.form = null;
    renderBin(true);
    if (kind === "voice") {
      const picture = fromClip?.querySelector("input").checked ? await frameOf(sel.item).catch(() => null) : null;
      return makeVoice({ who: who.value, line: words, picture });
    }
    makeAudio(kind, words, Number(length.value));
  };
  requestAnimationFrame(() => (who ?? prompt).focus());
  return h("div.cut-ai-form", {}, who, prompt, h("div.cut-ai-row", {}, kind === "voice" ? fromClip : length, h("span.spacer"), h("button.key.is-primary.is-sm", { type: "button", on: { click: go } }, sprite("prompt-enhance"), "Make")));
}

// ---------------------------------------------------------------- the bar of edits

function subbar() {
  const p = cut.project;
  const tab = (id) => {
    const c = cut.list.find((x) => x.id === id) ?? { id, name: "…" };
    const active = id === p?.id;
    return h("div.tab", { role: "tab", tabindex: "0", "aria-selected": String(active), on: { click: () => !active && (stop(), openCut(id)) } },
      c.thumb ? h("img.tab-thumb", { src: c.thumb, alt: "", draggable: false }) : h("span.tab-thumb.is-icon", {}, icon("scissors")),
      h("span.tab-name", {}, active ? p.name : c.name),
      cut.tabs.length > 1 ? h("span.tab-close", { role: "button", "aria-label": `Close ${c.name}`, title: "Close the tab — the edit is kept", on: { click: (e) => (e.stopPropagation(), closeCut(id)) } }, icon("close")) : null);
  };
  return h("div.subbar", {}, h("div.subbar-in", {},
    h("nav.tabs", { "aria-label": "Edits" }, h("div.tablist", { role: "tablist", "aria-label": "Edits" }, ...cut.tabs.filter((id) => id === p?.id || inProject("cut", cut.list.find((c) => c.id === id) ?? { id })).map(tab)), h("button.tab-add", { type: "button", title: "A new, empty edit", on: { click: () => (stop(), newCut()) } }, icon("plus"), "New edit")),
    h("div.subbar-actions", {},
      key(sprite("edit-undo"), "Undo — Ctrl Z", undo, { disabled: !cut.history.length }),
      key(sprite("edit-redo"), "Redo — Ctrl Shift Z", redo, { disabled: !cut.future.length }),
      key(sprite("copy"), "Duplicate the edit", () => duplicateCut()),
      key(icon("trash"), armed === p?.id ? "Click again to delete it for good" : "Delete the edit", () => {
        if (armed !== p?.id) return ((armed = p?.id), renderShell(), setTimeout(() => ((armed = null), renderShell()), 3000));
        armed = null;
        stop();
        deleteCut();
      }, { "aria-pressed": String(armed === p?.id) }),
      key(sprite("export"), "Render the film into the Library", renderFilm, { disabled: cut.busy.has("render") }))));
}
let armed = null;

// ---------------------------------------------------------------- the page

function build(el) {
  const parts = editorParts();
  const monitor = h("section.cut-monitor", {}, parts.stage, parts.transport);
  const binEl = h("section.cut-bin");
  // the assistant's bar lives in this slot: the slot is kept when the page is built again
  const chat = el.querySelector("#cut-chat") ?? h("div.cut-chat", { id: "cut-chat" });
  const top = h("div.cut-top", {}, binEl, monitor, parts.inspector);
  const sub = h("div.cut-sub");
  el.replaceChildren(h("h1.sr-only", {}, "Cut"), sub, h("div.cut-page", {}, top, parts.timeline), chat);
  shell = { el, sub, bin: binEl, monitor };
}

function renderShell() {
  shell.sub.replaceChildren(subbar());
  renderBin();
  drawEditor("cut");
}

export function renderCut(el) {
  const ready = loadCuts();
  // an edit held for another product (Jam's) is put away once the list of edits is known: Kitchen's own is open here
  if (cut.quiet) ready.then(() => reclaim());
  if (!cut.project || cut.quiet) {
    // (the assistant's slot stays: its bar may be docked in it)
    const chat = el.querySelector("#cut-chat");
    if (!el.querySelector(".cut-loading")) el.replaceChildren(h("div.cut-loading", {}, cut.error ? h("p", {}, cut.error) : h("span.typing", {}, h("i"), h("i"), h("i"))), ...(chat ? [chat] : []));
    return;
  }
  // the editor's parts are shared with Jam: when Jam has had them, they are put back
  const parts = editorParts();
  if (!shell || shell.el !== el || !shell.monitor.contains(parts.stage) || !el.contains(parts.timeline) || !el.contains(parts.inspector)) build(el);
  renderShell();
  document.dispatchEvent(new Event("cut:drawn"));
}
// a page comes back drawn again, so the editor's parts (which the other page may have had) are in it
window.addEventListener("hashchange", () => currentPage() === "cut" && changed("cut"));
