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
 * An OBJECT's sheet (the 3D page makes one per object, never one for the whole scene): its four views in a 2 x 2 grid of square cells,
 * lit alike, on a plain background, front and back above, left and right below. The camera is not orthographic: it looks down a little
 * from above, as a product photographer would (a table's top, a lamp's shade and a crate's lid all show), at the same angle in the four
 * views. The page cuts the cells and sends each to Trellis2 as its own view (the local Trellis2 workflows), or lays them in Pixal3D's
 * sheet (SHEET above) for Comfy Cloud. The "left" view is the object turned to its left (its front faces the right of the picture), the
 * "right" the other way, as in SHEET.
 */
export const OBJECT = {
  cell: 1024,
  aspect: "1:1",
  views: [
    { view: "front", col: 0, row: 0 },
    { view: "back", col: 1, row: 0 },
    { view: "left", col: 0, row: 1 },
    { view: "right", col: 1, row: 1 },
  ],
  // how far the object's bounding sphere may fill its cell (past 1 the sphere overflows, the object itself fills about 80%)
  fill: 1.1,
  // the lens (degrees, the vertical field: a long lens, little distortion) and how far above the object the camera stands (degrees):
  // objects are seen from higher than people, who are met nearly face to face
  fov: 28,
  tilt: { object: 24, character: 8 },
};
/** How far above the object the camera looks down, in degrees (a character is met nearly face to face). */
export const tiltOf = (part) => (part?.shape === "character" ? OBJECT.tilt.character : OBJECT.tilt.object);
/** Where a view's camera stands, as a unit direction from the object's centre: its view's side (VIEWS), raised by `tilt` degrees. */
export function objectDir(view, tilt) {
  const [x, , z] = VIEWS[view].dir;
  const up = (tilt * Math.PI) / 180;
  return [x * Math.cos(up), Math.sin(up), z * Math.cos(up)];
}
/** How far from the object's centre the camera stands so that its bounding sphere (radius `radius`) fills OBJECT.fill of the cell. */
export const objectDistance = (radius, fov = OBJECT.fov) => radius / (Math.sin((fov * Math.PI) / 360) * OBJECT.fill);

const ROOM_ASSETS = /^(floor|window|wall|door|ceiling|rug|carpet|stage|platform|backdrop)$/;
const ROOM_NAMES = /\b(floor|wall|walls|ceiling|backdrop|ground|window)\b/i;
/** Whether a part is the room around the things (a floor, a wall, a window): left as clay in the new scene unless the person says otherwise. */
export const isRoom = (p) => (p?.shape === "asset" ? ROOM_ASSETS.test(String(p.asset)) : ROOM_NAMES.test(String(p?.name ?? "")));
/** Whether a part is made in 3D: what the person said (`p.solid`), else every object but the room. */
export const wants3d = (p) => !p?.hidden && (typeof p?.solid === "boolean" ? p.solid : !isRoom(p));

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
/** The names a tag may never take: the frame, the control maps and the turnaround sheet. */
export const RESERVED = ["frame", "colour-id", "depth", "silhouette", "sheet"];
const slug = (v) => String(v ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30).replace(/-+$/, "");
/** A tag from `base`, free among `used` and never reserved (desk, desk-2, desk-3…); it is added to `used`. */
function freeTag(base, used) {
  const root = base || "part";
  let n = root;
  for (let i = 2; used.has(n) || RESERVED.includes(n); i++) n = `${root}-${i}`;
  used.add(n);
  return n;
}
/** A picture of the Library as a sheet or a draft keeps it, or null when it is not one. */
const photoRef = (r) => (r && typeof r === "object" && typeof r.file === "string" && r.file && r.file.length <= 200 && typeof r.url === "string" && r.url
  ? { file: r.file, url: r.url.slice(0, 400), ...(Number(r.width) > 0 ? { width: Number(r.width) } : {}), ...(Number(r.height) > 0 ? { height: Number(r.height) } : {}) } : null);
const MOST_REFS = 6;
const refList = (v) => {
  const out = [];
  for (const r of Array.isArray(v) ? v : []) {
    const p = photoRef(r);
    if (p && !out.some((x) => x.file === p.file) && out.length < MOST_REFS) out.push(p);
  }
  return out;
};
export const partId = () => `p-${Math.random().toString(36).slice(2, 9)}`;

/** Whether a part is a piece of the Stage's library (a chair, a cup, a car) rather than a primitive: its `asset` names the piece. */
export const isAsset = (p) => p?.shape === "asset" && typeof p.asset === "string" && /^[\w.-]{1,80}$/.test(p.asset);
/** Whether a part is one of the Stage's characters: a body type (or the user's own rigged character) in one of the Stage's poses. */
export const isCharacter = (p) => p?.shape === "character" && typeof p.body === "string" && /^[\w-]{1,40}$/.test(p.body);
const ID = /^[\w.-]{1,80}$/;

/**
 * The pose's tweaks, the Stage's own (web/js/control/skeleton.js PARAMS, copied here so the model needs no three.js): sliders laid over the
 * pose, in degrees (crouch 0 to 1). [id, label, min, max]
 */
export const POSE_SLIDERS = [
  ["look", "Look", -80, 80], ["nod", "Nod", -40, 40], ["tilt", "Tilt", -30, 30],
  ["lean", "Lean", -30, 60], ["twist", "Twist", -45, 45], ["side", "Side bend", -30, 30],
  ["arms", "Arms up", -20, 160], ["reach", "Arms forward", -40, 120], ["elbows", "Elbows", -20, 140],
  ["stance", "Stance", -10, 40], ["step", "Step", -45, 45], ["crouch", "Crouch", 0, 1],
];
/** The joints a posed body has (the Stage's skeleton), for a pose edited joint by joint. */
export const JOINT_IDS = ["Hips", "Spine", "Chest", "Neck", "Head", "LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand", "RightShoulder", "RightArm", "RightForeArm", "RightHand", "LeftUpLeg", "LeftLeg", "LeftFoot", "LeftToe", "RightUpLeg", "RightLeg", "RightFoot", "RightToe"];

/**
 * A character's tweaks as they are kept: `params`, the sliders that are not at zero; `joints`, the pose edited joint by joint (each joint's
 * turn as a quaternion [x, y, z, w]; the preset's own when there is none).
 */
function tweakOf(p) {
  const out = {};
  const params = {};
  for (const [k, , lo, hi] of POSE_SLIDERS) {
    const v = Number(p.params?.[k]);
    if (Number.isFinite(v) && v !== 0) params[k] = Math.round(Math.min(hi, Math.max(lo, v)) * 100) / 100;
  }
  if (Object.keys(params).length) out.params = params;
  if (p.joints && typeof p.joints === "object") {
    const joints = {};
    for (const n of JOINT_IDS) {
      const q = p.joints[n];
      if (Array.isArray(q) && q.length === 4 && q.every((v) => Number.isFinite(Number(v)))) joints[n] = q.map((v) => Math.round(Math.min(1, Math.max(-1, Number(v))) * 1e5) / 1e5);
    }
    if (Object.keys(joints).length) out.joints = joints;
  }
  return out;
}

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
    ...(character ? { body: p.body, ...(typeof p.rig === "string" && ID.test(p.rig) ? { rig: p.rig } : {}), pose: typeof p.pose === "string" && ID.test(p.pose) ? p.pose : "stand", ...tweakOf(p) } : {}),
    name: words(p.name, 40).trim() || shape.name,
    color: PALETTE.some(([h]) => h === String(p.color).toLowerCase()) ? String(p.color).toLowerCase() : /^#[0-9a-f]{6}$/i.test(p.color) ? String(p.color).toLowerCase() : PALETTE[0][0],
    made: words(p.made, 400),
    ...(refList(p.refs).length ? { refs: refList(p.refs) } : {}),
    // made in 3D (true) or left as clay (false), when the person chose; else the room is left and the objects are made
    ...(typeof p.solid === "boolean" ? { solid: p.solid } : {}),
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
  return cleanPart({ shape: "asset", asset: piece.type, name, made: startingWords({ shape: "asset", asset: piece.type }, () => piece), color: color ?? idColor(piece, parts, pieceOf), size, pos: at ?? [0, size[1] / 2, 0] });
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
  return cleanPart({ shape: "character", body: who.body ?? "man", rig: who.rig, pose, name, made: startingWords({ shape: "character", body: who.body ?? "man", rig: who.rig, name: who.name }), color: personColor(parts), size: box, pos: at ?? [0, box[1] / 2, 0] });
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
    // the object a sheet is of (the 3D page's sheets are one per object)
    part: typeof r.part === "string" && /^[\w-]{1,40}$/.test(r.part) ? r.part : undefined,
    photo: media(r.photo),
    frame: media(r.frame),
    maps: (Array.isArray(r.maps) ? r.maps : []).slice(0, 4).map((m) => (media(m) ? { ...media(m), name: words(m.name, 20) } : null)).filter(Boolean),
    camera: r.camera && Array.isArray(r.camera.position) ? { position: vec(r.camera.position, [0, 0, 0]), target: vec(r.camera.target, [0, 0, 0]), focal: Math.round(num(r.camera.focal, 14, 200, 50)) } : undefined,
    ratio: r.ratio in RATIOS || r.ratio === SHEET.aspect ? r.ratio : undefined,
    model: words(r.model, 60) || undefined,
    modelName: words(r.modelName, 40) || undefined,
    cost: words(r.cost, 20) || undefined,
    sent: Array.isArray(r.sent) && r.sent.some((x) => MAPS.some((m) => m.id === x)) ? r.sent.filter((x) => MAPS.some((m) => m.id === x)) : undefined,
    prompt: words(r.prompt, 6000) || undefined,
    strength: Number.isFinite(r.strength) ? num(r.strength, 0, 1, STRENGTH) : undefined,
    refs: (Array.isArray(r.refs) ? r.refs : []).slice(0, 12).filter((x) => x && typeof x.url === "string").map((x) => ({ name: words(x.name, 40), url: x.url.slice(0, 400) })),
    error: words(r.error, 300) || undefined,
    at: words(r.at, 40) || undefined,
    // an example's render says how it was made ("Made with GPT Image for this example")
    example: r.example === true || undefined,
    note: words(r.note, 160) || undefined,
  });
  const model3d = (m) => ({
    id: String(m.id ?? partId()).slice(0, 60),
    status: RUN.test(m.status) ? m.status : "failed",
    job: typeof m.job === "string" ? m.job : undefined,
    sheet: typeof m.sheet === "string" ? m.sheet : undefined,
    part: typeof m.part === "string" && /^[\w-]{1,40}$/.test(m.part) ? m.part : undefined,
    // how it was made: "local" (Trellis2 on the person's own ComfyUI), "cloud" (Pixal3D) or "file" (a GLB the person brought), the stage it is at, and where ComfyUI saved it
    via: m.via === "cloud" ? "cloud" : m.via === "local" ? "local" : m.via === "file" ? "file" : undefined,
    stage: words(m.stage, 60) || undefined,
    quality: m.quality === "fine" ? "fine" : m.quality === "web" ? "web" : undefined,
    path: words(m.path, 300) || undefined,
    example: m.example === true || undefined,
    note: words(m.note, 160) || undefined,
    url: typeof m.url === "string" ? m.url : undefined,
    file: typeof m.file === "string" ? m.file : undefined,
    views: (Array.isArray(m.views) ? m.views : []).map(media).filter(Boolean).slice(0, 8),
    error: words(m.error, 300) || undefined,
    at: words(m.at, 40) || undefined,
  });
  // the pictures of the whole render: each is called by an @name of its own, never a part's tag nor a reserved one
  const taken = new Set([...RESERVED, ...tagsOf(parts).values()]);
  const sceneRefs = [];
  for (const r of Array.isArray(b.refs) ? b.refs : []) {
    const p = photoRef(r);
    if (!p || sceneRefs.length >= MOST_REFS || sceneRefs.some((x) => x.file === p.file)) continue;
    sceneRefs.push({ ...p, name: freeTag(slug(r.name) || slug(String(p.file).replace(/\.\w+$/, "")) || "ref", taken) });
  }
  return {
    parts,
    camera: cam,
    cameras: (Array.isArray(b.cameras) ? b.cameras : []).filter((k) => k && typeof k === "object").slice(0, 12).map(slot),
    ratio: b.ratio in RATIOS ? b.ratio : "1:1",
    maps: (() => {
      const asked = Array.isArray(b.maps) ? b.maps : ["clay", "id", "depth"];
      // (before the clay frame was one of the maps it always went: a draft from then keeps sending it)
      const was = b.mapsV === 2 ? asked : ["clay", ...asked];
      const ids = MAPS.map((m) => m.id).filter((id) => was.includes(id));
      return ids.length ? ids : ["clay"];
    })(),
    mapsV: 2,
    what: words(b.what, 600),
    scene: words(b.scene, 600),
    refs: sceneRefs,
    prompt: words(b.prompt, 6000),
    // who wrote the prompt ("writer", or "you"; "" while there is none), and what the writer's was written for: { model, key }
    promptBy: !words(b.prompt, 6000).trim() ? "" : b.promptBy === "writer" ? "writer" : "you",
    promptFor: b.promptBy === "writer" && words(b.prompt, 6000).trim() && b.promptFor && typeof b.promptFor === "object" ? { model: words(b.promptFor.model, 60), key: words(b.promptFor.key, 20) } : null,
    // how far a render goes from the clay, 0 (its colours stay) to 1 (only the layout and the forms stay)
    strength: num(b.strength, 0, 1, STRENGTH),
    model: words(b.model, 60) || null,
    // the image model that draws the 3D page's object sheets (null: Nano Banana 2.1 when there is one)
    sheetModel: words(b.sheetModel, 60) || null,
    renders: (Array.isArray(b.renders) ? b.renders : []).slice(0, 60).map(run),
    sheets: (Array.isArray(b.sheets) ? b.sheets : []).slice(0, 80).map(run),
    models: (Array.isArray(b.models) ? b.models : []).slice(0, 80).map(model3d),
  };
}

