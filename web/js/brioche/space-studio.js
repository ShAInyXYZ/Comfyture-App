// Brioche in the Studio: the workspace where a brand's raw material is made. The photography (shoots of the product in a studio
// setup), the UGC stories (a creator, a hook and a script told in five vertical shots), the motion graphics (a logo sting, a
// lower third, an end card, a title card, a counter, a subscribe nudge) and the product itself. What Brioche is told here, the
// actions she may take and how her fields are kept are this file's; harness.js reads it like the other workspaces.
// She proposes and the page asks: an action here opens a window ready to go, or writes a draft; nothing that costs credits
// starts from her answer. The ids (lights, surfaces, personas, beats, graphic kinds) are the page's own, read from the same
// plain modules the page uses, so the two can never drift apart. The page's side of each action is in run-studio.js.
import { LIGHTS, SURFACES } from "../macaron-studio-setup.js";
import { PERSONAS, CHARACTER_ID, BEAT_IDS, CAMERAS, SETTINGS, cleanStory } from "../macaron-ugc-data.js";
import { GRAPHIC_IDS, EASINGS, cleanFields } from "../macaron-graphics-data.js";
import { finite, str, num } from "./helpers.js";

// a number the page sent, or nothing
const numOf = (v) => (finite(v) ? v : null);

const LIGHT = { type: "string", enum: LIGHTS.map((l) => l.id), description: "The studio light." };
const SURFACE = { type: "string", enum: SURFACES.map((s) => s.id), description: "The surface the product stands on." };
const BACKGROUND = str(40, "A palette id from the kit, for a background in that colour; empty for the template's own.");

