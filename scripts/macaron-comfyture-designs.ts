// The designs of Comfyture's Macaron project: layers on a ground, with a layout for each format.
// Every position is a fraction of the frame, every size a fraction of its width (1080 px).
import { newLayer } from "../web/js/design.js";
import { A } from "./macaron-comfyture-kit.ts";

type Patch = Record<string, any>;
const text = (id: string, words: string, o: Patch = {}) => newLayer("text", { id, name: o.name ?? id, text: words, ...o });
const image = (id: string, src: string, o: Patch = {}) => newLayer("image", { id, name: o.name ?? id, src: src.startsWith("brand/") ? src : `${A}/${src}`, ...o });
const logo = (id: string, which: string, o: Patch = {}) => newLayer("logo", { id, name: o.name ?? "Logo", logo: which, ...o });
const shape = (id: string, kind: string, o: Patch = {}) => newLayer("shape", { id, name: o.name ?? id, shape: kind, ...o });

/** The pieces most layouts share, in their roles. */
const eyebrow = (id: string, words: string, o: Patch = {}) => text(id, words, { role: "eyebrow", fontRole: "mono", size: 0.026, tracking: 0.12, caps: true, ...o });
const headline = (id: string, words: string, o: Patch = {}) => text(id, words, { role: "headline", fontRole: "display", size: 0.1, lineHeight: 1.02, tracking: -0.02, ...o });
const sub = (id: string, words: string, o: Patch = {}) => text(id, words, { role: "sub", fontRole: "text", size: 0.034, lineHeight: 1.3, ...o });

/** A pill and the words in it, the words' cap height centred in the pill whatever the frame's height. */
const pill = (id: string, words: string, x: number, y: number, w: number, hpx: number, H: number, o: Patch = {}) => {
  const size = o.size ?? 0.0245;
  const cap = size * 1080 * 0.72;
  return [
    shape(id, "pill", { name: o.name ?? "Badge", role: "badge", colorRole: o.fill ?? "yellow", x, y, w, h: hpx / H, radius: 0.5, ...(o.shape ?? {}) }),
    text(`${id}-text`, words, { name: `${o.name ?? "Badge"} text`, role: "badge", fontRole: "mono", size, tracking: 0.08, caps: true, align: "center", colorRole: o.ink ?? "ink", x, y: y + (hpx - cap) / 2 / H, w, ...(o.text ?? {}) }),
  ];
};
const pillAt = (id: string, x: number, y: number, w: number, hpx: number, H: number, size = 0.0245) => {
  const cap = size * 1080 * 0.72;
  return { [id]: { x, y, w, h: hpx / H }, [`${id}-text`]: { x, y: y + (hpx - cap) / 2 / H, w } };
};
/** The height of a picture as a share of the frame, from its width as a share of the frame and its shape. */
const tall = (w: number, aspect: number, H: number) => Math.round(((w * 1080) / aspect / H) * 10000) / 10000;
const LOGO_ASPECT = 3579 / 1183;

const WINDOW = { radius: 0.022, shadow: { blur: 0.05, dy: 0.02, alpha: 0.45 } };
const TILE = { radius: 0.022, shadow: { blur: 0.035, dy: 0.012, alpha: 0.5 } };
const SHOT = 1600 / 900;
const POSTER = 720 / 1280;

// ---------------------------------------------------------------- Launch: direct a shot