/** The draft a new one starts from: a box on the floor, ready to be shaped. */
export function starterDraft() {
  return cleanDraft({ parts: [newPart("box", [])] });
}

// ---------------------------------------------------------------- tags: each part called by an @name

/** The @tag of every visible part (by its id): the slug of its name, unique, never a reserved name nor one in `taken` (a scene reference's). */
export function tagsOf(parts = [], taken = []) {
  const used = new Set(taken);
  const out = new Map();
  for (const p of parts) if (!p.hidden) out.set(p.id, freeTag(slug(p.name), used));
  return out;
}
/** A picture of the Library as a scene reference: called by the slug of its name, unique, never reserved nor a part's tag. Null when full, doubled or bad. */
export function newSceneRef(photo, parts = [], sceneRefs = []) {
  const p = photoRef(photo);
  if (!p || sceneRefs.length >= MOST_REFS || sceneRefs.some((r) => r.file === p.file)) return null;
  const used = new Set([...RESERVED, ...tagsOf(parts).values(), ...sceneRefs.map((r) => r.name)]);
  return { ...p, name: freeTag(slug(photo.name) || slug(String(p.file).replace(/\.\w+$/, "")) || "ref", used) };
}
/** A picture of the Library added to a part's sheet (at most six, none twice). */
export const addRef = (refs = [], photo) => refList([...refs, photo]);
/** The tags a text calls: the @names in it, lower case. */
export const mentionsIn = (text) => [...String(text ?? "").matchAll(/@([a-z0-9][a-z0-9-]*)/gi)].map((m) => m[1].toLowerCase());
const kindOf = (p) => (isCharacter(p) ? "character" : isAsset(p) ? "piece" : "shape");
const sheetOf = (p) => Boolean(p.made?.trim() || p.refs?.length);

