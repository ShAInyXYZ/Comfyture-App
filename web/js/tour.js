// Tours: a product's pet shows a newcomer around it, one step at a time, on the example the product ships (examples/<product>/), so
// nothing is spent: where a step would cost credits, the tour shows what the example already holds (simulate() plays the wait).
//
// A tour is data, in web/js/tours/<product>.js: { title, steps: [{ target, title, text, place, go, show, wait }] }:
// - target: a selector (or a function returning the element) the step lights; none, and the card sits in the middle;
// - title, text: what the pet says (**words** in bold); place: "right" | "left" | "top" | "bottom" (where the card goes; the best side
//   when left out);
// - go(): what to do before the step shows (open a page, a workspace, the example); may be async;
// - show: { label, run() }: a key on the card that does the step for the user (on the example: never anything paid);
// - wait(): the step moves on by itself once this is true (the user did it).
// One tour runs at a time; Esc ends it, the arrows step through it, and the page stays usable around the light.
import { h, icon } from "./dom.js";
import { harnessOf } from "./harnesses.js";

// the tours there are (a product without one has no compass in the header and no chip on its bar)
const LOADERS = {
  home: () => import("./tours/home.js"),
  kitchen: () => import("./tours/kitchen.js"),
  mixer: () => import("./tours/mixer.js"),
  jam: () => import("./tours/jam.js"),
  macaron: () => import("./tours/macaron.js"),
  // (the bay at #/spice?bay has its own tour; the VFX house keeps its)
  spice: () => (location.hash.includes("bay") ? import("./tours/bay.js") : import("./tours/spice.js")),
  toaster: () => import("./tours/toaster.js"),
  utensils: () => import("./tours/utensils.js"),
};
const ROOMS = new Set(["story", "stage", "shot", "cut", "library"]);
const SEEN = "comfyture.tours";
const listeners = new Set();
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Whether a product (or "home") has a tour. */
export const hasTour = (product) => !!LOADERS[product];
/** The tours taken (done or left), by product. */
function seen() {
  try {
    return JSON.parse(localStorage.getItem(SEEN) ?? "{}") ?? {};
  } catch {
    return {};
  }
}
/** Whether this person has taken a product's tour already (to the end, or left it). */
export const tourTaken = (product) => !!seen()[product];
function note(product, how) {
  try {
    localStorage.setItem(SEEN, JSON.stringify({ ...seen(), [product]: how }));
  } catch {}
}
/** Told when a tour starts or ends (the bar's chip and the header's key follow). */
export const onTour = (fn) => listeners.add(fn);
const tell = () => listeners.forEach((fn) => fn(run?.product ?? null));
/** The product whose tour is running, if one is. */
export const tourOn = () => run?.product ?? null;

let run = null;

/** Starts a product's tour (at a step, the first by default). */
export async function startTour(product, at = 0) {
  const load = LOADERS[product];
  if (!load) return;
  stopTour(null);
  // (where the focus was, so it goes back there when the tour ends)
  const opener = document.activeElement;
  const mine = (run = { product, tour: null, at: -1, els: build(product), frame: 0, poll: 0, rect: null, opener });
  document.documentElement.dataset.touring = product;
  tell();
  try {
    mine.tour = (await load()).default;
  } catch (e) {
    if (run === mine) stopTour(null);
    throw e;
  }
  if (run !== mine) return;
  await goTo(at);
}

