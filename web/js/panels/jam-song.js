// Jam's first workspace, the song. The form sets its style, words and sound, with the many fine
// settings folded under Advanced) and the stage shows it: a record on a turntable in a spotlight, the song's name, its tempo,
// key and length, its waveform, and the key that makes it. The sections of the lyrics stand in a slim map beside the stage and the
// songs made so far on a shelf of sleeves under it. Pickle can help set the form up from the chat bar.
// Making costs credits, so it is a key with its estimate on it; nothing here makes a song by itself.
// A song made or brought in becomes the track of the video open (or of a new one): "Song made" in the pipeline, then the Track.
// A song has a cover (the record wears it as its label, the sleeve shows it) and a video cover: a few seconds of a character
// performing the best part of the song, made with LTX from the cover. Both are one key each under the song's name; the two that
// cost credits arm on the first press, with the price, and spend on the second.
import { h } from "../dom.js";
import { state, toast, waitFor, artistFor, onChange, changed } from "../store.js";
import { api } from "../api.js";
import { dropdown } from "../controls.js";
import { LANGUAGES, SIGNATURES, DEFAULT_SONG, MAX_SECONDS, STYLE_LORAS, PITCHES, MODES, KEYS, noteOf, modeOf, QUALITY, lengthLabel, STRUCTURES, skeleton, costOfSong } from "../song.js";
import { jicon, pickFile, cr, clock, mins } from "./jam-ui.js";
import { createDeck } from "./jam-deck.js";
import { jam, useSong, songHook, setWorkspace, save, applySyncedCaptions } from "../jam.js";
import { sungLines } from "../lyrics-align.js";
import { syncSongFile } from "../song-sync.js";
import { analyse } from "./jam-track-audio.js";
import { detectSections, lyricTags, HOP } from "../jam-sections.js";
import { pay, isArmed } from "./jam-band-pay.js";
import { KIND, WEIGHT, lyricTimeline, entryAt, sectionSpans, timingCovers } from "../song-lyrics.js";
import { COVER_SECONDS, COVER_VIDEO_PROMPT, bestPart, coverPrompt, costOfCover, costOfCoverVideo, coverOf, fileOfUrl, stepWords } from "../song-cover.js";

const STORE = "comfyture.jam.song.3";
const MINE = ["model", "idea", "structure", "tags", "lyrics", "seconds", "language", "key", "bpm", "signature", "name", "passes", "temperature", "adherence", "thinking", "lora"];
const song = { idea: "", tags: "", lyrics: "", name: "", ...DEFAULT_SONG, model: "minimax-music-3", writing: false, making: false, made: [], shown: null, loaded: false, adv: false };
try {
  Object.assign(song, JSON.parse(localStorage.getItem(STORE) ?? "{}"));
} catch {}
/** A style LoRA needs the person's own ComfyUI: Comfy Cloud has none. */
const onOwnGpu = () => state.info?.target === "self-hosted";
const keepDraft = () => {
  try {
    localStorage.setItem(STORE, JSON.stringify(Object.fromEntries(MINE.map((k) => [k, song[k]]))));
  } catch {}
};

const MIN_SECONDS = 20;
const MIN_BPM = 40;
const MAX_BPM = 220;
let page = null; // the elements kept between draws: the fields, the record, the song that plays
let deck = null;
let seen = null; // the video the stage was last set for
let drafting = false; // the stage shows the song being designed (the form's), not one of the shelf
/** The covers the library holds, by song file ({ cover, coverVideo, coverSeconds }): read with the shelf, kept when one is set. */
const covers = new Map();
const coverFor = (m) => coverOf(m ? covers.get(m.file) ?? m : null);
const making = { what: null, words: "", file: null }; // a cover being made: "picture" or "video", which song, what it is at

// ---------------------------------------------------------------- what is shown, what is made

/** The songs on the shelf: the track of the video open first (one of the made or brought in, or its own), then the ones made or brought in. */
function shelf() {
  const track = jam.jam?.body.track;
  // (the library's entry for it may hold no words of its own, as a showcase's does: what the video's track says of it fills in)
  const found = track && song.made.find((m) => m.file === track.file);
  const own = !track ? [] : [found
    ? { ...found, lyrics: found.lyrics ?? track.lyrics, timing: found.timing ?? track.timing }
    : { file: track.file, url: track.url, name: track.name, seconds: track.seconds, kind: track.kind ?? "upload", bpm: track.bpm ?? (jam.jam.body.bpm ? Math.round(jam.jam.body.bpm) : undefined), lyrics: track.lyrics, timing: track.timing }];
  return [...own, ...song.made.filter((m) => m.file !== track?.file)].slice(0, 26);
}
const shownSong = () => shelf().find((m) => m.file === song.shown) ?? null;
const inJam = (m) => !!m && jam.jam?.body.track?.file === m.file;

async function make() {
  if (song.making) return;
  if (!song.tags.trim()) return toast("Let Pickle set the song up first: say what it is about.");
  song.making = true;
  redrawAll();
  try {
    const job = await api.makeSong({ model: song.model, tags: song.tags, lyrics: song.lyrics, seconds: song.seconds, bpm: song.bpm, key: song.key, language: song.language, timesignature: song.signature, passes: song.passes, temperature: song.temperature, adherence: song.adherence, thinking: song.thinking, lora: onOwnGpu() ? song.lora : "", name: song.name || "New song" });
    const done = await waitFor("job", job.id);
    const made = { ...done.audio, tags: song.tags, lyrics: song.lyrics, ...(song.model === "ace-step" ? { key: song.key, bpm: song.bpm } : {}) };
    song.made.unshift(made);
    show(made.file);
    // a video that has no song takes this one at once (free: the part is cut here); one that has keeps its own until you say
    if (!jam.jam?.body.track) await useSong(made);
  } catch (e) {
    toast(e.message, { tone: "crit" });
  } finally {
    song.making = false;
    redrawAll();
  }
}

/** A song brought in (a sound, or a video's sound): on the shelf, shown, and the video's song when it has none. */
export function bringSong(file) {
  return api.uploadAudio(file).then(async (a) => {
    const made = { file: a.file, url: a.url, name: (file.name ?? "").replace(/\.\w+$/, "").slice(0, 50) || "My song", seconds: a.seconds, kind: "upload" };
    song.made.unshift(made);
    show(made.file);
    if (!jam.jam?.body.track) await useSong(made);
    redrawAll();
  }, (e) => toast(e.message, { tone: "crit" }));
}

/** The shown song becomes the video's: of the open one when it has none, else of a new one; then the track opens. */
async function useIt() {
  const m = shownSong();
  if (!m) return;
  const j = await useSong({ ...m, cover: coverFor(m).picture ?? undefined });
  if (j) setWorkspace("track");
}