// ---------------------------------------------------------------- what a part is, in words

const PERSON = { man: "a man", woman: "a woman", teen: "a teenager", child: "a child", toddler: "a toddler", elder: "an older person", heavy: "a heavyset person", athletic: "an athletic person" };
const withArticle = (w) => (/^(a|an|the|some) /i.test(w) ? w : /^[aeiou]/i.test(w) ? `an ${w}` : `a ${w}`);
const plainShape = (name) => SHAPES.some((s) => s.name.toLowerCase() === name.toLowerCase().replace(/[ _-]*\d+$/, ""));
/** A sheet's words as they follow a name: no full stop, a lower-case start ("A woman…" reads "a woman…"). */
const lowered = (t) => String(t ?? "").trim().replace(/[.;]+$/, "").replace(/^(A|An|The) /, (m) => m.toLowerCase());

/** A piece's name as words, with its article: "an articulated desk lamp" (what a piece is called when the library has no description of it). */
const pieceName = (p, pieceOf) => withArticle(String(pieceOf(p.asset)?.name ?? p.asset).replace(/[-_]+/g, " ").toLowerCase());
/** A piece's identity in the library: its description ("an articulated desk lamp with a round weighted base…"), else its name. */
const pieceWords = (p, pieceOf) => lowered(pieceOf(p.asset)?.description) || pieceName(p, pieceOf);