export const launch = () => ({
  id: "launch", name: "Launch · Direct a shot", purpose: "Launch", status: "approved", format: "4:5", campaign: "Launch week", layout: "left",
  intent: "Awareness: say what Comfyture is in one look.",
  bg: { color: "plum" },
  layers: [
    logo("wordmark", "wordmark-yellow", { name: "Wordmark", x: 0.07, y: 0.07, w: 0.3 }),
    ...pill("badge", "Open source", 0.67, 0.073, 0.26, 63, 1350),
    headline("headline", "Direct a shot.\nOr a *whole film.*", { name: "Headline", x: 0.07, y: 0.19, w: 0.86, colorRole: "white", accent: "yellow" }),
    sub("sub", "One photo in, a cinematic shot with sound out. One sentence in, a short film out.", { name: "Subhead", x: 0.07, y: 0.395, w: 0.6, colorRole: "white", opacity: 0.86 }),
    image("brioche", "brioche.webp", { name: "Brioche", role: "deco", x: 0.7, y: 0.375, w: 0.24, h: tall(0.24, 649 / 746, 1350), fit: "contain" }),
    image("window", "app/home.webp", { name: "The app", role: "hero", x: 0.07, y: 0.55, w: 0.86, h: tall(0.86, SHOT, 1350), ...WINDOW }),
  ],
  formats: {
    "1:1": {
      layers: {
        wordmark: { x: 0.07, y: 0.07, w: 0.26 },
        ...pillAt("badge", 0.69, 0.07, 0.24, 59, 1080),
        headline: { x: 0.07, y: 0.2, w: 0.86, size: 0.088 },
        sub: { x: 0.07, y: 0.4, w: 0.46, size: 0.031 },
        brioche: { x: 0.68, y: 0.35, w: 0.24, h: tall(0.24, 649 / 746, 1080) },
        window: { x: 0.07, y: 0.535, w: 0.7, h: tall(0.7, SHOT, 1080) },
      },
    },
    "9:16": {
      layers: {
        wordmark: { x: 0.06, y: 0.14, w: 0.32 },
        ...pillAt("badge", 0.62, 0.14, 0.28, 63, 1920),
        headline: { x: 0.06, y: 0.235, w: 0.84, size: 0.1 },
        sub: { x: 0.06, y: 0.41, w: 0.5, size: 0.04 },
        brioche: { x: 0.58, y: 0.375, w: 0.31, h: tall(0.31, 649 / 746, 1920) },
        window: { x: 0.06, y: 0.56, w: 0.84, h: tall(0.84, SHOT, 1920) },
      },
    },
  },
});

// ---------------------------------------------------------------- Showcase: made with Comfyture

const tiles = (xs: number[], ys: number[], w: number, H: number, capY: number[], capSize: number) => {
  const h = tall(w, POSTER, H);
  const o: Patch = {};
  xs.forEach((x, i) => {
    o[`tile${i + 1}`] = { x, y: ys[i], w, h };
    o[`cap${i + 1}`] = { x, y: capY[i], w, size: capSize };
  });
  return o;
};

export const showcase = () => ({
  id: "showcase", name: "Showcase · Made with Comfyture", purpose: "Showcase", status: "scheduled", format: "4:5", campaign: "Launch week", layout: "custom",
  intent: "Social proof: real trends, made with Mixer, in one look.",
  bg: { color: "ink" },
  layers: [
    eyebrow("eyebrow", "Made with Comfyture", { name: "Eyebrow", x: 0.07, y: 0.07, w: 0.6, colorRole: "yellow" }),
    headline("headline", "Trends, in\n*one command.*", { name: "Headline", x: 0.07, y: 0.105, w: 0.86, size: 0.092, colorRole: "white", accent: "yellow" }),
    sub("sub", "Pick a trend. Cast your pets. Get the video.", { name: "Subhead", x: 0.07, y: 0.285, w: 0.86, size: 0.031, colorRole: "white", opacity: 0.78 }),
    image("tile1", "made/state-property.webp", { name: "State Property", role: "hero", x: 0.07, y: 0.35, w: 0.26, h: tall(0.26, POSTER, 1350), ...TILE }),
    image("tile2", "made/lights-off.webp", { name: "Lights Off", role: "hero", x: 0.37, y: 0.38, w: 0.26, h: tall(0.26, POSTER, 1350), ...TILE }),
    image("tile3", "made/three-kittens.webp", { name: "Three Kittens", role: "hero", x: 0.67, y: 0.35, w: 0.26, h: tall(0.26, POSTER, 1350), ...TILE }),
    text("cap1", "State Property", { name: "Caption 1", role: "label", fontRole: "mono", size: 0.0245, tracking: 0.08, caps: true, x: 0.07, y: 0.74, w: 0.26, colorRole: "white", opacity: 0.8 }),
    text("cap2", "Lights Off", { name: "Caption 2", role: "label", fontRole: "mono", size: 0.0245, tracking: 0.08, caps: true, x: 0.37, y: 0.77, w: 0.26, colorRole: "white", opacity: 0.8 }),
    text("cap3", "Three Kittens", { name: "Caption 3", role: "label", fontRole: "mono", size: 0.0245, tracking: 0.08, caps: true, x: 0.67, y: 0.74, w: 0.26, colorRole: "white", opacity: 0.8 }),
    logo("wordmark", "wordmark-yellow", { name: "Wordmark", x: 0.07, y: 0.86, w: 0.24 }),
    text("url", "Open source · MIT", { name: "Link", role: "cta", fontRole: "mono", size: 0.0245, tracking: 0.08, caps: true, align: "right", x: 0.5, y: 0.8885, w: 0.43, colorRole: "white", opacity: 0.8 }),
  ],
  formats: {
    "1:1": {
      layers: {
        eyebrow: { x: 0.07, y: 0.07 },
        headline: { x: 0.07, y: 0.1, size: 0.08 },
        sub: { hidden: true },
        ...tiles([0.07, 0.37, 0.67], [0.3, 0.325, 0.3], 0.26, 1080, [0.775, 0.8, 0.775], 0.0245),
        wordmark: { x: 0.07, y: 0.855, w: 0.2 },
        url: { x: 0.5, y: 0.8785, w: 0.43 },
      },
    },
    "9:16": {
      layers: {
        eyebrow: { x: 0.06, y: 0.14 },
        headline: { x: 0.06, y: 0.175, w: 0.84, size: 0.1 },
        sub: { x: 0.06, y: 0.305, w: 0.82, size: 0.034 },
        ...tiles([0.06, 0.34, 0.62], [0.38, 0.41, 0.38], 0.26, 1920, [0.672, 0.702, 0.672], 0.0245),
        wordmark: { x: 0.06, y: 0.745, w: 0.3 },
        url: { x: 0.4, y: 0.7685, w: 0.48 },
      },
    },
  },
});

