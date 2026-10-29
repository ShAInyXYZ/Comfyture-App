import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blankBackstage, newAsset, planFromTrack, validateScene, nextSceneRange, imageRequest, videoRequest, timelineItems, reconcileTimeline } from '../web/js/jam-backstage-model.js';
import { runAssetJob, replaceAssetMedia } from '../web/js/jam-backstage-jobs.js';

const track = { seconds: 60, lyrics: '[Intro]\n[Verse]\nOne\nTwo\n[Chorus]\nThree\nFour\n[Outro]', timing: { lines: [[7, 12], [18, 25], [32, 40], [45, 53]] } };
const scene = (patch = {}) => newAsset({ title: 'Window at dawn', from: 10, to: 16, prompt: 'The guitarist watches morning rain from a window.', motion: 'Slowly pull back, rain falls beyond the glass.', image: { file: 'start.png', url: '/media/photos/start.png' }, ...patch }, 's1');

test('Backstage scene plan follows synced sections and clips absolute song times', () => {
  const scenes = planFromTrack(track, { span: { from: 15, to: 50 }, maxSeconds: 10 });
  assert.equal(scenes[0].from, 15);
  assert.equal(scenes.at(-1).to, 50);
  assert.ok(scenes.some(s => s.section === 'Chorus'));
  assert.ok(scenes.every(s => s.to - s.from <= 10.001));
  scenes.forEach((s, i) => { if (i) assert.equal(s.from, scenes[i - 1].to); assert.equal(s.timingSource, 'synced-lyrics'); });
  assert.ok(scenes.some(s => s.lyricExcerpt.includes('Three')));
});

test('Untimed lyrics do not turn estimated sections into claimed synced scenes', () => {
  const scenes = planFromTrack({ ...track, timing: null }, { maxSeconds: 10 });
  assert.equal(scenes.length, 6);
  assert.ok(scenes.every(s => s.section === 'Scene' && s.timingSource === 'manual' && !s.lyricExcerpt));
});

test('New scenes fill the first deleted gap within the selected audio range', () => {
  const plan = planFromTrack({ seconds: 60 }, { maxSeconds: 10 });
  const kept = plan.filter(scene => scene.from !== 10 && scene.from !== 40).reverse();
  const before = JSON.stringify(kept);
  assert.deepEqual(nextSceneRange(kept, 60, { from: 30, to: 60 }), { from: 40, to: 46 });
  assert.equal(JSON.stringify(kept), before, 'finding a gap preserves the existing plan');
});

test('New scene range fits short gaps and never extends outside the selected audio', () => {
  assert.deepEqual(nextSceneRange([{ from: 15.1, to: 18 }, { from: 20, to: 30 }], 60, { from: 15, to: 30 }), { from: 18, to: 20 });
  assert.deepEqual(nextSceneRange([{ from: 0, to: 18 }], 60, { from: 15, to: 19 }), { from: 18, to: 19 });
  assert.deepEqual(nextSceneRange([], 60, { from: 40, to: 43 }), { from: 40, to: 43 });
});

test('A full selected range explains how to make room rather than choosing elsewhere', () => {
  assert.throws(() => nextSceneRange([{ from: 20, to: 30 }], 60, { from: 20, to: 30 }), /fully planned.*Shorten or remove/);
});

test('Scene validation rejects overlaps, out-of-track durations and nonfinite timing', () => {
  assert.throws(() => validateScene(scene({ from: NaN }), 60), /start and end/);
  assert.throws(() => validateScene(scene({ to: 61 }), 60), /after the song/);
  assert.throws(() => validateScene(scene({ to: 45 }), 60), /30 seconds/);
  assert.throws(() => validateScene(scene(), 60, [{ id: 'another', from: 15, to: 20 }]), /overlaps/);
  assert.equal(validateScene(scene(), 60, [{ id: 'another', from: 16, to: 20 }]).to, 16);
});

test('Images use character references for identity and generated start for end continuity', () => {
  const board = blankBackstage();
  board.style = 'Hand-painted anime backgrounds, warm natural light';
  board.characters = [{ id: 'guitarist', image: { file: 'identity.png' } }];
  const s = scene({ characterIds: ['guitarist'], endPrompt: 'A wider view of this same rainy room.' });
  const start = imageRequest(s, board);
  assert.equal(start.model, 'gpt-image-2.5-flare');
  assert.equal(start.template, 'edit');
  assert.deepEqual(start.refs, [{ file: 'identity.png', name: 'character-1' }]);
  assert.match(start.prompt, /identity only/);
  const end = imageRequest(s, board, 'endImage');
  assert.equal(end.refs[0].file, 'start.png');
  assert.match(end.prompt, /separate high-resolution end frame/);
  assert.match(end.prompt, /wider view of this same rainy room/);
});

