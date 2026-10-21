// The Utensils SHELF: the catalogue of every tool, plain. A search and a filter (all, free, cloud) over the tools, grouped by the workspace
// they live in, each a row with its icon, its name, what it does and whether it runs here or on Comfy Cloud. The dashboard that shows
// off the workspaces, the featured tool, the mini apps, the latest results and the credits is Home (utensils-space-home.js); the mini
// apps are the Templates workspace's own and are not here. The registry grows as workspaces register tools, so the list does.
// A workspace is { el, update, sig, count }: the shell (panels/utensils.js) draws it again when sig() changes.
import { h, sprite } from "./dom.js";
import { changed } from "./store.js";
import { shelfTools, toolsOf, pickTool, setWorkspace } from "./utensils.js";
import { WORKSPACES } from "./utensils-harness.js";
import { wayOf, MARK, findIn } from "./utensils-home-facts.js";
import { openGrade } from "./utensils-vfx-tools.js";

// how many templates the catalog holds (asked once: the Templates tile of the panel and Home show it)
let catalog = { state: "idle", total: null };
/** Asks how many templates the catalog holds (once); the screen is drawn again when it is known. */
export function loadTemplatesTotal() {
  if (catalog.state !== "idle") return;
  catalog.state = "loading";
  fetch("api/utensils/templates?limit=1")
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error("none"))))
    .then((out) => (catalog = { state: "ready", total: out.total ?? out.count ?? null }))
    .catch(() => (catalog = { state: "none", total: null }))
    .finally(() => changed("utensils"));
}
/** How many templates the catalog holds (null until it has been asked): the Templates tile of the panel shows it. */
export const templatesTotal = () => catalog.total;

const FILTERS = [["all", "All"], ["free", "Free"], ["cloud", "Cloud"]];

export function shelfSpace() {
  const el = h("div.ut-grid.is-shelf");
  let query = "";
  let way = "all";
  const groups = h("div.ut-sh-groups");
  const count = h("span.ut-b-note");
  const filters = h("div.ut-segs", { role: "group", "aria-label": "Where it runs" });
  const input = h("input.ut-hm-find.ut-sh-find", { type: "text", placeholder: "Find a tool…", "aria-label": "Find a tool", autocomplete: "off", spellcheck: false, on: { input: (e) => ((query = e.target.value), draw()) } });
  const open = (t) => (t.id === "vfx-grade" ? openGrade() : pickTool(t.id));

  /** The tools to show: those that pass the filter and match what was typed, in the registry's order. */
  function visible() {
    const all = shelfTools().filter((t) => way === "all" || (way === "free" ? wayOf(t) !== "cloud" : wayOf(t) !== "free"));
    if (!query.trim()) return all;
    const keep = new Set(findIn(all, query, all.length));
    return all.filter((t) => keep.has(t));
  }
  function draw() {
    const list = visible();
    const total = shelfTools().length;
    count.textContent = list.length === total ? `${total} tools` : `${list.length} of ${total}`;
    filters.replaceChildren(...FILTERS.map(([id, label]) => h("button.ut-seg", { type: "button", "aria-pressed": String(way === id), dataset: { way: id }, on: { click: () => ((way = id), draw()) } }, label)));
    const sections = WORKSPACES.map((w) => ({ w, tools: list.filter((t) => t.workspace === w.id) })).filter((s) => s.tools.length);
    groups.replaceChildren(...(sections.length
      ? sections.map(({ w, tools }) => h("section.ut-sh-group", { dataset: { ws: w.id } },
        h("button.ut-sh-head", { type: "button", title: `Open ${w.name}`, on: { click: () => setWorkspace(w.id) } }, sprite(w.icon), h("span", {}, w.name), h("em", {}, String(tools.length))),
        ...tools.map((t) => h("button.ut-sh-row", { type: "button", title: t.hint ?? t.name, dataset: { tool: t.id, way: wayOf(t) }, on: { click: () => open(t) } },
          h("span.ut-sh-icon", {}, sprite(t.icon)),
          h("span.ut-sh-text", {}, h("b", {}, t.name), h("span", {}, t.hint ?? "")),
          h(`span.ut-hm-mark.is-${wayOf(t)}`, {}, MARK[wayOf(t)])))))
      : [h("div.ut-empty", {}, h("span", {}, "No tool by that name."))]));
  }

  function update() {
    draw();
    el.replaceChildren(h("section.ut-bento.ut-sh-card", { "aria-label": "All tools" },
      h("div.ut-b-head", {}, h("span.ut-b-label", {}, "All tools"), count, h("span.spacer"), filters,
        h("span.ut-sh-search", {}, input)),
      groups));
  }
  const sig = () => JSON.stringify([WORKSPACES.map((w) => toolsOf(w.id).map((t) => t.id).join())]);
  return { el, update, sig, count: () => shelfTools().length };
}
