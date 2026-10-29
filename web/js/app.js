// (the live demo's replay comes first, before anything asks the API)
import "./static-demo.js";
import { icon } from "./dom.js";
import { installTooltips } from "./tooltip.js";
import { state, load, onChange, roll, toast, changed } from "./store.js";
import { PAGES, PRODUCTS, currentPage, productOf } from "./router.js";
import { renderSources, listenForPaste } from "./panels/sources.js";
import { renderMonitor } from "./panels/monitor.js";
import { renderScript } from "./panels/script.js";
import { renderPresets } from "./panels/presets.js";
import { renderSettings } from "./panels/settings.js";
import { renderTakes } from "./panels/takes.js";
import { renderTabs, renderActions } from "./panels/tabs.js";
import { renderStatus } from "./panels/status.js";
import { renderNav, renderProducts } from "./panels/nav.js";
import { renderLibrary } from "./panels/library.js";
import { renderWelcome } from "./panels/welcome.js";
import { renderAssistant } from "./panels/assistant.js";
import { renderStage, listenForAgents } from "./panels/stage.js";
import { installTourKey } from "./tour.js";
import { styled } from "./sheets.js";
// the open film, kept in step with the section on screen
import "./project.js";

const $ = (id) => document.getElementById(id);

// what starts a page's panel loading before its page is shown, by page (see warmUp)
const warm = {};
// the state is loaded and the first page drawn
let started = false;

/**
 * A panel loaded with its page and not before: its styles and its modules (a product's assistant module too, which gives the bar its
 * conversation and its quick actions) come together, then it draws, so nothing shows unstyled. Until then the page is empty.
 * `load` answers the panel's draw function; the styles are those of the panel's name (sheets.js); `page` is the page it draws for.
 */
function product(name, load, page = name) {
  let loading = null;
  const start = () =>
    (loading ??= Promise.all([styled(name), load()])
      .then(([, render]) => {
        panels[name][1] = render;
        panels[name][0].removeAttribute("aria-busy");
        // (before the state is loaded the page is drawn by showPage, with its panels)
        if (!started) return;
        pending.add(name);
        // (the bar of the page was drawn without the product's part: it is drawn again with it)
        changed("assistant");
        flush();
      })
      .catch((e) => {
        loading = null;
        panels[name][0].removeAttribute("aria-busy");
        toast(`Can't load ${name}: ${e.message}`, { tone: "crit" });
      }));
  warm[page] = start;
  return (el) => {
    el.setAttribute("aria-busy", "true");
    start();
  };
}

// a page starts loading when it is pointed at (its mark in the header, its tile on the home), so it is there by the click
const warmUp = (e) => warm[e.target.closest?.('a[href^="#/"]')?.getAttribute("href").slice(2).split("?")[0]]?.();
document.addEventListener("pointerover", warmUp, { passive: true });
document.addEventListener("pointerdown", warmUp, { passive: true });

/** The Oven (the image window) is loaded the first time it opens: the layer stays away until its panel is there to draw it. */
let ovenLoading = null;
function oven(el) {
  if (!state.image.open) {
    el.hidden = true;
    document.body.classList.remove("has-window");
    return;
  }
  if (ovenLoading) return;
  ovenLoading = import("./panels/image.js")
    .then((m) => {
      panels.image[1] = m.renderImage;
      pending.add("image");
      flush();
    })
    .catch((e) => {
      ovenLoading = null;
      toast(`Can't load the Oven: ${e.message}`, { tone: "crit" });
    });
}

