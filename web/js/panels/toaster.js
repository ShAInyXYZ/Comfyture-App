// Toaster's screen: block an object out in clay, toast it into a picture, then a 3D model. Three columns, one screen tall (mockup:
// docs/brand/products/toaster-v1/toaster-ui.png). On the left the draft open (a chip that switches drafts), its PARTS, the ADD grid
// of shapes and the part SELECTED. In the middle the viewport (toaster-view.js, made once and kept), its view keys on top and its
// tools at its foot, and under it the LOOK: what the object is, its scene, the model, the frame and the key that renders. On the right
// what was toasted: the RENDER (its strip of earlier ones), the TURNAROUND (four clay views, rendered as one sheet) and the 3D MODEL
// made from it on Comfy Cloud. The right column draws itself on "toaster-runs", so a render's progress never redraws a field in use.
import { h, icon, sprite } from "../dom.js";
import { onChange, toast, useStageRender } from "../store.js";
import { currentPage } from "../router.js";
import { dropdown } from "../controls.js";
import { view as viewImage } from "../viewer.js";
import {
  toaster, body, partsNow, selectedParts, sync, loadDrafts, openDraft, newDraft, removeDraft, renameDraft, pick, select, selectAll,
  setTool, toggleSnap, addPart, addPiece, setProps, applyTransforms, removeSelected, removePart, duplicateSelected, mirrorSelected, dropSelected,
  toggleHidden, undoParts, redoParts, canUndo, canRedo, setWords, setRatio, setModel, keepCamera, loadModels, modelNow, hasClay,
  renderFrame, renderSheet, forget, showRender, setCompare, price3d, priceNow, make3d, putOnStage, isArmed, arm, disarm,
} from "../toaster.js";
import { SHAPES, PALETTE, RATIOS, roundLabel, hasSides, colorName, shapeOf } from "../toaster-model.js";

let shell = null;
let mounting = null;
let model3d = null;

const TOOLS = [
  ["select", "web-cursor", "Select", "Q"],
  ["move", "transform-move", "Move", "W"],
  ["rotate", "transform-rotate", "Turn", "E"],
  ["scale", "transform-scale", "Size", "R"],
];
const VIEW_KEYS = [
  ["persp", "view-persp", "Perspective"],
  ["front", "view-front", "Front"],
  ["right", "view-side", "Side"],
  ["back", "view-back", "Back"],
  ["top", "view-top", "Top"],
];
const BRANDS = { openai: "brand-openai", google: "brand-google", bytedance: "brand-bytedance", qwen: "brand-qwen" };
const fixed = (v, d = 2) => (Math.round(v * 10 ** d) / 10 ** d).toFixed(d);
const tooltip = (label, keyName) => (keyName ? `${label} — ${keyName}` : label);

// ---------------------------------------------------------------- the frame of the page

function build(el) {
  const s = {};
  s.draft = h("div.ts-draft");
  s.parts = h("div.ts-parts", { role: "tree", "aria-label": "Parts", dataset: { scrollKey: "ts-parts" } });
  s.partsCount = h("span.ts-count");
  s.add = h("div.ts-add", { role: "group", "aria-label": "Add a shape" }, ...SHAPES.map((sh) =>
    h("button.ts-tile", { type: "button", title: `Add a ${sh.name.toLowerCase()}`, "aria-label": `Add a ${sh.name.toLowerCase()}`, on: { click: () => addPart(sh.id) } }, sprite(`shape-${sh.id}`))));
  // the Stage's library: every piece it stages (furniture, objects, food, vehicles…), in a drawer over the viewport
  s.libraryKey = h("button.ts-library-key", { type: "button", "aria-pressed": "false", title: "The Stage's library: furniture, objects, food, products, vehicles, creatures — L", on: { click: () => toggleLibrary() } },
    sprite("asset-library"), h("span", {}, "Library"), h("em.ts-library-count"));
  s.inspector = h("div.ts-inspector");
  const left = h("aside.ts-col.ts-left", { "aria-label": "The object" },
    s.draft,
    h("section.ts-card.ts-parts-card", {}, h("header.ts-head", {}, h("h2.ts-label", {}, "Parts"), s.partsCount), s.parts),
    h("section.ts-card", {}, h("header.ts-head", {}, h("h2.ts-label", {}, "Add")), s.add, s.libraryKey),
    h("section.ts-card.ts-selected", {}, h("header.ts-head", {}, h("h2.ts-label", {}, "Selected")), s.inspector));

  // the viewport: the canvas, the frame over it, the view keys and the tools
  s.stage = h("div.ts-stage");
  s.frame = h("div.ctl-frame.ts-frame", { "aria-hidden": "true" }, ...["tl", "tr", "bl", "br"].map((c) => h(`i.c.${c}`)));
  s.views = h("div.ts-views", { role: "toolbar", "aria-label": "Views" });
  s.tools = h("div.ctl-tools.ts-tools", { role: "toolbar", "aria-label": "Tools" });
  s.boot = h("p.ts-boot", {}, "Warming up the toaster…");
  s.library = h("div.ts-library", { hidden: true, role: "dialog", "aria-label": "The Stage's library" });
  const viewport = h("section.ts-view", { "aria-label": "Viewport" }, s.stage, s.frame, s.views, s.tools, s.boot, s.library);

  // the look: the words and the key that renders
  s.what = h("input.ts-field", { type: "text", maxLength: 600, placeholder: "A retro 1950s toaster, chrome body, walnut lever, cream knob", "aria-label": "What it is", on: { input: (e) => setWords("what", e.target.value) } });
  s.scene = h("input.ts-field", { type: "text", maxLength: 600, placeholder: "On a marble kitchen counter, soft morning light, product photo", "aria-label": "Scene", on: { input: (e) => setWords("scene", e.target.value) } });
  s.lookKeys = h("div.ts-look-keys");
  const look = h("section.ts-card.ts-look", { "aria-label": "Look" },
    h("label.ts-row", {}, h("span.ts-label", {}, "What it is"), s.what),
    h("label.ts-row", {}, h("span.ts-label", {}, "Scene"), s.scene),
    s.lookKeys);
  const mid = h("div.ts-mid", {}, viewport, look);

  s.render = h("section.ts-card.ts-render", { "aria-label": "Render" });
  s.sheet = h("section.ts-card.ts-sheet", { "aria-label": "Turnaround" });
  s.model = h("section.ts-card.ts-model", { "aria-label": "3D model" });
  const right = h("aside.ts-col.ts-right", { "aria-label": "Toasted" }, s.render, s.sheet, s.model);

  s.root = h("div.toaster", {}, left, mid, right);
  // a field left: what waited while it was in use is drawn now
  s.root.addEventListener("focusout", (e) => !s.root.contains(e.relatedTarget) && setTimeout(() => drawLeft(), 0));
  el.replaceChildren(s.root);
  shell = s;
  mountView();
}

