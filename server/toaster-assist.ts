// Toaster's assistant: Crumpet, the baby beaver who is its model maker. This module writes his brief, the tool he answers through, what he
// is told each time (the scene part by part, what is selected, the camera, the render's words, what has been toasted, whether a photo is
// attached, the catalogue of pieces, bodies, poses and shapes, the talk so far) and reads his answer, keeping only what he can do: bring
// shapes, pieces and characters, place, turn, size and colour them, set the camera and the render's words, and offer a paid run. He knows
// Toaster and nothing else. Building costs nothing, so the page does it at once; a render, a turnaround or a 3D model costs, so his
// answer only offers it: the page asks the user, with the price, before anything runs.
import { readFileSync } from "node:fs";
import { SHAPES, PALETTE } from "../web/js/toaster-model.js";
import { BODY_TYPES } from "../web/js/control/skeleton.js";
import { POSES, POSE_CATEGORIES } from "../web/js/control/poses.js";

export const TOASTER_OPS = ["add", "set", "remove", "clear", "camera", "words", "toast", "turnaround", "model3d"] as const;
const RUNS = ["toast", "turnaround", "model3d"] as const;
const KINDS = ["shape", "piece", "character"] as const;
const VIEWS = ["front", "right", "back", "left", "top", "persp"] as const;
const FRAMES = ["1:1", "4:5", "4:3", "3:4", "16:9", "9:16"] as const;

// The Stage's library, read once from disk: the pieces by category, and the baby animals
interface Entry { type: string; name?: string; category?: string; size?: number[] }
const manifest = JSON.parse(readFileSync(new URL("../web/models/manifest.json", import.meta.url), "utf8")) as { assets: Entry[]; animals: Entry[] };
const PIECE_LIST = manifest.assets;
const ANIMAL_LIST = manifest.animals;
const PIECE_IDS = [...PIECE_LIST, ...ANIMAL_LIST].map((e) => e.type);
const SHAPE_IDS = SHAPES.map((s) => s.id);
const BODY_IDS = BODY_TYPES.map((b) => b.id);
const POSE_IDS = POSES.map((p) => p.id);
const COLORS = PALETTE.map(([, name]) => name);

/** How Crumpet answers: the tool he is made to call, so his answer is data and never prose to be guessed at. */
export const TOASTER_TOOL = {
  name: "toaster_answer",
  description: "Answer the user: one or two short sentences, and the actions to take on the scene (none when they only ask a question).",
  input_schema: {
    type: "object",
    properties: {
      reply: { type: "string", description: "One or two short sentences, in Crumpet's voice: what you did, or the answer." },
      actions: {
        type: "array",
        description: "What to do, in order. Each has an op and its fields, as the brief lists them.",
        items: {
          type: "object",
          properties: {
            op: { type: "string", enum: [...TOASTER_OPS] },
            kind: { type: "string", enum: [...KINDS], description: "For add: a shape, a piece of the Stage's library or a character." },
            shape: { type: "string", enum: SHAPE_IDS, description: "For add a shape." },
            piece: { type: "string", enum: PIECE_IDS, description: "For add a piece: its type id from the catalogue." },
            body: { type: "string", enum: BODY_IDS, description: "For add a character: its body type." },
            pose: { type: "string", enum: POSE_IDS, description: "For add a character, and set on one: its pose (stand by default)." },
            part: { type: "string", description: "For set and remove: the part's name, from the scene or added earlier in this answer." },
            name: { type: "string", description: "For add: how to call it (later actions may use it). For set: a new name." },
            at: { type: "array", items: { type: "number" }, description: "[x, z] in metres: the centre of the part's footprint on the floor." },
            y: { type: "number", description: "Height of the part's bottom above the floor, in metres (0 on the floor, 0.75 on a table top)." },
            turn: { type: "number", description: "Yaw in degrees: 0 faces the front (+Z), 90 the right (+X), 180 the back, -90 the left." },
            face: { description: "Instead of turn: what the part faces, a part's name (from the scene or this answer) or a point [x, z]; the page turns it.", anyOf: [{ type: "string" }, { type: "array", items: { type: "number" } }] },
            size: { type: "array", items: { type: "number" }, description: "[w, h, d] in metres, before the turn." },
            scale: { type: "number", description: "A factor on the part's own size (instead of size)." },
            color: { type: "string", enum: COLORS, description: "A clay colour, by name." },
            made: { type: "string", description: "What the part is made of, in a few words (it goes into the render's words)." },
            hidden: { type: "boolean", description: "For set: hide or show the part." },
            view: { type: "string", enum: [...VIEWS], description: "For camera: frame everything from that side." },
            from: { type: "array", items: { type: "number" }, description: "For camera: [x, y, z], where the camera stands." },
            to: { type: "array", items: { type: "number" }, description: "For camera: [x, y, z], the point it looks at." },
            frame: { type: "string", enum: [...FRAMES], description: "For camera: the picture's ratio." },
            lens: { type: "number", description: "For camera: the focal length in mm, 14 to 200 (24-35 a room, 50-85 an object)." },
            save: { type: "string", description: "For camera: keep the camera (as set by this action) in a slot of this name." },
            slot: { type: "string", description: "For camera: go back to a saved camera, by its name." },
            what: { type: "string", description: "For words: what the object or scene is, with the materials of its parts." },
            scene: { type: "string", description: "For words: the scene, the light and the look." },
          },
          required: ["op"],
        },
      },
    },
    required: ["reply", "actions"],
  },
};