// every panel, the element it draws into, and the section it belongs to (none: always on screen)
const panels = {
  products: [$("products"), renderProducts],
  nav: [$("nav"), renderNav],
  status: [$("cloud"), renderStatus],
  sources: [$("sources"), renderSources, "shot"],
  monitor: [$("monitor"), renderMonitor, "shot"],
  script: [$("script"), renderScript, "shot"],
  presets: [$("presets"), renderPresets, "shot"],
  settings: [$("settings"), renderSettings, "shot"],
  takes: [$("takes"), renderTakes, "shot"],
  // the assistant's bar is the Shot's and the Stage's: it draws wherever it is docked
  assistant: [$("assistant"), renderAssistant],
  stage: [$("page-stage"), renderStage, "stage"],
  image: [$("image"), oven],
  tabs: [$("tabs"), renderTabs, "shot"],
  actions: [$("actions"), renderActions, "shot"],
  story: [$("page-story"), product("story", () => import("./panels/story.js").then((m) => m.renderStory)), "story"],
  library: [$("page-library"), renderLibrary, "library"],
  cut: [$("page-cut"), product("cut", () => import("./panels/cut.js").then((m) => m.renderCut)), "cut"],
  welcome: [$("page-home"), renderWelcome, "home"],
  home: [$("page-kitchen"), product("home", () => import("./panels/home.js").then((m) => m.renderHome), "kitchen"), "kitchen"],
  // the products come with their page: the first time it is shown, its styles and its modules load, then it draws
  mixer: [$("page-mixer"), product("mixer", () => Promise.all([import("./panels/mixer.js"), import("./mixer-assist.js")]).then(([m]) => m.renderMixer)), "mixer"],
  jam: [$("page-jam"), product("jam", () => import("./panels/jam.js").then((m) => m.renderJam)), "jam"],
  macaron: [$("page-macaron"), product("macaron", () => Promise.all([import("./panels/macaron.js"), import("./macaron-assist.js")]).then(([m]) => m.renderMacaron)), "macaron"],
  spice: [$("page-spice"), product("spice", () => Promise.all([import("./panels/spice.js"), import("./spice-assist.js")]).then(([m]) => m.renderSpice)), "spice"],
  toaster: [$("page-toaster"), product("toaster", () => Promise.all([import("./panels/toaster.js"), import("./toaster-assist.js")]).then(([m]) => m.renderToaster)), "toaster"],
  utensils: [$("page-utensils"), product("utensils", () => Promise.all([import("./panels/utensils.js"), import("./utensils-assist.js")]).then(([m]) => m.renderUtensils)), "utensils"],
};

// Redraws are batched to one per frame; text fields keep focus because the
// panels that hold them only redraw on structural changes. A panel on a page you
// aren't looking at waits (stale) and draws when you go there.
const pending = new Set();
const stale = new Set();
let scheduled = false;

// A press holds the redraw of the panel it is in until its click has landed (or a drag starts):
// a redraw between the button going down and up takes the pressed thing away, and the click with it.
let press = null;
const release = () => press && ((press = null), pending.size && flush());
window.addEventListener("pointerdown", (e) => {
  press = { target: e.target, x: e.clientX, y: e.clientY };
  const mine = press;
  setTimeout(() => press === mine && release(), 700);
}, true);
window.addEventListener("pointermove", (e) => press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 4 && release(), true);
window.addEventListener("pointerup", () => press && setTimeout(release), true);
window.addEventListener("pointercancel", release, true);

// a key is found again after a redraw by its class and its name
const KEYS = "button, a[href], [tabindex]";
const keyName = (n) => `${n.className}|${n.dataset.focusKey || n.getAttribute("aria-label") || n.dataset.tooltip || n.title || n.textContent.trim()}`;

function flush() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    const active = document.activeElement;
    const held = [];
    // what this frame draws is taken now: a redraw asked for while it draws waits for the next frame (cleared after the loop, it was lost)
    const names = [...pending];
    pending.clear();
    for (const name of names) {
      const [el, render, page] = panels[name];
      if (page && page !== currentPage()) {
        stale.add(name);
        continue;
      }
      // the assistant and the Oven keep their composers across redraws, so they can always draw
      if (name !== "monitor" && name !== "assistant" && name !== "image" && el.contains(active) && !$("assistant").contains(active) && active.matches("input, textarea, select, [contenteditable]:not([contenteditable=false])")) continue;
      if (press && el.contains(press.target)) {
        held.push(name);
        continue;
      }
      // a redraw replaces the panel's children, which would scroll it back to the top
      const top = el.scrollTop;
      const lists = new Map([...el.querySelectorAll("[data-scroll-key]")].map((n) => [n.dataset.scrollKey, n.scrollTop]));
      // and the key the focus was on (a menu's, just picked from) would leave it on the page itself
      const focused = el.contains(active) && active.matches(KEYS) ? keyName(active) : null;
      // (a panel that fails to draw is reported and left as it was: the panels after it, the chat bar among them, still draw)
      try {
        render(el);
      } catch (e) {
        console.error(`the ${name} panel could not be drawn:`, e);
        continue;
      }
      el.scrollTop = top;
      for (const n of el.querySelectorAll("[data-scroll-key]")) if (lists.has(n.dataset.scrollKey)) n.scrollTop = lists.get(n.dataset.scrollKey);
      if (focused && !el.contains(document.activeElement)) [...el.querySelectorAll(KEYS)].find((n) => keyName(n) === focused)?.focus({ preventScroll: true });
    }
    for (const name of held) pending.add(name);
  });
}

