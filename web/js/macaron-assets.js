// The product's window: its products, the pictures a brand makes content from (its app's screens, product
// shots, renders, work made through Comfyture), a way to make a new picture with an image model, and the
// template shoot that puts a product in a setup, in every format asked for. Each is a tab of the window.
import { h, icon, sprite } from "./dom.js";
import { toast, artist, setArtist, artists, changed } from "./store.js";
import { dropdown } from "./controls.js";
import { artistItems } from "./writer-menu.js";
import { view } from "./viewer.js";
import { openPicker, pictureOf } from "./picker.js";
import { FORMAT_KEYS, FORMATS, frameOf } from "./design.js";
import { TEMPLATES, CATEGORIES, templateById, previewOf } from "./macaron-templates.js";
import {
  macaron, designNow, addAsset, removeAsset, addLayer, makePicture, productNow, addProduct, pickProduct, setProduct, removeProduct, pickTemplate, setFilter, formatsOf, toggleFormat,
  setCount, shoot, shooting, removeOutput, estimate,
} from "./macaron.js";
import { card, key, seg, chip, arming, isArmed, armedNow, chooseFiles, fill } from "./macaron-ui.js";

const KINDS = [["all", "All"], ["app", "App"], ["product", "Product"], ["mascot", "Mascot"], ["made", "Made with it"], ["render", "Renders"], ["brand", "Brand"], ["upload", "Uploads"]];
const SOURCE = { screenshot: "Screenshot", generated: "Generated", made: "Made with Comfyture", brand: "Brand file", upload: "Upload" };
const MODELS = [["gpt-image-2.5-flare", "GPT Flare", "GPT Image 2.5 Flare: follows references closely, for characters and products"], ["flux-3-image", "FLUX 3", "FLUX 3: photographic scenes, up to ten references"]];
const make = { model: "gpt-image-2.5-flare", prompt: "", refs: [], aspect: "4:5", quality: "medium" };
const words = (s) => s.split(",").map((w) => w.trim()).filter(Boolean).slice(0, 6);
const pick = (fn, multiple = false) => chooseFiles(fn, multiple);

