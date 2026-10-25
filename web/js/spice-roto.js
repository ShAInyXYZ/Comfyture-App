// The ROTO department: cut subjects out of the shot. Its bentos: SUBJECTS (each a round picture, a name and a lamp: green tracked, amber
// tracking, hollow not tracked; "Click a subject" arms the viewer, where a click puts a green + on the subject and Shift a red − on what
// it is not), EDGE (a magnified edge of the matte and the feather and the choke), TRACK (the frames of the shot with the matte's keyframes
// as diamonds) and OUT (what Roto hands on: the alpha, the subject on green, or the holdout; the yellow key tracks the subject picked,
// then passes the matte to Paint). A subject is cut out by the SAM3 template (utility_video_segment_sam3) from its name and its clicks;
// the green screen is Bria's. Made once and kept: { el, update, sig, slot, viewer, point, frame }.
import { h } from "./dom.js";
import { changed } from "./store.js";
import { spice, edit, setSet, setQuietly, setDept, setFrame, setPass, workingOn } from "./spice.js";
import { FIRST, lastFrame, rangeOf, framesIn, matteAsk, OUTS, TEMPLATES, secondsAt } from "./spice-model.js";
import { bento, spicon, iconKey, primary, fill, thumb, svg } from "./spice-ui.js";
import { openWin, defineWindow } from "./spice-win.js";
import { work, footage, cloud, serverJob, priceOf } from "./spice-engines.js";
import { runnerReady } from "./utensils-cloud.js";
import { stripOf } from "./spice-viewer.js";
import { slider } from "./utensils-fx-controls.js";
import { registerRunner } from "./spice-runs.js";

