// The mixing strip: up to six sounds (or the sound of a clip) laid on a time ruler, each with a fader, a mute and a start that is dragged;
// a playhead and a play key that plays the mix from the sounds' own decoded buffers (WebAudio), and "Render the mix", which sends the
// same list to the server (server/utensils-fx.ts "mix": ffmpeg adelay, volume, amix, optionally loudnorm) and keeps what comes back as
// a sound. The strip is kept in this browser; what is on it is the library's files, not copies. The strip's state is `mix`: tracks
// [{ id, file, from, url, name, seconds, volume (dB), offset (s), mute }] and the render settings.
import { h, icon, sprite } from "./dom.js";
import { toast, changed } from "./store.js";
import { api } from "./api.js";
import { trackJob, utensils, registerTool } from "./utensils.js";
import { fxRun, fxStop, asResult } from "./utensils-fx-api.js";
import { clock, switchKey, chipRow } from "./utensils-fx-controls.js";
import { audioContext, bufferOf, peaks, drawPeaks, stopSounds, onPlaying } from "./utensils-audio-wave.js";

export const MAX_TRACKS = 6;
const MAX_START = 590;
const KEY = "comfyture.utensils.mix";
const dbToGain = (db) => 10 ** (db / 20);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const TONES = ["#F2FF59", "#8c8cff", "#e24bd9", "#59c7ff", "#ff7a59", "#9be15d"];

const read = () => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return { tracks: Array.isArray(v.tracks) ? v.tracks.filter((t) => t?.url && t.file).slice(0, MAX_TRACKS) : [], master: !!v.master, lufs: Number(v.lufs) || -16, fadeOut: Number(v.fadeOut) || 0 };
  } catch {
    return { tracks: [], master: false, lufs: -16, fadeOut: 0 };
  }
};
export const mix = { ...read(), pos: 0, playing: false };
const save = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ tracks: mix.tracks, master: mix.master, lufs: mix.lufs, fadeOut: mix.fadeOut }));
  } catch {}
};
const update = () => (save(), changed("utensils"));

/** Which library folder a file is in, from where its address says it is. */
export const folderOf = (url) => (url.startsWith("/media/videos/") ? "videos" : url.startsWith("/media/edits/") ? "edits" : "audio");
/** The length of the mix: where the last sound ends (at least a few seconds, so the ruler has something to measure). */
export const mixLength = () => Math.max(8, ...mix.tracks.map((t) => (t.offset || 0) + (t.seconds || 0)));