// ---------------------------------------------------------------- Feature: meet Brioche

const CHIPS = ["Trim", "Grade", "Score", "Render"];
const chips = (xs: number[], y: number, w: number, hpx: number, H: number) => {
  const o: Patch = {};
  CHIPS.forEach((c, i) => Object.assign(o, pillAt(`chip${i + 1}`, xs[i], y, w, hpx, H, 0.0245)));
  return o;
};

export const brioche = () => ({
  id: "brioche", name: "Feature · Meet Brioche", purpose: "Feature", status: "review", format: "4:5", campaign: "Meet the cast", layout: "custom",
  intent: "Feature: the assistant in every room does real edits, and every one can be undone.",
  bg: { color: "white" },
  layers: [
    logo("wordmark", "wordmark-ink", { name: "Wordmark", x: 0.07, y: 0.07, w: 0.28 }),
    ...pill("badge", "The assistant", 0.65, 0.073, 0.28, 63, 1350, { fill: "ink", ink: "yellow" }),
    headline("headline", "Say it.\n*Brioche* does it.", { name: "Headline", x: 0.07, y: 0.19, w: 0.86, size: 0.098, colorRole: "ink", accent: "plum" }),
    shape("bubble", "round", { name: "Speech bubble", role: "deco", colorRole: "yellow", x: 0.07, y: 0.42, w: 0.56, h: 0.215, radius: 0.045 }),
    shape("tail", "rect", { name: "Bubble tail", role: "deco", colorRole: "yellow", x: 0.6, y: 0.585, w: 0.05, h: 0.04, rot: 45 }),
    text("quote", "Trim the first shot to three seconds and put rain under scene two.", { name: "Quote", role: "sub", fontRole: "display", size: 0.039, lineHeight: 1.2, tracking: -0.01, x: 0.1, y: 0.455, w: 0.5, colorRole: "ink", fit: true, h: 0.15 }),
    ...CHIPS.flatMap((c, i) => pill(`chip${i + 1}`, c, 0.07 + i * 0.13, 0.675, 0.12, 50, 1350, { fill: "plum", ink: "white", size: 0.0245, name: c })),
    image("brioche", "brioche.webp", { name: "Brioche", role: "deco", x: 0.62, y: 0.5, w: 0.34, h: tall(0.34, 649 / 746, 1350), fit: "contain" }),
    image("strip", "app/cut.webp", { name: "The editor's bar", role: "hero", x: 0.07, y: 0.79, w: 0.86, h: 0.115, fit: "cover", crop: { x: 0.27, y: 0.83, w: 0.46, h: 0.15 }, ...WINDOW, shadow: { blur: 0.03, dy: 0.012, alpha: 0.3 } }),
  ],
  formats: {
    "1:1": {
      layers: {
        wordmark: { x: 0.07, y: 0.07, w: 0.24 },
        ...pillAt("badge", 0.67, 0.07, 0.26, 59, 1080),
        headline: { x: 0.07, y: 0.18, size: 0.085 },
        bubble: { x: 0.07, y: 0.41, w: 0.5, h: 0.25 },
        tail: { x: 0.54, y: 0.61, w: 0.05, h: 0.05 },
        quote: { x: 0.1, y: 0.445, w: 0.44, size: 0.034, h: 0.19 },
        ...chips([0.07, 0.19, 0.31, 0.43], 0.71, 0.11, 46, 1080),
        brioche: { x: 0.6, y: 0.42, w: 0.33, h: tall(0.33, 649 / 746, 1080) },
        strip: { x: 0.07, y: 0.795, w: 0.86, h: 0.135 },
      },
    },
    "9:16": {
      layers: {
        wordmark: { x: 0.06, y: 0.14, w: 0.3 },
        ...pillAt("badge", 0.6, 0.14, 0.3, 63, 1920),
        headline: { x: 0.06, y: 0.23, w: 0.84, size: 0.1 },
        bubble: { x: 0.06, y: 0.4, w: 0.7, h: 0.15, radius: 0.045 },
        tail: { x: 0.65, y: 0.535, w: 0.05, h: 0.028 },
        quote: { x: 0.1, y: 0.425, w: 0.62, size: 0.04, h: 0.1 },
        ...chips([0.06, 0.18, 0.3, 0.42], 0.575, 0.11, 54, 1920),
        brioche: { x: 0.56, y: 0.56, w: 0.34, h: tall(0.34, 649 / 746, 1920) },
        strip: { x: 0.06, y: 0.75, w: 0.84, h: 0.07 },
      },
    },
  },
});

