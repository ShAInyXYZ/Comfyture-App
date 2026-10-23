// What can be done to the FX layers of the shot open: add one from the library, select, change, hide, duplicate, reorder, remove. The
// viewer's handles (spice-canvas.js), the bentos (spice-fx.js) and Paprika all go through here. A change made while a handle or a slider
// is held is kept quietly (live: the page is not drawn again under the pointer) and drawn when it is let go (commit). Every change can be
// undone and done again (Ctrl+Z, Ctrl+Shift+Z): the layers as they were before it are kept, per shot, forty deep.
import { spice, edit, save } from "./spice.js";
import { newLayer, cleanLayer, lookLayers } from "./spice-elements.js";
import { fxGround } from "./spice-engines.js";

const fx = () => spice.shot?.body.set.fx ?? null;

// ---------------------------------------------------------------- undo

const histories = new Map();
const historyOf = () => {
  const id = spice.shot?.id ?? "";
  if (!histories.has(id)) histories.set(id, { undo: [], redo: [], holding: false });
  return histories.get(id);
};
const snapshot = () => JSON.stringify({ layers: fx()?.layers ?? [], sel: fx()?.sel ?? null });
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
}
function restore(from, to) {
  const h = historyOf();
  const back = h[from].pop();
  if (!back) return false;
  h[to].push(snapshot());
  const { layers, sel } = JSON.parse(back);
  edit((b) => ((b.set.fx.layers = layers), (b.set.fx.sel = sel)));
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
  const clean = cleanLayer({ ...l, ...patch, id: l.id });
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
