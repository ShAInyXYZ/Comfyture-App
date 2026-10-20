// The Design idea workspace: where a brand's work starts. The brief (the idea in two lines and what it should feel
// like), a moodboard of what it looks to, the story of how the design came about, and the directions tried for
// its mark, one of them picked. Each bento opens in its window.
import { h, icon, sprite } from "./dom.js";
import { toast } from "./store.js";
import { view } from "./viewer.js";
import { openPicker, pictureOf } from "./picker.js";
import {
  macaron, setBrief, addRef, setRef, removeRef, pickEntry, openDesign, addDirection, setDirection, pickDirection, removeDirection, addNote,
} from "./macaron.js";
import { bento, mcicon, key, chip, arming, isArmed, armedNow, longDate, fill, shortDate } from "./macaron-ui.js";
import { defineWindow, openWin } from "./macaron-win.js";

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
const GOAL_ICON = ["heart", "spark", "smile"];
const pickRef = (e, add) => openPicker(e.currentTarget, { title: "A reference", characters: false, multiple: true, onPick: async (choice) => { try { await add(await pictureOf(choice)); } catch (err) { toast(err.message, { tone: "crit" }); } } });
/** The picker for the moodboard: pictures from the Library or the computer join the references (a tool of Brioche's panel uses it). */
export const pickReferences = (e) => pickRef(e, addRef);
const grow = (t) => {
  t.style.height = "auto";
  t.style.height = `${t.scrollHeight}px`;
};
const typingIn = (el) => el.contains(document.activeElement) && document.activeElement.matches("input, textarea");

/** The references a moodboard shows: what the work looks to (the concept boards are the directions'). */
const moodOf = (b) => b.body.refs.filter((r) => r.kind !== "concept");
/** The steps of the story worth a card: what was decided, made or tried (not each export). */
const storyOf = (b) => [...b.body.history].filter((x) => x.kind !== "export").sort((a, c) => String(a.at).localeCompare(String(c.at)));

// ---------------------------------------------------------------- the workspace

export function ideaSpace() {
  const el = h("div.mc-grid.is-idea");

  function brief(b) {
    const br = b.body.brief;
    const goals = (br.goals ?? []).slice(0, 3);
    return bento("is-brief", "The brief", () => openWin("brief"),
      br.pitch || br.goal ? h("p.mc-pitch", {}, br.pitch || br.goal) : h("p.mc-pitch.is-empty", {}, "The idea in two lines: what this brand is for."),
      goals.length ? h("div.mc-chips.is-goals", {}, ...goals.map((g, i) => h("span.mc-chip", {}, mcicon(GOAL_ICON[i % 3]), g))) : null,
      br.image ? h("div.mc-brief-pic", {}, h("img", { src: br.image, alt: "", draggable: false })) : null);
  }

  function mood(b) {
    const refs = moodOf(b).slice(0, 6);
    return bento("is-mood", "Moodboard", () => openWin("mood"),
      refs.length ? h("div.mc-mosaic", { dataset: { n: String(refs.length) } }, ...refs.map((r, i) => h("button.mc-mtile", { type: "button", title: `${r.title}${r.note ? `\n${r.note}` : ""}`, "aria-label": r.title, dataset: { i: String(i) }, on: { click: (e) => (e.stopPropagation(), view(r.src)) } }, h("img", { src: r.src, alt: "", draggable: false, loading: "lazy" }), h("span.mc-mzoom", {}, mcicon("expand")))))
        : h("button.mc-empty-tile", { type: "button", on: { click: (e) => (e.stopPropagation(), pickRef(e, addRef)) } }, icon("plus"), h("span", {}, "Add the pictures the work looks to")));
  }

  function story(b) {
    // the chapters a story names for itself, else what was decided and made with a picture to it (the latest four)
    const all = storyOf(b);
    const beats = all.filter((x) => x.beat);
    const steps = (beats.length >= 2 ? beats : all.filter((x) => x.src && ["concept", "decision", "note", "reference", "identity"].includes(x.kind))).slice(-4);
    return bento("is-story", "The story", () => openWin("story"),
      steps.length ? h("div.mc-steps", {}, ...steps.map((x, i) => h("button.mc-step", { type: "button", title: x.title, on: { click: (e) => (e.stopPropagation(), pickEntry(x.id), openWin("story")) } },
        h("span.mc-step-pic", {}, h("img", { src: x.src, alt: "", draggable: false, loading: "lazy" }), i < steps.length - 1 ? h("i.mc-step-dot") : null),
        h("em", {}, shortDate(x.at).toUpperCase()), h("b", {}, x.beat ?? x.title), x.note ? h("span", {}, x.note) : null)))
        : h("p.mc-hint", {}, "What is tried and decided will be listed here, step by step."));
  }

  function directions(b) {
    const list = b.body.directions ?? [];
    const kit = b.body.kit;
    return bento("is-dirs", "Directions", () => openWin("directions"),
      list.length ? h("div.mc-dirs", {}, ...list.slice(0, 3).map((d) => {
        const logo = kit.logos.find((l) => l.id === d.logo);
        return h(`button.mc-dir${d.picked ? ".is-picked" : ""}`, { type: "button", title: d.picked ? "The direction picked" : "Pick this direction", on: { click: (e) => (e.stopPropagation(), pickDirection(d.id)) } },
          h("span.mc-dir-pic", { style: d.bg ? { backgroundImage: `url("${d.bg}")` } : {} }, logo ? h("img", { src: logo.url, alt: "", draggable: false }) : null, d.picked ? h("i.mc-tick", {}, icon("check")) : null),
          h("b", {}, d.name), h("span", {}, d.note));
      })) : h("p.mc-hint", {}, "Directions for the mark and the look: ask Brioche for a new one."));
  }

  function update() {
    const b = macaron.brand;
    if (!b) return;
    fill(el, brief(b), mood(b), story(b), directions(b));
  }
  const sig = () => {
    const b = macaron.brand?.body;
    return JSON.stringify([b?.brief, b?.refs, b?.history, b?.directions, b?.kit?.logos]);
  };
  return { el, update, sig };
}

