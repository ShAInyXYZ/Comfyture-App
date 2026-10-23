// The COMP department: the stack of every pass, finished and exported. Its bentos: PASSES (what each department made, the frames it worked on
// and what it cost: the ledger of the shot), UPSCALE (the clip restored larger, frame by frame: SeedVR2 on Comfy Cloud), SLOW MOTION (the
// frames between the frames: free with ffmpeg, or FILM on Comfy Cloud) and EXPORT (the comp as an mp4, a webm, a mov or a gif, free). Comp
// works on the top of the stack, and each finish builds on the last; "Start over" takes the Comp pass away. A shot that is a picture is
// upscaled two or four times (4x-UltraSharp on Comfy Cloud) and exported as a PNG, a JPG or a WebP; it has no motion to slow. Made once and
// kept: { el, update, sig, slot, viewer }.
import { h } from "./dom.js";
import { spice, edit, setSet, setPass, clearPass, workingOn, creditsTodayAll } from "./spice.js";
import { PICTURES, TEMPLATES, FIRST, framesIn, topOf, passOf, gpuCredits } from "./spice-model.js";
import { WORKSPACES } from "./spice-harness.js";
import { bento, spicon, ghost, primary, fill, thumb } from "./spice-ui.js";
import { openWin, defineWindow } from "./spice-win.js";
import { work, inputFor, cloud, freeFx, freeEdit, serverJob, priceOf } from "./spice-engines.js";
import { runnerReady } from "./utensils-cloud.js";
import { chipRow } from "./utensils-fx-controls.js";
import { registerRunner } from "./spice-runs.js";

const set = () => spice.shot.body.set.comp;
const HEIGHTS = [[720, "720p"], [1080, "1080p"], [1440, "1440p"]];
const FACTORS = [[1.5, "1.5×"], [2, "2×"], [3, "3×"], [4, "4×"]];
const FORMATS = [["mp4", "MP4"], ["webm", "WebM"], ["mov", "MOV"], ["gif", "GIF"]];
const PICTURE_FORMATS = [["png", "PNG"], ["jpg", "JPG"], ["webp", "WebP"]];
const SCALES = [[2, "2×"], [4, "4×"]];

const plate = () => spice.shot.body.passes.plate;
const clip = () => plate()?.media.kind === "video";
const seconds = () => (clip() ? framesIn(plate().media.seconds ?? 0, plate().fps ?? 24) / (plate().fps ?? 24) : 0);
const upscaleCost = () => (clip() ? Math.max(1, Math.round(Math.min(12, Math.max(1, seconds())) * 20 * 0.266)) : gpuCredits(8, 1));
/** The format an export is made in: the clip's, or the picture's. */
const formatNow = () => (clip() ? set().format : ["png", "jpg", "webp"].includes(set().picFormat) ? set().picFormat : "png");

// ---------------------------------------------------------------- the runs

