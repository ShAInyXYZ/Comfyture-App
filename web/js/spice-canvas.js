// The viewer's live compositor (FX): a canvas over the stage that draws the shot with its layers as the bake will (spice-layers.js), and
// the handles of the layer being worked on: a box around it to move it, four corners to scale it, a knob to turn it, and a small bar
// above it (duplicate, flip, delete). A tile of the library dropped on the picture is a new layer where it fell; a click on a layer
// selects it, a click on nothing lets go of it. The arrows nudge the layer held (Shift: ten times more), Delete removes it, Esc lets go.
//
//   const live = createLive(stage)
//   live.update(comp, env)   comp: { layers, sel, edge, finish } or null (not FX); env: { base, matte, aiOf, frame, fps, still, footageWidth }
//   live.draw()              draws the frame again (the viewer plays, a picture loaded)
//   live.holdsKeys()         whether the arrows are the layer's (not the frames')
import { h } from "./dom.js";
import { render, layerBox } from "./spice-layers.js";
import { elementOf, layerName } from "./spice-elements.js";
import { spicon } from "./spice-ui.js";
import { addLayer, selectLayer, patchLayer, pinLayer, commit, removeLayer, duplicateLayer, layerById, undo, redo } from "./spice-fx-ops.js";
import { followed, anchorAt, watchPlayhead } from "./spice-follow.js";

/** The kind of drag a library tile carries onto the picture. */
export const DRAG_TYPE = "application/x-spice-element";

const images = new Map();
/** An element's picture, loaded once; null until it has loaded (then `then` is called, to draw again). */
export function assetOf(src, then) {
  let img = images.get(src);
  if (!img) {
    img = new Image();
    img.decoding = "async";
    img.src = src;
    images.set(src, img);
    img.addEventListener("load", () => then?.(), { once: true });
  }
  return img.complete && img.naturalWidth ? img : null;
}

