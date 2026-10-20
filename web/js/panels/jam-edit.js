// The edit: the cut on the beat in the editor Cut has (monitor, timeline, the beat lane, the joins), the beat
// effects, the stickers, and the two keys that finish it: Make the video (shots rolled where they are not yet,
// with its estimate) and Export MP4 (the edit as it is, free). What is picked on the timeline, and the beats'
// tools, are the editor's own inspector, in a window.
import { h, icon } from "../dom.js";
import { changed } from "../store.js";
import { api } from "../api.js";
import { jam, making, makeVideo, exportVideo, costOfVideo, setWorkspace, openWindow } from "../jam.js";
import { cut, addFx, addSticker, addPictureSticker, setItem, removeItem, select, track, STICKERS, loadStickers, flushCuts } from "../cut.js";
import { EVERY, FX_DEFAULTS } from "../fx.js";
import { editorParts } from "./editor.js";
import { bento, jicon, cr, lamp, dial, pickFile, registerWindow } from "./jam-ui.js";

const FX_ICON = { shake: "shake", zoom: "pulse", flash: "flash", hue: "colour" };
const FX_NAME = { zoom: "Zoom", shake: "Shake", flash: "Flash", hue: "Colour" };
const FX_ORDER = ["shake", "zoom", "flash", "hue"];
const MAX = 1.5; // the dial's top is this strength of an effect
let fxLevel = null; // the strength new effects are put on with when the dial was turned with none picked (null: each kind's own)

/** The effect picked on the timeline, if one is. */
function pickedFx() {
  const id = cut.selected;
  return (id ? track("fx")?.items.find((x) => x.id === id) : null) ?? null;
}

// ---------------------------------------------------------------- the editor

function editorBento(ctx) {
  const { b, editing, parts } = ctx;
  const body = !editing
    ? h("div.jm-empty", {}, h("p", {}, !b?.track ? "Add a song first: the edit is cut on its beat." : "The edit is being made…"), !b?.track ? h("button.key", { type: "button", on: { click: () => setWorkspace("track") } }, jicon("disc"), "Go to the track") : null)
    : h("div.jm-editor", {},
      h("div.jm-ed-monitor", {}, h("div.jm-set", {}, h("i.jm-beam.is-a"), h("i.jm-beam.is-b"), h("i.jm-beam.is-c"), parts.stage), h("div.jm-ed-transport", {}, parts.transport)),
      h("div.jm-ed-timeline", {}, parts.timeline));
  return bento({ id: "editor", title: "EDITOR", win: editing ? "editor" : null }, body);
}

// a double click on an item of the timeline opens what is picked, in a window
let wired = false;
export function wireTimeline(parts) {
  if (wired) return;
  wired = true;
  parts.timeline.addEventListener("dblclick", (e) => e.target.closest?.(".cut-item") && openWindow("editor"));
}

// ---------------------------------------------------------------- the effects

function fxKeys() {
  const now = pickedFx();
  return h("div.jm-fx", {}, ...FX_ORDER.map((kind) =>
    h("button.jm-fxkey", { type: "button", "aria-pressed": String(now?.kind === kind), disabled: !cut.project, title: `${FX_NAME[kind]} on the beat, from the playhead`, dataset: { fx: kind }, on: { click: () => {
      const it = addFx(kind, { at: cut.playhead });
      if (it && fxLevel !== null) setItem(it.id, { intensity: Math.round(fxLevel * MAX * 100) / 100 }, { history: false });
    } } }, jicon(FX_ICON[kind]), FX_NAME[kind])));
}

function intensity(now) {
  const level = now ? Math.min(1, (Number(now.intensity ?? FX_DEFAULTS[now.kind]?.intensity) || 0) / MAX) : (fxLevel ?? 0.4);
  return dial(level, { label: now ? `${FX_NAME[now.kind]} strength` : "Intensity", disabled: !cut.project, onChange: (v, done) => {
    const strength = Math.round(v * MAX * 100) / 100;
    if (now) setItem(now.id, { intensity: strength }, { history: done });
    else fxLevel = v;
  } });
}

function effectsBento() {
  const now = pickedFx();
  return bento({ id: "effects", title: "EFFECTS" }, fxKeys(), h("div.jm-dialwrap", { dataset: { fx: now?.id ?? "none" } }, intensity(now)));
}

// ---------------------------------------------------------------- the stickers

function stickerGrid(list) {
  return list.map((s) => h("button.jm-sticker", { type: "button", disabled: !cut.project, title: `${s.name}: put it on the frame`, on: { click: () => addSticker(s.id, { at: cut.playhead }) } }, h("img", { src: `brand/jam/stickers/${s.file}`, alt: s.name, draggable: false, loading: "lazy" })));
}

function stickersBento() {
  loadStickers();
  return bento({ id: "stickers", title: "STICKERS" },
    h("div.jm-stickers", {}, ...stickerGrid(STICKERS.list.slice(0, 7)),
      h("button.jm-sticker.is-more", { type: "button", title: "All the stickers", "aria-label": "All the stickers", on: { click: () => openWindow("stickers") } }, jicon("expandwin"))));
}

// ---------------------------------------------------------------- make

function makeState(b) {
  const busy = making() || jam.busy.has("render");
  const clips = !!b?.shots?.length && b.shots.every((s) => s.clip);
  return { busy, cost: costOfVideo(), clips, ready: !!b?.shots?.length && (!!b.artist || clips) };
}

