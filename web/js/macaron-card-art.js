// The graphics printed on the swatch cards of Brioche's panel, one for each workspace: flat line drawings in the card's own ink
// (currentColor), bleeding off its right edge, so they wear any brand's palette. Drawn on a 160 × 120 box, the title's side left clear.
//   kit     a logo's construction: tangent circles, guides, the square it is built in
//   idea    a moodboard: three pinned pictures and the thread between them
//   studio  a lens: the iris's six blades, its focus scale, a viewfinder's corners
//   create  every format: 16:9, 1:1, 4:5 and 9:16 on one centre, a post laid out in the tall one
//   book    a brand book open: two pages, the lines and picture on them, the page edges under, its ribbon

const C = [112, 60]; // where the drawings centre: right of the card, clear of the title
const f = (n) => Math.round(n * 10) / 10;

/** The iris's blades: each edge of a six-sided opening, carried on to the lens's rim. */
function iris(r0, R) {
  const v = [...Array(6)].map((_, k) => [r0 * Math.cos((k * Math.PI) / 3 - Math.PI / 2), r0 * Math.sin((k * Math.PI) / 3 - Math.PI / 2)]);
  return v.map((p, k) => {
    const q = v[(k + 1) % 6];
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const u = [(q[0] - p[0]) / len, (q[1] - p[1]) / len];
    const b = q[0] * u[0] + q[1] * u[1];
    const t = -b + Math.sqrt(b * b - (q[0] ** 2 + q[1] ** 2) + R * R);
    return `<line x1="${f(C[0] + p[0])}" y1="${f(C[1] + p[1])}" x2="${f(C[0] + q[0] + t * u[0])}" y2="${f(C[1] + q[1] + t * u[1])}"/>`;
  }).join("");
}

/** The focus scale: a tick every 15°, a longer one every 45°. */
const ticks = (r) => [...Array(24)].map((_, k) => {
  const a = (k * Math.PI) / 12;
  const l = k % 3 ? 3 : 6;
  return `<line x1="${f(C[0] + r * Math.cos(a))}" y1="${f(C[1] + r * Math.sin(a))}" x2="${f(C[0] + (r + l) * Math.cos(a))}" y2="${f(C[1] + (r + l) * Math.sin(a))}"/>`;
}).join("");

/** A viewfinder's four corners on a box. */
const corners = (x0, y0, x1, y1, l) =>
  `<path d="M${x0},${y0 + l}V${y0}H${x0 + l}M${x1 - l},${y0}H${x1}V${y0 + l}M${x1},${y1 - l}V${y1}H${x1 - l}M${x0 + l},${y1}H${x0}V${y1 - l}"/>`;

/** A frame of a given ratio, centred on the drawing's centre, so many tall. */
const frame = (w, hgt, cls = "") => `<rect${cls ? ` class="${cls}"` : ""} x="${f(C[0] - w / 2)}" y="${f(C[1] - hgt / 2)}" width="${f(w)}" height="${f(hgt)}" rx="2"/>`;

const ART = {
  kit: `
    <circle class="fill" cx="126" cy="60" r="32"/>
    <circle cx="112" cy="60" r="46"/><circle cx="126" cy="60" r="32"/><circle cx="84" cy="60" r="18"/>
    <g class="thin"><rect x="66" y="14" width="92" height="92"/><line x1="30" y1="60" x2="172" y2="60"/><line x1="112" y1="0" x2="112" y2="120"/>
      <line x1="66" y1="14" x2="158" y2="106"/><line x1="66" y1="106" x2="158" y2="14"/></g>
    <g class="dot">${[[66, 60], [158, 60], [112, 14], [112, 106], [94, 60], [102, 60]].map(([x, y]) => `<rect x="${x - 2}" y="${y - 2}" width="4" height="4"/>`).join("")}</g>`,
  idea: `
    <g transform="rotate(7 127 59)"><rect x="104" y="30" width="46" height="58" rx="2"/><line class="thin" x1="110" y1="76" x2="136" y2="76"/><line class="thin" x1="110" y1="81" x2="128" y2="81"/><circle class="dot" cx="127" cy="30" r="3"/></g>
    <g transform="rotate(-8 95 36)"><rect class="fill" x="70" y="16" width="50" height="40" rx="2"/><rect x="70" y="16" width="50" height="40" rx="2"/><circle class="dot" cx="95" cy="16" r="3"/></g>
    <g transform="rotate(-3 88 80)"><rect x="66" y="62" width="44" height="36" rx="2"/><polyline points="70,94 81,80 89,88 97,76 107,94"/><circle cx="99" cy="69" r="3"/><circle class="dot" cx="88" cy="62" r="3"/></g>
    <path class="thin dash" d="M92.2,16.2C110,6 124,14 130.5,30.2M130.5,30.2C116,44 96,48 87.1,62"/>
    <path d="M150,88L152,94L158,96L152,98L150,104L148,98L142,96L148,94Z"/><path class="thin" d="M152,10V18M148,14H156"/>`,
  studio: `
    <circle class="fill" cx="112" cy="60" r="16"/>
    <g class="iris"><circle cx="112" cy="60" r="44"/>${iris(16, 44)}</g>
    <g class="thin">${ticks(48)}</g>
    ${corners(58, 6, 158, 114, 12)}
    <circle class="dot" cx="68" cy="18" r="2.5"/><path class="thin" d="M108,60H116M112,56V64"/>`,
  create: `
    ${frame(104, 58.5)}${frame(76, 76, "thin")}${frame(64, 80, "thin")}
    ${frame(50, 88.9, "fill")}${frame(50, 88.9)}
    <g class="dot"><rect x="93" y="76" width="30" height="5" rx="2.5"/><rect x="93" y="85" width="20" height="5" rx="2.5"/></g>
    <circle cx="112" cy="44" r="13"/><rect x="93" y="94" width="22" height="7" rx="3.5"/>`,
  book: `
    <path class="fill" d="M112,26C128,18 150,16 168,20V100C150,96 128,98 112,106Z"/>
    <path d="M112,26C96,18 74,16 56,20V100C74,96 96,98 112,106ZM112,26C128,18 150,16 168,20V100C150,96 128,98 112,106"/>
    <path class="thin" d="M56,104C74,100 96,102 112,110C128,102 150,100 168,104M56,108C74,104 96,106 112,114C128,106 150,104 168,108"/>
    <g class="thin">${[36, 44, 52, 60, 68].map((y, i) => `<path d="M64,${y}C80,${y - 3} 94,${y - 2} ${i === 4 ? 92 : 104},${y + 1}"/>`).join("")}</g>
    <rect class="dot" x="124" y="34" width="34" height="26" rx="2" opacity=".28"/><g class="thin"><path d="M124,70H156M124,77H146"/></g>
    <path class="dot" d="M118,22V122L122,117L126,122V22Z"/>`,
};

/** The graphic for a workspace's card (an inline SVG, hidden from screen readers), or null when it has none. */
export function cardArt(id) {
  if (!ART[id]) return null;
  const el = document.createElement("span");
  el.className = "mcb-art";
  el.dataset.art = id;
  el.innerHTML = `<svg viewBox="0 0 160 120" preserveAspectRatio="xMaxYMid slice" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ART[id]}</svg>`;
  return el;
}
