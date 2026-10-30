import React from 'react';
import {AbsoluteFill, Audio, Freeze, Img, OffthreadVideo, Sequence, staticFile, useCurrentFrame} from 'remotion';
import {bump, C, clamp01, easeIn, easeInOut, easeOut, F, FPS, HEAVY, lerp, POP, prog, rand, sp, TL} from './lib';
import {Grain, Line, Logo} from './parts';

// Section 2, "Mixer": every tab is a studio with its own pet; in Mixer we ask Praline to swap Ivy for Moon in
// Tell Me Without Telling Me, with guitars as the theme, and the finished version plays.

const S = TL.s2;
const fr = (sec: number) => Math.round(sec * FPS);
const CX = 960;

export const TABS = [
  {id: 'kitchen', name: 'Kitchen', craft: 'Films', pet: 'ketkout', petName: 'Ketkout', tag: 'head chef'},
  {id: 'mixer', name: 'Mixer', craft: 'Trends', pet: 'praline', petName: 'Praline', tag: 'trend boss'},
  {id: 'jam', name: 'Jam', craft: 'Music videos', pet: 'pickle', petName: 'Pickle', tag: 'band leader'},
  {id: 'macaron', name: 'Macaron', craft: 'Brand posts', pet: 'brioche', petName: 'Brioche', tag: 'brand room'},
  {id: 'spice', name: 'Spice', craft: 'VFX', pet: 'paprika', petName: 'Paprika', tag: 'VFX house'},
  {id: 'toaster', name: 'Toaster', craft: '3D sets', pet: 'crumpet', petName: 'Crumpet', tag: 'model maker'},
  {id: 'cabinet', name: 'Cabinet', craft: 'Outfits & poses', pet: 'canelle', petName: 'Canelle', tag: 'stylist'},
  {id: 'utensils', name: 'Utensils', craft: 'One-job tools', pet: 'truffle', petName: 'Truffle', tag: 'shelf keeper'},
];
const MIXER = 1;

// Scene A: one card per tab.
const CARD_W = 205;
const CARD_H = 320;
const CARD_GAP = 20;
const CARD_X0 = (1920 - (TABS.length * CARD_W + (TABS.length - 1) * CARD_GAP)) / 2;
const CARD_Y = 452;

// The app's header, which the cards fold into.
export const HEAD_H = 72;
const TAB_X0 = 220;
export const tabW = (name: string) => 24 + 10 + name.length * 11.4 + 34;
export const TAB_POS = TABS.reduce<number[]>((acc, t, i) => [...acc, i === 0 ? TAB_X0 : acc[i - 1] + tabW(TABS[i - 1].name) + 6], []);

// Scene B: the trend shelf, then the trend open with its player.
const SHELF = ['we-listen', 'uno-car-reveal', 'tiny-desk', 'my-reaction', 'talking-about-me', 'getting-robbed', 'ghost-photoshoot'];
const SHELF_INFO: Record<string, [string, number, string[]]> = {
  'we-listen': ['We Listen, We Don’t Judge', 20, ['earl', 'josie']],
  'uno-car-reveal': ['UNO Car Reveal', 8, ['dre']],
  'tiny-desk': ['Tiny Desk', 10, ['margot', 'theo']],
  'my-reaction': ['Tell Me Without Telling Me', 10, ['ivy']],
  'talking-about-me': ['You Talking About Me?', 10, ['dre', 'theo', 'earl']],
  'getting-robbed': ['Getting Robbed, But First…', 10, ['josie', 'dre']],
  'ghost-photoshoot': ['Ghost Photoshoot', 10, ['josie', 'ivy']],
};
const PICK = 3;
const SH_W = 250;
const SH_H = 444;
const SH_X0 = 72;
const SH_Y = 196;
const PL = {x: 110, y: 110, w: 450, h: 800}; // the player
const RP = {x: 640, w: 1200}; // the right panel
const BEATS = [
  {from: 0, to: 3, a: 'Lead admits: I think I have a small ', b: ' problem.'},
  {from: 3, to: 7, a: 'A slow zoom-out reveals a room overflowing with ', b: 's.'},
  {from: 7, to: 10, a: 'Hold the wide shot. A sheepish smile: Oopsie.', b: ''},
];

// Scene C: Praline's bar and her answer.
const BAR = {x: 610, y: 916, w: 880, h: 124};
const TICKS = ['Opened the trend', 'Lead: Moon', 'Theme: guitar', 'Frames drafted'];