/** The stage shows the song being designed (the form's), not one of the shelf: a song that was playing stops. */
function showDraft() {
  drafting = true;
  song.shown = null;
  page?.audio.pause();
  page?.audio.removeAttribute("src");
}

/** The text boxes hold what the song holds. */
const sync = () => {
  if (!page) return;
  page.idea.value = song.idea;
  page.tags.value = song.tags;
  page.lyrics.value = song.lyrics;
  page.name.value = song.name;
  page.count.textContent = `${song.idea.length}/500`;
};

// ---------------------------------------------------------------- the cover and the video cover

/** What the library says of a song's cover after a change: kept here, shown at once, and the video that has this song as its track follows. */
function keptCover(file, entry) {
  const next = { cover: entry.cover, coverVideo: entry.coverVideo, coverSeconds: entry.coverSeconds };
  covers.set(file, next);
  const j = jam.jam;
  if (j?.body.track?.file === file) {
    if (next.cover) j.body.track.cover = next.cover;
    else delete j.body.track.cover;
    save(j);
  }
  redrawAll();
}

/** Asks the server to keep a change of a song's cover; answers the entry it holds now. */
async function setCover(m, body) {
  const entry = await api.setCover({ file: m.file, ...body });
  keptCover(m.file, entry);
  return entry;
}

/** The busy mark of a cover being made: set while it is, put away when it is done or failed. */
async function busyWith(what, m, run) {
  if (making.what) return;
  Object.assign(making, { what, file: m.file, words: what === "picture" ? "Drawing the cover" : "Finding the best part" });
  redrawStage();
  try {
    await run();
  } catch (e) {
    toast(e.message, { tone: "crit" });
  } finally {
    Object.assign(making, { what: null, file: null, words: "" });
    redrawStage();
  }
}

/** A picture of the person's own becomes the cover (free). */
function useMyPicture(m) {
  pickFile("image/*", (file) => busyWith("picture", m, async () => {
    making.words = "Keeping your picture";
    const p = await api.upload(file, file.name);
    await setCover(m, { cover: p.url });
  }));
}

/** The picture model draws the cover from the song's name, idea and style (a key that costs: armed first). */
function makeCover(m) {
  const cost = coverCost();
  pay(`cover:picture:${m.file}`, cost, () => busyWith("picture", m, async () => {
    // (the idea is the form's when the song shown is the one it made)
    const idea = song.tags && m.tags === song.tags ? song.idea : "";
    const [job] = await api.image({ model: artistFor("generate"), template: "generate", prompt: coverPrompt({ name: m.name, idea, tags: m.tags ?? song.tags }), refs: [], aspect: "1:1", count: 1, megapixels: 1, seed: Math.floor(Math.random() * 2 ** 31), name: `${m.name} · cover` });
    const done = await waitFor("job", job.id);
    await setCover(m, { cover: done.photo.url });
  }));
}

/**
 * The video cover: the best few seconds of the song are found (the loudest stretch, a chorus when one begins near it, on a bar),
 * cut as a sound of their own, and LTX makes a clip of the cover performing them, which is kept and noted on the song.
 */
function makeVideoCover(m) {
  const cv = coverFor(m);
  if (!cv.picture) return toast("Make or pick a cover first: the video starts from it.");
  pay(`cover:video:${m.file}`, videoCost(), () => busyWith("video", m, async () => {
    const heard = await analyse(m.url);
    if (!heard) throw new Error("This song could not be read to find its best part.");
    const sections = detectSections(heard.energy, heard.seconds, { bpm: m.bpm ?? 0, names: lyricTags(m.lyrics) }).sections;
    const part = bestPart(heard.energy, heard.seconds, { hop: HOP, bpm: m.bpm ?? 0, sections });
    making.words = "Cutting the best part";
    redrawStage();
    const piece = await api.slicePart({ audio: m.file, from: part.start, to: part.start + part.length, name: `${m.name} · cover part`, kind: "part" });
    const [run] = await api.shoot({
      review: false, takes: 1, quality: "standard", aspect: "auto", name: `${m.name} · video cover`,
      start: fileOfUrl(cv.picture), audio: { file: piece.file, lipsync: true }, seconds: Math.min(10, Math.max(2, Math.ceil(part.length))),
      script: { shots: [{ action: COVER_VIDEO_PROMPT, camera: "", sound: "", framing: "" }], raw: "" },
    });
    // the take's own news says what it is at while it is waited for
    const watch = setInterval(() => {
      const r = (state.runs ?? []).find((x) => x.id === run.id);
      if (!r) return;
      making.words = `${stepWords(r.status)}${r.progress > 0.02 ? ` ${Math.round(r.progress * 100)}%` : ""}`;
      drawStage();
    }, 1200);
    try {
      await waitFor("run", run.id);
    } finally {
      clearInterval(watch);
    }
    making.words = "Keeping the video";
    redrawStage();
    const kept = await api.videoFrom({ run: run.id });
    await setCover(m, { video: kept.url, seconds: kept.duration ?? part.length });
  }));
}

/** The cover goes (and its video with it), or only the video. */
function removeCover(m, only) {
  busyWith("picture", m, async () => {
    making.words = "Taking it off";
    await setCover(m, only === "video" ? { clear: "video" } : { clear: true });
  });
}

const cloud = () => state.info?.target === "comfy-cloud";
// (the picture models arrive a moment after the page: the price on the key is set again when it changes)
let priced = null;
onChange((scopes) => {
  if (page && scopes.has("assistant") && coverCost() !== priced) drawStage();
});
const coverCost = () => costOfCover((state.image.catalogue?.models ?? []).find((x) => x.id === artistFor("generate")), cloud());
const videoCost = () => costOfCoverVideo(COVER_SECONDS.default, cloud());

/** A key of the cover row: an icon with its words in a tooltip; one that costs shows its price, and when armed says to press again. */
function coverKey({ id, icon, label, tip, cost = null, run, disabled = false, on = false }) {
  const armed = cost !== null && isArmed(id);
  return h(`button.sg-ckey${armed ? ".is-armed" : ""}${on ? ".is-on" : ""}`, { type: "button", disabled: disabled || !!making.what, title: armed ? `Press again to spend ${cr(cost)}\n${tip}` : cost !== null ? `${tip}\n${cr(cost)}` : tip, "aria-label": label, dataset: { cover: id.split(":")[1] ?? id }, on: { click: run } },
    jicon(icon), h("span", {}, armed ? `Again: ${cr(cost)}` : label), cost !== null && !armed ? h("em", {}, cr(cost)) : null);
}