export default {
  id: "studio",
  name: "Studio",
  holds: "the raw material: photography, UGC stories, motion graphics, the product",
  description: "Answer the user: one short, warm sentence, and the actions to take in the Studio (none when they only ask a question).",
  intro: `THE OPEN WORKSPACE: Studio. It is where the brand's raw material is made, in four crafts, and what is made here is kept as pictures and clips that Create then uses.
1. Photography: shoots of the product. A shoot is a shot template (the product in a set: ice-cube hover, linen lid lift, golden dew, a white packshot...) taken in a studio setup: the light (softbox, window, hard flash), the surface (linen, marble, wood, plum paper) and a background in one of the palette's colours. The setup is kept with the brand, so a shoot can be done again the same way.
2. UGC stories: a creator (Maya, warm and real; Leo, casual and fun; Emma, mum life) or the brand's own character (a mascot, a creature, a person the brand has pictured; the person picks its picture and says how it looks and sounds) tells the product in five vertical shots: hook, show, try, react, call to action, while doing something real all the way through (their activity: Emma making her baby's bottle, Leo walking through the city, Maya doing her makeup, or anything that fits the brand). Each beat has a spoken line, what they do in it (the next step of the activity), a camera and a setting.
3. Motion graphics: a logo sting, a lower third, an end card, a title card, a counter, a subscribe nudge, built from the kit.
4. The product: its photo, cut-out and what makes it good.`,
  rules: `Writing for the brand's own character (when the open story names one): write for IT, in its own name. Keep what it is: a creature stays a creature (it has paws, not hands; it does not hold a phone or wear clothes); keep the look the person wrote. Its lines follow how it sounds: if it talks, short natural lines; if it sings or hums, lines that can be sung, a hummed hook, a sung call to action; if it only mimes or cannot talk, give very short lines of sound or gesture ("*a happy chirp*", "*waves*") that the take can show, never a speech. You never make the character and never choose its picture: the person does, in the creator row.
Writing a UGC script: the hook is the first two seconds: one real line ("Okay, I finally tried it..."), never a slogan, said while they are already busy with their activity. Never a still talking head: the activity moves on at every beat (pouring, shaking, testing; walking, crossing, arriving; concealer, blush, lips, the finished look) and pays off in the last beat, so the viewer keeps watching to see it done; prefer the walk-and-talk, following, close-up, over-the-shoulder and mirror cameras to a plain selfie. Write in each beat's doing what they do, and name @product there only in the shots the product is in (on the counter, in hand, on a phone or laptop screen for an app). One idea in each beat. The lines are spoken, so short and natural, in the creator's mouth and the brand's voice, 6 to 14 words. Never claim what the product cannot do, never invent a price, a discount or a result; use only what the product's features say. End on one clear thing to do. Keep the five beats in order unless asked for fewer.
Writing a shoot: say in one line why this template and this setup suit the product and the brand; a background colour is a palette id, never a hex; do not propose a template that needs a video unless the person asks for video.
Rules: only the ids shown below; if what is asked belongs to Design idea, the Brand kit, Create or the Brand book, say so and offer to open it.`,

  /** What she is told of the Studio each time, one line per thing, from the page's summary of it (the kit comes with every workspace). */
  promptLines(s, cut) {
    // (a blank line sets the workspace's things apart from the kit's)
    const lines = [""];
    const p = (s.products ?? [])[0];
    lines.push(p ? `THE PRODUCT: ${cut(p.name, 50)}${p.features?.length ? ` (${p.features.slice(0, 5).map((f) => cut(f, 50)).join("; ")})` : " (no features written yet)"} · ${p.cutout ? "has a cut-out" : "no cut-out yet"}${(s.products ?? []).length > 1 ? ` · ${(s.products ?? []).length - 1} more ${(s.products ?? []).length === 2 ? "product" : "products"}` : ""}` : "THE PRODUCT: none yet, so there is nothing to shoot.");
    const st = s.studio ?? {};
    lines.push(`THE STUDIO SETUP: light ${cut(st.light, 12) || "softbox"}, surface ${cut(st.surface, 12) || "linen"}, background ${cut(st.background, 30) || "the template's own"}`);
    lines.push(`SHOT TEMPLATES (ids): ${(s.templates ?? []).slice(0, 24).map((t) => `${cut(t.id, 30)} "${cut(t.name, 30)}" (${cut(t.category, 14)}, ${t.media === "video" ? "video" : "image"})`).join("; ") || "none"}`);
    lines.push(`SHOOTS MADE: ${(s.shoots ?? []).slice(0, 8).map((x) => `${cut(x.template, 30)} ${cut(x.format, 6)}`).join("; ") || "none yet"}`);
    const ugc = (s.ugc ?? []).slice(0, 4);
    if (ugc.length) {
      lines.push("UGC STORIES (the first is open):");
      for (const u of ugc) lines.push(`- ${u.character ? `the brand's character ${cut(u.character.name, 30)} (${u.character.kind === "person" ? "a person" : "a creature"}${u.character.look ? `, looks: ${cut(u.character.look, 120)}` : ""}${u.character.voice ? `, sounds: ${cut(u.character.voice, 60)}` : ""}${u.character.mode ? `, so it ${u.character.mode === "sing" ? "sings or hums" : u.character.mode === "mime" ? "only mimes" : "talks"}` : ""})` : cut(u.persona, 12)}${u.activity ? `, ${cut(u.activity, 100)}` : ""}: hook "${cut(u.hook, 120)}" · ${(u.beats ?? []).map((b) => `${cut(b.kind, 6)} "${cut(b.line, 80)}"${b.doing ? ` [${cut(b.doing, 90)}]` : ""}${b.made ? " (made)" : ""}`).join(" · ")}`);
    } else lines.push("UGC STORIES: none yet.");
    if (s.graphicOpen?.kind) lines.push(`THE GRAPHIC OPEN NOW: ${cut(s.graphicOpen.kind, 10)} ${numOf(s.graphicOpen.seconds) ?? ""} s, saying ${Object.entries(s.graphicOpen.fields ?? {}).map(([k, v]) => `${cut(k, 10)} "${cut(v, 60)}"`).join(", ") || "nothing yet"}`);
    const g = (s.graphics ?? []).slice(0, 8);
    lines.push(`MOTION GRAPHICS MADE: ${g.map((x) => `${cut(x.kind, 10)} ${numOf(x.seconds) ?? ""} s ${Object.values(x.fields ?? {}).map((v) => `"${cut(v, 40)}"`).join(", ")}`).join("; ") || "none yet"}`);
    return lines;
  },

  actions: {
    propose_shoot: {
      doc: "{template, light, surface, background}: opens the New shoot window with that template and setup picked. Spends nothing: the person looks, changes what they like and presses Shoot it, which shows the price. Choose the template from the list below by its id.",
      fields: { template: str(40, "For propose_shoot: a shoot template's id, from the list below."), light: LIGHT, surface: SURFACE, background: BACKGROUND },
      example: () => ({ template: "splash", light: LIGHTS[0].id, surface: SURFACES[0].id, background: "plum" }),
    },
    set_studio: {
      doc: "{light, surface, background}: changes the studio setup only (any of the three).",
      fields: { light: LIGHT, surface: SURFACE, background: BACKGROUND },
      example: () => ({ light: LIGHTS[0].id }),
    },
    write_ugc: {
      doc: "{persona, activity, hook, beats[{kind, line, doing, camera, setting, seconds}], fresh}: writes the UGC story (changes the open one, or a new one when fresh is true) and opens it. Writes lines only: the pictures and takes are made by the person with Make the story, which shows the price.",
      fields: {
        persona: { type: "string", enum: [...PERSONAS.map((p) => p.id), CHARACTER_ID], description: "For write_ugc: who tells the story. 'character' only for a story the brand's own character already tells (the person picks its picture)." },
        activity: str(120, "For write_ugc: what the creator does through the whole story, a real task that moves on and pays off (making a bottle, walking to work, doing their makeup)."),
        hook: str(120, "For write_ugc: the opening line, said in the first two seconds."),
        beats: {
          type: "array",
          description: "For write_ugc: the story's beats, in order, each with the line said in it.",
          items: {
            type: "object",
            properties: {
              kind: { type: "string", enum: BEAT_IDS },
              line: { type: "string", description: "What is said, in the creator's own words, short." },
              doing: { type: "string", description: "What they do in this beat: the next step of the activity, caught mid-action; @product where the product is in the shot." },
              camera: { type: "string", enum: CAMERAS.map((c) => c.id) },
              setting: { type: "string", enum: SETTINGS.map((c) => c.id) },
              seconds: { type: "number", description: "2 to 10." },
            },
            required: ["kind", "line"],
          },
        },
        fresh: { type: "boolean", description: "For write_ugc: true to write a new story, false (or left out) to change the one that is open." },
      },
      clean(a, out) {
        const story = cleanStory(a);
        out.hook = story.hook;
        if (story.activity) out.activity = story.activity;
        out.beats = story.beats;
        out.fresh = a.fresh === true;
        return out;
      },
      example: () => ({ persona: PERSONAS[0].id, activity: PERSONAS[0].routine.activity, hook: "Okay, I finally tried it", beats: [{ kind: BEAT_IDS[0], line: "Okay, I finally tried it", doing: PERSONAS[0].routine.steps[BEAT_IDS[0]].doing, camera: PERSONAS[0].routine.steps[BEAT_IDS[0]].camera, seconds: 4 }], fresh: true }),
    },
    add_motion_graphic: {
      doc: "{kind, copy, seconds, ease}: opens that graphic with its words written. It is made, and any credit or file is spent, only when the person presses Make it.\n  When a graphic is open (THE GRAPHIC OPEN NOW below) and you are asked for its words, write them for THAT kind: add_motion_graphic with kind set to the open kind and copy for its own fields, nothing else. Never open another kind then, and never answer with a new graphic: the words go into the one on screen.",
      fields: {
        kind: { type: "string", enum: GRAPHIC_IDS, description: "For add_motion_graphic: which graphic." },
        copy: { type: "object", description: "For add_motion_graphic: its words, by field (line, name, role, url, title, sub, number, label, cta), short and in the brand's voice." },
        seconds: num("For add_motion_graphic: how long it lasts, 2 to 12.", 2, 12),
        ease: { type: "string", enum: EASINGS.map(([e]) => e), maxLength: 12, description: "For add_motion_graphic: how things settle." },
      },
      clean(a, out) {
        // (a graphic is its kind's: the words kept are that kind's own fields; with no kind of ours there are none)
        if (out.kind) out.copy = cleanFields(a.kind, a.copy);
        if (out.seconds !== undefined) out.seconds = Math.round(out.seconds);
        return out;
      },
      example: () => ({ kind: GRAPHIC_IDS[0], copy: {}, seconds: 4, ease: EASINGS[0][0] }),
    },
  },
};
