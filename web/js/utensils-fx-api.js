// The page's side of the effects server (server/utensils-fx.ts): an effect is started, then asked about until it is done (progress
// as it goes), stopped when asked to; one frame of what an effect would make; what a file holds; what this machine's ffmpeg can do.

const call = async (path, method = "POST", body) => {
  const res = await fetch(`api/utensils/fx/${path}`, { method, headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error ?? `Request failed (${res.status})`);
  return out;
};

/**
 * An effect, run: started on the server and waited for. Answers the files it made (each { kind, file, url, width, height,
 * duration, bytes, ext, note }). `set` takes the progress (0 to 1); `onStarted(id)` is told the job's id, so it can be stopped.
 */
export async function fxRun(tool, body, set = () => {}, onStarted = () => {}) {
  const started = await call(tool, "POST", body);
  onStarted(started.id);
  for (;;) {
    const job = await call(`jobs/${started.id}`, "GET");
    set(job.progress ?? 0);
    if (job.status === "done") return job.results;
    if (job.status === "failed") throw new Error(job.error ?? "It did not finish.");
    if (job.status === "canceled") throw new Error("Stopped.");
    await new Promise((r) => setTimeout(r, 250));
  }
}
/** Stops a job on the server. */
export const fxStop = (id) => call(`jobs/${id}`, "DELETE").catch(() => {});
/** One frame of what an effect would make, at a time of the clip: { url }. */
export const fxPreview = (tool, body, at) => call("preview", "POST", { ...body, tool, at });
/** What a file holds: { duration, width, height, fps, hasAudio, hasVideo }. `from` is its library folder (audio, videos, edits) or "any". */
export const fxProbe = (file, from = "any") => call("probe", "POST", { file, from });
let caps = null;
/** Which effects this machine's ffmpeg can make: { chroma: true, stabilise: false, ... } (empty when the server is not reached). */
export const fxCaps = () => (caps ??= call("capabilities", "GET").catch(() => ({})));

/** What an effect made, in the shape the shelf keeps. Only a clip kept in the library of clips can be handed on to another tool. */
export const asResult = (r, note, extra = {}) => ({
  kind: r.kind,
  ...(r.url.includes("media/videos/") || r.url.includes("media/audio/") ? { file: r.file } : {}),
  url: r.url, width: r.width, height: r.height, seconds: r.duration, bytes: r.bytes, ext: r.ext, note: note ?? r.note, ...(r.kind === "audio" && r.name ? { name: r.name } : {}), ...extra,
});
