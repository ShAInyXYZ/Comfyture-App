// The LIGHT department: change the light of the shot. Its bentos: RELIGHT (the light to give it, in a few words and a picture of it: Beeble
// SwitchX on a clip, Qwen on a picture), SKY (a new sky or background behind the people: Bria), WEATHER (rain, snow or fog laid over it, free,
// on this machine) and GRADE (a look and its exposure and colour, free). Each look builds on the last: Light works on its own pass if it has
// one, else on the clean-up, else on the footage; "Start over" takes the pass away. The two free tools can show one real frame first.
// Made once and kept: { el, update, sig, slot, viewer }.
import { h } from "./dom.js";
import { spice, edit, setSet, setQuietly, clearPass, workingOn } from "./spice.js";
import { TEMPLATES, FIRST, framesIn } from "./spice-model.js";
import { bento, spicon, ghost, primary, fill, lightKey } from "./spice-ui.js";
import { openWin, defineWindow } from "./spice-win.js";
import { work, inputFor, cloud, freeFx, freeEdit, priceOf, timeIn } from "./spice-engines.js";
import { fxPreview } from "./utensils-fx-api.js";
import { editPreview } from "./utensils-edit-api.js";
import { runnerReady } from "./utensils-cloud.js";
import { slider, chipRow, pictureWell } from "./utensils-fx-controls.js";
import { LIGHTS } from "./utensils-vfx-tools.js";
import { toast } from "./store.js";
import { registerRunner } from "./spice-runs.js";

const GRADES = [["none", "None"], ["warm", "Warm"], ["cool", "Cool"], ["filmic", "Filmic"], ["punchy", "Punchy"], ["faded", "Faded"], ["noir", "Noir"]];
const WEATHERS = [["rain", "Rain"], ["snow", "Snow"], ["fog", "Fog"]];
const set = () => spice.shot.body.set.light;
const ui = { preview: null, asking: false };

const seconds = () => {
  const plate = spice.shot.body.passes.plate;
  return plate?.media.kind === "video" ? framesIn(plate.media.seconds ?? 0, plate.fps ?? 24) / (plate.fps ?? 24) : 1;
};
const isClip = () => spice.shot.body.passes.plate?.media.kind === "video";

// ---------------------------------------------------------------- the runs

/** What each key needs and costs now: { why, cost, free }. */
function plans() {
  const plate = spice.shot.body.passes.plate;
  const l = set();
  const none = !plate ? "Bring the footage to the Plate first" : "";
  const clip = isClip();
  const words = String(l.words || l.look || "").trim();
  return {
    relight: { why: none || (!words ? "Say what light you want first" : clip && !l.reference?.file ? "Add a picture of the light you want first" : ""), cost: clip ? priceOf("beeble", seconds()) : priceOf("qwen", 1), key: clip ? "beeble" : "qwen" },
    sky: { why: none || (!clip ? "The sky is replaced in a clip" : !l.sky?.file ? "Pick the new sky first" : ""), cost: priceOf("background", seconds()) },
    weather: { why: none || (!clip ? "Weather is laid over a clip" : ""), free: true },
    grade: { why: none || (!clip ? "The grade is made on a clip" : ""), free: true },
  };
}

function relight() {
  const shot = spice.shot;
  const l = set();
  const words = String(l.words || l.look).trim();
  const p = plans().relight;
  if (!isClip()) {
    return work("light", "Relight", async (progress, job) => ({ files: await cloud("qwen", { image: shot.body.passes.plate.media, text: `relight the image using ${words}` })(progress, job), from: FIRST }), { note: `${words} · Qwen`, credits: p.cost ?? 0, source: "cloud" });
  }
  return work("light", "Relight", async (progress, job) => {
    const input = await inputFor("light", shot);
    return { files: await cloud("beeble", { video: input.media, image: l.reference, text: words })(progress, job), from: input.from };
  }, { note: `${words} · Beeble`, credits: p.cost ?? 0, source: "cloud" });
}
function replaceSky() {
  const shot = spice.shot;
  const l = set();
  return work("light", "Sky", async (progress, job) => {
    const input = await inputFor("light", shot);
    return { files: await cloud("background", { video: input.media, image: l.sky })(progress, job), from: input.from };
  }, { note: "A new sky · Bria", credits: plans().sky.cost ?? 0, source: "cloud" });
}
function addWeather() {
  const shot = spice.shot;
  const l = set();
  return work("light", "Weather", async (progress, job) => {
    const input = await inputFor("light", shot);
    return { files: await freeFx("weather", { video: input.media.file, kind: l.weather, amount: l.amount, speed: 1, angle: 10 })(progress, job), from: input.from };
  }, { note: `${l.weather} · ffmpeg`, source: "free" });
}
function grade() {
  const shot = spice.shot;
  const l = set();
  return work("light", "Grade", async (progress, job) => {
    const input = await inputFor("light", shot);
    return { files: await freeEdit("grade", { video: input.media.file, preset: l.grade, exposure: l.exposure, contrast: l.contrast, saturation: l.saturation })(progress, job), from: input.from };
  }, { note: `${l.grade} · ffmpeg`, source: "free" });
}

