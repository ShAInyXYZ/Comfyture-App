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
// a draft from one sentence (its variants, its script, its cast) reads about 7.5K tokens and writes about 5K
const draft = (rates) => (rates ? Math.max(1, Math.round(rates[0] * 7.5 + rates[1] * 5)) : null);

const price = (costs) => (costs.includes(null) ? "GPU time" : `≈ ${[...new Set([Math.min(...costs), Math.max(...costs)])].join("–")} cr`);

/** The items of the picker, in the order the server lists them; each maker's header shows its range. */
export const writerItems = () => {
  const list = writers();
  return list.map((m) => {
    const [group, groupIcon] = PROVIDERS[m.provider] ?? [m.provider, () => sprite("prompt-enhance")];
    const groupMeta = price(list.filter((x) => x.provider === m.provider).map((x) => draft(x.rates)));
    return { value: m.id, label: m.name, desc: m.about, group, groupIcon, groupMeta, meta: price([draft(m.rates)]) };
  });
};

/** The picker for a role: the writer (Story, Cut) or the assistant (Shot, Stage). */
export const writerPicker = (role = "writer", label = role === "writer" ? "Writer" : "Assistant") =>
  dropdown({ label, value: writer(role), items: writerItems(), onChange: (id) => setWriter(id, role), width: "fit", note: "Comfy credits for a story draft: its variants, its script and its cast" });
