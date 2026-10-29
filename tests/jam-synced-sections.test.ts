import { test } from "node:test";
import { strict as assert } from "node:assert";
import { sectionAnalysisKey, sectionSpans, timingCovers } from "../web/js/song-lyrics.js";

test("the track and song section map share the lyric timestamps, and timing changes invalidate the track cache", () => {
  const lyrics = "[Intro]\n[Verse]\nfirst line\nsecond line\n[Chorus]\nthird line\nfinal line";
  const track = { url: "/song.mp3", seconds: 100, lyrics, timing: { lines: [[8, 15], [20, 28], [55, 65], [75, 86]] } };
  assert.equal(timingCovers(track.timing, track.seconds), true);
  const spans = sectionSpans(track.lyrics, track.seconds, track.timing);
  assert.deepEqual(spans.map((s) => s.name), ["Intro", "Verse", "Chorus"]);
  assert.deepEqual(spans.map((s) => s.from), [0, 7, 54]);
  assert.equal(spans.at(-1).to, 100);
  const old = sectionAnalysisKey(track, 120);
  const changed = { ...track, timing: { lines: [[8, 15], [20, 28], [60, 68], [78, 88]] } };
  assert.notEqual(sectionAnalysisKey(changed, 120), old);
  assert.equal(sectionSpans(changed.lyrics, changed.seconds, changed.timing)[2].from, 59);
});
