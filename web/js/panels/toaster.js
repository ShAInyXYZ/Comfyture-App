// Toaster's screen: block an object or a whole scene out in clay, toast it into a picture, then a turnaround and a 3D model. A project bar
// on top (toaster-projects.js: the projects as tabs, and the Scene / Render / 3D switch, keys T and D), then one of three views, one screen tall.
// SCENE (building): the PARTS, the ADD grid and the part SELECTED (its editing) on the left; the viewport (toaster-view.js, made once and
// kept) across all the rest, with Crumpet's bar under it. Nothing of the render is in sight.
// RENDER (rendering): no viewport in sight. On the left "In the frame": the parts (each says whether its picture goes with the frame), and
// under them the selected part's SHEET (its @tag, what it is, its pictures). In the middle the studio: the big picture (the render, or the
// clay as the chosen camera sees it) with the earlier renders in a strip right under it (each tagged with its model, strength and cost, and
// its prompt on hover), then what it is, the scene with its reference pictures inside it, and the prompt folded. On the right the RECIPE,
// in the order things happen: the CAMERA to render from (the slots kept in the Scene), what is SENT (the clay frame and the control maps
// as tiles, the first one leads; under them the pictures that go with them), the image MODEL, the frame and the strength, and Toast it
// with Write beside it.
// 3D (making the objects real, ONE AT A TIME): the same left column, each object with where it is (waiting, sheet, model, done) and a
// switch for being made in 3D; in the middle a bar (the model that draws the sheets, and Make them one by one), then the OBJECT in hand
// (its four views drawn by an image model, cut for Trellis2) beside the NEW SCENE where the finished models stand where their clay was,
// with Crumpet's bar under them. No right column. toaster-3d.js does the making.
// The parts and the scene are called by @tags in the words (pills.js). What is toasted draws on "toaster-runs", so a render's progress
// never redraws a field in use.
import { h, icon, sprite } from "../dom.js";
import { onChange, toast, useStageRender, makeToasterRef, writer, writers, state } from "../store.js";
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
  renderFrame, setStrength, forget, showRender, useSettings, setCompare, putOnStage, isArmed, arm, disarm, toggleMap,
  setMode, addPartRef, removePartRef, addSceneRef, removeSceneRef, setPrompt, framePlan, writeWords,
} from "../toaster.js";
import { SHAPES, PALETTE, RATIOS, MAPS, POSE_SLIDERS, roundLabel, hasSides, colorName, shapeOf, tagsOf, describeOf, isAsset, isCharacter, plainFrame } from "../toaster-model.js";
import { CRUMPET } from "../toaster-harness.js";
import { setOffers } from "../harnesses.js";
import { chat as toasterChat, askToaster, addToasterPictures, tagHooks } from "../toaster-assist.js";
import { projectBar, drawProjectBar } from "./toaster-projects.js";
import {
  gen, sheetOf, sheetRun, modelOf, modelRun, stateOf, objectsNow, sheetModel, setSheetModel, setSolid, loadTarget, loadCloudPrice, route, modelPrice, sheetPrice, costOf,
  isArmed as askedFor, arm as askFor, disarm as askNot, makeObject, makeThem, stopQueue, forgetObject, makeSheet, makeModel, useFile, useSheetBox, sceneView, setSceneView, watchServer,
} from "../toaster-3d.js";
import { wants3d, tiltOf } from "../toaster-model.js";

let shell = null;
// the slot Crumpet's bar docks in: the same element every time the page is built, so the bar goes with it
let chatSlot = null;
let mounting = null;
let scene3d = null;

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
const MODES = [
  ["scene", "view-persp", "Scene", "the viewport in the middle: block out, place, aim", "T"],
  ["render", "scene-render", "Render", "the render studio: say what it is, add pictures, toast it", "T"],
  ["3d", "model-3d", "3D", "the objects made real, one at a time, in a new scene", "D"],
];

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
    if (one.length === 1 && toaster.mode !== "scene") addSheetPictures(one[0], files);
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
  s.mapsCard = h("section.ts-card.ts-maps-card", { "aria-label": "Sent" });
  s.modelCard = h("section.ts-card.ts-recipe-model", { "aria-label": "Model and strength" });
  s.toastBar = h("div.ts-recipe-toast");
  s.bar3d = h("section.ts-card.ts-bar3d", { "aria-label": "Make the objects" });
  s.object = h("section.ts-card.ts-object", { "aria-label": "The object in hand" });
  s.newScene = h("section.ts-card.ts-newscene", { "aria-label": "The new scene" });
  s.right = h("aside.ts-col.ts-right.ts-recipe", { "aria-label": "Recipe" });
  s.recipeHead = h("h2.ts-label.ts-recipe-head", {}, "Recipe");
  buildStudio(s);

  modesEl ??= h("div.ts-modes", { role: "group", "aria-label": "Page" }, ...MODES.map(([id, glyph, label, about, keyName]) =>
    h("button.ts-mode", { type: "button", dataset: { mode: id }, title: `${label}: ${about} — ${keyName}`, on: { click: () => setMode(id) } }, sprite(glyph), h("span", {}, label))));
  s.modes = modesEl;

  s.root = h("div.toaster", {}, s.left, s.mid, s.right);
  // a field left: what waited while it was in use is drawn now
  s.root.addEventListener("focusout", (e) => !s.root.contains(e.relatedTarget) && setTimeout(() => (drawLeft(), drawLook()), 0));
  el.replaceChildren(h("h1.sr-only", {}, "Toaster"), projectBar([s.modes]), s.root);
  shell = s;
  layout();
  mountView();
  document.dispatchEvent(new Event("toaster:drawn"));
}

/**
 * One mode at a time (the nodes are moved, never made again: the viewport keeps its canvas). The scene: two areas, the parts, Add and the
 * part's editing on the left, the viewport across the rest with Crumpet's bar under it. The render: the parts as "In the frame" with the
 * selected part's sheet on the left, the studio in the middle, the recipe on the right. The 3D page: the same left, the turnaround and the
 * 3D model in the middle. In the render and on the 3D page the viewport is kept hidden (its stills draw through their own lens and size,
 * and it measures itself again when the scene comes back).
 */
