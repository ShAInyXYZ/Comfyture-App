// What Comfyture's project holds besides its kit and layouts: the brief, the pictures, the references, the
// timeline of how it got here, the products the shoot can use, the variations and the motion piece.
import { existsSync } from "node:fs";
import { A } from "./macaron-comfyture-kit.ts";
import { newLayer } from "../web/js/design.js";
import { cloneDesign } from "../web/js/macaron-layout.js";

const here = (p: string) => (existsSync(`web/${A}/${p}`) ? `${A}/${p}` : undefined);
type Asset = { id: string; name: string; kind: string; url: string; width: number; height: number; source: string; note?: string; clear?: boolean; model?: string; prompt?: string; credits?: number; video?: string };
const asset = (id: string, name: string, kind: string, file: string, width: number, height: number, source: string, o: Partial<Asset> = {}): Asset => ({ id, name, kind, url: file.startsWith("brand/") ? file : `${A}/${file}`, width, height, source, ...o });

const assets: Asset[] = [
  asset("app-home", "Home: what's your film about?", "app", "app/home.webp", 1600, 900, "screenshot", { note: "Kitchen's front door." }),
  asset("app-story", "Story", "app", "app/story.webp", 1600, 900, "screenshot", { note: "Bible, script and storyboard on one screen." }),
  asset("app-stage", "Stage", "app", "app/stage.webp", 1600, 900, "screenshot", { note: "Mannequins and set pieces, rendered as control references." }),
  asset("app-shot", "Shot", "app", "app/shot.webp", 1600, 900, "screenshot", { note: "The desk: inputs, monitor, presets, take log." }),
  asset("app-cut", "Cut", "app", "app/cut.webp", 1600, 900, "screenshot", { note: "The editing room, with the editor's bar." }),
  asset("app-library", "Library", "app", "app/library.webp", 1600, 900, "screenshot", { note: "Takes, films and images." }),
  asset("jar", "The Comfyture jar", "product", "jar.webp", 1200, 1200, "brand", { note: "The approved prop: wordmark on the label, mark on the lid (docs/brand/props)." }),
  asset("jar-cutout", "The jar, cut out", "product", "jar-cutout.webp", 1100, 946, "brand", { clear: true, note: "Background removed with the app's own tool." }),
  asset("jar-of-shots", "The jar of shots", "product", "jar-of-shots.webp", 913, 831, "generated", { clear: true, model: "gpt-image-2.5-flare", credits: 7.94, prompt: "The jar from the prop, label and lid left blank, filled to the brim with tiny film stills; plum seamless background (cut out afterwards).", note: "The label is blank on purpose: the real wordmark goes on it as a layer." }),
  asset("brioche", "Brioche", "mascot", "brioche.webp", 649, 746, "generated", { clear: true, model: "gpt-image-2.5-flare", credits: 7.95, prompt: "Brioche from the cast sheet, sitting, three-quarter front, one paw raised, flat light grey ground (cut out afterwards).", note: "On the sheet's model: same fur, ears, eyes." }),
  asset("brioche-cheer", "Brioche, cheering", "mascot", "brioche-cheer.webp", 727, 745, "generated", { clear: true, model: "gpt-image-2.5-flare", credits: 7.96, prompt: "Brioche in the sheet's dance pose, both paws up, eyes closed, a big smile.", note: "For end cards and good news." }),
  asset("brioche-flux", "Brioche · FLUX 3 test", "render", "renders/brioche-flux3-test.webp", 1024, 1024, "generated", { model: "flux-3-image", credits: 14.48, prompt: "The same prompt as the Flare picture, for comparison.", note: "Richer fur, a tighter frame, almost twice the credits: Flare keeps Brioche closer to her sheet." }),
  asset("brioche-clapper-flare", "Brioche with a clapperboard · Flare", "render", "renders/brioche-clapper-flare.webp", 1088, 1360, "generated", { model: "gpt-image-2.5-flare", credits: 5.84, prompt: "Brioche from the sheet on pale yellow linen, a tiny blank clapperboard beside her, soft morning window light.", note: "Made through Macaron's own picture route: 1088×1360, the post's own size, one reference." }),
  asset("brioche-clapper-flux3", "Brioche with a clapperboard · FLUX 3", "render", "renders/brioche-clapper-flux3.webp", 912, 1152, "generated", { model: "flux-3-image", credits: 14.48, prompt: "The same prompt as the Flare picture.", note: "The same route and reference: 912×1152 at the 1k tier (4:5 comes back quantized), a plainer studio light." }),
  asset("plum-macro", "Plum preserve, macro", "render", "plum-macro.webp", 1024, 1824, "generated", { model: "gpt-image-2.5-flare", credits: 2.85, prompt: "Glossy plum preserve filling the frame, shallow depth of field, dark and moody. No objects, no text.", note: "A ground to put under ink, never under the logo." }),
  asset("made-state-property", "State Property", "made", "made/state-property.webp", 720, 1280, "made", { video: "brand/mixer/trends/state-property/preview.mp4", note: "Mixer trend: Earl driving, Mochi riding shotgun." }),
  asset("made-lights-off", "Lights Off", "made", "made/lights-off.webp", 720, 1279, "made", { note: "Mixer trend." }),
  asset("made-three-kittens", "Three Kittens", "made", "made/three-kittens.webp", 720, 1279, "made", { note: "Mixer trend." }),
  asset("made-black-cat", "Black Cat Clapping", "made", "made/black-cat-clapping.webp", 720, 1280, "made", { video: "brand/mixer/trends/black-cat-clapping/preview.mp4", note: "Mixer trend, from the reference clip." }),
  asset("made-ramalama", "Ramalama", "made", "made/ramalama.webp", 720, 1279, "made", { note: "Mixer trend." }),
  asset("made-hotel-lobby", "Hotel Lobby", "made", "made/hotel-lobby.webp", 720, 1280, "made", { video: "brand/mixer/trends/hotel-lobby/preview.mp4", note: "Mixer trend, with human owners." }),
  asset("made-finding-life", "Finding Life", "made", "made/finding-life.webp", 960, 528, "made", { note: "A story shot from Desert Dawn Rescue, 23 s film." }),
  asset("made-observing-sky", "Observing Sky", "made", "made/observing-sky.webp", 960, 528, "made", { note: "A story shot from Desert Dawn Rescue." }),
  asset("made-rescue-arrival", "Rescue Arrival", "made", "made/rescue-arrival.webp", 960, 528, "made", { note: "A story shot from Desert Dawn Rescue." }),
  asset("made-waking-up", "Waking Up", "made", "made/waking-up.webp", 960, 528, "made", { note: "A story shot from Desert Dawn Rescue." }),
  asset("made-chef", "Chef, lip sync", "made", "made/chef-lip-sync.webp", 960, 640, "made", { note: "A talking shot: voice and lip sync come with it." }),
  asset("made-thunder", "Thunder God", "made", "made/thunder-god-extended.webp", 960, 640, "made", { note: "A preset, extended." }),
  asset("wordmark-png", "Wordmark, PNG", "brand", "brand/wordmark-2400.png", 2400, 793, "brand", { clear: true, note: "Transparent, yellow, 2400 px wide." }),
];

