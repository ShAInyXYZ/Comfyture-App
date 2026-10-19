// Macaron's screen: the brand kit and its products on the left, the templates in the middle, the
// shoot (its settings, the brand guard and what came out) on the right.
import { h, icon, sprite } from "../dom.js";
import { changed, toast, artist, setArtist, artists } from "../store.js";
import { currentPage } from "../router.js";
import { dropdown } from "../controls.js";
import { artistItems } from "../writer-menu.js";
import { view } from "../viewer.js";
import { openPicker, pictureOf } from "../picker.js";

/** A product or the logo, from the Library or the computer (no characters: they are no products). */
const fromPicker = (anchor, title, use, multiple = false) =>
  openPicker(anchor, { title, characters: false, multiple, onPick: async (choice) => { try { await use(await pictureOf(choice)); } catch (e) { toast(e.message, { tone: "crit" }); } } });
import { TEMPLATES, CATEGORIES, templateById, previewOf } from "../macaron-templates.js";
import {
  macaron, loadBrands, openBrand, newBrand, exampleBrand, removeBrand, rename, setBrand, setLogo, setColour, addColour, setWords,
  productNow, addProduct, pickProduct, setProduct, removeProduct, pickTemplate, setFilter, formatsOf, toggleFormat, setCount, shoot, shooting, removeOutput, estimate,
} from "../macaron.js";

const pick = (fn, multiple = false) => {
  const input = h("input", { type: "file", accept: "image/*", multiple, hidden: true, on: { change: () => ([...input.files].forEach(fn), input.remove()) } });
  document.body.append(input);
  input.click();
};
const words = (s) => s.split(",").map((w) => w.trim()).filter(Boolean).slice(0, 6);
let armed = null;
const arm = (key, run) => (armed === key ? ((armed = null), run()) : ((armed = key), changed("macaron"), setTimeout(() => armed === key && ((armed = null), changed("macaron")), 3000)));

// ---------------------------------------------------------------- the brand kit

