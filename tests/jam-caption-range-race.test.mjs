import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as edit from '../web/js/edit.js';
import * as lyrics from '../web/js/lyrics.js';
import * as songLyrics from '../web/js/song-lyrics.js';

const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const plain = value => JSON.parse(JSON.stringify(value));

/** Execute the production Jam module with its I/O replaced, so races run without a browser or paid calls. */
async function harness({ delayedBeats = false } = {}) {
  const calls = { commits: 0, slices: [], beats: [], warnings: [] };
  const timers = new Map();
  const cut = { project: { id: 'cut-a', body: edit.normalizeBody({ product: 'jam' }) }, hooks: {} };
  const body = cut.project.body;
  body.tracks.find(t => t.main).items.push({ id: 'j1', src: { kind: 'color', id: '14101f' }, length: 30 });
  body.tracks.find(t => t.role === 'music').items.push({ id: 'track', src: { kind: 'audio', id: 'old.mp3' }, start: 0, from: 0, to: 30 });
  body.tracks.find(t => t.kind === 'title').items.push({ id: 'c1', lyric: true, text: 'Existing caption', start: 7, length: 3, style: 'plain' });
  const modules = {
    './store.js': { state: { info: {}, runs: [], image: { catalogue: {} } }, changed() {}, onChange() {}, toast: message => calls.warnings.push(message), waitFor() { throw Error('No paid jobs in tests'); }, artistFor: () => '' },
    './api.js': { api: {} },
    './cut.js': { cut, openCut: async () => cut.project, commit: () => calls.commits++, layout: () => [], lengthOf: item => item.length || 0, renderFilm() {}, setLyricStyle() {}, setLyricSize() {}, setLineText() {}, flushCuts: async () => {}, hooks: {} },
    './router.js': { currentPage: () => 'jam' },
    './jam-harness.js': { WORKSPACES: [{ id: 'words' }] },
    './saving.js': { keyedSaver: () => ({ save() {}, flush: async () => {}, drop() {} }) },
    './edit.js': edit,
    './beats.js': { gridBeats: () => ({ times: [] }), detectBeats: url => { const gate = deferred(); calls.beats.push({ url, ...gate }); if (!delayedBeats) gate.resolve({ times: [0, 1, 2, 3], down: 0, confidence: .9, bpm: 120 }); return gate.promise; }, hearLoudness: async () => ({ drop: null, loud: null }) },
    './lyrics.js': lyrics,
    './picker.js': { onServer() {} },
    './mixer-trends.js': { CREW: [], crewById() {}, crewPicture() {} },
    './jam-band-model.js': { withBand() {} },
    './song.js': { costOfSong: () => 0 },
    './song-lyrics.js': songLyrics,
  };
  const source = (await readFile(new URL('../web/js/jam.js', import.meta.url), 'utf8'))
    .replace(/^import \{([^}]+)\} from "([^"]+)";$/gm, (_, names, path) => `const {${names}} = __modules[${JSON.stringify(path)}];`)
    .replace(/^export /gm, '') + '\nglobalThis.__jamTest = {jam, applySyncedCaptions, partMatchesSpan, setSpan, setStart, cutPart, syncFromCut};';
  const context = vm.createContext({
    __modules: modules, structuredClone, localStorage: { getItem: () => null, setItem() {} },
    console: { ...console, warn: (...args) => calls.warnings.push(args.join(' ')) },
    setTimeout: fn => { const id = Symbol(); timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id),
    fetch: async (path, init) => {
      assert.equal(path, 'api/jam/slice', 'only the free local audio slicing endpoint is used');
      const gate = deferred(); calls.slices.push({ ...gate, input: JSON.parse(init.body) });
      return { ok: true, json: () => gate.promise };
    },
  });
  vm.runInContext(source, context, { filename: 'web/js/jam.js' });
  const api = context.__jamTest;
  const j = { id: 'jam-a', name: 'Song', body: {
    track: { file: 'song.mp3', url: '/song.mp3', seconds: 100, lyrics: '[Verse]\nFirst\nSecond\nThird', timing: { lines: [[7, 10], [45, 50], [80, 85]] }, loud: null },
    span: { from: 0, to: 30 }, part: { file: 'old.mp3', url: '/old.mp3', seconds: 30 }, cut: 'cut-a', lines: [{ from: 7, to: 10, text: 'Existing caption' }],
    beats: [], bpm: 120, down: 0, sung: [], shots: [], looks: {}, every: 2, captions: 'plain',
  } };
  api.jam.jam = j;
  return { ...api, j, cut, calls, timers };
}

function finishSlice(request, file) { request.resolve({ file, url: `/${file}`, seconds: request.input.to - request.input.from }); }
const captions = h => h.cut.project.body.tracks.find(t => t.kind === 'title').items.filter(item => item.lyric);

