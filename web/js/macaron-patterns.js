// The brand's patterns: supporting graphics made from its own kit. Four the kit draws by itself (the mark tone on tone on the
// darkest colour, the mark in the signal colour on the lightest, the wordmark in rows on the signal colour, bands in the
// palette's order and proportions), and those Brioche draws when asked (her add_pattern: one tile as SVG shapes, with the
// brand's logo files placed on it, repeated; kept in kit.patterns). A tile she draws keeps only plain shapes, and every colour
// in it is the palette's nearest. Each pattern is drawn on a canvas (the logo files recoloured through their transparency), so
// the Brand kit's frame, the window and a downloaded PNG are the same drawing at different sizes.
import { h, icon } from "./dom.js";
import { kitOf, luminance } from "./design.js";
import { macaron, setKit } from "./macaron.js";
import { defineWindow } from "./macaron-win.js";
import { arming, isArmed, armedNow } from "./macaron-ui.js";
import { askMacaron } from "./macaron-assist.js";

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

// ---------------------------------------------------------------- a tile Brioche drew, made safe and on palette

const SHAPES = new Set(["g", "path", "circle", "ellipse", "rect", "line", "polyline", "polygon"]);
const ATTRS = new Set(["d", "cx", "cy", "r", "rx", "ry", "x", "y", "x1", "y1", "x2", "y2", "width", "height", "points", "transform", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "opacity", "fill-opacity", "stroke-opacity", "fill-rule"]);
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
/** The palette colour nearest to a colour (as the eye sees it, roughly), for a colour that is not the palette's. */
function nearest(c, pal) {
  const v = String(c).trim().toLowerCase();
  if (v === "none" || v === "transparent" || v === "currentcolor") return v;
  let hex = /^#[0-9a-f]{6}$/.test(v) ? v : /^#[0-9a-f]{3}$/.test(v) ? `#${[...v.slice(1)].map((x) => x + x).join("")}` : v === "white" ? "#ffffff" : v === "black" ? "#000000" : null;
  if (!hex) return pal[0];
  const [r, g, b] = rgb(hex);
  return pal.map((p) => {
    const [R, G, B] = rgb(p);
    return [p, 2 * (r - R) ** 2 + 4 * (g - G) ** 2 + 3 * (b - B) ** 2];
  }).sort((a, b2) => a[1] - b2[1])[0][0];
}
/** The tile's drawing with only plain shapes and their geometry and paint kept, every colour the palette's nearest. */
export function cleanTile(svg, pal) {
  const doc = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${svg}</svg>`, "image/svg+xml");
  const root = doc.documentElement;
  if (root.querySelector("parsererror") || root.nodeName !== "svg") return "";
  const walk = (el) => {
    for (const c of [...el.children]) {
      if (!SHAPES.has(c.nodeName)) { c.remove(); continue; }
      for (const a of [...c.attributes]) {
        if (!ATTRS.has(a.name)) c.removeAttribute(a.name);
        else if ((a.name === "fill" || a.name === "stroke") && !/^url\(/i.test(a.value)) c.setAttribute(a.name, nearest(a.value, pal));
        else if (/url\(/i.test(a.value)) c.removeAttribute(a.name);
      }
      walk(c);
    }
  };
  walk(root);
  return [...root.childNodes].filter((n) => n.nodeType === 1).map((n) => new XMLSerializer().serializeToString(n)).join("").replace(/ xmlns="[^"]*"/g, "");
}

/** The patterns of a brand: those Brioche drew (newest first), then the four its kit draws (none without colours). */
export function patternsOf(kit, made = []) {
  const pal = kit.palette.filter((p) => hexOk(p.hex)).map((p) => ({ ...p, hex: p.hex.toLowerCase() }));
  if (!pal.length) return [];
  const hexes = pal.map((p) => p.hex);
  const colour = (id, d) => pal.find((p) => p.id === id)?.hex ?? d;
  const own = made.map((p) => ({
    id: p.id, name: p.name, kind: "tile", own: true, ground: colour(p.ground, hexes[0]), w: p.w || 160, h: p.h || p.w || 160,
    svg: cleanTile(p.svg ?? "", hexes),
    marks: (p.marks ?? []).map((m) => ({ ...m, url: kit.logos.find((l) => l.id === m.logo)?.url, ink: colour(m.ink, null) })).filter((m) => m.url),
  }));
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
  return [...own, ...out];
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
  if (p.kind === "tile") {
    // one tile (her drawing, then the logo files on it, drawn again past each edge so the repeat has no seam), filled over the canvas
    const tw = Math.max(1, Math.round(p.w * scale));
    const th = Math.max(1, Math.round(p.h * scale));
    const tile = h("canvas", { width: tw, height: th });
    const tx = tile.getContext("2d");
    if (p.svg) tx.drawImage(await load(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${tw}" height="${th}" viewBox="0 0 ${p.w} ${p.h}">${p.svg}</svg>`)}`), 0, 0, tw, th);
    for (const m of p.marks) {
      const img = await load(m.url);
      const t = tinted(img, m.ink ?? p.ground, m.size * scale, m.size * scale);
      for (const dx of [-tw, 0, tw]) for (const dy of [-th, 0, th]) {
        tx.save();
        tx.translate(m.x * tw + dx, m.y * th + dy);
        tx.rotate(((m.rotate || 0) * Math.PI) / 180);
        tx.drawImage(t, -t.width / 2, -t.height / 2);
        tx.restore();
      }
    }
    ctx.fillStyle = ctx.createPattern(tile, "repeat");
    ctx.fillRect(0, 0, W, H);
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

const IDEAS = "moons and tea leaves scattered · soft waves of the mark · a checkerboard of the palette";

function patternsWin() {
  const el = h("div.mc-w.is-patterns");
  const rerender = () => update();
  // the prompt is made once and kept: the patterns under it are drawn again, never the field being typed in
  const input = h("input.field", { placeholder: `A new pattern: ${IDEAS}`, "aria-label": "Describe a new pattern" });
  const go = h("button.mc-go", { type: "submit", title: "Brioche draws it from the kit: its colours and its logo files" }, h("span", {}, "Make it"));
  const ask = () => {
    const words = input.value.trim();
    if (!words || macaron.chat.busy) return;
    input.value = "";
    // (the page is not drawn while a field in it has the focus: the field lets go once the ask is sent, so her pattern shows)
    input.blur();
    askMacaron(`Make a new brand pattern: ${words}`);
  };
  const form = h("form.kpt-ask", { on: { submit: (e) => (e.preventDefault(), ask()) } }, input, go);
  const list = h("div.kpt-list");
  el.append(form, list);
  function update() {
    const b = macaron.brand;
    if (!b) return;
    const all = patternsOf(kitOf(b.body), b.body.kit.patterns ?? []);
    const busy = !!macaron.chat.busy;
    input.disabled = busy;
    go.disabled = busy;
    go.firstChild.textContent = busy ? "Brioche is drawing" : "Make it";
    const drop = (p) => {
      const key = `pattern:${p.id}`;
      return h(`button.mc-iconkey.is-danger${isArmed(key) ? ".is-armed" : ""}`, { type: "button", title: isArmed(key) ? "Click again to delete it" : "Delete this pattern", "aria-label": "Delete this pattern",
        on: { click: () => arming(key, rerender, () => setKit("patterns", (macaron.brand.body.kit.patterns ?? []).filter((x) => x.id !== p.id))) } }, icon("trash"));
    };
    list.replaceChildren(all.length
      ? h("div.kpt-grid", {},
        // (while she draws, the place her pattern will take)
        busy ? h("figure.kpt-cell.is-drawing", {}, h("div.kpt-wait", {}, h("span.lamp", { dataset: { tone: "busy" } }), h("span", {}, "Brioche is drawing")), h("figcaption", {}, h("b", {}, "A new pattern"))) : null,
        ...all.map((p) => h(`figure.kpt-cell${p.own ? ".is-own" : ""}`, {},
          patternCanvas(p, 960, 640, 1),
          h("figcaption", {}, h("b", {}, p.name), h("span.kpt-keys", {}, p.own ? drop(p) : null,
            h("button.mc-iconkey", { type: "button", title: `Download ${p.name.toLowerCase()} (PNG, 2048 px)`, "aria-label": `Download ${p.name}`, on: { click: () => download(p, b.name) } }, icon("download")))))))
      : h("p.mc-hint", {}, "Add the brand's colours and its logo files: the patterns are made from them."));
  }
  const sig = () => JSON.stringify([macaron.brand?.body.kit.palette, macaron.brand?.body.kit.logos, macaron.brand?.body.kit.patterns, !!macaron.chat.busy, armedNow()]);
  return { el, update, sig };
}
defineWindow("patterns", { eyebrow: "Brand kit", title: "Patterns", sub: () => macaron.brand?.name ?? "", size: "l", advanced: false, make: patternsWin });
