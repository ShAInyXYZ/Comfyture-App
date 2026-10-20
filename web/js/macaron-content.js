// The Content workspace: what the brand puts out. This week's plan, a motion piece, the posts by format, and what
// leaves as a file. A post opens in the layered editor, in its own window; variations, motion and exports have
// windows of their own, all one click from the bentos.
import { h, icon, sprite } from "./dom.js";
import { dropdown } from "./controls.js";
import { toast, changed } from "./store.js";
import { view } from "./viewer.js";
import { FORMAT_KEYS, FORMATS, PURPOSES, STATUSES, ownFormats } from "./design.js";
import {
  macaron, designById, designNow, openDesign, setDesign, planDesign, addDesign, exportPng, exportMany, exportsOf, removeExport, saveAs, thumb, motionNow, pickMotion, addMotion, renderMotion, EXPORT_KINDS,
} from "./macaron.js";
import { bento, mcicon, key, chip, arming, isArmed, armedNow, kb, shortDate, seconds, fill } from "./macaron-ui.js";
import { defineWindow, openWin } from "./macaron-win.js";
import { studioSection } from "./macaron-studio.js";
import { variationsSection } from "./macaron-variations.js";
import { motionSection } from "./macaron-motion.js";

const cap = (s) => s[0].toUpperCase() + s.slice(1);
const DAYS = [["mon", "Mon"], ["tue", "Tue"], ["wed", "Wed"], ["thu", "Thu"], ["fri", "Fri"], ["sat", "Sat"], ["sun", "Sun"]];
const STATUS_LABEL = { draft: "Draft", review: "In review", approved: "Ready", scheduled: "Scheduled" };
const TONE = { draft: "", review: "warn", approved: "ok", scheduled: "info" };
const kindOf = (d) => (d.motion ? "Reel" : d.format === "9:16" ? "Story" : "Post");
const fmtIcon = (f) => sprite(f === "9:16" ? "ratio-9-16" : f === "1:1" ? "ratio-1-1" : "ratio-3-4");
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
const bases = (b) => b.body.designs.filter((d) => !d.variant);
const typingIn = (el) => el.contains(document.activeElement) && document.activeElement.matches("input, textarea");
const lamp = (status) => h("span.lamp", { dataset: TONE[status] ? { tone: TONE[status] } : {} });
const open = (id, format) => (openDesign(id, format), openWin("editor"));

// ---------------------------------------------------------------- the workspace

