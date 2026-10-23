// The FX department: a compositor. Every effect is a LAYER laid on the shot and handled on the picture itself (spice-canvas.js: drag it,
// scale it by a corner, turn it by its knob), shown live as the bake will make it (spice-layers.js). Its bentos:
//   LIBRARY  the effects (spice-elements.js) in groups: VFX elements shot on black, particles drawn frame by frame, and "Describe it",
//            an AI layer a model makes from words; a tile dropped on the picture is a layer where it fell, a click puts one in the middle.
//            Under them the yellow key bakes the layers into the FX pass, free, on this machine (spice-bake.js).
//   LAYERS   the stack, top first: select, hide, put behind the people, drag to reorder.
//   LOOK     the layer's blend, opacity, glow, soft edge and tint (particles: how many, how big, their colour; on a clip, how it moves);
//            an AI layer's words and the key that makes it (LTX on a clip, Qwen Image Edit on a picture: they cost credits).
//   PLACE    where it is (X, Y), how big, its angle (a dial), flips, behind the people or in front, and on a clip the frames it plays on.
// Made once and kept: { el, update, sig, slot, viewer }.
import { h } from "./dom.js";
import { state, toast, changed } from "./store.js";
import { spice, edit, setDept, workingOn } from "./spice.js";
import { ELEMENTS, FIRST, rangeOf, lastFrame, framesIn, ltxCredits, fxPrompt, elementById, TEMPLATES } from "./spice-model.js";
import { GROUPS, BLENDS, MOTIONS, TINTS, LOOKS, tilesOf, elementOf, layerName, newLayer } from "./spice-elements.js";
import { render } from "./spice-layers.js";
import { bento, spicon, primary, fill, iconKey, ghost } from "./spice-ui.js";
import { openWin, defineWindow } from "./spice-win.js";
import { work, frameOf, ltx, cloud, priceOf, fxGround } from "./spice-engines.js";
import { stripOf } from "./spice-viewer.js";
import { DRAG_TYPE } from "./spice-canvas.js";
import { bake } from "./spice-bake.js";
import { layersOf, selected, addLayer, addLook, selectLayer, patchLayer, removeLayer, duplicateLayer, moveLayer, toggleLayerEye, undo, redo, canUndo, canRedo } from "./spice-fx-ops.js";
import { slider } from "./utensils-fx-controls.js";
import { registerRunner } from "./spice-runs.js";
import { runnerReady } from "./utensils-cloud.js";

const fxSet = () => spice.shot.body.set.fx;
const isPicture = () => spice.shot?.body.passes.plate?.media.kind === "image";
const presetOf = (el) => (el?.preset ? state.presets.find((p) => p.id === el.preset) : null);
const presetAction = (el) => presetOf(el)?.script?.shots?.[0]?.action ?? "";
/** The AI effects a layer can be made as (Kitchen's presets: what LTX is told; on a picture, their words). */
const AI_PRESETS = ELEMENTS.filter((e) => e.preset);
let group = "all";

// ---------------------------------------------------------------- the library's tiles

const arts = new Map();
/** A particles tile's picture: the particles themselves, drawn once on black by the compositor. */
function particleArt(id) {
  if (arts.has(id)) return arts.get(id);
  const c = document.createElement("canvas");
  c.width = 240;
  c.height = 240;
  const g = c.getContext("2d");
  g.fillStyle = "#000";
  g.fillRect(0, 0, 240, 240);
  const l = newLayer(id, {}, 1);
  render(g, 240, 240, { base: c, layers: [{ ...l, amount: Math.min(1, (l.amount ?? 0.5) * 0.9), opacity: 1, glow: 0.3 }], still: true, frame: FIRST, fps: 24, pixel: 0.75 });
  const url = c.toDataURL("image/png");
  arts.set(id, url);
  return url;
}
function tileArt(e) {
  if (e.kind === "ai") return h("span.sp-lib-art.is-ai", {}, spicon("sparkle"));
  return h("span.sp-lib-art", {}, h("img", { src: e.kind === "image" ? e.thumb : particleArt(e.id), alt: "", draggable: false, loading: "lazy" }));
}
function tile(e, used) {
  const ai = e.kind === "ai";
  const price = ai ? (isPicture() ? priceOf("qwenedit", 1) : ltxCredits(5)) : null;
  return h(`button.sp-lib-tile${ai ? ".is-ai" : ""}`, {
    type: "button", draggable: true, dataset: { el: e.id },
    title: ai ? "Describe an effect and an AI model makes it (it costs credits): place its circle first" : `${e.name}: drag it onto the picture, or click to add it`,
    on: {
      click: () => addLayer(e.id),
      dragstart: (ev) => (ev.dataTransfer.setData(DRAG_TYPE, e.id), (ev.dataTransfer.effectAllowed = "copy")),
    },
  }, tileArt(e), h("span.sp-lib-name", {}, e.name), ai ? h("em.sp-lib-price", {}, `AI · ≈ ${price ?? "?"} cr`) : null, used ? h("i.sp-lib-used", { title: "On the shot" }) : null);
}

