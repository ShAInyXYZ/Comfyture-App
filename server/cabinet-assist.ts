// Cabinet's assistant: Canelle, the baby squirrel who is its stylist. This module writes her brief, the tool she answers through, what
// she is told each time (the shoot: who is in it and how each is dressed and posed, the style, the frame, the backdrop, what a picture
// costs; the cast she can pick from; the shelves: every outfit, pose and style; the talk so far) and reads her answer, keeping only what
// she can do: set the cast, dress a character, pick the style, set the frame and backdrop, write the notes, and ask to shoot. Setting
// up costs nothing, so the page does it at once; shooting costs credits, so her answer only asks: the page asks the user, with the
// price, before a picture is made. She knows Cabinet and nothing else.

import { WARDROBE_LIST, POSES_LIST, STYLES_LIST, WARDROBE_GROUPS, POSE_GROUPS } from "../web/js/cabinet-library.js";

export const CABINET_OPS = ["cast", "dress", "style", "frame", "notes", "shoot"] as const;
const FORMATS = ["post", "story", "tryon", "shoot"] as const;
const BACKDROPS = ["studio", "colour", "street", "cafe", "park", "beach", "night"] as const;
const MOST_CAST = 3;

/** How Canelle answers: the tool she is made to call, so her answer is data and never prose to be guessed at. */
export const CABINET_TOOL = {
  name: "cabinet_answer",
  description: "Answer the user: one or two short sentences, and the actions to take on the shoot (none when they only ask a question).",
  input_schema: {
    type: "object",
    properties: {
      reply: { type: "string", description: "One or two short sentences, in Canelle's voice: what you set up, or the answer." },
      actions: {
        type: "array",
        description: "What to do, in order. Each has an op and its fields, as the brief lists them.",
        items: {
          type: "object",
          properties: {
            op: { type: "string", enum: [...CABINET_OPS] },
            characters: { type: "array", items: { type: "string" }, description: "For cast: the ids of THE CAST to picture, left to right, one to three." },
            character: { type: "number", description: "For dress: which character of the shoot, 1 for the first (leftmost)." },
            outfits: { type: "array", items: { type: "string" }, description: "For dress: ids of THE WARDROBE (up to four alone, one in a group); [] for their own clothes." },
            poses: { type: "array", items: { type: "string" }, description: "For dress: ids of THE POSES (up to four alone, one in a group); [] for a natural pose." },
            style: { type: "string", description: "For style: an id of THE STYLES, or none for their own look." },
            format: { type: "string", enum: [...FORMATS], description: "For frame: what the picture is for." },
            backdrop: { type: "string", enum: [...BACKDROPS], description: "For frame: where it is taken." },
            notes: { type: "string", description: "For notes: what the references cannot show (the light, the mood, how they stand together), a sentence or two." },
          },
          required: ["op"],
        },
      },
    },
    required: ["reply", "actions"],
  },
};

export const CABINET_BRIEF = `You are Canelle, the baby squirrel who is the stylist of Comfyture's Cabinet. Cabinet dresses characters and poses them for a picture: a social post, a story, a try-on or a photoshoot. A shoot pictures one to three characters. Alone, a character can try up to four outfits in up to four poses, and every outfit in every pose is one picture. In a group each character wears one outfit in one pose and one picture shows them all, left to right. The outfits and poses come from the shelves below; a style draws the whole picture one way (anime, watercolour, a vintage film…), or none keeps their own look. You are warm, chic and quick, and say one or two short sentences in the user's language, through the cabinet_answer tool.

You set the shoot up; the user presses Shoot. You cannot bring in a picture of their own.

Actions:
- cast {characters}: who is in the picture, left to right, by ids of THE CAST (one to three). A character the user brought in from a picture is kept when you keep their place.
- dress {character, outfits, poses}: dress one character of the shoot (1 is the first): ids of THE WARDROBE and of THE POSES. Alone: up to four of each. In a group: one of each. [] leaves their own clothes or a natural pose.
- style {style}: an id of THE STYLES, or none.
- frame {format, backdrop}: post, story, tryon or shoot; studio, colour, street, cafe, park, beach or night. Send only what was asked or what the job needs.
- notes {notes}: what the pictures cannot show: how they turn, where they look, the light, how a pose fits an outfit (a cloak hides the arms: say where the hands go). Short.
- shoot {}: make the pictures. It costs credits: the app asks the user first, so say it is ready, never that it has started.

Rules: only the ids listed below. Pick what fits the occasion and the person: a wedding, a beach, the office, a country's traditional dress (THE WARDROBE says each one's country), and poses that suit the outfit (pockets need trousers with pockets; a long cloak or gown suits standing or walking). In a group, set the cast first, then dress each one. Shoot only when they say to. A question: an answer, no action. Never promise what you did not do. Someone new ("how do I start?"): two short sentences: pick who on the left, outfits and poses on the shelves, then Shoot.`;

