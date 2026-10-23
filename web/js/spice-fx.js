// The FX department: add elements to the shot. Its bentos: ELEMENTS (the ten effects Kitchen's presets hold, and a free one of sparks, each a
// tile; the yellow key under them adds the one picked), PLACE (where it is in the frame and how big), WHEN (the frames it plays on and how it
// eases) and MIX (how strong it is, how its light falls, whether it is behind the people or in front). An element is an LTX shot made from
// the frame it starts on, told the preset's own words and what the three bentos say (spice-model.js: fxPrompt); the sparks run on this
// machine and cost nothing. Made once and kept: { el, update, sig, slot }.
import { h } from "./dom.js";
import { state, changed } from "./store.js";
import { spice, edit, setSet, setQuietly, workingOn } from "./spice.js";
import { ELEMENTS, EASES, elementById, easeAt, whenOf, fxSeconds, fxPrompt, rangeOf, lastFrame, framesIn, FIRST, ltxCredits } from "./spice-model.js";
import { bento, spicon, primary, fill, thumb, svg } from "./spice-ui.js";
import { openWin, defineWindow } from "./spice-win.js";
import { work, inputFor, timeIn, frameOf, ltx, freeFx } from "./spice-engines.js";
import { stripOf } from "./spice-viewer.js";
import { slider } from "./utensils-fx-controls.js";
import { registerRunner } from "./spice-runs.js";

const fx = () => spice.shot.body.set.fx;
const presetOf = (el) => (el.preset ? state.presets.find((p) => p.id === el.preset) : null);
const presetAction = (el) => presetOf(el)?.script?.shots?.[0]?.action ?? "";

/** The tile's picture: the preset's poster (it plays its preview when pointed at), the free one's art. */
function tilePicture(e) {
  const p = presetOf(e);
  if (p?.poster) {
    const pic = h("span.sp-tile-pic", {}, h("img", { src: p.poster, alt: "", draggable: false, loading: "lazy" }));
    if (p.preview) {
      pic.addEventListener("pointerenter", () => !pic.querySelector("video") && pic.append(h("video", { src: p.preview, muted: true, loop: true, playsInline: true, autoplay: true, draggable: false })));
      pic.addEventListener("pointerleave", () => pic.querySelector("video")?.remove());
    }
    return pic;
  }
  return h("span.sp-tile-pic", {}, h("img", { src: "brand/utensils/vfx/vfx-sparks-after.webp", alt: "", draggable: false, loading: "lazy" }));
}

// ---------------------------------------------------------------- what the run is

/** What adding the element needs and costs now: the frames, the seconds of video, the credits (null when free), and what stops it. */
function plan() {
  const b = spice.shot.body;
  const set = b.set.fx;
  const el = elementById(set.element);
  const plate = b.passes.plate;
  const when = whenOf(b);
  const fps = plate?.fps ?? 24;
  const seconds = fxSeconds(when, fps);
  const why = !plate ? "Bring the footage to the Plate first" : plate.media.kind !== "video" ? "Effects are added to a clip" : !el.free && !presetOf(el) ? "The preset is not loaded" : "";
  return { el, set, when, fps, seconds, why, credits: el.free ? undefined : ltxCredits(seconds) };
}

function runElement() {
  const shot = spice.shot;
  const { el, set, when, fps, seconds } = plan();
  if (el.free) {
    return work("fx", el.name, async (progress, job) => {
      const input = await inputFor("fx", shot);
      const files = await freeFx("sparks", { video: input.media.file, kind: "sparks", amount: set.intensity, speed: 1, direction: "up" })(progress, job);
      return { files, from: input.from, to: input.from + framesIn(input.media.seconds ?? 0, fps) - 1 };
    }, { note: el.name, source: "free" });
  }
  return work("fx", el.name, async (progress, job) => {
    const input = await inputFor("fx", shot);
    const photo = await frameOf(input.media, timeIn(input, when.from, fps));
    const out = await ltx({ photo, prompt: fxPrompt(presetAction(el), set), seconds, name: `${shot.name} · ${el.name}` })(progress, job);
    return { files: out, from: when.from, to: when.from + framesIn(out.duration ?? seconds, fps) - 1 };
  }, { note: `${el.name} · frames ${when.from} – ${when.from + framesIn(seconds, fps) - 1}`, credits: ltxCredits(seconds), source: "cloud" });
}

registerRunner("fx", () => {
  const p = plan();
  return { label: p.el.verb, cost: p.credits, free: !!p.el.free, why: p.why, run: runElement };
});

// ---------------------------------------------------------------- the bentos' bodies (a window shows the same, larger)