// ---------------------------------------------------------------- the bake

/** What baking needs and what stops it; the layers' signature tells whether the FX pass is the layers as they stand. */
function bakePlan() {
  const b = spice.shot?.body;
  const layers = layersOf().filter((l) => l.eye !== false && (l.el !== "ai" || l.media));
  const ground = fxGround(b);
  const sig = JSON.stringify([layers, ground.base?.url, ground.matte?.url, b?.range, b?.set.roto.feather, b?.set.roto.choke]);
  const why = !ground.base ? "Bring the footage to the Plate first" : !layers.length ? "Add a layer from the library first" : "";
  return { layers, ground, sig, why, done: !!b?.passes.fx?.media && b.set.fx.baked === sig };
}

function runBake() {
  const shot = spice.shot;
  const b = shot.body;
  const { layers, ground, sig } = bakePlan();
  const plate = b.passes.plate;
  const r = rangeOf(b);
  const n = layers.length;
  return work("fx", `Bake ${n} ${n === 1 ? "layer" : "layers"}`, async (progress) => {
    const made = await bake({
      base: ground.base, baseFrom: ground.baseFrom, matte: ground.matte, matteFrom: ground.matteFrom, layers, edge: { feather: b.set.roto.feather, choke: b.set.roto.choke },
      width: plate.media.width, height: plate.media.height, fps: plate.fps ?? 24, range: r, name: `${shot.name} · FX`,
    }, progress);
    edit((x) => (x.set.fx.baked = sig), shot);
    return { files: made, from: plate.media.kind === "image" ? FIRST : r.in, to: plate.media.kind === "image" ? FIRST : r.out };
  }, { note: `${n} ${n === 1 ? "layer" : "layers"} baked`, source: "free" });
}

// ---------------------------------------------------------------- an AI layer, made

/** What making an AI layer costs and what stops it. */
function aiPlan(l) {
  const b = spice.shot.body;
  const pic = isPicture();
  const fps = b.passes.plate?.fps ?? 24;
  const r = rangeOf(b);
  const from = l.from ?? r.in + Math.floor((r.out - r.in) / 2);
  const to = l.to ?? r.out;
  const seconds = Math.min(10, Math.max(2, Math.round((to - from + 1) / fps)));
  const words = String(l.words ?? "").trim() || presetAction(elementById(l.preset));
  const why = !b.passes.plate ? "Bring the footage to the Plate first" : !words ? "Say what the effect is, or pick one" : !runnerReady() && pic ? "The template runner is not on this page yet" : "";
  return { pic, from, to, seconds, words, why, cost: pic ? priceOf("qwenedit", 1) : ltxCredits(seconds) };
}

