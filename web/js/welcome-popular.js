// The home's storefront, "Popular on Comfy Cloud": the official ComfyUI workflows people run the most, from the catalogue the app
// already keeps (Utensils' Library reads the same one, ranked by Comfy's own run counts). Three featured as big cards, the next eight
// in a grid, each with its preview (a before/after slider or a hover dissolve when Comfy gives two pictures), its maker, how many runs
// and what a run costs; "Try it" opens the workflow as a mini app in Utensils, "See the whole library" opens the Library.
import { h, icon } from "./dom.js";
import { changed } from "./store.js";
import { makerById } from "./utensils-makers.js";
import { stillOf, playsOn } from "./thumbs.js";

const FILTERS = [
  ["all", "All", () => true],
  ["video", "Video", (i) => i.medium === "video"],
  ["image", "Image", (i) => i.medium === "image" && !isEdit(i)],
  ["edit", "Edit", (i) => isEdit(i)],
  ["audio", "Audio", (i) => i.medium === "audio"],
  ["3d", "3D", (i) => i.medium === "3d"],
];
const isEdit = (i) => i.tags.some((t) => /edit/i.test(t));
// the tags that say what a workflow does (Comfy's others say how it is packed: Int8, API, the medium again)
const PLAIN = new Set(["int8", "api", "video", "image", "audio", "3d", "fp8", "nunchaku"]);

export const popular = { state: "idle", items: [], total: 0, filter: "all" };

function load() {
  if (popular.state !== "idle") return;
  popular.state = "loading";
  fetch("api/utensils/templates?limit=200").then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
    .then((d) => Object.assign(popular, { state: "ready", items: d.items ?? [], total: d.total ?? 0 }))
    .catch(() => (popular.state = "failed"))
    .finally(() => changed("welcome"));
}

const runs = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "")}k runs` : `${n} runs`);
const price = (i) => (i.openSource && !i.partner ? "GPU time" : i.credits > 0 ? `≈ ${i.credits} cr` : i.partner ? "Partner" : "");
// "MiniMax H3: Image to Video" reads "MiniMax H3 · Image to Video"
const title = (t) => String(t).replace(/:\s*/, " · ");
const job = (i) => i.tags.find((t) => !PLAIN.has(t.toLowerCase())) ?? i.category;

/** Opens a workflow as a mini app in Utensils: the Templates workspace is asked for first, so Utensils lands there, not on its Home. */
export async function tryWorkflow(name) {
  // (Utensils' own modules come when one is tried: the home does not carry them)
  const { setWorkspace } = await import("./utensils.js");
  setWorkspace("templates");
  const open = () => setTimeout(() => document.dispatchEvent(new CustomEvent("utensils:app", { detail: { name } })), 60);
  if (document.querySelector("#page-utensils .ut-main")) requestAnimationFrame(open);
  else document.addEventListener("utensils:drawn", open, { once: true });
  location.hash = "#/utensils";
}
async function library() {
  const { openLibrary } = await import("./utensils.js");
  openLibrary();
  location.hash = "#/utensils";
}

function logo(i) {
  const m = makerById(i.maker);
  return m ? h("span.wp-maker", { title: m.by ? `${m.name} · ${m.by}` : m.name }, h("i", { style: { "--logo": `url("/brand/makers/mono/${m.id}.svg")` } }), h("span", {}, m.name)) : null;
}

/** A workflow's preview: its picture, and its "after" when Comfy gives one (a slider for a before/after, a dissolve on hover). */
function picture(i, big) {
  // (each a still until its card is pointed at: card() and thumbs.js)
  const before = h("img.wp-pic", { src: stillOf(i.thumb), alt: "", draggable: false, loading: "lazy", dataset: { play: i.thumb } });
  if (!i.variant || i.thumbKind !== "image") return h("span.wp-art", {}, before);
  const after = h("img.wp-pic.is-after", { src: stillOf(`${i.thumb}?n=2`), alt: "", draggable: false, loading: "lazy", dataset: { play: `${i.thumb}?n=2` } });
  if (i.variant !== "compareSlider") return h("span.wp-art.is-dissolve", {}, before, after);
  // the slider follows the pointer across the picture, and rests in the middle
  const art = h("span.wp-art.is-compare", { style: { "--at": "50%" } }, before, after, h("span.wp-handle", {}, icon("chevron"), icon("chevron")));
  art.addEventListener("pointermove", (e) => {
    const r = art.getBoundingClientRect();
    art.style.setProperty("--at", `${Math.max(4, Math.min(96, ((e.clientX - r.left) / r.width) * 100))}%`);
  });
  art.addEventListener("pointerleave", () => art.style.setProperty("--at", "50%"));
  return art;
}

function card(i, big) {
  const cost = price(i);
  const el = h(`article.wp-card${big ? ".is-big" : ""}`, { dataset: { name: i.name } },
    picture(i, big),
    i.medium === "video" ? h("span.wp-kind", { title: "A video workflow" }, icon("play")) : null,
    h("div.wp-foot", {},
      h("h3", {}, title(i.title)),
      h("div.wp-meta", {},
        logo(i),
        h("span.wp-tag", {}, job(i)),
        big ? null : h("span.wp-tag", {}, i.openSource && !i.partner ? "Open" : "API"),
        h("span.wp-runs", {}, runs(i.usage ?? 0)),
        big && cost ? h("span.wp-price", {}, cost) : null)),
    h("button.wp-try", { type: "button", title: `Try ${i.title}${cost ? ` · ${cost}` : ""}: opens it in Utensils`, on: { click: () => tryWorkflow(i.name) } }, icon("play"), h("span", {}, "Try it")));
  // its pictures start moving the first time the card is pointed at or focused
  for (const img of el.querySelectorAll("img[data-play]")) playsOn(el, img, img.dataset.play);
  return el;
}

export function popularSection() {
  load();
  const [, , keep] = FILTERS.find(([id]) => id === popular.filter) ?? FILTERS[0];
  const list = popular.items.filter(keep);
  const head = h("div.wp-head", {},
    h("div.wp-title", {}, h("h2", {}, "Popular on Comfy Cloud"), h("span", {}, popular.total ? `${popular.total} official workflows · ranked by runs` : "The official workflows · ranked by runs")),
    h("div.wp-filters", { role: "group", "aria-label": "Show" }, ...FILTERS.map(([id, label]) =>
      h("button.wp-chip", { type: "button", "aria-pressed": String(popular.filter === id), on: { click: () => ((popular.filter = id), changed("welcome")) } }, label))));
  if (popular.state !== "ready") return h("section.welcome-section.wp", {}, head, h("p.wp-wait", {}, popular.state === "failed" ? "The catalogue could not be read. It comes back with the next visit." : "Reading the catalogue…"));
  return h("section.welcome-section.wp", {}, head,
    h("div.wp-featured", {}, ...list.slice(0, 3).map((i) => card(i, true))),
    h("div.wp-grid", {}, ...list.slice(3, 11).map((i) => card(i, false))),
    h("button.wp-more", { type: "button", on: { click: library } }, "See the whole library", icon("arrow")));
}
