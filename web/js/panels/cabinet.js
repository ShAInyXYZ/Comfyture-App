// Cabinet's page. Over it, the shoots as tabs. Then three columns, as in a dressing room: who is dressed and the look picked
// (left), the mirror with the pictures made and the bar that makes them (middle), the shelves of outfits and poses (right).
import { h, icon, sprite, ago, fitTabs } from "../dom.js";
import { toast, changed, openImage, useImage } from "../store.js";
import { dropdown } from "../controls.js";
import { openPicker } from "../picker.js";
import {
  cabinet, loadCabinet, whoNow, setWho, itemOf, toggle, addOwn, removeOwn, set, modelNow, setModel, priceNow,
  newShoot, openShoot, removeShoot, renameShoot, shootNow, again, dropPicture, show,
} from "../cabinet.js";
import { WARDROBE, POSES, WARDROBE_GROUPS, POSE_GROUPS, FORMATS, BACKDROPS, EXAMPLES, combos, wardrobeItem, poseItem } from "../cabinet-shelf.js";

const fail = (e) => toast(e.message, { tone: "crit" });
const BRANDS = { openai: "brand-openai", google: "brand-google", bytedance: "brand-bytedance", qwen: "brand-qwen" };
// the free galleries the shelves are inspired by: free to use in a picture, not to repost, so they are linked, never copied
const GALLERY = {
  outfits: { url: "https://ai-costume-gallery.pages.dev/", name: "COSTUME-DB", what: "outfits" },
  poses: { url: "https://ai-pose-gallery.pages.dev/", name: "POSE-DB", what: "poses" },
};
// (there is no 4:5 glyph: the post's frame is drawn as the nearest, 3:4)
const RATIO = { "4:5": "ratio-3-4", "9:16": "ratio-9-16", "2:3": "ratio-2-3", "3:2": "ratio-3-2" };
const SHELF = { outfits: { items: WARDROBE, groups: WARDROBE_GROUPS, label: "Wardrobe" }, poses: { items: POSES, groups: POSE_GROUPS, label: "Poses" } };

let loading = null;
let failed = null;
let renaming = false;

/** A key that asks twice: the first press arms it. */
function twoStep(label, run, words = "") {
  const key = h("button.key.is-sm.is-quiet", { type: "button", "aria-label": label, title: label }, icon("trash"), words);
  key.addEventListener("click", (e) => {
    e.stopPropagation();
    if (key.classList.contains("is-armed")) return run();
    key.classList.add("is-armed");
    key.replaceChildren(icon("trash"), "Sure?");
  });
  return key;
}

// ---------------------------------------------------------------- the shoots

function renameField(row) {
  const input = h("input.tab-rename", { value: row.name, maxLength: 60, "aria-label": "Shoot name" });
  // (the page is not drawn again while a field in it has the focus: it is let go first)
  const done = (keep) => {
    if (!renaming) return;
    renaming = false;
    if (keep) renameShoot(input.value);
    input.blur();
    changed("cabinet");
  };
  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") done(true);
    if (e.key === "Escape") done(false);
  });
  input.addEventListener("blur", () => done(true));
  requestAnimationFrame(() => (input.focus(), input.select()));
  return input;
}

function tab(row) {
  const active = row.id === cabinet.shoot?.id;
  const name = active ? cabinet.shoot.name : row.name;
  const el = h("div.tab.cab-tab", {
    role: "tab",
    tabindex: "0",
    "aria-selected": String(active),
    title: active ? "Double-click to rename" : `${name}\n${ago(row.updatedAt)}`,
    on: {
      click: () => !active && openShoot(row.id).catch(fail),
      dblclick: () => active && !renaming && ((renaming = true), changed("cabinet")),
      keydown: (e) => (e.key === "Enter" || e.key === " ") && e.target === el && (e.preventDefault(), el.click()),
    },
  },
    row.thumb ? h("img.tab-thumb", { src: row.thumb, alt: "", draggable: false }) : h("span.tab-thumb.is-icon", {}, sprite("product-cabinet")),
    active && renaming ? renameField({ name }) : h("span.tab-name", {}, name),
    active ? h("span.lamp.cab-saved", { dataset: { tone: cabinet.saving }, title: cabinet.saving === "busy" ? "Saving in a moment" : cabinet.saving === "crit" ? "Could not be saved" : "Saved" }) : null);
  return el;
}

function subbar() {
  const tabs = fitTabs(h("nav.tabs.cab-tabs", { role: "tablist", "aria-label": "Shoots" },
    ...(cabinet.list ?? []).map(tab),
    h("button.tab-add", { type: "button", on: { click: () => newShoot().catch(fail) } }, icon("plus"), "New shoot")));
  return h("div.subbar.cab-subbar", {}, h("div.subbar-in", {}, tabs,
    h("div.subbar-actions", { role: "toolbar", "aria-label": "Shoot" }, twoStep("Delete this shoot (its pictures stay in the Library)", () => removeShoot().catch(fail), "Delete"))));
}

