// Utensils' screen: the shelf of tools on the left, the tool open in the middle (what it works on,
// its result, its few settings), every result kept on the right.
import { h, icon, sprite, ago } from "../dom.js";
import { state, changed, toast, artist, setArtist, artists, placePhoto, openTake } from "../store.js";
import { currentPage } from "../router.js";
import { dropdown } from "../controls.js";
import { artistItems } from "../writer-menu.js";
import { view } from "../viewer.js";
import { TOOLS, toolById, utensils, inputOf, pickTool, setInput, setQuietly, give, clearInput, runTool, ready, forget, show, useResult, estimate } from "../utensils.js";

const ACCEPT = { image: "image/*", video: "video/*", audio: "audio/*,video/*" };
const NOUN = { image: "a picture", video: "a video", audio: "a voice track" };
const pick = (accept, fn) => {
  const input = h("input", { type: "file", accept, hidden: true, on: { change: () => (input.files[0] && fn(input.files[0]), input.remove()) } });
  document.body.append(input);
  input.click();
};
const time = (s) => `${Math.floor((s ?? 0) / 60)}:${String(Math.floor((s ?? 0) % 60)).padStart(2, "0")}`;

// the media on screen stay the same elements from one redraw to the next (the progress redraws often)
const kept = new Map();
const keep = (key, make) => kept.get(key) ?? (kept.set(key, make()), kept.get(key));

// ---------------------------------------------------------------- the shelf

function shelf() {
  const groups = [...new Set(TOOLS.map((t) => t.group))];
  return h("section.ut-panel.ut-shelf", {},
    h("div.ut-head", {}, h("div", {}, h("span.card-label", {}, "The shelf"), h("p.ut-sub", {}, "One tool, one job"))),
    ...groups.map((g) => h("div.ut-group", {},
      h("span.label", {}, g),
      ...TOOLS.filter((t) => t.group === g).map((t) =>
        h(`button.ut-tool${t.id === utensils.tool ? ".is-on" : ""}`, { type: "button", title: t.hint, "aria-current": t.id === utensils.tool ? "true" : undefined, on: { click: () => pickTool(t.id) } },
          h("span.ut-tool-icon", {}, sprite(t.icon)), h("span", {}, t.name),
          utensils.busy === t.id ? h("span.lamp", { dataset: { tone: "busy" } }) : null)))));
}

// ---------------------------------------------------------------- the tool open

function compare(before, after, clear) {
  const frame = h("div.ut-compare", { style: { "--split": "50%" } },
    h("img.ut-before", { src: before.url, alt: "", draggable: false }),
    h(`img.ut-after${clear ? ".is-clear" : ""}`, { src: after.url, alt: "", draggable: false }),
    h("span.ut-chip.is-left", {}, h("b", {}, "Before"), before.width ? `${before.width} × ${before.height}` : ""),
    h("span.ut-chip.is-right", {}, h("b", {}, "After"), after.width ? `${after.width} × ${after.height}` : ""),
    h("span.ut-split", {}, h("i", {}, icon("chevron"), icon("chevron"))),
    h("div.ut-corner", {}, h("button.key.is-icon", { type: "button", title: "See it full size\nZoom and pan", on: { click: () => view(after.url) } }, icon("expand"))));
  const move = (e) => {
    const r = frame.getBoundingClientRect();
    frame.style.setProperty("--split", `${Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100))}%`);
  };
  frame.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button")) return;
    move(e);
    frame.setPointerCapture(e.pointerId);
    frame.addEventListener("pointermove", move);
    frame.addEventListener("pointerup", () => frame.removeEventListener("pointermove", move), { once: true });
  });
  return frame;
}

