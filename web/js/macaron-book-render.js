// The brand book's pages, drawn: one renderer for the preview, the viewer and the exports (the PDF and the single file are these
// same canvases), so what is on screen is what leaves. A page is 16 by 10 (1600 x 1000) set in the brand's own
// fonts and colours, built from the kit and the brand's pictures. Pictures, logos and fonts are brought in first; a page that
// cannot find one draws without it and says nothing is wrong: the completeness check (macaron-book-model.js) is what tells.
import { kitOf, loadImage, loadLogo, logoNow, imageNow, prepare, renderDesign, frameOf, colorOf, contrast } from "./design.js";
import { groundOf } from "./macaron-kit.js";
import { PAGES, PAGE_W as W, PAGE_H as H, themeOf, mix, rgbOf, cmykOf, gradeOf, imageryOf, examplesOf, bookText, pageSig, pageById } from "./macaron-book-model.js";

const M = 80;
const INNER = W - 2 * M;
const TOP = 340;
const BOTTOM = H - 108;

// ---------------------------------------------------------------- drawing parts

const fontOf = (kit, role, px, weight) => `${weight ?? kit.type[role]?.weight ?? 500} ${px}px "${kit.type[role]?.family ?? "Manrope"}", system-ui, sans-serif`;

function setType(ctx, o) {
  ctx.font = o.font;
  ctx.fillStyle = o.color;
  ctx.textAlign = o.align ?? "left";
  ctx.textBaseline = o.baseline ?? "alphabetic";
  ctx.letterSpacing = o.tracking ? `${o.tracking}px` : "0px";
}
/** One line of text; answers its width. */
function text(ctx, s, x, y, o) {
  setType(ctx, o);
  ctx.fillText(s, x, y);
  return ctx.measureText(s).width;
}
/** The lines a text breaks into at a width. */
function lines(ctx, s, maxW, o) {
  setType(ctx, o);
  const out = [];
  for (const para of String(s ?? "").split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > maxW) {
        out.push(line);
        line = word;
      } else line = next;
    }
    out.push(line);
  }
  return out;
}
/** A paragraph from a point; answers the y under its last line. */
function paragraph(ctx, s, x, y, maxW, lh, o, max = 99) {
  const all = lines(ctx, s, maxW, o);
  const shown = all.slice(0, max);
  if (all.length > max) shown[max - 1] = `${shown[max - 1].replace(/[\s.,;:]+$/, "")}…`;
  shown.forEach((l, i) => text(ctx, l, x, y + i * lh, o));
  return y + shown.length * lh;
}
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
/** A picture filling a box (cover), corners rounded. */
function fillPic(ctx, img, x, y, w, h, r = 0) {
  if (!img) {
    ctx.fillStyle = "rgba(128,128,128,.18)";
    rr(ctx, x, y, w, h, r);
    ctx.fill();
    return;
  }
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const k = Math.max(w / iw, h / ih);
  const sw = w / k;
  const sh = h / k;
  ctx.save();
  rr(ctx, x, y, w, h, r);
  ctx.clip();
  ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
  ctx.restore();
}
/** A picture fitted whole in a box. */
function contain(ctx, img, x, y, w, h, align = "center") {
  if (!img) return;
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const k = Math.min(w / iw, h / ih);
  const dw = iw * k;
  const dh = ih * k;
  ctx.drawImage(img, align === "left" ? x : x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}
/** A logo file, exactly as supplied, fitted in a box. */
function logo(ctx, url, x, y, w, h, align = "center") {
  const vec = url ? logoNow(url) : null;
  if (!vec) return null;
  const k = Math.min(w / vec.w, h / vec.h);
  const dw = vec.w * k;
  const dh = vec.h * k;
  const ox = align === "left" ? x : x + (w - dw) / 2;
  const oy = y + (h - dh) / 2;
  if (vec.raster) {
    ctx.drawImage(vec.raster, ox, oy, dw, dh);
    return { x: ox, y: oy, w: dw, h: dh };
  }
  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(k, k);
  for (const it of vec.items) {
    ctx.fillStyle = it.fill;
    ctx.save();
    ctx.translate(it.at[0], it.at[1]);
    ctx.scale(it.at[2], it.at[2]);
    if (it.rect) {
      ctx.beginPath();
      ctx.roundRect(it.rect[0], it.rect[1], it.rect[2], it.rect[3], it.rect[4] || 0);
      ctx.fill();
    } else ctx.fill((it.path ??= new Path2D(it.d)), it.evenodd ? "evenodd" : "nonzero");
    ctx.restore();
  }
  ctx.restore();
  return { x: ox, y: oy, w: dw, h: dh };
}
const hair = (ctx, color, x1, y, x2, width = 2) => {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.stroke();
};
const pad = (n) => String(n).padStart(2, "0");

/** The logo file of a kind that reads best on a ground (by the contrast of the colour it is drawn in). */
export function logoFor(kit, kind, ground) {
  const list = kit.logos.filter((l) => l.kind === kind);
  const score = (l) => contrast(colorOf(kit, l.tone, "#888888"), ground);
  return [...list].sort((a, b) => score(b) - score(a))[0] ?? null;
}
const toneName = (kit, l) => (kit.palette.find((p) => p.id === l.tone)?.name ?? l.tone ?? "").replace(/^warm /i, "");

// ---------------------------------------------------------------- the page's furniture

/** The wordmark in the colour that reads on the paper, top left of a page; the brand's name when it has no wordmark. */
function masthead(ctx, c) {
  const { kit, t } = c;
  const word = logoFor(kit, "wordmark", t.paper);
  if (!(word && logo(ctx, word.url, M, 46, 300, 52, "left"))) text(ctx, c.brand, M, 90, { font: fontOf(kit, "display", 34, kit.type.display.weight), color: t.ink, tracking: -0.5 });
}

function furniture(ctx, c, page, n) {
  const { kit, t, brand } = c;
  ctx.fillStyle = t.paper;
  ctx.fillRect(0, 0, W, H);
  masthead(ctx, c);
  if (page.note) {
    const noteLines = lines(ctx, page.note.toUpperCase(), 360, { font: fontOf(kit, "mono", 15, 500), color: t.muted, tracking: 3.5 });
    noteLines.slice(0, 2).forEach((l, i) => text(ctx, l, W - M, 70 + i * 24, { font: fontOf(kit, "mono", 15, 500), color: t.muted, tracking: 3.5, align: "right" }));
  }
  hair(ctx, t.line, M, 126, W - M, 2);
  text(ctx, page.label, M - 4, 268, { font: fontOf(kit, "display", 118, kit.type.display.weight), color: t.ink, tracking: -4 });
  hair(ctx, t.line, M, H - 76, W - M, 2);
  text(ctx, `${pad(n)}  /  ${brand} brand guidelines`, M, H - 38, { font: fontOf(kit, "mono", 14, 500), color: t.muted, tracking: 2 });
  if (kit.tagline) text(ctx, kit.tagline, W - M, H - 38, { font: fontOf(kit, "mono", 14, 500), color: t.muted, align: "right", tracking: 1 });
}
const label = (ctx, c, s, x, y, color) => text(ctx, s.toUpperCase(), x, y, { font: fontOf(c.kit, "mono", 14, 500), color: color ?? c.t.muted, tracking: 4 });
/** A page with nothing to show yet says so, in the one line that says where it will come from. */
const nothing = (ctx, c, msg) => paragraph(ctx, msg, M, TOP + 40, 980, 54, { font: fontOf(c.kit, "display", 38, 600), color: c.t.muted, tracking: -0.5 }, 4);

// ---------------------------------------------------------------- the pages

function cover(ctx, c) {
  const { kit, t, body, brand } = c;
  ctx.fillStyle = t.deep;
  ctx.fillRect(0, 0, W, H);
  const product = body.products?.[0];
  const art = imageNow(product?.cutout?.url ?? product?.photo?.url ?? "");
  const light = contrast(t.deep, t.paper) > contrast(t.deep, t.ink) ? t.paper : t.ink;
  label(ctx, c, "Brand guidelines", M, 92, mix(light, t.deep, 0.15));
  text(ctx, "VOL. 01", W - M, 92, { font: fontOf(kit, "mono", 14, 500), color: mix(light, t.deep, 0.35), align: "right", tracking: 4 });
  hair(ctx, mix(light, t.deep, 0.75), M, 124, W - M, 2);
  if (art) {
    const k = Math.min(780 / art.naturalHeight, 560 / art.naturalWidth);
    const dw = art.naturalWidth * k;
    const dh = art.naturalHeight * k;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.45)";
    ctx.shadowBlur = 50;
    ctx.shadowOffsetY = 26;
    ctx.drawImage(art, W - M - dw + 40, H - dh - 80, dw, dh);
    ctx.restore();
  } else {
    const mark = logoFor(kit, "mark", t.deep);
    ctx.save();
    ctx.globalAlpha = 0.14;
    if (mark) logo(ctx, mark.url, W - 760, 40, 760, 960, "left");
    ctx.restore();
  }
  const word = logoFor(kit, "wordmark", t.deep);
  const drawn = word ? logo(ctx, word.url, M, 240, 880, 300, "left") : null;
  if (!drawn) text(ctx, brand, M, 400, { font: fontOf(kit, "display", 150, kit.type.display.weight), color: t.signal, tracking: -4 });
  const under = drawn ? drawn.y + drawn.h + 56 : 480;
  label(ctx, c, "Brand guidelines", M + 4, under, light);
  hair(ctx, t.signal, M, under + 30, M + 110, 6);
  if (kit.tagline) paragraph(ctx, kit.tagline, M, H - 150, 520, 46, { font: fontOf(kit, "display", 36, 700), color: light, tracking: -1 }, 3);
  text(ctx, new Date().getFullYear().toString(), M, H - 60, { font: fontOf(kit, "mono", 14, 500), color: mix(light, t.deep, 0.4), tracking: 4 });
}