// ---------------------------------------------------------------- the windows

function briefWin() {
  const el = h("div.mc-w.is-brief");
  function update() {
    const b = macaron.brand;
    if (!b || typingIn(el)) return typingIn(el) ? false : undefined;
    const br = b.body.brief;
    const goals = [...(br.goals ?? [])];
    while (goals.length < 3) goals.push("");
    fill(el,
      h("div.mc-bf", {}, h("span.label", {}, "The idea in two lines"),
        h("textarea.field.mc-text.mc-bf-pitch", { rows: 3, value: br.pitch ?? "", placeholder: "A warm, playful home for making films. …", "aria-label": "The idea", on: { input: (e) => (grow(e.target), setBrief({ pitch: e.target.value.slice(0, 280) })) } })),
      h("div.mc-bf", {}, h("span.label", {}, "How it should feel"),
        h("div.mc-goals", {}, ...goals.slice(0, 3).map((g, i) => h("label.mc-goal", {}, mcicon(GOAL_ICON[i]), h("input", { value: g, placeholder: ["Feel…", "Make it…", "Stay…"][i], "aria-label": `Goal ${i + 1}`, on: { input: (e) => { const next = [...(b.body.brief.goals ?? [])]; next[i] = e.target.value.slice(0, 32); setBrief({ goals: next.map((x) => x ?? "").slice(0, 3) }); } } }))))),
      h("div.mc-bf-grid", {}, ...BRIEF.map(([k, label, hint]) => h("label.mc-brief-row", {}, h("span.label", {}, label),
        h("textarea.field.mc-text", { rows: 2, value: br[k] ?? "", placeholder: hint, "aria-label": label, on: { input: (e) => (grow(e.target), setBrief({ [k]: e.target.value.slice(0, 600) })) } })))),
      h("div.mc-bf", {}, h("span.label", {}, "Its picture"),
        h("div.mc-pic-row", {}, br.image ? h("img.mc-pic-thumb.is-big", { src: br.image, alt: "" }) : null,
          h("button.key.is-sm", { type: "button", on: { click: (e) => pickRef(e, async (p) => setBrief({ image: p.url })) } }, icon("image"), br.image ? "Replace" : "Add"),
          br.image ? h("button.key.is-sm.is-quiet", { type: "button", on: { click: () => setBrief({ image: "" }) } }, icon("close"), "Remove") : null)));
    for (const t of el.querySelectorAll("textarea.mc-text")) grow(t);
  }
  const sig = () => JSON.stringify([macaron.brand?.body.brief]);
  return { el, update, sig };
}
defineWindow("brief", { title: "The brief", sub: () => macaron.brand?.name ?? "", size: "m", advanced: false, make: briefWin });

