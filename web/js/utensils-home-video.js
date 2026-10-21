// Home's VIDEO: "the cinema". A letterboxed 21:9 stage whose play key plays a short sample loop (a still film frame brought to life:
// a slow push through the rain, made with the app's own overlay effect), a film strip with sprocket holes whose four frames are the four
// tools (extend, lip-sync, add sound, upscale video), each a numbered frame with its time-code, and a 9:16 phone frame with a second
// loop: a real clip the app made (the video cover of a tea brand, an otter and a moonlit shot), muted until its sound key is pressed.
// The sample files are in web/brand/utensils/home (loaded only when they are seen or asked for). A frame opens its tool.
import { h, icon, sprite, eyebrow, line, openKey, openTool, find, whileSeen, calm } from "./utensils-home-ui.js";

const DIR = "brand/utensils/home";
/** The four frames: the tool each is, and where it sits in the sample film (a time-code, as a cut would have it). */
const FRAMES = [
  { id: "extend", img: "vid-f1", from: "00:00", to: "00:05", note: "A clip goes on" },
  { id: "lipsync", img: "vid-f2", from: "00:05", to: "00:12", note: "A photo sings" },
  { id: "sound", img: "vid-f3", from: "00:12", to: "00:20", note: "Sound for the shot" },
  { id: "upscale-video", img: "vid-f4", from: "00:20", to: "00:28", note: "Larger, sharper" },
];
const clock = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function videoSection() {
  // ------------------------------------------------------------ the stage
  const film = h("video.hv-video", { playsinline: true, muted: true, loop: true, preload: "none", poster: `${DIR}/vid-stage.webp`, "aria-label": "A sample loop", tabindex: "-1" });
  film.muted = true;
  const playKey = h("button.hv-play", { type: "button", title: "Play a sample loop", "aria-label": "Play the sample", on: { click: () => toggle() } }, icon("play"));
  const small = h("button.hv-mini", { type: "button", title: "Play or pause", "aria-label": "Play or pause", on: { click: () => toggle() } }, icon("play"));
  const clockEl = h("span.hv-clock", {}, "00:00 / 00:06");
  const fill = h("i", {});
  const track = h("div.hv-track", { role: "slider", tabindex: "0", "aria-label": "Position in the sample", on: { pointerdown: (e) => seek(e), keydown: (e) => { if (e.key === "ArrowRight") film.currentTime = Math.min(film.duration || 6, film.currentTime + 1); if (e.key === "ArrowLeft") film.currentTime = Math.max(0, film.currentTime - 1); } } }, fill);
  const stage = h("div.hv-stage", { title: "A sample loop: nothing here runs a tool." }, film, h("span.hv-ratio", {}, "21:9"), playKey, h("div.hv-bar", {}, small, clockEl, track));
  let loaded = false;
  function toggle() {
    if (!loaded) {
      loaded = true;
      film.src = `${DIR}/vid-stage.mp4`;
    }
    film.paused ? film.play().catch(() => {}) : film.pause();
  }
  function seek(e) {
    const r = track.getBoundingClientRect();
    if (film.duration) film.currentTime = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * film.duration;
  }
  const mark = () => {
    const playing = !film.paused;
    stage.classList.toggle("is-playing", playing);
    playKey.replaceChildren(icon(playing ? "pause" : "play"));
    small.replaceChildren(icon(playing ? "pause" : "play"));
  };
  film.addEventListener("play", mark);
  film.addEventListener("pause", mark);
  film.addEventListener("timeupdate", () => {
    const d = film.duration || 6;
    fill.style.width = `${(film.currentTime / d) * 100}%`;
    clockEl.textContent = `${clock(film.currentTime)} / ${clock(d)}`;
  });
  film.addEventListener("loadedmetadata", () => (clockEl.textContent = `00:00 / ${clock(film.duration || 6)}`));
  // out of sight it stops (a loop that nobody sees does not run)
  whileSeen(stage, () => {}, () => film.pause());

  // ------------------------------------------------------------ the film strip
  const strip = h("div.hv-film", { role: "list", "aria-label": "Video tools" });
  function build() {
    const list = FRAMES.map((f) => ({ ...f, tool: find(f.id) })).filter((f) => f.tool);
    strip.replaceChildren(...list.map((f, i) => h(`button.hv-frame${i === 0 ? ".is-on" : ""}`, {
      type: "button", role: "listitem", dataset: { tool: f.id }, title: `${f.tool.name}: ${f.tool.hint ?? ""}`,
      on: { click: () => openTool(f.tool), pointerenter: () => light(f.id), focus: () => light(f.id) },
    },
    h("img", { src: `${DIR}/${f.img}.webp`, alt: "", draggable: false, loading: "lazy", decoding: "async" }),
    h("span.hv-frame-no", {}, String(i + 1).padStart(2, "0")),
    h("span.hv-frame-code", {}, `${f.from} – ${f.to}`),
    h("span.hv-frame-name", {}, h("b", {}, f.tool.name), h("em", {}, f.note)))));
  }
  function light(id) {
    for (const b of strip.children) b.classList.toggle("is-on", b.dataset.tool === id);
  }

  // ------------------------------------------------------------ the phone
  const loop = h("video.hv-phone-video", { playsinline: true, muted: true, loop: true, preload: "none", poster: `${DIR}/vid-phone.webp`, "aria-label": "A clip made by the app" });
  loop.muted = true;
  const sound = h("button.hv-sound", { type: "button", title: "Sound on or off", "aria-label": "Sound on", "aria-pressed": "false", on: { click: () => {
    loop.muted = !loop.muted;
    sound.setAttribute("aria-pressed", String(!loop.muted));
    sound.replaceChildren(icon(loop.muted ? "mute" : "sound"));
    if (!loop.muted) loop.play().catch(() => {});
  } } }, icon("mute"));
  const phone = h("div.hv-phone", { title: "A real clip the app made: a video cover for a tea brand" }, h("div.hv-phone-screen", {}, loop, h("span.hv-ratio", {}, "9:16"), sound), h("span.hv-notch", {}));
  whileSeen(phone, () => {
    if (calm()) return;
    if (!loop.src) loop.src = `${DIR}/vid-phone.mp4`;
    loop.play().catch(() => {});
  }, () => loop.pause());

  const el = h("section.hv", { "aria-label": "Video", dataset: { section: "video" } },
    h("div.hv-side", {}, eyebrow("Utensils · 02"), h("h2.hv-title", {}, "Video"), line("Make a clip longer, louder, sharper, or let a photo sing."), openKey("Open Video", "video")),
    h("div.hv-main", {}, stage, strip),
    phone);

  function update() {
    build();
  }
  const sig = () => JSON.stringify(FRAMES.map((f) => { const t = find(f.id); return t ? [t.id, t.name] : null; }));
  return { el, update, sig };
}
