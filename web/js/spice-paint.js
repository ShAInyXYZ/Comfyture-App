// The PAINT department: clean up the shot. Its bentos: TARGET (what is in the way: an object told by its name, a spot painted over in the
// viewer, a logo or a watermark, the subtitles; the yellow key removes it), ENGINE (which model takes an object out: VOID, Obscura Remova or
// Wan VACE; a spot is free and runs on this machine with ffmpeg), BRUSH (the brush that paints the spot, over the viewer) and PASS (what was
// made, and the hand-off to Light). Paint works on the footage: the clean-up is made before the light. Made once and kept:
// { el, update, sig, slot, viewer, mask }.
import { h, sprite } from "./dom.js";
import { changed } from "./store.js";
import { spice, edit, setSet, setQuietly, setDept, clearPass, workingOn } from "./spice.js";
import { REMOVERS, TEMPLATES, framesIn, voidExtra } from "./spice-model.js";
import { bento, spicon, iconKey, ghost, primary, fill, thumb, lightKey } from "./spice-ui.js";
import { openWin, defineWindow } from "./spice-win.js";
import { work, inputFor, cloud, freeFx, priceOf } from "./spice-engines.js";
import { runnerReady } from "./utensils-cloud.js";
import { slider } from "./utensils-fx-controls.js";
import { registerRunner } from "./spice-runs.js";

const TARGETS = [
  { id: "describe", name: "Object", about: "Tell it by its name and it is painted out, with its shadows", icon: "tool-fx-remove" },
  { id: "brush", name: "Spot", about: "Paint over it in the viewer: free, on this machine, for what does not move", icon: "tool-fx-brush" },
  { id: "logo", name: "Logo", about: "A logo or a watermark taken out of the footage", icon: "tool-edit-logo" },
  { id: "subtitles", name: "Subtitles", about: "Burnt-in subtitles taken off", icon: "tool-edit-captions" },
];
const set = () => spice.shot.body.set.paint;
let masked = false;
/** Whether something is painted on the viewer (told by the viewer: spice-viewer.js). */
export const maskedNow = () => masked;

/** What the yellow key does now, what it costs, and what stops it. */
function plan() {
  const b = spice.shot.body;
  const p = b.set.paint;
  const plate = b.passes.plate;
  const seconds = plate?.media.kind === "video" ? framesIn(plate.media.seconds ?? 0, plate.fps ?? 24) / (plate.fps ?? 24) : 0;
  const engine = REMOVERS.includes(p.engine) ? p.engine : "void";
  const t = p.how === "logo" ? "watermark" : p.how === "subtitles" ? "subtitles" : engine;
  const base = { engine, template: t, seconds };
  if (!plate) return { ...base, why: "Bring the footage to the Plate first", label: "Remove it" };
  if (plate.media.kind !== "video") return { ...base, why: "Paint works on a clip: this shot is a picture", label: "Remove it" };
  if (p.how === "brush") return { ...base, label: "Remove the spot", why: masked ? "" : "Paint over the spot in the viewer first", free: true };
  if (p.how === "describe") return { ...base, label: "Remove it", why: String(p.words ?? "").trim() ? "" : "Say what to remove first", cost: priceOf(t, seconds), needs: "words" };
  return { ...base, label: p.how === "logo" ? "Take the logo out" : "Take the subtitles off", why: "", cost: priceOf(t, seconds) };
}

function run(viewer) {
  const shot = spice.shot;
  const p = shot.body.set.paint;
  const pl = plan();
  if (pl.free) {
    const mask = viewer.maskPNG();
    return work("paint", "Spot removed", async (progress, job) => {
      const input = await inputFor("paint", shot);
      return { files: await freeFx("unlogo", { video: input.media.file, grow: 2, mask })(progress, job), from: input.from };
    }, { note: "A spot removed · ffmpeg", source: "free" }).then((m) => m && viewer.clearMask());
  }
  const words = String(p.words ?? "").trim();
  return work("paint", p.how === "describe" ? `Remove ${words}` : TARGETS.find((t) => t.id === p.how).name, async (progress, job) => {
    const input = await inputFor("paint", shot);
    const m = input.media;
    const given = { video: m };
    // VOID takes its object and the place without it as two sets of words; Obscura one sentence; the LTX clean-ups compare the clip with
    // itself (their "before" is the same clip)
    let extra;
    if (p.how !== "describe") extra = { before_video: m };
    else if (pl.engine === "void") extra = voidExtra(words, p.after, { width: m.width, height: m.height, seconds: m.seconds });
    else given.text = /^remove/i.test(words) ? words : `Remove ${words}.`;
    return { files: await cloud(pl.template, given, { extra })(progress, job), from: input.from };
  }, { note: `${p.how === "describe" ? words : TARGETS.find((t) => t.id === p.how).name} · ${TEMPLATES[pl.template].title}`, credits: pl.cost ?? 0, source: "cloud" });
}

