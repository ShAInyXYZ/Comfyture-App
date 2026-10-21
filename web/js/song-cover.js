// A song's cover and video cover: what is asked of the picture model and of LTX, the stretch of the song the video cover is made on,
// and what each costs. Pure (no page, no network), so the page uses it and node tests run it. The page that makes them is
// panels/jam-song.js; the server keeps them on the song (server/audio-cover.ts).

/** The seconds a video cover runs: short enough to loop and to cost little, long enough to show a line sung. */
export const COVER_SECONDS = { min: 5, max: 8, default: 6 };

/** What the song's loudness (a number for each `hop` seconds) says about where a video cover should be cut. */
const mean = (a, from, to) => {
  let s = 0;
  let n = 0;
  for (let i = Math.max(0, from); i < Math.min(a.length, to); i++, n++) s += a[i];
  return n ? s / n : 0;
};

/**
 * The best part of a song to make a video cover on: { start, length } in seconds. The loudest stretch of `seconds` (its mean
 * loudness the greatest) is looked for, but a chorus that begins within a few seconds of it and is nearly as loud wins, because a
 * cover that starts as the chorus does reads as a moment; then it is moved to the nearest bar when the tempo is known (so the cut
 * falls on the beat) and kept inside the song. `energy` is a loudness for each `hop` seconds, `sections` are { from, to, kind } of
 * the song (kind "chorus" marks a chorus). A song shorter than the part is used whole; one with no loudness starts at the top.
 */
export function bestPart(energy, total, { hop = 0.5, seconds = COVER_SECONDS.default, bpm = 0, sections = [] } = {}) {
  const want = Math.min(COVER_SECONDS.max, Math.max(COVER_SECONDS.min, Math.round(seconds)));
  const length = Math.min(want, Math.max(1, Math.floor(total || 0)));
  if (!(total > 0) || !energy?.length) return { start: 0, length };
  if (total <= length + 0.5) return { start: 0, length: Math.max(1, Math.floor(total)) };
  const W = Math.max(1, Math.round(want / hop));
  const score = (t) => mean(energy, Math.round(t / hop), Math.round(t / hop) + W);
  const last = Math.max(0, total - length);
  let best = 0;
  let top = -1;
  for (let t = 0; t <= last + 1e-9; t += hop) {
    const v = score(t);
    if (v > top) (top = v), (best = t);
  }
  // a chorus that starts near the loudest stretch, and is nearly as loud, is where the part begins
  const near = sections
    .filter((s) => s.kind === "chorus" && s.from <= last && Math.abs(s.from - best) <= 8)
    .map((s) => ({ t: s.from, v: score(s.from) }))
    .filter((c) => c.v >= top * 0.9)
    .sort((a, b) => b.v - a.v)[0];
  let start = near ? near.t : best;
  if (bpm > 30 && bpm < 260) {
    const bar = (60 / bpm) * 4;
    start = Math.round(start / bar) * bar;
  }
  start = Math.min(last, Math.max(0, start));
  return { start: Math.round(start * 100) / 100, length };
}

const clean = (s, n) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/** What the picture model is asked for the cover: the song's name, what it is about and how it sounds; never a word on the picture. */
export function coverPrompt({ name = "", idea = "", tags = "" } = {}) {
  const about = clean(idea, 260);
  const sound = clean(tags, 160);
  return [
    `Square album cover art for a song called "${clean(name, 60) || "Untitled"}".`,
    about ? `It is about: ${about}.` : "",
    sound ? `It sounds like: ${sound}.` : "",
    "One clear, memorable subject, a strong simple composition, rich colour, the feeling of the song in the light.",
    "Premium finished illustration or render, centred with room around it. No text, no letters, no title, no logo, no watermark.",
  ].filter(Boolean).join(" ");
}

/** What LTX is asked for the video cover: the character performs the part, small and natural, so it loops. */
export const COVER_VIDEO_PROMPT = "The character performs the song to the camera, singing along, small natural movements, a gentle sway, the camera almost still, a loopable moment, the same place and light as the picture.";

/** How the picture model's price reads: a model on Comfy Router has its own, a workflow on Comfy Cloud is its seconds of GPU. Null when it runs on your own GPU. */
export function costOfCover(model, cloud = true) {
  // (a model of Comfy Router is billed wherever ComfyUI runs)
  if (model?.router) return Math.max(1, Math.round(model.credits ?? 8));
  if (!cloud) return null;
  if (!model) return 8;
  return Math.max(1, Math.round((model.seconds ?? 10) * 0.266));
}

/** What a video cover costs: LTX's seconds of GPU, as the Lip-sync tool counts them (a second is about 18 GPU seconds). Null on your own GPU. */
export function costOfCoverVideo(seconds, cloud = true) {
  if (!cloud) return null;
  const s = Math.min(10, Math.max(2, Math.ceil(seconds || COVER_SECONDS.default)));
  return Math.max(1, Math.round(s * 18 * 0.266));
}

/** A song's cover state as the page reads it from its library entry: what it has. */
export const coverOf = (song) => ({
  picture: typeof song?.cover === "string" && song.cover ? song.cover : null,
  video: typeof song?.coverVideo === "string" && song.coverVideo ? song.coverVideo : null,
  seconds: Number(song?.coverSeconds) || null,
});

/** The file name of a kept picture from its url (what a shot's start picture is called). */
export const fileOfUrl = (url) => String(url ?? "").split("?")[0].split("/").pop() ?? "";

/** The step a video cover is at, in words, from the take's status. */
export const stepWords = (status) => ({ queued: "Waiting its turn", frame: "Drawing the first frame", review: "Waiting", shot: "Making the video", done: "Done" }[status] ?? "Working");
