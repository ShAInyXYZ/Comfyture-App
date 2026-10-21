// The Design idea workspace: where a brand's work starts. The brief (the idea in two lines and what it should feel
// like), a moodboard of what it looks to, the story of how the design came about, and the directions tried for
// its mark, one of them picked. Each bento opens in its window.
import { h, icon, sprite } from "./dom.js";
import { toast, changed } from "./store.js";
import { view } from "./viewer.js";
import { openPicker, pictureOf } from "./picker.js";
import {
  macaron, setBrief, addRef, setRef, removeRef, pickEntry, openDesign, addDirection, setDirection, pickDirection, removeDirection, addNote,
} from "./macaron.js";
import { bento, mcicon, key, chip, arming, isArmed, armedNow, longDate, fill, shortDate } from "./macaron-ui.js";
import { defineWindow, openWin, closeWin } from "./macaron-win.js";
import { draftKey } from "./macaron-tools.js";
import { armPreset } from "./macaron-assist.js";
import { BRIOCHE } from "./macaron-harness.js";
import { tell } from "./harnesses.js";

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
// Each window is laid out for its job (docs/brand/products/macaron-v3): the brief a calm column with the idea as one big
// statement, the moodboard a gallery with the picked picture beside it, the story a timeline, the directions a row of
// big cards to compare. Their looks are in css/macaron-win-idea.css.

