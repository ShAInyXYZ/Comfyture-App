// Cut: the editing room. An edit is a timeline of tracks: titles, overlays, the main video track
// (its clips end to end, each cut or dissolved into the one before), and the sound tracks (voices,
// music, effects, each sound at its own time). Edits are kept on the server, one per tab, with
// undo; a film is rendered on the server from the timeline into the Library.

import { api } from "./api.js";
import { state, changed, toast, rollAsTab, writer } from "./store.js";
import { normalizeBody, snapCuts, lyricItems, resplit, shiftLine, retext, editWord, draft, uid } from "./edit.js";
import { keyedSaver } from "./saving.js";
import { beatTimes, newFx, FX_DEFAULTS, FX_KINDS } from "./fx.js";
import { detectBeats, parseBeats, gridBeats, beatsFromTimes, halveBeats, doubleBeats, nearestBeat } from "./beats.js";
import { splitWords, wordsOf, ANIMATED } from "./lyrics.js";

/** What a product that borrows the editor's assistant adds: Jam says what it holds (`context`, null on any other page), carries out its own actions (`apply`) and exports the video its own way (`export`). */
export const hooks = { context: null, apply: null, export: null };
/** Jam's own actions (Pickle's: the part, the words, the captions, the band), done by Jam, and only when it is Jam's page that asked. */
const jamActions = (actions) => (hooks.apply && hooks.context?.() ? hooks.apply(actions ?? []) : []);

const TABS = "comfyture.cut.tabs";
const LAST = "comfyture.cut.last";
export const FPS = 24;

export const cut = { list: [], tabs: [], project: null, selected: null, beat: null, playhead: 0, zoom: 48, tool: "select", snap: true, busy: new Set(), history: [], future: [], audio: null, ready: null, error: null, quiet: null, chat: { messages: [], busy: null } };

