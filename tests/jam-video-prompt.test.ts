import test from 'node:test';
import assert from 'node:assert/strict';
import { videoWriterBrief, finishVideoPrompt } from '../server/jam-video-prompt.ts';

test('H3 formats first and last frame as a single anchored shot', () => {
  assert.match(videoWriterBrief('fast-h3', true), /second is the ending frame/);
  const prompt = finishVideoPrompt('fast-h3', true, 9, 'The subject opens their eyes slowly.');
  assert.match(prompt, /Picture 2 \(from Shot 1\).*9\.42-second/);
  assert.match(prompt, /integrated_multimodal_description: \[Shot 1\] The subject opens their eyes slowly\./);
  assert.match(prompt, /overall_soundscape: N\/A\n\nnon_diegetic_music: N\/A$/);
  assert.match(finishVideoPrompt('fast-h3', false, 5, 'A slow turn.'), /at 0\.00 seconds.*fully referenced/);
});

test('LTX gets a natural motion description, and invalid writer output is rejected', () => {
  assert.equal(finishVideoPrompt('ltx-2.5', true, 9, 'The camera pans slowly.'), 'The camera pans slowly.');
  assert.throws(() => finishVideoPrompt('fast-h3', true, 9, ''), /usable/);
  assert.throws(() => videoWriterBrief('unknown', false), /Choose/);
});