test('sync waits for a real cut body and marks completion only after it is updated', async () => {
  const h = await harness();
  const project = h.cut.project;
  const pending = h.applySyncedCaptions(h.j);
  assert.equal(h.j.body.syncedCaptionKey, undefined);
  h.cut.project = null;
  assert.equal(await pending, false);
  assert.equal(h.j.body.syncedCaptionKey, undefined);
  assert.equal(h.calls.commits, 0);
  h.cut.project = project;
  const [a, b] = await Promise.all([h.applySyncedCaptions(h.j), h.applySyncedCaptions(h.j)]);
  assert.equal(a, true); assert.equal(b, true);
  assert.equal(h.calls.commits, 1, 'concurrent redraws share one caption application');
  assert.equal(captions(h)[0].text, 'First');
  assert.equal(captions(h)[0].start, 7);
  assert.ok(h.j.body.syncedCaptionKey);
});

test('changing the range while caption sync is awaiting the editor never writes onto old audio', async () => {
  const h = await harness();
  const pending = h.applySyncedCaptions(h.j);
  h.setSpan(40, 70);
  assert.deepEqual(plain(h.j.body.part.source), { file: 'song.mp3', from: 0, to: 30 });
  assert.equal(h.partMatchesSpan(h.j.body), false);
  assert.equal(await pending, false);
  assert.equal(await h.applySyncedCaptions(h.j), false);
  assert.equal(captions(h)[0].text, 'Existing caption');
  assert.equal(h.j.body.syncedCaptionKey, undefined);
  h.setStart(50);
  assert.equal(h.timers.size, 1, 'all range controls share one debounce');
});

test('a superseded slice cannot clear a newer busy state or overwrite its audio and captions', async () => {
  const h = await harness();
  h.setSpan(40, 70);
  const older = h.cutPart(h.j);
  h.setSpan(70, 100);
  const newer = h.cutPart(h.j);
  finishSlice(h.calls.slices[0], 'older.mp3');
  await older;
  assert.equal(h.jam.busy.has('part', h.j), true);
  assert.equal(await h.applySyncedCaptions(h.j), false);
  finishSlice(h.calls.slices[1], 'newer.mp3');
  await newer;
  assert.equal(h.jam.busy.has('part', h.j), false);
  assert.equal(h.j.body.part.file, 'newer.mp3');
  assert.deepEqual(plain(h.j.body.part.source), { file: 'song.mp3', from: 70, to: 100 });
  assert.equal(captions(h)[0].text, 'Third');
  assert.equal(captions(h)[0].start, 10);
  assert.ok(h.j.body.syncedCaptionKey);
});

test('late beat analysis stays attached to its candidate range and cannot publish old captions', async () => {
  const h = await harness({ delayedBeats: true });
  h.setSpan(40, 70);
  const older = h.cutPart(h.j);
  finishSlice(h.calls.slices[0], 'older.mp3');
  await flush();
  assert.equal(h.calls.beats.length, 1);
  h.setSpan(70, 100);
  const newer = h.cutPart(h.j);
  finishSlice(h.calls.slices[1], 'newer.mp3');
  await flush();
  h.calls.beats[0].resolve({ times: [0, 2, 4, 6], down: 1, confidence: .5, bpm: 80 });
  await older;
  assert.equal(h.j.body.part.file, 'old.mp3');
  assert.equal(h.jam.busy.has('part', h.j), true);
  h.calls.beats[1].resolve({ times: [0, 1, 2, 3], down: 0, confidence: .9, bpm: 120 });
  await newer;
  assert.equal(h.j.body.part.file, 'newer.mp3');
  assert.deepEqual(plain(h.j.body.beats), [0, 1, 2, 3]);
  assert.equal(captions(h)[0].text, 'Third');
});

test('a changed source file cannot inherit a slice requested for the previous song', async () => {
  const h = await harness();
  const pending = h.cutPart(h.j);
  h.j.body.track.file = 'replacement.mp3';
  finishSlice(h.calls.slices[0], 'wrong-source.mp3');
  await pending;
  assert.equal(h.j.body.part.file, 'old.mp3');
  assert.equal(h.partMatchesSpan(h.j.body), false);
  assert.equal(await h.applySyncedCaptions(h.j), false);
  assert.equal(captions(h)[0].text, 'Existing caption');
  assert.equal(h.calls.commits, 0);
});

test('a caption commit during a pending range cannot restore old lines into the new range', async () => {
  const h = await harness();
  h.setSpan(0, 100);
  // A caption style/romanization commit can notify Jam while the old editor is
  // still visible. Those lines belong to the old 30-second audio, not this range.
  captions(h)[0].romanization = 'an edited reading';
  assert.equal(h.syncFromCut(h.j), false);
  assert.deepEqual(plain(h.j.body.lines), []);
  const pending = h.cutPart(h.j);
  finishSlice(h.calls.slices[0], 'full-song.mp3');
  await pending;
  assert.deepEqual(captions(h).map(item => item.text), ['First', 'Second', 'Third']);
  assert.deepEqual(captions(h).map(item => item.start), [7, 45, 80]);
  assert.ok(h.j.body.syncedCaptionKey);
  // Once the ranges match, ordinary manual caption corrections still flow back.
  captions(h)[2].text = 'Corrected third';
  assert.equal(h.syncFromCut(h.j), true);
  assert.equal(h.j.body.lines[2].text, 'Corrected third');
});
