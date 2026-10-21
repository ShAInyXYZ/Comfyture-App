// What a recipe of Truffle's is, without a page: the steps made whole (a name, a section, a why, a how and a price for each, from the
// knowledge entry when there is one and from the tool registry when there is not), the recipe's total, and the line of the golden thread
// that joins its books in order. Plain functions with no imports, so the guide (utensils-guide.js) and its tests read the same rules.

/** The most steps a recipe shows: a longer chain is cut (Truffle is asked for one to five). */
export const MAX_STEPS = 6;

/** A step's id is a tool's (upscale, cutout, ed-trim...) or a Library workflow's, written `wf:<template name>`. */
export const isWorkflow = (id) => typeof id === "string" && id.startsWith("wf:");
export const workflowName = (id) => (isWorkflow(id) ? id.slice(3) : null);

/** The first sentence of a text (a how that is a paragraph reads as one line in a step). */
const firstSentence = (text) => {
  const s = String(text ?? "").trim();
  const m = s.match(/^(.+?[.!?])(\s|$)/);
  return (m ? m[1] : s).slice(0, 160);
};

/**
 * The price a step shows and the credits it adds to the total: the entry's credits when known ("≈ 2 cr"), else what its cost says
 * (Free on this machine, GPU time on Comfy Cloud, a partner's credits), else the registry's own estimate.
 */
export function priceOf(entry, estimate = null) {
  const credits = typeof entry?.credits === "number" && entry.credits >= 0 ? entry.credits : typeof estimate === "number" ? estimate : null;
  if (entry?.cost === "free") return { label: "Free", credits: 0, cost: "free" };
  if (credits !== null) return { label: credits ? `≈ ${Math.round(credits)} cr` : "Free", credits, cost: entry?.cost ?? (credits ? "gpu" : "free") };
  if (entry?.cost === "partner") return { label: "Partner credits", credits: null, cost: "partner" };
  return { label: "GPU time", credits: null, cost: entry?.cost ?? "gpu" };
}

/**
 * The steps made whole. `plan` is { title, steps: [{ id, why, how, entry }] } as Truffle's guide op gives it; `lookup(id)` answers the
 * registry's tool for a tool id ({ name, workspace, hint, icon, takes }) or null; `estimate(id)` its credits or null; `free(id)` whether it
 * runs on this machine for nothing. A step with an
 * id twice in a row is kept once; a step that is neither a tool nor a workflow with an entry is dropped.
 */
export function normalisePlan(plan, { lookup = () => null, estimate = () => null, free = () => false } = {}) {
  const steps = [];
  for (const s of Array.isArray(plan?.steps) ? plan.steps : []) {
    const id = typeof s?.id === "string" ? s.id.trim() : "";
    if (!id || steps.at(-1)?.id === id) continue;
    const wf = isWorkflow(id);
    const tool = wf ? null : lookup(id);
    const entry = s.entry && typeof s.entry === "object" ? s.entry : null;
    if (!wf && !tool && !entry) continue;
    // (a tool that runs here for nothing is Free, whatever its estimate says, when its knowledge entry does not say otherwise)
    const price = priceOf(entry ?? (!wf && free(id) ? { cost: "free" } : null), wf ? null : estimate(id));
    steps.push({
      id,
      kind: wf ? "workflow" : "tool",
      name: String(entry?.name ?? tool?.name ?? workflowName(id) ?? id).slice(0, 80),
      section: wf ? "library" : (entry?.section ?? tool?.workspace ?? ""),
      category: entry?.category ?? null,
      icon: tool?.icon ?? (wf ? "tool-templates" : "tool-shelf"),
      why: String(s.why ?? entry?.what ?? tool?.hint ?? "").trim().slice(0, 160),
      how: String(s.how ?? "").trim().slice(0, 200) || firstSentence(entry?.use?.[0] ?? entry?.how ?? tool?.hint ?? ""),
      // how to use it here: the entry's steps; without them, Truffle's how and what the tool does
      use: (Array.isArray(entry?.use) && entry.use.length ? entry.use : [s.how, tool?.hint ?? entry?.what]).filter(Boolean).map((x) => String(x).slice(0, 160)).slice(0, 5),
      takes: entry?.takes ?? tool?.takes ?? [],
      gives: entry?.gives ?? [],
      workflow: wf ? (entry?.open?.workflow ?? workflowName(id)) : null,
      tutorial: entry?.tutorial ?? null,
      price: price.label,
      credits: price.credits,
      cost: price.cost,
    });
    if (steps.length >= MAX_STEPS) break;
  }
  return { title: String(plan?.title ?? "").trim().slice(0, 120) || (steps.length === 1 ? "One book will do it" : `Your recipe: ${steps.length} steps`), steps };
}

/** The recipe's total: the credits of the steps that name them, and whether some step costs what cannot be said yet. */
export function totalOf(steps) {
  let credits = 0;
  let unknown = false;
  for (const s of steps) {
    if (typeof s.credits === "number") credits += s.credits;
    else unknown = true;
  }
  const label = !credits && !unknown ? "Free" : `≈ ${Math.round(credits)} cr${unknown ? " + GPU time" : ""}`;
  return { credits: Math.round(credits), unknown, label };
}

/**
 * The golden thread: a path through the books' points in the recipe's order (points: [{ step, x, y }], a book that is not on screen is
 * left out). Each span sags a little below the straight line between two books, as a thread does; a thread of one point is nothing.
 */
export function threadPath(points) {
  const pts = points.filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y)).sort((a, b) => a.step - b.step);
  if (pts.length < 2) return "";
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const sag = Math.min(90, Math.hypot(b.x - a.x, b.y - a.y) * 0.18);
    d += ` Q ${((a.x + b.x) / 2).toFixed(1)} ${(Math.max(a.y, b.y) + sag).toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
  }
  return d;
}

/**
 * What the next step can be handed from a result of the step before: the kind of the result, when the next step takes it (a picture to
 * a tool that takes a picture), else null (the next step opens empty).
 */
export function handable(result, nextStep) {
  if (!result || !nextStep) return null;
  const kind = result.kind;
  return ["image", "video", "audio"].includes(kind) && (nextStep.takes ?? []).includes(kind) ? kind : null;
}
