// The track: the record, the part of it the video uses and its beats (found here, free); the ways to start
// (your song, a track made from a few words, a dance trend's own sound); the key that hears the words.
// Nothing that costs credits starts by itself: the keys with "≈ cr" on them are pressed.
import { h, icon, pad2 } from "../dom.js";
import { state, changed, toast } from "../store.js";
import { go } from "../router.js";
import { TRENDS, crewFace, crewById, trendArt } from "../mixer-trends.js";
import { jam, useTrack, makeTrack, setLength, setStart, LENGTHS, startFromTrend, listen, costOfTrack, costOfWords, openWindow, setWorkspace, cutPart } from "../jam.js";
import { cut, tempoOctave, select } from "../cut.js";
import { editor } from "./editor.js";
import { bento, jicon, vinyl, tonearm, clock, mins, pickFile, keep, cr, lamp, registerWindow } from "./jam-ui.js";

/** The dance-led trends, those we have made ourselves (their own sound, our version of the dance) first. */
export const DANCES = TRENDS.filter((t) => t.home === "jam").sort((a, z) => Number(!!z.recipe) - Number(!!a.recipe));

let making_ = null; // the "make a track" form, what is typed in it (null: none yet)
const form = (b) => (making_ ??= { prompt: b?.feel?.prompt ?? "", lyrics: "", seconds: b?.feel?.seconds ?? 30, bpm: b?.feel?.bpm ?? 100 });

// ---------------------------------------------------------------- the waveform

const peaksOf = new Map();
/** The track's loudness, 150 bars (decoded once, kept). */
function peaksFor(url) {
  if (!peaksOf.has(url)) {
    // (decoded by an offline context, which needs no sound card and is not one of the few a page may hold open)
    peaksOf.set(url, fetch(url).then((r) => r.arrayBuffer()).then((buf) => new OfflineAudioContext(1, 1, 44100).decodeAudioData(buf)).then((a) => {
      const d = a.getChannelData(0);
      const step = Math.max(1, Math.floor(d.length / 150));
      return Array.from({ length: 150 }, (_, i) => {
        let m = 0;
        for (let k = i * step; k < (i + 1) * step; k += 64) m = Math.max(m, Math.abs(d[k] ?? 0));
        return m;
      });
    }).catch(() => null));
  }
  return peaksOf.get(url);
}

/** The track as bars, the part used lit, the beats found ticked along the foot; a click on it starts the video there. */
function waveform(b, { height = 128, big = false } = {}) {
  const beats = b.beats?.length ?? 0;
  return keep(`wave:${big}:${b.track.url}:${b.span?.from}:${b.span?.to}:${beats}`, () => {
    const canvas = h("canvas.jm-wave-canvas", { width: big ? 1400 : 900, height });
    const total = b.track.seconds || 1;
    const draw = (peaks) => {
      const g = canvas.getContext("2d");
      const W = canvas.width;
      const H = canvas.height;
      g.clearRect(0, 0, W, H);
      const n = peaks.length;
      const w = W / n;
      const room = H - (beats ? 14 : 0);
      peaks.forEach((p, i) => {
        const t = (i / n) * total;
        const inside = t >= (b.span?.from ?? 0) && t <= (b.span?.to ?? total);
        g.fillStyle = inside ? "#F2FF59" : "rgba(160, 158, 172, .42)";
        const hh = Math.max(3, p * room * 0.94);
        g.fillRect(i * w + 0.5, (room - hh) / 2 + 2, Math.max(1.5, w - 2), hh);
      });
      // the part's edges, and the beats found in it
      g.fillStyle = "#F2FF59";
      for (const t of [b.span?.from ?? 0, b.span?.to ?? total]) g.fillRect(Math.round((t / total) * W) - 1, 0, 2.5, room + 4);
      if (beats) {
        g.fillStyle = "rgba(240, 239, 237, .5)";
        const from = b.span?.from ?? 0;
        for (const t of b.beats) {
          const x = Math.round(((from + t) / total) * W);
          if (x >= 0 && x <= W) g.fillRect(x, H - 9, 1.5, 7);
        }
      }
    };
    draw(Array(150).fill(0.06));
    peaksFor(b.track.url).then((p) => p && draw(p));
    canvas.addEventListener("pointerdown", (e) => {
      const r = canvas.getBoundingClientRect();
      setStart(((e.clientX - r.left) / r.width) * total);
    });
    canvas.title = "Click where the video starts";
    return canvas;
  });
}

