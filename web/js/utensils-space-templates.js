// The Utensils "templates" workspace: the official ComfyUI workflow templates, run on Comfy Cloud. On the left a browser (a search,
// the groups, a grid of cards with their pictures that load as they are scrolled to); on the right the one picked: its picture,
// what it asks for as a plain form, what it uses and what it costs, and a yellow key that asks to confirm the price before anything
// is sent. What it makes goes to the queue and Recent like every tool's, and shows under the form. The API is in
// utensils-templates-api.js (and server/comfy-templates.ts); a workspace is { el, update, sig, count }.
import { h, icon } from "./dom.js";
import { toast, changed } from "./store.js";
import { utensils, openResult, forget } from "./utensils.js";
import { compare, waveform } from "./utensils-bench.js";
import { listTemplates, getTemplate, estimateTemplate, runTemplate, graphOf, pickForSlot, uploadForSlot, priceLabel, lastError } from "./utensils-templates-api.js";

const PAGE = 36;
const GROUPS = [["all", "All"], ["image", "Image"], ["video", "Video"], ["audio", "Audio"], ["3d", "3D"], ["utility", "Utility"], ["partner", "Partner"]];
const KIND_ICON = { image: "image", video: "video", audio: "sound" };
const two = (n) => String(n).padStart(2, "0");
const bits = (name) => [...name].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
const randomSeed = () => Math.floor(Math.random() * 4294967295);

const st = {
  q: "", group: "all", items: [], total: 0, count: 0, categories: [], loading: false, done: false, failed: "",
  picked: null, detail: null, loadingDetail: false, detailError: "", values: {}, est: null, armed: false, adv: false,
  made: {}, graph: null, graphOpen: false, running: new Set(),
};
let loadToken = 0;
let armTimer = 0;

