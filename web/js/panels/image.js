import { h, icon, sprite } from "../dom.js";
import { currentPage } from "../router.js";
import { stageReady } from "../control/link.js";
import {
  state, onChange, toast, changed, imageChoice, setImage, setImagePrompt, closeImage, addImageRef, removeImageRef, uploadImageRefs, imageMentionables,
  enhanceImage, unenhanceImage, generateImages, placePhoto, addImageLora, removeImageLora, setLoraStrength, addStageMap, removeStageMap,
} from "../store.js";
import { view } from "../viewer.js";
import { modal } from "../modal.js";
import { imageFrom } from "../photo.js";
import { dropdown, toggle } from "../controls.js";
import { pillField } from "../pills.js";
import { attachMenu, MAP_TAG, MAP_OF_TAG } from "../attach.js";

const TEMPLATE_ICON = { generate: "text-to-image", edit: "image-edit", style: "image-reference" };
const RATIOS = { "1:1": 1, "4:3": 4 / 3, "3:4": 3 / 4, "3:2": 3 / 2, "2:3": 2 / 3, "16:9": 16 / 9, "9:16": 9 / 16, "21:9": 21 / 9 };
/** What each template lets a model do, as a tag on the model select. */
const CAPABILITY = { generate: "Generate", edit: "Edit", style: "Style" };
/** Where a picture can go: every image input of the open tab. */
const SEND = [
  ["start", "frame-first", "Start frame"],
  ["end", "frame-last", "End frame"],
  ["keyframe", "keyframe", "Keyframe"],
  ["cast", "image-reference", "Cast"],
  ["prop", "image-reference", "Prop"],
  ["location", "image-reference", "Place"],
];

// the composer is made once and kept, so what you type, the caret and the focus survive every redraw
let composer = null;
// a menu open over the window holds the redraw until it closes, so it never points at a stale key
let menuOpen = false;
let held = false;
let layer = null;
const release = () => {
  menuOpen = false;
  if (held) (held = false), renderImage(layer);
};

// a picture still coming moves only its number: the window stays as it is and the readouts are patched
onChange((scopes) => {
  if (!scopes.has("image-progress") || !layer) return;
  for (const r of state.image.results) {
    if (r.status === "done" || r.status === "failed") continue;
    const text = `${Math.round((r.progress ?? 0) * 100)}%`;
    for (const n of layer.querySelectorAll(`[data-job="${CSS.escape(r.id)}"] .img-pct`)) if (n.textContent !== text) n.textContent = text;
  }
});

/** Width × height the server will make, on the model's grid. */
function sizeOf(model, aspect, mp, first) {
  const ratio = aspect === "auto" && first ? first.width / first.height : RATIOS[aspect] ?? 1;
  const hgt = Math.sqrt((mp * 1024 * 1024) / ratio);
  const snap = (v) => Math.max(256, Math.round(v / model.multiple) * model.multiple);
  return { width: snap(hgt * ratio), height: snap(hgt) };
}

// ---------------------------------------------------------------- @ references

function mentionAt(input) {
  const before = input.value.slice(0, input.selectionStart);
  const m = before.match(/(?:^|\s)@([a-z0-9-]*)$/i);
  return m ? { query: m[1].toLowerCase(), from: before.length - m[1].length - 1 } : null;
}

function insertMention(input, item) {
  const at = mentionAt(input);
  if (!at) return;
  addImageRef(item);
  const name = state.image.refs.find((r) => r.file === item.file)?.name ?? item.name;
  const after = input.value.slice(input.selectionStart);
  input.value = `${input.value.slice(0, at.from)}@${name} ${after.replace(/^\S*/, "").replace(/^ /, "")}`;
  const caret = at.from + name.length + 2;
  input.setSelectionRange(caret, caret);
  input.focus();
  input.dispatchEvent(new Event("input"));
}

function updatePicker() {
  const c = composer;
  const at = mentionAt(c.input);
  const q = at?.query ?? "";
  // names that start with what's typed first, then pictures whose title has it
  const all = at ? imageMentionables() : [];
  const found = [...all.filter((f) => f.name.startsWith(q)), ...(q ? all.filter((f) => !f.name.startsWith(q) && f.title?.toLowerCase().includes(q)) : [])];
  const exact = found.length === 1 && found[0].name === q;
  const list = exact ? [] : found.slice(0, 60);
  c.pick = Math.min(c.pick, Math.max(0, list.length - 1));
  c.picker.hidden = !at || !list.length;
  c.picker.replaceChildren(h("div.pick-grid", {}, ...list.map((f, i) =>
    h("button.pick-file", {
      type: "button",
      className: i === c.pick ? "is-active" : "",
      title: `${f.title ?? f.name} — ${f.width} × ${f.height}`,
      on: { mousedown: (e) => (e.preventDefault(), insertMention(c.input, f)) },
    },
      h("span.pick-thumb", {}, h("img", { src: f.url, alt: "", draggable: false }), h("em", { className: `src is-${f.source}` }, f.source === "attached" ? "reference" : "library")),
      h("span.pick-name", {}, h("b", {}, `@${f.name}`), h("span", {}, `${f.width} × ${f.height}`))))));
  c.picker.querySelector(".pick-file.is-active")?.scrollIntoView({ block: "nearest" });
  c.list = list;
}

