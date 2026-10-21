// What Home and the Shelf say about a tool besides its name: how it runs (on this machine and free, on Comfy Cloud and paid in credits,
// or either) and the colour of its sound. Read from the tool's own workspace module, which is where each tool says it; the plain tools of
// Picture and Video, which are Cloud's, say it here. One place, so the dashboard and the catalogue always agree.
import { isVfx, vfxById } from "./utensils-vfx-tools.js";
import { isAudio, audioById } from "./utensils-audio-tools.js";
import { isEdit } from "./utensils-edit-tools.js";

/** How a tool runs: "free" (here, nothing is charged), "cloud" (Comfy Cloud, credits) or "mixed" (either, by a setting). */
export function wayOf(tool) {
  if (!tool) return "cloud";
  if (isEdit(tool.id) || tool.id === "au-mix") return "free";
  if (isVfx(tool.id)) {
    const way = vfxById(tool.id).way;
    return way === "local" || way === "link" ? "free" : way === "mixed" ? "mixed" : "cloud";
  }
  if (isAudio(tool.id)) return audioById(tool.id).way === "local" ? "free" : "cloud";
  return "cloud";
}
/** The short words on a tool's mark. */
export const MARK = { free: "Free", cloud: "Cloud", mixed: "Cloud or free" };

/** The colour of a tool's waveform (the audio tools each have their own; any other is the accent). */
export const toneOf = (tool) => (tool && isAudio(tool.id) ? audioById(tool.id).tone : null) ?? "#F2FF59";

/** A tool's words, lower-cased, for finding it: its name, what it does and where it lives. */
export const wordsOf = (tool) => `${tool.name} ${tool.hint ?? ""} ${tool.group ?? ""} ${tool.workspace ?? ""}`.toLowerCase();

/**
 * The tools that match what was typed (every word of it, in any of the tool's words), the ones whose name starts with it first.
 * `list` is the tools (or anything with name, hint, group, workspace); at most `limit` come back.
 */
export function findIn(list, query, limit = 8) {
  const q = String(query ?? "").trim().toLowerCase();
  if (!q) return [];
  const parts = q.split(/\s+/);
  return list
    .filter((t) => parts.every((p) => wordsOf(t).includes(p)))
    .sort((a, b) => Number(b.name.toLowerCase().startsWith(q)) - Number(a.name.toLowerCase().startsWith(q)))
    .slice(0, limit);
}
