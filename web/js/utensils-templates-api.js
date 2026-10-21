// The page's side of Utensils' Templates (server/comfy-templates.ts): the catalog of the official ComfyUI workflow templates, what each
// one asks for, its price, and running one on Comfy Cloud as a job of the queue. The VFX and Audio tools run curated templates through
// runTemplate() with a friendly inputs object, so they and the Templates workspace share one road to Cloud.
//
//   listTemplates({ q, group, tag, featured, limit, offset })  -> { count, total, categories, items }
//   getTemplate(name)                                          -> the card plus schema { slots, models, notes }
//   estimateTemplate(name)                                     -> { credits, perUnit, note }   (free, read-only)
//   runTemplate(name, inputs, { tool, label, confirmed })      -> the results kept (a list); needs confirmed: true, the person's yes to the price
//   graphOf(name)                                              -> { nodes: [{ type, count }], models, subgraphs } for 'View graph'
//   loadApps() / apps / appOfTool(toolId)                      the mini apps (simplified templates: a promise, one to three inputs, one key),
//                                                              and the tools they are registered as for Truffle (id app-<id>, app: true)
//   uploadForSlot(kind, file) / pickForSlot(kind, anchor)      -> { file, url, ... } a library item for a picture / clip / sound slot
//
// inputs are keyed by the slot ids of the schema: text, numbers, a seed, a combo or a boolean as themselves; a picture, clip or sound
// as the library item ({ file, ... }) or its file name.
import { api } from "./api.js";
import { openPicker, pictureOf } from "./picker.js";
import { trackJob, cancelJob, registerTool, setWorkspace } from "./utensils.js";
import { changed } from "./store.js";
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
 * Runs a template and waits for it: the job on the server followed to its end. `setProgress` is told how far it is; `queued`, when a
 * job of the queue is running it, learns how to stop it. Answers the outputs (as results, not yet kept) or throws what went wrong.
 * `confirmed` is the person's yes to the price: nothing is sent without it. A job of the queue is made by the callers (runTemplate,
 * or a tool's own run) so that it is never made twice.
 */
export async function execTemplate(name, inputs = {}, { setProgress = () => {}, queued = null, label, from = null, confirmed = false } = {}) {
  if (confirmed !== true) throw new Error("Confirm the price first.");
  errors.delete(name);
  const signal = { stopped: false };
  try {
    const started = await post(`${BASE}/${encodeURIComponent(name)}/run`, { inputs, confirm: true });
    if (queued) {
      queued.onCancel = () => {
        signal.stopped = true;
        fetch(`${BASE}/job/${started.id}`, { method: "DELETE" }).catch(() => {});
      };
    }
    const done = await follow(started, setProgress, signal);
    if (signal.stopped) return [];
    if (done.status !== "done") throw new Error(done.error ?? "That didn't work.");
    return done.outputs.map((o) => ({ ...o, note: label ?? name, template: name, ...(from && o.kind === "image" ? { from } : {}) }));
  } catch (e) {
    errors.set(name, e.message);
    throw e;
  }
}

/**
 * Runs a template as a job of the queue and keeps what it makes (pictures, clips, sounds, 3D files) as results of `tool`. `confirmed`
 * is the person's yes to the price: nothing is sent without it. `from` is the picture it was given, kept with a picture it makes (so it
 * can be shown against it). Answers the results kept (a list, empty when it failed or was canceled).
 */
