// Cabinet: one of our characters (or anyone in a photo) dressed and posed, for a post, a story, a try-on or a photoshoot.
// A shoot keeps who, the outfits and poses picked, how the pictures are made, and the pictures made (the server's "cabinet"
// store). Each picture is one outfit in one pose: an image model's edit of three pictures, @character, @outfit and @pose.
import { api } from "./api.js";
import { state, changed, toast, jobWatchers, waitFor, artistFor } from "./store.js";
import { keyedSaver } from "./saving.js";
import { onServer, pictureOf } from "./picker.js";
import { characterById } from "./characters.js";
import { FORMATS, combos, shotPrompt, wardrobeItem, poseItem } from "./cabinet-shelf.js";

const KIND = "cabinet";
const OPEN = "comfyture.cabinet.open";
const MODEL = "comfyture.cabinet.model";

export const cabinet = {
  /** the shoots, newest first ({ id, name, updatedAt, thumb }), once asked */
  list: null,
  /** the shoot open: { id, name, body } */
  shoot: null,
  /** the image models that edit ({ default, models }) */
  models: null,
  /** the shelf shown (wardrobe or poses) and the group open on each */
  shelf: "wardrobe",
  group: { wardrobe: "all", poses: "all" },
  /** the picture shown large (its id) */
  shown: null,
  saving: "ok",
};

const remember = (k, v) => {
  try {
    v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v);
  } catch {}
};
const recall = (k) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const call = async (url, method = "GET", body) => {
  const res = await fetch(url, method === "GET" ? {} : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error ?? `${res.status} ${res.statusText}`);
  return out;
};
const draw = () => changed("cabinet");
const fail = (e) => toast(e.message, { tone: "crit" });

export const freshBody = (who = { kind: "character", id: "josie" }) => ({ who, outfits: [], poses: [], own: { outfits: [], poses: [] }, format: "post", backdrop: "studio", notes: "", pictures: [] });

// ---------------------------------------------------------------- who

/** Who the shoot dresses, said for the page and the prompt: { name, look, person, face, picture } (picture: a url). */
export function whoNow(body = cabinet.shoot?.body) {
  const w = body?.who;
  if (w?.kind === "photo" && w.photo) return { name: w.name || "them", look: "", person: true, face: w.photo.url, picture: w.photo.url };
  const c = characterById(w?.id) ?? characterById("josie");
  return { name: c.name, look: c.look, person: c.kind === "person", face: c.face, picture: c.picture, character: c };
}

/** A pick from the picture picker becomes who the shoot dresses (one of ours, or any picture). */
export async function setWho(choice) {
  const b = cabinet.shoot?.body;
  if (!b) return;
  // a shoot still called after who it dressed is called after who it dresses now
  const auto = cabinet.shoot.name.startsWith(`${whoNow(b).name}'s shoot`);
  if (choice.kind === "character") b.who = { kind: "character", id: choice.character.id };
  else {
    const photo = await pictureOf(choice);
    b.who = { kind: "photo", photo: { file: photo.file, url: photo.url, width: photo.width, height: photo.height }, name: (photo.name ?? "").slice(0, 24) || "Them" };
  }
  if (auto) cabinet.shoot.name = nameFor(whoNow(b), cabinet.shoot.id);
  save();
  draw();
}

// ---------------------------------------------------------------- what they wear, how they stand

/** An item of a shelf by its key: "shelf:<id>" (ours) or "own:<file>" (a picture added to this shoot). */
export function itemOf(kind, key) {
  if (!key) return null;
  const [from, id] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
  if (from === "shelf") return (kind === "outfits" ? wardrobeItem(id) : poseItem(id)) ?? null;
  const own = cabinet.shoot?.body.own?.[kind]?.find((p) => p.file === id);
  return own ? { id: key, name: own.name || (kind === "outfits" ? "Your outfit" : "Your pose"), words: "", src: own.url, thumb: own.url, own } : null;
}