/**
 * What a part is, in words, never its name or id: its sheet words (What it is); else, for a piece of the library, the library's description
 * of it; a character's person ("a woman", a rigged one by its rig); a shape by its name when that says something ("the floor", "a back
 * wall"), and "" for a default shape ("Box 3"). `pieceOf(type)` answers a library piece (with its `description`).
 */
export function describeOf(p, pieceOf = () => null) {
  const own = lowered(p.made);
  if (own) return own;
  if (isAsset(p)) return pieceWords(p, pieceOf);
  if (isCharacter(p)) return p.rig ? withArticle(String(p.name ?? p.rig).toLowerCase()) : (PERSON[p.body] ?? "a person");
  const name = String(p.name ?? "").trim().replace(/[_]+/g, " ").toLowerCase();
  if (!name || plainShape(name)) return "";
  return /^(floor|ground|ceiling|sky)$/.test(name) ? `the ${name}` : withArticle(name);
}
/** The head of a description: its first words, before what it has ("a rectangular writing desk with a flat top…" is a rectangular writing desk). */
const headOf = (t) => String(t ?? "").split(/,| with | in | holding |:| — /)[0].trim();
/**
 * What a part is, in a few words, for the legend: a person by their name when the user said who they are (in words or pictures), else
 * "a man"; a piece by the user's own words when they wrote some, else its name in the library ("a floor", "an articulated desk lamp");
 * a shape by its name.
 */
export function shortOf(p, pieceOf = () => null) {
  if (isCharacter(p)) {
    // (a real name, "Crumpet", says who; a body's name, "Man 2", says nothing: the words do)
    const generic = /^(man|woman|teen|teenager|child|kid|toddler|elder|person|figure|character|heavy|athletic)( ?\d+)?$/i.test(String(p.name ?? "").trim());
    return !generic && p.name && (String(p.made ?? "").trim() || p.refs?.length) ? p.name : describeOf(p, pieceOf);
  }
  if (isAsset(p)) {
    const own = lowered(p.made);
    const lib = lowered(pieceOf(p.asset)?.description);
    // (left as the library describes it: its name in the library says it, "a floor", "an articulated desk lamp")
    if (!own || own === lib) return pieceOf(p.asset)?.name ? pieceName(p, pieceOf) : headOf(lib) || describeOf({ ...p, made: "" }, pieceOf);
    return own;
  }
  return describeOf(p, pieceOf);
}
/**
 * The words a new part starts with in What it is: a piece, its identity as the library describes it, ready to refine; a character nothing
 * (who they are, their face, hair and clothes, is the user's to say); a shape nothing.
 */
export const startingWords = (p, pieceOf) => (isAsset(p) ? pieceWords(p, pieceOf) : "");
/**
 * The parts with What it is filled in where it says nothing yet: a piece gets the library's description (once the library, with its
 * descriptions, is known), also over the bare name an earlier Toaster wrote there ("an armchair"); a character's bare person ("a man"),
 * written there the same way, is taken back out. What the user wrote stays. A name written as an id ("desk_lamp") becomes a name ("Desk lamp").
 */
