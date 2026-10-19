// Jam's screen: the track, its lyrics and the captions' style on the left; the video and its edit
// (the beat, what is sung, the shots, the captions, the sound) in the middle; the artist, their
// dance and the look on the right, with the videos kept.
import { h, icon, sprite, pad2, ago } from "../dom.js";
import { state, changed, toast } from "../store.js";
import { openPicker, pictureOf } from "../picker.js";
import { currentPage, go } from "../router.js";
import {
  jam, loadJams, openJam, newJam, removeJam, rename, useTrack, makeTrack, setLength, setStart, LENGTHS, setLine, useLyrics,
  setArtist, setDance, clearDance, setStyle, setCaptions, setEvery, bars, cycleKind, take, shotState, making, makeVideo, rerollShot, estimate, KINDS,
  setLoras,
} from "../jam.js";
import { loraStack } from "../loras.js";

const KIND_ICON = { performance: "audio-voice", dance: "channel-pose", broll: "film-make" };
const STYLES = [["pop", "Bold pop"], ["karaoke", "Karaoke"], ["lower", "Lower third"], ["none", "No captions"]];
const clock = (s) => `${pad2(Math.floor((s ?? 0) / 60))}:${pad2(Math.floor((s ?? 0) % 60))}`;
const fine = (s) => `${clock(s)}.${pad2(Math.floor(((s ?? 0) % 1) * 100))}`;
const pick = (accept, fn) => {
  const input = h("input", { type: "file", accept, hidden: true, on: { change: () => (input.files[0] && fn(input.files[0]), input.remove()) } });
  document.body.append(input);
  input.click();
};
let making_ = null; // the "make a track" form, open or not, and what is typed in it
let editingLyrics = false;
let armed = null;

// ---------------------------------------------------------------- the sound: one player for the part used

const kept = new Map();
const keep = (key, make) => kept.get(key) ?? (kept.set(key, make()), kept.get(key));
function player(b) {
  const src = b.film?.url ?? b.part?.url ?? b.track?.url;
  if (!src) return null;
  const film = !!b.film;
  return keep(`player:${src}`, () => {
    const el = h(film ? "video" : "audio", { src, preload: "auto", playsInline: true, draggable: false });
    el.addEventListener("timeupdate", () => sync(el));
    el.addEventListener("play", () => sync(el));
    el.addEventListener("pause", () => sync(el));
    return el;
  });
}
/** Everything that follows the time: the playhead, the line sung, the shot on screen, the caption. */
function sync(el) {
  const root = document.querySelector(".jam");
  if (!root || !jam.jam) return;
  const b = jam.jam.body;
  const t = el.currentTime || 0;
  const total = b.part?.seconds || el.duration || 1;
  root.querySelectorAll(".jm-playhead").forEach((p) => (p.style.left = `${(t / total) * 100}%`));
  root.querySelectorAll(".jm-time b").forEach((x) => (x.textContent = fine(t)));
  root.querySelectorAll(".jm-toggle").forEach((x) => x.replaceChildren(icon(el.paused ? "play" : "pause")));
  const line = b.lines.findIndex((l) => t >= l.from && t < l.to);
  root.querySelectorAll(".jm-line").forEach((x, i) => x.classList.toggle("is-now", i === line));
  if (!b.film) {
    // before the video is made: the shot's frame on screen and the caption over it, as they will be
    const shot = b.shots.find((s) => t >= s.from && t < s.to) ?? b.shots[0];
    const pic = root.querySelector(".jm-preview img");
    const url = shot ? b.looks[shot.kind]?.url ?? b.artist?.url : b.artist?.url;
    if (pic && url && pic.getAttribute("src") !== url) pic.src = url;
    const cap = root.querySelector(".jm-caption");
    if (cap) cap.textContent = line >= 0 && b.captions !== "none" ? b.lines[line].text : "";
  }
}

