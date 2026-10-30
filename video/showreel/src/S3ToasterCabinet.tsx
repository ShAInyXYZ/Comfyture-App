import React from 'react';
import {AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, staticFile, useCurrentFrame} from 'remotion';
import {bump, C, clamp01, easeIn, easeInOut, easeOut, F, FPS, HEAVY, lerp, POP, prog, rand, sp, TL} from './lib';
import {Grain, Logo} from './parts';
import {Face, HEAD_H, Icon, TAB_POS, TABS, tabW} from './S2Mixer';

// Section 3, "Toaster and Cabinet": Crumpet poses Pickle in clay, Toast it gives the render, then the sheet and the
// Tripo model turning; Cabinet dresses Josie and Shiny, poses them, and Canelle shoots the picture.

const S = TL.s3;
const fr = (sec: number) => Math.round(sec * FPS);

const ANSWER = {x: 1050, y: 150, w: 830};
const TBAR = {x: 1050, y: 916, w: 830, h: 124};
const VP = {x: 370, y: 104, w: 640, h: 800};
const TICKS = ['Added Pickle', 'Pose: leap', 'Camera placed', 'Words set'];
const CHAIN = ['Clay', 'Colour ID', 'Render', 'Sheet', '3D model'];

const Img2: React.FC<{src: string; style?: React.CSSProperties; fit?: 'cover' | 'contain'}> = ({src, style, fit = 'cover'}) => (
  <Img src={staticFile(src)} style={{width: '100%', height: '100%', objectFit: fit, ...style}} />
);

const Header: React.FC<{t: number; frame: number}> = ({t}) => {
  const toToaster = prog(t, S.toasterOn, S.toasterOn + 0.25, easeOut);
  const toCabinet = prog(t, S.cabinetOn, S.cabinetOn + 0.25, easeOut);
  const litOf = (id: string) =>
    id === 'mixer' ? 1 - toToaster : id === 'toaster' ? toToaster - toCabinet : id === 'cabinet' ? toCabinet : 0;
  return (
    <div style={{position: 'absolute', left: 0, top: 0, width: 1920, height: HEAD_H, background: C.bg, borderBottom: `1px solid ${C.line}`}}>
      <Logo src="brand/wordmark.svg" w={150} h={(150 * 1183) / 3579} paint={C.accent} style={{left: 34, top: (HEAD_H - (150 * 1183) / 3579) / 2}} />
      {TABS.map((tab, i) => {
        const lit = litOf(tab.id);
        const pulse = 1 + 0.08 * (tab.id === 'toaster' ? bump(t, S.toasterOn, 0.3) : tab.id === 'cabinet' ? bump(t, S.cabinetOn, 0.3) : 0);
        const color = lit > 0.5 ? C.accent : C.text;
        return (
          <div
            key={tab.id}
            style={{
              position: 'absolute', left: TAB_POS[i], top: (HEAD_H - 48) / 2, width: tabW(tab.name), height: 48, borderRadius: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, background: `rgba(242,255,89,${0.12 * lit})`, transform: `scale(${pulse})`,
            }}
          >
            <Icon id={tab.id} size={24} color={color} />
            <span style={{fontSize: 20, fontWeight: lit > 0.5 ? 700 : 500, color}}>{tab.name}</span>
            <div style={{position: 'absolute', left: 12, right: 12, bottom: -12, height: 3, borderRadius: 3, background: C.accent, transform: `scaleX(${lit})`}} />
          </div>
        );
      })}
    </div>
  );
};

