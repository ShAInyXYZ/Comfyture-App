import { h, icon, sprite } from "../dom.js";
import {
  state, changed, onChange, ask, askStage, renderStageImage, useStageRender, improveStageLook, setStageModel, stageModels, undoAssistant, undoStage, clearChat, attach, detach, mentions, mentionables, adopt, toast, writers,
  attachPhoto, attachStageMap, setStageMap, addStagePicture, removeStagePicture, attachStagePictures,
} from "../store.js";
import { pillField, pillText } from "../pills.js";
import { attachMenu, MAPS, MAP_TAG, MAP_OF_TAG } from "../attach.js";
import { story, askStory, storyLookup, selectionLabel, select as selectInStory } from "../story.js";
import { cut, askCut } from "../cut.js";
import { dropdown } from "../controls.js";
import { mentionAt } from "../mentions.js";
import { writerPicker } from "../writer-menu.js";
import { view } from "../viewer.js";
import { currentPage } from "../router.js";
import { stageReady, needStage } from "../control/link.js";
import { harnessOf, barOf, introOf, onRoom, setTeller, offersOf } from "../harnesses.js";
import { hasTour, tourTaken, startTour, onTour } from "../tour.js";
import { surfaceOf, extrasOf, surfaceReady } from "../surfaces.js";

// One bar, and a pet in it for every product (web/js/harnesses.js): Ketkout in Kitchen's rooms, Praline in Mixer,
// Pickle in Jam, Brioche in Macaron, Paprika in Spice, Crumpet in Toaster, Truffle in Utensils. The page the bar is on says whose bar it is, and each
// product keeps its own conversation, so what is said to one is never in front of another.

// on the Stage the bar stages a scene; on the Shot it sets up the shot: one bar, two conversations
const onStage = () => currentPage() === "stage";
// on Story the bar changes the step that is open: "add a scene where she finds the jellyfish"
const onStory = () => currentPage() === "story";
// on Cut the bar asks the editor: "trim the first shot to 3 s and put rain under scene 2"; on Jam it asks the same editor
// about the music video's edit: "a zoom on every bar, make the words bounce"
const onCut = () => currentPage() === "cut" || currentPage() === "jam";
// only the Shot's and the Stage's bars take files and @names: on any other page they would end up in the Shot's conversation, out of sight
const onToaster = () => currentPage() === "toaster";
// (Crumpet takes one photo, to rebuild what it shows)
const takesFiles = () => onStage() || currentPage() === "shot" || onToaster();

// Jam's editor is Cut's editor, asked with a conversation of its own (Kitchen's Cut keeps the one in `cut`). The two share one
// edit, so one answers at a time.
const jamChat = { messages: [], busy: null };
const askJam = (text) => askCut(text, jamChat);
const editorBusy = () => jamChat.busy || cut.chat.busy;

/**
 * The page the bar is on, as the bar needs it: whose bar it is (the product, so the pet), the room that sets what it
 * asks and offers, the conversation, how to say something into it, and which model answers (the writer, or the quick assistant).
 */
function surface() {
  const page = currentPage();
  // a product's own module gives its surface when it has come (app.js loads it with the product's page)
  const own = surfaceOf(page);
  if (own) return own;
  switch (page) {
    case "macaron":
    case "mixer":
    case "spice":
    case "toaster":
    case "utensils":
      return notYet(page);
    case "jam":
      return { product: "jam", chat: jamChat, ask: askJam, blocked: editorBusy, clear: () => ((jamChat.messages = []), changed("assistant")), role: "writer" };
    case "story": {
      const writing = [...story.busy].find((k) => !k.includes(":"));
      return { product: "kitchen", room: "story", chat: { messages: story.chat.messages, busy: story.busy.has("assist") ? "Editing" : writing ? "Writing" : null }, ask: askStory, blocked: () => story.busy.has("assist"), clear: () => ((story.chat.messages = []), changed("assistant")), role: "writer" };
    }
    case "cut":
      return { product: "kitchen", room: "cut", chat: cut.chat, ask: askCut, blocked: editorBusy, clear: () => ((cut.chat.messages = []), changed("assistant")), role: "writer" };
    case "stage":
      return { product: "kitchen", room: "stage", chat: state.stageChat, ask: askStage, clear: clearChat, role: "assistant" };
    default:
      return { product: "kitchen", room: "shot", chat: state.chat, ask, clear: clearChat, role: "assistant" };
  }
}
const blocked = (s) => (s.blocked ? s.blocked() : s.chat.busy);

/** A product's bar before its module has come: its pet and an empty conversation; what is said meanwhile goes to it once it has. */
const notYet = (page) => ({
  product: page,
  room: page === "toaster" ? "toaster" : undefined,
  chat: { messages: [], busy: null },
  ask: (text) => surfaceReady(page).then(() => surfaceOf(page).ask(text)),
  clear() {},
  role: page === "macaron" ? "writer" : "assistant",
});

