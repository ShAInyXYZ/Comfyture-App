// The Brand kit workspace: the palette first, then the logos (the wordmark, the mark and the app icon, with the
// other colourways passing by like a marquee), the type, the voice, the rules and the product. Each bento is a
// picture of its part of the kit; opened, it is the part's window, with an Advanced switch for the finer controls.
import { h, icon, sprite } from "./dom.js";
import { toast } from "./store.js";
import { contrast, colorOf, kitOf, luminance } from "./design.js";
import {
  macaron, setColour, addColour, setColourField, setWords, setKit, setType, addLogoFile, removeLogo, setLogoField, addRule, setRule, removeRule, productNow, setColourway, kitFiles,
} from "./macaron.js";
import { bento, mcicon, key, chip, chooseFiles, arming, isArmed, armedNow, marquee, fill, seg } from "./macaron-ui.js";
import { defineWindow, openWin, isAdvanced } from "./macaron-win.js";
import { productParts } from "./macaron-assets.js";
import { draftKey } from "./macaron-tools.js";

const KINDS = [["wordmark", "Wordmark"], ["mark", "Mark"], ["icon", "App icon"]];
const norm = (s) => String(s ?? "").trim().toLowerCase();
const ratio = (a, b) => `${contrast(a, b).toFixed(1)}`;
const inkOn = (hex) => (contrast(hex, "#211927") >= contrast(hex, "#F0EFED") ? "#211927" : "#F0EFED");
const plain = (name) => (/white/i.test(name) ? "White" : name);

/** The palette colour of a logo file's tone: the colour it is drawn in. */
const toneOf = (kit, l) => kit.palette.find((p) => p.id === l.tone) ?? { id: l.tone, name: String(l.tone ?? "").startsWith("#") ? l.tone : "Colour", hex: colorOf(kit, l.tone, "#888888") };

/** The ground a logo file is for: the first of the colours its note names, else the one it reads best on. */
export function groundOf(kit, l) {
  for (const n of String(l.ground ?? "").split(",").map(norm).filter(Boolean)) {
    const p = kit.palette.find((x) => norm(x.id) === n || norm(x.name) === n || (n === "warm white" && /white/i.test(x.name)));
    if (p) return p;
  }
  const dark = kit.palette.find((x) => /ink|dark/i.test(`${x.id} ${x.name}`)) ?? { id: "ink", name: "Ink", hex: "#19191c" };
  const light = kit.palette.find((x) => /white|light/i.test(`${x.id} ${x.name}`)) ?? { id: "white", name: "Warm white", hex: "#F0EFED" };
  return luminance(colorOf(kit, l.tone, "#888888")) > 0.3 ? dark : light;
}
export const wayName = (kit, l) => (l.kind === "icon" ? `${plain(toneOf(kit, l).name)} app icon` : `${plain(toneOf(kit, l).name)} on ${norm(plain(groundOf(kit, l).name))}`);
const kindName = (k) => KINDS.find(([v]) => v === k)?.[1] ?? "Logo";

/** What a logo file sits on in the kit's tiles: the ground it is for; an app icon is its own tile and sits on a neutral one. */
const sitsOn = (kit, l) => (l.kind === "icon" ? { id: "neutral", name: "Neutral", hex: "#1c1c20" } : groundOf(kit, l));

/** The tones the kit's files come in, in the order they first appear. */
const tonesOf = (kit) => [...new Set(kit.logos.map((l) => l.tone).filter(Boolean))];
/** The file of a kind in a tone, else the first of the kind. */
const fileOf = (kit, kind, tone) => kit.logos.find((l) => l.kind === kind && l.tone === tone) ?? kit.logos.find((l) => l.kind === kind) ?? null;

