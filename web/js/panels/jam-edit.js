// The edit: the cut on the beat in the editor Cut has. The page is a monitor (the preview, the transport and a few facts), the
// shot that is picked (or the effect, or whatever the editor's own inspector holds), the timeline with its keys, and a foot
// with the frame and the keys that finish the video: Make the video (shots rolled where they are not yet: it costs, so it asks
// twice) and Export (the edit as it is, free). The beat effects, the stickers and the editor's details are windows.
import { h, icon } from "../dom.js";
import { changed } from "../store.js";
import { api } from "../api.js";
import { jam, making, makeVideo, exportVideo, costOfVideo, setWorkspace, openWindow, setKind, take, rerollShot, KINDS } from "../jam.js";
import { cut, addFx, addSticker, addPictureSticker, setItem, removeItem, select, track, findItem, commit, setJoin, snapToBeats, mainTrack, filmLength, MOTIONS, STICKERS, loadStickers, flushCuts } from "../cut.js";
import { EVERY, FX_DEFAULTS } from "../fx.js";
import { editorParts, drawEditor } from "./editor.js";
import { bento, jicon, cr, lamp, dial, pickFile, mins, registerWindow } from "./jam-ui.js";
import { pay, isArmed } from "./jam-band-pay.js";
import { smartKey } from "./jam-edit-smart.js";
import { creditsFor } from "../jam-band-model.js";

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

// ---------------------------------------------------------------- the monitor

const FORMATS = [["9:16", "Vertical"], ["16:9", "Horizontal"], ["1:1", "Square"]];
/** What there is to say of the film at a glance: its length, its shots, its tempo. */
function facts(b) {
  const made = b?.shots?.filter((s) => s.clip || take(s)?.status === "done").length ?? 0;
  const total = b?.shots?.length ?? 0;
  const bpm = cut.project?.body.beats?.bpm ?? b?.bpm;
  return h("div.jm-ed-facts", {},
    h("div.jm-fact", {}, h("span.label", {}, "Length"), h("b", {}, mins(filmLength()))),
    h("div.jm-fact", {}, h("span.label", {}, "Shots"), h("b", {}, `${made}/${total}`), h("em", {}, "made")),
    h("div.jm-fact", {}, h("span.label", {}, "Tempo"), h("b", {}, bpm ? `${Math.round(bpm)}` : "–"), h("em", {}, "bpm")));
}

function monitorBento(ctx) {
  const { b, editing, parts } = ctx;
  if (!editing) return emptyBento(b);
  const aspect = cut.project.body.aspect ?? "9:16";
  const body = h("div.jm-monitor", { dataset: { aspect } },
    h("div.jm-set", {}, parts.stage),
    h("div.jm-console", {},
      h("span.jm-frame-tag", {}, h("b", {}, aspect), FORMATS.find(([a]) => a === aspect)?.[1].toUpperCase() ?? ""),
      h("div.jm-ed-transport", {}, parts.transport),
      facts(b)));
  return bento({ id: "monitor", title: "PREVIEW", win: "editor" }, body);
}

function emptyBento(b) {
  return bento({ id: "empty", title: "THE EDIT", win: null },
    h("div.jm-empty", {}, h("p", {}, !b?.track ? "Add a song first: the edit is cut on its beat." : "The edit is being made…"),
      !b?.track ? h("button.key", { type: "button", on: { click: () => setWorkspace("track") } }, jicon("disc"), "Go to the track") : null));
}

// a double click on an item of the timeline opens what is picked, in a window
let wired = false;
export function wireTimeline(parts) {
  if (wired) return;
  wired = true;
  parts.timeline.addEventListener("dblclick", (e) => e.target.closest?.(".cut-item") && openWindow("editor"));
}

// ---------------------------------------------------------------- the timeline

