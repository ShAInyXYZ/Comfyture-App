// The Create workspace: everything a brand makes from its kit, by family of format. A segmented filter on top (Social, Ads,
// Print, Web, App, Video) says which family leads; the grid fills the height, the family that leads takes the big place and
// the others sit around it. Mockups (a design in a real-world scene) are the one bento every family keeps near. What a bento
// shows are the brand's real designs, drawn by the app's renderer: in the formats it has a layout for, else (dimmed) as it
// would lay out, with a key that makes it so. Starters (a flyer, a banner, a share image...) make a design from the kit in a
// format with a layout that suits it; the New design key opens them.
import { h, icon, sprite } from "./dom.js";
import { changed } from "./store.js";
import { FORMATS, FAMILIES, FAMILY_KEYS, familyOf, ownFormats, ratioGlyph, labelOf, kitOf } from "./design.js";
import { macaron, designById, openDesign, addDesign, adaptFormat, thumb, motionNow, pickMotion, addMotion } from "./macaron.js";
import { bento, mcicon, fill, shortDate } from "./macaron-ui.js";
import { defineWindow, openWin, closeAll } from "./macaron-win.js";
import { view } from "./viewer.js";
import { SCENES, scenePhoto } from "./macaron-mockup-scenes.js";
import { STARTERS, starterById, starterOf } from "./macaron-families.js";

const DAYS = [["mon", "Mon"], ["tue", "Tue"], ["wed", "Wed"], ["thu", "Thu"], ["fri", "Fri"], ["sat", "Sat"], ["sun", "Sun"]];
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

// ---------------------------------------------------------------- starters (the data is macaron-families.js)

export { STARTERS, starterById, starterOf };

/** A design from the kit as a starter says, opened in the editor. The brand's own words are kept when it has some. */
export function startFrom(id, { name } = {}) {
  const s = starterById(id);
  const b = macaron.brand;
  const texts = { headline: b.body.headline ? "" : s.texts?.headline, sub: b.body.tagline ? "" : s.texts?.sub };
  const d = addDesign({ name: name ?? `${b.name} · ${s.name}`, purpose: s.purpose, format: s.format, layout: s.layout, texts, cta: s.cta });
  closeAll();
  openWin("editor");
  return d;
}

// ---------------------------------------------------------------- the family that leads

const FAMILY_KEY = "comfyture.macaron.family";
const savedFamily = (() => {
  try {
    const v = localStorage.getItem(FAMILY_KEY);
    return FAMILY_KEYS.includes(v) ? v : "social";
  } catch {
    return "social";
  }
})();
macaron.family ??= savedFamily;
export function setFamily(f) {
  if (!FAMILY_KEYS.includes(f) || macaron.family === f) return;
  macaron.family = f;
  try {
    localStorage.setItem(FAMILY_KEY, f);
  } catch {}
  changed("macaron");
}

/**
 * Where each bento goes while a family leads: the big place, the two beside it, and the four under. The default (Social) is the
 * design's own: mockups lead. A family that leads takes the big place, mockups and the posts come next to it.
 */
const ORDER = {
  social: ["mock", "soc", "ads", "print", "web", "app", "vid"],
  ads: ["ads", "mock", "soc", "print", "web", "app", "vid"],
  print: ["print", "mock", "soc", "ads", "web", "app", "vid"],
  web: ["web", "mock", "soc", "ads", "print", "app", "vid"],
  app: ["app", "mock", "soc", "ads", "print", "web", "vid"],
  video: ["vid", "mock", "soc", "ads", "print", "web", "app"],
};
const PLACE = ["is-lead", "is-r1", "is-r2", "is-b", "is-b", "is-b", "is-b"];

// ---------------------------------------------------------------- what the bentos show

