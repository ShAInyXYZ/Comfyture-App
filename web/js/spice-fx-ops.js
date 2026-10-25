// What can be done to the FX layers of the shot open: add one from the library, select, change, hide, duplicate, reorder, remove. The
// viewer's handles (spice-canvas.js), the bentos (spice-fx.js) and Paprika all go through here. A change made while a handle or a slider
// is held is kept quietly (live: the page is not drawn again under the pointer) and drawn when it is let go (commit). Every change can be
// undone and done again (Ctrl+Z, Ctrl+Shift+Z): the layers as they were before it are kept, per shot, forty deep.
import { spice, edit, save } from "./spice.js";
import { newLayer, cleanLayer, cleanFinish, lookLayers } from "./spice-elements.js";
import { fxGround } from "./spice-engines.js";
import { anchorNow, followedNow } from "./spice-follow.js";

const fx = () => spice.shot?.body.set.fx ?? null;

// ---------------------------------------------------------------- undo

const histories = new Map();
const historyOf = () => {
  const id = spice.shot?.id ?? "";
  if (!histories.has(id)) histories.set(id, { undo: [], redo: [], holding: false });
  return histories.get(id);
};
const snapshot = () => JSON.stringify({ layers: fx()?.layers ?? [], sel: fx()?.sel ?? null, finish: fx()?.finish ?? null });
/** Keeps the layers as they are, before a change (a held change is kept once, when it starts). */
function remember({ live = false } = {}) {
  const h = historyOf();
  // (a held change was kept when it started: the change it ends with is the same step)
  if (h.holding) {
    if (!live) h.holding = false;
    return;
  }
  h.holding = live;
  const now = snapshot();
  if (h.undo.at(-1) !== now) h.undo.push(now);
  if (h.undo.length > 40) h.undo.shift();
  h.redo = [];
  // (the FX pass is no longer the layers as they stand: they wait to be baked again)
  if (fx()) fx().dirty = true;
}
function restore(from, to) {
  const h = historyOf();
  const back = h[from].pop();
  if (!back) return false;
  h[to].push(snapshot());
  const { layers, sel, finish } = JSON.parse(back);
  edit((b) => ((b.set.fx.layers = layers), (b.set.fx.sel = sel), (b.set.fx.finish = cleanFinish(finish)), (b.set.fx.dirty = true)));
  return true;
}
export const undo = () => restore("undo", "redo");
export const redo = () => restore("redo", "undo");
export const canUndo = () => historyOf().undo.length > 0;
export const canRedo = () => historyOf().redo.length > 0;
/** The layers of the shot open, bottom of the stack first. */
export const layersOf = () => fx()?.layers ?? [];
export const layerById = (id) => layersOf().find((l) => l.id === id) ?? null;
/** The layer being worked on, or null. */
export const selected = () => layerById(fx()?.sel);

/** Adds a layer of a library element (at x, y of the frame, or where the element likes to be) on top of the stack, and selects it. */
export function addLayer(el, at = {}) {
  const l = newLayer(el, at);
  if (!l) return null;
  // (an element that likes to be behind the people is, when Roto holds someone)
  if (!fxGround().matte) l.behind = false;
  remember();
  edit((b) => {
    b.set.fx.layers.push(l);
    b.set.fx.sel = l.id;
  });
  return l;
}
/** Lays a look (a few layers that go together) on top of the stack, in one step, and holds its top layer. */
export function addLook(id) {
  const list = lookLayers(id);
  if (!list.length) return [];
  const matte = !!fxGround().matte;
  for (const l of list) if (!matte) l.behind = false;
  remember();
  edit((b) => {
    b.set.fx.layers.push(...list);
    b.set.fx.sel = list.at(-1).id;
  });
  return list;
}
export function selectLayer(id) {
  if (fx()?.sel === id) return;
  edit((b) => (b.set.fx.sel = layerById(id) ? id : null));
}

/**
 * Changes a layer: its values are cleaned (kept inside their ranges). `live`: kept quietly while a handle or a slider is held, drawn when
 * it is let go (commit()).
 */
