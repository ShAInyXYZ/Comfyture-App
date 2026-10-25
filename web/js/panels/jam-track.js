// The track: the whole song as one waveform (its sections named, its drop flagged, its beats ticked, played from where you
// click), and under it three cards: the stems taken apart, the beat found, and the cut, the part of the song the video uses.
// The ways to start (your song, a song made in The song, a dance trend's own sound) are what the screen shows while there is no
// song. Nothing that costs credits starts by itself: the keys with "≈ cr" on them are pressed.
import { h, icon, pad2 } from "../dom.js";
import { changed, toast } from "../store.js";
import { go } from "../router.js";
import { TRENDS, crewFace, crewById, trendArt } from "../mixer-trends.js";
import { jam, useTrack, makeTrack, setLength, setStart, setSpan, LENGTHS, startFromTrend, listen, costOfTrack, costOfWords, openWindow, setWorkspace, cutPart, save } from "../jam.js";
import { cut, tempoOctave, select, importBeats } from "../cut.js";
import { detectSections, lyricTags } from "../jam-sections.js";
import { editor } from "./editor.js";
import { jicon, vinyl, clock, mins, pickFile, keep, cr, lamp, registerWindow } from "./jam-ui.js";
import { card, segs } from "./jam-card.js";
import { analyse, drawBars } from "./jam-track-audio.js";
import { stemsOf, lanesEl, playKey, stopStems, toggleStems } from "./jam-track-stems.js";

/** The dance-led trends, those we have made ourselves (their own sound, our version of the dance) first. */
export const DANCES = TRENDS.filter((t) => t.home === "jam").sort((a, z) => Number(!!z.recipe) - Number(!!a.recipe));

let making_ = null; // the "make a track" form, what is typed in it (null: none yet)
const form = (b) => (making_ ??= { prompt: b?.feel?.prompt ?? "", lyrics: "", seconds: b?.feel?.seconds ?? 30, bpm: b?.feel?.bpm ?? 100 });

const SECTION_COLOUR = { chorus: "#F2FF59", verse: "#8A76E8", bridge: "#B8A9F5", intro: "#A8A5B5", outro: "#A8A5B5", song: "#A8A5B5" };

// ---------------------------------------------------------------- what the song is: its beats, its drop, how long its part is

/** The part's span and length; the beats of the part in the song's own time (the edit's when it has them, else the ones heard). */
const spanOf = (b) => ({ from: b.span?.from ?? 0, to: b.span?.to ?? b.track.seconds });
function beatsOf(b) {
  const own = cut.project?.id === b.cut ? cut.project.body.beats : null;
  const from = spanOf(b).from;
  if (own?.times?.length) return { times: own.times.map((t) => from + t + (own.offset ?? 0)), down: own.down ?? 0, bpm: own.bpm ?? b.bpm, source: own.source };
  return { times: (b.beats ?? []).map((t) => from + t), down: b.down ?? 0, bpm: b.bpm, source: "heard" };
}

// ---------------------------------------------------------------- playing: the song, or its part

const play = { ear: null, url: "", kind: "song", from: 0, raf: 0, loop: false, at: 0 };
const turning = (on) => document.querySelector(".jam")?.classList.toggle("is-playing", on);
/** The song stops (the page is left, the part changed, or the film starts). */
export function stopRecord() {
  if (play.ear && !play.ear.paused) play.ear.pause();
}
document.addEventListener("editor:play", stopRecord);
document.addEventListener("stems:play", stopRecord);

