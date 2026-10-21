// Brioche in the Studio: the workspace where a brand's raw material is made. The photography (shoots of the product in a studio
// setup), the UGC stories (a creator, a hook and a script told in five vertical shots), the motion graphics (a logo sting, a
// lower third, an end card, a title card, a counter, a subscribe nudge) and the product itself. What Brioche is told here, the
// actions she may take and how her fields are kept are this module's; server/macaron.ts reads it like the other workspaces.
// She proposes and the page asks: an action here opens a window ready to go, or writes a draft; nothing that costs credits
// starts from her answer. The ids (lights, surfaces, personas, beats, graphic kinds) are the page's own, read from the same
// plain modules the page uses, so the two can never drift apart.
import { LIGHTS, SURFACES } from "../web/js/macaron-studio-setup.js";
import { PERSONAS, BEAT_IDS, CAMERAS, SETTINGS, cleanStory } from "../web/js/macaron-ugc-data.js";
import { GRAPHIC_IDS, EASINGS, cleanFields } from "../web/js/macaron-graphics-data.js";

/** The ops of this workspace (open_space is the one every workspace has). */
export const OPS: readonly string[] = ["open_space", "propose_shoot", "set_studio", "write_ugc", "add_motion_graphic"];

const str = (description?: string) => ({ type: "string", ...(description ? { description } : {}) });
/** The fields those ops carry, as the tool's schema describes them. */
export const PROPS: Record<string, unknown> = {
  template: str("For propose_shoot: a shoot template's id, from the list below."),
  light: { type: "string", enum: LIGHTS.map((l) => l.id), description: "The studio light." },
  surface: { type: "string", enum: SURFACES.map((s) => s.id), description: "The surface the product stands on." },
  background: str("A palette id from the kit, for a background in that colour; empty for the template's own."),
  persona: { type: "string", enum: PERSONAS.map((p) => p.id), description: "For write_ugc: who tells the story." },
  hook: str("For write_ugc: the opening line, said in the first two seconds."),
  beats: {
    type: "array",
    description: "For write_ugc: the story's beats, in order, each with the line said in it.",
    items: {
      type: "object",
      properties: {
        kind: { type: "string", enum: BEAT_IDS },
        line: str("What is said, in the creator's own words, short."),
        camera: { type: "string", enum: CAMERAS.map((c) => c.id) },
        setting: { type: "string", enum: SETTINGS.map((c) => c.id) },
        seconds: { type: "number", description: "2 to 10." },
      },
      required: ["kind", "line"],
    },
  },
  fresh: { type: "boolean", description: "For write_ugc: true to write a new story, false (or left out) to change the one that is open." },
  kind: { type: "string", enum: GRAPHIC_IDS, description: "For add_motion_graphic: which graphic." },
  copy: { type: "object", description: "For add_motion_graphic: its words, by field (line, name, role, url, title, sub, number, label, cta), short and in the brand's voice." },
  seconds: { type: "number", description: "For add_motion_graphic: how long it lasts, 2 to 12." },
  ease: { type: "string", enum: EASINGS.map(([e]) => e), description: "For add_motion_graphic: how things settle." },
};

export const DESCRIPTION = "Answer the user: one short, warm sentence, and the actions to take in the Studio (none when they only ask a question).";

export const BRIEF = `THE OPEN WORKSPACE: Studio. It is where the brand's raw material is made, in four crafts, and what is made here is kept as pictures and clips that Create then uses.
1. Photography: shoots of the product. A shoot is a shot template (the product in a set: ice-cube hover, linen lid lift, golden dew, a white packshot...) taken in a studio setup: the light (softbox, window, hard flash), the surface (linen, marble, wood, plum paper) and a background in one of the palette's colours. The setup is kept with the brand, so a shoot can be done again the same way.
2. UGC stories: a creator (Maya, warm and real; Leo, casual and fun; Emma, mum life) tells the product in five vertical shots: hook, show, taste, react, call to action. Each beat has a spoken line, a camera and a setting.
3. Motion graphics: a logo sting, a lower third, an end card, a title card, a counter, a subscribe nudge, built from the kit.
4. The product: its photo, cut-out and what makes it good.

Actions (op and its fields):
- propose_shoot {template, light, surface, background}: opens the New shoot window with that template and setup picked. Spends nothing: the person looks, changes what they like and presses Shoot it, which shows the price. Choose the template from the list below by its id.
- set_studio {light, surface, background}: changes the studio setup only (any of the three).
- write_ugc {persona, hook, beats[{kind, line, camera, setting, seconds}], fresh}: writes the UGC story (changes the open one, or a new one when fresh is true) and opens it. Writes lines only: the pictures and takes are made by the person with Make the story, which shows the price.
- add_motion_graphic {kind, copy, seconds, ease}: opens that graphic with its words written. It is made, and any credit or file is spent, only when the person presses Make it.
- open_space {space}.

Writing a UGC script: the hook is the first two seconds, so open on the product in hand and one real line ("Okay, I finally tried it..."), never a slogan. One idea in each beat. The lines are spoken, so short and natural, in the creator's mouth and the brand's voice, 6 to 14 words. Never claim what the product cannot do, never invent a price, a discount or a result; use only what the product's features say. End on one clear thing to do. Keep the five beats in order unless asked for fewer.
Writing a shoot: say in one line why this template and this setup suit the product and the brand; a background colour is a palette id, never a hex; do not propose a template that needs a video unless the person asks for video.
Rules: only the ids shown below; if what is asked belongs to Design idea, the Brand kit, Create or the Brand book, say so and offer to open it.`;