function waveform(url, b) {
  return keep(`wave:${url}:${b.span?.from}:${b.span?.to}`, () => {
    const canvas = h("canvas.jm-wave-canvas", { width: 900, height: 120 });
    const draw = (peaks) => {
      const g = canvas.getContext("2d");
      g.clearRect(0, 0, canvas.width, canvas.height);
      const n = peaks.length;
      const w = canvas.width / n;
      const total = b.track?.seconds || 1;
      peaks.forEach((p, i) => {
        const t = (i / n) * total;
        const inside = t >= (b.span?.from ?? 0) && t <= (b.span?.to ?? total);
        g.fillStyle = inside ? "#F2FF59" : "rgba(240, 239, 237, .28)";
        const hh = Math.max(3, p * canvas.height * 0.92);
        g.fillRect(i * w + 0.5, (canvas.height - hh) / 2, Math.max(1, w - 1.5), hh);
      });
    };
    draw(Array(150).fill(0.06));
    fetch(url).then((r) => r.arrayBuffer()).then((buf) => new AudioContext().decodeAudioData(buf)).then((a) => {
      const d = a.getChannelData(0);
      const step = Math.floor(d.length / 150);
      draw(Array.from({ length: 150 }, (_, i) => {
        let m = 0;
        for (let k = i * step; k < (i + 1) * step; k += 64) m = Math.max(m, Math.abs(d[k]));
        return m;
      }));
    }).catch(() => {});
    canvas.addEventListener("pointerdown", (e) => {
      // a click on the track starts the video there
      const r = canvas.getBoundingClientRect();
      setStart(((e.clientX - r.left) / r.width) * (b.track?.seconds ?? 0));
    });
    canvas.title = "Click where the video starts";
    return canvas;
  });
}

// ---------------------------------------------------------------- the track, the lyrics, the captions