export const TOASTER_BRIEF = `You are Crumpet, the baby beaver who is Comfyture's model maker, in Toaster: a 3D blockout modeller. A scene is made of parts (shapes, pieces of the Stage's library, characters) framed by a camera; Toaster renders the clay with an image model ("toast it"), makes a four-view turnaround and a 3D model. You are warm, handy and proud of a tidy build; say one or two short sentences in the user's language, through the toaster_answer tool.

You build and arrange; the user presses the paid keys. You see a photo when one is attached.

Coordinates: metres, real-world sizes. The floor is y = 0. +X is the viewer's right, +Z is toward the front (where the default camera is), -Z the back. A part's place is at [x, z], the centre of its footprint on the floor, plus y: the height of its BOTTOM above the floor (on a 0.75 m table top, y = 0.75). turn is the yaw in degrees: 0 faces the front (+Z), 90 faces the right (+X), 180 the back, -90 the left. size is [w (x), h (y), d (z)] of the part's own box, before its turn.

Actions:
- add {kind, shape | piece | body, pose, name, at, y, turn | face, size | scale, color, made}: kind shape (a primitive id), piece (a library type id; animals too) or character (a body id, in a pose, stand by default). name: how to call it, so later actions in the same answer can name it. size or scale (a factor on the piece's own size). Without at, the page sets it down beside the others.
- set {part, at, y, turn | face, size | scale, color, made, name, pose, hidden}: change a part, by its name in the scene or one added earlier in this answer.
- remove {part}
- clear {}: every part goes, to build a new scene from scratch. Only as the first action.
- camera {view | from, to | slot, frame, lens, save}: view (front, right, back, left, top, persp) frames everything from that side; or from (where it stands) and to (what it looks at), [x, y, z]: eye height 1.6, low 0.4. frame 1:1, 4:5, 4:3, 3:4, 16:9, 9:16; lens mm. save keeps it as a named slot; slot goes back to one.
- words {what, scene}: the render's two lines. what: what the object or scene is, with the materials of its parts. scene: the scene, the light and the look.
- toast {}, turnaround {}, model3d {}: offer a paid run. The app asks the user for a yes, with the price, under your answer, so say it is ready, never that it has started. At most one, always last.

Rules: real-world sizes; every piece turned on purpose (turn, or face), as COMPOSING below says; nothing floating unless asked, nothing overlapping. Real things are the catalogue's pieces; primitives are for custom shapes. When you build a scene, set a camera that frames it. From a photo, rebuild its layout: what is there, where, at what sizes, and match the photo's camera height and direction. Set words when asked, or when building from a description or a photo. Offer a toast only when asked to render. Only the ids, colours and names shown below. A question: an answer, no action. Never promise what you did not do.`;

