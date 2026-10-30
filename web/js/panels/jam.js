// Jam's screen: project and workspaces on the left, the active studio beside them,
// and Pickle's chat bar at the foot. Backstage prepares visuals; Words styles synced
// captions; Edit assembles both over the song. Paid generation requires confirmation.
import { h, ago } from "../dom.js";
import { state, changed, toast, onChange } from "../store.js";
import { currentPage } from "../router.js";
import { jam, loadJams, openJam, newJam, removeJam, rename, setWorkspace, statusOf, lampsOf, pipeline, useTrack, setArtist, setDance, edit } from "../jam.js";
import { cut, filmLength } from "../cut.js";
import { lyricItems } from "../edit.js";
import { setRoom } from "../harnesses.js";
import { editorParts, drawEditor, editor } from "./editor.js";
import { WORKSPACES } from "../jam-harness.js";
import { jicon, drawWindow } from "./jam-ui.js";
import { trackWorkspace, stopRecord } from "./jam-track.js";
import { wordsWorkspace, updateWordsPlayback } from "./jam-words.js";
import { backstageWorkspace } from "./jam-backstage.js";
import { bandWorkspace } from "./jam-band.js";
import { editWorkspace } from "./jam-edit.js";
import { songWorkspace, pauseSong, bringSong } from "./jam-song.js";

const VIEWS = { track: trackWorkspace, backstage: backstageWorkspace, words: wordsWorkspace, band: bandWorkspace, edit: editWorkspace };
const TILE_ICON = { song: "note", track: "disc", backstage: "image", words: "notepad", band: "band", edit: "scissors" };

let menu = false; // the jam chip's menu, open or not
let armed = null; // a jam asked to be deleted: the second press does it

// ---------------------------------------------------------------- Pickle's panel

function jamMenu(j) {
  const close = () => ((menu = false), changed("jam"));
  return h("div.jm-menu", { role: "menu", "aria-label": "Your jams" },
    j ? h("input.jm-menu-name", { value: j.name, "aria-label": "This jam's name", dataset: { focus: `name:${j.id}` }, on: { input: (e) => rename(e.target.value), keydown: (e) => { e.stopPropagation(); if (e.key === "Enter" || e.key === "Escape") { e.target.blur(); close(); } } } }) : null,
    h("div.jm-menu-list", { dataset: { scrollKey: "jm-menu" } },
      ...jam.list.map((row) =>
        h(`div.jm-menu-row${row.id === j?.id ? ".is-on" : ""}`, { role: "none" },
          h("button.jm-menu-open", { type: "button", role: "menuitem", title: row.name, on: { click: () => (openJam(row.id), close()) } },
            h("img", { src: row.thumb ?? "img/jam/stage.svg", alt: "", draggable: false, loading: "lazy" }),
            h("span", {}, h("b", {}, row.name), h("em", {}, ago(row.updatedAt)))),
          h(`button.jm-menu-x${armed === row.id ? ".is-armed" : ""}`, { type: "button", title: armed === row.id ? "Click again to delete it" : "Delete this jam", "aria-label": `Delete ${row.name}`, on: { click: () => (armed === row.id ? ((armed = null), removeJam(row.id)) : ((armed = row.id), changed("jam"), setTimeout(() => armed === row.id && ((armed = null), changed("jam")), 3000))) } }, jicon("trash"))))),
    h("button.jm-menu-new", { type: "button", role: "menuitem", on: { click: () => (newJam(), close()) } }, jicon("plus"), "New jam"));
}

/** A lamp: done (a tick), next (a ring lit), waiting (a ring). */
const lamp = (state) => h("span.jm-lamp", { dataset: { state }, "aria-hidden": "true" }, state === "done" ? jicon("check") : null);

/**
 * The album at the head of the panel: the video's card, square, its song's cover (else the picture the video wears in the set list)
 * with its name on it, as the sleeves of Your songs wear theirs. It is the jam picker: pressed, it opens your jams. It is as large as
 * the panel's free room allows.
 */
function albumCard(j) {
  const src = j ? j.body.track?.cover ?? j.thumb : null;
  const name = j ? j.body.track?.name ?? j.name : "No jam yet";
  const hue = [...(name ?? "")].reduce((t, ch) => (t * 31 + ch.charCodeAt(0)) % 360, 17);
  const secs = j ? Math.round(filmLength() || Number(j.body.part?.seconds) || 0) : 0;
  return h("section.jm-album", { "aria-label": "Album" },
    h("span.jm-album-label", {}, "Album"),
    h("div.jm-cover", {},
      h("div.jm-album-card", {},
        h(`button.jm-cover-art${src ? ".has-cover" : ""}`, { type: "button", style: { "--hue": String(hue) }, "aria-haspopup": "menu", "aria-expanded": String(menu), title: `${name}\nYour jams`, "aria-label": `${name}: your jams`, on: { click: () => ((menu = !menu), changed("jam")) } },
          src ? h("img", { src, alt: "", draggable: false }) : h("span.jm-cover-jar", {}, jicon("jar")),
          h("span.jm-cover-label", {}, h("span", {}, h("b", {}, name), secs ? h("em", {}, `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`) : null), jicon("caret"))),
        menu ? jamMenu(j) : null)));
}

