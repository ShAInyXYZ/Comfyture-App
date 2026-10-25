// The small parts of Spice's screen: a key with an icon, a quiet key with words, the yellow key and the yes to its price (a paid run asks
// first: the key turns into the yes for a few seconds), a lamp, a picture of a take. Plain parts, drawn again with their panel; the state
// they read is bay.js's.
import { h, icon, sprite } from "./dom.js";
import { changed } from "./store.js";
import { bay } from "./bay.js";

const update = () => changed("spice");

/** An icon of the app's sprite (the tool icons), or one of dom.js's own. */
export const glyph = (name) => (name.startsWith("tool-") || name.startsWith("film-") ? sprite(name) : icon(name));

/** A square key with an icon, its words in the tooltip. */
export const iconKey = (name, title, onClick, { disabled = false, pressed, cls = "" } = {}) =>
  h(`button.bay-iconkey${cls ? `.${cls}` : ""}`, { type: "button", title, "aria-label": title, disabled, "aria-pressed": pressed === undefined ? undefined : String(pressed), on: { click: onClick } }, glyph(name));

/** A quiet key with words (and an icon before them when it has one). */
export const ghost = (label, onClick, { icon: name, title, disabled = false, cls = "" } = {}) =>
  h(`button.bay-ghost${cls ? `.${cls}` : ""}`, { type: "button", title: title ?? label, disabled, on: { click: onClick } }, name ? glyph(name) : null, h("span", {}, label));

export const isArmed = (id) => bay.armed?.id === id && bay.armed.until > Date.now();
function arm(id) {
  bay.armed = { id, until: Date.now() + 8000 };
  update();
  setTimeout(() => bay.armed?.id === id && bay.armed.until <= Date.now() && ((bay.armed = null), update()), 8100);
}
export function disarm() {
  if (!bay.armed) return;
  bay.armed = null;
  update();
}

/** The credits as the screen says them: "≈ 24 cr", "≈ ? cr" while a partner's price is not known, "free". */
export const priceText = (n) => (n === 0 ? "free" : typeof n === "number" ? `≈ ${n} cr` : "≈ ? cr");

/**
 * The yellow key of a stage: what it does, and for a run that costs credits its price. The first press of a paid key only asks (it turns
 * into "Yes, spend it" for a few seconds, with "Not now" beside it); the second one runs. A free key runs at once.
 */
export function yes({ id, label, price, title, disabled = false, working = false, run }) {
  const paid = price !== 0;
  const armed = paid && isArmed(id);
  const key = h("button.bay-primary", {
    type: "button", disabled: disabled || working, dataset: { key: id, armed: armed ? "1" : "" }, title: title ?? label,
    on: { click: () => (paid && !armed ? arm(id) : ((bay.armed = null), run())) },
  }, h("span", {}, working ? "Working" : armed ? "Yes, spend it" : label), paid && !working ? h("em", {}, armed ? priceText(price) : `· ${priceText(price)}`) : null);
  return armed ? h("div.bay-yes", {}, key, ghost("Not now", disarm, { icon: "close" })) : key;
}

/** A quiet key for what cannot be undone: the first press asks, the second does it. */
export function danger({ id, label, again, run, compact = false }) {
  const armed = isArmed(id);
  return h(`button.bay-danger${armed ? ".is-armed" : ""}`, { type: "button", title: armed ? again : label, "aria-label": armed ? again : label, on: { click: () => (armed ? ((bay.armed = null), run()) : arm(id)) } }, icon("trash"), compact && !armed ? null : h("span", {}, armed ? again : label));
}

/** A lamp: done (green), working (amber), empty (hollow). */
export const lamp = (tone) => h("span.bay-lamp", { dataset: { tone } });

/** A small picture of a media: a clip shows its still, a picture itself, nothing an empty square. */
export function thumb(media, { cls = "" } = {}) {
  const src = media?.still ?? (media?.kind === "image" ? media.url : null);
  if (!media) return h(`span.bay-thumb.is-empty${cls ? `.${cls}` : ""}`);
  return h(`span.bay-thumb${cls ? `.${cls}` : ""}`, {}, src ? h("img", { src, alt: "", draggable: false, loading: "lazy" }) : h("span.bay-thumb-clip", {}, glyph("tool-edit-trim")));
}

/** An element's children replaced; what is null or false is left out. */
export const fill = (el, ...kids) => el.replaceChildren(...kids.flat().filter((k) => k !== null && k !== undefined && k !== false));

/** A card with a label: the screen is bentos of these. */
export const card = (cls, title, ...body) => h(`section.bay-card${cls ? `.${cls}` : ""}`, { role: "group", "aria-label": title }, h("div.bay-card-head", {}, h("span.bay-card-label", { role: "heading", "aria-level": "2" }, title)), ...body);