/** One real frame of what a free tool would make, at the frame the viewer is on. */
async function peek(tool) {
  const shot = spice.shot;
  const l = set();
  if (ui.asking) return;
  ui.asking = true;
  try {
    const input = await inputFor("light", shot);
    const at = timeIn(input, spice.frame, shot.body.passes.plate.fps ?? 24);
    const { url } = tool === "weather"
      ? await fxPreview("weather", { video: input.media.file, kind: l.weather, amount: l.amount, speed: 1, angle: 10 }, at)
      : await editPreview("grade", { video: input.media.file, preset: l.grade, exposure: l.exposure, contrast: l.contrast, saturation: l.saturation }, at);
    ui.preview = { url, frame: spice.frame, sig: previewSig(tool), tool };
  } catch (e) {
    toast(`Preview: ${e.message}`, { tone: "crit" });
  } finally {
    ui.asking = false;
    edit(() => {});
  }
}
const previewSig = (tool) => JSON.stringify(tool === "weather" ? [tool, set().weather, set().amount] : [tool, set().grade, set().exposure, set().contrast, set().saturation]);

registerRunner("light", (tool = spice.tool.light) => {
  const p = plans();
  if (tool === "weather") return { label: "Add the weather", free: true, why: p.weather.why, run: addWeather };
  if (tool === "grade") return { label: "Grade it", free: true, why: p.grade.why, run: grade };
  if (tool === "sky") return { label: "Replace the sky", cost: p.sky.cost, why: p.sky.why, run: replaceSky };
  return { label: "Relight", cost: p.relight.cost, why: p.relight.why, run: relight };
});

// ---------------------------------------------------------------- the bentos' bodies

const pic = (value, label, hint, key) => pictureWell({ value, label, hint, pick: (p) => setSet("light", { [key]: p }), clear: () => setSet("light", { [key]: null }) });

/** The relight key follows the words as they are typed (typing does not draw the department again). */
function lit() {
  const p = plans().relight;
  lightKey("light:relight", !!p.why || !runnerReady(), p.why || TEMPLATES[p.key].about);
}

