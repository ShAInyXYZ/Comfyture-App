// The LIBRARY's hall: every official ComfyUI workflow of Comfy Cloud (api/utensils/templates/library, server/comfy-templates.ts) as a
// book, in a hall of walnut bookcases, one bookcase per Cloud category under its carved sign ("IMAGE · 209"). A book's cloth is its
// category's colour (a shade of it from the workflow's name), its title runs up its spine, a gold foil says APP (one of ComfyUI's mini
// apps) or API (a partner service). The hall walks sideways: the bookcases stand side by side as tall as the screen, so each shows all
// its shelves and its sign at once and a book's card has room beside it; the wheel, the arrows and the category chips move along.
// Above the hall the filters: a search that also understands jobs (the knowledge's search: "make my photo move" finds image to video),
// the categories with live counts, Open weights | Partner, Mini apps.
// Pointing at a book (or reaching it with the keyboard) pulls it out and opens its INFO CARD beside it: the workflow's own picture,
// what it does and HOW IT WORKS (the knowledge base, knowledge/utensils/workflows.json, served at api/utensils/knowledge/wf:<name>;
// until it answers, the template's own description), what it takes and gives, its models, what it costs, its official tutorial, and
// two keys: open it (the run panel of the Library) and ask Truffle about it (the question goes in her bar, sent when you send it).
//
// HIGHLIGHT HOOK (for Truffle's guide, web/js/utensils-guide.js):
//  - every book is <button class="usb-book lb-book" data-workflow="<template name>" data-id="wf:<template name>"> (a mini app's also
//    data-app="<app id>"); the books of a bookcase hidden by the filters are off the page until it shows again. A guide may set the
//    class `is-guided` and the custom property `--guide-step` (an integer) on it: the hall never makes a book again, it only moves it
//    from shelf to shelf, so what is set on a book stays; `.lb-book.is-guided` is pulled out and numbered by css/ut-library.css, which
//    a guide may restyle.
//  - revealWorkflow(name, { pulse = true }) (exported here and from utensils-space-templates.js): opens the Library, clears what
//    would hide the book, walks the hall to it, pulls it out and outlines it (and pulses it once). Answers a promise of its element.
import { h, icon, sprite } from "./dom.js";
import { changed } from "./store.js";
import { setWorkspace } from "./utensils.js";
import { apps, loadApps } from "./utensils-templates-api.js";
import { bookLook, prop, placeCard } from "./utensils-books.js";
import { searchKnowledge, knowledgeOf } from "./utensils-knowledge.js";

/** The Cloud categories as bookcases: the colour of their cloth, their sign, the icon on their spines. */
const CATS = {
  "Image": { color: "#b8742f", sign: "Image", icon: "image-library" },
  "Image Tools": { color: "#2f8f86", sign: "Image tools", icon: "image-library" },
  "Video": { color: "#a8253a", sign: "Video", icon: "film-make" },
  "Video Tools": { color: "#2b7a93", sign: "Video tools", icon: "film-make" },
  "Audio": { color: "#6f4bc9", sign: "Audio", icon: "audio-music" },
  "3D Model": { color: "#4f6a9c", sign: "3D model", icon: "tool-templates" },
  "Vector": { color: "#a24c78", sign: "Vector", icon: "image-edit" },
  "Product & Ads": { color: "#8c7a2a", sign: "Product & ads", icon: "image-library" },
  "Character & Fashion": { color: "#7b3a6c", sign: "Character & fashion", icon: "image-library" },
  "Brand & Design": { color: "#3a5bb5", sign: "Brand & design", icon: "image-edit" },
  "LLM": { color: "#5b6170", sign: "LLM", icon: "tool-templates" },
  "Node Basics": { color: "#5b6170", sign: "Basics", icon: "tool-templates" },
};
const OTHER = { color: "#6a6a72", sign: "Other", icon: "tool-templates" };
const catOf = (name) => CATS[name] ?? { ...OTHER, sign: name };
/** The props that fill a shelf with room to spare (a small bookcase, a shelf left short). */
const PROPS = [{ id: "plant", w: 0.9 }, { id: "globe", w: 0.8 }, { id: "bookend", w: 0.55 }, { id: "lamp", w: 0.78 }, { id: "raccoon", w: 0.8 }];
const KIND_WORD = { image: "a picture", video: "a clip", audio: "a sound", text: "words", words: "words", "3d": "a 3D model", mask: "a mask", none: "nothing" };
const KIND_ICON = { image: "image", video: "video", audio: "sound", text: null, words: null, "3d": null };
const SHELF_H = 168;

