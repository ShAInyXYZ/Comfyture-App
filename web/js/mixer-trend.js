// Mixer's trends: a trend from the shelf, cast and made. The crew stars in it by default; any role
// can go to another of the crew or to a star of your own (a photo: your pet, yourself), and the
// trend's cover is then redrawn with them. The trend's beats are rolled from that frame with
// LTX-2.5, a few seconds at a time; an original track in the trend's feel is made with ACE-Step;
// and the shots are cut together on it, the trend's caption on top.
import { state, changed, toast, waitFor, drawPicture, artistFor } from "./store.js";
import { api } from "./api.js";
import { mixer, save, newMix, whenOpened } from "./mixer.js";
import { TRENDS, CREW, trendById, crewById, trendArt, crewPicture } from "./mixer-trends.js";

const update = () => changed("mixer");
const call = async (path, init) => {
  const res = await fetch(path, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body;
};
const send = (path, method, body) => call(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });

/** What is picked on the shelf: the trend, the filter, and who plays each of its roles. */
export const pick = { trend: TRENDS[0].id, kind: "all", cast: null, role: null };
export const stars = { list: [], ready: null };
// a trend's mix opened again brings back its trend and who played in it
whenOpened((m) => {
  if (!m.body.trend) return;
  pick.trend = m.body.trend.id;
  pick.cast = { trend: m.body.trend.id, roles: structuredClone(m.body.trend.cast) };
});

/** The roles of a trend as cast: each role played by one of the crew or by a star. */
export function castOf(t = trendById(pick.trend)) {
  if (!t) return [];
  if (!pick.cast || pick.cast.trend !== t.id) pick.cast = { trend: t.id, roles: Object.fromEntries(t.cast.map((c) => [c.role, { crew: c.crew }])) };
  return t.cast.map((c) => ({ role: c.role, original: c.crew, who: pick.cast.roles[c.role] }));
}
export function selectTrend(id) {
  if (!trendById(id)) return;
  pick.trend = id;
  pick.role = null;
  // a mix already open for another trend stays in My mixes; this one starts afresh
  if (mixer.mix?.body?.trend?.id !== id) mixer.mix = null;
  update();
}
export const setKind = (kind) => ((pick.kind = kind), update());
export const pickRole = (role) => ((pick.role = pick.role === role ? null : role), update());

/** A role given to someone: one of the crew ({ crew }) or a star ({ star }). */
export function setRole(role, who) {
  castOf();
  pick.cast.roles[role] = who;
  pick.role = null;
  update();
}
/** The next of the crew not already in the trend, for a role. */
export function swapRole(role) {
  const cast = castOf();
  const taken = new Set(cast.filter((c) => c.role !== role && c.who.crew).map((c) => c.who.crew));
  const now = cast.find((c) => c.role === role)?.who.crew;
  const order = CREW.map((c) => c.id);
  const start = Math.max(0, order.indexOf(now));
  for (let k = 1; k <= order.length; k++) {
    const next = order[(start + k) % order.length];
    if (!taken.has(next)) return setRole(role, { crew: next });
  }
}

// ---------------------------------------------------------------- your stars

export function loadStars() {
  return (stars.ready ??= call("api/mixer/stars").then((list) => ((stars.list = Array.isArray(list) ? list : []), update())).catch(() => {}));
}
const keepStars = () => send("api/mixer/stars", "PUT", stars.list).then((list) => (stars.list = list)).catch((e) => toast(e.message, { tone: "crit" }));
/** A photo added as a star; dropped on a role, it plays that role too. */
export async function addStar(file, role = pick.role) {
  try {
    const p = await api.upload(file, file.name);
    const star = { file: p.file, url: p.url, name: (file.name ?? "").replace(/\.\w+$/, "").replace(/[-_]+/g, " ").slice(0, 24) || "My star" };
    stars.list = [star, ...stars.list.filter((s) => s.file !== star.file)];
    await keepStars();
    if (role) setRole(role, { star });
    update();
  } catch (e) {
    toast(e.message, { tone: "crit" });
  }
}
export async function removeStar(file) {
  stars.list = stars.list.filter((s) => s.file !== file);
  await keepStars();
  update();
}

