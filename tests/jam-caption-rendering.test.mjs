import { test } from 'node:test';
import assert from 'node:assert/strict';
import { captionLayouts, layoutLyric, lyricAss, textWidth, wordState } from '../web/js/lyrics.js';

const japanese = '茜色に染まる帰り道で君の影が少し伸びていた';
const original = { text: japanese, start: 7, length: 5, style: 'plain', size: .09, y: .78 };

test('Japanese caption glyphs use full-em widths and unbroken phrases fit the frame', () => {
  assert.equal(textWidth('帰り道', 40), 120);
  for (const [w, h] of [[720, 1280], [1280, 720]]) {
    const L = layoutLyric(original, w, h);
    assert.equal(L.placed.map(p => p.text).join(''), japanese);
    assert.ok(L.placed.every(p => p.cx - p.w / 2 >= 0 && p.cx + p.w / 2 <= w));
    for (const p of L.placed) assert.equal(L.words[p.i].text, japanese, 'wrapped runs retain their source timing');
  }
});

test('Original, romaji and both keep the source lyrics intact and export the chosen text', () => {
  const item = { ...original, romanization: 'Akane iro ni somaru kaerimichi de kimi no kage ga sukoshi nobite ita', captionLanguage: 'both' };
  const saved = JSON.stringify(item);
  const layers = captionLayouts(item, 720, 1280);
  assert.equal(layers.length, 2);
  assert.equal(layers[0].item.text, japanese);
  assert.equal(layers[1].item.text, item.romanization);
  const primaryBottom = Math.max(...layers[0].L.placed.map(p => p.cy + layers[0].L.boxH / 2));
  const secondaryTop = Math.min(...layers[1].L.placed.map(p => p.cy - layers[1].L.boxH / 2));
  assert.ok(secondaryTop > primaryBottom, 'romanized line has its own space');
  const ass = lyricAss([item], { W: 720, H: 1280 });
  assert.match(ass, /Akane/);
  assert.match(ass, /茜色/);
  assert.doesNotMatch(ass, /\\kf/, 'simple lyrics have no estimated word sweep');
  const romanOnly = lyricAss([{ ...item, captionLanguage: 'romaji' }], { W: 720, H: 1280 });
  assert.match(romanOnly, /Akane/);
  assert.doesNotMatch(romanOnly, /茜色/);
  assert.equal(JSON.stringify(item), saved);
});

test('simple lyrics show the complete line through its synced interval', () => {
  const laterWord = { text: 'later', from: 3, to: 4 };
  assert.equal(wordState('plain', laterWord, 1, 5).show, true);
  assert.equal(wordState('plain', laterWord, 1, 5).hi, false);
  assert.equal(wordState('plain', laterWord, 5, 5).show, false);
  assert.equal(captionLayouts({ ...original, captionLanguage: 'romaji' }, 720, 1280)[0].item.text, japanese, 'no transliteration falls back to original');
});

test('wrapping does not repeat the whole unbroken phrase in exported subtitle fragments', () => {
  const ass = lyricAss([original], { W: 360, H: 640 });
  const chunks = ass.split('\n').filter(x => x.startsWith('Dialogue:')).map(x => x.slice(x.lastIndexOf('}') + 1));
  assert.ok(chunks.length > 1);
  assert.equal(chunks.join(''), japanese);
});
