// Brioche's harness on Macaron's side: who she is, the three workspaces she is told about, what she offers in each (her
// tools: a few words she is sent, or a thing the page does at once), and what the chat bar says in the one that is open.
// Her brief and the actions she may take are the server's (server/macaron.ts: macaronBrief, macaronTool and the tools'
// own instructions in PRESETS); what she is told of the brand is in macaron-assist.js; what the page does for a tool of
// its own is in macaron-tools.js. Plain data with no imports, so the pet registry (harnesses.js), the chat bar, the
// panel and the server's tests all read the same words.

export const BRIOCHE = {
  id: "brioche",
  name: "Brioche",
  tag: "brand room",
  face: "brand/cast/brioche-face.webp",
  portrait: "brand/macaron/brioche-portrait.webp",
};

/** Macaron's three workspaces, in the order a brand's work goes. `tile` is the picture on the panel's key for it. */
export const WORKSPACES = [
  { id: "idea", name: "Design idea", tile: "brand/macaron/tile-idea.webp" },
  { id: "kit", name: "Brand kit", tile: "brand/macaron/tile-kit.webp" },
  { id: "content", name: "Content", tile: "brand/macaron/tile-content.webp" },
];

/**
 * Brioche's tools: for each workspace, three keys. A tool with `ask` is something said to her (it shows in the chat as
 * the user's own words; `id` names the instructions she is given with it, in server/macaron.ts). A tool with `page` is
 * something the page does at once (macaron-tools.js says what). `icon` names one of Macaron's icons; `needs: "design"`
 * waits for a post to be open.
 */
export const PRESETS = {
  idea: [
    { id: "direction", icon: "pencil", label: "New direction", ask: "Give me a new direction for the mark and the look." },
    { id: "references", icon: "picture", label: "Add references", page: "references" },
    { id: "brief", icon: "doc", label: "Write the brief", ask: "Write the brief: the idea in two lines, three goals, and what is still empty." },
  ],
  kit: [
    { id: "colourway", icon: "palette", label: "Make a colourway", ask: "Make a colourway: a logo file on a ground of the palette that reads, one the kit does not show yet." },
    { id: "contrast", icon: "contrast", label: "Check contrast", page: "contrast" },
    { id: "export", icon: "export", label: "Export the kit", page: "export" },
  ],
  content: [
    { id: "post", icon: "pencil", label: "A post from a design", ask: "Make a new post from this design: another headline and subhead in the brand's voice, for a day that is free.", needs: "design" },
    { id: "story", icon: "play", label: "A story version", ask: "Lay this design out as a story.", needs: "design" },
    { id: "animate", icon: "clapper", label: "Animate it", ask: "Animate this design: a motion piece with its first timing.", needs: "design" },
  ],
};

/** What the chat bar says in each workspace. */
export const PLACEHOLDER = {
  idea: "Ask Brioche — a new direction, add references, write the brief",
  kit: "Ask Brioche — make a colourway, check contrast, export the kit",
  content: "Ask Brioche — a post from a design, a story version, animate it",
};
export const macaronPlaceholder = (workspace) => PLACEHOLDER[workspace] ?? PLACEHOLDER.content;
