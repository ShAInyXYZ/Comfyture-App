// Jam's screen: the track, its lyrics and the captions' style on the left; the video and its edit in
// the middle (the same monitor and timeline Cut has: the beat, the shots, the words, effects and
// stickers, on one timeline); the artist, their dance and the look on the right, with the videos kept.
import { h, icon, sprite, pad2, ago } from "../dom.js";
import { state, changed, toast, onChange } from "../store.js";
import { openPicker, pictureOf } from "../picker.js";
import { currentPage, go } from "../router.js";
import {
  jam, loadJams, openJam, newJam, removeJam, rename, useTrack, makeTrack, setLength, setStart, LENGTHS, setLine, useLyrics,
  setArtist, setDance, clearDance, setStyle, setCaptions, setEvery, take, making, makeVideo, estimate, KINDS, exportVideo, edit,
  setLoras, save, cycleKind, rerollShot, shotState, startFromTrend,
} from "../jam.js";
import { cut } from "../cut.js";
import { lyricItems } from "../edit.js";
import { editorParts, drawEditor, editor } from "./editor.js";
import { loraStack } from "../loras.js";
import { CREW, TRENDS, crewFace, crewPicture, crewById, trendArt } from "../mixer-trends.js";
import { onServer } from "../picker.js";

const KIND_ICON = { performance: "audio-voice", dance: "channel-pose", broll: "film-make" };
const STYLES = [["karaoke", "Karaoke"], ["pop", "Pop-in"], ["bounce", "Bounce"], ["lower", "Lower third"], ["none", "No captions"]];
const clock = (s) => `${pad2(Math.floor((s ?? 0) / 60))}:${pad2(Math.floor((s ?? 0) % 60))}`;
const fine = (s) => `${clock(s)}.${pad2(Math.floor(((s ?? 0) % 1) * 100))}`;
const pick = (accept, fn) => {
  const input = h("input", { type: "file", accept, hidden: true, on: { change: () => (input.files[0] && fn(input.files[0]), input.remove()) } });
  document.body.append(input);
  input.click();
};
let making_ = null; // the "make a track" form, open or not, and what is typed in it
let editingLyrics = false;
let armed = null;

// ---------------------------------------------------------------- what is kept between redraws

const kept = new Map();
const keep = (key, make) => kept.get(key) ?? (kept.set(key, make()), kept.get(key));
/** The edit's lines of words (the editor's, once the edit is open), else the ones heard. */
const linesOf = (b) => (cut.project?.id === b.cut ? lyricItems(cut.project.body).map((it) => ({ from: Number(it.start) || 0, text: it.text })) : b.lines);
/** Everything that follows the time: the line being sung is lit, the stage lights move while it plays. */
function onTime(t) {
  const root = page?.root;
  if (!root || !jam.jam) return;
  const items = cut.project?.id === jam.jam.body.cut ? lyricItems(cut.project.body) : [];
  const line = items.findIndex((it) => t >= (Number(it.start) || 0) && t < (Number(it.start) || 0) + (Number(it.length) || 3));
  root.querySelectorAll(".jm-line").forEach((x, i) => x.classList.toggle("is-now", i === line));
}

function waveform(url, b) {
  return keep(`wave:${url}:${b.span?.from}:${b.span?.to}`, () => {
    const canvas = h("canvas.jm-wave-canvas", { width: 900, height: 120 });
    const draw = (peaks) => {
      const g = canvas.getContext("2d");
      g.clearRect(0, 0, canvas.width, canvas.height);
      const n = peaks.length;
      const w = canvas.width / n;
      const total = b.track?.seconds || 1;
      peaks.forEach((p, i) => {
        const t = (i / n) * total;
        const inside = t >= (b.span?.from ?? 0) && t <= (b.span?.to ?? total);
        g.fillStyle = inside ? "#F2FF59" : "rgba(240, 239, 237, .28)";
        const hh = Math.max(3, p * canvas.height * 0.92);
        g.fillRect(i * w + 0.5, (canvas.height - hh) / 2, Math.max(1, w - 1.5), hh);
      });
    };
    draw(Array(150).fill(0.06));
    fetch(url).then((r) => r.arrayBuffer()).then((buf) => new AudioContext().decodeAudioData(buf)).then((a) => {
      const d = a.getChannelData(0);
      const step = Math.floor(d.length / 150);
      draw(Array.from({ length: 150 }, (_, i) => {
        let m = 0;
        for (let k = i * step; k < (i + 1) * step; k += 64) m = Math.max(m, Math.abs(d[k]));
        return m;
      }));
    }).catch(() => {});
    canvas.addEventListener("pointerdown", (e) => {
      // a click on the track starts the video there
      const r = canvas.getBoundingClientRect();
      setStart(((e.clientX - r.left) / r.width) * (b.track?.seconds ?? 0));
    });
    canvas.title = "Click where the video starts";
    return canvas;
  });
}