/** A sound (a result or a library file) laid on the strip as a new track. Answers false when the strip is full. */
export function addTrack(sound) {
  if (!sound?.url || !sound.file) return false;
  if (mix.tracks.length >= MAX_TRACKS) return void toast(`The strip holds ${MAX_TRACKS} tracks.`) ?? false;
  const track = { id: `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, file: sound.file, from: folderOf(sound.url), url: sound.url, name: String(sound.name ?? sound.note ?? sound.file).slice(0, 40), seconds: Math.round((sound.seconds ?? sound.duration ?? 0) * 100) / 100, volume: 0, offset: 0, mute: false, kind: sound.kind === "video" ? "video" : "audio" };
  mix.tracks.push(track);
  update();
  if (!track.seconds) bufferOf(track.url).then((b) => ((track.seconds = Math.round(b.duration * 100) / 100), update())).catch(() => {});
  return true;
}
const removeTrack = (id) => {
  mix.tracks = mix.tracks.filter((t) => t.id !== id);
  if (!mix.tracks.length) stop();
  update();
};

// ---------------------------------------------------------------- playing the mix

let nodes = [];
let started = 0;
let from = 0;
let raf = 0;
const stop = () => {
  cancelAnimationFrame(raf);
  for (const n of nodes) {
    try {
      n.src.stop();
    } catch {}
    n.src.disconnect();
    n.gain.disconnect();
  }
  nodes = [];
  if (mix.playing) {
    mix.pos = Math.min(mixLength(), from + (audioContext().currentTime - started));
    mix.playing = false;
  }
};
export const stopMix = () => (stop(), changed("utensils"));
/** Plays the mix from the playhead: each sound starts when its time comes, at its fader's gain. */
async function startPlay() {
  if (mix.playing) return stopMix();
  stopSounds();
  const ctx = audioContext();
  await ctx.resume();
  const list = mix.tracks.filter((t) => !t.mute);
  if (!list.length) return toast("Every track is muted.");
  let buffers;
  try {
    buffers = await Promise.all(list.map((t) => bufferOf(t.url)));
  } catch (e) {
    return toast(e.message, { tone: "crit" });
  }
  if (mix.pos >= mixLength() - 0.05) mix.pos = 0;
  from = mix.pos;
  started = ctx.currentTime + 0.05;
  nodes = list.map((t, i) => {
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    src.buffer = buffers[i];
    gain.gain.value = dbToGain(t.volume);
    src.connect(gain).connect(ctx.destination);
    const at = (t.offset || 0) - from;
    if (at >= 0) src.start(started + at);
    else if (-at < buffers[i].duration) src.start(started, -at);
    return { id: t.id, src, gain };
  });
  mix.playing = true;
  const tick = () => {
    if (!mix.playing) return;
    mix.pos = from + Math.max(0, ctx.currentTime - started);
    if (mix.pos >= mixLength()) return void ((mix.pos = 0), stopMix());
    place();
    raf = requestAnimationFrame(tick);
  };
  changed("utensils");
  raf = requestAnimationFrame(tick);
}
onPlaying(() => mix.playing && stopMix());

let place = () => {};
const seekTo = (t) => {
  const was = mix.playing;
  if (was) stop();
  mix.pos = clamp(t, 0, mixLength());
  place();
  if (was) startPlay();
};

// ---------------------------------------------------------------- rendering it

/** Sends the strip to the server and keeps the sound that comes back. */
export async function renderMix() {
  const tracks = mix.tracks.filter((t) => !t.mute);
  if (!tracks.length) return toast("Add a sound to the mix first.");
  stopMix();
  return trackJob({ tool: "au-mix", label: "Mix", credits: 0 }, async (set) => {
    const job = utensils.jobs.find((j) => j.tool === "au-mix" && j.status === "running");
    const made = await fxRun("mix", { tracks: mix.tracks.map((t) => ({ file: t.file, from: t.from, volume: t.volume, offset: t.offset, mute: t.mute })), master: mix.master, lufs: mix.lufs, fadeOut: mix.fadeOut, format: "mp3" }, set, (id) => job && (job.onCancel = () => fxStop(id)));
    return made.map((r) => asResult(r, `${tracks.length} ${tracks.length === 1 ? "sound" : "sounds"} mixed${mix.master ? ` · ${mix.lufs} LUFS` : ""}`));
  });
}

let registered = false;
/** The strip's tool, on the shelf (once): a mix is a result of it. */
export function registerMixTool() {
  if (registered) return;
  registered = true;
  registerTool({ id: "au-mix", workspace: "audio", name: "Mixing strip", icon: "tool-fx-mix", hint: "Lay sounds on a timeline, set their levels and render one sound", takes: ["audio"], verb: "Render the mix", ready: () => mix.tracks.some((t) => !t.mute), cost: () => 0, run: (_i, set) => renderMixJob(set) });
}
async function renderMixJob(set) {
  const made = await fxRun("mix", { tracks: mix.tracks.map((t) => ({ file: t.file, from: t.from, volume: t.volume, offset: t.offset, mute: t.mute })), master: mix.master, lufs: mix.lufs, fadeOut: mix.fadeOut, format: "mp3" }, set);
  return made.map((r) => asResult(r));
}

// ---------------------------------------------------------------- the strip

const ticksFor = (len) => (len <= 20 ? 2 : len <= 45 ? 5 : len <= 120 ? 10 : len <= 300 ? 30 : 60);
const dbText = (v) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)} dB`;
const bits = (id) => h("span.um-kind", {}, icon(id));
let library = null;
const sounds = async () => {
  library ??= await fetch("api/audio").then((r) => (r.ok ? r.json() : [])).catch(() => []);
  return Array.isArray(library) ? library : [];
};
const pickFile = (accept, fn) => {
  const input = h("input", { type: "file", accept, hidden: true, on: { change: () => (input.files[0] && fn(input.files[0]), input.remove()) } });
  document.body.append(input);
  input.click();
};

/** What changes the strip's drawing (the playhead's place is not here: it moves on its own). */
export const mixSig = () => JSON.stringify([mix.tracks, mix.master, mix.lufs, mix.fadeOut, mix.playing, utensils.jobs.some((j) => j.tool === "au-mix" && j.status === "running")]);

/**
 * The strip as a part of a card: made once and kept (a sound that plays is not stopped by a redraw). Answers { el, refresh } and
 * refresh() draws the tracks again from the state. The tracks' columns line up: labels, the timeline, the faders.
 */
export function createMixStrip() {
  registerMixTool();
  const labels = h("div.um-labels");
  const rulerEl = h("div.um-ruler");
  const head = h("i.um-head");
  const lanes = h("div.um-lanes");
  const faders = h("div.um-faders");
  const timeline = h("div.um-timeline", {}, rulerEl, lanes, head);
  const playKey = h("button.um-play", { type: "button", title: "Play the mix", "aria-label": "Play the mix", on: { click: () => startPlay() } });
  const stamp = h("span.um-time", {}, "0:00 / 0:00");
  const options = h("div.um-options");
  const pop = h("div.um-pop", { hidden: true });
  const addKey = h("button.ut-ghost.um-add", { type: "button", title: "Add a sound, or the sound of a clip", on: { click: (e) => (e.stopPropagation(), togglePop()) } }, icon("plus"), "Add a sound");
  const renderKey = h("button.ut-primary.um-render", { type: "button", title: "Mix the tracks into one sound", on: { click: () => renderMix() } }, sprite("tool-fx-mix"), h("span", {}, "Render the mix"));
  const el = h("div.um-strip", {}, h("div.um-top", {}, playKey, stamp, h("span.spacer"), options, h("div.um-popwrap", {}, addKey, pop), renderKey), h("div.um-grid", {}, labels, timeline, faders));
  let len = 8;

  place = () => {
    const f = clamp(mix.pos / len, 0, 1);
    head.style.left = `${f * 100}%`;
    stamp.textContent = `${clock(mix.pos, true)} / ${clock(len)}`;
    playKey.replaceChildren(mix.playing ? icon("pause") : sprite("tool-fx-play"));
    playKey.title = mix.playing ? "Pause" : "Play the mix";
    el.classList.toggle("is-playing", mix.playing);
  };
  const seekAt = (e) => {
    const r = timeline.getBoundingClientRect();
    seekTo(((e.clientX - r.left) / r.width) * len);
  };
  const drag = (e) => {
    if (e.target.closest(".um-clip")) return;
    seekAt(e);
    timeline.setPointerCapture(e.pointerId);
    const move = (ev) => seekAt(ev);
    timeline.addEventListener("pointermove", move);
    timeline.addEventListener("pointerup", () => timeline.removeEventListener("pointermove", move), { once: true });
  };
  rulerEl.addEventListener("pointerdown", drag);
  lanes.addEventListener("pointerdown", drag);

  // ---- the sounds to add
  const closePop = () => ((pop.hidden = true), document.removeEventListener("pointerdown", outside, true));
  const outside = (e) => !pop.contains(e.target) && e.target !== addKey && closePop();
  async function togglePop() {
    if (!pop.hidden) return closePop();
    if (mix.tracks.length >= MAX_TRACKS) return toast(`The strip holds ${MAX_TRACKS} tracks.`);
    pop.hidden = false;
    document.addEventListener("pointerdown", outside, true);
    pop.replaceChildren(h("p.ut-hint", {}, "Looking…"));
    const mine = utensils.results.filter((r) => (r.kind === "audio" || (r.kind === "video" && r.file)) && r.url).slice(0, 8).map((r) => ({ file: r.file, url: r.url, name: r.name ?? r.note ?? "Result", seconds: r.seconds, kind: r.kind, tag: r.kind === "video" ? "clip" : "result" }));
    const made = new Set(mine.map((m) => m.url));
    const lib = (await sounds()).filter((a) => !made.has(a.url)).slice(0, 10).map((a) => ({ file: a.file, url: a.url, name: a.name, seconds: a.seconds, kind: "audio", tag: a.kind ?? "sound" }));
    const row = (s) => h("button.um-pick", { type: "button", on: { click: () => (addTrack(s), closePop()) } }, h("b", {}, s.name), h("em", {}, `${s.tag} · ${clock(s.seconds ?? 0)}`), icon("plus"));
    pop.replaceChildren(...[
      h("button.um-pick.is-file", { type: "button", on: { click: () => pickFile("audio/*,video/*", async (f) => { try { const a = await api.uploadAudio(f); addTrack({ file: a.file, url: a.url, name: f.name.replace(/\.\w+$/, ""), seconds: a.seconds, kind: "audio" }); library = null; } catch (e) { toast(e.message, { tone: "crit" }); } closePop(); }) } }, h("b", {}, "From the computer"), h("em", {}, "a sound, or a video's sound"), icon("upload")),
      mine.length ? h("span.ut-label", {}, "Made here") : null, ...mine.map(row),
      lib.length ? h("span.ut-label", {}, "Library") : null, ...lib.map(row),
      !mine.length && !lib.length ? h("p.ut-hint", {}, "Nothing made yet: make a sound above, or add one from the computer.") : null,
    ].filter(Boolean));
  }

  // ---- drawing the tracks
  function dragClip(t, node, e) {
    if (e.button) return;
    const r = lanes.getBoundingClientRect();
    const keepLen = len;
    const from0 = t.offset || 0;
    const x0 = e.clientX;
    node.setPointerCapture(e.pointerId);
    node.classList.add("is-drag");
    const move = (ev) => {
      t.offset = Math.round(clamp(from0 + ((ev.clientX - x0) / r.width) * keepLen, 0, MAX_START) * 10) / 10;
      node.style.left = `${(t.offset / keepLen) * 100}%`;
      node.dataset.at = clock(t.offset, true);
    };
    node.addEventListener("pointermove", move);
    node.addEventListener("pointerup", () => {
      node.removeEventListener("pointermove", move);
      node.classList.remove("is-drag");
      if (mix.playing) seekTo(mix.pos);
      update();
    }, { once: true });
  }
  function refresh() {
    len = mixLength();
    // the ruler: a tick every few seconds
    const step = ticksFor(len);
    rulerEl.replaceChildren(...Array.from({ length: Math.floor(len / step) + 1 }, (_, k) => h("span.um-tick", { style: { left: `${((k * step) / len) * 100}%` } }, clock(k * step))));
    labels.replaceChildren(h("span.um-spacer"), ...mix.tracks.map((t, i) => h(`div.um-label${t.mute ? ".is-mute" : ""}`, { style: { "--tone": TONES[i % TONES.length] } }, bits(t.kind === "video" ? "film" : "sound"), h("b", { title: t.name }, t.name), h("em", {}, t.kind === "video" ? "a clip's sound" : clock(t.seconds)))));
    lanes.replaceChildren(...(mix.tracks.length ? mix.tracks.map((t, i) => {
      const canvas = h("canvas.um-peaks");
      const node = h(`div.um-clip${t.mute ? ".is-mute" : ""}`, { style: { left: `${((t.offset || 0) / len) * 100}%`, width: `${Math.max(1.2, ((t.seconds || 1) / len) * 100)}%`, "--tone": TONES[i % TONES.length] }, dataset: { at: clock(t.offset || 0, true) }, title: "Drag to change when it starts" }, canvas);
      node.addEventListener("pointerdown", (e) => dragClip(t, node, e));
      peaks(t.url, 120).then((list) => drawPeaks(canvas, list, { at: 1, lit: TONES[i % TONES.length], quiet: TONES[i % TONES.length] }));
      requestAnimationFrame(() => peaks(t.url, 120).then((list) => drawPeaks(canvas, list, { at: 1, lit: TONES[i % TONES.length] })));
      return h("div.um-lane", {}, node);
    }) : [h("div.um-empty", {}, "Add a sound: a sound effect, a voice, the music, or the sound of a clip. Drag each to when it should start.")]));
    faders.replaceChildren(h("span.um-spacer", {}, "Volume"), ...mix.tracks.map((t, i) => {
      const out = h("output.um-db", {}, dbText(t.volume));
      const input = h("input.uf-range.um-fader", { type: "range", min: -40, max: 12, step: 0.5, value: t.volume, "aria-label": `Volume of ${t.name}` });
      input.style.setProperty("--fill", `${((t.volume + 40) / 52) * 100}%`);
      input.addEventListener("input", () => {
        t.volume = Number(input.value);
        out.textContent = dbText(t.volume);
        input.style.setProperty("--fill", `${((t.volume + 40) / 52) * 100}%`);
        const live = nodes.find((n) => n.id === t.id);
        if (live) live.gain.gain.value = dbToGain(t.volume);
      });
      input.addEventListener("change", () => save());
      input.addEventListener("dblclick", () => ((t.volume = 0), update()));
      return h("div.um-fade", { style: { "--tone": TONES[i % TONES.length] } }, input, out,
        h("button.ut-iconkey.um-mute", { type: "button", "aria-pressed": String(t.mute), title: t.mute ? "Unmute" : "Mute", "aria-label": t.mute ? "Unmute" : "Mute", on: { click: () => ((t.mute = !t.mute), mix.playing && seekTo(mix.pos), update()) } }, icon(t.mute ? "mute" : "sound")),
        h("button.ut-iconkey.is-quiet.um-x", { type: "button", title: "Take it off the strip", "aria-label": "Take it off the strip", on: { click: () => removeTrack(t.id) } }, icon("close")));
    }));
    options.replaceChildren(...[
      switchKey("Master it", mix.master, (on) => ((mix.master = on), update()), "Bring the whole mix to a loudness: one steady gain, peaks kept under −1.5 dB"),
      mix.master ? chipRow([[-14, "−14"], [-16, "−16"], [-23, "−23"]], mix.lufs, (v) => ((mix.lufs = v), update()), "Loudness in LUFS") : null,
      h("span.um-sep"),
      h("span.ut-label", {}, "Fade out"),
      chipRow([[0, "None"], [1, "1 s"], [3, "3 s"]], mix.fadeOut, (v) => ((mix.fadeOut = v), update()), "How long the end fades")].filter(Boolean));
    renderKey.disabled = !mix.tracks.some((t) => !t.mute) || utensils.jobs.some((j) => j.tool === "au-mix" && j.status === "running");
    playKey.disabled = !mix.tracks.length;
    el.dataset.n = String(mix.tracks.length);
    place();
  }
  return { el, refresh };
}