export const Face: React.FC<{src: string; size: number; ring?: string; style?: React.CSSProperties}> = ({src, size, ring, style}) => (
  <div style={{width: size, height: size, borderRadius: '50%', overflow: 'hidden', background: '#fff', flex: 'none', boxShadow: ring ? `0 0 0 3px ${ring}` : undefined, ...style}}>
    <Img src={staticFile(src)} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
  </div>
);

export const Icon: React.FC<{id: string; size: number; color: string}> = ({id, size, color}) => (
  <div style={{width: size, height: size, flex: 'none', background: color, WebkitMaskImage: `url(${staticFile(`brand/icons/product-${id}.svg`)})`, WebkitMaskSize: '100% 100%'}} />
);

/** Two values rolling over each other: k=0 shows a, k=1 shows b. */
const Roll: React.FC<{a: React.ReactNode; b: React.ReactNode; k: number}> = ({a, b, k}) => (
  <span style={{display: 'inline-grid', overflow: 'hidden', verticalAlign: 'bottom'}}>
    <span style={{gridArea: '1 / 1', transform: `translateY(${-k * 100}%)`, opacity: 1 - k}}>{a}</span>
    <span style={{gridArea: '1 / 1', transform: `translateY(${(1 - k) * 100}%)`, opacity: k}}>{b}</span>
  </span>
);

/** A clip that waits on its first frame, plays [start, end] of the timeline with its sound, then holds its last frame. */
const Clip: React.FC<{t: number; src: string; start: number; end: number; rate?: number; mute?: boolean}> = ({t, src, start, end, rate = 1, mute}) => {
  const style: React.CSSProperties = {width: '100%', height: '100%', objectFit: 'cover'};
  const file = staticFile(src);
  if (t < start) return <Freeze frame={0}><OffthreadVideo src={file} muted style={style} /></Freeze>;
  if (t >= end) return <Freeze frame={fr(end - start) - 1}><OffthreadVideo src={file} muted playbackRate={rate} style={style} /></Freeze>;
  return (
    <Sequence from={fr(start)} layout="none">
      <OffthreadVideo src={file} style={style} playbackRate={rate} muted={mute} volume={(f) => 1 - prog(f / FPS, end - start - 0.3, end - start, (x) => x)} />
    </Sequence>
  );
};