const hex6 = (v) => (/^#[0-9a-f]{6}$/i.test(v) ? v.toUpperCase() : null);

// ---------------------------------------------------------------- the workspace

export function kitSpace() {
  const el = h("div.mc-grid.is-kit");
  let marq = null;

  function palette(kit) {
    const total = kit.palette.reduce((n, p) => n + (p.share || 0), 0);
    if (!kit.palette.length) return bento("is-palette", "Palette", () => openWin("palette"), h("button.mc-empty-tile", { type: "button", on: { click: (e) => (e.stopPropagation(), addColour(), openWin("palette")) } }, icon("plus"), h("span", {}, "Add the brand's colours")));
    return bento("is-palette", "Palette", () => openWin("palette"),
      h("div.mc-sw-row", {}, ...kit.palette.map((p) => h("button.mc-sw", { type: "button", title: `${p.name} ${p.hex}`, style: { "--c": p.hex, "--ink": inkOn(p.hex) }, dataset: { id: p.id }, on: { click: () => openWin("palette") } },
        h("span.mc-sw-hex", {}, p.hex.toUpperCase()), h("span.mc-sw-role", {}, p.role || p.name)))),
      total ? h("div.mc-share", { title: "How much of a page each colour takes" }, ...kit.palette.filter((p) => p.share).map((p) => h("i", { style: { flex: String(p.share), background: p.hex } }))) : null);
  }

  function logos(kit) {
    const tones = tonesOf(kit);
    const tone = macaron.colourway && tones.includes(macaron.colourway) ? macaron.colourway : tones[0];
    const hero = KINDS.map(([k]) => fileOf(kit, k, tone)).filter(Boolean);
    const shown = new Set(hero.map((l) => l.id));
    const rest = kit.logos.filter((l) => !shown.has(l.id));
    const tile = (l, cls) => {
      const g = sitsOn(kit, l);
      return h(`div.mc-ctile${cls ? `.${cls}` : ""}`, { style: { "--ground": g.hex }, title: `${l.name}\n${wayName(kit, l)}`, dataset: { kind: l.kind } }, h("img", { src: l.url, alt: l.name, draggable: false }));
    };
    const way = (l) => {
      const g = sitsOn(kit, l);
      return h("button.mc-ctile.is-way", { type: "button", style: { "--ground": g.hex }, title: `${wayName(kit, l)}\nPut it in the big tiles`, "aria-label": wayName(kit, l), dataset: { kind: l.kind, tone: l.tone }, on: { click: () => setColourway(l.tone) } }, h("img", { src: l.url, alt: "", draggable: false, loading: "lazy" }));
    };
    const track = h("div.mc-marq-track", {}, ...rest.map(way), ...rest.map(way));
    const view = h("div.mc-marq-view", {}, track);
    marq = marquee("kit-logos", view, track);
    return bento("is-logos", "Logos", () => openWin("logos"),
      kit.logos.length ? h("div.mc-logo-hero", {}, ...hero.map((l) => tile(l, `is-${l.kind}`))) : h("button.mc-empty-tile", { type: "button", on: { click: () => openWin("logos") } }, icon("plus"), h("span", {}, "Add the logo files")),
      rest.length ? h("div.mc-marq", { "data-keep": "" }, h("button.mc-marq-arrow", { type: "button", title: "Back", "aria-label": "Back", on: { click: () => marq.step(-1) } }, mcicon("chevLeft")), view, h("button.mc-marq-arrow", { type: "button", title: "On", "aria-label": "On", on: { click: () => marq.step(1) } }, mcicon("chev"))) : null);
  }

  function type(kit) {
    const t = kit.type;
    return bento("is-type", "Type", () => openWin("type"),
      h("div.mc-type-pair", {},
        h("div.mc-spec", {}, h("b.mc-aa", { style: { fontFamily: `"${t.display.family}", var(--font-sans)`, fontWeight: t.display.weight } }, "Aa"), h("span.mc-spec-name", {}, t.display.family), h("span.mc-spec-abc", { style: { fontFamily: `"${t.display.family}", var(--font-sans)` } }, "ABCDEFGHIJKLMNOPQRSTUVWXYZ", h("br"), "abcdefghijklmnopqrstuvwxyz", h("br"), "0123456789")),
        h("div.mc-spec.is-mono", {}, h("b.mc-aa", { style: { fontFamily: `"${t.mono.family}", var(--font-mono)`, fontWeight: t.mono.weight } }, "01"), h("span.mc-spec-name", {}, t.mono.family), h("span.mc-spec-abc", { style: { fontFamily: `"${t.mono.family}", var(--font-mono)` } }, "ABCDEFGHIJKLMNOPQRSTUVWXYZ", h("br"), "abcdefghijklmnopqrstuvwxyz", h("br"), "0123456789"))));
  }

  function voice(kit) {
    const v = macaron.brand.body.kit.voice ?? {};
    const words = (v.words ?? kit.voice?.words ?? []).slice(0, 3);
    const say = (v.lines ?? [])[0]?.say ?? v.summary ?? "";
    return bento("is-voice", "Voice", () => openWin("voice"),
      h("div.mc-chips", {}, ...words.map((w, i) => h(`span.mc-chip${i === 0 ? ".is-on" : ""}`, {}, w[0].toUpperCase() + w.slice(1)))),
      say ? h("blockquote.mc-quote", {}, h("span", {}, "“"), say.replace(/^["“]|["”]$/g, ""), h("span", {}, "”")) : h("p.mc-hint", {}, "How the brand talks: a few words and a line."));
  }

  function rules(kit) {
    const mark = kit.logos.find((l) => l.kind === "mark" && /yellow|white/.test(l.tone)) ?? kit.logos.find((l) => l.kind === "mark") ?? kit.logos[0];
    const sizes = macaron.brand.body.kit.sizes ?? { mark: 24, wordmark: 96 };
    return bento("is-rules", "Rules", () => openWin("rules"),
      h("div.mc-rule-pair", {},
        h("div.mc-clear", { title: "Clear space on every side equals the height of the lid" },
          h("i.mc-clear-box"), ...["nw", "ne", "sw", "se"].map((c) => h(`b.mc-clear-c.is-${c}`, {}, "C")), mark ? h("img", { src: mark.url, alt: "", draggable: false }) : null),
        h("div.mc-minsize", {}, h("div.mc-min-mark", {}, mark ? h("img", { src: mark.url, alt: "", draggable: false }) : null, h("i")), h("b", {}, `${sizes.mark} px`), h("span", {}, "Minimum size"))));
  }

  function product(b) {
    const p = productNow(b);
    const pet = b.body.assets.find((a) => a.id === "brioche" || (a.kind === "mascot" && a.clear))?.url ?? "brand/macaron/comfyture/brioche.webp";
    return bento("is-product", "Product", () => openWin("product"),
      p ? h("div.mc-scene", {},
        p.scene ? h("img.mc-scene-bg", { src: p.scene, alt: "", draggable: false }) : null,
        h("img.mc-scene-pet", { src: pet, alt: "", draggable: false }),
        h("img.mc-scene-jar", { src: p.cutout?.url ?? p.photo.url, alt: p.name, title: p.name, draggable: false }))
        : h("button.mc-empty-tile", { type: "button", on: { click: () => openWin("product") } }, icon("plus"), h("span", {}, "Add a product")));
  }

  function update() {
    const b = macaron.brand;
    if (!b) return;
    const kit = kitOf(b.body);
    fill(el, palette(kit), logos(kit), type(kit), voice(kit), rules(kit));
    marq?.start();
  }
  const sig = () => {
    const b = macaron.brand?.body;
    return JSON.stringify([b?.kit, b?.colours, b?.logo, b?.products, b?.product, b?.assets?.length, macaron.colourway]);
  };
  return { el, update, sig };
}

// ---------------------------------------------------------------- the windows

/** A line of the brand's kit as a small field: it saves as it is typed. */
const field = (value, set, o = {}) => h(`${o.rows ? "textarea" : "input"}.field.mc-text${o.cls ? `.${o.cls}` : ""}`, { value: value ?? "", rows: o.rows, placeholder: o.placeholder ?? "", "aria-label": o.label ?? o.placeholder ?? "Text", spellcheck: !!o.rows, dataset: o.focus ? { focus: o.focus } : {}, on: { input: (e) => set(e.target.value) } });
const typingIn = (el) => el.contains(document.activeElement) && document.activeElement.matches("input:not([type=color]):not([type=number]), textarea");

// ---------------------------------------------------------------- the windows (their layouts: docs/brand/products/macaron-v3)

/** How a colour reads: the better of ink and warm white on it, and the grade the standard gives that ratio. */
const reads = (hex) => {
  const r = Math.max(contrast(hex, "#211927"), contrast(hex, "#F0EFED"));
  return [r, r >= 7 ? "AAA" : r >= 4.5 ? "AA" : r >= 3 ? "AA large" : "Low"];
};
const grade = (r) => (r >= 7 ? "AAA" : r >= 4.5 ? "AA" : r >= 3 ? "AA large" : "Low");
const svgIcon = (cls, paths) => {
  const s = h(`span.${cls}`);
  s.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  return s;
};
/** A list's mark: a ring with a tick (kept) or a cross (never). */
const ring = (tone) => h(`span.kv-ring.is-${tone}`, {}, icon(tone === "do" ? "check" : "close"));

function paletteWin() {
  const el = h("div.mc-w.is-palette");
  const rerender = () => update();

  /** The proportions of a page: one bar; in Advanced a divider can be dragged (the bar moves with the pointer, the shares are kept when it is let go). */
  function shareBar(kit, adv) {
    const list = kit.palette.map((p, i) => ({ p, i })).filter(({ p }) => p.share > 0);
    const total = list.reduce((n, { p }) => n + p.share, 0);
    const bar = h("div.kp-share", { title: "How much of a page each colour takes" });
    const label = (flex) => `${Math.round((flex / total) * 100)}%`;
    const segs = list.map(({ p }) => h("i", { style: { flex: String(p.share), background: p.hex, color: inkOn(p.hex) }, title: `${p.name} ${label(p.share)}` }, h("span", {}, label(p.share))));
    list.forEach((_, k) => {
      bar.append(segs[k]);
      if (!adv || k === list.length - 1) return;
      const grip = h("b.kp-grip", { title: "Drag to change how much each takes", role: "separator" }, h("u"));
      grip.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        grip.setPointerCapture(e.pointerId);
        const width = bar.getBoundingClientRect().width;
        const a0 = list[k].p.share;
        const b0 = list[k + 1].p.share;
        const x0 = e.clientX;
        let now = null;
        const move = (ev) => {
          const a = Math.max(1, Math.min(a0 + b0 - 1, a0 + Math.round(((ev.clientX - x0) / width) * total)));
          now = [a, a0 + b0 - a];
          segs[k].style.flex = String(now[0]);
          segs[k + 1].style.flex = String(now[1]);
          segs[k].firstChild.textContent = label(now[0]);
          segs[k + 1].firstChild.textContent = label(now[1]);
        };
        const up = () => {
          grip.removeEventListener("pointermove", move);
          grip.removeEventListener("pointerup", up);
          grip.removeEventListener("pointercancel", up);
          if (!now) return;
          setColourField(list[k].i, { share: now[0] });
          setColourField(list[k + 1].i, { share: now[1] });
        };
        grip.addEventListener("pointermove", move);
        grip.addEventListener("pointerup", up);
        grip.addEventListener("pointercancel", up);
      });
      bar.append(grip);
    });
    return bar;
  }

  function update() {
    const b = macaron.brand;
    if (!b || typingIn(el)) return typingIn(el) ? false : undefined;
    const kit = kitOf(b.body);
    const adv = isAdvanced("palette");
    const cards = kit.palette.map((p, i) => {
      const [r, g] = reads(p.hex);
      const armedKey = `colour:${p.id}`;
      return h("article.kp-card", { style: { "--c": p.hex, "--ink": inkOn(p.hex) } },
        h("label.kp-sw", { title: "Click to change the colour" },
          h("input", { type: "color", value: p.hex.toLowerCase(), "aria-label": `${p.name} colour`, on: {
            input: (e) => { const card = e.target.closest(".kp-card"); card.style.cssText = `--c:${e.target.value};--ink:${inkOn(e.target.value)}`; card.querySelector(".kp-hex").textContent = e.target.value.toUpperCase(); },
            change: (e) => setColour(i, e.target.value) } }),
          h("span.kp-badge", { title: `Best it reads on ink or warm white: ${r.toFixed(1)} : 1` }, `${g} ${r.toFixed(1)}`),
          h("b.kp-hex", {}, p.hex.toUpperCase())),
        field(p.name, (v) => setColourField(i, { name: v.slice(0, 24) }), { label: "The colour's name", cls: "kp-name", focus: `pname:${p.id}` }),
        field(p.role, (v) => setColourField(i, { role: v.slice(0, 30) }), { placeholder: "What it is for", cls: "kp-role", focus: `prole:${p.id}` }),
        adv ? h("div.kp-adv", {},
          h("label.kp-row", {}, h("span.label", {}, "Hex"), field(p.hex.toUpperCase(), (v) => hex6(v) && setColour(i, hex6(v)), { label: "Hex", placeholder: "#RRGGBB", cls: "kp-hexfield", focus: `phex:${p.id}` })),
          h("label.kp-row", {}, h("span.label", {}, "Share"), h("div.kp-num", {}, h("input", { type: "number", min: 0, max: 100, step: 1, value: p.share ?? 0, "aria-label": `${p.name} share of a page`, on: { change: (e) => setColourField(i, { share: Math.max(0, Math.min(100, Number(e.target.value) || 0)) }) } }), h("em", {}, "%"))),
          h("label.kp-row.is-note", {}, h("span.label", {}, "Notes"), field(p.note, (v) => setColourField(i, { note: v.slice(0, 160) }), { rows: 2, placeholder: "How and where it is used", cls: "kp-note", focus: `pnote:${p.id}` })),
          kit.palette.length > 1 ? h(`button.mc-iconkey.is-danger.kp-trash${isArmed(armedKey) ? ".is-armed" : ""}`, { type: "button", title: isArmed(armedKey) ? "Click again to take it out" : "Take it out of the palette", "aria-label": "Take it out of the palette", on: { click: () => arming(armedKey, rerender, () => setColour(i, null)) } }, icon("trash")) : null) : null);
    });
    const addTile = (adv || !kit.palette.length) && kit.palette.length < 8 ? h("button.kp-add", { type: "button", title: "Add a colour", on: { click: () => addColour() } }, icon("plus"), h("span", {}, "Add a colour")) : null;
    const pairs = kit.palette.flatMap((a, i) => kit.palette.slice(i + 1).map((c) => [a, c, contrast(a.hex, c.hex)]));
    const shared = kit.palette.some((p) => p.share > 0);
    fill(el,
      h("div.kp-grid", {}, ...cards, addTile),
      shared ? h("section.mc-sec", {}, h("span.label", {}, "Colour proportions"), shareBar(kit, adv)) : null,
      adv ? h("section.mc-sec", {}, h("span.label", {}, "How colours read on each other"),
        h("div.kp-pairs", {}, ...pairs.map(([a, c, r]) => h("div.kp-pair", { title: `${c.name} on ${a.name}: ${r.toFixed(1)} : 1` },
          h("span.kp-aa", { style: { background: a.hex, color: c.hex } }, "Aa"),
          h("b", {}, `${c.name} on ${a.name}`), h("em", { dataset: { tone: r >= 4.5 ? "ok" : r >= 3 ? "warn" : "crit" } }, `${grade(r)} ${r.toFixed(1)}`)))))
        : h("p.mc-hint", {}, "Click a colour to change it. Advanced adds colours, shares and how they read on each other."));
  }
  const sig = () => JSON.stringify([macaron.brand?.body.kit.palette, armedNow()]);
  return { el, update, sig };
}
defineWindow("palette", { eyebrow: "Brand kit", title: "Palette", sub: () => macaron.brand?.name ?? "", size: "l", advanced: true, make: paletteWin });

