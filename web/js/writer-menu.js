import { sprite, icon } from "./dom.js";
import { writer, writers, setWriter } from "./store.js";
import { dropdown } from "./controls.js";

// The writer picker: the models grouped by who makes them, each with what a story draft costs on it.

const PROVIDERS = {
  anthropic: ["Anthropic", () => sprite("brand-anthropic")],
  openai: ["OpenAI", () => sprite("brand-openai")],
  vertexai: ["Google", () => sprite("brand-google")],
  comfyui: ["Open weights", () => icon("flow")],
};
// a whole draft from one sentence (idea, script, cast, storyboard) reads about 7.5K tokens and writes about 5K
const draft = (rates) => (rates ? Math.max(1, Math.round(rates[0] * 7.5 + rates[1] * 5)) : null);

/** The items of the picker, in the order the server lists them. */
export const writerItems = () => writers().map((m) => {
  const [group, groupIcon] = PROVIDERS[m.provider] ?? [m.provider, () => sprite("prompt-enhance")];
  const cost = draft(m.rates);
  return { value: m.id, label: m.name, desc: m.about, group, groupIcon, meta: cost ? `≈ ${cost} cr` : "GPU time" };
});

/** The picker for a role: the writer (Story, Cut) or the assistant (Shot, Stage). */
export const writerPicker = (role = "writer", label = role === "writer" ? "Writer" : "Assistant") =>
  dropdown({ label, value: writer(role), items: writerItems(), onChange: (id) => setWriter(id, role), width: "fit", note: "Comfy credits for a whole story draft: idea, script, cast and storyboard" });