/** Ends the tour open: "done" when it reached its end, "left" when it was closed; null forgets nothing. */
export function stopTour(how = "left") {
  if (!run) return;
  const { product, els, frame, poll, tour, opener } = run;
  cancelAnimationFrame(frame);
  clearInterval(poll);
  if (how) note(product, how);
  run = null;
  delete document.documentElement.dataset.touring;
  // (what the tour opened for its steps, a window or a preview playing, is closed by the tour itself)
  try {
    tour?.end?.();
  } catch (e) {
    console.warn("tour: it could not tidy up:", e);
  }
  els.root.classList.add("is-going");
  setTimeout(() => els.root.remove(), reduced() ? 0 : 160);
  removeEventListener("keydown", onKey, true);
  removeEventListener("resize", follow);
  tell();
  // the card had the focus and is going: it goes back to what had it before (the header's compass, the bar's chip), not to the top of the page
  if (how && (document.activeElement === document.body || els.root.contains(document.activeElement))) {
    const back = opener?.isConnected && opener !== document.body ? opener : document.getElementById("tour-key");
    if (back && !back.hidden) back.focus({ preventScroll: true });
  }
}

/** The veil with its light, and the pet's card. */
function build(product) {
  const pet = harnessOf(product === "home" ? "kitchen" : product);
  const spot = h("div.tour-spot");
  const face = h("img.tour-face", { src: pet?.face ?? "brand/cast/ketkout-face.webp", alt: "", draggable: false });
  const who = h("span.tour-who");
  const close = h("button.tour-close", { type: "button", "aria-label": "End the tour — Esc", "data-tooltip": "End the tour — Esc", on: { click: () => stopTour("left") } }, icon("close"));
  const title = h("h2.tour-title", { id: "tour-title" });
  const text = h("p.tour-text", { id: "tour-text" });
  const show = h("button.tour-show", { type: "button", hidden: true });
  const dots = h("div.tour-dots", { "aria-hidden": "true" });
  const back = h("button.tour-back", { type: "button", on: { click: () => goTo(run.at - 1) } }, "Back");
  const next = h("button.tour-next", { type: "button", on: { click: () => goTo(run.at + 1) } }, "Next");
  const card = h("section.tour-card", { role: "dialog", "aria-modal": "false", "aria-labelledby": "tour-title", "aria-describedby": "tour-text", tabindex: "-1" },
    h("div.tour-head", {}, face, who, close),
    title,
    text,
    show,
    h("div.tour-foot", {}, dots, h("span.spacer"), back, next),
  );
  const root = h("div.tour", { dataset: { product } }, spot, card);
  document.body.append(root);
  addEventListener("keydown", onKey, true);
  addEventListener("resize", follow);
  return { root, spot, card, face, who, title, text, show, dots, back, next, name: pet?.name ?? "Comfyture" };
}

/** **bold** words as <b>, the rest as text. */
function rich(text) {
  return String(text ?? "").split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((part) => (/^\*\*[^*]+\*\*$/.test(part) ? h("b", {}, part.slice(2, -2)) : document.createTextNode(part)));
}

/** The element a step lights, once it is on the page (a moment is given for a page that is still drawing). */
async function targetOf(step) {
  if (!step.target) return null;
  for (let i = 0; i < 30; i++) {
    const el = typeof step.target === "function" ? step.target() : document.querySelector(step.target);
    if (el && el.getClientRects().length) return el;
    await new Promise((r) => setTimeout(r, 100));
    if (!run) return null;
  }
  return null;
}