// ---------------------------------------------------------------- Feature: five rooms

const ROOMS: [string, string, string][] = [
  ["01", "Story", "Writes it"],
  ["02", "Stage", "Blocks it"],
  ["03", "Shot", "Rolls it"],
  ["04", "Cut", "Puts it together"],
  ["05", "Library", "Keeps it"],
];
const roomLayers = (y0: number, step: number, H: number, nameSize: number, descSize: number, x: number, w: number) => {
  const o: Patch = {};
  ROOMS.forEach((_, i) => {
    const y = y0 + i * step;
    const cap = nameSize * 1080 * 0.72;
    const rowH = step * H;
    const mid = (rowH - cap) / 2 / H;
    o[`rule${i + 1}`] = { x, y: y - 0.004, w, h: 0.0022 };
    o[`num${i + 1}`] = { x, y: y + mid + 0.003, w: 0.1, size: 0.0245 };
    o[`room${i + 1}`] = { x: x + 0.1, y: y + mid, w: 0.34, size: nameSize };
    o[`desc${i + 1}`] = { x: x + 0.44, y: y + mid + (nameSize - descSize) * 1080 * 0.72 / H * 0.5 + 0.002, w: w - 0.44, size: descSize };
  });
  return o;
};

export const rooms = () => ({
  id: "rooms", name: "Feature · Five rooms", purpose: "Feature", status: "review", format: "4:5", campaign: "Rooms series", layout: "custom",
  intent: "Explain: Kitchen is five rooms, in the order a film is made.",
  bg: { color: "yellow" },
  layers: [
    logo("wordmark", "wordmark-ink", { name: "Wordmark", x: 0.07, y: 0.07, w: 0.28 }),
    ...pill("badge", "Kitchen", 0.67, 0.073, 0.26, 63, 1350, { fill: "ink", ink: "yellow" }),
    headline("headline", "From one sentence\nto a *finished film.*", { name: "Headline", x: 0.07, y: 0.19, w: 0.86, size: 0.082, colorRole: "ink", accent: "plum" }),
    ...ROOMS.flatMap(([n, name, what], i) => {
      const y = 0.43 + i * 0.1;
      const cap = 0.062 * 1080 * 0.72;
      const mid = (0.1 * 1350 - cap) / 2 / 1350;
      return [
        shape(`rule${i + 1}`, "rect", { name: `Rule ${n}`, role: "deco", colorRole: "ink", x: 0.07, y: y - 0.004, w: 0.86, h: 0.0022 }),
        text(`num${i + 1}`, n, { name: `Number ${n}`, role: "label", fontRole: "mono", size: 0.0245, tracking: 0.08, x: 0.07, y: y + mid + 0.003, w: 0.1, colorRole: "plum" }),
        text(`room${i + 1}`, name, { name: name, role: "sub", fontRole: "display", size: 0.062, tracking: -0.02, x: 0.17, y: y + mid, w: 0.34, colorRole: "ink" }),
        text(`desc${i + 1}`, what, { name: `${name} does`, role: "sub", fontRole: "text", size: 0.034, x: 0.51, y: y + mid + 0.012, w: 0.42, colorRole: "ink", opacity: 0.82 }),
      ];
    }),
  ],
  formats: {
    "1:1": {
      layers: {
        wordmark: { x: 0.07, y: 0.07, w: 0.24 },
        ...pillAt("badge", 0.67, 0.07, 0.26, 59, 1080),
        headline: { x: 0.07, y: 0.17, size: 0.072 },
        ...roomLayers(0.4, 0.105, 1080, 0.054, 0.03, 0.07, 0.86),
      },
    },
    "9:16": {
      layers: {
        wordmark: { x: 0.06, y: 0.14, w: 0.3 },
        ...pillAt("badge", 0.62, 0.14, 0.28, 63, 1920),
        headline: { x: 0.06, y: 0.22, w: 0.84, size: 0.086 },
        ...roomLayers(0.4, 0.085, 1920, 0.066, 0.036, 0.06, 0.84),
      },
    },
  },
});