/** Where the sound is in the song, in seconds. */
const nowAt = () => (play.ear ? (play.kind === "part" ? play.from : 0) + play.ear.currentTime : play.at);
function frame() {
  cancelAnimationFrame(play.raf);
  const t = nowAt();
  const total = Number(document.querySelector("[data-song-total]")?.dataset.songTotal) || 1;
  for (const el of document.querySelectorAll(".jt-ph")) el.style.left = `${Math.min(100, (t / total) * 100)}%`;
  for (const el of document.querySelectorAll(".jt-now")) el.textContent = clock(t);
  // (the part's own playhead, inside its range, while the part is heard)
  for (const el of document.querySelectorAll(".jt-sel")) {
    const [from, to] = [Number(el.dataset.from), Number(el.dataset.to)];
    const ph = el.querySelector(".jt-rph");
    if (ph) ph.style.left = play.kind === "part" && play.ear && !play.ear.paused ? `${Math.min(100, Math.max(0, ((t - from) / Math.max(0.1, to - from)) * 100))}%` : "-10%";
  }
  for (const el of document.querySelectorAll("[data-playing-key]")) el.dataset.playing = String(!!play.ear && !play.ear.paused && el.dataset.playingKey === play.kind);
  if (play.ear && !play.ear.paused) play.raf = requestAnimationFrame(frame);
}
/** The song (or its part) played from a moment, or paused when it was playing. */
function toggle(b, kind = "song", from = null) {
  const url = kind === "part" ? b.part?.url : b.track.url;
  if (!url) return;
  if (play.ear && play.url === url && play.kind === kind && !play.ear.paused) return void play.ear.pause();
  if (!play.ear || play.url !== url || play.kind !== kind) {
    stopRecord();
    const ear = new Audio(url);
    Object.assign(play, { ear, url, kind, from: kind === "part" ? spanOf(b).from : 0 });
    ear.addEventListener("play", () => (turning(true), frame()));
    for (const ev of ["pause", "ended"]) ear.addEventListener(ev, () => (turning(false), frame()));
    ear.addEventListener("seeked", frame);
  }
  const ear = play.ear;
  ear.loop = kind === "part" && play.loop;
  if (from !== null) ear.currentTime = Math.max(0, kind === "part" ? from - play.from : from);
  else if (ear.ended) ear.currentTime = 0;
  editor.stop();
  stopStems();
  ear.play().catch(() => {});
}
/** A click on a waveform moves the song to that moment (and plays from there when it is playing). */
function seek(b, t) {
  t = Math.max(0, Math.min(b.track.seconds, t));
  if (play.ear && play.kind === "song" && play.url === b.track.url) play.ear.currentTime = t;
  else play.at = t;
  if (play.ear && play.kind === "song") frame();
  else {
    // not started yet: the playhead stands where it was clicked, and play begins from there
    play.ear = null;
    play.at = t;
    frame();
  }
}

// ---------------------------------------------------------------- the song as one waveform

/** The sections of the song, found once for a track from its loudness (named by the lyrics' tags when they match). */
const sectionsOf = new Map();
function sectionsFor(b) {
  const key = `${b.track.url}|${b.bpm ?? ""}|${b.track.lyrics ?? ""}`;
  if (!sectionsOf.has(key)) sectionsOf.set(key, analyse(b.track.url).then((a) => (a ? { a, ...detectSections(a.energy, b.track.seconds, { bpm: b.bpm || b.track.bpm || 0, names: lyricTags(b.track.lyrics) }) } : null)));
  return sectionsOf.get(key);
}

/** The ruler's marks: a time every so often along the song. */
function ruler(total) {
  const step = total <= 75 ? 10 : total <= 200 ? 30 : 60;
  const marks = [];
  for (let t = 0; t <= total + 0.01; t += step) marks.push(t);
  return h("div.jt-ruler", {}, ...marks.map((t) => h("span", { style: { left: `${(t / total) * 100}%` }, className: t === 0 ? "is-first" : "" }, mins(t))));
}

/**
 * The song's waveform: one element for a song, kept between the page's redraws (it is drawn when its sound is read, and again when
 * its size or what it shows changes). Its sections are labelled above it, the drop flagged, the beats of the part ticked along its
 * foot, the part the video uses marked. `update(b)` brings it to what the jam holds now.
 */