/** Says something to the pet of the page as if typed in its bar: a preset chip here, or in a product's left panel. */
function tell(text) {
  const s = surface();
  if (!text?.trim() || blocked(s)) return;
  open = true;
  s.ask(text);
}
setTeller(tell);
// a product's panel says which of its workspaces is open: the bar asks and offers what fits it
onRoom(() => changed("assistant"));
// on Utensils the room is the group of the tool open (picture, video, sound): the bar follows the shelf
let shownRoom = null;
onChange((scopes) => scopes.has("utensils") && currentPage() === "utensils" && surfaceOf("utensils")?.room !== shownRoom && changed("assistant"));
// the Stage, once it has mounted: who its @names are
let stageApi = null;
stageReady.then((a) => (stageApi = a));
const MAP_ICON = { id: "channel-id", depth: "channel-depth", pose: "channel-pose", normal: "view-normals", lines: "scene-render", mask: "material-mask", clay: "view-material" };

/** What an @name in the bar stands for, to draw its pill and its card. */
function lookup(name) {
  if (onStory()) return storyLookup(name);
  if (onToaster()) return extrasOf("toaster").lookup(name);
  if (onStage()) {
    const c = stageApi?.ops.cast?.().find((x) => x.tag === name);
    if (c) return { title: c.name, color: c.color, url: c.pictures[0]?.url, pictures: c.pictures, words: c.words, note: c.pictures.length || c.words ? null : "No sheet yet: the key beside the eye in the Scene list opens one." };
    if (name === "frame") return { title: "@frame", note: "The clay frame every render starts from" };
    const map = MAP_OF_TAG[name];
    if (map) return { title: MAPS.find(([id]) => id === map)[2].split(" — ")[0], note: state.stageChat.inputs.maps.includes(map) ? "A control map, sent with every render" : "Not sent: the paperclip adds it" };
    const p = state.stageChat.inputs.pictures.find((x) => x.name === name);
    return p ? { title: p.title ?? `@${name}`, url: p.url, pictures: [p], note: "Sent with every render" } : null;
  }
  const f = mentionables().find((x) => x.name === name);
  if (!f) return null;
  const picture = f.kind === "image" ? f.url : f.poster;
  return { title: f.title ?? `@${name}`, url: picture, pictures: picture ? [{ url: picture, width: f.width, height: f.height }] : [], note: describe(f) };
}

/** On the Stage, what @ can name: everyone on it, its control maps, and the pictures the bar sends. */
function stageMentionables() {
  const cast = (stageApi?.ops.cast?.() ?? []).map((c) => ({ name: c.tag, title: c.name, color: c.color, url: c.pictures[0]?.url, about: c.pictures.length ? `${c.pictures.length} ${c.pictures.length === 1 ? "picture" : "pictures"}` : c.words ? "words" : c.person ? "no sheet" : "" }));
  const maps = [["frame", "Clay frame"], ...MAPS.filter(([id]) => id !== "clay").map(([id, tag, about]) => [tag, about.split(" — ")[0]])].map(([tag, title]) => ({ name: tag, title, map: MAP_OF_TAG[tag] ?? "clay", about: "map" }));
  const pictures = state.stageChat.inputs.pictures.map((p) => ({ name: p.name, title: p.title, url: p.url, about: "picture" }));
  return [...cast, ...pictures, ...maps];
}
const KIND_ICON = { video: "video", audio: "sound" };

// the composer is made once and kept, so what you type, the caret and the focus survive every redraw
let composer = null;
let seen = 0;
// the conversation panel above the bar: open while you talk, folded away when you don't need it
let open = false;

/** A file's face: its picture, or an icon for what it is. */
function thumb(f) {
  if (f.poster) return h("img", { src: f.poster, alt: "", draggable: false });
  if (f.kind === "image") return h("img", { src: f.url, alt: "", draggable: false });
  if (f.kind === "video") return h("video", { src: `${f.url}#t=0.4`, muted: true, preload: "metadata", draggable: false });
  return h("span.file-glyph", {}, f.kind === "text" ? sprite("file") : icon(KIND_ICON[f.kind]));
}

const SOURCE = { attached: "attached", take: "take", film: "film", image: "library", preset: "preset" };
const FILTERS = [["video", "Video"], ["image", "Image"], ["text", "Text"], ["preset", "Preset"]];
// presets are their own kind in the picker, though the assistant reads them as JSON
const tabOf = (f) => (f.source === "preset" ? "preset" : f.kind === "audio" ? "text" : f.kind);
const describe = (f) =>
  f.kind === "image" ? `${f.width} × ${f.height}` : f.kind === "video" ? `${f.duration?.toFixed(1)} s` : f.kind === "audio" ? `sound · ${f.duration?.toFixed(1)} s` : f.source === "preset" ? "json" : (f.title?.match(/\.(\w+)$/)?.[1] ?? "text");

// ---------------------------------------------------------------- @ mentions