// ---------------------------------------------------------------- the bentos' bodies

/** The key follows the words as they are typed (typing does not draw the department again). */
function lit() {
  const pl = plan();
  lightKey("paint:run", !!pl.why || (!pl.free && !runnerReady()), pl.why || (pl.free ? "Free, on this machine" : TEMPLATES[pl.template].about));
}

function targetBody(viewer) {
  return (big) => {
    const p = set();
    const pl = plan();
    const busy = workingOn("paint");
    const words = h("textarea.ut-words.sp-words", {
      rows: 2, placeholder: "The sign on the wall, the man in the background…", value: p.words ?? "", "aria-label": "What to remove", hidden: p.how !== "describe",
      on: { input: (e) => (setQuietly("paint", { words: e.target.value }), lit()), change: () => edit(() => {}) },
    });
    return h("div.sp-target", {},
      h("div.sp-target-tiles", {}, ...TARGETS.map((t) =>
        h("button.sp-target-tile", { type: "button", "aria-pressed": String(p.how === t.id), dataset: { how: t.id }, title: `${t.name} — ${t.about}`, on: { click: () => setSet("paint", { how: t.id }) } },
          sprite(t.icon), h("b", {}, t.name), h("span", {}, t.about)))),
      words,
      p.how === "describe" && pl.engine === "void" ? h("input.ut-words.sp-after", {
        value: p.after ?? "", placeholder: "What's left: an empty street, a bare wall…", "aria-label": "What the place looks like once it is gone", title: "VOID fills the space from these words: say what is there without it, not what goes",
        on: { input: (e) => setQuietly("paint", { after: e.target.value }), change: () => edit(() => {}) },
      }) : null,
      p.how !== "describe" ? h("p.sp-hint", {}, p.how === "brush" ? "Paint over the spot in the viewer. It is taken out of every frame, so it is for what stays where it is: a sign, a mark on a wall." : p.how === "logo" ? "The logo or the watermark is found and taken out of the footage." : "The subtitles are found and taken off.") : null,
      h("div.sp-target-key", {}, primary({ id: "paint:run", label: pl.label, cost: pl.free ? undefined : pl.cost, working: !!busy, disabled: !!pl.why || (!pl.free && !runnerReady()), title: pl.why || (pl.free ? "Free, on this machine" : TEMPLATES[pl.template].about), run: () => run(viewer) })));
  };
}

function engineBody() {
  const p = set();
  const pl = plan();
  const seconds = pl.seconds;
  if (p.how === "brush") return h("div.sp-engine", {}, h("b", {}, "ffmpeg"), h("p.sp-hint", {}, "The spot is filled from what is around it, on every frame. Free, on this machine: nothing is sent anywhere."));
  if (p.how !== "describe") return h("div.sp-engine", {}, h("b", {}, TEMPLATES[pl.template].title), h("p.sp-hint", {}, TEMPLATES[pl.template].about), h("span.sp-engine-price", {}, typeof pl.cost === "number" ? `≈ ${pl.cost} cr` : "≈ ? cr"));
  return h("div.sp-engine", {}, ...REMOVERS.map((id) => {
    const t = TEMPLATES[id];
    return h("button.sp-engine-row", { type: "button", "aria-pressed": String(pl.engine === id), dataset: { engine: id }, title: t.about, on: { click: () => setSet("paint", { engine: id }) } },
      h("b", {}, t.title), h("em", {}, `≈ ${priceOf(id, seconds)} cr`));
  }), h("p.sp-hint", {}, TEMPLATES[pl.engine].about));
}

