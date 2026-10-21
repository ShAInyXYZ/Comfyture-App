// The small controls the VFX and Audio workbenches share (the .uf-* rules in css/ut-vfx.css): a slider with its value, a switch,
// colour swatches, a row of chips, a control with its label on one line, a picture well. Plain parts: they keep nothing.
import { h, icon } from "./dom.js";
import { toast } from "./store.js";
import { openPicker, pictureOf } from "./picker.js";

/** A control of one line: its label, then the control. */
export const line = (label, ...node) => h("div.uf-line", {}, h("span.ut-label", {}, label), ...node);

/** A slider with its value beside it: moving it keeps the value quietly, letting go keeps it for good. */
export function slider({ value, min, max, step = 0.01, show = (v) => String(v), set, label }) {
  const out = h("output.uf-out", {}, show(value));
  const input = h("input.uf-range", { type: "range", min, max, step, value, "aria-label": label ?? "Value" });
  const fill = () => input.style.setProperty("--fill", `${((input.value - min) / (max - min)) * 100}%`);
  fill();
  input.addEventListener("input", () => (fill(), (out.textContent = show(Number(input.value))), set(Number(input.value), true)));
  input.addEventListener("change", () => set(Number(input.value), false));
  return h("div.uf-slider", {}, input, out);
}

/** A switch with its words beside it. */
export const switchKey = (label, on, set, title) =>
  h("button.uf-switch", { type: "button", role: "switch", "aria-checked": String(!!on), title, on: { click: () => set(!on) } }, h("i"), h("span", {}, label));

/** Chips for a list of choices (they wrap): [value, label, tip?] options. */
export const chipRow = (options, value, pick, title) =>
  h("div.uf-chips", { role: "group", title }, ...options.map(([v, label, tip]) =>
    h("button.ut-pill.uf-chip", { type: "button", "aria-pressed": String(value === v), title: tip ?? "", on: { click: () => pick(v) } }, label)));

/** Colour swatches (and one for another colour): the one in use is ringed. */
export function swatches(value, set, list = ["#101012", "#FFFFFF", "#211927", "#49378B", "#F2FF59", "#E8836B"]) {
  const v = String(value).toUpperCase();
  return h("div.uf-swatches", {}, ...list.map((c) =>
    h("button.uf-swatch", { type: "button", style: { "--c": c }, "aria-pressed": String(v === c), title: c, "aria-label": c, on: { click: () => set(c) } })),
  h("label.uf-swatch.is-custom", { title: "Another colour" }, h("input", { type: "color", value: String(value).toLowerCase(), "aria-label": "Another colour", on: { input: (e) => set(e.target.value.toUpperCase(), true), change: (e) => set(e.target.value.toUpperCase(), false) } }), icon("plus")));
}

/** A well for a picture of the library or the computer: its small picture, what it is, a key to take it out. */
export function pictureWell({ value, label, hint, pick, clear }) {
  const choose = (anchor) => openPicker(anchor, { title: label, onPick: async (choice) => { try { pick(await pictureOf(choice)); } catch (e) { toast(e.message, { tone: "crit" }); } } });
  return h("div.ut-well", {},
    h("button.ut-well-pic", { type: "button", title: value ? "Replace it" : label, on: { click: (e) => choose(e.currentTarget) } }, value ? h("img", { src: value.url, alt: "", draggable: false }) : icon("image")),
    h("span.ut-well-text", {}, h("b", {}, value ? `${value.width} × ${value.height}` : label), h("em", {}, value ? "click to replace" : hint ?? "from your pictures")),
    value ? h("button.ut-iconkey.is-quiet", { type: "button", title: "Take it out", "aria-label": "Take it out", on: { click: clear } }, icon("close")) : null);
}

/** The time as 0:03 (or 0:03.4 with `tenths`). */
export const clock = (s, tenths = false) => `${Math.floor(Math.max(0, s) / 60)}:${(Math.max(0, s) % 60).toFixed(tenths ? 1 : 0).padStart(tenths ? 4 : 2, "0")}`;
