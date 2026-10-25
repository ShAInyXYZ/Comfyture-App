// The floating windows of Macaron. A bento opens in a centred window over a dimmed screen: the details of
// what the bento shows, with an Advanced switch where the finer controls help. One window is open at a
// time; what is in it is a component ({ el, update, sig }) made once and put back each time it opens.
import { h, icon } from "./dom.js";
import { changed } from "./store.js";
import { macaron } from "./macaron.js";

const defs = new Map();
const parts = new Map();

/**
 * A window the workspaces can open by its id: its title (a small `eyebrow` above it, the brand's name under it), its size
 * (s, m, l, xl, full), whether it has an Advanced switch, how its content is made, the keys it carries beside the switch
 * (`tools`) and the ones at its foot (`foot`: the window's one primary key lives there).
 */
export const defineWindow = (id, def) => defs.set(id, def);

export const isAdvanced = (id = macaron.win) => !!macaron.adv?.[id];
/** A window opens over the screen, or over the window that is open (it comes back when this one is closed). */
export function openWin(id) {
  if (!defs.has(id) || macaron.win === id) return;
  if (macaron.win) (macaron.winStack ??= []).push(macaron.win);
  macaron.win = id;
  changed("macaron");
}
export function closeWin() {
  // (with none open it only draws the page again: what is on screen is brought to what the state says)
  if (macaron.win) macaron.win = macaron.winStack?.pop() ?? null;
  changed("macaron");
}
/** Every window away at once. */
export function closeAll() {
  macaron.winStack = [];
  macaron.win = null;
  changed("macaron");
}
export function toggleAdvanced(id = macaron.win) {
  macaron.adv = { ...(macaron.adv ?? {}), [id]: !isAdvanced(id) };
  changed("macaron");
}

/** The layer the windows are drawn on, and what keeps them up to date. */
export function windowHost() {
  const eyebrow = h("span.mc-win-eyebrow");
  const title = h("h2", { id: "mc-win-title" });
  const sub = h("span.mc-win-sub");
  // the head's keys are made once: a key that is pressed is not made again under the pointer (the window's own keys, if it has any, when it changes)
  const extra = h("div.mc-win-extra");
  const toggle = h("button.mc-switch", { type: "button", role: "switch", title: "Show the finer controls", on: { click: () => toggleAdvanced() } }, h("span", {}, "Advanced"), h("i"));
  const closeKey = h("button.mc-close", { type: "button", title: "Close (Esc)", "aria-label": "Close", on: { click: closeWin } }, icon("close"));
  const tools = h("div.mc-win-tools", {}, extra, toggle, closeKey);
  const body = h("div.mc-win-body");
  const foot = h("footer.mc-win-foot", { hidden: true });
  const win = h("section.mc-win", { role: "dialog", "aria-modal": "true", "aria-labelledby": "mc-win-title", tabindex: "-1" }, h("header.mc-win-head", {}, h("div.mc-win-title", {}, eyebrow, title, sub), tools), body, foot);
  const veil = h("div.mc-veil", { on: { pointerdown: (e) => e.target === veil && closeWin() } });
  const el = h("div.mc-winhost", { hidden: true }, veil, win);
  let shown = null;
  let from = null;
  let seen;

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !macaron.win || document.querySelector(".mc-pop")) return;
    // a field that is being typed in lets go first
    if (e.target.closest?.("input, textarea, select") && e.target !== document.body) return void e.target.blur();
    closeWin();
  });

  function update() {
    const id = macaron.win;
    const def = id && defs.get(id);
    el.hidden = !def;
    document.body.classList.toggle("mc-has-win", !!def);
    // what is under a window is not reached by Tab, nor read out: only the window and Brioche's bar are
    for (const under of document.querySelectorAll("header.top, .macaron > .mc-side, .macaron .mc-grid")) under.inert = !!def;
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
      const part = parts.get(id);
      body.replaceChildren(part.el);
      extra.replaceChildren(...(def.tools?.(part) ?? []));
      foot.replaceChildren(...(def.foot?.(part) ?? []));
      foot.hidden = !foot.childNodes.length;
      win.className = `mc-win is-${def.size ?? "m"}`;
      win.dataset.win = id;
      seen = undefined;
      requestAnimationFrame(() => win.focus({ preventScroll: true }));
    }
    const part = parts.get(id);
    const adv = isAdvanced(id);
    eyebrow.textContent = (typeof def.eyebrow === "function" ? def.eyebrow() : def.eyebrow) ?? "";
    eyebrow.hidden = !eyebrow.textContent;
    title.textContent = typeof def.title === "function" ? def.title() : def.title;
    sub.textContent = def.sub?.() ?? "";
    toggle.hidden = !def.advanced;
    toggle.setAttribute("aria-checked", String(adv));
    // a window is drawn again when what it shows has changed
    const sig = JSON.stringify([adv, part.sig?.()]);
    if (part.sig && sig === seen) return;
    seen = sig;
    if (part.update?.() === false) seen = undefined;
  }
  return { el, update };
}