// ---------------------------------------------------------------- the screen's head and the set list

const panelHead = (ic, title, meta) => h("div.jm-head", {}, h("span.jm-head-ic", {}, sprite(ic)), h("h2", {}, title), meta ? h("span.jm-meta", {}, meta) : null);

function header(j) {
  const b = j?.body;
  return h("header.jm-top", {},
    h("h1", {}, "Jam session"),
    h("p", {}, "Your song, on stage."),
    h("div.jm-top-tools", {},
      b?.part ? h("span.jm-chip", {}, sprite("audio-music"), `${clock(b.part.seconds)}${b.bpm ? ` · ${Math.round(b.bpm)} BPM` : ""}`) : null,
      h("span.jm-chip", {}, "9:16")));
}

function setList(j) {
  return h("section.jm-feed", {},
    h("div.jm-cards", { dataset: { scrollKey: "jm-cards" } },
      h("button.jm-card.is-new", { type: "button", title: "A new music video", on: { click: () => newJam() } },
        h("span.jm-card-plus", {}, icon("plus")), h("span.jm-card-text", {}, h("b", {}, "New jam"), h("em", {}, "Start from a song"))),
      ...jam.list.map((row) =>
        h(`div.jm-card${row.id === j?.id ? ".is-on" : ""}`, {},
          h("button.jm-card-open", { type: "button", title: row.name, on: { click: () => openJam(row.id) } },
            h("img", { src: row.thumb ?? "img/jam/stage.svg", alt: "", draggable: false, loading: "lazy" }),
            h("span.jm-card-text", {}, h("b", {}, row.name), h("em", {}, ago(row.updatedAt)))),
          h(`button.key.is-icon.is-quiet.jm-card-x${armed === row.id ? ".is-armed" : ""}`, { type: "button", title: armed === row.id ? "Click again to delete it" : "Delete this video", on: { click: () => (armed === row.id ? ((armed = null), removeJam(row.id)) : ((armed = row.id), changed("jam"), setTimeout(() => armed === row.id && ((armed = null), changed("jam")), 3000))) } }, icon("trash"))))));
}

// ---------------------------------------------------------------- the dance trends: a jam started from one

const SHELF = "comfyture.jam.shelf";
let shelf = null; // "open" (the default) or "folded": put away once, it stays away
try {
  shelf = localStorage.getItem(SHELF);
} catch {}
const setShelf = (v) => {
  shelf = v;
  try {
    localStorage.setItem(SHELF, v);
  } catch {}
  changed("jam");
};
/** The dance-led trends, those we have made ourselves (their own sound, our version of the dance) first. */
const DANCES = TRENDS.filter((t) => t.home === "jam").sort((a, z) => Number(!!z.recipe) - Number(!!a.recipe));

/** The trend recast with your own cast, in Mixer: its recipe's view, with the cast slots and Make it. */
async function recast(t) {
  const { selectTrend } = await import("../mixer-trend.js");
  selectTrend(t.id);
  go("mixer");
}