function waveBox(b, id = "hero") {
  const total = b.track.seconds;
  return keep(`song:${id}:${b.track.url}`, () => {
    const secs = h("div.jt-secs");
    const canvas = h("canvas.jt-wave", { "aria-hidden": "true" });
    const ticks = h("canvas.jt-ticks", { "aria-hidden": "true" });
    const part = h("i.jt-part");
    const ph = h("i.jt-ph");
    const flag = h("button.jt-flag", { type: "button" }, jicon("flag"), h("span", {}, "Drop"));
    const wrap = h("div.jt-wavewrap", { dataset: { songTotal: String(total) } }, canvas, ticks, part, ph);
    const el = h("div.jt-wavebox", {}, flag, secs, wrap, ruler(total));
    let data = null;
    let sections = [];
    let now = b;
    const paint = () => {
      if (!data) return;
      const span = spanOf(now);
      const at = (p) => sections.find((s) => p * total >= s.from && p * total < s.to) ?? sections.at(-1);
      drawBars(canvas, data.peaks, { color: (p) => SECTION_COLOUR[at(p)?.kind ?? "song"] });
      // the beats of the part, ticked along the foot; a bar's first beat taller
      const bt = beatsOf(now);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const [w, hh] = [Math.round(ticks.clientWidth * dpr), Math.round(ticks.clientHeight * dpr)];
      if (!w || !hh) return;
      if (ticks.width !== w || ticks.height !== hh) ((ticks.width = w), (ticks.height = hh));
      const g = ticks.getContext("2d");
      g.clearRect(0, 0, w, hh);
      bt.times.forEach((t, i) => {
        const x = Math.round((t / total) * w);
        const first = (((i - bt.down) % 4) + 4) % 4 === 0;
        g.fillStyle = first ? "rgba(242, 255, 89, .95)" : "rgba(240, 239, 237, .45)";
        g.fillRect(x, hh - (first ? 12 : 7) * dpr, Math.max(1, dpr), (first ? 12 : 7) * dpr);
      });
    };
    const label = () => {
      const w = wrap.clientWidth || 1;
      secs.replaceChildren(...sections.map((s) => h("div.jt-sec", { dataset: { kind: s.kind }, style: { left: `${(s.from / total) * 100}%`, width: `${((s.to - s.from) / total) * 100}%` }, title: s.name },
        h("b", {}, s.name.toUpperCase()), ((s.to - s.from) / total) * w > 92 ? h("em", {}, `${mins(s.from)} – ${mins(s.to)}`) : null)));
    };
    let sig = "";
    const api = {
      el,
      sections: () => sections,
      source: "energy",
      update(next) {
        now = next;
        const span = spanOf(next);
        part.style.left = `${(span.from / total) * 100}%`;
        part.style.width = `${((span.to - span.from) / total) * 100}%`;
        const drop = next.track.drop;
        flag.hidden = typeof drop !== "number";
        if (!flag.hidden) {
          flag.style.left = `${(drop / total) * 100}%`;
          flag.title = "The drop: start the part here";
          flag.onclick = () => setStart(drop);
        }
        ph.style.left = `${Math.min(100, (nowAt() / total) * 100)}%`;
        const s = JSON.stringify([span, beatsOf(next).times.length, beatsOf(next).down, drop, next.bpm]);
        if (s !== sig) ((sig = s), paint());
      },
    };
    wrap.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".jt-flag")) return;
      const move = (ev) => {
        const r = wrap.getBoundingClientRect();
        seek(now, ((ev.clientX - r.left) / r.width) * total);
      };
      move(e);
      wrap.setPointerCapture(e.pointerId);
      wrap.addEventListener("pointermove", move);
      wrap.addEventListener("pointerup", () => wrap.removeEventListener("pointermove", move), { once: true });
    });
    wrap.title = "Click to move the song there";
    new ResizeObserver(() => (paint(), label())).observe(wrap);
    sectionsFor(b).then((got) => {
      if (!got) return;
      data = got.a;
      sections = got.sections;
      api.source = got.source;
      wrap.dataset.sections = got.source;
      secs.title = got.source === "lyrics" ? "Sections named by the lyrics' tags" : "Sections found from how loud the song is, named by loudness and place";
      label();
      paint();
    });
    return api;
  });
}

// ---------------------------------------------------------------- the hero

function heroEmpty() {
  const own = DANCES.slice(0, 3);
  const cost = costOfTrack(form(null).seconds);
  return h("section.jt-card.jt-hero.is-empty", { dataset: { card: "hero" } },
    h("div.jt-empty", {},
      h("div.jt-empty-text", {}, h("h3", {}, "Start with a song"), h("p", {}, "An MP3, a WAV, a video with sound. Or make one from a few words, or take a dance trend's own sound.")),
      h("div.jt-ways", {},
        h("button.jt-way", { type: "button", disabled: jam.busy.has("track"), title: "A song of your own: an MP3, a WAV, or a video with sound (drop it anywhere on this page too)", on: { click: () => pickFile("audio/*,video/*", useTrack) } },
          h("i", {}, jicon("cloudup")), h("b", {}, "Your song"), h("span", {}, "Upload audio or a demo")),
        h("button.jt-way", { type: "button", title: "Make a song from an idea, in The song", on: { click: () => setWorkspace("song") } },
          h("i", {}, jicon("note")), h("b", {}, "Make a song"), h("span", {}, "Turn an idea into a song")),
        h("div.jt-way.is-trends", {},
          h("b", {}, "From a dance trend"), h("span", {}, "Its own sound, its moves"),
          h("div.jt-strip", {}, ...own.map((t) =>
            h("button.jt-mini", { type: "button", disabled: !!jam.starting, title: `${t.name}: start a jam from it (free)`, on: { click: () => startFromTrend(t) } },
              h("img", { src: trendArt(t), alt: "", draggable: false, loading: "lazy" }), h("em", {}, t.name), jam.starting === t.id ? h("i.jt-mini-busy", {}, lamp("busy")) : null))),
          h("button.jt-more", { type: "button", on: { click: () => openWindow("start") } }, "All the trends", jicon("next"))))),
    h("p.jt-empty-note", {}, cost !== null ? `A track made from words costs ${cr(cost)}; the rest is free.` : "Nothing here costs credits until you press a key that says so."));
}

/** What the hero says of itself while the song is being added, cut or heard. */
function busyLine(b) {
  const busy = jam.busy.has("track") ? "Adding the song" : jam.busy.has("make") ? "Making the track" : jam.busy.has("part") || jam.starting ? "Cutting the part, finding the beats" : jam.busy.has("listen") ? "Hearing the words" : null;
  return busy ? h("span.jt-busy", {}, lamp("busy"), busy) : null;
}

