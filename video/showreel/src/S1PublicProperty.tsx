import React from 'react';
import {AbsoluteFill, Audio, Freeze, Img, OffthreadVideo, Sequence, staticFile, useCurrentFrame} from 'remotion';
import {
  bump, C, clamp01, easeIn, easeInOut, easeOut, ELASTIC, F, FPS, HEAVY, lerp, POP, prog, rand, sp, TL,
} from './lib';

// Section 1, "Public property": our crew's State Property plays with its sound, freezes on "private property",
// turns black and white, pulls back into a wall of things made in Comfyture, and the stamp flips to PUBLIC.

const S = TL.s1;
const M = S.mix;
const fr = (sec: number) => Math.round(sec * FPS);
const CX = 960;
const CY = 540;

// The world: a wall of 9:16 tiles. The middle one is State Property, filling the frame's height at scale 1.
const TILE_W = 607.5;
const TILE_H = 1080;
const GAP = 64;
const PX = TILE_W + GAP;
const PY = TILE_H + GAP;
const COLS = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5];
const ROWS = [-3, -2, -1, 0, 1, 2, 3];
const TILES = [
  'alors-on-danse', 'black-cat-clapping', 'bulin-47', 'closer', 'dance-audition', 'dance-with-me', 'dip-on-em',
  'documentary', 'face-dance', 'getting-robbed', 'ghost-photoshoot', 'grand-entrance', 'hotel-lobby', 'job-dance',
  'la-calabaza', 'lights-off', 'millionaire-advice', 'my-reaction', 'pumpkin-reveal', 'ramalama', 'scuba', 'sea-lion',
  'slow-motion-squad', 'smalltown-boy', 'sway', 'talking-about-me', 'three-kittens', 'tiny-desk', 'tiptoe', 'toc-toc',
  'uno-car-reveal', 'we-listen',
];
const PETS = ['crumpet', 'praline', 'pickle', 'paprika', 'brioche', 'truffle', 'canelle', 'ketkout'];

const STAMP_W = 520; // world px, on the middle tile
const STAMP_Y = CY + TILE_H * 0.14;
const PUBLIC_W = 1180; // screen px once it flies to the middle

const LOGO_W = 1240;
const LOGO_H = (LOGO_W * 1183) / 3579;
const LOGO_X = CX - LOGO_W / 2;
const LOGO_CY = 430;
const LOGO_Y = LOGO_CY - LOGO_H / 2;
const C_FRAC = 1010 / 3579; // the wordmark's C is the mark
const MARK_W = LOGO_W * C_FRAC;
const MARK_H = (MARK_W * 1175) / 1010;

const camera = (t: number, frame: number) => {
  const punch = 1 + 0.04 * sp(frame, S.freeze, HEAVY);
  const k = prog(t, S.zoomStart, S.zoomEnd, easeInOut);
  const drift = 1 - 0.07 * prog(t, S.zoomEnd, S.logo, (x) => x);
  const scale = Math.exp(lerp(Math.log(punch), Math.log(0.3), k)) * drift;
  const rot = -2.4 * Math.sin(Math.PI * k);
  // Shakes: the stamp, then the hero hit.
  const shake = 9 * Math.exp(-Math.max(0, t - S.stamp) * 9) * (t > S.stamp ? 1 : 0)
    + 22 * Math.exp(-Math.max(0, t - S.hero) * 6) * (t > S.hero ? 1 : 0);
  const sx = shake * (rand(frame * 1.7) - 0.5) * 2;
  const sy = shake * (rand(frame * 2.3 + 5) - 0.5) * 2;
  return {scale, rot, sx, sy};
};