/** What a format is, as the real thing: its size in the units its family is drawn to scale in (banners and screens in pixels, paper in millimetres). */
const REAL = {
  // (social posts are shown at one height: their ratio, not their size, is what tells them apart)
  "4:5": [800, 1000], "1:1": [1000, 1000], "9:16": [562, 1000], "16:9": [1778, 1000],
  "ad-300x250": [300, 250], "ad-728x90": [728, 90], "ad-160x600": [160, 600],
  // (paper is shown at one height too: an A4 beside an A2 is no help to anyone)
  a4: [707, 1000], a5: [707, 1000], a5l: [1414, 1000], a2: [707, 1000],
  og: [1200, 630], hero: [1440, 900], email: [600, 200], phone: [390, 844], store: [430, 932],
};
const GAP = 14;
const CAP = 24;
/**
 * A row of pictures that shows them to scale (every one drawn at the same number of pixels to a unit, a banner next to a skyscraper
 * as they are), as big as the room allows: sets --s on the row. It is worked out again as the room changes.
 */
function scaled(row, { cap = CAP } = {}) {
  let seen = "";
  const place = () => {
    if (!row.isConnected) return void ro.disconnect();
    const { clientWidth: W, clientHeight: H } = row;
    const kids = [...row.children].filter((c) => !c.hidden);
    if (!W || !H || !kids.length) return;
    const size = kids.map((c) => [Number(c.style.getPropertyValue("--rw")) || 1, Number(c.style.getPropertyValue("--rh")) || 1]);
    const s = Math.min((W - GAP * (kids.length - 1)) / size.reduce((n, [w]) => n + w, 0), (H - cap) / Math.max(...size.map(([, hh]) => hh)));
    const next = s.toFixed(4);
    if (next !== seen) row.style.setProperty("--s", (seen = next));
  };
  const ro = new ResizeObserver(place);
  ro.observe(row);
  return row;
}

/** One picture in a row: a design in a format (as it is, or dimmed as it would lay out), the format's name under it. */
function piece({ d, format, own, click, label }) {
  const [rw, rh] = REAL[format] ?? [FORMATS[format].w, FORMATS[format].h];
  const f = FORMATS[format];
  return h(`button.mc-fi${own ? "" : ".is-ghost"}`, { type: "button", style: { "--rw": String(rw), "--rh": String(rh) }, dataset: { format }, title: own ? `${d.name}\n${f.name} · ${f.use}\nOpen it in the editor` : `${f.name}\nLay ${d.name} out for it`, on: { click: (e) => (e.stopPropagation(), click()) } },
    h("span.mc-fi-pic", {}, thumb(d, { format, width: Math.min(560, Math.max(160, Math.round(rw > 700 ? 560 : 420))) }), own ? null : h("i.mc-fi-make", {}, icon("plus"))),
    h("span.mc-fi-cap", {}, h("b", {}, label ?? labelOf(format))));
}
/** A dashed place for a format with no design at all: a key that starts one. */
function hollow({ format, starter, text }) {
  const [rw, rh] = REAL[format] ?? [FORMATS[format].w, FORMATS[format].h];
  return h("button.mc-fi.is-hollow", { type: "button", style: { "--rw": String(rw), "--rh": String(rh) }, dataset: { format }, title: text ?? `Make ${FORMATS[format].name.toLowerCase()}`, on: { click: (e) => (e.stopPropagation(), startFrom(starter)) } },
    h("span.mc-fi-pic", {}, icon("plus")),
    h("span.mc-fi-cap", {}, h("b", {}, labelOf(format))));
}

