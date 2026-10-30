// Cabinet's shelves: the outfits and the poses it ships, the formats and backdrops of a picture, and the words a picture is asked
// with. The pictures are Comfyture's own (drawn for it: docs/brand/products/cabinet-v1, MIT like the rest of the repo), so they can
// ship with the app. Pure: no page, no server, so the tests read it as it is.

const pic = (kind, id) => ({ src: `brand/cabinet/${kind}/${id}.webp`, thumb: `brand/cabinet/${kind}/${id}.thumb.webp` });

/** The outfits: each a whole look, shown on an invisible mannequin, and said in words too (a model reads both). */
export const WARDROBE = [
  ["denim-tee", "Everyday denim", "everyday", "a plain white t-shirt tucked into light-wash straight jeans with a brown belt, white sneakers"],
  ["cardigan", "Cosy knit", "everyday", "a chunky cream cable-knit cardigan over a beige knit top, brown corduroy trousers, brown loafers"],
  ["sundress", "Floral sundress", "everyday", "a butter-yellow daisy-print midi sundress, tan sandals, a straw tote"],
  ["hoodie", "Oversized hoodie", "street", "an oversized acid-yellow hoodie, black cargo trousers, chunky sneakers, a black beanie"],
  ["varsity", "Varsity jacket", "street", "a plum varsity jacket with cream sleeves, a white tee, black jeans, white high-tops"],
  ["tracksuit", "Retro tracksuit", "street", "a teal tracksuit with two white side stripes, white running sneakers"],
  ["suit", "Camel suit", "smart", "a camel double-breasted suit, a cream silk shirt open at the collar, brown loafers"],
  ["blazer", "Navy office", "smart", "a navy blazer, a white shirt, grey pleated trousers, black derby shoes, a black briefcase"],
  ["trench", "Trench coat", "smart", "a beige belted trench coat over a black turtleneck, black trousers, black ankle boots"],
  ["gown", "Emerald gown", "evening", "a floor-length emerald satin gown, gold strappy heels, a gold clutch"],
  ["tuxedo", "Black tie", "evening", "a black tuxedo with satin lapels, a white dress shirt, a black bow tie, patent shoes"],
  ["sequin", "Party sequins", "evening", "a short long-sleeved silver sequin party dress, silver heels"],
  ["puffer", "Winter puffer", "seasons", "a glossy red puffer jacket, a chunky cream scarf, dark jeans, brown snow boots, red mittens"],
  ["linen", "Linen summer", "seasons", "a loose white linen shirt with rolled sleeves, sand linen shorts, espadrilles, a wide straw hat"],
  ["yoga", "Yoga set", "seasons", "a lilac zip-front sports top and lilac leggings, white trainers, a rolled yoga mat"],
  ["chef", "Chef whites", "costume", "a white double-breasted chef's jacket, a long white apron, a tall white toque, grey check trousers, black shoes"],
  ["pirate", "Pirate captain", "costume", "a long burgundy frock coat with gold buttons, a ruffled cream shirt, black breeches, tall boots, a black tricorn hat"],
  ["astronaut", "Astronaut", "costume", "a white spacesuit with a chest control box, white moon boots, a round helmet with a gold visor"],
  ["wizard", "Wizard", "costume", "a midnight-blue robe with gold stars and moons, a tall pointed hat, brown boots, a wooden staff"],
  ["yukata", "Summer yukata", "costume", "an indigo bellflower-print yukata with a mustard obi, wooden geta sandals"],
].map(([id, name, group, words]) => ({ id, name, group, words, ...pic("wardrobe", id) }));

/** The poses: a faceless grey mannequin in each, and the pose said in words. */
export const POSES = [
  ["stand-relaxed", "Relaxed stand", "standing", "standing relaxed, weight on one leg, arms loose at the sides"],
  ["hand-hip", "Hand on hip", "standing", "one hand on the hip with the elbow out, hips slightly cocked, head tilted"],
  ["arms-crossed", "Arms crossed", "standing", "feet apart, arms folded across the chest, chin up"],
  ["pockets", "Hands in pockets", "standing", "both hands in the front pockets, shoulders relaxed, one foot forward"],
  ["over-shoulder", "Over the shoulder", "standing", "turned away from the camera, looking back over the shoulder, a hand on the hip"],
  ["profile", "Profile", "standing", "standing tall in side view, chin slightly raised"],
  ["walk", "Runway walk", "moving", "walking toward the camera mid-stride like on a catwalk, arms swinging"],
  ["jump", "Jump for joy", "moving", "jumping with both feet off the ground, both arms thrown up in a V"],
  ["twirl", "Twirl", "moving", "spinning on one foot, the other leg lifted behind, one arm out and one curved over the head"],
  ["wave", "Wave hello", "social", "waving at the camera with one arm raised high, the other hand on the hip"],
  ["peace", "Peace sign", "social", "leaning toward the camera, a V sign beside the head"],
  ["point", "Pointing at you", "social", "pointing straight at the viewer, the other hand on the hip"],
  ["selfie", "Mirror selfie", "social", "holding a phone up at face height for a mirror selfie, a hand on the hip"],
  ["stool", "On a stool", "sitting", "perched on a tall stool, one foot on its footrest, hands on the front knee"],
  ["floor", "Cross-legged", "sitting", "sitting cross-legged on the floor, back straight, hands on the knees"],
  ["steps", "On the steps", "sitting", "sitting on a low step, knees up, forearms on the knees, leaning forward"],
  ["lean", "Lean on a wall", "sitting", "leaning a shoulder on a wall, ankles crossed, arms folded"],
  ["crouch", "Street crouch", "sitting", "squatting low, knees apart, forearms on the knees"],
].map(([id, name, group, words]) => ({ id, name, group, words, ...pic("poses", id) }));

export const WARDROBE_GROUPS = { everyday: "Everyday", street: "Street", smart: "Smart", evening: "Evening", seasons: "Seasons", costume: "Costumes" };
export const POSE_GROUPS = { standing: "Standing", moving: "Moving", social: "Social", sitting: "Sitting and leaning" };

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
    ? `Pose them exactly like the figure in @pose${pose.words ? ` (${pose.words})` : ""}: copy the body position, the arms, the legs and the turn of the head, but never draw the grey figure itself`
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
