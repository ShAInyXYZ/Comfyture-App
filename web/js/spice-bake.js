// The bake of FX's layers: the composite made for good, at the footage's own size, drawn by the same compositor the viewer shows live
// (spice-layers.js), so it is what was seen. A picture is drawn once and kept in the library; a clip is drawn frame by frame (every
// clip it is drawn from set to that frame first) and each frame is sent to the server, which makes the clip of them with the sound of the
// clip they were drawn over (/api/spice/bake). Nothing leaves this machine and nothing costs credits.
import { api } from "./api.js";
import { render } from "./spice-layers.js";
import { elementOf } from "./spice-elements.js";

/** A picture of the library, loaded (and decoded) for drawing. */
export function loadImage(src) {
  return new Promise((ok, no) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => ok(img);
    img.onerror = () => no(new Error("A picture could not be read."));
    img.src = src;
  });
}
/** A clip of the library, ready to be set to any frame (it is never shown). */
export function loadVideo(src) {
  return new Promise((ok, no) => {
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.crossOrigin = "anonymous";
    v.onloadeddata = () => ok(v);
    v.onerror = () => no(new Error("A clip could not be read."));
    v.src = src;
  });
}
const loadMedia = (m) => (m.kind === "image" ? loadImage(m.url) : loadVideo(m.url));

/** Sets a clip to a time and waits until that frame is there to draw (a picture is always there). */
export function seekTo(v, t) {
  if (v.tagName !== "VIDEO") return Promise.resolve();
  const to = Math.min(Math.max(0, t), Math.max(0, (v.duration || 0) - 0.001));
  if (Math.abs(v.currentTime - to) < 0.0005 && v.readyState >= 2) return Promise.resolve();
  return new Promise((ok) => {
    const done = () => (clearTimeout(timer), v.removeEventListener("seeked", done), ok());
    const timer = setTimeout(done, 3000);
    v.addEventListener("seeked", done);
    v.currentTime = to;
  });
}

/** What the layers are drawn from: each image element's picture, each AI layer's clip or picture. */
async function sourcesOf(layers) {
  const map = new Map();
  for (const l of layers) {
    const e = elementOf(l.el);
    if (e?.kind === "image") map.set(l.id, await loadImage(e.src));
    else if (e?.kind === "ai" && l.media?.url) map.set(l.id, await loadMedia(l.media));
  }
  return map;
}

const toBlob = (canvas, type, quality) => new Promise((ok) => canvas.toBlob(ok, type, quality));

/**
 * Bakes the layers. `job`: { base: media, baseFrom, matte: media|null, matteFrom, layers, edge, finish, width, height, fps, range: { in,
 * out }, name }. Answers the media made (a picture in photos, a clip in videos); `progress(p)` is told how far it is (0 to 1).
 */
export async function bake(job, progress = () => {}) {
  const layers = job.layers.filter((l) => l.eye !== false);
  const base = await loadMedia(job.base);
  const matte = job.matte ? await loadMedia(job.matte) : null;
  const sources = await sourcesOf(layers);
  const w = Math.max(2, Math.round(job.width / 2) * 2);
  const h = Math.max(2, Math.round(job.height / 2) * 2);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d");
  const ctx = (frame, still) => ({ base, matte, matteFrom: job.matteFrom, layers, frame, fps: job.fps, still, sourceOf: (l) => sources.get(l.id) ?? null, edge: job.edge, finish: job.finish, footageWidth: job.width });
  if (job.base.kind === "image") {
    render(g, w, h, ctx(1001, true));
    progress(0.8);
    // (a JPEG, as a clip's frames are: the bake is always the whole frame over the plate, never clear, and a picture of 1536 x 1024 is
    // some 400 KB that way against 3 MB as a PNG)
    const blob = await toBlob(canvas, "image/jpeg", 0.93);
    const pic = await api.upload(blob, job.name ?? "Spice FX");
    progress(1);
    return { kind: "image", url: pic.url, file: pic.file, width: pic.width ?? w, height: pic.height ?? h };
  }
  const frames = job.range.out - job.range.in + 1;
  const started = await (await fetch("api/spice/bake", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fps: job.fps, frames, audio: job.base.file, audioFrom: Math.max(0, (job.range.in - job.baseFrom) / job.fps) }) })).json();
  if (!started.id) throw new Error(started.error ?? "The bake could not start.");
  const clips = [[base, job.baseFrom], [matte, job.matteFrom], ...layers.filter((l) => l.el === "ai").map((l) => [sources.get(l.id), l.from ?? 1001])].filter(([v]) => v?.tagName === "VIDEO");
  let sending = Promise.resolve();
  for (let i = 0; i < frames; i++) {
    const frame = job.range.in + i;
    await Promise.all(clips.map(([v, from]) => seekTo(v, (frame - from) / job.fps)));
    render(g, w, h, ctx(frame, false));
    const blob = await toBlob(canvas, "image/jpeg", 0.93);
    // a frame goes while the next is drawn
    await sending;
    sending = fetch(`api/spice/bake/${started.id}/${i}`, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: blob }).then((r) => {
      if (!r.ok) throw new Error("A frame could not be sent.");
    });
    progress((0.9 * (i + 1)) / frames);
  }
  await sending;
  const res = await fetch(`api/spice/bake/${started.id}/done`, { method: "POST" });
  const made = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(made.error ?? "The clip could not be made.");
  progress(1);
  return made;
}
