// The Brand kit workspace: the palette first, then the logos (the wordmark, the mark and the app icon, with the
// other colourways passing by like a marquee), the type, the voice, the rules and the product. Each bento is a
// picture of its part of the kit; opened, it is the part's window, with an Advanced switch for the finer controls.
import { h, icon } from "./dom.js";
import { toast } from "./store.js";
import { contrast, colorOf, kitOf, luminance } from "./design.js";
import {
  macaron, setColour, addColour, setColourField, setWords, setKit, setType, addLogoFile, removeLogo, setLogoField, addRule, setRule, removeRule, productNow, setColourway, kitFiles,
} from "./macaron.js";
import { bento, mcicon, key, chip, chooseFiles, arming, isArmed, armedNow, marquee, fill, seg } from "./macaron-ui.js";
import { defineWindow, openWin, isAdvanced } from "./macaron-win.js";
import { productParts } from "./macaron-assets.js";

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
    fill(el, palette(kit), logos(kit), type(kit), voice(kit), rules(kit), product(b));
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

function paletteWin() {
  const el = h("div.mc-w.is-palette");
  const rerender = () => update();
  function update() {
    const b = macaron.brand;
    if (!b || typingIn(el)) return typingIn(el) ? false : undefined;
    const kit = kitOf(b.body);
    const adv = isAdvanced("palette");
    const cards = kit.palette.map((p, i) => {
      const ink = inkOn(p.hex);
      const armedKey = `colour:${p.id}`;
      return h("div.mc-pcard", { style: { "--c": p.hex, "--ink": ink } },
        h("label.mc-pblock", { title: "Click to change the colour" },
          h("input", { type: "color", value: p.hex.toLowerCase(), "aria-label": `${p.name} colour`, on: { input: (e) => (e.target.closest(".mc-pcard").style.cssText = `--c:${e.target.value};--ink:${inkOn(e.target.value)}`), change: (e) => setColour(i, e.target.value) } }),
          h("b", {}, p.hex.toUpperCase()), h("span", {}, p.name)),
        field(p.name, (v) => setColourField(i, { name: v.slice(0, 24) }), { label: "The colour's name", cls: "mc-pname", focus: `pname:${p.id}` }),
        field(p.role, (v) => setColourField(i, { role: v.slice(0, 30) }), { placeholder: "What it is for", cls: "mc-prole", focus: `prole:${p.id}` }),
        h("div.mc-contrast", {}, chip(`ink ${ratio(p.hex, "#211927")} : 1`, { title: "Contrast with ink" }), chip(`white ${ratio(p.hex, "#F0EFED")} : 1`, { title: "Contrast with warm white" })),
        adv ? h("div.mc-padv", {},
          field(p.hex.toUpperCase(), (v) => hex6(v) && setColour(i, hex6(v)), { label: "Hex", placeholder: "#RRGGBB", cls: "mc-hex", focus: `phex:${p.id}` }),
          h("label.mc-axis", {}, h("span", {}, "Share"), h("div.mc-num", {}, h("input", { type: "number", min: 0, max: 100, step: 1, value: p.share ?? 0, "aria-label": `${p.name} share of a page`, on: { change: (e) => setColourField(i, { share: Math.max(0, Math.min(100, Number(e.target.value) || 0)) }) } }), h("em", {}, "%"))),
          field(p.note, (v) => setColourField(i, { note: v.slice(0, 160) }), { rows: 2, placeholder: "How and where it is used", cls: "mc-pnote", focus: `pnote:${p.id}` }),
          kit.palette.length > 1 ? key(icon("trash"), isArmed(armedKey) ? "Click again to take it out" : "Take it out of the palette", () => arming(armedKey, rerender, () => setColour(i, null)), { on: isArmed(armedKey) }) : null) : null);
    });
    const pairs = kit.palette.flatMap((a, i) => kit.palette.slice(i + 1).map((c) => [a, c, contrast(a.hex, c.hex)]));
    fill(el,
      h("div.mc-pgrid", {}, ...cards, (adv || !kit.palette.length) && kit.palette.length < 8 ? h("button.mc-pcard.is-add", { type: "button", title: "Add a colour", on: { click: () => addColour() } }, icon("plus"), h("span", {}, "Add a colour")) : null),
      kit.palette.some((p) => p.share) ? h("div.mc-share.is-big", {}, ...kit.palette.filter((p) => p.share).map((p) => h("i", { style: { flex: String(p.share), background: p.hex }, title: `${p.name} ${p.share}%` }))) : null,
      adv ? h("div.mc-pairs", {}, h("span.label", {}, "How colours read on each other"),
        h("div.mc-pairs-grid", {}, ...pairs.map(([a, c, r]) => h("div.mc-pair-chip", { style: { "--a": a.hex, "--c": c.hex }, title: `${a.name} on ${c.name}: ${r.toFixed(1)} : 1` }, h("b", {}, "Aa"), h("em", {}, `${r.toFixed(1)}`), h("span", { dataset: { tone: r >= 4.5 ? "ok" : r >= 3 ? "warn" : "crit" } }, r >= 4.5 ? "reads" : r >= 3 ? "large only" : "too low"))))) : h("p.mc-hint", {}, "Click a colour to change it. Advanced adds colours, shares and how they read on each other."));
  }
  const sig = () => JSON.stringify([macaron.brand?.body.kit.palette, armedNow()]);
  return { el, update, sig };
}
defineWindow("palette", { title: "Palette", sub: () => macaron.brand?.name ?? "", size: "l", advanced: true, make: paletteWin });

