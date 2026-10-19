import { h, sprite, icon } from "../dom.js";
import { state, setProject, projectNow } from "../store.js";
import { PAGES, PRODUCTS, currentPage, productOf } from "../router.js";
import { story } from "../story.js";
import { cut } from "../cut.js";

const ICON = { story: "section-story", stage: "section-stage", shot: "section-shot", cut: "edit-scissors", library: "batch" };

/** The products: each its mark and its name, the one open lit; its tooltip says what it is for. */
export function renderProducts(el) {
  const now = productOf(currentPage());
  el.replaceChildren(...Object.entries(PRODUCTS).map(([id, [name, line]]) =>
    h("a.product", { href: `#/${id}`, title: line, "aria-current": id === now ? "page" : undefined },
      sprite(`product-${id}`), h("span", {}, name))));
}

/** Kitchen's rooms (nothing in the other products). Story shows how far a film has got; Cut shows how many clips wait in it. */
export function renderNav(el) {
  const page = currentPage();
  if (productOf(page) !== "kitchen") return el.replaceChildren();
  const dir = state.director;
  const busy = ["planning", "making", "cutting"].includes(dir.phase);
  const done = dir.shotsState.filter((s) => s.step === "done").length;
  const badge = (id) => {
    if (id === "story" && busy) {
      const text = dir.phase === "planning" ? "Planning" : dir.phase === "cutting" ? "Cutting" : `${done}/${dir.plan.shots.length}`;
      return h("span.section-badge", {}, h("span.lamp", { dataset: { tone: "busy" } }), text);
    }
    // a story at work: writing a step, or drawing its sheets and panels
    if (id === "story" && story.busy.size) {
      const writing = [...story.busy].some((k) => !k.includes(":"));
      return h("span.section-badge", {}, h("span.lamp", { dataset: { tone: "busy" } }), writing ? "Writing" : `Drawing ${story.busy.size}`);
    }
    if (id === "cut" && cut.busy.size) return h("span.section-badge", {}, h("span.lamp", { dataset: { tone: "busy" } }), cut.busy.has("render") ? "Rendering" : `Making ${cut.busy.size}`);
    return null;
  };
  // the project open, before its sections: its name leads home, the cross leaves it
  const p = state.project ? projectNow() ?? story.list.find((s) => s.id === state.project) ?? { name: "This film" } : null;
  el.replaceChildren(
    ...(p ? [h("span.project-chip", {},
      h("a.project-chip-name", { href: "#/kitchen", title: "The film open\nEvery section shows its work only" }, p.cover?.pic || p.thumb ? h("img", { src: p.cover?.pic ?? p.thumb, alt: "", draggable: false }) : sprite("film-make"), h("span", {}, p.name)),
      h("button.project-chip-x", { type: "button", title: "Leave the film\nEvery section shows all your work again", "aria-label": "Leave the film", on: { click: () => setProject(null) } }, icon("close")))] : []),
    ...Object.entries(PAGES).map(([id, label]) =>
      h("a.section", { href: `#/${id}`, "aria-current": id === page ? "page" : undefined }, sprite(ICON[id]), h("span", {}, label), badge(id))));
}
