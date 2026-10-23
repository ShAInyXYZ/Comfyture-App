// The controls of each VFX tool, in the workbench's lower half: plain, readable, with units. Each builder answers the list of
// controls of one tool from its settings (p), what it was given (i) and an env: set(patch, quiet) keeps settings (quiet: while
// something is being dragged or typed, so the screen is not drawn again under it), the stage, and the calls a control makes
// (a frame to show, the clip to ask for). The two keys under the controls (the preview, the yellow run key) are not here: the
// workspace puts them there.
import { h, icon, sprite } from "./dom.js";
import { pickInput, utensils } from "./utensils.js";
import { runnerReady } from "./utensils-cloud.js";
import { line, slider, switchKey, chipRow, swatches, pictureWell, clock } from "./utensils-fx-controls.js";
import { seg } from "./utensils-bench.js";
import { STYLES, LIGHTS, TEMPLATES, templateOf, masks } from "./utensils-vfx-tools.js";

const pct = (v) => `${Math.round(v * 100)}%`;
const note = (text) => h("p.ut-hint.uv-note", {}, text);
const hint = (text) => h("p.uv-why", {}, text);

/** The clip a tool works on, as a small well: its first frame, its length, a key to take it out. */
export function clipWell(i, label = "Add a clip") {
  const v = i.video;
  return h("div.ut-well", {},
    h("button.ut-well-pic", { type: "button", title: v ? "Replace it" : label, on: { click: (e) => pickInput("video", e.currentTarget) } }, v ? h("video", { src: v.url, muted: true, preload: "metadata" }) : icon("film")),
    h("span.ut-well-text", {}, h("b", {}, v ? `Clip · ${clock(v.duration)}` : label), h("em", {}, v ? `${v.width} × ${v.height} · click to replace` : "or drop or paste it")));
}
/** The picture a tool works on, as a small well. */
export function stillWell(i, label = "Add a picture") {
  const v = i.image;
  return h("div.ut-well", {},
    h("button.ut-well-pic", { type: "button", title: v ? "Replace it" : label, on: { click: (e) => pickInput("image", e.currentTarget) } }, v ? h("img", { src: v.url, alt: "", draggable: false }) : icon("image")),
    h("span.ut-well-text", {}, h("b", {}, v ? `${v.width} × ${v.height}` : label), h("em", {}, v ? "click to replace" : "or drop or paste it")));
}

/** A free tool's key colour card: the colour, its hex, the eyedropper, and the usual two. */
function keyColour(p, env) {
  const pick = env.picking();
  return h("div.uv-key", {},
    h("label.uv-key-swatch", { style: { "--c": p.colour }, title: "Change the colour" }, h("input", { type: "color", value: p.colour.toLowerCase(), "aria-label": "Key colour", on: { input: (e) => env.set({ colour: e.target.value.toUpperCase() }, true), change: (e) => env.set({ colour: e.target.value.toUpperCase() }) } })),
    h("code.uv-key-hex", {}, p.colour),
    h("button.ut-iconkey", { type: "button", "aria-pressed": String(pick), title: "Click a colour on the picture", "aria-label": "Pick the colour on the picture", on: { click: () => env.pick(!pick) } }, sprite("tool-fx-pick")),
    chipRow([["#00C800", "Green"], ["#0047FF", "Blue"]], p.colour, (c) => env.set({ colour: c })));
}

/** The mask tools: brush, eraser, lasso, the size, how far the edges grow, clear. */
function maskTools(p, env) {
  const key = (id, glyph, title) => h("button.ut-iconkey", { type: "button", "aria-pressed": String((p.brush ?? "brush") === id), title, "aria-label": title, on: { click: () => env.set({ brush: id }) } }, sprite(glyph));
  return [
    line("Mask", h("div.uv-tools", {}, key("brush", "tool-fx-brush", "Brush"), key("eraser", "tool-fx-eraser", "Eraser"), key("lasso", "tool-fx-lasso", "Lasso: draw round it"),
      h("button.ut-ghost", { type: "button", disabled: !env.hasMask(), on: { click: () => env.clearMask() } }, icon("close"), "Clear"))),
    line("Brush size", slider({ value: p.size, min: 8, max: 200, step: 2, show: (v) => `${v} px`, set: (v, q) => env.set({ size: v }, q), label: "Brush size" })),
    line("Edges grow", slider({ value: p.grow, min: 0, max: 8, step: 1, show: (v) => `${v}`, set: (v, q) => env.set({ grow: v }, q), label: "How far the edges grow" })),
  ];
}

