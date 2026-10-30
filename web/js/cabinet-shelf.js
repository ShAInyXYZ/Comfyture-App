// Cabinet's shelves: the outfits and the poses it ships, the formats and backdrops of a picture, and the words a picture is asked
// with. The pictures are Comfyture's own (drawn for it: docs/brand/products/cabinet-v1, MIT like the rest of the repo), so they can
// ship with the app. Pure: no page, no server, so the tests read it as it is.

import { WARDROBE_LIST, POSES_LIST, WARDROBE_GROUPS, POSE_GROUPS } from "./cabinet-library.js";

export { WARDROBE_GROUPS, POSE_GROUPS };
const pic = (kind, id) => ({ src: `brand/cabinet/${kind}/${id}.webp`, thumb: `brand/cabinet/${kind}/${id}.thumb.webp` });

/** The outfits: each a whole look, shown on an invisible mannequin, and said in words too (a model reads both). */
export const WARDROBE = WARDROBE_LIST.map(([id, name, group, words]) => ({ id, name, group, words, ...pic("wardrobe", id) }));
/** The poses: a faceless grey mannequin in each, and the pose said in words. */
export const POSES = POSES_LIST.map(([id, name, group, words]) => ({ id, name, group, words, ...pic("poses", id) }));

/** The items of a shelf that match a search: every word in the name, the words or the group's name, in any order. */
export function find(items, query, groups = {}) {
  const words = String(query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return items;
  return items.filter((it) => {
    const text = `${it.name} ${it.words} ${groups[it.group] ?? ""}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
}

/** What the picture is for: its frame and how it is shot. */
export const FORMATS = {
  post: { name: "Post", aspect: "4:5", about: "A feed post, 4:5", words: "a social media post photo: the character is the clear subject, framed from the knees up or full body, bright and eye-catching" },
  story: { name: "Story", aspect: "9:16", about: "A story or a reel cover, 9:16", words: "a vertical photo for a story: the whole body in frame with room above the head" },
  tryon: { name: "Try-on", aspect: "2:3", about: "A lookbook try-on, 2:3", words: "a fashion lookbook try-on photo: the whole body from head to toe, facing the camera, centred, soft even light, so every piece of the outfit reads clearly" },
  shoot: { name: "Photoshoot", aspect: "3:2", about: "An editorial photo, 3:2", words: "an editorial photoshoot photo: magazine-quality lighting and composition, a shallow depth of field" },
};

/** Where the picture is taken. */
export const BACKDROPS = {
  studio: { name: "Studio", words: "a plain light-grey seamless studio backdrop" },
  colour: { name: "Colour", words: "a seamless studio backdrop in a bold colour that suits the outfit" },
  street: { name: "Street", words: "a city street at golden hour, softly out of focus" },
  cafe: { name: "Café", words: "a cosy café, softly out of focus" },
  park: { name: "Park", words: "a green park in soft daylight, softly out of focus" },
  beach: { name: "Beach", words: "a sunny beach, softly out of focus" },
  night: { name: "Night", words: "a city at night with neon signs, softly out of focus" },
};

/** Pictures made from the shelves with the very words shotPrompt writes (GPT Image, docs/brand/products/cabinet-v1/tries): what a shoot gives. */
export const EXAMPLES = [
  { src: "brand/cabinet/examples/josie.webp", who: "Josie", outfit: "sundress", pose: "twirl", format: "post" },
  { src: "brand/cabinet/examples/bagel.webp", who: "Bagel", outfit: "chef", pose: "wave", format: "tryon" },
  { src: "brand/cabinet/examples/earl.webp", who: "Earl", outfit: "tuxedo", pose: "arms-crossed", format: "shoot" },
];

export const wardrobeItem = (id) => WARDROBE.find((w) => w.id === id) ?? null;
export const poseItem = (id) => POSES.find((p) => p.id === id) ?? null;

/** The most pictures one press makes (every outfit picked, in every pose picked). */
export const MOST = 8;

/** Every outfit picked in every pose picked (none picked: their own clothes, a natural pose), at most MOST. */
export function combos(outfits = [], poses = []) {
  const out = [];
  for (const outfit of outfits.length ? outfits : [null]) for (const pose of poses.length ? poses : [null]) out.push({ outfit, pose });
  return out.slice(0, MOST);
}

/**
 * The words one picture is asked with. who: { name, look }; outfit and pose: a shelf item, or { name } for a picture of one's
 * own (said only by its picture), or null; the pictures go as @character, @outfit and @pose, in that order.
 */
export function shotPrompt({ who, outfit, pose, format = "post", backdrop = "studio", notes = "" }) {
  const f = FORMATS[format] ?? FORMATS.post;
  const b = BACKDROPS[backdrop] ?? BACKDROPS.studio;
  const name = who?.name || "the character";
  const look = who?.look ? ` (${who.look})` : "";
  const wearing = outfit
    ? `wearing, in place of their usual clothes, the outfit shown in @outfit${outfit.words ? `: ${outfit.words}` : ""}. Fit every piece to their body and keep its colours, fabrics and details`
    : "in their own clothes";
  const posed = pose
    ? `Pose them exactly like the figure in @pose${pose.words ? ` (${pose.words})` : ""}: copy the body position, the arms, the legs and the turn of the head, but never draw the grey figure itself; anything it holds or sits on is drawn as the real thing`
    : "Give them a natural, flattering pose";
  const extra = String(notes ?? "").trim();
  return [
    `${f.words[0].toUpperCase()}${f.words.slice(1)}.`,
    `It shows ${name} from @character${look}, ${wearing}.`,
    `${posed}.`,
    `The backdrop: ${b.words}.`,
    `Keep ${name} exactly themself: the same face, ${who?.person ? "hair, skin" : "hair or fur, markings"}, colours and proportions, and their own rendering style (a 3D animated character stays 3D animated, a photograph stays a photograph). Only one ${name} in the picture.`,
    extra ? `Also: ${extra}` : "",
  ].filter(Boolean).join(" ");
}