export const described = (parts, pieceOf) => parts.map((p) => {
  // (a name written as an id, "desk_lamp", reads as a name: "Desk lamp")
  if (/^[a-z0-9]+(?:_[a-z0-9]+)+$/i.test(p.name ?? "")) p = { ...p, name: p.name.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) };
  const own = String(p.made ?? "").trim();
  if (isAsset(p) && pieceOf(p.asset)?.description && (!own || own.toLowerCase() === pieceName(p, pieceOf))) return { ...p, made: pieceWords(p, pieceOf) };
  if (isCharacter(p) && own && own.toLowerCase() === (p.rig ? withArticle(String(p.name ?? p.rig).toLowerCase()) : PERSON[p.body])) return { ...p, made: "" };
  return p;
});

/** Who is in the frame, for the words and the pictures: the visible tagged parts (each by its description), then the scene's references. */
export function castOf(parts = [], sceneRefs = [], pieceOf = () => null) {
  const tags = tagsOf(parts, sceneRefs.map((r) => r.name));
  return [
    ...parts.filter((p) => tags.has(p.id)).map((p) => ({ tag: tags.get(p.id), name: (isCharacter(p) ? shortOf(p, pieceOf) : describeOf(p, pieceOf)) || p.name, label: p.name, id: p.id, kind: kindOf(p), color: p.color, words: (p.made ?? "").trim(), pictures: p.refs ?? [] })),
    ...sceneRefs.map((r) => ({ tag: r.name, ref: true, pictures: [r] })),
  ];
}

/**
 * The pictures that go with a render, within the model's `room`: first each person's first picture (a model keeps a likeness from a
 * picture of it, so a face matters most), then the scene's references (attached on purpose), then the parts' pictures one each per round
 * (the parts named in the words first). A part's first picture is called by its tag, the next ones tag-2, tag-3.
 * Answers { refs: [{ file, url, width, height, name }], named: Map(tag -> [names]) }.
 */
export function referencesFor({ parts = [], sceneRefs = [], room = 0, mentioned = [], tags = null } = {}) {
  // (the tags may be the whole draft's, when only some of its parts are given: each keeps its name)
  tags = tags ?? tagsOf(parts, sceneRefs.map((r) => r.name));
  const refs = [];
  const named = new Map();
  const used = new Set([...RESERVED, ...tags.values(), ...sceneRefs.map((r) => r.name)]);
  const first = new Set(mentioned.map((m) => String(m).toLowerCase()));
  const order = parts.filter((p) => tags.has(p.id) && p.refs?.length);
  order.sort((a, b) => Number(first.has(tags.get(b.id))) - Number(first.has(tags.get(a.id))));
  const put = (p, round) => {
    const pic = p.refs[round];
    const tag = tags.get(p.id);
    let name = tag;
    if (round) for (let i = round + 1; ; i++) if (!used.has((name = `${tag}-${i}`))) break;
    used.add(name);
    refs.push({ file: pic.file, url: pic.url, width: pic.width, height: pic.height, name });
    named.set(tag, [...(named.get(tag) ?? []), name]);
  };
  for (const p of order.filter(isCharacter)) if (refs.length < room) put(p, 0);
  for (const r of sceneRefs) {
    if (refs.length >= room) break;
    refs.push({ file: r.file, url: r.url, width: r.width, height: r.height, name: r.name });
    named.set(r.name, [r.name]);
  }
  const most = Math.max(0, ...order.map((p) => p.refs.length));
  for (let round = 0; round < most && refs.length < room; round++) {
    for (const p of order) {
      if (refs.length >= room) break;
      if (!p.refs[round] || (round === 0 && isCharacter(p))) continue;
      put(p, round);
    }
  }
  return { refs, named };
}

/**
 * Which of the clay frame and the control maps go, within the model's room for pictures: the first one on leads (the layout is taken
 * from it), the colour ID beside it when the frame is plain grey clay (it alone says who is who then), then each picture put on a part's sheet (`people`: a person's likeness first) keeps its place before the other maps
 * (depth, silhouette; the colour ID last, when the frame's own colours already say it) take what is left. In the maps' order.
 */
export function pickMaps({ wanted = [], strength = STRENGTH, room = 0, people = 0 } = {}) {
  const ids = MAPS.map((m) => m.id).filter((id) => wanted.includes(id));
  if (!ids.length || room <= 0) return [];
  const plain = plainFrame(strength, ids);
  const coloured = ids[0] === "clay" && !plain;
  const must = [ids[0], ...(plain ? ["id"] : [])];
  // (a clay frame in its colours already says who is who: then the colour ID is the last map to go, after the depth and the silhouette)
  const rest = ids.filter((id) => !must.includes(id)).sort((a, b) => Number(coloured && a === "id") - Number(coloured && b === "id")).slice(0, Math.max(0, room - must.length - people));
  const keep = new Set([...must, ...rest].slice(0, room));
  return ids.filter((id) => keep.has(id));
}

// ---------------------------------------------------------------- the words sent with the clay

/**
 * What each clay colour is, one clause per colour seen ("tan is a mahogany desk", "sky blue is a leather sofa (×2) and an armchair"): each
 * part by its description, never its name; equal descriptions are counted; a part with pictures sent adds ", exactly as in @tag"
 * (`named`, from referencesFor, says which pictures went). A default shape says nothing and is left out; hidden parts are not in the picture.
 */
