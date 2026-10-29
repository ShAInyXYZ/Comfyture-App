import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Exercise the workspace's event wiring without a browser or a paid provider.
// The engine is deliberately replaced; confirmations must be the only submission path.
const source = await readFile(new URL('../web/js/panels/jam-backstage.js', import.meta.url), 'utf8');
class Node {
  constructor(tag, props, children) { this.tag = tag; this.props = props; this.children = children.flat(Infinity).filter(x => x !== null && x !== false && x !== undefined); this.dataset = {}; this.paused = true; this.currentTime = 0; }
  // Native append turns null/undefined into text; only h() filters absent children.
  append(...children) { this.children.push(...children.map(x => x instanceof Node ? x : String(x))); }
  get firstElementChild() { return this.children.find(x => x instanceof Node); }
  set disabled(value) { this.props.disabled = value; }
  get disabled() { return !!this.props.disabled; }
  set textContent(value) { this.children = [String(value)]; }
  setAttribute(name, value) { this.props[name] = String(value); }
  addEventListener(name, fn) { const previous = this.props.on?.[name]; (this.props.on ??= {})[name] = e => { previous?.(e); fn(e); }; }
  replaceChildren(...children) { this.children = []; this.append(...children); }
  pause() { this.paused = true; this.onpause?.(); }
  play() { this.paused = false; this.onplay?.(); return Promise.resolve(); }
}
const h = (tag, props = {}, ...children) => new Node(tag, props, children);
const walk = node => node instanceof Node ? [node, ...node.children.flatMap(walk)] : [];
const text = node => node instanceof Node ? node.children.map(text).join(' ') : String(node);
const find = (root, label) => walk(root).find(n => n.tag.startsWith('button') && text(n).trim() === label);
const tick = () => new Promise(resolve => setImmediate(resolve));

function harness() {
  const scene = { id: 's1', title: 'Evening platform', from: 10, to: 20.5, prompt: 'A quiet station at dusk.', motion: 'Slow pullback.', model: 'ltx-2.5', characterIds: [], image: { file: 'start.png', url: '/media/start.png' }, endImage: { file: 'end.png', url: '/media/end.png' }, jobs: {}, history: [] };
  const bs = { aspect: '16:9', format: 'ending', style: 'Soft natural colours.', scenes: [scene], characters: [], cover: { id: 'cover', title: 'Song cover', prompt: 'Evening sky.', jobs: {} } };
  const j = { id: 'j1', name: 'Song', body: { track: { file: 'song.mp3', url: '/media/song.mp3', seconds: 90 }, span: { from: 10, to: 30 }, part: { source: { file: 'song.mp3', from: 10, to: 30 } } } };
  const windows = new Map(), calls = [], updates = [], toasts = [], events = new Map(), pickers = [];
  const itemOf = id => id === 'cover' ? bs.cover : [...bs.scenes, ...bs.characters].find(item => item.id === id);
  const details = (id, kind) => {
    const item = itemOf(id);
    return { id, kind, title: item.title, model: kind === 'video' ? (item.model === 'fast-h3' ? 'Fast H3' : 'LTX 2.5 Distilled') : 'GPT Image 2.5 Flare', duration: kind === 'video' ? 11 : null, timelineDuration: kind === 'video' ? 10.5 : null, width: kind === 'video' ? 1344 : null, height: kind === 'video' ? 768 : null, frames: kind === 'video' ? [item.image, item.endImage].filter(Boolean) : [], references: [kind === 'endImage' && item.image ? { file: item.image.file, name: 'start-frame' } : null, item.reference ? { file: item.reference.file, name: 'identity-reference' } : null, ...(item.characterIds ?? []).map((id, i) => ({ file: itemOf(id).image.file, name: `character-${i + 1}` }))].filter(Boolean), prompt: item.prompt, request: { count: 1, megapixels: 1 } };
  };
  const mocks = {
    h, changed() {}, toast: message => toasts.push(message), mentionables: () => [], backstageMentionables: () => [], mentionAt: () => null, putMention() {}, jam: { jam: j, workspace: 'backstage', busy: new Set() }, openWindow() {}, setWorkspace() {},
    partMatchesSpan: b => b.part?.source?.file === b.track.file && b.part.source.from === b.span.from && b.part.source.to === b.span.to,
    openPicker() {}, pictureOf() {}, lyricTimeline: () => [], syncedLinesForCut: () => null,
    jicon: name => h('svg', { 'aria-label': name }), clock: n => `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}`,
    registerWindow: (id, value) => windows.set(id, value), pickFile: (...args) => pickers.push(args), keep: (_, fn) => fn(),
    segs: (items, value, onPick) => h('div', {}, ...items.map(([id, name]) => h('button', { 'aria-pressed': value === id, on: { click: () => onPick(id) } }, name))),
    backstageOf: () => bs, VIDEO_MODELS: [{ id: 'ltx-2.5', name: 'LTX 2.5 Distilled', endFrame: true }, { id: 'fast-h3', name: 'Fast H3', endFrame: true }],
    planScenes() {}, addScene() {}, updateScene: (id, patch) => { updates.push({ id, patch }); Object.assign(itemOf(id), patch); }, removeScene() {},
    setBackstage() {}, attachAsset() {}, generateAsset: (...args) => calls.push(args), resumeAsset() {}, resumeBackstageJobs() {}, insertScenes() {},
    addCharacter() {}, removeCharacter() {}, prepareBackstageMentions: async () => {}, generationDetails: details, estimateGeneration: async () => ({ credits: null, note: 'Active GPU time.' }), writeVideoPrompt: async () => ({ prompt: 'Reviewed motion prompt', writer: 'Luna' }), useCover() {},
    document: { addEventListener: (name, fn) => events.set(name, fn) }, window: { addEventListener() {} },
  };
  const executable = source.replace(/^import\s+\{[\s\S]*?\}\s+from\s+["'][^"']+["'];\s*/gm, '').replace(/export function /g, 'function ');
  const { backstageWorkspace } = Function(...Object.keys(mocks), `${executable}\nreturn { backstageWorkspace };`)(...Object.values(mocks));
  return { render: () => backstageWorkspace({ j, b: j.body })[0], windows, calls, updates, scene, bs, j, toasts, events, pickers, jam: mocks.jam };
}

