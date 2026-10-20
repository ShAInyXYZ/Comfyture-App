// Beats: where the beat falls in a track. analyseBeats() reads samples (an onset curve, the tempo
// from how it repeats, the beats by tracking it); detectBeats() feeds it a track in the browser;
// parseBeats() reads beats someone typed or pasted (a tempo and an offset, or a list of times).
// The result is what an edit keeps in body.beats: { bpm, offset, times, down, source }.
// Pure functions apart from detectBeats, so the node tests run them on made-up music.

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const ms = (v) => Math.round(v * 1000) / 1000;

// ---------------------------------------------------------------- the beats an edit keeps

/** The beat times of a steady tempo: from the offset, a beat every 60/bpm seconds, up to a length. */
export function gridTimes(bpm, offset, length) {
  const step = 60 / clamp(Number(bpm) || 120, 30, 300);
  const out = [];
  for (let t = Number(offset) || 0; t <= length + step && out.length < 4000; t += step) out.push(ms(t));
  return out;
}

/** The beats of a tempo as an edit keeps them: the grid, its offset left at zero (the times carry it). */
export function gridBeats(bpm, offset, length, source = "grid") {
  return { bpm: ms(clamp(Number(bpm) || 120, 30, 300)), offset: 0, times: gridTimes(bpm, offset, length), down: 0, source };
}

/** Beat times (sorted, in range) as an edit keeps them, with a tempo from their spacing. */
export function beatsFromTimes(times, source = "import") {
  const t = [...new Set(times.map(Number).filter((v) => Number.isFinite(v) && v >= 0).map(ms))].sort((a, b) => a - b);
  const gaps = t.slice(1).map((v, i) => v - t[i]).sort((a, b) => a - b);
  const mid = gaps[Math.floor(gaps.length / 2)];
  return { bpm: mid ? ms(clamp(60 / mid, 30, 300)) : 120, offset: 0, times: t, down: 0, source };
}

/** A time written as seconds, "1.5s", "250ms", or "1:02.5". */
function secondsOf(word) {
  const w = word.trim().toLowerCase();
  let m;
  if ((m = /^(\d+):(\d+(?:\.\d+)?)$/.exec(w))) return Number(m[1]) * 60 + Number(m[2]);
  if ((m = /^(-?\d+(?:\.\d+)?)\s*ms$/.exec(w))) return Number(m[1]) / 1000;
  if ((m = /^(-?\d+(?:\.\d+)?)\s*s?$/.exec(w))) return Number(m[1]);
  return NaN;
}

/**
 * Beats someone typed or pasted: "128" or "128 bpm", "128 @ 0.35" (a tempo and where the first beat
 * is), a list of times ("0.5 1.0 1.5", one a line, "250ms"), or JSON ({ bpm, offset } or a list).
 * Answers { bpm, offset } (a grid: the caller makes its times), or { times }, or null.
 */
export function parseBeats(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return null;
  try {
    const j = JSON.parse(raw);
    if (Array.isArray(j)) return j.length ? { times: j.map(Number).filter(Number.isFinite) } : null;
    if (j && typeof j === "object") {
      if (Array.isArray(j.times ?? j.beats)) return { times: (j.times ?? j.beats).map(Number).filter(Number.isFinite), bpm: Number(j.bpm) || undefined };
      if (Number(j.bpm) > 0) return { bpm: Number(j.bpm), offset: Number(j.offset) || 0 };
    }
  } catch {}
  const tempo = /^(\d+(?:\.\d+)?)\s*(?:bpm)?\s*(?:(?:@|at|offset|\+)\s*(-?\d+(?:\.\d+)?\s*(?:ms|s)?))?\s*$/i.exec(raw);
  if (tempo && Number(tempo[1]) >= 30 && Number(tempo[1]) <= 300) {
    return { bpm: Number(tempo[1]), offset: tempo[2] ? secondsOf(tempo[2]) || 0 : 0 };
  }
  const words = raw.split(/[\s,;]+/).filter(Boolean);
  const times = words.map(secondsOf);
  return times.length && times.every(Number.isFinite) ? { times } : null;
}

/** The index of the beat nearest a time in a sorted list (-1 for none). */
export function nearestBeat(times, t) {
  if (!times.length) return -1;
  let lo = 0;
  let hi = times.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  return lo > 0 && Math.abs(times[lo - 1] - t) <= Math.abs(times[lo] - t) ? lo - 1 : lo;
}

// ---------------------------------------------------------------- listening

/** In place: a real FFT of a power-of-two length (re, im). */
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

const TIGHT = 400; // how closely the beats keep to the period (against the curve's pull)
const LEAD = 0.036; // seconds from a frame's start to the attack it heard, found by listening to made-up music
const N = 512; // the window of each spectrum, in samples of the lowered rate
const HOP = 128;
const BANDS = 32;

/**
 * The onset curve of a sound: how much new energy arrives, a frame at a time (a frame is HOP
 * samples at the rate returned), as the rise of each band's loudness, and the same for the lows alone.
 */
