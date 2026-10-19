// Cut: the editing room. An edit is a timeline of tracks: titles, overlays, the main video track
// (its clips end to end, each cut or dissolved into the one before), and the sound tracks (voices,
// music, effects, each sound at its own time). Edits are kept on the server, one per tab, with
// undo; a film is rendered on the server from the timeline into the Library.

import { api } from "./api.js";
import { state, changed, toast, rollAsTab, writer } from "./store.js";

const TABS = "comfyture.cut.tabs";
const LAST = "comfyture.cut.last";
export const FPS = 24;

export const cut = { list: [], tabs: [], project: null, selected: null, playhead: 0, zoom: 48, tool: "select", snap: true, busy: new Set(), history: [], future: [], audio: null, ready: null, error: null, chat: { messages: [], busy: null } };

/** The moves a clip can make over its length: a push in, a pull out, a pan. */
export const MOTIONS = [
  ["none", "No move", null],
  ["push", "Push in", { from: { scale: 1, x: 0, y: 0 }, to: { scale: 1.15, x: 0, y: 0 } }],
  ["pull", "Pull out", { from: { scale: 1.15, x: 0, y: 0 }, to: { scale: 1, x: 0, y: 0 } }],
  ["left", "Pan left", { from: { scale: 1.12, x: 0.8, y: 0 }, to: { scale: 1.12, x: -0.8, y: 0 } }],
  ["right", "Pan right", { from: { scale: 1.12, x: -0.8, y: 0 }, to: { scale: 1.12, x: 0.8, y: 0 } }],
  ["up", "Tilt up", { from: { scale: 1.12, x: 0, y: 0.8 }, to: { scale: 1.12, x: 0, y: -0.8 } }],
];
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
const uid = () => Math.random().toString(36).slice(2, 9);
const update = (...more) => changed("cut", ...more);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round = (v) => Math.round(v * 100) / 100;

/** The tracks every edit has, top to bottom. */
const TRACKS = () => [
  { id: "t1", kind: "title", name: "Titles", items: [] },
  { id: "v2", kind: "video", name: "Overlays", items: [] },
  { id: "v1", kind: "video", name: "Video", main: true, items: [] },
  { id: "a1", kind: "audio", role: "voice", name: "Voice", items: [] },
  { id: "a2", kind: "audio", role: "music", name: "Music", items: [] },
  { id: "a3", kind: "audio", role: "effects", name: "Effects", items: [] },
];
function normalize(b = {}) {
  const tracks = TRACKS().map((t) => ({ ...t, ...(b.tracks ?? []).find((x) => x.id === t.id), items: ((b.tracks ?? []).find((x) => x.id === t.id)?.items ?? []).map((it) => ({ id: it.id ?? uid(), ...it })) }));
  return { aspect: b.aspect ?? "16:9", duck: b.duck !== false, tracks, markers: b.markers ?? [] };
}
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
  if (src.kind === "audio") return { url: src.url ?? `/media/audio/${src.id}`, duration: src.duration ?? 5, name: src.name };
  return null;
}

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
  const others = (b?.tracks ?? []).filter((t) => !t.main).flatMap((t) => t.items.map((it) => (Number(it.start) || 0) + lengthOf(it)));
  return Math.max(main, ...others, 0);
}
export const filmLength = (b = body()) => (layout(b).at(-1)?.end ?? 0);

// ---------------------------------------------------------------- projects

