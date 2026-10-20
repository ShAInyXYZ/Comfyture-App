// Variations: saved alternatives of a design (other words, another composition, another ground, another
// goal, another format), side by side in the format picked, to compare and revise. A variation is a whole
// design that says what it is a variation of; the one that wins can take the original's place.
import { h, icon, sprite } from "./dom.js";
import { FORMAT_KEYS, FORMATS, layoutOf } from "./design.js";
import { LAYOUTS, copyLayers, applyKit, withPreset } from "./macaron-layout.js";
import {
  macaron, designById, designNow, kitNow, measure, openDesign, makeVariant, useVariant, removeDesign, edit, patchLayer, thumb, VARIANT_KINDS, INTENTS, reflowFor,
} from "./macaron.js";
import { card, key, seg, chip, swatches, textField, arming, isArmed, armedNow, fill } from "./macaron-ui.js";

const KIND_HINT = {
  copy: "The same design with other words",
  composition: "The same pieces, laid out another way",
  colour: "Another ground, the colours turned to read on it",
  intent: "The same idea for another goal: trial, community, an offer",
  format: "Starts from another format, laid out for it",
};

export function variationsSection() {
  const el = h("div.mc-bento.is-variations");
  const rerender = () => update();

  /** The root of the family the open design belongs to. */
  const rootOf = (d) => (d.variant ? designById(d.variant.of) ?? d : d);
  const family = (root) => [root, ...macaron.brand.body.designs.filter((x) => x.variant?.of === root.id)];

  function revise(v) {
    const kit = kitNow();
    const kind = v.variant?.kind;
    const body = [];
    if (kind === "copy" || !kind) {
      for (const l of copyLayers(v).slice(0, 4)) body.push(h("label.mc-rev", {}, h("span.label", {}, l.name), textField({ value: l.text, rows: 2, set: (t) => patchLayer(l.id, { text: t }, { design: v, format: v.format }), note: "Copy revised", label: l.name })));
    } else if (kind === "colour") {
      body.push(h("div.mc-rev", {}, h("span.label", {}, "Ground"), swatches(kit, v.bg.color, (c) => edit(() => { v.bg.color = c; applyKit(v, kit, measure()); }, "Ground revised"))));
    } else if (kind === "composition") {
      body.push(h("div.mc-rev", {}, h("span.label", {}, "Layout"), seg(Object.entries(LAYOUTS).map(([k, l]) => [k, l.split(",")[0].split(":")[0], l]), v.layout ?? "", (k) => edit(() => { let next = v; for (const f of new Set([v.format, ...Object.keys(v.formats ?? {})])) next = withPreset(next, f, k, measure()); Object.assign(v, next, { layout: k }); }, "Layout revised"), { cls: "is-small" })));
    } else if (kind === "intent") {
      body.push(h("div.mc-rev", {}, h("span.label", {}, "Goal"), seg(Object.entries(INTENTS).map(([k, x]) => [k, x.label, x.intent]), Object.entries(INTENTS).find(([, x]) => x.intent === v.intent)?.[0] ?? "", (k) => edit(() => { v.intent = INTENTS[k].intent; const cta = v.layers.find((l) => l.role === "cta"); if (cta && INTENTS[k].cta) cta.text = INTENTS[k].cta; v.variant.note = INTENTS[k].label; }, "Goal revised"), { cls: "is-small" })));
      for (const l of v.layers.filter((x) => x.role === "cta").slice(0, 1)) body.push(h("label.mc-rev", {}, h("span.label", {}, "Call to action"), textField({ value: l.text, set: (t) => patchLayer(l.id, { text: t }, { design: v, format: v.format }), note: "Copy revised", label: "Call to action" })));
    } else if (kind === "format") {
      body.push(h("div.mc-rev", {}, h("span.label", {}, "Format"), seg(FORMAT_KEYS.map((f) => [f, f, FORMATS[f].name]), v.format, (f) => f !== v.format && edit(() => { const lay = layoutOf(v, f, { reflow: reflowFor }); v.layers = lay.layers; v.bg = lay.bg; v.formats = {}; v.format = f; v.variant.note = `${FORMATS[f].name} first`; }, "Format revised"), { cls: "is-small" })));
    }
    return h("div.mc-revise", {}, ...body);
  }

  function cardFor(d, root, fmt) {
    const isRoot = d.id === root.id;
    const armedKey = `variant:${d.id}`;
    const pinned = (macaron.compare ?? []).includes(d.id);
    return h(`article.mc-var${d.id === macaron.design ? ".is-on" : ""}${isRoot ? ".is-root" : ""}`, { dataset: { kind: d.variant?.kind ?? "base" } },
      h("button.mc-var-pic", { type: "button", title: "Open it in the studio", on: { click: () => (openDesign(d.id, fmt), document.getElementById("mc-studio")?.scrollIntoView({ behavior: "smooth" })) } }, thumb(d, { format: fmt, width: 280 })),
      h("div.mc-var-body", {},
        h("div.mc-var-head", {}, h("span.mc-kind", { dataset: { kind: d.variant?.kind ?? "base" } }, isRoot ? "Original" : VARIANT_KINDS[d.variant.kind] ?? "Variation"), chip(d.status)),
        textField({ value: d.name, set: (v) => (d.name = v.slice(0, 60)), note: "Renamed", label: "The variation's name", cls: "mc-var-name" }),
        isRoot ? h("p.mc-hint", {}, d.intent || "The design the variations come from.") : textField({ value: d.variant.note ?? "", set: (v) => (d.variant.note = v.slice(0, 120)), note: "Noted", placeholder: "What is different", label: "What is different", cls: "mc-var-note" }),
        isRoot ? null : revise(d),
        h("div.mc-var-keys", {},
          key(sprite("scene-render"), "Open in the studio", () => (openDesign(d.id, fmt), document.getElementById("mc-studio")?.scrollIntoView({ behavior: "smooth" }))),
          key(sprite("image-compare"), pinned ? "Take it out of the comparison" : "Compare with another", () => ((macaron.compare = pinned ? macaron.compare.filter((x) => x !== d.id) : [...(macaron.compare ?? []), d.id].slice(-2)), rerender()), { on: pinned }),
          isRoot ? null : h("button.key.is-sm", { type: "button", title: "Take this variation's layers, ground and layouts as the original's", on: { click: () => useVariant(d.id) } }, icon("check"), "Use"),
          isRoot ? null : key(icon("trash"), isArmed(armedKey) ? "Click again to delete the variation" : "Delete the variation", () => arming(armedKey, rerender, () => removeDesign(d.id)), { on: isArmed(armedKey) }))));
  }

  function compareCard(fmt) {
    const [a, b] = (macaron.compare ?? []).map((id) => designById(id));
    if (!a || !b) return null;
    const texts = (d) => Object.fromEntries(d.layers.filter((l) => l.type === "text").map((l) => [l.role ?? l.id, l.text]));
    const [ta, tb] = [texts(a), texts(b)];
    const diffs = [...new Set([...Object.keys(ta), ...Object.keys(tb)])].filter((k) => ta[k] !== tb[k]);
    return card("is-compare", "Side by side", [key(icon("close"), "Close the comparison", () => ((macaron.compare = []), rerender()))],
      h("div.mc-compare", {}, ...[a, b].map((d) => h("figure", {}, thumb(d, { format: fmt, width: 420 }), h("figcaption", {}, h("b", {}, d.name), h("em", {}, d.variant?.note ?? d.intent ?? ""))))),
      diffs.length ? h("dl.mc-diff", {}, ...diffs.flatMap((k) => [h("dt", {}, k), h("dd", {}, h("span", {}, ta[k]?.replace(/\*/g, "") ?? "—"), h("span", {}, tb[k]?.replace(/\*/g, "") ?? "—"))])) : h("p.mc-hint", {}, "The words are the same: they differ in look and place."));
  }

  function update() {
    const b = macaron.brand;
    if (!b) return;
    const typing = el.contains(document.activeElement) && document.activeElement.matches("input, textarea");
    if (typing) return false;
    const d = designNow();
    if (!d) return void fill(el, card("is-vars", "Variations", [], h("p.mc-hint", {}, "Open a design in the studio, then save alternatives of it here.")));
    const root = rootOf(d);
    const fmt = macaron.varFormat ?? d.format;
    const fam = family(root);
    fill(el,
      card("is-vars", `Variations of ${root.name}`, [
        h("div.segment", { role: "group", "aria-label": "Format shown" }, ...FORMAT_KEYS.map((f) => h("button", { type: "button", title: FORMATS[f].name, "aria-pressed": String(fmt === f), on: { click: () => ((macaron.varFormat = f), rerender()) } }, f)))],
        h("div.mc-var-new", {}, h("span.label", {}, "Make a variation"),
          ...Object.entries(VARIANT_KINDS).map(([k, label]) => h("button.key", { type: "button", title: KIND_HINT[k], on: { click: () => makeVariant(k, { from: root }) } }, icon("plus"), label))),
        h("div.mc-vars", {}, ...fam.map((x) => cardFor(x, root, fmt)))),
      compareCard(fmt));
  }
  const sig = () => JSON.stringify([macaron.brand?.body.designs, macaron.compare, macaron.varFormat, macaron.design, armedNow(), macaron.brand?.body.kit.palette]);
  return { el, update, sig };
}