function moodWin() {
  const el = h("div.mc-w.is-mood");
  const rerender = () => update();
  function update() {
    const b = macaron.brand;
    if (!b || typingIn(el)) return typingIn(el) ? false : undefined;
    const refs = b.body.refs;
    const add = (e) => pickRef(e, addRef);
    fill(el,
      h("div.mc-mood-top", {}, h("span.label", {}, `${refs.length} pictures`), key(icon("plus"), "Add a reference picture", add)),
      refs.length ? h("div.mc-refs", {}, ...refs.map((r) =>
        h("figure.mc-ref", {},
          h("button.mc-ref-pic", { type: "button", title: "See it full size", on: { click: () => view(r.src) } }, h("img", { src: r.src, alt: "", loading: "lazy", draggable: false })),
          h("figcaption", {}, h("span.mc-kind", {}, KIND[r.kind] ?? r.kind),
            h("input.mc-ref-title", { value: r.title, "aria-label": "Title", on: { input: (e) => setRef(r.id, { title: e.target.value.slice(0, 80) }) } }),
            h("input.mc-ref-note", { value: r.note ?? "", placeholder: "Why it matters", "aria-label": "Note", on: { input: (e) => setRef(r.id, { note: e.target.value.slice(0, 200) }) } })),
          key(icon("trash"), isArmed(`ref:${r.id}`) ? "Click again to take it out" : "Take it out", () => arming(`ref:${r.id}`, rerender, () => removeRef(r.id)), { on: isArmed(`ref:${r.id}`), cls: "mc-ref-x" }))))
        : h("button.mc-drop", { type: "button", on: { click: add } }, icon("upload"), h("span", {}, "Add the pictures the work looks to")));
  }
  const sig = () => JSON.stringify([macaron.brand?.body.refs, armedNow()]);
  return { el, update, sig };
}
defineWindow("mood", { title: "Moodboard", sub: () => macaron.brand?.name ?? "", size: "l", advanced: false, make: moodWin });

function storyWin() {
  const strip = h("div.mc-strip", { tabindex: 0, role: "listbox", "aria-label": "The story" });
  const detail = h("div.mc-detail");
  const el = h("div.mc-w.is-story", {}, strip, detail);
  function update() {
    const b = macaron.brand;
    if (!b || typingIn(el)) return typingIn(el) ? false : undefined;
    const list = [...b.body.history].sort((a, c) => String(a.at).localeCompare(String(c.at)));
    const open = list.find((x) => x.id === macaron.entry) ?? list.at(-1);
    const at = list.indexOf(open);
    const go = (i) => list[Math.max(0, Math.min(list.length - 1, i))] && pickEntry(list[Math.max(0, Math.min(list.length - 1, i))].id);
    strip.onkeydown = (e) => (e.key === "ArrowRight" ? (e.preventDefault(), go(at + 1)) : e.key === "ArrowLeft" ? (e.preventDefault(), go(at - 1)) : null);
    fill(strip, ...list.map((x) => h(`button.mc-node${x === open ? ".is-on" : ""}`, { type: "button", dataset: { kind: x.kind, id: x.id }, title: x.title, "aria-pressed": String(x === open), on: { click: () => pickEntry(x.id) } },
      h("span.mc-node-pic", {}, x.src ? h("img", { src: x.src, alt: "", loading: "lazy", draggable: false }) : h("span.mc-node-glyph", {}, sprite(x.kind === "export" ? "export" : x.kind === "variant" ? "variations" : x.kind === "decision" ? "keyframe" : "image-history"))),
      h("span.mc-node-text", {}, h("em", {}, `${shortDate(x.at)} · ${KIND[x.kind] ?? x.kind}`), h("b", {}, x.title)))));
    queueMicrotask(() => {
      const on = strip.querySelector(".is-on");
      if (on) strip.scrollLeft = on.offsetLeft - (strip.clientWidth - on.offsetWidth) / 2;
    });
    fill(detail, open ? [
      open.src ? h("button.mc-detail-pic", { type: "button", title: "See it full size", on: { click: () => view(open.src) } }, h("img", { src: open.src, alt: "", draggable: false })) : null,
      h("div.mc-detail-text", {},
        h("span.mc-detail-meta", {}, chip(KIND[open.kind] ?? open.kind), chip(longDate(open.at)), open.who ? chip(open.who === "brioche" ? "Brioche" : open.who) : null),
        h("h3", {}, open.title),
        open.note ? h("p", {}, open.note) : null,
        open.designId && b.body.designs.some((d) => d.id === open.designId) ? h("button.key.is-accent", { type: "button", on: { click: () => (openDesign(open.designId), openWin("editor")) } }, sprite("scene-render"), "Open the design") : null),
    ] : h("p.mc-hint", {}, "What is tried and decided will be listed here, step by step."));
  }
  // a note of one's own joins the story
  const note = h("div.mc-story-add", {}, h("input.field", { placeholder: "A note for the story: what was tried, what was decided", "aria-label": "A note", on: { keydown: (e) => { if (e.key === "Enter" && e.target.value.trim()) (addNote(e.target.value.trim().slice(0, 140)), (e.target.value = "")); } } }), h("span.mc-hint", {}, "Enter adds it."));
  el.append(note);
  const sig = () => JSON.stringify([macaron.brand?.body.history, macaron.entry]);
  return { el, update, sig };
}
defineWindow("story", { title: "The story", sub: () => macaron.brand?.name ?? "", size: "xl", advanced: false, make: storyWin });

