// Pure Backstage planning and requests. Scene times always refer to the full song;
// the edit projection is the only place that converts them into cut-local time.
import { sectionSpans, lyricTimeline, timingCovers } from './song-lyrics.js';

export const VIDEO_MODELS = [
  { id: 'ltx-2.5', name: 'LTX 2.5 Distilled', endFrame: true },
  { id: 'fast-h3', name: 'Fast H3', endFrame: false },
];
export const ASPECTS = ['16:9', '9:16', '1:1'];
export const FORMATS = ['music-video', 'opening', 'ending', 'game-cinematic', 'lyric-video', 'podcast'];
export const FORMAT_DIRECTION = {
  'music-video': 'A coherent music-video world with recurring visual motifs and clear character identity.',
  opening: 'A television or anime opening: establish the world and character silhouettes, intentional cinematic composition, room for title and credit overlays. Build energy through planned shots rather than frantic movement within one shot.',
  ending: 'A television or anime ending: quiet emotional moments, atmospheric environments, restrained camera motion and negative space for closing credits.',
  'game-cinematic': 'A game cinematic: readable environmental storytelling, a consistent protagonist and world design, purposeful camera framing and controlled physical action.',
  'lyric-video': 'A lyric video: atmospheric artwork with a calm central or lower area, strong text readability and uncluttered negative space. Lettering is added later by the caption editor.',
  podcast: 'Editorial illustrations for a podcast: clear subjects and places, a coherent visual language, ample room for readable spoken-word captions.',
};
const round = n => Math.round(n * 1000) / 1000;
export const sceneDuration = scene => round(Number(scene.to) - Number(scene.from));
export function blankBackstage() {
  return { version: 1, aspect: '16:9', style: '', format: 'music-video', scenes: [], characters: [], cover: { id: 'cover', title: 'Album cover', prompt: '', image: null, reference: null, jobs: {}, history: [] } };
}
export function newAsset(values = {}, id = `scene-${globalThis.crypto.randomUUID()}`) {
  return { id, title: 'New scene', from: 0, to: 6, prompt: '', motion: 'A slow, steady camera move. Subtle natural movement, no sudden action.', model: 'ltx-2.5', characterIds: [], reference: null, image: null, endImage: null, video: null, jobs: {}, history: [], error: null, ...values, id };
}
export function validateScene(scene, seconds, others = []) {
  const from = Number(scene.from), to = Number(scene.to);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to <= from || to - from < 0.25) throw new Error('Give this scene a start and end at least 0.25 seconds apart.');
  if (Number(seconds) > 0 && to > seconds + 0.001) throw new Error('This scene ends after the song.');
  if (to - from > 30) throw new Error('Keep each scene within 30 seconds. Split longer sections into separate shots.');
  if (others.some(s => s.id !== scene.id && from < Number(s.to) - 0.001 && to > Number(s.from) + 0.001)) throw new Error('This scene overlaps another shot. Adjust its start or end first.');
  return { ...scene, from: round(from), to: round(to) };
}
/** Find room for a new shot without moving the existing plan or leaving the chosen range. */
export function nextSceneRange(scenes, seconds, span) {
  const duration = Number(seconds);
  if (!(duration > 0)) throw new Error('Choose a song before adding a scene.');
  const from = Math.max(0, Number(span?.from) || 0);
  const to = Math.min(duration, Number.isFinite(Number(span?.to)) ? Number(span.to) : duration);
  if (to <= from) throw new Error('Choose a valid section of the song.');
  const occupied = scenes.map(scene => ({ from: Number(scene.from), to: Number(scene.to) }))
    .filter(scene => Number.isFinite(scene.from) && Number.isFinite(scene.to) && scene.to > from && scene.from < to)
    .sort((a, b) => a.from - b.from);
  let cursor = from;
  for (const scene of occupied) {
    if (round(scene.from - cursor) >= 0.25) return { from: round(cursor), to: round(Math.min(cursor + 6, scene.from)) };
    cursor = Math.max(cursor, scene.to);
  }
  if (round(to - cursor) >= 0.25) return { from: round(cursor), to: round(Math.min(cursor + 6, to)) };
  throw new Error('This audio range is fully planned. Shorten or remove a scene to make room, or choose another range.');
}
export function planFromTrack(track, { span, maxSeconds = 10, format = 'music-video' } = {}) {
  const seconds = Number(track?.seconds);
  if (!(seconds > 0)) throw new Error('Choose a song before planning its scenes.');
  const from = Math.max(0, Number(span?.from) || 0), to = Math.min(seconds, Number(span?.to) || seconds);
  if (to <= from) throw new Error('Choose a valid section of the song.');
  const size = Math.max(2, Math.min(30, Number(maxSeconds) || 10));
  const synced = timingCovers(track.timing, seconds);
  const tags = synced ? sectionSpans(track.lyrics, seconds, track.timing).filter(s => s.to > s.from) : [];
  // Untimed lyrics never masquerade as measured sections. Uncovered regions stay neutral scenes.
  const boundaries = [...new Set([from, to, ...tags.flatMap(s => [s.from, s.to]).filter(n => n > from && n < to)])].sort((a, b) => a - b);
  const lyrics = synced ? lyricTimeline(track.lyrics, seconds, track.timing).filter(x => x.kind === 'line') : [];
  const scenes = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const a = boundaries[i], z = boundaries[i + 1];
    if (z - a < 0.25) continue;
    const section = tags.find(s => a >= s.from - 0.001 && a < s.to - 0.001);
    const count = Math.ceil((z - a) / size);
    for (let k = 0; k < count; k++) {
      const start = round(a + k * (z - a) / count), end = round(a + (k + 1) * (z - a) / count);
      const label = section?.label || section?.name || 'Scene';
      const excerpt = lyrics.filter(l => l.from < end && l.to > start).map(l => l.text).join('\n');
      scenes.push(newAsset({ title: `${label}${count > 1 ? ` · ${k + 1}` : ''}`, from: start, to: end, section: label, timingSource: section ? 'synced-lyrics' : 'manual', lyricExcerpt: excerpt,
        prompt: format === 'podcast' ? 'A considered editorial image supporting this part of the conversation. Describe the person, place or idea here.' : '',
      }));
    }
  }
  return scenes;
}
function photoRef(asset, name) { return asset?.file ? { file: asset.file, name } : null; }
export function imageRequest(item, board, kind = 'image') {
  if (!['image', 'endImage'].includes(kind)) throw new Error('Choose a start or end image.');
  if (!item.prompt?.trim() && !(kind === 'endImage' && item.endPrompt?.trim())) throw new Error('Describe the image before generating it.');
  if (kind === 'endImage' && !item.image?.file) throw new Error('Create or upload a start frame first, so the end frame can preserve its scene.');
  const characterRefs = (item.characterIds ?? []).map(id => board.characters.find(c => c.id === id)).filter(Boolean).map((c, i) => photoRef(c.image ?? c.reference, `character-${i + 1}`)).filter(Boolean);
  const refs = [kind === 'endImage' ? photoRef(item.image, 'start-frame') : null, photoRef(item.reference, 'identity-reference'), ...characterRefs].filter(Boolean);
  const unique = refs.filter((r, i) => refs.findIndex(x => x.file === r.file) === i);
  const character = board.characters.some(c => c.id === item.id);
  const cover = item.id === 'cover';
  const contract = kind === 'endImage'
    ? 'Create a separate high-resolution end frame using @start-frame as the scene continuity anchor. Keep the same character identity, clothing, location geometry, lighting and color treatment. Change the framing and small pose details only as directed. For a wider composition extend the scene outward, not a low-resolution crop.'
    : cover ? 'Create original album-cover artwork. Use identity references for appearance only; invent a fresh composition, pose and setting. Leave typography to the editor; no lettering, watermark or logos.'
    : character ? 'Create an original character reference for a music-video cast. Preserve identity from any supplied reference without copying its exact pose, background or crop. A clear readable design with consistent costume and face.'
    : 'Create a fresh cinematic scene for a music video. Any character references establish identity only: create the requested pose, expression, costume and environment rather than pasting the reference portrait. No captions, lettering, logos or watermark.';
  const prompt = [contract, FORMAT_DIRECTION[board.format] ?? FORMAT_DIRECTION['music-video'], board.style?.trim() && `Shared visual direction: ${board.style.trim()}`, `Scene direction: ${kind === 'endImage' ? item.endPrompt?.trim() || item.prompt.trim() : item.prompt.trim()}`, kind === 'endImage' && item.motion?.trim() && `Motion to bridge from the start: ${item.motion.trim()}`].filter(Boolean).join('\n\n');
  if (prompt.length > 6000) throw new Error('Shorten the scene and visual direction so the full image prompt stays under 6,000 characters.');
  return { model: 'gpt-image-2.5-flare', template: unique.length ? 'edit' : 'generate', prompt, aspect: cover ? '1:1' : board.aspect, megapixels: 1, count: 1, refs: unique, name: `${item.title} · ${cover ? 'cover' : character ? 'character' : kind === 'endImage' ? 'end frame' : 'start frame'}` };
}
export function videoRequest(scene, board, seed = Math.floor(Math.random() * 2147483647)) {
  if (!scene.image?.file) throw new Error('Create or upload a start frame before animating.');
  const seconds = sceneDuration(scene);
  if (!(seconds >= 0.25 && seconds <= 30)) throw new Error('The video shot must be between 0.25 and 30 seconds.');
  if (!scene.motion?.trim()) throw new Error('Describe the movement before animating.');
  const model = VIDEO_MODELS.find(m => m.id === scene.model);
  if (!model) throw new Error('Choose LTX 2.5 or Fast H3.');
  if (scene.endImage?.file && !model.endFrame) throw new Error('Choose LTX 2.5 to use both start and end frames. Fast H3 uses one start frame.');
  const template = model.id === 'fast-h3' ? 'video_fastvideo_fasth3_i2v' : scene.endImage?.file ? 'video_ltx2_5_flf2v' : 'video_ltx2_5_i2v';
  const [width, height] = board.aspect === '9:16' ? [768, 1344] : board.aspect === '1:1' ? [1024, 1024] : [1344, 768];
  return { template, body: { confirm: true, inputs: { first_frame: { file: scene.image.file }, ...(scene.endImage?.file ? { last_frame: { file: scene.endImage.file } } : {}), width, height, duration: Math.ceil(seconds), seed,
    prompt: [`Use the supplied start frame${scene.endImage?.file ? ' and end frame as composition anchors' : ''}. Create one continuous coherent shot for a music video.`, FORMAT_DIRECTION[board.format] ?? FORMAT_DIRECTION['music-video'], board.style && `Visual direction: ${board.style}`, scene.prompt && `Scene: ${scene.prompt}`, `Motion: ${scene.motion.trim()}`, 'Keep stable anatomy, lighting, exposure and natural colors. Prefer controlled movement to fast gestures. No captions, lettering, watermark, music, narration or added dialogue. The original song will be the soundtrack in the edit; generated sound is muted.'].filter(Boolean).join('\n'),
    ...(model.id === 'ltx-2.5' ? { prompt_enhance: false, [scene.endImage?.file ? 'fram_rate' : 'frame_rate']: 24 } : {}),
  } } };
}
/** Independent overlay items preserve the user's underlying clips, captions, and original music. */
export function timelineItems(scenes, span) {
  const from = Number(span?.from) || 0, to = Number(span?.to);
  if (!(to > from)) throw new Error('Choose the video cut before adding scenes to the edit.');
  const items = [];
  for (const scene of scenes) {
    const a = Math.max(from, scene.from), z = Math.min(to, scene.to);
    if (z <= a) continue;
    const media = scene.video ?? scene.image;
    if (!media?.file) continue;
    const shared = { id: `backstage-${scene.id}`, backstage: scene.id, start: round(a - from), sound: false, join: 'cut', opacity: 1 };
    if (scene.video) {
      const duration = Number(media.duration ?? media.seconds);
      if (!(duration > 0)) throw new Error(`The duration of ${scene.title} is missing. Upload the video again before adding it to the edit.`);
      const offset = a - scene.from, available = duration - offset;
      if (available < z - a - 0.01) throw new Error(`${scene.title} is shorter than its timeline slot. Shorten the scene or generate a longer clip.`);
      items.push({ ...shared, src: { kind: 'video', id: media.file, duration, name: scene.title }, from: round(offset), to: round(offset + z - a), speed: 1 });
    } else items.push({ ...shared, src: { kind: 'photo', id: media.file, url: media.url, width: media.width, height: media.height, name: scene.title }, length: round(z - a) });
  }
  return items;
}

/** Update only Backstage-owned placements; editor-made overlays remain untouched. */
export function reconcileTimeline(existing, allScenes, replacements, span = null) {
  const replace = new Set(replacements.map(item => item.id));
  const currentScenes = new Set(allScenes.filter(scene => !span || (scene.to > span.from && scene.from < span.to)).map(scene => scene.id));
  return [...existing.filter(item => !replace.has(item.id) && (!item.backstage || currentScenes.has(item.backstage))), ...replacements]
    .sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
}
