import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCharacterVoice, voiceReferenceFor } from '../web/js/mixer-voices.js';
const recipe = { voiceConversion: { role: 'Lead', referenceCrew: 'ivy' } };
const cast = [{ role: 'Lead', who: { crew: 'ivy' } }];
function harness({ ambiguous = false, interrupt = false } = {}) {
  const calls = [], uploads = [];
  let broken = interrupt;
  return { calls, uploads, deps: {
    persist() {}, progress() {}, sleep: async () => {},
    upload: async (url) => { uploads.push(url); return { file: url.includes('voices') ? 'reference.mp3' : 'performance.mp3' }; },
    send: async (path, method, request) => {
      calls.push({ path, request });
      if (path.includes('chatterbox') && ambiguous) throw Error('Lost submit response');
      return { id: path.includes('chatterbox') ? 'vc' : 'stems', status: 'running' };
    },
    call: async (url) => {
      if (url.endsWith('/vc') && broken) { broken = false; throw Error('Lost poll response'); }
      return { id: url.split('/').at(-1), status: 'done', outputs: url.endsWith('/vc') ? [{ kind: 'audio', file: 'converted.mp3' }] : [
        { kind: 'audio', node: '5', file: 'ambience.mp3' }, { kind: 'audio', node: '4', file: 'vocals.mp3' },
      ] };
    },
  } };
}
const shot = () => ({ from: 0, to: 10, output: { url: '/media/videos/shot.mp4' } });
test('voice pass sends the reference and isolated performance to the correct loader slots, preserving ambience', async () => {
  const h = harness(), s = shot();
  await applyCharacterVoice(recipe, cast, s, h.deps);
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[1].request.inputs.audio.file, 'reference.mp3');
  assert.equal(h.calls[1].request.inputs.audio3.file, 'vocals.mp3');
  assert.equal(s.voicePass.ambience.file, 'ambience.mp3');
  assert.equal(s.voicePass.converted.file, 'converted.mp3');
  await applyCharacterVoice(recipe, cast, s, h.deps);
  assert.equal(h.calls.length, 2);
  assert.equal(h.uploads.length, 2);
});
test('an interrupted voice poll resumes the existing job without paying for another stage', async () => {
  const h = harness({ interrupt: true }), s = shot();
  await assert.rejects(applyCharacterVoice(recipe, cast, s, h.deps), /Lost poll/);
  await applyCharacterVoice(recipe, cast, s, h.deps);
  assert.equal(h.calls.length, 2);
  assert.ok(s.voicePass.converted);
});
test('an ambiguous conversion submission never automatically resubmits', async () => {
  const h = harness({ ambiguous: true }), s = shot();
  await assert.rejects(applyCharacterVoice(recipe, cast, s, h.deps), /Lost submit/);
  await assert.rejects(applyCharacterVoice(recipe, cast, s, h.deps), /no duplicate/);
  assert.equal(h.calls.length, 2);
});
test('photos use the disclosed fictional role voice; another crew member never inherits Ivy by accident', () => {
  assert.equal(voiceReferenceFor(recipe, [{ role: 'Lead', who: { star: { file: 'me.png' } } }]).name, 'Ivy');
  assert.equal(voiceReferenceFor(recipe, [{ role: 'Lead', who: { crew: 'earl' } }]), null);
  assert.equal(voiceReferenceFor(recipe, [{ role: 'Lead', who: { voiceSample: { file: 'mine.wav' } } }]).file, 'mine.wav');
});
