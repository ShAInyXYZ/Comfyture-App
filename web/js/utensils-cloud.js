// The way the VFX and Audio workbenches reach the template runner (utensils-templates-api.js, built with the Templates workspace: the
// official ComfyUI templates run on Comfy Cloud). What a workbench knows is the template's name and what it means by its fields (a
// clip, a picture, a sound, words): this module finds the slots of the template that mean those, fills them, and runs it. A run
// needs the person's yes to the price (runTemplate takes `confirmed: true` and nothing is sent without it), so the workbench asks
// first (see arming() below) and passes the yes here.
//
// The runner's contract as used here (utensils-templates-api.js):
//   getTemplate(name)               -> { ..., schema: { slots: [{ id, label, kind, required, advanced, default, min, max, step, options }], models, notes } }
//                                      slot kinds: image, video, audio, text, number, seed, combo, boolean; slot ids are meaningful
//                                      (video, image, image2, audio, audio2, prompt, negative, seed...)
//   estimateTemplate(name)          -> { credits, perUnit, note }   (free, read-only; credits 0 means no partner node: the GPU time is not counted)
//   runTemplate(name, inputs, { tool, label, credits, confirmed }) -> the results kept (a list); a job of the queue, kept as results of `tool`
//   inputs are { [slot.id]: value }; a picture, clip or sound is the library item ({ file, url, ... }), a number or words as themselves
import { toast } from "./store.js";

let runner;
/** The runner, or null while it is not there (the page is then honest about it). */
export async function runnerOf() {
  if (runner !== undefined) return runner;
  try {
    runner = await import("./utensils-templates-api.js");
  } catch {
    runner = null;
  }
  if (runner && !["runTemplate", "estimateTemplate", "getTemplate"].every((k) => typeof runner[k] === "function")) runner = null;
  return runner;
}
/** Whether the runner is on the page now (without waiting for it). */
export const runnerReady = () => !!runner;
runnerOf();

const MEDIA = { video: "video", image: "image", image2: "image", audio: "audio", audio2: "audio" };
/**
 * The slots a template has, by what they mean. `want` names the roles the tool fills (video, image, image2, audio, audio2, text); a
 * role takes the slot of that id, else the first slot of its kind not taken yet; the words go to `prompt`, else the first words slot
 * that is not a negative one. What is left over is for the form.
 */
export function mapSlots(schema, want = {}) {
  const slots = schema?.slots ?? [];
  const taken = new Set();
  const roles = {};
  const take = (role, slot) => slot && (taken.add(slot.id), (roles[role] = slot));
  for (const role of Object.keys(MEDIA)) {
    if (!want[role]) continue;
    take(role, slots.find((s) => s.id === role && !taken.has(s.id)) ?? slots.find((s) => s.kind === MEDIA[role] && !taken.has(s.id)));
  }
  if (want.text) take("text", slots.find((s) => s.kind === "text" && s.id === "prompt") ?? slots.find((s) => s.kind === "text" && !/negative/i.test(s.id + s.label)));
  return { roles, rest: slots.filter((s) => !taken.has(s.id)) };
}

/** The inputs of the runner for what the tool has: { role: value } turned into { slot id: value }, with the template's own values left where nothing was given. */
export async function fillInputs(name, want, given, extra = {}) {
  const api = await runnerOf();
  if (!api) throw new Error("The template runner is not on this page yet.");
  const { schema } = await api.getTemplate(name);
  const { roles } = mapSlots(schema, want);
  const inputs = { ...extra };
  for (const [role, slot] of Object.entries(roles)) {
    const v = given[role];
    if (v !== undefined && v !== null && v !== "") inputs[slot.id] = v;
  }
  return inputs;
}

/** What the runner says a template costs: { credits, perUnit, note }, or null when that cannot be known. */
export async function costOf(name) {
  const api = await runnerOf();
  if (!api) return null;
  try {
    const e = await api.estimateTemplate(name);
    return e && (typeof e.credits === "number" || e.credits === null) ? e : null;
  } catch {
    return null;
  }
}

/** The price as a short label (the runner's own), or "" when it is not known. */
export const priceText = (est) => (runner?.priceLabel ? runner.priceLabel(est) : est && typeof est.credits === "number" ? `≈ ${est.credits} cr` : "");

/** Runs a template with the person's yes to the price. The results are kept by the runner (a list). */
export async function runCloud(name, want, given, { tool, label, extra, credits = null, note } = {}) {
  const api = await runnerOf();
  if (!api) throw new Error("The template runner is not on this page yet.");
  const inputs = await fillInputs(name, want, given, extra);
  const made = await api.runTemplate(name, inputs, { tool, label, credits, confirmed: true });
  return note ? made.map((r) => (r?.note === undefined || r.note === label || r.note === name ? { ...r, note } : r)) : made;
}

/** Says why a cloud tool cannot run yet (a toast), when the runner is missing. */
export function needRunner() {
  toast("The template runner is not on this page yet: this tool runs on Comfy Cloud through it.", { tone: "crit" });
}