/** The moves a clip can make over its length: a push in, a pull out, a pan. */
export const MOTIONS = [
  ["none", "No move", null],
  ["push", "Push in", { from: { scale: 1, x: 0, y: 0 }, to: { scale: 1.15, x: 0, y: 0 } }],
  ["pull", "Pull out", { from: { scale: 1.15, x: 0, y: 0 }, to: { scale: 1, x: 0, y: 0 } }],
  ["left", "Pan left", { from: { scale: 1.12, x: 0.8, y: 0 }, to: { scale: 1.12, x: -0.8, y: 0 } }],
  ["right", "Pan right", { from: { scale: 1.12, x: -0.8, y: 0 }, to: { scale: 1.12, x: 0.8, y: 0 } }],
  ["up", "Tilt up", { from: { scale: 1.12, x: 0, y: 0.8 }, to: { scale: 1.12, x: 0, y: -0.8 } }],
];
/** The colour looks, as the preview draws them (the render's own filters are in the planner). */
export const GRADES = [["natural", "Natural", ""], ["warm", "Warm", "sepia(.18) saturate(1.1)"], ["cool", "Cool", "hue-rotate(-10deg) saturate(.95) brightness(1.02)"], ["film", "Film", "contrast(1.1) saturate(.9)"], ["mono", "Mono", "grayscale(1) contrast(1.08)"]];
const body = () => cut.project?.body;
const read = (k) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k, v) => {
  try {
    localStorage.setItem(k, v);
  } catch {}
};
const call = async (path, init) => {
  const res = await fetch(path, init);
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error ?? `Request failed (${res.status})`);
  return out;
};
const send = (path, method, data) => call(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
const update = (...more) => changed("cut", ...more);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round = (v) => Math.round(v * 100) / 100;

const normalize = normalizeBody;
export const track = (id, b = body()) => b?.tracks.find((t) => t.id === id);
export const mainTrack = (b = body()) => b?.tracks.find((t) => t.main);
export function findItem(id, b = body()) {
  for (const t of b?.tracks ?? []) {
    const it = t.items.find((x) => x.id === id);
    if (it) return { track: t, item: it };
  }
  return null;
}

// ---------------------------------------------------------------- what a source is

/** Where an item's picture or sound plays from, and how long its source runs. */
export function sourceOf(src) {
  if (!src) return null;
  if (src.kind === "take") {
    const run = state.runs.find((r) => r.id === src.id);
    return run ? { url: run.video, duration: run.length ?? run.request?.seconds ?? 5, name: run.request?.name, width: run.size?.width, height: run.size?.height, status: run.status } : { url: null, duration: src.duration ?? 5, name: src.name ?? "Missing take", status: "missing" };
  }
  if (src.kind === "film") {
    const f = state.films.find((x) => x.id === src.id);
    return { url: f?.url ?? `/media/reels/${src.id}.mp4`, duration: f?.seconds ?? src.duration ?? 5, name: f?.name ?? src.name };
  }
  if (src.kind === "video") return { url: `/media/videos/${src.id}`, duration: src.duration ?? 5, name: src.name };
  if (src.kind === "photo") return { url: src.url ?? `/media/photos/${src.id}`, duration: 3600, name: src.name, still: true, width: src.width, height: src.height };
  // (a sound named without its length, as Jam's and Mixer's are, runs as long as the library says it does)
  if (src.kind === "audio") return { url: src.url ?? `/media/audio/${src.id}`, duration: src.duration ?? cut.audio?.find((a) => a.file === src.id)?.seconds ?? 5, name: src.name };
  // a sticker of ours (a picture with its own shape), and a plain colour standing in for a picture not made yet
  if (src.kind === "sticker") return { url: `brand/jam/stickers/${src.id}.png`, duration: 3600, name: src.name ?? STICKERS.list.find((x) => x.id === src.id)?.name ?? "Sticker", still: true };
  if (src.kind === "color") return { url: null, color: `#${String(src.id).replace("#", "")}`, duration: 3600, name: src.name ?? "Colour", still: true };
  return null;
}
/** A picture placed on the frame (a sticker): its own middle, width and turn, not laid over all of it. */
export const isPlaced = (it) => !!it?.src && (it.src.kind === "sticker" || it.w !== undefined || it.x !== undefined);

/** An item's length on the timeline, in seconds. */
export function lengthOf(it) {
  if (!it) return 0;
  if (!it.src) return clamp(Number(it.length) || 3, 0.5, 60);
  const s = sourceOf(it.src);
  if (s?.still) return clamp(Number(it.length) || 4, 0.5, 60);
  const dur = s?.duration ?? 5;
  const from = clamp(Number(it.from) || 0, 0, Math.max(0, dur - 0.2));
  const to = clamp(it.to ?? dur, from + 0.2, dur);
  return (to - from) / clamp(Number(it.speed) || 1, 0.25, 4);
}

/** The main track laid out: each clip's start, length and its dissolve into the one before. */
export function layout(b = body()) {
  const out = [];
  let at = 0;
  for (const [i, it] of (mainTrack(b)?.items ?? []).entries()) {
    const len = lengthOf(it);
    let start = at;
    let d = 0;
    if (i && it.join === "dissolve") {
      d = Math.min(1, len / 2, at / 2);
      start = at - d;
    }
    out.push({ item: it, start, len, dissolve: d, end: start + len });
    at = start + len;
  }
  return out;
}

/** Where an item starts on the timeline. */
export function startOf(it, b = body()) {
  const m = layout(b).find((x) => x.item === it);
  return m ? m.start : Number(it.start) || 0;
}

/** How long the film runs: the main track's length (what plays past it is cut at render). */
export function totalLength(b = body()) {
  const l = layout(b);
  const main = l.length ? l.at(-1).end : 0;
  // the effects play over the film, they do not lengthen it
  const others = (b?.tracks ?? []).filter((t) => !t.main && t.kind !== "fx").flatMap((t) => t.items.map((it) => (Number(it.start) || 0) + lengthOf(it)));
  return Math.max(main, ...others, 0);
}
export const filmLength = (b = body()) => (layout(b).at(-1)?.end ?? 0);

// ---------------------------------------------------------------- projects

/** What keeps an edit on the server: one save a moment after its last change, for each edit, so an edit left for another is still kept. */
const keep = async (id, p) => {
  const first = mainTrack(p.body)?.items[0];
  const s = first ? sourceOf(first.src) : null;
  const thumb = first?.src?.kind === "photo" ? s?.url : first?.src?.kind === "take" ? state.runs.find((r) => r.id === first.src.id)?.request?.start && `/media/photos/${state.runs.find((r) => r.id === first.src.id).request.start}` : undefined;
  await send(`api/cuts/${p.id}`, "PUT", { name: p.name, body: p.body, ...(thumb ? { thumb } : {}) }).catch((e) => toast(e.message, { tone: "crit" }));
  const known = cut.list.find((x) => x.id === p.id);
  if (known) Object.assign(known, { name: p.name, ...(thumb ? { thumb } : {}) });
};
const saver = keyedSaver(800, keep);
/** Every edit changed and not yet kept is kept now (before another is opened, the page left). */
export const flushCuts = () => saver.flush();
/** An edit that is gone is not kept again by a save still to come. */
const forgetCut = (id) => saver.drop(id);
/** A change: noted for undo, drawn, and kept a moment later. */
export function commit({ history = true } = {}) {
  const b = body();
  if (!b) return;
  extendBeats(b);
  if (history) {
    cut.history.push(cut.last);
    if (cut.history.length > 80) cut.history.shift();
    cut.future = [];
  }
  cut.last = JSON.stringify(b);
  touch();
}
export function touch({ now = false } = {}) {
  update();
  if (!cut.project) return;
  saver.save(cut.project.id, cut.project);
  if (now) return saver.flush(cut.project.id);
}
export function undo() {
  const prev = cut.history.pop();
  if (prev === undefined || !cut.project) return;
  cut.future.push(JSON.stringify(cut.project.body));
  cut.project.body = normalize(JSON.parse(prev));
  cut.last = prev;
  if (cut.selected && !findItem(cut.selected)) cut.selected = null;
  touch();
}
export function redo() {
  const next = cut.future.pop();
  if (next === undefined || !cut.project) return;
  cut.history.push(JSON.stringify(cut.project.body));
  cut.project.body = normalize(JSON.parse(next));
  cut.last = next;
  touch();
}

export async function loadCuts() {
  cut.ready ??= (async () => {
    try {
      const { cuts } = await call("api/cuts");
      cut.list = cuts;
      let kept = [];
      try {
        kept = JSON.parse(read(TABS) ?? "[]");
      } catch {}
      cut.tabs = (Array.isArray(kept) ? kept : []).filter((id) => cuts.some((c) => c.id === id));
      if (!cut.tabs.length) cut.tabs = cuts.slice(0, 6).map((c) => c.id);
      const last = read(LAST);
      const id = cut.tabs.includes(last) ? last : cut.tabs[0];
      if (id) await openCut(id);
      // the clips of the old Edit page become the first cut
      else await newCut(state.edit.name || "First cut", state.edit.clips.map((c) => ({ src: { kind: "take", id: c.run }, from: c.from ?? 0, to: c.to ?? null, join: state.edit.fade ? "dissolve" : "cut" })));
      loadAudio();
    } catch (e) {
      cut.error = e.message;
      update();
    }
  })();
  return cut.ready;
}

/**
 * Opens an edit. `quiet` is for a product that keeps its edit to itself (Jam's): it is opened to be
 * worked on in place, without a tab of its own in Kitchen's Cut, and Kitchen's Cut puts its own back.
 */
export async function openCut(id, { quiet = false } = {}) {
  await flushCuts();
  const { project } = await call(`api/cuts/${id}`);
  project.body = normalize(project.body);
  await knowSounds(project.body);
  cut.project = project;
  cut.selected = null;
  cut.beat = null;
  cut.playhead = 0;
  cut.history = [];
  cut.future = [];
  cut.last = JSON.stringify(project.body);
  cut.quiet = quiet ? id : null;
  if (!quiet) {
    if (!cut.tabs.includes(id)) cut.tabs.push(id);
    write(TABS, JSON.stringify(cut.tabs));
    write(LAST, id);
  }
  update();
}

/**
 * Sounds an edit names without saying how long they run (Jam's and Mixer's name a file) are given their length from
 * the library, so the preview plays and the beat finder hears all of them, not the first five seconds.
 */
async function knowSounds(b) {
  const missing = b.tracks.flatMap((t) => t.items).filter((it) => it.src?.kind === "audio" && !(Number(it.src.duration) > 0));
  if (!missing.length) return;
  const list = cut.audio?.length ? cut.audio : await call("api/audio").catch(() => []);
  for (const it of missing) {
    const a = list.find((x) => x.file === it.src.id);
    if (a?.seconds > 0) it.src.duration = a.seconds;
  }
}

/** Kitchen's Cut after an edit held for another product: its own last edit open again. */
export async function reclaim() {
  if (!cut.quiet) return;
  // what the other product's edit has not yet had kept is kept before it is put away
  await flushCuts();
  cut.quiet = null;
  const last = read(LAST);
  const id = cut.tabs.includes(last) ? last : cut.tabs[0] ?? cut.list[0]?.id;
  cut.project = null;
  if (id) await openCut(id);
  else await newCut();
}

/** A new edit, with clips to start from (each { src, from, to, join }). */
export async function newCut(name = "Untitled cut", clips = [], extra = {}) {
  const b = normalize();
  mainTrack(b).items = clips.map((c) => ({ id: uid(), from: 0, to: null, speed: 1, volume: 1, sound: true, ...c }));
  // extra.project: the film it is made for, so the edit shows inside it (the open project's, else)
  const film = extra.project ?? state.project ?? undefined;
  const { project } = await send("api/cuts", "POST", { name, body: b, ...extra, project: film });
  cut.list.unshift({ id: project.id, name: project.name, updatedAt: project.updatedAt, project: film });
  await openCut(project.id);
}
export async function duplicateCut() {
  const p = cut.project;
  if (!p) return;
  const { project } = await send("api/cuts", "POST", { name: `${p.name} copy`.slice(0, 60), body: structuredClone(p.body) });
  cut.list.unshift({ id: project.id, name: project.name, updatedAt: project.updatedAt });
  await openCut(project.id);
}
export function closeCut(id) {
  cut.tabs = cut.tabs.filter((x) => x !== id);
  write(TABS, JSON.stringify(cut.tabs));
  if (cut.project?.id === id) return cut.tabs[0] ? openCut(cut.tabs[0]) : newCut();
  update();
}
export async function deleteCut(id = cut.project?.id) {
  if (!id) return;
  forgetCut(id);
  const { cuts } = await call(`api/cuts/${id}`, { method: "DELETE" });
  cut.list = cuts;
  return closeCut(id);
}
export function renameCut(name) {
  if (!cut.project || !name.trim()) return;
  cut.project.name = name.trim().slice(0, 60);
  touch();
}

/** Takes in order into a new cut: Story's "Send to Cut", or the Shot tabs' takes. */
export async function cutFromTakes(name, runIds) {
  await (cut.ready ?? loadCuts());
  await newCut(name, runIds.map((id) => ({ src: { kind: "take", id } })));
}

/** Takes onto the end of the open edit's Video track (a new edit when none is open). */
export async function addTakesToCut(ids) {
  await (cut.ready ?? loadCuts());
  if (!cut.project) return cutFromTakes("Untitled cut", ids);
  for (const id of ids) mainTrack().items.push({ id: uid(), src: { kind: "take", id }, from: 0, to: null, speed: 1, volume: 1, sound: true });
  commit();
  toast(`${ids.length} take${ids.length > 1 ? "s" : ""} added to ${cut.project.name}.`);
}

/** A film from the Library edited again: the edit it was rendered from, or its clips in a new one. */
export async function editFilm(film) {
  await (cut.ready ?? loadCuts());
  if (film.cut && cut.list.some((c) => c.id === film.cut)) return openCut(film.cut);
  const clips = (film.clips ?? film.takes?.map((id) => ({ id })) ?? []).filter((c) => state.runs.some((r) => r.id === c.id));
  await newCut(film.name, clips.map((c) => ({ src: { kind: "take", id: c.id }, from: c.from ?? 0, to: c.to ?? null, join: film.transition === "fade" ? "dissolve" : "cut" })));
}

// ---------------------------------------------------------------- the media bin

export async function loadAudio() {
  try {
    cut.audio = await call("api/audio");
  } catch {
    cut.audio = [];
  }
  update();
}

/** Something from the bin onto the timeline: a clip at the end of the main track, a sound or a title where the playhead is. */
export function addMedia(media, { trackId, at, index } = {}) {
  const b = body();
  if (!b) return;
  const kind = media.kind;
  const to = trackId ? track(trackId) : kind === "audio" ? track(media.role === "voice" ? "a1" : media.role === "music" ? "a2" : "a3") : mainTrack();
  if (!to) return;
  const it = { id: uid(), src: media.src, from: 0, to: null, speed: 1, volume: 1, sound: true, name: media.name };
  if (media.src.kind === "photo") it.length = 4;
  if (to.kind === "audio" && kind !== "audio") return toast("Sound tracks take sounds: drop a clip on a video track.");
  if (to.kind === "video" && kind === "audio") return toast("Video tracks take clips and pictures: drop a sound on a sound track.");
  if (to.main) {
    const i = index ?? to.items.length;
    to.items.splice(clamp(i, 0, to.items.length), 0, it);
  } else {
    it.start = round(Math.max(0, at ?? cut.playhead));
    to.items.push(it);
    to.items.sort((x, y) => (x.start ?? 0) - (y.start ?? 0));
  }
  cut.selected = it.id;
  commit();
  return it;
}

export function addTitle(text = "Title", at = cut.playhead) {
  const t = track("t1");
  if (!t) return;
  const it = { id: uid(), text, start: round(at), length: 3, style: "center" };
  t.items.push(it);
  cut.selected = it.id;
  commit();
}

// ---------------------------------------------------------------- editing

/** Changes an item; history once per gesture (pass history: false while dragging). */
export function setItem(id, patch, { history = true } = {}) {
  const f = findItem(id);
  if (!f) return;
  Object.assign(f.item, patch);
  settle(history);
}
export function removeItem(id = cut.selected) {
  const f = findItem(id);
  if (!f) return;
  f.track.items = f.track.items.filter((x) => x !== f.item);
  if (cut.selected === id) cut.selected = null;
  commit();
}
export function select(id) {
  cut.selected = id;
  update();
}
export function setPlayhead(t) {
  cut.playhead = clamp(t, 0, Math.max(0, totalLength()));
  update();
}

/** Cuts the item under the time in two (on the main track, the clip under it). */
export function splitAt(t = cut.playhead, id = cut.selected) {
  const b = body();
  let f = id && findItem(id);
  if (!f || !(t > startOf(f.item) && t < startOf(f.item) + lengthOf(f.item))) {
    const m = layout(b).find((x) => t > x.start && t < x.end);
    f = m ? { track: mainTrack(b), item: m.item } : null;
  }
  if (!f) return toast("Put the playhead over a clip to cut it.");
  const it = f.item;
  const start = startOf(it);
  const offset = t - start;
  if (offset < 0.2 || lengthOf(it) - offset < 0.2) return;
  const second = { ...structuredClone(it), id: uid(), join: "cut" };
  if (it.src && !sourceOf(it.src)?.still) {
    const speed = Number(it.speed) || 1;
    const cutAt = (Number(it.from) || 0) + offset * speed;
    second.from = round(cutAt);
    it.to = round(cutAt);
  } else {
    second.length = round(lengthOf(it) - offset);
    it.length = round(offset);
  }
  if (!f.track.main) second.start = round(start + offset);
  // the motion carries on across the cut: the first half ends where the second begins
  if (it.motion) {
    const p = offset / lengthOf({ ...it, to: it.to });
    const mid = { scale: lerp(it.motion.from.scale, it.motion.to.scale, p), x: lerp(it.motion.from.x, it.motion.to.x, p), y: lerp(it.motion.from.y, it.motion.to.y, p) };
    second.motion = { from: mid, to: it.motion.to };
    it.motion = { from: it.motion.from, to: mid };
  }
  f.track.items.splice(f.track.items.indexOf(it) + 1, 0, second);
  cut.selected = second.id;
  commit();
}
const lerp = (a, b, p) => round(a + (b - a) * p);

/** Moves a clip on the main track to another place in the order. */
export function moveMain(id, to) {
  const t = mainTrack();
  const from = t.items.findIndex((x) => x.id === id);
  if (from < 0) return;
  const [it] = t.items.splice(from, 1);
  t.items.splice(clamp(to > from ? to - 1 : to, 0, t.items.length), 0, it);
  commit();
}

/** Moves an item to another track (sounds between sound tracks, pictures between video tracks). */
export function moveToTrack(id, trackId, at) {
  const f = findItem(id);
  const to = track(trackId);
  if (!f || !to || f.track === to || (to.kind === "audio") !== (f.track.kind === "audio") || (to.kind === "title") !== (f.track.kind === "title")) return;
  f.track.items = f.track.items.filter((x) => x !== f.item);
  if (to.main) to.items.push(f.item);
  else {
    f.item.start = round(Math.max(0, at));
    to.items.push(f.item);
  }
  commit();
}

export const toggleTrack = (id, key) => {
  const t = track(id);
  if (!t) return;
  t[key] = !t[key];
  commit();
};

/** The join into a main-track clip: a cut, a one-second dissolve, or a whip-tilt up into it. */
export function setJoin(id, join) {
  setItem(id, { join });
}

// ---------------------------------------------------------------- the beat

/** The stickers Jam ships (brand/jam/stickers/stickers.json): { id, name, tags }. */
export const STICKERS = { list: [], ready: null };
export function loadStickers() {
  return (STICKERS.ready ??= fetch("brand/jam/stickers/stickers.json")
    .then((r) => r.json())
    .then((j) => {
      STICKERS.list = Array.isArray(j.stickers) ? j.stickers : [];
      update();
    })
    .catch(() => {}));
}

const infoOf = (it) => {
  const s = sourceOf(it.src);
  return { still: !!s?.still, duration: s?.duration ?? 5 };
};

/** A steady grid carries on as long as the film does, so effects keep firing to its end. */
function extendBeats(b) {
  const t = b.beats?.times;
  // a list typed or pasted is what was asked for: it is not carried on
  if (!t || t.length < 4 || b.beats.source === "import") return;
  const gaps = t.slice(1).map((x, i) => x - t[i]).sort((x, y) => x - y);
  const step = gaps[Math.floor(gaps.length / 2)];
  // only a grid kept steady: every gap within a few percent of the middle one
  if (!(step > 0.15) || gaps[0] < step * 0.96 || gaps.at(-1) > step * 1.04) return;
  const end = Math.max(filmLength(b), totalLength(b)) + 1;
  let last = t.at(-1);
  while (last + (b.beats.offset ?? 0) < end && t.length < 4000) t.push(Math.round((last += step) * 1000) / 1000);
}

/** The sound the beats are heard in: the music selected, else the first on the Music track, else any sound. */
function musicItem(b = body()) {
  const sel = cut.selected && findItem(cut.selected, b);
  if (sel?.track.kind === "audio") return sel.item;
  const audio = b.tracks.filter((t) => t.kind === "audio");
  const sounds = [...audio.filter((t) => t.role === "music"), ...audio.filter((t) => t.role !== "music")].flatMap((t) => t.items);
  return sounds.find((it) => sourceOf(it.src)?.url) ?? null;
}

/**
 * The beats heard in the edit's music (nothing is changed): { bpm, offset, times, down, source }.
 * A tempo already on the edit (heard by Comfy, or typed in) steers the listening: the tempo is kept, the beats found in the sound.
 */
export async function findBeats(hint = 0) {
  const it = musicItem();
  const s = it && sourceOf(it.src);
  if (!s?.url) throw new Error("Put music on the Music track first: the beats are heard in it.");
  const found = await detectBeats(s.url, { from: Number(it.from) || 0, length: lengthOf(it), at: Number(it.start) || 0, hint: hint || (["comfy", "grid", "ai"].includes(body().beats?.source) ? body().beats.bpm : 0) });
  if (found.times.length < 4) throw new Error("No beat was heard in that music.");
  return { bpm: found.bpm, offset: 0, times: found.times, down: found.down, source: "web", sure: found.confidence };
}

/** A change that is done (an undo step), or one still going (typing, a slider: drawn and kept, its undo step to come at the end). */
const settle = (done) => (done ? commit() : touch());

/** The beats kept on the edit, in order and in range; one undo step. */
export function setBeats(beats) {
  const b = body();
  if (!b) return;
  b.beats = beats ? normalizeBeatsOf(beats) : undefined;
  if (!beats) delete b.beats;
  cut.beat = null;
  commit();
}
function normalizeBeatsOf(x) {
  const times = [...new Set((x.times ?? []).map(Number).filter(Number.isFinite).map((t) => Math.round(t * 1000) / 1000))].sort((a, z) => a - z);
  return { bpm: clamp(Number(x.bpm) || 120, 30, 300), offset: round3(clamp(Number(x.offset) || 0, -30, 30)), times, down: clamp(Math.round(Number(x.down) || 0), 0, 7), source: String(x.source ?? "import").slice(0, 20), ...(x.sure !== undefined && x.sure !== null && Number.isFinite(Number(x.sure)) ? { sure: Math.round(clamp(Number(x.sure), 0, 1) * 100) / 100 } : {}) };
}
const round3 = (v) => Math.round(v * 1000) / 1000;

/** Listens to the music and sets the beats. */
export async function detectBeatsNow(hint = 0) {
  if (!body() || cut.busy.has("beats")) return;
  const p = cut.project;
  cut.busy.add("beats");
  update();
  try {
    const found = await findBeats(hint);
    // heard for the edit that was open when it was asked: another opened since is not given them
    if (cut.project !== p) return;
    setBeats(found);
    toast(`${Math.round(found.bpm * 10) / 10} BPM, ${found.times.length} beats found.${found.sure < 0.25 ? " The beat is not clear in this music: look along the ruler, and nudge or retype the tempo where it is off." : ""}`);
  } catch (e) {
    toast(e.message, { tone: "crit" });
  } finally {
    cut.busy.delete("beats");
    update();
  }
}

/** Beats typed or pasted: a tempo (and where the first beat is), or a list of times. */
export function importBeats(text) {
  const got = parseBeats(text);
  if (!got) return toast("Type a tempo (128), a tempo and an offset (128 @ 0.35), or a list of times in seconds.", { tone: "crit" }), false;
  const length = Math.max(filmLength(), totalLength(), 10);
  if (got.times) {
    const beats = beatsFromTimes(got.times, "import");
    if (got.bpm) beats.bpm = got.bpm;
    setBeats(beats);
  } else setBeats(gridBeats(got.bpm, got.offset, length, "grid"));
  return true;
}

/** Every beat moved by the same time (the offset), in seconds: pass history: false while dragging a slider. */
export function setBeatOffset(v, { history = true } = {}) {
  const b = body();
  if (!b?.beats) return;
  b.beats.offset = round3(clamp(Number(v) || 0, -5, 5));
  settle(history);
}
/** One beat moved: the selected one, by a time. */
export function nudgeBeat(i, dt, { history = true } = {}) {
  const b = body();
  const times = b?.beats?.times;
  if (!times?.[i] && times?.[i] !== 0) return;
  times[i] = round3(Math.max(0, times[i] + dt));
  // a beat carried past its neighbour changes places with it
  const moved = times[i];
  times.sort((a, z) => a - z);
  cut.beat = nearestBeat(times, moved);
  settle(history);
}
export function addBeatAt(t) {
  const b = body();
  if (!b?.beats) return;
  b.beats.times.push(round3(Math.max(0, t - (b.beats.offset ?? 0))));
  b.beats.times.sort((a, z) => a - z);
  cut.beat = nearestBeat(b.beats.times, t - (b.beats.offset ?? 0));
  commit();
}
export function removeBeat(i = cut.beat) {
  const b = body();
  if (!b?.beats?.times?.[i] && b?.beats?.times?.[i] !== 0) return;
  b.beats.times.splice(i, 1);
  cut.beat = null;
  commit();
}
/** The first beat of a bar: the selected beat becomes the one the bars count from (every fourth after it). */
export function setBarLine(i = cut.beat) {
  const b = body();
  if (!b?.beats || i === null) return;
  b.beats.down = ((i % 4) + 4) % 4;
  commit();
}
/** A tempo heard at half or twice the real one, put right. */
export function tempoOctave(how) {
  const b = body();
  if (!b?.beats?.times?.length) return;
  b.beats = normalizeBeatsOf(how === "halve" ? halveBeats(b.beats) : doubleBeats(b.beats));
  commit();
}
/** The cuts between the clips moved onto the nearest beat (or bar): one undo step; answers how many moved. */
export function snapToBeats(to = "beat") {
  const b = body();
  if (!b?.beats?.times?.length) return toast("Find the beats first: Detect, or type a tempo."), 0;
  const moved = snapCuts(b, infoOf, { to });
  if (moved) commit();
  else toast(`The cuts are on the ${to} already, or there is only one clip.`);
  return moved;
}

// ---------------------------------------------------------------- beat effects

/** An effect on the Beat FX track from the playhead: its kind's own look, to the end of the film unless told. */
export function addFx(kind = "zoom", { at = cut.playhead, length } = {}) {
  const t = track("fx");
  if (!t || !FX_DEFAULTS[kind]) return null;
  const end = Math.max(filmLength(), totalLength());
  const item = newFx(kind, at, length ?? Math.max(2, end - at));
  t.items.push(item);
  cut.selected = item.id;
  commit();
  return item;
}

// ---------------------------------------------------------------- stickers

/** The next z for a sticker: above the ones there are. */
const nextZ = (t) => Math.max(0, ...t.items.filter(isPlaced).map((x) => Number(x.z) || 0)) + 1;

/** A sticker on the frame from the library (by its id), at a time, where it is put. */
export function addSticker(id, { at = cut.playhead, length = 3, x = 0.5, y = 0.35, w = 0.3, rot = 0 } = {}) {
  const t = track("v2");
  if (!t) return null;
  const item = { id: uid(), src: { kind: "sticker", id }, start: round(Math.max(0, at)), length, x, y, w, rot, z: nextZ(t) };
  t.items.push(item);
  cut.selected = item.id;
  commit();
  return item;
}
/** A picture of the user's own (a PNG with its own shape) as a sticker. */
export function addPictureSticker(photo, opts = {}) {
  const t = track("v2");
  if (!t) return null;
  const item = { id: uid(), src: { kind: "photo", id: photo.file, url: photo.url, width: photo.width, height: photo.height, name: photo.name }, start: round(Math.max(0, opts.at ?? cut.playhead)), length: 3, x: 0.5, y: 0.35, w: 0.3, rot: 0, z: nextZ(t) };
  t.items.push(item);
  cut.selected = item.id;
  commit();
  return item;
}
/** The sticker's picture changed for another of the library's. */
export function replaceSticker(itemId, id) {
  setItem(itemId, { src: { kind: "sticker", id } });
}
/** A sticker one step forward (dir 1) or back (-1) among the placed ones. */
export function stepSticker(itemId, dir) {
  const f = findItem(itemId);
  if (!f) return;
  const placed = f.track.items.filter(isPlaced).sort((a, z) => (Number(a.z) || 0) - (Number(z.z) || 0) || f.track.items.indexOf(a) - f.track.items.indexOf(z));
  placed.forEach((x, i) => (x.z = i + 1));
  const at = placed.indexOf(f.item);
  const other = placed[at + dir];
  if (!other) return;
  [f.item.z, other.z] = [other.z, f.item.z];
  commit();
}
/** A sticker by name: its id, its name, or a word from its tags. */
export function stickerNamed(name) {
  const q = String(name ?? "").toLowerCase().trim();
  const list = STICKERS.list;
  return list.find((x) => x.id === q) ?? list.find((x) => x.name.toLowerCase() === q) ?? list.find((x) => x.tags?.includes(q)) ?? list.find((x) => q && (x.id.includes(q) || q.includes(x.id) || x.name.toLowerCase().includes(q))) ?? null;
}

// ---------------------------------------------------------------- lyrics

/** The lines of lyrics, in time order. */
export const lyrics = (b = body()) => (b ? lyricItems(b) : []);

/** A line's words as items to edit: the ones kept, else the line split (kept from then on). */
export function wordsToEdit(item) {
  if (!item.words?.length) item.words = wordsOf(item).map((w) => ({ ...w }));
  return item.words;
}
/** How big the words are, for every line (or one): a share of the frame's short side (0.09 is usual). */
export function setLyricSize(size, id = null) {
  const items = id ? [findItem(id)?.item].filter(Boolean) : lyrics();
  if (!items.length) return;
  for (const it of items) it.size = Math.round(clamp(Number(size) || 0.09, 0.04, 0.2) * 1000) / 1000;
  commit();
}
/** The words' colours, for every line (or one): the colour they are written in and the one the sung word lights up in. */
export function setLyricColours({ color, hi }, id = null) {
  const items = id ? [findItem(id)?.item].filter(Boolean) : lyrics();
  const hex = (v) => (/^#[0-9a-f]{6}$/i.test(String(v ?? "")) ? String(v).toUpperCase() : undefined);
  if (!items.length || (!hex(color) && !hex(hi))) return;
  for (const it of items) {
    if (hex(color)) it.color = hex(color);
    if (hex(hi)) it.hi = hex(hi);
  }
  commit();
}
/** How the words are drawn, for every line (or one): karaoke, pop, bounce, lower, none. */
export function setLyricStyle(style, id = null) {
  const items = id ? [findItem(id)?.item].filter(Boolean) : lyrics();
  if (!items.length) return;
  for (const it of items) it.style = style;
  commit();
}
/** One word of a line changed: its text, or where it starts and ends (from the line's start). */
export function setWord(id, i, patch, { history = true } = {}) {
  const f = findItem(id);
  if (!f || !editWord(f.item, i, patch)) return;
  settle(history);
}
/** A line's words timed again over its length: by syllables, by letters, or all alike. */
export function splitLine(id, by = "syllables") {
  const f = findItem(id);
  if (!f) return;
  resplit(f.item, by);
  commit();
}
/** A line moved in time with its words (they are timed from its start). */
export function moveLine(id, dt) {
  const f = findItem(id);
  if (!f) return;
  shiftLine(f.item, dt);
  commit();
}
/** A new line of words at a time, in the style the others have. */
export function addLyric(text, { at = cut.playhead, length = 3 } = {}) {
  const t = track("t1");
  if (!t) return null;
  const style = lyrics().find((x) => ANIMATED.has(x.style))?.style ?? "karaoke";
  const item = { id: uid(), lyric: true, text, start: round(Math.max(0, at)), length, style };
  item.words = splitWords(text, length);
  t.items.push(item);
  cut.selected = item.id;
  commit();
  return item;
}
/** A line's words changed in the edit (the words list on Jam's side): the text of the nth line. */
export function setLineText(n, text, { history = true } = {}) {
  const it = lyrics()[n];
  if (!it) return;
  retext(it, text.slice(0, 160));
  settle(history);
}

// ---------------------------------------------------------------- a first edit

/**
 * A first edit by the beat, no words needed: the beats heard (when there are none), the cuts on
 * them, a zoom pulse on every bar, a flash every four, the lyrics as karaoke. One undo step; what
 * it adds is ordinary items, yours to change or take away. Drawn again, it replaces its own.
 */
export async function draftEdit() {
  const b = body();
  if (!b || cut.busy.has("draft")) return;
  const p = cut.project;
  cut.busy.add("draft");
  update();
  try {
    if (!b.beats?.times?.length) {
      try {
        const found = await findBeats();
        // (the edit it was asked for is the one it is drawn on)
        if (cut.project !== p) return;
        b.beats = normalizeBeatsOf(found);
      } catch (e) {
        toast(e.message, { tone: "crit" });
      }
    }
    const did = [];
    if (b.beats?.times?.length) {
      const moved = snapCuts(b, infoOf, { to: "beat" });
      if (moved) did.push(`${moved} cut${moved > 1 ? "s" : ""} on the beat`);
    }
    did.push(...draft(b, Math.max(filmLength(b), totalLength(b))));
    commit();
    toast(did.length ? `Draft edit: ${did.join(", ")}.` : "Nothing to draft: add music and clips first.");
    return did;
  } finally {
    cut.busy.delete("draft");
    update();
  }
}

// ---------------------------------------------------------------- rendering the film

export async function renderFilm() {
  const p = cut.project;
  if (!p || cut.busy.has("render")) return;
  if (!mainTrack()?.items.length && !totalLength()) return toast("Put clips on the Video track first.");
  const missing = mainTrack().items.filter((it) => it.src?.kind === "take" && sourceOf(it.src)?.status !== "done");
  if (missing.length) return toast(`${missing.length} clip${missing.length > 1 ? "s are" : " is"} still rendering or missing.`);
  cut.busy.add("render");
  update();
  try {
    await touch({ now: true });
    const film = await send(`api/cuts/${p.id}/render`, "POST", {});
    state.films = [film, ...state.films.filter((f) => f.id !== film.id)];
    changed("library", "takes");
    toast(`${p.name}: ${film.seconds} s, in the Library.`, { action: { label: "Download", run: () => (location.href = `${film.url}?download=${encodeURIComponent(p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "film")}.mp4`) } });
    return film;
  } catch (e) {
    toast(e.message, { tone: "crit" });
  } finally {
    cut.busy.delete("render");
    update();
  }
}

// ---------------------------------------------------------------- AI: sounds, voices, lip sync, extend

const waitJob = (id) => new Promise((ok, no) => {
  const es = new EventSource("api/events");
  es.addEventListener("paint", (e) => {
    const j = JSON.parse(e.data);
    if (j.id !== id || j.status === "running") return;
    es.close();
    j.status === "done" ? ok(j) : no(new Error(j.error ?? "That didn't work."));
  });
});
const waitRun = (id) => new Promise((ok, no) => {
  const check = () => {
    const r = state.runs.find((x) => x.id === id);
    if (r?.status === "done") return ok(r);
    if (r && ["failed", "canceled"].includes(r.status)) return no(new Error(r.error ?? "That take didn't make it."));
    setTimeout(check, 1500);
  };
  check();
});

/** Music (ACE-Step 1.5) or a sound effect (Stable Audio 3) from words, onto its track at the playhead. */
export async function makeAudio(kind, prompt, seconds, { at = cut.playhead } = {}) {
  if (!prompt.trim()) return;
  const key = `${kind}:${uid()}`;
  cut.busy.add(key);
  update();
  try {
    const job = await send(kind === "music" ? "api/audio/music" : "api/audio/sound", "POST", { prompt, seconds });
    const done = await waitJob(job.id);
    const a = done.audio;
    await loadAudio();
    addMedia({ kind: "audio", role: kind === "music" ? "music" : "effects", name: a.name, src: { kind: "audio", id: a.file, url: a.url, duration: a.seconds, name: a.name } }, { at });
    toast(`${a.name}: ${a.seconds.toFixed(1)} s, on the ${kind === "music" ? "Music" : "Effects"} track.`);
  } catch (e) {
    toast(e.message, { tone: "crit" });
  } finally {
    cut.busy.delete(key);
    update();
  }
}

/**
 * A voice line: LTX-2.5 says it (over a picture of who says it, when there is one), and its
 * sound becomes a line on the Voice track; the talking shot is a take in the Library too.
 */
export async function makeVoice({ who, line, picture, at = cut.playhead }) {
  if (!line.trim()) return;
  const key = `voice:${uid()}`;
  cut.busy.add(key);
  update();
  try {
    const words = line.trim().split(/\s+/).length;
    const seconds = clamp(Math.ceil(words / 2.5 + 2), 3, 10);
    const speakerWords = who?.trim() || "A calm narrator";
    const r = await rollAsTab({ name: `Voice · ${line.slice(0, 30)}`, group: "Voices", start: picture ?? null, shot: { action: `${speakerWords} speaks, facing the camera.`, camera: "locked", framing: "", sound: "Clean, close voice, quiet room.", dialogue: [{ speaker: speakerWords, line: line.trim() }] }, seconds, aspect: body()?.aspect ?? "16:9" });
    const done = await r.done;
    const a = await send("api/audio/from", "POST", { run: done.id, name: `${who?.split(",")[0] || "Voice"}: ${line.slice(0, 40)}`, kind: "voice", prompt: line });
    await loadAudio();
    addMedia({ kind: "audio", role: "voice", name: a.name, src: { kind: "audio", id: a.file, url: a.url, duration: a.seconds, name: a.name, run: done.id } }, { at });
    toast(`Voice line on the Voice track (${a.seconds.toFixed(1)} s).`);
  } catch (e) {
    toast(e.message, { tone: "crit" });
  } finally {
    cut.busy.delete(key);
    update();
  }
}

/** A frame of a clip, as a picture in the Library: drawn from its video at a time of its source. */
export async function frameOf(it, time = Number(it.from) || 0) {
  const s = sourceOf(it.src);
  if (!s?.url) throw new Error("That clip has no picture.");
  if (s.still) return { file: it.src.id, url: s.url, width: s.width, height: s.height };
  const v = document.createElement("video");
  v.muted = true;
  v.crossOrigin = "anonymous";
  v.src = s.url;
  await new Promise((ok, no) => ((v.onloadeddata = ok), (v.onerror = () => no(new Error("That clip's video can't be read.")))));
  v.currentTime = Math.min(time + 0.05, Math.max(0, v.duration - 0.05));
  await new Promise((ok) => (v.onseeked = ok));
  const c = document.createElement("canvas");
  c.width = v.videoWidth;
  c.height = v.videoHeight;
  c.getContext("2d").drawImage(v, 0, 0);
  const blob = await new Promise((ok) => c.toBlob(ok, "image/png"));
  return api.upload(blob, `${s.name ?? "clip"} frame`);
}

/** A take's request, for the AI actions that make a new version of it. */
const takeOf = (it) => (it?.src?.kind === "take" ? state.runs.find((r) => r.id === it.src.id) : null);

/**
 * Lip sync: the clip made again from its frame, its mouth following a voice line (the line on the
 * Voice track under it, or the one picked). The new take takes the clip's place, and the line's own
 * sound is left out, since the take carries it.
 */
export async function lipSync(id, voiceId) {
  const f = findItem(id);
  if (!f || !f.track.main) return toast("Lip sync works on a clip of the Video track.");
  const start = startOf(f.item);
  const end = start + lengthOf(f.item);
  const voices = track("a1").items;
  const voice = (voiceId && voices.find((v) => v.id === voiceId)) ?? voices.find((v) => (v.start ?? 0) < end && (v.start ?? 0) + lengthOf(v) > start);
  if (!voice) return toast("Put a voice line on the Voice track under the clip first (the Voice key makes one).");
  const key = `lipsync:${id}`;
  cut.busy.add(key);
  update();
  try {
    const picture = await frameOf(f.item);
    const take = takeOf(f.item);
    const seconds = clamp(Math.ceil(lengthOf(voice) + 0.5), 2, 10);
    // the shot follows the voice: its sound in, lip sync on; the clip's own frame is its start
    const r = await rollAsTab({ name: `${sourceOf(f.item.src)?.name ?? "Clip"} · lip sync`.slice(0, 60), group: cut.project.name, start: picture, shot: { action: take?.request?.script?.shots?.[0]?.action || "The person speaks to the camera.", camera: take?.request?.script?.shots?.[0]?.camera ?? "locked", framing: "", sound: "", dialogue: [] }, seconds, aspect: body().aspect, audio: { file: voice.src.id, url: voice.src.url, duration: lengthOf(voice), lipsync: true } });
    const done = await r.done;
    // the take carries the line now: its own sound stays off, so the line on the Voice track is heard once
    setItem(id, { src: { kind: "take", id: done.id }, from: 0, to: null, sound: false });
    toast("Lip sync: the clip speaks the line.");
  } catch (e) {
    toast(e.message, { tone: "crit" });
  } finally {
    cut.busy.delete(key);
    update();
  }
}

/** The clip made again with the same picture and a new sound (LTX-2.5 hears the words). */
export async function newSound(id, words) {
  const f = findItem(id);
  const take = takeOf(f?.item);
  if (!take) return toast("New sound works on a take.");
  const key = `sound:${id}`;
  cut.busy.add(key);
  update();
  try {
    const [run] = await api.resound(take.id, words);
    const done = await waitRun(run.id);
    setItem(id, { src: { kind: "take", id: done.id } });
    toast("New sound: the clip plays the new take.");
  } catch (e) {
    toast(e.message, { tone: "crit" });
  } finally {
    cut.busy.delete(key);
    update();
  }
}

/** The clip carried on for a few seconds more: LTX-2.5 extends the take from its last frames. */
export async function extendClip(id, seconds = 4, action = "") {
  const f = findItem(id);
  const take = takeOf(f?.item);
  if (!take) return toast("Extend works on a take.");
  const key = `extend:${id}`;
  cut.busy.add(key);
  update();
  try {
    const video = await api.videoFrom({ run: take.id });
    const prev = take.request?.script?.shots?.[0] ?? {};
    const r = await rollAsTab({ name: `${take.request?.name ?? "Clip"} · longer`.slice(0, 60), group: cut.project.name, start: null, shot: { action: action || prev.action || "", camera: prev.camera ?? "locked", framing: "", sound: prev.sound ?? "", dialogue: [] }, seconds, aspect: body().aspect, video: { file: video.file, mode: "extend" } });
    const done = await r.done;
    setItem(id, { src: { kind: "take", id: done.id }, to: null });
    toast(`Extended: the clip runs ${seconds} s longer.`);
  } catch (e) {
    toast(e.message, { tone: "crit" });
  } finally {
    cut.busy.delete(key);
    update();
  }
}

// ---------------------------------------------------------------- the editor's assistant

/** The edit as the assistant reads it: clips by number, sounds and titles with their times, the beats, effects, stickers and lyrics. */
function summary(b = body()) {
  const r1 = (v) => Math.round(v * 10) / 10;
  const motionName = (m) => MOTIONS.find(([, , x]) => JSON.stringify(x) === JSON.stringify(m ?? null))?.[1] ?? (m ? "a move" : "");
  const beats = beatTimes(b);
  const lines = lyricItems(b);
  return {
    length: r1(filmLength(b)),
    aspect: b.aspect,
    clips: layout(b).map((m, i) => ({ n: i + 1, name: sourceOf(m.item.src)?.name ?? m.item.name ?? "clip", start: r1(m.start), length: r1(m.len), join: m.item.join ?? "cut", motion: m.item.motion ? motionName(m.item.motion) : "", grade: m.item.grade ?? "", speed: m.item.speed ?? 1 })),
    sounds: b.tracks.filter((t) => t.kind === "audio").flatMap((t) => t.items.map((it) => ({ track: t.name.toLowerCase(), name: sourceOf(it.src)?.name ?? it.name ?? "sound", start: r1(Number(it.start) || 0), length: r1(lengthOf(it)) }))),
    titles: track("t1", b).items.filter((it) => !it.lyric).map((it) => ({ text: it.text, start: r1(Number(it.start) || 0), length: r1(Number(it.length) || 3) })),
    beats: b.beats && beats.length ? { bpm: r1(b.beats.bpm), count: beats.length, first: round3(beats[0]), offset: b.beats.offset ?? 0, down: b.beats.down ?? 0, source: b.beats.source } : null,
    effects: b.tracks.filter((t) => t.kind === "fx").flatMap((t) => t.items.map((it) => ({ kind: it.kind, on: it.on !== false && !t.mute, every: it.every ?? FX_DEFAULTS[it.kind]?.every, intensity: it.intensity ?? FX_DEFAULTS[it.kind]?.intensity, start: r1(Number(it.start) || 0), length: r1(Number(it.length) || 0) }))),
    stickers: (track("v2", b)?.items ?? []).filter(isPlaced).map((it) => ({ name: it.src?.id ?? "picture", start: r1(Number(it.start) || 0), length: r1(Number(it.length) || 3) })),
    lyrics: lines.map((it, i) => ({ n: i + 1, text: it.text, start: r1(Number(it.start) || 0), length: r1(Number(it.length) || 0), style: it.style ?? "karaoke" })),
  };
}

/** The assistant's actions on the edit: the changes as one undo step, then what takes its time (music, sounds, voices, the film). */
function applyActions(actions) {
  const b = body();
  if (!b) return jamActions(actions);
  const did = [];
  const later = [];
  const clip = (n) => mainTrack(b).items[Math.round(Number(n)) - 1];
  const clipStart = (n) => layout(b)[Math.round(Number(n)) - 1]?.start ?? 0;
  const end = () => Math.max(filmLength(b), totalLength(b));
  for (const a of actions ?? []) {
    const it = a.clip !== undefined && a.clip !== "all" ? clip(a.clip) : null;
    if (a.op === "trim" && it) {
      const s = sourceOf(it.src);
      const sec = clamp(Number(a.seconds) || 1, 0.3, 120);
      if (s?.still) it.length = sec;
      else it.to = Math.min(s?.duration ?? 60, (Number(it.from) || 0) + sec * (Number(it.speed) || 1));
      did.push(`Clip ${a.clip}: ${sec} s`);
    } else if (a.op === "move" && it) {
      const items = mainTrack(b).items;
      items.splice(items.indexOf(it), 1);
      items.splice(clamp(Math.round(Number(a.to)) - 1, 0, items.length), 0, it);
      did.push(`Clip ${a.clip} to ${a.to}`);
    } else if (a.op === "remove" && it) {
      mainTrack(b).items = mainTrack(b).items.filter((x) => x !== it);
      did.push(`Clip ${a.clip} out`);
    } else if (a.op === "join" && it) {
      it.join = a.join === "dissolve" || a.join === "whip" ? a.join : "cut";
      did.push(`${it.join === "dissolve" ? "Dissolve" : it.join === "whip" ? "Whip" : "Cut"} into clip ${a.clip}`);
    } else if (a.op === "motion" && it) {
      const m = MOTIONS.find(([id]) => id === a.move) ?? MOTIONS[0];
      it.motion = m[2] && structuredClone(m[2]);
      did.push(`${m[1]} on clip ${a.clip}`);
    } else if (a.op === "fade" && it) {
      if (a.in !== undefined) it.fadeIn = clamp(Number(a.in) || 0, 0, 5);
      if (a.out !== undefined) it.fadeOut = clamp(Number(a.out) || 0, 0, 5);
      did.push(`Fades on clip ${a.clip}`);
    } else if (a.op === "grade") {
      const look = ["warm", "cool", "film", "mono"].includes(a.look) ? a.look : undefined;
      for (const x of a.clip === "all" ? mainTrack(b).items : it ? [it] : []) x.grade = look;
      const name = look ? `${look[0].toUpperCase()}${look.slice(1)}` : "Natural";
      did.push(`${name} look${a.clip === "all" ? " on every clip" : ` on clip ${a.clip}`}`);
    } else if (a.op === "speed" && it) {
      it.speed = clamp(Number(a.speed) || 1, 0.25, 4);
      did.push(`Clip ${a.clip} at ${it.speed}×`);
    } else if (a.op === "title" && a.text) {
      track("t1", b).items.push({ id: uid(), text: String(a.text).slice(0, 120), start: round(Math.max(0, Number(a.at) || 0)), length: clamp(Number(a.length) || 3, 0.5, 30), style: a.style === "lower" ? "lower" : "center" });
      did.push("Title");
    } else if (a.op === "volume") {
      const which = { clips: mainTrack(b), voice: track("a1", b), music: track("a2", b), effects: track("a3", b) }[a.track];
      for (const x of which?.items ?? []) x.volume = clamp(Number(a.level) || 0, 0, 1.5);
      if (which) did.push(`${which.name} at ${Math.round(clamp(Number(a.level) || 0, 0, 1.5) * 100)}%`);
    } else if (a.op === "music" && a.prompt) {
      later.push(() => makeAudio("music", String(a.prompt), clamp(Number(a.seconds) || Math.max(15, Math.ceil(filmLength(b))), 5, 240), { at: Number(a.at) || 0 }));
      did.push("Making music");
    } else if (a.op === "sound" && a.prompt) {
      later.push(() => makeAudio("sound", String(a.prompt), clamp(Number(a.seconds) || 6, 1, 30), { at: a.clip !== undefined ? clipStart(a.clip) : Number(a.at) || 0 }));
      did.push("Making a sound");
    } else if (a.op === "voice" && a.line) {
      later.push(() => makeVoice({ who: String(a.who ?? ""), line: String(a.line), at: a.clip !== undefined ? clipStart(a.clip) : Number(a.at) || 0 }));
      did.push("Making a voice line");
    } else if (a.op === "render") {
      later.push(() => (hooks.context?.() && hooks.export ? hooks.export() : renderFilm()));
      did.push("Rendering the film");
    } else if (a.op === "beats") {
      if (a.action === "detect") {
        // heard after the rest is done; the effects count on the beats when they come, so the order does not matter
        later.push(() => detectBeatsNow(Number(a.bpm) || 0));
        did.push("Listening for the beats");
      } else if ((a.action === "halve" || a.action === "double") && b.beats?.times?.length) {
        b.beats = normalizeBeatsOf(a.action === "halve" ? halveBeats(b.beats) : doubleBeats(b.beats));
        did.push(a.action === "halve" ? "Half the tempo" : "Twice the tempo");
      } else if (a.bpm) {
        b.beats = gridBeats(a.bpm, a.offset ?? 0, Math.max(end(), 10) + 2, "ai");
        did.push(`${Math.round(a.bpm)} BPM beats`);
      } else if (a.shift !== undefined && b.beats) {
        b.beats.offset = round3(clamp((b.beats.offset ?? 0) + Number(a.shift), -5, 5));
        did.push(`Beats ${a.shift > 0 ? "later" : "earlier"} by ${Math.abs(a.shift)} s`);
      } else if (a.offset !== undefined && b.beats) {
        b.beats.offset = round3(clamp(Number(a.offset), -5, 5));
        did.push("Beat offset");
      }
    } else if (a.op === "snap") {
      const n = snapCuts(b, infoOf, { to: a.to === "bar" ? "bar" : "beat" });
      did.push(n ? `${n} cut${n > 1 ? "s" : ""} on the ${a.to === "bar" ? "bar" : "beat"}` : "The cuts were on the beat already");
    } else if (a.op === "effect" && FX_DEFAULTS[a.kind]) {
      const from = clamp(Number(a.from) || 0, 0, 36000);
      const once = Number(a.every) === 0;
      const to = Number(a.to) > from ? Number(a.to) : Number(a.length) > 0 ? from + Number(a.length) : once ? from + 0.5 : Math.max(end(), from + 2);
      const extra = {};
      for (const k of ["every", "intensity", "dur"]) if (a[k] !== undefined) extra[k] = Number(a[k]);
      track("fx", b).items.push(newFx(a.kind, from, to - from, extra));
      did.push(`${FX_KINDS.find(([k]) => k === a.kind)?.[1] ?? a.kind}${once ? "" : " on the beat"}`);
    } else if (a.op === "sticker" && a.name) {
      const st = stickerNamed(a.name);
      if (!st) did.push(`No sticker called ${a.name}`);
      else {
        const t = track("v2", b);
        t.items.push({ id: uid(), src: { kind: "sticker", id: st.id }, start: round(Math.max(0, Number(a.at) || 0)), length: clamp(Number(a.length) || 3, 0.3, 120), x: Number(a.x ?? 0.5), y: Number(a.y ?? 0.35), w: Number(a.w ?? 0.3), rot: Number(a.rot) || 0, z: nextZ(t) });
        did.push(`${st.name} sticker`);
      }
    } else if (a.op === "lyrics") {
      const all = lyricItems(b);
      const one = a.line !== undefined ? all[Math.round(Number(a.line)) - 1] : null;
      const targets = a.line !== undefined ? (one ? [one] : []) : all;
      if (a.style) for (const x of targets) x.style = a.style;
      if (a.shift !== undefined && one) shiftLine(one, Number(a.shift));
      if (a.split) for (const x of targets) resplit(x, a.split);
      if (a.text && one) retext(one, String(a.text));
      if (targets.length) did.push(a.style ? `Lyrics as ${a.style}` : a.shift !== undefined ? `Line ${a.line} moved` : a.split ? "Words timed again" : "Lyrics changed");
    } else if (a.op === "draft") {
      if (b.beats?.times?.length) {
        const n = snapCuts(b, infoOf, { to: "beat" });
        if (n) did.push(`${n} cut${n > 1 ? "s" : ""} on the beat`);
        did.push(...draft(b, end()));
      } else {
        later.push(() => draftEdit());
        did.push("Drawing a first edit");
      }
    }
  }
  if (did.length) commit();
  for (const run of later) run();
  // what Jam carries out itself (the part, the words, the artist...): after the edit's, which is one undo step
  did.push(...jamActions(actions));
  return did;
}

/**
 * The bar's words, on Cut: the editor changes the edit. `chat` is the conversation they are kept in: Cut's own, or another page's
 * that asks the same editor (Pickle's, on Jam).
 */
export async function askCut(text, chat = cut.chat) {
  const words = text.trim();
  // asked from Jam, it is Pickle's, with what the jam holds (and he can answer before there is an edit)
  const jam = hooks.context?.() ?? null;
  if (!words || chat.busy || (!cut.project && !jam)) return;
  chat.messages.push({ role: "user", text: words });
  chat.busy = "Editing";
  update("assistant");
  try {
    await loadStickers();
    const out = await send("api/cut/assist", "POST", { model: writer(), messages: chat.messages.slice(-8), cut: { ...(cut.project ? summary() : {}), ...(jam ? { jam } : {}) }, ...(jam ? { product: "jam" } : {}) });
    // (Pickle never makes what costs credits: if one came in his answer all the same, it is not done)
    const did = applyActions(jam ? (out.actions ?? []).filter((a) => !["music", "sound", "voice"].includes(a.op)) : out.actions);
    chat.messages.push({ role: "assistant", text: out.reply || (did.length ? "Done." : "Nothing to change."), did });
  } catch (e) {
    chat.messages.push({ role: "assistant", text: e.message, error: true });
  } finally {
    chat.busy = null;
    update("assistant");
  }
}