/** The cover row under the song's name: its cover as a small picture, the keys that make, bring or take off the cover, what is being made. */
function drawCover(m) {
  const row = page.cover;
  row.hidden = !m;
  if (!m) return;
  const cv = coverFor(m);
  const mine = making.file === m.file ? making : null;
  priced = coverCost();
  row.replaceChildren(...[
    cv.picture ? h("img.sg-cthumb", { src: cv.picture, alt: "The cover", draggable: false }) : h("span.sg-cthumb.is-none", { title: "No cover yet" }, jicon("image")),
    h("div.sg-ckeys", { role: "group", "aria-label": "The cover" },
      coverKey({ id: `cover:picture:${m.file}`, icon: "sparkle", label: cv.picture ? "New cover" : "Make the cover", tip: "The picture model draws a cover from the song's name and style", cost: coverCost(), run: () => makeCover(m) }),
      coverKey({ id: `cover:mine:${m.file}`, icon: "image", label: "My picture", tip: "Use a picture of your own as the cover (free)", run: () => useMyPicture(m) }),
      coverKey({ id: `cover:video:${m.file}`, icon: "film", label: cv.video ? "New video cover" : "Video cover", tip: cv.picture ? "A few seconds of the cover performing the best part of the song (LTX 2.5, from the cover)" : "Needs a cover first: the video starts from it", cost: cv.picture ? videoCost() : null, run: () => makeVideoCover(m), disabled: !cv.picture }),
      cv.video ? coverKey({ id: `cover:novideo:${m.file}`, icon: "close", label: "Video off", tip: "Take the video cover off (the cover stays)", run: () => removeCover(m, "video") }) : null,
      cv.picture ? coverKey({ id: `cover:none:${m.file}`, icon: "trash", label: "Cover off", tip: "Take the cover and its video off the song", run: () => removeCover(m) }) : null),
    mine?.what ? h("span.sg-cstate", { role: "status" }, h("i.sg-spin"), mine.words) : null].filter(Boolean));
}

/** The video cover as a small loop beside the record: muted, looping; a press plays it with its sound. */
function drawClip(m) {
  const cv = coverFor(m);
  const clip = page.clip;
  clip.hidden = !cv.video;
  if (!cv.video) {
    if (page.clipVideo.getAttribute("src")) (page.clipVideo.pause(), page.clipVideo.removeAttribute("src"), page.clipVideo.load());
    return;
  }
  if (page.clipVideo.getAttribute("src") !== cv.video) {
    page.clipVideo.muted = true;
    clip.setAttribute("aria-pressed", "false");
    page.clipTag.textContent = "Video cover";
    page.clipVideo.src = cv.video;
    page.clipVideo.play().catch(() => {});
  }
}

/** A press on the loop: its sound comes on (and the song's pauses); another turns it off. */
function toggleClipSound() {
  const v = page.clipVideo;
  v.muted = !v.muted;
  page.clip.setAttribute("aria-pressed", String(!v.muted));
  page.clipTag.textContent = v.muted ? "Video cover" : "Sound on";
  if (!v.muted) {
    page.audio.pause();
    v.currentTime = 0;
    v.play().catch(() => {});
  }
}

// ---------------------------------------------------------------- the steps

const chips = (items, on, pick, label, cls = "") =>
  h(`div.sg-chips${cls}`, { role: "group", "aria-label": label }, ...items.map(([value, text, desc, extra]) =>
    h("button.key", { type: "button", "aria-pressed": String(on === value), title: desc ?? "", on: { click: () => pick(value) } }, extra ?? null, text)));

/** A structure's little picture: its sections as blocks, the choruses lit. */
const blocks = (id) => h("span.sg-blocks", { "aria-hidden": "true" }, ...(STRUCTURES.find((s) => s.id === id)?.sections ?? []).map((s) => h(`i${/chorus/i.test(s) ? ".is-chorus" : /verse/i.test(s) ? ".is-verse" : ""}`)));

/** A slider with its reading beside it; it changes the song as it moves, and the keys around it are drawn again when it is let go. */
function range({ min, max, step, value, label, format, set, ends }) {
  const out = h("output.sg-out", {}, format(value));
  const input = h("input.sg-range", { type: "range", min, max, step, value, "aria-label": label, on: { input: (e) => ((out.textContent = format(Number(e.target.value))), set(Number(e.target.value))), change: () => redrawSteps() } });
  return h("div.sg-slider", {}, input, out, ends ? h("div.sg-ends", {}, h("span", {}, ends[0]), h("span", {}, ends[1])) : null);
}

function pickStructure(id) {
  song.structure = id;
  const words = song.lyrics.replace(/\[[^\]]*\]/g, "").trim();
  if (!words) page.lyrics.value = song.lyrics = id === "instrumental" ? "[Instrumental]" : skeleton(id);
  keepDraft();
  redrawAll();
}

/** Tapping the beat sets the tempo: the last few taps, averaged, forgotten after two seconds of rest. */
let taps = [];
function tap() {
  const now = performance.now();
  taps = [...taps.filter((t) => now - t < 2000), now].slice(-6);
  if (taps.length < 2) return;
  const gap = (taps.at(-1) - taps[0]) / (taps.length - 1);
  song.bpm = Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(60000 / gap)));
  keepDraft();
  redrawSteps();
  redrawStage();
}

const set = (field) => (e) => ((song[field] = e.target.value), keepDraft(), field === "lyrics" && redrawMap());
const pick = (field) => (v) => ((song[field] = v), keepDraft(), redrawAll());

/** The tempo as a dial: dragged round, or with the arrow keys; its reading in the middle, a key beside it that taps the beat. */
function tempoDial() {
  const R = 44;
  const C = 2 * Math.PI * R;
  const SWEEP = 0.75;
  const arc = (v) => `${C * SWEEP * v} ${C}`;
  const share = (bpm) => (bpm - MIN_BPM) / (MAX_BPM - MIN_BPM);
  const svg = h("div.sg-dial-face", {});
  const reading = h("b", {}, String(song.bpm));
  const draw = () => {
    svg.innerHTML = `<svg viewBox="0 0 108 108" aria-hidden="true">
      <circle cx="54" cy="54" r="${R}" fill="none" stroke="#2a2a2f" stroke-width="7" stroke-linecap="round" stroke-dasharray="${arc(1)}" transform="rotate(135 54 54)"/>
      <circle cx="54" cy="54" r="${R}" fill="none" stroke="#F2FF59" stroke-width="7" stroke-linecap="round" stroke-dasharray="${arc(share(song.bpm))}" transform="rotate(135 54 54)"/>
    </svg>`;
    svg.append(h("div.sg-dial-read", {}, reading, h("span", {}, "BPM")));
    reading.textContent = String(song.bpm);
  };
  const at = (e) => {
    const r = svg.getBoundingClientRect();
    const a = Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * (180 / Math.PI);
    const turn = (((a - 135) % 360) + 360) % 360;
    return turn > 270 ? (turn > 315 ? 0 : 1) : turn / 270;
  };
  const put = (bpm, done) => {
    song.bpm = Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(bpm)));
    draw();
    el.setAttribute("aria-valuenow", String(song.bpm));
    if (done) (keepDraft(), redrawStage());
  };
  const el = h("div.sg-dial", { role: "slider", tabindex: "0", "aria-label": "Tempo in beats per minute", "aria-valuemin": String(MIN_BPM), "aria-valuemax": String(MAX_BPM), "aria-valuenow": String(song.bpm) }, svg);
  el.addEventListener("pointerdown", (e) => {
    el.setPointerCapture(e.pointerId);
    put(MIN_BPM + at(e) * (MAX_BPM - MIN_BPM), false);
    const move = (ev) => put(MIN_BPM + at(ev) * (MAX_BPM - MIN_BPM), false);
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      put(song.bpm, true);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  });
  el.addEventListener("keydown", (e) => {
    const d = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    put(song.bpm + d * (e.shiftKey ? 5 : 1), true);
  });
  draw();
  return h("div.sg-tempo", {}, el, h("button.key.is-quiet.sg-tap", { type: "button", title: "Tap the beat: the tempo follows", on: { click: tap } }, jicon("pulse"), "Tap"));
}

