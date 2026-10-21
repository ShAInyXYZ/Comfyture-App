// The track's stems: the lanes of the song taken apart (vocals, drums, bass, the rest), each with its own waveform and a mute
// and a solo key, played together from one moment. Comfy's separation gives four stems for the part it was asked to hear; a
// jam heard before that has only the vocals, and then the lanes are the vocals and the mix, said as such. The lanes are
// drawn again with the page: what plays, what is muted and where it is lives here, not in the elements.
import { h } from "../dom.js";
import { jicon } from "./jam-ui.js";
import { analyse, drawBars } from "./jam-track-audio.js";
import { keep } from "./jam-ui.js";

export const LANES = [
  { id: "vocals", name: "Vocals", icon: "mic", color: "#8A76E8" },
  { id: "drums", name: "Drums", icon: "drum", color: "#F2FF59" },
  { id: "bass", name: "Bass", icon: "bass", color: "#8A76E8" },
  { id: "other", name: "Other", icon: "wave", color: "#A8A5B5" },
];
const MIX = { id: "mix", name: "The mix", icon: "wave", color: "#A8A5B5" };

const mixer = { muted: new Set(), solo: new Set() };
const player = { key: "", audios: new Map(), playing: false, raf: 0, last: 0 };

/** The lanes a jam has: its four stems; its vocals and its mix when only the vocals were kept; none when nothing was heard. */
export function stemsOf(b) {
  if (!b?.part) return { lanes: [], full: false, partial: false };
  const s = b.stems;
  // (more than the vocals: Comfy's separation gave all four; the vocals alone is what an older hearing kept)
  if (s && LANES.filter((l) => s[l.id]).length > 1) return { lanes: LANES.filter((l) => s[l.id]).map((l) => ({ ...l, url: s[l.id].url })), full: true, partial: false };
  if (b.vocals) return { lanes: [{ ...LANES[0], url: b.vocals.url }, { ...MIX, url: b.part.url }], full: false, partial: true };
  return { lanes: [], full: false, partial: false };
}

const audible = (id) => (mixer.solo.size ? mixer.solo.has(id) : !mixer.muted.has(id));
function applyMix() {
  for (const [id, a] of player.audios) a.muted = !audible(id);
}
const master = () => player.audios.values().next().value ?? null;
/** Where the stems are, in seconds from the start of the part. */
export const stemsAt = () => master()?.currentTime ?? 0;
export const stemsPlaying = () => player.playing;

function ensure(lanes) {
  const key = lanes.map((l) => l.url).join("|");
  if (key === player.key) return;
  stopStems(true);
  player.key = key;
  player.audios = new Map(lanes.map((l) => [l.id, Object.assign(new Audio(l.url), { preload: "auto" })]));
  const lead = master();
  if (lead) {
    lead.addEventListener("ended", () => stopStems());
    lead.addEventListener("pause", () => !lead.ended && player.playing && stopStems());
  }
  applyMix();
}

/** The lanes play from a moment (or pause): all together, the first one the others are kept in step with. */
export function toggleStems(lanes, from = null) {
  ensure(lanes);
  if (player.playing) return stopStems();
  const at = from ?? (master()?.ended ? 0 : stemsAt());
  document.dispatchEvent(new Event("stems:play"));
  for (const a of player.audios.values()) a.currentTime = at;
  applyMix();
  Promise.all([...player.audios.values()].map((a) => a.play())).catch(() => stopStems());
  player.playing = true;
  document.querySelector(".jam")?.classList.add("is-playing");
  tick();
}
export function stopStems(quiet = false) {
  cancelAnimationFrame(player.raf);
  for (const a of player.audios.values()) a.pause();
  const was = player.playing;
  player.playing = false;
  if (was && !quiet) document.querySelector(".jam")?.classList.remove("is-playing");
  draw();
}
/** The lanes jump to a moment (a click on one). */
export function seekStems(lanes, t) {
  ensure(lanes);
  for (const a of player.audios.values()) a.currentTime = t;
  draw();
}
function tick() {
  cancelAnimationFrame(player.raf);
  if (!player.playing) return;
  draw();
  // the others kept with the first: a stem that has drifted a few hundredths is put back
  const lead = master();
  const now = performance.now();
  if (lead && now - player.last > 500) {
    player.last = now;
    for (const a of player.audios.values()) if (a !== lead && Math.abs(a.currentTime - lead.currentTime) > 0.06) a.currentTime = lead.currentTime;
  }
  player.raf = requestAnimationFrame(tick);
}
function draw() {
  const t = stemsAt();
  for (const el of document.querySelectorAll(".jt-sph")) {
    const total = Number(el.dataset.total) || 1;
    el.style.left = `${Math.min(100, (t / total) * 100)}%`;
  }
  for (const el of document.querySelectorAll(".jt-stems-play")) el.dataset.playing = String(player.playing);
}

