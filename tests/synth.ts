// Made-up music for the tests: a kick, a snare, hats and a bass line on a known tempo, so what
// the beat finder says can be held against where the beats really are. Deterministic.

export interface Song {
  samples: Float32Array;
  rate: number;
  /** Where the beats really fall, in seconds. */
  beats: number[];
  /** The index (in `beats`) of the first beat of a bar. */
  down: number;
}

/** A small seeded random generator, so the noise is the same every run. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296) * 2 - 1;
}

export function song({ bpm = 120, offset = 0, seconds = 24, rate = 22050, seed = 7, swing = 0, bars = true }: { bpm?: number; offset?: number; seconds?: number; rate?: number; seed?: number; swing?: number; bars?: boolean } = {}): Song {
  const out = new Float32Array(Math.floor(seconds * rate));
  const noise = rng(seed);
  const beat = 60 / bpm;
  const beats: number[] = [];
  const add = (at: number, len: number, f: (t: number) => number, gain: number) => {
    const first = Math.max(0, Math.floor(at * rate));
    const last = Math.min(out.length, Math.floor((at + len) * rate));
    for (let i = first; i < last; i++) out[i] += gain * f(i / rate - at);
  };
  let phase = 0;
  for (let k = 0; offset + k * beat < seconds; k++) {
    const t = offset + k * beat;
    beats.push(t);
    const bar = k % 4;
    // the kick: a sine falling from 160 to 45 Hz; the first beat of a bar the hardest
    const gain = bar === 0 ? 1 : bar === 2 ? 0.7 : 0;
    if (gain) {
      phase = 0;
      add(t, 0.22, (s) => {
        phase += (2 * Math.PI * (45 + 115 * Math.exp(-s / 0.03))) / rate;
        return Math.sin(phase) * Math.exp(-s / 0.09);
      }, 0.9 * gain);
    }
    // the snare on the second and the fourth: noise and a tone
    if (bar === 1 || bar === 3) add(t, 0.16, (s) => (noise() * 0.8 + Math.sin(2 * Math.PI * 190 * s) * 0.5) * Math.exp(-s / 0.05), 0.55);
    // hats on the off-beats (late with swing)
    add(t + beat * (0.5 + swing), 0.05, (s) => (noise() - 0.6 * noise()) * Math.exp(-s / 0.012), 0.25);
    // the bass: one long note a bar, the pitch changing on its first beat
    if (bar === 0 && bars) {
      const f = [55, 55, 65.4, 73.4][Math.floor(k / 4) % 4];
      add(t, beat * 4, (s) => Math.sin(2 * Math.PI * f * s) * (s < 0.01 ? s / 0.01 : 1) * (s > beat * 4 - 0.05 ? 0 : 0.6), 0.3);
    }
  }
  // a soft pad that never attacks, so the notes do not give the beats away
  for (let i = 0; i < out.length; i++) out[i] += 0.05 * Math.sin((2 * Math.PI * 330 * i) / rate) + 0.03 * Math.sin((2 * Math.PI * 494 * i) / rate);
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  for (let i = 0; i < out.length; i++) out[i] = (out[i] / peak) * 0.9;
  return { samples: out, rate, beats, down: 0 };
}

/** A song as a 16-bit mono WAV, for a file the editor can load. */
export function wav(s: Song): Buffer {
  const n = s.samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(s.rate, 24);
  buf.writeUInt32LE(s.rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s.samples[i])) * 32767), 44 + i * 2);
  return buf;
}
