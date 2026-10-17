import { h, sprite } from "../dom.js";
import { state } from "../store.js";
import { PAGES, currentPage } from "../router.js";

const ICON = { story: "section-story", stage: "section-stage", shot: "section-shot", cut: "edit-scissors", library: "batch" };

/** The sections. Story shows how far a film has got; Cut shows how many clips wait in it. */
export function renderNav(el) {
  const page = currentPage();
  const dir = state.director;
  const busy = ["planning", "making", "cutting"].includes(dir.phase);
  const done = dir.shotsState.filter((s) => s.step === "done").length;
  const badge = (id) => {
    if (id === "story" && busy) {
      const text = dir.phase === "planning" ? "Planning" : dir.phase === "cutting" ? "Cutting" : `${done}/${dir.plan.shots.length}`;
      return h("span.section-badge", {}, h("span.lamp", { dataset: { tone: "busy" } }), text);
    }
    if (id === "cut" && state.edit.clips.length) return h("span.section-badge", {}, String(state.edit.clips.length));
    return null;
  };
  el.replaceChildren(...Object.entries(PAGES).map(([id, label]) =>
    h("a.section", { href: `#/${id}`, "aria-current": id === page ? "page" : undefined }, sprite(ICON[id]), h("span", {}, label), badge(id))));
}
