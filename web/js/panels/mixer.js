// Mixer's screen: the edit and the cast on the left, the mix (its player and its shots) in the
// middle, the shot picked and the mixes kept on the right, the recipes along the bottom.
import { h, icon, sprite, pad2, ago } from "../dom.js";
import { state, toast, changed, artist, setArtist, artists } from "../store.js";
import { currentPage, go } from "../router.js";
import { dropdown } from "../controls.js";
import { artistItems } from "../writer-menu.js";
import { view } from "../viewer.js";
import {
  mixer, loadMixes, openMix, newMix, removeMix, save, useVideo, useRecipe, addCast, setCast, removeCast, castKinds, CAST_MAX,
  shotLength, shotState, setShot, select, redo, mixIt, mixing, estimate, take,
} from "../mixer.js";

const KIND_LABEL = { person: "Person", product: "Product", outfit: "Outfit", other: "Other" };
const STEP_TONE = { done: "ok", rolling: "busy", drawing: "busy", failed: "crit", drawn: "accent", waiting: null };
const time = (s) => `${Math.floor(s / 60)}:${pad2(Math.floor(s % 60))}`;
const secs = (s) => `${(Math.round(s * 10) / 10).toFixed(1)} s`;
let filter = "all";
let armed = null;

// the videos on screen stay the same elements from one redraw to the next, so they keep playing
const kept = new Map();
function keep(key, make) {
  let el = kept.get(key);
  if (!el) kept.set(key, (el = make()));
  return el;
}
const loopVideo = (slot, src, poster) => keep(`${slot}:${src}`, () => h("video", { src, poster, muted: true, loop: true, autoplay: true, playsInline: true, preload: "metadata", draggable: false, disablePictureInPicture: true }));

const pick = (accept, multiple, fn) => {
  const input = h("input", { type: "file", accept, multiple, hidden: true, on: { change: () => (fn([...input.files]), input.remove()) } });
  document.body.append(input);
  input.click();
};

// ---------------------------------------------------------------- the edit and the cast

function editPanel(m) {
  const e = m?.body.edit;
  const shots = m?.body.shots ?? [];
  let well;
  if (mixer.splitting) well = h("div.mx-edit-empty", {}, h("span.lamp", { dataset: { tone: "busy" } }), h("span", {}, "Finding the cuts"));
  else if (e?.kind === "video") well = loopVideo("edit", e.video.url);
  else if (e?.kind === "recipe") well = loopVideo("edit", e.preview, e.poster);
  else
    well = h("button.mx-edit-empty", { type: "button", title: "Drop an edit you like\nA video with cuts and music: any length up to 20 s", on: { click: () => pick("video/*", false, ([f]) => f && useVideo(f)) } },
      icon("upload"), h("span", {}, "Drop an edit"), h("em", {}, "or pick a recipe below"));
  const playing = (well.tagName === "VIDEO");
  return h("section.mx-panel.mx-edit", {},
    h("div.mx-head", {},
      h("span.card-label", {}, "The edit"),
      h("div.card-tools", {},
        e ? h("button.key.is-icon.is-quiet", { type: "button", title: "Another edit\nDrop or pick a video", on: { click: () => pick("video/*", false, ([f]) => f && useVideo(f)) } }, icon("loop")) : null)),
    h("div.mx-edit-well", {}, well,
      playing ? h("button.mx-play", { type: "button", title: "Play the edit with its sound", on: { click: () => ((well.muted = !well.muted), well.play()) } }, icon(well.muted ? "mute" : "sound")) : null,
      e?.kind === "recipe" ? h("span.mx-edit-tag", {}, "Recipe") : null),
    h("div.mx-edit-meta", {}, e
      ? [h("b", {}, e.name), h("span", {}, e.kind === "video" ? `${time(e.video.seconds)} · ${shots.length} ${shots.length === 1 ? "cut" : "cuts"}${e.sound ? " · sound" : ""}` : `${secs(e.seconds)} · 1 cut`)]
      : [h("span", {}, "No edit yet")]),
    h("div.mx-head", {}, h("span.card-label", {}, "Your cast"), h("span.mx-count", {}, `${m?.body.cast.length ?? 0} / ${CAST_MAX}`)),
    h("div.mx-cast", {}, ...Array.from({ length: CAST_MAX }, (_, i) => castSlot(m, i))),
    h("div.mx-pickers", {},
      lookPicker(),
      h("span.mx-readout", { title: "LTX-2.5 rolls every shot, copying its motion\nOpen weights, picture and sound in one pass" }, sprite("section-shot"), h("span", {}, h("b", {}, "LTX-2.5"), h("em", {}, state.info?.target === "comfy-cloud" ? "≈ 4.8 cr/s" : "your GPU")))),
    goKey(m));
}
const changedMixer = () => changed("mixer");

