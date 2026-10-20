// The brand kit, as a board: the logo files on the grounds they are for, the palette with what each is
// for and how it reads, the type with a specimen, the voice with its do and don't, and the rules that
// keep a design on brand. Designs read all of it, and the brand guard checks them against it.
import { h, icon } from "./dom.js";
import { contrast, colorOf, kitOf, luminance } from "./design.js";
import {
  macaron, setColour, addColour, setColourField, setWords, setKit, setType, addLogoFile, removeLogo, addRule, setRule, removeRule,
} from "./macaron.js";
import { card, key, chip, arming, isArmed, armedNow, chooseFiles } from "./macaron-ui.js";

const GROUND = { yellow: "ink", white: "ink", ink: "yellow", plum: "white" };
const KINDS = [["wordmark", "Wordmark"], ["mark", "Mark"], ["icon", "App icon"]];
const ratio = (a, b) => `${contrast(a, b).toFixed(1)} : 1`;

export function kitSection() {
  const el = h("div.mc-bento.is-kit");
  const rerender = () => update();

  function logos(kit) {
    const tiles = (kind) => kit.logos.filter((l) => l.kind === kind).map((l) => {
      // the tile is the ground the file is for; a file whose colour is not one of the palette's sits on whichever of dark and light it reads on
      const ground = GROUND[l.tone] ? colorOf(kit, GROUND[l.tone], "#19191c") : luminance(colorOf(kit, l.tone, "#888888")) > 0.35 ? "#19191c" : "#F0EFED";
      const armedKey = `logo:${l.id}`;
      return h("div.mc-logo-tile", { style: { "--ground": ground }, title: `${l.name}\nFor ${l.ground || "any ground"}` },
        h("img", { src: l.url, alt: l.name, draggable: false, loading: "lazy" }),
        h("span.mc-logo-name", {}, h("b", {}, l.name), h("em", {}, l.ground ? `on ${l.ground}` : "")),
        h("span.mc-tile-keys", {},
          h("a.key.is-icon.is-sm", { href: l.url, download: l.url.split("/").pop(), title: "Download the file" }, icon("download")),
          key(icon("trash"), isArmed(armedKey) ? "Click again to take it out of the kit" : "Take it out of the kit", () => arming(armedKey, rerender, () => removeLogo(l.id)), { on: isArmed(armedKey) })));
    });
    return card("is-logos", "Logos", [key(icon("plus"), "Add a logo file (SVG or PNG)", (e) => chooseFiles((f) => addLogoFile(f, "wordmark", ""), true, "image/svg+xml,image/png,image/webp"))],
      kit.logos.length ? h("div.mc-logo-groups", {}, ...KINDS.map(([kind, label]) => {
        const list = tiles(kind);
        return list.length ? h("div.mc-logo-group", {}, h("span.label", {}, label), h("div.mc-logo-row", {}, ...list)) : null;
      }).filter(Boolean)) : h("p.mc-hint", {}, "Add the logo files: a wordmark, the mark, an app icon, in the colours it may be used in."),
      h("p.mc-hint", {}, "Always the supplied files. Never redrawn, stretched, tilted or recoloured."));
  }

  function paletteCard(kit) {
    const body = macaron.brand.body;
    return card("is-palette", "Palette", [kit.palette.length < 8 ? key(icon("plus"), "Add a colour", () => addColour()) : null],
      h("div.mc-swatch-board", {}, ...kit.palette.map((p, i) => {
        const ink = contrast(p.hex, "#211927") >= contrast(p.hex, "#F0EFED") ? "#211927" : "#F0EFED";
        return h("div.mc-colour", { style: { "--c": p.hex, "--ink": ink } },
          h("label.mc-block", { title: "Click to change the colour" }, h("input", { type: "color", value: p.hex.toLowerCase(), on: { input: (e) => ((e.target.closest(".mc-colour").style.cssText = `--c:${e.target.value};--ink:${ink}`), (kit.palette[i].hex = e.target.value.toUpperCase())), change: (e) => setColour(i, e.target.value) } }),
            h("b", {}, p.name), h("span", {}, p.hex.toUpperCase()),
            kit.palette.length > 1 ? h("button.mc-colour-x", { type: "button", title: "Take it out of the palette", "aria-label": "Take it out", on: { click: (e) => (e.preventDefault(), setColour(i, null)) } }, icon("close")) : null),
          h("input.mc-colour-name", { value: p.name, "aria-label": "The colour's name", on: { input: (e) => setColourField(i, { name: e.target.value.slice(0, 24) }) } }),
          h("input.mc-colour-role", { value: p.role ?? "", placeholder: "What it is for", "aria-label": "What the colour is for", on: { input: (e) => setColourField(i, { role: e.target.value.slice(0, 30) }) } }),
          h("div.mc-contrast", {}, chip(`ink ${ratio(p.hex, "#211927")}`, { title: "Contrast with ink" }), chip(`white ${ratio(p.hex, "#F0EFED")}`, { title: "Contrast with warm white" })));
      })),
      kit.palette.some((p) => p.share) ? h("div.mc-share", { title: "Proportion on a typical page" }, ...kit.palette.filter((p) => p.share).map((p) => h("i", { style: { flex: p.share, background: p.hex } }))) : null,
      h("p.mc-hint", {}, body.kit.palette.find((p) => p.note)?.note ? `${kit.palette.filter((p) => p.note).map((p) => `${p.name}: ${p.note}`).slice(0, 2).join(" ")}` : "Names and what each colour is for are kept with the brand."));
  }

  function typeCard(kit) {
    const roles = [["display", "Display", "Aa", "2.35rem"], ["text", "Text", "Reading, in a few lines", "1.05rem"], ["mono", "Mono", "01 · 16:9 · 24 FPS", ".95rem"]];
    return card("is-type", "Type", [], ...roles.map(([role, label, sample, size]) => {
      const t = kit.type[role];
      return h("div.mc-type", {},
        h("span.label", {}, label),
        h("span.mc-specimen", { style: { fontFamily: `"${t.family}", var(--font-sans)`, fontWeight: t.weight, fontSize: size } }, t.sample && role !== "display" ? t.sample : sample === "Aa" ? t.sample ?? "Aa" : sample),
        h("div.mc-type-fields", {},
          h("input.field", { value: t.family, "aria-label": `${label} typeface`, on: { change: (e) => setType(role, { family: e.target.value.slice(0, 40) }) } }),
          h("input.field.is-narrow", { type: "number", min: 300, max: 900, step: 100, value: t.weight, "aria-label": `${label} weight`, on: { change: (e) => setType(role, { weight: Number(e.target.value) || 500 }) } })),
        t.use ? h("span.mc-hint", {}, t.use) : null);
    }));
  }

  function list(path, items, placeholder, tone) {
    const [, field] = path.split(".");
    return h("div.mc-list", {}, ...items.map((text, i) =>
      h("div.mc-list-row", {}, h("span.mc-mark", { dataset: { tone } }, icon(tone === "do" ? "check" : "close")),
        h("input.mc-line", { value: text, placeholder, "aria-label": placeholder, on: {
          input: (e) => {
            items[i] = e.target.value.slice(0, 140);
            setKit(path, items);
            if (field === "dos" || field === "donts") macaron.brand.body[field] = items[0] ?? "";
          },
          keydown: (e) => e.key === "Enter" && e.target.blur(),
        } }),
        h("button.key.is-icon.is-sm.is-quiet", { type: "button", title: "Take it out", "aria-label": "Take it out", on: { click: () => (items.splice(i, 1), setKit(path, items), macaron.brand.body[field] !== undefined && (macaron.brand.body[field] = items[0] ?? ""), rerender()) } }, icon("close")))),
      items.length < 8 ? h("button.key.is-sm.is-quiet.mc-add", { type: "button", on: { click: () => (items.push(""), setKit(path, items), rerender()) } }, icon("plus"), "Add") : null);
  }

  function voiceCard(kit) {
    const v = macaron.brand.body.kit.voice;
    return card("is-voice", "Voice", [],
      h("textarea.field.mc-text", { rows: 2, value: v.summary ?? "", placeholder: "How the brand talks, in a sentence", "aria-label": "How the brand talks", on: { input: (e) => setKit("voice.summary", e.target.value.slice(0, 300)) } }),
      h("input.field.mc-words", { value: (v.words ?? []).join(", "), placeholder: "warm, plain, playful", "aria-label": "Voice words", on: { change: (e) => setWords("voice", e.target.value.split(",").map((w) => w.trim()).filter(Boolean).slice(0, 6)) } }),
      h("div.mc-two", {}, h("div", {}, h("span.label", {}, "Do"), list("voice.dos", v.dos ?? [], "Do this", "do")), h("div", {}, h("span.label", {}, "Don't"), list("voice.donts", v.donts ?? [], "Not this", "dont"))),
      (v.lines ?? []).length ? h("div.mc-says", {}, h("span.label", {}, "In the brand's voice"), ...v.lines.map((l) => h("p", {}, h("b", {}, `“${l.say}”`), l.not ? h("s", {}, l.not) : null))) : null);
  }

  function rulesCard(kit) {
    const rules = macaron.brand.body.kit.rules;
    const col = (kind, label) => h("div", {}, h("span.label", {}, label),
      h("div.mc-list", {}, ...rules.filter((r) => r.kind === kind).map((r) => h("div.mc-list-row", {}, h("span.mc-mark", { dataset: { tone: kind } }, icon(kind === "do" ? "check" : "close")),
        h("textarea.mc-line", { rows: 2, value: r.text, "aria-label": "A rule", on: { input: (e) => setRule(r.id, { text: e.target.value.slice(0, 200) }) } }),
        h("button.key.is-icon.is-sm.is-quiet", { type: "button", title: "Take it out", "aria-label": "Take it out", on: { click: () => removeRule(r.id) } }, icon("close")))),
      h("button.key.is-sm.is-quiet.mc-add", { type: "button", on: { click: () => addRule(kind) } }, icon("plus"), "Add")));
    return card("is-rules", "Rules", [], h("div.mc-two", {}, col("do", "Keep"), col("dont", "Never")), h("p.mc-hint", {}, "The brand guard checks every design against the palette, the logo files and these safe zones."));
  }

  function update() {
    const b = macaron.brand;
    if (!b) return;
    const kit = kitOf(b.body);
    const typing = el.contains(document.activeElement) && document.activeElement.matches("input:not([type=color]):not([type=number]), textarea");
    if (typing) return false;
    el.replaceChildren(logos(kit), paletteCard(kit), typeCard(kit), voiceCard(kit), rulesCard(kit));
  }
  const sig = () => JSON.stringify([macaron.brand?.body.kit, macaron.brand?.body.colours, macaron.brand?.body.logo, armedNow()]);
  return { el, update, sig };
}
