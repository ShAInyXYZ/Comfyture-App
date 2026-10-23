// Toaster's model, without three.js (so the node tests read it): the shapes a blockout is made of, the clay colours, the frames, a
// draft as it is kept, and the words sent with the clay to the image model. A draft is the object being blocked out: its parts (each
// a primitive with a size, a place, a turn, a colour and what it is made of), the camera, the words, and what was toasted from it
// (renders of the frame, turnarounds of four views, 3D models made from a turnaround).
//
// The turnaround follows the layout of Pixal3D's multi-view template (ComfyUI's 3d_pixal3d_multi_views): one sheet of 6336 x 2688
// with four views across, cropped at fixed places in this order: front, left, back, right. Its "left" is the object turned to its
// left (its front faces the right of the picture, the camera stands at its right side), its "right" the other way. A sheet drawn
// with each view inside its crop window is read by the template as it is.

/** The primitives, in the order of the Add grid. `round` is what the shape's slider sets (see roundLabel); `sides` its segments. */
export const SHAPES = [
  { id: "box", name: "Box", size: [1, 1, 1], round: 0 },
  { id: "cylinder", name: "Cylinder", size: [1, 1, 1], sides: 32 },
  { id: "sphere", name: "Sphere", size: [1, 1, 1] },
  { id: "cone", name: "Cone", size: [1, 1, 1], sides: 32 },
  { id: "pyramid", name: "Pyramid", size: [1, 1, 1] },
  { id: "wedge", name: "Wedge", size: [1, 1, 1] },
  { id: "torus", name: "Torus", size: [1, 0.3, 1], round: 0.5 },
  { id: "capsule", name: "Capsule", size: [0.6, 1.4, 0.6] },
  { id: "dome", name: "Dome", size: [1, 0.5, 1] },
  { id: "tube", name: "Tube", size: [1, 1, 1], round: 0.2, sides: 32 },
];
export const shapeOf = (id) => SHAPES.find((s) => s.id === id) ?? SHAPES[0];
/** What a shape's slider is called: a box's corners, a torus's or a tube's thickness; none for the others. */
export const roundLabel = (shape) => ({ box: "Round", torus: "Thick", tube: "Wall" })[shape] ?? null;
/** Whether a shape has a number of sides to set. */
export const hasSides = (shape) => ["cylinder", "cone", "tube"].includes(shape);

/** The clay colours, each with the name the words give it. */
export const PALETTE = [
  ["#c9c4bb", "grey"], ["#ece4d2", "cream"], ["#5d5e66", "charcoal"], ["#4fb3a9", "teal"], ["#e0884b", "orange"], ["#d65a5a", "red"],
  ["#6c8fd6", "blue"], ["#9b7bd1", "purple"], ["#88b860", "green"], ["#e3c35a", "mustard"], ["#b07a52", "brown"], ["#e59bb5", "pink"],
];
export const colorName = (hex) => PALETTE.find(([h]) => h === String(hex).toLowerCase())?.[1] ?? "coloured";

/** The frames a render can have (the image models' own aspects). */
export const RATIOS = { "1:1": 1, "4:5": 4 / 5, "4:3": 4 / 3, "3:4": 3 / 4, "16:9": 16 / 9, "9:16": 9 / 16 };

/** The turnaround sheet of Pixal3D's multi-view template: its size, and where it crops each view (x and width; every window is full height). */
export const SHEET = {
  width: 6336,
  height: 2688,
  // the image models draw it at this aspect (2.33, the sheet is 2.36: the picture is stretched back by a hair)
  aspect: "21:9",
  windows: [
    { view: "front", x: 0, w: 1669 },
    { view: "left", x: 1652, w: 1492 },
    { view: "back", x: 3182, w: 1476 },
    { view: "right", x: 4728, w: 1608 },
  ],
  // how much of its window the object may fill, so the crop and its background removal always see all of it
  fill: 0.8,
};
/** Where the camera stands for each view of the sheet (a unit direction; the object faces +Z), and the turn of the light rig with it. */
export const VIEWS = {
  front: { dir: [0, 0, 1], turn: 0 },
  left: { dir: [-1, 0, 0], turn: -Math.PI / 2 },
  back: { dir: [0, 0, -1], turn: Math.PI },
  right: { dir: [1, 0, 0], turn: Math.PI / 2 },
};
/** The template that makes a textured 3D model from the sheet (Comfy Cloud, GPU time only). */
export const TO_3D = "3d_pixal3d_multi_views";