/** How a scene is composed: told each time with the scene (the brief stays short). A piece's front is the side it is used from. */
const COMPOSING = `COMPOSING: a piece's front is the side it is used from (where you sit on a seat, stand at a desk or a counter, look at a screen, a shelf, a fireplace or a picture). Turn every piece on purpose, with turn or face:
- seats face what they are for: a sofa faces the coffee table and the fireplace or the screen; armchairs angle in toward the same centre; dining chairs face their table; an office chair faces its desk.
- a desk's front is its user's side: the boss's desk has its front toward the back wall, the boss's chair between the desk and the wall facing the desk (so the boss looks into the room), visitors' chairs on the other side facing the desk.
- shelves, cabinets, a fireplace, a bed's head, wardrobes and wall art stand with their backs to a wall and face into the room; wall art hangs at y about 1.3 on a wall.
- people face what they do or who they talk to; in a pose that fits (sit on a seat at its seat height).
- a room: build its walls as boxes (0.12 thick, 2.7 tall) along the back and one side, the floor as a flat box, unless asked not to; things stand against the walls, a walkway is left free, one focal point (a desk, a fireplace) leads the layout.
- the camera of a room: from a front corner at 1.2 to 1.6, looking across the room at the focal point, lens 24 to 35; of an object: 3/4 front at its middle height, lens 50 to 85. Save it as a slot only when asked to keep it.`;

export interface Part {
  name?: string; kind?: string; shape?: string; piece?: string; body?: string; pose?: string; color?: string; made?: string;
  size?: number[]; at?: number[]; y?: number; turn?: number; hidden?: boolean;
}
export interface Summary {
  draft?: string;
  parts?: Part[];
  selected?: string[];
  camera?: { from?: number[]; at?: number[]; frame?: string; focal?: number };
  cameras?: { name?: string; from?: number[]; at?: number[]; frame?: string; focal?: number }[];
  words?: { what?: string; scene?: string };
  renders?: number;
  turnaround?: boolean;
  model3d?: boolean;
}
export interface Turn { role: string; text: string; did?: string[] }

const cut = (v: unknown, n: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const list = <T>(v: unknown, n: number): T[] => (Array.isArray(v) ? (v.slice(0, n) as T[]) : []);
const things = <T>(v: unknown, n: number): T[] => list<T>(v, n).filter((x) => x && typeof x === "object");
const num = (v: unknown, lo: number, hi: number): number | undefined => {
  const n = Number(v);
  return v !== null && v !== "" && v !== undefined && !Array.isArray(v) && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : undefined;
};
const oneOf = <T extends string>(v: unknown, values: readonly T[]): T | undefined => (typeof v === "string" && (values as readonly string[]).includes(v) ? (v as T) : undefined);
const r2 = (v: number) => Math.round(v * 100) / 100;
const metres = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? String(r2(v)) : "?");
const triple = (v: unknown) => (Array.isArray(v) ? v.slice(0, 3).map(metres).join(", ") : "?");

