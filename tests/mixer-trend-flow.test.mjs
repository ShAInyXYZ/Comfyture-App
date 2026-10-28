import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as catalogue from '../web/js/mixer-trends.js';
import * as helpers from '../web/js/mixer-trend-state.js';
import * as voices from '../web/js/mixer-voices.js';
import { completionFeed } from '../web/js/job-completion.js';

async function harness({ missingControl = false, failCut = false, native = false, distilled = false, pro = false, loseSubmission = false, voicePass = false } = {}) {
  const calls = { pictures: [], shoots: [], tracks: 0, mixes: 0, cuts: 0, native: [], timelines: [] };
  const state = { runs: [], image: { catalogue: { models: [{ id: 'gpt-image-2.5-flare' }] } } };
  const mixer = { busy: new Set(), mix: null };
  const recipe = JSON.parse(await readFile('web/brand/mixer/trends/documentary/recipe.json', 'utf8'));
  if (native) Object.assign(recipe, { engine: 'official-template', template: 'video_fastvideo_fasth3_i2v', settings: { width: 768, height: 1344 }, shots: [{ from: 0, to: 8, prompt: '{Lead} speaks an original line.', seed: 123 }] });
  if (distilled) Object.assign(recipe, { engine: 'official-template', template: 'video_ltx2_5_i2v', settings: { width: 768, height: 1344, frame_rate: 24, prompt_enhance: false }, shots: [{ from: 0, to: 10, prompt: '{Lead} admits a small plant problem.', seed: 123 }] });
  if (pro) Object.assign(recipe, { engine: 'official-template', template: 'api_ltx2_5_i2v', model: 'LTX-2.5 Pro', settings: { resolution: '1080x1920' }, shots: [
    { from: 0, to: 10, prompt: '{Lead} speaks an original line.', seed: 123 },
    { from: 10, to: 20, prompt: '{Lead} reacts.', seed: 124 },
  ] });
  if (voicePass) recipe.voiceConversion = { role: 'Lead', referenceCrew: 'ivy' };
  let fail = failCut;
  const fetch = async (url, init = {}) => {
    let body = {};
    if (url.endsWith('recipe.json')) body = recipe;
    else if (url.endsWith('/files')) body = { controls: missingControl ? {} : { 'take-1.pose.mp4': { file: 'pose.mp4' } } };
    else if (url === 'api/audio/music') { calls.tracks++; body = { id: 'music' }; }
    else if (url === 'api/mixer/stars') body = JSON.parse(init.body);
    else if (url === 'api/cuts') { calls.timelines.push(JSON.parse(init.body).body); body = { project: { id: 'cut' } }; }
    else if (url.endsWith('/video_fastvideo_fasth3_i2v/run') || url.endsWith('/api_ltx2_5_i2v/run') || url.endsWith('/video_ltx2_5_i2v/run')) {
      calls.native.push(JSON.parse(init.body));
      if (loseSubmission) throw new Error('Connection interrupted');
      body = { id: 'native1', status: 'running', progress: .2 };
    }
    else if (url.endsWith('/job/native1')) body = { id: 'native1', status: 'done', outputs: [{ kind: 'video', file: 'spoken.mp4', url: '/media/videos/spoken.mp4', seconds: 8 }] };
    else if (url === '/media/videos/spoken.mp4' || url === 'brand/mixer/voices/ivy-v1.mp3') return { ok: true, blob: async () => 'media bytes' };
    else if (url.startsWith('api/audio?name=')) body = { file: url.includes('reference') ? 'reference.mp3' : 'performance.mp3' };
    else if (url.endsWith('/audio_melbandroformer_audio_separation/run')) body = { id: 'stems', status: 'done', outputs: [{ kind: 'audio', node: '4', file: 'speech.mp3' }, { kind: 'audio', node: '5', file: 'room.mp3' }] };
    else if (url === 'api/utensils/fx/master') body = { id: 'master', status: 'done', results: [{ kind: 'audio', file: 'balanced.wav' }] };
    else if (url.endsWith('/audio-chatterbox_vc/run')) body = { id: 'vc', status: 'done', outputs: [{ kind: 'audio', file: 'converted.mp3' }] };
    else if (url.endsWith('/render')) {
      calls.cuts++;
      if (fail) { fail = false; return { ok: false, status: 500, json: async () => ({ error: 'Render interrupted' }) }; }
      body = { id: 'film', url: '/media/reels/film.mp4', seconds: 7.833 };
    }
    else if (!url.startsWith('api/cuts/')) throw new Error(`Unexpected request ${url}`);
    return { ok: true, json: async () => body };
  };
  const store = {
    state, changed() {}, toast() {}, chosenArtist: () => '', artistFor: () => 'gpt-image-2.5-flare',
    drawPicture: async (body) => { calls.pictures.push(body); return { file: 'cast.png', url: '/media/photos/cast.png' }; },
    waitFor: async (kind, id) => {
      if (kind === 'job') return { audio: { file: 'music.mp3', url: '/media/audio/music.mp3' } };
      const run = state.runs.find(r => r.id === id); run.status = 'done'; return run;
    },
  };
  const api = {
    upload: async () => ({ file: 'my-photo.png', url: '/media/photos/my-photo.png' }),
    shoot: async (body) => {
      calls.shoots.push(body);
      const run = { id: `run${calls.shoots.length}`, request: body, status: 'queued', length: 8.375 };
      state.runs.push(run); return [run];
    },
  };
  const mixModule = { mixer, save() {}, whenOpened() {}, mixLoras: () => [], newMix: async () => {
    calls.mixes++; return mixer.mix = { id: `mix${calls.mixes}`, body: {} };
  } };
  const context = vm.createContext({ fetch, structuredClone, Date, console, setTimeout: (fn) => fn() });
  const modules = {
    './store.js': store, './api.js': { api }, './mixer.js': mixModule,
    './mixer-trends.js': catalogue, './mixer-trend-state.js': helpers, './mixer-voices.js': voices,
    './picker.js': { onServer: async () => ({ file: 'scene.png', url: '/scene.png' }) },
  };
  const mod = new vm.SourceTextModule(await readFile('web/js/mixer-trend.js', 'utf8'), { context });
  await mod.link((name) => {
    const exports = modules[name];
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
    }, { context });
  });
  await mod.evaluate();
  mod.namespace.selectTrend('documentary');
  return { flow: mod.namespace, calls, mixer, state };
}