/**
 * The scale of the sheet, in sheet pixels per world unit: one for all four views (so the views agree), as large as the narrowest
 * window allows. `extent` is the size of what is drawn, [x, y, z] in world units.
 */
export function sheetScale(extent) {
  const [x, y, z] = extent.map((v) => Math.max(1e-3, Number(v) || 0));
  const narrow = Math.min(...SHEET.windows.map((w) => w.w));
  return (SHEET.fill * Math.min(narrow / Math.max(x, z), SHEET.height / y));
}

// ---------------------------------------------------------------- a draft

const round2 = (v) => Math.round(v * 1000) / 1000;
const num = (v, lo, hi, d) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};
const vec = (v, d, lo = -1000, hi = 1000) => (Array.isArray(v) && v.length === 3 ? v.map((x, i) => round2(num(x, lo, hi, d[i]))) : [...d]);
const words = (v, n) => (typeof v === "string" ? v.slice(0, n) : "");
export const partId = () => `p-${Math.random().toString(36).slice(2, 9)}`;

/** Whether a part is a piece of the Stage's library (a chair, a cup, a car) rather than a primitive: its `asset` names the piece. */
export const isAsset = (p) => p?.shape === "asset" && typeof p.asset === "string" && /^[\w.-]{1,80}$/.test(p.asset);

/** A part as it is kept, whatever came in (a draft from disk, a paste, an agent). */
export function cleanPart(p) {
  p = p && typeof p === "object" ? p : {};
  // a piece of the Stage's library keeps its piece and the size it was given (its own until then)
  const asset = isAsset(p);
  const shape = asset ? { id: "asset", name: "Piece", size: vec(p.size, [1, 1, 1], 0.01, 100) } : shapeOf(p.shape);
  const part = {
    id: typeof p.id === "string" && /^[\w-]{1,40}$/.test(p.id) ? p.id : partId(),
    shape: shape.id,
    ...(asset ? { asset: p.asset } : {}),
    name: words(p.name, 40).trim() || shape.name,
    color: PALETTE.some(([h]) => h === String(p.color).toLowerCase()) ? String(p.color).toLowerCase() : /^#[0-9a-f]{6}$/i.test(p.color) ? String(p.color).toLowerCase() : PALETTE[0][0],
    made: words(p.made, 120),
    size: vec(p.size, shape.size, 0.01, 100),
    pos: vec(p.pos, [0, shape.size[1] / 2, 0]),
    rot: vec(p.rot, [0, 0, 0], -360, 360),
  };
  if (roundLabel(shape.id)) part.round = round2(num(p.round, 0, 1, shape.round ?? 0));
  if (hasSides(shape.id)) part.sides = Math.round(num(p.sides, 3, 64, shape.sides ?? 32));
  if (p.hidden) part.hidden = true;
  return part;
}

/** A new part of a shape: the first clay colour no part wears yet, a name no part has, sitting on the floor (or where `at` says). */
export function newPart(shape, parts = [], { at, color } = {}) {
  const s = shapeOf(shape);
  const used = new Set(parts.map((p) => p.color));
  const taken = new Set(parts.map((p) => p.name.toLowerCase()));
  let name = s.name;
  for (let i = 2; taken.has(name.toLowerCase()); i++) name = `${s.name} ${i}`;
  return cleanPart({ shape: s.id, name, color: color ?? (PALETTE.find(([h]) => !used.has(h)) ?? PALETTE[parts.length % PALETTE.length])[0], size: s.size, pos: at ?? [0, s.size[1] / 2, 0] });
}

