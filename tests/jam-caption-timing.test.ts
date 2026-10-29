import { test } from "node:test";
import { strict as assert } from "node:assert";
import { syncedLinesForCut } from "../web/js/song-lyrics.js";

const track = { seconds: 100, lyrics: "[Verse]\nFirst\nSecond\n[Chorus]\nThird", timing: { lines: [[5, 12], [20, 30], [45, 60]] } };

test("synced captions use song timestamps relative to the chosen cut", () => {
  assert.deepEqual(syncedLinesForCut(track, { from: 10, to: 50 }), [
    { text: "First", from: 0, to: 2 }, { text: "Second", from: 10, to: 20 }, { text: "Third", from: 35, to: 40 },
  ]);
});

test("an instrumental cut has no captions, and invalid timing is not treated as synced", () => {
  assert.deepEqual(syncedLinesForCut(track, { from: 31, to: 44 }), []);
  assert.equal(syncedLinesForCut({ ...track, timing: { lines: [[1, 2]] } }, { from: 0, to: 30 }), null);
});
