// The viewer: the hero of the suite. The shot large: on the left of a draggable vertical wipe the clip the pass looked at ran on, on its
// right the clip it made (the plate alone when the plate is looked at); a frame counter in mono, the transport, a strip of the plate's
// frames to scrub, and under it THE CHAIN: the plate and every pass as chips in the order they were made, the one looked at lit, each
// with a key to take it off (it waits in the bin with the ones made on top of it). Made once and kept by the page: the clips that play are
// not made again when the page is drawn.
//
//   const viewer = createViewer({ drop() })
//   viewer.update({ shot, pass })    after the state changed (pass: the one looked at, null for the plate)
//   viewer.el, viewer.seek(frame), viewer.play(), viewer.pause(), viewer.sweep()
import { h } from "./dom.js";
import { onChange, changed } from "./store.js";
import { editStrip } from "./utensils-edit-api.js";
import { spice, setFrame, lookAt, takeOff } from "./spice.js";
import { FIRST, secondsAt, frameAt, lastFrame } from "./spice-model.js";
import { spicon, fill } from "./spice-ui.js";

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
  const st = { ctx: null, wipe: 0.5, fps: 24, big: false, loop: 0 };
  // the elements of the clips shown, by what they are ("before:url", "after:url"): kept while they are wanted
  const pool = new Map();

  const beforeBox = h("div.sp-plane.is-before");
  const afterBox = h("div.sp-plane.is-after");
  const wipe = h("div.sp-wipe", { role: "slider", "aria-label": "Before and after", "aria-valuemin": "0", "aria-valuemax": "100", tabindex: "0" }, h("i", {}, spicon("prev"), spicon("next")));
  const drop = h("button.sp-drop", { type: "button", hidden: true, on: { click: (e) => on.drop?.(e.currentTarget) } }, spicon("film"), h("b", {}, "Add a shot"), h("span", {}, "roll one with LTX-2.5, or drop a clip here"));
  const chipBefore = h("b.sp-chip.is-left", {}, "Before");
  const chipAfter = h("b.sp-chip.is-right", {}, "After");
  const stage = h("div.sp-stage", {}, beforeBox, afterBox, wipe, drop, chipBefore, chipAfter);
  const host = h("div.sp-stage-host", {}, stage);

  const counter = h("output.sp-counter", { "aria-label": "Frame" }, String(FIRST));
  const play = h("button.sp-iconkey.is-play", { type: "button", title: "Play or pause (Space)", "aria-label": "Play or pause", on: { click: () => (spice.playing ? pause() : playNow()) } }, spicon("play"));
  const key = (icon, title, fn) => h("button.sp-iconkey", { type: "button", title, "aria-label": title, on: { click: fn } }, spicon(icon));
  const keys = h("div.sp-transport", {}, key("first", "First frame", () => seek(FIRST)), key("prev", "Previous frame (Left)", () => seek(spice.frame - 1)), play, key("next", "Next frame (Right)", () => seek(spice.frame + 1)), key("last", "Last frame", () => seek(last())));
  const strip = h("div.sp-strip");
  const ruler = h("div.sp-ruler");
  const playhead = h("i.sp-playhead");
  const scrub = h("div.sp-scrub", {}, playhead);
  const time = h("div.sp-time", {}, h("div.sp-time-head", {}, counter, keys), strip, ruler, scrub);
  const chain = h("div.sp-chain", { role: "group", "aria-label": "The chain of passes" });
  const title = h("span.sp-b-label.sp-viewer-title");
  const expand = h("button.sp-expand", { type: "button", title: "Make the viewer large", "aria-label": "Make the viewer large", on: { click: () => toggleBig() } }, spicon("expand"));
  const el = h("section.sp-bento.sp-viewer", { role: "group", "aria-label": "Viewer" }, h("div.sp-b-head", {}, title, expand), host, time, chain);

  const plate = () => st.ctx?.shot?.plate ?? null;
  const last = () => lastFrame(plate(), st.fps);

  // ---------------------------------------------------------------- the clips on the stage

  function pooled(role, m, parent) {
    const k = `${role}:${m.url}`;
    if (!pool.has(k)) {
      const node = mediaEl(m);
      node.dataset.key = k;
      node.hidden = true;
      pool.set(k, node);
      // a clip that was set to a time before it could be is set again as soon as it knows its length
      if (node.tagName === "VIDEO") node.addEventListener("loadedmetadata", () => st.ctx && !spice.playing && show());
      parent.append(node);
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

  /** The clips shown at the frame the viewer is on: what the pass ran on, and what it made; the plate alone when the plate is looked at. */
  function show() {
    const c = st.ctx;
    if (!c) return;
    const { shot, pass } = c;
    st.fps = shot?.fps ?? 24;
    const before = pass ? pass.input : shot?.plate ?? null;
    const after = pass ? pass.media : null;
    const wanted = new Set();
    const beforeEl = before ? pooled("before", before, beforeBox) : null;
    const afterEl = after ? pooled("after", after, afterBox) : null;
    if (beforeEl) wanted.add(beforeEl.dataset.key);
    if (afterEl) wanted.add(afterEl.dataset.key);
    // what is no longer wanted is taken away (a clip no longer shown must not keep loading)
    for (const [k, node] of pool) {
      if (!wanted.has(k)) {
        node.pause?.();
        node.remove();
        pool.delete(k);
      } else node.hidden = false;
    }
    const t = secondsAt(spice.frame, st.fps);
    if (beforeEl) setTime(beforeEl, t);
    if (afterEl) setTime(afterEl, t);
    st.beforeEl = beforeEl;
    st.afterEl = afterEl;
    afterBox.hidden = !afterEl;
    wipe.hidden = !afterEl;
    chipBefore.hidden = !beforeEl || !afterEl;
    chipAfter.hidden = !afterEl;
    chipAfter.textContent = pass ? pass.name || pass.tool : "After";
    chipBefore.textContent = pass ? (pass.on ? "Before" : "Plate") : "Plate";
    counter.textContent = String(spice.frame);
    const span = Math.max(1, last() - FIRST);
    playhead.style.left = `${((spice.frame - FIRST) / span) * 100}%`;
  }

  // ---------------------------------------------------------------- transport

  function seek(frame) {
    const f = Math.min(Math.max(Math.round(frame), FIRST), last());
    pause();
    setFrame(f);
    show();
  }
  function playNow() {
    if (!st.beforeEl || plate()?.kind === "image") return;
    spice.playing = true;
    play.replaceChildren(spicon("pause"));
    if (spice.frame >= last()) setFrame(FIRST);
    show();
    for (const node of [st.beforeEl, st.afterEl]) node?.tagName === "VIDEO" && node.play().catch(() => {});
    cancelAnimationFrame(st.loop);
    const lead = st.beforeEl.tagName === "VIDEO" ? st.beforeEl : st.afterEl;
    const tick = () => {
      if (!spice.playing) return;
      const f = frameAt(lead.currentTime, st.fps);
      if (f >= last() || lead.ended) {
        setFrame(FIRST);
        pause();
        return;
      }
      if (f !== spice.frame) {
        setFrame(f);
        counter.textContent = String(f);
        playhead.style.left = `${((f - FIRST) / Math.max(1, last() - FIRST)) * 100}%`;
        // the other clip is kept in step with the lead
        for (const node of [st.beforeEl, st.afterEl]) {
          if (node === lead || node?.tagName !== "VIDEO") continue;
          if (Math.abs(node.currentTime - lead.currentTime) > 0.12) node.currentTime = lead.currentTime;
          if (node.paused) node.play().catch(() => {});
        }
      }
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
  /** The wipe swept to one side, to the other and back, so before and after are both seen (the tour's look). */
  async function sweep() {
    if (wipe.hidden) return;
    const from = st.wipe;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    for (const [a, b] of [[from, 0.08], [0.08, 0.92], [0.92, from]]) {
      if (still) {
        putWipe(b);
        await new Promise((r) => setTimeout(r, 700));
        continue;
      }
      await new Promise((done) => {
        const t0 = performance.now();
        const tick = (now) => {
          const u = Math.min(1, (now - t0) / 850);
          putWipe(a + (b - a) * (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2));
          if (u < 1) requestAnimationFrame(tick);
          else done();
        };
        requestAnimationFrame(tick);
      });
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  // ---------------------------------------------------------------- the timeline

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
    const p = plate();
    time.hidden = !p || p.kind === "image";
    if (time.hidden) return;
    const s = stripOf(p.file, () => changed("spice"));
    strip.style.backgroundImage = s?.url ? `url(${s.url})` : "none";
    strip.dataset.empty = s?.url ? "" : "1";
    fill(ruler, h("span", { style: { left: "0" } }, String(FIRST)), h("span", { style: { right: "0" } }, String(last())));
  }

  /** The chain: the plate, then each pass in order; a click looks at one, its key takes it off (with what was made on top of it). */
  function drawChain() {
    const { shot, pass } = st.ctx;
    if (!shot?.plate) return void fill(chain);
    const sel = pass?.id ?? "plate";
    const chip = (id, label, note, canOff) => h(`div.sp-link${sel === id ? ".is-on" : ""}`, { dataset: { pass: id } },
      h("button.sp-link-main", { type: "button", "aria-pressed": String(sel === id), title: note, on: { click: () => lookAt(id) } }, h("b", {}, label)),
      canOff ? h("button.sp-link-off", { type: "button", title: "Take this pass off: it waits in the bin, with what was made on top of it", "aria-label": `Take ${label} off`, on: { click: (e) => (e.stopPropagation(), takeOff(id)) } }, spicon("close")) : null);
    fill(chain,
      chip("plate", "Plate", shot.made ? "The plate: rolled by LTX-2.5" : "The plate: the footage as it came", false),
      ...shot.passes.flatMap((p) => [h("i.sp-link-arrow", {}, spicon("chev")), chip(p.id, p.name || p.tool, `${p.name}${p.words ? ` · ${p.words.slice(0, 80)}` : ""}${p.credits ? ` · ${p.credits} cr` : p.example ? " · example" : ""}`, true)]));
  }

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
    if (e.key === " " && !e.target.closest?.("button, a")) (e.preventDefault(), spice.playing ? pause() : playNow());
    else if (e.key === "ArrowLeft") (e.preventDefault(), seek(spice.frame - 1));
    else if (e.key === "ArrowRight") (e.preventDefault(), seek(spice.frame + 1));
  });
  // the frame set from elsewhere (Paprika, a key) moves the viewer
  onChange((scopes) => scopes.has("spice-frame") && st.ctx && !spice.playing && show());

  // ---------------------------------------------------------------- update

  function update(ctx) {
    st.ctx = ctx;
    const { shot, pass } = ctx;
    const p = shot?.plate ?? null;
    fill(title, h("b", {}, shot ? shot.name.toUpperCase() : "SPICE"), h("em", {}, pass ? `${(pass.name || pass.tool).toUpperCase()} · PASS ${shot.passes.indexOf(pass) + 1} OF ${shot.passes.length}` : p ? "THE PLATE" : "NO PLATE YET"));
    const shown = pass?.media ?? p;
    const ar = shown?.width && shown?.height ? shown.width / shown.height : 16 / 9;
    stage.style.setProperty("--ar", `${shown?.width || 16} / ${shown?.height || 9}`);
    stage.style.setProperty("--arn", String(ar));
    // the monitor around a stage of another shape is the footage again, blurred and dimmed, not a black bar
    const still = p?.still ?? (p?.kind === "image" ? p.url : null);
    host.style.setProperty("--sp-still", still ? `url("${still}")` : "none");
    stage.classList.toggle("is-empty", !p);
    drop.hidden = !!p;
    if (spice.frame > lastFrame(p, shot?.fps ?? 24)) setFrame(FIRST);
    show();
    drawTime();
    drawChain();
  }

  return { el, update, seek, pause, play: playNow, toggleBig, sweep };
}