export function contentSpace() {
  const el = h("div.mc-grid.is-content");

  function week(b) {
    const planned = b.body.designs.filter((d) => d.plan?.day).sort((a, c) => DAYS.findIndex(([k]) => k === a.plan.day) - DAYS.findIndex(([k]) => k === c.plan.day)).slice(0, 4);
    return bento("is-week", "This week", () => openWin("week"),
      planned.length ? h("div.mc-weekrow", {}, ...planned.map((d) => h("button.mc-wk", { type: "button", title: `${d.name}\nOpen it in the editor`, on: { click: (e) => (e.stopPropagation(), open(d.id)) } },
        h("span.mc-wk-pic", {}, thumb(d, { width: 120 })),
        h("span.mc-wk-text", {}, h("em", {}, DAYS.find(([k]) => k === d.plan.day)?.[1].toUpperCase()), h("b", {}, kindOf(d)), h("span.mc-wk-status", {}, lamp(d.status), STATUS_LABEL[d.status])),
        h("span.mc-wk-more", { "aria-hidden": "true" }, icon("more")))))
        : h("button.mc-empty-tile.is-wide", { type: "button", on: { click: () => openWin("week") } }, icon("plus"), h("span", {}, "Plan the week: give a post a day")));
  }

  function motion(b) {
    const m = motionNow() ?? b.body.motion[0];
    const d = m && designById(m.design);
    return bento("is-motion", "Motion", () => openWin("motion"),
      m && d ? h("div.mc-reel", {},
        h("div.mc-reel-frame", { style: { "--ar": `${FORMATS[m.format].w} / ${FORMATS[m.format].h}` } }, h("span.mc-reel-pic", {}, thumb(d, { format: m.format, width: 330, t: m.cover ?? d.poster ?? null })),
          h("button.mc-play-big", { type: "button", title: "Open the motion piece", "aria-label": "Open the motion piece", on: { click: (e) => (e.stopPropagation(), (pickMotion(m.id), openWin("motion"))) } }, icon("play")),
          h("span.mc-reel-time", {}, clock(m.duration))),
        h("div.mc-reel-tag", {}, h("span.mc-fmtchip", {}, fmtIcon(m.format), m.format), h("b", {}, m.name.replace(/^Logo and product /, "Logo "))))
        : h("button.mc-empty-tile", { type: "button", on: { click: (e) => (e.stopPropagation(), designNow() ? (addMotion(), openWin("motion")) : toast("Open a post first.")) } }, icon("plus"), h("span", {}, "Animate a post")));
  }

  function posts(b) {
    const list = bases(b).filter((d) => !d.motion).slice(0, 4);
    const cycle = ["4:5", "1:1", "9:16", "4:5"];
    return bento("is-posts", "Posts", () => openWin("posts"),
      list.length ? h("div.mc-postrow", {}, ...list.map((d, i) => {
        const own = ownFormats(d);
        const f = own.includes(cycle[i]) ? cycle[i] : d.format;
        return h("button.mc-post", { type: "button", style: { "--r": String(FORMATS[f].w / FORMATS[f].h) }, title: `${d.name}\nOpen it in the editor`, on: { click: (e) => (e.stopPropagation(), open(d.id, f)) } },
          h("span.mc-post-pic", { style: { "--ar": `${FORMATS[f].w} / ${FORMATS[f].h}` } }, thumb(d, { format: f, width: 260 })),
          h("span.mc-post-foot", {}, h("span.mc-fmtchip", {}, fmtIcon(f), f), h("b", {}, f === "9:16" ? "Story" : "Post")));
      })) : h("button.mc-empty-tile", { type: "button", on: { click: (e) => (e.stopPropagation(), (addDesign({ name: `${b.name} · first`, format: "4:5" }), openWin("editor"))) } }, icon("plus"), h("span", {}, "Make a first post from the kit")));
  }

  function exporter(b) {
    const kinds = macaron.exportKinds;
    return bento("is-export", "Export", () => openWin("export"),
      h("div.mc-xrow", {},
        h("b.mc-xlead", {}, "Export your", h("br"), "content"),
        h("div.mc-xchips", { "data-keep": "" }, ...EXPORT_KINDS.map(([k, label, glyph]) => h("button.mc-xchip", { type: "button", "aria-pressed": String(!!kinds[k]), title: kinds[k] ? `${label}: on` : `${label}: off`, on: { click: () => ((macaron.exportKinds = { ...kinds, [k]: !kinds[k] }), changed("macaron")) } }, sprite(glyph), label))),
        h("button.mc-dlall", { type: "button", "data-keep": "", disabled: !!macaron.progress || !!macaron.bulk || exportCount() === 0, on: { click: () => exportMany() } }, icon("download"), macaron.bulk ? `${macaron.bulk.done} / ${macaron.bulk.total}` : "Download all")));
  }
  const exportCount = () => Object.values(macaron.exportKinds).filter(Boolean).length;

  function update() {
    const b = macaron.brand;
    if (!b) return;
    fill(el, week(b), motion(b), posts(b), exporter(b));
  }
  const sig = () => {
    const x = macaron.brand?.body;
    return JSON.stringify([x?.designs?.map((d) => [d.id, d.name, d.status, d.plan, d.format, d.updatedAt]), x?.motion, x?.kit?.palette, macaron.exportKinds, macaron.progress, macaron.bulk, x?.exports?.length]);
  };
  return { el, update, sig };
}

// ---------------------------------------------------------------- the windows