const BLURB = { wordmark: "Primary logo for titles, headers and end cards.", mark: "Simplified mark for small spaces and animations.", icon: "Square icon for app stores and shortcuts." };

function logosWin() {
  const el = h("div.mc-w.is-logos");
  const rerender = () => update();
  // the ground the whole library is looked at on ("all": each file on the ground it is for)
  let on = "all";
  const addFile = (kind) => chooseFiles((f) => addLogoFile(f, kind, ""), true, "image/svg+xml,image/png,image/webp");
  function update() {
    const b = macaron.brand;
    if (!b || typingIn(el)) return typingIn(el) ? false : undefined;
    const kit = kitOf(b.body);
    const adv = isAdvanced("logos");
    const tones = tonesOf(kit);
    const grounds = [...new Map(kit.logos.filter((l) => l.kind !== "icon").map((l) => groundOf(kit, l)).map((g) => [g.id, g])).values()];
    if (on !== "all" && !grounds.some((g) => g.id === on)) on = "all";
    const cell = (l) => {
      const g = on === "all" ? sitsOn(kit, l) : grounds.find((x) => x.id === on);
      return h("figure.kl-cell", {},
        h("div.kl-tile", { style: { "--ground": g.hex, "--ink": inkOn(g.hex) }, dataset: { kind: l.kind }, title: l.name },
          h("img", { src: l.url, alt: l.name, draggable: false, loading: "lazy" }),
          h("a.kl-dl", { href: l.url, download: l.url.split("/").pop(), title: `Download ${l.name}`, "aria-label": `Download ${l.name}` }, icon("download"))),
        h("figcaption", {}, wayName(kit, l)));
    };
    const rows = KINDS.filter(([k]) => kit.logos.some((l) => l.kind === k)).map(([k, label]) => {
      const have = tones.map((t) => kit.logos.find((x) => x.kind === k && x.tone === t)).filter(Boolean);
      const left = kit.logos.filter((x) => x.kind === k && !have.includes(x));
      return h("section.kl-row", {},
        h("div.kl-id", {}, h("b", {}, label), h("p", {}, BLURB[k])),
        h("div.kl-tiles", { style: { "--n": String(Math.max(4, have.length + left.length) + 1) } }, ...have.map(cell), ...left.map(cell),
          h("figure.kl-cell", {}, h("button.kl-tile.is-add", { type: "button", title: `Add a ${label.toLowerCase()} file`, on: { click: () => addFile(k) } }, icon("plus"), h("span", {}, "Add a file")), h("figcaption", {}, " "))));
    });
    fill(el,
      kit.logos.length ? h("div.kl-top", {}, h("span.label", {}, "Preview on"),
        h("div.mc-segs", { role: "group", "aria-label": "Preview on" },
          h("button.mc-seg", { type: "button", "aria-pressed": String(on === "all"), title: "Each file on the ground it is for", on: { click: () => ((on = "all"), rerender()) } }, "All"),
          ...grounds.map((g) => h("button.mc-seg", { type: "button", "aria-pressed": String(on === g.id), title: `Every file on ${g.name}`, on: { click: () => ((on = g.id), rerender()) } }, plain(g.name))))) : null,
      kit.logos.length ? h("div.kl-library", {}, ...rows) : h("button.mc-add-prompt", { type: "button", on: { click: () => addFile("wordmark") } }, icon("plus"), "Add the logo files: a wordmark, the mark, an app icon"),
      adv ? h("section.kl-files", {}, h("div.mc-sec-head", {}, h("span.label", {}, "The files"), h("button.mc-iconkey", { type: "button", title: "Add a logo file (SVG or PNG)", "aria-label": "Add a logo file", on: { click: () => addFile("wordmark") } }, icon("plus"))),
        ...kit.logos.map((l) => {
          const armedKey = `logo:${l.id}`;
          return h("div.kl-file", {},
            h("img", { src: l.url, alt: "", draggable: false }),
            field(l.name, (v) => setLogoField(l.id, { name: v.slice(0, 40) }), { label: "The file's name", cls: "kl-f-name", focus: `lname:${l.id}` }),
            h("select.kl-select", { "aria-label": "What it is", on: { change: (e) => setLogoField(l.id, { kind: e.target.value }) } }, ...KINDS.map(([v, t]) => h("option", { value: v, selected: v === l.kind }, t))),
            h("select.kl-select", { "aria-label": "The colour it is drawn in", on: { change: (e) => setLogoField(l.id, { tone: e.target.value }) } }, ...kit.palette.map((p) => h("option", { value: p.id, selected: p.id === l.tone }, plain(p.name)))),
            field(l.ground, (v) => setLogoField(l.id, { ground: v.slice(0, 60) }), { placeholder: "Grounds it is for", label: "The grounds it is for", cls: "kl-f-ground", focus: `lground:${l.id}` }),
            h(`button.mc-iconkey.is-danger${isArmed(armedKey) ? ".is-armed" : ""}`, { type: "button", title: isArmed(armedKey) ? "Click again to take it out of the kit" : "Take it out of the kit", "aria-label": "Take it out of the kit", on: { click: () => arming(armedKey, rerender, () => removeLogo(l.id)) } }, icon("trash")));
        }),
        h("p.mc-hint", {}, "Always the supplied files: never redrawn, stretched, tilted or recoloured.")) : null);
  }
  const sig = () => JSON.stringify([macaron.brand?.body.kit.logos, macaron.brand?.body.kit.palette, armedNow()]);
  return { el, update, sig };
}
defineWindow("logos", { eyebrow: "Brand kit", title: "Logos", sub: () => macaron.brand?.name ?? "", size: "l", advanced: true, make: logosWin });

