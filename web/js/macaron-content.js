// Create's windows: this week's plan, the posts (a library of everything made), the post editor, variations, motion and the
// export. The workspace itself, the families and the starters are macaron-create.js; the mockup window is macaron-mockup.js.
// A design opens in the layered editor, in its own window; variations, motion and exports have windows of their own.
import { h, icon, sprite } from "./dom.js";
import { dropdown } from "./controls.js";
import { toast, changed } from "./store.js";
import { view } from "./viewer.js";
import { FORMATS, ALL_FORMATS, FAMILIES, FAMILY_KEYS, PURPOSES, STATUSES, ownFormats, familyOf, labelOf, ratioGlyph } from "./design.js";
import {
  macaron, designById, designNow, openDesign, setDesign, planDesign, addDesign, duplicateDesign, guardOf, exportPng, exportMany, exportsOf, removeExport, saveAs, thumb, motionNow, pickMotion, addMotion, renderMotion, EXPORT_KINDS,
} from "./macaron.js";
import { bento, mcicon, key, chip, arming, isArmed, armedNow, kb, shortDate, seconds, fill } from "./macaron-ui.js";
import { defineWindow, openWin } from "./macaron-win.js";
import { studioSection } from "./macaron-studio.js";
import { variationsSection } from "./macaron-variations.js";
import { motionSection } from "./macaron-motion.js";
import { createSpace } from "./macaron-create.js";
import "./macaron-mockup.js";

/** The workspace of the panel's fourth key: Create (macaron-create.js). */
export const contentSpace = createSpace;

const cap = (s) => s[0].toUpperCase() + s.slice(1);
const DAYS = [["mon", "Mon"], ["tue", "Tue"], ["wed", "Wed"], ["thu", "Thu"], ["fri", "Fri"], ["sat", "Sat"], ["sun", "Sun"]];
const STATUS_LABEL = { draft: "Draft", review: "In review", approved: "Ready", scheduled: "Scheduled" };
const TONE = { draft: "", review: "warn", approved: "ok", scheduled: "info" };
/** What a design is, in a word: a post, a story, a reel, a flyer, a banner... */
const kindOf = (d) => (d.motion ? "Reel" : d.format === "9:16" ? "Story" : familyOf(d.format) === "social" ? "Post" : familyOf(d.format) === "print" ? (d.format === "a2" ? "Poster" : "Flyer") : familyOf(d.format) === "ads" ? "Banner" : FORMATS[d.format].name);
const fmtIcon = (f) => sprite(ratioGlyph(f));
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
const bases = (b) => b.body.designs.filter((d) => !d.variant);
const typingIn = (el) => el.contains(document.activeElement) && document.activeElement.matches("input, textarea");
const lamp = (status) => h("span.lamp", { dataset: TONE[status] ? { tone: TONE[status] } : {} });
const open = (id, format) => (openDesign(id, format), openWin("editor"));

// ---------------------------------------------------------------- the windows

/** What these windows share: the next status a click on a status lamp goes to, and the key that does it. */
const nextStatus = (s) => STATUSES[(STATUSES.indexOf(s) + 1) % STATUSES.length];
const statusKey = (d) => h("button.mc-skey", { type: "button", dataset: { status: d.status }, title: `${STATUS_LABEL[d.status]}. Click for ${STATUS_LABEL[nextStatus(d.status)].toLowerCase()}`, on: { click: (e) => (e.stopPropagation(), setDesign(d.id, { status: nextStatus(d.status) }, `Status: ${nextStatus(d.status)}`)) } }, lamp(d.status), STATUS_LABEL[d.status]);
const warnGlyph = () => {
  const span = document.createElement("span");
  span.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4 3 19.5h18zM12 10v4.5M12 17.2v.1"/></svg>';
  span.className = "mc-warn-glyph";
  return span;
};
const newPost = () => openWin("starters");
const WEEKDAY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date().getDay()];

