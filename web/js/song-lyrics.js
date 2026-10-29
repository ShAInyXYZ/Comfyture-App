// A song's lyrics as a timeline, for the lyrics display under the player. The words are the ones the song was made from (its prompt):
// nothing is heard. Each section is given the stretch of the song it usually takes (the same weights as the section map), and its
// lines share that stretch evenly, after a short lead-in; a section with no words (an instrumental, a solo) is a marker of its own.

/** What a section is, by its name: the weight it takes of the song comes from it. */
export const KIND = (n) => (/pre/i.test(n) ? "pre" : /chorus|hook/i.test(n) ? "chorus" : /verse/i.test(n) ? "verse" : /bridge/i.test(n) ? "bridge" : /intro|outro/i.test(n) ? "edge" : "other");
export const WEIGHT = { edge: 0.55, pre: 0.6, bridge: 0.8, verse: 1, chorus: 1.1, other: 0.8 };
const weightOf = (name, words) => (/final/i.test(name) ? 1.25 : words ? WEIGHT[KIND(name)] : Math.min(WEIGHT[KIND(name)], 0.7));

/** The lyrics split at their section tags: [{ name, label, lines }] (the words before any tag go in a section with no name). */
export function parseSections(lyrics = "") {
  const out = [];
  let cur = null;
  for (const raw of String(lyrics).replace(/\r/g, "").split("\n")) {
    const tag = /^\s*\[([^\]\n]+)\]\s*$/.exec(raw);
    if (tag) {
      cur = { name: tag[1].trim(), label: tag[1].trim().replace(/\s+-\s+.*$/, ""), lines: [] };
      out.push(cur);
    } else if (raw.trim()) {
      if (!cur) out.push((cur = { name: "", label: "", lines: [] }));
      cur.lines.push(raw.trim());
    }
  }
  return out;
}

/**
 * The timeline of a song of `seconds`: entries in order, each { kind: "tag" | "line", text, from, to, section }, a "tag" being a section
 * heading (its stretch is its section's), a "line" a sung line. A song whose lyrics are only [Instrumental] has one tag.
 * `timing` ({ lines: [[from, to], ...] }, one for each sung line, from scripts/jam-lyrics.mjs: the lyrics put on the times heard in the audio)
 * gives the real times; without it the times are estimated from the sections' usual shares of the song.
 */
export function lyricTimeline(lyrics, seconds, timing) {
  const sections = parseSections(lyrics).filter((s) => s.name || s.lines.length);
  const total = Math.max(1, Number(seconds) || 0);
  const heard = timing?.lines;
  if (heard && heard.length === sections.reduce((t, s) => t + s.lines.length, 0) && heard.length) return heardTimeline(sections, heard, total);
  const weights = sections.map((s) => weightOf(s.name, s.lines.length));
  const sum = weights.reduce((t, w) => t + w, 0) || 1;
  const out = [];
  let at = 0;
  sections.forEach((s, i) => {
    const from = at;
    at += (weights[i] / sum) * total;
    const to = at;
    if (s.name) out.push({ kind: "tag", text: s.label, hint: hintOf(s), from, to, section: i });
    // (the first moments of a section are the music coming in: the lines share what is left)
    const lead = s.lines.length ? Math.min(2.5, (to - from) * 0.1) : 0;
    const each = s.lines.length ? (to - from - lead) / s.lines.length : 0;
    s.lines.forEach((text, j) => out.push({ kind: "line", text, from: from + lead + j * each, to: from + lead + (j + 1) * each, section: i }));
  });
  return out;
}
const hintOf = (s) => s.name.slice(s.label.length).replace(/^\s*-\s*/, "");

/**
 * The timeline on the times heard. A section begins just before its first line is sung (a breath of the music coming in, at most a second,
 * less when the gap is short) and runs to where the next begins; a section with no words (an instrumental, a solo) takes the stretch from the
 * end of the last line sung to the next section's start.
 */
function heardTimeline(sections, heard, total) {
  let k = 0;
  const spans = sections.map((s) => {
    const mine = heard.slice(k, k + s.lines.length);
    k += s.lines.length;
    return { s, lines: mine, onset: mine.length ? mine[0][0] : null, end: mine.length ? mine.at(-1)[1] : null };
  });
  // where each section starts
  let audibleEnd = 0;
  spans.forEach((x, i) => {
    if (x.onset === null) x.start = i === 0 ? 0 : audibleEnd;
    else {
      x.start = i === 0 ? 0 : Math.max(audibleEnd, x.onset - Math.min(1, Math.max(0, (x.onset - audibleEnd) / 2)));
      audibleEnd = x.end;
    }
  });
  const out = [];
  spans.forEach((x, i) => {
    const to = i + 1 < spans.length ? spans[i + 1].start : total;
    if (x.s.name) out.push({ kind: "tag", text: x.s.label, hint: hintOf(x.s), from: x.start, to, section: i });
    x.s.lines.forEach((text, j) => out.push({ kind: "line", text, from: x.lines[j][0], to: x.lines[j][1], section: i }));
  });
  return out;
}

/**
 * Whether lyrics on their heard times say where a song's sections are: the first line is sung in the first quarter of the song and the last ends in
 * its last third. Lyrics that cover only a stretch of it (a song whose words were written for one chorus, sung and played on for minutes) say
 * nothing about the rest: its sections are then found some other way.
 */
export const timingCovers = (timing, seconds) => !!timing?.lines?.length && Number(seconds) > 0 && timing.lines[0][0] <= 0.25 * seconds && timing.lines.at(-1)[1] >= 0.6 * seconds;

/** Changes whenever lyrics or their timing changes, even if the audio file stays the same. */
export const sectionAnalysisKey = (track, bpm) => JSON.stringify([track.url, track.seconds, bpm ?? track.bpm ?? null, track.lyrics ?? "", track.timing?.lines ?? null]);

/** Project the full song's timed lines onto a video cut, trimming lines at its boundaries. */
export function syncedLinesForCut(track, span) {
  const lines = parseSections(track?.lyrics ?? "").flatMap((s) => s.lines);
  const times = track?.timing?.lines;
  if (!lines.length || !Array.isArray(times) || times.length !== lines.length) return null;
  const from = Number(span?.from) || 0;
  const to = Number(span?.to) || Number(track.seconds) || 0;
  if (to <= from || times.some((t) => !Array.isArray(t) || t.length !== 2 || !t.every(Number.isFinite) || t[1] <= t[0])) return null;
  return lines.flatMap((text, i) => {
    const [start, end] = times[i];
    if (end <= from || start >= to) return [];
    return [{ text, from: Math.round(Math.max(0, start - from) * 100) / 100, to: Math.round(Math.min(to - from, end - from) * 100) / 100 }];
  });
}

/** The sections of a song with the stretch of it each takes: [{ name, label, from, to }] (those with a tag), from its timeline. */
export const sectionSpans = (lyrics, seconds, timing) => lyricTimeline(lyrics, seconds, timing).filter((e) => e.kind === "tag").map((e) => ({ name: e.hint ? `${e.text} - ${e.hint}` : e.text, label: e.text, from: e.from, to: e.to }));

/** The index of the entry sounding at `time`: the last one begun (a section's tag until its first line comes in); -1 before the first. */
export function entryAt(timeline, time) {
  let found = -1;
  for (let i = 0; i < timeline.length && timeline[i].from <= time; i++) found = i;
  return found;
}