/** The State Property clip: plays with sound until the freeze, holds the frozen frame, plays again (muted) after the hero. */
const Meme: React.FC<{t: number; blur?: boolean; mute?: boolean; style?: React.CSSProperties}> = ({t, blur, mute, style}) => {
  const src = staticFile('media/state-property.mp4');
  const vStyle: React.CSSProperties = {width: '100%', height: '100%', objectFit: 'cover', ...style};
  if (t < S.freeze) {
    return <OffthreadVideo src={src} muted={blur || mute} style={vStyle} />;
  }
  if (t < S.hero) {
    return (
      <Freeze frame={fr(S.freeze) - 1}>
        <OffthreadVideo src={src} muted style={vStyle} />
      </Freeze>
    );
  }
  return (
    <Sequence from={fr(S.hero) - fr(S.freeze)} layout="none">
      <OffthreadVideo src={src} muted style={vStyle} />
    </Sequence>
  );
};

const NOISE =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='3' seed='4'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 -3.2 2.45'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";

/** A rubber stamp. `stretch` widens the U of PUBLIC while the voice holds it. */
const Stamp: React.FC<{kind: 'private' | 'public'; w: number; stretch?: number}> = ({kind, w, stretch = 0}) => {
  const isPublic = kind === 'public';
  const ink = isPublic ? C.accent : C.stampRed;
  const u = 1 + 1.0 * stretch;
  return (
    <div
      style={{
        width: 'max-content',
        minWidth: w,
        boxSizing: 'border-box',
        padding: `${w * 0.05}px ${w * 0.06}px ${w * 0.06}px`,
        border: `${w * 0.026}px solid ${ink}`,
        borderRadius: w * 0.035,
        boxShadow: `inset 0 0 0 ${w * 0.012}px ${isPublic ? C.bg : 'transparent'}, inset 0 0 0 ${w * 0.022}px ${ink}`,
        background: isPublic ? 'rgba(18,18,20,0.88)' : 'transparent',
        color: ink,
        fontFamily: F.sans,
        fontWeight: 800,
        textAlign: 'center',
        lineHeight: 0.92,
        WebkitMaskImage: isPublic ? undefined : NOISE,
        WebkitMaskSize: '100% 100%',
      }}
    >
      <div style={{fontSize: w * 0.215, letterSpacing: '0.02em', whiteSpace: 'nowrap'}}>
        {isPublic ? (
          <>
            P
            <span style={{display: 'inline-block', transform: `scaleX(${u})`, margin: `0 ${(u - 1) * 0.36}em`}}>U</span>
            BLIC
          </>
        ) : (
          'PRIVATE'
        )}
      </div>
      <div style={{fontSize: w * 0.118, letterSpacing: '0.21em', marginTop: w * 0.02, paddingLeft: '0.21em'}}>PROPERTY</div>
    </div>
  );
};

