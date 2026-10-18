// Story: a film prepared step by step, each step with an output the next one builds on.
//   Idea — a title, a logline, a synopsis.           Script — scenes, beats, lines; the cast and places.
//   Cast & world — how each one looks, and sheets.   Storyboard — every shot as a panel, drawn.
//   Shots — every panel rolled, played in order, sent to Cut.
// Stories are kept on the server, one per tab; Gemma 4 writes (and rewrites, when asked) each step.

import { state, changed, toast, drawPicture, rollAsTab, switchTab } from "./store.js";
import { expandTags } from "./pills.js";
import { go } from "./router.js";

export const STEPS = [["idea", "Idea"], ["script", "Script"], ["world", "Cast & world"], ["board", "Storyboard"], ["shots", "Shots"]];
// the Stage's colours, so a character reads the same everywhere
const COLORS = ["#e8584f", "#3fc6c0", "#f0a63a", "#8d7cf2", "#5fbf6a", "#e97fb4", "#4f8de8", "#c9a27a"];
export const SIZES = [["wide", "Wide"], ["medium", "Medium"], ["close", "Close"], ["ots", "OTS"]];
const SIZE_WORDS = { wide: "A wide shot", medium: "A medium shot", close: "A close-up", ots: "An over-the-shoulder shot" };
const TABS = "comfyture.story.tabs";
const LAST = "comfyture.story.last";

