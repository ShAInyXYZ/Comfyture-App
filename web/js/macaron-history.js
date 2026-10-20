// References and design history: the brief the work answers to, the references collected for it, and a
// timeline of what was tried and decided, from the first concepts to the last export, each step with
// its picture, to step through.
import { h, icon, sprite } from "./dom.js";
import { toast } from "./store.js";
import { view } from "./viewer.js";
import { openPicker, pictureOf } from "./picker.js";
import { macaron, setBrief, addRef, setRef, removeRef, pickEntry, openDesign } from "./macaron.js";
import { card, key, chip, arming, isArmed, armedNow, longDate, shortDate } from "./macaron-ui.js";

const BRIEF = [
  ["goal", "Goal", "What this work is for"],
  ["audience", "Audience", "Who it is for"],
  ["message", "Message", "The one thing to say"],
  ["tone", "Tone", "How it should feel"],
  ["deliverables", "Deliverables", "What is made, in which formats"],
  ["constraints", "Constraints", "What must hold"],
  ["channels", "Channels", "Where it goes"],
];
const KIND = { concept: "Concept", reference: "Reference", identity: "Identity", product: "Product", mascot: "Mascot", app: "App", made: "Made with it", inspiration: "Inspiration", design: "Design", variant: "Variation", decision: "Decision", export: "Export", motion: "Motion", note: "Note" };

const grow = (t) => {
  t.style.height = "auto";
  t.style.height = `${t.scrollHeight}px`;
};

export function historySection() {
  const el = h("div.mc-bento.is-history");
  let strip = null;

  function briefCard(b) {
    const brief = b.body.brief;
    return card("is-brief", "Brief", [],
      ...BRIEF.map(([k, label, hint]) => h("label.mc-brief-row", {}, h("span.label", {}, label),
        h("textarea.field.mc-text", { rows: 2, value: brief[k] ?? "", placeholder: hint, "aria-label": label, on: { input: (e) => (grow(e.target), setBrief({ [k]: e.target.value.slice(0, 600) })) } }))));
  }

  function refsCard(b) {
    const refs = b.body.refs;
    const add = (e) => openPicker(e.currentTarget, { title: "A reference", characters: false, multiple: true, onPick: async (choice) => { try { await addRef(await pictureOf(choice)); } catch (err) { toast(err.message, { tone: "crit" }); } } });
    return card("is-refs", "References", [key(icon("plus"), "Add a reference picture", add)],
      refs.length ? h("div.mc-refs", {}, ...refs.map((r) =>
        h("figure.mc-ref", {},
          h("button.mc-ref-pic", { type: "button", title: "See it full size", on: { click: () => view(r.src) } }, h("img", { src: r.src, alt: "", loading: "lazy", draggable: false })),
          h("figcaption", {}, h("span.mc-kind", {}, KIND[r.kind] ?? r.kind),
            h("input.mc-ref-title", { value: r.title, "aria-label": "Title", on: { input: (e) => setRef(r.id, { title: e.target.value.slice(0, 80) }) } }),
            h("input.mc-ref-note", { value: r.note ?? "", placeholder: "Why it matters", "aria-label": "Note", on: { input: (e) => setRef(r.id, { note: e.target.value.slice(0, 200) }) } })),
          key(icon("trash"), isArmed(`ref:${r.id}`) ? "Click again to take it out" : "Take it out", () => arming(`ref:${r.id}`, update, () => removeRef(r.id)), { on: isArmed(`ref:${r.id}`), cls: "mc-ref-x" }))))
        : h("button.mc-drop", { type: "button", on: { click: add } }, icon("upload"), h("span", {}, "Add the pictures the work looks to")));
  }

  function timelineCard(b) {
    const list = [...b.body.history].sort((a, c) => String(a.at).localeCompare(String(c.at)));
    const open = list.find((x) => x.id === macaron.entry) ?? list.at(-1);
    const at = list.indexOf(open);
    const go = (i) => list[Math.max(0, Math.min(list.length - 1, i))] && pickEntry(list[Math.max(0, Math.min(list.length - 1, i))].id);
    const node = (x) => h(`button.mc-node${x === open ? ".is-on" : ""}`, { type: "button", dataset: { kind: x.kind, id: x.id }, title: x.title, "aria-pressed": String(x === open), on: { click: () => pickEntry(x.id) } },
      h("span.mc-node-pic", {}, x.src ? h("img", { src: x.src, alt: "", loading: "lazy", draggable: false }) : h("span.mc-node-glyph", {}, sprite(x.kind === "export" ? "export" : x.kind === "variant" ? "variations" : x.kind === "decision" ? "keyframe" : "image-history"))),
      h("span.mc-node-text", {}, h("em", {}, `${shortDate(x.at)} · ${KIND[x.kind] ?? x.kind}`), h("b", {}, x.title)));
    strip = h("div.mc-strip", { tabindex: 0, role: "listbox", "aria-label": "The timeline", on: { keydown: (e) => (e.key === "ArrowRight" ? (e.preventDefault(), go(at + 1)) : e.key === "ArrowLeft" ? (e.preventDefault(), go(at - 1)) : null) } }, ...list.map(node));
    // the open step is brought to the middle of the strip, sideways only: the page must not move
    queueMicrotask(() => {
      const on = strip.querySelector(".is-on");
      if (on) strip.scrollLeft = on.offsetLeft - (strip.clientWidth - on.offsetWidth) / 2;
    });
    return card("is-timeline", "Timeline", [chip(`${list.length} steps`),
      key(icon("step"), "Back a step", () => go(at - 1), { disabled: at <= 0, cls: "is-flip" }), key(icon("step"), "On a step", () => go(at + 1), { disabled: at >= list.length - 1 }), key(icon("next"), "To the latest", () => go(list.length - 1), { disabled: at >= list.length - 1 })],
      list.length ? strip : h("p.mc-hint", {}, "What is tried and decided will be listed here, step by step."),
      open ? h("div.mc-detail", {},
        open.src ? h("button.mc-detail-pic", { type: "button", title: "See it full size", on: { click: () => view(open.src) } }, h("img", { src: open.src, alt: "", draggable: false })) : null,
        h("div.mc-detail-text", {},
          h("span.mc-detail-meta", {}, chip(KIND[open.kind] ?? open.kind), chip(longDate(open.at)), open.who ? chip(open.who === "brioche" ? "Brioche" : open.who) : null),
          h("h3", {}, open.title),
          open.note ? h("p", {}, open.note) : null,
          open.designId && b.body.designs.some((d) => d.id === open.designId) ? h("button.key.is-accent", { type: "button", on: { click: () => (openDesign(open.designId), document.getElementById("mc-studio")?.scrollIntoView({ behavior: "smooth" })) } }, sprite("scene-render"), "Open the design") : null)) : null);
  }

  function update() {
    const b = macaron.brand;
    if (!b) return;
    const typing = el.contains(document.activeElement) && document.activeElement.matches("input, textarea");
    if (typing) return false;
    el.replaceChildren(briefCard(b), refsCard(b), timelineCard(b));
    for (const t of el.querySelectorAll("textarea.mc-text")) grow(t);
  }
  const sig = () => JSON.stringify([macaron.brand?.body.brief, macaron.brand?.body.refs, macaron.brand?.body.history, macaron.entry, armedNow(), macaron.brand?.body.designs.map((d) => d.id)]);
  return { el, update, sig };
}
