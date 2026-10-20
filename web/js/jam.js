// Jam: a music video from a track. The track is uploaded or made (ACE-Step); the part used is heard
// on Comfy Cloud (its vocals separated, their words timed, its beat read). The video is cut on the
// beat into shots: where there is singing the artist performs it (lip-synced to the vocals), where
// there is none they dance (copying a dance video) or the scene plays (b-roll). The shots are cut
// together on the track, the words over them as captions, in a Cut of its own. That Cut is the one
// timeline: Jam fills it from what it makes (the music, the shots, the words, the beat) and the editor
// works on it in place (beats, effects, stickers, the words' timing); Jam never writes over what was added.
import { state, changed, onChange, toast, waitFor, artistFor } from "./store.js";
import { api } from "./api.js";
import { cut, openCut, commit, layout, lengthOf, renderFilm, setLyricStyle, setLineText, flushCuts } from "./cut.js";
import { keyedSaver } from "./saving.js";
import { normalizeBody, lyricItems } from "./edit.js";
import { gridBeats, detectBeats } from "./beats.js";
import { splitWords } from "./lyrics.js";
import { onServer } from "./picker.js";
import { crewById, crewPicture } from "./mixer-trends.js";

const OPEN = "comfyture.jam.open";
export const jam = { list: [], jam: null, ready: null, busy: new Set(), playing: false, starting: null };
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
  // what the one open has not yet had kept is kept before another is read (it might be this one, as the server has it)
  await flushJams();
  const { project } = await call(`api/jams/${id}`);
  jam.jam = { ...project, body: { ...blank(), ...project.body } };
  try {
    localStorage.setItem(OPEN, id);
  } catch {}
  update();
  await edit(jam.jam).catch((e) => console.warn("jam edit:", e.message));
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
/** What keeps a video on the server: one save a moment after its last change, for each video, so renaming A and then B keeps both. */
const keep = async (id, j) => {
  const thumb = j.body.looks.performance?.url ?? j.body.artist?.url;
  await send(`api/jams/${id}`, "PUT", { name: j.name, body: j.body, ...(thumb ? { thumb } : {}) })
    .then(() => {
      const row = jam.list.find((x) => x.id === id);
      const first = row && thumb && row.thumb !== thumb;
      if (row) Object.assign(row, { name: j.name, thumb, updatedAt: new Date().toISOString() });
      // the set list shows the video's picture as soon as it has one
      if (first) update();
    })
    .catch((e) => toast(e.message, { tone: "crit" }));
};
const saver = keyedSaver(400, keep);
export const flushJams = () => saver.flush();
export function save(j = jam.jam) {
  if (j) saver.save(j.id, j);
}
const touched = () => (save(), update());
export const rename = (name) => ((jam.jam.name = name.slice(0, 60)), save());
export async function removeJam(id) {
  // a video that is gone is not kept again by a save still to come
  saver.drop(id);
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

// ---------------------------------------------------------------- a jam started from a dance trend

/** What a track in a trend's feel is asked for (Mixer asks the same): never the trend's own song. */
const feelOf = (t) => {
  const m = t.music ?? {};
  return [m.genre, m.mood, ...(m.instruments ?? []).filter((x) => !/original|new /i.test(x)).slice(0, 4), "an original catchy instrumental for a short video"].filter(Boolean).join(", ");
};

/**
 * A music video started from a dance trend (the Dance trends shelf): a project of its own, named after the trend, its lead
 * dancer the artist. A trend we have made ourselves brings its own sound as the track and our version of the dance as the
 * moves to copy, in step with that sound; any other gets a track made in its feel (and our version's moves, if it has one).
 */
export async function startFromTrend(t) {
  if (!t || jam.starting) return;
  jam.starting = t.id;
  update();
  let j = null;
  try {
    j = await newJam(t.name);
    const b = j.body;
    b.trend = { id: t.id, name: t.name };
    update();
    const lead = crewById(t.cast?.[0]?.crew);
    const [artist, moves, files] = await Promise.all([
      lead ? onServer(crewPicture(lead.id), lead.name).catch(() => null) : null,
      t.preview ? fetch(t.preview).then((r) => (r.ok ? r.blob() : Promise.reject(new Error("no moves")))).then((blob) => api.uploadVideo(blob)).catch(() => null) : null,
      t.recipe ? send(`api/mixer/trends/${t.id}/files`, "POST", {}) : null,
    ]);
    if (artist) b.artist = { file: artist.file, url: artist.url, width: artist.width, height: artist.height, crew: lead.id };
    if (moves) b.dance = { file: moves.file, url: moves.url, duration: moves.duration, width: moves.width, height: moves.height, synced: !!t.recipe };
    if (t.recipe) {
      const mix = files?.mix;
      if (!mix?.file) throw new Error(`${t.name} has no sound to start from.`);
      // (the tempo is for the finder to hear: the trend's catalogued tempo is for a new track made in its feel, and its own sound can differ)
      setTrack(j, { file: mix.file, url: mix.url, seconds: mix.seconds || t.seconds, name: t.name, kind: "trend" });
    }
    if (jam.jam === j) touched();
    else await send(`api/jams/${j.id}`, "PUT", { name: j.name, body: b });
    if (jam.jam !== j) return;
    // the sound is heard (its beats, its singing) as any track is; one made in the trend's feel is made first
    if (t.recipe) await listen();
    else await makeTrack({ prompt: feelOf(t), lyrics: "", seconds: Math.max(10, Math.ceil(t.seconds) + 1), bpm: t.music?.bpm ?? 110, name: `${t.name} track` });
  } catch (e) {
    toast(e.message, { tone: "crit" });
    // nothing to start from: the empty project is not kept
    if (j && t.recipe && !j.body.track) await removeJam(j.id).catch(() => {});
  } finally {
    jam.starting = null;
    update();
  }
}

function setTrack(j, track) {
  const len = j.body.span ? j.body.span.to - j.body.span.from : 30;
  Object.assign(j.body, { track, span: { from: 0, to: Math.min(track.seconds, len || track.seconds) }, part: null, vocals: null, sung: [], lines: [], bpm: null, beats: [], down: 0, shots: [], film: null });
  delete j.body.sure;
  delete j.body.musicIn;
  // a new track: what the old one made in the edit goes, what was added stays
  if (cut.project?.id === j.body.cut) {
    const body = cut.project.body;
    for (const t of body.tracks) if (t.main || t.role === "music" || t.items.some((it) => it.lyric)) t.items = t.items.filter((it) => !(t.main || t.role === "music" || it.lyric));
    delete body.beats;
    commit({ history: false });
  }
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
    (b.down = 0), delete b.sure;
    // the words written for a made track are the words: put them on the times heard
    if (b.track.lyrics?.trim()) b.lines = alignLyrics(b.track.lyrics, b.lines, b.sung);
    await hearBeats(b);
    plan(j);
    touched();
    await syncEdit(j, { fresh: true }).catch((e) => console.warn("jam edit:", e.message));
  } catch (e) {
    toast(`Listening: ${e.message}`, { tone: "crit" });
    // the part is cut all the same: the edit can be made without what Comfy hears (the beats found in the editor, the words typed)
    if (!b.part && jam.jam === j) {
      try {
        const part = await send("api/jam/slice", "POST", { audio: b.track.file, from: asked.from, to: asked.to, name: b.track.name });
        b.part = { file: part.file, url: part.url, seconds: part.seconds };
        b.bpm = b.track.bpm ?? null;
        await hearBeats(b);
        plan(j);
        touched();
        await syncEdit(j, { fresh: true });
      } catch {}
    }
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
 * The beats of the part when Comfy gave none (or could not be asked): heard here, in the browser, steered by the
 * tempo already known (a made track's, a trend's). They go to the edit like the ones Comfy heard.
 */
async function hearBeats(b) {
  if (b.beats?.length > 3 || !b.part) return;
  try {
    const found = await detectBeats(b.part.url, { hint: b.bpm || b.track?.bpm || 0 });
    if (found.times.length < 4) return;
    b.beats = found.times;
    b.down = found.down;
    b.sure = found.confidence;
    b.bpm = b.bpm || Math.round(found.bpm * 10) / 10;
  } catch (e) {
    console.warn("jam beats:", e.message);
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
/** The text of the nth line, in the edit (its words kept in time when their number holds) and in Jam's own list. */
export function setLine(i, text, { history = true } = {}) {
  const j = jam.jam;
  const l = j?.body.lines[i];
  if (!l) return;
  l.text = text.slice(0, 120);
  if (cut.project?.id === j.body.cut) setLineText(i, l.text, { history });
  save();
}
/**
 * Lyrics with no singing heard to put them on (Comfy was not there to listen): a line to each two
 * bars from the start (or evenly over the part when that is more than it holds), to be moved in the editor.
 */
export function spreadLyrics(text, seconds, bpm) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !/^\[.*\]$/.test(l));
  if (!lines.length) return [];
  const bar = (60 / (bpm || 100)) * 4 * 2;
  const step = Math.min(bar, (seconds - 0.5) / lines.length);
  return lines.map((t, i) => ({ text: t, from: Math.round(i * step * 100) / 100, to: Math.round((i * step + Math.max(1, step - 0.3)) * 100) / 100 }));
}

/** The words typed for the track (an uploaded one's), put on the times heard; the edit's lines are made again from them. */
export function useLyrics(text) {
  const j = jam.jam;
  const b = j.body;
  b.track.lyrics = text;
  b.lines = b.lines.length || b.sung.length ? alignLyrics(text, b.lines, b.sung) : spreadLyrics(text, b.part?.seconds ?? 30, b.bpm);
  touched();
  syncEdit(j, { lines: true, shots: false, beats: false, fresh: true }).catch((e) => console.warn("jam edit:", e.message));
}

// ---------------------------------------------------------------- the artist and the look

export async function setArtist(file) {
  const j = await ensure();
  try {
    const p = file.file ? file : await api.upload(file, file.name);
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
    syncEdit(j, { lines: false, beats: false });
  } catch (e) {
    toast(e.message, { tone: "crit" });
  } finally {
    jam.busy.delete("dance");
    update();
  }
}
export const clearDance = () => ((jam.jam.body.dance = null), plan(jam.jam), touched(), syncEdit(jam.jam, { lines: false, beats: false }));
export function setStyle(text) {
  jam.jam.body.style = text.slice(0, 300);
  jam.jam.body.looks = {};
  save();
}
/** The LoRAs every shot is rolled with ([{ id, strength }]); a shot rolled with others is rolled again. */
export const setLoras = (list) => ((jam.jam.body.loras = list), (jam.jam.body.film = null), touched());
const lorasOf = (b) => (b.loras?.length ? b.loras : undefined);
const sameLoras = (a, b) => JSON.stringify((a ?? []).map((l) => [l.id, l.strength])) === JSON.stringify((b ?? []).map((l) => [l.id, l.strength]));
/** Whether a shot's take is done, in the style the video is rolled in now. */
const rolled = (b, s) => !!s.clip || (take(s)?.status === "done" && sameLoras(take(s).request?.loras, lorasOf(b)));
/** How the words are drawn (karaoke, pop, bounce, lower, none): every line of the edit. */
export function setCaptions(style) {
  const j = jam.jam;
  j.body.captions = style;
  j.body.film = null;
  if (cut.project?.id === j.body.cut) setLyricStyle(style);
  touched();
}
export const setEvery = (n) => ((jam.jam.body.every = n), plan(jam.jam), touched(), syncEdit(jam.jam, { lines: false, beats: false }));

// ---------------------------------------------------------------- the shots

const BEAT = (b) => 60 / (b.bpm || 100);
/**
 * The bars of the part: where each starts. From the beats of the edit when it has them (heard, typed,
 * nudged: the first beat of a bar and every fourth after), else the beats Comfy heard, else the tempo.
 */
export function bars(b) {
  const seconds = b.part?.seconds ?? (b.span ? b.span.to - b.span.from : 0);
  const own = cut.project?.id === b.cut ? cut.project.body.beats : null;
  const out = [];
  if (own?.times?.length > 8) {
    const down = own.down ?? 0;
    own.times.forEach((t0, k) => {
      const t = t0 + (own.offset ?? 0);
      if (((k - down) % 4 + 4) % 4 === 0 && t < seconds - 0.25) out.push(Math.round(t * 1000) / 1000);
    });
  } else {
    const first = b.beats[0] ?? 0;
    const step = BEAT(b) * 4;
    for (let t = first; t < seconds - 0.25; t += step) out.push(Math.round(t * 1000) / 1000);
  }
  if (out[0] > 0.25) out.unshift(0);
  else if (out.length) out[0] = 0;
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
  const before = b.shots;
  b.shots = spans.map((s) => {
    const shot = {
      from: Math.round(s.from * 1000) / 1000,
      to: Math.round(s.to * 1000) / 1000,
      kind: sungIn(s) > 0.3 ? "performance" : b.dance ? "dance" : "broll",
      run: null,
    };
    // a shot planned again where it was, of the same kind, is not rolled again: its take and its clip stay
    const same = before.find((o) => o.kind === shot.kind && Math.abs(o.from - shot.from) < 0.25 && Math.abs(o.to - shot.to) < 0.25);
    if (same) Object.assign(shot, { run: same.run ?? null, ...(same.clip ? { clip: same.clip } : {}) });
    return shot;
  });
  b.film = null;
}
export function cycleKind(i) {
  const s = jam.jam?.body.shots[i];
  if (!s) return;
  const order = ["performance", ...(jam.jam.body.dance ? ["dance"] : []), "broll"];
  s.kind = order[(order.indexOf(s.kind) + 1) % order.length];
  s.run = null;
  delete s.clip;
  jam.jam.body.film = null;
  touched();
  syncEdit(jam.jam, { lines: false, beats: false });
}
export const take = (s) => (s?.run ? state.runs.find((r) => r.id === s.run) : null);
export function shotState(s, i) {
  if (s.clip) return { step: "done" };
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

/** Where in the dance a shot copies from: its own time when the dance is in step with the track, else after the dance shots before it. */
const danceStart = (b, i, walked) => (b.dance?.synced ? (b.span?.from ?? 0) + b.shots[i].from : walked);

async function roll(j, i, danceAt) {
  const b = j.body;
  const s = b.shots[i];
  const len = s.to - s.from;
  const seconds = Math.min(10, Math.max(2, Math.ceil(len)));
  jam.busy.add(`roll:${i}`);
  update();
  try {
    const start = await look(j, s.kind);
    const body = { name: `${j.name} · ${String(i + 1).padStart(2, "0")}`, start: start.file, seconds, aspect: "9:16", review: false, takes: 1, quality: "standard", loras: lorasOf(b) };
    if (s.kind === "performance") {
      // the vocals of this shot, for the lips to follow
      const voice = await send("api/jam/slice", "POST", { audio: (b.vocals ?? b.part).file, from: s.from, to: Math.min(b.part.seconds, s.from + seconds), name: `${j.name} · ${i + 1} vocals`, kind: "voice" });
      body.audio = { file: voice.file, lipsync: true };
      body.script = { shots: [{ action: "They sing these words into the microphone with feeling, moving to the rhythm, the lights pulsing.", camera: "", sound: "", framing: "" }], raw: "" };
    } else if (s.kind === "dance" && b.dance) {
      // a dance made for the track (a trend's) is in step with it: the shot copies the stretch at its own time
      const from = b.dance.synced ? Math.min(danceAt, Math.max(0, b.dance.duration - seconds)) : danceAt % Math.max(1, b.dance.duration - seconds);
      const clip = await send("api/jam/clip", "POST", { video: b.dance.file, from: Math.round(from * 100) / 100, seconds });
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
  if (!b.artist && b.shots.some((s) => !rolled(b, s))) return toast("Add the artist's photo first.");
  if (making()) return;
  jam.busy.add("make-video");
  b.film = null;
  update();
  try {
    // the looks first, one at a time, so every shot of a kind starts from the same one
    for (const kind of new Set(b.shots.filter((s) => !s.clip).map((s) => s.kind))) await look(j, kind);
    const todo = b.shots.map((_, i) => i).filter((i) => !rolled(b, b.shots[i]));
    // the dance video is walked through in order, a new stretch for each dance shot (one made for the track, at the shot's own time)
    let danceAt = 0;
    const at = {};
    for (const i of todo) if (b.shots[i].kind === "dance") (at[i] = danceStart(b, i, danceAt)), (danceAt += b.shots[i].to - b.shots[i].from);
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
    if (b.shots.every((s) => rolled(b, s))) await assemble(j);
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
    await roll(j, i, danceStart(j.body, i, j.body.shots.slice(0, i).filter((s) => s.kind === "dance").reduce((t, s) => t + s.to - s.from, 0)));
    if (j.body.shots.every((s) => rolled(j.body, s))) await assemble(j);
  } catch (e) {
    toast(e.message, { tone: "crit" });
  } finally {
    jam.busy.delete("make-video");
    update();
  }
}

// ---------------------------------------------------------------- the edit: one timeline, kept

const round = (v) => Math.round(v * 1000) / 1000;

/** The edit Jam opens at first: its shape (a phone's), its music, nothing else yet. */
const firstEdit = () => ({ ...normalizeBody({ aspect: "9:16", duck: false, fit: "cover", product: "jam" }) });

const opening = new WeakMap();
/**
 * The jam's edit, made when it is not there yet and open in the editor (quietly: it is Jam's, so
 * Kitchen's Cut keeps its own tabs). Answers the edit's body. Asked many times at once, it opens once.
 */
export function edit(j = jam.jam) {
  const b = j?.body;
  if (!b?.part) return Promise.resolve(null);
  if (cut.project?.id === b.cut) return Promise.resolve(cut.project.body);
  if (!opening.has(b)) opening.set(b, openEdit(j).finally(() => opening.delete(b)));
  return opening.get(b);
}
async function openEdit(j) {
  const b = j.body;
  if (b.cut) {
    try {
      await openCut(b.cut, { quiet: true });
      return cut.project.body;
    } catch {
      b.cut = null;
    }
  }
  const { project } = await send("api/cuts", "POST", { name: j.name, body: firstEdit() });
  b.cut = project.id;
  save();
  await openCut(project.id, { quiet: true });
  await syncEdit(j, { fresh: true });
  return cut.project.body;
}

/** What the video shows for a shot now: its take when made, else its clip, else the look that will start it, else a dark stage. */
function shotSource(b, s) {
  const t = take(s);
  if (t?.status === "done") return { src: { kind: "take", id: t.id }, have: t.length ?? t.request.seconds, made: true };
  // a clip may be a stretch of a longer video (a trend's dance, cut at the shot's own time): it starts at `from`
  if (s.clip) return { src: { kind: "video", id: s.clip.file, duration: s.clip.duration, name: s.clip.name }, have: s.clip.duration - (s.clip.from ?? 0), at: s.clip.from ?? 0, made: true };
  const look = b.looks?.[s.kind] ?? b.looks?.performance ?? b.artist;
  if (look?.file) return { src: { kind: "photo", id: look.file, url: look.url, name: `${KINDS[s.kind]} look` }, have: Infinity, made: false };
  return { src: { kind: "color", id: "14101f", name: "Stage" }, have: Infinity, made: false };
}

/**
 * The parts of the edit that come from Jam's own work, put into it: the music, the shots (the
 * take where made, a still where not yet), the lines of the words, the beats Comfy heard. What was
 * added in the editor (effects, stickers, titles, the words' look and timing, other beats) is
 * kept. The lines of the words are made only when asked (`lines`, or `fresh`: the words are new, so
 * the edit's lines are made again from them), never as a side effect: a line taken away in the editor stays away.
 */
export async function syncEdit(j = jam.jam, { shots = true, lines = false, beats = true, fresh = false } = {}) {
  const b = j?.body;
  const body = await edit(j);
  if (!body || !b.part) return;
  const main = body.tracks.find((t) => t.main);
  const music = body.tracks.find((t) => t.role === "music");
  const titles = body.tracks.find((t) => t.kind === "title");
  // a new edit gets Jam's shape (a phone's, no ducking, the picture filling it); one that has it is as it was shaped, in Kitchen's Cut too
  if (body.product !== "jam") {
    Object.assign(body, { aspect: "9:16", duck: false, product: "jam" });
    body.fit ??= "cover";
  }
  // the music: the part of the track used, put in once and with its length (so the preview plays all of it)
  // (the same part keeps what the editor did to it: its start, its trim, its level; music taken away stays away)
  const song = { src: { kind: "audio", id: b.part.file, duration: b.part.seconds, name: b.track?.name }, start: 0, from: 0, to: b.part.seconds };
  const had = music.items.find((it) => it.id === "track");
  if (!had) {
    if (b.musicIn !== b.part.file) music.items.unshift({ id: "track", ...song });
  } else if (had.src?.id !== song.src.id) Object.assign(had, song);
  else if (!(Number(had.src.duration) > 0)) had.src.duration = b.part.seconds;
  b.musicIn = b.part.file;
  if (shots && b.shots.length) {
    const pristine = !main.items.length || (main.items.length === b.shots.length && main.items.every((it, i) => it.id === `j${i + 1}`));
    // a clip that came since its stand-in: it fills the slot the stand-in had, slowed when it is shorter
    const fit = (got, need) => {
      const speed = got.have < need ? Math.max(0.25, got.have / need) : 1;
      return got.src.kind === "photo" || got.src.kind === "color" ? { length: round(need) } : { from: round(got.at ?? 0), to: round((got.at ?? 0) + Math.min(got.have, need * speed)), speed: round(speed) };
    };
    if (pristine) {
      // the edit is the shots as planned: their times and pictures follow what Jam made; what the editor did to a clip stays
      main.items = b.shots.map((s, i) => {
        const need = Math.max(0.5, s.to - s.from);
        const got = shotSource(b, s);
        const old = main.items[i];
        if (!old) return { id: `j${i + 1}`, shot: i, src: got.src, sound: false, join: "cut", ...fit(got, need) };
        if (old.src?.kind === got.src.kind && old.src?.id === got.src.id) return { ...old, shot: i, ...(old.length === undefined && old.to === undefined ? fit(got, need) : {}) };
        const { length, from, to, speed, ...keep } = old;
        return { ...keep, shot: i, src: got.src, ...fit(got, need) };
      });
    } else {
      // the editor has cut, moved or added clips: the structure is the user's, only a stand-in gives way to the take that came
      for (const it of main.items) {
        const s = b.shots[it.shot];
        if (!s || it.src?.kind === "take" || it.src?.kind === "video") continue;
        const got = shotSource(b, s);
        if (!got.made) continue;
        const { length, ...keep } = it;
        Object.assign(it, { ...keep, src: got.src, ...fit(got, Math.max(0.5, lengthOf(it))) });
        delete it.length;
      }
    }
  }
  if (lines || fresh) {
    b.linesInEdit = true;
    const had = lyricItems(body);
    const mine = new Map(had.map((it) => [it.id, it]));
    const style = b.captions === "none" ? "none" : b.captions ?? "karaoke";
    const first = had[0];
    // the look of the first line is the look of the new ones: where it sits, how big, its colours
    const look = first ? Object.fromEntries(["x", "y", "size", "color", "hi"].filter((k) => first[k] !== undefined).map((k) => [k, first[k]])) : {};
    titles.items = titles.items.filter((it) => !it.lyric);
    titles.items.push(...b.lines.map((l, i) => {
      const old = !fresh && mine.get(`c${i + 1}`);
      const length = Math.max(0.6, round(l.to - l.from));
      // a line kept as it was keeps what the editor did to it, unless its words or its place changed
      if (old && old.text === l.text) return { ...old, start: round(l.from), length };
      return { id: `c${i + 1}`, lyric: true, text: l.text, start: round(l.from), length, style, words: splitWords(l.text, length), ...look };
    }));
    // a title the user added stays where it is, ahead of the lines
    titles.items.sort((a, z) => (Number(a.start) || 0) - (Number(z.start) || 0));
  }
  if (beats && b.beats?.length > 3 && (!body.beats || body.beats.source === "comfy")) body.beats = { bpm: b.bpm ?? 120, offset: 0, times: b.beats, down: b.down ?? 0, source: "comfy", ...(b.sure !== undefined ? { sure: b.sure } : {}) };
  else if (beats && !body.beats && b.bpm) body.beats = gridBeats(b.bpm, b.beats?.[0] ?? 0, b.part.seconds + 1, "grid");
  commit({ history: false });
}

/** The shots' times and the lines of the words follow the edit as it is changed in the editor. */
export function syncFromCut(j = jam.jam) {
  const b = j?.body;
  const body = cut.project?.body;
  if (!b?.cut || cut.project?.id !== b.cut || !body) return false;
  let moved = false;
  for (const m of layout(body)) {
    const s = b.shots[m.item.shot];
    if (!s) continue;
    const from = round(m.start);
    const to = round(m.end);
    if (s.from !== from || s.to !== to) (s.from = from), (s.to = to), (moved = true);
  }
  const items = lyricItems(body);
  const lines = items.map((it) => ({ from: round(Number(it.start) || 0), to: round((Number(it.start) || 0) + (Number(it.length) || 3)), text: it.text }));
  // once the edit holds the lines, it is where they live: a line taken away there is gone from Jam's list too
  if ((items.length || b.linesInEdit) && JSON.stringify(lines) !== JSON.stringify(b.lines)) (b.lines = lines), (moved = true);
  if (moved) save();
  return moved;
}

/** The shots on the track, the words over them: the edit brought up to date, then rendered. */
async function assemble(j) {
  const b = j.body;
  jam.busy.add("render");
  update();
  try {
    await syncEdit(j, { lines: false, beats: false });
    const film = await renderFilm();
    if (film) {
      b.film = { url: film.url, seconds: film.seconds, id: film.id };
      state.films = [film, ...(state.films ?? []).filter((f) => f.id !== film.id)];
      touched();
    }
  } catch (e) {
    toast(e.message, { tone: "crit" });
  } finally {
    jam.busy.delete("render");
    update();
  }
}

/** The edit as it is, rendered now (no shot is rolled): the video to keep. */
export async function exportVideo() {
  const j = jam.jam;
  if (j?.body.part && !jam.busy.has("render")) await assemble(j);
}

/** Roughly what the video costs, in Comfy credits: three looks and every second rolled. */
export function estimate() {
  const b = jam.jam?.body;
  if (state.info?.target !== "comfy-cloud" || !b?.shots.length) return null;
  const m = (state.image.catalogue?.models ?? []).find((x) => x.id === artistFor("edit"));
  const pic = m?.router ? m.credits ?? 8 : (m?.seconds ?? 10) * 0.266;
  const looks = new Set(b.shots.map((s) => s.kind)).size - Object.keys(b.looks).length;
  const seconds = b.shots.filter((s) => !rolled(b, s)).reduce((t, s) => t + Math.min(10, Math.max(2, Math.ceil(s.to - s.from))), 0);
  if (!seconds && looks <= 0) return null;
  return Math.max(1, Math.round(Math.max(0, looks) * pic + seconds * 18 * 0.266));
}

// a take that finished comes into the edit as it arrives (the shot's still gives way to it); the edit changed in
// the editor brings the shots' times and the lines of the words back to Jam's list
onChange((scopes) => {
  const j = jam.jam;
  if (scopes.has("takes") && j?.body.shots.some((s) => s.run)) {
    const arrived = j.body.cut && cut.project?.id === j.body.cut && j.body.shots.some((s, i) => take(s)?.status === "done" && cut.project.body.tracks.find((t) => t.main)?.items.find((it) => it.shot === i)?.src?.kind !== "take");
    if (arrived) syncEdit(j, { lines: false, beats: false }).then(() => changed("jam", "cut"));
    changed("jam");
  }
  if (scopes.has("cut") && j && syncFromCut(j)) changed("jam");
});
