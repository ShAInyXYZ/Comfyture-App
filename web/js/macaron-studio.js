// The studio: one design open on its canvas, in one format. Pick a layer on the canvas or in its list,
// move it, resize it, change its words, picture, colours and place in the inspector. Every edit is made
// on the saved design (in the format that is open), drawn by the same drawDesign() the export uses.
import { h, icon, sprite } from "./dom.js";
import { dropdown } from "./controls.js";
import { toast } from "./store.js";
import { openPicker, pictureOf } from "./picker.js";
import { FORMATS, FORMAT_KEYS, ALL_FORMATS, FAMILIES, FAMILY_KEYS, ownFormats, familyFormats, familyOf, labelOf, ratioGlyph, nativeSize, PURPOSES, STATUSES, frameOf, prepare, missing, drawDesign, pick } from "./design.js";
import { safeRect, LAYOUTS } from "./macaron-layout.js";
import {
  macaron, designNow, kitNow, layoutNow, reflowFor, measure, onLive, begin, live, end, undo, redo, patchLayer, pickLayer, openDesign, setFormat, setDesignLive, setDesign,
  addLayer, removeLayer, duplicateLayer, moveLayer, reorderLayer, distribute, alignLayer, adaptFormat, applyLayout, applyKitNow, guardOf, toggleSafe, exportPng, addDesign, duplicateDesign,
  removeDesign, setBg, addAsset, thumb, addMotion, pickMotion,
} from "./macaron.js";
import { mcicon, key, seg, row, slider, numberField, textField, swatches, chooseFiles, chip, arming, isArmed, fill } from "./macaron-ui.js";
import { askMacaron } from "./macaron-assist.js";
import { openWin } from "./macaron-win.js";

const TYPE_ICON = { text: "text", image: "assets", logo: "logo", shape: "shape" };
const r4 = (v) => Math.round(v * 10000) / 10000;

// ---------------------------------------------------------------- a picture from the brand's assets, the Library or the computer

/** A small panel under a key: the brand's pictures to choose from, the Library, the computer. */
export function pickAsset(anchor, onPick, { title = "A picture" } = {}) {
  document.querySelector(".mc-pop")?.remove();
  const assets = macaron.brand.body.assets.filter((a) => a.url);
  const close = () => {
    pop.remove();
    document.removeEventListener("pointerdown", outside, true);
    document.removeEventListener("keydown", esc, true);
  };
  const outside = (e) => !pop.contains(e.target) && !anchor.contains(e.target) && close();
  const esc = (e) => e.key === "Escape" && (e.stopPropagation(), close());
  const choose = async (fn) => {
    close();
    try {
      await fn();
    } catch (e) {
      toast(e.message, { tone: "crit" });
    }
  };
  const pop = h("div.mc-pop", { role: "dialog", "aria-label": title },
    h("span.label", {}, title),
    assets.length ? h("div.mc-pop-grid", {}, ...assets.map((a) => h("button.mc-pop-pic", { type: "button", title: a.name, on: { click: () => choose(() => onPick(a)) } }, h("img", { src: a.url, alt: "", draggable: false, loading: "lazy" })))) : h("p.mc-hint", {}, "No pictures in the project yet."),
    h("div.mc-pop-keys", {},
      h("button.key.is-sm", { type: "button", on: { click: () => choose(async () => { close(); const f = await new Promise((ok) => chooseFiles((file) => ok(file))); onPick(await addAsset(f)); }) } }, icon("upload"), "From the computer"),
      h("button.key.is-sm", { type: "button", on: { click: (e) => { close(); openPicker(e.currentTarget.isConnected ? e.currentTarget : anchor, { title, characters: false, onPick: async (choice) => { try { onPick(await addAsset(await pictureOf(choice))); } catch (err) { toast(err.message, { tone: "crit" }); } } }); } } }, icon("image"), "From the Library")));
  document.body.append(pop);
  const b = anchor.getBoundingClientRect();
  Object.assign(pop.style, { left: `${Math.min(window.innerWidth - 330, Math.max(8, b.left))}px`, top: `${Math.min(window.innerHeight - 340, b.bottom + 6)}px` });
  document.addEventListener("pointerdown", outside, true);
  document.addEventListener("keydown", esc, true);
}

// ---------------------------------------------------------------- the studio