function relightBody() {
  const l = set();
  const p = plans().relight;
  const busy = workingOn("light");
  const words = h("textarea.ut-words.sp-words", {
    rows: 2, placeholder: "warm golden light from the left", value: l.words ?? "", "aria-label": "The light you want",
    on: { input: (e) => (setQuietly("light", { words: e.target.value }), lit()), change: () => edit(() => {}) },
  });
  return h("div.sp-relight", {},
    h("div.sp-looks", {}, chipRow(LIGHTS.map(([text, name]) => [text, name, text]), l.words || l.look, (v) => setSet("light", { look: v, words: v }))),
    words,
    isClip() ? h("div.sp-ref", {}, h("span.ut-label", {}, "A picture of that light"), pic(l.reference, "A picture of the light", "the mood to match", "reference")) : null,
    h("div.sp-relight-key", {},
      primary({ id: "light:relight", label: "Relight", cost: p.cost, working: !!busy && busy.label === "Relight", disabled: !!p.why || !runnerReady(), title: p.why || TEMPLATES[p.key].about, run: relight }),
      spice.shot.body.passes.light ? ghost("Start over", () => clearPass("light"), { icon: spicon("trash"), title: "Take the Light pass away: the next look starts from the clean-up" }) : null));
}
function skyBody() {
  const l = set();
  const p = plans().sky;
  const busy = workingOn("light");
  return h("div.sp-sky", {}, pic(l.sky, "A new sky or background", "a picture of it", "sky"),
    primary({ id: "light:sky", label: "Replace the sky", cost: p.cost, working: !!busy && busy.label === "Sky", disabled: !!p.why || !runnerReady(), title: p.why || TEMPLATES.background.about, run: replaceSky }));
}
function weatherBody() {
  const l = set();
  const p = plans().weather;
  const busy = workingOn("light");
  return h("div.sp-weather", {},
    chipRow(WEATHERS, l.weather, (v) => setSet("light", { weather: v })),
    h("div.sp-mix-row", {}, h("span.ut-label", {}, "Amount"), slider({ value: l.amount, min: 0, max: 1, step: 0.01, show: (v) => v.toFixed(2), label: "Amount", set: (v, quiet) => (quiet ? setQuietly("light", { amount: v }) : setSet("light", { amount: v })) })),
    h("div.sp-keys", {}, ghost("Preview 1 frame", () => peek("weather"), { icon: spicon("eye"), disabled: !!p.why || ui.asking, title: p.why || "One real frame of it, at the playhead" })),
    primary({ id: "light:weather", label: "Add the weather", working: !!busy && busy.label === "Weather", disabled: !!p.why, title: p.why || "Free, on this machine", run: addWeather }));
}
function gradeBody() {
  const l = set();
  const p = plans().grade;
  const busy = workingOn("light");
  const row = (label, key, min, max) => h("div.sp-mix-row", {}, h("span.ut-label", {}, label), slider({ value: l[key], min, max, step: 0.01, show: (v) => v.toFixed(2), label, set: (v, quiet) => (quiet ? setQuietly("light", { [key]: v }) : setSet("light", { [key]: v })) }));
  return h("div.sp-grade", {},
    chipRow(GRADES, l.grade, (v) => setSet("light", { grade: v })),
    row("Exposure", "exposure", -1, 1), row("Saturation", "saturation", 0, 3),
    h("div.sp-keys", {}, ghost("Preview 1 frame", () => peek("grade"), { icon: spicon("eye"), disabled: !!p.why || ui.asking, title: p.why || "One real frame of it, at the playhead" })),
    primary({ id: "light:grade", label: "Grade it", working: !!busy && busy.label === "Grade", disabled: !!p.why, title: p.why || "Free, on this machine", run: grade }));
}

// ---------------------------------------------------------------- the department

const BENTOS = [
  ["relight", "RELIGHT", "sp-side-b.sp-b-relight", relightBody],
  ["sky", "SKY", "sp-b-sky", skyBody],
  ["weather", "WEATHER", "sp-b-weather", weatherBody],
  ["grade", "GRADE", "sp-b-grade", gradeBody],
];
for (const [id, title, , body] of BENTOS) {
  defineWindow(`light-${id}`, {
    eyebrow: "Light", title, size: "s",
    make: () => {
      const el = h("div.sp-w");
      return { el, update: () => fill(el, body()), sig: () => JSON.stringify([spice.shot?.body.set.light, spice.shot?.body.passes.light?.media?.url, !!ui.preview]) };
    },
  });
}

export function lightSpace() {
  const el = h("div.sp-dept.is-light.is-wide");
  const slot = h("div.sp-slot");
  const bentos = Object.fromEntries(BENTOS.map(([id, title, cls]) => [id, bento(cls, title, () => openWin(`light-${id}`))]));
  const bodies = Object.fromEntries(BENTOS.map(([id]) => [id, h("div.sp-b-body")]));
  for (const [id] of BENTOS) bentos[id].append(bodies[id]);
  el.append(slot, bentos.relight, h("div.sp-lower.is-3", {}, bentos.sky, bentos.weather, bentos.grade));
  function update() {
    for (const [id, , , body] of BENTOS) fill(bodies[id], body());
  }
  return {
    el, update, slot,
    sig: () => JSON.stringify([!!ui.preview, ui.asking]),
    // a real frame is shown while it is what the settings say and the viewer is on the frame it was made at
    viewer: () => {
      const v = ui.preview;
      const ok = v && v.sig === previewSig(v.tool);
      return { tool: null, preview: ok ? v : null };
    },
  };
}