/** The references the prompt names get the accent outline. */
function markMentioned() {
  const named = new Set([...composer.input.value.matchAll(/@([a-z0-9][a-z0-9-]*)/gi)].map((m) => m[1].toLowerCase()));
  composer.tray.querySelectorAll(".file-chip").forEach((chip) => chip.classList.toggle("is-mentioned", named.has(chip.dataset.name)));
}

/**
 * What an @name in the window's prompt stands for, to draw its pill and its card: a reference, a
 * control map, or someone's sheet (from a Stage render: their words and pictures).
 */
function lookup(name) {
  const im = state.image;
  const ref = im.refs.find((r) => r.name === name);
  const of = im.cast.find((c) => c.tag === name || c.pictures?.includes(name));
  if (of) {
    const pictures = im.refs.filter((r) => of.pictures?.includes(r.name));
    return { title: of.name, color: of.color, url: (ref ?? pictures[0])?.url, pictures, words: of.words, note: pictures.length ? null : "No picture: its words go with the prompt." };
  }
  if (!ref) return null;
  const map = MAP_OF_TAG[name];
  return { title: map ? `@${name}` : ref.title ?? `@${name}`, url: ref.url, pictures: [ref], note: map ? "A control map of the Stage" : `${ref.width} × ${ref.height}` };
}

function makeComposer() {
  const input = pillField({ placeholder: "Describe the picture · @ for a reference", label: "Describe the picture", lookup, className: "chat-input img-input" });
  const fileInput = h("input", { type: "file", multiple: true, hidden: true, accept: "image/*" });
  // the field grows with its words, up to its CSS height
  const grow = () => {};
  input.addEventListener("input", () => (setImagePrompt(input.value), grow(), updatePicker(), markMentioned(), syncKeys()));
  input.addEventListener("click", updatePicker);
  // a redraw blurs it for a moment; the picker only goes when the focus really left
  input.addEventListener("blur", () => setTimeout(() => document.activeElement !== input.el && (composer.picker.hidden = true), 120));
  input.addEventListener("keydown", (e) => {
    const c = composer;
    if (!c.picker.hidden && c.list?.length) {
      const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 2, ArrowUp: -2 }[e.key];
      if (step && (e.key === "ArrowDown" || e.key === "ArrowUp" || !input.value.slice(input.selectionStart).length)) {
        e.preventDefault();
        c.pick = Math.min(c.list.length - 1, Math.max(0, c.pick + step));
        return updatePicker();
      }
      if (e.key === "Tab" || e.key === "Enter") {
        e.preventDefault();
        return insertMention(input, c.list[c.pick]);
      }
      if (e.key === "Escape") {
        e.stopPropagation();
        return (c.picker.hidden = true);
      }
    }
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      generateImages();
    }
  });
  input.addEventListener("paste", (e) => {
    const file = imageFrom(e.clipboardData);
    if (file) {
      e.preventDefault();
      uploadImageRefs([file]);
    }
  });
  fileInput.addEventListener("change", () => (uploadImageRefs([...fileInput.files]), (fileInput.value = "")));
  // the paperclip opens its two frames: pictures (from the computer, or the Library), and the Stage's control maps
  const clip = h("button.img-key", { type: "button", title: "Add a reference — a picture, or a control map of the Stage", "aria-label": "Add a reference", "aria-expanded": "false" }, sprite("paperclip"));
  clip.addEventListener("click", () => attachMenu(clip, {
    files: (files) => uploadImageRefs(files),
    picture: (photo) => addImageRef(photo),
    taken: (photo) => state.image.refs.some((r) => r.file === photo.file),
    map: (id, on) => (on ? addStageMap(id) : removeStageMap(id)),
    chosen: (id) => state.image.refs.some((r) => r.name === MAP_TAG[id]),
    camera: state.image.origin?.stageRun?.camera ?? null,
  }));
  const improve = h("button.img-key.improve-key", { type: "button", "aria-label": "Improve the prompt", on: { click: enhanceImage } }, sprite("prompt-enhance"));
  const undo = h("button.img-key", { type: "button", title: "Put my words back", "aria-label": "Put my words back", on: { click: unenhanceImage } }, icon("remix"));
  const cost = h("span.img-go-cost");
  const go = h("button.img-go", { type: "button", title: "Generate — Ctrl + Enter", on: { click: generateImages } }, sprite("image-generate"), h("span", {}, "Generate"), cost);
  const tray = h("div.file-tray");
  const picker = h("div.mention-picker.is-images", { hidden: true, role: "listbox", "aria-label": "Pictures" });
  const bar = h("div.img-bar", {}, tray, input.el, h("div.img-row", {}, clip, h("span.spacer"), undo, improve, go));
  const el = h("div.composer.img-composer", {}, picker, bar, fileInput);
  composer = { el, input, tray, picker, improve, undo, go, cost, pick: 0, list: [], grow };
  return composer;
}