function hero(b) {
  const wave = waveBox(b);
  wave.update(b);
  const playing = !!play.ear && !play.ear.paused && play.kind === "song";
  return h("section.jt-card.jt-hero", { dataset: { card: "hero" } },
    h("div.jt-hero-corner", {},
      h("div.jt-disc", { role: "button", tabindex: "0", title: "Play the song", "aria-label": "Play the song", on: { click: () => toggle(b), keydown: (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), toggle(b)) } }, vinyl()),
      h("button.jt-expand", { type: "button", title: "The song in a window", "aria-label": "The song in a window", on: { click: () => openWindow("record") } }, jicon("expand"))),
    h("div.jt-hero-main", {},
      h("div.jt-hero-play", {},
        h("button.jt-bigplay", { type: "button", dataset: { playingKey: "song", playing: String(playing) }, title: "Play the song", "aria-label": "Play the song", on: { click: () => toggle(b) } },
          h("span.is-play", {}, jicon("play")), h("span.is-pause", {}, jicon("pause"))),
        h("div.jt-time", { "data-song-total": String(b.track.seconds) }, h("b.jt-now", {}, clock(nowAt())), h("span", {}, ` / ${clock(b.track.seconds)}`))),
      h("div.jt-hero-wave", {}, wave.el)),
    h("footer.jt-hero-foot", {},
      h("div.jt-song-name", {}, h("b", {}, b.track.name), h("span", {}, b.bpm ? `${Math.round(b.bpm)} BPM` : b.part ? "no tempo found" : ""), busyLine(b) ?? (b.part ? h("span.jt-ready", {}, lamp("ok"), "Ready") : null))));
}

// ---------------------------------------------------------------- stems

function stemsCard(b) {
  const { lanes, full, partial } = stemsOf(b);
  const length = (b.part?.seconds ?? 0) || spanOf(b).to - spanOf(b).from;
  const cost = costOfWords(length || 30);
  const busy = jam.busy.has("listen");
  const heard = lanes.length > 0;
  const redo = () => changed("jam");
  return card({ id: "stems", title: "STEMS", sub: "SPLIT AND MIX", tools: [playKey(lanes)] },
    lanesEl({ lanes, seconds: length || 1, onChange: redo }),
    h("div.jt-card-foot", {},
      h("button.jt-primary", { type: "button", disabled: !b.part || busy || jam.busy.has("part"), title: full ? "The stems are split. Splitting again costs credits again" : partial ? "Only the vocals were kept for this part: splitting again gives all four stems, and costs credits again" : "Comfy takes the part apart (Demucs) and hears the words in it; it costs credits, so it only starts when you press this", on: { click: () => listen() } },
        jicon("copy"), h("span", {}, busy ? "Splitting…" : heard ? "Split again" : "Split the stems"), cost !== null && !busy ? h("em", {}, cr(cost)) : null),
      h("p.jt-note", {}, !b.part ? "Add a song first." : busy ? "Hearing the part: the stems, the words, the beat." : full ? `Four stems of the part, ${clock(length)} long. The words came with them.` : partial ? "Only the vocals were kept: the second lane is the whole mix. Split again for four." : "Also hears the words in the part.")));
}

// ---------------------------------------------------------------- the beat

const taps = [];
/** A tap on the tempo key: the tempo from the taps so far, and (tapped along to the song) where the beats fall. */
function tap(b) {
  const now = performance.now();
  if (taps.length && now - taps.at(-1).wall > 2500) taps.length = 0;
  const playing = play.ear && !play.ear.paused;
  taps.push({ wall: now, song: playing ? nowAt() : null });
  if (taps.length > 8) taps.shift();
  changed("jam");
  if (taps.length < 4) return;
  const gaps = taps.slice(1).map((t, i) => (t.wall - taps[i].wall) / 1000).sort((a, z) => a - z);
  const period = gaps[Math.floor(gaps.length / 2)];
  const bpm = Math.round(Math.min(220, Math.max(50, 60 / period)) * 10) / 10;
  // tapped along to the playing song: the beats fall where the taps did
  let offset = 0;
  const heard = taps.filter((t) => t.song !== null);
  if (heard.length >= 4) {
    const p = 60 / bpm;
    const phase = heard.map((t) => ((t.song % p) + p) % p);
    const sin = phase.reduce((s, x) => s + Math.sin((x / p) * 2 * Math.PI), 0);
    const cos = phase.reduce((s, x) => s + Math.cos((x / p) * 2 * Math.PI), 0);
    const at = ((Math.atan2(sin, cos) / (2 * Math.PI)) * p + p) % p;
    offset = ((at - spanOf(b).from) % p + p) % p;
  } else offset = cut.project?.id === b.cut ? cut.project.body.beats?.times?.[0] ?? 0 : b.beats?.[0] ?? 0;
  setTempo(b, bpm, Math.round(offset * 1000) / 1000);
}
/** A tempo (and where the first beat is, in the part) put on the part's beats: in the edit when it is open, else on the jam. */
function setTempo(b, bpm, offset = 0) {
  if (cut.project?.id === b.cut) return void importBeats(`${bpm} @ ${offset}`);
  const length = b.part?.seconds ?? spanOf(b).to - spanOf(b).from;
  const step = 60 / bpm;
  b.bpm = bpm;
  b.beats = [];
  for (let t = offset; t <= length && b.beats.length < 4000; t += step) b.beats.push(Math.round(t * 1000) / 1000);
  save();
  changed("jam");
}