const roto = () => spice.shot.body.set.roto;
const newId = () => `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const NAMES = ["Subject", "Another subject", "A third subject"];

/** The subject open, else the first. */
const openSubject = () => roto().subjects.find((s) => s.id === roto().open) ?? roto().subjects[0] ?? null;

/** The matte of the shot: the first subject tracked and shown (Roto's pass in the stack). */
function syncPass(b) {
  const first = b.set.roto.subjects.find((s) => s.media && s.eye !== false);
  const kept = b.passes.roto;
  if (first) b.passes.roto = { ...(kept ?? {}), media: first.media, eye: kept?.eye ?? true, from: first.from, to: first.to, note: `${first.name} · ${TEMPLATES.sam3.title}`, type: "matte", at: first.at, credits: first.credits };
  else if (kept?.type !== "green") b.passes.roto = null;
}

// ---------------------------------------------------------------- what the viewer's clicks do

function addPoint(p) {
  edit((b) => {
    const r = b.set.roto;
    let s = r.subjects.find((x) => x.id === r.open);
    if (r.open === "new" || !s) {
      s = { id: newId(), name: NAMES[Math.min(r.subjects.length, NAMES.length - 1)], points: [], media: null, eye: true };
      r.subjects.push(s);
      r.open = s.id;
    }
    s.points.push({ x: Math.round(p.x * 1000) / 1000, y: Math.round(p.y * 1000) / 1000, frame: spice.frame, ...(p.neg ? { neg: true } : {}) });
    // clicks after the matte was made belong to a new run
    if (s.media) s.stale = true;
  });
}

/** The keyframes of a subject: the frames its clicks were made on. */
const keysOf = (s) => [...new Set((s?.points ?? []).map((p) => p.frame ?? FIRST))].sort((a, b) => a - b);

// ---------------------------------------------------------------- the engines

/** What the yellow key does now: track the subject picked, key the green, or pass the matte to Paint. */
function plan() {
  const b = spice.shot.body;
  const r = b.set.roto;
  const plate = b.passes.plate;
  const s = openSubject();
  const seconds = plate?.media.kind === "video" ? framesIn(plate.media.seconds ?? 0, plate.fps ?? 24) / (plate.fps ?? 24) : 0;
  if (!plate) return { kind: "none", label: "Pass to Paint", why: "Bring the footage to the Plate first" };
  const pic = plate.media.kind === "image";
  if (r.out === "green" && pic) return { kind: "none", label: "Key the green", why: "A picture's subject is cut out as a matte: pick Alpha or Holdout" };
  if (r.out === "green") {
    if (b.passes.roto?.type === "green") return { kind: "pass", label: "Pass to Paint" };
    return { kind: "green", label: "Key the green", cost: priceOf("green", seconds) };
  }
  if (!s) return { kind: "none", label: "Click a subject", why: `Click the subject in the viewer, then ${pic ? "cut it out" : "track it"}` };
  if (!s.media || s.stale) return { kind: "track", label: `${pic ? "Cut out" : "Track"} ${s.name.toLowerCase()}`, cost: priceOf("sam3", pic ? 1 : seconds), subject: s };
  return { kind: "pass", label: "Pass to Paint" };
}

function track(s) {
  const shot = spice.shot;
  const plate = shot.body.passes.plate;
  const pic = plate.media.kind === "image";
  const label = `${pic ? "Cut out" : "Track"} ${s.name}`;
  const seconds = pic ? 1 : framesIn(plate.media.seconds ?? 0, plate.fps ?? 24) / (plate.fps ?? 24);
  const credits = priceOf("sam3", seconds) ?? 0;
  // the subject is found from its first clicks and tracked from that frame to the end of the range (spice-model.js matteAsk)
  const ask = matteAsk(s, plate.media.width, plate.media.height, rangeOf(shot.body).in);
  return work("roto", label, async (progress, job) => {
    const media = await footage(shot);
    // (a picture: the subject cut out where it was clicked, nothing to track)
    const out = pic
      ? await serverJob("api/spice/matte-picture", { picture: media.file, text: ask.text, positive: ask.positive, negative: ask.negative })(progress, job)
      : await serverJob("api/spice/matte", { video: media.file, text: ask.text, positive: ask.positive, negative: ask.negative, key: ask.key })(progress, job);
    return { files: out, from: ask.from };
  }, {
    credits, source: "cloud",
    keep: (m, sh) => {
      const fps = sh.body.passes.plate?.fps ?? 24;
      const from = ask.from;
      edit((b) => {
        const subject = b.set.roto.subjects.find((x) => x.id === s.id);
        if (!subject) return;
        Object.assign(subject, { media: m, stale: false, from, to: m.kind === "video" && m.seconds ? from + framesIn(m.seconds, fps) - 1 : from, at: new Date().toISOString(), credits });
        syncPass(b);
        if (credits > 0) b.log = [...b.log, { at: new Date().toISOString(), dept: "roto", label, credits }].slice(-200);
      }, sh);
    },
  });
}

function keyGreen() {
  const shot = spice.shot;
  const plate = shot.body.passes.plate;
  const seconds = framesIn(plate.media.seconds ?? 0, plate.fps ?? 24) / (plate.fps ?? 24);
  return work("roto", "Green screen", async (progress, job) => ({ files: await cloud("green", { video: await footage(shot) })(progress, job), from: rangeOf(shot.body).in }),
    { credits: priceOf("green", seconds) ?? 0, note: "Subject on green · Bria", source: "cloud", keep: (m, sh) => setPass("roto", m, { from: rangeOf(sh.body).in, to: rangeOf(sh.body).in + framesIn(m.seconds ?? 0, plate.fps ?? 24) - 1, note: "Subject on green · Bria", credits: priceOf("green", seconds) ?? 0, label: "Green screen", source: "cloud" }, sh) ||
      edit((b) => (b.passes.roto.type = "green"), sh) });
}

registerRunner("roto", () => {
  const p = plan();
  return { label: p.label, cost: p.cost, free: p.kind === "pass", why: p.kind === "none" ? p.why : "", run: () => (p.kind === "track" ? track(p.subject) : p.kind === "green" ? keyGreen() : setDept("paint")) };
});

// ---------------------------------------------------------------- the bentos' bodies

const silhouette = '<path d="M12 3.2c2.100 0 3.700 1.800 3.700 4.200 0 1.900-.900 3.400-2.100 4.200 3.700.800 6.400 3 6.400 7.200V20H4.200v-1.200c0-4.200 2.700-6.400 6.400-7.200-1.200-.800-2.100-2.300-2.100-4.200C8.300 5 9.900 3.200 12 3.200z" fill="currentColor"/>';

function subjectsBody(big) {
  const b = spice.shot.body;
  const r = b.set.roto;
  const plate = b.passes.plate;
  const busy = workingOn("roto");
  const armed = spice.pointer === "points" && r.open === "new";
  const pic = plate?.media.still ?? plate?.media.url;
  return h("div.sp-subjects", {},
    h("div.sp-subject-list", {}, ...r.subjects.map((s) => {
      const on = (r.open ?? r.subjects[0]?.id) === s.id;
      const here = busy && (busy.label === `Track ${s.name}` || busy.label === `Cut out ${s.name}`);
      const first = s.points[0];
      const tone = here ? "busy" : s.media && !s.stale ? "done" : "empty";
      // (a picture is cut out, a clip tracked; the still's address above stays `pic`, which the subject's circle shows)
      const still = plate?.media.kind === "image";
      const word = here ? `${still ? "Cutting out" : "Tracking"} ${Math.round((busy.progress ?? 0) * 100)}%` : s.media && !s.stale ? (still ? "Cut out" : "Tracked") : s.stale ? "Clicks changed" : s.points.length ? (still ? "Not cut out" : "Not tracked") : "No clicks yet";
      return h(`div.sp-subject${on ? ".is-on" : ""}`, { dataset: { subject: s.id } },
        h("button.sp-subject-main", { type: "button", "aria-pressed": String(on), title: `${s.name}: ${word}`, on: { click: () => (setSet("roto", { open: s.id }), (spice.pointer = "points")) } },
          // (its face where it was clicked; with no click, its matte; with neither, a plus)
          h("span.sp-subject-pic", { style: pic && first ? { backgroundImage: `url(${pic})`, backgroundSize: "420%", backgroundPosition: `${first.x * 100}% ${first.y * 100}%` } : {} }, pic && first ? null : s.media ? thumb(s.media, { cls: "is-subject" }) : spicon("plus")),
          h("span.sp-subject-text", {},
            h("input.sp-subject-name", { value: s.name, "aria-label": "The subject's name, what it is cut out by", on: { click: (e) => e.stopPropagation(), input: (e) => ((s.name = e.target.value), (s.stale = s.media ? true : s.stale)), change: () => edit(() => {}) } }),
            h("em", {}, word)),
          h("span.sp-lamp", { dataset: { tone } })),
        h("button.sp-eye", { type: "button", disabled: !s.media, "aria-pressed": String(s.eye !== false), title: s.eye === false ? "Show its matte" : "Hide its matte", "aria-label": `${s.name}'s matte`, on: { click: () => edit((x) => { const q = x.set.roto.subjects.find((y) => y.id === s.id); q.eye = q.eye === false; syncPass(x); }) } }, spicon(s.eye === false ? "eyeOff" : "eye")),
        big ? h("button.sp-iconkey.is-quiet", { type: "button", title: "Take this subject out", "aria-label": `Take ${s.name} out`, on: { click: () => edit((x) => { x.set.roto.subjects = x.set.roto.subjects.filter((y) => y.id !== s.id); if (x.set.roto.open === s.id) x.set.roto.open = null; syncPass(x); }) } }, spicon("trash")) : null);
    })),
    h("button.sp-add-subject", { type: "button", disabled: !plate, "aria-pressed": String(armed), title: "Click the subject in the viewer: Shift or Alt for what it is not", on: { click: () => (armed ? ((spice.pointer = null), setSet("roto", { open: r.subjects[0]?.id ?? null })) : ((spice.pointer = "points"), setSet("roto", { open: "new" }))) } },
      spicon(armed ? "close" : "plus"), h("span", {}, armed ? "Click the subject in the viewer" : "Click a subject")),
    big ? h("p.sp-hint", {}, "A subject is cut out by its name and by where it was clicked: a click puts a green + on it, Shift or Alt a red − on what is not it. The name is what the cutting reads, so name it for what it is.") : null);
}