/** The viewport, made once (three.js loads with it): it tells the page what is clicked and moved, the page tells it the draft. */
function mountView() {
  mounting ??= import("../toaster-view.js").then(({ ToasterView }) => {
    const v = new ToasterView(shell.stage, shell.frame, {
      onPick: (id, { shift } = {}) => pick(id, { shift }),
      onChange: (changes) => applyTransforms(changes),
      onDrag: (changes) => liveNumbers(changes),
      onCamera: () => {
        lastView = null;
        drawViews();
        keepCamera();
        stripSoon();
      },
    });
    toaster.view = v;
    shell.boot.remove();
    const b = body();
    if (b?.camera) v.setCameraState(b.camera);
    sync();
    stripSoon();
    return v;
  }).catch((e) => {
    shell.boot.textContent = `The viewport could not start: ${e.message}`;
    throw e;
  });
  return mounting;
}

// ---------------------------------------------------------------- the left column

let menuOpen = false;
let renaming = null;
function drawDraft() {
  const d = toaster.draft;
  const thumb = toaster.list.find((x) => x.id === d?.id)?.thumb;
  const name = renaming === "draft"
    ? nameField(d?.name ?? "", (v) => renameDraft(v))
    : h("span.ts-draft-name", { title: "Double-click to rename", on: { dblclick: () => ((renaming = "draft"), drawDraft()) } }, d?.name ?? "…");
  const chip = h("div.ts-draft-chip", {},
    thumb ? h("img", { src: thumb, alt: "", draggable: false }) : h("span.ts-draft-thumb", {}, sprite("product-toaster")),
    name,
    h("button.ts-mini", { type: "button", "aria-expanded": String(menuOpen), title: "Every draft", "aria-label": "Every draft", on: { click: () => ((menuOpen = !menuOpen), drawDraft()) } }, icon("chevron")));
  const menu = menuOpen ? h("div.ts-draft-menu", { role: "menu" },
    ...toaster.list.map((x) => h(`div.ts-draft-row${x.id === d?.id ? ".is-on" : ""}`, { role: "menuitem" },
      h("button.ts-draft-open", { type: "button", on: { click: () => ((menuOpen = false), openDraft(x.id).catch((e) => toast(e.message, { tone: "crit" }))) } },
        x.thumb ? h("img", { src: x.thumb, alt: "", draggable: false }) : h("span.ts-draft-thumb", {}, sprite("product-toaster")), h("span", {}, x.name)),
      isArmed(`del:${x.id}`)
        ? h("button.ts-mini.is-danger", { type: "button", title: "Click again to delete it", "aria-label": `Delete ${x.name}`, on: { click: () => (disarm(), removeDraft(x.id).catch((e) => toast(e.message, { tone: "crit" }))) } }, icon("trash"))
        : h("button.ts-mini", { type: "button", title: "Delete this draft", "aria-label": `Delete ${x.name}`, on: { click: () => (arm(`del:${x.id}`), drawDraft()) } }, icon("trash")))),
    h("button.ts-draft-new", { type: "button", on: { click: () => ((menuOpen = false), newDraft().catch((e) => toast(e.message, { tone: "crit" }))) } }, icon("plus"), h("span", {}, "New object"))) : null;
  shell.draft.replaceChildren(chip, ...(menu ? [menu] : []));
}
document.addEventListener("pointerdown", (e) => {
  if (menuOpen && shell && !shell.draft.contains(e.target)) {
    menuOpen = false;
    drawDraft();
  }
});

