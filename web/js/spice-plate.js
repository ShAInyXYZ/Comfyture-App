// The PLATE department: the footage of the shot. Its bentos: FOOTAGE (import a clip or a picture, or take one of your takes), TRIM (the
// frame range the shot is worked on: every engine takes the footage cut to it) and DEPTH (an analysis pass read from the footage, a depth
// map of every frame). Plate has no pass of its own to make: the footage is the pass. Made once and kept: { el, update, sig, slot }.
import { h } from "./dom.js";
import { state } from "./store.js";
import { spice, edit, setPass, clearPass, workingOn } from "./spice.js";
import { FIRST, lastFrame, rangeOf, rangeText, framesIn, TEMPLATES } from "./spice-model.js";
import { bento, spicon, iconKey, ghost, primary, fill, thumb } from "./spice-ui.js";
import { openWin, defineWindow } from "./spice-win.js";
import { work, footage, cloud, importFootage, useClip, pickFile, priceOf } from "./spice-engines.js";
import { runnerReady } from "./utensils-cloud.js";
import { registerRunner } from "./spice-runs.js";

const clock = (s) => `${Math.floor(Math.max(0, s) / 60)}:${(Math.max(0, s) % 60).toFixed(1).padStart(4, "0")}`;

/** The takes of the app (and its films) a shot can start from, newest first. */
function takesOf() {
  const takes = state.runs.filter((r) => r.status === "done" && r.video).map((r) => ({ name: r.request?.name ?? "Take", seconds: r.length ?? r.request?.seconds, still: r.still, source: { run: r.id }, date: r.createdAt }));
  const films = (state.films ?? []).map((f) => ({ name: f.name, seconds: f.seconds, still: f.still, source: { film: f.id }, date: f.createdAt }));
  return [...takes, ...films].sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? ""))).slice(0, 8);
}

// ---------------------------------------------------------------- the bentos' bodies (a window shows the same, larger)

/** What the footage is, in a few lines, and the keys to replace it. */
function footageBody(big) {
  const p = spice.shot.body.passes.plate;
  const busy = workingOn("plate");
  if (!p) {
    return h("div.sp-footage", {},
      h("button.sp-well", { type: "button", disabled: !!busy, on: { click: () => pickFile(importFootage) } }, spicon("upload"), h("b", {}, busy ? "Importing" : "Drop a clip or a picture"), h("span", {}, "or paste it, or click to pick one")),
      takeList(big));
  }
  const m = p.media;
  const r = rangeOf(spice.shot.body);
  return h("div.sp-footage", {},
    h("div.sp-clip", {},
      thumb(m, { cls: "is-big" }),
      h("div.sp-clip-text", {}, h("b", {}, p.name ?? "Footage"), h("span", {}, `${m.width} × ${m.height}${m.kind === "video" ? ` · ${p.fps ?? 24} fps` : " · a picture"}`), h("span", {}, m.kind === "video" ? `${clock(m.seconds ?? 0)} · ${framesIn(m.seconds ?? 0, p.fps ?? 24)} frames` : "one frame"))),
    h("div.sp-keys", {},
      ghost("Replace", () => pickFile(importFootage), { icon: spicon("upload"), title: "Another clip or picture: the passes made of this one are kept" }),
      ghost("Take away", () => clearPass("plate"), { icon: spicon("trash"), title: "Take the footage out of the shot" })),
    takeList(big));
}
function takeList(big) {
  const list = takesOf();
  if (!list.length) return h("p.sp-hint", {}, "Your takes and films show here, to start a shot from.");
  return h("div.sp-takes", {}, h("span.ut-label", {}, "From your takes"),
    h(`div.sp-take-grid${big ? ".is-big" : ""}`, {}, ...list.map((t) =>
      h("button.sp-take", { type: "button", title: `${t.name}${t.seconds ? ` · ${Math.round(t.seconds)} s` : ""}`, on: { click: () => useClip(t.source) } },
        t.still ? h("img", { src: t.still, alt: "", draggable: false, loading: "lazy" }) : spicon("film"),
        h("span", {}, t.name)))));
}

/** The range: in and out as frames, set to the playhead or stepped; what it comes to in seconds. */
function trimBody() {
  const b = spice.shot.body;
  const plate = b.passes.plate;
  if (!plate) return h("p.sp-hint", {}, "Bring the footage first: its frames are trimmed here.");
  const last = lastFrame(plate);
  const r = rangeOf(b);
  const fps = plate.fps ?? 24;
  const set = (inn, out) => edit((x) => (x.range = inn <= FIRST && out >= last ? null : { in: inn, out }));
  const field = (label, value, onSet) =>
    h("div.sp-trim-field", {},
      h("span.ut-label", {}, label),
      h("div.ut-stepper", {},
        h("button", { type: "button", "aria-label": `${label} one frame earlier`, on: { click: () => onSet(value - 1) } }, "−"),
        h("span", {}, String(value)),
        h("button", { type: "button", "aria-label": `${label} one frame later`, on: { click: () => onSet(value + 1) } }, "+")),
      iconKey(spicon("diamond"), `Set the ${label.toLowerCase()} at the playhead`, () => onSet(spice.frame)));
  const trimmed = r.in > FIRST || r.out < last;
  return h("div.sp-trim", {},
    h("div.sp-trim-big", {}, h("b", {}, rangeText(r)), h("span", {}, `${r.out - r.in + 1} frames · ${clock((r.out - r.in + 1) / fps)}`)),
    h("div.sp-trim-fields", {}, field("In", r.in, (v) => set(Math.min(Math.max(FIRST, v), r.out), r.out)), field("Out", r.out, (v) => set(r.in, Math.max(Math.min(last, v), r.in)))),
    h("div.sp-keys", {}, ghost("Whole clip", () => set(FIRST, last), { icon: spicon("loop"), disabled: !trimmed, title: "Work on every frame again" })),
    h("p.sp-hint", {}, trimmed ? "Every engine takes the footage cut to this range." : "The whole clip. Set an in and an out to work on a part of it."));
}

