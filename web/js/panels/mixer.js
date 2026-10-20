// Mixer's screen: what's trending along the top; the trend picked (its cover, its beats, its music
// and who stars in it) in the middle, or the edit someone dropped in to remix; the crew, your own
// stars and the mixes made at the side.
import { h, icon, sprite, pad2, ago } from "../dom.js";
import { state, toast, changed, setArtist, artists } from "../store.js";
import { currentPage, go } from "../router.js";
import { dropdown } from "../controls.js";
import { artistItems } from "../writer-menu.js";
import { view } from "../viewer.js";
import {
  mixer, loadMixes, openMix, removeMix, save, useVideo, addCast, setCast, removeCast, castKinds, CAST_MAX,
  shotLength, shotState, setShot, select, redo, mixIt, mixing, estimate, take, mixLoras, setMixLoras, rolled,
} from "../mixer.js";
import { loraStack } from "../loras.js";
import { TRENDS, CREW, KINDS, trendById, crewById, trendArt, crewFace } from "../mixer-trends.js";
import { pick, castOf, selectTrend, setKind, pickRole, setRole, swapRole, stars, loadStars, addStar, removeStar, makeTrend, making, takesOf, castArtist, estimate as trendCost } from "../mixer-trend.js";
import { openPicker, pictureOf } from "../picker.js";

/** Whoever is picked for a role: one of the crew plays it as themselves, anyone else as a star. */
async function castChoice(role, choice) {
  try {
    if (choice.kind === "character" && choice.character.group === "crew") return setRole(role, { crew: choice.character.id });
    const photo = await pictureOf(choice);
    // a picture of your own joins your stars; one of our cast plays without
    if (choice.kind === "character") return setRole(role, { star: { file: photo.file, url: photo.url, name: choice.character.name } });
    await addStar(photo, role);
  } catch (e) {
    toast(e.message, { tone: "crit" });
  }
}

const KIND_LABEL = { person: "Person", product: "Product", outfit: "Outfit", other: "Other" };
const STEP_TONE = { done: "ok", rolling: "busy", drawing: "busy", failed: "crit", drawn: "accent", waiting: null };
const time = (s) => `${Math.floor(s / 60)}:${pad2(Math.floor(s % 60))}`;
const secs = (s) => `${(Math.round(s * 10) / 10).toFixed(1)} s`;
const span = (a, b) => `${Math.round(a * 10) / 10}–${Math.round(b * 10) / 10} s`;
const KIND_NAME = Object.fromEntries(KINDS);
let armed = null;
const changedMixer = () => changed("mixer");

// the videos on screen stay the same elements from one redraw to the next, so they keep playing
const kept = new Map();
function keep(key, make) {
  let el = kept.get(key);
  if (!el) kept.set(key, (el = make()));
  return el;
}
const loopVideo = (slot, src, poster) => keep(`${slot}:${src}`, () => h("video", { src, poster, muted: true, loop: true, autoplay: true, playsInline: true, preload: "metadata", draggable: false, disablePictureInPicture: true }));
const pickFile = (accept, multiple, fn) => {
  const input = h("input", { type: "file", accept, multiple, hidden: true, on: { change: () => (fn([...input.files]), input.remove()) } });
  document.body.append(input);
  input.click();
};
/** Who a role is played by, as a face: one of the crew, or a star's photo. */
const faceOf = (who) => (who?.crew ? crewFace(who.crew) : who?.star?.url);
const nameOf = (who) => (who?.crew ? crewById(who.crew)?.name : who?.star?.name ?? "Star");

// ---------------------------------------------------------------- what's trending

// Mixer's own trends: comedy and reactions, and the few shown here as well as on Jam's shelf
const OURS = TRENDS.filter((t) => t.home === "mixer" || t.also?.includes("mixer"));
const OUR_KINDS = KINDS.filter(([id]) => id === "all" || OURS.some((t) => t.kind === id));

