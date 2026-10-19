// Jam: a music video from a track. The track is uploaded or made (ACE-Step); the part used is heard
// on Comfy Cloud (its vocals separated, their words timed, its beat read). The video is cut on the
// beat into shots: where there is singing the artist performs it (lip-synced to the vocals), where
// there is none they dance (copying a dance video) or the scene plays (b-roll). The shots are cut
// together on the track, the words over them as captions, in a Cut of its own.
import { state, changed, onChange, toast, waitFor, artistFor } from "./store.js";
import { api } from "./api.js";

const OPEN = "comfyture.jam.open";
export const jam = { list: [], jam: null, ready: null, busy: new Set(), playing: false };
const update = () => changed("jam");

const call = async (path, init) => {
  const res = await fetch(path, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body;
};
const send = (path, method, body) => call(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });

export const KINDS = { performance: "Performance", dance: "Dance", broll: "B-roll" };
const blank = () => ({ track: null, span: null, part: null, vocals: null, sung: [], lines: [], bpm: null, beats: [], captions: "karaoke", artist: null, dance: null, style: "", every: 2, shots: [], looks: {}, film: null, cut: null });

// ---------------------------------------------------------------- the videos kept on the server

export function loadJams() {
  return (jam.ready ??= (async () => {
    try {
      jam.list = (await call("api/jams")).jams ?? [];
      let last = null;
      try {
        last = localStorage.getItem(OPEN);
      } catch {}
      const id = jam.list.find((j) => j.id === last)?.id ?? jam.list[0]?.id;
      if (id) await openJam(id);
    } catch (e) {
      console.warn("jam:", e.message);
    }
    update();
  })());
}
export async function openJam(id) {
  const { project } = await call(`api/jams/${id}`);
  jam.jam = { ...project, body: { ...blank(), ...project.body } };
  try {
    localStorage.setItem(OPEN, id);
  } catch {}
  update();
}
export async function newJam(name = "New music video") {
  const { project } = await send("api/jams", "POST", { name, body: blank() });
  jam.list = [{ id: project.id, name: project.name, updatedAt: project.updatedAt }, ...jam.list];
  jam.jam = { ...project, body: { ...blank(), ...project.body } };
  try {
    localStorage.setItem(OPEN, project.id);
  } catch {}
  update();
  return jam.jam;
}
let saving = null;
export function save() {
  const j = jam.jam;
  if (!j) return;
  clearTimeout(saving);
  saving = setTimeout(() => {
    const thumb = j.body.looks.performance?.url ?? j.body.artist?.url;
    send(`api/jams/${j.id}`, "PUT", { name: j.name, body: j.body, ...(thumb ? { thumb } : {}) })
      .then(() => {
        const row = jam.list.find((x) => x.id === j.id);
        if (row) Object.assign(row, { name: j.name, thumb, updatedAt: new Date().toISOString() });
      })
      .catch((e) => toast(e.message, { tone: "crit" }));
  }, 400);
}
const touched = () => (save(), update());
export const rename = (name) => ((jam.jam.name = name.slice(0, 60)), save());
export async function removeJam(id) {
  const { jams } = await call(`api/jams/${id}`, { method: "DELETE" });
  jam.list = jams ?? [];
  if (jam.jam?.id === id) {
    jam.jam = null;
    if (jam.list[0]) await openJam(jam.list[0].id);
  }
  update();
}
const ensure = async () => jam.jam ?? (await newJam());

// ---------------------------------------------------------------- the track

/** How long the video runs, from the start of the track: a TikTok's 15 or 30 seconds, a minute, all of it. */
export const LENGTHS = [15, 30, 60, 0];

export async function useTrack(file) {
  const j = await ensure();
  jam.busy.add("track");
  update();
  try {
    const a = await api.uploadAudio(file);
    let seconds = a.seconds;
    if (!seconds) {
      const ctx = new AudioContext();
      seconds = (await ctx.decodeAudioData(await (await fetch(a.url)).arrayBuffer())).duration;
      ctx.close();
    }
    const name = (file.name ?? "").replace(/\.\w+$/, "").slice(0, 50) || "My track";
    setTrack(j, { file: a.file, url: a.url, seconds, name, kind: "upload" });
    if (j.name === "New music video") j.name = name;
    touched();
    await listen();
  } catch (e) {
    toast(e.message, { tone: "crit" });
  } finally {
    jam.busy.delete("track");
    update();
  }
}

