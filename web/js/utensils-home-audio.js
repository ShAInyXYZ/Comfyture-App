// Home's AUDIO: "the console". A very wide waveform ribbon (purple through magenta to yellow) with a ruler and a playhead that moves,
// and under it the sound tools as the channel strips of a mixing desk: each in its own colour, with a level meter that moves, a
// fader, a pan knob and M and S keys. It is a drawing of what the Audio workspace does and makes no sound (its tooltip says so): the
// faders and keys only change how it looks. A strip's name opens its tool; Stems and Master open theirs, in the Audio workspace.
// The ribbon is a canvas that is drawn only while it is on screen.
import { toneOf } from "./utensils-home-facts.js";
import { h, sprite, eyebrow, line, openKey, openTool, find, whileSeen, calm, drag } from "./utensils-home-ui.js";

/** The strips, in the order of the desk: a tool each, and the level its fader sits at. */
const STRIPS = [
  { id: "sfx", fader: 0.3, lvl: 0.78, dur: 1.15 },
  { id: "music", fader: 0.22, lvl: 0.9, dur: 0.9 },
  { id: "au-voice", fader: 0.34, lvl: 0.62, dur: 1.4 },
  { id: "au-stems", fader: 0.4, lvl: 0.7, dur: 1.05 },
  { id: "au-master", fader: 0.18, lvl: 0.95, dur: 0.8 },
];
/** The ribbon's spectrum: where in it each colour is (0..1). */
const STOPS = [[0, "#7a4dff"], [0.34, "#d84be0"], [0.68, "#ff9a3d"], [1, "#F2FF59"]];

