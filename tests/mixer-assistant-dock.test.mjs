import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import * as catalogue from '../web/js/mixer-trends.js';
import * as helpers from '../web/js/mixer-trend-state.js';
import * as problem from '../web/js/mixer-problem-reveal.js';

// Render the real panel with an in-memory DOM. No provider calls or media generation.
async function setup({ finished = true, framesReady = false } = {}) {
  class Node {
    constructor(tag, props = {}, children = []) {
      const [name, ...parts] = tag.split(/(?=[.#])/);
      this.tag = name; this.classes = new Set(parts.filter(x => x[0] === '.').map(x => x.slice(1)));
      this.id = props.id ?? parts.find(x => x[0] === '#')?.slice(1); this.props = props; this.dataset = props.dataset ?? {};
      this.classList = { add: x => this.classes.add(x) }; this.children = []; this.style = {}; this.disabled = props.disabled; this.scrollLeft = 0; this.scrollTop = 0;
      this.append(...children.flat().filter(x => x != null && x !== false));
    }
    append(...nodes) { for (const node of nodes) { if (node instanceof Node) { node.remove(); node.parent = this; } this.children.push(node); } }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(x => x !== this); this.parent = null; }
    replaceChildren(...nodes) { this.children.forEach(n => { if (n instanceof Node) n.parent = null; }); this.children = []; this.append(...nodes); }
    get lastElementChild() { return this.children.at(-1); }
    addEventListener() {}
    contains(node) { return node === this || this.children.some(c => c instanceof Node && c.contains(node)); }
    matches(selector) { return selector[0] === '#' ? this.id === selector.slice(1) : selector[0] === '.' ? this.classes.has(selector.slice(1)) : selector === '[data-scroll-key]' ? !!this.dataset.scrollKey : this.tag === selector; }
    all() { return this.children.flatMap(c => c instanceof Node ? [c, ...c.all()] : []); }
    querySelectorAll(selector) { return this.all().filter(c => c.matches(selector)); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
    text() { return this.children.map(c => c instanceof Node ? c.text() : c).join(' '); }
    click() { return !this.disabled && this.props.on?.click?.({ currentTarget: this }); }
  }
  const h = (tag, props, ...children) => new Node(tag, props, children);
  const t = catalogue.trendById('my-reaction');
  const pair = { close: { photo: { url: '/own-start.png', file: 'start.png' } }, wide: { photo: { url: '/own-end.jpg', file: 'end.jpg' } } };
  const roles = { Lead: { crew: 'shiny' } };
  const inputs = { problem: 'guitar', frameIdeas: { scene: 'Cozy studio', opening: 'Seated backward', ending: 'Guitars everywhere' } };
  const pick = { trend: t.id, cast: { roles }, inputs: { [t.id]: structuredClone(inputs) }, kind: 'all' };
  const mix = { id: 'saved', name: 'Shiny guitars', body: { kind: 'trend', trend: { id: t.id, revision: t.revision, cast: roles, inputs }, revealFrames: pair, shots: [], film: finished ? { url: '/own-video.mp4', seconds: 10 } : null } };
  const mixer = { mix, list: [{ id: mix.id, name: mix.name }], busy: new Set() };
  const calls = { reviews: 0, files: 0, picker: 0 };
  const document = { activeElement: null, body: h('body'), addEventListener() {}, dispatchEvent() {}, querySelector: () => null };
  const store = { state: { image: { catalogue: { models: [] } }, info: { target: 'comfy-cloud' } }, changed() {}, toast() {}, artists: () => [] };
  const trend = { pick, stars: { list: [], uploading: 0 }, making: () => false, castOf: () => [{ role: 'Lead', who: roles.Lead }],
    trendInputs: () => pick.inputs[t.id], reviewFrames: () => framesReady ? pair : null, estimate: () => null,
    setFrameIdeas: ideas => pick.inputs[t.id].frameIdeas = ideas,
    setProblem: value => pick.inputs[t.id].problem = value,
    castArtist: () => 'gpt-image-2.5-flare' };
  const overrides = { '../dom.js': { h, icon: () => h('svg'), sprite: () => h('svg'), pad2: x => String(x).padStart(2, '0'), ago: () => 'Recently' },
    '../store.js': store, '../mixer.js': { mixer, openMix: async () => { mixer.mix = structuredClone(mix); } }, '../mixer-trends.js': catalogue,
    '../mixer-trend.js': trend, '../mixer-problem-reveal.js': problem, '../mixer-trend-state.js': helpers,
    '../mixer-voices.js': { voiceReferenceFor: () => null }, '../mixer-generation-review.js': { reviewGeneration: () => calls.reviews++ },
    '../router.js': { currentPage: () => 'mixer' }, '../picker.js': { openPicker: () => calls.picker++ } };
  const source = await readFile('web/js/panels/mixer.js', 'utf8');
  const imports = [...source.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g)];
  const modules = Object.fromEntries(imports.map(([, names, path]) => [path, Object.fromEntries(names.split(',').map(x => x.trim().split(/\s+as\s+/)[0]).filter(Boolean).map(name => [name, overrides[path]?.[name] ?? (() => {})]))]));
  const context = vm.createContext({ document, console, structuredClone, Event, CSS: { escape: x => x }, requestAnimationFrame: fn => fn(), queueMicrotask: () => {}, setTimeout: () => {}, fetch: () => { calls.files++; throw Error('Unexpected network request'); } });
  const mod = new vm.SourceTextModule(source, { context });
  await mod.link(name => new vm.SyntheticModule(Object.keys(modules[name]), function () { for (const [k, v] of Object.entries(modules[name])) this.setExport(k, v); }, { context }));
  await mod.evaluate();
  const root = h('main');
  const render = () => mod.namespace.renderMixer(root);
  render();
  return { root, render, calls, pick, mixer, document, h };
}

test('Mixer keeps the assistant and its unsent message in the dashboard across redraws', async () => {
  const { root, render, document, h, calls } = await setup();
  const assistant = h('section#assistant', {}, h('textarea', { value: 'Unsent message' }));
  root.querySelector('#mixer-chat').append(assistant);
  render();
  assert.equal(root.querySelector('#assistant'), assistant);
  assert.equal(root.querySelector('.mx-recipe-body').querySelector('#assistant'), assistant);
  assert.equal(assistant.children[0].props.value, 'Unsent message');
  assert.ok(!document.body.contains(assistant));
  assert.equal(calls.reviews, 0);
});
