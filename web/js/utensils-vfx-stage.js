// The VFX workbench's stage: the clip in a frame the shape of the clip, with its transport and a strip of its frames, and over the
// picture whatever the tool needs: a colour picked with a click (the green of a screen), a mask painted with a brush, an eraser
// or a lasso (a spot to remove), or one real frame of what an effect would make. Made once and kept by the workspace: a clip that
// plays must not be made again at each redraw, so the stage lives on and the controls are drawn again around it.
import { h, icon, sprite } from "./dom.js";
import { clock } from "./utensils-fx-controls.js";

const thumbsOf = new Map();
/** A clip's frames as small pictures, taken one after another by seeking a clip that is not shown. Cached by the clip's address. */
function frames(url, n = 12, height = 56) {
  if (!thumbsOf.has(url)) {
    thumbsOf.set(url, new Promise((done) => {
      const v = document.createElement("video");
      v.muted = true;
      v.preload = "auto";
      v.src = url;
      v.addEventListener("error", () => done({ list: [], w: 0 }), { once: true });
      v.addEventListener("loadedmetadata", async () => {
        const w = Math.max(16, Math.round(height * (v.videoWidth / Math.max(1, v.videoHeight))));
        const c = document.createElement("canvas");
        c.width = w;
        c.height = height;
        const g = c.getContext("2d");
        const list = [];
        for (let i = 0; i < n; i++) {
          v.currentTime = Math.min(Math.max(0, v.duration - 0.05), (v.duration * (i + 0.5)) / n);
          await new Promise((r) => (v.addEventListener("seeked", r, { once: true }), setTimeout(r, 1500)));
          g.drawImage(v, 0, 0, w, height);
          list.push(c.toDataURL("image/jpeg", 0.72));
        }
        done({ list, w });
      }, { once: true });
    }));
  }
  return thumbsOf.get(url);
}

const hex2 = (n) => Math.round(n).toString(16).padStart(2, "0");

/**
 * The stage. `on` takes { time(t), pick(hex), mask(hasMask) }: what happened on it. Answers { el, ... } with the calls the workspace
 * makes: setClip, setMode, setBrush, clearMask, hasMask, maskPNG, showShot, time, seek.
 */
