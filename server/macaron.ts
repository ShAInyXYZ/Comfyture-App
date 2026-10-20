// Macaron's server side: Brioche, the brand's assistant (a brief, the tool she answers through, her
// answer read and checked), and the files a design leaves as: its exported pictures and the video
// encoded from its frames.
import { createHash, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, open, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

// ------------------------------------------------------------------ Brioche, the assistant

/** The workspaces of Macaron: Brioche works in the one that is open, with a brief, a tool and presets of its own. */
export const SPACES = ["idea", "kit", "content"] as const;
export type Space = (typeof SPACES)[number];
export const spaceOf = (v: unknown): Space => ((SPACES as readonly string[]).includes(v as string) ? (v as Space) : "content");

const OPS: Record<Space, readonly string[]> = {
  idea: ["write_brief", "add_direction", "pick_direction", "add_note", "open_space"],
  kit: ["set_colour", "add_colour", "add_colourway", "set_voice", "add_rule", "set_type", "open_space"],
  content: ["edit_text", "set_layer", "add_layer", "remove_layer", "set_background", "apply_kit", "suggest_layout", "adapt_format", "make_variation", "generate_background", "set_status", "rename", "select_design", "add_design", "add_motion", "plan_design", "open_space"],
};
const NESTED = new Set(["edit_text", "set_layer", "add_layer", "remove_layer", "set_background", "apply_kit", "suggest_layout", "adapt_format"]);

const str = (description?: string) => ({ type: "string", ...(description ? { description } : {}) });
const list = (description: string) => ({ type: "array", items: { type: "string" }, description });
const SPACE_PROPS = { space: { type: "string", enum: [...SPACES], description: "For open_space: the workspace to open." } };
const PROPS: Record<Space, Record<string, unknown>> = {
  idea: {
    fields: { type: "object", description: "For write_brief: pitch, goal, audience, message, tone, deliverables, constraints, channels (short texts)." },
    goals: list("For write_brief: up to three short goals that start with a verb, such as Feel welcoming."),
    id: str("A direction's id, from the list below."),
    name: str("A direction's name, two or three words."),
    note: str("One line: how a direction feels, or what a story note says."),
    title: str("For add_note: the note's title."),
    logo: str("A logo id from the kit, for the mark shown on a direction."),
    ...SPACE_PROPS,
  },
  kit: {
    id: str("A palette colour's id, from the kit below."),
    hex: str("A colour as #RRGGBB."),
    name: str("A name: of a colour, or of a colourway."),
    role: str("What a colour is for, in a few words."),
    ground: str("A palette id: the ground a colourway sits on."),
    logo: str("A logo id from the kit."),
    summary: str("How the brand talks, in a sentence."),
    words: list("The voice in up to six words."),
    dos: list("What the voice does, up to eight short lines."),
    donts: list("What the voice never does, up to eight short lines."),
    kind: { type: "string", enum: ["do", "dont"], description: "For add_rule: a rule to keep (do) or never break (dont)." },
    text: str("A rule's words."),
    family: str("A typeface's family."),
    weight: { type: "number", description: "A typeface's weight, 300 to 900." },
    type: { type: "string", enum: ["display", "text", "mono"], description: "For set_type: the type role." },
    ...SPACE_PROPS,
  },
  content: {
    layer: str("A layer's id, from the design below."),
    design: str("A design's id."),
    text: str(),
    props: { type: "object", description: "Layer properties to set: x, y, w, h, size, align, valign, colorRole, accent, fontRole, lineHeight, tracking, opacity, hidden, caps, logo, rot, fit, text, src, role, shape, radius." },
    type: { type: "string", enum: ["text", "image", "logo", "shape"] },
    layout: { type: "string", enum: ["stack", "left", "poster", "split"] },
    format: { type: "string", enum: ["4:5", "1:1", "9:16"] },
    kind: { type: "string", enum: ["copy", "composition", "colour", "intent", "format"] },
    name: str(),
    note: str(),
    color: str("A palette id for a background."),
    asset: str("An asset's id, for a picture."),
    dim: { type: "number", description: "How much ink over a background picture, 0 to 0.9." },
    prompt: str("What a new picture shows, in plain words. Never ask for text, a logo or a headline in it."),
    model: { type: "string", enum: ["gpt", "flux"] },
    use: { type: "string", enum: ["background", "image"] },
    status: { type: "string", enum: ["draft", "review", "approved", "scheduled"] },
    purpose: { type: "string", enum: ["Launch", "Feature", "Showcase", "Brand", "Offer", "Motion"] },
    day: { type: "string", enum: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] },
    actions: { type: "array", items: { type: "object" }, description: "For make_variation: the changes to make on the new copy." },
    ...SPACE_PROPS,
  },
};
const DESCRIPTION: Record<Space, string> = {
  idea: "Answer the user: one short, warm sentence, and the actions to take on the brief, the directions and the story (none when they only ask a question).",
  kit: "Answer the user: one short, warm sentence, and the actions to take on the brand kit: its palette, colourways, voice, rules and type (none when they only ask a question).",
  content: "Answer the user: one short, warm sentence, and the actions to take on the design (none when they only ask a question).",
};

