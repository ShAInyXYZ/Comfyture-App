// Macaron's designs. A design is a stack of layers (text, image, logo, shape) on a background, with
// its own layout for each format. This is the one place a design is drawn: the editor, the
// thumbnails, the PNG export and every frame of a motion render all call drawDesign(), so what you
// edit is what you export. Nothing here touches the page except loading pictures, fonts and logos.
//
// A layer's place is in fractions of the frame (x, y, w, h: 0 to 1); a text's size is a fraction of
// the frame's width, which is 1080 px in every format, so a size reads the same in all of them.

// A format is a frame the design is laid out in. Every frame is 1080 units wide, whatever it is for, so a text's size (a
// fraction of the width) reads the same in all of them; its height follows the shape of the real thing (w x h below).
// `px` is what the real thing is made of when it leaves as a picture (an A4 at 300 dpi, a 728 x 90 banner): the frame is drawn
// at that size, so an export is exactly the size a printer or an ad network asks for. `family` groups them for the Create
// workspace. The three of social posts come first and are as they always were.
const frame = (px, label, name, use, family, safe) => ({ w: 1080, h: Math.round((1080 * px[1]) / px[0]), px, label, name, use, family, safe });
export const FORMATS = {
  "4:5": { label: "4:5", w: 1080, h: 1350, px: [1080, 1350], name: "Portrait", use: "Feed post", family: "social", safe: { l: 0.07, r: 0.07, t: 0.06, b: 0.06 } },
  "1:1": { label: "1:1", w: 1080, h: 1080, px: [1080, 1080], name: "Square", use: "Feed post", family: "social", safe: { l: 0.07, r: 0.07, t: 0.07, b: 0.07 } },
  // a story or reel: the app covers the top (name, progress) and the bottom (caption, reply) and the reel's keys the right edge
  "9:16": { label: "9:16", w: 1080, h: 1920, px: [1080, 1920], name: "Story", use: "Story or reel", family: "social", safe: { l: 0.06, r: 0.1, t: 0.13, b: 0.18 } },
  // video: a cover, a thumbnail, a title card (the player's controls sit along the foot)
  "16:9": frame([1920, 1080], "16:9", "Widescreen", "Video cover or thumbnail", "video", { l: 0.06, r: 0.06, t: 0.1, b: 0.14 }),
  // ads: the three banners every network takes
  "ad-300x250": frame([300, 250], "300×250", "Medium rectangle", "Banner ad 300 × 250", "ads", { l: 0.06, r: 0.06, t: 0.07, b: 0.07 }),
  "ad-728x90": frame([728, 90], "728×90", "Leaderboard", "Banner ad 728 × 90", "ads", { l: 0.02, r: 0.02, t: 0.1, b: 0.1 }),
  "ad-160x600": frame([160, 600], "160×600", "Skyscraper", "Banner ad 160 × 600", "ads", { l: 0.07, r: 0.07, t: 0.03, b: 0.03 }),
  // print: A4 and A5 at 300 dpi, a poster at the A-series shape (150 dpi on A2); a margin that survives a trim
  a4: frame([2480, 3508], "A4", "A4 flyer", "Flyer, A4 at 300 dpi", "print", { l: 0.08, r: 0.08, t: 0.06, b: 0.06 }),
  a5: frame([1748, 2480], "A5", "A5 flyer", "Flyer, A5 at 300 dpi", "print", { l: 0.08, r: 0.08, t: 0.06, b: 0.06 }),
  a5l: frame([2480, 1748], "A5 wide", "A5 landscape", "Flyer or card, A5 landscape at 300 dpi", "print", { l: 0.06, r: 0.06, t: 0.08, b: 0.08 }),
  a2: frame([2480, 3508], "A2", "Poster A2", "Poster, A2 at 150 dpi", "print", { l: 0.07, r: 0.07, t: 0.05, b: 0.05 }),
  // web: a share image, a hero, an email header
  og: frame([1200, 630], "Share", "Share image", "Link preview 1200 × 630", "web", { l: 0.07, r: 0.07, t: 0.1, b: 0.1 }),
  hero: frame([1440, 900], "Hero", "Web hero", "Desktop hero 1440 × 900", "web", { l: 0.07, r: 0.07, t: 0.1, b: 0.1 }),
  email: frame([600, 200], "Email", "Email header", "Email header 600 × 200", "web", { l: 0.05, r: 0.05, t: 0.12, b: 0.12 }),
  // app: a screen of the app, and a store screenshot (the OS draws the status bar and the home bar)
  phone: frame([1170, 2532], "Phone", "App screen", "Phone screen 390 × 844 at 3×", "app", { l: 0.06, r: 0.06, t: 0.08, b: 0.06 }),
  store: frame([1290, 2796], "Store", "Store screenshot", "App store screenshot 1290 × 2796", "app", { l: 0.07, r: 0.07, t: 0.06, b: 0.06 }),
};
/** Every format's key. */
export const ALL_FORMATS = Object.keys(FORMATS);
/** The formats of social posts, the three Macaron began with: what a window shows when it means "the usual ones". */
export const FORMAT_KEYS = ["4:5", "1:1", "9:16"];
/** The families of formats, in the order Create shows them. */
export const FAMILIES = {
  social: { name: "Social", formats: ["4:5", "1:1", "9:16"] },
  ads: { name: "Ads", formats: ["ad-300x250", "ad-728x90", "ad-160x600"] },
  print: { name: "Print", formats: ["a4", "a5", "a5l", "a2"] },
  web: { name: "Web", formats: ["og", "hero", "email"] },
  app: { name: "App", formats: ["phone", "store"] },
  video: { name: "Video", formats: ["16:9"] },
};
export const FAMILY_KEYS = Object.keys(FAMILIES);
/** The short name a format goes by on a key (the classic three by their ratio). */
export const labelOf = (format) => (FORMATS[format] ?? FORMATS["4:5"]).label;
/** The icon of the app's sprite that draws a format's shape. */
export const ratioGlyph = (format) => ({ tall: "ratio-9-16", portrait: "ratio-3-4", square: "ratio-1-1", wide: "ratio-16-9", strip: "ratio-21-9" })[shapeOf(format)];
/** The family a format belongs to. */
export const familyOf = (format) => (FORMATS[format] ?? FORMATS["4:5"]).family;
/** The formats of the family a format belongs to (its siblings, itself too). */
export const familyFormats = (format) => FAMILIES[familyOf(format)].formats;
/**
 * How a frame is shaped, from its height over its width: a strip (a leaderboard, an email header), wide, square, portrait or
 * tall (a story, a phone, a skyscraper). The layout engine thinks in these.
 */