function timelineBento(ctx) {
  const { editing, parts } = ctx;
  if (!editing) return null;
  const key = (glyph, title, run, extra = {}) => h("button.jm-chipkey", { type: "button", title, "aria-label": title, on: { click: run }, ...extra }, glyph);
  return bento({ id: "timeline", title: "TIMELINE", win: null,
    tools: [
      smartKey(),
      key(jicon("pulse"), "Beat effects: shake, zoom, flash, colour", () => openWindow("effects")),
      key(jicon("star"), "Stickers on the frame", () => openWindow("stickers")),
    ] }, h("div.jm-ed-timeline", {}, parts.timeline));
}

// ---------------------------------------------------------------- the shot that is picked

const motionId = (it) => MOTIONS.find(([, , m]) => JSON.stringify(m ?? null) === JSON.stringify(it.motion ?? null))?.[0] ?? "none";
const onCloud = () => costOfVideo() !== null;

/** The picked clip, when it is one of Jam's shots: which shot it is. */
function shotOf(f, b) {
  if (!f?.track.main) return -1;
  const i = f.item.shot;
  return Number.isInteger(i) && b?.shots?.[i] ? i : -1;
}

function shotPanel(f, b, i) {
  const s = b.shots[i];
  const it = f.item;
  const t = take(s);
  const made = !!s.clip || t?.status === "done";
  const cost = made ? null : creditsFor(Math.min(10, Math.max(2, Math.ceil(s.to - s.from))));
  const look = b.looks?.[s.kind]?.url ?? b.looks?.performance?.url ?? b.artist?.url;
  const pic = t?.status === "done" && t.video ? h("video", { src: t.video, muted: true, preload: "metadata", playsInline: true }) : look ? h("img", { src: look, alt: "", draggable: false }) : null;
  return [
    h("div.jm-shotpic", {}, pic, h("span.jm-shotno", {}, `SHOT ${String(i + 1).padStart(2, "0")}`), h("span.jm-shotstate", {}, lamp(made ? "ok" : "busy"), made ? "made" : "waiting")),
    h("div.jm-field", {}, h("span.label", {}, "Source"),
      h("div.jm-segs", { role: "group", "aria-label": "Source" }, ...Object.entries(KINDS).map(([k, label]) =>
        h("button.jm-seg", { type: "button", "aria-pressed": String(s.kind === k), disabled: k === "dance" && !b.dance, title: k === "performance" ? "Performance: the lips follow the vocals" : k === "dance" ? (b.dance ? "Dance: the artist copies the dance" : "Add a dance first") : "B-roll: the scene on its own", on: { click: () => setKind(i, k) } }, label)))),
    h("div.jm-field", {}, h("span.label", {}, "Duration"), h("b.jm-big", {}, `${(s.to - s.from).toFixed(1)} s`)),
    h("div.jm-field", {}, h("span.label", {}, "Move"),
      h("div.jm-chips", { role: "group", "aria-label": "Move" }, ...MOTIONS.map(([id, label, m]) =>
        h("button.jm-chip", { type: "button", "aria-pressed": String(motionId(it) === id), on: { click: () => setItem(it.id, { motion: m }) } }, label.replace("No move", "None"))))),
    h("div.jm-row", {},
      h("button.key", { type: "button", disabled: making() || !b.artist || t?.status === "running", title: made ? "Roll this shot again (LTX-2.5): it costs credits, so it asks twice" : "Roll this shot (LTX-2.5): it costs credits, so it asks twice", on: { click: () => pay(`shot${i}`, cost ?? creditsFor(2), () => rerollShot(i)) } },
        icon("remix"), isArmed(`shot${i}`) ? "Press again to roll" : made ? "Roll it again" : "Roll it", onCloud() ? h("em.jm-cost", {}, cr(cost ?? creditsFor(Math.min(10, Math.max(2, Math.ceil(s.to - s.from)))))) : null),
      h("button.jm-iconkey", { type: "button", title: "Take this clip off the timeline", "aria-label": "Take away", on: { click: () => removeItem(it.id) } }, jicon("trash"))),
  ];
}

