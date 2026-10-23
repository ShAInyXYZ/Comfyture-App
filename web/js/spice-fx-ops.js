// What can be done to the FX layers of the shot open: add one from the library, select, change, hide, duplicate, reorder, remove. The
// viewer's handles (spice-canvas.js), the bentos (spice-fx.js) and Paprika all go through here. A change made while a handle or a slider
// is held is kept quietly (live: the page is not drawn again under the pointer) and drawn when it is let go (commit).
import { spice, edit, save } from "./spice.js";
import { newLayer, cleanLayer } from "./spice-elements.js";
import { fxGround } from "./spice-engines.js";

const fx = () => spice.shot?.body.set.fx ?? null;
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
  edit((b) => {
    b.set.fx.layers.push(l);
    b.set.fx.sel = l.id;
  });
  return l;
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
  Object.assign(l, clean);
  for (const k of Object.keys(l)) if (!(k in clean)) delete l[k];
  if (live) save();
  else edit(() => {});
  return l;
}
/** Draws the page again after a live change (a handle let go). */
export const commit = () => edit(() => {});

export function removeLayer(id) {
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
  edit((b) => {
    const i = b.set.fx.layers.findIndex((x) => x.id === id);
    b.set.fx.layers.splice(i + 1, 0, copy);
    b.set.fx.sel = copy.id;
  });
  return copy;
}
/** Moves a layer to a place in the stack (0 is the bottom). */
export function moveLayer(id, to) {
  edit((b) => {
    const list = b.set.fx.layers;
    const i = list.findIndex((l) => l.id === id);
    if (i < 0) return;
    const [l] = list.splice(i, 1);
    list.splice(Math.max(0, Math.min(list.length, to)), 0, l);
  });
}
export const toggleLayerEye = (id) => patchLayer(id, { eye: layerById(id)?.eye === false });