/** Picks an outfit or a pose, or lets it go. */
export function toggle(kind, key) {
  const b = cabinet.shoot?.body;
  if (!b) return;
  const list = b[kind];
  const i = list.indexOf(key);
  if (i >= 0) list.splice(i, 1);
  else {
    if (list.length >= 4) return void toast(`Four ${kind === "outfits" ? "outfits" : "poses"} at most: let one go first.`, { tone: "warn" });
    list.push(key);
  }
  save();
  draw();
}

/** A picture of one's own (a download from a gallery, a photo of a garment, a pose photo) added to the shelf and picked. */
export async function addOwn(kind, choice) {
  const b = cabinet.shoot?.body;
  if (!b) return;
  const photo = await pictureOf(choice);
  b.own ??= { outfits: [], poses: [] };
  if (!b.own[kind].some((p) => p.file === photo.file)) b.own[kind].unshift({ file: photo.file, url: photo.url, width: photo.width, height: photo.height, name: (photo.name ?? "").slice(0, 24) });
  if (!b[kind].includes(`own:${photo.file}`) && b[kind].length < 4) b[kind].push(`own:${photo.file}`);
  save();
  draw();
}

export function removeOwn(kind, file) {
  const b = cabinet.shoot?.body;
  if (!b) return;
  b.own[kind] = b.own[kind].filter((p) => p.file !== file);
  b[kind] = b[kind].filter((k) => k !== `own:${file}`);
  save();
  draw();
}

export function set(field, value) {
  const b = cabinet.shoot?.body;
  if (!b) return;
  b[field] = value;
  save();
  if (field !== "notes") draw();
}

// ---------------------------------------------------------------- the model

export async function loadModels() {
  if (cabinet.models) return cabinet.models;
  const all = await api.imageModels().catch(() => ({ default: null, models: [] }));
  cabinet.models = { default: all.default, models: (all.models ?? []).filter((m) => m.templates?.some((t) => t.id === "edit")) };
  return cabinet.models;
}
/** GPT Image 2.5 Flare: about 3 credits a picture, and it dresses a whole character from a picture of an outfit. */
const FLARE = "gpt-image-2.5-flare";
/** The model that makes the pictures: the one chosen here, else GPT Flare (when Comfy Router offers it), else the app's artist. */
export function modelNow() {
  const list = cabinet.models?.models ?? [];
  const want = recall(MODEL) || (list.some((m) => m.id === FLARE) ? FLARE : artistFor("edit"));
  return list.find((m) => m.id === want) ?? list.find((m) => m.id === cabinet.models?.default) ?? list[0] ?? null;
}
export function setModel(id) {
  remember(MODEL, id);
  draw();
}
/** About what one press costs: { pictures, credits } (credits null for open weights, which cost GPU time). */
export function priceNow() {
  const b = cabinet.shoot?.body;
  const n = b ? combos(b.outfits, b.poses).length : 0;
  const m = modelNow();
  return { pictures: n, credits: m?.router ? Math.round(n * m.credits) : null };
}

// ---------------------------------------------------------------- the shoots

const saver = keyedSaver(600, async (id, shoot) => {
  const thumb = shoot.body.pictures.find((p) => p.photo)?.photo?.url;
  await call(`api/${KIND}/${id}`, "PUT", { name: shoot.name, body: shoot.body, ...(thumb ? { thumb } : {}) })
    .then(() => {
      const row = cabinet.list?.find((x) => x.id === id);
      if (row) Object.assign(row, { name: shoot.name, updatedAt: new Date().toISOString(), thumb: thumb ?? row.thumb });
      if (cabinet.shoot?.id === id) cabinet.saving = "ok";
    })
    .catch((e) => {
      if (cabinet.shoot?.id === id) cabinet.saving = "crit";
      fail(e);
    });
  // (only the lamp says it: the page is not drawn again for a save)
  const lamp = document.querySelector(".cab-saved");
  if (lamp && cabinet.shoot?.id === id) lamp.dataset.tone = cabinet.saving;
});
export function save(shoot = cabinet.shoot) {
  if (!shoot) return;
  cabinet.saving = "busy";
  saver.save(shoot.id, shoot);
}
addEventListener("pagehide", () => saver.flush());