let saveTimer = 0;
/** A change: noted for undo, drawn, and kept a moment later. */
export function commit({ history = true } = {}) {
  const b = body();
  if (!b) return;
  if (history) {
    cut.history.push(cut.last);
    if (cut.history.length > 80) cut.history.shift();
    cut.future = [];
  }
  cut.last = JSON.stringify(b);
  touch();
}
export function touch({ now = false } = {}) {
  clearTimeout(saveTimer);
  update();
  if (!cut.project) return;
  const p = cut.project;
  const keep = async () => {
    const first = mainTrack(p.body)?.items[0];
    const s = first ? sourceOf(first.src) : null;
    const thumb = first?.src?.kind === "photo" ? s?.url : first?.src?.kind === "take" ? state.runs.find((r) => r.id === first.src.id)?.request?.start && `/media/photos/${state.runs.find((r) => r.id === first.src.id).request.start}` : undefined;
    await send(`api/cuts/${p.id}`, "PUT", { name: p.name, body: p.body, ...(thumb ? { thumb } : {}) }).catch((e) => toast(e.message, { tone: "crit" }));
    const known = cut.list.find((x) => x.id === p.id);
    if (known) Object.assign(known, { name: p.name, ...(thumb ? { thumb } : {}) });
  };
  if (now) return keep();
  saveTimer = setTimeout(keep, 800);
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

export async function openCut(id) {
  if (cut.project && saveTimer) await touch({ now: true });
  const { project } = await call(`api/cuts/${id}`);
  project.body = normalize(project.body);
  cut.project = project;
  cut.selected = null;
  cut.playhead = 0;
  cut.history = [];
  cut.future = [];
  cut.last = JSON.stringify(project.body);
  if (!cut.tabs.includes(id)) cut.tabs.push(id);
  write(TABS, JSON.stringify(cut.tabs));
  write(LAST, id);
  update();
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
  commit({ history });
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

/** The join into a main-track clip: a cut or a one-second dissolve. */
export function setJoin(id, join) {
  setItem(id, { join });
}

// ---------------------------------------------------------------- rendering the film

export async function renderFilm() {
  const p = cut.project;
  if (!p || cut.busy.has("render")) return;
  if (!mainTrack()?.items.length) return toast("Put clips on the Video track first.");
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

/** The edit as the assistant reads it: clips by number, sounds and titles with their times. */
function summary(b = body()) {
  const r1 = (v) => Math.round(v * 10) / 10;
  const motionName = (m) => MOTIONS.find(([, , x]) => JSON.stringify(x) === JSON.stringify(m ?? null))?.[1] ?? (m ? "a move" : "");
  return {
    length: r1(filmLength(b)),
    aspect: b.aspect,
    clips: layout(b).map((m, i) => ({ n: i + 1, name: sourceOf(m.item.src)?.name ?? m.item.name ?? "clip", start: r1(m.start), length: r1(m.len), join: m.item.join ?? "cut", motion: m.item.motion ? motionName(m.item.motion) : "", grade: m.item.grade ?? "", speed: m.item.speed ?? 1 })),
    sounds: b.tracks.filter((t) => t.kind === "audio").flatMap((t) => t.items.map((it) => ({ track: t.name.toLowerCase(), name: sourceOf(it.src)?.name ?? it.name ?? "sound", start: r1(Number(it.start) || 0), length: r1(lengthOf(it)) }))),
    titles: track("t1", b).items.map((it) => ({ text: it.text, start: r1(Number(it.start) || 0), length: r1(Number(it.length) || 3) })),
  };
}

/** The assistant's actions on the edit: the changes as one undo step, then what takes its time (music, sounds, voices, the film). */
function applyActions(actions) {
  const b = body();
  const did = [];
  const later = [];
  const clip = (n) => mainTrack(b).items[Math.round(Number(n)) - 1];
  const clipStart = (n) => layout(b)[Math.round(Number(n)) - 1]?.start ?? 0;
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
      it.join = a.join === "dissolve" ? "dissolve" : "cut";
      did.push(`${it.join === "dissolve" ? "Dissolve" : "Cut"} into clip ${a.clip}`);
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
      later.push(() => renderFilm());
      did.push("Rendering the film");
    }
  }
  if (did.length) commit();
  for (const run of later) run();
  return did;
}

/** The bar's words, on Cut: the editor changes the edit. */
export async function askCut(text) {
  const words = text.trim();
  if (!words || cut.chat.busy || !cut.project) return;
  cut.chat.messages.push({ role: "user", text: words });
  cut.chat.busy = "Editing";
  update("assistant");
  try {
    const out = await send("api/cut/assist", "POST", { model: writer(), messages: cut.chat.messages.slice(-8), cut: summary() });
    const did = applyActions(out.actions);
    cut.chat.messages.push({ role: "assistant", text: out.reply || (did.length ? "Done." : "Nothing to change."), did });
  } catch (e) {
    cut.chat.messages.push({ role: "assistant", text: e.message, error: true });
  } finally {
    cut.chat.busy = null;
    update("assistant");
  }
}
