// The live demo is the same app as static files: reads come from a snapshot, and
// anything that would render answers that rendering is off there.
export const STATIC = document.documentElement.hasAttribute("data-static");
const SNAPSHOT = { "api/info": "api/info.json", "api/presets": "api/presets.json", "api/samples": "api/samples.json", "api/runs": "api/runs.json", "api/reels": "api/reels.json", "api/photos": "api/photos.json" };

async function request(path, init) {
  if (STATIC) {
    if (init?.method && init.method !== "GET") throw new Error("This is the live demo, so rendering is off. Run Comfyture yourself to roll takes: see the README.");
    path = SNAPSHOT[path] ?? path;
  }
  const res = await fetch(path, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body;
}

const post = (path, body) =>
  request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });

/** Where a take's workflow downloads from. */
export const workflowUrl = (id) => (STATIC ? `media/runs/${id}/shot.workflow.json` : `api/runs/${id}/workflow`);

export const api = {
  info: () => request("api/info"),
  account: (refresh) => request(`api/account${refresh ? "?refresh=1" : ""}`),
  saveAccountKey: (key) => post("api/account/key", { key }),
  clearAccountKey: () => request("api/account/key", { method: "DELETE" }),
  setTarget: (kind, url) => post("api/account/target", { kind, url }),
  testTarget: (url) => post("api/account/target/test", { url }),
  resetTarget: () => request("api/account/target", { method: "DELETE" }),
  presets: () => request("api/presets"),
  savePreset: (body) => post("api/presets", body),
  samples: () => request("api/samples"),
  runs: () => request("api/runs"),
  upload: (blob, name) => request(`api/photos${name ? `?name=${encodeURIComponent(name)}` : ""}`, { method: "POST", headers: { "Content-Type": blob.type }, body: blob }),
  sample: (name) => (STATIC ? Promise.resolve({ file: name, url: `samples/${name}`, width: 1536, height: 1024 }) : post(`api/photos?sample=${encodeURIComponent(name)}`)),
  songs: () => request("api/audio"),
  makeSong: (body) => post("api/audio/song", body),
  writeSong: (body) => post("api/audio/song/write", body),
  setCover: (body) => post("api/audio/cover", body),
  slicePart: (body) => post("api/jam/slice", body),
  uploadAudio: (file) => request("api/audio", { method: "POST", headers: { "Content-Type": file.type || "audio/mpeg" }, body: file }),
  paint: (body) => post("api/paint", body),
  generate: (body) => post("api/generate", body),
  imageModels: () => request("api/image/models"),
  videoModels: () => request("api/video/models"),
  videoLoras: () => request("api/video/loras"),
  image: (body) => post("api/image", body),
  enhanceImage: (body) => post("api/image/enhance", body),
  director: (body) => post("api/director", body),
  assistant: (body) => post("api/assistant", body),
  videoFrom: (source) => post("api/videos/from", source),
  uploadVideo: (file) => request("api/videos", { method: "POST", headers: { "Content-Type": file.type || "video/mp4" }, body: file }),
  cutout: (body) => post("api/cutout", body),
  shoot: (body) => post("api/shots", body),
  reel: (body) => post("api/reels", body),
  photos: () => request("api/photos"),
  films: () => request("api/reels"),
  removeFilm: (id) => request(`api/reels/${id}`, { method: "DELETE" }),
  resound: (id, sound) => post(`api/runs/${id}/sound`, { sound }),
  share: (id, png) => request(`api/runs/${id}/share`, { method: "POST", headers: { "Content-Type": "image/png" }, body: png }),
  approve: (id) => post(`api/runs/${id}/approve`),
  reframe: (id, instruction) => post(`api/runs/${id}/reframe`, { instruction }),
  cancel: (id) => post(`api/runs/${id}/cancel`),
  remove: (id) => request(`api/runs/${id}`, { method: "DELETE" }),
};

/** Live updates. Re-syncs the take list after a reconnect. */
export function subscribe(handlers) {
  let connected = false;
  if (STATIC) return;
  const source = new EventSource("api/events");
  source.addEventListener("hello", () => {
    if (connected) handlers.resync();
    connected = true;
  });
  for (const name of ["run", "preview", "paint"]) {
    source.addEventListener(name, (e) => handlers[name](JSON.parse(e.data)));
  }
  source.addEventListener("removed", (e) => handlers.removed(JSON.parse(e.data).id));
  return () => source.close();
}
