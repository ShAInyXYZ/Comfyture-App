// The product's window (mockup: docs/brand/products/macaron-v3/win-product.png): its products, the pictures a brand makes content from (its app's screens, product
// shots, renders, work made through Comfyture), a way to make a new picture with an image model, and the
// template shoot that puts a product in a setup, in every format asked for. Each is a tab of the window.
import { h, icon, sprite } from "./dom.js";
import { toast, artist, setArtist, artists, changed } from "./store.js";
import { dropdown } from "./controls.js";
import { draftKey } from "./macaron-tools.js";
import { artistItems } from "./writer-menu.js";
import { view } from "./viewer.js";
import { openPicker, pictureOf } from "./picker.js";
import { FORMAT_KEYS, FORMATS, frameOf } from "./design.js";
import { TEMPLATES, CATEGORIES, templateById, previewOf } from "./macaron-templates.js";
import {
  macaron, designNow, addAsset, removeAsset, addLayer, makePicture, productNow, addProduct, pickProduct, setProduct, removeProduct, pickTemplate, setFilter, formatsOf, toggleFormat,
  setCount, shoot, shooting, removeOutput, estimate,
} from "./macaron.js";
import { key, arming, isArmed, armedNow, chooseFiles, fill, mcicon } from "./macaron-ui.js";

const KINDS = [["all", "All"], ["app", "App"], ["product", "Product"], ["mascot", "Mascot"], ["made", "Made with it"], ["render", "Renders"], ["brand", "Brand"], ["upload", "Uploads"]];
const SOURCE = { screenshot: "Screenshot", generated: "Generated", made: "Made with Comfyture", brand: "Brand file", upload: "Upload" };
const MODELS = [["gpt-image-2.5-flare", "GPT Flare", "GPT Image 2.5 Flare: follows references closely, for characters and products"], ["flux-3-image", "FLUX 3", "FLUX 3: photographic scenes, up to ten references"]];
const make = { model: "gpt-image-2.5-flare", prompt: "", refs: [], aspect: "4:5", quality: "medium" };
const words = (s) => s.split(",").map((w) => w.trim()).filter(Boolean).slice(0, 6);

/** A segmented choice of one, as the windows draw it (items: [value, label, tooltip]). */
const segs = (items, value, pickIt, o = {}) =>
  h(`div.mc-segs${o.cls ? `.${o.cls}` : ""}`, { role: "group", "aria-label": o.label ?? "" }, ...items.map(([v, label, tip]) =>
    h("button.mc-seg", { type: "button", title: tip ?? "", "aria-label": tip ?? undefined, "aria-pressed": String(v === value), on: { click: () => pickIt(v) } }, label)));
const lamp = (tone, label, tip) => h("span.mc-lamp", { title: tip }, h("span.lamp", { dataset: tone ? { tone } : {} }), label);
const addProducts = (e) => openPicker(e.currentTarget, { title: "Add products", characters: false, multiple: true, onPick: async (c) => { try { await addProduct(await pictureOf(c)); } catch (err) { toast(err.message, { tone: "crit" }); } } });
const addPictures = (e) => openPicker(e.currentTarget, { title: "A picture for the project", characters: false, multiple: true, onPick: async (choice) => { try { await addAsset(await pictureOf(choice)); } catch (err) { toast(err.message, { tone: "crit" }); } } });
const goTab = (tab) => ((macaron.productTab = tab), changed("macaron"));

