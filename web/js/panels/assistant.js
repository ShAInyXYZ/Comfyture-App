import { h, icon, sprite } from "../dom.js";
import {
  state, ask, askStage, renderStageImage, useStageRender, improveStageLook, setStageModel, stageModels, undoAssistant, undoStage, clearChat, attach, detach, mentions, mentionables, adopt, toast,
  attachPhoto, attachStageMap, setStageMap, addStagePicture, removeStagePicture, attachStagePictures,
} from "../store.js";
import { pillField, pillText } from "../pills.js";
import { attachMenu, MAPS, MAP_TAG, MAP_OF_TAG } from "../attach.js";
import { story, askStory, storyLookup, selectionLabel, select as selectInStory } from "../story.js";
import { cut, askCut } from "../cut.js";
import { dropdown } from "../controls.js";
import { view } from "../viewer.js";
import { currentPage } from "../router.js";
import { stageReady } from "../control/link.js";

// on the Stage the bar stages a scene; on the Shot it sets up the shot: one bar, two conversations
const onStage = () => currentPage() === "stage";
// on Story the bar changes the step that is open: "add a scene where she finds the jellyfish"
const onStory = () => currentPage() === "story";
// on Cut the bar asks the editor: "trim the first shot to 3 s and put rain under scene 2"
const onCut = () => currentPage() === "cut";
// the Stage, once it has mounted: who its @names are
let stageApi = null;
stageReady.then((a) => (stageApi = a));
const MAP_ICON = { id: "channel-id", depth: "channel-depth", pose: "channel-pose", normal: "view-normals", lines: "scene-render", mask: "material-mask", clay: "view-material" };

