// The small parts Spice's departments are built from: an icon, a bento (a card with its label and its expand key), an icon key, the
// yellow key with its price (a paid run asks for the person's yes first: the key turns into the yes for a few seconds), a thumbnail
// of a pass. Plain parts, drawn again with their department; the state they read is spice.js's.
import { h } from "./dom.js";
import { changed } from "./store.js";
import { spice } from "./spice.js";

const PATHS = {
  first: '<path d="M6 5.5v13M18 5.5v13l-9-6.5z"/>',
  last: '<path d="M18 5.5v13M6 5.5v13l9-6.5z"/>',
  prev: '<path d="m14.5 6-6 6 6 6"/>',
  next: '<path d="m9.5 6 6 6-6 6"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>',
  pause: '<path d="M8.5 5.5v13M15.5 5.5v13" stroke-width="2.6"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" opacity=".45"/><path d="M4 4l16 16"/>',
  expand: '<path d="M14 5h5v5M10 19H5v-5M19 5l-6 6M5 19l6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  chev: '<path d="m9 6 6 6-6 6"/>',
  caret: '<path d="m6 9 6 6 6-6"/>',
  diamond: '<path d="M12 4.5 19.5 12 12 19.5 4.5 12z"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  upload: '<path d="M12 16V5m0 0-4.5 4.5M12 5l4.5 4.5M5 19.5h14"/>',
  download: '<path d="M12 4v11m0 0 4.5-4.5M12 15l-4.5-4.5M5 19.5h14"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  trash: '<path d="M5 7h14M10 7V4.5h4V7m-7 0 .8 12.5h8.4L17 7"/>',
  brush: '<path d="M14.5 5.5 18.5 9.5 10 18c-1.2 1.2-3 1.5-4.5 1 .5-1.5.2-3.300 1.500-4.500zM13 7l4 4"/>',
  eraser: '<path d="m8 18-3.500-3.500a1.500 1.500 0 0 1 0-2.100L13 4a1.500 1.500 0 0 1 2.100 0l4 4a1.500 1.500 0 0 1 0 2.100L11 18zM8 18h11M9 8.500l6 6"/>',
  wand: '<path d="m5 19 9-9M13 6.500 17.500 11M17 3v3M15.500 4.500h3M19.500 12v2.500M18.250 13.250h2.500"/>',
  loop: '<path d="M17 4.500 20 7.500l-3 3M4 12V10a2.500 2.500 0 0 1 2.500-2.500H20M7 19.500 4 16.500l3-3M20 12v2a2.500 2.500 0 0 1-2.500 2.500H4"/>',
  film: '<rect x="3.500" y="4.500" width="17" height="15" rx="2"/><path d="M7.500 4.500v15M16.500 4.500v15M3.500 9h4M3.500 15h4M16.500 9h4M16.500 15h4"/>',
  scissors: '<circle cx="6.500" cy="6.500" r="2.500"/><circle cx="6.500" cy="17.500" r="2.500"/><path d="m8.400 8 11.100 9.500M8.400 16 19.500 6.500"/>',
  sun: '<circle cx="12" cy="12" r="3.500"/><path d="M12 3.500v2M12 18.500v2M3.500 12h2M18.500 12h2M6 6l1.400 1.400M16.600 16.600 18 18M6 18l1.400-1.400M16.600 7.400 18 6"/>',
  cloud: '<path d="M7 18a4 4 0 0 1-.4-8A5.500 5.500 0 0 1 17 8.500a4.800 4.800 0 0 1 .5 9.500z"/>',
  text: '<path d="M5 6.500V5h14v1.500M12 5v14M9.500 19h5"/>',
  more: '<circle cx="6" cy="12" r="1.200" fill="currentColor"/><circle cx="12" cy="12" r="1.200" fill="currentColor"/><circle cx="18" cy="12" r="1.200" fill="currentColor"/>',
  undo: '<path d="M9 7.5 4.500 12 9 16.500"/><path d="M4.500 12h10a5 5 0 0 1 0 10h-2"/>',
  redo: '<path d="m15 7.500 4.500 4.500-4.500 4.500"/><path d="M19.500 12h-10a5 5 0 0 0 0 10h2"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/>',
  flip: '<path d="M12 3.5v17M9 7 4 17h5zM15 7l5 10h-5z"/>',
  flipv: '<path d="M3.5 12h17M7 9 17 4v5zM7 15l10 5v-5z"/>',
  person: '<circle cx="12" cy="7.5" r="3.200"/><path d="M5.500 19.500c.6-3.800 3.200-6 6.500-6s5.900 2.200 6.500 6"/>',
  layers: '<path d="m12 4 8.500 4.500L12 13 3.500 8.500z"/><path d="m3.500 12.500 8.500 4.500 8.500-4.500M3.500 16 12 20.500 20.500 16"/>',
  sparkle: '<path d="M12 3.500c.6 4.200 2.300 5.900 6.500 6.500-4.200.6-5.900 2.300-6.500 6.500-.6-4.200-2.300-5.900-6.500-6.500 4.200-.6 5.900-2.300 6.500-6.500z"/><path d="M18.500 15.500c.3 1.700 1 2.400 2.700 2.700-1.700.3-2.400 1-2.700 2.700-.3-1.700-1-2.400-2.700-2.700 1.700-.3 2.400-1 2.700-2.700z"/>',
  compare: '<rect x="3.500" y="5" width="17" height="14" rx="2.500"/><path d="M12 3v18" stroke-dasharray="2 2"/>',
  grip: '<circle cx="9" cy="6.500" r="1.100" fill="currentColor"/><circle cx="15" cy="6.500" r="1.100" fill="currentColor"/><circle cx="9" cy="12" r="1.100" fill="currentColor"/><circle cx="15" cy="12" r="1.100" fill="currentColor"/><circle cx="9" cy="17.500" r="1.100" fill="currentColor"/><circle cx="15" cy="17.500" r="1.100" fill="currentColor"/>',
  bake: '<path d="M4.500 13.500h15M6 13.500l1.200 5.500h9.600L18 13.500"/><path d="M9 10.500c0-1.500 1.200-1.500 1.200-3S9 6 9 4.500M14 10.500c0-1.500 1.200-1.500 1.200-3S14 6 14 4.500"/>',
};
/** An icon of Spice's own, in the app's icon style. */
export function spicon(name) {
  const span = document.createElement("span");
  span.innerHTML = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] ?? ""}</svg>`;
  return span.firstChild;
}

/** An SVG drawn from its markup (h() makes HTML elements): `attrs` are the svg's own, `inner` what is inside it. */
export function svg(cls, attrs, inner) {
  const span = document.createElement("span");
  span.innerHTML = `<svg class="${cls}" ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(" ")} aria-hidden="true">${inner}</svg>`;
  return span.firstChild;
}

/** An element's children replaced, what is null or false left out. */
export const fill = (el, ...kids) => el.replaceChildren(...kids.flat().filter((k) => k !== null && k !== undefined && k !== false));

/**
 * A bento: a card of a department with its label (and a note beside it) and a small expand key; the card opens its window when it is
 * clicked anywhere that is not a key, a field or something with an action of its own.
 */
export function bento(cls, title, open, ...body) {
  return h(`section.sp-bento${cls ? `.${cls}` : ""}`, { role: "group", "aria-label": title, on: { click: (e) => open && !e.target.closest("a, button, input, textarea, select, canvas, [data-keep]") && open() } },
    h("div.sp-b-head", {}, h("span.sp-b-label", { role: "heading", "aria-level": "2" }, title), open ? h("button.sp-expand", { type: "button", title: `Open ${title.toLowerCase()}`, "aria-label": `Open ${title.toLowerCase()}`, on: { click: (e) => (e.stopPropagation(), open()) } }, spicon("expand")) : null),
    ...body);
}

/** A square key with an icon, its words in the tooltip. */
export const iconKey = (icon, title, onClick, { disabled = false, pressed, cls = "" } = {}) =>
  h(`button.sp-iconkey${cls ? `.${cls}` : ""}`, { type: "button", title, "aria-label": title, disabled, "aria-pressed": pressed === undefined ? undefined : String(pressed), on: { click: onClick } }, icon);

/** A quiet key with words (and an icon before them when it has one). */
export const ghost = (label, onClick, { icon, title, disabled = false, cls = "" } = {}) =>
  h(`button.sp-ghost${cls ? `.${cls}` : ""}`, { type: "button", title: title ?? label, disabled, on: { click: onClick } }, icon ?? null, h("span", {}, label));

// ---------------------------------------------------------------- the yellow key and the yes to its price

/** Whether the key of this id is waiting for its yes. */
export const isArmed = (id) => spice.armed?.id === id && spice.armed.until > Date.now();
function arm(id) {
  spice.armed = { id, until: Date.now() + 8000 };
  changed("spice");
  setTimeout(() => spice.armed?.id === id && spice.armed.until <= Date.now() && ((spice.armed = null), changed("spice")), 8100);
}
export function disarm() {
  if (!spice.armed) return;
  spice.armed = null;
  changed("spice");
}

/**
 * The yellow key of a department: what it does, and for a run that costs credits its price. The first press of a paid key only asks (it turns
 * into "Yes, spend it" for a few seconds, with "Not now" beside it); the second one runs. A free key runs at once. `cost` is the credits
 * (a number), "" for a free run; `label` what it says.
 */
export function primary({ id, label, cost, title, disabled = false, working = false, run }) {
  const paid = typeof cost === "number" || cost === null;
  const armed = paid && isArmed(id);
  const price = typeof cost === "number" ? `≈ ${cost} cr` : cost === null ? "≈ ? cr" : "";
  const key = h("button.sp-primary", {
    type: "button", disabled: disabled || working, dataset: { key: id, armed: armed ? "1" : "" }, title: title ?? label,
    on: { click: () => (paid && !armed ? arm(id) : (spice.armed && (spice.armed = null), run())) },
  }, h("span", {}, working ? "Working" : armed ? "Yes, spend it" : label), price && !working ? h("em", {}, armed ? price : `· ${price}`) : null);
  return armed ? h("div.sp-primary-row", {}, key, h("button.sp-ghost", { type: "button", on: { click: disarm } }, spicon("close"), h("span", {}, "Not now"))) : key;
}

/** A quiet key for what cannot be undone: the first press asks ("Click again to delete it"), the second does it. */
export function danger({ id, label, again, run }) {
  const armed = isArmed(id);
  return h(`button.sp-danger${armed ? ".is-armed" : ""}`, { type: "button", title: armed ? again : label, on: { click: () => (armed ? ((spice.armed = null), run()) : arm(id)) } }, spicon("trash"), h("span", {}, armed ? again : label));
}

/**
 * A yellow key lit or put out where it stands, without drawing the department again: typing does not draw the screen under the cursor, so
 * the key a field's words are for follows them here (a key that stays out while the words are typed could not be pressed).
 */
export function lightKey(id, disabled, title) {
  const key = document.querySelector(`.sp-primary[data-key="${id}"]`);
  if (!key) return;
  key.disabled = !!disabled;
  if (title !== undefined) {
    key.removeAttribute("title");
    key.dataset.tooltip = title;
  }
}

// ---------------------------------------------------------------- a pass as a picture

/** A small picture of a media (a clip shows its first frame, a picture itself): what the stack's rows and the lists show. */
export function thumb(media, { cls = "" } = {}) {
  if (!media) return h(`span.sp-thumb.is-empty${cls ? `.${cls}` : ""}`);
  const pic = media.kind === "image" ? h("img", { src: media.still ?? media.url, alt: "", draggable: false, loading: "lazy" }) : media.still ? h("img", { src: media.still, alt: "", draggable: false, loading: "lazy" }) : h("video", { src: `${media.url}#t=0.1`, muted: true, preload: "metadata", playsInline: true });
  return h(`span.sp-thumb${cls ? `.${cls}` : ""}`, {}, pic);
}
