// Macaron's screen: one scrollable dashboard for a brand's content, in bento sections in the order the
// work goes: its kit, what it was made from and how it got here, its pictures, the designs themselves, their
// variations, their motion, and the content list with its exports. Brioche's bar docks at the foot.
import { h, icon, sprite } from "../dom.js";
import { changed } from "../store.js";
import { currentPage } from "../router.js";
import { dropdown } from "../controls.js";
import { macaron, loadBrands, openBrand, newBrand, exampleBrand, removeBrand, rename, addAsset, undo, redo } from "../macaron.js";
import { mcicon, arming, isArmed } from "../macaron-ui.js";
import { kitSection } from "../macaron-kit.js";
import { historySection } from "../macaron-history.js";
import { assetsSection } from "../macaron-assets.js";
import { studioSection } from "../macaron-studio.js";
import { variationsSection } from "../macaron-variations.js";
import { motionSection } from "../macaron-motion.js";
import { contentSection } from "../macaron-content.js";

const SECTIONS = [
  ["mc-kit", "01", "Brand kit", "Logos, palette, type, voice and the rules designs are checked against.", "kit", kitSection],
  ["mc-history", "02", "References and history", "The brief, what the work looks to, and every step from the first concept to the last export.", "history", historySection],
  ["mc-assets", "03", "Products and assets", "The app's screens, product shots, renders and work made through Comfyture.", "assets", assetsSection],
  ["mc-studio", "04", "Designs", "Layers on a ground, laid out for every format. What is edited here is what is exported.", "studio", studioSection],
  ["mc-variations", "05", "Variations", "Saved alternatives of a design, side by side: copy, composition, colour, goal, format.", "variants", variationsSection],
  ["mc-motion", "06", "Motion graphics", "A design that moves, drawn frame by frame from the same layers and encoded as video.", "motion", motionSection],
  ["mc-content", "07", "Content and export", "Every design by purpose, format and status, and what has left as a picture or a video.", "content", contentSection],
];

let shell = null;

function build(el) {
  const sections = SECTIONS.map(([id, num, title, blurb, glyph, make]) => {
    const part = make();
    return { id, glyph, title, part, el: h(`section.mc-sec#${id}`, {}, h("header.mc-sec-head", {}, h("span.mc-no", {}, num), h("div", {}, h("h2", {}, title), h("p", {}, blurb))), part.el) };
  });
  const bar = h("header.mc-bar");
  const chat = h("div.mc-chat", { id: "macaron-chat" });
  const root = h("div.macaron", {}, bar, ...sections.map((s) => s.el), chat);
  el.replaceChildren(root);
  // the chip of the section on screen is lit
  const seen = new Map();
  const spy = new IntersectionObserver((entries) => {
    for (const e of entries) seen.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0);
    const top = [...seen.entries()].sort((a, b) => b[1] - a[1])[0];
    for (const c of bar.querySelectorAll(".mc-nav button")) c.setAttribute("aria-current", String(top && top[1] > 0 && c.dataset.to === top[0]));
  }, { threshold: [0, 0.15, 0.4, 0.7] });
  for (const s of sections) spy.observe(s.el);
  shell = { el, root, bar, sections, chat };
  document.dispatchEvent(new Event("macaron:drawn"));
}