function trackPanel(j) {
  const b = j?.body ?? {};
  const busy = jam.busy.has("track") || jam.busy.has("make");
  const parts = [h("div.jm-head", {}, h("span.card-label", {}, "The track"))];
  if (b.track) {
    parts.push(h("div.jm-track", {},
      h("div.jm-track-top", {},
        h("span.jm-track-icon", {}, sprite("audio-music")),
        h("div.jm-track-text", {}, h("b", {}, b.track.name), h("span", {}, `${clock(b.track.seconds)}${b.bpm ? ` · ${Math.round(b.bpm)} BPM` : ""}`))),
      h("div.jm-wave", {}, waveform(b.track.url, b)),
      h("div.jm-wave-times", {}, h("span", {}, clock(b.span?.from)), h("em", {}, "Click the track where the video starts"), h("span", {}, clock(b.span?.to)))));
    parts.push(h("div.jm-lengths", { title: "How long the video runs" }, ...LENGTHS.map((l) => {
      const len = (b.span?.to ?? 0) - (b.span?.from ?? 0);
      const on = l ? Math.abs(len - Math.min(l, b.track.seconds)) < 0.6 : Math.abs(len - b.track.seconds) < 0.6;
      return h("button", { type: "button", "aria-pressed": String(on), disabled: l > b.track.seconds + 1, on: { click: () => setLength(l) } }, l ? `${l} s` : "Full");
    })));
  }
  parts.push(h("div.jm-keys", {},
    h("button.key", { type: "button", disabled: busy, title: "A song of your own: an MP3, a WAV, or a video with sound", on: { click: () => pick("audio/*,video/*", useTrack) } }, icon(b.track ? "loop" : "upload"), b.track ? "Replace" : "Add a track"),
    h("button.key", { type: "button", disabled: busy, "aria-pressed": String(!!making_), title: "A track made from a few words and lyrics (ACE-Step 1.5)", on: { click: () => ((making_ = making_ ? null : { prompt: "", lyrics: "", seconds: 30, bpm: 100 }), changed("jam")) } }, icon("sparkle"), "Make a track")));
  if (making_) {
    parts.push(h("div.jm-make", {},
      h("input.field", { value: making_.prompt, placeholder: "The music: upbeat indie pop, bright vocals, handclaps", dataset: { focus: "make:prompt" }, on: { input: (e) => (making_.prompt = e.target.value) } }),
      h("textarea.field", { rows: 4, value: making_.lyrics, placeholder: "[verse]\nThe words, a line each\n[chorus]\n…", dataset: { focus: "make:lyrics" }, on: { input: (e) => (making_.lyrics = e.target.value) } }),
      h("div.jm-make-row", {},
        h("label", {}, h("span.label", {}, "Seconds"), h("input.field", { type: "number", min: 10, max: 240, value: making_.seconds, on: { change: (e) => (making_.seconds = Number(e.target.value) || 30) } })),
        h("label", {}, h("span.label", {}, "BPM"), h("input.field", { type: "number", min: 60, max: 180, value: making_.bpm, on: { change: (e) => (making_.bpm = Number(e.target.value) || 100) } })),
        h("button.key.is-primary", { type: "button", disabled: jam.busy.has("make"), on: { click: () => { const m = making_; making_ = null; makeTrack({ ...m, name: m.prompt.split(",")[0].slice(0, 40) }); } } }, jam.busy.has("make") ? "Making" : "Make it"))));
  }
  if (jam.busy.has("make")) parts.push(h("p.jm-busy", {}, h("span.lamp", { dataset: { tone: "busy" } }), "Making the track"));
  if (jam.busy.has("listen")) parts.push(h("p.jm-busy", {}, h("span.lamp", { dataset: { tone: "busy" } }), "Listening: the vocals, the words, the beat"));

  if (b.track) {
    parts.push(h("div.jm-head.is-gap", {}, h("span.card-label", {}, "Lyrics"),
      h("div.card-tools", {}, h("button.key.is-icon.is-quiet", { type: "button", "aria-pressed": String(editingLyrics), title: "Your own words for the track\nThey go on the times the singing was heard at", on: { click: () => ((editingLyrics = !editingLyrics), changed("jam")) } }, icon("pencil")))));
    if (editingLyrics) {
      parts.push(h("textarea.field.jm-lyrics-edit", { rows: 6, value: b.track.lyrics ?? b.lines.map((l) => l.text).join("\n"), dataset: { focus: "lyrics" } }),
        h("button.key", { type: "button", on: { click: (e) => { useLyrics(e.target.closest(".jm-panel").querySelector(".jm-lyrics-edit").value); editingLyrics = false; } } }, icon("check"), "Put them on the singing"));
    }
    parts.push(h("div.jm-lines", { dataset: { scrollKey: "jm-lines" } }, ...b.lines.map((l, i) =>
      h("div.jm-line", {},
        h("button.jm-line-at", { type: "button", title: "Play from here", on: { click: () => { const p = player(b); if (p) (p.currentTime = l.from), p.play(); } } }, clock(l.from)),
        h("input", { value: l.text, "aria-label": `Line ${i + 1}`, dataset: { focus: `line:${i}` }, on: { input: (e) => setLine(i, e.target.value) } })))),
      b.part && !b.lines.length && !jam.busy.has("listen") ? h("p.hint", {}, "No singing was heard in this part.") : null);
    parts.push(h("div.jm-head.is-gap", {}, h("span.card-label", {}, "Captions")),
      h("div.jm-styles", {}, ...STYLES.map(([id, label]) =>
        h(`button.jm-style.is-${id}${b.captions === id ? ".is-on" : ""}`, { type: "button", on: { click: () => setCaptions(id) } },
          h("span.jm-style-sample", {}, id === "none" ? "—" : id === "pop" ? h("mark", {}, "SUN IN THE JAR") : "Sun in the jar"),
          h("span.jm-style-name", {}, h("i"), label)))));
  }
  return h("section.jm-panel.jm-left", {}, ...parts);
}

// ---------------------------------------------------------------- the video and its edit

