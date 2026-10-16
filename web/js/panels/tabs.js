import { h, icon } from "../dom.js";
import { state, switchTab, closeTab, moveTab, newTab, editFromTabs, filmTakes } from "../store.js";

const STATE_TONE = { queued: "busy", frame: "busy", shot: "busy", review: "warn", done: "ok", failed: "crit" };
let preview = null;
let lastActive = null;
// a tab that didn't change keeps its element, so its hover preview stays open while takes render
const built = new Map();

const runOf = (tab) => state.runs.find((r) => r.id === tab.run) ?? null;

function thumb(tab) {
  const run = runOf(tab);
  const src = run?.frame ?? (run?.request.start ? `media/photos/${run.request.start}` : tab.draft.start?.url);
  if (run?.status === "done") return h("video.tab-thumb", { src: `${run.video}#t=0.5`, muted: true, preload: "metadata", draggable: false });
  if (src) return h("img.tab-thumb", { src, alt: "", draggable: false });
  return h("span.tab-thumb.is-icon", {}, icon(tab.id === "draft" ? "pencil" : "play"));
}

/** A floating card under the tab: the take playing, its length and what it is about. */
function showPreview(tab, el) {
  hidePreview();
  const run = runOf(tab);
  if (!run) return;
  const box = el.getBoundingClientRect();
  preview = h("div.tab-preview", { style: { left: `${Math.min(innerWidth - 256, box.left)}px`, top: `${box.bottom + 8}px` } },
    run.status === "done"
      ? h("video", { src: run.video, muted: true, autoplay: true, loop: true, playsInline: true })
      : h("img", { src: run.frame ?? (run.request.start ? `media/photos/${run.request.start}` : ""), alt: "" }),
    h("b", {}, run.request.name, h("span", {}, `${(run.length ?? run.request.seconds).toFixed(1)} s`)),
    h("p", {}, run.prompt),
  );
  document.body.append(preview);
}

function hidePreview() {
  preview?.remove();
  preview = null;
}

function tabEl(tab, n) {
  const run = runOf(tab);
  const isDraft = tab.id === "draft";
  const name = isDraft ? "Draft" : run ? (run.takes > 1 ? `${run.request.name} · ${run.take}` : run.request.name) : tab.draft.name;
  const tone = run ? STATE_TONE[run.status] : null;
  const el = h("button.tab", {
    type: "button",
    role: "tab",
    "aria-selected": String(tab.id === state.tab),
    draggable: !isDraft,
    title: isDraft ? "Your own inputs and settings. Every take you open gets its own tab, so you can always come back here." : undefined,
    on: { click: () => switchTab(tab.id) },
  },
    thumb(tab),
    isDraft ? null : h("span.tab-num", {}, String(n)),
    h("span.tab-name", {}, name),
    tone ? h("span.lamp", { dataset: { tone } }) : null,
    isDraft ? null : h("span.tab-close", { role: "button", "aria-label": `Close ${name}`, on: { click: (e) => (e.stopPropagation(), hidePreview(), closeTab(tab.id)) } }, icon("close")),
  );
  el.addEventListener("pointerenter", () => !isDraft && showPreview(tab, el));
  el.addEventListener("pointerleave", hidePreview);
  // drag to reorder: the order is the film's order
  el.addEventListener("dragstart", (e) => {
    hidePreview();
    e.dataTransfer.setData("text/comfyture-tab", tab.id);
    e.dataTransfer.effectAllowed = "move";
    el.classList.add("is-dragging");
  });
  el.addEventListener("dragend", () => el.classList.remove("is-dragging"));
  el.addEventListener("dragover", (e) => {
    if (!e.dataTransfer.types.includes("text/comfyture-tab") || isDraft) return;
    e.preventDefault();
    el.classList.add("is-drop-before");
  });
  el.addEventListener("dragleave", () => el.classList.remove("is-drop-before"));
  el.addEventListener("drop", (e) => {
    e.preventDefault();
    el.classList.remove("is-drop-before");
    moveTab(e.dataTransfer.getData("text/comfyture-tab"), tab.id);
  });
  return el;
}

const tabSig = (tab, n) => {
  const run = runOf(tab);
  return JSON.stringify([n, tab.id === state.tab, tab.draft.name, tab.draft.start?.url, run?.status, run?.video, run?.frame, run?.request.name]);
};

export function renderTabs(el) {
  const hovered = preview && state.tabs.some((t) => built.get(t.id)?.el.matches(":hover"));
  if (!hovered) hidePreview();
  // the tabs a Director film made sit together under its title
  const nodes = [];
  let group = null;
  state.tabs.forEach((t, i) => {
    const sig = tabSig(t, i);
    let node = built.get(t.id);
    if (node?.sig !== sig) {
      node = { sig, el: tabEl(t, i) };
      built.set(t.id, node);
    }
    if (t.film) {
      if (group?.film !== t.film) {
        group = { film: t.film, el: h("div.tab-group", { title: `Made by the Director: ${t.film}` }, h("span.tab-group-name", {}, icon("sparkle"), t.film)) };
        nodes.push(group.el);
      }
      group.el.append(node.el);
    } else {
      group = null;
      nodes.push(node.el);
    }
  });
  for (const id of built.keys()) if (!state.tabs.some((t) => t.id === id)) built.delete(id);
  el.replaceChildren(...nodes,
    h("button.tab-add", { type: "button", title: "A new, empty shot in its own tab", on: { click: newTab } }, icon("plus"), "New shot"));
  // a drop past the last tab moves it to the end
  el.ondragover = (e) => e.dataTransfer.types.includes("text/comfyture-tab") && e.preventDefault();
  el.ondrop = (e) => {
    if (e.target.closest(".tab")) return;
    e.preventDefault();
    moveTab(e.dataTransfer.getData("text/comfyture-tab"), null);
  };
  // more tabs than room: fade the edge, scroll with the wheel, keep the open tab in view
  el.onwheel = (e) => {
    if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
    el.scrollLeft += e.deltaY;
    e.preventDefault();
  };
  el.classList.toggle("is-overflowing", el.scrollWidth > el.clientWidth + 1);
  if (lastActive !== state.tab) {
    lastActive = state.tab;
    el.querySelector('.tab[aria-selected="true"]')?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }
}

/** What you do with the shots in the tabs: send their takes on to Edit, where they become a film. */
export function renderActions(el) {
  const n = filmTakes().length;
  el.replaceChildren(
    h("button.key.film-key", {
      type: "button",
      disabled: n < 1,
      className: n >= 2 ? "is-primary" : false,
      title: n < 1 ? "Open finished takes in tabs, then send them to Edit to cut them into a film." : "Send the takes of these tabs to Edit, in tab order",
      on: { click: editFromTabs },
    }, icon("scissors"), n >= 1 ? `Edit ${n} take${n > 1 ? "s" : ""}` : "Edit takes", icon("arrow")),
  );
}