test('photo drop casts the lead, creates an identity reference, generates and saves the finished video', async () => {
  const { flow, calls, mixer } = await harness();
  await flow.addStar({ name: 'my-person.png' });
  assert.equal(flow.castOf()[0].who.star.file, 'my-photo.png');
  await flow.makeTrend();
  assert.equal(calls.pictures.length, 1);
  assert.equal(calls.pictures[0].refs[1].file, 'my-photo.png');
  assert.equal(calls.shoots[0].start, 'cast.png');
  assert.equal(calls.shoots[0].video.file, 'pose.mp4');
  assert.equal(mixer.mix.body.film.url, '/media/reels/film.mp4');
  assert.equal(flow.making(), false);
});

test('Continue after a cut failure reuses the frame, music and completed take without a second paid generation', async () => {
  const { flow, calls, mixer } = await harness({ failCut: true });
  await flow.addStar({ name: 'person.png' });
  await flow.makeTrend();
  assert.equal(mixer.mix.body.error, 'Render interrupted');
  await flow.makeTrend();
  assert.equal(calls.mixes, 1);
  assert.equal(calls.pictures.length, 1);
  assert.equal(calls.tracks, 1);
  assert.equal(calls.shoots.length, 1);
  assert.equal(calls.cuts, 2);
  assert.ok(mixer.mix.body.film);
  assert.equal(mixer.mix.body.error, null);
});

test('missing motion is detected before spending on music, frames or video', async () => {
  const { flow, calls, mixer } = await harness({ missingControl: true });
  await flow.makeTrend();
  assert.match(mixer.mix.body.error, /motion reference is missing/);
  assert.equal(calls.tracks + calls.pictures.length + calls.shoots.length, 0);
});

test('a changed cast does not resume an old cast’s unfinished mix', () => {
  const mix = { body: { kind: 'trend', trend: { id: 'x', cast: { Lead: { crew: 'earl' } } } } };
  assert.equal(helpers.canResumeTrend(mix, 'x', { Lead: { crew: 'josie' } }), false);
});

test('job completion arriving before wait and several waiters all settle', async () => {
  const feed = completionFeed();
  feed.publish({ id: 'fast', status: 'done' });
  assert.equal((await feed.wait('fast')).status, 'done');
  const a = feed.wait('slow'), b = feed.wait('slow');
  feed.publish({ id: 'slow', status: 'running' });
  feed.publish({ id: 'slow', status: 'done' });
  assert.equal((await a).status, 'done');
  assert.equal((await b).status, 'done');
  feed.publish({ id: 'bad', status: 'failed', error: 'GPU unavailable' });
  await assert.rejects(feed.wait('bad'), /GPU unavailable/);
});

test('native recipe casts a photo and keeps generated dialogue in the final cut without a replacement music job', async () => {
  const { flow, calls, mixer } = await harness({ native: true });
  await flow.addStar({ name: 'guest.png' });
  await flow.makeTrend();
  assert.equal(calls.native.length, 1);
  assert.equal(calls.native[0].inputs.first_frame.file, 'cast.png');
  assert.match(calls.native[0].inputs.prompt, /guest, as in the first frame/);
  assert.equal(calls.tracks, 0);
  assert.equal(calls.shoots.length, 0);
  assert.equal(calls.timelines[0].tracks[0].items[0].src.kind, 'video');
  assert.equal(calls.timelines[0].tracks[0].items[0].sound, true);
  assert.equal(mixer.mix.body.shots[0].render.actualCostCredits, null);
  assert.ok(mixer.mix.body.film);
});