/** One lane's waveform, drawn when it is first on screen and again when it is resized (kept between redraws of the page). */
function laneWave(lane) {
  return keep(`stem:${lane.url}`, () => {
    const canvas = h("canvas.jt-lane-wave", { "aria-hidden": "true" });
    let data = null;
    const paint = () => data && drawBars(canvas, data.peaks, { color: lane.color });
    analyse(lane.url).then((a) => {
      data = a;
      paint();
    });
    new ResizeObserver(paint).observe(canvas);
    return canvas;
  });
}

/**
 * The lanes as the card shows them (or the empty ghosts of them): each with its icon and name, its waveform, and S and M keys.
 * `onChange` is told when a key was pressed, so the page draws the keys again.
 */
export function lanesEl({ lanes, seconds, onChange, big = false }) {
  const shown = lanes.length ? lanes : LANES.map((l) => ({ ...l, ghost: true }));
  return h(`div.jt-lanes${big ? ".is-big" : ""}${lanes.length ? "" : ".is-ghost"}`, {},
    ...shown.map((lane) => {
      const on = !lane.ghost && audible(lane.id);
      return h("div.jt-lane", { dataset: { stem: lane.id, off: String(!on) }, style: { "--lane": lane.color } },
        h("span.jt-lane-name", {}, jicon(lane.icon), h("b", {}, lane.name)),
        h("div.jt-lane-track", { title: lane.ghost ? "Not split yet" : "Click to move there", on: lane.ghost ? {} : { pointerdown: (e) => { const r = e.currentTarget.getBoundingClientRect(); seekStems(lanes, ((e.clientX - r.left) / r.width) * seconds); } } },
          lane.ghost ? h("i.jt-lane-flat") : laneWave(lane),
          lane.ghost ? null : h("i.jt-sph", { dataset: { total: String(seconds) }, style: { left: `${Math.min(100, (stemsAt() / seconds) * 100)}%` } })),
        h("button.jt-ms", { type: "button", disabled: !!lane.ghost, "aria-pressed": String(mixer.solo.has(lane.id)), title: "Solo: hear only this", on: { click: () => (mixer.solo.has(lane.id) ? mixer.solo.delete(lane.id) : mixer.solo.add(lane.id), applyMix(), onChange?.()) } }, "S"),
        h("button.jt-ms", { type: "button", disabled: !!lane.ghost, "aria-pressed": String(mixer.muted.has(lane.id)), title: "Mute", on: { click: () => (mixer.muted.has(lane.id) ? mixer.muted.delete(lane.id) : mixer.muted.add(lane.id), applyMix(), onChange?.()) } }, "M"));
    }));
}

/** The key that plays the lanes together. */
export function playKey(lanes) {
  return h("button.jt-stems-play", { type: "button", disabled: !lanes.length, dataset: { playing: String(player.playing) }, title: "Play the stems together", "aria-label": "Play the stems", on: { click: () => toggleStems(lanes) } },
    h("span.is-play", {}, jicon("play")), h("span.is-pause", {}, jicon("pause")));
}

// the song plays elsewhere (the hero, the film): the lanes stop
document.addEventListener("editor:play", () => stopStems());
