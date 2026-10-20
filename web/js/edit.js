// The edit's body as pure functions, so they run the same in the editor and in the tests: the body
// kept when it is opened again (what it holds, the fixed tracks in their places), the cuts moved
// onto the beat, and a first edit drawn from the beat. Nothing here touches the page or the server.

import { beatTimes, newFx, FX_DEFAULTS } from "./fx.js";
import { nearestBeat } from "./beats.js";
import { splitWords, wordsOf, ANIMATED } from "./lyrics.js";

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const ms = (v) => Math.round(v * 1000) / 1000;
let counter = 0;
export const uid = () => `${Math.random().toString(36).slice(2, 8)}${(counter++).toString(36)}`;

/** The tracks every edit has, top to bottom. */
export const TRACKS = () => [
  { id: "t1", kind: "title", name: "Titles", items: [] },
  { id: "fx", kind: "fx", name: "Beat FX", items: [] },
  { id: "v2", kind: "video", name: "Overlays", items: [] },
  { id: "v1", kind: "video", name: "Video", main: true, items: [] },
  { id: "a1", kind: "audio", role: "voice", name: "Voice", items: [] },
  { id: "a2", kind: "audio", role: "music", name: "Music", items: [] },
  { id: "a3", kind: "audio", role: "effects", name: "Effects", items: [] },
];

/**
 * An edit's body kept whole: everything it holds (its product, its beats, whatever a later version
 * adds) stays, and every track it has is put in its place among the fixed ones: by its id, else
 * what it is (the main video, the sound by its role, the titles). A track of no fixed place is kept
 * after them. A body another product wrote (Jam's video, music and captions) comes out as an edit.
 */
export function normalizeBody(b = {}) {
  const given = (Array.isArray(b?.tracks) ? b.tracks : []).filter((t) => t && typeof t === "object");
  const taken = new Set();
  const claim = (match) => {
    const t = given.find((x) => !taken.has(x) && match(x));
    if (t) taken.add(t);
    return t;
  };
  const tracks = TRACKS().map((fixed) => {
    const found =
      claim((x) => x.id === fixed.id) ??
      (fixed.main ? claim((x) => x.kind === "video" && x.main) : fixed.role ? claim((x) => x.kind === "audio" && x.role === fixed.role) : fixed.id === "v2" ? claim((x) => x.kind === "video" && !x.main) : claim((x) => x.kind === fixed.kind));
    return { ...fixed, ...(found ?? {}), id: fixed.id, kind: fixed.kind, ...(fixed.main ? { main: true } : {}), ...(fixed.role ? { role: fixed.role } : {}), name: found?.name ?? fixed.name, items: (found?.items ?? []).map((it) => ({ ...it, id: it.id ?? uid() })) };
  });
  const rest = given.filter((x) => !taken.has(x)).map((x) => ({ ...x, id: x.id ?? uid(), items: (x.items ?? []).map((it) => ({ ...it, id: it.id ?? uid() })) }));
  return { ...b, aspect: b?.aspect ?? "16:9", duck: b?.duck !== false, tracks: [...tracks, ...rest], markers: b?.markers ?? [] };
}

// ---------------------------------------------------------------- beats

/** An edit's beats kept in order and in range (the editor keeps them sorted, and the effects count on it). */
export function normalizeBeats(b) {
  if (!b || typeof b !== "object") return null;
  const times = (Array.isArray(b.times) ? b.times : []).map(Number).filter((t) => Number.isFinite(t)).map(ms).sort((x, y) => x - y);
  return { bpm: clamp(Number(b.bpm) || 120, 30, 300), offset: ms(clamp(Number(b.offset) || 0, -30, 30)), times, down: clamp(Math.round(Number(b.down) || 0), 0, 7), source: String(b.source ?? "import").slice(0, 20), ...(Number.isFinite(Number(b.sure)) && b.sure !== null ? { sure: Math.round(clamp(Number(b.sure), 0, 1) * 100) / 100 } : {}) };
}

/** The beats with the offset taken into the times, so a time on the clock is the time of a beat. */
export const heard = (body) => beatTimes(body);

/** The beats that start a bar: every fourth, from the one the first bar line is on. */
export function barTimes(body) {
  const t = beatTimes(body);
  const down = Math.round(Number(body?.beats?.down) || 0);
  return t.filter((_, k) => (((k - down) % 4) + 4) % 4 === 0);
}

// ---------------------------------------------------------------- cuts onto the beat

/**
 * The cuts between the main track's clips moved onto the nearest beat (or bar): a clip made
 * longer or shorter by trimming its end, or by slowing it when it has no more to show; the last
 * clip takes what is left, so the film runs as long as it did. Nothing is rolled again or lost.
 * `info(item)` says what a clip is: { still, duration }. Answers how many cuts moved.
 */