/** The image model that redraws the frames: only those that draw from references. */
function lookPicker() {
  const items = artistItems().filter((it) => artists().find((x) => x.id === it.value)?.templates.some((t) => t.id === "edit"));
  const value = items.some((it) => it.value === artist()) ? artist() : items[0]?.value;
  if (!value) return h("span.mx-readout", {}, sprite("image-generate"), h("span", {}, h("b", {}, "Look"), h("em", {}, "loading")));
  return dropdown({ label: "Look", value, items, onChange: (id) => (setArtist(id), changedMixer()), width: "fit", note: "Draws each shot's first frame with your cast" });
}

function castSlot(m, i) {
  const c = m?.body.cast[i];
  if (!c)
    return h("button.mx-slot.is-empty", { type: "button", title: "A photo of who or what the mix is about\nDrop, paste or pick: a face, a product, an outfit", on: { click: () => pick("image/*", true, (files) => files.forEach((f) => addCast(f))) } },
      icon("plus"), h("span", {}, "Drop or paste"));
  return h("div.mx-slot", {},
    h("button.mx-slot-pic", { type: "button", title: `@${c.name}\nClick to see it`, on: { click: () => view(c.url) } }, h("img", { src: c.url, alt: "", draggable: false })),
    h("button.mx-slot-x", { type: "button", title: "Take it out", "aria-label": "Take it out", on: { click: () => removeCast(i) } }, icon("close")),
    h("button.mx-slot-kind", { type: "button", title: `@${c.name}: ${KIND_LABEL[c.kind].toLowerCase()}\nClick for what else it is: a person, a product, an outfit`, on: { click: () => setCast(i, { kind: castKinds[(castKinds.indexOf(c.kind) + 1) % castKinds.length] }) } }, KIND_LABEL[c.kind]));
}

function goKey(m) {
  const busy = mixing() || mixer.busy.has("render");
  const cost = estimate(m);
  const done = m?.body.shots.length && m.body.shots.every((s) => take(s)?.status === "done");
  return h("button.mx-go", { type: "button", disabled: busy || !m?.body.edit || !m?.body.cast.length, title: !m?.body.edit ? "Pick a recipe or drop an edit first" : !m?.body.cast.length ? "Add a photo to the cast first" : done ? "Every shot is made: mixing again cuts them together again" : "Every shot drawn with your cast, rolled and cut together", on: { click: () => mixIt() } },
    sprite("product-mixer"), h("span", {}, busy ? (mixer.busy.has("render") ? "Cutting" : "Mixing") : done ? "Mix again" : "Mix it"),
    cost !== null && !busy && state.info?.target === "comfy-cloud" ? h("em", {}, `≈ ${cost} cr`) : null);
}

// ---------------------------------------------------------------- the mix: the player and the shots

