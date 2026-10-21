// What Utensils' two bookcases share: the Shelf's (a book per tool, utensils-shelf-case.js) and the Library's (a book per ComfyUI
// workflow, utensils-library.js). A book's look comes from a hash of its id (its height, its thickness, its shade, cloth or leather:
// the same every time), the props that stand at the ends of a shelf are the same pictures, and a book's card is placed the same way:
// beside or above its book, always inside the screen. The spines' look is css/ut-shelf.css's (.usb-*).
import { h } from "./dom.js";

export const ART = "brand/utensils/shelf";

/** A small hash of a string, as numbers between 0 and 1 (the same every time). */
export function hashes(text, n = 4) {
  let x = 2166136261;
  for (const ch of text) x = Math.imul(x ^ ch.charCodeAt(0), 16777619) >>> 0;
  return Array.from({ length: n }, () => ((x = Math.imul(x ^ (x >>> 15), 2246822519) >>> 0), (x & 0xffff) / 0xffff));
}

/** A book's cloth: its colour (a shade of `tone` from its id), its texture, how tall it stands (0 to 1 of the shelf) and how thick. */
export function bookLook(id, tone, { thin = false } = {}) {
  const [hh, ww, shade, cloth] = hashes(id);
  const dark = Math.round(shade * 34);
  const light = shade > 0.82 ? 8 : 0;
  return {
    color: `color-mix(in oklab, color-mix(in oklab, ${tone}, black ${dark}%), white ${light}%)`,
    tex: cloth > 0.42 ? "cloth" : "leather",
    h: thin ? 0.8 + hh * 0.18 : 0.78 + hh * 0.2,
    w: thin ? ww : 2.05 + ww * 0.95,
  };
}

/**
 * A prop that stands at the end of a shelf (a plant, a globe, a lamp, a bookend, a raccoon, an ivy that hangs from the shelf above):
 * `p` is { id, w (its height, of the shelf's), hang }.
 */
export const prop = (p, side = "") => h(`img.usb-prop.is-${p.id}${side ? `.${side}` : ""}${p.hang ? ".is-hang" : ""}`, { src: `${ART}/prop-${p.id}.webp`, alt: "", draggable: false, style: { "--pw": String(p.w) }, on: { error: (e) => e.target.remove() } });

/**
 * Places a book's card: `above` (the Shelf's: above its book, below when there is no room above, with its arrow pointing at the
 * book) or `beside` (the Library's: to the right of the book, to the left when there is no room, its middle level with the book and
 * kept inside `within`, a rectangle of the screen). The card is position: fixed.
 */
export function placeCard(card, book, { mode = "above", within = null, gap = 14, pad = 12 } = {}) {
  const r = book.getBoundingClientRect();
  const cw = card.offsetWidth;
  const ch = card.offsetHeight;
  const W = window.innerWidth;
  const H = window.innerHeight;
  if (mode === "beside") {
    const box = within ?? { top: pad, bottom: H - pad };
    let left = r.right + gap;
    const right = left + cw <= W - pad;
    if (!right) left = r.left - gap - cw;
    left = Math.max(pad, Math.min(W - cw - pad, left));
    let top = r.top + r.height / 2 - ch / 2;
    top = Math.max(box.top, Math.min(box.bottom - ch, top));
    top = Math.max(pad, Math.min(H - ch - pad, top));
    card.style.left = `${Math.round(left)}px`;
    card.style.top = `${Math.round(top)}px`;
    card.classList.toggle("is-left", !right);
    card.style.setProperty("--arrow", `${Math.round(Math.min(ch - 24, Math.max(24, r.top + r.height / 2 - top)))}px`);
    return;
  }
  let left = r.left + r.width / 2 - cw / 2;
  left = Math.max(pad, Math.min(W - cw - pad, left));
  let top = r.top - ch - gap;
  if (top < 70) top = Math.min(H - ch - pad, r.bottom + gap);
  card.style.left = `${Math.round(left)}px`;
  card.style.top = `${Math.round(top)}px`;
  card.style.setProperty("--arrow", `${Math.round(r.left + r.width / 2 - left)}px`);
  card.classList.toggle("is-below", top > r.top);
}
