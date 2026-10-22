// Brioche in Design idea: the brief, the moodboard, the story and the directions. One definition per action, here (see
// space-kit.js); the page's side of each is in run-idea.js.
import { str, list } from "./helpers.js";

const BRIEF_FIELDS = ["pitch", "goal", "audience", "message", "tone", "deliverables", "constraints", "channels"];

export default {
  id: "idea",
  name: "Design idea",
  holds: "the brief, the moodboard, the story, the directions",
  // (the palette is not told in this workspace: the idea comes before the colours)
  noPalette: true,
  description: "Answer the user: one short, warm sentence, and the actions to take on the brief, the directions and the story (none when they only ask a question).",
  intro: "THE OPEN WORKSPACE: Design idea. It holds the brief (the idea in two lines, three goals that say how it should feel, and the brief's fields), a moodboard of references, the story of how the design came about, and the directions tried for the mark and the look, one of them picked.",
  rules: "Rules: write in the brand's voice and keep it short and concrete; a goal is three or four words; never repeat a direction that is already there.",

  /** What she is told of the idea each time, after what every workspace is told. */
  promptLines(s, cut) {
    const br = s.brief ?? {};
    return [
      "",
      `THE BRIEF: pitch "${cut(br.pitch, 260)}" · goals ${(br.goals ?? []).map((g) => `"${cut(g, 40)}"`).join(", ") || "none"}`,
      `goal: ${cut(br.goal, 200)} · audience: ${cut(br.audience, 140)} · message: ${cut(br.message, 200)} · tone: ${cut(br.tone, 140)} · deliverables: ${cut(br.deliverables, 160)} · constraints: ${cut(br.constraints, 160)} · channels: ${cut(br.channels, 100)}`,
      `DIRECTIONS (ids): ${(s.directions ?? []).map((x) => `${x.id} "${cut(x.name, 40)}"${x.picked ? " (picked)" : ""}: ${cut(x.note, 100)}`).join("; ") || "none"}`,
      `THE MOODBOARD: ${(s.refs ?? []).slice(0, 14).map((x) => `${cut(x.title, 40)} (${x.kind})`).join("; ") || "empty"}`,
      `THE STORY, latest last: ${(s.story ?? []).slice(-10).map((x) => `${cut(x.title, 60)} (${x.kind})`).join("; ") || "nothing yet"}`,
    ];
  },

  actions: {
    write_brief: {
      doc: "{fields, goals}: set the brief. fields may hold pitch (the idea in two short lines), goal, audience, message, tone, deliverables, constraints, channels; goals are up to three short goals that start with a verb (\"Feel welcoming\", \"Make it simple\", \"Stay playful\"). Only what you write is changed.",
      fields: {
        fields: { type: "object", description: "For write_brief: pitch, goal, audience, message, tone, deliverables, constraints, channels (short texts)." },
        goals: list("For write_brief: up to three short goals that start with a verb, such as Feel welcoming."),
      },
      clean(a, out) {
        if (a.fields && typeof a.fields === "object") {
          out.fields = {};
          for (const k of BRIEF_FIELDS) if (typeof a.fields[k] === "string") out.fields[k] = a.fields[k].slice(0, 600);
        }
        return out;
      },
      example: () => ({ fields: { pitch: "A warm home for plum jam.", tone: "Plain" }, goals: ["Feel welcoming", "Make it simple"] }),
    },
    add_direction: {
      doc: "{name, note, logo}: a new direction for the mark and the look: a name of two or three words and one line on how it feels. The picture comes later; logo is a wordmark's id from the kit.",
      fields: {
        name: str(120, "A direction's name, two or three words."),
        note: str(160, "One line: how a direction feels, or what a story note says."),
        logo: str(60, "A logo id from the kit, for the mark shown on a direction."),
      },
      example: (s) => ({ name: "Quiet craft", note: "Hand made and calm.", logo: s.kit.logos[0].id }),
    },
    pick_direction: {
      doc: "{id}: the direction the work goes with.",
      fields: { id: str(60, "A direction's id, from the list below.") },
      example: (s) => ({ id: s.directions[0].id }),
    },
    add_note: {
      doc: "{title, note}: a line in the story: what was tried or decided.",
      fields: {
        title: str(140, "For add_note: the note's title."),
        note: str(160, "One line: how a direction feels, or what a story note says."),
      },
      example: () => ({ title: "The mark", note: "We chose the wordmark." }),
    },
  },
};
