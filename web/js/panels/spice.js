// Spice's screen. On the left THE COMP STACK: Paprika's portrait and the shot open (a chip that switches shots), then the six departments
// drawn as the LAYERS of a composite, stacked from the bottom up (the plate at the foot, the comp on top): each a row with a small picture
// of its pass, its name, a lamp (green done, amber working, hollow empty) and an eye (whether its pass shows in the viewer's comp); the
// open department's row is lit. Under the stack, what is known of the shot: its frame range, its size and rate, the passes done, the day's
// credits. Beside it the open department as a grid of bentos that fills the screen down to the chat bar; the hero bento is always THE
// VIEWER (spice-viewer.js, made once and moved into the open department's grid). Paprika's bar docks at the foot of the page. A bento
// opens as a window over the screen (spice-win.js). Mockups: docs/brand/products/spice-v1/spice-fx.png and spice-roto.png.
import { h, icon, sprite } from "../dom.js";
import { changed, toast, onChange } from "../store.js";
import { currentPage } from "../router.js";
import { dropdown } from "../controls.js";
import { hasPending, takePending, spice, loadShots, openShot, newShot, removeShot, rename, setDept, toggleEye, creditsTodayAll, workingOn } from "../spice.js";
import { PAPRIKA, WORKSPACES } from "../spice-harness.js";
import { STACK, lampOf, passOf, passesDone, rangeOf, rangeText, topOf, visible } from "../spice-model.js";
import { setRoom } from "../harnesses.js";
import { createViewer } from "../spice-viewer.js";
import { windowHost, defineWindow, openWin, closeWin } from "../spice-win.js";
import { thumb, spicon, fill, ghost, danger } from "../spice-ui.js";
import { importFootage, pickFile } from "../spice-engines.js";
import { plateSpace } from "../spice-plate.js";
import { rotoSpace } from "../spice-roto.js";
import { paintSpace } from "../spice-paint.js";
import { lightSpace } from "../spice-light.js";
import { fxSpace } from "../spice-fx.js";
import { compSpace } from "../spice-comp.js";

const MAKERS = { plate: plateSpace, roto: rotoSpace, paint: paintSpace, light: lightSpace, fx: fxSpace, comp: compSpace };

// made once and kept: the departments hold their own state (a clip that plays, a slider being dragged)
let parts = null;
let viewer = null;
let host = null;
let shell = null;
let slot = null;

function made() {
  if (!parts) {
    viewer = createViewer({
      drop: () => (spice.dept === "plate" ? pickFile(importFootage) : setDept("plate")),
      point: (p) => parts[spice.dept].point?.(p),
      mask: (has) => parts[spice.dept].mask?.(has),
    });
    host = windowHost();
    parts = Object.fromEntries(WORKSPACES.map((w) => [w.id, MAKERS[w.id](viewer)]));
  }
  return parts;
}

function build(el) {
  const spaces = made();
  // Paprika's bar docks into this slot; it is the same element every time the page is built, so the bar goes with it
  slot ??= h("div.sp-chat", { id: "spice-chat" });
  const side = h("aside.sp-side", { "aria-label": "Paprika, the VFX house" });
  const grid = h("div.sp-grid");
  for (const [id, part] of Object.entries(spaces)) {
    part.el.dataset.dept = id;
    part.el.inert = false;
    grid.append(part.el);
  }
  const main = h("div.sp-main", {}, grid, slot);
  const root = h("div.spice", {}, side, main, host.el);
  // the app does not draw a page while a field in it is in use: what waited is drawn as soon as the field is left
  root.addEventListener("focusout", (e) => !root.contains(e.relatedTarget) && setTimeout(() => changed("spice"), 0));
  el.replaceChildren(root);
  shell = { el, root, side, grid, last: {}, sideSig: "" };
  document.dispatchEvent(new Event("spice:drawn"));
}

// ---------------------------------------------------------------- Paprika and the shot

/** The thumbnail of a department's row: its pass; Roto's is the matte, tinted red on its left half and plain on its right. */
function layerPicture(b, dept) {
  if (dept === "comp") return thumb(topOf(b)?.media);
  const m = passOf(b, dept)?.media;
  if (dept === "roto" && m) return h("span.sp-thumb.is-matte", {}, thumb(m, { cls: "is-tint" }), thumb(m, { cls: "is-plain" }));
  return thumb(m);
}

