import { h, icon, sprite } from "../dom.js";
import { state, ask, undoAssistant, clearChat, attach, detach, mentions, mentionables, adopt } from "../store.js";
import { view } from "../viewer.js";

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
  adopt(name);
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

/** The files named in the message being typed get the accent outline, so you see which is which. */
function markMentioned() {
  const named = new Set(mentions(composer.input.value));
  composer.tray.querySelectorAll(".file-chip").forEach((chip) => chip.classList.toggle("is-mentioned", named.has(chip.dataset.name)));
}

// ---------------------------------------------------------------- composer

function makeComposer() {
  const input = h("textarea.chat-input", { rows: 1, placeholder: "Describe the shot · @ for a file", "aria-label": "Message the assistant" });
  const fileInput = h("input", { type: "file", multiple: true, hidden: true, accept: "image/*,video/mp4,video/webm,video/quicktime,audio/*,text/plain,text/markdown,.md,.txt,.json,.csv" });
  const grow = () => {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 132)}px`;
  };
  const send = () => {
    const text = input.value;
    if (!text.trim() || state.chat.busy) return;
    input.value = "";
    grow();
    composer.picker.hidden = true;
    markMentioned();
    open = true;
    ask(text);
  };
  input.addEventListener("input", () => (grow(), updatePicker(), markMentioned()));
  input.addEventListener("click", updatePicker);
  // a redraw blurs it for a moment; the picker only goes when the focus really left
  input.addEventListener("blur", () => setTimeout(() => document.activeElement !== input && (composer.picker.hidden = true), 120));
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
      attach(files);
    }
  });
  fileInput.addEventListener("change", () => (attach([...fileInput.files]), (fileInput.value = "")));
  const clip = h("button.composer-key", { type: "button", title: "Attach — images, videos, sounds or text; or drop them here", "aria-label": "Attach files", on: { click: () => fileInput.click() } }, sprite("paperclip"));
  const key = h("button.send", { type: "button", title: "Send — Enter", "aria-label": "Send", on: { click: send } }, sprite("send"));
  const tray = h("div.file-tray");
  const picker = h("div.mention-picker", { hidden: true, role: "listbox", "aria-label": "Files" });
  const toggle = h("button.composer-key.thread-key", { type: "button", "aria-label": "Conversation", on: { click: () => ((open = !open), renderAssistant(document.getElementById("assistant"))) } });
  const status = h("span.bar-status");
  const bar = h("div.chat-bar", {}, tray, h("div.bar-row", {}, clip, input, status, toggle, key));
  const el = h("div.composer", {}, picker, bar, fileInput);
  // the page keeps room for the bar at its real height, files and all
  new ResizeObserver(() => document.documentElement.style.setProperty("--chat-h", `${Math.ceil(bar.getBoundingClientRect().height)}px`)).observe(bar);
  composer = { el, input, key, tray, picker, toggle, status, pick: 0, list: [], filter: "image" };
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

function fileChip(f) {
  const look = f.kind === "image" ? () => view(f.url) : f.kind === "video" ? () => view(f.url, "video") : () => mention(f.name);
  return h("div.file-chip", { dataset: { name: f.name }, title: `${f.title ?? f.name} — ${describe(f)}` },
    h("button.chip-thumb", { type: "button", "aria-label": `Look at @${f.name}`, on: { click: look } }, thumb(f)),
    h("button.chip-name", { type: "button", "aria-label": `Mention @${f.name}`, on: { click: () => mention(f.name) } }, `@${f.name}`),
    h("button.chip-x", { type: "button", "aria-label": `Remove @${f.name}`, title: "Remove", on: { click: () => detach(f.name) } }, icon("close")),
  );
}

// ---------------------------------------------------------------- the thread

function message(m, last) {
  const files = (m.files ?? []).map((n) => state.chat.files.find((f) => f.name === n)).filter(Boolean);
  if (m.role === "user") {
    return h("div.msg.is-user", {},
      h("p", {}, m.text),
      files.length ? h("div.msg-files", {}, files.map((f) => h("span.msg-file", { title: `@${f.name}` }, thumb(f)))) : null);
  }
  return h("div.msg.is-ai", { className: m.error ? "is-error" : "" },
    h("p", {}, m.text),
    m.did?.length ? h("div.msg-chips", {}, m.did.map((d) => h("span.chip", {}, icon(d === "Undone" ? "remix" : "check"), d))) : null,
    last && m.undo ? h("button.key.is-sm.is-quiet.undo", { type: "button", title: "Put the shot back as it was", on: { click: () => undoAssistant(m) } }, icon("remix"), "Undo") : null,
  );
}

export function renderAssistant(el) {
  const { messages, busy, files, attaching } = state.chat;
  const c = composer ?? makeComposer();
  c.key.disabled = !!busy;
  c.tray.replaceChildren(...files.map(fileChip), ...(attaching ? [h("div.file-chip.is-loading", {}, h("span.typing", {}, h("i"), h("i"), h("i")))] : []));
  c.tray.hidden = !files.length && !attaching;
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
  const typing = document.activeElement === c.input;
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
    attach([...e.dataTransfer.files]);
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
