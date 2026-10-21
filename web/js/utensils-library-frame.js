// The LIBRARY'S FRAME: the Library is not a workspace at the end of the list but a frame that opens in front of everything, over whichever
// workspace is open (its key in the panel, a pill on Home, a book of the Shelf, a mini app, Truffle). It holds the Library's hall and the
// panel of the workflow opened (utensils-space-templates.js, made once and moved in here), and Truffle's bar, docked at its foot while
// it is open, so the person can look a workflow up or simply ask her. When she answers a job with a recipe, its books COME FORWARD: they
// leave the shelves for a reading table across the front of the frame, face out and numbered, each with why it is there, how to use it
// (three short steps from the knowledge), its price and an Open key; the books stay lit on the shelves behind. The table folds away to
// a slim strip to browse the shelves, and the recipe goes on in the workspaces (utensils-guide.js: its panel, its coach) when a step opens
// a tool. Mockups: docs/brand/products/utensils-v6.
import { h, icon, sprite } from "./dom.js";
import { currentPage } from "./router.js";
import { utensils, closeLibrary } from "./utensils.js";
import { TRUFFLE, WORKSPACES } from "./utensils-harness.js";
import { openStep, hideGuide, foldGuide } from "./utensils-guide.js";
import { totalOf } from "./utensils-guide-plan.js";
import { toolMakers } from "./utensils-knowledge.js";
import { makerById } from "./utensils-makers.js";

let makers = new Map();
toolMakers().then((m) => (makers = m));

/**
 * The frame, made once. `space` is the Library's workspace ({ el, itemOf }), `slot` Truffle's bar's dock (#utensils-chat), `home` the
 * element the dock goes back to when the frame closes. Answers { el, update() }: update() opens or closes it as utensils.library says
 * and draws the reading table when the recipe changed.
 */