function story(ctx, c, page, n) {
  const { kit, t, body } = c;
  furniture(ctx, c, page, n);
  const br = body.brief ?? {};
  if (!br.pitch && !(br.goals ?? []).length && !br.message) return nothing(ctx, c, "The story begins with the brief: the idea in two lines and the goals.");
  const lw = 800;
  let y = TOP + 28;
  y = paragraph(ctx, br.pitch || kit.tagline || c.brand, M, y, lw, 60, { font: fontOf(kit, "display", 48, kit.type.display.weight), color: t.ink, tracking: -1.2 }, 4);
  // the goals
  const goals = (br.goals ?? []).slice(0, 3);
  const gy = Math.max(y + 36, TOP + 290);
  const gw = lw / Math.max(goals.length, 1);
  goals.forEach((g, i) => {
    const x = M + i * gw;
    hair(ctx, t.line, x, gy, x + gw - 28, 2);
    text(ctx, pad(i + 1), x, gy + 42, { font: fontOf(kit, "mono", 16, 500), color: t.accent, tracking: 4 });
    paragraph(ctx, g, x, gy + 84, gw - 36, 36, { font: fontOf(kit, "display", 28, 700), color: t.ink, tracking: -0.3 }, 2);
  });
  // what we say
  const my = gy + (goals.length ? 170 : 0);
  if (br.message && my < BOTTOM - 70) {
    label(ctx, c, "What we say", M, my);
    paragraph(ctx, br.message, M, my + 36, lw, 30, { font: fontOf(kit, "text", 21, 500), color: t.ink }, Math.max(1, Math.min(3, Math.floor((BOTTOM - my - 40) / 30))));
  }
  // the direction picked, and the story in the book's own words
  const dx = M + lw + 80;
  const dw = W - M - dx;
  const dir = (body.directions ?? []).find((d) => d.picked) ?? body.directions?.[0];
  let dy = TOP + 20;
  if (dir) {
    const bg = dir.bg ? imageNow(dir.bg) : null;
    const dh = 290;
    ctx.fillStyle = t.deep;
    rr(ctx, dx, dy, dw, dh, 24);
    ctx.fill();
    if (bg) fillPic(ctx, bg, dx, dy, dw, dh, 24);
    const l = kit.logos.find((x) => x.id === dir.logo) ?? logoFor(kit, "wordmark", t.deep);
    if (l) logo(ctx, l.url, dx + 70, dy + 60, dw - 140, dh - 120);
    label(ctx, c, "The direction", dx, dy + dh + 44);
    text(ctx, dir.name, dx, dy + dh + 90, { font: fontOf(kit, "display", 32, 800), color: t.ink, tracking: -0.5 });
    dy = paragraph(ctx, dir.note ?? "", dx, dy + dh + 128, dw, 28, { font: fontOf(kit, "text", 20, 500), color: t.muted }, 2);
  }
  const own = bookText(body, "story");
  if (own) {
    const top = Math.max(dy + 24, TOP + 450);
    hair(ctx, t.line, dx, top, W - M, 2);
    paragraph(ctx, own, dx, top + 44, dw, 32, { font: fontOf(kit, "display", 22, 600), color: t.ink, tracking: -0.2 }, Math.max(2, Math.floor((BOTTOM - top - 20) / 32)));
  }
}