const products = [
  { id: "jar", name: "The Comfyture jar", scene: `${A}/v2/counter.webp`, photo: { url: `${A}/jar.webp`, width: 1200, height: 1200 }, cutout: { url: `${A}/jar-cutout.webp` }, features: ["Blank label for the real logo", "Lid beside it", "Plum, yellow and ink"] },
  { id: "desk", name: "The Comfyture desk", photo: { url: `${A}/app/home.webp`, width: 1600, height: 900 }, cutout: null, features: ["Story, Stage, Shot, Cut, Library", "Sound with every shot", "Open source"] },
];

const brief = {
  pitch: "A warm, playful home for making films. A familiar kitchen spirit, with the tools to turn an idea into a shot.",
  goals: ["Feel welcoming", "Make it simple", "Stay playful"],
  image: `${A}/v2/brief-notebook.webp`,
  goal: "Introduce Comfyture, the open-source creation desk for cinematic shots with sound, to makers: a launch week of posts, and a set the following weeks can reuse.",
  audience: "Indie filmmakers, motion designers and trend-minded creators who like to own their tools; people who already run ComfyUI or want to.",
  message: "Direct a shot, or a whole film, from one photo or one sentence. Open source, on your own GPU or in Comfy Cloud, with a real desk: Story, Stage, Shot, Cut, Library.",
  tone: "Warm, plain, concrete, a little playful. One jam pun at most. Show real takes, never promise studio results.",
  deliverables: "A brand board. Social layouts in 4:5, 1:1 and 9:16: launch, showcase, the assistant, the five rooms. A product hero. An eight second logo and product intro. Saved variations to test.",
  constraints: "Open source (MIT). Real screens and real takes only. Logos only from the supplied files; generated pictures never carry the logo or a headline. Type clear of the story's top 13% and bottom 18%. Never name or compare other products.",
  channels: "Instagram feed and stories, TikTok, X.",
};