export const shapeOf = (format) => {
  const f = frameOf(format);
  const a = f.h / f.w;
  return a < 0.45 ? "strip" : a < 0.9 ? "wide" : a < 1.15 ? "square" : a < 1.6 ? "portrait" : "tall";
};
/** The size a frame is drawn at when it leaves as a picture: its own pixels, as a scale of the frame (to the pixel). */
export const nativeSize = (format) => {
  const f = frameOf(format);
  return { w: f.px?.[0] ?? f.w, h: f.px?.[1] ?? f.h };
};
export const PURPOSES = ["Launch", "Feature", "Showcase", "Brand", "Offer", "Motion"];
export const STATUSES = ["draft", "review", "approved", "scheduled"];
export const LAYER_TYPES = ["text", "image", "logo", "shape"];
/** What a layer is for, so a layout can place it: the headline, the logo, the hero picture. */
export const ROLES = ["eyebrow", "headline", "sub", "cta", "label", "logo", "hero", "badge", "deco"];
/** The properties that belong to a format's layout; the rest belong to the layer in every format. */
export const LAYOUT_PROPS = ["x", "y", "w", "h", "rot", "size", "lineHeight", "tracking", "align", "valign", "hidden", "crop", "fit"];

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, p) => a + (b - a) * p;
export const round = (v, n = 4) => Math.round(v * 10 ** n) / 10 ** n;
export const uid = (p = "") => `${p}${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 6)}`;
export const frameOf = (format) => FORMATS[format] ?? FORMATS["4:5"];

// ---------------------------------------------------------------- the brand kit as the designs read it

/** The kit of a brand's body, whole: older brands (a flat colour list, two fonts, a logo) are read as one too. */
export function kitOf(body = {}) {
  const k = body.kit ?? {};
  const palette = k.palette?.length ? k.palette : (body.colours ?? []).map((hex, i) => ({ id: `c${i + 1}`, name: `Colour ${i + 1}`, hex }));
  const fonts = body.fonts ?? [];
  const type = {
    display: { family: fonts[0] || "Manrope", weight: 800 },
    text: { family: fonts[0] || "Manrope", weight: 500 },
    mono: { family: fonts[1] || "IBM Plex Mono", weight: 500 },
    ...(k.type ?? {}),
  };
  const logos = k.logos?.length ? k.logos : body.logo?.url ? [{ id: "logo", name: "Logo", kind: "wordmark", tone: "", url: body.logo.url }] : [];
  return { palette, type, logos, rules: k.rules ?? [], voice: k.voice ?? {}, tagline: k.tagline ?? body.tagline ?? "" };
}

/** A colour role (a palette id, or a literal #hex) as a hex. */
export const colorOf = (kit, role, fallback = "#000000") => (typeof role === "string" && role.startsWith("#") ? role : kit.palette.find((p) => p.id === role)?.hex ?? fallback);

