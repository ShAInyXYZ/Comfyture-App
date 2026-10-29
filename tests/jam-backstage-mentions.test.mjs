import test from 'node:test';
import assert from 'node:assert/strict';
import { backstageMentionables, namesIn, resolveBackstageMentions, bindBackstageMentions, labelBackstageCast } from '../web/js/jam-backstage-mentions.js';

test('typed existing @ketkout resolves to the real cast image alongside other named characters', async () => {
  const board = { characters: [{ title: 'Moon Cat', image: { file: 'moon.png', url: '/moon.png' } }] };
  const options = backstageMentionables(board);
  const calls = [];
  const result = await resolveBackstageMentions('@Ketkout meets @moon-cat and @ketkout', options, async c => { calls.push(c.id); return { file: `${c.id}.png`, url: '/ketkout.png' }; });
  assert.deepEqual(calls, ['ketkout']);
  assert.deepEqual(result.map(r => [r.name, r.file]), [['ketkout', 'ketkout.png'], ['moon-cat', 'moon.png']]);
  const out = bindBackstageMentions({ template: 'edit', refs: [{ file: 'other.png', name: 'identity-reference' }], prompt: '@Ketkout meets @moon-cat' }, result);
  assert.deepEqual(out.refs.map(r => r.name), ['identity-reference', 'ketkout', 'moon-cat']);
  assert.equal(out.prompt, '@Ketkout meets @moon-cat');
});

test('a character already selected as the reference uses its matching tag without another image', async () => {
  const result = bindBackstageMentions({ refs: [{ name: 'identity-reference', file: 'ketkout.png' }], prompt: '@ketkout smiles' }, [{ name: 'ketkout', file: 'ketkout.png' }]);
  assert.deepEqual(result.refs, [{ name: 'ketkout', file: 'ketkout.png' }]);
  assert.equal(result.prompt, '@ketkout smiles');
  const item = { reference: { name: 'Ketkout', file: 'custom.png', url: '/custom.png' } };
  const resolved = await resolveBackstageMentions('@ketkout', backstageMentionables({ characters: [] }, [], item), () => { throw new Error('Must use the selected reference'); });
  assert.equal(resolved[0].file, 'custom.png');
});

test('a selected project character wins over a built-in character with the same name', async () => {
  const board = { characters: [{ id: 'custom-chick', title: 'Ketkout', image: { file: 'custom-chick.png', url: '/custom.png' } }] };
  const item = { characterIds: ['custom-chick'] };
  const refs = await resolveBackstageMentions('@ketkout', backstageMentionables(board, [], item), () => { throw new Error('Must use selected project cast'); });
  const direction = labelBackstageCast({ refs: [{ file: 'custom-chick.png', name: 'character-1' }], prompt: '@ketkout walks' }, item, board);
  const bound = bindBackstageMentions(direction, refs);
  assert.deepEqual(bound.refs, [{ file: 'custom-chick.png', name: 'ketkout' }]);
  assert.match(bound.prompt, /@ketkout walks/);
});

test('continuity frame names stay intact when a named character uses the same file', () => {
  const result = bindBackstageMentions({ refs: [{ name: 'start-frame', file: 'same.png' }], prompt: 'Keep @start-frame while @ketkout waves' }, [{ name: 'ketkout', file: 'same.png' }]);
  assert.deepEqual(result.refs, [{ name: 'start-frame', file: 'same.png' }]);
  assert.equal(result.prompt, 'Keep @start-frame while @start-frame waves');
});

test('multiple selected cast members are named in the direction and keep their own images', () => {
  const board = { characters: [{ id: 'a', title: 'Moon Cat', image: { file: 'a.png' } }, { id: 'b', title: 'Sun Bird', image: { file: 'b.png' } }] };
  const result = labelBackstageCast({ refs: [{ name: 'start-frame', file: 'start.png' }, { name: 'character-1', file: 'a.png' }, { name: 'character-2', file: 'b.png' }], prompt: 'Extend @start-frame.' }, { characterIds: ['a', 'b'] }, board);
  assert.deepEqual(result.refs.map(r => r.name), ['start-frame', 'moon-cat', 'sun-bird']);
  assert.match(result.prompt, /@moon-cat is Moon Cat.*@sun-bird is Sun Bird/);
  assert.match(result.prompt, /@start-frame/);
});

test('unknown names and too many references are rejected instead of silently ignored', async () => {
  assert.deepEqual(namesIn('@KETKOUT @ketkout'), ['ketkout']);
  await assert.rejects(resolveBackstageMentions('@missing', backstageMentionables({ characters: [] }), async () => ({})), /No reference found/);
  assert.throws(() => bindBackstageMentions({ refs: Array.from({ length: 10 }, (_, i) => ({ name: `ref-${i}`, file: `${i}.png` })), prompt: '@ketkout' }, [{ name: 'ketkout', file: 'ketkout.png' }]), /up to 10 references/);
});
