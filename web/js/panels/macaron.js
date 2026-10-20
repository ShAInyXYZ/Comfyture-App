// Macaron's screen. On the left Brioche's panel: who she is, the brand open, the three workspaces a brand's work goes
// through (Design idea, Brand kit, Content) and her tools for the one that is open. Beside it that workspace, a grid of
// bentos; a bento opens as a window over the screen (macaron-win.js). Her bar docks at the foot of the page.
import { h, icon, sprite } from "../dom.js";
import { changed } from "../store.js";
import { currentPage } from "../router.js";
import { dropdown } from "../controls.js";
import { macaron, SPACES, loadBrands, openBrand, newBrand, exampleBrand, removeBrand, rename, addAsset, undo, redo, setSpace } from "../macaron.js";
import { mcicon, key, arming, isArmed, armedNow, fill } from "../macaron-ui.js";
import { ideaSpace } from "../macaron-idea.js";
import { kitSpace } from "../macaron-kit.js";
import { contentSpace } from "../macaron-content.js";
import { windowHost, defineWindow, openWin, closeAll } from "../macaron-win.js";
import { TOOLS, runTool, waitingFor } from "../macaron-tools.js";
import { BRIOCHE, WORKSPACES } from "../macaron-harness.js";
import { setRoom } from "../harnesses.js";

/** What each workspace's count counts: the pictures its moodboard holds, the kit's logo files, the posts. */
const COUNT = {
  idea: (b) => b.body.refs.filter((r) => r.kind !== "concept").length,
  kit: (b) => b.body.kit.logos.length,
  content: (b) => b.body.designs.filter((d) => !d.variant).length,
};
/** The workspaces, as the panel names them: the name, the picture of its tile and its count. */
const SPACE_INFO = Object.fromEntries(WORKSPACES.map((w) => [w.id, [w.name, w.tile, COUNT[w.id]]]));
const two = (n) => String(n).padStart(2, "0");

// made once and kept: the windows and the workspaces hold their own state, and some listen to the page
let parts = null;
let shell = null;
let slot = null;
const made = () =>
  (parts ??= { idea: ideaSpace(), kit: kitSpace(), content: contentSpace(), host: windowHost() });

function build(el) {
  const { idea, kit, content, host } = made();
  // Brioche's bar docks into this slot; it is the same element every time the page is built, so the bar goes with it
  slot ??= h("div.mc-chat", { id: "macaron-chat" });
  const side = h("aside.mc-side", { "aria-label": "Brioche, the brand room" });
  const main = h("div.mc-main");
  // (a workspace is kept between builds: it comes back reachable, whatever window was over it when the room went away)
  for (const [id, part] of Object.entries({ idea, kit, content })) {
    part.el.dataset.space = id;
    part.el.inert = false;
  }
  main.append(idea.el, kit.el, content.el, slot);
  const root = h("div.macaron", {}, side, main, host.el);
  // the app does not draw a page while a field in it is in use: what waited is drawn as soon as the field is left
  root.addEventListener("focusout", (e) => !root.contains(e.relatedTarget) && setTimeout(() => changed("macaron"), 0));
  el.replaceChildren(root);
  shell = { el, root, side, last: {}, sideSig: "" };
  document.dispatchEvent(new Event("macaron:drawn"));
}

// ---------------------------------------------------------------- Brioche's panel