/** The keys follow what's typed without a redraw. */
function syncKeys() {
  const im = state.image;
  const c = composer;
  const empty = !c.input.value.trim();
  const choice = imageChoice();
  // a prompt being rewritten isn't the one to render yet
  c.go.disabled = empty || !choice || im.enhancing;
  c.improve.disabled = empty || im.enhancing || !choice;
  c.improve.classList.toggle("is-busy", im.enhancing);
  c.undo.hidden = im.before === null;
  if (choice) {
    // what pressing it costs
    const price = costOf(choice.model, im.count);
    c.cost.textContent = price;
    c.go.title = `Generate — Ctrl + Enter · ${price}`;
    const official = choice.template.enhancer === "official";
    c.improve.dataset.tooltip = im.enhancing
      ? "Improving…"
      : `Improve — rewrites it with ${official ? `${choice.model.name}'s own prompt enhancer` : `Gemma 4, following ${choice.model.name}'s prompting guide`}`;
  }
}

function refChip(r, usable) {
  return h("div.file-chip", { className: usable ? "" : "is-unused", dataset: { name: r.name }, title: usable ? `${r.title ?? r.name} — ${r.width} × ${r.height}` : "Not used — this template makes a picture from words alone" },
    h("button.chip-thumb", { type: "button", "aria-label": `Look at @${r.name}`, on: { click: () => view(r.url) } }, h("img", { src: r.url, alt: "", draggable: false })),
    h("button.chip-name", { type: "button", "aria-label": `Mention @${r.name}`, on: { click: () => mentionRef(r.name) } }, `@${r.name}`),
    h("button.chip-x", { type: "button", "aria-label": `Remove @${r.name}`, title: "Remove", on: { click: () => removeImageRef(r.file) } }, icon("close")),
  );
}

function mentionRef(name) {
  const input = composer.input;
  if (new RegExp(`@${name}\\b`, "i").test(input.value)) return input.focus();
  const pad = input.value && !/\s$/.test(input.value) ? " " : "";
  input.value = `${input.value}${pad}@${name} `;
  input.focus();
  input.dispatchEvent(new Event("input"));
}

// ---------------------------------------------------------------- the rail

/** The LoRAs on the chosen model: each with its strength, and a menu of the ones it can still load. */
function loraGroup(im, choice) {
  const chosen = im.loras.flatMap((p) => {
    const l = choice.loras.find((x) => x.file === p.file);
    return l ? [{ ...l, strength: p.strength }] : [];
  });
  const rows = chosen.map((l) =>
    h("div.lora-row", { title: l.words ? `Adds “${l.words}” to the prompt` : l.about ?? "" },
      h("span.lora-text", {}, h("b", {}, l.name), h("span", {}, l.words || l.about || l.source)),
      h("div.lora-strength", { role: "group", "aria-label": `${l.name} strength` },
        h("button", { type: "button", "aria-label": "Weaker", disabled: l.strength <= 0, on: { click: () => setLoraStrength(l.file, l.strength - 0.1) } }, "−"),
        h("span", {}, l.strength.toFixed(1)),
        h("button", { type: "button", "aria-label": "Stronger", disabled: l.strength >= 2, on: { click: () => setLoraStrength(l.file, l.strength + 0.1) } }, "+")),
      h("button.chip-x", { type: "button", "aria-label": `Remove ${l.name}`, title: "Remove", on: { click: () => removeImageLora(l.file) } }, icon("close"))));
  const left = choice.loras.filter((l) => !im.loras.some((p) => p.file === l.file));
  let foot = null;
  if (choice.loras.length) {
    if (im.loras.length < 3 && left.length) foot = h("button.lora-add", { type: "button", title: "LoRAs from Comfy Cloud's library that this model can load", on: { click: (e) => loraMenu(e.currentTarget, left) } }, icon("plus"), "Add a LoRA");
  } else {
    const other = choice.model.loras.length ? im.catalogue.templates[choice.model.loras[0].templates?.[0]]?.name : null;
    foot = h("span.lora-none", {}, other ? `${choice.model.name}'s LoRAs work with ${other}` : `No ${choice.model.name} LoRAs on Comfy Cloud yet`);
  }
  return group("LoRA", ...rows, foot);
}

