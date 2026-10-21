// The brand book's model: its nine pages, what each one holds, how complete it is and where a thin one is fixed. Plain data and
// functions of a brand's body (no page, no canvas), so the page, the server's tests and Brioche's summary all read the same.
// The book is built from the kit: a page is never typed from scratch, it is the kit laid out; only the story and the imagery
// notes take words of their own (body.book.pages).
import { kitOf, luminance, contrast } from "./design.js";

/** The pages, in the order of the book. `text` says whether the page takes words of its own (a key of body.book.pages). */
export const PAGES = [
  { id: "cover", name: "Cover", label: "Brand guidelines", note: "" },
  { id: "story", name: "Story", label: "Story", note: "Where we come from and what we stand for", text: true },
  { id: "logo", name: "Logo", label: "Logo", note: "The signature, and how it is used" },
  { id: "colour", name: "Colour", label: "Colour", note: "The colours we are made of" },
  { id: "type", name: "Type", label: "Type", note: "How we set our words" },
  { id: "voice", name: "Voice", label: "Voice", note: "How we sound" },
  { id: "imagery", name: "Imagery", label: "Imagery", note: "What we look at and what we show", text: true },
  { id: "rules", name: "Rules", label: "Rules", note: "What we keep and what we never do" },
  { id: "examples", name: "Examples", label: "In use", note: "The brand at work" },
];
export const PAGE_IDS = PAGES.map((p) => p.id);
/** The pages that take words of their own. */
export const TEXT_PAGES = PAGES.filter((p) => p.text).map((p) => p.id);
export const pageById = (id) => PAGES.find((p) => p.id === id) ?? PAGES[0];

/** The size a page is drawn at: 16 by 10, wide, so a page reads on a screen and in a PDF without turning it. */
export const PAGE_W = 1600;
export const PAGE_H = 1000;

/** The words of a page of the book (empty when none were written). */
export const bookText = (body, id) => String(body?.book?.pages?.[id] ?? "").trim();

// ---------------------------------------------------------------- colour