function logosWin() {
  const el = h("div.mc-w.is-logos");
  const rerender = () => update();
  function update() {
    const b = macaron.brand;
    if (!b || typingIn(el)) return typingIn(el) ? false : undefined;
    const kit = kitOf(b.body);
    const adv = isAdvanced("logos");
    const tones = tonesOf(kit);
    const cell = (l) => {
      const g = sitsOn(kit, l);
      const name = wayName(kit, l);
      return h("div.mc-lcell", { style: { "--ground": g.hex, "--ink": inkOn(g.hex) }, title: l.name },
        h("img", { src: l.url, alt: l.name, draggable: false, loading: "lazy" }),
        h("span.mc-lcell-name", {}, name),
        h("a.mc-lcell-dl", { href: l.url, download: l.url.split("/").pop(), title: `Download ${l.name}`, "aria-label": `Download ${l.name}` }, icon("download")));
    };
    const rows = KINDS.filter(([k]) => kit.logos.some((l) => l.kind === k)).map(([k, label]) => {
      const have = tones.map((t) => kit.logos.find((x) => x.kind === k && x.tone === t)).filter(Boolean);
      const room = Math.max(0, Math.max(4, tones.length) - have.length);
      return h("div.mc-lrow", {}, h("span.mc-lrow-label", {}, label.toUpperCase()),
        ...have.map(cell),
        ...Array.from({ length: room }, () => h(adv ? "button.mc-lcell.is-empty" : "div.mc-lcell.is-empty", adv ? { type: "button", title: `Add a ${label.toLowerCase()} file`, on: { click: () => chooseFiles((f) => addLogoFile(f, k, ""), true, "image/svg+xml,image/png,image/webp") } } : {}, adv ? icon("plus") : null)));
    });
    fill(el,
      kit.logos.length ? h("div.mc-lgrid", {}, ...rows) : h("p.mc-hint", {}, "Add the logo files: a wordmark, the mark, an app icon, in the colours they may be used in."),
      adv ? h("div.mc-lfiles", {}, h("div.mc-lfiles-head", {}, h("span.label", {}, "The files"), key(icon("plus"), "Add a logo file (SVG or PNG)", () => chooseFiles((f) => addLogoFile(f, "wordmark", ""), true, "image/svg+xml,image/png,image/webp"))),
        ...kit.logos.map((l) => {
          const armedKey = `logo:${l.id}`;
          return h("div.mc-lfile", {},
            h("img", { src: l.url, alt: "", draggable: false }),
            field(l.name, (v) => setLogoField(l.id, { name: v.slice(0, 40) }), { label: "The file's name", cls: "mc-lf-name", focus: `lname:${l.id}` }),
            h("select.field.mc-lf-kind", { "aria-label": "What it is", on: { change: (e) => setLogoField(l.id, { kind: e.target.value }) } }, ...KINDS.map(([v, t]) => h("option", { value: v, selected: v === l.kind }, t))),
            h("select.field.mc-lf-tone", { "aria-label": "The colour it is drawn in", on: { change: (e) => setLogoField(l.id, { tone: e.target.value }) } }, ...kit.palette.map((p) => h("option", { value: p.id, selected: p.id === l.tone }, p.name)), l.tone && !kit.palette.some((p) => p.id === l.tone) ? h("option", { value: l.tone, selected: true }, l.tone) : null),
            field(l.ground, (v) => setLogoField(l.id, { ground: v.slice(0, 60) }), { placeholder: "Grounds it is for", label: "The grounds it is for", cls: "mc-lf-ground", focus: `lground:${l.id}` }),
            key(icon("trash"), isArmed(armedKey) ? "Click again to take it out of the kit" : "Take it out of the kit", () => arming(armedKey, rerender, () => removeLogo(l.id)), { on: isArmed(armedKey) }));
        })) : h("p.mc-hint", {}, "Always the supplied files: never redrawn, stretched, tilted or recoloured."));
  }
  const sig = () => JSON.stringify([macaron.brand?.body.kit.logos, macaron.brand?.body.kit.palette, armedNow()]);
  return { el, update, sig };
}
defineWindow("logos", { title: "Logos", sub: () => macaron.brand?.name ?? "", size: "l", advanced: true, make: logosWin });