function videoPanel(j) {
  const b = j?.body;
  const el = b ? player(b) : null;
  const total = b?.part?.seconds ?? 0;
  let screen;
  if (b?.film) screen = h("div.jm-screen", {}, el);
  else screen = h("div.jm-screen.jm-preview", {},
    b?.artist || b?.looks?.performance ? h("img", { src: b.looks.performance?.url ?? b.artist.url, alt: "", draggable: false }) : h("div.jm-screen-empty", {}, h("img.star", { src: "brand/cast/pickle.png", alt: "", draggable: false }), h("span", {}, "Your music video plays here")),
    h(`span.jm-caption.is-${b?.captions ?? "karaoke"}`, {}),
    el && !b.film ? h("span.hidden-player", {}, el) : null);
  const name = (j?.name ?? "jam").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return h("section.jm-panel.jm-centre", {},
    h("div.jm-head", {}, h("span.card-label", {}, "The video"),
      j ? h("input.jm-name", { value: j.name, "aria-label": "The video's name", dataset: { focus: `name:${j.id}` }, on: { input: (e) => rename(e.target.value) } }) : null,
      h("span.jm-format", {}, "9:16")),
    screen,
    h("div.jm-transport", {},
      h("button.key.is-icon.jm-toggle", { type: "button", disabled: !el, title: "Play or pause", on: { click: () => (el.paused ? el.play() : el.pause()) } }, icon("play")),
      h("span.jm-time", {}, h("b", {}, fine(0)), h("em", {}, ` / ${fine(total)}`)),
      h("span.spacer"),
      b?.film ? h("a.key.is-icon", { href: `${b.film.url}?download=${name}.mp4`, download: `${name}.mp4`, title: "Download the video" }, icon("download")) : null,
      b?.cut ? h("button.key.is-icon", { type: "button", title: "Open in Kitchen's Cut\nFine-tune the edit", on: { click: () => openInCut(b.cut) } }, icon("scissors")) : null),
    b?.part ? timeline(b) : h("div.jm-timeline-empty", {}, "Add a track: the video is cut on its beat, the singing performed, the rest danced."));
}
async function openInCut(id) {
  const { setProject } = await import("../store.js");
  const { openCut, loadCuts } = await import("../cut.js");
  setProject(null);
  await loadCuts();
  await openCut(id);
  go("cut");
}

function timeline(b) {
  const total = b.part.seconds || 1;
  const at = (t) => `${(t / total) * 100}%`;
  const width = (a, z) => `${((z - a) / total) * 100}%`;
  const barTimes = bars(b);
  const ticks = [];
  for (let t = 0; t <= total; t += total > 40 ? 10 : 5) ticks.push(t);
  return h("div.jm-timeline", {},
    h("div.jm-row.is-ruler", {}, h("span.jm-row-name", {}),
      h("div.jm-lane", {}, ...barTimes.map((t, i) => h(`i.jm-bar${i % 4 === 0 ? ".is-strong" : ""}`, { style: { left: at(t) } })), ...ticks.map((t) => h("span.jm-tick", { style: { left: at(t) } }, clock(t))), h("b.jm-playhead"))),
    h("div.jm-row", {}, h("span.jm-row-name", {}, sprite("audio-voice"), "Sung"),
      h("div.jm-lane", {}, ...(b.sung?.length ? b.sung : b.lines).map((l) => h("span.jm-sung", { style: { left: at(l.from), width: width(l.from, l.to) } })), h("b.jm-playhead"))),
    h("div.jm-row.is-shots", {}, h("span.jm-row-name", {}, sprite("section-shot"), "Shots"),
      h("div.jm-lane", {}, ...b.shots.map((s, i) => {
        const st = shotState(s, i);
        const pic = b.looks[s.kind]?.url;
        return h(`button.jm-shot.is-${s.kind}.is-${st.step}`, { type: "button", style: { left: at(s.from), width: width(s.from, s.to) }, title: `${pad2(i + 1)} · ${KINDS[s.kind]} · ${(s.to - s.from).toFixed(1)} s\nClick for another kind${st.step === "failed" ? "\nIt failed: right-click to roll it again" : ""}`, on: { click: () => cycleKind(i), contextmenu: (e) => (e.preventDefault(), rerollShot(i)) } },
          pic ? h("img", { src: pic, alt: "", draggable: false, loading: "lazy" }) : null,
          h("span.jm-shot-tag", {}, pad2(i + 1), sprite(KIND_ICON[s.kind])),
          st.step === "rolling" ? h("i.jm-shot-progress", { style: { width: `${Math.round((st.progress ?? 0) * 100)}%` } }) : null);
      }), h("b.jm-playhead"))),
    h("div.jm-row", {}, h("span.jm-row-name", {}, icon("pencil"), "Captions"),
      h("div.jm-lane", {}, ...(b.captions === "none" ? [] : b.lines.map((l) => h("span.jm-cap", { style: { left: at(l.from), width: width(l.from, l.to) }, title: l.text }, l.text))), h("b.jm-playhead"))),
    h("div.jm-row.is-audio", {}, h("span.jm-row-name", {}, icon("sound"), "Audio"),
      h("div.jm-lane", {}, b.part ? partWave(b) : null, h("b.jm-playhead"))));
}
function partWave(b) {
  return keep(`partwave:${b.part.url}`, () => {
    const canvas = h("canvas.jm-part-wave", { width: 1400, height: 80 });
    fetch(b.part.url).then((r) => r.arrayBuffer()).then((buf) => new AudioContext().decodeAudioData(buf)).then((a) => {
      const d = a.getChannelData(0);
      const n = 280;
      const step = Math.floor(d.length / n);
      const g = canvas.getContext("2d");
      for (let i = 0; i < n; i++) {
        let m = 0;
        for (let k = i * step; k < (i + 1) * step; k += 64) m = Math.max(m, Math.abs(d[k]));
        const hh = Math.max(2, m * canvas.height * 0.95);
        g.fillStyle = "rgba(242, 255, 89, .75)";
        g.fillRect((i * canvas.width) / n, (canvas.height - hh) / 2, canvas.width / n - 1.5, hh);
      }
    }).catch(() => {});
    canvas.addEventListener("pointerdown", (e) => {
      const p = player(b);
      const r = canvas.getBoundingClientRect();
      if (p) p.currentTime = ((e.clientX - r.left) / r.width) * (b.part.seconds || 0);
    });
    return canvas;
  });
}