export function productParts() {
  // what the forms hold is not in the project: a count says when they have to be drawn again
  let rev = 0;
  const rerender = () => (rev++, changed("macaron"));

  function library(b) {
    const all = b.body.assets;
    const kind = macaron.assetKind ?? "all";
    const list = all.filter((a) => kind === "all" || a.kind === kind);
    const counts = Object.fromEntries(KINDS.map(([k]) => [k, k === "all" ? all.length : all.filter((a) => a.kind === k).length]));
    const open = (a) => (a.video ? view(a.video, "video") : view(a.url));
    const use = (a) => {
      if (!designNow()) return toast("Open a design first.");
      const F = frameOf(macaron.format);
      const w = a.kind === "mascot" || a.clear ? 0.4 : 0.7;
      addLayer("image", { name: a.name, src: a.url, fit: a.clear ? "contain" : "cover", crop: { x: 0, y: 0, w: 1, h: 1 }, w, h: Math.min(0.8, (w * F.w * (a.height / a.width)) / F.h), x: (1 - w) / 2, y: 0.3, radius: a.clear ? 0 : 0.02 });
    };
    const add = (e) => openPicker(e.currentTarget, { title: "A picture for the project", characters: false, multiple: true, onPick: async (choice) => { try { await addAsset(await pictureOf(choice)); } catch (err) { toast(err.message, { tone: "crit" }); } } });
    return card("is-library", "Pictures", [key(icon("plus"), "Add pictures from the computer or the Library", add)],
      h("div.mc-filters", {}, ...KINDS.filter(([k]) => counts[k] || k === "all").map(([k, label]) => h("button", { type: "button", "aria-pressed": String(kind === k), on: { click: () => setFilter("assetKind", k) } }, label, h("em", {}, String(counts[k]))))),
      list.length ? h("div.mc-assets", {}, ...list.map((a) => {
        const armedKey = `asset:${a.id}`;
        return h("figure.mc-asset", { className: a.clear ? "is-clear" : "" },
          h("button.mc-asset-pic", { type: "button", title: `${a.name}\nSee it full size`, on: { click: () => open(a) } }, h("img", { src: a.url, alt: "", loading: "lazy", draggable: false }), a.video ? h("span.mc-play", {}, icon("play")) : null),
          h("figcaption", {}, h("b", {}, a.name), h("em", {}, `${a.width}×${a.height} · ${SOURCE[a.source] ?? a.source ?? a.kind}${a.credits ? ` · ${a.credits} cr` : ""}`)),
          h("span.mc-asset-keys", {},
            key(sprite("image-replace"), "Put it in the design open", () => use(a)),
            key(icon("trash"), isArmed(armedKey) ? "Click again to take it out" : "Take it out of the project", () => arming(armedKey, rerender, () => removeAsset(a.id)), { on: isArmed(armedKey) })));
      })) : h("button.mc-drop", { type: "button", on: { click: add } }, icon("upload"), h("span", {}, "Add the brand's pictures: its screens, its products, its work")));
  }

  function picture(b) {
    const assets = b.body.assets.filter((a) => a.url && !a.video).slice(0, 24);
    const busy = [...macaron.busy].some((k) => k.startsWith("picture:"));
    const cost = make.model === "flux-3-image" ? "≈ 15 cr" : make.quality === "high" ? "≈ 17 to 28 cr" : "≈ 3 to 8 cr";
    const go = async () => {
      if (!make.prompt.trim()) return toast("Say what the picture shows.");
      try {
        await makePicture({ prompt: `${make.prompt.trim()} No text, no letters, no logo, no watermark.`, model: make.model, aspect: make.aspect, quality: make.quality, name: make.prompt.trim().slice(0, 40), refs: make.refs.map((id) => b.body.assets.find((a) => a.id === id)).filter(Boolean).map((a) => ({ ...(a.file ? { file: a.file } : { url: a.url }), name: a.name.split(" ")[0] })) });
        toast("The picture is in the project.");
      } catch (e) {
        toast(e.message, { tone: "crit" });
      }
    };
    return card("is-make", "Make a picture", [],
      seg(MODELS.map(([v, label, tip]) => [v, label, tip]), make.model, (v) => ((make.model = v), rerender())),
      h("textarea.field.mc-text", { rows: 4, value: make.prompt, placeholder: "A scene, a product, a mood: plain words. Words, logos and headlines stay layers, never in the picture.", "aria-label": "What the picture shows", on: { input: (e) => (make.prompt = e.target.value) } }),
      h("div.mc-make-refs", {}, h("span.label", {}, `References ${make.refs.length}/3`),
        h("div.mc-refs-pick", {}, ...assets.map((a) => h("button.mc-ref-chip", { type: "button", title: a.name, "aria-pressed": String(make.refs.includes(a.id)), on: { click: () => ((make.refs = make.refs.includes(a.id) ? make.refs.filter((x) => x !== a.id) : [...make.refs, a.id].slice(-3)), rerender()) } }, h("img", { src: a.url, alt: "", draggable: false }))))),
      h("div.mc-make-row", {}, seg(FORMAT_KEYS.map((f) => [f, f, FORMATS[f].name]), make.aspect, (v) => ((make.aspect = v), rerender()), { cls: "is-small" }),
        make.model === "gpt-image-2.5-flare" ? seg([["medium", "Medium", "Quicker and cheaper"], ["high", "High", "More detail"]], make.quality, (v) => ((make.quality = v), rerender()), { cls: "is-small" }) : null),
      h(`button.mc-go${busy ? ".is-busy" : ""}`, { type: "button", disabled: busy, on: { click: go } }, sprite("image-generate"), h("span", {}, busy ? "Making it" : "Make the picture"), h("em", {}, cost)),
      h("p.mc-hint", {}, make.model === "flux-3-image" ? "FLUX 3 through Comfy Router, 1k tier: sizes come back near the frame's shape and are cropped to it in the design." : "GPT Image 2.5 Flare through Comfy Router, drawn at the post's own size (1088×1360, 1280×1280, 1152×2048)."));
  }

  // ---- the template shoot, as it was: a product in a setup, a picture per format
  function guard(b, t, outs) {
    const done = outs.filter((o) => o.photo);
    const scores = done.map((o) => o.palette).filter((x) => typeof x === "number");
    const avg = scores.length ? scores.reduce((a, x) => a + x, 0) / scores.length : null;
    const lamp = (tone, label, tip) => h("span.mc-lamp", { title: tip }, h("span.lamp", { dataset: tone ? { tone } : {} }), label);
    return h("div.mc-guard-line", {},
      !b.body.colours.length ? lamp(null, "No palette", "Add the brand's colours to check them") : avg === null ? lamp(null, "Palette", "Checked on the next shoot") : lamp(avg >= 0.45 ? "ok" : "warn", `Palette ${Math.round(avg * 100)}%`, "How much of the shots' colour sits near the brand's colours"),
      lamp(b.body.logo ? "ok" : null, b.body.logo ? "Logo given" : "No logo", "The logo goes to the model with the product"));
  }
  function shootCard(b) {
    const t = templateById(macaron.template);
    const p = productNow(b);
    const outs = b.body.outputs.filter((o) => o.template === t.id && o.product === p?.id);
    const formats = formatsOf(t, b);
    const busy = shooting();
    const cost = estimate();
    const list = TEMPLATES.filter((x) => (macaron.media === "all" || (macaron.media === "images") === (x.media === "image")) && (macaron.category === "all" || x.category === macaron.category));
    const lookItems = artistItems().filter((it) => artists().find((x) => x.id === it.value)?.templates.some((x) => x.id === "edit"));
    const look = lookItems.length ? dropdown({ label: "Look", value: lookItems.some((it) => it.value === artist()) ? artist() : lookItems[0].value, items: lookItems, onChange: (id) => (setArtist(id), rerender()), width: "fit", note: "The picture model that shoots the product" }) : null;
    return card("is-shoot", "Shoot a product", [chip(`${TEMPLATES.length} templates`)],
      h("div.mc-products", {}, ...b.body.products.map((x) => h(`div.mc-product${x.id === p?.id ? ".is-on" : ""}`, { on: { click: (e) => !e.target.closest("input, button") && pickProduct(x.id) } },
        h(`img${x.cutout ? ".is-clear" : ""}`, { src: x.cutout?.url ?? x.photo.url, alt: "", draggable: false }),
        h("input.mc-product-name", { value: x.name, "aria-label": "The product's name", on: { input: (e) => setProduct(x.id, { name: e.target.value.slice(0, 40) }) } }),
        key(icon("trash"), isArmed(`product:${x.id}`) ? "Click again to take it out" : "Take it out", () => arming(`product:${x.id}`, rerender, () => removeProduct(x.id)), { on: isArmed(`product:${x.id}`), cls: "mc-product-x" }))),
        h("button.mc-product.is-add", { type: "button", title: "Add a product photo, on any background", on: { click: (e) => openPicker(e.currentTarget, { title: "Add products", characters: false, multiple: true, onPick: async (c) => { try { await addProduct(await pictureOf(c)); } catch (err) { toast(err.message, { tone: "crit" }); } } }) } }, icon("plus"), h("span", {}, "Product"))),
      h("div.mc-filters", {}, ...[["all", "All"], ["images", "Images"], ["videos", "Videos"]].map(([v, l]) => h("button", { type: "button", "aria-pressed": String(macaron.media === v), on: { click: () => setFilter("media", v) } }, l)), h("span.mc-sep"),
        ...["all", ...CATEGORIES].map((c) => h("button", { type: "button", "aria-pressed": String(macaron.category === c), on: { click: () => setFilter("category", c) } }, c === "all" ? "Every kind" : c))),
      h("div.mc-templates", {}, ...list.map((x) => h(`button.mc-template${x.id === macaron.template ? ".is-on" : ""}`, { type: "button", title: `${x.name} · ${x.media} · ${x.formats.join(", ")}`, on: { click: () => pickTemplate(x.id) } },
        h("img", { src: previewOf(x), alt: "", loading: "lazy", draggable: false }), x.media === "video" ? h("span.mc-play", {}, icon("play")) : null, h("b", {}, x.name)))),
      h("div.mc-shoot-row", {},
        h("span.label", {}, t.name),
        h("div.mc-formats", {}, ...t.formats.map((f) => h("button", { type: "button", "aria-pressed": String(formats.includes(f)), on: { click: () => toggleFormat(f) } }, f))),
        h("div.mc-stepper", {}, h("button", { type: "button", disabled: b.body.shoot.count <= 1, on: { click: () => setCount(b.body.shoot.count - 1) } }, "−"), h("span", {}, b.body.shoot.count), h("button", { type: "button", disabled: b.body.shoot.count >= 4, on: { click: () => setCount(b.body.shoot.count + 1) } }, "+")),
        look, guard(b, t, outs),
        h("button.mc-go.is-inline", { type: "button", disabled: busy || !p, title: p ? `${formats.length * b.body.shoot.count} ${t.media === "video" ? "videos" : "pictures"} of ${p.name}` : "Add a product first", on: { click: () => shoot() } }, sprite("product-macaron"), h("span", {}, busy ? "Shooting" : "Shoot"), cost ? h("em", {}, `≈ ${cost} cr`) : null)),
      outs.length ? h("div.mc-outs", {}, ...outs.map((o) => {
        const url = o.video ?? o.photo?.url;
        return h(`div.mc-out${o.status !== "done" ? ".is-busy" : ""}`, {},
          o.photo ? h("button.mc-out-pic", { type: "button", title: "See it full size", on: { click: () => (o.video ? view(o.video, "video") : view(o.photo.url)) } }, h("img", { src: o.photo.url, alt: "", draggable: false, loading: "lazy" }), o.video ? h("span.mc-play", {}, icon("play")) : null) : h("span.mc-out-pic.is-empty", {}, h("span.lamp", { dataset: { tone: o.status === "failed" ? "crit" : "busy" } })),
          h("span.mc-out-tag", {}, o.format),
          o.status === "rolling" ? h("span.mc-out-state", {}, h("span.lamp", { dataset: { tone: "busy" } }), "Rolling") : o.status === "failed" ? h("span.mc-out-state.is-failed", { title: o.error ?? "" }, "Failed") : null,
          h("div.mc-out-keys", {},
            o.photo && o.status === "done" ? key(sprite("image-replace"), "Keep it in the project's pictures", () => addAsset({ file: o.photo.file, url: o.photo.url, width: o.photo.width, height: o.photo.height, name: `${t.name} ${o.format}` }, "render")) : null,
            url && o.status === "done" ? h("a.key.is-icon.is-sm", { href: `${url}?download=${`${b.name}-${t.id}-${o.format}-${o.id}`.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.${o.video ? "mp4" : (url.split(".").pop() || "png")}`, title: "Download" }, icon("download")) : null,
            key(icon("trash"), "Take it off", () => removeOutput(o.id))));
      })) : null);
  }

  /** The products: a card each, to name, describe and pick, and one to add. */
  function productCard(b) {
    const cur = productNow(b);
    const add = (e) => openPicker(e.currentTarget, { title: "Add products", characters: false, multiple: true, onPick: async (c) => { try { await addProduct(await pictureOf(c)); } catch (err) { toast(err.message, { tone: "crit" }); } } });
    return card("is-prod", "Products", [key(icon("plus"), "Add a product photo, on any background", add)],
      b.body.products.length ? h("div.mc-pcards", {}, ...b.body.products.map((x) => h(`article.mc-pcardx${x.id === cur?.id ? ".is-on" : ""}`, {},
        h("button.mc-pcardx-pic", { type: "button", title: "Use this product", on: { click: () => pickProduct(x.id) } }, h(`img${x.cutout ? ".is-clear" : ""}`, { src: x.cutout?.url ?? x.photo.url, alt: "", draggable: false })),
        h("input.field.mc-product-name", { value: x.name, "aria-label": "The product's name", on: { input: (e) => setProduct(x.id, { name: e.target.value.slice(0, 40) }) } }),
        h("input.field.mc-words", { value: (x.features ?? []).join(", "), placeholder: "What makes it good: real plums, small batch", "aria-label": "Features", on: { change: (e) => setProduct(x.id, { features: words(e.target.value) }) } }),
        key(icon("trash"), isArmed(`product:${x.id}`) ? "Click again to take it out" : "Take it out", () => arming(`product:${x.id}`, rerender, () => removeProduct(x.id)), { on: isArmed(`product:${x.id}`), cls: "mc-product-x" })))) : h("button.mc-drop", { type: "button", on: { click: add } }, icon("upload"), h("span", {}, "Add a photo of the product")));
  }

  const typingIn = (el) => el.contains(document.activeElement) && document.activeElement.matches("input, textarea");
  const part = (build, sig) => {
    const el = h("div.mc-wpart");
    return { el, update() { const b = macaron.brand; if (!b) return; if (typingIn(el)) return false; fill(el, build(b)); }, sig };
  };
  const sigOf = (fn) => () => JSON.stringify([rev, fn(macaron.brand?.body ?? {})]);
  return {
    product: part(productCard, sigOf((b) => [b.products, b.product, armedNow()])),
    pictures: part(library, sigOf((b) => [b.assets, macaron.assetKind, armedNow(), designNow()?.id])),
    make: part(picture, sigOf((b) => [b.assets, [...macaron.busy]])),
    shoot: part(shootCard, sigOf((b) => [b.outputs, b.products, b.product, b.shoot, macaron.template, macaron.media, macaron.category, [...macaron.busy], armedNow(), b.colours, b.logo])),
  };
}
