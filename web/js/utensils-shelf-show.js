// What a tool of the Shelf SHOWS: the sample that says what it does, for the preview card a book opens and for the demos under the
// bookcase. One place, so a book and its demo always show the same thing. The material is the one Home was made with: the picture
// pairs (web/brand/utensils/home/pic-*), the effects' pairs (web/brand/utensils/vfx), the film frames and the two sample loops, the
// Edit tools' drawings, the mini apps' own pictures; a sound is drawn as its waveform, in the tool's colour. Every sample says in its
// tooltip that it is a sample: nothing here runs a tool. A tool registered later with no sample of its own shows its icon, large.
import { h, icon, sprite } from "./dom.js";
import { artOf, isVfx } from "./utensils-vfx-tools.js";
import { isAudio } from "./utensils-audio-tools.js";
import { isEdit } from "./utensils-edit-tools.js";
import { art as editArt } from "./utensils-edit-art.js";
import { toneOf } from "./utensils-home-facts.js";
import { apps } from "./utensils-templates-api.js";
import { appPicture } from "./utensils-apps-ui.js";
import { drag, whileSeen, calm } from "./utensils-home-ui.js";
import { WORKSPACES } from "./utensils-harness.js";

const HOME = "brand/utensils/home";
/** The picture tools' pairs (one picture before, the same after). */
const PICTURE = { upscale: "pic-upscale", cutout: "pic-cutout", variations: "pic-variations", edit: "pic-edit" };
/** The video tools' film frames, and the loop each plays (the lip-sync one is a real cover the app made, with its sound). */
const VIDEO = { extend: "vid-f1", lipsync: "vid-f2", sound: "vid-f3", "upscale-video": "vid-f4" };
const LOOPS = { lipsync: { src: `${HOME}/vid-phone.mp4`, poster: `${HOME}/vid-phone.webp`, sound: true } };
const STAGE = { src: `${HOME}/vid-stage.mp4`, poster: `${HOME}/vid-stage.webp`, sound: false };
const SAMPLE = "A sample of what it does: nothing here runs a tool.";

/** A workspace's colour (the cloth of its books), and its name. */
export const colorOf = (ws) => WORKSPACES.find((w) => w.id === ws)?.color ?? "#8a8a92";
export const sectionOf = (ws) => WORKSPACES.find((w) => w.id === ws);

/** The kind of sample a tool has: a before and after, a clip, a sound, an edit, the apps' posters, or only its icon. */
export function kindOf(tool) {
  if (!tool) return "icon";
  if (PICTURE[tool.id] || isVfx(tool.id)) return "pair";
  if (VIDEO[tool.id]) return "clip";
  if (isAudio(tool.id) || tool.id === "au-mix" || tool.workspace === "audio") return "wave";
  if (isEdit(tool.id)) return "edit";
  if (tool.workspace === "templates") return "apps";
  return "icon";
}
/** A tool's before and after (null when it has none). */
export function pairOf(tool) {
  if (PICTURE[tool.id]) return { before: `${HOME}/${PICTURE[tool.id]}-before.webp`, after: `${HOME}/${PICTURE[tool.id]}-after.webp`, checker: tool.id === "cutout" };
  if (isVfx(tool.id)) return { ...artOf(tool.id), checker: tool.id === "vfx-chroma" };
  return null;
}
/** A video tool's still frame and the loop it plays. */
export const clipOf = (tool) => ({ still: `${HOME}/${VIDEO[tool.id] ?? "vid-f1"}.webp`, loop: LOOPS[tool.id] ?? STAGE });
/** The colour of a tool's sound: its own when it has one, else the Audio books' violet. */
export const waveTone = (tool) => (isAudio(tool.id) ? toneOf(tool) : colorOf("audio"));

const img = (src, cls = "") => h(`img${cls}`, { src, alt: "", draggable: false, loading: "lazy", decoding: "async" });

// ---------------------------------------------------------------- the parts a sample is made of

/** A before and after. `slider`: a line that can be dragged (a demo); else a still split down the middle (a preview). */
export function pairView(tool, { slider = false } = {}) {
  const p = pairOf(tool);
  const before = img(p.before);
  const after = img(p.after);
  const handle = h("span.shs-handle", {}, h("i", {}, icon("chevron"), icon("chevron")));
  const el = h(`div.shs-pair${p.checker ? ".is-checker" : ""}${slider ? ".is-slider" : ""}`, { title: SAMPLE },
    h("div.shs-pair-pic.is-before", {}, before), h("div.shs-pair-pic.is-after", {}, after),
    h("span.shs-tag.is-l", {}, "Before"), h("span.shs-tag.is-r", {}, "After"), handle);
  if (slider) {
    el.setAttribute("role", "slider");
    el.tabIndex = 0;
    el.setAttribute("aria-label", `${tool.name}: before and after (drag the line)`);
    drag(el, (v) => el.style.setProperty("--x", `${(v * 100).toFixed(2)}%`), { start: 0.5 });
  } else el.style.setProperty("--x", "50%");
  return el;
}