// ---------------------------------------------------------------- who, and the look

function pickedRow(kind, b) {
  const keys = b[kind];
  const none = kind === "outfits" ? "Their own clothes" : "A natural pose";
  const goShelf = () => ((cabinet.shelf = kind), changed("cabinet"));
  return h("div.cab-picked", {},
    h("div.cab-picked-head", {}, h("span.cab-sub", {}, kind === "outfits" ? "Outfits" : "Poses"), h("span.cab-count", {}, `${keys.length}/4`)),
    keys.length
      ? h("div.cab-chips", {}, ...keys.map((key) => {
        const it = itemOf(kind, key);
        if (!it) return null;
        return h("span.cab-pick", { title: it.words || it.name },
          h("img", { src: it.thumb, alt: "", draggable: false }), h("span", {}, it.name),
          h("button.cab-pick-x", { type: "button", "aria-label": `Take off ${it.name}`, on: { click: () => toggle(kind, key) } }, icon("close")));
      }))
      : h("button.cab-none", { type: "button", title: `Pick ${kind === "outfits" ? "outfits on the Wardrobe" : "poses on the Poses"} shelf`, on: { click: goShelf } }, none, h("em", {}, "pick on the shelf")));
}

function whoColumn(b) {
  const w = whoNow(b);
  const change = h("button.key.is-sm", {
    type: "button",
    "aria-haspopup": "dialog",
    on: { click: (e) => openPicker(e.currentTarget, { title: "Who to dress", onPick: (c) => setWho(c).catch(fail) }) },
  }, icon("pencil"), "Change");
  const n = combos(b.outfits, b.poses).length;
  return h("aside.cab-col.cab-who", { "aria-label": "Who, and the look" },
    h("section.cab-card", {},
      h("div.cab-card-head", {}, h("h2.cab-label", {}, "Who"), change),
      h("div.cab-portrait", {}, h("img", { src: w.picture, alt: w.name, draggable: false })),
      h("div.cab-name", {}, h("b", {}, w.name), h("span", {}, w.character?.role ?? "From a picture"))),
    h("section.cab-card.cab-look", {},
      h("h2.cab-label", {}, "The look"),
      pickedRow("outfits", b),
      pickedRow("poses", b),
      h("p.cab-note", {}, n === 1 ? "One picture each time you shoot." : `${n} pictures each time you shoot: every outfit in every pose.`)));
}

// ---------------------------------------------------------------- the mirror

function pictureLabel(p) {
  return [itemOf("outfits", p.outfit)?.name ?? "Own clothes", itemOf("poses", p.pose)?.name ?? "Natural pose", FORMATS[p.format]?.name].filter(Boolean).join(" · ");
}

function bigPicture(p, who) {
  if (!p) {
    return h("div.cab-empty", {},
      h("div.cab-recipe", {},
        h("img", { src: who.picture, alt: "", draggable: false }),
        h("span.cab-plus", {}, "+"),
        h("span.cab-slot", {}, sprite("product-cabinet"), "Outfits"),
        h("span.cab-plus", {}, "+"),
        h("span.cab-slot", {}, sprite("pose-rest"), "Poses")),
      h("b", {}, `Dress ${who.name}, pose them, shoot`),
      h("p", {}, "Pick outfits on the Wardrobe and poses on the Poses shelf, choose what the picture is for, then press Shoot. Every picture goes to the Library too."),
      h("div.cab-examples", { "aria-label": "Pictures a shoot gives" }, ...EXAMPLES.map((x) => {
        const said = `${x.who} · ${wardrobeItem(x.outfit)?.name} · ${poseItem(x.pose)?.name}`;
        return h("figure.cab-example", { title: said }, h("img", { src: x.src, alt: said, loading: "lazy", draggable: false }), h("figcaption", {}, said));
      })));
  }
  if (p.status === "running") {
    return h("div.cab-frame.is-busy", {},
      h("div.cab-wait", {}, h("span.lamp", { dataset: { tone: "busy" } }), h("b", {}, "Dressing and posing…"), h("span", {}, pictureLabel(p)),
        h("i.cab-progress", { dataset: { cabJob: p.id }, style: { "--p": String(Math.max(0.04, p.progress ?? 0)) } })));
  }
  if (p.status === "failed") {
    return h("div.cab-frame.is-failed", {},
      h("div.cab-wait", {}, h("span.lamp", { dataset: { tone: "crit" } }), h("b", {}, "That picture didn't work"), h("span.cab-err", { title: p.error }, p.error),
        h("div.cab-actions", {},
          h("button.key.is-sm", { type: "button", on: { click: () => again(p).catch(fail) } }, icon("shuffle"), "Try again"),
          twoStep("Remove it", () => dropPicture(p.id)))));
  }
  const photo = p.photo;
  return h("figure.cab-frame", {},
    h("img.cab-photo", { src: photo.url, alt: pictureLabel(p), draggable: false, on: { click: () => openImage({ refs: [photo], template: "edit" }) } }),
    h("figcaption.cab-caption", {},
      h("span", {}, pictureLabel(p)),
      h("div.cab-actions", {},
        h("button.key.is-sm", { type: "button", title: "The same outfit in the same pose, once more", on: { click: () => again(p).catch(fail) } }, icon("shuffle"), "Again"),
        h("button.key.is-sm", { type: "button", title: "Change it in the Oven: retouch it, ask for something else", on: { click: () => openImage({ refs: [photo], template: "edit" }) } }, sprite("image-edit"), "Edit"),
        h("button.key.is-sm", { type: "button", title: "Use it as the start frame of a shot in Kitchen", on: { click: () => useImage(photo) } }, icon("play"), "Make it move"),
        h("a.key.is-sm.is-icon.is-quiet", { href: `${photo.url}?download=comfyture-cabinet-${p.id}.png`, "aria-label": "Download", title: "Download", download: "" }, icon("download")),
        twoStep("Remove it from the shoot (it stays in the Library)", () => dropPicture(p.id)))));
}