function kit(b) {
  const body = b.body;
  const p = productNow(b);
  return h("section.mc-panel.mc-kit", {},
    h("div.mc-head", {}, h("span.card-label", {}, "Brand kit"),
      h("div.card-tools", {},
        dropdown({ label: "Brand", value: b.id, items: [...macaron.list.map((x) => ({ value: x.id, label: x.name })), { value: "__new", label: "New brand", glyph: () => icon("plus") }], onChange: (id) => (id === "__new" ? newBrand() : openBrand(id)), width: "fit" }),
        h(`button.key.is-icon.is-quiet${armed === `brand:${b.id}` ? ".is-armed" : ""}`, { type: "button", title: armed === `brand:${b.id}` ? "Click again to delete the brand" : "Delete this brand", on: { click: () => arm(`brand:${b.id}`, () => removeBrand(b.id)) } }, icon("trash")))),
    h("input.mc-name", { value: b.name, "aria-label": "The brand's name", dataset: { focus: `name:${b.id}` }, on: { input: (e) => rename(e.target.value) } }),
    h("button.mc-logo", { type: "button", title: body.logo ? "Replace the logo" : "Add the logo\nA PNG with a clear background works best", on: { click: (e) => fromPicker(e.currentTarget, "The logo", setLogo) } },
      body.logo ? h("img", { src: body.logo.url, alt: "", draggable: false }) : h("span", {}, icon("upload"), "Add the logo")),
    h("span.label", {}, "Colours"),
    h("div.mc-swatches", {}, ...body.colours.map((c, i) =>
      h("label.mc-swatch", { title: `${c}\nClick to change it` },
        h("input", { type: "color", value: c.toLowerCase(), on: { change: (e) => setColour(i, e.target.value) } }),
        h("i", { style: { background: c } }),
        h("span", {}, c),
        h("button.mc-swatch-x", { type: "button", title: "Take it out", "aria-label": "Take it out", on: { click: (e) => (e.preventDefault(), setColour(i, null)) } }, icon("close")))),
      body.colours.length < 6 ? h("button.mc-swatch.is-add", { type: "button", title: "Add a colour", on: { click: () => addColour() } }, icon("plus")) : null),
    h("span.label", {}, "Type"),
    ...[0, 1].map((i) => h("label.mc-font", {},
      h("input", { value: body.fonts[i] ?? "", placeholder: i ? "Second typeface" : "Main typeface", dataset: { focus: `font:${i}` }, on: { input: (e) => ((body.fonts[i] = e.target.value.slice(0, 40)), setBrand({ fonts: body.fonts.filter(Boolean) })) } }),
      h("span", { style: { fontFamily: `"${body.fonts[i] ?? ""}", var(--font-sans)` } }, i ? "0123" : "Aa"))),
    h("span.label", {}, "Voice"),
    h("input.field.mc-voice", { value: body.voice.join(", "), placeholder: "warm, playful", dataset: { focus: "voice" }, on: { change: (e) => setWords("voice", words(e.target.value)) } }),
    h("div.mc-dos", {},
      h("label", {}, h("span", {}, "Do"), h("input", { value: body.dos, placeholder: "stay sunny", dataset: { focus: "dos" }, on: { change: (e) => setBrand({ dos: e.target.value.slice(0, 80) }) } })),
      h("label", {}, h("span", {}, "Don't"), h("input", { value: body.donts, placeholder: "hard sell", dataset: { focus: "donts" }, on: { change: (e) => setBrand({ donts: e.target.value.slice(0, 80) }) } }))),
    h("div.mc-head.is-gap", {}, h("span.card-label", {}, "Products"),
      h("div.card-tools", {}, h("button.key.is-icon.is-quiet", { type: "button", title: "Add a product\nA photo of it: on any background", on: { click: (e) => fromPicker(e.currentTarget, "Add products", addProduct, true) } }, icon("plus")))),
    body.products.length ? null : h("button.mc-drop", { type: "button", on: { click: (e) => fromPicker(e.currentTarget, "Add products", addProduct, true) } }, icon("upload"), h("span", {}, "Add a product photo")),
    h("div.mc-products", {}, ...body.products.map((x) =>
      h(`div.mc-product${x.id === p?.id ? ".is-on" : ""}`, { on: { click: (e) => !e.target.closest("input, button") && pickProduct(x.id) } },
        h("input.mc-product-name", { value: x.name, "aria-label": "The product's name", dataset: { focus: `product:${x.id}` }, on: { input: (e) => setProduct(x.id, { name: e.target.value.slice(0, 40) }) } }),
        h(`img${x.cutout ? ".is-clear" : ""}`, { src: x.cutout?.url ?? x.photo.url, alt: "", draggable: false }),
        x.id === p?.id ? h("span.mc-check", {}, icon("check")) : null,
        h(`button.mc-product-x${armed === `product:${x.id}` ? ".is-armed" : ""}`, { type: "button", title: armed === `product:${x.id}` ? "Click again to take it out" : "Take it out of the brand", on: { click: () => arm(`product:${x.id}`, () => removeProduct(x.id)) } }, icon("trash"))))));
}

// ---------------------------------------------------------------- the templates

function gallery() {
  const list = TEMPLATES.filter((t) => (macaron.media === "all" || (macaron.media === "images") === (t.media === "image")) && (macaron.category === "all" || t.category === macaron.category));
  const pill = (key, value, label) => h("button", { type: "button", "aria-pressed": String(macaron[key] === value), on: { click: () => setFilter(key, value) } }, label);
  return h("section.mc-panel.mc-gallery", {},
    h("div.mc-head", {}, h("div", {}, h("span.card-label", {}, "Templates"), h("p.mc-sub", {}, "Ready-to-post content for a brand"))),
    h("div.mc-filters", {}, pill("media", "all", "All"), pill("media", "images", "Images"), pill("media", "videos", "Videos")),
    h("div.mc-filters", {}, pill("category", "all", "All"), ...CATEGORIES.map((c) => pill("category", c, c))),
    h("div.mc-grid", {}, ...list.map((t) =>
      h(`button.mc-template${t.id === macaron.template ? ".is-on" : ""}`, { type: "button", on: { click: () => pickTemplate(t.id) } },
        h("span.mc-template-pic", {}, h("img", { src: previewOf(t), alt: "", draggable: false, loading: "lazy" }),
          t.media === "video" ? h("span.mc-play", {}, icon("play")) : null,
          t.id === macaron.template ? h("span.mc-check", {}, icon("check")) : null),
        h("span.mc-template-text", {}, h("b", {}, t.name), h("em", {}, `${t.media} · ${t.formats[0]}`))))));
}

