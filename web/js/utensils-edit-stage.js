// The Edit workspace's stage: the clip on show, what a tool draws on it (the crop frame of a reframe that is dragged, the logo
// where it will sit, the caption that is on screen), one frame of the real result when asked for, the result itself, and under
// it the transport and the timeline: the clip's thumbnails with the range a tool keeps (handles to drag) and the playhead.
// It is made once and kept (the video that plays must not be made again at each redraw): the workspace tells it what is on with
// sync(), and it tells the workspace what was done with the callbacks it was made with.
import { h, icon } from "./dom.js";
import { reframeBox } from "./utensils-edit-geometry.js";
import { editStrip } from "./utensils-edit-api.js";

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
/** Seconds as 0:03.2 (tenths: a cut is placed by them). */
export const stamp = (s) => `${Math.floor(Math.max(0, s) / 60)}:${(Math.max(0, s) % 60).toFixed(1).padStart(4, "0")}`;

/** The tools that keep a range of the clip (the timeline shows its handles): the settings that hold its start and end. */
export const RANGED = { trim: true, logo: true, gif: (p) => p.mode === "gif" };

/**
 * The stage. `on` takes: pick() (the clip is asked for), range(patch, quiet) (a handle moved), crop(patch, quiet) (the crop frame
 * moved), time(t) (the playhead was put somewhere), open(result) (hand the result on). Answers { el, sync, time, seek, el }.
 */
