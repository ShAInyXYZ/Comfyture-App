// The parts the Picture and Video workspaces are made of, and any workspace may borrow: the before/after comparison, the
// waveform, the input wells, the settings controls, the strip of a medium's tools and the workbench of one tool (its stage,
// its words, its history of results, its settings, the tools a result can be handed on to, the yellow run key).
// A workspace made of them is mediaSpace(workspace): the picture and video modules are one line each.
import { h, icon, sprite, ago } from "./dom.js";
import { changed, toast, artist, setArtist, artists } from "./store.js";
import { dropdown } from "./controls.js";
import { artistItems } from "./writer-menu.js";
import { view } from "./viewer.js";
import { placePhoto, openTake } from "./store.js";
import { utensils, toolById, toolsOf, inputOf, pickTool, setInput, setQuietly, clearInput, pickInput, runTool, ready, estimate, show, forget, handOn, takersOf, recent } from "./utensils.js";

export const NOUN = { image: "a picture", video: "a video", audio: "a voice track" };
export const time = (s) => `${Math.floor((s ?? 0) / 60)}:${String(Math.floor((s ?? 0) % 60)).padStart(2, "0")}`;

// the media on screen stay the same elements from one redraw to the next (a video that plays, a sound being heard)
const kept = new Map();
export const keep = (key, make) => kept.get(key) ?? (kept.set(key, make()), kept.get(key));
// where each comparison's divider was left
const splits = new Map();

/** A before/after picture with a divider that is dragged: the two pictures, and an optional clear (transparent) after. */
export function compare(before, after, clear) {
  const frame = h("div.ut-compare", { style: { "--split": splits.get(after.url) ?? "50%" } },
    h("img.ut-before", { src: before.url, alt: "", draggable: false }),
    h(`img.ut-after${clear ? ".is-clear" : ""}`, { src: after.url, alt: "", draggable: false }),
    h("span.ut-chip.is-left", {}, h("b", {}, "Before"), before.width ? `${before.width} × ${before.height}` : ""),
    h("span.ut-chip.is-right", {}, h("b", {}, "After"), after.width ? `${after.width} × ${after.height}` : ""),
    h("span.ut-split", {}, h("i", {}, icon("chevron"), icon("chevron"))));
  const move = (e) => {
    const r = frame.getBoundingClientRect();
    const at = `${Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100))}%`;
    frame.style.setProperty("--split", at);
    splits.set(after.url, at);
  };
  frame.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button, a")) return;
    move(e);
    frame.setPointerCapture(e.pointerId);
    frame.addEventListener("pointermove", move);
    frame.addEventListener("pointerup", () => frame.removeEventListener("pointermove", move), { once: true });
  });
  return frame;
}

/** A sound as a waveform that plays and is clicked to seek. */
export function waveform(url) {
  return keep(`wave:${url}`, () => {
    const canvas = h("canvas.ut-wave", { width: 1200, height: 240 });
    const audio = h("audio", { src: url, preload: "auto" });
    const play = h("button.ut-wave-play", { type: "button", title: "Play or pause", on: { click: () => (audio.paused ? audio.play() : audio.pause()) } }, icon("play"));
    const draw = (peaks) => {
      const g = canvas.getContext("2d");
      const at = audio.duration ? audio.currentTime / audio.duration : 0;
      g.clearRect(0, 0, canvas.width, canvas.height);
      const n = peaks.length;
      const w = canvas.width / n;
      peaks.forEach((p, i) => {
        g.fillStyle = i / n < at ? "#F2FF59" : "rgba(240, 239, 237, .38)";
        const hgt = Math.max(4, p * canvas.height * 0.9);
        g.fillRect(i * w + 1, (canvas.height - hgt) / 2, Math.max(1, w - 3), hgt);
      });
    };
    let peaks = Array(120).fill(0.05);
    draw(peaks);
    fetch(url).then((r) => r.arrayBuffer()).then((b) => new AudioContext().decodeAudioData(b)).then((buf) => {
      const d = buf.getChannelData(0);
      const step = Math.floor(d.length / 120);
      peaks = Array.from({ length: 120 }, (_, i) => {
        let m = 0;
        for (let k = i * step; k < (i + 1) * step; k += 32) m = Math.max(m, Math.abs(d[k]));
        return m;
      });
      draw(peaks);
    }).catch(() => {});
    audio.addEventListener("timeupdate", () => draw(peaks));
    audio.addEventListener("play", () => play.replaceChildren(icon("pause")));
    audio.addEventListener("pause", () => play.replaceChildren(icon("play")));
    canvas.addEventListener("pointerdown", (e) => {
      const r = canvas.getBoundingClientRect();
      if (audio.duration) audio.currentTime = ((e.clientX - r.left) / r.width) * audio.duration;
      draw(peaks);
    });
    return h("div.ut-sound", {}, play, canvas, audio);
  });
}