function weekWin() {
  const el = h("div.mc-w.is-week");
  function update() {
    const b = macaron.brand;
    if (!b) return;
    const all = bases(b);
    const day = (k) => all.filter((d) => d.plan?.day === k);
    const dayPick = (d) => h("select.field.mc-planday", { "aria-label": `Day for ${d.name}`, on: { change: (e) => planDesign(d.id, e.target.value || null) } },
      h("option", { value: "" }, "No day"), ...DAYS.map(([k, t]) => h("option", { value: k, selected: d.plan?.day === k }, t)));
    const card = (d) => h("article.mc-plan", {},
      h("button.mc-plan-pic", { type: "button", title: "Open it in the editor", on: { click: () => open(d.id) } }, thumb(d, { width: 120 })),
      h("div.mc-plan-text", {}, h("b", { title: d.name }, d.name), h("span.mc-wk-status", {}, lamp(d.status), STATUS_LABEL[d.status]), chip(kindOf(d))),
      h("div.mc-plan-keys", {},
        h("select.field.mc-status", { "aria-label": "Status", dataset: { status: d.status }, on: { change: (e) => setDesign(d.id, { status: e.target.value }, `Status: ${e.target.value}`) } }, ...STATUSES.map((s) => h("option", { value: s, selected: s === d.status }, STATUS_LABEL[s]))),
        dayPick(d)));
    const loose = all.filter((d) => !d.plan?.day);
    fill(el,
      h("div.mc-weekgrid", {}, ...DAYS.map(([k, t]) => h("section.mc-day", { dataset: { day: k } }, h("span.mc-day-label", {}, t.toUpperCase()), h("div.mc-day-cards", {}, ...day(k).map(card))))),
      h("div.mc-loose", {}, h("span.label", {}, "Not planned yet"), loose.length ? h("div.mc-day-cards.is-row", {}, ...loose.map(card)) : h("p.mc-hint", {}, "Every post has a day.")));
  }
  const sig = () => JSON.stringify([macaron.brand?.body.designs.map((d) => [d.id, d.name, d.status, d.plan, d.updatedAt])]);
  return { el, update, sig };
}
defineWindow("week", { title: "This week", sub: () => macaron.brand?.name ?? "", size: "xl", advanced: false, make: weekWin });

