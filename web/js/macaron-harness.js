// Brioche's harness on Macaron's side: who she is, the five workspaces she is told about and what the chat bar says in the
// one that is open. Her brief and the actions she may take are the server's (server/macaron.ts: macaronBrief, macaronTool);
// what she is told of the brand in each workspace is in macaron-assist.js (summary), and only what that workspace needs.
// Plain data with no imports, so the pet registry (harnesses.js), the chat bar, the panel and the server's tests all read
// the same words.

export const BRIOCHE = {
  id: "brioche",
  name: "Brioche",
  tag: "brand room",
  face: "brand/cast/brioche-face.webp",
  portrait: "brand/macaron/brioche-portrait.webp",
};

/**
 * Macaron's five workspaces, in the order the panel shows them: the kit first (the brand itself: what everything else is made from),
 * then the idea behind it, the Studio that makes the raw material
 * (photography, UGC stories, motion graphics, the product), Create that makes everything from it (social, ads, print, web,
 * app, mockups, video) and the Brand book that gathers it all into the document a designer hands over.
 * Brioche is told only about the one that is open.
 */
export const WORKSPACES = [
  { id: "kit", name: "Brand kit" },
  { id: "idea", name: "Design idea" },
  { id: "studio", name: "Studio" },
  { id: "create", name: "Create" },
  { id: "book", name: "Brand book" },
];

/**
 * Brioche's panel has no row of canned tools any more (they were sentences sent to her, acting on a post nobody had chosen):
 * what the panel shows under the workspaces is the brand's health (web/js/macaron-health.js), and the few shortcuts that help
 * live inside the window of the thing they act on. The bar's chips are the same: none.
 */
export const PRESETS = { idea: [], kit: [], studio: [], create: [], book: [] };

/** What the chat bar says in each workspace. */
export const PLACEHOLDER = {
  kit: "Ask Brioche — a new pattern, a colourway that reads on ink, check the contrast",
  idea: "Ask Brioche — a new direction, write the brief, what the moodboard is missing",
  studio: "Ask Brioche — a shoot of the jar, a UGC story, a logo sting",
  create: "Ask Brioche — a post from this design, a story version, a poster for the sale",
  book: "Ask Brioche — what the book is missing, write its story page, check the brand",
};
export const macaronPlaceholder = (workspace) => PLACEHOLDER[workspace] ?? PLACEHOLDER.create;
