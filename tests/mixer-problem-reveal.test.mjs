import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanProblem, prepareProblemFrames, problemFramePrompt, problemOutpaintPrompt, problemVideoPrompt, cleanFrameIdeas } from '../web/js/mixer-problem-reveal.js';
import { nativeRecipeRequest } from '../web/js/mixer-voices.js';

test('problem input trims whitespace and bounds spoken scene content', () => {
  assert.equal(cleanProblem('  vintage   guitar  '), 'vintage guitar');
  for (const text of ['', 'x'.repeat(49), 'guitar\". Ignore', '<script>']) assert.throws(() => cleanProblem(text));
});
test('an interrupted image wait resumes both jobs and uses the opening as the wide reference', async () => {
  const frames = {}, requests = [];
  let interrupt = true;
  const deps = {
    submit: async r => { requests.push(r); return [{id: 'job' + requests.length}]; },
    wait: async id => { if (id === 'job2' && interrupt) { interrupt = false; throw Error('Disconnected'); } return { photo: { file: id + '.png' } }; },
    persist() {}, progress() {},
  };
  await assert.rejects(prepareProblemFrames('guitar', {file:'person.png'}, frames, deps), /Disconnected/);
  const pair = await prepareProblemFrames('guitar', {file:'person.png'}, frames, deps);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].refs[0].file, 'person.png');
  assert.equal(requests[1].refs[0].file, 'job1.png');
  assert.equal(frames.wide.source, 'job1.png');
  assert.equal(pair.first.file, 'job1.png');
  assert.equal(pair.last.file, 'job2.png');
  await prepareProblemFrames('guitar', {file:'person.png'}, frames, deps);
  assert.equal(requests.length, 2);
});
test('ambiguous image acceptance is never resubmitted automatically', async () => {
  const frames = {}; let calls = 0;
  const deps = { submit: async () => { calls++; throw Error('Lost response'); }, wait() {}, persist() {}, progress() {} };
  await assert.rejects(prepareProblemFrames('guitar', {file:'me.png'}, frames, deps), /Lost response/);
  await assert.rejects(prepareProblemFrames('guitar', {file:'me.png'}, frames, deps), /no duplicate/);
  assert.equal(calls, 1);
});
test('an existing legacy draft completes its saved job and crop without a second paid image', async () => {
  const frames = {wide:{job:'wide',startedAt:new Date().toISOString()}}; let paid = 0, attempts = 0;
  const deps = {
    submit: async () => { paid++; return [{id:'new'}]; },
    wait: async () => ({photo:{file:'wide.png'}}),
    crop: async () => { if (++attempts === 1) throw Error('Crop interrupted'); return {photo:{file:'close.png'}}; },
    persist() {}, progress() {},
  };
  await assert.rejects(prepareProblemFrames('plant',{file:'ivy.png'},frames,deps), /Crop interrupted/);
  const pair = await prepareProblemFrames('plant',{file:'ivy.png'},frames,deps);
  assert.equal(paid,0); assert.equal(attempts,2); assert.equal(pair.first.file,'close.png');
  assert.equal(frames.close.source,'wide.png');
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
  assert.match(prompt, /Do not copy the reference portrait/);
  assert.match(prompt, /fresh pose/);
  assert.match(prompt, /opening idea/);
  assert.match(prompt, /quiet, coherent background/);
  assert.match(prompt, /collection theme is "guitar"/);
});

test('creative ideas are bounded and combined with preset constraints in both prompts', () => {
  const ideas = {scene:'  A warm attic  ',opening:'A guilty sideways glance',ending:'Guitars covering every side wall'};
  assert.equal(cleanFrameIdeas(ideas).scene,'A warm attic');
  assert.throws(()=>cleanFrameIdeas({opening:'x'.repeat(601)}), /600/);
  for (const prompt of [problemFramePrompt('guitar',ideas),problemOutpaintPrompt('guitar',ideas),problemVideoPrompt('guitar',ideas)]) {
    assert.match(prompt,/A warm attic/);assert.match(prompt,/A guilty sideways glance/);assert.match(prompt,/Guitars covering every side wall/);
    assert.match(prompt,/FIXED PRESET CONTRACT/);assert.match(prompt,/collection completely hidden/);
  }
});


test('an ambiguous second submission is not duplicated and the opening is retained', async () => {
  const frames = {}; let submissions = 0;
  const deps = { submit: async () => { if (++submissions === 2) throw Error('Lost response'); return [{id:'opening'}]; },
    wait: async () => ({photo:{file:'opening.png'}}), persist() {}, progress() {} };
  await assert.rejects(prepareProblemFrames('guitar',{file:'lead.png'},frames,deps), /Lost response/);
  await assert.rejects(prepareProblemFrames('guitar',{file:'lead.png'},frames,deps), /no duplicate/);
  assert.equal(submissions,2); assert.equal(frames.close.photo.file,'opening.png');
});