export const S2Mixer: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / FPS;

  // ——— Scene A: cards, crafts, pets, then the fold into the header ———
  const cardIn = (i: number) => sp(frame, S.cards + i * 0.07, {damping: 15, stiffness: 170, mass: 0.7});
  const fold = (i: number) => prog(t, S.collapse + i * 0.035, S.collapse + 0.62 + i * 0.035, easeInOut);
  const headerIn = prog(t, S.collapse + 0.25, S.collapse + 0.75, easeOut);
  const mixerLit = prog(t, S.mixerOn - 0.05, S.mixerOn + 0.2, easeOut);

  // ——— Scene B ———
  const shelfOut = prog(t, S.open, S.open + 0.35, easeIn);
  const opened = sp(frame, S.open, HEAVY);
  const panelIn = (d: number) => prog(t, S.open + 0.25 + d, S.open + 0.85 + d, easeOut);

  // ——— Scene C: chat, push-in, press, magic ———
  const push = prog(t, S.ivy[1] - 0.2, S.ivy[1] + 0.6, easeInOut) * (1 - prog(t, S.magic, S.magic + 0.8, easeInOut));
  const camScale = 1 + 0.1 * push;
  const barIn = prog(t, S.chatIn, S.chatIn + 0.5, easeOut);
  const chatOut = prog(t, S.magic + 0.15, S.magic + 0.55, easeIn);
  const flip = Math.PI * prog(t, S.magic + 0.05, S.magic + 0.55, easeInOut);
  const swapK = prog(t, S.magic + 0.3, S.magic + 0.75, easeInOut);

  // ——— Scene E: side by side ———
  const cmp = prog(t, S.compare, S.compare + 0.8, easeInOut);
  const leftIn = sp(frame, S.compare + 0.1, HEAVY);

  const typed = Math.max(0, Math.min(S.message.length, Math.floor((t - S.typing) / 0.03)));
  const sent = t >= S.send + 0.05;
  const msgText = S.message.slice(0, typed);

  // Player rect: card → player, then to the right half of the comparison.
  const shelfX = (i: number) => SH_X0 + i * (SH_W + 20);
  const P = {
    x: lerp(lerp(shelfX(PICK), PL.x, opened), 1010, cmp),
    y: lerp(lerp(SH_Y, PL.y, opened), 196, cmp),
    w: lerp(lerp(SH_W, PL.w, opened), 405, cmp),
    h: lerp(lerp(SH_H, PL.h, opened), 720, cmp),
  };
  const beatClock = t >= S.moon[0] - 0.5 ? clamp01((t - S.moon[0]) / 10) * 10 : clamp01(((t - S.ivy[0]) * S.ivyRate) / 10) * 10;
  const ivyShown = flip < Math.PI / 2;

  return (
    <AbsoluteFill style={{background: C.bg, overflow: 'hidden', fontFamily: F.sans, color: C.text}}>
      {/* Faint glow so the dark is not flat. */}
      <AbsoluteFill style={{background: 'radial-gradient(ellipse 60% 55% at 50% 45%, rgba(242,255,89,0.05) 0%, rgba(242,255,89,0) 70%)'}} />

      {/* ——— Scene A ——— */}
      {t < S.collapse + 1.0 && (
        <>
          <div style={{position: 'absolute', left: 0, right: 0, top: 236}}>
            <Line t={t} frame={frame} words={S.title1.words} exit={S.title1.exit} size={92} weight={800} accent="Comfyture" />
          </div>
          <div style={{position: 'absolute', left: 0, right: 0, top: 236}}>
            <Line t={t} frame={frame} words={S.title2.words} exit={S.title2.exit} size={92} weight={800} accent="pet." />
          </div>
          {TABS.map((tab, i) => {
            const k = cardIn(i);
            if (k <= 0) return null;
            const f = fold(i);
            const x0 = CARD_X0 + i * (CARD_W + CARD_GAP);
            const tx = TAB_POS[i];
            const tw = tabW(tab.name);
            const x = lerp(x0, tx, f);
            const y = lerp(CARD_Y + (1 - k) * 140, (HEAD_H - 48) / 2, f);
            const w = lerp(CARD_W, tw, f);
            const h = lerp(CARD_H, 48, f);
            const inner = 1 - prog(f, 0, 0.45, (v) => v);
            const craftK = prog(t, S.crafts + i * 0.06, S.crafts + i * 0.06 + 0.4, easeOut);
            const petK = sp(frame, S.pets + S.petPops[i] - 0.03, POP);
            if (f >= 1) return null;
            return (
              <div
                key={tab.id}
                style={{
                  position: 'absolute', left: x, top: y, width: w, height: h, borderRadius: lerp(26, 12, f),
                  background: `rgba(25,25,28,${1 - f})`, border: `1px solid rgba(255,255,255,${0.08 * (1 - f)})`,
                  opacity: Math.min(1, k * 1.4), overflow: 'hidden',
                  boxShadow: `0 24px 60px rgba(0,0,0,${0.45 * (1 - f)})`,
                }}
              >
                <div style={{opacity: inner, position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
                  <div style={{marginTop: 30, width: 120, height: 120, position: 'relative'}}>
                    <div style={{position: 'absolute', inset: 0, borderRadius: '50%', border: '2px dashed rgba(255,255,255,0.14)', opacity: 1 - petK}} />
                    <div style={{position: 'absolute', inset: 0, transform: `scale(${petK}) rotate(${(1 - petK) * -30}deg)`}}>
                      <Face src={`media/pets/${tab.pet}.webp`} size={120} ring={i === MIXER ? C.accent : 'rgba(255,255,255,0.18)'} />
                    </div>
                  </div>
                  <div style={{marginTop: 20, display: 'flex', alignItems: 'center', gap: 10}}>
                    <Icon id={tab.id} size={28} color={C.text} />
                    <span style={{fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em'}}>{tab.name}</span>
                  </div>
                  <div style={{marginTop: 10, fontFamily: F.mono, fontWeight: 600, fontSize: 14, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.accent, opacity: craftK, transform: `translateY(${(1 - craftK) * 10}px)`}}>
                    {tab.craft}
                  </div>
                  <div style={{marginTop: 12, fontSize: 17, fontWeight: 600, color: C.muted, opacity: petK > 0.5 ? 1 : 0}}>
                    {tab.petName} · {tab.tag}
                  </div>
                </div>
              </div>
            );
          })}
        </>
      )}

      {/* Everything from the header down sits under one camera that pushes toward the chat. */}
      <AbsoluteFill style={{transform: `scale(${camScale})`, transformOrigin: `${CX}px 900px`, opacity: 1 - 0 * cmp}}>
        {/* ——— Header ——— */}
        {t >= S.collapse && (
          <div style={{position: 'absolute', left: 0, top: 0, width: 1920, height: HEAD_H, opacity: 1 - cmp}}>
            <div style={{position: 'absolute', inset: 0, background: C.bg, borderBottom: `1px solid ${C.line}`, opacity: headerIn}} />
            <Logo src="brand/wordmark.svg" w={150} h={(150 * 1183) / 3579} paint={C.accent} style={{left: 34 - (1 - headerIn) * 30, top: (HEAD_H - (150 * 1183) / 3579) / 2, opacity: headerIn}} />
            {TABS.map((tab, i) => {
              const on = prog(fold(i), 0.55, 1, (v) => v);
              const lit = i === MIXER ? mixerLit : 0;
              const pulse = i === MIXER ? 1 + 0.08 * bump(t, S.mixerOn, 0.3) : 1;
              const color = lit > 0.5 ? C.accent : C.text;
              return (
                <div
                  key={tab.id}
                  style={{
                    position: 'absolute', left: TAB_POS[i], top: (HEAD_H - 48) / 2, width: tabW(tab.name), height: 48, borderRadius: 12,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: on,
                    background: `rgba(242,255,89,${0.12 * lit})`, transform: `scale(${pulse})`,
                  }}
                >
                  <Icon id={tab.id} size={24} color={color} />
                  <span style={{fontSize: 20, fontWeight: lit > 0.5 ? 700 : 500, color}}>{tab.name}</span>
                  <div style={{position: 'absolute', left: 12, right: 12, bottom: -12, height: 3, borderRadius: 3, background: C.accent, transform: `scaleX(${lit})`}} />
                </div>
              );
            })}
          </div>
        )}

        {/* ——— Scene B: the shelf ——— */}
        {t >= S.shelf - 0.1 && shelfOut < 1 && (
          <>
            <div style={{position: 'absolute', left: SH_X0, top: 104, display: 'flex', alignItems: 'baseline', gap: 22, opacity: prog(t, S.shelf, S.shelf + 0.4, easeOut) * (1 - shelfOut)}}>
              <span style={{fontSize: 54, fontWeight: 800, letterSpacing: '-0.02em'}}>TRENDING NOW</span>
              <span style={{fontSize: 24, color: C.muted}}>Viral trends, made yours.</span>
            </div>
            {SHELF.map((id, i) => {
              if (i === PICK && t >= S.open) return null;
              const k = sp(frame, S.shelf + i * 0.07, {damping: 16, stiffness: 160, mass: 0.7});
              const [name, secs, crew] = SHELF_INFO[id];
              const picked = i === PICK ? prog(t, S.pick, S.pick + 0.2, easeOut) : 0;
              const dimmed = i !== PICK ? prog(t, S.pick, S.pick + 0.3) : 0;
              return (
                <div
                  key={id}
                  style={{
                    position: 'absolute', left: shelfX(i) + (1 - k) * 500 - shelfOut * 200, top: SH_Y, width: SH_W, height: SH_H, borderRadius: 22, overflow: 'hidden',
                    opacity: Math.min(1, k * 1.5) * (1 - shelfOut) * (1 - 0.55 * dimmed),
                    boxShadow: picked > 0 ? `0 0 0 4px ${C.accent}, 0 20px 50px rgba(0,0,0,0.5)` : '0 16px 40px rgba(0,0,0,0.4)',
                    transform: `scale(${1 + 0.04 * picked + 0.04 * bump(t, S.pick, 0.3)})`,
                  }}
                >
                  <Img src={staticFile(`media/tiles/${id}.webp`)} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
                  <div style={{position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0) 55%, rgba(0,0,0,0.75) 100%)'}} />
                  <div style={{position: 'absolute', left: 14, top: 14, padding: '4px 10px', borderRadius: 8, background: 'rgba(0,0,0,0.55)', fontFamily: F.mono, fontSize: 16, fontWeight: 600}}>
                    0:{String(secs).padStart(2, '0')}
                  </div>
                  <div style={{position: 'absolute', left: 16, right: 14, bottom: 58, fontSize: 24, fontWeight: 800, lineHeight: 1.05, textTransform: 'uppercase', letterSpacing: '-0.01em'}}>{name}</div>
                  <div style={{position: 'absolute', left: 16, bottom: 16, display: 'flex'}}>
                    {crew.map((c, j) => <Face key={c} src={`media/crew/${c}-face.webp`} size={32} ring="rgba(0,0,0,0.6)" style={{marginLeft: j ? -8 : 0}} />)}
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* ——— The player: Ivy's trend, then (after the flip) Moon's version ——— */}
        {t >= S.open && (
          <div
            style={{
              position: 'absolute', left: P.x, top: P.y, width: P.w, height: P.h, borderRadius: lerp(22, 28, opened), overflow: 'hidden',
              boxShadow: `0 0 0 ${t < S.open + 0.4 ? 4 * (1 - opened) : 0}px ${C.accent}, 0 30px 80px rgba(0,0,0,0.55)`,
              transform: `scaleX(${Math.abs(Math.cos(flip))})`,
              background: '#000',
            }}
          >
            {ivyShown ? (
              <Clip t={t} src="media/ivy-plant-problem.mp4" start={S.ivy[0]} end={S.ivy[1]} rate={S.ivyRate} mute />
            ) : (
              <Clip t={t} src="media/moon-guitar-problem.mp4" start={S.moon[0]} end={S.moon[1]} />
            )}
            {/* Shimmer across the clip on the press. */}
            {t >= S.magic && t < S.magic + 0.6 && (() => {
              const k = prog(t, S.magic, S.magic + 0.5, easeInOut);
              return <div style={{position: 'absolute', inset: 0, background: `linear-gradient(115deg, rgba(255,255,255,0) ${k * 160 - 50}%, rgba(255,255,255,0.85) ${k * 160 - 30}%, rgba(255,255,255,0) ${k * 160 - 10}%)`}} />;
            })()}
          </div>
        )}
        {/* Sparks and a ring out of the player on the press. */}
        {t >= S.magic && t < S.magic + 1.4 && (
          <>
            {Array.from({length: 40}, (_, i) => {
              const a = rand(i + 1.3) * Math.PI * 2;
              const d = (120 + rand(i + 50) * 520) * prog(t, S.magic, S.magic + 1.1, easeOut);
              const o = 1 - prog(t, S.magic + 0.3 + rand(i + 7) * 0.3, S.magic + 1.3, (x) => x);
              const s = 5 + rand(i + 70) * 9;
              const cx = PL.x + PL.w / 2;
              const cy = PL.y + PL.h / 2;
              return <div key={i} style={{position: 'absolute', left: cx + Math.cos(a) * d - s / 2, top: cy + Math.sin(a) * d * 1.3 - s / 2, width: s, height: s, borderRadius: rand(i) > 0.7 ? 2 : '50%', background: rand(i + 21) > 0.7 ? '#fff' : C.accent, opacity: o}} />;
            })}
            {(() => {
              const k = prog(t, S.magic, S.magic + 0.7, easeOut);
              const r = 120 + 700 * k;
              return <div style={{position: 'absolute', left: PL.x + PL.w / 2 - r, top: PL.y + PL.h / 2 - r, width: 2 * r, height: 2 * r, borderRadius: '50%', border: `${10 * (1 - k) + 1}px solid ${C.accent}`, opacity: 1 - k}} />;
            })()}
          </>
        )}

        {/* ——— The trend recipe, right of the player ——— */}
        {t >= S.open + 0.2 && (
          <div style={{position: 'absolute', left: RP.x, top: 0, width: RP.w, opacity: 1 - cmp}}>
            <div style={{position: 'absolute', top: 118, fontFamily: F.mono, fontSize: 16, fontWeight: 600, letterSpacing: '0.22em', color: C.muted, opacity: panelIn(0)}}>TREND RECIPE</div>
            <div style={{position: 'absolute', top: 146, fontSize: 64, fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1, whiteSpace: 'nowrap', opacity: panelIn(0.05), transform: `translateY(${(1 - panelIn(0.05)) * 20}px)`}}>
              TELL ME WITHOUT TELLING ME
            </div>
            <div style={{position: 'absolute', top: 230, display: 'flex', alignItems: 'center', gap: 16, opacity: panelIn(0.1)}}>
              <span style={{fontFamily: F.mono, fontSize: 22, color: C.muted}}>10 s · Reactions</span>
              <span style={{padding: '5px 14px', borderRadius: 9, background: 'rgba(242,255,89,0.12)', color: C.accent, fontSize: 19, fontWeight: 600}}>Own sound · LTX-2.5</span>
            </div>
            <div style={{position: 'absolute', top: 292, display: 'flex', gap: 12, width: RP.w, opacity: panelIn(0.15)}}>
              {BEATS.map((b, i) => {
                const fill = clamp01((beatClock - b.from) / (b.to - b.from));
                return (
                  <div key={i} style={{flex: b.to - b.from}}>
                    <div style={{height: 6, borderRadius: 3, background: C.line, overflow: 'hidden'}}>
                      <div style={{height: '100%', width: `${fill * 100}%`, background: C.accent}} />
                    </div>
                    <div style={{marginTop: 12, fontFamily: F.mono, fontSize: 18, color: C.text}}>{b.from}–{b.to} s</div>
                    <div style={{marginTop: 6, fontSize: 20, lineHeight: 1.3, color: C.muted, paddingRight: 18}}>
                      {b.a}
                      {b.b && (swapK < 0.5 ? <span style={{opacity: 1 - 2 * swapK}}>plant</span> : <span style={{color: C.accent, opacity: 2 * swapK - 1}}>guitar</span>)}
                      {b.b}
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{position: 'absolute', top: 440, display: 'flex', gap: 18, opacity: panelIn(0.2)}}>
              <div style={{width: 380, height: 96, borderRadius: 20, background: C.s1, border: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', gap: 18, padding: '0 18px', boxSizing: 'border-box'}}>
                <div style={{position: 'relative', width: 64, height: 64}}>
                  <Face src="media/crew/ivy-face.webp" size={64} style={{position: 'absolute', opacity: 1 - swapK}} />
                  <Face src="media/crew/shiny-face.webp" size={64} ring={C.accent} style={{position: 'absolute', opacity: swapK, transform: `scale(${0.6 + 0.4 * swapK + 0.15 * bump(t, S.magic + 0.3, 0.45)})`}} />
                </div>
                <div>
                  <div style={{fontFamily: F.mono, fontSize: 14, fontWeight: 600, letterSpacing: '0.2em', color: C.muted}}>LEAD</div>
                  <div style={{fontSize: 30, fontWeight: 800}}>
                    <Roll a={<span>Ivy</span>} b={<span style={{color: C.accent}}>Moon</span>} k={swapK} />
                  </div>
                </div>
              </div>
              <div style={{width: 300, height: 96, borderRadius: 20, background: C.s1, border: `1px solid ${C.line}`, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 22px', boxSizing: 'border-box'}}>
                <div style={{fontFamily: F.mono, fontSize: 14, fontWeight: 600, letterSpacing: '0.2em', color: C.muted}}>THEME</div>
                <div style={{fontSize: 30, fontWeight: 800}}>
                  <Roll a={<span>plant</span>} b={<span style={{color: C.accent}}>guitar</span>} k={swapK} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ——— Scene C: Praline's answer, above her bar ——— */}
        {t >= S.send && chatOut < 1 && (
          <div
            style={{
              position: 'absolute', left: BAR.x, top: 548, width: BAR.w, height: 352, borderRadius: 22, background: C.s1, border: `1px solid ${C.line}`,
              boxShadow: '0 24px 70px rgba(0,0,0,0.55)', padding: 24, boxSizing: 'border-box',
              opacity: prog(t, S.send, S.send + 0.2, easeOut) * (1 - chatOut), transform: `translateY(${(1 - prog(t, S.send, S.send + 0.3, easeOut)) * 30 + chatOut * 200}px)`,
            }}
          >
            <div style={{display: 'flex', justifyContent: 'flex-end'}}>
              <div style={{padding: '12px 22px', borderRadius: 999, background: C.s2, fontSize: 22, fontWeight: 500, transform: `translateY(${(1 - prog(t, S.send, S.send + 0.35, easeOut)) * 60}px)`}}>
                Swap Ivy for <span style={{color: C.accent, fontWeight: 700}}>@Moon</span>, with guitars as the theme
              </div>
            </div>
            <div style={{display: 'flex', gap: 16, marginTop: 22}}>
              <Face src="media/crew/praline-face.webp" size={48} />
              <div style={{flex: 1}}>
                <div style={{display: 'flex', alignItems: 'baseline', gap: 12}}>
                  <span style={{fontSize: 21, fontWeight: 700}}>Praline</span>
                  <span style={{fontFamily: F.mono, fontSize: 13, letterSpacing: '0.2em', color: C.muted}}>TREND BOSS</span>
                </div>
                {t < S.reply ? (
                  <div style={{display: 'flex', gap: 8, marginTop: 14}}>
                    {[0, 1, 2].map((d) => (
                      <div key={d} style={{width: 11, height: 11, borderRadius: '50%', background: C.muted, transform: `translateY(${-7 * Math.max(0, Math.sin((t - S.dots) * 11 - d * 0.9))}px)`}} />
                    ))}
                  </div>
                ) : (
                  <>
                    <div style={{marginTop: 8, fontSize: 22, lineHeight: 1.4, opacity: prog(t, S.reply, S.reply + 0.25, easeOut)}}>
                      Purr-fect! Moon takes the lead, and the plants turn into guitars.
                    </div>
                    <div style={{display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 14}}>
                      {TICKS.map((label, i) => {
                        const k = sp(frame, S.ticks[i], POP);
                        return (
                          <div key={label} style={{padding: '7px 14px', borderRadius: 10, background: C.s2, fontFamily: F.mono, fontSize: 17, display: 'flex', gap: 10, alignItems: 'center', transform: `scale(${k})`, opacity: Math.min(1, k * 2)}}>
                            <span style={{color: C.accent}}>✓</span>
                            {label}
                          </div>
                        );
                      })}
                    </div>
                    <div style={{display: 'flex', alignItems: 'center', gap: 22, marginTop: 18, opacity: prog(t, S.makeIt, S.makeIt + 0.25, easeOut)}}>
                      <div
                        style={{
                          padding: '13px 26px', borderRadius: 12, background: C.accent, color: C.ink, fontSize: 21, fontWeight: 700,
                          transform: `scale(${1 - 0.1 * bump(t, S.press, 0.22)})`,
                          boxShadow: `0 0 0 ${10 * bump(t, S.press, 0.4)}px rgba(242,255,89,0.25)`,
                        }}
                      >
                        Make it
                      </div>
                      <span style={{fontSize: 20, color: C.muted}}>Not now</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Praline's bar, as in the app. */}
        {t >= S.chatIn && chatOut < 1 && (
          <>
            <div style={{position: 'absolute', left: BAR.x, top: BAR.y - 52, display: 'flex', gap: 10, opacity: barIn * (1 - chatOut) * (t < S.send ? 1 : 0)}}>
              {['Show me around', 'Hottest trend', 'Swap the lead', 'My last mix', 'Make it'].map((c) => (
                <div key={c} style={{padding: '7px 16px', borderRadius: 999, border: `1px solid ${C.line}`, fontSize: 17, color: C.muted, background: C.bg}}>{c}</div>
              ))}
            </div>
            <div
              style={{
                position: 'absolute', left: BAR.x, top: BAR.y + (1 - barIn) * 160 + chatOut * 200, width: BAR.w, height: BAR.h, borderRadius: 22,
                background: C.s1, border: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', gap: 18, padding: '0 20px', boxSizing: 'border-box',
                boxShadow: '0 20px 60px rgba(0,0,0,0.5)', opacity: barIn,
              }}
            >
              <Face src="media/crew/praline-face.webp" size={66} />
              <div style={{width: 130, flex: 'none'}}>
                <div style={{fontSize: 21, fontWeight: 700}}>Praline</div>
                <div style={{fontFamily: F.mono, fontSize: 12, letterSpacing: '0.2em', color: C.muted}}>TREND BOSS</div>
              </div>
              <div style={{flex: 1, fontSize: 22, whiteSpace: 'nowrap', overflow: 'hidden'}}>
                {t < S.typing ? (
                  <span style={{color: C.muted}}>Ask Praline — a trend, a lead, then make it</span>
                ) : !sent ? (
                  <>
                    {msgText.split('@Moon').map((part, i, arr) => (
                      <React.Fragment key={i}>
                        {part}
                        {i < arr.length - 1 && <span style={{color: C.accent, fontWeight: 700}}>@Moon</span>}
                      </React.Fragment>
                    ))}
                    {msgText.includes('@') && !msgText.includes('@Moon') ? null : null}
                    <span style={{color: C.accent, opacity: Math.floor(t * 2.4) % 2 === 0 || typed < S.message.length ? 1 : 0}}>▍</span>
                  </>
                ) : (
                  <span style={{color: C.muted}}>Ask Praline — a trend, a lead, then make it</span>
                )}
              </div>
              <div style={{width: 64, height: 64, borderRadius: 16, background: C.accent, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${1 - 0.14 * bump(t, S.send, 0.22)})`}}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 2 11 13" />
                  <path d="M22 2 15 22 11 13 2 9z" />
                </svg>
              </div>
            </div>
          </>
        )}
      </AbsoluteFill>

      {/* ——— Scene E: the trend beside your version ——— */}
      {t >= S.compare && (
        <>
          <div style={{position: 'absolute', left: 1010 - 405 - 90 - (1 - leftIn) * 700, top: 196, width: 405, height: 720, borderRadius: 28, overflow: 'hidden', boxShadow: '0 30px 80px rgba(0,0,0,0.55)', opacity: Math.min(1, leftIn * 2)}}>
            <Clip t={t} src="media/ivy-plant-problem.mp4" start={S.moon[0]} end={S.moon[1]} mute />
          </div>
          <div style={{position: 'absolute', left: 0, right: 0, top: 74}}>
            <Line
              t={t} frame={frame}
              words={[['Same', S.sameTrend], ['trend.', S.sameTrend + 0.8], ['Your', S.sameTrend + 1.94], ['cast.', S.sameTrend + 2.14]]}
              exit={S.end + 1} size={84} weight={800} accent="cast."
            />
          </div>
          {[
            {x: 1010 - 405 - 90, label: 'THE TREND', name: 'Ivy · plants', k: prog(t, S.compare + 0.4, S.compare + 0.8, easeOut), hi: false},
            {x: 1010, label: 'YOUR CAST', name: 'Moon · guitars', k: prog(t, S.compare + 0.6, S.compare + 1.0, easeOut), hi: true},
          ].map((l) => (
            <div key={l.label} style={{position: 'absolute', left: l.x, width: 405, top: 940, textAlign: 'center', opacity: l.k, transform: `translateY(${(1 - l.k) * 16}px)`}}>
              <div style={{fontFamily: F.mono, fontSize: 16, fontWeight: 600, letterSpacing: '0.22em', color: C.muted}}>{l.label}</div>
              <div style={{fontSize: 30, fontWeight: 800, color: l.hi ? C.accent : C.text}}>{l.name}</div>
            </div>
          ))}
        </>
      )}

      <AbsoluteFill style={{background: 'radial-gradient(ellipse 85% 85% at 50% 50%, rgba(0,0,0,0) 60%, rgba(0,0,0,0.45) 100%)', pointerEvents: 'none'}} />
      <Grain frame={frame} />

      {/* ——— Sound ——— */}
      {/* A soft guitar bed: low under voices, up in the clips' silent reveals. */}
      <Audio
        src={staticFile('audio/s2-bed.mp3')}
        loop
        volume={(f) => {
          const tt = f / FPS;
          const pts = S.bed;
          for (let i = 1; i < pts.length; i++) {
            if (tt <= pts[i][0]) return lerp(pts[i - 1][1], pts[i][1], clamp01((tt - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0])));
          }
          return 0;
        }}
      />
      {S.vo.map((v, i) => (
        <Sequence key={i} from={fr(v.at)} durationInFrames={fr(v.to - v.from) + 2}>
          <Audio src={staticFile(v.src)} trimBefore={fr(v.from)} trimAfter={fr(v.to)} volume={1} />
        </Sequence>
      ))}
      <Sequence from={fr(S.cards)} durationInFrames={fr(1.6)}><Audio src={staticFile('audio/s2-sfx-cards.mp3')} volume={0.45} /></Sequence>
      <Sequence from={fr(S.pets)} durationInFrames={fr(0.9)}><Audio src={staticFile('audio/sfx-pops.mp3')} trimAfter={fr(0.86)} volume={0.45} /></Sequence>
      <Sequence from={fr(S.collapse - 0.05)} durationInFrames={fr(1.9)}><Audio src={staticFile('audio/sfx-whoosh.mp3')} volume={0.3} /></Sequence>
      <Sequence from={fr(S.mixerOn)} durationInFrames={fr(0.2)}><Audio src={staticFile('audio/s2-click.mp3')} volume={0.5} /></Sequence>
      <Sequence from={fr(S.shelf)} durationInFrames={fr(1.6)}><Audio src={staticFile('audio/s2-sfx-cards.mp3')} volume={0.35} /></Sequence>
      <Sequence from={fr(S.pick)} durationInFrames={fr(0.2)}><Audio src={staticFile('audio/s2-click.mp3')} volume={0.5} /></Sequence>
      <Sequence from={fr(S.typing)} durationInFrames={fr(1.5)}><Audio src={staticFile('audio/s2-sfx-typing.mp3')} volume={(f) => 0.45 * (1 - prog(f / FPS, 1.2, 1.5, (x) => x))} /></Sequence>
      <Sequence from={fr(S.send)} durationInFrames={fr(0.2)}><Audio src={staticFile('audio/s2-click.mp3')} volume={0.5} /></Sequence>
      <Sequence from={fr(S.send + 0.03)} durationInFrames={fr(0.65)}><Audio src={staticFile('audio/s2-sfx-send.mp3')} volume={0.45} /></Sequence>
      <Sequence from={fr(S.reply)} durationInFrames={fr(0.55)}><Audio src={staticFile('audio/s2-sfx-reply.mp3')} volume={0.55} /></Sequence>
      {S.ticks.map((tk, i) => (
        <Sequence key={i} from={fr(tk)} durationInFrames={fr(0.15)}><Audio src={staticFile('audio/s2-tick.mp3')} volume={0.35} /></Sequence>
      ))}
      <Sequence from={fr(S.press)} durationInFrames={fr(0.2)}><Audio src={staticFile('audio/s2-click.mp3')} volume={0.6} /></Sequence>
      <Sequence from={fr(S.magic - 0.05)} durationInFrames={fr(1.85)}><Audio src={staticFile('audio/s2-sfx-magic.mp3')} volume={0.6} /></Sequence>
      <Sequence from={fr(S.compare)} durationInFrames={fr(1.9)}><Audio src={staticFile('audio/sfx-whoosh.mp3')} volume={0.3} /></Sequence>
    </AbsoluteFill>
  );
};