/** What an @name in the bar stands for, to draw its pill and its card. */
function lookup(name) {
  if (onStory()) return storyLookup(name);
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
const PLACEHOLDER = { shot: "Describe the shot · @ for a file", stage: "Stage a scene — two people arguing by a wall, low angle", story: "Ask the story assistant — add a scene where Mara finds the jellyfish", cut: "Ask the editor — trim the first shot to 3 s and put rain under scene 2" };

const KIND_ICON = { video: "video", audio: "sound" };

// the composer is made once and kept, so what you type, the caret and the focus survive every redraw
let composer = null;
let seen = 0;
// the conversation panel above the bar: open while you talk, folded away when you don't need it
let open = false;
let asked = 0;

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

/** The @word being typed at the caret, if any. */
function mentionAt(input) {
  const before = input.value.slice(0, input.selectionStart);
  const m = before.match(/(?:^|\s)@([a-z0-9-]*)$/i);
  return m ? { query: m[1].toLowerCase(), from: before.length - m[1].length - 1 } : null;
}

function insertMention(input, name) {
  const at = mentionAt(input);
  if (!at) return;
  if (!onStage()) adopt(name);
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
  if (onStage()) return updateStagePicker();
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

/** On the Stage: everyone whose name starts with what follows the @, then the maps and pictures. */
function updateStagePicker() {
  const c = composer;
  const at = mentionAt(c.input);
  const q = at?.query ?? "";
  const all = at ? stageMentionables() : [];
  const list = all.filter((f) => f.name.startsWith(q) || (q && f.title?.toLowerCase().includes(q))).slice(0, 40);
  const exact = list.length === 1 && list[0].name === q;
  c.pick = Math.min(c.pick, Math.max(0, list.length - 1));
  c.picker.hidden = !at || !list.length || exact;
  c.picker.replaceChildren(h("div.pick-grid.is-cast", {}, ...list.map((f, i) =>
    h("button.pick-file", { type: "button", className: i === c.pick ? "is-active" : "", title: f.title, on: { mousedown: (e) => (e.preventDefault(), insertMention(c.input, f.name)) } },
      h("span.pick-thumb", {}, f.url ? h("img", { src: f.url, alt: "", draggable: false }) : f.color ? h("i.pick-swatch", { style: { background: f.color } }) : sprite(MAP_ICON[f.map] ?? "file")),
      h("span.pick-name", {}, h("b", {}, `@${f.name}`), h("span", {}, f.title === f.name ? f.about : [f.title, f.about].filter(Boolean).join(" · ")))))));
  c.picker.querySelector(".pick-file.is-active")?.scrollIntoView({ block: "nearest" });
  c.list = list;
}

/** The files named in the message being typed get the accent outline, so you see which is which. */
function markMentioned() {
  const text = composer.input.value;
  const named = new Set(onStage() ? [...text.matchAll(/@([a-z0-9][a-z0-9-]*)/gi)].map((m) => m[1].toLowerCase()) : mentions(text));
  composer.tray.querySelectorAll(".file-chip").forEach((chip) => chip.classList.toggle("is-mentioned", named.has(chip.dataset.name)));
}

// ---------------------------------------------------------------- composer

function makeComposer() {
  const input = pillField({ placeholder: "Describe the shot · @ for a file", label: "Message the assistant", lookup, className: "chat-input" });
  const fileInput = h("input", { type: "file", multiple: true, hidden: true, accept: "image/*,video/mp4,video/webm,video/quicktime,audio/*,text/plain,text/markdown,.md,.txt,.json,.csv" });
  // the field grows with its words, up to its CSS height
  const grow = () => {};
  const send = () => {
    const text = input.value;
    if (onStory()) {
      if (!text.trim() || story.busy.has("assist")) return;
      input.value = "";
      open = true;
      return askStory(text);
    }
    if (onCut()) {
      if (!text.trim() || cut.chat.busy) return;
      input.value = "";
      open = true;
      return askCut(text);
    }
    if (!text.trim() || (onStage() ? state.stageChat.busy : state.chat.busy)) return;
    input.value = "";
    grow();
    composer.picker.hidden = true;
    markMentioned();
    open = true;
    if (onStage()) askStage(text);
    else ask(text);
  };
  input.addEventListener("input", () => (grow(), updatePicker(), markMentioned()));
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
    if (files.length) {
      e.preventDefault();
      if (onStage()) attachStagePictures(files);
      else attach(files);
    }
  });
  fileInput.addEventListener("change", () => (attach([...fileInput.files]), (fileInput.value = "")));
  // the paperclip opens its two frames: files (from the computer, or the Library), and the Stage's control maps
  const clip = h("button.composer-key.clip-key", { type: "button", title: "Attach — a file, a picture from the Library, or a control map of the Stage", "aria-label": "Attach", "aria-expanded": "false" }, sprite("paperclip"));
  clip.addEventListener("click", () => {
    const inputs = state.stageChat.inputs;
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
        undo.hidden = false;
      } catch (error) {
        toast(error.message ?? String(error), { tone: "crit" });
      } finally {
        composer.improving = false;
        improve.classList.remove("is-busy");
      }
    } },
  }, sprite("prompt-enhance"));
  const undo = h("button.composer-key.stage-only", { type: "button", hidden: true, title: "Put my words back", "aria-label": "Put my words back", on: { click: () => ((input.value = composer.before ?? ""), grow(), forget()) } }, icon("remix"));
  const forget = () => {
    composer.improved = false;
    composer.before = null;
    undo.hidden = true;
  };
  const tray = h("div.file-tray");
  const picker = h("div.mention-picker", { hidden: true, role: "listbox", "aria-label": "Files" });
  const toggle = h("button.composer-key.thread-key", { type: "button", "aria-label": "Conversation", on: { click: () => ((open = !open), renderAssistant(document.getElementById("assistant"))) } });
  const status = h("span.bar-status");
  const bar = h("div.chat-bar", {}, tray, input.el, h("div.bar-row", {}, clip, render, modelSlot, improve, undo, h("span.spacer"), status, toggle, key));
  const el = h("div.composer", {}, picker, bar, fileInput);
  // the page keeps room for the bar at its real height, files and all
  new ResizeObserver(() => document.documentElement.style.setProperty("--chat-h", `${Math.ceil(bar.getBoundingClientRect().height)}px`)).observe(bar);
  composer = { el, input, key, render, modelSlot, improve, tray, picker, toggle, status, pick: 0, list: [], filter: "image", improved: false, before: null };
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
    h("button.msg-render-look", { type: "button", title: onStage() ? "Show it from its camera, over the stage" : "Look at it", "aria-label": "Look at the picture", on: { click: () => (onStage() ? stageReady.then((api) => api.viewRun(id)) : view(r.photo.url)) } }, h("img", { src: r.photo.url, alt: "", draggable: false })),
    h("button.msg-render-use", { type: "button", title: "Start a shot from it", "aria-label": "Start a shot from it", on: { click: () => useStageRender(r.photo) } }, icon("video")));
}

function message(m, last) {
  const files = (m.files ?? []).map((n) => state.chat.files.find((f) => f.name === n)).filter(Boolean);
  if (m.stage && m.role === "assistant") {
    return h("div.msg.is-ai", { className: m.error ? "is-error" : "" },
      h("p", {}, m.text),
      m.renders?.length ? h("div.msg-renders", {}, m.renders.map(renderTile)) : null,
      m.did?.length || m.failed?.length
        ? h("div.msg-chips", {},
          ...(m.did ?? []).map((d) => h("span.chip", {}, icon(d === "Undone" ? "remix" : "check"), d)),
          ...(m.failed ?? []).map((f) => h("span.chip.is-failed", { title: f }, icon("close"), f.split(":")[0].replace(/_/g, " "))))
        : null,
      last && m.undo ? h("button.key.is-sm.is-quiet.undo", { type: "button", title: "Put the stage back as it was", on: { click: () => undoStage(m) } }, icon("remix"), "Undo") : null);
  }
  if (m.role === "user") {
    return h("div.msg.is-user", {},
      m.about ? h("span.msg-about", {}, m.about) : null,
      pillText("p", m.text, lookup),
      files.length ? h("div.msg-files", {}, files.map((f) => h("span.msg-file", { title: `@${f.name}` }, thumb(f)))) : null);
  }
  return h("div.msg.is-ai", { className: m.error ? "is-error" : "" },
    h("p", {}, m.text),
    m.did?.length ? h("div.msg-chips", {}, m.did.map((d) => h("span.chip", {}, icon(d === "Undone" ? "remix" : "check"), d))) : null,
    last && m.undo ? h("button.key.is-sm.is-quiet.undo", { type: "button", title: "Put the shot back as it was", on: { click: () => undoAssistant(m) } }, icon("remix"), "Undo") : null,
  );
}

