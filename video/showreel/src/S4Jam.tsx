import React from 'react';
import {AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, staticFile, useCurrentFrame} from 'remotion';
import {bump, C, clamp01, easeIn, easeInOut, easeOut, F, FPS, HEAVY, lerp, POP, prog, sp, TL} from './lib';
import {Grain, Logo} from './parts';
import {Face, HEAD_H, Icon, TAB_POS, TABS, tabW} from './S2Mixer';

// Section 4, "Jam": Ketkout no Koe, an anime ending made by Jam, plays from its own edit (its four LTX-2.5 scenes,
// its karaoke lines with romaji, its song), with the credits saying what was AI: everything but the idea and the mood.

const S = TL.s4;
const fr = (sec: number) => Math.round(sec * FPS);
const LYRIC = '"Comfyture Lyric", "Noto Sans CJK JP", sans-serif';
const OUTLINE = '#211927';
const COVERS = [
  'song-velvet-bell', 'song-rooftop-bandit', 'song-petit-matin', 'song-chameleon-lights', 'song-paper-crown-riot', 'song-tea-steam-daydream',
  'song-blanket-fort-radio', 'song-dam-good-groove', 'song-porch-light-slow-jam', 'song-rain-on-the-study-desk', 'song-sandcastle-bounce', 'moonlit-oolong',
];

// Where the music video sits: the edit's preview, then full frame, then a tile in the wall of songs.
const PREV = {x: 480, y: 96, w: 1400, h: 787.5};
const TILE = {x: 960 - 230, y: 540 - 129, w: 460, h: 258.75};

const outline = (px: number, color = OUTLINE) =>
  Array.from({length: 16}, (_, i) => {
    const a = (i / 16) * Math.PI * 2;
    return `${(Math.cos(a) * px).toFixed(2)}px ${(Math.sin(a) * px).toFixed(2)}px 0 ${color}`;
  }).join(', ');

/** The song's karaoke line at song time `st`, drawn inside a video box of height `h`. */
const Karaoke: React.FC<{st: number; h: number}> = ({st, h}) => {
  const line = S.lines.find((l) => st >= l.start - 0.12 && st < l.start + l.len + 0.1);
  if (!line) return null;
  const local = st - line.start;
  const k = prog(local, -0.12, 0.12, easeOut);
  const out = prog(local, line.len - 0.05, line.len + 0.1, easeIn);
  const size = 0.075 * h;
  const cy = Math.min(0.86, Math.max(0.14, line.y)) * h;
  const words = line.words as [string, number, number][];
  const lineEl = (
    <div style={{fontFamily: LYRIC, fontWeight: 900, fontSize: size, lineHeight: 1.15, whiteSpace: 'nowrap', letterSpacing: '0.02em'}}>
      {words.map(([w, a, b], i) => {
        const p = clamp01((local - a) / (b - a)) * 100;
        return (
          <span key={i} style={{position: 'relative', display: 'inline-block', marginRight: i < words.length - 1 ? '0.4em' : 0}}>
            <span style={{color: '#ffffff', textShadow: outline(size * 0.09)}}>{w}</span>
            <span style={{position: 'absolute', left: 0, top: 0, color: C.accent, clipPath: `inset(-10% ${100 - p}% -10% -2%)`}}>{w}</span>
          </span>
        );
      })}
    </div>
  );
  return (
    <div style={{position: 'absolute', left: 0, right: 0, top: cy - size * 0.75, display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: k * (1 - out), transform: `scale(${0.9 + 0.1 * k})`}}>
      {lineEl}
      <div style={{fontFamily: LYRIC, fontSize: size * 0.42, color: '#fff', textShadow: outline(size * 0.045), marginTop: size * 0.05, whiteSpace: 'nowrap'}}>{line.romaji}</div>
    </div>
  );
};

