// Story: the producer's desk. One story is one document that builds up top to bottom: the idea
// (title, logline, synopsis), the bible (the cast, places, props and look, each called by an
// @tag, with its sheets), and the script, a list of blocks: scenes, actions, lines, shots, notes.
// Click a block and the story assistant, who has the whole story in mind, edits it. The shots
// feed Stage (blocked from their words), Shot (prompts and frames) and Cut (an edit in order).
// Stories are kept on the server, one per tab, with undo.

import { state, changed, toast, drawPicture, rollAsTab, switchTab, sheetOf, writer, artistFor, videoModel } from "./store.js";
import { expandTags } from "./pills.js";
import { go } from "./router.js";

// the Stage's colours, so a character reads the same everywhere
const COLORS = ["#e8584f", "#3fc6c0", "#f0a63a", "#8d7cf2", "#5fbf6a", "#e97fb4", "#4f8de8", "#c9a27a"];
export const SIZES = [["wide", "Wide"], ["medium", "Medium"], ["close", "Close"], ["ots", "OTS"]];
export const KINDS = [["scene", "Scene"], ["action", "Action"], ["line", "Line"], ["shot", "Shot"], ["note", "Note"]];
export const BIBLE = [["cast", "Cast", "character"], ["places", "Places", "place"], ["props", "Props", "prop"]];
const SIZE_WORDS = { wide: "A wide shot", medium: "A medium shot", close: "A close-up", ots: "An over-the-shoulder shot" };
const TABS = "comfyture.story.tabs";
const LAST = "comfyture.story.last";