function logos(ctx, c, page, n) {
  const { kit, t, body } = c;
  furniture(ctx, c, page, n);
  if (!kit.logos.length) return nothing(ctx, c, "The logo files will be here: a wordmark, a mark and an app icon, in the colours they may be used in.");
  const tones = [...new Set(kit.logos.map((l) => l.tone))];
  const kinds = [["wordmark", "Wordmark"], ["mark", "Mark"], ["icon", "App icon"]];
  const lw = 900;
  let y = TOP - 6;
  const gap = 20;
  const tw = (lw - 3 * gap) / 4;
  const th = 100;
  for (const [kind, name] of kinds) {
    const files = kit.logos.filter((l) => l.kind === kind);
    if (!files.length) continue;
    label(ctx, c, name, M, y + 12, t.ink);
    const row = tones.map((tone) => files.find((l) => l.tone === tone)).filter(Boolean).slice(0, 4);
    row.forEach((l, i) => {
      const x = M + i * (tw + gap);
      const g = l.kind === "icon" ? { hex: mix(t.ink, t.paper, 0.9) } : groundOf(kit, l);
      ctx.fillStyle = g.hex;
      rr(ctx, x, y + 28, tw, th, 18);
      ctx.fill();
      if (contrast(g.hex, t.paper) < 1.25) {
        ctx.strokeStyle = t.line;
        ctx.lineWidth = 2;
        rr(ctx, x, y + 28, tw, th, 18);
        ctx.stroke();
      }
      const p2 = l.kind === "icon" ? 12 : l.kind === "mark" ? 20 : 28;
      logo(ctx, l.url, x + p2, y + 28 + p2, tw - 2 * p2, th - 2 * p2);
      text(ctx, l.kind === "icon" ? `${toneName(kit, l)} tile` : `${toneName(kit, l)} on ${(g.name ?? "").replace(/^warm /i, "").toLowerCase()}`, x + 2, y + 28 + th + 26, { font: fontOf(kit, "mono", 12, 500), color: t.muted, tracking: 1 });
    });
    y += 28 + th + 46;
  }
  // clear space, the smallest size and what is never done, down the right
  const rx = M + lw + 70;
  const rw = W - M - rx;
  const word = logoFor(kit, "wordmark", t.paper) ?? kit.logos[0];
  const mark = logoFor(kit, "mark", t.paper) ?? word;
  label(ctx, c, "Clear space", rx, TOP + 6, t.ink);
  const bx = rx;
  const by = TOP + 26;
  const bh = 170;
  if (word) {
    ctx.save();
    ctx.setLineDash([7, 7]);
    ctx.strokeStyle = t.muted;
    ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, rw, bh);
    ctx.strokeRect(bx + 56, by + 40, rw - 112, bh - 80);
    ctx.restore();
    logo(ctx, word.url, bx + 56, by + 40, rw - 112, bh - 80);
    for (const [cx, cy] of [[bx + 28, by + 28], [bx + rw - 28, by + 28], [bx + 28, by + bh - 28], [bx + rw - 28, by + bh - 28]]) text(ctx, "C", cx, cy, { font: fontOf(kit, "mono", 18, 500), color: t.accent, align: "center", baseline: "middle" });
  }
  const sizes = body.kit?.sizes ?? { mark: 24, wordmark: 96 };
  const sy = by + bh + 44;
  label(ctx, c, "Smallest it may be", rx, sy, t.ink);
  if (mark && word) {
    const mh = sizes.mark * 1.6;
    logo(ctx, mark.url, rx, sy + 24, mh * 0.9, mh, "left");
    text(ctx, `Mark · ${sizes.mark} px`, rx, sy + 24 + mh + 28, { font: fontOf(kit, "mono", 13, 500), color: t.ink, tracking: 1 });
    const wx = rx + 190;
    logo(ctx, word.url, wx, sy + 24 + mh * 0.2, sizes.wordmark * 1.6, mh * 1.2, "left");
    text(ctx, `Wordmark · ${sizes.wordmark} px`, wx, sy + 24 + mh + 28, { font: fontOf(kit, "mono", 13, 500), color: t.ink, tracking: 1 });
  }
  const nevers = kit.rules.filter((r) => r.kind === "dont").slice(0, 2);
  let ny = sy + 24 + sizes.mark * 1.6 + 78;
  if (nevers.length) {
    label(ctx, c, "Never", rx, ny, t.ink);
    ny += 22;
    nevers.forEach((r) => {
      ctx.strokeStyle = t.ink;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(rx + 12, ny + 14, 12, 0, Math.PI * 2);
      ctx.moveTo(rx + 7, ny + 9);
      ctx.lineTo(rx + 17, ny + 19);
      ctx.moveTo(rx + 17, ny + 9);
      ctx.lineTo(rx + 7, ny + 19);
      ctx.stroke();
      ny = paragraph(ctx, r.text, rx + 36, ny + 20, rw - 36, 24, { font: fontOf(kit, "text", 16, 500), color: t.ink }, 2) + 12;
    });
  }
}

