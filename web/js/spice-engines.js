// How Spice's departments make their passes: the engines Utensils already has, reached through one door. A free pass runs on this
// machine with ffmpeg (the effects server: utensils-fx-api.js, the edit tools: utensils-edit-api.js); a paid one runs a Comfy Cloud
// template through the template runner (utensils-cloud.js: it fills the template's form from what the department has and asks the
// server to run it) or an LTX shot (the Shot's own road, api.shoot). Whatever runs is a JOB of its department: its lamp is amber and its
// progress shows while it works, and what it makes becomes the department's pass. A paid job is only sent with the person's yes
// (spice-ui.js: primary()); the price is the runner's own estimate, or for an open model a guess from the seconds of footage.
import { api } from "./api.js";
import { state, toast, waitFor, jobWatchers, changed } from "./store.js";
import { editRun, editStop, editProbe, editPreview } from "./utensils-edit-api.js";
import { fxRun, fxStop } from "./utensils-fx-api.js";
import { runnerOf, fillInputs, costOf, priceText } from "./utensils-cloud.js";
import { spice, setPass, setBusy, edit, flushShots } from "./spice.js";
import { FIRST, TEMPLATES, framesIn, secondsAt, lastFrame, rangeOf, gpuCredits, ltxCredits, mediaOf, pickMedia } from "./spice-model.js";

// ---------------------------------------------------------------- what a file made is a media

/** A file an engine made, as the shot keeps it. */
export { mediaOf, pickMedia };

/**
 * What FX's layers are drawn over, at once (the viewer's live composite): the light or the clean-up when they are there and shown, else
 * the footage; and Roto's matte, which holds the people in front of the layers behind them. { base, baseFrom, matte, matteFrom }
 */
export function fxGround(b = spice.shot?.body) {
  const plate = b?.passes.plate;
  if (!plate) return { base: null, baseFrom: FIRST, matte: null, matteFrom: FIRST };
  const kind = plate.media.kind;
  const top = ["light", "gen", "paint"].map((d) => b.passes[d]).find((p) => p?.media && p.eye !== false && p.media.kind === kind && p.media.file);
  const roto = b.passes.roto;
  const matte = roto?.type === "matte" && roto.eye !== false && roto.media?.url ? roto : null;
  return { base: top?.media ?? plate.media, baseFrom: top?.from ?? FIRST, matte: matte?.media ?? null, matteFrom: matte?.from ?? FIRST };
}

// ---------------------------------------------------------------- a department's job

/**
 * Runs a department's work as its job: the department is working (amber lamp, progress) until `make(setProgress, job)` answers what it
 * made (a result or a list, or { files, from, to } when it knows the frames it worked on); that becomes the department's pass (or goes to
 * `keep(media, shot)`, when the work is kept another way: a subject's matte). Answers the media, or null when it failed (a toast says why). The shot the work was asked for gets it, even if
 * another shot is open by then.
 */
export async function work(dept, label, make, { credits = 0, note, from, to, keep, source = "free" } = {}) {
  const shot = spice.shot;
  if (!shot) return null;
  const mark = { label, progress: 0 };
  if (spice.busy.has(`${shot.id}:${dept}`)) {
    toast(`${dept === "fx" ? "FX" : dept[0].toUpperCase() + dept.slice(1)} is still working on the last one.`);
    return null;
  }
  setBusy(dept, mark, shot.id);
  const job = { onCancel: null };
  mark.cancel = () => job.onCancel?.();
  try {
    const made = await make((p) => ((mark.progress = Math.max(mark.progress, Math.min(1, Number(p) || 0))), changed("spice")), job);
    // a job may say which frames it worked on: { files, from, to }
    const media = pickMedia(made?.files ?? made);
    if (!media) throw new Error("Nothing came back.");
    if (keep) keep(media, shot);
    else {
      const fps = shot.body.passes.plate?.fps ?? 24;
      const start = made?.from ?? from ?? rangeOf(shot.body).in;
      setPass(dept, media, { from: start, to: made?.to ?? to ?? (media.kind === "video" && media.seconds ? start + framesIn(media.seconds, fps) - 1 : start), note, credits, label, source }, shot);
    }
    return media;
  } catch (e) {
    if (!/^Stopped\.?$|^Canceled\.?$/.test(e.message)) toast(`${label}: ${e.message}`, { tone: "crit" });
    return null;
  } finally {
    setBusy(dept, null, shot.id);
    flushShots();
  }
}

// ---------------------------------------------------------------- the footage

/** The footage the engines take: the whole plate, or when a frame range is chosen, the plate cut to it (made once, kept with the plate). */
export async function footage(shot = spice.shot) {
  const b = shot?.body;
  const plate = b?.passes.plate;
  if (!plate) throw new Error("Bring the footage to the Plate first.");
  if (plate.media.kind === "image") return plate.media;
  const r = rangeOf(b);
  if (r.in <= FIRST && r.out >= lastFrame(plate)) return plate.media;
  if (plate.cut && plate.cut.in === r.in && plate.cut.out === r.out) return plate.cut.media;
  const fps = plate.fps ?? 24;
  const made = await editRun("trim", { video: plate.media.file, start: secondsAt(r.in, fps), end: secondsAt(r.out + 1, fps), mode: "encode" });
  const media = pickMedia(made);
  if (!media) throw new Error("The range could not be cut.");
  edit((x) => (x.passes.plate.cut = { in: r.in, out: r.out, media }), shot);
  return media;
}

