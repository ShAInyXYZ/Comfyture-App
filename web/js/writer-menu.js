import { sprite, icon } from "./dom.js";
import { state, writer, writers, setWriter, artist, artists, setArtist } from "./store.js";
import { dropdown } from "./controls.js";

// The writer's and the artist's pickers: the language models grouped by who makes them, each with what a
// story draft costs on it, and the image models, each with what a picture costs.

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
    return { value: m.id, label: m.name, short: m.short, glyph: groupIcon, desc: m.about, group, groupIcon, groupMeta, meta: price([draft(m.rates)]) };
  });
};

/** The picker for a role: the writer (Story, Cut) or the assistant (Shot, Stage). */
export const writerPicker = (role = "writer", label = role === "writer" ? "Writer" : "Assistant") =>
  dropdown({ label, value: writer(role), items: writerItems(), onChange: (id) => setWriter(id, role), width: "fit", note: "Comfy credits for a story draft: its variants, its script and its cast" });

// Comfy Cloud bills a GPU second at 0.266 credits; a picture's seconds are measured warm, at a megapixel
const GPU_SECOND = 0.266;
// the partners' models by who makes them, the open-weights ones (in ComfyUI) after them
const BRANDS = { openai: "brand-openai", google: "brand-google", bytedance: "brand-bytedance", qwen: "brand-qwen" };
export const artistItems = () => {
  const cloud = state.info?.target === "comfy-cloud";
  const list = artists();
  return [...list.filter((m) => m.router), ...list.filter((m) => !m.router)].map((m) => {
    const groupIcon = m.router ? (BRANDS[m.maker] ? () => sprite(BRANDS[m.maker]) : null) : () => icon("flow");
    return {
      value: m.id,
      label: m.name,
      short: m.short,
      glyph: groupIcon ?? (() => sprite("image-generate")),
      desc: m.about,
      group: m.router ? m.makerName : "Open weights",
      groupIcon,
      meta: m.router ? `≈ ${m.credits} cr` : !cloud ? "your GPU" : m.seconds ? `≈ ${Math.max(1, Math.round(m.seconds * GPU_SECOND))} cr` : "GPU time",
    };
  });
};

/** The picker for the artist: the image model that draws the moodboards and the story's pictures. */
export const artistPicker = () =>
  dropdown({ label: "Artist", value: artist(), items: artistItems(), onChange: setArtist, width: "fit", note: state.info?.target === "comfy-cloud" ? "Comfy credits a picture on Comfy Cloud; a moodboard is three pictures a variant" : "Drawn on your own GPU: no credits" });