function colours(ctx, c, page, n) {
  const { kit, t } = c;
  furniture(ctx, c, page, n);
  const list = kit.palette.slice(0, 8);
  if (!list.length) return nothing(ctx, c, "The palette will be here, each colour with its name, its role and its codes.");
  const total = list.reduce((s, p) => s + (p.share || 0), 0);
  const barH = total ? 40 : 0;
  const bottom = BOTTOM - (total ? barH + 40 : 0);
  const onOf = (hex) => (contrast(hex, t.paper) > contrast(hex, t.ink) ? t.paper : t.ink);
  const rowsN = list.length > 5 ? 2 : 1;
  const perRow = Math.ceil(list.length / rowsN);
  const gap = 28;
  const cw = (INNER - gap * (perRow - 1)) / perRow;
  const rh = (bottom - TOP + 6 - (rowsN - 1) * 30) / rowsN;
  list.forEach((p, i) => {
    const x = M + (i % perRow) * (cw + gap);
    const y = TOP - 6 + Math.floor(i / perRow) * (rh + 30);
    const sw = rowsN === 1 ? rh * 0.5 : rh * 0.34;
    ctx.fillStyle = p.hex;
    rr(ctx, x, y, cw, sw, 20);
    ctx.fill();
    if (contrast(p.hex, t.paper) < 1.25) {
      ctx.strokeStyle = t.line;
      ctx.lineWidth = 2;
      rr(ctx, x, y, cw, sw, 20);
      ctx.stroke();
    }
    let ty = y + sw + 44;
    text(ctx, p.name, x, ty, { font: fontOf(kit, "display", rowsN === 1 ? 34 : 26, kit.type.display.weight), color: t.ink, tracking: -0.8 });
    if (p.role) label(ctx, c, p.role, x, ty + 28);
    ty += 30 + (p.role ? 22 : 0);
    hair(ctx, t.line, x, ty + 6, x + cw, 2);
    const [r, g, b] = rgbOf(p.hex);
    const [cc, m, yy, k] = cmykOf(p.hex);
    const fields = [["HEX", p.hex.toUpperCase()], ["RGB", `${r}  ${g}  ${b}`], ["CMYK", `${cc}  ${m}  ${yy}  ${k}`]];
    fields.forEach(([k2, v], j) => {
      text(ctx, k2, x, ty + 40 + j * 30, { font: fontOf(kit, "mono", 13, 500), color: t.muted, tracking: 3 });
      text(ctx, v, x + 78, ty + 40 + j * 30, { font: fontOf(kit, "mono", 17, 500), color: t.ink, tracking: 1 });
    });
    const dark = contrast(p.hex, t.ink) >= contrast(p.hex, t.paper);
    const ratio = Math.max(contrast(p.hex, t.ink), contrast(p.hex, t.paper));
    if (rowsN === 1) text(ctx, `${dark ? "Ink" : "Paper"} text  ·  ${ratio.toFixed(1)} : 1  ${gradeOf(ratio)}`, x, ty + 40 + 3 * 30 + 16, { font: fontOf(kit, "mono", 13, 500), color: t.muted, tracking: 1 });
    void onOf;
  });
  if (total) {
    const y = BOTTOM - barH;
    let x = M;
    ctx.save();
    rr(ctx, M, y, INNER, barH, barH / 2);
    ctx.clip();
    for (const p of list.filter((q) => q.share)) {
      const w = (INNER * p.share) / total;
      ctx.fillStyle = p.hex;
      ctx.fillRect(x, y, w, barH);
      if (w > 70) text(ctx, `${p.share}%`, x + w / 2, y + barH / 2, { font: fontOf(kit, "mono", 15, 500), color: onOf(p.hex), align: "center", baseline: "middle" });
      x += w;
    }
    ctx.restore();
    ctx.strokeStyle = t.line;
    ctx.lineWidth = 2;
    rr(ctx, M, y, INNER, barH, barH / 2);
    ctx.stroke();
  }
}

