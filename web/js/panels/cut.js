import { h, icon, sprite } from "../dom.js";
import { state, loadPhotos } from "../store.js";
import {
  cut, FPS, loadCuts, openCut, newCut, duplicateCut, closeCut, deleteCut, renameCut, undo, redo, commit, touch,
  track, mainTrack, findItem, sourceOf, lengthOf, layout, startOf, totalLength, filmLength, addMedia, addTitle, setItem,
  removeItem, select, setPlayhead, splitAt, moveMain, moveToTrack, toggleTrack, setJoin, renderFilm, makeAudio, makeVoice,
  lipSync, newSound, extendClip, frameOf, loadAudio, MOTIONS,
} from "../cut.js";

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const key = (glyph, label, run, extra = {}) => h("button.key.is-icon", { type: "button", title: label, "aria-label": label, on: { click: run }, ...extra }, glyph);
const tc = (t) => {
  const f = Math.max(0, Math.round(t * FPS));
  const s = Math.floor(f / FPS);
  return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}:${String(f % FPS).padStart(2, "0")}`;
};
const secs = (t) => `${t.toFixed(1)} s`;
const GRADES = [["natural", "Natural", ""], ["warm", "Warm", "sepia(.18) saturate(1.1)"], ["cool", "Cool", "hue-rotate(-10deg) saturate(.95) brightness(1.02)"], ["film", "Film", "contrast(1.1) saturate(.9)"], ["mono", "Mono", "grayscale(1) contrast(1.08)"]];

// the page is built once, so the monitor's players and the timeline's scroll survive every redraw
let shell = null;

// ---------------------------------------------------------------- the monitor: plays the timeline

const player = { playing: false, t0: 0, from: 0, raf: 0, layers: new Map(), loop: false };

/** What plays at a time: the main clip (two in a dissolve), the overlays, the titles, the sounds. */
function frameAt(t) {
  const b = cut.project?.body;
  const out = { pictures: [], titles: [], sounds: [] };
  if (!b) return out;
  const fade = (it, start, len, t) => {
    const fi = Number(it.fadeIn) || 0;
    const fo = Number(it.fadeOut) || 0;
    let a = 1;
    if (fi > 0 && t - start < fi) a = Math.min(a, (t - start) / fi);
    if (fo > 0 && start + len - t < fo) a = Math.min(a, (start + len - t) / fo);
    return clamp(a, 0, 1);
  };
  const main = mainTrack(b);
  const l = layout(b);
  l.forEach((m, i) => {
    if (t < m.start || t >= m.end) return;
    let a = fade(m.item, m.start, m.len, t);
    // in a dissolve, the clip coming in rises over the one going out
    if (m.dissolve && t < m.start + m.dissolve) a *= (t - m.start) / m.dissolve;
    out.pictures.push({ item: m.item, start: m.start, len: m.len, alpha: a, z: 1 + i, mute: main.mute });
  });
  for (const tr of b.tracks.filter((x) => x.kind === "video" && !x.main && !x.mute)) {
    for (const it of tr.items) {
      const s = Number(it.start) || 0;
      const len = lengthOf(it);
      if (t >= s && t < s + len) out.pictures.push({ item: it, start: s, len, alpha: fade(it, s, len, t) * (it.opacity ?? 1), z: 100, overlay: true });
    }
  }
  for (const tr of b.tracks.filter((x) => x.kind === "title" && !x.mute)) {
    for (const it of tr.items) {
      const s = Number(it.start) || 0;
      const len = Number(it.length) || 3;
      const f = Math.min(0.4, len / 4);
      if (t >= s && t < s + len) out.titles.push({ item: it, alpha: clamp(Math.min((t - s) / f, (s + len - t) / f, 1), 0, 1) });
    }
  }
  for (const tr of b.tracks.filter((x) => x.kind === "audio" && !x.mute)) {
    for (const it of tr.items) {
      const s = Number(it.start) || 0;
      const len = lengthOf(it);
      if (t >= s && t < s + len) out.sounds.push({ item: it, start: s, len, gain: fade(it, s, len, t) * clamp(Number(it.volume ?? 1), 0, 1) });
    }
  }
  return out;
}

/** The layer an item plays in, made once and kept while it is on screen. */
function layerOf(it, kind) {
  let el = player.layers.get(it.id);
  const s = sourceOf(it.src);
  const url = s?.url;
  if (el && el.dataset.url !== url) {
    el.remove();
    player.layers.delete(it.id);
    el = null;
  }
  if (!el) {
    const poster = it.src?.kind === "take" ? state.runs.find((r) => r.id === it.src.id)?.request?.start : null;
    el = kind === "sound" ? h("audio", { preload: "auto" }) : s?.still ? h("img.cut-layer", { draggable: false }) : h("video.cut-layer", { playsInline: true, preload: "auto", ...(poster && !(Number(it.from) > 0.2) ? { poster: `/media/photos/${poster}` } : {}) });
    el.dataset.url = url ?? "";
    if (url) el.src = url;
    if (kind !== "sound") shell.layers.append(el);
    player.layers.set(it.id, el);
  }
  return el;
}

/** Shows the timeline at a time: every layer at its place in its source, faded, moved and graded. */
function show(t) {
  if (!shell) return;
  const f = frameAt(t);
  const live = new Set();
  for (const p of f.pictures) {
    const it = p.item;
    const s = sourceOf(it.src);
    if (!s?.url) continue;
    const el = layerOf(it, "picture");
    live.add(it.id);
    el.style.opacity = String(p.alpha);
    el.style.zIndex = String(p.z);
    const local = t - p.start;
    const prog = clamp(local / Math.max(0.01, p.len), 0, 1);
    const m = it.motion;
    if (m) {
      const z = m.from.scale + (m.to.scale - m.from.scale) * prog;
      const x = m.from.x + (m.to.x - m.from.x) * prog;
      const y = m.from.y + (m.to.y - m.from.y) * prog;
      el.style.transform = `scale(${z}) translate(${(-x * (z - 1) / (2 * z)) * 100}%, ${(-y * (z - 1) / (2 * z)) * 100}%)`;
    } else el.style.transform = "";
    el.style.filter = GRADES.find(([g]) => g === it.grade)?.[2] ?? "";
    el.classList.toggle("is-fill", !!p.overlay || !!s.still);
    if (el.tagName === "VIDEO") {
      const speed = clamp(Number(it.speed) || 1, 0.25, 4);
      const target = (Number(it.from) || 0) + local * speed;
      el.muted = !!p.mute || it.sound === false;
      el.volume = clamp(Number(it.volume ?? 1), 0, 1) * p.alpha;
      el.playbackRate = speed;
      if (player.playing) {
        if (Math.abs(el.currentTime - target) > 0.25) el.currentTime = target;
        if (el.paused) el.play().catch(() => {});
      } else {
        if (!el.paused) el.pause();
        if (Math.abs(el.currentTime - target) > 0.02) el.currentTime = target;
      }
    }
  }
  for (const s of f.sounds) {
    const it = s.item;
    const el = layerOf(it, "sound");
    live.add(it.id);
    el.volume = s.gain;
    const target = (Number(it.from) || 0) + (t - s.start);
    if (player.playing) {
      if (Math.abs(el.currentTime - target) > 0.25) el.currentTime = target;
      if (el.paused) el.play().catch(() => {});
    } else if (!el.paused) el.pause();
  }
  for (const [id, el] of player.layers) {
    if (live.has(id)) continue;
    el.pause?.();
    el.remove();
    player.layers.delete(id);
  }
  shell.titles.replaceChildren(...f.titles.map((x) => h("div.cut-title", { className: x.item.style === "lower" ? "is-lower" : "", style: { opacity: String(x.alpha) } }, x.item.text)));
  shell.empty.hidden = f.pictures.length > 0;
  shell.timecode.textContent = tc(t);
  movePlayhead(t);
}

function tick() {
  const t = player.from + (performance.now() - player.t0) / 1000;
  const end = filmLength() || totalLength();
  if (t >= end) {
    if (player.loop && end > 0) return (player.from = 0), (player.t0 = performance.now()), (player.raf = requestAnimationFrame(tick));
    stop();
    cut.playhead = end;
    return show(end);
  }
  cut.playhead = t;
  show(t);
  player.raf = requestAnimationFrame(tick);
}
function play() {
  if (player.playing) return stop();
  const end = filmLength() || totalLength();
  if (!end) return;
  player.playing = true;
  player.from = cut.playhead >= end - 0.05 ? 0 : cut.playhead;
  player.t0 = performance.now();
  shell.playKey.replaceChildren(icon("pause"));
  player.raf = requestAnimationFrame(tick);
}
function stop() {
  player.playing = false;
  cancelAnimationFrame(player.raf);
  for (const el of player.layers.values()) el.pause?.();
  shell?.playKey.replaceChildren(icon("play"));
}
const seek = (t) => {
  if (player.playing) stop();
  cut.playhead = clamp(t, 0, Math.max(0, totalLength()));
  show(cut.playhead);
};
const step = (frames) => seek(cut.playhead + frames / FPS);

function movePlayhead(t = cut.playhead) {
  if (!shell) return;
  shell.playhead.style.transform = `translateX(${t * cut.zoom}px)`;
  // keep it in view while playing
  if (player.playing) {
    const x = t * cut.zoom;
    const box = shell.lanes;
    if (x > box.scrollLeft + box.clientWidth - 80 || x < box.scrollLeft) box.scrollLeft = Math.max(0, x - 120);
  }
}

// ---------------------------------------------------------------- waveforms

const waves = new Map();
function peaksOf(url) {
  if (!waves.has(url)) {
    waves.set(url, (async () => {
      const ctx = new (window.AudioContext ?? window.webkitAudioContext)();
      try {
        const buf = await ctx.decodeAudioData(await (await fetch(url)).arrayBuffer());
        const data = buf.getChannelData(0);
        const per = Math.max(1, Math.floor(buf.sampleRate / 100));
        const peaks = new Float32Array(Math.ceil(data.length / per));
        for (let i = 0; i < peaks.length; i++) {
          let m = 0;
          for (let k = i * per, e = Math.min(data.length, k + per); k < e; k++) m = Math.max(m, Math.abs(data[k]));
          peaks[i] = m;
        }
        return peaks;
      } catch {
        return null;
      } finally {
        ctx.close();
      }
    })());
  }
  return waves.get(url);
}
function waveCanvas(it, width) {
  const c = h("canvas.cut-wave");
  const s = sourceOf(it.src);
  if (!s?.url) return c;
  const ratio = window.devicePixelRatio || 1;
  c.width = Math.max(1, Math.round(width * ratio));
  c.height = Math.round(28 * ratio);
  peaksOf(s.url).then((peaks) => {
    if (!peaks) return;
    const g = c.getContext("2d");
    g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--muted") || "#9a9aa0";
    const from = (Number(it.from) || 0) * 100;
    const span = lengthOf(it) * 100;
    for (let x = 0; x < c.width; x++) {
      const i = Math.floor(from + (x / c.width) * span);
      const v = peaks[i] ?? 0;
      const hgt = Math.max(1, v * c.height * 0.95);
      g.fillRect(x, (c.height - hgt) / 2, 1, hgt);
    }
  });
  return c;
}

// ---------------------------------------------------------------- the media bin

const bin = { tab: "video", query: "", form: null };
function mediaItems() {
  const q = bin.query.trim().toLowerCase();
  const has = (name) => !q || String(name ?? "").toLowerCase().includes(q);
  if (bin.tab === "video") {
    const takes = state.runs.filter((r) => r.status === "done" && has(r.request?.name)).map((r) => ({ kind: "video", name: r.request?.name ?? r.id, src: { kind: "take", id: r.id }, poster: r.request?.start ? `/media/photos/${r.request.start}` : null, url: r.video, seconds: r.length ?? r.request?.seconds }));
    const films = state.films.filter((f) => has(f.name)).map((f) => ({ kind: "video", name: f.name, src: { kind: "film", id: f.id }, url: f.url, seconds: f.seconds, film: true }));
    return [...takes, ...films].slice(0, 120);
  }
  if (bin.tab === "images") return (state.photos ?? []).filter((p) => has(p.name ?? p.file)).slice(0, 160).map((p) => ({ kind: "image", name: p.name ?? p.file, src: { kind: "photo", id: p.file, url: p.url, width: p.width, height: p.height, name: p.name }, poster: p.url }));
  const voice = bin.tab === "voice";
  return (cut.audio ?? []).filter((a) => (voice ? a.kind === "voice" : a.kind !== "voice") && has(a.name)).map((a) => ({ kind: "audio", role: voice ? "voice" : a.kind === "music" ? "music" : "effects", name: a.name, src: { kind: "audio", id: a.file, url: a.url, duration: a.seconds, name: a.name }, url: a.url, seconds: a.seconds, sort: a.kind }));
}
function binTile(m) {
  const tile = h("button.cut-media", { type: "button", draggable: true, title: `${m.name} — click to add it, or drag it onto a track`, on: { click: () => addMedia(m) } },
    m.kind === "audio" ? h("span.cut-media-wave", {}, sprite(m.role === "voice" ? "audio-voice" : m.role === "music" ? "audio-music" : "audio-sfx"), waveCanvas({ src: m.src, from: 0, to: null }, 150))
      : m.poster ? h("img", { src: m.poster, alt: "", loading: "lazy", draggable: false })
      : h("video", { src: `${m.url}#t=0.4`, muted: true, preload: "metadata", draggable: false }),
    h("span.cut-media-name", {}, m.name),
    m.seconds ? h("span.cut-media-len", {}, secs(Number(m.seconds) || 0)) : null);
  tile.addEventListener("dragstart", (e) => e.dataTransfer.setData("text/cut-media", JSON.stringify(m)));
  return tile;
}
let binShown = "";
function renderBin(force = false) {
  const sig = JSON.stringify([bin.tab, bin.query, bin.form, state.runs.filter((r) => r.status === "done").length, state.films.length, state.photos?.length ?? 0, cut.audio?.length ?? -1, [...cut.busy].filter((k) => /^(music|sound|voice):/.test(k)).length, bin.tab === "voice" && cut.selected]);
  if (!force && sig === binShown && shell.bin.childElementCount) return;
  binShown = sig;
  const tabs = [["video", "Video", () => icon("video")], ["images", "Images", () => icon("image")], ["audio", "Audio", () => icon("sound")], ["voice", "Voice", () => sprite("audio-voice")]];
  const list = mediaItems();
  const busy = [...cut.busy].filter((k) => /^(music|sound|voice):/.test(k)).length;
  const form = bin.form ? aiForm(bin.form) : null;
  shell.bin.replaceChildren(
    h("div.cut-panel-head", {}, h("span.card-label", {}, "Media bin"), busy ? h("span.cut-busy", {}, h("span.lamp", { dataset: { tone: "busy" } }), `${busy} making`) : null),
    h("div.segment.cut-bin-tabs", { role: "tablist" }, ...tabs.map(([id, label, glyph]) => h("button", { type: "button", role: "tab", "aria-pressed": String(bin.tab === id), on: { click: () => ((bin.tab = id), id === "images" && !state.photos?.length && loadPhotos(), renderBin(true)) } }, glyph(), label))),
    h("label.ctl-search-row.cut-search", {}, icon("search"), h("input.field.ctl-search", { type: "search", value: bin.query, placeholder: "Search media", "aria-label": "Search media", on: { input: (e) => ((bin.query = e.target.value), renderBinList()) } })),
    h("div.cut-media-grid", { dataset: { scrollKey: "bin" } }, ...(list.length ? list.map(binTile) : [h("p.cut-empty", {}, bin.tab === "voice" ? "Voice lines come here: the Voice key makes one." : bin.tab === "audio" ? "Music and sounds come here: make one below, or drop a file." : "Nothing here yet.")])),
    ...(form ? [form] : []),
    h("div.cut-ai-keys", {},
      h("button.key", { type: "button", "aria-pressed": String(bin.form === "music"), title: "Music for the cut, from words (ACE-Step 1.5)", on: { click: () => ((bin.form = bin.form === "music" ? null : "music"), renderBin(true)) } }, sprite("audio-music"), "Music"),
      h("button.key", { type: "button", "aria-pressed": String(bin.form === "sound"), title: "A sound effect, from words (Stable Audio 3)", on: { click: () => ((bin.form = bin.form === "sound" ? null : "sound"), renderBin(true)) } }, sprite("audio-sfx"), "Sound"),
      h("button.key", { type: "button", "aria-pressed": String(bin.form === "voice"), title: "A voice line, said by LTX-2.5", on: { click: () => ((bin.form = bin.form === "voice" ? null : "voice"), renderBin(true)) } }, sprite("audio-voice"), "Voice")));
  const drop = shell.bin;
  drop.ondragover = (e) => [...e.dataTransfer.types].includes("Files") && e.preventDefault();
  drop.ondrop = async (e) => {
    const files = [...(e.dataTransfer.files ?? [])].filter((f) => f.type.startsWith("audio/"));
    if (!files.length) return;
    e.preventDefault();
    for (const f of files) await fetch(`api/audio?name=${encodeURIComponent(f.name.replace(/\.\w+$/, ""))}`, { method: "POST", headers: { "Content-Type": f.type }, body: f });
    await loadAudio();
    bin.tab = "audio";
    renderBin(true);
  };
}
function renderBinList() {
  const grid = shell.bin.querySelector(".cut-media-grid");
  const list = mediaItems();
  grid?.replaceChildren(...(list.length ? list.map(binTile) : [h("p.cut-empty", {}, "Nothing by that name.")]));
}

