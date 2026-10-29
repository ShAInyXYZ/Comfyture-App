// Backstage stores creative assets with the Jam. It reuses Mixer's image and native
// template APIs and adds the chosen results to the same edit, with generated sound muted.
import { jam, save, flushJams, edit, partMatchesSpan } from './jam.js';
import { changed, state, mentionables } from './store.js';
import { pictureOf } from './picker.js';
import { backstageMentionables, namesIn, resolveBackstageMentions, bindBackstageMentions, labelBackstageCast } from './jam-backstage-mentions.js';
import { api } from './api.js';
import { cut, commit, flushCuts } from './cut.js';
import { blankBackstage, newAsset, validateScene, nextSceneRange, planFromTrack, imageRequest, videoRequest, timelineItems, reconcileTimeline, VIDEO_MODELS, ASPECTS, FORMATS, sceneDuration } from './jam-backstage-model.js';
import { runAssetJob, replaceAssetMedia } from './jam-backstage-jobs.js';
export { VIDEO_MODELS, sceneDuration };

export function backstageOf(j = jam.jam) {
  if (!j?.body) return null;
  const b = j.body.backstage ??= blankBackstage();
  b.scenes ??= []; b.characters ??= []; b.cover ??= blankBackstage().cover;
  b.aspect ??= '16:9'; b.style ??= ''; b.format ??= 'music-video';
  return b;
}
const requireJam = () => { if (!jam.jam?.body.track) throw new Error('Choose a song first.'); return jam.jam; };
const touch = j => { save(j); changed('jam'); };
const itemOf = (id, j = requireJam()) => {
  const b = backstageOf(j), item = id === 'cover' ? b.cover : [...b.scenes, ...b.characters].find(s => s.id === id);
  if (!item) throw new Error('This asset is no longer in Backstage.');
  return item;
};
const pending = item => Object.values(item.jobs ?? {}).some(j => ['submitting', 'running', 'unknown'].includes(j.status));
export function setBackstage(patch) {
  const j = requireJam(), b = backstageOf(j);
  if (patch.aspect !== undefined && !ASPECTS.includes(patch.aspect)) throw new Error('Choose a supported frame shape.');
  if (patch.format !== undefined && !FORMATS.includes(patch.format)) throw new Error('Choose a supported video format.');
  for (const key of ['aspect', 'format', 'style']) if (patch[key] !== undefined) b[key] = key === 'style' ? String(patch[key]).slice(0, 1500) : patch[key];
  touch(j); return b;
}
export function planScenes({ scope = 'cut', maxSeconds = 10 } = {}) {
  const j = requireJam(), b = backstageOf(j);
  if (b.scenes.length) throw new Error('Your scene plan is already saved. Add or edit shots individually to keep your existing work.');
  b.scenes = planFromTrack(j.body.track, { span: scope === 'track' ? undefined : j.body.span, maxSeconds, format: b.format });
  touch(j); return b.scenes;
}
export function addScene(values = {}) {
  const j = requireJam(), b = backstageOf(j), seconds = Number(j.body.track.seconds);
  const from = Number(values.from ?? j.body.span?.from) || 0;
  const range = values.from === undefined && values.to === undefined
    ? nextSceneRange(b.scenes, seconds, j.body.span)
    : { from, to: Math.min(seconds, from + 6) };
  const item = validateScene(newAsset({ ...range, ...values }), seconds, b.scenes);
  b.scenes.push(item); touch(j); return item;
}
export function updateScene(id, patch) {
  const j = requireJam(), b = backstageOf(j), item = itemOf(id, j);
  if (pending(item)) throw new Error('Wait for this generation or resume its status before editing the asset.');
  const allowed = ['title', 'from', 'to', 'prompt', 'endPrompt', 'motion', 'model', 'characterIds'];
  const next = { ...item };
  for (const key of allowed) if (patch[key] !== undefined) next[key] = ['from', 'to'].includes(key) ? Number(patch[key]) : key === 'characterIds' ? [...new Set(patch[key])].filter(id => b.characters.some(c => c.id === id)) : String(patch[key]).slice(0, key === 'title' ? 90 : 3000);
  if (!VIDEO_MODELS.some(m => m.id === next.model) && next.model !== undefined) throw new Error('Choose a supported video model.');
  if (b.scenes.includes(item)) Object.assign(next, validateScene(next, j.body.track.seconds, b.scenes));
  Object.assign(item, next); touch(j); return item;
}
export const updateAsset = updateScene;
export async function removeScene(id) {
  const j = requireJam(), b = backstageOf(j), item = itemOf(id, j);
  if (pending(item)) throw new Error('A pending asset cannot be removed. Check its generation first.');
  // Remove only this scene's own placement. Its source and previous generations remain archived.
  if (j.body.cut && item.addedToEdit?.cut === j.body.cut) {
    const body = await edit(j);
    if (!body || jam.jam !== j || cut.project?.id !== j.body.cut) throw new Error('Open this Jam before removing its scene from the edit.');
    for (const track of body.tracks) track.items = track.items.filter(it => it.id !== `backstage-${id}` || it.backstage !== id);
    commit(); await flushCuts();
  }
  (b.archived ??= []).push(item); b.scenes = b.scenes.filter(s => s.id !== id); touch(j);
}
export function addCharacter(values = {}) {
  const j = requireJam(), b = backstageOf(j);
  const item = newAsset({ title: 'New character', ...values }, `character-${crypto.randomUUID()}`);
  b.characters.push(item); touch(j); return item;
}
export function removeCharacter(id) {
  const j = requireJam(), b = backstageOf(j), item = itemOf(id, j);
  if (pending(item)) throw new Error('A pending character cannot be removed. Check its generation first.');
  (b.archived ??= []).push(item); b.characters = b.characters.filter(c => c.id !== id);
  for (const s of b.scenes) s.characterIds = (s.characterIds ?? []).filter(x => x !== id);
  touch(j);
}
export async function attachAsset(id, slot, input) {
  if (!['reference', 'image', 'endImage', 'video'].includes(slot)) throw new Error('Choose an image or video slot.');
  const j = requireJam(), item = itemOf(id, j);
  if (pending(item)) throw new Error('Wait for the pending generation before changing its reference.');
  if (!input) {
    replaceAssetMedia(item, slot, null); touch(j); return null;
  }
  if (!input.file && !(slot === 'video' ? input.type?.startsWith('video/') : input.type?.startsWith('image/'))) throw new Error(slot === 'video' ? 'Choose a video file.' : 'Choose an image file.');
  const media = input.file ? input : slot === 'video' ? await api.uploadVideo(input) : await api.upload(input, input.name);
  replaceAssetMedia(item, slot, media); touch(j); return media;
}
let catalogueImageCredits = null;
const mentionText = (item, board, kind) => [board.style, kind === 'endImage' ? item.endPrompt || item.prompt : item.prompt, kind === 'endImage' ? item.motion : ''].filter(Boolean).join('\n');
/** Prepare existing and newly typed @ references before showing the paid review. */
export async function prepareBackstageMentions(id, kind) {
  if (kind === 'video') return;
  const j = requireJam(), item = itemOf(id, j), board = backstageOf(j);
  const text = mentionText(item, board, kind);
  const refs = await resolveBackstageMentions(text, backstageMentionables(board, mentionables(), item, kind), character => pictureOf({ kind: 'character', character }));
  if (jam.jam !== j || itemOf(id, j) !== item || mentionText(item, board, kind) !== text) throw new Error('The direction changed while preparing references. Review it again.');
  item.mentionRefs = refs;
  touch(j);
}
function specification(id, kind, j = requireJam()) {
  const item = itemOf(id, j), board = backstageOf(j);
  if (kind === 'video') {
    if (!board.scenes.includes(item)) throw new Error('Only timestamped scenes can become videos.');
    validateScene(item, j.body.track.seconds, board.scenes);
    const { template, body } = videoRequest(item, board, item.seed ?? 1);
    return { path: `api/utensils/templates/${template}/run`, body, template, model: VIDEO_MODELS.find(m => m.id === item.model).name };
  }
  const names = namesIn(mentionText(item, board, kind));
  const resolved = names.map(name => (item.mentionRefs ?? []).find(ref => ref.name === name));
  if (resolved.some(ref => !ref)) throw new Error('Review this image to prepare its @ references.');
  return { path: 'api/image', body: bindBackstageMentions(labelBackstageCast(imageRequest(item, board, kind), item, board), resolved), model: 'GPT Image 2.5 Flare', estimatedCredits: state.image?.catalogue?.models?.find(m => m.id === 'gpt-image-2.5-flare')?.credits ?? catalogueImageCredits };
}
export function generationDetails(id, kind) {
  const j = requireJam(), item = itemOf(id, j), spec = specification(id, kind, j);
  const inputs = spec.body.inputs ?? spec.body;
  return { id, kind, title: item.title, model: spec.model, template: spec.template ?? null, duration: kind === 'video' ? inputs.duration : null, timelineDuration: kind === 'video' ? sceneDuration(item) : null,
    width: inputs.width ?? null, height: inputs.height ?? null, aspect: id === 'cover' ? '1:1' : backstageOf(j).aspect, frames: kind === 'video' ? [item.image, item.endImage].filter(Boolean) : [],
    references: spec.body.refs ?? [], prompt: inputs.prompt, request: spec.body, soundtrack: kind === 'video' ? 'The original song; generated audio is muted in the edit.' : null,
  };
}
export async function estimateGeneration(id, kind) {
  generationDetails(id, kind); // Reject invalid requests before pricing.
  if (kind === 'video') return { credits: null, note: 'Billed for active Comfy Cloud GPU time. No reliable per-shot quote is available; queue time is not billed GPU execution time.' };
  const catalogue = state.image?.catalogue ?? await api.imageModels();
  const credits = catalogue.models?.find(m => m.id === 'gpt-image-2.5-flare')?.credits;
  catalogueImageCredits = Number.isFinite(credits) ? credits : null;
  return { credits: Number.isFinite(credits) ? credits : null, note: 'One GPT Image 2.5 Flare image. Catalogue estimate; retries and video are billed separately.' };
}
export async function writeVideoPrompt(id, expected) {
  const j = requireJam(), item = itemOf(id, j), board = backstageOf(j);
  const details = generationDetails(id, 'video');
  if (JSON.stringify(details) !== expected) throw new Error('The scene changed. Review the updated request first.');
  const response = await fetch('api/jam/video-prompt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
    videoModel: item.model, duration: details.duration, frames: details.frames.map(frame => frame.file),
    format: board.format, style: board.style, scene: item.prompt, motion: item.motion,
  }) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'The writer could not prepare the video prompt.');
  if (jam.jam !== j || JSON.stringify(generationDetails(id, 'video')) !== expected) throw new Error('The scene changed while the prompt was written. Review it again.');
  if (typeof result.prompt !== 'string' || !result.prompt.trim() || result.prompt.length > 6000) throw new Error('The writer returned an invalid prompt.');
  return result;
}
const active = new Map();
const request = async (path, body) => {
  const res = await fetch(path, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const error = new Error(data.error ?? `Request failed (${res.status})`); error.status = res.status; throw error; }
  return data;
};
async function run(id, kind, { resume = false, prompt } = {}) {
  const j = requireJam(), item = itemOf(id, j), key = `${j.id}:${id}:${kind}`;
  if (active.has(key)) return active.get(key);
  const specificationNow = resume ? null : specification(id, kind, j);
  if (kind === 'video' && specificationNow && prompt) specificationNow.body.inputs.prompt = prompt;
  if (specificationNow?.body.inputs) specificationNow.body.inputs.seed = Math.floor(Math.random() * 2147483647);
  const task = runAssetJob(item, kind, specificationNow, {
    post: request, get: request, sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
    save: async () => { touch(j); await flushJams(); },
    importVideo: async output => {
      if (/^\/?media\/videos\//.test(output.url) && output.file && Number(output.duration ?? output.seconds) > 0) return { ...output, duration: Number(output.duration ?? output.seconds) };
      const url = new URL(output.url, location.href);
      if (url.origin !== location.origin) throw new Error('The generated clip is not saved locally yet. Resume when the provider has stored it.');
      const media = await fetch(url); if (!media.ok) throw new Error('The generated clip could not be opened. Resume to retry its download.');
      return api.uploadVideo(await media.blob());
    },
  }, { resume }).finally(() => active.delete(key));
  active.set(key, task); return task;
}
export function generateAsset(id, kind, { confirm = false, expected, prompt } = {}) {
  if (!confirm) throw new Error('Review and confirm this generation before spending credits.');
  if (expected && JSON.stringify(generationDetails(id, kind)) !== expected) throw new Error('The generation changed. Review the current settings before confirming.');
  if (kind === 'video' && (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 6000)) throw new Error('Write and review the video prompt first.');
  return run(id, kind, { prompt });
}
export const resumeAsset = (id, kind) => run(id, kind, { resume: true });
/** Reconnect known accepted jobs on entering Backstage. This never submits a paid request. */
export function resumeBackstageJobs(j = jam.jam) {
  if (!j?.body.track || j !== jam.jam) return Promise.resolve([]);
  const board = backstageOf(j);
  const work = [board.cover, ...board.scenes, ...board.characters].flatMap(item =>
    Object.entries(item.jobs ?? {}).filter(([, job]) => job.id && job.status === 'running' && !job.error)
      .map(([kind]) => run(item.id, kind, { resume: true })));
  return Promise.allSettled(work);
}
export async function useCover() {
  const j = requireJam(), image = backstageOf(j).cover.image;
  if (!image?.url) throw new Error('Create or upload cover artwork first.');
  await api.setCover({ file: j.body.track.file, cover: image.url });
  j.body.track.cover = image.url; touch(j); return image;
}
export async function insertScenes(ids) {
  const j = requireJam(), b = backstageOf(j), selected = b.scenes.filter(s => ids.includes(s.id));
  if (jam.busy.has('part', j) || !partMatchesSpan(j.body)) throw new Error('Wait for the selected audio range to finish preparing before adding scenes.');
  const part = j.body.part, span = { ...j.body.span };
  const items = timelineItems(selected, span);
  if (!items.length) throw new Error('Choose a generated scene inside the current video cut.');
  const body = await edit(j);
  if (!body || jam.jam !== j || cut.project?.id !== j.body.cut || cut.project.body !== body || j.body.part !== part || jam.busy.has('part', j) || !partMatchesSpan(j.body)) throw new Error('The audio range changed. Wait for it to finish preparing, then add the scenes again.');
  const track = body.tracks.find(t => t.id === 'v2');
  if (!track) throw new Error('The edit has no overlay track.');
  // Only explicit replacement of this scene's own former placement is allowed.
  track.items = reconcileTimeline(track.items, b.scenes, items, span);
  body.aspect = b.aspect; body.fit = 'cover'; body.duck = false;
  for (const s of selected) s.addedToEdit = { cut: j.body.cut, at: new Date().toISOString(), asset: (s.video ?? s.image)?.file };
  commit(); await flushCuts(); touch(j);
  return items.length;
}