// a picture shown over the Stage's frame asks for room
document.addEventListener("assistant:fold", () => {
  if (!open) return;
  open = false;
  renderAssistant(document.getElementById("assistant"));
});

export function renderAssistant(el) {
  const stage = onStage();
  const storyPage = onStory();
  const writing = [...story.busy].find((k) => !k.includes(":"));
  const cutPage = onCut();
  const { messages, busy } = storyPage ? { messages: story.chat.messages, busy: story.busy.has("assist") ? "Editing" : writing ? "Writing" : null } : cutPage ? cut.chat : stage ? state.stageChat : state.chat;
  const { files, attaching } = state.chat;
  const c = composer ?? makeComposer();
  c.key.disabled = !!busy;
  c.render.disabled = !!busy;
  if (stage) {
    const models = stageModels();
    const value = state.stageModel && models.some((m) => m.id === state.stageModel) ? state.stageModel : state.image.catalogue?.default ?? models[0]?.id;
    c.modelSlot.replaceChildren(...(models.length > 1 ? [dropdown({ label: "Image model", value, items: models.map((m) => ({ value: m.id, label: m.name, desc: m.about })), onChange: (id) => setStageModel(id) })] : []));
  }
  c.input.placeholder = PLACEHOLDER[storyPage ? "story" : cutPage ? "cut" : stage ? "stage" : "shot"];
  if (storyPage || cutPage) c.modelSlot.replaceChildren(h("span.chip.composer-chip", { title: storyPage ? "The story is written by Gemma 4, in ComfyUI" : "The editor is Gemma 4, in ComfyUI" }, sprite("prompt-enhance"), "Gemma 4"));
  const inputs = state.stageChat.inputs;
  c.tray.replaceChildren(...(stage ? [...inputs.maps.map(mapChip), ...inputs.pictures.map(stagePictureChip)] : files.map(fileChip)), ...(!stage && attaching ? [h("div.file-chip.is-loading", {}, h("span.typing", {}, h("i"), h("i"), h("i")))] : []));
  // on Story, what the assistant will edit: the block (or the card) that is picked
  if (storyPage) {
    const label = selectionLabel();
    c.tray.replaceChildren(...(label ? [h("div.file-chip.is-context", { title: "The assistant edits what is picked; it knows the whole story" }, h("span.chip-thumb.is-glyph", {}, sprite("prompt-enhance")), h("span.chip-name", {}, `Editing: ${label}`), h("button.chip-x", { type: "button", "aria-label": "Edit the whole story", title: "The whole story", on: { click: () => selectInStory(null) } }, icon("close")))] : []));
  }
  c.tray.hidden = storyPage ? !selectionLabel() : cutPage || (stage ? !inputs.maps.length && !inputs.pictures.length : !files.length && !attaching);
  c.el.classList.toggle("is-story", storyPage);
  c.el.classList.toggle("is-cut", cutPage);
  c.input.refresh();
  c.el.classList.toggle("is-stage", stage);
  markMentioned();
  // a new answer opens the conversation, so its changes and its Undo are in view
  const answers = messages.filter((m) => m.role === "assistant").length;
  if (answers > asked && asked !== 0) open = true;
  asked = answers || -1;
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
    messages.map((m, i) => message(m, i === lastAi)),
    busy ? h("div.msg.is-ai.is-busy", {}, h("span.typing", {}, h("i"), h("i"), h("i")), busy) : null,
  );
  const panel = h("div.chat-panel", { hidden: !open },
    h("div.panel-keys", {},
      h("button.key.is-sm.is-icon.is-quiet", { type: "button", disabled: !!busy, title: "Clear — the conversation and its files", "aria-label": "Clear the conversation", on: { click: clearChat } }, icon("trash")),
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
  // drop files anywhere on the assistant
  el.ondragover = (e) => {
    if (![...e.dataTransfer.types].includes("Files")) return;
    e.preventDefault();
    el.classList.add("is-drop");
  };
  el.ondragleave = (e) => !el.contains(e.relatedTarget) && el.classList.remove("is-drop");
  el.ondrop = (e) => {
    if (!e.dataTransfer.files.length) return;
    e.preventDefault();
    el.classList.remove("is-drop");
    if (onStage()) attachStagePictures([...e.dataTransfer.files]);
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