function weekWin() {
  const el = h("div.mc-w.is-week");
  const foot = h("button.mc-primary", { type: "button", title: "A new design from the brand kit", on: { click: () => macaron.brand && newPost() } }, icon("plus"), "New design");
  // a post is dragged to a day (or back to the tray); the day keys on each card do the same without dragging
  const drop = (day) => ({
    dragover: (e) => (e.preventDefault(), (e.dataTransfer.dropEffect = "move"), e.currentTarget.classList.add("is-over")),
    dragleave: (e) => !e.currentTarget.contains(e.relatedTarget) && e.currentTarget.classList.remove("is-over"),
    drop: (e) => {
      e.preventDefault();
      e.currentTarget.classList.remove("is-over");
      const id = e.dataTransfer.getData("text/plain");
      if (designById(id) && designById(id).plan?.day !== day) planDesign(id, day);
    },
  });
  function card(d) {
    return h("article.mc-wcard", { draggable: "true", dataset: { id: d.id }, on: {
      dragstart: (e) => ((e.dataTransfer.effectAllowed = "move"), e.dataTransfer.setData("text/plain", d.id), e.currentTarget.classList.add("is-dragging")),
      dragend: (e) => e.currentTarget.classList.remove("is-dragging"),
    } },
      h("button.mc-wcard-pic", { type: "button", title: `${d.name}\nOpen it in the editor`, on: { click: () => open(d.id) } }, thumb(d, { width: 360 })),
      // (the post's own name under its picture, in a frame of one shape: a 160x600 skyscraper and a 728x90 strip are cards like the others)
      h("div.mc-wcard-foot", {}, h("b", { title: `${d.name}\n${kindOf(d)}` }, d.name), statusKey(d)),
      h("div.mc-wcard-days", { role: "group", "aria-label": `Day for ${d.name}` }, ...DAYS.map(([k, t]) =>
        h("button", { type: "button", title: d.plan?.day === k ? `Take it off ${t}` : `Put it on ${t}`, "aria-pressed": String(d.plan?.day === k), on: { click: () => planDesign(d.id, d.plan?.day === k ? null : k) } }, t[0]))));
  }
  function update() {
    const b = macaron.brand;
    if (!b) return;
    const all = bases(b);
    const loose = all.filter((d) => !d.plan?.day);
    fill(el,
      h("div.mc-lanes", {}, ...DAYS.map(([k, t]) => {
        const mine = all.filter((d) => d.plan?.day === k);
        return h(`section.mc-lane${k === WEEKDAY ? ".is-today" : ""}`, { dataset: { day: k }, on: drop(k) },
          h("header.mc-lane-head", {}, h("b", {}, t), h("em", {}, mine.length ? `${mine.length} ${mine.length === 1 ? "post" : "posts"}` : k === WEEKDAY ? "today" : "")),
          h("div.mc-lane-cards", {}, ...mine.map(card), mine.length ? null : h("div.mc-lane-empty", {}, icon("plus"), h("span", {}, "Drop a post here"))));
      })),
      h("section.mc-tray", { on: drop(null) },
        h("div.mc-sec-head", {}, h("span.label", {}, "Not planned yet"), h("span.mc-count", {}, String(loose.length))),
        loose.length ? h("div.mc-tray-cards", {}, ...loose.map(card)) : h("p.mc-hint", {}, "Every post has a day.")));
  }
  const sig = () => JSON.stringify([macaron.brand?.body.designs.map((d) => [d.id, d.name, d.status, d.plan, d.updatedAt])]);
  return { el, update, sig, foot: [foot] };
}
defineWindow("week", { eyebrow: "Create", title: "This week", sub: () => macaron.brand?.name ?? "", size: "xl", advanced: false, make: weekWin, foot: (part) => part.foot });