/** The length: its reading big, a slider under it, and the usual lengths marked on it (a press on one sets it). */
function lengthControl() {
  const big = h("b.sg-big", {}, lengthLabel(song.seconds));
  const input = h("input.sg-range", { type: "range", min: MIN_SECONDS, max: MAX_SECONDS, step: 5, value: song.seconds, "aria-label": "Length in seconds",
    on: { input: (e) => ((song.seconds = Number(e.target.value)), (big.textContent = lengthLabel(song.seconds)), keepDraft(), redrawStage()), change: () => redrawSteps() } });
  const place = (v) => `${((v - MIN_SECONDS) / (MAX_SECONDS - MIN_SECONDS)) * 100}%`;
  return h("div.sg-length", {},
    h("div.sg-length-head", {}, h("span.sg-field", {}, "Length"), big),
    input,
    h("div.sg-marks", {}, ...[30, 60, 120, 200, 240].map((v) => h("button", { type: "button", style: { left: place(v) }, title: `Make it ${lengthLabel(v)}`, on: { click: () => ((song.seconds = v), keepDraft(), redrawAll()) } }, clock(v)))));
}

/** A row of word pills; the ones picked that the row does not list stay on it. */
const step = (n, label, meta, ...body) =>
  h("section.sg-step", {}, h("header.sg-step-head", {}, h("span.sg-num", {}, String(n)), h("h2", {}, label), meta ? h("span.sg-meta", {}, meta) : null), ...body);
const row = (label, ...body) => h("div.sg-row", {}, h("span.sg-field", {}, label), h("div.sg-ctl", {}, ...body));

function drawSteps() {
  const minimax = song.model === "minimax-music-3";
  const lang = dropdown({ label: "Language", value: song.language, items: LANGUAGES.map((l) => ({ value: l.value, label: l.label })), onChange: pick("language"), width: "fit" });
  const here = noteOf(song.key);
  const lines = song.lyrics.split("\n").filter((l) => l.trim() && !/^\s*\[[^\]]*\]\s*$/.test(l)).length;
  return [
    step(1, "Style prompt & lyrics", null,
      row("Music model", chips([["minimax-music-3", "MiniMax Music 3"], ["ace-step", "ACE-Step 1.5 XL"]], song.model, pick("model"), "Music model", ".is-seg")),
      h("div.sg-words", {}, h("label.sg-field", { for: "sg-style-prompt" }, "Style prompt"),
        h("p.sg-field-help", {}, minimax ? "Describe the genre, tempo, key, voice, instruments and arrangement. MiniMax follows these as creative direction." : "Describe the genre, instruments, voice, arrangement and production."), page.tags),
      h("div.sg-lyrics", {}, h("div.sg-lyrics-head", {}, h("label.sg-field", { for: "sg-lyrics-input" }, "Lyrics"), h("span.sg-meta", {}, lines ? `${lines} lines` : "none yet")),
        h("p.sg-field-help", {}, "Write your own words, or enter [Instrumental] for a track without vocals."),
        page.lyrics)),
    minimax ? step(2, "Length", "Maximum duration", lengthControl()) : step(2, "Structure & sound", null,
      h("div.sg-shapes", { role: "group", "aria-label": "Song structure" }, ...STRUCTURES.map((x) =>
        h("button.sg-shape", { type: "button", "aria-pressed": String(song.structure === x.id), title: x.desc, on: { click: () => pickStructure(x.id) } }, blocks(x.id), h("b", {}, x.label)))),
      h("div.sg-dials", {}, lengthControl(), tempoDial())),
    minimax ? h("section.sg-step", {}, row("Title", page.name), h("p.sg-field-help", {}, "MiniMax uses your style prompt and lyrics. Duration is a maximum; the finished song may be shorter.")) : h("details.sg-adv", { open: song.adv, on: { toggle: (e) => (song.adv = e.target.open) } },
      h("summary", {}, jicon("caret"), h("b", {}, "Advanced"), h("span", {}, "Title · Key · Time · Language · Quality")),
      h("div.sg-adv-body", {},
        row("Title", page.name),
        row("Key",
          chips(PITCHES.map((n) => [n, n]), here, (n) => pick("key")(`${n} ${modeOf(song.key)}`), "Note", ".is-notes"),
          chips(MODES.map((m) => [m, m[0].toUpperCase() + m.slice(1)]), modeOf(song.key), (m) => pick("key")(`${here} ${m}`), "Mode", ".is-seg")),
        row("Time", chips(SIGNATURES.map((x) => [x.value, x.label, x.desc]), song.signature, pick("signature"), "Time signature", ".is-seg")),
        row("Language", lang),
        row("Quality", chips(QUALITY, song.passes, pick("passes"), "Quality", ".is-seg")),
        onOwnGpu() ? row("Style LoRA", chips([["", "None", "No LoRA"], ...STYLE_LORAS.map(([id, name]) => [id, name, `The ${name} LoRA: its trigger word goes in for you. For a beat or a song with no words: it makes sung words unclear`])], song.lora ?? "", pick("lora"), "Style LoRA", ".is-seg")) : null,
        row("Creativity", range({ min: 0.4, max: 1.1, step: 0.05, value: song.temperature, label: "Creativity", format: (v) => v.toFixed(2), set: (v) => ((song.temperature = v), keepDraft()), ends: ["steady", "wild"] })),
        row("Follows the words", range({ min: 1, max: 5, step: 0.5, value: song.adherence, label: "How closely it follows the words and the style", format: (v) => v.toFixed(1), set: (v) => ((song.adherence = v), keepDraft()), ends: ["loose", "strict"] })),
        row("Plans first", h("button.key", { type: "button", "aria-pressed": String(song.thinking), title: "The model plans the song's structure before it sounds it: better built, slower", on: { click: () => pick("thinking")(!song.thinking) } }, song.thinking ? "On" : "Off")))),
  ];
}

// ---------------------------------------------------------------- the sections: where each falls