const upscale = () => {
  const shot = spice.shot;
  if (!clip()) {
    const scale = set().scale === 4 ? 4 : 2;
    return work("comp", "Upscale", async (progress, job) => ({ files: await serverJob("api/utensils/upscale", { source: (await inputFor("comp", shot)).media.file, scale })(progress, job), from: FIRST }), { note: `${scale}× · 4x-UltraSharp`, credits: upscaleCost(), source: "cloud" });
  }
  return work("comp", "Upscale", async (progress, job) => {
    const input = await inputFor("comp", shot);
    return { files: await serverJob("api/utensils/upscale-video", { video: input.media.file, height: set().height })(progress, job), from: input.from };
  }, { note: `${set().height}p · SeedVR2`, credits: upscaleCost(), source: "cloud" });
};
const slow = () => {
  const shot = spice.shot;
  const c = set();
  if (c.engine === "film") {
    return work("comp", "Slow motion", async (progress, job) => {
      const input = await inputFor("comp", shot);
      return { files: await cloud("film", { video: input.media })(progress, job), from: input.from };
    }, { note: "FILM", credits: priceOf("film", seconds()) ?? 0, source: "cloud" });
  }
  return work("comp", "Slow motion", async (progress, job) => {
    const input = await inputFor("comp", shot);
    return { files: await freeFx("slowmo", { video: input.media.file, factor: c.factor, mode: "mci", audio: "mute" })(progress, job), from: input.from };
  }, { note: `${c.factor}× · ffmpeg`, source: "free" });
};
const exportComp = () => {
  const shot = spice.shot;
  const format = formatNow();
  return work("comp", "Export", async (progress, job) => {
    const input = await inputFor("comp", shot);
    return { files: await freeEdit("convert", { video: input.media.file, format, quality: "high", height: 0, fps: 0 })(progress, job), from: input.from };
  }, {
    keep: (m, sh) => {
      edit((b) => (b.set.comp.exports = [{ url: m.url, format, at: new Date().toISOString(), width: m.width, height: m.height, seconds: m.seconds }, ...(b.set.comp.exports ?? [])].slice(0, 6)), sh);
      // an export that is a clip (or a picture of a picture) is the comp as it stands
      if ((format !== "gif" && m.kind === "video") || (m.kind === "image" && format !== "gif")) setPass("comp", m, { from: passOf(sh.body, "comp")?.from ?? FIRST, note: `Exported · ${format}`, credits: 0, label: "Export", source: "free" }, sh);
    },
  });
};

registerRunner("comp", (tool = spice.tool.comp) => {
  const why = !plate() ? "Bring the footage to the Plate first" : tool === "slow" && !clip() ? "A picture has no motion to slow" : "";
  if (tool === "upscale") return { label: "Upscale", cost: upscaleCost(), why, run: upscale };
  if (tool === "slow") return { label: "Slow it", cost: set().engine === "film" ? priceOf("film", seconds()) : 0, free: set().engine !== "film", why, run: slow };
  return { label: "Export", free: true, why, run: exportComp };
});

// ---------------------------------------------------------------- the bentos' bodies