function nameField(current, done) {
  const input = h("input.ts-rename", { value: current, maxLength: 40, "aria-label": "Name" });
  let over = false;
  const end = (keep) => {
    if (over) return;
    over = true;
    renaming = null;
    if (keep && input.value.trim() && input.value.trim() !== current) done(input.value.trim());
    else drawLeft();
  };
  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") end(true);
    if (e.key === "Escape") end(false);
  });
  input.addEventListener("blur", () => end(true));
  requestAnimationFrame(() => (input.focus(), input.select()));
  return input;
}

function drawParts() {
  const parts = partsNow();
  shell.partsCount.textContent = parts.length ? String(parts.length) : "";
  if (!parts.length) return shell.parts.replaceChildren(h("p.ts-empty", {}, "Add a shape below to start blocking out."));
  shell.parts.replaceChildren(...parts.map((p) => {
    const on = toaster.selected.includes(p.id);
    return h(`div.ts-part${on ? ".is-on" : ""}${p.hidden ? ".is-hidden" : ""}`, {
      role: "treeitem", "aria-selected": String(on), tabindex: "0", dataset: { focusKey: p.id },
      on: { click: (e) => pick(p.id, { shift: e.shiftKey || e.ctrlKey || e.metaKey }), dblclick: () => ((renaming = p.id), drawParts()) },
    },
      p.shape === "asset" ? h("span.ts-glyph", { title: "A piece of the Stage's library" }, sprite(pieceOf(p.asset)?.icon ?? "asset-library")) : h("span.ts-glyph", { title: shapeOf(p.shape).name }, sprite(`shape-${p.shape}`)),
      h("span.ts-chip", { style: { background: p.color }, title: colorName(p.color) }),
      renaming === p.id ? nameField(p.name, (v) => setProps({ name: v }, { ids: [p.id] })) : h("span.ts-name", { title: p.made ? `${p.name} · ${p.made}` : "Double-click to rename" }, p.name),
      h("button.ts-mini", { type: "button", "aria-pressed": String(!!p.hidden), title: p.hidden ? "Show" : "Hide", "aria-label": p.hidden ? `Show ${p.name}` : `Hide ${p.name}`, on: { click: (e) => (e.stopPropagation(), toggleHidden(p.id)) } }, sprite("eye")),
      h("button.ts-mini", { type: "button", title: "Remove", "aria-label": `Remove ${p.name}`, on: { click: (e) => (e.stopPropagation(), removePart(p.id)) } }, icon("trash")));
  }));
}

/** A row of three numbers (size, place or turn), each kept on Enter or when left; the numbers follow a drag live (liveNumbers). */
function triple(label, key, values, { step, min, unit } = {}) {
  return h("div.ts-triple", {}, h("span.ts-label", {}, label), ...["x", "y", "z"].map((axis, i) =>
    h("label.ts-num", {}, h("span", {}, axis.toUpperCase()),
      h("input", {
        type: "number", step, min, value: key === "rot" ? fixed(values[i], 0) : fixed(values[i]), dataset: { key, axis: String(i) }, "aria-label": `${label} ${axis}`,
        on: {
          change: (e) => {
            const n = Number(e.target.value);
            if (!Number.isFinite(n)) return;
            setProps((p) => ({ [key]: p[key].map((v, j) => (j === i ? n : v)) }), { coalesce: `${key}-${i}` });
          },
          keydown: (e) => e.key === "Enter" && e.target.blur(),
        },
      }))), unit ? h("span.ts-unit", {}, unit) : null);
}

function drawInspector() {
  const sel = selectedParts();
  if (!sel.length) return shell.inspector.replaceChildren(h("p.ts-empty", {}, "Click a part in the viewport or in the list. Shift adds to the selection."));
  const p = sel[0];
  const many = sel.length > 1;
  const swatches = h("div.ts-swatches", { role: "group", "aria-label": "Colour" }, ...PALETTE.map(([hex, name]) =>
    h("button.ts-swatch", { type: "button", style: { background: hex }, title: name, "aria-label": name, "aria-pressed": String(sel.every((x) => x.color === hex)), on: { click: () => setProps({ color: hex }) } })));
  const made = h("input.ts-field", { type: "text", maxLength: 120, value: many && !sel.every((x) => x.made === p.made) ? "" : p.made, placeholder: "brushed chrome, walnut, enamel…", "aria-label": "Made of", on: { change: (e) => setProps({ made: e.target.value.trim() }) } });
  const rows = [
    many ? h("p.ts-many", {}, `${sel.length} parts`) : h("label.ts-row", {}, h("span.ts-label", {}, "Name"), h("input.ts-field", { type: "text", maxLength: 40, value: p.name, "aria-label": "Name", on: { change: (e) => e.target.value.trim() && setProps({ name: e.target.value.trim() }) } })),
    h("label.ts-row", {}, h("span.ts-label", {}, "Made of"), made),
    swatches,
  ];
  if (!many) {
    rows.push(triple("Size", "size", p.size, { step: 0.05, min: 0.01 }), triple("Move", "pos", p.pos, { step: 0.05 }), triple("Turn", "rot", p.rot, { step: 5, unit: "°" }));
    const label = roundLabel(p.shape);
    if (label) rows.push(slider(label, p.round ?? 0, 0, 1, 0.01, (v) => setProps({ round: v }, { coalesce: "round" }), (v) => fixed(v)));
    if (hasSides(p.shape)) rows.push(slider("Sides", p.sides ?? 32, 3, 64, 1, (v) => setProps({ sides: v }, { coalesce: "sides" }), (v) => String(v)));
  }
  shell.inspector.replaceChildren(...rows);
}