function trendCard(t) {
  const starting = jam.starting === t.id;
  return h(`div.jm-trend${starting ? ".is-starting" : ""}`, {},
    h("button.jm-trend-open", { type: "button", disabled: !!jam.starting, title: `${t.name}\n${t.recipe ? "A music video from its own sound and our version of the dance" : "A music video to a track made in its feel"} · ${t.seconds} s`, on: { click: () => startFromTrend(t) } },
      h("img", { src: trendArt(t), alt: "", draggable: false, loading: "lazy" }),
      h("span.jm-trend-len", {}, `0:${pad2(Math.round(t.seconds))}`),
      t.recipe ? h("span.jm-trend-own", {}, sprite("channel-pose")) : null,
      starting ? h("span.jm-trend-busy", {}, h("span.lamp", { dataset: { tone: "busy" } })) : null,
      h("span.jm-trend-foot", {},
        h("b", {}, t.name),
        h("span.jm-faces", {}, ...t.cast.map((c) => h("img", { src: crewFace(c.crew), alt: crewById(c.crew)?.name ?? "", draggable: false }))))),
    // a trend we have made ourselves can also be made again with your own cast
    t.recipe ? h("button.jm-trend-cast", { type: "button", title: "Make it with your cast\nThe trend again in Mixer, with your pet or yourself in it", "aria-label": `Make ${t.name} with your cast`, on: { click: () => recast(t) } }, sprite("product-mixer")) : null);
}

function trendShelf(j) {
  if (!DANCES.length) return h("section.jm-trends", { hidden: true });
  const open = shelf !== "folded";
  const cards = open ? h("div.jm-trend-cards", { dataset: { scrollKey: "jm-trends" } }, ...DANCES.map(trendCard)) : null;
  const nudge = (d) => cards?.scrollBy({ left: d * cards.clientWidth * 0.8, behavior: "smooth" });
  return h("section.jm-trends", {},
    h("div.jm-trends-head", {},
      h("div.jm-head", {}, h("span.jm-head-ic", {}, sprite("channel-pose")), h("h2", {}, "Dance trends"), h("span.jm-meta", {}, "A new jam from a dance: its sound and its moves")),
      h("div.jm-trends-tools", {},
        ...(open ? [h("button.key.is-icon.is-quiet.is-back", { type: "button", "aria-label": "Back", on: { click: () => nudge(-1) } }, icon("chevron")), h("button.key.is-icon.is-quiet.is-more", { type: "button", "aria-label": "More", on: { click: () => nudge(1) } }, icon("chevron"))] : []),
        h(`button.key.is-icon.is-quiet.jm-fold${open ? ".is-open" : ""}`, { type: "button", "aria-expanded": String(open), title: open ? "Put the dance trends away" : "Show the dance trends", on: { click: () => setShelf(open ? "folded" : "open") } }, icon("chevron")))),
    cards);
}

// ---------------------------------------------------------------- the record: the track, the words, the look

