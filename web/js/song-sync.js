import { api } from "./api.js";
import { waitFor } from "./store.js";
import { readSrt } from "./jam.js";
import { syncedTranscript } from "./song-sync-data.js";

const pending = new Map();

/** One shared, explicitly initiated full-mix transcription for The Song and The Words. */
export async function syncSongFile(song) {
  const key = JSON.stringify([song.file, song.lyrics ?? ""]);
  if (!pending.has(key)) pending.set(key, transcribe(song).finally(() => pending.delete(key)));
  return pending.get(key);
}

async function transcribe(song) {
  const lyrics = song.lyrics ?? "";
  const job = await api.transcribeSong({ file: song.file });
  const result = await waitFor("job", job.id);
  const synced = syncedTranscript(lyrics, readSrt(result.listen?.srt || ""), song.seconds);
  await api.saveSongLyrics({ file: song.file, ...synced });
  return synced;
}