function ticks(b) {
  const total = b.track.seconds;
  const step = total <= 75 ? 10 : total <= 200 ? 30 : 60;
  const n = Math.min(8, Math.floor(total / step) + 1);
  return h("div.jm-wave-times", {}, ...Array.from({ length: n }, (_, i) => h("span", {}, mins(i * step))), h("span.is-end", {}, mins(total)));
}

// ---------------------------------------------------------------- the record

function chips(b) {
  const len = (b.span?.to ?? 0) - (b.span?.from ?? 0);
  return h("div.jm-lengths", { title: "How long the video runs" }, ...LENGTHS.map((l) => {
    const on = l ? Math.abs(len - Math.min(l, b.track.seconds)) < 0.6 : Math.abs(len - b.track.seconds) < 0.6;
    return h("button.jm-chip", { type: "button", "aria-pressed": String(on), disabled: l > b.track.seconds + 1, on: { click: () => setLength(l) } }, l ? `${l} s` : "Full");
  }));
}

/** What the record says of itself: ready, or what is being done (the part cut, a track being made). */
function readiness(b) {
  const busy = jam.busy.has("track") ? "Adding the song" : jam.busy.has("make") ? "Making the track" : jam.busy.has("part") || jam.starting ? "Cutting the part, finding the beats" : jam.busy.has("listen") ? "Hearing the words" : null;
  return busy ? h("span.jm-ready.is-busy", {}, lamp("busy"), busy) : b?.part ? h("span.jm-ready", {}, lamp("ok"), "Ready") : null;
}

// the record plays the part: a press on it, and it turns while it sounds (the same turning as while the film plays)
let ear = null;
const turning = (on) => document.querySelector(".jam")?.classList.toggle("is-playing", on);
/** The record stops (the page is left, the part changed, or the film starts). */
export function stopRecord() {
  if (ear && !ear.paused) ear.pause();
}
document.addEventListener("editor:play", stopRecord);
function playRecord(b) {
  if (!b?.part) return;
  if (ear?.dataset.url === b.part.url) return void (ear.paused ? ear.play().catch(() => {}) : ear.pause());
  stopRecord();
  editor.stop();
  ear = new Audio(b.part.url);
  ear.dataset.url = b.part.url;
  ear.addEventListener("play", () => turning(true));
  for (const ev of ["pause", "ended"]) ear.addEventListener(ev, () => turning(false));
  ear.play().catch(() => {});
}

function recordBento(ctx) {
  const { b } = ctx;
  const has = !!b?.track;
  if (ear && ear.dataset.url !== b?.part?.url) stopRecord();
  const press = has && b.part;
  return bento({ id: "record", title: "RECORD", win: has ? "record" : null },
    h(`div.jm-turntable${has ? "" : ".is-empty"}`, {},
      h("div.jm-deck", {},
        h(`div.jm-disc${press ? ".is-key" : ""}`, press ? { role: "button", tabindex: "0", title: "Play the part", "aria-label": "Play the part", on: { click: () => playRecord(b), keydown: (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), playRecord(b)) } } : {}, vinyl(), press ? h("span.jm-spinplay", {}, h("i.is-play", {}, jicon("play")), h("i.is-pause", {}, jicon("pause"))) : null),
        tonearm()),
      h("div.jm-song-block", {},
        h(`h2.jm-song${has ? "" : ".is-empty"}`, {}, has ? b.track.name : "Drop your song"),
        has ? h("span.jm-bpm", {}, b.bpm ? `${Math.round(b.bpm)} BPM` : b.part ? "no tempo found" : "") : h("p.jm-hint", {}, "An MP3, a WAV, or a video with sound. Or make a track from a few words, or start from a dance trend."),
        readiness(b))),
    has ? h("div.jm-wave", {}, waveform(b), ticks(b)) : null,
    has ? chips(b) : null);
}