function slider(label, value, min, max, step, set, show) {
  const out = h("output.ts-readout", {}, show(value));
  return h("label.ts-slider", {}, h("span.ts-label", {}, label),
    h("input", { type: "range", min, max, step, value, "aria-label": label, on: { input: (e) => ((out.textContent = show(Number(e.target.value))), set(Number(e.target.value))) } }), out);
}

/** The numbers of the part being dragged, as it moves (the inspector is not drawn again under the pointer). */
function liveNumbers(changes) {
  const c = changes?.find((x) => x.id === toaster.selected[0]);
  if (!c || toaster.selected.length !== 1) return;
  for (const input of shell.inspector.querySelectorAll("input[data-key]")) {
    const v = c[input.dataset.key]?.[Number(input.dataset.axis)];
    if (Number.isFinite(v)) input.value = input.dataset.key === "rot" ? fixed(v, 0) : fixed(v);
  }
}

function drawLeft() {
  if (!shell) return;
  drawDraft();
  drawParts();
  drawInspector();
}

// ---------------------------------------------------------------- the Stage's library

// the pieces (toaster-assets.js, with the Stage's own models), once read; the drawer's search and category are kept while it is shut
let library = null;
let libraryOpen = false;
let pieceQuery = "";
let pieceGroup = "All";
let assets = null;
const pieceOf = (type) => library?.pieces.find((x) => x.type === type) ?? null;
/** The library module, loaded on first need (it brings three.js and the Stage's models with it). */
function assetsModule() {
  assets ??= import("../toaster-assets.js").then((m) => {
    m.onLibrary?.((lib) => ((library = lib), drawLibraryCount(), libraryOpen && drawLibrary(), drawParts()));
    m.loadLibrary().then((lib) => ((library = lib), drawLibraryCount(), libraryOpen && drawLibrary(), drawParts())).catch((e) => console.warn("toaster: the library did not load:", e.message));
    return m;
  });
  return assets;
}
function drawLibraryCount() {
  const em = shell?.libraryKey.querySelector(".ts-library-count");
  if (em) em.textContent = library ? String(library.pieces.length) : "";
}

export function toggleLibrary(on = !libraryOpen) {
  if (!shell) return;
  libraryOpen = on;
  shell.libraryKey.setAttribute("aria-pressed", String(on));
  shell.library.hidden = !on;
  if (on) {
    assetsModule();
    drawLibrary();
    requestAnimationFrame(() => shell.library.querySelector(".ts-lib-search input")?.focus());
  }
}

// a thumbnail is drawn when its tile scrolls into view, so the long library opens at once
const thumbs = new IntersectionObserver((seen) => {
  for (const e of seen) {
    if (!e.isIntersecting) continue;
    thumbs.unobserve(e.target);
    assets?.then((m) => (e.target.src = m.assetThumb(e.target.dataset.type)));
  }
}, { rootMargin: "200px" });

function drawLibrary() {
  const finds = (x) => {
    const hay = [x.name, x.type, x.category, ...(x.themes ?? []), ...(x.tags ?? [])].join(" ").toLowerCase().replace(/[-_]+/g, " ");
    return pieceQuery.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
  };
  const results = h("div.ts-lib-results", { dataset: { scrollKey: "ts-lib" } });
  const fill = () => {
    if (!library) return results.replaceChildren(h("p.ts-empty", {}, "Bringing the Stage's pieces…"));
    const all = library.pieces.filter((x) => (pieceGroup === "All" || x.category === pieceGroup) && (!pieceQuery || finds(x)));
    const groups = [...new Set(all.map((x) => x.category))].map((c) => [c, all.filter((x) => x.category === c)]);
    results.replaceChildren(...groups.flatMap(([c, list]) => [
      h("span.ts-label.ts-lib-group", {}, c === "Mine" ? "Yours" : c),
      h("div.ts-lib-grid", {}, ...list.map((x) => {
        const img = h("img", { alt: "", draggable: false, dataset: { type: x.type } });
        thumbs.observe(img);
        return h("button.ts-piece", { type: "button", title: x.themes?.length ? `${x.name} — ${x.themes.join(", ")}` : x.name, "aria-label": `Add ${x.name.toLowerCase()}`, on: { click: () => addPiece(x) } }, img, h("span", {}, x.name));
      })),
    ]));
    if (!groups.length) results.append(h("p.ts-empty", {}, pieceQuery ? `Nothing for "${pieceQuery}". Try a theme: kitchen, food, office, street, studio…` : "Nothing here."));
  };
  const cats = library ? ["All", ...new Set(library.pieces.map((x) => x.category))] : ["All"];
  const chips = h("div.ts-lib-cats", { role: "group", "aria-label": "Category" }, ...cats.map((c) =>
    h("button.ts-lib-cat", { type: "button", "aria-pressed": String(pieceGroup === c), on: { click: () => ((pieceGroup = c), drawLibrary()) } }, c === "Mine" ? "Yours" : c)));
  const search = h("label.ts-lib-search", {}, icon("search"),
    h("input", { type: "search", value: pieceQuery, placeholder: "Chair, kitchen, food, car…", "aria-label": "Search the library", autocomplete: "off", spellcheck: false,
      on: { input: (e) => ((pieceQuery = e.target.value), fill()), keydown: (e) => (e.stopPropagation(), e.key === "Escape" && (e.target.value ? ((e.target.value = ""), (pieceQuery = ""), fill()) : toggleLibrary(false))) } }));
  fill();
  shell.library.replaceChildren(
    h("header.ts-lib-head", {}, h("h2.ts-label", {}, "Library"), h("span.ts-count", {}, library ? String(library.pieces.length) : ""), h("span.spacer"),
      h("button.ts-mini", { type: "button", title: "Close — Esc", "aria-label": "Close the library", on: { click: () => toggleLibrary(false) } }, icon("close"))),
    search, chips, results);
}

