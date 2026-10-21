// The workbench of each Audio tool: its words and settings, the sound it works on, and the sounds it made as rows that play (each with
// the keys to put it on the mixing strip, hand it on to another tool or keep it). Each builder answers the list of controls of one tool
// from its settings (p), what it was given (i) and an env: set(patch, quiet) keeps settings (quiet: while something is dragged or
// typed, so the screen is not drawn again under it). The two keys under the controls are not here: the workspace puts them there.
import { h, icon, sprite } from "./dom.js";
import { toast, changed } from "./store.js";
import { api } from "./api.js";
import { pickInput, recent, takersOf, handOn, forget, setInput } from "./utensils.js";
import { halveBeats, doubleBeats, detectBeats } from "./beats.js";
import { line, chipRow, slider, clock } from "./utensils-fx-controls.js";
import { seg, stepper } from "./utensils-bench.js";
import { waveRow, peaks, drawPeaks } from "./utensils-audio-wave.js";
import { addTrack } from "./utensils-audio-mix.js";
import { PRESETS, audioById, templateOf } from "./utensils-audio-tools.js";
import { runnerReady } from "./utensils-cloud.js";

const note = (text) => h("p.ut-hint.uv-note", {}, text);
const NOUN = { sfx: "sound", music: "track", "au-voice": "voice", "au-clone": "voice", "au-stems": "stem", "au-clean": "clean take", "au-master": "master" };
const label = (r, k) => (r.kind === "video" ? "Clip" : /vocal/i.test(`${r.name ?? ""} ${r.url}`) ? "Vocals" : /instrument|music|other|accomp/i.test(`${r.name ?? ""} ${r.url}`) ? "Instrumental" : String(k + 1).padStart(2, "0"));

/** The sound a tool works on, as a small well: its name, its length, a key to take it out. */
export function soundWell(i, text = "Add a sound") {
  const a = i.audio;
  return h("div.ut-well", {},
    h("button.ut-well-pic", { type: "button", title: a ? "Replace it" : text, on: { click: (e) => pickInput("audio", e.currentTarget) } }, icon("sound")),
    h("span.ut-well-text", {}, h("b", {}, a ? a.name ?? "A sound" : text), h("em", {}, a ? `${clock(a.seconds ?? 0)} · click to replace` : "or drop or paste it; a clip gives its sound")),
    a ? h("button.ut-iconkey.is-quiet", { type: "button", title: "Take it out", "aria-label": "Take it out", on: { click: () => setInput({ audio: null }) } }, icon("close")) : null);
}
/** A sound a tool keeps for itself (a voice to copy): a well like the other, filled from the computer. */
function voiceWell(p, key, text, env, optional) {
  const v = p[key];
  const choose = () => {
    const input = h("input", { type: "file", accept: "audio/*,video/*", hidden: true, on: { change: async () => {
      const f = input.files[0];
      input.remove();
      if (!f) return;
      try {
        const a = await api.uploadAudio(f);
        env.set({ [key]: { file: a.file, url: a.url, seconds: a.seconds, name: f.name.replace(/\.\w+$/, "") } });
      } catch (e) {
        toast(e.message, { tone: "crit" });
      }
    } } });
    document.body.append(input);
    input.click();
  };
  return h("div.ut-well", {},
    h("button.ut-well-pic", { type: "button", title: v ? "Replace it" : text, on: { click: choose } }, icon("sound")),
    h("span.ut-well-text", {}, h("b", {}, v ? v.name ?? "A voice" : text), h("em", {}, v ? `${clock(v.seconds ?? 0)} · click to replace` : optional ? "optional · a few seconds of the voice" : "a few seconds of the voice")),
    v ? h("button.ut-iconkey.is-quiet", { type: "button", title: "Take it out", "aria-label": "Take it out", on: { click: () => env.set({ [key]: null }) } }, icon("close")) : null);
}

/** Where a cloud tool runs, in a line: the template, who runs it. */
export function whereLine(id) {
  const t = templateOf(id);
  if (!t) return null;
  return h("div.uv-where", {}, h("span.ut-pill", { title: `The official ComfyUI template ${t.name}` }, "Open model"), h("span.uv-where-text", {}, t.about), runnerReady() ? null : h("em.uv-warn", {}, "The template runner is not on this page yet."));
}

// ---------------------------------------------------------------- what a tool made

