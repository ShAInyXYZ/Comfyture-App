// Toaster's screen: block an object or a whole scene out in clay, toast it into a picture, then a turnaround and a 3D model. A project bar
// on top (toaster-projects.js: the projects as tabs, and the Scene / Render switch, key T), then one of two views, one screen tall.
// SCENE (building): the PARTS, the ADD grid and the part SELECTED (its editing) on the left; the viewport (toaster-view.js, made once and
// kept) across all the rest, with Crumpet's bar under it. Nothing of the render is in sight.
// RENDER (rendering): no viewport in sight. On the left "In the frame": the parts, and under them the selected part's SHEET (its @tag, what it
// is, its pictures). In the middle the studio: a big picture (the render, or the clay as the chosen camera sees it), what it is, the scene,
// the references and the prompt as pills, and the keys that toast it or improve its words. On the right the CAMERA to render from (the slots
// kept in the Scene), the TURNAROUND (four clay views, rendered as one sheet) and the 3D MODEL made from it on Comfy Cloud.
// The parts and the scene are called by @tags in the words (pills.js), as on the Stage. The right column draws itself on "toaster-runs", so
// a render's progress never redraws a field in use.
import { h, icon, sprite } from "../dom.js";
import { onChange, toast, useStageRender, makeToasterRef } from "../store.js";
import { currentPage } from "../router.js";
import { dropdown, float } from "../controls.js";
import { view as viewImage } from "../viewer.js";
import { pillField } from "../pills.js";
import { mentionAt, putMention } from "../mentions.js";
import { peek, unpeek } from "../peek.js";
import {
  toaster, describeParts, body, partsNow, selectedParts, sync, loadDrafts, pick, select, selectAll,
  setTool, toggleSnap, addPart, addPiece, addCharacter, reposeCharacter, setProps, colourAllByKind, applyTransforms, removeSelected, removePart, duplicateSelected, mirrorSelected, dropSelected,
  toggleHidden, undoParts, redoParts, canUndo, canRedo, setWords, setRatio, setModel, keepCamera, setFocal, saveCamera, recallCamera, onCamera, removeCamera, renameCamera, loadModels, modelNow, hasClay,
  renderFrame, renderSheet, forget, showRender, setCompare, price3d, priceNow, make3d, putOnStage, isArmed, arm, disarm, toggleMap,
  setMode, addPartRef, removePartRef, addSceneRef, removeSceneRef, setPrompt, framePlan, improveWords,
} from "../toaster.js";
import { SHAPES, PALETTE, RATIOS, MAPS, POSE_SLIDERS, roundLabel, hasSides, colorName, shapeOf, tagsOf, describeOf, isAsset, isCharacter } from "../toaster-model.js";
import { CRUMPET } from "../toaster-harness.js";
import { projectBar, drawProjectBar } from "./toaster-projects.js";

let shell = null;
// the slot Crumpet's bar docks in: the same element every time the page is built, so the bar goes with it
let chatSlot = null;
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

// the switch of the project bar, made once with the bar (it keeps the keys of the page it was made for)
let modesEl = null;
const MODES = [["scene", "view-persp", "Scene", "the viewport in the middle: block out, place, aim"], ["render", "scene-render", "Render", "the render studio: say what it is, add pictures, toast it"]];

function build(el) {
  const s = {};
  s.parts = h("div.ts-parts", { role: "tree", "aria-label": "Parts", dataset: { scrollKey: "ts-parts" } });
  s.partsCount = h("span.ts-count");
  s.add = h("div.ts-add", { role: "group", "aria-label": "Add a shape" }, ...SHAPES.map((sh) =>
    h("button.ts-tile", { type: "button", title: `Add a ${sh.name.toLowerCase()}`, "aria-label": `Add a ${sh.name.toLowerCase()}`, on: { click: () => addPart(sh.id) } }, sprite(`shape-${sh.id}`))));
  // the Stage's library: every piece it stages (furniture, objects, food, vehicles…), in a drawer over the viewport
  s.libraryKey = h("button.ts-library-key", { type: "button", "aria-pressed": "false", title: "The Stage's library: furniture, objects, food, products, vehicles, creatures — L", on: { click: () => openDrawer("library") } },
    sprite("asset-library"), h("span", {}, "Library"), h("em.ts-library-count"));
  s.peopleKey = h("button.ts-library-key", { type: "button", "aria-pressed": "false", title: "The Stage's characters: men, women, children, your own rigged ones, the animals — C", on: { click: () => openDrawer("characters") } },
    sprite("character-add"), h("span", {}, "Characters"));
  s.inspector = h("div.ts-inspector");
  s.addCard = h("section.ts-card", {}, h("header.ts-head", {}, h("h2.ts-label", {}, "Add")), s.add, h("div.ts-add-keys", {}, s.libraryKey, s.peopleKey));
  s.selectedCard = h("section.ts-card.ts-selected", {}, h("header.ts-head", {}, h("h2.ts-label", {}, "Selected")), s.inspector);
  s.left = h("aside.ts-col.ts-left", { "aria-label": "The scene" },
    h("div.ts-id", {}, h("img", { src: CRUMPET.face, alt: "", draggable: false }), h("div.ts-id-text", {}, h("b", {}, CRUMPET.name), h("span", {}, CRUMPET.tag))),
    h("section.ts-card.ts-parts-card", {}, h("header.ts-head", {}, s.partsLabel = h("h2.ts-label", {}, "Parts"), s.partsCount, h("span.spacer"),
      h("button.ts-iconkey.is-sm", { type: "button", title: "Colour by kind — the colour ID: each kind of thing its family of colours, each type its shade, people each their own (shapes keep theirs)", "aria-label": "Colour by kind", on: { click: async () => (await assetsModule(), colourAllByKind(pieceOf)) } }, sprite("channel-id"))), s.parts),
    s.addCard, s.selectedCard);
  // pictures dropped or pasted on the part's card go on its sheet
  const sheetFiles = (files) => {
    const one = selectedParts();
    if (one.length === 1 && toaster.mode === "render") addSheetPictures(one[0], files);
  };
  dropFiles(s.selectedCard, sheetFiles);

  // the viewport: the canvas, the frame over it, the view keys and the tools
  s.stage = h("div.ts-stage");
  s.frame = h("div.ctl-frame.ts-frame", { "aria-hidden": "true" }, ...["tl", "tr", "bl", "br"].map((c) => h(`i.c.${c}`)));
  s.views = h("div.ts-views", { role: "toolbar", "aria-label": "Views" });
  s.tools = h("div.ctl-tools.ts-tools", { role: "toolbar", "aria-label": "Tools" });
  s.boot = h("p.ts-boot", {}, "Warming up the toaster…");
  s.notice = h("div.ts-notice", { hidden: true, role: "alert" });
  s.library = h("div.ts-library", { hidden: true, role: "dialog", "aria-label": "The Stage's library" });
  s.cams = h("div.ts-cams", { role: "toolbar", "aria-label": "Cameras" });
  s.viewport = h("section.ts-view", { "aria-label": "Viewport" }, s.stage, s.frame, s.views, s.cams, s.tools, s.boot, s.library, s.notice);
  // Crumpet's bar docks here, under the middle (app.js moves the one bar of the app into it)
  chatSlot ??= h("div.ts-chat", { id: "toaster-chat" });
  s.mid = h("div.ts-mid");

  // the compact render card of the scene: the picture (drawn again as it comes), Toast it and the way to the studio
  s.cameraCard = h("section.ts-card.ts-camera-card", { "aria-label": "Camera" });
  s.mapsCard = h("section.ts-card.ts-maps-card", { "aria-label": "Control maps" });
  s.sheet = h("section.ts-card.ts-sheet", { "aria-label": "Turnaround" });
  s.model = h("section.ts-card.ts-model", { "aria-label": "3D model" });
  s.right = h("aside.ts-col.ts-right", { "aria-label": "Toasted" });
  buildStudio(s);

  modesEl ??= h("div.ts-modes", { role: "group", "aria-label": "Page" }, ...MODES.map(([id, glyph, label, about]) =>
    h("button.ts-mode", { type: "button", dataset: { mode: id }, title: `${label}: ${about} — T`, on: { click: () => setMode(id) } }, sprite(glyph), h("span", {}, label))));
  s.modes = modesEl;

  s.root = h("div.toaster", {}, s.left, s.mid, s.right);
  // a field left: what waited while it was in use is drawn now
  s.root.addEventListener("focusout", (e) => !s.root.contains(e.relatedTarget) && setTimeout(() => (drawLeft(), drawLook()), 0));
  el.replaceChildren(projectBar([s.modes]), s.root);
  shell = s;
  layout();
  mountView();
  document.dispatchEvent(new Event("toaster:drawn"));
}