const bases = (b) => b.body.designs.filter((d) => !d.variant && !d.motion);
/** The design the others are laid out from when a format has none of its own: the first that is ready, else the first. */
const leadOf = (b) => bases(b).find((d) => d.status === "approved") ?? bases(b)[0] ?? null;
/** For each of some formats, the design that has a layout for it, else the lead design, as a ghost. */
function slots(b, formats, starterFor) {
  const all = bases(b);
  const lead = leadOf(b);
  return formats.map((format) => {
    const mine = all.find((d) => ownFormats(d).includes(format));
    if (mine) return piece({ d: mine, format, own: true, click: () => open(mine.id, format) });
    if (lead) return piece({ d: lead, format, own: false, click: () => (adaptFormat(format, lead.id), openDesign(lead.id, format), closeAll(), openWin("editor")) });
    return hollow({ format, starter: starterFor(format) });
  });
}
const startOf = (format) => STARTERS.find((s) => s.format === format)?.id ?? "post";
const open = (id, format) => (openDesign(id, format), closeAll(), openWin("editor"));
/** A bento's expand key goes to the Posts window, filtered to the family. */
const toPosts = (family) => () => {
  macaron.filter = { ...macaron.filter, family, format: "all" };
  openWin("posts");
};
/** A bento with the number of designs it holds after its name. */
const count = (title, n, ...rest) => {
  const el = bento(...rest);
  el.querySelector(".mc-b-label").append(h("span.mc-b-count", {}, String(n)));
  return el;
};

