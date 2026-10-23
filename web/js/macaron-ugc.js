// UGC stories, the page's side: the stories a brand keeps (body.ugc), changing them, and making one: for each beat a picture
// of the creator with the product (an image model on Comfy Router, the creator's portrait and the product given as references so
// the same person and jar come back in every shot) and then a take from that picture (the app's own video action, the
// creator's line spoken). Nothing here spends anything by itself: the window asks first, with the price. The plain part
// (personas, beats, prompts, cost, checking a story Brioche wrote) is macaron-ugc-data.js.
import { toast, waitFor } from "./store.js";
import { api } from "./api.js";
import { macaron, setBrand, makePicture, productNow, uid } from "./macaron.js";
import { newStory, beatPrompt, beatTake, showsProduct, storyCost, beatCost, applyStory, personaOf, whoOf, CHARACTER_ID, cleanCharacter, defaultCharacter, characterPictures, characterNameOf } from "./macaron-ugc-data.js";

/** What the Studio shows of the stories: the one open, and which of its beats. */
export const ugcUi = { story: null, beat: null };

export const storiesOf = (b = macaron.brand) => b?.body.ugc ?? [];
export const storyNow = (b = macaron.brand) => storiesOf(b).find((s) => s.id === ugcUi.story) ?? storiesOf(b)[0] ?? null;
export const beatNow = (story = storyNow()) => story?.beats.find((x) => x.id === ugcUi.beat) ?? story?.beats[0] ?? null;
export const pickStory = (id) => ((ugcUi.story = id), (ugcUi.beat = null), setBrand({}));
export const pickBeat = (id) => ((ugcUi.beat = id), setBrand({}));

const mine = () => macaron.brand.body.ugc;
/** The product a story shows: its own (a brand with several products tells each in its stories), else the brand's current one. */
export const productOf = (story, b = macaron.brand) => b?.body.products.find((p) => p.id === story?.product) ?? productNow(b);
const kept = () => setBrand({ ugc: mine() });

/** A new story told by a creator (or by the brand's own character, from the likeliest of its pictures), with its five beats; it becomes the one open. */
export function startStory(persona = "maya") {
  const b = macaron.brand;
  const p = productNow(b);
  const s = newStory({ persona, productName: p?.name ?? b.name, features: p?.features ?? [], character: persona === CHARACTER_ID ? defaultCharacter(b.body) : null });
  if (p) s.product = p.id;
  mine().unshift(s);
  ugcUi.story = s.id;
  ugcUi.beat = s.beats[0].id;
  kept();
  return s;
}
export function setStory(id, patch) {
  const s = mine().find((x) => x.id === id);
  if (!s) return;
  // (the character is taken up from the brand's pictures the first time it tells a story)
  if (patch.persona === CHARACTER_ID && !s.character) patch = { ...patch, character: defaultCharacter(macaron.brand.body) };
  const was = whoOf(s).name;
  Object.assign(s, patch);
  // (a story still called after its old teller is called after the new one: a name the person wrote stays)
  if ("persona" in patch && s.name === `${was}'s story`) s.name = `${whoOf(s).name}'s story`;
  // the hook is the first beat's line, said once
  if ("hook" in patch) {
    const first = s.beats.find((x) => x.kind === "hook");
    if (first) first.line = patch.hook;
  }
  kept();
}
export function setBeat(storyId, beatId, patch) {
  const s = mine().find((x) => x.id === storyId);
  const bt = s?.beats.find((x) => x.id === beatId);
  if (!bt) return;
  Object.assign(bt, patch);
  if (bt.kind === "hook" && "line" in patch) s.hook = patch.line;
  kept();
}
/** What the brand's character is: its picture, its name, how it looks, how it sounds, whether it is a creature. A story named after it is renamed with it. */
export function setCharacter(id, patch) {
  const s = mine().find((x) => x.id === id);
  if (!s) return;
  const was = whoOf(s).name;
  const merged = { ...(s.character ?? defaultCharacter(macaron.brand.body)), ...patch };
  // (a new picture renames a character whose name was only taken from the picture before: a name the person wrote stays)
  const fromPicture = !s.character || s.character.name === characterNameOf(s.character.pic?.name) || s.character.name === "Character";
  if (patch.pic && !("name" in patch) && fromPicture) merged.name = characterNameOf(patch.pic.name);
  s.character = cleanCharacter(merged);
  s.persona = CHARACTER_ID;
  const now = whoOf(s).name;
  if (s.name === `${was}'s story`) s.name = `${now}'s story`;
  kept();
}
/** The pictures of the brand the character may be drawn from, the likeliest first. */
export const characterChoices = (b = macaron.brand) => characterPictures(b?.body ?? {});
export function removeStory(id) {
  macaron.brand.body.ugc = mine().filter((s) => s.id !== id);
  if (ugcUi.story === id) ugcUi.story = null;
  kept();
}

