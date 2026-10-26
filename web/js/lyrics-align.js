// The lyrics a song was made from, put on the times they are sung at. The times are heard from the audio (words with their start and
// end, from Whisper on the vocals: scripts/lyrics-words.py); the *text* is always the written lyrics, never what was heard. The two
// word lists are matched end to end (Needleman-Wunsch: the order kept, a heard word that is not in the lyrics skipped, a written word
// that was not heard skipped), and each written line takes the times of the words that matched in it; a line with none is placed
// between its neighbours. Pure functions: the node tests run them on made-up words.

/** A word as it is compared: lower case letters and digits of any alphabet, nothing else. */
export const norm = (w) => String(w).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}]+/gu, "");

/** How alike two words read, 0 to 1: equal, one inside the other, or a small edit apart (singing gets words slightly wrong). */
export function likeness(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length === 1 || b.length === 1) return 0;
  if (a.length < 3 || b.length < 3) return 0;
  if ((a.length >= 4 && b.includes(a)) || (b.length >= 4 && a.includes(b))) return 0.8;
  // edit distance, short words only
  if (Math.abs(a.length - b.length) > 2) return 0;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  const r = 1 - d[a.length][b.length] / Math.max(a.length, b.length);
  // (a longer word may be two letters off, a short one one)
  return r >= (Math.max(a.length, b.length) >= 5 ? 0.6 : 0.7) ? r * 0.8 : 0;
}

/** The sung lines of some lyrics (the section tags and the blank lines left out), in order. */
export const sungLines = (lyrics) => String(lyrics ?? "").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !/^\[[^\]]*\]$/.test(l));

/**
 * The lines on their times. `lines`: the written sung lines; `words`: [{ w, s, e }] heard, in order. Answers { lines: [{ from, to }],
 * matched, total } where `matched` is how many written words found a heard one: the share is how far the times can be trusted.
 */
export function alignLines(lines, words, { seconds = 0, chars = false } = {}) {
  // (a language written without spaces between words, Japanese or Chinese: the match is made one character at a time, a heard word's time shared out over its characters)
  const written = lines.flatMap((text, line) => (chars ? [...norm(text)] : text.split(/\s+/).map(norm).filter(Boolean)).map((w) => ({ w, line })));
  const heard = chars
    ? words.flatMap((x) => {
        const cs = [...norm(x.w)];
        return cs.map((c, i) => ({ w: c, n: c, s: x.s + (i * (x.e - x.s)) / cs.length, e: x.s + ((i + 1) * (x.e - x.s)) / cs.length }));
      })
    : words.map((x) => ({ ...x, n: norm(x.w) })).filter((x) => x.n);
  const n = written.length;
  const m = heard.length;
  const out = lines.map(() => ({ from: null, to: null }));
  if (!n || !m) return { lines: spread(out, lines, seconds), matched: 0, total: n };
  const firstHeard = heard[0].s;
  // the best score of the first i written words against the first k heard (a gap costs a little, a match earns by how alike)
  const W = m + 1;
  const score = new Float32Array((n + 1) * W);
  const step = new Uint8Array((n + 1) * W); // 1 diagonal, 2 up (a written word not heard), 3 left (a heard word not written)
  const GAP_WRITTEN = -0.6;
  const GAP_HEARD = -0.25;
  for (let i = 1; i <= n; i++) (score[i * W] = i * GAP_WRITTEN), (step[i * W] = 2);
  for (let k = 1; k <= m; k++) (score[k] = k * GAP_HEARD), (step[k] = 3);
  for (let i = 1; i <= n; i++) {
    for (let k = 1; k <= m; k++) {
      const like = likeness(written[i - 1].w, heard[k - 1].n);
      let best = score[(i - 1) * W + k - 1] + (like > 0 ? 2 * like : -1);
      let from = 1;
      const up = score[(i - 1) * W + k] + GAP_WRITTEN;
      if (up > best) (best = up), (from = 2);
      const left = score[i * W + k - 1] + GAP_HEARD;
      if (left > best) (best = left), (from = 3);
      score[i * W + k] = best;
      step[i * W + k] = from;
    }
  }
  // back along the best path: the pairs that really matched
  let matched = 0;
  for (let i = n, k = m; i > 0 || k > 0; ) {
    const s = step[i * W + k];
    if (i > 0 && k > 0 && s === 1) {
      if (likeness(written[i - 1].w, heard[k - 1].n) > 0) {
        const o = out[written[i - 1].line];
        const h = heard[k - 1];
        o.from = o.from === null ? h.s : Math.min(o.from, h.s);
        o.to = o.to === null ? h.e : Math.max(o.to, h.e);
        matched++;
      }
      i--, k--;
    } else if (i > 0 && (s === 2 || k === 0)) i--;
    else k--;
  }
  return { lines: spread(out, lines, seconds, firstHeard), matched, total: n };
}