export function legendOf(parts, { tags = new Map(), named = new Map(), pieceOf = () => null } = {}) {
  const by = new Map();
  for (const p of parts.filter((p) => !p.hidden)) {
    const text = shortOf(p, pieceOf);
    if (!text) continue;
    const pics = named.get(tags.get(p.id)) ?? [];
    const key = pics.length ? `${text}, exactly as in ${pics.map((n) => `@${n}`).join(" and ")}` : text;
    if (!by.has(p.color)) by.set(p.color, { people: false, things: new Map() });
    const g = by.get(p.color);
    g.people ||= isCharacter(p);
    g.things.set(key, (g.things.get(key) ?? 0) + 1);
  }
  const list = (a) => (a.length < 2 ? a.join("") : `${a.slice(0, -1).join(", ")} and ${a.at(-1)}`);
  // (the people first: they matter most; the floor and the walls come where they come)
  return [...by].sort(([, a], [, b]) => Number(b.people) - Number(a.people)).map(([hex, g]) => {
    const name = colorName(hex);
    return `${name === "coloured" ? hex : name} is ${list([...g.things].map(([t, n]) => (n > 1 ? `${t} (×${n})` : t)))}`;
  });
}

/** How far a render goes from the clay when nothing says otherwise. */
export const STRENGTH = 0.6;
/**
 * What the strength asks of the model, in words: low, the clay's colours become the real ones; middle, they only say which thing is which;
 * high, only the layout and the forms stay. (Most picture models take no number for it: the words, and the frame they are sent, say it.)
 */
export function strengthWords(strength = STRENGTH) {
  if (strength < 0.34) return "Keep its camera, framing, layout and colours: every clay shape becomes the finished thing in its very place and at its very size, its clay colour becoming its real colour.";
  if (strength < 0.67) return "Keep its camera, framing and layout: every clay shape becomes the finished thing in its very place and at its very size; the flat colours only say which thing is which, so every thing takes its own materials and colours.";
  return "Keep only its camera, framing and layout: every clay shape becomes a finished thing in its very place and at its very size, with all-new materials, colours, textures and light; nothing of the clay, its flat colours or its plastic look remains.";
}
/** Whether a render at this strength sends the frame in plain grey clay (its colours would pull the picture to them): only when the colour ID says who is who. */
export const plainFrame = (strength = STRENGTH, maps = []) => strength >= 0.5 && maps.includes("id") && (maps.includes("clay") || !maps.length);
/** The keep of an open-weights edit (its denoise) at this strength: the clay's own picture, kept more or less. */
export const keepOf = (strength = STRENGTH) => Math.round((0.75 + 0.23 * Math.min(1, Math.max(0, strength))) * 1000) / 1000;

const sentence = (s) => {
  const t = String(s ?? "").trim().replace(/\s+/g, " ");
  return t ? (/[.!?]$/.test(t) ? t : `${t}.`) : "";
};

/** The control maps a render can send beside the clay frame: their reference names, and what each says to the image model. */
export const MAPS = [
  // (the clay frame is one of them: off, the next one on leads, so nothing of the clay's colours or shading reaches the model)
  { id: "clay", name: "frame", label: "Clay frame", says: "@frame is the clay as the camera sees it: the forms, the layout and the camera" },
  { id: "id", name: "colour-id", label: "Colour ID", says: "@colour-id shows each kind of thing as one flat colour, as the clay does" },
  { id: "depth", name: "depth", label: "Depth", says: "@depth shows how far everything is, near light and far dark" },
  { id: "silhouette", name: "silhouette", label: "Silhouette", says: "@silhouette shows the outline of every part in white" },
];

/** The pictures of the scene that were sent, said in a line: what they are for. */
const referenceLine = (sceneRefs, named) => {
  const used = sceneRefs.filter((r) => !named || named.has(r.name)).map((r) => `@${r.name}`);
  if (!used.length) return "";
  const list = used.length < 2 ? used[0] : `${used.slice(0, -1).join(", ")} and ${used.at(-1)}`;
  return `${list} ${used.length > 1 ? "are reference pictures" : "is a reference picture"} for the look: follow ${used.length > 1 ? "them" : "it"} for the style, the light, the materials and the mood, never for the layout.`;
};

/** The depth and silhouette maps in one short sentence (the colour ID is told with the legend). */
const mapsLine = (maps) => {
  const parts = [maps.includes("depth") ? "@depth shows how far things are, near light and far dark" : "", maps.includes("silhouette") ? (maps.includes("depth") ? "@silhouette their outlines" : "@silhouette shows their outlines") : ""].filter(Boolean);
  return parts.length ? `${parts.join("; ")}; the maps only place things and never colour them.` : "";
};

/**
 * The words for a render of the frame: what it is, who is who by clay colour (each by its description, a part with pictures also by its
 * @tag), the scene, the maps, and that nothing of the clay is left. `named` says which pictures were sent (referencesFor).
 */