/** What Crumpet is told each time: the scene, the selection, the camera, the words, what was made, the catalogue, the talk so far. */
export function toasterPrompt(s: Summary, turns: Turn[], { picture = false }: { picture?: boolean } = {}) {
  const lines: string[] = [];
  const parts = things<Part>(s.parts, 150);
  lines.push(`THE SCENE: ${cut(s.draft, 60) || "untitled"}, ${parts.length ? `${parts.length} part${parts.length === 1 ? "" : "s"}` : "empty"}.`);
  for (const p of parts) {
    const what = p.kind === "piece" ? `piece ${cut(p.piece, 40)}` : p.kind === "character" ? `character ${cut(p.body, 20)}, pose ${cut(p.pose, 30) || "stand"}` : `shape ${cut(p.shape, 20)}`;
    lines.push(`- ${cut(p.name, 40) || "part"}: ${what}, ${cut(p.color, 12) || "grey"}, size ${triple(p.size)}, at ${Array.isArray(p.at) ? p.at.slice(0, 2).map(metres).join(", ") : "?"}, y ${metres(p.y)}, turn ${metres(p.turn)}${p.made ? `, made of ${cut(p.made, 60)}` : ""}${p.hidden ? ", hidden" : ""}`);
  }
  const selected = list<unknown>(s.selected, 20).map((n) => cut(n, 40)).filter(Boolean);
  lines.push(`SELECTED: ${selected.length ? selected.join(", ") : "nothing"}.`);
  const c = s.camera;
  lines.push(c && typeof c === "object" ? `CAMERA: from ${triple(c.from)}, looking at ${triple(c.at)}, frame ${cut(c.frame, 5) || "?"}, lens ${Number(c.focal) || 50} mm.` : "CAMERA: the default, in front.");
  const slots = things<{ name?: string; from?: number[]; at?: number[]; frame?: string; focal?: number }>(s.cameras, 12);
  lines.push(slots.length ? `SAVED CAMERAS: ${slots.map((k) => `${cut(k.name, 30)} (from ${triple(k.from)}, at ${triple(k.at)}, ${cut(k.frame, 5)}, ${Number(k.focal) || 50} mm)`).join("; ")}.` : "SAVED CAMERAS: none.");
  const w = s.words && typeof s.words === "object" ? s.words : {};
  lines.push(`WORDS: what "${cut(w.what, 300)}"; scene "${cut(w.scene, 300)}".`);
  const made = [Number(s.renders) > 0 ? `${Math.round(Number(s.renders))} render${Number(s.renders) === 1 ? "" : "s"}` : "", s.turnaround ? "a turnaround" : "", s.model3d ? "a 3D model" : ""].filter(Boolean);
  lines.push(`TOASTED SO FAR: ${made.length ? made.join(", ") : "nothing yet"}.`);
  lines.push(picture ? "A PHOTO IS ATTACHED: the user wants this layout rebuilt. Look at it." : "NO PHOTO is attached, and you cannot see one.");
  lines.push("", COMPOSING, "", "THE CATALOGUE (ids)");
  const byCategory = new Map<string, string[]>();
  for (const e of PIECE_LIST) byCategory.set(cut(e.category, 30) || "Other", [...(byCategory.get(cut(e.category, 30) || "Other") ?? []), e.type]);
  for (const [category, ids] of byCategory) lines.push(`Pieces, ${category}: ${ids.join(", ")}`);
  lines.push(`Animals (pieces, baby): ${ANIMAL_LIST.map((e) => e.type).join(", ")}`);
  lines.push(`Bodies (characters), with their heights: ${BODY_TYPES.map((b) => `${b.id} ${b.profile.height} m`).join(", ")}`);
  for (const category of POSE_CATEGORIES) {
    const ids = POSES.filter((p) => p.category === category).map((p) => p.id);
    if (ids.length) lines.push(`Poses, ${category}: ${ids.join(", ")}`);
  }
  lines.push(`Shapes: ${SHAPE_IDS.join(", ")}`, `Colours: ${COLORS.join(", ")}`);
  lines.push("", "THE CONVERSATION");
  for (const t of turns.slice(-8)) lines.push(`${t.role === "user" ? "User" : "Crumpet"}: ${cut(t.text, 600)}${t.did?.length ? ` [the app did: ${t.did.join(", ")}]` : ""}`);
  return lines.join("\n");
}

// a pair or a triple of numbers, each within its range; a short or broken one is dropped
const vector = (v: unknown, n: number, lo: number, hi: number): number[] | undefined => {
  if (!Array.isArray(v) || v.length < n) return undefined;
  const out = v.slice(0, n).map((x) => num(x, lo, hi));
  return out.every((x) => x !== undefined) ? out.map((x) => r2(x!)) : undefined;
};
// a turn wrapped into -180..180 (a turn of 360 or more is the same as less)
const wrap = (deg: number) => {
  const d = ((((deg + 180) % 360) + 360) % 360) - 180;
  return d === -180 && deg > 0 ? 180 : d;
};

/**
 * Crumpet's answer, read whole and checked against what the page told him: only his own actions, each with only what it takes, every
 * choice one of its values, every number within its range, every part named one that exists, and at most one paid run, last.
 */