const refs = (now: string) => [
  // the moodboard: what the work looks to (pictures made for it, no words in them)
  { id: "mood-jar", title: "Jam on the counter", kind: "inspiration", src: `${A}/v2/mood-1.webp`, note: "Plum jam, wax paper and twine, blueberries, a window behind: the product's home.", at: "2026-10-20T04:10:00.000Z" },
  { id: "mood-film", title: "Brioche on film", kind: "inspiration", src: `${A}/v2/mood-2.webp`, note: "Three frames of the bunny with a macaron: the whole world is a roll of film.", at: "2026-10-20T04:12:00.000Z" },
  { id: "mood-macarons", title: "A stack of macarons", kind: "inspiration", src: `${A}/v2/mood-3.webp`, note: "Yellow, plum and pink on a plate in warm side light.", at: "2026-10-20T04:14:00.000Z" },
  { id: "mood-ink", title: "Plum ink on cream", kind: "inspiration", src: `${A}/v2/mood-4.webp`, note: "The wordmark's hand: loops of plum ink on handmade paper.", at: "2026-10-20T04:16:00.000Z" },
  { id: "mood-board", title: "The corkboard", kind: "inspiration", src: `${A}/v2/mood-5.webp`, note: "Pinned polaroids and doodles: where ideas turn into shots.", at: "2026-10-20T04:18:00.000Z" },
  { id: "mood-shelf", title: "The shelf", kind: "inspiration", src: `${A}/v2/mood-6.webp`, note: "Lemon and plum jars with warm lights behind them.", at: "2026-10-20T04:20:00.000Z" },
  { id: "ref-identity", title: "The approved identity board", kind: "identity", src: `${A}/refs/identity-board.webp`, note: "Lid on C: the wordmark, the mark, the yellow, ink and plum. Letterforms and lid geometry are kept exactly.", at: "2026-10-16T22:00:00.000Z" },
  { id: "ref-c07", title: "Concept 07 · Lid on C", kind: "concept", src: "brand/story/07_fitted_lid.jpg", note: "The script with a lid fitted to the first letter. Approved.", at: "2026-10-16T22:00:00.000Z" },
  { id: "ref-c03", title: "Concept 03 · Ribbon wordmark", kind: "concept", src: "brand/story/03_ribbon_wordmark.jpg", note: "The flowing script in a label oval. The lettering that stayed.", at: "2026-10-16T20:30:00.000Z" },
  { id: "ref-c02", title: "Concept 02 · Jar monogram", kind: "concept", src: "brand/story/02_jar_monogram.jpg", note: "A C that is a jar: strong, but heavy and cold next to the product.", at: "2026-10-16T19:30:00.000Z" },
  { id: "ref-c01", title: "Concept 01 · Preserve seal", kind: "concept", src: "brand/story/01_preserve_seal.jpg", note: "A scalloped jam label. Too literal: it sold jam, not software.", at: "2026-10-16T18:30:00.000Z" },
  { id: "ref-jar", title: "The jar prop", kind: "product", src: `${A}/jar.webp`, note: "Wordmark on the yellow label, the mark on the lid.", at: "2026-10-19T01:54:00.000Z" },
  { id: "ref-brioche", title: "Brioche, the cast sheet", kind: "mascot", src: `${A}/refs/brioche-sheet.webp`, note: "Front, three-quarter, side, back, happy, surprised, smug, dance. The model for every picture of her.", at: "2026-10-19T11:36:00.000Z" },
  { id: "ref-crew", title: "Mixer's feline crew", kind: "mascot", src: `${A}/refs/mixer-crew.webp`, note: "Praline, Sesame, Mochi, Meringue: the cast of the trends.", at: "2026-10-19T12:00:00.000Z" },
  { id: "ref-home", title: "The app: home", kind: "app", src: `${A}/app/home.webp`, note: "The real screen, as it ships.", at: now },
  { id: "ref-cut", title: "The app: Cut and its editor's bar", kind: "app", src: `${A}/app/cut.webp`, note: "The bar Brioche's explainer quotes.", at: now },
];

