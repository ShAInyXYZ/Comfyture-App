// Draws Jam's sticker library: each a small SVG (web/brand/jam/stickers/svg/<id>.svg), a die-cut white
// edge round it, rendered by headless Chromium to a 512 px PNG with transparency
// (web/brand/jam/stickers/<id>.png), and listed in stickers.json. Run it from the repo root:
//   NODE_PATH=<a node_modules with playwright> node tests/tools/make-stickers.mjs
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const root = resolve(import.meta.dirname, "..", "..");
const out = join(root, "web", "brand", "jam", "stickers");
const INK = "#2A1B45";
const grad = (id, a, b) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
const star = (cx, cy, ro, ri, n, rot = -90) => Array.from({ length: n * 2 }, (_, i) => { const r = i % 2 ? ri : ro; const a = ((rot + (i * 180) / n) * Math.PI) / 180; return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`; }).join(" ");
const stroke = `stroke="${INK}" stroke-width="14" stroke-linejoin="round" stroke-linecap="round"`;
const text = (t, x, y, size, fill, extra = "") => `<text x="${x}" y="${y}" text-anchor="middle" font-family="Comfyture Lyric" font-weight="400" font-size="${size}" fill="${fill}" ${extra}>${t}</text>`;

const STICKERS = [
  ["star", "Star", "shine,favourite,rating", `<defs>${grad("g", "#FFF27A", "#FFC400")}</defs><polygon points="${star(256, 268, 200, 88, 5)}" fill="url(#g)" ${stroke}/><path d="M205 190 Q232 140 256 118" fill="none" stroke="#fff" stroke-width="14" stroke-linecap="round" opacity=".8"/>`],
  ["heart", "Heart", "love,like", `<defs>${grad("g", "#FF8FBE", "#FF3F86")}</defs><path d="M256 436 C96 330 58 222 108 150 C148 96 228 100 256 158 C284 100 364 96 404 150 C454 222 416 330 256 436 Z" fill="url(#g)" ${stroke}/><path d="M132 188 Q142 154 176 146" fill="none" stroke="#fff" stroke-width="16" stroke-linecap="round" opacity=".85"/>`],
  ["sparkle", "Sparkle", "shine,magic", `<defs>${grad("g", "#FFFDD0", "#F2FF59")}</defs><path d="M256 62 Q272 240 450 256 Q272 272 256 450 Q240 272 62 256 Q240 240 256 62 Z" fill="url(#g)" ${stroke}/>`],
  ["sparkles", "Sparkles", "shine,magic,glitter", `<defs>${grad("g", "#FFFDD0", "#F2FF59")}</defs><path d="M200 70 Q212 190 332 200 Q212 210 200 330 Q188 210 68 200 Q188 190 200 70 Z" fill="url(#g)" ${stroke} transform="translate(0 40)"/><path d="M366 40 Q374 110 442 118 Q374 126 366 196 Q358 126 290 118 Q358 110 366 40 Z" fill="url(#g)" ${stroke} stroke-width="11" transform="translate(30 20)"/><path d="M380 300 Q388 360 446 368 Q388 376 380 436 Q372 376 314 368 Q372 360 380 300 Z" fill="url(#g)" ${stroke} stroke-width="11" transform="translate(-10 14)"/>`],
  ["new", "NEW", "badge,label,sale", `<polygon points="${star(256, 256, 218, 176, 14, -90)}" fill="#F2FF59" ${stroke}/><g transform="rotate(-8 256 256)">${text("NEW", 256, 300, 150, INK)}</g>`],
  ["wow", "WOW", "badge,burst,reaction", `<polygon points="${star(256, 256, 222, 158, 11, -90)}" fill="#FF7AB8" ${stroke}/><g transform="rotate(-6 256 256)">${text("WOW!", 256, 298, 128, "#fff", `stroke="${INK}" stroke-width="16" paint-order="stroke" stroke-linejoin="round"`)}</g>`],
  ["live", "LIVE", "badge,stream", `<rect x="44" y="160" width="424" height="192" rx="54" fill="#FF3B4E" ${stroke}/><circle cx="130" cy="256" r="26" fill="#fff"/>${text("LIVE", 300, 300, 120, "#fff")}`],
  ["note", "Music note", "music,song,note", `<defs>${grad("g", "#D2C2FF", "#9B7CFF")}</defs><path d="M238 120 L238 372 M238 120 C 300 138 360 170 366 250 C 330 210 290 200 238 196 Z" fill="url(#g)" ${stroke}/><ellipse cx="180" cy="382" rx="72" ry="54" transform="rotate(-22 180 382)" fill="url(#g)" ${stroke}/><rect x="226" y="118" width="26" height="262" fill="url(#g)"/><path d="M238 120 L238 372" stroke="${INK}" stroke-width="14" fill="none" stroke-linecap="round"/>`],
  ["notes", "Music notes", "music,song,notes", `<defs>${grad("g", "#D2C2FF", "#9B7CFF")}</defs><path d="M170 380 L170 130 L380 96 L380 346" fill="none" stroke="${INK}" stroke-width="32" stroke-linejoin="round"/><path d="M170 130 L380 96 L380 168 L170 202 Z" fill="url(#g)" ${stroke}/><ellipse cx="124" cy="390" rx="62" ry="46" transform="rotate(-22 124 390)" fill="url(#g)" ${stroke}/><ellipse cx="334" cy="356" rx="62" ry="46" transform="rotate(-22 334 356)" fill="url(#g)" ${stroke}/><path d="M170 380 L170 130 M380 346 L380 96" stroke="#9B7CFF" stroke-width="12" stroke-linecap="round"/>`],
  ["bolt", "Lightning", "energy,power,shock", `<defs>${grad("g", "#FFF27A", "#FFB800")}</defs><polygon points="292,48 140,282 244,282 206,466 382,206 272,206" fill="url(#g)" ${stroke}/>`],
  ["fire", "Fire", "hot,trend,flame", `<defs>${grad("g", "#FFD93D", "#FF5A1F")}${grad("h", "#FFF6B0", "#FFC107")}</defs><path d="M256 52 C 292 140 376 184 376 300 C 376 392 320 452 256 452 C 192 452 136 392 136 300 C 136 236 170 204 200 164 C 206 204 232 218 246 202 C 262 160 238 108 256 52 Z" fill="url(#g)" ${stroke}/><path d="M256 250 C 276 300 318 322 318 376 C 318 414 290 436 256 436 C 222 436 194 414 194 376 C 194 332 236 304 256 250 Z" fill="url(#h)"/>`],
  ["crown", "Crown", "king,queen,winner", `<defs>${grad("g", "#FFE15A", "#FFB300")}</defs><path d="M70 392 L52 168 L160 262 L256 110 L352 262 L460 168 L442 392 Z" fill="url(#g)" ${stroke}/><rect x="70" y="392" width="372" height="48" rx="12" fill="#FFB300" ${stroke}/><circle cx="256" cy="316" r="26" fill="#FF3F86" stroke="${INK}" stroke-width="10"/><circle cx="160" cy="344" r="18" fill="#3DA9FF" stroke="${INK}" stroke-width="10"/><circle cx="352" cy="344" r="18" fill="#3DA9FF" stroke="${INK}" stroke-width="10"/>`],
  ["smile", "Smile", "happy,emoji,face", `<defs>${grad("g", "#FFF27A", "#FFC400")}</defs><circle cx="256" cy="262" r="196" fill="url(#g)" ${stroke}/><ellipse cx="188" cy="216" rx="22" ry="34" fill="${INK}"/><ellipse cx="324" cy="216" rx="22" ry="34" fill="${INK}"/><path d="M150 292 Q256 410 362 292" fill="none" stroke="${INK}" stroke-width="18" stroke-linecap="round"/><circle cx="142" cy="296" r="24" fill="#FF8FBE" opacity=".7"/><circle cx="370" cy="296" r="24" fill="#FF8FBE" opacity=".7"/>`],
  ["mic", "Microphone", "sing,voice,mic", `<defs>${grad("g", "#EEE9FA", "#B9AED8")}</defs><rect x="176" y="48" width="160" height="236" rx="80" fill="url(#g)" ${stroke}/><path d="M176 130 H336 M176 170 H336 M176 210 H336" stroke="${INK}" stroke-width="10" opacity=".55"/><path d="M118 230 Q118 360 256 360 Q394 360 394 230" fill="none" stroke="${INK}" stroke-width="22" stroke-linecap="round"/><path d="M256 360 V440 M190 446 H322" stroke="${INK}" stroke-width="22" stroke-linecap="round"/>`],
  ["vinyl", "Record", "music,disc,vinyl", `<circle cx="256" cy="256" r="208" fill="#1A1325" ${stroke}/><circle cx="256" cy="256" r="170" fill="none" stroke="#3a2d52" stroke-width="6"/><circle cx="256" cy="256" r="136" fill="none" stroke="#3a2d52" stroke-width="6"/><circle cx="256" cy="256" r="104" fill="none" stroke="#3a2d52" stroke-width="6"/><path d="M110 170 A166 166 0 0 1 220 100" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round" opacity=".35"/><circle cx="256" cy="256" r="72" fill="#F2FF59" ${stroke} stroke-width="10"/><circle cx="256" cy="256" r="12" fill="#1A1325"/>`],
  ["headphones", "Headphones", "music,listen", `<path d="M90 300 V250 Q90 80 256 80 Q422 80 422 250 V300" fill="none" stroke="${INK}" stroke-width="44" stroke-linecap="round"/><path d="M90 300 V250 Q90 80 256 80 Q422 80 422 250 V300" fill="none" stroke="#9B7CFF" stroke-width="22" stroke-linecap="round"/><rect x="50" y="268" width="92" height="170" rx="40" fill="#F2FF59" ${stroke}/><rect x="370" y="268" width="92" height="170" rx="40" fill="#F2FF59" ${stroke}/>`],
  ["arrow", "Arrow", "point,look,here", `<path d="M96 120 C 150 330 300 360 380 360" fill="none" stroke="${INK}" stroke-width="64" stroke-linecap="round"/><path d="M96 120 C 150 330 300 360 380 360" fill="none" stroke="#F2FF59" stroke-width="36" stroke-linecap="round"/><polygon points="330,250 462,364 330,478" fill="#F2FF59" ${stroke}/>`],
];

const svgOf = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512"><defs><filter id="die" x="-12%" y="-12%" width="124%" height="124%" color-interpolation-filters="sRGB"><feMorphology in="SourceAlpha" operator="dilate" radius="11" result="d"/><feFlood flood-color="#ffffff"/><feComposite in2="d" operator="in" result="edge"/><feGaussianBlur in="d" stdDeviation="6" result="b"/><feOffset in="b" dy="7" result="o"/><feFlood flood-color="#150f1d" flood-opacity=".32"/><feComposite in2="o" operator="in" result="shadow"/><feMerge><feMergeNode in="shadow"/><feMergeNode in="edge"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><g filter="url(#die)" transform="translate(256 256) scale(.88) translate(-256 -256)">${body}</g></svg>`;

await mkdir(join(out, "svg"), { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? undefined });
const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
const font = await readFile(join(root, "web", "fonts", "comfyture-lyric.ttf"));
for (const [id, , , body] of STICKERS) {
  const svg = svgOf(body);
  await writeFile(join(out, "svg", `${id}.svg`), svg);
  await page.setContent(`<style>@font-face{font-family:"Comfyture Lyric";src:url(data:font/ttf;base64,${font.toString("base64")})}html,body{margin:0;background:transparent}</style>${svg}`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(out, `${id}.png`), omitBackground: true, clip: { x: 0, y: 0, width: 512, height: 512 } });
}
await browser.close();
await writeFile(join(out, "stickers.json"), JSON.stringify({ stickers: STICKERS.map(([id, name, tags]) => ({ id, name, file: `${id}.png`, tags: tags.split(",") })) }, null, 2));
console.log(`${STICKERS.length} stickers in ${out}`);