// ---------------------------------------------------------------- the viewport's keys

let lastView = "persp";
/** The view keys, made once (a key made again on every turn of the camera flickers); the one the camera is on is lit. */
function drawViews() {
  if (!shell.views.childElementCount) shell.views.replaceChildren(...VIEW_KEYS.map(([id, glyph, label]) =>
    h("button.ts-view-key", { type: "button", title: label, dataset: { view: id }, on: { click: () => goView(id) } }, sprite(glyph), h("span", {}, label))));
  for (const b of shell.views.children) b.setAttribute("aria-pressed", String(lastView === b.dataset.view));
}
function goView(id) {
  if (!toaster.view) return;
  toaster.view.view(id);
  keepCamera();
  lastView = id;
  drawViews();
}

function drawTools() {
  const has = toaster.selected.length > 0;
  const key = (glyph, label, run, { pressed, disabled } = {}) =>
    h("button.ctl-tool", { type: "button", title: label, "aria-label": label.split(" — ")[0], "aria-pressed": pressed === undefined ? undefined : String(pressed), disabled, on: { click: run } }, glyph);
  shell.tools.replaceChildren(
    ...TOOLS.map(([id, glyph, label, k]) => key(sprite(glyph), tooltip(label, k), () => setTool(id), { pressed: toaster.tool === id })),
    h("span.ctl-sep"),
    key(sprite("copy"), tooltip("Duplicate", "Ctrl D"), duplicateSelected, { disabled: !has }),
    key(sprite("flip-h"), tooltip("Mirror to the other side", "M"), mirrorSelected, { disabled: !has }),
    key(sprite("tool-floor"), tooltip("Drop to the floor", "G"), dropSelected, { disabled: !partsNow().length }),
    key(icon("trash"), tooltip("Delete", "Del"), removeSelected, { disabled: !has }),
    h("span.ctl-sep"),
    key(sprite("tool-snap"), tooltip(toaster.snap ? "Snap is on" : "Snap is off", "S"), toggleSnap, { pressed: toaster.snap }),
    key(sprite("camera-framing"), tooltip("Frame the object", "F"), () => toaster.view?.frame(toaster.selected.length ? toaster.selected : undefined)),
    h("span.ctl-sep"),
    key(sprite("edit-undo"), tooltip("Undo", "Ctrl Z"), undoParts, { disabled: !canUndo() }),
    key(sprite("edit-redo"), tooltip("Redo", "Ctrl Shift Z"), redoParts, { disabled: !canRedo() }));
}

// ---------------------------------------------------------------- the look

function modelItems() {
  const list = toaster.models?.models ?? [];
  return [...list.filter((m) => m.router), ...list.filter((m) => !m.router)].map((m) => {
    const groupIcon = m.router ? (BRANDS[m.maker] ? () => sprite(BRANDS[m.maker]) : null) : () => icon("flow");
    return { value: m.id, label: m.name, short: m.short, glyph: groupIcon ?? (() => sprite("image-generate")), desc: m.about, group: m.router ? m.makerName : "Open weights", groupIcon, meta: m.router ? `≈ ${m.credits} cr` : "GPU time" };
  });
}
const priceOf = (m) => (!m ? "" : m.router ? `≈ ${m.credits} cr` : "GPU time");