function typeWin() {
  const el = h("div.mc-w.is-type");
  function update() {
    const b = macaron.brand;
    if (!b || typingIn(el)) return typingIn(el) ? false : undefined;
    const kit = kitOf(b.body);
    const adv = isAdvanced("type");
    const pitch = String(b.body.brief?.pitch ?? "").split(/(?<=[.!?])\s/)[0].trim();
    const say = (b.body.kit.voice?.lines ?? [])[0]?.say;
    const roles = [
      ["display", "Display", "For big ideas", pitch && pitch.length <= 60 ? pitch : b.name, "Headlines, big statements and key messages."],
      ["text", "Text", "For everything else", say || "One photo in, a shot with sound out.", "Body copy, UI text and supporting information."],
      ["mono", "Mono", "For numbers and labels", "01 · 16:9 · 24 FPS", "Numbers, technical details and UI labels."],
    ];
    fill(el, ...roles.map(([role, label, tag, sample, use]) => {
      const t = kit.type[role];
      const face = `"${t.family}", var(--font-${role === "mono" ? "mono" : "sans"})`;
      const step = (d) => setType(role, { weight: Math.max(300, Math.min(900, (Number(t.weight) || 400) + d)) });
      return h("section.kt-row", { dataset: { role } },
        h("div.kt-id", {}, h("b", {}, label), h("span", {}, tag)),
        h("div.kt-sample", {},
          h("span.kt-aa", { style: { fontFamily: face, fontWeight: t.weight } }, "Aa"),
          h("span.kt-line", { style: { fontFamily: face, fontWeight: t.weight } }, sample)),
        h("div.kt-spec", {},
          h("label.kt-field", {}, h("span.label", {}, "Family"), field(t.family, (v) => setType(role, { family: v.slice(0, 40) }), { label: `${label} typeface`, cls: "kt-fam", focus: `tfam:${role}` })),
          h("div.kt-field", {}, h("span.label", {}, "Weight"),
            h("div.kt-stepper", { role: "group", "aria-label": `${label} weight` },
              h("button", { type: "button", title: "Lighter", "aria-label": "Lighter", disabled: t.weight <= 300, on: { click: () => step(-100) } }, mcicon("chevLeft")),
              h("b", {}, String(t.weight)),
              h("button", { type: "button", title: "Heavier", "aria-label": "Heavier", disabled: t.weight >= 900, on: { click: () => step(100) } }, mcicon("chev")))),
          h("label.kt-field", {}, h("span.label", {}, "Used for"),
            adv ? field(t.use ?? use, (v) => setType(role, { use: v.slice(0, 80) }), { placeholder: "What it is for", label: `${label} use`, cls: "kt-use", focus: `tuse:${role}` }) : h("p.kt-text", {}, t.use ?? use))));
    }));
  }
  const sig = () => JSON.stringify([macaron.brand?.body.kit.type, macaron.brand?.body.brief?.pitch]);
  return { el, update, sig };
}
defineWindow("type", { eyebrow: "Brand kit", title: "Type", sub: () => macaron.brand?.name ?? "", size: "l", advanced: true, make: typeWin,
  foot: () => [draftKey("Brioche can draft this", "A pairing that suits the brand", "Suggest a type pairing for this brand: a display face, a text face and a mono, with the weights, from its brief and voice.")] });