/** The LoRAs to add, as a menu under the key: each with the words that call it and where it comes from. */
function loraMenu(at, items) {
  document.querySelector(".lora-menu")?.remove();
  menuOpen = true;
  const close = () => {
    menu.remove();
    document.removeEventListener("pointerdown", outside, true);
    release();
  };
  const outside = (e) => !menu.contains(e.target) && !at.contains(e.target) && close();
  const menu = h("div.sel-menu.lora-menu", { role: "menu" }, items.map((l) =>
    h("button.sel-item", { type: "button", role: "menuitem", on: { click: () => (close(), addImageLora(l.file)) } },
      h("span.sel-text", {}, h("span.sel-label", {}, l.name), h("span.sel-desc", {}, l.words || l.about || "no trigger words")),
      h("span.cap-tag", { className: l.source === "community" ? "" : "is-official" }, l.source))));
  document.body.append(menu);
  const box = at.getBoundingClientRect();
  const width = Math.max(box.width, 360);
  Object.assign(menu.style, { left: `${box.left}px`, width: `${width}px` });
  if (innerHeight - box.bottom < Math.min(menu.offsetHeight, 384) + 12) menu.style.bottom = `${innerHeight - box.top + 6}px`;
  else menu.style.top = `${box.bottom + 6}px`;
  menu.querySelector("button")?.focus();
  menu.addEventListener("keydown", (e) => {
    const list = [...menu.querySelectorAll("button")];
    const i = list.indexOf(document.activeElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      list[(i + (e.key === "ArrowDown" ? 1 : -1) + list.length) % list.length].focus();
    } else if (e.key === "Escape") {
      e.stopPropagation();
      close();
      at.focus();
    }
  });
  setTimeout(() => document.addEventListener("pointerdown", outside, true));
}

// ---------------------------------------------------------------- what it costs

/** A router model costs credits a picture; the open-weights ones run on Comfy Cloud's GPU time. */
const perPicture = (model) => (model.router && typeof model.credits === "number" ? model.credits : null);
/** What pressing Generate costs, for the key. */
const costOf = (model, count) => (perPicture(model) === null ? "GPU time" : `≈ ${perPicture(model) * count} cr`);
/** One finished or running picture's cost: "6 cr", or "GPU · 21 s" once it took that long. */
function spentOf(r) {
  if (r.status === "failed") return "failed";
  if (typeof r.credits === "number") return `${r.credits} cr`;
  return r.seconds ? `GPU · ${r.seconds} s` : "GPU";
}

/** The pictures of this window and what they cost, with the total. */
function spentGroup(im) {
  const order = [...im.results].reverse();
  const mine = order.filter((r) => r.started);
  if (!mine.length) return null;
  const rows = mine.map((r) => h("div.spent-row", {}, h("span.spent-n", {}, String(order.indexOf(r) + 1)), h("span.spent-model", {}, r.model), h("span.spent-cost", {}, spentOf(r))));
  const paid = mine.filter((r) => r.status !== "failed");
  const credits = paid.reduce((n, r) => n + (typeof r.credits === "number" ? r.credits : 0), 0);
  const gpu = paid.filter((r) => typeof r.credits !== "number").length;
  const total = [credits ? `${credits} cr` : null, gpu ? `${gpu} on GPU time` : null].filter(Boolean).join(" + ") || "nothing";
  return group("Spent", ...rows, h("div.spent-row.is-total", {}, h("span.spent-model", {}, "Total"), h("span.spent-cost", {}, total)));
}

const group = (label, ...body) => h("div.img-group", {}, h("span.row-label", {}, label), ...body);

