// The brand's patterns: supporting graphics made from its own kit, nothing drawn by hand. The mark repeated tone on tone on the
// darkest colour, the mark in the signal colour on the lightest, the wordmark in rows on the signal colour, and bands in the
// palette's order and proportions. Each is drawn on a canvas (the logo files recoloured through their transparency), so the
// Brand kit's frame, the window and a downloaded PNG are the same drawing at different sizes.
import { h, icon } from "./dom.js";
import { kitOf, luminance } from "./design.js";
import { macaron } from "./macaron.js";
import { defineWindow } from "./macaron-win.js";

const hexOk = (c) => /^#[0-9a-f]{6}$/i.test(String(c ?? ""));
/** A colour a part of the way (t, 0 to 1) to another. */
const mix = (a, b, t) => {
  const x = parseInt(a.slice(1), 16);
  const y = parseInt(b.slice(1), 16);
  const c = (sh) => Math.round(((x >> sh) & 255) * (1 - t) + ((y >> sh) & 255) * t);
  return `#${[16, 8, 0].map((sh) => c(sh).toString(16).padStart(2, "0")).join("")}`;
};
/** How lively a colour is (its saturation). */
const chroma = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return Math.max(r, g, b) - Math.min(r, g, b);
};

/** The patterns a kit makes: up to four, from its palette and its logo files (none without colours). */
export function patternsOf(kit) {
  const pal = kit.palette.filter((p) => hexOk(p.hex)).map((p) => ({ ...p, hex: p.hex.toLowerCase() }));
  if (!pal.length) return [];
  const byLum = [...pal].sort((a, b) => luminance(a.hex) - luminance(b.hex));
  const dark = byLum[0].hex;
  const light = byLum.at(-1).hex;
  const signal = (pal.find((p) => /signal|accent|highlight|pop/i.test(`${p.role ?? ""} ${p.name ?? ""}`)) ?? [...pal].sort((a, b) => chroma(b.hex) - chroma(a.hex))[0]).hex;
  const mark = kit.logos.find((l) => l.kind === "mark" && l.url) ?? kit.logos.find((l) => l.kind !== "icon" && l.url);
  const word = kit.logos.find((l) => l.kind === "wordmark" && l.url);
  const out = [];
  if (mark) out.push({ id: "tone", name: "Mark, tone on tone", kind: "grid", url: mark.url, ground: dark, ink: mix(dark, light, 0.2), cell: 132, size: 64 });
  if (mark && signal !== light) out.push({ id: "signal", name: "Mark in signal", kind: "grid", url: mark.url, ground: light, ink: signal, cell: 150, size: 60 });
  if (word && signal !== dark) out.push({ id: "rows", name: "Wordmark rows", kind: "rows", url: word.url, ground: signal, ink: mix(signal, dark, 0.22), cell: 104, size: 250 });
  out.push({ id: "bands", name: "Bands", kind: "bands", ground: dark, bands: pal.map((p) => [p.hex, p.share || 1]) });
  return out.slice(0, 4);
}

const pics = new Map();
const load = (url) => {
  if (!pics.has(url)) pics.set(url, new Promise((done, fail) => {
    const i = new Image();
    i.onload = () => done(i);
    i.onerror = () => (pics.delete(url), fail(new Error(`no picture at ${url}`)));
    i.src = url;
  }));
  return pics.get(url);
};

/** A logo file in one colour (its transparency kept), fitted in a box w × h. */
function tinted(img, ink, w, hgt) {
  const k = Math.min(w / img.naturalWidth, hgt / img.naturalHeight);
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(img.naturalWidth * k));
  c.height = Math.max(1, Math.round(img.naturalHeight * k));
  const x = c.getContext("2d");
  x.drawImage(img, 0, 0, c.width, c.height);
  x.globalCompositeOperation = "source-in";
  x.fillStyle = ink;
  x.fillRect(0, 0, c.width, c.height);
  return c;
}