function voiceWin() {
  const el = h("div.mc-w.is-voice");
  const rerender = () => update();
  function update() {
    const b = macaron.brand;
    if (!b || typingIn(el)) return typingIn(el) ? false : undefined;
    const kit = b.body.kit;
    const v = kit.voice ?? (kit.voice = { summary: "", words: [], dos: [], donts: [], lines: [] });
    const adv = isAdvanced("voice");
    const lines = (v.lines ??= []);
    const list = (path, items, placeholder, tone) => h("div.kv-list", {}, ...items.map((text, i) =>
      h("div.kv-item", {}, ring(tone),
        h("input.kv-in", { value: text, placeholder, "aria-label": placeholder, on: { input: (e) => { items[i] = e.target.value.slice(0, 140); setKit(path, items); } } }),
        h("button.mc-iconkey.kv-x", { type: "button", title: "Take it out", "aria-label": "Take it out", on: { click: () => (items.splice(i, 1), setKit(path, items), rerender()) } }, icon("close")))),
      items.length < 8 ? h("button.mc-add-prompt", { type: "button", on: { click: () => (items.push(""), setKit(path, items), rerender()) } }, icon("plus"), "Add one") : null);
    const setLine = (i, k, text) => ((lines[i][k] = text.slice(0, 120)), setKit("voice.lines", lines));
    fill(el,
      h("section.mc-sec.kv-top", {},
        h("span.label", {}, "Voice words"),
        h("div.kv-pills", {}, ...(v.words ?? []).slice(0, 6).map((w, i) => h(`span.kv-pill${i === 0 ? ".is-on" : ""}`, {}, w[0]?.toUpperCase() + w.slice(1)))),
        h("input.field.kv-words", { value: (v.words ?? []).join(", "), placeholder: "warm, plain, playful", title: "Up to six words, separated by commas", "aria-label": "Voice words", on: { change: (e) => setWords("voice", e.target.value.split(",").map((w) => w.trim()).filter(Boolean).slice(0, 6)) } }),
        field(v.summary, (t) => setKit("voice.summary", t.slice(0, 300)), { rows: 2, placeholder: "How the brand talks, in a sentence", cls: "mc-statement.kv-sum", label: "How the brand talks", focus: "vsum" })),
      h("section.mc-sec", {},
        h("div.kv-cols", {}, h("span.label", {}, "Say"), h("span.label", {}, "Never say")),
        ...lines.map((l, i) => h("div.kv-pair", {},
          h("div.kv-item", {}, ring("do"), field(l.say, (t) => setLine(i, "say", t), { placeholder: "Say", cls: "kv-in", focus: `say:${i}` })),
          h("div.kv-item.is-not", {}, ring("dont"), field(l.not, (t) => setLine(i, "not", t), { placeholder: "Not this", cls: "kv-in", focus: `not:${i}` }),
            h("button.mc-iconkey.kv-x", { type: "button", title: "Take the pair out", "aria-label": "Take the pair out", on: { click: () => (lines.splice(i, 1), setKit("voice.lines", lines), rerender()) } }, icon("close"))))),
        lines.length < 8 ? h("button.mc-add-prompt", { type: "button", on: { click: () => (lines.push({ say: "", not: "" }), setKit("voice.lines", lines), rerender()) } }, icon("plus"), "A line in the brand's voice") : null),
      adv ? h("section.mc-sec", {}, h("div.kv-cols", {}, h("span.label", {}, "Do"), h("span.label", {}, "Don't")),
        h("div.kv-two", {}, list("voice.dos", v.dos ?? (v.dos = []), "Do this", "do"), list("voice.donts", v.donts ?? (v.donts = []), "Not this", "dont"))) : null);
  }
  const sig = () => JSON.stringify([macaron.brand?.body.kit.voice]);
  return { el, update, sig };
}
defineWindow("voice", { eyebrow: "Brand kit", title: "Voice", sub: () => macaron.brand?.name ?? "", size: "m", advanced: true, make: voiceWin,
  foot: () => [draftKey("Brioche can write more lines", "More on-brand examples, or another angle", "Write three more lines in the brand's voice, each with the line it must never be.")] });

