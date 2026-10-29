import { alignLines, sungLines } from './lyrics-align.js';

/** Full-track transcript timestamps shared by Song and Words. Podcasts without
 * supplied lyrics keep the transcriber's lines; songs retain the written lyrics. */
export function syncedTranscript(lyrics, transcript, seconds) {
  const heard = transcript.filter(x => String(x.text ?? '').trim() && Number.isFinite(x.from) && Number.isFinite(x.to) && x.from >= 0 && x.to > x.from)
    .map(x => ({ ...x, text: String(x.text).trim(), to: Number(seconds) > 0 ? Math.min(x.to, seconds) : x.to }))
    .filter(x => x.to > x.from).sort((a, b) => a.from - b.from);
  if (!heard.length) throw new Error('No speech or singing was recognized in this audio.');
  const written = sungLines(lyrics ?? '');
  if (!written.length) return { lyrics: heard.map(x => x.text).join('\n'), timing: { lines: heard.map(x => [x.from, x.to]), source: 'transcription' } };
  const words = heard.flatMap(x => {
    const parts = x.text.split(/\s+/).filter(Boolean);
    return parts.map((w, i) => ({ w, s: x.from + (x.to - x.from) * i / parts.length, e: x.from + (x.to - x.from) * (i + 1) / parts.length }));
  });
  const aligned = alignLines(written, words, { seconds, chars: /[\u3040-\u30ff\u3400-\u9fff]/u.test(lyrics) });
  if (!aligned.total || aligned.matched / aligned.total < 0.5) throw new Error('Not enough lyrics were recognized in the mix to sync reliably.');
  return { lyrics, timing: { lines: aligned.lines.map(x => [x.from, x.to]), matched: aligned.matched, source: 'lyrics-alignment' } };
}