/** The two keys that finish the video: Make (rolls what is not made yet: it costs, so it is pressed) and Export (free). */
function makeKeys(b, { done } = {}) {
  const m = makeState(b);
  const name = (jam.jam?.name ?? "jam").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "jam";
  return [
    h("button.jm-makebig", { type: "button", disabled: m.busy || !m.ready, title: !b?.part ? "Add a track first" : !m.ready ? "Pick the artist first" : "Every shot not made yet is rolled with LTX-2.5 (it costs credits, so it waits for this key), then the video is cut with its captions", on: { click: () => (makeVideo(), done?.()) } },
      jicon("sparkle"), h("b", {}, making() ? "Making…" : "Make the video"), m.cost ? h("em", {}, cr(m.cost)) : null),
    h("div.jm-row.is-split", {},
      h("button.jm-exportkey", { type: "button", disabled: !b?.part || m.busy, title: "Render the edit as it is now: the picture, the beat effects, stickers and words, the sound (free)", on: { click: () => (exportVideo(), done?.()) } }, jicon("upload"), jam.busy.has("render") ? "Exporting…" : "Export MP4"),
      b?.film ? h("a.jm-exportkey.is-link", { href: b.film.url, download: `${name}.mp4`, title: "Download the video", "aria-label": "Download the video" }, jicon("download")) : null),
  ];
}

function makeBento(ctx) {
  return bento({ id: "make", title: "MAKE" }, ...makeKeys(ctx.b));
}

export function editWorkspace(ctx) {
  wireTimeline(ctx.parts);
  return [editorBento(ctx), effectsBento(), stickersBento(), makeBento(ctx)];
}

// ---------------------------------------------------------------- windows

registerWindow("editor", {
  title: "THE EDITOR'S DETAILS",
  wide: true,
  build() {
    // the inspector is the editor's own: what is picked on the timeline, and the beats
    return [h("p.jm-note", {}, cut.selected || cut.beat !== null ? "" : "Pick a clip, a line, a sticker or an effect on the timeline to change it. With nothing picked, these are the beats' tools."), editorParts().inspector];
  },
});

registerWindow("effects", {
  title: "EFFECTS",
  wide: true,
  build() {
    const items = track("fx")?.items ?? [];
    return [
      fxKeys(),
      items.length ? h("div.jm-fxlist", {}, ...items.map((it) => {
        const d = FX_DEFAULTS[it.kind] ?? FX_DEFAULTS.zoom;
        const level = Number(it.intensity ?? d.intensity) || 0;
        return h(`div.jm-fxrow${it.on === false ? ".is-off" : ""}${cut.selected === it.id ? ".is-picked" : ""}`, {},
          h("button.jm-fxname", { type: "button", title: "Pick it on the timeline", on: { click: () => (select(it.id), changed("jam")) } }, jicon(FX_ICON[it.kind] ?? "pulse"), FX_NAME[it.kind] ?? it.kind),
          h("button.jm-toggle", { type: "button", "aria-pressed": String(it.on !== false), title: it.on === false ? "Turn it on" : "Turn it off", on: { click: () => setItem(it.id, { on: it.on === false }) } }, lamp(it.on === false ? "off" : "ok")),
          h("label", {}, h("span.label", {}, "Every"), h("select.field", { on: { change: (e) => setItem(it.id, { every: Number(e.target.value) }) } }, ...EVERY.map(([v, label]) => h("option", { value: v, selected: Number(it.every ?? d.every) === v }, label)))),
          h("label", {}, h("span.label", {}, `Strength ${Math.round(level * 100)}%`), h("input", { type: "range", min: 0, max: 2, step: 0.05, value: level, on: { input: (e) => setItem(it.id, { intensity: Number(e.target.value) }, { history: false }), change: () => flushCuts() } })),
          h("label", {}, h("span.label", {}, "From (s)"), h("input.field", { type: "number", step: 0.1, min: 0, value: Number(it.start) || 0, on: { change: (e) => setItem(it.id, { start: Number(e.target.value) || 0 }), keydown: (e) => e.stopPropagation() } })),
          h("label", {}, h("span.label", {}, "Lasts (s)"), h("input.field", { type: "number", step: 0.5, min: 0.5, value: Number(it.length) || 8, on: { change: (e) => setItem(it.id, { length: Math.max(0.5, Number(e.target.value) || 8) }), keydown: (e) => e.stopPropagation() } })),
          h("button.key.is-icon.is-quiet", { type: "button", title: "Take it away", "aria-label": "Take it away", on: { click: () => removeItem(it.id) } }, jicon("trash")));
      })) : h("p.jm-note", {}, "No effects yet. Pick one above: it fires on the beats from the playhead on."),
    ];
  },
});

registerWindow("stickers", {
  title: "STICKERS",
  wide: true,
  build() {
    loadStickers();
    return [
      h("div.jm-stickers.is-all", {}, ...stickerGrid(STICKERS.list)),
      h("div.jm-row", {},
        h("button.key", { type: "button", disabled: !cut.project, title: "A PNG of your own, with its own shape", on: { click: () => pickFile("image/png,image/webp,image/gif", async (file) => {
          const name = file.name.replace(/\.\w+$/, "");
          const p = await api.upload(file, name);
          addPictureSticker({ ...p, name });
        }) } }, icon("upload"), "Your own"),
        h("span.jm-note", {}, "It goes on the frame at the playhead: move it, turn it and resize it on the monitor, and set when it shows on the timeline.")),
    ];
  },
});

registerWindow("make", {
  title: "MAKE",
  build() {
    const b = jam.jam?.body;
    const m = makeState(b);
    return [
      h("p.jm-note", {}, m.cost ? `Rolling the shots not made yet costs about ${m.cost} credits. It only starts when you press the key; shots already made stay.` : m.clips ? "Every shot is already made: the video is only cut and exported." : "Nothing to roll yet: pick the artist, and the shots are planned from the part."),
      ...makeKeys(b, { done: () => openWindow(null) }),
      b?.film ? h("video.jm-film", { src: b.film.url, controls: true, preload: "metadata" }) : null,
    ];
  },
});
