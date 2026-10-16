import { icon } from "./dom.js";
import { installTooltips } from "./tooltip.js";
import { state, load, onChange, roll, toast } from "./store.js";
import { PAGES, currentPage } from "./router.js";
import { renderSources, listenForPaste } from "./panels/sources.js";
import { renderMonitor } from "./panels/monitor.js";
import { renderScript } from "./panels/script.js";
import { renderPresets } from "./panels/presets.js";
import { renderSettings } from "./panels/settings.js";
import { renderTakes } from "./panels/takes.js";
import { renderTabs, renderActions } from "./panels/tabs.js";
import { renderDirector } from "./panels/director.js";
import { renderStatus } from "./panels/status.js";
import { renderNav } from "./panels/nav.js";
import { renderLibrary } from "./panels/library.js";
import { renderEdit } from "./panels/edit.js";
import { renderAssistant } from "./panels/assistant.js";
import { renderImage } from "./panels/image.js";

const $ = (id) => document.getElementById(id);

// every panel, the element it draws into, and the section it belongs to (none: always on screen)
const panels = {
  nav: [$("nav"), renderNav],
  status: [$("cloud"), renderStatus],
  sources: [$("sources"), renderSources, "create"],
  monitor: [$("monitor"), renderMonitor, "create"],
  script: [$("script"), renderScript, "create"],
  presets: [$("presets"), renderPresets, "create"],
  settings: [$("settings"), renderSettings, "create"],
  takes: [$("takes"), renderTakes, "create"],
  assistant: [$("assistant"), renderAssistant, "create"],
  image: [$("image"), renderImage],
  tabs: [$("tabs"), renderTabs, "create"],
  actions: [$("actions"), renderActions, "create"],
  director: [$("page-director"), renderDirector, "director"],
  library: [$("page-library"), renderLibrary, "library"],
  edit: [$("page-edit"), renderEdit, "edit"],
};

// Redraws are batched to one per frame; text fields keep focus because the
// panels that hold them only redraw on structural changes. A panel on a page you
// aren't looking at waits (stale) and draws when you go there.
const pending = new Set();
const stale = new Set();
let scheduled = false;

function flush() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    const active = document.activeElement;
    for (const name of pending) {
      const [el, render, page] = panels[name];
      if (page && page !== currentPage()) {
        stale.add(name);
        continue;
      }
      // the assistant and the Image window keep their composers across redraws, so they can always draw
      if (name !== "monitor" && name !== "assistant" && name !== "image" && el.contains(active) && active.matches("input, textarea, select")) continue;
      // a redraw replaces the panel's children, which would scroll it back to the top
      const top = el.scrollTop;
      const lists = new Map([...el.querySelectorAll("[data-scroll-key]")].map((n) => [n.dataset.scrollKey, n.scrollTop]));
      render(el);
      el.scrollTop = top;
      for (const n of el.querySelectorAll("[data-scroll-key]")) if (lists.has(n.dataset.scrollKey)) n.scrollTop = lists.get(n.dataset.scrollKey);
    }
    pending.clear();
  });
}

onChange((scopes) => {
  for (const scope of scopes) {
    if (scope === "all") Object.keys(panels).forEach((p) => pending.add(p));
    else if (scope === "preview") pending.add("monitor").add("takes").add("tabs");
    else if (scope === "paint") pending.add("sources");
    else if (scope === "director") pending.add("tabs").add("director").add("nav");
    else if (panels[scope]) pending.add(scope);
    // the header's keys and status follow the takes, the tabs and any running job
    if (["takes", "tabs", "paint", "sources", "director", "edit"].includes(scope)) pending.add("actions").add("status").add("nav");
    // takes and films are the library's and the edit's material too
    if (scope === "takes") pending.add("library").add("edit");
    if (scope === "sources") pending.add("assistant");
    if (scope === "tabs" || scope === "takes") pending.add("tabs");
  }
  flush();
});

/** Shows the section the address names, and draws what changed while it was hidden. */
function showPage() {
  const page = currentPage();
  for (const el of document.querySelectorAll(".page")) el.hidden = el.dataset.page !== page;
  document.body.dataset.page = page;
  document.title = `${PAGES[page]} · Comfyture`;
  if (page !== "create") document.querySelectorAll("#page-create video").forEach((v) => v.pause());
  for (const [name, [, , owner]] of Object.entries(panels)) {
    if (owner === page && (stale.has(name) || !panels[name][0].childElementCount)) pending.add(name);
    if (owner === page) stale.delete(name);
  }
  pending.add("nav");
  flush();
  window.scrollTo({ top: 0 });
}
window.addEventListener("hashchange", showPage);

document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && currentPage() === "create" && !state.image.open) {
    e.preventDefault();
    roll();
  }
});

listenForPaste();
installTooltips();

load()
  .then(() => {
    showPage();
    const repo = document.getElementById("repo-link");
    if (state.info?.repository) {
      repo.href = state.info.repository;
      repo.append(icon("github"));
    }
  })
  .catch((error) => toast(`Can't reach the Comfyture server: ${error.message}`, { tone: "crit" }));