type Step = { id: string; at: string; kind: string; beat?: string; title: string; note?: string; src?: string; designId?: string; who?: string };
const history = (designs: any[]): Step[] => {
  const d = (id: string) => designs.find((x) => x.id === id)?.id;
  const steps: Step[] = [
    { id: "h-c01", at: "2026-10-16T18:30:00.000Z", kind: "concept", beat: "The spark", title: "Concept 01 · Preserve seal", note: "A pun to start from: confiture, comfyture. A jam label with the C as a fruit: too literal, but the jar stayed.", src: "brand/story/01_preserve_seal.jpg" },
    { id: "h-c02", at: "2026-10-16T19:30:00.000Z", kind: "concept", title: "Concept 02 · Jar monogram", note: "A C that is a jar. A strong shape, but heavy and cold next to the product.", src: "brand/story/02_jar_monogram.jpg" },
    { id: "h-c03", at: "2026-10-16T20:30:00.000Z", kind: "concept", title: "Concept 03 · Ribbon wordmark", note: "The flowing script in a label oval. The lettering that stayed.", src: "brand/story/03_ribbon_wordmark.jpg" },
    { id: "h-palette", at: "2026-10-16T21:40:00.000Z", kind: "decision", beat: "The palette", title: "Yellow, ink, plum, warm white", note: "A world of jam and kitchen light: yellow as the signal, ink and plum as grounds, warm white for text.", src: `${A}/v2/mood-3.webp` },
    { id: "h-c07", at: "2026-10-16T22:00:00.000Z", kind: "decision", beat: "The mark", title: "Concept 07 · Lid on C: approved", note: "The script with a lid fitted to the first letter: Comfyture comes to life in one stroke. “Second variation is nice, we'll use it.”", src: "brand/story/07_fitted_lid.jpg" },
    { id: "h-files", at: "2026-10-18T16:40:00.000Z", kind: "design", title: "Brand files built from the approved lettering", note: "Wordmark, mark and app icon as SVG in four colourways, plus PNGs, favicon and manifest: scripts/brand-build.py traced them from the board, so the lid is never lost.", src: `${A}/refs/identity-board.webp` },
    { id: "h-jar", at: "2026-10-19T01:54:00.000Z", kind: "reference", title: "The jar, as a prop", note: "The wordmark on a yellow label, the mark on a plum lid. The pun in one picture: confiture, comfyture.", src: `${A}/jar.webp` },
    { id: "h-brioche", at: "2026-10-19T11:36:00.000Z", kind: "reference", beat: "The room", title: "Brioche joins the cast", note: "A baby lop-eared bunny with cream and apricot fur: the assistant in every room.", src: `${A}/refs/brioche-sheet.webp` },
    { id: "h-brief", at: "2026-10-20T05:00:00.000Z", kind: "note", title: "The brief for launch week", note: brief.goal },
    { id: "h-kit", at: "2026-10-20T05:05:00.000Z", kind: "decision", title: "The kit, filled from the identity", note: "Eleven logo files on the grounds they are for, four colours with what each is for, Manrope and IBM Plex Mono, a voice and nine rules. Designs read the kit and the brand guard checks them against it." },
    { id: "h-pictures", at: "2026-10-20T05:20:00.000Z", kind: "design", title: "Pictures made: Brioche, the jar of shots, the plum macro", note: "GPT Image 2.5 Flare through Comfy Router, 18.7 credits for three. The jar's label and lid were left blank so the real wordmark goes on as a layer; the subjects were cut out with the app's own tool.", src: `${A}/jar-of-shots.webp` },
    { id: "h-flux", at: "2026-10-20T05:22:00.000Z", kind: "decision", title: "Two image partners tried on the same Brioche", note: "FLUX 3 (14.48 credits) drew a richer fur and a tighter frame; GPT Flare (7.95) stayed closer to her sheet. Roles: Flare for characters and products from references, FLUX 3 for photographic scenes.", src: `${A}/renders/brioche-flux3-test.webp` },
  ];
  const iter = (id: string, at: string, title: string, note: string, file: string, design?: string): Step[] => {
    const src = here(`history/${file}`);
    return src ? [{ id, at, kind: "design", title, note, src, designId: design && d(design) }] : [];
  };
  steps.push(
    ...iter("h-launch-v1", "2026-10-20T05:40:00.000Z", "Launch · v1, first layout", "Plum ground, the headline, Brioche peeking over the app's home screen. The badge hugged its words and the story layout sat too high.", "launch-v1.webp", "launch"),
    ...iter("h-launch-v2", "2026-10-20T05:55:00.000Z", "Launch · v2, per-format layouts", "A wider badge, the story layout moved down inside the safe zone, the square given its own place for Brioche. Approved.", "launch-v2.webp", "launch"),
    ...iter("h-showcase-v1", "2026-10-20T06:00:00.000Z", "Showcase · v1", "Three Mixer trends as phone-shaped tiles, staggered. In the square the captions touched the tiles and the type was small.", "showcase-v1.webp", "showcase"),
    ...iter("h-brioche-v1", "2026-10-20T06:05:00.000Z", "Brioche explainer · v1", "The assistant's speech bubble quoting a real Cut instruction, the four things she does as chips, her bar from the app below. The Render chip ran under Brioche and the bar was cropped from the wrong part of the screen.", "brioche-v1.webp", "brioche"),
    ...iter("h-rooms-v1", "2026-10-20T06:10:00.000Z", "Five rooms · v1", "Yellow ground, ink type: the flip side of the identity. Numbers in mono, room names in Manrope 800. In the story the rows stopped halfway down its zone.", "rooms-v1.webp", "rooms"),
    ...iter("h-hero-v1", "2026-10-20T06:15:00.000Z", "Product hero · v1", "The jar of shots with the real wordmark laid on its blank label, a ring behind it for the lid. The line under the jar ran into its lid and the ring crossed the headline.", "hero-v1.webp", "hero"),
    ...iter("h-board-v1", "2026-10-20T06:20:00.000Z", "Brand board · v1", "Logo, palette, type, mascot and jar on one page. The ink swatch vanished into the ground and Warm white broke onto its hex.", "board-v1.webp", "board"),
  );
  steps.push(
    { id: "h-variants", at: "2026-10-20T06:25:00.000Z", kind: "variant", title: "Five variations of the launch layout", note: "Copy (the sentence first), colour (yellow ground), composition (a poster over the plum macro), intent (run it yourself) and format (the story first). Compared side by side.", designId: d("launch") },
    { id: "h-motion", at: "2026-10-20T06:30:00.000Z", kind: "motion", title: "Logo and product intro, 8 s", note: "The wordmark wipes in with its lid lifted; the lid lands with a ripple and a soft pop; the wordmark settles into the launch layout; Brioche pops in; a yellow end card that holds, with the address, for the last second and a half.", src: here("history/intro-poster.webp"), designId: d("intro") },
  );
  return steps;
};