/** What reading the depth needs and costs now. */
function depthPlan() {
  const plate = spice.shot.body.passes.plate;
  const ok = !!plate;
  // (a picture's depth is read by the picture template; a clip's frame by frame)
  const pic = plate?.media.kind === "image";
  const seconds = ok && !pic ? framesIn(plate.media.seconds ?? 0, plate.fps ?? 24) / (plate.fps ?? 24) : 1;
  return { ok, pic, seconds, cost: ok ? priceOf(pic ? "depthpic" : "depth", seconds) : undefined, why: !ok ? "Bring the footage to the Plate first" : !runnerReady() ? "The template runner is not on this page yet" : "" };
}
function readDepth() {
  const { seconds, pic } = depthPlan();
  const credits = priceOf(pic ? "depthpic" : "depth", seconds) ?? 0;
  if (pic) {
    return work("plate", "Depth", async (set, job) => cloud("depthpic", { image: await footage() })(set, job), {
      credits, note: "Depth Anything 3", source: "cloud",
      keep: (m, shot) => setPass("depth", m, { from: FIRST, note: "Depth Anything 3", credits, label: "Depth", source: "cloud" }, shot),
    });
  }
  // (the template reads five seconds unless told the clip's own length)
  return work("plate", "Depth", async (set, job) => { const v = await footage(); return cloud("depth", { video: v }, { extra: { start_time: 0, duration: Math.max(1, Math.ceil(v.seconds ?? seconds ?? 5)) } })(set, job); }, {
    credits, note: "Depth Anything 3", source: "cloud",
    keep: (m, shot) => setPass("depth", m, { from: rangeOf(shot.body).in, note: "Depth Anything 3", credits, label: "Depth", source: "cloud" }, shot),
  });
}
registerRunner("plate", () => {
  const p = depthPlan();
  return { label: "Read the depth", cost: p.cost, why: p.why, run: readDepth };
});

/** The depth read from the footage: a pass of its own, shown or hidden beside the others. */
function depthBody() {
  const b = spice.shot.body;
  const d = b.depth;
  const busy = workingOn("plate");
  const p = depthPlan();
  return h("div.sp-depth", {},
    h("div.sp-depth-pic", {}, d?.media ? thumb(d.media, { cls: "is-big" }) : h("span.sp-thumb.is-empty.is-big", {}, spicon("film")),
      d ? iconKey(spicon(d.eye === false ? "eyeOff" : "eye"), d.eye === false ? "Show the depth in the viewer" : "Hide the depth in the viewer", () => edit((x) => (x.depth.eye = x.depth.eye === false)), { cls: "is-over" }) : null),
    h("div.sp-depth-text", {}, h("b", {}, d ? "Depth read" : "Depth"), h("span", {}, d ? `${TEMPLATES[p.pic ? "depthpic" : "depth"].title} · ${d.credits ? `${d.credits} cr` : "free"}` : TEMPLATES[p.pic ? "depthpic" : "depth"].about)),
    h("div.sp-keys", {},
      primary({ id: "plate:depth", label: d ? "Read it again" : "Read the depth", cost: p.cost, working: !!busy && busy.label === "Depth", disabled: !!p.why, title: p.why || TEMPLATES[p.pic ? "depthpic" : "depth"].about, run: readDepth }),
      d ? ghost("Take it away", () => clearPass("depth"), { icon: spicon("trash") }) : null));
}

// ---------------------------------------------------------------- the department

const BENTOS = [
  ["footage", "FOOTAGE", "sp-side-b.sp-b-footage", footageBody],
  ["trim", "TRIM", "sp-b-trim", trimBody],
  ["depth", "ANALYSIS", "sp-b-depth", depthBody],
];
for (const [id, title, , body] of BENTOS) {
  defineWindow(`plate-${id}`, {
    eyebrow: "Plate", title, size: id === "footage" ? "m" : "s",
    make: () => {
      const el = h("div.sp-w");
      return { el, update: () => fill(el, body(true)), sig: () => JSON.stringify([spice.shot?.body.passes.plate, spice.shot?.body.range, spice.shot?.body.depth, state.runs.length]) };
    },
  });
}

export function plateSpace() {
  const el = h("div.sp-dept.is-plate.is-wide");
  const slot = h("div.sp-slot");
  const bentos = Object.fromEntries(BENTOS.map(([id, title, cls]) => [id, bento(cls, title, () => openWin(`plate-${id}`))]));
  const bodies = Object.fromEntries(BENTOS.map(([id]) => [id, h("div.sp-b-body")]));
  for (const [id] of BENTOS) bentos[id].append(bodies[id]);
  el.append(slot, bentos.footage, h("div.sp-lower.is-2", {}, bentos.trim, bentos.depth));
  function update() {
    for (const [id, , , body] of BENTOS) fill(bodies[id], body(false));
  }
  return { el, update, slot, sig: () => JSON.stringify([state.runs.length, state.films?.length]), viewer: () => ({ tool: null }) };
}
