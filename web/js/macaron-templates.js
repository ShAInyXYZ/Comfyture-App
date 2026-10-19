// Macaron's templates: each a setup for a product, as the words a picture model draws it from (the
// product, and the brand's logo, given as references), and for a video the way it then moves. Their
// previews show the Comfyture jar; a shoot draws the brand's own product.

const SHOT = "Commercial product photography, premium, real materials and light, the product exactly as in @product (its shape, label, logo and colours kept true and legible).";
const NO_TEXT = "No added text, no extra logos, no watermark.";
const palette = (b) => (b.colours?.length ? `The brand's colours, ${b.colours.slice(0, 4).join(", ")}, set the palette.` : "");
const voice = (b) => (b.voice?.length ? `The mood is ${b.voice.slice(0, 3).join(", ")}.` : "");
const logo = (b) => (b.logo ? "The brand's logo from @logo appears small and crisp, exactly as it is." : "");

/** A category's templates, in the order the gallery shows them. */
export const CATEGORIES = ["Product shot", "Motion", "UGC", "TikTok", "Ads", "Posters", "Marketplace"];

export const TEMPLATES = [
  {
    id: "ice-cube-hover", name: "Ice cube hover", category: "Product shot", media: "image", formats: ["1:1", "4:5"],
    prompt: (b, p) => `${SHOT} @product floating in mid-air over a bed of clear ice cubes on black, crisp cold rim light, tiny frost and droplets on it, a dark moody studio. ${NO_TEXT}`,
  },
  {
    id: "linen-lid-lift", name: "Linen lid lift", category: "Product shot", media: "image", formats: ["4:5", "1:1"],
    prompt: (b, p) => `${SHOT} @product on rumpled natural linen, its lid or top just lifted open above it by an unseen hand, soft window light, warm cream tones. ${voice(b)} ${NO_TEXT}`,
  },
  {
    id: "golden-dew", name: "Golden dew", category: "Product shot", media: "image", formats: ["4:5", "1:1"],
    prompt: (b, p) => `${SHOT} @product on a mossy stone in nature at golden hour, dew drops on it, warm backlight and soft bokeh leaves, with what it is made from around it. ${NO_TEXT}`,
  },
  {
    id: "breakfast-table", name: "Breakfast table", category: "Product shot", media: "image", formats: ["1:1", "4:5"],
    prompt: (b, p) => `${SHOT} @product on a sunny breakfast table, in use the way it is meant to be, ceramic plates, a cup of coffee, a gingham napkin, a three-quarter view from above. ${voice(b)} ${NO_TEXT}`,
  },
  {
    id: "pastel-studio", name: "Pastel studio", category: "Product shot", media: "image", formats: ["4:5", "1:1"],
    prompt: (b, p) => `${SHOT} @product on a cylinder plinth in a soft pastel studio set with minimal geometric shapes and clean shadows. ${palette(b)} ${NO_TEXT}`,
  },
  {
    id: "splash", name: "Splash", category: "Product shot", media: "image", formats: ["1:1", "4:5"],
    prompt: (b, p) => `${SHOT} @product with a dramatic splash of liquid and its ingredients flying around it, frozen in motion, high-speed flash photography on a deep background. ${palette(b)} ${NO_TEXT}`,
  },
  {
    id: "orbit", name: "Slow orbit", category: "Motion", media: "video", formats: ["1:1", "9:16"],
    prompt: (b, p) => `${SHOT} @product alone on a dark reflective turntable, a curved light streak behind it, a sleek studio. ${NO_TEXT}`,
    video: { preset: "orbit-360" },
  },
  {
    id: "push-in", name: "Hero push-in", category: "Motion", media: "video", formats: ["9:16", "16:9"],
    prompt: (b, p) => `${SHOT} @product on a rustic counter at dusk, warm practical lights behind it, shallow depth of field, the hero of the frame. ${NO_TEXT}`,
    video: { preset: "push-in" },
  },
  {
    id: "levitate", name: "Levitate", category: "Motion", media: "video", formats: ["9:16", "1:1"],
    prompt: (b, p) => `${SHOT} @product just above a surface, a soft cloud of dust under it, a playful magic moment, a warm background. ${NO_TEXT}`,
    video: { preset: "levitate" },
  },
  {
    id: "first-taste", name: "UGC: first taste", category: "UGC", media: "video", formats: ["9:16"],
    prompt: (b, p) => `A natural phone-camera selfie in a cosy home: a smiling young person holds @product up next to their face toward the camera, trying it for the first time, the product exactly as in @product, its label facing the camera. Real, unpolished, authentic. ${NO_TEXT}`,
    video: { action: "They bring the product closer to the camera, smile and talk about it, then try it and react with delight.", line: (b, p) => `Okay, I finally tried ${p.name || "this"}... and honestly? It's so good.`, camera: "handheld" },
  },
  {
    id: "unboxing", name: "UGC: unboxing", category: "UGC", media: "video", formats: ["9:16"],
    prompt: (b, p) => `A top-down phone photo: two hands opening a kraft gift box with tissue paper, revealing @product inside, exactly as in @product, natural daylight. ${NO_TEXT}`,
    video: { action: "The hands pull the tissue paper aside and lift the product out of the box toward the camera.", camera: "handheld" },
  },
  {
    id: "spoon-drop", name: "Close-up dip", category: "TikTok", media: "video", formats: ["9:16"],
    prompt: (b, p) => `${SHOT} An extreme close-up of @product being used: a glossy detail moment, punchy contrast, vertical framing. ${NO_TEXT}`,
    video: { preset: "crash-zoom" },
  },
  {
    id: "hero-ad", name: "Hero ad", category: "Ads", media: "image", formats: ["4:5", "1:1", "9:16"],
    prompt: (b, p) => `A clean modern social ad: @product on a solid backdrop in the brand's main colour${b.colours?.[0] ? ` ${b.colours[0]}` : ""}, a big bold headline at the top reading exactly "${b.headline || "Taste the season"}"${b.colours?.[1] ? ` in ${b.colours[1]}` : ""}, ${b.logo ? "the logo from @logo small at the bottom" : "the brand name small at the bottom"}. The product exactly as in @product. ${voice(b)}`,
  },
  {
    id: "spring-sale", name: "Poster: sale", category: "Posters", media: "image", formats: ["4:5", "9:16"],
    prompt: (b, p) => `A bold poster: a deep background in the brand's colour${b.colours?.[2] ? ` ${b.colours[2]}` : ""}, huge stacked condensed uppercase type reading exactly "${b.sale || "SPRING SALE"}"${b.colours?.[0] ? ` in ${b.colours[0]}` : ""}, @product at the bottom right exactly as in @product, a small line "${b.tagline || "Sweet days ahead"}". ${logo(b)}`,
  },
  {
    id: "white-packshot", name: "White packshot", category: "Marketplace", media: "image", formats: ["1:1"],
    prompt: (b, p) => `A marketplace packshot: @product alone, front-facing and centred on a pure seamless white #FFFFFF background, soft even light, only a faint natural contact shadow, exactly as in @product. ${NO_TEXT}`,
  },
  {
    id: "feature-callouts", name: "Feature callouts", category: "Marketplace", media: "image", formats: ["1:1"],
    prompt: (b, p) => `A marketplace infographic: @product on white, exactly as in @product, with three thin callout lines and small clean sans labels reading exactly ${(p.features?.length ? p.features : ["Made with care", "Small batch", "Ready to love"]).slice(0, 3).map((f) => `"${f}"`).join(", ")}, a balanced layout.`,
  },
];

export const templateById = (id) => TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
export const previewOf = (t) => `brand/products/macaron/${t.id}.webp`;
