// The Utensils "Audio" workspace: a small sound studio. Above, a gallery of nine audio tools as cards with waveform art on the left and the
// workbench of the one picked on the right (its words and settings, the sounds it made as rows that play); below, the mixing strip:
// up to six sounds on a ruler, each with a fader, a mute and a start that is dragged, played as a mix and rendered into one sound.
// The tools are in utensils-audio-tools.js, their controls in utensils-audio-bench.js, the strip in utensils-audio-mix.js. A free tool
// runs on this machine; a cloud one asks for the person's yes to the price first (the yellow key turns into the yes).
// A workspace is { el, update, sig, count }: the shell (panels/utensils.js) puts el in the grid and calls update() when sig() changes.
import { h, icon, sprite } from "./dom.js";
import { changed, toast } from "./store.js";
import { utensils, inputOf, setInput, setQuietly, pickTool, runTool, toolById, recent } from "./utensils.js";
import { AUDIO, audioById, isAudio, registerAudioTools, paramsOf, readyOf, costFor, runCloudTool, cloudTool, templateOf } from "./utensils-audio-tools.js";
import { controlsOf, resultsOf, beatState } from "./utensils-audio-bench.js";
import { createMixStrip, mixSig, mix } from "./utensils-audio-mix.js";
import { runnerReady } from "./utensils-cloud.js";

// the new tools are on the shelf as soon as the page is (the Shelf's grid and Truffle know them before this workspace is open)
registerAudioTools();
try {
  const kept = JSON.parse(localStorage.getItem("comfyture.utensils") ?? "{}");
  if (isAudio(kept.tool) && toolById(kept.tool).id === kept.tool) utensils.tool = kept.tool;
} catch {}

const ui = { armed: null };

