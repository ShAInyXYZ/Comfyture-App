import { h, icon, sprite, ago } from "../dom.js";
import { changed, toast, newTab, openTake, writer, writers, artists, artistFor, sheetOf, drawPicture } from "../store.js";
import { writerPicker, artistPicker } from "../writer-menu.js";
import { tilePicker } from "../controls.js";
import { mentionAt, putMention } from "../mentions.js";
import { pillField } from "../pills.js";
import { go, currentPage } from "../router.js";
import { stageReady } from "../control/link.js";
import { view } from "../viewer.js";
import { attachMenu } from "../attach.js";
import { story, loadStories, openStory, newStory, deleteStory, writeTake, tagOf, commit as commitStory } from "../story.js";
import { loadCuts, openCut, newCut, deleteCut } from "../cut.js";

// The welcome screen: where Comfyture opens. Its heart is the prompt: one sentence becomes one,
// two or four variants, each a brief with its moodboard, and the one picked is started as a story.
// Under it, the projects. A project is a film: its story, the stages its shots were blocked on, its
// takes and its edits, together on one card that opens on hover.

// refs: pictures and videos attached to the prompt, for the story to be built around; count: how
// many variants the prompt is written as; ideas: the variants written last, kept until one is started
const IDEAS = "comfyture.home.ideas";
const home = { films: [], loaded: 0, loading: null, error: null, query: "", brief: "", length: 60, aspect: "16:9", genre: "", count: 4, ideas: null, starting: false, armed: null, refs: [], adding: 0 };
try {
  home.ideas = JSON.parse(localStorage.getItem(IDEAS) ?? "null");
} catch {}
if (home.ideas?.writing) home.ideas = null;
const KIND = {
  story: { label: "Story", icon: "section-story" },
  stage: { label: "Stage", icon: "section-stage" },
  cut: { label: "Edit", icon: "edit-scissors" },
  take: { label: "Take", icon: "section-shot" },
};
// one key each for the length and the frame: a click steps to the next (Shift, the one before)
const LENGTHS = [[10, "10 s"], [20, "20 s"], [30, "30 s"], [60, "1 min"], [120, "2 min"], [300, "5 min"]];
// the genre the idea is written in ("" leaves it to the writer)
const GENRES = [["Drama", "drama"], ["Comedy", "comedy"], ["Thriller", "thriller"], ["Horror", "horror"], ["Sci-fi", "scifi"], ["Fantasy", "fantasy"], ["Romance", "romance"], ["Adventure", "adventure"], ["Animation", "animation"], ["Documentary", "documentary"], ["Commercial", "commercial"], ["Music video", "music-video"]].map(([value, file]) => ({ value, label: value, image: `img/genres/${file}.webp` }));
const ASPECTS = [["16:9", "16:9", "ratio-16-9", "Wide"], ["9:16", "9:16", "ratio-9-16", "Tall, for phones"], ["1:1", "1:1", "ratio-1-1", "Square"]];
const COUNTS = [[1, "1", "variants-1"], [2, "2", "variants-2"], [4, "4", "variants-4"]];

// the prompt being written, its references and its settings, kept per browser so a reload loses nothing
const DRAFT = "comfyture.home.draft";
try {
  const d = JSON.parse(localStorage.getItem(DRAFT) ?? "null") ?? {};
  if (typeof d.brief === "string") home.brief = d.brief.slice(0, 4000);
  if (Array.isArray(d.refs)) home.refs = d.refs.filter((r) => r && typeof r.name === "string" && (r.kind === "video" ? r.file && r.url : r.file && r.url)).slice(0, 4);
  if (LENGTHS.some(([v]) => v === d.length)) home.length = d.length;
  if (ASPECTS.some(([v]) => v === d.aspect)) home.aspect = d.aspect;
  if (GENRES.some((g) => g.value === d.genre)) home.genre = d.genre;
  if (COUNTS.some(([v]) => v === d.count)) home.count = d.count;
} catch {}
const keepDraft = () => {
  try {
    localStorage.setItem(DRAFT, JSON.stringify({ brief: home.brief, refs: home.refs, length: home.length, aspect: home.aspect, genre: home.genre, count: home.count }));
  } catch {}
};
/** A key that shows its value and steps through the values on each click, from the value as it is then. */
function stepper(label, list, get, set, glyph, hint) {
  const key = h("button.home-step", { type: "button" });
  const show = () => {
    const item = list.find(([v]) => v === get()) ?? list[0];
    key.title = `${label}: ${item[1]}${hint ? ` — ${hint(item)}` : ""}\nClick for the next, Shift-click for the one before`;
    key.setAttribute("aria-label", `${label}: ${item[1]}`);
    key.replaceChildren(sprite(item[2] ?? glyph), h("span", {}, item[1]));
  };
  const step = (by) => {
    const i = Math.max(0, list.findIndex(([v]) => v === get()));
    set(list[(i + by + list.length) % list.length][0]);
    show();
  };
  key.addEventListener("click", (e) => step(e.shiftKey ? -1 : 1));
  key.addEventListener("contextmenu", (e) => (e.preventDefault(), step(-1)));
  show();
  return key;
}
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

