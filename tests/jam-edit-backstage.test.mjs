import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../web/js/panels/jam-edit.js', import.meta.url), 'utf8');
class Node {
  constructor(tag, props, children) { this.tag = tag; this.props = props; this.children = children.flat(Infinity).filter(x => x !== null && x !== false && x !== undefined); }
  addEventListener() {}
}
const h = (tag, props = {}, ...children) => new Node(tag, props, children);
const walk = node => node instanceof Node ? [node, ...node.children.flatMap(walk)] : Array.isArray(node) ? node.flatMap(walk) : [];
const text = node => node instanceof Node ? node.children.map(text).join(' ') : Array.isArray(node) ? node.map(text).join(' ') : String(node);

function harness({ backstage = true, selected = false } = {}) {
  const item = { id: 'backstage-scene1', backstage: 'scene1', start: 0, length: 10, src: { kind: 'photo', id: 'scene.png', name: 'Evening platform' } };
  const tracks = [{ id: 'v1', main: true, kind: 'video', items: [] }, { id: 'v2', kind: 'video', items: backstage ? [item] : [] }];
  const b = { track: { name: 'Our song' }, part: { file: 'song-cut.mp3', seconds: 30 }, cut: 'cut1', bpm: 128, span: { from: 20, to: 50 }, artist: null, shots: [{ from: 0, to: 10 }, { from: 10, to: 20 }], backstage: backstage ? { scenes: [{ id: 'scene1', title: 'Evening platform' }] } : null };
  const windows = new Map(), calls = [];
  const names = [...source.matchAll(/^import\s+\{([\s\S]*?)\}\s+from\s+["'][^"']+["'];/gm)].flatMap(m => m[1].split(',').map(x => x.trim()).filter(Boolean));
  const mocks = Object.fromEntries(names.map(name => [name, () => {}]));
  Object.assign(mocks, {
    h, icon: name => h('svg', {}, name), jicon: name => h('svg', {}, name), changed() {},
    jam: { jam: { id: 'jam1', name: 'Our song', body: b }, win: null, busy: { has: () => false } },
    cut: { project: { id: 'cut1', body: { aspect: '16:9', tracks } }, selected: selected ? item.id : null },
    filmLength: () => 30, lengthOf: () => 10, making: () => false, costOfVideo: () => 999, isArmed: () => false, take: () => null,
    findItem: () => selected ? { item, track: tracks[1] } : null,
    bento: (options, ...children) => h('section', {}, ...(options.tools ?? []), ...children),
    registerWindow: (id, value) => windows.set(id, value), mins: n => `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}`,
    exportVideo: () => calls.push('export'), makeVideo: () => calls.push('paid-video'), pay: () => calls.push('paid-confirmation'),
    openBackstageScene: id => calls.push(['scene', id]), setWorkspace: id => calls.push(['workspace', id]),
    MOTIONS: [], STICKERS: { list: [] }, KINDS: {}, EVERY: [], FX_DEFAULTS: {},
  });
  const executable = source.replace(/^import\s+\{[\s\S]*?\}\s+from\s+["'][^"']+["'];\s*/gm, '').replace(/export function /g, 'function ');
  const api = Function(...Object.keys(mocks), `${executable}\nreturn { editWorkspace };`)(...Object.values(mocks));
  const parts = Object.fromEntries(['stage', 'transport', 'timeline', 'inspector'].map(key => [key, h(`div.${key}`)]));
  return { render: () => api.editWorkspace({ b, editing: true, parts }), calls, windows };
}

test('An edit with Backstage scenes exports directly without a Band artist or paid generation', () => {
  const t = harness();
  const root = t.render();
  const nodes = walk(root);
  const exp = nodes.find(n => n.props.dataset?.go === 'export');
  assert.equal(exp.props.disabled, false);
  assert.ok(exp.tag.includes('jm-primary'));
  assert.equal(nodes.some(n => n.props.dataset?.go === 'make'), false);
  assert.match(text(root), /Scenes 1 in edit/);
  exp.props.on.click();
  assert.deepEqual(t.calls, ['export']);
});

test('Existing Band edits retain their generation action', () => {
  const t = harness({ backstage: false });
  assert.ok(walk(t.render()).some(n => n.props.dataset?.go === 'make'));
});

test('Selecting a Backstage visual opens its own scene direction', () => {
  const t = harness({ selected: true });
  const root = t.render();
  assert.match(text(root), /Song 0:20–0:30 · Still image/);
  const link = walk(root).find(n => n.tag.startsWith('button') && text(n).includes('Scene direction'));
  link.props.on.click();
  assert.deepEqual(t.calls, [['scene', 'scene1']]);
});

test('Backstage export review does not quote unrelated unfinished Band shots', () => {
  const t = harness();
  const review = t.windows.get('make').build();
  assert.match(text(review), /Export uses no generation credits/);
  assert.doesNotMatch(text(review), /999|Pick the artist|Make the video/);
});