function insertMention(input, name) {
  const at = mentionAt(input);
  if (!at) return;
  if (!onStage() && !onToaster()) adopt(name);
  const after = input.value.slice(input.selectionStart);
  input.value = `${input.value.slice(0, at.from)}@${name} ${after.replace(/^\S*/, "").replace(/^ /, "")}`;
  const caret = at.from + name.length + 2;
  input.setSelectionRange(caret, caret);
  input.focus();
  input.dispatchEvent(new Event("input"));
}

/** The picker over the composer: the files whose names start with what follows the @. */
function updatePicker() {
  const c = composer;
  if (!takesFiles()) return void (c.picker.hidden = true);
  if (onStage() || onToaster()) return updateStagePicker();
  const at = mentionAt(c.input);
  // the conversation's files first, then the Library: takes, films, images, presets
  const q = at?.query ?? "";
  const found = at ? mentionables().filter((f) => f.name.startsWith(q) || (q && f.title?.toLowerCase().includes(q))) : [];
  const count = Object.fromEntries(FILTERS.map(([k]) => [k, found.filter((f) => tabOf(f) === k).length]));
  // the open tab follows what you type: when it has nothing, the first tab that has something
  if (!count[c.filter]) c.filter = FILTERS.find(([k]) => count[k])?.[0] ?? c.filter;
  let list = found.filter((f) => tabOf(f) === c.filter).slice(0, 80);
  // a name typed out in full needs no picker
  const exact = found.length === 1 && found[0].name === q;
  if (exact) list = [];
  c.pick = Math.min(c.pick, Math.max(0, list.length - 1));
  c.picker.hidden = !at || !found.length || exact;
  const tabs = h("div.pick-tabs", { role: "tablist" }, FILTERS.map(([k, label]) =>
    h("button", { type: "button", role: "tab", "aria-selected": String(c.filter === k), disabled: !count[k], on: { mousedown: (e) => {
      e.preventDefault();
      c.filter = k;
      c.pick = 0;
      updatePicker();
    } } }, label, h("span", {}, String(count[k])))));
  c.picker.replaceChildren(tabs, h("div.pick-grid", {}, ...list.map((f, i) =>
    h("button.pick-file", {
      type: "button",
      className: i === c.pick ? "is-active" : "",
      title: `${f.title ?? f.name} — ${SOURCE[f.source] ?? "attached"} · ${describe(f)}`,
      on: { mousedown: (e) => (e.preventDefault(), insertMention(c.input, f.name)) },
    },
      h("span.pick-thumb", {}, thumb(f), h("em", { className: `src is-${f.source}` }, SOURCE[f.source] ?? "attached")),
      h("span.pick-name", {}, h("b", {}, `@${f.name}`), h("span", {}, describe(f)))))));
  c.picker.querySelector(".pick-file.is-active")?.scrollIntoView({ block: "nearest" });
  c.list = list;
}

/** On the Stage: everyone whose name starts with what follows the @, then the maps and pictures; on Toaster: the parts, then the references. */
function updateStagePicker() {
  const c = composer;
  const at = mentionAt(c.input);
  const q = at?.query ?? "";
  const all = at ? (onToaster() ? extrasOf("toaster").items() : stageMentionables()) : [];
  const list = all.filter((f) => f.name.startsWith(q) || (q && f.title?.toLowerCase().includes(q))).slice(0, 40);
  const exact = list.length === 1 && list[0].name === q;
  c.pick = Math.min(c.pick, Math.max(0, list.length - 1));
  c.picker.hidden = !at || !list.length || exact;
  c.picker.classList.toggle("is-list", onToaster());
  c.picker.replaceChildren(h(`div.pick-grid${onToaster() ? ".is-list" : ".is-cast"}`, {}, ...list.map((f, i) =>
    h("button.pick-file", { type: "button", className: i === c.pick ? "is-active" : "", title: f.title, on: { mousedown: (e) => (e.preventDefault(), insertMention(c.input, f.name)) } },
      h("span.pick-thumb", {}, f.url ? h("img", { src: f.url, alt: "", draggable: false }) : f.color ? h("i.pick-swatch", { style: { background: f.color } }) : sprite(MAP_ICON[f.map] ?? "file")),
      h("span.pick-name", {}, h("b", {}, `@${f.name}`), h("span", {}, f.title === f.name ? f.about : [f.title, f.about].filter(Boolean).join(" · ")))))));
  c.picker.querySelector(".pick-file.is-active")?.scrollIntoView({ block: "nearest" });
  c.list = list;
}

/** The files named in the message being typed get the accent outline, so you see which is which. */
function markMentioned() {
  const text = composer.input.value;
  const named = new Set(onStage() || onToaster() ? [...text.matchAll(/@([a-z0-9][a-z0-9-]*)/gi)].map((m) => m[1].toLowerCase()) : mentions(text));
  composer.tray.querySelectorAll(".file-chip").forEach((chip) => chip.classList.toggle("is-mentioned", named.has(chip.dataset.name)));
}

// ---------------------------------------------------------------- composer