// ---------------------------------------------------------------- Product hero: shots worth keeping

const JAR = { w: 913, h: 831, label: { x: 0.353, y: 0.56, w: 0.637 } };
/** The jar with the real wordmark laid on its blank label. */
const onLabel = (x: number, y: number, w: number, H: number) => {
  const jarH = tall(w, JAR.w / JAR.h, H);
  const lw = w * JAR.label.w * 0.74;
  const lh = tall(lw, LOGO_ASPECT, H);
  return {
    jar: { x, y, w, h: jarH },
    wordmark: { x: Math.round((x + JAR.label.x * w - lw / 2) * 10000) / 10000, y: Math.round((y + JAR.label.y * jarH - lh / 2) * 10000) / 10000, w: Math.round(lw * 10000) / 10000 },
  };
};

export const hero = () => {
  const p = onLabel(0.1, 0.29, 0.8, 1350);
  return {
    id: "hero", name: "Product hero · Shots worth keeping", purpose: "Launch", status: "approved", format: "4:5", campaign: "Launch week", layout: "custom",
    intent: "Brand: the jar as the product, with the real wordmark on its label.",
    bg: { color: "plum" },
    layers: [
      shape("ring", "ring", { name: "Lid ring", role: "deco", colorRole: "yellow", stroke: 0.004, opacity: 0.35, x: 0.11, y: 0.298, w: 0.78, h: 0.594 }),
      eyebrow("eyebrow", "Put up in a jar", { name: "Eyebrow", x: 0.07, y: 0.07, w: 0.6, colorRole: "yellow" }),
      headline("headline", "Shots worth\n*keeping.*", { name: "Headline", x: 0.07, y: 0.105, w: 0.86, size: 0.115, colorRole: "white", accent: "yellow" }),
      image("jar", "jar-of-shots.webp", { name: "Jar of shots", role: "hero", fit: "contain", ...p.jar }),
      logo("wordmark", "wordmark-ink", { name: "Wordmark on the label", ...p.wordmark }),
      sub("sub", "A desk for making shots, with sound. Open source.", { name: "Subhead", x: 0.07, y: 0.9, w: 0.8, size: 0.028, colorRole: "white", opacity: 0.82 }),
    ],
    formats: {
      "1:1": (() => {
        const q = onLabel(0.44, 0.12, 0.54, 1080);
        return { layers: {
          ring: { x: 0.43, y: 0.08, w: 0.56, h: 0.56 }, eyebrow: { x: 0.07, y: 0.07 }, headline: { x: 0.07, y: 0.105, w: 0.4, size: 0.08 },
          jar: q.jar, wordmark: q.wordmark, sub: { x: 0.07, y: 0.62, w: 0.36, size: 0.03 },
        } };
      })(),
      "9:16": (() => {
        const q = onLabel(0.07, 0.3, 0.86, 1920);
        return { layers: {
          ring: { x: 0.08, y: 0.328, w: 0.84, h: 0.428 }, eyebrow: { x: 0.06, y: 0.14 }, headline: { x: 0.06, y: 0.175, w: 0.84, size: 0.12 },
          jar: q.jar, wordmark: q.wordmark, sub: { x: 0.06, y: 0.775, w: 0.84, size: 0.034 },
        } };
      })(),
    },
  };
};