/** The magnified edge: the matte (or the footage, before there is one) four times larger around the subject's first click, with the edge settings on it. */
const focuses = new Map();
/**
 * Where a matte's edge is best judged when the subject was not clicked: the top of what it holds (a head, its hair), found once by
 * reading a small copy of the matte; null until it is read (the bento is drawn again then).
 */
function focusOf(m) {
  if (!m?.url) return null;
  if (focuses.has(m.url)) return focuses.get(m.url);
  focuses.set(m.url, null);
  const read = (src, w, h) => {
    const c = document.createElement("canvas");
    c.width = 96;
    c.height = Math.max(8, Math.round((96 * h) / Math.max(1, w)));
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(src, 0, 0, c.width, c.height);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    // the subject's height (its first and last rows of white), then its left side a sixth of the way down: an edge, black on one side
    const white = (x, y) => d[(y * c.width + x) * 4] > 128;
    const rows = [];
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (white(x, y)) (rows.push(y), (x = c.width));
    if (!rows.length) return;
    const y = Math.round(rows[0] + (rows.at(-1) - rows[0]) / 6);
    let x = 0;
    while (x < c.width && !white(x, y)) x++;
    const at = { x: Math.min(1, (x + 0.5) / c.width), y: y / c.height };
    focuses.set(m.url, at);
    // (the magnifier waiting for it is pointed there at once: the bento is not drawn again for it)
    for (const el of document.querySelectorAll(".sp-edge-zoom[data-focus]")) {
      if (el.dataset.focus !== m.url) continue;
      el.style.setProperty("--ox", `${at.x * 100}%`);
      el.style.setProperty("--oy", `${at.y * 100}%`);
    }
  };
  if (m.kind === "image") {
    const img = new Image();
    img.onload = () => read(img, img.naturalWidth, img.naturalHeight);
    img.src = m.url;
  } else {
    const v = document.createElement("video");
    v.muted = true;
    v.preload = "auto";
    v.onloadeddata = () => read(v, v.videoWidth, v.videoHeight);
    v.src = m.url;
  }
  return null;
}