function typeWin() {
  const el = h("div.mc-w.is-type");
  function update() {
    const b = macaron.brand;
    if (!b || typingIn(el)) return typingIn(el) ? false : undefined;
    const kit = kitOf(b.body);
    const adv = isAdvanced("type");
    const roles = [["display", "Display", "Aa", "Headlines"], ["text", "Text", "One photo in, a shot with sound out.", "Reading"], ["mono", "Mono", "01 · 16:9 · 24 FPS", "Labels, numbers and ids"]];
    fill(el, ...roles.map(([role, label, sample, use]) => {
      const t = kit.type[role];
      return h("div.mc-trole", {},
        h("span.label", {}, label),
        h("span.mc-tsample", { style: { fontFamily: `"${t.family}", var(--font-${role === "mono" ? "mono" : "sans"})`, fontWeight: t.weight, fontSize: role === "display" ? "5.5rem" : role === "text" ? "1.75rem" : "1.5rem", lineHeight: role === "display" ? ".95" : "1.15" } }, sample),
        h("div.mc-tfields", {},
          field(t.family, (v) => setType(role, { family: v.slice(0, 40) }), { label: `${label} typeface`, cls: "mc-tfam", focus: `tfam:${role}` }),
          h("label.mc-axis", {}, h("span", {}, "Weight"), h("div.mc-num", {}, h("input", { type: "number", min: 300, max: 900, step: 100, value: t.weight, "aria-label": `${label} weight`, on: { change: (e) => setType(role, { weight: Number(e.target.value) || 500 }) } })))),
        adv ? field(t.use ?? use, (v) => setType(role, { use: v.slice(0, 80) }), { placeholder: "What it is for", label: `${label} use`, focus: `tuse:${role}` }) : h("span.mc-hint", {}, t.use ?? use));
    }));
  }
  const sig = () => JSON.stringify([macaron.brand?.body.kit.type]);
  return { el, update, sig };
}
defineWindow("type", { title: "Type", sub: () => macaron.brand?.name ?? "", size: "m", advanced: true, make: typeWin });

