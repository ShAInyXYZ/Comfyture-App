// The app's home: the five products, each with its cover, what it is for and what it does, the
// featured one in a banner that turns from one to the next; then the films last worked on.
import { h, icon, sprite } from "../dom.js";
import { state } from "../store.js";
import { PRODUCTS, currentPage } from "../router.js";
import { openFilm } from "./home.js";

const ABOUT = {
  kitchen: { who: "For directors", line: "The full studio: a story and its cast, every shot staged and rolled, the cut.", does: ["Story", "Stage", "Shot", "Cut", "Library"] },
  mixer: { who: "For trend followers", line: "An edit you like, made yours: drop it in, add your cast, get your version.", does: ["Remix an edit", "Your cast", "Recipes"] },
  jam: { who: "For musicians and dancers", line: "A music video from a track: the singing performed, a dance copied, the words on it.", does: ["Lip-sync", "Dance", "Captions"] },
  macaron: { who: "For brands", line: "Turn any product into ready-to-post content, on brand.", does: ["Product shots", "UGC ads", "Brand kit"] },
  utensils: { who: "For one small job", line: "Upscale, cut out, vary, lip-sync: one small tool at a time.", does: ["Upscale", "Cutout", "Variations", "Lip-sync"] },
};
const ids = Object.keys(PRODUCTS);
const cover = (id) => `brand/products/covers/${id}.webp`;

// the banner's turn: one product after the next, held while the pointer is over it
let at = 0;
let held = false;
let banner = null;
function show(i) {
  at = (i + ids.length) % ids.length;
  if (!banner?.isConnected) return;
  banner.querySelectorAll(".welcome-slide").forEach((el, n) => el.classList.toggle("is-on", n === at));
  banner.querySelectorAll(".welcome-dot").forEach((el, n) => el.setAttribute("aria-current", n === at ? "true" : "false"));
}
setInterval(() => !held && !document.hidden && currentPage() === "home" && show(at + 1), 7000);

const mark = (id) => sprite(`product-${id}`);

function hero() {
  banner = h("section.welcome-hero", { "aria-label": "The products", on: { pointerenter: () => (held = true), pointerleave: () => (held = false) } },
    ...ids.map((id, n) => {
      const [name, tagline] = PRODUCTS[id];
      return h(`div.welcome-slide${n === at ? ".is-on" : ""}`, { "aria-hidden": n === at ? undefined : "true" },
        h("img.welcome-slide-art", { src: cover(id), alt: "", draggable: false, loading: n ? "lazy" : "eager" }),
        h("div.welcome-slide-text", {},
          h("span.welcome-eyebrow", {}, mark(id), ABOUT[id].who),
          h("h1", {}, h("span", {}, name), h("em", {}, tagline)),
          h("p", {}, ABOUT[id].line),
          h("a.welcome-go", { href: `#/${id}` }, `Open ${name}`, icon("arrow"))));
    }),
    h("div.welcome-dots", {}, ...ids.map((id, n) =>
      h("button.welcome-dot", { type: "button", "aria-label": PRODUCTS[id][0], "aria-current": n === at ? "true" : "false", on: { click: () => show(n) } }))));
  return banner;
}

function card(id) {
  const [name, tagline] = PRODUCTS[id];
  return h(`a.welcome-card.is-${id}`, { href: `#/${id}` },
    h("img.welcome-card-art", { src: cover(id), alt: "", draggable: false, loading: "lazy" }),
    h("div.welcome-card-foot", {},
      h("span.welcome-card-mark", {}, mark(id)),
      h("div.welcome-card-text", {},
        h("h3", {}, name),
        h("p", {}, tagline),
        h("div.welcome-tags", {}, ...ABOUT[id].does.map((t) => h("span", {}, t))))));
}

function recent() {
  const films = [...(state.projects ?? [])].filter((f) => f.cover?.pic || f.thumb).sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")).slice(0, 3);
  if (!films.length) return null;
  return h("section.welcome-section", {},
    h("h2", {}, "Continue"),
    h("div.welcome-recent", {}, ...films.map((f) =>
      h("button.welcome-film", { type: "button", title: `Open ${f.name}`, on: { click: () => openFilm(f) } },
        h("img", { src: f.cover?.pic ?? f.thumb, alt: "", draggable: false, loading: "lazy" }),
        h("span.welcome-film-text", {}, h("b", {}, f.name), h("span", {}, mark("kitchen"), "Kitchen", icon("open")))))));
}

export function renderWelcome(el) {
  el.replaceChildren(h("div.welcome", {},
    hero(),
    h("section.welcome-section", {},
      h("h2", {}, "Everything on the menu"),
      h("div.welcome-menu", {}, ...ids.map(card))),
    recent()));
}