function player(m) {
  const film = m?.body.film;
  const shot = m?.body.shots[mixer.selected];
  if (!film) {
    const t = take(shot);
    const still = t?.status === "done" ? loopVideo("screen", t.video, shot.look?.url) : shot?.look ? h("img", { src: shot.look.url, alt: "", draggable: false }) : null;
    return h("div.mx-stage", {}, h("div.mx-screen", { dataset: { empty: still ? undefined : "" } }, still ?? h("div.mx-screen-empty", {}, h("img.star", { src: "brand/cast/praline.png", alt: "", draggable: false }), h("span", {}, mixing() ? "Mixing" : "Your mix plays here"))));
  }
  const video = keep(`film:${film.url}`, () => {
    const v = h("video", { src: film.url, poster: film.poster, playsInline: true, preload: "metadata", loop: true, draggable: false, disablePictureInPicture: true });
    v.addEventListener("timeupdate", () => tick(v));
    v.addEventListener("play", () => tick(v));
    v.addEventListener("pause", () => tick(v));
    return v;
  });
  const total = film.seconds || m.body.edit?.video?.seconds || 1;
  const marks = m.body.edit?.kind === "video" ? m.body.shots.slice(1).map((s) => s.from / total) : [];
  const bar = h("div.mx-bar", { on: { pointerdown: (e) => seek(e, video, bar) } }, h("i.mx-bar-fill"), ...marks.map((f) => h("b", { style: { left: `${f * 100}%` } })));
  const name = (m.name || "mix").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const el = h("div.mx-stage", {},
    h("div.mx-screen", {}, video),
    h("div.mx-transport", {},
      h("button.key.is-icon.mx-toggle", { type: "button", title: "Play or pause", on: { click: () => (video.paused ? video.play() : video.pause()) } }, icon(video.paused ? "play" : "pause")),
      h("span.mx-time", {}, h("b", {}, "0:00.0"), h("em", {}, ` / ${time(total)}`)),
      bar,
      h("a.key.is-icon", { href: `${film.url}?download=${name}.mp4`, download: `${name}.mp4`, title: "Download the mix" }, icon("download")),
      m.body.cut ? h("button.key.is-icon", { type: "button", title: "Open in Kitchen's Cut\nFine-tune the edit: trims, titles, sound", on: { click: () => openInCut(m.body.cut) } }, icon("scissors")) : null));
  queueMicrotask(() => tick(video));
  return el;
}
function tick(v) {
  const stage = v.closest(".mx-stage");
  if (!stage) return;
  const t = v.currentTime || 0;
  const b = stage.querySelector(".mx-time b");
  if (b) b.textContent = `${Math.floor(t / 60)}:${pad2(Math.floor(t % 60))}.${Math.floor((t % 1) * 10)}`;
  const fill = stage.querySelector(".mx-bar-fill");
  if (fill) fill.style.width = `${(t / (v.duration || 1)) * 100}%`;
  const toggle = stage.querySelector(".mx-toggle");
  if (toggle) toggle.replaceChildren(icon(v.paused ? "play" : "pause"));
}
function seek(e, video, bar) {
  const to = (ev) => {
    const r = bar.getBoundingClientRect();
    video.currentTime = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * (video.duration || 0);
    tick(video);
  };
  to(e);
  const up = () => (removeEventListener("pointermove", to), removeEventListener("pointerup", up));
  addEventListener("pointermove", to);
  addEventListener("pointerup", up);
}
async function openInCut(id) {
  const { setProject } = await import("../store.js");
  const { openCut, loadCuts } = await import("../cut.js");
  setProject(null);
  await loadCuts();
  await openCut(id);
  go("cut");
}

function strip(m) {
  const shots = m?.body.shots ?? [];
  if (!shots.length) return h("div.mx-strip-empty", {}, "The edit's shots line up here, each with your version under it.");
  const recipe = m.body.edit?.kind === "recipe";
  return h("div.mx-strip", { dataset: { scrollKey: "mx-strip" } },
    h("div.mx-strip-rows", {}, h("span", {}, "Original"), h("span", {}, "Remix")),
    ...shots.map((s, i) => {
      const st = shotState(s, i);
      const orig = s.frame?.url ?? (recipe ? m.body.edit.poster : null);
      return h(`button.mx-shot${i === mixer.selected ? ".is-on" : ""}`, { type: "button", on: { click: () => select(i) } },
        h("span.mx-shot-head", {}, `${pad2(i + 1)} · ${secs(shotLength(s))}`),
        h("span.mx-thumb", {}, orig ? h("img", { src: orig, alt: "", draggable: false, loading: "lazy" }) : null),
        icon("chevron"),
        h("span.mx-thumb.is-remix", {}, s.look ? h("img", { src: s.look.url, alt: "", draggable: false, loading: "lazy" }) : null,
          st.step === "rolling" ? h("i.mx-progress", { style: { width: `${Math.round((st.progress ?? 0) * 100)}%` } }) : null),
        h("span.mx-shot-state", { dataset: { step: st.step } }, h("span.lamp", { dataset: STEP_TONE[st.step] ? { tone: STEP_TONE[st.step] } : {} }),
          st.step === "rolling" ? `Rolling ${Math.round((st.progress ?? 0) * 100)}%` : st.step === "drawing" ? "Drawing" : st.step === "drawn" ? "Drawn" : st.step === "done" ? "Done" : st.step === "failed" ? "Failed" : "Waiting"));
    }));
}

