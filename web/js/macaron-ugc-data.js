// UGC stories, the plain part (no imports): who tells it, the beats a story is made of, what each beat's picture and take
// are asked for in words, what it costs and how a story written by Brioche is checked. A story is kept with the brand
// (body.ugc) as { id, name, persona, activity, hook, beats: [{ id, kind, line, doing, camera, setting, seconds, picture, take }], at }:
// `activity` is what the creator does through the whole story and each beat's `doing` the step of it in that shot, so the
// viewer watches something happen while they listen (a beat with no `doing` is the plain shot of the product in hand).
// web/js/macaron-ugc.js draws it and makes it; web/js/brioche/space-studio.js reads the same ids when Brioche writes one.

/**
 * The creators: who tells the story, with the words a picture model is given to draw them the same in every shot, and their
 * routine: something real they do through the whole story while they talk (a task that moves on at every beat and pays off at
 * the end), so a story is never a still talking head. Each step says what they do in that beat, the camera and the place; a
 * step that names @product is a shot the product is in.
 */
export const PERSONAS = [
  { id: "maya", name: "Maya", vibe: "Warm & real", portrait: "brand/macaron/personas/maya.webp", look: "a young East Asian woman around 25 with long dark hair, a cream knit jumper, a warm natural smile",
    routine: { activity: "doing her makeup at her vanity", setting: "vanity", steps: {
      hook: { doing: "dabbing concealer under her eyes at her vanity, talking to the camera through the mirror", camera: "mirror" },
      show: { doing: "blending blush onto her cheek with a soft brush, @product on the vanity beside her", camera: "mirror" },
      taste: { doing: "trying @product as the next step of her routine, brushes laid out around her", camera: "close" },
      react: { doing: "pressing on her lipstick, then turning to the camera to show the finished look", camera: "mirror" },
      cta: { doing: "switching off the ring light and smiling at the camera, the look done", camera: "tripod" },
    } } },
  { id: "leo", name: "Leo", vibe: "Casual & fun", portrait: "brand/macaron/personas/leo.webp", look: "a young man around 24 with curly dark hair, light stubble and a denim shirt, a cheeky grin",
    routine: { activity: "walking through the city on his way somewhere", setting: "street", steps: {
      hook: { doing: "walking toward the camera down a busy morning street, phone held out at arm's length", camera: "walk" },
      show: { doing: "still walking, holding up @product to the lens as shop fronts slide past", camera: "walk" },
      taste: { doing: "waiting at a crossing, trying @product while the light is red", camera: "follow" },
      react: { doing: "crossing the street with a grin, passers-by and traffic behind him", camera: "walk" },
      cta: { doing: "arriving at his door, turning back to the camera with a nod", camera: "follow" },
    } } },
  { id: "emma", name: "Emma", vibe: "Mum life", portrait: "brand/macaron/personas/emma.webp", look: "a woman around 34 with her light brown hair in a loose bun, a soft cardigan, a tender happy smile",
    routine: { activity: "making her baby's bottle in the kitchen", setting: "kitchen", steps: {
      hook: { doing: "scooping formula into a baby bottle at the kitchen counter, glancing up at the camera", camera: "close" },
      show: { doing: "pouring warm water into the baby bottle, @product on the counter beside the kettle", camera: "shoulder" },
      taste: { doing: "shaking the baby bottle with one hand and trying @product with the other", camera: "tripod" },
      react: { doing: "testing a drop of milk from the baby bottle on her wrist, then smiling at the camera", camera: "close" },
      cta: { doing: "picking up the baby bottle and walking toward the nursery, looking back at the camera", camera: "follow" },
    } } },
];

/** The beats of a story, in their order: what each is for and how long it lasts by default. */
export const BEATS = [
  { id: "hook", name: "Hook", seconds: 4, what: "the first two seconds: stop the scroll with one line and the product in hand" },
  { id: "show", name: "Show", seconds: 6, what: "show what it is, plainly" },
  { id: "taste", name: "Try", seconds: 6, what: "use it: the moment of trying, while the routine goes on" },
  { id: "react", name: "React", seconds: 6, what: "the honest reaction" },
  { id: "cta", name: "Call to action", seconds: 5, what: "one clear thing to do next" },
];
export const BEAT_IDS = BEATS.map((b) => b.id);
export const beatKind = (id) => BEATS.find((b) => b.id === id) ?? BEATS[0];

