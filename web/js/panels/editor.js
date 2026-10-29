// The editing room's working parts, shared by Cut and Jam: the monitor that plays the timeline (its
// pictures, stickers, lyrics and beat effects, drawn as the film will be), the timeline (tracks,
// beats, effects, stickers) and the inspector. A page puts them where it likes (editorParts()) and
// drawEditor() draws them from the open edit. One edit is open at a time, so there is one editor.
import { h, icon, sprite } from "../dom.js";
import { state } from "../store.js";
import {
  cut, FPS, GRADES, track, mainTrack, findItem, sourceOf, lengthOf, layout, totalLength, filmLength, addTitle, removeItem,
  select, splitAt, moveMain, moveToTrack, toggleTrack, setJoin, commit, isPlaced, addFx, addSticker, addPictureSticker,
  STICKERS, loadStickers, addBeatAt, removeBeat, draftEdit, addLyric, addMedia, undo, redo,
} from "../cut.js";
import { fxAt, hitsOf, beatTimes, colourMatrix, FX_KINDS, aspectRatio, WHIP, whipBlur } from "../fx.js";
import { wordsOf, captionLayouts, wordState, usesLyricLayout, LINE, OUTLINE, faceOf } from "../lyrics.js";
import { nearestBeat } from "../beats.js";
import { renderInspector } from "./inspector.js";
import { api } from "../api.js";

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const tc = (t) => {
  const f = Math.max(0, Math.round(t * FPS));
  const s = Math.floor(f / FPS);
  return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}:${String(f % FPS).padStart(2, "0")}`;
};
const FX_ICON = { zoom: () => sprite("camera-zoom-in"), shake: () => sprite("camera-shake"), flash: () => icon("sparkle"), hue: () => h("i.cut-hue-dot") };

// one editor, built once: the page's redraws only move its parts
const ed = { parts: null, shell: null, mode: "cut", tray: false };
const player = { playing: false, t0: 0, from: 0, raf: 0, layers: new Map(), words: new Map(), loop: false };
/** `onTime` is for a page that follows the time (Jam lights the line being sung): called with every frame shown. */
export const editor = { get playing() { return player.playing; }, stop: () => stop(), play: () => play(), seek: (t) => seek(t), show: (t = cut.playhead) => show(t), fit: () => fit(), onTime: null };

// ---------------------------------------------------------------- what plays at a time

/** What plays at a time: the main clip (two in a dissolve), the overlays and stickers, the titles, the sounds. */
function frameAt(t) {
  const b = cut.project?.body;
  const out = { pictures: [], stickers: [], titles: [], sounds: [] };
  if (!b) return out;
  const fade = (it, start, len, at) => {
    const fi = Number(it.fadeIn) || 0;
    const fo = Number(it.fadeOut) || 0;
    let a = 1;
    if (fi > 0 && at - start < fi) a = Math.min(a, (at - start) / fi);
    if (fo > 0 && start + len - at < fo) a = Math.min(a, (start + len - at) / fo);
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
  // a whip into the next clip: over the last five frames of this one, the next clip's first frame comes down over it from above,
  // the pair swept up through the window (the film draws the same from the same numbers)
  l.forEach((m, i) => {
    const next = l[i + 1];
    if (next?.item.join !== "whip" || Math.round(m.len * FPS) < 16) return;
    const from = m.end - WHIP.frames / FPS;
    if (t < from - 1e-6 || t >= m.end) return;
    const k = clamp(Math.floor((t - from) * FPS + 1e-6), 0, WHIP.frames - 1);
    const was = out.pictures.find((p) => p.item === m.item);
    if (was) was.shift = 1 - WHIP.tops[k];
    out.pictures.push({ item: next.item, start: next.start, len: next.len, alpha: 1, z: 2 + i, mute: true, shift: -WHIP.tops[k], hold: true });
    out.whip = k;
  });
  for (const tr of b.tracks.filter((x) => x.kind === "video" && !x.main && !x.mute)) {
    for (const it of tr.items) {
      const s = Number(it.start) || 0;
      const len = lengthOf(it);
      if (t < s || t >= s + len) continue;
      if (isPlaced(it)) out.stickers.push({ item: it, alpha: fade(it, s, len, t) * (it.opacity ?? 1) });
      else out.pictures.push({ item: it, start: s, len, alpha: fade(it, s, len, t) * (it.opacity ?? 1), z: 100, overlay: true });
    }
  }
  for (const tr of b.tracks.filter((x) => x.kind === "title" && !x.mute)) {
    for (const it of tr.items) {
      const s = Number(it.start) || 0;
      const len = Number(it.length) || 3;
      const f = Math.min(0.4, len / 4);
      if (t >= s && t < s + len && it.style !== "none") out.titles.push({ item: it, start: s, len, alpha: clamp(Math.min((t - s) / f, (s + len - t) / f, 1), 0, 1) });
    }
  }
  for (const tr of b.tracks.filter((x) => x.kind === "audio" && !x.mute)) {
    for (const it of tr.items) {
      const s = Number(it.start) || 0;
      const len = lengthOf(it);
      if (t >= s && t < s + len) out.sounds.push({ item: it, start: s, len, role: tr.role, gain: fade(it, s, len, t) * clamp(Number(it.volume ?? 1), 0, 1) });
    }
  }
  return out;
}

/** The layer an item plays in, made once and kept while it is on screen. */
function layerOf(it, kind) {
  const sh = ed.shell;
  let el = player.layers.get(it.id);
  const s = sourceOf(it.src);
  const url = s?.url ?? s?.color;
  if (el && el.dataset.url !== url) {
    el.remove();
    player.layers.delete(it.id);
    el = null;
  }
  if (!el) {
    const poster = it.src?.kind === "take" ? state.runs.find((r) => r.id === it.src.id)?.request?.start : null;
    if (kind === "sound") el = h("audio", { preload: "auto" });
    else if (kind === "sticker") el = h("img.cut-sticker", { draggable: false, alt: "" });
    else if (s?.color) el = h("div.cut-layer.is-color");
    else if (s?.still) el = h("img.cut-layer", { draggable: false });
    else el = h("video.cut-layer", { playsInline: true, preload: "auto", ...(poster && !(Number(it.from) > 0.2) ? { poster: `media/photos/${poster}` } : {}) });
    el.dataset.url = url ?? "";
    el.dataset.id = it.id;
    if (s?.color) el.style.background = s.color;
    else if (url) el.src = url;
    if (kind === "sticker") el.addEventListener("pointerdown", (e) => gesture(e, it.id, "move"));
    if (kind !== "sound") sh.layers.append(el);
    player.layers.set(it.id, el);
  }
  return el;
}

/** Where a lyric line is drawn: its words laid out, made once for what it says and where it sits. */
function lyricOf(it, b) {
  const ratio = aspectRatio(b.aspect);
  const W = ratio >= 1 ? 1280 : Math.round(1280 * ratio);
  const H = ratio >= 1 ? Math.round(1280 / ratio) : 1280;
  const sig = JSON.stringify([it.text, it.words, it.romanization, it.captionLanguage, it.style, it.anim, it.x, it.y, it.size, it.color, it.hi, it.length, b.aspect]);
  let box = player.words.get(it.id);
  if (box && box.sig === sig) return box;
  box?.el.remove();
  const layers = captionLayouts(it, W, H);
  const pct = (v, of) => `${(v / of) * 100}%`;
  const px = (v) => `${(v / W) * 100}cqw`;
  const boxes = [], words = [];
  for (const { L } of layers) {
  const look = L.look;
  // the outline is the word drawn again all round it, a border's width away (round at the corners, as the film's is)
  const ring = Array.from({ length: 24 }, (_, i) => `${px(L.bord * Math.cos((i * Math.PI) / 12))} ${px(L.bord * Math.sin((i * Math.PI) / 12))} 0 ${OUTLINE}`).join(", ");
  // what a look adds: its face, its spacing, hollow letters (a stroke in the colour), a glow in the lit colour, a box behind each row
  const own = look.face === "lyric" ? {} : { fontFamily: `"${faceOf(look.face).family}", sans-serif` };
  const glow = `0 0 ${px(L.em * 0.1)} ${look.hi}, 0 0 ${px(L.em * 0.24)} ${look.hi}, 0 0 ${px(L.em * 0.5)} ${look.hi}`;
  boxes.push(...L.boxes.map((bx) => ({ L, i: bx.i, el: h("i.cw-box", { style: { left: pct(bx.cx - bx.w / 2, W), top: pct(bx.cy - bx.h / 2, H), width: pct(bx.w, W), height: pct(bx.h, H), background: look.box.color, opacity: String(look.box.alpha), borderRadius: px(L.em * 0.08) } }) })));
  words.push(...L.placed.map((p) => {
    const bottom = look.anim === "bounce";
    const o = look.outline && !look.hollow ? h("b.cw-o", { style: { color: OUTLINE, textShadow: ring } }, p.text) : null;
    const g = look.glow ? h("b.cw-g", { style: { color: "transparent", textShadow: glow } }, p.text) : null;
    const f = h("b.cw-f", { style: look.hollow ? { color: "transparent", webkitTextStroke: `${px(L.bord)} ${look.color}` } : { color: look.color } }, p.text);
    const k = look.anim === "fill" ? h("b.cw-k", { style: { color: look.hi } }, p.text) : null;
    const el = h("span.cut-word", { style: { left: pct(p.cx - p.w / 2, W), top: pct(p.cy - L.boxH / 2 + L.drop, H), width: pct(p.w, W), height: pct(L.boxH, H), fontSize: px(L.em), lineHeight: String(L.line.box), transformOrigin: bottom ? "50% 100%" : "50% 50%", letterSpacing: look.spacing ? `${look.spacing}em` : "", ...own } }, g, o, f, k);
    return { el, f, k, p, L };
  }));
  }
  const el = h("div.cut-lyric", { dataset: { id: it.id } }, ...boxes.map((b) => b.el), ...words.map((w) => w.el));
  el.addEventListener("pointerdown", (e) => gesture(e, it.id, "move"));
  ed.shell.titles.append(el);
  box = { sig, el, words, boxes, L: layers[0].L };
  player.words.set(it.id, box);
  return box;
}

/** Shows the timeline at a time: every layer at its place in its source, faded, moved, graded; the effects on top of that. */
function show(t) {
  const sh = ed.shell;
  const b = cut.project?.body;
  if (!sh || !b) return;
  const f = frameAt(t);
  const live = new Set();
  for (const p of f.pictures) {
    const it = p.item;
    const s = sourceOf(it.src);
    if (!s?.url && !s?.color) continue;
    const el = layerOf(it, "picture");
    live.add(it.id);
    el.style.opacity = String(p.alpha);
    el.style.zIndex = String(p.z);
    // a clip held on its first frame (the one a whip is coming in with) has not started yet
    const local = p.hold ? 0 : t - p.start;
    const prog = clamp(local / Math.max(0.01, p.len), 0, 1);
    const m = it.motion;
    // in a whip, a clip is moved up or down the frame by a share of its height
    const shift = p.shift ? `translateY(${p.shift * 100}%) ` : "";
    if (m) {
      const z = m.from.scale + (m.to.scale - m.from.scale) * prog;
      const x = m.from.x + (m.to.x - m.from.x) * prog;
      const y = m.from.y + (m.to.y - m.from.y) * prog;
      el.style.transform = `${shift}scale(${z}) translate(${(-x * (z - 1) / (2 * z)) * 100}%, ${(-y * (z - 1) / (2 * z)) * 100}%)`;
    } else el.style.transform = shift.trim();
    el.style.filter = GRADES.find(([g]) => g === it.grade)?.[2] ?? "";
    // a film's frame is filled by its clips when it says so (cover), always by pictures and overlays
    el.classList.toggle("is-fill", !!p.overlay || !!s.still || b.fit === "cover");
    if (el.tagName === "VIDEO") {
      const speed = clamp(Number(it.speed) || 1, 0.25, 4);
      const target = (Number(it.from) || 0) + local * speed;
      el.muted = !!p.mute || it.sound === false;
      el.volume = clamp(Number(it.volume ?? 1), 0, 1) * p.alpha;
      el.playbackRate = speed;
      if (player.playing && !p.hold) {
        if (Math.abs(el.currentTime - target) > 0.25) el.currentTime = target;
        if (el.paused) el.play().catch(() => {});
      } else {
        if (!el.paused) el.pause();
        if (Math.abs(el.currentTime - target) > 0.02) el.currentTime = target;
      }
    }
  }
  // stickers: where they were put, as wide as they were made, turned as they were turned, in their order
  for (const st of f.stickers) {
    const it = st.item;
    if (!sourceOf(it.src)?.url) continue;
    const el = layerOf(it, "sticker");
    live.add(it.id);
    el.style.left = `${clamp(Number(it.x ?? 0.5), -2, 3) * 100}%`;
    el.style.top = `${clamp(Number(it.y ?? 0.5), -2, 3) * 100}%`;
    el.style.width = `${clamp(Number(it.w ?? 0.25), 0.02, 3) * 100}%`;
    el.style.transform = `translate(-50%, -50%) rotate(${Number(it.rot) || 0}deg)`;
    el.style.opacity = String(st.alpha);
    el.style.zIndex = String(100 + (Number(it.z) || 0));
  }
  // the sound the film is kept in step with: the music's, else the first sound playing
  player.master = null;
  for (const s of f.sounds) {
    const it = s.item;
    const el = layerOf(it, "sound");
    live.add(it.id);
    if (!player.master || (s.role === "music" && player.master.role !== "music")) player.master = { el, item: it, start: s.start, role: s.role };
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

  // the beat effects: the picture swells, shakes, turns colour, flashes, as fxAt says (the film is drawn from the same)
  const fx = fxAt(t, b);
  sh.layers.style.transform = fx.zoom !== 1 || fx.dx || fx.dy || fx.rot ? `translate(${fx.dx * 100}%, ${fx.dy * 100}%) rotate(${fx.rot}rad) scale(${fx.zoom})` : "";
  // the colour change is the film's own (chroma turned, light lifted), as a matrix an SVG filter takes; a whip blurs the frame along the way it moves
  const looks = [];
  if (fx.hue || fx.sat !== 1 || fx.bright) {
    sh.matrix.setAttribute("values", colourMatrix(fx).join(" "));
    looks.push("url(#cut-fx)");
  }
  if (f.whip !== undefined) {
    // a box blur of r pixels on the film's frame is a Gaussian of r over root three, at the screen's size
    const high = sh.layers.clientHeight || 640;
    sh.whipBlur.setAttribute("stdDeviation", `0 ${((whipBlur(f.whip, 1280) / 1280) * high) / Math.sqrt(3)}`);
    looks.push("url(#cut-whip)");
  }
  sh.layers.style.filter = looks.join(" ");
  sh.flash.style.opacity = String(fx.flash);
  const beats = beatTimes(b);
  const near = beats.length ? Math.abs(beats[nearestBeat(beats, t)] - t) : 9;
  sh.beat.classList.toggle("is-on", near < 0.07);
  sh.beat.hidden = !beats.length;

  // titles: a plain one is a line of text; a lyric is its words, each as it is sung
  const plain = [];
  const lyricsNow = new Set();
  for (const x of f.titles) {
    const it = x.item;
    if (usesLyricLayout(it)) {
      lyricsNow.add(it.id);
      const box = lyricOf(it, b);
      const rel = t - x.start;
      box.el.hidden = false;
      box.words.forEach((w) => {
        const look = w.L.look;
        const word = w.L.words[w.p.i];
        const state = wordState(look.style, word, rel, x.len, look.anim);
        const e = w.el;
        e.style.visibility = state.show ? "visible" : "hidden";
        e.style.opacity = String(state.alpha);
        const turn = look.tilt ? `rotate(${look.tilt}deg)` : "";
        const grow = state.sx === 1 && state.sy === 1 ? "" : `scale(${state.sx}, ${state.sy})`;
        e.style.transform = `${turn} ${grow}`.trim();
        // (hollow letters have no colour but when lit: the stroke carries it)
        w.f.style.color = state.hi ? look.hi : look.hollow ? "transparent" : look.color;
        if (w.k) w.k.style.clipPath = `inset(0 ${(1 - state.fill) * 100}% 0 0)`;
      });
      // a box behind a row shows from its first word to the end of the line
      box.boxes.forEach((bx) => {
        const look = bx.L.look;
        bx.el.style.visibility = wordState(look.style, bx.L.words[bx.i], rel, x.len, look.anim).show ? "visible" : "hidden";
      });
    } else plain.push(h("div.cut-title", { className: it.style === "lower" ? "is-lower" : "", style: { opacity: String(x.alpha) } }, it.text));
  }
  for (const [id, box] of player.words) {
    // a line off screen is put away; one that is no longer in the edit is forgotten
    if (!lyricsNow.has(id)) box.el.hidden = true;
    if (!findItem(id, b)) (box.el.remove(), player.words.delete(id));
  }
  sh.plain.replaceChildren(...plain);
  sh.empty.hidden = f.pictures.length > 0 || f.titles.length > 0 || f.stickers.length > 0 || !!layout(b).length;
  sh.timecode.textContent = tc(t);
  sh.total.textContent = tc(Math.max(filmLength(b), totalLength(b)));
  movePlayhead(t);
  drawGizmo();
  editor.onTime?.(t);
}

function tick() {
  let t = player.from + (performance.now() - player.t0) / 1000;
  // the time is the sound's own when it is running, so the picture never drifts from what is heard (the clock only starts it)
  const m = player.master;
  if (m && !m.el.paused && m.el.readyState >= 2 && m.el.currentTime > 0.05) {
    const heard = m.el.currentTime - (Number(m.item.from) || 0) + m.start;
    if (Math.abs(heard - t) < 0.4) {
      t = heard;
      player.from = heard;
      player.t0 = performance.now();
    }
  }
  const end = filmLength() || totalLength();
  // a page put away stops its film
  if (!ed.shell?.screen.isConnected || ed.shell.screen.closest("[hidden]")) return stop();
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
  ed.shell.playKey.replaceChildren(icon("pause"));
  ed.shell.screen.classList.add("is-playing");
  document.dispatchEvent(new Event("editor:play"));
  player.raf = requestAnimationFrame(tick);
}
function stop() {
  const was = player.playing;
  player.playing = false;
  cancelAnimationFrame(player.raf);
  for (const el of player.layers.values()) el.pause?.();
  ed.shell?.playKey.replaceChildren(icon("play"));
  ed.shell?.screen.classList.remove("is-playing");
  if (was) document.dispatchEvent(new Event("editor:stop"));
}
function seek(t) {
  if (player.playing) stop();
  cut.playhead = clamp(t, 0, Math.max(0, totalLength()));
  show(cut.playhead);
}
const step = (frames) => seek(cut.playhead + frames / FPS);

function movePlayhead(t = cut.playhead) {
  const sh = ed.shell;
  if (!sh) return;
  sh.playhead.style.transform = `translateX(${t * cut.zoom}px)`;
  // keep it in view while playing
  if (player.playing) {
    const x = t * cut.zoom;
    const box = sh.lanes;
    if (x > box.scrollLeft + box.clientWidth - 80 || x < box.scrollLeft) box.scrollLeft = Math.max(0, x - 120);
  }
}

// ---------------------------------------------------------------- moving what is on the frame

/** The box a selected sticker or lyric line fills on the monitor, as fractions of it: { x, y, w, h, rot } (x, y its middle). */
function boxOf(it, b) {
  if (isPlaced(it)) {
    const img = player.layers.get(it.id);
    const ratio = aspectRatio(b.aspect);
    const nat = img?.naturalWidth ? img.naturalHeight / img.naturalWidth : 1;
    const w = Number(it.w ?? 0.25);
    return { x: Number(it.x ?? 0.5), y: Number(it.y ?? 0.5), w, h: w * nat * ratio, rot: Number(it.rot) || 0 };
  }
  const box = player.words.get(it.id);
  if (!box || !usesLyricLayout(it)) return null;
  const ratio = aspectRatio(b.aspect);
  const W = ratio >= 1 ? 1280 : Math.round(1280 * ratio);
  const H = ratio >= 1 ? Math.round(1280 / ratio) : 1280;
  const widest = Math.max(...box.words.map(({ p }) => p.cx + p.w / 2)) - Math.min(...box.words.map(({ p }) => p.cx - p.w / 2));
  const top = Math.min(...box.words.map(({ p, L }) => p.cy - L.boxH / 2));
  const bottom = Math.max(...box.words.map(({ p, L }) => p.cy + L.boxH / 2));
  const left = Math.min(...box.words.map(({ p }) => p.cx - p.w / 2));
  return { x: (left + widest / 2) / W, y: (top + bottom) / 2 / H, w: widest / W, h: (bottom - top) / H, rot: 0, lyric: true };
}

/** The frame shows where the selected sticker or lyric sits, with handles to move, size and turn it. */
function drawGizmo() {
  const sh = ed.shell;
  const g = sh?.gizmo;
  if (!g) return;
  const b = cut.project?.body;
  const f = cut.selected && b ? findItem(cut.selected, b) : null;
  const box = f && !player.playing ? boxOf(f.item, b) : null;
  const here = f && ((t) => t >= (Number(f.item.start) || 0) && t < (Number(f.item.start) || 0) + (Number(f.item.length) || 3))(cut.playhead);
  g.hidden = !box || !here;
  if (g.hidden) return;
  g.style.left = `${(box.x - box.w / 2) * 100}%`;
  g.style.top = `${(box.y - box.h / 2) * 100}%`;
  g.style.width = `${box.w * 100}%`;
  g.style.height = `${box.h * 100}%`;
  g.style.transform = `rotate(${box.rot}deg)`;
  g.classList.toggle("is-lyric", !!box.lyric);
}

/**
 * Moving, sizing or turning what is on the frame with the pointer: a sticker or a line of lyrics.
 * One gesture is one undo step. `how` is "move", "scale" or "turn".
 */
function gesture(e, id, how) {
  if (e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();
  stop();
  const b = cut.project?.body;
  const f = b && findItem(id, b);
  if (!f) return;
  const it = f.item;
  select(id);
  const rect = ed.shell.screen.getBoundingClientRect();
  const start = { x: Number(it.x ?? 0.5), y: Number(it.y ?? (isPlaced(it) ? 0.5 : 0.74)), w: Number(it.w ?? 0.25), rot: Number(it.rot) || 0, size: Number(it.size ?? 0.09) };
  const box = boxOf(it, b);
  const centre = { x: rect.left + (box?.x ?? start.x) * rect.width, y: rect.top + (box?.y ?? start.y) * rect.height };
  const d0 = Math.hypot(e.clientX - centre.x, e.clientY - centre.y) || 1;
  const x0 = e.clientX;
  const y0 = e.clientY;
  let moved = false;
  const move = (ev) => {
    const dx = (ev.clientX - x0) / rect.width;
    const dy = (ev.clientY - y0) / rect.height;
    if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 3) return;
    moved = true;
    if (how === "move") {
      it.x = Math.round(clamp(start.x + dx, -0.2, 1.2) * 1000) / 1000;
      it.y = Math.round(clamp(start.y + dy, -0.2, 1.2) * 1000) / 1000;
    } else if (how === "scale") {
      const k = (Math.hypot(ev.clientX - centre.x, ev.clientY - centre.y) || 1) / d0;
      if (isPlaced(it)) it.w = Math.round(clamp(start.w * k, 0.03, 2) * 1000) / 1000;
      else it.size = Math.round(clamp(start.size * k, 0.03, 0.25) * 1000) / 1000;
    } else if (how === "turn") {
      let a = (Math.atan2(ev.clientY - centre.y, ev.clientX - centre.x) * 180) / Math.PI + 90;
      a = ((a + 540) % 360) - 180;
      // a quarter or an eighth of a turn pulls the sticker straight
      const near = Math.round(a / 45) * 45;
      if (Math.abs(a - near) < 3) a = near;
      it.rot = Math.round(a * 10) / 10;
    }
    show(cut.playhead);
    document.dispatchEvent(new CustomEvent("editor:live"));
  };
  const up = () => {
    removeEventListener("pointermove", move);
    removeEventListener("pointerup", up);
    if (moved) commit();
    else select(id);
  };
  addEventListener("pointermove", move);
  addEventListener("pointerup", up);
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
export function waveCanvas(it, width) {
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

// ---------------------------------------------------------------- the timeline

/** The zoom at which the whole film fits the timeline's width. */
function fit() {
  const sh = ed.shell;
  if (!sh) return;
  const total = Math.max(filmLength(), totalLength(), 1);
  const room = sh.lanes.clientWidth;
  if (room < 120) return;
  cut.zoom = clamp((room - 28) / total, 8, 200);
  renderTimeline();
}

const thumbs = new Map();
function thumbOf(s, from) {
  const k = `${s.url}#${from.toFixed(1)}`;
  if (!thumbs.has(k)) thumbs.set(k, s.still ? h("img.cut-thumb", { src: s.url, alt: "", draggable: false }) : h("video.cut-thumb", { src: `${s.url}#t=${from + 0.3}`, muted: true, preload: "metadata", draggable: false }));
  return thumbs.get(k);
}