/** A pet's bar, as in the app: face, name, tag, what is typed, and its key. */
const Bar: React.FC<{
  x: number; y: number; w: number; h: number; face: string; name: string; tag: string; text: React.ReactNode; keyLabel?: string; press: number; t: number; style?: React.CSSProperties;
}> = ({x, y, w, h, face, name, tag, text, keyLabel, press, t, style}) => (
  <div
    style={{
      position: 'absolute', left: x, top: y, width: w, height: h, borderRadius: 22, background: C.s1, border: `1px solid ${C.line}`,
      display: 'flex', alignItems: 'center', gap: 18, padding: '0 20px', boxSizing: 'border-box', boxShadow: '0 20px 60px rgba(0,0,0,0.5)', ...style,
    }}
  >
    <Face src={face} size={66} />
    <div style={{width: 130, flex: 'none'}}>
      <div style={{fontSize: 21, fontWeight: 700}}>{name}</div>
      <div style={{fontFamily: F.mono, fontSize: 12, letterSpacing: '0.2em', color: C.muted, textTransform: 'uppercase'}}>{tag}</div>
    </div>
    <div style={{flex: 1, fontSize: 21, whiteSpace: 'nowrap', overflow: 'hidden'}}>{text}</div>
    {keyLabel ? (
      <div style={{padding: '16px 30px', borderRadius: 14, background: C.accent, color: C.ink, fontSize: 22, fontWeight: 800, flex: 'none', transform: `scale(${1 - 0.12 * bump(t, press, 0.22)})`, boxShadow: `0 0 0 ${12 * bump(t, press, 0.45)}px rgba(242,255,89,0.25)`}}>
        {keyLabel}
      </div>
    ) : (
      <div style={{width: 64, height: 64, borderRadius: 16, background: C.accent, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${1 - 0.14 * bump(t, press, 0.22)})`}}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 2 11 13" />
          <path d="M22 2 15 22 11 13 2 9z" />
        </svg>
      </div>
    )}
  </div>
);

const Typed: React.FC<{t: number; at: number; text: string; per: number; placeholder: string; until: number}> = ({t, at, text, per, placeholder, until}) => {
  if (t < at || t >= until) return <span style={{color: C.muted}}>{placeholder}</span>;
  const n = Math.min(text.length, Math.floor((t - at) / per));
  return (
    <>
      {text.slice(0, n)}
      <span style={{color: C.accent, opacity: n < text.length || Math.floor(t * 2.4) % 2 === 0 ? 1 : 0}}>▍</span>
    </>
  );
};

const Card: React.FC<{x: number; y: number; w: number; h: number; k: number; children: React.ReactNode; style?: React.CSSProperties}> = ({x, y, w, h, k, children, style}) => (
  <div
    style={{
      position: 'absolute', left: x, top: y, width: w, height: h, borderRadius: 22, overflow: 'hidden', background: C.s1, border: `1px solid ${C.line}`,
      opacity: Math.min(1, k * 1.6), transform: `translateY(${(1 - k) * 40}px) scale(${0.94 + 0.06 * k})`, boxShadow: '0 24px 60px rgba(0,0,0,0.45)', ...style,
    }}
  >
    {children}
  </div>
);

const Label: React.FC<{children: React.ReactNode; style?: React.CSSProperties}> = ({children, style}) => (
  <div style={{fontFamily: F.mono, fontSize: 15, fontWeight: 600, letterSpacing: '0.2em', color: C.muted, textTransform: 'uppercase', ...style}}>{children}</div>
);

export const S3ToasterCabinet: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / FPS;

  // ——— Toaster ———
  const toasterOut = prog(t, S.cabinetOn - 0.05, S.cabinetOn + 0.35, easeIn);
  const vpIn = sp(frame, S.viewport, HEAVY);
  const idK = prog(t, S.colourId, S.colourId + 0.3, easeInOut);
  const renderK = prog(t, S.render, S.render + 0.6, easeInOut);
  const three = prog(t, S.threeD, S.threeD + 0.7, easeInOut);
  const chatOut = prog(t, S.threeD - 0.1, S.threeD + 0.3, easeIn);
  const sheetK = sp(frame, S.sheet, POP);
  const modelK = sp(frame, S.model, HEAVY);
  const side = prog(t, S.typing - 0.45, S.typing + 0.15, easeInOut);
  const barK = prog(t, S.typing - 0.3, S.typing + 0.15, easeOut);
  const vp = {
    x: lerp(lerp(640, VP.x, side), 60, three), y: lerp(VP.y, 150, three), w: lerp(VP.w, 560, three), h: lerp(VP.h, 700, three),
  };
  const chainLit = [S.viewport + 0.3, S.colourId, S.render, S.sheet, S.model];

  // ——— Cabinet ———
  const cabIn = prog(t, S.cabinetOn + 0.15, S.cabinetOn + 0.6, easeOut);
  const shot = t >= S.shoot;
  const develop = prog(t, S.shoot, S.shoot + 0.7, easeOut);
  const flash = (1 - prog(t, S.shoot, S.shoot + 0.25, (x) => x)) * (shot ? 1 : 0);

  return (
    <AbsoluteFill style={{background: C.bg, overflow: 'hidden', fontFamily: F.sans, color: C.text}}>
      <AbsoluteFill style={{background: 'radial-gradient(ellipse 60% 55% at 50% 45%, rgba(242,255,89,0.045) 0%, rgba(242,255,89,0) 70%)'}} />

      {/* ——————————— TOASTER ——————————— */}
      {toasterOut < 1 && (
        <AbsoluteFill style={{opacity: 1 - toasterOut, transform: `translateX(${-toasterOut * 120}px)`}}>
          {/* Parts, as in the app. */}
          <Card x={40} y={104} w={300} h={300} k={prog(t, S.viewport + 0.1, S.viewport + 0.6, easeOut) * (1 - three)}>
            <div style={{padding: 22}}>
              <Label>Parts 1</Label>
              <div style={{marginTop: 16, height: 56, borderRadius: 14, border: `1px solid ${C.accent}`, background: 'rgba(242,255,89,0.06)', display: 'flex', alignItems: 'center', gap: 14, padding: '0 14px'}}>
                <div style={{width: 18, height: 18, borderRadius: 5, background: '#ff6a3d'}} />
                <span style={{fontSize: 21, fontWeight: 600}}>Pickle</span>
                <span style={{marginLeft: 'auto', fontFamily: F.mono, fontSize: 13, color: C.muted, letterSpacing: '0.14em'}}>CHARACTER</span>
              </div>
              <Label style={{marginTop: 26}}>What it is</Label>
              <div style={{marginTop: 10, fontSize: 18, lineHeight: 1.4, color: C.muted}}>Pickle the frog, mid-air in a joyful leap, a red scarf flying.</div>
            </div>
          </Card>

          {/* The viewport: clay, then colour ID, then the render. */}
          <div
            style={{
              position: 'absolute', left: vp.x, top: vp.y, width: vp.w, height: vp.h, borderRadius: 26, overflow: 'hidden', background: '#2a2a30',
              opacity: Math.min(1, vpIn * 1.5), transform: `scale(${0.92 + 0.08 * vpIn})`, boxShadow: '0 30px 80px rgba(0,0,0,0.55)',
            }}
          >
            <div style={{position: 'absolute', inset: 0, transform: `scale(${1.04 - 0.04 * prog(t, S.viewport, S.press, (x) => x)})`}}>
              <Img2 src="media/toaster/pickle-clay.png" />
            </div>
            <div style={{position: 'absolute', inset: 0, opacity: idK * (1 - renderK)}}>
              <Img2 src="media/toaster/pickle-colour-id.png" />
            </div>
            <div style={{position: 'absolute', inset: 0, clipPath: `inset(0 ${100 - renderK * 100}% 0 0)`}}>
              <Img2 src="media/toaster/pickle-render.png" />
            </div>
            {renderK > 0 && renderK < 1 && (
              <div style={{position: 'absolute', top: 0, bottom: 0, left: `${renderK * 100}%`, width: 4, marginLeft: -2, background: C.accent, boxShadow: `0 0 30px 8px rgba(242,255,89,0.6)`}} />
            )}
            {/* View keys while it is clay. */}
            <div style={{position: 'absolute', left: '50%', top: 18, transform: 'translateX(-50%)', display: 'flex', gap: 6, padding: 6, borderRadius: 14, background: 'rgba(18,18,20,0.82)', opacity: 1 - idK}}>
              {['Perspective', 'Front', 'Side', 'Top'].map((v, i) => (
                <div key={v} style={{padding: '7px 12px', borderRadius: 9, fontFamily: F.mono, fontSize: 13, color: i === 0 ? C.accent : C.muted, background: i === 0 ? 'rgba(242,255,89,0.1)' : 'transparent'}}>{v}</div>
              ))}
            </div>
            <div style={{position: 'absolute', left: 18, bottom: 16, padding: '6px 12px', borderRadius: 9, background: 'rgba(18,18,20,0.82)', fontFamily: F.mono, fontSize: 14, letterSpacing: '0.16em'}}>
              {renderK > 0.5 ? 'RENDER' : idK > 0.5 ? 'COLOUR ID' : 'CLAY'}
            </div>
          </div>

          {/* Crumpet's answer, then his bar. */}
          {t >= S.send && chatOut < 1 && (
            <div
              style={{
                position: 'absolute', left: ANSWER.x, top: 520, width: ANSWER.w, borderRadius: 22, background: C.s1, border: `1px solid ${C.line}`, padding: 24, boxSizing: 'border-box',
                boxShadow: '0 24px 70px rgba(0,0,0,0.55)', opacity: prog(t, S.send, S.send + 0.2, easeOut) * (1 - chatOut), transform: `translateY(${(1 - prog(t, S.send, S.send + 0.3, easeOut)) * 30}px) translateX(${chatOut * 200}px)`,
              }}
            >
              <div style={{display: 'flex', justifyContent: 'flex-end'}}>
                <div style={{padding: '12px 22px', borderRadius: 999, background: C.s2, fontSize: 21}}>{S.message}</div>
              </div>
              <div style={{display: 'flex', gap: 16, marginTop: 20}}>
                <Face src="media/crew/crumpet-face.webp" size={48} />
                <div style={{flex: 1}}>
                  <div style={{display: 'flex', alignItems: 'baseline', gap: 12}}>
                    <span style={{fontSize: 21, fontWeight: 700}}>Crumpet</span>
                    <span style={{fontFamily: F.mono, fontSize: 13, letterSpacing: '0.2em', color: C.muted}}>MODEL MAKER</span>
                  </div>
                  {t < S.reply ? (
                    <div style={{display: 'flex', gap: 8, marginTop: 14}}>
                      {[0, 1, 2].map((d) => <div key={d} style={{width: 11, height: 11, borderRadius: '50%', background: C.muted, transform: `translateY(${-7 * Math.max(0, Math.sin((t - S.dots) * 11 - d * 0.9))}px)`}} />)}
                    </div>
                  ) : (
                    <>
                      <div style={{marginTop: 8, fontSize: 21, lineHeight: 1.4, opacity: prog(t, S.reply, S.reply + 0.25, easeOut)}}>Pickle's posed in clay, mid-leap, camera low. Toast it when you're ready.</div>
                      <div style={{display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 14}}>
                        {TICKS.map((label, i) => {
                          const k = sp(frame, S.ticks[i], POP);
                          return (
                            <div key={label} style={{padding: '7px 14px', borderRadius: 10, background: C.s2, fontFamily: F.mono, fontSize: 16, display: 'flex', gap: 10, transform: `scale(${k})`, opacity: Math.min(1, k * 2)}}>
                              <span style={{color: C.accent}}>✓</span>
                              {label}
                            </div>
                          );
                        })}
                      </div>
                      <div style={{display: 'flex', alignItems: 'center', gap: 22, marginTop: 18, opacity: prog(t, S.toastKey, S.toastKey + 0.25, easeOut)}}>
                        <div style={{padding: '13px 26px', borderRadius: 12, background: C.accent, color: C.ink, fontSize: 21, fontWeight: 700, transform: `scale(${1 - 0.1 * bump(t, S.press, 0.22)})`, boxShadow: `0 0 0 ${10 * bump(t, S.press, 0.4)}px rgba(242,255,89,0.25)`}}>Toast it</div>
                        <span style={{fontSize: 20, color: C.muted}}>Not now</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
          {chatOut < 1 && (
            <Bar
              x={TBAR.x} y={TBAR.y + chatOut * 220} w={TBAR.w} h={TBAR.h} face="media/crew/crumpet-face.webp" name="Crumpet" tag="model maker" press={S.send} t={t}
              text={<Typed t={t} at={S.typing} text={S.message} per={0.025} placeholder="Ask Crumpet — a set, a pose, a camera" until={S.send + 0.05} />}
              style={{opacity: barK, transform: `translateY(${(1 - barK) * 60}px)`}}
            />
          )}

          {/* Sheet and the 3D model. */}
          {t >= S.sheet && (
            <Card x={660} y={220} w={560} h={560} k={sheetK} style={{background: '#fff'}}>
              <Img2 src="media/toaster/pickle-sheet.png" />
              <div style={{position: 'absolute', left: 16, bottom: 14, padding: '6px 12px', borderRadius: 9, background: 'rgba(18,18,20,0.85)', fontFamily: F.mono, fontSize: 14, letterSpacing: '0.16em', color: C.text}}>SHEET · 4 VIEWS</div>
            </Card>
          )}
          {t >= S.model && (
            <div style={{position: 'absolute', left: 1260, top: 150, width: 600, height: 700, opacity: Math.min(1, modelK * 1.5), transform: `scale(${0.85 + 0.15 * modelK})`}}>
              <div style={{position: 'absolute', inset: 0, borderRadius: 26, background: 'radial-gradient(ellipse 70% 60% at 50% 45%, #2c2c33 0%, #17171a 75%)', border: `1px solid ${C.line}`}} />
              <div style={{position: 'absolute', left: '50%', bottom: 90, width: 300, height: 40, marginLeft: -150, borderRadius: '50%', background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0) 70%)'}} />
              <Sequence from={fr(S.model)} layout="none">
                <OffthreadVideo src={staticFile('media/toaster/pickle-turntable.webm')} transparent muted style={{position: 'absolute', left: 0, top: 30, width: 600, height: 600}} />
              </Sequence>
              <div style={{position: 'absolute', left: 18, bottom: 16, padding: '6px 12px', borderRadius: 9, background: 'rgba(18,18,20,0.85)', fontFamily: F.mono, fontSize: 14, letterSpacing: '0.16em'}}>3D MODEL · TRIPO</div>
              {/* Glints as it appears. */}
              {Array.from({length: 22}, (_, i) => {
                const a = rand(i + 3.1) * Math.PI * 2;
                const d = (60 + rand(i + 40) * 260) * prog(t, S.model, S.model + 1.0, easeOut);
                const o = 1 - prog(t, S.model + 0.2 + rand(i) * 0.3, S.model + 1.2, (x) => x);
                const s = 4 + rand(i + 9) * 7;
                return o > 0 ? <div key={i} style={{position: 'absolute', left: 300 + Math.cos(a) * d - s / 2, top: 330 + Math.sin(a) * d - s / 2, width: s, height: s, borderRadius: '50%', background: rand(i + 2) > 0.6 ? '#fff' : C.accent, opacity: o}} /> : null;
              })}
            </div>
          )}

          {/* The chain, lighting up as it goes. */}
          <div style={{position: 'absolute', left: three > 0.5 ? 0 : 40, right: three > 0.5 ? 0 : undefined, top: lerp(944, 900, three), display: 'flex', justifyContent: three > 0.5 ? 'center' : 'flex-start', gap: 10, opacity: prog(t, S.viewport + 0.4, S.viewport + 0.9, easeOut)}}>
            {CHAIN.map((c, i) => {
              const on = prog(t, chainLit[i], chainLit[i] + 0.25, easeOut);
              return (
                <React.Fragment key={c}>
                  {i > 0 && <span style={{alignSelf: 'center', color: on > 0.5 ? C.accent : C.line, fontSize: 22}}>→</span>}
                  <div style={{padding: '9px 16px', borderRadius: 11, fontFamily: F.mono, fontSize: 16, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', background: on > 0.5 ? 'rgba(242,255,89,0.12)' : C.s1, color: on > 0.5 ? C.accent : C.muted, border: `1px solid ${on > 0.5 ? 'rgba(242,255,89,0.4)' : C.line}`, transform: `scale(${1 + 0.08 * bump(t, chainLit[i], 0.3)})`}}>
                    {c}
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </AbsoluteFill>
      )}

      {/* ——————————— CABINET ——————————— */}
      {t >= S.cabinetOn && (
        <AbsoluteFill style={{opacity: cabIn, transform: `translateX(${(1 - cabIn) * 120}px)`}}>
          {/* Characters, each with the outfit and the pose picked for them. */}
          <div style={{position: 'absolute', left: 40, top: 104, width: 480, height: 790, borderRadius: 22, background: C.s1, border: `1px solid ${C.line}`}} />
          <div style={{position: 'absolute', left: 64, top: 124, display: 'flex', alignItems: 'baseline', gap: 10}}>
            <span style={{fontSize: 24, fontWeight: 700}}>Characters</span>
            <span style={{fontFamily: F.mono, fontSize: 14, color: C.muted}}>2/3</span>
          </div>
          {[
            {name: 'Josie', who: "Praline's owner", img: 'media/cabinet/josie.png', outfit: ['kabyle-dress', 'Kabyle dress'], pose: ['hand-hip', 'Hand on hip'], i: 0},
            {name: 'Shiny', who: "Ketkout's owner", img: 'media/cabinet/shiny.png', outfit: ['burnous', 'Burnous'], pose: ['arms-crossed', 'Arms crossed'], i: 1},
          ].map((c) => {
            const x = 64 + c.i * 222;
            const k = sp(frame, S.chars[c.i], POP);
            const ko = sp(frame, S.outfits[c.i], POP);
            const kp = sp(frame, S.poses[c.i], POP);
            return (
              <React.Fragment key={c.name}>
                <div style={{position: 'absolute', left: x, top: 166, width: 210, height: 330, borderRadius: 16, overflow: 'hidden', background: '#f4f2ee', transform: `scale(${k})`, opacity: Math.min(1, k * 2)}}>
                  <div style={{position: 'absolute', left: 0, right: 0, top: 0, height: 260}}>
                    <Img2 src={c.img} style={{objectPosition: '50% 20%'}} />
                  </div>
                  <div style={{position: 'absolute', left: 0, right: 0, bottom: 0, height: 70, background: C.s2, padding: '10px 14px', boxSizing: 'border-box'}}>
                    <div style={{fontSize: 21, fontWeight: 700}}>{c.name}</div>
                    <div style={{fontSize: 15, color: C.muted}}>{c.who}</div>
                  </div>
                </div>
                {[
                  {k: ko, src: `media/cabinet/${c.outfit[0]}.webp`, label: c.outfit[1], dx: 0},
                  {k: kp, src: `media/cabinet/${c.pose[0]}.webp`, label: c.pose[1], dx: 106},
                ].map((p) => (
                  <div key={p.label} style={{position: 'absolute', left: x + p.dx, top: 520, width: 100, height: 170, borderRadius: 12, overflow: 'hidden', background: '#fff', transform: `scale(${p.k})`, opacity: Math.min(1, p.k * 2), boxShadow: `0 0 0 2px ${C.accent}`}}>
                    <div style={{position: 'absolute', left: 0, right: 0, top: 0, height: 136}}><Img2 src={p.src} /></div>
                    <div style={{position: 'absolute', left: 0, right: 0, bottom: 0, height: 34, background: C.s2, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.text}}>{p.label}</div>
                  </div>
                ))}
              </React.Fragment>
            );
          })}
          <div style={{position: 'absolute', left: 64, top: 712, width: 430, display: 'flex', gap: 10, opacity: prog(t, S.poses[1] + 0.2, S.poses[1] + 0.6, easeOut)}}>
            {['Post', 'Story', 'Try-on', 'Photoshoot'].map((m, i) => (
              <div key={m} style={{padding: '8px 14px', borderRadius: 10, fontSize: 17, fontWeight: 600, background: i === 0 ? C.accent : C.s2, color: i === 0 ? C.ink : C.muted}}>{m}</div>
            ))}
          </div>
          <div style={{position: 'absolute', left: 64, top: 772, width: 430, display: 'flex', gap: 10, opacity: prog(t, S.poses[1] + 0.3, S.poses[1] + 0.7, easeOut)}}>
            <div style={{flex: 1, padding: '12px 16px', borderRadius: 12, background: C.s2, fontSize: 18}}>Studio</div>
            <div style={{flex: 1, padding: '12px 16px', borderRadius: 12, background: C.s2, fontSize: 18}}>GPT Sunburst</div>
          </div>

          {/* The picture, and the strip of shots beside it. */}
          <div style={{position: 'absolute', left: 560, top: 104, width: 92, height: 790}}>
            {['2e01293d611e5204', '9124e1e7095f2a44', '37691be560533bb9', '2acbb4ef00e549f1', 'cd9b658b329f3591', 'bfdc3950abb11c5b'].map((id, i) => {
              const k = sp(frame, S.strip + i * 0.08, POP);
              return (
                <div key={id} style={{position: 'absolute', left: 0, top: i * 108, width: 84, height: 100, borderRadius: 10, overflow: 'hidden', transform: `scale(${k})`, opacity: Math.min(1, k * 2), boxShadow: i === 0 ? `0 0 0 3px ${C.accent}` : undefined}}>
                  <Img2 src={`media/cabinet/shot-${id}.jpg`} />
                </div>
              );
            })}
          </div>
          <div style={{position: 'absolute', left: 672, top: 104, width: 640, height: 790, borderRadius: 22, background: C.s1, border: `1px solid ${C.line}`, overflow: 'hidden'}}>
            {!shot ? (
              <div style={{position: 'absolute', inset: 40, borderRadius: 16, border: '2px dashed rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontSize: 20}}>
                Josie, Shiny · Post
              </div>
            ) : (
              <div style={{position: 'absolute', left: 20, top: 20, right: 20, bottom: 20, borderRadius: 14, overflow: 'hidden', transform: `scale(${1.05 - 0.05 * develop})`, filter: `brightness(${1 + 1.2 * (1 - develop)}) saturate(${develop})`}}>
                <Img2 src="media/cabinet/shot-2e01293d611e5204.jpg" />
              </div>
            )}
            <div style={{position: 'absolute', inset: 0, background: '#fff', opacity: flash}} />
          </div>

          {/* The wardrobe, with the two picked. */}
          <div style={{position: 'absolute', left: 1352, top: 104, width: 528, height: 790, borderRadius: 22, background: C.s1, border: `1px solid ${C.line}`}}>
            <div style={{display: 'flex', gap: 10, margin: 20}}>
              <div style={{flex: 1, padding: '10px 0', textAlign: 'center', borderRadius: 11, background: C.accent, color: C.ink, fontSize: 18, fontWeight: 700}}>Wardrobe <span style={{fontFamily: F.mono, fontSize: 13}}>2 picked</span></div>
              <div style={{flex: 1, padding: '10px 0', textAlign: 'center', borderRadius: 11, fontSize: 18, color: C.muted}}>Poses <span style={{fontFamily: F.mono, fontSize: 13}}>2 picked</span></div>
            </div>
            <div style={{margin: '0 20px', padding: '11px 16px', borderRadius: 11, background: C.bg, fontSize: 16, color: C.muted}}>Search 168 outfits: a name, a kind</div>
            <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, margin: 20}}>
              {['blazer', 'kabyle-dress', 'boho', 'biker', 'barista', 'burnous', 'ballet', 'basketball', 'astronaut'].map((n, i) => {
                const picked = n === 'kabyle-dress' ? prog(t, S.outfits[0], S.outfits[0] + 0.2) : n === 'burnous' ? prog(t, S.outfits[1], S.outfits[1] + 0.2) : 0;
                const k = prog(t, S.cabinetOn + 0.3 + i * 0.03, S.cabinetOn + 0.7 + i * 0.03, easeOut);
                return (
                  <div key={n} style={{height: 176, borderRadius: 12, overflow: 'hidden', background: '#fff', opacity: k, boxShadow: picked > 0 ? `0 0 0 ${3 * picked}px ${C.accent}` : undefined, transform: `scale(${1 + 0.06 * bump(t, n === 'burnous' ? S.outfits[1] : S.outfits[0], 0.3) * (picked > 0 ? 1 : 0)})`}}>
                    <Img2 src={`media/cabinet/wardrobe/${n}.webp`} />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Canelle's bar, with Shoot. */}
          <Bar
            x={560} y={916} w={1320} h={124} face="media/crew/canelle-face.webp" name="Canelle" tag="stylist" press={S.shoot} t={t} keyLabel="Shoot"
            text={<Typed t={t} at={S.noteTyping} text={S.note} per={0.018} placeholder="Ask Canelle — outfits, poses, then shoot" until={S.end + 1} />}
          />
        </AbsoluteFill>
      )}

      <Header t={t} frame={frame} />
      <AbsoluteFill style={{background: 'radial-gradient(ellipse 85% 85% at 50% 50%, rgba(0,0,0,0) 60%, rgba(0,0,0,0.45) 100%)', pointerEvents: 'none'}} />
      <Grain frame={frame} />

      {/* ——— Sound ——— */}
      <Audio src={staticFile('audio/s2-bed.mp3')} loop volume={(f) => {
        const tt = f / FPS;
        return 0.13 * prog(tt, 0, 0.5, (x) => x) * (1 - prog(tt, S.end - 1.2, S.end, (x) => x));
      }} />
      {S.vo.map((v, i) => (
        <Sequence key={i} from={fr(v.at)} durationInFrames={fr(v.to - v.from) + 2}>
          <Audio src={staticFile(v.src)} trimBefore={fr(v.from)} trimAfter={fr(v.to)} volume={1} />
        </Sequence>
      ))}
      <Sequence from={fr(S.toasterOn)} durationInFrames={fr(0.2)}><Audio src={staticFile('audio/s2-click.mp3')} volume={0.5} /></Sequence>
      <Sequence from={fr(S.typing)} durationInFrames={fr(1.4)}><Audio src={staticFile('audio/s2-sfx-typing.mp3')} volume={(f) => 0.45 * (1 - prog(f / FPS, 1.1, 1.4, (x) => x))} /></Sequence>
      <Sequence from={fr(S.send)} durationInFrames={fr(0.2)}><Audio src={staticFile('audio/s2-click.mp3')} volume={0.5} /></Sequence>
      <Sequence from={fr(S.send + 0.03)} durationInFrames={fr(0.65)}><Audio src={staticFile('audio/s2-sfx-send.mp3')} volume={0.45} /></Sequence>
      <Sequence from={fr(S.reply)} durationInFrames={fr(0.55)}><Audio src={staticFile('audio/s2-sfx-reply.mp3')} volume={0.55} /></Sequence>
      {S.ticks.map((tk, i) => (
        <Sequence key={i} from={fr(tk)} durationInFrames={fr(0.15)}><Audio src={staticFile('audio/s2-tick.mp3')} volume={0.35} /></Sequence>
      ))}
      <Sequence from={fr(S.press)} durationInFrames={fr(0.2)}><Audio src={staticFile('audio/s2-click.mp3')} volume={0.6} /></Sequence>
      <Sequence from={fr(S.colourId)} durationInFrames={fr(1.05)}><Audio src={staticFile('audio/s3-sfx-toast.mp3')} volume={0.55} /></Sequence>
      <Sequence from={fr(S.render - 0.05)} durationInFrames={fr(1.9)}><Audio src={staticFile('audio/sfx-whoosh.mp3')} volume={0.3} /></Sequence>
      <Sequence from={fr(S.sheet)} durationInFrames={fr(0.55)}><Audio src={staticFile('audio/s2-sfx-reply.mp3')} volume={0.45} /></Sequence>
      <Sequence from={fr(S.model - 0.1)} durationInFrames={fr(2.05)}><Audio src={staticFile('audio/s3-sfx-spin.mp3')} volume={0.5} /></Sequence>
      <Sequence from={fr(S.cabinetOn)} durationInFrames={fr(0.2)}><Audio src={staticFile('audio/s2-click.mp3')} volume={0.5} /></Sequence>
      <Sequence from={fr(S.cabinetOn)} durationInFrames={fr(1.9)}><Audio src={staticFile('audio/sfx-whoosh.mp3')} volume={0.3} /></Sequence>
      {[...S.chars, ...S.outfits, ...S.poses].map((tk, i) => (
        <Sequence key={`p${i}`} from={fr(tk)} durationInFrames={fr(0.15)}><Audio src={staticFile('audio/s2-tick.mp3')} volume={0.3} /></Sequence>
      ))}
      <Sequence from={fr(S.noteTyping)} durationInFrames={fr(1.1)}><Audio src={staticFile('audio/s2-sfx-typing.mp3')} volume={(f) => 0.4 * (1 - prog(f / FPS, 0.8, 1.1, (x) => x))} /></Sequence>
      <Sequence from={fr(S.shoot)} durationInFrames={fr(0.85)}><Audio src={staticFile('audio/s3-sfx-shutter.mp3')} volume={0.7} /></Sequence>
      <Sequence from={fr(S.strip)} durationInFrames={fr(0.9)}><Audio src={staticFile('audio/sfx-pops.mp3')} trimAfter={fr(0.6)} volume={0.35} /></Sequence>
    </AbsoluteFill>
  );
};