const channel = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
export function luminance(hex) {
  const n = parseInt(String(hex).slice(1, 7), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}
/** The WCAG contrast of two colours, 1 to 21. */
export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
export const rgba = (hex, alpha = 1) => {
  const n = parseInt(String(hex).slice(1, 7), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
};

// ---------------------------------------------------------------- layers and layouts

const NAMES = { text: "Text", image: "Image", logo: "Logo", shape: "Shape" };
export function newLayer(type, patch = {}) {
  const base = { id: uid("l"), type, name: NAMES[type] ?? type, x: 0.1, y: 0.1, w: 0.5, h: 0.1, rot: 0, opacity: 1 };
  const more = {
    text: { text: "Your words", fontRole: "text", size: 0.05, lineHeight: 1.15, tracking: 0, align: "left", valign: "top", colorRole: "white", accent: "yellow", role: "label", h: 0 },
    image: { src: "", crop: { x: 0, y: 0, w: 1, h: 1 }, fit: "cover", radius: 0, role: "hero" },
    logo: { logo: "", role: "logo", w: 0.3 },
    shape: { shape: "round", colorRole: "yellow", radius: 0.03, role: "deco" },
  }[type];
  return Object.assign(base, more, patch);
}

/** The layout of a design in a format: its layers as they sit there (the format's own, or a reflowed one), and its background. */
export function layoutOf(design, format, opts = {}) {
  const f = design.formats?.[format];
  let over = f?.layers;
  if (!over && format !== design.format && opts.reflow) over = opts.reflow(design, format);
  // a format's own anim only adds to its layer's timing (where it settles in that format): the timing itself is shared
  const merged = (l) => (over?.[l.id] ? { ...l, ...over[l.id], ...(l.anim && over[l.id].anim ? { anim: { ...l.anim, ...over[l.id].anim } } : {}) } : l);
  return { layers: design.layers.map(merged), bg: { ...design.bg, ...(f?.bg ?? {}) } };
}

/** A design's formats that have a layout of their own (the primary one counts). */
export const ownFormats = (design) => ALL_FORMATS.filter((f) => f === design.format || design.formats?.[f]);

// ---------------------------------------------------------------- pictures, fonts and logos

const pictures = new Map();
const loaded = new Map();
/** A picture by its address, once: its element, kept for drawing. */
export function loadImage(url) {
  if (!pictures.has(url)) {
    pictures.set(url, new Promise((ok, no) => {
      const img = new Image();
      img.onload = () => (loaded.set(url, img), ok(img));
      img.onerror = () => no(new Error(`The picture ${url} could not be read.`));
      img.src = url;
    }).catch((e) => (pictures.delete(url), Promise.reject(e))));
  }
  return pictures.get(url);
}
export const imageNow = (url) => loaded.get(url) ?? null;

// a logo file as vectors: its rectangles and paths, so it is drawn exactly as supplied and its lid can lift. A picture
// (PNG, WebP) or an SVG that is more than rectangles and paths is drawn as the picture it is, whole.
const vectors = new Map();
const vectorsNow = new Map();
const PLAIN = new Set(["svg", "rect", "path", "title", "desc", "defs", "metadata"]);
export function loadLogo(url) {
  if (!vectors.has(url)) {
    vectors.set(url, (async () => {
      let size = null;
      if (!/\.(png|webp|jpe?g|gif)(\?|$)/i.test(url)) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`The logo ${url} could not be read.`);
        const svg = new DOMParser().parseFromString(await res.text(), "image/svg+xml").documentElement;
        const [, , vw, vh] = (svg.getAttribute("viewBox") ?? "0 0 0 0").split(/[\s,]+/).map(Number);
        size = vw > 0 && vh > 0 ? [vw, vh] : null;
        const items = [];
        for (const el of svg.querySelectorAll("rect, path")) {
          const t = /translate\(([-\d.]+)[ ,]+([-\d.]+)\)\s*scale\(([-\d.]+)\)/.exec(el.getAttribute("transform") ?? "");
          const item = { fill: el.getAttribute("fill") ?? "#000", at: t ? [Number(t[1]), Number(t[2]), Number(t[3])] : [0, 0, 1], evenodd: el.getAttribute("fill-rule") === "evenodd" };
          if (el.tagName === "rect") items.push({ ...item, rect: ["x", "y", "width", "height", "rx"].map((a) => Number(el.getAttribute(a) ?? 0)) });
          else items.push({ ...item, ...splitLid(el.getAttribute("d") ?? "") });
        }
        if (size && items.length && [...svg.querySelectorAll("*")].every((e) => PLAIN.has(e.tagName.toLowerCase()))) {
          const vec = { w: size[0], h: size[1], items };
          vectorsNow.set(url, vec);
          return vec;
        }
      }
      const img = await loadImage(url);
      const vec = { w: img.naturalWidth || size?.[0] || 300, h: img.naturalHeight || size?.[1] || 100, items: [], raster: img };
      vectorsNow.set(url, vec);
      return vec;
    })().catch((e) => (vectors.delete(url), Promise.reject(e))));
  }
  return vectors.get(url);
}
export const logoNow = (url) => vectorsNow.get(url) ?? null;
/** Whether a logo file is known, once loaded, to have no lid to lift (a traced mark has one; a tile or a picture does not). */
export const lacksLid = (url) => {
  const vec = logoNow(url);
  return !!vec && !vec.items.some((it) => it.lid);
};

