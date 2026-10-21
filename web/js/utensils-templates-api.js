// The page's side of Utensils' Templates (server/comfy-templates.ts): the catalog of the official ComfyUI workflow templates, what each
// one asks for, its price, and running one on Comfy Cloud as a job of the queue. The VFX and Audio tools run curated templates through
// runTemplate() with a friendly inputs object, so they and the Templates workspace share one road to Cloud.
//
//   listTemplates({ q, group, tag, featured, limit, offset })  -> { count, total, categories, items }
//   getTemplate(name)                                          -> the card plus schema { slots, models, notes }
//   estimateTemplate(name)                                     -> { credits, perUnit, note }   (free, read-only)
//   runTemplate(name, inputs, { tool, label, confirmed })      -> the results kept (a list); needs confirmed: true, the person's yes to the price
//   graphOf(name)                                              -> { nodes: [{ type, count }], models, subgraphs } for 'View graph'
//   uploadForSlot(kind, file) / pickForSlot(kind, anchor)      -> { file, url, ... } a library item for a picture / clip / sound slot
//
// inputs are keyed by the slot ids of the schema: text, numbers, a seed, a combo or a boolean as themselves; a picture, clip or sound
// as the library item ({ file, ... }) or its file name.
import { api } from "./api.js";
import { openPicker, pictureOf } from "./picker.js";
import { trackJob, cancelJob, registerTool } from "./utensils.js";
import { h } from "./dom.js";

const BASE = "api/utensils/templates";

async function call(path, init) {
  const res = await fetch(path, init);
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(out.error ?? `Request failed (${res.status})`), { status: res.status });
  return out;
}
const post = (path, body) => call(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });

export function listTemplates(params = {}) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "" && v !== false) q.set(k, v === true ? "1" : String(v));
  return call(`${BASE}?${q}`);
}
export const getTemplate = (name) => call(`${BASE}/${encodeURIComponent(name)}`);
export const estimateTemplate = (name) => post(`${BASE}/${encodeURIComponent(name)}/estimate`);
export const graphOf = (name) => call(`${BASE}/${encodeURIComponent(name)}/graph`);

// the tool that results made here are kept under when a caller names none (the workspace's own)
registerTool({ id: "template", workspace: "templates", name: "Template", icon: "tool-templates", hint: "An official ComfyUI workflow, run on Comfy Cloud", takes: [], verb: "Run" });

/** Waits for a job of the server by polling it (a job of Cloud may take minutes; a poll needs no live connection). */
async function follow(started, setProgress, signal) {
  let job = started;
  for (let i = 0; i < 2400; i++) {
    if (job.status !== "running") break;
    await new Promise((ok) => setTimeout(ok, i === 0 ? 700 : 1500));
    if (signal.stopped) break;
    job = await call(`${BASE}/job/${started.id}`).catch(() => job);
    setProgress(job.progress ?? 0);
  }
  return job;
}

const errors = new Map();
/** What the last run of a template said when it failed (a model Cloud lacks, no credits...), until it runs again. */
export const lastError = (name) => errors.get(name) ?? "";

/**
 * Runs a template as a job of the queue and keeps what it makes (pictures, clips, sounds, 3D files) as results of `tool`. `confirmed`
 * is the person's yes to the price: nothing is sent without it. Answers the results kept (a list, empty when it failed or was canceled).
 */
export function runTemplate(name, inputs = {}, { tool = "template", label, credits = null, confirmed = false } = {}) {
  if (confirmed !== true) return Promise.reject(new Error("Confirm the price first."));
  errors.delete(name);
  return trackJob({ tool, label: label ?? name, credits }, async (setProgress, queued) => {
    const signal = { stopped: false };
    try {
      const started = await post(`${BASE}/${encodeURIComponent(name)}/run`, { inputs, confirm: true });
      queued.onCancel = () => {
        signal.stopped = true;
        fetch(`${BASE}/job/${started.id}`, { method: "DELETE" }).catch(() => {});
      };
      const done = await follow(started, setProgress, signal);
      if (signal.stopped) return [];
      if (done.status !== "done") throw new Error(done.error ?? "That didn't work.");
      return done.outputs.map((o) => ({ ...o, note: label ?? name, template: name }));
    } catch (e) {
      errors.set(name, e.message);
      throw e;
    }
  });
}
export { cancelJob };

/** Sends a file from the computer into the library as what a slot wants: a picture, a clip or a sound. */
export async function uploadForSlot(kind, file) {
  if (kind === "image") {
    const p = await api.upload(file, file.name);
    return { file: p.file, url: p.url, width: p.width, height: p.height, kind };
  }
  if (kind === "video") {
    const v = await api.uploadVideo(file);
    return { file: v.file, url: v.url, width: v.width, height: v.height, duration: v.duration, kind };
  }
  const a = await api.uploadAudio(file);
  return { file: a.file, url: a.url, seconds: a.seconds, name: file.name || a.name, kind };
}

const ACCEPT = { image: "image/*", video: "video/*", audio: "audio/*,video/*" };
/** Asks for a picture (the library's picker), a clip or a sound (a file from the computer); answers the library item, or null. */
export function pickForSlot(kind, anchor) {
  return new Promise((ok, no) => {
    if (kind === "image") {
      return openPicker(anchor, { title: "A picture for the template", onPick: async (choice) => { try { const p = await pictureOf(choice); ok({ file: p.file, url: p.url, width: p.width, height: p.height, kind }); } catch (e) { no(e); } } });
    }
    const input = h("input", { type: "file", accept: ACCEPT[kind], hidden: true, on: { change: async () => { const f = input.files[0]; input.remove(); if (!f) return ok(null); try { ok(await uploadForSlot(kind, f)); } catch (e) { no(e); } } } });
    document.body.append(input);
    input.click();
  });
}

/** The price as a short label: "≈ 12 cr", "≈ 12 cr / image", "GPU only" (no partner credits), or "" when it is not known. */
export function priceLabel(est) {
  if (!est || est.credits === null || est.credits === undefined) return "";
  if (est.credits === 0) return "GPU time";
  return `≈ ${est.credits} cr${est.perUnit ? ` / ${est.perUnit}` : ""}`;
}
