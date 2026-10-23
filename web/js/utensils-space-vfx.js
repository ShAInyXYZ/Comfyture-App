// The Utensils "VFX" workspace: eleven effects for a clip (or a picture). On the left a gallery of cards, each a before/after
// split of what it does and an honest word on where it runs (free on this machine, or on Comfy Cloud, or a partner's); on the right
// the workbench of the one picked: the stage with the clip, its transport and its strip of frames, the tool's controls, and the
// keys (one real frame of what it would make, then the yellow one). The tools are in utensils-vfx-tools.js, their controls in
// utensils-vfx-bench.js, the stage in utensils-vfx-stage.js. Made once and kept: a clip that plays must not be made again at each
// redraw, so the stage lives on and the cards and the controls are drawn again around it.
// A workspace is { el, update, sig, count }: the shell (panels/utensils.js) puts el in the grid and calls update() when sig() changes.
import { sendToSpice } from "./spice.js";
import { h, icon, sprite } from "./dom.js";
import { changed, toast } from "./store.js";
import { utensils, inputOf, setInput, setQuietly, pickTool, pickInput, runTool, takersOf, handOn, forget, recent } from "./utensils.js";
import { VFX, vfxById, isVfx, registerVfxTools, paramsOf, readyOf, artOf, cloudNow, costFor, runCloudTool, openGrade, masks, templateOf } from "./utensils-vfx-tools.js";
import { fxPreview, fxCaps } from "./utensils-fx-api.js";
import { createStage } from "./utensils-vfx-stage.js";
import { controlsOf } from "./utensils-vfx-bench.js";
import { compare } from "./utensils-bench.js";
import { runnerOf, runnerReady, mapSlots } from "./utensils-cloud.js";

// the tools are on the shelf as soon as the page is (the Shelf's grid and Truffle know them before this workspace is open)
registerVfxTools();

const SERVER = { "vfx-chroma": "chroma", "vfx-weather": "weather", "vfx-sparks": "sparks", "vfx-remove": "unlogo" };
/** The tools that can show one real frame of what they would make. */
const previews = (id, p) => (id === "vfx-remove" ? p.how === "paint" : !!SERVER[id]);
// what is on show, by tool: whether the clip or the result, the real frame asked for, and the mask kept for each clip
const ui = { view: {}, seen: {}, shot: {}, armed: null, picking: false, caps: null, asking: false, schemas: new Map() };
const GROUP = "Eleven effects, six of them free";
const time = (s) => `${Math.floor((s ?? 0) / 60)}:${String(Math.floor((s ?? 0) % 60)).padStart(2, "0")}`;

