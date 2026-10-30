import React from 'react';
import {AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, staticFile, useCurrentFrame} from 'remotion';
import {C, easeIn, easeInOut, easeOut, F, FPS, HEAVY, POP, prog, rand, sp, TL} from './lib';
import {Grain, Logo} from './parts';
import {Face, Icon} from './S2Mixer';

// Section 5, the ending: Utensils (Truffle's shelf and the Library of official workflows) beside Kitchen
// (Ketkout — A Grand Entrance playing), then the end card.

const S = TL.s5;
const fr = (sec: number) => Math.round(sec * FPS);
const PETS = ['crumpet', 'praline', 'pickle', 'paprika', 'brioche', 'truffle', 'canelle', 'ketkout'];

const Chip: React.FC<{k: number; on?: boolean; children: React.ReactNode}> = ({k, on, children}) => (
  <div
    style={{
      padding: '9px 16px', borderRadius: 11, fontFamily: F.mono, fontSize: 17, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase',
      background: on ? 'rgba(242,255,89,0.12)' : C.s1, color: on ? C.accent : C.muted, border: `1px solid ${on ? 'rgba(242,255,89,0.45)' : C.line}`,
      transform: `scale(${k})`, opacity: Math.min(1, k * 2),
    }}
  >
    {children}
  </div>
);

