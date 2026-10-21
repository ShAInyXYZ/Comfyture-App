// Motion graphics, the page's side: a logo sting, a lower third, an end card, a title card, a counter, a subscribe nudge, made from the
// brand's kit as designs with motion (macaron-graphics-data.js builds them) and rendered by the app's own motion renderer as MP4,
// WebM or GIF. The window (mockup: docs/brand/products/macaron-v4/macaron-v4-motion.png) shows the kinds as live tiles, plays the one
// picked, and keeps its words as plain editable lines. A graphic that is made is an ordinary design with motion: the editor and
// the Motion window open it like any other.
import { h, icon } from "./dom.js";
import { toast, changed } from "./store.js";
import { frameOf, prepare, drawDesign, kitOf, measurer, FORMATS } from "./design.js";
import { reflow } from "./macaron-layout.js";
import { macaron, edit, kitNow, uid, openDesign, pickMotion, renderMotion } from "./macaron.js";
import { defineWindow, openWin } from "./macaron-win.js";
import { draftKey } from "./macaron-tools.js";
import { fill, arming, isArmed, armedNow, mcicon } from "./macaron-ui.js";
import { GRAPHIC_KINDS, GRAPHIC_FORMATS, EASINGS, kindOfGraphic, buildGraphic, defaultFields, cleanFields, rolesOf } from "./macaron-graphics-data.js";

export const graphicsOf = (b = macaron.brand) => (b?.body.designs ?? []).filter((d) => d.graphic);
const latestOf = (kind, b = macaron.brand) => graphicsOf(b).filter((d) => d.graphic.kind === kind).sort((a, c) => String(c.updatedAt).localeCompare(String(a.updatedAt)))[0] ?? null;
const motionOf = (design, b = macaron.brand) => b?.body.motion.find((m) => m.design === design.id) ?? null;

/** What the window holds before anything is made: the kind, its words, its length, its easing, its format, and how it will leave. */
export const gfx = { brand: null, kind: "sting", id: null, fields: {}, seconds: 3, ease: "out", format: "9:16", container: "mp4", playing: true };

/** The brand's address, where its kit has one (it has no field for it yet: a kit that carries a website is read as it is): else blank, never a made-up one. */
export const brandUrl = (b = macaron.brand) => String(b?.body.kit?.website ?? b?.body.kit?.url ?? "").trim();
/** What a graphic's fields say when nothing is written: the brand's own words (tagline, how it talks, its address). */
export const defaultsOf = (kind, b = macaron.brand) => defaultFields(kind, { brandName: b.name, tagline: kitNow().tagline, voice: kitNow().voice?.summary, url: brandUrl(b) });

/** The draft as { design, motion } (not in the brand): what the preview draws and what saving keeps. `g.fields` is only what the person wrote. */
export function draftDesign(g = gfx, b = macaron.brand) {
  return buildGraphic({ kind: g.kind, fields: g.fields, kit: kitNow(), brandName: b.name, url: brandUrl(b), format: g.format, seconds: g.seconds, ease: g.ease, id: g.id ?? `draft-${g.kind}` });
}

/** A kind opened in the window: the one the brand has made (its words, length and easing), else the template as it starts. */
export function pickKind(kind, { id } = {}) {
  const b = macaron.brand;
  const saved = id ? graphicsOf(b).find((d) => d.id === id) : latestOf(kind, b);
  const spec = kindOfGraphic(kind);
  gfx.brand = b.id;
  gfx.kind = spec.id;
  gfx.id = saved?.id ?? null;
  // (only what was written is kept as fields: the brand's own words are worked out each time, so a tagline written later shows up)
  gfx.fields = saved ? { ...saved.graphic.fields } : {};
  gfx.seconds = saved?.graphic.seconds ?? spec.seconds;
  gfx.ease = saved?.graphic.ease ?? "out";
  gfx.format = saved?.format ?? "9:16";
  changed("macaron");
}
/**
 * The window open on a kind (what a tile of the Studio does; Brioche's add_motion_graphic too, with her fields). With `here`, when the
 * window is open on that very kind, the graphic stays as it is (what the person has typed is not thrown away) and only her words are put in.
 */
export function openGraphic(kind, { id, fields, seconds, ease, here = false } = {}) {
  const same = here && gfx.brand === macaron.brand.id && gfx.kind === kind;
  if (!same) pickKind(kind, { id });
  if (fields) gfx.fields = { ...gfx.fields, ...cleanFields(kind, fields) };
  if (Number.isFinite(seconds)) gfx.seconds = Math.min(12, Math.max(2, seconds));
  if (EASINGS.some(([e]) => e === ease)) gfx.ease = ease;
  // (a window already open on this graphic is drawn again with her words in it: opening it again does nothing by itself)
  changed("macaron");
  openWin("graphics");
}