/** The words for a sound to make: what it is, how long; for a voice, who says it and the line. */
function aiForm(kind) {
  const sel = cut.selected && findItem(cut.selected);
  const prompt = h("input.field.is-line", { placeholder: kind === "music" ? "Gentle piano and soft strings, hopeful, slow" : kind === "sound" ? "Waves crashing on rocks, distant thunder" : "What is said", "aria-label": kind === "voice" ? "The line" : "What it sounds like", on: { keydown: (e) => (e.stopPropagation(), e.key === "Enter" && go()) } });
  const who = kind === "voice" ? h("input.field.is-line", { placeholder: "Who says it: a girl of ten, soft and curious", "aria-label": "Who says it", on: { keydown: (e) => e.stopPropagation() } }) : null;
  const length = h("select.chip-select", { "aria-label": "Length" }, ...(kind === "music" ? [15, 30, 45, 60, 90] : [3, 6, 10, 20]).map((s) => h("option", { value: s, selected: kind === "music" ? s === Math.min(90, Math.max(15, Math.round(filmLength() / 15) * 15 || 30)) : s === 6 }, `${s} s`)));
  const fromClip = kind === "voice" && sel?.track.main ? h("label.cut-check", { title: "The line is said over this clip's frame: the take shows them saying it" }, h("input", { type: "checkbox" }), "over the clip's frame") : null;
  const go = async () => {
    const words = prompt.value.trim();
    if (!words) return prompt.focus();
    bin.form = null;
    renderBin(true);
    if (kind === "voice") {
      const picture = fromClip?.querySelector("input").checked ? await frameOf(sel.item).catch(() => null) : null;
      return makeVoice({ who: who.value, line: words, picture });
    }
    makeAudio(kind, words, Number(length.value));
  };
  requestAnimationFrame(() => (who ?? prompt).focus());
  return h("div.cut-ai-form", {}, who, prompt, h("div.cut-ai-row", {}, kind === "voice" ? fromClip : length, h("span.spacer"), h("button.key.is-primary.is-sm", { type: "button", on: { click: go } }, sprite("prompt-enhance"), "Make")));
}

