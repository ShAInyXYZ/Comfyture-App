// What the sections of Utensils' Home share, and nothing more: the quiet typography of a section's head (its eyebrow and its one line),
// the yellow-edged Open key, the way a tool is opened, and a small helper that runs a function only while an element is on screen
// (a canvas that moves, a video that loops: none of them works while the page is out of view or the workspace is not Home).
// Every section is its own component with its own markup and its own CSS (utensils-home-<section>.js, css/ut-home.css): the cards of one
// are never the cards of another.
import { h, icon, sprite } from "./dom.js";
import { pickTool, setWorkspace, toolsOf, toolById } from "./utensils.js";
import { WORKSPACES } from "./utensils-harness.js";
import { openGrade } from "./utensils-vfx-tools.js";

export const workspaceOf = (id) => WORKSPACES.find((w) => w.id === id);

/** A section's small mono eyebrow. */
export const eyebrow = (text) => h("span.hp-eyebrow", {}, text);
/** A section's one line. */
export const line = (text) => h("p.hp-line", {}, text);
/** The key that opens a section's workspace: a yellow edge, an arrow. */
export const openKey = (label, ws, extra = {}) => h("button.hp-open", { type: "button", dataset: { open: ws }, title: `Open ${workspaceOf(ws)?.name ?? ws}`, ...extra, on: { click: () => setWorkspace(ws) } }, label, icon("next"));

/** Opens a tool: its workspace comes with it (the grade is Edit's own window, opened as the VFX workspace opens it). */
export const openTool = (t) => (t.id === "vfx-grade" ? openGrade() : pickTool(t.id));
/** A tool of the registry by id, or null (a workspace that has not registered it yet). */
export const find = (id) => {
  const t = toolById(id);
  return t?.id === id ? t : null;
};
export { toolsOf, setWorkspace, sprite, icon, h };

/**
 * Runs `start()` while `el` is on screen and `stop()` when it is not (and while the page is hidden). IntersectionObserver gives nothing
 * for an element under display:none, which is how Home is when another workspace is open: so nothing moves when it is not seen.
 */
export function whileSeen(el, start, stop) {
  let on = false;
  let seen = false;
  const sync = () => {
    const want = seen && !document.hidden;
    if (want === on) return;
    on = want;
    want ? start() : stop();
  };
  const io = new IntersectionObserver((entries) => {
    seen = entries.some((e) => e.isIntersecting);
    sync();
  }, { rootMargin: "80px" });
  io.observe(el);
  document.addEventListener("visibilitychange", sync);
}

/** Whether motion is asked for (a person who asked for less gets the still picture). */
export const calm = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/** A drag along an element, in 0..1 of its width (or height), with the keyboard's arrows (on `keyTarget`, the element itself by default): `set(fraction)`. */
export function drag(el, set, { axis = "x", keys = true, start = 0.5, keyTarget = el } = {}) {
  let value = start;
  const put = (v) => set((value = Math.min(1, Math.max(0, v))));
  const at = (e) => {
    const r = el.getBoundingClientRect();
    return axis === "x" ? (e.clientX - r.left) / r.width : (e.clientY - r.top) / r.height;
  };
  el.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || e.target.closest("button, a")) return;
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    el.classList.add("is-dragging");
    put(at(e));
    const move = (ev) => put(at(ev));
    const up = () => {
      el.classList.remove("is-dragging");
      el.removeEventListener("pointermove", move);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up, { once: true });
    el.addEventListener("pointercancel", up, { once: true });
  });
  if (keys) {
    keyTarget.addEventListener("keydown", (e) => {
      const step = e.shiftKey ? 0.2 : 0.05;
      if (["ArrowLeft", "ArrowDown"].includes(e.key)) (e.preventDefault(), put(value - step));
      else if (["ArrowRight", "ArrowUp"].includes(e.key)) (e.preventDefault(), put(value + step));
      else if (e.key === "Home") (e.preventDefault(), put(0));
      else if (e.key === "End") (e.preventDefault(), put(1));
    });
  }
  put(start);
  return { set: put, get: () => value };
}

/** A picture that fills its frame (lazy); when it does not come, `fallback` (a node) takes its place. */
export const photo = (src, { alt = "", cls = "", eager = false } = {}) => h(`img${cls ? `.${cls}` : ""}`, { src, alt, draggable: false, loading: eager ? "eager" : "lazy", decoding: "async" });
