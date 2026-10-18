import { h, icon, sprite, ago } from "../dom.js";
import { state, changed, toast, newTab, openTake } from "../store.js";
import { go, currentPage } from "../router.js";
import { stageReady } from "../control/link.js";
import { story, loadStories, openStory, newStory, deleteStory, writeAll, commit as commitStory } from "../story.js";
import { cut, loadCuts, openCut, newCut, deleteCut } from "../cut.js";

// The welcome screen: where Comfyture opens. Every project (stories, stages, edits) in one grid,
// newest first, and new ones: a whole story from one sentence, or an empty story, stage, shot or edit.

const home = { stories: [], cuts: [], stages: [], loaded: 0, loading: null, error: null, filter: "all", query: "", brief: "", length: 60, aspect: "16:9", starting: false, armed: null };
const KIND = {
  story: { label: "Story", icon: "section-story" },
  stage: { label: "Stage", icon: "section-stage" },
  cut: { label: "Edit", icon: "edit-scissors" },
};
const FILTERS = [["all", "All"], ["story", "Stories"], ["stage", "Stages"], ["cut", "Edits"]];
const LENGTHS = [[30, "30 s"], [60, "1 min"], [120, "2 min"]];
const ASPECTS = ["16:9", "9:16", "1:1"];
const redraw = () => changed("home");
const call = async (path, init) => {
  const res = await fetch(path, init);
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error ?? res.statusText);
  return out;
};
const post = (data) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
const idOf = (p) => `${p.kind}:${p.id}`;

/** The projects, fetched again whenever the screen is shown. */
function load() {
  home.loading ??= (async () => {
    try {
      const [s, c, st] = await Promise.all([call("api/stories"), call("api/cuts"), call("api/control/stages")]);
      home.stories = s.stories;
      home.cuts = c.cuts;
      home.stages = st.stages;
      home.error = null;
      // the sections' own lists follow, so a story or an edit made here is there too
      if (story.ready) story.list = s.stories;
      if (cut.ready) cut.list = c.cuts;
    } catch (e) {
      home.error = e.message;
    }
    home.loaded = Date.now();
    home.loading = null;
    refreshResults();
    redraw();
  })();
  return home.loading;
}
addEventListener("hashchange", () => currentPage() === "home" && load());

const projects = () => [
  ...home.stories.map((p) => ({ ...p, kind: "story" })),
  ...home.stages.map((p) => ({ ...p, kind: "stage" })),
  ...home.cuts.map((p) => ({ ...p, kind: "cut" })),
].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));

// ---------------------------------------------------------------- what the keys do

async function open(p) {
  try {
    if (p.kind === "story") {
      await loadStories();
      await openStory(p.id);
      go("story");
    } else if (p.kind === "cut") {
      await loadCuts();
      await openCut(p.id);
      go("cut");
    } else {
      go("stage");
      const { projects: stages } = await stageReady;
      await stages.open(p.id);
    }
  } catch (e) {
    toast(e.message, { tone: "crit" });
  }
}

const START = [
  ["New story", "section-story", "A new story, from an empty page", async () => (await loadStories(), await newStory(), go("story"))],
  ["New stage", "section-stage", "A new, empty stage to block a scene on", async () => (go("stage"), await (await stageReady).projects.newProject())],
  ["New shot", "section-shot", "A new shot on the desk", () => (newTab(), go("shot"))],
  ["New edit", "edit-scissors", "A new, empty edit in Cut", async () => (await loadCuts(), await newCut("New edit"), go("cut"))],
];

/** A whole story from one sentence: a new story with the brief, and Gemma 4 writing it while Story shows it. */
async function writeStory() {
  const brief = home.brief.trim();
  if (!brief) return document.querySelector(".home-brief")?.focus();
  home.starting = true;
  redraw();
  try {
    await loadStories();
    await newStory();
    Object.assign(story.project.body.idea, { brief, length: home.length, aspect: home.aspect });
    commitStory();
    home.brief = "";
    go("story");
    writeAll();
  } catch (e) {
    toast(e.message, { tone: "crit" });
  } finally {
    home.starting = false;
    redraw();
  }
}

async function duplicate(p) {
  try {
    if (p.kind === "stage") {
      const { stage: s } = await call(`api/control/stages/${p.id}`);
      await call("api/control/stages", post({ name: `${s.name} copy`.slice(0, 60), scene: s.scene, thumb: s.thumb, renders: s.renders }));
    } else {
      const kind = p.kind === "story" ? "stories" : "cuts";
      const { project } = await call(`api/${kind}/${p.id}`);
      await call(`api/${kind}`, post({ name: `${project.name} copy`.slice(0, 60), body: project.body, thumb: project.thumb }));
    }
    toast(`"${p.name}" is copied.`);
  } catch (e) {
    toast(e.message, { tone: "crit" });
  }
  load();
}

