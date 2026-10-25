// The small parts Macaron's sections are built from: an icon, a card with its head, a segmented
// choice, a slider with its reading, a colour choice, a text field that keeps its own edit history.
import { h, icon, sprite } from "./dom.js";
import { begin, live, end, settle } from "./macaron.js";
import { colorOf } from "./design.js";

const PATHS = {
  text: '<path d="M5 6.5V5h14v1.5M12 5v14M9.5 19h5"/>',
  shape: '<rect x="4.5" y="6" width="15" height="12" rx="3"/>',
  logo: '<path d="M7.5 8c3-2.6 6.8-2.6 9 0M6 19c-1.8-2-1.8-5.5 0-7.5 1.4-1.6 3.3-2 5-1.2M10.5 15c1.3.8 3.2.2 5.2-1.5"/>',
  up: '<path d="m6 15 6-6 6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  front: '<path d="M12 5v10m-4-4 4-4 4 4M6 19h12"/>',
  back: '<path d="M12 19V9m-4 4 4 4 4-4M6 5h12"/>',
  hidden: '<path d="M3.5 12s3-5.5 8.5-5.5S20.5 12 20.5 12s-3 5.5-8.5 5.5S3.5 12 3.5 12zM4 4l16 16"/>',
  shown: '<path d="M3.5 12s3-5.5 8.5-5.5S20.5 12 20.5 12s-3 5.5-8.5 5.5S3.5 12 3.5 12z"/><circle cx="12" cy="12" r="2.4"/>',
  locked: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  unlocked: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>',
  safe: '<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><rect x="7" y="7" width="10" height="10" rx="1" stroke-dasharray="2 2"/>',
  left: '<path d="M5 4.5v15M9 8h10M9 16h6"/>',
  center: '<path d="M12 4.5v15M6 8h12M8 16h8"/>',
  right: '<path d="M19 4.5v15M5 8h10M9 16h6"/>',
  top: '<path d="M4.5 5h15M8 9v10M16 9v6"/>',
  middle: '<path d="M4.5 12h15M8 6v12M16 8v8"/>',
  bottom: '<path d="M4.5 19h15M8 5v10M16 9v6"/>',
  spread: '<path d="M4.5 5h15M4.5 19h15M8 9h8v6H8z"/>',
  alignLeft: '<path d="M5 7h14M5 12h9M5 17h12"/>',
  alignCenter: '<path d="M5 7h14M7.5 12h9M6 17h12"/>',
  alignRight: '<path d="M5 7h14M10 12h9M7 17h12"/>',
  vTop: '<path d="M5 5h14M12 9v10"/>',
  vMiddle: '<path d="M5 12h14M12 5v14"/>',
  vBottom: '<path d="M5 19h14M12 5v10"/>',
  kit: '<path d="M5 5h6v6H5zM13 5h6v6h-6zM5 13h6v6H5zM15 16l2.5-2.5L20 16l-2.5 2.5z"/>',
  history: '<path d="M4 12a8 8 0 1 0 2.4-5.7M4 5v4h4M12 8v4l3 2"/>',
  assets: '<rect x="4" y="5" width="16" height="14" rx="2.5"/><path d="m4.5 16 4.5-4 3.5 3 3-2.5 4 3.5"/><circle cx="9" cy="9.5" r="1.4"/>',
  studio: '<rect x="4" y="4.5" width="16" height="15" rx="2"/><path d="M8 9h5M8 12h8M16 8.5l1.5 1.5"/>',
  variants: '<rect x="3.5" y="6" width="9" height="12" rx="1.6"/><rect x="11.5" y="6" width="9" height="12" rx="1.6" opacity=".6"/>',
  motion: '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m10 9.5 5 2.5-5 2.5z"/>',
  content: '<path d="M5 6h14M5 12h14M5 18h9"/>',
  sparkle: '<path d="M12 4.5 13.6 9l4.4 1.6-4.4 1.6L12 16.7l-1.6-4.5L6 10.6 10.4 9z"/>',
  stamp: '<path d="m5 12.5 4 4L19 6.5"/>',
  expand: '<path d="M14 5h5v5M10 19H5v-5M19 5l-6 6M5 19l6-6"/>',
  chev: '<path d="m9 6 6 6-6 6"/>',
  chevLeft: '<path d="m15 6-6 6 6 6"/>',
  palette: '<path d="M12 4a8 8 0 1 0 0 16c1.2 0 1.8-.8 1.8-1.7 0-1.2-1-1.5-1-2.6 0-.9.7-1.6 1.7-1.6H17a3 3 0 0 0 3-3C20 7 16.5 4 12 4z"/><circle cx="8" cy="11" r="1.1"/><circle cx="11" cy="8" r="1.1"/><circle cx="15" cy="8.5" r="1.1"/>',
  contrast: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>',
  export: '<path d="M12 15V4m-4 4 4-4 4 4M5 14v4a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 18v-4"/>',
  pencil: '<path d="m5 19 1-4L16.5 4.5a2 2 0 0 1 3 3L9 18z"/><path d="m14.5 6.5 3 3"/>',
  picture: '<rect x="4" y="5" width="16" height="14" rx="2.5"/><path d="m4.5 16 4.5-4 3.5 3 3-2.5 4 3.5"/><circle cx="9" cy="9.5" r="1.4"/>',
  doc: '<path d="M7 4.5h7l4 4V19a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1z"/><path d="M14 4.5V9h4M9 13h6M9 16h4"/>',
  clapper: '<path d="M4.5 10.5h15V19a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1z"/><path d="m4.5 10.5-.6-3.6 14-2.4.6 3.6M8 7.6l2 2.6M12.2 6.9l2 2.6"/>',
  play: '<path d="m8.5 6.5 9 5.5-9 5.5z" fill="currentColor"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  swap: '<path d="M5 8h13l-3-3M19 16H6l3 3"/>',
  calendar: '<rect x="4" y="5.5" width="16" height="14" rx="2.5"/><path d="M4 10h16M8.5 4v3M15.5 4v3"/>',
  download: '<path d="M12 4v11m-4-4 4 4 4-4M5 19h14"/>',
  bulb: '<path d="M9.5 17.5h5M10 20h4M12 4a5.5 5.5 0 0 0-3.2 10c.5.4.7.9.7 1.5h5c0-.6.2-1.1.7-1.5A5.5 5.5 0 0 0 12 4z"/>',
  heart: '<path d="M12 19s-6.5-3.9-6.5-8.5A3.6 3.6 0 0 1 12 8.6a3.6 3.6 0 0 1 6.5 1.9C18.5 15.1 12 19 12 19z"/>',
  smile: '<circle cx="12" cy="12" r="8"/><path d="M8.8 14c.8 1.2 1.9 1.8 3.2 1.8s2.4-.6 3.2-1.8M9.4 10h.01M14.6 10h.01"/>',
  spark: '<path d="M12 4.5 13.6 9l4.4 1.6-4.4 1.6L12 16.7l-1.6-4.5L6 10.6 10.4 9zM18.5 4v3M17 5.5h3"/>',
  flip: '<path d="M4 12h16M7 8l-3 4 3 4M17 8l3 4-3 4"/>',
  trash: '<path d="M5 7h14M10 7V5h4v2M7 7l.7 11.5a1 1 0 0 0 1 .9h6.6a1 1 0 0 0 1-.9L17 7"/>',
};
/** An icon of Macaron's own, in the app's icon style. */
export function mcicon(name) {
  const span = document.createElement("span");
  span.innerHTML = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] ?? ""}</svg>`;
  return span.firstChild;
}
export { h, icon, sprite };

/** An element's children replaced, what is null or false left out (replaceChildren would write "null"). */
export const fill = (el, ...kids) => el.replaceChildren(...kids.flat().filter((k) => k !== null && k !== undefined && k !== false));

/**
 * A bento: a card of a workspace with its label and a small expand key; it opens its window when it is clicked
 * anywhere that is not a key, a field or something with an action of its own.
 */
export function bento(cls, title, open, ...body) {
  return h(`section.mc-bento${cls ? `.${cls}` : ""}`, { role: "group", "aria-label": title, dataset: { open: open ? "1" : "" }, on: { click: (e) => open && !e.target.closest("a, button, input, textarea, select, [data-keep]") && open() } },
    h("div.mc-b-head", {}, h("span.mc-b-label", { role: "heading", "aria-level": "2" }, title), open ? h("button.mc-expand", { type: "button", title: `Open ${title.toLowerCase()}`, "aria-label": `Open ${title.toLowerCase()}`, on: { click: (e) => (e.stopPropagation(), open()) } }, mcicon("expand")) : null),
    ...body);
}

const spots = new Map();
/**
 * An endless, slow scroll of a track of tiles (the track holds them twice, so it never ends). It stops while it is
 * pointed at and when reduced motion is asked for, and keeps its place when it is built again. Answers step(1) and
 * step(-1), which move it a tile on, and start(), which runs it again once it is on the page.
 */
export function marquee(id, view, track, { speed = 24 } = {}) {
  const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const self = { pos: spots.get(id) ?? 0, to: null, hold: false, last: 0, running: false };
  const put = () => (track.style.transform = `translate3d(${-self.pos}px, 0, 0)`);
  const tick = (now) => {
    if (!view.isConnected) return void ((self.running = false), (self.last = 0));
    requestAnimationFrame(tick);
    const dt = self.last ? Math.min(0.05, (now - self.last) / 1000) : 0;
    self.last = now;
    if (self.to !== null) {
      self.pos += (self.to - self.pos) * Math.min(1, dt * 9);
      if (Math.abs(self.to - self.pos) < 0.5) self.to = null;
    } else if (!self.hold && !calm) self.pos += speed * dt;
    const w = track.scrollWidth / 2;
    if (w > 0) {
      if (self.pos >= w) ((self.pos -= w), self.to !== null && (self.to -= w));
      if (self.pos < 0) ((self.pos += w), self.to !== null && (self.to += w));
    }
    spots.set(id, self.pos);
    put();
  };
  view.addEventListener("pointerenter", () => (self.hold = true));
  view.addEventListener("pointerleave", () => (self.hold = false));
  view.addEventListener("focusin", () => (self.hold = true));
  view.addEventListener("focusout", () => (self.hold = false));
  put();
  return {
    start() {
      if (self.running) return;
      self.running = true;
      requestAnimationFrame(tick);
    },
    step: (dir) => (self.to = (self.to ?? self.pos) + dir * 220),
  };
}

/** A card of a section: its label and tools, then what it holds. */
export function card(cls, title, tools, ...body) {
  return h(`section.mc-card${cls ? `.${cls}` : ""}`, {},
    title ? h("div.mc-head", {}, h("span.card-label", {}, title), tools?.length ? h("div.card-tools", {}, ...tools) : null) : null,
    ...body);
}
/** A button with an icon and a tooltip, no words. */
export const key = (glyph, title, onClick, o = {}) =>
  h(`button.key.is-icon.is-sm${o.quiet === false ? "" : ".is-quiet"}${o.on ? ".is-on" : ""}${o.cls ? `.${o.cls}` : ""}`, { type: "button", title, "aria-label": title, disabled: o.disabled, "aria-pressed": o.on === undefined ? undefined : String(!!o.on), on: { click: onClick } }, glyph);
export const chip = (text, o = {}) => h(`span.chip${o.tone ? `.is-${o.tone}` : ""}`, { title: o.title ?? "" }, text);

/** A choice of one: the buttons of a segmented control. Items: [value, label or node, tooltip]. */
export const seg = (items, value, pick, o = {}) =>
  h(`div.segment${o.cls ? `.${o.cls}` : ""}`, { role: "group", "aria-label": o.label ?? "" }, ...items.map(([v, label, tip]) =>
    h("button", { type: "button", title: tip ?? "", "aria-label": tip ?? undefined, "aria-pressed": String(v === value), on: { click: () => pick(v) } }, label)));

/** A labelled row of an inspector. */
export const row = (label, ...body) => h("div.mc-row", {}, h("span.label", {}, label), h("div.mc-row-in", {}, ...body));

/** A slider: live while it moves (set), one step back when it lets go. */
export function slider({ value, min = 0, max = 1, step = 0.001, set, note, read = (v) => v, label, prop }) {
  const out = h("span.mc-read", {}, String(read(value)));
  const input = h("input", { type: "range", min, max, step, value, "aria-label": label ?? note ?? "Value", dataset: prop ? { sync: prop, out: "1" } : {}, on: {
    pointerdown: () => begin(),
    input: (e) => {
      begin();
      const v = Number(e.target.value);
      out.textContent = String(read(v));
      live(() => set(v));
    },
    change: () => end(note),
    // pressed or focused and let go without a change: nothing was begun
    pointerup: () => settle(),
    blur: () => settle(),
  } });
  return h("div.mc-slider", {}, input, out);
}

/** A number in a field: typed, then committed as one step. */
export function numberField({ value, min, max, step = 0.1, set, note, suffix = "", label, scale = 1, prop }) {
  return h("label.mc-num", { title: label ?? "" },
    h("input", { type: "number", min, max, step, value: Math.round(value * scale * 100) / 100, "aria-label": label ?? note ?? "Number", dataset: prop ? { sync: prop, scale } : {}, on: {
      focus: () => begin(),
      input: (e) => {
        const v = Number(e.target.value);
        if (Number.isFinite(v)) live(() => set(v / scale));
      },
      change: () => end(note),
      blur: () => settle(),
      keydown: (e) => e.key === "Enter" && e.target.blur(),
    } }),
    suffix ? h("em", {}, suffix) : null);
}

/** A text field that edits live and is one step back for the whole time it is in. */
export function textField({ value, set, note, rows = 0, placeholder = "", label, cls = "", focusKey }) {
  const tag = rows ? "textarea" : "input";
  return h(`${tag}.field.mc-text${cls ? `.${cls}` : ""}`, { value, rows: rows || undefined, placeholder, "aria-label": label ?? placeholder ?? "Text", spellcheck: !!rows, dataset: focusKey ? { focus: focusKey } : {}, on: {
    focus: () => begin(),
    input: (e) => live(() => set(e.target.value)),
    change: () => end(note),
    // focused and left without a change: there is nothing to go back to
    blur: () => settle(),
    keydown: (e) => {
      e.stopPropagation();
      if (e.key === "Escape") e.target.blur();
    },
  } });
}

/** The palette as buttons: one colour chosen (a role id), optionally none. */
export function swatches(kit, value, pick, o = {}) {
  return h("div.mc-swatch-row", { role: "group", "aria-label": o.label ?? "Colour" },
    ...kit.palette.map((p) => h("button.mc-dot", { type: "button", title: `${p.name} ${p.hex}`, "aria-label": p.name, "aria-pressed": String(p.id === value), style: { "--c": p.hex }, on: { click: () => pick(p.id) } }, p.id === value ? icon("check") : null)),
    o.none ? h("button.mc-dot.is-none", { type: "button", title: o.none, "aria-label": o.none, "aria-pressed": String(!value), on: { click: () => pick(null) } }, icon("close")) : null);
}
export const hexOf = (kit, role, fallback) => colorOf(kit, role, fallback);

/** A drop of text that tells what a thing is for, in the app's quiet mono. */
export const hint = (text) => h("p.mc-hint", {}, text);

/** A file chooser for pictures from the computer, opened by a key. */
export function chooseFiles(fn, multiple = false, accept = "image/*") {
  const input = h("input", { type: "file", accept, multiple, hidden: true, on: { change: () => ([...input.files].forEach(fn), input.remove()) } });
  document.body.append(input);
  input.click();
}

/** The time as the timeline reads it: seconds with a tenth. */
export const seconds = (s) => `${(Math.round(s * 10) / 10).toFixed(1)} s`;
export const shortDate = (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
export const longDate = (iso) => new Date(iso).toISOString().slice(0, 10);
export const kb = (bytes) => (bytes > 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`);

/** Click twice to do it: the first press arms the key for three seconds. */
let armed = null;
export const arming = (key, rerender, run) => {
  if (armed === key) {
    armed = null;
    return run();
  }
  armed = key;
  rerender();
  setTimeout(() => armed === key && ((armed = null), rerender()), 3000);
};
export const isArmed = (key) => armed === key;
export const armedNow = () => armed;