function makeComposer() {
  const input = pillField({ placeholder: "Describe the shot · @ for a file", label: "Message the assistant", lookup, className: "chat-input" });
  const fileInput = h("input", { type: "file", multiple: true, hidden: true, accept: "image/*,video/mp4,video/webm,video/quicktime,audio/*,text/plain,text/markdown,.md,.txt,.json,.csv" });
  // the field grows with its words, up to its CSS height
  const grow = () => {};
  // the quick actions give way while you write, and come back when the field is empty
  const typing = () => composer.chips.classList.toggle("is-typing", !!input.value.trim());
  const send = () => {
    const text = input.value;
    if (!text.trim() || blocked(surface())) return;
    input.value = "";
    grow();
    composer.picker.hidden = true;
    markMentioned();
    typing();
    tell(text);
  };
  input.addEventListener("input", () => (grow(), updatePicker(), markMentioned(), typing()));
  input.addEventListener("click", updatePicker);
  // a redraw blurs it for a moment; the picker only goes when the focus really left
  input.addEventListener("blur", () => setTimeout(() => document.activeElement !== input.el && (composer.picker.hidden = true), 120));
  input.addEventListener("keydown", (e) => {
    const c = composer;
    if (!c.picker.hidden && c.list?.length) {
      const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 2, ArrowUp: -2 }[e.key];
      if (step && (e.key.startsWith("Arrow") && (e.key === "ArrowDown" || e.key === "ArrowUp" || !input.value.slice(input.selectionStart).length))) {
        e.preventDefault();
        c.pick = Math.min(c.list.length - 1, Math.max(0, c.pick + step));
        return updatePicker();
      }
      // a name typed out in full needs no picking: Enter sends
      const typed = mentionAt(input)?.query;
      if (e.key === "Tab" || (e.key === "Enter" && c.list[c.pick].name !== typed)) {
        e.preventDefault();
        return insertMention(input, c.list[c.pick].name);
      }
      if (e.key === "Escape") return (c.picker.hidden = true);
    }
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      send();
    }
  });
  // paste a picture or a file straight into the message
  input.addEventListener("paste", (e) => {
    const files = [...(e.clipboardData?.files ?? [])];
    if (files.length && takesFiles()) {
      e.preventDefault();
      if (onStage()) attachStagePictures(files);
      else if (onToaster()) extrasOf("toaster").addPictures(files);
      else attach(files);
    }
  });
  fileInput.addEventListener("change", () => ((onToaster() ? extrasOf("toaster").addPictures : attach)([...fileInput.files]), (fileInput.value = "")));
  // the paperclip opens its two frames: files (from the computer, or the Library), and the Stage's control maps
  const clip = h("button.composer-key.clip-key", { type: "button", title: "Attach — a file, a picture from the Library, or a control map of the Stage", "aria-label": "Attach", "aria-expanded": "false" }, sprite("paperclip"));
  clip.addEventListener("click", () => {
    const inputs = state.stageChat.inputs;
    // Toaster: one photo, from the computer or the Library, for Crumpet to rebuild
    if (onToaster()) {
      const toaster = extrasOf("toaster");
      return attachMenu(clip, { files: toaster.addPictures, picture: toaster.addPhoto, taken: (photo) => toaster.pictures.some((p) => p.file === photo.file) });
    }
    attachMenu(clip, onStage() ? {
      files: (files) => attachStagePictures(files),
      picture: (photo) => addStagePicture(photo),
      taken: (photo) => inputs.pictures.some((p) => p.file === photo.file),
      map: (id, on) => setStageMap(id, on),
      chosen: (id) => inputs.maps.includes(id),
    } : {
      files: (files) => attach(files),
      accept: fileInput.accept,
      picture: (photo) => attachPhoto(photo),
      taken: (photo) => state.chat.files.some((f) => f.file === photo.file),
      map: (id, on) => (on ? attachStageMap(id) : detach(MAP_TAG[id])),
      chosen: (id) => state.chat.files.some((f) => f.name === MAP_TAG[id]),
    });
  });
  const key = h("button.send", { type: "button", title: "Send — Enter", "aria-label": "Send", on: { click: send } }, sprite("send"));
  // on the Stage: a finished picture of the frame, in the look the words describe
  const render = h("button.composer-key.render-key", {
    type: "button",
    title: "Render an image of the frame — what you type sets its look",
    "aria-label": "Render an image of the frame",
    on: { click: () => {
      if (state.stageChat.busy) return;
      const words = input.value;
      const raw = composer.improved && words.trim().length > 0;
      input.value = "";
      grow();
      typing();
      forget();
      open = true;
      renderStageImage(words, { raw });
    } },
  }, sprite("image-generate"));
  // the model it renders with, and the words made better by that model's own guide
  const modelSlot = h("span.composer-model");
  const improve = h("button.composer-key.improve-key.stage-only", {
    type: "button",
    title: "Improve the words with the chosen model's own prompt guide — it reads the frame and who's who",
    "aria-label": "Improve the words",
    on: { click: async () => {
      const words = input.value.trim();
      if (!words || composer.improving) return;
      composer.improving = true;
      improve.classList.add("is-busy");
      try {
        const better = await improveStageLook(words);
        composer.before = words;
        composer.improved = true;
        input.value = better;
        grow();
        typing();
        undo.hidden = false;
      } catch (error) {
        toast(error.message ?? String(error), { tone: "crit" });
      } finally {
        composer.improving = false;
        improve.classList.remove("is-busy");
      }
    } },
  }, sprite("prompt-enhance"));
  const undo = h("button.composer-key.stage-only", { type: "button", hidden: true, title: "Put my words back", "aria-label": "Put my words back", on: { click: () => ((input.value = composer.before ?? ""), grow(), typing(), forget()) } }, icon("remix"));
  const forget = () => {
    composer.improved = false;
    composer.before = null;
    undo.hidden = true;
  };
  const tray = h("div.file-tray");
  const picker = h("div.mention-picker", { hidden: true, role: "listbox", "aria-label": "Files" });
  const toggle = h("button.composer-key.thread-key", { type: "button", "aria-label": "Conversation", on: { click: () => ((open = !open), renderAssistant(document.getElementById("assistant"))) } });
  const status = h("span.bar-status");
  // the pet's face at the left of the composer, its quick actions above it
  const face = h("span.pet-face", {}, h("img", { alt: "", draggable: false }));
  // its name and what it does, beside its face
  const who = h("span.pet-id", {}, h("b"), h("small"));
  // @ starts a name in the words: the list of what can be named opens
  const at = h("button.composer-key.at-key", { type: "button", title: "Name something — @", "aria-label": "Name something", on: { click: () => {
    input.focus();
    const v = input.value;
    document.execCommand("insertText", false, `${v && !/\s$/.test(v) ? " " : ""}@`);
    input.dispatchEvent(new Event("input"));
  } } }, h("b", {}, "@"));
  const chips = h("div.pet-chips", { hidden: true, role: "group", "aria-label": "Quick actions" });
  // the words on top and their keys under them; the model and the send key on the right, level with both
  const bar = h("div.chat-bar", {}, face, who, h("div.bar-main", {}, tray, input.el, h("div.bar-row", {}, clip, at, render, improve, undo, h("span.spacer"), status, toggle)), h("div.bar-actions", {}, modelSlot, key));
  const el = h("div.composer", {}, picker, chips, bar, fileInput);
  // the page keeps room for the bar at its real height, quick actions and files and all
  new ResizeObserver(() => document.documentElement.style.setProperty("--chat-h", `${Math.ceil(el.getBoundingClientRect().height)}px`)).observe(el);
  composer = { el, input, key, render, modelSlot, improve, tray, picker, toggle, status, face, who, chips, pick: 0, list: [], filter: "image", improved: false, before: null };
  return composer;
}

