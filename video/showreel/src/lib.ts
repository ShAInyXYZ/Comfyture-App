import {Easing, spring, SpringConfig} from 'remotion';
import timeline from '../timeline.json';

export const TL = timeline;
export const FPS = TL.fps;
export const W = TL.width;
export const H = TL.height;

// Comfyture's own tokens (web/css/material.css).
export const C = {
  bg: '#121214',
  s1: '#19191c',
  s2: '#212125',
  line: '#2a2a2f',
  text: '#f2f1ee',
  muted: '#a7a6ac',
  accent: '#f2ff59',
  ink: '#141414',
  stampRed: '#e3322b',
};

export const F = {
  sans: '"Manrope", system-ui, sans-serif',
  mono: '"IBM Plex Mono", ui-monospace, monospace',
};

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

export const easeInOut = Easing.bezier(0.65, 0, 0.35, 1);
export const easeOut = Easing.bezier(0.16, 1, 0.3, 1);
export const easeIn = Easing.bezier(0.6, 0, 0.9, 0.35);

export const prog = (t: number, t0: number, t1: number, ease: (x: number) => number = easeInOut) =>
  ease(clamp01((t - t0) / (t1 - t0)));

export const sp = (frame: number, startSec: number, config: Partial<SpringConfig> = {}) => {
  const fr = frame - startSec * FPS;
  if (fr <= 0) return 0;
  return spring({frame: fr, fps: FPS, config: {damping: 14, mass: 0.8, stiffness: 140, ...config}});
};

export const POP: Partial<SpringConfig> = {damping: 10, stiffness: 220, mass: 0.7};
export const HEAVY: Partial<SpringConfig> = {damping: 17, stiffness: 180, mass: 0.8};
export const ELASTIC: Partial<SpringConfig> = {damping: 8, stiffness: 200, mass: 0.8};

/** Deterministic pseudo-random in [0,1). */
export const rand = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** A quick 0→1→0 bump between t0 and t0+len. */
export const bump = (t: number, t0: number, len: number) => {
  const k = (t - t0) / len;
  return k <= 0 || k >= 1 ? 0 : Math.sin(Math.PI * k);
};