function postsWin() {
  const el = h("div.mc-w.is-posts");
  const f = () => macaron.filter;
  const setF = (k, v) => ((macaron.filter = { ...macaron.filter, [k]: v }), update());
  function filters(designs) {
    const count = (k, v) => designs.filter((d) => (k === "purpose" ? d.purpose === v : k === "status" ? d.status === v : ownFormats(d).includes(v))).length;
    const chips = (k, label, values) => h("div.mc-filter-row", {}, h("span.label", {}, label), h("div.mc-filters", {},
      h("button", { type: "button", "aria-pressed": String(f()[k] === "all"), on: { click: () => setF(k, "all") } }, "All", h("em", {}, String(designs.length))),
      ...values.map((v) => h("button", { type: "button", "aria-pressed": String(f()[k] === v), disabled: !count(k, v), on: { click: () => setF(k, v) } }, k === "status" ? STATUS_LABEL[v] : v, h("em", {}, String(count(k, v)))))));
    return h("div.mc-filter-box", {}, chips("purpose", "Purpose", PURPOSES), chips("format", "Format", FORMAT_KEYS), chips("status", "Status", STATUSES),
      h("div.mc-filter-row", {}, h("span.label", {}, "Group by"), h("div.segment", { role: "group" }, ...[["none", "Nothing"], ["purpose", "Purpose"], ["status", "Status"], ["format", "Format"]].map(([v, l]) => h("button", { type: "button", "aria-pressed": String(f().group === v), on: { click: () => setF("group", v) } }, l)))));
  }
  function item(d) {
    const own = ownFormats(d);
    const exp = exportsOf(d.id);
    return h(`article.mc-item${d.id === macaron.design ? ".is-on" : ""}`, { dataset: { status: d.status } },
      h("button.mc-item-pic", { type: "button", title: "Open it in the editor", on: { click: () => open(d.id) } }, thumb(d, { width: 200 })),
      h("div.mc-item-body", {},
        h("b", { title: d.name }, d.name),
        h("div.mc-item-chips", {}, chip(d.purpose), ...own.map((x) => chip(x)), d.variant ? chip(d.variant.kind, { tone: "alt" }) : null, d.motion ? chip("motion") : null),
        h("div.mc-item-foot", {},
          h("select.field.mc-status", { "aria-label": "Status", dataset: { status: d.status }, on: { change: (e) => setDesign(d.id, { status: e.target.value }, `Status: ${e.target.value}`) } }, ...STATUSES.map((s) => h("option", { value: s, selected: s === d.status }, cap(s)))),
          h("span.mc-item-meta", {}, exp.length ? `${exp.length} exported` : "not exported"))));
  }
  function list(designs) {
    const show = designs.filter((d) => (f().purpose === "all" || d.purpose === f().purpose) && (f().status === "all" || d.status === f().status) && (f().format === "all" || ownFormats(d).includes(f().format)));
    if (!show.length) return h("p.mc-hint", {}, "No post matches these filters.");
    const g = f().group;
    if (g === "none") return h("div.mc-items", {}, ...show.map(item));
    const keys = g === "status" ? STATUSES : g === "purpose" ? PURPOSES : FORMAT_KEYS;
    const of = (d) => (g === "status" ? [d.status] : g === "purpose" ? [d.purpose] : ownFormats(d));
    return h(`div.mc-groups${g === "status" ? ".is-kanban" : ""}`, {}, ...keys.map((k) => {
      const those = show.filter((d) => of(d).includes(k));
      return g === "status" || those.length ? h("section.mc-group", { dataset: { key: k } }, h("div.mc-group-head", {}, h("span.card-label", {}, g === "status" ? cap(k) : k), chip(String(those.length))), h("div.mc-items", {}, ...those.map(item))) : null;
    }).filter(Boolean));
  }
  function update() {
    const b = macaron.brand;
    if (!b || typingIn(el)) return typingIn(el) ? false : undefined;
    const designs = b.body.designs;
    const counts = STATUSES.map((s) => [s, designs.filter((d) => d.status === s).length]);
    fill(el,
      h("div.mc-posts-top", {}, h("div.mc-counts", {}, ...counts.map(([s, n]) => h("span", { dataset: { status: s } }, h("i"), `${n} ${s}`))), h("span.spacer"),
        h("button.key.is-accent", { type: "button", title: "A new post from the brand kit", on: { click: () => (addDesign({ name: `${b.name} · new`, format: macaron.format }), openWin("editor")) } }, icon("plus"), "A new post")),
      filters(designs), list(designs));
  }
  const sig = () => { const b = macaron.brand?.body; return JSON.stringify([b?.designs?.map((d) => [d.id, d.name, d.status, d.purpose, d.format, d.formats && Object.keys(d.formats), d.updatedAt]), b?.exports?.length, macaron.filter, macaron.design]); };
  return { el, update, sig };
}
defineWindow("posts", { title: "Posts", sub: () => macaron.brand?.name ?? "", size: "xl", advanced: false, make: postsWin });

function editorWin() {
  const studio = studioSection();
  return { el: studio.el, update: studio.update, draw: studio.draw, sig: () => JSON.stringify([macaron.brand?.body.designs, macaron.brand?.body.kit, macaron.design, macaron.format, macaron.layer, macaron.past.length, macaron.future.length, macaron.safe, [...macaron.busy], armedNow(), macaron.brand?.body.assets?.length]) };
}
defineWindow("editor", {
  title: () => designNow()?.name ?? "Editor",
  sub: () => (designNow() ? `${designNow().purpose} · ${designNow().status}` : ""),
  size: "xl",
  advanced: false,
  make: editorWin,
  tools: () => [
    h("button.key.is-sm", { type: "button", title: "Alternatives of this post: copy, composition, colour, goal, format", on: { click: () => openWin("variations") } }, sprite("variations"), "Variations"),
    h("button.key.is-sm", { type: "button", title: "Animate this post: a first timing, then the piece's own window", on: { click: () => { const d = designNow(); if (!d) return; const m = macaron.brand.body.motion.find((x) => x.design === d.id) ?? addMotion(); pickMotion(m.id); openWin("motion"); } } }, mcicon("clapper"), "Animate"),
  ],
});