function feed() {
  const list = OURS.filter((t) => pick.kind === "all" || t.kind === pick.kind);
  const cards = h("div.mx-cards", { dataset: { scrollKey: "mx-cards" } }, ...list.map(card));
  const nudge = (d) => cards.scrollBy({ left: d * cards.clientWidth * 0.8, behavior: "smooth" });
  return h("section.mx-feed", {},
    h("div.mx-feed-head", {},
      h("h1", {}, "Trending now"), h("p", {}, "Viral trends, made yours."),
      h("div.mx-kinds", {}, ...OUR_KINDS.map(([id, label]) => h("button", { type: "button", "aria-pressed": String(pick.kind === id), on: { click: () => setKind(id) } }, label))),
      h("div.mx-nudge", {},
        h("button.key.is-icon", { type: "button", "aria-label": "Back", on: { click: () => nudge(-1) } }, icon("chevron")),
        h("button.key.is-icon", { type: "button", "aria-label": "More", on: { click: () => nudge(1) } }, icon("chevron")))),
    cards);
}
function card(t) {
  const lit = t.heat >= 5 ? 3 : t.heat >= 4 ? 2 : 1;
  const on = t.id === pick.trend && !remixing();
  const mk = making() && mixer.mix?.body?.trend?.id === t.id ? makeFeel(mixer.mix, t) : null;
  // a trend not made yet is shown at the end of the shelf and opens nothing
  return h(`button.mx-card${on ? ".is-on" : ""}${t.soon ? ".is-soon" : ""}${mk ? ".is-making" : ""}`, { type: "button", disabled: !!t.soon, title: t.soon ? `${t.name}\nComing soon` : `${t.name}\n${KIND_NAME[t.kind]} · ${t.seconds} s`, on: { click: () => selectTrend(t.id) } },
    h("img", { src: trendArt(t), alt: "", draggable: false, loading: "lazy" }),
    h("span.mx-card-len", {}, t.soon ? "Soon" : `0:${pad2(Math.round(t.seconds))}`),
    t.soon ? h("span.mx-card-soon", {}, "Coming soon") : null,
    mk ? h("span.mx-card-making", {}, h("span.lamp", { dataset: { tone: "busy" } }), `${Math.round(mk.pct * 100)}%`) : null,
    h("span.mx-card-heat", { title: lit === 3 ? "Very hot right now" : lit === 2 ? "Hot right now" : "Warm" }, sprite("trend-heat"), ...[0, 1, 2].map((k) => h(`i${k < lit ? ".is-lit" : ""}`))),
    h("span.mx-card-foot", {},
      h("b", {}, t.name),
      h("span.mx-faces", {}, ...t.cast.map((c) => h("img", { src: crewFace(c.crew), alt: crewById(c.crew)?.name ?? "", draggable: false })))));
}

// ---------------------------------------------------------------- the trend picked

const remixing = () => !!mixer.mix?.body?.edit || mixer.splitting;
/** The open mix, when it is this trend's. */
const trendMix = (t) => (mixer.mix?.body?.kind === "trend" && mixer.mix.body.trend?.id === t.id ? mixer.mix : null);

function recipe(t) {
  const m = trendMix(t);
  const cast = castOf(t);
  const busy = making();
  const cost = trendCost(t);
  const head = [
    h("div.mx-recipe-title", {}, h("span.label", {}, "Trend recipe"), h("h2", {}, t.name), h("span.mx-recipe-meta", {}, `${t.seconds} s · ${KIND_NAME[t.kind]}${t.caption ? ` · “${t.caption}”` : ""}`, t.recipe ? h("span.mx-chip.is-own", { title: "The trend's own sound plays under your version" }, "Original sound") : null)),
    h("div.mx-beats", {}, ...t.beats.map((b) => h("div.mx-beat", { style: { flexGrow: String(Math.max(0.6, b.to - b.from)) } }, h("i"), h("b", {}, span(b.from, b.to)), h("span", {}, b.text)))),
    t.recipe ? null : h("div.mx-music", {},
      m?.body.music ? keep(`music:${m.body.music.url}`, () => h("audio", { src: m.body.music.url, controls: true, preload: "none" })) : h("span.mx-music-icon", {}, sprite("audio-music")),
      ...[t.music?.bpm ? `${t.music.bpm} BPM` : null, t.music?.genre, t.music?.mood].filter(Boolean).map((x) => h("span.mx-chip", {}, x)),
      // a trend we have made ourselves keeps its own sound: the mouths follow its vocals
      t.recipe
        ? h("span.mx-chip.is-own", { title: "The trend's own sound: the mouths follow its vocals" }, "Original sound")
        : h("span.mx-chip.is-own", { title: "A new track made for your mix in the trend's feel: never the trend's own song" }, "Our own track")),
  ];
  const rest = [
      // who stars in it beside how it is made
      h("div.mx-lower", {},
        h("div.mx-cast-col", {},
          h("div.mx-section-head", {}, h("h3", {}, "Cast"), h("em", {}, pick.role ? `Pick who plays the ${pick.role.toLowerCase()}: one of the crew, or one of your stars` : "The crew by default. Swap them, or pick your own.")),
          h("div.mx-roles", {}, ...cast.map((c) => role(c)))),
        // a trend we have made keeps its own sound: no music is made for it
        madeWith({ music: !t.recipe })),
      h("button.mx-go" + (busy && m ? ".is-making" : ""), { type: "button", disabled: busy, style: busy && m ? { "--p": String(makeFeel(m, t).pct) } : {}, title: t.recipe ? "The trend's first frame with your cast, its takes rolled with LTX-2.5 on its own motion, cut together" : "The trend's first frame with your cast, its beats rolled with LTX-2.5, a track of its own, cut together", on: { click: () => makeTrend() } },
        sprite("product-mixer"), h("span", {}, busy ? (m ? makeFeel(m, t).word : "Making it") : m?.body.film ? "Make it again" : "Make it"), cost && !busy ? h("em", {}, `≈ ${cost} cr`) : null),
  ];
  return h("section.mx-work.mx-recipe", {}, preview(t, m), h("div.mx-recipe-body", {}, ...head, ...rest));
}