// ---------------------------------------------------------------- the inspector

function num(label, value, set, { min = 0, max = 600, step = 0.1, unit = "s" } = {}) {
  return h("label.cut-num", {}, h("span", {}, label),
    h("input.field", { type: "number", value: Number(value).toFixed(step < 1 ? 1 : 0), min, max, step, "aria-label": label, on: { change: (e) => set(clamp(Number(e.target.value) || 0, min, max)), keydown: (e) => e.stopPropagation() } }),
    unit ? h("i", {}, unit) : null);
}
function renderInspector() {
  const f = cut.selected && findItem(cut.selected);
  const p = cut.project;
  if (!f) {
    const b = p.body;
    shell.inspector.replaceChildren(
      h("div.cut-panel-head", {}, h("span.card-label", {}, "Edit")),
      h("input.field.cut-name", { value: p.name, "aria-label": "Name", on: { change: (e) => renameCut(e.target.value), keydown: (e) => e.stopPropagation() } }),
      h("div.cut-facts", {}, h("span", {}, "Length"), h("b", {}, tc(filmLength())), h("span", {}, "Clips"), h("b", {}, String(mainTrack()?.items.length ?? 0)),
        h("span", {}, "Sounds"), h("b", {}, String(b.tracks.filter((t) => t.kind === "audio").reduce((n, t) => n + t.items.length, 0)))),
      h("span.cut-label", {}, "Frame"),
      h("div.segment", { role: "group" }, ...["16:9", "9:16", "1:1"].map((a) => h("button", { type: "button", "aria-pressed": String(b.aspect === a), on: { click: () => ((b.aspect = a), commit()) } }, a))),
      h("label.cut-check", { title: "Music gets quieter under the voices" }, h("input", { type: "checkbox", checked: b.duck !== false, on: { change: (e) => ((b.duck = e.target.checked), commit()) } }), "Music ducks under voices"),
      h("p.cut-hint", {}, "Pick a clip, a sound or a title to change it. Space plays, S cuts at the playhead, Delete removes."),
      h("button.roll.cut-render", { type: "button", disabled: cut.busy.has("render") || !mainTrack()?.items.length, on: { click: renderFilm } }, icon("film"), cut.busy.has("render") ? "RENDERING…" : "RENDER THE FILM"));
    return;
  }
  const { track: t, item: it } = f;
  const s = sourceOf(it.src);
  const head = h("div.cut-panel-head", {}, h("span.card-label", {}, "Inspector"), h("span.spacer"), key(icon("trash"), "Remove it", () => removeItem(it.id)));
  const name = h("b.cut-ins-name", {}, t.kind === "title" ? "Title" : s?.name ?? it.name ?? "Clip");
  if (t.kind === "title") {
    shell.inspector.replaceChildren(head, name,
      h("textarea.field.cut-title-text", { rows: 2, value: it.text, "aria-label": "Words", on: { input: (e) => ((it.text = e.target.value), show(cut.playhead)), change: () => commit(), keydown: (e) => e.stopPropagation() } }),
      h("div.segment", { role: "group", "aria-label": "Where" }, ...[["center", "Centre"], ["lower", "Lower third"]].map(([v, l]) => h("button", { type: "button", "aria-pressed": String((it.style ?? "center") === v), on: { click: () => setItem(it.id, { style: v }) } }, l))),
      h("div.cut-nums", {}, num("Start", it.start ?? 0, (v) => setItem(it.id, { start: v })), num("Length", it.length ?? 3, (v) => setItem(it.id, { length: v }), { min: 0.5, max: 60 })));
    return;
  }
  const dur = s?.duration ?? 0;
  const clip = h("section.cut-sec", {}, h("span.cut-label", {}, "Clip"),
    h("div.cut-nums", {},
      s?.still ? num("Length", it.length ?? 4, (v) => setItem(it.id, { length: v }), { min: 0.5, max: 60 }) : num("In", it.from ?? 0, (v) => setItem(it.id, { from: Math.min(v, (it.to ?? dur) - 0.2) }), { max: dur }),
      s?.still ? null : num("Out", it.to ?? dur, (v) => setItem(it.id, { to: v >= dur - 0.05 ? null : Math.max(v, (it.from ?? 0) + 0.2) }), { max: dur }),
      !t.main ? num("Start", it.start ?? 0, (v) => setItem(it.id, { start: v })) : null),
    s?.still || t.kind === "audio" ? null : h("label.cut-num", {}, h("span", {}, "Speed"), h("select.chip-select", { "aria-label": "Speed", on: { change: (e) => setItem(it.id, { speed: Number(e.target.value) }) } }, ...[0.5, 0.75, 1, 1.25, 1.5, 2].map((v) => h("option", { value: v, selected: (it.speed ?? 1) === v }, `${v}×`)))));
  const sections = [head, name, clip];
  if (t.kind === "video") {
    const current = MOTIONS.find(([, , m]) => JSON.stringify(m) === JSON.stringify(it.motion ?? null))?.[0] ?? (it.motion ? "custom" : "none");
    sections.push(h("section.cut-sec", {}, h("span.cut-label", {}, "Motion"),
      h("div.cut-moves", { role: "group", "aria-label": "Motion" }, ...MOTIONS.map(([id, label, m]) => h("button", { type: "button", "aria-pressed": String(current === id), title: label, on: { click: () => setItem(it.id, { motion: m && structuredClone(m) }) } }, label))),
      it.motion ? h("div.cut-nums", {}, num("Zoom from", it.motion.from.scale * 100, (v) => setItem(it.id, { motion: { ...it.motion, from: { ...it.motion.from, scale: v / 100 } } }), { min: 100, max: 300, step: 1, unit: "%" }), num("to", it.motion.to.scale * 100, (v) => setItem(it.id, { motion: { ...it.motion, to: { ...it.motion.to, scale: v / 100 } } }), { min: 100, max: 300, step: 1, unit: "%" })) : null));
    sections.push(h("section.cut-sec", {}, h("span.cut-label", {}, "Look"),
      h("div.cut-nums", {},
        !t.main ? num("Opacity", (it.opacity ?? 1) * 100, (v) => setItem(it.id, { opacity: v / 100 }), { min: 0, max: 100, step: 1, unit: "%" }) : null,
        num("Fade in", it.fadeIn ?? 0, (v) => setItem(it.id, { fadeIn: v }), { max: 5 }), num("Fade out", it.fadeOut ?? 0, (v) => setItem(it.id, { fadeOut: v }), { max: 5 })),
      h("div.cut-grades", { role: "group", "aria-label": "Colour" }, ...GRADES.map(([g, label, css]) => h("button", { type: "button", title: label, "aria-pressed": String((it.grade ?? "natural") === g), on: { click: () => setItem(it.id, { grade: g === "natural" ? undefined : g }) } },
        s?.still || it.src?.kind !== "take" ? h("i", { style: { filter: css } }) : h("img", { src: state.runs.find((r) => r.id === it.src.id)?.request?.start ? `/media/photos/${state.runs.find((r) => r.id === it.src.id).request.start}` : "", alt: "", style: { filter: css }, draggable: false }),
        h("span", {}, label))))));
    if (t.main && t.items.indexOf(it) > 0) sections.push(h("section.cut-sec", {}, h("span.cut-label", {}, "Into this clip"),
      h("div.segment", { role: "group" }, h("button", { type: "button", "aria-pressed": String(it.join !== "dissolve"), on: { click: () => setJoin(it.id, "cut") } }, "Cut"), h("button", { type: "button", "aria-pressed": String(it.join === "dissolve"), on: { click: () => setJoin(it.id, "dissolve") } }, "Dissolve"))));
  }
  if (!s?.still) sections.push(h("section.cut-sec", {}, h("span.cut-label", {}, "Audio"),
    h("label.cut-range", {}, h("span", {}, "Volume"), h("input", { type: "range", min: 0, max: 150, step: 1, value: Math.round((it.volume ?? 1) * 100), "aria-label": "Volume", on: { input: (e) => ((it.volume = Number(e.target.value) / 100), show(cut.playhead), (e.target.nextSibling.textContent = `${e.target.value}%`)), change: () => commit() } }), h("b", {}, `${Math.round((it.volume ?? 1) * 100)}%`)),
    t.kind === "audio" ? h("div.cut-nums", {}, num("Fade in", it.fadeIn ?? 0, (v) => setItem(it.id, { fadeIn: v }), { max: 10 }), num("Fade out", it.fadeOut ?? 0, (v) => setItem(it.id, { fadeOut: v }), { max: 10 }))
      : h("label.cut-check", {}, h("input", { type: "checkbox", checked: it.sound !== false, on: { change: (e) => setItem(it.id, { sound: e.target.checked }) } }), "The clip's own sound")));
  // AI: the clip made again in a new way, on its take
  if (t.kind === "video" && it.src?.kind === "take") {
    const busy = (k) => cut.busy.has(`${k}:${it.id}`);
    const words = h("input.field.is-line", { placeholder: "New sound: rain on the window, a dog barks", "aria-label": "New sound", on: { keydown: (e) => (e.stopPropagation(), e.key === "Enter" && e.target.value.trim() && newSound(it.id, e.target.value.trim())) } });
    sections.push(h("section.cut-sec", {}, h("span.cut-label", {}, "AI actions"),
      h("div.cut-ai", {},
        h("button.key", { type: "button", disabled: busy("extend"), title: "Carry the shot on for 4 seconds more", on: { click: () => extendClip(it.id, 4) } }, sprite("video-extend"), busy("extend") ? "Extending…" : "Extend"),
        h("button.key", { type: "button", disabled: busy("lipsync") || !t.main, title: "Make it again with its mouth following the voice line under it on the Voice track", on: { click: () => lipSync(it.id) } }, sprite("lip-sync"), busy("lipsync") ? "Syncing…" : "Lip sync"),
        h("button.key", { type: "button", disabled: busy("sound"), title: "Make its sound again from the words", on: { click: () => (words.value.trim() ? newSound(it.id, words.value.trim()) : words.focus()) } }, icon("sound"), busy("sound") ? "Sounding…" : "New sound")),
      words));
  }
  shell.inspector.replaceChildren(...sections);
}