// ---------------------------------------------------------------- Brand board

const SW: [string, string, string][] = [["yellow", "Yellow", "#F2FF59"], ["ink", "Ink", "#211927"], ["plum", "Plum", "#49378B"], ["white", "Warm white", "#F0EFED"]];

export const board = () => ({
  id: "board", name: "Brand board · Comfyture", purpose: "Brand", status: "approved", format: "4:5", campaign: "Identity", layout: "custom",
  intent: "Brand: the kit on one page, for anyone who makes with it.",
  bg: { color: "ink" },
  layers: [
    logo("wordmark", "wordmark-yellow", { name: "Wordmark", x: 0.07, y: 0.07, w: 0.5 }),
    eyebrow("eyebrow", "Brand board\nLid on C", { name: "Eyebrow", x: 0.68, y: 0.075, w: 0.25, align: "right", colorRole: "white", lineHeight: 1.5 }),
    ...SW.flatMap(([id, name, hex], i) => {
      const x = 0.07 + i * 0.22;
      const dark = id === "yellow" || id === "white";
      return [
        shape(`sw-${id}`, "round", { name: `${name} swatch`, role: "deco", colorRole: id, radius: 0.026, x, y: 0.265, w: 0.2, h: 0.15, ...(id === "ink" ? { stroke: 0.0025, strokeColor: "white" } : {}) }),
        text(`sw-${id}-name`, name, { name: `${name} label`, role: "label", fontRole: "display", size: 0.0285, tracking: -0.01, x: x + 0.02, y: 0.345, w: 0.17, colorRole: dark ? "ink" : "white" }),
        text(`sw-${id}-hex`, hex, { name: `${name} hex`, role: "label", fontRole: "mono", size: 0.0245, tracking: 0.04, x: x + 0.02, y: 0.383, w: 0.17, colorRole: dark ? "ink" : "white", opacity: 0.85 }),
      ];
    }),
    text("aa", "Aa", { name: "Display specimen", role: "headline", fontRole: "display", size: 0.2, tracking: -0.04, lineHeight: 1, x: 0.07, y: 0.47, w: 0.4, colorRole: "white" }),
    text("aa-label", "Manrope 800", { name: "Display label", role: "label", fontRole: "mono", size: 0.0245, tracking: 0.08, caps: true, x: 0.07, y: 0.62, w: 0.4, colorRole: "yellow" }),
    text("zero", "01", { name: "Mono specimen", role: "headline", fontRole: "mono", size: 0.12, tracking: -0.02, lineHeight: 1, x: 0.07, y: 0.67, w: 0.4, colorRole: "white" }),
    text("zero-label", "IBM Plex Mono", { name: "Mono label", role: "label", fontRole: "mono", size: 0.0245, tracking: 0.08, caps: true, x: 0.07, y: 0.77, w: 0.4, colorRole: "yellow" }),
    logo("icon", "icon-yellow", { name: "App icon", x: 0.52, y: 0.47, w: 0.19 }),
    logo("icon-plum", "icon-plum", { name: "App icon · plum", x: 0.74, y: 0.47, w: 0.19 }),
    image("brioche", "brioche.webp", { name: "Brioche", role: "deco", fit: "contain", x: 0.52, y: 0.665, w: 0.19, h: tall(0.19, 649 / 746, 1350) }),
    image("jar", "jar-cutout.webp", { name: "Jar", role: "deco", fit: "contain", x: 0.74, y: 0.705, w: 0.19, h: tall(0.19, 1100 / 946, 1350) }),
    shape("line", "rect", { name: "Rule", role: "deco", colorRole: "white", opacity: 0.25, x: 0.07, y: 0.855, w: 0.86, h: 0.0022 }),
    text("motto", "Keep the lid on.", { name: "Motto", role: "sub", fontRole: "display", size: 0.036, tracking: -0.01, x: 0.07, y: 0.88, w: 0.4, colorRole: "white" }),
    text("tag", "Shots worth keeping.", { name: "Tagline", role: "label", fontRole: "mono", size: 0.0245, tracking: 0.08, caps: true, align: "right", x: 0.5, y: 0.8885, w: 0.43, colorRole: "yellow" }),
  ],
  formats: {
    // the square keeps the same board in a shorter page: the specimens a little smaller, the rule and the motto inside the margin
    "1:1": (() => {
      const L: Record<string, Patch> = {
        aa: { y: 0.46, size: 0.17 }, "aa-label": { y: 0.635 }, zero: { y: 0.685, size: 0.095 }, "zero-label": { y: 0.785 },
        icon: { x: 0.52, y: 0.46, w: 0.19 }, "icon-plum": { x: 0.74, y: 0.46, w: 0.19 },
        brioche: { x: 0.54, y: 0.67, w: 0.15, h: tall(0.15, 649 / 746, 1080) }, jar: { x: 0.76, y: 0.7, w: 0.17, h: tall(0.17, 1100 / 946, 1080) },
        line: { y: 0.855 }, motto: { y: 0.875 }, tag: { y: 0.8856 },
      };
      SW.forEach(([id], i) => {
        const x = 0.07 + i * 0.22;
        L[`sw-${id}`] = { x, y: 0.27, w: 0.2, h: 0.17 };
        L[`sw-${id}-name`] = { x: x + 0.02, y: 0.345 };
        L[`sw-${id}-hex`] = { x: x + 0.02, y: 0.385 };
      });
      return { layers: L };
    })(),
  },
});