/** A word that slides up out of a mask. */
const Word: React.FC<{k: number; out: number; children: React.ReactNode; color?: string}> = ({k, out, children, color}) => (
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

const Line: React.FC<{t: number; frame: number; words: (string | number)[][]; exit: number; size: number; weight: number; accent?: string}> = ({
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
const Logo: React.FC<{src: string; w: number; h: number; paint: string; style?: React.CSSProperties}> = ({src, w, h, paint, style}) => (
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

const Grain: React.FC<{frame: number}> = ({frame}) => (
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

const Caption: React.FC<{t: number}> = ({t}) => {
  const cap = TL.captions.find(([, a, b]) => t >= (a as number) && t < (b as number) + (b === S.freeze ? 0.4 : 0));
  if (!cap) return null;
  const [text, a] = cap as [string, number, number];
  const k = prog(t, a, a + 0.18, easeOut);
  const fade = 1 - prog(t, S.stamp - 0.05, S.stamp + 0.1, easeIn);
  const parts = text.split('PRIVATE PROPERTY');
  const outline = Array.from({length: 12}, (_, i) => {
    const a2 = (i / 12) * Math.PI * 2;
    return `${(Math.cos(a2) * 4).toFixed(1)}px ${(Math.sin(a2) * 4).toFixed(1)}px 0 #000`;
  }).join(', ');
  return (
    <div
      style={{
        position: 'absolute', left: CX - 300, width: 600, top: 770, textAlign: 'center',
        fontFamily: F.sans, fontWeight: 800, fontSize: 46, lineHeight: 1.12, color: '#fff',
        textShadow: `${outline}, 0 6px 18px rgba(0,0,0,0.6)`,
        transform: `scale(${0.88 + 0.12 * k})`, opacity: Math.min(k * 1.6, 1) * fade,
      }}
    >
      {parts.length > 1 ? (
        <>
          {parts[0]}
          <span style={{color: C.accent}}>PRIVATE PROPERTY</span>
          {parts[1]}
        </>
      ) : (
        text
      )}
    </div>
  );
};

/** `voice: 'earl'` swaps the meme's recorded voice for Earl's (ElevenLabs speech to speech, same timing): the clean version. */
export const S1PublicProperty: React.FC<{voice?: 'original' | 'earl'}> = ({voice = 'original'}) => {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const cam = camera(t, frame);

  // Black and white from the freeze until the hero line, then colour floods out from the middle.
  const grey = prog(t, S.freeze, S.freeze + 0.18, easeOut);
  const others = prog(t, S.zoomStart, S.zoomStart + 0.55, easeOut);
  const dim = lerp(0.55, 0.38, prog(t, S.line2.words[0][1] as number, (S.line2.words[0][1] as number) + 0.5));
  const flashA = 0.65 * (1 - prog(t, S.freeze, S.freeze + 0.14, (x) => x)) * (t >= S.freeze ? 1 : 0);
  const flashB = 0.8 * (1 - prog(t, S.hero, S.hero + 0.16, (x) => x)) * (t >= S.hero ? 1 : 0);

  // The stamp: slams on the frozen frame, then flies to the middle and flips to PUBLIC on "PUUUBLIC".
  const slam = sp(frame, S.stamp, {damping: 13, stiffness: 280, mass: 0.6});
  const flyStart = S.hero - 0.22;
  const fly = sp(frame, flyStart, HEAVY);
  const flip = Math.PI * prog(t, flyStart, S.hero + 0.04, easeInOut);
  const puuu = prog(t, S.puuu[0], S.puuu[0] + 0.25, easeOut) * (1 - prog(t, S.puuu[1] - 0.2, S.puuu[1], easeInOut));
  const hold = t >= S.hero ? 1 + 0.012 * Math.sin((t - S.hero) * 3) : 1;

  // The logo: the stamp fills yellow and swallows the frame, the mark spins in, the word writes on, a glitch cuts to dark.
  const L = S.logo;
  const fill = prog(t, L, L + 0.12, easeOut);
  const squash = 1 - 0.08 * bump(t, L, 0.16);
  const swallow = prog(t, L + 0.08, L + 0.5, easeIn);
  const yellowBg = t >= L + 0.42 && t < S.glitch;
  const darkLogo = t >= S.glitch;
  const markK = sp(frame, S.markIn, ELASTIC);
  const slide = prog(t, S.markSlide, S.markSlide + 0.5, easeInOut);
  const wipe = prog(t, S.wipe, S.wipe + 0.55, easeOut);
  const glitchOn = t >= S.glitch && t < S.glitch + 0.24;
  const after = t - S.glitch;

  const projStampX = CX + cam.sx;
  const projStampY = CY + (STAMP_Y - CY) * cam.scale + cam.sy;

  return (
    <AbsoluteFill style={{background: C.bg, overflow: 'hidden'}}>
      {/* ——— The wall ——— */}
      {t < L + 0.5 && (
        <>
          {/* Blurred copy behind the vertical clip while it plays full height. */}
          <AbsoluteFill style={{opacity: 1 - prog(t, S.zoomStart, S.zoomStart + 0.6, easeOut)}}>
            <Meme t={t} blur style={{filter: `blur(46px) brightness(0.42) saturate(1.15) grayscale(${grey})`, transform: 'scale(1.15)'}} />
          </AbsoluteFill>
          <AbsoluteFill
            style={{
              transform: `translate(${cam.sx}px, ${cam.sy}px) rotate(${cam.rot}deg) scale(${cam.scale})`,
              transformOrigin: `${CX}px ${CY}px`,
            }}
          >
            {COLS.flatMap((i) =>
              ROWS.map((j) => {
                const wx = CX + i * PX;
                const wy = CY + j * PY + (Math.abs(i) % 2 === 1 ? PY * 0.5 : 0);
                const mid = i === 0 && j === 0;
                if (!mid && others <= 0) return null;
                const d = Math.hypot((wx - CX) * 0.29, (wy - CY) * 0.29);
                const delay = d / 2300;
                const colour = prog(t, S.hero + delay, S.hero + delay + 0.28, easeOut);
                const pop = bump(t, S.hero + delay, 0.42);
                const g = mid ? grey * (1 - prog(t, S.hero, S.hero + 0.22, easeOut)) : 1 - colour;
                const bright = mid ? 1 : lerp(dim, 0.92, colour);
                const name = TILES[Math.floor(rand(i * 13.1 + j * 7.7 + 3) * TILES.length)];
                return (
                  <div
                    key={`${i}:${j}`}
                    style={{
                      position: 'absolute',
                      left: wx - TILE_W / 2,
                      top: wy - TILE_H / 2,
                      width: TILE_W,
                      height: TILE_H,
                      borderRadius: 30,
                      overflow: 'hidden',
                      opacity: mid ? 1 : others,
                      transform: `scale(${1 + 0.09 * pop})`,
                      filter: `grayscale(${g}) brightness(${bright}) contrast(${1 + 0.18 * g})`,
                      boxShadow: mid ? '0 30px 80px rgba(0,0,0,0.55)' : undefined,
                      outline: mid ? undefined : '2px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    {mid ? (
                      <Meme t={t} mute={voice === 'earl'} />
                    ) : (
                      <Img src={staticFile(`media/tiles/${name}.webp`)} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
                    )}
                  </div>
                );
              }),
            )}
            {/* The PRIVATE stamp, on the frozen frame (it zooms out with the wall). */}
            {t >= S.stamp && t < flyStart && (
              <div
                style={{
                  position: 'absolute',
                  left: CX - STAMP_W / 2,
                  top: STAMP_Y - STAMP_W * 0.27,
                  transform: `rotate(-11deg) scale(${lerp(2.7, 1, slam)})`,
                  opacity: prog(t, S.stamp, S.stamp + 0.05, (x) => x),
                }}
              >
                <Stamp kind="private" w={STAMP_W} />
              </div>
            )}
          </AbsoluteFill>
          {/* Bottom scrim so the lines read over the wall. */}
          <AbsoluteFill
            style={{
              background: 'linear-gradient(180deg, rgba(0,0,0,0) 55%, rgba(0,0,0,0.78) 100%)',
              opacity: prog(t, S.zoomStart, S.zoomEnd) * (1 - prog(t, S.hero, S.hero + 0.3)),
            }}
          />
          <Caption t={t} />
          <div style={{position: 'absolute', left: 0, right: 0, top: 865}}>
            <Line t={t} frame={frame} words={S.line1.words} exit={S.line1.exit} size={58} weight={700} />
          </div>
          <div style={{position: 'absolute', left: 0, right: 0, top: 838}}>
            <Line t={t} frame={frame} words={S.line2.words} exit={S.line2.exit} size={100} weight={800} accent="Comfyture" />
          </div>
          {/* Shockwave from the middle on the hero hit. */}
          {t >= S.hero && t < S.hero + 0.8 && (() => {
            const k = prog(t, S.hero, S.hero + 0.75, easeOut);
            const r = 60 + 1500 * k;
            return (
              <div
                style={{
                  position: 'absolute', left: CX - r, top: CY - r, width: r * 2, height: r * 2, borderRadius: '50%',
                  border: `${14 * (1 - k) + 2}px solid ${C.accent}`, opacity: 1 - k,
                }}
              />
            );
          })()}
          {/* The stamp in flight: PRIVATE turns over into PUBLIC, then swallows the frame. */}
          {t >= flyStart && (
            <div
              style={{
                position: 'absolute',
                left: lerp(projStampX, CX + cam.sx * 0.4, fly),
                top: lerp(projStampY, CY + cam.sy * 0.4, fly),
                transform: `translate(-50%, -50%) rotate(${lerp(-11, -5, fly) * (1 - swallow)}deg) scale(${
                  (lerp(STAMP_W * cam.scale, PUBLIC_W, fly) / PUBLIC_W) * hold * squash * (1 + 9 * swallow)
                }, ${(lerp(STAMP_W * cam.scale, PUBLIC_W, fly) / PUBLIC_W) * hold * squash * (1 + 9 * swallow)}) scaleX(${Math.abs(Math.cos(flip))})`,
              }}
            >
              <div style={{position: 'relative'}}>
                {flip < Math.PI / 2 ? <Stamp kind="private" w={PUBLIC_W} /> : <Stamp kind="public" w={PUBLIC_W} stretch={puuu} />}
                <div style={{position: 'absolute', inset: 0, borderRadius: PUBLIC_W * 0.035, background: C.accent, opacity: fill}} />
              </div>
            </div>
          )}
          <AbsoluteFill style={{background: '#fff', opacity: Math.max(flashA, flashB), pointerEvents: 'none'}} />
        </>
      )}

      {/* ——— The logo ——— */}
      {yellowBg && <AbsoluteFill style={{background: C.accent}} />}
      {darkLogo && (
        <AbsoluteFill>
          <AbsoluteFill style={{background: `radial-gradient(ellipse 55% 60% at 50% 42%, rgba(242,255,89,${0.13 * Math.exp(-after * 0.6) + 0.06}) 0%, rgba(242,255,89,0) 70%), ${C.bg}`}} />
          {/* Slow rays behind the word. */}
          <AbsoluteFill
            style={{
              background: `repeating-conic-gradient(from ${after * 7}deg at 50% ${(LOGO_CY / 1080) * 100}%, rgba(242,255,89,0.07) 0deg 5deg, rgba(0,0,0,0) 5deg 15deg)`,
              WebkitMaskImage: `radial-gradient(circle at 50% ${(LOGO_CY / 1080) * 100}%, #000 0%, rgba(0,0,0,0) 62%)`,
              opacity: prog(t, S.glitch, S.glitch + 0.5, easeOut),
            }}
          />
          {/* Sparks out of the glitch. */}
          {Array.from({length: 54}, (_, i) => {
            const a = rand(i + 0.5) * Math.PI * 2;
            const dist = (260 + rand(i + 40) * 820) * prog(t, S.glitch, S.glitch + 1.3, easeOut);
            const o = 1 - prog(t, S.glitch + 0.25 + rand(i + 9) * 0.4, S.glitch + 1.4, (x) => x);
            const size = 4 + rand(i + 77) * 10;
            if (o <= 0) return null;
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: CX + Math.cos(a) * dist * 1.25 - size / 2,
                  top: LOGO_CY + Math.sin(a) * dist * 0.75 - size / 2,
                  width: size, height: size, borderRadius: rand(i + 3) > 0.7 ? 2 : '50%',
                  background: rand(i + 21) > 0.75 ? '#fff' : C.accent, opacity: o,
                }}
              />
            );
          })}
          {/* Ring out of the glitch. */}
          {after < 0.7 && (() => {
            const k = prog(t, S.glitch, S.glitch + 0.65, easeOut);
            const r = 200 + 900 * k;
            return (
              <div style={{position: 'absolute', left: CX - r, top: LOGO_CY - r, width: r * 2, height: r * 2, borderRadius: '50%', border: `${10 * (1 - k) + 1}px solid ${C.accent}`, opacity: 1 - k}} />
            );
          })()}
        </AbsoluteFill>
      )}
      {t >= S.markIn && (() => {
        const breathe = darkLogo ? 1 + 0.025 * prog(t, S.glitch, S.end, (x) => x) : 1;
        const sweepX = lerp(-30, 130, prog(t, S.sweep, S.sweep + 0.75, easeInOut));
        const paint = darkLogo
          ? `linear-gradient(105deg, ${C.accent} 0%, ${C.accent} ${sweepX - 12}%, #ffffff ${sweepX}%, ${C.accent} ${sweepX + 12}%, ${C.accent} 100%)`
          : C.ink;
        const jitter = glitchOn ? (rand(frame * 3.1) - 0.5) * 40 : 0;
        const markCX = lerp(CX, LOGO_X + MARK_W / 2, slide);
        return (
          <AbsoluteFill style={{transform: `scale(${breathe})`, transformOrigin: `${CX}px ${LOGO_CY}px`}}>
            {!darkLogo && (
              <>
                <Logo
                  src="brand/mark-ink.svg" w={MARK_W} h={MARK_H} paint={C.ink}
                  style={{left: markCX - MARK_W / 2, top: LOGO_Y, transform: `rotate(${(1 - markK) * -230}deg) scale(${markK})`, transformOrigin: '50% 55%'}}
                />
                {wipe > 0 && (
                  <Logo
                    src="brand/wordmark-ink.svg" w={LOGO_W} h={LOGO_H} paint={C.ink}
                    style={{left: LOGO_X, top: LOGO_Y, clipPath: `inset(-10% ${100 - lerp(C_FRAC * 100, 100, wipe)}% -10% ${C_FRAC * 100}%)`}}
                  />
                )}
              </>
            )}
            {darkLogo && glitchOn && (
              <>
                <Logo src="brand/wordmark.svg" w={LOGO_W} h={LOGO_H} paint="#ff2d6f" style={{left: LOGO_X + 16 + jitter, top: LOGO_Y - 4, opacity: 0.9}} />
                <Logo src="brand/wordmark.svg" w={LOGO_W} h={LOGO_H} paint="#27e8ff" style={{left: LOGO_X - 16 - jitter, top: LOGO_Y + 4, opacity: 0.9, mixBlendMode: 'screen'}} />
                {[0, 1, 2, 3, 4].map((s) => (
                  <Logo
                    key={s} src="brand/wordmark.svg" w={LOGO_W} h={LOGO_H} paint={C.accent}
                    style={{left: LOGO_X + (rand(frame * 7 + s) - 0.5) * 70, top: LOGO_Y, clipPath: `inset(${s * 20}% 0 ${80 - s * 20}% 0)`}}
                  />
                ))}
              </>
            )}
            {darkLogo && !glitchOn && <Logo src="brand/wordmark.svg" w={LOGO_W} h={LOGO_H} paint={paint} style={{left: LOGO_X, top: LOGO_Y}} />}
          </AbsoluteFill>
        );
      })()}
      {/* The pets pop in under the word. */}
      {t >= S.pets &&
        PETS.map((p, i) => {
          const k = sp(frame, S.pets + S.petPops[i] - 0.03, POP);
          const size = 112;
          const gap = 26;
          const x0 = CX - (PETS.length * size + (PETS.length - 1) * gap) / 2;
          const bob = Math.sin((t - S.pets) * 2.4 + i * 0.8) * 4 * prog(t, S.pets + 0.8, S.pets + 1.4);
          return (
            <div
              key={p}
              style={{
                position: 'absolute', left: x0 + i * (size + gap), top: 700 + bob, width: size, height: size, borderRadius: '50%',
                overflow: 'hidden', border: `3px solid ${C.accent}`, background: '#fff',
                transform: `scale(${k}) rotate(${(1 - k) * -30}deg)`, boxShadow: '0 12px 30px rgba(0,0,0,0.45)',
              }}
            >
              <Img src={staticFile(`media/pets/${p}.webp`)} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
            </div>
          );
        })}
      {/* The tagline types on. */}
      {t >= S.tagline && (() => {
        const head = 'OPEN SOURCE · MIT · ';
        const tail = 'PUBLIC PROPERTY';
        const n = Math.floor((t - S.tagline) / 0.03);
        const shown = (head + tail).slice(0, n);
        const caret = n < head.length + tail.length || Math.floor(t * 2.4) % 2 === 0;
        return (
          <div style={{position: 'absolute', left: 0, right: 0, top: 880, textAlign: 'center', fontFamily: F.mono, fontWeight: 600, fontSize: 34, letterSpacing: '0.22em', color: C.muted}}>
            {shown.slice(0, head.length)}
            <span style={{color: C.accent}}>{shown.slice(head.length)}</span>
            <span style={{opacity: caret ? 1 : 0, color: C.accent}}>▍</span>
          </div>
        );
      })()}

      {!yellowBg && (
        <AbsoluteFill style={{background: 'radial-gradient(ellipse 85% 85% at 50% 50%, rgba(0,0,0,0) 58%, rgba(0,0,0,0.5) 100%)', pointerEvents: 'none'}} />
      )}
      <Grain frame={frame} />

      {/* ——— Sound ——— */}
      {voice === 'earl' && (
        <Sequence durationInFrames={fr(S.freeze)}><Audio src={staticFile('audio/earl-voice-2.mp3')} volume={1} /></Sequence>
      )}
      <Sequence from={fr(S.scratch)} durationInFrames={fr(1.3)}><Audio src={staticFile('audio/sfx-scratch.mp3')} volume={M.scratch} /></Sequence>
      <Sequence from={fr(S.stamp)} durationInFrames={fr(1.1)}><Audio src={staticFile('audio/sfx-stamp.mp3')} volume={M.stamp} /></Sequence>
      <Sequence from={fr(S.whoosh)} durationInFrames={fr(1.9)}><Audio src={staticFile('audio/sfx-whoosh.mp3')} volume={M.whoosh} /></Sequence>
      {S.vo.map((v, i) => (
        <Sequence key={i} from={fr(v.at)} durationInFrames={fr(v.to - v.from) + 2}>
          <Audio src={staticFile(v.src)} trimBefore={fr(v.from)} trimAfter={fr(v.to)} volume={1} />
        </Sequence>
      ))}
      {/* The crowd stays under the shout, swells once it is said, and gives way to the logo. */}
      <Sequence from={fr(S.hit)} durationInFrames={fr(3.0)}>
        <Audio
          src={staticFile('audio/sfx-hit.mp3')}
          volume={(f) => {
            const tt = S.hit + f / FPS;
            return lerp(M.hitUnderVoice, M.hitAfter, prog(tt, 21.5, 21.8)) * (1 - prog(tt, L, L + 0.5, (x) => x));
          }}
        />
      </Sequence>
      <Sequence from={fr(L)} durationInFrames={fr(4.1)}><Audio src={staticFile('audio/sfx-logo.mp3')} volume={M.logo} /></Sequence>
      <Sequence from={fr(S.glitch)} durationInFrames={fr(1.1)}><Audio src={staticFile('audio/sfx-stamp.mp3')} volume={M.logoThud} /></Sequence>
      <Sequence from={fr(S.jingle)} durationInFrames={fr(S.end - S.jingle)}>
        <Audio src={staticFile('audio/sfx-jingle.mp3')} volume={(f) => M.jingle * (1 - prog(S.jingle + f / FPS, S.end - 0.6, S.end, (x) => x))} />
      </Sequence>
      <Sequence from={fr(S.pets)} durationInFrames={fr(0.9)}><Audio src={staticFile('audio/sfx-pops.mp3')} trimAfter={fr(0.86)} volume={M.pops} /></Sequence>
    </AbsoluteFill>
  );
};