// ---------------------------------------------------------------- the timeline

function renderTimeline() {
  const b = cut.project.body;
  const z = cut.zoom;
  const total = Math.max(totalLength() + 8, 30);
  const width = total * z;
  shell.tools.replaceChildren(
    h("div.cut-tool-group", { role: "group", "aria-label": "Tool" },
      h("button.ctl-tool", { type: "button", "aria-pressed": String(cut.tool === "select"), title: "Select and move — V", "aria-label": "Select", on: { click: () => ((cut.tool = "select"), renderTimeline()) } }, sprite("web-cursor")),
      h("button.ctl-tool", { type: "button", "aria-pressed": String(cut.tool === "blade"), title: "Blade: click a clip to cut it there — B", "aria-label": "Blade", on: { click: () => ((cut.tool = "blade"), renderTimeline()) } }, sprite("edit-scissors"))),
    h("button.ctl-tool", { type: "button", title: "Cut at the playhead — S", "aria-label": "Cut at the playhead", on: { click: () => splitAt(cut.playhead) } }, sprite("edit-playhead")),
    h("button.ctl-tool", { type: "button", title: "A title at the playhead", "aria-label": "Add a title", on: { click: () => addTitle("Title") } }, h("b.cut-t", {}, "T")),
    h("button.ctl-tool", { type: "button", "aria-pressed": String(cut.snap), title: "Snap to the playhead and to clip edges", "aria-label": "Snap", on: { click: () => ((cut.snap = !cut.snap), renderTimeline()) } }, sprite("frame-first")),
    h("label.cut-zoom", { title: "Zoom" }, icon("search"), h("input", { type: "range", min: 12, max: 200, step: 1, value: z, "aria-label": "Zoom", on: { input: (e) => ((cut.zoom = Number(e.target.value)), renderTimeline()) } })),
    h("span.spacer"),
    h("span.cut-total", {}, tc(filmLength())));
  // the ruler: a tick every second or more, labelled every few
  const every = z >= 80 ? 1 : z >= 40 ? 2 : z >= 20 ? 5 : 10;
  const ruler = h("div.cut-ruler", { style: { width: `${width}px` } }, ...Array.from({ length: Math.ceil(total / every) + 1 }, (_, i) => h("span", { style: { left: `${i * every * z}px` } }, i % (every === 1 ? 5 : 2) === 0 ? tc(i * every).slice(3, 8) : "")));
  ruler.addEventListener("pointerdown", (e) => {
    const box = ruler.getBoundingClientRect();
    const at = (ev) => seek(clamp((ev.clientX - box.left) / z, 0, total));
    at(e);
    const move = (ev) => at(ev);
    const up = () => (removeEventListener("pointermove", move), removeEventListener("pointerup", up));
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
  });
  const lanes = b.tracks.map((t) => lane(t, width));
  shell.heads.replaceChildren(h("div.cut-head-ruler"), ...b.tracks.map((t) => h("div.cut-head", { className: t.mute ? "is-muted" : "" },
    h("b", {}, t.id.toUpperCase()), h("span", {}, t.name),
    h("button.ctl-mini", { type: "button", "aria-pressed": String(!!t.mute), title: t.mute ? "Turn it back on" : t.kind === "audio" ? "Mute" : "Hide", "aria-label": t.mute ? "Turn it on" : "Turn it off", on: { click: () => toggleTrack(t.id, "mute") } }, t.kind === "audio" ? icon(t.mute ? "mute" : "sound") : sprite("eye")))));
  const scroll = shell.lanes.scrollLeft;
  shell.lanes.replaceChildren(ruler, ...lanes, shell.playhead, shell.marker);
  shell.lanes.scrollLeft = scroll;
  movePlayhead();
}

