import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planCut } from '../server/cut.ts';
import { timelineItems } from '../web/js/jam-backstage-model.js';

test('Backstage exports full-frame visuals above the base while keeping only the song soundtrack', () => {
  const scene = { id: 's1', title: 'The station', from: 20, to: 24, video: { file: 'scene.mp4', duration: 4 } };
  const overlays = timelineItems([scene], { from: 18, to: 28 });
  const original = { aspect: '16:9', fit: 'cover', duck: false, tracks: [
    { id: 'v2', kind: 'video', items: overlays },
    { id: 'v1', kind: 'video', main: true, items: [{ id: 'base', src: { kind: 'color', id: '000000' }, length: 10 }] },
    { id: 'a2', kind: 'audio', role: 'music', items: [{ id: 'track', src: { kind: 'audio', id: 'song.wav' }, start: 0, from: 0, to: 10 }] },
  ] };
  const sources = {
    base: { path: '', color: '#000000', still: true, hasAudio: false, duration: 10 },
    'backstage-s1': { path: 'scene.mp4', still: false, hasAudio: true, duration: 4 },
    track: { path: 'song.wav', still: false, hasAudio: true, duration: 10 },
  };
  const plan = planCut(original as any, it => sources[it.id as keyof typeof sources], { width: 640, height: 360, font: null, titleFile: () => '' });
  assert.equal(plan.seconds, 10);
  assert.match(plan.video, /overlay=enable='between\(t\\,2\.000\\,6\.000\)'/);
  assert.match(plan.video, /scale=640:360:force_original_aspect_ratio=increase,crop=640:360/);
  const videoInput = plan.inputs.findIndex(args => args.includes('scene.mp4'));
  const audioInput = plan.inputs.findIndex(args => args.includes('song.wav'));
  assert.ok(videoInput >= 0 && audioInput >= 0);
  assert.ok(!plan.audio.includes(`[${videoInput}:a]`), 'generated sound must never enter the soundtrack');
  assert.ok(plan.audio.includes(`[${audioInput}:a]`), 'the original song must be in the export');
});