/** The ways the mark and the look could go; Warm and bold is the one the identity took. Each is a picture with a calm middle and the real wordmark file on it. */
const directions = [
  { id: "dir-warm", name: "Warm and bold", note: "Confident, expressive and full of flavour.", bg: `${A}/v2/dir-warm.webp`, logo: "wordmark-yellow", picked: true },
  { id: "dir-craft", name: "Quiet craft", note: "Honest, tactile and kitchen-made.", bg: `${A}/v2/dir-craft.webp`, logo: "wordmark-plum", picked: false },
  { id: "dir-night", name: "After hours", note: "A richer, more cinematic take on the same spirit.", bg: `${A}/v2/dir-night.webp`, logo: "wordmark-white", picked: false },
];

const motion = [{ id: "m-intro", name: "Logo and product intro", design: "intro", format: "9:16", duration: 8, fps: 30, sound: { pad: true, pops: [1.82] } }];

// ---------------------------------------------------------------- the variations of the launch layout

const variant = (from: any, id: string, name: string, kind: string, note: string, status: string) => {
  const v = cloneDesign(from, { name, kind, note });
  Object.assign(v, { id, status, createdAt: from.createdAt, updatedAt: from.updatedAt });
  v.variant.of = from.id;
  v.variant.from = from.id;
  return v;
};
const set = (d: any, id: string, patch: Record<string, any>) => Object.assign(d.layers.find((l: any) => l.id === id), patch);