/**
 * The clip the department makes its pass from, and the slate number of its first frame: { media, from }. Paint and Roto work on the footage;
 * Light on the clean-up if there is one; Fx on the light; Comp on the top of the stack. The footage cut to a range starts at the range's in.
 */
export async function inputFor(dept, shot = spice.shot) {
  const b = shot.body;
  // (Gen redraws the footage as it is cleaned up, never its own last take: its takes are alternatives; "genNext" is the shot as it stands, to carry on)
  const chain = { roto: [], paint: [], gen: ["paint"], genNext: ["gen", "paint"], light: ["light", "gen", "paint"], fx: ["light", "gen", "paint"], comp: ["comp", "fx", "light", "gen", "paint"], plate: [] }[dept] ?? [];
  // (a picture's passes are pictures; a clip's are clips)
  const kind = b.passes.plate?.media.kind === "image" ? "image" : "video";
  for (const d of chain) {
    const p = b.passes[d];
    if (p?.media && p.eye !== false && p.media.kind === kind && p.media.file) return { media: p.media, from: p.from ?? FIRST };
  }
  const media = await footage(shot);
  const plate = b.passes.plate;
  return { media, from: plate.cut && media === plate.cut.media ? plate.cut.in : FIRST };
}
/** The time of a slate frame in the clip an input is (its first frame is `from`). */
export const timeIn = (input, frame, fps = 24) => Math.max(0, (frame - input.from) / fps);

/** The frame the footage is on at a time, as a picture of the library (the start of an LTX shot, a picture to relight). */
export async function frameOf(media, seconds) {
  if (media.kind === "image") return { file: media.file, url: media.url, width: media.width, height: media.height };
  const { url } = await editPreview("grade", { video: media.file, preset: "none" }, seconds);
  const blob = await (await fetch(url)).blob();
  const p = await api.upload(blob, "Spice frame");
  return { file: p.file, url: p.url, width: p.width, height: p.height };
}

// ---------------------------------------------------------------- importing

/** A clip or a picture from the computer, into the shot: kept in the library, read (its frame rate), a still of it for the shot's thumbnail. */
export async function importFootage(file) {
  if (!file) return;
  const shot = spice.shot;
  const kind = file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : null;
  if (!kind) return toast("Spice takes a clip or a picture.");
  setBusy("plate", { label: "Importing", progress: 0 }, shot.id);
  try {
    let media;
    let fps = 24;
    if (kind === "image") {
      const p = await api.upload(file, file.name);
      media = { kind: "image", url: p.url, file: p.file, width: p.width, height: p.height };
    } else {
      const v = await api.uploadVideo(file);
      media = { kind: "video", url: v.url, file: v.file, width: v.width, height: v.height, seconds: v.duration };
      const probe = await editProbe(v.file).catch(() => null);
      if (probe?.fps) fps = Math.round(probe.fps * 100) / 100;
      media.still = await editPreview("grade", { video: v.file, preset: "none" }, Math.min(0.5, (v.duration || 1) / 2)).then((s) => s.url).catch(() => undefined);
    }
    edit((b) => {
      b.passes = { ...b.passes, plate: { media, eye: true, fps, name: file.name, from: FIRST, to: FIRST + (kind === "video" ? framesIn(media.seconds ?? 0, fps) - 1 : 0), at: new Date().toISOString() } };
      b.range = null;
      b.depth = null;
    }, shot);
  } catch (e) {
    toast(e.message, { tone: "crit" });
  } finally {
    setBusy("plate", null, shot.id);
  }
}

/** A clip of the library (a take or a film) as the shot's footage. */
export async function useClip(source) {
  const shot = spice.shot;
  setBusy("plate", { label: "Importing", progress: 0 }, shot.id);
  try {
    const v = await api.videoFrom(source);
    const media = { kind: "video", url: v.url, file: v.file, width: v.width, height: v.height, seconds: v.duration };
    const probe = await editProbe(v.file).catch(() => null);
    const fps = probe?.fps ? Math.round(probe.fps * 100) / 100 : 24;
    media.still = await editPreview("grade", { video: v.file, preset: "none" }, Math.min(0.5, (v.duration || 1) / 2)).then((s) => s.url).catch(() => undefined);
    edit((b) => {
      b.passes = { ...b.passes, plate: { media, eye: true, fps, name: "Take", from: FIRST, to: FIRST + framesIn(media.seconds ?? 0, fps) - 1, at: new Date().toISOString() } };
      b.range = null;
      b.depth = null;
    }, shot);
  } catch (e) {
    toast(e.message, { tone: "crit" });
  } finally {
    setBusy("plate", null, shot.id);
  }
}