function recordPanel(j) {
  const b = j?.body ?? {};
  const busy = jam.busy.has("track") || jam.busy.has("make");
  const parts = [panelHead("audio-music", "The record", b.track ? `${clock(b.track.seconds)}${b.bpm ? ` · ${Math.round(b.bpm)} BPM` : ""}` : null)];
  parts.push(h("div.jm-turntable", {},
    h("div.jm-record", {}, h("img", { src: "img/jam/record.svg", alt: "", draggable: false })),
    h("i.jm-arm", {})));
  parts.push(h(`h3.jm-song${b.track ? "" : ".is-empty"}`, {}, b.track ? b.track.name : "Drop your song"));
  if (b.track) {
    parts.push(h("div.jm-wave", {}, waveform(b.track.url, b)),
      h("div.jm-wave-times", {}, h("span", {}, clock(b.span?.from)), h("em", {}, "Click the track where the video starts"), h("span", {}, clock(b.span?.to))));
    parts.push(h("div.jm-lengths", { title: "How long the video runs" }, ...LENGTHS.map((l) => {
      const len = (b.span?.to ?? 0) - (b.span?.from ?? 0);
      const on = l ? Math.abs(len - Math.min(l, b.track.seconds)) < 0.6 : Math.abs(len - b.track.seconds) < 0.6;
      return h("button", { type: "button", "aria-pressed": String(on), disabled: l > b.track.seconds + 1, on: { click: () => setLength(l) } }, l ? `${l} s` : "Full");
    })));
  } else parts.push(h("p.jm-hint", {}, "An MP3, a WAV or a video with sound. Or make one from a few words."));
  parts.push(h("div.jm-keys", {},
    h("button.key", { type: "button", disabled: busy, title: "A song of your own: an MP3, a WAV, or a video with sound", on: { click: () => pick("audio/*,video/*", useTrack) } }, icon(b.track ? "loop" : "upload"), b.track ? "Replace" : "Add a track"),
    h("button.key", { type: "button", disabled: busy, "aria-pressed": String(!!making_), title: "A track made from a few words and lyrics (ACE-Step 1.5)", on: { click: () => ((making_ = making_ ? null : { prompt: "", lyrics: "", seconds: 30, bpm: 100 }), changed("jam")) } }, icon("sparkle"), "Make a track")));
  if (making_) {
    parts.push(h("div.jm-make", {},
      h("input.field", { value: making_.prompt, placeholder: "The music: upbeat indie pop, bright vocals, handclaps", dataset: { focus: "make:prompt" }, on: { input: (e) => (making_.prompt = e.target.value) } }),
      h("textarea.field", { rows: 4, value: making_.lyrics, placeholder: "[verse]\nThe words, a line each\n[chorus]\n…", dataset: { focus: "make:lyrics" }, on: { input: (e) => (making_.lyrics = e.target.value) } }),
      h("div.jm-make-row", {},
        h("label", {}, h("span.label", {}, "Seconds"), h("input.field", { type: "number", min: 10, max: 240, value: making_.seconds, on: { change: (e) => (making_.seconds = Number(e.target.value) || 30) } })),
        h("label", {}, h("span.label", {}, "BPM"), h("input.field", { type: "number", min: 60, max: 180, value: making_.bpm, on: { change: (e) => (making_.bpm = Number(e.target.value) || 100) } })),
        h("button.key.is-primary", { type: "button", disabled: jam.busy.has("make"), on: { click: () => { const m = making_; making_ = null; makeTrack({ ...m, name: m.prompt.split(",")[0].slice(0, 40) }); } } }, jam.busy.has("make") ? "Making" : "Make it"))));
  }
  if (jam.starting) parts.push(h("p.jm-busy", {}, h("span.lamp", { dataset: { tone: "busy" } }), "Getting the trend: its sound and its moves"));
  if (jam.busy.has("make")) parts.push(h("p.jm-busy", {}, h("span.lamp", { dataset: { tone: "busy" } }), "Making the track"));
  if (jam.busy.has("listen")) parts.push(h("p.jm-busy", {}, h("span.lamp", { dataset: { tone: "busy" } }), "Listening: the vocals, the words, the beat"));

  if (b.track) {
    parts.push(h("div.jm-head.is-gap", {}, h("span.jm-head-ic", {}, sprite("audio-voice")), h("h2", {}, "The words"),
      h("div.card-tools", {}, h("button.key.is-icon.is-quiet", { type: "button", "aria-pressed": String(editingLyrics), title: "Your own words for the track\nThey go on the times the singing was heard at", on: { click: () => ((editingLyrics = !editingLyrics), changed("jam")) } }, icon("pencil")))));
    if (editingLyrics) {
      parts.push(h("textarea.field.jm-lyrics-edit", { rows: 6, value: b.track.lyrics ?? b.lines.map((l) => l.text).join("\n"), dataset: { focus: "lyrics" } }),
        h("button.key", { type: "button", on: { click: (e) => { useLyrics(e.target.closest(".jm-panel").querySelector(".jm-lyrics-edit").value); editingLyrics = false; } } }, icon("check"), "Put them on the singing"));
    }
    const lines = linesOf(b);
    parts.push(h("div.jm-lines", { dataset: { scrollKey: "jm-lines" } }, ...lines.map((l, i) =>
      h("div.jm-line", {},
        h("button.jm-line-at", { type: "button", title: "Play from here", on: { click: () => (editor.seek(l.from), editor.play()) } }, clock(l.from)),
        h("input", { value: l.text, "aria-label": `Line ${i + 1}`, dataset: { focus: `line:${i}` }, on: { input: (e) => setLine(i, e.target.value, { history: false }), change: (e) => setLine(i, e.target.value) } })))),
      b.part && !lines.length && !jam.busy.has("listen") ? h("p.hint", {}, "No singing was heard in this part.") : null);
  }
  return h("section.jm-panel.jm-left", {}, ...parts);
}