/**
 * A piece of the Stage's library as a new part: `piece` is { type, name, size } (its size at its own scale), standing on the floor (or where
 * `at` says), in grey clay like the Stage's pieces until it is given a colour.
 */
export function newAssetPart(piece, parts = [], { at } = {}) {
  const taken = new Set(parts.map((p) => p.name.toLowerCase()));
  let name = String(piece.name || piece.type).slice(0, 40);
  for (let i = 2; taken.has(name.toLowerCase()); i++) name = `${piece.name} ${i}`;
  const size = vec(piece.size, [1, 1, 1], 0.01, 100);
  return cleanPart({ shape: "asset", asset: piece.type, name, color: PALETTE[0][0], size, pos: at ?? [0, size[1] / 2, 0] });
}

/**
 * The same part on the other side of the middle (x = 0): its place and its turn mirrored (every shape is symmetric across its own x; a piece
 * of the library stands there turned the other way).
 */
export function mirrorPart(p, parts = []) {
  const taken = new Set(parts.map((q) => q.name.toLowerCase()));
  const base = p.name.replace(/ (left|right)$/i, "");
  let name = / left$/i.test(p.name) ? `${base} right` : / right$/i.test(p.name) ? `${base} left` : `${p.name} mirrored`;
  for (let i = 2; taken.has(name.toLowerCase()); i++) name = `${base} ${i}`;
  return cleanPart({ ...p, id: partId(), name, pos: [-p.pos[0], p.pos[1], p.pos[2]], rot: [p.rot[0], -p.rot[1], -p.rot[2]] });
}

/** A copy a little to the side, named after it. */
export function duplicatePart(p, parts = [], offset = [0.25, 0, 0.25]) {
  const taken = new Set(parts.map((q) => q.name.toLowerCase()));
  const base = p.name.replace(/ \d+$/, "");
  let name = base;
  for (let i = 2; taken.has(name.toLowerCase()); i++) name = `${base} ${i}`;
  return cleanPart({ ...p, id: partId(), name, pos: p.pos.map((v, i) => v + offset[i]) });
}

const RUN = /^(running|done|failed)$/;
const media = (m) => (m && typeof m.url === "string" ? { url: m.url, file: typeof m.file === "string" ? m.file : undefined, width: Number(m.width) || undefined, height: Number(m.height) || undefined } : null);

/** A draft's body as it is kept, whatever came in: parts, camera, frame, words, model, and what was toasted from it. */
export function cleanDraft(b) {
  b = b && typeof b === "object" ? b : {};
  const parts = (Array.isArray(b.parts) ? b.parts : []).slice(0, 300).map(cleanPart);
  const cam = b.camera && Array.isArray(b.camera.position) && Array.isArray(b.camera.target) ? { position: vec(b.camera.position, [3.2, 2.4, 4.2]), target: vec(b.camera.target, [0, 0.5, 0]) } : null;
  const run = (r) => ({
    id: String(r.id ?? partId()).slice(0, 60),
    status: RUN.test(r.status) ? r.status : "failed",
    job: typeof r.job === "string" ? r.job : undefined,
    photo: media(r.photo),
    frame: media(r.frame),
    camera: r.camera && Array.isArray(r.camera.position) ? { position: vec(r.camera.position, [0, 0, 0]), target: vec(r.camera.target, [0, 0, 0]) } : undefined,
    ratio: r.ratio in RATIOS || r.ratio === SHEET.aspect ? r.ratio : undefined,
    model: words(r.model, 60) || undefined,
    prompt: words(r.prompt, 6000) || undefined,
    error: words(r.error, 300) || undefined,
    at: words(r.at, 40) || undefined,
  });
  const model3d = (m) => ({
    id: String(m.id ?? partId()).slice(0, 60),
    status: RUN.test(m.status) ? m.status : "failed",
    job: typeof m.job === "string" ? m.job : undefined,
    sheet: typeof m.sheet === "string" ? m.sheet : undefined,
    url: typeof m.url === "string" ? m.url : undefined,
    file: typeof m.file === "string" ? m.file : undefined,
    views: (Array.isArray(m.views) ? m.views : []).map(media).filter(Boolean).slice(0, 8),
    error: words(m.error, 300) || undefined,
    at: words(m.at, 40) || undefined,
  });
  return {
    parts,
    camera: cam,
    ratio: b.ratio in RATIOS ? b.ratio : "1:1",
    what: words(b.what, 600),
    scene: words(b.scene, 600),
    model: words(b.model, 60) || null,
    renders: (Array.isArray(b.renders) ? b.renders : []).slice(0, 60).map(run),
    sheets: (Array.isArray(b.sheets) ? b.sheets : []).slice(0, 30).map(run),
    models: (Array.isArray(b.models) ? b.models : []).slice(0, 30).map(model3d),
  };
}