export const story = { list: [], tabs: [], project: null, busy: new Set(), selected: null, ready: null, error: null, chat: { messages: [] }, history: [], future: [], last: "" };
const body = () => story.project?.body;
const read = (k) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const keepLocal = (k, v) => {
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
const update = () => changed("story", "nav", "assistant", "home");
/** A redraw of the story's screen, with nothing changed. */
export const refresh = () => update();
const lower = (t) => String(t ?? "").trim().replace(/[.;]+$/, "").replace(/^(A|An|The) /, (m) => m.toLowerCase());

/** A new block of a kind, empty but whole. */
export function newBlock(kind, fields = {}) {
  const base = { scene: { slug: "INT. NEW PLACE — DAY", summary: "", place: "" }, action: { text: "" }, line: { who: "", text: "", how: "" }, shot: { size: "medium", camera: "locked", seconds: 5, action: "", frame: "", line: null, sound: "", photo: null, still: null, run: null, tab: null }, note: { text: "" } }[kind] ?? { text: "" };
  return { id: uid(), kind, ...base, ...fields };
}
const ref = (kind, x, i) => ({ id: x.id ?? uid(), name: x.name ?? "", tag: x.tag ?? tagOf(x.name), about: x.about ?? "", words: x.words ?? "", refs: x.refs ?? [], ...(kind === "cast" ? { color: x.color ?? COLORS[i % COLORS.length] } : {}) });

/** A story's body with every part in place; one written as steps (scenes and a board) becomes blocks. */
function normalize(b = {}) {
  const out = {
    v: 2,
    // refs: the user's references for the film (pictures, videos with a still), shown to the writers on one sheet
    idea: { brief: "", length: 60, aspect: "16:9", genre: "", tone: "", title: "", logline: "", synopsis: "", refs: [], ...b.idea },
    cast: (b.cast ?? []).map((c, i) => ref("cast", c, i)),
    places: (b.places ?? []).map((p, i) => ref("places", p, i)),
    props: (b.props ?? []).map((p, i) => ref("props", p, i)),
    look: { words: "", palette: [], refs: [], ...b.look },
    style: b.style ?? b.board?.style ?? "sketch",
    blocks: (b.blocks ?? []).map((x) => ({ ...newBlock(x.kind ?? "note"), ...x })),
  };
  if (!b.blocks && (b.script?.scenes?.length || b.board?.shots?.length)) {
    const placeTag = (name) => out.places.find((p) => p.name.toLowerCase() === String(name ?? "").toLowerCase())?.tag ?? "";
    (b.script?.scenes ?? []).forEach((s, i) => {
      out.blocks.push(newBlock("scene", { slug: s.slug, summary: s.summary, place: placeTag(s.place) }));
      for (const beat of s.beats ?? []) out.blocks.push(newBlock("action", { text: beat }));
      for (const l of s.lines ?? []) out.blocks.push(newBlock("line", { who: l.who, text: l.line, how: l.how }));
      for (const shot of (b.board?.shots ?? []).filter((x) => x.scene === i + 1)) out.blocks.push(newBlock("shot", { ...shot, id: shot.id ?? uid() }));
    });
  }
  return out;
}

// ---------------------------------------------------------------- reading the script

/** The scenes in order, each with its blocks after it (blocks before the first scene come in scene 0). */
export function scenesOf(b = body()) {
  const out = [{ scene: null, n: 0, blocks: [] }];
  for (const x of b?.blocks ?? []) {
    if (x.kind === "scene") out.push({ scene: x, n: out.length, blocks: [] });
    else out.at(-1).blocks.push(x);
  }
  return out.filter((s) => s.scene || s.blocks.length);
}
/** Every shot, in order, with its code (1A, 1B, 2A…) and its scene. */
export function shotsOf(b = body()) {
  const out = [];
  for (const s of scenesOf(b)) {
    let k = 0;
    for (const x of s.blocks) if (x.kind === "shot") out.push({ block: x, scene: s, code: `${s.n || 0}${String.fromCharCode(65 + k++)}` });
  }
  return out;
}
export const codeOf = (id, b = body()) => shotsOf(b).find((s) => s.block.id === id)?.code ?? "";
export const blockOf = (id, b = body()) => b?.blocks.find((x) => x.id === id) ?? null;
/** Everyone and everything in the bible, by @tag. */
export const bible = (b = body()) => [...(b?.cast ?? []).map((x) => ({ ...x, kind: "cast", person: true })), ...(b?.places ?? []).map((x) => ({ ...x, kind: "places", person: false })), ...(b?.props ?? []).map((x) => ({ ...x, kind: "props", person: false }))];
export function speaker(b, who) {
  const w = String(who ?? "").trim().replace(/^@/, "").toLowerCase();
  return (b?.cast ?? []).find((c) => c.name.toLowerCase() === w || c.tag === w) ?? null;
}
/** Who and what a text's @tags call, from the bible. */
export function castOf(b, text) {
  const tags = new Set([...String(text ?? "").matchAll(/@([a-z0-9][a-z0-9-]*)/gi)].map((m) => m[1].toLowerCase()));
  return bible(b).filter((x) => tags.has(x.tag));
}
/** What @name stands for in the open story, for pills and their cards. */
export function storyLookup(name) {
  const x = bible(body()).find((r) => r.tag === name);
  return x ? { title: x.name, color: x.color, url: x.refs[0]?.url, pictures: x.refs, words: x.words || x.about } : null;
}
/** A short name for what is selected, as the bar shows it. */
export function selectionLabel(sel = story.selected) {
  const b = body();
  if (!sel || !b) return "";
  if (sel.kind === "idea") return "The idea";
  if (sel.kind === "look") return "The look";
  if (sel.kind === "cast" || sel.kind === "places" || sel.kind === "props") return `@${bible(b).find((x) => x.id === sel.id)?.tag ?? ""}`;
  const x = blockOf(sel.id);
  if (!x) return "";
  const s = scenesOf(b).find((sc) => sc.scene === x || sc.blocks.includes(x));
  if (x.kind === "scene") return `Scene ${s?.n}`;
  if (x.kind === "shot") return `Shot ${codeOf(x.id)}`;
  return `Scene ${s?.n ?? 0} · ${x.kind} ${(s?.blocks.filter((y) => y.kind === x.kind).indexOf(x) ?? 0) + 1}`;
}

// ---------------------------------------------------------------- keeping it, with undo

let saveTimer = 0;
/** A change: noted for undo, drawn, and kept a moment later. */
/** A change made: an undo step (when it changed anything), a redraw, and a save soon after. */
export function commit({ history = true } = {}) {
  if (!body()) return;
  const now = JSON.stringify(body());
  if (history && now !== story.last) {
    story.history.push(story.last);
    if (story.history.length > 80) story.history.shift();
    story.future = [];
  }
  story.last = now;
  touch();
}
/** A save soon; quiet while typing, so the field being written in stays as it is. */
export function touch({ now = false, quiet = false } = {}) {
  clearTimeout(saveTimer);
  if (!quiet) update();
  if (!story.project) return;
  const p = story.project;
  const keep = async () => {
    const b = p.body;
    const thumb = b.blocks.find((x) => x.kind === "shot" && x.photo)?.photo?.url ?? b.look.refs?.[0]?.url ?? b.cast.find((c) => c.refs[0])?.refs[0].url ?? b.places.find((x) => x.refs[0])?.refs[0].url;
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
export function undo() {
  const prev = story.history.pop();
  if (prev === undefined || !story.project) return;
  story.future.push(JSON.stringify(body()));
  story.project.body = normalize(JSON.parse(prev));
  story.last = prev;
  touch();
}
export function redo() {
  const next = story.future.pop();
  if (next === undefined || !story.project) return;
  story.history.push(JSON.stringify(body()));
  story.project.body = normalize(JSON.parse(next));
  story.last = next;
  touch();
}

// ---------------------------------------------------------------- projects

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
  story.history = [];
  story.future = [];
  story.chat = { messages: [] };
  story.last = JSON.stringify(project.body);
  if (!story.tabs.includes(id)) story.tabs.push(id);
  keepLocal(TABS, JSON.stringify(story.tabs));
  keepLocal(LAST, id);
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
  keepLocal(TABS, JSON.stringify(story.tabs));
  if (story.project?.id === id) return story.tabs[0] ? openStory(story.tabs[0]) : newStory();
  update();
}
export async function deleteStory(id = story.project?.id) {
  if (!id) return;
  const { stories } = await call(`api/stories/${id}`, { method: "DELETE" });
  story.list = stories;
  return closeStory(id);
}

// ---------------------------------------------------------------- editing the document

export function select(kind, id) {
  story.selected = kind ? { kind, id } : null;
  update();
}
export function addBlock(kind, afterId, fields = {}) {
  const b = body();
  const x = newBlock(kind, fields);
  // a line is said by the first character unless said otherwise
  if (kind === "line" && !x.who && b.cast[0]) x.who = b.cast[0].name;
  const at = afterId === "start" ? 0 : afterId ? b.blocks.findIndex((y) => y.id === afterId) + 1 : b.blocks.length;
  b.blocks.splice(at <= 0 && afterId !== "start" ? b.blocks.length : at, 0, x);
  story.selected = { kind: "block", id: x.id };
  commit();
  return x;
}
export function updateBlock(id, patch, { history = true } = {}) {
  const x = blockOf(id);
  if (!x) return;
  Object.assign(x, patch);
  commit({ history });
}
export function removeBlock(id) {
  const b = body();
  b.blocks = b.blocks.filter((x) => x.id !== id);
  if (story.selected?.id === id) story.selected = null;
  commit();
}
export function moveBlock(id, step) {
  const b = body();
  const i = b.blocks.findIndex((x) => x.id === id);
  const j = i + step;
  if (i < 0 || j < 0 || j >= b.blocks.length) return;
  [b.blocks[i], b.blocks[j]] = [b.blocks[j], b.blocks[i]];
  commit();
}
/** A new character, place or prop in the bible, with a tag of its own. */
export function addRef(kind, name) {
  const b = body();
  const label = name ?? { cast: "New character", places: "New place", props: "New prop" }[kind];
  const x = ref(kind, { name: label }, b[kind].length);
  b[kind].push(x);
  unique(b);
  story.selected = { kind, id: x.id };
  commit();
  return x;
}
export function updateRef(kind, id, patch) {
  const x = body()?.[kind]?.find((r) => r.id === id);
  if (!x) return;
  Object.assign(x, patch);
  if (patch.name !== undefined) {
    // the tag follows the name, and every @tag in the script with it
    const old = x.tag;
    x.tag = tagOf(x.name);
    unique(body());
    if (old && old !== x.tag) retag(old, x.tag);
  }
  commit();
}
export function removeRef(kind, id) {
  const b = body();
  b[kind] = b[kind].filter((r) => r.id !== id);
  if (story.selected?.id === id) story.selected = null;
  commit();
}
/** Every @old in the script becomes @new. */
function retag(old, now) {
  const re = new RegExp(`@${old.replace(/-/g, "\\-")}(?![a-z0-9-])`, "gi");
  for (const x of body().blocks) for (const k of ["text", "summary", "frame", "action", "sound"]) if (typeof x[k] === "string") x[k] = x[k].replace(re, `@${now}`);
  for (const x of body().blocks) if (x.kind === "scene" && x.place === old) x.place = now;
}
/** Every tag once: two characters called Sam become @sam and @sam-2. */
function unique(b) {
  const seen = new Set();
  for (const x of [...b.cast, ...b.places, ...b.props]) {
    let t = x.tag || tagOf(x.name);
    for (let i = 2; seen.has(t); i++) t = `${tagOf(x.name)}-${i}`;
    seen.add(t);
    x.tag = t;
  }
}

// ---------------------------------------------------------------- writing it (with the writer picked on the bar)

/** What the step writers read: the story as scenes (with their beats and lines) and shots. */
function payload(b) {
  const names = bible(b).map((r) => ({ tag: r.tag, name: r.name }));
  const scenes = scenesOf(b).filter((s) => s.scene).map((s) => ({
    slug: s.scene.slug, summary: expandTags(s.scene.summary, names), place: bible(b).find((x) => x.tag === s.scene.place)?.name ?? "",
    beats: s.blocks.filter((x) => x.kind === "action").map((x) => expandTags(x.text, names)),
    lines: s.blocks.filter((x) => x.kind === "line").map((x) => ({ who: x.who, line: x.text, how: x.how })),
  }));
  const strip = (x) => ({ name: x.name, tag: x.tag, about: x.about, words: x.words });
  return { idea: b.idea, cast: b.cast.map(strip), places: b.places.map(strip), props: b.props.map(strip), look: { words: b.look.words, palette: b.look.palette }, script: { scenes }, board: { shots: shotsOf(b).map((s) => ({ ...s.block, photo: undefined, still: undefined, scene: s.scene.n })) } };
}

/** The user's references on one labelled sheet for the writers, made again only when they change. */
async function refSheet(b) {
  const refs = (b.idea.refs ?? []).filter((r) => r.kind === "video" ? r.still?.url : r.url).slice(0, 9);
  if (!refs.length) return null;
  const key = refs.map((r) => r.file).join(",");
  if (b.idea.sheet?.key === key) return b.idea.sheet;
  const photo = await sheetOf(refs.map((r) => ({ name: r.name, url: r.kind === "video" ? r.still.url : r.url })), 9);
  b.idea.sheet = { file: photo.file, url: photo.url, key };
  return b.idea.sheet;
}

/** A part of the story written from what is above it: the idea, the script, the bible's words, the shots. */
export async function write(step, { only } = {}) {
  const b = body();
  if (!b || story.busy.has(step)) return;
  if (step === "idea" && !b.idea.brief.trim()) return toast("Say what the film is about first: a sentence is enough.");
  if (step !== "idea" && !b.idea.logline) return toast("Write the idea first: the script grows from its logline.");
  if ((step === "world" || step === "board") && !scenesOf(b).some((s) => s.scene)) return toast("Write the script first.");
  story.busy.add(step);
  update();
  try {
    const one = only && scenesOf(b).find((s) => s.scene?.id === only)?.n;
    const sheet = step === "board" ? null : await refSheet(b).catch(() => null);
    const out = await send("api/story/write", "POST", { step, model: writer(), story: payload(b), only: one, sheet: sheet?.file });
    if (step === "idea") Object.assign(b.idea, out);
    if (step === "script") {
      // the cast and places it names, keeping what each one had (words, pictures, colour)
      const keep = (kind, fresh) => fresh.map((f, i) => {
        const was = b[kind].find((o) => o.name.toLowerCase() === f.name.toLowerCase());
        return was ? { ...was, about: f.about } : ref(kind, { name: f.name, about: f.about }, b[kind].length + i);
      });
      b.cast = keep("cast", out.cast);
      b.places = keep("places", out.places);
      unique(b);
      pictureFromRef(b, "cast", out.cast);
      pictureFromRef(b, "places", out.places);
      const placeTag = (name) => b.places.find((p) => p.name.toLowerCase() === String(name ?? "").toLowerCase())?.tag ?? "";
      // names in the script become pills: "Mara kneels" reads "@mara kneels"
      const known = bible(b).filter((x) => x.name.length > 1);
      const pattern = known.length ? new RegExp(`(^|[^@\\w])(${known.map((x) => x.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "g") : null;
      const named = (t) => (pattern ? String(t ?? "").replace(pattern, (m, pre, name) => `${pre}@${known.find((x) => x.name === name)?.tag ?? name}`) : String(t ?? ""));
      b.blocks = out.scenes.flatMap((s) => [
        newBlock("scene", { slug: s.slug, summary: named(s.summary), place: placeTag(s.place) }),
        ...s.beats.map((t) => newBlock("action", { text: named(t) })),
        ...s.lines.map((l) => newBlock("line", { who: l.who, text: l.line, how: l.how })),
      ]);
      story.selected = null;
    }
    if (step === "world") {
      for (const [kind, list] of [["cast", out.cast], ["places", out.places], ["props", out.props ?? []]]) {
        for (const x of list) {
          const was = b[kind].find((y) => y.name.toLowerCase() === x.name.toLowerCase());
          if (was) was.words = x.words;
          else if (kind !== "places") b[kind].push(ref(kind, { name: x.name, words: x.words }, b[kind].length));
        }
      }
      unique(b);
      for (const kind of ["cast", "places", "props"]) pictureFromRef(b, kind, out[kind] ?? []);
      b.look.words = out.look.words || b.look.words;
      if (out.look.palette.length) b.look.palette = out.look.palette;
    }
    if (step === "board") {
      // shots for each scene that has none yet (or for one scene only); the rest stays as it is
      for (const s of scenesOf(b).filter((x) => x.scene)) {
        if (only ? s.scene.id !== only : s.blocks.some((x) => x.kind === "shot")) continue;
        // boarding one scene, every shot that came is its
        const shots = out.shots.filter((x) => one || x.scene === s.n);
        const last = s.blocks.at(-1) ?? s.scene;
        const at = b.blocks.indexOf(last) + 1;
        b.blocks.splice(at, 0, ...shots.map((x) => newBlock("shot", { size: x.size, camera: x.camera, seconds: x.seconds, action: x.action, frame: x.frame, line: x.line, sound: x.sound })));
      }
    }
    commit();
  } catch (e) {
    toast(e.message, { tone: "crit" });
  } finally {
    story.busy.delete(step);
    update();
  }
}

/** The user's own reference pictures on whom they show, as the writer named them: a sheet to draw them from. */
function pictureFromRef(b, kind, answers) {
  for (const a of answers) {
    const r = a.ref && (b.idea.refs ?? []).find((x) => x.name === a.ref);
    const item = r && b[kind].find((x) => x.name.toLowerCase() === a.name.toLowerCase());
    const pic = r && (r.kind === "video" ? r.still : r);
    if (!item || !pic?.url || item.refs.some((x) => x.file === pic.file)) continue;
    item.refs = [{ file: pic.file, url: pic.url, width: pic.width, height: pic.height }, ...item.refs].slice(0, 6);
  }
}

/** From a brief to a whole draft: the idea, then the script, then the bible's words. */
export async function writeAll() {
  await write("idea");
  if (!body()?.idea.logline) return;
  await write("script");
  if (scenesOf().some((s) => s.scene)) await write("world");
}

/**
 * A story started from a take picked on Home: its idea is written and its moodboard is its look. The
 * script and the world are written from it, the take's hero and place keeping their pictures.
 */
export async function writeTake(take) {
  await write("script");
  const b = body();
  if (!b || !scenesOf(b).some((s) => s.scene)) return;
  const first = (v) => String(v ?? "").toLowerCase().split(/\s+/)[0];
  const find = (list, name) => name && (list.find((x) => x.name.toLowerCase() === name.toLowerCase()) ?? list.find((x) => first(x.name) === first(name)));
  const hero = find(b.cast, take.hero?.name);
  if (hero && take.frames?.hero?.url && !hero.refs.length) addRefPicture("cast", hero.id, take.frames.hero);
  const place = find(b.places, take.place?.name);
  if (place && take.frames?.place?.url && !place.refs.length) addRefPicture("places", place.id, take.frames.place);
  await write("world");
}

// ---------------------------------------------------------------- the story assistant

/** The words on the bar: the assistant, with the whole story in mind, edits what is selected. */
export async function askStory(text) {
  const b = body();
  const words = text.trim();
  if (!b || !words || story.busy.has("assist")) return;
  story.chat.messages.push({ role: "user", text: words, about: selectionLabel() });
  story.busy.add("assist");
  update();
  try {
    // every block gets a short id the assistant can name
    const sid = new Map(b.blocks.map((x, i) => [x.id, `b${i + 1}`]));
    const back = new Map([...sid].map(([k, v]) => [v, k]));
    const sel = story.selected;
    let selected = null;
    if (sel?.kind === "block" && sid.has(sel.id)) {
      const x = blockOf(sel.id);
      selected = `[${sid.get(sel.id)}] the ${x.kind}${x.kind === "shot" ? ` ${codeOf(x.id)}` : ""}: ${String(x.text || x.summary || x.action || x.slug || "").slice(0, 200)}`;
    } else if (sel) selected = selectionLabel(sel);
    const st = payload(b);
    const out = await send("api/story/assist", "POST", { model: writer(), story: { ...st, blocks: b.blocks.map((x) => ({ ...x, sid: sid.get(x.id), photo: undefined, still: undefined })) }, selected, messages: story.chat.messages.slice(-8).map((m) => ({ role: m.role, text: m.text })) });
    const did = apply(out.ops, back);
    story.chat.messages.push({ role: "assistant", text: out.reply || (did.length ? "Done." : "Nothing to change."), did });
  } catch (e) {
    story.chat.messages.push({ role: "assistant", text: e.message, error: true });
  } finally {
    story.busy.delete("assist");
    update();
  }
}

/** The assistant's edits, as one undo step; the block it last touched is selected after. */
function apply(ops, back) {
  const b = body();
  const did = [];
  let last = null;
  // inserts after the same block follow one another, in the order they came
  let chain = null;
  const cap = (k) => `${k[0].toUpperCase()}${k.slice(1)}`;
  for (const o of ops ?? []) {
    if (o.op === "update") {
      const x = blockOf(back.get(o.id) ?? o.id);
      if (!x) continue;
      Object.assign(x, o.set);
      last = x;
      did.push(`${x.kind === "shot" ? `Shot ${codeOf(x.id)}` : cap(x.kind)} changed`);
    } else if (o.op === "insert") {
      // after a block it names; failing that, after what is picked, or at the end
      const at = (id) => b.blocks.findIndex((x) => x.id === id);
      let after = chain?.after === o.after ? at(chain.id) : o.after === "start" ? -1 : o.after === "end" ? b.blocks.length - 1 : at(back.get(o.after) ?? o.after);
      if (after < 0 && o.after !== "start") after = last ? at(last.id) : story.selected?.kind === "block" && at(story.selected.id) >= 0 ? at(story.selected.id) : b.blocks.length - 1;
      // a scene "after scene 2" goes after scene 2's last block, not between its head and its blocks
      if (o.block.kind === "scene" && b.blocks[after]?.kind === "scene") while (after + 1 < b.blocks.length && b.blocks[after + 1].kind !== "scene") after++;
      const x = newBlock(o.block.kind, o.block);
      b.blocks.splice(after + 1, 0, x);
      chain = { after: o.after, id: x.id };
      last = x;
      did.push(`${cap(o.block.kind)} added`);
    } else if (o.op === "remove") {
      const id = back.get(o.id) ?? o.id;
      if (!blockOf(id)) continue;
      b.blocks = b.blocks.filter((x) => x.id !== id);
      did.push("Block removed");
    } else if (o.op === "idea") {
      Object.assign(b.idea, Object.fromEntries(Object.entries(o.set).filter(([k]) => ["title", "logline", "synopsis", "genre", "tone"].includes(k))));
      did.push("Idea changed");
    } else if (o.op === "bible") {
      const kind = o.kind === "place" ? "places" : o.kind === "prop" ? "props" : "cast";
      let x = b[kind].find((y) => y.name.toLowerCase() === o.name.toLowerCase() || y.tag === tagOf(o.name));
      if (!x) {
        x = ref(kind, { name: o.name }, b[kind].length);
        b[kind].push(x);
        unique(b);
      }
      for (const k of ["words", "about"]) if (o.set[k] !== undefined) x[k] = o.set[k];
      did.push(`@${x.tag}`);
    }
  }
  if (did.length) {
    if (last) story.selected = { kind: "block", id: last.id };
    commit();
  }
  return did;
}

// ---------------------------------------------------------------- pictures: sheets, places, props, the look, frames

const lookWords = (b) => (b.look.words ? ` In the film's look: ${lower(b.look.words)}.` : "");
const refList = (kind) => (kind === "look" ? null : body()?.[kind]);

/** A picture for the bible: a character's three views, a place with nobody in it, a prop alone, a frame of the look. */
export async function drawRef(kind, id) {
  const b = body();
  const item = kind === "look" ? b.look : refList(kind)?.find((x) => x.id === id);
  if (!item) return;
  const key = `ref:${kind}:${id ?? "look"}`;
  if (story.busy.has(key)) return;
  const prompt = kind === "cast"
    ? `A character sheet of ${item.name}, ${lower(item.words || item.about) || "a character"}. Three full-length views side by side: front, three-quarter and back, standing in a relaxed neutral pose, the same face, hair and clothes in every view. Plain light grey background, soft even studio light.${lookWords(b)}`
    : kind === "places"
    ? `${item.words || item.about || item.name}. A cinematic establishing shot of ${item.name}, with nobody in it.${lookWords(b)}`
    : kind === "props"
    ? `${item.name}, ${lower(item.words || item.about) || "an object"}: the object alone, three-quarter view, on a plain light grey background, soft studio light.${lookWords(b)}`
    : `A still from the film "${b.idea.title || "Untitled"}": ${lower(b.idea.logline) || "its key moment"}.${lookWords(b)}`;
  story.busy.add(key);
  update();
  try {
    const photo = await drawPicture({ model: artistFor("generate"), template: "generate", prompt, aspect: kind === "cast" ? "16:9" : kind === "props" ? "1:1" : b.idea.aspect });
    item.refs = [...(item.refs ?? []), { file: photo.file, url: photo.url, width: photo.width, height: photo.height }].slice(-6);
    commit();
  } catch (e) {
    toast(e.message, { tone: "crit" });
  } finally {
    story.busy.delete(key);
    update();
  }
}
export function addRefPicture(kind, id, photo) {
  const item = kind === "look" ? body().look : refList(kind)?.find((x) => x.id === id);
  if (!item || !photo?.file || item.refs.some((r) => r.file === photo.file)) return;
  item.refs = [...item.refs, { file: photo.file, url: photo.url, width: photo.width, height: photo.height }].slice(-6);
  commit();
}
export function removeRefPicture(kind, id, file) {
  const item = kind === "look" ? body().look : refList(kind)?.find((x) => x.id === id);
  if (!item) return;
  item.refs = item.refs.filter((r) => r.file !== file);
  commit();
}
export const drawMissingRefs = () => {
  const b = body();
  if (!b) return;
  return Promise.allSettled([
    ...b.cast.filter((x) => !x.refs.length).map((x) => drawRef("cast", x.id)),
    ...b.places.filter((x) => !x.refs.length).map((x) => drawRef("places", x.id)),
    ...b.props.filter((x) => !x.refs.length).map((x) => drawRef("props", x.id)),
    ...(b.look.refs.length || !b.look.words ? [] : [drawRef("look")]),
  ]);
};

/** A shot's first frame: drawn from its words with the sheets of who and what it shows, as a sketch or a film frame. */
export async function drawShot(id) {
  const b = body();
  const shot = blockOf(id);
  const key = `shot:${id}`;
  if (!shot || story.busy.has(key)) return;
  const members = castOf(b, `${shot.frame} ${shot.action}`);
  const pictured = members.filter((m) => m.refs?.length).slice(0, 6);
  const refs = pictured.map((m) => ({ file: m.refs[0].file, name: m.tag }));
  const cast = members.map((m) => ({ tag: m.tag, name: m.name, person: m.person, words: lower(m.words || m.about), pictures: pictured.includes(m) ? [m.tag] : [] }));
  const style = b.style === "sketch" ? "A storyboard panel: a loose graphite pencil sketch in grey tones on white paper, clear shapes and strong composition, no text." : `A cinematic film still.${lookWords(b)}`;
  const prompt = `${style} ${SIZE_WORDS[shot.size] ?? "A shot"}: ${expandTags(shot.frame || shot.action, cast)}.`.replace(/\.\.$/, ".");
  story.busy.add(key);
  update();
  try {
    const photo = await drawPicture({ model: artistFor(refs.length ? "edit" : "generate"), template: refs.length ? "edit" : "generate", prompt, aspect: b.idea.aspect, refs });
    shot.photo = { file: photo.file, url: photo.url, width: photo.width, height: photo.height };
    shot.drawnAs = b.style;
    shot.still = null;
    commit({ history: false });
  } catch (e) {
    toast(`${codeOf(id)}: ${e.message}`, { tone: "crit" });
  } finally {
    story.busy.delete(key);
    update();
  }
}
export const drawMissingShots = () => Promise.allSettled(shotsOf().filter((s) => !s.block.photo).map((s) => drawShot(s.block.id)));

// ---------------------------------------------------------------- production: Stage, Shot, Cut

/** A shot as the video model reads it: what happens, the camera, the line and the sound, names in plain words. */
function shotSpec(b, shot) {
  const names = bible(b).map((x) => ({ tag: x.tag, name: x.name }));
  const plain = (t) => expandTags(String(t ?? ""), names);
  const who = shot.line ? speaker(b, shot.line.who) : null;
  return { action: plain(shot.action), camera: shot.camera, framing: "", sound: plain(shot.sound), dialogue: shot.line?.text ? [{ speaker: who ? `${who.name}, ${lower(who.words || who.about) || "the speaker"}` : shot.line.who, line: shot.line.text }] : [] };
}

/** A sketched frame turned into a film frame (once): a take starts from a picture of the film, not a drawing. */
async function filmFrame(b, shot) {
  if (!shot.photo) await drawShot(shot.id);
  if (!shot.photo) throw new Error("Its frame isn't drawn.");
  if (shot.drawnAs !== "sketch") return shot.photo;
  if (shot.still) return shot.still;
  const members = castOf(b, shot.frame).filter((m) => m.refs?.length).slice(0, 5);
  const cast = castOf(b, shot.frame).map((m) => ({ tag: m.tag, name: m.name, person: m.person, words: lower(m.words || m.about), pictures: members.includes(m) ? [m.tag] : [] }));
  const prompt = `Turn @sketch, a storyboard panel, into a finished cinematic film still: the same framing, the same places and poses, real people and places with real light. ${expandTags(shot.frame || shot.action, cast)}.${lookWords(b)}`;
  const photo = await drawPicture({ model: artistFor("edit"), template: "edit", prompt, aspect: b.idea.aspect, refs: [{ file: shot.photo.file, name: "sketch" }, ...members.map((m) => ({ file: m.refs[0].file, name: m.tag }))] });
  shot.still = { file: photo.file, url: photo.url, width: photo.width, height: photo.height };
  commit({ history: false });
  return shot.still;
}

/** A shot's take: rolled with LTX-2.5 in a Shot tab of its own, from a film frame of its drawing. */
export async function rollShot(id) {
  const b = body();
  const shot = blockOf(id);
  const key = `roll:${id}`;
  if (!shot || story.busy.has(key)) return;
  story.busy.add(key);
  update();
  try {
    const first = await filmFrame(b, shot);
    const r = await rollAsTab({ tab: shot.tab, name: `${codeOf(id)} · ${b.idea.title || story.project.name}`.slice(0, 60), group: b.idea.title || story.project.name, project: story.project.id, start: first, shot: shotSpec(b, shot), seconds: shot.seconds, aspect: b.idea.aspect, model: videoModel() });
    shot.tab = r.tab;
    shot.run = r.run;
    commit({ history: false });
    r.done.then((done) => ((shot.run = done.id), commit({ history: false }))).catch((e) => toast(`${codeOf(id)}: ${e.message}`, { tone: "crit" })).finally(update);
  } catch (e) {
    toast(`${codeOf(id)}: ${e.message}`, { tone: "crit" });
  } finally {
    story.busy.delete(key);
    update();
  }
}
export const rollMissingShots = () => Promise.allSettled(shotsOf().filter((s) => !takeOf(s.block) || takeOf(s.block).status === "failed").map((s) => rollShot(s.block.id)));
export const takeOf = (shot) => (shot?.run ? state.runs.find((r) => r.id === shot.run) ?? null : null);

/** A shot opened in Shot to craft it there (its frame, its words, its line), without rolling it. */
export async function openInShot(id) {
  const b = body();
  const shot = blockOf(id);
  if (!shot) return;
  if (shot.tab && state.tabs.some((t) => t.id === shot.tab)) {
    switchTab(shot.tab);
    return go("shot");
  }
  const key = `open:${id}`;
  if (story.busy.has(key)) return;
  story.busy.add(key);
  update();
  try {
    // a sketch is turned into a film still first: the video model starts from a real picture
    const first = shot.photo ? await filmFrame(b, shot) : null;
    const { openStoryShot } = await import("./store.js");
    shot.tab = openStoryShot({ name: `${codeOf(id)} · ${b.idea.title || story.project.name}`.slice(0, 60), group: b.idea.title || story.project.name, project: story.project.id, start: first, shot: shotSpec(b, shot), seconds: shot.seconds, aspect: b.idea.aspect });
    commit({ history: false });
    go("shot");
  } catch (e) {
    toast(e.message, { tone: "crit" });
  } finally {
    story.busy.delete(key);
    update();
  }
}

/** A shot blocked on the Stage, a stage of its own: the Stage's assistant stages what it shows. */
export async function stageShot(id) {
  const b = body();
  const shot = blockOf(id);
  if (!shot) return;
  const { stageReady } = await import("./control/link.js");
  const { askStage } = await import("./store.js");
  go("stage");
  const { projects } = await stageReady;
  await projects?.newProject(`${b.idea.title || story.project.name} — ${codeOf(id)}`.slice(0, 60), { project: story.project.id }).catch(() => null);
  const names = bible(b).map((x) => ({ tag: x.tag, name: x.name }));
  const who = castOf(b, `${shot.frame} ${shot.action}`).filter((m) => m.person).map((m) => `${m.name} (${m.words || m.about})`).join("; ");
  const CAM = { locked: "locked", "push-in": "pushing in", "pull-out": "pulling out", orbit: "orbiting", "crane-up": "craning up", handheld: "handheld" };
  askStage(`New scene: ${expandTags(shot.action || shot.frame, names)}, ${shot.size} shot, camera ${CAM[shot.camera] ?? "locked"}.${who ? ` Cast: ${who}.` : ""} Frame ${b.idea.aspect}, ${shot.seconds} seconds.`);
}

/**
 * The story into Cut, in order: each shot's take, or its frame held for its length while it isn't
 * rolled (an animatic to cut against), the title at the head, each scene marked.
 */
export async function sendToCut() {
  const b = body();
  const shots = shotsOf(b);
  if (!shots.length) return toast("Add shots to the script first: a scene's Board key writes them.");
  const names = (t) => String(t ?? "").replace(/@([a-z0-9-]+)/gi, (_, tag) => bible(b).find((x) => x.tag === tag)?.name ?? tag);
  // each shot with its picture: its take once rolled, its frame until then
  const placed = shots.map(({ block, code, scene }) => {
    const take = takeOf(block);
    const name = `${code} · ${names(block.action || block.frame).slice(0, 40)}`;
    if (take?.status === "done") return { scene, clip: { src: { kind: "take", id: take.id }, name } };
    const pic = block.still ?? block.photo;
    return pic ? { scene, clip: { src: { kind: "photo", id: pic.file, url: pic.url, width: pic.width, height: pic.height, name }, length: block.seconds, name } } : null;
  }).filter(Boolean);
  const clips = placed.map((p) => p.clip);
  if (!clips.length) return toast("Draw or roll the shots first: Cut needs a picture for each.");
  const { newCut, cut, track, layout, commit: commitCut, loadCuts } = await import("./cut.js");
  go("cut");
  await (cut.ready ?? loadCuts());
  await newCut(b.idea.title || story.project.name, clips, { project: story.project.id });
  if (b.idea.title) track("t1").items.push({ id: uid(), text: b.idea.title.toUpperCase(), start: 0, length: 3, style: "center" });
  // each scene marked where its first shot starts
  const l = layout();
  cut.project.body.markers = scenesOf(b).filter((s) => s.scene).map((s) => {
    const first = placed.findIndex((x) => x.scene.scene?.id === s.scene.id);
    return first >= 0 && l[first] ? { t: l[first].start, label: s.scene.slug } : null;
  }).filter(Boolean);
  commitCut();
  const rolled = shots.filter((s) => takeOf(s.block)?.status === "done").length;
  const held = clips.length - rolled;
  const missing = shots.length - clips.length;
  toast(`${clips.length === 1 ? "1 shot" : `${clips.length} shots`} in Cut, in story order${held ? `: ${held} held as ${held === 1 ? "a frame" : "frames"} until rolled` : ""}${missing ? `; ${missing} not drawn yet` : ""}.`);
}
