import { test } from 'node:test';
import assert from 'node:assert/strict';
import { syncedTranscript } from '../web/js/song-sync-data.js';

test('a podcast without lyrics keeps the transcribed text and actual line timestamps', () => {
  const result = syncedTranscript('', [{ from: 1.2, to: 4.6, text: 'Welcome to the show.' }, { from: 6.3, to: 8.8, text: 'Let us begin.' }], 10);
  assert.equal(result.lyrics, 'Welcome to the show.\nLet us begin.');
  assert.deepEqual(result.timing.lines, [[1.2, 4.6], [6.3, 8.8]]);
  assert.equal(result.timing.source, 'transcription');
});

test('written song lyrics remain the source, and a wrong transcript cannot replace their sync', () => {
  const lyrics = '[Verse]\nWelcome to the show\nLet us begin';
  const result = syncedTranscript(lyrics, [{ from: 1.2, to: 4.6, text: 'Welcome to the show' }, { from: 6.3, to: 8.8, text: 'Let us begin' }], 10);
  assert.equal(result.lyrics, lyrics);
  assert.equal(result.timing.lines.length, 2);
  assert.throws(() => syncedTranscript(lyrics, [{ from: 0, to: 5, text: 'Completely unrelated sentences about other things' }], 10), /recognized/);
});

test('invalid or empty transcription fails without fabricating a timeline', () => {
  assert.throws(() => syncedTranscript('', [{ from: -1, to: 2, text: 'invalid' }, { from: 3, to: 3, text: 'empty' }], 10), /No speech/);
  assert.deepEqual(syncedTranscript('', [{ from: 8, to: 12, text: 'End' }], 10).timing.lines, [[8, 10]]);
});
