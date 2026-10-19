// Mixer: an edit you like, made yours. The edit is a recipe from the shelf (one of the presets) or
// any video dropped in; the cast is up to five photos (people, a product, an outfit). The edit is
// split at its cuts; each shot's first frame is redrawn with the cast (same pose, framing, light),
// then rolled copying that shot's motion, and the shots are cut together on the edit's own sound
// and timing. A shot that came out wrong is fixed alone: a note, then drawn or rolled again.
import { state, changed, onChange, toast, drawPicture, waitFor, presetById, artistFor } from "./store.js";
import { api } from "./api.js";

export const CAST_MAX = 5;
const KINDS = ["person", "product", "outfit", "other"];
const DEFAULT_NAMES = { person: "hero", product: "product", outfit: "outfit", other: "extra" };
const SAVED = "comfyture.mixer.open";

export const mixer = { list: [], mix: null, busy: new Set(), ready: null, selected: 0, splitting: false };
/** Who hears of a mix opened when the screen first loads (the trend shelf, to pick its trend). */
let onOpen = null;
export const whenOpened = (fn) => (onOpen = fn);

// the LoRAs every take of a mix is rolled with, kept per browser: Pixar Toon, like the crew, until
// the stack is changed
const LORAS = "comfyture.mixer.loras";
export function mixLoras() {
  try {
    const kept = JSON.parse(localStorage.getItem(LORAS) ?? "null");
    if (Array.isArray(kept)) return kept;
  } catch {}
  return [{ id: "pixar-toon", strength: 1.2 }];
}
export function setMixLoras(list) {
  try {
    localStorage.setItem(LORAS, JSON.stringify(list));
  } catch {}
}
const sameLoras = (a, b) => JSON.stringify((a ?? []).map((l) => [l.id, l.strength])) === JSON.stringify((b ?? []).map((l) => [l.id, l.strength]));
/** Whether a shot's take is done, rolled with the LoRAs picked now (a shot rolled with others is rolled again). */
export const rolled = (s) => take(s)?.status === "done" && sameLoras(take(s).request?.loras, mixLoras());
const update = () => changed("mixer");

const call = async (path, init) => {
  const res = await fetch(path, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body;
};
const send = (path, method, body) => call(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });

const blank = () => ({ edit: null, cast: [], shots: [], film: null, cut: null, aspect: "9:16" });

// ---------------------------------------------------------------- the mixes kept on the server

export function loadMixes() {
  return (mixer.ready ??= (async () => {
    try {
      mixer.list = (await call("api/mixes")).mixes ?? [];
      let last = null;
      try {
        last = localStorage.getItem(SAVED);
      } catch {}
      // the screen opens on the trends: the last mix comes back with them when it was one of theirs
      const id = mixer.list.find((m) => m.id === last)?.id;
      if (id) {
        await openMix(id);
        if (mixer.mix?.body?.kind !== "trend") mixer.mix = null;
        else onOpen?.(mixer.mix);
      }
    } catch (e) {
      console.warn("mixer:", e.message);
    }
    update();
  })());
}

export async function openMix(id) {
  const { project } = await call(`api/mixes/${id}`);
  mixer.mix = { ...project, body: { ...blank(), ...project.body } };
  mixer.selected = 0;
  try {
    localStorage.setItem(SAVED, id);
  } catch {}
  update();
}

export async function newMix() {
  const { project } = await send("api/mixes", "POST", { name: "New mix", body: blank() });
  mixer.list = [{ id: project.id, name: project.name, updatedAt: project.updatedAt }, ...mixer.list];
  mixer.mix = project;
  mixer.selected = 0;
  try {
    localStorage.setItem(SAVED, project.id);
  } catch {}
  update();
  return project;
}

let saving = null;
/** The open mix written back, a moment after its last change. */
export function save() {
  const m = mixer.mix;
  if (!m) return;
  clearTimeout(saving);
  saving = setTimeout(() => {
    const thumb = m.body.film?.poster ?? m.body.shots.find((s) => s.look)?.look.url ?? m.body.cast[0]?.url;
    send(`api/mixes/${m.id}`, "PUT", { name: m.name, body: m.body, ...(thumb ? { thumb } : {}) })
      .then(() => {
        const row = mixer.list.find((x) => x.id === m.id);
        if (row) Object.assign(row, { name: m.name, thumb, updatedAt: new Date().toISOString() });
      })
      .catch((e) => toast(e.message, { tone: "crit" }));
  }, 400);
}
const touched = () => (save(), update());

export async function removeMix(id) {
  const { mixes } = await call(`api/mixes/${id}`, { method: "DELETE" });
  mixer.list = mixes ?? [];
  if (mixer.mix?.id === id) {
    mixer.mix = null;
    if (mixer.list[0]) await openMix(mixer.list[0].id);
  }
  update();
}

