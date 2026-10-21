// Utensils' LIBRARY (the workspace keeps its id, "templates", and lives in the Library's frame, utensils-library-frame.js, over any
// workspace): every official ComfyUI workflow of Comfy Cloud as a book in a hall of bookcases (utensils-library.js), and the one opened
// in a panel at the right: its picture, what it asks for as a plain form, what it
// uses and what it costs, and a yellow key that asks to confirm the price before anything is sent. A mini app opens as one (a big
// picture, the one to three things to give, one key, the rest under More settings, what it made right there). What it makes goes to
// the queue and Recent like every tool's. Closing the panel leaves the hall where it was. The API is in utensils-templates-api.js (and
// server/comfy-templates.ts); a workspace is { el, update, sig, count }. revealWorkflow (Truffle's guide) is the hall's.
import { h, icon, sprite } from "./dom.js";
import { toast } from "./store.js";
import { utensils, openResult, forget, inputOf, setInput, setQuietly, takersOf, handOn } from "./utensils.js";
import { compare, waveform } from "./utensils-bench.js";
import { apps, appByName, toolIdOfApp, appCost, getTemplate, estimateTemplate, runTemplate, graphOf, pickForSlot, uploadForSlot, priceLabel, lastError } from "./utensils-templates-api.js";
import { modelViewer } from "./utensils-apps-ui.js";
import { libraryHall, askTruffle, revealWorkflow } from "./utensils-library.js";

export { revealWorkflow };

const randomSeed = () => Math.floor(Math.random() * 4294967295);

const st = {
  picked: null, detail: null, loadingDetail: false, detailError: "", values: {}, est: null, armed: false, adv: false,
  made: {}, graph: null, graphOpen: false, running: new Set(),
  // an app panel shows what it made (result) or its example; the app open comes from Truffle's tool or a book
  show: {}, toolSeen: null,
};
let armTimer = 0;

