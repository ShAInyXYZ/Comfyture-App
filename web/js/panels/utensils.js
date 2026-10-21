// Utensils' screen. On the left Truffle's panel: who she is, the eight workspaces the shelf is organised in, the queue of what is
// running and the latest results. Beside it the open workspace, a grid of bentos filling the page (each workspace is a module,
// web/js/utensils-space-<id>.js, made once and kept: { el, update, sig, count? }). Her bar docks at the foot of the page.
// HOME is the exception: it is a page of its own, the whole width and scrolling, with no panel (its header carries what the panel
// carries: Truffle, the way into every workspace, the queue and the credits). The panel comes back with every other workspace.
// The LIBRARY is not one of the workspaces of the list: its key under them opens it as a frame in front of everything, over the workspace
// that is open (utensils-library-frame.js); its workspace part lives in that frame.
import { h, icon, sprite, ago } from "../dom.js";
import { changed } from "../store.js";
import { currentPage } from "../router.js";
import { utensils, shelfTools, setWorkspace, toolsOf, toolById, creditsToday, openResult, cancelJob, give, arrive, openLibrary, closeLibrary, LIBRARY } from "../utensils.js";
import { libraryFrame } from "../utensils-library-frame.js";
import { TRUFFLE, WORKSPACES } from "../utensils-harness.js";
import { setRoom } from "../harnesses.js";
import { shelfSpace, templatesTotal, loadTemplatesTotal } from "../utensils-space-shelf.js";
import { homeSpace } from "../utensils-space-home.js";
import { pictureSpace } from "../utensils-space-picture.js";
import { videoSpace } from "../utensils-space-video.js";
import { audioSpace } from "../utensils-space-audio.js";
import { vfxSpace } from "../utensils-space-vfx.js";
import { editSpace } from "../utensils-space-edit.js";
import { templatesSpace } from "../utensils-space-templates.js";
// Truffle's recipe (its panel, the lit books, the coach) keeps itself in step with the page once loaded
import "../utensils-guide.js";

const MAKERS = { home: homeSpace, shelf: shelfSpace, picture: pictureSpace, video: videoSpace, audio: audioSpace, vfx: vfxSpace, edit: editSpace, templates: templatesSpace };
const time = (s) => `${Math.floor((s ?? 0) / 60)}:${String(Math.floor((s ?? 0) % 60)).padStart(2, "0")}`;

// made once and kept: the workspaces hold their own state (a video that plays, a slider being dragged)
let parts = null;
let shell = null;
let frame = null;
const made = () => (parts ??= Object.fromEntries(WORKSPACES.map((w) => [w.id, MAKERS[w.id]()])));

function build(el) {
  const spaces = made();
  const slot = shell?.slot ?? h("div.ut-chat", { id: "utensils-chat" });
  const tiles = h("div.ut-slot");
  const queue = h("div.ut-slot");
  const recent = h("div.ut-slot");
  const side = h("aside.ut-side", { "aria-label": "Truffle's panel" },
    h("div.ut-pet", {},
      h("span.ut-pet-pic", {}, h("img", { src: TRUFFLE.portrait, alt: "", draggable: false })),
      h("b.ut-pet-name", {}, TRUFFLE.name),
      h("span.ut-pet-tag", {}, TRUFFLE.tag)),
    tiles, queue, recent);
  const main = h("div.ut-main");
  for (const [id, part] of Object.entries(spaces)) {
    part.el.dataset.space = id;
    if (id !== LIBRARY) main.append(part.el);
  }
  main.append(slot);
  // the Library's part goes in its frame (made once, kept in the body: it opens over any workspace)
  frame ??= libraryFrame({ space: spaces[LIBRARY], slot, home: main });
  const root = h("div.utensils", {}, side, main);
  // the app does not draw a page while a field in it is in use: what waited is drawn as soon as the field is left
  root.addEventListener("focusout", (e) => !root.contains(e.relatedTarget) && setTimeout(() => changed("utensils"), 0));
  el.replaceChildren(root);
  shell = { el, root, slot, tiles, queue, recent, last: {}, sig: {} };
  document.dispatchEvent(new Event("utensils:drawn"));
}

/** A block of the panel is made again only when what it shows has changed. */
function fillBlock(name, sig, make) {
  if (shell.sig[name] === sig) return;
  shell.sig[name] = sig;
  shell[name].replaceChildren(make());
}

// ---------------------------------------------------------------- the workspaces