function rail(im, choice) {
  const c = im.catalogue;
  const models = dropdown({
    label: "Model",
    value: choice.model.id,
    items: c.models.map((m) => ({
      value: m.id,
      label: m.name,
      desc: m.about,
      extra: h("span.img-model-caps", {}, m.templates.map((t) => h("span.cap-tag", {}, CAPABILITY[t.id]))),
    })),
    onChange: (id) => setImage({ model: id }),
    onOpen: () => (menuOpen = true),
    onClose: release,
  });

  const templates = h("div.segment.img-templates", { role: "group", "aria-label": "Template" }, choice.model.templates.map((t) =>
    h("button", {
      type: "button",
      "aria-pressed": String(t.id === choice.template.id),
      title: `${c.templates[t.id]?.name} — ${c.templates[t.id]?.about}${t.refs ? ` · up to ${t.refs} reference${t.refs > 1 ? "s" : ""}` : ""}\nOfficial template: ${t.official}`,
      "aria-label": c.templates[t.id]?.name,
      on: { click: () => setImage({ template: t.id }) },
    }, sprite(TEMPLATE_ICON[t.id]))));

  const first = im.refs[0];
  const aspects = [...(first && choice.takesRefs ? ["auto"] : []), ...c.aspects];
  if (im.aspect === "auto" && !aspects.includes("auto")) im.aspect = "16:9";
  const frames = h("div.img-frames", { role: "group", "aria-label": "Frame" }, aspects.map((a) => {
    return h("button.img-frame", {
      type: "button",
      className: a === "auto" ? "is-auto" : "",
      "aria-pressed": String(im.aspect === a),
      title: a === "auto" ? `Like @${first.name}` : a,
      "aria-label": a === "auto" ? "Like the first reference" : a,
      on: { click: () => setImage({ aspect: a }) },
    }, sprite(a === "auto" ? "ratio-original" : `ratio-${a.replace(":", "-")}`), h("span.frame-label", {}, a === "auto" ? `like @${first.name}` : a));
  }));

  const size = sizeOf(choice.model, im.aspect, im.megapixels, first);
  const sizes = h("div.segment", { role: "group", "aria-label": "Size" }, choice.model.megapixels.map((mp) =>
    h("button", { type: "button", "aria-pressed": String(mp === im.megapixels), title: `${mp} megapixel${mp > 1 ? "s" : ""}`, on: { click: () => setImage({ megapixels: mp }) } }, `${mp} MP`)));

  const counts = h("div.segment", { role: "group", "aria-label": "Pictures" }, [1, 2, 3, 4].map((n) =>
    h("button", { type: "button", "aria-pressed": String(n === im.count), title: `${n} picture${n > 1 ? "s" : ""}, each with its own seed`, on: { click: () => setImage({ count: n }) } }, String(n))));

  const seed = h("div.seed-row", {},
    h("input.field.is-line", {
      type: "number", min: 0, step: 1, value: im.seed, disabled: !im.lockSeed, "aria-label": "Seed",
      on: { change: (e) => setImage({ seed: Math.max(0, Math.floor(Number(e.target.value) || 0)) }) },
    }),
    h("button.key.is-icon", {
      type: "button", "aria-pressed": String(im.lockSeed), "aria-label": im.lockSeed ? "Seed locked" : "Seed random",
      title: im.lockSeed ? "Pictures use this seed, then +1, +2…" : "Every picture gets a random seed",
      on: { click: () => setImage({ lockSeed: !im.lockSeed }) },
    }, icon(im.lockSeed ? "lock" : "unlock")),
    h("button.key.is-icon", { type: "button", "aria-label": "New seed", title: "New seed", on: { click: () => setImage({ seed: Math.floor(Math.random() * 2 ** 32), lockSeed: true }) } }, icon("dice")),
  );

  // an edit can start from its first picture rather than from noise: its layout then stays put (a Stage render's does)
  const keepSwitch = h("button", { type: "button" });
  toggle(keepSwitch, { value: !!im.keep, label: "Keep the first picture's layout", onChange: (v) => setImage({ keep: v }) });
  const layout = choice.template.id === "edit" && first
    ? h("label.switch-row", { title: `Start from @${first.name} itself, so what it shows stays where it is (a Stage render lies over its stage)` }, keepSwitch, `Keep @${first.name}'s layout`)
    : null;

  counts.classList.add("img-counts");
  // what will run, in one quiet line at the foot of the column
  const t = choice.template;
  const summary = h("div.img-summary", {},
    h("span", {}, `${t.steps} steps`),
    ...(im.loras.length ? [h("span", {}, `${im.loras.length} LoRA${im.loras.length > 1 ? "s" : ""}`)] : []),
    h("span", {}, `${im.count} picture${im.count > 1 ? "s" : ""}`),
    h("span", { title: t.enhancer === "official" ? "Improve uses the template's own prompt enhancer" : "Improve uses Gemma 4 with the model's prompting guide" }, t.enhancer === "official" ? "official enhancer" : "guide enhancer"));
  return h("aside.img-rail", {},
    group("Model", models, h("span.img-readout.img-price", {}, perPicture(choice.model) === null ? "Comfy Cloud GPU time" : `≈ ${perPicture(choice.model)} cr a picture`)),
    loraGroup(im, choice),
    group("Template", templates),
    ...(layout ? [group("Layout", layout)] : []),
    group("Frame", frames),
    group("Size", sizes, h("span.img-readout", {}, `${size.width} × ${size.height}`)),
    group("Pictures", counts),
    group("Seed", seed),
    spentGroup(im),
    summary,
  );
}

// ---------------------------------------------------------------- the stage

/** A notch shoulder: the curve from the canvas edge down to the notch, filled with the window's surface. */
function shoulder(right = false) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", `notch-shoulder${right ? " is-right" : ""}`);
  svg.setAttribute("viewBox", "0 0 38 32");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("aria-hidden", "true");
  // the kit's curve, run edge to edge: no outline to centre, so it meets the body exactly at the bottom
  svg.innerHTML = '<path d="M 0 0 C 18 0 14 32 38 32 V -4 H 0 Z"/>';
  return svg;
}

// where the compare slider stands, kept across redraws (0 = all the right picture, 1 = all the left one)
let split = 0.5;

/** Two finished pictures, one over the other, cut by a slider you drag left and right. */
function compareView(a, b, numbers) {
  const ratio = a.photo.width / a.photo.height;
  const box = h("div.img-compare", { style: { "--ratio": String(ratio), "--x": `${split * 100}%` } },
    h("img.cmp-b", { src: b.photo.url, alt: "", draggable: false }),
    h("img.cmp-a", { src: a.photo.url, alt: "", draggable: false }),
    h("span.cmp-tag.is-a", {}, numbers[0]),
    h("span.cmp-tag.is-b", {}, numbers[1]));
  const handle = h("button.cmp-handle", { type: "button", role: "slider", "aria-label": "Compare", "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": Math.round(split * 100) }, sprite("image-compare"));
  box.append(h("span.cmp-line"), handle);
  const set = (f) => {
    split = Math.min(1, Math.max(0, f));
    box.style.setProperty("--x", `${split * 100}%`);
    handle.setAttribute("aria-valuenow", String(Math.round(split * 100)));
  };
  const at = (e) => {
    const r = box.getBoundingClientRect();
    set((e.clientX - r.left) / r.width);
  };
  box.addEventListener("pointerdown", (e) => {
    box.setPointerCapture(e.pointerId);
    box.classList.add("is-dragging");
    at(e);
    handle.focus({ preventScroll: true });
  });
  box.addEventListener("pointermove", (e) => box.hasPointerCapture(e.pointerId) && at(e));
  box.addEventListener("pointerup", () => box.classList.remove("is-dragging"));
  handle.addEventListener("keydown", (e) => {
    const step = { ArrowLeft: -0.02, ArrowRight: 0.02, Home: -1, End: 1 }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    set(Math.abs(step) === 1 ? (step < 0 ? 0 : 1) : split + (e.shiftKey ? step * 5 : step));
  });
  return box;
}