/** Asks for a file from the computer (a clip or a picture). */
export function pickFile(fn) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "video/*,image/*";
  input.hidden = true;
  input.addEventListener("change", () => (input.files[0] && fn(input.files[0]), input.remove()));
  document.body.append(input);
  input.click();
}

// ---------------------------------------------------------------- the free engines

/** An effect of the free effects server, run as a department's job: its files, with the progress. */
export const freeFx = (tool, body) => (set, job) => fxRun(tool, body, set, (id) => (job.onCancel = () => fxStop(id)));
/** An edit tool (trim, grade, speed, convert...), run the same way. */
export const freeEdit = (tool, body) => (set, job) => editRun(tool, body, set, (id) => (job.onCancel = () => editStop(id)));

// ---------------------------------------------------------------- the paid engines

/** Why a partner's template cannot run here: open weights only is on (COMFYTURE_OPEN_WEIGHTS), and the server would refuse it. */
export const partnerOff = (key) => {
  const t = TEMPLATES[key];
  return t?.partner && state.account?.openWeights ? `Open weights only is on, and ${t.title} is ${t.partner}'s model` : "";
};

const estimates = new Map();
/**
 * What a template costs, as a number of credits (or null while it is not known): a partner's price is the runner's estimate (the screen is
 * drawn again when it comes), an open model's is a guess of its GPU time from the seconds of footage.
 */
export function priceOf(key, seconds = 5) {
  const t = TEMPLATES[key];
  if (!t) return null;
  if (!t.partner) return gpuCredits(t.gpu ?? 8, seconds);
  // (a partner's template under open weights only is not asked for its price: it cannot run here)
  if (partnerOff(key)) return null;
  if (!estimates.has(t.name)) {
    estimates.set(t.name, undefined);
    costOf(t.name).then((e) => (estimates.set(t.name, e ?? null), changed("spice")));
  }
  const e = estimates.get(t.name);
  return e && typeof e.credits === "number" && e.credits > 0 ? e.credits : null;
}
/** The words the price is told in: "≈ 12 cr", or the partner's own label (per unit) when it has one. */
export function priceLabel(key, seconds = 5) {
  const t = TEMPLATES[key];
  const e = t?.partner ? estimates.get(t.name) : null;
  if (e && e.credits > 0) return priceText(e) || `≈ ${e.credits} cr`;
  const n = priceOf(key, seconds);
  return typeof n === "number" ? `≈ ${n} cr` : "≈ ? cr";
}
export const ltxPrice = ltxCredits;

/**
 * Runs a template as a job: its form filled from what is given (`given`: video, image, text by role; `extra`: the form's other slots by id),
 * sent with the person's yes (the key that asked has been pressed twice), waited for. Answers the outputs the runner kept.
 */
export function cloud(key, given, { extra, label } = {}) {
  const t = TEMPLATES[key];
  return async (set, job) => {
    const api2 = await runnerOf();
    if (!api2) throw new Error("The template runner is not on this page yet.");
    const inputs = await fillInputs(t.name, t.want, given, extra);
    return api2.execTemplate(t.name, inputs, { setProgress: set, queued: job, label: label ?? t.title, confirmed: true });
  };
}

/** An LTX shot from a frame: what the Shot desk makes; answers the clip, in the library, ready to be an input of the next. */
export function ltx({ photo, prompt, seconds, name }) {
  return async (set, job) => {
    const [run] = await api.shoot({ review: false, takes: 1, quality: "standard", aspect: "auto", name, start: photo.file, seconds, script: { shots: [{ action: prompt, camera: "locked", sound: "", framing: "" }], raw: "" } });
    job.onCancel = () => fetch(`api/runs/${run.id}/cancel`, { method: "POST" }).catch(() => {});
    const done = await waitFor("run", run.id);
    set(1);
    const v = await api.videoFrom({ run: done.id });
    return { kind: "video", url: v.url, file: v.file, width: v.width, height: v.height, duration: v.duration };
  };
}

/** A job of the server (Utensils' upscale of a clip): started, and waited for with its progress. */
export function serverJob(path, body) {
  return async (set) => {
    const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const started = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(started.error ?? `Request failed (${res.status})`);
    // (a clip the job made, or a picture)
    const made = (j) => (j.video ? { kind: "video", url: j.video.url, file: j.video.file, width: j.video.width, height: j.video.height, duration: j.video.duration } : j.photo ? { kind: "image", url: j.photo.url, file: j.photo.file, width: j.photo.width, height: j.photo.height } : null);
    // (a job answered already done needs no waiting)
    if (started.status === "done" && (started.video || started.photo)) return made(started);
    jobWatchers.set(started.id, (j) => set(j.progress ?? 0));
    try {
      const j = await waitFor("job", started.id);
      const m = made(j);
      if (!m) throw new Error("Nothing came back.");
      return m;
    } finally {
      jobWatchers.delete(started.id);
    }
  };
}
