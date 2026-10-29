import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { editWord } from '../web/js/edit.js';
import { wordsOf } from '../web/js/lyrics.js';
import { lyricItems } from '../web/js/edit.js';
import { captionLanguage, captionText, captionTimingPatch } from '../web/js/jam-caption-language.js';

// Run the real Words event wiring with plain node objects; the mutation is the
// production editor operation. No browser or transcription request is needed.
const source = (await readFile(new URL('../web/js/panels/jam-words.js', import.meta.url), 'utf8'))
  .replace(/^import .* from "[^"]+";$/gm, '').replace(/^export /gm, '');
const h = (tag, props = {}, ...children) => ({ tag, props, disabled: !!props.disabled, children: children.flat(Infinity).filter(x => x != null), isConnected: true,
  replaceChildren(...next) { this.children = next.flat(Infinity).filter(x => x != null); },
});
const walk = (node) => node && typeof node === 'object' ? [node, ...node.children.flatMap(walk)] : [];
const text = (node) => node && typeof node === 'object' ? node.textContent ?? node.children.map(text).join(' ') : String(node);
function harness(item) {
  const calls = [];
  const body = { tracks: [{ kind: 'title', items: [item] }], captionLanguage: 'both' };
  const b = { cut: 'cut1', part: { seconds: 30 }, span: { from: 0, to: 30 }, track: { file: 'song.mp3', seconds: 30 } };
  const cut = { project: { id: 'cut1', body }, history: [], future: [] };
  const previews = [];
  const mocks = { h, wordsOf, lyricItems, captionLanguage, captionTimingPatch, jam: { jam: { body: b }, busy: { has: () => false } }, cut,
    editor: { show() { previews.push(captionText(item, 'both')); } },
    // Model the app's focus guard: a notification does not rebuild the workspace.
    changed() {}, document: { addEventListener() {} }, registerWindow() {}, fine: n => n.toFixed(2), clock: n => n.toFixed(2), jicon: name => h('svg', {}, name), syncedLinesForCut: () => [],
    setItem: (id, patch) => { cut.history.push(structuredClone(item)); cut.future = []; Object.assign(item, patch); },
    undo: () => { const previous = cut.history.pop(); if (previous) { cut.future.push(structuredClone(item)); Object.assign(item, previous); } },
    redo: () => { const next = cut.future.pop(); if (next) { cut.history.push(structuredClone(item)); Object.assign(item, next); } },
    setWord: (id, index, patch) => { calls.push({ id, index, patch }); editWord(item, index, patch); },
  };
  const render = Function(...Object.keys(mocks), `${source}\nreturn { wordBlocks, lyricRows, lineEditor, toolbar };`)(...Object.values(mocks));
  return { rows: () => render.wordBlocks(item).children.filter(n => n.tag === 'div.jw-word-edit').map(row => row.children),
    lyricRows: () => render.lyricRows(b), editor: () => render.lineEditor(b), toolbar: () => render.toolbar({ b, editing: true }), calls, previews };
}
const change = (input, value) => input.props.on.change({ target: { value: String(value) } });

test('fine timing edits keep the same source word after chronological rows reorder', () => {
  const item = { id: 'c1', text: 'first second', romanization: 'an old reading', start: 10, length: 4, words: [
    { text: 'first', from: 0, to: 1 }, { text: 'second', from: 1, to: 2 },
  ] };
  const ui = harness(item);
  change(ui.rows()[0][1], 12.5);
  assert.equal(item.words[0].from, 2.5);
  assert.deepEqual(ui.rows().map(row => row[0].props.value), ['second', 'first']);
  change(ui.rows()[0][0], 'corrected second');
  assert.equal(item.words[1].text, 'corrected second');
  assert.equal(item.words[0].text, 'first');
  assert.equal(item.romanization, undefined);
  change(ui.rows()[1][2], 13.8);
  assert.equal(item.words[0].to, 3.8);
  assert.deepEqual(ui.calls.map(call => call.index), [0, 1, 0]);
});

test('duplicate text and skipped empty words do not confuse visible row identity', () => {
  const item = { id: 'c1', text: 'again again', start: 0, length: 4, words: [
    { text: '', from: 0, to: .1 }, { text: 'again', from: 2, to: 3 }, { text: 'again', from: .5, to: 1 },
  ] };
  const ui = harness(item);
  change(ui.rows()[0][2], 1.25);
  assert.equal(item.words[2].to, 1.25);
  assert.equal(item.words[1].to, 3);
  assert.equal(ui.calls[0].index, 2);
});

test('estimated words can be edited before a manual word array exists', () => {
  const item = { id: 'c1', text: 'hello world', start: 5, length: 4 };
  const ui = harness(item);
  change(ui.rows()[1][0], 'friend');
  assert.equal(item.words[1].text, 'friend');
  assert.equal(item.text, 'hello friend');
});

test('manual reading and timing update the visible row while the next field keeps focus', () => {
  const item = { id: 'c1', lyric: true, text: '帰り道で', romanization: 'kaerimichi de', captionLanguage: 'both', start: 7, length: 4 };
  const ui = harness(item);
  const row = ui.lyricRows()[0];
  const fields = walk(ui.editor());
  const roman = fields.find(n => n.props['aria-label'] === 'Romanized caption text');
  const start = fields.find(n => n.props['aria-label'] === 'Caption start in seconds');
  change(roman, 'a corrected reading');
  assert.match(text(row), /a corrected reading/);
  assert.doesNotMatch(text(row), /kaerimichi de/);
  assert.equal(ui.previews.at(-1), '帰り道で\na corrected reading');
  change(start, 8.25);
  assert.match(text(row), /8\.25/);
  assert.match(text(row), /11\.00/);
});

test('the first focused edit enables Undo, and Undo/Redo immediately refresh their states', () => {
  const item = { id: 'c1', lyric: true, text: '帰り道で', romanization: 'kaerimichi de', captionLanguage: 'both', start: 7, length: 4 };
  const ui = harness(item);
  const row = ui.lyricRows()[0];
  const keys = walk(ui.toolbar());
  const undo = keys.find(n => n.props['aria-label'] === 'Undo');
  const redo = keys.find(n => n.props['aria-label'] === 'Redo');
  assert.equal(undo.disabled, true);
  assert.equal(redo.disabled, true);
  change(walk(ui.editor()).find(n => n.props['aria-label'] === 'Romanized caption text'), 'a corrected reading');
  assert.equal(undo.disabled, false);
  assert.equal(redo.disabled, true);
  undo.props.on.click();
  assert.equal(undo.disabled, true);
  assert.equal(redo.disabled, false);
  assert.match(text(row), /kaerimichi de/);
  redo.props.on.click();
  assert.equal(undo.disabled, false);
  assert.equal(redo.disabled, true);
  assert.match(text(row), /a corrected reading/);
});