// the trend whose preview plays in its cover's frame, and whether it has just been started
let watching = null;
let starting = false;

function preview(t, m) {
  const film = m?.body.film;
  // a version of yours and ours: a switch on the card goes between them
  if (film && t.preview && watching === t.id && !making())
    return h("div.mx-preview", {}, player({ name: t.name, body: { film: { url: t.preview, seconds: t.seconds }, shots: t.beats } }, { inFrame: true }), versionSwitch(t, "ours"));
  if (film) return h("div.mx-preview", {}, player(m), t.preview ? versionSwitch(t, "yours") : null);
  // our crew's version, in the cover's frame at the shape it was made in, until yours exists;
  // another trend picked, and this one is back to its cover
  if (watching !== t.id) watching = null;
  if (watching && t.preview && !making())
    return h("div.mx-preview", {}, player({ name: t.name, body: { film: { url: t.preview, seconds: t.seconds }, shots: t.beats } }, { inFrame: true }));
  const first = m?.body.shots?.[0]?.look?.url;
  const feel = making() && m ? makeFeel(m, t) : null;
  // the latest take that is done plays in the card while the rest is rolled
  const rolledTake = feel ? [...(m.body.shots ?? [])].reverse().map((s) => take(s)).find((r) => r?.status === "done" && r.video) : null;
  return h("div.mx-preview", {},
    h(`div.mx-screen.is-cover${feel ? ".is-making" : ""}`, {},
      rolledTake ? loopVideo(`rolled:${rolledTake.id}`, rolledTake.video) : h("img", { src: first ?? trendArt(t), alt: "", draggable: false }),
      h("span.mx-card-len", {}, `0:${pad2(Math.round(t.seconds))}`),
      // our own version of the trend, in the shape it was made in
      t.preview && !first && !making() ? h("button.mx-watch", { type: "button", title: "Watch our crew's version", "aria-label": "Watch our crew's version", on: { click: () => ((watching = t.id), (starting = true), changedMixer()) } }, icon("play")) : null,
      feel ? makingHud(feel) : making() ? h("span.mx-making", {}, h("span.lamp", { dataset: { tone: "busy" } }), "Making your version") : h("span.mx-cover-note", {}, "Your version plays here")));
}

/** Yours | Ours: between the version made for you and the trend's own (our crew's). */
function versionSwitch(t, on) {
  const go = (ours) => () => {
    watching = ours ? t.id : null;
    starting = ours;
    changedMixer();
  };
  return h("div.mx-versions", { role: "group", "aria-label": "Version" },
    h("button", { type: "button", "aria-pressed": String(on === "yours"), on: { click: go(false) } }, "Yours"),
    h("button", { type: "button", "aria-pressed": String(on === "ours"), on: { click: go(true) } }, "Ours"));
}