function type(ctx, c, page, n) {
  const { kit, t, body, brand } = c;
  // (the brand's own words set in its faces: its name, a line of its voice or message, and neutral figures)
  const pitch = String(body?.brief?.pitch ?? "").split(/(?<=[.!?])\s/)[0].trim();
  const said = (body?.kit?.voice?.lines ?? [])[0]?.say || String(body?.brief?.message ?? "").split(/(?<=[.!?])\s/)[0].trim();
  furniture(ctx, c, page, n);
  const roles = [["display", "Display", "Headlines and big statements"], ["text", "Text", "Reading and supporting copy"], ["mono", "Mono", "Labels, numbers and ids"]];
  const gap = 40;
  const cw = (INNER - gap * 2) / 3;
  roles.forEach(([role, name, use], i) => {
    const x = M + i * (cw + gap);
    const f = kit.type[role];
    hair(ctx, t.line, x, TOP - 6, x + cw, 2);
    label(ctx, c, name, x, TOP + 30, t.ink);
    text(ctx, `${f.family} · ${f.weight}`, x + cw, TOP + 30, { font: fontOf(kit, "mono", 13, 500), color: t.muted, tracking: 1, align: "right" });
    text(ctx, "Aa", x - 4, TOP + 220, { font: fontOf(kit, role, 210, f.weight), color: t.ink, tracking: role === "mono" ? 0 : -7 });
    const sample = f.sample ?? (role === "display" ? (pitch && pitch.length <= 40 ? pitch : brand) : role === "text" ? (said || "A short line in the brand's voice.").slice(0, 90) : "01 · 24 · 12:30 · 0.5");
    const px = role === "display" ? 40 : role === "text" ? 28 : 24;
    const end = paragraph(ctx, sample, x, TOP + 282, cw, px * 1.25, { font: fontOf(kit, role, px, f.weight), color: t.ink, tracking: role === "display" ? -1 : 0 }, 2);
    const ay = Math.max(end + 20, TOP + 372);
    text(ctx, "ABCDEFGHIJKLMNOPQRSTUVWXYZ", x, ay, { font: fontOf(kit, role, 17, f.weight), color: t.muted, tracking: 1 });
    text(ctx, "abcdefghijklmnopqrstuvwxyz", x, ay + 30, { font: fontOf(kit, role, 17, f.weight), color: t.muted, tracking: 1 });
    text(ctx, "0123456789  & ? ! @ #", x, ay + 60, { font: fontOf(kit, role, 17, f.weight), color: t.muted, tracking: 1 });
    paragraph(ctx, f.use ?? use, x, ay + 108, cw, 26, { font: fontOf(kit, "text", 16, 500), color: t.muted }, 2);
  });
}