function makeAi(l) {
  const shot = spice.shot;
  const b = shot.body;
  const p = aiPlan(l);
  const fps = b.passes.plate?.fps ?? 24;
  const place = { x: l.x, y: l.y, size: Math.min(1, l.scale) };
  const label = `AI · ${p.words.split(/\s+/).slice(0, 3).join(" ")}`;
  const keep = (m, sh) => edit((x) => {
    const layer = x.set.fx.layers.find((y) => y.id === l.id);
    if (!layer) return;
    Object.assign(layer, { media: m, from: p.pic ? null : p.from, to: p.pic ? null : p.from + framesIn(m.seconds ?? p.seconds, fps) - 1, note: label, credits: p.cost ?? 0 });
    if (p.cost) x.log = [...x.log, { at: new Date().toISOString(), dept: "fx", label, credits: p.cost }].slice(-200);
  }, sh);
  if (p.pic) {
    // a picture: Qwen Image Edit makes the whole picture again with the effect; the layer keeps it in its circle
    const where = fxPrompt("", { place, depth: l.behind ? "behind" : "front", intensity: 0.6, spill: 0.5 });
    const words = `${p.words}. ${where} Keep everything else in the picture exactly as it is: the people, their faces, the light and the framing.`;
    return work("fx", label, async (progress, job) => ({ files: await cloud("qwenedit", { image: fxGround(b).base, text: words })(progress, job) }), { credits: p.cost ?? 0, source: "cloud", keep });
  }
  // a clip: LTX makes the shot again from the frame the effect starts on; the layer keeps it in its circle, on its frames
  return work("fx", label, async (progress, job) => {
    const g = fxGround(b);
    const photo = await frameOf(g.base, Math.max(0, (p.from - g.baseFrom) / fps));
    const out = await ltx({ photo, prompt: fxPrompt(p.words, { ...b.set.fx, words: p.words, place, depth: l.behind ? "behind" : "front" }), seconds: p.seconds, name: `${shot.name} · ${label}` })(progress, job);
    return { files: out };
  }, { credits: p.cost ?? 0, source: "cloud", keep });
}

// ---------------------------------------------------------------- the bentos' bodies

function libraryBody(big) {
  const used = new Set(layersOf().map((l) => l.el));
  const pl = bakePlan();
  const busy = workingOn("fx");
  const n = pl.layers.length;
  const key = primary({
    id: "fx:bake", label: busy ? "Working" : pl.done ? "Baked" : !n ? "Add a layer to bake" : spice.shot.body.passes.fx?.media && spice.shot.body.set.fx.baked ? "Bake again" : `Bake ${n} ${n === 1 ? "layer" : "layers"}`, working: !!busy, disabled: !!pl.why || pl.done,
    title: pl.why || (pl.done ? "The FX pass is these layers: change one to bake again" : "Makes the layers part of the shot, at its full size: free, on this machine"), run: runBake,
  });
  if (!busy && !pl.done && !pl.why) key.append(h("em", {}, "· free"));
  return h(`div.sp-lib${big ? ".is-big" : ""}`, {},
    big ? h("div.sp-looks.is-lib", {}, h("span.ut-label", {}, "Looks"), ...LOOKS.map((k) => h("button.sp-pill", { type: "button", dataset: { look: k.id }, title: k.layers.map((x) => elementOf(x.el).name).join(", "), on: { click: () => addLook(k.id) } }, k.name))) : null,
    h("div.sp-lib-groups", { role: "group", "aria-label": "Groups" }, ...GROUPS.map(([id, name]) =>
      h("button.sp-pill", { type: "button", "aria-pressed": String(group === id), on: { click: () => ((group = id), changed("spice")) } }, name))),
    h("p.sp-lib-hint", {}, "Drag onto the picture"),
    h("div.sp-lib-grid", {}, ...tilesOf(group).map((e) => tile(e, used.has(e.id)))),
    h("div.sp-lib-key", {}, key));
}

