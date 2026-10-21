// The controls of each Edit tool, in the workbench's right column: plain, readable, with units. Each builder answers the list of
// controls for one tool from its settings (p), what it was given (i) and an env: set(patch, quiet) keeps settings (quiet: while
// something is being dragged or typed, so the screen is not drawn again under it), the stage (the playhead, the clip) and the
// file choosers. One primary key is not here: the workspace puts it under them.
import { h, icon, sprite } from "./dom.js";
import { toast } from "./store.js";
import { api } from "./api.js";
import { pickInput, setInput } from "./utensils.js";
import { parseCues, seconds as parseSeconds, MAX_CUES } from "./utensils-edit-cues.js";
import { editLut } from "./utensils-edit-api.js";
import { stamp } from "./utensils-edit-stage.js";

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;

export const control = (label, ...kids) => h("div.ut-control", {}, h("span.ut-label", {}, label), ...kids);
/** A control of one slider: its label and the slider on one line (the controls of a tool then fit the column). */
const line = (label, node) => h("div.ut-control.is-line", {}, h("span.ut-label", {}, label), node);
const note = (text) => h("p.ut-hint", {}, text);

/** A segmented control: [value, label, sprite?, title?] options, the one picked lit. */
export const seg = (options, value, pick, title) =>
  h("div.ut-segs", { role: "group", title }, ...options.map(([v, label, glyph, tip]) =>
    h("button.ut-seg", { type: "button", "aria-pressed": String(value === v), title: tip ?? (typeof label === "string" ? label : ""), on: { click: () => pick(v) } }, glyph ? sprite(glyph) : null, label)));

/** Chips for a longer list of choices (they wrap on their own, where a segmented control would not): [value, label] options. */
export const chips = (options, value, pick, title) =>
  h("div.ue-chips", { role: "group", title }, ...options.map(([v, label]) => h("button.ut-pill.ue-chip", { type: "button", "aria-pressed": String(value === v), on: { click: () => pick(v) } }, label)));

/** A slider with its value beside it: moving it keeps the value quietly, letting go keeps it for good. */
export function slider({ value, min, max, step = 0.01, show = (v) => String(v), set, label }) {
  const out = h("output.ue-out", {}, show(value));
  const input = h("input.ue-range-input", { type: "range", min, max, step, value, "aria-label": label ?? "Value" });
  const fill = () => input.style.setProperty("--fill", `${((input.value - min) / (max - min)) * 100}%`);
  fill();
  input.addEventListener("input", () => (fill(), (out.textContent = show(Number(input.value))), set(Number(input.value), true)));
  input.addEventListener("change", () => set(Number(input.value), false));
  return h("div.ue-slider", {}, input, out);
}

/** A switch with its words beside it. */
export const toggle = (label, on, set, title) =>
  h("button.ue-switch", { type: "button", role: "switch", "aria-checked": String(!!on), title, on: { click: () => set(!on) } }, h("i"), h("span", {}, label));

/** Opens the computer's file chooser for one kind of file. */
export function chooseFile(accept, fn) {
  const input = h("input", { type: "file", accept, hidden: true, on: { change: () => (input.files[0] && fn(input.files[0]), input.remove()) } });
  document.body.append(input);
  input.click();
}

const swatches = (value, set) =>
  h("div.ue-swatches", {}, ...["#000000", "#FFFFFF", "#211927", "#49378B", "#F2FF59"].map((c) =>
    h("button.ue-swatch", { type: "button", style: { "--c": c }, "aria-pressed": String(value.toUpperCase() === c), title: c, "aria-label": c, on: { click: () => set(c) } })),
  h("label.ue-swatch.is-custom", { title: "Another colour" }, h("input", { type: "color", value: value.toLowerCase(), "aria-label": "Another colour", on: { input: (e) => set(e.target.value.toUpperCase(), true), change: (e) => set(e.target.value.toUpperCase(), false) } })));