/** Adds @name to the message being typed. */
function mention(name) {
  const input = composer.input;
  if (mentions(input.value).includes(name)) return input.focus();
  const pad = input.value && !/\s$/.test(input.value) ? " " : "";
  input.value = `${input.value}${pad}@${name} `;
  input.focus();
  input.dispatchEvent(new Event("input"));
}

/** On the Stage, a control map every render sends: its mark and its @name; × leaves it out. */
function mapChip(id) {
  const [, tag, about] = MAPS.find(([m]) => m === id) ?? [id, id, id];
  return h("div.file-chip.is-map", { dataset: { name: tag }, title: `${about} — sent with every render` },
    h("span.chip-thumb.is-glyph", {}, sprite(MAP_ICON[id] ?? "file")),
    h("button.chip-name", { type: "button", "aria-label": `Mention @${tag}`, on: { click: () => mention(tag) } }, `@${tag}`),
    h("button.chip-x", { type: "button", "aria-label": `Leave @${tag} out`, title: "Leave it out", on: { click: () => setStageMap(id, false) } }, icon("close")));
}
/** On the Stage, a picture every render sends, by its @name. */
function stagePictureChip(p) {
  return h("div.file-chip", { dataset: { name: p.name }, title: `${p.title ?? p.name} — sent with every render` },
    h("button.chip-thumb", { type: "button", "aria-label": `Look at @${p.name}`, on: { click: () => view(p.url) } }, h("img", { src: p.url, alt: "", draggable: false })),
    h("button.chip-name", { type: "button", "aria-label": `Mention @${p.name}`, on: { click: () => mention(p.name) } }, `@${p.name}`),
    h("button.chip-x", { type: "button", "aria-label": `Remove @${p.name}`, title: "Remove", on: { click: () => removeStagePicture(p.name) } }, icon("close")));
}

