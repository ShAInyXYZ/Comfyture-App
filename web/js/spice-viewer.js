// The viewer: the hero bento of every department. The shot large, the footage on the left of a draggable vertical wipe and on its right
// what the open department has made of it; a frame counter in mono, the transport, and under it a slim timeline: the footage's frames and
// one bar a department showing the frames it worked on. Roto's subjects are tinted over the footage as a rubylith and its clicks are
// drawn on it; Paint's brush draws a mask over it. It is made once and kept by the page: the clips that play are not made again when a
// department is drawn, so the viewer is moved into the open department's grid.
//
//   const viewer = createViewer({ drop(anchor), point({x, y, neg}), mask(has) })
//   viewer.update({ dept, body, tool, points, brush })   after the state changed
//   viewer.el, viewer.seek(frame), viewer.play(), viewer.pause(), viewer.maskPNG(), viewer.hasMask(), viewer.clearMask()
import { h } from "./dom.js";
import { onChange, changed } from "./store.js";
import { editStrip } from "./utensils-edit-api.js";
import { spice, setFrame } from "./spice.js";
import { FIRST, STACK, secondsAt, frameAt, lastFrame, rangeOf, warpOf, layerAt, barsOf, pairOf } from "./spice-model.js";
import { WORKSPACES } from "./spice-harness.js";
import { spicon, fill, svg } from "./spice-ui.js";
import { createLive } from "./spice-canvas.js";
import { selectLayer, patchLayer, commit } from "./spice-fx-ops.js";
import { layerName } from "./spice-elements.js";

const strips = new Map();
/** A clip's thumbnails in one picture (the server makes it once per clip); null while it is made or when it cannot be. */
export function stripOf(file, redraw) {
  if (!strips.has(file)) {
    strips.set(file, null);
    editStrip(file, 24).then((s) => (strips.set(file, s), redraw())).catch(() => strips.set(file, { url: null }));
  }
  return strips.get(file);
}

const mediaEl = (m) =>
  m.kind === "image"
    ? h("img.sp-media", { src: m.url, alt: "", draggable: false })
    : h("video.sp-media", { src: m.url, muted: true, playsInline: true, preload: "auto", disablePictureInPicture: true });