/** An icon of the brief's rows, drawn in the app's icon style. */
const ROW_ICON = {
  goal: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  audience: '<circle cx="9" cy="8.5" r="3"/><path d="M3.5 19c.5-3.2 2.8-5 5.5-5s5 1.8 5.5 5"/><circle cx="17" cy="9.5" r="2.3"/><path d="M16.5 14.2c2.3.1 3.7 1.6 4 4.3"/>',
  message: '<path d="M5 5.5h14A1.5 1.5 0 0 1 20.5 7v8a1.5 1.5 0 0 1-1.5 1.5h-8L6.5 19.5v-3H5A1.5 1.5 0 0 1 3.5 15V7A1.5 1.5 0 0 1 5 5.5z"/>',
  tone: '<path d="M4 12h.01M8 8v8M12 4v16M16 8v8M20 12h.01"/>',
  deliverables: '<path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10A.5.5 0 0 1 7 20z"/><path d="M14 3.5V8h4M9.5 12.5h5M9.5 16h5"/>',
  constraints: '<circle cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/>',
  channels: '<circle cx="6.5" cy="12" r="2.3"/><circle cx="17.5" cy="6" r="2.3"/><circle cx="17.5" cy="18" r="2.3"/><path d="M8.6 10.9l6.8-3.8M8.6 13.1l6.8 3.8"/>',
};
const rowIcon = (k) => {
  const span = document.createElement("span");
  span.className = "mc-row-icon";
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ROW_ICON[k] ?? ""}</svg>`;
  return span;
};
const ASK_BRIEF = "Write the brief: the idea in two lines, three goals, and what is still empty.";
const ASK_DIRECTION = "Give me a new direction for the mark and the look.";

function briefWin() {
  let editing = null;
  const meter = h("div.mc-meter");
  const el = h("div.mc-w.is-brief");
  function drawMeter(br) {
    const done = BRIEF.filter(([k]) => (br[k] ?? "").trim()).length;
    fill(meter, h("span", {}, `${done} of ${BRIEF.length} filled`), h("span.mc-meter-bar", { role: "img", "aria-label": `${done} of ${BRIEF.length} filled` }, ...BRIEF.map((_, i) => h(`i${i < done ? ".is-on" : ""}`))));
  }
  function update() {
    const b = macaron.brand;
    if (!b) return;
    const br = b.body.brief;
    drawMeter(br);
    if (typingIn(el)) return false;
    const goals = [...(br.goals ?? [])];
    while (goals.length < 3) goals.push("");
    const row = ([k, label, hint]) => {
      const value = br[k] ?? "";
      const open = editing === k || value.trim();
      return h("div.mc-brow", { dataset: { k } },
        rowIcon(k),
        h("div.mc-brow-body", {}, h("span.label", {}, label),
          open
            ? h("textarea.field.mc-text.mc-brow-field", { rows: 1, value, placeholder: hint, "aria-label": label, dataset: { k },
              on: { input: (e) => (grow(e.target), setBrief({ [k]: e.target.value.slice(0, 600) })), blur: (e) => !e.target.value.trim() && editing === k && ((editing = null), setTimeout(update, 0)) } })
            : h("button.mc-add-prompt", { type: "button", on: { click: () => ((editing = k), update(), el.querySelector(`textarea[data-k="${k}"]`)?.focus()) } }, icon("plus"), `Add the ${label.toLowerCase()}`)));
    };
    fill(el,
      h("div.mc-brief-top", {},
        h("div.mc-brief-idea", {},
          h("span.label", {}, "The idea in two lines"),
          h("textarea.field.mc-text.mc-statement", { rows: 3, value: br.pitch ?? "", placeholder: "A warm, playful home for making films. …", "aria-label": "The idea", on: { input: (e) => (grow(e.target), setBrief({ pitch: e.target.value.slice(0, 280) })) } }),
          h("div.mc-goals", {}, ...goals.slice(0, 3).map((g, i) => h("label.mc-goal", {}, mcicon(GOAL_ICON[i]), h("input", { value: g, placeholder: ["Feel…", "Make it…", "Stay…"][i], "aria-label": `Goal ${i + 1}`, on: { input: (e) => { const next = [...(b.body.brief.goals ?? [])]; while (next.length < 3) next.push(""); next[i] = e.target.value.slice(0, 32); setBrief({ goals: next.map((x) => x ?? "").slice(0, 3) }); } } }))))),
        h("div.mc-brief-well", { dataset: { empty: br.image ? "" : "1" } },
          br.image
            ? [h("img", { src: br.image, alt: "", draggable: false }),
              h("div.mc-well-keys", {},
                h("button.mc-iconkey.is-over", { type: "button", title: "Replace the picture", "aria-label": "Replace the picture", on: { click: (e) => pickRef(e, async (p) => setBrief({ image: p.url })) } }, icon("upload")),
                h("button.mc-iconkey.is-over.is-danger", { type: "button", title: "Take the picture off", "aria-label": "Remove the picture", on: { click: () => setBrief({ image: "" }) } }, icon("trash")))]
            : h("button.mc-add-prompt.is-well", { type: "button", on: { click: (e) => pickRef(e, async (p) => setBrief({ image: p.url })) } }, icon("image"), "Add its picture"))),
      h("div.mc-brief-rows", {}, ...BRIEF.map(row)));
    for (const t of el.querySelectorAll("textarea.mc-text")) grow(t);
  }
  const sig = () => JSON.stringify([macaron.brand?.body.brief, editing]);
  return { el, update, sig, meter };
}
defineWindow("brief", {
  eyebrow: "Design idea", title: "The brief", sub: () => macaron.brand?.name ?? "", size: "m", advanced: false, make: briefWin,
  tools: (part) => [part.meter],
  foot: () => [draftKey("Brioche can draft the rest", "She fills in what is missing, or refines what is there.", ASK_BRIEF, "brief"), h("span.spacer"), h("button.mc-primary", { type: "button", on: { click: closeWin } }, "Done", icon("arrow"))],
});

const MOOD_KINDS = ["inspiration", "identity", "concept", "product", "mascot", "app"];
function moodWin() {
  let sel = null;
  let filter = "all";
  const el = h("div.mc-w.is-mood");
  const rerender = () => update();
  function update() {
    const b = macaron.brand;
    if (!b || typingIn(el)) return typingIn(el) ? false : undefined;
    const refs = b.body.refs;
    const add = (e) => pickRef(e, addRef);
    const kinds = [...new Set(refs.map((r) => r.kind))];
    if (filter !== "all" && !kinds.includes(filter)) filter = "all";
    const shown = filter === "all" ? refs : refs.filter((r) => r.kind === filter);
    const cur = shown.find((r) => r.id === sel) ?? shown[0] ?? null;
    sel = cur?.id ?? null;
    const armedKey = cur ? `ref:${cur.id}` : "";
    const kindOptions = [...new Set([...MOOD_KINDS, cur?.kind].filter(Boolean))];
    fill(el,
      h("div.mc-mood-bar", {},
        h("span.mc-mood-count", {}, h("b", {}, String(refs.length)), refs.length === 1 ? " picture" : " pictures"),
        refs.length ? h("div.mc-fchips", { role: "group", "aria-label": "Show" },
          h("button.mc-fchip", { type: "button", "aria-pressed": String(filter === "all"), on: { click: () => ((filter = "all"), rerender()) } }, "All"),
          ...kinds.map((k) => h("button.mc-fchip", { type: "button", "aria-pressed": String(filter === k), on: { click: () => ((filter = k), rerender()) } }, KIND[k] ?? k))) : null,
        h("span.spacer"),
        h("button.mc-primary", { type: "button", on: { click: add } }, icon("upload"), "Add pictures")),
      refs.length
        ? h("div.mc-mood-main", {},
          h("div.mc-mood-gallery", {}, ...shown.map((r) =>
            h(`button.mc-mt${r.id === sel ? ".is-on" : ""}`, { type: "button", title: r.title, "aria-pressed": String(r.id === sel), on: { click: () => ((sel = r.id), rerender()) } },
              h("img", { src: r.src, alt: "", loading: "lazy", draggable: false }),
              h("span.mc-mt-cap", {}, h("em", {}, KIND[r.kind] ?? r.kind), h("b", {}, r.title)))),
          h("button.mc-mt-add", { type: "button", on: { click: add } }, icon("plus"), h("span", {}, "Drop pictures here"))),
          cur ? h("aside.mc-mood-panel", {},
            h("button.mc-mood-big", { type: "button", title: "See it full size", on: { click: () => view(cur.src) } }, h("img", { src: cur.src, alt: "", draggable: false })),
            h("label.mc-pf", {}, h("span.label", {}, "Title"), h("input.field.mc-text", { value: cur.title, "aria-label": "Title", on: { input: (e) => setRef(cur.id, { title: e.target.value.slice(0, 80) }) } })),
            h("label.mc-pf", {}, h("span.label", {}, "Kind"), h("select.field.mc-kindsel", { "aria-label": "Kind", on: { change: (e) => (setRef(cur.id, { kind: e.target.value }), rerender()) } }, ...kindOptions.map((k) => h("option", { value: k, selected: k === cur.kind }, KIND[k] ?? k)))),
            h("label.mc-pf", {}, h("span.label", {}, "Notes"), h("textarea.field.mc-text", { rows: 3, value: cur.note ?? "", placeholder: "Why it matters", "aria-label": "Notes", on: { input: (e) => (grow(e.target), setRef(cur.id, { note: e.target.value.slice(0, 200) })) } })),
            h("div.mc-pkeys", {},
              h("button.key", { type: "button", on: { click: () => view(cur.src) } }, icon("expand"), "View full"),
              h("span.spacer"),
              h(`button.mc-iconkey.is-danger${isArmed(armedKey) ? ".is-armed" : ""}`, { type: "button", title: isArmed(armedKey) ? "Click again to take it out" : "Take it out", "aria-label": "Take it out", on: { click: () => arming(armedKey, rerender, () => removeRef(cur.id)) } }, icon("trash")))) : null)
        : h("button.mc-drop.is-big", { type: "button", on: { click: add } }, icon("upload"), h("span", {}, "Add the pictures the work looks to")));
    for (const t of el.querySelectorAll("textarea.mc-text")) grow(t);
  }
  const sig = () => JSON.stringify([macaron.brand?.body.refs, armedNow(), sel, filter]);
  return { el, update, sig };
}
defineWindow("mood", { eyebrow: "Design idea", title: "Moodboard", sub: () => macaron.brand?.name ?? "", size: "xl", advanced: false, make: moodWin });

/** What the story's filter shows: the kinds of step under each. */
const STORY_GROUPS = [
  ["all", "All", null],
  ["decisions", "Decisions", ["decision", "note"]],
  ["concepts", "Concepts", ["concept", "identity", "design", "variant", "motion"]],
  ["references", "References", ["reference", "inspiration", "product", "mascot", "app", "made"]],
  ["exports", "Exports", ["export"]],
];
function storyWin() {
  let filter = "all";
  const chips = h("div.mc-fchips", { role: "group", "aria-label": "Show" });
  const list = h("div.mc-tl", { tabindex: 0, role: "listbox", "aria-label": "The story" });
  const submit = (input) => {
    const text = input.value.trim().slice(0, 140);
    if (!text) return;
    addNote(text);
    input.value = "";
    // (the page is not drawn while a field in it has the focus: let go, so the note shows, then come back for the next)
    input.blur();
    setTimeout(() => input.isConnected && input.focus(), 60);
  };
  const input = h("input.field.mc-text", { placeholder: "What was tried, what was decided…", "aria-label": "A note for the story", on: { keydown: (e) => e.key === "Enter" && submit(e.target) } });
  const compose = h("div.mc-compose", {},
    h("img.mc-compose-pic", { src: BRIOCHE.face, alt: "", draggable: false }),
    h("label.mc-compose-field", {}, h("span.label", {}, "Add a note"), input),
    h("button.mc-primary", { type: "button", title: "Add the note (Enter)", on: { click: () => submit(input) } }, icon("plus"), "Add"));
  const el = h("div.mc-w.is-story", {}, h("div.mc-story-bar", {}, compose, chips), list);
  function update() {
    const b = macaron.brand;
    if (!b || typingIn(list)) return typingIn(list) ? false : undefined;
    const all = [...b.body.history].sort((a, c) => String(c.at).localeCompare(String(a.at)));
    const inGroup = (x, g) => !STORY_GROUPS.find(([id]) => id === g)[2] || STORY_GROUPS.find(([id]) => id === g)[2].includes(x.kind);
    if (!all.some((x) => inGroup(x, filter))) filter = "all";
    const shown = all.filter((x) => inGroup(x, filter));
    const open = shown.find((x) => x.id === macaron.entry) ?? shown[0];
    const at = shown.indexOf(open);
    const go = (d) => shown[Math.max(0, Math.min(shown.length - 1, at + d))] && pickEntry(shown[Math.max(0, Math.min(shown.length - 1, at + d))].id);
    list.onkeydown = (e) => (e.key === "ArrowDown" ? (e.preventDefault(), go(1)) : e.key === "ArrowUp" ? (e.preventDefault(), go(-1)) : null);
    fill(chips, ...STORY_GROUPS.map(([id, label]) => {
      const n = all.filter((x) => inGroup(x, id)).length;
      return h("button.mc-fchip", { type: "button", disabled: id !== "all" && !n, "aria-pressed": String(filter === id), on: { click: () => ((filter = id), changed("macaron")) } }, label);
    }));
    fill(list, shown.length ? shown.map((x) => {
      const isOpen = x === open;
      return h(`article.mc-tl-row${isOpen ? ".is-open" : ""}`, { role: "option", "aria-selected": String(isOpen), dataset: { kind: x.kind, id: x.id }, on: { click: () => !isOpen && pickEntry(x.id) } },
        h("i.mc-tl-dot"),
        h("div.mc-tl-date", {}, h("b", {}, shortDate(x.at).toUpperCase()), h("span", {}, KIND[x.kind] ?? x.kind)),
        h("div.mc-tl-text", {},
          h("h3", {}, x.beat ?? x.title),
          x.note ? h("p", {}, x.note) : null,
          isOpen ? h("div.mc-tl-meta", {}, chip(longDate(x.at)), x.who ? chip(x.who === "brioche" ? "Brioche" : x.who) : null) : null,
          isOpen && x.designId && b.body.designs.some((d) => d.id === x.designId) ? h("button.mc-primary.is-sm", { type: "button", on: { click: () => (openDesign(x.designId), openWin("editor")) } }, sprite("scene-render"), "Open the design") : null),
        x.src ? h("button.mc-tl-pic", { type: "button", title: "See it full size", on: { click: (e) => (e.stopPropagation(), view(x.src)) } }, h("img", { src: x.src, alt: "", loading: "lazy", draggable: false })) : null);
    }) : h("p.mc-hint", {}, "What is tried and decided will be listed here, step by step."));
  }
  const sig = () => JSON.stringify([macaron.brand?.body.history, macaron.entry, filter]);
  return { el, update, sig };
}
defineWindow("story", { eyebrow: "Design idea", title: "The story", sub: () => macaron.brand?.name ?? "", size: "l", advanced: false, make: storyWin });

function directionsWin() {
  const el = h("div.mc-w.is-dirs");
  const rerender = () => update();
  function update() {
    const b = macaron.brand;
    if (!b || typingIn(el)) return typingIn(el) ? false : undefined;
    const list = b.body.directions ?? [];
    const kit = b.body.kit;
    const toneOf = (l) => kit.palette.find((p) => p.id === l?.tone)?.hex ?? "transparent";
    fill(el,
      h("div.mc-dgrid", {}, ...list.map((d) => {
        const armedKey = `dir:${d.id}`;
        const logo = kit.logos.find((l) => l.id === d.logo);
        return h(`article.mc-dcard${d.picked ? ".is-picked" : ""}`, {},
          h("button.mc-dir-pic.is-big", { type: "button", title: d.picked ? "The direction picked" : "Pick this direction", style: d.bg ? { backgroundImage: `url("${d.bg}")` } : {}, on: { click: () => !d.picked && pickDirection(d.id) } },
            logo ? h("img", { src: logo.url, alt: "", draggable: false }) : null, d.picked ? h("i.mc-tick", {}, icon("check")) : null),
          h("input.field.mc-text.mc-dname", { value: d.name, "aria-label": "The direction's name", on: { input: (e) => setDirection(d.id, { name: e.target.value.slice(0, 40) }) } }),
          h("textarea.field.mc-text.mc-dnote", { rows: 2, value: d.note ?? "", "aria-label": "What it is", placeholder: "What it feels like", on: { input: (e) => (grow(e.target), setDirection(d.id, { note: e.target.value.slice(0, 140) })) } }),
          h("div.mc-dlogo", {},
            h("i.mc-dswatch", { style: { background: toneOf(logo) } }),
            h("select.field.mc-dlogo-sel", { "aria-label": "The logo file on it", title: "The logo file on this direction", on: { change: (e) => setDirection(d.id, { logo: e.target.value }) } }, ...kit.logos.filter((l) => l.kind === "wordmark").map((l) => h("option", { value: l.id, selected: l.id === d.logo }, l.name))),
            h("button.mc-iconkey", { type: "button", title: "Use a picture for it", "aria-label": "Use a picture for it", on: { click: (e) => pickRef(e, async (p) => setDirection(d.id, { bg: p.url })) } }, icon("image")),
            h(`button.mc-iconkey.is-danger${isArmed(armedKey) ? ".is-armed" : ""}`, { type: "button", title: isArmed(armedKey) ? "Click again to take it out" : "Take it out", "aria-label": "Take it out", on: { click: () => arming(armedKey, rerender, () => removeDirection(d.id)) } }, icon("trash"))),
          h(`button.mc-pick${d.picked ? ".is-picked" : ""}`, { type: "button", disabled: !!d.picked, on: { click: () => pickDirection(d.id) } }, d.picked ? [icon("check"), "Picked"] : "Pick this"));
      }),
      h("div.mc-dcard.is-add", {},
        h("button.mc-dadd", { type: "button", title: ASK_DIRECTION, on: { click: () => (armPreset("direction", ASK_DIRECTION), tell(ASK_DIRECTION)) } },
          h("img", { src: BRIOCHE.portrait, alt: "", draggable: false }), h("b", {}, "A new direction"), h("span", {}, "Brioche proposes one.")),
        h("button.mc-add-prompt.is-quiet", { type: "button", on: { click: () => addDirection({ name: "A new direction", note: "" }) } }, icon("plus"), "Or start one by hand"))));
    for (const t of el.querySelectorAll("textarea.mc-text")) grow(t);
  }
  const sig = () => JSON.stringify([macaron.brand?.body.directions, macaron.brand?.body.kit.logos, macaron.brand?.body.kit.palette, armedNow()]);
  return { el, update, sig };
}
defineWindow("directions", { eyebrow: "Design idea", title: "Directions", sub: () => macaron.brand?.name ?? "", size: "xl", advanced: false, make: directionsWin,
  foot: () => [h("p.mc-hint", {}, "A direction is a way the mark and the look could go. Pick one: the others stay here.")] });