/** How Brioche answers in a workspace: the tool she is made to call, with only the actions of that workspace. */
export function macaronTool(space: Space = "content") {
  return {
    name: "macaron_answer",
    description: DESCRIPTION[space],
    input_schema: {
      type: "object",
      properties: {
        reply: { type: "string", description: "One or two short sentences, in Brioche's voice: what you did, or the answer." },
        actions: {
          type: "array",
          description: "The changes to make, in order. Each has an op and its fields, as the brief lists them.",
          items: { type: "object", properties: { op: { type: "string", enum: [...OPS[space]] }, ...PROPS[space] }, required: ["op"] },
        },
      },
      required: ["reply", "actions"],
    },
  };
}
export const MACARON_TOOL = macaronTool("content");

const COMMON = `You are Brioche, the baby bunny who runs Comfyture's Macaron room, the brand room: you know brand work and nothing else. You are warm, brief and practical; you speak in one or two short sentences. You answer through the macaron_answer tool: a reply and the actions to take.

Macaron has three workspaces: Design idea (the brief, the moodboard, the story, the directions), Brand kit (palette, logos, type, voice, rules, product) and Content (posts, stories, motion, exports). You work in the one that is open now, and only its actions are yours. When what is asked belongs to another workspace, say so in a sentence and offer to open it (the open_space action opens it; then the user asks again). When the user only asks a question or for advice, answer it and take no action. Never promise what you did not do. Use the ids shown below, never invent one.`;