/** A track made from a few words and lyrics (ACE-Step 1.5), then heard. */
export async function makeTrack({ prompt, lyrics, seconds, bpm, name }) {
  const j = await ensure();
  if (!prompt?.trim()) return toast("Say what the music is like.");
  jam.busy.add("make");
  update();
  try {
    const job = await send("api/audio/music", "POST", { prompt, lyrics, seconds, bpm, name: name || "Jam track" });
    const done = await waitFor("job", job.id);
    setTrack(j, { ...done.audio, kind: "made", prompt, lyrics, bpm });
    if (j.name === "New music video") j.name = done.audio.name;
    touched();
    await listen();
  } catch (e) {
    toast(e.message, { tone: "crit" });
  } finally {
    jam.busy.delete("make");
    update();
  }
}

function setTrack(j, track) {
  const len = j.body.span ? j.body.span.to - j.body.span.from : 30;
  Object.assign(j.body, { track, span: { from: 0, to: Math.min(track.seconds, len || track.seconds) }, part: null, vocals: null, sung: [], lines: [], bpm: null, beats: [], shots: [], film: null });
}

export function setLength(seconds) {
  const j = jam.jam;
  if (!j?.body.track) return;
  const from = j.body.span?.from ?? 0;
  const to = seconds ? Math.min(j.body.track.seconds, from + seconds) : j.body.track.seconds;
  j.body.span = { from: Math.max(0, Math.min(from, to - 5)), to };
  Object.assign(j.body, { shots: [], film: null });
  touched();
  listen();
}
export function setStart(from) {
  const j = jam.jam;
  if (!j?.body.track) return;
  const len = (j.body.span?.to ?? 30) - (j.body.span?.from ?? 0);
  const start = Math.max(0, Math.min(from, j.body.track.seconds - Math.min(len, j.body.track.seconds)));
  j.body.span = { from: Math.round(start * 10) / 10, to: Math.min(j.body.track.seconds, Math.round((start + len) * 10) / 10) };
  Object.assign(j.body, { shots: [], film: null });
  touched();
  clearTimeout(setStart.t);
  setStart.t = setTimeout(listen, 900);
}

/** The part of the track used, heard: its vocals, their words and times, its tempo and beats. */
let again = false;
export async function listen() {
  const j = jam.jam;
  const b = j?.body;
  if (!b?.track) return;
  // a part asked for while another is being heard is heard after it
  if (jam.busy.has("listen")) return void (again = true);
  const asked = { ...b.span };
  jam.busy.add("listen");
  update();
  try {
    const { job, track } = await send("api/jam/listen", "POST", { audio: b.track.file, from: asked.from, to: asked.to, name: b.track.name });
    const done = await waitFor("job", job.id);
    // what was heard is for the part asked for: a part changed since waits for its own hearing
    if (jam.jam !== j || b.span.from !== asked.from || b.span.to !== asked.to) return;
    const heard = done.listen ?? {};
    b.part = { file: track.file, url: track.url, seconds: track.seconds };
    b.vocals = heard.vocals ? { file: heard.vocals.file, url: heard.vocals.url } : null;
    b.sung = b.vocals ? await singing(b.vocals.url) : [];
    b.lines = readSrt(heard.srt ?? "");
    b.bpm = Number((heard.bpm ?? "").match(/([\d.]+)/)?.[1]) || b.track.bpm || null;
    b.beats = readBeats(heard.beats ?? "");
    // the words written for a made track are the words: put them on the times heard
    if (b.track.lyrics?.trim()) b.lines = alignLyrics(b.track.lyrics, b.lines, b.sung);
    plan(j);
    touched();
  } catch (e) {
    toast(`Listening: ${e.message}`, { tone: "crit" });
  } finally {
    jam.busy.delete("listen");
    update();
    if (again) {
      again = false;
      listen();
    }
  }
}