export function framePrompt({ parts = [], what = "", scene = "", maps = [], sceneRefs = [], named = null, tags = null, pieceOf = () => null, strength = STRENGTH }) {
  const legend = legendOf(parts, { tags: tags ?? tagsOf(parts, sceneRefs.map((r) => r.name)), named: named ?? new Map(), pieceOf });
  const look = String(scene ?? "").trim().replace(/\s+/g, " ").replace(/[.;]+$/, "");
  const plain = plainFrame(strength, maps);
  const lead = MAPS.find((m) => maps.includes(m.id)) ?? MAPS[0];
  const what0 = { clay: "a clay blockout", id: "the colour map of a scene laid out in clay", depth: "the depth map of a scene laid out in clay", silhouette: "the silhouettes of a scene laid out in clay" }[lead.id];
  const where = maps.includes("id") ? "In @colour-id each flat colour is one thing" : maps.includes("clay") ? "In @frame each clay colour is one thing" : "It holds";
  return [
    look ? `Turn @${lead.name}, ${what0}, into a finished image in this look: ${look}.` : `Turn @${lead.name}, ${what0}, into a finished cinematic photograph, soft natural light.`,
    what.trim() ? `It shows: ${sentence(what)}` : "",
    strengthWords(strength),
    plain && maps.includes("clay") ? "@frame is in plain grey clay: it gives the forms only." : "",
    legend.length ? `${where}: ${legend.join("; ")}.` : "",
    referenceLine(sceneRefs, named),
    mapsLine(maps),
    strength < 0.34 ? "No mannequin is left: the figures become the people named above." : "No mannequin and no clay is left: the figures become the people named above, every piece its finished self, all in the look above.",
  ].filter(Boolean).join(" ");
}

/**
 * The facts the writer works from (the page sends them, the server turns them into words): the image model and how many pictures it takes,
 * the pictures sent in order (the clay frame, the maps, the scene's references, then the parts') with what each is, what it is, the look,
 * the strength, and who is what by clay colour (people first). `refs` is the list of part and scene pictures as sent; `plain` says the frame is grey clay.
 */
export function factsOf({ parts = [], what = "", scene = "", maps = [], sceneRefs = [], refs = null, named = new Map(), tags = null, pieceOf = () => null, strength = STRENGTH, plain = false, model = null }) {
  tags = tags ?? tagsOf(parts, sceneRefs.map((r) => r.name));
  const byName = new Map();
  for (const p of parts) for (const n of named.get(tags.get(p.id)) ?? []) byName.set(n, p);
  const sent = refs ?? [...sceneRefs.filter((r) => named.has(r.name)), ...[...byName.keys()].map((name) => ({ name }))];
  // (the first of the clay frame and the maps leads: the layout and the camera are taken from it)
  const pictures = [
    ...MAPS.filter((m) => maps.includes(m.id)).map((m, i) => ({ name: m.name, ...(m.id === "clay" ? { kind: "frame", plain: !!plain } : { kind: "map", map: m.id }), ...(i ? {} : { lead: true }) })),
    ...sent.map((r) => {
      const part = byName.get(r.name);
      return part ? { name: r.name, kind: "part", of: shortOf(part, pieceOf) || part.name, sheet: kindOf(part) === "character" ? "character" : kindOf(part) === "piece" ? "piece" : "shape" } : { name: r.name, kind: "look" };
    }),
  ];
  const by = new Map();
  for (const p of parts.filter((p) => !p.hidden)) {
    const name = shortOf(p, pieceOf);
    if (!name) continue;
    const own = String(p.made ?? "").trim().replace(/\s+/g, " ").slice(0, 400);
    // (the library's own description, left as it was, is not the user's words: the frame shows the form)
    const libWords = isAsset(p) ? lowered(pieceOf(p.asset)?.description).toLowerCase() : "";
    const said = own && lowered(own).toLowerCase() !== name.toLowerCase() && lowered(own).toLowerCase() !== libWords ? own : "";
    const pics = named.get(tags.get(p.id)) ?? [];
    if (!by.has(p.color)) by.set(p.color, { people: false, things: new Map() });
    const g = by.get(p.color);
    g.people ||= isCharacter(p);
    const key = `${name}|${said}|${pics.join(",")}`;
    g.things.set(key, { name, ...(said ? { words: said } : {}), ...(pics.length ? { pictures: pics } : {}), count: (g.things.get(key)?.count ?? 0) + 1 });
  }
  const who = [...by].sort(([, a], [, b]) => Number(b.people) - Number(a.people)).map(([hex, g]) => {
    const name = colorName(hex);
    return { colour: name === "coloured" ? hex : name, people: g.people, things: [...g.things.values()] };
  });
  const percent = Math.round(Math.min(1, Math.max(0, Number(strength))) * 100);
  return {
    model: { id: model?.id ?? "", name: model?.name ?? "", pictures: model?.total ?? pictures.length },
    pictures,
    what: String(what ?? "").trim().replace(/\s+/g, " "),
    scene: String(scene ?? "").trim().replace(/\s+/g, " "),
    strength: { percent, band: percent < 34 ? "low" : percent < 67 ? "middle" : "high" },
    who,
  };
}