/** The sounds of a tool, as rows that play: the newest few, each with its keys. */
export function results(id, count = 4) {
  const list = recent(count, id);
  if (!list.length) return h("p.ut-hint.ua-empty", {}, "What it makes shows here, newest first.");
  return h("div.ua-results", { dataset: { scrollKey: `ua-results:${id}` } }, ...list.map((r, k) => {
    if (r.kind === "video") return h("div.ua-clip", {}, h("video", { src: r.url, controls: true, loop: true, playsInline: true, preload: "metadata" }), h("div.ua-keys", {}, ...keysOf(r, id)));
    return waveRow({ url: r.url, label: label(r, k), seconds: r.seconds, tone: audioById(id).tone, note: r.note && !/^\d+ s$/.test(r.note) ? r.note : null, keys: keysOf(r, id) });
  }));
}
/** The keys of a result: put it on the mixing strip, give it to another tool, keep it, take it off the list. */
function keysOf(r, id) {
  const takers = takersOf(r).filter((x) => x.id !== id && x.workspace !== "audio").slice(0, 2);
  return [
    r.file ? h("button.ut-iconkey", { type: "button", title: "Put it on the mixing strip", "aria-label": "Put it on the mixing strip", on: { click: () => addTrack({ file: r.file, url: r.url, name: r.name ?? r.note ?? audioById(id).short, seconds: r.seconds, kind: r.kind }) } }, sprite("tool-fx-mix")) : null,
    ...takers.map((x) => h("button.ut-iconkey", { type: "button", title: `Give it to ${x.name}`, "aria-label": `Give it to ${x.name}`, on: { click: () => handOn(r, x.id) } }, sprite(x.icon))),
    h("a.ut-iconkey", { href: `${r.url}?download=${id}-${r.id}`, download: `${id}-${r.id}`, title: "Download", "aria-label": "Download" }, icon("download")),
    h("button.ut-iconkey.is-quiet", { type: "button", title: "Take it off the list\nThe file stays in the Library", "aria-label": "Take it off the list", on: { click: () => forget(r.id) } }, icon("trash")),
  ].filter(Boolean);
}

// ---------------------------------------------------------------- find the beat (in the page, free)

const heard = new Map();
/** The beats of a sound, read once in the page: { state: busy|done|failed, beats }. */
export function beatsOf(url, redraw) {
  if (!heard.has(url)) {
    heard.set(url, { state: "busy", beats: null });
    detectBeats(url).then((b) => heard.set(url, { state: "done", beats: b }), (e) => heard.set(url, { state: "failed", error: e.message })).finally(redraw);
  }
  return heard.get(url);
}
/** What the beat finder knows of a sound now (for the workspace's change signature). */
export const beatState = (url) => (url && heard.has(url) ? `${heard.get(url).state}:${heard.get(url).beats?.bpm ?? ""}:${heard.get(url).beats?.times?.length ?? ""}` : "");
const setBeats = (url, beats, redraw) => (heard.set(url, { state: "done", beats }), redraw());