function layersBody(big) {
  const list = layersOf();
  const sel = selected();
  const hasMatte = !!fxGround().matte;
  const history = h("div.sp-fxls-head", {},
    iconKey(spicon("undo"), "Undo (Ctrl+Z)", undo, { disabled: !canUndo() }),
    iconKey(spicon("redo"), "Redo (Ctrl+Shift+Z)", redo, { disabled: !canRedo() }));
  if (!list.length) {
    return h("div.sp-fxls.is-empty", {}, canUndo() ? history : null,
      h("p.sp-hint", {}, "No layer yet. Drag an effect from the library onto the picture, or start from a look:"),
      h("div.sp-looks", {}, ...LOOKS.map((k) => h("button.sp-pill", { type: "button", dataset: { look: k.id }, title: `${k.name}: ${k.layers.map((x) => elementOf(x.el).name).join(", ")}`, on: { click: () => addLook(k.id) } }, k.name))));
  }
  const rows = [...list].reverse().map((l) => {
    const e = elementOf(l.el);
    const pic = e.kind === "image" ? h("img", { src: e.thumb, alt: "", draggable: false }) : e.kind === "particles" ? h("img", { src: particleArt(e.id), alt: "", draggable: false }) : l.media ? (l.media.kind === "image" ? h("img", { src: l.media.url, alt: "", draggable: false }) : h("video", { src: `${l.media.url}#t=0.5`, muted: true, preload: "metadata" })) : spicon("sparkle");
    const row = h(`div.sp-fxl${l.id === sel?.id ? ".is-on" : ""}${l.eye === false ? ".is-off" : ""}`, {
      draggable: true, dataset: { layer: l.id },
      on: {
        click: (ev) => !ev.target.closest("button") && selectLayer(l.id),
        dragstart: (ev) => ev.dataTransfer.setData("application/x-spice-layer", l.id),
        dragover: (ev) => ev.dataTransfer.types.includes("application/x-spice-layer") && (ev.preventDefault(), row.classList.add("is-over")),
        dragleave: () => row.classList.remove("is-over"),
        drop: (ev) => {
          row.classList.remove("is-over");
          const id = ev.dataTransfer.getData("application/x-spice-layer");
          if (!id || id === l.id) return;
          ev.preventDefault();
          moveLayer(id, layersOf().findIndex((x) => x.id === l.id));
        },
      },
    },
      h("i.sp-fxl-grip", { title: "Drag to put it higher or lower" }, spicon("grip")),
      h("span.sp-fxl-pic", {}, pic),
      h("span.sp-fxl-text", {}, h("b", {}, layerName(l)), h("em", {}, l.el === "ai" && !l.media ? "NOT MADE" : (BLENDS.find((x) => x.id === l.blend)?.name ?? "").toUpperCase())),
      h("button.sp-fxl-key", { type: "button", "aria-pressed": String(!!l.behind), "aria-label": "Behind the people", disabled: !hasMatte && !l.behind, title: !hasMatte ? "Cut the people out in Roto first, to put it behind them" : l.behind ? "Behind the people: put it in front" : "In front: put it behind the people", on: { click: () => patchLayer(l.id, { behind: !l.behind }) } }, spicon("person")),
      h("button.sp-fxl-key", { type: "button", "aria-pressed": String(l.eye !== false), "aria-label": "Shown", title: l.eye === false ? "Show it" : "Hide it", on: { click: () => toggleLayerEye(l.id) } }, spicon(l.eye === false ? "eyeOff" : "eye")));
    return row;
  });
  return h(`div.sp-fxls${big ? ".is-big" : ""}`, {}, history, ...rows);
}

const segs = (list, value, set, title) => h("div.ut-segs.sp-segs", { role: "group", title }, ...list.map(([v, label]) => h("button.ut-seg", { type: "button", "aria-pressed": String(value === v), on: { click: () => set(v) } }, label)));
const row = (label, control) => h("div.sp-look-row", {}, h("span.ut-label", {}, label), control);
const live = (id, key) => (v, quiet) => patchLayer(id, { [key]: v }, { live: quiet });

function swatches(l, key, list, none = true) {
  return h("div.sp-swatches", { role: "group", "aria-label": "Colour" },
    ...(none ? [h("button.sp-swatch.is-none", { type: "button", "aria-pressed": String(!l[key]), title: "Its own colour", on: { click: () => patchLayer(l.id, { [key]: "" }) } })] : []),
    ...list.map((c) => h("button.sp-swatch", { type: "button", style: { "--c": c }, "aria-pressed": String(l[key] === c), title: c, on: { click: () => patchLayer(l.id, { [key]: c }) } })),
    h("label.sp-swatch.is-pick", { title: "Any colour" }, h("input", { type: "color", value: l[key] || "#ffffff", on: { input: (e) => patchLayer(l.id, { [key]: e.target.value }, { live: true }), change: (e) => patchLayer(l.id, { [key]: e.target.value }) } })));
}