function renderTools() {
  const sh = ed.shell;
  const z = cut.zoom;
  // on Jam the effects and the stickers are bentos of their own, and the first edit is made with the part: the toolbar is the cut's
  const jam = ed.mode === "jam";
  const fxKey = (kind, label) => h("button.ctl-tool.cut-fx-key", { type: "button", title: `${label} on the beat, from the playhead`, "aria-label": label, on: { click: () => addFx(kind) } }, FX_ICON[kind]());
  sh.tools.replaceChildren(
    ...(jam ? [
      h("button.ctl-tool", { type: "button", title: "Undo — Ctrl+Z", "aria-label": "Undo", disabled: !cut.history.length, on: { click: () => undo() } }, sprite("edit-undo")),
      h("button.ctl-tool", { type: "button", title: "Redo — Ctrl+Shift+Z", "aria-label": "Redo", disabled: !cut.future.length, on: { click: () => redo() } }, sprite("edit-redo")),
      h("i.cut-tool-sep"),
    ] : []),
    h("div.cut-tool-group", { role: "group", "aria-label": "Tool" },
      h("button.ctl-tool", { type: "button", "aria-pressed": String(cut.tool === "select"), title: "Select and move — V", "aria-label": "Select", on: { click: () => ((cut.tool = "select"), renderTimeline()) } }, sprite("web-cursor")),
      h("button.ctl-tool", { type: "button", "aria-pressed": String(cut.tool === "blade"), title: "Blade: click a clip to cut it there — B", "aria-label": "Blade", on: { click: () => ((cut.tool = "blade"), renderTimeline()) } }, sprite("edit-scissors"))),
    h("button.ctl-tool", { type: "button", title: "Cut at the playhead — S", "aria-label": "Cut at the playhead", on: { click: () => splitAt(cut.playhead) } }, sprite("edit-playhead")),
    ...(jam ? [h("button.ctl-tool", { type: "button", title: "Take away what is picked — Delete", "aria-label": "Take away", disabled: !cut.selected, on: { click: () => removeItem() } }, icon("trash"))] : []),
    h("button.ctl-tool", { type: "button", title: "A title at the playhead", "aria-label": "Add a title", on: { click: () => addTitle("Title") } }, h("b.cut-t", {}, "T")),
    h("button.ctl-tool", { type: "button", "aria-pressed": String(cut.snap), title: "Snap to the playhead and to clip edges", "aria-label": "Snap", on: { click: () => ((cut.snap = !cut.snap), renderTimeline()) } }, sprite("frame-first")),
    ...(jam ? [] : [
      h("div.cut-tool-group.cut-fx-group", { role: "group", "aria-label": "Beat effects", title: "Effects that fire on the beats" },
        ...FX_KINDS.map(([kind, label]) => fxKey(kind, label))),
      h("button.ctl-tool", { type: "button", "aria-pressed": String(ed.tray), title: "Stickers", "aria-label": "Stickers", on: { click: () => ((ed.tray = !ed.tray), loadStickers(), renderTimeline()) } }, icon("image")),
    ]),
    h("button.ctl-tool", { type: "button", title: "A line of lyrics at the playhead", "aria-label": "Add a line of lyrics", on: { click: () => addLyric("New line") } }, icon("pencil")),
    h("button.ctl-tool.cut-beats-key", { type: "button", title: "The beats: find them, move them, cut on them", "aria-label": "Beats", on: { click: () => (select(null), (cut.beat = null), document.dispatchEvent(new Event("editor:inspect"))) } }, sprite("audio-music"), h("span", {}, "Beats")),
    ...(jam ? [] : [h("button.key.is-sm.cut-draft", { type: "button", disabled: cut.busy.has("draft"), title: "A first edit by the beat, no words needed: cuts on the beat, a zoom on every bar, karaoke lyrics", on: { click: () => draftEdit() } }, sprite("prompt-enhance"), cut.busy.has("draft") ? "Drafting…" : "Draft edit")]),
    h("label.cut-zoom", { title: "Zoom" }, icon("search"), h("input", { type: "range", min: 8, max: 200, step: 1, value: z, "aria-label": "Zoom", on: { input: (e) => ((cut.zoom = Number(e.target.value)), renderTimeline()) } })),
    h("button.ctl-tool", { type: "button", title: "Fit the film in the timeline", "aria-label": "Fit", on: { click: () => fit() } }, icon("expand")),
    h("span.spacer"),
    h("span.cut-total", {}, tc(filmLength())));
  sh.tray.hidden = jam || !ed.tray;
  if (!jam && ed.tray) renderTray();
}