const BRIEFS: Record<Space, string> = {
  idea: `THE OPEN WORKSPACE: Design idea. It holds the brief (the idea in two lines, three goals that say how it should feel, and the brief's fields), a moodboard of references, the story of how the design came about, and the directions tried for the mark and the look, one of them picked.

Actions (op and its fields):
- write_brief {fields, goals}: set the brief. fields may hold pitch (the idea in two short lines), goal, audience, message, tone, deliverables, constraints, channels; goals are up to three short goals that start with a verb ("Feel welcoming", "Make it simple", "Stay playful"). Only what you write is changed.
- add_direction {name, note, logo}: a new direction for the mark and the look: a name of two or three words and one line on how it feels. The picture comes later; logo is a wordmark's id from the kit.
- pick_direction {id}: the direction the work goes with.
- add_note {title, note}: a line in the story: what was tried or decided.
- open_space {space}.

Rules: write in the brand's voice and keep it short and concrete; a goal is three or four words; never repeat a direction that is already there.`,
  kit: `THE OPEN WORKSPACE: Brand kit. It holds the palette (colours with what each is for), the logo files in colourways (a wordmark, a mark and an app icon in several colours; a colourway is a logo file on a ground that reads), the type, the voice and the rules.

Actions (op and its fields):
- set_colour {id, hex, name, role}: change a palette colour (id from the kit; any of hex, name, role).
- add_colour {name, hex, role}: a new colour (the palette holds up to eight).
- add_colourway {name, ground, logo}: save a pairing of a logo file on a palette ground (ground is a palette id, logo a logo id); choose one that reads (contrast 4.5 or more) and is not shown yet.
- set_voice {summary, words, dos, donts}: change how the brand talks; only what you give is changed.
- add_rule {kind, text}: a rule to keep (kind do) or never break (kind dont), one plain line.
- set_type {type, family, weight}: change a type role (display, text or mono).
- open_space {space}.

Logo files are the supplied files: never redraw, recolour or invent one; only pair them. Colours are written as #RRGGBB and must stay readable on each other: the notes below list the pairs that do not. Keep names short.`,
  content: `THE OPEN WORKSPACE: Content. It holds the brand's posts (designs), their variations, the week's plan, motion pieces and exports.

A design is layers on a ground: text, image, logo and shape layers, each with an id. Positions are fractions of the frame (x, y, w, h: 0 to 1, from the top left); a text's size is a fraction of the frame's width (0.1 is a big headline, 0.034 a subhead, 0.026 a label). Formats: 4:5 (1080x1350), 1:1 (1080x1080), 9:16 (1080x1920). Safe zones: keep text and logos inside x 0.07 to 0.93 and y 0.06 to 0.94; in 9:16 clear of the top 13% and the bottom 18% (the story's app covers them). Edits apply to the format that is open, so a change to "y" in 1:1 does not move the layer in 4:5.

Actions (op and its fields):
- edit_text {layer, text}: the words of a text layer. Wrap one word in *asterisks* to set it in the accent colour; \\n is a new line.
- set_layer {layer, props}: change a layer's properties in the open format (x, y, w, h, size, align left|center|right, valign top|middle|bottom, colorRole, accent, fontRole display|text|mono, lineHeight, tracking, opacity, hidden, caps, logo, rot, fit cover|contain, role).
- add_layer {type, props}: a new text, shape, image (props.src is an asset's url) or logo (props.logo is a logo id from the kit).
- remove_layer {layer}
- set_background {color, asset, dim}: a palette id for the ground, and an asset id for a picture behind (dim: 0 to 0.9 of ink over it).
- apply_kit {}: sets type roles, colours from the palette, the logo in the file that reads on its ground, keeps everything inside the safe zones. Use it when asked to apply or check the brand.
- suggest_layout {layout}: lays the layers out by their roles: stack (centred), left (type left, picture bleeding), poster (picture full-bleed, type over it), split (type and picture side by side). In the open format.
- adapt_format {format}: lays the design out for another format, keeping it readable and inside its safe zones, and opens that format.
- make_variation {kind, name, note, actions}: saves a copy of the design as a variation and makes the nested actions on the copy. kinds: copy (other words), composition (another layout), colour (another ground and colours), intent (another goal: awareness, trial, community), format. Always nest at least one action.
- generate_background {prompt, model, use}: makes a new picture with an image model and puts it behind the design (use: background) or as a layer (use: image). gpt is GPT Image 2.5 Flare (follows references, characters, products), flux is FLUX 3 (photographic scenes). The prompt describes a scene only: never ask for words, a logo or a headline in the picture: those are layers.
- add_design {name, purpose, format, layout}: a new post from the brand kit (type roles, colours, the logo and the product laid out); it opens in the editor.
- add_motion {design}: a motion piece from a design (the open one when design is left out), with a first timing.
- plan_design {design, day}: the day of the week a post goes out (mon to sun).
- set_status {design, status}, rename {name}, select_design {design}, open_space {space}.

Rules: change only what is asked. Use the layer ids and asset ids shown below, and palette ids for colours (never hex). Copy follows the brand's voice and never uses its don'ts; headlines are short. Colours: text must stay readable on its ground (yellow and warm white on ink or plum, ink on yellow or warm white).`,
};

/** What each tool of her panel asks of her, in the workspace it belongs to (the panel sends the id). */
const PRESETS: Record<Space, Record<string, string>> = {
  idea: {
    direction: "The user picked the tool New direction: invent one more way the mark and the look could go, clearly different from the directions listed. A name of two or three words and one line on how it feels. Add it with add_direction.",
    brief: "The user picked the tool Write the brief: from what the brand is (its kit, its voice, what the brief already says), write the idea in two short lines (pitch), three short goals that start with a verb, and fill what is empty in the brief's fields. Use write_brief.",
  },
  kit: {
    colourway: "The user picked the tool Make a colourway: choose a ground from the palette and a logo file that reads on it (contrast 4.5 or more), a pairing the kit does not show yet, name it in two or three words, and add it with add_colourway.",
  },
  content: {
    post: "The user picked the tool A post from a design: make a new post from the open design (or the best approved one): a copy variation with a fresh headline and subhead in the brand's voice, drafted, for a day of the week that is free. Use make_variation kind copy with nested edit_text actions, then plan_design for the copy.",
    story: "The user picked the tool A story version: lay the open design out for the story (9:16), its words kept, inside the story's safe zones. Use adapt_format with format 9:16.",
    animate: "The user picked the tool Animate it: make a motion piece of the open design, with its first timing. Use add_motion with the design's id.",
  },
};
const SPACE_NAME: Record<Space, string> = { idea: "Design idea", kit: "Brand kit", content: "Content" };