function rulesWin() {
  const el = h("div.mc-w.is-rules");
  function update() {
    const b = macaron.brand;
    if (!b || typingIn(el)) return typingIn(el) ? false : undefined;
    const kit = kitOf(b.body);
    const rules = b.body.kit.rules;
    const sizes = (b.body.kit.sizes ??= { mark: 24, wordmark: 96 });
    const col = (kind, label) => h("section.kr-col", {}, h("span.label", {}, label),
      h("div.kr-list", {}, ...rules.filter((r) => r.kind === kind).map((r) => h("div.kr-rule", {}, ring(kind),
        h("textarea.kr-text", { rows: 1, value: r.text, placeholder: kind === "do" ? "Keep this" : "Never this", "aria-label": "A rule", on: { input: (e) => setRule(r.id, { text: e.target.value.slice(0, 200) }) } }),
        h("button.mc-iconkey.kv-x", { type: "button", title: "Take it out", "aria-label": "Take it out", on: { click: () => removeRule(r.id) } }, icon("close")))),
      h("button.mc-add-prompt", { type: "button", on: { click: () => addRule(kind) } }, icon("plus"), kind === "do" ? "Something to keep" : "Something never to do")));
    const wordmark = kit.logos.find((l) => l.kind === "wordmark" && /yellow|white/.test(l.tone)) ?? kit.logos.find((l) => l.kind === "wordmark") ?? kit.logos.find((l) => l.kind === "mark") ?? kit.logos[0];
    const mark = kit.logos.find((l) => l.kind === "mark" && /yellow|white/.test(l.tone)) ?? kit.logos.find((l) => l.kind === "mark") ?? kit.logos[0];
    const stepper = (k, t) => h("label.kr-size", {}, h("span.label", {}, t), h("div.kp-num", {}, h("input", { type: "number", min: 8, max: 600, step: 1, value: sizes[k], "aria-label": `${t} smallest size in pixels`, on: { change: (e) => setKit("sizes", { ...sizes, [k]: Math.max(8, Number(e.target.value) || sizes[k]) }) } }), h("em", {}, "px")));
    fill(el, h("div.kr-grid", {},
      h("div.kr-lists", {}, col("do", "Keep"), col("dont", "Never")),
      h("div.kr-logo", {},
        h("section.mc-sec", {}, h("span.label", {}, "Logo rules · clear space"),
          h("div.kr-clearrow", {},
            h("div.kr-clear", { title: "Clear space on every side equals the height of the lid" }, ...["nw", "ne", "sw", "se"].map((c) => h(`b.kr-c.is-${c}`, {}, "C")), wordmark ? h("img", { src: wordmark.url, alt: "", draggable: false }) : null),
            h("p", {}, "Keep clear space around the logo, equal to the height of the lid."))),
        h("section.mc-sec", {}, h("span.label", {}, "Smallest the logo may be"),
          h("div.kr-sizes", {},
            h("div.kr-min", {}, mark ? h("img.is-mark", { src: mark.url, alt: "", draggable: false, style: { height: `${sizes.mark}px` } }) : null, h("i", { style: { width: `${sizes.mark}px` } }), stepper("mark", "Mark")),
            h("div.kr-min", {}, wordmark ? h("img", { src: wordmark.url, alt: "", draggable: false, style: { width: `${sizes.wordmark}px` } }) : null, h("i", { style: { width: `${sizes.wordmark}px` } }), stepper("wordmark", "Wordmark")))),
        h("div.kr-guard", {}, svgIcon("kr-shield", '<path d="M12 3.5 5 6v5.5c0 4.2 2.8 7.2 7 9 4.2-1.8 7-4.8 7-9V6z"/><path d="m9 12 2.2 2.2L15.5 10"/>'),
          h("div", {}, h("b", {}, "Brand guard"), h("p", {}, "Checks every design against the palette, the logo files and the safe zones."))))));
  }
  const sig = () => JSON.stringify([macaron.brand?.body.kit.rules, macaron.brand?.body.kit.sizes, macaron.brand?.body.kit.logos]);
  return { el, update, sig };
}
defineWindow("rules", { eyebrow: "Brand kit", title: "Rules", sub: () => macaron.brand?.name ?? "", size: "l", advanced: false, make: rulesWin });