const thumbs = new Map();
function thumbOf(s, from) {
  const k = `${s.url}#${from.toFixed(1)}`;
  if (!thumbs.has(k)) thumbs.set(k, s.still ? h("img.cut-thumb", { src: s.url, alt: "", draggable: false }) : h("video.cut-thumb", { src: `${s.url}#t=${from + 0.3}`, muted: true, preload: "metadata", draggable: false }));
  return thumbs.get(k);
}

function lane(t, width) {
  const z = cut.zoom;
  const el = h("div.cut-lane", { className: `is-${t.kind}${t.main ? " is-main" : ""}`, style: { width: `${width}px` }, dataset: { track: t.id } });
  const items = t.main ? layout().map((m) => ({ it: m.item, start: m.start, len: m.len, dissolve: m.dissolve })) : t.items.map((it) => ({ it, start: Number(it.start) || 0, len: t.kind === "title" ? Number(it.length) || 3 : lengthOf(it) }));
  items.forEach(({ it, start, len, dissolve }, i) => {
    const s = sourceOf(it.src);
    const w = Math.max(6, len * z);
    const block = h("div.cut-item", { className: `${cut.selected === it.id ? "is-selected" : ""}${s?.status && s.status !== "done" && it.src?.kind === "take" ? " is-missing" : ""}`, style: { left: `${start * z}px`, width: `${w}px` }, dataset: { id: it.id } },
      t.kind === "video" && s?.url ? thumbOf(s, Number(it.from) || 0) : null,
      t.kind === "audio" ? waveCanvas(it, w) : null,
      h("span.cut-item-name", {}, t.kind === "title" ? it.text : `${t.main ? `${i + 1} · ` : ""}${s?.name ?? it.name ?? ""}`),
      dissolve ? h("i.cut-dissolve", { style: { width: `${dissolve * z}px` }, title: "Dissolve" }) : null,
      h("i.cut-grip.is-left"), h("i.cut-grip.is-right"));
    block.addEventListener("pointerdown", (e) => drag(e, t, it, start, len, block));
    el.append(block);
    // between two clips of the main track: the join, a cut or a dissolve, one click to change
    if (t.main && i > 0) el.append(h("button.cut-join", { type: "button", className: it.join === "dissolve" ? "is-dissolve" : "", style: { left: `${start * z}px` }, title: it.join === "dissolve" ? "Dissolve — click for a cut" : "Cut — click for a dissolve", "aria-label": "Join", on: { click: (e) => (e.stopPropagation(), setJoin(it.id, it.join === "dissolve" ? "cut" : "dissolve")) } }));
  });
  // dropped from the bin: at the time it's dropped on
  el.addEventListener("dragover", (e) => [...e.dataTransfer.types].includes("text/cut-media") && e.preventDefault());
  el.addEventListener("drop", (e) => {
    const raw = e.dataTransfer.getData("text/cut-media");
    if (!raw) return;
    e.preventDefault();
    const m = JSON.parse(raw);
    const at = (e.clientX - el.getBoundingClientRect().left) / z;
    const index = t.main ? layout().filter((x) => x.start + x.len / 2 < at).length : undefined;
    addMedia(m, { trackId: t.id, at, index });
  });
  return el;
}

