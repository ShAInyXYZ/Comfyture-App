// The Shelf's BOOKCASE: a book for every tool, on three walnut shelves, coloured by the workspace the tool belongs to. Read from the
// live registry (a tool registered later gets its book), grouped by workspace in the panel's order, each group with a brass plate on the
// shelf's edge that opens its workspace. A book is bound blind (design D, css/ut-shelf.css): its cloth and its height come from its id (the
// same every time), its name is pressed up its spine (the book as thick as its lines), the logo of the maker of its model is pressed at its
// head (the knowledge says which model it runs: utensils-knowledge.js toolMakers), else its section's icon. Pointing at a book (or reaching it with the keyboard) pulls it out a little and opens its preview card: what the
// tool does, which workspace it belongs to, how it runs, and a key that opens it there; a click opens it at once (on a touch screen
// the first tap shows the card, the second opens). The books are sized to fit: when a shelf is too full they get thinner, never hidden.
import { h, icon, sprite } from "./dom.js";
import { toolsOf, setWorkspace } from "./utensils.js";
import { WORKSPACES } from "./utensils-harness.js";
import { openTool } from "./utensils-home-ui.js";
import { wayOf, MARK } from "./utensils-home-facts.js";
import { apps, loadApps } from "./utensils-templates-api.js";
import { previewOf, colorOf, sectionOf } from "./utensils-shelf-show.js";
import { bookLook, prop as propImg, placeCard, fitSpines } from "./utensils-books.js";
import { toolMakers } from "./utensils-knowledge.js";

/** Who made each tool's model (tool id -> maker id), once the knowledge has answered. */
let makers = null;

/** The workspaces whose tools are books (Home and Shelf are of every workspace). */
const SECTIONS = WORKSPACES.filter((w) => w.color);
/** The props at the ends of the shelves: one per end, dropped when the shelf has no room for it. `hang`: it hangs from the shelf above. */
const PROPS = [
  [{ id: "plant", w: 0.95 }, { id: "globe", w: 0.85 }],
  [{ id: "ivy", w: 0.85, hang: true }, { id: "lamp", w: 0.8 }],
  [{ id: "bookend", w: 0.55 }, { id: "raccoon", w: 0.85 }],
];

/**
 * What a spine says when the tool's whole name is too long to run up a book: the words that name it (the whole name is on the preview
 * card, and is the book's label). A tool that is not here, a new one, shows its own short name or its name.
 */
const SPINE = {
  "sfx": "Sound effect", "au-master": "Master", "au-clean": "Clean up", "au-voice": "Voice", "au-clone": "Voice clone", "au-stems": "Split stems", "au-beat": "Find the beat", "au-mix": "Mixing strip",
  "vfx-remove": "Remove object", "vfx-background": "Background", "vfx-chroma": "Green screen", "vfx-weather": "Rain, snow, fog", "vfx-retouch": "Retouch", "vfx-grade": "Colour grade", "vfx-sparks": "Sparks", "vfx-slowmo": "Slow motion",
  "ed-reframe": "Crop", "ed-speed": "Speed", "ed-merge": "Merge", "ed-captions": "Captions", "ed-grade": "Grade", "ed-logo": "Logo", "ed-audio": "Audio", "ed-convert": "Convert", "ed-gif": "GIF",
  "upscale-video": "Upscale video", "cutout": "Remove background", "edit": "Edit with words",
};

/** The books of a workspace: its tools (not the mini apps, which are the Library's own), and for the Library its two volumes. */
function booksOf(ws) {
  if (ws !== "templates") return toolsOf(ws).map((t) => ({ tool: t, id: t.id, name: SPINE[t.id] ?? t.short ?? t.name, full: t.name, hint: t.hint ?? "", icon: t.icon, ws, way: wayOf(t) }));
  // the Library (workspace id "templates") is a catalogue, not tools: two volumes, the mini apps and every workflow (its generic tool is not a book)
  const own = toolsOf(ws).filter((t) => t.id !== "template").map((t) => ({ tool: t, id: t.id, name: SPINE[t.id] ?? t.short ?? t.name, full: t.name, hint: t.hint ?? "", icon: t.icon, ws, way: wayOf(t) }));
  return [
    { id: "vol-apps", name: "Mini apps", full: apps.total ? `${apps.total} mini apps` : "Mini apps", hint: "A ready-made ComfyUI workflow with one form: a picture in, a result out", icon: "tool-templates", ws, way: "cloud", open: () => (setWorkspace("templates"), document.dispatchEvent(new CustomEvent("utensils:apps"))) },
    { id: "vol-templates", name: "Library", full: "Every official ComfyUI workflow", hint: "The whole library of ComfyUI's workflows, a book each, run on Comfy Cloud", icon: "tool-templates", ws, way: "cloud", open: () => (setWorkspace("templates"), document.dispatchEvent(new CustomEvent("utensils:library"))), count: true },
    ...own,
  ];
}