function fxPanel(f) {
  const it = f.item;
  const d = FX_DEFAULTS[it.kind] ?? FX_DEFAULTS.zoom;
  const level = Math.min(1, (Number(it.intensity ?? d.intensity) || 0) / MAX);
  return [
    h("div.jm-shotpic.is-fx", {}, jicon(FX_ICON[it.kind] ?? "pulse"), h("span.jm-shotno", {}, (FX_NAME[it.kind] ?? it.kind).toUpperCase()), h("span.jm-shotstate", {}, lamp(it.on === false ? "off" : "ok"), it.on === false ? "off" : "on the beat")),
    h("div.jm-field", {}, h("span.label", {}, "Strength"), dial(level, { label: `${FX_NAME[it.kind] ?? "Effect"} strength`, onChange: (v, done) => setItem(it.id, { intensity: Math.round(v * MAX * 100) / 100 }, { history: done }) })),
    h("div.jm-field", {}, h("span.label", {}, "Fires"),
      h("select.field", { "aria-label": "How often", on: { change: (e) => setItem(it.id, { every: Number(e.target.value) }) } }, ...EVERY.map(([v, label]) => h("option", { value: v, selected: Number(it.every ?? d.every) === v }, label)))),
    h("div.jm-row", {},
      h("button.key", { type: "button", "aria-pressed": String(it.on !== false), on: { click: () => setItem(it.id, { on: it.on === false }) } }, lamp(it.on === false ? "off" : "ok"), it.on === false ? "Turn it on" : "Turn it off"),
      h("button.jm-iconkey", { type: "button", title: "Take it away", "aria-label": "Take it away", on: { click: () => removeItem(it.id) } }, jicon("trash"))),
  ];
}

function quietPanel() {
  return [
    h("div.jm-pick-empty", {}, jicon("scissors"), h("b", {}, "Pick a shot on the timeline"), h("p", {}, "Its source, its move and its length show here. Pick a title, a line, a sticker or an effect to change that instead.")),
    h("div.jm-row", {}, h("button.key", { type: "button", title: "The beats: find them, move them, cut on them", on: { click: () => (select(null), (cut.beat = null), openWindow("editor")) } }, jicon("wave"), "Beat tools")),
  ];
}

function selectedBento(ctx) {
  const { b, editing, parts } = ctx;
  if (!editing) return null;
  const f = cut.selected ? findItem(cut.selected) : null;
  const i = shotOf(f, b);
  let body;
  let title = "SELECTED SHOT";
  if (f && i >= 0) body = shotPanel(f, b, i);
  else if (f?.track.kind === "fx") ((title = "SELECTED EFFECT"), (body = fxPanel(f)));
  else if (f) {
    // a title, a line of lyrics, a sticker, a sound: the editor's own inspector knows how to change it (it is in the window while that is open)
    title = "SELECTED";
    body = jam.win === "editor" ? [h("p.jm-note", {}, "Its details are in the window.")] : [parts.inspector];
  } else body = quietPanel();
  return bento({ id: "selected", title, win: "editor" }, h("div.jm-selected", {}, ...body));
}

// ---------------------------------------------------------------- the foot: the frame, and the keys that finish the video

function frameChips() {
  const aspect = cut.project?.body.aspect ?? "9:16";
  return h("div.jm-formats", {}, h("span.label", {}, "Frame"),
    h("div.jm-segs", { role: "group", "aria-label": "Frame" }, ...FORMATS.map(([a, name]) =>
      h("button.jm-seg", { type: "button", "aria-pressed": String(aspect === a), title: `${name}: the video is cut for a ${a} frame`, on: { click: () => ((cut.project.body.aspect = a), commit(), drawEditor("jam")) } }, a))),
    h("span.jm-fmt", { title: "The video is exported as an MP4, 1280 pixels on its long side" }, "MP4 · 1280"));
}

