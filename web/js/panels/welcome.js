// The app's home: the seven products in one banner (the one shown large, all seven as tiles along its foot, turning from one to the next),
// then the storefront of the most-run Comfy Cloud workflows (welcome-popular.js), then the films last worked on.
import { h, icon, sprite } from "../dom.js";
import { state } from "../store.js";
import { PRODUCTS, currentPage } from "../router.js";
import { popularSection } from "../welcome-popular.js";

const ABOUT = {
  kitchen: { who: "For directors", line: "The full studio: a story and its cast, every shot staged and rolled, the cut.", does: ["Story", "Stage", "Shot", "Cut", "Library"] },
  mixer: { who: "For trend followers", line: "An edit you like, made yours: drop it in, add your cast, get your version.", does: ["Remix an edit", "Your cast", "Recipes"] },
  jam: { who: "For musicians and dancers", line: "A music video from a track: the singing performed, a dance copied, the words on it.", does: ["Lip-sync", "Dance", "Captions"] },
  macaron: { who: "For brands", line: "Turn any product into ready-to-post content, on brand.", does: ["Product shots", "UGC ads", "Brand kit"] },
  spice: { who: "For visual effects", line: "A scenario of shots, each run through the suite's AI tools pass after pass: the object gone, the day turned to night, the frame widened, the close-up sharpened, its sound back.", does: ["IC-LoRAs", "Cut out", "Upscale", "Sound"] },
  toaster: { who: "For objects in 3D", line: "Block an object out in clay shapes, then toast it: a finished picture, four views that agree, and a textured 3D model.", does: ["Blockout", "Render", "Turnaround", "3D model"] },
  utensils: { who: "For one small job", line: "One small tool, one job, one result: upscale, cut out, vary, lip-sync. A shot that needs pass after pass goes to Spice.", does: ["Upscale", "Cutout", "Variations", "Lip-sync"] },
};
const ids = Object.keys(PRODUCTS);
const cover = (id) => `brand/products/covers/${id}.webp`;

// the banner's turn: one product after the next. The products are the tiles along its foot; the lit one fills as its time runs, and
// when it is full the next slides in (held while the pointer is over the banner). A tile picked slides its product in from its side.
let at = 0;
let banner = null;
function show(i) {
  at = (i + ids.length) % ids.length;
  if (!banner?.isConnected) return;
  banner.querySelectorAll(".welcome-slide").forEach((el, n) => {
    el.classList.toggle("is-on", n === at);
    // the ones before the lit one wait on its left, the ones after on its right: the new one slides in from where it was
    el.classList.toggle("is-past", n < at);
    el.setAttribute("aria-hidden", n === at ? "false" : "true");
  });
  banner.querySelectorAll(".welcome-tile").forEach((el, n) => {
    el.setAttribute("aria-current", n === at ? "true" : "false");
    // the fill starts again on the tile that is lit
    const bar = el.querySelector(".welcome-tile-fill");
    if (bar && n === at) {
      bar.style.animation = "none";
      void bar.offsetWidth;
      bar.style.animation = "";
    }
  });
}

const mark = (id) => sprite(`product-${id}`);

function hero() {
  // the banner holds its turn while the pointer is over it, and while the keyboard is in it (a slide that turned under the focus would take the key away)
  banner = h("section.welcome-hero", { "aria-label": "The products", on: { pointerenter: () => banner.classList.add("is-held"), pointerleave: () => !banner.matches(":focus-within") && banner.classList.remove("is-held"), focusin: () => banner.classList.add("is-held"), focusout: (e) => !banner.contains(e.relatedTarget) && banner.classList.remove("is-held") } },
    ...ids.map((id, n) => {
      const [name, tagline] = PRODUCTS[id];
      return h(`div.welcome-slide${n === at ? ".is-on" : ""}${n < at ? ".is-past" : ""}`, { "aria-hidden": n === at ? "false" : "true" },
        h("img.welcome-slide-art", { src: cover(id), alt: "", draggable: false, loading: n ? "lazy" : "eager" }),
        h("div.welcome-slide-text", {},
          h("span.welcome-eyebrow", {}, mark(id), ABOUT[id].who),
          h("h1", {}, h("span", {}, name), h("em", {}, tagline)),
          h("p", {}, ABOUT[id].line),
          h("div.welcome-tags", {}, ...ABOUT[id].does.map((t) => h("span", {}, t))),
          h("a.welcome-go", { href: `#/${id}` }, `Open ${name}`, icon("arrow"))));
    }),
    h("nav.welcome-strip", { "aria-label": "Every product" }, ...ids.map((id, n) => {
      const [name, tagline] = PRODUCTS[id];
      return h("button.welcome-tile", { type: "button", title: `${name}: ${tagline}`, "aria-current": n === at ? "true" : "false", dataset: { product: id }, on: { click: () => (n === at ? (location.hash = `#/${id}`) : show(n)) } },
        h("img", { src: cover(id), alt: "", draggable: false, loading: "lazy" }),
        h("span.welcome-tile-text", {}, h("span.welcome-tile-mark", {}, mark(id)), h("b", {}, name)),
        h("i.welcome-tile-fill", { on: { animationend: () => !document.hidden && currentPage() === "home" && show(at + 1) } }));
    })));
  return banner;
}

function recent() {
  const films = [...(state.projects ?? [])].filter((f) => f.cover?.pic || f.thumb).sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")).slice(0, 3);
  if (!films.length) return null;
  return h("section.welcome-section", {},
    h("h2", {}, "Continue"),
    h("div.welcome-recent", {}, ...films.map((f) =>
      h("button.welcome-film", { type: "button", title: `Open ${f.name}`, on: { click: () => import("./home.js").then((m) => m.openFilm(f)) } },
        h("img", { src: f.cover?.pic ?? f.thumb, alt: "", draggable: false, loading: "lazy" }),
        h("span.welcome-film-text", {}, h("b", {}, f.name), h("span", {}, mark("kitchen"), "Kitchen", icon("open")))))));
}

// the page is built once: the banner keeps turning through redraws, only the storefront and the films are drawn again
let page = null;
let parts = null;
export function renderWelcome(el) {
  if (!page || !el.contains(page)) {
    parts = { popular: h("div.welcome-part"), recent: h("div.welcome-part") };
    page = h("div.welcome", {}, hero(), parts.popular, parts.recent);
    el.replaceChildren(page);
  }
  parts.popular.replaceChildren(popularSection());
  parts.recent.replaceChildren(...[recent()].filter(Boolean));
}