function brushBody(viewer) {
  return () => {
    const p = set();
    const on = p.how === "brush";
    return h("div.sp-brush", {},
      h("div.sp-keys", {},
        iconKey(spicon("brush"), "Paint the spot", () => setSet("paint", { brush: "brush" }), { pressed: (p.brush ?? "brush") === "brush", disabled: !on }),
        iconKey(spicon("eraser"), "Rub out what was painted", () => setSet("paint", { brush: "eraser" }), { pressed: p.brush === "eraser", disabled: !on }),
        ghost("Clear", () => viewer.clearMask(), { icon: spicon("trash"), disabled: !on || !masked, title: "Take the whole mask off" })),
      h("div.sp-brush-size", {}, h("span.ut-label", {}, "Size"), slider({ value: p.size ?? 60, min: 8, max: 200, step: 1, show: (v) => String(Math.round(v)), label: "Brush size", set: (v, quiet) => (quiet ? setQuietly("paint", { size: v }) : setSet("paint", { size: v })) })),
      h("p.sp-hint", {}, on ? (masked ? "The spot is marked in yellow." : "Paint over the spot in the viewer.") : "The brush is for the Spot target."));
  };
}

function passBody() {
  const b = spice.shot.body;
  const pass = b.passes.paint;
  return h("div.sp-pass", {},
    h("div.sp-pass-pic", {}, pass?.media ? thumb(pass.media, { cls: "is-big" }) : h("span.sp-thumb.is-empty.is-big", {}, spicon("film"))),
    h("div.sp-pass-text", {}, h("b", {}, pass ? "Cleaned" : "Nothing yet"), h("span", {}, pass ? `${pass.note ?? ""}${pass.credits ? ` · ${pass.credits} cr` : ""}` : "What is removed shows on the right of the wipe.")),
    h("div.sp-keys", {},
      pass ? h("button.sp-primary", { type: "button", title: "Hand the clean footage on to Light", on: { click: () => setDept("light") } }, h("span", {}, "Pass to Light"), spicon("arrow")) : null,
      pass ? ghost("Take it away", () => clearPass("paint"), { icon: spicon("trash") }) : null));
}

// ---------------------------------------------------------------- the department

export function paintSpace(viewer) {
  const BENTOS = [
    ["target", "TARGET", "sp-side-b.sp-b-target", targetBody(viewer)],
    ["engine", "ENGINE", "sp-b-engine", engineBody],
    ["brush", "BRUSH", "sp-b-brush", brushBody(viewer)],
    ["pass", "PASS", "sp-b-pass", passBody],
  ];
  for (const [id, title, , body] of BENTOS) {
    if (defined.has(id)) continue;
    defined.add(id);
    defineWindow(`paint-${id}`, {
      eyebrow: "Paint", title, size: id === "target" ? "m" : "s",
      make: () => {
        const el = h("div.sp-w");
        return { el, update: () => fill(el, body(true)), sig: () => JSON.stringify([spice.shot?.body.set.paint, spice.shot?.body.passes.paint?.media?.url, masked]) };
      },
    });
  }
  registerRunner("paint", () => {
    const pl = plan();
    return { label: pl.label, cost: pl.cost, free: !!pl.free, why: pl.why, run: () => run(viewer) };
  });
  const el = h("div.sp-dept.is-paint.is-tall");
  const slot = h("div.sp-slot");
  const bentos = Object.fromEntries(BENTOS.map(([id, title, cls]) => [id, bento(cls, title, () => openWin(`paint-${id}`))]));
  const bodies = Object.fromEntries(BENTOS.map(([id]) => [id, h("div.sp-b-body")]));
  for (const [id] of BENTOS) bentos[id].append(bodies[id]);
  el.append(slot, bentos.target, h("div.sp-lower.is-3", {}, bentos.engine, bentos.brush, bentos.pass));
  function update() {
    for (const [id, , , body] of BENTOS) fill(bodies[id], body(false));
  }
  return {
    el, update, slot,
    sig: () => JSON.stringify([masked]),
    // what is painted on the viewer tells the department (the key waits for it)
    mask: (has) => {
      masked = has;
      changed("spice");
    },
    viewer: () => {
      const p = set();
      const tool = p.how === "brush" && spice.shot.body.passes.plate?.media.kind === "video" ? "mask" : null;
      return { tool, brush: { tool: p.brush ?? "brush", size: p.size ?? 60 }, hint: tool && !masked ? "Paint over the spot to remove" : null };
    },
  };
}
const defined = new Set();