/** Her brief for a workspace: who she is, what the room is, and only what she can do there. */
export const macaronBrief = (space: Space = "content") => `${COMMON}\n\n${BRIEFS[space]}`;
export const MACARON_BRIEF = macaronBrief("content");

type Summary = Record<string, any>;
const r = (v: unknown, n = 3) => (typeof v === "number" ? Math.round(v * 10 ** n) / 10 ** n : v);
const cut = (s: unknown, n: number) => String(s ?? "").replace(/\s+/g, " ").slice(0, n);

/** What Brioche is told each time: the workspace open and its things, the talk so far. Nothing of the other workspaces. */
export function macaronPrompt(s: Summary, turns: { role: string; text: string }[]) {
  const space = spaceOf(s.space);
  const kit = s.kit ?? {};
  const d = s.design;
  const lines: string[] = [];
  lines.push(`THE BRAND: ${cut(s.name, 60)}. ${cut(kit.about, 240)}`);
  lines.push(`WORKSPACE OPEN: ${SPACE_NAME[space]}`);
  lines.push(`Voice: ${cut(kit.voice?.summary, 200)} Do: ${(kit.voice?.dos ?? []).slice(0, 5).map((x: string) => cut(x, 90)).join(" | ")} Don't: ${(kit.voice?.donts ?? []).slice(0, 5).map((x: string) => cut(x, 90)).join(" | ")}`);
  if (space !== "idea") lines.push(`Palette (ids): ${(kit.palette ?? []).map((p: any) => `${p.id} ${p.hex}${p.name ? ` ${cut(p.name, 24)}` : ""} (${cut(p.role, 30)}${p.share ? `, ${p.share}% of a page` : ""})`).join("; ")}`);
  lines.push(`Logos (ids): ${(kit.logos ?? []).map((l: any) => `${l.id} (${l.kind}, ${l.tone}, for ${cut(l.ground, 40)})`).join("; ")}`);
  if (space === "kit") {
    lines.push(`Type roles: ${Object.entries(kit.type ?? {}).map(([k, v]: any) => `${k}: ${v.family} ${v.weight}`).join("; ")}`);
    lines.push(`Voice words: ${(kit.voice?.words ?? []).join(", ")}`);
    lines.push(`Rules: ${(s.rules ?? []).slice(0, 14).map((x: any) => `${x.kind === "do" ? "keep" : "never"}: ${cut(x.text, 110)}`).join(" | ") || "none"}`);
    lines.push(`Colourways saved: ${(s.colourways ?? []).map((c: any) => `${cut(c.name, 30)} (${c.logo} on ${c.ground})`).join("; ") || "none"}`);
    lines.push(`Pairs that do not read (contrast below 4.5): ${(s.lowContrast ?? []).map((c: any) => `${c.a} on ${c.b} ${c.ratio}`).join("; ") || "none"}`);
    lines.push(`Products: ${(s.products ?? []).map((x: any) => `${cut(x.name, 40)}${x.features?.length ? ` (${x.features.slice(0, 4).join(", ")})` : ""}`).join("; ") || "none"}`);
  }
  if (space === "idea") {
    const br = s.brief ?? {};
    lines.push("");
    lines.push(`THE BRIEF: pitch "${cut(br.pitch, 260)}" · goals ${(br.goals ?? []).map((g: string) => `"${cut(g, 40)}"`).join(", ") || "none"}`);
    lines.push(`goal: ${cut(br.goal, 200)} · audience: ${cut(br.audience, 140)} · message: ${cut(br.message, 200)} · tone: ${cut(br.tone, 140)} · deliverables: ${cut(br.deliverables, 160)} · constraints: ${cut(br.constraints, 160)} · channels: ${cut(br.channels, 100)}`);
    lines.push(`DIRECTIONS (ids): ${(s.directions ?? []).map((x: any) => `${x.id} "${cut(x.name, 40)}"${x.picked ? " (picked)" : ""}: ${cut(x.note, 100)}`).join("; ") || "none"}`);
    lines.push(`THE MOODBOARD: ${(s.refs ?? []).slice(0, 14).map((x: any) => `${cut(x.title, 40)} (${x.kind})`).join("; ") || "empty"}`);
    lines.push(`THE STORY, latest last: ${(s.story ?? []).slice(-10).map((x: any) => `${cut(x.title, 60)} (${x.kind})`).join("; ") || "nothing yet"}`);
  }
  if (space === "content") {
    if (s.brief?.pitch || s.brief?.goal) lines.push(`Brief: ${cut(s.brief.pitch || s.brief.goal, 260)} Audience: ${cut(s.brief.audience, 140)}`);
    lines.push("");
    if (d) {
      lines.push(`THE DESIGN OPEN: id ${d.id} "${cut(d.name, 60)}", purpose ${d.purpose}, status ${d.status}${d.day ? `, planned ${d.day}` : ""}${d.variantKind ? `, a ${d.variantKind} variation` : ""}. Intent: ${cut(d.intent, 120)}`);
      lines.push(`Open format: ${d.openFormat} (primary ${d.format}; own layouts: ${(d.ownFormats ?? []).join(", ")}). Ground: ${d.bg?.color ?? "?"}${d.bg?.src ? ` with a picture (dim ${r(d.bg.dim?.alpha ?? 0, 2)})` : ""}.`);
      lines.push("Layers, bottom to top (id · type · role · place in the open format · look):");
      for (const l of d.layers ?? []) {
        const place = `x${r(l.x)} y${r(l.y)} w${r(l.w)}${l.h ? ` h${r(l.h)}` : ""}`;
        const look = l.type === "text" ? `size ${r(l.size)}, ${l.fontRole}, ${l.colorRole}${l.accent ? `/${l.accent}` : ""}, ${l.align}${l.hidden ? ", hidden" : ""} · "${cut(l.text, 110)}"`
          : l.type === "logo" ? `${l.logo}`
          : l.type === "shape" ? `${l.shape} ${l.colorRole}`
          : `${cut(l.src, 60)}, ${l.fit ?? "cover"}`;
        lines.push(`- ${l.id} · ${l.type} · ${l.role ?? "-"} · ${place} · ${look}`);
      }
      if (d.guard?.length) lines.push(`Brand guard says: ${d.guard.slice(0, 6).map((g: any) => g.text).join("; ")}`);
    } else lines.push("No design is open.");
    lines.push("");
    lines.push(`OTHER DESIGNS: ${(s.designs ?? []).slice(0, 30).map((x: any) => `${x.id} "${cut(x.name, 40)}" (${x.purpose}, ${x.format}, ${x.status}${x.day ? `, ${x.day}` : ""}${x.variant ? `, ${x.variant}` : ""})`).join("; ") || "none"}`);
    lines.push(`MOTION PIECES: ${(s.motion ?? []).map((m: any) => `${m.id} on ${m.design} (${m.duration} s, ${m.format})`).join("; ") || "none"}`);
    lines.push(`ASSETS (ids): ${(s.assets ?? []).slice(0, 40).map((a: any) => `${a.id} "${cut(a.name, 36)}" (${a.kind}, ${a.width}x${a.height})`).join("; ") || "none"}`);
  }
  const preset = typeof s.preset === "string" ? PRESETS[space][s.preset] : "";
  if (preset) lines.push("", preset);
  lines.push("");
  lines.push("THE CONVERSATION");
  for (const t of turns.slice(-8)) lines.push(`${t.role === "user" ? "User" : "Brioche"}: ${cut(t.text, 600)}`);
  return lines.join("\n");
}

