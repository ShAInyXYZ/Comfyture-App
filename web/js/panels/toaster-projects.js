// Toaster's projects: a bar over the page, as the Stage has, with the projects open as tabs (their picture, their name, a lamp that
// says they are saved) and the keys that keep them (Your projects, Save a copy, Export, Import, Delete). Ctrl+S keeps the project now.
import { h, icon, sprite, ago } from "../dom.js";
import { toast, onChange } from "../store.js";
import { currentPage } from "../router.js";
import { toaster, openDraft, newDraft, removeDraft, renameDraft, duplicateDraft, exportDraft, importDraft, saveNow } from "../toaster.js";

const TABS = "comfyture.toaster.tabs";
const read = (k) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k, v) => {
  try {
    localStorage.setItem(k, v);
  } catch {}
};

let bar = null;
// the ids of the projects open as tabs, in their order
let tabs = (() => {
  try {
    const t = JSON.parse(read(TABS) || "[]");
    return Array.isArray(t) ? t.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
})();
let lastOpen = null;
let renaming = false;
let shownKey = "";
let preview = null;

const fail = (e) => toast(e.message, { tone: "crit" });
const hidePreview = () => (preview?.remove(), (preview = null));
const clock = (t) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** An icon key of the bar, its words in the tooltip. */
const key = (glyph, label, run) => h("button.key.is-icon.ts-project-key", { type: "button", title: label, "aria-label": label, on: { click: run } }, glyph);
/** A delete key that asks twice: the first click arms it for 2.5 s. */
function deleteKey(label, run) {
  let armed = 0;
  const k = key(icon("trash"), label, () => {
    if (Date.now() - armed > 2500) {
      armed = Date.now();
      k.setAttribute("aria-pressed", "true");
      setTimeout(() => k.setAttribute("aria-pressed", "false"), 2500);
      return toast("Click once more to delete.");
    }
    armed = 0;
    run();
  });
  return k;
}

/** The bar, made once: the tabs, then `extra` (the page's own keys: Scene or Render), then the projects' keys. */
export function projectBar(extra = []) {
  if (bar) return bar.el;
  const lampEl = h("span.lamp.ts-saved", { role: "status", "data-tooltip": "Not saved yet" });
  const tabsEl = h("nav.tabs.ts-tabs", { "aria-label": "Projects" });
  const del = deleteKey("Delete this project — click twice", () => remove(toaster.draft?.id).catch(fail));
  const keys = h("div.subbar-actions.ts-bar-keys", { role: "toolbar", "aria-label": "Project" }, ...extra,
    key(icon("grid"), "Your projects", () => browse().catch(fail)),
    key(sprite("copy"), "Save a copy — a project of its own, with the same parts", () => duplicate().catch(fail)),
    key(sprite("export"), "Export to share — one file; it refers to this Library's pictures", () => exportDraft().catch(fail)),
    key(sprite("import"), "Import a project someone shared", importFile),
    del);
  tabsEl.onwheel = (e) => {
    if (tabsEl.scrollWidth <= tabsEl.clientWidth || Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
    tabsEl.scrollLeft += e.deltaY;
    e.preventDefault();
  };
  bar = { el: h("div.subbar.ts-subbar", {}, h("div.subbar-in", {}, tabsEl, keys)), tabsEl, lampEl };
  return bar.el;
}

// ---------------------------------------------------------------- the tabs

function showPreview(p, tab) {
  hidePreview();
  if (!p.thumb) return;
  const box = tab.getBoundingClientRect();
  preview = h("div.tab-preview.is-stage", { style: { left: `${Math.min(innerWidth - 256, box.left)}px`, top: `${box.bottom + 8}px` } },
    h("img", { src: p.thumb, alt: "" }), h("b", {}, p.name, h("span", {}, ago(p.updatedAt))));
  document.body.append(preview);
}

function renameField(p) {
  const input = h("input.tab-rename", { value: p.name, maxLength: 60, "aria-label": "Project name" });
  const done = (keep) => {
    if (!renaming) return;
    renaming = false;
    if (keep) renameDraft(input.value);
    drawProjectBar(true);
  };
  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") done(true);
    if (e.key === "Escape") done(false);
  });
  input.addEventListener("blur", () => done(true));
  input.addEventListener("click", (e) => e.stopPropagation());
  requestAnimationFrame(() => (input.focus(), input.select()));
  return input;
}

function tabEl(row) {
  const active = row.id === toaster.draft?.id;
  const tab = h("div.tab.ts-tab", {
    role: "tab",
    tabindex: "0",
    "aria-selected": String(active),
    title: active ? "Double-click to rename" : undefined,
    on: {
      click: () => !active && openDraft(row.id).catch(fail),
      dblclick: () => active && !renaming && ((renaming = true), hidePreview(), drawProjectBar(true)),
      keydown: (e) => (e.key === "Enter" || e.key === " ") && e.target === tab && (e.preventDefault(), tab.click()),
    },
  },
    row.thumb ? h("img.tab-thumb", { src: row.thumb, alt: "", draggable: false }) : h("span.tab-thumb.is-icon", {}, sprite("product-toaster")),
    active && renaming ? renameField(row) : h("span.tab-name", {}, row.name),
    active ? bar.lampEl : null,
    tabs.length > 1 ? h("span.tab-close", { role: "button", "aria-label": `Close ${row.name}`, title: "Close the tab — the project is kept", on: { click: (e) => (e.stopPropagation(), closeTab(row.id).catch(fail)) } }, icon("close")) : null);
  tab.addEventListener("pointerenter", () => !renaming && showPreview(row, tab));
  tab.addEventListener("pointerleave", hidePreview);
  return tab;
}

