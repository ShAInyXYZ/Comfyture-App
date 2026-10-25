// The floating windows of Spice. A bento opens in a centred window over a dimmed screen: the details of what the bento shows. One
// window is open at a time; what is in it is a component ({ el, update, sig }) made once and put back each time it opens. The same
// pattern as Macaron's (macaron-win.js), kept apart because the two products' state is.
import { h } from "./dom.js";
import { changed } from "./store.js";
import { spice } from "./spice.js";
import { spicon } from "./spice-ui.js";

const defs = new Map();
const parts = new Map();

/** A window the departments can open by its id: its `title`, an `eyebrow` above it, its `size` (s, m, l) and how its content is made. */
export const defineWindow = (id, def) => defs.set(id, def);

export function openWin(id) {
  if (!defs.has(id) || spice.win === id) return;
  spice.win = id;
  changed("spice");
}
export function closeWin() {
  // (with none open it only draws the page again: what is on screen is brought to what the state says)
  spice.win = null;
  changed("spice");
}

/** The layer the windows are drawn on, and what keeps them up to date. */
export function windowHost() {
  const eyebrow = h("span.sp-win-eyebrow");
  const title = h("h2", { id: "sp-win-title" });
  const closeKey = h("button.sp-iconkey", { type: "button", title: "Close (Esc)", "aria-label": "Close", on: { click: closeWin } }, spicon("close"));
  const body = h("div.sp-win-body");
  const win = h("section.sp-win", { role: "dialog", "aria-modal": "true", "aria-labelledby": "sp-win-title", tabindex: "-1" }, h("header.sp-win-head", {}, h("div.sp-win-title", {}, eyebrow, title), closeKey), body);
  const veil = h("div.sp-veil", { on: { pointerdown: (e) => e.target === veil && closeWin() } });
  const el = h("div.sp-winhost", { hidden: true }, veil, win);
  let shown = null;
  let from = null;
  let seen;

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !spice.win) return;
    // a field that is being typed in lets go first
    if (e.target.closest?.("input, textarea, select") && e.target !== document.body) return void e.target.blur();
    closeWin();
  });

  function update() {
    const id = spice.win;
    const def = id && defs.get(id);
    el.hidden = !def;
    document.body.classList.toggle("sp-has-win", !!def);
    // what is under a window is not reached by Tab, nor read out: only the window and Paprika's bar are
    for (const under of document.querySelectorAll("header.top, .spice > .sp-side, .spice .sp-grid")) under.inert = !!def;
    if (!def) {
      if (shown) {
        shown = null;
        body.replaceChildren();
        from?.isConnected && from.focus?.({ preventScroll: true });
      }
      return;
    }
    if (shown !== id) {
      from = document.activeElement;
      shown = id;
      if (!parts.has(id)) parts.set(id, def.make());
      body.replaceChildren(parts.get(id).el);
      win.className = `sp-win is-${def.size ?? "m"}`;
      win.dataset.win = id;
      seen = undefined;
      requestAnimationFrame(() => win.focus({ preventScroll: true }));
    }
    const part = parts.get(id);
    eyebrow.textContent = (typeof def.eyebrow === "function" ? def.eyebrow() : def.eyebrow) ?? "";
    eyebrow.hidden = !eyebrow.textContent;
    title.textContent = typeof def.title === "function" ? def.title() : def.title;
    // a window is drawn again when what it shows has changed
    const sig = JSON.stringify([part.sig?.(), spice.armed?.id, [...spice.busy.keys()]]);
    if (part.sig && sig === seen) return;
    seen = sig;
    if (part.update?.() === false) seen = undefined;
  }
  return { el, update };
}