/** How the shot is filmed (words for its picture, and how the camera moves in its take), and where. */
export const CAMERAS = [
  { id: "selfie", name: "Handheld selfie", words: "a handheld phone selfie, slightly wide, the arm just out of frame", move: "handheld selfie, a slight natural sway" },
  { id: "walk", name: "Walk and talk", words: "a walk-and-talk phone selfie, the phone held out in front at arm's length, the street moving behind", move: "handheld, moving with them as they walk, a gentle bob in step" },
  { id: "follow", name: "Following", words: "filmed by a friend a step to the side, following them, a casual handheld look", move: "handheld, following beside them as they move" },
  { id: "shoulder", name: "Over the shoulder", words: "filmed over the shoulder, a casual handheld look", move: "handheld over the shoulder, small natural movements" },
  { id: "close", name: "Close-up", words: "a close-up on the hands at work and what they hold, shallow depth of field", move: "close and handheld, staying on the hands" },
  { id: "mirror", name: "In the mirror", words: "filmed from beside the mirror, their face and its reflection both in frame", move: "steady beside the mirror, a slight drift" },
  { id: "tripod", name: "Phone on a stand", words: "a phone propped on a stand, steady, framed at waist height", move: "static on a stand" },
];
export const SETTINGS = [
  { id: "kitchen", name: "Cosy kitchen", words: "in a cosy sunlit kitchen" },
  { id: "street", name: "City street", words: "on a busy city street in the morning, shop fronts and passers-by behind" },
  { id: "vanity", name: "Makeup vanity", words: "at a makeup vanity with a ring light, brushes and palettes laid out" },
  { id: "workshop", name: "Their workshop", words: "in a small workshop or studio of their own, work in progress around them" },
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

/** A new story with the five beats: the persona, a hook, and for each beat a line, what they do (their routine), a camera and a setting. */
export function newStory({ persona = "maya", productName = "this", features = [], name, character = null } = {}) {
  const lines = starterLines(productName, features);
  const told = persona === CHARACTER_ID && character ? { persona: CHARACTER_ID, character: cleanCharacter(character) } : { persona: personaOf(persona).id };
  // (a creator of the library brings their routine; the brand's character starts with the plain shots, the person says what it does)
  const routine = told.persona === CHARACTER_ID ? null : personaOf(told.persona).routine;
  return {
    id: id("u"),
    name: name ?? `${whoOf(told).name}'s story`,
    ...told,
    activity: routine?.activity ?? "",
    hook: lines.hook,
    beats: BEATS.map((b) => ({
      id: id("b"), kind: b.id, line: lines[b.id], seconds: b.seconds,
      doing: routine?.steps[b.id]?.doing ?? "",
      camera: routine?.steps[b.id]?.camera ?? (b.id === "show" ? "tripod" : b.id === "taste" ? "close" : "shoulder"),
      setting: routine?.setting ?? "kitchen", picture: null, take: null,
    })),
    at: new Date().toISOString(),
  };
}

/** Whether a beat's shot has the product in it: one that says what they do has it only where it names @product. */
export const showsProduct = (beat) => !String(beat?.doing ?? "").trim() || /@product/.test(beat.doing);

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
  // (what they do in this beat, when the story says it, is the shot: caught mid-action, never posing with the product)
  const doing = String(beat.doing ?? "").trim();
  return [
    first,
    doing ? `${who.name} is ${doing}, caught mid-action and natural, not posing${/camera|lens|mirror/.test(doing) ? "" : `, glancing at the camera as ${who.creature ? "it talks" : "they talk"}`}.` : `${who.name} is ${act}.`,
    // (what the product is known for helps a product held up to the lens; in a shot of the routine it ends up printed on the props)
    showsProduct(beat) ? `The product exactly as in @product (its shape, label and colours kept true and legible).${features[0] && !doing ? ` It is known for: ${features.slice(0, 2).join(", ")}.` : ""}` : "",
    `Authentic social-video look, soft natural light, no added text, no extra logos, no watermark, no writing or labels on any object${showsProduct(beat) ? " except what @product itself shows" : ""}.`,
  ].filter(Boolean).join(" ");
}

/** What the beat's take does, and says: for the app's video action (a move, and the creator's own line). */
export function beatTake(story, beat) {
  const kind = beatKind(beat.kind);
  const who = whoOf(story);
  // a beat that says what they do: they keep doing it as they talk, and the camera moves as the beat's camera does
  // ("keeps still walking" reads as "keeps walking")
  const doing = String(beat.doing ?? "").replace(/@product/g, "the product").trim().replace(/^still\s+/i, "");
  if (doing) {
    const voice = !who.character || who.mode === "talk" ? "talking to the camera as they go" : who.mode === "sing" ? "humming softly as it goes" : "miming the words as it goes";
    return { action: `${who.name} keeps ${doing}, ${voice}; the movement carries on through the whole shot.`, camera: cameraOf(beat.camera).move, line: who.character && who.mode === "mime" ? "" : beat.line };
  }
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
  const activity = text(raw.activity, 120);
  const beats = (Array.isArray(raw.beats) ? raw.beats : []).slice(0, 8).map((b) => {
    const kind = BEAT_IDS.includes(b?.kind) ? b.kind : null;
    if (!kind) return null;
    const line = text(b.line, 140);
    const secs = Number(b.seconds);
    return {
      kind, line, doing: text(b.doing, 160),
      camera: byName(CAMERAS, b.camera)?.id ?? undefined,
      setting: byName(SETTINGS, b.setting)?.id ?? undefined,
      seconds: Number.isFinite(secs) ? Math.min(10, Math.max(2, Math.round(secs))) : undefined,
    };
  }).filter(Boolean);
  return { persona, hook, activity, beats };
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
  if (clean.activity) base.activity = clean.activity;
  for (const b of clean.beats) {
    const mine = base.beats.find((x) => x.kind === b.kind);
    if (mine) {
      if (b.line) mine.line = b.line;
      if (b.doing) mine.doing = b.doing;
      if (b.camera) mine.camera = b.camera;
      if (b.setting) mine.setting = b.setting;
      if (b.seconds) mine.seconds = b.seconds;
    } else {
      base.beats.push({ id: id("b"), kind: b.kind, line: b.line, doing: b.doing ?? "", seconds: b.seconds ?? beatKind(b.kind).seconds, camera: b.camera ?? "shoulder", setting: b.setting ?? "kitchen", picture: null, take: null });
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
