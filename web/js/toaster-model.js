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
// (named once, on first use: the colour ID's families come further down)
let names = null;
export const colorName = (hex) => (names ??= new Map([...FAMILIES.flatMap((f) => f.shades), ...PEOPLE, ...PALETTE])).get(String(hex).toLowerCase()) ?? "coloured";

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
/** Whether a part is one of the Stage's characters: a body type (or the user's own rigged character) in one of the Stage's poses. */
export const isCharacter = (p) => p?.shape === "character" && typeof p.body === "string" && /^[\w-]{1,40}$/.test(p.body);
const ID = /^[\w.-]{1,80}$/;

/** A part as it is kept, whatever came in (a draft from disk, a paste, an agent). */
export function cleanPart(p) {
  p = p && typeof p === "object" ? p : {};
  // a piece of the Stage's library keeps its piece, a character its body, rig and pose, and both the size they were given
  const asset = isAsset(p);
  const character = isCharacter(p);
  const shape = asset ? { id: "asset", name: "Piece", size: vec(p.size, [1, 1, 1], 0.01, 100) } : character ? { id: "character", name: "Character", size: vec(p.size, [0.5, 1.75, 0.3], 0.01, 100) } : shapeOf(p.shape);
  const part = {
    id: typeof p.id === "string" && /^[\w-]{1,40}$/.test(p.id) ? p.id : partId(),
    shape: shape.id,
    ...(asset ? { asset: p.asset } : {}),
    ...(character ? { body: p.body, ...(typeof p.rig === "string" && ID.test(p.rig) ? { rig: p.rig } : {}), pose: typeof p.pose === "string" && ID.test(p.pose) ? p.pose : "stand" } : {}),
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
 * `at` says), in the colour of its kind (pieceColor) unless `color` says otherwise.
 */
export function newAssetPart(piece, parts = [], { at, color, pieceOf } = {}) {
  const taken = new Set(parts.map((p) => p.name.toLowerCase()));
  let name = String(piece.name || piece.type).slice(0, 40);
  for (let i = 2; taken.has(name.toLowerCase()); i++) name = `${piece.name} ${i}`;
  const size = vec(piece.size, [1, 1, 1], 0.01, 100);
  return cleanPart({ shape: "asset", asset: piece.type, name, color: color ?? idColor(piece, parts, pieceOf), size, pos: at ?? [0, size[1] / 2, 0] });
}

/**
 * One of the Stage's characters as a new part: `who` is { body, rig?, name, size } (its size standing), in `pose`, standing on the floor
 * (or where `at` says). A character is someone: each takes a clay colour of its own, like the Stage's colour ID.
 */
export function newCharacterPart(who, parts = [], { at, pose = "stand", size } = {}) {
  const taken = new Set(parts.map((p) => p.name.toLowerCase()));
  const base = String(who.name || who.body).slice(0, 40);
  let name = base;
  for (let i = 2; taken.has(name.toLowerCase()); i++) name = `${base} ${i}`;
  const box = vec(size ?? who.size, [0.5, 1.75, 0.3], 0.01, 100);
  return cleanPart({ shape: "character", body: who.body ?? "man", rig: who.rig, pose, name, color: personColor(parts), size: box, pos: at ?? [0, box[1] / 2, 0] });
}

// ---------------------------------------------------------------- the colour ID

/**
 * The colour families of the colour ID: each kind of thing has its family (seats are blues, tables warm browns, storage purples…), each type
 * of piece its own shade in it, in the order the types come into a draft, and two pieces of one type share one colour. The flat colour map
 * and the render's words then say who is who: "the sky blue clay is the sofas". People are each someone: a strong colour of their own.
 * `words` are the head nouns that make a piece one of the family (a piece's own last word counts first: a desk lamp is a lamp).
 */
export const FAMILIES = [
  { id: "seat", name: "seats", words: "sofa couch armchair chair stool bench seat pouf ottoman beanbag throne recliner loveseat", shades: [["#3d7fd9", "blue"], ["#76aef2", "sky blue"], ["#24448f", "navy"], ["#5b6ee8", "cornflower"], ["#1f9fd9", "azure"]] },
  { id: "table", name: "tables", words: "table desk counter island workbench nightstand console bar podium lectern", shades: [["#c8823e", "tan"], ["#9a5a2a", "walnut"], ["#e3a866", "honey"], ["#b8622a", "rust"]] },
  { id: "storage", name: "storage", words: "shelf shelves bookcase bookshelf cabinet wardrobe dresser drawers cupboard locker rack sideboard chest", shades: [["#8a5cc9", "purple"], ["#b592e6", "lavender"], ["#5c3896", "plum"]] },
  { id: "hearth", name: "fireplaces", words: "fireplace chimney hearth campfire brazier", shades: [["#d64545", "red"], ["#f07a6a", "salmon"]] },
  { id: "light", name: "lights", words: "lamp light lantern candle candles chandelier torch sconce streetlamp", shades: [["#f2d23c", "yellow"], ["#f7e690", "pale yellow"], ["#d9a514", "mustard"]] },
  { id: "bed", name: "beds", words: "bed crib bunk cot hammock mattress", shades: [["#e46fa8", "pink"], ["#f2a8cb", "light pink"]] },
  { id: "art", name: "wall art", words: "portrait painting picture frame poster mirror clock artwork canvas sign billboard", shades: [["#c94fd0", "magenta"], ["#e396e8", "orchid"]] },
  { id: "plant", name: "plants", words: "plant tree bush flower flowers cactus palm pine fern bonsai hedge grass", shades: [["#4fae4f", "green"], ["#93d46e", "light green"], ["#2e7a3e", "dark green"]] },
  { id: "screen", name: "screens", words: "tv television screen monitor computer laptop phone tablet teleprompter camera speaker radio projector", shades: [["#2fb8c4", "cyan"], ["#86dde4", "pale cyan"], ["#1d7f88", "dark cyan"]] },
  { id: "appliance", name: "appliances", words: "fridge refrigerator stove oven washer microwave sink bathtub toilet shower dishwasher vending machine piano", shades: [["#5fd1a5", "mint"], ["#33946f", "jade"], ["#a3e8cc", "pale mint"]] },
  { id: "opening", name: "doors and windows", words: "door doorway window arch gate", shades: [["#a3a33a", "olive"], ["#cccc72", "khaki"]] },
  { id: "wall", name: "walls", words: "wall pillar column fence railing partition", shades: [["#c9c4bb", "light grey"], ["#a8a39b", "grey"]] },
  { id: "floor", name: "floors", words: "floor platform rug carpet mat ground stage stairs ramp step steps", shades: [["#6d6a66", "dark grey"], ["#8c7a66", "taupe"]] },
  { id: "vehicle", name: "vehicles", words: "car bus truck bike bicycle motorbike motorcycle boat scooter van train plane", shades: [["#c23a5a", "crimson"], ["#e47090", "rose"]] },
  { id: "food", name: "food and drink", words: "food cake bread fruit apple pizza burger cup mug glass bottle plate bowl coffee tea wine drink fries sandwich", shades: [["#f09a3e", "orange"], ["#f7c48e", "peach"]] },
  { id: "animal", name: "animals", words: "", shades: [["#e8b48a", "fawn"], ["#c98d63", "caramel"], ["#f2d4b4", "sand"]] },
  { id: "thing", name: "things", words: "", shades: [["#9e8fd9", "periwinkle"], ["#d99e8f", "dusty pink"], ["#8fd9c4", "seafoam"], ["#d9c48f", "straw"]] },
];
/** The strong colours of people, one each. */
export const PEOPLE = [["#ff6b3d", "vermilion"], ["#3dd6ff", "electric blue"], ["#b6f03d", "lime"], ["#ff3dd0", "hot pink"], ["#ffd43d", "sunflower"], ["#8b3dff", "violet"], ["#3dffa8", "spring green"], ["#ff3d6b", "scarlet"]];
const WORDS = FAMILIES.map((f) => [f, new Set(f.words.split(" ").filter(Boolean))]);
// a piece the words do not place falls back on its library category
const BY_CATEGORY = { Food: "food", Vehicles: "vehicle", Creatures: "animal", Animals: "animal", Architecture: "wall", Studio: "light" };
const familyById = (id) => FAMILIES.find((f) => f.id === id);

/** The family of a piece of the library ({ type, name, category, tags, animal }): its own last word first, then its other words, then its category. */
export function familyOf(piece) {
  if (piece?.animal) return familyById("animal");
  const own = String(piece?.type ?? "").toLowerCase().split(/[^a-z]+/).filter(Boolean);
  const more = [...String(piece?.name ?? "").toLowerCase().split(/[^a-z]+/), ...(piece?.tags ?? []).map((t) => String(t).toLowerCase())].filter(Boolean);
  for (const word of [own.at(-1), ...own.slice(0, -1).reverse(), ...more]) {
    const hit = WORDS.find(([, set]) => set.has(word));
    if (hit) return hit[0];
  }
  return familyById(BY_CATEGORY[piece?.category] ?? "thing");
}

/**
 * The colour ID of a piece in a draft: the colour its type already wears (two shelves are one), else the next shade of its family after
 * the types of that family already there. `pieceOf(type)` answers a type's piece (its name, category, tags), to know their families.
 */
export function idColor(piece, parts = [], pieceOf = () => null) {
  const same = parts.find((p) => p.shape === "asset" && p.asset === piece.type);
  if (same) return same.color;
  const family = familyOf(piece);
  const types = [...new Set(parts.filter((p) => p.shape === "asset" && p.asset !== piece.type).map((p) => p.asset))].filter((t) => familyOf(pieceOf(t) ?? { type: t }) === family);
  return family.shades[types.length % family.shades.length][0];
}

/** The colour ID of a new character: a strong colour no one else wears (people are each someone). */
export function personColor(parts = []) {
  const used = new Set(parts.filter((p) => p.shape === "character").map((p) => p.color));
  return (PEOPLE.find(([h]) => !used.has(h)) ?? PEOPLE[parts.filter((p) => p.shape === "character").length % PEOPLE.length])[0];
}

/** Every piece and character coloured by the colour ID again, in the order they are in the draft (the shapes keep theirs). */
export function colourByKind(parts, pieceOf = () => null) {
  const out = [];
  for (const p of parts) {
    if (p.shape === "asset") out.push({ ...p, color: idColor(pieceOf(p.asset) ?? { type: p.asset }, out, pieceOf) });
    else if (p.shape === "character") out.push({ ...p, color: personColor(out) });
    else out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------- placing by relations

const RAD = Math.PI / 180;
const r3 = (v) => Math.round(v * 1000) / 1000;
/** A part's footprint on the floor ({ min: [x, z], max: [x, z] }), as it is turned. */
export function footprintOf(p, turn = p.rot?.[1] ?? 0) {
  const c = Math.abs(Math.cos(turn * RAD));
  const s = Math.abs(Math.sin(turn * RAD));
  const hx = (c * p.size[0]) / 2 + (s * p.size[2]) / 2;
  const hz = (s * p.size[0]) / 2 + (c * p.size[2]) / 2;
  return { min: [p.pos[0] - hx, p.pos[2] - hz], max: [p.pos[0] + hx, p.pos[2] + hz] };
}
const flat = (p) => p.size[1] <= 0.3 && p.size[0] * p.size[2] >= 2;
const wallLike = (p) => p.size[1] >= 1.5 && Math.min(p.size[0], p.size[2]) <= 0.35;

/**
 * The room the parts stand in: the floor's footprint (the widest flat part), brought in to the inner face of each wall along its edges; with
 * no floor, what everything covers and a metre more each way. { min: [x, z], max: [x, z] }
 */
export function roomOf(parts) {
  const shown = parts.filter((p) => !p.hidden);
  const floor = shown.filter(flat).sort((a, b) => b.size[0] * b.size[2] - a.size[0] * a.size[2])[0];
  let room;
  if (floor) room = footprintOf(floor);
  else {
    const all = shown.map((p) => footprintOf(p));
    room = all.length ? { min: [Math.min(...all.map((f) => f.min[0])) - 1, Math.min(...all.map((f) => f.min[1])) - 1], max: [Math.max(...all.map((f) => f.max[0])) + 1, Math.max(...all.map((f) => f.max[1])) + 1] } : { min: [-3, -3], max: [3, 3] };
  }
  const near = (a, b) => Math.abs(a - b) < 0.6;
  for (const w of shown.filter(wallLike)) {
    const f = footprintOf(w);
    // a wall that runs along x closes the room's back or front; one that runs along z, a side
    if (f.max[0] - f.min[0] >= f.max[1] - f.min[1]) {
      const z = (f.min[1] + f.max[1]) / 2;
      if (near(z, room.min[1])) room.min[1] = Math.max(room.min[1], f.max[1]);
      else if (near(z, room.max[1])) room.max[1] = Math.min(room.max[1], f.min[1]);
    } else {
      const x = (f.min[0] + f.max[0]) / 2;
      if (near(x, room.min[0])) room.min[0] = Math.max(room.min[0], f.max[0]);
      else if (near(x, room.max[0])) room.max[0] = Math.min(room.max[0], f.min[0]);
    }
  }
  return room;
}

/** The turn that points a part's front from [x, z] toward [tx, tz], in whole degrees. */
export const faceTurn = ([x, z], [tx, tz]) => Math.round(Math.atan2(tx - x, tz - z) / RAD);

/** Whether two footprints overlap (touching is not overlapping). */
const overlaps = (a, b) => a.min[0] < b.max[0] - 1e-6 && a.max[0] > b.min[0] + 1e-6 && a.min[1] < b.max[1] - 1e-6 && a.max[1] > b.min[1] + 1e-6;

/**
 * A part against a wall of the room (back, left, right or front): its back flat on the wall's line, facing into the room, at `along` on the
 * wall (x for back and front, z for left and right; the middle when not said), slid along the wall until it touches nothing of `others`
 * (the floor and the walls aside). Answers { pos: [x, z], turn }.
 */
export function placeAgainst(p, wall, room, others = [], along) {
  const turn = { back: 0, front: 180, left: 90, right: -90 }[wall] ?? 0;
  const probe = { ...p, pos: [0, p.pos[1], 0] };
  const { max } = footprintOf(probe, turn);
  const [hx, hz] = [max[0], max[1]];
  const alongX = wall === "back" || wall === "front";
  const lo = alongX ? room.min[0] + hx : room.min[1] + hz;
  const hi = alongX ? room.max[0] - hx : room.max[1] - hz;
  const mid = alongX ? (room.min[0] + room.max[0]) / 2 : (room.min[1] + room.max[1]) / 2;
  const start = Math.min(hi, Math.max(lo, Number.isFinite(along) ? along : mid));
  const fixed = wall === "back" ? room.min[1] + hz + 0.01 : wall === "front" ? room.max[1] - hz - 0.01 : wall === "left" ? room.min[0] + hx + 0.01 : room.max[0] - hx - 0.01;
  const taken = others.filter((q) => !q.hidden && !flat(q) && !wallLike(q)).map((q) => footprintOf(q));
  const at = (v) => (alongX ? [v, fixed] : [fixed, v]);
  for (let k = 0; k <= 400; k++) {
    const v = start + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.05;
    if (v < lo - 1e-6 || v > hi + 1e-6) continue;
    const [x, z] = at(v);
    if (!taken.some((t) => overlaps({ min: [x - hx, z - hz], max: [x + hx, z + hz] }, t))) return { pos: [r3(x), r3(z)], turn };
  }
  const [x, z] = at(start);
  return { pos: [r3(x), r3(z)], turn };
}

/**
 * A part beside another (`q`), on its front, back, left or right (as seen looking at q's front), `gap` metres from it, edge to edge; it
 * faces q unless `turn` says otherwise (a chair at a desk, a coffee table before a sofa, armchairs at its sides). Answers { pos: [x, z], turn }.
 */
export function placeNear(p, q, side = "front", gap = 0.3, turn) {
  const tq = (q.rot?.[1] ?? 0) * RAD;
  const f = [Math.sin(tq), Math.cos(tq)];
  const r = [Math.cos(tq), -Math.sin(tq)];
  const u = side === "back" ? [-f[0], -f[1]] : side === "right" ? r : side === "left" ? [-r[0], -r[1]] : f;
  const halfQ = side === "left" || side === "right" ? q.size[0] / 2 : q.size[2] / 2;
  const t = Number.isFinite(turn) ? turn : Math.round(Math.atan2(-u[0], -u[1]) / RAD);
  const tp = t * RAD;
  const fp = [Math.sin(tp), Math.cos(tp)];
  const rp = [Math.cos(tp), -Math.sin(tp)];
  const halfP = Math.abs(u[0] * rp[0] + u[1] * rp[1]) * (p.size[0] / 2) + Math.abs(u[0] * fp[0] + u[1] * fp[1]) * (p.size[2] / 2);
  const d = halfQ + gap + halfP;
  return { pos: [r3(q.pos[0] + u[0] * d), r3(q.pos[2] + u[1] * d)], turn: t };
}

/** The height of a part's top: what stands on it has its bottom there (a lamp on a desk). */
export const topOf = (q) => r3(q.pos[1] + q.size[1] / 2);

/**
 * A free place on the floor for a footprint [w, d] (x and z) beside what is there: edge to edge with a `taken` footprint ({ min: [x, z],
 * max: [x, z] }), `gap` apart, touching none. Of the places that are free, the one nearest `near` ([x, z]) wins, a place to the side
 * counting less than one behind and one behind less than one in front, so pieces line up side by side as the camera sees them and do
 * not hide each other. With nothing there, the place is `near` itself; when every edge is taken, the nearest free point, ring after ring.
 */
export function freeSpot([w, d], taken = [], { near = [0, 0], gap = 0.1 } = {}) {
  const hw = Math.max(0.005, w) / 2;
  const hd = Math.max(0.005, d) / 2;
  const eps = 1e-6;
  const clear = (x, z) => taken.every((t) => x + hw + gap <= t.min[0] + eps || x - hw - gap >= t.max[0] - eps || z + hd + gap <= t.min[1] + eps || z - hd - gap >= t.max[1] - eps);
  const round = (v) => Math.round(v * 1000) / 1000;
  const cost = ([x, z]) => Math.abs(x - near[0]) + (z < near[1] ? 2 : 3) * Math.abs(z - near[1]);
  if (clear(near[0], near[1])) return near.map(round);
  // beside each footprint: to its right and left (lined up with it), behind it and in front of it
  const spots = taken.flatMap((t) => {
    const cx = (t.min[0] + t.max[0]) / 2;
    const cz = (t.min[1] + t.max[1]) / 2;
    return [[t.max[0] + gap + hw, cz], [t.min[0] - gap - hw, cz], [cx, t.min[1] - gap - hd], [cx, t.max[1] + gap + hd]];
  }).filter(([x, z]) => clear(x, z)).sort((a, b) => cost(a) - cost(b));
  if (spots.length) return spots[0].map(round);
  // (a crowded floor: the nearest free point, ring after ring)
  const step = Math.min(0.5, Math.max(0.05, Math.min(w, d) / 2));
  for (let r = step; r <= 60; r += step) {
    const count = Math.max(8, Math.ceil((2 * Math.PI * r) / step));
    for (let i = 0; i < count; i++) {
      const a = (i / count) * 2 * Math.PI;
      if (clear(near[0] + Math.cos(a) * r, near[1] + Math.sin(a) * r)) return [round(near[0] + Math.cos(a) * r), round(near[1] + Math.sin(a) * r)];
    }
  }
  return near.map(round);
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
  const lens = (v) => Math.round(num(v, 14, 200, 50));
  const cam = b.camera && Array.isArray(b.camera.position) && Array.isArray(b.camera.target) ? { position: vec(b.camera.position, [3.2, 2.4, 4.2]), target: vec(b.camera.target, [0, 0.5, 0]), focal: lens(b.camera.focal) } : null;
  // the cameras kept in slots: where it stood, what it looked at, its lens and its frame, to come back to the very picture
  const slot = (k) => ({
    id: String(k.id ?? partId()).slice(0, 60),
    name: words(k.name, 30).trim() || "Camera",
    position: vec(k.position, [3.2, 2.4, 4.2]),
    target: vec(k.target, [0, 0.5, 0]),
    focal: lens(k.focal),
    ratio: k.ratio in RATIOS ? k.ratio : "1:1",
    thumb: typeof k.thumb === "string" && k.thumb.startsWith("data:image/") ? k.thumb.slice(0, 60000) : undefined,
  });
  const run = (r) => ({
    id: String(r.id ?? partId()).slice(0, 60),
    status: RUN.test(r.status) ? r.status : "failed",
    job: typeof r.job === "string" ? r.job : undefined,
    photo: media(r.photo),
    frame: media(r.frame),
    maps: (Array.isArray(r.maps) ? r.maps : []).slice(0, 4).map((m) => (media(m) ? { ...media(m), name: words(m.name, 20) } : null)).filter(Boolean),
    camera: r.camera && Array.isArray(r.camera.position) ? { position: vec(r.camera.position, [0, 0, 0]), target: vec(r.camera.target, [0, 0, 0]), focal: Math.round(num(r.camera.focal, 14, 200, 50)) } : undefined,
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
    cameras: (Array.isArray(b.cameras) ? b.cameras : []).filter((k) => k && typeof k === "object").slice(0, 12).map(slot),
    ratio: b.ratio in RATIOS ? b.ratio : "1:1",
    maps: Array.isArray(b.maps) ? MAPS.map((m) => m.id).filter((id) => b.maps.includes(id)) : ["id", "depth"],
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
    if (name && !g.names.includes(name) && (isAsset(p) || isCharacter(p) || !SHAPES.some((s) => s.name.toLowerCase() === name.replace(/ \d+$/, "")))) g.names.push(name);
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
/** The control maps a render can send beside the clay frame: their reference names, and what each says to the image model. */
export const MAPS = [
  { id: "id", name: "colour-id", label: "Colour ID", says: "@colour-id shows each kind of thing as one flat colour, as the clay does" },
  { id: "depth", name: "depth", label: "Depth", says: "@depth shows how far everything is, near light and far dark" },
  { id: "silhouette", name: "silhouette", label: "Silhouette", says: "@silhouette shows the outline of every part in white" },
];

/** The words for a render of the frame: the clay is the layout, the control maps where things are, the words what it all becomes. */
export function framePrompt({ parts = [], what = "", scene = "", maps = [] }) {
  const legend = legendOf(parts);
  const sent = MAPS.filter((m) => maps.includes(m.id));
  const id = sent.some((m) => m.id === "id");
  return [
    "Render @frame as a finished photograph of one object.",
    "Keep its camera, framing, silhouette and proportions exactly: each clay shape becomes the real part, in its very place and at its very size.",
    legend.length ? `In @frame${id ? " and @colour-id" : ""}, ${legend.join("; ")}.` : "",
    sent.length ? `${sent.map((m) => m.says).join("; ")}. They only say what is where: the materials, the light and what is behind come from these words.` : "",
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
