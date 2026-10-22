// Brioche in Design idea, the page's side: what she is told of it (summary) and how each of her actions is made (RUN). The
// actions themselves, their fields and their lines in her brief are in space-idea.js; a check at load fails when the two differ.
import { macaron, kitNow, setBrief, addDirection, pickDirection, addNote } from "../macaron.js";

const BRIEF_KEYS = ["pitch", "goal", "audience", "message", "tone", "deliverables", "constraints", "channels"];

/** What she is told of the idea, on top of what every workspace is told of the brand. */
export function summary() {
  const body = macaron.brand.body;
  return { brief: body.brief, directions: (body.directions ?? []).map(({ id, name, note, picked }) => ({ id, name, note, picked })), refs: body.refs.map(({ id, title, kind, note }) => ({ id, title, kind, note })), story: body.history.filter((x) => x.kind !== "export").map(({ title, kind, note }) => ({ title, kind, note })) };
}

/** One action of Design idea, made: answers what to tell the user, or null when it is not made. */
export const RUN = {
  write_brief(a) {
    const patch = {};
    for (const [k, v] of Object.entries(a.fields ?? {})) if (BRIEF_KEYS.includes(k) && typeof v === "string" && v.trim()) patch[k] = v.trim();
    const goals = (Array.isArray(a.goals) ? a.goals : []).map((g) => String(g).trim().slice(0, 32)).filter(Boolean).slice(0, 3);
    if (goals.length) patch.goals = goals;
    if (!Object.keys(patch).length) return null;
    setBrief(patch);
    return `Brief: ${Object.keys(patch).join(", ")}`;
  },
  add_direction(a) {
    if (!a.name) return null;
    const logo = kitNow().logos.some((l) => l.id === a.logo) ? a.logo : undefined;
    addDirection({ name: a.name, note: a.note ?? "", logo });
    return `Direction: ${a.name}`;
  },
  pick_direction(a) {
    if (!(macaron.brand.body.directions ?? []).some((x) => x.id === a.id)) return null;
    pickDirection(a.id);
    return "Direction picked";
  },
  add_note(a) {
    if (!a.title) return null;
    addNote(String(a.title).slice(0, 140), String(a.note ?? "").slice(0, 200));
    return "A note in the story";
  },
};