// ---------------------------------------------------------------- the shoot

function lookPicker() {
  const items = artistItems().filter((it) => artists().find((x) => x.id === it.value)?.templates.some((x) => x.id === "edit"));
  const value = items.some((it) => it.value === artist()) ? artist() : items[0]?.value;
  if (!value) return null;
  return dropdown({ label: "Look", value, items, onChange: (id) => (setArtist(id), changed("macaron")), width: "fit", note: "The picture model that shoots the product" });
}

function guard(b, t, outs) {
  const done = outs.filter((o) => o.photo);
  const scores = done.map((o) => o.palette).filter((x) => typeof x === "number");
  const avg = scores.length ? scores.reduce((a, x) => a + x, 0) / scores.length : null;
  const formats = formatsOf(t, b);
  const got = new Set(done.map((o) => o.format));
  const lamp = (tone, label, tip) => h("span.mc-lamp", { title: tip }, h("span.lamp", { dataset: tone ? { tone } : {} }), label);
  return h("div.mc-guard", {},
    h("span.label", {}, "Brand guard"),
    !b.body.colours.length ? lamp(null, "No palette", "Add the brand's colours to check them")
      : avg === null ? lamp(null, "Palette", "Checked on the next shoot")
      : lamp(avg >= 0.45 ? "ok" : "warn", `Palette ${Math.round(avg * 100)}%`, "How much of the shots' colour sits near the brand's colours"),
    lamp(b.body.logo ? "ok" : null, b.body.logo ? "Logo given" : "No logo", b.body.logo ? "The logo goes to the model with the product" : "Add the logo to the kit"),
    done.length ? lamp(formats.every((f) => got.has(f)) ? "ok" : "warn", "Formats", "Every format asked for came back") : null);
}

