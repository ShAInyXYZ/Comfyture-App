// Lyrics: a line sung, each of its words timed. This module is the one place that lays a line out
// and says what each word is doing at a moment: the preview draws that, and lyricAss() writes the
// same as ASS subtitles (karaoke fill, pop-in, bounce) for the film, so a frame of one is a frame of
// the other. Words are measured from the font's own advance widths (the face the film draws them
// in), so both lay the line out alike. Pure functions, no DOM: the browser and the server import it.

import { FACES } from "./lyric-faces.js";

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v, d) => (v !== null && v !== "" && v !== undefined && Number.isFinite(Number(v)) ? Number(v) : d);
const lerp = (a, b, p) => a + (b - a) * p;
const cs = (v) => Math.round(v * 100) / 100;

/**
 * The caption styles drawn word by word, and what makes each of them: `anim` is how a word arrives (fill: its colour
 * sweeps in as it is sung; pop and bounce: it jumps; cut: it appears at once, as typed; fade: it fades in), `face` the
 * letters it is drawn in (the lyric face, or one of lyric-faces.js), then its look: capitals (`caps`), one word to a row
 * (`stack`), a box behind each row (`box`), a glow in the lit colour (`glow`), hollow letters (`hollow`), letter-spacing
 * in em (`spacing`), a turn in degrees clockwise (`tilt`), a size and an outline thickness as shares of the usual
 * (`scale`, `bordK`; `outline: false` draws none), and the colours it is written in when the line has none of its own.
 * karaoke, pop and bounce are the first three Jam and Cut had: they are drawn exactly as they were.
 */
export const LOOKS = {
  karaoke: { name: "Karaoke pop", anim: "fill" },
  pop: { name: "Pop-in", anim: "pop" },
  bounce: { name: "Bounce", anim: "bounce" },
  stack: { name: "Bold stack", anim: "pop", caps: true, stack: true, scale: 1.18, hi: "#F2FF59" },
  type: { name: "Typewriter", anim: "cut", face: "type", caps: true, stack: true, leading: 1.2, box: { color: "#0D0D10", alpha: 0.72 }, scale: 0.74, outline: false, hi: "#F2FF59" },
  neon: { name: "Neon", anim: "fill", glow: true, outline: false, color: "#8EF6FF", hi: "#FF5CE1" },
  outline: { name: "Outline", anim: "fill", hollow: true, caps: true, scale: 1.04, bordK: 0.95, hi: "#F2FF59" },
  hand: { name: "Handwritten", anim: "fade", face: "hand", scale: 1.4, tilt: -4, bordK: 0.8, hi: "#F2FF59" },
  minimal: { name: "Minimal", anim: "fade", caps: true, spacing: 0.16, scale: 0.68, bordK: 0.45, hi: "#FFFFFF" },
  comic: { name: "Comic", anim: "bounce", face: "comic", caps: true, scale: 1.16, tilt: -5, bordK: 1.5, hi: "#FFE24A" },
};
/** How a word may arrive, whatever the style (a line may name one of its own: item.anim); the style's own is used otherwise. */
export const ANIMS = [["fill", "Word highlight"], ["pop", "Pop in"], ["bounce", "Bounce"], ["cut", "Typed"], ["fade", "Fade in"]];
const ANIM_IDS = new Set(ANIMS.map(([id]) => id));

/** The styles of the Cut editor's list (Kitchen's inspector and Jam's gallery): every look, then the plain ones. */
export const LYRIC_STYLES = [...Object.entries(LOOKS).map(([id, l]) => [id, l.name]), ["lower", "Lower third"], ["none", "Off"]];
/** The styles drawn word by word (the others are a plain title). */
export const ANIMATED = new Set(Object.keys(LOOKS));
export const LYRIC_FONT = { family: "Comfyture Lyric", file: "comfyture-lyric.ttf" };
/** Every face a film's subtitles may be drawn in: the files to put where ffmpeg runs (next to its subtitles file). */
export const LYRIC_FILES = [LYRIC_FONT.file, ...Object.values(FACES).map((f) => f.file)];
export const OUTLINE = "#211927";