function postsWin() {
  const el = h("div.mc-w.is-posts");
  const f = () => macaron.filter;
  const setF = (k, v) => ((macaron.filter = { ...macaron.filter, [k]: v }), update());
  // a chip filters; the lit one, pressed again, lets go
  const pick = (k, v) => setF(k, f()[k] === v ? "all" : v);
  function filters(designs) {
    const count = (k, v) => designs.filter((d) => (k === "purpose" ? d.purpose === v : k === "status" ? d.status === v : k === "family" ? ownFormats(d).some((x) => familyOf(x) === v) : ownFormats(d).includes(v))).length;
    // the formats that are there: a long row of every format would be a wall, a row of what exists is a filter
    const present = ALL_FORMATS.filter((fm) => designs.some((d) => ownFormats(d).includes(fm)));
    const chip = (k, v, label, glyph) => h("button.mc-fchip", { type: "button", "aria-pressed": String(f()[k] === v), disabled: !count(k, v) && f()[k] !== v, title: f()[k] === v ? "Show them all again" : `Only ${typeof label === "string" ? label.toLowerCase() : v}`, on: { click: () => pick(k, v) } }, glyph ?? null, label, h("em", {}, String(count(k, v))));
    const group = (label, ...chips) => h("div.mc-fgroup", {}, h("span.label", {}, label), h("div.mc-fchips", {}, ...chips));
    return h("div.mc-fbar", {},
      group("Purpose", ...PURPOSES.map((v) => chip("purpose", v, v))),
      group("Family", ...FAMILY_KEYS.filter((v) => count("family", v) || f().family === v).map((v) => chip("family", v, FAMILIES[v].name, fmtIcon(FAMILIES[v].formats[0])))),
      group("Format", ...present.map((v) => chip("format", v, labelOf(v), fmtIcon(v)))),
      group("Status", ...STATUSES.map((v) => chip("status", v, STATUS_LABEL[v], lamp(v)))),
      h("div.mc-fgroup.is-group", {}, h("span.label", {}, "Group by"), h("div.mc-segs", { role: "group", "aria-label": "Group by" }, ...[["none", "Nothing"], ["purpose", "Purpose"], ["status", "Status"], ["family", "Family"], ["format", "Format"]].map(([v, l]) => h("button.mc-seg", { type: "button", "aria-pressed": String(f().group === v), on: { click: () => setF("group", v) } }, l)))));
  }
  function quick(d) {
    const animate = () => { openDesign(d.id); const m = macaron.brand.body.motion.find((x) => x.design === d.id) ?? addMotion(); pickMotion(m.id); openWin("motion"); };
    return h("div.mc-pst-keys", { "data-keep": "" },
      h("button.mc-iconkey.is-over", { type: "button", title: "Open it in the editor", "aria-label": "Open it in the editor", on: { click: () => open(d.id) } }, mcicon("expand")),
      h("button.mc-iconkey.is-over", { type: "button", title: "Make a copy", "aria-label": "Make a copy", on: { click: () => (openDesign(d.id), duplicateDesign(d.id)) } }, sprite("copy")),
      h("button.mc-iconkey.is-over", { type: "button", title: "Variations: copy, composition, colour, goal, format", "aria-label": "Variations", on: { click: () => (openDesign(d.id), openWin("variations")) } }, sprite("variations")),
      h("button.mc-iconkey.is-over", { type: "button", title: "Animate it", "aria-label": "Animate it", on: { click: animate } }, mcicon("clapper")));
  }
  function item(d) {
    const own = ownFormats(d);
    const exp = exportsOf(d.id);
    return h(`article.mc-pst${d.id === macaron.design ? ".is-on" : ""}`, { dataset: { status: d.status } },
      h("div.mc-pst-pic", { title: `${d.name}\nOpen it in the editor`, on: { click: (e) => !e.target.closest("[data-keep]") && open(d.id) } }, thumb(d, { width: 520 }), quick(d)),
      h("div.mc-pst-body", {},
        h("div.mc-pst-name", {}, h("b", { title: d.name }, d.name), statusKey(d)),
        h("div.mc-pst-foot", {},
          h("div.mc-pst-chips", {}, ...own.map((x) => h("span.mc-fmtchip", {}, fmtIcon(x), labelOf(x))), d.variant ? chip(d.variant.kind, { tone: "alt" }) : null, d.motion ? chip("motion") : null),
          h("span.mc-pst-meta", { title: exp.length ? `${exp.length} exported` : "Not exported yet" }, exp.length ? `${exp.length} exported` : ""))));
  }
  function list(designs) {
    const show = designs.filter((d) => (f().purpose === "all" || d.purpose === f().purpose) && (f().status === "all" || d.status === f().status) && (f().format === "all" || ownFormats(d).includes(f().format)) && (!f().family || f().family === "all" || ownFormats(d).some((x) => familyOf(x) === f().family)));
    if (!show.length) return h("p.mc-hint", {}, "No post matches these filters.");
    const g = f().group;
    if (g === "none") return h("div.mc-pgrid2", {}, ...show.map(item));
    const keys = g === "status" ? STATUSES : g === "purpose" ? PURPOSES : g === "family" ? FAMILY_KEYS : ALL_FORMATS;
    const of = (d) => (g === "status" ? [d.status] : g === "purpose" ? [d.purpose] : g === "family" ? [...new Set(ownFormats(d).map(familyOf))] : ownFormats(d));
    return h("div.mc-pgroups", {}, ...keys.map((k) => {
      const those = show.filter((d) => of(d).includes(k));
      return those.length ? h("section.mc-pgroup", { dataset: { key: k } },
        h("div.mc-pgroup-head", {}, g === "status" ? lamp(k) : h("i.mc-gdot"), h("span.label", {}, g === "status" ? STATUS_LABEL[k] : g === "family" ? FAMILIES[k].name : labelOf(k)), h("span.mc-count", {}, String(those.length))),
        h("div.mc-pgrid2", {}, ...those.map(item))) : null;
    }).filter(Boolean));
  }
  function update() {
    const b = macaron.brand;
    if (!b || typingIn(el)) return typingIn(el) ? false : undefined;
    const designs = b.body.designs;
    fill(el, filters(designs), list(designs));
  }
  const sig = () => { const b = macaron.brand?.body; return JSON.stringify([b?.designs?.map((d) => [d.id, d.name, d.status, d.purpose, d.format, d.formats && Object.keys(d.formats), d.updatedAt]), b?.exports?.length, macaron.filter, macaron.design]); };
  return { el, update, sig };
}
defineWindow("posts", {
  eyebrow: "Create", title: "Posts", sub: () => macaron.brand?.name ?? "", size: "full", advanced: false, make: postsWin,
  tools: () => [h("button.mc-primary.is-sm", { type: "button", title: "A new design from the brand kit", on: { click: () => macaron.brand && newPost() } }, icon("plus"), "New post")],
});