function shotChip() {
  const s = spice.shot;
  const pic = s.body.passes.plate?.media;
  return dropdown({
    label: "Shot",
    value: s.id,
    items: [
      ...spice.list.map((x) => ({ value: x.id, label: x.name, glyph: () => (x.id === s.id && pic ? thumb(pic, { cls: "is-chip" }) : spicon("film")) })),
      { value: "__new", label: "A new shot", glyph: () => spicon("plus") },
      { value: "__settings", label: "This shot's settings", glyph: () => icon("pencil") },
    ],
    // (the chip is drawn again: it shows the shot that is open, not the key that was chosen)
    onChange: (id) => {
      changed("spice");
      if (id === "__new") return newShot();
      if (id === "__settings") return openWin("shot");
      return openShot(id);
    },
    width: "fill",
  });
}

/** The shot's own window: its name, how much it holds, the other shots, a new one, its end. */
function shotWin() {
  const el = h("div.sp-w.is-shot");
  function update() {
    const s = spice.shot;
    if (el.contains(document.activeElement) && document.activeElement.matches("input")) return false;
    const others = spice.list.filter((x) => x.id !== s.id);
    fill(el,
      h("input.field.sp-text", { value: s.name, "aria-label": "The shot's name", placeholder: "SH010 · Rooftop portal", dataset: { focus: `name:${s.id}` }, on: { input: (e) => rename(e.target.value) } }),
      h("div.sp-stats", {}, stat(passesDone(s.body), "passes"), stat(s.body.log.length, "paid runs"), stat(spice.list.length, spice.list.length === 1 ? "shot" : "shots")),
      others.length ? h("div.sp-others", {}, h("span.ut-label", {}, "Another shot"), ...others.map((x) => h("button.sp-other", { type: "button", on: { click: () => (closeWin(), openShot(x.id)) } }, spicon("film"), h("span", {}, x.name)))) : null,
      h("div.sp-w-foot", {},
        ghost("A new shot", () => (closeWin(), newShot()), { icon: spicon("plus") }),
        h("span.spacer"),
        danger({ id: `shot:${s.id}`, label: "Delete this shot", again: "Click again to delete it", run: () => (closeWin(), removeShot(s.id)) })),
      h("p.sp-hint", {}, "A shot keeps its footage and every pass made of it. Deleting it leaves the files in your library."));
  }
  return { el, update, sig: () => JSON.stringify([spice.shot?.name, spice.list.map((x) => x.id), spice.shot?.body.log.length]) };
}
const stat = (n, label) => h("div.sp-stat", {}, h("b", {}, String(n)), h("span", {}, label));
defineWindow("shot", { eyebrow: "Shot", title: () => spice.shot?.name ?? "The shot", size: "s", make: shotWin });

function drawSide() {
  const s = spice.shot;
  const b = s.body;
  const r = rangeOf(b);
  const plate = b.passes.plate;
  const credits = creditsTodayAll();
  const working = Object.fromEntries(STACK.map((d) => [d, workingOn(d)]));
  const sig = JSON.stringify([s.id, s.name, spice.list.map((x) => [x.id, x.name]), spice.dept, STACK.map((d) => [d, passOf(b, d)?.eye, passOf(b, d)?.media?.url, working[d]?.progress != null ? 1 : 0]), b.passes.comp?.media?.url, topOf(b)?.media.url, r, plate?.fps, plate?.media.width, credits]);
  if (sig === shell.sideSig) return;
  shell.sideSig = sig;
  fill(shell.side,
    h("div.sp-id", {},
      h("img", { src: PAPRIKA.portrait, alt: "", draggable: false }),
      h("div.sp-id-text", {}, h("b", {}, PAPRIKA.name), h("span", {}, `· ${PAPRIKA.tag}`)),
      h("button.sp-id-go", { type: "button", title: "Ask Paprika", "aria-label": "Ask Paprika", on: { click: () => document.querySelector("#assistant .composer textarea, #assistant textarea")?.focus() } }, spicon("chev"))),
    h("div.sp-shotchip", {}, shotChip()),
    h("nav.sp-stack", { "aria-label": "The comp stack, the last department on top" }, ...STACK.map((d) => {
      const w = WORKSPACES.find((x) => x.id === d);
      const on = d === spice.dept;
      const p = d === "comp" ? b.passes.comp : passOf(b, d);
      const lamp = lampOf(b, d, !!working[d]);
      const has = d === "comp" ? !!topOf(b) : !!p?.media;
      const shown = d === "comp" ? has : visible(p);
      return h(`div.sp-layer${on ? ".is-on" : ""}${has ? "" : ".is-empty"}`, { dataset: { dept: d } },
        h("button.sp-layer-main", { type: "button", "aria-pressed": String(on), title: `${w.name} — ${w.makes}`, on: { click: () => setDept(d) } },
          layerPicture(b, d),
          h("span.sp-layer-name", {}, w.name.toUpperCase()),
          h("span.sp-lamp", { dataset: { tone: lamp }, title: lamp === "done" ? "Done" : lamp === "busy" ? `Working: ${working[d]?.label ?? ""}` : "Nothing yet" })),
        h("button.sp-eye", { type: "button", disabled: !has || d === "comp", "aria-pressed": String(shown), title: shown ? `Hide ${w.name} in the viewer` : `Show ${w.name} in the viewer`, "aria-label": `${w.name} in the viewer`, on: { click: () => toggleEye(d) } }, spicon(shown ? "eye" : "eyeOff")));
    })),
    h("dl.sp-facts", {},
      plate?.media.kind === "image" ? fact("Footage", "A picture") : fact("Frame range", plate ? rangeText(r) : "–"),
      fact(plate?.media.kind === "image" ? "Resolution" : "Resolution · fps", plate ? `${plate.media.width} × ${plate.media.height}${plate.media.kind === "video" ? ` · ${plate.fps ?? 24} fps` : ""}` : "–"),
      fact("Passes done", `${passesDone(b)} / 6`),
      fact("Compute (Comfy Cloud)", `${credits} cr today`)),
    // what Spice is for, beside the other product that does VFX: one shot, every pass kept here; one quick fix, Utensils
    h("div.sp-about", {},
      h("p", {}, "One shot, every pass on top of the last: nothing is overwritten, the comp keeps them all."),
      h("a.sp-about-link", { href: "#/utensils", title: "Utensils: one small tool, one job, one result (an upscale, a cutout, a quick removal)" }, sprite("product-utensils"), h("span", {}, "One quick fix? Utensils"))));
}
const fact = (k, v) => h("div", {}, h("dt", {}, k), h("dd", {}, v));

