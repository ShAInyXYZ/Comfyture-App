// Mixer's trends: a trend from the shelf, cast and made. The crew stars in it by default; any role
// can go to another of the crew or to a star of your own (a photo: your pet, yourself), and the
// trend's cover is then redrawn with them. The trend's beats are rolled from that frame with
// LTX-2.5, a few seconds at a time; an original track in the trend's feel is made with ACE-Step;
// and the shots are cut together on it, the trend's caption on top. A trend we have made ourselves
// is made again from its recipe instead: our version's motion, its first frames redrawn with your
// cast, and a track in the trend's feel that the takes follow (the mouths, the beat). The trends'
// original recordings are not in the repository, so that track is made, as for every other trend.
import { state, changed, toast, waitFor, drawPicture, artistFor, chosenArtist } from "./store.js";
import { api } from "./api.js";
import { mixer, save, newMix, whenOpened, mixLoras } from "./mixer.js";
import { TRENDS, CREW, trendById, crewById, trendArt, crewPicture } from "./mixer-trends.js";
import { onServer } from "./picker.js";
import { castVoiceDirection, nativeRecipeRequest, applyCharacterVoice } from "./mixer-voices.js";
import { uploadRole, canResumeTrend, validateRecipe } from "./mixer-trend-state.js";

import { isProblemReveal, cleanProblem, cleanFrameIdeas, problemVideoPrompt, prepareProblemFrames } from "./mixer-problem-reveal.js";

const update = () => changed("mixer");
const call = async (path, init) => {
  const res = await fetch(path, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.error ?? `Request failed (${res.status})`), { status: res.status });
  return body;
};
const send = (path, method, body) => call(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });

/** What is picked on the shelf: the trend, the filter, and who plays each of its roles. */
export const pick = { trend: (TRENDS.find((t) => t.home === "mixer" || t.also?.includes("mixer")) ?? TRENDS[0]).id, kind: "all", cast: null, role: null, inputs: {} };
export const stars = { list: [], ready: null, uploading: 0 };
// a trend's mix opened again brings back its trend and who played in it, unless something was
// picked before it came back (a trend from Jam's "Make it with your cast", a role given to someone):
// that choice wins over the last mix
let picked = false;
whenOpened((m) => {
  if (!m.body.trend) return;
  if (picked) return void (m.body.trend.id !== pick.trend && (mixer.mix = null));
  pick.trend = m.body.trend.id;
  pick.inputs[pick.trend] = structuredClone(m.body.trend.inputs ?? {});
  pick.cast = { trend: m.body.trend.id, roles: structuredClone(m.body.trend.cast) };
});

/** The roles of a trend as cast: each role played by one of the crew or by a star. */
export function castOf(t = trendById(pick.trend)) {
  if (!t) return [];
  if (!pick.cast || pick.cast.trend !== t.id) pick.cast = { trend: t.id, roles: Object.fromEntries(t.cast.map((c) => [c.role, { crew: c.crew }])) };
  return t.cast.map((c) => ({ role: c.role, original: c.crew, who: pick.cast.roles[c.role] }));
}
export function selectTrend(id) {
  if (making() || stars.uploading || !trendById(id) || trendById(id).soon) return;
  picked = true;
  pick.trend = id;
  pick.role = null;
  // a mix already open for another trend stays in My mixes; this one starts afresh
  if (mixer.mix?.body?.trend?.id !== id) mixer.mix = null;
  update();
}
export function trendInputs(t = trendById(pick.trend)) {
  return isProblemReveal(t) ? { problem: pick.inputs[t.id]?.problem ?? t.customization.defaultProblem ?? 'plant', ...(pick.inputs[t.id]?.frameIdeas ? { frameIdeas: cleanFrameIdeas(pick.inputs[t.id].frameIdeas) } : {}) } : {};
}
export function setProblem(value, notify = true) {
  if (making()) return;
  picked = true;
  pick.inputs[pick.trend] = { ...pick.inputs[pick.trend], problem: String(value).slice(0, 48) };
  if (notify) update();
}

export function setFrameIdeas(ideas) {
  if (making() || !isProblemReveal(trendById(pick.trend))) return;
  picked = true;
  pick.inputs[pick.trend] = { ...pick.inputs[pick.trend], frameIdeas: cleanFrameIdeas(ideas) };
  update();
}