/** A clip: its still frame with a play mark (a preview), or the loop that plays when asked (a demo, with its film strip under it). */
export function clipView(tool, { playable = false } = {}) {
  const c = clipOf(tool);
  if (!playable) return h("div.shs-clip", { title: SAMPLE }, img(c.still), h("span.shs-play", {}, icon("play")));
  const film = h("video.shs-video", { playsinline: true, muted: true, loop: true, preload: "none", poster: c.loop.poster, "aria-label": "A sample loop" });
  film.muted = true;
  const key = h("button.shs-play.is-key", { type: "button", title: "Play the sample", "aria-label": "Play the sample", on: { click: (e) => (e.stopPropagation(), toggle()) } }, icon("play"));
  const sound = c.loop.sound ? h("button.shs-sound", { type: "button", title: "Sound on", "aria-label": "Sound on or off", on: { click: (e) => { e.stopPropagation(); film.muted = !film.muted; sound.replaceChildren(icon(film.muted ? "mute" : "sound")); if (film.paused) toggle(); } } }, icon("mute")) : null;
  let loaded = false;
  function toggle() {
    if (!loaded) ((loaded = true), (film.src = c.loop.src));
    film.paused ? film.play().catch(() => {}) : film.pause();
  }
  film.addEventListener("play", () => key.replaceChildren(icon("pause")));
  film.addEventListener("pause", () => key.replaceChildren(icon("play")));
  // (it stops when it is out of sight: a demo is not left playing under another workspace)
  whileSeen(film, () => {}, () => film.pause());
  const strip = h("div.shs-strip", { "aria-hidden": "true" }, ...Object.values(VIDEO).map((f) => img(`${HOME}/${f}.webp`)));
  return h("div.shs-clip.is-playable", { title: SAMPLE }, h("div.shs-screen", {}, film, key, sound), strip);
}