function passesBody() {
  const b = spice.shot.body;
  const top = topOf(b);
  const rows = [...PICTURES.slice(), "roto", "comp"].filter((d, i, a) => a.indexOf(d) === i).sort((x, y) => WORKSPACES.findIndex((w) => w.id === x) - WORKSPACES.findIndex((w) => w.id === y)).map((d) => ({ d, pass: passOf(b, d) })).filter((r) => r.pass?.media).reverse();
  const credits = b.log.reduce((n, e) => n + (Number(e.credits) || 0), 0);
  return h("div.sp-ledger", {},
    h("div.sp-ledger-list", {}, rows.length ? rows.map(({ d, pass }) =>
      h("div.sp-ledger-row", { dataset: { dept: d } }, thumb(pass.media), h("div", {}, h("b", {}, WORKSPACES.find((w) => w.id === d).name), h("span", {}, d === "plate" ? (pass.name ?? "Footage") : pass.note ?? "")), h("em", {}, pass.credits ? `${pass.credits} cr` : d === "plate" || pass.source === "free" ? "free" : ""))) : h("p.sp-hint", {}, "Every pass the departments make is listed here.")),
    h("div.sp-ledger-foot", {}, h("span.ut-label", {}, "On top"), h("b", {}, top ? WORKSPACES.find((w) => w.id === top.dept).name : "Nothing yet"),
      h("span.ut-label", {}, "Spent on this shot"), h("b", {}, `${Math.round(credits)} cr`),
      h("span.ut-label", {}, "Today, every shot"), h("b", {}, `${creditsTodayAll()} cr`)),
    b.passes.comp ? ghost("Start over", () => clearPass("comp"), { icon: spicon("trash"), title: "Take the Comp pass away: the next finish starts from the top of the stack" }) : null);
}
function upscaleBody() {
  const c = set();
  const busy = workingOn("comp");
  const why = !plate() ? "Bring the footage to the Plate first" : "";
  return h("div.sp-finish", {}, h("p.sp-hint", {}, clip() ? "The clip restored larger, frame by frame (SeedVR2, on Comfy Cloud)." : "The picture made larger, its detail kept (4x-UltraSharp, on Comfy Cloud)."),
    clip() ? chipRow(HEIGHTS, c.height, (v) => setSet("comp", { height: v })) : chipRow(SCALES, c.scale === 4 ? 4 : 2, (v) => setSet("comp", { scale: v })),
    primary({ id: "comp:upscale", label: "Upscale", cost: upscaleCost(), working: !!busy && busy.label === "Upscale", disabled: !!why, title: why || "Make it larger", run: upscale }));
}
function slowBody() {
  const c = set();
  const busy = workingOn("comp");
  const why = !plate() ? "Bring the footage to the Plate first" : "";
  const film = c.engine === "film";
  // (a picture has no motion: nothing to slow, and no key that cannot be pressed)
  if (plate() && !clip()) return h("div.sp-finish.is-still", {}, spicon("film"), h("p.sp-hint", {}, "A picture has no motion to slow. Upscale it, then export it."));
  return h("div.sp-finish", {},
    chipRow([["free", "Free"], ["film", "FILM · Cloud"]], c.engine, (v) => setSet("comp", { engine: v }), "Where the frames between are made"),
    film ? h("p.sp-hint", {}, TEMPLATES.film.about) : chipRow(FACTORS, c.factor, (v) => setSet("comp", { factor: v })),
    primary({ id: "comp:slow", label: "Slow it", cost: film ? priceOf("film", seconds()) : undefined, working: !!busy && busy.label === "Slow motion", disabled: !!why || (film && !runnerReady()), title: why || (film ? "FILM makes the frames between the frames" : "Smooth slow motion, free, on this machine"), run: slow }));
}
function exportBody() {
  const c = set();
  const busy = workingOn("comp");
  const why = !plate() ? "Bring the footage to the Plate first" : "";
  const last = (c.exports ?? [])[0];
  return h("div.sp-finish", {},
    clip() ? chipRow(FORMATS, c.format, (v) => setSet("comp", { format: v })) : chipRow(PICTURE_FORMATS, formatNow(), (v) => setSet("comp", { picFormat: v })),
    last ? h("a.sp-download", { href: `${last.url}?download=${spice.shot.name}`, download: `${spice.shot.name}.${last.format}`, title: "Download the last export" }, spicon("download"), h("span", {}, `${last.format.toUpperCase()}${last.width ? ` · ${last.width} × ${last.height}` : ""}`)) : h("p.sp-hint", {}, "The top of the stack, in the format you pick. Free."),
    primary({ id: "comp:export", label: "Export", working: !!busy && busy.label === "Export", disabled: !!why, title: why || "Free, on this machine", run: exportComp }));
}

// ---------------------------------------------------------------- the department

const BENTOS = [
  ["passes", "PASSES", "sp-side-b.sp-b-passes", passesBody],
  ["upscale", "UPSCALE", "sp-b-upscale", upscaleBody],
  ["slow", "SLOW MOTION", "sp-b-slow", slowBody],
  ["export", "EXPORT", "sp-b-export", exportBody],
];
for (const [id, title, , body] of BENTOS) {
  defineWindow(`comp-${id}`, {
    eyebrow: "Comp", title, size: "s",
    make: () => {
      const el = h("div.sp-w");
      return { el, update: () => fill(el, body()), sig: () => JSON.stringify([spice.shot?.body.set.comp, spice.shot?.body.passes, spice.shot?.body.log.length]) };
    },
  });
}

export function compSpace() {
  const el = h("div.sp-dept.is-comp.is-wide");
  const slot = h("div.sp-slot");
  const bentos = Object.fromEntries(BENTOS.map(([id, title, cls]) => [id, bento(cls, title, () => openWin(`comp-${id}`))]));
  const bodies = Object.fromEntries(BENTOS.map(([id]) => [id, h("div.sp-b-body")]));
  for (const [id] of BENTOS) bentos[id].append(bodies[id]);
  el.append(slot, bentos.passes, h("div.sp-lower.is-3", {}, bentos.upscale, bentos.slow, bentos.export));
  function update() {
    for (const [id, , , body] of BENTOS) fill(bodies[id], body());
  }
  return { el, update, slot, sig: () => "", viewer: () => ({ tool: null }) };
}
