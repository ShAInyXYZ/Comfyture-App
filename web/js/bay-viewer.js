// Spice's viewer: the footage on the left of a wipe and a take on the right, played together. One transport for both (play, a scrubber,
// the time), the wipe a line to drag. A side that is a picture shows still; a side that is missing shows the other whole. Made once and kept:
// the clips hold their own place and sound while the panels around them are drawn again.
import { h, icon } from "./dom.js";
import { iconKey } from "./bay-ui.js";

const fmt = (s) => {
  const t = Math.max(0, Math.round((s || 0) * 10) / 10);
  return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}.${Math.round((t % 1) * 10)}`;
};

export function createViewer() {
  const a = h("video.bay-v-a", { muted: true, loop: true, playsinline: true, preload: "auto", "aria-label": "The footage" });
  const b = h("video.bay-v-b", { muted: true, loop: true, playsinline: true, preload: "auto", "aria-label": "The take" });
  a.muted = b.muted = true;
  const pic = h("img.bay-v-b", { alt: "", hidden: true, draggable: false });
  const line = h("div.bay-v-line", { role: "slider", tabindex: "0", "aria-label": "Wipe between the footage and the take", "aria-valuemin": "0", "aria-valuemax": "100" }, h("span.bay-v-knob", {}, icon("compare")));
  const tagA = h("span.bay-v-tag.is-a");
  const tagB = h("span.bay-v-tag.is-b");
  const empty = h("div.bay-v-empty", {}, h("b", {}, "No clip yet"), h("span", {}, "Drop a clip here, or press Bring a clip."));
  const stage = h("div.bay-v-stage", {}, a, b, pic, line, tagA, tagB, empty);
  const play = iconKey("play", "Play", () => toggle(), { cls: "bay-v-play" });
  const scrub = h("input.bay-v-scrub", { type: "range", min: "0", max: "1000", value: "0", "aria-label": "Position", on: { input: () => seek((scrub.value / 1000) * (a.duration || 0)) } });
  const time = h("span.bay-v-time", {}, "0:00.0");
  const bar = h("div.bay-v-bar", {}, play, scrub, time);
  const el = h("div.bay-viewer", {}, stage, bar);
  let wipe = 50;
  let drop = () => {};
  const setWipe = (pct) => {
    wipe = Math.min(100, Math.max(0, pct));
    stage.style.setProperty("--wipe", `${wipe}%`);
    line.setAttribute("aria-valuenow", String(Math.round(wipe)));
  };
  setWipe(50);
  line.addEventListener("pointerdown", (e) => {
    line.setPointerCapture(e.pointerId);
    const move = (ev) => {
      const r = stage.getBoundingClientRect();
      setWipe(((ev.clientX - r.left) / r.width) * 100);
    };
    line.addEventListener("pointermove", move);
    line.addEventListener("pointerup", () => line.removeEventListener("pointermove", move), { once: true });
  });
  line.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") setWipe(wipe - 5);
    if (e.key === "ArrowRight") setWipe(wipe + 5);
  });
  // the take follows the footage's time
  const follow = () => {
    if (b.src && !b.hidden && Math.abs(b.currentTime - a.currentTime) > 0.12) b.currentTime = a.currentTime;
    if (a.duration) scrub.value = String(Math.round((a.currentTime / a.duration) * 1000));
    time.textContent = `${fmt(a.currentTime)} / ${fmt(a.duration)}`;
  };
  a.addEventListener("timeupdate", follow);
  a.addEventListener("loadedmetadata", follow);
  const seek = (s) => {
    a.currentTime = s;
    if (b.src) b.currentTime = s;
    follow();
  };
  const toggle = () => {
    const main = a.src ? a : b;
    if (main.paused) {
      a.src && a.play().catch(() => {});
      b.src && !b.hidden && b.play().catch(() => {});
    } else {
      a.pause();
      b.pause();
    }
  };
  for (const v of [a, b]) {
    v.addEventListener("play", () => play.replaceChildren(icon("pause")));
    v.addEventListener("pause", () => a.paused && b.paused && play.replaceChildren(icon("play")));
  }
  stage.addEventListener("dragover", (e) => (e.preventDefault(), stage.classList.add("is-over")));
  stage.addEventListener("dragleave", () => stage.classList.remove("is-over"));
  stage.addEventListener("drop", (e) => {
    e.preventDefault();
    stage.classList.remove("is-over");
    const f = e.dataTransfer?.files?.[0];
    if (f) drop(f);
  });
  const load = (v, url) => {
    if (!url) {
      if (v.getAttribute("src")) (v.removeAttribute("src"), v.load());
      return;
    }
    if (v.getAttribute("src") !== url) {
      v.src = url;
      v.load();
    }
  };
  return {
    el,
    /** Shows `left` and `right` (media or null); `names` are the words on the corners; `onDrop(file)` takes a clip dropped on it. */
    update({ left, right, names = [], onDrop }) {
      drop = onDrop ?? drop;
      const clipRight = right?.kind === "video" ? right : null;
      const picRight = right?.kind === "image" ? right : null;
      load(a, left?.kind === "video" ? left.url : null);
      load(b, clipRight?.url ?? null);
      b.hidden = !clipRight;
      pic.hidden = !picRight;
      if (picRight && pic.getAttribute("src") !== picRight.url) pic.src = picRight.url;
      const both = !!(left && right);
      stage.classList.toggle("is-single", !both);
      line.hidden = !both;
      empty.hidden = !!(left || right);
      tagA.textContent = both ? names[0] ?? "" : "";
      tagB.textContent = both ? names[1] ?? "" : names[1] ?? "";
      tagB.hidden = !(both || names[1]);
      scrub.disabled = !a.src;
      play.disabled = !(a.src || b.src);
      if (!a.src && b.src) b.hidden = false;
    },
    play: toggle,
    seek,
    get time() {
      return a.currentTime;
    },
  };
}