test('Backstage shows an exact scene range and prepares a separate end-frame prompt', async () => {
  const t = harness();
  const first = t.render();
  assert.match(text(first), /0:10–0:20/);
  find(first, 'End frame').props.on.click();
  const end = t.render();
  const prompt = walk(end).find(n => n.props.id === 'backstage-s1-end-prompt');
  assert.ok(prompt);
  assert.equal(prompt.props.value, 'A quiet station at dusk.');
  assert.equal(walk(end).find(n => n.props.id === 'backstage-s1-prompt'), undefined);
  assert.match(text(end), /Included as reference/);
  assert.ok(walk(end).find(n => n.tag === 'img' && n.props.src === '/media/start.png' && n.props.alt === 'Start frame used as a reference'));
  prompt.props.on.input({ target: { value: 'Wider, same station and lighting.' } });
  await tick();
  assert.deepEqual(t.updates.at(-1), { id: 's1', patch: { endPrompt: 'Wider, same station and lighting.' } });
  assert.equal(t.scene.prompt, 'A quiet station at dusk.');
  assert.equal(t.calls.length, 0);
  find(t.render(), 'Review end frame').props.on.click();
  await tick();
  const modal = t.windows.get('backstage-review').build();
  assert.match(text(modal), /using the start frame as a reference/i);
  assert.ok(walk(modal).find(n => n.tag === 'img' && n.props.alt === 'Start frame'));
});

test('End-frame generation explains when a start frame is missing', () => {
  const t = harness();
  t.scene.image = null;
  find(t.render(), 'End frame').props.on.click();
  const end = t.render();
  assert.match(text(end), /Generate or upload a start frame first/);
  assert.equal(find(end, 'Review end frame').disabled, true);
  find(end, 'Go to start frame').props.on.click();
  assert.ok(walk(t.render()).find(n => n.props.id === 'backstage-s1-prompt'));
});