/** A whole story from one sentence: a new story with the brief, and the writer writing it while Story shows it. */
/** The prompt as one, two or four variants: each a brief, then its moodboard drawn. */
async function imagine() {
  const brief = home.brief.trim() || (home.refs.length ? "A short film built around the attached references." : "");
  if (!brief) return home.field?.focus();
  if (home.adding) return toast("A moment: an attachment is still coming in.");
  if (home.ideas?.writing) return;
  const run = { brief, length: home.length, aspect: home.aspect, genre: home.genre, refs: home.refs.slice(0, 4), count: home.count, takes: [], writing: true };
  home.ideas = run;
  redraw();
  try {
    // the references on one sheet the writer sees, each under its @name
    const pics = run.refs.filter((r) => (r.kind === "video" ? r.still?.url : r.url));
    const sheet = pics.length ? await sheetOf(pics.map((r) => ({ name: r.name, url: r.kind === "video" ? r.still.url : r.url }))).catch(() => null) : null;
    const { ideas } = await call("api/story/ideas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ count: run.count, model: writer(), story: { idea: { brief, length: run.length, aspect: run.aspect, genre: run.genre, refs: run.refs } }, sheet: sheet?.file }) });
    if (home.ideas !== run) return;
    const stamp = Date.now().toString(36);
    run.takes = ideas.map((t, i) => ({ ...t, id: `${stamp}${i}`, frames: {} }));
    run.writing = false;
    keepIdeas();
    redraw();
    run.takes.forEach((t) => drawTake(run, t));
  } catch (e) {
    if (home.ideas === run) home.ideas = null;
    redraw();
    fail(e);
  }
}

// a variant's moodboard: its key moment in the film's frame, its hero, its place
const FRAMES = [
  // the moment names its hero, so the picture is told what they are; a title in quotes would be lettered on it
  ["moment", (t) => `A cinematic film still: ${(t.moment || t.logline).replace(/\.$/, "")}${t.hero.name && t.hero.words ? `. ${t.hero.name} is ${t.hero.words.replace(/\.$/, "")}` : ""}`],
  // alone, so the picture can stand for them in the story's cast
  ["hero", (t) => `${t.hero.name}${t.hero.words ? `, ${t.hero.words}` : ""}. A cinematic medium shot of them alone in their world, looking off camera, nobody else in the frame`],
  ["place", (t) => `${t.place.words || t.place.name}. A cinematic establishing shot of ${t.place.name || "the place"}, with nobody in it`],
];
function drawTake(run, t) {
  const look = t.look ? ` In the film's look: ${t.look.replace(/\.$/, "")}.` : "";
  const refs = run.refs.map((r) => (r.kind === "video" ? r.still && { file: r.still.file, name: r.name } : { file: r.file, name: r.name })).filter(Boolean);
  for (const [key, words] of FRAMES) {
    if (t.frames[key]?.url || t.frames[key]?.busy) continue;
    t.frames[key] = { busy: true };
    const template = refs.length ? "edit" : "generate";
    drawPicture({ model: artistFor(template), template, prompt: `${words(t).replace(/\.$/, "")}.${look}`, aspect: run.aspect, refs, name: `${t.title} · moodboard` })
      .then((photo) => (t.frames[key] = { file: photo.file, url: photo.url, width: photo.width, height: photo.height }))
      .catch(() => (t.frames[key] = { failed: true }))
      .finally(() => (keepIdeas(), home.ideas === run && refreshTakes()));
  }
}
// what was drawing when the page closed is drawn again
setTimeout(() => home.ideas?.takes?.forEach((t) => {
  for (const [key] of FRAMES) if (t.frames[key]?.busy) delete t.frames[key];
  drawTake(home.ideas, t);
}), 0);
const keepIdeas = () => {
  try {
    if (home.ideas && !home.ideas.writing) localStorage.setItem(IDEAS, JSON.stringify(home.ideas));
    else if (!home.ideas) localStorage.removeItem(IDEAS);
  } catch {}
};

/** The variant picked becomes the story: its idea written, its moodboard its look; the script and the world follow. */
async function startTake(run, t) {
  if (home.starting) return;
  home.starting = t.id;
  redraw();
  try {
    await loadStories();
    await newStory(t.title);
    const b = story.project.body;
    // the moodboard goes along as references the writer sees, after the user's own
    const board = [["moment", "moment"], ["hero", tagOf(t.hero.name || "hero")], ["place", tagOf(t.place.name || "place")]]
      .filter(([k]) => t.frames[k]?.url).map(([k, name]) => ({ kind: "image", file: t.frames[k].file, url: t.frames[k].url, name }));
    Object.assign(b.idea, { brief: run.brief, length: run.length, aspect: run.aspect, genre: t.genre, tone: t.tone, title: t.title, logline: t.logline, synopsis: t.synopsis, refs: [...run.refs, ...board].slice(0, 4) });
    if (t.look) b.look.words = t.look;
    if (t.frames.moment?.url) b.look.refs = [t.frames.moment];
    commitStory();
    home.ideas = null;
    home.brief = "";
    home.refs = [];
    keepIdeas();
    keepDraft();
    go("story");
    writeTake(t);
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

// ---------------------------------------------------------------- the references attached to the prompt

const slugName = (n) => String(n ?? "").toLowerCase().replace(/\.[a-z0-9]{2,4}$/, "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "ref";
/** A name the writers can call it by (@lighthouse), never twice. */
function nameFor(n) {
  const base = slugName(n);
  let name = base;
  for (let i = 2; home.refs.some((r) => r.name === name); i++) name = `${base}-${i}`;
  return name;
}
const upload = async (path, blob, type) => {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": type }, body: blob });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error ?? res.statusText);
  return out;
};
/** A video's frame, as a picture the writers can see. */
async function stillOf(url, name) {
  const v = Object.assign(document.createElement("video"), { muted: true, preload: "auto", src: url });
  await new Promise((ok, no) => ((v.onloadeddata = ok), (v.onerror = () => no(new Error("That video can't be read.")))));
  v.currentTime = Math.min(1, (v.duration || 2) / 2);
  await new Promise((ok) => (v.onseeked = ok));
  const c = new OffscreenCanvas(v.videoWidth, v.videoHeight);
  c.getContext("2d").drawImage(v, 0, 0);
  return upload(`api/photos?name=${encodeURIComponent(`${name} still`)}`, await c.convertToBlob({ type: "image/jpeg", quality: 0.9 }), "image/jpeg");
}
/** Pictures and videos from the computer: kept in the Library, and on the prompt. */
async function addFiles(files) {
  for (const f of [...(files ?? [])].filter((x) => /^(image|video)\//.test(x.type))) {
    if (home.refs.length >= 4) return toast("Four references at most: the writers see them on one sheet.");
    home.adding++;
    refreshRefs();
    try {
      if (f.type.startsWith("image/")) {
        const p = await upload(`api/photos?name=${encodeURIComponent(f.name)}`, f, f.type);
        // a pasted picture comes as "image.png": it is a ref until it is renamed
        home.refs.push({ kind: "image", file: p.file, url: p.url, name: nameFor(/^image\.(png|jpe?g|webp|gif)$/i.test(f.name) ? "ref" : f.name) });
      } else {
        const v = await upload("api/videos", f, f.type);
        const name = nameFor(f.name);
        home.refs.push({ kind: "video", file: v.file, url: v.url, seconds: v.seconds, name, still: await stillOf(v.url, name) });
      }
    } catch (e) {
      fail(e);
    } finally {
      home.adding--;
      refreshRefs();
    }
  }
}
// A picture or a video pasted anywhere on the screen, or dropped anywhere on it, goes on the prompt
// as a reference; while files are dragged over the screen the prompt lights up to take them.
const mediaFiles = (list) => [...(list ?? [])].filter((f) => /^(image|video)\//.test(f.type));
const carriesFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes("Files");
const lightPrompt = (on) => document.querySelector(".home-prompt")?.classList.toggle("is-drop", on);
let dragDepth = 0;
document.addEventListener("paste", (e) => {
  const files = currentPage() === "home" ? mediaFiles(e.clipboardData?.files) : [];
  if (!files.length) return;
  e.preventDefault();
  addFiles(files);
});
document.addEventListener("dragenter", (e) => currentPage() === "home" && carriesFiles(e) && (dragDepth++, lightPrompt(true)));
document.addEventListener("dragleave", (e) => currentPage() === "home" && carriesFiles(e) && --dragDepth <= 0 && ((dragDepth = 0), lightPrompt(false)));
// without this, a file let go of beside the prompt would open in the tab instead
document.addEventListener("dragover", (e) => currentPage() === "home" && carriesFiles(e) && e.preventDefault());
document.addEventListener("drop", (e) => {
  if (currentPage() !== "home" || !carriesFiles(e)) return;
  e.preventDefault();
  dragDepth = 0;
  lightPrompt(false);
  const files = mediaFiles(e.dataTransfer.files);
  if (files.length) addFiles(files);
  else toast("Pictures and videos only: they become the story's references.");
});
function attach(anchor) {
  attachMenu(anchor, {
    files: addFiles,
    picture: (p) => home.refs.length < 4 && !home.refs.some((r) => r.file === p.file) && (home.refs.push({ kind: "image", file: p.file, url: p.url, name: nameFor(p.name ?? p.file) }), refreshRefs()),
    taken: (p) => home.refs.some((r) => r.file === p.file),
    accept: "image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime",
  });
}
/**
 * The references on the prompt, each with its @name; drawn in place so the field keeps its words
 * and caret. A click on one names it in the prompt; a click on its name renames it; the ones the
 * prompt names are lit.
 */
function refs() {
  const named = mentioned();
  return h("div.home-refs", { hidden: !home.refs.length && !home.adding },
    ...home.refs.map((r, i) => h("div.home-ref", {
      className: named.has(r.name) ? "is-mentioned" : "", dataset: { name: r.name }, title: `Name @${r.name} in the prompt\n${r.kind === "video" ? "A reference video" : "A reference picture"}`,
      on: { click: () => home.field && putMention(home.field, r.name), pointerenter: () => peekRef(r.name, true), pointerleave: () => peekRef(r.name, false) },
    },
      h("img", { src: refPicture(r), alt: "", draggable: false }),
      r.kind === "video" ? h("span.home-ref-video", {}, icon("play"), r.seconds ? `${Number(r.seconds).toFixed(1)} s` : "") : null,
      h("button.home-ref-name", { type: "button", title: "Rename it", "aria-label": `Rename @${r.name}`, on: { click: (e) => (e.stopPropagation(), rename(r, e.currentTarget)) } }, `@${r.name}`),
      h("button.home-ref-x", { type: "button", title: "Take it off", "aria-label": `Take @${r.name} off`, on: { click: (e) => (e.stopPropagation(), home.refs.splice(i, 1), refreshRefs(), updateMentions()) } }, icon("close")))),
    home.adding ? h("div.home-ref.is-adding", {}, h("span.typing", {}, h("i"), h("i"), h("i"))) : null);
}
const refreshRefs = () => {
  document.querySelector(".home-refs")?.replaceWith(refs());
  // what the pills stand for has changed with them
  home.field?.refresh();
  keepDraft();
};
/** A pill and its picture point at each other: the picture grows a little while its pill is under the pointer, and the other way round. */
function peekRef(name, on) {
  document.querySelector(`.home-ref[data-name="${CSS.escape(name)}"]`)?.classList.toggle("is-peeked", on);
  home.field?.el.querySelectorAll(`.pill[data-name="${CSS.escape(name)}"]`).forEach((p) => p.classList.toggle("is-lit", on));
}
const refPicture = (r) => (r.kind === "video" ? r.still?.url ?? "" : r.url);
/** The references the prompt names. */
const mentioned = () => new Set([...home.brief.matchAll(/@([a-z0-9][a-z0-9-]*)/gi)].map((m) => m[1].toLowerCase()));

/** A reference renamed in place: the prompt's @old becomes @new, and no two share a name. */
function rename(r, button) {
  const field = h("input.home-ref-rename", { value: r.name, maxLength: 24, "aria-label": "Its name", spellcheck: false });
  let done = false;
  const finish = (keep) => {
    if (done) return;
    done = true;
    const base = slugName(field.value);
    if (keep && base !== r.name) {
      let name = base;
      for (let i = 2; home.refs.some((x) => x !== r && x.name === name); i++) name = `${base}-${i}`;
      home.brief = home.brief.replace(new RegExp(`@${r.name}(?![a-z0-9-])`, "gi"), `@${name}`);
      r.name = name;
      if (home.field) home.field.value = home.brief;
    }
    refreshRefs();
  };
  field.addEventListener("click", (e) => e.stopPropagation());
  field.addEventListener("keydown", (e) => {
    if (e.key === "Enter") e.preventDefault(), finish(true);
    if (e.key === "Escape") e.preventDefault(), finish(false);
  });
  field.addEventListener("blur", () => finish(true));
  button.replaceWith(field);
  field.focus();
  field.select();
}

/** Under the prompt while an @ is typed: the references whose names start with what follows it. */
function updateMentions() {
  const input = home.field;
  const picker = document.querySelector(".home-mentions");
  // (the chips' titles become tooltips, so they are found by their class)
  const named = mentioned();
  document.querySelectorAll(".home-ref:not(.is-adding)").forEach((chip, i) => chip.classList.toggle("is-mentioned", named.has(home.refs[i]?.name)));
  if (!input || !picker) return;
  const at = document.activeElement === input.el ? mentionAt(input) : null;
  const list = at ? home.refs.filter((r) => r.name.startsWith(at.query)) : [];
  // a name typed out in full needs no picker
  const exact = list.length === 1 && list[0].name === at?.query;
  home.mentioning = at && !exact ? list : [];
  home.pick = Math.min(home.pick ?? 0, Math.max(0, list.length - 1));
  picker.hidden = !home.mentioning.length;
  picker.replaceChildren(h("div.pick-grid.is-refs", {}, ...home.mentioning.map((r, i) =>
    h("button.pick-file", { type: "button", className: i === home.pick ? "is-active" : "", on: { mousedown: (e) => (e.preventDefault(), putMention(input, r.name)) } },
      h("span.pick-thumb", {}, h("img", { src: refPicture(r), alt: "", draggable: false })),
      h("span.pick-name", {}, h("b", {}, `@${r.name}`), h("span", {}, r.kind === "video" ? "A reference video" : "A reference picture"))))));
}
/** The prompt's keys while the picker is up: the arrows pick, Tab or Enter names it, Escape closes it. */
function mentionKeys(e) {
  const list = home.mentioning ?? [];
  if (!list.length) return false;
  const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
  if (step) {
    e.preventDefault();
    home.pick = Math.min(list.length - 1, Math.max(0, home.pick + step));
    updateMentions();
    return true;
  }
  if (e.key === "Tab" || e.key === "Enter") {
    e.preventDefault();
    putMention(home.field, list[home.pick].name);
    return true;
  }
  if (e.key === "Escape") {
    e.preventDefault();
    home.mentioning = [];
    document.querySelector(".home-mentions")?.toggleAttribute("hidden", true);
    return true;
  }
  return false;
}

// ---------------------------------------------------------------- the screen

/** The heart of the screen: what the film is about, and the story written from it. */
function hero() {
  // the prompt: its @names of references are pills, each pointing at its picture under it
  const lookup = (name) => {
    const r = home.refs.find((x) => x.name === name);
    return r ? { url: refPicture(r) } : null;
  };
  const field = pillField({ placeholder: "an old lighthouse keeper and a girl carry a glowing jellyfish back to the sea", label: "What the film is about", lookup, className: "home-brief", peek: false });
  field.value = home.brief;
  home.field = field;
  field.addEventListener("keydown", (e) => mentionKeys(e) || (e.key === "Enter" && !e.shiftKey && !e.isComposing && (e.preventDefault(), imagine())));
  field.addEventListener("input", () => ((home.brief = field.value), updateMentions(), keepDraft()));
  field.addEventListener("click", updateMentions);
  field.addEventListener("keyup", (e) => e.key.startsWith("Arrow") && !home.mentioning?.length && updateMentions());
  // a redraw blurs it for a moment; the picker only goes when the focus really left
  field.addEventListener("blur", () => setTimeout(() => document.activeElement === home.field?.el || updateMentions(), 120));
  field.el.addEventListener("pointerover", (e) => {
    const p = e.target.closest?.(".pill");
    if (p) peekRef(p.dataset.name, true);
  });
  field.el.addEventListener("pointerout", (e) => {
    const p = e.target.closest?.(".pill");
    if (p && !p.contains(e.relatedTarget)) peekRef(p.dataset.name, false);
  });
  const lit = home.films.find((f) => f.story?.thumb) ?? home.films.find((f) => f.cover?.pic);
  const last = home.films.find((f) => f.story);
  return h("section.home-hero", { style: lit ? { "--hero": `url("${lit.story?.thumb ?? lit.cover.pic}")` } : {} },
    h("h1.home-ask", {}, h("label", { on: { click: () => home.field?.focus() } }, "What's your film about?")),
    h("div.home-prompt", {},
      field.el,
      refs(),
      h("div.mention-picker.home-mentions", { hidden: true, role: "listbox", "aria-label": "References" }),
      h("div.home-prompt-foot", {},
        stepper("Length", LENGTHS, () => home.length, (v) => ((home.length = v), keepDraft()), "duration"),
        stepper("Variants", COUNTS, () => home.count, (v) => ((home.count = v), keepDraft()), null, () => "each a brief with its moodboard, to start the one you like"),
        stepper("Frame", ASPECTS, () => home.aspect, (v) => ((home.aspect = v), keepDraft()), null, (a) => a[3]),
        h("span.home-pick.is-genre", { className: home.genre ? "is-set" : "", title: "Genre\nThe idea is written in it" }, tilePicker({ label: "Genre", none: "Any genre", value: home.genre, items: GENRES, onChange: (v) => ((home.genre = v), keepDraft(), redraw()) })),
        h("span.spacer"),
        writers().length > 1 ? h("span.home-pick.is-model", { title: "Writer\nThe model that writes the story" }, writerPicker("writer")) : h("span.home-model.is-one", { title: "The story is written by Gemma 4, inside ComfyUI" }, sprite("prompt-enhance"), writers()[0]?.name ?? "Gemma 4"),
        artists().length ? h("span.home-pick.is-model.is-artist", { title: "Artist\nThe model that draws the moodboards and the story's pictures" }, artistPicker()) : null,
        h("button.home-attach", { type: "button", title: "Attach pictures or videos\nThe story is built around them: who, where, the look", "aria-label": "Attach pictures or videos", "aria-expanded": "false", on: { click: (e) => attach(e.currentTarget) } }, sprite("paperclip")),
        h("button.key.is-primary.home-write", { type: "button", disabled: !!home.starting || !!home.ideas?.writing, title: "Enter", on: { click: imagine } }, sprite("prompt-enhance"), home.ideas?.writing ? "Imagining…" : "Imagine"))),
    takes(),
    h("div.home-new", { role: "group", "aria-label": "Start something empty" },
      ...START.map(([glyph, tip, run]) => h("button.home-new-key", { type: "button", title: tip, "aria-label": tip, on: { click: () => Promise.resolve(run()).catch(fail) } }, sprite(glyph)))),
    last ? h("button.home-continue", { type: "button", title: "Open its story", on: { click: () => openFilm(last) } },
      last.story?.thumb ? h("img", { src: last.story.thumb, alt: "", draggable: false }) : null,
      h("span", {}, "Continue"), h("b", {}, last.name), icon("arrow"), h("span.home-continue-facts", {}, counts(last))) : null);
}

/** The variants of the prompt, side by side: each a brief with its moodboard, and a key to start it. */
function takes() {
  const run = home.ideas;
  if (!run) return null;
  const n = run.writing ? run.count : run.takes.length;
  const shape = run.aspect === "9:16" ? "tall" : run.aspect === "1:1" ? "square" : "wide";
  return h("section.home-takes", { "aria-label": "The variants", dataset: { shape } },
    h("div.home-takes-head", {},
      h("span.card-label", {}, run.writing ? "Imagining" : n === 1 ? "A variant" : `${n} variants`),
      h("span.home-takes-brief", { title: run.brief }, run.brief),
      run.writing ? null : h("button.home-takes-x", { type: "button", title: "Put them away", "aria-label": "Put the variants away", on: { click: () => ((home.ideas = null), keepIdeas(), redraw()) } }, icon("close"))),
    h("div.home-takes-row", { dataset: { n } }, ...(run.writing ? Array.from({ length: n }, writingCard) : run.takes.map((t) => takeCard(run, t)))));
}
const refreshTakes = () => {
  const now = document.querySelector(".home-takes");
  if (now) now.replaceWith(takes() ?? "");
  else redraw();
};
const BOARD = ["moment", "hero", "place"];
function writingCard() {
  return h("article.home-take.is-writing", { "aria-busy": "true" },
    h("div.take-board", {}, ...BOARD.map((k) => h(`div.take-frame.is-${k}`))),
    h("div.take-text", {}, h("span.take-line"), h("span.take-line"), h("span.take-line.is-short")),
    h("span.typing.take-wait", {}, h("i"), h("i"), h("i")));
}
function takeCard(run, t) {
  const frame = (key) => {
    const f = t.frames[key];
    return h(`div.take-frame.is-${key}`, { title: key === "moment" ? "The key moment" : key === "hero" ? t.hero.name || "The hero" : t.place.name || "The place" },
      f?.url ? h("img", { src: f.url, alt: "", draggable: false, on: { click: () => view(f.url, "image") } })
        : f?.failed ? h("button.take-redraw", { type: "button", title: "Draw it again", "aria-label": "Draw it again", on: { click: () => (delete t.frames[key], drawTake(run, t), refreshTakes()) } }, icon("remix"))
        : h("span.typing", {}, h("i"), h("i"), h("i")));
  };
  return h("article.home-take", {},
    h("div.take-board", {}, ...BOARD.map(frame)),
    h("div.take-text", {},
      h("h3.take-title", {}, t.title),
      h("p.take-logline", {}, t.logline),
      h("p.take-synopsis", {}, t.synopsis),
      h("div.take-chips", {}, ...[t.genre, t.tone].filter(Boolean).map((c) => h("span.chip", {}, c)))),
    h("button.key.is-primary.take-start", { type: "button", disabled: !!home.starting, on: { click: () => startTake(run, t) } }, sprite("section-story"), home.starting === t.id ? "Starting…" : "Start the story"));
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
      h("a.home-library", { href: "#/library", title: "Library\nEvery take, film and picture" }, sprite("batch")),
      h("label.home-search", {}, icon("search"), h("input", { type: "search", value: home.query, placeholder: "Search projects", "aria-label": "Search the projects", on: { input: (e) => ((home.query = e.target.value), refreshResults()) } }))),
    results());
}

export function renderHome(el) {
  if (!home.loading && Date.now() - home.loaded > 4000) load();
  el.replaceChildren(h("div.home", { dataset: { scrollKey: "home" } }, hero(), h("div.home-in", {}, projects())));
}
