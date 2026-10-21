// UGC stories, the plain part (no imports): who tells it, the beats a story is made of, what each beat's picture and take
// are asked for in words, what it costs and how a story written by Brioche is checked. A story is kept with the brand
// (body.ugc) as { id, name, persona, hook, beats: [{ id, kind, line, camera, setting, seconds, picture, take }], at }.
// web/js/macaron-ugc.js draws it and makes it; server/macaron-studio.ts reads the same ids when Brioche writes one.

/** The creators: who tells the story, with the words a picture model is given to draw them the same in every shot. */
export const PERSONAS = [
  { id: "maya", name: "Maya", vibe: "Warm & real", portrait: "brand/macaron/personas/maya.webp", look: "a young East Asian woman around 25 with long dark hair, a cream knit jumper, a warm natural smile" },
  { id: "leo", name: "Leo", vibe: "Casual & fun", portrait: "brand/macaron/personas/leo.webp", look: "a young man around 24 with curly dark hair, light stubble and a denim shirt, a cheeky grin" },
  { id: "emma", name: "Emma", vibe: "Mum life", portrait: "brand/macaron/personas/emma.webp", look: "a woman around 34 with her light brown hair in a loose bun, a soft cardigan, a tender happy smile" },
];

/** The beats of a story, in their order: what each is for and how long it lasts by default. */
export const BEATS = [
  { id: "hook", name: "Hook", seconds: 4, what: "the first two seconds: stop the scroll with one line and the product in hand" },
  { id: "show", name: "Show", seconds: 6, what: "show what it is, plainly" },
  { id: "taste", name: "Taste", seconds: 6, what: "use it: the moment of trying" },
  { id: "react", name: "React", seconds: 6, what: "the honest reaction" },
  { id: "cta", name: "Call to action", seconds: 5, what: "one clear thing to do next" },
];
export const BEAT_IDS = BEATS.map((b) => b.id);
export const beatKind = (id) => BEATS.find((b) => b.id === id) ?? BEATS[0];

/** How the shot is filmed, and where. */
export const CAMERAS = [
  { id: "selfie", name: "Handheld selfie", words: "a handheld phone selfie, slightly wide, the arm just out of frame" },
  { id: "shoulder", name: "Over the shoulder", words: "filmed over the shoulder, a casual handheld look" },
  { id: "close", name: "Close-up", words: "a close-up on the hands and the product, shallow depth of field" },
  { id: "tripod", name: "Phone on a stand", words: "a phone propped on a stand, steady, framed at waist height" },
];
export const SETTINGS = [
  { id: "kitchen", name: "Cosy kitchen", words: "in a cosy sunlit kitchen" },
  { id: "desk", name: "Desk at home", words: "at a tidy desk at home" },
  { id: "balcony", name: "Sunny balcony", words: "on a sunny balcony with plants" },
  { id: "cafe", name: "Café table", words: "at a café table by a window" },
];
const byName = (list, v) => list.find((x) => x.id === v || x.name.toLowerCase() === String(v ?? "").toLowerCase());
export const cameraOf = (v) => byName(CAMERAS, v) ?? CAMERAS[0];
export const settingOf = (v) => byName(SETTINGS, v) ?? SETTINGS[0];
export const personaOf = (id) => PERSONAS.find((p) => p.id === id) ?? PERSONAS[0];

let n = 0;
const id = (p) => `${p}${Date.now().toString(36)}${(n++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** The lines a story starts with, written from the product and the brand's voice (Brioche rewrites them when asked). */
export function starterLines(productName = "this", features = []) {
  const what = features[0] ? ` ${features[0]}.` : "";
  return {
    hook: `Okay, I finally tried ${productName}...`,
    show: `So this is ${productName}.${what}`.trim(),
    taste: "Look at that. Just look at it.",
    react: "Honestly? So good.",
    cta: "Go and try it, you will see.",
  };
}

/** A new story with the five beats: the persona, a hook, and a line, a camera and a setting for each. */
export function newStory({ persona = "maya", productName = "this", features = [], name } = {}) {
  const lines = starterLines(productName, features);
  return {
    id: id("u"),
    name: name ?? `${personaOf(persona).name}'s story`,
    persona: personaOf(persona).id,
    hook: lines.hook,
    beats: BEATS.map((b) => ({
      id: id("b"), kind: b.id, line: lines[b.id], seconds: b.seconds,
      camera: b.id === "show" ? "tripod" : b.id === "taste" ? "close" : "selfie",
      setting: "kitchen", picture: null, take: null,
    })),
    at: new Date().toISOString(),
  };
}