export function productParts() {
  // what the forms hold is not in the project: a count says when they have to be drawn again
  let rev = 0;
  const rerender = () => (rev++, changed("macaron"));

  // ---- Product: the one that is open, big, with what is said of it; the others beside it
  function productPane(b) {
    const cur = productNow(b);
    const add = h("button.mc-pp-add", { type: "button", title: "Add a product photo, on any background", "aria-label": "Add a product", on: { click: addProducts } }, icon("plus"));
    const switcher = h("div.mc-pp-switch", {}, ...b.body.products.map((x) => h(`button.mc-pp-thumb${x.id === cur?.id ? ".is-on" : ""}`, { type: "button", title: x.name, "aria-label": x.name, "aria-pressed": String(x.id === cur?.id), on: { click: () => pickProduct(x.id) } },
      h(`img${x.cutout ? ".is-clear" : ""}`, { src: x.cutout?.url ?? x.photo.url, alt: "", draggable: false }))), add);
    if (!cur) return h("div.mc-pp", {}, h("button.mc-drop-big", { type: "button", on: { click: addProducts } }, icon("upload"), h("b", {}, "Add the product"), h("span", {}, "A photo on any background: the cut-out is made for you")));
    const armedKey = `product:${cur.id}`;
    const file = (label, pic, clear) => h("div.mc-pp-file", {},
      pic ? h("button.mc-pp-file-pic", { type: "button", title: `${label}: see it full size`, on: { click: () => view(pic.url) } }, h(`img${clear ? ".is-clear" : ""}`, { src: pic.url, alt: "", draggable: false, loading: "lazy" }))
        : h("span.mc-pp-file-pic.is-empty", { title: "The cut-out is made when a photo is added" }, "None"),
      h("span.label", {}, label));
    return h("div.mc-pp", {},
      h("div.mc-pp-left", {},
        h(`div.mc-pp-stage${cur.scene ? ".has-scene" : ""}${cur.cutout ? ".is-cut" : ""}`, {},
          cur.scene ? h("img.mc-pp-scene", { src: cur.scene, alt: "", draggable: false }) : null,
          h("img.mc-pp-hero", { src: cur.cutout?.url ?? cur.photo.url, alt: cur.name, draggable: false })),
        switcher),
      h("div.mc-pp-right", {},
        h("div.mc-sec", {}, h("span.label", {}, "Its name"),
          h("input.field.mc-pp-name", { value: cur.name, "aria-label": "The product's name", on: { input: (e) => setProduct(cur.id, { name: e.target.value.slice(0, 40) }) } })),
        h("div.mc-sec", {}, h("span.label", {}, "What makes it good"),
          h("input.field", { value: (cur.features ?? []).join(", "), placeholder: "Real plums, small batch, a blank label", "aria-label": "What makes it good", on: { change: (e) => setProduct(cur.id, { features: words(e.target.value) }) } }),
          (cur.features ?? []).length ? h("ul.mc-pp-feats", {}, ...cur.features.map((f) => h("li", {}, f))) : h("p.mc-hint", {}, "A few plain words: they go into the shoot and the posts.")),
        h("div.mc-sec", {}, h("span.label", {}, "Its pictures"), h("div.mc-pp-files", {}, file("Photo", cur.photo, false), file("Cut-out", cur.cutout, true))),
        h("div.mc-pp-keys", {},
          h("button.mc-primary", { type: "button", on: { click: () => goTab("shoot") } }, sprite("product-macaron"), "Shoot this product"),
          h("span.spacer"),
          h(`button.mc-iconkey.is-danger${isArmed(armedKey) ? ".is-armed" : ""}`, { type: "button", title: isArmed(armedKey) ? "Click again to take it out" : "Take this product out", "aria-label": "Take this product out", on: { click: () => arming(armedKey, rerender, () => removeProduct(cur.id)) } }, icon("trash")))));
  }

  // ---- Pictures: the brand's pictures as a gallery, a tile to add more
  function pictures(b) {
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
    return h("div.mc-w", {},
      h("div.mc-pic-top", {},
        h("div.mc-fchips", {}, ...KINDS.filter(([k]) => counts[k] || k === "all").map(([k, label]) => h("button.mc-fchip", { type: "button", "aria-pressed": String(kind === k), on: { click: () => setFilter("assetKind", k) } }, label, h("em", {}, String(counts[k]))))),
        h("button.mc-primary", { type: "button", title: "Add pictures from the computer or the Library", on: { click: addPictures } }, icon("plus"), "Add pictures")),
      h("div.mc-gallery", {}, ...list.map((a) => {
        const armedKey = `asset:${a.id}`;
        return h(`figure.mc-gal${a.clear ? ".is-clear" : ""}`, {},
          h("button.mc-gal-pic", { type: "button", title: `${a.name}\nSee it full size`, on: { click: () => open(a) } }, h("img", { src: a.url, alt: "", loading: "lazy", draggable: false }), a.video ? h("span.mc-play", {}, icon("play")) : null),
          h("figcaption", {}, h("b", {}, a.name), h("em", {}, `${a.width}×${a.height} · ${SOURCE[a.source] ?? a.source ?? a.kind}${a.credits ? ` · ${a.credits} cr` : ""}`)),
          h("span.mc-gal-keys", {},
            h("button.mc-iconkey.is-over", { type: "button", title: "Put it in the design open", "aria-label": "Put it in the design open", on: { click: () => use(a) } }, sprite("image-replace")),
            h(`button.mc-iconkey.is-over${isArmed(armedKey) ? ".is-armed" : ""}`, { type: "button", title: isArmed(armedKey) ? "Click again to take it out" : "Take it out of the project", "aria-label": "Take it out of the project", on: { click: () => arming(armedKey, rerender, () => removeAsset(a.id)) } }, icon("trash"))));
      }),
        h("button.mc-gal-add", { type: "button", on: { click: addPictures } }, icon("upload"), h("span", {}, "Drop pictures here"), h("em", {}, "or click to choose"))));
  }

  // ---- Make a picture: one calm column of words, and the picture beside it
  function picture(b) {
    const assets = b.body.assets.filter((a) => a.url && !a.video).slice(0, 24);
    const busy = [...macaron.busy].some((k) => k.startsWith("picture:"));
    const cost = make.model === "flux-3-image" ? "≈ 15 cr" : make.quality === "high" ? "≈ 17 to 28 cr" : "≈ 3 to 8 cr";
    const last = b.body.assets.find((a) => a.source === "generated" && a.url);
    const go = async () => {
      if (!make.prompt.trim()) return toast("Say what the picture shows.");
      try {
        await makePicture({ prompt: `${make.prompt.trim()} No text, no letters, no logo, no watermark.`, model: make.model, aspect: make.aspect, quality: make.quality, name: make.prompt.trim().slice(0, 40), refs: make.refs.map((id) => b.body.assets.find((a) => a.id === id)).filter(Boolean).map((a) => ({ ...(a.file ? { file: a.file } : { url: a.url }), name: a.name })) });
        toast("The picture is in the project.");
      } catch (e) {
        toast(e.message, { tone: "crit" });
      }
    };
    const F = FORMATS[make.aspect];
    const shown = !busy && last && macaron.makeShown !== false;
    return h("div.mc-mk", {},
      h("div.mc-mk-form", {},
        h("div.mc-sec", {}, h("span.label", {}, "The picture model"),
          segs(MODELS.map(([v, label, tip]) => [v, label, tip]), make.model, (v) => ((make.model = v), rerender()))),
        h("div.mc-sec", {}, h("span.label", {}, "What it shows"),
          h("textarea.field.mc-statement", { rows: 3, value: make.prompt, placeholder: "A jar on a sunlit counter, plums around it", "aria-label": "What the picture shows", on: { input: (e) => { make.prompt = e.target.value; e.target.style.height = "auto"; e.target.style.height = `${e.target.scrollHeight}px`; } } }),
          h("p.mc-hint", {}, "Plain words. Words, logos and headlines stay layers, never in the picture.")),
        h("div.mc-sec", {}, h("span.label", {}, `References ${make.refs.length} of 3`),
          assets.length ? h("div.mc-refs-pick", {}, ...assets.map((a) => h("button.mc-ref-chip", { type: "button", title: a.name, "aria-label": a.name, "aria-pressed": String(make.refs.includes(a.id)), on: { click: () => ((make.refs = make.refs.includes(a.id) ? make.refs.filter((x) => x !== a.id) : [...make.refs, a.id].slice(-3)), rerender()) } }, h("img", { src: a.url, alt: "", draggable: false, loading: "lazy" })))) : h("p.mc-hint", {}, "Add pictures to the project to use them as references.")),
        h("div.mc-mk-row", {},
          h("div.mc-sec", {}, h("span.label", {}, "Shape"), segs(FORMAT_KEYS.map((f) => [f, f, FORMATS[f].name]), make.aspect, (v) => ((make.aspect = v), rerender()))),
          make.model === "gpt-image-2.5-flare" ? h("div.mc-sec", {}, h("span.label", {}, "Quality"), segs([["medium", "Medium", "Quicker and cheaper"], ["high", "High", "More detail"]], make.quality, (v) => ((make.quality = v), rerender()))) : null),
        h("div.mc-mk-go", {},
          h(`button.mc-primary${busy ? ".is-busy" : ""}`, { type: "button", disabled: busy, on: { click: go } }, sprite("image-generate"), busy ? "Making it" : "Make the picture"),
          h("span.mc-cost", {}, cost),
          h("span.spacer"),
          draftKey("Brioche can word it", null, "Write the picture prompt for a new picture of the brand's product: a scene, a light, a mood, in plain words.")),
        h("p.mc-hint", {}, make.model === "flux-3-image" ? "FLUX 3 through Comfy Router, 1k tier: sizes come back near the frame's shape and are cropped to it in the design." : "GPT Image 2.5 Flare through Comfy Router, drawn at the post's own size (1088×1360, 1280×1280, 1152×2048).")),
      h("div.mc-mk-view", {},
        h(`div.mc-mk-frame${busy ? ".is-busy" : ""}`, { style: { "--ar": `${F.w} / ${F.h}` } },
          shown ? h("button.mc-mk-pic", { type: "button", title: `${last.name}\nSee it full size`, on: { click: () => view(last.url) } }, h("img", { src: last.url, alt: "", draggable: false }))
            : h("div.mc-mk-empty", {}, busy ? h("span.lamp", { dataset: { tone: "busy" } }) : sprite("image-generate"), h("span", {}, busy ? "Making your picture" : "Your picture appears here"))),
        shown ? h("div.mc-mk-meta", {}, h("b", {}, last.name), h("em", {}, `${last.width}×${last.height}${last.credits ? ` · ${last.credits} cr` : ""}`)) : null));
  }

  // ---- Shoot: the templates as a gallery, the one picked on the right with what it will make
  function guard(b, outs) {
    const done = outs.filter((o) => o.photo);
    const scores = done.map((o) => o.palette).filter((x) => typeof x === "number");
    const avg = scores.length ? scores.reduce((a, x) => a + x, 0) / scores.length : null;
    return h("div.mc-guard-line", {},
      !b.body.colours.length ? lamp(null, "No palette", "Add the brand's colours to check them") : avg === null ? lamp(null, "Palette", "Checked on the next shoot") : lamp(avg >= 0.45 ? "ok" : "warn", `Palette ${Math.round(avg * 100)}%`, "How much of the shots' colour sits near the brand's colours"),
      lamp(b.body.logo ? "ok" : null, b.body.logo ? "Logo given" : "No logo", "The logo goes to the model with the product"));
  }
  function shootPane(b) {
    const t = templateById(macaron.template);
    const p = productNow(b);
    const outs = b.body.outputs.filter((o) => o.template === t.id && o.product === p?.id);
    const formats = formatsOf(t, b);
    const busy = shooting();
    const cost = estimate();
    const list = TEMPLATES.filter((x) => (macaron.media === "all" || (macaron.media === "images") === (x.media === "image")) && (macaron.category === "all" || x.category === macaron.category));
    const lookItems = artistItems().filter((it) => artists().find((x) => x.id === it.value)?.templates.some((x) => x.id === "edit"));
    const look = lookItems.length ? dropdown({ label: "Look", value: lookItems.some((it) => it.value === artist()) ? artist() : lookItems[0].value, items: lookItems, onChange: (id) => (setArtist(id), rerender()), width: "fit", note: "The picture model that shoots the product" }) : null;
    const media = (v, label, glyph) => h("button.mc-fchip", { type: "button", "aria-pressed": String(macaron.media === v), on: { click: () => setFilter("media", macaron.media === v ? "all" : v) } }, glyph, label);
    return h("div.mc-sh", {},
      h("div.mc-sh-main", {},
        h("div.mc-sh-filters", {},
          h("div.mc-fchips", {}, ...["all", ...CATEGORIES].map((c) => h("button.mc-fchip", { type: "button", "aria-pressed": String(macaron.category === c), on: { click: () => setFilter("category", c) } }, c === "all" ? "Every kind" : c))),
          h("div.mc-fchips", {}, media("images", "Images", icon("image")), media("videos", "Videos", icon("play")))),
        list.length ? h("div.mc-tpls", {}, ...list.map((x) => h(`button.mc-tpl${x.id === macaron.template ? ".is-on" : ""}`, { type: "button", title: `${x.name} · ${x.media} · ${x.formats.join(", ")}`, "aria-pressed": String(x.id === macaron.template), on: { click: () => pickTemplate(x.id) } },
          h("img", { src: previewOf(x), alt: "", loading: "lazy", draggable: false }), x.media === "video" ? h("span.mc-play", {}, icon("play")) : null, h("b", {}, x.name)))) : h("p.mc-hint", {}, "No template of this kind."),
        outs.length ? h("div.mc-sec.mc-sh-outs", {}, h("span.label", {}, `Shot with ${t.name}`), h("div.mc-outs", {}, ...outs.map((o) => {
          const url = o.video ?? o.photo?.url;
          return h(`div.mc-out${o.status !== "done" ? ".is-busy" : ""}`, {},
            o.photo ? h("button.mc-out-pic", { type: "button", title: "See it full size", on: { click: () => (o.video ? view(o.video, "video") : view(o.photo.url)) } }, h("img", { src: o.photo.url, alt: "", draggable: false, loading: "lazy" }), o.video ? h("span.mc-play", {}, icon("play")) : null) : h("span.mc-out-pic.is-empty", {}, o.status === "rolling" ? null : icon("close")),
            h("span.mc-out-tag", {}, o.format),
            o.status === "rolling" ? h("span.mc-out-state", {}, h("span.lamp", { dataset: { tone: "busy" } }), "Rolling") : o.status === "failed" ? h("span.mc-out-state.is-failed", { title: o.error ?? "" }, "Failed") : null,
            h("div.mc-out-keys", {},
              o.photo && o.status === "done" ? key(sprite("image-replace"), "Keep it in the project's pictures", () => addAsset({ file: o.photo.file, url: o.photo.url, width: o.photo.width, height: o.photo.height, name: `${t.name} ${o.format}` }, "render")) : null,
              url && o.status === "done" ? h("a.key.is-icon.is-sm", { href: `${url}?download=${`${b.name}-${t.id}-${o.format}-${o.id}`.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.${o.video ? "mp4" : (url.split(".").pop() || "png")}`, title: "Download" }, icon("download")) : null,
              key(icon("trash"), "Take it off", () => removeOutput(o.id))));
        }))) : null),
      h("aside.mc-sh-side", {},
       h("div.mc-sh-info", {},
        h("div.mc-sh-pic", {}, h("img", { src: previewOf(t), alt: t.name, draggable: false }), t.media === "video" ? h("span.mc-play", {}, icon("play")) : null),
        h("div.mc-sh-row", {},
          h("div.mc-sh-name", {}, h("span.label", {}, "Template"), h("b", {}, t.name)),
          h("div.mc-sh-fmt", {}, h("span.label", {}, "Format"), h("div.mc-fchips", {}, ...t.formats.map((f) => h("button.mc-fchip", { type: "button", "aria-pressed": String(formats.includes(f)), title: FORMATS[f]?.name, on: { click: () => toggleFormat(f) } }, f))))),
        h("div.mc-sh-row.is-quiet", {},
          h("div.mc-sh-fmt", {}, h("span.label", {}, t.media === "video" ? "Videos each" : "Pictures each"),
            h("div.mc-stepper", {}, h("button", { type: "button", "aria-label": "One fewer", disabled: b.body.shoot.count <= 1, on: { click: () => setCount(b.body.shoot.count - 1) } }, "−"), h("span", {}, b.body.shoot.count), h("button", { type: "button", "aria-label": "One more", disabled: b.body.shoot.count >= 4, on: { click: () => setCount(b.body.shoot.count + 1) } }, "+"))),
          look ? h("div.mc-sh-fmt", {}, h("span.label", {}, "Look"), look) : null),
        h("div.mc-sh-prod", {},
          h("span.label", {}, "Product used"),
          h("div.mc-sh-prodrow", {},
            p ? h("span.mc-sh-prodpic", {}, h(`img${p.cutout ? ".is-clear" : ""}`, { src: p.cutout?.url ?? p.photo.url, alt: "", draggable: false })) : null,
            h("div.mc-sh-prodname", {}, h("b", {}, p?.name ?? "No product yet"), p ? h("em", {}, (p.features ?? []).slice(0, 2).join(" · ") || "Open Product to describe it") : h("em", {}, "Add one to shoot it")),
            h("div.mc-sh-prodkeys", {},
              ...(b.body.products.length > 1 ? b.body.products.map((x) => h(`button.mc-pp-thumb.is-small${x.id === p?.id ? ".is-on" : ""}`, { type: "button", title: x.name, "aria-label": x.name, "aria-pressed": String(x.id === p?.id), on: { click: () => pickProduct(x.id) } }, h(`img${x.cutout ? ".is-clear" : ""}`, { src: x.cutout?.url ?? x.photo.url, alt: "", draggable: false }))) : []),
              h("button.mc-pp-add.is-small", { type: "button", title: "Add a product photo, on any background", "aria-label": "Add a product", on: { click: addProducts } }, icon("plus"))))),
       ),
        h("div.mc-sh-go", {},
          guard(b, outs),
          h("button.mc-primary.is-wide", { type: "button", disabled: busy || !p, title: p ? `${formats.length * b.body.shoot.count} ${t.media === "video" ? "videos" : "pictures"} of ${p.name}` : "Add a product first", on: { click: () => shoot() } }, mcicon("spark"), busy ? "Shooting" : "Shoot it"),
          cost ? h("span.mc-cost", {}, `≈ ${cost} credits`) : null)));
  }

  const typingIn = (el) => el.contains(document.activeElement) && document.activeElement.matches("input, textarea");
  const part = (build, sig) => {
    const el = h("div.mc-wpart");
    return { el, update() { const b = macaron.brand; if (!b) return; if (typingIn(el)) return false; fill(el, build(b)); }, sig };
  };
  const sigOf = (fn) => () => JSON.stringify([rev, fn(macaron.brand?.body ?? {})]);
  return {
    product: part(productPane, sigOf((b) => [b.products, b.product, armedNow()])),
    pictures: part(pictures, sigOf((b) => [b.assets, macaron.assetKind, armedNow(), designNow()?.id])),
    make: part(picture, sigOf((b) => [b.assets, [...macaron.busy]])),
    shoot: part(shootPane, sigOf((b) => [b.outputs, b.products, b.product, b.shoot, macaron.template, macaron.media, macaron.category, [...macaron.busy], armedNow(), b.colours, b.logo])),
  };
}
