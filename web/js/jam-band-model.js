// The band's data, without any page in it: the line-up around the lead artist (the supporting performers and what each plays),
// the words that put them in a frame, and what the shots cost. Plain functions of a jam's body, so the page (panels/jam-band.js),
// the model (jam.js, which draws the looks with them) and the tests all read the same thing.
//
// The lead is the jam's artist (body.artist); the others are body.band: [{ file, url, name, crew?, role, show }], at most two.
// A performer who is not `show`n is kept in the line-up but left out of the scenes.

/** What each place in the line-up is called, and how it is told to the picture model. */
export const ROLES = {
  lead: ["Lead", "singing"],
  dancer: ["Dancer", "dancing with a lot of energy"],
  guitarist: ["Guitarist", "playing an electric guitar"],
  drummer: ["Drummer", "playing the drums"],
  keys: ["Keys", "playing a keyboard"],
  backing: ["Backing singer", "singing backing vocals into a microphone"],
};
/** The roles a supporting performer can take, in the order they are offered. */
export const SUPPORT = ["dancer", "guitarist", "drummer", "keys", "backing"];
export const MAX_BAND = 2;

const CLEAN = (p) => p && typeof p.file === "string" && p.file && typeof p.url === "string";

/** The line-up as kept: the supporting performers, shown or not (at most two). */
export const castOf = (b) => (Array.isArray(b?.band) ? b.band.filter(CLEAN).slice(0, MAX_BAND) : []);

/** The supporting performers in the scenes: those of the line-up that are shown. */
export const bandOf = (b) => castOf(b).filter((p) => p.show !== false);

/**
 * A picture prompt with the supporting performers put beside the lead, and the references they go up as (the lead is
 * @artist, the others @performer1 and @performer2). Without any, the prompt is as it was.
 */
export function withBand(b, prompt) {
  const band = bandOf(b);
  if (!band.length) return { prompt, refs: [] };
  const who = band.map((p, i) => `@performer${i + 1} (${p.name || "a performer"}, ${ROLES[p.role]?.[1] ?? "performing"})`);
  return {
    prompt: `${prompt} Beside them in the frame, kept exactly as in their own reference (face, features, hair, colours, build): ${who.join(" and ")}.`,
    refs: band.map((p, i) => ({ file: p.file, name: `performer${i + 1}` })),
  };
}

/** Comfy Cloud bills a GPU second at 0.266 credits; LTX-2.5 takes about 18 of them for a second of video. */
const CR_PER_VIDEO_SECOND = 18 * 0.266;
/** About what a stretch of rolled video costs, in credits (at least 1). */
export const creditsFor = (seconds) => Math.max(1, Math.round(seconds * CR_PER_VIDEO_SECOND));