function edgeBody() {
  const b = spice.shot.body;
  const r = b.set.roto;
  const s = openSubject();
  const matte = (s?.media && s.stale !== true ? s.media : b.passes.roto?.media) ?? null;
  const m = matte ?? b.passes.plate?.media ?? null;
  // (the first click on the subject, else the top of its matte, where its hair is)
  const clicked = s?.points.find((p) => !p.neg);
  const at = clicked ?? focusOf(matte) ?? { x: 0.5, y: 0.25 };
  const zoom = h("div.sp-edge-zoom", { style: { "--ox": `${at.x * 100}%`, "--oy": `${at.y * 100}%` }, dataset: clicked || !matte ? {} : { focus: matte.url } },
    m ? (m.kind === "image" ? h("img.sp-media", { src: m.url, alt: "", draggable: false }) : h("video.sp-media", { src: m.url, muted: true, playsInline: true, preload: "auto" })) : null,
    h("b.sp-chip.is-left", {}, matte ? "4:1" : "4:1 · footage"));
  edgeVideo = zoom.querySelector("video");
  if (edgeVideo) edgeVideo.addEventListener("loadedmetadata", () => frame(), { once: true });
  const row = (label, key, min, max, step) => h("div.sp-edge-row", {}, h("span.ut-label", {}, label), slider({ value: r[key], min, max, step, show: (v) => v.toFixed(1), label, set: (v, quiet) => (quiet ? setQuietly("roto", { [key]: v }) : setSet("roto", { [key]: v })) }));
  return h("div.sp-edge", {}, zoom, row("Feather", "feather", 0, 10, 0.1), row("Choke", "choke", -5, 5, 0.1));
}
let edgeVideo = null;