defineWindow("variations", { title: () => `Variations of ${designNow()?.name ?? ""}`, sub: () => "", size: "xl", advanced: false, make: variationsSection });
defineWindow("motion", { title: "Motion", sub: () => macaron.brand?.name ?? "", size: "xl", advanced: false, make: motionSection });

function exportWin() {
  const el = h("div.mc-w.is-export");
  function update() {
    const b = macaron.brand;
    if (!b) return;
    const kinds = macaron.exportKinds;
    const scope = macaron.exportScope;
    const scopes = [["approved", "Ready and scheduled"], ["week", "This week's plan"], ["all", "Every post"]];
    const list = b.body.exports.slice(0, 40);
    fill(el,
      h("div.mc-xwin-top", {},
        h("div.mc-xchips", {}, ...EXPORT_KINDS.map(([k, label, glyph]) => h("button.mc-xchip", { type: "button", "aria-pressed": String(!!kinds[k]), on: { click: () => ((macaron.exportKinds = { ...kinds, [k]: !kinds[k] }), changed("macaron")) } }, sprite(glyph), label))),
        h("div.segment", { role: "group", "aria-label": "Which posts" }, ...scopes.map(([v, l]) => h("button", { type: "button", "aria-pressed": String(scope === v), on: { click: () => ((macaron.exportScope = v), changed("macaron")) } }, l))),
        h("button.mc-dlall", { type: "button", disabled: !!macaron.progress || !!macaron.bulk || !Object.values(kinds).some(Boolean), on: { click: () => exportMany() } }, icon("download"), macaron.bulk ? `${macaron.bulk.done} / ${macaron.bulk.total}` : "Download all")),
      h("p.mc-hint", {}, "Pictures are made in every layout a post has of its own; motion pieces come out as video."),
      h("span.label", {}, `What has left · ${b.body.exports.length}`),
      list.length ? h("div.mc-exports.is-grid", {}, ...list.map((x) => h("div.mc-export", {},
        h("button.mc-export-pic", { type: "button", title: "See it", on: { click: () => (x.kind === "mp4" || x.kind === "webm" ? view(x.url, "video") : view(x.url)) } }, h("img", { src: x.poster ?? x.url, alt: "", loading: "lazy", draggable: false }), x.kind === "mp4" || x.kind === "webm" ? h("span.mc-play", {}, icon("play")) : null),
        h("span.mc-export-text", {}, h("b", {}, `${x.kind.toUpperCase()} ${x.format}`), h("em", {}, `${x.designName}`), h("em", {}, `${x.width}×${x.height}${x.duration ? ` · ${seconds(x.duration)}` : ""} · ${kb(x.bytes ?? 0)} · ${shortDate(x.at)}`)),
        h("a.key.is-icon.is-sm", { href: `${x.url}?download=${x.file}`, title: "Download", "aria-label": "Download" }, icon("download")),
        key(icon("trash"), isArmed(`export:${x.id}`) ? "Click again to forget it" : "Forget this export", () => arming(`export:${x.id}`, update, () => removeExport(x.id)), { on: isArmed(`export:${x.id}`) })))) : h("p.mc-hint", {}, "Nothing exported yet."));
  }
  const sig = () => { const b = macaron.brand?.body; return JSON.stringify([b?.exports, macaron.exportKinds, macaron.exportScope, macaron.progress, macaron.bulk, armedNow()]); };
  return { el, update, sig };
}
defineWindow("export", { title: "Export", sub: () => macaron.brand?.name ?? "", size: "l", advanced: false, make: exportWin });