function drawLook() {
  const b = body();
  if (!b) return;
  if (document.activeElement !== shell.what) shell.what.value = b.what;
  if (document.activeElement !== shell.scene) shell.scene.value = b.scene;
  const m = modelNow();
  const busy = b.renders.some((r) => r.status === "running");
  const models = modelItems();
  shell.lookKeys.replaceChildren(
    h("button.ts-iconkey", { type: "button", title: "Keep the clay frame in the Library", "aria-label": "Keep the clay frame in the Library", disabled: !toaster.view || !hasClay(), on: { click: keepClay } }, sprite("image-upload")),
    models.length ? h("div.ts-pick", {}, dropdown({ label: "Image model", value: m?.id, items: models, onChange: setModel, width: "fit", note: "What renders the clay: a partner model's credits, or Comfy Cloud's GPU time" })) : h("span.ts-note", {}, "No image model yet"),
    h("div.ts-pick", {}, dropdown({ label: "Frame", value: b.ratio, items: Object.keys(RATIOS).map((r) => ({ value: r, label: r, glyph: () => sprite(r === "4:5" ? "ratio-3-4" : `ratio-${r.replace(":", "-")}`) })), onChange: setRatio })),
    h("span.spacer"),
    h("button.key.is-primary.ts-toast", { type: "button", disabled: busy || !m || !hasClay(), title: "Render the frame: the clay is the layout, the words what it becomes", on: { click: renderFrame } },
      sprite("toast-it"), h("span", {}, busy ? "Toasting…" : "Toast it"), m ? h("em", {}, priceOf(m)) : null));
}

async function keepClay() {
  try {
    const blob = await (await fetch(toaster.view.frameStill({ long: 1536 }))).blob();
    const res = await fetch(`api/photos?name=${encodeURIComponent(`${toaster.draft?.name ?? "Toaster"} clay`)}`, { method: "POST", headers: { "Content-Type": blob.type }, body: blob });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "The frame was not kept.");
    toast("The clay frame is in the Library.", { action: { label: "Open Library", run: () => (location.hash = "#/library") } });
  } catch (e) {
    toast(e.message, { tone: "crit" });
  }
}

// ---------------------------------------------------------------- the right column: what was toasted

const lampOf = (runs) => (runs.some((r) => r.status === "running") ? "busy" : runs[0]?.status === "failed" ? "crit" : runs.some((r) => r.status === "done") ? "ok" : null);
const lamp = (runs) => h("span.lamp", { dataset: lampOf(runs) ? { tone: lampOf(runs) } : {} });
const head = (label, runs, ...keys) => h("header.ts-head", {}, h("h2.ts-label", {}, label), lamp(runs), h("span.spacer"), ...keys);
const progress = (r, words) => h("div.ts-working", {}, h("span.typing", {}, h("i"), h("i"), h("i")), h("span", {}, words), h("i.ts-bar", { style: { width: `${Math.round((r.progress ?? 0) * 100)}%` } }));
const keyIcon = (glyph, label, run, { pressed, disabled, href, download, small } = {}) =>
  href && !disabled
    ? h(`a.ts-iconkey${small ? ".is-sm" : ""}`, { href, download, title: label, "aria-label": label }, glyph)
    : h(`button.ts-iconkey${small ? ".is-sm" : ""}`, { type: "button", title: label, "aria-label": label, "aria-pressed": pressed === undefined ? undefined : String(pressed), disabled, on: { click: run } }, glyph);
const fileName = (base, url) => `${(base || "toaster").replace(/[^\w -]+/g, "").trim() || "toaster"}.${String(url).split(".").pop()}`;

/** The render shown, as large as the card's room allows (the picture is fitted whole), the earlier ones in a strip beside it. */
function drawRender() {
  const b = body();
  const renders = b.renders;
  const r = renders.find((x) => x.id === toaster.shown) ?? renders[0];
  const done = r?.status === "done";
  let picture;
  if (!r) picture = h("div.ts-pic.is-empty", {}, sprite("toast-it"), h("span", {}, "Block it out, say what it is, and toast it."));
  else if (r.status === "running") picture = h("div.ts-pic.is-running", {}, r.frame ? h("img.ts-under", { src: r.frame.url, alt: "", draggable: false }) : null, progress(r, "Toasting the frame"));
  else if (r.status === "failed") picture = h("div.ts-pic.is-failed", {}, icon("close"), h("span", {}, r.error ?? "That didn't work."));
  else if (toaster.compare && r.frame) picture = comparePic(r);
  else picture = h("button.ts-pic", { type: "button", title: "Look at it, full size", on: { click: () => viewImage(r.photo.url) } }, h("img", { src: r.photo.url, alt: "", draggable: false }));
  const strip = renders.length > 1 ? h("div.ts-strip", { role: "list", "aria-label": "Earlier renders", dataset: { scrollKey: "ts-strip" } }, ...renders.map((x) =>
    h(`button.ts-thumb${x.id === r?.id ? ".is-on" : ""}`, { type: "button", role: "listitem", title: x.status === "failed" ? x.error : "Show it, from its camera", on: { click: () => showRender(x.id) } },
      x.photo ? h("img", { src: x.photo.url, alt: "", draggable: false, loading: "lazy" }) : x.status === "running" ? h("span.typing", {}, h("i"), h("i"), h("i")) : icon("close")))) : null;
  shell.render.replaceChildren(
    head("Render", renders,
      keyIcon(sprite("image-compare"), "Compare with the clay", () => setCompare(!toaster.compare), { pressed: toaster.compare, disabled: !done || !r.frame, small: true }),
      keyIcon(icon("expand"), "Look at it, full size", () => viewImage(r.photo.url), { disabled: !done, small: true }),
      keyIcon(icon("video"), "Start a shot from it", () => useStageRender(r.photo), { disabled: !done, small: true }),
      keyIcon(icon("download"), "Download", null, { href: r?.photo?.url, download: done ? fileName(toaster.draft?.name, r.photo.url) : undefined, disabled: !done, small: true }),
      keyIcon(icon("trash"), "Forget this render — it stays in the Library", () => forget("renders", r.id), { disabled: !r || r.status === "running", small: true })),
    h("div.ts-render-body", {}, picture, strip));
}