/** The product: its pictures, the pictures that are made for it, the shoot. The tabs sit in the window's head. */
function productWin() {
  const tabs = [["product", "Product"], ["pictures", "Pictures"], ["make", "Make a picture"], ["shoot", "Shoot"]];
  const parts = productParts();
  const bar = h("div.mc-segs.mc-ptabs", { role: "tablist", "aria-label": "Product" });
  const host = h("div.mc-pbody");
  const el = h("div.mc-w.is-product", {}, host);
  let on = null;
  function update() {
    const tab = macaron.productTab ?? "product";
    if (tab !== on) {
      on = tab;
      host.replaceChildren(parts[tab].el);
    }
    fill(bar, ...tabs.map(([v, l]) => h("button.mc-seg", { type: "button", role: "tab", "aria-selected": String(v === tab), "aria-pressed": String(v === tab), on: { click: () => ((macaron.productTab = v), update()) } }, l)));
    if (parts[tab].update?.() === false) return false;
  }
  const sig = () => JSON.stringify([macaron.productTab, parts[macaron.productTab ?? "product"].sig?.()]);
  return { el, update, sig, bar };
}
defineWindow("product", { eyebrow: "Brand kit", title: "Product", sub: () => macaron.brand?.name ?? "", size: "full", advanced: false, make: productWin, tools: (part) => [part.bar] });

