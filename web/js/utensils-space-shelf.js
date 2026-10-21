// The Utensils SHELF: a real bookcase. On top, three walnut shelves with a book for every tool, coloured by the workspace it belongs to
// and grouped under a brass plate that names it (utensils-shelf-case.js); a book shows what its tool does when it is pointed at, and
// opens the tool in its own workspace. Under it, FROM THE SHELF: four demos of tools picked at random from four workspaces, to try one
// (utensils-shelf-demos.js). What a tool shows, in both, is utensils-shelf-show.js's. The registry grows as workspaces register tools,
// so the shelves do. A workspace is { el, update, sig, count }: the shell (panels/utensils.js) draws it again when sig() changes.
import { h } from "./dom.js";
import { changed } from "./store.js";
import { shelfTools, toolsOf } from "./utensils.js";
import { WORKSPACES } from "./utensils-harness.js";
import { apps } from "./utensils-templates-api.js";
import { bookcase } from "./utensils-shelf-case.js";
import { shelfDemos } from "./utensils-shelf-demos.js";

// how many templates the catalog holds (asked once: the Templates tile of the panel, Home and the Templates volume show it)
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

export function shelfSpace() {
  const books = bookcase();
  const demos = shelfDemos();
  const el = h("div.ut-grid.is-shelf", {}, h("section.sh-case", { "aria-label": "The bookcase" }, books.el), demos.el);

  function update() {
    books.build(templatesTotal());
    demos.deal();
  }
  // the shelves are made again when a tool is registered, when the catalogue's count comes, and when the mini apps' pictures do
  const sig = () => JSON.stringify([WORKSPACES.map((w) => toolsOf(w.id).map((t) => t.id).join()), templatesTotal(), apps.total, apps.list.filter((a) => a.thumb).length > 0]);
  return { el, update, sig, count: () => shelfTools().length };
}