function waveform(url) {
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

function workArea(t, i) {
  const shown = utensils.results.find((r) => r.id === utensils.shown && r.tool === t.id) ?? utensils.results.find((r) => r.tool === t.id && (t.takes.includes("image") ? r.from === i.image?.url : true));
  const busy = utensils.busy === t.id;
  let body;
  if (shown?.kind === "image" && shown.from && t.takes.includes("image") && i.image) body = compare(i.image, shown, shown.clear);
  else if (shown?.kind === "image") body = h("img.ut-still", { src: shown.url, alt: "", draggable: false });
  else if (shown?.kind === "video") body = keep(`video:${shown.url}`, () => h("video.ut-video", { src: shown.url, controls: true, loop: true, playsInline: true, preload: "metadata" }));
  else if (shown?.kind === "audio") body = waveform(shown.url);
  else if (i.image && t.takes.includes("image")) body = h("img.ut-still", { src: i.image.url, alt: "", draggable: false });
  else if (i.video && t.takes.includes("video")) body = keep(`video:${i.video.url}`, () => h("video.ut-video", { src: i.video.url, controls: true, loop: true, playsInline: true, preload: "metadata" }));
  else body = h("button.ut-drop", { type: "button", disabled: !t.takes.length, on: { click: () => t.takes[0] && pick(ACCEPT[t.takes[0]], give) } },
    sprite(t.icon), h("b", {}, t.takes.length ? `Drop ${t.takes.map((k) => NOUN[k]).join(" and ")}` : t.name), h("span", {}, t.takes.length ? "or paste it, or click to pick" : "Say what you want below"));
  return h("div.ut-work", {}, body,
    busy ? h("div.ut-busy", {}, h("span.lamp", { dataset: { tone: "busy" } }), h("span", {}, utensils.progress > 0.01 ? `${Math.round(utensils.progress * 100)}%` : "Working"), h("i", { style: { width: `${Math.round(utensils.progress * 100)}%` } })) : null);
}

/** What the tool works on: a small well per input, each with its own picker. */
function inputs(t, i) {
  return t.takes.map((k) => {
    const v = i[k];
    const label = v ? (k === "audio" ? v.name ?? "Voice track" : k === "video" ? `Video · ${time(v.duration)}` : `${v.width} × ${v.height}`) : `Drop ${NOUN[k]}`;
    return h("div.ut-input", {},
      h("button.ut-input-pic", { type: "button", title: v ? "Replace it" : `Add ${NOUN[k]}`, on: { click: () => pick(ACCEPT[k], give) } },
        v && k === "image" ? h("img", { src: v.url, alt: "", draggable: false }) : v && k === "video" ? h("video", { src: v.url, muted: true, preload: "metadata" }) : icon(k === "audio" ? "sound" : k === "video" ? "video" : "image")),
      h("span.ut-input-text", {}, h("b", {}, label), h("em", {}, v ? "click to replace" : "or paste")),
      v ? h("button.key.is-icon.is-quiet", { type: "button", title: "Take it out", on: { click: () => clearInput(k) } }, icon("close")) : h("button.key.is-icon.is-quiet", { type: "button", title: "Pick a file", on: { click: () => pick(ACCEPT[k], give) } }, icon("upload")));
  });
}

const seg = (options, value, onPick, title) => h("div.ut-seg", { role: "group", title }, ...options.map(([v, label]) => h("button", { type: "button", "aria-pressed": String(value === v), on: { click: () => onPick(v) } }, label)));
const stepper = (value, min, max, step, unit, onSet, title) => h("div.ut-stepper", { title },
  h("button", { type: "button", "aria-label": "Less", disabled: value <= min, on: { click: () => onSet(Math.max(min, value - step)) } }, "−"),
  h("span", {}, `${value}${unit}`),
  h("button", { type: "button", "aria-label": "More", disabled: value >= max, on: { click: () => onSet(Math.min(max, value + step)) } }, "+"));

function lookPicker() {
  const items = artistItems().filter((it) => artists().find((x) => x.id === it.value)?.templates.some((x) => x.id === "edit"));
  const value = items.some((it) => it.value === artist()) ? artist() : items[0]?.value;
  if (!value) return null;
  return dropdown({ label: "Model", value, items, onChange: (id) => (setArtist(id), changed("utensils")), width: "fit", note: "The picture model that draws it" });
}

/** The run key, lit as soon as the words it needs are typed (typing doesn't redraw the screen). */
function refreshGo(from, t) {
  const go = from.closest(".ut-controls")?.querySelector(".ut-go");
  if (go) go.disabled = !!utensils.busy || !ready(t, inputOf(t.id));
}

function settings(t, i) {
  const words = t.words
    ? h(`${t.id === "music" ? "textarea" : "input"}.field.ut-words`, {
      rows: t.id === "music" ? 1 : undefined,
      value: i.prompt ?? "",
      placeholder: { variations: "What to vary (optional): the light, the pose, the season", edit: "What to change: make it night, add a red scarf", extend: "What happens next (optional)", lipsync: "How they say it (optional): smiling, whispering", sound: "The sound: rain on a tin roof, distant thunder", music: "The music: warm acoustic folk, brushed drums, 96 BPM", sfx: "The sound: a glass jar lid popping open" }[t.id] ?? "",
      dataset: { focus: `words:${t.id}` },
      on: { input: (e) => (setQuietly({ prompt: e.target.value }), refreshGo(e.target, t)), keydown: (e) => e.key === "Enter" && !e.shiftKey && t.id !== "music" && (e.preventDefault(), runTool()) },
    })
    : null;
  const extra = [];
  if (t.id === "upscale") extra.push(seg([[2, "2×"], [4, "4×"]], i.scale ?? 4, (v) => setInput({ scale: v }), "How much larger"), h("span.ut-readout", { title: "The upscaler: sharp detail, no new content" }, h("span.label", {}, "Model"), h("b", {}, "4x-UltraSharp")));
  if (t.id === "upscale-video") extra.push(seg([[720, "720p"], [1080, "1080p"], [1440, "1440p"]], i.height ?? 1080, (v) => setInput({ height: v }), "The short side, in pixels"), h("span.ut-readout", {}, h("span.label", {}, "Model"), h("b", {}, "SeedVR2 3B")));
  if (t.id === "variations" || t.id === "edit") extra.push(lookPicker());
  if (t.id === "extend") extra.push(stepper(i.seconds ?? 5, 2, 10, 1, " s", (v) => setInput({ seconds: v }), "How much longer"));
  if (t.id === "music") extra.push(stepper(i.seconds ?? 30, 10, 240, 10, " s", (v) => setInput({ seconds: v }), "How long"), stepper(i.bpm ?? 100, 60, 180, 4, " bpm", (v) => setInput({ bpm: v }), "Tempo"));
  if (t.id === "sfx") extra.push(stepper(i.seconds ?? 6, 1, 30, 1, " s", (v) => setInput({ seconds: v }), "How long"));
  const lyrics = t.id === "music" ? h("textarea.field.ut-lyrics", { rows: 3, value: i.lyrics ?? "", placeholder: "Lyrics (optional): leave empty for an instrumental", dataset: { focus: "lyrics" }, on: { input: (e) => setQuietly({ lyrics: e.target.value }) } }) : null;
  const cost = estimate(t, i);
  const go = h("button.ut-go", { type: "button", disabled: !!utensils.busy || !ready(t, i), title: ready(t, i) ? t.hint : t.takes.some((k) => !i[k]) ? "Give it what it works on first" : "Say what you want first", on: { click: () => runTool() } },
    h("span", {}, utensils.busy === t.id ? "Working" : t.verb), cost ? h("em", {}, `≈ ${cost} cr`) : null);
  return h("div.ut-controls", {},
    h("div.ut-row", {}, ...inputs(t, i), ...extra.filter(Boolean), t.takes.length ? null : words, go),
    t.takes.length && words ? h("div.ut-row", {}, words) : null,
    lyrics ? h("div.ut-row", {}, lyrics) : null);
}

function toolPanel() {
  const t = toolById(utensils.tool);
  const i = inputOf(t.id);
  return h("section.ut-panel.ut-main", {},
    h("div.ut-title", {}, h("h1", {}, t.name), h("span.ut-info", { title: t.hint }, icon("sparkle")), h("p", {}, t.hint)),
    workArea(t, i),
    settings(t, i));
}

// ---------------------------------------------------------------- the results

function results() {
  const list = utensils.results;
  return h("section.ut-panel.ut-results", {},
    h("div.ut-head", {}, h("span.card-label", {}, "Results"), h("span.ut-count", {}, list.length === 1 ? "1 result" : `${list.length} results`)),
    list.length ? null : h("p.hint", {}, "What every tool makes is kept here, newest first."),
    h("div.ut-list", { dataset: { scrollKey: "ut-results" } }, ...list.map((r) => {
      const t = toolById(r.tool);
      const pic = r.kind === "image" ? h(`img${r.clear ? ".is-clear" : ""}`, { src: r.url, alt: "", draggable: false, loading: "lazy" })
        : r.kind === "video" ? h("video", { src: r.url, muted: true, preload: "metadata", playsInline: true })
        : h("span.ut-result-audio", {}, icon("sound"));
      const name = `${t.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${r.id}`;
      const ext = r.kind === "audio" ? (r.url.split(".").pop() || "mp3") : r.kind === "video" ? "mp4" : (r.url.split(".").pop() || "png");
      return h(`div.ut-result${r.id === utensils.shown ? ".is-on" : ""}`, {},
        h("button.ut-result-pic", { type: "button", title: "Show it", on: { click: () => (r.tool !== utensils.tool && pickTool(r.tool), show(r.id)) } }, pic, h("span.ut-badge", {}, sprite(t.icon))),
        h("div.ut-result-text", {},
          h("b", {}, t.name), h("span", {}, r.note ?? ""), h("em", {}, ago(r.at)),
          h("div.ut-result-keys", {},
            h("a.key.is-icon", { href: `${r.url}?download=${name}.${ext}`, download: `${name}.${ext}`, title: "Download" }, icon("download")),
            r.kind !== "audio" || toolById(utensils.tool).takes.includes("audio") ? h("button.key.is-icon", { type: "button", title: `Give it to ${toolById(utensils.tool).name}`, on: { click: () => useResult(r) } }, sprite(toolById(utensils.tool).icon)) : null,
            r.kind === "image" || r.run ? h("button.key.is-icon", { type: "button", title: r.run ? "Open the take in Kitchen's Shot" : "Start a shot from it in Kitchen", on: { click: () => (r.run ? openTake(r.run) : placePhoto("start", r)) } }, sprite("product-kitchen")) : null,
            h("button.key.is-icon.is-quiet", { type: "button", title: "Take it off the list\nThe file stays in the Library", on: { click: () => forget(r.id) } }, icon("trash")))));
    })));
}

export function renderUtensils(el) {
  const active = document.activeElement;
  const focus = el.contains(active) ? active.dataset.focus : null;
  const sel = focus ? [active.selectionStart, active.selectionEnd] : null;
  el.replaceChildren(h("div.utensils", {}, shelf(), toolPanel(), results()));
  if (focus) {
    const back = el.querySelector(`[data-focus="${CSS.escape(focus)}"]`);
    back?.focus({ preventScroll: true });
    if (back && sel) back.setSelectionRange?.(...sel);
  }
}

// a file dropped or pasted on Utensils goes to the tool open
document.addEventListener("dragover", (e) => currentPage() === "utensils" && e.dataTransfer?.types?.includes("Files") && e.preventDefault());
document.addEventListener("drop", (e) => {
  if (currentPage() !== "utensils" || !e.dataTransfer?.files?.length) return;
  e.preventDefault();
  for (const f of e.dataTransfer.files) give(f);
});
document.addEventListener("paste", (e) => {
  if (currentPage() !== "utensils" || e.target.closest?.("input, textarea")) return;
  const files = [...(e.clipboardData?.files ?? [])];
  if (!files.length) return;
  e.preventDefault();
  files.forEach(give);
});