/** Deleting asks twice: the first click arms the key for a few seconds. */
async function remove(p) {
  const id = idOf(p);
  if (home.armed !== id) {
    home.armed = id;
    redraw();
    setTimeout(() => home.armed === id && ((home.armed = null), redraw()), 3000);
    return;
  }
  home.armed = null;
  try {
    if (p.kind === "story") await loadStories(), await deleteStory(p.id);
    else if (p.kind === "cut") await loadCuts(), await deleteCut(p.id);
    else await (await stageReady).projects.remove(p.id);
    toast(`"${p.name}" is deleted.`);
  } catch (e) {
    toast(e.message, { tone: "crit" });
  }
  load();
}

// ---------------------------------------------------------------- the screen

/** The hero: lit by the newest project's frame, the prompt that writes a whole story, and the four new things. */
function hero() {
  const field = h("textarea.home-brief", {
    rows: 1, value: home.brief, placeholder: "an old lighthouse keeper and a girl carry a glowing jellyfish back to the sea", "aria-label": "What the film is about",
    on: {
      input: (e) => ((home.brief = e.target.value), (e.target.style.height = "auto"), (e.target.style.height = `${e.target.scrollHeight}px`)),
      keydown: (e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), writeStory()),
    },
  });
  const seg = (label, items, value, set) => h("div.segment", { role: "group", "aria-label": label }, ...items.map(([v, l]) => h("button", { type: "button", "aria-pressed": String(value === v), on: { click: () => (set(v), redraw()) } }, l)));
  const lit = projects().find((p) => p.thumb && p.kind === "story") ?? projects().find((p) => p.thumb);
  return h("section.home-hero", { style: lit ? { "--hero": `url("${lit.thumb}")` } : {} },
    h("div.home-hero-top", {},
      h("span.card-label", {}, "Start"),
      h("span.spacer"),
      h("div.home-new", { role: "group", "aria-label": "Start something new" },
        ...START.map(([label, glyph, tip, run]) => h("button.home-new-key", { type: "button", title: tip, on: { click: () => Promise.resolve(run()).catch((e) => toast(e.message, { tone: "crit" })) } }, sprite(glyph), h("span", {}, label))))),
    h("div.home-prompt", {},
      h("label.home-ask", {}, h("b", {}, "What's your film about?"), h("span.home-dash", {}, "—"), field),
      h("div.home-prompt-foot", {},
        seg("Length", LENGTHS, home.length, (v) => (home.length = v)),
        h("i.home-rule"),
        seg("Frame", ASPECTS.map((a) => [a, a]), home.aspect, (v) => (home.aspect = v)),
        h("i.home-rule"),
        h("span.home-model", { title: "Gemma 4 writes the idea, the script and how everyone looks, inside ComfyUI" }, sprite("prompt-enhance"), "Gemma 4"),
        h("span.spacer"),
        h("button.key.is-primary.home-write", { type: "button", disabled: home.starting, title: "Enter", on: { click: writeStory } }, sprite("prompt-enhance"), home.starting ? "Starting…" : "Write the story"))));
}

function facts(p) {
  const i = p.info ?? {};
  const n = (v, one, many = `${one}s`) => (v ? `${v} ${v === 1 ? one : many}` : null);
  if (p.kind === "story") {
    // the story Gemma is writing right now says so
    if (story.project?.id === p.id && [...story.busy].some((k) => !k.includes(":"))) return "Writing…";
    return [n(i.scenes, "scene"), n(i.shots, "shot"), i.shots ? `${i.drawn ?? 0} drawn` : null, i.shots ? `${i.rolled ?? 0} rolled` : null].filter(Boolean).join(" · ") || (i.logline ? "The idea, no script yet" : "Not written yet");
  }
  if (p.kind === "cut") return [n(i.clips, "clip"), n(i.titles, "title"), n(i.sounds, "sound")].filter(Boolean).join(" · ") || "Empty";
  return "";
}