/** The bars of the ribbon: the same ones every time (a small generator), swelling and ebbing like a track that builds. */
function bars(n) {
  let x = 20261021;
  const rnd = () => ((x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  return Array.from({ length: n }, (_, i) => {
    const t = i / n;
    const swell = 0.28 + 0.52 * Math.sin(t * Math.PI * 3.2 + 0.6) ** 2 + 0.2 * Math.sin(t * Math.PI * 9);
    const hit = i % 16 === 0 ? 0.22 : 0;
    return Math.min(1, Math.max(0.06, swell * (0.55 + rnd() * 0.6) + hit));
  });
}

export function audioSection() {
  const heights = bars(520);
  const canvas = h("canvas.ha-canvas", { "aria-hidden": "true" });
  const ruler = h("div.ha-ruler", { "aria-hidden": "true" }, ...Array.from({ length: 8 }, (_, i) => h("span", {}, `00:${String(i * 10).padStart(2, "0")}`)));
  const marker = h("span.ha-mark", {}, "00:00");
  const ribbon = h("div.ha-ribbon", { title: "A drawing of the Audio workspace: nothing plays here." }, ruler, h("div.ha-wave", {}, canvas, marker));

  // ------------------------------------------------------------ the ribbon, drawn while it is seen
  const g = canvas.getContext("2d");
  let W = 0;
  let H = 0;
  let raf = 0;
  let t = 0.34;
  function size() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(1, Math.round(r.width * dpr));
    H = Math.max(1, Math.round(r.height * dpr));
    if (canvas.width !== W || canvas.height !== H) ((canvas.width = W), (canvas.height = H));
  }
  function paint() {
    size();
    g.clearRect(0, 0, W, H);
    const grad = g.createLinearGradient(0, 0, W, 0);
    for (const [at, c] of STOPS) grad.addColorStop(at, c);
    const n = heights.length;
    const step = W / n;
    const mid = H / 2;
    const head = t * W;
    // the played part is lit, the rest is the same ribbon, dim
    for (let i = 0; i < n; i++) {
      const x = i * step;
      const hgt = heights[i] * H * 0.92;
      g.globalAlpha = x < head ? 1 : 0.5;
      g.fillStyle = grad;
      g.fillRect(x + step * 0.18, mid - hgt / 2, Math.max(1, step * 0.64), hgt);
    }
    g.globalAlpha = 1;
    g.fillStyle = "#F2FF59";
    g.fillRect(Math.round(head) - 1, 0, Math.max(2, Math.round(W / 700)), H);
    marker.style.left = `${t * 100}%`;
    marker.textContent = `00:${String(Math.floor(t * 70)).padStart(2, "0")}`;
  }
  function frame() {
    t = (t + 0.0011) % 1;
    paint();
    raf = requestAnimationFrame(frame);
  }
  // while it is on screen the ribbon is drawn and the meters of the strips move (a class: the meters are CSS)
  whileSeen(canvas, () => {
    if (calm()) return paint();
    el.classList.add("is-live");
    raf = requestAnimationFrame(frame);
  }, () => {
    el.classList.remove("is-live");
    cancelAnimationFrame(raf);
  });
  new ResizeObserver(() => paint()).observe(canvas);

  // ------------------------------------------------------------ the channel strips
  const desk = h("div.ha-desk", { role: "list", "aria-label": "Sound tools" });
  function strip(s) {
    const tool = find(s.id);
    if (!tool) return null;
    const tone = toneOf(tool);
    const knob = h("i", {});
    const fader = h("div.ha-fader", { role: "slider", tabindex: "0", "aria-label": `${tool.name}: fader (a drawing: it makes no sound)`, "aria-valuemin": "0", "aria-valuemax": "100" }, h("span.ha-slot", {}), knob);
    drag(fader, (v) => {
      knob.style.top = `${(v * 100).toFixed(1)}%`;
      fader.setAttribute("aria-valuenow", String(Math.round((1 - v) * 100)));
    }, { axis: "y", start: s.fader });
    const muted = h("button.ha-mute", { type: "button", "aria-pressed": "false", title: "Mute (a drawing: only the look changes)", on: { click: (e) => e.currentTarget.setAttribute("aria-pressed", String(e.currentTarget.getAttribute("aria-pressed") !== "true")) } }, "M");
    const solo = h("button.ha-solo", { type: "button", "aria-pressed": "false", title: "Solo (a drawing: only the look changes)", on: { click: (e) => e.currentTarget.setAttribute("aria-pressed", String(e.currentTarget.getAttribute("aria-pressed") !== "true")) } }, "S");
    const label = tool.short ?? tool.name;
    return h("div.ha-ch", { role: "listitem", style: { "--tone": tone, "--lvl": String(s.lvl), "--dur": `${s.dur}s`, "--delay": `${-(s.dur * 0.37).toFixed(2)}s` }, dataset: { tool: tool.id } },
      h("button.ha-ch-open", { type: "button", title: `Open ${tool.name}: ${tool.hint ?? ""}`, on: { click: () => openTool(tool) } },
        h("span.ha-ch-icon", {}, sprite(tool.icon)), h("b", {}, label), h("em", {}, tool.hint ?? "")),
      h("div.ha-ch-body", {}, h("span.ha-meter", { "aria-hidden": "true" }, h("b", {})), fader,
        h("span.ha-pan", { "aria-hidden": "true" }, h("i", {}), h("em", {}, "Pan"))),
      h("div.ha-ch-keys", {}, muted, solo));
  }
  function build() {
    desk.replaceChildren(...STRIPS.map(strip).filter(Boolean));
  }

  const el = h("section.ha", { "aria-label": "Audio", dataset: { section: "audio" } },
    h("div.ha-console", {},
      h("div.ha-top", {},
        h("div.ha-side", {}, eyebrow("Utensils · 03"), h("h2.ha-title", {}, "Audio"), line("Make a sound, a track, a voice, then mix up to six tracks."), openKey("Open Audio", "audio")),
        ribbon),
      desk));

  function update() {
    build();
  }
  const sig = () => JSON.stringify(STRIPS.map((s) => { const t = find(s.id); return t ? [t.id, t.icon, t.name] : null; }));
  return { el, update, sig };
}
