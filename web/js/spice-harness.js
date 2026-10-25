// Paprika's harness on Spice's side: who she is, the six departments a shot goes through and what the chat bar says in the one that is
// open. Her brief and the actions she may take are the server's (server/spice-assist.ts); what she is told of the shot is in
// spice-assist.js. Plain data with no imports, so the pet registry (harnesses.js), the chat bar, the panel and the server's tests all
// read the same words.

export const PAPRIKA = {
  id: "paprika",
  name: "Paprika",
  tag: "AI editor",
  face: "brand/cast/paprika-face.webp",
  portrait: "brand/cast/paprika.png",
};

/**
 * The six departments, in the order a shot goes through them (the pipeline: the footage first, the finished composite last). `icon` is a
 * sprite name of the app; `verb` is what the department's label says beside its name in the viewer ("FX · Add elements"); `makes` is what
 * the department hands on, for the tooltips.
 */
export const WORKSPACES = [
  { id: "plate", name: "Plate", icon: "film-make", verb: "Bring the footage", makes: "the footage and what is read from it" },
  { id: "roto", name: "Roto", icon: "tool-cutout", verb: "Add subjects", makes: "a matte for each subject" },
  { id: "paint", name: "Paint", icon: "tool-fx-remove", verb: "Clean up", makes: "the footage with the object, the logo or the subtitles gone" },
  { id: "light", name: "Light", icon: "tool-fx-relight", verb: "Change the light", makes: "the footage relit, with another sky, weather or grade" },
  { id: "fx", name: "FX", icon: "tool-vfx", verb: "Add elements", makes: "the effects laid on the shot as layers, baked" },
  { id: "comp", name: "Comp", icon: "tool-fx-master", verb: "Finish", makes: "the stack of every pass, finished and exported" },
];

/** What Paprika says in each department (a line for her face's tooltip: her bar is where she is asked). */
export const SAY = {
  plate: "Show me the footage.",
  roto: "Click who I should cut out.",
  paint: "What is in the way?",
  light: "Where is the light coming from?",
  fx: "What shall we lay on it?",
  comp: "Everything is on the stack. Ready to finish?",
};

/** What the chat bar says in each department (no canned presets: Paprika's bar is her words). */
export const PLACEHOLDER = {
  plate: "Ask Paprika — trim it to the first four seconds, read its depth, what is in this shot?",
  roto: "Ask Paprika — cut out the chick, track the frog, feather the edge",
  paint: "Ask Paprika — remove the sign, take the subtitles off, paint out the wire",
  light: "Ask Paprika — a golden hour, snow on it, a stormy sky behind the frog",
  fx: "Ask Paprika — a portal behind the chameleon, flames in the pan, make it a storm",
  comp: "Ask Paprika — upscale it, slow it down, export it as a webm",
};

export const DEPARTMENTS = WORKSPACES.map((w) => w.id);

const o = (label, ask) => ({ label, ask });
/**
 * What Paprika offers above her bar in each department: words said to her, as if typed (she sets it up; anything that costs credits still
 * waits for a yes, with its price).
 */
export const OFFERS = {
  plate: [o("Trim to 4 s", "Trim it to the first four seconds"), o("Read the depth", "Read its depth"), o("What next?", "What should I do next with this shot?")],
  roto: [o("Cut out the hero", "Cut out the main character"), o("Them and what they hold", "Cut out the main character and what they hold")],
  paint: [o("Paint out the sign", "Remove the sign"), o("No subtitles", "Take the subtitles off")],
  light: [o("Golden hour", "Relight it as a warm golden hour"), o("Make it snow", "Make it snow, lightly"), o("Filmic grade", "Give it a filmic grade")],
  fx: [o("Sparks behind them", "Add sparks behind the main character"), o("A portal", "Put a glowing portal behind them"), o("Make it rain", "Make it rain")],
  comp: [o("Upscale to 1080p", "Upscale it to 1080p"), o("Slow it down", "Slow it down twice, the free way"), o("Export a WebM", "Export it as a webm")],
};
