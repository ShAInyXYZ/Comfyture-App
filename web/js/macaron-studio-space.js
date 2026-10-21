// The Studio workspace: where a brand's raw material is made (mockup: docs/brand/products/macaron-v4/macaron-v4-studio.png).
// Photography (shoots of the product in a studio setup), UGC stories (a creator and a story told in a few vertical shots), motion
// graphics (a logo sting, a lower third, an end card, a title card, drawn live from the kit), the product (its cut-out and
// details) and the library of what has been made. Each bento opens a window of its own (shoot, ugc, graphics, product).
// A workspace is { el, update, sig }: the panel (panels/macaron.js) draws it again when sig() changes.
import { h, icon } from "./dom.js";
import { view } from "./viewer.js";
import { macaron, kitNow, productNow } from "./macaron.js";
import { openWin } from "./macaron-win.js";
import { bento, fill, mcicon } from "./macaron-ui.js";
import { setupOf, setupLine } from "./macaron-studio-setup.js";
import { whoOf, beatKind, PERSONAS, CHARACTER_ID } from "./macaron-ugc-data.js";
import { storiesOf, storyNow, startStory } from "./macaron-ugc.js";
import { GRAPHIC_KINDS, buildGraphic } from "./macaron-graphics-data.js";
import { graphicsOf, stillOf, openGraphic, brandUrl } from "./macaron-graphics.js";
import { openShoot } from "./macaron-shoot.js";
import "./macaron-ugc-win.js";

const clock = (s) => `0:${String(Math.round(s)).padStart(2, "0")}`;
/** The four graphics the workspace shows: the brand's own where it made one, else the template as the kit would draw it. */
const SHOWN = ["sting", "lower", "end", "title"];

const goPictures = () => ((macaron.productTab = "pictures"), openWin("product"));

/** The shoots as pictures, newest first, and the pictures the brand made or was given of its product (when no shoot yet). */
function shootsOf(b) {
  const out = b.body.outputs.filter((o) => o.photo?.url).map((o) => ({ url: o.photo.url, name: o.template, video: o.video ?? null }));
  const made = b.body.assets.filter((a) => a.url && (a.kind === "product" || a.kind === "render") && !a.video).map((a) => ({ url: a.url, name: a.name, video: null }));
  return [...out, ...made];
}
/** What the library shows: every picture and clip, newest first, apps' screens left out (they are not made here). */
const libraryOf = (b) => b.body.assets.filter((a) => a.url && a.kind !== "app" && a.kind !== "brand").slice(0, 12);

