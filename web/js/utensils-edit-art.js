// The small drawing on each Edit tool's card: a few shapes that say what the tool does (a filmstrip with its handles, a frame
// being cropped, a gauge...). Drawn in the card's own colours (currentColor for the quiet lines, the accent where it acts),
// so the lit card turns them dark with it. Static markup: nothing from the user goes in.

const A = "var(--ue-art, var(--accent))";
const Q = "currentColor";
const strip = (x, y, n, w, h, gap = 2, fill = ".32") => Array.from({ length: n }, (_, i) => `<rect x="${x + i * (w + gap)}" y="${y}" width="${w}" height="${h}" rx="1.5" fill="${Q}" opacity="${fill}"/>`).join("");

const ART = {
  trim: `${strip(4, 14, 9, 6, 16)}<rect x="22" y="11" width="34" height="22" rx="3" fill="none" stroke="${A}" stroke-width="2"/><path d="M22 11v22M56 11v22" stroke="${A}" stroke-width="4" stroke-linecap="round"/>`,
  reframe: `<rect x="6" y="8" width="68" height="28" rx="3" fill="${Q}" opacity=".22"/><rect x="31" y="8" width="18" height="28" rx="2" fill="none" stroke="${A}" stroke-width="2" stroke-dasharray="4 2"/><circle cx="40" cy="22" r="5" fill="${Q}" opacity=".7"/>`,
  speed: `<path d="M10 34a30 30 0 0 1 60 0" fill="none" stroke="${Q}" opacity=".35" stroke-width="3" stroke-linecap="round"/><path d="M10 34a30 30 0 0 1 38-29" fill="none" stroke="${A}" stroke-width="3" stroke-linecap="round"/><path d="m40 34 14-16" stroke="${Q}" stroke-width="2.5" stroke-linecap="round"/><circle cx="40" cy="34" r="3" fill="${Q}"/>`,
  reverse: `${strip(6, 14, 5, 10, 16, 4, ".3")}<path d="M62 22h-26m6-7-7 7 7 7" fill="none" stroke="${A}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`,
  loop: `<path d="M22 14h34a9 9 0 0 1 0 18H24" fill="none" stroke="${A}" stroke-width="3" stroke-linecap="round"/><path d="m28 8-7 6 7 6M52 38l7-6-7-6" fill="none" stroke="${A}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><rect x="33" y="18" width="14" height="8" rx="2" fill="${Q}" opacity=".5"/>`,
  merge: `<rect x="5" y="12" width="24" height="20" rx="3" fill="${Q}" opacity=".3"/><rect x="51" y="12" width="24" height="20" rx="3" fill="${Q}" opacity=".3"/><rect x="29" y="14" width="22" height="16" rx="3" fill="${A}" opacity=".9"/><path d="M29 22h22" stroke="#0e0e10" stroke-width="2" stroke-dasharray="2 3"/>`,
  captions: `<rect x="6" y="6" width="68" height="32" rx="3" fill="${Q}" opacity=".22"/><rect x="16" y="26" width="48" height="8" rx="3" fill="${A}"/><path d="M24 30h32" stroke="#0e0e10" stroke-width="2.2" stroke-linecap="round"/>`,
  grade: `<circle cx="29" cy="20" r="11" fill="#ff5d5d" opacity=".8"/><circle cx="51" cy="20" r="11" fill="#5dd2ff" opacity=".8"/><circle cx="40" cy="30" r="11" fill="${A}" opacity=".9"/>`,
  logo: `<rect x="6" y="6" width="68" height="32" rx="3" fill="${Q}" opacity=".22"/><rect x="50" y="24" width="20" height="9" rx="2.5" fill="${A}"/><path d="M54 28.5h12" stroke="#0e0e10" stroke-width="2" stroke-linecap="round"/>`,
  audio: `<path d="M8 22h6m4-8v16m4-12v8m4-14v20m4-16v12m4-8v4m4-10v16m4-12v8m4-6v4m4-8v12m4-10v8" fill="none" stroke="${A}" stroke-width="2.6" stroke-linecap="round"/><path d="M14 36 66 8" stroke="${Q}" stroke-width="2.4" stroke-linecap="round" opacity=".8"/>`,
  convert: `<rect x="6" y="9" width="24" height="26" rx="3" fill="${Q}" opacity=".3"/><rect x="50" y="9" width="24" height="26" rx="3" fill="none" stroke="${A}" stroke-width="2.2"/><path d="M34 22h12m-5-5 5 5-5 5" fill="none" stroke="${A}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`,
  gif: `<rect x="6" y="10" width="20" height="24" rx="3" fill="${Q}" opacity=".26"/><rect x="30" y="10" width="20" height="24" rx="3" fill="${Q}" opacity=".5"/><rect x="54" y="10" width="20" height="24" rx="3" fill="${A}" opacity=".95"/>`,
};

/** The drawing for a tool, as an SVG element. */
export function art(key) {
  const span = document.createElement("span");
  span.className = "ue-art";
  span.innerHTML = `<svg viewBox="0 0 80 44" aria-hidden="true">${ART[key] ?? ""}</svg>`;
  return span;
}