test('Video generation reviews both frames, actual render duration and cost before confirmation', async () => {
  const t = harness();
  find(t.render(), 'Video').props.on.click();
  find(t.render(), 'Review video generation').props.on.click();
  await tick();
  assert.equal(t.calls.length, 0);
  const modal = t.windows.get('backstage-review').build();
  assert.match(text(modal), /Generation direction/);
  assert.ok(text(modal).indexOf('Generation direction') < text(modal).indexOf('Video prompt'));
  assert.ok(text(modal).indexOf('Write video prompt') < text(modal).indexOf('Generate video'));
  assert.match(text(modal), /11 s video/);
  assert.match(text(modal), /10\.5 s · trimmed to the scene/);
  assert.match(text(modal), /Not available/);
  assert.equal(walk(modal).filter(n => n.tag === 'img').length, 2);
  assert.equal(find(modal, 'Generate video').props.disabled, true);
  find(modal, 'Write video prompt').props.on.click();
  await tick();
  const written = t.windows.get('backstage-review').build();
  assert.match(text(written), /Generation direction/);
  const confirm = find(written, 'Generate video');
  assert.equal(confirm.props.disabled, false);
  confirm.props.on.click();
  await tick();
  assert.equal(t.calls.length, 1);
  assert.equal(t.calls[0][2].confirm, true);
  assert.equal(t.calls[0][2].prompt, 'Reviewed motion prompt');
  assert.equal(JSON.parse(t.calls[0][2].expected).duration, 11);
});

test('Fast H3 can review both frames and reports the actual frames in the request', async () => {
  const t = harness();
  t.scene.model = 'fast-h3';
  find(t.render(), 'Video').props.on.click();
  const root = t.render();
  assert.equal(find(root, 'Review video generation').disabled, false);
  assert.match(text(root), /Fast H3 can use a start frame and an optional end frame/);
  find(root, 'Review video generation').props.on.click();
  await tick();
  const modal = t.windows.get('backstage-review').build();
  assert.doesNotMatch(text(modal), /End frame\s+Included/);
  assert.deepEqual(walk(modal).filter(n => n.tag === 'figcaption').map(text), ['Start frame', 'End frame']);
  assert.equal(t.calls.length, 0);

  t.scene.endImage = null;
  find(t.render(), 'Review video generation').props.on.click();
  await tick();
  const startOnly = t.windows.get('backstage-review').build();
  assert.match(text(startOnly), /End frame\s+Not used/);
  assert.deepEqual(walk(startOnly).filter(n => n.tag === 'figcaption').map(text), ['Start frame']);
});

test('A changed request cannot submit through an old confirmation', async () => {
  const t = harness();
  find(t.render(), 'Review image generation').props.on.click();
  await tick();
  const oldConfirm = find(t.windows.get('backstage-review').build(), 'Generate image');
  t.scene.prompt = 'A changed scene direction.';
  oldConfirm.props.on.click();
  await tick();
  assert.equal(t.calls.length, 0);
  assert.match(t.toasts.at(-1), /scene changed/i);
});

test('An uncertain existing job blocks another paid submission', () => {
  const t = harness();
  t.scene.jobs.image = { id: 'job1', status: 'unknown' };
  const root = t.render();
  assert.equal(find(root, 'Check the existing job').props.disabled, true);
  assert.ok(find(root, 'Check existing job'));
  assert.equal(t.calls.length, 0);
});

test('Empty scene, cover and character previews never append literal null placeholders', () => {
  const t = harness();
  t.scene.image = t.scene.endImage = null;
  t.j.body.track.url = null;
  t.bs.characters.push({ id: 'c1', title: 'Lead', prompt: '', image: null, jobs: {}, history: [] });
  for (const slot of ['Start frame', 'End frame', 'Video']) {
    find(t.render(), slot).props.on.click();
    assert.doesNotMatch(text(t.render()), /null|undefined/);
  }
  for (const tab of ['Characters', 'Cover']) {
    find(t.render(), tab).props.on.click();
    assert.doesNotMatch(text(t.render()), /null|undefined/);
  }
  assert.equal(t.calls.length, 0);
});

