// The Utensils "shelf": the home, every tool at a glance. A featured tool with its before/after, the quick tools (a grid of every
// tool that is on the shelf: the workspaces add theirs with registerTool and the grid grows), the mini apps (ComfyUI's own workflows,
// shown simply: a carousel of the first twelve, each opens in the Templates workspace), the latest results and what today cost. A workspace is { el, update, sig, count }: the shell (panels/utensils.js) draws it again when sig() changes.
import { h, icon, sprite, ago } from "./dom.js";
import { state, changed } from "./store.js";
import { utensils, shelfTools, pickTool, setWorkspace, openResult, toolById, creditsToday } from "./utensils.js";
import { loadApps, apps, openApp } from "./utensils-templates-api.js";
import { needPills, priceOf, appPicture } from "./utensils-apps-ui.js";

/** The tool the shelf shows off. Its art is a before/after (docs/brand/products/utensils-v2/art). */
const FEATURED = { tool: "remove-object", workspace: "vfx", title: "Remove an object from a video", line: "Clean shots in seconds with AI.", chips: ["VFX", "Comfy Cloud"], art: "brand/utensils/featured-remove.webp" };
const QUICK = 12;
const time = (s) => `${Math.floor((s ?? 0) / 60)}:${String(Math.floor((s ?? 0) % 60)).padStart(2, "0")}`;

// how many templates the catalog holds (asked once: the Templates tile of the panel shows it)
let catalog = { state: "idle", total: null };
function loadTotal(done) {
  if (catalog.state !== "idle") return;
  catalog.state = "loading";
  fetch("api/utensils/templates?limit=1")
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error("none"))))
    .then((out) => (catalog = { state: "ready", total: out.total ?? out.count ?? null }))
    .catch(() => (catalog = { state: "none", total: null }))
    .finally(() => (done(), changed("utensils")));
}
/** The day's credits as a line (an svg: h() makes html elements). */
function spark(points) {
  const wrap = document.createElement("span");
  wrap.className = "ut-spark";
  wrap.innerHTML = `<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><line x1="0" y1="92" x2="100" y2="92" stroke="currentColor" stroke-opacity=".28" stroke-width="1.2" stroke-dasharray="3 4" vector-effect="non-scaling-stroke"/>${points ? `<polyline points="${points}" fill="none" stroke="currentColor" stroke-width="2.4" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/>` : ""}</svg>`;
  return wrap;
}

/** How many templates the catalog holds (null until it has been asked): the Templates tile of the panel shows it. */
export const templatesTotal = () => catalog.total;