/** Toaster: the photo waiting to go to Crumpet with the next words. */
function toasterPictureChip(p) {
  return h("div.file-chip", { title: `${p.name} — Crumpet sees it with your next words` },
    h("button.chip-thumb", { type: "button", "aria-label": "Look at the photo", on: { click: () => view(p.url) } }, h("img", { src: p.url, alt: "", draggable: false })),
    h("span.chip-name", {}, "Photo"),
    h("button.chip-x", { type: "button", "aria-label": "Take the photo away", title: "Remove", on: { click: () => extrasOf("toaster").removePicture() } }, icon("close")));
}

function fileChip(f) {
  const look = f.kind === "image" ? () => view(f.url) : f.kind === "video" ? () => view(f.url, "video") : () => mention(f.name);
  return h("div.file-chip", { dataset: { name: f.name }, title: `${f.title ?? f.name} — ${describe(f)}` },
    h("button.chip-thumb", { type: "button", "aria-label": `Look at @${f.name}`, on: { click: look } }, thumb(f)),
    h("button.chip-name", { type: "button", "aria-label": `Mention @${f.name}`, on: { click: () => mention(f.name) } }, `@${f.name}`),
    h("button.chip-x", { type: "button", "aria-label": `Remove @${f.name}`, title: "Remove", on: { click: () => detach(f.name) } }, icon("close")),
  );
}

// ---------------------------------------------------------------- the thread

/** A picture the Stage is rendering: its progress, then the picture, to look at or start a shot from. */
function renderTile(id) {
  const r = state.image.results.find((x) => x.id === id);
  if (!r || r.status === "failed") return h("span.msg-render.is-failed", { title: r?.error ?? "That picture didn't work." }, icon("close"));
  if (r.status !== "done" || !r.photo) {
    return h("span.msg-render.is-running", { style: { aspectRatio: r.aspect?.replace(":", " / ") ?? "16 / 9" }, title: "Rendering…" },
      h("span.typing", {}, h("i"), h("i"), h("i")), h("i.msg-render-bar", { style: { width: `${Math.round((r.progress ?? 0) * 100)}%` } }));
  }
  return h("span.msg-render", { style: { aspectRatio: `${r.photo.width} / ${r.photo.height}` } },
    h("button.msg-render-look", { type: "button", title: onStage() ? "Show it from its camera, over the stage" : "Look at it", "aria-label": "Look at the picture", on: { click: () => (onStage() ? needStage().then((api) => api.viewRun(id)) : view(r.photo.url)) } }, h("img", { src: r.photo.url, alt: "", draggable: false })),
    h("button.msg-render-use", { type: "button", title: "Start a shot from it", "aria-label": "Start a shot from it", on: { click: () => useStageRender(r.photo) } }, icon("video")));
}

/** A paid action waits on its answer for one yes, with its price; then it runs, or the user says not now. */
function confirmRow(m, s) {
  const c = m.confirm;
  if (c.state === "asking") {
    return h("div.msg-confirm", {},
      h("button.key.is-primary", { type: "button", on: { click: () => s.confirm(m) } }, c.label, h("em", {}, c.cost)),
      h("button.key.is-quiet", { type: "button", on: { click: () => s.decline(m) } }, "Not now"));
  }
  const note = { running: c.running, done: c.done, failed: c.failed, declined: "Not now", stale: "That changed since. Ask me again." }[c.state];
  return h("div.msg-confirm.is-settled", {}, c.state === "running" ? h("span.typing", {}, h("i"), h("i"), h("i")) : c.state === "done" ? icon("check") : c.state === "failed" ? icon("close") : null, note);
}

/**
 * A message's words copied with a click (to take a pet's description into a field elsewhere): a click on a key, a picture or a link does
 * its own thing, and a drag that selects words leaves the selection alone. The bubble says it was copied, for a moment.
 */
function copyOnClick(el, text) {
  if (!text?.trim()) return el;
  el.classList.add("is-copyable");
  el.title ||= "Click to copy";
  el.addEventListener("click", async (e) => {
    if (e.target.closest("button, a, input, .msg-renders, .msg-confirm, .msg-files") || String(getSelection?.() ?? "").trim()) return;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else {
        // (a page served over plain http on another machine has no clipboard API: the old way)
        const area = h("textarea", { value: text, style: { position: "fixed", opacity: "0" } });
        document.body.append(area);
        area.select();
        document.execCommand("copy");
        area.remove();
      }
      el.classList.add("is-copied");
      setTimeout(() => el.classList.remove("is-copied"), 1200);
    } catch {
      toast("Could not copy.", { tone: "crit" });
    }
  });
  return el;
}