export const story = { list: [], tabs: [], project: null, busy: new Set(), selected: null, ready: null, error: null };
const body = () => story.project?.body;
const read = (k) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k, v) => {
  try {
    localStorage.setItem(k, v);
  } catch {}
};
const call = async (path, init) => {
  const res = await fetch(path, init);
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error ?? `Request failed (${res.status})`);
  return out;
};
const send = (path, method, data) => call(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
const uid = () => Math.random().toString(36).slice(2, 9);
export const tagOf = (name) => String(name ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "someone";
const update = () => changed("story", "nav");

/** A story's body with every part in place, whatever it was saved with. */
function normalize(b = {}) {
  return {
    step: b.step ?? "idea",
    idea: { brief: "", length: 60, aspect: "16:9", genre: "", tone: "", title: "", logline: "", synopsis: "", ...b.idea },
    script: { scenes: (b.script?.scenes ?? []).map((s) => ({ id: s.id ?? uid(), beats: [], lines: [], ...s })) },
    cast: (b.cast ?? []).map((c, i) => ({ id: c.id ?? uid(), tag: c.tag ?? tagOf(c.name), color: c.color ?? COLORS[i % COLORS.length], about: "", words: "", refs: [], ...c })),
    places: (b.places ?? []).map((p) => ({ id: p.id ?? uid(), tag: p.tag ?? tagOf(p.name), about: "", words: "", refs: [], ...p })),
    look: { words: "", palette: [], refs: [], ...b.look },
    board: { style: "sketch", shots: [], ...b.board, shots: (b.board?.shots ?? []).map((s) => ({ id: s.id ?? uid(), ...s })) },
  };
}

// ---------------------------------------------------------------- projects

let saveTimer = 0;
/** A moment after a change, the story is kept. */
export function touch({ now = false } = {}) {
  clearTimeout(saveTimer);
  update();
  if (!story.project) return;
  const p = story.project;
  const keep = async () => {
    const b = p.body;
    const thumb = b.board.shots.find((s) => s.photo)?.photo?.url ?? b.cast.find((c) => c.refs[0])?.refs[0].url ?? b.places.find((x) => x.refs[0])?.refs[0].url;
    const name = b.idea.title || p.name;
    await send(`api/stories/${p.id}`, "PUT", { name, body: b, thumb }).catch((e) => toast(e.message, { tone: "crit" }));
    p.name = name;
    const known = story.list.find((x) => x.id === p.id);
    if (known) Object.assign(known, { name, thumb });
    update();
  };
  if (now) return keep();
  saveTimer = setTimeout(keep, 900);
}

export async function loadStories() {
  story.ready ??= (async () => {
    try {
      const { stories } = await call("api/stories");
      story.list = stories;
      let kept = [];
      try {
        kept = JSON.parse(read(TABS) ?? "[]");
      } catch {}
      story.tabs = (Array.isArray(kept) ? kept : []).filter((id) => stories.some((s) => s.id === id));
      if (!story.tabs.length) story.tabs = stories.slice(0, 6).map((s) => s.id);
      const last = read(LAST);
      const id = story.tabs.includes(last) ? last : story.tabs[0];
      if (id) await openStory(id);
      else await newStory();
    } catch (e) {
      story.error = e.message;
      update();
    }
  })();
  return story.ready;
}

export async function openStory(id) {
  if (story.project && saveTimer) await touch({ now: true });
  const { project } = await call(`api/stories/${id}`);
  project.body = normalize(project.body);
  story.project = project;
  story.selected = null;
  if (!story.tabs.includes(id)) story.tabs.push(id);
  write(TABS, JSON.stringify(story.tabs));
  write(LAST, id);
  update();
}

export async function newStory(name = "Untitled story") {
  const { project } = await send("api/stories", "POST", { name, body: normalize() });
  story.list.unshift({ id: project.id, name: project.name, updatedAt: project.updatedAt });
  await openStory(project.id);
}

export async function duplicateStory() {
  const p = story.project;
  if (!p) return;
  const { project } = await send("api/stories", "POST", { name: `${p.name} copy`.slice(0, 60), body: structuredClone(p.body) });
  story.list.unshift({ id: project.id, name: project.name, updatedAt: project.updatedAt });
  await openStory(project.id);
}

export function closeStory(id) {
  story.tabs = story.tabs.filter((x) => x !== id);
  write(TABS, JSON.stringify(story.tabs));
  if (story.project?.id === id) return story.tabs[0] ? openStory(story.tabs[0]) : newStory();
  update();
}

export async function deleteStory(id = story.project?.id) {
  if (!id) return;
  const { stories } = await call(`api/stories/${id}`, { method: "DELETE" });
  story.list = stories;
  return closeStory(id);
}

export function setStep(step) {
  if (!body()) return;
  body().step = step;
  touch();
}

// ---------------------------------------------------------------- writing

const STEP_OF = { idea: "idea", script: "script", world: "world", board: "board" };
/** What the writer gets: the story with every character's and place's @tag. */
const payload = (b) => ({ ...b, cast: b.cast.map(({ refs: _r, ...c }) => c), places: b.places.map(({ refs: _r, ...p }) => p), look: { words: b.look.words, palette: b.look.palette } });

/** Writes a step from the ones before it, or changes it as asked; what it had drawn stays where it still fits. */
export async function writeStep(step, ask = "") {
  const b = body();
  if (!b || !STEP_OF[step] || story.busy.has(step)) return;
  if (step === "idea" && !b.idea.brief.trim() && !ask.trim()) return toast("Say what the film is about first.");
  if (step !== "idea" && !b.idea.logline) return toast("Write the idea first: the script grows from its logline.");
  if ((step === "world" || step === "board") && !b.script.scenes.length) return toast("Write the script first.");
  story.busy.add(step);
  update();
  try {
    const out = await send("api/story/write", "POST", { step, story: payload(b), ask });
    if (step === "idea") Object.assign(b.idea, out);
    if (step === "script") {
      b.script.scenes = out.scenes.map((s) => ({ id: uid(), ...s }));
      // the cast and places the script names, keeping what each already had (words, pictures, colour)
      const keep = (old, fresh, kind) => fresh.map((f, i) => {
        const was = old.find((o) => o.name.toLowerCase() === f.name.toLowerCase());
        return was ? { ...was, about: f.about } : { id: uid(), name: f.name, tag: tagOf(f.name), about: f.about, words: "", refs: [], ...(kind === "cast" ? { color: COLORS[(old.length + i) % COLORS.length] } : {}) };
      });
      b.cast = keep(b.cast, out.cast, "cast");
      b.places = keep(b.places, out.places, "places");
      unique(b);
    }
    if (step === "world") {
      for (const c of out.cast) {
        const was = b.cast.find((x) => x.name.toLowerCase() === c.name.toLowerCase());
        if (was) was.words = c.words;
        else b.cast.push({ id: uid(), name: c.name, tag: tagOf(c.name), about: "", words: c.words, refs: [], color: COLORS[b.cast.length % COLORS.length] });
      }
      for (const p of out.places) {
        const was = b.places.find((x) => x.name.toLowerCase() === p.name.toLowerCase());
        if (was) was.words = p.words;
        else b.places.push({ id: uid(), name: p.name, tag: tagOf(p.name), about: "", words: p.words, refs: [] });
      }
      b.look.words = out.look.words || b.look.words;
      if (out.look.palette.length) b.look.palette = out.look.palette;
      unique(b);
    }
    if (step === "board") {
      const count = {};
      const old = b.board.shots;
      b.board.shots = out.shots.map((s) => {
        count[s.scene] = (count[s.scene] ?? 0) + 1;
        const code = `${s.scene}${String.fromCharCode(64 + count[s.scene])}`;
        // a panel that stays the same keeps its drawing and its take
        const same = old.find((o) => o.code === code && o.frame === s.frame);
        return { id: same?.id ?? uid(), code, ...s, photo: same?.photo ?? null, run: same?.run ?? null, tab: same?.tab ?? null };
      });
      story.selected = b.board.shots[0]?.id ?? null;
    }
    // the step that was written is the one to look at, and its output is the next step's start
    b.step = step;
    touch();
  } catch (e) {
    toast(e.message, { tone: "crit" });
  } finally {
    story.busy.delete(step);
    update();
  }
}

/** Every tag once: two characters called Sam become @sam and @sam-2. */
function unique(b) {
  const seen = new Set();
  for (const x of [...b.cast, ...b.places]) {
    let t = x.tag || tagOf(x.name);
    for (let i = 2; seen.has(t); i++) t = `${tagOf(x.name)}-${i}`;
    seen.add(t);
    x.tag = t;
  }
}

/** The character a line is said by: by name, or by @tag as the writer sometimes puts it. */
export function speaker(b, who) {
  const w = String(who ?? "").trim().replace(/^@/, "").toLowerCase();
  return b.cast.find((c) => c.name.toLowerCase() === w || c.tag === w) ?? null;
}

/** What @name stands for in the open story: a character or a place, with its sheet. */
export function storyLookup(name) {
  const b = body();
  if (!b) return null;
  const c = b.cast.find((x) => x.tag === name);
  if (c) return { title: c.name, color: c.color, url: c.refs[0]?.url, pictures: c.refs, words: c.words || c.about };
  const p = b.places.find((x) => x.tag === name);
  return p ? { title: p.name, url: p.refs[0]?.url, pictures: p.refs, words: p.words || p.about } : null;
}

/** The bar's words, on Story: they change the step that is open (the Shots step changes the board). */
export const askStory = (text) => writeStep(STEP_OF[body()?.step] ?? "board", text);

// ---------------------------------------------------------------- drawing

const lower = (t) => String(t ?? "").trim().replace(/[.;]+$/, "").replace(/^(A|An|The) /, (m) => m.toLowerCase());
const lookWords = (b) => (b.look.words ? ` In the film's look: ${lower(b.look.words)}.` : "");

/** A picture for a sheet: a character's three views, a place with nobody in it, or a frame of the film's look. */
export async function drawRef(kind, id) {
  const b = body();
  const item = kind === "cast" ? b.cast.find((c) => c.id === id) : kind === "place" ? b.places.find((p) => p.id === id) : b.look;
  if (!item) return;
  const key = `ref:${kind}:${id ?? "look"}`;
  if (story.busy.has(key)) return;
  const prompt = kind === "cast"
    ? `A character sheet of ${item.name}, ${lower(item.words || item.about) || "a character"}. Three full-length views side by side: front, three-quarter and back, standing in a relaxed neutral pose, the same face, hair and clothes in every view. Plain light grey background, soft even studio light.${lookWords(b)}`
    : kind === "place"
    ? `${item.words || item.about || item.name}. A cinematic establishing shot of ${item.name}, with nobody in it.${lookWords(b)}`
    : `A still from the film "${b.idea.title || "Untitled"}": ${lower(b.idea.logline) || "its key moment"}.${lookWords(b)}`;
  story.busy.add(key);
  update();
  try {
    const photo = await drawPicture({ model: "qwen-2.1", template: "generate", prompt, aspect: kind === "cast" ? "16:9" : b.idea.aspect });
    item.refs = [...(item.refs ?? []), { file: photo.file, url: photo.url, width: photo.width, height: photo.height }].slice(-6);
    touch();
  } catch (e) {
    toast(e.message, { tone: "crit" });
  } finally {
    story.busy.delete(key);
    update();
  }
}

export function addRefPicture(kind, id, photo) {
  const b = body();
  const item = kind === "cast" ? b.cast.find((c) => c.id === id) : kind === "place" ? b.places.find((p) => p.id === id) : b.look;
  if (!item || !photo?.file || item.refs.some((r) => r.file === photo.file)) return;
  item.refs = [...item.refs, { file: photo.file, url: photo.url, width: photo.width, height: photo.height }].slice(-6);
  touch();
}
export function removeRefPicture(kind, id, file) {
  const b = body();
  const item = kind === "cast" ? b.cast.find((c) => c.id === id) : kind === "place" ? b.places.find((p) => p.id === id) : b.look;
  if (!item) return;
  item.refs = item.refs.filter((r) => r.file !== file);
  touch();
}

/** Who and what a panel's @tags are: each with its words, and its first picture as a reference. */
export function castOf(b, text) {
  const tags = new Set([...String(text ?? "").matchAll(/@([a-z0-9][a-z0-9-]*)/gi)].map((m) => m[1].toLowerCase()));
  return [...b.cast.map((c) => ({ ...c, person: true })), ...b.places.map((p) => ({ ...p, person: false }))].filter((x) => tags.has(x.tag));
}

/** A panel's frame: drawn from its words, with the sheets of who and where it shows, in the board's style. */
export async function drawShot(id) {
  const b = body();
  const shot = b.board.shots.find((s) => s.id === id);
  const key = `shot:${id}`;
  if (!shot || story.busy.has(key)) return;
  const members = castOf(b, shot.frame);
  const withPictures = members.filter((m) => m.refs?.length).slice(0, 6);
  const refs = withPictures.map((m) => ({ file: m.refs[0].file, name: m.tag }));
  const cast = members.map((m) => ({ tag: m.tag, name: m.name, person: m.person, words: lower(m.words || m.about), pictures: m.refs?.length && withPictures.includes(m) ? [m.tag] : [] }));
  const style = b.board.style === "sketch"
    ? "A storyboard panel: a loose graphite pencil sketch in grey tones on white paper, clear shapes and strong composition, no text."
    : `A cinematic film still.${lookWords(b)}`;
  const prompt = `${style} ${SIZE_WORDS[shot.size] ?? "A shot"}: ${expandTags(shot.frame || shot.action, cast)}.`.replace(/\.\.$/, ".");
  story.busy.add(key);
  update();
  try {
    const photo = await drawPicture({ model: "qwen-2.1", template: refs.length ? "edit" : "generate", prompt, aspect: b.idea.aspect, refs });
    shot.photo = { file: photo.file, url: photo.url, width: photo.width, height: photo.height };
    shot.drawnAs = b.board.style;
    shot.still = null;
    touch();
  } catch (e) {
    toast(`${shot.code}: ${e.message}`, { tone: "crit" });
  } finally {
    story.busy.delete(key);
    update();
  }
}

export const drawAllShots = () => Promise.allSettled(body()?.board.shots.filter((s) => !s.photo).map((s) => drawShot(s.id)) ?? []);
export const drawAllRefs = () => {
  const b = body();
  if (!b) return;
  return Promise.allSettled([
    ...b.cast.filter((c) => !c.refs.length).map((c) => drawRef("cast", c.id)),
    ...b.places.filter((p) => !p.refs.length).map((p) => drawRef("place", p.id)),
    ...(b.look.refs.length ? [] : [drawRef("look")]),
  ]);
};

// ---------------------------------------------------------------- shots

/** A panel's take: rolled in a Shot tab of its own from its drawn frame, with its action, camera, line and sound. */
export async function rollShot(id) {
  const b = body();
  const shot = b.board.shots.find((s) => s.id === id);
  const key = `roll:${id}`;
  if (!shot || story.busy.has(key)) return;
  story.busy.add(key);
  update();
  try {
    if (!shot.photo) await drawShot(id);
    if (!shot.photo) throw new Error("Its frame isn't drawn.");
    // a pencil sketch plans the shot; the take starts from a film frame of it, in the look, with the sheets of who is in it
    if (shot.drawnAs === "sketch" && !shot.still) {
      const members = castOf(b, shot.frame).filter((m) => m.refs?.length).slice(0, 5);
      const cast = castOf(b, shot.frame).map((m) => ({ tag: m.tag, name: m.name, person: m.person, words: lower(m.words || m.about), pictures: members.includes(m) ? [m.tag] : [] }));
      const prompt = `Turn @sketch, a storyboard panel, into a finished cinematic film still: the same framing, the same places and poses, real people and places with real light. ${expandTags(shot.frame || shot.action, cast)}.${lookWords(b)}`;
      const photo = await drawPicture({ model: "qwen-2.1", template: "edit", prompt, aspect: b.idea.aspect, refs: [{ file: shot.photo.file, name: "sketch" }, ...members.map((m) => ({ file: m.refs[0].file, name: m.tag }))] });
      shot.still = { file: photo.file, url: photo.url, width: photo.width, height: photo.height };
      touch();
    }
    const first = shot.drawnAs === "sketch" && shot.still ? shot.still : shot.photo;
    const names = [...b.cast, ...b.places].map((x) => ({ tag: x.tag, name: x.name }));
    const plain = (t) => expandTags(String(t ?? ""), names);
    const who = shot.line ? speaker(b, shot.line.who) : null;
    const spec = { action: plain(shot.action), camera: shot.camera, framing: "", sound: plain(shot.sound), dialogue: shot.line?.text ? [{ speaker: who ? `${who.name}, ${lower(who.words || who.about) || "the speaker"}` : shot.line.who, line: shot.line.text }] : [] };
    const r = await rollAsTab({ tab: shot.tab, name: `${shot.code} · ${b.idea.title || story.project.name}`.slice(0, 60), group: b.idea.title || story.project.name, start: first, shot: spec, seconds: shot.seconds, aspect: b.idea.aspect });
    shot.tab = r.tab;
    shot.run = r.run;
    touch();
    r.done.then((done) => ((shot.run = done.id), touch())).catch((e) => toast(`${shot.code}: ${e.message}`, { tone: "crit" })).finally(update);
  } catch (e) {
    toast(`${shot.code}: ${e.message}`, { tone: "crit" });
  } finally {
    story.busy.delete(key);
    update();
  }
}

export const rollAllShots = () => Promise.allSettled(body()?.board.shots.filter((s) => !takeOf(s) || takeOf(s).status === "failed").map((s) => rollShot(s.id)) ?? []);

/** A panel's take, as the app knows it now. */
export const takeOf = (shot) => (shot?.run ? state.runs.find((r) => r.id === shot.run) ?? null : null);

/** Opens a panel's take in Shot. */
export function openShotTab(shot) {
  if (!shot?.tab || !state.tabs.some((t) => t.id === shot.tab)) return toast("Roll it first: its Shot tab is made then.");
  switchTab(shot.tab);
  go("shot");
}

/** The finished takes, in board order, into a new edit in Cut. */
export async function sendToCut() {
  const b = body();
  const takes = b.board.shots.map(takeOf).filter((r) => r?.status === "done");
  if (!takes.length) return toast("No shot is rolled yet.");
  const { cutFromTakes } = await import("./cut.js");
  go("cut");
  await cutFromTakes(b.idea.title || story.project.name, takes.map((r) => r.id));
  toast(`${takes.length} of ${b.board.shots.length} shots in Cut, in board order.`);
}

// ---------------------------------------------------------------- editing in place

export function addShot(scene, after) {
  const b = body();
  const inScene = b.board.shots.filter((s) => s.scene === scene);
  const at = after ? b.board.shots.indexOf(after) + 1 : b.board.shots.lastIndexOf(inScene.at(-1)) + 1 || b.board.shots.length;
  const shot = { id: uid(), scene, code: "", size: "medium", camera: "locked", seconds: 5, action: "", frame: "", line: null, sound: "", photo: null, run: null, tab: null };
  b.board.shots.splice(at, 0, shot);
  recode(b);
  story.selected = shot.id;
  touch();
}
export function removeShot(id) {
  const b = body();
  b.board.shots = b.board.shots.filter((s) => s.id !== id);
  recode(b);
  if (story.selected === id) story.selected = b.board.shots[0]?.id ?? null;
  touch();
}
export function moveShot(id, to) {
  const b = body();
  const from = b.board.shots.findIndex((s) => s.id === id);
  if (from < 0) return;
  const [shot] = b.board.shots.splice(from, 1);
  const target = b.board.shots[Math.min(to, b.board.shots.length)];
  if (target) shot.scene = target.scene;
  b.board.shots.splice(Math.min(to, b.board.shots.length), 0, shot);
  recode(b);
  touch();
}
/** Shot codes follow their scene and their place in it: 1A, 1B, 2A… */
function recode(b) {
  const count = {};
  for (const s of b.board.shots) {
    count[s.scene] = (count[s.scene] ?? 0) + 1;
    s.code = `${s.scene}${String.fromCharCode(64 + count[s.scene])}`;
  }
}
export function selectShot(id) {
  story.selected = id;
  update();
}
