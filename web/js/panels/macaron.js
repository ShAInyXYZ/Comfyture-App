// Macaron's screen. On the left Brioche's panel, the SWATCH BOOK: it wears the brand open (its darkest colour is the panel, its wordmark
// at the top switches brands), the five workspaces a brand's work goes through (Design idea, Brand kit, Studio, Create, Brand book) are
// swatch cards in the brand's own colours fanned like a colour book, the open one pulled out toward the page, and the brand's health is a
// seal at its foot with Brioche in it. Another brand, another panel; a brand with no palette yet has the app's own greys. Beside it the
// workspace, a grid of bentos, which wears the brand too (the grid is its accent colour, the bentos on it its ground); a bento opens as a
// window over the screen (macaron-win.js). Her bar docks at the foot of the page.
// Mockup: web/labs/panels.html (B2).
import { h, icon, sprite } from "../dom.js";
import { changed } from "../store.js";
import { currentPage } from "../router.js";
import { dropdown } from "../controls.js";
import { macaron, SPACES, loadBrands, openBrand, newBrand, exampleBrand, removeBrand, rename, addAsset, undo, redo, setSpace } from "../macaron.js";
import { mcicon, key, arming, isArmed, armedNow, fill } from "../macaron-ui.js";
import { ideaSpace } from "../macaron-idea.js";
import { kitSpace } from "../macaron-kit.js";
import { contentSpace } from "../macaron-content.js";
import { studioSpace } from "../macaron-studio-space.js";
import { bookSpace } from "../macaron-book.js";
import { brandHealth, warmDesigns } from "../macaron-health.js";
import { kitOf, luminance, contrast } from "../design.js";
import { windowHost, defineWindow, openWin, closeAll } from "../macaron-win.js";
import { BRIOCHE, WORKSPACES } from "../macaron-harness.js";
import { setRoom } from "../harnesses.js";

/** What each workspace's count counts: the pictures its moodboard holds, the kit's logo files, the pictures made, the posts. */
const COUNT = {
  idea: (b) => b.body.refs.filter((r) => r.kind !== "concept").length,
  kit: (b) => b.body.kit.logos.length,
  studio: (b) => (b.body.assets ?? []).filter((a) => a.url).length,
  create: (b) => b.body.designs.filter((d) => !d.variant && !d.motion && !d.graphic).length,
  book: (b) => b.body.designs.filter((d) => !d.variant && !d.motion && !d.graphic && d.status === "approved").length,
};
/** The workspaces, as the panel names them: the name, the picture of its tile and its count. */
const SPACE_INFO = Object.fromEntries(WORKSPACES.map((w) => [w.id, [w.name, w.tile, COUNT[w.id]]]));
const two = (n) => String(n).padStart(2, "0");

// made once and kept: the windows and the workspaces hold their own state, and some listen to the page
let parts = null;
let shell = null;
let slot = null;
const made = () =>
  (parts ??= { idea: ideaSpace(), kit: kitSpace(), studio: studioSpace(), create: contentSpace(), book: bookSpace(), host: windowHost() });

function build(el) {
  const { idea, kit, studio, create, book, host } = made();
  // Brioche's bar docks into this slot; it is the same element every time the page is built, so the bar goes with it
  slot ??= h("div.mc-chat", { id: "macaron-chat" });
  const side = h("aside.mc-side.mcb", { "aria-label": "Brioche, the brand room" });
  const main = h("div.mc-main");
  // (a workspace is kept between builds: it comes back reachable, whatever window was over it when the room went away)
  for (const [id, part] of Object.entries({ idea, kit, studio, create, book })) {
    part.el.dataset.space = id;
    part.el.inert = false;
  }
  main.append(idea.el, kit.el, studio.el, create.el, book.el, slot);
  const root = h("div.macaron", {}, side, main, host.el);
  // the app does not draw a page while a field in it is in use: what waited is drawn as soon as the field is left
  root.addEventListener("focusout", (e) => !root.contains(e.relatedTarget) && setTimeout(() => changed("macaron"), 0));
  el.replaceChildren(root);
  shell = { el, root, side, last: {}, sideSig: "" };
  document.dispatchEvent(new Event("macaron:drawn"));
}

