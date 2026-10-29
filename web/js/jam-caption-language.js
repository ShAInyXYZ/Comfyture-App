// Caption editing and text export. Original lyrics stay intact when the display language changes.
export const CAPTION_LANGUAGES = [["original", "Original"], ["romaji", "Romaji"], ["both", "Both"]];
export const captionLanguage = (value) => CAPTION_LANGUAGES.some(([id]) => id === value) ? value : "original";
export const needsRomanization = (text) => /[^\p{Script=Latin}\p{N}\p{P}\p{Z}\p{S}\p{M}\s]/u.test(String(text ?? ""));

/** The text used by downloadable captions; unavailable readings fall back to the original. */
export function captionText(item, language = item?.captionLanguage) {
  const original = String(item?.text ?? "").trim();
  const roman = String(item?.romanization ?? "").trim();
  const mode = captionLanguage(language);
  if (!roman || roman === original || mode === "original") return original;
  return mode === "romaji" ? roman : `${original}\n${roman}`;
}

/** Retiming a line preserves the relative position of its manually edited word timings. */
export function captionTimingPatch(item, from, to, duration = Infinity) {
  const start = Number(from), end = Number(to), max = Number(duration);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end - start < 0.05 || end > max + 0.001) {
    throw new Error("Set a start and end inside this clip, with the end after the start.");
  }
  const round = (v) => Math.round(v * 1000) / 1000;
  const length = round(end - start);
  const previous = Number(item?.length) || length;
  const patch = { start: round(start), length };
  if (Array.isArray(item?.words)) patch.words = item.words.map((word) => ({
    ...word,
    from: round(Math.max(0, Math.min(length, (Number(word.from) || 0) * length / previous))),
    to: round(Math.max(0, Math.min(length, (Number(word.to) || 0) * length / previous))),
  }));
  return patch;
}

const subtitleTime = (seconds, separator) => {
  const ms = Math.max(0, Math.round(Number(seconds) * 1000));
  return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}${separator}${String(ms % 1000).padStart(3, "0")}`;
};

/** SRT and WebVTT share the actual caption timing, including manual edits and bilingual text. */
export function captionSubtitles(items, { language = "original", format = "srt" } = {}) {
  const vtt = format === "vtt";
  const lines = [...(items ?? [])].filter((item) => captionText(item, language) && Number.isFinite(Number(item.start)) && Number(item.length) > 0).sort((a, b) => Number(a.start) - Number(b.start));
  const blocks = lines.map((item, i) => {
    const start = Number(item.start), end = start + Number(item.length);
    // Strip reserved arrow syntax and HTML from user-entered captions in a plain-text subtitle file.
    const text = captionText(item, language).replace(/-->/g, "→").replace(/<[^>]*>/g, "");
    return `${i + 1}\n${subtitleTime(start, vtt ? "." : ",")} --> ${subtitleTime(end, vtt ? "." : ",")}\n${text}`;
  });
  return `${vtt ? "WEBVTT\n\n" : ""}${blocks.join("\n\n")}${blocks.length ? "\n" : ""}`;
}