/** The edit at song time `st`: the scene on screen, its lyric over it. */
const MusicVideo: React.FC<{st: number; w: number; h: number}> = ({st, w, h}) => {
  const scene = S.scenes.find((s) => st >= s.start && st < s.start + s.len) ?? S.scenes[0];
  return (
    <div style={{position: 'absolute', inset: 0, background: '#000', overflow: 'hidden'}}>
      {S.scenes.map((s) =>
        s === scene ? (
          <Sequence key={s.src} from={fr(S.song0 + s.start)} layout="none">
            <OffthreadVideo src={staticFile(s.src)} muted style={{width: '100%', height: '100%', objectFit: 'cover'}} />
          </Sequence>
        ) : null,
      )}
      <Karaoke st={st} h={h} />
      <div style={{position: 'absolute', right: 0.012 * w, top: 0.02 * h, width: 0.012 * h, height: 0.012 * h, borderRadius: '50%', background: 'rgba(255,255,255,0.7)'}} />
    </div>
  );
};

export const S4Jam: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const st = t - S.song0; // song time

  const titleK = prog(t, S.title, S.title + 0.6, easeOut);
  const titleOut = prog(t, S.preview - 0.1, S.preview + 0.3, easeIn);
  const prevK = sp(frame, S.preview, HEAVY);
  const full = prog(t, S.full, S.full + 0.65, easeInOut);
  const wall = prog(t, S.wall, S.wall + 0.8, easeInOut);
  const uiOut = full;

  const box = {
    x: lerp(lerp(PREV.x, 0, full), TILE.x, wall),
    y: lerp(lerp(PREV.y, 0, full), TILE.y, wall),
    w: lerp(lerp(PREV.w, 1920, full), TILE.w, wall),
    h: lerp(lerp(PREV.h, 1080, full), TILE.h, wall),
  };

  return (
    <AbsoluteFill style={{background: C.bg, overflow: 'hidden', fontFamily: F.sans, color: C.text}}>
      <AbsoluteFill style={{background: 'radial-gradient(ellipse 60% 55% at 50% 45%, rgba(242,255,89,0.045) 0%, rgba(242,255,89,0) 70%)'}} />

      {/* ——— The wall of songs, behind everything at the end ——— */}
      {t >= S.wall && (
        <AbsoluteFill>
          {Array.from({length: 4 * 7}, (_, n) => {
            const col = (n % 7) - 3;
            const row = Math.floor(n / 7) - 1.5;
            if (col === 0 && (row === -0.5 || row === 0.5)) return null;
            const cx = 960 + col * 270;
            const cy = 540 + row * 275 + (col % 2 ? 40 : -40);
            const d = Math.hypot(col, row);
            const k = sp(frame, S.wall + 0.15 + d * 0.06, POP);
            return (
              <div key={n} style={{position: 'absolute', left: cx - 120, top: cy - 120, width: 240, height: 240, borderRadius: 18, overflow: 'hidden', transform: `scale(${k}) rotate(${(1 - k) * 12}deg)`, opacity: Math.min(1, k * 2) * 0.85, boxShadow: '0 20px 50px rgba(0,0,0,0.5)'}}>
                <Img src={staticFile(`media/jam/covers/${COVERS[n % COVERS.length]}.jpg`)} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
              </div>
            );
          })}
          <AbsoluteFill style={{background: 'radial-gradient(ellipse 45% 45% at 50% 50%, rgba(18,18,20,0.75) 0%, rgba(18,18,20,0.2) 100%)'}} />
          <div style={{position: 'absolute', left: 0, right: 0, top: TILE.y + TILE.h + 36, textAlign: 'center', opacity: prog(t, S.vo[2].at + 0.2, S.vo[2].at + 0.6, easeOut)}}>
            <div style={{fontSize: 74, fontWeight: 800, letterSpacing: '-0.02em', textShadow: '0 6px 30px rgba(0,0,0,0.7)'}}>
              Jam can do <span style={{color: C.accent}}>so much more.</span>
            </div>
            <div style={{display: 'flex', justifyContent: 'center', gap: 12, marginTop: 18}}>
              {['Covers', 'Music videos', 'Anime openings', 'Lyric videos', 'Your own songs'].map((c, i) => {
                const k = sp(frame, S.vo[2].at + 0.5 + i * 0.09, POP);
                return <div key={c} style={{padding: '9px 18px', borderRadius: 999, background: 'rgba(18,18,20,0.85)', border: `1px solid rgba(242,255,89,0.4)`, color: C.accent, fontFamily: F.mono, fontSize: 18, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', transform: `scale(${k})`}}>{c}</div>;
              })}
            </div>
          </div>
        </AbsoluteFill>
      )}

      {/* ——— Left column: the album and the credits ——— */}
      {uiOut < 1 && (
        <AbsoluteFill style={{opacity: 1 - uiOut}}>
          <div style={{position: 'absolute', left: 40, top: 96, width: 400, height: 400, borderRadius: 22, overflow: 'hidden', transform: `scale(${0.92 + 0.08 * prog(t, 0.3, 0.9, easeOut)})`, opacity: prog(t, 0.3, 0.8, easeOut), boxShadow: '0 24px 60px rgba(0,0,0,0.5)'}}>
            <Img src={staticFile('media/jam/covers/ketkout-no-koe.jpg')} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
            <div style={{position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0) 60%, rgba(0,0,0,0.7) 100%)'}} />
            <div style={{position: 'absolute', left: 22, bottom: 18}}>
              <div style={{fontSize: 30, fontWeight: 800}}>Ketkout no Koe</div>
              <div style={{fontFamily: F.mono, fontSize: 18, color: 'rgba(255,255,255,0.8)'}}>0:30 · 128 BPM</div>
            </div>
          </div>
          <div style={{position: 'absolute', left: 40, top: 520, width: 400}}>
            <div style={{fontFamily: F.mono, fontSize: 15, fontWeight: 600, letterSpacing: '0.22em', color: C.muted, opacity: prog(t, S.preview, S.preview + 0.4, easeOut)}}>CREDITS</div>
            {S.credits.map(([name, by, at], i) => {
              const rowK = prog(t, S.preview + 0.1 + i * 0.06, S.preview + 0.5 + i * 0.06, easeOut);
              const tagK = sp(frame, at as number, POP);
              const ai = (by as string).startsWith('AI');
              const pulse = ai ? bump(t, S.allAI, 0.35) : 0;
              return (
                <div key={name as string} style={{display: 'flex', alignItems: 'center', height: 64, borderBottom: `1px solid ${C.line}`, opacity: rowK, transform: `translateX(${(1 - rowK) * -30}px)`}}>
                  <span style={{fontSize: 26, fontWeight: 700, width: 150}}>{name}</span>
                  <span
                    style={{
                      marginLeft: 'auto', padding: '6px 14px', borderRadius: 10, fontFamily: F.mono, fontSize: 18, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
                      background: ai ? C.accent : 'rgba(255,255,255,0.1)', color: ai ? C.ink : C.text, transform: `scale(${tagK * (1 + 0.12 * pulse)})`, opacity: Math.min(1, tagK * 2),
                    }}
                  >
                    {by}
                  </span>
                </div>
              );
            })}
          </div>
        </AbsoluteFill>
      )}

      {/* ——— Right: the idea and the mood, then the edit ——— */}
      {titleOut < 1 && (
        <div style={{position: 'absolute', left: 500, top: 150, width: 1360, opacity: titleK * (1 - titleOut), transform: `translateY(${(1 - titleK) * 30}px)`}}>
          <div style={{fontFamily: F.mono, fontSize: 18, fontWeight: 600, letterSpacing: '0.24em', color: C.muted}}>JAM · ANIME ENDING</div>
          <div style={{fontSize: 130, fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1, marginTop: 12}}>KETKOUT NO KOE</div>
          <div style={{display: 'flex', gap: 12, marginTop: 26}}>
            {['Covers', 'Music videos', 'Openings'].map((c, i) => {
              const k = sp(frame, S.chips[i], POP);
              return <div key={c} style={{padding: '10px 20px', borderRadius: 999, border: `1px solid rgba(242,255,89,0.4)`, background: 'rgba(242,255,89,0.08)', color: C.accent, fontFamily: F.mono, fontSize: 20, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', transform: `scale(${k})`, opacity: Math.min(1, k * 2)}}>{c}</div>;
            })}
          </div>
          <div style={{marginTop: 54, padding: '28px 34px', borderRadius: 22, background: C.s1, border: `1px solid ${C.line}`, opacity: prog(t, S.idea, S.idea + 0.4, easeOut), transform: `translateY(${(1 - prog(t, S.idea, S.idea + 0.4, easeOut)) * 20}px)`}}>
            <div style={{fontFamily: F.mono, fontSize: 16, fontWeight: 600, letterSpacing: '0.22em', color: C.muted}}>THE IDEA AND THE MOOD · <span style={{color: C.text}}>OURS</span></div>
            <div style={{fontSize: 34, lineHeight: 1.35, marginTop: 12}}>“A bittersweet Japanese anime ending song, intimate and nostalgic with a quiet sense of hope.”</div>
          </div>
        </div>
      )}

      {/* The timeline under the preview: scenes, lines, the song, and a playhead in step. */}
      {t >= S.preview && uiOut < 1 && (
        <div style={{position: 'absolute', left: PREV.x, top: 900, width: PREV.w, height: 150, opacity: prog(t, S.preview + 0.2, S.preview + 0.6, easeOut) * (1 - uiOut), transform: `translateY(${uiOut * 60}px)`}}>
          {S.scenes.map((s) => (
            <div key={s.src} style={{position: 'absolute', left: (s.start / 30) * PREV.w + 2, top: 0, width: (s.len / 30) * PREV.w - 4, height: 56, borderRadius: 8, background: 'linear-gradient(90deg, #2a5fbf, #4c86e0)', overflow: 'hidden'}}>
              <span style={{position: 'absolute', left: 8, top: 5, fontSize: 15, fontWeight: 600, color: '#fff'}}>{s.name}</span>
            </div>
          ))}
          {S.lines.map((l, i) => (
            <div key={i} style={{position: 'absolute', left: (l.start / 30) * PREV.w + 1, top: 64, width: (l.len / 30) * PREV.w - 2, height: 32, borderRadius: 6, background: C.s2, fontFamily: '"Noto Sans CJK JP", sans-serif', fontSize: 14, color: C.muted, padding: '6px 8px', boxSizing: 'border-box', whiteSpace: 'nowrap', overflow: 'hidden'}}>{l.text}</div>
          ))}
          <div style={{position: 'absolute', left: 0, top: 104, width: PREV.w, height: 36, borderRadius: 6, background: 'rgba(242,255,89,0.08)', overflow: 'hidden', display: 'flex', alignItems: 'center', gap: 2, padding: '0 6px', boxSizing: 'border-box'}}>
            {Array.from({length: 140}, (_, i) => (
              <div key={i} style={{flex: 1, height: `${20 + 70 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.37))}%`, background: 'rgba(242,255,89,0.45)', borderRadius: 1}} />
            ))}
          </div>
          <div style={{position: 'absolute', left: clamp01(st / 30) * PREV.w, top: -6, width: 3, height: 156, marginLeft: -1.5, background: C.accent, boxShadow: '0 0 12px rgba(242,255,89,0.7)'}} />
        </div>
      )}

      {/* The music video itself. */}
      {t >= S.preview && (
        <div
          style={{
            position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, borderRadius: lerp(lerp(22, 0, full), 18, wall), overflow: 'hidden',
            opacity: Math.min(1, prevK * 1.5), transform: `scale(${0.92 + 0.08 * prevK})`, boxShadow: `0 30px 80px rgba(0,0,0,0.6)${wall > 0 ? `, 0 0 0 ${4 * wall}px ${C.accent}` : ''}`,
          }}
        >
          <MusicVideo st={Math.max(0, st)} w={box.w} h={box.h} />
          {/* "100% AI" stamp while it plays full frame. */}
          {full > 0.5 && wall < 0.2 && (() => {
            const k = sp(frame, S.full + 0.6, POP);
            return (
              <div style={{position: 'absolute', left: 40, top: 36, display: 'flex', gap: 10, alignItems: 'center', opacity: Math.min(1, k * 2) * (1 - wall * 5), transform: `scale(${k})`, transformOrigin: '0 0'}}>
                <div style={{padding: '8px 16px', borderRadius: 10, background: C.accent, color: C.ink, fontFamily: F.mono, fontSize: 20, fontWeight: 600, letterSpacing: '0.14em'}}>100% AI</div>
                <div style={{padding: '8px 16px', borderRadius: 10, background: 'rgba(18,18,20,0.8)', fontFamily: F.mono, fontSize: 18, letterSpacing: '0.12em'}}>SONG · VOICE · SCENES · EDIT</div>
              </div>
            );
          })()}
        </div>
      )}

      {/* The header, Jam lit. */}
      {uiOut < 1 && (
        <div style={{position: 'absolute', left: 0, top: 0, width: 1920, height: HEAD_H, background: C.bg, borderBottom: `1px solid ${C.line}`, opacity: 1 - uiOut}}>
          <Logo src="brand/wordmark.svg" w={150} h={(150 * 1183) / 3579} paint={C.accent} style={{left: 34, top: (HEAD_H - (150 * 1183) / 3579) / 2}} />
          {TABS.map((tab, i) => {
            const lit = tab.id === 'jam' ? prog(t, S.jamOn, S.jamOn + 0.25) : tab.id === 'cabinet' ? 1 - prog(t, S.jamOn, S.jamOn + 0.25) : 0;
            const color = lit > 0.5 ? C.accent : C.text;
            return (
              <div key={tab.id} style={{position: 'absolute', left: TAB_POS[i], top: (HEAD_H - 48) / 2, width: tabW(tab.name), height: 48, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, background: `rgba(242,255,89,${0.12 * lit})`, transform: `scale(${1 + 0.08 * (tab.id === 'jam' ? bump(t, S.jamOn, 0.3) : 0)})`}}>
                <Icon id={tab.id} size={24} color={color} />
                <span style={{fontSize: 20, fontWeight: lit > 0.5 ? 700 : 500, color}}>{tab.name}</span>
                <div style={{position: 'absolute', left: 12, right: 12, bottom: -12, height: 3, borderRadius: 3, background: C.accent, transform: `scaleX(${lit})`}} />
              </div>
            );
          })}
          <div style={{position: 'absolute', right: 40, top: 12}}>
            <Face src="media/crew/pickle-face.webp" size={48} ring={C.accent} />
          </div>
        </div>
      )}

      <AbsoluteFill style={{background: 'radial-gradient(ellipse 85% 85% at 50% 50%, rgba(0,0,0,0) 62%, rgba(0,0,0,0.4) 100%)', pointerEvents: 'none'}} />
      <Grain frame={frame} />

      {/* ——— Sound ——— */}
      <Sequence from={fr(S.song0)}>
        <Audio
          src={staticFile('media/jam/ketkout-no-koe-part.mp3')}
          volume={(f) => {
            const tt = S.song0 + f / FPS;
            const up = lerp(0.22, 1, prog(tt, S.songUp[0], S.songUp[1], (x) => x));
            const down = lerp(1, 0.3, prog(tt, S.wall, S.wall + 0.4, (x) => x));
            return prog(tt, S.song0, S.song0 + 0.3, (x) => x) * up * down * (1 - prog(tt, S.end - 1.2, S.end, (x) => x));
          }}
        />
      </Sequence>
      {S.vo.map((v, i) => (
        <Sequence key={i} from={fr(v.at)} durationInFrames={fr(v.to - v.from) + 2}>
          <Audio src={staticFile(v.src)} trimBefore={fr(v.from)} trimAfter={fr(v.to)} volume={1} />
        </Sequence>
      ))}
      <Sequence from={fr(S.jamOn)} durationInFrames={fr(0.2)}><Audio src={staticFile('audio/s2-click.mp3')} volume={0.5} /></Sequence>
      {S.credits.map(([, , at], i) => (
        <Sequence key={i} from={fr(at as number)} durationInFrames={fr(0.15)}><Audio src={staticFile('audio/s2-tick.mp3')} volume={0.3} /></Sequence>
      ))}
      <Sequence from={fr(S.full - 0.05)} durationInFrames={fr(1.9)}><Audio src={staticFile('audio/sfx-whoosh.mp3')} volume={0.25} /></Sequence>
      <Sequence from={fr(S.wall)} durationInFrames={fr(1.9)}><Audio src={staticFile('audio/sfx-whoosh.mp3')} volume={0.3} /></Sequence>
    </AbsoluteFill>
  );
};