export function snapCuts(body, info, { to = "beat", least = 0.5 } = {}) {
  const main = body.tracks.find((t) => t.main);
  const items = main?.items ?? [];
  const marks = to === "bar" ? barTimes(body) : beatTimes(body);
  if (items.length < 2 || !marks.length) return 0;
  const lengthOf = (it) => {
    const s = info(it);
    if (s.still) return Number(it.length) || 4;
    const from = clamp(Number(it.from) || 0, 0, Math.max(0, s.duration - 0.2));
    return (clamp(it.to ?? s.duration, from + 0.2, s.duration) - from) / clamp(Number(it.speed) || 1, 0.25, 4);
  };
  // a clip made `len` seconds long
  const setLength = (it, len) => {
    const s = info(it);
    if (s.still) {
      it.length = ms(len);
      return;
    }
    const from = clamp(Number(it.from) || 0, 0, Math.max(0, s.duration - 0.2));
    const speed = clamp(Number(it.speed) || 1, 0.25, 4);
    const wanted = from + len * speed;
    if (wanted <= s.duration + 1e-6) it.to = wanted >= s.duration - 0.05 ? null : ms(wanted);
    else {
      // nothing more of it to show: it plays slower
      it.to = null;
      it.speed = ms(clamp((s.duration - from) / len, 0.25, 4));
    }
  };
  // where each cut falls now (the middle of a dissolve), and the dissolve into each clip
  const dis = [0];
  const cuts = [];
  let at = 0;
  items.forEach((it, i) => {
    const len = lengthOf(it);
    const next = items[i + 1];
    const d = next?.join === "dissolve" ? Math.min(1, lengthOf(next) / 2, (at + len) / 2) : 0;
    dis.push(d);
    if (next) cuts.push(at + len - d / 2);
    at += len - d;
  });
  const total = at;
  // each cut on the beat nearest it, as long as the clips between stay long enough to be seen
  const target = [];
  let last = 0;
  let moved = 0;
  cuts.forEach((c, i) => {
    const t = marks[nearestBeat(marks, c)];
    const ok = t - last >= least && (cuts[i + 1] ?? total) - t >= least;
    target.push(ok ? t : c);
    if (ok && Math.abs(t - c) > 0.004) moved++;
    last = target[i];
  });
  if (!moved) return 0;
  items.forEach((it, i) => {
    const from = i === 0 ? 0 : target[i - 1] - dis[i] / 2;
    const to = i === items.length - 1 ? total : target[i] + dis[i + 1] / 2;
    if (Math.abs(to - from - lengthOf(it)) > 0.004) setLength(it, to - from);
  });
  return moved;
}

// ---------------------------------------------------------------- lyrics

/** The lines of lyrics on an edit's title tracks: the items made for the words sung, in time order. */
export function lyricItems(body) {
  return body.tracks
    .filter((t) => t.kind === "title")
    .flatMap((t) => t.items.filter((it) => it.lyric))
    .sort((a, b) => (Number(a.start) || 0) - (Number(b.start) || 0));
}

/** A line's text as its words say it (a word edited by hand is in it), one space between. */
export const textOf = (item) => wordsOf(item).map((w) => w.text).join(" ");

/** A lyric line's words, split afresh over its length from what they say now (so a word edited by hand stays as it was written). */
export function resplit(item, by = "syllables") {
  item.text = textOf(item);
  item.words = splitWords(item.text, Number(item.length) || 3, by);
  return item;
}

/**
 * One word of a line changed (its text, its start, its end): kept in range, and the line's text made to say it, so the
 * line is what its words are. Answers whether there was such a word.
 */
export function editWord(item, i, patch) {
  if (!item.words?.length) item.words = wordsOf(item).map((w) => ({ ...w }));
  const w = item.words[i];
  if (!w) return false;
  const len = Number(item.length) || 3;
  const was = w.text;
  Object.assign(w, patch);
  if (patch.text !== undefined) w.text = String(patch.text).trim() || was;
  w.from = ms(clamp(Number(w.from) || 0, 0, len));
  w.to = ms(clamp(Number(w.to) || 0, w.from + 0.02, len + 2));
  if (patch.text !== undefined) item.text = item.words.map((x) => x.text).join(" ");
  return true;
}

/** A lyric line moved in time, its words with it (they are timed from its start, so only the start moves). */
export function shiftLine(item, dt) {
  item.start = ms(Math.max(0, (Number(item.start) || 0) + dt));
  return item;
}

/** A line's text changed: its words are timed again over it, keeping the times of words that stay as they are when the count holds. */
export function retext(item, text) {
  const before = wordsOf(item);
  item.text = text;
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (item.words?.length === words.length && before.length === words.length) item.words = before.map((w, i) => ({ ...w, text: words[i] }));
  else delete item.words;
  return item;
}

// ---------------------------------------------------------------- a first edit

/**
 * A first edit from the beat, no words needed: the effects it draws are marked `auto`, so drawing
 * it again takes the old ones away and leaves yours. A zoom pulse on every bar, a flash every four
 * bars (not the first), and the lyrics as karaoke. Answers what it did, for the bar to say.
 */
export function draft(body, length) {
  const did = [];
  const t = body.tracks.find((x) => x.kind === "fx");
  if (!t) return did;
  t.items = t.items.filter((it) => !it.auto);
  const beats = beatTimes(body);
  if (beats.length && length > 1) {
    t.items.push(newFx("zoom", 0, length, { every: 4, intensity: 0.55, dur: 0.24, auto: true }));
    did.push("A zoom pulse on every bar");
    if (length > 12) {
      t.items.push(newFx("flash", Math.min(length - 1, (barTimes(body)[1] ?? 0) + 0.05), length, { every: 16, intensity: 0.5, dur: FX_DEFAULTS.flash.dur, auto: true }));
      did.push("A flash every four bars");
    }
  }
  const lines = lyricItems(body).filter((it) => it.style !== "none");
  for (const it of lines) {
    if (!ANIMATED.has(it.style)) it.style = "karaoke";
    if (!it.words?.length) resplit(it);
  }
  if (lines.length) did.push("Lyrics as karaoke");
  return did;
}
