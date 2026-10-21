// Motion graphics: a design that moves. Its layers carry their timing (when each comes in and goes, how, a
// logo's lid lifting and landing), the piece its length and frame rate. The preview and the render both
// call drawDesign() at a time, so what plays here is what the video is. The render sends every frame to
// the server one by one, where ffmpeg encodes them as an H.264 video.
import { h, icon, sprite } from "./dom.js";
import { dropdown } from "./controls.js";
import { toast } from "./store.js";
import { view } from "./viewer.js";
import { FORMAT_KEYS, FORMATS, EFFECTS, frameOf, prepare, missing, drawDesign, lacksLid } from "./design.js";
import {
  macaron, designById, designNow, kitNow, motionNow, pickMotion, addMotion, setMotion, setAnim, removeMotion, renderMotion, reflowFor, saveAs, edit, pickLayer,
} from "./macaron.js";
import { card, key, seg, chip, numberField, seconds, kb, arming, isArmed, armedNow } from "./macaron-ui.js";
import { soundPops } from "./macaron-layout.js";

const EASE_NAMES = { out: "Ease out", inout: "Ease in and out", back: "Overshoot", expo: "Snap", lin: "Linear", in: "Ease in" };

export function motionSection() {
  const el = h("div.mc-w.is-motion");
  const canvas = h("canvas.mc-stage-canvas");
  const bigPlay = h("button.mc-motion-play", { type: "button", title: "Play", "aria-label": "Play", on: { click: () => toggle() } }, icon("play"));
  const frame = h("div.mc-frame.is-motion", {}, canvas, bigPlay);
  const play = key(icon("play"), "Play", () => toggle(), { quiet: false });
  const scrub = h("input", { type: "range", min: 0, max: 6, step: 0.01, value: 0, "aria-label": "Time", on: { input: (e) => ((state.t = Number(e.target.value)), (state.playing = false), draw()) } });
  const time = h("span.mc-time", {}, "0.0 s");
  const state = { t: 0, playing: false, raf: 0, from: 0 };
  const rerender = () => update();

  function current() {
    const m = motionNow();
    const d = m && designById(m.design);
    return { m, d };
  }
  async function draw() {
    const { m, d } = current();
    if (!m || !d) return;
    const kit = kitNow();
    if (missing(d, kit)) await prepare(d, kit);
    const f = frameOf(m.format);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(240, Math.round((frame.clientWidth || 300) * dpr));
    const ph = Math.round((w * f.h) / f.w);
    if (canvas.width !== w || canvas.height !== ph) Object.assign(canvas, { width: w, height: ph });
    frame.style.setProperty("--ar", String(f.w / f.h));
    const ctx = canvas.getContext("2d");
    ctx.setTransform(w / f.w, 0, 0, w / f.w, 0, 0);
    drawDesign(ctx, d, { w: f.w, h: f.h, format: m.format, kit, t: state.t, reflow: reflowFor });
    scrub.value = state.t;
    time.textContent = `${seconds(state.t)} / ${seconds(m.duration)}`;
    el.style.setProperty("--t", String(Math.min(1, state.t / m.duration)));
  }
  function tick(now) {
    const { m } = current();
    if (!state.playing || !m) return;
    state.t += (now - state.from) / 1000;
    state.from = now;
    if (state.t >= m.duration) state.t = 0;
    draw();
    state.raf = requestAnimationFrame(tick);
  }
  function toggle() {
    state.playing = !state.playing;
    play.replaceChildren(icon(state.playing ? "pause" : "play"));
    play.title = state.playing ? "Pause" : "Play";
    el.classList.toggle("is-playing", state.playing);
    if (state.playing) {
      state.from = performance.now();
      state.raf = requestAnimationFrame(tick);
    }
  }

  const fxSelect = (d, l, which) => {
    const a = l.anim ?? {};
    const value = a[which]?.fx ?? "none";
    return h("select.field.mc-fx", { "aria-label": `${which === "in" ? "Comes in" : "Goes out"}: ${l.name}`, on: { change: (e) => {
      const fx = e.target.value;
      setAnim(d, l.id, { [which]: fx === "none" ? null : { dur: a[which]?.dur ?? (which === "in" ? 0.6 : 0.4), ease: a[which]?.ease ?? (fx === "pop" ? "back" : which === "in" ? "out" : "inout"), fx } });
    } } }, ...Object.entries(EFFECTS).filter(([k]) => which === "in" || k !== "ripple").map(([k, label]) => h("option", { value: k, selected: k === value }, label)));
  };

  /** A logo's own beat: its lid lifts off the C and lands on it, a little pop of the identity. */
  function lidRow(d, l, D) {
    const a = l.anim ?? {};
    return h("div.mc-trow-extra", {},
      h("span.label", {}, "Lid"),
      seg([[false, "Stays on"], [true, "Lifts and lands"]], !!a.lid, (v) => setAnim(d, l.id, { lid: v ? { t0: Math.round(((a.t0 ?? 0) + 0.9) * 100) / 100, dur: 0.5, lift: 0.4, rot: -16, ease: "back" } : null }), { cls: "is-small", label: "The lid" }),
      a.lid ? h("label.mc-axis", {}, h("span", {}, "Lands at"), numberField({ value: a.lid.t0 + (a.lid.dur ?? 0.5), min: 0, max: D, step: 0.05, suffix: "s", label: "The lid lands at", note: "Lid timing", set: (v) => (a.lid.t0 = Math.max(0, v - (a.lid.dur ?? 0.5))) })) : null);
  }

  /** A moment on the timeline: the playhead goes there. */
  const seek = (e, D) => {
    const r = e.currentTarget.getBoundingClientRect();
    state.t = Math.max(0, Math.min(D, ((e.clientX - r.left) / r.width) * D));
    state.playing = false;
    el.classList.remove("is-playing");
    draw();
  };

  /** One lane: the layer, its bar on the time ruler, and (when it is picked) its own controls. */
  function lane(l, m, d, D) {
    const a = l.anim ?? {};
    const t0 = a.t0 ?? 0;
    const t1 = a.t1 ?? D;
    const on = l.id === macaron.layer;
    const row = h(`div.mc-mlane${on ? ".is-on" : ""}`, {},
      h("button.mc-mlane-name", { type: "button", title: on ? "Close its controls" : "Its controls: how it comes in and goes", "aria-expanded": String(on), on: { click: () => pickLayer(on ? null : l.id) } }, h("i", { dataset: { type: l.type } }), h("span", {}, l.name)),
      h("span.mc-track", { title: "Click to move the playhead", on: { click: (e) => seek(e, D) } },
        h("i.mc-tbar", { style: { left: `${(t0 / D) * 100}%`, width: `${Math.max(0.5, ((t1 - t0) / D) * 100)}%` }, dataset: { fx: a.in?.fx ?? "none" } }, a.in?.fx && EFFECTS[a.in.fx] ? h("em", {}, EFFECTS[a.in.fx]) : null),
        a.lid ? h("i.mc-lid", { style: { left: `${((a.lid.t0 + (a.lid.dur ?? 0.6)) / D) * 100}%` }, title: "The lid lands" }) : null,
        a.settle ? h("i.mc-glide", { style: { left: `${(a.settle.t0 / D) * 100}%`, width: `${((a.settle.t1 - a.settle.t0) / D) * 100}%` }, title: "Settles into place" }) : null,
        h("i.mc-mph")));
    if (!on) return [row];
    const hasLid = l.type === "logo" && !lacksLid(kitNow().logos.find((x) => x.id === l.logo)?.url);
    return [row, h("div.mc-mlane-edit", {},
      h("label", {}, h("span.label", {}, "Comes in"), fxSelect(d, l, "in")),
      h("label", {}, h("span.label", {}, "Goes out"), fxSelect(d, l, "out")),
      h("label", {}, h("span.label", {}, "From"), numberField({ value: t0, min: 0, max: D, step: 0.1, suffix: "s", note: "Timing changed", label: `${l.name} comes in at`, set: (v) => setAnimQuiet(l, { t0: Math.max(0, Math.min(D, v)) }) })),
      h("label", {}, h("span.label", {}, "To"), numberField({ value: a.t1 ?? D, min: 0, max: D, step: 0.1, suffix: "s", note: "Timing changed", label: `${l.name} goes at`, set: (v) => setAnimQuiet(l, { t1: v >= D ? undefined : Math.max(t0, v) }) })),
      hasLid ? lidRow(d, l, D) : null)];
  }

  function timing(m, d) {
    const rows = [...d.layers].filter((l) => !l.hidden).sort((a, b) => (a.anim?.t0 ?? 0) - (b.anim?.t0 ?? 0));
    const D = m.duration;
    const step = D <= 8 ? 1 : 2;
    const ticks = Array.from({ length: Math.floor(D / step) + 1 }, (_, i) => i * step);
    return h("section.mc-sec.mc-timing", {},
      h("div.mc-sec-head", {}, h("span.label", {}, "Timeline"), chip(`${rows.length} layers`)),
      h("div.mc-mlanes", {},
        h("div.mc-mlane.is-ruler", {}, h("span"), h("span.mc-mruler", { title: "Click to move the playhead", on: { click: (e) => seek(e, D) } }, ...ticks.map((t) => h("i", { style: { left: `${(t / D) * 100}%` } }, h("em", {}, `${t}s`))), h("i.mc-mph"))),
        ...rows.flatMap((l) => lane(l, m, d, D))),
      h("p.mc-hint", {}, "Pick a layer to change how it comes in and goes. Easing: " + Object.values(EASE_NAMES).join(", ") + ". A logo's lid lifts and lands on its own beat."));
  }
  // timing typed into a field: kept as the field is typed, one step back when it is left
  const setAnimQuiet = (l, patch) => {
    l.anim = { ...(l.anim ?? { t0: 0 }), ...patch };
  };

  function pieces(m) {
    const list = macaron.brand.body.motion;
    return h("div.mc-pieces", {},
      list.length ? dropdown({ label: "Motion piece", value: m?.id, items: list.map((x) => ({ value: x.id, label: x.name, desc: `${x.format} · ${x.duration} s` })), onChange: (id) => pickMotion(id), width: "fit" }) : null,
      h("button.key.is-sm", { type: "button", title: "A motion piece from the post open in the editor", on: { click: () => (designNow() ? addMotion() : toast("Open a post first.")) } }, icon("plus"), "From the open design"),
      m ? key(icon("trash"), isArmed(`motion:${m.id}`) ? "Click again to delete" : "Delete this piece", () => arming(`motion:${m.id}`, rerender, () => removeMotion(m.id)), { on: isArmed(`motion:${m.id}`) }) : null);
  }

  /** The piece's own settings, each with its label above. */
  function settings(m, d) {
    const group = (label, ...body) => h("div.mc-mset", {}, h("span.label", {}, label), ...body);
    return h("section.mc-sec.mc-msettings", {},
      group("Format", h("div.mc-segs", { role: "group", "aria-label": "Format" }, ...FORMAT_KEYS.map((f) => h("button.mc-seg", { type: "button", title: FORMATS[f].name, "aria-pressed": String(m.format === f), on: { click: () => setMotion(m.id, { format: f }) } }, f)))),
      group("Length", h("label.mc-axis", {}, numberField({ value: m.duration, min: 2, max: 15, step: 0.5, suffix: "s", label: "Length in seconds", note: "Length", set: (v) => (m.duration = Math.max(2, Math.min(15, v))) }))),
      group("Frame rate", seg([[24, "24 fps"], [30, "30 fps"]], m.fps, (v) => setMotion(m.id, { fps: v }), { cls: "is-small", label: "Frame rate" })),
      group("Sound", seg([[true, "Soft sound"], [false, "Silent"]], !!m.sound?.pad, (v) => setMotion(m.id, { sound: { ...(m.sound ?? {}), pad: v, pops: v ? soundPops(d) : [] } }), { cls: "is-small", label: "Sound" })));
  }

  /** What leaves: the cover frame, the render with its progress, the video once it is made. */
  function result(m, d) {
    const prog = macaron.progress?.id === m.id ? macaron.progress : null;
    const r = m.render;
    const kind = (macaron.renderKind ?? "mp4").toUpperCase();
    return h("section.mc-sec.mc-mrender", {},
      r ? h("div.mc-result", {},
        h("button.mc-result-pic", { type: "button", title: "Play it", on: { click: () => view(r.url, "video") } }, h("img", { src: r.poster ?? "", alt: "", draggable: false }), h("span.mc-play", {}, icon("play"))),
        h("div.mc-result-text", {}, h("b", {}, m.name), h("em", {}, `${r.width}×${r.height} · ${seconds(r.duration)} · ${kb(r.bytes ?? 0)} · ${r.sound ? "with sound" : "silent"}`),
          h("div.mc-result-keys", {}, h("button.key", { type: "button", on: { click: () => saveAs(`${r.url}?download=${`${macaron.brand.name}-${m.name}-${r.format.replace(":", "x")}`.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.${r.container ?? "mp4"}`) } }, icon("download"), `Download ${(r.container ?? "mp4").toUpperCase()}`), h("button.key", { type: "button", on: { click: () => view(r.url, "video") } }, icon("play"), "Play"))))
        : h("p.mc-hint", {}, "Not rendered yet. The frames are drawn here and encoded on the server; a piece takes a little longer to make than it lasts."),
      prog ? h("div.mc-progress", {}, h("i", { style: { width: `${(prog.done / prog.total) * 100}%` } })) : null,
      h("div.mc-mrender-foot", {},
        h("button.mc-mcover", { type: "button", title: "Use the frame on the playhead as the poster for pictures of this piece", on: { click: () => (edit(() => (d.poster = Math.round(state.t * 100) / 100), "Poster set"), toast(`Poster at ${seconds(state.t)}.`)) } }, sprite("keyframe"), h("span", {}, "Cover frame here"), h("em", {}, d.poster != null ? seconds(d.poster) : "not set")),
        h("span.spacer"),
        seg([["mp4", "MP4"], ["webm", "WEBM"]], macaron.renderKind ?? "mp4", (v) => ((macaron.renderKind = v), rerender()), { cls: "is-small", label: "The kind of video" }),
        h(`button.mc-primary${prog ? ".is-busy" : ""}`, { type: "button", disabled: !!macaron.progress, on: { click: () => renderMotion(m.id, { container: macaron.renderKind ?? "mp4" }) } }, sprite("film-make"), prog ? `Frame ${Math.min(prog.total, prog.done)} of ${prog.total}` : `Export ${kind}`)));
  }
  function update() {
    const b = macaron.brand;
    if (!b) return;
    const { m, d } = current();
    const typing = el.contains(document.activeElement) && document.activeElement.matches("input, textarea, select");
    if (typing) return false;
    if (!m || !d) {
      el.replaceChildren(h("section.mc-sec.mc-mempty", {}, h("p.mc-hint", {}, "A motion piece plays a design: layers come in and go, a logo's lid lifts and lands. Make one from the open design."), pieces(m)));
      return;
    }
    scrub.max = m.duration;
    // a piece opens on its poster frame, so there is something to see before it plays
    if (state.piece !== m.id) ((state.piece = m.id), (state.t = d.poster ?? m.duration * 0.7));
    state.t = Math.min(state.t, m.duration);
    el.replaceChildren(
      h("div.mc-mleft", {}, pieces(m), frame, h("div.mc-transport", {}, play, scrub, time), h("p.mc-hint", {}, `${d.name} in ${FORMATS[m.format].name}, ${frameOf(m.format).w}×${frameOf(m.format).h}`)),
      h("div.mc-mright", {}, settings(m, d), timing(m, d), result(m, d)));
    draw();
  }
  window.addEventListener("resize", () => draw());
  const sig = () => JSON.stringify([macaron.brand?.body.motion, macaron.brand?.body.designs, macaron.motion, macaron.progress, macaron.layer, armedNow(), macaron.design]);
  return { el, update, draw, sig };
}