/** Waveform art for a card: bars of a deterministic shape, in the tool's colour (the card lit turns them dark). */
function art(t, k) {
  const shapes = [
    (x) => 0.25 + 0.7 * Math.abs(Math.sin(x * 9.2) * Math.sin(x * 2.3 + 0.4)),
    (x) => 0.3 + 0.6 * Math.abs(Math.sin(x * 5.1 + 1)) * (1 - Math.abs(x - 0.5) * 0.9),
    (x) => 0.2 + 0.75 * Math.abs(Math.sin(x * 14) * Math.cos(x * 3)),
    (x) => 0.22 + 0.5 * Math.abs(Math.sin(x * 22)) + 0.2 * Math.sin(x * 4),
    (x) => 0.18 + 0.7 * Math.pow(Math.abs(Math.sin(x * 7.3)), 1.6),
  ];
  const f = shapes[k % shapes.length];
  const n = 28;
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${n * 4} 40`);
  svg.setAttribute("class", "ua-art");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("aria-hidden", "true");
  svg.style.setProperty("--tone", t.tone);
  for (let i = 0; i < n; i++) {
    const v = Math.min(1, Math.max(0.08, f(i / n)));
    const r = document.createElementNS(ns, "rect");
    r.setAttribute("x", String(i * 4 + 0.6));
    r.setAttribute("y", String(20 - v * 18));
    r.setAttribute("width", "2.8");
    r.setAttribute("height", String(v * 36));
    r.setAttribute("rx", "1.4");
    svg.append(r);
  }
  return svg;
}

export function audioSpace() {
  const el = h("div.ut-grid.is-audio");
  const gallery = h("section.ut-bento.ua-gallery");
  const benchBox = h("section.ut-bento.ua-benchbox");
  const stripBox = h("section.ut-bento.ua-stripbox");
  const strip = createMixStrip();
  stripBox.append(h("div.ut-b-head", {}, h("span.ut-b-label", {}, "Mixing strip"), h("span.ut-b-note", {}, "Up to six tracks · free · on this machine")), strip.el);
  let go = null;
  let first = true;
  let seen = "";

  const current = () => (isAudio(utensils.tool) ? audioById(utensils.tool) : audioById("sfx"));
  const set = (id) => (patch, quiet = false) => {
    ui.armed = null;
    quiet ? setQuietly(patch, id) : setInput(patch, id);
  };
  /** A tool of another workspace (the sound for a clip lives in Video too) opens here without leaving the Audio workspace. */
  function pick(id) {
    ui.armed = null;
    if (toolById(id).workspace === "audio") return pickTool(id);
    utensils.tool = id;
    changed("utensils");
  }

  function cards() {
    return AUDIO.map((t, k) => h(`button.ua-card${t.id === current().id ? ".is-on" : ""}`, { type: "button", title: t.hint, "aria-pressed": String(t.id === current().id), dataset: { tool: t.id, way: t.way }, on: { click: () => pick(t.id) } },
      h("span.ua-card-art", {}, art(t, k), h(`span.ua-way.is-${t.way}`, {}, t.tag)),
      h("span.ua-card-name", {}, t.short),
      h("span.ua-card-hint", {}, t.hint)));
  }

  function keys(def, p, i) {
    const ok = readyOf(def.id, i);
    const running = utensils.jobs.some((j) => j.tool === def.id && j.status === "running");
    const cloud = cloudTool(def.id);
    const ready = ok && !running && (!cloud || runnerReady());
    const armed = cloud && ready && ui.armed === def.id;
    const many = def.id === "sfx" ? Math.min(4, Math.max(1, Number(p.variations ?? 4))) : 1;
    const c = costFor(def.id, i, () => changed("utensils"));
    const total = typeof c?.credits === "number" && c.credits > 0 ? Math.round(c.credits * many * 10) / 10 : c?.credits;
    const t = templateOf(def.id);
    const meta = def.way === "local" ? h("span.uv-meta", {}, h("b", {}, "Free"), h("em", {}, def.id === "au-beat" ? "in this page" : "on this machine"))
      : h(`span.uv-meta${armed ? ".is-armed" : ""}`, {}, h("b", {}, typeof total === "number" ? `≈ ${total} cr${many > 1 ? ` · ${many} sounds` : ""}` : c?.label ?? "≈ ? cr"), h("em", {}, armed ? "spend it on Cloud?" : typeof total !== "number" ? "runs on your ComfyUI" : t ? "of GPU time on Cloud" : "on Comfy Cloud"));
    const run = () => {
      if (!cloud) return def.id === "sfx" ? Promise.all(Array.from({ length: many }, () => runTool("sfx"))) : runTool(def.id);
      if (!armed) {
        ui.armed = def.id;
        changed("utensils");
        return setTimeout(() => ui.armed === def.id && ((ui.armed = null), changed("utensils")), 8000);
      }
      ui.armed = null;
      changed("utensils");
      return runCloudTool(def.id).catch((e) => toast(`${def.name}: ${e.message}`, { tone: "crit" }));
    };
    go = h("button.ut-primary.uv-go", { type: "button", disabled: !ready, title: ready ? def.hint : !runnerReady() && cloud ? "The template runner is not on this page yet" : "Give it what it needs first", on: { click: run } }, sprite(def.icon), h("span", {}, running ? "Working" : armed ? "Yes, run it" : many > 1 ? `${def.verb} ×${many}` : def.verb));
    return h("div.uv-keys-row", {}, meta, h("span.spacer"), armed ? h("button.ut-ghost", { type: "button", on: { click: () => ((ui.armed = null), changed("utensils")) } }, icon("close"), "Not now") : null, go);
  }
  /** The yellow key is lit as soon as the words it needs are typed (typing does not draw the screen again). */
  function refreshGo(def) {
    if (!go?.isConnected) return;
    const i = inputOf(def.id);
    go.disabled = !(readyOf(def.id, i) && (!cloudTool(def.id) || runnerReady()) && !utensils.jobs.some((j) => j.tool === def.id && j.status === "running"));
  }

  function draw() {
    const def = current();
    const p = paramsOf(def.id);
    const i = inputOf(def.id);
    const env = { set: set(def.id), say: (patch) => (setQuietly(patch, def.id), refreshGo(def)), go: () => go && !go.disabled && go.click() };
    benchBox.dataset.tool = def.id;
    benchBox.replaceChildren(
      h("div.ut-b-head", {}, h("span.ut-b-label", {}, def.name.toUpperCase()), h("span.ut-b-note", {}, def.way === "local" ? "Free" : "On Comfy Cloud")),
      h("div.ua-controls", {}, ...controlsOf(def.id, p, i, env)),
      ...[h("div.ua-lower", {}, resultsOf(def.id, p, i)), def.id === "au-beat" ? null : keys(def, p, i)].filter(Boolean));
  }

  function update() {
    if (!isAudio(utensils.tool)) utensils.tool = "sfx";
    if (first) {
      first = false;
      el.replaceChildren(gallery, benchBox, stripBox);
    }
    gallery.replaceChildren(
      h("div.ut-b-head", {}, h("span.ut-b-label", {}, "Audio tools"), h("span.ut-b-note", {}, "Nine tools, five of them free")),
      h("div.ua-cards", {}, ...cards()));
    draw();
    const s = mixSig();
    if (s !== seen) {
      seen = s;
      strip.refresh();
    }
  }
  const sig = () => {
    const def = current();
    const i = inputOf(def.id);
    return JSON.stringify([utensils.tool, i, paramsOf(def.id), ui.armed === def.id, recent(4, def.id).map((r) => r.id), runnerReady(), utensils.jobs.filter((j) => j.tool === def.id).map((j) => j.status), mixSig(), utensils.uploading, mix.tracks.length, beatState(i.audio?.url)]);
  };
  return { el, update, sig, count: () => AUDIO.length };
}