export function createLive(stage) {
  const st = { comp: null, env: null, drag: null };
  const canvas = h("canvas.sp-live", { hidden: true });
  const g = canvas.getContext("2d");
  const corner = (c) => h(`i.sp-gz-corner.is-${c}`, { dataset: { grab: "scale" } });
  const barKey = (icon, title, fn) => h("button.sp-gz-key", { type: "button", title, "aria-label": title, on: { pointerdown: (e) => e.stopPropagation(), click: (e) => (e.stopPropagation(), fn()) } }, spicon(icon));
  const label = h("b.sp-gz-name");
  const bar = h("div.sp-gz-bar", {},
    label,
    barKey("copy", "Duplicate (D)", () => st.comp?.sel && duplicateLayer(st.comp.sel)),
    barKey("flip", "Flip it", () => { const l = layerById(st.comp?.sel); if (l) patchLayer(l.id, { flipX: !l.flipX }); }),
    barKey("trash", "Remove it (Delete)", () => st.comp?.sel && removeLayer(st.comp.sel)));
  const gizmo = h("div.sp-gizmo", { hidden: true },
    h("i.sp-gz-stem"), h("i.sp-gz-rot", { dataset: { grab: "rotate" }, title: "Turn it" }),
    corner("nw"), corner("ne"), corner("sw"), corner("se"));
  // (the bar is the stage's own, not the box's: it stays on the picture however big or turned the box is)
  bar.hidden = true;
  // the centre lines a layer snaps to while it is moved, and what the picture says while it has no layer
  const guideX = h("i.sp-guide.is-x", { hidden: true });
  const guideY = h("i.sp-guide.is-y", { hidden: true });
  const empty = h("div.sp-live-empty", { hidden: true }, spicon("layers"), h("b", {}, "Drag an effect onto the picture"), h("span", {}, "from the library: then move it, scale it by a corner, turn it by its knob"));
  stage.append(canvas, gizmo, bar, guideX, guideY, empty);

  const stageSize = () => {
    const r = stage.getBoundingClientRect();
    return { w: r.width || 1, h: r.height || 1, r };
  };
  const ready = (m) => m && (m.tagName === "VIDEO" ? m.readyState >= 2 : m.complete !== false && (m.naturalWidth ?? 1) > 0);
  /** What a layer that follows Roto's subject needs: the matte clip and where the playhead is on it (null on a picture, or without a matte). */
  const matteAt = () => {
    const e = st.env;
    return e && !e.still && ready(e.matte) ? { matte: e.matte, frame: e.frame, fps: e.fps, matteFrom: e.matteFrom } : null;
  };
  /** A layer as it is seen on the picture now: where the subject has taken it, when it follows. */
  const seen = (l) => {
    const at = matteAt();
    return at ? followed(l, at) : l;
  };
  watchPlayhead(matteAt);
  const sourceOf = (l) => {
    const e = elementOf(l.el);
    if (e?.kind === "image") return assetOf(e.src, draw);
    if (e?.kind === "ai") return st.env?.aiOf?.(l) ?? null;
    return null;
  };
  const srcFor = (l) => (elementOf(l.el)?.kind === "image" ? assetOf(elementOf(l.el).src, draw) : null);

  /** The frame drawn again at the stage's size (its pixels, never more than the footage's). */
  function draw() {
    if (!st.comp || !st.env) return;
    const { w, h: hh } = stageSize();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const fw = st.env.footageWidth || 1920;
    const cw = Math.max(2, Math.round(Math.min(w * dpr, fw)));
    const ch = Math.max(2, Math.round(cw * (hh / w)));
    if (canvas.width !== cw || canvas.height !== ch) ((canvas.width = cw), (canvas.height = ch));
    const base = st.env.base;
    if (!ready(base)) return;
    render(g, cw, ch, {
      base, matte: ready(st.env.matte) ? st.env.matte : null, matteFrom: st.env.matteFrom, layers: st.comp.layers, frame: st.env.frame, fps: st.env.fps, still: st.env.still,
      sourceOf, edge: st.comp.edge, finish: st.comp.finish, footageWidth: fw,
    });
    // (a layer that follows and has no pin yet, turned on where no matte was, is pinned where the subject is the first time it is there to read)
    const at = matteAt();
    const anchor = at && st.comp.layers.some((l) => l.follow && !l.pin) ? anchorAt(at.matte, at) : null;
    if (anchor) for (const l of st.comp.layers) if (l.follow && !l.pin) pinLayer(l.id, anchor);
    place();
  }

  /** The handles around the layer being worked on, in the stage's own pixels. */
  function place() {
    const l = st.comp ? layerById(st.comp.sel) : null;
    gizmo.hidden = bar.hidden = !l || l.eye === false;
    if (gizmo.hidden) return;
    const { w, h: hh } = stageSize();
    const b = layerBox(seen(l), w, hh, srcFor(l));
    const kind = elementOf(l.el)?.kind;
    Object.assign(gizmo.style, { left: `${b.cx}px`, top: `${b.cy}px`, width: `${b.bw}px`, height: `${b.bh}px`, transform: `translate(-50%, -50%) rotate(${kind === "particles" ? 0 : b.rot}deg)` });
    gizmo.classList.toggle("is-round", kind === "ai");
    // the box as it stands on the picture (turned): the knob goes under it, or inside it, when there is no room above it
    const a = ((kind === "particles" ? 0 : b.rot) * Math.PI) / 180;
    const ex = Math.abs((b.bw / 2) * Math.cos(a)) + Math.abs((b.bh / 2) * Math.sin(a));
    const ey = Math.abs((b.bw / 2) * Math.sin(a)) + Math.abs((b.bh / 2) * Math.cos(a));
    const room = (y) => y > 44;
    const low = !room(b.cy - b.bh / 2) && b.cy + b.bh / 2 + 44 < hh;
    gizmo.classList.toggle("is-low", low);
    gizmo.classList.toggle("is-inside", !room(b.cy - b.bh / 2) && !low);
    gizmo.style.setProperty("--inset", `${Math.max(0, -(b.cy - b.bh / 2)) + 12}px`);
    // the bar above the box's top right corner, kept on the picture
    const bw = bar.offsetWidth || 150;
    const bh = bar.offsetHeight || 34;
    const above = b.cy - ey - bh - 10;
    const below = b.cy + ey + 10;
    const top = above >= 4 ? above : below + bh <= hh - 4 ? below : 4;
    Object.assign(bar.style, { left: `${Math.min(Math.max(4, b.cx + ex - bw), Math.max(4, w - bw - 4))}px`, top: `${top}px` });
    label.textContent = layerName(l);
  }

  // ---------------------------------------------------------------- the pointer

  const pointer = (e) => {
    const { r } = stageSize();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  /** The layer under a point, from the top of the stack; the particles (a whole frame) only when nothing else is there. */
  function hit(p) {
    const { w, h: hh } = stageSize();
    const shown = st.comp.layers.filter((l) => l.eye !== false).reverse();
    const inside = (l) => {
      const b = layerBox(seen(l), w, hh, srcFor(l));
      const a = (-(elementOf(l.el)?.kind === "particles" ? 0 : b.rot) * Math.PI) / 180;
      const dx = p.x - b.cx;
      const dy = p.y - b.cy;
      const lx = dx * Math.cos(a) - dy * Math.sin(a);
      const ly = dx * Math.sin(a) + dy * Math.cos(a);
      return Math.abs(lx) <= b.bw / 2 && Math.abs(ly) <= b.bh / 2;
    };
    return shown.find((l) => elementOf(l.el)?.kind !== "particles" && inside(l)) ?? shown.find((l) => inside(l)) ?? null;
  }

  stage.addEventListener("pointerdown", (e) => {
    if (!st.comp || e.button !== 0 || e.target.closest(".sp-wipe, .sp-drop, .sp-gz-bar")) return;
    const p = pointer(e);
    const grab = e.target.dataset?.grab;
    let l = layerById(st.comp.sel);
    if (!grab || !l) {
      const under = e.target.closest(".sp-gizmo") && l ? l : hit(p);
      if (!under) {
        if (st.comp.sel) selectLayer(null);
        return;
      }
      if (under.id !== st.comp.sel) selectLayer(under.id);
      l = layerById(under.id);
    }
    e.preventDefault();
    e.stopPropagation();
    stage.setPointerCapture(e.pointerId);
    const { w, h: hh } = stageSize();
    // (from where it is seen: a layer that follows is moved from where the subject has taken it, and pinned there when it is put down)
    const there = seen(l);
    const b = layerBox(there, w, hh, srcFor(l));
    st.drag = { id: l.id, mode: grab ?? "move", p0: p, x0: there.x, y0: there.y, s0: l.scale, r0: l.rot ?? 0, c: { x: b.cx, y: b.cy }, w, h: hh };
    stage.classList.add("is-handling");
  }, true);
  stage.addEventListener("pointermove", (e) => {
    const d = st.drag;
    if (!d) return;
    const p = pointer(e);
    let patch;
    if (d.mode === "move") {
      patch = { x: d.x0 + (p.x - d.p0.x) / d.w, y: d.y0 + (p.y - d.p0.y) / d.h };
      // it snaps to the picture's centre lines (Alt lets it go free)
      const snapX = !e.altKey && Math.abs(patch.x - 0.5) * d.w < 6;
      const snapY = !e.altKey && Math.abs(patch.y - 0.5) * d.h < 6;
      if (snapX) patch.x = 0.5;
      if (snapY) patch.y = 0.5;
      guideX.hidden = !snapX;
      guideY.hidden = !snapY;
    }
    else if (d.mode === "scale") {
      const k = Math.hypot(p.x - d.c.x, p.y - d.c.y) / Math.max(4, Math.hypot(d.p0.x - d.c.x, d.p0.y - d.c.y));
      patch = { scale: d.s0 * k };
    } else {
      const a = Math.atan2(p.y - d.c.y, p.x - d.c.x) - Math.atan2(d.p0.y - d.c.y, d.p0.x - d.c.x);
      let rot = d.r0 + (a * 180) / Math.PI;
      rot = ((rot + 540) % 360) - 180;
      // it snaps to the straight angles
      for (const s of [-180, -90, 0, 90, 180]) if (Math.abs(rot - s) < 3) rot = s;
      patch = { rot: Math.round(rot * 10) / 10 };
    }
    patchLayer(d.id, patch, { live: true });
    draw();
  }, true);
  const let_go = () => {
    if (!st.drag) return;
    st.drag = null;
    guideX.hidden = guideY.hidden = true;
    stage.classList.remove("is-handling");
    commit();
  };
  stage.addEventListener("pointerup", let_go, true);
  stage.addEventListener("pointercancel", let_go, true);

  // a tile of the library dropped on the picture
  stage.addEventListener("dragover", (e) => {
    if (!st.comp || !e.dataTransfer?.types.includes(DRAG_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    stage.classList.add("is-dropping");
  });
  stage.addEventListener("dragleave", () => stage.classList.remove("is-dropping"));
  stage.addEventListener("drop", (e) => {
    stage.classList.remove("is-dropping");
    const id = st.comp && e.dataTransfer?.getData(DRAG_TYPE);
    if (!id) return;
    e.preventDefault();
    e.stopPropagation();
    const p = pointer(e);
    const { w, h: hh } = stageSize();
    const el = elementOf(id);
    // a layer that covers the whole frame (rain, a light leak) keeps its own place; the others go where they fell
    addLayer(id, el?.kind === "particles" || (el?.scale ?? 0) >= 0.9 ? {} : { x: p.x / w, y: p.y / hh });
  });

  const typing = (t) => t?.closest?.("input, textarea, select, [contenteditable]");
  document.addEventListener("keydown", (e) => {
    if (!st.comp || !stage.isConnected || stage.closest("[hidden]") || typing(e.target)) return;
    // Ctrl+Z undoes a change of the layers, Ctrl+Shift+Z (or Ctrl+Y) does it again
    if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z" || e.key === "y")) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.key === "y" || e.shiftKey) redo();
      else undo();
      return;
    }
    if (e.ctrlKey || e.metaKey) return;
    const l = layerById(st.comp.sel);
    if (!l) return;
    const { w, h: hh } = stageSize();
    const step = e.shiftKey ? 10 : 1;
    const nudge = { ArrowLeft: [-step / w, 0], ArrowRight: [step / w, 0], ArrowUp: [0, -step / hh], ArrowDown: [0, step / hh] }[e.key];
    if (nudge) {
      e.preventDefault();
      e.stopImmediatePropagation();
      const there = seen(l);
      patchLayer(l.id, { x: there.x + nudge[0], y: there.y + nudge[1] }, { live: true });
      draw();
      clearTimeout(st.nudged);
      st.nudged = setTimeout(commit, 400);
    } else if (e.key === "Delete" || e.key === "Backspace") (e.preventDefault(), removeLayer(l.id));
    else if (e.key === "Escape") (e.preventDefault(), selectLayer(null));
    else if (e.key === "d" || e.key === "D") (e.preventDefault(), duplicateLayer(l.id));
  }, true);

  function update(comp, env) {
    st.comp = comp;
    st.env = env;
    canvas.hidden = !comp;
    stage.classList.toggle("is-comp", !!comp);
    empty.hidden = !comp || !env?.base || comp.layers.length > 0;
    if (!comp) {
      gizmo.hidden = bar.hidden = true;
      return;
    }
    draw();
    place();
  }
  new ResizeObserver(() => st.comp && draw()).observe(stage);

  return { el: canvas, update, draw, holdsKeys: () => !!(st.comp && layerById(st.comp.sel)) };
}