// ---------------------------------------------------------------- Brioche's panel

/** What the health reads from: the brief, the kit, the product and the posts (the lines are worked out again when it changes). */
const healthSig = (b) => JSON.stringify([b.body.brief, b.body.kit.palette, b.body.kit.logos?.map((l) => l.id), b.body.kit.voice, b.body.products?.map((p) => p.name), b.body.designs.map((d) => [d.id, d.status, d.updatedAt, d.format])]);

/** The health worked out again only when what it reads from has changed (the designs are got ready once, then it is worked out again). */
function healthOf(b) {
  const sig = healthSig(b);
  if (shell.healthSig !== sig) {
    shell.healthSig = sig;
    shell.health = brandHealth(b);
    // the guard reads the logos as they are drawn: the designs are got ready once, then the health is worked out again
    warmDesigns(b).then((fresh) => fresh && shell && shell.healthSig === sig && ((shell.health = brandHealth(b)), (shell.sideSig = ""), changed("macaron")));
  }
  return shell.health;
}

const hexOf = (c) => (/^#[0-9a-f]{6}$/i.test(String(c ?? "")) ? String(c).toLowerCase() : null);
/** How lively a colour is (its saturation): the seal's ring takes the liveliest colour of the brand. */
const chroma = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return Math.max(r, g, b) - Math.min(r, g, b);
};
/** A colour a part of the way (t, 0 to 1) to another. */
const mix = (a, b, t) => {
  const x = parseInt(a.slice(1), 16);
  const y = parseInt(b.slice(1), 16);
  const c = (sh) => Math.round(((x >> sh) & 255) * (1 - t) + ((y >> sh) & 255) * t);
  return `#${[16, 8, 0].map((sh) => c(sh).toString(16).padStart(2, "0")).join("")}`;
};

/**
 * The swatch book's colours, from the brand's palette: the darkest is the panel's ground (deepened when it is not dark enough to be a
 * panel), the lightest its ink; the cards take the other colours in the palette's order (tints between the ground and the ink when there
 * are fewer than five), each with whichever of the two reads best on it; the seal's ring is the liveliest colour. Without a palette of
 * two colours or more, null: the app's own greys and the accent.
 */
function bookColours(kit) {
  const pal = kit.palette.map((p) => ({ ...p, hex: hexOf(p.hex) })).filter((p) => p.hex);
  if (pal.length < 2) return null;
  const byLum = [...pal].sort((a, b) => luminance(a.hex) - luminance(b.hex));
  const darkest = byLum[0];
  const lightest = byLum.at(-1);
  const ground = luminance(darkest.hex) > 0.06 ? mix(darkest.hex, "#000000", 0.55) : darkest.hex;
  const ink = luminance(lightest.hex) > 0.6 ? lightest.hex : "#fbf6ec";
  const others = pal.filter((p) => p.id !== darkest.id).map((p) => p.hex);
  const cards = [...others];
  for (const t of [mix(ground, ink, 0.24), mix(ink, ground, 0.14), mix(ground, ink, 0.42)]) if (cards.length < 5) cards.push(t);
  const lively = [...others].sort((a, b) => chroma(b) - chroma(a))[0] ?? ink;
  return { ground, ink, seal: lively, cards: cards.slice(0, 5).map((c) => ({ c, t: contrast(c, ground) >= contrast(c, ink) ? ground : ink })) };
}

/** The brand's accent: the palette colour named or meant as its signal or accent, else null (the liveliest one stands in). */
function accentOf(kit) {
  const p = kit.palette.find((x) => /signal|accent|highlight|pop/i.test(`${x.name ?? ""} ${x.role ?? ""}`) && hexOf(x.hex));
  return p ? hexOf(p.hex) : null;
}