// the face (Manrope ExtraBold): units per em, ascent and descent, and the width of each character
const UPM = 2000;
const ASC = 2132;
const DESC = 600;
const WIDTHS = { 400: "  ", 546: "⁄", 552: "'", 560: "·", 592: "IilÌÍÎÏìíîïĨĩĪīĮįİıĺļ", 602: "jĵ", 610: "‘’", 632: ",|¦‚", 640: ".", 643: "ª", 703: "¹", 707: "º", 712: ";", 714: ":", 752: "!¡", 772: "f", 812: "ł", 818: "³", 824: "rŕŗř", 832: "²", 838: "¸", 840: "-­", 858: "[]", 888: "tţťț", 896: "/\\∕", 900: "°", 908: "1", 918: "{}", 924: "()", 928: "ŧ", 948: "*ľ", 954: "“”„", 984: "\"", 1024: "¯", 1026: "J×Ĵ", 1060: "F", 1070: "zźżž", 1080: "÷–†−", 1082: "LĹĻĽ", 1088: "7", 1094: "s§śŝşšș", 1104: "kķ", 1110: "`´", 1122: "Ł", 1126: "?x¿", 1136: "v", 1140: "+yýÿŷ˚ỳỵỷỹ", 1142: "£", 1144: "¨", 1160: "₣", 1166: "ac¢àáâãäåçāăąćĉċč", 1178: "5", 1180: "EÈÉÊËĒĖĘĚ˜", 1182: "3", 1196: "˝", 1200: "¬±ˆˇ", 1202: "ð", 1206: "«»", 1208: "2", 1216: "eèéêëēėęěə", 1220: "TŢŤŦȚ₮", 1230: "4", 1244: "69", 1246: "8", 1248: "bgpþĝğġģ₹", 1250: "dqđ₫", 1254: "oòóôõöøōőơ", 1260: "Y¥ÝŶŸỲỴỶỸ", 1272: "hnuñùúûüĥħńņňŋũūŭůűųư", 1274: "B₿", 1280: "₴", 1282: "$", 1284: "Þ", 1290: "<>µ‹›", 1292: "ß", 1300: "P", 1304: "₱", 1306: "V", 1320: "_", 1330: "K®Ķ", 1340: "RŔŖŘ", 1342: "SŚŜŞŠȘ", 1344: "X", 1348: "&0", 1354: "₺", 1360: "Z¤ŹŻŽ", 1366: "AÀÁÂÃÄÅĀĂĄ", 1368: "^", 1380: "₽", 1388: "€", 1412: "ƒ", 1420: "DĎ", 1428: "ÐĐ", 1440: "•", 1448: "↑↓", 1452: "UÙÚÛÜŨŪŬŮŰŲƯ", 1458: "NÑŃŅŇŊ", 1468: "H~Ĥ", 1472: "…", 1482: "GĜĞĠĢ", 1484: "¶", 1492: "CÇĆĈĊČ", 1500: "=", 1508: "Ħ", 1516: "OQÒÓÔÕÖØŌŐƠ", 1528: "ẞ", 1560: "—", 1616: "ď", 1628: "wŵẁẃẅ", 1720: "M", 1752: "₪", 1800: "%", 1828: "©", 1832: "m", 1834: "@", 1858: "™", 1868: "æ", 1870: "#", 1890: "Æ", 1978: "WŴẀẂẄ", 2022: "œ", 2058: "₩", 2081: "½", 2088: "¾", 2112: "¼", 2222: "Œ" };
const ADV = new Map();
for (const [w, chars] of Object.entries(WIDTHS)) for (const ch of chars) ADV.set(ch, Number(w));

// the other faces, by id: the same numbers (units per em, ascent and descent, an advance for each character)
const OTHER = Object.fromEntries(Object.entries(FACES).map(([id, f]) => {
  const adv = new Map();
  for (const [w, chars] of Object.entries(f.widths)) for (const ch of chars) adv.set(ch, Number(w));
  return [id, { ...f, adv }];
}));
/** A face by id: the lyric face (Manrope) or one of lyric-faces.js. */
export const faceOf = (id) => OTHER[id] ?? { family: LYRIC_FONT.family, file: LYRIC_FONT.file, upm: UPM, asc: ASC, desc: DESC, drop: 0, fallback: 1250, adv: ADV };
/** How wide a text is at a font size (the em, in pixels), by the face's advance widths. */
export const textWidth = (text, em, face = "lyric") => {
  const f = faceOf(face);
  return ([...String(text)].reduce((sum, ch) => sum + (f.adv.get(ch) ?? f.fallback), 0) * em) / f.upm;
};
/** The face's line box, in em: its height (what ASS calls the font size) and how far its middle is above the baseline's middle. */
export const lineOf = (face = "lyric") => {
  const f = faceOf(face);
  return { box: (f.asc + f.desc) / f.upm, mid: (f.asc - f.desc) / 2 / f.upm };
};
export const LINE = lineOf("lyric");

