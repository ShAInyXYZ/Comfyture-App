// The LIBRARY's hall: every official ComfyUI workflow of Comfy Cloud (api/utensils/templates/library, server/comfy-templates.ts) as a
// book, in a hall of bookcases, one per Cloud category; it stands in the Library's frame (utensils-library-frame.js), over whichever
// workspace is open, in the app's own look. A book is bound blind (design D): its category's cloth (a shade of it from the workflow's
// name), its title pressed up its spine, the logo of the maker of its model pressed at its head (utensils-makers.js), APP (one of ComfyUI's
// mini apps) or API (a partner service) pressed at its foot; one element. On each shelf the books stand in GROUPS: a maker's together
// (the busiest first), in the order of what they do (text to image, edit, upscale, image to video...), a little apart where what they do
// changes and further apart between makers, each group's label (its logo, its name, what it does) on the shelf's ledge; the makers with
// a book or two in a bookcase join a group of what their books do. The hall walks sideways: the bookcases stand side by side as tall as
// the frame; the wheel and the arrows move along. Above the hall: the title, a search that also understands jobs (the knowledge's search:
// "make my photo move" finds image to video), and two filters, each a dropdown with a preview (utensils-library-pick.js): WHAT (all, the
// mini apps, a bookcase) and WHO (every maker, open weights, partners, a maker).
// Pointing at a book (or reaching it with the keyboard) pulls it out and opens its INFO CARD beside it: the workflow's own picture,
// what it does and HOW IT WORKS (the knowledge base, knowledge/utensils/workflows.json, served at api/utensils/knowledge/wf:<name>;
// until it answers, the template's own description), what it takes and gives, its models, what it costs, its official tutorial, and
// two keys: open it (the run panel of the Library) and ask Truffle about it (the question goes in her bar, sent when you send it).
//
// HIGHLIGHT HOOK (for Truffle's guide, web/js/utensils-guide.js):
//  - every book is <button class="usb-book lb-book" data-workflow="<template name>" data-id="wf:<template name>" data-maker="<maker id>"
//    data-foil="APP|API">, its title its text (a mini app's also data-app="<app id>"); the books of a bookcase hidden by the filters are
//    off the page until it shows again. A guide may set the
//    class `is-guided` and the custom property `--guide-step` (an integer) on it: the hall never makes a book again, it only moves it
//    from shelf to shelf, so what is set on a book stays; `.lb-book.is-guided` is pulled out and numbered by css/ut-library.css, which
//    a guide may restyle.
//  - revealWorkflow(name, { pulse = true }) (exported here and from utensils-space-templates.js): opens the Library's frame, clears what
//    would hide the book, walks the hall to it, pulls it out and outlines it (and pulses it once). Answers a promise of its element.
import { h, icon, sprite } from "./dom.js";
import { changed } from "./store.js";
import { setWorkspace, closeLibrary } from "./utensils.js";
import { apps, loadApps } from "./utensils-templates-api.js";
import { bookLook, placeCard, fitSpines } from "./utensils-books.js";
import { libraryPick } from "./utensils-library-pick.js";
import { searchKnowledge, knowledgeOf } from "./utensils-knowledge.js";
import { makerById } from "./utensils-makers.js";

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
/**
 * What a workflow does, which orders the books of a maker on its shelf: its title says it first (in this order: the more particular jobs
 * before the general ones), else Comfy's tags. `name` is the label of a shelf's group of books with no maker of their own; the list's
 * own order is the order on the shelf (making a picture, changing it, enlarging it, then video, sound, 3D, maps).
 */