/** The stickers to put on the frame: the library's, and a picture of your own. */
function renderTray() {
  const sh = ed.shell;
  const pick = h("input", { type: "file", accept: "image/png,image/webp,image/gif", hidden: true });
  pick.addEventListener("change", async () => {
    const file = pick.files[0];
    pick.remove();
    if (!file) return;
    try {
      const p = await api.upload(file, file.name.replace(/\.\w+$/, ""));
      addPictureSticker({ ...p, name: file.name.replace(/\.\w+$/, "") });
    } catch (e) {
      document.dispatchEvent(new CustomEvent("editor:error", { detail: e.message }));
    }
  });
  sh.tray.replaceChildren(
    h("div.cut-tray-list", { dataset: { scrollKey: "stickers" } }, ...STICKERS.list.map((s) =>
      h("button.cut-tray-item", { type: "button", title: `${s.name}: put it on the frame`, on: { click: () => addSticker(s.id) } }, h("img", { src: `brand/jam/stickers/${s.file}`, alt: s.name, draggable: false, loading: "lazy" })))),
    h("button.key.is-sm", { type: "button", title: "A PNG of your own, with its own shape", on: { click: () => (document.body.append(pick), pick.click()) } }, icon("upload"), "Your own"),
    ...(STICKERS.list.length ? [] : [h("span.cut-empty", {}, "Loading the stickers…")]));
}