export function createSpace() {
  const el = h("div.mc-create");
  const bar = h("div.mc-fambar");
  const grid = h("div.mc-grid.is-create");
  el.append(bar, grid);

  // ---- the bentos
  function mock(b) {
    const made = (b.body.mockups ?? []).map((m) => ({ m, asset: b.body.assets.find((a) => a.id === m.asset) })).filter((x) => x.asset?.url).slice(0, 6);
    const fill6 = SCENES.slice(0, 6 - made.length);
    const tile = ({ m, asset }) => h("button.mc-mk", { type: "button", title: `${SCENES.find((s) => s.id === m.scene)?.name ?? "Mockup"} · ${designById(m.design)?.name ?? ""}\nSee it`, on: { click: (e) => (e.stopPropagation(), view(asset.url)) } },
      h("img", { src: asset.url, alt: "", draggable: false, loading: "lazy" }),
      h("span.mc-mk-cap", {}, SCENES.find((s) => s.id === m.scene)?.name ?? "Mockup"));
    const idea = (s) => h("button.mc-mk.is-scene", { type: "button", title: `Place a design in: ${s.name}`, on: { click: (e) => (e.stopPropagation(), pickScene(s.id), openWin("mockup")) } },
      h("img", { src: scenePhoto(s.id), alt: "", draggable: false, loading: "lazy", on: { error: (e) => (e.target.style.visibility = "hidden") } }),
      h("span.mc-mk-cap", {}, s.name),
      h("i.mc-mk-plus", {}, icon("plus")));
    const el2 = count("Mockups", made.length, "is-mock", "Mockups", () => openWin("mockup"),
      h("div.mc-mkgrid", { dataset: { n: String(made.length + fill6.length) } }, ...made.map(tile), ...fill6.map(idea)));
    const newKey = h("button.mc-primary.is-sm", { type: "button", title: "Place a design in a real-world scene", on: { click: (e) => (e.stopPropagation(), openWin("mockup")) } }, icon("plus"), "New mockup");
    const head = el2.querySelector(".mc-b-head");
    head.insertBefore(newKey, head.querySelector(".mc-expand"));
    return el2;
  }

  function soc(b) {
    const list = bases(b).filter((d) => familyOf(d.format) === "social").slice(0, 4);
    const cycle = ["4:5", "1:1", "9:16", "4:5"];
    const row = h("div.mc-fr", {}, ...(list.length ? list.map((d, i) => {
      const own = ownFormats(d);
      const f = own.includes(cycle[i]) ? cycle[i] : d.format;
      return piece({ d, format: f, own: true, click: () => open(d.id, f), label: f === "9:16" ? "Story" : "Post" });
    }) : [hollow({ format: "4:5", starter: "post", text: "Make a social post" }), hollow({ format: "9:16", starter: "story", text: "Make a story" })]));
    return count("Social", bases(b).filter((d) => familyOf(d.format) === "social").length, "is-soc", "Social", toPosts("social"), scaled(row));
  }
  function ads(b) {
    const row = h("div.mc-fr", {}, ...slots(b, FAMILIES.ads.formats, startOf));
    return count("Ads", bases(b).filter((d) => familyOf(d.format) === "ads").length, "is-ads", "Ads", toPosts("ads"), scaled(row));
  }
  function print(b) {
    const own = bases(b).flatMap((d) => ownFormats(d)).filter((f) => ["a5", "a5l"].includes(f));
    const row = h("div.mc-fr", {}, ...slots(b, ["a4", "a2", ...own.slice(0, 1)], startOf));
    return count("Print", bases(b).filter((d) => familyOf(d.format) === "print").length, "is-print", "Print", toPosts("print"), scaled(row));
  }
  function web(b) {
    const [heroSlot, ogSlot, emailSlot] = slots(b, ["hero", "og", "email"], startOf);
    // a browser window holds the hero, the share image and the email header sit under it, to scale
    const small = h("div.mc-fr", {}, ogSlot, emailSlot);
    const browser = h("div.mc-browser", {}, h("div.mc-browser-bar", {}, h("i"), h("i"), h("i"), h("span", {}, `${(b.name || "brand").toLowerCase().replace(/[^a-z0-9]+/g, "") || "brand"}.example`)), h("div.mc-browser-view", {}, scaled(h("div.mc-fr", {}, heroSlot), { cap: 0 })));
    return count("Web", bases(b).filter((d) => familyOf(d.format) === "web").length, "is-web", "Web", toPosts("web"), h("div.mc-webgrid", {}, browser, scaled(small)));
  }
  function app(b) {
    const kit = kitOf(b.body);
    const icon0 = kit.logos.find((l) => l.kind === "icon") ?? kit.logos.find((l) => l.kind === "mark");
    const [screen, store] = slots(b, ["phone", "store"], startOf);
    const home = h("div.mc-fi.is-home", { style: { "--rw": "430", "--rh": "430" }, title: "The app icon on a home screen" },
      h("span.mc-fi-pic", {}, h("span.mc-home", {}, ...[0, 1, 2, 3, 4, 5, 6, 7].map(() => h("i")), icon0 ? h("span.mc-app-icon", {}, h("img", { src: icon0.url, alt: "", draggable: false })) : h("span.mc-app-icon.is-empty", {}, icon("plus")))),
      h("span.mc-fi-cap", {}, h("b", {}, "Icon")));
    const row = h("div.mc-fr.is-phones", {}, screen, store, home);
    return count("App", bases(b).filter((d) => familyOf(d.format) === "app").length, "is-app", "App", toPosts("app"), scaled(row));
  }
  function vid(b) {
    const m = motionNow() ?? b.body.motion[0];
    const d = m && designById(m.design);
    const lead = leadOf(b);
    const covers = bases(b).filter((x) => ownFormats(x).includes("16:9"));
    let reel;
    if (m && d) {
      reel = piece({ d, format: m.format, own: true, click: () => (pickMotion(m.id), openWin("motion")), label: clock(m.duration) });
      reel.querySelector(".mc-fi-pic").append(h("i.mc-vreel-play", {}, icon("play")));
    } else {
      reel = hollow({ format: "9:16", starter: "post", text: "Animate a design" });
      reel.onclick = (e) => (e.stopPropagation(), lead ? (openDesign(lead.id), addMotion(), openWin("motion")) : startFrom("post"));
    }
    const cover = covers[0] ? piece({ d: covers[0], format: "16:9", own: true, click: () => open(covers[0].id, "16:9") })
      : lead ? piece({ d: lead, format: "16:9", own: false, click: () => (adaptFormat("16:9", lead.id), openDesign(lead.id, "16:9"), closeAll(), openWin("editor")) })
      : hollow({ format: "16:9", starter: "cover" });
    return count("Video", b.body.motion.length + covers.length, "is-vid", "Video", () => openWin("motion"), scaled(h("div.mc-fr", {}, reel, cover)));
  }
  function week(b) {
    const posts = bases(b);
    const day = ([k, t]) => {
      const mine = posts.filter((d) => d.plan?.day === k);
      return h("div.mc-wd", { dataset: { day: k, n: String(mine.length) } },
        h("span.mc-wd-name", {}, t),
        h("span.mc-wd-pics", {}, ...mine.slice(0, 2).map((d) => h("button.mc-wd-pic", { type: "button", title: `${d.name}\nOpen it in the editor`, on: { click: (e) => (e.stopPropagation(), open(d.id)) } }, thumb(d, { width: 72 })))));
    };
    const planned = posts.filter((d) => d.plan?.day).length;
    return count("This week", planned, "is-weekstrip", "This week", () => openWin("week"), h("div.mc-wdays", {}, ...DAYS.map(day)));
  }

  const BENTOS = { mock, soc, ads, print, web, app, vid };

  function update() {
    const b = macaron.brand;
    if (!b) return;
    const fam = macaron.family ?? "social";
    const designs = bases(b);
    fill(bar,
      h("div.mc-segs", { role: "group", "aria-label": "Family of formats" }, ...FAMILY_KEYS.map((f) => {
        const n = designs.filter((d) => familyOf(d.format) === f).length;
        return h("button.mc-seg", { type: "button", "aria-pressed": String(fam === f), dataset: { family: f }, title: `${FAMILIES[f].name}: ${FAMILIES[f].formats.map(labelOf).join(", ")}${n ? ` · ${n} ${n === 1 ? "design" : "designs"}` : ""}`, on: { click: () => setFamily(f) } },
          sprite(ratioGlyph(FAMILIES[f].formats[0])), FAMILIES[f].name, n ? h("em", {}, String(n)) : null);
      })),
      h("span.spacer"),
      h("button.mc-primary", { type: "button", title: "A new design from the brand kit: pick what it is for", on: { click: () => openWin("starters") } }, icon("plus"), "New design"));
    grid.dataset.family = fam;
    fill(grid, ...ORDER[fam].map((id, i) => {
      const node = BENTOS[id](b);
      node.classList.add(PLACE[i]);
      return node;
    }), week(b));
  }
  const sig = () => {
    const x = macaron.brand?.body;
    return JSON.stringify([macaron.family, x?.designs?.map((d) => [d.id, d.name, d.status, d.plan, d.format, d.formats && Object.keys(d.formats), d.updatedAt]), x?.motion, x?.mockups, x?.assets?.length, x?.kit?.palette, x?.kit?.logos?.length, x?.products?.length, macaron.motion]);
  };
  return { el, update, sig };
}