export function libraryFrame({ space, slot, home }) {
  const dock = h("div.lbx-dock");
  const table = h("section.lbx-table", { "aria-label": "Truffle's picks", hidden: true });
  const frame = h("section.lbx-frame", { role: "dialog", "aria-modal": "true", "aria-label": "The Library" }, space.el, table, dock);
  const el = h("div.lbx", { hidden: true }, h("div.lbx-back", { "aria-hidden": "true", on: { click: () => closeLibrary() } }), frame);
  // an Escape nothing inside took (the panel of a workflow, a card, the search's words: they stop it) closes the frame, wherever the
  // focus is (a key that was pressed and drawn again leaves it on the page); Truffle's bar keeps its own
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !open || e.defaultPrevented || e.target.closest?.("#assistant, .rcp-coach, .picker, .viewer")) return;
    e.preventDefault();
    // the panel of the workflow open closes first, the frame at the next Escape
    const panel = frame.querySelector(".ut-grid.is-templates.is-picked .ut-tpl-detail .ut-expand");
    if (panel) return panel.click();
    closeLibrary();
  });
  document.body.append(el);
  let open = false;
  let drawn = "";

  /** A step's cloth and maker: a workflow's are its category's and its model's, a tool's its workspace's and its model's. */
  function lookOf(s) {
    if (s.kind === "workflow") {
      const it = space.itemOf?.(s.workflow);
      return { color: it?.color ?? "#3a5bb5", maker: it?.maker ?? null, where: it?.sign ?? "Library" };
    }
    const w = WORKSPACES.find((x) => x.id === s.section);
    return { color: w?.color ?? "#6a6a72", maker: makers.get(s.id) ?? null, where: w?.name ?? "Utensils" };
  }

  /** A book brought forward: its front cover, face out on a stand, its number on it. */
  function cover(s, i, look) {
    return h("button.lbx-cover", { type: "button", title: `Open ${s.name}`, "aria-label": `Book ${i + 1}: open ${s.name}`, dataset: { ...(look.maker ? { maker: look.maker } : {}) }, style: { "--c": look.color }, on: { click: () => openStep(i) } },
      // (a book with no maker shows what it is: its tool's icon, pressed)
      look.maker ? null : h("span.lbx-cover-ico", { "aria-hidden": "true" }, sprite(s.icon)),
      h("span.lbx-cover-title", {}, s.name),
      s.cost === "partner" ? h("span.lbx-cover-foil", {}, "API") : null);
  }

  function pick(s, i, g) {
    const look = lookOf(s);
    const m = look.maker ? makerById(look.maker) : null;
    const now = g.current === i;
    return h(`li.lbx-pick${now ? ".is-now" : ""}`, { style: { "--c": look.color }, dataset: { step: String(i + 1) } },
      h("div.lbx-stand", {}, cover(s, i, look), h("span.lbx-num", { "aria-hidden": "true" }, String(i + 1))),
      h("div.lbx-card", {},
        h("b.lbx-name", {}, s.name),
        m ? h("span.lbx-maker", { dataset: { maker: m.id } }, h("i.lb-maker-logo", { "aria-hidden": "true" }), m.name, m.by ? h("em", {}, `by ${m.by}`) : null)
          : h("span.lbx-maker.is-where", {}, h("i.lbx-dot", { "aria-hidden": "true" }), s.cost === "free" ? `Free ${look.where} tool` : look.where),
        s.why ? h("div.lbx-sec", {}, h("span.lbx-k", {}, "Why"), h("p", {}, s.why)) : null,
        s.use.length ? h("div.lbx-sec", {}, h("span.lbx-k", {}, "How to use it"), h("ol.lbx-use", {}, ...s.use.slice(0, 3).map((u) => h("li", {}, u)))) : null,
        h("div.lbx-foot", {},
          h("div.lbx-cost", {}, h("span.lbx-k", {}, "Cost"), h(`b${s.cost === "free" ? ".is-free" : ""}`, {}, s.price)),
          h("button.lbx-open", { type: "button", on: { click: () => openStep(i) } }, icon("open"), now ? "Here" : "Open"))));
  }

  function drawTable() {
    const g = utensils.guide;
    const sig = JSON.stringify(g ? [g.title, g.steps.map((s) => [s.id, s.price, s.use.length, s.why]), g.current, g.collapsed, makers.size] : null);
    if (sig === drawn) return;
    drawn = sig;
    frame.classList.toggle("has-picks", !!g && !g.collapsed);
    frame.classList.toggle("has-strip", !!g && g.collapsed);
    table.hidden = !g;
    if (!g) return void table.replaceChildren();
    const n = g.steps.length;
    const lead = g.current === null ? "Start with book 1" : g.current + 1 >= n ? `Back to book ${n}` : `Go on with book ${g.current + 1}`;
    const go = g.current === null ? 0 : Math.min(n - 1, g.current);
    if (g.collapsed) {
      // folded: a strip at the foot of the shelves, the books' numbers in their colours, a key to bring them forward again
      table.replaceChildren(h("button.lbx-strip", { type: "button", title: "Bring Truffle's books forward again", on: { click: () => foldGuide(false) } },
        h("img.lbx-face", { src: TRUFFLE.face, alt: "", draggable: false }),
        h("span.lbx-strip-text", {}, h("b", {}, "Truffle's picks"), `${n} ${n === 1 ? "book" : "books"}`),
        h("span.lbx-strip-books", {}, ...g.steps.map((s, i) => h("i", { style: { "--c": lookOf(s).color } }, String(i + 1)))),
        h("span.lbx-strip-go", {}, "Show", icon("chevron"))));
      return;
    }
    const total = totalOf(g.steps);
    table.replaceChildren(
      h("header.lbx-table-head", {},
        h("img.lbx-face", { src: TRUFFLE.face, alt: "", draggable: false }),
        h("div.lbx-title", {}, h("span.lbx-eyebrow", {}, "Truffle's picks"), h("b", {}, g.title)),
        h("button.ut-iconkey.is-quiet", { type: "button", title: "Put the books back on the table's edge (the recipe stays)", "aria-label": "Fold Truffle's picks", on: { click: () => foldGuide(true) } }, icon("chevron")),
        h("button.ut-iconkey.is-quiet", { type: "button", title: "Put the books back on the shelves", "aria-label": "Close Truffle's picks", on: { click: () => hideGuide() } }, icon("close"))),
      h("div.lbx-desk", {},
        h("ol.lbx-picks", { style: { "--n": String(n) } }, ...g.steps.map((s, i) => pick(s, i, g))),
        h("aside.lbx-total", {},
          h("span.lbx-k", {}, "Total"),
          h("b", {}, total.label),
          h("button.lbx-start", { type: "button", on: { click: () => openStep(go) } }, lead, icon("next")))));
  }

  function update() {
    // (it is Utensils' own: on another product's page it waits, closed, until Utensils is back)
    const want = !!utensils.library && currentPage() === "utensils";
    if (want !== open) {
      open = want;
      el.hidden = !open;
      document.body.classList.toggle("has-library", open);
      // Truffle's bar comes into the frame while it is open, and goes back to the foot of the page after
      if (open) dock.append(slot);
      else home.append(slot);
      document.dispatchEvent(new Event("utensils:drawn"));
      if (open) requestAnimationFrame(() => !utensils.guide && !frame.contains(document.activeElement) && space.search?.focus({ preventScroll: true }));
    }
    if (open) drawTable();
  }
  // (the makers of the tools come once: the table is drawn again with their logos)
  toolMakers().then(() => ((drawn = ""), open && drawTable()));
  window.addEventListener("hashchange", () => update());

  return { el, update };
}
