import test from 'node:test';
import assert from 'node:assert/strict';
import { routerPrompt } from '../server/router-images.ts';
import { blankBackstage, newAsset, imageRequest } from '../web/js/jam-backstage-model.js';
import { bindBackstageMentions, labelBackstageCast } from '../web/js/jam-backstage-mentions.js';

const gpt = { tag: 'image {n}', refs: 16 };
const route = (request: { prompt: string; refs: { name: string }[] }) => routerPrompt(gpt, request.prompt, request.refs.map(ref => ref.name), request.refs.length).prompt;

test('GPT sees the selected Ketkout image as the reference named in the scene direction', () => {
  const board = blankBackstage();
  board.format = 'opening';
  const photo = { name: 'Ketkout', file: 'ketkout.png', url: '/media/ketkout.png' };
  const scene = newAsset({ prompt: '@ketkout looks down with a serene face', reference: photo });
  const request = bindBackstageMentions(labelBackstageCast(imageRequest(scene, board), scene, board), [{ ...photo, name: 'ketkout' }]);
  assert.deepEqual(request.refs, [{ file: 'ketkout.png', name: 'ketkout' }]);
  assert.match(route(request), /the reference image looks down with a serene face/);
});

test('GPT sees two cast references in the same order they are transmitted', () => {
  const board = blankBackstage();
  board.characters = [
    newAsset({ title: 'Moon Cat', image: { file: 'moon.png' } }, 'moon'),
    newAsset({ title: 'Sun Bird', image: { file: 'sun.png' } }, 'sun'),
  ];
  const scene = newAsset({ prompt: '@sun-bird greets @moon-cat', characterIds: ['moon', 'sun'] });
  const named = [{ name: 'sun-bird', file: 'sun.png' }, { name: 'moon-cat', file: 'moon.png' }];
  const request = bindBackstageMentions(labelBackstageCast(imageRequest(scene, board), scene, board), named);
  assert.deepEqual(request.refs.map(ref => [ref.name, ref.file]), [['moon-cat', 'moon.png'], ['sun-bird', 'sun.png']]);
  const prompt = route(request);
  assert.match(prompt, /image 2 greets image 1/);
  assert.match(prompt, /image 1 is Moon Cat\. image 2 is Sun Bird/);
});