/** The colour a logo file is drawn in, as a hex: the mean of its solid pixels (exact for a one-colour logo). Null when it cannot be read. */
export async function logoColour(url) {
  try {
    const img = await loadImage(url);
    const [iw, ih] = [img.naturalWidth || 300, img.naturalHeight || 100];
    const w = 96;
    const h = Math.max(8, Math.round((w * ih) / iw));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    let [r, g, b, n] = [0, 0, 0, 0];
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      n++;
    }
    if (!n) return null;
    const hex = (v) => Math.round(v / n).toString(16).padStart(2, "0");
    return `#${hex(r)}${hex(g)}${hex(b)}`.toUpperCase();
  } catch {
    return null;
  }
}

/**
 * A traced mark is one path of several outlines: the lid is the one outline that sits clear above the
 * rest and is not inside another. It is told apart, never redrawn, so the lid can lift and land.
 */
function splitLid(d) {
  const subs = d.split(/(?=M)/).filter(Boolean);
  const boxes = subs.map((s) => {
    const n = (s.match(/-?\d+\.?\d*/g) ?? []).map(Number);
    const xs = n.filter((_, i) => i % 2 === 0);
    const ys = n.filter((_, i) => i % 2 === 1);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  });
  const inside = (a, b) => a !== b && a.x0 >= b.x0 && a.x1 <= b.x1 && a.y0 >= b.y0 && a.y1 <= b.y1;
  const loose = boxes.map((b, i) => i).filter((i) => !boxes.some((o) => inside(boxes[i], o)));
  const top = loose.sort((a, b) => boxes[a].y0 - boxes[b].y0)[0];
  const biggest = Math.max(...boxes.map((b) => (b.x1 - b.x0) * (b.y1 - b.y0)));
  const lid = loose.length > 1 && top !== undefined && (boxes[top].x1 - boxes[top].x0) * (boxes[top].y1 - boxes[top].y0) < biggest * 0.35 ? top : -1;
  const rest = subs.filter((_, i) => i !== lid).join("");
  return { d, rest: lid >= 0 ? rest : d, lid: lid >= 0 ? subs[lid] : null, lidBox: lid >= 0 ? boxes[lid] : null };
}

/** The fonts a design draws with, loaded before anything is drawn (a canvas does not wait for them). */
export async function ensureFonts(design, kit) {
  const used = new Set([`${kit.type.display.weight} 40px "${kit.type.display.family}"`, `${kit.type.text.weight} 40px "${kit.type.text.family}"`, `${kit.type.mono.weight} 40px "${kit.type.mono.family}"`]);
  for (const l of design?.layers ?? []) if (l.type === "text") used.add(fontString(kit, l, 40));
  await Promise.all([...used].map((f) => document.fonts.load(f).catch(() => null)));
  await document.fonts.ready;
}

/** Whether a picture or a logo a design draws is not in yet: then it is prepared before it is drawn. */
export function missing(design, kit) {
  const srcs = [design.bg?.src, ...Object.values(design.formats ?? {}).map((f) => f?.bg?.src), ...design.layers.filter((l) => l.type === "image").map((l) => l.src)].filter(Boolean);
  const logos = design.layers.filter((l) => l.type === "logo").map((l) => kit.logos.find((x) => x.id === l.logo)?.url).filter(Boolean);
  return srcs.some((u) => !imageNow(u)) || logos.some((u) => !logoNow(u));
}

/** Everything a design draws, brought in: its fonts, its background and picture layers, its logos. */
export async function prepare(design, kit) {
  const urls = new Set();
  const logos = new Set();
  if (design.bg?.src) urls.add(design.bg.src);
  for (const f of Object.values(design.formats ?? {})) if (f?.bg?.src) urls.add(f.bg.src);
  for (const l of design.layers) {
    if (l.type === "image" && l.src) urls.add(l.src);
    if (l.type === "logo") {
      const logo = kit.logos.find((x) => x.id === l.logo);
      if (logo) logos.add(logo.url);
    }
  }
  const results = await Promise.allSettled([ensureFonts(design, kit), ...[...urls].map(loadImage), ...[...logos].map(loadLogo)]);
  return results.filter((r) => r.status === "rejected").map((r) => r.reason.message);
}

// ---------------------------------------------------------------- text

function fontString(kit, layer, px) {
  const f = kit.type[layer.fontRole] ?? kit.type.text;
  return `${layer.weight ?? f.weight ?? 500} ${px}px "${f.family}", system-ui, sans-serif`;
}

/** "Words, with *an accent* and\na new line" as lines of runs. */
export function textRuns(text) {
  return String(text ?? "").split("\n").map((line) => {
    const runs = [];
    let accent = false;
    for (const part of line.split("*")) {
      if (part) runs.push({ t: part, a: accent });
      accent = !accent;
    }
    return runs;
  });
}

