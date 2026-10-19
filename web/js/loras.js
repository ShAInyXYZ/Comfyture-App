// The LoRAs a take can be rolled with on LTX-2.5 (those made for LTX-2.3 work on it too): a style or
// a finish, a move, and real sounds for a clip's new soundtrack. The list is the server's.
import { h, icon, sprite } from "./dom.js";
import { dropdown, knob } from "./controls.js";
import { videoLoras } from "./store.js";

const GROUPS = { style: "Styles", finish: "Finish", motion: "Moves" };
const GLYPHS = { style: () => sprite("variations"), finish: () => sprite("resolution-hd"), motion: () => sprite("camera-orbit") };
export const loraById = (id) => videoLoras().find((l) => l.id === id) ?? null;
/** A LoRA as a request takes it: its id at its own best strength. */
export const loraPick = (id) => {
  const l = loraById(id);
  return l ? { id: l.id, strength: l.strength } : null;
};
/** The words a prompt opens with for these LoRAs, a style's first (as the server writes them). */
export const loraWords = (picks) =>
  picks.filter(Boolean).map((p) => loraById(p.id)).filter((l) => l && l.kind !== "sound" && l.words)
    .sort((a, b) => Number(a.kind === "motion") - Number(b.kind === "motion")).map((l) => l.words).join(" ");
const strengthText = (v) => v.toFixed(2).replace(/0$/, "");

/**
 * A LoRA picker: None, then the LoRAs of these kinds (grouped when there are several kinds), and the
 * chosen one's strength on a small knob. onPick(choice) hears a pick ({ id, strength } or null),
 * onStrength(v) a turn of the knob (the knob's own readout follows, nothing is redrawn).
 */
export function loraControl({ kinds, value, onPick, onStrength, label, none = "None", note }) {
  const list = videoLoras().filter((l) => kinds.includes(l.kind));
  const chosen = value && loraById(value.id);
  const items = [
    { value: "none", label: none, desc: "LTX-2.5 as it is", glyph: () => icon("close") },
    ...list.map((l) => ({ value: l.id, label: l.name, desc: l.about, glyph: GLYPHS[l.kind], group: kinds.length > 1 ? GROUPS[l.kind] : undefined, groupIcon: kinds.length > 1 ? GLYPHS[l.kind] : undefined, meta: `${strengthText(l.strength)}×` })),
  ];
  const trigger = dropdown({ label, value: chosen ? chosen.id : "none", items, onChange: (id) => onPick(id === "none" ? null : loraPick(id)), width: "fit", note });
  if (!chosen) return h("div.lora-control", {}, trigger);
  const steps = [...new Set([0.6, 0.8, 1, 1.2, 1.4, 1.6, chosen.strength, value.strength])].sort((a, b) => a - b);
  const readout = h("span.lora-strength", {}, `${strengthText(value.strength)}×`);
  const dial = h("button", { type: "button", title: `Strength: ${strengthText(chosen.strength)}× suits it best` });
  knob(dial, {
    label: `${chosen.name} strength`,
    options: steps.map((v) => ({ value: v, label: `${strengthText(v)}×` })),
    value: value.strength,
    onChange: (v) => ((readout.textContent = `${strengthText(v)}×`), onStrength(v)),
  });
  return h("div.lora-control", {}, trigger, dial, readout);
}