// ---------------------------------------------------------------- the stage: the video and its edit

/** The caption styles, each shown as it reads: the lit word is the one being sung. */
const SAMPLES = {
  karaoke: () => h("span", {}, h("b", {}, "Sun in"), " the jar"),
  pop: () => h("span", {}, "Sun ", h("b.is-big", {}, "in"), " the jar"),
  bounce: () => h("span", {}, "Sun in ", h("b.is-up", {}, "the"), " jar"),
  lower: () => "Sun in the jar",
  none: () => "—",
};
function lookRow(b) {
  return [h("div.jm-head.is-gap", {}, h("span.jm-head-ic", {}, sprite("film-make")), h("h2", {}, "The look"), h("span.jm-meta", {}, "How the words are sung on screen")),
    h("div.jm-styles", {}, ...STYLES.map(([id, label]) =>
      h(`button.jm-style.is-${id}${b.captions === id || (!b.captions && id === "karaoke") ? ".is-on" : ""}`, { type: "button", on: { click: () => setCaptions(id) } },
        h("span.jm-style-sample", {}, SAMPLES[id]()),
        h("span.jm-style-name", {}, h("i"), label))))];
}

async function openInCut(id) {
  const { setProject } = await import("../store.js");
  const { openCut, loadCuts } = await import("../cut.js");
  setProject(null);
  await loadCuts();
  await openCut(id);
  go("cut");
}

/** The video's head, and what is beside the transport: its name, export, download, the way into Kitchen's Cut. */
function stageHead(j) {
  return h("div.jm-head", {}, h("span.jm-head-ic", {}, sprite("film-make")), h("h2", {}, "The stage"),
    j ? h("input.jm-name", { value: j.name, "aria-label": "The video's name", dataset: { focus: `name:${j.id}` }, on: { input: (e) => rename(e.target.value) } }) : null);
}
function transportExtras(j) {
  const b = j?.body;
  const name = (j?.name ?? "jam").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const busy = jam.busy.has("render") || cut.busy.has("render");
  return [
    b?.part ? h("button.key.is-sm", { type: "button", disabled: busy, title: "Render the video as it is now: the picture, the beat effects, stickers and lyrics, the sound", on: { click: () => exportVideo() } }, icon("film"), busy ? "Rendering…" : "Export") : null,
    b?.film ? h("a.key.is-icon", { href: `${b.film.url}?download=${name}.mp4`, download: `${name}.mp4`, title: "Download the video" }, icon("download")) : null,
    b?.cut ? h("button.key.is-icon", { type: "button", title: "Open in Kitchen's Cut\nFine-tune the edit", on: { click: () => openInCut(b.cut) } }, icon("scissors")) : null,
  ];
}

/** The screen before there is a track to cut: the stage, with the star of the show. */
function emptyScreen() {
  return h("div.jm-screen.jm-screen-empty-wrap", {}, h("div.jm-screen-empty", {}, h("img.stage", { src: "img/jam/stage.svg", alt: "", draggable: false }), h("div.jm-empty-star", {}, h("img", { src: crewFace("praline"), alt: "", draggable: false })), h("span", {}, "Your music video plays here")));
}

// ---------------------------------------------------------------- the page: built once, redrawn in parts

let page = null;
/** The centre is built once: its screen, transport, timeline and inspector hold the film's players and the timeline's scroll. */
function buildPage(el) {
  const parts = editorParts();
  const stageSlot = h("div.jm-stage-slot");
  const set = h("div.jm-set", {}, h("i.jm-beam.is-a"), h("i.jm-beam.is-b"), h("i.jm-beam.is-c"), stageSlot, h("div.jm-eq", {}, ...Array.from({ length: 28 }, (_, i) => h("i", { style: { "--i": i } }))));
  const head = h("div.jm-head-slot");
  const transport = h("div.jm-transport", {}, parts.transport);
  const work = h("div.jm-work");
  const empty = h("div.jm-timeline-empty", {}, h("img", { src: "img/jam/dancer.svg", alt: "", draggable: false }), h("span", {}, "Add a track: the video is cut on its beat, the singing performed, the rest danced."));
  const look = h("div.jm-look-slot");
  const centre = h("section.jm-panel.jm-centre", {}, head, set, transport, work, look);
  const top = h("header.jm-top");
  const feed = h("section.jm-feed");
  const trends = h("section.jm-trends");
  const left = h("section.jm-panel.jm-left");
  const right = h("section.jm-panel.jm-right");
  const chat = h("div.jm-chat#jam-chat");
  const root = h("div.jam", {}, top, feed, trends, left, centre, right, chat);
  el.replaceChildren(root);
  page = { el, root, top, feed, trends, left, centre, right, head, set, stageSlot, transport, work, empty, look, parts, chat };
}