// ---------------------------------------------------------------- the controls

export const seg = (options, value, onPick, title) => h("div.ut-segs", { role: "group", title }, ...options.map(([v, label]) => h("button.ut-seg", { type: "button", "aria-pressed": String(value === v), on: { click: () => onPick(v) } }, label)));
export const stepper = (value, min, max, step, unit, onSet, title) => h("div.ut-stepper", { title },
  h("button", { type: "button", "aria-label": "Less", disabled: value <= min, on: { click: () => onSet(Math.max(min, value - step)) } }, "−"),
  h("span", {}, `${value}${unit}`),
  h("button", { type: "button", "aria-label": "More", disabled: value >= max, on: { click: () => onSet(Math.min(max, value + step)) } }, "+"));
/** A small labelled control of the settings column: a mono label over the control. */
export const control = (label, ...body) => h("div.ut-control", {}, h("span.ut-label", {}, label), ...body);

/** The picture model that draws an edit or a variation (the app's artist picker). */
export function lookPicker() {
  const items = artistItems().filter((it) => artists().find((x) => x.id === it.value)?.templates.some((x) => x.id === "edit"));
  const value = items.some((it) => it.value === artist()) ? artist() : items[0]?.value;
  if (!value) return null;
  return dropdown({ label: "Model", value, items, onChange: (id) => (setArtist(id), changed("utensils")), width: "fit", note: "The picture model that draws it" });
}

/** The run key, lit as soon as the words it needs are typed (typing does not draw the screen again). */
export function refreshGo(from, t) {
  const go = from.closest(".ut-bench")?.querySelector(".ut-go");
  if (go) go.disabled = !ready(t, inputOf(t.id));
}

/** What the tool works on: a small well per input, each with its own picker. */
export function inputWells(t, i) {
  return t.takes.map((k) => {
    const v = i[k];
    const label = v ? (k === "audio" ? v.name ?? "Voice track" : k === "video" ? `Video · ${time(v.duration)}` : `${v.width} × ${v.height}`) : `Add ${NOUN[k]}`;
    return h("div.ut-well", {},
      h("button.ut-well-pic", { type: "button", title: v ? "Replace it" : `Add ${NOUN[k]}`, on: { click: (e) => pickInput(k, e.currentTarget) } },
        v && k === "image" ? h("img", { src: v.url, alt: "", draggable: false }) : v && k === "video" ? h("video", { src: v.url, muted: true, preload: "metadata" }) : icon(k === "audio" ? "sound" : k === "video" ? "film" : "image")),
      h("span.ut-well-text", {}, h("b", {}, label), h("em", {}, v ? "click to replace" : "or drop or paste it")),
      v ? h("button.ut-iconkey.is-quiet", { type: "button", title: "Take it out", "aria-label": "Take it out", on: { click: () => clearInput(k) } }, icon("close")) : null);
  });
}

// ---------------------------------------------------------------- the strip of a medium's tools

/** A card per tool: its icon, its name, what it does; the one open is lit. */
export function toolStrip(workspace) {
  const list = toolsOf(workspace);
  return h("div.ut-cards", {}, ...list.map((t) =>
    h(`button.ut-card${t.id === utensils.tool ? ".is-on" : ""}`, { type: "button", title: t.hint, "aria-pressed": String(t.id === utensils.tool), dataset: { tool: t.id }, on: { click: () => pickTool(t.id) } },
      h("span.ut-card-icon", {}, sprite(t.icon)),
      h("b", {}, t.name),
      h("span", {}, t.hint))));
}

// ---------------------------------------------------------------- the workbench of one tool

const PLACEHOLDER = {
  variations: "What to vary (optional): the light, the pose, the season",
  edit: "What to change: make it night, add a red scarf",
  extend: "What happens next (optional)",
  lipsync: "How they say it (optional): calm, laughing, close to the camera",
  sound: "The sound it needs: rain on the glass, a distant dog",
  music: "The track: warm acoustic folk, slow, brushed drums",
  sfx: "The sound: a glass jar lid popping open",
};