function side(j) {
  const status = statusOf(j);
  const lamps = lampsOf(j);
  const steps = pipeline(j);
  return h("aside.jm-side", { "aria-label": "Pickle's panel" },
    albumCard(j),
    h("nav.jm-tiles", { "aria-label": "Workspaces" }, ...WORKSPACES.map((w) =>
      h(`button.jm-tile${jam.workspace === w.id ? ".is-on" : ""}`, { type: "button", "aria-current": jam.workspace === w.id ? "page" : "false", dataset: { workspace: w.id, lamp: lamps[w.id] }, on: { click: () => setWorkspace(w.id) } },
        h("span.jm-tile-ic", {}, jicon(TILE_ICON[w.id])),
        h("span.jm-tile-text", {}, h("b", {}, w.name), h("em", {}, status[w.id])),
        jam.workspace === w.id ? jicon("next") : lamp(lamps[w.id])))),
    h("section.jm-pipe", { "aria-label": "Jam status" },
      h("span.jm-pipe-label", {}, "Jam status"),
      h("ol.jm-pipe-list", {}, ...steps.map((st) =>
        h("li", { dataset: { state: st.state } },
          h("button.jm-step", { type: "button", title: st.state === "done" ? `${st.label}: open it` : st.state === "next" ? `Next: ${st.label}` : st.label, on: { click: () => setWorkspace(st.open) } },
            lamp(st.state), h("span", {}, st.label), st.state === "next" ? h("em", {}, "Next") : null))))),
    h("div.jm-credits", { title: "Review estimates before generation. Backstage saves each asset’s model, settings and elapsed time; unavailable actual billing is labelled explicitly." },
      h("span", {}, "Generation costs"),
      h("b", {}, "Per asset")));
}

// ---------------------------------------------------------------- the page: built once, redrawn in parts

let page = null;
function buildPage(el) {
  const parts = editorParts();
  const sideSlot = h("div.jm-side-slot");
  const title = h("h1.jm-h1");
  const tag = h("p.jm-tag");
  const grid = h("div.jm-grid");
  const chat = h("div.jm-chat#jam-chat");
  const root = h("div.jam", {}, sideSlot, h("div.jm-main", {}, h("header.jm-head", {}, title, tag), grid, chat));
  el.replaceChildren(root);
  page = { el, root, side: sideSlot, title, tag, grid, chat, parts };
}

export function renderJam(el) {
  loadJams();
  const j = jam.jam;
  const b = j?.body;
  if (!page || page.el !== el || !el.contains(page.root)) buildPage(el);
  const active = document.activeElement;
  const focus = el.contains(active) ? active.dataset.focus : null;
  const sel = focus ? [active.selectionStart, active.selectionEnd] : null;
  const scrolls = [...el.querySelectorAll("[data-scroll-key]")].map((n) => [n.dataset.scrollKey, n.scrollLeft, n.scrollTop]);
  const editing = !!b?.part && cut.project?.id === b.cut;
  const ws = WORKSPACES.find((w) => w.id === jam.workspace) ?? WORKSPACES[0];
  page.side.replaceChildren(side(j));
  page.title.textContent = ws.title;
  page.tag.replaceChildren(...ws.tag.map((t) => h("span", {}, t)));
  setRoom("jam", ws.id);
  page.grid.className = `jm-grid is-${ws.id}`;
  if (ws.id === "song") {
    // the song page keeps its own elements (its fields, its record, the song that plays): they are put in the grid once
    const root = songWorkspace();
    if (page.grid.firstElementChild !== root || page.grid.childElementCount !== 1) page.grid.replaceChildren(root);
  } else {
    pauseSong();
    page.grid.replaceChildren(...VIEWS[ws.id]({ j, b, editing, parts: page.parts }).filter(Boolean));
  }
  page.root.dataset.workspace = ws.id;
  if (ws.id !== "track") stopRecord();
  if (editing) {
    drawEditor("jam");
    // the timeline fits the film when it is first on show (it had no width while another workspace was open)
    if (ws.id === "edit" && page.fitted !== cut.project.id) {
      page.fitted = cut.project.id;
      requestAnimationFrame(() => editor.fit());
    }
  } else if (b?.part) edit(j).then(() => changed("jam")).catch(() => {});
  drawWindow();
  for (const [key, left, top] of scrolls) {
    const n = el.querySelector(`[data-scroll-key="${CSS.escape(key)}"]`);
    if (n) (n.scrollLeft = left), (n.scrollTop = top);
  }
  if (focus) {
    const back = document.querySelector(`[data-focus="${CSS.escape(focus)}"]`);
    back?.focus({ preventScroll: true });
    if (back && sel && back.setSelectionRange) try { back.setSelectionRange(...sel); } catch {}
  }
  document.dispatchEvent(new Event("jam:drawn"));
}