// ---------------------------------------------------------------- making it

const kept = new Map();
/** One of our pictures (a trend cover, a crew cat) as a picture on the server, once. */
async function onServer(url, name) {
  if (!kept.has(url)) kept.set(url, (async () => api.upload(await (await fetch(url)).blob(), name))().catch((e) => (kept.delete(url), Promise.reject(e))));
  return kept.get(url);
}

/** The trend's beats in takes of at most ten seconds: as many beats in each as fit. */
export function takesOf(t) {
  const out = [];
  for (const b of t.beats) {
    const last = out.at(-1);
    if (last && b.to - last.from <= 10) last.to = b.to, last.beats.push(b);
    else out.push({ from: b.from, to: b.to, beats: [b] });
  }
  // a beat longer than a take is rolled in parts
  return out.flatMap((c) => {
    const n = Math.ceil((c.to - c.from) / 10);
    return Array.from({ length: n }, (_, k) => ({ from: c.from + ((c.to - c.from) * k) / n, to: c.from + ((c.to - c.from) * (k + 1)) / n, beats: c.beats }));
  });
}

const looks = (t, cast) => Object.fromEntries(t.cast.map((c, i) => {
  const who = cast[i].who;
  const name = crewById(c.crew)?.name ?? c.crew;
  return [name, who.crew ? crewById(who.crew).look : `the ${cast[i].role.toLowerCase()} from the photo`];
}));
/** What happens in a take, its beats told with who is in the frame. */
function actionOf(t, cast, take) {
  const who = looks(t, cast);
  const said = take.beats.map((b) => b.text.replace(/\b(Praline|Sesame|Mochi|Meringue)\b/g, (n) => who[n] ?? n)).join(", then ");
  return `${said}. The same characters, place and light as the first frame, playful and smooth, made for a short vertical video.`;
}

/** The first frame: the trend's cover, redrawn with whoever replaced the crew in it. */
async function firstFrame(t, cast) {
  const cover = await onServer(trendArt(t), `${t.name} cover`);
  const changes = cast.filter((c) => !(c.who.crew && c.who.crew === c.original));
  if (!changes.length) return { file: cover.file, url: cover.url };
  const refs = [{ file: cover.file, name: "scene" }];
  const lines = [];
  for (const c of changes) {
    const tag = c.role.toLowerCase();
    const was = crewById(c.original);
    const pic = c.who.crew ? await onServer(crewPicture(c.who.crew), crewById(c.who.crew).name) : c.who.star;
    refs.push({ file: pic.file, name: tag });
    lines.push(`Replace ${was.name}, ${was.look}, with @${tag}: exactly @${tag}'s look (face or features, colours, markings and build), in the same pose, place and size.`);
  }
  const prompt = `${lines.join(" ")} Keep everything else from @scene exactly: the framing, camera, poses, gestures, expressions, lighting, colours, set and style. No text, no captions, no watermark.`;
  const photo = await drawPicture({ model: artistFor("edit"), template: "edit", prompt, refs, aspect: "9:16", name: `${t.name} · cast` });
  return { file: photo.file, url: photo.url };
}

/** An original track in the trend's feel: never the trend's own song. */
async function music(t) {
  const m = t.music ?? {};
  const prompt = [m.genre, m.mood, ...(m.instruments ?? []).filter((x) => !/original|new /i.test(x)).slice(0, 4), "an original catchy instrumental for a short video"].filter(Boolean).join(", ");
  const job = await send("api/audio/music", "POST", { prompt, lyrics: "", seconds: Math.ceil(t.seconds) + 1, bpm: m.bpm ?? 110, name: `${t.name} track` });
  const done = await waitFor("job", job.id);
  return { file: done.audio.file, url: done.audio.url };
}

export const making = () => mixer.busy.has("trend");
export const take = (s) => (s?.run ? state.runs.find((r) => r.id === s.run) : null);