test('native cut retry reuses a completed paid video and its reference image', async () => {
  const { flow, calls, mixer } = await harness({ native: true, failCut: true });
  await flow.addStar({ name: 'guest.png' });
  await flow.makeTrend();
  await flow.makeTrend();
  assert.equal(calls.native.length, 1);
  assert.equal(calls.pictures.length, 1);
  assert.ok(mixer.mix.body.film);
});

test('an ambiguous paid submission is not automatically submitted again', async () => {
  const { flow, calls, mixer } = await harness({ native: true, loseSubmission: true });
  await flow.makeTrend();
  await flow.makeTrend();
  assert.equal(calls.native.length, 1);
  assert.match(mixer.mix.body.error, /no duplicate was sent/);
});


test('LTX Pro uses explicit Pro/audio/duration controls, selected character voice and a shared reference across takes', async () => {
  const { flow, calls, mixer } = await harness({ pro: true });
  flow.setRole('Lead', { crew: 'earl' });
  await flow.makeTrend();
  assert.equal(calls.native.length, 2);
  assert.equal(calls.pictures.length, 1);
  for (const req of calls.native) {
    assert.equal(req.overrides['5'].model, 'LTX-2.5 (Pro)');
    assert.equal(req.overrides['5']['model.duration'], '10');
    assert.equal(req.overrides['5']['model.generate_audio'], true);
    assert.equal(req.overrides['5']['model.resolution'], '1080x1920');
    assert.equal(req.inputs.image.file, 'cast.png');
    assert.match(req.inputs.prompt, /Texas drawl/);
    assert.doesNotMatch(req.inputs.prompt, /bright.*mid-high/i);
  }
  assert.equal(calls.tracks, 0);
  assert.ok(mixer.mix.body.film);
  assert.ok(calls.timelines[0].tracks[0].items.every(i => i.sound));
});

test('a new recipe revision cannot resume an older unfinished generation', () => {
  const roles = { Lead: { crew: 'earl' } };
  const mix = { body: { kind: 'trend', trend: { id: 'we-listen', cast: roles }, shots: [{}] } };
  assert.equal(helpers.canResumeTrend(mix, 'we-listen', roles, 2), false);
});

test('voice direction for an uploaded star does not silently inherit the original character voice', () => {
  const text = voices.castVoiceDirection([{ role: 'Lead', original: 'earl', who: { star: { name: 'My photo' } } }]);
  assert.doesNotMatch(text, /Texas drawl/);
  assert.match(text, /does not provide or clone/);
});


test('a photo remake with voice conversion mutes native speech and places converted voice plus ambience in the cut', async () => {
  const { flow, calls, mixer } = await harness({ native: true, voicePass: true });
  await flow.addStar({ name: 'my-person.png' });
  await flow.makeTrend();
  assert.equal(mixer.mix.body.error, null);
  assert.equal(calls.native.length, 1);
  const tracks = calls.timelines[0].tracks;
  assert.equal(tracks.find(t => t.kind === 'video').items[0].sound, false);
  assert.equal(tracks.find(t => t.role === 'voice').items[0].src.id, 'balanced.wav');
  assert.equal(tracks.find(t => t.role === 'effects').items[0].volume, 0.25);
  assert.equal(tracks.find(t => t.role === 'effects').items[0].src.id, 'room.mp3');
  assert.ok(mixer.mix.body.film);
});


test('LTX Distilled recasts a photo with the open-weight template and retains native dialogue', async () => {
  const { flow, calls, mixer } = await harness({ distilled: true });
  await flow.addStar({ name: 'guest.png' });
  await flow.makeTrend();
  assert.equal(calls.native.length, 1);
  const request = calls.native[0];
  assert.equal(request.inputs.first_frame.file, 'cast.png');
  assert.equal(request.inputs.width, 768);
  assert.equal(request.inputs.height, 1344);
  assert.equal(request.inputs.duration, 10);
  assert.equal(request.inputs.frame_rate, 24);
  assert.equal(request.inputs.prompt_enhance, false);
  assert.equal(request.overrides, undefined);
  assert.match(request.inputs.prompt, /guest, as in the first frame/);
  assert.equal(calls.tracks, 0);
  assert.equal(calls.timelines[0].tracks[0].items[0].sound, true);
  assert.ok(!mixer.mix.body.shots[0].voicePass);
  assert.ok(mixer.mix.body.film);
});