/** A text laid out in its box: its lines (each run with its width), and the size of the whole, measured by the context. */
export function layoutText(ctx, layer, kit, W, H, size = layer.size) {
  const px = size * W;
  ctx.font = fontString(kit, layer, px);
  if ("letterSpacing" in ctx) ctx.letterSpacing = `${(layer.tracking ?? 0) * px}px`;
  const boxW = layer.w * W;
  const cap = ctx.measureText("H").actualBoundingBoxAscent || px * 0.72;
  const lh = px * (layer.lineHeight ?? 1.15);
  const lines = [];
  // each paragraph is broken at the box's width, then, when it takes two to five lines, at the narrowest width that keeps
  // the same lines: no single word left alone on the last one (a layer can opt out with balance: false)
  const wrap = (parts, limit) => {
    const out = [];
    let line = { runs: [], w: 0 };
    const end = () => {
      while (line.runs.length && /^\s+$/.test(line.runs.at(-1).t)) line.w -= line.runs.pop().w;
      out.push(line);
      line = { runs: [], w: 0 };
    };
    for (const part of parts) {
      if (part.space) {
        if (line.runs.length) (line.runs.push({ t: part.t, a: part.a, w: part.w }), (line.w += part.w));
        continue;
      }
      if (line.w + part.w > limit && line.runs.length) end();
      line.runs.push({ t: part.t, a: part.a, w: part.w });
      line.w += part.w;
    }
    end();
    return out;
  };
  for (const runs of textRuns(layer.caps ? String(layer.text ?? "").toUpperCase() : layer.text)) {
    const parts = runs.flatMap((run) => run.t.split(/(\s+)/).filter(Boolean).map((t) => ({ t, a: run.a, w: ctx.measureText(t).width, space: /^\s+$/.test(t) })));
    let para = wrap(parts, boxW);
    if (layer.balance !== false && para.length > 1 && para.length <= 5) {
      let [lo, hi] = [Math.max(0, ...parts.filter((x) => !x.space).map((x) => x.w)), boxW];
      for (let i = 0; i < 12 && hi - lo > 1; i++) {
        const mid = (lo + hi) / 2;
        if (wrap(parts, mid).length === para.length) hi = mid;
        else lo = mid;
      }
      para = wrap(parts, hi);
    }
    lines.push(...para);
  }
  return { lines, px, lh, cap, size, width: Math.max(0, ...lines.map((l) => l.w)), height: cap + (lines.length - 1) * lh };
}

/** A text's layout with its size shrunk until it fits its box, when the layer asks for that and has a box. */
export function fitText(ctx, layer, kit, W, H) {
  let size = layer.size;
  let L = layoutText(ctx, layer, kit, W, H, size);
  if (layer.fit !== false && layer.h > 0) for (let i = 0; i < 16 && L.height > layer.h * H * 1.001; i++) L = layoutText(ctx, layer, kit, W, H, (size *= 0.94));
  return L;
}

// ---------------------------------------------------------------- motion

export const EASES = {
  lin: (p) => p,
  out: (p) => 1 - (1 - p) ** 3,
  in: (p) => p ** 3,
  inout: (p) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2),
  back: (p) => 1 + 2.4 * (p - 1) ** 3 + 1.4 * (p - 1) ** 2,
  expo: (p) => (p >= 1 ? 1 : 1 - 2 ** (-10 * p)),
};
export const EFFECTS = {
  none: "None",
  fade: "Fade",
  rise: "Rise",
  drop: "Drop",
  "slide-l": "Slide from left",
  "slide-r": "Slide from right",
  pop: "Pop",
  zoom: "Settle",
  "wipe-r": "Wipe right",
  "wipe-u": "Wipe up",
  ripple: "Ripple",
};
const FX = {
  none: () => ({}),
  fade: (e) => ({ alpha: e }),
  rise: (e) => ({ alpha: e, dy: (1 - e) * 0.035 }),
  drop: (e) => ({ alpha: e, dy: -(1 - e) * 0.045 }),
  "slide-l": (e) => ({ alpha: e, dx: -(1 - e) * 0.1 }),
  "slide-r": (e) => ({ alpha: e, dx: (1 - e) * 0.1 }),
  pop: (e) => ({ alpha: Math.min(1, e * 2.5), sc: 0.78 + 0.22 * e }),
  zoom: (e) => ({ alpha: e, sc: 1.14 - 0.14 * e }),
  "wipe-r": (e) => ({ clip: [0, 0, e, 1] }),
  "wipe-u": (e) => ({ clip: [0, 1 - e, 1, 1] }),
  ripple: (e) => ({ alpha: 1 - e, sc: 0.5 + e * 1.2 }),
};
const SEEN = { visible: true, alpha: 1, dx: 0, dy: 0, sc: 1, clip: null, lid: null };
const GONE = { ...SEEN, visible: false };

