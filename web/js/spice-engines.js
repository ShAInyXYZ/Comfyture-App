// How Spice runs things: a job on the server (the suite's route, watched on the event stream, or a template of the runner, polled), a shot
// rolled by LTX-2.5 (Kitchen's own take, brought into the library as the plate), a clip or a picture brought in from the computer. Each
// run is done through `work`, which lights the shot's lamp, shows its progress, and keeps what it cost.
import { toast, waitFor, jobWatchers } from "./store.js";
import { api } from "./api.js";
import { editPreview } from "./utensils-edit-api.js";
import { spice, setBusy, addShot, setPlate } from "./spice.js";

/**
 * Runs `make(progress)` as the work of a shot: the lamp lit with `label`, the progress shown, an error told. Answers what `make` made, or null.
 */
export async function work(shotId, label, make) {
  const scenarioId = spice.scenario?.id;
  if (!shotId || !scenarioId) return null;
  setBusy(shotId, { label, progress: 0 }, scenarioId);
  try {
    return await make((p) => setBusy(shotId, { label, progress: Math.min(1, Math.max(0, p)) }, scenarioId));
  } catch (e) {
    toast(e.message, { tone: "crit" });
    return null;
  } finally {
    setBusy(shotId, null, scenarioId);
  }
}

const madeOf = (j) => (j.video ? { kind: "video", url: j.video.url, file: j.video.file, width: j.video.width, height: j.video.height, seconds: j.video.duration, ...(j.video.extra ? { extra: j.video.extra } : {}) } : null);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A template job of the runner, polled to its end: the clip it made. */
async function templateJob(id, set) {
  for (let i = 0; i < 1800; i++) {
    const res = await fetch(`api/utensils/templates/job/${id}`);
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error ?? "The job is gone.");
    set(j.progress ?? 0);
    if (j.status === "done") {
      const v = (j.outputs ?? []).find((o) => o.kind === "video");
      if (!v) throw new Error("The template made no clip.");
      return { kind: "video", url: v.url, file: v.file, width: v.width, height: v.height, seconds: v.seconds, credits: j.credits ?? null };
    }
    if (j.status === "failed" || j.status === "canceled") throw new Error(j.error ?? "The run did not finish.");
    await sleep(2000);
  }
  throw new Error("The run took too long.");
}

/** A tool on a clip (api/spice/run): started, and waited for with its progress. Answers the clip the tool made. */
export async function runTool(body, set) {
  const res = await fetch("api/spice/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const started = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(started.error ?? `Request failed (${res.status})`);
  if (started.template) return templateJob(started.id, set);
  if (started.status === "done" && started.video) return madeOf(started);
  if (started.status === "failed") throw new Error(started.error ?? "The run did not finish.");
  jobWatchers.set(started.id, (j) => set(j.progress ?? 0));
  try {
    const j = await waitFor("job", started.id);
    const m = madeOf(j);
    if (!m) throw new Error("Nothing came back.");
    return m;
  } finally {
    jobWatchers.delete(started.id);
  }
}

/** A still of a clip (its frame at half a second), for the thumbnails; undefined when it cannot be made. */
export const stillOf = (media) => editPreview("grade", { video: media.file, preset: "none" }, Math.min(0.5, (media.seconds || 1) / 2)).then((s) => s.url).catch(() => undefined);

/**
 * A shot rolled by LTX-2.5 from a first frame and some words (Kitchen's take, five seconds at 720p with its sound), waited for, then brought
 * into the library of clips as the plate of the shot open.
 */
export async function rollShot({ frame, words, seconds, name }, set) {
  const [run] = await api.shoot({ review: false, takes: 1, quality: "standard", aspect: "auto", name, start: frame.file, seconds, enhance: false, script: { shots: [{ action: words, camera: "locked", sound: "", framing: "" }], raw: "" } });
  const done = await waitFor("run", run.id);
  set(0.95);
  const v = await api.videoFrom({ run: done.id });
  const media = { kind: "video", url: v.url, file: v.file, width: v.width, height: v.height, seconds: v.duration };
  media.still = await stillOf(media);
  return { media, run: done.id };
}

/** A clip or a picture from the computer: a clip is a new shot's plate, a picture the first frame of a shot to roll (the window opens on it). */
export async function importFootage(file) {
  if (!file) return;
  const kind = file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : null;
  if (!kind) return toast("Spice takes a clip or a picture.");
  try {
    if (kind === "image") {
      const p = await api.upload(file, file.name);
      spice.roll = { ...spice.roll, frame: { kind: "image", url: p.url, file: p.file, width: p.width, height: p.height }, name: spice.roll.name || file.name.replace(/\.\w+$/, "").slice(0, 40) };
      spice.win = "shot";
      return void (await import("./store.js")).changed("spice");
    }
    const v = await api.uploadVideo(file);
    const media = { kind: "video", url: v.url, file: v.file, width: v.width, height: v.height, seconds: v.duration };
    media.still = await stillOf(media);
    // a shot open with no plate yet takes the clip; else the clip is a new shot
    const open = spice.scenario?.body.shots.find((x) => x.id === spice.scenario.body.open);
    if (open && !open.plate) setPlate(media);
    else addShot({ name: file.name.replace(/\.\w+$/, "").slice(0, 40), plate: media });
  } catch (e) {
    toast(e.message, { tone: "crit" });
  }
}

/** Asks for a file from the computer (a clip or a picture). */
export function pickFile(fn, accept = "video/*,image/*") {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = accept;
  input.hidden = true;
  input.addEventListener("change", () => (input.files[0] && fn(input.files[0]), input.remove()));
  document.body.append(input);
  input.click();
}