/** The brand's wordmark that reads best on the panel's ground (a logo file's tone is the palette colour it is drawn in), or null. */
function wordmarkOn(kit, ground) {
  const hex = (tone) => hexOf(kit.palette.find((p) => p.id === tone)?.hex);
  return kit.logos.filter((l) => l.kind === "wordmark" && l.url).map((l) => ({ l, r: hex(l.tone) ? contrast(hex(l.tone), ground) : 1 })).sort((a, b) => b.r - a.r).find((x) => x.r >= 3)?.l ?? null;
}

/** The brand's initials, for the swatch cards' labels ("Little Otter Tea" is LOT). */
const initials = (name) => String(name ?? "").split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 4).toUpperCase() || "MAC";

function drawSide(b) {
  const space = macaron.space;
  const kit = kitOf(b.body);
  const sig = JSON.stringify([b.id, b.name, macaron.list.map((x) => [x.id, x.name]), space, SPACES.map((s) => SPACE_INFO[s][2](b)), macaron.past.length, macaron.future.length, !!macaron.chat.busy, macaron.design, healthSig(b), kit.palette, kit.logos.map((l) => [l.id, l.kind, l.tone, l.url]), armedNow()]);
  if (sig === shell.sideSig) return;
  shell.sideSig = sig;
  const col = bookColours(kit);
  const side = shell.side;
  // the panel wears the brand (its colours as custom properties), or the app's greys
  side.classList.toggle("is-branded", !!col);
  for (const [k, v] of Object.entries({ "--bk-ground": col?.ground, "--bk-ink": col?.ink, "--bk-seal": col?.seal })) v ? side.style.setProperty(k, v) : side.style.removeProperty(k);
  // and so does the board: the frames' container is the brand's accent, the frames on it its ground (css/macaron.css, .macaron.is-branded)
  const root = shell.root;
  root.classList.toggle("is-branded", !!col);
  const vars = { "--bk-ground": col?.ground, "--bk-ink": col?.ink, "--bk-accent": col ? accentOf(kit) ?? col.seal : null };
  for (const [k, v] of Object.entries(vars)) v ? root.style.setProperty(k, v) : root.style.removeProperty(k);
  const word = col ? wordmarkOn(kit, col.ground) : null;
  const { score, lines } = healthOf(b);
  const tag = initials(b.name);
  fill(side,
    h("div.mcb-top", {},
      h("span.mcb-eyebrow", {}, `Brand room · ${BRIOCHE.name}`),
      h(`div.mcb-brand${word ? ".has-word" : ""}`, {},
        dropdown({
          label: "Brand",
          value: b.id,
          items: [
            // (the brand open shows as its wordmark, when it has one that reads on the panel)
            ...macaron.list.map((x) => ({ value: x.id, label: x.name, ...(x.id === b.id && word ? { glyph: () => h("img.mcb-word", { src: word.url, alt: "", draggable: false }) } : {}) })),
            { value: "__settings", label: "This brand's settings", glyph: () => mcicon("kit") },
            { value: "__new", label: "A new brand", glyph: () => icon("plus") },
          ],
          // (the chip is drawn again: it shows the brand that is open, not the key that was chosen)
          onChange: (id) => (id === "__new" ? (closeAll(), newBrand()) : id === "__settings" ? ((shell.sideSig = ""), openWin("brand")) : (closeAll(), openBrand(id))),
          width: "fill",
        }))),
    h("nav.mcb-fan", { "aria-label": "Workspaces" }, ...SPACES.map((id, i) => {
      const [name, pic, count] = SPACE_INFO[id];
      const c = col?.cards[i];
      return h(`button.mcb-card${id === space ? ".is-on" : ""}`, {
        type: "button",
        "aria-pressed": String(id === space),
        dataset: { space: id },
        style: { ...(c ? { "--c": c.c, "--t": c.t } : {}), "--r": `${[-2, 1.5, -1, 2, -1.5][i]}deg` },
        on: { click: () => (closeAll(), setSpace(id)) },
      },
      h("span.mcb-face", {}, h("span.mcb-num", {}, two(i + 1)), h("b", {}, name)),
      h("img.mcb-pic", { src: pic, alt: "", draggable: false }),
      h("span.mcb-chip", {}, h("span", {}, c ? `${tag} · ${c.c.slice(1).toUpperCase()}` : tag), h("span", {}, two(count(b)))));
    })),
    h("section.mcb-health", { "aria-label": "Brand health" },
      h("div.mcb-seal", { style: { "--v": String(score) }, role: "img", "aria-label": `Brand health: ${score} percent ready` },
        h("img", { src: BRIOCHE.face, alt: "", draggable: false }),
        h("b", {}, `${score}%`)),
      h("div.mcb-lines", {}, ...lines.slice(0, 4).map((l) =>
        h("button.mcb-line", { type: "button", dataset: { tone: l.tone, line: l.id }, title: l.text, on: { click: () => l.go() } }, h("i"), h("span", {}, l.text))))),
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
    const logos = b.body.kit.logos ?? [];
    const mark = logos.find((l) => l.kind === "icon") ?? logos.find((l) => l.kind === "mark") ?? logos[0];
    const stat = (n, label) => h("div.mc-stat", {}, h("b", {}, String(n)), h("span", {}, label));
    const others = macaron.list.filter((x) => x.id !== b.id);
    fill(el,
      h("div.mc-brand-id", {},
        h("span.mc-brand-logo", {}, mark ? h("img", { src: mark.url, alt: "", draggable: false }) : mcicon("kit")),
        h("input.field.mc-text.mc-brand-name", { value: b.name, "aria-label": "The brand's name", placeholder: "The brand's name", dataset: { focus: `name:${b.id}` }, on: { input: (e) => rename(e.target.value) } })),
      h("div.mc-stats", {}, stat(designs.length, designs.length === 1 ? "post" : "posts"), stat(designs.filter((d) => d.status === "approved").length, "ready"), stat(b.body.motion.length, "motion"), stat(b.body.exports.length, "exports"), stat(b.body.assets.length, "pictures")),
      h("div.mc-brand-others", {},
        others.length ? h("div.mc-fchips", {}, h("span.label", {}, "Another brand"), ...others.map((x) => h("button.mc-fchip", { type: "button", on: { click: () => (closeAll(), openBrand(x.id)) } }, x.name))) : null,
        h("button.mc-add-prompt", { type: "button", on: { click: () => (closeAll(), newBrand()) } }, icon("plus"), "A new brand")),
      h("div.mc-brand-end", {},
        h(`button.mc-quiet-danger${isArmed(armedKey) ? ".is-armed" : ""}`, { type: "button", title: isArmed(armedKey) ? "Click again to delete the brand" : "Delete this brand", on: { click: () => arming(armedKey, () => changed("macaron"), () => (closeAll(), removeBrand(b.id))) } }, isArmed(armedKey) ? "Click again to delete it" : "Delete this brand"),
        h("p.mc-hint", {}, "A brand keeps its kit, its brief and moodboard, its pictures and its posts. Deleting it cannot be undone.")));
  }
  return { el, update, sig: () => JSON.stringify([macaron.brand?.name, macaron.list.map((x) => [x.id, x.name]), macaron.brand?.body.kit.logos, macaron.brand?.body.designs.map((d) => [d.id, d.status, d.variant]), macaron.brand?.body.motion.length, macaron.brand?.body.assets.length, macaron.brand?.body.exports.length, armedNow()]) };
}
defineWindow("brand", { eyebrow: "Brand room", title: "The brand", sub: () => macaron.brand?.name ?? "", size: "s", advanced: false, make: brandWin });

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