const time = (s) => stamp(s);
const unit = (s) => `${r1(s)} s`;

// ---------------------------------------------------------------- the tools

const TOOLS = {
  trim: (p, i, env) => {
    const d = Number(i.video?.duration) || 0;
    const a = p.start;
    const b = p.end > p.start ? p.end : d;
    const cell = (label, value, key) => h("div.ue-time", {}, h("span.ut-label", {}, label), h("b", {}, time(value)),
      key ? h("button.ut-iconkey.is-quiet", { type: "button", title: `Set the ${label.toLowerCase()} to the playhead`, "aria-label": `Set the ${label.toLowerCase()} to the playhead`, on: { click: () => env.set(key === "start" ? { start: r2(clamp(env.stage.time(), 0, b - 0.2)), end: b } : { end: r2(clamp(env.stage.time(), a + 0.2, d)) }) } }, icon("step")) : null);
    return [
      control("Range", h("div.ue-times", {}, cell("In", a, "start"), cell("Out", b, "end"), cell("Length", b - a)), note("Drag the handles on the timeline, or set them at the playhead.")),
      control("How it is cut", seg([["auto", "Auto"], ["encode", "Exact"], ["copy", "Fast"]], p.mode, (v) => env.set({ mode: v }), "Auto copies the stream when the cut starts on a keyframe: no re-encode, no loss. Exact always re-encodes. Fast always copies (the start may move to a keyframe)."),
        note(p.mode === "copy" ? "Fast copies the picture as it is: nothing is re-encoded, the start may move back to the nearest keyframe." : p.mode === "encode" ? "Exact re-encodes, so the cut is on the very frame." : "Auto copies when the cut allows it, and re-encodes when it must.")),
    ];
  },

  reframe: (p, i, env) => [
    control("Format", seg([["9:16", "9:16", "ratio-9-16"], ["1:1", "1:1", "ratio-1-1"], ["4:5", "4:5", "ratio-3-4"], ["16:9", "16:9", "ratio-16-9"]], p.format, (v) => env.set({ format: v }))),
    p.fill === "fill" ? control("Position",
      seg([[0, "Left"], [0.5, "Centre"], [1, "Right"]], [0, 0.5, 1].find((x) => Math.abs(p.x - x) < 0.02), (v) => env.set({ x: v, y: 0.5 })),
      note("Or drag the frame on the picture.")) : null,
    p.fill === "fill" ? line("Zoom", slider({ value: p.zoom, min: 1, max: 4, step: 0.05, show: (v) => `${r2(v)}×`, set: (v, q) => env.set({ zoom: v }, q), label: "Zoom" })) : null,
    control("Background", seg([["fill", "Fill"], ["blur", "Blur"], ["colour", "Colour"]], p.fill, (v) => env.set({ fill: v }), "Fill crops the clip to the format. Blur and Colour fit the whole clip inside it, over a blurred copy or a colour."),
      p.fill === "colour" ? swatches(p.colour, (c, q) => env.set({ colour: c }, q)) : null,
      p.fill === "fill" ? null : note("The whole clip is fitted inside the frame.")),
  ],

  speed: (p, i, env) => {
    const d = Number(i.video?.duration) || 0;
    return [
      control("Speed", h("div.ue-chips", {}, ...[0.25, 0.5, 1, 2, 4].map((f) => h("button.ut-pill.ue-chip", { type: "button", "aria-pressed": String(p.factor === f), on: { click: () => env.set({ factor: f }) } }, `${f}×`))),
        slider({ value: p.factor, min: 0.25, max: 4, step: 0.05, show: (v) => `${r2(v)}×`, set: (v, q) => env.set({ factor: v }, q), label: "Speed" }),
        h("span.ut-readout", {}, d ? `${unit(d)} becomes ${unit(d / p.factor)}` : "")),
      p.factor < 1 ? control("Slow-motion", toggle("Smooth it with interpolated frames", p.smooth, (v) => env.set({ smooth: v }), "Draws in-between frames so the slow-motion does not stutter. It takes longer."), note("Smooth slow-mo takes clips of up to 30 seconds.")) : null,
    ];
  },

  reverse: () => [control("Backwards", note("The picture and the sound play from the last frame to the first. Clips of up to 60 seconds."))],

  loop: (p, i, env) => {
    const d = Number(i.video?.duration) || 0;
    const total = d * p.times * (p.pingpong ? 2 : 1);
    return [
      control("Repeats", h("div.ut-stepper", {}, h("button", { type: "button", "aria-label": "Fewer", disabled: p.times <= 2, on: { click: () => env.set({ times: p.times - 1 }) } }, "−"), h("span", {}, `${p.times}×`), h("button", { type: "button", "aria-label": "More", disabled: p.times >= 10, on: { click: () => env.set({ times: p.times + 1 }) } }, "+"))),
      control("Direction", toggle("Ping-pong: forwards, then backwards", p.pingpong, (v) => env.set({ pingpong: v }))),
      d ? h("span.ut-readout", { className: total > 180 ? "is-warn" : "" }, total > 180 ? `${unit(total)} is past the 180 s limit` : `The result runs ${unit(total)}`) : null,
    ];
  },

  merge: (p, i, env) => {
    const clips = p.clips;
    const total = clips.reduce((s, c) => s + (c.duration || 0), 0) - Math.max(0, clips.length - 1) * (p.crossfade || 0);
    const move = (n, by) => {
      const next = [...clips];
      const [c] = next.splice(n, 1);
      next.splice(clamp(n + by, 0, next.length), 0, c);
      env.set({ clips: next });
    };
    const rows = clips.map((c, n) => h("div.ue-clip", {},
      h("span.ue-clip-pic", {}, h("video", { src: `${c.url}#t=0.1`, muted: true, preload: "metadata", playsInline: true })),
      h("span.ue-clip-text", {}, h("b", {}, c.name ?? `Clip ${n + 1}`), h("em", {}, `${unit(c.duration || 0)} · ${c.width}×${c.height}`)),
      h("button.ut-iconkey.is-quiet.is-up", { type: "button", title: "Earlier", "aria-label": "Earlier", disabled: n === 0, on: { click: () => move(n, -1) } }, icon("chevron")),
      h("button.ut-iconkey.is-quiet", { type: "button", title: "Later", "aria-label": "Later", disabled: n === clips.length - 1, on: { click: () => move(n, 1) } }, icon("chevron")),
      h("button.ut-iconkey.is-quiet.is-danger", { type: "button", title: "Take it out", "aria-label": "Take it out", on: { click: () => env.set({ clips: clips.filter((_, k) => k !== n) }) } }, icon("close"))));
    return [
      control(`Clips${clips.length ? ` · ${clips.length}` : ""}`,
        clips.length ? h("div.ue-clips", {}, ...rows) : note("Add two or more clips: they are joined in the order they are listed."),
        h("div.ue-row", {},
          h("button.ut-ghost", { type: "button", on: { click: () => env.addClips() } }, icon("plus"), "Add clips"),
          i.video ? h("button.ut-ghost.is-quiet", { type: "button", title: "Add the clip that is open", on: { click: () => env.addOpen() } }, icon("video"), "The open clip") : null)),
      line("Crossfade", slider({ value: p.crossfade, min: 0, max: 2, step: 0.1, show: (v) => (v ? unit(v) : "None"), set: (v, q) => env.set({ crossfade: v }, q), label: "Crossfade" })),
      control("Frame", chips([["first", "Like the first"], ["16:9", "16:9"], ["9:16", "9:16"], ["1:1", "1:1"]], p.aspect, (v) => env.set({ aspect: v })),
        seg([["contain", "Fit"], ["cover", "Fill"]], p.fit, (v) => env.set({ fit: v }), "Fit leaves bars where a clip does not match the frame. Fill crops it to cover the frame.")),
      clips.length >= 2 ? h("span.ut-readout", {}, `The film runs ${unit(total)}`) : null,
    ];
  },

  captions: (p, i, env) => {
    const dur = Number(i.video?.duration) || 0;
    // (a line is changed in what is kept now: an earlier edit of another line, made quietly, is not lost)
    const edit = (n, patch) => env.set({ cues: env.params().cues.map((c, k) => (k === n ? { ...c, ...patch } : c)) }, true);
    const rows = p.cues.map((c, n) => h("div.ue-cue", {},
      h("input.ue-cue-time", { value: time(c.start), "aria-label": `Line ${n + 1} starts`, title: "Starts (0:03.5)", on: { change: (e) => { const v = parseSeconds(e.target.value); if (v === null) return void (e.target.value = time(c.start)); edit(n, { start: clamp(v, 0, c.end - 0.1) }); env.set({}, false); } } }),
      h("input.ue-cue-time", { value: time(c.end), "aria-label": `Line ${n + 1} ends`, title: "Ends (0:05.0)", on: { change: (e) => { const v = parseSeconds(e.target.value); if (v === null) return void (e.target.value = time(c.end)); edit(n, { end: clamp(v, c.start + 0.1, dur || v) }); env.set({}, false); } } }),
      h("input.ue-cue-text", { value: c.text.replace(/\n/g, " ⏎ "), "aria-label": `Line ${n + 1} says`, placeholder: "What it says", maxlength: 200, dataset: { focus: `cue:${n}` }, on: { input: (e) => edit(n, { text: e.target.value.replace(/ ?⏎ ?/g, "\n") }) } }),
      h("button.ut-iconkey.is-quiet.is-danger", { type: "button", title: "Take it out", "aria-label": "Take the line out", on: { click: () => env.set({ cues: p.cues.filter((_, k) => k !== n) }) } }, icon("close"))));
    const add = () => {
      const t = env.stage.time();
      env.set({ cues: [...p.cues, { start: r1(t), end: r1(Math.min(dur || t + 2, t + 2)), text: "New line" }].sort((a, b) => a.start - b.start).slice(0, MAX_CUES) });
    };
    return [
      control(`Lines${p.cues.length ? ` · ${p.cues.length}` : ""}`,
        p.cues.length ? h("div.ue-cues", {}, ...rows) : note("Add a line at the playhead, or bring an .srt or .vtt file in."),
        h("div.ue-row", {},
          h("button.ut-ghost", { type: "button", title: "A new line, at the playhead", on: { click: add } }, icon("plus"), "Line"),
          h("button.ut-ghost.is-quiet", { type: "button", title: "Read the lines of an .srt or .vtt file", on: { click: () => chooseFile(".srt,.vtt,text/vtt,application/x-subrip", (f) => env.readCues(f)) } }, icon("upload"), ".srt / .vtt"))),
      control("Style", seg([["bold", "Bold"], ["outline", "Outline"], ["box", "Box"], ["minimal", "Minimal"]], p.style, (v) => env.set({ style: v })),
        p.style === "outline" ? swatches(p.colour, (c, q) => env.set({ colour: c }, q)) : null),
      control("Place and size", seg([["top", "Top"], ["middle", "Middle"], ["bottom", "Bottom"]], p.position, (v) => env.set({ position: v })),
        slider({ value: p.size, min: 3, max: 14, step: 0.5, show: (v) => `${r1(v)} %`, set: (v, q) => env.set({ size: v }, q), label: "Size" })),
      control("Type", seg([["sans", "Sans"], ["lyric", "Lyric"]], p.font, (v) => env.set({ font: v })), toggle("CAPITALS", p.caps, (v) => env.set({ caps: v }))),
    ];
  },

  grade: (p, i, env) => {
    const sl = (label, key, min, max, step, show) => line(label, slider({ value: p[key], min, max, step, show, set: (v, q) => env.set({ [key]: v }, q), label }));
    const pct = (v) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}`;
    return [
      control("Look", h("div.ue-chips", {}, ...[["none", "None"], ["warm", "Warm"], ["cool", "Cool"], ["filmic", "Filmic"], ["punchy", "Punchy"], ["faded", "Faded"], ["noir", "Noir"]].map(([v, label]) =>
        h("button.ut-pill.ue-chip", { type: "button", "aria-pressed": String(p.preset === v), on: { click: () => env.set({ preset: v }) } }, label)))),
      sl("Exposure", "exposure", -1, 1, 0.02, pct),
      sl("Contrast", "contrast", 0.5, 2, 0.02, (v) => `${r2(v)}×`),
      sl("Saturation", "saturation", 0, 3, 0.02, (v) => `${r2(v)}×`),
      sl("Temperature", "temperature", -1, 1, 0.02, pct),
      sl("Tint", "tint", -1, 1, 0.02, pct),
      h("div.ue-row", {},
        toggle("Vignette", p.vignette, (v) => env.set({ vignette: v })),
        h("button.ut-ghost.is-quiet", { type: "button", title: "Back to the look's own values", on: { click: () => env.set({ exposure: 0, contrast: 1, saturation: 1, temperature: 0, tint: 0 }) } }, icon("remix"), "Reset")),
      control("LUT",
        p.lut ? h("div.ue-lut", {}, h("span.ut-pill", {}, p.lutName || "A LUT"), h("button.ut-iconkey.is-quiet", { type: "button", title: "Take the LUT out", "aria-label": "Take the LUT out", on: { click: () => env.set({ lut: "", lutName: "" }) } }, icon("close")))
          : h("button.ut-ghost.is-quiet", { type: "button", title: "A colour table (.cube) applied first, under the look", on: { click: () => chooseFile(".cube,text/plain", (f) => env.readLut(f)) } }, icon("upload"), ".cube LUT")),
    ];
  },

  logo: (p, i, env) => {
    const d = Number(i.video?.duration) || 0;
    const b = p.end > p.start ? p.end : d;
    const logo = i.image;
    return [
      control("Logo", h("div.ut-well", {},
        h("button.ut-well-pic", { type: "button", title: logo ? "Replace it" : "Add the logo", on: { click: (e) => pickInput("image", e.currentTarget) } }, logo ? h("img", { src: logo.url, alt: "", draggable: false }) : icon("image")),
        h("span.ut-well-text", {}, h("b", {}, logo ? `${logo.width} × ${logo.height}` : "Add the logo"), h("em", {}, logo ? "click to replace" : "a picture, a PNG with a clear ground is best")))),
      control("Corner", h("div.ue-corners", { role: "group", "aria-label": "Corner" }, ...[["tl", "Top left"], ["tr", "Top right"], ["centre", "Centre"], ["bl", "Bottom left"], ["br", "Bottom right"]].map(([v, label]) =>
        h("button.ue-corner", { type: "button", dataset: { at: v }, "aria-pressed": String(p.corner === v), title: label, "aria-label": label, on: { click: () => env.set({ corner: v }) } })))),
      line("Size", slider({ value: p.scale, min: 4, max: 60, step: 1, show: (v) => `${Math.round(v)} %`, set: (v, q) => env.set({ scale: v }, q), label: "Size" })),
      line("Opacity", slider({ value: p.opacity, min: 0.1, max: 1, step: 0.05, show: (v) => `${Math.round(v * 100)} %`, set: (v, q) => env.set({ opacity: v }, q), label: "Opacity" })),
      line("Margin", slider({ value: p.margin, min: 0, max: 15, step: 0.5, show: (v) => `${r1(v)} %`, set: (v, q) => env.set({ margin: v }, q), label: "Margin" })),
      line("Fade in", slider({ value: p.fadeIn, min: 0, max: 3, step: 0.1, show: (v) => (v ? unit(v) : "None"), set: (v, q) => env.set({ fadeIn: v }, q), label: "Fade in" })),
      line("Fade out", slider({ value: p.fadeOut, min: 0, max: 3, step: 0.1, show: (v) => (v ? unit(v) : "None"), set: (v, q) => env.set({ fadeOut: v }, q), label: "Fade out" })),
      d ? h("span.ut-readout", {}, `Shown from ${time(p.start)} to ${time(b)}: drag the handles on the timeline.`) : null,
    ];
  },

  audio: (p, i, env) => {
    const sound = i.audio;
    return [
      control("What to do", seg([["mute", "Mute", "tool-edit-audio"], ["replace", "Replace"], ["mix", "Mix in"]], p.mode, (v) => env.set({ mode: v }), "Mute takes the sound out. Replace puts another in its place. Mix lays another over it.")),
      p.mode === "mute" ? note("The sound is taken out; the picture is not touched.") : control("The new sound", h("div.ut-well", {},
        h("button.ut-well-pic", { type: "button", title: sound ? "Replace it" : "Add a sound", on: { click: () => env.pickSound() } }, icon("sound")),
        h("span.ut-well-text", {}, h("b", {}, sound ? sound.name ?? "A sound" : "Add a sound"), h("em", {}, sound ? `${unit(sound.seconds ?? 0)} · it is looped to the clip's length` : "an MP3, WAV or M4A, or a video's own sound")),
        sound ? h("button.ut-iconkey.is-quiet", { type: "button", title: "Take it out", "aria-label": "Take it out", on: { click: () => setInput({ audio: null }) } }, icon("close")) : null)),
      p.mode === "mute" ? null : line("New sound", slider({ value: p.volume, min: 0, max: 2, step: 0.05, show: (v) => `${Math.round(v * 100)} %`, set: (v, q) => env.set({ volume: v }, q), label: "New sound" })),
      p.mode === "mix" ? line("Original", slider({ value: p.videoVolume, min: 0, max: 2, step: 0.05, show: (v) => `${Math.round(v * 100)} %`, set: (v, q) => env.set({ videoVolume: v }, q), label: "Original sound" })) : null,
      p.mode === "mute" ? null : line("Fade out", slider({ value: p.fadeOut, min: 0, max: 5, step: 0.1, show: (v) => (v ? unit(v) : "None"), set: (v, q) => env.set({ fadeOut: v }, q), label: "Fade out" })),
    ];
  },

  convert: (p, i, env) => {
    const sound = ["mp3", "wav", "m4a"].includes(p.format);
    return [
      control("Format", chips([["mp4", "MP4"], ["webm", "WebM"], ["mov", "MOV"], ["gif", "GIF"], ["mp3", "MP3"], ["wav", "WAV"], ["m4a", "M4A"]], p.format, (v) => env.set({ format: v }), "A clip as a file, or just its sound")),
      p.format === "mov" ? control("Codec", seg([["h264", "H.264"], ["prores", "ProRes"]], p.codec, (v) => env.set({ codec: v }), "ProRes is large and made for editing")) : null,
      p.format === "wav" || p.format === "gif" ? null : control("Quality", seg([["high", "High"], ["medium", "Medium"], ["small", "Small"]], p.quality, (v) => env.set({ quality: v }))),
      sound ? null : control("Size", chips([["0", "Original"], ["360", "360p"], ["480", "480p"], ["720", "720p"], ["1080", "1080p"]], String(p.height), (v) => env.set({ height: v }), "The short side of the picture")),
      sound ? null : control("Frame rate", chips([["0", "Original"], ["12", "12"], ["15", "15"], ["24", "24"], ["30", "30"], ["60", "60"]], String(p.fps), (v) => env.set({ fps: v }))),
      sound ? note("Only the sound is kept, and it goes to the Library of sounds.") : null,
    ];
  },

  gif: (p, i, env) => {
    const d = Number(i.video?.duration) || 0;
    const a = p.start;
    const b = p.end > p.start ? p.end : Math.min(d, p.start + 4);
    const frames = p.mode === "frames";
    return [
      control("Make", seg([["gif", "A GIF"], ["frames", "Frames"]], p.mode, (v) => env.set({ mode: v }))),
      frames ? null : control("Range", h("span.ut-readout", { className: b - a > 15 ? "is-warn" : "" }, `${time(a)} to ${time(b)} · ${unit(Math.min(15, b - a))}${b - a > 15 ? " (a GIF holds 15 s at most)" : ""}`), note("Drag the handles on the timeline.")),
      frames ? null : control("Width", seg([[320, "320"], [480, "480"], [640, "640"], [800, "800"]], p.width, (v) => env.set({ width: v }), "Pixels")),
      frames ? null : control("Frame rate", seg([[10, "10"], [15, "15"], [20, "20"]], p.fps, (v) => env.set({ fps: v }))),
      frames ? control("How many", h("div.ut-stepper", {}, h("button", { type: "button", "aria-label": "Fewer", disabled: p.count <= 1 || p.times.length > 0, on: { click: () => env.set({ count: p.count - 1 }) } }, "−"), h("span", {}, p.times.length ? `${p.times.length}` : `${p.count}`), h("button", { type: "button", "aria-label": "More", disabled: p.count >= 24 || p.times.length > 0, on: { click: () => env.set({ count: p.count + 1 }) } }, "+")), note(p.times.length ? "The frames you marked." : "Spread evenly over the clip, or mark the frames you want.")) : null,
      frames ? control("Marked frames", h("div.ue-chips", {}, ...p.times.map((t, n) => h("button.ut-pill.ue-chip", { type: "button", title: "Take it out", on: { click: () => env.set({ times: p.times.filter((_, k) => k !== n) }) } }, `${time(t)} ×`)),
        h("button.ut-ghost", { type: "button", title: "Mark the frame at the playhead", on: { click: () => env.set({ times: [...p.times, r2(env.stage.time())].sort((x, y) => x - y).slice(0, 24) }) } }, icon("plus"), "This frame"))) : null,
      frames ? control("File", seg([["png", "PNG"], ["jpg", "JPG"]], p.format, (v) => env.set({ format: v })), note("The frames go to your pictures.")) : null,
    ];
  },
};

