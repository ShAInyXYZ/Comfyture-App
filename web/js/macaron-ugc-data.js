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

// ---------------------------------------------------------------- the brand's own character

/** The id of the fourth storyteller: not a creator of the library but the brand's own character (a mascot, a creature, a person it has pictured). */
export const CHARACTER_ID = "character";
/** How a character talks, read from the person's own voice note: it talks, it sings or hums, or it only mimes (a creature that cannot talk). */
export function voiceMode(note = "") {
  const t = String(note ?? "");
  // (a character that sings but cannot talk sings: only one that mimes, or is silent, mimes)
  if (/\b(mime|mimes|miming|silent|mute|wordless)\b/i.test(t)) return "mime";
  if (/\b(sing|sings|singing|hum|hums|humming|song|melod|chant|coo|coos)/i.test(t)) return "sing";
  if (/\b(no voice|cannot talk|can't talk|doesn't talk|does not talk|never talks)\b/i.test(t)) return "mime";
  return "talk";
}
const cleanText = (v, n) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");
/** A character as it is kept on a story: its name, a line on how it looks, a note on how it sounds, whether it is a creature, and the picture it is drawn from. */
export function cleanCharacter(raw = {}) {
  const pic = raw.pic && typeof raw.pic.url === "string" && raw.pic.url ? { id: raw.pic.id ?? null, url: raw.pic.url.slice(0, 400), file: typeof raw.pic.file === "string" ? raw.pic.file.slice(0, 120) : null, name: cleanText(raw.pic.name, 60) } : null;
  return { name: cleanText(raw.name, 30) || "Character", look: cleanText(raw.look, 200), voice: cleanText(raw.voice, 80), kind: raw.kind === "person" ? "person" : "creature", pic };
}
/** Who tells a story, as the prompts and the window need it: a creator of the library, or the brand's character (its picture, its words, how it sounds). */
export function whoOf(story) {
  if (story?.persona === CHARACTER_ID && story.character) {
    const c = cleanCharacter(story.character);
    return { id: CHARACTER_ID, character: true, name: c.name, vibe: c.voice || "Your character", portrait: c.pic?.url ?? null, file: c.pic?.file ?? null, look: c.look, creature: c.kind === "creature", mode: voiceMode(c.voice) };
  }
  const p = personaOf(story?.persona);
  return { ...p, character: false, creature: false, mode: "talk", file: null };
}