// ---------------------------------------------------------------- the mockup the window opens on (macaron-mockup.js reads it)

/** The scene the mockup window opens on, and the design it places. */
export const pickScene = (id) => {
  macaron.mockup = { ...(macaron.mockup ?? {}), scene: id };
};

// ---------------------------------------------------------------- the starters window

function startersWin() {
  const el = h("div.mc-w.is-starters");
  function update() {
    const b = macaron.brand;
    if (!b) return;
    const fam = macaron.family ?? "social";
    const order = [fam, ...FAMILY_KEYS.filter((f) => f !== fam)];
    fill(el, ...order.map((f) => h("section.mc-sec", { dataset: { family: f } },
      h("div.mc-sec-head", {}, h("span.label", {}, FAMILIES[f].name)),
      h("div.mc-stgrid", {}, ...STARTERS.filter((s) => s.family === f).map((s) => {
        const F = FORMATS[s.format];
        const [rw, rh] = REAL[s.format] ?? [F.w, F.h];
        return h("button.mc-st", { type: "button", dataset: { starter: s.id }, title: `${s.name}: ${F.use}`, on: { click: () => startFrom(s.id) } },
          h("span.mc-st-frame", {}, h("i", { style: { "--ar": `${rw} / ${rh}`, "--r": String(rw / rh) } }, mcicon("pencil"))),
          h("span.mc-st-text", {}, h("b", {}, s.name), h("em", {}, F.use)));
      })))));
  }
  return { el, update, sig: () => JSON.stringify([macaron.family, macaron.brand?.id]) };
}
defineWindow("starters", { eyebrow: "Create", title: "New design", sub: () => macaron.brand?.name ?? "", size: "l", advanced: false, make: startersWin });