/** The sections of some lyrics in order ([Verse 1], [Chorus - chant hook]…), else the shape's own. */
const sectionsOf = (lyrics = song.lyrics) => {
  const tags = [...lyrics.matchAll(/^[ \t]*\[([^\]\n]+)\][ \t]*$/gm)].map((m) => m[1].trim());
  return (tags.length ? tags : (STRUCTURES.find((s) => s.id === song.structure)?.sections ?? [])).map((name) => ({ name, label: name.replace(/\s+-\s+.*$/, ""), kind: KIND(name) }));
};

/**
 * Each section with the stretch of the song it should fall in (the song's length shared out by what each usually takes). The map is
 * the plan of the form; a song shown that was made with lyrics of its own (here) shows its own plan, in its own length.
 */
function sectionTimes() {
  const m = shownSong();
  const own = m?.lyrics && /\[[^\]]+\]/.test(m.lyrics) ? m : null;
  const total = own?.seconds || song.seconds;
  // (a song whose lyrics were put on the times heard: its sections are where they really are)
  if (timingCovers(own?.timing, total)) {
    const spans = sectionSpans(own.lyrics, total, own.timing).filter((x) => x.to > x.from);
    if (spans.length) return spans.map((x) => ({ name: x.name, label: x.label, kind: KIND(x.name), weight: Math.max(0.3, ((x.to - x.from) / total) * spans.length), from: x.from, to: x.to }));
  }
  const list = sectionsOf(own ? own.lyrics : song.lyrics).map((s) => ({ ...s, weight: /final/i.test(s.name) ? 1.25 : WEIGHT[s.kind] }));
  const sum = list.reduce((t, s) => t + s.weight, 0) || 1;
  let at = 0;
  return list.map((s) => {
    const from = at;
    at += (s.weight / sum) * total;
    return { ...s, from, to: at };
  });
}

function drawMap() {
  const list = sectionTimes();
  if (!list.length) return [h("span.sg-label", {}, "Section map"), h("p.sg-hint", {}, "A song with no words has no sections.")];
  return [
    h("span.sg-label", {}, "Section map"),
    h("ol.sg-secs", {}, ...list.map((s, i) =>
      h("li", { style: { "--w": String(s.weight) }, dataset: { kind: s.kind } },
        h("button.sg-sec", { type: "button", title: `${s.name}: it should fall between ${mins(s.from)} and ${mins(s.to)}\nShow it in the lyrics`, on: { click: () => showSection(i) } },
          h("i", {}), h("b", {}, s.label), h("em", {}, `${mins(s.from)} – ${mins(s.to)}`))))),
  ];
}

/** A section of the map is found in the lyrics, with the cursor on its tag. */
function showSection(n) {
  const tags = [...page.lyrics.value.matchAll(/^[ \t]*\[[^\]\n]+\][ \t]*$/gm)];
  const m = tags[n];
  requestAnimationFrame(() => {
    page.lyrics.focus();
    if (m) page.lyrics.setSelectionRange(m.index, m.index + m[0].length);
    page.lyrics.scrollIntoView({ block: "center" });
  });
}

// ---------------------------------------------------------------- the stage

const peaks = new Map();
/** A song's waveform: bars of its loudest peaks, read once (free, in the browser). */
async function peaksOf(m) {
  if (peaks.has(m.url)) return peaks.get(m.url);
  peaks.set(m.url, null);
  try {
    const ctx = new AudioContext();
    const buf = await ctx.decodeAudioData(await (await fetch(m.url)).arrayBuffer());
    ctx.close();
    const d = buf.getChannelData(0);
    const n = 180;
    const step = Math.max(1, Math.floor(d.length / n));
    const out = Array.from({ length: n }, (_, i) => {
      let top = 0;
      for (let k = i * step; k < (i + 1) * step; k += 24) top = Math.max(top, Math.abs(d[k] ?? 0));
      return top;
    });
    const loud = Math.max(...out, 0.05);
    peaks.set(m.url, out.map((v) => v / loud));
  } catch {
    peaks.set(m.url, null);
  }
  drawWave();
}

/** What a song that is not made yet might look like: louder in the choruses, quieter at the edges (a sketch, not a promise). */
function ghost() {
  const list = sectionTimes();
  const total = list.at(-1)?.to || song.seconds;
  const level = { chorus: 0.85, pre: 0.65, verse: 0.5, bridge: 0.58, edge: 0.3, other: 0.5 };
  return Array.from({ length: 180 }, (_, i) => {
    const t = ((i + 0.5) / 180) * total;
    const s = list.find((x) => t >= x.from && t < x.to);
    const n = Math.sin(i * 12.9898) * 43758.5453;
    return (level[s?.kind ?? "other"] ?? 0.5) * (0.62 + (n - Math.floor(n)) * 0.38);
  });
}

function drawWave() {
  const c = page?.wave;
  if (!c) return;
  const w = c.clientWidth;
  const hgt = c.clientHeight;
  if (!w || !hgt) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(hgt * dpr)) {
    c.width = Math.round(w * dpr);
    c.height = Math.round(hgt * dpr);
  }
  const g = c.getContext("2d");
  g.clearRect(0, 0, c.width, c.height);
  const m = shownSong();
  const real = m ? peaks.get(m.url) : null;
  const data = real ?? ghost();
  const at = m && page.audio.duration ? page.audio.currentTime / page.audio.duration : 0;
  const bar = c.width / data.length;
  data.forEach((v, i) => {
    g.fillStyle = real ? (i / data.length < at ? "#F2FF59" : "rgba(150,128,230,.82)") : "rgba(240,239,237,.16)";
    const bh = Math.max(3 * dpr, v * c.height * 0.92);
    g.fillRect(i * bar + bar * 0.18, (c.height - bh) / 2, Math.max(1, bar * 0.64), bh);
  });
}

/** One song shown on the stage: its record, its readings, its sound ready to play. */
function show(file) {
  lyr.armed = false;
  drafting = false;
  song.shown = file;
  const m = shownSong();
  if (m && page.audio.getAttribute("src") !== m.url) {
    page.audio.pause();
    page.audio.src = m.url;
  }
  if (m) peaksOf(m);
  redrawAll();
}

function toggle(m) {
  if (m && song.shown !== m.file) show(m.file);
  if (!page.audio.src) return;
  page.audio.paused ? page.audio.play().catch(() => {}) : page.audio.pause();
}

const keyLabel = (m) => (inJam(m) ? "On to the track" : jam.jam?.body.track ? "Use it in a new video" : "Use it for the video");