/**
 * How far making a trend has got, as one share and one phrase: the first frame, each take by its own progress, the cut.
 * It is shown on the card itself (and the shelf's card and the key), where the version will play.
 */
function makeFeel(m, t) {
  const shots = m.body.shots ?? [];
  const n = shots.length || takesOf(t).length || 1;
  const first = shots[0]?.look ? 1 : 0;
  const rolledShare = shots.reduce((sum, s, i) => { const st = shotState(s, i); return sum + (st.step === "done" ? 1 : st.step === "rolling" ? st.progress ?? 0 : 0); }, 0);
  const cut = m.body.film ? 1 : 0;
  const pct = Math.min(1, first * 0.08 + (rolledShare / n) * 0.84 + cut * 0.08);
  const word = !first ? "Drawing the first frame" : cut ? "Done" : rolledShare >= n ? "Cutting it together" : n > 1 ? `Rolling take ${Math.min(n, Math.floor(rolledShare) + 1)} of ${n}` : "Rolling the take";
  return { pct, word };
}
const makingHud = (f) => h("div.mx-hud", { role: "status" },
  h("div.mx-hud-bar", {}, h("i", { style: { width: `${Math.round(f.pct * 100)}%` } })),
  h("div.mx-hud-line", {}, h("span.lamp", { dataset: { tone: "busy" } }), h("b", {}, f.word), h("em", {}, `${Math.round(f.pct * 100)}%`)));

function role(c) {
  const on = pick.role === c.role;
  return h(`div.mx-role${on ? ".is-on" : ""}`, {},
    h("button.mx-role-face", { type: "button", title: on ? "Pick someone at the side, or drop a photo here" : `Pick who plays the ${c.role.toLowerCase()}`, on: { click: () => pickRole(c.role) } }, h("img", { src: faceOf(c.who), alt: "", draggable: false })),
    h("span.mx-role-text", {}, h("span.label", {}, c.role), h("b", {}, nameOf(c.who)), h("em", {}, c.who.crew ? crewById(c.who.crew).role : "Your star")),
    h("button.mx-role-swap", { type: "button", title: "Another of the crew", "aria-label": "Another of the crew", on: { click: () => swapRole(c.role) } }, sprite("cast-swap")),
    h("button.mx-role-drop", { type: "button", title: "Someone else plays this role: one of our characters, a star of yours, a picture from the Library or your computer", on: { click: (e) => openPicker(e.currentTarget, { title: `Who plays the ${c.role.toLowerCase()}`, stars: stars.list, onPick: (choice) => castChoice(c.role, choice) }), dragover: (e) => e.preventDefault(), drop: (e) => { e.preventDefault(); e.stopPropagation(); const f = e.dataTransfer.files?.[0]; if (f?.type.startsWith("image/")) addStar(f, c.role); } } }, icon("plus"), h("span", {}, "Pick")));
}

/** How far making the open trend has come: its first frame, its takes, its track, the cut. */
// ---------------------------------------------------------------- an edit someone dropped in, remixed

function remix(m) {
  const e = m?.body.edit;
  const shots = m?.body.shots ?? [];
  return h("section.mx-work.mx-remix", {},
    h("div.mx-remix-left", {},
      h("div.mx-remix-title", {}, h("span.label", {}, "Remix"), h("h2", {}, e?.name ?? "Your edit"), h("span.mx-recipe-meta", {}, e?.video ? `${time(e.video.seconds)} · ${shots.length} ${shots.length === 1 ? "cut" : "cuts"}${e.sound ? " · its sound kept" : ""}` : "Finding the cuts")),
      m?.body.film ? player(m) : h("div.mx-screen", {}, mixer.splitting ? h("div.mx-screen-empty", {}, h("span.lamp", { dataset: { tone: "busy" } }), h("span", {}, "Finding the cuts")) : e?.video ? loopVideo("edit", e.video.url) : null),
      h("button.key.mx-back", { type: "button", on: { click: () => ((mixer.mix = null), changedMixer()) } }, icon("chevron"), "Back to the trends")),
    h("div.mx-remix-right", {},
      h("div.mx-section-head", {}, h("h3", {}, "Shots")),
      strip(m),
      shotFix(m),
      h("div.mx-section-head", {}, h("h3", {}, "Your cast"), h("em", {}, `${m?.body.cast.length ?? 0} / ${CAST_MAX}: who the edit is about`)),
      h("div.mx-cast", {}, ...Array.from({ length: CAST_MAX }, (_, i) => castSlot(m, i))),
      madeWith({ music: false }),
      goKey(m)));
}