export function vfxSpace() {
  const el = h("div.ut-grid.is-vfx");
  const gallery = h("section.ut-bento.uv-gallery");
  const benchBox = h("section.ut-bento.uv-benchbox");
  const stageHost = h("div.uv-host");
  const lower = h("div.uv-lower");
  let go = null;
  let cleared = true;

  const stage = createStage({
    mask: (has) => {
      const url = inputOf("vfx-remove").video?.url;
      if (!url) return;
      if (has) masks.set(url, stage.maskPNG());
      else masks.delete(url);
      changed("utensils");
    },
    pick: (hex) => {
      ui.picking = false;
      setInput({ colour: hex }, "vfx-chroma");
    },
  });

  const current = () => (isVfx(utensils.tool) ? vfxById(utensils.tool) : vfxById("vfx-remove"));
  const set = (id) => (patch, quiet = false) => {
    ui.armed = null;
    quiet ? setQuietly(patch, id) : setInput(patch, id);
    if (!quiet) afterChange(id);
  };
  /** Moving a setting while a real frame is on show makes the frame again, a moment after the last change. */
  let later = 0;
  function afterChange(id) {
    clearTimeout(later);
    if (ui.shot[id]) later = setTimeout(() => preview(id, true), 280);
  }

  // ---- the gallery: a card per effect
  function cards() {
    const def = current();
    const caps = ui.caps;
    return VFX.map((t) => {
      const art = artOf(t.id);
      const cap = { "vfx-chroma": "chroma", "vfx-stabilise": "stabilise", "vfx-slowmo": "slowmo", "vfx-weather": "weather", "vfx-sparks": "sparks", "vfx-remove": null }[t.id];
      const off = cap && caps && caps[cap] === false;
      return h(`button.uv-card${t.id === def.id ? ".is-on" : ""}${off ? ".is-off" : ""}`, {
        type: "button", disabled: off, title: off ? "This machine's ffmpeg cannot do this one." : t.hint, "aria-pressed": String(t.id === def.id), dataset: { tool: t.id, way: t.way },
        on: { click: () => (t.id === "vfx-grade" ? openGrade() : pickTool(t.id)) },
      },
      h("span.uv-art", {},
        h("img", { src: art.before, alt: "", draggable: false, loading: "lazy", on: { error: (e) => e.target.remove() } }),
        h("img.uv-after", { src: art.after, alt: "", draggable: false, loading: "lazy", on: { error: (e) => e.target.remove() } }),
        h("i.uv-art-split"),
        h("b.uv-art-tag.is-before", {}, "Before"), h("b.uv-art-tag.is-after", {}, "After"),
        h("span.uv-art-icon", {}, sprite(t.icon)),
        h(`span.uv-card-way.is-${t.way}`, {}, t.tag)),
      h("span.uv-card-name", {}, t.name),
      h("span.uv-card-hint", {}, t.hint));
    });
  }

  // ---- the stage: the clip, a picture, a result, or a place to drop one
  const needs = (def, p) => (def.id === "vfx-retouch" || (def.id === "vfx-relight" && p.mode === "picture") ? "image" : "video");
  function feed(def, p, i) {
    const kind = needs(def, p);
    const made = recent(1, def.id)[0];
    const view = made && ui.view[def.id] === "result" ? made : null;
    // a result that is a picture is judged against the picture it came from
    if (view?.kind === "image") {
      const before = i.image ?? p.picture;
      stageHost.replaceChildren(h("div.uv-compare", {}, before ? compare({ url: before.url, width: before.width, height: before.height }, view) : h("img.ut-still", { src: view.url, alt: "" })));
      return "result";
    }
    const source = view?.kind === "video" ? { url: view.url, width: view.width, height: view.height, duration: view.seconds } : kind === "video" ? i.video : null;
    if (kind === "image" && !view) i.image ? stage.setPicture(i.image) : stage.setClip(null);
    else stage.setClip(source);
    const has = kind === "image" ? !!i.image : !!source;
    stageHost.replaceChildren(has ? stage.el : drop(def, kind));
    return view ? "result" : "input";
  }
  function drop(def, kind) {
    return h("button.ut-drop.uv-drop", { type: "button", on: { click: (e) => pickInput(kind, e.currentTarget) } }, sprite(def.icon), h("b", {}, kind === "video" ? "Drop a clip" : "Drop a picture"), h("span", {}, "or paste it, or click to pick"));
  }

  /** The row above the stage: what is on it (the clip, or what it became), a key to replace it, and what to do with a result. */
  function views(def, p, i) {
    const made = recent(1, def.id)[0];
    const kind = needs(def, p);
    const media = kind === "image" ? i.image : i.video;
    const on = made && ui.view[def.id] === "result" ? "result" : "input";
    const takers = made ? takersOf(made).filter((x) => x.id !== def.id).slice(0, 4) : [];
    return h("div.uv-views", {},
      made ? h("div.ut-segs", { role: "group" }, ...[["input", "Original"], ["result", "Result"]].map(([v, label]) =>
        h("button.ut-seg", { type: "button", "aria-pressed": String(on === v), on: { click: () => ((ui.view[def.id] = v), changed("utensils")) } }, label)))
        : h("span.uv-media", {}, media ? (kind === "image" ? `Picture · ${media.width} × ${media.height}` : `Clip · ${time(media.duration)} · ${media.width} × ${media.height}`) : kind === "image" ? "No picture yet" : "No clip yet"),
      on === "result" ? h("span.uv-views-note", {}, made.note ?? "") : null,
      h("span.spacer"),
      h("button.ut-iconkey", { type: "button", title: kind === "image" ? "Use another picture" : "Use another clip", "aria-label": "Replace it", on: { click: (e) => pickInput(kind, e.currentTarget) } }, icon("upload")),
      ...(made ? [
        ...takers.map((x) => h("button.ut-iconkey", { type: "button", title: `Give the result to ${x.name}`, "aria-label": `Give it to ${x.name}`, on: { click: () => handOn(made, x.id) } }, sprite(x.icon))),
        h("a.ut-iconkey", { href: `${made.url}?download=${def.id}-${made.id}`, download: `${def.id}-${made.id}`, title: "Download the result", "aria-label": "Download" }, icon("download")),
        h("button.ut-iconkey.is-quiet", { type: "button", title: "Take it off the list\nThe file stays in the Library", "aria-label": "Take it off the list", on: { click: () => (forget(made.id), (ui.view[def.id] = "input")) } }, icon("trash")),
      ] : []));
  }

  // ---- what a cloud tool's template holds beyond the tool's own fields
  function schemaOf(t) {
    if (!ui.schemas.has(t.name)) {
      ui.schemas.set(t.name, null);
      runnerOf().then(async (api) => {
        if (!api) return void ui.schemas.set(t.name, { rest: [] });
        try {
          const { schema } = await api.getTemplate(t.name);
          ui.schemas.set(t.name, { rest: mapSlots(schema, t.want).rest });
        } catch {
          ui.schemas.set(t.name, { rest: [] });
        }
        changed("utensils");
      });
    }
    return ui.schemas.get(t.name);
  }

  // ---- one real frame of what an effect would make
  const busy = new Set();
  async function preview(id, quiet = false) {
    const def = vfxById(id);
    const i = inputOf(id);
    const p = paramsOf(id);
    if (busy.has(id) || !i.video?.file) return;
    busy.add(id);
    changed("utensils");
    try {
      const body = { video: i.video.file, ...(id === "vfx-chroma" ? { colour: p.colour, similarity: p.similarity, blend: p.blend, despill: p.despill, output: p.output === "colour" ? "colour" : "webm", background: p.background } : {}),
        ...(id === "vfx-weather" ? { kind: p.kind, amount: p.amount, speed: p.speed, angle: p.angle } : {}), ...(id === "vfx-sparks" ? { kind: p.kind, amount: p.amount, speed: p.speed, direction: p.direction } : {}),
        ...(id === "vfx-remove" ? { grow: p.grow, mask: masks.get(i.video.url) } : {}) };
      const { url } = await fxPreview(SERVER[id], body, stage.time());
      ui.shot[id] = url;
    } catch (e) {
      if (!quiet) toast(`${def.name}: ${e.message}`, { tone: "crit" });
      ui.shot[id] = null;
    } finally {
      busy.delete(id);
      changed("utensils");
    }
  }

  // ---- the bench: head, stage, controls, keys
  function draw() {
    const def = current();
    const p = paramsOf(def.id);
    const i = inputOf(def.id);
    const mode = feed(def, p, i);
    // what the pointer does on the picture
    const paint = def.id === "vfx-remove" && p.how === "paint" && mode === "input";
    const picking = def.id === "vfx-chroma" && ui.picking && mode === "input";
    stage.setMode(picking ? "pick" : paint ? "mask" : "view", picking ? "Click the colour to take out" : paint ? "Paint over the spot" : "");
    stage.setBrush({ tool: p.brush ?? "brush", size: p.size ?? 60 });
    stage.showShot(mode === "input" && ui.shot[def.id] ? ui.shot[def.id] : null, () => ((ui.shot[def.id] = null), changed("utensils")));
    const env = {
      set: set(def.id),
      say: (patch) => (setQuietly(patch, def.id), refreshGo(def)),
      picking: () => ui.picking,
      pick: (on) => ((ui.picking = on), changed("utensils")),
      hasMask: () => stage.hasMask(),
      clearMask: () => stage.clearMask(),
      schema: schemaOf,
    };
    benchBox.dataset.tool = def.id;
    benchBox.replaceChildren(
      h("div.ut-b-head", {}, h("span.ut-b-label", {}, "Workbench"), h("span.ut-b-note", {}, def.way === "local" ? "Free · on this machine" : def.way === "link" ? "In Edit" : cloudNow(def.id, p) ? "On Comfy Cloud" : "Free · on this machine")),
      h("div.uv-title", {}, h("span.uv-title-icon", {}, sprite(def.icon)), h("div", {}, h("h2", {}, def.name), h("p", {}, def.hint))),
      views(def, p, i),
      h("div.uv-stagebox-host", {}, stageHost),
      h("div.uv-lower", {},
        h("div.uv-controls", {}, ...controlsOf(def.id, p, i, env)),
        keys(def, p, i)));
  }

  function costLine(def, p, i, armed) {
    if (!cloudNow(def.id, p)) return h("span.uv-meta", {}, h("b", {}, "Free"), h("em", {}, "on this machine"));
    const c = costFor(def.id, i, () => changed("utensils"));
    const t = templateOf(def.id, p);
    const what = t?.partner ? `partner · ${t.partner}` : c?.gpu ? "of GPU time on Cloud" : "on Comfy Cloud";
    return h(`span.uv-meta${armed ? ".is-armed" : ""}`, {}, h("b", {}, c?.label ?? "≈ ? cr"), h("em", {}, armed ? (t?.partner ? `sent to ${t.partner}: spend it?` : "spend it on Cloud?") : what));
  }
  /** A cloud run asks for the person's yes to the price first: the yellow key turns into the yes for a few seconds. */
  function arm(id) {
    ui.armed = { id, until: Date.now() + 8000 };
    changed("utensils");
    setTimeout(() => ui.armed?.id === id && ui.armed.until <= Date.now() && ((ui.armed = null), changed("utensils")), 8100);
  }
  function keys(def, p, i) {
    const ok = readyOf(def.id, i);
    const running = utensils.jobs.some((j) => j.tool === def.id && j.status === "running");
    const cloud = cloudNow(def.id, p);
    const ready = ok && !running && (!cloud || runnerReady());
    const armed = cloud && ready && ui.armed?.id === def.id && ui.armed.until > Date.now();
    const run = () => {
      if (!cloud) return runTool(def.id);
      if (!armed) return arm(def.id);
      ui.armed = null;
      changed("utensils");
      return runCloudTool(def.id).catch((e) => toast(`${def.name}: ${e.message}`, { tone: "crit" }));
    };
    go = h("button.ut-primary.uv-go", { type: "button", disabled: !ready, title: ready ? def.hint : !runnerReady() && cloud ? "The template runner is not on this page yet" : needsWhat(def, p, i), on: { click: run } },
      sprite(def.icon), h("span", {}, running ? "Working" : armed ? "Yes, run it" : def.verb));
    const peek = previews(def.id, p)
      ? h("button.ut-ghost.uv-peek", { type: "button", disabled: !i.video?.file || (def.id === "vfx-remove" && !masks.has(i.video?.url)) || busy.has(def.id), title: "Make one real frame of it, at the playhead", on: { click: () => preview(def.id) } },
        icon("expand"), busy.has(def.id) ? "Working" : "Preview 1 frame")
      : null;
    const cancel = armed ? h("button.ut-ghost.uv-peek", { type: "button", on: { click: () => ((ui.armed = null), changed("utensils")) } }, icon("close"), "Not now") : null;
    return h("div.uv-keys-row", {}, costLine(def, p, i, armed), h("span.spacer"), armed ? cancel : peek, go);
  }
  const needsWhat = (def, p, i) => (needs(def, p) === "image" ? (i.image ? "Say what you want first" : "Add a picture first") : !i.video?.file ? "Add a clip first" : def.id === "vfx-remove" && p.how === "paint" ? "Paint over the spot first" : def.id === "vfx-background" ? "Pick the new background first" : "Say what you want first");
  /** The yellow key is lit as soon as the words it needs are typed (typing does not draw the screen again). */
  function refreshGo(def) {
    if (!go?.isConnected) return;
    const i = inputOf(def.id);
    const p = paramsOf(def.id);
    go.disabled = !(readyOf(def.id, i) && (!cloudNow(def.id, p) || runnerReady()) && !utensils.jobs.some((j) => j.tool === def.id && j.status === "running"));
  }

  function update() {
    if (!isVfx(utensils.tool)) utensils.tool = "vfx-remove";
    if (!ui.caps && !ui.asking) {
      ui.asking = true;
      fxCaps().then((c) => ((ui.caps = c), changed("utensils")));
    }
    // a result that has just come is shown (one that was there when the page was opened is left in the history)
    const made = recent(1, utensils.tool)[0];
    if (!(utensils.tool in ui.seen)) ui.seen[utensils.tool] = made?.id ?? null;
    else if (made && ui.seen[utensils.tool] !== made.id) {
      ui.view[utensils.tool] = "result";
      ui.seen[utensils.tool] = made.id;
    }
    if (cleared) {
      cleared = false;
      el.replaceChildren(gallery, benchBox);
    }
    gallery.replaceChildren(
      h("div.ut-b-head", {}, h("span.ut-b-label", {}, "VFX tools"), h("span.ut-b-note", {}, GROUP),
        // one trick on one clip is here; a whole shot worked pass after pass (cut out, cleaned, relit, an effect, the comp) is Spice's
        h("button.uv-to-spice", { type: "button", title: inputOf(current().id).video ? "A whole shot, pass after pass? Open this clip in Spice: cut out, clean up, relight, add an effect and comp it, every pass kept" : "A whole shot, pass after pass? Spice cuts out, cleans up, relights, adds an effect and comps it, every pass kept", on: { click: () => { const v = inputOf(current().id).video; sendToSpice(v ? { url: v.url, file: v.file, width: v.width, height: v.height, seconds: v.duration ?? v.seconds } : null, v?.name); } } },
          sprite("product-spice"), h("span", {}, "Whole shot? Spice"))),
      h("div.uv-cards", { dataset: { scrollKey: "uv-cards" } }, ...cards()));
    draw();
  }
  const sig = () => {
    const def = current();
    const i = inputOf(def.id);
    const p = paramsOf(def.id);
    return JSON.stringify([
      utensils.tool, i.video?.file, i.image?.file, p, ui.picking, ui.view[def.id], ui.shot[def.id], ui.armed?.id === def.id, !!ui.caps, runnerReady(), masks.has(i.video?.url), [...busy],
      recent(1, def.id)[0]?.id, utensils.jobs.some((j) => j.tool === def.id && j.status === "running"), utensils.uploading,
    ]);
  };
  return { el, update, sig, count: () => VFX.length };
}