function message(m, last, s, harness) {
  const files = (m.files ?? []).map((n) => state.chat.files.find((f) => f.name === n)).filter(Boolean);
  if (m.role === "user") {
    return copyOnClick(h("div.msg.is-user", {},
      m.about ? h("span.msg-about", {}, m.about) : null,
      pillText("p", m.text, lookup),
      files.length ? h("div.msg-files", {}, files.map((f) => h("span.msg-file", { title: `@${f.name}` }, thumb(f)))) : null,
      m.picture ? h("div.msg-files", {}, h("span.msg-file", { title: "The photo sent with these words" }, h("img", { src: m.picture.url, alt: "", draggable: false }))) : null), m.text);
  }
  // a pet's answer: its face, its words, what it did (and could not), a yes or no for what costs credits, one step back
  const [undo, back] = m.macaron ? [extrasOf("macaron").undo, "Put the design back as it was"] : m.toaster ? [extrasOf("toaster").undo, "Put the draft back as it was"] : m.stage ? [undoStage, "Put the stage back as it was"] : [undoAssistant, "Put the shot back as it was"];
  return copyOnClick(h("div.msg.is-ai", { className: m.error ? "is-error" : "" },
    h("img.msg-face", { src: harness.face, alt: "", draggable: false }),
    h("p", m.detail ? { title: m.detail } : {}, m.text),
    m.renders?.length ? h("div.msg-renders", {}, m.renders.map(renderTile)) : null,
    m.did?.length || m.failed?.length
      ? h("div.msg-chips", {},
        ...(m.did ?? []).map((d) => h("span.chip", {}, icon(d === "Undone" ? "remix" : "check"), d)),
        ...(m.failed ?? []).map((f) => h("span.chip.is-failed", { title: f }, icon("close"), m.stage ? f.split(":")[0].replace(/_/g, " ") : f)))
      : null,
    m.confirm ? confirmRow(m, s) : null,
    last && m.undo ? h("button.key.is-sm.is-quiet.undo", { type: "button", title: back, on: { click: () => undo(m) } }, icon("remix"), "Undo") : null), m.error ? "" : m.text);
}

// a picture shown over the Stage's frame asks for room
document.addEventListener("assistant:fold", () => {
  if (!open) return;
  open = false;
  renderAssistant(document.getElementById("assistant"));
});

// a tour started or ended: its chip follows
onTour(() => changed("assistant"));

// how many answers each conversation had when the bar last drew it: a new one opens the thread
const known = new Map();