// ---------------------------------------------------------------- the ways to start

/** A dance trend's card: its cover, its length, its name and who dances; the trend again in Mixer with your own cast beside it. */
export function trendCard(t) {
  const starting = jam.starting === t.id;
  return h(`div.jm-trend${starting ? ".is-starting" : ""}`, {},
    h("button.jm-trend-open", { type: "button", disabled: !!jam.starting, title: `${t.name}\n${t.recipe ? "A music video from its own sound and our version of the dance" : "A music video to a track made in its feel"} · ${t.seconds} s\nNothing costs credits until you press a key that says so`, on: { click: () => startFromTrend(t) } },
      h("img", { src: trendArt(t), alt: "", draggable: false, loading: "lazy" }),
      h("span.jm-trend-len", {}, `0:${pad2(Math.round(t.seconds))}`),
      t.recipe ? h("span.jm-trend-own", {}, jicon("dancer")) : null,
      starting ? h("span.jm-trend-busy", {}, lamp("busy")) : null,
      h("span.jm-trend-foot", {},
        h("b", {}, t.name),
        h("span.jm-faces", {}, ...t.cast.map((c) => h("img", { src: crewFace(c.crew), alt: crewById(c.crew)?.name ?? "", draggable: false }))))),
    t.recipe ? h("button.jm-trend-cast", { type: "button", title: "Make it with your cast\nThe trend again in Mixer, with your pet or yourself in it", "aria-label": `Make ${t.name} with your cast`, on: { click: () => recast(t) } }, jicon("mixer")) : null);
}
async function recast(t) {
  const { selectTrend } = await import("../mixer-trend.js");
  selectTrend(t.id);
  go("mixer");
}

function startBento(ctx) {
  const { b } = ctx;
  const own = DANCES.slice(0, 3);
  const cost = costOfTrack(form(b).seconds);
  return bento({ id: "start", title: "START", cls: b?.track ? "" : "is-calling" },
    h("div.jm-ways", {},
      h("button.jm-way", { type: "button", disabled: jam.busy.has("track"), title: "A song of your own: an MP3, a WAV, or a video with sound", on: { click: () => pickFile("audio/*,video/*", useTrack) } },
        h("b", {}, "Your song"), h("span", {}, "Upload audio or a demo"), h("i.jm-way-ic", {}, jicon("cloudup"))),
      h("button.jm-way", { type: "button", disabled: jam.busy.has("make"), title: "A track made from a few words (ACE-Step 1.5): its estimate is on the key in the window", on: { click: () => openWindow("start") } },
        h("b", {}, "Make a track"), h("span", {}, "Turn an idea into a song"), h("i.jm-way-ic", {}, jicon("note")), cost !== null ? h("em.jm-cost", {}, cr(cost)) : null),
      h("div.jm-way.is-trends", {},
        h("b", {}, "From a dance trend"), h("span", {}, "Its own sound, its moves"),
        h("div.jm-strip", {}, ...own.map((t) =>
          h("button.jm-mini", { type: "button", disabled: !!jam.starting, title: `${t.name}: start a jam from it (free)`, on: { click: () => startFromTrend(t) } },
            h("img", { src: trendArt(t), alt: "", draggable: false, loading: "lazy" }), h("em", {}, t.name), jam.starting === t.id ? h("i.jm-mini-busy", {}, lamp("busy")) : null))),
        h("button.jm-more", { type: "button", on: { click: () => openWindow("start") } }, "All the trends", jicon("next")))));
}