function beatGrid(b) {
  const bt = beatsOf(b);
  const first = bt.times.findIndex((t) => t >= spanOf(b).from - 0.01);
  const list = bt.times.slice(Math.max(0, first), Math.max(0, first) + 16);
  // 4 bars of 4: the first beat of a bar lit, the rest as they fall
  return h("div.jt-grid", {}, h("div.jt-dots", {}, ...Array.from({ length: 16 }, (_, i) => h("i", { dataset: { first: String(i % 4 === 0), on: String(i < list.length) } }))),
    h("div.jt-bars", {}, ...[1, 2, 3, 4].map((n) => h("span", {}, h("em", {}, String(n))))));
}

function beatCard(b) {
  const bt = beatsOf(b);
  const has = bt.times.length > 0;
  const sig = b.track.signature ?? "4/4";
  return card({ id: "beat", title: "THE BEAT", sub: "TEMPO AND GRID" },
    h("div.jt-bpm", {}, h("b", { title: has ? `${Math.round(bt.bpm * 10) / 10} BPM` : "No tempo yet" }, has || bt.bpm ? String(Math.round(bt.bpm)) : "—"), h("span", {}, "BPM"),
      h("button.jt-tap", { type: "button", disabled: !b.part, dataset: { taps: String(taps.length) }, title: "Tap the tempo, four times or more (along to the song while it plays: the beats then fall where you tapped)", on: { click: () => tap(b) } }, jicon("pulse"), h("span", {}, "Tap tempo"))),
    h("div.jt-facts", {}, h("div", {}, h("b", {}, sig), h("span", {}, "TIME SIGNATURE")), h("div", {}, h("b", {}, String(bt.times.length)), h("span", {}, "BEATS FOUND"))),
    has ? beatGrid(b) : h("p.jt-note", {}, b.part ? "No beat found yet: tap the tempo, or find the beats again in the window." : "The beats are found when the part is cut."));
}

// ---------------------------------------------------------------- the cut