test('Album cover uses square art and start frames without references use generation', () => {
  const b = blankBackstage(); b.cover.prompt = 'Night train beneath the stars.';
  const cover = imageRequest(b.cover, b);
  assert.equal(cover.aspect, '1:1'); assert.equal(cover.template, 'generate');
  assert.throws(() => imageRequest(scene({ image: null }), b, 'endImage'), /start frame first/);
});

test('Image and video directions name the selected format without a conflicting music-video lead', () => {
  const subjects = {
    'music-video': 'a music video', opening: 'an anime or television opening',
    ending: 'an anime or television ending', 'game-cinematic': 'a game cinematic',
    'lyric-video': 'a lyric video', podcast: 'a podcast',
  };
  for (const [format, subject] of Object.entries(subjects)) {
    const b = { ...blankBackstage(), format };
    const s = scene();
    const image = imageRequest(s, b).prompt;
    const video = videoRequest(s, b, 1).body.inputs.prompt;
    assert.ok(image.startsWith(`Create a fresh cinematic scene for ${subject}.`), format);
    assert.ok(video.includes(`Create one continuous coherent shot for ${subject}.`), format);
    if (format !== 'music-video') {
      assert.doesNotMatch(image, /scene for a music video/);
      assert.doesNotMatch(video, /shot for a music video/);
    }
  }
});

test('Video requests select the exact first/last template with native parameter names', () => {
  const b = blankBackstage(), s = scene({ to: 16.4, endImage: { file: 'end.png' } });
  const ltx = videoRequest(s, b, 123);
  assert.equal(ltx.template, 'video_ltx2_5_flf2v');
  assert.equal(ltx.body.inputs.duration, 7);
  assert.equal(ltx.body.inputs.width, 1344);
  assert.equal(ltx.body.inputs.height, 768);
  assert.equal(ltx.body.inputs.seed, 123);
  assert.equal(ltx.body.inputs.fram_rate, 24);
  assert.deepEqual(ltx.body.inputs.last_frame, { file: 'end.png' });
  assert.match(ltx.body.inputs.prompt, /original song will be the soundtrack/);
  const fast = videoRequest(scene({ model: 'fast-h3' }), { ...b, aspect: '9:16' });
  assert.equal(fast.template, 'video_fastvideo_fasth3_i2v');
  assert.equal(fast.body.inputs.width, 768);
  assert.equal(fast.body.inputs.height, 1344);
  assert.equal(fast.body.inputs.last_frame, undefined);
  const fastPair = videoRequest({ ...s, model: 'fast-h3' }, b, 123);
  assert.equal(fastPair.template, 'video_fastvideo_fasth3_i2v');
  assert.deepEqual(fastPair.body.inputs.first_frame, { file: s.image.file });
  assert.deepEqual(fastPair.body.inputs.last_frame, { file: 'end.png' });
  assert.match(fastPair.body.inputs.prompt, /start frame and end frame as composition anchors/);
});

test('Video requests describe tagged characters by name from the frames without changing editable direction', () => {
  for (const model of ['ltx-2.5', 'fast-h3']) {
    const b = { ...blankBackstage(), style: 'In the style of @blue-room' };
    const s = scene({ model, prompt: '@ketkout watches @red-robot', motion: '@ketkout turns slowly' });
    const before = JSON.stringify({ b, s });
    const prompt = videoRequest(s, b, 1).body.inputs.prompt;
    assert.match(prompt, /identity and appearance of characters shown in the supplied frame/);
    assert.match(prompt, /style of blue room/);
    assert.match(prompt, /ketkout watches red robot/);
    assert.match(prompt, /ketkout turns slowly/);
    assert.doesNotMatch(prompt, /@/);
    assert.equal(JSON.stringify({ b, s }), before);
  }
});

test('Timeline placement clips to selected cut and mutes video without changing song data', () => {
  const source = scene({ from: 10, to: 20, video: { file: 'take.mp4', duration: 10 } });
  const before = JSON.stringify(source);
  const items = timelineItems([source], { from: 14, to: 18 });
  assert.equal(items.length, 1);
  assert.deepEqual({ start: items[0].start, from: items[0].from, to: items[0].to, sound: items[0].sound }, { start: 0, from: 4, to: 8, sound: false });
  assert.equal(items[0].src.id, 'take.mp4');
  assert.equal(JSON.stringify(source), before);
  assert.deepEqual(timelineItems([source], { from: 25, to: 30 }), []);
});

test('Timeline placement preserves still duration and rejects insufficient video', () => {
  const items = timelineItems([scene()], { from: 0, to: 20 });
  assert.equal(items[0].start, 10); assert.equal(items[0].length, 6);
  assert.throws(() => timelineItems([scene({ video: { file: 'short.mp4', duration: 2 } })], { from: 0, to: 20 }), /shorter/);
});

const specification = { path: 'api/image', body: { model: 'gpt-image-2.5-flare', prompt: 'Rain' }, model: 'GPT Image 2.5 Flare' };
function fakeDeps(overrides = {}) {
  return { save: async () => {}, post: async () => [{ id: 'accepted' }], get: async () => ({ id: 'accepted', status: 'done', photo: { file: 'new.png', url: '/media/photos/new.png' } }), sleep: async () => {}, importVideo: async output => output, now: () => 10000, ...overrides };
}

