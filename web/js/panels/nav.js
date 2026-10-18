import { h, sprite } from "../dom.js";
import { state } from "../store.js";
import { PAGES, currentPage } from "../router.js";
import { story } from "../story.js";

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
    // a story at work: writing a step, or drawing its sheets and panels
    if (id === "story" && story.busy.size) {
      const writing = [...story.busy].some((k) => !k.includes(":"));
      return h("span.section-badge", {}, h("span.lamp", { dataset: { tone: "busy" } }), writing ? "Writing" : `Drawing ${story.busy.size}`);
    }
    if (id === "cut" && state.edit.clips.length) return h("span.section-badge", {}, String(state.edit.clips.length));
    return null;
  };
  el.replaceChildren(...Object.entries(PAGES).map(([id, label]) =>
    h("a.section", { href: `#/${id}`, "aria-current": id === page ? "page" : undefined }, sprite(ICON[id]), h("span", {}, label), badge(id))));
}
