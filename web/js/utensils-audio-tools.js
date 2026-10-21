// The Audio workspace's tools: what each one is (its card, what it takes, where it runs), the settings it starts with, when it is
// ready, and how it runs. Three are the shelf's own (a sound effect from words, music from words, a sound for a clip: their run code
// is in utensils.js, the Audio workspace gives them their workbench). Three run on this machine and are free (cleaning a sound,
// mastering its loudness, finding its beat). Three run on Comfy Cloud through the template runner (utensils-cloud.js): a voice from
// text and a voice converted to another (Chatterbox, open models), and a track split into vocals and instruments (MelBandRoFormer).
// Every tool is on the shelf (registerTool) so the Shelf's grid lists it and Truffle can open it; the free ones she can run too.
import { registerTool, utensils, inputOf, toolById, estimate } from "./utensils.js";
import { fxRun, fxStop, asResult } from "./utensils-fx-api.js";
import { runCloud, runnerOf, costOf, priceText } from "./utensils-cloud.js";

/** The tools in the order of the cards. `own` marks the shelf's own (their id is theirs); `way` says where one runs. */
export const AUDIO = [
  { id: "sfx", own: true, name: "Sound effect from words", short: "Sound effect", hint: "A sound from a few words", icon: "audio-sfx", way: "cloud-own", takes: [], verb: "Make the sound", tone: "#F2FF59", tag: "Comfy Cloud" },
  { id: "sound", own: true, name: "Sound for a clip", short: "Sound for a clip", hint: "Sound written for a clip, in sync with it", icon: "tool-add-sound", way: "cloud-own", takes: ["video"], verb: "Add sound", tone: "#8c8cff", tag: "Comfy Cloud" },
  { id: "music", own: true, name: "Music from words", short: "Music", hint: "A track from a few words, with lyrics or without", icon: "audio-music", way: "cloud-own", takes: [], verb: "Make the track", tone: "#e24bd9", tag: "Comfy Cloud" },
  { id: "au-voice", name: "Voice from text", short: "Voice from text", hint: "Say a text in a voice, copied from a short clip of it", icon: "tool-fx-voice", way: "cloud", takes: [], verb: "Speak it", tone: "#9be15d", tag: "Cloud · open model" },
  { id: "au-clone", name: "Voice clone", short: "Voice clone", hint: "Your recording, said in another voice, with its timing", icon: "audio-voice", way: "cloud", takes: ["audio"], verb: "Change the voice", tone: "#6aa5ff", tag: "Cloud · open model" },
  { id: "au-stems", name: "Split stems", short: "Split stems", hint: "A track pulled apart into its vocals and its instruments", icon: "tool-fx-stems", way: "cloud", takes: ["audio"], verb: "Split it", tone: "#ff7a59", tag: "Cloud · open model" },
  { id: "au-clean", name: "Clean up and denoise", short: "Clean up", hint: "Take hiss, hum and room noise out of a recording", icon: "tool-fx-clean", way: "local", takes: ["audio"], verb: "Clean it", tone: "#59c7ff", tag: "Free · this machine" },
  { id: "au-master", name: "Master and loudness", short: "Master", hint: "Bring a sound to the loudness a platform asks for", icon: "tool-fx-master", way: "local", takes: ["audio"], verb: "Master it", tone: "#a98bff", tag: "Free · this machine" },
  { id: "au-beat", name: "Find the beat", short: "Find the beat", hint: "The tempo and the beats of a track, read in the page", icon: "tool-fx-beat", way: "local", takes: ["audio"], verb: "Find it", tone: "#F2FF59", tag: "Free · in the page" },
];
export const audioById = (id) => AUDIO.find((t) => t.id === id) ?? AUDIO[0];
export const isAudio = (id) => AUDIO.some((t) => t.id === id);
export const cloudTool = (id) => audioById(id).way === "cloud";

/** The official templates the cloud tools run, with who runs them and what they take. */
export const TEMPLATES = {
  "au-voice": { name: "audio-chatterbox_tts", title: "Chatterbox", about: "Speaks your text in the voice of a short clip", want: { text: true, audio: true } },
  "au-clone": { name: "audio-chatterbox_vc", title: "Chatterbox voice conversion", about: "Says what you recorded in another voice, keeping the timing", want: { audio: true, audio2: true } },
  "au-stems": { name: "audio_melbandroformer_audio_separation", title: "MelBandRoFormer", about: "Pulls a track apart into vocals and instruments", want: { audio: true } },
};
export const templateOf = (id) => TEMPLATES[id] ?? null;

export const PRESETS = [["streaming", "Streaming", -14, "Spotify, YouTube, Apple Music"], ["social", "Social", -16, "Instagram, TikTok, Reels"], ["broadcast", "Broadcast", -23, "Television and radio"], ["custom", "Custom", null, "A number of your own"]];

/** What each tool starts with (a tool's settings are kept by the shelf with what it was given: inputOf(id)). */
export const DEFAULTS = {
  sfx: { seconds: 6, variations: 4 },
  sound: { real: false },
  music: { seconds: 30, bpm: 100 },
  "au-voice": { words: "", exaggeration: 0.5, voice: null },
  "au-clone": { voice: null },
  "au-stems": {},
  "au-clean": { amount: 14, floor: -50, highpass: "0", format: "mp3" },
  "au-master": { preset: "streaming", lufs: -14, peak: -1.5, format: "mp3" },
  "au-beat": {},
};
/** A tool's settings as they stand: what it starts with, then what was changed. */
export const paramsOf = (id) => ({ ...DEFAULTS[id], ...inputOf(id) });

