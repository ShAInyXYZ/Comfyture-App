// What a sound looks like, decoded once and kept: its loudness along its length as bars (the waveform), and as a number for each
// half second (the energy the song's sections are found from, in jam-sections.js). Decoded by an offline context, which needs
// no sound card and is not one of the few a page may hold open. A sound that cannot be decoded answers null.
import { HOP } from "../jam-sections.js";

const RES = 720;
const cache = new Map();

/** { seconds, peaks (RES bars, 0 to 1), energy (a loudness for each HOP seconds) } of a sound, by its url; null when it cannot be read. */
export function analyse(url) {
  if (!cache.has(url)) {
    cache.set(url, fetch(url).then((r) => r.arrayBuffer()).then((buf) => new OfflineAudioContext(1, 1, 44100).decodeAudioData(buf)).then((a) => {
      const d = a.getChannelData(0);
      const step = Math.max(1, Math.floor(d.length / RES));
      const peaks = Array.from({ length: RES }, (_, i) => {
        let m = 0;
        for (let k = i * step; k < (i + 1) * step; k += 48) m = Math.max(m, Math.abs(d[k] ?? 0));
        return m;
      });
      const top = Math.max(...peaks, 0.001);
      const hop = Math.max(1, Math.round(a.sampleRate * HOP));
      const energy = Array.from({ length: Math.ceil(d.length / hop) }, (_, i) => {
        let s = 0;
        let n = 0;
        for (let k = i * hop; k < Math.min(d.length, (i + 1) * hop); k += 16, n++) s += d[k] * d[k];
        return n ? Math.sqrt(s / n) : 0;
      });
      return { seconds: a.duration, peaks: peaks.map((p) => p / top), energy };
    }).catch(() => null));
  }
  return cache.get(url);
}

/** A list of bars made n bars long (the loudest of the ones each covers). */
export function resample(peaks, n) {
  if (peaks.length === n) return peaks;
  return Array.from({ length: n }, (_, i) => {
    const a = Math.floor((i / n) * peaks.length);
    const z = Math.max(a + 1, Math.floor(((i + 1) / n) * peaks.length));
    let m = 0;
    for (let k = a; k < z; k++) m = Math.max(m, peaks[k] ?? 0);
    return m;
  });
}

/**
 * A waveform drawn mirrored on a canvas, as many bars as fit it. `color` is a colour or a function of the bar (its place from 0
 * to 1 and its index) and `dim` a function of the bar that answers true for the ones to draw faint. The canvas is sized to the
 * space it has, so it stays sharp.
 */
export function drawBars(canvas, peaks, { color = "#F2FF59", dim = null, bar = 3, gap = 1.5 } = {}) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.round(canvas.clientWidth * dpr);
  const hgt = Math.round(canvas.clientHeight * dpr);
  if (!w || !hgt) return;
  if (canvas.width !== w || canvas.height !== hgt) ((canvas.width = w), (canvas.height = hgt));
  const g = canvas.getContext("2d");
  g.clearRect(0, 0, w, hgt);
  const step = (bar + gap) * dpr;
  const n = Math.max(8, Math.floor(w / step));
  const bars = resample(peaks, n);
  bars.forEach((p, i) => {
    const at = i / n;
    g.globalAlpha = dim?.(at, i) ? 0.55 : 1;
    g.fillStyle = typeof color === "function" ? color(at, i) : color;
    const hh = Math.max(2 * dpr, p * hgt * 0.94);
    g.fillRect(i * step, (hgt - hh) / 2, bar * dpr, hh);
  });
  g.globalAlpha = 1;
}
