import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as catalogue from '../web/js/mixer-trends.js';
import * as helpers from '../web/js/mixer-trend-state.js';
import { completionFeed } from '../web/js/job-completion.js';

async function harness({ missingControl = false, failCut = false } = {}) {
  const calls = { pictures: [], shoots: [], tracks: 0, mixes: 0, cuts: 0 };
  const state = { runs: [], image: { catalogue: { models: [{ id: 'gpt-image-2.5-flare' }] } } };
  const mixer = { busy: new Set(), mix: null };
  const recipe = JSON.parse(await readFile('web/brand/mixer/trends/documentary/recipe.json', 'utf8'));
  let fail = failCut;
  const fetch = async (url, init = {}) => {
    let body = {};
    if (url.endsWith('recipe.json')) body = recipe;
    else if (url.endsWith('/files')) body = { controls: missingControl ? {} : { 'take-1.pose.mp4': { file: 'pose.mp4' } } };
    else if (url === 'api/audio/music') { calls.tracks++; body = { id: 'music' }; }
    else if (url === 'api/mixer/stars') body = JSON.parse(init.body);
    else if (url === 'api/cuts') body = { project: { id: 'cut' } };
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
  const context = vm.createContext({ fetch, structuredClone, Date, console });
  const modules = {
    './store.js': store, './api.js': { api }, './mixer.js': mixModule,
    './mixer-trends.js': catalogue, './mixer-trend-state.js': helpers,
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