const LAYER_PROPS = new Set(["x", "y", "w", "h", "size", "align", "valign", "colorRole", "accent", "fontRole", "lineHeight", "tracking", "opacity", "hidden", "caps", "logo", "rot", "fit", "text", "src", "role", "shape", "radius", "name"]);
const finite = (v: unknown) => typeof v === "number" && Number.isFinite(v);
// a writer that answers the JSON as text sometimes escapes a line break twice: it is meant as a break
const breaks = (s: string) => s.replace(/\\n/g, "\n");
const STRINGS: Record<string, number> = { layer: 120, design: 120, text: 600, type: 20, layout: 20, format: 8, kind: 20, name: 120, note: 160, color: 40, asset: 60, prompt: 600, model: 10, use: 12, status: 12, id: 60, role: 40, ground: 40, logo: 60, summary: 300, family: 40, day: 3, purpose: 12, title: 140, space: 8 };
const LISTS = ["words", "dos", "donts", "goals"];
const BRIEF_FIELDS = ["pitch", "goal", "audience", "message", "tone", "deliverables", "constraints", "channels"];

function cleanAction(a: any, space: Space, nested = false): any | null {
  if (!a || typeof a !== "object" || !OPS[space].includes(a.op)) return null;
  if (nested && !NESTED.has(a.op)) return null;
  const out: any = { op: a.op };
  for (const [k, n] of Object.entries(STRINGS)) if (typeof a[k] === "string") out[k] = (k === "text" ? breaks(a[k]) : a[k]).slice(0, n);
  for (const k of LISTS) if (Array.isArray(a[k])) out[k] = a[k].filter((x: unknown) => typeof x === "string").map((x: string) => x.slice(0, 140)).slice(0, 8);
  if (typeof a.hex === "string" && /^#[0-9a-f]{6}$/i.test(a.hex.trim())) out.hex = a.hex.trim().toUpperCase();
  if (finite(a.weight)) out.weight = Math.min(900, Math.max(300, Math.round(a.weight / 100) * 100));
  if (finite(a.dim)) out.dim = Math.min(0.9, Math.max(0, a.dim));
  if (a.fields && typeof a.fields === "object") {
    out.fields = {};
    for (const k of BRIEF_FIELDS) if (typeof a.fields[k] === "string") out.fields[k] = a.fields[k].slice(0, 600);
  }
  if (a.props && typeof a.props === "object") {
    out.props = {};
    for (const [k, v] of Object.entries(a.props)) if (LAYER_PROPS.has(k) && (typeof v === "string" || typeof v === "boolean" || finite(v))) out.props[k] = typeof v === "string" ? (k === "text" ? breaks(v) : v).slice(0, 600) : v;
  }
  if (a.op === "make_variation") out.actions = (Array.isArray(a.actions) ? a.actions : []).map((x: any) => cleanAction(x, space, true)).filter(Boolean).slice(0, 12);
  return out;
}

/** Brioche's answer, read whole and checked: only the actions of the workspace it was asked in, with their fields kept to what is allowed. */
export function readMacaronAnswer(reply: string, space: Space = "content") {
  const from = reply.indexOf("{");
  const to = reply.lastIndexOf("}");
  let raw: any;
  try {
    raw = JSON.parse(reply.slice(from, to + 1));
  } catch {
    return { reply: reply.replace(/[{}"]/g, "").trim().slice(0, 400) || "I didn't catch that. Say it again?", actions: [] };
  }
  return { reply: String(raw.reply ?? "").slice(0, 500), actions: (Array.isArray(raw.actions) ? raw.actions : []).map((a: any) => cleanAction(a, space)).filter(Boolean).slice(0, 16) };
}

/** One line of the picture ledger: when, the job that made the picture, the model, the size of the ask, and what Router charged. */
export const ledgerLine = (v: { job: string; model: string; aspect: string; refs: number; credits: number | null; prompt: string }) =>
  `${JSON.stringify({ at: new Date().toISOString(), job: v.job, model: v.model, aspect: v.aspect, refs: v.refs, credits: v.credits, prompt: v.prompt.slice(0, 120) })}\n`;

// ------------------------------------------------------------------ the flagship, kept up to date

/**
 * A flagship that an earlier version put in gains what the newer one has, once: the brief's idea, the directions, the
 * moodboard, the story's chapters, the week's plan, the product's scene. Only what is empty or missing is filled (a picture,
 * a chapter or a day by its id); what a person has written, changed or taken out is never touched. Answers the new body, or
 * null when there is nothing to do (it is up to date, or the seed carries no revision).
 */
export function topUpBrand(body: any, seed: any) {
  const rev = Number(seed?.seedRev) || 0;
  if (!rev || (Number(body?.seedRev) || 0) >= rev) return null;
  const out = structuredClone(body ?? {});
  const empty = (v: unknown) => v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length);
  out.brief = { ...(out.brief ?? {}) };
  for (const k of ["pitch", "goals", "image"]) if (empty(out.brief[k]) && !empty(seed.brief?.[k])) out.brief[k] = seed.brief[k];
  if (empty(out.directions)) out.directions = structuredClone(seed.directions ?? []);
  const refs: any[] = out.refs ?? [];
  const had = new Set(refs.map((r) => r.id));
  out.refs = [...(seed.refs ?? []).filter((r: any) => r.kind === "inspiration" && !had.has(r.id)), ...refs];
  const history: any[] = (out.history ??= []);
  for (const h of seed.history ?? []) {
    const mine = history.find((x) => x.id === h.id);
    if (!mine && h.beat) history.push(h);
    else if (mine && h.beat && !mine.beat) mine.beat = h.beat;
  }
  const planned = (out.designs ?? []).some((d: any) => d.plan);
  for (const d of seed.designs ?? []) {
    const mine = (out.designs ?? []).find((x: any) => x.id === d.id);
    if (mine && d.plan && !planned && !mine.plan) mine.plan = d.plan;
  }
  for (const p of seed.products ?? []) {
    const mine = (out.products ?? []).find((x: any) => x.id === p.id);
    if (mine && p.scene && !mine.scene) mine.scene = p.scene;
  }
  out.kit = { ...(out.kit ?? {}) };
  if (empty(out.kit.sizes) && seed.kit?.sizes) out.kit.sizes = seed.kit.sizes;
  // the white files sit on plum first, as the kit's tiles name them
  for (const l of out.kit.logos ?? []) if (/^(wordmark|mark)-white$/.test(l.id) && l.ground === "ink, plum") l.ground = "plum, ink";
  out.seedRev = rev;
  return out;
}

// ------------------------------------------------------------------ the files a design leaves as

export const exportsDir = (data: string) => join(data, "macaron", "exports");
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "design";

/** An exported picture or video, kept under the data folder with a name that says what it is. */
export async function keepExport(data: string, bytes: Buffer, name: string, ext: "png" | "jpg" | "mp4" | "webm") {
  await mkdir(exportsDir(data), { recursive: true });
  const file = `${slug(name)}-${createHash("sha256").update(bytes).digest("hex").slice(0, 8)}.${ext}`;
  await writeFile(join(exportsDir(data), file), bytes);
  return { file, url: `/media/macaron/exports/${file}`, bytes: bytes.length };
}

const framesDir = (data: string, job: string) => join(data, "macaron", "frames", job);
export const frameJob = () => randomBytes(5).toString("hex");
export const validJob = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{6,20}$/.test(v);

/** One frame of a motion render, as a PNG, kept until the video is encoded. */
export async function keepFrame(data: string, job: string, n: number, bytes: Buffer) {
  const dir = framesDir(data, job);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${String(n).padStart(5, "0")}.png`), bytes);
}
export const dropFrames = (data: string, job: string) => rm(framesDir(data, job), { recursive: true, force: true });

/**
 * A soft sound for a motion piece, made from sines: a short wooden pop where each lid lands, and a
 * quiet pad under the whole (two fifths, breathing slowly). As an aevalsrc expression of time.
 */
function soundExpr(pops: number[], pad: boolean) {
  const pop = (at: number) => `gt(t,${at})*(0.34*sin(2*PI*196*(t-${at}))*exp(-(t-${at})*34)+0.13*sin(2*PI*784*(t-${at}))*exp(-(t-${at})*52)+0.06*sin(2*PI*1568*(t-${at}))*exp(-(t-${at})*90))`;
  const drone = "(0.035*sin(2*PI*130.81*t)+0.028*sin(2*PI*196*t)+0.02*sin(2*PI*261.63*t))*(0.75+0.25*sin(2*PI*0.35*t))";
  return [...pops.slice(0, 4).map(pop), ...(pad ? [drone] : [])].join("+") || "0";
}

const refuse = (message: string, status = 400) => Object.assign(new Error(message), { status });

/** The size a PNG says it has, read from its first bytes; null when it is not a PNG. */
async function pngSize(path: string) {
  const file = await open(path, "r");
  try {
    const { buffer, bytesRead } = await file.read(Buffer.alloc(24), 0, 24, 0);
    const ok = bytesRead === 24 && buffer.readUInt32BE(0) === 0x89504e47 && buffer.readUInt32BE(4) === 0x0d0a1a0a && buffer.toString("ascii", 12, 16) === "IHDR";
    return ok ? { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) } : null;
  } finally {
    await file.close();
  }
}

/**
 * The frames of a job, all of them: numbered from 0 with none missing (ffmpeg reads them in order and stops at the
 * first gap, calling the rest done), each a picture, all the same size. Answers how many there are.
 */
async function wholeFrames(dir: string) {
  const names = (await readdir(dir).catch(() => [] as string[])).filter((f) => /^\d{5}\.png$/.test(f)).sort();
  if (names.length < 8) throw refuse("A video needs at least 8 frames.");
  let first: { width: number; height: number } | null = null;
  for (let i = 0; i < names.length; i++) {
    const want = `${String(i).padStart(5, "0")}.png`;
    if (names[i] !== want) throw refuse(`Frame ${i} is missing: a video needs every frame, in order.`);
    const size = await pngSize(join(dir, want));
    if (!size) throw refuse(`Frame ${i} is not a picture.`);
    first ??= size;
    if (size.width !== first.width || size.height !== first.height) throw refuse(`Frame ${i} is another size (${size.width}×${size.height}; the first is ${first.width}×${first.height}).`);
  }
  return names.length;
}

/**
 * Frames sent one by one, encoded as one H.264 video at the size they are, with a soft sound under it when asked.
 * What comes out is probed before it is reported: the frames and seconds it holds, and its sound, are the ones asked for.
 */
export async function encodeFrames(data: string, job: string, v: { fps: number; name: string; sound?: { pops?: number[]; pad?: boolean }; container?: "mp4" | "webm" }) {
  const dir = framesDir(data, job);
  try {
    const frames = await wholeFrames(dir);
    const webm = v.container === "webm";
    const out = join(dir, webm ? "video.webm" : "video.mp4");
    const seconds = frames / v.fps;
    const sound = v.sound && (v.sound.pops?.length || v.sound.pad);
    const args = ["-v", "error", "-y", "-framerate", String(v.fps), "-start_number", "0", "-i", join(dir, "%05d.png")];
    if (sound) args.push("-f", "lavfi", "-i", `aevalsrc='${soundExpr((v.sound!.pops ?? []).filter(Number.isFinite), !!v.sound!.pad)}':d=${seconds.toFixed(3)}:s=48000:c=stereo`);
    args.push("-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p");
    if (webm) args.push("-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "31", "-row-mt", "1", "-deadline", "good", "-cpu-used", "3");
    else args.push("-c:v", "libx264", "-crf", "17", "-preset", "slow", "-movflags", "+faststart");
    if (sound) args.push("-af", `afade=t=in:st=0:d=0.4,afade=t=out:st=${Math.max(0, seconds - 0.8).toFixed(3)}:d=0.8,alimiter=limit=0.8`, ...(webm ? ["-c:a", "libopus", "-b:a", "128k"] : ["-c:a", "aac", "-b:a", "160k"]));
    args.push("-t", seconds.toFixed(3), out);
    await exec("ffmpeg", args, { maxBuffer: 1 << 20 });
    const probed = JSON.parse((await exec("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,width,height,nb_frames,duration:format=duration", "-of", "json", out])).stdout);
    const video = (probed.streams ?? []).find((s: any) => s.codec_type === "video");
    const audio = (probed.streams ?? []).find((s: any) => s.codec_type === "audio");
    // the container says how many frames it holds; a build that does not is asked to count them
    let got = Number(video?.nb_frames);
    if (video && !Number.isFinite(got)) got = Number(JSON.parse((await exec("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "json", out])).stdout).streams?.[0]?.nb_read_frames);
    const length = Number(video?.duration) || Number(probed.format?.duration);
    if (!video || got !== frames || !(Math.abs(length - seconds) < 0.06) || (sound && !audio)) {
      throw refuse(`The video came out with ${Number.isFinite(got) ? got : "no"} frames in ${Number.isFinite(length) ? length.toFixed(2) : "no"} s, not the ${frames} in ${seconds.toFixed(2)} s that were sent${sound && !audio ? ", and without its sound" : ""}.`, 500);
    }
    const kept = await keepExport(data, await readFile(out), v.name, webm ? "webm" : "mp4");
    return { ...kept, width: Number(video.width), height: Number(video.height), duration: Math.round(length * 100) / 100, frames: got, sound: !!audio };
  } finally {
    // the frames of a job are for one video: made or refused, they are not kept
    await dropFrames(data, job);
  }
}

/** The pictures of an old job are cleared at start, so a render that was cut off leaves nothing behind. */
export async function sweepFrames(data: string) {
  const root = join(data, "macaron", "frames");
  for (const job of await readdir(root).catch(() => [] as string[])) {
    const at = await stat(join(root, job)).catch(() => null);
    if (at && Date.now() - at.mtimeMs > 3_600_000) await rm(join(root, job), { recursive: true, force: true });
  }
}