test('Typing and clearing image direction updates the same review button without a redraw or blur', async () => {
  const t = harness();
  t.scene.prompt = '';
  t.bs.cover.prompt = '';
  t.bs.characters.push({ id: 'c1', title: 'Lead', prompt: '', jobs: {}, history: [] });
  for (const [tab, id] of [['Scenes', 's1'], ['Characters', 'c1'], ['Cover', 'cover']]) {
    find(t.render(), tab).props.on.click();
    const root = t.render();
    const button = find(root, 'Review image generation');
    const input = walk(root).find(n => n.props.id === `backstage-${id}-prompt`);
    assert.equal(button.disabled, true);
    input.props.on.input({ target: { value: 'A new scene at dusk.' } });
    await tick();
    assert.equal(button.disabled, false, `${tab} review should enable while still typing`);
    input.props.on.input({ target: { value: '  ' } });
    await tick();
    assert.equal(button.disabled, true, `${tab} review should disable on empty direction`);
  }
  assert.equal(t.calls.length, 0);
});

test('Typing motion enables the existing video review button without a redraw', async () => {
  const t = harness();
  t.scene.motion = '';
  find(t.render(), 'Video').props.on.click();
  const root = t.render();
  const button = find(root, 'Review video generation');
  assert.equal(button.disabled, true);
  walk(root).find(n => n.props.id === 'backstage-s1-motion').props.on.input({ target: { value: 'Slow dolly toward the character.' } });
  await tick();
  assert.equal(button.disabled, false);
  assert.equal(t.calls.length, 0);
});

test('Review reference labels explain their role and show character names', async () => {
  const t = harness();
  t.scene.reference = { file: 'ref.png', url: '/media/ref.png' };
  t.bs.characters.push({ id: 'c1', title: 'Shiny', image: { file: 'shiny.png', url: '/media/shiny.png' } });
  t.scene.characterIds = ['c1'];
  find(t.render(), 'Review image generation').props.on.click();
  await tick();
  const modal = t.windows.get('backstage-review').build();
  assert.deepEqual(walk(modal).filter(n => n.tag === 'figcaption').map(text), ['Identity reference', 'Shiny']);
  assert.doesNotMatch(text(modal), /identity-reference|character-1/);
});

test('Adding scenes to Edit stays disabled when the audio cut does not match the current range', () => {
  const t = harness();
  assert.equal(find(t.render(), 'Add scenes to edit').disabled, false);
  t.j.body.span = { from: 20, to: 40 };
  assert.equal(find(t.render(), 'Add scenes to edit').disabled, true);
});

test('Custom song transport seeks within a scene and stops at its end or when leaving Backstage', async () => {
  const t = harness();
  const root = t.render();
  const player = walk(root).find(n => n.tag === 'audio.jb-audio');
  const toggle = walk(root).find(n => n.props['aria-label'] === 'Listen to this scene');
  const seek = walk(root).find(n => n.props['aria-label'] === 'Seek within this scene');
  assert.equal(player.controls, false);
  assert.equal(seek.props.max, 10.5);
  toggle.props.on.click();
  await tick();
  assert.equal(player.currentTime, 10);
  assert.equal(player.paused, false);
  assert.equal(toggle.props['aria-label'], 'Pause scene preview');
  seek.props.on.input({ target: { value: '5' } });
  assert.equal(player.currentTime, 15);
  assert.equal(seek.props['aria-valuetext'], '0:05 of 0:10');
  player.currentTime = 20.5;
  player.ontimeupdate();
  assert.equal(player.paused, true);
  toggle.props.on.click();
  await tick();
  assert.equal(player.currentTime, 10);
  assert.equal(player.paused, false);
  t.jam.workspace = 'words';
  t.events.get('jam:drawn')();
  assert.equal(player.paused, true);
  assert.equal(t.calls.length, 0);
});

test('Upload opens its file picker synchronously inside the user click', () => {
  const t = harness();
  find(t.render(), 'Upload image').props.on.click();
  assert.equal(t.pickers.length, 1, 'Do not defer file picker opening to a promise continuation');
  assert.equal(t.pickers[0][0], 'image/*');
  find(t.render(), 'Video').props.on.click();
  find(t.render(), 'Upload video').props.on.click();
  assert.equal(t.pickers.length, 2);
  assert.equal(t.pickers[1][0], 'video/*');
});

test('The empty Characters workspace describes identity references instead of scene timing', () => {
  const t = harness();
  find(t.render(), 'Characters').props.on.click();
  const content = text(t.render());
  assert.match(content, /Character preview/);
  assert.match(content, /Create a character identity/);
  assert.match(content, /Character direction/);
  assert.doesNotMatch(content, /Scene preview|Give the music a scene|selected scene's timing/);
});