function voice(ctx, c, page, n) {
  const { kit, t, body } = c;
  furniture(ctx, c, page, n);
  const v = body.kit?.voice ?? {};
  const words = (v.words ?? []).slice(0, 4);
  if (!words.length && !v.summary && !(v.lines ?? []).length) return nothing(ctx, c, "How the brand talks will be here: a few words, a sentence and lines it would and would never say.");
  let y = TOP + 10;
  const step = Math.min(124, (BOTTOM - TOP) / Math.max(words.length, 1));
  words.forEach((w, i) => {
    text(ctx, `${w[0].toUpperCase()}${w.slice(1)}.`, M - 3, y + step * 0.82, { font: fontOf(kit, "display", step * 0.9, kit.type.display.weight), color: i === 0 ? t.accent : t.ink, tracking: -3 });
    y += step;
  });
  const rx = M + 600;
  const rw = W - M - rx;
  let ry = TOP + 6;
  if (v.summary) {
    ry = paragraph(ctx, v.summary, rx, ry + 30, rw, 38, { font: fontOf(kit, "display", 27, 600), color: t.ink, tracking: -0.4 }, 4) + 22;
    hair(ctx, t.line, rx, ry, W - M, 2);
  }
  ry += 40;
  const lns = (v.lines ?? []).slice(0, 4);
  const half = (rw - 60) / 2;
  label(ctx, c, "We say", rx, ry, t.ink);
  label(ctx, c, "We never say", rx + half + 60, ry, t.ink);
  const st = Math.min(104, (BOTTOM - ry - 30) / Math.max(lns.length, 1));
  lns.forEach((l, i) => {
    const ly = ry + 52 + i * st;
    ctx.fillStyle = t.accent;
    ctx.beginPath();
    ctx.arc(rx + 13, ly - 7, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = t.paper;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(rx + 6.5, ly - 7);
    ctx.lineTo(rx + 11.5, ly - 2);
    ctx.lineTo(rx + 20, ly - 12);
    ctx.stroke();
    paragraph(ctx, l.say ?? "", rx + 40, ly, half - 40, 29, { font: fontOf(kit, "text", 21, 600), color: t.ink }, 3);
    if (l.not) {
      const nx = rx + half + 60;
      ctx.strokeStyle = t.muted;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(nx + 13, ly - 7, 13, 0, Math.PI * 2);
      ctx.moveTo(nx + 8, ly - 12);
      ctx.lineTo(nx + 18, ly - 2);
      ctx.moveTo(nx + 18, ly - 12);
      ctx.lineTo(nx + 8, ly - 2);
      ctx.stroke();
      paragraph(ctx, l.not, nx + 40, ly, half - 40, 29, { font: fontOf(kit, "text", 21, 500), color: t.muted }, 3);
      setType(ctx, { font: fontOf(kit, "text", 21, 500), color: t.muted });
      const w = Math.min(half - 40, ctx.measureText(l.not).width);
      hair(ctx, t.muted, nx + 40, ly - 7, nx + 40 + w, 2);
    }
  });
}

/** `n` tiles filling a rectangle, no holes: the box is cut in two along its longer side, again and again. */
function mosaic(rect, n, gap, flip = false) {
  if (n <= 1) return [rect];
  const left = Math.ceil(n / 2);
  const share = (left / n) * (flip ? 0.9 : 1.1);
  const f = Math.min(0.66, Math.max(0.4, share));
  if (rect.w >= rect.h) {
    const w1 = (rect.w - gap) * f;
    return [...mosaic({ x: rect.x, y: rect.y, w: w1, h: rect.h }, left, gap, !flip), ...mosaic({ x: rect.x + w1 + gap, y: rect.y, w: rect.w - w1 - gap, h: rect.h }, n - left, gap, !flip)];
  }
  const h1 = (rect.h - gap) * f;
  return [...mosaic({ x: rect.x, y: rect.y, w: rect.w, h: h1 }, left, gap, !flip), ...mosaic({ x: rect.x, y: rect.y + h1 + gap, w: rect.w, h: rect.h - h1 - gap }, n - left, gap, !flip)];
}

function imagery(ctx, c, page, n) {
  const { kit, t, body } = c;
  furniture(ctx, c, page, n);
  const pics = imageryOf(body).filter((p) => imageNow(p.url)).slice(0, 7);
  const own = bookText(body, "imagery");
  const bottom = own ? BOTTOM - 70 : BOTTOM;
  if (!pics.length) return nothing(ctx, c, "The pictures this brand is made of will be here: the moodboard, the product, what the Studio makes.");
  const tiles = mosaic({ x: M, y: TOP - 6, w: INNER, h: bottom - TOP + 6 }, pics.length, 16);
  tiles.forEach((r, i) => {
    fillPic(ctx, imageNow(pics[i].url), r.x, r.y, r.w, r.h, 20);
    const tag = pics[i].kind.toUpperCase();
    setType(ctx, { font: fontOf(kit, "mono", 12, 500), color: "#fff", tracking: 3 });
    const tw = ctx.measureText(tag).width + 30;
    ctx.fillStyle = "rgba(20,18,24,.62)";
    rr(ctx, r.x + 14, r.y + r.h - 42, tw, 28, 14);
    ctx.fill();
    text(ctx, tag, r.x + 29, r.y + r.h - 22, { font: fontOf(kit, "mono", 12, 500), color: "#fff", tracking: 3 });
  });
  if (own) paragraph(ctx, own, M, bottom + 38, INNER, 30, { font: fontOf(kit, "text", 20, 500), color: t.ink }, 2);
}

function rules(ctx, c, page, n) {
  const { kit, t, body } = c;
  furniture(ctx, c, page, n);
  const half = (INNER - 80) / 2;
  const cols = [["do", "Keep", M], ["dont", "Never", M + half + 80]];
  const most = Math.max(1, ...["do", "dont"].map((k2) => Math.min(6, kit.rules.filter((r) => r.kind === k2).length)));
  const bandTop = BOTTOM - 92;
  for (const [kind, name, x] of cols) {
    label(ctx, c, name, x, TOP + 4, t.ink);
    let y = TOP + 24;
    const items = kit.rules.filter((r) => r.kind === kind).slice(0, 6);
    const room = Math.min(84, (bandTop - 24 - y) / most);
    items.forEach((r, i) => {
      hair(ctx, t.line, x, y, x + half, 2);
      text(ctx, pad(i + 1), x, y + 36, { font: fontOf(kit, "mono", 14, 500), color: kind === "do" ? t.accent : t.muted, tracking: 3 });
      paragraph(ctx, r.text, x + 56, y + 36, half - 56, 26, { font: fontOf(kit, "text", 18, 500), color: t.ink }, Math.max(1, Math.floor((room - 16) / 26)));
      y += room;
    });
    if (!items.length) text(ctx, "Nothing written yet.", x, y + 36, { font: fontOf(kit, "text", 18, 500), color: t.muted });
  }
  ctx.fillStyle = t.deep;
  rr(ctx, M, bandTop, INNER, 84, 22);
  ctx.fill();
  const on = contrast(t.deep, t.paper) > contrast(t.deep, t.ink) ? t.paper : t.ink;
  const sizes = body.kit?.sizes ?? { mark: 24, wordmark: 96 };
  text(ctx, "The brand guard", M + 34, bandTop + 36, { font: fontOf(kit, "display", 22, 800), color: on, tracking: -0.3 });
  paragraph(ctx, `Every design is checked against the palette, the logo files and the safe zones. The mark never goes under ${sizes.mark} px, the wordmark under ${sizes.wordmark} px.`, M + 34, bandTop + 64, INNER - 68, 24, { font: fontOf(kit, "text", 16, 500), color: mix(on, t.deep, 0.15) }, 1);
}

function examples(ctx, c, page, n) {
  const { kit, t, body } = c;
  furniture(ctx, c, page, n);
  const posts = examplesOf(body).slice(0, 4);
  if (!posts.length) return nothing(ctx, c, "The posts this brand makes will be here, approved ones first.");
  const cap = 62;
  const bh = Math.min(500, BOTTOM - TOP - cap + 6);
  const gap = 36;
  // each post as tall as the row, as wide as its shape asks; the row is made narrower when it does not fit
  const shapes = posts.map((d) => frameOf(d.format));
  const natural = shapes.map((f) => (f.w / f.h) * bh);
  const fit = Math.min(1, (INNER - gap * (posts.length - 1)) / natural.reduce((s, w) => s + w, 0));
  const widths = natural.map((w) => w * fit);
  const total = widths.reduce((s, w) => s + w, 0) + gap * (posts.length - 1);
  let x = M + (INNER - total) / 2;
  posts.forEach((d, i) => {
    const w = widths[i];
    const h = bh * fit;
    const y = TOP - 6 + (bh - h) / 2;
    try {
      const art = renderDesign(d, { format: d.format, kit, scale: Math.min(1, (w * 1.6) / shapes[i].w) });
      ctx.save();
      ctx.shadowColor = "rgba(30,20,40,.22)";
      ctx.shadowBlur = 30;
      ctx.shadowOffsetY = 12;
      ctx.fillStyle = t.paper;
      rr(ctx, x, y, w, h, 12);
      ctx.fill();
      ctx.restore();
      ctx.save();
      rr(ctx, x, y, w, h, 12);
      ctx.clip();
      ctx.drawImage(art, x, y, w, h);
      ctx.restore();
    } catch {
      ctx.fillStyle = "rgba(128,128,128,.2)";
      rr(ctx, x, y, w, h, 12);
      ctx.fill();
    }
    paragraph(ctx, d.name, x, TOP - 6 + bh + 30, Math.max(w, 160), 22, { font: fontOf(kit, "text", 17, 700), color: t.ink }, 1);
    text(ctx, `${d.format}  ·  ${d.status}`.toUpperCase(), x, TOP - 6 + bh + 54, { font: fontOf(kit, "mono", 12, 500), color: t.muted, tracking: 3 });
    x += w + gap;
  });
}

const DRAW = { cover, story, logo: logos, colour: colours, type, voice, imagery, rules, examples };

// ---------------------------------------------------------------- bringing things in, drawing, keeping

/** The pictures, logos and fonts a page needs, found in the brand and loaded. What cannot be read is left out. */
async function bringIn(id, body, kit) {
  const urls = new Set();
  const logoUrls = new Set(kit.logos.map((l) => l.url));
  const product = body.products?.[0];
  if (id === "cover") for (const u of [product?.cutout?.url, product?.photo?.url]) u && urls.add(u);
  if (id === "story") for (const d of body.directions ?? []) d.bg && urls.add(d.bg);
  if (id === "imagery") for (const p of imageryOf(body).slice(0, 7)) urls.add(p.url);
  const fonts = new Set();
  for (const role of ["display", "text", "mono"]) for (const w of [kit.type[role]?.weight ?? 500, 400, 500, 600, 700, 800]) fonts.add(`${w} 40px "${kit.type[role]?.family}"`);
  const jobs = [...[...urls].map(loadImage), ...[...logoUrls].map(loadLogo), ...[...fonts].map((f) => document.fonts.load(f).catch(() => null))];
  if (id === "examples") for (const d of examplesOf(body).slice(0, 4)) jobs.push(prepare(d, kit));
  await Promise.allSettled(jobs);
  await document.fonts.ready;
}

const kept = new Map();
/** A page of a brand, drawn (kept while what it is built from is the same). Answers a canvas, 1600 x 1000. */
export async function renderPage(id, brand) {
  const body = brand.body;
  const sig = pageSig(body, id);
  const key = `${brand.id}:${id}`;
  const was = kept.get(key);
  if (was?.sig === sig) return was.canvas;
  const kit = kitOf(body);
  await bringIn(id, body, kit);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  const n = PAGES.findIndex((p) => p.id === id) + 1;
  const c = { kit, t: themeOf(kit), body, brand: brand.name };
  try {
    DRAW[id](ctx, c, pageById(id), n);
  } catch (e) {
    console.warn(`brand book, ${id}:`, e);
  }
  kept.set(key, { sig, canvas });
  return canvas;
}
/** The page as it was last drawn, or null (the preview shows it while the next one is on its way). */
export const drawnPage = (id, brand) => kept.get(`${brand.id}:${id}`)?.canvas ?? null;
/** Every page of the book, drawn in order. */
export async function renderBook(brand, onPage) {
  const out = [];
  for (const p of PAGES) {
    out.push(await renderPage(p.id, brand));
    onPage?.(out.length, PAGES.length);
  }
  return out;
}
/** The pages as JPEG files (bytes), for the PDF and the single-file book. */
export async function pageJpegs(brand, onPage, quality = 0.9) {
  const canvases = await renderBook(brand, onPage);
  return Promise.all(canvases.map(async (cv) => {
    const blob = await new Promise((ok) => cv.toBlob(ok, "image/jpeg", quality));
    return { jpeg: new Uint8Array(await blob.arrayBuffer()), width: cv.width, height: cv.height };
  }));
}