/** A project's card; the newest ones are big, and a story's big card shows its storyboard under its frame. */
function card(p, big = false) {
  const k = KIND[p.kind];
  const frames = big && p.kind === "story" ? (p.info?.frames ?? []).filter((url) => url !== p.thumb).slice(0, 4) : [];
  const strip = frames.length > 1 ? frames : [];
  const armed = home.armed === idOf(p);
  const tool = (glyph, label, run, extra = {}) => h("button.home-card-key", { type: "button", title: label, "aria-label": label, on: { click: (e) => (e.stopPropagation(), run()) }, ...extra }, glyph);
  return h("article.home-card", { className: `is-${p.kind}${big ? " is-big" : ""}${armed ? " is-armed" : ""}`, tabindex: "0", on: { click: () => open(p), keydown: (e) => e.key === "Enter" && e.target === e.currentTarget && open(p) } },
    h("div.home-thumb", {},
      p.thumb ? h("img", { src: p.thumb, alt: "", loading: "lazy", draggable: false }) : h("span.home-thumb-empty", {}, sprite(k.icon)),
      h("div.home-card-keys", {},
        tool(sprite("copy"), "Duplicate", () => duplicate(p)),
        tool(icon("trash"), armed ? "Click again to delete it for good" : "Delete", () => remove(p), { "aria-pressed": String(armed) }))),
    strip.length ? h("div.home-strip", {}, ...strip.map((url) => h("img", { src: url, alt: "", loading: "lazy", draggable: false }))) : null,
    h("div.home-card-text", {},
      big ? h("div.home-card-row", {}, h("b.home-card-name", {}, p.name), h("span.home-kind", {}, sprite(k.icon), k.label), h("span.home-ago", {}, ago(p.updatedAt)))
        : [h("b.home-card-name", {}, p.name), h("div.home-card-row", {}, h("span.home-kind", {}, sprite(k.icon), k.label), h("span.home-ago", {}, ago(p.updatedAt)))],
      big && facts(p) ? h("span.home-facts", {}, facts(p)) : null));
}

function takes() {
  const done = state.runs.filter((r) => r.status === "done").sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 10);
  if (!done.length) return null;
  return h("section.home-takes", {},
    h("div.home-head", {}, h("span.card-label", {}, "Recent takes"), h("span.spacer"), h("a.key.is-sm.is-quiet", { href: "#/library" }, sprite("batch"), "Library")),
    h("div.home-takes-row", {}, ...done.map((run) => h("button.home-take", { type: "button", title: run.request.name, on: { click: () => (openTake(run.id), go("shot")) } },
      h("video", { src: `${run.video}#t=0.5`, muted: true, preload: "metadata", playsInline: true }),
      h("span.home-take-name", {}, run.request.name)))));
}

// as many big cards as fit in a row: three, two on a laptop, one on a phone
const bigCount = () => (innerWidth <= 760 ? 1 : innerWidth <= 1300 ? 2 : 3);
let lastBig = bigCount();
addEventListener("resize", () => bigCount() !== lastBig && currentPage() === "home" && ((lastBig = bigCount()), redraw()));

/** The cards that match the filter and the search; the search redraws only these, so its field keeps the caret. */
function results() {
  const q = home.query.trim().toLowerCase();
  const shown = projects().filter((p) => (home.filter === "all" || p.kind === home.filter) && (!q || p.name.toLowerCase().includes(q) || p.info?.logline?.toLowerCase().includes(q)));
  return h("div.home-results", {},
    home.error ? h("p.home-empty", {}, home.error)
      : !home.loaded ? h("div.home-empty", {}, h("span.typing", {}, h("i"), h("i"), h("i")))
      : shown.length ? [h("div.home-feature", {}, ...shown.slice(0, bigCount()).map((p) => card(p, true))), shown.length > bigCount() ? h("div.home-grid", {}, ...shown.slice(bigCount()).map((p) => card(p))) : null]
      : h("p.home-empty", {}, q ? "Nothing by that name." : "Nothing here yet: start one above."));
}

// the filter and the search change the cards only, in place, so a field being typed in keeps its caret
const refreshResults = () => document.querySelector(".home-results")?.replaceWith(results());
function setFilter(k, el) {
  home.filter = k;
  for (const b of el.closest(".home-filter").children) b.setAttribute("aria-pressed", String(b.dataset.kind === k));
  refreshResults();
}

function grid() {
  const all = projects();
  const count = (k) => (k === "all" ? all.length : all.filter((p) => p.kind === k).length);
  return h("section.home-projects", {},
    h("div.home-head", {},
      h("span.card-label", {}, "Projects"),
      h("div.segment.home-filter", { role: "group", "aria-label": "Show" }, ...FILTERS.map(([k, label]) => h("button", { type: "button", "aria-pressed": String(home.filter === k), title: `${count(k)}`, dataset: { kind: k }, on: { click: (e) => setFilter(k, e.currentTarget) } }, label))),
      h("span.spacer"),
      h("label.home-search", {}, icon("search"), h("input", { type: "search", value: home.query, placeholder: "Search projects", "aria-label": "Search the projects", on: { input: (e) => ((home.query = e.target.value), refreshResults()) } }))),
    results());
}

export function renderHome(el) {
  if (!home.loading && Date.now() - home.loaded > 4000) load();
  el.replaceChildren(h("div.home", { dataset: { scrollKey: "home" } }, h("div.home-in", {}, hero(), grid(), takes())));
}