// ---------------------------------------------------------------- hear the words

function hearBento(ctx) {
  const { b } = ctx;
  const length = b?.part?.seconds ?? 0;
  const cost = costOfWords(length || 30);
  const heard = !!b?.vocals;
  const busy = jam.busy.has("listen");
  return bento({ id: "hear", title: "HEAR THE WORDS" },
    h("div.jm-hear", {},
      h("button.jm-keybig", { type: "button", disabled: !b?.part || busy || jam.busy.has("part"), title: heard ? "Comfy has heard this part: its vocals and words are in. Hearing it again costs credits again" : "Comfy separates the vocals and writes down the words and their times: it costs credits, so it waits for this key", on: { click: () => listen() } },
        jicon("wave"), h("span.jm-keybig-text", {}, h("b", {}, heard ? "Hear them again" : "Hear the words"), cost !== null ? h("em", {}, cr(cost)) : h("em", {}, "your GPU"))),
      busy ? h("p.jm-busy", {}, lamp("busy"), "Listening: the vocals, the words, the beat") : null,
      h("p.jm-note", {}, !b?.part ? "Add a track first." : heard ? `Heard: ${(b.lines ?? []).length} lines, their times.` : "Find the vocals and their times.")));
}

// ---------------------------------------------------------------- the workspace

export function trackWorkspace(ctx) {
  return [recordBento(ctx), startBento(ctx), hearBento(ctx)];
}

// ---------------------------------------------------------------- windows

registerWindow("record", {
  title: "RECORD",
  build() {
    const b = jam.jam?.body;
    if (!b?.track) return h("p.jm-hint", {}, "Add a song first.");
    const octave = (how) => cut.project?.id === b.cut && (tempoOctave(how), changed("jam"));
    const span = b.span ?? { from: 0, to: b.track.seconds };
    return [
      h("div.jm-wave.is-big", {}, waveform(b, { height: 180, big: true }), ticks(b)),
      chips(b),
      h("div.jm-fields", {},
        h("label", {}, h("span.label", {}, "Starts at (s)"), h("input.field", { type: "number", step: 0.1, min: 0, max: b.track.seconds, value: Math.round(span.from * 10) / 10, on: { change: (e) => setStart(Number(e.target.value) || 0) } })),
        h("label", {}, h("span.label", {}, "Runs (s, 0 is all of it)"), h("input.field", { type: "number", step: 1, min: 0, max: b.track.seconds, value: Math.round((span.to - span.from) * 10) / 10, on: { change: (e) => setLength(Number(e.target.value) || 0) } })),
        h("div.jm-facts", {}, h("span.label", {}, "The track"), h("b", {}, `${b.track.name} · ${clock(b.track.seconds)}`), h("em", {}, b.bpm ? `${Math.round(b.bpm * 10) / 10} BPM, ${b.beats?.length ?? 0} beats found here (free)` : "No tempo found yet"))),
      h("div.jm-row", {},
        h("button.key", { type: "button", disabled: !b.part || jam.busy.has("part"), title: "Cut the part again and find its beats again, here (free)", on: { click: () => cutPart() } }, icon("loop"), "Find the beats again"),
        h("button.key", { type: "button", disabled: cut.project?.id !== b.cut, title: "The tempo found at half the real one: every beat doubled (free)", on: { click: () => octave("double") } }, "Twice the tempo"),
        h("button.key", { type: "button", disabled: cut.project?.id !== b.cut, title: "The tempo found at twice the real one: every other beat (free)", on: { click: () => octave("halve") } }, "Half the tempo"),
        h("button.key", { type: "button", disabled: !b.part, title: "Move them, import them, cut on them: the beat tools in the edit", on: { click: () => { select(null); cut.beat = null; setWorkspace("edit"); openWindow("editor"); } } }, jicon("scissors"), "Beat tools")),
    ];
  },
});