function stage(im, choice) {
  const shown = im.results.find((r) => r.id === im.shown) ?? im.results[0];
  const many = im.results.length > 1;
  const order = [...im.results].reverse();
  const number = (r) => String(order.indexOf(r) + 1);
  const finished = order.filter((r) => r.status === "done" && r.photo);
  // compare takes two finished pictures: the pair you picked, filled in with the shown one and the next
  let pair = [];
  if (im.view === "compare" && finished.length >= 2) {
    pair = (im.pair ?? []).map((id) => finished.find((r) => r.id === id)).filter(Boolean);
    for (const r of [shown, ...finished]) if (pair.length < 2 && r?.status === "done" && !pair.includes(r)) pair.push(r);
    im.pair = pair.map((r) => r.id);
  }
  const comparing = pair.length === 2;
  const all = many && im.view === "all";
  // one picture as it was made: done, still coming, or failed
  const face = (r, big) =>
    r.status === "done" && r.photo
      ? h("img", { src: r.photo.url, alt: "", draggable: false })
      : r.status === "failed"
      ? h("div.img-wait.is-error", {}, icon("close"), big ? h("span", {}, r.error ?? "That picture didn't work.") : null)
      : h("div.img-wait", { dataset: { job: r.id } }, h("span.typing", {}, h("i"), h("i"), h("i")), h("span.img-pct", {}, `${Math.round((r.progress ?? 0) * 100)}%`));
  let picture;
  if (comparing) {
    picture = compareView(pair[0], pair[1], pair.map(number));
  } else if (all) {
    // every picture at once; a click picks the one the keys act on, a double click opens it alone
    const n = im.results.length;
    const cols = n <= 2 ? n : n <= 4 ? 2 : n <= 9 ? 3 : 4;
    picture = h("div.img-grid", { style: { "--cols": String(cols) } }, [...im.results].reverse().map((r) =>
      h("button.grid-cell", {
        type: "button",
        className: r.id === shown?.id ? "is-shown" : "",
        title: `${r.label} · seed ${r.seed} — double-click to see it alone`,
        on: { click: () => setImage({ shown: r.id }), dblclick: () => setImage({ shown: r.id, view: "one" }) },
      }, face(r, false))));
  } else if (shown?.status === "done" && shown.photo) {
    picture = h("img.img-shown", { src: shown.photo.url, alt: "", draggable: false, title: "Look closer", on: { click: () => view(shown.photo.url) } });
  } else if (shown) {
    picture = face(shown, true);
  } else {
    const r = im.aspect === "auto" && im.refs[0] ? im.refs[0].width / im.refs[0].height : RATIOS[im.aspect] ?? 1;
    // drawn at the frame you chose, as large as the canvas allows
    picture = h("div.img-empty", { style: { "--ratio": String(r) } }, sprite(TEMPLATE_ICON[choice.template.id]), h("span.img-empty-label", {}, im.aspect === "auto" ? "like the reference" : im.aspect));
  }

  // the keys act on the shown picture; comparing, there is no single one to act on
  const done = !comparing && shown?.status === "done" && shown.photo;
  const send = h("button.img-send", { type: "button", "aria-haspopup": "menu", title: `Send it ${sendWhere()}`, on: { click: () => sendMenu(send, shown.photo) } }, sprite("send"), h("span", {}, "Send to"));
  const actions = done
    ? h("div.img-actions", {},
        shown.started ? h("span.img-cost", { title: shown.credits === null || shown.credits === undefined ? "Run on Comfy Cloud: GPU time" : `${shown.model}: credits for this picture` }, spentOf(shown)) : null,
        send,
        h("button.key.is-icon", { type: "button", title: "Edit this picture — it becomes a reference", "aria-label": "Edit this picture", on: { click: () => {
          addImageRef(shown.photo);
          const edit = choice.model.templates.find((t) => t.id === "edit") ? "edit" : null;
          setImage(edit ? { template: edit } : { model: "qwen-2.1", template: "edit" });
          composer.input.focus();
        } } }, sprite("image-edit")),
        h("a.key.is-icon", { href: `${shown.photo.url}?download=comfyture-image.png`, title: "Download", "aria-label": "Download" }, icon("download")),
        h("button.key.is-icon", { type: "button", title: "Look closer — zoom and pan", "aria-label": "Look closer", on: { click: () => view(shown.photo.url) } }, sprite("player-fullscreen")),
      )
    : null;

  // with more than one picture, a notch hangs from the top of the canvas: the window's surface flows
  // into it over two curved shoulders; inside, a tab per picture and one picture or all of them
  const notch = many
    ? h("div.img-notch", {},
        shoulder(), h("div.notch-body", { role: "tablist", "aria-label": "Pictures" },
        ...order.map((r, i) =>
          h("button.notch-tab", {
            type: "button",
            role: "tab",
            className: `is-${r.status}`,
            "aria-selected": String(comparing ? pair.includes(r) : r.id === shown?.id),
            title: comparing ? (pair.includes(r) ? `${r.label} · seed ${r.seed}` : "Compare this one instead") : `${r.label} · seed ${r.seed}`,
            disabled: comparing && r.status !== "done",
            // comparing, a tab takes the place of the older of the two
            on: { click: () => (comparing ? !pair.includes(r) && setImage({ pair: [pair[1].id, r.id], shown: r.id }) : setImage({ shown: r.id, view: "one" })) },
          }, String(i + 1))),
        h("span.notch-sep"),
        h("button.notch-key", {
          type: "button",
          "aria-pressed": String(all),
          title: all ? "One at a time" : "All at once",
          "aria-label": all ? "Show one picture" : "Show all pictures",
          on: { click: () => setImage({ view: all ? "one" : "all" }) },
        }, icon(all ? "image" : "grid")),
        h("button.notch-key", {
          type: "button",
          "aria-pressed": String(comparing),
          disabled: finished.length < 2,
          title: comparing ? "Stop comparing" : finished.length < 2 ? "Compare — needs two finished pictures" : "Compare two — pick them with the tabs, drag the slider",
          "aria-label": comparing ? "Stop comparing" : "Compare two pictures",
          on: { click: () => setImage({ view: comparing ? "one" : "compare" }) },
        }, sprite("image-compare"))), shoulder(true))
    : null;

  return h("div.img-stage", {}, h("div.img-view", { className: many ? "has-notch" : "" }, notch, h("div.img-canvas", {}, picture), actions), composer.el);
}