function renderTimeline() {
  const sh = ed.shell;
  const b = cut.project.body;
  const z = cut.zoom;
  const total = Math.max(totalLength() + 8, 30);
  const width = total * z;
  renderTools();
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
  const beats = beatLane(width, total);
  const lanes = b.tracks.map((t) => lane(t, width));
  const label = (t) => (t.id === "fx" ? "Beat FX" : t.name);
  sh.heads.replaceChildren(h("div.cut-head-ruler"), h("div.cut-head-beats", {}, h("b", {}, "♪"), h("span", {}, b.beats?.times?.length ? `${Math.round(b.beats.bpm * 10) / 10} BPM` : "Beats")),
    ...b.tracks.map((t) => h("div.cut-head", { className: `is-${t.kind}${t.main ? " is-main" : ""}${t.mute ? " is-muted" : ""}`, style: laneItems(t).height ? { height: laneItems(t).height } : {} },
      h("b", {}, t.id.toUpperCase()), h("span", {}, label(t)),
      h("button.ctl-mini", { type: "button", "aria-pressed": String(!!t.mute), title: t.mute ? "Turn it back on" : t.kind === "audio" ? "Mute" : "Hide", "aria-label": t.mute ? "Turn it on" : "Turn it off", on: { click: () => toggleTrack(t.id, "mute") } }, t.kind === "audio" ? icon(t.mute ? "mute" : "sound") : sprite("eye")))));
  const scroll = sh.lanes.scrollLeft;
  sh.lanes.replaceChildren(ruler, beats, ...lanes, sh.playhead, sh.marker);
  sh.lanes.scrollLeft = scroll;
  movePlayhead();
}