export function createStage(on) {
  const video = h("video.ue-video", { playsInline: true, preload: "auto", loop: false });
  const cropBox = h("div.ue-crop", {}, h("span.ue-crop-label"));
  const ghostLogo = h("img.ue-ghost-logo", { alt: "", draggable: false });
  const ghostCaption = h("div.ue-ghost-caption");
  const frame = h("div.ue-frame", {}, video, cropBox, ghostLogo, ghostCaption);
  const prevImg = h("img.ue-prev", { alt: "", draggable: false });
  const prevWrap = h("div.ue-prevwrap", {}, prevImg, h("span.ue-prev-chip"));
  const resultWrap = h("div.ue-resultwrap");
  const dropTitle = h("b", {}, "Drop a clip");
  const drop = h("button.ue-drop", { type: "button", on: { click: () => on.pick() } }, icon("video"), dropTitle, h("span", {}, "or paste it, or click to pick"));
  const views = h("div.ut-segs.ue-views", { role: "group", "aria-label": "What is shown" });
  const keys = h("div.ue-keys");
  const view = h("div.ue-view", {}, frame, prevWrap, resultWrap, drop, views, keys);

  const playBtn = h("button.ut-iconkey.ue-play", { type: "button", title: "Play or pause (Space)", "aria-label": "Play or pause", on: { click: () => toggle() } }, icon("play"));
  const readout = h("span.ue-readout", {}, "0:00.0 / 0:00.0");
  const muteBtn = h("button.ut-iconkey.is-quiet", { type: "button", title: "Sound on or off", "aria-label": "Sound on or off", on: { click: () => ((video.muted = !video.muted), muteBtn.replaceChildren(icon(video.muted ? "mute" : "sound"))) } }, icon("sound"));
  const transport = h("div.ue-transport", {}, playBtn, readout, h("span.spacer"), muteBtn);

  const strip = h("div.ue-strip");
  const dimIn = h("i.ue-dim.is-in");
  const dimOut = h("i.ue-dim.is-out");
  const range = h("div.ue-range", {}, h("span.ue-handle.is-in", { title: "Start (drag)", "aria-label": "Start", role: "slider" }), h("span.ue-handle.is-out", { title: "End (drag)", "aria-label": "End", role: "slider" }));
  const head = h("i.ue-playhead");
  const ruler = h("div.ue-ruler");
  const timeline = h("div.ue-timeline", {}, ruler, h("div.ue-strip-wrap", {}, strip, dimIn, dimOut, range, head));
  const el = h("div.ue-stage", {}, view, transport, timeline);

  // what is on show now (sync() sets it)
  const s = { ctx: null, file: null, dur: 0, stripKey: "", raf: 0 };
  const dur = () => s.dur || video.duration || 0;
  const seek = (t) => {
    video.currentTime = clamp(t, 0, Math.max(0, dur() - 0.02));
    place();
  };
  const toggle = () => {
    if (!s.file) return on.pick();
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  };
  const bounds = () => {
    const p = s.ctx?.params ?? {};
    const d = dur();
    const a = clamp(Number(p.start) || 0, 0, d);
    const b = Number(p.end) > a ? clamp(Number(p.end), 0, d) : d;
    return [a, b];
  };

  // the playhead and the readout follow the video
  function place() {
    const d = dur();
    head.style.left = d ? `${(video.currentTime / d) * 100}%` : "0%";
    readout.textContent = `${stamp(video.currentTime)} / ${stamp(d)}`;
    drawCaption();
  }
  function tick() {
    place();
    const ranged = s.ctx && RANGED[s.ctx.key] && (RANGED[s.ctx.key] === true || RANGED[s.ctx.key](s.ctx.params));
    if (ranged && !video.paused) {
      const [a, b] = bounds();
      if (video.currentTime >= b - 0.03 || video.currentTime < a - 0.1) video.currentTime = a;
    }
    s.raf = video.paused ? 0 : requestAnimationFrame(tick);
  }
  video.addEventListener("play", () => {
    on.play?.();
    playBtn.replaceChildren(icon("pause"));
    cancelAnimationFrame(s.raf);
    s.raf = requestAnimationFrame(tick);
  });
  video.addEventListener("pause", () => (playBtn.replaceChildren(icon("play")), place(), on.time(video.currentTime)));
  video.addEventListener("seeked", () => (place(), on.time(video.currentTime)));
  video.addEventListener("timeupdate", place);
  video.addEventListener("loadedmetadata", () => {
    if (!s.dur && video.duration && Number.isFinite(video.duration)) s.dur = video.duration;
    place();
    layout();
  });
  video.addEventListener("click", () => toggle());

  // ---- the timeline: its thumbnails, its range, the playhead dragged
  const timeAt = (e) => {
    const r = strip.getBoundingClientRect();
    return clamp((e.clientX - r.left) / r.width, 0, 1) * dur();
  };
  strip.addEventListener("pointerdown", (e) => {
    if (!s.file) return;
    video.pause();
    seek(timeAt(e));
    strip.setPointerCapture(e.pointerId);
    const move = (ev) => seek(timeAt(ev));
    strip.addEventListener("pointermove", move);
    strip.addEventListener("pointerup", () => strip.removeEventListener("pointermove", move), { once: true });
  });
  for (const which of ["in", "out"]) {
    const handle = range.querySelector(`.is-${which}`);
    handle.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      video.pause();
      handle.setPointerCapture(e.pointerId);
      const minGap = 0.2;
      let patch = {};
      const move = (ev) => {
        const [a, b] = bounds();
        const t = timeAt(ev);
        patch = which === "in" ? { start: Math.round(clamp(t, 0, b - minGap) * 100) / 100, end: b } : { end: Math.round(clamp(t, a + minGap, dur()) * 100) / 100 };
        Object.assign(s.ctx.params, patch);
        layout();
        seek(which === "in" ? patch.start : patch.end - 0.05);
        on.range(patch, true);
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", () => (handle.removeEventListener("pointermove", move), on.range(patch, false)), { once: true });
    });
  }
  // the arrow keys step the playhead a frame (shift: a second) when the timeline has the focus
  strip.tabIndex = 0;
  strip.addEventListener("keydown", (e) => {
    const step = e.shiftKey ? 1 : 1 / 24;
    if (e.key === "ArrowLeft") (e.preventDefault(), video.pause(), seek(video.currentTime - step));
    else if (e.key === "ArrowRight") (e.preventDefault(), video.pause(), seek(video.currentTime + step));
    else if (e.key === " ") (e.preventDefault(), toggle());
  });

  /** The range's place on the timeline, and the ruler's marks. */
  function layout() {
    const d = dur();
    const ranged = s.ctx && RANGED[s.ctx.key] && (RANGED[s.ctx.key] === true || RANGED[s.ctx.key](s.ctx.params));
    el.classList.toggle("has-range", !!ranged);
    if (d && ranged) {
      const [a, b] = bounds();
      range.style.left = `${(a / d) * 100}%`;
      range.style.right = `${100 - (b / d) * 100}%`;
      dimIn.style.width = `${(a / d) * 100}%`;
      dimOut.style.width = `${100 - (b / d) * 100}%`;
    }
    const marks = [];
    if (d) {
      const step = d > 120 ? 30 : d > 40 ? 10 : d > 16 ? 5 : d > 6 ? 2 : 1;
      for (let t = 0; t <= d + 0.001; t += step) marks.push(h("span", { style: { left: `${(t / d) * 100}%` } }, `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, "0")}`));
    }
    ruler.replaceChildren(...marks);
  }

  /** The thumbnails: the clip's strip, as many frames as the timeline holds. */
  async function thumbs() {
    if (!s.file) return void (strip.style.backgroundImage = "");
    const w = strip.clientWidth || 600;
    const hgt = strip.clientHeight || 72;
    const aspect = (s.ctx.clip.width || 16) / (s.ctx.clip.height || 9);
    const n = clamp(Math.round(w / (hgt * aspect)), 4, 24);
    const key = `${s.file}:${n}`;
    if (key === s.stripKey) return;
    s.stripKey = key;
    try {
      const out = await editStrip(s.file, n);
      if (s.stripKey === key) strip.style.backgroundImage = `url("${out.url}")`;
    } catch {
      strip.style.backgroundImage = "";
    }
  }
  new ResizeObserver(() => thumbs()).observe(strip);

  // ---- what a tool draws on the picture
  function drawCrop() {
    const c = s.ctx;
    const on_ = c?.key === "reframe" && c.params.fill === "fill" && c.clip && c.view === "source" && !c.preview?.url;
    cropBox.hidden = !on_;
    if (!on_) return;
    const W = c.clip.width;
    const H = c.clip.height;
    const b = reframeBox({ width: W, height: H }, c.params.format, c.params.zoom, c.params.x, c.params.y);
    cropBox.style.left = `${(b.x / W) * 100}%`;
    cropBox.style.top = `${(b.y / H) * 100}%`;
    cropBox.style.width = `${(b.cw / W) * 100}%`;
    cropBox.style.height = `${(b.ch / H) * 100}%`;
    cropBox.querySelector(".ue-crop-label").textContent = `${c.params.format} · ${b.w} × ${b.h}`;
    cropBox.dataset.room = `${W - b.cw}:${H - b.ch}`;
  }
  cropBox.addEventListener("pointerdown", (e) => {
    const c = s.ctx;
    if (!c?.clip) return;
    e.preventDefault();
    cropBox.setPointerCapture(e.pointerId);
    const r = frame.getBoundingClientRect();
    const W = c.clip.width;
    const H = c.clip.height;
    const b0 = reframeBox({ width: W, height: H }, c.params.format, c.params.zoom, c.params.x, c.params.y);
    const roomX = W - b0.cw;
    const roomY = H - b0.ch;
    const from = { x: e.clientX, y: e.clientY, px: roomX ? b0.x / roomX : 0.5, py: roomY ? b0.y / roomY : 0.5 };
    let patch = {};
    const move = (ev) => {
      const dx = ((ev.clientX - from.x) / r.width) * W;
      const dy = ((ev.clientY - from.y) / r.height) * H;
      patch = { x: roomX ? Math.round(clamp(from.px + dx / roomX, 0, 1) * 1000) / 1000 : 0.5, y: roomY ? Math.round(clamp(from.py + dy / roomY, 0, 1) * 1000) / 1000 : 0.5 };
      Object.assign(c.params, patch);
      drawCrop();
      on.crop(patch, true);
    };
    cropBox.addEventListener("pointermove", move);
    cropBox.addEventListener("pointerup", () => (cropBox.removeEventListener("pointermove", move), on.crop(patch, false)), { once: true });
  });

  function drawLogo() {
    const c = s.ctx;
    const show = c?.key === "logo" && c.image && c.clip && c.view === "source" && !c.preview?.url;
    ghostLogo.hidden = !show;
    if (!show) return;
    const p = c.params;
    if (ghostLogo.getAttribute("src") !== c.image.url) ghostLogo.src = c.image.url;
    const m = `${p.margin}cqw`;
    Object.assign(ghostLogo.style, { width: `${p.scale}cqw`, opacity: String(p.opacity), left: "", right: "", top: "", bottom: "", transform: "" });
    const at = { tl: { left: m, top: m }, tr: { right: m, top: m }, bl: { left: m, bottom: m }, br: { right: m, bottom: m }, centre: { left: "50%", top: "50%", transform: "translate(-50%, -50%)" } }[p.corner] ?? { right: m, bottom: m };
    Object.assign(ghostLogo.style, at);
  }

  function drawCaption() {
    const c = s.ctx;
    const show = c?.key === "captions" && c.clip && c.view === "source" && !c.preview?.url;
    if (!show) return void (ghostCaption.hidden = true);
    const p = c.params;
    const t = video.currentTime;
    const cue = p.cues.find((x) => t >= x.start && t < x.end);
    ghostCaption.hidden = !cue;
    if (!cue) return;
    ghostCaption.textContent = p.caps ? cue.text.toUpperCase() : cue.text;
    ghostCaption.dataset.style = p.style;
    ghostCaption.dataset.position = p.position;
    ghostCaption.dataset.font = p.font;
    ghostCaption.style.setProperty("--cap-size", `${(p.size * c.clip.height) / c.clip.width}cqw`);
    ghostCaption.style.setProperty("--cap-colour", p.colour);
  }

  // ---- the result, and the one frame of it
  const made = new Map();
  function resultNode(r) {
    if (!made.has(r.url)) {
      made.set(r.url, r.kind === "video" ? h("video.ue-result-media", { src: r.url, controls: true, loop: true, playsInline: true, preload: "metadata" })
        : r.kind === "audio" ? h("div.ue-result-audio", {}, icon("sound"), h("audio", { src: r.url, controls: true }))
        : h("img.ue-result-media", { src: r.url, alt: "", draggable: false }));
    }
    return made.get(r.url);
  }

  /** Puts on show what the workspace says is on: the clip, the tool's drawings, the preview, the result, and the keys over them. */
  function sync(ctx) {
    s.ctx = ctx;
    const file = ctx.clip?.file ?? null;
    if (file !== s.file) {
      s.file = file;
      s.dur = Number(ctx.clip?.duration) || 0;
      s.stripKey = "";
      if (file) {
        video.src = ctx.clip.url;
        video.currentTime = 0;
        frame.style.setProperty("--ar", String((ctx.clip.width || 16) / (ctx.clip.height || 9)));
      } else {
        video.removeAttribute("src");
        video.load();
      }
    } else if (file) {
      s.dur ||= Number(ctx.clip.duration) || 0;
      frame.style.setProperty("--ar", String((ctx.clip.width || 16) / (ctx.clip.height || 9)));
    }
    const showResult = ctx.view === "result" && ctx.result;
    el.classList.toggle("is-result", !!showResult);
    el.classList.toggle("has-clip", !!file);
    frame.hidden = !file || !!showResult;
    drop.hidden = !!file || !!showResult;
    dropTitle.textContent = ctx.key === "merge" ? "Drop the clips" : "Drop a clip";
    prevWrap.hidden = !(ctx.preview?.url && file && !showResult);
    if (ctx.preview?.url) {
      prevImg.src = ctx.preview.url;
      prevWrap.querySelector(".ue-prev-chip").textContent = `Preview · ${stamp(ctx.preview.at ?? 0)}`;
    }
    if (showResult) {
      video.pause();
      const node = resultNode(ctx.result);
      if (resultWrap.firstChild !== node) resultWrap.replaceChildren(node);
    }
    resultWrap.hidden = !showResult;
    // the views: the clip, and the result when there is one
    views.hidden = !ctx.result;
    views.replaceChildren(
      h("button.ut-seg", { type: "button", "aria-pressed": String(!showResult), on: { click: () => ctx.setView("source") } }, "Source"),
      h("button.ut-seg", { type: "button", "aria-pressed": String(!!showResult), on: { click: () => ctx.setView("result") } }, "Result"));
    // the keys: the real frame (for the tools that can show it), and the result's own
    const out = [];
    if (ctx.canPreview && file && !showResult) {
      out.push(h("button.ut-iconkey.is-over", { type: "button", title: ctx.preview?.on ? "Back to the clip" : "Show one frame of the result", "aria-label": "Preview", "aria-pressed": String(!!ctx.preview?.on), on: { click: () => ctx.togglePreview() } }, icon(ctx.preview?.on ? "open" : "sparkle")));
    }
    if (showResult) {
      const r = ctx.result;
      out.push(h("a.ut-iconkey.is-over", { href: `${r.url}?download=${r.url.split("/").pop()}`, download: r.url.split("/").pop(), title: "Download", "aria-label": "Download" }, icon("download")));
      if (r.kind === "video" && r.file && r.url.startsWith("/media/videos/")) out.push(h("button.ut-iconkey.is-over", { type: "button", title: "Use it as the clip to work on", "aria-label": "Use as the clip", on: { click: () => on.open(r) } }, icon("remix")));
    }
    keys.replaceChildren(...out);
    keys.classList.toggle("is-loading", !!ctx.preview?.busy);
    layout();
    drawCrop();
    drawLogo();
    drawCaption();
    place();
    thumbs();
  }

  return { el, sync, seek, time: () => video.currentTime, pause: () => video.pause(), duration: dur };
}