// ---------------------------------------------------------------- the shot picked, and the mixes kept

function inspector(m) {
  const s = m?.body.shots[mixer.selected];
  const i = mixer.selected;
  const parts = [];
  if (s) {
    const t = take(s);
    const st = shotState(s, i);
    const busy = st.step === "rolling" || st.step === "drawing" || mixing();
    const orig = s.frame?.url ?? m.body.edit?.poster;
    parts.push(
      h("div.mx-head", {}, h("span.card-label", {}, `Shot ${pad2(i + 1)}`), h("span.mx-count", {}, secs(shotLength(s)))),
      h("div.mx-pair", {},
        h("figure", {}, orig ? h("img", { src: orig, alt: "", draggable: false }) : null, h("figcaption", {}, "Original")),
        h("figure", {}, t?.status === "done" ? loopVideo("pair", t.video, s.look?.url) : s.look ? h("img", { src: s.look.url, alt: "", draggable: false }) : null, h("figcaption", {}, "Remix"))),
      s.clip
        ? h("div.mx-motion", {}, h("span.label", {}, "Motion"),
          h("div.selector", { role: "group" }, ...[["pose", "Pose", "Copies the body's moves"], ["edges", "Edges", "Copies the outlines: for objects, places, camera moves"], ["free", "Free", "Doesn't copy: the note says what happens"]].map(([v, label, tip]) =>
            h("button", { type: "button", "aria-pressed": String(s.motion === v), title: tip, on: { click: () => setShot(i, { motion: v }) } }, label))))
        : null,
      h("textarea.field.mx-note", { rows: 2, placeholder: "Fix it: e.g. sunglasses on, looking left", value: s.note ?? "", dataset: { focus: `note:${m.id}:${i}` }, on: { input: (e) => ((s.note = e.target.value), save()) } }),
      h("div.mx-keys", {},
        h("button.key", { type: "button", disabled: busy || !m.body.cast.length, title: "Draws this shot's first frame again, with the note", on: { click: () => redo(i, { draw: true }) } }, icon("image"), "Redraw frame"),
        h("button.key", { type: "button", disabled: busy || !s.look, title: "Rolls this shot again from its frame", on: { click: () => redo(i, { draw: false }) } }, icon("remix"), "Roll again")),
      st.step === "failed" ? h("p.mx-error", {}, st.note) : null,
    );
  } else parts.push(h("div.mx-head", {}, h("span.card-label", {}, "The shot")), h("p.hint", {}, "Pick a shot in the strip to see it here and fix it."));
  parts.push(
    h("div.mx-head.is-gap", {}, h("span.card-label", {}, "My mixes"),
      h("div.card-tools", {}, h("button.key.is-icon.is-quiet", { type: "button", title: "A new mix", on: { click: () => newMix() } }, icon("plus")))),
    h("div.mx-mixes", { dataset: { scrollKey: "mx-mixes" } }, ...mixer.list.map((row) =>
      h(`div.mx-row${row.id === m?.id ? ".is-on" : ""}`, {},
        h("button.mx-row-open", { type: "button", on: { click: () => openMix(row.id) } },
          h("span.mx-row-pic", {}, row.thumb ? h("img", { src: row.thumb, alt: "", draggable: false, loading: "lazy" }) : sprite("product-mixer")),
          h("span.mx-row-text", {}, h("b", {}, row.name), h("em", {}, ago(row.updatedAt)))),
        h(`button.key.is-icon.is-quiet${armed === row.id ? ".is-armed" : ""}`, { type: "button", title: armed === row.id ? "Click again to delete it" : "Delete this mix", on: { click: () => (armed === row.id ? ((armed = null), removeMix(row.id)) : ((armed = row.id), changedMixer(), setTimeout(() => armed === row.id && ((armed = null), changedMixer()), 3000))) } }, icon("trash"))))),
    mixer.list.length ? null : h("p.hint", {}, "Your mixes are kept here."));
  return h("section.mx-panel.mx-side", {}, ...parts);
}