onChange((scopes) => {
  for (const scope of scopes) {
    if (scope === "all") Object.keys(panels).forEach((p) => pending.add(p));
    else if (scope === "preview") pending.add("monitor").add("takes").add("tabs");
    else if (scope === "paint") pending.add("sources");
    else if (scope === "account") pending.add("status");
    else if (scope === "director") pending.add("tabs").add("nav");
    else if (panels[scope]) pending.add(scope);
    // the header's keys and status follow the takes, the tabs and any running job
    if (["takes", "tabs", "paint", "sources", "director", "edit", "cut"].includes(scope)) pending.add("actions").add("status").add("nav");
    // takes and films are the library's and the edit's material too
    if (scope === "takes") pending.add("library").add("cut").add("story");
    if (scope === "sources") pending.add("assistant");
    if (scope === "tabs" || scope === "takes") pending.add("tabs");
  }
  flush();
});

/** Shows the section the address names, and draws what changed while it was hidden. */
/**
 * The assistant's bar floats over the Shot's desk and docks under the Stage's viewport, the Cut's timeline, Jam's page.
 * Mixer's page redraws all it holds, so its bar floats from the body, like the Shot's. Utensils', Spice's and Macaron's docks in their pages' foot,
 * Toaster's under its viewport.
 */
function dockAssistant(page = currentPage()) {
  const bar = $("assistant");
  if (dockMacaron(bar, page)) return;
  if (dockSpice(bar, page)) return;
  if (dockUtensils(bar, page)) return;
  if (dockToaster(bar, page)) return;
  const slot = page === "stage" ? $("stage-chat") : page === "story" ? $("story-chat") : page === "cut" ? $("cut-chat") : page === "jam" ? $("jam-chat") : page === "mixer" ? document.body : $("page-shot");
  bar.hidden = !slot || !["shot", "stage", "story", "cut", "jam", "mixer"].includes(page);
  if (slot && bar.parentElement !== slot) slot.append(bar);
  bar.classList.toggle("is-docked", page === "stage" || page === "story" || page === "cut" || page === "jam");
  pending.add("assistant");
  flush();
}
document.addEventListener("stage:ready", () => dockAssistant());
// on the Shot's desk the floating bar keeps to the middle column (app.css reads where it is), so it never covers the inputs or the take log
const shotMid = document.querySelector("#page-shot .col.stage");
function fitShotBar() {
  const r = shotMid?.getBoundingClientRect();
  if (!r?.width) return;
  const page = $("page-shot");
  page.style.setProperty("--mid-x", `${Math.round(r.left + r.width / 2)}px`);
  page.style.setProperty("--mid-w", `${Math.round(r.width)}px`);
}
if (shotMid) new ResizeObserver(fitShotBar).observe(shotMid);
addEventListener("resize", fitShotBar);
// Story draws its page (and the bar's slot) when its first story has come
document.addEventListener("story:drawn", () => currentPage() === "story" && $("assistant").parentElement?.id !== "story-chat" && dockAssistant());
document.addEventListener("cut:drawn", () => currentPage() === "cut" && $("assistant").parentElement?.id !== "cut-chat" && dockAssistant());
// Jam draws its page (and the bar's slot) after the page is shown
document.addEventListener("jam:drawn", () => currentPage() === "jam" && $("assistant").parentElement?.id !== "jam-chat" && dockAssistant());
// Macaron: Brioche's bar docks at the foot of its page (the slot is drawn with the page)
function dockMacaron(bar, page) {
  if (page !== "macaron") return false;
  const slot = $("macaron-chat");
  bar.hidden = !slot;
  if (slot && bar.parentElement !== slot) slot.append(bar);
  bar.classList.toggle("is-docked", !!slot);
  pending.add("assistant");
  flush();
  return true;
}
document.addEventListener("macaron:drawn", () => currentPage() === "macaron" && $("assistant").parentElement?.id !== "macaron-chat" && dockAssistant());
// Spice: Paprika's bar docks at the foot of her page, as Brioche's does (the slot is drawn with the page)
function dockSpice(bar, page) {
  if (page !== "spice") return false;
  const slot = $("spice-chat");
  bar.hidden = !slot;
  if (slot && bar.parentElement !== slot) slot.append(bar);
  bar.classList.toggle("is-docked", !!slot);
  pending.add("assistant");
  flush();
  return true;
}
document.addEventListener("spice:drawn", () => currentPage() === "spice" && $("assistant").parentElement?.id !== "spice-chat" && dockAssistant());
// Utensils: Truffle's bar docks at the foot of her page, as Brioche's does (the slot is drawn with the page)
function dockUtensils(bar, page) {
  if (page !== "utensils") return false;
  const slot = $("utensils-chat");
  bar.hidden = !slot;
  if (slot && bar.parentElement !== slot) slot.append(bar);
  bar.classList.toggle("is-docked", !!slot);
  pending.add("assistant");
  flush();
  return true;
}
document.addEventListener("utensils:drawn", () => currentPage() === "utensils" && $("assistant").parentElement?.id !== "utensils-chat" && dockAssistant());
// Toaster: Crumpet's bar docks under the viewport (the slot is drawn with the page)
function dockToaster(bar, page) {
  if (page !== "toaster") return false;
  const slot = $("toaster-chat");
  bar.hidden = !slot;
  if (slot && bar.parentElement !== slot) slot.append(bar);
  bar.classList.toggle("is-docked", !!slot);
  pending.add("assistant");
  flush();
  return true;
}
document.addEventListener("toaster:drawn", () => currentPage() === "toaster" && $("assistant").parentElement?.id !== "toaster-chat" && dockAssistant());