function drawBar(b) {
  const designs = b.body.designs.filter((d) => !d.variant);
  const nav = h("nav.mc-nav", { "aria-label": "Sections" }, ...shell.sections.map((s) => h("button", { type: "button", dataset: { to: s.id }, title: s.title, on: { click: () => s.el.scrollIntoView({ behavior: "smooth", block: "start" }) } }, mcicon(s.glyph), h("span", {}, s.title.split(" ")[0]))));
  shell.bar.replaceChildren(
    h("div.mc-bar-brand", {},
      dropdown({ label: "Brand", value: b.id, items: [...macaron.list.map((x) => ({ value: x.id, label: x.name })), { value: "__new", label: "New brand", glyph: () => icon("plus") }], onChange: (id) => (id === "__new" ? newBrand() : openBrand(id)), width: "fit" }),
      h("input.mc-name", { value: b.name, "aria-label": "The brand's name", dataset: { focus: `name:${b.id}` }, on: { input: (e) => rename(e.target.value) } }),
      h(`button.key.is-icon.is-quiet${isArmed(`brand:${b.id}`) ? ".is-armed" : ""}`, { type: "button", title: isArmed(`brand:${b.id}`) ? "Click again to delete the brand" : "Delete this brand", on: { click: () => arming(`brand:${b.id}`, () => changed("macaron"), () => removeBrand(b.id)) } }, icon("trash"))),
    h("div.mc-bar-stats", {}, h("span", {}, h("b", {}, String(designs.length)), designs.length === 1 ? " design" : " designs"), h("span", {}, h("b", {}, String(designs.filter((d) => d.status === "approved").length)), " approved"), h("span", {}, h("b", {}, String(b.body.motion.length)), " motion"), h("span", {}, h("b", {}, String(b.body.exports.length)), " exports")),
    nav,
    h("div.mc-bar-tools", {}, h("button.key.is-icon.is-quiet", { type: "button", title: "Undo (Ctrl Z)", "aria-label": "Undo", disabled: !macaron.past.length, on: { click: () => undo() } }, sprite("edit-undo")), h("button.key.is-icon.is-quiet", { type: "button", title: "Redo", "aria-label": "Redo", disabled: !macaron.future.length, on: { click: () => redo() } }, sprite("edit-redo"))));
}

function welcome() {
  return h("div.mc-welcome", {},
    h("img.star", { src: "brand/cast/brioche.png", alt: "", draggable: false }),
    h("h1", {}, "Macaron"),
    h("p", {}, "A brand's content: its kit, its pictures, designs for every format, their variations and motion, ready to export."),
    h("div.mc-welcome-keys", {},
      h("button.mc-go", { type: "button", disabled: macaron.busy.has("example"), on: { click: () => exampleBrand() } }, h("span", {}, macaron.busy.has("example") ? "Setting it up" : "Start with the example")),
      h("button.key", { type: "button", on: { click: () => newBrand() } }, icon("plus"), "A brand of my own")));
}

export function renderMacaron(el) {
  loadBrands();
  const b = macaron.brand;
  if (!b) {
    shell = null;
    el.replaceChildren(macaron.ready && macaron.list.length === 0 ? welcome() : h("div.mc-welcome", {}, h("span.lamp", { dataset: { tone: "busy" } })));
    return;
  }
  const active = document.activeElement;
  const focus = el.contains(active) ? active.dataset.focus : null;
  const sel = focus ? [active.selectionStart, active.selectionEnd] : null;
  if (!shell || shell.el !== el || !el.contains(shell.root)) build(el);
  drawBar(b);
  for (const s of shell.sections) {
    try {
      // a section is drawn again only when what it shows has changed
      const sig = s.part.sig?.();
      if (sig !== undefined && sig === s.sig) continue;
      s.sig = sig;
      // a section that held back (a field in it has the focus) is drawn at the next change
      if (s.part.update() === false) s.sig = undefined;
    } catch (e) {
      console.warn(`macaron ${s.id}:`, e);
    }
  }
  if (focus) {
    const back = el.querySelector(`[data-focus="${CSS.escape(focus)}"]`);
    back?.focus({ preventScroll: true });
    if (back && sel && back.setSelectionRange) try { back.setSelectionRange(...sel); } catch {}
  }
}

// a picture dropped on Macaron, or pasted, joins the project's pictures
document.addEventListener("dragover", (e) => currentPage() === "macaron" && e.dataTransfer?.types?.includes("Files") && e.preventDefault());
document.addEventListener("drop", (e) => {
  if (currentPage() !== "macaron" || !e.dataTransfer?.files?.length || e.target.closest?.("#assistant")) return;
  e.preventDefault();
  for (const f of e.dataTransfer.files) if (f.type.startsWith("image/")) addAsset(f);
});
document.addEventListener("paste", (e) => {
  if (currentPage() !== "macaron" || e.target.closest?.("input, textarea")) return;
  const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
  if (!files.length) return;
  e.preventDefault();
  files.forEach((f) => addAsset(f));
});