function elementsBody(big) {
  const { el, set, why, credits } = plan();
  const busy = workingOn("fx");
  const words = h("textarea.ut-words.sp-words", {
    rows: 3, placeholder: presetAction(el) || "What happens", value: set.words ?? "", "aria-label": "What happens, in your words", disabled: el.free,
    on: { input: (e) => setQuietly("fx", { words: e.target.value }), change: () => edit(() => {}) },
  });
  return h("div.sp-elements", {},
    h("div.sp-tiles", {}, ...ELEMENTS.map((e) =>
      h("button.sp-tile", { type: "button", "aria-pressed": String(e.id === el.id), dataset: { element: e.id }, title: `${e.name}${e.free ? " — free, on this machine" : ` — ${presetOf(e)?.blurb ?? ""}`}`, on: { click: () => setSet("fx", { element: e.id, words: "" }) } },
        tilePicture(e), h("span", {}, e.name), e.free ? h("i.sp-tile-free", {}, "free") : null))),
    big ? h("div.sp-say", {}, h("span.ut-label", {}, "What happens"), words, h("span.ut-label", {}, "What the shot is told"), h("p.sp-prompt", {}, el.free ? "Sparks drift up over the footage." : fxPrompt(presetAction(el), set))) : null,
    primary({ id: "fx:add", label: el.verb, cost: credits, working: !!busy, disabled: !!why, title: why || `${el.name}: ${el.free ? "free, on this machine" : "an LTX shot made from the frame it starts on"}`, run: runElement }));
}

function placeBody() {
  const b = spice.shot.body;
  const set = b.set.fx;
  const p = set.place;
  const media = b.passes.plate?.media;
  const dot = h("i.sp-place-dot", { style: { left: `${p.x * 100}%`, top: `${p.y * 100}%`, "--size": String(p.size) } }, spicon("plus"));
  const readout = h("span.sp-readout", {});
  const showRead = () => fill(readout, h("em", {}, "X"), ` ${((p.x - 0.5) * 2).toFixed(2)}  `, h("em", {}, "Y"), ` ${((0.5 - p.y) * 2).toFixed(2)}`);
  showRead();
  const frame = h("div.sp-place-frame", { title: "Where the effect is: drag", dataset: { keep: "1" } }, media ? thumb(media) : h("span.sp-thumb.is-empty"), dot);
  const move = (e) => {
    const r = frame.getBoundingClientRect();
    p.x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    p.y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    dot.style.left = `${p.x * 100}%`;
    dot.style.top = `${p.y * 100}%`;
    showRead();
    setQuietly("fx", { place: { ...p } });
  };
  frame.addEventListener("pointerdown", (e) => {
    frame.setPointerCapture(e.pointerId);
    move(e);
    const up = () => (frame.removeEventListener("pointermove", move), frame.removeEventListener("pointerup", up), edit(() => {}));
    frame.addEventListener("pointermove", move);
    frame.addEventListener("pointerup", up);
  });
  return h("div.sp-place", {}, frame,
    h("div.sp-place-read", {}, h("span.ut-label", {}, "Position"), readout),
    h("div.sp-place-size", {}, h("span.ut-label", {}, "Size"), slider({ value: p.size, min: 0.1, max: 1, step: 0.01, show: (v) => v.toFixed(2), label: "Size", set: (v, quiet) => ((dot.style.setProperty("--size", String(v)), (p.size = v)), quiet ? setQuietly("fx", { place: { ...p } }) : setSet("fx", { place: { ...p } })) })));
}