/** How a layer looks at a time (seconds): nothing but its rest state when it has no motion, or the time is null. */
export function animState(layer, t) {
  const a = layer.anim;
  if (t == null || !a) return SEEN;
  const t0 = a.t0 ?? 0;
  const t1 = a.t1 ?? Infinity;
  const outDur = a.out && a.out.fx !== "none" ? a.out.dur ?? 0.4 : 0;
  if (t < t0 || t > t1 + outDur) return GONE;
  const s = { ...SEEN };
  const apply = (fx, e, flip) => {
    const v = FX[fx]?.(flip ? 1 - e : e) ?? {};
    if (v.alpha !== undefined) s.alpha *= v.alpha;
    if (v.dx) s.dx += v.dx;
    if (v.dy) s.dy += v.dy;
    if (v.sc) s.sc *= v.sc;
    if (v.clip) s.clip = v.clip;
  };
  if (a.in && a.in.fx !== "none" && t < t0 + (a.in.dur ?? 0.6)) apply(a.in.fx, EASES[a.in.ease ?? "out"](clamp((t - t0) / (a.in.dur ?? 0.6), 0, 1)), false);
  if (a.out && a.out.fx !== "none" && t > t1) apply(a.out.fx, EASES[a.out.ease ?? "inout"](clamp((t - t1) / outDur, 0, 1)), true);
  // it starts displaced and larger or smaller than where it rests, and settles there over a stretch of time
  if (a.settle) {
    const S = a.settle;
    const left = 1 - EASES[S.ease ?? "inout"](clamp((t - S.t0) / Math.max(0.01, S.t1 - S.t0), 0, 1));
    s.dx += (S.dx ?? 0) * left;
    s.dy += (S.dy ?? 0) * left;
    s.sc *= 1 + ((S.sc ?? 1) - 1) * left;
  }
  if (a.lid) {
    const L = a.lid;
    const p = EASES[L.ease ?? "back"](clamp((t - L.t0) / Math.max(0.01, L.dur ?? 0.6), 0, 1));
    // until it lands the lid hovers, a little alive
    const bob = t < L.t0 ? Math.sin(t * 5.2) * 0.012 : 0;
    s.lid = { lift: (L.lift ?? 0.3) * (1 - p) + bob, rot: (L.rot ?? -14) * (1 - p) + bob * 40 };
  }
  return s;
}

// ---------------------------------------------------------------- drawing

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (r > 0 && ctx.roundRect) ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
  else ctx.rect(x, y, w, h);
}

/** The part of a picture a box shows: its crop, trimmed on one side to the box's shape (cover), or whole (contain). */
export function sourceRect(img, crop, boxW, boxH, fit = "cover") {
  const c = crop ?? { x: 0, y: 0, w: 1, h: 1 };
  let sx = c.x * img.naturalWidth;
  let sy = c.y * img.naturalHeight;
  let sw = c.w * img.naturalWidth;
  let sh = c.h * img.naturalHeight;
  if (fit !== "contain") {
    const want = boxW / boxH;
    if (sw / sh > want) {
      const nw = sh * want;
      sx += (sw - nw) / 2;
      sw = nw;
    } else {
      const nh = sw / want;
      sy += (sh - nh) / 2;
      sh = nh;
    }
  }
  return [sx, sy, sw, sh];
}