function voiceWin() {
  const el = h("div.mc-w.is-voice");
  const rerender = () => update();
  function update() {
    const b = macaron.brand;
    if (!b || typingIn(el)) return typingIn(el) ? false : undefined;
    const kit = b.body.kit;
    const v = kit.voice ?? (kit.voice = { summary: "", words: [], dos: [], donts: [], lines: [] });
    const adv = isAdvanced("voice");
    const list = (path, items, placeholder, tone) => h("div.mc-list", {}, ...items.map((text, i) =>
      h("div.mc-list-row", {}, h("span.mc-mark", { dataset: { tone } }, icon(tone === "do" ? "check" : "close")),
        h("input.mc-line", { value: text, placeholder, "aria-label": placeholder, on: { input: (e) => { items[i] = e.target.value.slice(0, 140); setKit(path, items); } } }),
        h("button.key.is-icon.is-sm.is-quiet", { type: "button", title: "Take it out", "aria-label": "Take it out", on: { click: () => (items.splice(i, 1), setKit(path, items), rerender()) } }, icon("close")))),
      items.length < 8 ? h("button.key.is-sm.is-quiet.mc-add", { type: "button", on: { click: () => (items.push(""), setKit(path, items), rerender()) } }, icon("plus"), "Add") : null);
    fill(el,
      h("div.mc-vtop", {}, h("span.label", {}, "In a few words"),
        h("input.field.mc-words", { value: (v.words ?? []).join(", "), placeholder: "warm, plain, playful", "aria-label": "Voice words", on: { change: (e) => setWords("voice", e.target.value.split(",").map((w) => w.trim()).filter(Boolean).slice(0, 6)) } }),
        h("div.mc-chips", {}, ...(v.words ?? []).slice(0, 6).map((w, i) => h(`span.mc-chip${i === 0 ? ".is-on" : ""}`, {}, w[0]?.toUpperCase() + w.slice(1))))),
      field(v.summary, (t) => setKit("voice.summary", t.slice(0, 300)), { rows: 2, placeholder: "How the brand talks, in a sentence", cls: "mc-vsum", focus: "vsum" }),
      h("div.mc-two", {}, h("div", {}, h("span.label", {}, "Do"), list("voice.dos", v.dos ?? (v.dos = []), "Do this", "do")), h("div", {}, h("span.label", {}, "Don't"), list("voice.donts", v.donts ?? (v.donts = []), "Not this", "dont"))),
      h("div.mc-says", {}, h("span.label", {}, "In the brand's voice"),
        ...(v.lines ?? []).map((l, i) => h("div.mc-say", {}, adv ? field(l.say, (t) => ((v.lines[i].say = t.slice(0, 120)), setKit("voice.lines", v.lines)), { placeholder: "Say", cls: "mc-say-line", focus: `say:${i}` }) : h("b", {}, `“${l.say}”`),
          adv ? field(l.not, (t) => ((v.lines[i].not = t.slice(0, 120)), setKit("voice.lines", v.lines)), { placeholder: "Not this", cls: "mc-not-line", focus: `not:${i}` }) : (l.not ? h("s", {}, l.not) : null))),
        adv ? h("button.key.is-sm.is-quiet.mc-add", { type: "button", on: { click: () => ((v.lines ??= []).push({ say: "", not: "" }), setKit("voice.lines", v.lines), rerender()) } }, icon("plus"), "A line") : null));
  }
  const sig = () => JSON.stringify([macaron.brand?.body.kit.voice]);
  return { el, update, sig };
}
defineWindow("voice", { title: "Voice", sub: () => macaron.brand?.name ?? "", size: "m", advanced: true, make: voiceWin });

function rulesWin() {
  const el = h("div.mc-w.is-rules");
  function update() {
    const b = macaron.brand;
    if (!b || typingIn(el)) return typingIn(el) ? false : undefined;
    const rules = b.body.kit.rules;
    const adv = isAdvanced("rules");
    const sizes = (b.body.kit.sizes ??= { mark: 24, wordmark: 96 });
    const col = (kind, label) => h("div", {}, h("span.label", {}, label),
      h("div.mc-list", {}, ...rules.filter((r) => r.kind === kind).map((r) => h("div.mc-list-row", {}, h("span.mc-mark", { dataset: { tone: kind } }, icon(kind === "do" ? "check" : "close")),
        h("textarea.mc-line", { rows: 2, value: r.text, "aria-label": "A rule", on: { input: (e) => setRule(r.id, { text: e.target.value.slice(0, 200) }) } }),
        adv ? h("button.key.is-icon.is-sm.is-quiet", { type: "button", title: "Take it out", "aria-label": "Take it out", on: { click: () => removeRule(r.id) } }, icon("close")) : null)),
      h("button.key.is-sm.is-quiet.mc-add", { type: "button", on: { click: () => addRule(kind) } }, icon("plus"), "Add")));
    fill(el,
      h("div.mc-two", {}, col("do", "Keep"), col("dont", "Never")),
      adv ? h("div.mc-sizes", {}, h("span.label", {}, "Smallest the logo may be"),
        ...[["mark", "Mark"], ["wordmark", "Wordmark"]].map(([k, t]) => h("label.mc-axis", {}, h("span", {}, `${t} px`), h("div.mc-num", {}, h("input", { type: "number", min: 8, max: 600, step: 1, value: sizes[k], "aria-label": `${t} smallest size in pixels`, on: { change: (e) => setKit("sizes", { ...sizes, [k]: Math.max(8, Number(e.target.value) || sizes[k]) }) } }), h("em", {}, "px"))))) : null,
      h("p.mc-hint", {}, "The brand guard checks every design against the palette, the logo files and the safe zones."));
  }
  const sig = () => JSON.stringify([macaron.brand?.body.kit.rules, macaron.brand?.body.kit.sizes]);
  return { el, update, sig };
}
defineWindow("rules", { title: "Rules", sub: () => macaron.brand?.name ?? "", size: "m", advanced: true, make: rulesWin });

