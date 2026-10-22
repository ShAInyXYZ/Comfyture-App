// Brioche in the Brand kit, the page's side: what she is told of it (summary) and how each of her actions is made (RUN). The
// actions themselves, their fields and their lines in her brief are in space-kit.js; a check at load fails when the two differ.
import { contrast } from "../design.js";
import { macaron, kitNow, setColour, addColour, setColourField, setKit, setWords, setType, addRule, setRule, uid } from "../macaron.js";

/** What she is told of the kit, on top of what every workspace is told of the brand. */
export function summary() {
  const kit = kitNow();
  const body = macaron.brand.body;
  const pairs = kit.palette.flatMap((a, i) => kit.palette.slice(i + 1).map((c) => ({ a: a.id, b: c.id, ratio: Math.round(contrast(a.hex, c.hex) * 10) / 10 }))).filter((x) => x.ratio < 4.5);
  return { rules: body.kit.rules.map(({ id, kind, text }) => ({ id, kind, text })), colourways: (body.kit.colourways ?? []).map(({ name, ground, logo }) => ({ name, ground, logo })), patterns: (body.kit.patterns ?? []).map((x) => x.name), lowContrast: pairs };
}

/** One action of the kit, made: answers what to tell the user, or null when it is not made. */
export const RUN = {
  set_colour(a) {
    const i = kitNow().palette.findIndex((p) => p.id === a.id);
    if (i < 0) return null;
    const did = [];
    if (a.hex) (setColour(i, a.hex), did.push("colour"));
    const patch = {};
    if (a.name) patch.name = String(a.name).slice(0, 24);
    if (a.role) patch.role = String(a.role).slice(0, 30);
    if (Object.keys(patch).length) (setColourField(i, patch), did.push(Object.keys(patch).join(" and ")));
    return did.length ? `${macaron.brand.body.kit.palette[i].name}: ${did.join(", ")}` : null;
  },
  add_colour(a) {
    if (!/^#[0-9a-f]{6}$/i.test(a.hex ?? "") || kitNow().palette.length >= 8) return null;
    addColour();
    const i = macaron.brand.body.kit.palette.length - 1;
    setColour(i, a.hex);
    setColourField(i, { name: String(a.name ?? "New colour").slice(0, 24), role: String(a.role ?? "").slice(0, 30) });
    return `Colour: ${a.name ?? a.hex}`;
  },
  add_colourway(a) {
    const kit = kitNow();
    const g = kit.palette.find((p) => p.id === a.ground);
    const l = kit.logos.find((x) => x.id === a.logo);
    if (!g || !l) return null;
    setKit("colourways", [...(macaron.brand.body.kit.colourways ?? []), { id: uid("cw"), name: String(a.name || `${l.name} on ${g.name}`).slice(0, 40), ground: g.id, logo: l.id }]);
    return `Colourway: ${a.name || l.name}`;
  },
  add_pattern(a) {
    const kit = kitNow();
    const ground = kit.palette.find((p) => p.id === a.ground)?.id ?? kit.palette[0]?.id;
    if (!ground || !a.svg) return null;
    const marks = (a.marks ?? []).filter((m) => kit.logos.some((l) => l.id === m.logo && l.kind !== "icon"));
    const name = String(a.name || "New pattern").slice(0, 40);
    setKit("patterns", [{ id: uid("pt"), name, ground, w: a.w, h: a.h, svg: a.svg, marks, at: new Date().toISOString() }, ...(macaron.brand.body.kit.patterns ?? [])].slice(0, 24));
    return `Pattern: ${name}`;
  },
  set_voice(a) {
    const v = macaron.brand.body.kit.voice;
    let did = false;
    if (typeof a.summary === "string" && a.summary.trim()) (setKit("voice.summary", a.summary.trim().slice(0, 300)), (did = true));
    if (Array.isArray(a.words) && a.words.length) (setWords("voice", a.words.map(String).slice(0, 6)), (did = true));
    // example pairs (say / never say): what the window and the brand book show; dos and donts of the same length make pairs too
    let pairs = (Array.isArray(a.lines) ? a.lines : []).filter((x) => x && String(x.say ?? "").trim()).map((x) => ({ say: String(x.say).slice(0, 120), not: String(x.not ?? "").slice(0, 120) })).slice(0, 8);
    if (!pairs.length && Array.isArray(a.dos) && Array.isArray(a.donts) && a.dos.length && a.dos.length === a.donts.length) pairs = a.dos.map((x, i) => ({ say: String(x).slice(0, 120), not: String(a.donts[i]).slice(0, 120) })).slice(0, 8);
    if (pairs.length) (setKit("voice.lines", [...(v?.lines ?? []).filter((x) => x.say), ...pairs].slice(0, 8)), (did = true));
    if (Array.isArray(a.dos) && a.dos.length) (setKit("voice.dos", a.dos.map(String).slice(0, 8)), (macaron.brand.body.dos = String(a.dos[0])), (did = true));
    if (Array.isArray(a.donts) && a.donts.length) (setKit("voice.donts", a.donts.map(String).slice(0, 8)), (macaron.brand.body.donts = String(a.donts[0])), (did = true));
    return did && v ? "Voice" : null;
  },
  add_rule(a) {
    if (!a.text || !["do", "dont"].includes(a.kind)) return null;
    addRule(a.kind);
    const rules = macaron.brand.body.kit.rules;
    setRule(rules.at(-1).id, { text: String(a.text).slice(0, 200) });
    return a.kind === "do" ? "A rule to keep" : "A rule never to break";
  },
  set_type(a) {
    if (!["display", "text", "mono"].includes(a.type)) return null;
    const patch = {};
    if (a.family) patch.family = String(a.family).slice(0, 40);
    if (typeof a.weight === "number") patch.weight = a.weight;
    if (!Object.keys(patch).length) return null;
    setType(a.type, patch);
    return `Type: ${a.type}`;
  },
};