/** Where the Send key sends, for its tooltip: the section you are in. */
function sendWhere() {
  const page = currentPage();
  const im = state.image;
  if (page === "toaster") return "to a part's sheet or the render's references";
  if (page === "stage" && im.origin?.stageRef) return `to ${im.origin.stageRef.name}'s sheet, or an input of the shot`;
  return "to an input of the open tab";
}

/** A picture sent to a target is remembered, so the menu can show it as sent. */
const wasSent = (photo, key) => state.image.sent.includes(`${photo.file}|${key}`);
const markSent = (photo, key) => !wasSent(photo, key) && state.image.sent.push(`${photo.file}|${key}`);

/**
 * The targets of the page you are on. Toaster: the one the window was asked for, the render's references, then every part's sheet
 * (it stays open, so several pictures can go). The Stage: the sheet it was asked for, then the shot's inputs.
 */
async function targets(photo) {
  const page = currentPage();
  const origin = state.image.origin;
  const out = [];
  const shotInputs = () => out.push(...SEND.map(([slot, ic, label]) => ({ icon: ic, label, run: () => (placePhoto(slot, photo), closeImage()) })));
  if (page === "toaster") {
    const t = await import("../toaster.js");
    const draft = t.toaster.draft;
    if (!draft) return out;
    const send = (ref) => async () => {
      await t.takeRef({ ...ref, draftId: draft.id }, photo);
    };
    const parts = t.partsNow();
    const scene = { key: "scene", label: "The render's references", icon: "image-reference", run: send({ kind: "scene", name: "the render" }) };
    const partTarget = (p) => ({ key: `part:${p.id}`, label: `${p.name}'s sheet`, swatch: p.color, run: send({ kind: "part", partId: p.id, name: p.name }) });
    const asked = origin?.toasterRef;
    const first = asked && asked.draftId === draft.id ? (asked.kind === "scene" ? scene : parts.find((p) => p.id === asked.partId) && partTarget(parts.find((p) => p.id === asked.partId))) : null;
    if (first) out.push({ ...first, note: "asked for" }, { divider: true });
    if (first !== scene) out.push(scene);
    out.push(...parts.filter((p) => !first || first.key !== `part:${p.id}`).map(partTarget));
  } else if (page === "stage" && origin?.stageRef) {
    const ref = origin.stageRef;
    out.push({ key: `stage:${ref.id}`, label: `${ref.name}'s sheet`, icon: "image-reference", note: "asked for", run: async () => {
      const { stage, projects } = await stageReady;
      const target = (!ref.stageId || projects.current()?.id === ref.stageId) && stage.targetById(ref);
      if (!target) return toast(`${ref.name} is not on the open stage: the picture is still here.`);
      stage.addTagRef(target, photo);
      toast(`On ${ref.name}'s sheet now: renders follow it.`);
    } }, { divider: true });
    shotInputs();
  } else shotInputs();
  return out;
}

