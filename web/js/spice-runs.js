// What each department's yellow key does, as Paprika (and anyone else who asks) can read it: the label, what it costs, whether it is ready
// and what it lacks, and how to run it. A department registers its own when it is made; `tool` is the key of one of its bentos where it
// has several (Light's relight, weather or grade; Comp's upscale, slow motion or export). Nothing here runs by itself: a paid run is only
// started after the person's yes (spice-assist.js asks, then calls run()).
const runners = new Map();

/** A department says what its key is: fn(tool) answers { label, cost, free, ready, why, run } for the tool asked (or null). */
export const registerRunner = (dept, fn) => runners.set(dept, fn);

/** The key of a department now: { label, cost (credits, null when not known, 0 when free), free, ready, why, run }, or null when it has none. */
export function runnerFor(dept, tool) {
  const r = runners.get(dept)?.(tool) ?? null;
  if (!r) return null;
  return { label: r.label, cost: r.free ? 0 : r.cost ?? null, free: !!r.free, ready: !r.why, why: r.why ?? "", run: r.run };
}