function editorWin() {
  const studio = studioSection();
  return { el: studio.el, update: studio.update, draw: studio.draw, sig: () => JSON.stringify([macaron.brand?.body.designs, macaron.brand?.body.kit, macaron.design, macaron.format, macaron.layer, macaron.past.length, macaron.future.length, macaron.safe, [...macaron.busy], armedNow(), macaron.brand?.body.assets?.length]) };
}
defineWindow("editor", {
  eyebrow: "Create",
  title: "Post editor",
  sub: () => macaron.brand?.name ?? "",
  size: "full",
  advanced: false,
  make: editorWin,
});

defineWindow("variations", { eyebrow: "Create", title: "Variations", sub: () => designNow()?.name ?? "", size: "xl", advanced: false, make: variationsSection });
defineWindow("motion", { eyebrow: "Create", title: "Motion", sub: () => macaron.brand?.name ?? "", size: "xl", advanced: false, make: motionSection });

/** What an export would make with the choices as they are: a file for each post, in each layout it has, as each kind chosen. */
function exportPlan(b) {
  const kinds = macaron.exportKinds;
  const pics = ["png", "jpg"].filter((k) => kinds[k]);
  const clips = ["mp4", "webm"].filter((k) => kinds[k]);
  const scope = macaron.exportScope;
  const pool = bases(b).filter((d) => scope === "all" || (scope === "week" ? d.plan?.day : ["approved", "scheduled"].includes(d.status)));
  const out = [];
  for (const d of pool) {
    if (d.motion) for (const k of clips) out.push({ d, format: d.format, kind: k });
    for (const fm of d.motion ? [d.format] : ownFormats(d)) for (const k of pics) out.push({ d, format: fm, kind: k });
  }
  return out;
}
const slug = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const KIND_NOTE = { png: ["Lossless", "best quality"], jpg: ["Smaller files", "for the web"], mp4: ["Video", "plays everywhere"], webm: ["Video", "smaller size"] };