function beatView(i, env) {
  const a = i.audio;
  if (!a?.url) return [h("div.ua-drop", {}, icon("sound"), h("b", {}, "Add a sound to read its beat"), h("span", {}, "a song, a loop, a clip's sound")), soundWell(i)];
  const s = beatsOf(a.url, () => changed("utensils"));
  if (s.state === "busy") return [soundWell(i), h("div.ua-listening", {}, h("span.lamp", { dataset: { tone: "busy" } }), "Listening for the beat…")];
  if (s.state === "failed") return [soundWell(i), h("p.uv-why", {}, `That sound could not be read: ${s.error}`)];
  const b = s.beats;
  const canvas = h("canvas.ua-bigwave");
  const dur = Math.max(a.seconds || 0, b.times.at(-1) ?? 0, 1);
  const shown = b.times.filter((t) => t <= dur);
  const bars = b.down != null && shown.length ? shown.map((_, k) => k).filter((k) => (k - b.down + 400) % 4 === 0) : [];
  peaks(a.url, 220).then((list) => requestAnimationFrame(() => drawPeaks(canvas, list, { at: 1, lit: "rgba(240, 239, 237, .5)", beats: shown.map((t) => t / dur), down: bars })));
  const copy = () => navigator.clipboard?.writeText(String(Math.round(b.bpm * 10) / 10)).then(() => toast(`${Math.round(b.bpm * 10) / 10} BPM copied.`), () => toast("Could not copy."));
  return [
    soundWell(i),
    h("div.ua-beat", {},
      h("div.ua-bpm", {}, h("b", {}, String(Math.round(b.bpm * 10) / 10)), h("span", {}, "BPM")),
      h("div.ua-beat-facts", {}, h("span", {}, h("b", {}, String(shown.length)), " beats found"), h("span", {}, h("b", {}, clock(dur)), " listened to"), h("span", {}, b.source === "grid" ? "a steady grid" : "from the sound")),
      h("div.ua-beat-keys", {},
        h("button.ut-iconkey", { type: "button", title: "Half the tempo: it counted every beat twice", "aria-label": "Half the tempo", on: { click: () => setBeats(a.url, halveBeats(b), () => changed("utensils")) } }, h("b.ua-x", {}, "÷2")),
        h("button.ut-iconkey", { type: "button", title: "Twice the tempo: it missed the off-beats", "aria-label": "Twice the tempo", on: { click: () => setBeats(a.url, doubleBeats(b), () => changed("utensils")) } }, h("b.ua-x", {}, "×2")),
        h("button.ut-ghost", { type: "button", on: { click: copy } }, icon("share"), "Copy the BPM"))),
    h("div.ua-bigwavebox", {}, canvas),
    note("The beats are lined on the waveform; the tall ones are the first beat of each bar. It is read in this page: nothing is sent anywhere."),
  ];
}

// ---------------------------------------------------------------- the controls of each tool