function drawSide(b) {
  const space = macaron.space;
  const designs = b.body.designs.filter((d) => !d.variant);
  const sig = JSON.stringify([b.id, b.name, macaron.list.map((x) => [x.id, x.name]), space, SPACES.map((s) => SPACE_INFO[s][2](b)), macaron.past.length, macaron.future.length, !!macaron.chat.busy, macaron.design, designs.length, armedNow()]);
  if (sig === shell.sideSig) return;
  shell.sideSig = sig;
  const tools = TOOLS[space] ?? [];
  fill(shell.side,
    h("div.mc-pet", {},
      h("span.mc-pet-pic", {}, h("img", { src: BRIOCHE.portrait, alt: "", draggable: false })),
      h("b.mc-pet-name", {}, BRIOCHE.name),
      h("span.mc-pet-tag", {}, BRIOCHE.tag)),
    h("div.mc-proj", {},
      dropdown({
        label: "Brand",
        value: b.id,
        items: [
          ...macaron.list.map((x) => ({ value: x.id, label: x.name })),
          { value: "__settings", label: "This brand's settings", glyph: () => mcicon("kit") },
          { value: "__new", label: "A new brand", glyph: () => icon("plus") },
        ],
        // (the chip is drawn again: it shows the brand that is open, not the key that was chosen)
        onChange: (id) => (id === "__new" ? (closeAll(), newBrand()) : id === "__settings" ? ((shell.sideSig = ""), openWin("brand")) : (closeAll(), openBrand(id))),
        width: "fill",
      })),
    h("nav.mc-spaces", { "aria-label": "Workspaces" }, ...SPACES.map((id) => {
      const [name, pic, count] = SPACE_INFO[id];
      return h(`button.mc-space${id === space ? ".is-on" : ""}`, { type: "button", "aria-pressed": String(id === space), dataset: { space: id }, on: { click: () => (closeAll(), setSpace(id)) } },
        h("span.mc-space-pic", {}, h("img", { src: pic, alt: "", draggable: false })),
        h("span.mc-space-name", {}, name),
        h("span.mc-space-count", {}, two(count(b))));
    })),
    h("div.mc-tools", { role: "group", "aria-label": "Brioche's tools" },
      h("span.mc-tools-label", {}, "Brioche's tools"),
      ...tools.map((t) => {
        const why = waitingFor(t);
        return h("button.mc-tool", { type: "button", disabled: !!why, title: why || t.label, dataset: { tool: t.id }, on: { click: (e) => runTool(t, e) } },
          h("span.mc-tool-icon", {}, mcicon(t.icon)),
          h("span.mc-tool-name", {}, t.label),
          h("span.mc-tool-go", {}, mcicon("chev")));
      })),
    h("div.mc-side-foot", {},
      key(sprite("edit-undo"), "Undo (Ctrl Z)", () => undo(), { disabled: !macaron.past.length }),
      key(sprite("edit-redo"), "Redo", () => redo(), { disabled: !macaron.future.length }),
      h("span.spacer"),
      key(mcicon("kit"), "This brand's settings", () => openWin("brand"))));
}

// ---------------------------------------------------------------- the brand's own window: its name, how much it holds, its end

function brandWin() {
  const el = h("div.mc-w.is-brand");
  function update() {
    const b = macaron.brand;
    if (!b) return;
    if (el.contains(document.activeElement) && document.activeElement.matches("input")) return false;
    const designs = b.body.designs.filter((d) => !d.variant);
    const armedKey = `brand:${b.id}`;
    const stat = (n, label) => h("div.mc-stat", {}, h("b", {}, String(n)), h("span", {}, label));
    fill(el,
      h("label.mc-bf", {}, h("span.label", {}, "Its name"), h("input.field.mc-text", { value: b.name, "aria-label": "The brand's name", dataset: { focus: `name:${b.id}` }, on: { input: (e) => rename(e.target.value) } })),
      h("div.mc-stats", {}, stat(designs.length, designs.length === 1 ? "post" : "posts"), stat(designs.filter((d) => d.status === "approved").length, "ready"), stat(b.body.motion.length, "motion"), stat(b.body.exports.length, "exports"), stat(b.body.assets.length, "pictures")),
      h("div.mc-brand-keys", {},
        h("button.key", { type: "button", on: { click: () => (closeAll(), newBrand()) } }, icon("plus"), "A new brand"),
        h("span.spacer"),
        h(`button.key${isArmed(armedKey) ? ".is-armed" : ""}`, { type: "button", title: isArmed(armedKey) ? "Click again to delete the brand" : "Delete this brand", on: { click: () => arming(armedKey, () => changed("macaron"), () => (closeAll(), removeBrand(b.id))) } }, icon("trash"), isArmed(armedKey) ? "Click again to delete it" : "Delete this brand")),
      h("p.mc-hint", {}, "A brand keeps its kit, its brief and moodboard, its pictures and its posts. Deleting it cannot be undone."));
  }
  return { el, update, sig: () => JSON.stringify([macaron.brand?.name, macaron.brand?.body.designs.length, macaron.brand?.body.assets.length, macaron.brand?.body.exports.length, armedNow()]) };
}
defineWindow("brand", { title: "Brand", sub: () => macaron.brand?.name ?? "", size: "s", advanced: false, make: brandWin });

