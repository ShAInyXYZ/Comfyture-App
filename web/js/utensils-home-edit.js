// Home's EDIT: "the workbench". A window of the kind an editor works in: a toolbar of the twelve Edit tools as icon keys (a tool's name
// and what it does are in its tooltip and in the status line under the bar), and a timeline drawn under it, with a ruler, a clip track
// whose clips start with a frame, an audio track with its waveform, and a playhead you can drag, with its time in yellow. It is a
// drawing of the Edit workspace: nothing plays. Everything in it runs free, on this machine, and its chip says so. A tool's key opens it.
import { EDIT_TOOLS } from "./utensils-edit-tools.js";
import { h, sprite, icon, eyebrow, line, openKey, openTool, find, drag } from "./utensils-home-ui.js";

const SHORT = { "Speed and slow-mo": "Speed", "Mute or swap audio": "Audio", "Add a logo": "Logo", "Add captions": "Captions", "Grade colour": "Grade", "Convert format": "Convert", "GIF and thumbnails": "GIF", "Merge clips": "Merge", "Crop and reframe": "Crop" };
const DIR = "brand/utensils/home";
/** The clips of the drawn timeline: how wide each is (of 100), the frame it starts with, and the name it carries. */
const CLIPS = [
  { w: 21, img: "vid-f1", name: "walk-in.mp4", tint: "#6b1f2a" },
  { w: 15, img: "vid-f2", name: "chorus.mp4", tint: "#7a2a1f" },
  { w: 27, img: "vid-f3", name: "duet.mp4", tint: "#5a1f3a" },
  { w: 29, img: "vid-f4", name: "street-wide.mp4", tint: "#1f4552" },
];
const LENGTH = 72; // seconds the drawn timeline runs

/** The waveform of the audio track: the same bars every time. */
function waveBars() {
  let x = 4177;
  const rnd = () => ((x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const n = 190;
  const rects = Array.from({ length: n }, (_, i) => {
    const t = i / n;
    const v = Math.min(1, 0.16 + Math.abs(Math.sin(t * Math.PI * 7.3)) * 0.4 + rnd() * 0.36);
    return `<rect x="${(i * (100 / n)).toFixed(2)}" y="${(50 - v * 46).toFixed(1)}" width="${(100 / n * 0.6).toFixed(2)}" height="${(v * 92).toFixed(1)}"/>`;
  }).join("");
  return `<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" fill="currentColor">${rects}</svg>`;
}
const stamp = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}:${String(Math.floor((s % 1) * 24)).padStart(2, "0")}`;

export function editSection() {
  // ------------------------------------------------------------ the toolbar and its status line
  const bar = h("div.he-bar", { role: "toolbar", "aria-label": "Edit tools" });
  const status = h("p.he-status", { "aria-live": "polite" }, "12 tools. Point at one to see what it does.");
  const say = (t) => (status.textContent = t ? `${t.name}: ${t.hint}` : `${EDIT_TOOLS.length} tools. Point at one to see what it does.`);

  // ------------------------------------------------------------ the timeline
  const ruler = h("div.he-ruler", { "aria-hidden": "true" }, ...Array.from({ length: 10 }, (_, i) => h("span", {}, stamp((i * LENGTH) / 9).slice(0, 5))));
  const clips = h("div.he-clips", {}, ...CLIPS.map((c, i) => h("div.he-clip", { style: { "--w": c.w, "--tint": c.tint }, dataset: { clip: String(i + 1) } },
    h("span.he-clip-pic", {}, ...[8, 36, 64, 92].map((at) => h("img", { src: `${DIR}/${c.img}.webp`, alt: "", draggable: false, loading: "lazy", decoding: "async", style: { "--at": `${at}%` } }))), h("span.he-clip-name", {}, c.name))));
  const wave = h("div.he-wave", {});
  wave.innerHTML = waveBars();
  const clock = h("span.he-clock", {}, stamp(0.34 * LENGTH));
  const head = h("div.he-head", { "aria-hidden": "true" }, clock, h("i", {}));
  const lanes = h("div.he-lanes", { role: "slider", tabindex: "0", "aria-label": "Playhead (a drawing: nothing plays)", "aria-valuemin": "0", "aria-valuemax": String(LENGTH), title: "A drawing of the Edit workspace: drag the playhead, nothing plays." },
    h("div.he-lane.is-video", {}, h("span.he-lane-name", {}, "V1"), clips),
    h("div.he-lane.is-audio", {}, h("span.he-lane-name", {}, "A1"), wave),
    head);
  drag(lanes, (v) => {
    head.style.left = `${(v * 100).toFixed(2)}%`;
    clock.textContent = stamp(v * LENGTH);
    lanes.setAttribute("aria-valuenow", String(Math.round(v * LENGTH)));
  }, { start: 0.34 });

  // a key carries the tool's name in a word or two (Crop and reframe is Crop; the whole name is its tooltip)
  const short = (name) => SHORT[name] ?? name.split(/ and | or /)[0];
  function build() {
    bar.replaceChildren(...EDIT_TOOLS.map((e) => ({ e, t: find(e.id) })).filter((x) => x.t).map(({ t }) => h("button.he-key", {
      type: "button", title: `${t.name}: ${t.hint}`, "aria-label": t.name, dataset: { tool: t.id },
      on: { click: () => openTool(t), pointerenter: () => say(t), pointerleave: () => say(null), focus: () => say(t), blur: () => say(null) },
    }, sprite(t.icon), h("span.he-key-name", {}, short(t.name)))));
  }

  const el = h("section.he", { "aria-label": "Edit", dataset: { section: "edit" } },
    h("header.he-top", {},
      h("div.he-heading", {}, eyebrow("Utensils · 05"), h("h2.he-title", {}, h("i", {}, "["), "Edit", h("i", {}, "]"))),
      line("Cut, crop, grade and caption a clip, then export it."),
      h("span.he-free", { title: "Edit's tools run on this computer: nothing is charged." }, icon("check"), "Free, on your machine"),
      openKey("Open Edit", "edit")),
    h("div.he-bench", {}, bar, status, h("div.he-track", {}, ruler, lanes)));

  function update() {
    build();
  }
  const sig = () => JSON.stringify(EDIT_TOOLS.map((e) => find(e.id)?.icon ?? null));
  return { el, update, sig };
}