function onsets(x, sr) {
  // a lower rate, by averaging: a beat lives below a few kHz
  const k = Math.max(1, Math.round(sr / 11025));
  const rate = sr / k;
  const n = Math.floor(x.length / k);
  const y = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < k; j++) s += x[i * k + j];
    y[i] = s / k;
  }
  const win = new Float32Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  // log-spaced bands from 40 Hz up to the top
  const hz = (bin) => (bin * rate) / N;
  const top = N / 2;
  const edges = Array.from({ length: BANDS + 1 }, (_, b) => Math.min(top, Math.max(1, Math.round(((40 * Math.pow(rate / 2 / 40, b / BANDS)) * N) / rate))));
  const frames = Math.max(0, Math.floor((n - N) / HOP));
  const flux = new Float32Array(frames);
  const bass = new Float32Array(frames);
  let prev = new Float32Array(BANDS).fill(0);
  const re = new Float32Array(N);
  const im = new Float32Array(N);
  for (let f = 0; f < frames; f++) {
    for (let i = 0; i < N; i++) {
      re[i] = y[f * HOP + i] * win[i];
      im[i] = 0;
    }
    fft(re, im);
    const now = new Float32Array(BANDS);
    for (let b = 0; b < BANDS; b++) {
      let e = 0;
      for (let q = edges[b]; q <= Math.max(edges[b], edges[b + 1] - 1); q++) e += re[q] * re[q] + im[q] * im[q];
      now[b] = Math.log1p(1e4 * Math.sqrt(e));
    }
    let s = 0;
    let lows = 0;
    for (let b = 0; b < BANDS; b++) {
      const d = Math.max(0, now[b] - prev[b]);
      s += d;
      if (hz(edges[b]) < 160) lows += d;
    }
    flux[f] = s;
    bass[f] = lows;
    prev = now;
  }
  return { flux, bass, hop: HOP / rate };
}

/** A curve with its slow average taken off and kept above zero, in units of its own spread. */
function flatten(c, span) {
  const out = new Float32Array(c.length);
  let sum = 0;
  const half = Math.max(1, Math.round(span / 2));
  const acc = new Float64Array(c.length + 1);
  for (let i = 0; i < c.length; i++) acc[i + 1] = acc[i] + c[i];
  for (let i = 0; i < c.length; i++) {
    const a = Math.max(0, i - half);
    const b = Math.min(c.length, i + half + 1);
    out[i] = Math.max(0, c[i] - (acc[b] - acc[a]) / (b - a));
    sum += out[i] * out[i];
  }
  const sd = Math.sqrt(sum / Math.max(1, c.length)) || 1;
  for (let i = 0; i < out.length; i++) out[i] /= sd;
  return out;
}

/**
 * The beats of a sound: samples (mono, any rate) in, { bpm, times, down, confidence } out. The
 * tempo is the lag at which the onset curve best repeats (leaning towards what pop is played at, or
 * toward a tempo already known); the beats are then tracked through the curve, a steady tempo laid
 * as a straight grid, and the first beat of the bar is the one the lows land on most.
 */