// ---------------------------------------------------------------- Motion: the logo and the product, 7 seconds

const resolved = (d: any, format: string) => d.layers.map((l: any) => ({ ...l, ...(d.formats?.[format]?.layers?.[l.id] ?? {}) }));
const r4 = (v: number) => Math.round(v * 10000) / 10000;
// where the lid sits in the wordmark file, as a share of its box: it lifts and lands about this point
const LID = { x: 0.1525, y: 0.129 };

/** How the wordmark starts: large, in the middle, its lid lifted, then settles to where the layout rests. */
function opening(rest: { x: number; y: number; w: number }, H: number, startW: number, cy: number) {
  const h = (rest.w * 1080) / LOGO_ASPECT / H;
  const sc = startW / rest.w;
  const dx = 0.5 - (rest.x + rest.w / 2);
  const dy = cy - (rest.y + h / 2);
  const sh = (startW * 1080) / LOGO_ASPECT / H;
  const lid = { x: 0.5 + (LID.x - 0.5) * startW, y: cy + (LID.y - 0.5) * sh };
  const ringW = 0.2;
  const ringH = (ringW * 1080) / H;
  return { settle: { t0: 2.55, t1: 3.4, dx: r4(dx), dy: r4(dy), sc: r4(sc), ease: "inout" }, ring: { x: r4(lid.x - ringW / 2), y: r4(lid.y - ringH / 2), w: ringW, h: r4(ringH) } };
}