export function createViewer(on = {}) {
  const st = { ctx: null, wipe: 0.5, fps: 24, big: false, loop: 0, key: "", warp: null, warpKey: "" };
  // the elements of the clips shown, by what they are ("before:url", "after:url", "ruby:url"): kept while they are wanted
  const pool = new Map();

  const beforeBox = h("div.sp-plane.is-before");
  const rubyFill = h("div.sp-ruby-fill");
  const ruby = h("div.sp-ruby", { hidden: true }, rubyFill);
  const shot = h("img.sp-media.sp-shot", { alt: "", hidden: true, draggable: false });
  const afterBox = h("div.sp-plane.is-after", {}, shot);
  beforeBox.append(ruby);
  const points = h("div.sp-points");
  const mask = h("canvas.sp-mask");
  const paint = document.createElement("canvas");
  const wipe = h("div.sp-wipe", { role: "slider", "aria-label": "Before and after", "aria-valuemin": "0", "aria-valuemax": "100", tabindex: "0" }, h("i", {}, spicon("prev"), spicon("next")));
  const drop = h("button.sp-drop", { type: "button", hidden: true, on: { click: (e) => on.drop?.(e.currentTarget) } }, spicon("film"), h("b", {}, "Drop a clip"), h("span", {}, "or click to pick one"));
  const note = h("span.sp-stage-note", { hidden: true });
  const chipBefore = h("b.sp-chip.is-left", {}, "Before");
  const chipAfter = h("b.sp-chip.is-right", {}, "After");
  // the edge of Roto's matte (feather and choke) is an SVG filter the matte's pictures are drawn through
  const edgeDefs = svg("sp-edge-defs", { width: "0", height: "0", focusable: "false" }, '<filter id="sp-edge" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB"><feMorphology operator="dilate" radius="0"/><feGaussianBlur stdDeviation="0"/></filter>');
  const stage = h("div.sp-stage", {}, beforeBox, afterBox, mask, points, wipe, drop, note, chipBefore, chipAfter, edgeDefs);
  const host = h("div.sp-stage-host", {}, stage);
  // FX: the shot with its layers, drawn live over the stage, and the handles of the layer held (spice-canvas.js)
  const live = createLive(stage);
  stage.insertBefore(live.el, mask);
  st.ai = new Map();

  const counter = h("output.sp-counter", { "aria-label": "Frame" }, String(FIRST));
  const play = h("button.sp-iconkey.is-play", { type: "button", title: "Play or pause (Space)", "aria-label": "Play or pause", on: { click: () => (spice.playing ? pause() : playNow()) } }, spicon("play"));
  const key = (icon, title, fn) => h("button.sp-iconkey", { type: "button", title, "aria-label": title, on: { click: fn } }, spicon(icon));
  const keys = h("div.sp-transport", {}, key("first", "First frame", () => seek(range().in)), key("prev", "Previous frame (Left)", () => seek(spice.frame - 1)), play, key("next", "Next frame (Right)", () => seek(spice.frame + 1)), key("last", "Last frame", () => seek(range().out)));
  const strip = h("div.sp-strip");
  const ruler = h("div.sp-ruler");
  const rows = h("div.sp-rows");
  const playhead = h("i.sp-playhead");
  const scrub = h("div.sp-scrub", {}, playhead);
  const time = h("div.sp-time", {}, h("div.sp-time-head", {}, counter, keys), strip, ruler, rows, scrub);
  const title = h("span.sp-b-label.sp-viewer-title");
  const expand = h("button.sp-expand", { type: "button", title: "Make the viewer large", "aria-label": "Make the viewer large", on: { click: () => toggleBig() } }, spicon("expand"));
  // (FX: the wipe between the shot and its layers comes and goes; the other departments always have it)
  const compare = h("button.sp-expand.sp-compare", { type: "button", hidden: true, title: "Compare before and after", "aria-label": "Compare before and after", "aria-pressed": "false", on: { click: () => ((st.compare = !st.compare), compare.setAttribute("aria-pressed", String(st.compare)), show()) } }, spicon("compare"));
  const picbar = h("div.sp-picbar", { hidden: true });
  const el = h("section.sp-bento.sp-viewer", { role: "group", "aria-label": "Viewer" }, h("div.sp-b-head", {}, title, compare, expand), host, time, picbar);

  const plate = () => st.ctx?.body.passes.plate ?? null;
  // Comp behind a slow motion has a timeline of its own, the footage's with the range stretched (warpOf): the viewer plays the whole of the slow
  // motion and holds the footage beside it at the same moments, slowed to match
  const warp = () => (st.ctx ? warpOf(st.ctx.body, st.ctx.dept) : null);
  const range = () => {
    if (!st.ctx) return { in: FIRST, out: FIRST };
    const w = warp();
    return w ? { in: w.in, out: w.out } : rangeOf(st.ctx.body);
  };
  const last = () => warp()?.last ?? lastFrame(plate());
  /** The frame of the footage at a frame of the timeline; and the frame a layer is read at (the slow motion is on the timeline's frames, the other passes on the footage's). */
  const footageAt = (f) => warp()?.toFootage(f) ?? f;
  const layerFrame = (layer, f) => (layer?.dept === "comp" ? f : footageAt(f));

  // ---------------------------------------------------------------- the clips on the stage

  function pooled(role, m, parent) {
    const k = `${role}:${m.url}`;
    if (!pool.has(k)) {
      const node = mediaEl(m);
      node.dataset.key = k;
      node.hidden = true;
      pool.set(k, node);
      // a clip the live compositor draws from is drawn again when it has its frame
      node.addEventListener(node.tagName === "VIDEO" ? "seeked" : "load", () => st.ctx?.comp && live.draw());
      if (node.tagName === "VIDEO") node.addEventListener("loadeddata", () => st.ctx?.comp && live.draw());
      // a clip that was set to a time before it could be is set again as soon as it knows its length
      if (node.tagName === "VIDEO") node.addEventListener("loadedmetadata", () => st.ctx && !spice.playing && show());
      // the footage goes under what is drawn over it (Roto's rubylith)
      if (role === "before") parent.prepend(node);
      else parent.append(node);
    }
    return pool.get(k);
  }
  /** Puts a clip at a time (a picture has none); it plays on its own when the viewer plays. */
  function setTime(node, t) {
    if (node.tagName !== "VIDEO" || !(node.readyState > 0)) return;
    const d = node.duration || 0;
    const to = Math.min(Math.max(0, t), Math.max(0, d - 0.02));
    if (Math.abs(node.currentTime - to) > 0.02) node.currentTime = to;
  }

  /** The clips of the open department, shown at the frame the viewer is on: the footage, the layer on the right of the wipe, Roto's matte over the footage. */
  function show() {
    const c = st.ctx;
    if (!c) return;
    const { body, dept } = c;
    const fps = plate()?.fps ?? 24;
    st.fps = fps;
    const wanted = new Set();
    const pair = pairOf(body, dept);
    const base = pair.before?.media;
    let baseEl = null;
    if (base) {
      baseEl = pooled("before", base, beforeBox);
      wanted.add(baseEl.dataset.key);
    }
    // FX draws its layers live over what it works on (its input), not over the pass it baked
    const comp = c.comp ?? null;
    const layer = comp ? (comp.base ? { media: comp.base, from: comp.baseFrom ?? FIRST, dept: "fx" } : null) : layerAt(body, dept, spice.frame);
    let afterEl = null;
    if (layer) {
      afterEl = pooled("after", layer.media, afterBox);
      wanted.add(afterEl.dataset.key);
    }
    // what the live compositor draws from without showing it: Roto's matte (the people held in front), the clips of the AI layers
    const aux = new Set();
    let holdEl = null;
    if (comp?.matte) {
      holdEl = pooled("hold", comp.matte, afterBox);
      aux.add(holdEl);
    }
    st.ai.clear();
    for (const l of comp?.layers ?? []) {
      if (l.el !== "ai" || !l.media?.url) continue;
      const n = pooled(`ai-${l.id}`, l.media, afterBox);
      st.ai.set(l.id, n);
      aux.add(n);
    }
    for (const n of aux) (wanted.add(n.dataset.key), n.classList.add("is-aux"));
    // Roto: the footage under its subjects' matte as a rubylith; its pass keeps the right of the wipe
    let matteEl = null;
    const matte = dept === "roto" && body.passes.roto?.type !== "green" ? body.passes.roto : null;
    if (matte?.media) {
      matteEl = pooled("ruby", matte.media, ruby);
      wanted.add(matteEl.dataset.key);
    }
    ruby.hidden = !matteEl;
    // what is no longer wanted is taken away (a clip no longer shown must not keep loading, nor sounding)
    for (const [k, node] of pool) {
      if (!wanted.has(k)) {
        node.pause?.();
        node.remove();
        pool.delete(k);
      } else node.hidden = !(node === baseEl || node === afterEl || node === matteEl || aux.has(node));
    }
    const t = secondsAt(spice.frame, fps);
    if (baseEl) {
      setTime(baseEl, secondsAt(footageAt(spice.frame), fps));
      // (beside a slow motion the footage is slowed too: the same moments, so not the same speed)
      const w = warp();
      baseEl.playbackRate = w ? w.n / w.m : 1;
    }
    if (matteEl) setTime(matteEl, t);
    if (afterEl) setTime(afterEl, secondsAt(layerFrame(layer, spice.frame) - (layer.from - FIRST), fps));
    if (holdEl) setTime(holdEl, secondsAt(spice.frame - ((comp.matteFrom ?? FIRST) - FIRST), fps));
    for (const l of comp?.layers ?? []) if (st.ai.has(l.id)) setTime(st.ai.get(l.id), secondsAt(spice.frame - ((l.from ?? FIRST) - FIRST), fps));
    // the right of the wipe is the footage again where the layer has not worked (and when there is nothing yet to show)
    // one real frame of what a free tool would make (Light's weather and grade), over the right of the wipe
    const preview = c.preview && c.preview.frame === spice.frame ? c.preview.url : null;
    shot.hidden = !preview;
    if (preview && shot.getAttribute("src") !== preview) shot.src = preview;
    afterBox.hidden = !afterEl && !preview;
    wipe.hidden = comp ? !st.compare : !afterEl && !preview;
    st.layer = layer;
    st.holdEl = holdEl;
    st.baseEl = baseEl;
    st.afterEl = afterEl;
    st.matteEl = matteEl;
    const sound = (node) => node?.tagName === "VIDEO" && (node.muted = true);
    [baseEl, afterEl, matteEl].forEach(sound);
    counter.textContent = String(spice.frame);
    const span = Math.max(1, last() - FIRST);
    playhead.style.left = `${((spice.frame - FIRST) / span) * 100}%`;
    chipAfter.textContent = layer ? (dept === "roto" ? "Matte" : dept === "plate" ? "Depth" : WORKSPACES.find((w) => w.id === layer.dept)?.name ?? "After") : "After";
    chipBefore.textContent = dept === "roto" ? "Footage · rubylith" : "Before";
    chipBefore.hidden = !base;
    chipAfter.hidden = !afterEl && !preview;
    if (preview) chipAfter.textContent = "Preview · 1 frame";
    // FX: the live composite, the whole stage, or the right of the wipe when comparing
    compare.hidden = !comp;
    if (comp) {
      chipBefore.hidden = chipAfter.hidden = !st.compare;
      chipAfter.textContent = "FX · live";
      live.el.style.clipPath = st.compare ? "inset(0 0 0 var(--wipe))" : "none";
    }
    live.update(comp, comp ? { base: afterEl ?? baseEl, matte: holdEl, matteFrom: comp.matteFrom, aiOf: (l) => st.ai.get(l.id) ?? null, frame: spice.frame, fps, still: plate()?.media.kind === "image", footageWidth: plate()?.media.width } : null);
  }

  // ---------------------------------------------------------------- transport

  function seek(frame) {
    const r = range();
    const f = Math.min(Math.max(Math.round(frame), r.in), r.out);
    pause();
    setFrame(f);
    show();
  }
  function playNow() {
    const p = plate();
    if (!p || p.media.kind === "image" || !st.baseEl) return;
    spice.playing = true;
    play.replaceChildren(spicon("pause"));
    const r = range();
    if (spice.frame >= r.out) setFrame(r.in);
    show();
    for (const node of [st.baseEl, st.afterEl, st.matteEl]) node?.tagName === "VIDEO" && node.play().catch(() => {});
    cancelAnimationFrame(st.loop);
    const tick = () => {
      if (!spice.playing) return;
      // (beside a slow motion the footage plays slowed: the frame it is at is a frame of the footage, and the timeline's is the one it maps to)
      const w = warp();
      const f = w ? Math.round(w.toComp(FIRST + st.baseEl.currentTime * st.fps)) : frameAt(st.baseEl.currentTime, st.fps);
      const rr = range();
      if (f >= rr.out || st.baseEl.ended) {
        setFrame(rr.in);
        pause();
        return;
      }
      if (f !== spice.frame) {
        setFrame(f);
        const before = st.layer?.media.url;
        const layer = layerAt(st.ctx.body, st.ctx.dept, f);
        // a layer that begins or ends here is swapped in; one that plays goes on playing, kept in step with the footage
        if (layer?.media.url !== before) show();
        else {
          counter.textContent = String(f);
          playhead.style.left = `${((f - FIRST) / Math.max(1, last() - FIRST)) * 100}%`;
        }
        for (const node of [st.afterEl, st.matteEl]) {
          if (node?.tagName !== "VIDEO") continue;
          const want = secondsAt(layerFrame(st.layer, f) - ((st.layer?.from ?? FIRST) - FIRST), st.fps);
          if (Math.abs(node.currentTime - want) > 0.12) node.currentTime = want;
          if (node.paused) node.play().catch(() => {});
        }
        const comp = st.ctx.comp;
        if (comp) {
          const sync = (node, from) => {
            if (node?.tagName !== "VIDEO") return;
            const want = secondsAt(f - (from - FIRST), st.fps);
            if (Math.abs(node.currentTime - want) > 0.12) node.currentTime = want;
            if (node.paused && want >= 0 && want < (node.duration || 0)) node.play().catch(() => {});
          };
          sync(st.holdEl, comp.matteFrom ?? FIRST);
          for (const l of comp.layers) sync(st.ai.get(l.id), l.from ?? FIRST);
        }
      }
      if (st.ctx?.comp) live.draw();
      st.loop = requestAnimationFrame(tick);
    };
    st.loop = requestAnimationFrame(tick);
  }
  function pause() {
    cancelAnimationFrame(st.loop);
    spice.playing = false;
    play.replaceChildren(spicon("play"));
    for (const node of pool.values()) node.pause?.();
  }

  // ---------------------------------------------------------------- the wipe

  function putWipe(x) {
    st.wipe = Math.min(1, Math.max(0, x));
    stage.style.setProperty("--wipe", `${(st.wipe * 100).toFixed(2)}%`);
    wipe.setAttribute("aria-valuenow", String(Math.round(st.wipe * 100)));
  }
  wipe.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    wipe.setPointerCapture(e.pointerId);
    wipe.classList.add("is-drag");
    const move = (ev) => {
      const r = stage.getBoundingClientRect();
      putWipe((ev.clientX - r.left) / r.width);
    };
    const up = () => (wipe.classList.remove("is-drag"), wipe.removeEventListener("pointermove", move), wipe.removeEventListener("pointerup", up));
    wipe.addEventListener("pointermove", move);
    wipe.addEventListener("pointerup", up);
  });
  wipe.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      e.stopPropagation();
      putWipe(st.wipe + (e.key === "ArrowLeft" ? -0.05 : 0.05));
    }
  });
  putWipe(0.5);

  // ---------------------------------------------------------------- the pointer on the picture: Roto's clicks, Paint's brush

  const unit = (e) => {
    const r = stage.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  };
  stage.addEventListener("pointerdown", (e) => {
    const tool = st.ctx?.tool;
    if (!tool || e.target.closest(".sp-wipe, .sp-drop") || e.button !== 0) return;
    if (tool === "points") {
      const [x, y] = unit(e);
      // the ones that are not on the subject are made with Shift or Alt
      on.point?.({ x, y, neg: e.shiftKey || e.altKey });
      return;
    }
    if (tool === "mask") {
      stage.setPointerCapture(e.pointerId);
      st.drawing = true;
      st.last = null;
      dab(e);
    }
  });
  stage.addEventListener("pointermove", (e) => st.drawing && dab(e));
  stage.addEventListener("pointerup", () => ((st.drawing = false), (st.last = null)));
  stage.addEventListener("pointercancel", () => ((st.drawing = false), (st.last = null)));

  let painted = false;
  function dab(e) {
    const [ux, uy] = unit(e);
    const w = paint.width;
    const x = ux * w;
    const y = uy * paint.height;
    const g = paint.getContext("2d");
    const size = Math.max(2, ((st.ctx?.brush?.size ?? 48) * w) / 1280);
    g.lineCap = g.lineJoin = "round";
    g.lineWidth = size;
    g.strokeStyle = g.fillStyle = "#fff";
    g.globalCompositeOperation = st.ctx?.brush?.tool === "eraser" ? "destination-out" : "source-over";
    g.beginPath();
    if (st.last) {
      g.moveTo(...st.last);
      g.lineTo(x, y);
      g.stroke();
    } else {
      g.arc(x, y, size / 2, 0, Math.PI * 2);
      g.fill();
    }
    st.last = [x, y];
    paintMask();
    if (!painted) ((painted = true), on.mask?.(true));
  }
  function paintMask() {
    const g = mask.getContext("2d");
    g.clearRect(0, 0, mask.width, mask.height);
    g.globalCompositeOperation = "source-over";
    g.drawImage(paint, 0, 0);
    g.globalCompositeOperation = "source-in";
    g.fillStyle = "rgba(242, 255, 89, .6)";
    g.fillRect(0, 0, mask.width, mask.height);
    g.globalCompositeOperation = "source-over";
  }
  function sizeMask(w, hgt) {
    if (paint.width === w && paint.height === hgt) return;
    paint.width = mask.width = w;
    paint.height = mask.height = hgt;
    painted = false;
  }

  // ---------------------------------------------------------------- the timeline

  /** The frame under the pointer on the timeline. */
  const frameUnder = (e) => {
    const r = scrub.getBoundingClientRect();
    return FIRST + Math.round(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * Math.max(0, last() - FIRST));
  };
  scrub.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    scrub.setPointerCapture(e.pointerId);
    st.scrubbing = true;
    seek(frameUnder(e));
  });
  scrub.addEventListener("pointermove", (e) => st.scrubbing && seek(frameUnder(e)));
  scrub.addEventListener("pointerup", () => (st.scrubbing = false));
  scrub.addEventListener("pointercancel", () => (st.scrubbing = false));

  function drawTime() {
    const c = st.ctx;
    const body = c.body;
    const p = plate();
    // a picture has no frames: a quiet bar says what it is instead of a timeline
    const pic = p?.media.kind === "image";
    time.hidden = pic;
    picbar.hidden = !pic;
    if (pic) {
      const n = c.comp?.layers.length ?? 0;
      fill(picbar, h("span", {}, `PICTURE · ${p.media.width} × ${p.media.height}`), h("span.spacer"), c.comp ? h("span", {}, `${n} ${n === 1 ? "LAYER" : "LAYERS"}`) : null);
      return;
    }
    const span = Math.max(1, last() - FIRST);
    const pct = (f) => `${(((f - FIRST) / span) * 100).toFixed(3)}%`;
    const s = p?.media.kind === "video" ? stripOf(p.media.file, () => changed("spice")) : null;
    strip.style.backgroundImage = s?.url ? `url(${s.url})` : "none";
    strip.dataset.empty = s?.url ? "" : "1";
    const r = range();
    const trimmed = r.in > FIRST || r.out < last();
    fill(strip,
      trimmed ? h("i.sp-range", { style: { left: pct(r.in), right: `calc(100% - ${pct(r.out)})` } }) : null);
    fill(ruler, h("span", { style: { left: "0" } }, String(FIRST)), h("span", { style: { right: "0" } }, String(last())));
    // FX on a clip: the rows are its layers (the top first), each a bar of the frames it plays on, to drag by its ends or whole
    rows.classList.toggle("is-layers", !!c.comp?.layers.length);
    if (c.comp?.layers.length) {
      fill(rows, ...[...c.comp.layers].reverse().map((l) => {
        const from = l.from ?? FIRST;
        const to = l.to ?? last();
        return h(`div.sp-row.is-layer${l.id === c.comp.sel ? ".is-open" : ""}${l.eye === false ? ".is-off" : ""}`, { dataset: { layer: l.id } },
          h("span", {}, layerName(l).toUpperCase()),
          h("div.sp-bar-track", {}, h("i.sp-bar.is-layer", { style: { left: pct(from), right: `calc(100% - ${pct(to)})` }, title: `Frames ${from} – ${to}: drag its ends, or the whole of it` }, h("b.is-in"), h("b.is-out"))));
      }));
      return;
    }
    const bars = barsOf(body, c.dept);
    // (a row for each department that has worked on the shot, and the one open: with seven departments the empty ones would take the stage's room)
    fill(rows, ...STACK.filter((d) => bars[d] || d === c.dept).map((d) => {
      const name = WORKSPACES.find((w) => w.id === d).name;
      const b = bars[d];
      return h(`div.sp-row${d === c.dept ? ".is-open" : ""}`, { dataset: { dept: d } },
        h("span", {}, name.toUpperCase()),
        h("div.sp-bar-track", {}, b ? h("i.sp-bar", { style: { left: pct(b[0]), right: `calc(100% - ${pct(b[1])})` } }) : null));
    }));
  }

  // a layer's bar on the timeline: its ends move where it starts and ends, its middle moves it whole; a click on its row holds the layer
  rows.addEventListener("pointerdown", (e) => {
    const rowEl = e.target.closest(".sp-row.is-layer");
    if (!rowEl || !st.ctx?.comp) return;
    const id = rowEl.dataset.layer;
    if (id !== st.ctx.comp.sel) selectLayer(id);
    const bar = e.target.closest(".sp-bar.is-layer");
    if (!bar) return;
    e.preventDefault();
    const track = bar.parentElement;
    const span = Math.max(1, last() - FIRST);
    const at = (ev) => {
      const r = track.getBoundingClientRect();
      return FIRST + Math.round(Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)) * span);
    };
    const l = st.ctx.comp.layers.find((x) => x.id === id);
    const was = { from: l.from ?? FIRST, to: l.to ?? last() };
    const grab = e.target.classList.contains("is-in") ? "in" : e.target.classList.contains("is-out") ? "out" : "all";
    const start = at(e);
    rows.setPointerCapture(e.pointerId);
    const move = (ev) => {
      const f = at(ev);
      const next = { ...was };
      if (grab === "in") next.from = Math.min(Math.max(FIRST, f), was.to);
      else if (grab === "out") next.to = Math.max(Math.min(last(), f), was.from);
      else {
        const d = Math.min(Math.max(f - start, FIRST - was.from), last() - was.to);
        next.from = was.from + d;
        next.to = was.to + d;
      }
      patchLayer(id, next, { live: true });
      bar.style.left = `${(((next.from - FIRST) / span) * 100).toFixed(3)}%`;
      bar.style.right = `calc(100% - ${(((next.to - FIRST) / span) * 100).toFixed(3)}%)`;
      live.draw();
    };
    const up = () => (rows.removeEventListener("pointermove", move), rows.removeEventListener("pointerup", up), commit());
    rows.addEventListener("pointermove", move);
    rows.addEventListener("pointerup", up);
  });

  // ---------------------------------------------------------------- big

  const veil = h("div.sp-veil", { hidden: true, on: { pointerdown: () => toggleBig(false) } });
  function toggleBig(on = !st.big) {
    st.big = on;
    el.classList.toggle("is-big", on);
    veil.hidden = !on;
    if (on) document.body.append(veil);
    expand.title = on ? "Make the viewer small (Esc)" : "Make the viewer large";
    expand.replaceChildren(spicon(on ? "close" : "expand"));
  }
  document.addEventListener("keydown", (e) => {
    if (!st.big || e.key !== "Escape") return;
    toggleBig(false);
  });
  // Space plays, the arrows step: only while the viewer is the page's own (no field is being typed in)
  document.addEventListener("keydown", (e) => {
    if (!el.isConnected || el.closest("[hidden]") || e.target.closest?.("input, textarea, select, [contenteditable], .sp-wipe") || e.ctrlKey || e.metaKey) return;
    // (Space on a key is that key's own press)
    if (e.key === " " && !e.target.closest?.("button, a")) (e.preventDefault(), spice.playing ? pause() : playNow());
    else if (e.key === "ArrowLeft") (e.preventDefault(), seek(spice.frame - 1));
    else if (e.key === "ArrowRight") (e.preventDefault(), seek(spice.frame + 1));
  });
  // the frame set from elsewhere (Paprika, a key) moves the viewer
  onChange((scopes) => scopes.has("spice-frame") && st.ctx && !spice.playing && show());

  // ---------------------------------------------------------------- update

  function update(ctx) {
    st.ctx = ctx;
    const { body, dept } = ctx;
    // a slow motion is longer than the footage: going into Comp or out of it keeps the moment the viewer is on (frame 1060 of the footage is
    // frame 1119 of a slow motion of 2×), and a slow motion that comes or goes while Comp is open does the same
    const warpNow = warpOf(body, dept);
    const warpKey = warpNow ? `${warpNow.in}:${warpNow.n}:${warpNow.m}` : "";
    if (warpKey !== st.warpKey) {
      const g = st.warp ? st.warp.toFootage(spice.frame) : spice.frame;
      pause();
      setFrame(Math.round(warpNow ? warpNow.toComp(g) : g));
      st.warp = warpNow;
      st.warpKey = warpKey;
    }
    const p = body.passes.plate;
    const info = WORKSPACES.find((w) => w.id === dept);
    fill(title, h("b", {}, info.name.toUpperCase()), h("em", {}, info.verb.toUpperCase()));
    const ar = p?.media.width && p?.media.height ? p.media.width / p.media.height : 16 / 9;
    stage.style.setProperty("--ar", `${p?.media.width || 16} / ${p?.media.height || 9}`);
    stage.style.setProperty("--arn", String(ar));
    stage.dataset.tool = ctx.tool ?? "";
    // the monitor around a stage of another shape is the footage again, blurred and dimmed, not a black bar
    const still = p?.media.still ?? (p?.media.kind === "image" ? p.media.url : null);
    host.style.setProperty("--sp-still", still ? `url("${still}")` : "none");
    // the edge: a choke grows (negative) or shrinks the matte, a feather softens it; the stage is a little smaller than the footage's pixels
    const edge = dept === "roto" ? ctx.edge : null;
    stage.style.setProperty("--sp-edge", edge ? "url(#sp-edge)" : "none");
    if (edge) {
      const k = (stage.getBoundingClientRect().width || 800) / (p?.media.width || 1280);
      const morph = edgeDefs.querySelector("feMorphology");
      morph.setAttribute("operator", edge.choke > 0 ? "erode" : "dilate");
      morph.setAttribute("radius", String(Math.round(Math.abs(edge.choke) * k * 10) / 10));
      edgeDefs.querySelector("feGaussianBlur").setAttribute("stdDeviation", String(Math.round(edge.feather * k * 10) / 10));
    }
    stage.classList.toggle("is-empty", !p);
    drop.hidden = !!p;
    drop.querySelector("b").textContent = dept === "plate" ? "Drop a clip" : "Start with the footage";
    drop.querySelector("span").textContent = dept === "plate" ? "or click to pick one" : "open the Plate";
    // the picture is the shot's own size, so a click or a brush stroke is in its frames' pixels
    sizeMask(p?.media.width || 1280, p?.media.height || 720);
    mask.hidden = ctx.tool !== "mask";
    if (ctx.tool !== "mask") painted = false;
    fill(points, ...(ctx.points ?? []).map((q) => h(`i.sp-point${q.neg ? ".is-neg" : ""}`, { style: { left: `${q.x * 100}%`, top: `${q.y * 100}%` } }, spicon(q.neg ? "minus" : "plus"))));
    note.hidden = !ctx.hint;
    note.textContent = ctx.hint ?? "";
    show();
    drawTime();
  }

  return {
    el, update, seek, pause, play: playNow, toggleBig,
    hasMask: () => painted,
    clearMask() {
      paint.getContext("2d").clearRect(0, 0, paint.width, paint.height);
      painted = false;
      paintMask();
      on.mask?.(false);
    },
    maskPNG: () => paint.toDataURL("image/png"),
  };
}