let split = 0.5;
function comparePic(r) {
  const top = h("img.ts-over", { src: r.photo.url, alt: "", draggable: false, style: { clipPath: `inset(0 0 0 ${split * 100}%)` } });
  const bar = h("i.ts-wipe", { style: { left: `${split * 100}%` } });
  const at = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    split = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
    top.style.clipPath = `inset(0 0 0 ${split * 100}%)`;
    bar.style.left = `${split * 100}%`;
  };
  return h("div.ts-pic.is-compare", { title: "Drag: the clay on the left, the render on the right", on: { pointerdown: (e) => (e.currentTarget.setPointerCapture(e.pointerId), at(e)), pointermove: (e) => e.currentTarget.hasPointerCapture(e.pointerId) && at(e) } },
    h("img", { src: r.frame.url, alt: "", draggable: false }), top, bar, h("span.ts-tag.is-a", {}, "Clay"), h("span.ts-tag.is-b", {}, "Render"));
}

// the four clay views as the turnaround will send them, drawn small a moment after the clay changes
let strip = null;
let stripTimer = 0;
function stripSoon() {
  clearTimeout(stripTimer);
  stripTimer = setTimeout(() => {
    if (!toaster.view || currentPage() !== "toaster") return;
    try {
      strip = hasClay() ? toaster.view.sheetStill({ scale: 0.1, type: "image/jpeg", quality: 0.85 }).url : null;
    } catch {
      strip = null;
    }
    const img = shell?.sheet.querySelector("img.ts-clay-strip");
    if (img && strip) img.src = strip;
    else drawRuns();
  }, 450);
}

/** The turnaround: the sheet last toasted (the clay of that moment under it while it renders), else the four clay views as they are now. */
let sheetClay = false;
function drawSheet() {
  const b = body();
  const s = b.sheets[0];
  const m = modelNow();
  const busy = s?.status === "running";
  const done = s?.status === "done";
  const clayNow = () => (strip && hasClay() ? h("img.ts-clay-strip", { src: strip, alt: "The four clay views: front, left, back, right", draggable: false }) : h("div.ts-sheet-pic.is-empty", {}, "The four clay views show here."));
  let pic;
  if (busy) pic = h("div.ts-sheet-pic.is-running", {}, s.frame ? h("img.ts-under", { src: s.frame.url, alt: "", draggable: false }) : null, progress(s, "Toasting the four views"));
  else if (s?.status === "failed") pic = h("div.ts-sheet-pic.is-failed", {}, icon("close"), h("span", {}, s.error ?? "That didn't work."));
  else if (done && !sheetClay) pic = h("button.ts-sheet-pic", { type: "button", title: "Look at it, full size", on: { click: () => viewImage(s.photo.url) } }, h("img", { src: s.photo.url, alt: "", draggable: false }));
  else pic = clayNow();
  shell.sheet.replaceChildren(
    head("Turnaround", b.sheets,
      keyIcon(sprite("view-persp"), sheetClay ? "Show the toasted sheet" : "Show the clay views as they are now", () => ((sheetClay = !sheetClay), drawSheet()), { pressed: sheetClay, disabled: !done, small: true }),
      keyIcon(icon("trash"), "Forget this turnaround — it stays in the Library", () => forget("sheets", s.id), { disabled: !s || busy, small: true })),
    pic,
    h("button.key.is-primary.ts-wide", { type: "button", disabled: busy || !m || !hasClay(), title: "Render the four views as one sheet, so they agree: the 3D model is made from it", on: { click: () => ((sheetClay = false), renderSheet()) } },
      sprite("sheet-turnaround"), h("span", {}, busy ? "Toasting…" : "Toast the turnaround"), m ? h("em", {}, priceOf(m)) : null));
}