/** The beats along the ruler: a mark each (the first of a bar taller), one to pick and drag. */
function beatLane(width, total) {
  const b = cut.project.body;
  const z = cut.zoom;
  const el = h("div.cut-beatlane", { style: { width: `${width}px` } });
  const stored = b.beats?.times ?? [];
  const off = b.beats?.offset ?? 0;
  const down = b.beats?.down ?? 0;
  stored.forEach((t0, i) => {
    const t = t0 + off;
    if (t < 0 || t > total) return;
    const bar = (((i - down) % 4) + 4) % 4 === 0;
    el.append(h("i.cut-beat", { className: `${bar ? "is-bar" : ""}${cut.beat === i ? " is-selected" : ""}`, style: { left: `${t * z}px` }, dataset: { beat: String(i) }, title: `Beat ${i + 1} · ${t.toFixed(3)} s${bar ? " · first of a bar" : ""}` }));
  });
  el.addEventListener("pointerdown", (e) => {
    const mark = e.target.closest?.(".cut-beat");
    const box = el.getBoundingClientRect();
    if (!mark) {
      // an empty place on the lane puts the playhead there, like the ruler
      cut.beat = null;
      return seek(clamp((e.clientX - box.left) / z, 0, total));
    }
    e.stopPropagation();
    const i = Number(mark.dataset.beat);
    cut.beat = i;
    select(null);
    renderTimeline();
    // dragged live along the lane; the whole drag is one undo step
    const x0 = e.clientX;
    const t0 = b.beats.times[i];
    let moved = false;
    const drag = (ev) => {
      if (!moved && Math.abs(ev.clientX - x0) < 3) return;
      moved = true;
      b.beats.times[i] = Math.round(Math.max(0, t0 + (ev.clientX - x0) / z) * 1000) / 1000;
      renderTimeline();
      show(cut.playhead);
    };
    const done = () => {
      removeEventListener("pointermove", drag);
      removeEventListener("pointerup", done);
      if (!moved) return;
      const t = b.beats.times[i];
      b.beats.times.sort((a2, z2) => a2 - z2);
      cut.beat = b.beats.times.indexOf(t);
      commit();
    };
    addEventListener("pointermove", drag);
    addEventListener("pointerup", done);
  });
  el.addEventListener("dblclick", (e) => {
    if (e.target.closest?.(".cut-beat") || !b.beats) return;
    addBeatAt(clamp((e.clientX - el.getBoundingClientRect().left) / z, 0, total));
  });
  return el;
}

