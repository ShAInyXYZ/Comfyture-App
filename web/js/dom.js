// Tiny DOM helpers: h("div.cls#id", { attrs, on: { click } }, ...children)

export function h(tag, props = {}, ...children) {
  const [name, ...rest] = tag.split(/(?=[.#])/);
  const el = document.createElement(name || "div");
  for (const part of rest) {
    if (part[0] === ".") el.classList.add(part.slice(1));
    else el.id = part.slice(1);
  }
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "on") for (const [ev, fn] of Object.entries(value)) el.addEventListener(ev, fn);
    else if (key === "className") el.classList.add(...String(value).split(/\s+/).filter(Boolean));
    else if (key === "style" && typeof value === "object") {
      // custom properties (--name) only take through setProperty
      for (const [k, v] of Object.entries(value)) k.startsWith("--") ? el.style.setProperty(k, v) : (el.style[k] = v);
    }
    else if (key === "dataset") Object.assign(el.dataset, value);
    else if (key === "value" || (key in el && typeof value !== "string")) el[key] = value;
    else el.setAttribute(key, value === true ? "" : value);
  }
  el.append(...children.flat().filter((c) => c !== null && c !== undefined && c !== false));
  return el;
}

const ICONS = {
  key: '<circle cx="8" cy="15" r="3.5"/><path d="m10.5 12.5 8-8M15.5 7.5l2.5 2.5"/>',
  download: '<path d="M12 4v11m0 0 4.5-4.5M12 15l-4.5-4.5M5 19.5h14"/>',
  remix: '<path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.7M20 4v4.7h-4.7M20 12a8 8 0 0 1-13.7 5.6L4 15.3M4 20v-4.7h4.7"/>',
  next: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  shuffle: '<path d="M4 7h3.5c2.5 0 3.7 1.4 5 4.2l.9 1.6c1.3 2.8 2.5 4.2 5 4.2H20M4 17h3.5c1.3 0 2.2-.4 3-1.2M14.5 8.2c.8-.8 1.7-1.2 3-1.2H20M17.5 4.5 20 7l-2.5 2.5M17.5 14.5 20 17l-2.5 2.5"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1.1" fill="currentColor"/><circle cx="15" cy="15" r="1.1" fill="currentColor"/><circle cx="15" cy="9" r="1.1" fill="currentColor"/><circle cx="9" cy="15" r="1.1" fill="currentColor"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M8 5.5v13M16 5.5v13" stroke-width="2.6"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  unlock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  flow: '<rect x="3.5" y="4" width="6" height="5" rx="1.2"/><rect x="14.5" y="15" width="6" height="5" rx="1.2"/><path d="M9.5 6.5H13a2 2 0 0 1 2 2v6.5"/>',
  upload: '<path d="M12 16V5m0 0-4.5 4.5M12 5l4.5 4.5M5 19.5h14"/>',
  sound: '<path d="M5 10v4h3l4 3.5v-11L8 10zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  mute: '<path d="M5 10v4h3l4 3.5v-11L8 10zM16 9.5l5 5m0-5-5 5"/>',
  share: '<rect x="7" y="3.5" width="10" height="17" rx="2"/><path d="M12 8v6m0-6-2.5 2.5M12 8l2.5 2.5"/>',
  trash: '<path d="M5 7h14M10 7V4.5h4V7m-7 0 .8 12.5h8.4L17 7"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  image: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m4 17 5-4.5 3.5 3 3-2.5 4.5 4"/>',
  video: '<rect x="3.5" y="6" width="12" height="12" rx="2"/><path d="m15.5 10.5 5-3v9l-5-3"/>',
  sparkle: '<path d="M12 4.5 13.6 9l4.4 1.6-4.4 1.6L12 16.7l-1.6-4.5L6 10.6 10.4 9zM18.5 15l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>',
  pencil: '<path d="M5 19l1-4.2L15.6 5.2a2 2 0 0 1 2.8 0l.4.4a2 2 0 0 1 0 2.8L9.2 18 5 19zM13.5 7.3l3.2 3.2"/>',
  film: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M7.5 4.5v15M16.5 4.5v15M3.5 9h4M3.5 15h4M16.5 9h4M16.5 15h4"/>',
  more: '<circle cx="6" cy="12" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="18" cy="12" r="1.2" fill="currentColor"/>',
  open: '<path d="M14 4.5h5.5V10M19.5 4.5 11 13M10 6H6a1.5 1.5 0 0 0-1.5 1.5v10.5A1.5 1.5 0 0 0 6 19.5h10.5A1.5 1.5 0 0 0 18 18v-4"/>',
  step: '<path d="M6 5.5v13M18 5.5v13l-9-6.5z"/>',
  loop: '<path d="M17 4.5 20 7.5l-3 3M4 12V10a2.5 2.5 0 0 1 2.5-2.5H20M7 19.5 4 16.5l3-3M20 12v2a2.5 2.5 0 0 1-2.5 2.5H4"/>',
  grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
  scissors: '<circle cx="6.5" cy="6.5" r="2.5"/><circle cx="6.5" cy="17.5" r="2.5"/><path d="m8.4 8 11.1 9.5M8.4 16 19.5 6.5"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="m20 20-4.6-4.6"/>',
  expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
  github: '<path d="M12 3a9 9 0 0 0-2.85 17.54c.45.08.62-.2.62-.44v-1.53c-2.5.54-3.03-1.2-3.03-1.2-.41-1.04-1-1.32-1-1.32-.82-.56.06-.55.06-.55.9.06 1.38.93 1.38.93.8 1.38 2.11.98 2.62.75.08-.58.31-.98.57-1.2-2-.23-4.1-1-4.1-4.45 0-.98.35-1.79.93-2.42-.1-.23-.4-1.15.08-2.39 0 0 .76-.24 2.47.92a8.5 8.5 0 0 1 4.5 0c1.71-1.16 2.47-.92 2.47-.92.49 1.24.18 2.16.09 2.39.58.63.92 1.44.92 2.42 0 3.46-2.1 4.22-4.1 4.44.32.28.6.82.6 1.66v2.46c0 .24.17.53.63.44A9 9 0 0 0 12 3z" fill="currentColor" stroke="none"/>',
};

export function icon(name) {
  const span = document.createElement("span");
  span.className = "icon";
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] ?? ""}</svg>`;
  return span.firstChild;
}

/** An icon from the sprite (icons/icons.svg), for the families drawn there, such as the camera moves. */
export function sprite(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "icon");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `icons/icons.svg#${name}`);
  svg.append(use);
  return svg;
}

export const pad2 = (n) => String(n).padStart(2, "0");

export function ago(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toISOString().slice(0, 10);
}
