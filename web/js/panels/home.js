import { h, icon, sprite, ago } from "../dom.js";
import { changed, toast, newTab, openTake } from "../store.js";
import { go, currentPage } from "../router.js";
import { stageReady } from "../control/link.js";
import { view } from "../viewer.js";
import { story, loadStories, openStory, newStory, deleteStory, writeAll, commit as commitStory } from "../story.js";
import { loadCuts, openCut, newCut, deleteCut } from "../cut.js";

// The welcome screen: where Comfyture opens. Its heart is the prompt that writes a whole film's
// story from one sentence; under it, the projects. A project is a film: its story, the stages its
// shots were blocked on, its takes and its edits, together on one card that opens on hover.

const home = { films: [], loaded: 0, loading: null, error: null, query: "", brief: "", length: 60, aspect: "16:9", starting: false, armed: null };
const KIND = {
  story: { label: "Story", icon: "section-story" },
  stage: { label: "Stage", icon: "section-stage" },
  cut: { label: "Edit", icon: "edit-scissors" },
  take: { label: "Take", icon: "section-shot" },
};
const LENGTHS = [[30, "30 s"], [60, "1 min"], [120, "2 min"]];
const ASPECTS = ["16:9", "9:16", "1:1"];
const redraw = () => changed("home");
const call = async (path, init) => {
  const res = await fetch(path, init);
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error ?? res.statusText);
  return out;
};