// ---------------------------------------------------------------- the knowledge (utensils-knowledge.js): the descriptions until it answers

/** The workflows the knowledge finds for a job, by template name (none when it has nothing, or does not answer). */
async function jobSearch(q) {
  const hits = await searchKnowledge(q, { k: 48, kind: "workflow" });
  return hits.map((e) => String(e.id ?? "")).filter((id) => id.startsWith("wf:")).map((id) => id.slice(3));
}

/** How it works, when the knowledge base has not said: from what the catalogue knows (its models, where it runs, what it takes). */
function plainHow(it) {
  const runs = it.partner ? "a partner service, through Comfy Cloud" : "Comfy Cloud's GPUs, with open models";
  const models = it.models.length ? `${it.models.slice(0, 2).join(" and ")} ` : "";
  return `${models ? `It runs ${models}on ${runs}` : `It runs on ${runs}`}: it takes ${words(it.inputs)} and gives ${words(it.outputs)}.`;
}
const words = (list) => {
  const w = [...new Set((list ?? []).map((k) => KIND_WORD[k] ?? k))];
  return w.length > 1 ? `${w.slice(0, -1).join(", ")} and ${w.at(-1)}` : w[0] ?? "nothing";
};

// ---------------------------------------------------------------- the hall

let current = null; // the hall that is on the page (made once by the Library workspace)
let pending = null; // a book asked to be shown before the hall had it

/**
 * Opens the Library and walks its hall to a workflow's book: it is pulled out and outlined (and pulses once when `pulse`). Filters that
 * would hide it are cleared. Answers a promise of the book's element (null when the catalogue has no such workflow).
 */
export function revealWorkflow(name, { pulse = true } = {}) {
  setWorkspace("templates");
  return new Promise((done) => {
    pending = { name, pulse, done };
    requestAnimationFrame(() => current?.reveal());
  });
}

/**
 * The hall. `open(name)` opens a workflow (the Library's run panel); `ask(text)` puts a question in Truffle's bar. Answers
 * { el, update, count, filterApps, reveal, hideCard, setOpen }.
 */