/** Moving, trimming or cutting an item with the pointer. One gesture is one undo step. */
function drag(e, t, it, start, len, block) {
  if (e.button !== 0) return;
  e.stopPropagation();
  const z = cut.zoom;
  const x0 = e.clientX;
  const at = start + (e.clientX - block.getBoundingClientRect().left) / z;
  if (cut.tool === "blade") return splitAt(at, it.id);
  cut.selected = it.id;
  const grip = e.target.classList.contains("cut-grip") ? (e.target.classList.contains("is-left") ? "left" : "right") : null;
  const s = sourceOf(it.src);
  const orig = { from: Number(it.from) || 0, to: it.to ?? s?.duration ?? len, start: Number(it.start) || 0, length: Number(it.length) || len };
  const speed = Number(it.speed) || 1;
  const edges = [cut.playhead, ...cut.project.body.tracks.flatMap((tr) => (tr.main ? layout().flatMap((m) => [m.start, m.end]) : tr.items.filter((x) => x !== it).flatMap((x) => [Number(x.start) || 0, (Number(x.start) || 0) + lengthOf(x)])))];
  const snap = (v) => {
    if (!cut.snap) return v;
    const near = edges.find((x) => Math.abs(x - v) * z < 8);
    return near ?? v;
  };
  let moved = false;
  let target = null;
  const move = (ev) => {
    const dt = (ev.clientX - x0) / z;
    if (!moved && Math.abs(ev.clientX - x0) < 3) return;
    moved = true;
    if (grip && t.kind !== "title") {
      if (s?.still) it.length = Math.max(0.5, orig.length + (grip === "right" ? dt : -dt));
      else if (grip === "left") {
        it.from = clamp(orig.from + dt * speed, 0, orig.to - 0.2);
        if (!t.main) it.start = Math.max(0, snap(orig.start + (it.from - orig.from) / speed));
      } else {
        const end = snap(start + (orig.to - orig.from) / speed + dt);
        const to = clamp(orig.from + (end - start) * speed, orig.from + 0.2, s?.duration ?? orig.to);
        it.to = to >= (s?.duration ?? 0) - 0.05 ? null : to;
      }
    } else if (grip && t.kind === "title") {
      if (grip === "right") it.length = Math.max(0.5, orig.length + dt);
      else {
        const ns = Math.max(0, snap(orig.start + dt));
        it.length = Math.max(0.5, orig.length - (ns - orig.start));
        it.start = ns;
      }
    } else if (t.main) {
      // on the main track a clip moves in the order: shown where it would land
      const x = start + len / 2 + dt;
      target = layout().filter((m) => m.item !== it && m.start + m.len / 2 < x).length;
      const order = layout().filter((m) => m.item !== it);
      const left = target < order.length ? order[target].start : order.at(-1)?.end ?? 0;
      shell.marker.hidden = false;
      shell.marker.style.transform = `translateX(${left * z}px)`;
      block.style.transform = `translateX(${dt * z}px)`;
      block.classList.add("is-dragging");
      return;
    } else {
      it.start = Math.max(0, snap(orig.start + dt));
      // between tracks of the same kind, by where the pointer is
      const under = document.elementsFromPoint(ev.clientX, ev.clientY).find((n) => n.classList?.contains("cut-lane"));
      target = under && under.dataset.track !== t.id ? under.dataset.track : null;
    }
    renderTimeline();
    show(cut.playhead);
  };
  const up = () => {
    removeEventListener("pointermove", move);
    removeEventListener("pointerup", up);
    shell.marker.hidden = true;
    if (!moved) return (select(it.id));
    if (t.main && !grip && target !== null) return moveMain(it.id, target >= layout().findIndex((m) => m.item === it) ? target + 1 : target);
    if (!t.main && !grip && target) return moveToTrack(it.id, target, it.start);
    commit();
  };
  addEventListener("pointermove", move);
  addEventListener("pointerup", up);
}