function aiLook(l, big) {
  const p = aiPlan(l);
  const busy = workingOn("fx");
  const words = h("textarea.ut-words.sp-words", {
    rows: 3, value: l.words ?? "", placeholder: presetAction(elementById(l.preset)) || (p.pic ? "A glowing portal opening behind her" : "A portal of orange sparks opens behind her"),
    "aria-label": "What the effect is", on: { input: (e) => patchLayer(l.id, { words: e.target.value }, { live: true }), change: () => patchLayer(l.id, {}) },
  });
  // (the window offers the presets as chips; the bento as a list, so the words and the key fit)
  const pick = (v) => patchLayer(l.id, { preset: v });
  return h(`div.sp-look.is-ai${big ? ".is-big" : ""}`, {},
    big
      ? h("div.sp-ai-presets", {}, ...AI_PRESETS.map((e) => h("button.sp-pill", { type: "button", "aria-pressed": String(l.preset === e.preset), title: presetAction(e) || e.name, on: { click: () => pick(e.preset) } }, e.name)))
      : row("Effect", h("select.ut-select", { "aria-label": "The effect", on: { change: (ev) => pick(ev.target.value) } }, h("option", { value: "", selected: !l.preset }, "My words"), ...AI_PRESETS.map((e) => h("option", { value: e.preset, selected: l.preset === e.preset }, e.name)))),
    words,
    big ? h("p.sp-hint", {}, p.pic ? "Qwen Image Edit makes the picture again with it; the layer keeps it inside its circle." : "LTX makes the shot again from the frame it starts on; the layer keeps it inside its circle, on its frames.") : null,
    primary({ id: `fx:ai:${l.id}`, label: l.media ? "Make it again" : "Make it", cost: p.cost, working: !!busy, disabled: !!p.why, title: p.why || (p.pic ? TEMPLATES.qwenedit.about : "LTX makes the shot again with the effect, from the frame it starts on"), run: () => makeAi(l) }));
}

function lookBody(big) {
  const l = selected();
  if (!l) return h("div.sp-look.is-empty", {}, h("p.sp-hint", {}, "Pick a layer to change how it looks."));
  const e = elementOf(l.el);
  if (e.kind === "ai") return aiLook(l, big);
  const blends = BLENDS.filter((b) => b.id !== "normal" || e.kind === "particles").slice(0, big ? 5 : 4).map((b) => [b.id, b.name.split(" ")[0]]);
  const clip = !isPicture();
  return h(`div.sp-look${big ? ".is-big" : ""}`, {},
    segs(blends, l.blend, (v) => patchLayer(l.id, { blend: v }), BLENDS.find((b) => b.id === l.blend)?.about),
    row("Opacity", slider({ value: l.opacity, min: 0, max: 1, step: 0.01, show: (v) => v.toFixed(2), label: "Opacity", set: live(l.id, "opacity") })),
    e.kind === "particles"
      ? [row("Amount", slider({ value: l.amount, min: 0, max: 1, step: 0.01, show: (v) => v.toFixed(2), label: "How many", set: live(l.id, "amount") })),
        row("Size", slider({ value: l.size, min: 0, max: 1, step: 0.01, show: (v) => v.toFixed(2), label: "How big", set: live(l.id, "size") }))]
      : row("Edge", slider({ value: l.soft, min: 0, max: 1, step: 0.01, show: (v) => v.toFixed(2), label: "A soft edge: it fades out towards its box", set: live(l.id, "soft") })),
    row("Glow", slider({ value: l.glow, min: 0, max: 1, step: 0.01, show: (v) => v.toFixed(2), label: "Glow", set: live(l.id, "glow") })),
    clip ? row("Motion", h("select.ut-select.sp-motion", { "aria-label": "How it moves", on: { change: (ev) => patchLayer(l.id, { motion: ev.target.value }) } }, ...MOTIONS.map(([v, name]) => h("option", { value: v, selected: l.motion === v }, name)))) : null,
    clip && l.motion !== "still" ? row("Speed", slider({ value: l.speed, min: 0.1, max: 4, step: 0.05, show: (v) => `${v.toFixed(1)}×`, label: "How fast", set: live(l.id, "speed") })) : null,
    row(e.kind === "particles" ? "Colour" : "Tint", e.kind === "particles" ? swatches(l, "colour", [e.colour, ...TINTS], false) : swatches(l, "tint", TINTS)));
}

/** The dial a layer's angle is turned with: drag around it, double-click to straighten. */
function dial(l) {
  const knob = h("i.sp-dial-knob");
  const out = h("output.sp-dial-out", {}, `${Math.round(l.rot)}°`);
  const face = h("div.sp-dial", { title: "Its angle: drag around, double-click to straighten", dataset: { keep: "1" }, style: { "--rot": `${l.rot}deg` } }, knob);
  const set = (rot, quiet) => {
    face.style.setProperty("--rot", `${rot}deg`);
    out.textContent = `${Math.round(rot)}°`;
    patchLayer(l.id, { rot }, { live: quiet });
  };
  face.addEventListener("pointerdown", (e) => {
    face.setPointerCapture(e.pointerId);
    const r = face.getBoundingClientRect();
    const at = (ev) => {
      let a = (Math.atan2(ev.clientY - (r.top + r.height / 2), ev.clientX - (r.left + r.width / 2)) * 180) / Math.PI + 90;
      a = ((a + 540) % 360) - 180;
      return Math.abs(a) < 4 ? 0 : Math.round(a);
    };
    const move = (ev) => set(at(ev), true);
    const up = (ev) => (face.removeEventListener("pointermove", move), face.removeEventListener("pointerup", up), set(at(ev), false));
    face.addEventListener("pointermove", move);
    face.addEventListener("pointerup", up);
  });
  face.addEventListener("dblclick", () => set(0, false));
  return h("div.sp-dial-wrap", {}, face, out);
}