interface Member { who?: string; outfits?: string[]; poses?: string[] }
interface Summary {
  current?: unknown;
  cast?: Member[];
  characters?: { id: string; name?: string; role?: string; look?: string }[];
  active?: number;
  format?: string;
  backdrop?: string;
  style?: string | null;
  notes?: string;
  model?: string;
  price?: { pictures?: number; credits?: number | null; blocked?: string };
  pictures?: number;
}
export interface Turn { role: string; text: string; did?: string[] }

const cut = (v: unknown, n: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const list = <T>(v: unknown, n: number): T[] => (Array.isArray(v) ? (v.slice(0, n) as T[]) : []);
const oneOf = <T extends string>(v: unknown, values: readonly T[]): T | undefined => (typeof v === "string" && (values as readonly string[]).includes(v) ? (v as T) : undefined);

const WORLD = new Set(["africa", "middle-east", "asia", "europe", "americas"]);
const wardrobeIds = WARDROBE_LIST.map((r) => r[0]);
const poseIds = POSES_LIST.map((r) => r[0]);
const styleIds = STYLES_LIST.map((r) => r[0]);
const nameOf = (rows: readonly (readonly string[])[], id: string) => rows.find((r) => r[0] === id)?.[1] ?? id;

/** The shelves, as she reads them: each group, then its ids and names (a traditional outfit with where it comes from). */
function shelves() {
  const byGroup = (rows: readonly (readonly string[])[], groups: Record<string, string>, extra: (r: readonly string[]) => string = () => "") =>
    Object.entries(groups).map(([g, label]) => `${label}: ${rows.filter((r) => r[2] === g).map((r) => `${r[0]} = ${r[1]}${extra(r)}`).join(", ")}`).join(". ");
  // (where a traditional outfit comes from: the first words of its tags)
  const origin = (r: readonly string[]) => (WORLD.has(r[2]) && r[4] ? ` (${r[4].split(" ").slice(0, 3).join(" ")})` : "");
  return [
    `THE WARDROBE (id = name, by group). ${byGroup(WARDROBE_LIST, WARDROBE_GROUPS, origin)}.`,
    `THE POSES (id = name, by group). ${byGroup(POSES_LIST, POSE_GROUPS)}.`,
    `THE STYLES (id = name): ${STYLES_LIST.map((r) => `${r[0]} = ${r[1]}`).join(", ")}; none = their own look.`,
  ];
}

/** What Canelle is told each time: the shoot, the cast to pick from, the shelves, the price, the talk so far. */
export function cabinetPrompt(s: Summary, turns: Turn[]) {
  const lines: string[] = [];
  const now = s.current && typeof s.current === "object" ? (s.current as { shoot?: string; active?: number }) : null;
  if (now) lines.push(`THE SHOOT OPEN: "${cut(now.shoot, 60)}"; the shelves dress character ${Number(now.active) || 1}.`);
  const chars = list<NonNullable<Summary["characters"]>[number]>(s.characters, 40).filter((c) => c && typeof c === "object");
  lines.push(`THE CAST (id = name, role, look): ${chars.map((c) => `${cut(c.id, 24)} = ${cut(c.name, 24)}, ${cut(c.role, 30)}, ${cut(c.look, 140)}`).join(" | ")}.`);
  const cast = list<Member>(s.cast, MOST_CAST).filter((m) => m && typeof m === "object");
  lines.push(cast.length
    ? `THE SHOOT, left to right: ${cast.map((m, i) => `${i + 1}. ${cut(m.who, 40) || "not chosen yet"}, wearing ${list<string>(m.outfits, 4).map((id) => nameOf(WARDROBE_LIST, String(id))).join(", ") || "their own clothes"}, posed ${list<string>(m.poses, 4).map((id) => nameOf(POSES_LIST, String(id))).join(", ") || "naturally"}`).join("; ")}.${cast.length > 1 ? " A group: one outfit and one pose each, one picture of them all." : " Alone: every outfit in every pose."}`
    : "THE SHOOT: no one yet.");
  lines.push(`THE FRAME: ${cut(s.format, 10) || "post"}, the backdrop ${cut(s.backdrop, 10) || "studio"}, the style ${cut(s.style, 20) || "none"}${s.notes ? `, the notes "${cut(s.notes, 200)}"` : ""}.`);
  const p = s.price;
  if (p && typeof p === "object") lines.push(`SHOOT: ${Number(p.pictures) || 0} picture${Number(p.pictures) === 1 ? "" : "s"}${typeof p.credits === "number" ? `, about ${Math.round(p.credits)} credits` : ", GPU time"}${s.model ? ` on ${cut(s.model, 30)}` : ""}.${p.blocked ? ` It cannot shoot yet: ${cut(p.blocked, 100)}.` : ""}`);
  lines.push(...shelves());
  lines.push("", "THE CONVERSATION");
  for (const turn of turns.slice(-8)) lines.push(`${turn.role === "user" ? "User" : "Canelle"}: ${cut(turn.text, 600)}${turn.did?.length ? ` [the app did: ${turn.did.join(", ")}]` : ""}`);
  return lines.join("\n");
}

/**
 * Canelle's answer, read whole and checked: only her own actions, each with only what it takes, every id one of the shelves or of the
 * cast the page listed, and shoot once, last. Anything else is dropped.
 */
export function readCabinetAnswer(reply: string, s: Summary = {}) {
  const from = reply.indexOf("{");
  const to = reply.lastIndexOf("}");
  let raw: any;
  try {
    raw = JSON.parse(reply.slice(from, to + 1));
  } catch {
    return { reply: reply.replace(/[{}"]/g, "").trim().slice(0, 400) || "I didn't catch that. Say it again?", actions: [] as any[] };
  }
  const charIds = list<{ id: string }>(s.characters, 40).map((c) => String(c?.id));
  let size = Math.min(MOST_CAST, Math.max(1, list(s.cast, MOST_CAST).length));
  const actions: any[] = [];
  let shoot = false;
  for (const a of list<any>(raw.actions, 20)) {
    if (actions.length >= 10) break;
    switch (a?.op) {
      case "cast": {
        // (the ones on the list, each once, the first three)
        const characters = [...new Set(list<unknown>(a.characters, 12).map((x) => oneOf(x, charIds)).filter((x): x is string => !!x))].slice(0, MOST_CAST);
        if (characters.length) {
          actions.push({ op: "cast", characters });
          size = characters.length;
        }
        break;
      }
      case "dress": {
        const character = Math.round(Number(a.character) || 1);
        if (character < 1 || character > size) break;
        // a group wears one of each: the first that is on the shelf
        const most = size > 1 ? 1 : 4;
        const outfits = list<unknown>(a.outfits, 8).map((x) => oneOf(x, wardrobeIds)).filter((x): x is string => !!x).slice(0, most);
        const poses = list<unknown>(a.poses, 8).map((x) => oneOf(x, poseIds)).filter((x): x is string => !!x).slice(0, most);
        actions.push({ op: "dress", character, ...(Array.isArray(a.outfits) ? { outfits } : {}), ...(Array.isArray(a.poses) ? { poses } : {}) });
        break;
      }
      case "style": {
        const style = a.style === "none" || a.style === null ? null : oneOf(a.style, styleIds);
        if (style !== undefined) actions.push({ op: "style", style });
        break;
      }
      case "frame": {
        const format = oneOf(a.format, FORMATS);
        const backdrop = oneOf(a.backdrop, BACKDROPS);
        if (format || backdrop) actions.push({ op: "frame", ...(format ? { format } : {}), ...(backdrop ? { backdrop } : {}) });
        break;
      }
      case "notes":
        if (typeof a.notes === "string") actions.push({ op: "notes", notes: cut(a.notes, 300) });
        break;
      case "shoot":
        shoot = true;
        break;
    }
  }
  if (shoot) actions.push({ op: "shoot" });
  return { reply: cut(raw.reply, 400), actions };
}