/** The settings the template itself has that the tool does not (the slots left over), as plain controls; what they hold is kept in p.extra. */
function slotControls(slots, p, env) {
  const extra = p.extra ?? {};
  const put = (slot, v, q) => env.set({ extra: { ...extra, [slot.id]: v } }, q);
  const rows = [];
  for (const s of slots.filter((x) => !/^(video|image|audio)$/.test(x.kind) && !/model|vae|clip|lora|unet|checkpoint/i.test(x.id + (x.label ?? ""))).slice(0, 8)) {
    const v = extra[s.id] ?? s.default;
    const label = s.label ?? s.id;
    if (Array.isArray(s.options) && s.options.length) rows.push(line(label, h("select.ut-select", { "aria-label": label, on: { change: (e) => put(s, e.target.value) } }, ...s.options.map((o) => h("option", { value: o, selected: String(o) === String(v) }, String(o))))));
    else if (typeof s.default === "boolean" || s.kind === "boolean") rows.push(switchKey(label, !!v, (on) => put(s, on)));
    else if (typeof s.default === "number" || s.kind === "number") {
      const min = s.min ?? 0;
      const max = s.max ?? Math.max(10, Number(s.default) * 4 || 10);
      rows.push(line(label, slider({ value: Number(v ?? 0), min, max, step: max - min > 20 ? 1 : 0.05, show: (x) => String(Math.round(x * 100) / 100), set: (x, q) => put(s, x, q), label })));
    } else if (s.kind === "text" || typeof s.default === "string") rows.push(line(label, h("input.ut-words", { value: String(v ?? ""), "aria-label": label, on: { input: (e) => put(s, e.target.value, true) } })));
  }
  return rows;
}

/** Where a cloud tool runs, in a line: the template, who runs it, and an honest word when it sends the media to a partner. */
export function whereLine(id, p) {
  const t = templateOf(id, p);
  if (!t) return null;
  return h("div.uv-where", {},
    h("span.ut-pill", { title: `The official ComfyUI template ${t.name}` }, t.partner ? `Partner · ${t.partner}` : "Open model"),
    h("span.uv-where-text", {}, t.about),
    t.partner ? h("em", {}, `Your media is sent to ${t.partner} to make this.`) : null,
    runnerReady() ? null : h("em.uv-warn", {}, "The template runner is not on this page yet."));
}

/** The settings the template has beyond the tool's own, once the runner has read it: a disclosure at the end of a cloud tool's controls. */
function more(id, p, env) {
  const t = templateOf(id, p);
  const schema = t && env.schema(t);
  const rest = (schema?.rest ?? []).filter((x) => !(t?.own ?? []).includes(x.id));
  if (!t || !rest.length) return [];
  const rows = slotControls(rest, p, env);
  return rows.length ? [h("details.uv-more", {}, h("summary", {}, icon("chevron"), "More settings of the template"), ...rows)] : [];
}