function layout() {
  const s = shell;
  const mode = toaster.mode;
  s.laid = mode;
  for (const m of ["scene", "render", "3d"]) s.root.classList.toggle(`is-${m}`, mode === m);
  s.addCard.hidden = mode !== "scene";
  s.partsLabel.textContent = mode === "scene" ? "Parts" : mode === "3d" ? "Objects, in order" : "In the frame";
  watchServer(mode === "3d");
  // (leaving the 3D page frees its viewer: the scene is built again when it comes back)
  if (mode !== "3d" && scene3d) (scene3d.handle?.dispose(), (scene3d = null));
  if (mode !== "scene" && drawer) openDrawer(null);
  if (mode === "render") {
    s.mid.replaceChildren(s.studio, s.brief, chatSlot);
    s.right.replaceChildren(s.recipeHead, s.cameraCard, s.mapsCard, s.modelCard, s.toastBar, s.viewport);
    s.root.replaceChildren(s.left, s.mid, s.right);
  } else if (mode === "3d") {
    s.mid.replaceChildren(s.bar3d, h("div.ts-3d", {}, s.object, s.newScene), s.viewport, chatSlot);
    s.root.replaceChildren(s.left, s.mid);
  } else {
    s.mid.replaceChildren(s.viewport, chatSlot);
    s.root.replaceChildren(s.left, s.mid);
  }
  for (const b of s.modes.children) b.setAttribute("aria-pressed", String(b.dataset.mode === mode));
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
      // the library's pieces arrived: the stills drawn while they were boxes are drawn again
      onAssets: () => stripSoon(),
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

/** The 3D page's mark on an object of the list: where it is (waiting, drawing its sheet, its model…), and the switch for making it in 3D or leaving it clay. */
function solidKey(p) {
  const on = wants3d(p);
  const state = on ? stateOf(p.id) : null;
  return h(`button.ts-solid${on ? ".is-on" : ""}${state ? `.is-${state}` : ""}`, {
    type: "button", "aria-pressed": String(on), "aria-label": `${p.name}: ${on ? STATE_WORDS[state] : "clay"}`,
    title: on ? `Made in 3D (${STATE_WORDS[state]}) — press to leave it as clay` : "Left as clay — press to make it in 3D",
    on: { click: (e) => (e.stopPropagation(), setSolid(p.id, !on)) },
  }, on ? STATE_WORDS[state] : "clay");
}
function drawParts() {
  // (a part being renamed keeps its field, its words and its caret: the list catches up once the name is in)
  const field = shell.parts.querySelector("input.ts-rename");
  if (renaming && field && document.activeElement === field) return;
  const parts = partsNow();
  unpeek();
  shell.partsCount.textContent = parts.length ? String(parts.length) : "";
  if (!parts.length) return shell.parts.replaceChildren(h("p.ts-empty", {}, "Add a shape below to start blocking out."));
  const tags = tagsOf(parts, body().refs.map((r) => r.name));
  // (in the render a part's picture says whether it goes with the frame: the model takes only so many)
  const named = toaster.mode === "scene" ? null : framePlan().named;
  shell.parts.replaceChildren(...parts.map((p) => {
    const on = toaster.selected.includes(p.id);
    const first = p.refs?.[0];
    const sent = named && first ? named.has(tags.get(p.id)) : null;
    const row = h(`div.ts-part${on ? ".is-on" : ""}${p.hidden ? ".is-hidden" : ""}`, {
      role: "treeitem", "aria-selected": String(on), tabindex: "0", dataset: { focusKey: p.id },
      on: { click: (e) => pick(p.id, { shift: e.shiftKey || e.ctrlKey || e.metaKey }), dblclick: () => ((renaming = p.id), drawParts()) },
    },
      p.shape === "asset" ? h("span.ts-glyph", { title: "A piece of the Stage's library" }, sprite(pieceOf(p.asset)?.icon ?? "asset-library"))
        : p.shape === "character" ? h("span.ts-glyph", { title: "A character" }, sprite(p.rig ? "character-import" : `body-${p.body}`))
        : h("span.ts-glyph", { title: shapeOf(p.shape).name }, sprite(`shape-${p.shape}`)),
      h("span.ts-marks", {}, h("span.ts-chip", { style: { background: p.color }, title: colorName(p.color) }),
        first ? h(`span.ts-mini-pic${sent === false ? ".is-left-out" : ""}`, { title: `${p.refs.length} picture${p.refs.length > 1 ? "s" : ""} on its sheet${sent === true ? " — goes with the frame" : sent === false ? " — Left out: the model has no room for it" : ""}` }, h("img", { src: first.url, alt: "", draggable: false }), p.refs.length > 1 ? h("i", {}, String(p.refs.length)) : null, sent ? h("b.ts-sent-dot") : null) : null),
      renaming === p.id ? nameField(p.name, (v) => setProps({ name: v }, { ids: [p.id] })) : toaster.mode !== "scene"
        ? h("span.ts-name", { title: "Double-click to rename" }, p.name, tags.has(p.id) ? h("code.ts-at-mini", {}, `@${tags.get(p.id)}`) : null)
        : h("span.ts-name", { title: "Double-click to rename" }, p.name),
      toaster.mode === "3d" ? solidKey(p) : null,
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
  const sheetOnly = toaster.mode !== "scene";
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
    // the part's sheet: its face (its first picture, or what it is), its name and @tag, what it is, its pictures
    if (many) return shell.inspector.replaceChildren(h("p.ts-many", {}, `${sel.length} parts`), rows[1]);
    const face = p.refs?.[0] ? h("img", { src: p.refs[0].url, alt: "", draggable: false })
      : sprite(p.shape === "asset" ? pieceOf(p.asset)?.icon ?? "asset-library" : p.shape === "character" ? (p.rig ? "character-import" : `body-${p.body}`) : `shape-${p.shape}`);
    return shell.inspector.replaceChildren(
      h("div.ts-sheet-head", {}, h("span.ts-sheet-face", { style: { "--chip": p.color } }, face),
        h("div.ts-sheet-id", {}, h("b", { title: "Double-click its row to rename it" }, p.name), tag ? h("code", {}, `@${tag}`) : null)),
      rows[1], sheetPictures(p));
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
// other, and its search and category are kept while it is shut. The poses are known with the pieces; the people (their sizes are their
// bodies', which are fetched) when the characters drawer is first opened.
let library = null;
let people = null;
let peopling = null;
let drawer = null;
let pieceQuery = "";
let pieceGroup = "All";
let assets = null;
const pieceOf = (type) => library?.pieces.find((x) => x.type === type) ?? null;
toaster.pieceOf = pieceOf;
/** The library module, loaded on first need (it brings three.js and the Stage's code with it; a piece's model comes when it is drawn). */
function assetsModule() {
  assets ??= import("../toaster-assets.js").then((m) => {
    measureNow = m.characterSize;
    const got = (lib) => {
      library = lib;
      people = people?.people ? m.characterList() : { poses: m.poseList() };
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
/** The characters to add, once their bodies are in. */
function loadPeople() {
  peopling ??= assetsModule().then((m) => m.loadPeople()).then((list) => {
    people = list;
    if (drawer === "characters") drawDrawer();
  }).catch((e) => console.warn("toaster: the characters did not load:", e.message));
  return peopling;
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
  if (drawer === "characters") loadPeople();
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
    // (drawn once the model of the piece, or the body of the figure, is in)
    assets?.then((m) => (type ? m.assetThumb(type) : m.characterThumb({ body, rig }))).then((url) => (e.target.src = url)).catch(() => {});
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
  if (!people?.people) results.append(h("p.ts-empty", {}, "Bringing the Stage's characters…"));
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
  if (toaster.mode !== "scene") return toaster.mode === "render" ? drawCameraCard() : undefined;
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
  const tile = (name, thumb, lit, run, title) => h(`div.ts-cam${lit ? ".is-on.is-lit" : ""}`, {},
    h("button.ts-cam-pic", { type: "button", title, "aria-label": title, "aria-pressed": String(lit), style: { aspectRatio: b.ratio.replace(":", " / ") }, on: { click: run } }, thumb ? h("img", { src: thumb, alt: "", draggable: false }) : sprite("scene-camera")),
    h("span.ts-cam-name", {}, name));
  const now = on ? null : stills.camera;
  const lit = on ? tile(on.name, stills.camera ?? on.thumb, true, () => {}, `${on.name} — ${on.focal} mm, ${on.ratio}: the render uses it`) : tile("Current view", now, true, () => {}, "The view as you left it in the Scene: the render will use it");
  const others = b.cameras.filter((k) => k !== on).map((k) => tile(k.name, k.thumb, false, () => recallCamera(k.id), `${k.name} — ${k.focal} mm, ${k.ratio}: render from it`));
  shell.cameraCard.replaceChildren(
    h("header.ts-head", {}, h("h2.ts-label", {}, "Camera"), h("span.spacer"), h("span.ts-note", {}, on ? `${on.focal} mm` : "The view as you left it")),
    // (the camera the render uses first, big when the column has the room; the others to pick from, small, after it)
    h("div.ts-cam-grid", {}, lit, ...others),
    ...(b.cameras.length ? [] : [h("p.ts-empty", {}, "Keep cameras in the Scene: they show here to pick from.")]));
}

/**
 * What goes with the render, in the order it goes: the clay frame and the control maps as the camera sees them now, each a picture with
 * whether it is sent (the picture is the switch: a click sends it or not; its corner key shows it big in the studio), the first one sent marked as the one that leads (the
 * layout comes from it); under them the pictures that go with them, by @name, and those the model has no room for.
 */
function drawMaps() {
  const b = body();
  if (!shell || !b || toaster.mode !== "render") return;
  const plan = framePlan();
  const out = leftOut(plan);
  const lead = plan.maps[0]?.id;
  const count = plan.maps.length + plan.refs.length;
  const chip = (r, left) => h(`span.ts-who${left ? ".is-left-out" : ""}`, { title: left ? `@${r.name} is left out: ${out.why}` : `@${r.name} goes with the frame` },
    r.url ? h("img", { src: r.url, alt: "", draggable: false }) : h("i", { style: { background: r.color } }), h("span", {}, `@${r.name}`));
  // (as thumbnails when there are few, as chips when there are many)
  // (the pictures asked for and not sent: a sheet's first picture and the scene's references the room did not take)
  const sentFiles = new Set(plan.refs.map((r) => r.file));
  const tags = tagsOf(b.parts, b.refs.map((r) => r.name));
  const left = [...b.refs.map((r) => ({ name: r.name, file: r.file, url: r.url })), ...b.parts.filter((p) => p.refs?.length && tags.has(p.id)).map((p) => ({ name: tags.get(p.id), file: p.refs[0].file, url: p.refs[0].url }))]
    .filter((r) => !sentFiles.has(r.file) && !plan.named.has(r.name));
  shell.mapsCard.replaceChildren(
    h("header.ts-head", {}, h("h2.ts-label", {}, "Sent"), h("span.spacer"), h("span.ts-note", { title: `${plan.model?.short ?? plan.model?.name ?? "The model"} takes ${out.total} pictures` }, `${count} of ${out.total} pictures`)),
    h("div.ts-map-tiles", {}, ...MAPS.map((m) => {
      const on = b.maps.includes(m.id);
      const gone = out.ids.includes(m.id);
      const shown = mapShown === m.id;
      const state = gone ? "No room" : on ? "✓" : "Off";
      const tip = gone ? `${m.label} is left out: ${out.why}. Click to stop asking for it` : on ? `${m.label} — Sent — click to leave it out` : `${m.label} — Left out by you — click to send it`;
      return h(`div.ts-map-tile${shown ? ".is-shown" : ""}${lead === m.id ? ".is-lead" : ""}`, {},
        h(`button.ts-map-pic${gone ? ".is-left-out" : on ? ".is-sent" : ".is-off"}`, { type: "button", "aria-pressed": String(on || gone), "aria-label": `${m.label}: ${gone ? "no room" : on ? "sent" : "off"}`, style: { aspectRatio: b.ratio.replace(":", " / ") }, title: tip, on: { click: () => toggleMap(m.id) } },
          stills[m.id] ? h("img", { src: stills[m.id], alt: "", draggable: false }) : sprite(MAP_ICON[m.id]),
          h("span.ts-map-name", {}, m.label),
          h("span.ts-map-badge", {}, state)),
        h("button.ts-map-view", { type: "button", "aria-pressed": String(shown), "aria-label": shown ? `Back to the ${b.renders.length ? "render" : "clay"}` : `Show ${m.label} big`, title: shown ? `Back to the ${b.renders.length ? "render" : "clay"}` : `${m.label}: show it big in the studio`, on: { click: () => showMap(shown ? null : m.id) } }, sprite("image-compare")),
        lead === m.id ? h("em.ts-lead", { title: "It leads: the render takes its layout from this picture" }, "Leads") : null);
    })),
    plan.refs.length || left.length
      ? h(`div.ts-sent-refs${plan.refs.length + left.length <= 4 ? ".is-big" : ""}`, { role: "list", "aria-label": "Pictures that go with the frame" }, ...plan.refs.map((r) => chip(r, false)), ...left.map((r) => chip(r, true)))
      : h("p.ts-empty", {}, "No sheet pictures or references go with it: put pictures on a part or in the Scene."));
}
/** A control map shown big in the studio, or (null) the clay or the render again. */
function showMap(id) {
  mapShown = id;
  stills.big = null;
  if (id && toaster.view) {
    try {
      stills.big = mapStill(id, 1200);
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

const MAP_ICON = { clay: "view-persp", id: "channel-id", depth: "channel-depth", silhouette: "material-mask" };
/** One of the maps as the camera sees it now: the clay frame as it would be sent (plain grey clay when strong), or a control map. */
const mapStill = (id, long) => {
  const b = body();
  return id === "clay" ? toaster.view.frameStill({ long, type: "image/jpeg", quality: 0.85, plain: plainFrame(b.strength, b.maps) }) : toaster.view.frameStill({ long, channel: id });
};

// ---------------------------------------------------------------- the words: @tags as pills, and the list that opens on an @

const kindWord = (p) => (isCharacter(p) ? "character" : isAsset(p) ? "piece" : "shape");
/** What an @name stands for, to draw it as a pill and to peek at it: a part (its colour, its first picture, its sheet) or a reference picture. */
function lookupTag(name, withFrame = false) {
  const b = body();
  if (!b) return null;
  const tags = tagsOf(b.parts, b.refs.map((r) => r.name));
  const p = b.parts.find((x) => tags.get(x.id) === name);
  if (p) return { title: p.name, color: p.color, url: p.refs?.[0]?.url, pictures: p.refs, words: p.made, note: `@${name} · ${kindWord(p)}` };
  // a part's later pictures go to the model as @tag-2, @tag-3…: the n-th picture of its sheet
  const nth = /^(.+)-(\d+)$/.exec(name);
  const q = nth && b.parts.find((x) => tags.get(x.id) === nth[1]);
  const pic = q?.refs?.[Number(nth?.[2]) - 1];
  if (pic && Number(nth[2]) > 1) return { title: `${q.name}, picture ${nth[2]}`, color: q.color, url: pic.url, pictures: [pic], words: q.made, note: `@${name} · picture ${nth[2]} of ${q.name}'s sheet` };
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
    ...b.parts.filter((p) => tags.has(p.id)).map((p) => ({ name: tags.get(p.id), title: p.name, url: p.refs?.[0]?.url, color: p.color, about: kindWord(p) })),
    ...b.refs.map((r) => ({ name: r.name, url: r.url, about: "reference" })),
  ];
}

// Crumpet's bar names the same things
tagHooks.items = () => (body() ? tagItems() : []);
tagHooks.lookup = (name) => lookupTag(name);

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

/** The studio's nodes: the head and the picture with its strip (drawn with the runs), the composer (the words, the scene with its pictures, the prompt). */
function buildStudio(s) {
  const pills = (label, placeholder, className, lookup) => pillField({ label, placeholder, lookup, className: `ts-pills ${className}` });
  s.what = pills("What it is", "A boss's office: a walnut @desk, a leather chair, a window behind", "is-what", lookupTag);
  s.scene = pills("Scene", "Dusk, warm lamp light, a cinematic still", "is-scene", lookupTag);
  s.prompt = pills("Prompt", "", "is-prompt", (n) => lookupTag(n, true));
  for (const f of [s.what, s.scene, s.prompt]) tagging(f);
  s.what.addEventListener("input", () => (setWords("what", s.what.value), drawPromptHead()));
  s.scene.addEventListener("input", () => (setWords("scene", s.scene.value), drawPromptHead()));
  s.prompt.addEventListener("input", () => (setPrompt(s.prompt.value), drawPromptHead()));
  s.refsBox = h("div.ts-refs");
  s.sceneHead = h("div.ts-row-head");
  s.promptHead = h("div.ts-prompt-head");
  s.studioHead = h("div.ts-studio-head");
  s.studioMain = h("div.ts-studio-main");
  s.sent = h("div.ts-sent", { hidden: true });
  // the rows, each as tall as its content: what it is | the scene (its reference pictures at the bottom of its box), the prompt
  // (the prompt and the scene sit in boxes of their own: the box has the border and the room around the words, so the words fold at a whole line)
  s.compose = h("div.ts-compose", {},
    h("div.ts-words-row", {},
      h("div.ts-stack.ts-what", {}, h("div.ts-field-box", { on: { click: (e) => e.target === e.currentTarget && s.what.focus() } }, h("div.ts-row-head", {}, h("span.ts-label", {}, "What it is")), s.what.el)),
      h("div.ts-stack.ts-scene", {}, h("div.ts-scene-box.ts-field-box", { on: { click: (e) => e.target === e.currentTarget && s.scene.focus() } }, s.sceneHead, s.scene.el, s.refsBox))),
    h("div.ts-stack.ts-prompt", {}, s.promptHead, h("div.ts-prompt-box", { on: { click: (e) => e.target === e.currentTarget && s.prompt.focus() } }, s.prompt.el)));
  // pictures dropped or pasted on the composer are references for the whole render
  dropFiles(s.compose, (files) => addReferences(files));
  s.studio = h("section.ts-card.ts-studio", { "aria-label": "Render" }, s.studioMain, s.sent);
  s.brief = h("section.ts-card.ts-brief", { "aria-label": "What it is and the look" }, s.compose);
}

/** A field's words, set only while it is not in use (what is typed is never drawn over). */
function setField(field, text) {
  if (document.activeElement !== field.el && field.value !== text) field.value = text;
}
let promptOpen = false;
/** The writer's short name, as the badge says it. */
const writerName = () => {
  const id = writer("assistant");
  const m = writers().find((x) => x.id === id);
  return m?.short ?? m?.name ?? "The writer";
};
/** The prompt's head: who wrote it (the writer for a model, you, out of date, or not written yet) and the keys that write it again or give it back. */
function drawPromptHead() {
  const b = body();
  if (!b || !shell) return;
  const m = modelNow();
  const plan = framePlan();
  const own = b.promptBy === "you" && !!b.prompt.trim();
  const wrote = b.promptBy === "writer" && !!b.prompt.trim();
  const stale = wrote && plan.stale;
  const forModel = m?.short ?? m?.name ?? "the image model";
  // written for a model this machine does not offer (an example's prompt, written for a partner's model, opened with no key): the facts
  // are the same, so it says whom it was written for rather than calling itself out of date
  const writtenFor = b.promptFor?.model;
  const elsewhere = stale && b.promptFor?.key === plan.key && writtenFor && !(toaster.models?.models ?? []).some((x) => x.id === writtenFor);
  const otherName = elsewhere ? b.renders.find((r) => r.model === writtenFor)?.modelName ?? writtenFor : "";
  const [badge, tone, tip] = own ? ["Yours", ".is-own", "Your prompt: sent as written"]
    : elsewhere ? [`Written for ${otherName}`, ".is-written", `Written for ${otherName}, which is not on offer here: Toast it writes it again for ${forModel}`]
    : stale ? ["Out of date: rewritten when you toast", ".is-stale", "The image model or the facts changed since it was written: Toast it writes it again (or press Write)"]
    : wrote ? [`Written by ${writerName()} for ${forModel}`, ".is-written", "Written from the model's own guide: sent as it stands"]
    : ["Not written yet", "", "Nothing is written until you toast or press Write"];
  shell.prompt.el.dataset.placeholder = `${writerName()} writes it for ${forModel} from its guide when you toast; Write shows it first`;
  shell.prompt.el.classList.toggle("is-auto", !own && !wrote);
  shell.prompt.el.classList.toggle("is-open", promptOpen);
  shell.promptHead.replaceChildren(...[
    h("span.ts-label", {}, "Prompt"),
    h(`span.ts-badge${tone}`, { title: tip }, badge),
    h("span.spacer"),
    own || wrote ? keyIcon(icon("remix"), "Back to automatic", () => (setPrompt(""), drawLook()), { small: true }) : null,
    keyIcon(icon("chevron"), promptOpen ? "Show it short" : "Show it whole", () => ((promptOpen = !promptOpen), drawPromptHead()), { pressed: promptOpen, small: true }),
    h("button.key.ts-write", { type: "button", disabled: toaster.writing || !hasClay() || !m, title: toaster.writing ? "Writing the prompt…" : `Write — ${writerName()} writes the prompt for ${forModel} from the model's guide, your words, the sheets and their pictures (a small writer call)`, on: { click: writeWords } }, sprite("prompt-enhance"), h("span", {}, toaster.writing ? "Writing…" : "Write")),
  ].filter(Boolean));
}

/** The composer drawn from the draft: the words, the scene's pictures, the prompt, and the recipe's model and Toast it. */
function drawLook() {
  const b = body();
  if (!b || !shell || toaster.mode !== "render") return;
  setField(shell.what, b.what);
  setField(shell.scene, b.scene);
  setField(shell.prompt, b.prompt);
  for (const f of [shell.what, shell.scene, shell.prompt]) f.refresh();
  drawPromptHead();

  // the references: pictures for the whole render (a style, a mood, a material, a place), each called by an @name, in the scene's box
  const full = b.refs.length >= MOST_PICTURES;
  shell.sceneHead.replaceChildren(h("span.ts-label", {}, "The look"), h("span.ts-count", {}, b.refs.length ? `${b.refs.length}/${MOST_PICTURES} pictures` : ""), h("span.spacer"), libraryKey("scene", "From the Library", drawLook));
  const refs = [h("div.ts-pics", {}, ...b.refs.map((r) => pictureTile(r, () => removeSceneRef(r.name), r.name)), full ? null : addTile("Add reference pictures — a style, a mood, a place — or drop or paste them on the composer", {
    files: (files) => addReferences(files),
    library: openLibrary("scene", drawLook),
    make: () => makeToasterRef({ kind: "scene", draftId: toaster.draft?.id, name: "the look", words: [b.scene, b.what].map((t) => String(t ?? "").replace(/@[a-z0-9-]+/gi, "").trim()).filter(Boolean).join(". "), aspect: b.ratio }),
  }))];
  if (libraries.scene.open) {
    refs.push(libraryPane("scene", {
      has: () => new Set((body()?.refs ?? []).map((r) => r.file)),
      toggle: (photo) => (body().refs.some((r) => r.file === photo.file) ? removeSceneRef(body().refs.find((r) => r.file === photo.file).name) : addSceneRef(photo)),
    }));
  }
  shell.refsBox.replaceChildren(...refs);

  drawRecipe();
}

/**
 * The maps chosen but not sent, and why: a model takes so many pictures, and the frame, the people's pictures and the maps that say the
 * most go first (the render's plan says which). `total` is the model's room.
 */
function leftOut(plan = framePlan()) {
  const b = body();
  const sent = plan.maps.map((m) => m.id);
  const ids = b.maps.filter((id) => !sent.includes(id));
  const total = plan.model?.templates?.find((t) => t.id === "edit")?.refs ?? 4;
  const first = [...plan.maps.map((m) => (m.id === "clay" ? "the clay frame" : m.label)), ...plan.refs.map((r) => `@${r.name}`)];
  return { ids, total, why: `${plan.model?.short ?? plan.model?.name ?? "this model"} takes ${total} pictures: ${first.join(", ")} go first` };
}

/** The recipe's model card (the image model, the frame, the strength) and the Toast it bar. */
function drawRecipe() {
  const b = body();
  if (!b || !shell || toaster.mode !== "render") return;
  const m = modelNow();
  const busy = b.renders.some((r) => r.status === "running");
  const models = modelItems();
  // a square or tall frame makes tall tiles: the recipe keeps them within its height
  const [rw, rh] = b.ratio.split(":").map(Number);
  shell.right.classList.toggle("is-upright", rw / rh < 1.3);
  shell.modelCard.replaceChildren(
    h("div.ts-model-row", {},
      h("div.ts-setting", {}, h("div.ts-row-head", {}, h("span.ts-label", {}, "Model")),
        models.length ? h("div.ts-pick.ts-image-model", {}, dropdown({ label: "Image model", value: m?.id, items: models, onChange: setModel, note: "What renders the clay: a partner model's credits, or Comfy Cloud's GPU time" })) : h("span.ts-note", {}, "No image model yet")),
      h("div.ts-setting", {}, h("div.ts-row-head", {}, h("span.ts-label", {}, "Frame")),
        h("div.ts-pick.ts-frame-ratio", {}, dropdown({ label: "Frame", value: b.ratio, items: Object.keys(RATIOS).map((r) => ({ value: r, label: r, glyph: () => sprite(r === "4:5" ? "ratio-3-4" : `ratio-${r.replace(":", "-")}`) })), onChange: setRatio })))),
    strengthSlider(b),
    h("p.ts-band", {}, icon("info"), h("span", {}, BAND(b.strength))));
  shell.toastBar.replaceChildren(toastKey(m, busy));
}

/** Crumpet's offers over his bar: dress the frame, write the prompt for the model picked, rebuild the scene from a photo. */
/** What Crumpet offers above his bar on the Render page (the shared chips of web/js/harnesses.js: the Scene keeps his harness's own). */
function renderOffers() {
  if (toaster.mode !== "render") return null;
  const m = modelNow();
  return [
    { icon: "camera-framing", label: "Dress the frame", title: "Crumpet places pieces around what the camera looks at, so the picture reads well (a small writer call)", run: () => askToaster("Dress the frame for a hero shot of what the camera looks at: put pieces around it so the picture reads well, and keep the camera's axis clear.") },
    { icon: "prompt-enhance", label: `Write the prompt for ${m?.short ?? m?.name ?? "the model"}`, title: "Luna writes the prompt from the model's own guide (a small writer call)", run: writeWords },
    { icon: "image-upload", label: "Rebuild from a photo", title: "Pick a photo: Crumpet rebuilds its layout in clay and matches its camera (a small writer call)", run: () => pickFiles(async (files) => {
      await addToasterPictures([...files].filter(isImage).slice(0, 1));
      if (toasterChat.pictures.length) askToaster("Rebuild the layout of the attached photo in clay and match its camera.");
    }) },
  ];
}
setOffers("toaster", renderOffers);
/** How far the render goes from the clay: dragged, its number follows; let go, the prompt and the frame sent follow it. */
const BAND = (v) => (v < 0.34 ? "keeps the clay's colours" : v < 0.67 ? "real materials, the colours only say who is who" : "only the layout and the forms stay");
function strengthSlider(b) {
  const out = h("output.ts-readout", {}, `${Math.round(b.strength * 100)}%`);
  return h("label.ts-strength", { title: `Strength: how far the render goes from the clay — now ${BAND(b.strength)}. Low keeps the clay's colours; middle gives every thing its real materials (the colours only say which thing is which); high keeps only the layout and the forms. From 50%, with the colour ID sent, the frame goes in plain grey clay. On Comfy Cloud's open-weights models it is also the edit's own strength.` },
    h("span.ts-label", {}, "Strength"),
    h("input", { type: "range", min: 0, max: 100, step: 5, value: Math.round(b.strength * 100), "aria-label": "Strength", on: {
      input: (e) => ((out.textContent = `${e.target.value}%`), setStrength(Number(e.target.value) / 100, { draw: false })),
      change: (e) => setStrength(Number(e.target.value) / 100),
    } }), out);
}
const toastKey = (m, busy) => h("button.key.is-primary.ts-toast", { type: "button", disabled: busy || !m || !hasClay(), title: "Render the frame: the clay is the layout, the words what it becomes", on: { click: renderFrame } },
  sprite("toast-it"), h("span", {}, toaster.writing ? "Writing the prompt…" : busy ? "Toasting…" : "Toast it"), m ? h("em", {}, priceOf(m)) : null);

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

/** The keys of the render's head: use its settings again, keep the clay frame, compare, full size, start a shot, download, forget. */
function renderKeys(r, done) {
  return [
    keyIcon(sprite("image-history"), "Use these settings — put back this render's image model, strength, maps and prompt", () => useSettings(r.id), { disabled: !r, small: true }),
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

/** A run's tag: its image model's short name, its strength and its cost (a run from before has only some of them: those that are there). */
function runTag(x) {
  const m = toaster.models?.models.find((y) => y.id === x.model);
  const cost = x.cost ?? (m ? (m.router ? `${m.credits}cr` : "GPU") : null);
  return [x.modelName ?? m?.short ?? m?.name, Number.isFinite(x.strength) ? `${Math.round(x.strength * 100)}%` : null, cost].filter(Boolean).join("·");
}
let runPeek = null;
/** An earlier render in the strip: its picture, its tag under it, and its prompt in the peek card as the pointer rests on it. */
function thumbOf(x, shown) {
  const tag = runTag(x);
  const what = { title: tag || "Render", words: x.status === "failed" ? x.error : x.prompt ? (x.prompt.length > 700 ? `${x.prompt.slice(0, 700)}…` : x.prompt) : "No prompt was kept for this one.", note: x.status === "failed" ? "" : x.note ? `${x.note} · Click: show it, from its camera` : "Click: show it, from its camera" };
  return h(`button.ts-thumb${x.id === shown ? ".is-on" : ""}`, { type: "button", role: "listitem", "aria-label": `${what.title}: show it, from its camera`, on: {
    click: () => (unpeek(), (runPeek = null), (mapShown = null), drawMaps(), showRender(x.id)),
    pointerenter: (e) => ((runPeek = x.id), peek(`run:${x.id}`, what, e.currentTarget, "above")),
    pointerleave: () => ((runPeek = null), unpeek()),
  } },
    h("span.ts-thumb-pic", {}, x.photo ? h("img", { src: x.photo.url, alt: "", draggable: false, loading: "lazy" }) : x.status === "running" ? h("span.typing", {}, h("i"), h("i"), h("i")) : icon("close")),
    tag ? h("span.ts-thumb-tag", {}, tag) : null);
}

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
    picture = h("div.ts-pic.is-clay", {}, stills.big ? h("img.ts-map-big", { src: stills.big, alt: `The ${map.label} map`, draggable: false }) : h("span", {}, "…"));
  } else if (!r) {
    picture = studio ? h("div.ts-pic.is-clay", {}, clayLive ? h("img.ts-clay-live", { src: clayLive, alt: "The clay frame, as Toaster sends it", draggable: false }) : h("span", {}, "Warming up the clay…"))
      : h("div.ts-pic.is-empty", {}, sprite("toast-it"), h("span", {}, "Block it out, say what it is, and toast it."));
  } else if (r.status === "running") picture = h("div.ts-pic.is-running", {}, r.frame ? h("img.ts-under", { src: r.frame.url, alt: "", draggable: false }) : null, progress(r, "Toasting the frame"));
  else if (r.status === "failed") picture = h("div.ts-pic.is-failed", {}, icon("close"), h("span", {}, r.error ?? "That didn't work."));
  else if (toaster.compare && r.frame) picture = comparePic(r);
  else picture = h("button.ts-pic", { type: "button", title: "Look at it, full size", on: { click: () => viewImage(r.photo.url) } }, h("img", { src: r.photo.url, alt: "", draggable: false }));
  if (runPeek) (unpeek(), (runPeek = null));
  // the strip of earlier renders right under the picture, and the key that puts the shown one's settings back at its end
  const strip = renders.length ? h("div.ts-strip-row", {},
    h("div.ts-strip", { role: "list", "aria-label": "Earlier renders", dataset: { scrollKey: "ts-strip" } }, ...renders.map((x) => thumbOf(x, r?.id))),
    h("button.ts-use", { type: "button", disabled: !r, title: "Use these settings — put back the shown render's image model, strength, maps and prompt", "aria-label": "Use these settings — put back the shown render's image model, strength, maps and prompt", on: { click: () => useSettings(r.id) } }, sprite("image-history"), h("span", {}, "Use these settings"))) : null;
  const ratio = RATIOS[r?.ratio] ?? RATIOS[b.ratio] ?? 1;
  // on the picture: what made it (or what is shown), and its keys
  const meta = map ? `${map.label} · ${b.maps.includes(map.id) ? "sent" : "not sent"}` : !r ? "Clay · what Toaster sends" : r.status === "done" ? runTag(r).replace(/·/g, " · ") : "";
  const keys = h("div.ts-pic-keys", {}, ...renderKeys(r, done).slice(1),
    keyIcon(sprite("file"), "What was sent — the prompt and the pictures of the render shown", () => ((sentOpen = !sentOpen), drawRender()), { pressed: sentOpen, small: true }));
  // (the picture, what made it and its keys share one frame of the picture's own shape, so they sit on its corners)
  const pictures = h("div.ts-render-body", {}, h("div.ts-pic-box", { style: { "--ratio": String(ratio) } },
    h("div.ts-pic-frame", {}, picture, meta ? h("span.ts-pic-meta", {}, lamp(renders), h("span", {}, meta)) : null, studio ? keys : null)), strip);
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
let stripOf = null;
let stripTimer = 0;
function stripSoon() {
  clearTimeout(stripTimer);
  stripTimer = setTimeout(() => {
    if (!toaster.view || currentPage() !== "toaster" || toaster.mode === "scene") return;
    if (toaster.mode === "3d") {
      // the 3D page: the clay of the object in hand, in the four views its sheet is drawn from
      const id = focus3d()?.id;
      try {
        strip = id && toaster.view.objectSheetStill(id, { cell: 256, type: "image/jpeg", quality: 0.88 })?.url;
      } catch {
        strip = null;
      }
      stripOf = id;
      const img = shell?.object.querySelector("img.ts-clay-strip");
      if (img && strip) img.src = strip;
      else drawRuns();
      return;
    }
    // the render: the clay as it is sent, the camera's view and each map, small
    try {
      clayLive = needLive() ? toaster.view.frameStill({ long: 1000, type: "image/jpeg", quality: 0.88 }) : null;
      stills.camera = toaster.view.frameStill({ long: 640, type: "image/jpeg", quality: 0.84 });
      for (const m of MAPS) stills[m.id] = hasClay() ? mapStill(m.id, 320) : null;
      if (mapShown) stills.big = mapStill(mapShown, 1200);
    } catch {}
    drawCameraCard();
    drawMaps();
    const big = mapShown && shell?.studioMain.querySelector("img.ts-map-big");
    if (big && stills.big) big.src = stills.big;
    const live = shell?.studioMain.querySelector("img.ts-clay-live");
    if (live && clayLive) live.src = clayLive;
    else if (needLive() && !live) drawRuns();
  }, 450);
}

// ---------------------------------------------------------------- the 3D page: the objects, one at a time

/** The object in hand on the 3D page: the one being made, else the one selected, else the first not made yet, else the first. */
function focus3d() {
  const objs = objectsNow();
  return objs.find((p) => p.id === gen.active?.id) ?? objs.find((p) => toaster.selected.includes(p.id)) ?? objs.find((p) => !modelOf(p.id)) ?? objs[0] ?? null;
}
const STATE_WORDS = { waiting: "to do", sheet: "drawing…", drawn: "sheet", model: "3D…", done: "3D" };
const sheetLabel = () => sheetModel()?.short ?? sheetModel()?.name ?? "the image model";

/** The bar over the page: the model that draws the sheets, what the whole would cost, and Make them one by one (or Stop). */
function drawBar3d() {
  const b = body();
  if (!b || !shell) return;
  const todo = objectsNow().filter((p) => !modelOf(p.id)).map((p) => p.id);
  const busy = !!gen.active || gen.queue.length > 0;
  const cost = costOf(todo);
  const t = gen.target;
  const free = !cost.paid;
  const words = free ? (route() === "local" ? "your GPU" : "GPU time") : cost.words;
  const models = modelItems();
  const asking = askedFor("queue");
  const now = gen.active ? partsNow().find((p) => p.id === gen.active.id) : null;
  const key = busy
    ? h("button.key.ts-wide", { type: "button", disabled: gen.stopping, on: { click: stopQueue } }, icon("close"), h("span", {}, gen.stopping ? "Stopping after this one…" : "Stop after this one"))
    : asking
      ? h("div.ts-armed", {},
        h("button.key.is-primary.ts-wide", { type: "button", on: { click: () => (askNot(), void makeThem(todo)) } }, h("span", {}, "Yes, make them"), h("em", {}, cost.words)),
        h("button.key.ts-not-now", { type: "button", on: { click: askNot } }, "Not now"))
      : h("button.key.is-primary.ts-wide", { type: "button", disabled: !todo.length || !toaster.view, title: todo.length ? "Each object in the list, from its sheet to its model, one after the other" : "Every object is made", on: { click: () => (free ? void makeThem(todo) : askFor("queue")) } },
        sprite("model-3d"), h("span", {}, todo.length ? `Make ${todo.length === 1 ? "the object" : `the ${todo.length} objects`}, one by one` : "All made"), todo.length ? h("em", {}, words) : null);
  shell.bar3d.replaceChildren(...[
    h("div.ts-bar3d-row", {},
      h("div.ts-setting", {}, h("span.ts-label", {}, "Sheets drawn by"),
        models.length ? h("div.ts-pick", { title: state.account?.openWeights ? "Open weights only is on: no partner model (Nano Banana, GPT Image…) is offered, so the sheets are drawn on open weights and cost no credits" : "" }, dropdown({ label: "Image model for the sheets", value: sheetModel()?.id, items: models, onChange: setSheetModel, note: state.account?.openWeights ? "Open weights only: no partner model draws the sheets" : "Draws each object's four views from its clay" })) : h("span.ts-note", {}, "No image model yet")),
      h("div.ts-setting", {}, h("span.ts-label", {}, "Models made by"),
        h("p.ts-where", { title: t?.local?.ok ? `ComfyUI at ${t.local.url}` : t?.local?.why ?? "" }, route() === "local" ? "Trellis2 on your ComfyUI" : "Pixal3D on Comfy Cloud", h("em", {}, route() === "local" ? "your GPU" : modelPrice().words))),
      h("div.ts-setting", {}, h("span.ts-label", {}, "Made so far"),
        h("p.ts-where", {}, `${objectsNow().filter((p) => modelOf(p.id)).length} of ${objectsNow().length}`, h("em", {}, `${objectsNow().filter((p) => stateOf(p.id) === "model").length ? "one being made" : "3D assets"}`))),
      h("span.spacer"), key),
    // (why the models are not made on your own ComfyUI, and what open weights leaves out: said under the row, so the two pickers never cross)
    [t && !t.local?.ok ? t.local?.why ?? "No ComfyUI of yours answered" : "", state.account?.openWeights ? "Open weights only: no partner model draws the sheets, and nothing costs a credit." : ""].filter(Boolean).map((why) => h("p.ts-hint", {}, icon("info"), h("span", {}, why))),
    busy ? h("p.ts-queue", {}, h("span.typing", {}, h("i"), h("i"), h("i")), h("span", {}, now ? `${now.name}: ${gen.active.step === "sheet" ? `${sheetLabel()} is drawing its four views` : modelRun(now.id)?.stage ?? "making its model"}` : "Next…"),
      h("b", {}, `${objectsNow().length - gen.queue.length + 1} of ${objectsNow().length}`)) : null].flat().filter(Boolean));
  if (route() === "cloud") loadCloudPrice();
}

/** The object in hand: its sheet (or its clay in the four views before it has one), the three steps, and the keys. */
function drawObject3d() {
  const b = body();
  if (!b || !shell) return;
  const p = focus3d();
  if (!p) return void shell.object.replaceChildren(head("Object", []), h("p.ts-empty", {}, "Add something to the scene: each object is made real here, one at a time."));
  const state = stateOf(p.id);
  const s = sheetRun(p.id);
  const m = modelRun(p.id);
  const mine = gen.active?.id === p.id;
  const busy = !!gen.active || gen.queue.length > 0;
  const sheet = sheetOf(p.id);
  const twin = objectsNow().filter((q) => q.id !== p.id && q.shape === p.shape && q.asset === p.asset && q.made === p.made).length;
  if (stripOf !== p.id) stripSoon();
  let pic;
  if (s?.status === "running") pic = h("div.ts-obj-pic.is-running", {}, s.frame ? h("img.ts-under", { src: s.frame.url, alt: "", draggable: false }) : null, progress(s, `${s.modelName ?? sheetLabel()} is drawing its four views`));
  else if (sheet && gen.look !== "clay") pic = h("button.ts-obj-pic", { type: "button", title: "Look at it, full size", on: { click: () => viewImage(sheet.photo.url) } }, h("img", { src: sheet.photo.url, alt: `${p.name}: front, back, left and right`, draggable: false }));
  else pic = strip && stripOf === p.id ? h("img.ts-obj-pic.ts-clay-strip", { src: strip, alt: `${p.name}'s clay: front, back, left and right`, draggable: false }) : h("div.ts-obj-pic.is-empty", {}, "Its four clay views show here.");
  const step = (n, label, note, on, doing, fail) => h(`li.ts-step${on ? ".is-done" : ""}${doing ? ".is-doing" : ""}${fail ? ".is-failed" : ""}`, {}, h("i", {}, on ? "✓" : String(n)), h("span", {}, label), h("em", {}, note));
  const modelNote = m?.status === "running" ? `${m.stage ?? "making"} · ${Math.round((m.progress ?? 0) * 100)}%` : m?.status === "done" ? (m.via === "cloud" ? "Pixal3D" : m.via === "sheet" ? "a box wearing its sheet" : m.via === "file" ? "your file" : "Trellis2") : m?.status === "failed" ? "failed" : route() === "local" ? "your GPU" : modelPrice().words;
  const price = costOf([p.id]);
  const asking = askedFor(p.id);
  const go = () => void makeObject(p.id);
  const key = asking
    ? h("div.ts-armed", {},
      h("button.key.is-primary.ts-wide", { type: "button", on: { click: () => (askNot(), go()) } }, h("span", {}, "Yes, make it"), h("em", {}, price.words)),
      h("button.key.ts-not-now", { type: "button", on: { click: askNot } }, "Not now"))
    : h("button.key.is-primary.ts-wide", { type: "button", disabled: busy || !toaster.view || state === "done", on: { click: () => (price.paid ? askFor(p.id) : go()) } },
      sprite("model-3d"), h("span", {}, state === "done" ? "Made" : sheet ? "Make its model" : "Make this one"), state !== "done" ? h("em", {}, price.paid ? price.words : "your GPU") : null);
  shell.object.replaceChildren(
    head(p.name, [s, m].filter(Boolean),
      keyIcon(sprite("view-persp"), gen.look === "clay" ? "Show its sheet" : "Show its clay, as the sheet is drawn from it", () => ((gen.look = gen.look === "clay" ? "sheet" : "clay"), drawObject3d()), { pressed: gen.look === "clay", disabled: !sheet, small: true }),
      keyIcon(sprite("image-history"), "Draw its sheet again, with the model that is chosen", () => void makeObject(p.id, { again: true }), { disabled: busy || !toaster.view || !sheet, small: true }),
      keyIcon(sprite("model-import"), "Use a 3D file (a GLB) you have as this object's model", () => pickModelFile(p.id), { disabled: busy, small: true }),
      keyIcon(sprite("shape-box"), "A thin thing (a board) the generator cannot build: stand it as a box wearing its sheet's front view", () => useSheetBox(p.id), { disabled: busy || !sheet, small: true }),
      keyIcon(icon("trash"), "Forget its sheet and model — the files stay in the Library", () => forgetObject(p.id), { disabled: busy || !(s || m), small: true })),
    h("div.ts-obj-body", {}, pic,
      h("div.ts-model-side", {},
        h("p.ts-meta", {}, state === "waiting" ? `${tiltOf(p) > 10 ? "Seen from above" : "Seen from the front"}, four views` : sheet ? `${s.modelName ?? "Sheet"} · ${sheet.cost ?? ""}`.trim() : "Drawing…", twin ? ` · one of ${twin + 1} alike: its own variation` : ""),
        h("ol.ts-steps", {},
          step(1, "Draw its four views", s?.status === "running" ? `${Math.round((s.progress ?? 0) * 100)}%` : sheet ? sheet.modelName ?? "" : s?.status === "failed" ? "failed" : sheetPrice().words, !!sheet, s?.status === "running", s?.status === "failed"),
          step(2, "Cut them: front, back, left, right", sheet ? "ready" : "", m?.status === "done", m?.status === "running" && (m.progress ?? 0) < 0.04),
          step(3, "Make its model", modelNote, m?.status === "done", m?.status === "running", m?.status === "failed")),
        s?.status === "failed" || m?.status === "failed" ? h("p.ts-err", {}, icon("close"), h("span", {}, (m?.status === "failed" ? m.error : s.error) ?? "That didn't work.")) : null,
        key,
        mine || !m?.url || m.via === "sheet" ? null : h("div.ts-keys", {},
          keyIcon(icon("download"), "Download its 3D file", null, { href: m.url, download: fileName(p.name, m.url) }),
          keyIcon(sprite("model-import"), "Put it on the Stage, as a prop", () => putOnStage(m, p.name).catch((e) => toast(e.message, { tone: "crit" })))))));
}

/** A GLB chosen from the person's disk, put on an object as its model. */
function pickModelFile(partId) {
  const input = h("input", { type: "file", accept: ".glb,model/gltf-binary", hidden: true, on: { change: async () => { const f = input.files?.[0]; input.remove(); if (f) await useFile(partId, f); } } });
  document.body.append(input);
  input.click();
}

/** The new scene: the finished models where their clay stood, the rest still clay. */
function drawNewScene3d() {
  const b = body();
  if (!b || !shell) return;
  if (!scene3d) {
    // (the object selected when the page opens is not zoomed to: the scene opens whole, and zooms only to what is picked after)
    scene3d = { el: h("div.ts-scene3d", { title: "Drag to turn the scene" }), handle: null, focused: toaster.selected.length === 1 ? toaster.selected[0] : null };
    const mine = scene3d;
    import("../toaster-scene3d.js").then(({ mountScene }) => {
      if (scene3d !== mine) return;
      mine.handle = mountScene(mine.el);
      drawNewScene3d();
    }).catch((e) => (mine.el.textContent = `The viewer could not start: ${e.message}`));
  }
  const made = objectsNow().filter((p) => modelOf(p.id)).length;
  const total = objectsNow().length;
  const say = h("p.ts-meta", {}, sceneView() === "blockout" ? `The clay blockout: ${total === 1 ? "one object as a placeholder" : `${total} objects as placeholders`}${made ? `. Press Assets to see ${made === 1 ? "the one" : `the ${made}`} made in 3D` : ""}` : made === total ? (total === 1 ? "The object is real 3D, where its clay was" : `All ${total} objects are real 3D, each where its clay was`) : made ? `${made} of ${total} objects are real 3D; the rest stays clay` : "Each model stands here where its clay was");
  shell.newScene.replaceChildren(
    head("New scene", b.models,
      h("div.ts-seg", { role: "group", "aria-label": "What the scene shows" }, ...[["blockout", "Blockout", "The clay blockout: every object as the placeholder it was drawn from"], ["assets", "Assets", "The 3D assets that are made, standing where their clay was (the rest stays clay)"]].map(([id, label, about]) =>
        h("button", { type: "button", "aria-pressed": String(sceneView() === id), title: about, on: { click: () => setSceneView(id) } }, label))),
      ...[["persp", "view-persp", "Three-quarter view"], ["front", "view-front", "From the front"], ["right", "view-side", "From the right"], ["back", "view-back", "From behind"], ["left", "view-side", "From the left"], ["top", "view-top", "From above"]].map(([side, glyph, label]) =>
        keyIcon(sprite(glyph), `${label}: the way to see how each object stands`, () => scene3d?.handle?.view(side), { small: true })),
      keyIcon(icon("download"), "Download the scene as one GLB", () => downloadScene(), { disabled: !made, small: true }),
      keyIcon(sprite("model-import"), "Put every model on the Stage, as props", () => putAllOnStage(), { disabled: !made, small: true })),
    scene3d.el, say);
  const focusId = toaster.selected.length === 1 ? toaster.selected[0] : null;
  scene3d.handle?.update(partsNow(), (id) => modelOf(id)?.url, sceneView()).then(() => {
    // (the selected object is brought close once, as it is picked; "Frame" keys go back out)
    if (focusId !== scene3d?.focused) (scene3d.focused = focusId), focusId && scene3d.handle?.focus(focusId);
  });
}
async function downloadScene() {
  try {
    const blob = await scene3d.handle.exportGlb();
    const a = h("a", { href: URL.createObjectURL(blob), download: fileName(`${toaster.draft?.name ?? "Toaster"} scene`, "x.glb") });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  } catch (e) {
    toast(`The scene could not be saved: ${e.message}`, { tone: "crit" });
  }
}
async function putAllOnStage() {
  for (const p of objectsNow()) {
    const m = modelOf(p.id);
    if (m) await putOnStage(m, p.name, { quiet: true }).catch((e) => toast(`${p.name}: ${e.message}`, { tone: "crit" }));
  }
  toast("The models are in the Stage's assets.", { action: { label: "Open the Stage", run: () => (location.hash = "#/stage") } });
}

function drawRight() {
  if (!shell || !body() || toaster.mode === "scene") return;
  if (toaster.mode === "render") return void (drawMaps(), drawRender());
  loadTarget();
  drawParts();
  drawBar3d();
  drawObject3d();
  drawNewScene3d();
}

// ---------------------------------------------------------------- the page

export function renderToaster(el) {
  if (!shell || !el.contains(shell.root)) build(el);
  // (after a failure only "Try again" reads the drafts again: a redraw does not, or a failing read would ask over and over)
  if (!toaster.error) loadDrafts();
  if (!toaster.models) loadModels();
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
  drawRecipe();
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
  // T goes between the Scene and the Render (from the 3D page it goes to the Render); D goes to the 3D page and back to the Render
  if (k === "t") return done(), setMode(toaster.mode === "render" ? "scene" : "render");
  if (k === "d") return done(), setMode(toaster.mode === "3d" ? "render" : "3d");
  // (in the render and on the 3D page the keys of the scene's editing rest: no part is deleted or moved from there)
  if (toaster.mode !== "scene") return k === "escape" ? select([]) : undefined;
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