/** The words a beat's picture is drawn from: the creator, the setting, the camera and what the beat is, with the product given as @product. */
export function beatPrompt(story, beat, { productName = "the product", brandName = "", features = [] } = {}) {
  const who = personaOf(story.persona);
  const kind = beatKind(beat.kind);
  const act = {
    hook: `holding @product up next to their face toward the camera, about to tell the viewer something, ${brandName ? `${brandName}'s ` : ""}${productName} clearly visible`,
    show: `showing @product to the camera with both hands, the label turned toward the lens, a calm explaining look`,
    taste: `using @product for the first time, the moment of trying it, close and natural`,
    react: `reacting to @product with honest delight, eyes soft, @product still in frame`,
    cta: `holding @product toward the camera with a friendly invitation, ready to say goodbye`,
  }[kind.id];
  return [
    `A natural vertical phone photo of the same real person as in @creator (${who.look}), ${settingOf(beat.setting).words}, ${cameraOf(beat.camera).words}.`,
    `${who.name} is ${act}.`,
    `The product exactly as in @product (its shape, label and colours kept true and legible).${features[0] ? ` It is known for: ${features.slice(0, 2).join(", ")}.` : ""}`,
    "Authentic social-video look, soft natural light, no added text, no extra logos, no watermark.",
  ].join(" ");
}

/** What the beat's take does, and says: for the app's video action (a move, and the creator's own line). */
export function beatTake(story, beat) {
  const kind = beatKind(beat.kind);
  const action = {
    hook: "They bring the product up beside their face, look into the camera and begin to talk, with a small smile.",
    show: "They turn the product slowly in their hands toward the camera and explain it, nodding.",
    taste: "They try the product and the camera stays close on the moment, a small natural movement.",
    react: "They react with honest delight and say how it is, a little head tilt, a laugh.",
    cta: "They point gently at the camera and wave goodbye with a warm smile.",
  }[kind.id];
  return { action, camera: "handheld", line: beat.line };
}

/** Whole seconds a story lasts. */
export const storyLength = (story) => story.beats.reduce((t, b) => t + (Number(b.seconds) || 0), 0);

/**
 * Roughly what making a story costs, in Comfy credits: a picture and a take for each beat. `pic` is a picture's price and
 * `perSecond` a take's price per second (the same figures the shoot's own estimate uses).
 */
export function storyCost(story, { pic = 8, perSecond = 18 * 0.266 } = {}) {
  const beats = story.beats.length;
  return Math.max(1, Math.round(beats * pic + story.beats.reduce((t, b) => t + (Number(b.seconds) || 5) * perSecond, 0)));
}
export const beatCost = (beat, { pic = 8, perSecond = 18 * 0.266 } = {}) => Math.max(1, Math.round(pic + (Number(beat.seconds) || 5) * perSecond));

/** A story as Brioche writes it, checked: a known persona, beats of known kinds with short lines, camera and setting ids, seconds in range. */
export function cleanStory(raw = {}, current = null) {
  const persona = PERSONAS.some((p) => p.id === raw.persona) ? raw.persona : current?.persona ?? PERSONAS[0].id;
  // (text is text: a number or an object where words should be is no words)
  const text = (v, n) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");
  const hook = text(raw.hook, 120);
  const beats = (Array.isArray(raw.beats) ? raw.beats : []).slice(0, 8).map((b) => {
    const kind = BEAT_IDS.includes(b?.kind) ? b.kind : null;
    if (!kind) return null;
    const line = text(b.line, 140);
    const secs = Number(b.seconds);
    return {
      kind, line,
      camera: byName(CAMERAS, b.camera)?.id ?? undefined,
      setting: byName(SETTINGS, b.setting)?.id ?? undefined,
      seconds: Number.isFinite(secs) ? Math.min(10, Math.max(2, Math.round(secs))) : undefined,
    };
  }).filter(Boolean);
  return { persona, hook, beats };
}

/**
 * Brioche's story put into the brand's stories: the open one, changed in place, when she was writing for it, else a new one put
 * first in the list. Beats of a kind the story has take her line (and keep their pictures, a changed line is not a changed
 * picture); kinds it lacks are added in order. Answers the story (new or changed).
 */
export function applyStory(list, draft, { current = null, productName = "this", features = [] } = {}) {
  const clean = cleanStory(draft, current);
  // (the open story is changed where it stands: it is the one the brand keeps)
  const base = current ?? newStory({ persona: clean.persona, productName, features });
  if (clean.persona) base.persona = clean.persona;
  if (clean.hook) base.hook = clean.hook;
  for (const b of clean.beats) {
    const mine = base.beats.find((x) => x.kind === b.kind);
    if (mine) {
      if (b.line) mine.line = b.line;
      if (b.camera) mine.camera = b.camera;
      if (b.setting) mine.setting = b.setting;
      if (b.seconds) mine.seconds = b.seconds;
    } else {
      base.beats.push({ id: id("b"), kind: b.kind, line: b.line, seconds: b.seconds ?? beatKind(b.kind).seconds, camera: b.camera ?? "selfie", setting: b.setting ?? "kitchen", picture: null, take: null });
    }
  }
  // the hook is the first beat's line
  const first = base.beats.find((x) => x.kind === "hook");
  if (first && clean.hook) first.line = clean.hook;
  base.beats.sort((a, c) => BEAT_IDS.indexOf(a.kind) - BEAT_IDS.indexOf(c.kind));
  if (!current) list.unshift(base);
  base.at = new Date().toISOString();
  return base;
}