function countOf(w, spaces) {
  if (w.id === "home") return null;
  const own = spaces[w.id].count?.();
  if (own !== undefined && own !== null) return own;
  if (w.id === "shelf") return shelfTools().length;
  // the templates are a catalog on the server, not tools of the shelf
  if (w.id === "templates") return templatesTotal() ?? toolsOf(w.id).length;
  return toolsOf(w.id).length;
}
const two = (n) => (typeof n === "number" ? (n ? String(n).padStart(2, "0") : "–") : String(n));

function tilesBlock(spaces) {
  const lib = WORKSPACES.find((w) => w.id === LIBRARY);
  return h("div.ut-spaces-wrap", {}, h("nav.ut-spaces", { "aria-label": "Workspaces" }, ...WORKSPACES.filter((w) => w.id !== LIBRARY).map((w) =>
    h(`button.ut-space${w.id === utensils.workspace ? ".is-on" : ""}`, { type: "button", "aria-pressed": String(w.id === utensils.workspace), dataset: { space: w.id }, on: { click: () => setWorkspace(w.id) } },
      h("span.ut-space-icon", {}, sprite(w.icon)),
      // (a workspace's colour: the cloth of its books on the Shelf)
      h("span.ut-space-name", {}, w.name, w.color ? h("i.ut-space-dot", { style: { "--dot": w.color }, "aria-hidden": "true" }) : null),
      h("span.ut-space-count", {}, w.id === "home" ? "" : two(countOf(w, spaces)))))),
    // the Library: a key of its own under the workspaces, that opens it in front of everything (and closes it)
    h(`button.ut-space.ut-libkey${utensils.library ? ".is-on" : ""}`, { type: "button", "aria-pressed": String(!!utensils.library), title: utensils.library ? "Close the Library" : "Open the Library: every ComfyUI workflow, in front of the workspace", on: { click: () => (utensils.library ? closeLibrary() : openLibrary()) } },
      h("span.ut-space-icon", {}, sprite(lib?.icon ?? "tool-templates")),
      h("span.ut-space-name", {}, lib?.name ?? "Library", h("span.ut-space-count.is-inline", {}, ` ${two(countOf(lib ?? { id: LIBRARY }, spaces))}`)),
      h("span.ut-libkey-open", { title: "Opens in front of the workspace" }, icon("open"))));
}

// ---------------------------------------------------------------- the queue and the recent results

function queueBlock() {
  const today = creditsToday().total;
  const jobs = utensils.jobs.slice(0, 4);
  const running = utensils.jobs.filter((j) => j.status === "running").length;
  return h("section.ut-queue", { "aria-label": "Queue" },
    h("div.ut-block-head", {}, h("span.ut-block-label", {}, "Queue"), h("span.ut-block-note", {}, running ? `${running} running` : "idle"), h("span.spacer"), h("span.ut-block-credits", { title: "Credits the results of today cost" }, `${today} cr`, h("em", {}, "today"))),
    jobs.length ? h("div.ut-jobs", {}, ...jobs.map((j) => {
      const t = toolById(j.tool);
      const live = j.status === "running";
      return h(`div.ut-job.is-${j.status}`, { title: j.error ?? j.label, dataset: { job: j.id } },
        h("span.ut-job-icon", {}, sprite(t.icon)),
        h("div.ut-job-text", {},
          h("b", {}, j.label),
          h("span.ut-job-bar", { role: "progressbar", "aria-valuenow": String(Math.round(j.progress * 100)), className: live && j.progress < 0.02 ? "is-wait" : "" }, h("i", { style: { width: `${Math.round(j.progress * 100)}%` } })),
          h("em", {}, j.status === "failed" ? "Didn't finish" : j.status === "done" ? "Done" : j.status === "canceled" ? "Stopped" : typeof j.credits === "number" ? `≈ ${Math.round(j.credits)} cr` : "on your machine")),
        live ? h("button.ut-job-x", { type: "button", title: "Stop waiting for it", "aria-label": "Stop waiting", on: { click: () => cancelJob(j.id) } }, icon("close")) : h("span.ut-job-pct", {}, j.status === "done" ? "100%" : ""));
    })) : h("p.ut-hint", {}, "What runs shows here."));
}