const FUNCTIONS = [
  { id: "t2i", name: "Text to image", tags: ["Text to Image"], re: /text[\s-]*to[\s-]*image|\bt2i\b|image generation/i },
  { id: "edit", name: "Image edit", tags: ["Image Edit", "Inpainting", "Outpainting", "Relight", "Style Transfer", "Style Reference", "Character Reference", "Virtual Try-On", "Remove Background", "Layer Decompose"], re: /edit|inpaint|outpaint|relight|try[\s-]*on|remove|swap|replace|style|colou?r|reference|mockup|composit|decompos/i },
  { id: "upscale", name: "Upscale", tags: ["Image Upscale", "Video Upscale"], re: /upscal|restor|enhanc|super[\s-]*res|increase resolution|\bhdr\b/i },
  { id: "i2v", name: "Image to video", tags: ["Image to Video"], re: /image[\s-]*to[\s-]*video|\bi2v\b/i },
  { id: "t2v", name: "Text to video", tags: ["Text to Video"], re: /text[\s-]*to[\s-]*video|\bt2v\b/i },
  { id: "ref", name: "Reference to video", tags: ["Reference to Video", "Character Replacement"], re: /reference[\s-]*to[\s-]*video|character replace/i },
  { id: "flf", name: "First and last frame", tags: ["FLF2V"], re: /flf|first[\s-]*last|start[\s-]*end/i },
  { id: "control", name: "Motion control", tags: ["Motion Control", "ControlNet", "Pose Map"], re: /control|motion|\bpose\b|camera|trajector|dance/i },
  { id: "vedit", name: "Video edit", tags: ["Video Edit", "Video to Video", "Video Extend", "Frame Interpolation"], re: /video[\s-]*(edit|extend|to[\s-]*video)|\bv2v\b|extend|interpolat|loop|crossfade/i },
  { id: "talk", name: "Lip sync", tags: ["Lip Sync", "Audio to Video"], re: /lip[\s-]*sync|talking|avatar|dubb|audio[\s-]*driven/i },
  { id: "voice", name: "Voice", tags: ["Text to Speech", "TTS", "Voice Cloning", "Speech to Text"], re: /speech|voice|dialogue|\btts\b|speaker/i },
  { id: "music", name: "Music", tags: ["Text to Music", "Music", "Music Cover"], re: /music|song|instrumental/i },
  { id: "sound", name: "Sound", tags: ["Text to Audio", "Audio Editing"], re: /sound|audio|sfx|separation|stems?\b/i },
  { id: "3d", name: "3D", tags: ["Image to 3D", "Text to 3D", "3D"], re: /\b3d\b|to[\s-]*model|mesh|splat|topology|uv unwrap|multi[\s-]*view/i },
  { id: "maps", name: "Maps and masks", tags: ["Depth", "Depth Estimation", "Normal Estimation", "Albedo Estimation", "Element Segmentation"], re: /depth|normal|segment|detect|estimat|albedo|\bmap\b|lineart/i },
  { id: "vector", name: "Vector", tags: ["Vector"], re: /svg|vector/i },
];
/** The order a title is read in: the particular jobs first ("Image to Video" before "edit"), the general ones after. */
const READ = ["flf", "ref", "talk", "i2v", "t2v", "vedit", "upscale", "control", "t2i", "3d", "edit", "voice", "music", "sound", "maps", "vector"].map((id) => FUNCTIONS.find((f) => f.id === id));
const FN = new Map(FUNCTIONS.map((f, i) => [f.id, { ...f, rank: i }]));
FN.set("other", { id: "other", name: "Other", rank: FUNCTIONS.length });
function functionOf(it) {
  for (const f of READ) if (f.re.test(it.title)) return f.id;
  for (const f of FUNCTIONS) if (it.tags.some((t) => f.tags.includes(t))) return f.id;
  return "other";
}
/** A maker with fewer books than this in a bookcase has no group of its own there: its books join the group of what they do. */
const SMALL = 3;
const KIND_WORD = { image: "a picture", video: "a clip", audio: "a sound", text: "words", words: "words", "3d": "a 3D model", mask: "a mask", none: "nothing" };
const KIND_ICON = { image: "image", video: "video", audio: "sound", text: null, words: null, "3d": null };
/** The height a shelf is given (the hall holds as many as fit, two to five): the books are tall enough for their titles to read. */
const SHELF_H = 250;
/** How far a book's card stands from its book, in pixels: the three or four books after it stay in sight. */
const CARD_GAP = 150;
/** The ledge a shelf's books stand on: its front carries the labels of their groups. */
const LEDGE = 24;

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
  const st = { state: "idle", data: null, q: "", found: null, what: "all", who: "all" };
  const books = new Map(); // name -> { it, el }
  const cases = new Map(); // category -> { el, shelves, count, chip }

  const search = h("input.lb-search", { type: "search", placeholder: "Search a job, a model, a maker…", "aria-label": "Search the workflows", autocomplete: "off", spellcheck: false });
  const found = h("span.lb-found", { role: "status" });
  const titleCount = h("span.lb-title-count", {});
  const hall = h("div.lb-hall", { tabindex: "-1", "aria-label": "The hall: a bookcase per category" });
  const row = h("div.lb-cases", {});
  const left = h("button.lb-arrow.is-l", { type: "button", title: "Walk left", "aria-label": "Walk left", on: { click: () => walk(-1) } }, icon("next"));
  const right = h("button.lb-arrow.is-r", { type: "button", title: "Walk right", "aria-label": "Walk right", on: { click: () => walk(1) } }, icon("next"));
  const empty = h("div.lb-empty", { hidden: true });
  const card = h("div.lb-card", { role: "dialog", "aria-hidden": "true" });
  hall.append(row);
  // the two filters: what (a bookcase, or the mini apps) and who (a maker, or open weights, or partners), each with a preview
  const whatPick = libraryPick({ label: "Bookcase", items: [{ value: "all", label: "All workflows" }], value: "all", onChange: (v) => ((st.what = v), apply(true)), preview: (it) => previewOf("what", it.value) });
  const whoPick = libraryPick({ label: "Maker", items: [{ value: "all", label: "Every maker" }], value: "all", onChange: (v) => ((st.who = v), apply(true)), preview: (it) => previewOf("who", it.value) });
  const el = h("section.lb", { "aria-label": "The Library" },
    h("div.lb-bar", {},
      h("div.lb-title", {}, h("span.lb-eyebrow", {}, "Utensils"), h("b", {}, "Library"), titleCount),
      h("label.lb-searchbox", {}, icon("search"), search, found),
      h("div.lb-picks", {}, whatPick.el, whoPick.el),
      h("button.lb-close", { type: "button", title: "Close the Library (Esc)", "aria-label": "Close the Library", on: { click: () => closeLibrary() } }, icon("close"))),
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
      .catch((e) => {
        st.state = "none";
        empty.hidden = false;
        // a 404 is a server older than the page (it has no Library yet): trying again will not help, restarting it will
        const old = e?.message === "404";
        empty.replaceChildren(sprite("tool-templates"), h("span", {}, old ? "The app's server is older than this page and has no Library yet: restart it (npm start), then reload." : "The Library needs Comfy Cloud's catalogue: it could not be read. Try again in a moment."), h("button.lb-retry", { type: "button", on: { click: () => ((st.state = "idle"), load()) } }, "Try again"));
      });
  }

  // the mini apps are the live list (the ones Comfy Cloud can drive); until it has come, the catalogue's own word
  const appsKey = () => apps.list.map((a) => a.id).join();
  const appNames = () => new Set(apps.list.length ? apps.list.map((a) => a.name) : (st.data?.items ?? []).filter((i) => i.isApp).map((i) => i.name));

  /**
   * A book, bound blind (design D, css/ut-shelf.css .usb-book): its category's cloth, its title pressed up its spine (a long title in a
   * smaller face, the book as thick as its lines), the logo of the maker of its model pressed at its head (or its category's icon), APP or
   * API pressed at its foot. One element: the button and its title.
   */
  function bookEl(it, isApp) {
    const c = catOf(it.category);
    const look = bookLook(it.name, c.color, { thin: true });
    const n = it.title.length;
    const fs = n > 44 ? 0.8 : n > 30 ? 0.85 : 0.9;
    const foil = isApp ? "APP" : it.partner ? "API" : null;
    const maker = it.maker ? makerById(it.maker) : null;
    const book = h("button.usb-book.lb-book", {
      type: "button",
      tabindex: "-1",
      dataset: { workflow: it.name, id: `wf:${it.name}`, cat: it.category, fs: String(fs), min: (1.85 + look.w * 0.5).toFixed(2), ...(maker ? { maker: maker.id } : {}), ...(foil ? { foil } : {}) },
      "aria-label": `${it.title}, ${c.sign}${maker ? `, ${maker.name}` : ""}${foil ? `, ${foil === "APP" ? "a mini app" : "a partner service"}` : ""}`,
      style: { "--c": look.color, "--h": look.h.toFixed(3), "--w": `calc(${(1.85 + look.w * 0.5).toFixed(2)} * var(--bk, 13px))`, "--fs": String(fs) },
      on: {
        click: (e) => go(it, book, e),
        pointerenter: (e) => e.pointerType !== "touch" && performance.now() > quietUntil && point(it, book),
        pointerleave: () => (clearTimeout(intent), later()),
        pointerdown: (e) => (armed = e.pointerType === "touch" ? (showing?.it === it ? it : "show") : null),
        focus: () => (rove(book), show(it, book)),
        blur: () => later(),
      },
    },
    maker ? null : h("span.usb-ico", {}, sprite(c.icon)),
    it.title);
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
      const count = h("span.lb-head-count", {}, String(list.length));
      const shelves = h("div.lb-shelves", {});
      const box = h("div.lb-case", { dataset: { cat: name }, style: { "--sec": c.color } },
        h("div.lb-head", {}, h("span.lb-head-in", {}, h("i.lb-head-dot", { "aria-hidden": "true" }), h("span.lb-head-ico", {}, sprite(c.icon)), h("b", {}, c.sign), count)),
        h("div.lb-frame", {}, shelves));
      for (const it of list) {
        it.fn = functionOf(it);
        books.set(it.name, { it, el: bookEl(it, appSet.has(it.name)), cat: name });
      }
      cases.set(name, { el: box, shelves, count, list, chip: null });
      row.append(box);
    }
    empty.hidden = true;
    titleCount.textContent = `${data.total} workflows${data.makers?.length ? ` · ${data.makers.length} makers` : ""}`;
    drawPicks();
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
      if (want) b.dataset.foil = want;
      else delete b.dataset.foil;
    }
    drawPicks();
    if (st.what === "apps") apply();
  }

  // ------------------------------------------------------------ the filters

  /** Whether a workflow is of a "what" (all, the mini apps, a bookcase) and of a "who" (all, open weights, partners, a maker). */
  const isWhat = (it, what, appSet) => what === "all" || (what === "apps" ? appSet.has(it.name) : it.category === what);
  const isWho = (it, who) => who === "all" || (who === "open" ? !it.partner : who === "partner" ? it.partner : it.maker === who);
  function visible(it, appSet) {
    if (st.found && !st.found.has(it.name)) return false;
    return isWhat(it, st.what, appSet) && isWho(it, st.who);
  }

  /** The words a book is found by: its title, its description, its tags, its models, its category. */
  const hay = new Map();
  const textOf = (it) => hay.get(it.name) ?? hay.set(it.name, `${it.title} ${it.name} ${it.description} ${it.tags.join(" ")} ${it.models.join(" ")} ${it.category} ${makerById(it.maker)?.name ?? ""} ${makerById(it.maker)?.by ?? ""}`.toLowerCase()).get(it.name);

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
    if (e.key === "Escape" && search.value) (e.stopPropagation(), (search.value = ""), runSearch());
    if (e.key === "Enter") {
      const first = [...row.querySelectorAll(".lb-book")].find((b) => b.offsetParent);
      if (first) first.focus();
    }
  });

  /** The two filters' choices, with their counts (the whole catalogue's: a choice says how much it holds). */
  function drawPicks() {
    if (st.state !== "ready") return;
    const items = st.data.items;
    const appSet = appNames();
    const makersIn = (list) => new Set(list.map((i) => i.maker).filter(Boolean)).size;
    whatPick.redraw([
      { value: "all", label: "All workflows", short: "All workflows", sub: "Every bookcase", count: items.length, glyph: () => sprite("tool-templates") },
      { value: "apps", label: "Mini apps", sub: "A workflow with one simple form", count: appSet.size, glyph: () => h("span.lbp-tag", {}, "APP") },
      ...[...cases.entries()].map(([name, c], i) => ({ value: name, label: catOf(name).sign, sub: `${makersIn(c.list)} makers`, count: c.list.length, rule: i === 0, glyph: () => h("span.lbp-swatch", { style: { "--sec": catOf(name).color } }, sprite(catOf(name).icon)) })),
    ]);
    whoPick.redraw([
      { value: "all", label: "Every maker", sub: "Open models and partners", count: items.length, glyph: () => sprite("tool-templates") },
      { value: "open", label: "Open weights", sub: "Open models, on Comfy Cloud's GPUs", count: items.filter((i) => !i.partner).length, glyph: () => h("span.lbp-tag.is-open", {}, "OPEN") },
      { value: "partner", label: "Partner services", sub: "Their own models, billed in partner credits", count: items.filter((i) => i.partner).length, glyph: () => h("span.lbp-tag", {}, "API") },
      ...(st.data.makers ?? []).map((m, i) => ({ value: m.id, label: m.name, sub: m.by ? `by ${m.by}` : "", count: m.count, rule: i === 0, glyph: () => h("i.lb-maker-logo", { dataset: { maker: m.id } }) })),
    ]);
  }

  /**
   * The preview of a filter's choice: what it holds under the other filter as it stands (its counts, the makers of a bookcase or the
   * bookcases of a maker, its six most used workflows as pictures; a picture opens its workflow).
   */
  function previewOf(kind, value) {
    if (st.state !== "ready") return h("p.lbp-empty", {}, "The Library is opening…");
    const appSet = appNames();
    const list = st.data.items.filter((it) => (kind === "what" ? isWhat(it, value, appSet) && isWho(it, st.who) : isWho(it, value) && isWhat(it, st.what, appSet)));
    const top = [...list].sort((a, b) => b.usage - a.usage).slice(0, 6);
    const open = list.filter((i) => !i.partner).length;
    const m = kind === "who" ? makerById(value) : null;
    const c = kind === "what" && cases.has(value) ? catOf(value) : null;
    const title = m ? m.name : c ? c.sign : value === "apps" ? "Mini apps" : value === "open" ? "Open weights" : value === "partner" ? "Partner services" : kind === "what" ? "All workflows" : "Every maker";
    const glyph = m ? h("i.lb-maker-logo.is-big", { dataset: { maker: m.id } }) : c ? h("span.lbp-swatch.is-big", { style: { "--sec": c.color } }, sprite(c.icon)) : sprite("tool-templates");
    // the other side of it: a bookcase's makers (their logos), a maker's bookcases
    const side = kind === "what"
      ? [...new Set(list.map((i) => i.maker).filter(Boolean))].slice(0, 12).map((id) => h("i.lb-maker-logo", { dataset: { maker: id }, title: makerById(id)?.name ?? id }))
      : [...new Set(list.map((i) => i.category))].map((cat) => h("span.lbp-cat", { style: { "--sec": catOf(cat).color } }, catOf(cat).sign, h("em", {}, String(list.filter((i) => i.category === cat).length))));
    return h("div.lbp-prev", {},
      h("div.lbp-prev-head", {}, h("span.lbp-prev-glyph", {}, glyph), h("div", {}, h("b", {}, title), h("span", {}, m?.by ? `by ${m.by}` : `${list.length} ${list.length === 1 ? "workflow" : "workflows"}`))),
      h("p.lbp-stats", {}, `${list.length} workflows · ${open} open weights · ${list.length - open} partner`),
      side.length ? h(`div.lbp-side${kind === "what" ? ".is-logos" : ""}`, {}, ...side) : null,
      top.length ? h("div.lbp-thumbs", {}, ...top.map((it) => h("button.lbp-thumb", { type: "button", title: `Open ${it.title}`, on: { click: () => (whatPick.close(), whoPick.close(), open(it.name)) } },
        it.thumbKind === "audio" ? h("span.lbp-ph", {}, icon("sound")) : h("img", { src: `api/utensils/templates/thumb/${encodeURIComponent(it.name)}`, alt: "", loading: "lazy", decoding: "async", draggable: false, on: { error: (e) => e.target.replaceWith(h("span.lbp-ph", {}, sprite(catOf(it.category).icon))) } }),
        h("span.lbp-thumb-title", {}, it.title)))) : h("p.lbp-empty", {}, "Nothing here with the other filter as it is."));
  }
  function filterApps(on) {
    st.what = on ? "apps" : "all";
    whatPick.set(st.what);
    apply(true);
  }

  /** What the filters show, laid out on the shelves; `jump`: the hall goes back to its start (a new search, a new filter). */
  function apply(jump = false) {
    if (st.state !== "ready") return;
    // (a card open for a book the filters now hide, or move, goes; and the books the pointer rests on as a dropdown closes over them
    // do not open theirs for a moment: the pointer was choosing a filter, not a book)
    if (showing) hide(true);
    quietUntil = performance.now() + 500;
    const appSet = appNames();
    let shown = 0;
    for (const [name, c] of cases) {
      c.shown = c.list.filter((it) => visible(it, appSet));
      shown += c.shown.length;
      c.el.hidden = !c.shown.length;
      c.count.textContent = String(c.shown.length);
    }
    const filtering = !!(st.found || st.what !== "all" || st.who !== "all");
    found.textContent = filtering ? `${shown} of ${st.data.total}` : `${st.data.total} workflows`;
    empty.hidden = shown > 0;
    if (!shown) empty.replaceChildren(icon("search"), h("span", {}, st.q ? `No workflow for “${st.q}”. Ask Truffle: she knows what each one does.` : "No workflow passes these filters."), ...(st.q ? [h("button.lb-retry", { type: "button", on: { click: () => ask(`Which workflow should I use to ${st.q}?`) } }, "Ask Truffle")] : []));
    layout();
    if (jump) hall.scrollTo({ left: 0 });
    edges();
  }

  // ------------------------------------------------------------ the shelves: as many as the hall's height holds

  let fitting = 0;
  let laidAt = "";
  const layout = () => (cancelAnimationFrame(fitting), (fitting = requestAnimationFrame(() => layoutNow())));
  const measure = document.createElement("canvas").getContext("2d");

  /**
   * How wide a book will stand (its title's lines at the spine's height), read from the face itself rather than from the page, so a
   * bookcase can be shared among its shelves before it is drawn: the words are packed into lines as the spine packs them.
   */
  function widthOf(b, bk, shelfH, plank) {
    const el = books.get(b.name).el;
    const fs = Number(el.dataset.fs) * bk;
    const tall = Number(el.style.getPropertyValue("--h")) * (shelfH - plank - 0.75 * bk);
    const room = tall - 3 * bk - (el.dataset.foil ? 2.2 : 1.1) * bk;
    measure.font = `700 ${fs}px Manrope, sans-serif`;
    const space = measure.measureText(" ").width;
    let lines = 1;
    let line = 0;
    for (const w of b.title.split(/\s+/)) {
      const ww = measure.measureText(w).width;
      if (line && line + space + ww > room) ((lines += 1), (line = ww));
      else line += (line ? space : 0) + ww;
    }
    return Math.max(Number(el.dataset.min) * bk, lines * 1.06 * fs + 0.48 * bk) + 0.1 * bk;
  }

  /**
   * A bookcase's books in their groups: a maker's books together (the busiest maker first), each maker's in the order of what they do;
   * the makers with a book or two there join the group of what their books do, after the makers. Answers the runs of books of one
   * group and one function, in order: [{ fam, maker, label, fn, books, first }].
   */
  function runsOf(list) {
    const per = new Map();
    for (const it of list) per.set(it.maker, (per.get(it.maker) ?? 0) + 1);
    const famOf = (it) => (it.maker && per.get(it.maker) >= SMALL ? `m:${it.maker}` : `f:${it.fn}`);
    const groups = new Map();
    for (const it of list) {
      const k = famOf(it);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(it);
    }
    const order = [...groups.entries()].sort(([a, x], [b, y]) => (a[0] === b[0] ? (a[0] === "m" ? y.length - x.length : FN.get(a.slice(2)).rank - FN.get(b.slice(2)).rank) : a[0] === "m" ? -1 : 1));
    const runs = [];
    for (const [fam, its] of order) {
      its.sort((a, b) => FN.get(a.fn).rank - FN.get(b.fn).rank || b.usage - a.usage || a.title.localeCompare(b.title));
      const maker = fam.startsWith("m:") ? fam.slice(2) : null;
      const label = maker ? makerById(maker)?.name ?? maker : FN.get(fam.slice(2)).name;
      for (const it of its) {
        const last = runs.at(-1);
        if (last && last.fam === fam && last.fn === it.fn) last.books.push(it);
        else runs.push({ fam, maker, label, fn: it.fn, books: [it], first: !last || last.fam !== fam });
      }
    }
    return runs;
  }

  /**
   * The runs shared among n shelves, as evenly as their widths allow: a shelf ends between two groups when it can, between two functions
   * else, and only a run longer than half a shelf is cut in the middle. Answers the shelves, each a list of runs (a cut run's second part
   * carries on: `first: false, cont: true`).
   */
  function shelvesOf(runs, n, width, famGap, fnGap) {
    const w = (r) => r.books.reduce((t, b) => t + width(b), 0);
    const total = runs.reduce((t, r) => t + w(r) + (r.first ? famGap : fnGap), 0);
    const target = total / n;
    const rows = [[]];
    let acc = 0;
    const queue = runs.map((r) => ({ ...r, books: [...r.books] }));
    while (queue.length) {
      const r = queue.shift();
      const rw = w(r) + (r.first ? famGap : fnGap);
      if (acc > 0 && acc + rw > target * 1.08 && rows.length < n) {
        if (w(r) > target * 0.5) {
          // a long run fills this shelf to its share and carries on on the next
          const head = [];
          let x = acc + (r.first ? famGap : fnGap);
          while (r.books.length && x + width(r.books[0]) <= target) (x += width(r.books[0])), head.push(r.books.shift());
          if (head.length) rows.at(-1).push({ ...r, books: head });
          rows.push([]);
          acc = 0;
          if (r.books.length) queue.unshift({ ...r, first: head.length ? false : r.first, cont: !!head.length });
          continue;
        }
        rows.push([]);
        acc = 0;
      }
      rows.at(-1).push(r);
      acc += rw;
    }
    return rows;
  }

  /** A shelf: its groups side by side (a maker's runs in one group, a little apart by what they do), each group's label on the ledge. */
  function shelfEl(runs) {
    const groups = [];
    for (const r of runs) {
      const g = groups.at(-1);
      if (g && g.fam === r.fam) g.runs.push(r);
      else groups.push({ fam: r.fam, maker: r.maker, label: r.label, cont: !!r.cont, runs: [r] });
    }
    return h("div.usb-row.lb-row", {},
      h("div.lb-rowin", {}, ...groups.map((g) => {
        // what the group does: its functions, the one with the most books first ("Image to video +3" when it does more than two)
        const tally = new Map();
        for (const r of g.runs) tally.set(r.fn, (tally.get(r.fn) ?? 0) + r.books.length);
        const fns = [...tally.entries()].sort((a, b) => b[1] - a[1]).map(([f]) => f);
        const sub = g.maker ? (fns.length <= 2 ? fns.map((f) => FN.get(f).name).join(" · ") : `${FN.get(fns[0]).name} +${fns.length - 1}`) : "";
        return h("div.lb-group", { dataset: { fam: g.fam, ...(g.maker ? { maker: g.maker } : {}) } },
          h("div.lb-gbooks", {}, ...g.runs.flatMap((r, k) => r.books.map((it, j) => {
            const b = books.get(it.name).el;
            b.classList.toggle("is-fn", k > 0 && j === 0);
            return b;
          }))),
          h("span.lb-glabel", { title: [g.label, sub].filter(Boolean).join(" · ") },
            g.maker ? h("i.lb-maker-logo", { "aria-hidden": "true" }) : null,
            h("b", {}, g.label),
            g.cont ? h("em", {}, "continued") : sub ? h("em", {}, sub) : null));
      })),
      h("div.lb-ledge", { "aria-hidden": "true" }));
  }

  /** The books on as many shelves as the hall's height holds (two to five), in their groups, each bookcase's shelves of about one length. */
  function layoutNow(force = false) {
    cancelAnimationFrame(fitting);
    const first = [...cases.values()].find((c) => !c.el.hidden);
    if (!hall.clientHeight || st.state !== "ready" || !first) return false;
    // the bookcases out of sight are not drawn (content-visibility): they are while the hall is measured
    el.classList.add("is-measuring");
    const room = first.shelves.clientHeight;
    const n = Math.max(2, Math.min(5, Math.floor(room / SHELF_H)));
    const shelfH = room / n;
    const key = [n, Math.round(shelfH), ...[...cases.values()].map((c) => c.shown?.length ?? 0), st.found?.size ?? -1, st.what, st.who].join();
    if (key === laidAt && !force) {
      el.classList.remove("is-measuring");
      return true;
    }
    laidAt = key;
    const bk = Math.max(12, Math.min(17, shelfH * 0.066));
    el.style.setProperty("--rows", String(n));
    el.style.setProperty("--shelf", `${shelfH.toFixed(2)}px`);
    el.style.setProperty("--bk", `${bk.toFixed(2)}px`);
    el.style.setProperty("--plank", `${LEDGE}px`);
    const width = (it) => widthOf(it, bk, shelfH, LEDGE);
    for (const [, c] of cases) {
      if (!c.shown?.length) {
        c.shelves.replaceChildren();
        continue;
      }
      const shelves = shelvesOf(runsOf(c.shown), n, width, 2.6 * bk, 0.9 * bk);
      c.shelves.replaceChildren(...shelves.map(shelfEl), ...Array.from({ length: Math.max(0, n - shelves.length) }, () => shelfEl([])));
    }
    // a title whose longest word is longer than its spine runs in a smaller face (only the bookcases drawn: the others when they are)
    fitSpines([...row.querySelectorAll(".lb-book")]);
    // each keeps the width it measured, so the hall is as long when they are not drawn
    for (const [, c] of cases) if (!c.el.hidden) c.el.style.setProperty("--cw", `${c.el.offsetWidth}px`);
    el.classList.remove("is-measuring");
    edges();
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
  function edges() {
    left.disabled = hall.scrollLeft <= 4;
    right.disabled = hall.scrollLeft + hall.clientWidth >= hall.scrollWidth - 4;
  }
  let moving = 0;
  hall.addEventListener("scroll", () => {
    if (showing) hide();
    cancelAnimationFrame(moving);
    moving = requestAnimationFrame(() => edges());
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
    } else if (e.key === "Escape") {
      if (showing) (e.stopPropagation(), hide());
      return;
    }
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
  let quietUntil = 0;
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
        it.maker && makerById(it.maker) ? h("span.lb-card-maker", { dataset: { maker: it.maker } }, h("i.lb-maker-logo", { "aria-hidden": "true" }), makerById(it.maker).name, makerById(it.maker).by ? h("em", {}, `by ${makerById(it.maker).by}`) : null) : null,
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
  /**
   * The card stands a few books away from its book (CARD_GAP), so the books next to it stay in sight; a dashed lead joins them. On its
   * way to the card the pointer crosses those books: a book it only passes over does not take the card (it must rest on it a moment).
   */
  const place = () => {
    if (!showing) return;
    const r = hall.getBoundingClientRect();
    placeCard(card, showing.b, { mode: "beside", within: { top: r.top + 4, bottom: r.bottom - 4 }, gap: CARD_GAP });
    card.style.setProperty("--lead", `${CARD_GAP}px`);
  };
  let intent = 0;
  /** Whether a book stands between the book shown and its card: the pointer crosses it on its way to the card. */
  function onTheWay(b) {
    if (!showing || !card.classList.contains("is-on")) return false;
    // (by their middles: the book shown is pulled out a little larger, over its neighbours' edges)
    const br = b.getBoundingClientRect();
    const sr = showing.b.getBoundingClientRect();
    const cr = card.getBoundingClientRect();
    const x = br.left + br.width / 2;
    const y = br.top + br.height / 2;
    const from = sr.left + sr.width / 2;
    if (y < cr.top || y > cr.bottom) return false;
    // (a book half under the card's edge is on the way too: the pointer crosses what shows of it)
    return card.classList.contains("is-left") ? x < from && br.right > cr.right : x > from && br.left < cr.left;
  }
  function point(it, b) {
    clearTimeout(intent);
    if (!showing) return show(it, b);
    // a card is open for another book: this one takes it only if the pointer stays on it (a long while when it is on the way to the
    // card, so a hand going to the card does not make it run off)
    clearTimeout(hideTimer);
    intent = setTimeout(() => b.matches(":hover") && show(it, b), onTheWay(b) ? 450 : 150);
  }
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
  card.addEventListener("keydown", (e) => e.key === "Escape" && (e.stopPropagation(), showing?.b.focus(), hide()));

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
    st.what = st.who = "all";
    whatPick.set("all");
    whoPick.set("all");
    asked++;
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
    /** A workflow as the catalogue has it, with its category's cloth colour (null until the catalogue has come, or when it has none). */
    itemOf: (name) => {
      const b = books.get(name);
      return b ? { ...b.it, color: catOf(b.it.category).color, sign: catOf(b.it.category).sign } : null;
    },
    /** The search field (the frame gives it the focus when it opens). */
    search,
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
