// FROM THE SHELF: under the bookcase, four large demos of tools picked at random, each from a different workspace and each a different
// kind of sample (a before and after you can drag, a clip that plays, a sound, an Edit timeline you can trim, the mini apps' posters),
// so the person sees what they could do next. A new pick every time the Shelf is visited, and on Shuffle (with a short cross-fade).
// Each demo carries its workspace's chip in its colour, the tool's name and what it does, and "Try it" opens the tool in its workspace.
import { h, icon, sprite } from "./dom.js";
import { utensils, toolsOf, setWorkspace } from "./utensils.js";
import { WORKSPACES } from "./utensils-harness.js";
import { openTool, whileSeen } from "./utensils-home-ui.js";
import { apps } from "./utensils-templates-api.js";
import { kindOf, pairView, clipView, waveView, trimView, appsView, colorOf, sectionOf } from "./utensils-shelf-show.js";

/** The kinds of demo, in the order they sit when picked; the first four that have a tool are shown. */
const KINDS = ["pair", "clip", "wave", "edit", "apps"];

/** A small seeded random (the pick is the same for one visit, a new one for the next). */
function seeded(seed) {
  let x = seed >>> 0 || 1;
  return () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

/** The candidates of each kind: the registry's tools that have that kind of sample (and the mini apps, when there are some). */
function candidates() {
  const all = WORKSPACES.filter((w) => w.color).flatMap((w) => toolsOf(w.id).filter((t) => t.id !== "template"));
  const by = Object.fromEntries(KINDS.map((k) => [k, []]));
  for (const t of all) {
    const k = kindOf(t);
    if (by[k]) by[k].push(t);
  }
  if (apps.list.some((a) => a.thumb)) by.apps.push({ id: "vol-apps", name: "Mini apps", hint: "A ready-made ComfyUI workflow with one form: a picture in, a result out", icon: "tool-templates", workspace: "templates" });
  return by;
}

/** Four tools of four different workspaces, one per kind, in a random order of kinds. */
function pick(seed) {
  const rnd = seeded(seed);
  const by = candidates();
  const kinds = KINDS.filter((k) => by[k].length).sort(() => rnd() - 0.5);
  const out = [];
  const used = new Set();
  for (const k of kinds) {
    const pool = by[k].filter((t) => !used.has(t.workspace));
    if (!pool.length) continue;
    const t = pool[Math.floor(rnd() * pool.length)];
    used.add(t.workspace);
    out.push({ kind: k, tool: t });
    if (out.length === 4) break;
  }
  return out;
}

export function shelfDemos() {
  const cards = h("div.sd-cards");
  const shuffle = h("button.sd-shuffle", { type: "button", title: "Four other tools", on: { click: () => deal(true) } }, icon("shuffle"), h("span", {}, "Shuffle"));
  const el = h("section.sd", { "aria-label": "From the shelf" },
    h("header.sd-head", {}, h("span.sd-label", {}, "From the shelf"), shuffle, h("span.sd-note", {}, "Four tools to try, picked at random")),
    cards);
  let seed = Date.now();
  let dealt = "";
  let away = false;

  function demo({ kind, tool }) {
    const s = sectionOf(tool.workspace);
    const media = kind === "pair" ? pairView(tool, { slider: true }) : kind === "clip" ? clipView(tool, { playable: true }) : kind === "wave" ? waveView(tool, { sample: true }) : kind === "edit" ? trimView(tool) : appsView();
    const open = () => (tool.id === "vol-apps" ? (setWorkspace("templates"), document.dispatchEvent(new CustomEvent("utensils:apps"))) : openTool(tool));
    return h(`article.sd-card.is-${kind}`, { dataset: { tool: tool.id, ws: tool.workspace }, style: { "--sec": colorOf(tool.workspace) } },
      h("div.sd-media", {}, media),
      h("footer.sd-foot", {},
        h("span.sd-glyph", {}, sprite(tool.icon)),
        h("div.sd-text", {},
          h("button.sd-chip", { type: "button", title: `Open ${s.name}`, on: { click: () => setWorkspace(tool.workspace) } }, s.name),
          h("b", {}, tool.short ?? tool.name),
          h("span", {}, tool.hint ?? "")),
        h("button.sd-try", { type: "button", title: `Open ${tool.name} in ${s.name}`, on: { click: open } }, "Try it", icon("next"))));
  }

  /** Deals four demos; `again`: a new pick (Shuffle), with a short cross-fade. */
  function deal(again = false) {
    if (again) seed = (seed * 48271 + 11) % 2147483647;
    const list = pick(seed);
    const sig = JSON.stringify(list.map((d) => d.tool.id));
    if (sig === dealt && !again) return;
    dealt = sig;
    const put = () => cards.replaceChildren(...list.map(demo));
    if (!again || !cards.childElementCount) return put();
    cards.classList.add("is-fading");
    setTimeout(() => (put(), requestAnimationFrame(() => cards.classList.remove("is-fading"))), 180);
  }
  // a new pick for every visit: when the Shelf comes back after another workspace or product was open (not when the browser's tab was)
  whileSeen(el, () => {
    if (away) ((away = false), deal(true));
  }, () => (away = utensils.workspace !== "shelf" || !/utensils/.test(location.hash)));

  return { el, deal };
}