const ensure = async () => mixer.mix ?? (await newMix());

// ---------------------------------------------------------------- the edit

/** A video dropped in as the edit: kept, then split at its cuts. */
export async function useVideo(file) {
  const m = await ensure();
  mixer.splitting = true;
  update();
  try {
    const video = await api.uploadVideo(file);
    const name = (file.name ?? "").replace(/\.\w+$/, "").slice(0, 40) || "My edit";
    await splitInto(m, video, name);
  } catch (e) {
    toast(e.message, { tone: "crit" });
  } finally {
    mixer.splitting = false;
    update();
  }
}

/** A take or a film from the Library as the edit. */
export async function useLibrary(source, name) {
  const m = await ensure();
  mixer.splitting = true;
  update();
  try {
    await splitInto(m, await api.videoFrom(source), name);
  } catch (e) {
    toast(e.message, { tone: "crit" });
  } finally {
    mixer.splitting = false;
    update();
  }
}

async function splitInto(m, video, name) {
  const split = await send("api/mixer/split", "POST", { video: video.file, name });
  m.body.edit = { kind: "video", name, video: { file: video.file, url: video.url, seconds: split.seconds, width: split.width, height: split.height }, sound: split.sound };
  m.body.shots = split.shots.map((s) => ({ ...s, motion: "pose", note: "", look: null, run: null }));
  m.body.film = null;
  m.body.aspect = split.width > split.height ? "16:9" : split.width < split.height ? "9:16" : "1:1";
  if (m.name === "New mix") m.name = `${name} remix`.slice(0, 60);
  mixer.selected = 0;
  touched();
}

/** A recipe from the shelf (a preset) as the edit: one shot, its script the preset's. */
export async function useRecipe(id) {
  const p = presetById(id);
  if (!p) return;
  const m = await ensure();
  m.body.edit = { kind: "recipe", preset: id, name: p.name, poster: p.poster, preview: p.preview, seconds: p.seconds ?? 5 };
  m.body.shots = [{ from: 0, to: p.seconds ?? 5, frame: null, clip: null, motion: "free", note: "", look: null, run: null, preset: id }];
  m.body.film = null;
  if (m.name === "New mix" || m.body.edit?.kind === "recipe") m.name = `${p.name} mix`.slice(0, 60);
  mixer.selected = 0;
  touched();
}

export function clearEdit() {
  const m = mixer.mix;
  if (!m) return;
  Object.assign(m.body, { edit: null, shots: [], film: null });
  touched();
}

// ---------------------------------------------------------------- the cast

/** A photo for the cast: kept, named after its kind (hero, product, outfit) unless named already. */
export async function addCast(file, kind) {
  const m = await ensure();
  if (m.body.cast.length >= CAST_MAX) return toast(`The cast holds ${CAST_MAX} photos: take one out first.`);
  try {
    const photo = file.file ? file : await api.upload(file, file.name);
    const k = KINDS.includes(kind) ? kind : m.body.cast.some((c) => c.kind === "person") ? "product" : "person";
    m.body.cast.push({ file: photo.file, url: photo.url, kind: k, name: uniqueName(m, DEFAULT_NAMES[k]) });
    touched();
  } catch (e) {
    toast(e.message, { tone: "crit" });
  }
}
function uniqueName(m, base) {
  let name = base;
  for (let i = 2; m.body.cast.some((c) => c.name === name); i++) name = `${base}${i}`;
  return name;
}
export function setCast(i, patch) {
  const c = mixer.mix?.body.cast[i];
  if (!c) return;
  if (patch.kind && KINDS.includes(patch.kind) && Object.values(DEFAULT_NAMES).some((n) => c.name.startsWith(n))) c.name = uniqueName(mixer.mix, DEFAULT_NAMES[patch.kind]);
  Object.assign(c, patch);
  touched();
}
export function removeCast(i) {
  mixer.mix?.body.cast.splice(i, 1);
  touched();
}
export const castKinds = KINDS;

// ---------------------------------------------------------------- the shots

export const shotLength = (s) => Math.max(0.1, s.to - s.from);
export const take = (s) => (s?.run ? state.runs.find((r) => r.id === s.run) : null);
/** Where a shot is: waiting, drawing its frame, rolling (how far), done, or failed. */
export function shotState(s, i) {
  const key = (k) => mixer.busy.has(`${k}:${i}`);
  if (key("look")) return { step: "drawing", note: "Drawing the frame" };
  const t = take(s);
  if (key("roll") && !t) return { step: "rolling", note: "Starting", progress: 0 };
  if (t && !["done", "failed", "canceled"].includes(t.status)) return { step: "rolling", note: t.stage || "Rolling", progress: t.progress ?? 0 };
  if (t?.status === "done") return { step: "done", note: "Done" };
  if (t && t.status !== "done") return { step: "failed", note: t.error ?? "Didn't roll" };
  if (s.look) return { step: "drawn", note: "Frame drawn" };
  return { step: "waiting", note: "Waiting" };
}
export function setShot(i, patch) {
  const s = mixer.mix?.body.shots[i];
  if (!s) return;
  Object.assign(s, patch);
  touched();
}
export const select = (i) => ((mixer.selected = i), update());