export function runTemplate(name, inputs = {}, { tool = "template", label, credits = null, confirmed = false, from = null } = {}) {
  if (confirmed !== true) return Promise.reject(new Error("Confirm the price first."));
  errors.delete(name);
  return trackJob({ tool, label: label ?? name, credits }, (setProgress, queued) => execTemplate(name, inputs, { setProgress, queued, label, from, confirmed }));
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

// ---------------------------------------------------------------- the mini apps
// An app is a template shown simply (server/comfy-templates.ts: apps): its own promise, the one to three inputs that matter and one
// key. The list is read once (and again while the server is still reading the forms, so the apps that cannot be driven drop out and the
// prices come in); each app is registered as a tool of the Templates workspace (id app-<id>, app: true) so Truffle can open one by its
// name, give it what it needs and ask to run it. The page confirms the price before anything runs, as for every tool.

const APP_ICON = { image: "image-library", video: "film-make", audio: "audio-music", "3d": "tool-templates" };
// what a run costs when the template bills no partner credits: GPU time, about, by what it makes (like the built-in tools' formulas)
const GPU_GUESS = { image: 6, video: 24, audio: 10, "3d": 12 };
const randomSeed = () => Math.floor(Math.random() * 4294967295);

export const toolIdOfApp = (a) => `app-${a.id}`;
/** The state of the apps: idle | loading | ready | none (no Cloud, or the server does not answer). */
export const apps = { state: "idle", list: [], total: 0, settled: false };
let loading = null;
let settling = 0;

export function listApps(params = {}) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  return call(`${BASE}/apps?${q}`);
}
export const appOfTool = (toolId) => apps.list.find((a) => toolIdOfApp(a) === toolId) ?? null;
export const appByName = (name) => apps.list.find((a) => a.name === name) ?? null;
/** The price an app shows: its partner credits, else a guess of the GPU time it takes. */
export const appCost = (a) => (a.credits > 0 ? a.credits : GPU_GUESS[a.medium] ?? 8);

/** Opens an app in the Templates workspace (the panel draws it). */
export function openApp(a) {
  setWorkspace("templates");
  document.dispatchEvent(new CustomEvent("utensils:app", { detail: { name: a.name } }));
}

/** What a run of an app from a tool's own key (Truffle's) sends: the shared picture, clip and sound, and the words, to its own slots. */
async function runApp(a, i, set, job) {
  const d = await getTemplate(a.name);
  if (d.app?.usable === false) throw new Error(`${a.title} can't be run from here.`);
  const inputs = {};
  const used = new Set();
  for (const s of d.schema.slots.filter((x) => x.primary)) {
    if (["image", "video", "audio"].includes(s.kind)) {
      // the shared inputs hold one of each kind: an app that asks for two pictures is finished in its own panel
      if (used.has(s.kind)) {
        openApp(a);
        throw new Error(`${a.title} needs more than one ${s.kind === "image" ? "picture" : s.kind === "video" ? "clip" : "sound"}: add them in its panel.`);
      }
      used.add(s.kind);
      if (!i[s.kind]) throw new Error(`${a.title} needs ${s.kind === "image" ? "a picture" : s.kind === "video" ? "a clip" : "a sound"}.`);
      inputs[s.id] = { file: i[s.kind].file };
    } else if (s.kind === "text") inputs[s.id] = i.prompt ?? "";
  }
  for (const s of d.schema.slots) if (s.kind === "seed") inputs[s.id] = randomSeed();
  return execTemplate(a.name, inputs, { setProgress: set, queued: job, label: a.title, from: i.image?.url ?? null, confirmed: true });
}

function toolOf(a) {
  const takes = [...new Set(a.needs.filter((k) => k !== "words"))];
  return {
    id: toolIdOfApp(a), app: true, appName: a.name, workspace: "templates", group: "Apps", name: a.title, icon: APP_ICON[a.medium] ?? "tool-templates", hint: a.promise,
    takes, verb: "Run", words: a.needs.includes("words") ? "needed" : undefined,
    cost: () => appCost(a),
    run: (i, set, job) => runApp(a, i, set, job),
  };
}
function registerApps(list) {
  for (const a of list) {
    const def = toolOf(a);
    // registerTool keeps the first of an id: a second reading of the list (its needs known better now) updates the tool in place
    Object.assign(registerTool(def), def);
  }
}

/**
 * Reads the apps (once; a second time with `again`). The server reads every app's form in the background after it starts, so the first
 * answer may still hold apps that cannot be driven and lack their prices: it is read again a few times until each app has been read.
 */
export function loadApps(again = false) {
  if (loading && !again) return loading;
  if (apps.state === "idle") apps.state = "loading";
  loading = listApps().then((out) => {
    apps.list = out.items;
    apps.total = out.total;
    apps.state = "ready";
    apps.settled = out.items.every((a) => a.primary);
    registerApps(out.items);
    changed("utensils");
    if (!apps.settled && settling < 6) {
      settling += 1;
      setTimeout(() => loadApps(true), 7000);
    }
    return out;
  }).catch(() => {
    if (apps.state === "loading") apps.state = "none";
    loading = null;
    return { items: [] };
  });
  return loading;
}