/** The matte's keyframes along the frames of the shot, as diamonds. */
function trackBody() {
  const b = spice.shot.body;
  const plate = b.passes.plate;
  const r = b.set.roto;
  const s = openSubject();
  // a picture has nothing to track: the bento shows the subject cut out, on the squares a cut-out is judged on
  if (plate?.media.kind === "image") {
    const m = s?.media && !s.stale ? s.media : b.passes.roto?.type === "matte" ? b.passes.roto.media : null;
    return h("div.sp-track.is-picture", {},
      m ? h("div.sp-cutout", { style: { "--pic": `url("${plate.media.url}")`, "--matte": `url("${m.url}")`, aspectRatio: `${plate.media.width} / ${plate.media.height}` } }) : h("p.sp-hint", {}, "A picture is cut out once: click the subject, then cut it out."),
      h("span.sp-track-name", {}, s ? `${s.name} · ${m ? "cut out" : "not cut out yet"}` : "No subject yet"));
  }
  const last = lastFrame(plate);
  const span = Math.max(1, last - FIRST);
  const keys = keysOf(s);
  const strip = plate?.media.kind === "video" ? stripOf(plate.media.file, () => changed("spice")) : null;
  const here = keys.includes(spice.frame);
  const step = (dir) => {
    const to = dir < 0 ? [...keys].reverse().find((k) => k < spice.frame) : keys.find((k) => k > spice.frame);
    if (to !== undefined) setFrame(to);
  };
  return h("div.sp-track", {},
    h("div.sp-track-ends", {}, h("span", {}, String(FIRST)), h("span", {}, String(last))),
    h("div.sp-track-strip", { style: strip?.url ? { backgroundImage: `url(${strip.url})` } : {} }),
    h("div.sp-track-keys", {}, ...keys.map((k) => h("button.sp-diamond", { type: "button", title: `Key at ${k}`, "aria-label": `Key at frame ${k}`, style: { left: `${((k - FIRST) / span) * 100}%` }, on: { click: () => setFrame(k) } }, spicon("diamond")))),
    h("div.sp-track-foot", {},
      iconKey(spicon("first"), "Previous key", () => step(-1), { disabled: !keys.length }),
      iconKey(spicon("diamond"), here ? "A key is here: click the subject to add to it" : "Click the subject at this frame to key it", () => ((spice.pointer = "points"), r.open === "new" || !s ? setSet("roto", { open: "new" }) : changed("spice")), { pressed: here, disabled: !plate }),
      iconKey(spicon("last"), "Next key", () => step(1), { disabled: !keys.length }),
      h("span.sp-track-name", {}, s ? s.name : "No subject yet"),
      s && s.points.length ? iconKey(spicon("trash"), "Take this subject's clicks away", () => edit(() => ((s.points = []), (s.stale = !!s.media)))) : null));
}

function tileArt(id, m) {
  // the matte's own picture when there is one, else a silhouette
  if (m) {
    const art = h("span.sp-out-art", { dataset: { out: id } }, thumb(m, { cls: "is-flat" }));
    return art;
  }
  return h("span.sp-out-art.is-blank", { dataset: { out: id } }, svg("sp-sil", { viewBox: "0 0 24 24" }, silhouette));
}

