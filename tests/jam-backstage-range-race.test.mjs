import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as model from '../web/js/jam-backstage-model.js';
import * as jobs from '../web/js/jam-backstage-jobs.js';

const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
async function harness() {
  const gate = deferred();
  const calls = { edits: 0, commits: 0 };
  let busy = false;
  const body = { tracks: [{ id: 'v2', kind: 'video', items: [{ id: 'my-sticker' }] }] };
  const j = { id: 'jam-a', body: { track: { file: 'song.mp3', seconds: 100 }, span: { from: 0, to: 30 }, part: { file: 'slice.mp3', seconds: 30, source: { file: 'song.mp3', from: 0, to: 30 } }, cut: 'cut-a', backstage: { ...model.blankBackstage(), scenes: [{ id: 'scene-1', title: 'Dawn', from: 5, to: 10, image: { file: 'frame.png', url: '/media/photos/frame.png' } }] } } };
  const jam = { jam: j, busy: { has: () => busy } };
  const cut = { project: { id: 'cut-a', body } };
  const modules = {
    './jam.js': { jam, save() {}, flushJams: async () => {}, edit: () => { calls.edits++; return gate.promise; }, partMatchesSpan: b => b.part?.source.file === b.track.file && b.part.source.from === b.span.from && b.part.source.to === b.span.to },
    './store.js': { changed() {}, state: {} }, './api.js': { api: {} },
    './cut.js': { cut, commit: () => calls.commits++, flushCuts: async () => {} },
    './jam-backstage-model.js': model, './jam-backstage-jobs.js': jobs,
  };
  const source = (await readFile(new URL('../web/js/jam-backstage.js', import.meta.url), 'utf8'))
    .replace(/^import \{([^}]+)\} from '([^']+)';$/gm, (_, names, path) => `const {${names}} = __modules[${JSON.stringify(path)}];`)
    .replace(/^export \{[^}]+\};$/gm, '').replace(/^export /gm, '') + '\nglobalThis.__test = {insertScenes, addScene};';
  const context = vm.createContext({ __modules: modules, console, setTimeout });
  vm.runInContext(source, context);
  return { ...context.__test, j, body, cut, calls, gate, setBusy: value => busy = value };
}

test('Backstage refuses placement while the chosen range still has old audio', async () => {
  const h = await harness();
  h.j.body.span = { from: 40, to: 70 };
  await assert.rejects(() => h.insertScenes(['scene-1']), /audio range/);
  assert.equal(h.calls.edits, 0); assert.equal(h.calls.commits, 0);
  assert.equal(h.body.tracks[0].items.length, 1);
});

test('Backstage cannot insert old positions after the range changes while opening its edit', async () => {
  const h = await harness();
  const pending = h.insertScenes(['scene-1']);
  h.j.body.span = { from: 40, to: 70 };
  h.gate.resolve(h.body);
  await assert.rejects(() => pending, /audio range changed/);
  assert.equal(h.calls.commits, 0);
  assert.deepEqual(h.body.tracks[0].items, [{ id: 'my-sticker' }]);
});

test('Backstage cannot insert when a different slice becomes current during its edit wait', async () => {
  const h = await harness();
  const pending = h.insertScenes(['scene-1']);
  h.j.body.part = { ...h.j.body.part, file: 'replacement.mp3' };
  h.gate.resolve(h.body);
  await assert.rejects(() => pending, /audio range changed/);
  assert.equal(h.calls.commits, 0);
});

test('A stable Backstage range inserts the projected asset and preserves unrelated overlays', async () => {
  const h = await harness();
  const pending = h.insertScenes(['scene-1']);
  h.gate.resolve(h.body);
  assert.equal(await pending, 1);
  assert.equal(h.calls.commits, 1);
  assert.equal(h.body.tracks[0].items[0].id, 'my-sticker');
  assert.equal(h.body.tracks[0].items[1].start, 5);
  assert.equal(h.body.tracks[0].items[1].sound, false);
});

test('Add scene replaces a deleted middle shot even when the song was fully planned', async () => {
  const h = await harness();
  h.j.body.backstage.scenes = model.planFromTrack(h.j.body.track).filter(scene => scene.from !== 10);
  const preserved = h.j.body.backstage.scenes.map(scene => scene.id);
  const added = h.addScene();
  assert.equal(added.from, 10); assert.equal(added.to, 16);
  assert.deepEqual(h.j.body.backstage.scenes.slice(0, -1).map(scene => scene.id), preserved);
});