/** The projects, fetched again whenever the screen is shown. */
function load() {
  home.loading ??= (async () => {
    try {
      home.films = (await call("api/projects")).projects;
      home.error = null;
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

// ---------------------------------------------------------------- what the keys do

const fail = (e) => toast(e.message, { tone: "crit" });

/** One thing of a project, opened in its section: the story, a stage, an edit or a take. */
async function openPart(kind, id) {
  try {
    if (kind === "story") {
      await loadStories();
      await openStory(id);
      go("story");
    } else if (kind === "cut") {
      await loadCuts();
      await openCut(id);
      go("cut");
    } else if (kind === "stage") {
      go("stage");
      await (await stageReady).projects.open(id);
    } else if (kind === "take") {
      openTake(id);
      go("shot");
    }
  } catch (e) {
    fail(e);
  }
}
/** A project opens on what it grew from: its story, or the stage or edit it is; a finished film made on its own plays. */
const openFilm = (f) => (f.story ? openPart("story", f.story.id) : f.stages[0] ? openPart("stage", f.stages[0].id) : f.cuts[0] ? openPart("cut", f.cuts[0].id) : f.reels[0] ? view(f.reels[0].url, "video") : null);

const START = [
  ["section-story", "A new story, from an empty page", async () => (await loadStories(), await newStory(), go("story"))],
  ["section-stage", "A new, empty stage to block a scene on", async () => (go("stage"), await (await stageReady).projects.newProject())],
  ["section-shot", "A new shot on the desk", () => (newTab(), go("shot"))],
  ["edit-scissors", "A new, empty edit in Cut", async () => (await loadCuts(), await newCut("New edit"), go("cut"))],
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
    fail(e);
  } finally {
    home.starting = false;
    redraw();
  }
}

/** A project deleted asks twice: its story, its stages and its edits go; its takes stay in the Library. */
async function removeFilm(f) {
  if (home.armed !== f.id) {
    home.armed = f.id;
    refreshResults();
    setTimeout(() => home.armed === f.id && ((home.armed = null), refreshResults()), 3000);
    return;
  }
  home.armed = null;
  try {
    if (f.story) await loadStories(), await deleteStory(f.story.id);
    if (f.cuts.length) await loadCuts();
    for (const c of f.cuts) await deleteCut(c.id);
    if (f.stages.length) {
      const { projects } = await stageReady;
      for (const s of f.stages) await projects.remove(s.id);
    }
    toast(`"${f.name}" is deleted. Its takes are still in the Library.`);
  } catch (e) {
    fail(e);
  }
  load();
}

// ---------------------------------------------------------------- the screen

/** The heart of the screen: what the film is about, and the story written from it. */
function hero() {
  const field = h("textarea.home-brief#home-brief", {
    rows: 2, value: home.brief, placeholder: "an old lighthouse keeper and a girl carry a glowing jellyfish back to the sea", "aria-label": "What the film is about",
    on: { keydown: (e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), writeStory()), input: (e) => (home.brief = e.target.value) },
  });
  const seg = (label, items, value, set) => h("div.segment", { role: "group", "aria-label": label }, ...items.map(([v, l]) => h("button", { type: "button", "aria-pressed": String(value === v), on: { click: () => (set(v), redraw()) } }, l)));
  const lit = home.films.find((f) => f.story?.thumb) ?? home.films.find((f) => f.cover?.pic);
  const last = home.films.find((f) => f.story);
  return h("section.home-hero", { style: lit ? { "--hero": `url("${lit.story?.thumb ?? lit.cover.pic}")` } : {} },
    h("h1.home-ask", {}, h("label", { for: "home-brief" }, "What's your film about?")),
    h("div.home-prompt", {},
      field,
      h("div.home-prompt-foot", {},
        seg("Length", LENGTHS, home.length, (v) => (home.length = v)),
        h("i.home-rule"),
        seg("Frame", ASPECTS.map((a) => [a, a]), home.aspect, (v) => (home.aspect = v)),
        h("i.home-rule"),
        h("span.home-model", { title: "Gemma 4 writes the idea, the script and how everyone looks, inside ComfyUI" }, sprite("prompt-enhance"), "Gemma 4"),
        h("span.spacer"),
        h("button.key.is-primary.home-write", { type: "button", disabled: home.starting, title: "Enter", on: { click: writeStory } }, sprite("prompt-enhance"), home.starting ? "Starting…" : "Write the story"))),
    h("div.home-new", { role: "group", "aria-label": "Start something empty" },
      ...START.map(([glyph, tip, run]) => h("button.home-new-key", { type: "button", title: tip, "aria-label": tip, on: { click: () => Promise.resolve(run()).catch(fail) } }, sprite(glyph)))),
    last ? h("button.home-continue", { type: "button", title: "Open its story", on: { click: () => openFilm(last) } },
      last.story?.thumb ? h("img", { src: last.story.thumb, alt: "", draggable: false }) : null,
      h("span", {}, "Continue"), h("b", {}, last.name), icon("arrow"), h("span.home-continue-facts", {}, counts(last))) : null);
}

/** "7 scenes · 7 shots": how far a story has come, for the line under the prompt. */
function counts(f) {
  const c = f.counts ?? {};
  const n = (v, one, many = `${one}s`) => (v ? `${v} ${v === 1 ? one : many}` : null);
  return [n(c.scenes, "scene"), n(c.shots, "shot")].filter(Boolean).join(" · ") || (f.story?.logline ? "the idea" : "not written yet");
}

// the four sections a film is made in, and what each one makes
const SECTIONS = [
  ["story", "Story", "section-story", (n) => `${n} ${n === 1 ? "frame" : "frames"}`],
  ["stage", "Stage", "section-stage", (n) => `${n} ${n === 1 ? "render" : "renders"}`],
  ["shot", "Shot", "section-shot", (n) => `${n} ${n === 1 ? "take" : "takes"}`],
  ["cut", "Cut", "edit-scissors", (n) => `${n} ${n === 1 ? "film" : "films"}`],
];
const COVER = { film: ["Film", "edit-scissors"], take: ["Take", "section-shot"], render: ["Render", "section-stage"], storyboard: ["Storyboard", "section-story"], story: ["Story", "section-story"], stage: ["Stage", "section-stage"], cut: ["Edit", "edit-scissors"] };
const secs = (v) => (v ? `${Number(v).toFixed(1)} s` : "");

/** A picture or a clip that plays while the pointer is on its card (or its tile), with a line for how far it has played. */
function media(pic, video, cls = "") {
  if (!video) return pic ? h(`img${cls}`, { src: pic, alt: "", loading: "lazy", draggable: false }) : null;
  const v = h(`video${cls}`, { src: pic ? video : `${video}#t=0.5`, poster: pic ?? "", muted: true, loop: true, playsInline: true, preload: pic ? "none" : "metadata" });
  return v;
}
const playIn = (root, on) => root.querySelectorAll(root.classList.contains("film-out") ? "video" : ":scope > .film-cover > video.film-key").forEach((v) => (on ? v.play().catch(() => {}) : (v.pause(), (v.currentTime = 0))));

/** Where a section's output opens: the story, the stage it was rendered on, the take in Shot, the edit in Cut. */
function openOutput(f, key) {
  if (key === "story") return f.story ? openPart("story", f.story.id) : null;
  if (key === "stage") return f.stages[0] ? openPart("stage", f.stages[0].id) : null;
  if (key === "shot") return f.outputs.shot.id ? openPart("take", f.outputs.shot.id) : null;
  if (key === "cut") return f.cuts[0] ? openPart("cut", f.cuts[0].id) : f.reels[0] ? view(f.reels[0].url, "video") : null;
}

/** What each section has made, one tile each, over the foot of the cover: an empty one says that section has made nothing yet. */
function outputs(f) {
  return h("div.film-outs", {}, ...SECTIONS.map(([key, label, glyph, count]) => {
    const o = f.outputs?.[key] ?? { count: 0 };
    const made = o.count > 0;
    const tile = h("button.film-out", {
      type: "button", className: `is-${key}${made ? "" : " is-empty"}`, disabled: !made, title: made ? `${label}: ${count(o.count)}\nOpen in ${label}` : `${label}: nothing yet`,
      on: { click: (e) => (e.stopPropagation(), openOutput(f, key)), mouseenter: () => playIn(tile, true), mouseleave: () => playIn(tile, false) },
    },
      made ? media(o.pic, o.video) : null,
      h("span.film-out-label", {}, sprite(glyph), h("span", {}, made ? count(o.count) : `${label}`), made ? null : h("em", {}, "—")),
      key === "cut" && made ? h("span.film-out-film", {}, "Film") : null,
      o.video && o.seconds && key !== "cut" ? h("span.film-out-time", {}, secs(o.seconds)) : null);
    return tile;
  }));
}

/** The four sections and how far each has come, as lamps: lit once it has made something. */
function steps(f, boxes = false) {
  return h(boxes ? "div.film-boxes" : "div.film-pipe", {}, ...SECTIONS.map(([key, label, glyph, count]) => {
    const n = f.outputs?.[key]?.count ?? 0;
    return h("span.film-step", { className: n ? "is-lit" : "", title: n ? `${label}: ${count(n)}` : `${label}: nothing yet` },
      sprite(glyph), h("span.film-step-text", {}, h("b", {}, h("i.film-lamp"), label), h("span", {}, count(n))));
  }));
}

/** A project's card: what it has made last (or finished) on its cover, the clip playing while the pointer is on it. */
function card(f, featured = false) {
  const armed = home.armed === f.id;
  const [what, glyph] = COVER[f.cover?.kind] ?? COVER.story;
  const cover = f.cover ?? {};
  const made = SECTIONS.filter(([key]) => f.outputs?.[key]?.count > 0);
  const single = !f.story && made.length <= 1;
  const el = h("article.film-card", {
    className: `${featured ? "is-featured" : ""}${armed ? " is-armed" : ""}`, tabindex: "0",
    on: { click: () => openFilm(f), keydown: (e) => e.key === "Enter" && e.target === e.currentTarget && openFilm(f), mouseenter: () => playIn(el, true), mouseleave: () => playIn(el, false) },
  },
    h("div.film-cover", {},
      media(cover.pic, cover.video, ".film-key") ?? h("span.film-cover-empty", {}, sprite(glyph)),
      h("span.film-badge", {}, sprite(glyph), what),
      cover.video ? h("span.film-length", {}, icon("play"), secs(cover.seconds)) : null,
      cover.video ? h("i.film-played") : null,
      single ? null : outputs(f),
      f.kind === "film" ? null : h("button.film-delete", { type: "button", title: armed ? "Click again: the story, stages and edits go (the takes and films stay in the Library)" : "Delete the project", "aria-label": "Delete the project", "aria-pressed": String(armed), on: { click: (e) => (e.stopPropagation(), removeFilm(f)) } }, icon("trash"))),
    featured
      ? h("div.film-side", {},
        h("span.film-what", {}, what),
        h("div.film-row", {}, h("b.film-name", {}, f.name), cover.video ? h("span.film-ago", {}, secs(cover.seconds)) : h("span.film-ago", {}, ago(f.updatedAt))),
        h("p.film-logline", {}, f.story?.logline || (f.kind === "film" ? "A finished film." : "")),
        steps(f, true))
      : h("div.film-text", {},
        h("div.film-row", {}, h("b.film-name", {}, f.name), h("span.film-ago", {}, ago(f.updatedAt))),
        single
          ? h("div.film-foot", {}, sprite(made[0]?.[2] ?? glyph), h("span", {}, made[0] ? made[0][3](f.outputs[made[0][0]].count) : f.kind === "stage" ? "no render yet" : "not rendered yet"))
          : [h("p.film-logline", {}, f.story?.logline || (f.kind === "film" ? "A finished film." : "")), steps(f)]));
  // the clip on the cover draws how far it has played
  const v = el.querySelector(".film-key");
  const line = el.querySelector(".film-played");
  if (v?.tagName === "VIDEO" && line) v.addEventListener("timeupdate", () => line.style.setProperty("--played", `${(v.currentTime / (v.duration || 1)) * 100}%`));
  return el;
}

// the featured card: the newest finished film, else the newest project that has made something (a take, a render, a frame)
const OUTPUT = new Set(["film", "take", "render", "storyboard"]);
const featureFirst = (list, on) => {
  const film = list.findIndex((f) => f.cover?.kind === "film");
  const i = !on ? -1 : film >= 0 ? film : list.findIndex((f) => OUTPUT.has(f.cover?.kind));
  return i > 0 ? [list[i], ...list.slice(0, i), ...list.slice(i + 1)] : list;
};

/** The cards that match the search; the search redraws only these, so its field keeps the caret. */
function results() {
  const q = home.query.trim().toLowerCase();
  const shown = home.films.filter((f) => !q || [f.name, f.story?.logline, ...f.stages.map((s) => s.name), ...f.cuts.map((c) => c.name)].some((t) => t?.toLowerCase().includes(q)));
  return h("div.home-results", {},
    home.error ? h("p.home-empty", {}, home.error)
      : !home.loaded ? h("div.home-empty", {}, h("span.typing", {}, h("i"), h("i"), h("i")))
      : shown.length ? h("div.film-grid", {}, ...featureFirst(shown, !q).map((f, i) => card(f, i === 0 && !q)))
      : h("p.home-empty", {}, q ? "Nothing by that name." : "No projects yet: write the first one above."));
}
const refreshResults = () => document.querySelector(".home-results")?.replaceWith(results());

function projects() {
  return h("section.home-projects", {},
    h("div.home-head", {},
      h("span.card-label", {}, "Projects"),
      h("span.spacer"),
      h("label.home-search", {}, icon("search"), h("input", { type: "search", value: home.query, placeholder: "Search projects", "aria-label": "Search the projects", on: { input: (e) => ((home.query = e.target.value), refreshResults()) } }))),
    results());
}

export function renderHome(el) {
  if (!home.loading && Date.now() - home.loaded > 4000) load();
  el.replaceChildren(h("div.home", { dataset: { scrollKey: "home" } }, hero(), h("div.home-in", {}, projects())));
}