/**
 * Where the vocals sing: the stretches where the separated vocals are loud (a twentieth of a second
 * at a time, against their own loud parts), short gaps closed and short blips dropped.
 */
async function singing(url) {
  try {
    const ctx = new AudioContext();
    const audio = await ctx.decodeAudioData(await (await fetch(url)).arrayBuffer());
    ctx.close();
    const d = audio.getChannelData(0);
    const hop = Math.round(audio.sampleRate / 20);
    const rms = [];
    for (let i = 0; i + hop <= d.length; i += hop) {
      let sum = 0;
      for (let k = i; k < i + hop; k += 4) sum += d[k] * d[k];
      rms.push(Math.sqrt(sum / (hop / 4)));
    }
    const loud = [...rms].sort((x, y) => x - y)[Math.floor(rms.length * 0.95)] ?? 0;
    const floor = Math.max(0.01, loud * 0.18);
    const spans = [];
    rms.forEach((v, i) => {
      if (v < floor) return;
      const t = i / 20;
      const last = spans.at(-1);
      if (last && t - last.to <= 0.5) last.to = t + 0.05;
      else spans.push({ from: t, to: t + 0.05 });
    });
    return spans.filter((x) => x.to - x.from >= 0.4).map((x) => ({ from: Math.round(x.from * 100) / 100, to: Math.round(x.to * 100) / 100 }));
  } catch {
    return [];
  }
}