/** What the tool shows on its stage: its latest result (or the one picked), else what it was given, else a place to drop. */
function stage(t, i) {
  const results = utensils.results.filter((r) => r.tool === t.id);
  const shown = results.find((r) => r.id === utensils.shown) ?? results.find((r) => (t.takes.includes("image") ? r.from === i.image?.url : true));
  const busy = utensils.jobs.some((j) => j.tool === t.id && j.status === "running");
  let body;
  if (shown?.kind === "image" && shown.from && t.takes.includes("image")) body = compare({ url: shown.from, width: i.image?.url === shown.from ? i.image.width : undefined, height: i.image?.height }, shown, shown.clear);
  else if (shown?.kind === "image") body = h("img.ut-still", { src: shown.url, alt: "", draggable: false });
  else if (shown?.kind === "video") body = keep(`video:${shown.url}`, () => h("video.ut-video", { src: shown.url, controls: true, loop: true, playsInline: true, preload: "metadata" }));
  else if (shown?.kind === "audio") body = waveform(shown.url);
  else if (i.image && t.takes.includes("image")) body = h("img.ut-still", { src: i.image.url, alt: "", draggable: false });
  else if (i.video && t.takes.includes("video")) body = keep(`video:${i.video.url}`, () => h("video.ut-video", { src: i.video.url, controls: true, loop: true, playsInline: true, preload: "metadata" }));
  else body = h("button.ut-drop", { type: "button", disabled: !t.takes.length, on: { click: (e) => t.takes[0] && pickInput(t.takes[0], e.currentTarget) } },
    sprite(t.icon), h("b", {}, t.takes.length ? `Drop ${t.takes.map((k) => NOUN[k]).join(" and ")}` : t.name), h("span", {}, t.takes.length ? "or paste it, or click to pick" : "Say what you want below"));
  const keys = shown ? h("div.ut-stage-keys", {},
    shown.kind === "image" ? h("button.ut-iconkey.is-over", { type: "button", title: "See it full size\nZoom and pan", "aria-label": "See it full size", on: { click: () => view(shown.url) } }, icon("expand")) : null,
    h("a.ut-iconkey.is-over", { href: `${shown.url}?download=${t.id}-${shown.id}`, download: `${t.id}-${shown.id}`, title: "Download", "aria-label": "Download" }, icon("download")),
    shown.kind === "image" || shown.run ? h("button.ut-iconkey.is-over", { type: "button", title: shown.run ? "Open the take in Kitchen's Shot" : "Start a shot from it in Kitchen", "aria-label": "Open in Kitchen", on: { click: () => (shown.run ? openTake(shown.run) : placePhoto("start", shown)) } }, sprite("product-kitchen")) : null) : null;
  return { el: h("div.ut-stage", {}, body, keys, busy ? h("div.ut-busy", {}, h("span.ut-busy-row", {}, h("span.lamp", { dataset: { tone: "busy" } }), "Working"), h("i")) : null), shown };
}

/** The history of the tool's results: small thumbnails, the one on the stage lit. */
function history(t, shown) {
  const list = recent(14, t.id);
  if (!list.length) return h("p.ut-hint.ut-history-empty", {}, "What it makes stays here, newest first.");
  return h("div.ut-history", { dataset: { scrollKey: `ut-history:${t.id}` } }, h("span.ut-label", {}, "History"), ...list.map((r) => {
    const pic = r.kind === "image" ? h(`img${r.clear ? ".is-clear" : ""}`, { src: r.url, alt: "", draggable: false, loading: "lazy" })
      : r.kind === "video" ? h("video", { src: r.url, muted: true, preload: "metadata", playsInline: true }) : h("span.ut-history-audio", {}, icon("sound"));
    return h(`div.ut-hist${r.id === shown?.id ? ".is-on" : ""}`, {},
      h("button.ut-hist-pic", { type: "button", title: `${r.note ?? t.name} · ${ago(r.at)}`, on: { click: () => show(r.id) } }, pic),
      h("button.ut-hist-x", { type: "button", title: "Take it off the list\nThe file stays in the Library", "aria-label": "Take it off the list", on: { click: () => forget(r.id) } }, icon("close")));
  }));
}

function settings(t, i) {
  const rows = [];
  if (t.id === "upscale") rows.push(control("How much larger", seg([[2, "2×"], [4, "4×"]], i.scale ?? 4, (v) => setInput({ scale: v }), "How much larger"), h("span.ut-readout", { title: "The upscaler: sharp detail, no new content" }, "4x-UltraSharp")));
  if (t.id === "upscale-video") rows.push(control("The short side", seg([[720, "720p"], [1080, "1080p"], [1440, "1440p"]], i.height ?? 1080, (v) => setInput({ height: v }), "The short side, in pixels"), h("span.ut-readout", {}, "SeedVR2")));
  if (t.id === "variations" || t.id === "edit") {
    const pick = lookPicker();
    if (pick) rows.push(control("Model", pick));
  }
  if (t.id === "sound") rows.push(control("Kind of sound", seg([[false, "Any sound"], [true, "Foley"]], i.real === true, (v) => setInput({ real: v }), "Foley: only real sounds (steps, objects, the room), never music")));
  if (t.id === "extend") rows.push(control("Longer by", stepper(i.seconds ?? 5, 2, 10, 1, " s", (v) => setInput({ seconds: v }), "How much longer")));
  if (t.id === "music") rows.push(control("Length", stepper(i.seconds ?? 30, 10, 240, 10, " s", (v) => setInput({ seconds: v }), "How long")), control("Tempo", stepper(i.bpm ?? 100, 60, 180, 4, " bpm", (v) => setInput({ bpm: v }), "Tempo")));
  if (t.id === "sfx") rows.push(control("Length", stepper(i.seconds ?? 6, 1, 30, 1, " s", (v) => setInput({ seconds: v }), "How long")));
  return rows;
}