export function libraryHall({ open, ask }) {
  const st = { state: "idle", data: null, q: "", found: null, weights: false, partner: false, apps: false };
  const books = new Map(); // name -> { it, el }
  const cases = new Map(); // category -> { el, shelves, count, chip }

  const search = h("input.lb-search", { type: "search", placeholder: "Search the workflows: a model, a job, what you give it…", "aria-label": "Search the workflows", autocomplete: "off", spellcheck: false });
  const found = h("span.lb-found", { role: "status" });
  const chips = h("div.lb-chips", { role: "group", "aria-label": "Bookcases" });
  const toggles = h("div.lb-toggles", { role: "group", "aria-label": "Filters" });
  const hall = h("div.lb-hall", { tabindex: "-1", "aria-label": "The hall: a bookcase per category" });
  const row = h("div.lb-cases", {});
  const left = h("button.lb-arrow.is-l", { type: "button", title: "Walk left", "aria-label": "Walk left", on: { click: () => walk(-1) } }, icon("next"));
  const right = h("button.lb-arrow.is-r", { type: "button", title: "Walk right", "aria-label": "Walk right", on: { click: () => walk(1) } }, icon("next"));
  const empty = h("div.lb-empty", { hidden: true });
  const card = h("div.lb-card", { role: "dialog", "aria-hidden": "true" });
  hall.append(row);
  const el = h("section.lb", { "aria-label": "The Library" },
    h("div.lb-bar", {},
      h("label.lb-searchbox", {}, icon("search"), search, found),
      toggles),
    chips,
    h("div.lb-hallwrap", {}, hall, left, right, empty),
    card);

  // ------------------------------------------------------------ the catalogue

  function load() {
    if (st.state === "loading" || st.state === "ready") return;
    st.state = "loading";
    empty.hidden = false;
    empty.replaceChildren(h("span.lamp", { dataset: { tone: "busy" } }), h("span", {}, "Opening the Library…"));
    fetch("api/utensils/templates/library")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data) => {
        st.data = data;
        st.state = "ready";
        build();
        changed("utensils");
      })
      .catch(() => {
        st.state = "none";
        empty.hidden = false;
        empty.replaceChildren(sprite("tool-templates"), h("span", {}, "The Library needs Comfy Cloud's catalogue: it could not be read. Try again in a moment."), h("button.lb-retry", { type: "button", on: { click: () => ((st.state = "idle"), load()) } }, "Try again"));
      });
  }

  // the mini apps are the live list (the ones Comfy Cloud can drive); until it has come, the catalogue's own word
  const appsKey = () => apps.list.map((a) => a.id).join();
  const appNames = () => new Set(apps.list.length ? apps.list.map((a) => a.name) : (st.data?.items ?? []).filter((i) => i.isApp).map((i) => i.name));

  /** A book: a thin spine in its category's cloth, its title up it, APP or API in gold at its foot. */
  function bookEl(it, isApp) {
    const c = catOf(it.category);
    const look = bookLook(it.name, c.color, { thin: true });
    const lines = it.title.length > 31 ? 3 : 2;
    const w = Math.max(1.72 + look.w * 0.62, lines === 3 ? 2.62 : 1.95);
    const foil = isApp ? "APP" : it.partner ? "API" : null;
    const book = h(`button.usb-book.lb-book.is-${look.tex}`, {
      type: "button",
      tabindex: "-1",
      dataset: { workflow: it.name, id: `wf:${it.name}`, cat: it.category },
      "aria-label": `${it.title}, ${c.sign}${foil ? `, ${foil === "APP" ? "a mini app" : "a partner service"}` : ""}`,
      style: { "--c": look.color, "--h": look.h.toFixed(3), "--w": `${w.toFixed(2)}em` },
      on: {
        click: (e) => go(it, book, e),
        pointerenter: (e) => e.pointerType !== "touch" && show(it, book),
        pointerleave: () => later(),
        pointerdown: (e) => (armed = e.pointerType === "touch" ? (showing?.it === it ? it : "show") : null),
        focus: () => (rove(book), show(it, book)),
        blur: () => later(),
      },
    },
    h("i.usb-band.is-top"),
    h("span.usb-ico", {}, sprite(c.icon)),
    h("span.usb-name", {}, it.title),
    foil ? h(`span.lb-foil.is-${foil.toLowerCase()}`, {}, foil) : null,
    h("i.usb-band.is-bottom"));
    return book;
  }

  /** The bookcases and their books, made once; the filters and the screen's height only move books between shelves. */
  function build() {
    const { data } = st;
    const appSet = appNames();
    row.replaceChildren();
    books.clear();
    cases.clear();
    const byCat = new Map(data.categories.map((c) => [c.name, []]));
    for (const it of data.items) (byCat.get(it.category) ?? byCat.set(it.category, []).get(it.category)).push(it);
    for (const [name, list] of byCat) {
      if (!list.length) continue;
      list.sort((a, b) => b.usage - a.usage || a.title.localeCompare(b.title));
      const c = catOf(name);
      const count = h("span.lb-sign-count", {}, String(list.length));
      const shelves = h("div.lb-shelves", {});
      const box = h("div.lb-case", { dataset: { cat: name }, style: { "--sec": c.color } },
        h("div.lb-sign", {}, h("span.lb-sign-in", {}, h("span.lb-sign-ico", {}, sprite(c.icon)), h("b", {}, c.sign), h("span.lb-sign-dot", {}, "·"), count)),
        h("div.lb-frame", {}, shelves));
      for (const it of list) books.set(it.name, { it, el: bookEl(it, appSet.has(it.name)), cat: name });
      cases.set(name, { el: box, shelves, count, list, chip: null });
      row.append(box);
    }
    empty.hidden = true;
    refreshFoils();
    apply();
    if (pending) reveal();
  }

  /** The apps' gold foil, once the apps' list has come (it may come after the hall). */
  function refreshFoils() {
    if (st.state !== "ready") return;
    const appSet = appNames();
    const ids = new Map(apps.list.map((a) => [a.name, a.id]));
    for (const { it, el: b } of books.values()) {
      const want = appSet.has(it.name) ? "APP" : it.partner ? "API" : null;
      // (an app's book also carries its app's id: the Shelf's and Home's links name apps by it)
      if (ids.has(it.name)) b.dataset.app = ids.get(it.name);
      else delete b.dataset.app;
      const has = b.querySelector(".lb-foil");
      if ((has?.textContent ?? null) === want) continue;
      has?.remove();
      if (want) b.insertBefore(h(`span.lb-foil.is-${want.toLowerCase()}`, {}, want), b.lastElementChild);
    }
    drawToggles();
    if (st.apps) apply();
  }

  // ------------------------------------------------------------ the filters

  function visible(it, appSet) {
    if (st.found && !st.found.has(it.name)) return false;
    if (st.apps && !appSet.has(it.name)) return false;
    if (st.weights && !st.partner && it.partner) return false;
    if (st.partner && !st.weights && !it.partner) return false;
    return true;
  }

  /** The words a book is found by: its title, its description, its tags, its models, its category. */
  const hay = new Map();
  const textOf = (it) => hay.get(it.name) ?? hay.set(it.name, `${it.title} ${it.name} ${it.description} ${it.tags.join(" ")} ${it.models.join(" ")} ${it.category}`.toLowerCase()).get(it.name);

  let asked = 0;
  async function runSearch() {
    const q = search.value.trim();
    st.q = q;
    const token = ++asked;
    if (!q) {
      st.found = null;
      apply();
      return;
    }
    const ws = q.toLowerCase().split(/[\s,]+/).filter(Boolean);
    const local = new Set(st.data.items.filter((it) => ws.every((w) => textOf(it).includes(w))).map((it) => it.name));
    st.found = local;
    apply(true);
    // the knowledge's search understands a job ("make my photo move"): what it finds joins what the words found
    const job = await jobSearch(q);
    if (token !== asked || !job.length) return;
    st.found = new Set([...local, ...job.filter((n) => books.has(n))]);
    apply(true);
  }
  let typing = 0;
  search.addEventListener("input", () => {
    clearTimeout(typing);
    typing = setTimeout(runSearch, 220);
  });
  search.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && search.value) ((search.value = ""), runSearch());
    if (e.key === "Enter") {
      const first = [...row.querySelectorAll(".lb-book")].find((b) => b.offsetParent);
      if (first) first.focus();
    }
  });

  function drawToggles() {
    const n = st.state === "ready" ? appNames().size : apps.total || 0;
    const t = (on, label, title, flip, extra) => h(`button.lb-toggle${extra ?? ""}`, { type: "button", "aria-pressed": String(on), title, on: { click: flip } }, label);
    toggles.replaceChildren(
      t(st.weights, "Open weights", "Only the workflows that run open models on Comfy Cloud's GPUs", () => ((st.weights = !st.weights), apply(true))),
      t(st.partner, "Partner", "Only the workflows a partner service runs (they bill partner credits)", () => ((st.partner = !st.partner), apply(true))),
      h(`button.lb-toggle.is-apps`, { type: "button", "aria-pressed": String(st.apps), title: "Only the mini apps: a workflow with one simple form", on: { click: () => filterApps(!st.apps) } }, h("span.lb-foil.is-app", {}, "APP"), "Mini apps", n ? h("em", {}, String(n)) : null));
  }
  function filterApps(on) {
    st.apps = on;
    drawToggles();
    apply(true);
  }

  /** What the filters show, laid out on the shelves; `jump`: the hall goes back to its start (a new search, a new filter). */
  function apply(jump = false) {
    if (st.state !== "ready") return;
    const appSet = appNames();
    let shown = 0;
    for (const [name, c] of cases) {
      c.shown = c.list.filter((it) => visible(it, appSet));
      shown += c.shown.length;
      c.el.hidden = !c.shown.length;
      c.count.textContent = String(c.shown.length);
    }
    const filtering = !!(st.found || st.apps || st.weights !== st.partner);
    found.textContent = filtering ? `${shown} of ${st.data.total}` : `${st.data.total} workflows`;
    empty.hidden = shown > 0;
    if (!shown) empty.replaceChildren(icon("search"), h("span", {}, st.q ? `No workflow for “${st.q}”. Ask Truffle: she knows what each one does.` : "No workflow passes these filters."), st.q ? h("button.lb-retry", { type: "button", on: { click: () => ask(`Which workflow should I use to ${st.q}?`) } }, "Ask Truffle") : null);
    drawChips();
    layout();
    if (jump) hall.scrollTo({ left: 0 });
    edges();
  }

  function drawChips() {
    const list = [...cases.entries()];
    const filtering = !!(st.found || st.apps || st.weights !== st.partner);
    const shown = list.reduce((n, [, c]) => n + (c.shown?.length ?? 0), 0);
    chips.replaceChildren(
      h("button.lb-chip.is-all", { type: "button", "aria-pressed": String(!filtering), title: filtering ? "Show every workflow again" : "Every workflow", on: { click: () => clearFilters() } }, "All", h("em", {}, String(filtering ? `${shown}/${st.data.total}` : st.data.total))),
      ...list.map(([name, c]) => h("button.lb-chip", { type: "button", dataset: { cat: name }, disabled: !c.shown?.length, style: { "--sec": catOf(name).color }, title: `Walk to ${catOf(name).sign}`, on: { click: () => goTo(name) } },
        h("i.lb-chip-dot"), catOf(name).sign, h("em", {}, String(c.shown?.length ?? c.list.length)))));
    for (const [name, c] of cases) c.chip = chips.querySelector(`[data-cat="${CSS.escape(name)}"]`);
    markChip();
  }

  // ------------------------------------------------------------ the shelves: as many as the hall's height holds

  let fitting = 0;
  let laidAt = "";
  const layout = () => (cancelAnimationFrame(fitting), (fitting = requestAnimationFrame(() => layoutNow())));
  /** The books on as many shelves as the hall's height holds (3 to 6), each bookcase's shelves as long as one another. */
  function layoutNow(force = false) {
    cancelAnimationFrame(fitting);
    const first = [...cases.values()].find((c) => !c.el.hidden);
    if (!hall.clientHeight || st.state !== "ready" || !first) return false;
    // the bookcases out of sight are not drawn (content-visibility): they are while the hall is measured
    el.classList.add("is-measuring");
    const room = first.shelves.clientHeight;
    const n = Math.max(3, Math.min(6, Math.floor(room / SHELF_H)));
    const shelfH = room / n;
    const key = [n, Math.round(shelfH), ...[...cases.values()].map((c) => c.shown?.length ?? 0), st.found?.size ?? -1, st.apps, st.weights, st.partner].join();
    if (key === laidAt && !force) {
      el.classList.remove("is-measuring");
      return true;
    }
    laidAt = key;
    el.style.setProperty("--rows", String(n));
    el.style.setProperty("--shelf", `${shelfH.toFixed(2)}px`);
    el.style.setProperty("--bk", `${Math.max(10.5, Math.min(15, shelfH * 0.082)).toFixed(2)}px`);
    for (const [, c] of cases) {
      if (!c.shown?.length) {
        c.shelves.replaceChildren();
        continue;
      }
      const per = Math.ceil(c.shown.length / n);
      const rows = Array.from({ length: n }, (_, r) => c.shown.slice(r * per, (r + 1) * per));
      c.shelves.replaceChildren(...rows.map((list, r) => {
        // a shelf with room to spare (a small bookcase, the last shelf of one) has a prop at its end
        const spare = list.length < per - 3 || per < 5;
        const p = spare ? PROPS[(r + c.list.length) % PROPS.length] : null;
        return h("div.usb-row.lb-row", {},
          h("div.usb-inner", {}, h("div.lb-books", {}, ...list.map((it) => books.get(it.name).el)), p ? prop(p, r % 2 ? "is-left" : "is-right") : null),
          h("div.usb-plank", { "aria-hidden": "true" }));
      }));
    }
    // each keeps the width it measured, so the hall is as long when they are not drawn
    for (const [, c] of cases) if (!c.el.hidden) c.el.style.setProperty("--cw", `${c.el.offsetWidth}px`);
    el.classList.remove("is-measuring");
    edges();
    markChip();
    rove(rover?.isConnected ? rover : row.querySelector(".lb-book"));
    if (pending) reveal();
    return true;
  }
  new ResizeObserver(() => layout()).observe(hall);

  // ------------------------------------------------------------ walking the hall

  // the wheel walks along the hall (a hall is walked sideways); a trackpad's own sideways swipe stays as it is
  hall.addEventListener("wheel", (e) => {
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.ctrlKey) return;
    if (hall.scrollWidth <= hall.clientWidth) return;
    e.preventDefault();
    hall.scrollLeft += e.deltaY * (e.deltaMode === 1 ? 32 : 1);
  }, { passive: false });
  const walk = (dir) => hall.scrollBy({ left: dir * hall.clientWidth * 0.8, behavior: "smooth" });
  function goTo(name) {
    const c = cases.get(name);
    if (!c || c.el.hidden) return;
    hall.scrollTo({ left: Math.max(0, c.el.offsetLeft - 16), behavior: "smooth" });
  }
  function edges() {
    left.disabled = hall.scrollLeft <= 4;
    right.disabled = hall.scrollLeft + hall.clientWidth >= hall.scrollWidth - 4;
  }
  /** The chip of the bookcase the hall stands at is lit. */
  function markChip() {
    const x = hall.scrollLeft + 40;
    let at = null;
    for (const [name, c] of cases) if (!c.el.hidden && c.el.offsetLeft <= x) at = name;
    at ??= [...cases.keys()].find((n) => !cases.get(n).el.hidden) ?? null;
    for (const [name, c] of cases) c.chip?.setAttribute("aria-current", String(name === at));
  }
  let moving = 0;
  hall.addEventListener("scroll", () => {
    if (showing) hide();
    cancelAnimationFrame(moving);
    moving = requestAnimationFrame(() => (edges(), markChip()));
  }, { passive: true });

  // ------------------------------------------------------------ the keyboard: along a shelf, up and down, Enter opens

  hall.addEventListener("keydown", (e) => {
    const b = document.activeElement;
    if (!b?.classList?.contains("lb-book")) return;
    let to = null;
    if (e.key === "ArrowRight") to = b.nextElementSibling ?? nextShelfFirst(b, 1);
    else if (e.key === "ArrowLeft") to = b.previousElementSibling ?? nextShelfFirst(b, -1);
    else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      const shelf = b.closest(".lb-row");
      const other = e.key === "ArrowDown" ? shelf.nextElementSibling : shelf.previousElementSibling;
      const x = b.getBoundingClientRect().left;
      to = other ? [...other.querySelectorAll(".lb-book")].sort((p, q) => Math.abs(p.getBoundingClientRect().left - x) - Math.abs(q.getBoundingClientRect().left - x))[0] : null;
    } else if (e.key === "Escape") return hide();
    if (!to) return;
    e.preventDefault();
    to.focus({ preventScroll: false });
  });
  // the hall is one stop of the Tab key (the book last reached), not 668: the arrows walk the shelves
  let rover = null;
  function rove(b) {
    if (!b || b === rover) return;
    if (rover) rover.tabIndex = -1;
    rover = b;
    b.tabIndex = 0;
  }
  /** The first book of the next shelf (or the last of the one before), across bookcases. */
  function nextShelfFirst(b, dir) {
    const all = [...row.querySelectorAll(".lb-book")].filter((x) => x.offsetParent);
    const i = all.indexOf(b);
    return all[i + dir] ?? null;
  }

  // ------------------------------------------------------------ the card

  let showing = null;
  let hideTimer = 0;
  let armed = null;
  function go(it, b, e) {
    if (armed === "show") {
      armed = null;
      e.preventDefault();
      show(it, b);
      return;
    }
    armed = null;
    hide(true);
    open(it.name);
  }

  function facts(it, k) {
    const takes = (k?.takes?.length ? k.takes : it.inputs).filter((x) => x !== "none");
    const gives = k?.gives?.length ? k.gives : it.outputs;
    const kinds = (list) => h("span.lb-kinds", {}, ...[...new Set(list)].map((x) => h("span.lb-kind", {}, KIND_ICON[x] ? icon(KIND_ICON[x]) : h("b", {}, x === "3d" ? "3D" : "Aa"), KIND_WORD[x] ?? x)));
    const cost = k?.cost ?? (it.partner ? "partner" : "gpu");
    const credits = k?.credits ?? it.credits;
    const costText = cost === "free" ? "Free, on this machine" : cost === "partner" ? `Partner credits${credits ? ` · ≈ ${credits} cr` : ""}` : `GPU time on Comfy Cloud${credits ? ` · ≈ ${credits} cr` : ""}`;
    const models = (k?.models?.length ? k.models : it.models).slice(0, 4);
    return h("div.lb-facts", {},
      h("div.lb-fact", {}, h("span.lb-k", {}, "Takes"), takes.length ? kinds(takes) : h("span.lb-v", {}, "Nothing: it runs as it is")),
      h("div.lb-fact", {}, h("span.lb-k", {}, "Gives"), kinds(gives)),
      h("div.lb-fact", {}, h("span.lb-k", {}, "Models"), h("span.lb-v", { title: models.join("\n") }, models.length ? models.join(", ") : "Its own")),
      h("div.lb-fact", {}, h("span.lb-k", {}, "Cost"), h(`span.lb-v.is-${cost}`, {}, costText)));
  }

  function fillCard(it, k) {
    const c = catOf(it.category);
    const appSet = appNames();
    const foil = appSet.has(it.name) ? "APP" : it.partner ? "API" : null;
    const thumb = `api/utensils/templates/thumb/${encodeURIComponent(it.name)}`;
    const pic = it.thumbKind === "audio"
      ? h("div.lb-card-pic.is-audio", {}, h("div.lb-card-bars", { "aria-hidden": "true" }, ...Array.from({ length: 34 }, (_, i) => h("i", { style: { height: `${Math.round(20 + 70 * Math.abs(Math.sin(i * 0.55 + it.name.length) * Math.cos(i * 0.21)))}%` } }))),
        h("button.lb-card-play", { type: "button", title: "Hear the example", "aria-label": "Hear the example", on: { click: (e) => hear(e.currentTarget, thumb) } }, icon("play")))
      : h("div.lb-card-pic", {}, h("img", { src: thumb, alt: "", draggable: false, decoding: "async", on: { error: (e) => e.target.replaceWith(h("span.lb-card-ph", {}, sprite(c.icon))) } }),
        it.variant ? h("img.is-after", { src: `${thumb}?n=2`, alt: "", draggable: false, on: { error: (e) => e.target.remove() } }) : null);
    const tutorial = k?.tutorial ?? it.tutorial;
    card.style.setProperty("--sec", c.color);
    card.replaceChildren(
      pic,
      h("div.lb-card-body", {},
        h("div.lb-card-top", {}, h("b.lb-card-title", {}, it.title), h("span.lb-chip-cat", {}, c.sign), foil ? h(`span.lb-foil.is-${foil.toLowerCase()}`, {}, foil) : null),
        h("section.lb-sec", {}, h("span.lb-k", {}, "What it does"), h("p.lb-what", {}, k?.what || it.description)),
        h("section.lb-sec", {}, h("span.lb-k", {}, "How it works"), h("p.lb-how", {}, k?.how || plainHow(it)),
          k?.use?.length ? h("ol.lb-use", { "aria-label": "How to use it" }, ...k.use.slice(0, 3).map((s) => h("li", {}, s))) : null),
        facts(it, k),
        tutorial ? h("a.lb-tutorial", { href: tutorial, target: "_blank", rel: "noopener noreferrer", title: tutorial }, icon("open"), "Official tutorial") : null,
        h("div.lb-card-keys", {},
          h("button.lb-open", { type: "button", on: { click: () => (hide(true), open(it.name)) } }, icon("open"), appSet.has(it.name) ? "Open as app" : "Open it"),
          h("button.lb-ask", { type: "button", title: "Put the question in Truffle's bar: send it when you like", on: { click: () => (hide(true), ask(`How does ${it.title} work and when should I use it?`)) } }, sprite("message"), "Ask Truffle about it"))));
  }

  let hearing = null;
  function hear(button, src) {
    if (hearing && hearing.src !== src) hearing.audio.pause();
    if (!hearing || hearing.src !== src) hearing = { src, audio: new Audio(src) };
    const { audio } = hearing;
    audio.onended = audio.onpause = () => button.replaceChildren(icon("play"));
    audio.onplay = () => button.replaceChildren(icon("pause"));
    audio.paused ? audio.play().catch(() => {}) : audio.pause();
  }

  function show(it, b) {
    clearTimeout(hideTimer);
    if (showing?.it === it) return;
    showing?.b.classList.remove("is-out");
    showing = { it, b };
    b.classList.add("is-out");
    fillCard(it, null);
    card.setAttribute("aria-hidden", "false");
    card.setAttribute("aria-label", it.title);
    card.classList.add("is-on");
    place();
    // the knowledge comes after: what it says takes the place of the description, if the card still shows this book
    knowledgeOf(`wf:${it.name}`).then((k) => {
      if (!k || showing?.it !== it) return;
      fillCard(it, k);
      place();
    });
  }
  const place = () => {
    if (!showing) return;
    const r = hall.getBoundingClientRect();
    placeCard(card, showing.b, { mode: "beside", within: { top: r.top + 4, bottom: r.bottom - 4 } });
  };
  const later = () => {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (card.matches(":hover") || showing?.b.matches(":hover, :focus-visible")) return;
      hide();
    }, 200);
  };
  function hide(now = false) {
    clearTimeout(hideTimer);
    showing?.b.classList.remove("is-out");
    showing = null;
    card.classList.remove("is-on");
    card.setAttribute("aria-hidden", "true");
    if (hearing) hearing.audio.pause();
    if (now) card.replaceChildren();
  }
  card.addEventListener("pointerleave", later);
  card.addEventListener("pointerenter", () => clearTimeout(hideTimer));
  card.addEventListener("keydown", (e) => e.key === "Escape" && (hide(), showing?.b.focus()));

  // ------------------------------------------------------------ the highlight hook: walk to a book and show it

  let revealed = null;
  function reveal() {
    if (!pending || st.state !== "ready" || !hall.clientHeight) return;
    const { name, pulse, done } = pending;
    const book = books.get(name);
    pending = null;
    if (!book) return done?.(null);
    // what would hide it goes
    if (!visible(book.it, appNames())) clearFilters(false);
    layoutNow();
    const b = book.el;
    const hr = hall.getBoundingClientRect();
    const br = b.getBoundingClientRect();
    hall.scrollTo({ left: Math.max(0, hall.scrollLeft + br.left - hr.left - hall.clientWidth / 2 + br.width / 2), behavior: "smooth" });
    revealed?.classList.remove("is-revealed", "is-pulse");
    revealed = b;
    b.classList.add("is-revealed");
    if (pulse) {
      b.classList.remove("is-pulse");
      void b.offsetWidth;
      b.classList.add("is-pulse");
      setTimeout(() => b.classList.remove("is-pulse"), 2600);
    }
    done?.(b);
  }
  // the book shown stays out until the hall is used again
  hall.addEventListener("pointerdown", (e) => revealed && !e.target.closest(".is-revealed") && (revealed.classList.remove("is-revealed", "is-pulse"), (revealed = null)));

  function clearFilters(jump = true) {
    search.value = "";
    st.q = "";
    st.found = null;
    st.apps = false;
    st.weights = st.partner = false;
    asked++;
    drawToggles();
    apply(jump);
  }

  current = { reveal };

  return {
    el,
    /** Draws what has changed: the catalogue is asked once; the apps' foils come with their list. */
    update() {
      load();
      loadApps();
      if (st.state === "ready") {
        if (st.appsKey !== appsKey()) ((st.appsKey = appsKey()), refreshFoils());
        layout();
        if (pending) reveal();
      }
    },
    /** How many workflows the Library holds (null until the catalogue has come). */
    count: () => st.data?.total ?? null,
    sig: () => [st.state, appsKey()].join(),
    filterApps,
    reveal,
    hideCard: () => hide(true),
    /** The book whose run panel is open is marked (and unmarked with null). */
    setOpen(name) {
      for (const { el: b } of books.values()) b.classList.remove("is-open");
      if (name) books.get(name)?.el.classList.add("is-open");
    },
  };
}

/** Puts a question in Truffle's bar (the bar opens, the words wait there: nothing is sent until the person sends it). */
export function askTruffle(text) {
  // (her bar docks in Utensils' page; the one on screen is the one)
  const field = [...document.querySelectorAll(".chat-input")].find((x) => x.offsetParent) ?? document.querySelector(".chat-input");
  if (!field) return;
  if (field.isContentEditable) field.textContent = text;
  else field.value = text;
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.focus();
  const sel = window.getSelection?.();
  if (field.isContentEditable && sel) {
    sel.selectAllChildren(field);
    sel.collapseToEnd();
  }
}
