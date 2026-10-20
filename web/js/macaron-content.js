// Content: every design of the brand, organised by what it is for, its format and its status, and what
// has been exported. The design picked here is the one open in the studio; its pictures (PNG, per
// format) and its motion (MP4) are exported from this card.
import { h, icon, sprite } from "./dom.js";
import { FORMAT_KEYS, FORMATS, PURPOSES, STATUSES, ownFormats } from "./design.js";
import { macaron, designNow, openDesign, setDesign, addDesign, exportPng, exportsOf, removeExport, saveAs, thumb, renderMotion } from "./macaron.js";
import { card, key, chip, arming, isArmed, armedNow, kb, shortDate, seconds } from "./macaron-ui.js";
import { view } from "./viewer.js";

const cap = (s) => s[0].toUpperCase() + s.slice(1);
const TONE = { draft: "", review: "warn", approved: "ok", scheduled: "info" };

export function contentSection() {
  const el = h("div.mc-bento.is-content");
  const rerender = () => update();
  const f = () => macaron.filter;
  const setF = (k, v) => ((macaron.filter = { ...macaron.filter, [k]: v }), rerender());

  function filters(designs) {
    const count = (k, v) => designs.filter((d) => (k === "purpose" ? d.purpose === v : k === "status" ? d.status === v : ownFormats(d).includes(v))).length;
    const chips = (k, label, values) => h("div.mc-filter-row", {}, h("span.label", {}, label), h("div.mc-filters", {},
      h("button", { type: "button", "aria-pressed": String(f()[k] === "all"), on: { click: () => setF(k, "all") } }, "All", h("em", {}, String(designs.length))),
      ...values.map((v) => h("button", { type: "button", "aria-pressed": String(f()[k] === v), disabled: !count(k, v), on: { click: () => setF(k, v) } }, k === "status" ? cap(v) : v, h("em", {}, String(count(k, v)))))));
    return h("div.mc-filter-box", {}, chips("purpose", "Purpose", PURPOSES), chips("format", "Format", FORMAT_KEYS), chips("status", "Status", STATUSES),
      h("div.mc-filter-row", {}, h("span.label", {}, "Group by"), h("div.segment", { role: "group" }, ...[["none", "Nothing"], ["purpose", "Purpose"], ["status", "Status"], ["format", "Format"]].map(([v, l]) => h("button", { type: "button", "aria-pressed": String(f().group === v), on: { click: () => setF("group", v) } }, l)))));
  }

  function item(d) {
    const own = ownFormats(d);
    const exp = exportsOf(d.id);
    return h(`article.mc-item${d.id === macaron.design ? ".is-on" : ""}`, { dataset: { status: d.status } },
      h("button.mc-item-pic", { type: "button", title: "Open it in the studio", on: { click: () => openDesign(d.id) } }, thumb(d, { width: 200 })),
      h("div.mc-item-body", {},
        h("b", { title: d.name }, d.name),
        h("div.mc-item-chips", {}, chip(d.purpose), ...own.map((x) => chip(x)), d.variant ? chip(d.variant.kind, { tone: "alt" }) : null, d.motion ? chip("motion") : null),
        h("div.mc-item-foot", {},
          h("select.field.mc-status", { "aria-label": "Status", dataset: { status: d.status }, on: { change: (e) => setDesign(d.id, { status: e.target.value }, `Status: ${e.target.value}`) } }, ...STATUSES.map((s) => h("option", { value: s, selected: s === d.status }, cap(s)))),
          h("span.mc-item-meta", {}, exp.length ? `${exp.length} exported` : "not exported"))));
  }

  function list(designs) {
    const show = designs.filter((d) => (f().purpose === "all" || d.purpose === f().purpose) && (f().status === "all" || d.status === f().status) && (f().format === "all" || ownFormats(d).includes(f().format)));
    if (!show.length) return h("p.mc-hint", {}, "No design matches these filters.");
    const g = f().group;
    if (g === "none") return h("div.mc-items", {}, ...show.map(item));
    const keys = g === "status" ? STATUSES : g === "purpose" ? PURPOSES : FORMAT_KEYS;
    const of = (d) => (g === "status" ? [d.status] : g === "purpose" ? [d.purpose] : ownFormats(d));
    return h(`div.mc-groups${g === "status" ? ".is-kanban" : ""}`, {}, ...keys.map((k) => {
      const those = show.filter((d) => of(d).includes(k));
      return g === "status" || those.length ? h("section.mc-group", { dataset: { key: k } }, h("div.mc-group-head", {}, h("span.card-label", {}, g === "status" ? cap(k) : k), chip(String(those.length))), h("div.mc-items", {}, ...those.map(item))) : null;
    }).filter(Boolean));
  }

  function exportCard() {
    const d = designNow();
    if (!d) return card("is-export", "Export", [], h("p.mc-hint", {}, "Pick a design to export it."));
    const exp = exportsOf(d.id);
    const motion = macaron.brand.body.motion.find((m) => m.design === d.id);
    return card("is-export", "Export", [chip(d.status, { tone: TONE[d.status] })],
      h("div.mc-export-head", {}, h("b", {}, d.name), h("em", {}, `${d.purpose} · ${d.status}`)),
      h("div.mc-export-keys", {}, ...FORMAT_KEYS.map((fm) => {
        const busy = macaron.busy.has(`export:${d.id}:${fm}`);
        return h(`button.key${macaron.format === fm ? ".is-accent" : ""}`, { type: "button", disabled: busy, title: `Export ${FORMATS[fm].name} as a PNG, ${FORMATS[fm].w}×${FORMATS[fm].h}${ownFormats(d).includes(fm) ? "" : "\nAn automatic layout"}`, on: { click: () => exportPng(d.id, fm) } }, sprite("export"), busy ? "…" : `PNG ${fm}`);
      })),
      motion ? h("div.mc-export-keys", {}, h("button.key", { type: "button", disabled: !!macaron.progress, title: "Render the motion piece as an MP4", on: { click: () => renderMotion(motion.id) } }, sprite("film-make"), macaron.progress?.id === motion.id ? "Rendering…" : "MP4 motion"),
        motion.render ? h("button.key.is-quiet", { type: "button", on: { click: () => saveAs(`${motion.render.url}?download=${`${macaron.brand.name}-${motion.name}`.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.mp4`) } }, icon("download"), "Last MP4") : null) : null,
      h("span.label", {}, `Exports of this design · ${exp.length}`),
      exp.length ? h("div.mc-exports", {}, ...exp.slice(0, 12).map((x) => h("div.mc-export", {},
        h("button.mc-export-pic", { type: "button", title: "See it", on: { click: () => (x.kind === "mp4" ? view(x.url, "video") : view(x.url)) } }, h("img", { src: x.poster ?? x.url, alt: "", loading: "lazy", draggable: false }), x.kind === "mp4" ? h("span.mc-play", {}, icon("play")) : null),
        h("span.mc-export-text", {}, h("b", {}, `${x.kind.toUpperCase()} ${x.format}`), h("em", {}, `${x.width}×${x.height}${x.duration ? ` · ${seconds(x.duration)}` : ""} · ${kb(x.bytes ?? 0)} · ${shortDate(x.at)}`)),
        h("a.key.is-icon.is-sm", { href: `${x.url}?download=${x.file}`, title: "Download", "aria-label": "Download" }, icon("download")),
        key(icon("trash"), isArmed(`export:${x.id}`) ? "Click again to forget it" : "Forget this export", () => arming(`export:${x.id}`, rerender, () => removeExport(x.id)), { on: isArmed(`export:${x.id}`) })))) : h("p.mc-hint", {}, "Nothing exported yet."));
  }

  function update() {
    const b = macaron.brand;
    if (!b) return;
    const typing = el.contains(document.activeElement) && document.activeElement.matches("input, textarea");
    if (typing) return false;
    const designs = b.body.designs;
    const counts = STATUSES.map((s) => [s, designs.filter((d) => d.status === s).length]);
    el.replaceChildren(
      card("is-designs", "Designs", [h("div.mc-counts", {}, ...counts.map(([s, n]) => h("span", { dataset: { status: s } }, h("i"), `${n} ${s}`))), key(icon("plus"), "A new design from the brand kit", () => addDesign({ name: `${b.name} · new`, format: macaron.format }))],
        filters(designs), list(designs)),
      exportCard());
  }
  const sig = () => { const b = macaron.brand?.body; return JSON.stringify([b?.designs, b?.exports, b?.motion, macaron.filter, macaron.design, macaron.format, [...macaron.busy], macaron.progress, armedNow()]); };
  return { el, update, sig };
}