const bytes = (hex) => {
  const n = parseInt(String(hex).slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
export const rgbOf = (hex) => bytes(hex);
/** A colour as the print shop reads it: C, M, Y, K in percent (the plain conversion, not a profile). */
export function cmykOf(hex) {
  const [r, g, b] = bytes(hex).map((v) => v / 255);
  const k = 1 - Math.max(r, g, b);
  if (k >= 1) return [0, 0, 0, 100];
  return [(1 - r - k) / (1 - k), (1 - g - k) / (1 - k), (1 - b - k) / (1 - k), k].map((v) => Math.round(v * 100));
}
/** How WCAG calls a ratio for text: AAA at 7, AA at 4.5, AA large at 3, else it fails. */
export const gradeOf = (ratio) => (ratio >= 7 ? "AAA" : ratio >= 4.5 ? "AA" : ratio >= 3 ? "AA large" : "fails");

/**
 * The colours the pages are set in, taken from the palette whatever it holds: the lightest is the paper, the darkest the ink,
 * the deepest colourful one the cover's ground, the brightest colourful one the signal (a block colour: text on it is ink).
 */
const sat = (hex) => {
  const [r, g, b] = bytes(hex).map((v) => v / 255);
  return Math.max(r, g, b) - Math.min(r, g, b);
};
export function themeOf(kit) {
  const list = kit.palette.length ? kit.palette : [{ id: "ink", hex: "#19191c" }, { id: "white", hex: "#F0EFED" }];
  const byLum = [...list].sort((a, b) => luminance(a.hex) - luminance(b.hex));
  const ink = byLum[0].hex;
  const lightest = byLum[byLum.length - 1].hex;
  // the paper is the lightest colour that is not a colour of its own (a warm white, not a yellow)
  const neutral = [...byLum].reverse().find((p) => sat(p.hex) < 0.2 && luminance(p.hex) > 0.5)?.hex;
  const paper = neutral ?? (luminance(lightest) > 0.5 && sat(lightest) < 0.45 ? lightest : "#F4F2EE");
  const colourful = list.filter((p) => sat(p.hex) > 0.2 && p.hex !== ink && p.hex !== paper);
  const deep = [...colourful].filter((p) => luminance(p.hex) < 0.25).sort((a, b) => sat(b.hex) - sat(a.hex))[0]?.hex ?? ink;
  const signal = [...colourful].sort((a, b) => luminance(b.hex) * sat(b.hex) - luminance(a.hex) * sat(a.hex))[0]?.hex ?? lightest;
  // the colour text takes on the paper: the deep one when it reads, else the ink
  const accent = contrast(deep, paper) >= 4.5 ? deep : ink;
  return { ink, paper, deep, signal, accent, muted: mix(ink, paper, 0.55), line: mix(ink, paper, 0.84) };
}

/** Two colours mixed: `t` of the second in the first. */
export function mix(a, b, t) {
  const [x, y] = [bytes(a), bytes(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("")}`;
}

// ---------------------------------------------------------------- what a page holds

const norm = (s) => String(s ?? "").trim().toLowerCase();

/** The pictures the imagery page shows: the moodboard's, the product's, what was made for the brand, newest decisions first. */
export function imageryOf(body) {
  const out = [];
  const seen = new Set();
  const add = (url, title, kind) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    out.push({ url, title: title ?? "", kind });
  };
  for (const r of body.refs ?? []) if (["inspiration", "product", "mascot"].includes(r.kind)) add(r.src, r.title, r.kind);
  for (const p of body.products ?? []) {
    add(p.scene, p.name, "product");
    add(p.photo?.url, p.name, "product");
  }
  for (const a of body.assets ?? []) if (a.url && ["product", "render", "shoot", "mascot"].includes(a.kind)) add(a.url, a.name, a.kind);
  return out;
}

/** The posts the examples page shows: approved first, then the others, as the brand made them (no variations, no motion pieces). */
export function examplesOf(body) {
  const rank = { approved: 0, scheduled: 1, review: 2, draft: 3 };
  return (body.designs ?? []).filter((d) => !d.variant && !d.motion).sort((a, b) => (rank[a.status] ?? 4) - (rank[b.status] ?? 4));
}

/** Where a page is fixed: the workspace and the window that hold what it is built from. */
export const FIXES = {
  cover: { space: "book", win: "bookpage", label: "the cover" },
  story: { space: "idea", win: "brief", label: "the brief" },
  logo: { space: "kit", win: "logos", label: "the logos" },
  colour: { space: "kit", win: "palette", label: "the palette" },
  type: { space: "kit", win: "type", label: "the type" },
  voice: { space: "kit", win: "voice", label: "the voice" },
  imagery: { space: "idea", win: "mood", label: "the moodboard" },
  rules: { space: "kit", win: "rules", label: "the rules" },
  examples: { space: "create", win: "posts", label: "the posts" },
};

/**
 * Each page and how complete it is: { id, n, name, label, ok, reason, fix }. A page that is not ok is thin, and says why in a few
 * words; the fix is where to go (the book holds only the words of the story and the imagery, the rest is the kit's).
 */
export function pageStatus(body) {
  const kit = kitOf(body);
  const has = (kind) => kit.logos.some((l) => l.kind === kind);
  const dos = kit.rules.filter((r) => r.kind === "do").length;
  const donts = kit.rules.filter((r) => r.kind === "dont").length;
  const voice = body.kit?.voice ?? kit.voice ?? {};
  const pictures = imageryOf(body).length;
  const posts = examplesOf(body);
  const approved = posts.filter((d) => d.status === "approved").length;
  const reasons = {
    cover: !has("wordmark") ? "No wordmark in the kit" : !kit.tagline ? "No tagline yet" : "",
    story: !body.brief?.pitch?.trim() ? "The brief has no idea yet" : !(body.brief?.goals ?? []).length ? "The brief has no goals yet" : "",
    logo: ["wordmark", "mark", "icon"].map((k) => (has(k) ? "" : `No ${k === "icon" ? "app icon" : k} file`)).find(Boolean) ?? "",
    colour: kit.palette.length < 3 ? `Only ${kit.palette.length} ${kit.palette.length === 1 ? "colour" : "colours"}` : kit.palette.some((p) => !p.role) ? "A colour has no role" : "",
    type: ["display", "text", "mono"].some((r) => !kit.type[r]?.family) ? "A type role has no typeface" : "",
    voice: (voice.words ?? []).length < 2 ? "Fewer than two voice words" : !(voice.lines ?? []).length && !voice.summary ? "No example lines" : "",
    imagery: pictures < 4 ? `Only ${pictures} ${pictures === 1 ? "picture" : "pictures"}` : "",
    rules: dos < 3 || donts < 3 ? `Only ${dos} keep and ${donts} never` : "",
    examples: !posts.length ? "No posts yet" : !approved ? "No approved post yet" : "",
  };
  return PAGES.map((p, i) => ({ id: p.id, n: i + 1, name: p.name, label: p.label, ok: !reasons[p.id], reason: reasons[p.id], fix: FIXES[p.id] }));
}

const hash = (value) => {
  const s = JSON.stringify(value);
  let h1 = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h1 = Math.imul(h1 ^ s.charCodeAt(i), 16777619);
  return `${(h1 >>> 0).toString(36)}-${s.length}`;
};
/** A short stable fingerprint of everything the pages are built from: the book is looked at again when it changes. */
export const bookSig = (body) => hash([body.kit, body.brief?.pitch, body.brief?.goals, body.directions, body.refs?.map((r) => [r.id, r.src, r.kind]), body.products, body.assets?.map((a) => [a.id, a.url, a.kind]), body.designs?.map((d) => [d.id, d.status, d.updatedAt, d.format, d.name]), body.book]);

/** What one page is built from, as a fingerprint: a page is drawn again only when this changes (a word typed in the story does not redraw the logos). */
export function pageSig(body, id) {
  const kit = [body.kit?.palette, body.kit?.type, body.kit?.logos, body.kit?.tagline];
  const own = {
    cover: [body.products?.[0]],
    story: [body.brief, body.directions, body.book?.pages?.story],
    logo: [body.kit?.sizes, body.kit?.rules],
    colour: [],
    type: [],
    voice: [body.kit?.voice],
    imagery: [body.refs?.map((r) => [r.src, r.kind]), body.products, body.assets?.map((a) => [a.url, a.kind]), body.book?.pages?.imagery],
    rules: [body.kit?.rules, body.kit?.sizes],
    examples: [body.designs?.map((d) => [d.id, d.status, d.updatedAt, d.format, d.name, d.variant, d.motion])],
  }[id] ?? [];
  return hash([kit, own]);
}
export { norm };