/** A region redrawn in place: the new one takes the old one's place and keeps its place on the grid. */
function swap(slot, fresh) {
  slot.className = fresh.className;
  slot.hidden = fresh.hidden;
  slot.replaceChildren(...fresh.childNodes);
}

export function renderJam(el) {
  loadJams();
  const j = jam.jam;
  const b = j?.body;
  if (!page || page.el !== el || !el.contains(page.root)) buildPage(el);
  const active = document.activeElement;
  const focus = el.contains(active) ? active.dataset.focus : null;
  const sel = focus ? [active.selectionStart, active.selectionEnd] : null;
  const cards = el.querySelector(".jm-cards");
  const scrolled = cards?.scrollLeft ?? 0;
  const shelved = el.querySelector(".jm-trend-cards")?.scrollLeft ?? 0;
  // the parts that are Jam's own are drawn again; the editor's are only brought up to date
  swap(page.top, header(j));
  swap(page.feed, setList(j));
  swap(page.trends, trendShelf(j));
  swap(page.left, recordPanel(j));
  swap(page.right, bandPanel(j));
  page.head.replaceChildren(stageHead(j));
  const editing = !!b?.part && cut.project?.id === b.cut;
  page.stageSlot.replaceChildren(editing ? page.parts.stage : emptyScreen());
  page.parts.extras.replaceChildren(...transportExtras(j).filter(Boolean));
  page.transport.replaceChildren(page.parts.transport);
  page.transport.hidden = !editing;
  page.work.replaceChildren(...(editing ? [page.parts.timeline, ...(wide.matches ? [] : [page.parts.inspector])] : [page.empty]));
  page.look.replaceChildren(...(b?.track ? lookRow(b) : []));
  if (editing) drawEditor("jam");
  else if (b?.part) edit(j).then(() => changed("jam")).catch(() => {});
  const nc = el.querySelector(".jm-cards");
  if (nc && scrolled) nc.scrollLeft = scrolled;
  const ns = el.querySelector(".jm-trend-cards");
  if (ns && shelved) ns.scrollLeft = shelved;
  if (focus) {
    const back = el.querySelector(`[data-focus="${CSS.escape(focus)}"]`);
    back?.focus({ preventScroll: true });
    if (back && sel && back.setSelectionRange) try { back.setSelectionRange(...sel); } catch {}
  }
  document.dispatchEvent(new Event("jam:drawn"));
}

// the editor changed (an effect added, a word moved): its parts are drawn again, unless a field in them is being typed in
onChange((scopes) => {
  if (!page || currentPage() !== "jam" || !scopes.has("cut") || !jam.jam?.body.part || cut.project?.id !== jam.jam.body.cut) return;
  // something newly picked on the timeline opens the edit beside the stage
  const pick = cut.selected ?? (cut.beat !== null ? `beat:${cut.beat}` : null);
  if (pick && pick !== lastPick && wide.matches && rightTab !== "edit") (rightTab = "edit"), changed("jam");
  lastPick = pick;
  const a = document.activeElement;
  if (a && page.parts.inspector.contains(a) && a.matches("input, textarea, select")) return;
  requestAnimationFrame(() => cut.project?.id === jam.jam?.body.cut && drawEditor("jam"));
});
editor.onTime = onTime;
// the page comes back drawn again: the editor's parts, which Kitchen's Cut may have had, are put back
window.addEventListener("hashchange", () => currentPage() === "jam" && changed("jam"));
document.addEventListener("editor:inspect", () => currentPage() === "jam" && wide.matches && rightTab !== "edit" && ((rightTab = "edit"), changed("jam")));
// the stage's lights and the record turn while the film plays
document.addEventListener("editor:play", () => page?.root.classList.add("is-playing"));
document.addEventListener("editor:stop", () => page?.root.classList.remove("is-playing"));