function contactSheet(b) {
  if (!b.pictures.length) return null;
  return h("div.cab-sheet", { role: "list", "aria-label": "The pictures of this shoot", dataset: { scrollKey: "cab-sheet" } },
    ...b.pictures.map((p) => h("button.cab-thumb", {
      type: "button",
      role: "listitem",
      "aria-pressed": String(p.id === cabinet.shown),
      title: pictureLabel(p),
      dataset: { tone: p.status },
      on: { click: () => show(p.id) },
    }, p.photo ? h("img", { src: p.photo.url, alt: "", loading: "lazy", draggable: false }) : h("span.lamp", { dataset: { tone: p.status === "failed" ? "crit" : "busy" } }))));
}

function modelItems() {
  const list = cabinet.models?.models ?? [];
  return [...list.filter((m) => m.router), ...list.filter((m) => !m.router)].map((m) => {
    const groupIcon = m.router ? (BRANDS[m.maker] ? () => sprite(BRANDS[m.maker]) : null) : () => icon("flow");
    return { value: m.id, label: m.name, short: m.short, glyph: groupIcon ?? (() => sprite("image-generate")), desc: m.about, group: m.router ? m.makerName : "Open weights", groupIcon, meta: m.router ? `≈ ${m.credits} cr` : "GPU time" };
  });
}

function shootBar(b) {
  const m = modelNow();
  const { pictures, credits } = priceNow();
  const models = modelItems();
  const notes = h("input.field.cab-notes", {
    type: "text",
    value: b.notes ?? "",
    maxLength: 300,
    placeholder: "Anything else: the light, the mood, a prop in hand…",
    "aria-label": "Anything else for the picture",
    // (while it has the focus the page is not drawn again: what changed meanwhile, a picture made, shows when it is left)
    on: { input: (e) => set("notes", e.target.value), blur: () => changed("cabinet"), keydown: (e) => e.key === "Enter" && pictures && (e.target.blur(), shootNow().catch(fail)) },
  });
  const backdrops = Object.entries(BACKDROPS).map(([id, d]) => ({ value: id, label: d.name, short: d.name, desc: d.words }));
  return h("section.cab-bar", { "aria-label": "How the pictures are made" },
    h("div.cab-bar-row", {},
      h("div.segment.is-inline.cab-formats", { role: "group", "aria-label": "What it is for" },
        ...Object.entries(FORMATS).map(([id, f]) => h("button", { type: "button", title: f.about, "aria-pressed": String(b.format === id), on: { click: () => set("format", id) } }, sprite(RATIO[f.aspect]), f.name))),
      h("div.cab-pickers", {},
        h("div.cab-backdrop", { title: "Where the picture is taken" }, dropdown({ label: "Backdrop", value: b.backdrop, items: backdrops, onChange: (id) => set("backdrop", id) })),
        models.length ? h("div.cab-model", {}, dropdown({ label: "Image model", value: m?.id, items: models, onChange: setModel, note: "What dresses and poses them: a partner model's credits, or Comfy Cloud's GPU time" })) : h("span.cab-note", {}, cabinet.models ? "No image model yet" : "…"))),
    h("div.cab-bar-row", {},
      notes,
      h("button.key.is-primary.cab-shoot", { type: "button", disabled: !m || !pictures, on: { click: () => shootNow().catch(fail) } },
        sprite("image-generate"), pictures === 1 ? "Shoot" : `Shoot ${pictures}`, h("span.cab-price", {}, credits != null ? `≈ ${credits} cr` : "GPU"))));
}