/** The pictures of a brand a character may be drawn from, the likeliest first: mascots, then pictures named like a character, a portrait or a sheet, then the rest. */
export function characterPictures(body = {}) {
  // (the names a mascot has on the moodboard: "Taro, the cast sheet" names Taro)
  const names = new Set((body.refs ?? []).filter((r) => r.kind === "mascot").map((r) => String(r.title ?? "").split(/[\s,]+/)[0].toLowerCase()).filter((w) => w.length > 2));
  const seen = new Set();
  const out = [];
  const add = (url, name, kind, id) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    const n = String(name ?? "");
    const first = n.split(/[\s,]+/)[0].toLowerCase();
    // (a portrait draws the character better than a sheet of eight small views of it)
    const score = (kind === "mascot" ? 2 : 0) + (names.has(first) ? 2 : 0) + (/\b(mascot|character|portrait|hero)\b/i.test(n) ? 2 : 0) - (/\b(sheet|lineup|line-up|cast)\b/i.test(n) ? 2 : 0);
    out.push({ id: id ?? null, url, file: /^\/media\/photos\/([^/?#]+)$/.exec(url)?.[1] ?? null, name: n, kind, score });
  };
  for (const a of body.assets ?? []) if (a.url && !a.video) add(a.url, a.name, a.kind, a.id);
  for (const r of body.refs ?? []) if (r.src && r.kind === "mascot") add(r.src, r.title, "mascot", null);
  return out.sort((a, c) => c.score - a.score);
}
/** What a picture's name says the character is called: its first word, as a name. */
export const characterNameOf = (name = "") => {
  const w = String(name).split(/[\s,]+/).find((x) => /[a-z]/i.test(x)) ?? "";
  return w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : "Character";
};
/** A character made from one of the brand's pictures (the likeliest when none is named). */
export function defaultCharacter(body = {}, pic = characterPictures(body)[0]) {
  return cleanCharacter({ name: characterNameOf(pic?.name), look: "", voice: "", kind: "creature", pic: pic ? { id: pic.id, url: pic.url, file: pic.file, name: pic.name } : null });
}

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
export function newStory({ persona = "maya", productName = "this", features = [], name, character = null } = {}) {
  const lines = starterLines(productName, features);
  const told = persona === CHARACTER_ID && character ? { persona: CHARACTER_ID, character: cleanCharacter(character) } : { persona: personaOf(persona).id };
  return {
    id: id("u"),
    name: name ?? `${whoOf(told).name}'s story`,
    ...told,
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
  const who = whoOf(story);
  const kind = beatKind(beat.kind);
  const their = who.creature ? "its" : "their";
  const act = {
    hook: `holding @product up next to ${their} face toward the camera, about to tell the viewer something, ${brandName ? `${brandName}'s ` : ""}${productName} clearly visible`,
    show: `showing @product to the camera with both hands, the label turned toward the lens, a calm explaining look`,
    taste: `using @product for the first time, the moment of trying it, close and natural`,
    react: `reacting to @product with honest delight, eyes soft, @product still in frame`,
    cta: `holding @product toward the camera with a friendly invitation, ready to say goodbye`,
  }[kind.id];
  // (the brand's own character is drawn as the picture of it, in the person's own words, never as "a young person")
  const first = who.character
    ? `A natural vertical phone-style photo of the same character as in @creator${who.look ? ` (${who.look})` : ""}, kept exactly as pictured (its shape, colours, markings and accessory), ${settingOf(beat.setting).words}, ${cameraOf(beat.camera).words}.${who.creature ? " It is an animal character: it keeps its own body and holds things in its paws, with no human hands, clothes or face." : ""}`
    : `A natural vertical phone photo of the same real person as in @creator (${who.look}), ${settingOf(beat.setting).words}, ${cameraOf(beat.camera).words}.`;
  return [
    first,
    `${who.name} is ${act}.`,
    `The product exactly as in @product (its shape, label and colours kept true and legible).${features[0] ? ` It is known for: ${features.slice(0, 2).join(", ")}.` : ""}`,
    "Authentic social-video look, soft natural light, no added text, no extra logos, no watermark.",
  ].join(" ");
}

/** What the beat's take does, and says: for the app's video action (a move, and the creator's own line). */
export function beatTake(story, beat) {
  const kind = beatKind(beat.kind);
  const who = whoOf(story);
  if (who.character) {
    const hands = who.creature ? "paws" : "hands";
    const its = who.creature ? "its" : "their";
    // (how it sounds, by its voice note: a creature that cannot talk hums, sings or mimes; a mimed line is not given as speech)
    const say = { talk: "begins to talk", sing: "begins to sing softly", mime: "mimes the words without a sound" }[who.mode];
    const react = { talk: "says how it is", sing: "hums a happy little tune", mime: "mimes how good it is" }[who.mode];
    const bye = { talk: "waves goodbye", sing: "sings a last soft note", mime: "waves goodbye" }[who.mode];
    const action = {
      hook: `${who.name} brings the product up beside ${its} face, looks into the camera and ${say}, with a small smile.`,
      show: `${who.name} turns the product slowly in ${its} ${hands} toward the camera and shows it, nodding${who.mode === "mime" ? "" : ", softly " + (who.mode === "sing" ? "singing" : "talking")}.`,
      taste: `${who.name} tries the product and the camera stays close on the moment, a small natural movement.`,
      react: `${who.name} reacts with honest delight, a little head tilt, and ${react}.`,
      cta: `${who.name} holds the product toward the camera, and ${bye}.`,
    }[kind.id];
    return { action, camera: "handheld", line: who.mode === "mime" ? "" : beat.line };
  }
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
export function cleanStory(raw = {}, current = null, like = current) {
  // (the brand's character tells a story only when a story of the brand has one: Brioche never makes the character, the person picks its picture)
  const persona = PERSONAS.some((p) => p.id === raw.persona) ? raw.persona : raw.persona === CHARACTER_ID && like?.character ? CHARACTER_ID : current?.persona ?? PERSONAS[0].id;
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
export function applyStory(list, draft, { current = null, productName = "this", features = [], like = current } = {}) {
  const clean = cleanStory(draft, current, like);
  // (the open story is changed where it stands: it is the one the brand keeps; a new one told by the character takes the character of the open one)
  const base = current ?? newStory({ persona: clean.persona, productName, features, character: clean.persona === CHARACTER_ID ? like?.character : null });
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
