// The Library's two filters (what: a bookcase or the mini apps; who: a maker, or open weights, or partners): a select in the app's own
// look (the trigger is a .sel-trigger) whose menu has two panes: the choices on the left (a glyph, a name, a second line, a count) and,
// on the right, a PREVIEW of the one under the pointer or the arrows (what is in it: a few of its workflows' pictures, its makers, its
// counts), made by the Library. It floats over the Library's frame; Escape closes it (and only it), as does a press outside.
import { h, icon } from "./dom.js";

/**
 * items: [{ value, label, sub?, count?, glyph?() }] (an item with `rule: true` draws a line above it); preview(item) answers the right
 * pane's element. Answers { el (the trigger), set(value), redraw() }.
 */
export function libraryPick({ label, items, value, onChange, preview }) {
  const trigger = h("button.sel-trigger.lbp-trigger", { type: "button", "aria-haspopup": "listbox", "aria-label": label });
  let list = items;
  let menu = null;
  let rows = [];
  let at = 0;
  let previewing = null;
  const pane = h("div.lbp-preview", { "aria-live": "polite" });
  const current = () => list.find((i) => i.value === value) ?? list[0];

  function draw() {
    const it = current();
    if (!it) return trigger.replaceChildren();
    trigger.replaceChildren(
      it.glyph ? h("span.lbp-glyph", {}, it.glyph()) : null,
      h("span.sel-text", {}, h("span.sel-label", {}, it.short ?? it.label)),
      typeof it.count === "number" ? h("span.lbp-count", {}, String(it.count)) : null,
      h("span.lbp-chev", { "aria-hidden": "true" }, icon("chevron")));
  }

  function show(i) {
    const it = list[i];
    if (!it || previewing === it.value) return;
    previewing = it.value;
    pane.replaceChildren(preview(it));
  }
  function highlight(i, scroll = false) {
    at = (i + list.length) % list.length;
    rows.forEach((r, k) => r.toggleAttribute("data-highlighted", k === at));
    if (scroll) rows[at]?.scrollIntoView({ block: "nearest" });
    show(at);
  }
  function pick(it) {
    value = it.value;
    draw();
    close();
    trigger.focus();
    onChange(it.value);
  }

  const outside = (e) => menu && !menu.contains(e.target) && !trigger.contains(e.target) && close();
  function close() {
    if (!menu) return;
    menu.remove();
    menu = null;
    previewing = null;
    trigger.dataset.state = "closed";
    document.removeEventListener("pointerdown", outside, true);
    window.removeEventListener("resize", close);
  }
  function open() {
    rows = list.map((it, i) => {
      const row = h(`button.lbp-row${it.rule ? ".has-rule" : ""}`, { type: "button", role: "option", "aria-selected": String(it.value === value), on: { pointerenter: () => highlight(i), click: () => pick(it) } },
        h("span.lbp-glyph", {}, it.glyph ? it.glyph() : null),
        h("span.lbp-text", {}, h("b", {}, it.label), it.sub ? h("em", {}, it.sub) : null),
        typeof it.count === "number" ? h("span.lbp-count", {}, String(it.count)) : null);
      // (the focus stays on the trigger, where the arrows are read)
      row.addEventListener("mousedown", (e) => e.preventDefault());
      return row;
    });
    menu = h("div.lbp-menu", { role: "listbox", "aria-label": label }, h("div.lbp-list", {}, ...rows), pane);
    document.body.append(menu);
    const r = trigger.getBoundingClientRect();
    const w = Math.min(menu.offsetWidth, innerWidth - 16);
    menu.style.left = `${Math.round(Math.max(8, Math.min(r.left, innerWidth - w - 8)))}px`;
    menu.style.top = `${Math.round(r.bottom + 8)}px`;
    menu.style.maxHeight = `${Math.round(innerHeight - r.bottom - 24)}px`;
    trigger.dataset.state = "open";
    highlight(Math.max(0, list.findIndex((i) => i.value === value)), true);
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("resize", close);
  }

  trigger.addEventListener("click", () => (menu ? close() : open()));
  trigger.addEventListener("keydown", (e) => {
    if (!menu && ["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) return (e.preventDefault(), open());
    if (!menu) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") (e.preventDefault(), highlight(at + (e.key === "ArrowDown" ? 1 : -1), true));
    else if (e.key === "Enter" || e.key === " ") (e.preventDefault(), pick(list[at]));
    // (it closes alone: the Library's frame stays)
    else if (e.key === "Escape") (e.preventDefault(), e.stopPropagation(), close());
    else if (e.key === "Tab") close();
  });
  draw();

  return {
    el: trigger,
    /** Chooses a value from outside (a filter cleared, the mini apps asked for), without telling onChange. */
    set(v) {
      value = v;
      draw();
    },
    /** The choices again (their counts changed). */
    redraw(next = list) {
      list = next;
      draw();
    },
    close,
  };
}