/** The lines no heard word reached placed between the ones that were: spread over the gap by their words, kept in order. */
function spread(out, lines, seconds, firstHeard = Infinity) {
  const count = (i) => Math.max(1, lines[i].split(/\s+/).length);
  const known = out.map((o, i) => (o.from !== null ? i : -1)).filter((i) => i >= 0);
  if (!known.length) {
    // nothing heard at all: the lines share the song by their words
    const total = lines.reduce((t, _, i) => t + count(i), 0);
    let at = 0;
    return lines.map((_, i) => ({ from: round((at / total) * (seconds || total)), to: round(((at += count(i)) / total) * (seconds || total)), heard: false }));
  }
  const res = out.map((o) => ({ ...o, heard: o.from !== null }));
  const wordTime = 0.4;
  const gap = (a, b, from, to) => {
    // lines a..b (exclusive) share from..to by their words
    const total = lines.slice(a, b).reduce((t, _, j) => t + count(a + j), 0);
    let at = from;
    for (let i = a; i < b; i++) {
      const d = ((to - from) * count(i)) / total;
      res[i].from = at;
      res[i].to = at = at + d;
    }
  };
  const first = known[0];
  const last = known.at(-1);
  if (first > 0) {
    // (the opening lines no word was matched to: they start where the first voice was heard, if that is well before the first line found,
    // else they end where it begins)
    const span = lines.slice(0, first).reduce((t, _, j) => t + count(j), 0) * wordTime;
    const start = firstHeard + span + 1 < res[first].from ? firstHeard : Math.max(0, res[first].from - span);
    gap(0, first, start, Math.min(res[first].from, start + span));
  }
  for (let a = 0; a < known.length - 1; a++) if (known[a + 1] - known[a] > 1) gap(known[a] + 1, known[a + 1], res[known[a]].to, res[known[a + 1]].from);
  if (last < lines.length - 1) {
    const span = lines.slice(last + 1).reduce((t, _, j) => t + count(last + 1 + j), 0) * wordTime;
    gap(last + 1, lines.length, res[last].to, Math.min(seconds || Infinity, res[last].to + span));
  }
  // in order, never ending after the next one begins, and long enough to read
  for (let i = 0; i < res.length; i++) {
    if (i > 0) res[i].from = Math.max(res[i].from, res[i - 1].from);
    res[i].to = Math.max(res[i].to, res[i].from + 0.3);
  }
  for (let i = 0; i < res.length - 1; i++) res[i].to = Math.min(res[i].to, Math.max(res[i].from + 0.3, res[i + 1].from));
  return res.map((o) => ({ from: round(o.from), to: round(o.to), heard: o.heard }));
}

const round = (v) => Math.round(v * 100) / 100;

/**
 * The lines placed by the structure of the lyrics and the voice's loudness alone, for when the words cannot be heard (Whisper on sung Japanese
 * hears almost nothing). `voice` is the singing's loudness every `hop` seconds (1 the loud end). The stretches where the voice is singing are found
 * (a gap under 0.4 s is a breath, a stretch under 0.3 s a click), and the lines, each worth its length in characters and a breath, are laid end to
 * end over the singing time only: a section with no words, a guitar solo, then falls where the voice is silent, and the order and the shape of the
 * song come from the lyrics, not from the audio. Answers [{ from, to, heard }] (heard being true: the voice was there).
 */
export function alignByVoice(lines, voice, { hop = 0.1, seconds = 0, threshold = 0.12 } = {}) {
  const total = seconds || voice.length * hop;
  const smooth = voice.map((_, i) => {
    let s = 0;
    let n = 0;
    for (let j = Math.max(0, i - 1); j <= Math.min(voice.length - 1, i + 1); j++, n++) s += voice[j];
    return s / n;
  });
  // the singing stretches
  let spans = [];
  let at = -1;
  smooth.forEach((v, i) => {
    if (v >= threshold && at < 0) at = i;
    if ((v < threshold || i === smooth.length - 1) && at >= 0) (spans.push([at * hop, (v < threshold ? i : i + 1) * hop]), (at = -1));
  });
  spans = spans.reduce((out, sp) => (out.length && sp[0] - out.at(-1)[1] < 0.4 ? ((out.at(-1)[1] = sp[1]), out) : (out.push([...sp]), out)), []).filter((sp) => sp[1] - sp[0] >= 0.3);
  const sung = spans.reduce((t, sp) => t + sp[1] - sp[0], 0);
  const weights = lines.map((l) => [...norm(l)].length + 2);
  const sum = weights.reduce((t, w) => t + w, 0) || 1;
  if (!sung) return lines.map((_, i) => ({ from: round((i / lines.length) * total), to: round(((i + 1) / lines.length) * total), heard: false }));
  // a point of the singing time (0 to sung) back on the song's clock
  // (a line that starts or ends within a third of a second of where a stretch ends is taken to start at the next one or end at this one: the edges of
  // a stretch are not exact, and no line is put in the silence for a few frames)
  const TOL = 0.35;
  const clock = (c, start) => {
    let left = c;
    for (const [a, b] of spans) {
      const len = b - a;
      if (start ? left < len - TOL : left <= len + TOL) return a + Math.min(left, len);
      left -= len;
    }
    return spans.at(-1)[1];
  };
  let used = 0;
  return weights.map((w) => {
    const from = clock((used / sum) * sung, true);
    used += w;
    const to = clock((used / sum) * sung, false);
    return { from: round(from), to: round(Math.max(to, from + 0.3)), heard: true };
  });
}
