// The small parts Jam's screens are built from: its icons, a bento (a card with its label and a way to open
// it in a window), the floating window every bento opens, the record on its turntable, a dial, a few helpers.
import { h, pad2 } from "../dom.js";
import { jam, openWindow } from "../jam.js";
import { currentPage } from "../router.js";

// ---------------------------------------------------------------- icons

const PATHS = {
  disc: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2.2"/>',
  notepad: '<path d="M5.5 5h9l3 3v3M5.5 5v14h7M8.5 10h6M8.5 14h3.5"/><path d="m19.5 13.5-5.5 5.5-2.7.6.6-2.7z"/>',
  band: '<circle cx="9" cy="8.5" r="3"/><path d="M3.5 19c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5"/><path d="M16 11.5a2.6 2.6 0 1 0 0-5.1M17 14.6c1.9.4 3 1.6 3.4 3.9"/>',
  scissors: '<circle cx="6.5" cy="6.5" r="2.5"/><circle cx="6.5" cy="17.5" r="2.5"/><path d="m8.4 8 11.1 9.5M8.4 16 19.5 6.5"/>',
  drop: '<path d="M12 3.5c3.4 4.2 5.5 6.9 5.5 9.9a5.5 5.5 0 0 1-11 0c0-3 2.1-5.7 5.5-9.9z"/>',
  crop: '<path d="M7 3.5v11a2.5 2.5 0 0 0 2.5 2.5h11M3.5 7h11A2.5 2.5 0 0 1 17 9.5v11"/>',
  loop: '<path d="M17 4.5 20 7.5l-3 3M4 12V10a2.5 2.5 0 0 1 2.5-2.5H20M7 19.5 4 16.5l3-3M20 12v2a2.5 2.5 0 0 1-2.5 2.5H4"/>',
  pencil: '<path d="M5 19l1-4.2L15.6 5.2a2 2 0 0 1 2.8 0l.4.4a2 2 0 0 1 0 2.8L9.2 18 5 19zM13.5 7.3l3.2 3.2"/>',
  words: '<rect x="3.5" y="8" width="5" height="8" rx="1.2"/><rect x="10.5" y="8" width="5" height="8" rx="1.2"/><path d="M18.5 8v8"/>',
  size: '<path d="M3.5 18 8 6.5 12.5 18M5.2 14h5.6M14.5 18l3.2-8 3.2 8M15.7 15.8h4"/>',
  copy: '<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6.5A2 2 0 0 0 14 4.5H6.5a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2H8"/>',
  mic: '<rect x="9" y="3.5" width="6" height="10" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6"/>',
  swap: '<path d="M5 8h13l-3-3M19 16H6l3 3"/>',
  zoom: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m20 20-4.9-4.9M10.5 7.5v6M7.5 10.5h6"/>',
  whip: '<path d="M4.5 19C4.5 10.5 9.5 5.5 18 4.5M18 4.5l-3.2-2.2M18 4.5l-2 3.7"/>',
  upload: '<path d="M12 16V5m0 0-4.5 4.5M12 5l4.5 4.5M5 19.5h14"/>',
  cloudup: '<path d="M7.5 18.5a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18.4 9.8a4.2 4.2 0 0 1-.9 8.7M12 20v-8m0 0-3 3m3-3 3 3"/>',
  note: '<path d="M9 17.5V6l10-2v11.5"/><circle cx="6.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="15.5" r="2.5"/>',
  wave: '<path d="M4 12v0M7 9v6M10 5v14M13 8.5v7M16 6v12M19 10v4"/>',
  expand: '<path d="M14 4h6v6M20 4l-8 8M10 20H4v-6M4 20l8-8"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  caret: '<path d="m6 9 6 6 6-6"/>',
  next: '<path d="m9 6 6 6-6 6"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M5 7h14M10 7V4.5h4V7m-7 0 .8 12.5h8.4L17 7"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M8 5.5v13M16 5.5v13" stroke-width="2.6"/>',
  undo: '<path d="M9 7 4.5 11.5 9 16M5 11.5h9a5 5 0 0 1 0 10"/>',
  redo: '<path d="M15 7l4.5 4.5L15 16M19 11.5h-9a5 5 0 0 0 0 10"/>',
  sparkle: '<path d="M12 4.5 13.6 9l4.4 1.6-4.4 1.6L12 16.7l-1.6-4.5L6 10.6 10.4 9zM18.5 15l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>',
  film: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M7.5 4.5v15M16.5 4.5v15M3.5 9h4M3.5 15h4M16.5 9h4M16.5 15h4"/>',
  download: '<path d="M12 4v11m0 0 4.5-4.5M12 15l-4.5-4.5M5 19.5h14"/>',
  image: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m4 17 5-4.5 3.5 3 3-2.5 4.5 4"/>',
  shake: '<path d="M3.5 12 6 8l3 8 3-8 3 8 3-8 2.5 4"/>',
  pulse: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="6.5"/><path d="M12 2.5v1.5M12 20v1.5M2.5 12H4M20 12h1.5" />',
  flash: '<path d="M13 3 5.5 13.5h5.5L10 21l8-11h-5.5z"/>',
  colour: '<path d="M12 4a8 8 0 0 0 0 16c1.4 0 2-.8 2-1.7 0-1.2-1-1.3-1-2.3 0-.9.7-1.5 1.8-1.5H17a3 3 0 0 0 3-3A8 8 0 0 0 12 4z"/><path d="M8 11.5h.01M11 8h.01M15.5 9h.01"/>',
  sun: '<circle cx="12" cy="12" r="3.6"/><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M18 6l-1.4 1.4M7.4 16.6 6 18"/>',
  studio: '<circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1.2"/><path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3"/>',
  stage: '<path d="M12 3.5 8.5 20.5h7zM5.5 20.5h13M9.5 8h5"/><path d="M4 7l2 1M20 7l-2 1"/>',
  star: '<path d="m12 4 2.4 5 5.4.7-4 3.8 1 5.4-4.8-2.6L7.2 19l1-5.4-4-3.8 5.4-.7z"/>',
  jar: '<rect x="6.5" y="5" width="11" height="3" rx="1"/><path d="M7.5 8v10.5a1.5 1.5 0 0 0 1.5 1.5h6a1.5 1.5 0 0 0 1.5-1.5V8"/><path d="M10 13h4"/>',
  film2: '<rect x="3.5" y="6" width="12" height="12" rx="2"/><path d="m15.5 10.5 5-3v9l-5-3"/>',
  mixer: '<path d="M7 17.5c2.4-2.2 3.3-5.5 5.5-9 1.4-2.2 3.4-3 5-2.6-.4 1.7-1.6 3.4-3.6 4.4-1.6.8-2.3 1.4-2.7 3.1"/><path d="M5 19.5l3-3"/>',
  dancer: '<circle cx="12" cy="5" r="2"/><path d="M12 8v5l-3 4.5M12 13l3.5 3.5M7 9.5 12 8l5 1.5"/>',
  lamp: '<circle cx="12" cy="12" r="3.5"/>',
  expandwin: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M12 9v6M9 12h6"/>',
};
/** One of Jam's icons, in the app's icon style (a stroke on a 24 grid), as an element. */
export function jicon(name) {
  const span = document.createElement("span");
  span.innerHTML = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] ?? ""}</svg>`;
  return span.firstChild;
}

// ---------------------------------------------------------------- small things

export const clock = (s) => `${pad2(Math.floor((s ?? 0) / 60))}:${pad2(Math.floor((s ?? 0) % 60))}`;
export const fine = (s) => `${clock(s)}.${pad2(Math.floor(((s ?? 0) % 1) * 100))}`;
export const mins = (s) => `${Math.floor((s ?? 0) / 60)}:${pad2(Math.floor((s ?? 0) % 60))}`;

/** A file asked for: an input made and clicked, its choice handed to `fn`. */
export function pickFile(accept, fn) {
  const input = h("input", { type: "file", accept, hidden: true, on: { change: () => (input.files[0] && fn(input.files[0]), input.remove()) } });
  document.body.append(input);
  input.click();
}

const kept = new Map();
/** What is made once and kept between redraws (a waveform, a video that plays): by a key. */
export const keep = (key, make) => kept.get(key) ?? (kept.set(key, make()), kept.get(key));

/** What a key that costs credits shows beside its name: "≈ 12 cr", or nothing when the work is on your own GPU. */
export const cr = (n) => (n === null || n === undefined ? "" : `≈ ${n} cr`);

/** The lamp of a state: ready (green), busy (amber). */
export const lamp = (tone = "ok") => h("span.lamp", { dataset: { tone } });

// ---------------------------------------------------------------- bentos and their windows

/**
 * A bento: a card with its label in capitals, its own keys, and a way to open it larger in a window. `win` names the
 * window it opens (none: no way); `tools` are keys beside it.
 */
export function bento({ id, title, win = id, tools = [], cls = "" }, ...body) {
  return h(`section.jm-bento.jm-b-${id}${cls ? `.${cls}` : ""}`, {},
    h("header.jm-b-head", {},
      h("span.jm-b-label", {}, title),
      h("div.jm-b-tools", {}, ...tools,
        win ? h("button.jm-expand", { type: "button", title: `${title.charAt(0)}${title.slice(1).toLowerCase()} in a window`, "aria-label": `${title} in a window`, on: { click: () => openWindow(win) } }, jicon("expand")) : null)),
    h("div.jm-b-body", {}, ...body));
}

/** The windows: each by the id of the bento that opens it, made by a function that answers what is in it (nodes). */
const WINDOWS = new Map();
export const registerWindow = (id, def) => WINDOWS.set(id, def);

let layer = null;
let lastWin = null;
const typing = (el) => !!el && el.matches?.("input, textarea, select, [contenteditable]:not([contenteditable=false])") && layer?.contains(el);

/** The window that is open drawn (or put away): a centred floating window over the page, the page dimmed behind it. */
export function drawWindow() {
  if (!layer) {
    layer = h("div.jm-layer", { hidden: true });
    document.body.append(layer);
    layer.addEventListener("pointerdown", (e) => e.target === layer && openWindow(null));
    document.addEventListener("keydown", (e) => e.key === "Escape" && jam.win && currentPage() === "jam" && !document.querySelector(".sel-menu, .pk-pop") && (e.preventDefault(), openWindow(null)));
  }
  const def = jam.win && currentPage() === "jam" ? WINDOWS.get(jam.win) : null;
  document.body.classList.toggle("has-jam-window", !!def);
  layer.hidden = !def;
  if (!def) {
    // put away: what it held (the monitor, the inspector) is for its page to take back
    if (lastWin) layer.replaceChildren();
    lastWin = null;
    return;
  }
  // a field being typed in is not drawn away from under the fingers
  if (lastWin === jam.win && typing(document.activeElement)) return;
  const fresh = lastWin !== jam.win || !layer.firstElementChild;
  const nodes = [def.build()].flat().filter(Boolean);
  if (fresh) {
    const win = h("section.jm-win", { role: "dialog", "aria-modal": "true", "aria-label": def.title, tabindex: "-1", className: def.wide ? "is-wide" : "" },
      h("header.jm-win-head", {},
        h("span.jm-win-title", {}, def.title),
        h("span.spacer"),
        h("button.jm-win-x", { type: "button", "aria-label": "Close", title: "Close — Esc", on: { click: () => openWindow(null) } }, jicon("close"))),
      h("div.jm-win-body", {}, ...nodes));
    layer.replaceChildren(win);
    lastWin = jam.win;
    win.focus({ preventScroll: true });
    return;
  }
  // the same window, its contents changed: only they are drawn again, so the window itself keeps still
  const el = layer.querySelector(".jm-win-body");
  const scroll = el.scrollTop;
  el.replaceChildren(...nodes);
  el.scrollTop = scroll;
}

// ---------------------------------------------------------------- the record

/** The record: black vinyl, its grooves and sheen, the yellow label with the jam jar on it. */
export function vinyl() {
  const grooves = Array.from({ length: 18 }, (_, i) => `<circle cx="200" cy="200" r="${104 + i * 5.2}" fill="none" stroke="rgba(255,255,255,${i % 3 === 0 ? 0.085 : 0.045})" stroke-width="${i % 3 === 0 ? 1.4 : 1}"/>`).join("");
  const span = document.createElement("span");
  span.className = "jm-vinyl";
  span.innerHTML = `<svg viewBox="0 0 400 400" aria-hidden="true">
    <defs>
      <radialGradient id="jm-v-bg" cx="50%" cy="46%" r="60%"><stop offset="0" stop-color="#1b1b1e"/><stop offset="1" stop-color="#08080a"/></radialGradient>
      <linearGradient id="jm-v-sheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".42" stop-color="#fff" stop-opacity="0"/><stop offset=".58" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".12"/></linearGradient>
    </defs>
    <circle cx="200" cy="200" r="196" fill="url(#jm-v-bg)"/>
    ${grooves}
    <circle cx="200" cy="200" r="196" fill="url(#jm-v-sheen)"/>
    <circle cx="200" cy="200" r="86" fill="#F2FF59"/>
    <circle cx="200" cy="200" r="78" fill="none" stroke="#141414" stroke-width="2.4" opacity=".55"/>
    <g transform="translate(200 198)" stroke="#141414" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none">
      <rect x="-30" y="-48" width="60" height="14" rx="4" fill="#F2FF59"/>
      <path d="M-27 -34v54a9 9 0 0 0 9 9h36a9 9 0 0 0 9-9v-54"/>
      <text x="0" y="7" text-anchor="middle" font-family="Manrope, sans-serif" font-weight="900" font-size="18" fill="#141414" stroke="none">JAM</text>
      <path d="M-46 -34l-12-8M46 -34l12-8M-50 -16l-14-2M50 -16l14-2"/>
    </g>
  </svg>`;
  return span;
}

/** The tonearm over the record (its angle is the page's: at rest, or on the groove while the film plays). */
export function tonearm() {
  const span = document.createElement("span");
  span.className = "jm-arm";
  span.innerHTML = `<svg viewBox="0 0 120 300" aria-hidden="true">
    <defs><linearGradient id="jm-arm-g" x1="0" x2="1"><stop offset="0" stop-color="#8d8a96"/><stop offset=".5" stop-color="#e4e1ec"/><stop offset="1" stop-color="#8d8a96"/></linearGradient></defs>
    <circle cx="60" cy="46" r="40" fill="#1a1a1d" stroke="#34343a" stroke-width="3"/>
    <circle cx="60" cy="46" r="22" fill="#26262b" stroke="#47474f" stroke-width="2"/>
    <rect x="54" y="62" width="12" height="190" rx="6" fill="url(#jm-arm-g)"/>
    <g transform="translate(60 252) rotate(-10)"><rect x="-14" y="0" width="28" height="40" rx="6" fill="#26262b" stroke="#47474f" stroke-width="2"/><rect x="-14" y="26" width="28" height="9" rx="2" fill="#F2FF59"/></g>
  </svg>`;
  return span;
}

// ---------------------------------------------------------------- a dial

/**
 * A dial for a value from 0 to 1 (an arc that fills, its reading beside it): dragged round, or with the arrow keys.
 * `onChange(v, done)` hears it as it moves (done: let go).
 */
export function dial(value, { label = "Intensity", onChange, disabled = false } = {}) {
  const R = 22;
  const C = 2 * Math.PI * R;
  const arc = 0.75;
  const el = h("div.jm-dial", { className: disabled ? "is-off" : "" });
  const draw = (v) => {
    const len = C * arc;
    el.innerHTML = `<svg viewBox="0 0 56 56" aria-hidden="true">
      <circle cx="28" cy="28" r="${R}" fill="none" stroke="#2a2a2f" stroke-width="6" stroke-linecap="round" stroke-dasharray="${len} ${C}" transform="rotate(135 28 28)"/>
      <circle cx="28" cy="28" r="${R}" fill="none" stroke="#F2FF59" stroke-width="6" stroke-linecap="round" stroke-dasharray="${len * v} ${C}" transform="rotate(135 28 28)"/>
    </svg>`;
  };
  let v = Math.min(1, Math.max(0, value));
  draw(v);
  const reading = h("b", {}, `${Math.round(v * 100)}%`);
  const set = (next, done) => {
    v = Math.min(1, Math.max(0, next));
    draw(v);
    reading.textContent = `${Math.round(v * 100)}%`;
    onChange?.(v, done);
  };
  const at = (e) => {
    const r = el.getBoundingClientRect();
    const a = Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * (180 / Math.PI);
    const turn = (((a - 135) % 360) + 360) % 360;
    return turn > 270 ? (turn > 315 ? 0 : 1) : turn / 270;
  };
  el.tabIndex = disabled ? -1 : 0;
  el.setAttribute("role", "slider");
  el.setAttribute("aria-label", label);
  el.setAttribute("aria-valuemin", "0");
  el.setAttribute("aria-valuemax", "100");
  el.setAttribute("aria-valuenow", String(Math.round(v * 100)));
  if (!disabled) {
    el.addEventListener("pointerdown", (e) => {
      el.setPointerCapture(e.pointerId);
      set(at(e), false);
      const move = (ev) => set(at(ev), false);
      const up = () => {
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", up);
        set(v, true);
      };
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", up);
    });
    el.addEventListener("keydown", (e) => {
      const d = e.key === "ArrowRight" || e.key === "ArrowUp" ? 0.05 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -0.05 : 0;
      if (!d) return;
      e.preventDefault();
      set(v + d, true);
      el.setAttribute("aria-valuenow", String(Math.round(v * 100)));
    });
  }
  return h("div.jm-dial-row", {}, h("span.jm-dial-label", {}, label), el, reading);
}