// ---------------------------------------------------------------- the artist

function artistPanel(j) {
  const b = j?.body;
  const busy = making() || jam.busy.has("render");
  const cost = estimate();
  const counts = Object.keys(KINDS).map((k) => [k, b?.shots.filter((s) => s.kind === k).length ?? 0]).filter(([, n]) => n);
  const done = b?.shots.length && b.shots.every((s) => take(s)?.status === "done");
  return h("section.jm-panel.jm-right", {},
    h("div.jm-head", {}, h("span.card-label", {}, "The artist")),
    h("span.label", {}, "Avatar"),
    h("button.jm-avatar", { type: "button", title: b?.artist ? "Another artist" : "The artist: one of our characters, a picture from the Library, or a photo of you", on: { click: (e) => openPicker(e.currentTarget, { title: "The artist", onPick: async (choice) => { try { await setArtist(await pictureOf(choice)); } catch (err) { toast(err.message, { tone: "crit" }); } } }) } },
      b?.artist ? h("img", { src: b.artist.url, alt: "", draggable: false }) : h("span", {}, icon("upload"), "Add the artist")),
    h("span.label", {}, "Dance reference"),
    b?.dance
      ? h("div.jm-dance", {}, keep(`dance:${b.dance.url}`, () => h("video", { src: b.dance.url, muted: true, loop: true, autoplay: true, playsInline: true, draggable: false })),
        h("span.jm-dance-tag", {}, `${clock(b.dance.duration)} · copied`),
        h("button.jm-dance-x", { type: "button", title: "No dance: the parts without singing become b-roll", on: { click: () => clearDance() } }, icon("close")))
      : h("button.jm-dance.is-empty", { type: "button", disabled: jam.busy.has("dance"), title: "A dance video: its moves are copied in the parts without singing", on: { click: () => pick("video/*", setDance) } }, icon("upload"), h("span", {}, jam.busy.has("dance") ? "Adding" : "Add a dance")),
    h("span.label", {}, "Style"),
    h("textarea.field.jm-style-field", { rows: 2, value: b?.style ?? "", placeholder: "purple stage, a giant jam-jar lid, concert lights", dataset: { focus: "style" }, on: { change: (e) => setStyle(e.target.value) } }),
    h("span.label", {}, "Cuts"),
    h("div.jm-cuts", {}, ...[[1, "Every bar"], [2, "Every 2 bars"], [4, "Every 4 bars"]].map(([n, label]) =>
      h("button", { type: "button", "aria-pressed": String((b?.every ?? 2) === n), disabled: !b?.part, on: { click: () => setEvery(n) } }, label))),
    h("span.label", {}, "LoRAs"),
    loraStack(b?.loras ?? [], (list) => b && setLoras(list)),
    h("span.jm-readout", { title: "LTX-2.5 rolls every shot: lip-sync, motion copy and scenes" }, sprite("section-shot"), h("b", {}, "Video: LTX-2.5"), h("em", {}, state.info?.target === "comfy-cloud" ? "≈ 4.8 cr/s" : "your GPU")),
    h("button.jm-go", { type: "button", disabled: busy || !b?.shots.length || !b?.artist, title: !b?.part ? "Add a track first" : !b?.artist ? "Add the artist's photo first" : "Every shot rolled, then cut on the track with its captions", on: { click: () => makeVideo() } },
      icon("play"), h("span", {}, busy ? (jam.busy.has("render") ? "Cutting" : "Making") : done ? "Make it again" : "Make the video"), cost && !busy ? h("em", {}, `≈ ${cost} cr`) : null),
    b?.shots.length ? h("div.jm-summary", {}, h("span.label", {}, `Shots: ${b.shots.length}`), ...counts.map(([k, n]) => h("span", {}, sprite(KIND_ICON[k]), `${n} ${KINDS[k].toLowerCase()}`))) : null,
    h("div.jm-head.is-gap", {}, h("span.card-label", {}, "My videos"),
      h("div.card-tools", {}, h("button.key.is-icon.is-quiet", { type: "button", title: "A new music video", on: { click: () => newJam() } }, icon("plus")))),
    h("div.jm-list", {}, ...jam.list.map((row) =>
      h(`div.jm-row-item${row.id === j?.id ? ".is-on" : ""}`, {},
        h("button.jm-item", { type: "button", on: { click: () => openJam(row.id) } },
          h("span.jm-item-pic", {}, row.thumb ? h("img", { src: row.thumb, alt: "", draggable: false, loading: "lazy" }) : sprite("product-jam")),
          h("span.jm-item-text", {}, h("b", {}, row.name), h("em", {}, ago(row.updatedAt)))),
        h(`button.key.is-icon.is-quiet${armed === row.id ? ".is-armed" : ""}`, { type: "button", title: armed === row.id ? "Click again to delete it" : "Delete this video", on: { click: () => (armed === row.id ? ((armed = null), removeJam(row.id)) : ((armed = row.id), changed("jam"), setTimeout(() => armed === row.id && ((armed = null), changed("jam")), 3000))) } }, icon("trash"))))));
}