/** The draft a new one starts from: a box on the floor, ready to be shaped. */
export function starterDraft() {
  return cleanDraft({ parts: [newPart("box", [])] });
}

// ---------------------------------------------------------------- the words sent with the clay

/**
 * What each clay colour becomes, one phrase per colour seen: "the teal clay (body, lid) becomes brushed chrome", or with nothing
 * said of what it is made of, "the teal clay is the body and the lid". Hidden parts are not in the picture, so not in the words.
 */
export function legendOf(parts) {
  const by = new Map();
  for (const p of parts.filter((p) => !p.hidden)) {
    const k = p.color;
    if (!by.has(k)) by.set(k, { names: [], made: [] });
    const g = by.get(k);
    const name = p.name.trim().toLowerCase();
    if (name && !g.names.includes(name) && (isAsset(p) || !SHAPES.some((s) => s.name.toLowerCase() === name.replace(/ \d+$/, "")))) g.names.push(name);
    const m = p.made.trim().replace(/[.;]+$/, "");
    if (m && !g.made.includes(m)) g.made.push(m);
  }
  const list = (a) => (a.length < 2 ? a.join("") : `${a.slice(0, -1).join(", ")} and ${a.at(-1)}`);
  return [...by].map(([hex, g]) => {
    const clay = `the ${colorName(hex)} clay`;
    if (g.made.length) return `${clay}${g.names.length ? ` (${g.names.join(", ")})` : ""} becomes ${list(g.made)}`;
    return g.names.length ? `${clay} is the ${list(g.names)}` : "";
  }).filter(Boolean);
}

const sentence = (s) => {
  const t = String(s ?? "").trim().replace(/\s+/g, " ");
  return t ? (/[.!?]$/.test(t) ? t : `${t}.`) : "";
};

/** The words for a render of the frame: the clay is the layout, the words what it becomes and where it stands. */
export function framePrompt({ parts = [], what = "", scene = "" }) {
  const legend = legendOf(parts);
  return [
    "Render @frame as a finished photograph of one object.",
    "Keep its camera, framing, silhouette and proportions exactly: each clay shape becomes the real part, in its very place and at its very size.",
    legend.length ? `In @frame, ${legend.join("; ")}.` : "",
    what.trim() ? `The object: ${sentence(what)}` : "",
    sentence(scene) || "A plain studio backdrop, soft even light.",
    "No clay, no grid and no coloured shape is left.",
  ].filter(Boolean).join(" ");
}

/** The words for the turnaround: four views of one object, each kept where and as large as its clay view, the object alone. */
export function sheetPrompt({ parts = [], what = "" }) {
  const legend = legendOf(parts);
  return [
    "Render @sheet as a finished turnaround sheet of one object: four views side by side, the front, the left side, the back and the right side.",
    "Each view stays exactly where, as large and as shaped as its clay view, and all four show the same object with the same materials and colours.",
    legend.length ? `In @sheet, ${legend.join("; ")}.` : "",
    what.trim() ? `The object: ${sentence(what)}` : "",
    "A plain light grey studio background, soft even light, no floor, no shadow, no text, no labels and nothing else.",
  ].filter(Boolean).join(" ");
}
