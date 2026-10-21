// Waveforms for the Audio workspace: the peaks of a sound (read with WebAudio, once per address), a compact row that plays it (a number,
// its waveform with a playhead, a play key, its length and the keys of what can be done with it), and one place that decides which
// sound is playing (starting one stops the one before). Sounds are decoded once and kept: the mixing strip plays from the same buffers.
import { h, icon, sprite } from "./dom.js";
import { clock } from "./utensils-fx-controls.js";

let context = null;
/** The page's audio context (made when first needed: a browser lets one start only after a press). */
export const audioContext = () => (context ??= new (window.AudioContext || window.webkitAudioContext)());

const buffers = new Map();
/** A sound decoded: the audio buffer of an address (a video's own sound too), kept. */
export function bufferOf(url) {
  if (!buffers.has(url)) {
    buffers.set(url, fetch(url).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error("That sound can't be loaded.")))).then((b) => audioContext().decodeAudioData(b)).catch((e) => (buffers.delete(url), Promise.reject(e))));
  }
  return buffers.get(url);
}

const peaksOf = new Map();
/** The peaks of a sound: `n` numbers from 0 to 1, one per slice of it (a quick read: every 24th sample of each slice). */
export function peaks(url, n = 160) {
  const key = `${url}#${n}`;
  if (!peaksOf.has(key)) {
    peaksOf.set(key, bufferOf(url).then((buf) => {
      const d = buf.getChannelData(0);
      const step = Math.max(1, Math.floor(d.length / n));
      let top = 0.001;
      const out = Array.from({ length: n }, (_, i) => {
        let m = 0;
        for (let k = i * step; k < Math.min(d.length, (i + 1) * step); k += 24) m = Math.max(m, Math.abs(d[k]));
        top = Math.max(top, m);
        return m;
      });
      return out.map((v) => v / top);
    }).catch(() => Array(n).fill(0.04)));
  }
  return peaksOf.get(key);
}

/** Draws peaks as bars on a canvas: the part before `at` (0 to 1) lit, the rest quiet. `beats` are lines (0 to 1) laid over it. */
export function drawPeaks(canvas, list, { at = 0, lit = "#F2FF59", quiet = "rgba(240, 239, 237, .34)", beats = [], down = [] } = {}) {
  const w = canvas.clientWidth || canvas.width;
  const hh = canvas.clientHeight || canvas.height;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(hh * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(hh * dpr);
  }
  const g = canvas.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, hh);
  const n = list.length;
  const bar = w / n;
  list.forEach((p, i) => {
    g.fillStyle = (i + 0.5) / n <= at ? lit : quiet;
    const bh = Math.max(2, p * hh * 0.88);
    g.fillRect(i * bar + bar * 0.18, (hh - bh) / 2, Math.max(1, bar * 0.64), bh);
  });
  beats.forEach((b, i) => {
    g.fillStyle = down.includes(i) ? "rgba(242, 255, 89, .75)" : "rgba(240, 239, 237, .28)";
    g.fillRect(Math.round(b * w), down.includes(i) ? 0 : hh * 0.18, 1, down.includes(i) ? hh : hh * 0.64);
  });
}

// ---- one sound plays at a time
const players = new Map();
let playing = null;
/** The element that plays an address (made once: a sound being heard is not made again at each redraw of the screen). */
function playerOf(url) {
  if (!players.has(url)) {
    const audio = new Audio();
    audio.preload = "metadata";
    audio.src = url;
    players.set(url, audio);
  }
  return players.get(url);
}
/** Stops whatever plays now (the mixing strip calls it when it starts). */
export function stopSounds() {
  playing?.pause();
  playing = null;
}
const listeners = new Set();
export const onPlaying = (fn) => (listeners.add(fn), () => listeners.delete(fn));

/**
 * A row for a sound: its number (or label), a play key, the waveform with the playhead (a press seeks), its length, and the keys
 * given as `keys` (nodes). Pressing play on one row stops the one that plays. Made again at each redraw but sound and peaks are kept.
 */
export function waveRow({ url, label, seconds, keys = [], tone = "#F2FF59", note }) {
  const audio = playerOf(url);
  const canvas = h("canvas.ua-wave", { "aria-label": `Waveform of ${label}` });
  const play = h("button.ua-play", { type: "button", title: "Play or pause", "aria-label": "Play or pause" }, sprite("tool-fx-play"));
  const time = h("span.ua-len", {}, clock(seconds ?? 0));
  let list = Array(160).fill(0.04);
  const at = () => (audio.duration ? audio.currentTime / audio.duration : 0);
  const draw = () => drawPeaks(canvas, list, { at: at(), lit: tone });
  const state = () => {
    play.replaceChildren(audio.paused ? sprite("tool-fx-play") : icon("pause"));
    row.classList.toggle("is-playing", !audio.paused);
  };
  const tick = () => {
    draw();
    time.textContent = audio.paused && !audio.currentTime ? clock(seconds ?? audio.duration ?? 0) : `${clock(audio.currentTime)} / ${clock(audio.duration || seconds || 0)}`;
    if (!audio.paused && row.isConnected) requestAnimationFrame(tick);
  };
  play.addEventListener("click", () => {
    if (!audio.paused) return audio.pause();
    if (playing && playing !== audio) playing.pause();
    playing = audio;
    listeners.forEach((fn) => fn());
    audio.play().catch(() => {});
  });
  const heard = () => (state(), requestAnimationFrame(tick));
  const rest = () => (state(), tick());
  audio.addEventListener("play", heard);
  audio.addEventListener("pause", rest);
  audio.addEventListener("ended", () => ((audio.currentTime = 0), rest()));
  canvas.addEventListener("pointerdown", (e) => {
    const r = canvas.getBoundingClientRect();
    if (audio.duration) audio.currentTime = ((e.clientX - r.left) / r.width) * audio.duration;
    tick();
  });
  const row = h("div.ua-row", {}, h("span.ua-num", {}, label), play, h("div.ua-wavebox", {}, canvas, note ? h("span.ua-note", {}, note) : null), time, h("div.ua-keys", {}, ...keys));
  peaks(url).then((p) => ((list = p), draw()));
  requestAnimationFrame(() => (state(), draw()));
  return row;
}