/** Subtitles (SRT) as lines: from and to in seconds, and their words. */
export function readSrt(srt) {
  const t = (s) => {
    const [h, m, rest] = s.split(":");
    return Number(h) * 3600 + Number(m) * 60 + Number(rest.replace(",", "."));
  };
  return srt.split(/\r?\n\r?\n/).map((block) => {
    const rows = block.trim().split(/\r?\n/);
    const at = rows.findIndex((r) => r.includes("-->"));
    if (at < 0) return null;
    const [a, b] = rows[at].split("-->").map((x) => x.trim());
    const text = rows.slice(at + 1).join(" ").trim();
    return text ? { from: Math.round(t(a) * 100) / 100, to: Math.round(t(b) * 100) / 100, text } : null;
  }).filter(Boolean);
}
/** The beat events (one value a frame at 24 fps, 1 on a beat) as the times of the beats. */
function readBeats(text) {
  try {
    const list = JSON.parse(text);
    return Array.isArray(list) ? list.map((v, i) => (Number(v) >= 0.5 ? Math.round((i / 24) * 1000) / 1000 : null)).filter((x) => x !== null) : [];
  } catch {
    return [];
  }
}
/** The words of a line, plain: lower case, no punctuation. */
const wordsOf = (t) => t.toLowerCase().replace(/[^a-z0-9\u00c0-\u024f' ]+/g, " ").split(/\s+/).filter(Boolean);
/** How alike two lines read: shared words, a near word (same first three letters) counting half. */
function alike(a, b) {
  const A = wordsOf(a);
  const B = wordsOf(b);
  if (!A.length || !B.length) return 0;
  let hit = 0;
  for (const w of A) hit += B.includes(w) ? 1 : B.some((x) => x.length > 2 && w.length > 2 && x.slice(0, 3) === w.slice(0, 3)) ? 0.5 : 0;
  return hit / Math.max(A.length, B.length);
}
/**
 * Lyrics as they were written, on the times the vocals were heard at. Every heard line goes, in
 * order, to the written line it reads most like (a heard line like none goes where its place in
 * the song puts it); each written line then runs from its first heard line to its last.
 */
export function alignLyrics(lyrics, heardLines, sung = []) {
  // the singing Whisper wrote nothing for counts too: what is left of it once the heard lines are taken out
  const left = sung.flatMap((x) => {
    let pieces = [{ from: x.from, to: x.to }];
    for (const l of heardLines) pieces = pieces.flatMap((p) => (l.to <= p.from || l.from >= p.to ? [p] : [{ from: p.from, to: l.from }, { from: l.to, to: p.to }]));
    return pieces.filter((p) => p.to - p.from >= 0.3);
  });
  const heard = [...heardLines, ...left.map((x) => ({ ...x, text: "" }))].sort((a, b) => a.from - b.from);
  const lines = lyrics.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !/^\[.*\]$/.test(l));
  const n = lines.length;
  const m = heard.length;
  if (!n || !m) return heard;
  // best[k][i]: the best score with heard line k given to written line i (the order kept)
  const score = (k, i) => alike(heard[k].text, lines[i]) - 0.08 * Math.abs(k / Math.max(1, m - 1) - i / Math.max(1, n - 1));
  const best = Array.from({ length: m }, () => new Array(n).fill(-Infinity));
  const from = Array.from({ length: m }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) best[0][i] = score(0, i);
  for (let k = 1; k < m; k++) {
    let run = -Infinity;
    let at = 0;
    for (let i = 0; i < n; i++) {
      if (best[k - 1][i] > run) (run = best[k - 1][i]), (at = i);
      best[k][i] = run + score(k, i);
      from[k][i] = at;
    }
  }
  let i = best[m - 1].indexOf(Math.max(...best[m - 1]));
  const given = new Array(m);
  for (let k = m - 1; k >= 0; k--) {
    given[k] = i;
    i = from[k][i];
  }
  // each written line on its heard lines: one caption while they run on, a new one when it is sung again
  const out = [];
  lines.forEach((text, li) => {
    const mine = heard.filter((_, k) => given[k] === li);
    if (!mine.length) {
      // nothing heard for it: it sits in the gap its neighbours leave
      const before = out.at(-1)?.to ?? 0;
      const next = heard.find((h, k) => given[k] > li);
      out.push({ text, from: before, to: Math.max(before + 0.8, Math.min(next?.from ?? before + 3, before + 3)) });
      return;
    }
    for (const h of mine) {
      const last = out.at(-1);
      if (last?.text === text && h.from - last.to <= 1 && h.to - last.from <= 6) last.to = h.to;
      else out.push({ text, from: h.from, to: h.to });
    }
  });
  // a caption stays up long enough to read, but not past the next
  out.forEach((x, i) => (x.to = Math.max(x.to, Math.min(x.from + 1.2, out[i + 1]?.from ?? x.from + 1.2))));
  // and a caption too short to read even so joins the one before when it says the same
  const read = out.filter((x, i) => !(x.to - x.from < 0.8 && out[i - 1]?.text === x.text && ((out[i - 1].to = x.to), true)));
  return read.map((x) => ({ from: Math.round(x.from * 100) / 100, to: Math.round(x.to * 100) / 100, text: x.text }));
}
export function setLine(i, text) {
  const l = jam.jam?.body.lines[i];
  if (!l) return;
  l.text = text.slice(0, 120);
  save();
}
/** The words typed for the track (an uploaded one's), put on the times heard. */
export function useLyrics(text) {
  const b = jam.jam.body;
  b.track.lyrics = text;
  b.lines = alignLyrics(text, b.lines, b.sung);
  touched();
}

// ---------------------------------------------------------------- the artist and the look

export async function setArtist(file) {
  const j = await ensure();
  try {
    const p = await api.upload(file, file.name);
    j.body.artist = { file: p.file, url: p.url, width: p.width, height: p.height };
    j.body.looks = {};
    for (const s of j.body.shots) Object.assign(s, { run: null });
    j.body.film = null;
    touched();
  } catch (e) {
    toast(e.message, { tone: "crit" });
  }
}
export async function setDance(file) {
  const j = await ensure();
  jam.busy.add("dance");
  update();
  try {
    const v = await api.uploadVideo(file);
    j.body.dance = { file: v.file, url: v.url, duration: v.duration, width: v.width, height: v.height };
    plan(j);
    touched();
  } catch (e) {
    toast(e.message, { tone: "crit" });
  } finally {
    jam.busy.delete("dance");
    update();
  }
}
export const clearDance = () => ((jam.jam.body.dance = null), plan(jam.jam), touched());
export function setStyle(text) {
  jam.jam.body.style = text.slice(0, 300);
  jam.jam.body.looks = {};
  save();
}
export const setCaptions = (style) => ((jam.jam.body.captions = style), (jam.jam.body.film = null), touched());
export const setEvery = (n) => ((jam.jam.body.every = n), plan(jam.jam), touched());

// ---------------------------------------------------------------- the shots

const BEAT = (b) => 60 / (b.bpm || 100);
/** The bars of the part: where each starts, from the beats heard (or the tempo when none were). */
export function bars(b) {
  const seconds = b.part?.seconds ?? (b.span ? b.span.to - b.span.from : 0);
  const first = b.beats[0] ?? 0;
  const step = BEAT(b) * 4;
  const out = [];
  for (let t = first; t < seconds - 0.25; t += step) out.push(Math.round(t * 1000) / 1000);
  if (out[0] > 0.25) out.unshift(0);
  else out[0] = 0;
  return out;
}

/**
 * The shots, cut every so many bars (each between two and ten seconds): sung ones are performed,
 * the others danced when there is a dance to copy, else the scene (b-roll). Re-planning keeps the
 * looks, not the takes.
 */
export function plan(j) {
  const b = j.body;
  if (!b.part) return;
  const seconds = b.part.seconds;
  const marks = bars(b).filter((_, i) => i % (b.every || 2) === 0);
  marks.push(seconds);
  let spans = [];
  for (let i = 0; i < marks.length - 1; i++) spans.push({ from: marks[i], to: marks[i + 1] });
  // too short joins the one before, too long splits
  spans = spans.reduce((list, s) => (list.length && s.to - s.from < 2 ? ((list[list.length - 1].to = s.to), list) : [...list, s]), []);
  spans = spans.flatMap((s) => {
    const n = Math.ceil((s.to - s.from) / 10);
    return Array.from({ length: n }, (_, k) => ({ from: s.from + ((s.to - s.from) * k) / n, to: s.from + ((s.to - s.from) * (k + 1)) / n }));
  });
  const sung = b.sung?.length ? b.sung : b.lines;
  const sungIn = (s) => sung.reduce((t, l) => t + Math.max(0, Math.min(l.to, s.to) - Math.max(l.from, s.from)), 0) / (s.to - s.from);
  b.shots = spans.map((s) => ({
    from: Math.round(s.from * 1000) / 1000,
    to: Math.round(s.to * 1000) / 1000,
    kind: sungIn(s) > 0.3 ? "performance" : b.dance ? "dance" : "broll",
    run: null,
  }));
  b.film = null;
}
export function cycleKind(i) {
  const s = jam.jam?.body.shots[i];
  if (!s) return;
  const order = ["performance", ...(jam.jam.body.dance ? ["dance"] : []), "broll"];
  s.kind = order[(order.indexOf(s.kind) + 1) % order.length];
  s.run = null;
  jam.jam.body.film = null;
  touched();
}
export const take = (s) => (s?.run ? state.runs.find((r) => r.id === s.run) : null);
export function shotState(s, i) {
  if (jam.busy.has(`roll:${i}`) && !take(s)) return { step: "rolling", progress: 0 };
  const t = take(s);
  if (t && !["done", "failed", "canceled"].includes(t.status)) return { step: "rolling", progress: t.progress ?? 0 };
  if (t?.status === "done") return { step: "done" };
  if (t) return { step: "failed", note: t.error };
  return { step: "waiting" };
}
export const making = () => jam.busy.has("make-video") || [...jam.busy].some((k) => k.startsWith("roll:") || k.startsWith("look:"));

const LOOK = {
  performance: (style) => `A vertical music video frame: @artist, exactly this person or character (face, features, hair, colours, build), waist-up, singing passionately into a microphone, ${style || "on a stage under coloured concert lights"}, cinematic lighting, shallow depth of field. No text.`,
  dance: (style) => `A vertical music video frame: @artist, exactly this person or character (face, features, hair, colours, build), full body from head to feet in frame, standing ready to dance, ${style || "on a stage under coloured concert lights"}, cinematic lighting. No text.`,
  broll: (style) => `A vertical music video frame: an atmospheric cinematic shot of the setting, ${style || "a stage under coloured concert lights"}, with @artist small in the scene, moody light, depth and haze. No text.`,
};
async function look(j, kind) {
  if (j.body.looks[kind]) return j.body.looks[kind];
  if (!j.body.artist) throw new Error("Add the artist's photo first.");
  jam.busy.add(`look:${kind}`);
  update();
  try {
    const photo = await (async () => {
      const [started] = await api.image({ model: artistFor("edit"), template: "edit", prompt: LOOK[kind](j.body.style.trim()), refs: [{ file: j.body.artist.file, name: "artist" }], aspect: "9:16", count: 1, megapixels: 1, seed: Math.floor(Math.random() * 2 ** 31), name: `${j.name} · ${KINDS[kind]}` });
      return (await waitFor("job", started.id)).photo;
    })();
    j.body.looks[kind] = { file: photo.file, url: photo.url };
    touched();
    return j.body.looks[kind];
  } finally {
    jam.busy.delete(`look:${kind}`);
    update();
  }
}

async function roll(j, i, danceAt) {
  const b = j.body;
  const s = b.shots[i];
  const len = s.to - s.from;
  const seconds = Math.min(10, Math.max(2, Math.ceil(len)));
  jam.busy.add(`roll:${i}`);
  update();
  try {
    const start = await look(j, s.kind);
    const body = { name: `${j.name} · ${String(i + 1).padStart(2, "0")}`, start: start.file, seconds, aspect: "9:16", review: false, takes: 1, quality: "standard" };
    if (s.kind === "performance") {
      // the vocals of this shot, for the lips to follow
      const voice = await send("api/jam/slice", "POST", { audio: (b.vocals ?? b.part).file, from: s.from, to: Math.min(b.part.seconds, s.from + seconds), name: `${j.name} · ${i + 1} vocals`, kind: "voice" });
      body.audio = { file: voice.file, lipsync: true };
      body.script = { shots: [{ action: "They sing these words into the microphone with feeling, moving to the rhythm, the lights pulsing.", camera: "", sound: "", framing: "" }], raw: "" };
    } else if (s.kind === "dance" && b.dance) {
      const clip = await send("api/jam/clip", "POST", { video: b.dance.file, from: danceAt % Math.max(1, b.dance.duration - seconds), seconds });
      body.video = { file: clip.file, mode: "motion", control: "pose" };
      body.script = { shots: [{ action: "They dance exactly like the reference, full of energy, the whole body in frame.", camera: "", sound: "", framing: "" }], raw: "" };
    } else {
      body.script = { shots: [{ action: "The scene breathes with the music: the lights pulse and sweep, haze drifts, small movements.", camera: "push-in", sound: "", framing: "" }], raw: "" };
    }
    const [run] = await api.shoot(body);
    s.run = run.id;
    touched();
    const done = await waitFor("run", run.id).catch(() => null);
    // ComfyUI fails a take now and then: it is rolled once more
    if (!done) {
      const [again] = await api.shoot(body);
      s.run = again.id;
      touched();
      await waitFor("run", again.id).catch(() => null);
    }
  } finally {
    jam.busy.delete(`roll:${i}`);
    update();
  }
}

/** The whole video: every shot not yet made rolled (three at a time), then cut on the track with its captions. */
export async function makeVideo() {
  const j = jam.jam;
  const b = j?.body;
  if (!b?.part || !b.shots.length) return toast("Add a track first: its shots are cut on its beat.");
  if (!b.artist) return toast("Add the artist's photo first.");
  if (making()) return;
  jam.busy.add("make-video");
  b.film = null;
  update();
  try {
    // the looks first, one at a time, so every shot of a kind starts from the same one
    for (const kind of new Set(b.shots.map((s) => s.kind))) await look(j, kind);
    const todo = b.shots.map((_, i) => i).filter((i) => take(b.shots[i])?.status !== "done");
    // the dance video is walked through in order, a new stretch for each dance shot
    let danceAt = 0;
    const at = {};
    for (const i of todo) if (b.shots[i].kind === "dance") (at[i] = danceAt), (danceAt += b.shots[i].to - b.shots[i].from);
    let next = 0;
    const worker = async () => {
      while (next < todo.length) {
        const i = todo[next++];
        try {
          await roll(j, i, at[i] ?? 0);
        } catch (e) {
          toast(`Shot ${i + 1}: ${e.message}`, { tone: "crit" });
        }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    if (b.shots.every((s) => take(s)?.status === "done")) await assemble(j);
    else toast("Some shots didn't come out: roll them again, then make the video.");
  } finally {
    jam.busy.delete("make-video");
    update();
  }
}

export async function rerollShot(i) {
  const j = jam.jam;
  if (!j || making()) return;
  jam.busy.add("make-video");
  update();
  try {
    j.body.shots[i].run = null;
    await roll(j, i, j.body.shots.slice(0, i).filter((s) => s.kind === "dance").reduce((t, s) => t + s.to - s.from, 0));
    if (j.body.shots.every((s) => take(s)?.status === "done")) await assemble(j);
  } catch (e) {
    toast(e.message, { tone: "crit" });
  } finally {
    jam.busy.delete("make-video");
    update();
  }
}

/** The shots on the track, the words over them: a Cut of its own, rendered. */
async function assemble(j) {
  const b = j.body;
  jam.busy.add("render");
  update();
  try {
    const items = b.shots.map((s, i) => {
      const t = take(s);
      const need = s.to - s.from;
      const have = t.length ?? t.request.seconds;
      const speed = have < need ? Math.max(0.25, have / need) : 1;
      return { id: `j${i + 1}`, src: { kind: "take", id: t.id }, from: 0, to: Math.min(have, need * speed), speed, sound: false, join: "cut" };
    });
    const tracks = [
      { id: "video", kind: "video", main: true, items },
      { id: "music", kind: "audio", role: "music", items: [{ id: "track", src: { kind: "audio", id: b.part.file }, start: 0, from: 0, to: b.part.seconds }] },
    ];
    if (b.captions !== "none" && b.lines.length) tracks.push({ id: "captions", kind: "title", items: b.lines.map((l, i) => ({ id: `c${i + 1}`, text: l.text, start: l.from, length: Math.max(0.6, l.to - l.from), style: b.captions === "lower" ? "lower" : b.captions })) });
    const body = { aspect: "9:16", tracks, duck: false };
    let id = b.cut;
    if (id) await send(`api/cuts/${id}`, "PUT", { name: j.name, body }).catch(() => (id = null));
    if (!id) id = (await send("api/cuts", "POST", { name: j.name, body })).project.id;
    b.cut = id;
    const film = await send(`api/cuts/${id}/render`, "POST", {});
    b.film = { url: film.url, seconds: film.seconds, id: film.id };
    state.films = [film, ...(state.films ?? []).filter((f) => f.id !== film.id)];
    touched();
  } catch (e) {
    toast(e.message, { tone: "crit" });
  } finally {
    jam.busy.delete("render");
    update();
  }
}

/** Roughly what the video costs, in Comfy credits: three looks and every second rolled. */
export function estimate() {
  const b = jam.jam?.body;
  if (state.info?.target !== "comfy-cloud" || !b?.shots.length) return null;
  const m = (state.image.catalogue?.models ?? []).find((x) => x.id === artistFor("edit"));
  const pic = m?.router ? m.credits ?? 8 : (m?.seconds ?? 10) * 0.266;
  const looks = new Set(b.shots.map((s) => s.kind)).size - Object.keys(b.looks).length;
  const seconds = b.shots.filter((s) => take(s)?.status !== "done").reduce((t, s) => t + Math.min(10, Math.max(2, Math.ceil(s.to - s.from))), 0);
  return Math.max(1, Math.round(Math.max(0, looks) * pic + seconds * 18 * 0.266));
}

onChange((scopes) => {
  if (scopes.has("takes") && jam.jam?.body.shots.some((s) => s.run)) changed("jam");
});