// ---------------------------------------------------------------- the band: the artist, the moves, the vibe

async function useCrew(c) {
  try {
    const p = await onServer(crewPicture(c.id), c.name);
    await setArtist({ ...p, name: c.name });
    if (jam.jam?.body.artist) { jam.jam.body.artist.crew = c.id; save(); }
  } catch (err) { toast(err.message, { tone: "crit" }); }
}

/** Where the editor's inspector goes: beside the stage in the right column (a tab of it) when the page is wide, else under the timeline. */
const wide = window.matchMedia("(min-width: 1281px)");
let rightTab = "band";
let lastPick = null;
wide.addEventListener?.("change", () => currentPage() === "jam" && changed("jam"));

/** The shots, one row each: the kind (a click picks another), how far it is, a way to roll it again. */
function shotList(b) {
  if (!b?.shots.length) return null;
  return h("div.jm-shots", {}, h("span.label", {}, `Shots: ${b.shots.length}`),
    ...b.shots.map((s, i) => {
      const st = shotState(s, i);
      const rolling = st.step === "rolling";
      return h(`div.jm-shot-row.is-${st.step}`, {},
        h("button.jm-shot-at", { type: "button", title: "Go to this shot", on: { click: () => editor.seek(s.from) } }, pad2(i + 1)),
        h("button.jm-shot-kind", { type: "button", title: s.clip ? "A clip that came with the project: another kind makes it new" : "Another kind of shot (it is rolled again)", on: { click: () => cycleKind(i) } }, sprite(KIND_ICON[s.kind]), KINDS[s.kind]),
        h("span.jm-shot-len", {}, `${(s.to - s.from).toFixed(1)} s`),
        h("span.jm-shot-state", { title: st.note ?? "" }, rolling ? `${Math.round((st.progress ?? 0) * 100)}%` : st.step === "done" ? "made" : st.step === "failed" ? "failed" : "waiting"),
        h("button.key.is-icon.is-quiet.jm-shot-redo", { type: "button", disabled: rolling || making() || !b.artist, title: "Roll this shot again", on: { click: () => rerollShot(i) } }, icon("remix")));
    }));
}