function directionsWin() {
  const el = h("div.mc-w.is-dirs");
  const rerender = () => update();
  function update() {
    const b = macaron.brand;
    if (!b || typingIn(el)) return typingIn(el) ? false : undefined;
    const list = b.body.directions ?? [];
    const kit = b.body.kit;
    fill(el,
      h("div.mc-dgrid", {}, ...list.map((d) => {
        const armedKey = `dir:${d.id}`;
        return h(`article.mc-dcard${d.picked ? ".is-picked" : ""}`, {},
          h("button.mc-dir-pic.is-big", { type: "button", title: "Pick this direction", style: d.bg ? { backgroundImage: `url("${d.bg}")` } : {}, on: { click: () => pickDirection(d.id) } }, (kit.logos.find((l) => l.id === d.logo)) ? h("img", { src: kit.logos.find((l) => l.id === d.logo).url, alt: "", draggable: false }) : null, d.picked ? h("i.mc-tick", {}, icon("check")) : null),
          h("input.field.mc-dname", { value: d.name, "aria-label": "The direction's name", on: { input: (e) => setDirection(d.id, { name: e.target.value.slice(0, 40) }) } }),
          h("textarea.field.mc-text.mc-dnote", { rows: 2, value: d.note ?? "", "aria-label": "What it is", placeholder: "What it feels like", on: { input: (e) => setDirection(d.id, { note: e.target.value.slice(0, 140) }) } }),
          h("div.mc-dkeys", {},
            h("select.field.mc-dlogo", { "aria-label": "The logo file on it", on: { change: (e) => setDirection(d.id, { logo: e.target.value }) } }, ...kit.logos.filter((l) => l.kind === "wordmark").map((l) => h("option", { value: l.id, selected: l.id === d.logo }, l.name))),
            h("button.key.is-sm", { type: "button", title: "Use a picture for it", on: { click: (e) => pickRef(e, async (p) => setDirection(d.id, { bg: p.url })) } }, icon("image")),
            key(icon("trash"), isArmed(armedKey) ? "Click again to take it out" : "Take it out", () => arming(armedKey, rerender, () => removeDirection(d.id)), { on: isArmed(armedKey) })));
      }), h("button.mc-dcard.is-add", { type: "button", on: { click: () => addDirection({ name: "A new direction", note: "" }) } }, icon("plus"), h("span", {}, "A direction"))),
      h("p.mc-hint", {}, "A direction is a way the mark and the look could go. Pick one: the others stay here."));
  }
  const sig = () => JSON.stringify([macaron.brand?.body.directions, macaron.brand?.body.kit.logos, armedNow()]);
  return { el, update, sig };
}
defineWindow("directions", { title: "Directions", sub: () => macaron.brand?.name ?? "", size: "l", advanced: false, make: directionsWin });