/** The 3D model: it turns in its well on the left; what made it, its key and what to do with it on the right. */
function drawModel() {
  const b = body();
  const m = b.models[0];
  const sheet = b.sheets.find((s) => s.status === "done");
  const busy = m?.status === "running";
  const price = priceNow();
  const cost = price ? (price.credits > 0 ? `≈ ${price.credits} cr` : price.credits === 0 ? "GPU time" : "") : "";
  const armed = isArmed("3d");
  let well;
  if (busy) well = h("div.ts-well.is-running", {}, progress(m, "On Comfy Cloud"));
  else if (m?.status === "failed") well = h("div.ts-well.is-failed", { title: m.error ?? "" }, icon("close"), h("span", {}, m.error ?? "That didn't work."));
  else if (m?.status === "done") well = h("div.ts-well.ts-model-view", { title: "Drag to turn it" });
  else well = h("div.ts-well.is-empty", {}, sprite("model-3d"));
  const key = armed
    ? h("div.ts-armed", {},
      h("button.key.is-primary.ts-wide", { type: "button", on: { click: () => (disarm(), make3d(sheet.id)) } }, h("span", {}, "Yes, make it"), cost ? h("em", {}, cost) : null),
      h("button.key.ts-not-now", { type: "button", on: { click: disarm } }, "Not now"))
    : h("button.key.is-primary.ts-wide", { type: "button", disabled: busy || !sheet, title: sheet ? "Pixal3D, on Comfy Cloud: a textured 3D model from the four views" : "Toast a turnaround first: the model is made from it", on: { click: () => arm("3d") } },
      sprite("model-3d"), h("span", {}, busy ? "Making…" : "Make the 3D model"), cost ? h("em", {}, cost) : null);
  const done = m?.status === "done";
  shell.model.replaceChildren(
    head("3D model", b.models),
    h("div.ts-model-body", {},
      well,
      h("div.ts-model-side", {},
        h("p.ts-meta", {}, busy ? `Pixal3D · ${Math.round((m.progress ?? 0) * 100)}%` : done ? `Pixal3D · ${new Date(m.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : sheet ? "Pixal3D multi-view, from the turnaround" : "Made from a turnaround"),
        key,
        h("div.ts-keys", {},
          keyIcon(icon("download"), "Download the 3D file", null, { href: m?.url, download: done ? fileName(toaster.draft?.name, m.url) : undefined, disabled: !done }),
          keyIcon(sprite("model-import"), "Put it on the Stage, as a prop", () => putOnStage(m).catch((e) => toast(e.message, { tone: "crit" })), { disabled: !done }),
          h("span.spacer"),
          keyIcon(icon("trash"), "Forget this model — its file stays", () => forget("models", m.id), { disabled: !m || busy })))));
  // the model turns in its well (one viewer, made again only for another file)
  const host = shell.model.querySelector(".ts-model-view");
  if (host && done) {
    if (model3d?.url === m.url) host.replaceWith(model3d.el);
    else {
      model3d?.handle?.dispose();
      model3d = { url: m.url, el: host, handle: null };
      const mine = model3d;
      import("../toaster-glb.js").then(({ mountModel }) => {
        if (model3d !== mine) return;
        mine.handle = mountModel(host, m.url);
        mine.handle.ready?.catch((e) => (host.textContent = e.message));
      });
    }
  } else if (model3d && !host) {
    model3d.handle?.dispose();
    model3d = null;
  }
}

function drawRight() {
  if (!shell || !body()) return;
  drawRender();
  drawSheet();
  drawModel();
}

// ---------------------------------------------------------------- the page

export function renderToaster(el) {
  if (!shell || !el.contains(shell.root)) build(el);
  loadDrafts();
  if (!toaster.models) loadModels();
  if (!priceNow()) price3d();
  if (!body()) return;
  // a draft with pieces of the library needs the library (their models, their icons)
  if (partsNow().some((p) => p.shape === "asset")) assetsModule();
  drawLeft();
  drawViews();
  drawTools();
  drawLook();
  drawRight();
  stripSoon();
}

// What was toasted draws on its own (a render's progress never redraws a field being typed in). A press on the page holds it until its
// click has landed: a key drawn again between the button going down and up would take the click with it (the app does the same for its panels).
let held = false;
let owed = false;
function drawRuns() {
  if (!shell || currentPage() !== "toaster") return;
  if (held) return void (owed = true);
  drawRight();
  drawLook();
}
const release = () => {
  if (!held) return;
  held = false;
  if (owed) (owed = false), drawRuns();
};
window.addEventListener("pointerdown", (e) => (held = !!shell?.root.contains(e.target)), true);
window.addEventListener("pointerup", () => setTimeout(release), true);
window.addEventListener("pointercancel", release, true);
onChange((scopes) => scopes.has("toaster-runs") && drawRuns());

// ---------------------------------------------------------------- the keys of the keyboard

const typing = (t) => t?.closest?.("input, textarea, select, [contenteditable]:not([contenteditable=false])");
window.addEventListener("keydown", (e) => {
  if (currentPage() !== "toaster" || typing(e.target) || !shell || document.querySelector(".viewer:not([hidden]), .img-layer:not([hidden])")) return;
  const k = e.key.toLowerCase();
  const mod = e.ctrlKey || e.metaKey;
  const done = () => e.preventDefault();
  if (mod && k === "z") return done(), e.shiftKey ? redoParts() : undoParts();
  if (mod && k === "y") return done(), redoParts();
  if (mod && k === "d") return done(), duplicateSelected();
  if (mod && k === "a") return done(), selectAll();
  if (mod || e.altKey) return;
  const tool = TOOLS.find(([, , , key]) => key.toLowerCase() === k);
  if (tool) return done(), setTool(tool[0]);
  if (k === "delete" || k === "backspace") return done(), removeSelected();
  if (k === "escape") return libraryOpen ? toggleLibrary(false) : select([]);
  if (k === "l") return toggleLibrary();
  if (k === "m") return mirrorSelected();
  if (k === "g") return dropSelected();
  if (k === "s") return toggleSnap();
  if (k === "f") return toaster.view?.frame(toaster.selected.length ? toaster.selected : undefined);
  if (k === "1") return goView("front");
  if (k === "3") return goView("right");
  if (k === "7") return goView("top");
  if (k === "5") return goView("persp");
});