// ---------------------------------------------------------------- the recipes

const GROUPS = [["all", "All"], ["camera", "Camera"], ["vfx", "Effects"], ["transform", "Transformations"]];
function recipes(m) {
  const list = state.presets.filter((p) => filter === "all" || p.category === filter);
  const current = m?.body.edit?.kind === "recipe" ? m.body.edit.preset : null;
  return h("section.mx-recipes", {},
    h("div.mx-head", {}, h("span.card-label", {}, "Recipes"),
      h("div.mx-filters", {}, ...GROUPS.map(([id, label]) => h("button", { type: "button", "aria-pressed": String(filter === id), on: { click: () => ((filter = id), changedMixer()) } }, label)))),
    h("div.mx-shelf", { dataset: { scrollKey: "mx-shelf" } }, ...list.map((p) =>
      h(`button.mx-recipe${p.id === current ? ".is-on" : ""}`, { type: "button", title: p.blurb, on: { click: () => useRecipe(p.id), pointerenter: (e) => hoverPlay(e.currentTarget, p, true), pointerleave: (e) => hoverPlay(e.currentTarget, p, false) } },
        h("img", { src: p.poster, alt: "", draggable: false, loading: "lazy" }),
        h("span.mx-recipe-text", {}, h("b", {}, p.name), h("em", {}, "1 cut"))))));
}
function hoverPlay(card, p, on) {
  let v = card.querySelector("video");
  if (on && !v) card.prepend((v = h("video", { src: p.preview, muted: true, loop: true, autoplay: true, playsInline: true, draggable: false })));
  else if (!on && v) v.remove();
}

// ---------------------------------------------------------------- the screen

export function renderMixer(el) {
  loadMixes();
  const m = mixer.mix;
  // a note being typed keeps its place when the takes' progress redraws the screen
  const active = document.activeElement;
  const focus = el.contains(active) ? active.dataset.focus : null;
  const sel = focus ? [active.selectionStart, active.selectionEnd] : null;
  el.replaceChildren(h("div.mixer", {},
    editPanel(m),
    h("section.mx-panel.mx-mix", {},
      h("div.mx-head", {}, h("span.card-label", {}, "The mix"),
        m ? h("input.mx-name", { value: m.name, "aria-label": "The mix's name", dataset: { focus: `name:${m.id}` }, on: { input: (e) => ((m.name = e.target.value.slice(0, 60)), save()) } }) : h("span.card-hint", {}, "Trends, in one command")),
      player(m),
      h("div.mx-head", {}, h("span.card-label", {}, "Shots")),
      strip(m)),
    inspector(m),
    recipes(m)));
  if (focus) {
    const back = el.querySelector(`[data-focus="${CSS.escape(focus)}"]`);
    back?.focus({ preventScroll: true });
    if (back && sel) back.setSelectionRange(...sel);
  }
}

// a video dropped anywhere on Mixer is the edit, a picture joins the cast, a pasted picture too
const files = (list) => [...(list ?? [])];
document.addEventListener("dragover", (e) => currentPage() === "mixer" && e.dataTransfer?.types?.includes("Files") && e.preventDefault());
document.addEventListener("drop", (e) => {
  if (currentPage() !== "mixer" || !e.dataTransfer?.files?.length) return;
  e.preventDefault();
  for (const f of files(e.dataTransfer.files)) f.type.startsWith("video/") ? useVideo(f) : f.type.startsWith("image/") ? addCast(f) : toast("Drop a video (the edit) or a photo (the cast).");
});
document.addEventListener("paste", (e) => {
  if (currentPage() !== "mixer" || e.target.closest?.("input, textarea")) return;
  const pics = files(e.clipboardData?.files).filter((f) => f.type.startsWith("image/") || f.type.startsWith("video/"));
  if (!pics.length) return;
  e.preventDefault();
  for (const f of pics) f.type.startsWith("video/") ? useVideo(f) : addCast(f);
});
