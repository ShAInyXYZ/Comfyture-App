// The page's side of the Edit tools' server (server/utensils-edit.ts): a tool is started, then asked about until it is done
// (progress as it goes), stopped when asked to; one frame of what a tool would make; a strip of a clip's thumbnails.

const call = async (path, method = "POST", body) => {
  const res = await fetch(`api/utensils/edit/${path}`, { method, headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error ?? `Request failed (${res.status})`);
  return out;
};

/**
 * A tool, run: started on the server and waited for. Answers the files it made (each { kind, file, url, width, height, duration,
 * bytes, ext }). `set` takes the progress (0 to 1); `onStarted(id)` is told the job's id, so it can be stopped.
 */
export async function editRun(tool, body, set = () => {}, onStarted = () => {}) {
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
export const editStop = (id) => call(`jobs/${id}`, "DELETE").catch(() => {});

/** One frame of what a tool would make, at a time of the clip: a picture's URL. */
export const editPreview = (tool, body, at) => call("preview", "POST", { ...body, tool, at });
/** A clip's thumbnails in one picture: { url, count, width, height }. */
export const editStrip = (video, count) => call("strip", "POST", { video, count });
/** What a clip holds: { duration, width, height, fps, hasAudio, hasVideo }. */
export const editProbe = (file) => call("probe", "POST", { file });
/** A .cube LUT kept for the grade tool: { file }. */
export async function editLut(file) {
  const res = await fetch("api/utensils/edit/lut", { method: "POST", headers: { "Content-Type": "text/plain" }, body: file });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error ?? `Request failed (${res.status})`);
  return out;
}
