import { h, icon } from "../dom.js";
import { state, edit, changed } from "../store.js";
import { view } from "../viewer.js";

const FPS = 24;
let root;
let media = { key: null, el: null };
const strips = new Map();
const waves = new Map();

const selectedRun = () => state.runs.find((r) => r.id === state.selected) ?? null;

/** What the screen shows right now: an image or a video, a label, and its shape. */
function screenSource() {
  const d = state.draft;
  const run = selectedRun();
  if (run) {
    const endUrl = run.frame ?? (run.request.end?.file ? `media/photos/${run.request.end.file}` : null);
    const startUrl = run.request.start ? `media/photos/${run.request.start}` : null;
    const ratio = run.size.width / run.size.height;
    const name = `Take ${run.take}${run.takes > 1 ? `/${run.takes}` : ""} · ${run.request.name}`;
    if (state.ab === "b" && endUrl) return { kind: "image", src: endUrl, badge: `${name} · end frame`, ratio };
    if (state.ab === "start" && startUrl) return { kind: "image", src: startUrl, badge: `${name} · start frame`, ratio };
    if (run.status === "done") return { kind: "video", src: run.video, badge: `${name} · done · ${(run.length ?? run.request.seconds).toFixed(1)} s`, ratio, tone: "ok" };
    if (state.previews.has(run.id)) {
      return { kind: "image", src: state.previews.get(run.id), badge: `Live · ${run.stage} ${Math.round(run.progress * 100)}%`, ratio, live: true, tone: "busy" };
    }
    if (run.status === "review" && run.frame) return { kind: "image", src: run.frame, badge: `${name} · check the last frame`, ratio };
    return { kind: "image", src: startUrl, badge: `${name} · ${run.stage || run.status}`, ratio };
  }
  const shape = (p) => (p?.width ? p.width / p.height : 16 / 9);
  if (state.ab === "b" && d.end) return { kind: "image", src: d.end.url, badge: "End frame", ratio: shape(d.end) };
  if (d.startMode === "video" && d.video) return { kind: "video", src: d.video.url, badge: `Your video · ${d.video.mode === "motion" ? "its motion" : "extended"}`, ratio: d.video.width / d.video.height };
  if (d.start) return { kind: "image", src: d.start.url, badge: "Start frame", ratio: shape(d.start) };
  return { kind: "empty", ratio: 16 / 9 };
}

function placeMedia(screen, src) {
  const key = `${src.kind}:${src.src}`;
  if (media.key === key && media.el?.isConnected) return media.el;
  let el;
  if (src.kind === "video") {
    el = h("video", { src: src.src, loop: true, playsInline: true, preload: "auto", draggable: false });
    el.addEventListener("timeupdate", () => (moveHead(), tick()));
    el.addEventListener("play", () => syncTransport());
    el.addEventListener("pause", () => syncTransport());
  } else if (src.kind === "image") {
    el = h("img", { src: src.src, alt: "", draggable: false });
    el.addEventListener("click", () => view(src.src));
  } else {
    el = h("div.empty", {}, "Add a start frame, or write a shot and roll it as text to video.");
  }
  screen.querySelector(".slot-media")?.replaceWith(el);
  el.classList.add("slot-media");
  media = { key, el };
  return el;
}

function seconds() {
  const run = selectedRun();
  return run ? run.length ?? run.request.seconds : state.draft.seconds;
}

function markers() {
  const run = selectedRun();
  const r = run?.request;
  const d = state.draft;
  const list = [];
  if (r ? r.start : d.start) list.push({ t: 0, cls: "is-start", title: "Start frame" });
  (r ? r.keyframes : d.keyframes).forEach((k, i) => list.push({ t: k.time, cls: "is-key", title: `Keyframe at ${k.time} s`, index: run ? null : i }));
  if (r ? r.end || run.frame : d.end || d.paint.trim()) list.push({ t: seconds(), cls: "is-end", title: "End frame" });
  return list;
}