function outBody() {
  const b = spice.shot.body;
  const r = b.set.roto;
  const s = openSubject();
  const m = (s?.media && !s.stale ? s.media : b.passes.roto?.type === "matte" ? b.passes.roto.media : null) ?? null;
  const p = plan();
  const busy = workingOn("roto");
  const ready = p.kind === "none" ? false : p.kind === "pass" ? true : runnerReady();
  const run = () => (p.kind === "track" ? track(p.subject) : p.kind === "green" ? keyGreen() : setDept("paint"));
  return h("div.sp-out", {},
    h("div.sp-out-tiles", {}, ...OUTS.map((o) =>
      h("button.sp-out-tile", { type: "button", "aria-pressed": String(r.out === o.id), dataset: { out: o.id }, title: `${o.name} — ${o.about}`, on: { click: () => setSet("roto", { out: o.id }) } },
        tileArt(o.id, o.id === "green" ? (b.passes.roto?.type === "green" ? b.passes.roto.media : null) : m), h("span", {}, o.name)))),
    p.kind === "pass"
      ? h("button.sp-primary", { type: "button", title: "Hand the matte on to Paint", on: { click: run } }, h("span", {}, "Pass to Paint"), spicon("arrow"))
      : primary({ id: `roto:${p.kind}`, label: p.label, cost: p.kind === "none" ? undefined : p.cost, working: !!busy, disabled: !ready || p.kind === "none", title: p.why ?? (!runnerReady() ? "The template runner is not on this page yet" : TEMPLATES[p.kind === "green" ? "green" : "sam3"].about), run }));
}

// ---------------------------------------------------------------- the department

const BENTOS = [
  ["subjects", "SUBJECTS", "sp-side-b.sp-b-subjects", subjectsBody],
  ["edge", "EDGE", "sp-b-edge", edgeBody],
  ["track", "TRACK", "sp-b-track", trackBody],
  ["out", "OUT", "sp-b-out", outBody],
];
for (const [id, title, , body] of BENTOS) {
  defineWindow(`roto-${id}`, {
    eyebrow: "Roto", title, size: id === "subjects" ? "m" : "s",
    make: () => {
      const el = h("div.sp-w");
      return { el, update: () => fill(el, body(true)), sig: () => JSON.stringify([spice.shot?.body.set.roto, spice.shot?.body.passes.roto?.media?.url, spice.shot?.body.passes.plate?.media.url, spice.pointer, spice.frame]) };
    },
  });
}

let keyedHere = null;
let trackBox = null;
/** Moves the edge's zoomed clip to the frame the viewer is on, and the TRACK key to whether a key is there. */
function frame() {
  if (edgeVideo?.readyState > 0) {
    const fps = spice.shot?.body.passes.plate?.fps ?? 24;
    const t = secondsAt(spice.frame, fps);
    if (Math.abs(edgeVideo.currentTime - t) > 0.02) edgeVideo.currentTime = Math.min(t, Math.max(0, (edgeVideo.duration || t) - 0.02));
  }
  const here = keysOf(openSubject()).includes(spice.frame);
  if (trackBox && here !== keyedHere) {
    keyedHere = here;
    fill(trackBox, trackBody());
  }
}

export function rotoSpace() {
  const el = h("div.sp-dept.is-roto.is-wide");
  const slot = h("div.sp-slot");
  const bentos = Object.fromEntries(BENTOS.map(([id, title, cls]) => [id, bento(cls, title, () => openWin(`roto-${id}`))]));
  const bodies = Object.fromEntries(BENTOS.map(([id]) => [id, h("div.sp-b-body")]));
  for (const [id] of BENTOS) bentos[id].append(bodies[id]);
  el.append(slot, bentos.subjects, h("div.sp-lower.is-roto", {}, bentos.edge, bentos.track, bentos.out));
  trackBox = bodies.track;
  function update() {
    for (const [id, , , body] of BENTOS) fill(bodies[id], body(false));
    keyedHere = keysOf(openSubject()).includes(spice.frame);
    frame();
  }
  return {
    el, update, slot, frame,
    sig: () => "",
    point: addPoint,
    // a click on the viewer is a click on a subject while the department has one picked (or is waiting for a new one)
    viewer: () => {
      const b = spice.shot.body;
      const s = openSubject();
      const r = b.set.roto;
      const tool = spice.pointer === "points" && b.passes.plate ? "points" : null;
      return {
        tool,
        points: s ? s.points : [],
        edge: { feather: r.feather, choke: r.choke },
        hint: tool && r.open === "new" ? "Click the subject · Shift or Alt for what it is not" : tool ? `Clicking adds to ${s?.name ?? "the subject"} · Shift or Alt for what it is not` : null,
      };
    },
  };
}