// ---------------------------------------------------------------- how it is made

// Comfy Cloud bills a GPU second at 0.266 credits: ACE-Step takes about 1.3 of them a second of music
const MUSIC_CR = (1.3 * 0.266).toFixed(1);
const cloud = () => state.info?.target === "comfy-cloud";

/** One of the models a mix is made with: its part, the model, what it costs, and what hangs off it. */
const modelRow = (glyph, part, model, cost, ...more) =>
  h("div.mx-model", {}, h("span.mx-model-icon", {}, glyph), h("span.mx-model-text", {}, h("span.label", {}, part), model), h("span.mx-model-cost", {}, cost), ...more);

/**
 * How a mix is made, at a glance: the picture model that redraws its first frames with the cast,
 * LTX-2.5 with the LoRAs it rolls with (none until picked), and the music model.
 */
function madeWith({ music }) {
  return h("div.mx-made", {},
    h("div.mx-section-head", {}, h("h3", {}, "Made with")),
    pictureRow(),
    modelRow(sprite("film-make"), "Video", h("b", {}, "LTX-2.5"), cloud() ? "≈ 4.8 cr/s" : "your GPU",
      h("div.mx-model-loras", {}, h("span.label", {}, "LoRAs"), loraStack(mixLoras(), (list) => (setMixLoras(list), changed("mixer"))))),
    music ? modelRow(sprite("audio-music"), "Music", h("b", {}, "ACE-Step 1.5"), cloud() ? `≈ ${MUSIC_CR} cr/s` : "your GPU") : null);
}

/** The picture model that redraws the first frames with your cast: only those that draw from references. */
function pictureRow() {
  const items = artistItems().filter((it) => artists().find((x) => x.id === it.value)?.templates.some((t) => t.id === "edit")).map(({ short, ...it }) => it);
  const value = items.some((it) => it.value === castArtist()) ? castArtist() : items[0]?.value;
  const picker = value
    ? dropdown({ label: "Picture model", value, items, onChange: (id) => (setArtist(id), changedMixer()), width: "fit", note: "Redraws the first frame with your cast" })
    : h("b", {}, "Loading");
  return modelRow(sprite("image-generate"), "Picture", picker, items.find((it) => it.value === value)?.meta ?? "");
}

function castSlot(m, i) {
  const c = m?.body.cast[i];
  if (!c)
    return h("button.mx-slot.is-empty", { type: "button", title: "Who or what the edit is about\nOne of our characters, a star, a picture from the Library or your computer", on: { click: (e) => openPicker(e.currentTarget, { title: "Who the edit is about", stars: stars.list, multiple: true, onPick: async (choice) => { try { await addCast(await pictureOf(choice)); } catch (err) { toast(err.message, { tone: "crit" }); } } }) } }, icon("plus"));
  return h("div.mx-slot", {},
    h("button.mx-slot-pic", { type: "button", title: `@${c.name}\nClick to see it`, on: { click: () => view(c.url) } }, h("img", { src: c.url, alt: "", draggable: false })),
    h("button.mx-slot-x", { type: "button", title: "Take it out", "aria-label": "Take it out", on: { click: () => removeCast(i) } }, icon("close")),
    h("button.mx-slot-kind", { type: "button", title: `@${c.name}: ${KIND_LABEL[c.kind].toLowerCase()}\nClick for what else it is`, on: { click: () => setCast(i, { kind: castKinds[(castKinds.indexOf(c.kind) + 1) % castKinds.length] }) } }, KIND_LABEL[c.kind]));
}

function goKey(m) {
  const busy = mixing() || mixer.busy.has("render");
  const cost = estimate(m);
  const done = m?.body.shots.length && m.body.shots.every(rolled);
  return h("button.mx-go", { type: "button", disabled: busy || !m?.body.edit || !m?.body.cast.length, title: !m?.body.cast.length ? "Add a photo to the cast first" : "Every shot drawn with your cast, rolled and cut together", on: { click: () => mixIt() } },
    sprite("product-mixer"), h("span", {}, busy ? (mixer.busy.has("render") ? "Cutting" : "Mixing") : done ? "Mix again" : "Mix it"),
    cost !== null && !busy && state.info?.target === "comfy-cloud" ? h("em", {}, `≈ ${cost} cr`) : null);
}

