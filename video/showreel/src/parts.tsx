import React from 'react';
import {AbsoluteFill, staticFile} from 'remotion';
import {C, easeIn, easeOut, F, prog} from './lib';

/** A word that slides up out of a mask. */
export const Word: React.FC<{k: number; out: number; children: React.ReactNode; color?: string}> = ({k, out, children, color}) => (
  <span style={{display: 'inline-block', overflow: 'hidden', verticalAlign: 'bottom', padding: '0.06em 0.12em 0.14em', margin: '-0.06em 0 -0.14em'}}>
    <span
      style={{
        display: 'inline-block',
        color,
        transform: `translateY(${(1 - k + out) * 115}%) rotate(${(1 - k) * 6}deg)`,
        transformOrigin: '0% 100%',
      }}
    >
      {children}
    </span>
  </span>
);

export const Line: React.FC<{t: number; frame: number; words: (string | number)[][]; exit: number; size: number; weight: number; accent?: string}> = ({
  t, frame, words, exit, size, weight, accent,
}) => {
  const out = prog(t, exit, exit + 0.38, easeIn);
  if (out >= 1 || t < (words[0][1] as number) - 0.1) return null;
  return (
    <div style={{fontFamily: F.sans, fontSize: size, fontWeight: weight, letterSpacing: '-0.02em', color: C.text, textAlign: 'center', lineHeight: 1.05}}>
      {words.map(([w, at], i) => (
        <Word key={i} k={prog(t, (at as number) - 0.04, (at as number) + 0.5, easeOut)} out={out} color={w === accent ? C.accent : undefined}>
          {w}
        </Word>
      ))}
    </div>
  );
};

/** A logo drawn as a mask, so it can take any colour or gradient. */
export const Logo: React.FC<{src: string; w: number; h: number; paint: string; style?: React.CSSProperties}> = ({src, w, h, paint, style}) => (
  <div
    style={{
      position: 'absolute',
      width: w,
      height: h,
      background: paint,
      WebkitMaskImage: `url(${staticFile(src)})`,
      WebkitMaskSize: '100% 100%',
      WebkitMaskRepeat: 'no-repeat',
      ...style,
    }}
  />
);

export const Grain: React.FC<{frame: number}> = ({frame}) => (
  <AbsoluteFill style={{opacity: 0.075, mixBlendMode: 'overlay', pointerEvents: 'none'}}>
    <svg width="1920" height="1080">
      <filter id="grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed={Math.floor(frame / 2) % 97} />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="1920" height="1080" filter="url(#grain)" />
    </svg>
  </AbsoluteFill>
);