async function goTo(at) {
  const mine = run;
  if (!mine?.tour) return;
  const steps = mine.tour.steps;
  if (at >= steps.length) return stopTour("done");
  if (at < 0) return;
  const step = steps[at];
  mine.at = at;
  clearInterval(mine.poll);
  dispatchEvent(new Event("comfyture:tips-hide"));
  const els = mine.els;
  els.card.classList.add("is-busy");
  try {
    await step.go?.();
  } catch (e) {
    console.warn("tour: a step could not be prepared:", e);
  }
  if (run !== mine || mine.at !== at) return;
  const target = await targetOf(step);
  if (run !== mine || mine.at !== at) return;
  // (a step's element below the fold or in a panel scrolled away is brought into view, as little as it takes)
  if (target?.getClientRects().length) target.scrollIntoView({ block: "nearest", inline: "nearest" });
  mine.target = target;
  // the card says it
  els.who.textContent = `${els.name} · ${at + 1} of ${steps.length}`;
  els.title.textContent = step.title ?? "";
  els.text.replaceChildren(...rich(step.text));
  els.show.hidden = !step.show;
  if (step.show) {
    els.show.replaceChildren(icon("play"), h("span", {}, step.show.label));
    els.show.disabled = false;
    els.show.onclick = async () => {
      els.show.disabled = true;
      try {
        await step.show.run();
      } finally {
        if (run === mine && mine.at === at) els.show.disabled = false;
      }
      if (run === mine && mine.at === at && step.show.then === "next") goTo(at + 1);
    };
  }
  els.dots.replaceChildren(...steps.map((_, i) => h("i", { className: i === at ? "is-on" : i < at ? "is-done" : "" })));
  els.back.hidden = at === 0;
  els.next.textContent = at === steps.length - 1 ? "Done" : step.wait ? "Skip this" : "Next";
  els.next.classList.toggle("is-quiet", !!step.wait);
  els.card.classList.remove("is-busy");
  els.root.classList.toggle("is-free", !target);
  mine.rect = null;
  place(step);
  els.card.focus({ preventScroll: true });
  // a step the user does: on to the next once it is done
  if (step.wait) {
    mine.poll = setInterval(() => {
      try {
        if (run === mine && mine.at === at && step.wait()) (clearInterval(mine.poll), goTo(at + 1));
      } catch {}
    }, 300);
  }
  cancelAnimationFrame(mine.frame);
  const loop = () => {
    if (run !== mine) return;
    follow();
    mine.frame = requestAnimationFrame(loop);
  };
  mine.frame = requestAnimationFrame(loop);
}

/** The light follows its element as the page moves (a panel opening, a scroll, a resize). */
function follow() {
  if (!run?.tour) return;
  const step = run.tour.steps[run.at];
  if (!step) return;
  // a page that draws itself again replaces the element lit: the light goes to the one in its place (and stays put until there is one)
  if (step.target && run.target && !run.target.isConnected) {
    const el = typeof step.target === "function" ? step.target() : document.querySelector(step.target);
    if (!el?.getClientRects().length) return;
    run.target = el;
  }
  const r = run.target?.isConnected ? run.target.getBoundingClientRect() : null;
  const key = r ? `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}` : "none";
  if (key !== run.rect) place(step);
}

