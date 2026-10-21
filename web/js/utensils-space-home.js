// The Utensils HOME: where the product opens. A dashboard that shows what every other workspace offers, as a mosaic that fills the
// page: a featured tool, then one card for Picture, Video, Audio, VFX and Edit whose tiles open their tool, the mini apps (ComfyUI's own
// workflows, shown simply), a search over every tool, the latest results and what today cost. Everything is read from the registry, so a
// workspace that registers more tools shows them here without a change; a card with more tools than room shows the first ones and a
// "+N" tile that opens its workspace. Mockup: docs/brand/products/utensils-v3/utensils-v3-home.png.
// A workspace is { el, update, sig, count }: the shell (panels/utensils.js) draws it again when sig() changes.
import { h, icon, sprite, ago } from "./dom.js";
import { state } from "./store.js";
import { utensils, shelfTools, toolsOf, toolById, pickTool, setWorkspace, openResult, creditsToday } from "./utensils.js";
import { WORKSPACES } from "./utensils-harness.js";
import { loadApps, apps, openApp } from "./utensils-templates-api.js";
import { appPicture } from "./utensils-apps-ui.js";
import { art as editArt } from "./utensils-edit-art.js";
import { editTool } from "./utensils-edit-tools.js";
import { artOf, openGrade } from "./utensils-vfx-tools.js";
import { wayOf, MARK, toneOf, findIn } from "./utensils-home-facts.js";
import { templatesTotal, loadTemplatesTotal } from "./utensils-space-shelf.js";

/** The tool the dashboard shows off: its picture is a before/after (docs/brand/products/utensils-v2/art). */
const FEATURED = { tool: "vfx-remove", workspace: "vfx", title: "Remove an object from a video", line: "Clean shots in seconds with AI.", chips: ["VFX", "Comfy Cloud"], art: "brand/utensils/featured-remove.webp" };
/** The tools a card shows first, in this order, and how many tiles it has room for (the rest are "+N"). */
const FIRST = {
  picture: ["upscale", "cutout", "variations", "edit"],
  video: ["extend", "lipsync", "sound", "upscale-video"],
  audio: ["sfx", "music", "au-voice"],
  vfx: ["vfx-remove", "vfx-chroma", "vfx-relight", "vfx-restyle"],
};
const ROOM = { picture: 4, video: 4, audio: 4, vfx: 4 };
const time = (s) => `${Math.floor((s ?? 0) / 60)}:${String(Math.floor((s ?? 0) % 60)).padStart(2, "0")}`;

/** A tool's tiles: the ones named first (when they exist), then the others in the order they were registered; "+N" when there are more than room. */
export function ordered(workspace, room = ROOM[workspace] ?? 4, tools = toolsOf(workspace)) {
  const first = (FIRST[workspace] ?? []).map((id) => tools.find((t) => t.id === id)).filter(Boolean);
  const list = [...first, ...tools.filter((t) => !first.includes(t))];
  return list.length > room ? { shown: list.slice(0, room - 1), more: list.length - (room - 1), all: list } : { shown: list, more: 0, all: list };
}

