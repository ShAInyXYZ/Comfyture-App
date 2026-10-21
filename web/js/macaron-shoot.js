// The new-shoot window of the Studio (mockup: docs/brand/products/macaron-v4/macaron-v4-shoot.png): the product, the studio it stands in
// (the light, the surface, the background colour), the shot to take, and what it will make, with the price. The setup is kept with
// the brand (body.studio) and its words follow the template's own, so a shoot can be done again the same way. "Shoot it" is the
// same action the Product window's Shoot tab uses; it asks twice before it spends.
import { h, icon } from "./dom.js";
import { view } from "./viewer.js";
import { toast, changed } from "./store.js";
import { FORMATS } from "./design.js";
import { TEMPLATES, templateById, previewOf } from "./macaron-templates.js";
import { macaron, setBrand, kitNow, productNow, pickProduct, pickTemplate, setFilter, formatsOf, toggleFormat, setCount, shoot, shooting, estimate } from "./macaron.js";
import { defineWindow, openWin } from "./macaron-win.js";
import { draftKey } from "./macaron-tools.js";
import { fill, arming, isArmed, armedNow, mcicon } from "./macaron-ui.js";
import { LIGHTS, SURFACES, setupOf } from "./macaron-studio-setup.js";

/** A small drawn glyph of its own, in the app's line style. */
function glyph(paths) {
  const span = document.createElement("span");
  span.innerHTML = `<svg class="icon" viewBox="0 0 48 32" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  return span.firstChild;
}
// the light as a tiny diagram: where it comes from and how hard it falls
const LIGHT_ART = {
  softbox: '<rect x="4" y="5" width="12" height="16" rx="2"/><path d="M19 8l8 4M19 13l10 1M19 18l8-3" opacity=".7"/><circle cx="36" cy="20" r="5"/>',
  window: '<rect x="4" y="4" width="14" height="18" rx="1.5"/><path d="M11 4v18M4 13h14M21 8l9 5M21 14l11 2" opacity=".7"/><circle cx="38" cy="21" r="5"/>',
  flash: '<path d="M12 3 6 14h6l-3 9 9-12h-6l3-8z"/><path d="M24 10l8 2M24 16l9 0M24 21l7-3" opacity=".7"/><circle cx="40" cy="19" r="5"/>',
};

/** Studio setup changed: kept with the brand. */
export const setStudio = (patch) => setBrand({ studio: { ...setupOf(macaron.brand.body), ...patch } });
/** The window open, with a template picked (what Brioche proposes: nothing is spent until the person shoots). */
export function openShoot({ template, light, surface, background } = {}) {
  if (TEMPLATES.some((x) => x.id === template)) pickTemplate(template);
  const patch = {};
  if (LIGHTS.some((x) => x.id === light)) patch.light = light;
  if (SURFACES.some((x) => x.id === surface)) patch.surface = surface;
  if (typeof background === "string" && kitNow().palette.some((p) => p.id === background)) patch.background = background;
  if (Object.keys(patch).length) setStudio(patch);
  openWin("shoot");
}

const typingIn = (el) => el.contains(document.activeElement) && document.activeElement.matches("input, textarea");

function shootWin() {
  const el = h("div.mc-w.shw");
  const cost = h("div.shw-cost", {});
  const go = h("button.mc-primary", { type: "button" });
  const draft = draftKey("Brioche can plan the shoot", "The set and the shot, for this product.", "Plan a shoot of the product: pick the light, the surface, a background from the palette and the template that suits it, with propose_shoot.");
  const foot = [draft, h("span.spacer"), cost, go];

  function update() {
    const b = macaron.brand;
    if (!b) return;
    if (typingIn(el)) return false;
    const kit = kitNow();
    const set = setupOf(b.body);
    const p = productNow(b);
    const t = templateById(macaron.template);
    const formats = formatsOf(t, b);
    const count = b.body.shoot.count ?? 2;
    const busy = shooting();
    const outs = b.body.outputs.filter((o) => o.template === t.id && o.product === p?.id && o.photo);
    const shown = outs[0]?.photo?.url ?? previewOf(t);
    const list = TEMPLATES.filter((x) => macaron.media === "all" || (macaron.media === "images") === (x.media === "image"));
    const n = formats.length * count;
    const price = estimate();

    fill(el,
      h("div.shw-main", {},
        h("section.mc-sec.shw-sec", {}, h("span.label", {}, "1  The product"),
          p ? h("div.shw-product", {},
            h("span.shw-prodpic", {}, h(`img${p.cutout ? ".is-clear" : ""}`, { src: p.cutout?.url ?? p.photo.url, alt: "", draggable: false })),
            h("div.shw-prodname", {}, h("b", {}, p.name), h("em", {}, (p.features ?? []).slice(0, 2).join(" · ") || "Open Product to describe it")),
            h("span.spacer"),
            (b.body.products.length > 1 ? h("div.shw-prodpick", {}, ...b.body.products.map((x) => h(`button.mc-pp-thumb.is-small${x.id === p.id ? ".is-on" : ""}`, { type: "button", title: x.name, "aria-label": x.name, "aria-pressed": String(x.id === p.id), on: { click: () => pickProduct(x.id) } }, h("img", { src: x.cutout?.url ?? x.photo.url, alt: "", draggable: false })))) : null),
            h("button.mc-iconkey", { type: "button", title: "Change the product, add a photo", "aria-label": "Change the product", on: { click: () => openWin("product") } }, mcicon("swap")))
            : h("button.mc-add-prompt", { type: "button", on: { click: () => openWin("product") } }, icon("plus"), "Add the product to shoot")),
        h("section.mc-sec.shw-sec", {}, h("span.label", {}, "2  The studio"),
          h("div.shw-set", {},
            h("div.shw-row", {}, h("span.shw-k", {}, "Light"),
              h("div.shw-lights", {}, ...LIGHTS.map((x) => h("button.shw-light", { type: "button", title: x.tip, "aria-pressed": String(set.light === x.id), on: { click: () => setStudio({ light: x.id }) } }, glyph(LIGHT_ART[x.id]), h("span", {}, x.name))))),
            h("div.shw-row", {}, h("span.shw-k", {}, "Surface"),
              h("div.shw-surfaces", {}, ...SURFACES.map((x) => h("button.shw-surface", { type: "button", title: x.tip, "aria-label": x.name, "aria-pressed": String(set.surface === x.id), on: { click: () => setStudio({ surface: x.id }) } }, h("i", { style: { background: x.swatch } }), h("span", {}, x.name))))),
            h("div.shw-row", {}, h("span.shw-k", {}, "Background"),
              h("div.shw-bgs", {},
                h("button.shw-bg.is-none", { type: "button", title: "The template's own background", "aria-label": "The template's own background", "aria-pressed": String(!set.background), on: { click: () => setStudio({ background: "" }) } }, icon("close")),
                ...kit.palette.map((x) => h("button.shw-bg", { type: "button", title: `${x.name} ${x.hex}`, "aria-label": x.name, "aria-pressed": String(set.background === x.id), style: { "--c": x.hex }, on: { click: () => setStudio({ background: x.id }) } })))))),
        h("section.mc-sec.shw-sec", {},
          h("div.shw-shothead", {}, h("span.label", {}, "3  The shot"),
            h("div.mc-fchips", {},
              ...["all", "images", "videos"].map((v) => h("button.mc-fchip", { type: "button", "aria-pressed": String(macaron.media === v), on: { click: () => setFilter("media", v) } }, v === "all" ? "Every kind" : v === "images" ? "Images" : "Videos")))),
          h("div.shw-tpls", {}, ...list.map((x) => h(`button.shw-tpl${x.id === t.id ? ".is-on" : ""}`, { type: "button", title: `${x.name} · ${x.category}`, "aria-pressed": String(x.id === t.id), on: { click: () => pickTemplate(x.id) } },
            h("img", { src: previewOf(x), alt: "", loading: "lazy", draggable: false }), x.media === "video" ? h("span.shw-vid", {}, icon("play")) : null, h("b", {}, x.name)))))),
      h("aside.shw-view", {},
        h("button.shw-pic", { type: "button", title: "See it full size", on: { click: () => view(shown) } }, h("img", { src: shown, alt: t.name, draggable: false }),
          t.media === "video" ? h("span.shw-vid.is-big", {}, icon("play")) : null,
          h("span.shw-live", {}, outs[0] ? "Your last shot" : "The template")),
        h("div.shw-meta", {},
          h("div", {}, h("span.label", {}, "Template"), h("b", {}, t.name)),
          h("div", {}, h("span.label", {}, "Format"), h("div.mc-fchips", {}, ...t.formats.map((f) => h("button.mc-fchip", { type: "button", title: FORMATS[f]?.name, "aria-pressed": String(formats.includes(f)), on: { click: () => toggleFormat(f) } }, f))))),
        h("div.shw-meta", {},
          h("div", {}, h("span.label", {}, t.media === "video" ? "Videos each" : "Pictures each"),
            h("div.ug-step", {}, h("button", { type: "button", "aria-label": "One fewer", disabled: count <= 1, on: { click: () => setCount(count - 1) } }, "−"), h("span", {}, String(count)), h("button", { type: "button", "aria-label": "One more", disabled: count >= 4, on: { click: () => setCount(count + 1) } }, "+"))),
          h("div.shw-sum", {}, h("b", {}, `${n} ${t.media === "video" ? (n === 1 ? "video" : "videos") : n === 1 ? "picture" : "pictures"}`), h("em", {}, `${t.category} · ${formats.join(", ")}`)))));

    // the foot: what it will cost, and the key (it asks twice before it spends)
    const key = "shoot-it";
    cost.replaceChildren(h("b", {}, price ? `≈ ${price} cr` : `${n} ${t.media === "video" ? "videos" : "pictures"}`), h("em", {}, price ? "On Comfy Cloud" : "Cost is shown on Comfy Cloud"));
    go.disabled = busy || !p;
    go.title = p ? `${n} ${t.media === "video" ? "videos" : "pictures"} of ${p.name}` : "Add a product first";
    go.classList.toggle("is-armed", isArmed(key));
    go.replaceChildren(icon("sparkle"), busy ? "Shooting" : isArmed(key) ? `Spend ${price ? `≈ ${price} cr` : "credits"}?` : "Shoot it");
    go.onclick = () => arming(key, () => changed("macaron"), () => {
      // what is on the screen is what is shot: the setup as shown is kept with the brand first
      setStudio({});
      toast(`Shooting ${t.name}: ${n} ${t.media === "video" ? "videos" : "pictures"}.`);
      shoot();
    });
    draft.disabled = !!macaron.chat.busy;
  }
  const sig = () => JSON.stringify([macaron.brand?.body.studio, macaron.brand?.body.shoot, macaron.brand?.body.products?.map((x) => x.id), macaron.brand?.body.product, macaron.brand?.body.outputs?.map((o) => [o.id, o.status]), macaron.template, macaron.media, [...macaron.busy].filter((k) => k.startsWith("shoot")), armedNow(), macaron.chat.busy]);
  return { el, update, sig, foot };
}

defineWindow("shoot", { title: "New shoot", eyebrow: "Studio", sub: () => macaron.brand?.name ?? "", size: "xl", advanced: false, make: shootWin, foot: (part) => part.foot });