/** The words that redraw a shot's first frame with the cast (the shot is the first reference). */
function lookPrompt(m, s) {
  const by = (k) => m.body.cast.filter((c) => c.kind === k).map((c) => `@${c.name}`);
  const people = by("person");
  const products = by("product");
  const outfits = by("outfit");
  const others = by("other");
  const and = (list) => list.join(" and ");
  if (!s.frame) {
    // a recipe: one striking frame of the cast to start the trend from
    return [
      `A striking ${m.body.aspect === "9:16" ? "vertical " : ""}photograph for a short viral video.`,
      people.length ? `It shows ${and(people)}, exactly this person: face, facial features, hairstyle, hair colour, skin tone, age and build.` : "",
      products.length ? `With ${and(products)}, exactly as it looks.` : "",
      outfits.length ? `Wearing the outfit from ${and(outfits)}.` : "",
      others.length ? `Also in the frame: ${others.join(", ")}.` : "",
      s.note,
      "No text, no captions, no watermark.",
    ].filter(Boolean).join(" ");
  }
  // asked this way round, the edit models replace the person rather than keep the one there
  const lines = [];
  if (people.length) lines.push(`Replace the person in @shot with ${and(people)}. The person must be exactly ${and(people)}: their face, facial features, hairstyle, hair colour, skin tone, age and build, not the person who was in @shot.`);
  if (products.length) lines.push(`Replace the object they hold, wear or show with ${and(products)}, exactly as it looks.`);
  if (outfits.length) lines.push(`Dress them in the outfit from ${and(outfits)}.`);
  if (others.length) lines.push(`Also put ${others.join(", ")} in the frame.`);
  if (s.note) lines.push(s.note);
  lines.push(`Keep everything else from @shot exactly: the framing, camera angle, lens, pose, gesture, expression${outfits.length ? "" : ", clothing"}, lighting, colours, background and style. No text, no captions, no watermark.`);
  return lines.join(" ");
}

async function drawLook(m, i) {
  const s = m.body.shots[i];
  mixer.busy.add(`look:${i}`);
  update();
  try {
    const refs = [...(s.frame ? [{ file: s.frame.file, name: "shot" }] : []), ...m.body.cast.map((c) => ({ file: c.file, name: c.name }))];
    // a recipe with one photo and no note starts from the photo as it is
    if (!s.frame && m.body.cast.length === 1 && !s.note) {
      s.look = { file: m.body.cast[0].file, url: m.body.cast[0].url };
    } else {
      const photo = await drawPicture({ model: artistFor("edit"), template: "edit", prompt: lookPrompt(m, s), refs, aspect: s.frame ? "auto" : m.body.aspect, name: `${m.name} · shot ${i + 1}` });
      s.look = { file: photo.file, url: photo.url };
    }
    s.run = null;
    touched();
  } finally {
    mixer.busy.delete(`look:${i}`);
    update();
  }
}

async function rollShot(m, i) {
  const s = m.body.shots[i];
  if (!s.look) throw new Error("Draw the frame first.");
  mixer.busy.add(`roll:${i}`);
  update();
  try {
    const len = shotLength(s);
    const preset = s.preset ? presetById(s.preset) : null;
    const body = {
      name: `${m.name} · ${String(i + 1).padStart(2, "0")}`,
      start: s.look.file,
      seconds: Math.min(10, Math.max(2, Math.ceil(len))),
      aspect: "auto",
      review: false,
      takes: 1,
      quality: "standard",
      preset: preset?.id,
      script: preset ? structuredClone(preset.script) : { shots: [{ action: s.note || "The moment plays out exactly like the reference: the same movement, the same energy.", camera: "", sound: "", framing: "" }], raw: "" },
      loras: mixLoras(),
    };
    if (s.clip && s.motion !== "free") body.video = { file: s.clip.file, mode: "motion", control: s.motion === "edges" ? "edges" : "pose" };
    const [run] = await api.shoot(body);
    s.run = run.id;
    touched();
    await waitFor("run", run.id).catch(() => null);
  } finally {
    mixer.busy.delete(`roll:${i}`);
    update();
  }
}

/** One shot again: its frame redrawn (with its note), or only rolled again from the frame it has. */
export async function redo(i, { draw = true } = {}) {
  const m = mixer.mix;
  if (!m?.body.shots[i]) return;
  try {
    if (draw || !m.body.shots[i].look) await drawLook(m, i);
    await rollShot(m, i);
    if (mixer.mix?.id === m.id && m.body.shots.every((s) => take(s)?.status === "done")) await assemble(m);
  } catch (e) {
    toast(e.message, { tone: "crit" });
  }
}