/** The stage's readings and keys, set again when the song, the form or the video changes (the record and the sound are never rebuilt). */
function drawStage() {
  if (!page) return;
  const m = shownSong();
  const cost = state.info?.target === "comfy-cloud" && song.model !== "minimax-music-3" ? costOfSong(song.seconds, song.passes) : null;
  const title = (m?.name ?? song.name) || "New song";
  page.name_.textContent = title;
  page.read.textContent = m
    ? `${m.bpm ? `${m.bpm} BPM · ` : ""}${m.key ? `${m.key} · ` : ""}${lengthLabel(Math.round(m.seconds || 0))}`
    : song.model === "minimax-music-3" ? `MiniMax Music 3 · up to ${lengthLabel(song.seconds)}` : `${song.bpm} BPM · ${song.key} · ${lengthLabel(song.seconds)}`;
  if (!m) page.time.textContent = "00:00 / 00:00";
  page.state.textContent = song.making ? "Making the song…" : m ? "" : "Not made yet";
  page.state.hidden = !page.state.textContent;
  page.stage.classList.toggle("is-making", song.making);
  page.play.disabled = !m;
  page.play.replaceChildren(jicon(page.audio.paused ? "play" : "pause"));
  page.play.title = m ? "Play or pause" : "Nothing to play yet";
  page.make.disabled = song.making;
  page.make.className = `key is-primary sg-make${song.making ? " is-busy" : ""}`;
  // (replaceChildren writes a null out as the word "null": the price goes in only when there is one)
  page.make.replaceChildren(jicon("note"), song.making ? "Making the song…" : "Make the song", ...(cost && !song.making ? [h("span.sg-cr", {}, cr(cost))] : []));
  page.hint.textContent = song.model === "minimax-music-3" ? "MiniMax Music 3 · GPU time billed by Comfy Cloud; cost not yet estimated." : song.passes === 1 ? "A draft: quicker and cheaper. Make it Full for the final." : "Full songs sound best. Cut your favourite part next.";
  deck.setCover(coverFor(m).picture);
  drawCover(m);
  drawClip(m);
  page.use.hidden = !m;
  if (m) {
    page.use.dataset.here = inJam(m) ? "1" : "";
    page.use.replaceChildren(...[inJam(m) ? jicon("check") : null, h("span", {}, keyLabel(m)), jicon("next")].filter(Boolean));
    page.use.title = inJam(m) ? "This song is the video's track: go on to it" : jam.jam?.body.track ? "The video open has a song already: a new video is made for this one" : "This song becomes the video's track (free), then the track opens";
  }
  drawWave();
  drawLyrics();
}

// ---------------------------------------------------------------- the lyrics display

/** The lyrics under the player: the words the song was made from (the form's own while none is shown), the line sounding lit as it plays. */
const lyr = { key: null, timeline: [], items: [], at: -2, held: -Infinity, syncing: false, armed: false, roman: new Map(), loading: new Set() };
async function syncSongLyrics(m) {
  if (!m || lyr.syncing) return;
  if (!lyr.armed) { lyr.armed = true; page.lyrSync.textContent = "Confirm sync · Cloud GPU cost"; return; }
  lyr.armed = false;
  lyr.syncing = true;
  page.lyrSync.disabled = true;
  page.lyrSync.textContent = "Listening to the song…";
  try {
    const lyrics = m.lyrics || (inJam(m) ? jam.jam?.body.track?.lyrics : "") || "";
    const { timing } = await syncSongFile({ ...m, lyrics });
    Object.assign(m, { lyrics, timing });
    const stored = song.made.find((x) => x.file === m.file);
    if (stored) Object.assign(stored, { lyrics, timing });
    if (inJam(m)) { Object.assign(jam.jam.body.track, { lyrics, timing }); save(jam.jam); await applySyncedCaptions(jam.jam); changed("jam"); }
    lyr.key = null;
    redrawAll();
  } catch (e) { toast(e.message, { tone: "crit" }); }
  finally { lyr.syncing = false; if (page) { page.lyrSync.disabled = false; lyr.key = null; drawLyrics(); } }
}
function drawLyrics() {
  if (!page) return;
  const m = shownSong();
  const words = m ? m.lyrics ?? "" : song.lyrics;
  const seconds = m ? m.seconds || 0 : song.seconds;
  const timing = m?.timing;
  const japanese = /[^\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}\s]/u.test(words);
  const linesForRoman = sungLines(words);
  if (japanese && linesForRoman.length && !lyr.roman.has(words) && !lyr.loading.has(words)) {
    lyr.loading.add(words);
    api.romanizeSong({ lines: linesForRoman }).then((r) => { lyr.roman.set(words, r.lines); lyr.key = null; drawLyrics(); }).catch(() => {}).finally(() => lyr.loading.delete(words));
  }
  const roman = lyr.roman.get(words);
  const key = `${m?.file ?? "draft"}|${seconds}|${words}|${timing ? "heard" : ""}|${!!roman}`;
  if (key === lyr.key) return;
  const timeline = lyricTimeline(words, seconds, timing);
  const lines = timeline.filter((e) => e.kind === "line").length;
  let lineIndex = 0;
  page.lyrBody.replaceChildren(...(timeline.length
    ? timeline.map((e, i) => (e.kind === "tag"
      ? h("div.sg-ly-tag", { dataset: { i } }, h("span", {}, e.text), e.hint ? h("em", {}, e.hint) : null)
      : h("button.sg-ly-line", { type: "button", dataset: { i }, disabled: !timing, title: timing ? `Jump to ${mins(e.from)}` : "Sync lyrics to seek", on: { click: () => lyricSeek(e.from) } }, h("span", {}, e.text), roman?.[lineIndex++] ? h("small", { style: { display: "block", opacity: "0.65" } }, roman[lineIndex - 1]) : null)))
    : [h("p.sg-ly-empty", {}, m ? "No lyrics kept for this song." : "Lyrics appear here once the song has some.")]));
  Object.assign(lyr, { key, timeline, items: [...page.lyrBody.children], at: -2 });
  page.lyrMeta.textContent = lines ? timing ? `${lines} lines · synced` : `${lines} lines · not synced` : timeline.length ? "no words" : "";
  page.lyrSync.hidden = !m || !lines;
  if (!lyr.syncing) page.lyrSync.textContent = timing ? "Sync again" : "Sync lyrics";
  page.lyrBody.scrollTop = 0;
  tickLyrics();
}
/** The line sounding now is lit, those before it dimmed, and the display follows the song (until the person scrolls it, for a few seconds). */
function tickLyrics() {
  if (!page) return;
  const m = shownSong();
  const now = m && page.audio.getAttribute("src") === m.url ? page.audio.currentTime : -1;
  const found = m?.timing && lyr.timeline.length ? entryAt(lyr.timeline, now) : -1;
  const i = found >= 0 && now < lyr.timeline[found].to ? found : -1;
  if (i === lyr.at) return;
  lyr.at = i;
  lyr.items.forEach((el, k) => (el.classList.toggle("is-now", k === i), el.classList.toggle("is-past", i >= 0 && k < i)));
  const el = lyr.items[i];
  const body = page.lyrBody;
  if (el && performance.now() - lyr.held > 3000) body.scrollTo({ top: el.offsetTop - body.clientHeight / 2 + el.offsetHeight / 2, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches || !m || page.audio.paused ? "auto" : "smooth" });
}
/** A press on a line goes to it in the song (and plays it). */
function lyricSeek(time) {
  const m = shownSong();
  if (!m || !page.audio.getAttribute("src")) return;
  page.audio.currentTime = Math.max(0, time);
  lyr.held = -Infinity;
  if (page.audio.paused) toggle(m);
  tickLyrics();
  drawWave();
}