// ---------------------------------------------------------------- the screen

export function renderJam(el) {
  loadJams();
  const j = jam.jam;
  const active = document.activeElement;
  const focus = el.contains(active) ? active.dataset.focus : null;
  const sel = focus ? [active.selectionStart, active.selectionEnd] : null;
  el.replaceChildren(h("div.jam", {}, trackPanel(j), videoPanel(j), artistPanel(j)));
  if (focus) {
    const back = el.querySelector(`[data-focus="${CSS.escape(focus)}"]`);
    back?.focus({ preventScroll: true });
    if (back && sel && back.setSelectionRange) try { back.setSelectionRange(...sel); } catch {}
  }
  const p = j ? player(j.body) : null;
  if (p) queueMicrotask(() => sync(p));
}

// a sound or a video dropped on Jam: on the artist's side a photo is the artist and a video the dance; elsewhere it's the track
document.addEventListener("dragover", (e) => currentPage() === "jam" && e.dataTransfer?.types?.includes("Files") && e.preventDefault());
document.addEventListener("drop", (e) => {
  if (currentPage() !== "jam" || !e.dataTransfer?.files?.length) return;
  e.preventDefault();
  const f = e.dataTransfer.files[0];
  const right = e.target.closest?.(".jm-right");
  if (f.type.startsWith("image/")) setArtist(f);
  else if (f.type.startsWith("video/") && right) setDance(f);
  else if (f.type.startsWith("audio/") || f.type.startsWith("video/")) useTrack(f);
  else toast("Drop a song, a photo of the artist or a dance video.");
});