export const CONTROLS = {
  "vfx-chroma": (p, i, env) => [
    line("Key colour", keyColour(p, env)),
    line("Similarity", slider({ value: p.similarity, min: 0.01, max: 0.6, step: 0.01, show: (v) => `${v.toFixed(2)}`, set: (v, q) => env.set({ similarity: v }, q), label: "Similarity" })),
    line("Blend", slider({ value: p.blend, min: 0, max: 0.5, step: 0.01, show: (v) => `${v.toFixed(2)}`, set: (v, q) => env.set({ blend: v }, q), label: "Blend" })),
    switchKey("Take the colour's spill off the edges", p.despill, (on) => env.set({ despill: on }), "Pulls the green or blue reflected on skin and hair back to neutral"),
    line("Result", chipRow([["webm", "Clear · WebM"], ["mov", "Clear · MOV"], ["colour", "On a colour"], ["picture", "On a picture"]], p.output, (v) => env.set({ output: v }), "What the cutout becomes")),
    p.output === "colour" ? line("Behind", swatches(p.background, (c, q) => env.set({ background: c }, q))) : null,
    p.output === "picture" ? pictureWell({ value: p.picture, label: "A picture to put behind", pick: (pic) => env.set({ picture: { file: pic.file, url: pic.url, width: pic.width, height: pic.height } }), clear: () => env.set({ picture: null }) }) : null,
    note("Clear results keep their transparency: WebM plays in the browser, MOV (ProRes 4444) goes to an editor."),
  ],
  "vfx-stabilise": (p, i, env) => [
    line("How shaky", slider({ value: p.shakiness, min: 1, max: 10, step: 1, show: (v) => `${v} / 10`, set: (v, q) => env.set({ shakiness: v }, q), label: "How shaky the clip is" })),
    line("Smoothness", slider({ value: p.smoothness, min: 1, max: 100, step: 1, show: (v) => `${v}%`, set: (v, q) => env.set({ smoothness: v }, q), label: "How smooth the camera becomes" })),
    line("Frame", seg([["fill", "Zoomed to hide the edges"], ["black", "Full frame, black edges"]], p.edges, (v) => env.set({ edges: v, zoom: v === "fill" ? "auto" : "none" }), "What happens to the edges the correction moves")),
    switchKey("Sharpen a little afterwards", p.sharpen, (on) => env.set({ sharpen: on })),
    note("Two passes: the shake is measured first, then removed. Shaky clips of up to two minutes."),
  ],
  "vfx-slowmo": (p, i, env) => [
    line("Slower by", seg([[1.5, "1.5×"], [2, "2×"], [3, "3×"], [4, "4×"]], p.factor, (v) => env.set({ factor: v }), "How many times slower")),
    line("Frames", seg([["mci", "Smooth"], ["blend", "Blend"], ["dup", "Repeat"]], p.mode, (v) => env.set({ mode: v }), "Smooth makes the frames in between with motion estimation; blend mixes the two nearest; repeat only holds them")),
    line("Sound", seg([["mute", "Silent"], ["slow", "Slowed"]], p.audio, (v) => env.set({ audio: v }))),
    switchKey("AI quality on Comfy Cloud (FILM)", p.ai, (on) => env.set({ ai: on }), "Makes the frames in between with an AI model instead of ffmpeg"),
    p.ai ? whereLine("vfx-slowmo", p) : note("Smooth slow motion takes clips of up to 30 seconds on this machine."),
    ...(p.ai ? more("vfx-slowmo", p, env) : []),
  ],
  "vfx-weather": (p, i, env) => [
    line("Weather", seg([["rain", "Rain"], ["snow", "Snow"], ["fog", "Fog"]], p.kind, (v) => env.set({ kind: v, angle: v === "snow" ? 6 : v === "rain" ? 10 : 0 }), "Which weather")),
    line("Amount", slider({ value: p.amount, min: 0, max: 1, step: 0.01, show: pct, set: (v, q) => env.set({ amount: v }, q), label: "How much" })),
    line("Speed", slider({ value: p.speed, min: 0.2, max: 3, step: 0.05, show: (v) => `${v.toFixed(2)}×`, set: (v, q) => env.set({ speed: v }, q), label: "How fast" })),
    p.kind === "fog" ? null : line("Slant", slider({ value: p.angle, min: -40, max: 40, step: 1, show: (v) => `${v}°`, set: (v, q) => env.set({ angle: v }, q), label: "The slant of the fall" })),
    note("An overlay effect: weather drawn over your clip, not a change to the scene."),
  ],
  "vfx-sparks": (p, i, env) => [
    line("Kind", seg([["sparks", "Sparks"], ["embers", "Embers"], ["dust", "Dust"]], p.kind, (v) => env.set({ kind: v, direction: v === "dust" ? "down" : "up" }), "Which particles")),
    line("Amount", slider({ value: p.amount, min: 0, max: 1, step: 0.01, show: pct, set: (v, q) => env.set({ amount: v }, q), label: "How many" })),
    line("Speed", slider({ value: p.speed, min: 0.2, max: 3, step: 0.05, show: (v) => `${v.toFixed(2)}×`, set: (v, q) => env.set({ speed: v }, q), label: "How fast" })),
    line("Direction", seg([["up", "Rising"], ["down", "Falling"]], p.direction, (v) => env.set({ direction: v }))),
    note("An overlay effect: the specks are drawn over your clip."),
  ],
  "vfx-remove": (p, i, env) => [
    line("How", seg([["describe", "Describe it"], ["paint", "Paint a still spot"]], p.how, (v) => env.set({ how: v }), "Name the object and let a model find it, or paint over a spot that does not move")),
    ...(p.how === "paint"
      ? [...maskTools(p, env), note("Free, on this machine. Best on something that stays put: a logo, a sign, a mark on the lens. A person who moves needs Describe it.")]
      : [
        line("Remove", h("input.ut-words.uv-words", { value: p.words ?? "", placeholder: p.engine === "obscura" ? "the crystal glass in the foreground" : "person · car · the dog", "aria-label": "What to remove", dataset: { focus: "vfx-words" }, on: { input: (e) => env.say({ words: e.target.value }) } })),
        p.engine === "obscura" ? null : line("What's left", h("input.ut-words.uv-words", { value: p.after ?? "", placeholder: "an empty street, a bare wall… (the place without it)", "aria-label": "What the place looks like once it is gone", dataset: { focus: "vfx-after" }, on: { input: (e) => env.say({ after: e.target.value }) } })),
        line("Model", chipRow(Object.entries({ void: "VOID", obscura: "Obscura" }), p.engine === "obscura" ? "obscura" : "void", (v) => env.set({ engine: v }), "Which template removes it")),
        whereLine("vfx-remove", p),
        ...more("vfx-remove", p, env),
      ]),
  ],
  "vfx-background": (p, i, env) => [
    line("Result", seg([["new", "A new background"], ["clear", "Clear"]], p.mode, (v) => env.set({ mode: v }), "Put a picture behind the people, or leave the background clear")),
    p.mode === "new" ? pictureWell({ value: p.picture, label: "The new background", pick: (pic) => env.set({ picture: { file: pic.file, url: pic.url, width: pic.width, height: pic.height } }), clear: () => env.set({ picture: null }) }) : null,
    whereLine("vfx-background", p),
    ...more("vfx-background", p, env),
    note(p.mode === "clear" ? "A green screen you filmed is cut out for free with the Green-screen cutout." : "A clip with a real green screen is better cut out for free with the Green-screen cutout."),
  ],
  "vfx-relight": (p, i, env) => [
    line("Works on", seg([["picture", "A picture"], ["clip", "A clip"]], p.mode, (v) => env.set({ mode: v }), "Relight a picture with an open model, or a clip with a partner's")),
    line("Light", h("input.ut-words.uv-words", { value: p.words ?? "", placeholder: "warm golden light from the left", "aria-label": "The light", dataset: { focus: "vfx-words" }, on: { input: (e) => env.say({ words: e.target.value }) } })),
    chipRow(LIGHTS, p.words, (v) => env.set({ words: v })),
    p.mode === "clip" ? pictureWell({ value: p.picture, label: "A picture of the light you want", pick: (pic) => env.set({ picture: { file: pic.file, url: pic.url, width: pic.width, height: pic.height } }), clear: () => env.set({ picture: null }) }) : null,
    whereLine("vfx-relight", p),
    ...more("vfx-relight", p, env),
  ],
  "vfx-restyle": (p, i, env) => [
    line("Style", chipRow(STYLES.map(([v, label]) => [v, label]), p.style, (v) => env.set({ style: v, words: "" }), "The look")),
    line("In your words", h("input.ut-words.uv-words", { value: p.words ?? "", placeholder: STYLES.find((s) => s[0] === p.style)?.[2] ?? "", "aria-label": "Describe the look", dataset: { focus: "vfx-words" }, on: { input: (e) => env.say({ words: e.target.value }) } })),
    line("Model", seg([["open", "Open model"], ["partner", "Partner · Runway"]], p.engine, (v) => env.set({ engine: v }))),
    whereLine("vfx-restyle", p),
    ...more("vfx-restyle", p, env),
  ],
  "vfx-retouch": (p, i, env) => [
    whereLine("vfx-retouch", p),
    ...more("vfx-retouch", p, env),
    note("Pictures only. There is no official template for retouching a clip: it would be one frame at a time and it would flicker."),
  ],
};

/** The controls of a tool. */
export const controlsOf = (id, p, i, env) => (CONTROLS[id]?.(p, i, env) ?? []).filter(Boolean);
export { utensils, TEMPLATES, masks };
