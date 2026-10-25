// Crumpet's harness on Toaster's side: who he is and what his bar says. His brief and the actions he may take are the server's
// (server/toaster-assist.ts); what he is told of the draft and how his actions are made is in toaster-assist.js. Plain data with no
// imports, so the pet registry (harnesses.js), the chat bar, the page and the server's tests all read the same words.

export const CRUMPET = {
  id: "crumpet",
  name: "Crumpet",
  tag: "model maker",
  face: "brand/cast/crumpet-face.webp",
};

/** What the chat bar says (Toaster has one room: the draft open). Crumpet has no canned presets: his bar is his words. */
export const PLACEHOLDER = {
  toaster: "Ask Crumpet — a cosy reading corner with a sofa, two shelves and a lamp, camera low · or attach a photo to rebuild",
};

const o = (label, ask) => ({ label, ask });
/** What Crumpet offers above his bar on the Scene (the Render page offers its own: dress the frame, write the prompt, rebuild from a photo). */
export const OFFERS = {
  toaster: [o("A reading corner", "Build a cosy reading corner: a sofa, two shelves and a lamp, camera low"), o("Add someone", "Add a person sitting on the sofa, reading a book"), o("Frame it closer", "Frame the scene closer, with a 50 mm lens")],
};