/** The shoots, then the one last open (or a first one, made now). */
export async function loadCabinet() {
  cabinet.list ??= (await call(`api/${KIND}`)).cabinet ?? [];
  loadModels().then(draw);
  const last = recall(OPEN);
  const pick = cabinet.list.find((s) => s.id === last) ?? cabinet.list[0];
  if (pick) await openShoot(pick.id);
  else await newShoot();
}

function opened(project) {
  const body = { ...freshBody(), ...(project.body ?? {}) };
  body.own = { outfits: [], poses: [], ...(body.own ?? {}) };
  cabinet.shoot = { id: project.id, name: project.name, body };
  cabinet.shown = body.pictures[0]?.id ?? null;
  cabinet.saving = "ok";
  remember(OPEN, project.id);
  // pictures still being made when the page was left: followed again, or found finished (one never sent is said so)
  for (const p of body.pictures) {
    if (p.status !== "running") continue;
    if (p.id.startsWith("wait-")) Object.assign(p, { status: "failed", error: "The page was left before this picture was sent." });
    else follow(cabinet.shoot, p);
  }
}

export async function openShoot(id) {
  await saver.flush();
  opened((await call(`api/${KIND}/${id}`)).project);
  draw();
}

const nameFor = (who, self) => {
  const base = `${who.name}'s shoot`;
  const taken = new Set((cabinet.list ?? []).filter((s) => s.id !== self).map((s) => s.name));
  for (let i = 1; ; i++) if (!taken.has(i === 1 ? base : `${base} ${i}`)) return i === 1 ? base : `${base} ${i}`;
};

/** A new shoot, open at once, dressing whoever the open one dressed. */
export async function newShoot() {
  await saver.flush();
  const body = freshBody(cabinet.shoot?.body.who);
  const { project } = await call(`api/${KIND}`, "POST", { name: nameFor(whoNow(body)), body });
  cabinet.list = [{ id: project.id, name: project.name, updatedAt: project.updatedAt }, ...(cabinet.list ?? [])];
  opened(project);
  draw();
}

export async function removeShoot(id = cabinet.shoot?.id) {
  if (!id) return;
  saver.drop(id);
  const { cabinet: list } = await call(`api/${KIND}/${id}`, "DELETE");
  cabinet.list = list ?? [];
  if (cabinet.shoot?.id !== id) return draw();
  cabinet.shoot = null;
  if (cabinet.list[0]) await openShoot(cabinet.list[0].id);
  else await newShoot();
}

export function renameShoot(name) {
  const s = cabinet.shoot;
  const n = String(name ?? "").trim().slice(0, 60);
  if (!s || !n || n === s.name) return;
  s.name = n;
  save();
  draw();
}

// ---------------------------------------------------------------- the pictures

/** The picture's three references, on the server: who, then the outfit, then the pose (each named as the prompt calls it). */
async function refsOf(body, outfit, pose) {
  const who = whoNow(body);
  const first = body.who?.kind === "photo" ? body.who.photo : await onServer(who.picture, who.name);
  const shelf = async (item) => (item.own ? item.own : await onServer(item.src, item.name));
  const refs = [{ file: first.file, name: "character" }];
  if (outfit) refs.push({ file: (await shelf(outfit)).file, name: "outfit" });
  if (pose) refs.push({ file: (await shelf(pose)).file, name: "pose" });
  return refs;
}