function footBento(ctx) {
  const { b, editing } = ctx;
  if (!editing) return null;
  const m = makeState(b);
  const name = (jam.jam?.name ?? "jam").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "jam";
  const armed = isArmed("make");
  // Make rolls what is not made yet and costs, so it is the key while there is something to roll; with everything made, the free export is
  const make = m.todo > 0 ? h(`button.jm-primary${armed ? ".is-armed" : ""}`, { type: "button", disabled: m.busy || !m.ready, title: !b?.part ? "Add a track first" : !m.ready ? "Pick the artist first" : `Every shot not made yet is rolled with LTX-2.5 (it costs credits, so it asks twice), then the video is cut`, dataset: { go: "make" }, on: { click: () => pay("make", m.cost, makeVideo) } },
    jicon(armed ? "sparkle" : "film"), h("b", {}, making() ? "Making…" : armed ? "Press again to make" : "Make the video"), m.cost ? h("em", {}, cr(m.cost)) : null) : null;
  const exp = h(`button.${make ? "jm-exportkey" : "jm-primary"}`, { type: "button", disabled: !b?.part || m.busy, title: "Render the edit as it is now: the picture, the beat effects, stickers and words, the sound (free)", dataset: { go: "export" }, on: { click: () => exportVideo() } },
    jicon("upload"), h("b", {}, jam.busy.has("render") ? "Exporting…" : "Export the video"));
  return bento({ id: "foot", title: "EXPORT", win: "make", cls: "is-foot" },
    h("div.jm-foot", {}, frameChips(), h("span.spacer"),
      b?.film ? h("a.jm-iconkey", { href: b.film.url, download: `${name}.mp4`, title: "Download the video", "aria-label": "Download the video" }, jicon("download")) : null,
      h("button.jm-iconkey", { type: "button", title: b?.film ? "The finished video, and what making it costs" : "What making the video costs, in a window", "aria-label": "The video in a window", on: { click: () => openWindow("make") } }, jicon("expand")),
      make ? exp : null, make ?? exp));
}

// ---------------------------------------------------------------- make (its state, for the foot and the window)

function makeState(b) {
  const busy = making() || jam.busy.has("render");
  const todo = b?.shots?.filter((s) => !s.clip && take(s)?.status !== "done").length ?? 0;
  const clips = !!b?.shots?.length && b.shots.every((s) => s.clip);
  return { busy, cost: costOfVideo(), todo, clips, ready: !!b?.shots?.length && (!!b.artist || clips) };
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

// ---------------------------------------------------------------- the stickers

function stickerGrid(list) {
  return list.map((s) => h("button.jm-sticker", { type: "button", disabled: !cut.project, title: `${s.name}: put it on the frame`, on: { click: () => addSticker(s.id, { at: cut.playhead }) } }, h("img", { src: `brand/jam/stickers/${s.file}`, alt: s.name, draggable: false, loading: "lazy" })));
}

// ---------------------------------------------------------------- make

/** The two keys that finish the video: Make (rolls what is not made yet: it costs, so it is pressed) and Export (free). */
function makeKeys(b, { done } = {}) {
  const m = makeState(b);
  const name = (jam.jam?.name ?? "jam").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "jam";
  return [
    h("button.jm-makebig", { type: "button", disabled: m.busy || !m.ready, title: !b?.part ? "Add a track first" : !m.ready ? "Pick the artist first" : "Every shot not made yet is rolled with LTX-2.5 (it costs credits, so it asks twice), then the video is cut with its captions", on: { click: () => pay("make-window", m.cost, () => (makeVideo(), done?.())) } },
      jicon("sparkle"), h("b", {}, making() ? "Making…" : isArmed("make-window") ? "Press again to make" : "Make the video"), m.cost ? h("em", {}, cr(m.cost)) : null),
    h("div.jm-row.is-split", {},
      h("button.jm-exportkey", { type: "button", disabled: !b?.part || m.busy, title: "Render the edit as it is now: the picture, the beat effects, stickers and words, the sound (free)", on: { click: () => (exportVideo(), done?.()) } }, jicon("upload"), jam.busy.has("render") ? "Exporting…" : "Export MP4"),
      b?.film ? h("a.jm-exportkey.is-link", { href: b.film.url, download: `${name}.mp4`, title: "Download the video", "aria-label": "Download the video" }, jicon("download")) : null),
  ];
}

export function editWorkspace(ctx) {
  wireTimeline(ctx.parts);
  return [monitorBento(ctx), selectedBento(ctx), timelineBento(ctx), footBento(ctx)].filter(Boolean);
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