export const mixing = () => mixer.busy.has("mix") || [...mixer.busy].some((k) => k.startsWith("look:") || k.startsWith("roll:"));

/**
 * Mixes the whole edit: every shot not yet made is drawn and rolled, three at a time, then the
 * shots are cut together. Shots already done are kept, so mixing again only redoes what failed.
 */
export async function mixIt() {
  const m = mixer.mix;
  if (!m?.body.edit) return toast("Pick a recipe or drop an edit first.");
  if (!m.body.cast.length) return toast("Add a photo of who (or what) the mix is about.");
  if (mixing()) return;
  mixer.busy.add("mix");
  m.body.film = null;
  update();
  try {
    const todo = m.body.shots.map((s, i) => i).filter((i) => !rolled(m.body.shots[i]));
    let next = 0;
    const worker = async () => {
      while (next < todo.length) {
        const i = todo[next++];
        try {
          if (!m.body.shots[i].look) await drawLook(m, i);
          await rollShot(m, i);
          // a take ComfyUI failed now and then is rolled once more before giving up on it
          if (take(m.body.shots[i])?.status === "failed") await rollShot(m, i);
        } catch (e) {
          toast(`Shot ${i + 1}: ${e.message}`, { tone: "crit" });
        }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    if (m.body.shots.every(rolled)) await assemble(m);
    else toast("Some shots didn't come out: fix them on their own, then mix again.");
  } finally {
    mixer.busy.delete("mix");
    update();
  }
}

/** The shots cut together on the edit's sound and timing: a Cut of its own, rendered. */
async function assemble(m) {
  const shots = m.body.shots;
  if (m.body.edit.kind === "recipe" || shots.length === 1) {
    const t = take(shots[0]);
    m.body.film = { url: t.video, seconds: t.length ?? t.request.seconds, poster: shots[0].look?.url, take: t.id };
    return touched();
  }
  mixer.busy.add("render");
  update();
  try {
    const items = shots.map((s, i) => {
      const t = take(s);
      const need = shotLength(s);
      const have = t.length ?? t.request.seconds;
      // a take shorter than its shot is slowed to fill it, so every cut lands where the edit's did
      const speed = have < need ? Math.max(0.25, have / need) : 1;
      return { id: `m${i + 1}`, src: { kind: "take", id: t.id }, from: 0, to: Math.min(have, need * speed), speed, sound: false, join: "cut" };
    });
    const tracks = [{ id: "video", kind: "video", main: true, items }];
    if (m.body.edit.sound) tracks.push({ id: "music", kind: "audio", role: "music", items: [{ id: "edit-sound", src: { kind: "audio", id: m.body.edit.sound.file }, start: 0, from: 0, to: m.body.edit.video.seconds }] });
    const body = { aspect: m.body.aspect, tracks, product: "mixer" };
    let id = m.body.cut;
    if (id) await send(`api/cuts/${id}`, "PUT", { name: m.name, body }).catch(() => (id = null));
    if (!id) id = (await send("api/cuts", "POST", { name: m.name, body })).project.id;
    m.body.cut = id;
    const film = await send(`api/cuts/${id}/render`, "POST", {});
    m.body.film = { url: film.url, seconds: film.seconds, id: film.id, poster: shots[0].look?.url };
    state.films = [film, ...(state.films ?? []).filter((f) => f.id !== film.id)];
    touched();
  } catch (e) {
    toast(e.message, { tone: "crit" });
  } finally {
    mixer.busy.delete("render");
    update();
  }
}

/** Roughly what a mix costs, in Comfy credits: each frame drawn, each second rolled. */
export function estimate(m = mixer.mix) {
  if (!m?.body.edit) return null;
  const look = (state.image.catalogue?.models ?? []).find((x) => x.id === artistFor("edit"));
  const perLook = look?.router ? look.credits ?? 8 : (look?.seconds ?? 10) * 0.266;
  const shots = m.body.shots.filter((s) => !rolled(s));
  const seconds = shots.reduce((t, s) => t + Math.min(10, Math.max(2, Math.ceil(shotLength(s)))), 0);
  const looks = shots.filter((s) => !s.look && (s.frame || m.body.cast.length > 1 || s.note)).length;
  // LTX-2.5 on Comfy Cloud: about 18 s of GPU per second of video at 720p
  return Math.round(looks * perLook + seconds * 18 * 0.266);
}

// the mix redraws while its takes roll
onChange((scopes) => {
  if (scopes.has("takes") && mixer.mix?.body.shots.some((s) => s.run)) changed("mixer");
});