/** The product: its pictures, the pictures that are made for it, the shoot. */
function productWin() {
  const tabs = [["product", "Product"], ["pictures", "Pictures"], ["make", "Make a picture"], ["shoot", "Shoot"]];
  const parts = productParts();
  const bar = h("div.mc-ptabs");
  const host = h("div.mc-pbody");
  const el = h("div.mc-w.is-product", {}, bar, host);
  let on = null;
  function update() {
    const tab = macaron.productTab ?? "product";
    if (tab !== on) {
      on = tab;
      host.replaceChildren(parts[tab].el);
      parts[tab].sig = undefined;
    }
    fill(bar, seg(tabs.map(([v, l]) => [v, l]), tab, (v) => ((macaron.productTab = v), update())));
    if (parts[tab].update?.() === false) return false;
  }
  const sig = () => JSON.stringify([macaron.productTab, parts[macaron.productTab ?? "product"].sig?.()]);
  return { el, update, sig };
}
defineWindow("product", { title: "Product and pictures", sub: () => macaron.brand?.name ?? "", size: "xl", advanced: false, make: productWin });

/** What leaves with the kit: its palette as code, the kit as data, the logo files. */
function exportKitWin() {
  const el = h("div.mc-w.is-exportkit");
  const save = (name, text, type) => {
    const a = h("a", { href: URL.createObjectURL(new Blob([text], { type })), download: name });
    document.body.append(a);
    a.click();
    a.remove();
  };
  const slug = () => (macaron.brand?.name ?? "brand").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  function update() {
    const b = macaron.brand;
    if (!b) return;
    const kit = kitOf(b.body);
    const css = `:root {\n${kit.palette.map((p) => `  --${p.id.replace(/[^a-z0-9]+/gi, "-")}: ${p.hex.toUpperCase()}; /* ${p.name}${p.role ? `, ${p.role}` : ""} */`).join("\n")}\n  --font-display: "${kit.type.display.family}";\n  --font-text: "${kit.type.text.family}";\n  --font-mono: "${kit.type.mono.family}";\n}\n`;
    const files = kitFiles();
    fill(el,
      h("div.mc-xk", {},
        h("button.mc-xkey", { type: "button", on: { click: () => save(`${slug()}-colours.css`, css, "text/css") } }, mcicon("palette"), h("b", {}, "Palette as CSS"), h("span", {}, `${kit.palette.length} colours and 3 fonts`)),
        h("button.mc-xkey", { type: "button", on: { click: () => save(`${slug()}-kit.json`, JSON.stringify({ name: b.name, palette: kit.palette, type: kit.type, voice: b.body.kit.voice, rules: b.body.kit.rules, logos: kit.logos.map(({ id, name, kind, tone, ground, url }) => ({ id, name, kind, tone, ground, url })) }, null, 2), "application/json") } }, mcicon("doc"), h("b", {}, "The kit as data"), h("span", {}, "palette, type, voice, rules and logo list")),
        h("button.mc-xkey", { type: "button", disabled: !files.length, on: { click: async () => { for (const f of files) { const a = h("a", { href: f.url, download: f.name }); document.body.append(a); a.click(); a.remove(); await new Promise((r) => setTimeout(r, 250)); } toast(`${files.length} logo files.`); } } }, mcicon("logo"), h("b", {}, "Every logo file"), h("span", {}, `${files.length} files, as supplied`))),
      h("p.mc-hint", {}, "The logo files go out exactly as they came in."));
  }
  return { el, update, sig: () => JSON.stringify([macaron.brand?.body.kit]) };
}
defineWindow("exportkit", { title: "Export the kit", sub: () => macaron.brand?.name ?? "", size: "s", advanced: false, make: exportKitWin });