export function templatesSpace() {
  const el = h("div.ut-grid.is-templates");
  const hall = libraryHall({ open: (name) => select(name), ask: askTruffle });
  const detail = h("section.ut-bento.ut-tpl-detail", { "aria-label": "The workflow open", "aria-hidden": "true" });
  el.append(hall.el, detail);
  // Escape closes the panel (and gives the focus back to its book)
  detail.addEventListener("keydown", (e) => e.key === "Escape" && !e.target.closest("input, textarea") && (e.stopPropagation(), close()));

  // ------------------------------------------------------------ the one opened
  async function select(name) {
    st.picked = name;
    st.detail = null;
    st.detailError = "";
    st.est = null;
    st.armed = false;
    st.graph = null;
    st.graphOpen = false;
    st.loadingDetail = true;
    hall.hideCard();
    hall.setOpen(name);
    el.classList.add("is-picked");
    detail.setAttribute("aria-hidden", "false");
    drawDetail();
    try {
      const d = await getTemplate(name);
      if (st.picked !== name) return;
      st.detail = d;
      st.values = {};
      for (const s of d.schema.slots) st.values[s.id] = s.kind === "seed" ? randomSeed() : s.kind === "boolean" ? s.default === true : s.default ?? (s.kind === "text" ? "" : null);
      if (d.app) openAsTool(d);
    } catch (e) {
      if (st.picked !== name) return;
      st.detailError = e.status === 501 ? "Connect Comfy Cloud (a COMFY_API_KEY in .env) to see what this workflow asks for and to run it." : e.message;
    } finally {
      if (st.picked === name) {
        st.loadingDetail = false;
        drawDetail();
        refreshPrice(name);
      }
    }
  }
  /** The panel closes; the hall is where it was, and its book has the focus again. */
  function close() {
    const name = st.picked;
    st.picked = null;
    st.detail = null;
    st.armed = false;
    el.classList.remove("is-picked", "is-apps");
    detail.setAttribute("aria-hidden", "true");
    hall.setOpen(null);
    detail.replaceChildren();
    if (name) el.querySelector(`.lb-book[data-workflow="${CSS.escape(name)}"]`)?.focus({ preventScroll: true });
  }
  /**
   * An app that is open is the tool that is open, and what it is given is what the tools share: the picture, clip or sound already given
   * to another tool is here (and what is dropped here is there), and the words are its own. So Truffle and the panel work on one thing.
   */
  function openAsTool(d) {
    const tool = `app-${d.app.id}`;
    st.toolSeen = tool;
    if (utensils.tool !== tool) utensils.tool = tool;
    const i = inputOf(tool);
    const kinds = new Set();
    let wordsDone = false;
    for (const s of d.schema.slots.filter((x) => x.primary)) {
      if (["image", "video", "audio"].includes(s.kind) && !kinds.has(s.kind)) {
        kinds.add(s.kind);
        if (i[s.kind]) st.values[s.id] = i[s.kind];
      } else if (s.kind === "text" && !wordsDone) {
        wordsDone = true;
        // the words are the person's own: the template's sample is only shown as an example
        st.values[s.id] = i.prompt ?? "";
      }
    }
  }
  /** What a slot of an app writes back to the shared inputs: its picture, clip or sound (the first of its kind), and the main words. */
  function shareOut(s, value) {
    const d = st.detail;
    if (!d?.app) return;
    const tool = `app-${d.app.id}`;
    const primary = d.schema.slots.filter((x) => x.primary);
    if (["image", "video", "audio"].includes(s.kind)) {
      if (primary.find((x) => x.kind === s.kind)?.id === s.id) setInput({ [s.kind]: value }, tool);
    } else if (s.kind === "text" && primary.find((x) => x.kind === "text")?.id === s.id) setQuietly({ prompt: value }, tool);
  }

  async function refreshPrice(name) {
    try {
      const est = await estimateTemplate(name);
      if (st.picked === name) ((st.est = est), drawRun());
    } catch {
      if (st.picked === name) ((st.est = { credits: null, perUnit: null, note: "The price is not known before the run." }), drawRun());
    }
  }

  const slotById = (id) => st.detail?.schema.slots.find((s) => s.id === id);
  // an app is run with its own words: the template's sample words would make a different thing than was asked
  const wordsOf = () => (st.detail?.app ? st.detail.schema.slots.find((s) => s.primary && s.kind === "text") : null);
  const ready = () => !!st.detail && st.detail.schema.slots.every((s) => !s.required || st.values[s.id]) && (!wordsOf() || !!String(st.values[wordsOf().id] ?? "").trim());
  const lacking = () => st.detail?.schema.slots.find((s) => s.required && !st.values[s.id]) ?? (wordsOf() && !String(st.values[wordsOf().id] ?? "").trim() ? { label: "Words", kind: "words" } : null);
  const tool = (kind) => (kind === "image" ? "a picture" : kind === "video" ? "a clip" : kind === "words" ? "a few words" : "a sound");

  // a picture, clip or sound slot: a well that opens the picker or takes a drop
  function mediaField(s, big = false) {
    const v = st.values[s.id];
    const well = h(`div.ut-tpl-well${big ? ".is-big" : ""}`, { tabindex: "0", role: "button", title: v ? "Replace it" : `Add ${tool(s.kind)}`, dataset: { slot: s.id } });
    const set = (item) => ((st.values[s.id] = item), shareOut(s, item), drawRun(), fieldChanged(s.id));
    const pick = async () => { try { const item = await pickForSlot(s.kind, well); item && set(item); } catch (e) { toast(e.message, { tone: "crit" }); } };
    const body = !v ? [icon(s.kind === "audio" ? "sound" : s.kind === "video" ? "video" : "upload"), h("span", {}, s.kind === "image" ? "Drop a picture or click" : s.kind === "video" ? "Drop a clip or click" : "Drop a sound or click")]
      : [s.kind === "image" ? h("img", { src: v.url, alt: "", draggable: false }) : s.kind === "video" ? h("video", { src: v.url, muted: true, preload: "metadata", playsInline: true }) : h("span.ut-tpl-chipwave", {}, icon("sound")),
        h("span.ut-tpl-welltext", {}, h("b", {}, s.kind === "image" ? `${v.width} × ${v.height}` : s.kind === "video" ? `${Math.round(v.duration ?? 0)} s clip` : v.name ?? "A sound"), h("em", {}, "click to replace"))];
    well.append(...body);
    if (v) well.append(h("button.ut-iconkey.is-quiet.ut-tpl-x", { type: "button", title: "Take it out", "aria-label": "Take it out", on: { click: (e) => (e.stopPropagation(), set(null)) } }, icon("close")));
    well.addEventListener("click", (e) => !e.target.closest("button") && pick());
    well.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), pick()));
    well.addEventListener("dragover", (e) => (e.preventDefault(), well.classList.add("is-over")));
    well.addEventListener("dragleave", () => well.classList.remove("is-over"));
    well.addEventListener("drop", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      well.classList.remove("is-over");
      const f = [...(e.dataTransfer?.files ?? [])].find((x) => x.type.startsWith(`${s.kind}/`) || (s.kind === "audio" && x.type.startsWith("video/")));
      if (!f) return toast(`This one takes ${tool(s.kind)}.`);
      try { set(await uploadForSlot(s.kind, f)); } catch (err) { toast(err.message, { tone: "crit" }); }
    });
    return h("div.ut-tpl-field.is-media", {}, h("span.ut-label", {}, s.label, s.required ? null : h("em", {}, " · optional")), well);
  }
  /** What changed in a field that is drawn again with it (a media well changes the form's ready state only). */
  function fieldChanged(id) {
    const s = slotById(id);
    if (s && ["image", "video", "audio"].includes(s.kind)) drawDetail(true);
  }

  function field(s) {
    if (["image", "video", "audio"].includes(s.kind)) return mediaField(s, !!st.detail?.app);
    const label = (extra) => h("span.ut-label", {}, s.label, extra);
    if (s.kind === "text") {
      const max = s.id === "lyrics" ? 4000 : 1200;
      const counter = h("em.ut-tpl-count", {}, `${String(st.values[s.id] ?? "").length}/${max}`);
      const app = !!st.detail?.app && s.primary;
      // an app's words are its own: the template's sample is only what it looks like ("e.g.")
      const sample = String(s.default ?? "").replace(/\s+/g, " ").trim();
      const area = h("textarea.ut-words.ut-tpl-words", { rows: app ? 3 : s.id === "lyrics" ? 6 : 3, maxlength: max, value: app && st.values[s.id] === s.default ? "" : st.values[s.id] ?? "", placeholder: app ? (sample ? `e.g. ${sample.slice(0, 140)}` : "Say it in a few words") : "The template's own words run if this is left empty", "aria-label": s.label, dataset: { slot: s.id },
        on: { input: (e) => { st.values[s.id] = e.target.value; shareOut(s, e.target.value); counter.textContent = `${e.target.value.length}/${max}`; if (st.detail?.app) drawRun(); } } });
      return h("div.ut-tpl-field", {}, label(counter), area);
    }
    if (s.kind === "seed") {
      const input = h("input.ut-words.ut-tpl-num", { type: "number", min: 0, max: 4294967295, step: 1, value: String(st.values[s.id] ?? 0), "aria-label": "Seed", dataset: { slot: s.id }, on: { input: (e) => (st.values[s.id] = Number(e.target.value)) } });
      return h("div.ut-tpl-field", {}, label(), h("div.ut-tpl-seed", {}, input, h("button.ut-iconkey", { type: "button", title: "A new seed", "aria-label": "A new seed", on: { click: () => ((st.values[s.id] = randomSeed()), (input.value = String(st.values[s.id]))) } }, icon("dice"))));
    }
    if (s.kind === "number") {
      const out = h("em.ut-tpl-count", {}, String(st.values[s.id] ?? ""));
      const has = s.min !== undefined && s.max !== undefined;
      const input = has
        ? h("input.ut-tpl-range", { type: "range", min: s.min, max: s.max, step: s.step ?? 1, value: String(st.values[s.id] ?? s.min), "aria-label": s.label, dataset: { slot: s.id }, on: { input: (e) => ((st.values[s.id] = Number(e.target.value)), (out.textContent = e.target.value)) } })
        : h("input.ut-words.ut-tpl-num", { type: "number", value: String(st.values[s.id] ?? ""), "aria-label": s.label, dataset: { slot: s.id }, on: { input: (e) => ((st.values[s.id] = e.target.value === "" ? null : Number(e.target.value)), (out.textContent = e.target.value)) } });
      return h("div.ut-tpl-field", {}, label(out), input);
    }
    if (s.kind === "boolean") {
      return h("div.ut-tpl-field.is-row", {}, label(), h("div.ut-segs", { role: "group" }, ...[[false, "Off"], [true, "On"]].map(([v, t]) => h("button.ut-seg", { type: "button", "aria-pressed": String(!!st.values[s.id] === v), on: { click: (e) => { st.values[s.id] = v; e.currentTarget.parentElement.querySelectorAll("button").forEach((b, i) => b.setAttribute("aria-pressed", String(i === (v ? 1 : 0)))); } } }, t))));
    }
    if (s.kind === "combo" && s.options?.length) {
      return h("div.ut-tpl-field", {}, label(), h("div.ut-segs", { role: "group" }, ...s.options.map((o) => h("button.ut-seg", { type: "button", "aria-pressed": String(st.values[s.id] === o), on: { click: (e) => { st.values[s.id] = o; e.currentTarget.parentElement.querySelectorAll("button").forEach((b, i) => b.setAttribute("aria-pressed", String(s.options[i] === o))); } } }, o))));
    }
    return null;
  }

  function preview(d) {
    if (d.thumbKind === "audio") return h("div.ut-tpl-stage.is-audio", {}, waveform(d.thumb));
    const frame = h("div.ut-tpl-stage", {}, d.variant ? compare({ url: d.thumb }, { url: `${d.thumb}?n=2` }) : h("img", { src: d.thumb, alt: "", draggable: false }));
    frame.querySelectorAll("img").forEach((img) => img.addEventListener("error", () => img.remove(), { once: true }));
    return frame;
  }

  function madeBlock() {
    const list = (st.made[st.picked] ?? []).slice(0, 6);
    if (!list.length) return null;
    return h("div.ut-tpl-made", {}, h("span.ut-label", {}, "Made"),
      h("div.ut-tpl-results", {}, ...list.map((r) => h("div.ut-tpl-result", {},
        r.kind === "image" ? h("button.ut-tpl-rpic", { type: "button", title: "Show it", on: { click: () => openResult(r) } }, h("img", { src: r.url, alt: "", draggable: false }))
          : r.kind === "video" ? h("video.ut-tpl-rpic", { src: r.url, controls: true, loop: true, playsInline: true, preload: "metadata" })
          : r.kind === "audio" ? h("div.ut-tpl-raudio", {}, waveform(r.url))
          : h("span.ut-tpl-rpic.is-file", {}, "3D"),
        h("div.ut-tpl-rkeys", {},
          h("a.ut-iconkey", { href: r.url, download: r.file, title: "Download", "aria-label": "Download" }, icon("download")),
          h("button.ut-iconkey.is-quiet", { type: "button", title: "Take it off the list\nThe file stays in the Library", "aria-label": "Take it off the list", on: { click: () => (forget(r.id), (st.made[st.picked] = (st.made[st.picked] ?? []).filter((x) => x.id !== r.id)), drawDetail(true)) } }, icon("trash")))))));
  }

  const labelOf = (d) => (d?.title ?? st.picked).toUpperCase();
  // a mini app's panel is wider (its picture is the show)
  const syncMode = () => el.classList.toggle("is-apps", !!st.detail?.app);
  function drawDetail(keepScroll) {
    syncMode();
    const scroll = detail.querySelector(".ut-tpl-dscroll");
    const at = keepScroll && scroll ? scroll.scrollTop : 0;
    const focus = detail.contains(document.activeElement) ? document.activeElement.dataset?.slot : null;
    if (!st.picked) return void detail.replaceChildren();
    const d = st.detail;
    const head = h("div.ut-b-head", {}, h("span.ut-b-label", {}, labelOf(d)),
      h("button.ut-expand", { type: "button", title: "Close: back to the hall", "aria-label": "Close", on: { click: () => close() } }, icon("close")));
    if (st.loadingDetail) {
      detail.replaceChildren(head, h("div.ut-empty.is-wait", {}, h("span.lamp", { dataset: { tone: "busy" } }), h("span", {}, "Asking Comfy Cloud what it needs…")));
      return;
    }
    if (!d) {
      detail.replaceChildren(head, h("div.ut-empty", {}, icon("sparkle"), h("span", {}, st.detailError || "That workflow did not load.")));
      return;
    }
    if (d.app) return drawApp(head, d, keepScroll, at, focus);
    const main = d.schema.slots.filter((s) => !s.advanced);
    const adv = d.schema.slots.filter((s) => s.advanced);
    const err = lastError(st.picked);
    const body = h("div.ut-tpl-dscroll", { dataset: { scrollKey: "ut-tpl-detail" } },
      preview(d),
      h("p.ut-tpl-desc", {}, d.description),
      h("div.ut-chips", {}, ...(d.models ?? []).slice(0, 3).map((m) => h("span.ut-pill.is-model", {}, m)), d.creator ? h("span.ut-readout", { title: "Made by" }, `by ${d.creator}`) : null),
      main.length ? h("div.ut-tpl-form", {}, h("span.ut-label.is-head", {}, "Inputs"), ...main.map(field).filter(Boolean)) : h("p.ut-hint", {}, d.schema.notes[0] ?? "This template runs as it is."),
      adv.length ? h("details.ut-tpl-adv", { open: st.adv, on: { toggle: (e) => (st.adv = e.currentTarget.open) } }, h("summary", {}, icon("chevron"), "Advanced"), h("div.ut-tpl-form", {}, ...adv.map(field).filter(Boolean))) : null,
      d.schema.models?.length ? h("p.ut-hint.ut-tpl-models", { title: d.schema.models.join("\n") }, `Uses ${d.schema.models.length} model files on Comfy Cloud`) : null,
      err ? h("p.ut-tpl-error", { role: "alert" }, /missing a model/.test(err) ? icon("download") : icon("close"), h("span", {}, err)) : null,
      madeBlock());
    const run = h("div.ut-tpl-run");
    detail.replaceChildren(head, body, run);
    if (keepScroll) body.scrollTop = at;
    drawRun();
    if (focus) detail.querySelector(`[data-slot="${CSS.escape(focus)}"]`)?.focus({ preventScroll: true });
  }

  // ------------------------------------------------------------ an app picked: the mini app
  /** What an app made, big: a picture against the one it was given, a clip, a sound, or a 3D file to turn. */
  function resultStage(r) {
    const stage = h("div.ut-tpl-stage.ut-app-stage", { dataset: { result: r.id } });
    if (r.kind === "image") stage.append(r.from ? compare({ url: r.from }, r) : h("img", { src: r.url, alt: "", draggable: false }));
    else if (r.kind === "video") stage.append(h("video", { src: r.url, controls: true, loop: true, playsInline: true, preload: "metadata" }));
    else if (r.kind === "audio") (stage.classList.add("is-audio"), stage.append(waveform(r.url)));
    else stage.append(modelViewer(r.url, r.file));
    return stage;
  }
  /** What can be done with what was made: it is kept (Recent has it), handed on to a tool, downloaded, put away, or the example is shown again. */
  function resultKeys(r, name) {
    const takers = takersOf(r).slice(0, 3);
    return h("div.ut-app-keys", {},
      h("span.ut-pill.is-kept", { title: "It is kept: Recent shows it, with everything the tools make" }, icon("check"), "Kept"),
      h("span.spacer"),
      takers.length ? h("span.ut-label", {}, "Use in") : null,
      ...takers.map((t) => h("button.ut-iconkey", { type: "button", title: `Use it in ${t.name}`, "aria-label": `Use it in ${t.name}`, on: { click: () => handOn(r, t.id) } }, sprite(t.icon))),
      h("a.ut-iconkey", { href: r.url, download: r.file, title: "Download", "aria-label": "Download" }, icon("download")),
      h("button.ut-iconkey.is-quiet", { type: "button", title: "Show the example again", "aria-label": "Show the example again", on: { click: () => ((st.show[name] = { mode: "example" }), drawDetail(true)) } }, icon("image")),
      h("button.ut-iconkey.is-quiet", { type: "button", title: "Take it off the list\nThe file stays in the Library", "aria-label": "Take it off the list", on: { click: () => (forget(r.id), (st.made[name] = (st.made[name] ?? []).filter((x) => x.id !== r.id)), delete st.show[name], drawDetail(true)) } }, icon("trash")));
  }
  function madeStrip(list, current, name) {
    return h("div.ut-app-strip", {}, ...list.map((r) => h(`button.ut-app-mini${r === current ? ".is-on" : ""}`, { type: "button", title: "Show it", "aria-label": "Show it", on: { click: () => ((st.show[name] = { mode: "result", id: r.id }), drawDetail(true)) } },
      r.kind === "image" ? h("img", { src: r.url, alt: "", draggable: false }) : r.kind === "video" ? h("video", { src: r.url, muted: true, preload: "metadata", playsInline: true }) : h("span.ut-app-mini-i", {}, r.kind === "audio" ? icon("sound") : sprite("tool-templates")))));
  }
  function drawApp(head, d, keepScroll, at, focus) {
    const a = d.app;
    const name = st.picked;
    const prim = d.schema.slots.filter((s) => s.primary);
    const more = d.schema.slots.filter((s) => !s.primary);
    const list = (st.made[name] ?? []).slice(0, 6);
    const view = st.show[name];
    const shown = view?.mode === "example" ? null : list.find((r) => r.id === view?.id) ?? list[0] ?? null;
    head.querySelector(".ut-b-label").textContent = `APP · ${a.title.toUpperCase()}`;
    const err = lastError(name);
    const body = h("div.ut-tpl-dscroll.ut-app-body", { dataset: { scrollKey: "ut-app-detail" } },
      shown ? resultStage(shown) : preview(d),
      shown ? resultKeys(shown, name) : null,
      list.length > 1 ? madeStrip(list, shown, name) : null,
      h("p.ut-app-promise", {}, a.promise),
      prim.length ? h("div.ut-tpl-form.ut-app-form", {}, ...prim.map(field).filter(Boolean)) : h("p.ut-hint", {}, "This one needs nothing from you: just run it."),
      more.length ? h("details.ut-tpl-adv", { open: st.adv, on: { toggle: (e) => (st.adv = e.currentTarget.open) } }, h("summary", {}, icon("chevron"), "More settings"), h("div.ut-tpl-form", {}, ...more.map(field).filter(Boolean))) : null,
      d.schema.models?.length ? h("p.ut-hint.ut-tpl-models", { title: d.schema.models.join("\n") }, `Uses ${d.schema.models.length} model files on Comfy Cloud`) : null,
      err ? h("p.ut-tpl-error", { role: "alert" }, /missing a model/.test(err) ? icon("download") : icon("close"), h("span", {}, err)) : null);
    const run = h("div.ut-tpl-run");
    detail.replaceChildren(head, body, run);
    if (keepScroll) body.scrollTop = at;
    drawRun();
    if (focus) detail.querySelector(`[data-slot="${CSS.escape(focus)}"]`)?.focus({ preventScroll: true });
  }

  function priceText() {
    if (!st.est) return "reading the price…";
    if (st.est.credits === null) return "price unknown";
    if (st.est.credits === 0) return "GPU time only";
    return priceLabel(st.est);
  }
  function drawRun() {
    const run = detail.querySelector(".ut-tpl-run");
    if (!run || !st.detail) return;
    const busy = st.running.has(st.picked);
    const ok = ready() && !busy;
    const why = busy ? "It is running: see the queue" : lacking() ? `${lacking().label} needs ${tool(lacking().kind)} first` : "";
    run.replaceChildren(...[
      h("div.ut-tpl-cost-row", {},
        h("span.ut-label", {}, "Est. cost"),
        h("b.ut-tpl-price", { title: st.est?.note ?? "" }, priceText())),
      why && !busy ? h("p.ut-tpl-why", {}, why) : null,
      h("div.ut-tpl-keys", {},
        h("button.ut-iconkey", { type: "button", title: "View graph: the nodes and models inside", "aria-label": "View graph", on: { click: () => toggleGraph() } }, icon("flow")),
        h(`button.ut-primary.ut-tpl-go${st.armed ? ".is-armed" : ""}`, { type: "button", disabled: !ok, title: why || (st.armed ? `Click again to send it: ${priceText()}` : "Run it on Comfy Cloud"), on: { click: () => go() } },
          icon("play"),
          busy ? "Running…" : st.armed ? "Confirm" : st.detail?.app ? "Run it" : "Run on Comfy Cloud",
          st.armed && !busy && st.est && st.est.credits !== null ? h("em.ut-cost", {}, st.est.credits ? `≈ ${st.est.credits} cr` : "GPU time") : null)),
      st.graphOpen ? graphLayer() : null].filter(Boolean));
  }

  async function toggleGraph() {
    st.graphOpen = !st.graphOpen;
    drawRun();
    if (st.graphOpen && !st.graph) {
      const name = st.picked;
      try { st.graph = await graphOf(name); } catch (e) { st.graph = { error: e.message }; }
      if (st.picked === name) drawRun();
    }
  }
  function graphLayer() {
    const g = st.graph;
    return h("div.ut-tpl-graph", { role: "dialog", "aria-label": "Inside the template" },
      h("div.ut-b-head", {}, h("span.ut-b-label", {}, "Inside"), h("button.ut-expand", { type: "button", title: "Close", "aria-label": "Close", on: { click: () => ((st.graphOpen = false), drawRun()) } }, icon("close"))),
      !g ? h("p.ut-hint", {}, "Reading the workflow…")
        : g.error ? h("p.ut-hint", {}, g.error)
        : h("div.ut-tpl-graphbody", {},
          h("span.ut-label", {}, `${g.nodes.reduce((n, x) => n + x.count, 0)} nodes${g.subgraphs ? ` · ${g.subgraphs} grouped` : ""}`),
          h("div.ut-chips", {}, ...g.nodes.slice(0, 40).map((n) => h("span.ut-pill", {}, n.count > 1 ? `${n.type} ×${n.count}` : n.type))),
          g.models.length ? [h("span.ut-label", {}, "Models"), h("ul.ut-tpl-modelist", {}, ...g.models.map((m) => h("li", {}, m)))] : null));
  }

  /** The first press asks, the second sends: the price is the person's to agree to. */
  function go() {
    if (!ready() || st.running.has(st.picked)) return;
    if (!st.armed) {
      st.armed = true;
      drawRun();
      clearTimeout(armTimer);
      armTimer = setTimeout(() => ((st.armed = false), drawRun()), 6000);
      return;
    }
    clearTimeout(armTimer);
    st.armed = false;
    send();
  }
  async function send() {
    const name = st.picked;
    const d = st.detail;
    const inputs = {};
    for (const s of d.schema.slots) {
      const v = st.values[s.id];
      if (["image", "video", "audio"].includes(s.kind)) v && (inputs[s.id] = { file: v.file });
      else inputs[s.id] = v;
    }
    st.running.add(name);
    drawRun();
    try {
      // an app's results are its own tool's (Recent shows them under its name) and keep the picture it was given, to show against it
      const app = d.app ? appByName(name) ?? { medium: d.medium ?? "image" } : null;
      const tool = d.app ? `app-${d.app.id}` : "template";
      const first = d.schema.slots.find((x) => x.primary && x.kind === "image");
      const from = d.app && first ? st.values[first.id]?.url ?? null : null;
      const credits = d.app ? (st.est?.credits > 0 ? st.est.credits : appCost(app)) : st.est?.credits ?? null;
      const made = await runTemplate(name, inputs, { tool, label: d.app?.title ?? d.title, credits, confirmed: true, from });
      if (made.length) {
        st.made[name] = [...made, ...(st.made[name] ?? [])].slice(0, 12);
        delete st.show[name];
      }
      // the next run is a new draw, unless the seed was chosen on purpose
      for (const s of d.schema.slots) if (s.kind === "seed") st.values[s.id] = randomSeed();
    } finally {
      st.running.delete(name);
      if (st.picked === name) drawDetail(true);
    }
  }

  // the Shelf's volumes, Home's apps and Truffle open a workflow here, or the mini apps, or the whole hall
  document.addEventListener("utensils:template", (e) => {
    if (e.detail?.id) select(e.detail.id);
  });
  const showApps = () => hall.filterApps(true);
  document.addEventListener("utensils:apps", showApps);
  document.addEventListener("utensils:library", () => hall.filterApps(false));
  document.addEventListener("utensils:app", (e) => {
    if (!e.detail?.name) return;
    showApps();
    select(e.detail.name);
  });
  // Escape anywhere in the Library closes the panel (a field keeps its own Escape)
  // (what Escape closed, it does not close more: the Library's frame closes on an Escape nothing else took)
  el.addEventListener("keydown", (e) => e.key === "Escape" && st.picked && !e.target.closest("input, textarea, .lb-book, .lb-card") && (e.stopPropagation(), close()));

  return {
    el,
    // the Library's tile counts the whole catalogue (null until it has come: the Shelf's count stands in)
    count: () => hall.count(),
    update() {
      hall.update();
      // Truffle (or a key elsewhere) opened an app as the tool that is open
      const t = utensils.tool;
      if (utensils.library && t.startsWith("app-") && t !== st.toolSeen) {
        const a = apps.list.find((x) => toolIdOfApp(x) === t);
        st.toolSeen = t;
        if (a) select(a.name);
      }
    },
    sig: () => JSON.stringify([hall.sig(), utensils.library, utensils.tool, apps.list.length]),
    /** A workflow as the Library has it (its colour, its maker), for the frame's reading table. */
    itemOf: (name) => hall.itemOf(name),
    /** The Library's search field. */
    search: hall.search,
  };
}