/** The bar drawn again from what Toaster holds: the tabs, which is open, whether it is saved. */
export function drawProjectBar(force = false) {
  if (!bar) return;
  const d = toaster.draft;
  const l = bar.lampEl;
  const s = toaster.saving;
  l.dataset.tone = s.tone;
  l.dataset.tooltip = s.tone === "busy" ? "Changed — saving in a moment" : s.tone === "crit" ? s.error ?? "Could not be saved" : `Saved ${clock(s.at)}`;
  if (!d) return;
  // the open project is always a tab, next to the one that was open
  if (!tabs.includes(d.id)) {
    const at = tabs.indexOf(lastOpen);
    tabs.splice(at < 0 ? tabs.length : at + 1, 0, d.id);
  }
  lastOpen = d.id;
  tabs = tabs.filter((id) => toaster.list.some((r) => r.id === id));
  write(TABS, JSON.stringify(tabs));
  const rows = tabs.map((id) => toaster.list.find((r) => r.id === id));
  const sig = JSON.stringify([d.id, renaming, rows.map((r) => [r.id, r.name, r.thumb?.length ?? 0])]);
  if (!force && sig === shownKey) return;
  shownKey = sig;
  hidePreview();
  bar.tabsEl.replaceChildren(h("div.tablist", { role: "tablist", "aria-label": "Projects" }, ...rows.map(tabEl)),
    h("button.tab-add", { type: "button", title: "A new, empty project in its own tab", on: { click: () => newDraft().catch(fail) } }, icon("plus"), "New project"));
  bar.tabsEl.classList.toggle("is-overflowing", bar.tabsEl.scrollWidth > bar.tabsEl.clientWidth + 1);
  bar.tabsEl.querySelector('.tab[aria-selected="true"]')?.scrollIntoView({ inline: "nearest", block: "nearest" });
}
// the lamp and the tabs follow the drafts without the page redrawing
onChange((scopes) => scopes.has("toaster-saved") && drawProjectBar());

// ---------------------------------------------------------------- the keys

/** The tab goes, the project stays (in Your projects); the one beside it opens. */
async function closeTab(id) {
  if (tabs.length < 2) return;
  const at = tabs.indexOf(id);
  tabs.splice(at, 1);
  if (id === toaster.draft?.id) await openDraft(tabs[at] ?? tabs[at - 1]);
  else drawProjectBar(true);
}

/** The project goes; the tab beside it opens (else the newest project). */
async function remove(id) {
  if (!id) return;
  const row = toaster.list.find((r) => r.id === id);
  const at = tabs.indexOf(id);
  const next = tabs[at + 1] ?? tabs[at - 1];
  tabs = tabs.filter((x) => x !== id);
  if (id === toaster.draft?.id && next) await openDraft(next);
  await removeDraft(id);
  drawProjectBar(true);
  toast(`"${row?.name ?? "The project"}" is deleted.`);
}

async function duplicate() {
  const from = toaster.draft?.name;
  await duplicateDraft();
  if (from) toast(`"${toaster.draft.name}" is a copy you can change freely.`);
}

function importFile() {
  const input = h("input", { type: "file", accept: ".json,application/json", hidden: true });
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    input.remove();
    if (!file) return;
    try {
      const d = await importDraft(file);
      toast(`"${d.name}" is open.`);
    } catch (e) {
      fail(e);
    }
  });
  document.body.append(input);
  input.click();
}

/** Your projects, each with its picture, in a window over the page: one opens in a tab. */
async function browse() {
  await saveNow();
  const d = h("dialog.dialog.ctl-projects-window.ts-projects-window", {});
  const card = (p) => {
    const open = h("button.ctl-project-card", { type: "button", "aria-pressed": String(p.id === toaster.draft?.id), title: `Open "${p.name}"`, on: { click: () => (d.close(), openDraft(p.id).catch(fail)) } },
      p.thumb ? h("img", { src: p.thumb, alt: "", draggable: false }) : h("span.ctl-project-blank", {}, sprite("product-toaster")),
      h("span.ctl-project-name-line", {}, p.name), h("span.ctl-project-when", {}, ago(p.updatedAt)));
    const del = deleteKey(`Delete "${p.name}" — click twice`, async () => {
      await remove(p.id).catch(fail);
      grid.replaceChildren(...toaster.list.map(card));
    });
    del.classList.add("ts-card-delete");
    return h("div.ts-project-card", {}, open, del);
  };
  const grid = h("div.ctl-projects-grid", {}, ...toaster.list.map(card));
  d.append(
    h("div.ctl-projects-head", {}, h("h2", {}, "Your projects"),
      h("div.ctl-project-keys", {},
        key(icon("plus"), "New project", () => (d.close(), newDraft().catch(fail))),
        key(sprite("import"), "Import a project someone shared", () => (d.close(), importFile())),
        key(icon("close"), "Close", () => d.close()))),
    grid);
  d.addEventListener("close", () => d.remove());
  d.addEventListener("click", (e) => e.target === d && d.close());
  document.body.append(d);
  d.showModal();
}

// Ctrl+S (or Cmd+S) on Toaster's page keeps the project now, even while a field is being typed in; the browser's own dialog never shows
window.addEventListener("keydown", (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || e.key.toLowerCase() !== "s" || currentPage() !== "toaster") return;
  e.preventDefault();
  saveNow().then((ok) => ok && toast("Saved"));
});