/** Draws a pattern over the whole canvas; `scale` sizes its repeat (1 is the pattern as designed, at 1px a unit). */
export async function drawPattern(cv, p, scale = 1) {
  const ctx = cv.getContext("2d");
  const [W, H] = [cv.width, cv.height];
  ctx.fillStyle = p.ground;
  ctx.fillRect(0, 0, W, H);
  if (p.kind === "bands") {
    const total = p.bands.reduce((n, [, s]) => n + s, 0);
    const period = 300 * scale;
    const D = Math.hypot(W, H);
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-Math.PI / 4);
    for (let x = -D; x < D;) for (const [c, s] of p.bands) {
      const w = (period * s) / total;
      ctx.fillStyle = c;
      ctx.fillRect(x, -D, w + 0.5, 2 * D);
      x += w;
    }
    ctx.restore();
    return;
  }
  const img = await load(p.url);
  const cell = p.cell * scale;
  if (p.kind === "grid") {
    // a half-drop grid: every other row moved on half a cell
    const t = tinted(img, p.ink, p.size * scale, p.size * scale);
    for (let r = -1; r * cell < H + cell; r++) for (let c = -1; c * cell < W + cell; c++) {
      const x = c * cell + (r % 2 ? cell / 2 : 0) + (cell - t.width) / 2;
      const y = r * cell + (cell - t.height) / 2;
      ctx.drawImage(t, x, y);
    }
    return;
  }
  // rows: the wordmark along each row, every other row moved on half a step
  const t = tinted(img, p.ink, p.size * scale, cell * 0.62);
  const step = t.width * 1.28;
  for (let r = 0; r * cell < H + cell; r++) for (let x = -step + (r % 2 ? step / 2 : 0); x < W + step; x += step) ctx.drawImage(t, x, r * cell + (cell - t.height) / 2);
}

/** A canvas of a pattern, w × h, drawn when its picture has loaded. */
export function patternCanvas(p, w, hgt, scale) {
  const cv = h("canvas", { width: w, height: hgt, role: "img", "aria-label": p.name });
  drawPattern(cv, p, scale).catch((e) => console.warn("pattern:", e.message));
  return cv;
}

/** A pattern as a square PNG, 2048 pixels a side, saved as a file. */
async function download(p, brand) {
  const cv = h("canvas", { width: 2048, height: 2048 });
  await drawPattern(cv, p, 2);
  const blob = await new Promise((done) => cv.toBlob(done, "image/png"));
  const a = h("a", { href: URL.createObjectURL(blob), download: `${String(brand).toLowerCase().replace(/[^a-z0-9]+/g, "-")}-pattern-${p.id}.png` });
  document.body.append(a);
  a.click();
  setTimeout(() => (URL.revokeObjectURL(a.href), a.remove()), 1000);
}

function patternsWin() {
  const el = h("div.mc-w.is-patterns");
  function update() {
    const b = macaron.brand;
    if (!b) return;
    const list = patternsOf(kitOf(b.body));
    el.replaceChildren(list.length
      ? h("div.kpt-grid", {}, ...list.map((p) => h("figure.kpt-cell", {},
        patternCanvas(p, 960, 640, 1),
        h("figcaption", {}, h("b", {}, p.name),
          h("button.mc-iconkey", { type: "button", title: `Download ${p.name.toLowerCase()} (PNG, 2048 px)`, "aria-label": `Download ${p.name}`, on: { click: () => download(p, b.name) } }, icon("download"))))))
      : h("p.mc-hint", {}, "Add the brand's colours and its logo files: the patterns are made from them."));
  }
  const sig = () => JSON.stringify([macaron.brand?.body.kit.palette, macaron.brand?.body.kit.logos]);
  return { el, update, sig };
}
defineWindow("patterns", { eyebrow: "Brand kit", title: "Patterns", sub: () => macaron.brand?.name ?? "", size: "l", advanced: false, make: patternsWin });