function drawShelf() {
  const list = shelf();
  return [
    h("div.sg-shelf-head", {}, h("span.sg-label", {}, "Your songs"), h("span.sg-meta", {}, list.length ? String(list.length) : "")),
    h("div.sg-sleeves", { dataset: { scrollKey: "sg-sleeves" } },
      ...list.map((m) => {
        const hue = [...(m.name ?? "")].reduce((t, ch) => (t * 31 + ch.charCodeAt(0)) % 360, 17);
        const playing = song.shown === m.file && page.audio && !page.audio.paused;
        const cv = coverFor(m);
        // (a video cover is only fetched while the sleeve is pointed at)
        const clip = cv.video ? h("video.sg-sleeve-clip", { muted: true, loop: true, playsInline: true, preload: "none", "aria-hidden": "true" }) : null;
        const play = () => clip && ((clip.src = cv.video), clip.play().catch(() => {}));
        const stop = () => clip && (clip.pause(), clip.removeAttribute("src"), clip.load());
        return h(`div.sg-sleeve${m.file === song.shown ? ".is-on" : ""}${inJam(m) ? ".is-track" : ""}${cv.picture ? ".has-cover" : ""}`, { style: { "--hue": String(hue) } },
          h("button.sg-sleeve-art", { type: "button", title: `${m.name}\nShow it on the stage`, "aria-label": m.name, on: { click: () => show(m.file), pointerenter: play, pointerleave: stop, focus: play, blur: stop } },
            h("span.sg-disc", {}), cv.picture ? h("img.sg-sleeve-cover", { src: cv.picture, alt: "", draggable: false, loading: "lazy" }) : h("span.sg-sleeve-jar", {}, jicon("jar")), clip),
          h("button.sg-sleeve-play", { type: "button", title: playing ? "Pause" : "Play", "aria-label": playing ? `Pause ${m.name}` : `Play ${m.name}`, on: { click: () => toggle(m) } }, jicon(playing ? "pause" : "play")),
          h("b", { title: m.name }, m.name), h("em", {}, lengthLabel(Math.round(m.seconds || 0))));
      }),
      h("button.sg-import", { type: "button", title: "A sound or a video's sound becomes a song of the shelf", on: { click: () => pickFile("audio/*,video/*", bringSong) } }, jicon("upload"), h("b", {}, "Import a song"), h("em", {}, "MP3, WAV or video"))),
  ];
}

// ---------------------------------------------------------------- the redraws

function redrawSteps() {
  if (!page) return;
  const at = page.steps.scrollTop;
  page.steps.replaceChildren(...drawSteps());
  page.steps.scrollTop = at;
}
function redrawMap() {
  if (page) page.map.replaceChildren(...drawMap());
}
function redrawStage() {
  drawStage();
  redrawMap();
}
function redrawShelf() {
  if (page) page.shelf.replaceChildren(...drawShelf());
}
function redrawAll() {
  redrawSteps();
  redrawStage();
  redrawShelf();
}

// ---------------------------------------------------------------- the workspace

/**
 * The song workspace: one element, made once and put in the grid, that draws itself again when its own state or the video's
 * changes. (What plays, the record and the fields are never rebuilt under you.)
 */
