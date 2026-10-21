// A caption style drawn small, as the film draws it: the same layout (lyrics.js) and the same pieces (the word, its outline, its glow,
// the colour sweeping over it, the box behind a row) as the editor's preview, but still: every word shown, the second one lit.
// For the gallery of styles and its tiles; the live preview is the editor's own.
import { h } from "../dom.js";
import { layoutLyric, OUTLINE, faceOf } from "../lyrics.js";

const W = 360;
const H = 480;

/** A style as it reads on a frame of 3:4: `text` is a line of words (three are used), `color`, `hi` and `anim` what a line may name. */
export function captionSample(style, text, { color, hi, anim, size = 0.15, y = 0.6 } = {}) {
  const words = String(text || "Feel the rhythm").trim().split(/\s+/).slice(0, 3);
  const item = { style, anim, size, y, color, hi, text: words.join(" "), length: 3, words: words.map((t, i) => ({ text: t, from: i, to: i + 1 })) };
  const L = layoutLyric(item, W, H);
  const look = L.look;
  const lit = Math.min(1, words.length - 1);
  const pct = (v, of) => `${(v / of) * 100}%`;
  const px = (v) => `${(v / W) * 100}cqw`;
  const ring = Array.from({ length: 16 }, (_, i) => `${px(L.bord * Math.cos((i * Math.PI) / 8))} ${px(L.bord * Math.sin((i * Math.PI) / 8))} 0 ${OUTLINE}`).join(", ");
  const glow = `0 0 ${px(L.em * 0.1)} ${look.hi}, 0 0 ${px(L.em * 0.24)} ${look.hi}, 0 0 ${px(L.em * 0.5)} ${look.hi}`;
  const own = look.face === "lyric" ? {} : { fontFamily: `"${faceOf(look.face).family}", sans-serif` };
  const boxes = L.boxes.map((bx) => h("i.cw-box", { style: { left: pct(bx.cx - bx.w / 2, W), top: pct(bx.cy - bx.h / 2, H), width: pct(bx.w, W), height: pct(bx.h, H), background: look.box.color, opacity: String(look.box.alpha), borderRadius: px(L.em * 0.08) } }));
  const spans = L.placed.map((p) => {
    const isLit = p.i === lit;
    const g = look.glow ? h("b.cw-g", { style: { color: "transparent", textShadow: glow } }, p.text) : null;
    const o = look.outline && !look.hollow ? h("b.cw-o", { style: { color: OUTLINE, textShadow: ring } }, p.text) : null;
    // (a fill style: the words before the lit one are filled, the lit one half, the rest not yet; the others light the lit word)
    const f = h("b.cw-f", { style: look.hollow ? { color: !isLit || look.anim === "fill" ? "transparent" : look.hi, webkitTextStroke: `${px(L.bord)} ${look.color}` } : { color: isLit && look.anim !== "fill" ? look.hi : look.color } }, p.text);
    const k = look.anim === "fill" ? h("b.cw-k", { style: { color: look.hi, clipPath: `inset(0 ${p.i < lit ? 0 : p.i === lit ? 45 : 100}% 0 0)` } }, p.text) : null;
    const turn = look.tilt ? `rotate(${look.tilt}deg)` : "";
    return h("span.cut-word", { style: { left: pct(p.cx - p.w / 2, W), top: pct(p.cy - L.boxH / 2 + L.drop, H), width: pct(p.w, W), height: pct(L.boxH, H), fontSize: px(L.em), lineHeight: String(L.line.box), letterSpacing: look.spacing ? `${look.spacing}em` : "", transform: turn, pointerEvents: "none", ...own } }, g, o, f, k);
  });
  return h("span.jw-cap", { dataset: { style } }, ...boxes, ...spans);
}