function bandPanel(j) {
  const b = j?.body;
  const busy = making() || jam.busy.has("render");
  const cost = estimate();
  const done = b?.shots.length && b.shots.every((s) => s.clip || take(s)?.status === "done");
  const star = CREW.find((c) => c.id === b?.artist?.crew);
  const editing = !!b?.part && cut.project?.id === b.cut;
  const tabs = editing && wide.matches
    ? h("div.segment.jm-right-tabs", { role: "tablist", "aria-label": "The band or the edit" }, ...[["band", "The band"], ["edit", "Edit"]].map(([id, label]) => h("button", { type: "button", role: "tab", "aria-pressed": String(rightTab === id), on: { click: () => ((rightTab = id), changed("jam")) } }, label)))
    : null;
  if (tabs && rightTab === "edit") return h("section.jm-panel.jm-right.is-edit", {}, tabs, page.parts.inspector);
  return h("section.jm-panel.jm-right", {}, ...(tabs ? [tabs] : []),
    panelHead("channel-pose", "The band", star ? `${star.name} · ${star.role}` : null),
    h("button.jm-avatar", { type: "button", title: b?.artist ? "Another artist" : "The artist: one of our characters, a picture from the Library, or a photo of you", on: { click: (e) => openPicker(e.currentTarget, { title: "The artist", onPick: async (choice) => { try { await setArtist(await pictureOf(choice)); } catch (err) { toast(err.message, { tone: "crit" }); } } }) } },
      b?.artist ? h("img", { src: b.artist.url, alt: "", draggable: false }) : h("span", {}, h("img", { src: crewFace("praline"), alt: "", draggable: false }), "Pick who sings")),
    h("div.jm-crew", { role: "group", "aria-label": "The crew" }, ...CREW.map((c) =>
      h(`button.jm-mate${b?.artist?.crew === c.id ? ".is-on" : ""}`, { type: "button", title: `${c.name}, the ${c.role.toLowerCase()}`, on: { click: () => useCrew(c) } },
        h("img", { src: crewFace(c.id), alt: "", draggable: false }), h("b", {}, c.name), h("em", {}, c.role)))),
    h("div.jm-head.is-gap", {}, h("span.jm-head-ic", {}, sprite("channel-pose")), h("h2", {}, "The moves")),
    b?.dance
      ? h("div.jm-dance", {}, keep(`dance:${b.dance.url}`, () => h("video", { src: b.dance.url, muted: true, loop: true, autoplay: true, playsInline: true, draggable: false })),
        h("span.jm-dance-tag", {}, `${clock(b.dance.duration)} · copied`),
        h("button.jm-dance-x", { type: "button", title: "No dance: the parts without singing become b-roll", on: { click: () => clearDance() } }, icon("close")))
      : h("button.jm-dance.is-empty", { type: "button", disabled: jam.busy.has("dance"), title: "A dance video: its moves are copied in the parts without singing", on: { click: () => pick("video/*", setDance) } }, h("img", { src: "img/jam/dancer.svg", alt: "", draggable: false }), h("span", {}, icon("upload"), jam.busy.has("dance") ? "Adding" : "Add a dance")),
    h("div.jm-head.is-gap", {}, h("span.jm-head-ic", {}, icon("sparkle")), h("h2", {}, "The vibe")),
    h("textarea.field.jm-style-field", { rows: 2, value: b?.style ?? "", placeholder: "purple stage, a giant jam-jar lid, concert lights", dataset: { focus: "style" }, on: { change: (e) => setStyle(e.target.value) } }),
    h("span.label", {}, "Plan the cuts"),
    h("div.jm-cuts", { title: "How often the video cuts. A shot already made stays when it is cut where it was; to move a cut onto the beat without losing anything, use Cuts to beats in the edit" }, ...[[1, "Every bar"], [2, "Every 2 bars"], [4, "Every 4 bars"]].map(([n, label]) =>
      h("button", { type: "button", "aria-pressed": String((b?.every ?? 2) === n), disabled: !b?.part, on: { click: () => setEvery(n) } }, label))),
    h("span.label", {}, "LoRAs"),
    loraStack(b?.loras ?? [], (list) => b && setLoras(list)),
    h("span.jm-readout", { title: "LTX-2.5 rolls every shot: lip-sync, motion copy and scenes" }, sprite("section-shot"), h("b", {}, "Video: LTX-2.5"), h("em", {}, state.info?.target === "comfy-cloud" ? "≈ 4.8 cr/s" : "your GPU")),
    h("button.jm-go", { type: "button", disabled: busy || !b?.shots.length || (!b?.artist && !b.shots.every((s) => s.clip)), title: !b?.part ? "Add a track first" : !b?.artist && !b.shots.every((s) => s.clip) ? "Add the artist's photo first" : "Every shot rolled, then cut on the track with its captions", on: { click: () => makeVideo() } },
      icon("play"), h("span", {}, busy ? (jam.busy.has("render") ? "Cutting" : "Making") : done ? "Make it again" : "Make the video"), cost && !busy ? h("em", {}, `≈ ${cost} cr`) : null),
    shotList(b));
}

// a sound or a video dropped on Jam: on the artist's side a photo is the artist and a video the dance; elsewhere it's the track
document.addEventListener("dragover", (e) => currentPage() === "jam" && e.dataTransfer?.types?.includes("Files") && e.preventDefault());
document.addEventListener("drop", (e) => {
  if (currentPage() !== "jam" || !e.dataTransfer?.files?.length) return;
  e.preventDefault();
  const f = e.dataTransfer.files[0];
  const right = e.target.closest?.(".jm-right");
  if (f.type.startsWith("image/")) setArtist(f);
  else if (f.type.startsWith("video/") && right) setDance(f);
  else if (f.type.startsWith("audio/") || f.type.startsWith("video/")) useTrack(f);
  else toast("Drop a song, a photo of the artist or a dance video.");
});
