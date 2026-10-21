// The real-world scenes a design can be placed in (Create's mockups): a poster on a wall, a jar's label, a phone in a hand.
// Plain data with no imports, so the page (the mockup window) and the server (Brioche's propose_mockup) read the same ids.
// `photo` is the picture the gallery shows (it ships with the app under brand/macaron/mockups/, and also goes to the picture
// model as the scene to keep); `aspect` is the shape the new picture is made in; `on` says where the design goes.

export const SCENE_GROUPS = [["print", "Print"], ["packaging", "Packaging"], ["digital", "Digital"]];

// `quad` is where the blank surface sits in the photograph, its four corners (top left, top right, bottom right, bottom left) as
// fractions of the picture; `panel` is the shape of that surface in the real world (its width over its height), so a design is
// placed on it at its own shape and a preview can show it there before anything is paid for; `round` rounds its corners and `fill` has the design fill it (a screen), where paper takes the design whole.
export const SCENES = [
  { id: "poster-wall", group: "print", name: "Poster on a wall", aspect: "4:5", on: "the blank framed poster on the wall", quad: [[0.432, 0.146], [0.751, 0.085], [0.752, 0.782], [0.43, 0.761]], panel: 0.72 },
  { id: "magazine", group: "print", name: "Magazine spread", aspect: "4:5", on: "the blank right-hand page of the open magazine", quad: [[0.464, 0.14], [0.766, 0.1], [0.934, 0.646], [0.547, 0.777]], panel: 0.74 },
  { id: "flyer-table", group: "print", name: "Flyer on a table", aspect: "1:1", on: "the blank flyer lying on the table", quad: [[0.245, 0.344], [0.58, 0.24], [0.83, 0.713], [0.414, 0.871]], panel: 0.71 },
  { id: "business-card", group: "print", name: "Business card", aspect: "1:1", on: "the top business card", quad: [[0.21, 0.308], [0.808, 0.177], [0.914, 0.663], [0.297, 0.827]], panel: 1.75 },
  { id: "jar-label", group: "packaging", name: "Jar label", aspect: "1:1", on: "the blank paper label of the jar", quad: [[0.352, 0.4], [0.731, 0.4], [0.731, 0.735], [0.352, 0.735]], panel: 1.5 },
  { id: "box", group: "packaging", name: "Shipping box", aspect: "1:1", on: "the blank front face of the box", quad: [[0.215, 0.2], [0.85, 0.2], [0.85, 0.808], [0.215, 0.808]], panel: 1.3 },
  { id: "tote-bag", group: "packaging", name: "Tote bag", aspect: "4:5", on: "the blank front panel of the tote bag", quad: [[0.395, 0.42], [0.69, 0.42], [0.69, 0.8], [0.395, 0.8]], panel: 0.95 },
  { id: "coffee-cup", group: "packaging", name: "Coffee cup", aspect: "4:5", on: "the blank side of the paper cup", quad: [[0.385, 0.34], [0.635, 0.34], [0.615, 0.74], [0.405, 0.74]], panel: 0.85 },
  { id: "phone-hand", group: "digital", name: "Phone in a hand", aspect: "4:5", on: "the blank screen of the phone", quad: [[0.395, 0.17], [0.612, 0.165], [0.608, 0.755], [0.41, 0.755]], panel: 0.47, fill: true, round: 0.06 },
  { id: "laptop", group: "digital", name: "Laptop", aspect: "16:9", on: "the blank screen of the laptop", quad: [[0.219, 0.192], [0.63, 0.181], [0.652, 0.531], [0.25, 0.594]], panel: 1.6, fill: true },
  { id: "billboard", group: "digital", name: "Billboard", aspect: "16:9", on: "the blank billboard", quad: [[0.434, 0.354], [0.875, 0.031], [0.878, 0.677], [0.43, 0.746]], panel: 2.1, fill: true },
  { id: "shop-window", group: "digital", name: "Shop window", aspect: "16:9", on: "the blank vinyl poster on the shop window", quad: [[0.43, 0.146], [0.734, 0.056], [0.738, 0.77], [0.43, 0.746]], panel: 0.66 },
];
export const SCENE_IDS = SCENES.map((s) => s.id);
export const sceneById = (id) => SCENES.find((s) => s.id === id) ?? null;
export const scenePhoto = (id) => `brand/macaron/mockups/${id}.webp`;

/** What the light and the angle can be: the id, the chip's label and the words the picture model is given. */
export const LIGHTS = [["day", "Day", "natural daylight"], ["evening", "Evening", "warm golden-hour evening light"], ["studio", "Studio", "soft even studio light"]];
export const ANGLES = [["straight", "Straight on", "seen straight on"], ["three", "Three-quarter", "seen at a three-quarter angle"], ["close", "Close-up", "a close-up, shallow depth of field"]];

/** The words that place a design in a scene: the design is kept exactly as it is, the scene, its light and its objects too. */
export function mockupPrompt(scene, { light = "day", angle = "three" } = {}) {
  const L = LIGHTS.find((x) => x[0] === light) ?? LIGHTS[0];
  const A = ANGLES.find((x) => x[0] === angle) ?? ANGLES[1];
  return `Premium commercial photography. Place @design on ${scene.on} in @scene: the design printed on it exactly as it is, every word, logo and colour kept true and legible, laid flat on the surface and following its perspective, its lighting and its small reflections. Keep @scene's objects, background and camera position; ${L[2]}, ${A[2]}. Realistic materials and soft natural shadows. No other text, no added logos, no watermark, nothing else on the surface.`;
}