/** A waveform in the tool's colour, the same bars for the same tool (a small generator seeded by its id). */
function wave(seed, tone) {
  let x = [...String(seed)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const rnd = () => ((x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const n = 28;
  const bars = Array.from({ length: n }, (_, i) => {
    const v = 0.14 + Math.sin(((i + 1) / (n + 1)) * Math.PI) * (0.3 + rnd() * 0.56);
    return `<rect x="${(i * 3.6 + 0.8).toFixed(1)}" y="${(50 - v * 46).toFixed(1)}" width="2.2" height="${(v * 92).toFixed(1)}" rx="1.1"/>`;
  }).join("");
  const span = h("span.ut-hm-art.is-wave");
  span.style.color = tone;
  span.innerHTML = `<svg viewBox="0 0 102 100" preserveAspectRatio="none" aria-hidden="true" fill="currentColor">${bars}</svg>`;
  return span;
}
/** A picture that fills its tile; if it does not come, the tool's icon stands in on a tinted ground. */
const picture = (src, t) => h("span.ut-hm-art", {}, h("img", { src, alt: "", draggable: false, loading: "lazy", on: { error: (e) => { e.target.closest(".ut-hm-art")?.classList.add("is-icon"); e.target.replaceWith(sprite(t.icon)); } } }));
const split = (t) => {
  const a = artOf(t.id);
  const drop = (e) => e.target.remove();
  return h("span.ut-hm-art.is-split", {}, h("img", { src: a.before, alt: "", draggable: false, loading: "lazy", on: { error: drop } }), h("img.is-after", { src: a.after, alt: "", draggable: false, loading: "lazy", on: { error: drop } }), h("i.ut-hm-cut"));
};

/** Opens a tool: its workspace comes with it (the grade is Edit's own window, opened as the VFX workspace opens it). */
const open = (t) => (t.id === "vfx-grade" ? openGrade() : pickTool(t.id));

export function homeSpace() {
  const el = h("div.ut-grid.is-home");
  let query = "";
  let found = [];
  let active = 0;
  let input = null;
  let box = null;

  // ------------------------------------------------------------ the parts of a card
  const head = (ws, count, extra, label) => {
    const w = WORKSPACES.find((x) => x.id === ws);
    return h("div.ut-b-head", {},
      h("button.ut-hm-title", { type: "button", title: `Open ${w.name}`, on: { click: () => setWorkspace(ws) } }, sprite(w.icon), h("span.ut-b-label", {}, label ?? w.name), count !== null && count !== undefined ? h("span.ut-hm-count", {}, String(count)) : null),
      extra ?? h("button.ut-expand", { type: "button", title: `Open ${w.name}`, "aria-label": `Open ${w.name}`, on: { click: () => setWorkspace(ws) } }, icon("expand")));
  };
  const card = (cls, label, ...kids) => h(`section.ut-bento.ut-hm-card.${cls}`, { "aria-label": label }, ...kids);
  const tile = (t, art, { mark = false } = {}) => {
    const way = wayOf(t);
    return h("button.ut-hm-tile", { type: "button", title: `${t.name}: ${t.hint ?? ""}`, dataset: { tool: t.id, way }, on: { click: () => open(t) } },
      art, h("span.ut-hm-name", {}, t.name), mark ? h(`span.ut-hm-mark.is-${way}`, {}, MARK[way]) : null);
  };
  const more = (ws, n, total) => h("button.ut-hm-tile.is-more", { type: "button", title: `All ${total} in ${WORKSPACES.find((w) => w.id === ws).name}`, dataset: { more: ws }, on: { click: () => setWorkspace(ws) } }, h("b", {}, `+${n}`), h("span", {}, "more"));
  /** A card of tiles: the tools of a workspace, each with the art `artOf(tool)` gives it. */
  function tiles(ws, artOfTool, { mark = false, cols } = {}) {
    const { shown, more: rest, all } = ordered(ws);
    return h("div.ut-hm-tiles", { dataset: { ws }, style: cols ? { "--cols": String(cols) } : {} },
      ...shown.map((t) => tile(t, artOfTool(t), { mark })),
      rest ? more(ws, rest, all.length) : null);
  }

  // ------------------------------------------------------------ the cards
  function featured() {
    const go = () => (toolsOf("vfx").some((t) => t.id === FEATURED.tool) ? pickTool(FEATURED.tool) : setWorkspace(FEATURED.workspace));
    return card("is-feat", "Featured",
      h("div.ut-feat", {},
        h("div.ut-feat-text", {},
          h("span.ut-b-label", {}, "Featured"),
          h("h2", {}, FEATURED.title),
          h("p", {}, FEATURED.line),
          h("span.spacer"),
          h("div.ut-hm-featrow", {}, h("div.ut-chips", {}, ...FEATURED.chips.map((c) => h("span.ut-pill", {}, c))), h("button.ut-primary", { type: "button", on: { click: go } }, "Open", icon("next")))),
        h("div.ut-feat-art", { "aria-hidden": "true" },
          h("img", { src: FEATURED.art, alt: "", draggable: false }),
          h("span.ut-feat-tag.is-left", {}, "Before"), h("span.ut-feat-tag.is-right", {}, "After"),
          h("span.ut-feat-split", {}, h("i", {}, icon("chevron"), icon("chevron"))))));
  }

  function shelfCard() {
    const total = shelfTools().length;
    input = h("input.ut-hm-find", {
      type: "text", placeholder: "Find a tool…", "aria-label": "Find a tool", autocomplete: "off", spellcheck: false, value: query,
      on: {
        input: (e) => ((query = e.target.value), (active = 0), drawFound()),
        keydown: (e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (found.length) (active = (active + (e.key === "ArrowDown" ? 1 : found.length - 1)) % found.length), drawFound();
          } else if (e.key === "Enter") (e.preventDefault(), pick(found[active] ?? found[0]));
          else if (e.key === "Escape") ((query = ""), (e.target.value = ""), drawFound());
        },
        focus: () => drawFound(),
        blur: () => setTimeout(() => ((box.hidden = true)), 120),
      },
    });
    box = h("div.ut-hm-found", { role: "listbox", hidden: true, "aria-label": "Matches" });
    drawFound();
    return card("is-shelfcard", "Shelf",
      head("shelf", total, h("div.ut-hm-findrow", {}, h("span.ut-hm-glass", {}, icon("search")), input, box)),
      h("button.ut-hm-all", { type: "button", on: { click: () => setWorkspace("shelf") } },
        h("span", {}, h("b", {}, `All ${total} tools`), h("em", {}, "Browse everything in one place")), icon("next")));
  }
  const tag = { vfx: "VFX", picture: "Picture", video: "Video", audio: "Audio", edit: "Edit", templates: "App" };
  /** What a typed word finds: tools by name and what they do, and the mini apps by title and promise. */
  function matches() {
    const tools = findIn(shelfTools(), query, 8).map((t) => ({ kind: "tool", t, name: t.name, where: tag[t.workspace] ?? "Tool", way: wayOf(t) }));
    const asApps = findIn(apps.list.map((a) => ({ a, name: a.title, hint: a.promise, group: "app", workspace: "templates" })), query, 4).map((x) => ({ kind: "app", a: x.a, name: x.name, where: "App" }));
    return [...tools, ...asApps].slice(0, 8);
  }
  function drawFound() {
    if (!box) return;
    found = query.trim() ? matches() : [];
    active = Math.min(active, Math.max(0, found.length - 1));
    box.hidden = !query.trim() || document.activeElement !== input;
    box.replaceChildren(...(found.length
      ? found.map((m, i) => h(`button.ut-hm-hit${i === active ? ".is-on" : ""}`, { type: "button", role: "option", "aria-selected": String(i === active), dataset: { hit: m.kind === "tool" ? m.t.id : `app-${m.a.id}` },
        // (a press, not a click: the field would lose the focus first, and the list with it)
        on: { pointerdown: (e) => (e.preventDefault(), pick(m)) } },
      h("span.ut-hm-hit-icon", {}, m.kind === "tool" ? sprite(m.t.icon) : sprite("tool-templates")),
      h("span.ut-hm-hit-name", {}, m.name),
      h("span.ut-hm-hit-where", {}, m.where),
      m.way ? h(`span.ut-hm-mark.is-${m.way}`, {}, MARK[m.way]) : null))
      : [h("p.ut-hm-nohit", {}, "No tool by that name.")]));
  }
  function pick(m) {
    if (!m) return;
    query = "";
    if (input) input.value = "";
    drawFound();
    input?.blur();
    if (m.kind === "app") openApp(m.a);
    else open(m.t);
  }

  function pictureCard(ws, label) {
    return card(`is-${ws}`, label, head(ws, toolsOf(ws).length), tiles(ws, (t) => picture(`brand/utensils/home/${t.id}.webp`, t)));
  }

  function audioCard() {
    const mix = toolsOf("audio").find((t) => t.id === "au-mix");
    return card("is-audio", "Audio",
      head("audio", toolsOf("audio").length),
      tiles("audio", (t) => wave(t.id, toneOf(t)), { mark: true }),
      mix ? h("button.ut-hm-line", { type: "button", dataset: { tool: mix.id }, on: { click: () => open(mix) } }, sprite(mix.icon), h("span", {}, h("b", {}, "Mixing strip"), " up to six tracks"), icon("next")) : null);
  }

  function vfxCard() {
    return card("is-vfx", "VFX", head("vfx", toolsOf("vfx").length), tiles("vfx", split, { mark: true, cols: 2 }));
  }

  function editCard() {
    const list = toolsOf("edit");
    return card("is-edit", "Edit",
      head("edit", list.length, h("div.ut-b-keys", {}, h("span.ut-hm-free", {}, "Free, on your machine"), h("button.ut-expand", { type: "button", title: "Open Edit", "aria-label": "Open Edit", on: { click: () => setWorkspace("edit") } }, icon("expand")))),
      h("div.ut-hm-chipbox", {}, h("div.ut-hm-tiles.is-chips", { dataset: { ws: "edit" } }, ...list.map((t) =>
        h("button.ut-hm-chip", { type: "button", title: `${t.name}: ${t.hint ?? ""}`, dataset: { tool: t.id }, on: { click: () => open(t) } },
          h("span.ut-hm-chip-icon", {}, sprite(t.icon)), h("span.ut-hm-chip-name", {}, t.name), editTool(t.id) ? editArt(editTool(t.id).key) : null)))));
  }

  function appsCard() {
    const list = apps.list.slice(0, 12);
    const total = templatesTotal();
    const body = apps.state === "ready" && list.length
      ? h("div.ut-carousel", { dataset: { scrollKey: "ut-home-apps" } }, ...list.map((a) =>
        h("button.ut-tcard.is-app", { type: "button", title: a.promise, dataset: { app: a.id }, on: { click: () => openApp(a) } },
          h("span.ut-tcard-pic", {}, appPicture(a, { after: false })),
          h("span.ut-tcard-text", {}, h("b", {}, a.title), h("span", {}, a.promise)))))
      : h("div.ut-empty", {}, icon("sparkle"), h("span", {}, apps.state === "none" ? "Mini apps need Comfy Cloud" : "Loading the mini apps"));
    const label = apps.total ? `Browse all ${apps.total} apps${total ? ` · ${total} templates` : ""}` : "Browse the apps";
    return card("is-apps", "Mini apps",
      head("templates", apps.total ? `${apps.total}` : null, h("button.ut-ghost", { type: "button", dataset: { go: "apps" }, on: { click: () => (setWorkspace("templates"), document.dispatchEvent(new CustomEvent("utensils:apps"))) } }, label, icon("next")), "Mini apps"),
      body);
  }

  function recentCard() {
    const list = utensils.results.slice(0, 8);
    return card("is-results", "Recent results",
      h("div.ut-b-head", {}, h("span.ut-b-label", {}, "Recent results"), h("span.ut-b-note", {}, `${utensils.results.length} ${utensils.results.length === 1 ? "item" : "items"}`)),
      list.length ? h("div.ut-strip8", {}, ...list.map((r) => {
        const t = toolById(r.tool);
        const pic = r.kind === "image" ? h(`img${r.clear ? ".is-clear" : ""}`, { src: r.url, alt: "", draggable: false, loading: "lazy" })
          : r.kind === "video" ? h("video", { src: r.url, muted: true, preload: "metadata", playsInline: true }) : h("span.ut-recent-audio", {}, icon("sound"));
        return h("button.ut-res", { type: "button", title: `${t.name} · ${ago(r.at)}`, dataset: { result: r.id }, on: { click: () => openResult(r) } },
          h("span.ut-res-pic", {}, pic, r.seconds ? h("span.ut-recent-time", {}, time(r.seconds)) : null));
      })) : h("div.ut-empty", {}, icon("plus"), h("span", {}, "Nothing made yet: open a tool and run it")));
  }

  function creditsCard() {
    const { total, hours } = creditsToday();
    const now = new Date().getHours();
    const max = Math.max(1, ...hours);
    const points = hours.slice(0, now + 1).map((v, i) => `${(i / Math.max(1, now)) * 100},${100 - (v / max) * 84 - 8}`).join(" ");
    const cloud = state.info?.target === "comfy-cloud";
    const line = document.createElement("span");
    line.className = "ut-spark";
    line.innerHTML = total > 0 && now > 0 ? `<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points="${points}" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>` : `<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><line x1="0" y1="92" x2="100" y2="92" stroke="currentColor" stroke-opacity=".28" stroke-width="1.2" stroke-dasharray="3 4" vector-effect="non-scaling-stroke"/></svg>`;
    return card("is-credits", "Credits",
      h("div.ut-b-head", {}, h("span.ut-b-label", {}, "Credits")),
      h("div.ut-hm-credits", {}, h("div.ut-credit-big", {}, h("b", {}, String(total)), h("span", {}, "cr spent today")), line),
      h("p.ut-hint", {}, cloud ? "Comfy Cloud. Edit tools cost nothing." : "Your own ComfyUI: nothing is charged."));
  }

  function update() {
    loadTemplatesTotal();
    loadApps();
    el.replaceChildren(featured(), shelfCard(), pictureCard("picture", "Picture"), pictureCard("video", "Video"), audioCard(), vfxCard(), editCard(), appsCard(), recentCard(), creditsCard());
  }
  const sig = () => JSON.stringify([
    WORKSPACES.map((w) => toolsOf(w.id).map((t) => t.id).join()), shelfTools().length,
    apps.state, apps.total, apps.list.slice(0, 12).map((a) => [a.id, a.credits]), templatesTotal(),
    utensils.results.slice(0, 8).map((r) => r.id), creditsToday().total, state.info?.target,
  ]);
  return { el, update, sig, count: () => null };
}