export function patchLayer(id, patch, { live = false } = {}) {
  const l = layerById(id);
  if (!l) return null;
  const next = { ...l, ...patch, id: l.id };
  // a layer that follows Roto's subject is placed where the subject is: turned on, or moved, it is pinned to the subject's anchor at the
  // playhead and sits where it is seen there (the axis a move does not name too: it keeps the place it is seen in); turned off, it stays
  // where it is seen. With no subject on that frame it is left as it is, and the viewer pins it when there is (spice-canvas.js)
  const on = patch.follow ?? !!l.follow;
  if (l.follow && !on) {
    const there = followedNow(l);
    Object.assign(next, { x: patch.x ?? there.x, y: patch.y ?? there.y, pin: null });
  } else if (on && (!l.follow || "x" in patch || "y" in patch)) {
    const anchor = anchorNow();
    if (anchor) {
      const there = l.follow ? followedNow(l) : l;
      Object.assign(next, { x: patch.x ?? there.x, y: patch.y ?? there.y, pin: anchor });
    }
  }
  const clean = cleanLayer(next);
  if (!clean) return null;
  remember({ live });
  Object.assign(l, clean);
  for (const k of Object.keys(l)) if (!(k in clean)) delete l[k];
  if (live) save();
  else edit(() => {});
  return l;
}
/** Draws the page again after a live change (a handle let go). */
export const commit = () => ((historyOf().holding = false), edit(() => {}));

/**
 * Pins a layer that follows and has no pin yet to where the subject is (the viewer does it the first time there is a matte to read it
 * from): not a change of the person's, so it is kept quietly, with no step of its own to undo and no page to draw again.
 */
export function pinLayer(id, anchor) {
  const l = layerById(id);
  if (!l?.follow || l.pin || !anchor) return;
  l.pin = cleanLayer({ ...l, pin: anchor }).pin;
  save();
}

/** The finish of the shot (its bloom and its vignette, each 0 to 1), cleaned. */
export const finishOf = () => cleanFinish(fx()?.finish);
/**
 * Changes the shot's finish: { bloom, vignette } or one of them, kept inside 0 to 1. Like a layer's, it can be undone, makes the baked
 * FX pass wait to be baked again, and `live` keeps it quietly while a slider is held.
 */
export function setFinish(patch, { live = false } = {}) {
  if (!fx()) return null;
  const clean = cleanFinish({ ...finishOf(), ...patch });
  remember({ live });
  fx().finish = clean;
  if (live) save();
  else edit(() => {});
  return clean;
}

export function removeLayer(id) {
  remember();
  edit((b) => {
    const i = b.set.fx.layers.findIndex((l) => l.id === id);
    if (i < 0) return;
    b.set.fx.layers.splice(i, 1);
    if (b.set.fx.sel === id) b.set.fx.sel = b.set.fx.layers[Math.min(i, b.set.fx.layers.length - 1)]?.id ?? null;
  });
}
/** A copy of a layer just above it, a little to the right and down, selected. */
export function duplicateLayer(id) {
  const l = layerById(id);
  if (!l) return null;
  const copy = cleanLayer({ ...structuredClone(l), id: `l-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, x: l.x + 0.04, y: l.y + 0.04 });
  remember();
  edit((b) => {
    const i = b.set.fx.layers.findIndex((x) => x.id === id);
    b.set.fx.layers.splice(i + 1, 0, copy);
    b.set.fx.sel = copy.id;
  });
  return copy;
}
/** Moves a layer to a place in the stack (0 is the bottom). */
export function moveLayer(id, to) {
  remember();
  edit((b) => {
    const list = b.set.fx.layers;
    const i = list.findIndex((l) => l.id === id);
    if (i < 0) return;
    const [l] = list.splice(i, 1);
    list.splice(Math.max(0, Math.min(list.length, to)), 0, l);
  });
}
export const toggleLayerEye = (id) => patchLayer(id, { eye: layerById(id)?.eye === false });