/** Extra string fields (name: max length) and list fields this workspace's actions may carry. */
export const STRINGS: Record<string, number> = { template: 40, light: 12, surface: 12, background: 40, persona: 12, hook: 120, ease: 12 };
export const LISTS: string[] = [];

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** What Brioche is told of the Studio each time, one line per thing, from the page's summary of it (the kit comes with every workspace). */
export function promptLines(s: Record<string, any>, cut: (v: unknown, n: number) => string): string[] {
  const lines: string[] = [];
  const p = (s.products ?? [])[0];
  lines.push(p ? `THE PRODUCT: ${cut(p.name, 50)}${p.features?.length ? ` (${p.features.slice(0, 5).map((f: string) => cut(f, 50)).join("; ")})` : " (no features written yet)"} · ${p.cutout ? "has a cut-out" : "no cut-out yet"}${(s.products ?? []).length > 1 ? ` · ${(s.products ?? []).length - 1} more ${(s.products ?? []).length === 2 ? "product" : "products"}` : ""}` : "THE PRODUCT: none yet, so there is nothing to shoot.");
  const st = s.studio ?? {};
  lines.push(`THE STUDIO SETUP: light ${cut(st.light, 12) || "softbox"}, surface ${cut(st.surface, 12) || "linen"}, background ${cut(st.background, 30) || "the template's own"}`);
  lines.push(`SHOT TEMPLATES (ids): ${(s.templates ?? []).slice(0, 24).map((t: any) => `${cut(t.id, 30)} "${cut(t.name, 30)}" (${cut(t.category, 14)}, ${t.media === "video" ? "video" : "image"})`).join("; ") || "none"}`);
  lines.push(`SHOOTS MADE: ${(s.shoots ?? []).slice(0, 8).map((x: any) => `${cut(x.template, 30)} ${cut(x.format, 6)}`).join("; ") || "none yet"}`);
  const ugc = (s.ugc ?? []).slice(0, 4);
  if (ugc.length) {
    lines.push("UGC STORIES (the first is open):");
    for (const u of ugc) lines.push(`- ${cut(u.persona, 12)}: hook "${cut(u.hook, 120)}" · ${(u.beats ?? []).map((b: any) => `${cut(b.kind, 6)} "${cut(b.line, 80)}"${b.made ? " (made)" : ""}`).join(" · ")}`);
  } else lines.push("UGC STORIES: none yet.");
  const g = (s.graphics ?? []).slice(0, 8);
  lines.push(`MOTION GRAPHICS MADE: ${g.map((x: any) => `${cut(x.kind, 10)} ${num(x.seconds) ?? ""} s ${Object.values(x.fields ?? {}).map((v) => `"${cut(v, 40)}"`).join(", ")}`).join("; ") || "none yet"}`);
  return lines;
}

/** Keeps the fields of one action of this workspace to what is allowed (macaron.ts keeps the shared ones). */
export function clean(a: Record<string, any>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (typeof a.light === "string" && !LIGHTS.some((l) => l.id === a.light)) out.light = undefined;
  if (typeof a.surface === "string" && !SURFACES.some((x) => x.id === a.surface)) out.surface = undefined;
  if (a.op === "write_ugc") {
    const story = cleanStory(a);
    if (PERSONAS.some((x) => x.id === a.persona)) out.persona = story.persona;
    else out.persona = undefined;
    out.hook = story.hook;
    out.beats = story.beats;
    out.fresh = a.fresh === true;
  } else {
    out.beats = undefined;
    out.persona = undefined;
    out.hook = undefined;
  }
  if (a.op === "add_motion_graphic") {
    if (GRAPHIC_IDS.includes(a.kind)) {
      out.kind = a.kind;
      out.copy = cleanFields(a.kind, a.copy);
    } else {
      out.kind = undefined;
      out.copy = undefined;
    }
    const secs = num(a.seconds);
    out.seconds = secs === null ? undefined : Math.min(12, Math.max(2, Math.round(secs)));
    if (!EASINGS.some(([e]) => e === a.ease)) out.ease = undefined;
  } else {
    out.copy = undefined;
    out.seconds = undefined;
  }
  // (a key left undefined takes out what the shared reader copied before: it is gone from the answer once it is sent as JSON)
  return out;
}