export const CONTROLS = {
  sfx: (p, i, env) => [
    h("input.ut-words.ua-words", { value: p.prompt ?? "", placeholder: "heavy rain on a tin roof, distant thunder", "aria-label": "The sound", dataset: { focus: "au-words" }, on: { input: (e) => env.say({ prompt: e.target.value }), keydown: (e) => e.key === "Enter" && (e.preventDefault(), env.go()) } }),
    line("Length", stepper(p.seconds ?? 6, 1, 30, 1, " s", (v) => env.set({ seconds: v }), "How long")),
    line("Variations", seg([[1, "1"], [2, "2"], [4, "4"]], p.variations ?? 4, (v) => env.set({ variations: v }), "How many to make at once: each is its own job")),
  ],
  sound: (p, i, env) => [
    h("div.ut-well", {},
      h("button.ut-well-pic", { type: "button", title: i.video ? "Replace it" : "Add a clip", on: { click: (e) => pickInput("video", e.currentTarget) } }, i.video ? h("video", { src: i.video.url, muted: true, preload: "metadata" }) : icon("film")),
      h("span.ut-well-text", {}, h("b", {}, i.video ? `Clip · ${clock(i.video.duration ?? 0)}` : "Add a clip"), h("em", {}, i.video ? `${i.video.width} × ${i.video.height} · click to replace` : "or drop or paste it"))),
    h("input.ut-words.ua-words", { value: p.prompt ?? "", placeholder: "rain on the glass, a distant dog", "aria-label": "The sound it needs", dataset: { focus: "au-words" }, on: { input: (e) => env.say({ prompt: e.target.value }), keydown: (e) => e.key === "Enter" && (e.preventDefault(), env.go()) } }),
    line("Kind", seg([[false, "Any sound"], [true, "Foley"]], p.real === true, (v) => env.set({ real: v }), "Foley: only real sounds (steps, objects, the room), never music")),
    note("The sound is written for the clip and comes back in the clip, in sync."),
  ],
  music: (p, i, env) => [
    h("input.ut-words.ua-words", { value: p.prompt ?? "", placeholder: "warm acoustic folk, slow, brushed drums", "aria-label": "The track", dataset: { focus: "au-words" }, on: { input: (e) => env.say({ prompt: e.target.value }), keydown: (e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), env.go()) } }),
    h("textarea.ut-words.ua-lyrics", { rows: 2, value: p.lyrics ?? "", placeholder: "Lyrics (optional): leave empty for an instrumental", "aria-label": "Lyrics", dataset: { focus: "au-lyrics" }, on: { input: (e) => env.say({ lyrics: e.target.value }) } }),
    line("Length", stepper(p.seconds ?? 30, 10, 240, 10, " s", (v) => env.set({ seconds: v }), "How long")),
    line("Tempo", stepper(p.bpm ?? 100, 60, 180, 4, " bpm", (v) => env.set({ bpm: v }), "Beats a minute")),
  ],
  "au-voice": (p, i, env) => [
    h("textarea.ut-words.ua-words", { rows: 3, value: p.words ?? "", placeholder: "What it says: a few sentences", "aria-label": "What it says", dataset: { focus: "au-words" }, on: { input: (e) => env.say({ words: e.target.value }) } }),
    voiceWell(p, "voice", "A voice to copy", env, true),
    whereLine("au-voice"),
    note("Without a voice it uses the template's own. A few seconds of a clean recording is enough; use a voice you have the right to copy."),
  ],
  "au-clone": (p, i, env) => [
    line("Recording", soundWell(i, "The recording to change")),
    line("New voice", voiceWell(p, "voice", "The voice to speak in", env, false)),
    whereLine("au-clone"),
    note("The words, the pauses and the rhythm stay yours; only the voice changes. Use voices you have the right to copy."),
  ],
  "au-stems": (p, i, env) => [
    soundWell(i, "The track to split"),
    whereLine("au-stems"),
    note("Two stems come back: the vocals and the instruments. Each is a sound of its own, ready for the mixing strip."),
  ],
  "au-clean": (p, i, env) => [
    soundWell(i, "The recording to clean"),
    line("Noise down", slider({ value: p.amount, min: 1, max: 40, step: 1, show: (v) => `${v} dB`, set: (v, q) => env.set({ amount: v }, q), label: "How much noise to take out" })),
    line("Rumble", chipRow([["0", "Off"], ["60", "60 Hz"], ["80", "80 Hz"], ["120", "120 Hz"]], p.highpass, (v) => env.set({ highpass: v }), "Cut the lowest sounds: a hum, a handling noise")),
    line("Save as", chipRow([["mp3", "MP3"], ["wav", "WAV"], ["m4a", "M4A"]], p.format, (v) => env.set({ format: v }))),
    note("A recording with a video is cleaned in the video. Too much can make a voice sound underwater: listen to both."),
  ],
  "au-master": (p, i, env) => [
    soundWell(i, "The sound to master"),
    line("For", h("div.ua-presets", {}, ...PRESETS.map(([id, name, lufs, about]) => h("button.ua-preset", { type: "button", "aria-pressed": String(p.preset === id), title: about, on: { click: () => env.set({ preset: id, lufs: lufs ?? p.lufs }) } }, h("b", {}, name), h("em", {}, lufs === null ? "your number" : `${lufs} LUFS`))))),
    p.preset === "custom" ? line("Loudness", slider({ value: p.lufs, min: -30, max: -8, step: 0.5, show: (v) => `${v} LUFS`, set: (v, q) => env.set({ lufs: v }, q), label: "Loudness" })) : null,
    line("Peaks under", slider({ value: p.peak, min: -6, max: 0, step: 0.5, show: (v) => `${v} dB`, set: (v, q) => env.set({ peak: v }, q), label: "The ceiling for the peaks" })),
    line("Save as", chipRow([["mp3", "MP3"], ["wav", "WAV"], ["m4a", "M4A"]], p.format, (v) => env.set({ format: v }))),
    note("The sound is measured first, then moved once to the target with a steady gain: no pumping."),
  ],
  "au-beat": (p, i, env) => beatView(i, env),
};

/** The controls of a tool. */
export const controlsOf = (id, p, i, env) => (CONTROLS[id]?.(p, i, env) ?? []).filter(Boolean);

/** What is shown under the controls: the tool's results (the beat finder has none). */
export function resultsOf(id, p, i) {
  if (id === "au-beat") return null;
  const count = id === "sfx" ? 4 : id === "au-stems" ? 2 : 3;
  return h("div.ua-results-wrap", {}, h("div.ut-b-head", {}, h("span.ut-b-label", {}, "Results"), h("span.ut-b-note", {}, `${recent(count, id).length} ${NOUN[id] ?? "sound"}${recent(count, id).length === 1 ? "" : "s"}`)),
    id === "au-clean" && i.audio?.url && recent(1, id).length ? waveRow({ url: i.audio.url, label: "Was", seconds: i.audio.seconds, tone: "rgba(240, 239, 237, .55)" }) : null,
    results(id, count));
}