function timeline() {
  const total = seconds();
  const shots = (selectedRun()?.request.script.shots ?? state.draft.script.shots).filter((s) => s.action?.trim());
  const pct = (t) => `${(t / total) * 100}%`;
  const track = h("div.tl-track", { on: { pointerdown: seek } });
  const picture = h("div.tl-lane");
  const sound = h("div.tl-lane");
  track.append(picture, sound);
  const run = selectedRun();
  if (run?.status === "done") {
    const strip = strips.get(run.id);
    if (strip) picture.append(h("div.tl-strip", {}, strip.map((src) => h("img", { src, alt: "", draggable: false }))));
    else filmstrip(run);
    const wave = waves.get(run.id);
    if (wave) sound.append(wave);
    else if (!waves.has(run.id)) waveform(run.id, run.video, () => state.selected === run.id);
  } else if (!run && state.draft.audio) {
    // the voice or music the shot will follow, trimmed to the shot's length
    const a = state.draft.audio;
    const wave = waves.get(a.url);
    if (wave) {
      wave.style.width = `${(Math.max(a.duration, total) / total) * 100}%`;
      sound.append(wave);
    } else if (!waves.has(a.url)) waveform(a.url, a.url, () => !state.selected && state.draft.audio?.url === a.url);
  }
  shots.slice(1).forEach((_, i) => track.append(h("i.tl-cut", { style: { left: pct((total * (i + 1)) / shots.length) } })));
  for (const m of markers()) {
    const marker = h("i.tl-marker", { className: `tl-marker ${m.cls}`, title: m.title, style: { left: pct(m.t) } });
    if (m.index !== null && m.index !== undefined) dragKeyframe(marker, m.index, track);
    track.append(marker);
  }
  track.append(h("i.tl-head", { style: { left: "0%" } }));
  const ruler = h("div.tl-ruler", {});
  for (let s = 0; s <= total; s++) ruler.append(h("span", { style: { left: pct(s) } }, s.toFixed(1)));
  const labels = h("div.tl-shots", {});
  if (shots.length > 1) {
    shots.forEach((_, i) => labels.append(h("span", { style: { left: pct((total * i) / shots.length), width: pct(total / shots.length) } }, `Shot ${i + 1}`)));
  }
  return h("div.timeline", {}, labels, ruler, track);
}

function dragKeyframe(marker, index, track) {
  marker.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    marker.setPointerCapture(e.pointerId);
    const rect = track.getBoundingClientRect();
    const move = (m) => {
      const t = Math.min(state.draft.seconds - 0.1, Math.max(0.1, ((m.clientX - rect.left) / rect.width) * state.draft.seconds));
      marker.style.left = `${(t / state.draft.seconds) * 100}%`;
      marker.dataset.t = (Math.round(t * 10) / 10).toString();
    };
    const up = () => {
      marker.removeEventListener("pointermove", move);
      marker.removeEventListener("pointerup", up);
      if (marker.dataset.t) edit((d) => (d.keyframes[index].time = Number(marker.dataset.t)), "sources", "monitor");
    };
    marker.addEventListener("pointermove", move);
    marker.addEventListener("pointerup", up);
  });
}

function seek(e) {
  if (!(media.el instanceof HTMLVideoElement) || !media.el.duration) return;
  const rect = e.currentTarget.getBoundingClientRect();
  media.el.currentTime = ((e.clientX - rect.left) / rect.width) * media.el.duration;
}

function moveHead() {
  const head = root?.querySelector(".tl-head");
  if (head && media.el instanceof HTMLVideoElement && media.el.duration) {
    head.style.left = `${(media.el.currentTime / media.el.duration) * 100}%`;
  }
}

/** A row of stills from a finished take, grabbed in the browser. */
async function filmstrip(run) {
  strips.set(run.id, []);
  const video = h("video", { muted: true, preload: "auto", src: run.video });
  await new Promise((ok) => video.addEventListener("loadeddata", ok, { once: true }));
  const shots = [];
  const canvas = new OffscreenCanvas(160, Math.round((160 * video.videoHeight) / video.videoWidth));
  const ctx = canvas.getContext("2d");
  for (let i = 0; i < 12; i++) {
    video.currentTime = ((i + 0.5) / 12) * video.duration;
    await new Promise((ok) => video.addEventListener("seeked", ok, { once: true }));
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    shots.push(URL.createObjectURL(await canvas.convertToBlob({ type: "image/jpeg", quality: 0.7 })));
  }
  strips.set(run.id, shots);
  if (state.selected === run.id) changed("monitor");
}

/** A sound (a take's, or the track the shot follows), drawn as a waveform lane. */
async function waveform(key, url, showing) {
  waves.set(key, null);
  try {
    const data = await (await fetch(url)).arrayBuffer();
    const audio = await new AudioContext().decodeAudioData(data);
    const samples = audio.getChannelData(0);
    const canvas = h("canvas.tl-wave", { width: 1200, height: 56 });
    const ctx = canvas.getContext("2d");
    const step = Math.floor(samples.length / canvas.width);
    ctx.fillStyle = "rgba(79, 207, 139, .85)";
    for (let x = 0; x < canvas.width; x++) {
      let peak = 0;
      for (let i = x * step; i < (x + 1) * step; i += 16) peak = Math.max(peak, Math.abs(samples[i]));
      const bar = Math.max(1, peak * canvas.height * 0.9);
      ctx.fillRect(x, (canvas.height - bar) / 2, 1, bar);
    }
    waves.set(key, canvas);
    if (showing()) changed("monitor");
  } catch {
    // a sound that can't be read simply shows no waveform
  }
}