/** A short hash of the facts a prompt was written from: when it changes, the prompt is out of date. */
export function factsKey(facts) {
  const s = JSON.stringify({ ...facts, model: undefined });
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** Whether a prompt the writer wrote no longer fits: another image model, or other facts, than it was written for. */
export const promptStale = (b, modelId, key) => b?.promptBy === "writer" && !!b.prompt?.trim() && (b.promptFor?.model !== modelId || b.promptFor?.key !== key);

/** The words for the turnaround: four views of one object, each kept where and as large as its clay view, the object alone. */
export function sheetPrompt({ parts = [], what = "", tags = null, named = null, pieceOf = () => null }) {
  const legend = legendOf(parts, { tags: tags ?? tagsOf(parts), named: named ?? new Map(), pieceOf });
  return [
    "Render @sheet as a finished turnaround sheet of one object: four views side by side, the front, the left side, the back and the right side.",
    "Each view stays exactly where, as large and as shaped as its clay view, and all four show the same object with the same materials and colours.",
    legend.length ? `In @sheet, ${legend.join("; ")}.` : "",
    what.trim() ? `The object: ${sentence(what)}` : "",
    "A plain light grey studio background, soft even light, no floor, no shadow, no text, no labels and nothing else.",
  ].filter(Boolean).join(" ");
}

/**
 * What the image model is told to draw as an object's sheet: ONE object, four views in a 2 x 2 grid, each as large as its clay view.
 * `part` is the object, `what` its sheet words (the part's own, else its name and colour), `scene` the setting it belongs to (for its style).
 */
export function objectSheetPrompt({ part, what = "", scene = "", named = false, twin = 0, pieceOf = () => null }) {
  const own = sentence(what || part.made || "");
  const kind = part.shape === "character" ? "character" : "object";
  const look = describeOf(part, pieceOf);
  return [
    `Render @sheet as a finished multi-view sheet of ONE ${kind}: ${part.name}. Four views in a 2 by 2 grid of equal square cells, the front at the top left, the back at the top right, the left side at the bottom left and the right side at the bottom right.`,
    "The four cells are four different views of one real object turned on a turntable, in the order of the clay in @sheet: the front is the side that faces the camera in the top left cell, the back is the object turned half way round, the left and the right are its two sides. Copy the clay cell by cell, with the same pose, the same angle and the same size in each: anything that sticks out on one side (a handle, a spout, an arm, a hinge, a tail) shows only in the cells where the clay shows it, and stays hidden or seen end-on where the clay hides it, so no two cells are the same picture. All four show the same single object with the same materials, colours and details, on the same ground line.",
    `The ${kind} is ${look}.`,
    own ? `Its look: ${own}` : "",
    scene.trim() ? `It belongs to this setting, so match its style, but draw only the ${kind}: ${sentence(scene)}` : "",
    named ? "The pictures sent with it show how it really looks: draw it exactly like them." : "",
    // (the same kind of object twice in a scene: each is drawn on its own sheet, as a variation of the other)
    twin > 0 ? `The scene has ${twin + 1} of these. This is a variation of the kind: the same sort of ${kind}, with its own wear, grain, small marks and details, not a copy.` : "",
    `The camera is the same in all four views: ${part.shape === "character" ? "a little above his eye level" : "about 24 degrees above the object, looking down a little, as a product photographer would, so the top of it shows"}, a natural lens with no wide-angle distortion, the object turned to each side in turn. The clay colours only tell parts apart: give everything its real materials, no clay or mannequin left.`,
    "A plain pure white background, soft even light, no floor, no shadow, no text, no labels, no borders and nothing else.",
  ].filter(Boolean).join(" ");
}

const AT_TAG = /@([a-z0-9][a-z0-9-]*)/gi;
const SAID_AS = /exactly as in (?:@[a-z0-9-]+(?: and )?)*$/i;
/**
 * What the image model reads of the user's own @tags: a part's @tag becomes its description, the first time with its pictures when they
 * were sent ("a mahogany desk (exactly as in @boss-desk)"), then "the mahogany desk". A scene reference's @name stays as it is, and so does
 * a tag already said as the picture of an entry ("exactly as in @boss-desk").
 */
export function expandPrompt(text, cast = [], named = new Map()) {
  const by = new Map(cast.filter((c) => !c.ref).map((c) => [c.tag, c]));
  const seen = new Set();
  return String(text ?? "").replace(AT_TAG, (all, raw, at, whole) => {
    const c = by.get(raw.toLowerCase());
    if (!c || /[a-z0-9-]/i.test(whole[at + all.length] ?? "") || SAID_AS.test(whole.slice(0, at))) return all;
    if (seen.has(c.tag)) return /^(a|an) /i.test(c.name) ? `the ${c.name.replace(/^(a|an) /i, "")}` : c.name;
    seen.add(c.tag);
    const pics = (named.get(c.tag) ?? []).map((n) => `@${n}`).join(" and ");
    // (someone is pointed at in their pictures, the way an edit model keeps a likeness; without pictures, their words say who they are)
    if (pics) return `${c.name} (exactly as in ${pics})`;
    return c.kind === "character" && c.words && c.words.toLowerCase() !== c.name.toLowerCase() ? `${c.name} (${lowered(c.words)})` : c.name;
  });
}