/** The places a picture can go, as a menu over the Send key. */
async function sendMenu(at, photo) {
  document.querySelector(".send-menu")?.remove();
  menuOpen = true;
  const list = await targets(photo);
  const close = () => {
    menu.remove();
    document.removeEventListener("pointerdown", outside, true);
    release();
  };
  const outside = (e) => !menu.contains(e.target) && e.target !== at && !at.contains(e.target) && close();
  const menu = h("div.menu.send-menu", { role: "menu" }, list.length ? list.map((t) =>
    t.divider ? h("hr") : h("button", { type: "button", role: "menuitem", className: t.key && wasSent(photo, t.key) ? "is-sent" : "", on: { click: async () => {
      close();
      try {
        await t.run();
        if (t.key) markSent(photo, t.key);
      } catch (e) {
        toast(e.message, { tone: "crit" });
      }
      changed("image");
    } } },
      t.swatch ? h("i.send-chip", { style: { background: t.swatch } }) : t.icon ? sprite(t.icon) : null,
      h("span.send-label", {}, t.label),
      t.note ? h("em", {}, t.note) : null,
      t.key && wasSent(photo, t.key) ? h("span.send-check", { title: "Already sent here" }, icon("check")) : null)) : [h("span.send-none", {}, "Open a project to send it to.")]);
  document.body.append(menu);
  const box = at.getBoundingClientRect();
  // under the key when there is room, else over it; the menu scrolls when it is long
  const below = innerHeight - box.bottom > box.top;
  Object.assign(menu.style, { right: `${innerWidth - box.right}px`, maxHeight: `${Math.max(160, (below ? innerHeight - box.bottom : box.top) - 24)}px` });
  if (below) menu.style.top = `${box.bottom + 6}px`;
  else Object.assign(menu.style, { top: `${box.top - 6}px`, transform: "translateY(-100%)" });
  menu.querySelector("button")?.focus();
  menu.addEventListener("keydown", (e) => {
    const items = [...menu.querySelectorAll("button")];
    const i = items.indexOf(document.activeElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length].focus();
    } else if (e.key === "Escape") {
      e.stopPropagation();
      close();
      at.focus();
    }
  });
  setTimeout(() => document.addEventListener("pointerdown", outside, true));
}

// ---------------------------------------------------------------- the window

export function renderImage(el) {
  layer = el;
  if (menuOpen) return void (held = true);
  const im = state.image;
  el.hidden = !im.open;
  document.body.classList.toggle("has-window", im.open);
  // the page behind is put away while it is open, and the focus goes back to what opened it when it closes
  modal(el, im.open);
  if (!im.open) return;
  const c = composer ?? makeComposer();
  // building the new window moves the composer, which drops its focus: note the caret first
  const typing = document.activeElement === c.input.el;
  const caret = [c.input.selectionStart, c.input.selectionEnd];
  if (c.input.value !== im.prompt) c.input.value = im.prompt;
  // what the names stand for may have changed (a reference added or taken away)
  else c.input.refresh();
  const choice = imageChoice();
  if (!choice) {
    el.replaceChildren(h("section.img-window", { role: "dialog", "aria-modal": "true", "aria-label": "Oven" }, h("div.img-loading", {}, h("span.typing", {}, h("i"), h("i"), h("i")))));
    return;
  }
  c.tray.replaceChildren(...im.refs.map((r) => refChip(r, choice.takesRefs)));
  c.tray.hidden = !im.refs.length;
  markMentioned();
  syncKeys();

  const head = h("header.img-head", {},
    h("span.img-title", {}, sprite("image-generate"), "Oven"),
    h("span.spacer"),
    h("span.img-official", { title: "The workflow this runs: Comfy's official template, from the Cloud template library" }, choice.template.official),
    h("button.key.is-icon.is-quiet", { type: "button", "aria-label": "Close", title: "Close — Esc", on: { click: closeImage } }, icon("close")),
  );
  const win = h("section.img-window", { role: "dialog", "aria-modal": "true", "aria-label": "Oven" }, head, h("div.img-body", {}, rail(im, choice), stage(im, choice)));
  el.replaceChildren(win);
  if (typing) {
    c.input.focus({ preventScroll: true });
    c.input.setSelectionRange(...caret);
  }

  // a click on the dimmed page closes; drops anywhere add references
  // (a block body: an onmousedown handler that returns false cancels the press, and with it the caret and the drag-select in the prompt)
  el.onmousedown = (e) => {
    if (e.target === el) closeImage();
  };
  el.onkeydown = (e) => {
    if (e.key === "Escape" && composer.picker.hidden) closeImage();
  };
  el.ondragover = (e) => {
    if (![...e.dataTransfer.types].includes("Files")) return;
    e.preventDefault();
    win.classList.add("is-drop");
  };
  el.ondragleave = (e) => !el.contains(e.relatedTarget) && win.classList.remove("is-drop");
  el.ondrop = (e) => {
    if (!e.dataTransfer.files.length) return;
    e.preventDefault();
    win.classList.remove("is-drop");
    uploadImageRefs([...e.dataTransfer.files]);
  };
  if (!el.contains(document.activeElement)) requestAnimationFrame(() => c.input.focus());
}
