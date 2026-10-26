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
 */
export function lyricTimeline(lyrics, seconds) {
  const sections = parseSections(lyrics).filter((s) => s.name || s.lines.length);
  const total = Math.max(1, Number(seconds) || 0);
  const weights = sections.map((s) => weightOf(s.name, s.lines.length));
  const sum = weights.reduce((t, w) => t + w, 0) || 1;
  const out = [];
  let at = 0;
  sections.forEach((s, i) => {
    const from = at;
    at += (weights[i] / sum) * total;
    const to = at;
    if (s.name) out.push({ kind: "tag", text: s.label, hint: s.name.slice(s.label.length).replace(/^\s*-\s*/, ""), from, to, section: i });
    // (the first moments of a section are the music coming in: the lines share what is left)
    const lead = s.lines.length ? Math.min(2.5, (to - from) * 0.1) : 0;
    const each = s.lines.length ? (to - from - lead) / s.lines.length : 0;
    s.lines.forEach((text, j) => out.push({ kind: "line", text, from: from + lead + j * each, to: from + lead + (j + 1) * each, section: i }));
  });
  return out;
}

/** The index of the entry sounding at `time`: the last one begun (a section's tag until its first line comes in); -1 before the first. */
export function entryAt(timeline, time) {
  let found = -1;
  for (let i = 0; i < timeline.length && timeline[i].from <= time; i++) found = i;
  return found;
}