/** The controls of a tool. */
export const controlsOf = (key, p, i, env) => (TOOLS[key]?.(p, i, env) ?? []).filter(Boolean);

/** A file read as the lines of a caption: .srt or .vtt. */
export async function readCuesFile(file, set) {
  const text = await file.text();
  const cues = parseCues(text);
  if (!cues.length) return void toast("No caption lines in that file.", { tone: "crit" });
  set({ cues });
  toast(`${cues.length} caption ${cues.length === 1 ? "line" : "lines"} read.`);
}
/** A .cube file kept for the grade. */
export async function readLutFile(file, set) {
  try {
    const out = await editLut(await file.text());
    set({ lut: out.file, lutName: file.name.replace(/\.cube$/i, "").slice(0, 40) });
  } catch (e) {
    toast(e.message, { tone: "crit" });
  }
}
/** A sound given to the audio tool: an MP3, WAV or M4A, or the sound of a video. */
export async function giveSound(file) {
  try {
    const a = await api.uploadAudio(file);
    let secs = a.seconds;
    if (!secs) {
      const ctx = new AudioContext();
      secs = (await ctx.decodeAudioData(await (await fetch(a.url)).arrayBuffer())).duration;
      ctx.close();
    }
    setInput({ audio: { file: a.file, url: a.url, seconds: Math.round(secs * 10) / 10, name: file.name || a.name } }, "ed-audio");
  } catch (e) {
    toast(e.message, { tone: "crit" });
  }
}