export function studioSpace() {
  const el = h("div.mc-grid.is-studio");

  function photography(b) {
    const shoots = shootsOf(b).slice(0, 5);
    const kit = kitNow();
    const line = setupLine(b.body, kit);
    const set = setupOf(b.body);
    const bg = kit.palette.find((p) => p.id === set.background);
    return bento("is-photo", "Photography", () => openWin("shoot"),
      shoots.length
        ? h("div.st-shots", { dataset: { n: String(shoots.length) } }, ...shoots.map((s, i) => h("button.st-shot", { type: "button", title: s.name, "aria-label": s.name, dataset: { i: String(i) }, on: { click: (e) => (e.stopPropagation(), view(s.url)) } }, h("img", { src: s.url, alt: "", draggable: false, loading: "lazy" }), s.video ? h("span.st-vid", {}, icon("play")) : null)))
        : h("button.mc-empty-tile", { type: "button", on: { click: (e) => (e.stopPropagation(), openWin("shoot")) } }, icon("plus"), h("span", {}, "Shoot the product: pick a setup and a shot")),
      h("div.st-foot", {},
        h("button.mc-primary", { type: "button", "data-keep": "", on: { click: (e) => (e.stopPropagation(), openShoot()) } }, icon("plus"), "New shoot"),
        h("button.st-setup", { type: "button", "data-keep": "", title: "The studio setup: light, surface, background. Click to change it", on: { click: (e) => (e.stopPropagation(), openShoot()) } },
          mcicon("sparkle"), h("b", {}, "Studio setup"), h("span", {}, line), bg ? h("i", { style: { background: bg.hex }, title: bg.name }) : null)));
  }

  function ugc(b) {
    const story = storyNow(b);
    if (!story) {
      return bento("is-ugc", "UGC stories", () => openWin("ugc"),
        h("p.mc-hint", {}, "A creator tells your product in five short vertical shots."),
        h("div.st-personas", { "data-keep": "" }, ...PERSONAS.map((p) => h("button.st-persona", { type: "button", title: `Start a story with ${p.name}`, on: { click: (e) => (e.stopPropagation(), startStory(p.id), openWin("ugc")) } }, h("img", { src: p.portrait, alt: "", draggable: false }), h("b", {}, p.name), h("em", {}, p.vibe))), h("button.st-persona.is-character", { type: "button", title: "Start a story told by the brand's own character", on: { click: (e) => (e.stopPropagation(), startStory(CHARACTER_ID), openWin("ugc")) } }, icon("plus"), h("b", {}, "Your character"), h("em", {}, "A mascot"))));
    }
    // (the brand's own character tells it from its own picture; one without a picture yet shows a creator's)
    const who = (() => { const w = whoOf(story); return w.portrait ? w : { ...w, portrait: PERSONAS[0].portrait }; })();
    return bento("is-ugc", "UGC stories", () => openWin("ugc"),
      h("div.st-who", {}, h("img", { src: who.portrait, alt: "", draggable: false }), h("div", {}, h("b", {}, who.name), h("em", {}, `${who.vibe} · ${storiesOf(b).length} ${storiesOf(b).length === 1 ? "story" : "stories"}`))),
      h("div.st-beats", {}, ...story.beats.slice(0, 4).map((bt, i) => h("div.st-beat", { title: beatKind(bt.kind).name }, h("span.st-beat-pic", {}, h("img", { src: bt.picture?.url ?? who.portrait, alt: "", draggable: false, loading: "lazy" }), bt.take?.status === "done" ? h("span.st-vid", {}, icon("play")) : null, h("i", {}, clock(bt.seconds))),
        h("span.st-beat-line", {}, `${i + 1}. ${beatKind(bt.kind).name.toUpperCase()}`), h("em", {}, `“${bt.line}”`)))),
      h("button.mc-primary", { type: "button", "data-keep": "", on: { click: (e) => (e.stopPropagation(), startStory(story.persona), openWin("ugc")) } }, icon("plus"), "New story"));
  }

  function graphics(b) {
    const kit = kitNow();
    const tiles = SHOWN.map((id) => {
      const spec = GRAPHIC_KINDS.find((k) => k.id === id);
      const saved = graphicsOf(b).filter((d) => d.graphic.kind === id).sort((a, c) => String(c.updatedAt).localeCompare(String(a.updatedAt)))[0];
      const d = saved ?? buildGraphic({ kind: id, kit, brandName: b.name, url: brandUrl(b) }).design;
      return h("button.st-gfx", { type: "button", title: `${spec.name}: ${spec.hint}`, "data-keep": "", on: { click: (e) => (e.stopPropagation(), openGraphic(id, { id: saved?.id })) } },
        h("span.st-gfx-pic", { style: { "--py": String(spec.band ?? 0.5) } }, stillOf(d, kit, { width: 300 }), h("i", {}, clock(saved?.graphic.seconds ?? spec.seconds))),
        h("span.st-gfx-name", {}, spec.name.toUpperCase()));
    });
    return bento("is-gfx", "Motion graphics", () => openWin("graphics"), h("div.st-gfxs", {}, ...tiles));
  }

  function product(b) {
    const p = productNow(b);
    if (!p) return bento("is-prod", "Product", () => openWin("product"), h("button.mc-empty-tile", { type: "button", on: { click: (e) => (e.stopPropagation(), openWin("product")) } }, icon("plus"), h("span", {}, "Add a product")));
    const small = [p.photo, ...(p.scene ? [{ url: p.scene }] : []), ...(p.cutout ? [{ url: p.cutout.url, clear: true }] : [])].slice(0, 3);
    const rows = [
      ["Format", p.cutout ? "PNG (transparent)" : "Photo"],
      ["Size", `${p.cutout?.width ?? p.photo.width ?? "?"} × ${p.cutout?.height ?? p.photo.height ?? "?"}`],
      ["Features", (p.features ?? []).slice(0, 2).join(" · ") || "none yet"],
    ];
    return bento("is-prod", "Product", () => openWin("product"),
      h("div.st-prod", {},
        h("span.st-prod-hero", {}, h("img", { src: p.cutout?.url ?? p.photo.url, alt: p.name, draggable: false })),
        h("span.st-prod-small", {}, ...small.map((s) => h(`img${s.clear ? ".is-clear" : ""}`, { src: s.url, alt: "", draggable: false, loading: "lazy" }))),
        h("div.st-prod-info", {}, h("b", {}, p.name), ...rows.map(([k, v]) => h("div.st-row", {}, h("span", {}, k), h("em", {}, v))))));
  }

  function library(b) {
    const items = libraryOf(b);
    return bento("is-lib", "Library", goPictures,
      items.length ? h("div.st-lib", {}, ...items.map((a) => h("button.st-lib-tile", { type: "button", title: a.name, "aria-label": a.name, "data-keep": "", on: { click: (e) => (e.stopPropagation(), a.video ? view(a.video, "video") : view(a.url)) } }, h("img", { src: a.url, alt: "", draggable: false, loading: "lazy" }), h("span.st-kind", {}, a.video ? icon("play") : mcicon("picture")))))
        : h("button.mc-empty-tile", { type: "button", on: { click: (e) => (e.stopPropagation(), goPictures()) } }, icon("plus"), h("span", {}, "Pictures and clips made here collect in the library")));
  }

  function update() {
    const b = macaron.brand;
    if (!b) return;
    fill(el, photography(b), ugc(b), graphics(b), product(b), library(b));
  }
  const sig = () => {
    const b = macaron.brand?.body;
    return JSON.stringify([b?.outputs?.map((o) => [o.id, o.status, o.photo?.url]), b?.assets?.map((a) => a.id), b?.studio, b?.ugc, b?.products, b?.product, b?.kit?.palette, b?.kit?.logos?.length, b?.designs?.filter((d) => d.graphic).map((d) => [d.id, d.updatedAt])]);
  };
  return { el, update, sig };
}