// the editor changed (an effect added, a word moved): what shows it is drawn again, unless a field in it is being typed in
onChange((scopes) => {
  if (!page || currentPage() !== "jam" || !scopes.has("cut") || !jam.jam?.body.part || cut.project?.id !== jam.jam.body.cut) return;
  const a = document.activeElement;
  if (a && (page.root.contains(a) || document.querySelector(".jm-layer")?.contains(a)) && a.matches("input, textarea, select")) return;
  requestAnimationFrame(() => {
    if (cut.project?.id !== jam.jam?.body.cut) return;
    if (["edit", "words"].includes(jam.workspace)) drawEditor("jam");
    // the words and the effects list follow the edit
    if (["words", "edit"].includes(jam.workspace) || jam.win) changed("jam");
  });
});

/** The line being sung is lit while the film plays. */
editor.onTime = (t) => {
  const root = page?.root;
  if (!root || !jam.jam) return;
  if (jam.workspace === "words") updateWordsPlayback();
  const items = cut.project?.id === jam.jam.body.cut ? lyricItems(cut.project.body) : [];
  const line = items.findIndex((it) => t >= (Number(it.start) || 0) && t < (Number(it.start) || 0) + (Number(it.length) || 3));
  root.querySelectorAll(".jm-line").forEach((x, i) => x.classList.toggle("is-now", i === line));
  const total = filmLength() || 1;
  root.querySelectorAll(".jm-progress i").forEach((bar) => (bar.style.width = `${Math.min(100, (t / total) * 100)}%`));
};
// the page comes back drawn again: the editor's parts, which Kitchen's Cut may have had, are put back
window.addEventListener("hashchange", () => currentPage() === "jam" && changed("jam"));
// (leaving Jam puts its window and its menu away: they are not there when it is come back to)
window.addEventListener("hashchange", () => {
  if (currentPage() === "jam") return;
  stopRecord();
  pauseSong();
  menu = false;
  jam.win = null;
  drawWindow();
});
// the beat tools asked for by the editor's own key open its window
document.addEventListener("editor:inspect", () => currentPage() === "jam" && page && (setWorkspace("edit"), import("../jam.js").then((m) => m.openWindow("editor"))));
// the record turns and the stage's lights move while the film plays
document.addEventListener("editor:play", () => page?.root.classList.add("is-playing"));
document.addEventListener("editor:stop", () => page?.root.classList.remove("is-playing"));
// the jam menu closes on a press elsewhere, or Escape
document.addEventListener("pointerdown", (e) => {
  if (menu && currentPage() === "jam" && !e.target.closest?.(".jm-album-card")) ((menu = false), changed("jam"));
}, true);
document.addEventListener("keydown", (e) => e.key === "Escape" && menu && currentPage() === "jam" && ((menu = false), changed("jam")));

// a sound or a video dropped on Jam is the track; on the artist, a photo is the artist and on the moves a video is the dance
document.addEventListener("dragover", (e) => currentPage() === "jam" && e.dataTransfer?.types?.includes("Files") && e.preventDefault());
document.addEventListener("drop", (e) => {
  if (currentPage() !== "jam" || !e.dataTransfer?.files?.length) return;
  e.preventDefault();
  const f = e.dataTransfer.files[0];
  // on the song page a sound or a video is a song of the shelf
  if (jam.workspace === "song") return void (f.type.startsWith("audio/") || f.type.startsWith("video/") ? bringSong(f) : toast("Drop a song: a sound or a video."));
  const moves = e.target.closest?.(".jm-b-moves");
  if (f.type.startsWith("image/")) setArtist(f);
  else if (f.type.startsWith("video/") && moves) setDance(f);
  else if (f.type.startsWith("audio/") || f.type.startsWith("video/")) useTrack(f);
  else toast("Drop a song, a photo of the artist or a dance video.");
});
