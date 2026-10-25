// Home's VFX: "the wipe wall". Five panels of different sizes, set off against each other, each a before and after with a wipe line you
// can drag (the big one wipes on the diagonal); left alone, the lines drift to and fro, each at its own pace, while the wall is on
// screen. Under every panel's name is where it runs (Cloud or free, as the tool says itself); the name opens the tool. The rest of
// the effects are one strip, "+N more", that opens the VFX workspace. The pictures are the ones VFX's own cards show.
import { artOf, vfxById } from "./utensils-vfx-tools.js";
import { wayOf, MARK } from "./utensils-home-facts.js";
import { h, sprite, icon, eyebrow, line, openKey, openTool, find, toolsOf, setWorkspace, whileSeen, calm, drag, photo } from "./utensils-home-ui.js";

/** The five of the wall: the first is the big one, on the diagonal; `pace` is how long its line takes to go there and back (seconds). */
const PANELS = [
  { id: "vfx-background", big: true, pace: 11, from: 0.42 },
  { id: "vfx-relight", pace: 8, from: 0.2 },
  { id: "vfx-chroma", pace: 9.5, from: 0.7 },
  { id: "vfx-remove", pace: 7, from: 0.55 },
  { id: "vfx-restyle", pace: 10.5, from: 0.35 },
];
const SLANT = 9;

export function vfxSection() {
  const wall = h("div.hx-wall");
  const strip = h("button.hx-more", { type: "button", title: "Open VFX", on: { click: () => setWorkspace("vfx") } });
  const running = []; // { el, slider, pace, k (where in its swing) }
  let raf = 0;
  let last = 0;

  /** One panel: the two pictures, the line, the name that opens the tool, the mark of where it runs. */
  function panel(p, tool) {
    const art = artOf(tool.id);
    const way = wayOf(tool);
    const x = (v) => (p.big ? -SLANT + v * (100 + 2 * SLANT) : v * 100);
    const before = photo(art.before);
    const after = photo(art.after);
    const lineEl = h("span.hx-line", { role: "slider", tabindex: "0", "aria-label": `${tool.name}: before and after (drag the line, or use the arrow keys)`, "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": "50" }, h("i", {}, icon("chevron"), icon("chevron")));
    const el = h(`figure.hx-panel${p.big ? ".is-big" : ""}`, { dataset: { tool: tool.id }, title: "A sample: drag the line. Nothing here runs a tool." },
      h("div.hx-pic.is-before", {}, before),
      h("div.hx-pic.is-after", {}, after),
      lineEl,
      h("span.hx-tag.is-l", {}, "Before"), h("span.hx-tag.is-r", {}, "After"),
      h("figcaption.hx-cap", {},
        h("button.hx-name", { type: "button", title: `Open ${tool.name}: ${tool.hint ?? ""}`, on: { click: () => openTool(tool) } }, sprite(tool.icon), h("b", {}, tool.name)),
        h(`span.hx-way.is-${way}`, { title: vfxById(tool.id).tag ?? "" }, MARK[way])));
    const slider = drag(el, (v) => {
      el.style.setProperty("--x", `${x(v).toFixed(2)}%`);
      lineEl.setAttribute("aria-valuenow", String(Math.round(v * 100)));
    }, { start: p.from, keyTarget: lineEl });
    running.push({ el, slider, pace: p.pace, k: back(p.from) });
    return el;
  }

  const back = (v) => Math.asin(Math.max(-1, Math.min(1, (v - 0.5) / 0.4)));
  function drift(now) {
    const dt = last ? Math.min(64, now - last) : 0;
    last = now;
    for (const r of running) {
      // a line that is held, or has a hand over it, stays where it is, and goes on from there
      if (r.el.matches(".is-dragging, :hover, :has(:focus-visible)")) {
        r.held = true;
        continue;
      }
      if (r.held) ((r.k = back(r.slider.get())), (r.held = false));
      r.k += (dt / 1000 / r.pace) * Math.PI * 2;
      r.slider.set(0.5 + Math.sin(r.k) * 0.4);
    }
    raf = requestAnimationFrame(drift);
  }
  whileSeen(wall, () => {
    if (calm()) return;
    last = 0;
    for (const r of running) r.k = back(r.slider.get());
    raf = requestAnimationFrame(drift);
  }, () => cancelAnimationFrame(raf));

  function build() {
    running.length = 0;
    const list = PANELS.map((p) => ({ p, tool: find(p.id) })).filter((x) => x.tool);
    wall.replaceChildren(...list.map(({ p, tool }) => panel(p, tool)));
    const rest = toolsOf("vfx").filter((t) => !PANELS.some((p) => p.id === t.id));
    strip.hidden = !rest.length;
    strip.replaceChildren(
      h("span.hx-more-n", {}, `+${rest.length} more`),
      h("span.hx-more-list", {}, ...rest.map((t) => h("span.hx-more-tool", { title: t.name }, sprite(t.icon), h("span", {}, t.name)))),
      h("span.hx-more-go", {}, "Open VFX", icon("next")));
  }

  const el = h("section.hx", { "aria-label": "VFX", dataset: { section: "vfx" } },
    h("header.hx-head", {},
      h("div.hx-heading", {}, eyebrow("Utensils · 04"), h("h2.hx-title", { "data-text": "VFX" }, "VFX")),
      line("Change what is in a shot: its light, its weather, its look, what is in it."),
      openKey("Open VFX", "vfx")),
    wall, strip);

  function update() {
    build();
  }
  const sig = () => JSON.stringify([PANELS.map((p) => find(p.id)?.id), toolsOf("vfx").map((t) => t.id)]);
  return { el, update, sig };
}
