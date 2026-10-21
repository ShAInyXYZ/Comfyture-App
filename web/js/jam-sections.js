// A song's sections (intro, verse, chorus, bridge, outro) found from how loud it is along its length, for the Track's
// waveform to label. Pure functions: the browser draws them, the node tests run them on made-up energy.
//
// The energy is a number for each half second (the track's loudness, from audioAnalysis in jam-track-audio.js). A section
// changes where the loudness changes and stays changed: the boundaries are the peaks of how different the next few seconds
// are from the last few, snapped to a bar when the tempo is known. They are named from the lyrics' own tags
// ([Verse 1], [Chorus]) when there are as many tags as sections, else from how loud each is and where it sits.

export const HOP = 0.5;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const mean = (a, from, to) => {
  let s = 0;
  let n = 0;
  for (let i = Math.max(0, from); i < Math.min(a.length, to); i++, n++) s += a[i];
  return n ? s / n : 0;
};

/** The section names written in lyrics: "[Verse 1]", "[Chorus]" and the like, in order (nothing else). */
export function lyricTags(text) {
  return String(text ?? "").split(/\r?\n/).map((l) => /^\s*\[([^\]]{1,24})\]\s*$/.exec(l)?.[1]?.trim()).filter(Boolean).map((t) => t.replace(/\s+/g, " "));
}

/** What a name is, for colour: intro, verse, chorus, bridge, outro, or song. */
export function kindOf(name) {
  const n = String(name).toLowerCase();
  if (/pre[- ]?chorus|verse|rap/.test(n)) return "verse";
  if (/chorus|hook|drop|refrain/.test(n)) return "chorus";
  if (/bridge|break|middle/.test(n)) return "bridge";
  if (/intro/.test(n)) return "intro";
  if (/outro|end|coda/.test(n)) return "outro";
  return "song";
}

/**
 * The sections of a song: [{ from, to, name, kind, energy }] from its energy (a number every HOP seconds) and its length.
 * `bpm` snaps the boundaries to a bar; `names` (the lyrics' tags) name the sections when there are as many as found.
 * `source` says how they were named: "lyrics" (the tags) or "energy" (how loud, and where).
 */
export function detectSections(energy, total, { bpm = 0, names = [] } = {}) {
  const n = energy.length;
  if (n < 8 || !(total > 0)) return { sections: [{ from: 0, to: total || 0, name: "Song", kind: "song", energy: 1 }], source: "energy" };
  // smoothed, and scaled by the loud end of the song
  const sm = energy.map((_, i) => mean(energy, i - 1, i + 2));
  const top = [...sm].sort((a, b) => a - b)[Math.floor(n * 0.95)] || Math.max(...sm) || 1;
  const e = sm.map((v) => clamp(v / top, 0, 1.2));
  // how different the next few seconds are from the last few
  const W = Math.max(4, Math.round(4 / HOP));
  const novelty = e.map((_, i) => (i < W || i > n - W ? 0 : Math.abs(mean(e, i, i + W) - mean(e, i - W, i))));
  const peak = Math.max(...novelty);
  const minGap = Math.round(10 / HOP);
  const pick = (th) => {
    const found = [];
    for (let i = 1; i < n - 1; i++) {
      if (novelty[i] < th || novelty[i] < novelty[i - 1] || novelty[i] <= novelty[i + 1]) continue;
      const last = found.at(-1);
      if (last !== undefined && i - last < minGap) {
        if (novelty[i] > novelty[last]) found[found.length - 1] = i;
        continue;
      }
      found.push(i);
    }
    return found;
  };
  let th = Math.max(0.1, peak * 0.35);
  let cuts = pick(th);
  // not more sections than a song has
  while (cuts.length > 9) cuts = pick((th *= 1.2));
  const bar = bpm > 40 ? (60 / bpm) * 4 : 0;
  const times = [...new Set(cuts.map((i) => {
    const t = i * HOP;
    return bar ? Math.round(t / bar) * bar : t;
  }).filter((t) => t > 4 && t < total - 4))].sort((a, b) => a - b);
  const edges = [0, ...times, total];
  const raw = edges.slice(0, -1).map((from, k) => {
    const to = edges[k + 1];
    return { from: Math.round(from * 100) / 100, to: Math.round(to * 100) / 100, energy: mean(e, Math.floor(from / HOP), Math.ceil(to / HOP)) };
  });
  const hi = Math.max(...raw.map((s) => s.energy));
  const sorted = raw.map((s) => s.energy).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  // named by the lyrics' tags when they match, else by loudness and place
  if (names.length === raw.length) return { sections: raw.map((s, k) => ({ ...s, name: names[k], kind: kindOf(names[k]) })), source: "lyrics" };
  let verses = 0;
  const out = raw.map((s, k) => {
    const last = k === raw.length - 1;
    let name;
    if (raw.length === 1) name = "Song";
    else if (k === 0 && s.to - s.from <= 28 && s.energy < Math.max(median, hi * 0.7)) name = "Intro";
    else if (last && s.energy < hi * 0.75 && s.to - s.from <= 32) name = "Outro";
    else if (s.energy >= hi * 0.84) name = "Chorus";
    else if (k > raw.length * 0.55 && k < raw.length - 1 && raw.slice(0, k).some((x) => x.energy >= hi * 0.84) && s.energy < hi * 0.7) name = "Bridge";
    else name = `Verse ${++verses}`;
    return { ...s, name, kind: kindOf(name) };
  });
  return { sections: out, source: "energy" };
}

/** The section a time falls in (the last, past the end). */
export const sectionAt = (sections, t) => sections.find((s) => t >= s.from && t < s.to) ?? sections.at(-1) ?? null;
