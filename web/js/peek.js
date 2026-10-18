// A card over the app with what a name stands for: its pictures and its words. It shows beside what
// is hovered (a row, a pill) or by the pointer, never steals it, and goes when the pointer leaves.
import { h } from "./dom.js";

let card = null;
let shown = null;

/**
 * Shows { title, color, pictures: [{ url, width, height }], words, note } for key, beside an
 * element (to its right, or above it with side "above") or a point { x, y }.
 */
export function peek(key, what, at, side = "right") {
  if (!what) return unpeek();
  card ??= document.body.appendChild(h("div.peek", { hidden: true, "aria-hidden": "true" }));
  if (shown !== key || card.hidden) {
    shown = key;
    card.replaceChildren(...[
      h("strong.peek-name", {}, what.color ? h("i.peek-chip", { style: { background: what.color } }) : null, what.title),
      what.pictures?.length ? h("div.peek-pics", {}, ...what.pictures.slice(0, 4).map((r) =>
        h("img", { src: r.url, alt: "", draggable: false, style: r.width && r.height ? { aspectRatio: `${r.width} / ${r.height}` } : {} }))) : null,
      what.words ? h("p.peek-words", {}, what.words) : null,
      what.note ? h("p.peek-note", {}, what.note) : null,
    ].filter(Boolean));
    card.hidden = false;
  }
  const box = card.getBoundingClientRect();
  const near = at instanceof Element ? at.getBoundingClientRect() : { left: at.x - 16, right: at.x + 16, top: at.y + 16, bottom: at.y + 16 };
  let x;
  let y;
  if (side === "above") {
    x = near.left;
    y = near.top - box.height - 8;
    if (y < 8) y = near.bottom + 8;
  } else {
    x = near.right + 12;
    if (x + box.width > innerWidth - 8) x = near.left - box.width - 12;
    y = near.top;
  }
  x = Math.min(Math.max(8, x), innerWidth - box.width - 8);
  y = Math.min(Math.max(8, y), innerHeight - box.height - 8);
  card.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
}

export function unpeek() {
  shown = null;
  if (card) card.hidden = true;
}

/** Peeks for the pills under a container as the pointer goes over them: lookup(name) says what each is. */
export function peekPills(container, lookup, side = "above") {
  container.addEventListener("pointerover", (e) => {
    const p = e.target.closest?.(".pill");
    if (p && container.contains(p)) peek(`pill:${p.dataset.name}`, lookup(p.dataset.name), p, side);
  });
  container.addEventListener("pointerout", (e) => {
    const p = e.target.closest?.(".pill");
    if (p && !p.contains(e.relatedTarget)) unpeek();
  });
}
