import { h, icon, sprite, ago } from "../dom.js";
import { changed, toast, newTab, openTake } from "../store.js";
import { go, currentPage } from "../router.js";
import { stageReady } from "../control/link.js";
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
/** A project opens on what it grew from: its story, or the stage or edit it is. */
const openFilm = (f) => (f.story ? openPart("story", f.story.id) : f.stages[0] ? openPart("stage", f.stages[0].id) : f.cuts[0] ? openPart("cut", f.cuts[0].id) : null);

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
  const lit = home.films.find((f) => f.story?.thumb) ?? home.films.find((f) => f.thumb);
  const last = home.films.find((f) => f.story);
  return h("section.home-hero", { style: lit ? { "--hero": `url("${lit.story?.thumb ?? lit.thumb}")` } : {} },
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
      last.thumb ? h("img", { src: last.thumb, alt: "", draggable: false }) : null,
      h("span", {}, "Continue"), h("b", {}, last.name), icon("arrow"), h("span.home-continue-facts", {}, counts(last, true))) : null);
}

/** "7 scenes · 2 stages · 6 shots · 1 edit": what a project holds. */
function counts(f, short = false) {
  const c = f.counts ?? {};
  const n = (v, one, many = `${one}s`) => (v ? `${v} ${v === 1 ? one : many}` : null);
  return [n(c.scenes, "scene"), short ? null : n(c.stages, "stage"), n(c.shots, "shot"), short ? null : n(c.takes, "take"), short ? null : n(c.cuts, "edit")].filter(Boolean).join(" · ")
    || (f.story ? (f.story.logline ? "The idea, no script yet" : "Not written yet") : f.kind === "stage" ? "1 stage" : "1 edit");
}

const SECTION = { story: "Story", stage: "Stage", cut: "Cut", take: "Shot" };
/** A part of a project as a small picture that opens it where it is made; a take plays while the pointer is on it. */
function part(kind, id, pic, name, { video, time } = {}) {
  const media = video ? h("video", { src: video, poster: pic ?? "", muted: true, loop: true, playsInline: true, preload: "none" }) : pic ? h("img", { src: pic, alt: "", loading: "lazy", draggable: false }) : h("span.film-part-empty", {}, sprite(KIND[kind].icon));
  return h("button.film-part", {
    type: "button", className: `is-${kind}`, title: `${name}\nOpen in ${SECTION[kind]}`, "aria-label": `${name}: open in ${SECTION[kind]}`,
    on: {
      click: (e) => (e.stopPropagation(), openPart(kind, id)),
      mouseenter: () => video && media.play?.().catch(() => {}),
      mouseleave: () => video && (media.pause(), (media.currentTime = 0)),
    },
  }, media, video ? h("span.film-part-play", {}, icon("play")) : null, time ? h("span.film-part-time", {}, time) : null);
}

/** What a project holds, shown over its cover with the pointer on it: its story's frames, its stages, its takes, its edits. */
function inside(f) {
  const group = (kind, label, items) => (items.length ? h("div.film-group", { className: `is-${kind}`, style: { flexGrow: items.length } }, h("span.film-group-label", {}, sprite(KIND[kind].icon), label), h("div.film-group-row", {}, ...items)) : null);
  const frames = (f.story?.frames ?? []).slice(0, 5);
  const takes = f.takes.filter((t) => t.status === "done").slice(0, 3);
  const rest = [
    group("stage", "Stages", f.stages.slice(0, 2).map((s) => part("stage", s.id, s.thumb, s.name))),
    group("take", "Shots / takes", takes.map((t) => part("take", t.id, t.frame, t.name, { video: t.video, time: `${Number(t.seconds ?? 0).toFixed(1)} s` }))),
    group("cut", "Edits", f.cuts.slice(0, 1).map((c) => part("cut", c.id, c.thumb, c.name))),
  ].filter(Boolean);
  const many = (f.story ? 1 : 0) + f.stages.length + takes.length + f.cuts.length;
  if (many < 2) return null;
  return h("div.film-inside", {},
    f.story ? h("div.film-group.is-story", {},
      h("span.film-group-label", {}, sprite("section-story"), "Story", h("b", {}, f.story.name)),
      h("div.film-strip", {}, ...(frames.length ? frames : [f.story.thumb]).map((url) => part("story", f.story.id, url, f.story.name)))) : null,
    rest.length ? h("div.film-groups", {}, ...rest) : null);
}

function card(f) {
  const kind = KIND[f.kind] ?? KIND.story;
  const armed = home.armed === f.id;
  const open = inside(f);
  return h("article.film-card", { className: `${armed ? "is-armed" : ""}${open ? " has-inside" : ""}`, tabindex: "0", on: { click: () => openFilm(f), keydown: (e) => e.key === "Enter" && e.target === e.currentTarget && openFilm(f) } },
    h("div.film-cover", {},
      f.thumb ? h("img.film-key", { src: f.thumb, alt: "", loading: "lazy", draggable: false }) : h("span.film-cover-empty", {}, sprite(kind.icon)),
      open,
      h("button.film-delete", { type: "button", title: armed ? "Click again: the story, stages and edits go (the takes stay in the Library)" : "Delete the project", "aria-label": "Delete the project", "aria-pressed": String(armed), on: { click: (e) => (e.stopPropagation(), removeFilm(f)) } }, icon("trash"))),
    h("div.film-text", {},
      h("b.film-name", {}, f.name),
      h("p.film-logline", {}, f.story?.logline || (f.kind === "stage" ? "A stage" : f.kind === "cut" ? "An edit" : "Not written yet")),
      h("div.film-foot", {}, sprite(kind.icon), h("span.film-counts", {}, counts(f)), h("span.film-ago", {}, ago(f.updatedAt)))));
}

/** The cards that match the search; the search redraws only these, so its field keeps the caret. */
function results() {
  const q = home.query.trim().toLowerCase();
  const shown = home.films.filter((f) => !q || [f.name, f.story?.logline, ...f.stages.map((s) => s.name), ...f.cuts.map((c) => c.name)].some((t) => t?.toLowerCase().includes(q)));
  return h("div.home-results", {},
    home.error ? h("p.home-empty", {}, home.error)
      : !home.loaded ? h("div.home-empty", {}, h("span.typing", {}, h("i"), h("i"), h("i")))
      : shown.length ? h("div.film-grid", {}, ...shown.map(card))
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