export const intro = () => {
  const L = launch();
  const at = (fmt: string) => Object.fromEntries(resolved(L, fmt).map((l: any) => [l.id, l]));
  const f9 = at("9:16");
  const f11 = at("1:1");
  const f45 = at("4:5");
  const o9 = opening(f9.wordmark, 1920, 0.8, 0.47);
  const o11 = opening(f11.wordmark, 1080, 0.64, 0.46);
  const o45 = opening(f45.wordmark, 1350, 0.72, 0.46);
  const wm = (o: any) => ({ t0: 0.25, in: { fx: "wipe-r", dur: 1.0, ease: "inout" }, lid: { t0: 1.35, dur: 0.5, lift: 0.45, rot: -18, ease: "back" }, settle: o.settle });
  const base = (id: string) => structuredClone(L.layers.find((l: any) => l.id === id)!);
  const lay = (id: string, extra: Patch) => ({ ...base(id), ...(L.formats["9:16"].layers[id] ?? {}), ...extra });
  return {
    id: "intro", name: "Motion · Logo and product intro", purpose: "Motion", status: "approved", format: "9:16", campaign: "Launch week", layout: "custom", motion: true, poster: 4.95, checkAt: [4.95, 7.4],
    intent: "Motion: the lid lifts and lands on the wordmark, which settles into the launch layout, then the end card.",
    bg: { color: "ink" },
    layers: [
      shape("ring", "ring", { name: "Ripple", role: "deco", colorRole: "yellow", stroke: 0.006, ...o9.ring, anim: { t0: 1.78, t1: 2.7, in: { fx: "ripple", dur: 0.85, ease: "out" } } }),
      lay("wordmark", { name: "Wordmark", anim: wm(o9) }),
      ...[lay("badge", {}), lay("badge-text", {})].map((l) => ({ ...l, anim: { t0: 4.6, in: { fx: "pop", dur: 0.5, ease: "back" } } })),
      lay("headline", { anim: { t0: 3.2, in: { fx: "rise", dur: 0.7, ease: "out" } } }),
      lay("sub", { anim: { t0: 3.6, in: { fx: "rise", dur: 0.7, ease: "out" } } }),
      lay("brioche", { anim: { t0: 4.25, in: { fx: "pop", dur: 0.6, ease: "back" } } }),
      lay("window", { anim: { t0: 3.45, in: { fx: "rise", dur: 0.9, ease: "out" } } }),
      shape("end-bg", "rect", { name: "End card ground", role: "deco", colorRole: "yellow", x: 0, y: 0, w: 1, h: 1, anim: { t0: 5.5, in: { fx: "wipe-u", dur: 0.6, ease: "inout" } } }),
      logo("end-wordmark", "wordmark-ink", { name: "End card wordmark", x: 0.12, y: 0.34, w: 0.76, anim: { t0: 5.85, in: { fx: "fade", dur: 0.5, ease: "out" } } }),
      text("end-tag", "Shots worth *keeping.*", { name: "End card line", role: "sub", fontRole: "display", size: 0.062, tracking: -0.02, align: "center", x: 0.06, y: 0.52, w: 0.84, colorRole: "ink", accent: "plum", anim: { t0: 6.1, in: { fx: "rise", dur: 0.5, ease: "out" } } }),
      text("end-url", "github.com/ShAInyXYZ/Comfyture", { name: "End card link", role: "cta", fontRole: "mono", size: 0.0245, tracking: 0.04, align: "center", x: 0.06, y: 0.585, w: 0.84, colorRole: "ink", anim: { t0: 6.3, in: { fx: "rise", dur: 0.4, ease: "out" } } }),
      image("end-brioche", "brioche-cheer.webp", { name: "Brioche, cheering", role: "deco", fit: "contain", x: 0.56, y: 0.63, w: 0.32, h: tall(0.32, 727 / 745, 1920), anim: { t0: 6.1, in: { fx: "pop", dur: 0.55, ease: "back" } } }),
    ],
    formats: {
      "4:5": { layers: {
        ring: o45.ring,
        wordmark: { ...f45.wordmark, anim: { settle: o45.settle } },
        badge: f45.badge, "badge-text": f45["badge-text"], headline: f45.headline, sub: f45.sub, brioche: f45.brioche, window: f45.window,
        "end-wordmark": { x: 0.13, y: 0.25, w: 0.74 }, "end-tag": { x: 0.07, y: 0.5, w: 0.86, size: 0.06 }, "end-url": { x: 0.07, y: 0.575, w: 0.86, size: 0.026 }, "end-brioche": { x: 0.38, y: 0.64, w: 0.26, h: tall(0.26, 727 / 745, 1350) },
      } },
      "1:1": { layers: {
        ring: o11.ring,
        wordmark: { ...f11.wordmark, anim: { settle: o11.settle } },
        badge: f11.badge, "badge-text": f11["badge-text"], headline: f11.headline, sub: f11.sub, brioche: f11.brioche, window: f11.window,
        "end-wordmark": { x: 0.14, y: 0.2, w: 0.72 }, "end-tag": { x: 0.07, y: 0.5, w: 0.86, size: 0.06 }, "end-url": { x: 0.07, y: 0.585, w: 0.86 }, "end-brioche": { x: 0.38, y: 0.62, w: 0.26, h: tall(0.26, 727 / 745, 1080) },
      } },
    },
  };
};