export function analyseBeats(samples, rate, { bpm: hint = 0, min = 70, max = 180 } = {}) {
  const { flux, bass, hop } = onsets(samples, rate);
  if (flux.length < 40) return { bpm: hint || 120, times: [], down: 0, confidence: 0 };
  const O = flatten(flux, Math.round(1 / hop));
  const B = flatten(bass, Math.round(1 / hop));
  const frames = O.length;
  const seconds = (samples.length / rate);

  // the tempo: how well the curve repeats at each lag from `max` down to `min` bpm, leaning toward
  // what pop is played at (or a tempo already known)
  const lo = Math.floor(60 / max / hop);
  const hi = Math.ceil(60 / min / hop);
  const ac = new Float64Array(hi + 2);
  for (let lag = lo - 1; lag < ac.length; lag++) {
    let s = 0;
    for (let i = lag; i < frames; i += 1) s += O[i] * O[i - lag];
    ac[lag] = s / (frames - lag);
  }
  let best = lo;
  let bestScore = -Infinity;
  let mean = 0;
  for (let lag = lo; lag <= hi; lag++) {
    const bp = 60 / (lag * hop);
    const prior = hint > 0 ? Math.exp(-0.5 * Math.pow(Math.log2(bp / hint) / 0.08, 2)) : Math.exp(-0.5 * Math.pow(Math.log2(bp / 120) / 0.8, 2));
    const score = ac[lag] * prior;
    mean += ac[lag];
    if (score > bestScore) (bestScore = score), (best = lag);
  }
  mean /= hi - lo + 1;
  // between two lags: the peak of the parabola through them
  const a0 = ac[best - 1];
  const a1 = ac[best];
  const a2 = ac[best + 1];
  const shift = a0 - 2 * a1 + a2 !== 0 ? (0.5 * (a0 - a2)) / (a0 - 2 * a1 + a2) : 0;
  const period = best + clamp(shift, -0.5, 0.5);
  const confidence = clamp((a1 / (mean || 1) - 1) / 3, 0, 1);

  // the beats: a path through the curve that keeps near the period (dynamic programming)
  const C = new Float32Array(frames);
  const from = new Int32Array(frames).fill(-1);
  const tight = TIGHT;
  const short = Math.max(1, Math.round(period / 2));
  const long = Math.round(period * 2);
  for (let t = 0; t < frames; t++) {
    let top = -Infinity;
    let at = -1;
    for (let tau = short; tau <= long && tau <= t; tau++) {
      const v = C[t - tau] - tight * Math.pow(Math.log(tau / period), 2);
      if (v > top) (top = v), (at = t - tau);
    }
    C[t] = O[t] + (at >= 0 && top > 0 ? top : 0);
    from[t] = at >= 0 && top > 0 ? at : -1;
  }
  // it ends where the score is best in the last stretch
  let end = frames - 1;
  for (let t = Math.max(0, frames - Math.round(period)); t < frames; t++) if (C[t] > C[end]) end = t;
  const path = [];
  for (let t = end; t >= 0; t = from[t]) {
    path.push(t);
    if (from[t] < 0) break;
  }
  path.reverse();
  // the curve rises as an attack enters the window, a little before it lands: LEAD puts the beat where it was struck
  let times = path.map((f) => f * hop + LEAD);
  if (times.length < 4) return { bpm: ms(60 / (period * hop)), times: times.map(ms), down: 0, confidence };

  // a steady tempo is a straight line: beat k at a + b * k; the grid then runs the whole sound through
  const n = times.length;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  times.forEach((t, k) => ((sx += k), (sy += t), (sxx += k * k), (sxy += k * t)));
  const b = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  const a = (sy - b * sx) / n;
  const worst = Math.max(...times.map((t, k) => Math.abs(t - (a + b * k))));
  let regular = worst < 0.03 || worst < b * 0.12;
  if (regular) {
    const first = a - Math.floor(a / b) * b;
    times = [];
    for (let t = first; t <= seconds + 0.001; t += b) times.push(t);
  }
  const step = regular ? b : (times.at(-1) - times[0]) / (times.length - 1);
  // the first beat of a bar: of four phases, the one the lows land on most
  const scores = [0, 0, 0, 0];
  times.forEach((t, k) => {
    const f = clamp(Math.round((t - LEAD) / hop), 0, frames - 1);
    scores[k % 4] += Math.max(B[f], B[f - 1] ?? 0, B[f + 1] ?? 0);
  });
  const down = scores.indexOf(Math.max(...scores));
  return { bpm: ms(60 / step), times: times.map(ms), down, confidence, regular };
}

/**
 * The beats of a track in the browser: its sound (from `from`, for `length` seconds), decoded and
 * listened to, the times put on the edit's clock (the sound sits in the edit from `at`).
 * `hint` is a tempo already known (a made track's, or one heard elsewhere).
 */
export async function detectBeats(url, { from = 0, length = 0, at = 0, hint = 0 } = {}) {
  const bytes = await (await fetch(url)).arrayBuffer();
  const Ctx = window.OfflineAudioContext ?? window.webkitOfflineAudioContext;
  const audio = await new Ctx(1, 1, 22050).decodeAudioData(bytes);
  const left = audio.getChannelData(0);
  const right = audio.numberOfChannels > 1 ? audio.getChannelData(1) : null;
  const first = Math.floor(Math.max(0, from) * audio.sampleRate);
  const last = length > 0 ? Math.min(left.length, Math.floor((from + length) * audio.sampleRate)) : left.length;
  const mono = new Float32Array(Math.max(0, last - first));
  for (let i = 0; i < mono.length; i++) mono[i] = right ? (left[first + i] + right[first + i]) / 2 : left[first + i];
  const found = analyseBeats(mono, audio.sampleRate, { bpm: hint });
  return { ...found, times: found.times.map((t) => ms(t + at)) };
}

// ---------------------------------------------------------------- fixing a tempo that was heard wrong

/** Half the tempo: every other beat, from the first beat of a bar. */
export function halveBeats(b) {
  const keep = (k) => (((k - (b.down ?? 0)) % 2) + 2) % 2 === 0;
  const times = b.times.filter((_, k) => keep(k));
  return { ...b, bpm: ms(b.bpm / 2), times, down: Math.floor((b.down ?? 0) / 2) % 4 };
}
/** Twice the tempo: a beat between each two. */
export function doubleBeats(b) {
  const times = [];
  b.times.forEach((t, k) => {
    times.push(t);
    const next = b.times[k + 1] ?? t + (t - (b.times[k - 1] ?? t - 60 / (b.bpm || 120)));
    times.push(ms((t + next) / 2));
  });
  return { ...b, bpm: ms(b.bpm * 2), times, down: ((b.down ?? 0) * 2) % 4 };
}