/** The cut's range: the song's waveform with the part lit and two handles to drag it, or the middle to move it. */
function rangeEl(b, id = "card") {
  const total = b.track.seconds;
  const span = spanOf(b);
  const canvas = keep(`range:${id}:${b.track.url}`, () => {
    const c = h("canvas.jt-range-wave", { "aria-hidden": "true" });
    analyse(b.track.url).then((a) => {
      c._data = a;
      a && drawBars(c, a.peaks, { color: (p) => (c._in?.(p) ? "#F2FF59" : "#8A76E8"), bar: 3, gap: 1.5 });
    });
    new ResizeObserver(() => c._data && drawBars(c, c._data.peaks, { color: (p) => (c._in?.(p) ? "#F2FF59" : "#8A76E8"), bar: 3, gap: 1.5 })).observe(c);
    return c;
  });
  canvas._in = (p) => p * total >= span.from - 0.2 && p * total <= span.to + 0.2;
  if (canvas._data) drawBars(canvas, canvas._data.peaks, { color: (p) => (canvas._in(p) ? "#F2FF59" : "#8A76E8") });
  // the handles are sliders for the keyboard too: the arrows move one by a second (Shift: five), and the part is cut again a moment after
  const least = Math.min(5, total);
  const handle = (left) => {
    const at = left ? span.from : span.to;
    const el = h(`i.jt-h.is-${left ? "l" : "r"}`, { title: `Drag: where the part ${left ? "starts" : "ends"}`, role: "slider", tabindex: "0", "aria-label": `Where the part ${left ? "starts" : "ends"}`,
      "aria-valuemin": String(left ? 0 : Math.min(total, span.from + least)), "aria-valuemax": String(left ? Math.max(0, span.to - least) : total), "aria-valuenow": String(Math.round(at * 10) / 10), "aria-valuetext": mins(at) });
    el.addEventListener("keydown", (e) => {
      const step = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[e.key];
      if (!step) return;
      e.preventDefault();
      e.stopPropagation();
      const by = step * (e.shiftKey ? 5 : 1);
      const now = spanOf(b);
      if (left) setSpan(Math.max(0, Math.min(now.to - least, now.from + by)), now.to);
      else setSpan(now.from, Math.min(total, Math.max(now.from + least, now.to + by)));
    });
    return el;
  };
  const sel = h("div.jt-sel", { dataset: { from: String(span.from), to: String(span.to) }, style: { left: `${(span.from / total) * 100}%`, width: `${((span.to - span.from) / total) * 100}%` } },
    handle(true), handle(false), h("i.jt-rph"));
  const read = h("div.jt-readout", {}, h("span.is-from", {}, mins(span.from)), h("b", {}, `${Math.round(span.to - span.from)} SECONDS`), h("span.is-to", {}, mins(span.to)));
  const box = h("div.jt-range", { dataset: { total: String(total) } }, canvas, sel);
  // a drag changes the range as drawn; the jam is told once it lets go (the part is cut again a moment after)
  sel.addEventListener("pointerdown", (e) => {
    const mode = e.target.closest(".jt-h.is-l") ? "l" : e.target.closest(".jt-h.is-r") ? "r" : "m";
    const r = box.getBoundingClientRect();
    const x0 = e.clientX;
    const from0 = span.from;
    const to0 = span.to;
    const min = Math.min(5, total);
    let [from, to] = [from0, to0];
    const move = (ev) => {
      const dt = ((ev.clientX - x0) / r.width) * total;
      if (mode === "m") {
        const len = to0 - from0;
        from = Math.max(0, Math.min(total - len, from0 + dt));
        to = from + len;
      } else if (mode === "l") {
        from = Math.max(0, Math.min(to0 - min, from0 + dt));
      } else to = Math.min(total, Math.max(from0 + min, to0 + dt));
      sel.style.left = `${(from / total) * 100}%`;
      sel.style.width = `${((to - from) / total) * 100}%`;
      read.querySelector(".is-from").textContent = mins(from);
      read.querySelector(".is-to").textContent = mins(to);
      read.querySelector("b").textContent = `${Math.round(to - from)} SECONDS`;
    };
    const up = () => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      if (Math.abs(from - from0) > 0.05 || Math.abs(to - to0) > 0.05) setSpan(from, to);
    };
    e.preventDefault();
    sel.setPointerCapture?.(e.pointerId);
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
  });
  return h("div.jt-rangebox", {}, box, read);
}

function lengthSegs(b) {
  const len = spanOf(b).to - spanOf(b).from;
  const on = (l) => (l ? Math.abs(len - Math.min(l, b.track.seconds)) < 0.6 : Math.abs(len - b.track.seconds) < 0.6);
  return h("div.jt-segs.is-lengths", { role: "group", "aria-label": "How long the video runs", title: "How long the video runs" },
    ...LENGTHS.map((l) => h("button.jt-seg", { type: "button", "aria-pressed": String(on(l)), disabled: l > b.track.seconds + 1, on: { click: () => setLength(l) } }, l ? `${l} s` : "Full")));
}

function cutCard(b) {
  const chorus = b.track.loud;
  const hasChorus = typeof chorus === "number";
  const looping = play.loop;
  const auditioning = !!play.ear && !play.ear.paused && play.kind === "part";
  return card({ id: "cut", title: "THE CUT", sub: "PICK THE PART",
    tools: [h("button.jt-partplay", { type: "button", disabled: !b.part, dataset: { playingKey: "part", playing: String(auditioning) }, title: b.part ? "Hear the part" : "The part is being cut", "aria-label": "Hear the part", on: { click: () => toggle(b, "part", spanOf(b).from) } }, h("span.is-play", {}, jicon("play")), h("span.is-pause", {}, jicon("pause")))] },
    lengthSegs(b),
    rangeEl(b),
    h("div.jt-card-foot.is-keys", {},
      h("button.jt-primary", { type: "button", disabled: !hasChorus, title: hasChorus ? `Start the part at the loudest stretch, ${mins(chorus)}` : "No loud stretch was found in this song", on: { click: () => setStart(chorus) } }, jicon("scissors"), h("span", {}, "Trim to the chorus")),
      h("button.jt-ghostkey", { type: "button", "aria-pressed": String(looping), title: "Hear the part again and again", on: { click: () => ((play.loop = !play.loop), play.ear && play.kind === "part" && (play.ear.loop = play.loop), changed("jam")) } }, jicon("loop"), h("span", {}, "Loop"))));
}

// ---------------------------------------------------------------- the workspace

export function trackWorkspace(ctx) {
  const { b } = ctx;
  // (the song was changed under the player, or another is open now: it is put away)
  if (play.ear && b?.track && play.kind === "song" && play.url !== b.track.url) stopRecord();
  if (!b?.track) {
    stopRecord();
    return [h("div.jt", { dataset: { empty: "true" } }, heroEmpty())];
  }
  return [h("div.jt", {}, hero(b), stemsCard(b), beatCard(b), cutCard(b))];
}

