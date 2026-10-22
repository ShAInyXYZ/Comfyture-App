// Brioche in the Studio, the page's side: what she is told of it (summary) and how each of her actions is made (RUN). The Studio
// makes the brand's raw material: photography, UGC stories, motion graphics, the product. She proposes and the page asks: an
// action here opens a window ready to go, or writes a draft; nothing that costs credits starts from it. The actions themselves,
// their fields and their lines in her brief are in space-studio.js; a check at load fails when the two differ.
import { macaron, productNow } from "../macaron.js";
import { openWin } from "../macaron-win.js";
import { TEMPLATES } from "../macaron-templates.js";
import { setupOf, LIGHTS, SURFACES } from "../macaron-studio-setup.js";
import { openShoot, setStudio } from "../macaron-shoot.js";
import { applyUgcDraft, storiesOf, storyNow } from "../macaron-ugc.js";
import { CHARACTER_ID, whoOf } from "../macaron-ugc-data.js";
import { graphicsOf, openGraphic, gfx, defaultsOf } from "../macaron-graphics.js";
import { GRAPHIC_IDS, kindOfGraphic } from "../macaron-graphics-data.js";

/** What she is told of the Studio, on top of what every workspace is told of the brand (its kit): tight, and only what the Studio needs. */
export function summary() {
  const body = macaron.brand.body;
  const open = storyNow();
  // the story open comes first
  const stories = [...storiesOf()].sort((a, b) => (b.id === open?.id) - (a.id === open?.id));
  return {
    products: (body.products ?? []).map(({ name, features, cutout }) => ({ name, features, cutout: !!cutout })),
    studio: (() => { const s = setupOf(body); return { light: s.light, surface: s.surface, background: body.kit.palette.find((p) => p.id === s.background)?.name ?? "" }; })(),
    templates: TEMPLATES.map(({ id, name, category, media }) => ({ id, name, category, media })),
    shoots: (body.outputs ?? []).filter((o) => o.photo).slice(0, 8).map((o) => ({ template: o.template, format: o.format })),
    // (a story told by the brand's own character says who it is, how it looks and how it sounds, so her lines fit it)
    ugc: stories.slice(0, 4).map((s) => ({ persona: s.persona, ...(s.persona === CHARACTER_ID && s.character ? { character: { name: s.character.name, look: s.character.look, voice: s.character.voice, kind: s.character.kind, mode: whoOf(s).mode } } : {}), activity: s.activity ?? "", hook: s.hook, beats: s.beats.map((b) => ({ kind: b.kind, line: b.line, doing: b.doing ?? "", made: b.take?.status === "done" })) })),
    graphics: graphicsOf().slice(0, 8).map((d) => ({ kind: d.graphic.kind, seconds: d.graphic.seconds, fields: d.graphic.fields })),
    // the graphic that is open in the window now: its kind and the words it says (what is written, else what the brand would say), so she writes for it
    graphicOpen: macaron.win === "graphics" && gfx.brand === macaron.brand.id ? { kind: gfx.kind, seconds: gfx.seconds, fields: { ...defaultsOf(gfx.kind), ...gfx.fields } } : null,
  };
}

/** One action of the Studio, made: answers what to tell the user, or null when it is not made. */
export const RUN = {
  propose_shoot(a) {
    if (!productNow()) return null;
    const t = TEMPLATES.find((x) => x.id === a.template);
    openShoot({ template: t?.id, light: a.light, surface: a.surface, background: a.background });
    return t ? `Shoot proposed: ${t.name}` : "The shoot is ready to set up";
  },
  set_studio(a) {
    const patch = {};
    if (LIGHTS.some((x) => x.id === a.light)) patch.light = a.light;
    if (SURFACES.some((x) => x.id === a.surface)) patch.surface = a.surface;
    if (typeof a.background === "string" && (a.background === "" || macaron.brand.body.kit.palette.some((p) => p.id === a.background))) patch.background = a.background;
    if (!Object.keys(patch).length) return null;
    setStudio(patch);
    return `Studio set: ${Object.keys(patch).join(", ")}`;
  },
  write_ugc(a) {
    const s = applyUgcDraft({ persona: a.persona, activity: a.activity, hook: a.hook, beats: a.beats }, { fresh: a.fresh === true });
    if (!s) return null;
    openWin("ugc");
    return `UGC story written: ${s.beats.length} beats`;
  },
  add_motion_graphic(a) {
    if (!GRAPHIC_IDS.includes(a.kind)) return null;
    // (with the window open on that kind her words go into the graphic that is open: what the person has typed is kept)
    openGraphic(a.kind, { fields: a.copy, seconds: a.seconds, ease: a.ease, here: macaron.win === "graphics" });
    return `${kindOfGraphic(a.kind).name} ready to make`;
  },
};