export const S5Ending: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const inK = (i: number) => sp(frame, S.panels + i * 0.12, HEAVY);
  const focusKitchen = prog(t, S.kitchen - 0.2, S.kitchen + 0.3, easeInOut);
  const out = prog(t, S.card - 0.1, S.card + 0.4, easeIn);
  const cardK = prog(t, S.card + 0.1, S.card + 0.6, easeOut);
  const markK = sp(frame, S.card + 0.15, {damping: 11, stiffness: 190, mass: 0.8});

  const panel = (i: number) => {
    const k = inK(i);
    const dim = i === 0 ? focusKitchen : 1 - focusKitchen;
    return {
      opacity: Math.min(1, k * 1.5) * (1 - out),
      transform: `translateY(${(1 - k) * 60 + out * -40}px) scale(${1 - 0.04 * dim})`,
      filter: `brightness(${1 - 0.45 * dim})`,
    };
  };

  return (
    <AbsoluteFill style={{background: C.bg, overflow: 'hidden', fontFamily: F.sans, color: C.text}}>
      <AbsoluteFill style={{background: 'radial-gradient(ellipse 60% 55% at 50% 45%, rgba(242,255,89,0.05) 0%, rgba(242,255,89,0) 70%)'}} />

      {/* ——— Utensils ——— */}
      <div style={{position: 'absolute', left: 60, top: 205, width: 880, ...panel(0)}}>
        <div style={{display: 'flex', alignItems: 'center', gap: 16}}>
          <Face src="media/pets/truffle.webp" size={64} ring={C.accent} />
          <Icon id="utensils" size={34} color={C.text} />
          <span style={{fontSize: 52, fontWeight: 800, letterSpacing: '-0.02em'}}>Utensils</span>
          <span style={{marginLeft: 'auto', fontFamily: F.mono, fontSize: 16, letterSpacing: '0.2em', color: C.muted}}>TRUFFLE · SHELF KEEPER</span>
        </div>
        <div style={{marginTop: 20, width: 880, height: 495, borderRadius: 22, overflow: 'hidden', boxShadow: '0 30px 80px rgba(0,0,0,0.55)', border: `1px solid ${C.line}`}}>
          <Img
            src={staticFile('media/end/utensils-library.png')}
            style={{width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 38%', transform: `scale(${1.12 + 0.08 * prog(t, 0, S.card, (x) => x)}) translateX(${3 - 6 * prog(t, 0, S.card, (x) => x)}%)`}}
          />
        </div>
        <div style={{display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 22}}>
          {['Shelf', 'Audio', '3D model', 'Vector', 'Product & ads'].map((c, i) => <Chip key={c} k={sp(frame, 1.1 + i * 0.09, POP)}>{c}</Chip>)}
          <Chip k={sp(frame, S.library, POP)} on>Library · 708 workflows · 50 makers</Chip>
        </div>
      </div>

      {/* ——— Kitchen ——— */}
      <div style={{position: 'absolute', left: 980, top: 205, width: 880, ...panel(1)}}>
        <div style={{display: 'flex', alignItems: 'center', gap: 16}}>
          <Face src="media/pets/ketkout.webp" size={64} ring={C.accent} />
          <Icon id="kitchen" size={34} color={C.text} />
          <span style={{fontSize: 52, fontWeight: 800, letterSpacing: '-0.02em'}}>Kitchen</span>
          <span style={{marginLeft: 'auto', fontFamily: F.mono, fontSize: 16, letterSpacing: '0.2em', color: C.muted}}>KETKOUT · HEAD CHEF</span>
        </div>
        <div style={{position: 'relative', marginTop: 20, width: 880, height: 495, borderRadius: 22, overflow: 'hidden', background: '#000', boxShadow: '0 30px 80px rgba(0,0,0,0.55)', border: `1px solid ${C.line}`}}>
          <Sequence from={fr(S.panels)} layout="none">
            <OffthreadVideo src={staticFile('media/end/kitchen-grand-entrance.mp4')} muted playbackRate={2} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
          </Sequence>
          <div style={{position: 'absolute', left: 16, bottom: 14, padding: '6px 12px', borderRadius: 9, background: 'rgba(18,18,20,0.85)', fontFamily: F.mono, fontSize: 15, letterSpacing: '0.14em'}}>KETKOUT — A GRAND ENTRANCE</div>
        </div>
        <div style={{display: 'flex', alignItems: 'center', gap: 10, marginTop: 22}}>
          {['Story', 'Stage', 'Shots', 'Cut'].map((c, i) => (
            <React.Fragment key={c}>
              {i > 0 && <span style={{color: t >= S.chain[i] ? C.accent : C.line, fontSize: 22}}>→</span>}
              <Chip k={sp(frame, 1.3 + i * 0.09, POP)} on={t >= S.chain[i]}>{c}</Chip>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* ——— The end card ——— */}
      {t >= S.card && (
        <AbsoluteFill style={{opacity: cardK}}>
          <AbsoluteFill
            style={{
              background: `repeating-conic-gradient(from ${(t - S.card) * 7}deg at 50% 40%, rgba(242,255,89,0.06) 0deg 5deg, rgba(0,0,0,0) 5deg 15deg)`,
              WebkitMaskImage: 'radial-gradient(circle at 50% 40%, #000 0%, rgba(0,0,0,0) 60%)',
            }}
          />
          {(() => {
            const w = 1100;
            const h = (w * 1183) / 3579;
            return <Logo src="brand/wordmark.svg" w={w} h={h} paint={C.accent} style={{left: 960 - w / 2, top: 430 - h / 2, transform: `scale(${markK})`}} />;
          })()}
          {PETS.map((p, i) => {
            const k = sp(frame, S.card + 0.5 + i * 0.06, POP);
            const size = 96;
            const x0 = 960 - (PETS.length * size + (PETS.length - 1) * 20) / 2;
            return (
              <div key={p} style={{position: 'absolute', left: x0 + i * (size + 20), top: 640, width: size, height: size, borderRadius: '50%', overflow: 'hidden', border: `3px solid ${C.accent}`, background: '#fff', transform: `scale(${k})`}}>
                <Img src={staticFile(`media/pets/${p}.webp`)} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
              </div>
            );
          })}
          <div style={{position: 'absolute', left: 0, right: 0, top: 790, textAlign: 'center', opacity: prog(t, S.card + 0.9, S.card + 1.3, easeOut)}}>
            <div style={{fontFamily: F.mono, fontSize: 34, fontWeight: 600, letterSpacing: '0.06em'}}>github.com/ShAInyXYZ/Comfyture-App</div>
            <div style={{marginTop: 14, fontFamily: F.mono, fontSize: 26, fontWeight: 600, letterSpacing: '0.22em', color: C.muted}}>
              OPEN SOURCE · MIT · <span style={{color: C.accent}}>#OPENSOURCEHIGGSFIELD</span>
            </div>
          </div>
          {Array.from({length: 40}, (_, i) => {
            const a = rand(i + 0.7) * Math.PI * 2;
            const d = (240 + rand(i + 33) * 760) * prog(t, S.card + 0.15, S.card + 1.4, easeOut);
            const o = 1 - prog(t, S.card + 0.4 + rand(i + 5) * 0.4, S.card + 1.5, (x) => x);
            const s = 4 + rand(i + 61) * 9;
            return o > 0 ? <div key={i} style={{position: 'absolute', left: 960 + Math.cos(a) * d * 1.3 - s / 2, top: 430 + Math.sin(a) * d * 0.7 - s / 2, width: s, height: s, borderRadius: '50%', background: rand(i + 2) > 0.7 ? '#fff' : C.accent, opacity: o}} /> : null;
          })}
        </AbsoluteFill>
      )}

      <AbsoluteFill style={{background: 'radial-gradient(ellipse 85% 85% at 50% 50%, rgba(0,0,0,0) 60%, rgba(0,0,0,0.45) 100%)', pointerEvents: 'none'}} />
      <Grain frame={frame} />

      {/* ——— Sound ——— */}
      <Audio src={staticFile('audio/s2-bed.mp3')} loop volume={(f) => {
        const tt = f / FPS;
        return 0.16 * prog(tt, 0, 0.4, (x) => x) * (1 - prog(tt, S.card - 0.2, S.card + 0.3, (x) => x));
      }} />
      {S.vo.map((v, i) => (
        <Sequence key={i} from={fr(v.at)} durationInFrames={fr(v.to - v.from) + 2}>
          <Audio src={staticFile(v.src)} trimBefore={fr(v.from)} trimAfter={fr(v.to)} volume={1} />
        </Sequence>
      ))}
      <Sequence from={fr(S.library)} durationInFrames={fr(0.15)}><Audio src={staticFile('audio/s2-tick.mp3')} volume={0.35} /></Sequence>
      {S.chain.map((c, i) => (
        <Sequence key={i} from={fr(c)} durationInFrames={fr(0.15)}><Audio src={staticFile('audio/s2-tick.mp3')} volume={0.3} /></Sequence>
      ))}
      <Sequence from={fr(S.card - 0.1)} durationInFrames={fr(1.9)}><Audio src={staticFile('audio/sfx-whoosh.mp3')} volume={0.35} /></Sequence>
      <Sequence from={fr(S.card + 0.15)} durationInFrames={fr(1.1)}><Audio src={staticFile('audio/sfx-stamp.mp3')} volume={0.6} /></Sequence>
      <Sequence from={fr(S.card + 0.5)} durationInFrames={fr(0.9)}><Audio src={staticFile('audio/sfx-pops.mp3')} trimAfter={fr(0.86)} volume={0.4} /></Sequence>
      <Sequence from={fr(S.card)} durationInFrames={fr(S.end - S.card)}>
        <Audio src={staticFile('audio/sfx-jingle.mp3')} trimBefore={fr(0.6)} volume={(f) => 0.28 * (1 - prog(S.card + f / FPS, S.end - 0.6, S.end, (x) => x))} />
      </Sequence>
    </AbsoluteFill>
  );
};