/** The groups split over three shelves in their order, the fullest shelf as light as it can be (by the room the books take). */
function shelves(groups) {
  const weight = (g) => g.books.reduce((n, b) => n + b.thick + 0.35, 0) + 3;
  const w = groups.map(weight);
  const sum = (a, b) => w.slice(a, b).reduce((n, x) => n + x, 0);
  let best = null;
  for (let i = 1; i < groups.length - 1; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      const worst = Math.max(sum(0, i), sum(i, j), sum(j, groups.length));
      if (!best || worst < best.worst) best = { worst, cut: [i, j] };
    }
  }
  if (!best) return [groups, [], []];
  const [i, j] = best.cut;
  return [groups.slice(0, i), groups.slice(i, j), groups.slice(j)];
}

export function bookcase() {
  const el = h("div.usb-case", { role: "group", "aria-label": "The bookcase: a book for every tool" });
  const card = h("div.usb-card", { role: "dialog", "aria-hidden": "true" });
  let books = [];
  let showing = null;
  let hideTimer = 0;
  let armed = null; // a book a touch has shown (the next tap on it opens it)

  /** A book: a button bound as a spine (design D, css/ut-shelf.css): its name is its text, its maker's logo pressed at its head. */
  function bookEl(b, color) {
    const look = bookLook(b.id, color);
    const maker = makers?.get(b.id) ?? null;
    const name = (b.count ? (templatesCount ? `${templatesCount} workflows` : b.name) : b.name).replace(/-/g, "\u2011");
    const el = h("button.usb-book", {
      type: "button",
      dataset: { tool: b.id, ws: b.ws, ...(maker ? { maker } : {}) },
      "aria-label": `${b.full}, ${sectionOf(b.ws).name}: ${b.hint}`,
      style: { "--c": look.color, "--h": look.h.toFixed(3), "--w": `calc(${(look.w * 0.92).toFixed(2)} * var(--bk, 13px))` },
      on: {
        click: (e) => go(b, el, e),
        pointerenter: (e) => e.pointerType !== "touch" && show(b, el),
        pointerleave: () => later(),
        pointerdown: (e) => (armed = e.pointerType === "touch" ? (showing?.b === b ? b : "show") : null),
        focus: () => show(b, el),
        blur: () => later(),
      },
    },
    maker ? null : h("span.usb-ico", {}, sprite(b.icon)),
    name);
    b.el = el;
    return el;
  }

  /** Opens a book's tool; a first touch only shows its card. */
  function go(b, el, e) {
    if (armed === "show") {
      armed = null;
      e.preventDefault();
      show(b, el);
      return;
    }
    armed = null;
    hide(true);
    b.open ? b.open() : openTool(b.tool);
  }

  // ------------------------------------------------------------ the preview card

  function show(b, el) {
    clearTimeout(hideTimer);
    if (showing?.b === b) return;
    showing?.el.classList.remove("is-out");
    showing = { b, el };
    el.classList.add("is-out");
    const s = sectionOf(b.ws);
    card.style.setProperty("--sec", colorOf(b.ws));
    card.replaceChildren(
      h("div.usb-card-pic", {}, b.tool ? previewOf(b.tool) : previewOf({ id: b.id, workspace: "templates", icon: b.icon })),
      h("div.usb-card-text", {},
        h("div.usb-card-top", {}, h("b", {}, b.full), h("span.usb-chip", {}, s.name)),
        h("p", {}, b.hint),
        h("div.usb-card-keys", {},
          h(`span.ut-hm-mark.is-${b.way}`, {}, MARK[b.way] ?? "Cloud"),
          h("button.usb-open", { type: "button", on: { click: () => (hide(true), b.open ? b.open() : openTool(b.tool)) } }, `Open in ${s.name}`, icon("next")))));
    card.setAttribute("aria-hidden", "false");
    card.setAttribute("aria-label", b.full);
    card.classList.add("is-on");
    place(el);
  }
  /** The card sits above its book, inside the screen; below it when there is no room above. */
  const place = (el) => placeCard(card, el, { mode: "above" });
  /** The card stays while the pointer is on it or on its book. */
  const later = () => {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (card.matches(":hover") || showing?.el.matches(":hover, :focus-visible")) return;
      hide();
    }, 180);
  };
  function hide(now = false) {
    clearTimeout(hideTimer);
    showing?.el.classList.remove("is-out");
    showing = null;
    card.classList.remove("is-on");
    card.setAttribute("aria-hidden", "true");
    if (now) card.replaceChildren();
  }
  card.addEventListener("pointerleave", later);
  card.addEventListener("pointerenter", () => clearTimeout(hideTimer));
  window.addEventListener("scroll", () => showing && hide(), { passive: true });

  // ------------------------------------------------------------ the keyboard: along the shelf, and up and down to the nearest book

  el.addEventListener("keydown", (e) => {
    const at = books.findIndex((b) => b.el === document.activeElement);
    if (at < 0) return;
    let to = null;
    if (e.key === "ArrowRight") to = books[at + 1];
    else if (e.key === "ArrowLeft") to = books[at - 1];
    else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      const row = books[at].row + (e.key === "ArrowDown" ? 1 : -1);
      const x = books[at].el.getBoundingClientRect().left;
      to = books.filter((b) => b.row === row).sort((a, c) => Math.abs(a.el.getBoundingClientRect().left - x) - Math.abs(c.el.getBoundingClientRect().left - x))[0];
    } else if (e.key === "Escape") return hide();
    if (!to) return;
    e.preventDefault();
    to.el.focus();
  });

  // ------------------------------------------------------------ the shelves

  let templatesCount = null;
  function build(total) {
    loadApps();
    templatesCount = total;
    hide(true);
    const groups = SECTIONS.map((w) => ({ w, books: booksOf(w.id) })).filter((g) => g.books.length);
    // (a book is as thick as its name's lines: about one line for every twelve letters, or its own look when thicker)
    for (const g of groups) for (const b of g.books) b.thick = Math.max(bookLook(b.id, g.w.color).w * 0.92, Math.ceil(String(b.name).length / 12) * 1.05 + 0.5);
    const rows = shelves(groups);
    books = [];
    el.replaceChildren(...rows.map((row, r) => {
      const [left, right] = PROPS[r] ?? [];
      return h("div.usb-row", { dataset: { row: String(r) } },
        h("div.usb-inner", {},
          left ? prop(left, "is-left") : null,
          // the groups share the middle of the shelf; the props keep its ends
          h("div.usb-mid", {}, ...row.map((g) => h("div.usb-group", { dataset: { ws: g.w.id }, style: { "--sec": g.w.color } },
            h("div.usb-books", {}, ...g.books.map((b) => (books.push(Object.assign(b, { row: r })), bookEl(b, g.w.color)))),
            h("button.usb-plate", { type: "button", title: `Open ${g.w.name}`, on: { click: () => setWorkspace(g.w.id) } }, h("span", {}, g.w.name))))),
          right ? prop(right, "is-right") : null),
        h("div.usb-plank", { "aria-hidden": "true" }));
    }), card);
    fit();
  }
  const prop = (p, side) => propImg(p, side);

  // ------------------------------------------------------------ the fit: a size for the books that fills the shelves without spilling

  let fitting = 0;
  function fit() {
    cancelAnimationFrame(fitting);
    fitting = requestAnimationFrame(() => {
      const rows = [...el.querySelectorAll(".usb-row")];
      if (!rows.length || !el.offsetHeight) return;
      const rowH = rows[0].offsetHeight;
      // the type of the spines follows the height of a shelf; it gets smaller only when a shelf has no room left
      let size = Math.max(9, Math.min(19, rowH * 0.095));
      el.style.setProperty("--bk", `${size}px`);
      for (const p of el.querySelectorAll(".usb-prop")) p.hidden = false;
      // a shelf is too full when its books need more room than its middle has (the groups keep a little air between them)
      const over = () => rows.some((r) => {
        const mid = r.querySelector(".usb-mid");
        const need = [...mid.children].reduce((n, g) => n + g.scrollWidth, 0) + (mid.childElementCount - 1) * size * 1.6;
        return need > mid.clientWidth + 1;
      });
      // the props go first (the outer ones, shelf by shelf), then the books get thinner
      for (const p of [...el.querySelectorAll(".usb-prop")].reverse()) if (over()) p.hidden = true;
      for (let i = 0; i < 14 && over(); i++) {
        size -= 0.5;
        el.style.setProperty("--bk", `${size}px`);
      }
      // a spine whose longest word does not fit stands taller first, then runs it in a smaller face (utensils-books.js)
      fitSpines([...el.querySelectorAll(".usb-book")], { taller: true });
      // the props that have room again come back
      for (const p of el.querySelectorAll(".usb-prop[hidden]")) {
        p.hidden = false;
        if (over()) p.hidden = true;
      }
    });
  }
  new ResizeObserver(() => fit()).observe(el);
  // the makers' logos come with the knowledge: the books are given them (a tool with a maker loses its section's icon for the logo)
  toolMakers().then((map) => {
    makers = map;
    for (const b of books) {
      const m = map.get(b.id);
      if (!m || !b.el) continue;
      b.el.dataset.maker = m;
      b.el.querySelector(":scope > .usb-ico")?.remove();
    }
  });
  // the spines are measured in the app's own face: they are measured again once it has come
  document.fonts?.ready.then(() => fit());
  document.fonts?.addEventListener?.("loadingdone", () => fit());

  return { el, build, hide, fit };
}