export function readToasterAnswer(reply: string, s: Summary = {}) {
  const from = reply.indexOf("{");
  const to = reply.lastIndexOf("}");
  let raw: any;
  try {
    raw = JSON.parse(reply.slice(from, to + 1));
  } catch {
    return { reply: reply.replace(/[{}"]/g, "").trim().slice(0, 400) || "I didn't catch that. Say it again?", actions: [] as any[] };
  }
  const names = new Map<string, string>();
  for (const p of things<Part>(s.parts, 150)) if (cut(p.name, 40)) names.set(cut(p.name, 40).toLowerCase(), cut(p.name, 40));
  const known = (v: unknown) => names.get(cut(v, 40).toLowerCase());
  const slotNames = new Map(things<{ name?: string }>(s.cameras, 12).map((k) => [cut(k.name, 30).toLowerCase(), cut(k.name, 30)]));
  // the fields add and set share
  const fields = (a: any, out: any) => {
    const at = vector(a.at, 2, -60, 60);
    if (at) out.at = at;
    if (num(a.y, 0, 60) !== undefined) out.y = r2(num(a.y, 0, 60)!);
    if (num(a.turn, -1e6, 1e6) !== undefined) out.turn = r2(wrap(num(a.turn, -1e6, 1e6)!));
    // what it faces: a point, or a part's name (checked once the whole answer is read: it may be added after)
    const point = vector(a.face, 2, -60, 60);
    if (point) out.face = point;
    else if (cut(a.face, 40)) out.face = cut(a.face, 40);
    const size = vector(a.size, 3, 0.01, 60);
    if (size) out.size = size;
    else if (num(a.scale, 0.05, 20) !== undefined) out.scale = r2(num(a.scale, 0.05, 20)!);
    const color = oneOf(a.color, COLORS);
    if (color) out.color = color;
    if (cut(a.made, 120)) out.made = cut(a.made, 120);
    if (cut(a.name, 40)) out.name = cut(a.name, 40);
  };
  const actions: any[] = [];
  let run: string | undefined;
  for (const a of list<any>(raw.actions, 60)) {
    if (actions.length >= 40) break;
    switch (a?.op) {
      case "clear":
        if (actions.length === 0) {
          actions.push({ op: "clear" });
          names.clear();
        }
        break;
      case "add": {
        const kind = oneOf(a.kind, KINDS);
        if (!kind) break;
        const out: any = { op: "add", kind };
        if (kind === "shape") {
          const shape = oneOf(a.shape, SHAPE_IDS);
          if (!shape) break;
          out.shape = shape;
        } else if (kind === "piece") {
          const piece = oneOf(a.piece, PIECE_IDS);
          if (!piece) break;
          out.piece = piece;
        } else {
          const body = oneOf(a.body, BODY_IDS);
          if (!body) break;
          out.body = body;
          const pose = oneOf(a.pose, POSE_IDS);
          if (a.pose !== undefined && a.pose !== null && a.pose !== "" && !pose) break;
          if (pose) out.pose = pose;
        }
        fields(a, out);
        if (out.name) names.set(out.name.toLowerCase(), out.name);
        actions.push(out);
        break;
      }
      case "set": {
        const part = known(a.part);
        if (!part) break;
        const out: any = { op: "set", part };
        fields(a, out);
        const pose = oneOf(a.pose, POSE_IDS);
        if (pose) out.pose = pose;
        if (typeof a.hidden === "boolean") out.hidden = a.hidden;
        if (out.name) {
          names.delete(part.toLowerCase());
          names.set(out.name.toLowerCase(), out.name);
        }
        if (Object.keys(out).length > 2) actions.push(out);
        break;
      }
      case "remove": {
        const part = known(a.part);
        if (!part) break;
        names.delete(part.toLowerCase());
        actions.push({ op: "remove", part });
        break;
      }
      case "camera": {
        const out: any = { op: "camera" };
        const view = oneOf(a.view, VIEWS);
        if (view) out.view = view;
        else {
          const pos = vector(a.from, 3, -200, 200);
          const look = vector(a.to ?? a.at, 3, -200, 200);
          if (pos) out.from = pos;
          if (look) out.at = look;
        }
        const slot = slotNames.get(cut(a.slot, 30).toLowerCase());
        if (slot && !out.view && !out.from) out.slot = slot;
        const frame = oneOf(a.frame, FRAMES);
        if (frame) out.frame = frame;
        if (num(a.lens, 14, 200) !== undefined) out.lens = Math.round(num(a.lens, 14, 200)!);
        if (cut(a.save, 30)) out.save = cut(a.save, 30);
        if (Object.keys(out).length > 1) actions.push(out);
        break;
      }
      case "words": {
        const out: any = { op: "words" };
        if (cut(a.what, 600)) out.what = cut(a.what, 600);
        if (cut(a.scene, 600)) out.scene = cut(a.scene, 600);
        if (Object.keys(out).length > 1) actions.push(out);
        break;
      }
      case "toast":
      case "turnaround":
      case "model3d":
        // the first offer stands; a second one is not asked
        run ??= a.op;
        break;
    }
  }
  // a face named after a part is kept when that part exists by the end of the answer
  for (const a of actions) if (typeof a.face === "string" && !known(a.face)) delete a.face;
  for (const a of actions) if (typeof a.face === "string") a.face = known(a.face);
  // (a change that had nothing left but a face on nobody is no change)
  const kept = actions.filter((a) => a.op !== "set" || Object.keys(a).length > 2);
  if (run) kept.push({ op: run });
  return { reply: cut(raw.reply, 600), actions: kept };
}
