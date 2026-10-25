// Home's PICTURE: "the light table". One photograph and one big before/after slider you can drag, with the four tools laid out as tall
// rows beside it and as four tabs under it; each tool shows its own pair (upscale: soft to sharp; remove background: the scene to the
// subject on a checker; variations: one picture to four takes; edit with words: a photograph to a watercolour). Lighting a tool swaps the
// pair; its name, or its Open key, opens the tool. The pictures are made once (docs/brand/products/utensils-v4/art) and are samples,
// said so in the tooltip: nothing here runs a tool.
import { estimate } from "./utensils.js";
import { h, icon, sprite, eyebrow, line, openKey, openTool, find, drag, whileSeen, calm, photo } from "./utensils-home-ui.js";

const DIR = "brand/utensils/home";
/** The four tools in the order of the rows, and the pair each shows. */
const TOOLS = [
  { id: "upscale", pair: "pic-upscale", promise: "More detail, up to 4× larger", tab: "Upscale" },
  { id: "cutout", pair: "pic-cutout", promise: "Keep the subject, lose the backdrop", tab: "Remove background", checker: true },
  { id: "variations", pair: "pic-variations", promise: "Four new takes of the same picture", tab: "Variations" },
  { id: "edit", pair: "pic-edit", promise: "Say what to change, the rest stays", tab: "Edit with words" },
];

export function pictureSection() {
  let on = TOOLS[0].id;
  let swept = false;

  // ------------------------------------------------------------ the slider
  const before = photo(`${DIR}/${TOOLS[0].pair}-before.webp`, { eager: true });
  const after = photo(`${DIR}/${TOOLS[0].pair}-after.webp`, { eager: true });
  const afterLayer = h("div.hpp-layer.is-after", {}, after);
  const beforeLayer = h("div.hpp-layer.is-before", {}, before);
  const handle = h("span.hpp-handle", {}, h("i", {}, icon("chevron"), icon("chevron")));
  const tagBefore = h("span.hpp-tag.is-left", {}, "Before");
  const tagAfter = h("span.hpp-tag.is-right", {}, "After");
  const cmp = h("div.hpp-cmp", { role: "slider", tabindex: "0", "aria-label": "Before and after: drag, or use the arrow keys", "aria-valuemin": "0", "aria-valuemax": "100", title: "A sample: drag the line. Nothing here runs a tool." }, beforeLayer, afterLayer, tagBefore, tagAfter, handle);
  const slide = drag(cmp, (v) => {
    cmp.style.setProperty("--w", `${(v * 100).toFixed(2)}%`);
    cmp.setAttribute("aria-valuenow", String(Math.round(v * 100)));
  }, { start: 0.5 });
  // the first time it is seen it sweeps once from side to side, so the line is known to move (not for a person who asked for less motion)
  whileSeen(cmp, () => {
    if (swept || calm()) return;
    swept = true;
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / 1500);
      if (cmp.classList.contains("is-dragging")) return;
      slide.set(0.5 + Math.sin(k * Math.PI * 2) * 0.34 * (1 - k * 0.2));
      if (k < 1) requestAnimationFrame(step);
      else slide.set(0.5);
    };
    requestAnimationFrame(step);
  }, () => {});

  // ------------------------------------------------------------ the tabs and the rows
  const tabs = h("div.hpp-tabs", { role: "tablist", "aria-label": "Picture tools" });
  const rows = h("ol.hpp-rows");

  function show(id) {
    on = id;
    const t = TOOLS.find((x) => x.id === id);
    before.src = `${DIR}/${t.pair}-before.webp`;
    after.src = `${DIR}/${t.pair}-after.webp`;
    afterLayer.classList.toggle("is-checker", !!t.checker);
    for (const b of tabs.children) b.setAttribute("aria-selected", String(b.dataset.tool === id));
    for (const r of rows.children) r.classList.toggle("is-on", r.dataset.tool === id);
    slide.set(0.5);
  }
  // the other pairs are fetched once the first is seen, so a tab answers at once
  whileSeen(cmp, () => TOOLS.slice(1).forEach((t) => ["before", "after"].forEach((k) => (new Image().src = `${DIR}/${t.pair}-${k}.webp`))), () => {});

  function build() {
    const list = TOOLS.map((t) => ({ ...t, tool: find(t.id) })).filter((t) => t.tool);
    if (!list.some((t) => t.id === on)) on = list[0]?.id ?? on;
    tabs.replaceChildren(...list.map((t) => h("button.hpp-tab", { type: "button", role: "tab", dataset: { tool: t.id }, "aria-selected": String(t.id === on), on: { click: () => show(t.id) } }, sprite(t.tool.icon), h("span", {}, t.tab))));
    rows.replaceChildren(...list.map((t) => {
      const n = estimate(t.tool);
      return h(`li.hpp-row${t.id === on ? ".is-on" : ""}`, { dataset: { tool: t.id }, tabindex: "0", "aria-label": `${t.tool.name}: ${t.promise}`, on: { click: () => show(t.id), keydown: (e) => e.key === "Enter" && show(t.id) } },
        h("span.hpp-row-icon", {}, sprite(t.tool.icon)),
        h("div.hpp-row-text", {}, h("button.hpp-row-name", { type: "button", title: `Open ${t.tool.name}`, on: { click: (e) => (e.stopPropagation(), openTool(t.tool)) } }, t.tool.name), h("span", {}, t.promise)),
        h("span.hpp-row-price", {}, typeof n === "number" ? `≈ ${n} cr` : "your GPU"),
        h("button.hpp-row-go", { type: "button", title: `Open ${t.tool.name}`, "aria-label": `Open ${t.tool.name}`, on: { click: (e) => (e.stopPropagation(), openTool(t.tool)) } }, icon("next")));
    }));
    show(on);
  }

  const el = h("section.hpp", { "aria-label": "Picture", dataset: { section: "picture" } },
    h("header.hpp-top", {},
      h("span.hpp-badge", {}, sprite("image-library")),
      h("div.hpp-heading", {}, eyebrow("Utensils · 01"), h("h2.hpp-title", {}, "Picture"), line("Change a photograph without losing it.")),
      h("p.hpp-blurb", {}, "Sharpen it, lift the subject out, try it four ways or tell it what to change. Natural results, real detail, in seconds."),
      openKey("Open Picture", "picture")),
    h("div.hpp-body", {}, h("div.hpp-stage", {}, cmp, tabs), rows));

  function update() {
    build();
  }
  const sig = () => JSON.stringify(TOOLS.map((t) => { const x = find(t.id); return x ? [x.id, x.icon, estimate(x)] : null; }));
  return { el, update, sig };
}
