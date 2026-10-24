import { icon } from "./dom.js";
import { installTooltips } from "./tooltip.js";
import { state, load, onChange, roll, toast } from "./store.js";
import { PAGES, PRODUCTS, currentPage, productOf } from "./router.js";
import { renderSources, listenForPaste } from "./panels/sources.js";
import { renderMonitor } from "./panels/monitor.js";
import { renderScript } from "./panels/script.js";
import { renderPresets } from "./panels/presets.js";
import { renderSettings } from "./panels/settings.js";
import { renderTakes } from "./panels/takes.js";
import { renderTabs, renderActions } from "./panels/tabs.js";
import { renderStory } from "./panels/story.js";
import { renderStatus } from "./panels/status.js";
import { renderNav, renderProducts } from "./panels/nav.js";
import { renderLibrary } from "./panels/library.js";
import { renderCut } from "./panels/cut.js";
import { renderHome } from "./panels/home.js";
import { renderWelcome } from "./panels/welcome.js";
import { renderMixer } from "./panels/mixer.js";
import { renderUtensils } from "./panels/utensils.js";
import { renderMacaron } from "./panels/macaron.js";
import { renderSpice } from "./panels/spice.js";
import { renderToaster } from "./panels/toaster.js";
import { renderJam } from "./panels/jam.js";
import { renderAssistant } from "./panels/assistant.js";
import { renderImage } from "./panels/image.js";
import { renderStage, mountStage } from "./panels/stage.js";
// the open film, kept in step with the section on screen
import "./project.js";

const $ = (id) => document.getElementById(id);

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
  image: [$("image"), renderImage],
  tabs: [$("tabs"), renderTabs, "shot"],
  actions: [$("actions"), renderActions, "shot"],
  story: [$("page-story"), renderStory, "story"],
  library: [$("page-library"), renderLibrary, "library"],
  cut: [$("page-cut"), renderCut, "cut"],
  welcome: [$("page-home"), renderWelcome, "home"],
  home: [$("page-kitchen"), renderHome, "kitchen"],
  mixer: [$("page-mixer"), renderMixer, "mixer"],
  jam: [$("page-jam"), renderJam, "jam"],
  macaron: [$("page-macaron"), renderMacaron, "macaron"],
  spice: [$("page-spice"), renderSpice, "spice"],
  toaster: [$("page-toaster"), renderToaster, "toaster"],
  utensils: [$("page-utensils"), renderUtensils, "utensils"],
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
    for (const name of pending) {
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
      render(el);
      el.scrollTop = top;
      for (const n of el.querySelectorAll("[data-scroll-key]")) if (lists.has(n.dataset.scrollKey)) n.scrollTop = lists.get(n.dataset.scrollKey);
      if (focused && !el.contains(document.activeElement)) [...el.querySelectorAll(KEYS)].find((n) => keyName(n) === focused)?.focus({ preventScroll: true });
    }
    pending.clear();
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

load()
  .then(() => {
    showPage();
    // the Stage (three.js and all) loads in the background, so the assistant and agents can use it from anywhere
    (window.requestIdleCallback ?? ((fn) => setTimeout(fn, 1200)))(() => mountStage());
    const repo = document.getElementById("repo-link");
    if (state.info?.repository) {
      repo.href = state.info.repository;
      repo.append(icon("github"));
    }
  })
  .catch((error) => toast(`Can't reach the Comfyture server: ${error.message}`, { tone: "crit" }));