export function studioSection() {
  const canvas = h("canvas.mc-stage-canvas");
  const overlay = h("div.mc-overlay");
  const frame = h("div.mc-frame", {}, canvas, overlay);
  const bar = h("div.mc-stage-bar");
  const formats = h("div.mc-stage-formats");
  const tools = h("div.mc-stage-tools");
  const guardEl = h("div.mc-guard-box");
  const layersEl = h("div.mc-layers");
  const inspector = h("div.mc-inspector");
  // the canvas is the hero: the biggest the frame can be in the room the stage has (the view measures it, the frame follows)
  const view = h("div.mc-stage-view", {}, frame);
  const stage = h("div.mc-stage", {}, formats, view, tools);
  const el = h("div.mc-studio", {}, bar, h("div.mc-col.is-layers", {}, layersEl), stage, h("div.mc-col.is-inspector", {}, inspector, guardEl));
  new ResizeObserver(() => designNow() && draw()).observe(view);
  const ctx = canvas.getContext("2d");
  let boxes = [];
  let guides = [];
  let drawing = 0;

  const sizeCanvas = () => {
    const f = frameOf(macaron.format);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(240, Math.round((frame.clientWidth || 400) * dpr));
    const hpx = Math.round((w * f.h) / f.w);
    if (canvas.width !== w || canvas.height !== hpx) Object.assign(canvas, { width: w, height: hpx });
    frame.style.setProperty("--ar", String(f.w / f.h));
    return { f, w };
  };

  /** The design drawn on the canvas, in the format that is open. */
  async function draw() {
    const d = designNow();
    if (!d) return;
    const kit = kitNow();
    const token = ++drawing;
    if (missing(d, kit)) await prepare(d, kit);
    if (token !== drawing) return;
    const { f, w } = sizeCanvas();
    ctx.setTransform(w / f.w, 0, 0, w / f.w, 0, 0);
    boxes = drawDesign(ctx, d, { w: f.w, h: f.h, format: macaron.format, kit, reflow: reflowFor });
    drawOverlay();
  }

  const HANDLES = { text: ["nw", "ne", "sw", "se", "e", "w"], logo: ["nw", "ne", "sw", "se"], image: ["nw", "n", "ne", "e", "se", "s", "sw", "w"], shape: ["nw", "n", "ne", "e", "se", "s", "sw", "w"] };
  function drawOverlay() {
    const f = frameOf(macaron.format);
    const pct = (b) => ({ left: `${(b.x / f.w) * 100}%`, top: `${(b.y / f.h) * 100}%`, width: `${(b.w / f.w) * 100}%`, height: `${(b.h / f.h) * 100}%` });
    const kids = [];
    if (macaron.safe) {
      const S = safeRect(macaron.format);
      kids.push(h("div.mc-safe", { style: { left: `${S.x * 100}%`, top: `${S.y * 100}%`, width: `${S.w * 100}%`, height: `${S.h * 100}%` } }));
      if (macaron.format === "9:16") kids.push(h("div.mc-ui-zone.is-top", { style: { height: `${S.y * 100}%` } }), h("div.mc-ui-zone.is-bottom", { style: { height: `${(1 - S.y - S.h) * 100}%` } }));
    }
    const layer = layoutNow().layers.find((l) => l.id === macaron.layer);
    const b = boxes.find((x) => x.id === macaron.layer);
    if (layer && b) {
      kids.push(h("div.mc-sel", { style: { ...pct(b), transform: `rotate(${b.rot ?? 0}deg)` } },
        ...(layer.locked ? [] : (HANDLES[layer.type] ?? []).map((k) => h(`i.mc-handle.is-${k}`, { dataset: { h: k } })))));
    }
    for (const g of guides) kids.push(h(`i.mc-guide.${g.v ? "is-v" : "is-h"}`, { style: g.v ? { left: `${g.at * 100}%` } : { top: `${g.at * 100}%` } }));
    fill(overlay, ...kids);
  }

  // ---- pointer: pick, move, resize
  const toDesign = (e) => {
    const r = frame.getBoundingClientRect();
    const f = frameOf(macaron.format);
    return { x: ((e.clientX - r.left) / r.width) * f.w, y: ((e.clientY - r.top) / r.height) * f.h, r };
  };
  frame.addEventListener("pointerdown", (e) => {
    const d = designNow();
    if (!d || e.button !== 0) return;
    const hit = e.target.closest?.(".mc-handle");
    const p = toDesign(e);
    const lay = layoutNow().layers;
    if (hit) return void startResize(e, hit.dataset.h);
    const id = pick(boxes, lay, p.x, p.y);
    if (!id) return void (macaron.layer && pickLayer(null));
    if (id !== macaron.layer) pickLayer(id);
    startMove(e, id);
  });
  frame.addEventListener("dblclick", (e) => {
    const l = layoutNow().layers.find((x) => x.id === macaron.layer);
    if (l?.type === "text") inspector.querySelector("textarea.mc-text")?.focus();
  });

  function snapLines(id) {
    const S = safeRect(macaron.format);
    const f = frameOf(macaron.format);
    const xs = new Set([0, 0.5, 1, S.x, S.x + S.w]);
    const ys = new Set([0, 0.5, 1, S.y, S.y + S.h]);
    for (const b of boxes) {
      if (b.id === id) continue;
      for (const v of [b.x / f.w, (b.x + b.w / 2) / f.w, (b.x + b.w) / f.w]) xs.add(r4(v));
      for (const v of [b.y / f.h, (b.y + b.h / 2) / f.h, (b.y + b.h) / f.h]) ys.add(r4(v));
    }
    return { xs: [...xs], ys: [...ys] };
  }
  const nearestLine = (vals, lines, tol) => {
    let best = null;
    for (const v of vals) for (const l of lines) if (Math.abs(v.at - l) < tol && (!best || Math.abs(v.at - l) < Math.abs(best.delta))) best = { delta: l - v.at, line: l };
    return best;
  };

  function startMove(e, id) {
    const f = frameOf(macaron.format);
    const start = toDesign(e);
    const l0 = layoutNow().layers.find((x) => x.id === id);
    if (!l0 || l0.locked) return;
    const b0 = boxes.find((x) => x.id === id) ?? { w: l0.w * f.w, h: l0.h * f.h };
    // where it started: the layer itself changes as it moves
    const [x0, y0] = [l0.x, l0.y];
    const [w, hh] = [b0.w / f.w, b0.h / f.h];
    const lines = snapLines(id);
    let moved = false;
    begin();
    const move = (ev) => {
      const p = toDesign(ev);
      if (!moved && Math.hypot(p.x - start.x, p.y - start.y) < 3) return;
      moved = true;
      let x = x0 + (p.x - start.x) / f.w;
      let y = y0 + (p.y - start.y) / f.h;
      guides = [];
      if (!ev.altKey) {
        const sx = nearestLine([{ at: x }, { at: x + w / 2 }, { at: x + w }], lines.xs, 7 / f.w);
        const sy = nearestLine([{ at: y }, { at: y + hh / 2 }, { at: y + hh }], lines.ys, 7 / f.h);
        if (sx) (x += sx.delta, guides.push({ v: true, at: sx.line }));
        if (sy) (y += sy.delta, guides.push({ v: false, at: sy.line }));
      }
      live(() => patchLayer(id, { x: r4(x), y: r4(y) }));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      guides = [];
      end(moved ? "Moved a layer" : undefined);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function startResize(e, which) {
    e.preventDefault();
    const f = frameOf(macaron.format);
    const l0 = layoutNow().layers.find((x) => x.id === macaron.layer);
    const b0 = boxes.find((x) => x.id === macaron.layer);
    if (!l0 || !b0 || l0.locked) return;
    const start = toDesign(e);
    const box0 = { x: b0.x / f.w, y: b0.y / f.h, w: b0.w / f.w, h: b0.h / f.h };
    const aspect = b0.w / b0.h;
    const size0 = l0.size;
    begin();
    const move = (ev) => {
      const p = toDesign(ev);
      const dx = (p.x - start.x) / f.w;
      const dy = (p.y - start.y) / f.h;
      let { x, y, w, h: hh } = box0;
      if (which.includes("e")) w = box0.w + dx;
      if (which.includes("w")) (x = box0.x + dx, (w = box0.w - dx));
      if (which.includes("s")) hh = box0.h + dy;
      if (which.includes("n")) (y = box0.y + dy, (hh = box0.h - dy));
      w = Math.max(0.03, w);
      hh = Math.max(0.02, hh);
      const keep = l0.type === "logo" || l0.type === "text" ? which.length === 2 || l0.type === "logo" : ev.shiftKey && which.length === 2;
      if (keep && l0.type !== "text") {
        // the corner dragged keeps the shape: the opposite corner stays where it was
        hh = (w * f.w) / aspect / f.h;
        if (which.includes("n")) y = box0.y + box0.h - hh;
        if (which.includes("w")) x = box0.x + box0.w - w;
      }
      if (which.includes("w") && l0.type !== "text") x = Math.min(x, box0.x + box0.w - 0.03);
      if (which.includes("w") && l0.type === "text") x = box0.x + box0.w - w;
      live(() => {
        if (l0.type === "text") {
          const patch = { x: r4(x), w: r4(w) };
          // a corner scales the type with the box; a side only changes where the lines break
          if (which.length === 2) patch.size = r4(Math.min(0.4, Math.max(0.012, size0 * (w / box0.w))));
          if (which.length === 2 && which.includes("n")) patch.y = r4(box0.y + box0.h - (box0.h * w) / box0.w);
          patchLayer(l0.id, patch);
        } else if (l0.type === "logo") patchLayer(l0.id, { x: r4(x), y: r4(y), w: r4(w) });
        else patchLayer(l0.id, { x: r4(x), y: r4(y), w: r4(w), h: r4(hh) });
      });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      end("Resized a layer");
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // ---- keys: the arrows nudge, Delete removes, undo and redo
  document.addEventListener("keydown", (e) => {
    if (location.hash.replace(/^#\/?/, "").split("?")[0] !== "macaron" || e.target.closest?.("input, textarea, select, [contenteditable], .mc-pop")) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "z") return (e.preventDefault(), e.shiftKey ? redo() : undo());
    if (mod && e.key.toLowerCase() === "y") return (e.preventDefault(), redo());
    // the layers' keys are the editor's: only while its window is open
    const d = designNow();
    if (!d || macaron.win !== "editor") return;
    const l = layoutNow().layers.find((x) => x.id === macaron.layer);
    if (!l) return;
    if (mod && e.key.toLowerCase() === "d") return (e.preventDefault(), duplicateLayer(l.id));
    if (e.key === "Delete" || e.key === "Backspace") return (e.preventDefault(), removeLayer(l.id));
    const step = e.shiftKey ? 0.02 : 0.004;
    const d2 = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (d2 && !l.locked) {
      e.preventDefault();
      begin();
      live(() => patchLayer(l.id, { x: r4(l.x + d2[0]), y: r4(l.y + d2[1]) }));
      clearTimeout(nudge);
      nudge = setTimeout(() => end("Nudged a layer"), 500);
    }
  });
  let nudge = 0;

  // ---- the parts around the canvas
  function drawBar(d) {
    const designs = macaron.brand.body.designs;
    const busy = macaron.busy.has(`export:${d.id}:${macaron.format}`);
    // the formats of the design's family, and any other it has a layout for
    const shown = [...new Set([...familyFormats(d.format), ...ownFormats(d)])];
    const others = shown.filter((f) => f !== macaron.format);
    const armedKey = `design:${d.id}`;
    fill(bar,
      h("div.mc-bar-id", {},
        dropdown({ label: "Design", value: d.id, items: designs.map((x) => ({ value: x.id, label: `${x.variant ? "↳ " : ""}${x.name}`, desc: `${x.purpose} · ${FORMATS[x.format].name} · ${x.status}` })), onChange: (id) => openDesign(id), width: "fit" }),
        textField({ value: d.name, set: (v) => setDesignLive({ name: v.slice(0, 60) }), note: "Renamed", label: "The design's name", cls: "mc-name", focusKey: `design-name:${d.id}` }),
        dropdown({ label: "Purpose", value: d.purpose, items: PURPOSES.map((p) => ({ value: p, label: p })), onChange: (v) => setDesign(d.id, { purpose: v }, `Purpose: ${v}`), width: "fit" }),
        h("span.mc-status", {}, h("span.lamp", { dataset: { tone: { approved: "ok", scheduled: "ok", review: "warn" }[d.status] ?? "" } }),
          dropdown({ label: "Status", value: d.status, items: STATUSES.map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) })), onChange: (v) => setDesign(d.id, { status: v }, `Status: ${v}`), width: "fit" }))),
      h("div.mc-bar-keys", {},
        key(sprite("edit-undo"), "Undo (Ctrl Z)", () => undo(), { disabled: !macaron.past.length }),
        key(sprite("edit-redo"), "Redo", () => redo(), { disabled: !macaron.future.length }),
        h("i.mc-bar-sep"),
        key(icon("plus"), "A new design from the brand kit", () => addDesign({ name: `${macaron.brand.name} · new`, format: macaron.format })),
        key(sprite("copy"), "Duplicate this design", () => duplicateDesign()),
        key(icon("trash"), isArmed(armedKey) ? "Click again to delete the design" : "Delete this design", () => arming(armedKey, update2, () => removeDesign(d.id)), { on: isArmed(armedKey) }),
        h("i.mc-bar-sep"),
        h("button.mc-barkey", { type: "button", title: "Alternatives of this post: copy, composition, colour, goal, format", on: { click: () => openWin("variations") } }, sprite("variations"), "Variations"),
        h("button.mc-barkey", { type: "button", title: "Animate this post: a first timing, then the piece's own window", on: { click: () => { const m = macaron.brand.body.motion.find((x) => x.design === d.id) ?? addMotion(); pickMotion(m.id); openWin("motion"); } } }, mcicon("clapper"), "Animate"),
        h("span.mc-export", {},
          h(`button.mc-primary${busy ? ".is-busy" : ""}`, { type: "button", disabled: busy, title: `Export ${FORMATS[macaron.format].name} as a PNG, ${nativeSize(macaron.format).w}×${nativeSize(macaron.format).h}`, on: { click: () => exportPng() } }, sprite("export"), busy ? "Exporting" : `Export ${labelOf(macaron.format)}`),
          others.length ? key(sprite("export"), "Export every format as PNGs", async () => { for (const f of [d.format, ...shown.filter((x) => x !== d.format)]) await exportPng(d.id, f); }, { quiet: false }) : null)));
  }
  function drawFormats(d) {
    const own = (f) => f === d.format || d.formats?.[f];
    const shown = [...new Set([...familyFormats(d.format), ...ownFormats(d)])];
    // the other formats, to add: any of the families, with the pixels each is made of
    const more = ALL_FORMATS.filter((f) => !shown.includes(f));
    fill(formats,
      h("div.mc-segs", { role: "group", "aria-label": "Format" }, ...shown.map((f) =>
        h("button.mc-seg", { type: "button", title: `${FORMATS[f].name} · ${FORMATS[f].use} · ${nativeSize(f).w}×${nativeSize(f).h}${own(f) ? "" : "\nAn automatic layout: edit it to make it your own"}`, "aria-pressed": String(macaron.format === f), on: { click: () => setFormat(f) } },
          sprite(ratioGlyph(f)), labelOf(f), own(f) ? null : h("i.mc-auto", { title: "Automatic layout" })))),
      more.length ? dropdown({ label: "Add a format", value: "", items: [{ value: "", label: "Add a format", glyph: () => icon("plus") }, ...more.map((f) => ({ value: f, label: FORMATS[f].name, desc: `${nativeSize(f).w} × ${nativeSize(f).h}`, group: FAMILIES[familyOf(f)].name, glyph: () => sprite(ratioGlyph(f)) }))], onChange: (f) => f && (own(f) ? setFormat(f) : adaptFormat(f)), width: "fit" }) : null,
      macaron.format !== d.format ? h("button.key.is-sm", { type: "button", title: "Lay the design out again for this format: type kept, everything inside its safe zones", on: { click: () => adaptFormat(macaron.format) } }, icon("remix"), "Reflow") : null,
      h("span.spacer"),
      key(mcicon("safe"), macaron.format === "9:16" ? "Show the safe zones: the story's app covers the top and the bottom" : "Show the safe margin", () => toggleSafe(), { on: macaron.safe }));
  }
  const CHECKS = [["Palette", ["palette"]], ["Logo", ["logo", "logo-size", "logo-ground"]], ["Easy to read", ["contrast", "small"]], ["Inside the safe zone", ["safe"]]];
  function drawGuard(d) {
    const issues = guardOf(d, macaron.format);
    const bad = issues.filter((i) => i.level === "bad").length;
    const tone = bad ? "crit" : issues.length ? "warn" : "ok";
    const lay = layoutNow().layers;
    const named = new Set(CHECKS.flatMap(([, rules]) => rules));
    const line = (i) => h("li", { className: `is-${i.level}` }, h("button", { type: "button", disabled: !i.layer, on: { click: () => i.layer && pickLayer(i.layer) } },
      h("span.mc-gtick", { dataset: { tone: i.level === "bad" ? "crit" : "warn" } }, i.level === "bad" ? icon("close") : "!"), h("span", {}, i.text, i.layer ? h("em", {}, lay.find((l) => l.id === i.layer)?.name ?? "") : null)));
    fill(guardEl,
      h("div.mc-head", {}, h("span.card-label", {}, "Brand guard"), h("span.lamp", { dataset: { tone } }), h("em.mc-head-sub", {}, issues.length ? `${issues.length} ${issues.length === 1 ? "note" : "notes"}${bad ? `, ${bad} to fix` : ""}` : "Nothing to flag")),
      h("ul.mc-checks", {},
        ...CHECKS.map(([name, rules]) => {
          const found = issues.filter((i) => rules.includes(i.rule));
          return found.length ? found.map(line) : h("li.is-ok", {}, h("span.mc-line-ok", {}, h("span.mc-gtick", { dataset: { tone: "ok" } }, icon("check")), h("span", {}, name)));
        }).flat(),
        ...issues.filter((i) => !named.has(i.rule)).map(line)));
  }
  function drawTools(d) {
    fill(tools,
      h("div.mc-brioche-keys", {},
        h("img.mc-brioche", { src: "brand/cast/brioche-face.webp", alt: "", draggable: false }),
        h("button.key.is-sm", { type: "button", title: "Brioche sets type roles, colours and the logo from the kit and keeps everything inside the safe zones", on: { click: () => { const did = applyKitNow(); toast(did.length ? `Kit applied: ${did.join(", ").toLowerCase()}.` : "Already on brand."); } } }, mcicon("kit"), "Apply the kit"),
        dropdown({ label: "Layout", value: d.layout ?? "", items: [{ value: "", label: "Layout…", short: "Layout" }, ...Object.entries(LAYOUTS).map(([k, v]) => ({ value: k, label: v }))], onChange: (v) => v && applyLayout(v), width: "fit", note: "Brioche lays the layers out by what they are for" }),
        h("button.key.is-sm", { type: "button", title: "Brioche writes another take on this design, and saves it as a variation", on: { click: () => askMacaron("Make a variation of this design with different copy: keep the voice, shorter headline.") } }, sprite("variations"), "Vary"),
        h("button.key.is-sm", { type: "button", title: "A picture behind the design, from an image model", on: { click: () => ((macaron.productTab = "make"), openWin("product")) } }, sprite("image-generate"), "Picture")));
  }
  const update2 = () => update();

  // ---- the layer list
  function drawLayers(d) {
    const lay = layoutNow().layers;
    const rows = [...d.layers].reverse().map((l0) => {
      const l = lay.find((x) => x.id === l0.id) ?? l0;
      const hidden = !!l.hidden;
      return h(`div.mc-layer${l.id === macaron.layer ? ".is-on" : ""}${hidden ? ".is-hidden" : ""}`, { draggable: true, dataset: { id: l.id }, on: {
        click: (e) => !e.target.closest("button, input") && pickLayer(l.id),
        dragstart: (e) => (e.dataTransfer.setData("text/plain", l.id), e.dataTransfer.effectAllowed = "move"),
        dragover: (e) => (e.preventDefault(), e.currentTarget.classList.add("is-over")),
        dragleave: (e) => e.currentTarget.classList.remove("is-over"),
        drop: (e) => {
          e.preventDefault();
          const from = e.dataTransfer.getData("text/plain");
          // dropped on a row: it goes above that row, which is after it in the stack
          const at = d.layers.findIndex((x) => x.id === l.id);
          reorderLayer(from, d.layers[at + 1]?.id ?? null);
        },
      } },
        h("span.mc-grip", {}, "⋮⋮"),
        h("span.mc-layer-tile", {}, mcicon(TYPE_ICON[l.type] ?? "shape")),
        h("span.mc-layer-name", { title: l.type === "text" ? String(l.text).replace(/\*/g, "") : l.name }, l.name ?? l.type),
        h("span.mc-layer-keys", {},
          key(mcicon(hidden ? "hidden" : "shown"), hidden ? "Show in this format" : "Hide in this format", () => patchAndEdit(l.id, { hidden: !hidden }, hidden ? "Shown" : "Hidden")),
          key(mcicon(l0.locked ? "locked" : "unlocked"), l0.locked ? "Unlock" : "Lock", () => patchAndEdit(l.id, { locked: !l0.locked }, "Lock"))),
        // (over the end of the name, so the row does not change as it is pointed at)
        h("span.mc-layer-move", {},
          key(mcicon("up"), "Up one", () => moveLayer(l.id, 1)),
          key(mcicon("down"), "Down one", () => moveLayer(l.id, -1))));
    });
    // (the same four adds as before: the keys are four tiles of their own now, with the word under the icon)
    const adds = [["text", "Text", "Add text"], ["image", "Image", "Add a picture"], ["logo", "Logo", "Add the logo"], ["shape", "Shape", "Add a shape"]];
    fill(layersEl,
      h("div.mc-head", {}, h("span.card-label", {}, "Layers"), h("em.mc-head-sub", {}, String(d.layers.length))),
      h("div.mc-layer-list", {}, ...rows,
        h(`div.mc-layer.is-bg${!macaron.layer ? ".is-on" : ""}`, { on: { click: () => pickLayer(null) } }, h("span.mc-grip", {}), h("span.mc-layer-tile", {}, mcicon("studio")), h("span.mc-layer-name", {}, "Ground"))),
      h("button.key.is-sm.is-quiet.mc-spread", { type: "button", title: "Space the text and pictures evenly down the frame", on: { click: () => !distribute(lay.filter((l) => !l.hidden && (l.type === "text" || l.type === "image") && l.w < 0.98).map((l) => l.id)) && toast("Spacing needs three layers.") } }, mcicon("spread"), "Space evenly"),
      h("div.mc-add-layer", {}, h("span.label", {}, "Add a layer"),
        h("div.mc-add-tiles", {}, ...adds.map(([t, word, tip]) => h("button.mc-add-tile", { type: "button", title: tip, "aria-label": tip, on: { click: (e) => t === "image" ? pickAsset(e.currentTarget, (a) => addLayer("image", { name: a.name, src: a.url, fit: "cover", crop: { x: 0, y: 0, w: 1, h: 1 }, w: 0.6, h: Math.min(0.6, 0.6 * (frameOf(macaron.format).w / frameOf(macaron.format).h) * (a.height / a.width)) })) : addLayer(t) } }, mcicon(TYPE_ICON[t]), h("span", {}, word))))));
  }
  const patchAndEdit = (id, patch, note) => {
    begin();
    live(() => patchLayer(id, patch));
    end(note);
  };

  // ---- the inspector
  function drawInspector(d) {
    const lay = layoutNow().layers;
    const l = lay.find((x) => x.id === macaron.layer);
    const kit = kitNow();
    const f = macaron.format;
    const set = (id) => (patch) => patchLayer(id, patch);
    const kids = [];
    if (!l) {
      kids.push(h("div.mc-head", {}, h("span.card-label", {}, "Ground")));
      kids.push(row("Colour", swatches(kit, layoutNow().bg.color, (c) => setBg({ color: c }))));
      const bg = layoutNow().bg;
      kids.push(row("Picture",
        h("div.mc-pic-row", {},
          bg.src ? h("img.mc-pic-thumb", { src: bg.src, alt: "" }) : null,
          h("button.key.is-sm", { type: "button", on: { click: (e) => pickAsset(e.currentTarget, (a) => setBg({ src: a.url, crop: { x: 0, y: 0, w: 1, h: 1 } }), { title: "A picture behind" }) } }, icon("image"), bg.src ? "Replace" : "Add"),
          bg.src ? h("button.key.is-sm.is-quiet", { type: "button", on: { click: () => setBg({ src: null }) } }, icon("close"), "Remove") : null)));
      if (bg.src) {
        kids.push(row("Ink over it", slider({ value: bg.dim?.alpha ?? 0, min: 0, max: 0.9, step: 0.01, note: "Ink over the picture", read: (v) => `${Math.round(v * 100)}%`, set: (v) => (macaron.format === d.format ? (d.bg.dim = { color: "ink", alpha: v }) : ((d.formats[f] ??= { layers: reflowFor(d, f) }).bg = { ...(d.formats[f].bg ?? {}), dim: { color: "ink", alpha: v } })) })));
        kids.push(cropRows(bg.crop, (c) => (macaron.format === d.format ? (d.bg.crop = c) : ((d.formats[f] ??= { layers: reflowFor(d, f) }).bg = { ...(d.formats[f].bg ?? {}), crop: c })), bg.src));
      }
      kids.push(h("div.mc-head.is-gap", {}, h("span.card-label", {}, "Design")));
      kids.push(row("Intent", textField({ value: d.intent ?? "", rows: 2, set: (v) => setDesignLive({ intent: v.slice(0, 160) }), note: "Intent", placeholder: "What this one is for" })));
      kids.push(row("Campaign", textField({ value: d.campaign ?? "", set: (v) => setDesignLive({ campaign: v.slice(0, 60) }), note: "Campaign", placeholder: "Launch week" })));
      kids.push(h("p.mc-hint", {}, "Pick a layer on the canvas or in the list to change its words, picture, colours and place."));
    } else {
      const l0 = d.layers.find((x) => x.id === l.id);
      kids.push(h("div.mc-head", {}, h("span.card-label", {}, "Inspector"), h("em.mc-head-sub", {}, l.name ?? l.type), h("div.card-tools", {}, key(sprite("copy"), "Duplicate (Ctrl D)", () => duplicateLayer(l.id)), key(icon("trash"), "Delete (Delete)", () => removeLayer(l.id)))));
      kids.push(row("Name", textField({ value: l0.name ?? "", set: (v) => set(l.id)({ name: v.slice(0, 40) }), note: "Renamed", label: "The layer's name" })));
      if (l.type === "text") kids.push(...textRows(l, set(l.id), kit));
      if (l.type === "image") kids.push(...imageRows(l, set(l.id), d));
      if (l.type === "logo") kids.push(...logoRows(l, set(l.id), kit));
      if (l.type === "shape") kids.push(...shapeRows(l, set(l.id), kit));
      kids.push(h("div.mc-head.is-gap", {}, h("span.card-label", {}, `Place · ${f}`), macaron.format !== d.format && !d.formats?.[f] ? chip("auto", { title: "An automatic layout until you change it" }) : null));
      kids.push(h("div.mc-place", {},
        ...[["x", "X"], ["y", "Y"], ["w", "W"], ...(l.type === "logo" || (l.type === "text" && !(l.h > 0)) ? [] : [["h", "H"]])].map(([p, t]) => h("label.mc-axis", {}, h("span", {}, t), numberField({ value: l[p] ?? 0, scale: 100, step: 0.5, suffix: "%", prop: p, label: `${t} in percent of the frame`, note: `Placed ${p}`, set: (v) => set(l.id)({ [p]: r4(v) }) })))));
      kids.push(h("div.mc-align", {}, ...[["left", "Align left"], ["center", "Centre across"], ["right", "Align right"], ["top", "Align top"], ["middle", "Centre down"], ["bottom", "Align bottom"]].map(([w, t]) => key(mcicon(w), `${t} (to the safe frame)`, () => alignLayer(l.id, w)))));
      kids.push(row("Turn", slider({ value: l.rot ?? 0, min: -180, max: 180, step: 1, read: (v) => `${v}°`, note: "Turned", set: (v) => set(l.id)({ rot: v }), prop: "rot" })));
      kids.push(row("Opacity", slider({ value: l.opacity ?? 1, min: 0, max: 1, step: 0.01, read: (v) => `${Math.round(v * 100)}%`, note: "Opacity", set: (v) => set(l.id)({ opacity: v }) })));
    }
    fill(inspector, ...kids);
  }

  function textRows(l, set, kit) {
    return [
      row("Words", textField({ value: l.text ?? "", rows: 3, set: (v) => set({ text: v }), note: "Edited the words", label: "The words" })),
      h("p.mc-hint", {}, "*Asterisks* set a word in the accent colour."),
      row("Type", seg([["display", "Display"], ["text", "Text"], ["mono", "Mono"]], l.fontRole, (v) => patchEdit(l.id, { fontRole: v }, "Type role"), { cls: "is-small", label: "Type role" })),
      row("Size", slider({ value: l.size, min: 0.016, max: 0.22, step: 0.001, read: (v) => `${Math.round(v * 1080)} px`, note: "Type size", set: (v) => set({ size: r4(v) }), prop: "size" })),
      row("Leading", slider({ value: l.lineHeight ?? 1.15, min: 0.85, max: 1.8, step: 0.01, read: (v) => v.toFixed(2), note: "Line height", set: (v) => set({ lineHeight: v }) })),
      row("Tracking", slider({ value: l.tracking ?? 0, min: -0.06, max: 0.3, step: 0.005, read: (v) => `${v.toFixed(2)} em`, note: "Tracking", set: (v) => set({ tracking: v }) })),
      row("Align", h("div.mc-pair", {}, seg([["left", mcicon("alignLeft"), "Left"], ["center", mcicon("alignCenter"), "Centre"], ["right", mcicon("alignRight"), "Right"]], l.align ?? "left", (v) => patchEdit(l.id, { align: v }, "Aligned"), { cls: "is-icons" }),
        seg([["top", mcicon("vTop"), "Top of its box"], ["middle", mcicon("vMiddle"), "Middle"], ["bottom", mcicon("vBottom"), "Bottom"]], l.valign ?? "top", (v) => patchEdit(l.id, { valign: v }, "Aligned"), { cls: "is-icons" }))),
      row("Colour", swatches(kit, l.colorRole, (c) => patchEdit(l.id, { colorRole: c }, "Colour"))),
      row("Accent", swatches(kit, l.accent, (c) => patchEdit(l.id, { accent: c }, "Accent colour"))),
      row("Case", seg([[false, "As written"], [true, "CAPS"]], !!l.caps, (v) => patchEdit(l.id, { caps: v }, "Case"), { cls: "is-small" })),
      row("Box", seg([[0, "Grows"], [1, "Fits a height"]], l.h > 0 ? 1 : 0, (v) => patchEdit(l.id, { h: v ? Math.max(0.08, (measure()(l, frameOf(macaron.format).w, frameOf(macaron.format).h).h / frameOf(macaron.format).h)) : 0 }, "Box"), { cls: "is-small" })),
    ];
  }
  const patchEdit = (id, patch, note) => {
    begin();
    live(() => patchLayer(id, patch));
    end(note);
  };

  /** A crop as zoom and where to look: the picture's own part kept, trimmed to the box's shape when drawn. */
  function cropRows(crop, apply, src) {
    const c = crop ?? { x: 0, y: 0, w: 1, h: 1 };
    const zoom = 1 / Math.max(0.1, c.w);
    const fx = c.x + c.w / 2;
    const fy = c.y + c.h / 2;
    const put = (z, x, y) => {
      const w = Math.min(1, 1 / Math.max(1, z));
      apply({ x: r4(Math.min(1 - w, Math.max(0, x - w / 2))), y: r4(Math.min(1 - w, Math.max(0, y - w / 2))), w: r4(w), h: r4(w) });
    };
    return h("div.mc-crop", {},
      row("Zoom", slider({ value: zoom, min: 1, max: 4, step: 0.01, read: (v) => `${v.toFixed(2)}×`, note: "Cropped", set: (v) => put(v, fx, fy) })),
      row("Look at", h("div.mc-pair", {}, slider({ value: fx, min: 0, max: 1, step: 0.005, read: (v) => `x ${Math.round(v * 100)}`, note: "Cropped", set: (v) => put(zoom, v, fy) }), slider({ value: fy, min: 0, max: 1, step: 0.005, read: (v) => `y ${Math.round(v * 100)}`, note: "Cropped", set: (v) => put(zoom, fx, v) }))));
  }
  function imageRows(l, set, d) {
    return [
      row("Picture", h("div.mc-pic-row", {}, l.src ? h("img.mc-pic-thumb", { src: l.src, alt: "" }) : null,
        h("button.key.is-sm", { type: "button", title: "Replace the picture: from the project, the Library or the computer", on: { click: (e) => pickAsset(e.currentTarget, (a) => patchEdit(l.id, { src: a.url, crop: { x: 0, y: 0, w: 1, h: 1 }, name: l.name === "Image" ? a.name : l.name }, "Replaced the picture")) } }, sprite("image-replace"), "Replace"))),
      row("Fit", seg([["cover", "Fill the box"], ["contain", "Whole picture"]], l.fit ?? "cover", (v) => patchEdit(l.id, { fit: v }, "Fit"), { cls: "is-small" })),
      cropRows(l.crop, (c) => set({ crop: c }), l.src),
      row("Corners", slider({ value: l.radius ?? 0, min: 0, max: 0.12, step: 0.001, read: (v) => `${Math.round(v * 1080)} px`, note: "Corners", set: (v) => set({ radius: r4(v) }) })),
      row("Shadow", seg([[false, "None"], [true, "Soft"]], !!l.shadow, (v) => patchEdit(l.id, { shadow: v ? { blur: 0.05, dy: 0.02, alpha: 0.45 } : null }, "Shadow"), { cls: "is-small" })),
      row("Mirror", seg([[false, "As it is"], [true, "Flipped"]], !!l.flip, (v) => patchEdit(l.id, { flip: v }, "Flipped"), { cls: "is-small" })),
    ];
  }
  function logoRows(l, set, kit) {
    const kind = kit.logos.find((x) => x.id === l.logo)?.kind;
    return [
      row("File", h("div.mc-logos", {}, ...kit.logos.filter((x) => !kind || x.kind === kind).map((x) => h("button.mc-logo-pick", { type: "button", title: `${x.name}\nFor ${x.ground || "any ground"}`, "aria-pressed": String(x.id === l.logo), dataset: { tone: x.tone }, on: { click: () => patchEdit(l.id, { logo: x.id }, "Logo file") } }, h("img", { src: x.url, alt: x.name, draggable: false }))))),
      row("Width", slider({ value: l.w, min: 0.06, max: 0.9, step: 0.005, read: (v) => `${Math.round(v * 1080)} px`, note: "Logo size", set: (v) => set({ w: r4(v) }), prop: "w" })),
      h("p.mc-hint", {}, "The logo is drawn from the supplied file, never redrawn. Keep a lid's height clear around it."),
    ];
  }
  function shapeRows(l, set, kit) {
    return [
      row("Shape", seg([["round", "Round"], ["rect", "Square"], ["pill", "Pill"], ["ellipse", "Oval"], ["ring", "Ring"]], l.shape ?? "round", (v) => patchEdit(l.id, { shape: v }, "Shape"), { cls: "is-small" })),
      row("Colour", swatches(kit, l.colorRole, (c) => patchEdit(l.id, { colorRole: c }, "Colour"))),
      l.shape === "round" ? row("Corners", slider({ value: l.radius ?? 0.03, min: 0, max: 0.2, step: 0.001, read: (v) => `${Math.round(v * 1080)} px`, note: "Corners", set: (v) => set({ radius: r4(v) }) })) : null,
      row("Shadow", seg([[false, "None"], [true, "Soft"]], !!l.shadow, (v) => patchEdit(l.id, { shadow: v ? { blur: 0.05, dy: 0.02, alpha: 0.4 } : null }, "Shadow"), { cls: "is-small" })),
    ].filter(Boolean);
  }

  /** Numbers in the inspector follow the layer while it is dragged. */
  function syncInspector() {
    const l = layoutNow().layers.find((x) => x.id === macaron.layer);
    if (!l) return;
    for (const input of inspector.querySelectorAll("[data-sync]")) {
      if (document.activeElement === input) continue;
      const v = l[input.dataset.sync];
      if (typeof v !== "number") continue;
      input.value = input.dataset.scale ? Math.round(v * Number(input.dataset.scale) * 100) / 100 : v;
      if (input.dataset.out) input.nextElementSibling.textContent = input.dataset.sync === "size" ? `${Math.round(v * 1080)} px` : input.dataset.sync === "w" ? `${Math.round(v * 1080)} px` : input.dataset.sync === "rot" ? `${v}°` : v;
    }
  }

  onLive(() => {
    // (nothing to draw while no design is open: a brand with none, or one whose last design was just undone)
    if (!designNow()) return;
    draw();
    syncInspector();
  });
  window.addEventListener("resize", () => draw());

  function update() {
    const d = designNow();
    if (!macaron.brand) return;
    if (!d) {
      stage.hidden = true;
      bar.replaceChildren();
      fill(layersEl, );
      fill(inspector, h("div.mc-empty", {}, h("p", {}, "No designs yet."), h("button.key.is-accent", { type: "button", on: { click: () => addDesign({ name: `${macaron.brand.name} · first`, format: "4:5" }) } }, icon("plus"), "Start one from the brand kit")));
      return;
    }
    stage.hidden = false;
    drawBar(d);
    drawFormats(d);
    drawLayers(d);
    drawGuard(d);
    drawTools(d);
    const typing = inspector.contains(document.activeElement) && document.activeElement.matches("input[type=text], input:not([type]), textarea");
    if (!typing) drawInspector(d);
    draw();
  }
  return { el, update, draw };
}