function player(m, { inFrame = false } = {}) {
  const film = m.body.film;
  const video = keep(`film:${film.url}`, () => {
    // a version of yours opens playing, muted (a browser lets nothing else start by itself); its sound key is in the card
    const v = h("video", { src: film.url, poster: film.poster, playsInline: true, preload: "auto", loop: true, draggable: false, disablePictureInPicture: true, ...(inFrame ? {} : { muted: true, autoplay: true }) });
    for (const ev of ["timeupdate", "play", "pause", "volumechange"]) v.addEventListener(ev, () => tick(v));
    return v;
  });
  const total = film.seconds || 1;
  const marks = (m.body.shots ?? []).slice(1).map((s) => s.from / total);
  const bar = h("div.mx-bar", { on: { pointerdown: (e) => seek(e, video, bar) } }, h("i.mx-bar-fill"), ...marks.map((f) => h("b", { style: { left: `${f * 100}%` } })));
  const name = (m.name || "mix").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const toggle = () => (video.paused ? video.play() : video.pause());
  // the controls sit inside the card (a 9:16 card is as tall as the screen: below it they would be under the chat bar)
  const el = h(`div.mx-stage.is-in-frame${inFrame ? "" : ".is-made"}`, {},
    h("div.mx-screen", { on: { click: toggle } }, video),
    h("button.mx-watch.mx-big", { type: "button", title: "Play", "aria-label": "Play", hidden: !video.paused, on: { click: toggle } }, icon("play")),
    inFrame ? h("button.mx-watch-x", { type: "button", title: "Back to the cover", "aria-label": "Back to the cover", on: { click: () => (video.pause(), (watching = null), changedMixer()) } }, icon("close")) : null,
    h("div.mx-transport", {},
      h("button.key.is-icon.mx-toggle", { type: "button", title: "Play or pause", on: { click: () => (video.paused ? video.play() : video.pause()) } }, icon(video.paused ? "play" : "pause")),
      h("span.mx-time", {}, h("b", {}, "0:00.0"), h("em", {}, ` / ${time(total)}`)),
      bar,
      inFrame ? null : h("button.key.is-icon.mx-sound", { type: "button", title: video.muted ? "Sound on" : "Sound off", "aria-label": "Sound", on: { click: () => (video.muted = !video.muted) } }, icon(video.muted ? "mute" : "sound")),
      inFrame ? null : h("a.key.is-icon", { href: `${film.url}?download=${name}.mp4`, download: `${name}.mp4`, title: "Download the mix" }, icon("download")),
      !inFrame && m.body.cut ? h("button.key.is-icon", { type: "button", title: "Open in Kitchen's Cut\nFine-tune the edit: trims, titles, sound", on: { click: () => openInCut(m.body.cut) } }, icon("scissors")) : null));
  queueMicrotask(() => tick(video));
  // the preview starts with sound when its Play is pressed, once (a redraw leaves it as it is)
  if (inFrame && starting) {
    starting = false;
    queueMicrotask(() => video.play().catch(() => {}));
  }
  return el;
}
function tick(v) {
  const stage = v.closest(".mx-stage");
  if (!stage) return;
  const t = v.currentTime || 0;
  const big = stage.querySelector(".mx-big");
  if (big) big.hidden = !v.paused;
  const snd = stage.querySelector(".mx-sound");
  if (snd) snd.replaceChildren(icon(v.muted ? "mute" : "sound"));
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
  return h("div.mx-strip", { dataset: { scrollKey: "mx-strip" } },
    h("div.mx-strip-rows", {}, h("span", {}, "Original"), h("span", {}, "Remix")),
    ...shots.map((s, i) => {
      const st = shotState(s, i);
      return h(`button.mx-shot${i === mixer.selected ? ".is-on" : ""}`, { type: "button", on: { click: () => select(i) } },
        h("span.mx-shot-head", {}, `${pad2(i + 1)} · ${secs(shotLength(s))}`),
        h("span.mx-thumb", {}, s.frame ? h("img", { src: s.frame.url, alt: "", draggable: false, loading: "lazy" }) : null),
        icon("chevron"),
        h("span.mx-thumb.is-remix", {}, s.look ? h("img", { src: s.look.url, alt: "", draggable: false, loading: "lazy" }) : null,
          st.step === "rolling" ? h("i.mx-progress", { style: { width: `${Math.round((st.progress ?? 0) * 100)}%` } }) : null),
        h("span.mx-shot-state", { dataset: { step: st.step } }, h("span.lamp", { dataset: STEP_TONE[st.step] ? { tone: STEP_TONE[st.step] } : {} }),
          st.step === "rolling" ? `Rolling ${Math.round((st.progress ?? 0) * 100)}%` : st.step === "drawing" ? "Drawing" : st.step === "drawn" ? "Drawn" : st.step === "done" ? "Done" : st.step === "failed" ? "Failed" : "Waiting"));
    }));
}