function whenBody() {
  const b = spice.shot.body;
  const plate = b.passes.plate;
  const r = rangeOf(b);
  const w = whenOf(b);
  const span = Math.max(1, r.out - r.in);
  const pct = (f) => `${(((f - r.in) / span) * 100).toFixed(2)}%`;
  const s = plate?.media.kind === "video" ? stripOf(plate.media.file, () => changed("spice")) : null;
  const text = h("b.sp-when-text", {}, `${w.from} – ${w.to}`);
  const sel = h("div.sp-when-sel", { style: { left: pct(w.from), right: `calc(100% - ${pct(w.to)})` } }, h("i.is-in", { title: "Where it starts" }), h("i.is-out", { title: "Where it ends" }));
  const strip = h("div.sp-when-strip", { style: s?.url ? { backgroundImage: `url(${s.url})` } : {}, dataset: { keep: "1" } }, sel);
  const at = (e) => {
    const rect = strip.getBoundingClientRect();
    return Math.round(r.in + Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)) * span);
  };
  const cur = { from: w.from, to: w.to };
  const apply = () => {
    sel.style.left = pct(cur.from);
    sel.style.right = `calc(100% - ${pct(cur.to)})`;
    text.textContent = `${cur.from} – ${cur.to}`;
    setQuietly("fx", { when: { ...cur } });
  };
  // a handle moves its end; the middle of the selection moves it whole
  strip.addEventListener("pointerdown", (e) => {
    strip.setPointerCapture(e.pointerId);
    const grab = e.target.classList.contains("is-in") ? "in" : e.target.classList.contains("is-out") ? "out" : e.target === sel ? "all" : at(e) < (cur.from + cur.to) / 2 ? "in" : "out";
    const start = at(e);
    const was = { ...cur };
    const move = (ev) => {
      const f = at(ev);
      if (grab === "in") cur.from = Math.min(Math.max(r.in, f), cur.to);
      else if (grab === "out") cur.to = Math.max(Math.min(r.out, f), cur.from);
      else {
        const d = Math.min(Math.max(f - start, r.in - was.from), r.out - was.to);
        cur.from = was.from + d;
        cur.to = was.to + d;
      }
      apply();
    };
    const up = () => (strip.removeEventListener("pointermove", move), strip.removeEventListener("pointerup", up), edit(() => {}));
    strip.addEventListener("pointermove", move);
    strip.addEventListener("pointerup", up);
  });
  const curve = Array.from({ length: 33 }, (_, i) => `${i ? "L" : "M"}${(i / 32) * 100} ${(1 - easeAt(b.set.fx.ease, i / 32)) * 100}`).join(" ");
  return h("div.sp-when", {},
    text,
    strip,
    svg("sp-curve", { viewBox: "-4 -6 108 112", preserveAspectRatio: "none" }, `<path d="${curve}"/>`),
    h("select.ut-select.sp-ease", { "aria-label": "How it eases", on: { change: (e) => setSet("fx", { ease: e.target.value }) } }, ...EASES.map(([v, label]) => h("option", { value: v, selected: b.set.fx.ease === v }, label))));
}

function mixBody() {
  const set = spice.shot.body.set.fx;
  const row = (label, key) => h("div.sp-mix-row", {}, h("span.ut-label", {}, label), slider({ value: set[key], min: 0, max: 1, step: 0.01, show: (v) => v.toFixed(2), label, set: (v, quiet) => (quiet ? setQuietly("fx", { [key]: v }) : setSet("fx", { [key]: v })) }));
  return h("div.sp-mix", {}, row("Intensity", "intensity"), row("Light spill", "spill"),
    h("div.ut-segs.sp-depth-switch", { role: "group", title: "Roto's matte lets the effect pass behind the people" },
      ...[["behind", "Behind her"], ["front", "In front"]].map(([v, label]) => h("button.ut-seg", { type: "button", "aria-pressed": String(set.depth === v), on: { click: () => setSet("fx", { depth: v }) } }, label))));
}

// ---------------------------------------------------------------- the department

const BENTOS = [
  ["elements", "ELEMENTS", "sp-side-b.sp-b-elements", elementsBody],
  ["place", "PLACE", "sp-b-place", placeBody],
  ["when", "WHEN", "sp-b-when", whenBody],
  ["mix", "MIX", "sp-b-mix", mixBody],
];
for (const [id, title, , body] of BENTOS) {
  defineWindow(`fx-${id}`, {
    eyebrow: "FX", title, size: id === "elements" ? "l" : "s",
    make: () => {
      const el = h("div.sp-w");
      return { el, update: () => fill(el, body(true)), sig: () => JSON.stringify([spice.shot?.body.set.fx, spice.shot?.body.passes.plate?.media.url, spice.shot?.body.range, state.presets.length]) };
    },
  });
}

export function fxSpace() {
  const el = h("div.sp-dept.is-fx.is-tall");
  const slot = h("div.sp-slot");
  const bentos = Object.fromEntries(BENTOS.map(([id, title, cls]) => [id, bento(cls, title, () => openWin(`fx-${id}`))]));
  const bodies = Object.fromEntries(BENTOS.map(([id]) => [id, h("div.sp-b-body")]));
  for (const [id] of BENTOS) bentos[id].append(bodies[id]);
  el.append(slot, bentos.elements, h("div.sp-lower.is-3", {}, bentos.place, bentos.when, bentos.mix));
  function update() {
    // the preset a tile comes from; the key's price follows the frames chosen
    for (const [id, , , body] of BENTOS) fill(bodies[id], body(false));
  }
  return { el, update, slot, sig: () => JSON.stringify([state.presets.length, lastFrame(spice.shot?.body.passes.plate)]), viewer: () => ({ tool: null }) };
}