export function shelfSpace() {
  const el = h("div.ut-grid.is-shelf");
  let showAll = false;
  let refresh = () => {};

  // ------------------------------------------------------------ the bentos
  function featured() {
    const open = () => (toolById(FEATURED.tool).id === FEATURED.tool ? pickTool(FEATURED.tool) : setWorkspace(FEATURED.workspace));
    return h("section.ut-bento.is-featured", { "aria-label": "Featured" },
      h("div.ut-b-head", {}, h("span.ut-b-label", {}, "Featured")),
      h("div.ut-feat", {},
        h("div.ut-feat-text", {},
          h("h2", {}, FEATURED.title),
          h("p", {}, FEATURED.line),
          h("span.spacer"),
          h("div.ut-chips", {}, ...FEATURED.chips.map((c) => h("span.ut-pill", {}, c))),
          h("button.ut-primary", { type: "button", on: { click: open } }, "Open", icon("next"))),
        h("div.ut-feat-art", { "aria-hidden": "true" },
          h("img", { src: FEATURED.art, alt: "", draggable: false }),
          h("span.ut-feat-tag.is-left", {}, "Before"), h("span.ut-feat-tag.is-right", {}, "After"),
          h("span.ut-feat-split", {}, h("i", {}, icon("chevron"), icon("chevron"))))));
  }

  function quick() {
    const all = shelfTools();
    const list = showAll ? all : all.slice(0, QUICK);
    return h(`section.ut-bento.is-quick${showAll ? ".is-all" : ""}`, { "aria-label": "Quick tools" },
      h("div.ut-b-head", {}, h("span.ut-b-label", {}, "Quick tools"),
        all.length > QUICK ? h("button.ut-link", { type: "button", on: { click: () => ((showAll = !showAll), refresh()) } }, showAll ? "Fewer" : `All ${all.length} tools`, icon(showAll ? "close" : "next")) : h("span.ut-b-note", {}, `${all.length} tools`)),
      h("div.ut-quick", { dataset: { scrollKey: "ut-quick" } }, ...list.map((t) =>
        h("button.ut-quick-tool", { type: "button", title: t.hint, dataset: { tool: t.id }, on: { click: () => pickTool(t.id) } }, h("span.ut-quick-icon", {}, sprite(t.icon)), h("span", {}, t.name)))));
  }

  function appsBento() {
    const list = apps.list.slice(0, 12);
    const body = apps.state === "ready" && list.length
      ? h("div.ut-carousel", { dataset: { scrollKey: "ut-shelf-apps" } }, ...list.map((a) =>
        h("button.ut-tcard.is-app", { type: "button", title: a.promise, dataset: { app: a.id }, on: { click: () => openApp(a) } },
          h("span.ut-tcard-pic", {}, appPicture(a, { after: false })),
          h("b", {}, a.title),
          h("span", {}, a.promise),
          h("span.ut-chips", {}, ...needPills(a), priceOf(a) ? h("span.ut-tcard-price", {}, priceOf(a)) : null))))
      : h("div.ut-empty", {}, icon("sparkle"), h("span", {}, apps.state === "none" ? "Mini apps need Comfy Cloud" : "Loading the mini apps"));
    const more = apps.total && apps.total > list.length ? `Browse all ${apps.total} apps` : "Browse the apps";
    return h("section.ut-bento.is-apps", { "aria-label": "Mini apps" },
      h("div.ut-b-head", {}, h("span.ut-b-label", {}, "Mini apps"), h("button.ut-ghost", { type: "button", on: { click: () => (setWorkspace("templates"), document.dispatchEvent(new CustomEvent("utensils:apps"))) } }, more, icon("next"))),
      body);
  }

  function recentBento() {
    const list = utensils.results.slice(0, 8);
    return h("section.ut-bento.is-results", { "aria-label": "Recent results" },
      h("div.ut-b-head", {}, h("span.ut-b-label", {}, "Recent results"), h("span.ut-b-note", {}, `${utensils.results.length} ${utensils.results.length === 1 ? "item" : "items"}`)),
      list.length ? h("div.ut-strip8", {}, ...list.map((r) => {
        const t = toolById(r.tool);
        const pic = r.kind === "image" ? h(`img${r.clear ? ".is-clear" : ""}`, { src: r.url, alt: "", draggable: false, loading: "lazy" })
          : r.kind === "video" ? h("video", { src: r.url, muted: true, preload: "metadata", playsInline: true }) : h("span.ut-recent-audio", {}, icon("sound"));
        return h("button.ut-res", { type: "button", title: `${t.name} · ${ago(r.at)}`, on: { click: () => openResult(r) } },
          h("span.ut-res-pic", {}, pic, r.seconds ? h("span.ut-recent-time", {}, time(r.seconds)) : null),
          h("span.ut-res-tag", {}, sprite(t.icon), t.name));
      })) : h("div.ut-empty", {}, icon("plus"), h("span", {}, "Nothing made yet: open a tool and run it")));
  }

  function credits() {
    const { total, hours } = creditsToday();
    const now = new Date().getHours();
    const max = Math.max(1, ...hours);
    const points = hours.slice(0, now + 1).map((v, i) => `${(i / Math.max(1, now)) * 100},${100 - (v / max) * 84 - 8}`).join(" ");
    const cloud = state.info?.target === "comfy-cloud";
    return h("section.ut-bento.is-credits", { "aria-label": "Credits" },
      h("div.ut-b-head", {}, h("span.ut-b-label", {}, "Credits")),
      h("div.ut-credit-big", {}, h("b", {}, String(total)), h("span", {}, "cr spent today")),
      spark(total > 0 && now > 0 ? points : ""),
      h("p.ut-hint", {}, cloud ? "Comfy Cloud. Edit tools cost nothing." : "Your own ComfyUI: nothing is charged."));
  }

  function update() {
    loadTotal(() => refresh());
    loadApps();
    el.replaceChildren(featured(), quick(), appsBento(), recentBento(), credits());
  }
  refresh = () => update();
  const sig = () => JSON.stringify([shelfTools().map((t) => t.id), showAll, apps.state, apps.list.map((a) => [a.id, a.credits]).slice(0, 12), utensils.results.slice(0, 8).map((r) => r.id), creditsToday().total, state.info?.target]);
  return { el, update, sig, count: () => shelfTools().length };
}