function drawCover(ctx, img, crop, x, y, w, h, radius = 0, fit = "cover") {
  ctx.imageSmoothingQuality = "high";
  const [sx, sy, sw, sh] = sourceRect(img, crop, w, h, fit);
  if (fit === "contain") {
    const k = Math.min(w / sw, h / sh);
    const dw = sw * k;
    const dh = sh * k;
    ctx.drawImage(img, sx, sy, sw, sh, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    return;
  }
  ctx.save();
  roundedRect(ctx, x, y, w, h, radius);
  ctx.clip();
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  ctx.restore();
}

function gradient(ctx, kit, g, x, y, w, h) {
  const a = ((g.angle ?? 180) * Math.PI) / 180;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const half = (Math.abs(dx) * w + Math.abs(dy) * h) / 2;
  const [cx, cy] = [x + w / 2, y + h / 2];
  const grad = ctx.createLinearGradient(cx - dx * half, cy - dy * half, cx + dx * half, cy + dy * half);
  for (const [at, role, alpha] of g.stops) grad.addColorStop(at, rgba(colorOf(kit, role), alpha));
  return grad;
}

function drawBackground(ctx, bg, kit, W, H) {
  ctx.fillStyle = colorOf(kit, bg.color, "#211927");
  ctx.fillRect(0, 0, W, H);
  const img = bg.src ? imageNow(bg.src) : null;
  if (img) drawCover(ctx, img, bg.crop, 0, 0, W, H);
  if (bg.dim?.alpha) {
    ctx.fillStyle = rgba(colorOf(kit, bg.dim.color ?? "ink"), bg.dim.alpha);
    ctx.fillRect(0, 0, W, H);
  }
  if (bg.grad) {
    ctx.fillStyle = gradient(ctx, kit, bg.grad, 0, 0, W, H);
    ctx.fillRect(0, 0, W, H);
  }
}

/** The pixel box of a layer in a frame (unrotated), its text measured when it is one. */
export function boxOf(ctx, layer, kit, W, H) {
  if (layer.type === "text") {
    const L = fitText(ctx, layer, kit, W, H);
    return { x: layer.x * W, y: layer.y * H, w: layer.w * W, h: layer.h > 0 ? layer.h * H : L.height, L };
  }
  if (layer.type === "logo") {
    const url = kit.logos.find((l) => l.id === layer.logo)?.url;
    const vec = url ? logoNow(url) : null;
    const w = layer.w * W;
    return { x: layer.x * W, y: layer.y * H, w, h: vec ? (w * vec.h) / vec.w : layer.h * H };
  }
  return { x: layer.x * W, y: layer.y * H, w: layer.w * W, h: layer.h * H };
}

let scratch = null;
/** A measurer of layers for the layout sense (macaron-layout.js): each layer's pixel size, a text's lines too. */
export function measurer(kit) {
  scratch ??= document.createElement("canvas").getContext("2d");
  return (layer, W, H) => {
    const b = boxOf(scratch, layer, kit, W, H);
    return { w: b.w, h: b.h, lines: b.L?.lines.length };
  };
}

function drawText(ctx, layer, kit, box, W) {
  const L = box.L;
  ctx.font = fontString(kit, layer, L.px);
  if ("letterSpacing" in ctx) ctx.letterSpacing = `${(layer.tracking ?? 0) * L.px}px`;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  const base = colorOf(kit, layer.colorRole, "#ffffff");
  const accent = colorOf(kit, layer.accent ?? layer.colorRole, base);
  const slack = box.h - L.height;
  const top = box.y + (layer.valign === "middle" ? slack / 2 : layer.valign === "bottom" ? slack : 0);
  L.lines.forEach((line, i) => {
    let x = box.x + (layer.align === "center" ? (box.w - line.w) / 2 : layer.align === "right" ? box.w - line.w : 0);
    const y = top + L.cap + i * L.lh;
    for (const run of line.runs) {
      ctx.fillStyle = run.a ? accent : base;
      ctx.fillText(run.t, x, y);
      x += run.w;
    }
  });
}

function drawLogo(ctx, layer, kit, box, lid) {
  const url = kit.logos.find((l) => l.id === layer.logo)?.url;
  const vec = url ? logoNow(url) : null;
  if (!vec) return;
  if (vec.raster) return ctx.drawImage(vec.raster, box.x, box.y, box.w, (box.w * vec.h) / vec.w);
  const k = box.w / vec.w;
  ctx.save();
  ctx.translate(box.x, box.y);
  ctx.scale(k, k);
  for (const it of vec.items) {
    ctx.fillStyle = it.fill;
    ctx.save();
    ctx.translate(it.at[0], it.at[1]);
    ctx.scale(it.at[2], it.at[2]);
    if (it.rect) {
      roundedRect(ctx, it.rect[0], it.rect[1], it.rect[2], it.rect[3], it.rect[4]);
      ctx.fill();
    } else if (lid && it.lid) {
      ctx.fill(it.restPath ??= new Path2D(it.rest), "evenodd");
      // the lid lifts about its own middle, by a share of the mark's height
      const b = it.lidBox;
      const [cx, cy] = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
      ctx.translate(cx, cy - lid.lift * vec.h);
      ctx.rotate((lid.rot * Math.PI) / 180);
      ctx.translate(-cx, -cy);
      ctx.fill((it.lidPath ??= new Path2D(it.lid)), "evenodd");
    } else {
      ctx.fill((it.path ??= new Path2D(it.d)), it.evenodd ? "evenodd" : "nonzero");
    }
    ctx.restore();
  }
  ctx.restore();
}

function drawShape(ctx, layer, kit, box, W) {
  const fill = colorOf(kit, layer.colorRole, "#f2ff59");
  const r = (layer.radius ?? 0) * W;
  const sh = layer.shadow;
  if (sh) {
    ctx.shadowColor = rgba(sh.color ? colorOf(kit, sh.color) : "#000000", sh.alpha ?? 0.35);
    ctx.shadowBlur = (sh.blur ?? 0.04) * W;
    ctx.shadowOffsetY = (sh.dy ?? 0.015) * W;
  }
  ctx.fillStyle = layer.grad ? gradient(ctx, kit, layer.grad, box.x, box.y, box.w, box.h) : fill;
  if (layer.shape === "ellipse" || layer.shape === "ring") {
    ctx.beginPath();
    ctx.ellipse(box.x + box.w / 2, box.y + box.h / 2, box.w / 2, box.h / 2, 0, 0, Math.PI * 2);
  } else roundedRect(ctx, box.x, box.y, box.w, box.h, layer.shape === "pill" ? Math.min(box.w, box.h) / 2 : layer.shape === "rect" ? 0 : r);
  if (layer.shape === "ring") {
    ctx.lineWidth = Math.max(1, (layer.stroke ?? 0.006) * W);
    ctx.strokeStyle = fill;
    ctx.stroke();
  } else ctx.fill();
  ctx.shadowColor = "transparent";
  if (layer.stroke && layer.shape !== "ring") {
    ctx.lineWidth = layer.stroke * W;
    ctx.strokeStyle = colorOf(kit, layer.strokeColor ?? layer.colorRole);
    ctx.stroke();
  }
}

function drawImageLayer(ctx, layer, box, W, kit) {
  const img = layer.src ? imageNow(layer.src) : null;
  const r = (layer.radius ?? 0) * W;
  if (layer.shadow) {
    ctx.save();
    ctx.shadowColor = rgba(layer.shadow.color ? colorOf(kit, layer.shadow.color) : "#000000", layer.shadow.alpha ?? 0.35);
    ctx.shadowBlur = (layer.shadow.blur ?? 0.04) * W;
    ctx.shadowOffsetY = (layer.shadow.dy ?? 0.015) * W;
    ctx.fillStyle = "#000";
    roundedRect(ctx, box.x, box.y, box.w, box.h, r);
    ctx.fill();
    ctx.restore();
  }
  if (!img) {
    ctx.fillStyle = "rgba(128,128,128,.25)";
    roundedRect(ctx, box.x, box.y, box.w, box.h, r);
    ctx.fill();
    return;
  }
  if (layer.flip) {
    ctx.save();
    ctx.translate(box.x * 2 + box.w, 0);
    ctx.scale(-1, 1);
  }
  drawCover(ctx, img, layer.crop, box.x, box.y, box.w, box.h, r, layer.fit);
  if (layer.flip) ctx.restore();
  if (layer.stroke) {
    ctx.lineWidth = layer.stroke * W;
    ctx.strokeStyle = colorOf(kit, layer.strokeColor ?? "white");
    roundedRect(ctx, box.x, box.y, box.w, box.h, r);
    ctx.stroke();
  }
}

/**
 * Draws a design into a 2D context, w x h pixels, in a format, at a time (seconds) or at rest (t null).
 * Pictures, logos and fonts must be brought in first (prepare). Answers with each layer's pixel box
 * (for picking and handles) and the first line of trouble drawing, if any.
 */
export function drawDesign(ctx, design, { w: W, h: H, format = design.format, kit, t = null, reflow, only, boxesOnly = false }) {
  const lay = layoutOf(design, format, { reflow });
  const boxes = [];
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.shadowColor = "transparent";
  if (!boxesOnly) drawBackground(ctx, lay.bg, kit, W, H);
  for (const layer0 of lay.layers) {
    if (layer0.hidden || (only && !only.includes(layer0.id))) continue;
    const st = animState(layer0, t);
    if (!st.visible) continue;
    const layer = layer0;
    const box = boxOf(ctx, layer, kit, W, H);
    boxes.push({ id: layer.id, x: box.x, y: box.y, w: box.w, h: box.h, rot: layer.rot ?? 0 });
    if (boxesOnly) continue;
    ctx.save();
    ctx.globalAlpha = clamp((layer.opacity ?? 1) * st.alpha, 0, 1);
    const [cx, cy] = [box.x + box.w / 2 + st.dx * W, box.y + box.h / 2 + st.dy * H];
    ctx.translate(cx, cy);
    if (layer.rot) ctx.rotate((layer.rot * Math.PI) / 180);
    if (st.sc !== 1) ctx.scale(st.sc, st.sc);
    ctx.translate(-(box.x + box.w / 2), -(box.y + box.h / 2));
    if (st.clip) {
      // a lid lifted above the logo is outside its box: the reveal leaves room for it
      const up = st.lid && st.clip[1] <= 0 ? Math.max(0, st.lid.lift) * box.h * 1.2 + box.h * 0.1 : 0;
      ctx.beginPath();
      ctx.rect(box.x + st.clip[0] * box.w - 2, box.y + st.clip[1] * box.h - 2 - up, (st.clip[2] - st.clip[0]) * box.w + 4, (st.clip[3] - st.clip[1]) * box.h + 4 + up);
      ctx.clip();
    }
    if (layer.type === "text") drawText(ctx, layer, kit, box, W);
    else if (layer.type === "logo") drawLogo(ctx, layer, kit, box, st.lid);
    else if (layer.type === "shape") drawShape(ctx, layer, kit, box, W);
    else if (layer.type === "image") drawImageLayer(ctx, layer, box, W, kit);
    ctx.restore();
  }
  ctx.restore();
  return boxes;
}

/**
 * A design drawn to a new canvas, ready to be a PNG: at its format's size times a scale, or (native) at the pixels the real
 * thing is made of, the frame stretched to them (an A4 at 300 dpi is 2480 x 3508).
 */
export function renderDesign(design, { format = design.format, kit, scale = 1, native = false, t = null, reflow } = {}) {
  const f = frameOf(format);
  const px = native ? nativeSize(format) : { w: Math.round(f.w * scale), h: Math.round(f.h * scale) };
  const canvas = document.createElement("canvas");
  canvas.width = px.w;
  canvas.height = px.h;
  const ctx = canvas.getContext("2d");
  ctx.scale(px.w / f.w, px.h / f.h);
  drawDesign(ctx, design, { w: f.w, h: f.h, format, kit, t, reflow });
  return canvas;
}

/** The layer under a point (pixels in the frame), the top one first; locked and hidden layers are not hit. */
export function pick(boxes, layers, px, py) {
  for (let i = boxes.length - 1; i >= 0; i--) {
    const b = boxes[i];
    const l = layers.find((x) => x.id === b.id);
    if (!l || l.locked) continue;
    const [cx, cy] = [b.x + b.w / 2, b.y + b.h / 2];
    const a = (-(b.rot ?? 0) * Math.PI) / 180;
    const [dx, dy] = [px - cx, py - cy];
    const [lx, ly] = [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a)];
    if (Math.abs(lx) <= b.w / 2 && Math.abs(ly) <= b.h / 2) return b.id;
  }
  return null;
}