export function createStage(on = {}) {
  const st = { url: null, w: 1280, h: 704, duration: 0, mode: "view", brush: "brush", size: 60, shot: null, lasso: null, drawing: false, last: null };
  const video = h("video.uv-video", { playsInline: true, loop: true, muted: true, preload: "auto", disablePictureInPicture: true });
  const shot = h("img.uv-shot", { alt: "", hidden: true, draggable: false });
  const still = h("img.uv-still", { alt: "", hidden: true, draggable: false });
  const view = h("canvas.uv-mask");
  const paint = document.createElement("canvas");
  const box = h("div.uv-frame", {}, video, still, shot, view, h("span.uv-hint", { hidden: true }));
  const hint = box.querySelector(".uv-hint");
  const play = h("button.ut-iconkey.uv-play", { type: "button", title: "Play or pause", "aria-label": "Play or pause", on: { click: () => (video.paused ? video.play() : video.pause()) } }, sprite("tool-fx-play"));
  const seekbar = h("input.uf-range.uv-seek", { type: "range", min: 0, max: 1000, step: 1, value: 0, "aria-label": "Where in the clip" });
  const stamp = h("span.uv-time", {}, "0:00 / 0:00");
  const head = h("i.uv-head");
  const strip = h("div.uv-strip", {}, head);
  const stagebox = h("div.uv-stagebox", {}, box);
  const keys = h("div.uv-keys");
  const el = h("div.uv-stage", { dataset: { mode: "view" } }, stagebox, keys, h("div.uv-bar", {}, play, seekbar, stamp), strip);

  const sizeBox = () => (box.style.setProperty("--ar", `${st.w} / ${st.h}`), box.style.setProperty("--arn", String(st.w / Math.max(1, st.h))));
  const refresh = () => {
    const d = video.duration || st.duration || 0;
    stamp.textContent = `${clock(video.currentTime)} / ${clock(d)}`;
    const f = d ? video.currentTime / d : 0;
    seekbar.value = String(Math.round(f * 1000));
    seekbar.style.setProperty("--fill", `${f * 100}%`);
    head.style.left = `${f * 100}%`;
  };
  video.addEventListener("timeupdate", () => (refresh(), on.time?.(video.currentTime)));
  video.addEventListener("loadedmetadata", () => {
    st.duration = video.duration;
    st.w = video.videoWidth || st.w;
    st.h = video.videoHeight || st.h;
    sizeBox();
    resetMask();
    refresh();
  });
  video.addEventListener("play", () => play.replaceChildren(icon("pause")));
  video.addEventListener("pause", () => play.replaceChildren(sprite("tool-fx-play")));
  seekbar.addEventListener("input", () => {
    if (video.duration) video.currentTime = (Number(seekbar.value) / 1000) * video.duration;
    refresh();
  });

  // ---- the mask: painted on a canvas as big as the clip, shown over it in yellow
  function resetMask() {
    paint.width = view.width = st.w;
    paint.height = view.height = st.h;
    showMask();
    on.mask?.(false);
  }
  function showMask() {
    const g = view.getContext("2d");
    g.clearRect(0, 0, view.width, view.height);
    g.globalCompositeOperation = "source-over";
    g.drawImage(paint, 0, 0);
    g.globalCompositeOperation = "source-in";
    g.fillStyle = "rgba(242, 255, 89, .58)";
    g.fillRect(0, 0, view.width, view.height);
    g.globalCompositeOperation = "source-over";
    if (st.lasso?.length > 1) {
      g.strokeStyle = "#F2FF59";
      g.lineWidth = Math.max(2, view.width / 480);
      g.setLineDash([view.width / 120, view.width / 160]);
      g.beginPath();
      st.lasso.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.stroke();
      g.setLineDash([]);
    }
  }
  const at = (e) => {
    const r = view.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * view.width, ((e.clientY - r.top) / r.height) * view.height];
  };
  const width = () => Math.max(2, (st.size * view.width) / 1280);
  let hasPaint = false;
  function stroke(a, b) {
    const g = paint.getContext("2d");
    g.lineCap = g.lineJoin = "round";
    g.lineWidth = width();
    g.globalCompositeOperation = st.brush === "eraser" ? "destination-out" : "source-over";
    g.strokeStyle = g.fillStyle = "#fff";
    g.beginPath();
    g.moveTo(...a);
    g.lineTo(...b);
    g.stroke();
    if (a[0] === b[0] && a[1] === b[1]) {
      g.beginPath();
      g.arc(a[0], a[1], width() / 2, 0, Math.PI * 2);
      g.fill();
    }
  }
  const painted = () => {
    const d = paint.getContext("2d").getImageData(0, 0, paint.width, paint.height).data;
    for (let i = 3; i < d.length; i += 4 * 61) if (d[i] > 10) return true;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 10) return true;
    return false;
  };
  view.addEventListener("pointerdown", (e) => {
    if (st.mode === "pick") return pickAt(e);
    if (st.mode !== "mask") return;
    view.setPointerCapture(e.pointerId);
    st.drawing = true;
    const p = at(e);
    if (st.brush === "lasso") st.lasso = [p];
    else (stroke(p, p), (st.last = p), showMask());
  });
  view.addEventListener("pointermove", (e) => {
    if (!st.drawing) return;
    const p = at(e);
    if (st.brush === "lasso") st.lasso.push(p);
    else (stroke(st.last, p), (st.last = p));
    showMask();
  });
  const end = () => {
    if (!st.drawing) return;
    st.drawing = false;
    if (st.brush === "lasso" && st.lasso?.length > 2) {
      const g = paint.getContext("2d");
      g.globalCompositeOperation = "source-over";
      g.fillStyle = "#fff";
      g.beginPath();
      st.lasso.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath();
      g.fill();
    }
    st.lasso = null;
    st.last = null;
    hasPaint = painted();
    showMask();
    on.mask?.(hasPaint);
  };
  view.addEventListener("pointerup", end);
  view.addEventListener("pointercancel", end);

  // ---- a colour taken from the picture
  function pickAt(e) {
    const c = document.createElement("canvas");
    c.width = video.videoWidth || st.w;
    c.height = video.videoHeight || st.h;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(shot.hidden ? video : shot, 0, 0, c.width, c.height);
    const [x, y] = at(e);
    const px = Math.max(0, Math.min(c.width - 5, Math.round(x) - 2));
    const py = Math.max(0, Math.min(c.height - 5, Math.round(y) - 2));
    let data;
    try {
      data = g.getImageData(px, py, 5, 5).data;
    } catch {
      return;
    }
    let r = 0, gr = 0, b = 0;
    for (let i = 0; i < data.length; i += 4) (r += data[i], (gr += data[i + 1]), (b += data[i + 2]));
    const n = data.length / 4;
    on.pick?.(`#${hex2(r / n)}${hex2(gr / n)}${hex2(b / n)}`.toUpperCase());
  }

  // ---- the strip of frames under the bar
  async function strips(url) {
    strip.querySelectorAll("img").forEach((i) => i.remove());
    const { list, w } = await frames(url);
    if (st.url !== url) return;
    list.forEach((src, i) => strip.insertBefore(h("img", { src, alt: "", draggable: false, style: { width: `${100 / list.length}%` }, title: `${clock(((i + 0.5) / list.length) * (video.duration || st.duration))}` }), head));
    void w;
  }
  strip.addEventListener("pointerdown", (e) => {
    const r = strip.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    if (video.duration) video.currentTime = f * video.duration;
    const move = (ev) => {
      const g = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
      if (video.duration) video.currentTime = g * video.duration;
    };
    strip.setPointerCapture(e.pointerId);
    strip.addEventListener("pointermove", move);
    strip.addEventListener("pointerup", () => strip.removeEventListener("pointermove", move), { once: true });
  });

  const api = {
    el,
    video,
    /** Puts a clip on the stage ({ url, width, height, duration }); the same clip again changes nothing. */
    setClip(clip) {
      el.dataset.media = "video";
      still.hidden = true;
      video.hidden = false;
      st.pic = null;
      if (!clip?.url) {
        if (st.url) {
          video.removeAttribute("src");
          video.load();
          st.url = null;
          strip.querySelectorAll("img").forEach((i) => i.remove());
        }
        return;
      }
      if (st.url === clip.url) return;
      st.url = clip.url;
      st.w = clip.width || st.w;
      st.h = clip.height || st.h;
      st.duration = clip.duration || 0;
      sizeBox();
      video.src = clip.url;
      resetMask();
      strips(clip.url);
    },
    /** A picture on the stage instead of a clip (a relight and a retouch work on one): { url, width, height }, or null for nothing. */
    setPicture(pic) {
      if (!pic?.url) return api.setClip(null);
      if (st.pic === pic.url) return;
      video.pause();
      video.hidden = true;
      el.dataset.media = "image";
      st.pic = pic.url;
      st.url = null;
      st.w = pic.width || st.w;
      st.h = pic.height || st.h;
      sizeBox();
      still.src = pic.url;
      still.hidden = false;
      resetMask();
    },
    /** What the pointer does on the picture: view, pick a colour, or paint the mask. */
    setMode(mode, text = "") {
      st.mode = mode;
      el.dataset.mode = mode;
      hint.hidden = !text;
      hint.textContent = text;
      if (mode === "mask") video.pause();
    },
    setBrush({ tool, size }) {
      if (tool) st.brush = tool;
      if (size) st.size = size;
    },
    clearMask() {
      paint.getContext("2d").clearRect(0, 0, paint.width, paint.height);
      hasPaint = false;
      showMask();
      on.mask?.(false);
    },
    hasMask: () => hasPaint,
    /** The mask as a PNG picture as big as the clip: white where it was painted, black elsewhere. */
    maskPNG() {
      const c = document.createElement("canvas");
      c.width = paint.width;
      c.height = paint.height;
      const g = c.getContext("2d");
      g.fillStyle = "#000";
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(paint, 0, 0);
      return c.toDataURL("image/png");
    },
    /** One real frame of what an effect would make, over the clip; null puts the clip back. */
    showShot(url, back) {
      shot.hidden = !url;
      if (url) shot.src = url;
      keys.replaceChildren(...(url ? [h("button.ut-ghost.uv-back", { type: "button", on: { click: back } }, icon("close"), "Back to the clip")] : []));
    },
    time: () => video.currentTime || 0,
    seek(t) {
      if (video.duration) video.currentTime = Math.max(0, Math.min(video.duration, t));
    },
    get playing() {
      return !video.paused;
    },
    pause: () => video.pause(),
  };
  return api;
}