export function renderAssistant(el) {
  const s = surface();
  const harness = harnessOf(s.product);
  const stage = onStage();
  const storyPage = onStory();
  const cutPage = onCut();
  const filesOn = takesFiles();
  const { messages, busy } = s.chat;
  const { files, attaching } = state.chat;
  const c = composer ?? makeComposer();
  c.key.disabled = !!busy || !!blocked(s);
  c.render.disabled = !!busy;
  // the model that answers here, on every page: the writer on Story, Cut, Jam and Macaron, the quick assistant on Shot, the Stage, Mixer, Spice and Utensils
  const llm = writers().length > 1 ? [writerPicker(s.role)] : [];
  if (stage) {
    const models = stageModels();
    const value = state.stageModel && models.some((m) => m.id === state.stageModel) ? state.stageModel : state.image.catalogue?.default ?? models[0]?.id;
    c.modelSlot.replaceChildren(...llm, ...(models.length > 1 ? [dropdown({ label: "Image model", value, items: models.map((m) => ({ value: m.id, label: m.name, desc: m.about })), onChange: (id) => setStageModel(id) })] : []));
  } else c.modelSlot.replaceChildren(...llm);
  // whose bar it is: the pet's face at its left, what it asks in this room, and its quick actions above the bar
  // (a product with a left panel of its own shows them there instead)
  const look = barOf(s.product, s.room);
  const face = c.face.firstChild;
  if (face.getAttribute("src") !== harness.face) face.setAttribute("src", harness.face);
  c.who.firstChild.textContent = harness.name ?? "";
  c.who.lastChild.textContent = harness.tag ?? "";
  c.face.dataset.tooltip = introOf(s.product);
  el.dataset.pet = harness.pet;
  c.input.placeholder = look.placeholder;
  // the chips above the bar: what the pet offers in this room (words said to it, or a thing the page does), and its tour: first while
  // it is new to you, last once taken
  const offered = offersOf(s.product, s.room).map((o) =>
    h("button.pet-chip", { type: "button", title: o.ask ?? o.title ?? o.label, disabled: !!blocked(s) && !o.run, on: { click: () => (o.run ? o.run() : tell(o.ask)) } }, o.icon ? sprite(o.icon) : null, o.label));
  const fresh = !tourTaken(s.product);
  const guide = hasTour(s.product)
    ? h(`button.pet-chip.is-tour${fresh ? ".is-new" : ""}`, { type: "button", title: `${harness.name} shows you around, on an example: nothing is spent`, on: { click: () => startTour(s.product) } }, icon("compass"), "Show me around")
    : null;
  const chips = guide ? (fresh ? [guide, ...offered] : [...offered, guide]) : offered;
  c.chips.hidden = !chips.length;
  c.chips.replaceChildren(...chips);
  shownRoom = s.room;
  const inputs = state.stageChat.inputs;
  c.tray.replaceChildren(...(stage ? [...inputs.maps.map(mapChip), ...inputs.pictures.map(stagePictureChip)] : onToaster() ? extrasOf("toaster").pictures.map(toasterPictureChip) : filesOn ? files.map(fileChip) : []), ...(filesOn && !stage && !onToaster() && attaching ? [h("div.file-chip.is-loading", {}, h("span.typing", {}, h("i"), h("i"), h("i")))] : []));
  // on Story, what the assistant will edit: the block (or the card) that is picked
  if (storyPage) {
    const label = selectionLabel();
    c.tray.replaceChildren(...(label ? [h("div.file-chip.is-context", { title: "The assistant edits what is picked; it knows the whole story" }, h("span.chip-thumb.is-glyph", {}, sprite("prompt-enhance")), h("span.chip-name", {}, `Editing: ${label}`), h("button.chip-x", { type: "button", "aria-label": "Edit the whole story", title: "The whole story", on: { click: () => selectInStory(null) } }, icon("close")))] : []));
  }
  c.tray.hidden = storyPage ? !selectionLabel() : !filesOn || (stage ? !inputs.maps.length && !inputs.pictures.length : onToaster() ? !extrasOf("toaster").pictures.length : !files.length && !attaching);
  c.el.classList.toggle("is-story", storyPage);
  c.el.classList.toggle("is-cut", cutPage);
  c.el.classList.toggle("no-clip", !filesOn);
  c.input.refresh();
  c.el.classList.toggle("is-stage", stage);
  markMentioned();
  // a new answer opens the conversation, so its changes and its Undo are in view
  const where = `${s.product}:${s.room ?? ""}`;
  const answers = messages.filter((m) => m.role === "assistant").length;
  if (answers > (known.get(where) ?? answers)) open = true;
  known.set(where, answers);
  // on the bar: whether it is working, and how long the conversation is
  c.status.replaceChildren(...(busy ? [h("span.typing", {}, h("i"), h("i"), h("i"))] : []));
  c.status.dataset.tooltip = busy || "";
  // the conversation exists once you have said something; until then the bar is all there is
  if (!messages.length && !busy) open = false;
  c.toggle.hidden = !messages.length;
  c.toggle.replaceChildren(sprite("message"), h("span.thread-count", {}, String(messages.length)));
  c.toggle.dataset.tooltip = open ? "Fold the conversation" : "Show the conversation";
  c.toggle.setAttribute("aria-pressed", String(open));

  const lastAi = messages.findLastIndex((m) => m.role === "assistant");
  const thread = h("div.chat-thread", {},
    messages.map((m, i) => message(m, i === lastAi, s, harness)),
    busy ? h("div.msg.is-ai.is-busy", {}, h("img.msg-face", { src: harness.face, alt: "", draggable: false }), h("span.typing", {}, h("i"), h("i"), h("i")), busy) : null,
  );
  const panel = h("div.chat-panel", { hidden: !open },
    h("div.panel-pet", {}, h("img", { src: harness.face, alt: "", draggable: false }), h("b", {}, harness.name), h("span", {}, harness.tag)),
    h("div.panel-keys", {},
      h("button.key.is-sm.is-icon.is-quiet", { type: "button", disabled: !!busy, title: filesOn ? "Clear — the conversation and its files" : "Clear the conversation", "aria-label": "Clear the conversation", on: { click: () => s.clear() } }, icon("trash")),
      h("button.key.is-sm.is-icon.is-quiet", { type: "button", title: "Fold — Esc", "aria-label": "Fold the conversation", on: { click: () => ((open = false), renderAssistant(el)) } }, icon("chevron"))),
    thread,
  );
  el.classList.toggle("is-open", open);
  // moving the composer drops its focus: keep the caret where it was, in the same task
  const typing = document.activeElement === c.input.el;
  const caret = [c.input.selectionStart, c.input.selectionEnd];
  el.replaceChildren(panel, c.el);
  if (typing) {
    c.input.focus({ preventScroll: true });
    c.input.setSelectionRange(...caret);
  }
  // drop files anywhere on the assistant, where it takes files
  el.ondragover = (e) => {
    if (!takesFiles() || ![...e.dataTransfer.types].includes("Files")) return;
    e.preventDefault();
    el.classList.add("is-drop");
  };
  el.ondragleave = (e) => !el.contains(e.relatedTarget) && el.classList.remove("is-drop");
  el.ondrop = (e) => {
    if (!takesFiles() || !e.dataTransfer.files.length) return;
    e.preventDefault();
    el.classList.remove("is-drop");
    if (onStage()) attachStagePictures([...e.dataTransfer.files]);
    else if (onToaster()) extrasOf("toaster").addPictures([...e.dataTransfer.files]);
    else attach([...e.dataTransfer.files]);
  };
  el.onkeydown = (e) => {
    if (e.key === "Escape" && open && composer.picker.hidden) {
      open = false;
      renderAssistant(el);
    }
  };
  // follow the conversation as it grows
  if (open && messages.length + (busy ? 1 : 0) !== seen) requestAnimationFrame(() => (thread.scrollTop = thread.scrollHeight));
  seen = messages.length + (busy ? 1 : 0);
}