/**
 * One mode at a time (the nodes are moved, never made again: the viewport keeps its canvas). The scene: two areas, the parts, Add and the
 * part's editing on the left, the viewport across the rest with Crumpet's bar under it. The render: the parts as "In the frame" with the
 * selected part's sheet on the left, the studio in the middle, the camera, the turnaround and the 3D model on the right; the viewport is
 * kept hidden (its stills draw through their own lens and size, and it measures itself again when the scene comes back).
 */
function layout() {
  const s = shell;
  const render = toaster.mode === "render";
  s.laid = toaster.mode;
  s.root.classList.toggle("is-render", render);
  s.root.classList.toggle("is-scene", !render);
  s.addCard.hidden = render;
  s.partsLabel.textContent = render ? "In the frame" : "Parts";
  if (render) {
    if (drawer) openDrawer(null);
    s.mid.replaceChildren(s.studio, chatSlot);
    // (the viewport stays in the page, hidden: the stills are drawn through their own lens and size)
    s.right.replaceChildren(s.cameraCard, s.mapsCard, s.sheet, s.model, s.viewport);
    s.root.replaceChildren(s.left, s.mid, s.right);
  } else {
    s.mid.replaceChildren(s.viewport, chatSlot);
    s.root.replaceChildren(s.left, s.mid);
  }
  for (const b of s.modes.children) b.setAttribute("aria-pressed", String(b.dataset.mode === toaster.mode));
}
/** The viewport, made once (three.js loads with it): it tells the page what is clicked and moved, the page tells it the draft. */
function mountView() {
  mounting ??= import("../toaster-view.js").then(({ ToasterView }) => {
    const v = new ToasterView(shell.stage, shell.frame, {
      onPick: (id, { shift } = {}) => pick(id, { shift }),
      onChange: (changes) => applyTransforms(changes),
      onDrag: (changes) => liveNumbers(changes),
      onPose: (id, { joints }) => reposeCharacter(id, { joints }, measure),
      onJoint: () => drawInspector(),
      onCamera: () => {
        lastView = null;
        drawViews();
        drawCameras();
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

let renaming = null;

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
  unpeek();
  shell.partsCount.textContent = parts.length ? String(parts.length) : "";
  if (!parts.length) return shell.parts.replaceChildren(h("p.ts-empty", {}, "Add a shape below to start blocking out."));
  const tags = tagsOf(parts, body().refs.map((r) => r.name));
  shell.parts.replaceChildren(...parts.map((p) => {
    const on = toaster.selected.includes(p.id);
    const first = p.refs?.[0];
    const row = h(`div.ts-part${on ? ".is-on" : ""}${p.hidden ? ".is-hidden" : ""}`, {
      role: "treeitem", "aria-selected": String(on), tabindex: "0", dataset: { focusKey: p.id },
      on: { click: (e) => pick(p.id, { shift: e.shiftKey || e.ctrlKey || e.metaKey }), dblclick: () => ((renaming = p.id), drawParts()) },
    },
      p.shape === "asset" ? h("span.ts-glyph", { title: "A piece of the Stage's library" }, sprite(pieceOf(p.asset)?.icon ?? "asset-library"))
        : p.shape === "character" ? h("span.ts-glyph", { title: "A character" }, sprite(p.rig ? "character-import" : `body-${p.body}`))
        : h("span.ts-glyph", { title: shapeOf(p.shape).name }, sprite(`shape-${p.shape}`)),
      h("span.ts-marks", {}, h("span.ts-chip", { style: { background: p.color }, title: colorName(p.color) }),
        first ? h("span.ts-mini-pic", { title: `${p.refs.length} picture${p.refs.length > 1 ? "s" : ""} on its sheet` }, h("img", { src: first.url, alt: "", draggable: false }), p.refs.length > 1 ? h("i", {}, String(p.refs.length)) : null) : null),
      renaming === p.id ? nameField(p.name, (v) => setProps({ name: v }, { ids: [p.id] })) : toaster.mode === "render"
        ? h("span.ts-name", { title: "Double-click to rename" }, p.name, tags.has(p.id) ? h("code.ts-at-mini", {}, `@${tags.get(p.id)}`) : null)
        : h("span.ts-name", { title: "Double-click to rename" }, p.name),
      h("button.ts-mini", { type: "button", "aria-pressed": String(!!p.hidden), title: p.hidden ? "Show" : "Hide", "aria-label": p.hidden ? `Show ${p.name}` : `Hide ${p.name}`, on: { click: (e) => (e.stopPropagation(), toggleHidden(p.id)) } }, sprite("eye")),
      h("button.ts-mini", { type: "button", title: "Remove", "aria-label": `Remove ${p.name}`, on: { click: (e) => (e.stopPropagation(), removePart(p.id)) } }, icon("trash")));
    // a part with a sheet shows it on hover
    if (p.made || p.refs?.length) {
      row.addEventListener("pointerenter", () => peek(`part:${p.id}`, { title: p.name, color: p.color, pictures: p.refs, words: p.made, note: tags.has(p.id) ? `@${tags.get(p.id)}` : "" }, row));
      row.addEventListener("pointerleave", unpeek);
    }
    return row;
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

// ---------------------------------------------------------------- pictures: from a file, from a drop or a paste, from the Library

const MOST_PICTURES = 6;
const IMAGE_TYPES = "image/png,image/jpeg,image/webp";
const isImage = (f) => f.type?.startsWith("image/");

/** The pictures of some files, kept in the Library (named `name`): their photos, in order. A file that fails says so. */
async function keepFiles(files, name) {
  const out = [];
  for (const file of [...(files ?? [])].filter(isImage)) {
    try {
      const res = await fetch(`api/photos?name=${encodeURIComponent(typeof name === "function" ? name(file) : name)}`, { method: "POST", headers: { "Content-Type": file.type }, body: file });
      const photo = await res.json();
      if (!res.ok) throw new Error(photo.error ?? "That picture was not kept.");
      out.push(photo);
    } catch (e) {
      toast(e.message, { tone: "crit" });
    }
  }
  return out;
}
/** The file dialog, for some pictures. */
function pickFiles(done) {
  const input = h("input", { type: "file", accept: IMAGE_TYPES, multiple: true, hidden: true });
  input.addEventListener("change", () => (done(input.files), input.remove()));
  document.body.append(input);
  input.click();
}
/** Image files dropped or pasted on `el` go to `done` (a drop is shown with the card lit). */
function dropFiles(el, done) {
  const files = (e) => [...(e.dataTransfer?.files ?? e.clipboardData?.files ?? [])].filter(isImage);
  el.addEventListener("dragover", (e) => [...(e.dataTransfer?.types ?? [])].includes("Files") && (e.preventDefault(), el.classList.add("is-dropping")));
  el.addEventListener("dragleave", (e) => !el.contains(e.relatedTarget) && el.classList.remove("is-dropping"));
  el.addEventListener("drop", (e) => (el.classList.remove("is-dropping"), files(e).length && (e.preventDefault(), done(files(e)))));
  el.addEventListener("paste", (e) => files(e).length && (e.preventDefault(), done(files(e))), true);
}
const stem = (file) => String(file.name ?? "").replace(/\.\w+$/, "").trim() || "reference";
async function addSheetPictures(part, files) {
  for (const photo of await keepFiles(files, `${part.name} sheet`)) addPartRef(part.id, photo);
}
async function addReferences(files) {
  for (const photo of await keepFiles(files, stem)) addSceneRef(photo);
}

// the Library's pictures, read when a picker opens; each picker keeps its search while it is shut
let photosCache = null;
const libraries = { part: { open: false, query: "" }, scene: { open: false, query: "" } };
async function loadPhotos(then) {
  try {
    photosCache = await (await fetch("api/photos")).json();
  } catch {
    photosCache = [];
  }
  then();
}
/** The key that opens a Library picker (pressed while it is open). */
function libraryKey(which, label, redraw) {
  return h("button.ts-iconkey.is-sm", { type: "button", "aria-pressed": String(libraries[which].open), title: label, "aria-label": label, on: { click: () => {
    libraries[which].open = !libraries[which].open;
    if (libraries[which].open) photosCache = null;
    redraw();
  } } }, sprite("image-library"));
}
/** A small searchable grid of the Library's pictures: lit while on the sheet (or the render), a click puts one on or takes it off. */
function libraryPane(which, { has, toggle }) {
  const st = libraries[which];
  const grid = h("div.ts-lib-photos", { dataset: { scrollKey: `ts-photos-${which}` } });
  const fill = () => {
    const on = has();
    const list = (photosCache ?? []).filter((p) => !st.query || `${p.name ?? ""} ${p.file}`.toLowerCase().includes(st.query.toLowerCase())).slice(0, 150);
    grid.replaceChildren(...(!photosCache ? [h("p.ts-empty", {}, "…")] : list.length ? list.map((p) =>
      h("button.ts-lib-photo", { type: "button", "aria-pressed": String(on.has(p.file)), title: on.has(p.file) ? `${p.name ?? p.file} — on it` : (p.name ?? p.file), on: { click: () => toggle(p) } },
        h("img", { src: p.url, alt: "", loading: "lazy", draggable: false }))) : [h("p.ts-empty", {}, st.query ? "Nothing by that name." : "The Library is empty.")]));
  };
  const search = h("label.ts-lib-search", {}, icon("search"), h("input", { type: "search", value: st.query, placeholder: "Search the Library…", "aria-label": "Search the Library", autocomplete: "off",
    on: { input: (e) => ((st.query = e.target.value), fill()), keydown: (e) => e.stopPropagation() } }));
  fill();
  if (!photosCache) loadPhotos(fill);
  return h("div.ts-sheet-lib", {}, search, grid);
}
/** A picture of a sheet or of the render: it opens full size; the cross takes it off; its caption (an @name) is under it. */
const pictureTile = (r, off, caption) => h("div.ts-pic-tile", {},
  h("button.ts-pic-look", { type: "button", title: "Look at it, full size", "aria-label": "Look at it, full size", on: { click: () => viewImage(r.url) } },
    h("img", { src: r.url, alt: "", draggable: false, ...(r.width && r.height ? { style: { aspectRatio: `${r.width} / ${r.height}` } } : {}) })),
  h("button.ts-pic-off", { type: "button", title: "Take it off", "aria-label": "Take it off", on: { click: off } }, icon("close")),
  caption ? h("code", {}, `@${caption}`) : null);
/**
 * The tile that adds pictures: it asks where from — a file on the computer, the Library, or made here in the Oven (what it makes
 * comes back on its own). Files dropped or pasted on the card are taken too.
 */
let addMenu = null;
const closeAddMenu = () => (addMenu?.remove(), (addMenu = null));
function addTile(label, { files, library, make }) {
  const tile = h("button.ts-pic-add", { type: "button", title: label, "aria-label": label, "aria-haspopup": "menu", on: { click: () => {
    if (addMenu?.dataset.for === label) return closeAddMenu();
    closeAddMenu();
    const choice = (glyph, words, run) => h("button", { type: "button", role: "menuitem", on: { click: () => (closeAddMenu(), run()) } }, sprite(glyph), h("span", {}, words));
    addMenu = h("div.menu.ts-add-menu", { role: "menu", dataset: { for: label } },
      choice("image-upload", "From your computer", () => pickFiles(files)),
      choice("image-library", "From the Library", library),
      choice("image-generate", "Make it in the Oven", make));
    document.body.append(addMenu);
    float(addMenu, tile.getBoundingClientRect(), 240);
    addMenu.querySelector("button")?.focus();
  } } }, sprite("image-upload"));
  return tile;
}
document.addEventListener("pointerdown", (e) => addMenu && !addMenu.contains(e.target) && !e.target.closest?.(".ts-pic-add") && closeAddMenu(), true);
document.addEventListener("keydown", (e) => addMenu && e.key === "Escape" && (e.stopPropagation(), closeAddMenu()), true);
/** The Library's picker of a sheet (or of the references) opened, its pictures read again. */
const openLibrary = (which, redraw) => () => ((libraries[which].open = true), (photosCache = null), redraw());

// ---------------------------------------------------------------- Selected: the part, and its sheet

const WORDS_FOR = {
  piece: "Material, colour, make: a walnut mid-century desk with brass handles",
  character: "Age, face, hair, clothes: a woman in her thirties, curly red hair, a navy striped shirt",
  shape: "brushed chrome, walnut, enamel…",
};
function drawInspector() {
  const sel = selectedParts();
  const sheetOnly = toaster.mode === "render";
  if (!sel.length) return shell.inspector.replaceChildren(h("p.ts-empty", {}, sheetOnly ? "Click a part in the list to write what it is and add its pictures." : "Click a part in the viewport or in the list. Shift adds to the selection."));
  const p = sel[0];
  const many = sel.length > 1;
  const swatches = h("div.ts-swatches", { role: "group", "aria-label": "Colour" }, ...PALETTE.map(([hex, name]) =>
    h("button.ts-swatch", { type: "button", style: { background: hex }, title: name, "aria-label": name, "aria-pressed": String(sel.every((x) => x.color === hex)), on: { click: () => setProps({ color: hex }) } })));
  // what it is: the part's words, which go to the render with its @tag
  const made = h("textarea.ts-field.ts-words", { rows: 3, maxLength: 400, placeholder: WORDS_FOR[isCharacter(p) ? "character" : isAsset(p) ? "piece" : "shape"], "aria-label": "What it is", on: { change: (e) => setProps({ made: e.target.value.trim() }) } });
  made.value = many && !sel.every((x) => x.made === p.made) ? "" : p.made;
  const tag = tagsOf(partsNow(), body().refs.map((r) => r.name)).get(p.id);
  const rows = [
    many ? h("p.ts-many", {}, `${sel.length} parts`) : h("div.ts-row", {}, h("span.ts-label", {}, "Name"),
      h("div.ts-name-in", {}, h("input.ts-field", { type: "text", maxLength: 40, value: p.name, "aria-label": "Name", on: { change: (e) => e.target.value.trim() && setProps({ name: e.target.value.trim() }), keydown: (e) => e.key === "Enter" && e.target.blur() } }),
        tag ? h("code.ts-at", { title: `Its @tag: call it by this name in the words, and its sheet goes with it` }, `@${tag}`) : null)),
    h("label.ts-stack", {}, h("span.ts-label", {}, "What it is"), made),
  ];
  if (sheetOnly) {
    if (!many) rows.push(sheetPictures(p));
    return shell.inspector.replaceChildren(...rows);
  }
  rows.push(swatches);
  if (!many) {
    rows.push(triple("Size", "size", p.size, { step: 0.05, min: 0.01 }), triple("Move", "pos", p.pos, { step: 0.05 }), triple("Turn", "rot", p.rot, { step: 5, unit: "°" }));
    if (p.shape === "character") rows.push(...posePicker(p));
    const label = roundLabel(p.shape);
    if (label) rows.push(slider(label, p.round ?? 0, 0, 1, 0.01, (v) => setProps({ round: v }, { coalesce: "round" }), (v) => fixed(v)));
    if (hasSides(p.shape)) rows.push(slider("Sides", p.sides ?? 32, 3, 64, 1, (v) => setProps({ sides: v }, { coalesce: "sides" }), (v) => String(v)));
  }
  shell.inspector.replaceChildren(...rows);
}

/** A part's pictures: its tiles, a tile to add more (a file, a drop, a paste), and a key for the Library. */
function sheetPictures(p) {
  const refs = p.refs ?? [];
  const full = refs.length >= MOST_PICTURES;
  const add = (files) => (full ? toast(`A sheet holds ${MOST_PICTURES} pictures.`) : addSheetPictures(p, files));
  const box = h("div.ts-sheet-box", {},
    h("div.ts-row-head", {}, h("span.ts-label", {}, "Pictures"), h("span.ts-count", {}, refs.length ? `${refs.length}/${MOST_PICTURES}` : ""), h("span.spacer"), libraryKey("part", "From the Library", drawInspector)),
    h("div.ts-pics", {}, ...refs.map((r) => pictureTile(r, () => removePartRef(p.id, r.file))), full ? null : addTile("Add pictures — or drop or paste them here", {
      files: add,
      library: openLibrary("part", drawInspector),
      make: () => makeToasterRef({ kind: "part", draftId: toaster.draft?.id, partId: p.id, name: p.name, words: describeOf(p, pieceOf), character: isCharacter(p) }),
    })));
  if (libraries.part.open) {
    box.append(libraryPane("part", {
      has: () => new Set((body()?.parts.find((x) => x.id === p.id)?.refs ?? []).map((r) => r.file)),
      toggle: (photo) => (refs.some((r) => r.file === photo.file) ? removePartRef(p.id, photo.file) : full ? toast(`A sheet holds ${MOST_PICTURES} pictures.`) : addPartRef(p.id, photo)),
    }));
  }
  return box;
}

/** A character's pose, from the Stage's poses by kind; the figure keeps how it was stretched and its feet stay on the floor. */
/** A figure's own box in a pose, with its tweaks and joints (for the part to keep how it is stretched when it is posed again). */
let measureNow = null;
const measure = (q) => measureNow?.({ body: q.body, rig: q.rig, pose: q.pose, params: q.params, joints: q.joints }) ?? q.size;

/**
 * A character's pose: the Stage's presets by kind, then the tweaks laid over it (the Stage's twelve sliders, folded away until opened),
 * the joints mode (turn a joint in the viewport, drag a hand or a foot), and a key that takes the tweaks and the joints back.
 */
let tweaksOpen = false;
function posePicker(p) {
  const poses = people?.poses ?? [{ id: p.pose, name: p.pose, category: "" }];
  const choose = async (pose) => {
    if (pose === p.pose) return;
    await assetsModule();
    reposeCharacter(p.id, { pose }, measure);
  };
  const tweaked = Object.keys(p.params ?? {}).length + (p.joints ? 1 : 0);
  const jointsOn = toaster.poseMode === p.id;
  const keys = h("div.ts-pose-keys", {},
    h("button.ts-map", { type: "button", "aria-pressed": String(tweaksOpen), title: "Tweak the pose: sliders laid over it (where the head looks, the lean, the arms…)", on: { click: () => ((tweaksOpen = !tweaksOpen), drawInspector()) } }, sprite("pose-rest"), h("span", {}, tweaked ? `Tweak · ${Object.keys(p.params ?? {}).length}` : "Tweak")),
    h("button.ts-map", { type: "button", "aria-pressed": String(jointsOn), title: "Joints — J: click a joint in the viewport and turn it, or drag a hand or a foot", on: { click: () => setPoseMode(jointsOn ? null : p.id) } }, sprite("channel-pose"), h("span", {}, p.joints ? "Joints ·" : "Joints")),
    h("button.ts-iconkey.is-sm", { type: "button", title: "Back to the preset: no tweaks, no joints turned by hand", "aria-label": "Back to the preset", disabled: !tweaked, on: { click: async () => (await assetsModule(), reposeCharacter(p.id, { params: Object.fromEntries(Object.keys(p.params ?? {}).map((k) => [k, 0])), joints: undefined }, measure)) } }, icon("remix")));
  const rows = [
    h("div.ts-row", {}, h("span.ts-label", {}, "Pose"),
      h("div.ts-pick.ts-pose", {}, dropdown({ label: "Pose", value: p.pose, items: poses.map((x) => ({ value: x.id, label: x.name, group: x.category })), onChange: choose }))),
    keys,
  ];
  if (jointsOn) rows.push(h("p.ts-hint-line", {}, toaster.view?.pickedJoint?.() ? `${toaster.view.pickedJoint().replace(/([a-z])([A-Z])/g, "$1 $2")}: turn it with the gizmo — Esc lets it go` : "Click a joint on the figure: a hand or a foot moves, the others turn"));
  if (tweaksOpen) rows.push(h("div.ts-tweaks", {}, ...POSE_SLIDERS.map(([k, label, lo, hi]) => {
    const v = p.params?.[k] ?? 0;
    const out = h("output.ts-readout", {}, k === "crouch" ? v.toFixed(2) : `${Math.round(v)}°`);
    return h("label.ts-tweak", { title: `${label}: double-click to take it back to 0`, on: { dblclick: () => reposeCharacter(p.id, { params: { [k]: 0 } }, measure) } }, h("span", {}, label),
      h("input", { type: "range", min: lo, max: hi, step: k === "crouch" ? 0.01 : 1, value: v, "aria-label": label, on: { input: (e) => {
        const n = Number(e.target.value);
        out.textContent = k === "crouch" ? n.toFixed(2) : `${Math.round(n)}°`;
        reposeCharacter(p.id, { params: { [k]: n } }, measure, { coalesce: `tweak-${p.id}-${k}` });
      } } }), out);
  })));
  return rows;
}

/** The joints mode on a character (or off): the viewport shows its joints to turn and its hands and feet to drag. */
function setPoseMode(id) {
  toaster.poseMode = id;
  toaster.view?.setPoseMode?.(id);
  drawInspector();
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
  drawParts();
  drawInspector();
}

// ---------------------------------------------------------------- the Stage's library and its characters

// the pieces and the characters (toaster-assets.js, with the Stage's own models and mannequins), once read; the drawer shows one or the
// other, and its search and category are kept while it is shut
let library = null;
let people = null;
let drawer = null;
let pieceQuery = "";
let pieceGroup = "All";
let assets = null;
const pieceOf = (type) => library?.pieces.find((x) => x.type === type) ?? null;
toaster.pieceOf = pieceOf;
/** The library module, loaded on first need (it brings three.js and the Stage's models with it). */
function assetsModule() {
  assets ??= import("../toaster-assets.js").then((m) => {
    measureNow = m.characterSize;
    const got = (lib) => {
      library = lib;
      people = m.characterList?.() ?? null;
      drawCounts();
      if (drawer) drawDrawer();
      describeParts(pieceOf);
      drawParts();
      drawInspector();
    };
    m.onLibrary?.(got);
    m.loadLibrary().then(got).catch((e) => console.warn("toaster: the library did not load:", e.message));
    return m;
  });
  return assets;
}
function drawCounts() {
  const em = shell?.libraryKey.querySelector(".ts-library-count");
  if (em) em.textContent = library ? String(library.pieces.filter((x) => !x.animal).length) : "";
}

/** Opens the drawer on the library or the characters (`mode`), or shuts it (null); a key pressed again shuts it. */
export function openDrawer(mode) {
  if (!shell) return;
  drawer = mode && drawer !== mode ? mode : null;
  shell.libraryKey.setAttribute("aria-pressed", String(drawer === "library"));
  shell.peopleKey.setAttribute("aria-pressed", String(drawer === "characters"));
  shell.library.hidden = !drawer;
  if (!drawer) return;
  assetsModule();
  drawDrawer();
  if (drawer === "library") requestAnimationFrame(() => shell.library.querySelector(".ts-lib-search input")?.focus());
}
const drawDrawer = () => (drawer === "characters" ? drawCharacters() : drawLibrary());

// a thumbnail is drawn when its tile scrolls into view, so the long library opens at once
const thumbs = new IntersectionObserver((seen) => {
  for (const e of seen) {
    if (!e.isIntersecting) continue;
    thumbs.unobserve(e.target);
    const { type, body, rig } = e.target.dataset;
    assets?.then((m) => (e.target.src = type ? m.assetThumb(type) : m.characterThumb({ body, rig })));
  }
}, { rootMargin: "200px" });
const thumb = (data) => {
  const img = h("img", { alt: "", draggable: false, dataset: data });
  thumbs.observe(img);
  return img;
};
const drawerHead = (label, count) => h("header.ts-lib-head", {}, h("h2.ts-label", {}, label), h("span.ts-count", {}, count ?? ""), h("span.spacer"),
  h("button.ts-mini", { type: "button", title: "Close — Esc", "aria-label": "Close", on: { click: () => openDrawer(null) } }, icon("close")));
const pieceTile = (x) => h("button.ts-piece", { type: "button", title: x.themes?.length ? `${x.name} — ${x.themes.join(", ")}` : x.name, "aria-label": `Add ${x.name.toLowerCase()}`, on: { click: () => addPiece(x, pieceOf) } }, thumb({ type: x.type }), h("span", {}, x.name));

function drawLibrary() {
  const finds = (x) => {
    const hay = [x.name, x.type, x.category, ...(x.themes ?? []), ...(x.tags ?? [])].join(" ").toLowerCase().replace(/[-_]+/g, " ");
    return pieceQuery.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
  };
  const results = h("div.ts-lib-results", { dataset: { scrollKey: "ts-lib" } });
  // (the animals are with the characters, as on the Stage)
  const pieces = library?.pieces.filter((x) => !x.animal) ?? [];
  const fill = () => {
    if (!library) return results.replaceChildren(h("p.ts-empty", {}, "Bringing the Stage's pieces…"));
    const all = pieces.filter((x) => (pieceGroup === "All" || x.category === pieceGroup) && (!pieceQuery || finds(x)));
    const groups = [...new Set(all.map((x) => x.category))].map((c) => [c, all.filter((x) => x.category === c)]);
    results.replaceChildren(...groups.flatMap(([c, list]) => [h("span.ts-label.ts-lib-group", {}, c === "Mine" ? "Yours" : c), h("div.ts-lib-grid", {}, ...list.map(pieceTile))]));
    if (!groups.length) results.append(h("p.ts-empty", {}, pieceQuery ? `Nothing for "${pieceQuery}". Try a theme: kitchen, food, office, street, studio…` : "Nothing here."));
  };
  const cats = ["All", ...new Set(pieces.map((x) => x.category))];
  // the categories scroll sideways, the wheel too (a mouse has no sideways wheel); where they were scrolled to is kept
  const was = shell.library.querySelector(".ts-lib-cats")?.scrollLeft ?? 0;
  const chips = h("div.ts-lib-cats", { role: "group", "aria-label": "Category", on: { wheel: (e) => {
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || e.currentTarget.scrollWidth <= e.currentTarget.clientWidth) return;
    e.preventDefault();
    e.currentTarget.scrollLeft += e.deltaY;
  } } }, ...cats.map((c) =>
    h("button.ts-lib-cat", { type: "button", "aria-pressed": String(pieceGroup === c), on: { click: () => ((pieceGroup = c), drawLibrary()) } }, c === "Mine" ? "Yours" : c)));
  const search = h("label.ts-lib-search", {}, icon("search"),
    h("input", { type: "search", value: pieceQuery, placeholder: "Chair, kitchen, food, car…", "aria-label": "Search the library", autocomplete: "off", spellcheck: false,
      on: { input: (e) => ((pieceQuery = e.target.value), fill()), keydown: (e) => (e.stopPropagation(), e.key === "Escape" && (e.target.value ? ((e.target.value = ""), (pieceQuery = ""), fill()) : openDrawer(null))) } }));
  fill();
  shell.library.replaceChildren(drawerHead("Library", library ? String(pieces.length) : ""), search, chips, results);
  chips.scrollLeft = was;
}

/** The Stage's characters: the body types, the user's own rigged characters, and the library's animals; each one added standing. */
function drawCharacters() {
  const results = h("div.ts-lib-results", { dataset: { scrollKey: "ts-people" } });
  if (!people) results.append(h("p.ts-empty", {}, "Bringing the Stage's characters…"));
  else {
    const who = (x, data, label) => h("button.ts-piece.is-person", { type: "button", title: `Add ${label.toLowerCase()} — ${x.size[1].toFixed(2)} m`, "aria-label": `Add ${label.toLowerCase()}`, on: { click: () => addCharacter(x) } }, thumb(data), h("span", {}, label));
    results.append(h("span.ts-label.ts-lib-group", {}, "People"), h("div.ts-lib-grid", {}, ...people.people.map((x) => who(x, { body: x.body }, x.name))));
    const animals = library?.pieces.filter((x) => x.animal) ?? [];
    if (animals.length) results.append(h("span.ts-label.ts-lib-group", {}, "Animals"), h("div.ts-lib-grid", {}, ...animals.map(pieceTile)));
    results.append(h("span.ts-label.ts-lib-group", {}, "Yours"), people.rigs.length
      ? h("div.ts-lib-grid", {}, ...people.rigs.map((x) => who({ ...x, body: "man" }, { rig: x.rig, body: "man" }, x.name)))
      : h("p.ts-empty", {}, "Rigged characters brought into Kitchen's Stage show here."));
  }
  shell.library.replaceChildren(drawerHead("Characters"), results);
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

// ---------------------------------------------------------------- the cameras kept in slots

const LENSES = [18, 24, 35, 50, 85, 135];
let renamingCam = null;
/**
 * The cameras strip, at the viewport's top right: the lens, a tile for each camera kept (its picture; lit while the camera is on it; a
 * click goes back to it to the pixel, with its frame and lens), and the key that keeps the camera as it is now.
 */
function drawCameras() {
  if (!shell || !body()) return;
  const b = body();
  if (toaster.mode === "render") return drawCameraCard();
  const focal = toaster.view?.focal ?? b.camera?.focal ?? 50;
  const lens = dropdown({ label: "Lens", value: focal, items: [...new Set([...LENSES, focal])].sort((x, y) => x - y).map((mm) => ({ value: mm, label: `${mm} mm`, desc: mm <= 24 ? "wide: a room" : mm <= 35 ? "a little wide" : mm <= 50 ? "natural" : "long: an object, a face" })), onChange: (mm) => setFocal(mm) });
  const tiles = b.cameras.map((k) => {
    const on = onCamera(k.id);
    const name = renamingCam === k.id
      ? h("input.ts-rename.ts-cam-rename", { value: k.name, maxLength: 30, "aria-label": "Name", on: {
        keydown: (e) => (e.stopPropagation(), e.key === "Enter" ? e.target.blur() : e.key === "Escape" && ((renamingCam = null), drawCameras())),
        blur: (e) => ((renamingCam = null), renameCamera(k.id, e.target.value), drawCameras()),
      } })
      : h("span.ts-cam-name", { title: "Double-click to rename", on: { dblclick: (e) => (e.stopPropagation(), (renamingCam = k.id), drawCameras(), requestAnimationFrame(() => shell.cams.querySelector(".ts-cam-rename")?.select())) } }, k.name);
    return h(`div.ts-cam${on ? ".is-on" : ""}`, {},
      h("button.ts-cam-pic", { type: "button", title: `${k.name} — ${k.focal} mm, ${k.ratio}: go back to it`, "aria-label": `Go to ${k.name}`, style: { aspectRatio: k.ratio.replace(":", " / ") }, on: { click: () => recallCamera(k.id) } },
        k.thumb ? h("img", { src: k.thumb, alt: "", draggable: false }) : sprite("scene-camera")),
      name,
      h("button.ts-cam-x.is-save", { type: "button", title: `Keep the camera as it is now in ${k.name}`, "aria-label": `Save over ${k.name}`, on: { click: () => saveCamera(k.name) } }, icon("download")),
      h("button.ts-cam-x.is-forget", { type: "button", title: `Forget ${k.name}`, "aria-label": `Forget ${k.name}`, on: { click: () => removeCamera(k.id) } }, icon("close")));
  });
  shell.cams.replaceChildren(
    h("div.ts-pick.ts-lens", {}, lens),
    ...tiles,
    h("button.ts-cam-add", { type: "button", title: "Keep this camera — its place, aim, lens and frame, to come back to it to the pixel", "aria-label": "Keep this camera", disabled: b.cameras.length >= 12, on: { click: () => saveCamera() } }, sprite("scene-camera"), icon("plus")));
}

/**
 * The render's camera: the slots kept in the Scene as picture tiles, and one more for the view as it was left when it is on no slot. A click
 * puts the camera there (the studio's clay follows); the lit tile is the camera the render will use. Cameras are made in the Scene.
 */
function drawCameraCard() {
  const b = body();
  const on = b.cameras.find((k) => onCamera(k.id));
  const tile = (name, thumb, lit, run, title) => h(`div.ts-cam${lit ? ".is-on" : ""}`, {},
    h("button.ts-cam-pic", { type: "button", title, "aria-label": title, "aria-pressed": String(lit), style: { aspectRatio: b.ratio.replace(":", " / ") }, on: { click: run } }, thumb ? h("img", { src: thumb, alt: "", draggable: false }) : sprite("scene-camera")),
    h("span.ts-cam-name", {}, name));
  const now = on ? null : stills.camera;
  shell.cameraCard.replaceChildren(
    h("header.ts-head", {}, h("h2.ts-label", {}, "Camera"), h("span.spacer"), h("span.ts-note", {}, on ? on.name : "The view as you left it")),
    h("div.ts-cam-tiles", {},
      ...(!on ? [tile("Current view", now, true, () => {}, "The view as you left it in the Scene: the render will use it")] : []),
      ...b.cameras.map((k) => tile(k.name, k.thumb, on === k, () => recallCamera(k.id), `${k.name} — ${k.focal} mm, ${k.ratio}: render from it`))),
    ...(b.cameras.length ? [] : [h("p.ts-empty", {}, "Keep cameras in the Scene: they show here to pick from.")]));
}

/**
 * The control maps, as the camera sees the clay now (the Stage's channels): the colour ID, the depth and the silhouette, each a picture; a
 * click shows it big in the studio (again: back to the clay or the render), and its key says whether it goes with the frame (and changes it).
 */
function drawMaps() {
  const b = body();
  if (!shell || !b || toaster.mode !== "render") return;
  const sent = MAPS.filter((m) => b.maps.includes(m.id)).length;
  shell.mapsCard.replaceChildren(
    h("header.ts-head", {}, h("h2.ts-label", {}, "Control maps"), h("span.spacer"), h("span.ts-note", {}, sent ? `${sent} sent with the frame` : "None sent")),
    h("div.ts-map-tiles", {}, ...MAPS.map((m) => {
      const on = b.maps.includes(m.id);
      return h(`div.ts-map-tile${mapShown === m.id ? ".is-shown" : ""}`, {},
        h("button.ts-map-pic", { type: "button", "aria-pressed": String(mapShown === m.id), style: { aspectRatio: b.ratio.replace(":", " / ") }, title: mapShown === m.id ? `Back to the ${b.renders.length ? "render" : "clay"}` : `${m.label}: show it big in the studio`, on: { click: () => showMap(mapShown === m.id ? null : m.id) } },
          stills[m.id] ? h("img", { src: stills[m.id], alt: "", draggable: false }) : sprite(MAP_ICON[m.id])),
        h("div.ts-map-foot", {}, h("span", {}, m.label),
          h("button.ts-map-send", { type: "button", "aria-pressed": String(on), title: on ? `${m.label} goes with the frame — click to leave it out` : `${m.label} is left out — click to send it with the frame`, on: { click: () => toggleMap(m.id) } }, on ? "Sent" : "Off")));
    })));
}
/** A control map shown big in the studio, or (null) the clay or the render again. */
function showMap(id) {
  mapShown = id;
  stills.big = null;
  if (id && toaster.view) {
    try {
      stills.big = toaster.view.frameStill({ long: 1200, channel: id });
    } catch {}
  }
  drawRender();
  drawMaps();
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

const MAP_ICON = { id: "channel-id", depth: "channel-depth", silhouette: "material-mask" };

// ---------------------------------------------------------------- the words: @tags as pills, and the list that opens on an @

const kindWord = (p) => (isCharacter(p) ? "character" : isAsset(p) ? "piece" : "shape");
/** What an @name stands for, to draw it as a pill and to peek at it: a part (its colour, its first picture, its sheet) or a reference picture. */
function lookupTag(name, withFrame = false) {
  const b = body();
  if (!b) return null;
  const tags = tagsOf(b.parts, b.refs.map((r) => r.name));
  const p = b.parts.find((x) => tags.get(x.id) === name);
  if (p) return { title: p.name, color: p.color, url: p.refs?.[0]?.url, pictures: p.refs, words: p.made, note: `@${name} · ${kindWord(p)}` };
  const r = b.refs.find((x) => x.name === name);
  if (r) return { title: `@${r.name}`, url: r.url, pictures: [r], note: "A reference picture for the whole render" };
  if (!withFrame) return null;
  if (name === "frame") return { title: "@frame", note: "The clay frame: the camera's view, the layout the render keeps" };
  const map = MAPS.find((m) => m.name === name);
  return map ? { title: `@${name}`, note: `${map.label}: ${map.says.replace(/^@[\w-]+ /, "it ")}` } : null;
}
/** Everything an @ can call: the parts first (their colour or first picture, their kind), then the scene's references. */
function tagItems() {
  const b = body();
  const tags = tagsOf(b.parts, b.refs.map((r) => r.name));
  return [
    ...b.parts.filter((p) => tags.has(p.id)).map((p) => ({ name: tags.get(p.id), url: p.refs?.[0]?.url, color: p.color, about: kindWord(p) })),
    ...b.refs.map((r) => ({ name: r.name, url: r.url, about: "reference" })),
  ];
}

let tagMenu = null;
function hideTags() {
  if (tagMenu) tagMenu.el.hidden = true;
  if (tagMenu) tagMenu.field = null;
}
function drawTagMenu() {
  const m = tagMenu;
  m.el.replaceChildren(...m.list.map((x, i) => h(`button.ts-tag-row${i === m.at ? ".is-active" : ""}`, { type: "button", role: "option", "aria-selected": String(i === m.at), on: { mousedown: (e) => (e.preventDefault(), chooseTag(x)) } },
    h("span.ts-tag-face", {}, x.url ? h("img", { src: x.url, alt: "", draggable: false }) : x.color ? h("i", { style: { background: x.color } }) : null),
    h("b", {}, `@${x.name}`), h("span", {}, x.about))));
  m.el.querySelector(".is-active")?.scrollIntoView({ block: "nearest" });
}
function showTags(field) {
  const at = mentionAt(field);
  const list = at ? tagItems().filter((x) => x.name.startsWith(at.query) || (at.query && x.name.includes(at.query))) : [];
  if (!list.length || (list.length === 1 && list[0].name === at.query)) return hideTags();
  tagMenu ??= { el: document.body.appendChild(h("div.ts-tags", { role: "listbox", "aria-label": "Tags", hidden: true })) };
  Object.assign(tagMenu, { field, list, at: 0 });
  tagMenu.el.hidden = false;
  drawTagMenu();
  const box = field.el.getBoundingClientRect();
  const room = tagMenu.el.getBoundingClientRect().height;
  const below = box.bottom + 6 + room < innerHeight - 8;
  tagMenu.el.style.left = `${Math.max(8, Math.min(box.left, innerWidth - tagMenu.el.offsetWidth - 8))}px`;
  tagMenu.el.style.top = `${Math.max(8, below ? box.bottom + 6 : box.top - room - 6)}px`;
}
function chooseTag(x) {
  const field = tagMenu?.field;
  hideTags();
  if (field) putMention(field, x.name);
}
/** The @ list on a pill field: typing an @ opens it; ↑ ↓ move in it, Enter or Tab or a click puts the tag in, Esc shuts it. */
function tagging(field) {
  field.addEventListener("input", () => showTags(field));
  field.addEventListener("blur", () => setTimeout(() => tagMenu?.field === field && hideTags(), 120));
  field.addEventListener("keydown", (e) => {
    if (!tagMenu || tagMenu.field !== field || tagMenu.el.hidden) return;
    const go = (d) => (e.preventDefault(), (tagMenu.at = (tagMenu.at + d + tagMenu.list.length) % tagMenu.list.length), drawTagMenu());
    if (e.key === "ArrowDown") go(1);
    else if (e.key === "ArrowUp") go(-1);
    else if (e.key === "Enter" || e.key === "Tab") (e.preventDefault(), e.stopPropagation(), chooseTag(tagMenu.list[tagMenu.at]));
    else if (e.key === "Escape") (e.stopPropagation(), hideTags());
  });
}

// ---------------------------------------------------------------- the studio: made once, its fields never made again

/** The studio's nodes: the head and the picture (drawn with the runs), the composer (the words, the pictures, who is in the frame, the prompt), the foot. */
function buildStudio(s) {
  const pills = (label, placeholder, className, lookup) => pillField({ label, placeholder, lookup, className: `ts-pills ${className}` });
  s.what = pills("What it is", "A boss's office: a walnut @desk, a leather chair, a window behind", "is-what", lookupTag);
  s.scene = pills("Scene", "Dusk, warm lamp light, a cinematic still", "is-scene", lookupTag);
  s.prompt = pills("Prompt", "The prompt", "is-prompt", (n) => lookupTag(n, true));
  for (const f of [s.what, s.scene, s.prompt]) tagging(f);
  s.what.addEventListener("input", () => (setWords("what", s.what.value), drawAuto()));
  s.scene.addEventListener("input", () => (setWords("scene", s.scene.value), drawAuto()));
  s.prompt.addEventListener("input", () => (setPrompt(s.prompt.value), drawPromptHead()));
  s.refsBox = h("div.ts-refs");
  s.promptHead = h("div.ts-prompt-head");
  s.studioHead = h("div.ts-studio-head");
  s.studioMain = h("div.ts-studio-main");
  s.sent = h("div.ts-sent", { hidden: true });
  s.foot = h("div.ts-foot");
  const labelled = (label, field) => h("div.ts-stack", {}, h("span.ts-label", {}, label), field.el);
  // the rows, each as tall as its content: what it is | the scene, the references on one row, the prompt
  s.compose = h("div.ts-compose", {},
    h("div.ts-words-row", {}, labelled("What it is", s.what), labelled("Scene", s.scene)),
    s.refsBox,
    // (the prompt sits in a box of its own: the box has the border and the room around the words, so the words fold at a whole line)
    h("div.ts-stack.ts-prompt", {}, s.promptHead, h("div.ts-prompt-box", { on: { click: (e) => e.target === e.currentTarget && s.prompt.focus() } }, s.prompt.el)));
  // pictures dropped or pasted on the composer are references for the whole render
  dropFiles(s.compose, (files) => addReferences(files));
  s.studio = h("section.ts-card.ts-studio", { "aria-label": "Render studio" }, s.studioHead, s.studioMain, s.sent, s.compose, s.foot);
}

/** A field's words, set only while it is not in use (what is typed is never drawn over). */
function setField(field, text) {
  if (document.activeElement !== field.el && field.value !== text) field.value = text;
}
/** The prompt as it stands: the automatic one, composed from the words, the legend and the sheets (dimmed), or the user's own, as written. */
function drawAuto() {
  if (toaster.mode !== "render" || !body()) return;
  const own = body().prompt.trim();
  if (!own) setField(shell.prompt, framePlan().auto);
}
let promptOpen = false;
function drawPromptHead() {
  const own = !!body().prompt.trim();
  shell.prompt.el.classList.toggle("is-auto", !own);
  shell.prompt.el.classList.toggle("is-open", promptOpen);
  shell.promptHead.replaceChildren(...[
    h("span.ts-label", {}, "Prompt"),
    h(`span.ts-badge${own ? ".is-own" : ""}`, { title: own ? "Your prompt: sent as written" : "Composed at render time from the words, the legend and the sheets" }, own ? "Yours" : "Auto"),
    own ? h("span.ts-note", {}, "Your prompt — sent as written") : null,
    h("span.spacer"),
    h("button.key.is-sm.ts-improve", { type: "button", disabled: toaster.improving || !hasClay(), title: "Improve — the writer rewrites the prompt from your words, the sheets and their pictures (a small writer call)", on: { click: improveWords } },
      sprite("prompt-enhance"), h("span", {}, toaster.improving ? "Improving…" : "Improve")),
    own ? keyIcon(icon("remix"), "Back to automatic", () => (setPrompt(""), drawLook()), { small: true }) : null,
    keyIcon(icon("chevron"), promptOpen ? "Show it short" : "Show it whole", () => ((promptOpen = !promptOpen), drawPromptHead()), { pressed: promptOpen, small: true }),
  ].filter(Boolean));
}

/** The composer drawn from the draft: the words, the references, who is in the frame, the prompt, and the foot. */
function drawLook() {
  const b = body();
  if (!b || !shell || toaster.mode !== "render") return;
  setField(shell.what, b.what);
  setField(shell.scene, b.scene);
  const plan = framePlan();
  setField(shell.prompt, plan.prompt);
  for (const f of [shell.what, shell.scene, shell.prompt]) f.refresh();
  drawPromptHead();

  // the references: pictures for the whole render (a style, a mood, a material, a place), each called by an @name
  const full = b.refs.length >= MOST_PICTURES;
  const refs = h("div.ts-refs-in", {}, h("div.ts-refs-row", {}, h("span.ts-label", {}, "References"), h("span.ts-count", {}, b.refs.length ? `${b.refs.length}/${MOST_PICTURES}` : ""),
    h("div.ts-pics", {}, ...b.refs.map((r) => pictureTile(r, () => removeSceneRef(r.name), r.name)), full ? null : addTile("Add reference pictures — or drop or paste them on the composer", {
      files: (files) => addReferences(files),
      library: openLibrary("scene", drawLook),
      make: () => makeToasterRef({ kind: "scene", draftId: toaster.draft?.id, name: "the look", words: [b.scene, b.what].map((t) => String(t ?? "").replace(/@[a-z0-9-]+/gi, "").trim()).filter(Boolean).join(". "), aspect: b.ratio }),
    })),
    libraryKey("scene", "From the Library", drawLook)));
  if (libraries.scene.open) {
    refs.append(libraryPane("scene", {
      has: () => new Set((body()?.refs ?? []).map((r) => r.file)),
      toggle: (photo) => (body().refs.some((r) => r.file === photo.file) ? removeSceneRef(body().refs.find((r) => r.file === photo.file).name) : addSceneRef(photo)),
    }));
  }
  shell.refsBox.replaceChildren(refs);

  drawFoot();
}

/** The foot of the studio: the control maps, the image model, the frame, Improve and Toast it. */
function drawFoot() {
  const b = body();
  if (!b || !shell || toaster.mode !== "render") return;
  const m = modelNow();
  const busy = b.renders.some((r) => r.status === "running");
  const models = modelItems();
  const maps = h("div.ts-map-keys", { role: "group", "aria-label": "Control maps" }, ...MAPS.map((x) =>
    h("button.ts-map", { type: "button", "aria-pressed": String(b.maps.includes(x.id)), title: `${x.label}: sent with the clay frame — ${x.says.replace(/^@[\w-]+ /, "it ")}`, on: { click: () => toggleMap(x.id) } }, sprite(MAP_ICON[x.id]), h("span", {}, x.label))));
  shell.foot.replaceChildren(
    maps, h("span.spacer"),
    models.length ? h("div.ts-pick", {}, dropdown({ label: "Image model", value: m?.id, items: models, onChange: setModel, width: "fit", note: "What renders the clay: a partner model's credits, or Comfy Cloud's GPU time" })) : h("span.ts-note", {}, "No image model yet"),
    h("div.ts-pick", {}, dropdown({ label: "Frame", value: b.ratio, items: Object.keys(RATIOS).map((r) => ({ value: r, label: r, glyph: () => sprite(r === "4:5" ? "ratio-3-4" : `ratio-${r.replace(":", "-")}`) })), onChange: setRatio })),
    toastKey(m, busy));
}
const toastKey = (m, busy) => h("button.key.is-primary.ts-toast", { type: "button", disabled: busy || !m || !hasClay(), title: "Render the frame: the clay is the layout, the words what it becomes", on: { click: renderFrame } },
  sprite("toast-it"), h("span", {}, busy ? "Toasting…" : "Toast it"), m ? h("em", {}, priceOf(m)) : null);

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

/** The keys of the render's head: keep the clay frame, compare, full size, start a shot, download, forget. */
function renderKeys(r, done) {
  return [
    keyIcon(sprite("image-upload"), "Keep the clay frame in the Library", keepClay, { disabled: !toaster.view || !hasClay(), small: true }),
    keyIcon(sprite("image-compare"), "Compare with the clay", () => setCompare(!toaster.compare), { pressed: toaster.compare, disabled: !done || !r.frame, small: true }),
    keyIcon(icon("expand"), "Look at it, full size", () => viewImage(r.photo.url), { disabled: !done, small: true }),
    keyIcon(icon("video"), "Start a shot from it", () => useStageRender(r.photo), { disabled: !done, small: true }),
    keyIcon(icon("download"), "Download", null, { href: r?.photo?.url, download: done ? fileName(toaster.draft?.name, r.photo.url) : undefined, disabled: !done, small: true }),
    keyIcon(icon("trash"), "Forget this render — it stays in the Library", () => forget("renders", r.id), { disabled: !r || r.status === "running", small: true }),
  ];
}

// the clay as the camera sees it now, drawn big a moment after it changes (the studio shows it until something is toasted)
let clayLive = null;
// the render's right column's pictures, drawn by the timer: the view as it is now, each control map small, and the one shown big
const stills = {};
let mapShown = null;
let sentOpen = false;
const needLive = () => toaster.mode === "render" && !body()?.renders.length;

/** The render shown, as large as the room allows (the picture is fitted whole), the earlier ones in a strip beside it. */
function drawRender() {
  const b = body();
  const renders = b.renders;
  const r = renders.find((x) => x.id === toaster.shown) ?? renders[0];
  const done = r?.status === "done";
  const studio = toaster.mode === "render";
  let picture;
  const map = studio && mapShown ? MAPS.find((m) => m.id === mapShown) : null;
  if (map) {
    picture = h("div.ts-pic.is-clay", {}, stills.big ? h("img.ts-map-big", { src: stills.big, alt: `The ${map.label} map`, draggable: false }) : h("span", {}, "…"),
      h("span.ts-tag.is-a", {}, `${map.label} — ${b.maps.includes(map.id) ? "sent with the frame" : "not sent"}`));
  } else if (!r) {
    picture = studio ? h("div.ts-pic.is-clay", {}, clayLive ? h("img.ts-clay-live", { src: clayLive, alt: "The clay frame, as Toaster sends it", draggable: false }) : h("span", {}, "Warming up the clay…"), h("span.ts-tag.is-a", {}, "Clay — what Toaster sends"))
      : h("div.ts-pic.is-empty", {}, sprite("toast-it"), h("span", {}, "Block it out, say what it is, and toast it."));
  } else if (r.status === "running") picture = h("div.ts-pic.is-running", {}, r.frame ? h("img.ts-under", { src: r.frame.url, alt: "", draggable: false }) : null, progress(r, "Toasting the frame"));
  else if (r.status === "failed") picture = h("div.ts-pic.is-failed", {}, icon("close"), h("span", {}, r.error ?? "That didn't work."));
  else if (toaster.compare && r.frame) picture = comparePic(r);
  else picture = h("button.ts-pic", { type: "button", title: "Look at it, full size", on: { click: () => viewImage(r.photo.url) } }, h("img", { src: r.photo.url, alt: "", draggable: false }));
  const strip = renders.length ? h("div.ts-strip", { role: "list", "aria-label": "Earlier renders", dataset: { scrollKey: "ts-strip" } }, ...renders.map((x) =>
    h(`button.ts-thumb${x.id === r?.id ? ".is-on" : ""}`, { type: "button", role: "listitem", title: x.status === "failed" ? x.error : "Show it, from its camera", on: { click: () => ((mapShown = null), drawMaps(), showRender(x.id)) } },
      x.photo ? h("img", { src: x.photo.url, alt: "", draggable: false, loading: "lazy" }) : x.status === "running" ? h("span.typing", {}, h("i"), h("i"), h("i")) : icon("close")))) : null;
  const ratio = RATIOS[r?.ratio] ?? RATIOS[b.ratio] ?? 1;
  const pictures = h("div.ts-render-body", {}, h("div.ts-pic-box", { style: { "--ratio": String(ratio) } }, picture), strip);
  shell.studioHead.replaceChildren(head("Render", renders, ...renderKeys(r, done),
    keyIcon(sprite("file"), "What was sent — the prompt and the pictures of the render shown", () => ((sentOpen = !sentOpen), drawRender()), { pressed: sentOpen, small: true })));
  shell.studioMain.replaceChildren(pictures);
  drawSent(r);
}

/** What was sent with the render shown: its prompt as the model read it, and its pictures by their @names. */
function drawSent(r) {
  shell.sent.hidden = !sentOpen;
  if (!sentOpen) return;
  const sent = r ? [r.frame && { name: "frame", url: r.frame.url }, ...(r.maps ?? []).map((m) => ({ name: m.name, url: m.url })), ...(r.refs ?? [])].filter(Boolean) : [];
  shell.sent.replaceChildren(r?.prompt
    ? h("div.ts-sent-in", {}, h("p.ts-sent-prompt", {}, r.prompt),
      h("div.ts-sent-pics", {}, ...sent.map((x) => h("figure", {}, h("button", { type: "button", title: "Look at it, full size", on: { click: () => viewImage(x.url) } }, h("img", { src: x.url, alt: "", draggable: false })), h("figcaption", {}, `@${x.name}`)))))
    : h("p.ts-empty", {}, "Nothing was sent yet: toast it, and the prompt and the pictures that went to the model show here."));
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
    if (!toaster.view || currentPage() !== "toaster" || toaster.mode !== "render") return;
    try {
      strip = hasClay() ? toaster.view.sheetStill({ scale: 0.1, type: "image/jpeg", quality: 0.85 }).url : null;
      clayLive = needLive() ? toaster.view.frameStill({ long: 1000, type: "image/jpeg", quality: 0.88 }) : null;
      stills.camera = toaster.view.frameStill({ long: 320, type: "image/jpeg", quality: 0.82 });
      for (const m of MAPS) stills[m.id] = hasClay() ? toaster.view.frameStill({ long: 320, channel: m.id }) : null;
      if (mapShown) stills.big = toaster.view.frameStill({ long: 1200, channel: mapShown });
    } catch {
      strip = null;
    }
    drawCameraCard();
    drawMaps();
    const big = mapShown && shell?.studioMain.querySelector("img.ts-map-big");
    if (big && stills.big) big.src = stills.big;
    const img = shell?.sheet.querySelector("img.ts-clay-strip");
    const live = shell?.studioMain.querySelector("img.ts-clay-live");
    if (img && strip && (!needLive() || live)) {
      img.src = strip;
      if (live && clayLive) live.src = clayLive;
    } else drawRuns();
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
  if (!shell || !body() || toaster.mode !== "render") return;
  drawMaps();
  drawRender();
  drawSheet();
  drawModel();
}

// ---------------------------------------------------------------- the page

export function renderToaster(el) {
  if (!shell || !el.contains(shell.root)) build(el);
  // (after a failure only "Try again" reads the drafts again: a redraw does not, or a failing read would ask over and over)
  if (!toaster.error) loadDrafts();
  if (!toaster.models) loadModels();
  if (!priceNow()) price3d();
  // the drafts could not be read: say why, and how to put it right, instead of an empty page
  shell.notice.hidden = !!body() || !toaster.error;
  if (toaster.error && !body()) {
    shell.notice.replaceChildren(sprite("product-toaster"), h("b", {}, "Toaster can't reach its drafts."),
      h("span", {}, /404|not found/i.test(toaster.error) ? "The Comfyture server was started before Toaster existed: restart it, then come back here." : toaster.error),
      h("button.key", { type: "button", on: { click: () => ((toaster.error = null), loadDrafts()) } }, "Try again"));
  }
  drawProjectBar();
  if (!body()) return;
  if (shell.laid !== toaster.mode) layout();
  // a draft with pieces of the library needs the library (their models, their icons)
  if (partsNow().some((p) => p.shape === "asset" || p.shape === "character")) assetsModule();
  // what a piece or a character is, written in What it is when it is empty (the pieces once the library is read)
  if (describeParts(library ? pieceOf : () => null)) return;
  drawLeft();
  drawViews();
  drawCameras();
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
  drawFoot();
  if (toaster.mode === "render" && body()) drawPromptHead();
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
  if (k === "t") return done(), setMode(toaster.mode === "render" ? "scene" : "render");
  // (in the render the keys of the scene's editing rest: no part is deleted or moved from there)
  if (toaster.mode === "render") return k === "escape" ? select([]) : undefined;
  const tool = TOOLS.find(([, , , key]) => key.toLowerCase() === k);
  if (tool) return done(), setTool(tool[0]);
  if (k === "delete" || k === "backspace") return done(), removeSelected();
  if (k === "escape") {
    if (toaster.poseMode && toaster.view?.pickedJoint?.()) return toaster.view.pickJoint(null), drawInspector();
    if (toaster.poseMode) return setPoseMode(null);
    return drawer ? openDrawer(null) : select([]);
  }
  if (k === "j") {
    const p = selectedParts()[0];
    if (p?.shape === "character") return setPoseMode(toaster.poseMode === p.id ? null : p.id);
  }
  if (k === "l") return openDrawer("library");
  if (k === "c") return openDrawer("characters");
  if (k === "m") return mirrorSelected();
  if (k === "g") return dropSelected();
  if (k === "s") return toggleSnap();
  if (k === "f") return toaster.view?.frame(toaster.selected.length ? toaster.selected : undefined);
  if (k === "1") return goView("front");
  if (k === "3") return goView("right");
  if (k === "7") return goView("top");
  if (k === "5") return goView("persp");
});