/** The draft kept in the brand: a design with motion and its piece, new or the same one changed. Answers the piece's id. */
export function saveGraphic(g = gfx) {
  const b = macaron.brand.body;
  const { design, motion } = draftDesign(g);
  design.id = g.id ?? uid("g");
  let mid = null;
  edit(() => {
    const at = b.designs.findIndex((d) => d.id === design.id);
    if (at >= 0) {
      Object.assign(design, { createdAt: b.designs[at].createdAt, status: b.designs[at].status, name: b.designs[at].name });
      b.designs[at] = design;
    } else b.designs.push(design);
    let m = b.motion.find((x) => x.design === design.id);
    if (m) Object.assign(m, { ...motion, name: design.name }, { render: undefined });
    else b.motion.push((m = { id: uid("m"), design: design.id, ...motion, name: design.name }));
    mid = m.id;
  }, "A motion graphic");
  g.id = design.id;
  return mid;
}

/** Made, and sent out in the container asked: saved in the brand first, then rendered frame by frame like any motion piece. */
export async function makeGraphic(g = gfx) {
  const mid = saveGraphic(g);
  pickMotion(mid);
  const out = await renderMotion(mid, { container: g.container, download: true });
  if (out) toast(`${kindOfGraphic(g.kind).name} made as ${g.container.toUpperCase()}.`);
  return out;
}

// ---------------------------------------------------------------- drawing a design into a canvas, on its own

const ready = new Map();
/** A design's fonts, logos and pictures loaded (once for the same words of it). */
const prepared = (design, kit) => {
  const key = `${design.id}|${JSON.stringify(design.layers.map((l) => [l.id, l.text, l.logo, l.src]))}|${kit.logos.length}`;
  if (!ready.has(key)) {
    if (ready.size > 80) ready.clear();
    ready.set(key, prepare(design, kit).catch(() => []));
  }
  return ready.get(key);
};

/** Draws the design at a time into the canvas (its width sets the scale). Answers when it is drawn. */
export async function drawInto(canvas, design, kit, t) {
  await prepared(design, kit);
  const f = frameOf(design.format);
  const measure = measurer(kit);
  if (canvas.dataset.format !== design.format) {
    canvas.dataset.format = design.format;
    canvas.height = Math.round((canvas.width * f.h) / f.w);
    canvas.style.aspectRatio = `${f.w} / ${f.h}`;
  }
  const ctx = canvas.getContext("2d");
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.scale(canvas.width / f.w, canvas.width / f.w);
  drawDesign(ctx, design, { w: f.w, h: f.h, format: design.format, kit, t, reflow: (d, to) => reflow(d, to, measure) });
  ctx.restore();
}
/** A canvas of the design at the time it has settled: for a tile. */
export function stillOf(design, kit, { width = 240, t = null } = {}) {
  const canvas = document.createElement("canvas");
  canvas.className = "mc-canvas";
  canvas.width = Math.round(width * Math.min(2, window.devicePixelRatio || 1));
  drawInto(canvas, design, kit, t ?? (design.poster ?? (design.graphic?.seconds ?? 3) * 0.8)).catch(() => {});
  return canvas;
}

// ---------------------------------------------------------------- the window

const clock = (t) => `0:${String(Math.floor(t)).padStart(2, "0")}`;
const typingIn = (el) => el.contains(document.activeElement) && document.activeElement.matches("input, textarea");
const EASE_ICON = { out: "M3 17c6 0 9-3 11-13", back: "M3 17c4 2 6-4 8-10 2-4 3-2 3 0", inout: "M3 17c5 0 6-13 11-13", expo: "M3 17c9 0 11-4 11-13" };
const easeGlyph = (id) => {
  const span = document.createElement("span");
  span.innerHTML = `<svg class="icon" viewBox="0 0 18 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="${EASE_ICON[id]}"/></svg>`;
  return span.firstChild;
};
const CONTAINERS = [["mp4", "MP4", "A video everyone can play"], ["webm", "WebM", "Smaller, for the web"], ["gif", "GIF", "A looping picture, no sound"]];
/** What Brioche is asked from the graphic that is open: its own words, for that kind (never another kind, never a new graphic). */
const askWords = () => {
  const spec = kindOfGraphic(gfx.kind);
  return `Write the words of the ${spec.name.toLowerCase()} that is open, in the brand's voice, short: ${spec.fields.map(([k, l]) => `${k} (${l.toLowerCase()})`).join(", ")}. Use add_motion_graphic with kind "${gfx.kind}" and copy for exactly those fields. Keep this kind: do not open another.`;
};