test('Paid job records submission before request and saves ID before polling', async () => {
  const item = scene(), events = [];
  await runAssetJob(item, 'image', specification, fakeDeps({
    save: async () => { events.push(`save:${item.jobs.image.status}:${item.jobs.image.id ?? ''}`); },
    post: async () => { events.push('submit'); return [{ id: 'accepted' }]; },
    get: async () => { events.push('poll'); return { status: 'done', photo: { file: 'new.png', url: '/media/photos/new.png' } }; },
  }));
  assert.deepEqual(events.slice(0, 4), ['save:submitting:', 'submit', 'save:running:accepted', 'poll']);
  assert.equal(item.image.file, 'new.png');
  assert.equal(item.history[0].media.file, 'start.png');
  assert.equal(item.jobs.image.metadata.actualCostCredits, null);
});

test('Lost submission response blocks a duplicate paid request', async () => {
  const item = scene(); let submits = 0;
  const deps = fakeDeps({ post: async () => { submits++; throw new Error('network lost'); } });
  await assert.rejects(() => runAssetJob(item, 'image', specification, deps), /Check Comfy Cloud/);
  assert.equal(item.jobs.image.status, 'unknown');
  await assert.rejects(() => runAssetJob(item, 'image', specification, deps), /pending/);
  assert.equal(submits, 1);
});

test('A known accepted job resumes after polling failure without submitting again', async () => {
  const item = scene(); let submits = 0;
  const deps = fakeDeps({ post: async () => { submits++; return [{ id: 'accepted' }]; }, get: async () => { throw new Error('Disconnected'); } });
  await assert.rejects(() => runAssetJob(item, 'image', specification, deps), /Disconnected/);
  assert.equal(item.jobs.image.status, 'running');
  await runAssetJob(item, 'image', null, fakeDeps({ post: async () => { submits++; } }), { resume: true });
  assert.equal(submits, 1); assert.equal(item.jobs.image.status, 'done');
});

test('Definite HTTP rejection permits a reviewed retry and archives failed metadata', async () => {
  const item = scene();
  await assert.rejects(() => runAssetJob(item, 'image', specification, fakeDeps({ post: async () => { const e = new Error('Invalid reference'); e.status = 400; throw e; } })), /Invalid reference/);
  assert.equal(item.jobs.image.status, 'failed');
  await runAssetJob(item, 'image', specification, fakeDeps());
  assert.equal(item.jobs.image.status, 'done');
  assert.equal(item.history[0].job.status, 'failed');
});


test('A replaced start frame archives and clears its old end frame and video', () => {
  const item = scene({ endImage: { file: 'old-end.png' }, video: { file: 'old.mp4' }, jobs: { endImage: { id: 'e', status: 'done' }, video: { id: 'v', status: 'done' } } });
  replaceAssetMedia(item, 'image', { file: 'new-start.png' });
  assert.equal(item.image.file, 'new-start.png');
  assert.equal(item.endImage, null); assert.equal(item.video, null);
  assert.equal(item.jobs.endImage, undefined); assert.equal(item.jobs.video, undefined);
  assert.deepEqual(item.history.map(h => h.media.file), ['start.png', 'old-end.png', 'old.mp4']);
});


test('Reapplying the storyboard replaces only its scenes and prunes only removed owned placements', () => {
  const existing = [
    { id: 'my-sticker', start: 1, src: { id: 'sticker.png' } },
    { id: 'backstage-gone', backstage: 'gone', start: 2, src: { id: 'old.png' } },
    { id: 'backstage-s1', backstage: 's1', start: 5, src: { id: 'old-version.png' } },
    { id: 'backstage-s2', backstage: 's2', start: 12, src: { id: 'keep.png' } },
  ];
  const replacement = { id: 'backstage-s1', backstage: 's1', start: 4, src: { id: 'new.png' } };
  const result = reconcileTimeline(existing, [{ id: 's1' }, { id: 's2' }], [replacement]);
  assert.deepEqual(result.map(item => item.src.id), ['sticker.png', 'new.png', 'keep.png']);
  assert.equal(existing.length, 4, 'the old edit is not mutated');
});

test('Reapplying a new range removes old Backstage placements outside the cut', () => {
  const existing = [{ id: 'manual', start: 0 }, { id: 'backstage-before', backstage: 'before', start: 0 }, { id: 'backstage-inside', backstage: 'inside', start: 10 }];
  const result = reconcileTimeline(existing, [{ id: 'before', from: 0, to: 10 }, { id: 'inside', from: 45, to: 50 }], [{ id: 'backstage-inside', backstage: 'inside', start: 5 }], { from: 40, to: 70 });
  assert.deepEqual(result.map(i => i.id), ['manual', 'backstage-inside']);
  assert.equal(result[1].start, 5);
});
