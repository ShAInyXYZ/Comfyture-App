// The Studio's setup: the light, the surface and the background a product is shot on, kept with the brand (body.studio) so a
// shoot can be done again the same way. Plain data and one pure function (no imports): macaron.js adds studioWords() to a
// template's prompt, the shoot window draws the choices, Brioche's ops and the server's tests read the same ids.

/** The light: its id, the words a picture model is given, and what the choice shows on the key. */
export const LIGHTS = [
  { id: "softbox", name: "Softbox", words: "lit by a large softbox from the left, soft even light, gentle shadows", tip: "A big soft light from the left: clean and even" },
  { id: "window", name: "Window", words: "lit by soft natural window light from the side, warm and airy", tip: "Daylight from a window: warm and natural" },
  { id: "flash", name: "Hard flash", words: "lit by a hard direct flash, crisp shadows, punchy contrast", tip: "A hard flash: crisp, punchy, editorial" },
];

/** The surface it stands on: its id, the words, and the colour of its swatch. */
export const SURFACES = [
  { id: "linen", name: "Linen", words: "standing on natural rumpled linen", swatch: "#d9cdb6", tip: "Rumpled natural linen" },
  { id: "marble", name: "Marble", words: "standing on polished white marble with soft veins", swatch: "#e8e6e3", tip: "Polished white marble" },
  { id: "wood", name: "Wood", words: "standing on warm honey-coloured wood", swatch: "#b88a55", tip: "Warm honey wood" },
  { id: "plum", name: "Plum paper", words: "standing on matte plum-coloured paper", swatch: "#5b3a78", tip: "Matte coloured paper" },
];

export const DEFAULT_SETUP = { light: "softbox", surface: "linen", background: "" };

/** The setup a brand holds, whatever it was saved with: a choice that is not one of ours is the default. */
export function setupOf(body) {
  const s = body?.studio ?? {};
  return {
    light: LIGHTS.some((x) => x.id === s.light) ? s.light : DEFAULT_SETUP.light,
    surface: SURFACES.some((x) => x.id === s.surface) ? s.surface : DEFAULT_SETUP.surface,
    background: typeof s.background === "string" ? s.background : DEFAULT_SETUP.background,
  };
}

/**
 * The words a shoot gets from the setup: the light, the surface and a background in a colour of the palette, as one sentence to
 * follow the template's own. `kit` is the brand's kit ({ palette: [{ id, name, hex }] }). Nothing is added for a brand that
 * never touched the setup (body.studio absent), so the shoots it already has are drawn the way they were.
 */
export function studioWords(body, kit) {
  if (!body?.studio) return "";
  const s = setupOf(body);
  const light = LIGHTS.find((x) => x.id === s.light);
  const surface = SURFACES.find((x) => x.id === s.surface);
  const bg = kit?.palette?.find((p) => p.id === s.background);
  return ` The set: the product ${surface.words}, ${light.words}${bg ? `, a softly out-of-focus background in ${bg.name} ${bg.hex}` : ""}.`;
}

/** The setup said in a few words, for a chip: "Softbox · Linen · Plum". */
export function setupLine(body, kit) {
  const s = setupOf(body);
  const bg = kit?.palette?.find((p) => p.id === s.background);
  return [LIGHTS.find((x) => x.id === s.light).name, SURFACES.find((x) => x.id === s.surface).name, bg?.name].filter(Boolean).join(" · ");
}