/** A story Brioche wrote: into the one open (when asked to change it) or a new one. Answers the story, or null for an empty draft. */
export function applyUgcDraft(draft, { fresh = false } = {}) {
  if (!draft || (!draft.hook && !(draft.beats ?? []).length)) return null;
  const p = productOf(storyNow());
  const s = applyStory(mine(), draft, { current: fresh ? null : storyNow(), like: storyNow(), productName: p?.name ?? macaron.brand.name, features: p?.features ?? [] });
  // (a new story shows the product of the one it was written beside)
  if (!s.product && p) s.product = p.id;
  ugcUi.story = s.id;
  ugcUi.beat = ugcUi.beat && s.beats.some((x) => x.id === ugcUi.beat) ? ugcUi.beat : s.beats[0].id;
  kept();
  return s;
}

// ---------------------------------------------------------------- what it costs

/** A picture's price, a take's price per second: the figures the shoot's own estimate uses (a picture 6, a take 18 x 0.266 a second). */
export const PRICE = { pic: 6, perSecond: 18 * 0.266 };
export const costOf = (story, only, price = {}) => (only ? beatCost(only, { ...PRICE, ...price }) : storyCost(story, { ...PRICE, ...price }));

// ---------------------------------------------------------------- making it

export const making = (id) => [...macaron.busy].some((k) => k === `ugc:${id}` || k.startsWith(`ugc:${id}:`));
const tick = () => setBrand({});

/** A picture given to the model as a reference: by its file when the library holds it, else by its url (the creator's portrait ships with the app). */
const give = (pic, name) => (pic.file ? { file: pic.file, name } : { url: pic.url, name });

/**
 * One beat made: its picture, then its take. The picture is the creator in the setting with the product (references: @creator, @product),
 * the take is that picture speaking its line. It stays on the beat as it comes in; a beat that fails says why and the rest go on.
 */
export async function makeBeat(storyId, beatId, { picture = true } = {}) {
  const b = macaron.brand;
  const story = mine().find((x) => x.id === storyId);
  const beat = story?.beats.find((x) => x.id === beatId);
  const p = productOf(story, b);
  if (!beat) return;
  if (!p) return void toast("Add a product to the brand first.");
  const who = whoOf(story);
  if (who.character && !who.portrait) return void toast("Pick your character's picture first.");
  const key = `ugc:${storyId}:${beatId}`;
  if (macaron.busy.has(key)) return;
  macaron.busy.add(key);
  beat.error = null;
  tick();
  try {
    if (picture || !beat.picture) {
      beat.take = null;
      const asset = await makePicture({
        prompt: beatPrompt(story, beat, { productName: p.name, brandName: b.name, features: p.features ?? [] }),
        model: "gpt-image-2.5-flare",
        aspect: "9:16",
        name: `${who.name} · ${beat.kind}`,
        // (the creator is the library's portrait, or the picture of the brand's own character: it is what the same one is drawn from in every shot)
        // (the product's picture goes with the shots it is in: one where they are only at their routine has the creator alone)
        refs: [give(who.character ? { file: who.file, url: who.portrait } : { url: who.portrait }, "creator"), ...(showsProduct(beat) ? [give(p.photo, "product")] : [])],
      });
      beat.picture = { id: asset.id, file: asset.file, url: asset.url, width: asset.width, height: asset.height };
      tick();
    }
    const t = beatTake(story, beat);
    beat.take = { status: "rolling" };
    tick();
    const script = { shots: [{ action: t.action, camera: t.camera, sound: "Natural room sound, a phone microphone.", framing: "", dialogue: t.line ? [{ speaker: who.name, language: "English", line: t.line }] : [] }], raw: "" };
    const [run] = await api.shoot({ name: `${b.name} · ${story.name} · ${beat.kind}`, start: beat.picture.file, seconds: Math.min(8, Math.max(3, Number(beat.seconds) || 5)), aspect: "9:16", review: false, takes: 1, quality: "standard", script });
    beat.take = { status: "rolling", run: run.id };
    tick();
    const done = await waitFor("run", run.id);
    beat.take = { status: "done", run: run.id, video: done.video };
    // the clip joins the project's pictures, so the library has it
    macaron.brand.body.assets.unshift({ id: uid("a"), name: `${who.name} · ${beat.kind}`, kind: "made", url: beat.picture.url, video: done.video, width: beat.picture.width, height: beat.picture.height, source: "made" });
  } catch (e) {
    beat.error = e.message;
    if (beat.take?.status === "rolling") beat.take = { status: "failed", error: e.message };
    toast(e.message, { tone: "crit" });
  } finally {
    macaron.busy.delete(key);
    tick();
  }
}

/** The whole story: every beat at once, each a picture and then its take (the server queues the takes; a beat that fails does not stop the others). */
export async function makeStory(storyId) {
  const story = mine().find((x) => x.id === storyId);
  if (!story || making(storyId)) return;
  const all = `ugc:${storyId}`;
  macaron.busy.add(all);
  tick();
  try {
    // the beats that already have a take are left as they are: only what is missing is made (and paid for)
    await Promise.all(story.beats.filter((x) => x.take?.status !== "done").map((beat) => makeBeat(storyId, beat.id, { picture: !beat.picture })));
  } finally {
    macaron.busy.delete(all);
    tick();
  }
}
/** What making the story would still make and cost: the beats without a finished take. */
export function toMake(story) {
  const left = story.beats.filter((x) => x.take?.status !== "done");
  return { left, credits: left.reduce((t, x) => t + (x.picture ? beatCost({ seconds: x.seconds }, { pic: 0, perSecond: PRICE.perSecond }) : costOf(story, x)), 0) };
}