function shootPanel(b) {
  const t = templateById(macaron.template);
  const p = productNow(b);
  const outs = b.body.outputs.filter((o) => o.template === t.id && o.product === p?.id);
  const latest = outs.find((o) => o.photo);
  const busy = shooting();
  const cost = estimate();
  const formats = formatsOf(t, b);
  return h("section.mc-panel.mc-shoot", {},
    h("div.mc-head", {}, h("span.card-label", {}, "The shoot")),
    h("div", {}, h("h2.mc-title", {}, t.name), h("p.mc-sub", {}, `${t.category}${p ? ` · ${p.name}` : ""}`)),
    h("button.mc-hero", { type: "button", title: latest ? "See it full size" : "The template's example", on: { click: () => (latest?.video ? view(latest.video, "video") : view(latest?.photo.url ?? previewOf(t))) } },
      h("img", { src: latest?.photo.url ?? previewOf(t), alt: "", draggable: false }),
      latest ? null : h("span.mc-hero-tag", {}, "Example")),
    h("span.label", {}, "Formats"),
    h("div.mc-formats", {}, ...t.formats.map((f) => h("button", { type: "button", "aria-pressed": String(formats.includes(f)), on: { click: () => toggleFormat(f) } }, f))),
    h("div.mc-row", {}, h("span.label", {}, "Count"),
      h("div.mc-stepper", {},
        h("button", { type: "button", disabled: b.body.shoot.count <= 1, on: { click: () => setCount(b.body.shoot.count - 1) } }, "−"),
        h("span", {}, b.body.shoot.count),
        h("button", { type: "button", disabled: b.body.shoot.count >= 4, on: { click: () => setCount(b.body.shoot.count + 1) } }, "+"))),
    h("div.mc-row", {}, h("span.label", {}, "Look"), lookPicker()),
    guard(b, t, outs),
    h("button.mc-go", { type: "button", disabled: busy || !p, title: p ? `${formats.length * b.body.shoot.count} ${t.media === "video" ? "videos" : "pictures"} of ${p.name}` : "Add a product first", on: { click: () => shoot() } },
      sprite("product-macaron"), h("span", {}, busy ? "Shooting" : "Shoot"), cost ? h("em", {}, `≈ ${cost} cr`) : null),
    h("div.mc-head.is-gap", {}, h("span.card-label", {}, "Outputs"), h("span.mc-count", {}, outs.length === 1 ? "1 shot" : `${outs.length} shots`)),
    h("div.mc-outs", {}, ...outs.map((o) => {
      const name = `${b.name}-${t.id}-${o.format.replace(":", "x")}-${o.id}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const url = o.video ?? o.photo?.url;
      return h(`div.mc-out${o.status !== "done" ? ".is-busy" : ""}`, {},
        o.photo ? h("button.mc-out-pic", { type: "button", title: "See it full size", on: { click: () => (o.video ? view(o.video, "video") : view(o.photo.url)) } }, h("img", { src: o.photo.url, alt: "", draggable: false, loading: "lazy" }), o.video ? h("span.mc-play", {}, icon("play")) : null)
          : h("span.mc-out-pic.is-empty", {}, h("span.lamp", { dataset: { tone: o.status === "failed" ? "crit" : "busy" } })),
        h("span.mc-out-tag", {}, o.format),
        o.status === "rolling" ? h("span.mc-out-state", {}, h("span.lamp", { dataset: { tone: "busy" } }), "Rolling") : o.status === "failed" ? h("span.mc-out-state.is-failed", { title: o.error ?? "" }, "Failed") : null,
        h("div.mc-out-keys", {},
          url && o.status === "done" ? h("a.key.is-icon", { href: `${url}?download=${name}.${o.video ? "mp4" : (url.split(".").pop() || "png")}`, title: "Download" }, icon("download")) : null,
          h("button.key.is-icon", { type: "button", title: "Take it off", on: { click: () => removeOutput(o.id) } }, icon("trash"))));
    })));
}

// ---------------------------------------------------------------- the screen

function welcome() {
  return h("div.mc-welcome", {},
    h("img.star", { src: "brand/cast/brioche.png", alt: "", draggable: false }),
    h("h1", {}, "Macaron"),
    h("p", {}, "Ready-to-post content for a brand: its kit, its products, a template, and the shoot."),
    h("div.mc-welcome-keys", {},
      h("button.mc-go", { type: "button", disabled: macaron.busy.has("example"), on: { click: () => exampleBrand() } }, h("span", {}, macaron.busy.has("example") ? "Setting it up" : "Start with the example")),
      h("button.key", { type: "button", on: { click: () => newBrand() } }, icon("plus"), "A brand of my own")));
}

export function renderMacaron(el) {
  loadBrands();
  const b = macaron.brand;
  const active = document.activeElement;
  const focus = el.contains(active) ? active.dataset.focus : null;
  const sel = focus ? [active.selectionStart, active.selectionEnd] : null;
  el.replaceChildren(b ? h("div.macaron", {}, kit(b), gallery(), shootPanel(b)) : macaron.ready && macaron.list.length === 0 ? welcome() : h("div.mc-welcome", {}, h("span.lamp", { dataset: { tone: "busy" } })));
  if (focus) {
    const back = el.querySelector(`[data-focus="${CSS.escape(focus)}"]`);
    back?.focus({ preventScroll: true });
    if (back && sel && back.setSelectionRange) try { back.setSelectionRange(...sel); } catch {}
  }
}

// a photo dropped on Macaron is a product; dropped on the logo, the logo
document.addEventListener("dragover", (e) => currentPage() === "macaron" && e.dataTransfer?.types?.includes("Files") && e.preventDefault());
document.addEventListener("drop", (e) => {
  if (currentPage() !== "macaron" || !e.dataTransfer?.files?.length) return;
  e.preventDefault();
  const onLogo = e.target.closest?.(".mc-logo");
  for (const f of e.dataTransfer.files) if (f.type.startsWith("image/")) onLogo ? setLogo(f) : addProduct(f);
});
document.addEventListener("paste", (e) => {
  if (currentPage() !== "macaron" || e.target.closest?.("input, textarea")) return;
  const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
  if (!files.length) return;
  e.preventDefault();
  files.forEach(addProduct);
});
