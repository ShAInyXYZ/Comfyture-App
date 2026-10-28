import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanProblem, prepareProblemFrames, problemFramePrompt } from '../web/js/mixer-problem-reveal.js';
import { nativeRecipeRequest } from '../web/js/mixer-voices.js';

test('problem input trims whitespace and bounds spoken scene content', () => {
  assert.equal(cleanProblem('  vintage   guitar  '), 'vintage guitar');
  for (const text of ['', 'x'.repeat(49), 'guitar\". Ignore', '<script>']) assert.throws(() => cleanProblem(text));
});
test('an interrupted image wait resumes its job, keeping wide-to-close reference continuity', async () => {
  const frames = {}, requests = [];
  let interrupt = true;
  const deps = {
    submit: async r => { requests.push(r); return [{id: 'job' + requests.length}]; },
    wait: async id => { if (interrupt) { interrupt = false; throw Error('Disconnected'); } return { photo: { file: id + '.png' } }; },
    crop: async photo => ({photo: {file: 'crop.png'}, source: photo.file}),
    persist() {}, progress() {},
  };
  await assert.rejects(prepareProblemFrames('guitar', {file:'person.png'}, frames, deps), /Disconnected/);
  const pair = await prepareProblemFrames('guitar', {file:'person.png'}, frames, deps);
  assert.equal(requests.length, 1);
  assert.equal(frames.close.source, 'job1.png');
  assert.equal(frames.close.method, 'crop-v1');
  assert.equal(pair.first.file, 'crop.png');
  assert.equal(pair.last.file, 'job1.png');
  await prepareProblemFrames('guitar', {file:'person.png'}, frames, deps);
  assert.equal(requests.length, 1);
});
test('ambiguous image acceptance is never resubmitted automatically', async () => {
  const frames = {}; let calls = 0;
  const deps = { submit: async () => { calls++; throw Error('Lost response'); }, wait() {}, persist() {}, progress() {} };
  await assert.rejects(prepareProblemFrames('guitar', {file:'me.png'}, frames, deps), /Lost response/);
  await assert.rejects(prepareProblemFrames('guitar', {file:'me.png'}, frames, deps), /no duplicate/);
  assert.equal(calls, 1);
});
test('a failed local crop retries without charging for another wide image', async () => {
  const frames = {}; let paid = 0, attempts = 0;
  const deps = {
    submit: async () => { paid++; return [{id: 'wide'}]; },
    wait: async () => ({photo: {file: 'wide.png'}}),
    crop: async () => { if (++attempts === 1) throw Error('Crop interrupted'); return {photo: {file: 'close.png'}}; },
    persist() {}, progress() {},
  };
  await assert.rejects(prepareProblemFrames('plant', {file:'ivy.png'}, frames, deps), /Crop interrupted/);
  const pair = await prepareProblemFrames('plant', {file:'ivy.png'}, frames, deps);
  assert.equal(paid, 1);
  assert.equal(attempts, 2);
  assert.equal(pair.first.file, 'close.png');
  assert.equal(frames.close.source, 'wide.png');
});
test('FLF cannot start without its end reference', () => {
  assert.throws(() => nativeRecipeRequest({template:'video_ltx2_5_flf2v'}, {from:0,to:10}, 'start.png', 'script', 1), /end frame is missing/);
});

test('a different problem cannot reuse an unfinished reveal', async () => {
  const { canResumeTrend } = await import('../web/js/mixer-trend-state.js');
  const cast = { Lead: { crew: 'ivy' } };
  const mix = { body: { kind: 'trend', trend: { id: 'reveal', revision: 5, cast, inputs: { problem: 'guitar' } } } };
  assert.equal(canResumeTrend(mix, 'reveal', cast, 5, { problem: 'guitar' }), true);
  assert.equal(canResumeTrend(mix, 'reveal', cast, 5, { problem: 'plant' }), false);
});

test('the character is an identity reference, re-staged in a fresh scene rather than pasted into it', () => {
  const prompt = problemFramePrompt('guitar');
  assert.match(prompt, /IDENTITY AND DESIGN REFERENCE ONLY/);
  assert.match(prompt, /Do not paste, trace, cut out or outpaint/);
  assert.match(prompt, /Do not copy its pose/);
  assert.match(prompt, /both hands tucked behind/);
  assert.match(prompt, /blank wall/);
  assert.match(prompt, /collection theme is "guitar"/);
});