// ---------------------------------------------------------------- the bar of edits

function subbar() {
  const p = cut.project;
  const tab = (id) => {
    const c = cut.list.find((x) => x.id === id) ?? { id, name: "…" };
    const active = id === p?.id;
    return h("div.tab", { role: "tab", tabindex: "0", "aria-selected": String(active), on: { click: () => !active && (stop(), openCut(id)) } },
      c.thumb ? h("img.tab-thumb", { src: c.thumb, alt: "", draggable: false }) : h("span.tab-thumb.is-icon", {}, icon("scissors")),
      h("span.tab-name", {}, active ? p.name : c.name),
      cut.tabs.length > 1 ? h("span.tab-close", { role: "button", "aria-label": `Close ${c.name}`, title: "Close the tab — the edit is kept", on: { click: (e) => (e.stopPropagation(), closeCut(id)) } }, icon("close")) : null);
  };
  return h("div.subbar", {}, h("div.subbar-in", {},
    h("nav.tabs", { role: "tablist", "aria-label": "Edits" }, ...cut.tabs.map(tab), h("button.tab-add", { type: "button", title: "A new, empty edit", on: { click: () => (stop(), newCut()) } }, icon("plus"), "New edit")),
    h("div.subbar-actions", {},
      key(sprite("edit-undo"), "Undo — Ctrl Z", undo, { disabled: !cut.history.length }),
      key(sprite("edit-redo"), "Redo — Ctrl Shift Z", redo, { disabled: !cut.future.length }),
      key(sprite("copy"), "Duplicate the edit", () => duplicateCut()),
      key(icon("trash"), armed === p?.id ? "Click again to delete it for good" : "Delete the edit", () => {
        if (armed !== p?.id) return ((armed = p?.id), renderShell(), setTimeout(() => ((armed = null), renderShell()), 3000));
        armed = null;
        stop();
        deleteCut();
      }, { "aria-pressed": String(armed === p?.id) }),
      key(sprite("export"), "Render the film into the Library", renderFilm, { disabled: cut.busy.has("render") }))));
}
let armed = null;

