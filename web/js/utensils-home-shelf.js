// Home's SHELF: the foot of the page. Not a picture: an index of every tool the shelf holds, A to Z, each one a small link that opens it,
// with a dot for where it runs (green: free, on this machine; violet: Comfy Cloud). A letter in the strip narrows the index to the tools
// that start with it; "All" brings them back. The key opens the Shelf, the plain catalogue. It is what a page ends with when it has
// shown every workspace: the way to everything.
import { shelfTools } from "./utensils.js";
import { wayOf, MARK } from "./utensils-home-facts.js";
import { h, eyebrow, openKey, openTool } from "./utensils-home-ui.js";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export function shelfSection() {
  let letter = "all";
  const index = h("div.hs-index");
  const strip = h("div.hs-letters", { role: "group", "aria-label": "Narrow the index to a letter" });
  const count = h("span.hs-count", {});

  function build() {
    const tools = [...shelfTools()].sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
    const has = new Set(tools.map((t) => (t.name[0] ?? "").toUpperCase()));
    if (letter !== "all" && !has.has(letter)) letter = "all";
    count.textContent = `${tools.length} tools`;
    strip.replaceChildren(...["all", ...LETTERS].map((l) => h("button.hs-letter", {
      type: "button", disabled: l !== "all" && !has.has(l), "aria-pressed": String(l === letter), dataset: { letter: l },
      on: { click: () => ((letter = l), build()) },
    }, l === "all" ? "All" : l)));
    const groups = new Map();
    for (const t of tools) {
      const key = (t.name[0] ?? "#").toUpperCase();
      if (letter === "all" || letter === key) groups.set(key, [...(groups.get(key) ?? []), t]);
    }
    index.replaceChildren(...[...groups].map(([key, list]) => h("div.hs-group", {},
      h("b.hs-initial", {}, key),
      h("ul.hs-list", {}, ...list.map((t) => h("li", {}, h("button.hs-link", { type: "button", title: `${t.name}: ${MARK[wayOf(t)]}`, dataset: { tool: t.id, way: wayOf(t) }, on: { click: () => openTool(t) } },
        h(`i.hs-dot.is-${wayOf(t)}`, {}), t.name)))))));
  }

  const el = h("footer.hs", { "aria-label": "The shelf", dataset: { section: "shelf" } },
    h("div.hs-top", {},
      h("div.hs-heading", {}, eyebrow("Utensils"), h("h2.hs-title", {}, "The Shelf", count)),
      strip,
      openKey("Open the Shelf", "shelf")),
    index);

  function update() {
    build();
  }
  const sig = () => JSON.stringify(shelfTools().map((t) => [t.id, t.name]));
  return { el, update, sig };
}