function shotFix(m) {
  const s = m?.body.shots[mixer.selected];
  if (!s) return null;
  const i = mixer.selected;
  const st = shotState(s, i);
  const busy = st.step === "rolling" || st.step === "drawing" || mixing();
  return h("div.mx-fix", {},
    s.clip
      ? h("div.selector.mx-motion", { role: "group", title: "How this shot copies the original" }, ...[["pose", "Pose", "Copies the body's moves"], ["edges", "Edges", "Copies the outlines: objects, places, camera moves"], ["free", "Free", "Doesn't copy: the note says what happens"]].map(([v, label, tip]) =>
        h("button", { type: "button", "aria-pressed": String(s.motion === v), title: tip, on: { click: () => setShot(i, { motion: v }) } }, label)))
      : null,
    h("textarea.field.mx-note", { rows: 1, placeholder: `Fix shot ${i + 1}: e.g. sunglasses on, looking left`, value: s.note ?? "", dataset: { focus: `note:${m.id}:${i}` }, on: { input: (e) => ((s.note = e.target.value), save()) } }),
    h("button.key", { type: "button", disabled: busy || !m.body.cast.length, title: "Draws this shot's first frame again, with the note", on: { click: () => redo(i, { draw: true }) } }, icon("image")),
    h("button.key", { type: "button", disabled: busy || !s.look, title: "Rolls this shot again from its frame", on: { click: () => redo(i, { draw: false }) } }, icon("remix")),
    st.step === "failed" ? h("p.mx-error", {}, st.note) : null);
}

// ---------------------------------------------------------------- the crew, your stars, the mixes