// ---------------------------------------------------------------- the page

function build(el) {
  const layers = h("div.cut-layers");
  const titles = h("div.cut-titles");
  const empty = h("p.cut-screen-empty", {}, "The film plays here. Add clips from the bin.");
  const timecode = h("span.cut-timecode", {}, "00:00:00:00");
  const playKey = h("button.cut-play", { type: "button", "aria-label": "Play — Space", title: "Play — Space", on: { click: play } }, icon("play"));
  const loopKey = h("button.ctl-tool", { type: "button", title: "Loop", "aria-label": "Loop", "aria-pressed": "false", on: { click: () => ((player.loop = !player.loop), loopKey.setAttribute("aria-pressed", String(player.loop))) } }, icon("loop"));
  const screen = h("div.cut-screen", {}, layers, titles, empty);
  const monitor = h("section.cut-monitor", {},
    h("div.cut-stage", {}, screen),
    h("div.cut-transport", {}, timecode,
      h("div.cut-transport-keys", {},
        h("button.ctl-tool", { type: "button", title: "Back to the start", "aria-label": "Back to the start", on: { click: () => seek(0) } }, sprite("frame-first")),
        h("button.ctl-tool", { type: "button", title: "A frame back — ←", "aria-label": "A frame back", on: { click: () => step(-1) } }, icon("step")),
        playKey,
        h("button.ctl-tool.is-flip", { type: "button", title: "A frame on — →", "aria-label": "A frame on", on: { click: () => step(1) } }, icon("step")),
        loopKey),
      h("button.ctl-tool", { type: "button", title: "Full screen", "aria-label": "Full screen", on: { click: () => screen.requestFullscreen?.() } }, icon("expand"))));
  const binEl = h("section.cut-bin");
  const inspector = h("aside.cut-inspector");
  const tools = h("div.cut-tools");
  const heads = h("div.cut-heads");
  const lanesEl = h("div.cut-lanes", { dataset: { scrollKey: "lanes" } });
  const playhead = h("i.cut-playhead");
  const marker = h("i.cut-marker", { hidden: true });
  const timeline = h("section.cut-timeline", {}, tools, h("div.cut-tracks", {}, heads, h("div.cut-lanes-wrap", {}, lanesEl)));
  const chat = h("div.cut-chat", { id: "cut-chat" });
  const top = h("div.cut-top", {}, binEl, monitor, inspector);
  const sub = h("div.cut-sub");
  el.replaceChildren(sub, h("div.cut-page", {}, top, timeline), chat);
  lanesEl.addEventListener("wheel", (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    cut.zoom = clamp(cut.zoom * (e.deltaY < 0 ? 1.15 : 0.87), 12, 200);
    renderTimeline();
  }, { passive: false });
  // a click on an empty lane: nothing selected, the playhead there
  lanesEl.addEventListener("pointerdown", (e) => {
    if (e.target.classList.contains("cut-lane")) {
      seek((e.clientX - e.target.getBoundingClientRect().left) / cut.zoom);
      select(null);
    }
  });
  shell = { el, sub, bin: binEl, inspector, tools, heads, lanes: lanesEl, playhead, marker, layers, titles, empty, timecode, playKey, screen };
}

function renderShell() {
  shell.sub.replaceChildren(subbar());
  const ratio = { "16:9": "16 / 9", "9:16": "9 / 16", "1:1": "1 / 1" }[cut.project.body.aspect] ?? "16 / 9";
  shell.screen.style.aspectRatio = ratio;
  renderBin();
  renderInspector();
  renderTimeline();
  show(cut.playhead);
}

document.addEventListener("keydown", (e) => {
  if (document.body.dataset.page !== "cut" || !cut.project || document.body.classList.contains("has-window")) return;
  if (e.target.closest?.("input, textarea, select, [contenteditable]")) return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === "z") return e.preventDefault(), e.shiftKey ? redo() : undo();
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (k === " ") return e.preventDefault(), play();
  if (k === "arrowleft") return e.preventDefault(), step(e.shiftKey ? -FPS : -1);
  if (k === "arrowright") return e.preventDefault(), step(e.shiftKey ? FPS : 1);
  if (k === "s") return splitAt(cut.playhead);
  if (k === "b") return (cut.tool = "blade"), renderTimeline();
  if (k === "v") return (cut.tool = "select"), renderTimeline();
  if (k === "delete" || k === "backspace") return removeItem();
  if (k === "escape") return select(null);
  if (k === "home") return seek(0);
});

export function renderCut(el) {
  loadCuts();
  if (!cut.project) {
    if (!el.querySelector(".cut-loading")) el.replaceChildren(h("div.cut-loading", {}, cut.error ? h("p", {}, cut.error) : h("span.typing", {}, h("i"), h("i"), h("i"))));
    return;
  }
  if (!shell || shell.el !== el || !el.contains(shell.layers)) build(el);
  // a redraw while playing only moves what changed under the playhead
  renderShell();
  document.dispatchEvent(new Event("cut:drawn"));
}