/** The trend, made: its first frame, its takes rolled two at a time, its own track, cut together. */
export async function makeTrend() {
  const t = trendById(pick.trend);
  if (!t || making()) return;
  const cast = castOf(t);
  mixer.busy.add("trend");
  update();
  try {
    const m = await newMix();
    m.name = `${t.name} · ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
    Object.assign(m.body, { kind: "trend", trend: { id: t.id, cast: structuredClone(pick.cast.roles) }, aspect: "9:16", shots: [], film: null, music: null });
    save();
    update();
    const tune = music(t).catch((e) => (toast(`The track: ${e.message}`, { tone: "crit" }), null));
    const frame = await firstFrame(t, cast);
    m.body.shots = takesOf(t).map((tk) => ({ from: tk.from, to: tk.to, look: frame, run: null, beats: tk.beats }));
    save();
    update();
    let next = 0;
    const roll = async () => {
      while (next < m.body.shots.length) {
        const i = next++;
        const s = m.body.shots[i];
        const body = { name: `${m.name} · ${i + 1}`, start: frame.file, seconds: Math.min(10, Math.max(2, Math.ceil(s.to - s.from))), aspect: "9:16", review: false, takes: 1, quality: "standard", script: { shots: [{ action: actionOf(t, cast, s), camera: "", sound: "", framing: "" }], raw: "" } };
        for (let attempt = 0; attempt < 2 && take(s)?.status !== "done"; attempt++) {
          const [run] = await api.shoot(body);
          s.run = run.id;
          save();
          update();
          await waitFor("run", run.id).catch(() => null);
        }
      }
    };
    await Promise.all([roll(), roll()]);
    m.body.music = await tune;
    save();
    if (!m.body.shots.every((s) => take(s)?.status === "done")) throw new Error("A take didn't come out: open the mix and roll it again.");
    await cutTogether(m, t);
  } catch (e) {
    toast(e.message, { tone: "crit" });
  } finally {
    mixer.busy.delete("trend");
    update();
  }
}

/** The takes on the trend's own track, its caption on top: a Cut of its own, rendered. */
async function cutTogether(m, t) {
  const items = m.body.shots.map((s, i) => {
    const r = take(s);
    const need = s.to - s.from;
    const have = r.length ?? r.request.seconds;
    const speed = have < need ? Math.max(0.25, have / need) : 1;
    return { id: `t${i + 1}`, src: { kind: "take", id: r.id }, from: 0, to: Math.min(have, need * speed), speed, sound: !m.body.music, join: "cut" };
  });
  const tracks = [{ id: "video", kind: "video", main: true, items }];
  if (m.body.music) tracks.push({ id: "music", kind: "audio", role: "music", items: [{ id: "track", src: { kind: "audio", id: m.body.music.file }, start: 0, from: 0, to: t.seconds }] });
  if (t.caption) tracks.push({ id: "caption", kind: "title", items: [{ id: "c1", text: t.caption, start: 0, length: t.seconds, style: "top" }] });
  const body = { aspect: "9:16", tracks, product: "mixer" };
  const id = m.body.cut ?? (await send("api/cuts", "POST", { name: m.name, body })).project.id;
  if (m.body.cut) await send(`api/cuts/${id}`, "PUT", { name: m.name, body });
  m.body.cut = id;
  const film = await send(`api/cuts/${id}/render`, "POST", {});
  m.body.film = { url: film.url, seconds: film.seconds, id: film.id, poster: m.body.shots[0]?.look?.url };
  state.films = [film, ...(state.films ?? []).filter((f) => f.id !== film.id)];
  save();
}

/** Roughly what making the trend costs, in Comfy credits. */
export function estimate(t = trendById(pick.trend)) {
  if (state.info?.target !== "comfy-cloud" || !t) return null;
  const cast = castOf(t);
  const redraw = cast.some((c) => !(c.who.crew && c.who.crew === c.original));
  const m = (state.image.catalogue?.models ?? []).find((x) => x.id === artistFor("edit"));
  const pic = m?.router ? m.credits ?? 8 : (m?.seconds ?? 10) * 0.266;
  const seconds = takesOf(t).reduce((s, tk) => s + Math.min(10, Math.max(2, Math.ceil(tk.to - tk.from))), 0);
  return Math.round((redraw ? pic : 0) + seconds * 18 * 0.266 + t.seconds * 1.3 * 0.266);
}