const designs = (made: any, now: string) => {
  const launch = made.launch();
  const base = [launch, made.brioche(), made.showcase(), made.hero(), made.rooms(), made.board(), made.intro()];
  for (const d of base) Object.assign(d, { createdAt: "2026-10-20T05:25:00.000Z", updatedAt: now, history: [{ at: "2026-10-20T05:25:00.000Z", who: "you", note: "Started from the brand kit" }, { at: now, who: "you", note: `Laid out for ${Object.keys(d.formats ?? {}).length + 1} formats` }] });
  // the week: Monday's post, Wednesday's story, Friday's reel, Sunday's feature
  const [, brioche, , , , , intro] = base;
  launch.plan = { day: "mon" };
  brioche.plan = { day: "sun" };
  intro.plan = { day: "fri" };
  intro.status = "scheduled";
  // copy: the sentence first
  const copy = variant(launch, "launch-copy", "Launch · One sentence in", "copy", "The sentence first, for people who write before they shoot", "draft");
  set(copy, "headline", { text: "One sentence in.\nA *short film* out." });
  set(copy, "sub", { text: "Write what you want to see. Comfyture plans it, shoots it and cuts it, on your own GPU or in Comfy Cloud." });
  // colour: yellow ground, ink type, the plum accent
  const yellow = variant(launch, "launch-yellow", "Launch · Yellow ground", "colour", "Yellow ground: the flip side of the identity", "review");
  yellow.bg = { color: "yellow" };
  set(yellow, "wordmark", { logo: "wordmark-ink" });
  set(yellow, "headline", { colorRole: "ink", accent: "plum" });
  set(yellow, "sub", { colorRole: "ink", opacity: 0.9 });
  set(yellow, "badge", { colorRole: "ink" });
  set(yellow, "badge-text", { colorRole: "yellow" });
  // composition: a poster over the plum macro, the jar of shots as the hero
  const poster = variant(launch, "launch-poster", "Launch · Poster", "composition", "A poster: the jar of shots over the plum macro", "draft");
  poster.layout = "poster";
  poster.bg = { color: "plum", src: `${A}/plum-macro.webp`, crop: { x: 0, y: 0, w: 1, h: 1 }, dim: { color: "ink", alpha: 0.52 } };
  poster.layers = poster.layers.filter((l: any) => !["brioche", "window"].includes(l.id));
  poster.layers.push(newLayer("image", { id: "jar", name: "Jar of shots", role: "hero", src: `${A}/jar-of-shots.webp`, fit: "contain", x: 0.28, y: 0.4, w: 0.7, h: (0.7 * 1080 * (831 / 913)) / 1350 }));
  set(poster, "headline", { text: "Shots worth\n*keeping.*", size: 0.115, y: 0.17 });
  set(poster, "sub", { text: "A desk for making shots, with sound.", y: 0.4, w: 0.3, size: 0.03 });
  poster.formats = {
    "1:1": { layers: { badge: { x: 0.69, y: 0.07, w: 0.24, h: 59 / 1080 }, "badge-text": { x: 0.69, y: 0.0885, w: 0.24 }, headline: { x: 0.07, y: 0.205, size: 0.095 }, sub: { x: 0.07, y: 0.62, w: 0.3, size: 0.03 }, jar: { x: 0.38, y: 0.32, w: 0.62, h: (0.62 * (831 / 913)) } } },
    "9:16": { layers: { wordmark: { x: 0.06, y: 0.14, w: 0.32 }, badge: { x: 0.62, y: 0.14, w: 0.28, h: 63 / 1920 }, "badge-text": { x: 0.62, y: 0.1515, w: 0.28 }, headline: { x: 0.06, y: 0.235, w: 0.84, size: 0.12 }, sub: { x: 0.06, y: 0.45, w: 0.5, size: 0.04 }, jar: { x: 0.06, y: 0.54, w: 0.84, h: (0.84 * 1080 * (831 / 913)) / 1920 } } },
  };
  // composition: a photograph of Brioche behind the words (a picture made through Macaron's own route)
  const photo = variant(made.brioche(), "brioche-photo", "Brioche · Photo", "composition", "A photograph of Brioche behind the words", "draft");
  photo.layout = "custom";
  photo.bg = { color: "ink", src: `${A}/renders/brioche-clapper-flare.webp`, crop: { x: 0, y: 0, w: 1, h: 1 } };
  const pillText = (id: string, y: number, H: number) => y + (63 / H - (0.0245 * 1080 * 0.72) / H) / 2;
  photo.layers = [
    newLayer("shape", { id: "scrim", name: "Scrim, bottom", role: "deco", colorRole: "ink", x: 0, y: 0.5, w: 1, h: 0.5, grad: { angle: 180, stops: [[0, "ink", 0], [0.5, "ink", 0.8], [1, "ink", 0.92]] } }),
    newLayer("logo", { id: "wordmark", name: "Wordmark", logo: "wordmark-ink", x: 0.07, y: 0.07, w: 0.28 }),
    newLayer("shape", { id: "badge", name: "Badge", role: "badge", shape: "pill", colorRole: "yellow", x: 0.65, y: 0.073, w: 0.28, h: 63 / 1350, radius: 0.5 }),
    newLayer("text", { id: "badge-text", name: "Badge text", role: "badge", fontRole: "mono", text: "The assistant", size: 0.0245, tracking: 0.08, caps: true, align: "center", colorRole: "ink", x: 0.65, y: pillText("badge", 0.073, 1350), w: 0.28 }),
    newLayer("text", { id: "headline", name: "Headline", role: "headline", fontRole: "display", text: "Say it.\n*Brioche* does it.", size: 0.098, lineHeight: 1.02, tracking: -0.02, colorRole: "white", accent: "yellow", x: 0.07, y: 0.765, w: 0.86 }),
  ];
  photo.formats = {
    "1:1": { layers: { badge: { x: 0.67, y: 0.07, w: 0.26, h: 59 / 1080 }, "badge-text": { x: 0.67, y: 0.0885, w: 0.26 }, headline: { y: 0.72, size: 0.088 }, scrim: { y: 0.45, h: 0.55 } } },
    "9:16": { layers: { wordmark: { x: 0.06, y: 0.14, w: 0.3 }, badge: { x: 0.62, y: 0.14, w: 0.28, h: 63 / 1920 }, "badge-text": { x: 0.62, y: 0.1515, w: 0.28 }, headline: { x: 0.06, y: 0.665, w: 0.84, size: 0.1 }, scrim: { y: 0.36, h: 0.64 } } },
  };
  // intent: run it yourself
  const run = variant(launch, "launch-run", "Launch · Run it yourself", "intent", "Trial: for people who would rather run it than read about it", "draft");
  run.intent = "Trial: get people to run it on their own GPU or in Comfy Cloud.";
  set(run, "headline", { text: "Your GPU.\nYour *shots.*" });
  set(run, "sub", { text: "Clone it, run it, keep every take. Open source, MIT, on your machine or in Comfy Cloud." });
  set(run, "badge-text", { text: "Run it yourself" });
  set(run, "window", { src: `${A}/app/shot.webp` });
  // format: the story first
  const story = variant(launch, "launch-story", "Launch · Story first", "format", "Starts from the story layout", "approved");
  story.plan = { day: "wed" };
  const lay = (id: string) => ({ ...launch.layers.find((l: any) => l.id === id), ...launch.formats["9:16"].layers[id] });
  story.layers = launch.layers.map((l: any) => lay(l.id));
  story.format = "9:16";
  story.formats = {};
  return [...base, copy, yellow, poster, photo, run, story];
};

export const content = { designs, products, brief, refs, assets, history, motion, directions };