registerWindow("start", {
  title: "START",
  wide: true,
  build() {
    const b = jam.jam?.body;
    const f = form(b);
    const busy = jam.busy.has("make");
    // the key and its estimate follow what is typed, without the window being drawn again under the fingers
    const cost = h("em.jm-cost");
    const makeKey = h("button.key.is-primary", { type: "button", title: "ACE-Step 1.5 makes the track on Comfy: it costs credits, so it waits for this key", on: { click: () => { const m = { ...f }; making_ = null; openWindow(null); makeTrack({ ...m, name: m.prompt.split(",")[0].slice(0, 40) }); } } }, jicon("sparkle"), busy ? "Making" : "Make it", cost);
    const sync = () => {
      cost.textContent = cr(costOfTrack(f.seconds));
      makeKey.disabled = busy || !f.prompt.trim();
    };
    sync();
    return [
      h("section.jm-sec", {},
        h("h3", {}, "Your song"),
        h("div.jm-row", {},
          h("button.key", { type: "button", disabled: jam.busy.has("track"), on: { click: () => pickFile("audio/*,video/*", useTrack) } }, icon("upload"), b?.track ? "Replace the song" : "Add a song"),
          h("span.jm-note", {}, "An MP3, a WAV, or a video with sound. You can also drop it anywhere on this page."))),
      h("section.jm-sec", {},
        h("h3", {}, "Make a track"),
        h("div.jm-make", {},
          h("input.field", { value: f.prompt, placeholder: "The music: upbeat indie pop, bright vocals, handclaps", dataset: { focus: "make:prompt" }, on: { input: (e) => ((f.prompt = e.target.value), sync()) } }),
          h("textarea.field", { rows: 4, value: f.lyrics, placeholder: "[verse]\nThe words, a line each\n[chorus]\n…", dataset: { focus: "make:lyrics" }, on: { input: (e) => (f.lyrics = e.target.value) } }),
          h("div.jm-make-row", {},
            h("label", {}, h("span.label", {}, "Seconds"), h("input.field", { type: "number", min: 10, max: 240, value: f.seconds, dataset: { focus: "make:seconds" }, on: { input: (e) => ((f.seconds = Math.min(240, Math.max(10, Number(e.target.value) || 30))), sync()) } })),
            h("label", {}, h("span.label", {}, "BPM"), h("input.field", { type: "number", min: 60, max: 180, value: f.bpm, dataset: { focus: "make:bpm" }, on: { input: (e) => (f.bpm = Number(e.target.value) || 100) } })),
            makeKey))),
      h("section.jm-sec", {},
        h("h3", {}, "From a dance trend"),
        h("p.jm-note", {}, "Its own sound, cut and its beats found here, and the dance to copy. Nothing costs credits until you press a key that says so."),
        h("div.jm-trend-cards", { dataset: { scrollKey: "jm-trends" } }, ...DANCES.map(trendCard))),
    ];
  },
});

registerWindow("hear", {
  title: "HEAR THE WORDS",
  build() {
    const b = jam.jam?.body;
    const cost = costOfWords(b?.part?.seconds ?? 30);
    return [
      h("p.jm-note", {}, "Comfy separates the voice from the music, writes down what is sung and when. The words then sit on the track as lines, each word timed, ready to be captions. It costs credits, so it only starts when you press the key."),
      h("div.jm-row", {}, h("button.jm-keybig", { type: "button", disabled: !b?.part || jam.busy.has("listen"), on: { click: () => (listen(), openWindow(null)) } }, jicon("wave"), h("span.jm-keybig-text", {}, h("b", {}, b?.vocals ? "Hear them again" : "Hear the words"), h("em", {}, cost === null ? "your GPU" : cr(cost))))),
      b?.vocals ? h("p.jm-note", {}, `Heard: ${(b.lines ?? []).length} lines. Typed words and times can be changed in The words.`) : h("p.jm-note", {}, "You can also type the words yourself in The words: no credits."),
    ];
  },
});