// ---------------------------------------------------------------- the page

// the frame moved (the viewer, the keys): what a department keeps in step with it follows
onChange((scopes) => scopes.has("spice-frame") && parts && currentPage() === "spice" && parts[spice.dept]?.frame?.());

export function renderSpice(el) {
  loadShots();
  // a clip sent from another product (Utensils' VFX) becomes a new shot first
  if (hasPending()) takePending();
  if (!spice.shot) {
    shell = null;
    // Paprika's bar is not left in the page that is being replaced: it waits at the body until a shot is open
    const bar = document.getElementById("assistant");
    if (bar && el.contains(bar)) {
      bar.hidden = true;
      document.body.append(bar);
    }
    el.replaceChildren(h("div.sp-boot", {}, h("span.lamp", { dataset: { tone: "busy" } })));
    return;
  }
  if (!shell || shell.el !== el || !el.contains(shell.root)) build(el);
  const spaces = made();
  const dept = spice.dept;
  // the bar asks what fits the department that is open
  setRoom("spice", dept);
  drawSide();
  for (const w of WORKSPACES) {
    const part = spaces[w.id];
    const on = w.id === dept;
    part.el.hidden = !on;
    if (!on) continue;
    try {
      // a department is drawn again only when what it shows has changed
      const sig = JSON.stringify([spice.shot.id, spice.shot.body, [...spice.busy].map(([k, v]) => [k, Math.round(v.progress * 20)]), spice.armed?.id, spice.pointer, part.sig?.()]);
      if (sig !== shell.last[w.id]) {
        shell.last[w.id] = sig;
        if (part.update() === false) shell.last[w.id] = undefined;
      }
      // the viewer is the hero of the one open: it moves into its grid and shows what that department shows of the shot
      if (part.slot && viewer.el.parentElement !== part.slot) part.slot.append(viewer.el);
      viewer.update({ dept, body: spice.shot.body, ...(part.viewer?.() ?? {}) });
    } catch (e) {
      console.warn(`spice ${w.id}:`, e);
    }
  }
  try {
    host.update();
  } catch (e) {
    console.warn("spice window:", e);
  }
  if (shell.dept !== dept) {
    shell.dept = dept;
    window.scrollTo({ top: 0 });
  }
}

// a clip or a picture dropped on Spice, or pasted, is the footage of the shot
const takes = (e) => currentPage() === "spice" && !e.target.closest?.("#assistant, .sp-win");
document.addEventListener("dragover", (e) => takes(e) && e.dataTransfer?.types?.includes("Files") && e.preventDefault());
document.addEventListener("drop", (e) => {
  if (!takes(e) || !e.dataTransfer?.files?.length) return;
  e.preventDefault();
  const f = [...e.dataTransfer.files].find((x) => /^(video|image)\//.test(x.type));
  if (f) importFootage(f);
  else toast("Spice takes a clip or a picture.");
});
document.addEventListener("paste", (e) => {
  if (!takes(e) || e.target.closest?.("input, textarea")) return;
  const f = [...(e.clipboardData?.files ?? [])].find((x) => /^(video|image)\//.test(x.type));
  if (!f) return;
  e.preventDefault();
  importFootage(f);
});
