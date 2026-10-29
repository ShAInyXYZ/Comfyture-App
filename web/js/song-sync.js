import { api } from "./api.js";
import { waitFor } from "./store.js";
import { readSrt } from "./jam.js";
import { alignLines, sungLines } from "./lyrics-align.js";

/** One shared, explicitly initiated full-mix transcription for The Song and The Words. */
export async function syncSongFile(song) {
  const lyrics = song.lyrics ?? "";
  const lines = sungLines(lyrics);
  if (!lines.length) throw new Error("This song has no saved lyrics to match.");
  const job = await api.transcribeSong({ file: song.file });
  const result = await waitFor("job", job.id);
  const words = readSrt(result.listen?.srt || "").flatMap((x) => {
    const parts = x.text.split(/\s+/).filter(Boolean);
    return parts.map((w, i) => ({ w, s: x.from + (x.to - x.from) * i / parts.length, e: x.from + (x.to - x.from) * (i + 1) / parts.length }));
  });
  const aligned = alignLines(lines, words, { seconds: song.seconds, chars: /[\u3040-\u30ff\u3400-\u9fff]/u.test(lyrics) });
  if (!aligned.total || aligned.matched / aligned.total < 0.5) throw new Error("Not enough lyrics were recognized in the mix to sync reliably.");
  const timing = { lines: aligned.lines.map((x) => [x.from, x.to]), matched: aligned.matched };
  await api.saveSongLyrics({ file: song.file, lyrics, timing });
  return { lyrics, timing };
}