export function templatesSpace() {
  const el = h("div.ut-grid.is-templates");
  const search = h("input.ut-words.ut-tpl-search", { type: "search", placeholder: "Search templates, models, styles…", "aria-label": "Search the templates", autocomplete: "off", spellcheck: false });
  const chips = h("div.ut-tpl-chips", { role: "group", "aria-label": "Groups" });
  const grid = h("div.ut-tpl-grid", { dataset: { scrollKey: "ut-tpl-grid" } });
  const note = h("p.ut-tpl-note", { role: "status" });
  const sentinel = h("div.ut-tpl-sentinel");
  const detail = h("section.ut-bento.ut-tpl-detail", { "aria-label": "The template" });
  const browse = h("section.ut-bento.ut-tpl-browse", { "aria-label": "The templates" },
    h("div.ut-tpl-bar", {}, h("span.ut-tpl-searchbox", {}, icon("search"), search), chips, h("span.ut-tpl-cloud", { title: "Templates run on Comfy Cloud: your key, your credits" }, h("i.lamp", { dataset: { tone: "ok" } }), "Runs on Comfy Cloud")),
    h("div.ut-tpl-scroll", { dataset: { scrollKey: "ut-tpl-scroll" } }, grid, note, sentinel));
  el.append(browse, detail);
  let started = false;

  // ------------------------------------------------------------ the browser
  function drawChips() {
    const counts = Object.fromEntries(st.categories.map((c) => [c.id, c.count]));
    chips.replaceChildren(...GROUPS.map(([id, name]) => h("button.ut-tpl-chip", { type: "button", "aria-pressed": String(st.group === id), disabled: id !== "all" && counts[id] === 0, "aria-label": counts[id] !== undefined ? `${name}, ${counts[id]} templates` : name, on: { click: () => ((st.group = id), reload()) } }, name)));
  }

  function card(t, i) {
    const audio = t.thumbKind === "audio";
    const media = audio
      ? h("span.ut-tpl-audio", { style: { "--seed": String(bits(t.name) % 97) } }, ...Array.from({ length: 30 }, (_, k) => h("i", { style: { height: `${Math.round(18 + 62 * Math.abs(Math.sin((k + 1) * 0.55 + (bits(t.name) % 13)) * Math.cos(k * 0.21 + (bits(t.name) % 7))))}%` } })),
        h("button.ut-tpl-play", { type: "button", title: "Hear the example", "aria-label": "Hear the example", on: { click: (e) => (e.stopPropagation(), hear(e.currentTarget, t)) } }, icon("play")))
      : h("span.ut-tpl-pic", {}, h("img", { src: t.thumb, alt: "", draggable: false, loading: "lazy", decoding: "async" }));
    const el2 = h(`button.ut-tpl-card${st.picked === t.name ? ".is-on" : ""}`, { type: "button", dataset: { name: t.name }, "aria-pressed": String(st.picked === t.name), title: t.title, on: { click: () => select(t.name) } },
      h("span.ut-tpl-thumb", {},
        media,
        h("span.ut-tpl-no", {}, two(i + 1)),
        t.partner ? h("span.ut-tpl-partner", { title: "A partner service runs this one: your content goes to it and it bills credits" }, "Partner") : null),
      h("b.ut-tpl-title", {}, t.title),
      h("span.ut-tpl-line", {}, t.description),
      h("span.ut-tpl-meta", {},
        t.models[0] ? h("span.ut-pill.is-model", { title: t.models.join(", ") }, t.models[0]) : null,
        ...t.inputs.slice(0, 3).map((k) => h("span.ut-pill.is-kind", { title: k === "text" ? "Words" : `Takes ${k === "image" ? "a picture" : k === "video" ? "a clip" : "a sound"}` }, KIND_ICON[k] ? icon(KIND_ICON[k]) : "T")),
        h("span.spacer"),
        t.credits ? h("span.ut-tpl-cost", { title: "What the partner service bills for one run" }, `≈ ${t.credits} cr`) : null));
    // the picture that shows on hover (a before/after, a dissolve): asked for only when the card is pointed at
    if (t.variant && !audio) el2.addEventListener("pointerenter", () => {
      const pic = el2.querySelector(".ut-tpl-pic");
      if (pic && !pic.querySelector(".is-after")) pic.append(h("img.is-after", { src: `${t.thumb}?n=2`, alt: "", draggable: false, on: { error: (e) => e.target.remove() } }));
    }, { once: true });
    return el2;
  }
  let hearing = null;
  function hear(button, t) {
    if (hearing && hearing.t !== t) hearing.audio.pause();
    if (!hearing || hearing.t !== t) hearing = { t, audio: new Audio(t.thumb) };
    const { audio } = hearing;
    audio.onended = audio.onpause = () => button.replaceChildren(icon("play"));
    audio.onplay = () => button.replaceChildren(icon("pause"));
    audio.paused ? audio.play().catch(() => {}) : audio.pause();
  }

  async function load(first) {
    if (st.loading || st.done) return;
    st.loading = true;
    const token = loadToken;
    note.textContent = first ? "Loading the templates…" : "";
    try {
      const out = await listTemplates({ q: st.q, group: st.group === "all" ? "" : st.group, featured: !st.q && st.group === "all", limit: PAGE, offset: st.items.length });
      if (token !== loadToken) return;
      const at = st.items.length;
      st.items.push(...out.items);
      st.total = out.total;
      st.count = out.count;
      st.categories = out.categories;
      st.done = st.items.length >= out.count;
      grid.append(...out.items.map((t, k) => card(t, at + k)));
      note.textContent = !st.items.length ? (st.q ? `No template matches “${st.q}”.` : "No templates here yet.") : st.done ? `${st.count} ${st.count === 1 ? "template" : "templates"}` : "";
      drawChips();
      const pickedAt = st.items.findIndex((t) => t.name === st.picked);
      const label = detail.querySelector(".ut-b-head .ut-b-label");
      if (pickedAt >= 0 && label) label.textContent = labelOf(pickedAt, st.detail);
      // the panel's count of templates
      if (first) changed("utensils");
    } catch (e) {
      if (token !== loadToken) return;
      st.failed = e.message;
      note.textContent = e.message;
    } finally {
      if (token === loadToken) st.loading = false;
      watch();
    }
  }
  function reload() {
    loadToken++;
    st.items = [];
    st.done = false;
    st.loading = false;
    st.failed = "";
    grid.replaceChildren();
    drawChips();
    load(true);
  }
  // more cards as the end of the grid comes near
  const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && !st.failed && load(false), { root: null, rootMargin: "600px" });
  const watch = () => requestAnimationFrame(() => (io.unobserve(sentinel), io.observe(sentinel)));
  let typing = 0;
  search.addEventListener("input", () => {
    clearTimeout(typing);
    typing = setTimeout(() => {
      if (search.value.trim() === st.q) return;
      st.q = search.value.trim();
      reload();
    }, 260);
  });

  // ------------------------------------------------------------ the one picked
  async function select(name) {
    st.picked = name;
    st.detail = null;
    st.detailError = "";
    st.est = null;
    st.armed = false;
    st.graph = null;
    st.graphOpen = false;
    st.loadingDetail = true;
    for (const c of grid.children) c.classList.toggle("is-on", c.dataset.name === name);
    drawDetail();
    try {
      const d = await getTemplate(name);
      if (st.picked !== name) return;
      st.detail = d;
      st.values = {};
      for (const s of d.schema.slots) st.values[s.id] = s.kind === "seed" ? randomSeed() : s.kind === "boolean" ? s.default === true : s.default ?? (s.kind === "text" ? "" : null);
    } catch (e) {
      if (st.picked !== name) return;
      st.detailError = e.status === 501 ? "Connect Comfy Cloud (a COMFY_API_KEY in .env) to see what this template asks for and to run it." : e.message;
    } finally {
      if (st.picked === name) {
        st.loadingDetail = false;
        drawDetail();
        refreshPrice(name);
      }
    }
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
  const ready = () => !!st.detail && st.detail.schema.slots.every((s) => !s.required || st.values[s.id]);
  const lacking = () => st.detail?.schema.slots.find((s) => s.required && !st.values[s.id]);
  const tool = (kind) => (kind === "image" ? "a picture" : kind === "video" ? "a clip" : "a sound");

  // a picture, clip or sound slot: a well that opens the picker or takes a drop
  function mediaField(s) {
    const v = st.values[s.id];
    const well = h("div.ut-tpl-well", { tabindex: "0", role: "button", title: v ? "Replace it" : `Add ${tool(s.kind)}`, dataset: { slot: s.id } });
    const set = (item) => ((st.values[s.id] = item), drawRun(), fieldChanged(s.id));
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
    if (["image", "video", "audio"].includes(s.kind)) return mediaField(s);
    const label = (extra) => h("span.ut-label", {}, s.label, extra);
    if (s.kind === "text") {
      const max = s.id === "lyrics" ? 4000 : 1200;
      const counter = h("em.ut-tpl-count", {}, `${String(st.values[s.id] ?? "").length}/${max}`);
      const area = h("textarea.ut-words.ut-tpl-words", { rows: s.id === "lyrics" ? 6 : 3, maxlength: max, value: st.values[s.id] ?? "", placeholder: "The template's own words run if this is left empty", "aria-label": s.label, dataset: { slot: s.id },
        on: { input: (e) => { st.values[s.id] = e.target.value; counter.textContent = `${e.target.value.length}/${max}`; } } });
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

  const labelOf = (idx, d) => `${idx >= 0 ? `${two(idx + 1)} ` : ""}${(d?.title ?? st.items[idx]?.title ?? st.picked).toUpperCase()}`;
  function drawDetail(keepScroll) {
    const scroll = detail.querySelector(".ut-tpl-dscroll");
    const at = keepScroll && scroll ? scroll.scrollTop : 0;
    const focus = detail.contains(document.activeElement) ? document.activeElement.dataset?.slot : null;
    if (!st.picked) {
      detail.replaceChildren(h("div.ut-b-head", {}, h("span.ut-b-label", {}, "Template")), h("div.ut-empty", {}, icon("sparkle"), h("span", {}, "Pick a template to see what it asks for"), h("em.ut-hint", {}, "Official ComfyUI workflows, run on Comfy Cloud")));
      return;
    }
    const idx = st.items.findIndex((t) => t.name === st.picked);
    const d = st.detail;
    const head = h("div.ut-b-head", {}, h("span.ut-b-label", {}, labelOf(idx, d)),
      h("button.ut-expand", { type: "button", title: "Close", "aria-label": "Close", on: { click: () => ((st.picked = null), (st.detail = null), grid.querySelector(".is-on")?.classList.remove("is-on"), drawDetail()) } }, icon("close")));
    if (st.loadingDetail) {
      detail.replaceChildren(head, h("div.ut-empty.is-wait", {}, h("span.lamp", { dataset: { tone: "busy" } }), h("span", {}, "Asking Comfy Cloud what it needs…")));
      return;
    }
    if (!d) {
      detail.replaceChildren(head, h("div.ut-empty", {}, icon("sparkle"), h("span", {}, st.detailError || "That template did not load.")));
      return;
    }
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
          busy ? "Running…" : st.armed ? "Confirm" : "Run on Comfy Cloud",
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
      const made = await runTemplate(name, inputs, { tool: "template", label: d.title, credits: st.est?.credits ?? null, confirmed: true });
      if (made.length) (st.made[name] = [...made, ...(st.made[name] ?? [])].slice(0, 12));
      // the next run is a new draw, unless the seed was chosen on purpose
      for (const s of d.schema.slots) if (s.kind === "seed") st.values[s.id] = randomSeed();
    } finally {
      st.running.delete(name);
      if (st.picked === name) drawDetail(true);
    }
  }

  // the shelf's carousel opens a template here
  document.addEventListener("utensils:template", (e) => {
    if (e.detail?.id) select(e.detail.id);
  });
  drawDetail();
  drawChips();

  return {
    el,
    count: () => (st.total || null),
    update() {
      if (started) return;
      started = true;
      load(true);
    },
    sig: () => JSON.stringify([started, utensils.workspace === "templates"]),
  };
}