export function songWorkspace() {
  if (!page) {
    const area = (field, rows, placeholder, cls = "", extra = {}) => h(`textarea.field.sg-text${cls}`, { rows, placeholder, spellcheck: false, "aria-label": placeholder, ...extra, on: { input: set(field) } });
    const audio = h("audio.sg-audio", { preload: "metadata" });
    page = {
      idea: area("idea", 2, "What is the song about?", "", { maxLength: 500 }),
      count: h("span.sg-count", {}, "0/500"),
      tags: area("tags", 6, "Describe the genre, instruments, vocal style, arrangement and production…", ".is-mono", { id: "sg-style-prompt", "aria-label": "Style prompt" }),
      lyrics: area("lyrics", 12, "Write your lyrics using sections such as [Verse] and [Chorus]…", ".is-mono", { id: "sg-lyrics-input", "aria-label": "Lyrics" }),
      name: h("input.field.sg-name-field", { type: "text", maxlength: 40, placeholder: "A title", "aria-label": "Title", on: { input: set("name") } }),
      audio,
    };
    page.idea.addEventListener("input", () => (page.count.textContent = `${song.idea.length}/500`));
    sync();
    deck ??= createDeck();
    audio.addEventListener("play", () => (deck.play(true), drawStage(), redrawShelf()));
    audio.addEventListener("pause", () => (deck.play(false), drawStage(), redrawShelf()));
    audio.addEventListener("ended", () => (deck.play(false), drawStage(), redrawShelf()));
    audio.addEventListener("timeupdate", () => {
      drawWave();
      tickLyrics();
      page.time.textContent = `${clock(audio.currentTime)} / ${clock(audio.duration || shownSong()?.seconds || 0)}`;
    });
    audio.addEventListener("loadedmetadata", () => (page.time.textContent = `${clock(0)} / ${clock(audio.duration || 0)}`));

    page.steps = h("section.sg-steps", { "aria-label": "Make the song", dataset: { scrollKey: "sg-steps" } });
    page.name_ = h("h2.sg-name", {});
    page.read = h("p.sg-readout", {});
    page.state = h("p.sg-state", {});
    page.play = h("button.sg-play", { type: "button", on: { click: () => toggle(shownSong()) } });
    page.wave = h("canvas.sg-wave", { title: "Click to jump", on: { pointerdown: (e) => {
      const r = page.wave.getBoundingClientRect();
      if (shownSong() && audio.duration) (audio.currentTime = ((e.clientX - r.left) / r.width) * audio.duration), drawWave();
    } } });
    page.time = h("span.sg-time", {}, "00:00 / 00:00");
    page.make = h("button", { type: "button", on: { click: make } });
    page.use = h("button.key.sg-use", { type: "button", on: { click: useIt } });
    page.hint = h("p.sg-hint", {});
    page.cover = h("div.sg-cover", { "aria-label": "The cover", hidden: true });
    page.clipVideo = h("video", { muted: true, loop: true, playsInline: true, "aria-label": "The video cover" });
    page.clipTag = h("span.sg-clip-tag", {}, "Video cover");
    page.clipVideo.addEventListener("loadedmetadata", () => page.clip.style.setProperty("--ar", `${page.clipVideo.videoWidth || 1} / ${page.clipVideo.videoHeight || 1}`));
    page.clip = h("button.sg-clip", { type: "button", hidden: true, title: "The video cover: a press plays it with its sound", "aria-pressed": "false", on: { click: toggleClipSound } }, page.clipVideo, page.clipTag);
    page.stage = h("section.sg-stage", { "aria-label": "The song" },
      h("div.sg-spot", { "aria-hidden": "true" }),
      h("div.sg-record", {}, h("div.sg-deck", { title: "Play or pause", on: { click: () => toggle(shownSong()) } }, deck.el), page.clip),
      h("div.sg-label-block", {}, page.name_, page.read, page.state),
      page.cover,
      h("div.sg-transport", {}, page.play, page.wave, page.time),
      h("div.sg-actions", {}, page.make, page.use),
      page.hint,
      audio);
    page.lyrMeta = h("span.sg-meta", {});
    page.lyrBody = h("div.sg-ly-body", { tabindex: "0", "aria-label": "Lyrics", on: { wheel: () => (lyr.held = performance.now()), touchmove: () => (lyr.held = performance.now()), pointerdown: () => (lyr.held = performance.now()) } });
    page.lyrSync = h("button.key.is-quiet", { type: "button", title: "Transcribe the full mix and match your lyrics. Uses Comfy Cloud GPU time.", on: { click: () => syncSongLyrics(shownSong()) } }, "Sync lyrics");
    page.ld = h("section.sg-ld", { "aria-label": "Lyrics display" }, h("div.sg-ly-head", {}, h("span.sg-label", {}, "Lyrics display"), page.lyrMeta, page.lyrSync), page.lyrBody);
    page.map = h("aside.sg-map", { "aria-label": "The song's sections" });
    page.shelf = h("section.sg-shelf", { "aria-label": "Your songs" });
    page.root = h("div.sg-work", {}, page.steps, page.stage, page.ld, page.map, page.shelf);
    new ResizeObserver(() => drawWave()).observe(page.wave);
  }
  // (what the video holds changed, or this page has just been shown again: what depends on it is set again)
  if (!song.loaded) {
    song.loaded = true;
    api.songs().then((list) => {
      for (const a of list) if (a.cover || a.coverVideo) covers.set(a.file, { cover: a.cover, coverVideo: a.coverVideo, coverSeconds: a.coverSeconds });
      // A song can be synced after it was added to a video. Restore the saved timings to that track too.
      const track = jam.jam?.body.track;
      const saved = track && list.find((a) => a.file === track.file && a.lyrics && a.timing?.lines?.length && (!track.lyrics || track.lyrics === a.lyrics));
      if (saved && (saved.lyrics !== track.lyrics || JSON.stringify(saved.timing) !== JSON.stringify(track.timing))) {
        Object.assign(track, { lyrics: saved.lyrics, timing: saved.timing });
        save(jam.jam);
        applySyncedCaptions(jam.jam).catch((e) => console.warn("Sync captions:", e.message));
        changed("jam");
      }
      // (only songs: a sound under the shortest length a song is made at, 30 s, is a clip, and a song kept twice is shown once)
      const have = new Set(song.made.map((m) => m.file));
      const named = new Set(song.made.map((m) => m.name).filter(Boolean).map((n) => n.toLowerCase()));
      song.made.push(...list.filter((a) => a.kind === "music" && a.seconds >= 30 && !have.has(a.file) && !named.has(a.name.toLowerCase()) && named.add(a.name.toLowerCase())).slice(0, 24));
      // (the covers have come: the record wears the shown song's, as its sleeve does)
      redrawStage();
      redrawShelf();
    }, () => {});
  }
  // another video was opened: the stage shows its song
  if (seen !== (jam.jam?.id ?? null)) {
    seen = jam.jam?.id ?? null;
    drafting = false;
    song.shown = null;
  }
  // the song shown is the video's own (until the form is worked on: then the stage shows that draft)
  if (!drafting && (!song.shown || !shelf().some((m) => m.file === song.shown))) {
    const first = jam.jam?.body.track ? shelf().find((m) => m.file === jam.jam.body.track.file) : null;
    if (first) song.shown = first.file;
    if (song.shown) {
      const m = shownSong();
      if (m && page.audio.getAttribute("src") !== m.url) page.audio.src = m.url;
      if (m) peaksOf(m);
    }
  }
  redrawAll();
  return page.root;
}

/** Leaving the page, or the workspace: what plays stops (the record and the sound are kept, not rebuilt). */
export function pauseSong() {
  page?.audio.pause();
}

// ---------------------------------------------------------------- Pickle reads the form and fills it

songHook.summary = () => {
  const m = shownSong();
  const sections = [...song.lyrics.matchAll(/^[ \t]*\[([^\]\n]+)\][ \t]*$/gm)].map((x) => x[1].replace(/\s+-\s+.*$/, "").trim());
  return {
    idea: song.idea.slice(0, 280),
    shape: song.structure,
    style: song.tags.slice(0, 200),
    length: song.seconds,
    bpm: song.bpm,
    key: song.key,
    time: song.signature,
    language: song.language,
    title: song.name,
    quality: song.passes === 1 ? "draft" : "full",
    lyrics: sections.length ? `${sections.length} sections (${sections.slice(0, 12).join(", ")}), ${song.lyrics.split("\n").filter((l) => l.trim() && !/^\s*\[/.test(l)).length} lines of words` : "none",
    shown: m ? { name: m.name, seconds: Math.round(m.seconds || 0), cover: !!coverFor(m).picture, videoCover: !!coverFor(m).video } : null,
    shelf: shelf().slice(0, 6).map((x) => x.name),
    busy: song.writing ? "writing" : song.making ? "making" : null,
  };
};

/** Pickle's set_song: the fields he gives are put in the form (each checked), nothing is made. True when anything was. */
songHook.fill = (a) => {
  let did = false;
  const text = (k, max, to = k) => typeof a[k] === "string" && (song[to] = a[k].slice(0, max), (did = true));
  text("idea", 500);
  text("tags", 400);
  text("lyrics", 6000);
  text("name", 40);
  if (STRUCTURES.some((s) => s.id === a.structure)) (song.structure = a.structure, (did = true));
  if (Number.isFinite(Number(a.seconds)) && a.seconds !== "") (song.seconds = Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, Math.round(Number(a.seconds) / 5) * 5)), (did = true));
  if (Number.isFinite(Number(a.bpm)) && a.bpm !== "") (song.bpm = Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(Number(a.bpm)))), (did = true));
  if (KEYS.includes(a.key)) (song.key = a.key, (did = true));
  if (LANGUAGES.some((l) => l.value === a.language)) (song.language = a.language, (did = true));
  if (did) {
    keepDraft();
    sync();
    showDraft();
    redrawAll();
  }
  return did;
};