function aside() {
  const firstRole = () => pick.role ?? castOf()[0]?.role;
  return h("aside.mx-aside", {},
    h("section.mx-panel", {},
      h("div.mx-head", {}, h("span.card-label", {}, "The crew")),
      h("div.mx-crew", {}, ...CREW.map((c) =>
        h("button.mx-crew-cat", { type: "button", title: `${c.name}, ${c.look}\n${pick.role ? `Plays the ${pick.role.toLowerCase()}` : "Click to cast"}`, on: { click: () => !remixing() && setRole(firstRole(), { crew: c.id }) } },
          h("img", { src: crewFace(c.id), alt: "", draggable: false }), h("b", {}, c.name), h("em", {}, c.role))))),
    h("section.mx-panel", {},
      h("div.mx-head", {}, h("span.card-label", {}, "Your stars")),
      h("div.mx-stars", {},
        ...stars.list.map((s) => h("div.mx-star", {},
          h("button.mx-star-pic", { type: "button", title: `${s.name}\n${pick.role ? `Plays the ${pick.role.toLowerCase()}` : "Click to cast"}`, on: { click: () => !remixing() && setRole(firstRole(), { star: s }) } }, h("img", { src: s.url, alt: "", draggable: false })),
          h("span", {}, s.name),
          h("button.mx-star-x", { type: "button", title: "Take it off", "aria-label": "Take it off", on: { click: () => removeStar(s.file) } }, icon("close")))),
        h("button.mx-star.is-add", { type: "button", title: "Stars to cast: from the Library, our characters or your computer", on: { click: (e) => openPicker(e.currentTarget, { title: "Add your stars", multiple: true, onPick: async (choice) => { try { await addStar(await pictureOf(choice), null); } catch (err) { toast(err.message, { tone: "crit" }); } } }) } }, icon("plus"), h("span", {}, "Add")))),
    h("section.mx-panel", {},
      h("div.mx-head", {}, h("span.card-label", {}, "My mixes"), h("span.mx-count", {}, mixer.list.length ? String(mixer.list.length) : "")),
      mixer.list.length
        ? h("div.mx-mixes", { dataset: { scrollKey: "mx-mixes" } }, ...mixer.list.map((row) =>
          h(`div.mx-mix${row.id === mixer.mix?.id ? ".is-on" : ""}`, {},
            h("button.mx-mix-open", { type: "button", title: `Open ${row.name}`, on: { click: () => openOne(row.id) } },
              row.thumb ? h("img", { src: row.thumb, alt: "", draggable: false, loading: "lazy" }) : h("span.mx-mix-none", {}, sprite("product-mixer")),
              h("span.mx-mix-text", {}, h("b", {}, row.name), h("em", {}, ago(row.updatedAt)))),
            h(`button.mx-mix-x${armed === row.id ? ".is-armed" : ""}`, { type: "button", title: armed === row.id ? "Click again to delete it" : "Delete this mix", on: { click: () => (armed === row.id ? ((armed = null), removeMix(row.id)) : ((armed = row.id), changedMixer(), setTimeout(() => armed === row.id && ((armed = null), changedMixer()), 3000))) } }, icon("trash")))))
        : h("p.hint", {}, "What you make is kept here.")),
    h("button.mx-remix-drop", { type: "button", title: "Any edit you like, remixed shot by shot with your cast\nA vertical video with cuts and music, up to 20 s", on: { click: () => pickFile("video/*", false, ([f]) => f && useVideo(f)) } },
      icon("upload"), h("span", {}, h("b", {}, "Remix any edit"), h("em", {}, "Drop a video you like"))));
}
async function openOne(id) {
  await openMix(id);
  const t = mixer.mix?.body?.trend;
  if (mixer.mix?.body?.kind === "trend" && t) {
    pick.trend = t.id;
    pick.cast = { trend: t.id, roles: structuredClone(t.cast) };
  }
  changedMixer();
  // the list of mixes is far below the version: bring it into view
  requestAnimationFrame(() => requestAnimationFrame(() => document.querySelector(".mx-work")?.scrollIntoView({ block: "start", behavior: "smooth" })));
}

// ---------------------------------------------------------------- the screen

export function renderMixer(el) {
  loadMixes();
  loadStars();
  const t = trendById(pick.trend) ?? OURS[0];
  // a note being typed keeps its place when the takes' progress redraws the screen
  const active = document.activeElement;
  const focus = el.contains(active) ? active.dataset.focus : null;
  const sel = focus ? [active.selectionStart, active.selectionEnd] : null;
  el.replaceChildren(h("div.mixer", {}, feed(), remixing() ? remix(mixer.mix) : recipe(t), aside()));
  if (focus) {
    const back = el.querySelector(`[data-focus="${CSS.escape(focus)}"]`);
    back?.focus({ preventScroll: true });
    if (back && sel) back.setSelectionRange?.(...sel);
  }
}

// dropped on Mixer: a video is an edit to remix; a photo is a star (or, while remixing, the cast)
const files = (list) => [...(list ?? [])];
document.addEventListener("dragover", (e) => currentPage() === "mixer" && e.dataTransfer?.types?.includes("Files") && e.preventDefault());
document.addEventListener("drop", (e) => {
  if (currentPage() !== "mixer" || !e.dataTransfer?.files?.length) return;
  e.preventDefault();
  for (const f of files(e.dataTransfer.files)) f.type.startsWith("video/") ? useVideo(f) : f.type.startsWith("image/") ? (remixing() ? addCast(f) : addStar(f)) : toast("Drop a video to remix, or a photo to cast.");
});
document.addEventListener("paste", (e) => {
  if (currentPage() !== "mixer" || e.target.closest?.("input, textarea")) return;
  const pics = files(e.clipboardData?.files).filter((f) => f.type.startsWith("image/") || f.type.startsWith("video/"));
  if (!pics.length) return;
  e.preventDefault();
  for (const f of pics) f.type.startsWith("video/") ? useVideo(f) : remixing() ? addCast(f) : addStar(f);
});