function showPage() {
  const page = currentPage();
  for (const el of document.querySelectorAll(".page")) el.hidden = el.dataset.page !== page;
  dockAssistant(page);
  document.body.dataset.page = page;
  document.body.dataset.product = productOf(page) ?? "";
  document.title = PAGES[page] ? `${PAGES[page]} · Comfyture` : productOf(page) ? `${PRODUCTS[page][0]} · Comfyture` : "Comfyture";
  if (page !== "shot") document.querySelectorAll("#page-shot video").forEach((v) => v.pause());
  // nothing on a page put away keeps sounding (its muted loops play on)
  for (const v of document.querySelectorAll(".page[hidden] video")) if (!v.muted) v.pause();
  for (const [name, [, , owner]] of Object.entries(panels)) {
    if (owner === page && (stale.has(name) || !panels[name][0].childElementCount)) pending.add(name);
    if (owner === page) stale.delete(name);
  }
  pending.add("nav").add("products");
  flush();
  window.scrollTo({ top: 0 });
}
window.addEventListener("hashchange", showPage);

document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && currentPage() === "shot" && !state.image.open) {
    e.preventDefault();
    roll();
  }
});

listenForPaste();
installTooltips();
// the skip key: the focus goes to the page open (its region), so the next Tab is the page's own first key, past the header and its rooms
document.getElementById("skip-link")?.addEventListener("click", () => {
  const page = document.querySelector(".page:not([hidden])");
  if (!page) return;
  page.setAttribute("tabindex", "-1");
  page.focus({ preventScroll: true });
});
// the header's compass: the tour of the page open (web/js/tour.js, web/js/tours/)
installTourKey(document.getElementById("tour-key"), currentPage);

// the page the app opens on starts loading its panel now, while the state comes from the server
warm[currentPage()]?.();

load()
  .then(() => {
    started = true;
    showPage();
    // the Stage (three.js and all) loads when it is needed; an outside agent (the control MCP) can stage a scene from anywhere, and
    // its first command is what loads it, so the page listens for it from the start
    (window.requestIdleCallback ?? ((fn) => setTimeout(fn, 1200)))(() => listenForAgents());
    const repo = document.getElementById("repo-link");
    if (state.info?.repository) {
      repo.href = state.info.repository;
      repo.append(icon("github"));
    }
  })
  .catch((error) => toast(`Can't reach the Comfyture server: ${error.message}`, { tone: "crit" }));