function syncTransport() {
  const play = root?.querySelector("[data-act=play]");
  if (!play) return;
  const video = media.el instanceof HTMLVideoElement ? media.el : null;
  play.disabled = !video;
  play.replaceChildren(icon(video && !video.paused ? "pause" : "play"));
  play.setAttribute("aria-label", video && !video.paused ? "Pause" : "Play");
  tick();
}

const stamp = (t) => `${String(Math.floor(t / 60)).padStart(2, "0")}:${(t % 60).toFixed(2).padStart(5, "0")}`;

function tick() {
  const code = root?.querySelector(".timecode");
  if (!code) return;
  const video = media.el instanceof HTMLVideoElement ? media.el : null;
  const total = video?.duration || seconds();
  code.replaceChildren(stamp(video?.currentTime ?? 0), h("span", {}, ` / ${stamp(total)}`));
}

function readout() {
  const run = selectedRun();
  if (run) return `${run.size.width} × ${run.size.height} · ${run.fps ?? FPS} fps · seed ${run.seed}`;
  const d = state.draft;
  return `${d.aspect === "auto" ? "auto aspect" : d.aspect} · ${FPS} fps · seed ${d.lockSeed ? d.seed : "random"}`;
}

export function renderMonitor(el) {
  root = el;
  const src = screenSource();
  let screen = el.querySelector(".screen");
  if (!screen) {
    el.replaceChildren(
      h("div.screen-wrap", {},
        (screen = h("div.screen", {}, h("div.slot-media"), h("div.marks", {}, h("i"), h("i"), h("i"), h("i")), h("span.status-chip", {}, h("span.lamp"), h("span.badge-text")))),
      ),
      h("div.transport", {},
        h("button.play", { type: "button", dataset: { act: "play" }, on: { click: () => {
          if (!(media.el instanceof HTMLVideoElement)) return;
          media.el.paused ? media.el.play() : media.el.pause();
        } } }, icon("play")),
        h("span.timecode"),
        h("span.readout"),
        h("div.segment.is-inline", { role: "group", "aria-label": "Compare" },
          h("button", { type: "button", dataset: { ab: "start" }, on: { click: () => ((state.ab = "start"), changed("monitor")) } }, "Start"),
          h("button", { type: "button", dataset: { ab: "a" }, on: { click: () => ((state.ab = "a"), changed("monitor")) } }, "Shot"),
          h("button", { type: "button", dataset: { ab: "b" }, on: { click: () => ((state.ab = "b"), changed("monitor")) } }, "End"),
        ),
        h("button.key.is-icon", { type: "button", dataset: { act: "loop" }, "aria-label": "Loop", "aria-pressed": "true", on: { click: (e) => {
          const on = e.currentTarget.getAttribute("aria-pressed") !== "true";
          e.currentTarget.setAttribute("aria-pressed", String(on));
          if (media.el instanceof HTMLVideoElement) media.el.loop = on;
        } } }, icon("loop")),
        h("button.key.is-icon", { type: "button", "aria-label": "Full screen", on: { click: () => {
          const s = screenSource();
          if (s.src) view(s.src, s.kind === "video" ? "video" : "image");
        } } }, icon("expand")),
      ),
      h("div.tl-slot"),
    );
  }
  screen.style.setProperty("--frame-ratio", String(src.ratio));
  placeMedia(screen, src);
  const chip = screen.querySelector(".status-chip");
  chip.hidden = !src.badge;
  chip.querySelector(".badge-text").textContent = src.badge ?? "";
  const lamp = chip.querySelector(".lamp");
  if (src.tone) lamp.dataset.tone = src.tone;
  else delete lamp.dataset.tone;
  el.querySelector(".tl-slot").replaceChildren(timeline());
  el.querySelector(".readout").textContent = readout();
  const run = selectedRun();
  // the draft has no shot yet: only its start and end frames can be shown
  const has = {
    start: run ? !!run.request.start : !!state.draft.start,
    a: !!run,
    b: run ? !!(run.frame || run.request.end?.file) : !!state.draft.end,
  };
  let shows = run ? state.ab : state.ab === "b" ? "b" : "start";
  if (!has[shows]) shows = run ? "a" : has.start ? "start" : null;
  el.querySelectorAll("[data-ab]").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.ab === shows));
    b.disabled = !has[b.dataset.ab];
  });
  syncTransport();
  moveHead();
}