export const setKind = (kind) => ((pick.kind = kind), update());
export const pickRole = (role) => ((pick.role = pick.role === role ? null : role), update());

/** A role given to someone: one of the crew ({ crew }) or a star ({ star }). */
export function setRole(role, who) {
  if (making() || !trendById(pick.trend)?.cast.some((c) => c.role === role)) return;
  picked = true;
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
export async function addStar(file, role = uploadRole(trendById(pick.trend), pick.role)) {
  const trend = pick.trend;
  stars.uploading++;
  update();
  try {
    const p = file.file ? file : await api.upload(file, file.name);
    const star = { file: p.file, url: p.url, name: (file.file ? (file.name ?? "My star") : (file.name ?? "").replace(/\.\w+$/, "").replace(/[-_]+/g, " ")).slice(0, 24) || "My star" };
    stars.list = [star, ...stars.list.filter((s) => s.file !== star.file)];
    await keepStars();
    if (role && trend === pick.trend) setRole(role, { star });
    update();
  } catch (e) {
    toast(e.message, { tone: "crit" });
  } finally {
    stars.uploading--;
    update();
  }
}
export async function removeStar(file) {
  stars.list = stars.list.filter((s) => s.file !== file);
  await keepStars();
  update();
}

// ---------------------------------------------------------------- making it

// one of our pictures (a trend cover, a crew cat) goes to the server once, through the picker's own cache

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
// any of the crew named in a beat
const NAMES = new RegExp(`\\b(${CREW.map((c) => c.name).join("|")})\\b`, "g");
/** What happens in a take, its beats told with who is in the frame. */
function actionOf(t, cast, take) {
  const who = looks(t, cast);
  const said = take.beats.map((b) => b.text.replace(NAMES, (n) => who[n] ?? n)).join(", then ");
  return `${said}. The same characters, place and light as the first frame, playful and smooth, made for a short vertical video.\n${castVoiceDirection(cast)}`;
}

/**
 * The picture model that redraws a first frame with your cast: yours once you have picked one, else
 * GPT Image Flare, which swaps a whole person (Qwen keeps the old hair and clothes).
 */
export function castArtist() {
  const models = state.image.catalogue?.models ?? [];
  if (models.some((m) => m.id === chosenArtist())) return artistFor("edit");
  return models.some((m) => m.id === "gpt-image-2.5-flare") ? "gpt-image-2.5-flare" : artistFor("edit");
}

/** The first frame: the trend's cover (or one of a recipe's first frames), redrawn with whoever replaced the crew in it. */
async function firstFrame(t, cast, picture = trendArt(t)) {
  const cover = await onServer(picture, `${t.name} first frame`);
  const changes = cast.filter((c) => !(c.who.crew && c.who.crew === c.original));
  if (!changes.length) return { file: cover.file, url: cover.url };
  const refs = [{ file: cover.file, name: "scene" }];
  const lines = [];
  for (const c of changes) {
    const tag = c.role.toLowerCase();
    const was = crewById(c.original);
    const pic = c.who.crew ? await onServer(crewPicture(c.who.crew), crewById(c.who.crew).name) : c.who.star;
    refs.push({ file: pic.file, name: tag });
    const crew = c.who.crew ? crewById(c.who.crew) : null;
    const what = crew?.kind === "person" ? "the face, hair, clothes and colours" : crew ? "the fur, markings, colours and build" : "the face, hair and clothes, or the fur and markings";
    lines.push(`Replace ${was.name}, ${was.look}, with @${tag}: exactly @${tag}'s look, ${what}, in the same pose, place and size. Nothing of ${was.name}'s hair, clothes or colours stays.`);
  }
  const prompt = `${lines.join(" ")} Keep everything else from @scene exactly: the framing, camera, poses, gestures, expressions, lighting, colours, set and style. No text, no captions, no watermark.`;
  const photo = await drawPicture({ model: castArtist(), template: "edit", prompt, refs, aspect: "9:16", name: `${t.name} · cast` });
  return { file: photo.file, url: photo.url };
}

/** An original track in the trend's feel: never the trend's own song. */
async function music(t, seconds = Math.ceil(t.seconds) + 1) {
  const m = t.music ?? {};
  const prompt = [m.genre, m.mood, ...(m.instruments ?? []).filter((x) => !/original|new /i.test(x)).slice(0, 4), "an original catchy instrumental for a short video"].filter(Boolean).join(", ");
  const job = await send("api/audio/music", "POST", { prompt, lyrics: "", seconds, bpm: m.bpm ?? 110, name: `${t.name} track` });
  const done = await waitFor("job", job.id);
  return { file: done.audio.file, url: done.audio.url };
}

export const making = () => mixer.busy.has("trend");
export const take = (s) => (s?.run ? state.runs.find((r) => r.id === s.run) : null);

/**
 * Who plays a recipe's roles, as its prompts name them: {Lead} is that role's name and look, {LeadName}
 * the name, and {Pair} the two together (the recipe's own words for our cast).
 */
export function roleWords(recipe, cast) {
  const words = {};
  const names = [];
  let ours = true;
  for (const r of recipe.roles ?? []) {
    const who = cast.find((c) => c.role === r.role)?.who ?? { crew: r.crew };
    const crew = who.crew ? crewById(who.crew) : null;
    const name = crew?.name ?? who.star?.name ?? r.role;
    if (who.crew !== r.crew) ours = false;
    words[r.role] = `${name}, ${who.crew === r.crew ? r.look : crew ? crew.look : "as in the first frame"}`;
    words[`${r.role}Name`] = name;
    names.push(name);
  }
  words.Pair = ours && recipe.pair ? recipe.pair : names.join(" and ");
  return words;
}

/**
 * The sound a recipe's takes follow (the mouths, the beat) and the cut plays on: the recipe's own when it names one, else a track
 * made in the trend's feel, as long as its last take reaches. No recipe names one now (an original's recording is not shipped), so
 * the track is made first, before a frame is drawn or a take rolled: one that doesn't come out costs nothing else.
 */
async function recipeSound(t, recipe, files) {
  const own = files.vocals ?? files.mix;
  if (own) return own;
  const seconds = Math.ceil(Math.max(recipe.seconds, ...recipe.shots.map((s) => s.from + s.frames / 24))) + 1;
  try {
    return await music(t, seconds);
  } catch (e) {
    throw new Error(`The track didn't come out: ${e.message}`);
  }
}

/**
 * A trend we have made, made again from its recipe: each take copies our version's motion (its
 * skeleton or depth), starts on its first frame redrawn with your cast, and follows the recipe's
 * sound (see recipeSound) for the mouths.
 */
async function fromRecipe(t, cast, m, reviewedPair) {
  const recipe = await call(t.recipe);
  if (recipe.engine === "official-template") return fromNativeRecipe(t, cast, m, recipe, reviewedPair);
  const files = await send(`api/mixer/trends/${t.id}/files`, "POST");
  validateRecipe(recipe, files);
  m.body.progress = "Making the track"; save(m); update();
  const voice = m.body.music ?? await recipeSound(t, recipe, files);
  m.body.music = files.mix ?? voice; save(m);
  const words = roleWords(recipe, cast);
  const fill = (text) => text.replace(/\{(\w+)\}/g, (all, k) => words[k] ?? all);
  // our cast rolls our seeds: the same takes again
  const ours = cast.every((c) => c.who.crew && c.who.crew === c.original);
  const dir = t.recipe.replace(/recipe\.json$/, "");
  const firsts = new Map();
  const first = (path) => (firsts.has(path) ? firsts : firsts.set(path, firstFrame(t, cast, dir + path))).get(path);
  if (!m.body.shots.length) m.body.shots = recipe.shots.map((s) => ({ from: s.from, to: s.to, look: null, run: null, join: s.join ?? "cut", beats: (recipe.beats ?? []).filter((b) => b.from < s.to && b.to > s.from) }));
  save(m);
  update();
  const roll = async (i, start) => {
    const s = recipe.shots[i];
    const shot = m.body.shots[i];
    shot.look = start;
    // a shot that has a drawn last frame lands on it (redrawn with your cast like its first), so it meets the next shot at the cut
    const end = s.end ? await first(s.end) : null;
    const body = {
      name: `${m.name} · ${i + 1}`, start: start.file, seconds: Math.ceil(s.frames / 24), aspect: "9:16", review: false, takes: 1, quality: "standard",
      script: { shots: [], raw: fill(s.prompt) + "\n" + castVoiceDirection(cast) }, audio: { file: voice.file }, ...(end ? { end: { file: end.file } } : {}),
      video: { file: files.controls[s.pose ?? s.guide].file, mode: "swap", from: s.from, strength: s.strength ?? recipe.take.strength, length: s.frames, build: recipe.take.build },
      ...(ours && s.seed ? { seed: s.seed } : {}),
    };
    const current = take(shot);
    if (!current || ["failed", "canceled"].includes(current.status)) {
      const [run] = await api.shoot(body);
      shot.run = run.id;
      save(m);
      update();
    }
    m.body.progress = `Making take ${i + 1} of ${recipe.shots.length}`; save(m); update();
    await waitFor("run", shot.run);

  };
  // the shots in runs: one with a first frame of its own starts a run, a chained one starts on the
  // frame where the take before reaches it; runs roll two at a time
  const chained = (i) => i > 0 && (recipe.shots[i].chain ?? !!recipe.take.chain);
  const runs = [];
  recipe.shots.forEach((_, i) => (chained(i) ? runs.at(-1).push(i) : runs.push([i])));
  // a lane that fails stops the other from starting more takes; both settle before it is told
  let next = 0;
  let stopped = false;
  const lane = async () => {
    try {
      while (next < runs.length && !stopped) {
        for (const i of runs[next++]) {
          const s = recipe.shots[i];
          const join = () => send(`api/runs/${m.body.shots[i - 1].run}/frame`, "POST", { frame: Math.round((s.from - recipe.shots[i - 1].from) * 24) });
          if (stopped) break;
          if (take(m.body.shots[i])?.status === "done") continue;
          m.body.progress = m.body.shots[i].look ? `Making take ${i + 1} of ${recipe.shots.length}` : `Drawing frame ${i + 1} of ${recipe.shots.length}`; save(m); update();
          await roll(i, m.body.shots[i].look ?? (chained(i) ? await join() : await first(s.look ?? recipe.look)));
        }
      }
    } catch (e) {
      stopped = true;
      throw e;
    }
  };
  const failed = (await Promise.allSettled([lane(), lane()])).find((x) => x.status === "rejected");
  save(m);
  if (failed) throw failed.reason;
  m.body.music = files.mix ?? voice;
  save(m);
  return recipe;
}

/** Native-audio recipes keep the generated dialogue and foley with their video. */
async function fromNativeRecipe(t, cast, m, recipe, reviewedPair) {
  validateRecipe(recipe, {});
  const problem = isProblemReveal(recipe) ? cleanProblem(m.body.trend.inputs?.problem) : null;
  if (problem) recipe = { ...recipe, shots: recipe.shots.map(s => ({ ...s, prompt: problemVideoPrompt(problem, m.body.trend.inputs?.frameIdeas) })) };
  const words = roleWords(recipe, cast);
  let pair;
  if (problem) {
    const who = cast[0].who;
    const lead = who.crew ? await onServer(crewPicture(who.crew), crewById(who.crew).name) : who.star;
    m.body.revealFrames ??= {};
    pair = await prepareProblemFrames(problem, lead, m.body.revealFrames, {
      ideas: m.body.trend.inputs?.frameIdeas,
      crop: photo => send('api/mixer/reveal-frame', 'POST', { file: photo.file }),
      submit: body => send('api/image', 'POST', body), wait: async id => {
        let job = await call(`api/image/jobs/${id}`);
        while (job.status === 'running' || job.status === 'queued') {
          await new Promise(resolve => setTimeout(resolve, 2000));
          job = await call(`api/image/jobs/${id}`);
        }
        if (job.status !== 'done') throw new Error(job.error ?? 'The reference image did not finish.');
        return job;
      },
      persist: () => save(m), progress: label => { m.body.progress = label; save(m); update(); },
    });
  }
  if (pair) {
    if (!reviewedPair) {
      m.body.progress = "Frames ready · review them before generating your video";
      save(m); update();
      return null;
    }
    if (reviewedPair.first !== pair.first.file || reviewedPair.last !== pair.last.file)
      throw new Error("Your frames changed. Review the new pair before generating video.");
    m.body.frameApproval = { ...reviewedPair, approvedAt: new Date().toISOString() };
    save(m);
  }
  const dir = t.recipe.replace(/recipe\.json$/, "");
  const frames = new Map();
  if (!m.body.shots.length) m.body.shots = recipe.shots.map(s => ({ from: s.from, to: s.to, look: null, run: null, native: null, output: null }));
  recipe.shots.forEach((s, i) => { if (m.body.shots[i]?.look) frames.set(dir + (s.look ?? recipe.look), m.body.shots[i].look); });
  m.body.music = null;
  save(m);
  for (const [i, s] of recipe.shots.entries()) {
    const shot = m.body.shots[i];
    if (shot.output) continue;
    m.body.progress = `Drawing frame ${i + 1} of ${recipe.shots.length}`; update();
    const lookPath = dir + (s.look ?? recipe.look);
    if (shot.look) frames.set(lookPath, shot.look);
    shot.look ??= pair?.first ?? frames.get(lookPath) ?? await firstFrame(t, cast, lookPath);
    if (pair) shot.lastLook = pair.last;
    frames.set(lookPath, shot.look);
    save(m);
    if (shot.submissionPending && !shot.native?.id)
      throw new Error("The previous submission needs checking on Comfy Cloud before trying again; no duplicate was sent.");
    if (!shot.native?.id || ["failed", "canceled"].includes(shot.native.status)) {
      shot.submissionPending = true;
      shot.startedAt = new Date().toISOString();
      save(m);
      try {
        const prompt = s.prompt.replace(/\{(\w+)\}/g, (all, k) => words[k] ?? all) + "\n" + castVoiceDirection(cast);
        const seed = cast.every(c => c.who.crew === c.original) ? s.seed : Math.floor(Math.random() * 2147483647);
        shot.voiceDirection = castVoiceDirection(cast);
        shot.native = await send(`api/utensils/templates/${recipe.template}/run`, "POST", nativeRecipeRequest(recipe, s, shot.look.file, prompt, seed, shot.lastLook?.file));
        shot.submissionPending = false;
      } catch (e) {
        // A lost response may still mean a paid job started. Only definite request rejection is retryable.
        if (e.status >= 400 && e.status < 500) shot.submissionPending = false;
        save(m);
        throw e;
      }
      save(m);
    }
    while (shot.native.status === "running") {
      m.body.progress = `${shot.native.phase === "queued" ? "Queued" : "Animating with sound"} · take ${i + 1} of ${recipe.shots.length}`;
      save(m); update();
      await new Promise(resolve => setTimeout(resolve, 2000));
      shot.native = await call(`api/utensils/templates/job/${shot.native.id}`);
    }
    save(m);
    if (shot.native.status !== "done") throw new Error(shot.native.error ?? "This take did not finish.");
    shot.output = shot.native.outputs?.find(o => o.kind === "video");
    if (!shot.output) throw new Error("This take finished without a video.");
    shot.render = { model: recipe.model ?? "MiniMax H3 · FastH3", finishedAt: new Date().toISOString(),
      elapsedSeconds: (Date.now() - Date.parse(shot.startedAt)) / 1000,
      estimatedCredits: shot.native.credits ?? null, actualCostCredits: null,
      costNote: "Actual per-job billing was not supplied by the provider." };
    save(m); update();
  }
  for (const shot of m.body.shots) await applyCharacterVoice(recipe, cast, shot, {
    call, send,
    upload: async (url, type, name) => {
      const media = await fetch(url);
      if (!media.ok) throw new Error('The voice source could not be loaded.');
      return call('api/audio?name=' + encodeURIComponent(name), { method: 'POST', headers: { 'Content-Type': type }, body: await media.blob() });
    },
    persist: () => save(m), progress: (label) => { m.body.progress = label; save(m); update(); },
    sleep: () => new Promise(resolve => setTimeout(resolve, 2000)),
  });
  return recipe;
}

/** The trend, made: its first frame, its takes rolled two at a time, its own track, cut together. */
export function reviewFrames(t = trendById(pick.trend)) {
  if (!isProblemReveal(t) || !canResumeTrend(mixer.mix, t.id, (castOf(t), pick.cast.roles), t.revision ?? 1, trendInputs(t))) return null;
  const frames = mixer.mix.body.revealFrames;
  return frames?.close?.photo?.file && frames?.wide?.photo?.file && frames.close.method === 'crop-v1' && frames.close.source === frames.wide.photo.file ? frames : null;
}

// Capture the actual draft and pair so a confirmation cannot approve a different selection.
export function generationIdentity() {
  const t = trendById(pick.trend);
  castOf(t);
  return JSON.stringify({ trend: t?.id, revision: t?.revision, roles: pick.cast?.roles, inputs: trendInputs(t),
    mix: mixer.mix?.id, frames: reviewFrames(t) });
}
export async function generateTrendVideo(identity) {
  const frames = reviewFrames();
  if (!frames || identity !== generationIdentity()) {
    toast("Review the current start and end frames before generating video.", { tone: 'crit' });
    return;
  }
  return runTrend({ first: frames.close.photo.file, last: frames.wide.photo.file });
}
export async function makeTrend({ freshFrames = false } = {}) {
  return runTrend(null, freshFrames);
}
async function runTrend(reviewedPair = null, freshFrames = false) {
  const t = trendById(pick.trend);
  if (!t || t.soon || making() || stars.uploading) return;
  const cast = structuredClone(castOf(t));
  const roles = structuredClone(pick.cast.roles);
  let inputs = trendInputs(t);
  try { if (isProblemReveal(t)) inputs = { ...inputs, problem: cleanProblem(inputs.problem), ...(inputs.frameIdeas ? { frameIdeas: cleanFrameIdeas(inputs.frameIdeas) } : {}) }; }
  catch (error) { toast(error.message, { tone: 'crit' }); return; }
  let m;
  mixer.busy.add("trend");
  update();
  try {
    m = !freshFrames && canResumeTrend(mixer.mix, t.id, roles, t.revision ?? 1, inputs) ? mixer.mix : await newMix();
    const resume = m.body.kind === "trend";
    m.body.error = null;
    m.body.progress = "Preparing your trend";
    m.name = `${t.name} · ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
    if (!resume) Object.assign(m.body, { kind: "trend", trend: { id: t.id, revision: t.revision ?? 1, cast: roles, inputs }, aspect: "9:16", shots: [], film: null, music: null });
    save(m);
    update();
    if (t.recipe) {
      const recipe = await fromRecipe(t, cast, m, reviewedPair);
      if (!recipe) return; // The reference review is a separate, explicit user action.
      await cutTogether(m, t, recipe.seconds);
      return;
    }
    m.body.progress = "Making the track"; save(m); update();
    m.body.music ??= await music(t);
    save(m);
    m.body.progress = "Drawing your first frame"; update();
    const frame = m.body.shots[0]?.look ?? await firstFrame(t, cast);
    if (!m.body.shots.length) m.body.shots = takesOf(t).map((tk) => ({ from: tk.from, to: tk.to, look: frame, run: null, beats: tk.beats }));
    save(m);
    update();
    let next = 0;
    let stopped = false;
    const roll = async () => {
      while (next < m.body.shots.length && !stopped) {
        const i = next++;
        const s = m.body.shots[i];
        const body = { name: `${m.name} · ${i + 1}`, start: frame.file, seconds: Math.min(10, Math.max(2, Math.ceil(s.to - s.from))), aspect: "9:16", review: false, takes: 1, quality: "standard", script: { shots: [{ action: actionOf(t, cast, s), camera: "", sound: "", framing: "" }], raw: "" }, loras: mixLoras() };
        const current = take(s);
        if (!current || ["failed", "canceled"].includes(current.status)) {
          const [run] = await api.shoot(body);
          s.run = run.id;
          save(m);
          update();
        }
        m.body.progress = `Making take ${i + 1} of ${m.body.shots.length}`; save(m); update();
        try { await waitFor("run", s.run); } catch (e) { stopped = true; throw e; }
      }
    };
    const lanes = await Promise.allSettled([roll(), roll()]);
    const failed = lanes.find((x) => x.status === "rejected");
    if (failed) throw failed.reason;
    save(m);
    if (!m.body.shots.every((s) => take(s)?.status === "done")) throw new Error("A take didn't come out: open the mix and roll it again.");
    await cutTogether(m, t);
  } catch (e) {
    if (m) { m.body.error = e.message; save(m); }
    toast(e.message, { tone: "crit" });
  } finally {
    mixer.busy.delete("trend");
    update();
  }
}

/** The takes on the mix's track, the trend's caption on top: a Cut of its own, rendered. */
async function cutTogether(m, t, seconds = t.seconds) {
  m.body.progress = "Finishing your video"; save(m); update();
  const items = m.body.shots.map((s, i) => {
    const r = take(s);
    const need = s.to - s.from;
    const have = s.output ? (s.output.seconds ?? need) : r.length ?? r.request.seconds;
    const speed = have < need ? Math.max(0.25, have / need) : 1;
    return { id: `t${i + 1}`, src: s.output ? { kind: "video", id: s.output.file } : { kind: "take", id: r.id }, from: 0, to: Math.min(have, need * speed), speed, sound: !m.body.music && !s.voicePass?.converted, join: s.join ?? "cut" };
  });
  const tracks = [{ id: "video", kind: "video", main: true, items }];
  for (const [i, shot] of m.body.shots.entries()) {
    if (!shot.voicePass?.converted) continue;
    for (const [part, role] of [['converted', 'voice'], ['ambience', 'effects']]) {
      const audio = shot.voicePass[part];
      if (audio) tracks.push({ id: `${part}-${i}`, kind: 'audio', role, items: [{ id: `${part}-${i}`, src: { kind: 'audio', id: audio.file }, start: shot.from, from: 0, to: shot.to - shot.from, volume: part === 'ambience' ? (shot.voicePass.ambienceVolume ?? 0.25) : 1 }] });
    }
  }
  if (m.body.music) tracks.push({ id: "music", kind: "audio", role: "music", items: [{ id: "track", src: { kind: "audio", id: m.body.music.file }, start: 0, from: 0, to: seconds }] });
  if (t.caption) tracks.push({ id: "caption", kind: "title", items: [{ id: "c1", text: t.caption, start: 0, length: seconds, style: "top" }] });
  const body = { aspect: "9:16", tracks, product: "mixer" };
  const id = m.body.cut ?? (await send("api/cuts", "POST", { name: m.name, body })).project.id;
  if (m.body.cut) await send(`api/cuts/${id}`, "PUT", { name: m.name, body });
  m.body.cut = id;
  const film = await send(`api/cuts/${id}/render`, "POST", {});
  m.body.film = { url: film.url, seconds: film.seconds, id: film.id, poster: m.body.shots[0]?.look?.url };
  m.body.progress = "Done";
  state.films = [film, ...(state.films ?? []).filter((f) => f.id !== film.id)];
  save(m);
}

/** Roughly what making the trend costs, in Comfy credits. */
export function estimate(t = trendById(pick.trend)) {
  if (state.info?.target !== "comfy-cloud" || !t) return null;
  if (t.engine === "official-template") return null; // GPU-time billing; no invented per-second price.
  const cast = castOf(t);
  const redraw = cast.some((c) => !(c.who.crew && c.who.crew === c.original));
  const m = (state.image.catalogue?.models ?? []).find((x) => x.id === castArtist());
  const pic = m?.router ? m.credits ?? 8 : (m?.seconds ?? 10) * 0.266;
  // a recipe's takes: LTX-2.5 dev at full size, about 45 GPU seconds a second, a redraw per first frame, and its track (ACE-Step)
  if (t.made) return Math.round((redraw ? pic * t.made.firsts : 0) + t.made.seconds * 45 * 0.266 + t.seconds * 1.3 * 0.266);
  const seconds = takesOf(t).reduce((s, tk) => s + Math.min(10, Math.max(2, Math.ceil(tk.to - tk.from))), 0);
  return Math.round((redraw ? pic : 0) + seconds * 18 * 0.266 + t.seconds * 1.3 * 0.266);
}