/** The bars of a sound (the same ones every time for a tool: a small generator seeded by its id). */
function bars(seed, n) {
  let x = 0;
  for (const ch of seed) x = (x * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = () => ((x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  return Array.from({ length: n }, (_, i) => {
    const t = i / n;
    const swell = 0.3 + 0.5 * Math.sin(t * Math.PI * 2.4 + rnd() * 0.4) ** 2 + 0.18 * Math.sin(t * Math.PI * 11);
    return Math.min(1, Math.max(0.08, swell * (0.5 + rnd() * 0.65)));
  });
}

/**
 * A sound, drawn as its waveform in its colour, with a playhead that moves while it is seen. A drawing of what the tool makes, said
 * so; `sample`: a real sound the app made goes with it (the Music tool's: the chorus of a song made with it), and a key plays it.
 */
export function waveView(tool, { sample = false } = {}) {
  const tone = waveTone(tool);
  const heights = bars(tool.id, 96);
  const canvas = h("canvas.shs-wave-canvas", { "aria-hidden": "true" });
  const real = sample && (tool.id === "music") ? h("audio", { preload: "none", src: `${HOME}/vid-phone.mp4` }) : null;
  const key = real ? h("button.shs-play.is-key", { type: "button", title: "Play a chorus made with Music", "aria-label": "Play the sample", on: { click: (e) => (e.stopPropagation(), real.paused ? real.play().catch(() => {}) : real.pause()) } }, icon("play")) : null;
  if (real) {
    real.addEventListener("play", () => key.replaceChildren(icon("pause")));
    real.addEventListener("pause", () => key.replaceChildren(icon("play")));
  }
  const el = h("div.shs-wave", { style: { "--tone": tone }, title: real ? "The chorus of a song made with Music" : "A drawing of what it makes: no sound plays here." }, canvas, key, real);
  const g = canvas.getContext("2d");
  let t = 0.18;
  let raf = 0;
  function paint() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.max(1, Math.round(r.width * dpr));
    const H = Math.max(1, Math.round(r.height * dpr));
    if (canvas.width !== W || canvas.height !== H) ((canvas.width = W), (canvas.height = H));
    g.clearRect(0, 0, W, H);
    const n = heights.length;
    const step = W / n;
    const at = (real && real.duration ? real.currentTime / real.duration : t) * W;
    for (let i = 0; i < n; i++) {
      const x = i * step;
      const hh = heights[i] * H * 0.86;
      g.globalAlpha = x < at ? 1 : 0.42;
      g.fillStyle = tone;
      g.fillRect(x + step * 0.2, (H - hh) / 2, Math.max(1, step * 0.6), hh);
    }
    g.globalAlpha = 1;
    g.fillStyle = "#F2FF59";
    g.fillRect(Math.round(at), 0, Math.max(2, Math.round(dpr * 1.5)), H);
  }
  const frame = () => {
    if (!real || real.paused) t = (t + 0.0016) % 1;
    paint();
    raf = requestAnimationFrame(frame);
  };
  whileSeen(el, () => (calm() ? paint() : (raf = requestAnimationFrame(frame))), () => (cancelAnimationFrame(raf), real?.pause()));
  return el;
}

/** An Edit tool: its drawing, big. */
export function editView(tool) {
  return h("div.shs-edit", { title: SAMPLE }, editArt(tool.id.replace(/^ed-/, "")));
}

/**
 * An Edit timeline you can trim: a strip of frames with two handles that can be dragged and the range they keep, read in seconds.
 * A drawing of the Trim tool at work (nothing is cut).
 */
export function trimView(tool) {
  const LENGTH = 12;
  const range = { a: 0.22, b: 0.71 };
  const strip = h("div.shs-trim-strip", {}, ...["vid-f1", "vid-f2", "vid-f3", "vid-f4", "vid-f1", "vid-f3"].map((f) => img(`${HOME}/${f}.webp`)));
  const shade = h("div.shs-trim-keep", {});
  const ha = h("span.shs-trim-h.is-a", { role: "slider", tabindex: "0", "aria-label": "Where the clip starts" });
  const hb = h("span.shs-trim-h.is-b", { role: "slider", tabindex: "0", "aria-label": "Where the clip ends" });
  const read = h("span.shs-trim-read", {});
  const sec = (v) => `00:${(v * LENGTH).toFixed(1).padStart(4, "0")}`;
  const put = () => {
    shade.style.left = `${range.a * 100}%`;
    shade.style.right = `${(1 - range.b) * 100}%`;
    ha.style.left = `${range.a * 100}%`;
    hb.style.left = `${range.b * 100}%`;
    read.textContent = `${sec(range.a)} – ${sec(range.b)}`;
  };
  const lane = h("div.shs-trim-lane", { title: "A drawing of Trim: drag the handles. Nothing is cut here." }, strip, shade, ha, hb);
  // a handle follows the pointer anywhere along the lane, and never passes the other one
  for (const [el, side] of [[ha, "a"], [hb, "b"]]) {
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      el.setPointerCapture(e.pointerId);
      const move = (ev) => {
        const r = lane.getBoundingClientRect();
        const v = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
        range[side] = side === "a" ? Math.min(v, range.b - 0.08) : Math.max(v, range.a + 0.08);
        put();
      };
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", () => el.removeEventListener("pointermove", move), { once: true });
    });
    el.addEventListener("keydown", (e) => {
      const d = e.key === "ArrowLeft" ? -0.02 : e.key === "ArrowRight" ? 0.02 : 0;
      if (!d) return;
      e.preventDefault();
      range[side] = side === "a" ? Math.max(0, Math.min(range.a + d, range.b - 0.08)) : Math.min(1, Math.max(range.b + d, range.a + 0.08));
      put();
    });
  }
  put();
  return h("div.shs-trim", {}, lane, h("div.shs-trim-foot", {}, editArt(tool.id.replace(/^ed-/, "")), read));
}

/** The mini apps' own pictures: two or three of them, fanned. */
export function appsView() {
  const list = apps.list.filter((a) => a.thumb).slice(0, 3);
  if (!list.length) return h("div.shs-apps.is-empty", { title: "The mini apps show here once Comfy Cloud is connected." }, sprite("tool-templates"));
  return h("div.shs-apps", { title: SAMPLE }, ...list.map((a, i) => h("span.shs-app", { style: { "--i": String(i) } }, appPicture(a, { after: false }))));
}

/** A tool with no sample of its own: its icon, large, on its colour. */
export const iconView = (tool) => h("div.shs-icon", {}, sprite(tool.icon));

/** The sample a preview card shows (still, small). */
export function previewOf(tool) {
  const kind = kindOf(tool);
  if (kind === "pair") return pairView(tool);
  if (kind === "clip") return clipView(tool);
  if (kind === "wave") return waveView(tool);
  if (kind === "edit") return editView(tool);
  if (kind === "apps") return appsView();
  return iconView(tool);
}