const GAP = 14;
const EDGE = 16;
/** The light around the step's element, and the card beside it, on the side with the most room. */
function place(step) {
  const { spot, card } = run.els;
  const t = run.target?.isConnected ? run.target.getBoundingClientRect() : null;
  run.rect = t ? `${Math.round(t.left)},${Math.round(t.top)},${Math.round(t.width)},${Math.round(t.height)}` : "none";
  const vw = innerWidth;
  const vh = innerHeight;
  const pad = step.pad ?? 8;
  if (!t) {
    Object.assign(spot.style, { left: `${vw / 2}px`, top: `${vh / 2}px`, width: "0px", height: "0px" });
    const cw = card.offsetWidth;
    const ch = card.offsetHeight;
    Object.assign(card.style, { left: `${Math.round((vw - cw) / 2)}px`, top: `${Math.round((vh - ch) / 2)}px` });
    card.dataset.side = "center";
    return;
  }
  const box = { left: Math.max(4, t.left - pad), top: Math.max(4, t.top - pad), right: Math.min(vw - 4, t.right + pad), bottom: Math.min(vh - 4, t.bottom + pad) };
  Object.assign(spot.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.right - box.left}px`, height: `${box.bottom - box.top}px` });
  const cw = card.offsetWidth;
  const ch = card.offsetHeight;
  const room = { right: vw - box.right - GAP - EDGE, left: box.left - GAP - EDGE, bottom: vh - box.bottom - GAP - EDGE, top: box.top - GAP - EDGE };
  const fits = (side) => (side === "right" || side === "left" ? room[side] >= cw : room[side] >= ch);
  const order = [step.place, "right", "left", "bottom", "top"].filter(Boolean);
  const side = order.find(fits) ?? "inside";
  let x;
  let y;
  if (side === "right" || side === "left") {
    x = side === "right" ? box.right + GAP : box.left - GAP - cw;
    y = Math.min(Math.max(EDGE, box.top + (box.bottom - box.top - ch) / 2), vh - ch - EDGE);
  } else if (side === "bottom" || side === "top") {
    y = side === "bottom" ? box.bottom + GAP : box.top - GAP - ch;
    x = Math.min(Math.max(EDGE, box.left + (box.right - box.left - cw) / 2), vw - cw - EDGE);
  } else {
    // a big element (a whole column): the card sits inside it, in its lower right corner
    x = Math.min(Math.max(EDGE, box.right - cw - 24), vw - cw - EDGE);
    y = Math.min(Math.max(EDGE, box.bottom - ch - 24), vh - ch - EDGE);
  }
  Object.assign(card.style, { left: `${Math.round(x)}px`, top: `${Math.round(y)}px` });
  card.dataset.side = side;
}

function onKey(e) {
  if (!run?.tour) return;
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName) || e.target?.isContentEditable;
  if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    stopTour("left");
  } else if (!typing && (e.key === "ArrowRight" || (e.key === "Enter" && run.els.card.contains(e.target) && e.target === run.els.card))) {
    e.preventDefault();
    e.stopPropagation();
    goTo(run.at + 1);
  } else if (!typing && e.key === "ArrowLeft") {
    e.preventDefault();
    e.stopPropagation();
    goTo(run.at - 1);
  }
}

/**
 * A run that costs nothing, played over an element: a bar fills for a few seconds with what is being made, then `done` shows the
 * result (on a tour, the example's own). Resolves once it has played.
 */
export function simulate(el, { label = "Working", seconds = 2.4, note = "An example: nothing is spent" } = {}) {
  const r = el?.getBoundingClientRect?.();
  if (!r || !r.width) return Promise.resolve();
  const bar = h("i");
  const veil = h("div.tour-sim", { style: { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` } },
    h("div.tour-sim-card", {}, h("b", {}, label), h("div.tour-sim-bar", {}, bar), h("small", {}, note)));
  document.body.append(veil);
  bar.style.transitionDuration = `${seconds}s`;
  requestAnimationFrame(() => requestAnimationFrame(() => (bar.style.width = "100%")));
  return new Promise((done) =>
    setTimeout(() => {
      veil.classList.add("is-done");
      setTimeout(() => (veil.remove(), done()), reduced() ? 0 : 220);
    }, seconds * 1000),
  );
}

/** The product a page is part of ("home" for the app's home). */
export const tourProductOf = (page) => (page === "home" ? "home" : ROOMS.has(page) ? "kitchen" : page);

/** The header's key: the tour of the page open, on every page that has one. */
export function installTourKey(key, currentPage) {
  if (!key) return;
  key.append(icon("compass"));
  const draw = () => {
    const product = tourProductOf(currentPage());
    key.hidden = !hasTour(product);
    key.setAttribute("aria-pressed", String(tourOn() === product));
    // lit, as the bar's chip is, until the page's tour has been taken once: on the app's home it is the only way in
    key.classList.toggle("is-new", !tourTaken(product) && tourOn() !== product);
  };
  key.addEventListener("click", () => {
    const product = tourProductOf(currentPage());
    if (tourOn() === product) stopTour("left");
    else startTour(product);
  });
  addEventListener("hashchange", () => {
    // a tour of another page ends when its page is left by the person (a tour's own steps move between rooms of its product)
    const product = tourProductOf(currentPage());
    if (run && run.product !== product && !(run.product === "home" && product !== "home" && run.allowLeave)) stopTour("left");
    draw();
  });
  onTour(draw);
  draw();
}

/** For the tours themselves: lets a tour move from the home to a product without ending (the home tour opens products). */
export function letTourLeave() {
  if (run) run.allowLeave = true;
}