/** A number of the layer typed in (X, Y, scale), with its own unit. */
function numField(l, key, label, { scale = 1, unit = "", step = 0.01, digits = 2 } = {}) {
  return h("label.sp-num", {}, h("span.ut-label", {}, label),
    h("input", { type: "number", step, value: (l[key] * scale).toFixed(digits), "aria-label": label, on: { change: (e) => Number.isFinite(Number(e.target.value)) && patchLayer(l.id, { [key]: Number(e.target.value) / scale }) } }),
    unit ? h("em", {}, unit) : null);
}

/** The frames a layer plays on (a clip): a strip of the shot with its two ends to drag. */
function framesStrip(l) {
  const b = spice.shot.body;
  const plate = b.passes.plate;
  const r = rangeOf(b);
  const span = Math.max(1, r.out - r.in);
  const cur = { from: l.from ?? r.in, to: l.to ?? r.out };
  const pct = (f) => `${(((f - r.in) / span) * 100).toFixed(2)}%`;
  const s = plate?.media.kind === "video" ? stripOf(plate.media.file, () => changed("spice")) : null;
  const text = h("b.sp-when-text", {}, `${cur.from} – ${cur.to}`);
  const sel = h("div.sp-when-sel", { style: { left: pct(cur.from), right: `calc(100% - ${pct(cur.to)})` } }, h("i.is-in", { title: "Where it starts" }), h("i.is-out", { title: "Where it ends" }));
  const strip = h("div.sp-when-strip", { style: s?.url ? { backgroundImage: `url(${s.url})` } : {}, dataset: { keep: "1" } }, sel);
  const at = (e) => {
    const rect = strip.getBoundingClientRect();
    return Math.round(r.in + Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)) * span);
  };
  strip.addEventListener("pointerdown", (e) => {
    strip.setPointerCapture(e.pointerId);
    const grab = e.target.classList.contains("is-in") ? "in" : e.target.classList.contains("is-out") ? "out" : e.target === sel ? "all" : at(e) < (cur.from + cur.to) / 2 ? "in" : "out";
    const start = at(e);
    const was = { ...cur };
    const move = (ev) => {
      const f = at(ev);
      if (grab === "in") cur.from = Math.min(Math.max(r.in, f), cur.to);
      else if (grab === "out") cur.to = Math.max(Math.min(r.out, f), cur.from);
      else {
        const d = Math.min(Math.max(f - start, r.in - was.from), r.out - was.to);
        cur.from = was.from + d;
        cur.to = was.to + d;
      }
      sel.style.left = pct(cur.from);
      sel.style.right = `calc(100% - ${pct(cur.to)})`;
      text.textContent = `${cur.from} – ${cur.to}`;
      patchLayer(l.id, { from: cur.from, to: cur.to }, { live: true });
    };
    const up = () => (strip.removeEventListener("pointermove", move), strip.removeEventListener("pointerup", up), patchLayer(l.id, {}));
    strip.addEventListener("pointermove", move);
    strip.addEventListener("pointerup", up);
  });
  return h("div.sp-frames", {}, h("div.sp-frames-head", {}, h("span.ut-label", {}, "Frames"), text, l.from !== null || l.to !== null ? h("button.sp-mini", { type: "button", title: "The whole shot", on: { click: () => patchLayer(l.id, { from: null, to: null }) } }, "All") : null), strip);
}