// ---------------------------------------------------------------- windows

const trendCards = () => DANCES.map(trendCard);

/** A dance trend's card: its cover, its length, its name and who dances; the trend again in Mixer with your own cast beside it. */
export function trendCard(t) {
  const starting = jam.starting === t.id;
  return h(`div.jm-trend${starting ? ".is-starting" : ""}`, {},
    h("button.jm-trend-open", { type: "button", disabled: !!jam.starting, title: `${t.name}\n${t.recipe ? "A music video from its own sound and our version of the dance" : "A music video to a track made in its feel"} · ${t.seconds} s\nNothing costs credits until you press a key that says so.`, on: { click: () => startFromTrend(t) } },
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

registerWindow("record", {
  title: "THE SONG",
  wide: true,
  build() {
    const b = jam.jam?.body;
    if (!b?.track) return h("p.jm-hint", {}, "Add a song first.");
    const octave = (how) => cut.project?.id === b.cut && (tempoOctave(how), changed("jam"));
    const span = spanOf(b);
    const wave = waveBox(b, "win");
    wave.update(b);
    return [
      h("div.jt-win-wave", {}, wave.el),
      h("div.jm-row", {}, h("button.jt-bigplay.is-small", { type: "button", dataset: { playingKey: "song", playing: String(!!play.ear && !play.ear.paused && play.kind === "song") }, title: "Play the song", on: { click: () => toggle(b) } }, h("span.is-play", {}, jicon("play")), h("span.is-pause", {}, jicon("pause"))), lengthSegs(b)),
      h("div.jm-fields", {},
        h("label", {}, h("span.label", {}, "Starts at (s)"), h("input.field", { type: "number", step: 0.1, min: 0, max: b.track.seconds, value: Math.round(span.from * 10) / 10, on: { change: (e) => setStart(Number(e.target.value) || 0) } })),
        h("label", {}, h("span.label", {}, "Runs (s, 0 is all of it)"), h("input.field", { type: "number", step: 1, min: 0, max: b.track.seconds, value: Math.round((span.to - span.from) * 10) / 10, on: { change: (e) => setLength(Number(e.target.value) || 0) } })),
        h("div.jm-facts", {}, h("span.label", {}, "The song"), h("b", {}, `${b.track.name} · ${clock(b.track.seconds)}`), h("em", {}, b.bpm ? `${Math.round(b.bpm * 10) / 10} BPM, ${b.beats?.length ?? 0} beats found here (free)` : "No tempo found yet"))),
      h("div.jm-row", {},
        h("button.key", { type: "button", disabled: !b.part || jam.busy.has("part"), title: "Cut the part again and find its beats again, here (free)", on: { click: () => cutPart() } }, icon("loop"), "Find the beats again"),
        h("button.key", { type: "button", disabled: cut.project?.id !== b.cut, title: "The tempo found at half the real one: every beat doubled (free)", on: { click: () => octave("double") } }, "Twice the tempo"),
        h("button.key", { type: "button", disabled: cut.project?.id !== b.cut, title: "The tempo found at twice the real one: every other beat (free)", on: { click: () => octave("halve") } }, "Half the tempo"),
        h("button.key", { type: "button", disabled: !b.part, title: "Move them, import them, cut on them: the beat tools in the edit", on: { click: () => { select(null); cut.beat = null; setWorkspace("edit"); openWindow("editor"); } } }, jicon("scissors"), "Beat tools in the edit")),
    ];
  },
});

registerWindow("stems", {
  title: "STEMS",
  wide: true,
  build() {
    const b = jam.jam?.body;
    if (!b?.track) return h("p.jm-hint", {}, "Add a song first.");
    const { lanes, full, partial } = stemsOf(b);
    const length = (b.part?.seconds ?? 0) || 1;
    const cost = costOfWords(length);
    return [
      h("p.jm-note", {}, full ? "The part, taken apart into vocals, drums, bass and the rest. Solo one, mute another, play them together." : partial ? "Only the vocals were kept for this part; the second lane is the whole mix. Splitting again gives all four stems." : "Comfy takes the part apart into vocals, drums, bass and the rest, and writes down the words in it. It costs credits, so it only starts when you press the key."),
      h("div.jt-win-lanes", {}, playKey(lanes), lanesEl({ lanes, seconds: length, onChange: () => changed("jam"), big: true })),
      h("div.jm-row", {}, h("button.jt-primary", { type: "button", disabled: !b.part || jam.busy.has("listen"), on: { click: () => (listen(), openWindow(null)) } }, jicon("copy"), h("span", {}, lanes.length ? "Split again" : "Split the stems"), cost !== null ? h("em", {}, cr(cost)) : null)),
    ];
  },
});

registerWindow("beat", {
  title: "THE BEAT",
  build() {
    const b = jam.jam?.body;
    if (!b?.track) return h("p.jm-hint", {}, "Add a song first.");
    const bt = beatsOf(b);
    const editing = cut.project?.id === b.cut;
    const octave = (how) => editing && (tempoOctave(how), changed("jam"));
    const typed = { text: "" };
    return [
      h("div.jt-bpm.is-big", {}, h("b", {}, bt.times.length ? String(Math.round(bt.bpm * 10) / 10) : "—"), h("span", {}, "BPM"), h("em", {}, `${bt.times.length} beats found in the part`)),
      beatGrid(b),
      h("div.jm-fields", {}, h("label", {}, h("span.label", {}, "A tempo, and where the first beat is"),
        h("input.field", { placeholder: "128  or  128 @ 0.35", dataset: { focus: "beat:tempo" }, on: { input: (e) => (typed.text = e.target.value), keydown: (e) => { e.stopPropagation(); if (e.key === "Enter" && editing) importBeats(typed.text); } } }))),
      h("div.jm-row", {},
        h("button.key", { type: "button", disabled: !editing, title: "Make the grid from the tempo typed above", on: { click: () => importBeats(typed.text) } }, icon("check"), "Use this tempo"),
        h("button.key", { type: "button", disabled: !b.part || jam.busy.has("part"), title: "Cut the part again and find its beats again, here (free)", on: { click: () => cutPart() } }, icon("loop"), "Find the beats again"),
        h("button.key", { type: "button", disabled: !editing, title: "The tempo found at half the real one: every beat doubled (free)", on: { click: () => octave("double") } }, "Twice the tempo"),
        h("button.key", { type: "button", disabled: !editing, title: "The tempo found at twice the real one: every other beat (free)", on: { click: () => octave("halve") } }, "Half the tempo")),
      editing ? null : h("p.jm-note", {}, "Typing a tempo needs the edit: it opens once the part is cut."),
    ];
  },
});

registerWindow("cut", {
  title: "THE CUT",
  build() {
    const b = jam.jam?.body;
    if (!b?.track) return h("p.jm-hint", {}, "Add a song first.");
    const span = spanOf(b);
    return [
      lengthSegs(b),
      rangeEl(b, "win"),
      h("div.jm-fields", {},
        h("label", {}, h("span.label", {}, "Starts at (s)"), h("input.field", { type: "number", step: 0.1, min: 0, max: b.track.seconds, value: Math.round(span.from * 10) / 10, on: { change: (e) => setStart(Number(e.target.value) || 0) } })),
        h("label", {}, h("span.label", {}, "Runs (s, 0 is all of it)"), h("input.field", { type: "number", step: 1, min: 0, max: b.track.seconds, value: Math.round((span.to - span.from) * 10) / 10, on: { change: (e) => setLength(Number(e.target.value) || 0) } }))),
      h("div.jm-row", {},
        h("button.key", { type: "button", disabled: typeof b.track.drop !== "number", on: { click: () => setStart(b.track.drop) } }, jicon("flag"), "Start at the drop"),
        h("button.key", { type: "button", disabled: typeof b.track.loud !== "number", on: { click: () => setStart(b.track.loud) } }, jicon("scissors"), "Trim to the chorus")),
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
    const makeKey = h("button.key.is-primary", { type: "button", title: "ACE-Step 1.5 makes the track on Comfy: it costs credits, so it waits for this key", on: { click: () => { const m = { ...f }; making_ = null; openWindow(null); makeTrack({ prompt: m.prompt, lyrics: m.lyrics, seconds: m.seconds, bpm: m.bpm }); } } }, icon("music"), busy ? "Making the track" : "Make the track", cost);
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
        h("div.jm-trend-cards", { dataset: { scrollKey: "jm-trends" } }, ...trendCards())),
    ];
  },
});

registerWindow("hear", {
  title: "HEAR THE WORDS",
  build() {
    const b = jam.jam?.body;
    const cost = costOfWords(b?.part?.seconds ?? 30);
    return [
      h("p.jm-note", {}, "Comfy separates the voice from the music, writes down what is sung and when. The words then sit on the song as lines, each word timed, ready to be captions. The stems come with it. It costs credits, so it only starts when you press the key."),
      h("div.jm-row", {}, h("button.jm-keybig", { type: "button", disabled: !b?.part || jam.busy.has("listen"), on: { click: () => (listen(), openWindow(null)) } }, jicon("wave"), h("span.jm-keybig-text", {}, h("b", {}, b?.vocals ? "Hear them again" : "Hear the words"), cost !== null ? h("em", {}, cr(cost)) : h("em", {}, "your GPU")))),
      b?.vocals ? h("p.jm-note", {}, `Heard: ${(b.lines ?? []).length} lines. Typed words and times can be changed in The words.`) : h("p.jm-note", {}, "You can also type the words yourself in The words: no credits."),
    ];
  },
});