/** What a lane holds, laid out: its items with their times, and the row each is on (items that overlap go on rows of their own, so none hides another). */
function laneItems(t) {
  const items = t.main ? layout().map((m) => ({ it: m.item, start: m.start, len: m.len, dissolve: m.dissolve })) : t.items.map((it) => ({ it, start: Number(it.start) || 0, len: t.kind === "title" || t.kind === "fx" ? Number(it.length) || 3 : lengthOf(it) }));
  const stacked = !t.main && t.kind !== "audio";
  const ends = [];
  items.forEach((x) => {
    let row = 0;
    if (stacked) {
      row = ends.findIndex((e) => e <= x.start + 1e-6);
      if (row < 0) row = ends.length;
      ends[row] = x.start + x.len;
    }
    x.row = row;
  });
  const rows = Math.max(1, ends.length);
  // a row is as tall as the items in the lane are, and the lane as tall as its rows
  const rowRem = t.kind === "video" ? 2.25 : 1.5;
  return { items, rows, rowRem, height: rows > 1 ? `${rows * rowRem + 0.375}rem` : null };
}

function lane(t, width) {
  const z = cut.zoom;
  const { items, rows, rowRem, height } = laneItems(t);
  const el = h("div.cut-lane", { className: `is-${t.kind}${t.main ? " is-main" : ""}`, style: { width: `${width}px`, ...(height ? { height } : {}) }, dataset: { track: t.id } });
  const body = cut.project.body;
  items.forEach(({ it, start, len, dissolve, row }, i) => {
    const s = sourceOf(it.src);
    const w = Math.max(6, len * z);
    const off = t.kind === "fx" && it.on === false;
    const block = h("div.cut-item", { className: `${cut.selected === it.id ? "is-selected" : ""}${s?.status && s.status !== "done" && it.src?.kind === "take" ? " is-missing" : ""}${t.kind === "fx" ? ` is-fx fx-${it.kind}${off ? " is-off" : ""}` : ""}${it.lyric ? " is-lyric" : ""}${isPlaced(it) ? " is-sticker" : ""}`, style: { left: `${start * z}px`, width: `${w}px`, ...(rows > 1 ? { top: `${0.1875 + row * rowRem}rem`, bottom: "auto", height: `${rowRem - 0.125}rem` } : {}) }, dataset: { id: it.id } },
      t.kind === "video" && s?.url && !isPlaced(it) ? thumbOf(s, Number(it.from) || 0) : null,
      t.kind === "video" && s?.color ? h("i.cut-colour", { style: { background: s.color } }) : null,
      isPlaced(it) && s?.url ? h("img.cut-sticker-thumb", { src: s.url, alt: "", draggable: false }) : null,
      t.kind === "audio" ? waveCanvas(it, w) : null,
      h("span.cut-item-name", {}, t.kind === "title" ? it.text : t.kind === "fx" ? `${FX_KINDS.find(([k]) => k === it.kind)?.[1] ?? it.kind}${off ? " · off" : ""}` : isPlaced(it) ? s?.name ?? "Sticker" : `${t.main ? `${i + 1} · ` : ""}${s?.name ?? it.name ?? ""}`),
      // where an effect fires, and where a word starts, along the item
      ...(t.kind === "fx" && !off ? hitsOf(it, body).filter((h0) => h0 >= start && h0 < start + len).slice(0, 300).map((h0) => h("i.cut-hit", { style: { left: `${(h0 - start) * z}px` } })) : []),
      ...(it.lyric && w > 60 ? wordsOf(it).slice(1).map((wd) => h("i.cut-word-mark", { style: { left: `${wd.from * z}px` } })) : []),
      dissolve ? h("i.cut-dissolve", { style: { width: `${dissolve * z}px` }, title: "Dissolve" }) : null,
      h("i.cut-grip.is-left"), h("i.cut-grip.is-right"));
    block.addEventListener("pointerdown", (e) => drag(e, t, it, start, len, block));
    el.append(block);
    // between two clips of the main track: the join, a cut or a dissolve, one click to change
    if (t.main && i > 0) {
      const join = it.join === "dissolve" || it.join === "whip" ? it.join : "cut";
      const next = { cut: "dissolve", dissolve: "whip", whip: "cut" }[join];
      el.append(h("button.cut-join", { type: "button", className: join === "cut" ? "" : `is-${join}`, dataset: { join }, style: { left: `${start * z}px` }, title: `${{ cut: "Cut", dissolve: "Dissolve", whip: "Whip up" }[join]} — click for ${{ cut: "a cut", dissolve: "a dissolve", whip: "a whip up" }[next]}`, "aria-label": "Join", on: { click: (e) => (e.stopPropagation(), setJoin(it.id, next)) } }));
    }
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
  cut.beat = null;
  const grip = e.target.classList.contains("cut-grip") ? (e.target.classList.contains("is-left") ? "left" : "right") : null;
  const s = sourceOf(it.src);
  const orig = { from: Number(it.from) || 0, to: it.to ?? s?.duration ?? len, start: Number(it.start) || 0, length: Number(it.length) || len, words: it.words ? structuredClone(it.words) : null };
  const speed = Number(it.speed) || 1;
  // items with a start and a length of their own (titles, effects, stickers and pictures off the main track)
  const timed = !t.main && (t.kind === "title" || t.kind === "fx" || s?.still);
  const body = cut.project.body;
  const marks = beatTimes(body);
  const edges = [cut.playhead, ...body.tracks.flatMap((tr) => (tr.main ? layout().flatMap((m) => [m.start, m.end]) : tr.items.filter((x) => x !== it).flatMap((x) => [Number(x.start) || 0, (Number(x.start) || 0) + lengthOf(x)]))), ...marks];
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
    if (grip && timed) {
      if (grip === "right") it.length = Math.max(0.5, snap(orig.start + orig.length + dt) - orig.start);
      else {
        const ns = Math.max(0, snap(orig.start + dt));
        it.length = Math.max(0.5, orig.length - (ns - orig.start));
        // the words of a line are timed from its start: the start moved, they stay where they were sung
        if (it.words?.length) it.words = orig.words.map((w) => ({ ...w, from: Math.max(0, Math.round((w.from - (ns - orig.start)) * 100) / 100), to: Math.max(0.02, Math.round((w.to - (ns - orig.start)) * 100) / 100) }));
        it.start = ns;
      }
    } else if (grip && t.main && s?.still) {
      it.length = Math.max(0.5, orig.length + (grip === "right" ? dt : -dt));
    } else if (grip) {
      if (grip === "left") {
        it.from = clamp(orig.from + dt * speed, 0, orig.to - 0.2);
        if (!t.main) it.start = Math.max(0, snap(orig.start + (it.from - orig.from) / speed));
      } else {
        const end = snap(start + (orig.to - orig.from) / speed + dt);
        const to = clamp(orig.from + (end - start) * speed, orig.from + 0.2, s?.duration ?? orig.to);
        it.to = to >= (s?.duration ?? 0) - 0.05 ? null : to;
      }
    } else if (t.main) {
      // on the main track a clip moves in the order: shown where it would land
      const x = start + len / 2 + dt;
      target = layout().filter((m) => m.item !== it && m.start + m.len / 2 < x).length;
      const order = layout().filter((m) => m.item !== it);
      const left = target < order.length ? order[target].start : order.at(-1)?.end ?? 0;
      ed.shell.marker.hidden = false;
      ed.shell.marker.style.transform = `translateX(${left * z}px)`;
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
    document.dispatchEvent(new CustomEvent("editor:live"));
  };
  const up = () => {
    removeEventListener("pointermove", move);
    removeEventListener("pointerup", up);
    ed.shell.marker.hidden = true;
    if (!moved) return select(it.id);
    if (t.main && !grip && target !== null) return moveMain(it.id, target >= layout().findIndex((m) => m.item === it) ? target + 1 : target);
    if (!t.main && !grip && target) return moveToTrack(it.id, target, it.start);
    commit();
  };
  addEventListener("pointermove", move);
  addEventListener("pointerup", up);
}

// ---------------------------------------------------------------- building the parts

function build() {
  const layers = h("div.cut-layers");
  const flash = h("div.cut-flash");
  const plain = h("div.cut-plain");
  const titles = h("div.cut-titles", {}, plain);
  const empty = h("p.cut-screen-empty", {}, "The film plays here. Add clips from the bin.");
  const beat = h("i.cut-beat-dot", { hidden: true, title: "Lights on every beat" });
  const gizmo = h("div.cut-gizmo", { hidden: true },
    h("i.gz-box"),
    h("i.gz-turn", { title: "Turn" }),
    h("i.gz-scale", { title: "Resize" }));
  gizmo.addEventListener("pointerdown", (e) => {
    const how = e.target.classList.contains("gz-scale") ? "scale" : e.target.classList.contains("gz-turn") ? "turn" : "move";
    if (cut.selected) gesture(e, cut.selected, how);
  });
  // the filter the beat effects' colour change is drawn through (its matrix is set as the film plays)
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.setAttribute("aria-hidden", "true");
  svg.style.position = "absolute";
  const filter = document.createElementNS("http://www.w3.org/2000/svg", "filter");
  filter.setAttribute("id", "cut-fx");
  filter.setAttribute("color-interpolation-filters", "sRGB");
  const matrix = document.createElementNS("http://www.w3.org/2000/svg", "feColorMatrix");
  matrix.setAttribute("type", "matrix");
  matrix.setAttribute("values", colourMatrix().join(" "));
  filter.append(matrix);
  const whipFilter = document.createElementNS("http://www.w3.org/2000/svg", "filter");
  whipFilter.setAttribute("id", "cut-whip");
  whipFilter.setAttribute("color-interpolation-filters", "sRGB");
  whipFilter.setAttribute("y", "-20%");
  whipFilter.setAttribute("height", "140%");
  const whipBlurEl = document.createElementNS("http://www.w3.org/2000/svg", "feGaussianBlur");
  whipBlurEl.setAttribute("stdDeviation", "0 0");
  whipFilter.append(whipBlurEl);
  svg.append(filter, whipFilter);
  const screen = h("div.cut-screen", {}, svg, layers, flash, titles, gizmo, beat, empty);
  const timecode = h("span.cut-timecode", {}, "00:00:00:00");
  const total = h("span.cut-timecode-total", {}, "00:00:00:00");
  const playKey = h("button.cut-play", { type: "button", "aria-label": "Play — Space", title: "Play — Space", on: { click: play } }, icon("play"));
  const loopKey = h("button.ctl-tool", { type: "button", title: "Loop", "aria-label": "Loop", "aria-pressed": "false", on: { click: () => ((player.loop = !player.loop), loopKey.setAttribute("aria-pressed", String(player.loop))) } }, icon("loop"));
  const extras = h("span.cut-transport-extras");
  const stage = h("div.cut-stage", {}, screen);
  const transport = h("div.cut-transport", {}, h("span.cut-times", {}, timecode, total),
    h("div.cut-transport-keys", {},
      h("button.ctl-tool", { type: "button", title: "Back to the start", "aria-label": "Back to the start", on: { click: () => seek(0) } }, sprite("frame-first")),
      h("button.ctl-tool", { type: "button", title: "A frame back — ←", "aria-label": "A frame back", on: { click: () => step(-1) } }, icon("step")),
      playKey,
      h("button.ctl-tool.is-flip", { type: "button", title: "A frame on — →", "aria-label": "A frame on", on: { click: () => step(1) } }, icon("step")),
      loopKey),
    h("span.cut-transport-end", {}, extras, h("button.ctl-tool", { type: "button", title: "Full screen", "aria-label": "Full screen", on: { click: () => screen.requestFullscreen?.() } }, icon("expand"))));
  const tools = h("div.cut-tools");
  const tray = h("div.cut-tray", { hidden: true });
  const heads = h("div.cut-heads");
  const lanesEl = h("div.cut-lanes", { dataset: { scrollKey: "lanes" } });
  const playhead = h("i.cut-playhead");
  const marker = h("i.cut-marker", { hidden: true });
  const timeline = h("section.cut-timeline", {}, tools, tray, h("div.cut-tracks", {}, heads, h("div.cut-lanes-wrap", {}, lanesEl)));
  const inspector = h("aside.cut-inspector");
  lanesEl.addEventListener("wheel", (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    cut.zoom = clamp(cut.zoom * (e.deltaY < 0 ? 1.15 : 0.87), 8, 200);
    renderTimeline();
  }, { passive: false });
  // a click on an empty lane: nothing selected, the playhead there
  lanesEl.addEventListener("pointerdown", (e) => {
    if (e.target.classList.contains("cut-lane")) {
      seek((e.clientX - e.target.getBoundingClientRect().left) / cut.zoom);
      select(null);
    }
  });
  // a click on the empty frame lets go of what was picked
  screen.addEventListener("pointerdown", (e) => {
    if (e.target === screen || e.target === layers || e.target.classList.contains("cut-layer")) select(null);
  });
  ed.shell = { screen, layers, flash, matrix, whipBlur: whipBlurEl, titles, plain, gizmo, beat, empty, timecode, total, playKey, tools, tray, heads, lanes: lanesEl, playhead, marker, inspector, extras };
  ed.parts = { stage, transport, timeline, inspector, extras };
}

/** The parts of the editor, for a page to put where it likes. */
export function editorParts() {
  if (!ed.parts) build();
  loadStickers();
  return ed.parts;
}

/** Draws the open edit into the parts. `mode` is the page's: "cut" or "jam" (the inspector shows less of the edit's own). */
export function drawEditor(mode = "cut") {
  if (!ed.shell || !cut.project) return;
  const sh = ed.shell;
  if (ed.mode !== mode || ed.project !== cut.project.id) {
    ed.project = cut.project.id;
    ed.mode = mode;
    // a film opens fitting its timeline, in Jam (a few seconds' room) and Cut alike
    if (mode === "jam") queueMicrotask(() => (cut.zoom === 48 || cut.fitFor !== ed.project) && ((cut.fitFor = ed.project), fit()));
  }
  const ratio = { "16:9": "16 / 9", "9:16": "9 / 16", "1:1": "1 / 1" }[cut.project.body.aspect] ?? "16 / 9";
  sh.screen.style.aspectRatio = ratio;
  renderInspector(sh.inspector, { mode, show: () => show(cut.playhead), seek, redraw: () => drawEditor(mode) });
  renderTimeline();
  show(cut.playhead);
}

// keys on the page: Space plays, S cuts, V and B pick a tool, Delete removes
document.addEventListener("keydown", (e) => {
  const page = document.body.dataset.page;
  if ((page !== "cut" && page !== "jam") || !cut.project || document.body.classList.contains("has-window") || document.body.classList.contains("has-jam-window") || !ed.shell) return;
  if (e.target.closest?.("input, textarea, select, [contenteditable]")) return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === "z") return e.preventDefault(), e.shiftKey ? redo() : undo();
  if ((e.ctrlKey || e.metaKey) && k === "y") return e.preventDefault(), redo();
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (k === " ") return e.preventDefault(), play();
  if (k === "arrowleft") return e.preventDefault(), step(e.shiftKey ? -FPS : -1);
  if (k === "arrowright") return e.preventDefault(), step(e.shiftKey ? FPS : 1);
  if (k === "s") return splitAt(cut.playhead);
  if (k === "b") return (cut.tool = "blade"), renderTimeline();
  if (k === "v") return (cut.tool = "select"), renderTimeline();
  if (k === "delete" || k === "backspace") return cut.beat !== null && !cut.selected ? removeBeat() : removeItem();
  if (k === "escape") return select(null);
  if (k === "home") return seek(0);
});