function exportWin() {
  const el = h("div.mc-w.is-export");
  const bar = h("i");
  const progress = h("div.mc-xprog", { hidden: true }, h("span", {}), h("div.mc-xbar", {}, bar));
  const go = h("button.mc-primary", { type: "button", on: { click: () => exportMany() } });
  const goLabel = h("span");
  go.append(icon("download"), goLabel);
  const foot = [progress, h("span.spacer"), go];
  let guards = new Map();
  const flags = (d, format) => {
    const k = `${d.id}|${format}|${d.updatedAt ?? ""}`;
    if (!guards.has(k)) guards.set(k, guardOf(d, format));
    return guards.get(k);
  };
  function update() {
    const b = macaron.brand;
    if (!b) return;
    if (guards.size > 400) guards = new Map();
    const kinds = macaron.exportKinds;
    const scope = macaron.exportScope;
    const scopes = [["approved", "Ready", "Posts that are ready or scheduled"], ["week", "This week", "Posts that have a day on the plan"], ["all", "Everything", "Every post"]];
    const plan = exportPlan(b);
    const posts = new Set(plan.map((x) => x.d.id)).size;
    const past = b.body.exports.slice(0, 40);
    const busy = !!macaron.progress || !!macaron.bulk;
    // the foot: how far it is, and the one key
    progress.hidden = !macaron.bulk;
    if (macaron.bulk) {
      progress.firstChild.textContent = `Making files ${macaron.bulk.done} / ${macaron.bulk.total}`;
      bar.style.width = `${(macaron.bulk.done / Math.max(1, macaron.bulk.total)) * 100}%`;
    }
    goLabel.textContent = macaron.bulk ? `${macaron.bulk.done} / ${macaron.bulk.total}` : plan.length ? `Download ${plan.length === 1 ? "the file" : `${plan.length} files`}` : "Download all";
    go.disabled = busy || !plan.length;
    fill(el,
      h("div.mc-xcols", {},
        h("div.mc-xsteps", {},
          h("section.mc-xstep", {}, h("div.mc-xstep-head", {}, h("i", {}, "1"), h("div", {}, h("span.label", {}, "What"), h("p", {}, "Which posts do you want to export?"))),
            h("div.mc-segs.is-wide", { role: "group", "aria-label": "Which posts" }, ...scopes.map(([v, l, tip]) => h("button.mc-seg", { type: "button", title: tip, "aria-pressed": String(scope === v), on: { click: () => ((macaron.exportScope = v), changed("macaron")) } }, l)))),
          h("section.mc-xstep", {}, h("div.mc-xstep-head", {}, h("i", {}, "2"), h("div", {}, h("span.label", {}, "As"), h("p", {}, "Choose one or more formats."))),
            h("div.mc-xkinds", {}, ...EXPORT_KINDS.map(([k, label, glyph]) => h("button.mc-xkind", { type: "button", "aria-pressed": String(!!kinds[k]), title: kinds[k] ? `${label}: on` : `${label}: off`, on: { click: () => ((macaron.exportKinds = { ...kinds, [k]: !kinds[k] }), changed("macaron")) } },
              sprite(glyph), h("b", {}, label), h("span", {}, KIND_NOTE[k].join(", ")), h("i.mc-tick", {}, icon("check")))))),
          h("section.mc-xstep", {}, h("div.mc-xstep-head", {}, h("i", {}, "3"), h("div", {}, h("span.label", {}, "Ready"),
            h("p", {}, plan.length ? h("b", {}, `${plan.length} ${plan.length === 1 ? "file" : "files"}`) : "Nothing yet", plan.length ? ` from ${posts} ${posts === 1 ? "post" : "posts"}` : ": pick posts or a format")))),
          h("p.mc-hint", {}, "Pictures are made in every layout a post has of its own; motion pieces come out as video.")),
        h("div.mc-xlist", {},
          h("div.mc-sec-head", {}, h("span.label", {}, "These files will be exported"), h("span.mc-count", {}, String(plan.length))),
          plan.length ? h("div.mc-xfiles", {}, ...plan.slice(0, 40).map(({ d, format, kind }) => {
            const issues = kind === "mp4" || kind === "webm" ? [] : flags(d, format);
            const worst = issues.some((i) => i.level === "bad") ? "bad" : issues.length ? "warn" : "";
            return h("div.mc-xfile", { dataset: { flag: worst } },
              h("button.mc-xfile-pic", { type: "button", title: "Open it in the editor", on: { click: () => open(d.id, format) } }, thumb(d, { format, width: 160 })),
              h("span.mc-xfile-text", {}, h("b", { title: `${slug(d.name)}-${format.replace(":", "x")}.${kind}` }, `${slug(d.name)}-${format.replace(":", "x")}.${kind}`), h("em", {}, `${format} · ${kind.toUpperCase()}`)),
              worst ? h("span.mc-xflag", { dataset: { tone: worst }, title: issues.map((i) => i.text).join("\n") }, warnGlyph(), h("em", {}, issues.length === 1 ? issues[0].text : `${issues.length} to check`)) : h("span.mc-xok", { title: "Passes the brand guard" }, icon("check")));
          }), plan.length > 40 ? h("p.mc-hint", {}, `And ${plan.length - 40} more.`) : null) : h("p.mc-hint", {}, "No post matches these choices: pick other posts or a format.")),
        ),
      h("section.mc-sec.mc-xpast", {},
        h("div.mc-sec-head", {}, h("span.label", {}, "What has left"), h("span.mc-count", {}, String(b.body.exports.length))),
        past.length ? h("div.mc-hrows", {}, ...past.map((x) => h("div.mc-hrow", {},
          h("button.mc-hrow-pic", { type: "button", title: "See it", on: { click: () => (x.kind === "mp4" || x.kind === "webm" ? view(x.url, "video") : view(x.url)) } }, h("img", { src: x.poster ?? x.url, alt: "", loading: "lazy", draggable: false }), x.kind === "mp4" || x.kind === "webm" ? h("span.mc-play", {}, icon("play")) : null),
          h("span.mc-hrow-text", {}, h("b", {}, `${x.kind.toUpperCase()} ${x.format}`), h("em", {}, x.designName), h("em", {}, `${x.width}×${x.height}${x.duration ? ` · ${seconds(x.duration)}` : ""} · ${kb(x.bytes ?? 0)} · ${shortDate(x.at)}`)),
          h("a.mc-iconkey", { href: `${x.url}?download=${x.file}`, title: "Download", "aria-label": "Download" }, icon("download")),
          h(`button.mc-iconkey.is-danger${isArmed(`export:${x.id}`) ? ".is-armed" : ""}`, { type: "button", title: isArmed(`export:${x.id}`) ? "Click again to forget it" : "Forget this export", "aria-label": "Forget this export", on: { click: () => arming(`export:${x.id}`, update, () => removeExport(x.id)) } }, icon("trash"))))) : h("p.mc-hint", {}, "Nothing exported yet.")));
  }
  const sig = () => { const b = macaron.brand?.body; return JSON.stringify([b?.exports, macaron.exportKinds, macaron.exportScope, macaron.progress, macaron.bulk, armedNow(), b?.designs?.map((d) => [d.id, d.status, d.plan, d.format, d.formats && Object.keys(d.formats), d.updatedAt, d.motion])]); };
  return { el, update, sig, foot };
}
defineWindow("export", { eyebrow: "Create", title: "Export", sub: () => macaron.brand?.name ?? "", size: "l", advanced: false, make: exportWin, foot: (part) => part.foot });