function graphicsWin() {
  const el = h("div.mc-w.gw");
  let loop = 0;
  let clockEl = null;
  let bar = null;
  let canvas = null;
  let current = null;
  let t = 0;
  let last = 0;
  const go = h("button.mc-primary", { type: "button" });
  const draft = draftKey("Brioche can write it", "The words, in the brand's voice.", askWords);
  const containers = h("div.mc-segs.gw-containers", { role: "group", "aria-label": "How it leaves" });
  const foot = [draft, h("span.spacer"), containers, go];

  const rebuild = () => {
    current = draftDesign().design;
    if (canvas) canvas.dataset.format = "";
  };
  function frame(now) {
    if (!el.isConnected || !canvas?.isConnected) return void ((loop = 0), (last = 0));
    loop = requestAnimationFrame(frame);
    const dur = gfx.seconds;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    // it plays and rests a moment on its last frame before it starts again
    if (gfx.playing) t = (t + dt) % (dur + 0.8);
    const tt = Math.min(t, dur);
    drawInto(canvas, current, kitNow(), tt).catch(() => {});
    if (clockEl) clockEl.textContent = `${clock(tt)} / ${clock(dur)}`;
    if (bar && document.activeElement !== bar) bar.value = String(Math.round((tt / dur) * 1000));
  }
  const play = () => {
    if (!loop) loop = requestAnimationFrame(frame);
  };

  function tile(spec) {
    const b = macaron.brand;
    const saved = latestOf(spec.id, b);
    const d = saved ?? buildGraphic({ kind: spec.id, kit: kitNow(), brandName: b.name, url: brandUrl(b) }).design;
    return h(`button.gw-tile${spec.id === gfx.kind ? ".is-on" : ""}`, { type: "button", title: spec.hint, "aria-pressed": String(spec.id === gfx.kind), on: { click: () => pickKind(spec.id) } },
      h("span.gw-tile-pic", { style: { "--py": String(spec.band ?? 0.5) } }, stillOf(d, kitNow(), { width: 200 }), h("span.gw-dur", {}, `${(saved?.graphic.seconds ?? spec.seconds)} s`), saved ? h("span.gw-made", { title: "Made" }, icon("check")) : null),
      h("b", {}, spec.name));
  }

  function update() {
    const b = macaron.brand;
    if (!b) return;
    if (typingIn(el)) return false;
    // another brand, or the first time: the kind starts as the brand's own (its words, its latest)
    if (gfx.brand !== b.id) return void pickKind(gfx.kind);
    const spec = kindOfGraphic(gfx.kind);
    const kit = kitNow();
    const R = rolesOf(kit);
    rebuild();
    canvas = h("canvas.mc-canvas.gw-canvas", { width: 360 });
    clockEl = h("span.gw-clock", {});
    bar = h("input.gw-scrub", { type: "range", min: 0, max: 1000, value: 0, "aria-label": "Where in the graphic", on: { input: (e) => { t = (Number(e.target.value) / 1000) * gfx.seconds; if (gfx.playing) { gfx.playing = false; changed("macaron"); } } } });
    const busy = !!macaron.progress;
    const needsTagline = ["sting", "end", "title"].includes(gfx.kind) && !String(kit.tagline ?? "").trim() && !gfx.fields[spec.fields[0][0]];
    const exists = !!gfx.id && graphicsOf(b).some((d) => d.id === gfx.id);
    fill(el,
      h("section.gw-kinds", {}, h("span.label", {}, "Kinds"), h("div.gw-tiles", {}, ...GRAPHIC_KINDS.map(tile))),
      h("section.gw-stage", {},
        h("div.gw-frame", { style: { "--ar": `${FORMATS[gfx.format]?.w ?? 1080} / ${FORMATS[gfx.format]?.h ?? 1920}` } }, canvas,
          h("button.gw-play", { type: "button", title: gfx.playing ? "Pause" : "Play", "aria-label": gfx.playing ? "Pause" : "Play", on: { click: () => { gfx.playing = !gfx.playing; changed("macaron"); } } }, gfx.playing ? icon("pause") : icon("play"))),
        h("div.gw-transport", {}, clockEl, bar)),
      h("section.gw-fields", {},
        h("div.mc-sec.gw-sec", {}, h("span.label", {}, spec.name), h("p.mc-hint", {}, spec.hint),
          ...spec.fields.map(([key, label]) => h("label.gw-field", {}, h("span.gw-k", {}, label),
            // (the field shows what the brand would say until the person writes: it is kept only once they have)
            h("input.field.mc-text", { value: gfx.fields[key] ?? defaultsOf(gfx.kind, b)[key] ?? "", maxlength: 80, "aria-label": label, on: { input: (e) => { gfx.fields[key] = e.target.value.slice(0, 80); rebuild(); } } }))),
          // (the line a graphic says first is the brand's tagline: a brand with none says so, and where to write it)
          needsTagline ? h("button.mc-add-prompt.gw-note", { type: "button", title: "The Voice window", on: { click: () => openWin("voice") } }, icon("plus"), "No tagline yet: this line comes from it. Write it in Voice") : null),
        h("div.mc-sec.gw-sec", {}, h("span.label", {}, "How long"),
          h("div.ug-step", {}, h("button", { type: "button", "aria-label": "Shorter", disabled: gfx.seconds <= 2, on: { click: () => ((gfx.seconds -= 1), changed("macaron")) } }, "−"), h("span", {}, `${gfx.seconds} s`), h("button", { type: "button", "aria-label": "Longer", disabled: gfx.seconds >= 12, on: { click: () => ((gfx.seconds += 1), changed("macaron")) } }, "+"))),
        h("div.mc-sec.gw-sec", {}, h("span.label", {}, "How it settles"),
          h("div.mc-fchips", {}, ...EASINGS.map(([e, name]) => h("button.mc-fchip", { type: "button", "aria-pressed": String(gfx.ease === e), title: name, on: { click: () => ((gfx.ease = e), changed("macaron")) } }, easeGlyph(e), name)))),
        h("div.mc-sec.gw-sec", {}, h("span.label", {}, "Shape"),
          h("div.mc-fchips", {}, ...GRAPHIC_FORMATS.map((f) => h("button.mc-fchip", { type: "button", "aria-pressed": String(gfx.format === f), title: FORMATS[f]?.name, on: { click: () => ((gfx.format = f), changed("macaron")) } }, f)))),
        h("div.mc-sec.gw-sec", {}, h("span.label", {}, "From the brand kit"),
          h("div.gw-kit", { title: "Colours, type and logo come from the kit, so the graphic stays on brand" },
            h("div.gw-dots", {}, ...[R.ground, R.second, R.accent, R.light].filter((x, i, a) => a.indexOf(x) === i).map((id) => h("i", { style: { background: kit.palette.find((p) => p.id === id)?.hex }, title: kit.palette.find((p) => p.id === id)?.name }))),
            h("span", {}, `${kit.type.display.family} · ${kit.type.mono.family}`),
            mcicon("kit"))),
        exists ? h("div.gw-open", {}, h("button.mc-add-prompt", { type: "button", on: { click: () => { const m = motionOf({ id: gfx.id }, b); if (m) { pickMotion(m.id); openWin("motion"); } } } }, mcicon("motion"), "Fine-tune the timing in Motion")) : null));

    const key = "graphic-make";
    containers.replaceChildren(...CONTAINERS.map(([id, label, tip]) => h("button.mc-seg", { type: "button", title: tip, "aria-pressed": String(gfx.container === id), on: { click: () => ((gfx.container = id), changed("macaron")) } }, label)));
    go.disabled = busy;
    go.title = `Make the ${spec.name.toLowerCase()} as a ${gfx.container.toUpperCase()}`;
    go.classList.toggle("is-armed", isArmed(key));
    go.replaceChildren(mcicon("sparkle"), macaron.progress?.kind === "motion" ? `Making ${macaron.progress.done} / ${macaron.progress.total}` : "Make it");
    go.onclick = () => makeGraphic();
    draft.disabled = !!macaron.chat.busy;
    play();
  }
  // (what is typed is kept in gfx at once; the window is drawn again only when a choice changes)
  const sig = () => JSON.stringify([gfx.brand, gfx.kind, gfx.id, gfx.fields, macaron.brand ? [kitNow().tagline, kitNow().voice?.summary, brandUrl()] : null, gfx.seconds, gfx.ease, gfx.format, gfx.container, gfx.playing, macaron.progress, graphicsOf(macaron.brand).map((d) => [d.id, d.updatedAt]), macaron.chat.busy, armedNow()]);
  return { el, update, sig, foot };
}

defineWindow("graphics", { title: "Motion graphics", eyebrow: "Studio", sub: () => macaron.brand?.name ?? "", size: "xl", advanced: false, make: graphicsWin, foot: (part) => part.foot });