function recentBlock() {
  const list = utensils.results.slice(0, 3);
  return h("section.ut-recent", { "aria-label": "Recent results" },
    h("div.ut-block-head", {}, h("span.ut-block-label", {}, "Recent"), h("span.ut-block-note", {}, list.length ? `${list.length} of ${utensils.results.length}` : "nothing yet")),
    list.length ? h("div.ut-recent-row", {}, ...list.map((r) => {
      const pic = r.kind === "image" ? h(`img${r.clear ? ".is-clear" : ""}`, { src: r.url, alt: "", draggable: false, loading: "lazy" })
        : r.kind === "video" ? h("video", { src: r.url, muted: true, preload: "metadata", playsInline: true })
        : h("span.ut-recent-audio", {}, icon("sound"));
      return h("button.ut-recent-item", { type: "button", title: `${toolById(r.tool).name} · ${ago(r.at)}`, on: { click: () => openResult(r) } },
        pic,
        h("span.ut-recent-badge", {}, sprite(toolById(r.tool).icon)),
        r.seconds ? h("span.ut-recent-time", {}, time(r.seconds)) : null);
    })) : h("p.ut-hint", {}, "What every tool makes is kept here, newest first."));
}

/** A job's bar moves in place: the rows are not made again at every tick (a redraw would flicker the icons). */
function syncProgress() {
  for (const j of utensils.jobs.slice(0, 4)) {
    const row = shell.queue.querySelector(`[data-job="${j.id}"]`);
    if (!row) continue;
    const bar = row.querySelector(".ut-job-bar");
    const pct = Math.round(j.progress * 100);
    bar.firstChild.style.width = `${pct}%`;
    bar.classList.toggle("is-wait", j.status === "running" && j.progress < 0.02);
    bar.setAttribute("aria-valuenow", String(pct));
  }
}

// ---------------------------------------------------------------- the page

export function renderUtensils(el) {
  // opened from another product: Home, unless something came for a workspace of its own
  arrive();
  loadTemplatesTotal();
  if (!shell || shell.el !== el || !el.contains(shell.root)) build(el);
  const spaces = made();
  const space = utensils.workspace;
  // the shell takes its Home or its panel shape in this same pass, before anything is painted: no frame shows the one in the other's place
  shell.root.classList.toggle("is-home-page", space === "home");
  // the bar asks what fits the workspace that is open (the Library's, while its frame is open)
  setRoom("utensils", utensils.library ? LIBRARY : space);
  // (the panel is not on screen on Home: its blocks are drawn when a workspace opens)
  if (space !== "home") {
    const counts = WORKSPACES.map((w) => countOf(w, spaces));
    fillBlock("tiles", JSON.stringify([space, counts, !!utensils.library]), () => tilesBlock(spaces));
    fillBlock("queue", JSON.stringify([utensils.jobs.map((j) => [j.id, j.status]), creditsToday().total]), queueBlock);
    syncProgress();
    fillBlock("recent", JSON.stringify(utensils.results.slice(0, 3).map((r) => [r.id, r.url])), recentBlock);
  }
  frame.update();
  for (const w of WORKSPACES) {
    const part = spaces[w.id];
    const on = w.id === LIBRARY ? !!utensils.library : w.id === space;
    part.el.hidden = !on;
    if (!on) continue;
    try {
      // a workspace is drawn again only when what it shows has changed
      const sig = part.sig?.();
      if (sig !== undefined && sig === shell.last[w.id]) continue;
      shell.last[w.id] = sig;
      // one that held back (a field in it has the focus) is drawn at the next change
      if (part.update() === false) shell.last[w.id] = undefined;
    } catch (e) {
      console.warn(`utensils ${w.id}:`, e);
    }
  }
  if (shell.space !== space) {
    shell.space = space;
    window.scrollTo({ top: 0 });
  }
}

// a file dropped on Utensils, or pasted, goes to the tool open (the medium workspaces; the others take their own)
const takesFiles = () => currentPage() === "utensils" && ["picture", "video", "audio"].includes(utensils.workspace);
document.addEventListener("dragover", (e) => takesFiles() && e.dataTransfer?.types?.includes("Files") && e.preventDefault());
document.addEventListener("drop", (e) => {
  if (!takesFiles() || !e.dataTransfer?.files?.length || e.target.closest?.("#assistant")) return;
  e.preventDefault();
  for (const f of e.dataTransfer.files) give(f);
});
document.addEventListener("paste", (e) => {
  if (!takesFiles() || e.target.closest?.("input, textarea")) return;
  const files = [...(e.clipboardData?.files ?? [])];
  if (!files.length) return;
  e.preventDefault();
  files.forEach(give);
});