function welcome() {
  return h("div.mc-welcome", {},
    h("img.star", { src: "brand/cast/brioche.png", alt: "", draggable: false }),
    h("h1", {}, "Macaron"),
    h("p", {}, "A brand's room: its idea, its kit and its content, for every format, ready to export."),
    h("div.mc-welcome-keys", {},
      h("button.mc-go", { type: "button", disabled: macaron.busy.has("example"), on: { click: () => exampleBrand() } }, h("span", {}, macaron.busy.has("example") ? "Setting it up" : "Start with the example")),
      h("button.key", { type: "button", on: { click: () => newBrand() } }, icon("plus"), "A brand of my own")));
}

// ---------------------------------------------------------------- the page

export function renderMacaron(el) {
  loadBrands();
  const b = macaron.brand;
  if (!b) {
    shell = null;
    document.body.classList.remove("mc-has-win");
    // Brioche's bar is not left in the page that is being replaced: it waits at the body until a brand is open again
    const bar = document.getElementById("assistant");
    if (bar && el.contains(bar)) {
      bar.hidden = true;
      document.body.append(bar);
    }
    el.replaceChildren(macaron.ready && macaron.list.length === 0 ? welcome() : h("div.mc-welcome", {}, h("span.lamp", { dataset: { tone: "busy" } })));
    return;
  }
  if (!shell || shell.el !== el || !el.contains(shell.root)) build(el);
  const { host } = made();
  const space = macaron.space;
  // the bar asks and offers what fits the workspace that is open
  setRoom("macaron", space);
  drawSide(b);
  for (const id of SPACES) {
    const part = parts[id];
    const on = id === space;
    part.el.hidden = !on;
    if (!on) continue;
    try {
      // a workspace is drawn again only when what it shows has changed
      const sig = part.sig?.();
      if (sig !== undefined && sig === shell.last[id]) continue;
      shell.last[id] = sig;
      // one that held back (a field in it has the focus) is drawn at the next change
      if (part.update() === false) shell.last[id] = undefined;
    } catch (e) {
      console.warn(`macaron ${id}:`, e);
    }
  }
  try {
    host.update();
  } catch (e) {
    console.warn("macaron window:", e);
  }
  if (shell.space !== space) {
    shell.space = space;
    window.scrollTo({ top: 0 });
  }
}

// a picture dropped on Macaron, or pasted, joins the project's pictures
document.addEventListener("dragover", (e) => currentPage() === "macaron" && e.dataTransfer?.types?.includes("Files") && e.preventDefault());
document.addEventListener("drop", (e) => {
  if (currentPage() !== "macaron" || !e.dataTransfer?.files?.length || e.target.closest?.("#assistant")) return;
  e.preventDefault();
  for (const f of e.dataTransfer.files) if (f.type.startsWith("image/")) addAsset(f);
});
document.addEventListener("paste", (e) => {
  if (currentPage() !== "macaron" || e.target.closest?.("input, textarea")) return;
  const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
  if (!files.length) return;
  e.preventDefault();
  files.forEach((f) => addAsset(f));
});
