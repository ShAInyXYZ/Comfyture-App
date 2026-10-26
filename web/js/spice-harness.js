// Paprika's harness on Spice's side: who she is, the one workspace of the suite and what the chat bar says in it. Her brief and the
// actions she may take are the server's (server/spice-assist.ts); what she is told of the scenario is in spice-assist.js. Plain data with
// no imports, so the pet registry (harnesses.js), the chat bar, the panel and the server's tests all read the same words.

export const PAPRIKA = {
  id: "paprika",
  name: "Paprika",
  tag: "VFX house",
  face: "brand/cast/paprika-face.webp",
  portrait: "brand/cast/paprika.png",
};

/** Spice is one room: the suite, where every tool is run on the shot open. */
export const WORKSPACES = [
  { id: "suite", name: "The suite", icon: "tool-fx-restyle", verb: "Run the tools", makes: "a pass of the shot: the clip the tool made, kept on the chain over the one it ran on" },
];

/** What Paprika says (a line for her face's tooltip: her bar is where she is asked). */
export const SAY = { suite: "Which tool, on which shot?" };

/** What the chat bar says (no canned presets: Paprika's bar is her words). */
export const PLACEHOLDER = { suite: "Ask Paprika — take the van out, turn the day to night, widen it to scope, sharpen the close-up, give it its sound" };

export const DEPARTMENTS = WORKSPACES.map((w) => w.id);

const o = (label, ask) => ({ label, ask });
/** What Paprika offers above her bar: words said to her, as if typed (she sets it up; anything that costs credits still waits for a yes, with its price). */
export const OFFERS = {
  suite: [o("Take it out", "Take the object out of this shot with the object remover"), o("Day to night", "Turn this shot's day to night"), o("Widen to scope", "Widen this shot to a 2.39 scope frame"), o("Its sound", "Give this shot its sound")],
};
