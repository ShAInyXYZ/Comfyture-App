// The LoRAs a take can be rolled with on LTX-2.5 (those made for LTX-2.3 work on it too): styles,
// finishes and moves, stacked up to three like the Oven's, and real sounds for a clip's new
// soundtrack. The list is the server's.
import { h, icon } from "./dom.js";
import { float, stick } from "./controls.js";
import { videoLoras } from "./store.js";

export const LORA_MAX = 3;
const GROUPS = [["style", "Styles"], ["finish", "Finish"], ["motion", "Moves"]];
export const loraById = (id) => videoLoras().find((l) => l.id === id) ?? null;
/** The words a prompt opens with for these LoRAs, the styles' first (as the server writes them). */
export const loraWords = (picks) =>
  picks.map((p) => loraById(p.id)).filter((l) => l && l.kind !== "sound" && l.words)
    .sort((a, b) => Number(a.kind === "motion") - Number(b.kind === "motion")).map((l) => l.words).join(" ");
const strengthText = (v) => v.toFixed(2).replace(/0$/, "");
const clamp = (v) => Math.round(Math.min(2, Math.max(0, v)) * 20) / 20;
const told = (l) => (l.words ? `Adds “${l.words}” to the prompt` : l.about);

/**
 * A stack of LoRAs ([{ id, strength }], up to three): each with its strength and a key to take it
 * off, then a key that adds another. onChange(list) hears every change.
 */
export function loraStack(list, onChange) {
  const chosen = list.flatMap((p) => {
    const l = loraById(p.id);
    return l ? [{ ...l, strength: p.strength }] : [];
  });
  const set = (id, strength) => onChange(list.map((p) => (p.id === id ? { ...p, strength: clamp(strength) } : p)));
  const rows = chosen.map((l) =>
    h("div.lora-row", { title: told(l) },
      h("span.lora-text", {}, h("b", {}, l.name), h("span", {}, l.about)),
      h("div.lora-strength", { role: "group", "aria-label": `${l.name} strength` },
        h("button", { type: "button", "aria-label": "Weaker", disabled: l.strength <= 0, on: { click: () => set(l.id, l.strength - 0.1) } }, "−"),
        h("span", {}, strengthText(l.strength)),
        h("button", { type: "button", "aria-label": "Stronger", disabled: l.strength >= 2, on: { click: () => set(l.id, l.strength + 0.1) } }, "+")),
      h("button.chip-x", { type: "button", "aria-label": `Remove ${l.name}`, title: "Remove", on: { click: () => onChange(list.filter((p) => p.id !== l.id)) } }, icon("close"))));
  const left = videoLoras().filter((l) => l.kind !== "sound" && !list.some((p) => p.id === l.id));
  const add = list.length < LORA_MAX && left.length
    ? h("button.lora-add", { type: "button", title: `LoRAs on LTX-2.5, up to ${LORA_MAX} stacked: their strengths add up, so stacked ones may want a little less`, on: { click: (e) => addMenu(e.currentTarget, left, (l) => onChange([...list, { id: l.id, strength: l.strength }])) } }, icon("plus"), "Add a LoRA")
    : null;
  return h("div.lora-stack", {}, ...rows, add);
}

let shut = null;
const closeMenu = () => (shut?.(), (shut = null));

/** The LoRAs to add, as a menu by the key: styles, finishes, then moves, each with a few words. */
function addMenu(at, items, onPick) {
  if (shut) return closeMenu();
  const pick = (l) => (closeMenu(), onPick(l));
  const menu = h("div.sel-menu.lora-menu", { role: "menu" }, ...GROUPS.flatMap(([kind, label]) => {
    const list = items.filter((l) => l.kind === kind);
    return list.length ? [h("span.lora-menu-label", {}, label), ...list.map((l) =>
      h("button.sel-item", { type: "button", role: "menuitem", title: told(l), on: { click: () => pick(l) } },
        h("span.sel-text", {}, h("span.sel-label", {}, l.name), h("span.sel-desc", {}, l.about)),
        h("span.sel-meta", {}, strengthText(l.strength))))] : [];
  }));
  document.body.append(menu);
  const box = at.getBoundingClientRect();
  float(menu, box, Math.max(box.width, 320));
  const unstick = stick(menu, at, closeMenu);
  const outside = (e) => !menu.contains(e.target) && !at.contains(e.target) && closeMenu();
  menu.addEventListener("keydown", (e) => {
    const keys = [...menu.querySelectorAll("button")];
    const i = keys.indexOf(document.activeElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      keys[(i + (e.key === "ArrowDown" ? 1 : -1) + keys.length) % keys.length].focus();
    } else if (e.key === "Escape") {
      e.stopPropagation();
      closeMenu();
      at.focus();
    }
  });
  setTimeout(() => document.addEventListener("pointerdown", outside, true));
  shut = () => (unstick(), menu.remove(), document.removeEventListener("pointerdown", outside, true));
  menu.querySelector("button")?.focus();
}