function mirror(b) {
  const p = b.pictures.find((x) => x.id === cabinet.shown) ?? b.pictures[0] ?? null;
  return h("main.cab-col.cab-mirror", { "aria-label": "The mirror" },
    h("div.cab-glass", {}, contactSheet(b), bigPicture(p, whoNow(b))),
    shootBar(b));
}

// ---------------------------------------------------------------- the shelves

function shelfCard(kind, it, b, own) {
  const key = own ? it.id : `shelf:${it.id}`;
  const at = b[kind].indexOf(key);
  return h("div.cab-item", { className: at >= 0 ? "is-picked" : "" },
    h("button.cab-item-pick", { type: "button", "aria-pressed": String(at >= 0), title: it.words ? `${it.name}: ${it.words}` : it.name, on: { click: () => toggle(kind, key) } },
      h("img", { src: it.thumb, alt: "", loading: "lazy", draggable: false }),
      at >= 0 ? h("span.cab-item-n", {}, String(at + 1)) : null,
      h("span.cab-item-name", {}, it.name)),
    own ? h("button.cab-item-x", { type: "button", "aria-label": `Remove ${it.name} from this shoot`, title: "Remove it from this shoot", on: { click: () => removeOwn(kind, it.own.file) } }, icon("close")) : null);
}

function shelf(b) {
  const kind = cabinet.shelf === "poses" ? "poses" : "outfits";
  const s = SHELF[kind];
  const group = cabinet.group[kind] ?? "all";
  const own = (b.own?.[kind] ?? []).map((p) => itemOf(kind, `own:${p.file}`)).filter(Boolean);
  const items = s.items.filter((it) => group === "all" || it.group === group);
  const g = GALLERY[kind];
  const add = h("button.cab-item.cab-add", {
    type: "button",
    title: `A picture of ${kind === "outfits" ? "an outfit or a garment" : "a pose"}: from your computer or the Library`,
    on: { click: (e) => openPicker(e.currentTarget, { title: kind === "outfits" ? "Add an outfit" : "Add a pose", characters: false, onPick: (c) => addOwn(kind, c).catch(fail) }) },
  }, sprite("image-upload"), h("b", {}, kind === "outfits" ? "Your own outfit" : "Your own pose"), h("em", {}, "a picture of it"));
  return h("aside.cab-col.cab-shelf", { "aria-label": "The shelves" },
    h("div.cab-shelf-head", {},
      h("div.segment.cab-shelves", { role: "tablist", "aria-label": "Shelf" },
        ...Object.entries(SHELF).map(([id, x]) => h("button", { type: "button", role: "tab", "aria-selected": String(kind === id), on: { click: () => ((cabinet.shelf = id), changed("cabinet")) } },
          x.label, h("span.count", {}, b[id].length ? `${b[id].length} picked` : String(x.items.length))))),
      h("div.cab-groups", { role: "group", "aria-label": "Show" },
        ...[["all", "All"], ...Object.entries(s.groups)].map(([id, label]) => h("button.cab-group", { type: "button", "aria-pressed": String(group === id), on: { click: () => ((cabinet.group[kind] = id), changed("cabinet")) } }, label)))),
    h("div.cab-grid", { className: kind === "poses" ? "is-poses" : "", dataset: { scrollKey: `cab-shelf-${kind}` } },
      add,
      ...own.map((it) => shelfCard(kind, it, b, true)),
      ...items.map((it) => shelfCard(kind, it, b, false))),
    h("p.cab-gallery", {},
      "More ", g.what, " in ", h("a", { href: g.url, target: "_blank", rel: "noreferrer" }, g.name, icon("open")), " by ギア: free to use in your pictures but not open source, so it isn't copied here. Download one by hand, then add it as your own. No bulk downloads, no reposting."));
}

// ---------------------------------------------------------------- the page

export function renderCabinet(el) {
  if (!cabinet.shoot) {
    // (a cabinet that can't be opened says so once, with a key to try again, rather than asking again and again)
    if (failed) {
      el.replaceChildren(h("div.cab-loading", {}, h("span.lamp", { dataset: { tone: "crit" } }), `The cabinet can't be opened: ${failed}`,
        h("button.key.is-sm", { type: "button", on: { click: () => ((failed = null), changed("cabinet")) } }, "Try again")));
      return;
    }
    loading ??= loadCabinet().catch((e) => (failed = e.message)).finally(() => ((loading = null), changed("cabinet")));
    el.replaceChildren(h("div.cab-loading", {}, h("span.lamp", { dataset: { tone: "busy" } }), "Opening the cabinet…"));
    return;
  }
  const b = cabinet.shoot.body;
  el.replaceChildren(subbar(), h("div.cab-room", {}, whoColumn(b), mirror(b), shelf(b)));
}