/** The workbench of a tool: stage, words and history on the left, settings, hand-on keys and the run key on the right. */
export function bench(t) {
  const i = inputOf(t.id);
  const { el: stageEl, shown } = stage(t, i);
  const words = t.words ? h(`${t.id === "music" ? "textarea" : "input"}.ut-words`, {
    rows: t.id === "music" ? 1 : undefined,
    value: i.prompt ?? "",
    placeholder: PLACEHOLDER[t.id] ?? "Say what you want",
    "aria-label": "Words",
    dataset: { focus: `words:${t.id}` },
    on: { input: (e) => (setQuietly({ prompt: e.target.value }), refreshGo(e.target, t)), keydown: (e) => e.key === "Enter" && !e.shiftKey && t.id !== "music" && (e.preventDefault(), runTool()) },
  }) : null;
  const lyrics = t.id === "music" ? h("textarea.ut-words", { rows: 3, value: i.lyrics ?? "", placeholder: "Lyrics (optional): leave empty for an instrumental", "aria-label": "Lyrics", dataset: { focus: "lyrics" }, on: { input: (e) => setQuietly({ lyrics: e.target.value }) } }) : null;
  const cost = estimate(t, i);
  const go = h("button.ut-primary.ut-go", { type: "button", disabled: !ready(t, i), title: ready(t, i) ? t.hint : t.takes.some((k) => !i[k]) ? "Give it what it works on first" : "Say what you want first", on: { click: () => runTool() } },
    sprite(t.icon), h("span", {}, t.verb), cost ? h("em.ut-cost", {}, `≈ ${cost} cr`) : h("em.ut-cost", {}, "your GPU"));
  const takers = shown ? takersOf(shown).filter((x) => x.id !== t.id).slice(0, 8) : [];
  return h("section.ut-bench", { dataset: { tool: t.id } },
    h("div.ut-bench-main", {}, stageEl, words ? h("div.ut-words-row", {}, words) : null, lyrics, history(t, shown)),
    h("div.ut-bench-side", {},
      h("div.ut-bench-title", {}, h("h2", {}, t.name), h("p", {}, t.hint)),
      t.takes.length ? h("div.ut-control", {}, h("span.ut-label", {}, "Works on"), ...inputWells(t, i)) : null,
      ...settings(t, i),
      takers.length ? h("div.ut-control", {}, h("span.ut-label", {}, "Use it in"), h("div.ut-hands", {}, ...takers.map((x) => h("button.ut-iconkey", { type: "button", title: `Give it to ${x.name}`, "aria-label": `Give it to ${x.name}`, on: { click: () => handOn(shown, x.id) } }, sprite(x.icon))))) : null,
      h("span.spacer"),
      go));
}

/**
 * A workspace of a medium's tools: the strip of its tools above, the workbench of the one open below. The tool open belongs to
 * another workspace until one of this one is picked: the first of this one comes up then.
 */
export function mediaSpace(workspace) {
  const el = h("div.ut-grid.is-media", { dataset: { medium: workspace } });
  const tools = () => toolsOf(workspace);
  function update() {
    if (!tools().length) return;
    if (toolById(utensils.tool).workspace !== workspace) utensils.tool = tools()[0].id;
    const t = toolById(utensils.tool);
    el.replaceChildren(
      h("section.ut-bento.ut-strip", {}, toolStrip(workspace)),
      h("section.ut-bento.ut-benchwrap", {}, bench(t)));
  }
  const sig = () => {
    const t = toolById(toolById(utensils.tool).workspace === workspace ? utensils.tool : tools()[0]?.id);
    const i = inputOf(t.id);
    return JSON.stringify([t.id, i.image?.file, i.video?.file, i.audio?.file, i.scale, i.height, i.seconds, i.bpm, i.real, utensils.shown, utensils.results.filter((r) => r.tool === t.id).map((r) => r.id), utensils.jobs.some((j) => j.tool === t.id && j.status === "running"), artist(), utensils.uploading]);
  };
  return { el, update, sig, count: () => tools().length };
}