function placeBody(big) {
  const l = selected();
  if (!l) return h("div.sp-place2.is-empty", {}, h("p.sp-hint", {}, "Pick a layer to place it. It moves on the picture too: drag it, its corners scale it, its knob turns it."));
  const e = elementOf(l.el);
  const hasMatte = !!fxGround().matte;
  return h(`div.sp-place2${big ? ".is-big" : ""}`, {},
    h("div.sp-place-nums", {}, numField(l, "x", "X"), numField(l, "y", "Y"), numField(l, "scale", e.kind === "ai" ? "Size" : "Scale", { scale: 100, unit: "%", step: 1, digits: 0 })),
    h("div.sp-place-turn", {},
      e.kind === "ai" ? null : dial(l),
      e.kind === "image" ? h("div.sp-keys", {},
        iconKey(spicon("flip"), "Flip it left to right", () => patchLayer(l.id, { flipX: !l.flipX }), { pressed: !!l.flipX }),
        iconKey(spicon("flipv"), "Flip it upside down", () => patchLayer(l.id, { flipY: !l.flipY }), { pressed: !!l.flipY })) : null,
      e.kind === "ai" ? row("Edge", slider({ value: l.soft, min: 0.01, max: 1, step: 0.01, show: (v) => v.toFixed(2), label: "How softly its circle fades into the shot", set: live(l.id, "soft") })) : null),
    segs([["behind", "Behind them"], ["front", "In front"]], l.behind ? "behind" : "front", (v) => (v === "behind" && !hasMatte ? (toast("Cut the people out in Roto first: its matte holds them in front."), setDept("roto")) : patchLayer(l.id, { behind: v === "behind" })), hasMatte ? "Roto's matte holds the people in front of what is behind them" : "Cut the people out in Roto to put a layer behind them"),
    isPicture() ? null : framesStrip(l),
    // (in the bento these are the bar's on the picture, and the Delete key's)
    big ? h("div.sp-place-foot", {}, ghost("Duplicate", () => duplicateLayer(l.id), { icon: spicon("copy") }), ghost("Remove", () => removeLayer(l.id), { icon: spicon("trash") })) : null);
}

// ---------------------------------------------------------------- the department

const BENTOS = [
  ["library", "LIBRARY", "sp-side-b.sp-b-library", libraryBody],
  ["layers", "LAYERS", "sp-b-layers", layersBody],
  ["look", "LOOK", "sp-b-look", lookBody],
  ["place", "PLACE", "sp-b-place2", placeBody],
];
const sigOf = () => JSON.stringify([spice.shot?.body.set.fx.layers, spice.shot?.body.set.fx.sel, spice.shot?.body.passes, group, state.presets.length, workingOn("fx")?.progress]);
for (const [id, title, , body] of BENTOS) {
  defineWindow(`fx-${id}`, {
    eyebrow: "FX", title, size: id === "library" ? "l" : "m",
    make: () => {
      const el = h("div.sp-w");
      return { el, update: () => fill(el, body(true)), sig: sigOf };
    },
  });
}

registerRunner("fx", () => {
  const l = selected();
  if (l?.el === "ai" && !l.media) {
    const p = aiPlan(l);
    return { label: "Make it", cost: p.cost, why: p.why, run: () => makeAi(l) };
  }
  const p = bakePlan();
  return { label: "Bake the layers", free: true, why: p.why || (p.done ? "The FX pass is these layers already" : ""), run: runBake };
});

export function fxSpace() {
  const el = h("div.sp-dept.is-fx.is-tall");
  const slot = h("div.sp-slot");
  const bentos = Object.fromEntries(BENTOS.map(([id, title, cls]) => [id, bento(cls, title, () => openWin(`fx-${id}`))]));
  const bodies = Object.fromEntries(BENTOS.map(([id]) => [id, h("div.sp-b-body")]));
  for (const [id] of BENTOS) bentos[id].append(bodies[id]);
  el.append(slot, bentos.library, h("div.sp-lower.is-fx", {}, bentos.layers, bentos.look, bentos.place));
  function update() {
    for (const [id, , , body] of BENTOS) fill(bodies[id], body(false));
  }
  return {
    el, update, slot,
    sig: () => JSON.stringify([state.presets.length, lastFrame(spice.shot?.body.passes.plate), group]),
    // the viewer draws the layers live over what FX works on, with the handles of the one held
    viewer: () => {
      const b = spice.shot.body;
      const g = fxGround(b);
      return { tool: "layers", comp: { layers: b.set.fx.layers, sel: b.set.fx.sel, edge: { feather: b.set.roto.feather, choke: b.set.roto.choke }, base: g.base, baseFrom: g.baseFrom, matte: g.matte, matteFrom: g.matteFrom } };
    },
  };
}