/** What leaves with the kit: its palette as code, the kit as data, the logo files. */
function exportKitWin() {
  const el = h("div.mc-w.is-exportkit");
  const save = (name, text, type) => {
    const a = h("a", { href: URL.createObjectURL(new Blob([text], { type })), download: name });
    document.body.append(a);
    a.click();
    a.remove();
  };
  const copy = (text) => navigator.clipboard?.writeText(text).then(() => toast("Copied."), () => toast("Could not copy."));
  const slug = () => (macaron.brand?.name ?? "brand").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  /** The first lines of a file, for a look at what goes out. */
  const peek = (text, n = 7) => { const all = text.trimEnd().split("\n"); return all.length > n ? `${all.slice(0, n).join("\n")}\n…` : all.join("\n"); };
  const card = (glyph, title, text, download, preview, o = {}) => h("article.kx-card", {},
    h("div.kx-head", {}, h("span.kx-glyph", {}, glyph), h("div.kx-text", {}, h("b", {}, title), h("p", {}, text)),
      h("button.kx-dl", { type: "button", title: `Download: ${title}`, "aria-label": `Download: ${title}`, disabled: o.disabled, on: { click: download } }, icon("download"))),
    preview);
  function update() {
    const b = macaron.brand;
    if (!b) return;
    const kit = kitOf(b.body);
    const css = `:root {\n${kit.palette.map((p) => `  --${p.id.replace(/[^a-z0-9]+/gi, "-")}: ${p.hex.toUpperCase()}; /* ${p.name}${p.role ? `, ${p.role}` : ""} */`).join("\n")}\n  --font-display: "${kit.type.display.family}";\n  --font-text: "${kit.type.text.family}";\n  --font-mono: "${kit.type.mono.family}";\n}\n`;
    const data = JSON.stringify({ name: b.name, palette: kit.palette, type: kit.type, voice: b.body.kit.voice, rules: b.body.kit.rules, logos: kit.logos.map(({ id, name, kind, tone, ground, url }) => ({ id, name, kind, tone, ground, url })) }, null, 2);
    const files = kitFiles();
    const code = (shown, text = shown) => h("div.kx-code", {}, h("pre", {}, peek(shown)), h("button.mc-iconkey", { type: "button", title: "Copy it", "aria-label": "Copy it", on: { click: () => copy(text) } }, sprite("copy")));
    fill(el,
      card(mcicon("palette"), "Palette as CSS", `${kit.palette.length} colours and 3 fonts, as variables for the web.`, () => save(`${slug()}-colours.css`, css, "text/css"), code(css)),
      card(h("b", {}, "{ }"), "The kit as data", "Palette, type, voice, rules and the logo list, in one file.", () => save(`${slug()}-kit.json`, data, "application/json"), code(JSON.stringify({ name: b.name, palette: kit.palette.map(({ id, name, hex }) => ({ id, name, hex })), "…": "" }, null, 2).replace(/,\n  "…": ""/, ""), data)),
      card(mcicon("picture"), "Every logo file", files.length ? `${files.length} files, exactly as they came in.` : "No logo files in the kit yet.",
        async () => { for (const f of files) { const a = h("a", { href: f.url, download: f.name }); document.body.append(a); a.click(); a.remove(); await new Promise((r) => setTimeout(r, 250)); } toast(`${files.length} logo files.`); },
        files.length ? h("div.kx-logos", {}, ...kit.logos.slice(0, 5).map((l) => { const g = sitsOn(kit, l); return h("figure", {}, h("span", { style: { "--ground": g.hex } }, h("img", { src: l.url, alt: l.name, draggable: false, loading: "lazy" })), h("figcaption", {}, kindName(l.kind))); })) : null,
        { disabled: !files.length }));
  }
  return { el, update, sig: () => JSON.stringify([macaron.brand?.body.kit]) };
}
defineWindow("exportkit", { eyebrow: "Brand kit", title: "Export the kit", sub: () => macaron.brand?.name ?? "", size: "s", advanced: false, make: exportKitWin });