/** Follows a picture's job to its end: its progress patched on the page, its photo kept with the shoot. */
async function follow(shoot, p) {
  const patch = () => {
    const bar = document.querySelector(`[data-cab-job="${p.id}"]`);
    bar?.style.setProperty("--p", String(Math.max(0.04, p.progress ?? 0)));
  };
  jobWatchers.set(p.id, (j) => {
    p.progress = j.progress ?? p.progress;
    patch();
  });
  try {
    // (a job may have finished while nobody watched: asked once, then waited for)
    const now = await call(`api/image/jobs/${p.id}`).catch((e) => ({ lost: /no longer tracked/i.test(e.message) }));
    if (now.lost) throw new Error("The server restarted before this picture was finished.");
    const job = now.status === "done" || now.status === "failed" ? now : await waitFor("job", p.id);
    if (job.status === "failed") throw new Error(job.error ?? "That picture didn't work.");
    Object.assign(p, { status: "done", photo: { file: job.photo.file, url: job.photo.url, width: job.photo.width, height: job.photo.height }, progress: 1 });
  } catch (e) {
    Object.assign(p, { status: "failed", error: String(e?.message ?? e).split("\n")[0] });
  } finally {
    jobWatchers.delete(p.id);
  }
  // (a shoot deleted while its pictures were being made keeps nothing: they are in the Library)
  if (!cabinet.list?.some((s) => s.id === shoot.id)) return;
  save(shoot);
  if (cabinet.shoot === shoot) draw();
  if (p.status === "done") api.photos().then((photos) => ((state.photos = photos), changed("library"))).catch(() => {});
}

/** One picture for each outfit picked in each pose picked, all asked at once. */
export async function shootNow({ outfit: only, pose: onlyPose } = {}) {
  const shoot = cabinet.shoot;
  const b = shoot?.body;
  const m = modelNow();
  if (!b) return;
  if (!m) return void toast("No image model that edits is set up: add a Comfy key, or connect a ComfyUI.", { tone: "warn" });
  const pairs = only !== undefined ? [{ outfit: only, pose: onlyPose }] : combos(b.outfits, b.poses);
  const who = whoNow(b);
  const f = FORMATS[b.format] ?? FORMATS.post;
  for (const { outfit: oKey, pose: pKey } of pairs) {
    const outfit = itemOf("outfits", oKey);
    const pose = itemOf("poses", pKey);
    const prompt = shotPrompt({ who, outfit, pose, format: b.format, backdrop: b.backdrop, notes: b.notes });
    const name = `${who.name} · ${[outfit?.name, pose?.name].filter(Boolean).join(" · ") || "Cabinet"}`;
    // the picture shows at once, waiting; it is made when its references are on the server
    const p = { id: `wait-${Math.random().toString(36).slice(2, 10)}`, outfit: oKey ?? null, pose: pKey ?? null, format: b.format, status: "running", progress: 0, at: new Date().toISOString(), model: m.id };
    b.pictures.unshift(p);
    cabinet.shown = p.id;
    draw();
    try {
      const refs = await refsOf(b, outfit, pose);
      const [job] = await api.image({ model: m.id, template: "edit", prompt, refs, aspect: f.aspect, count: 1, megapixels: m.megapixels?.[0] ?? 1, seed: Math.floor(Math.random() * 2 ** 31), name });
      if (!job?.id) throw new Error("The picture was not started.");
      if (cabinet.shown === p.id) cabinet.shown = job.id;
      p.id = job.id;
      save(shoot);
      draw();
      follow(shoot, p);
    } catch (e) {
      Object.assign(p, { status: "failed", error: String(e?.message ?? e).split("\n")[0] });
      save(shoot);
      draw();
    }
  }
}

/** The same outfit in the same pose again (a new seed). */
export const again = (p) => shootNow({ outfit: p.outfit, pose: p.pose });

export function dropPicture(id) {
  const b = cabinet.shoot?.body;
  if (!b) return;
  const i = b.pictures.findIndex((p) => p.id === id);
  if (i < 0) return;
  b.pictures.splice(i, 1);
  if (cabinet.shown === id) cabinet.shown = b.pictures[Math.min(i, b.pictures.length - 1)]?.id ?? null;
  save();
  draw();
}

export function show(id) {
  cabinet.shown = id;
  draw();
}