/** Whether a tool has what it needs now. */
export function readyOf(id, i = inputOf(id)) {
  const p = { ...DEFAULTS[id], ...i };
  switch (id) {
    case "sfx": case "music": return !!String(p.prompt ?? "").trim();
    case "sound": return !!i.video?.file && !!String(p.prompt ?? "").trim();
    case "au-voice": return !!String(p.words ?? "").trim();
    case "au-clone": return !!i.audio?.file && !!p.voice?.file;
    case "au-stems": case "au-clean": case "au-master": return !!i.audio?.file;
    case "au-beat": return !!i.audio?.url;
    default: return false;
  }
}

// ---------------------------------------------------------------- what a cloud tool costs

const estimates = new Map();
/**
 * What a cloud tool costs, as { credits, label }: the runner's own estimate for a template (an open model has none, only GPU time,
 * which is guessed from the length of what it works on), or the shelf's own for its three. Free ones answer { credits: 0 }.
 */
export function costFor(id, i = inputOf(id), redraw = () => {}) {
  const t = audioById(id);
  if (t.way === "local") return { credits: 0, label: "Free" };
  if (t.own) {
    const c = estimate(toolById(id), i);
    return { credits: c, label: typeof c === "number" ? `≈ ${c} cr` : "your GPU", gpu: true };
  }
  const tpl = TEMPLATES[id];
  if (!estimates.has(tpl.name)) {
    estimates.set(tpl.name, undefined);
    costOf(tpl.name).then((e) => (estimates.set(tpl.name, e ?? null), redraw()));
  }
  const e = estimates.get(tpl.name);
  const seconds = Math.min(60, i.audio?.seconds ?? 20);
  const gpu = Math.max(1, Math.round(seconds * 0.18 * 0.266 * 4));
  return e && typeof e.credits === "number" && e.credits > 0 ? { credits: e.credits, label: priceText(e) } : { credits: gpu, label: `≈ ${gpu} cr`, gpu: true };
}

// ---------------------------------------------------------------- how each runs

/** The running job of a tool (the queue made it a moment ago), so it can be stopped on the server too. */
const jobOf = (tool) => utensils.jobs.find((j) => j.tool === tool && j.status === "running");
async function local(tool, server, body, set, note) {
  const job = jobOf(tool);
  const made = await fxRun(server, body, set, (id) => job && (job.onCancel = () => fxStop(id)));
  return made.map((r) => asResult(r, note ?? r.note));
}

/** The free tools, run: from what they were given and their settings. Answers the results (the queue keeps them). */
export const RUN = {
  "au-clean": (i, set) => {
    const p = paramsOf("au-clean");
    return local("au-clean", "denoise", { file: i.audio.file, amount: p.amount, floor: p.floor, highpass: p.highpass, format: p.format, track: true, title: i.audio.name }, set);
  },
  "au-master": (i, set) => {
    const p = paramsOf("au-master");
    return local("au-master", "master", { file: i.audio.file, preset: p.preset, lufs: p.lufs, peak: p.peak, format: p.format, title: i.audio.name }, set);
  },
};

/** What a cloud tool is told: the sound or the words, and the voices. */
export function givenOf(id, p, i) {
  const given = {};
  const audio = (a) => a?.file && { file: a.file, url: a.url, name: a.name ?? "sound", seconds: a.seconds };
  if (id === "au-voice") {
    if (String(p.words ?? "").trim()) given.text = String(p.words).trim();
    if (p.voice?.file) given.audio = audio(p.voice);
  } else if (id === "au-clone") {
    // the template's first sound is the voice to speak in, its second the recording to convert
    given.audio = audio(p.voice);
    given.audio2 = audio(i.audio);
  } else if (id === "au-stems") given.audio = audio(i.audio);
  return given;
}

/** A tool that runs on Comfy Cloud: the template, filled from the tool's fields, run with the person's yes to the price; the runner keeps what it made as results of the tool. */
export async function runCloudTool(id) {
  const i = inputOf(id);
  const p = paramsOf(id);
  const t = TEMPLATES[id];
  if (!t || !(await runnerOf())) return null;
  return runCloud(t.name, t.want, givenOf(id, p, i), { tool: id, label: audioById(id).name, credits: costFor(id, i)?.credits ?? null, note: t.title });
}

let registered = false;
/** The new tools, on the shelf (once). The shelf's own three (sfx, music, sound) are already there. */
export function registerAudioTools() {
  if (registered) return;
  registered = true;
  const OPTIONS = {
    "au-clean": [{ key: "amount", type: "range", min: 1, max: 40 }, { key: "highpass", type: "choice", values: ["0", "60", "80", "120"] }, { key: "format", type: "choice", values: ["mp3", "wav", "m4a"] }],
    "au-master": [{ key: "preset", type: "choice", values: ["streaming", "social", "broadcast", "custom"] }, { key: "format", type: "choice", values: ["mp3", "wav", "m4a"] }],
  };
  for (const t of AUDIO.filter((x) => !x.own)) {
    registerTool({
      id: t.id, workspace: "audio", name: t.name, icon: t.icon, hint: t.hint, takes: t.takes, verb: t.verb,
      options: OPTIONS[t.id],
      ready: (i) => readyOf(t.id, { ...inputOf(t.id), ...i }),
      cost: () => costFor(t.id)?.credits ?? null,
      // the free ones Truffle can run; the cloud ones and the beat finder ask in their own workbench
      ...(RUN[t.id] ? { run: (i, set) => RUN[t.id](i, set) } : {}),
    });
  }
}