// what a word does as it is sung, in seconds (the preview and the ASS both read these)
export const LYRIC_FADE = 0.12; // a line fades in and out
export const POP = { from: 0.55, peak: 1.12, up: 0.06, settle: 0.1 }; // pop-in: its size at first, at its peak; how long each takes
export const BOUNCE = { up: 0.08, settle: 0.12, sx: 0.92, sy: 1.22 }; // bounce: how far it squashes and stretches, and how long

// ---------------------------------------------------------------- the words of a line

/** How many syllables a word has, by its vowel groups (a rough count, enough to weigh a word). */
export function syllables(word) {
  const w = String(word).toLowerCase().replace(/[^a-zÀ-ɏ]/g, "");
  if (!w) return 1;
  let n = (w.match(/[aeiouyàáâãäåæèéêëìíîïòóôõöøùúûüýœ]+/g) ?? []).length;
  // a silent final e ("made", "line"), not a sounded one ("table")
  if (n > 1 && /[^aeiouyl]e$/.test(w)) n--;
  return Math.max(1, n);
}

/**
 * A line's words spread over its length, each as long as it takes to sing: by its syllables, by
 * its letters, or all alike. Times are seconds from the start of the line.
 */
export function splitWords(text, length, by = "syllables") {
  const words = String(text ?? "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const weight = (w) => (by === "even" ? 1 : by === "letters" ? Math.max(1, w.replace(/[^\p{L}\p{N}]/gu, "").length) : Math.max(1, syllables(w)));
  const weights = words.map(weight);
  const total = weights.reduce((a, b) => a + b, 0);
  let at = 0;
  return words.map((text, i) => {
    const from = at;
    at += (weights[i] / total) * length;
    return { text, from: cs(from), to: cs(i === words.length - 1 ? length : at) };
  });
}

/** The words of a line item: the ones it keeps (kept in range and in order), else the line split by its syllables. */
export function wordsOf(item) {
  const length = num(item.length, 3);
  const given = (Array.isArray(item.words) ? item.words : []).filter((w) => w && String(w.text ?? "").trim());
  if (!given.length) return splitWords(item.text, length);
  return given
    .map((w) => {
      const from = clamp(num(w.from, 0), 0, length);
      return { text: String(w.text).trim(), from: cs(from), to: cs(clamp(num(w.to, from + 0.3), from + 0.02, Math.max(length, from + 0.02))) };
    })
    .sort((a, b) => a.from - b.from);
}

// ---------------------------------------------------------------- how a line looks

const hex = (v, d) => (/^#[0-9a-f]{6}$/i.test(String(v ?? "")) ? String(v).toUpperCase() : d);
/**
 * A lyric item's look: style, where it sits (the middle of its block, as fractions of the frame), size (the em, over the
 * frame's short side), colours, and what its style makes of them (LOOKS: the face, capitals, a stack, a box, a glow...).
 */
export function lyricLook(item) {
  const style = ANIMATED.has(item.style) ? item.style : "karaoke";
  const k = LOOKS[style];
  return {
    style,
    anim: ANIM_IDS.has(item.anim) ? item.anim : k.anim,
    face: k.face ?? "lyric",
    caps: !!k.caps,
    stack: !!k.stack,
    box: k.box ?? null,
    glow: !!k.glow,
    hollow: !!k.hollow,
    spacing: k.spacing ?? 0,
    tilt: k.tilt ?? 0,
    outline: k.outline !== false,
    bordK: k.bordK ?? 1,
    leading: k.leading ?? (k.stack ? 1.04 : 1.25),
    x: clamp(num(item.x, 0.5), 0, 1),
    y: clamp(num(item.y, 0.74), 0, 1),
    size: clamp(num(item.size, 0.09), 0.03, 0.25) * (k.scale ?? 1),
    color: hex(item.color, k.color ?? "#FFFFFF"),
    hi: hex(item.hi, k.hi ?? "#F2FF59"),
  };
}

/**
 * A line laid out in a frame of w x h pixels: its words wrapped into rows that fit (one to a row in a stack), each word's
 * middle and width, the em, the ASS font size, the outline, the boxes behind the rows. The same numbers draw the preview.
 */
export function layoutLyric(item, W, H) {
  const look = lyricLook(item);
  const words = wordsOf(item);
  const line = lineOf(look.face);
  const em = look.size * Math.min(W, H);
  const sp = look.spacing * em;
  const shown = (t) => (look.caps ? t.toUpperCase() : t);
  const measure = (t) => textWidth(t, em, look.face) + sp * [...t].length;
  const gap = measure(" ");
  const room = W * 0.9;
  const rows = [];
  words.forEach((w, i) => {
    const text = shown(w.text);
    const width = measure(text);
    let row = rows.at(-1);
    if (!row || look.stack || (row.words.length && row.width + gap + width > room)) rows.push((row = { words: [], width: 0 }));
    row.width += (row.words.length ? gap : 0) + width;
    row.words.push({ i, text, w: width });
  });
  const step = em * look.leading;
  const top = look.y * H - (rows.length * step) / 2 + step / 2;
  const placed = [];
  const boxes = [];
  rows.forEach((row, k) => {
    const cy = top + k * step;
    // a row stays inside the frame, even where the block sits near an edge
    const half = row.width / 2;
    const centre = clamp(look.x * W, Math.min(half + em * 0.2, W / 2), Math.max(W - half - em * 0.2, W / 2));
    let x = centre - half;
    for (const w of row.words) {
      placed.push({ ...w, cx: x + w.w / 2, cy, row: k });
      x += w.w + gap;
    }
    if (look.box) boxes.push({ row: k, i: row.words[0].i, cx: centre, cy, w: row.width + em * 0.5, h: em * 1.12 });
  });
  // a turned line turns as one: its words go round the middle of the block, each turned where it stands
  if (look.tilt) {
    const a = (look.tilt * Math.PI) / 180;
    const [bx, by] = [look.x * W, look.y * H];
    for (const p of placed) {
      const [dx, dy] = [p.cx - bx, p.cy - by];
      [p.cx, p.cy] = [bx + dx * Math.cos(a) - dy * Math.sin(a), by + dx * Math.sin(a) + dy * Math.cos(a)];
    }
  }
  const base = Math.max(1.5, Math.round(em * 0.075 * 100) / 100);
  const bord = look.outline ? Math.round(base * look.bordK * 100) / 100 : 0;
  // (`drop`: how far lower the film draws this face than a browser does, for the preview to follow)
  return { look, words, placed, boxes, rows: rows.length, em, line, boxH: em * line.box, fs: em * line.box, bord, step, drop: em * faceOf(look.face).drop };
}

/** How long a word takes to fade in (the fade styles). */
export const WORD_FADE = 0.16;

/**
 * What a word is doing at a time (seconds from the line's start) in a line of this length: whether
 * it shows, its opacity, its size, whether it is the lit one, and (fill) how far its fill has come.
 */
export function wordState(style, word, rel, length, own = null) {
  const anim = ANIM_IDS.has(own) ? own : (LOOKS[style] ?? LOOKS.karaoke).anim;
  const out = { show: true, alpha: 1, sx: 1, sy: 1, hi: false, fill: 0 };
  if (rel < 0 || rel >= length) return { ...out, show: false, alpha: 0 };
  const fadeIn = anim === "pop" || anim === "cut" ? 0 : LYRIC_FADE;
  out.alpha = clamp(Math.min(fadeIn ? rel / fadeIn : 1, (length - rel) / LYRIC_FADE), 0, 1);
  const u = rel - word.from;
  if (anim === "fill") out.fill = clamp(u / Math.max(0.01, word.to - word.from), 0, 1);
  else if (anim === "pop") {
    if (u < 0) return { ...out, show: false };
    out.sx = out.sy = u < POP.up ? lerp(POP.from, POP.peak, u / POP.up) : u < POP.up + POP.settle ? lerp(POP.peak, 1, (u - POP.up) / POP.settle) : 1;
    out.hi = rel < word.to;
  } else if (anim === "bounce") {
    out.hi = u >= 0 && rel < word.to;
    if (u >= 0 && u < BOUNCE.up) {
      out.sx = lerp(1, BOUNCE.sx, u / BOUNCE.up);
      out.sy = lerp(1, BOUNCE.sy, u / BOUNCE.up);
    } else if (u >= BOUNCE.up && u < BOUNCE.up + BOUNCE.settle) {
      out.sx = lerp(BOUNCE.sx, 1, (u - BOUNCE.up) / BOUNCE.settle);
      out.sy = lerp(BOUNCE.sy, 1, (u - BOUNCE.up) / BOUNCE.settle);
    }
  } else if (anim === "cut") {
    if (u < 0) return { ...out, show: false };
    out.hi = rel < word.to;
  } else if (anim === "fade") {
    if (u < 0) return { ...out, show: false };
    out.alpha *= clamp(u / WORD_FADE, 0, 1);
    out.hi = rel < word.to;
  }
  return out;
}

// ---------------------------------------------------------------- the same lines as ASS subtitles

const pad = (n, k = 2) => String(n).padStart(k, "0");
const assTime = (t) => {
  const c = Math.max(0, Math.round(t * 100));
  return `${Math.floor(c / 360000)}:${pad(Math.floor(c / 6000) % 60)}:${pad(Math.floor(c / 100) % 60)}.${pad(c % 100)}`;
};
/** "#RRGGBB" as the &HBBGGRR& an override tag takes. */
const assHex = (rgb) => `&H${rgb.slice(5, 7)}${rgb.slice(3, 5)}${rgb.slice(1, 3)}&`;
const f1 = (v) => (Math.round(v * 10) / 10).toString();
const safe = (s) => String(s).replace(/[{}\\]/g, "").replace(/\s+/g, " ");

/**
 * The lyric items of an edit (those drawn word by word) as an ASS file in a frame of W x H pixels
 * (the film's own size, so a position is a pixel): one event for each word, so each sits where
 * layoutLyric put it. Answers null when there is nothing to draw.
 */
export function lyricAss(items, { W, H, T = Infinity, font = LYRIC_FONT.family }) {
  const events = [];
  for (const item of items) {
    const start = num(item.start, 0);
    const length = num(item.length, 3);
    const end = Math.min(start + length, T);
    if (end - start < 0.05 || !String(item.text ?? "").trim() && !(item.words ?? []).length) continue;
    const L = layoutLyric(item, W, H);
    const { style, color, hi, anim } = L.look;
    const fadeMs = Math.round(LYRIC_FADE * 1000);
    // what a look adds to every event of its words: its face, its spacing, its turn, hollow letters (the outline carries the colour)
    const own = L.look.face === "lyric" ? "" : `\\fn${faceOf(L.look.face).family}`;
    const extra = `${own}${L.look.spacing ? `\\fsp${f1(L.look.spacing * L.em)}` : ""}${L.look.tilt ? `\\frz${f1(-L.look.tilt)}` : ""}${L.look.hollow ? "\\1a&HFF&" : ""}`;
    const ink = L.look.hollow ? color : OUTLINE;
    const common = `\\fs${f1(L.fs)}\\bord${L.bord}\\shad0\\3c${assHex(ink)}\\1c${assHex(color)}\\2c${assHex(color)}${extra}`;
    // a glow or a box sits under the words (layer 0), the words over it (layer 1)
    const layer = L.look.glow || L.look.box ? 1 : 0;
    // the line's length, as far as it is on screen
    const len = end - start;
    if (L.look.box) {
      const alpha = Math.round(255 * (1 - L.look.box.alpha)).toString(16).toUpperCase().padStart(2, "0");
      for (const bx of L.boxes) {
        const a = Math.min(L.words[bx.i].from, len);
        const [w, h] = [Math.round(bx.w), Math.round(bx.h)];
        events.push(`Dialogue: 0,${assTime(start + a)},${assTime(start + len)},Lyric,,0,0,0,,{\\an7\\pos(${f1(bx.cx - bx.w / 2)},${f1(bx.cy - bx.h / 2)})\\bord0\\shad0\\1c${assHex(L.look.box.color)}\\1a&H${alpha}&\\fad(0,${fadeMs})\\p1}m 0 0 l ${w} 0 ${w} ${h} 0 ${h}`);
      }
    }
    for (const p of L.placed) {
      const w = L.words[p.i];
      const text = safe(L.look.caps ? w.text.toUpperCase() : w.text);
      const from = Math.min(w.from, len);
      const to = Math.min(w.to, len);
      const pos = `\\pos(${f1(p.cx)},${f1(p.cy)})`;
      const row = (a, b, tags, lay = layer) => events.push(`Dialogue: ${lay},${assTime(start + a)},${assTime(start + b)},Lyric,,0,0,0,,{${tags}}${text}`);
      if (anim === "fill") {
        // waiting in the base colour, then filled as it is sung, staying lit to the end of the line
        const fadeIn = `\\fad(${fadeMs},0)`;
        if (L.look.glow) row(0, len, `\\an5${pos}\\fs${f1(L.fs)}\\bord${f1(L.em * 0.2)}\\blur${f1(L.em * 0.2)}\\shad0\\3c${assHex(hi)}\\1a&HFF&\\3a&H50&${own}${L.look.spacing ? `\\fsp${f1(L.look.spacing * L.em)}` : ""}\\fad(${fadeMs},${fadeMs})`, 0);
        if (from > 0.005) row(0, from, `\\an5${pos}${common}${fadeIn}`);
        const dur = Math.max(1, Math.round((to - from) * 100));
        // a line fading in is still fading in when its first word starts
        const rest = from < LYRIC_FADE && !L.look.hollow ? `\\alpha&H${pad(Math.round(255 * (1 - from / LYRIC_FADE)).toString(16).toUpperCase())}&\\t(0,${Math.round((LYRIC_FADE - from) * 1000)},\\alpha&H00&)` : "";
        // (hollow letters: the part not yet sung has no fill, the sung part has)
        const lit = L.look.hollow ? "\\1a&H00&\\2a&HFF&" : "";
        row(from, len, `\\an5${pos}${common}\\1c${assHex(hi)}\\2c${assHex(color)}${lit}${rest}\\fad(0,${fadeMs})\\kf${dur}`);
      } else if (anim === "pop") {
        const popTo = Math.round(Math.max(0, to - from) * 1000);
        row(from, len, `\\an5${pos}${common}\\1c${assHex(hi)}\\fscx${Math.round(POP.from * 100)}\\fscy${Math.round(POP.from * 100)}\\fad(0,${fadeMs})` +
          `\\t(0,${Math.round(POP.up * 1000)},\\fscx${Math.round(POP.peak * 100)}\\fscy${Math.round(POP.peak * 100)})` +
          `\\t(${Math.round(POP.up * 1000)},${Math.round((POP.up + POP.settle) * 1000)},\\fscx100\\fscy100)` +
          `\\t(${popTo},${popTo + 1},\\1c${assHex(color)})`);
      } else if (anim === "cut" || anim === "fade") {
        // typed in at its time, or faded in; lit while it is sung
        const litTo = Math.round(Math.max(0, to - from) * 1000);
        const fadeIn = anim === "fade" ? Math.round(WORD_FADE * 1000) : 0;
        row(from, len, `\\an5${pos}${common}\\1c${assHex(hi)}\\fad(${fadeIn},${fadeMs})\\t(${litTo},${litTo + 1},\\1c${assHex(color)})`);
      } else {
        // bounce: stretched up from its foot, so it jumps; lit while it is sung
        const a = Math.round(from * 1000);
        const b = Math.round(to * 1000);
        const up = Math.round(BOUNCE.up * 1000);
        const settle = Math.round(BOUNCE.settle * 1000);
        const foot = `\\pos(${f1(p.cx)},${f1(p.cy + L.boxH / 2)})`;
        row(0, len, `\\an2${foot}${common}\\fad(${fadeMs},${fadeMs})` +
          `\\t(${a},${a + 1},\\1c${assHex(hi)})` +
          `\\t(${a},${a + up},\\fscx${Math.round(BOUNCE.sx * 100)}\\fscy${Math.round(BOUNCE.sy * 100)})` +
          `\\t(${a + up},${a + up + settle},\\fscx100\\fscy100)` +
          `\\t(${b},${b + 1},\\1c${assHex(color)})`);
      }
    }
  }
  if (!events.length) return null;
  return [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${W}`,
    `PlayResY: ${H}`,
    "WrapStyle: 2",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Lyric,${font},60,&H00FFFFFF,&H00FFFFFF,&H00211927,&H00000000,0,0,0,0,100,100,0,0,1,4,0,5,0,0,0,1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...events,
    "",
  ].join("\n");
}
