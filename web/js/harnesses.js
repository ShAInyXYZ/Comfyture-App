// The pets: one harness per product. A harness says who answers in the chat bar (the pet), what to call
// them, their face, what the bar asks in each room or workspace, and the quick actions (presets) offered
// there. It is data only. A pet's brief and the actions it may take live on the server, beside the reader
// that checks its answer (server/mixer-assist.ts, server/utensils-assist.ts, server/macaron.ts; Kitchen's
// rooms keep the briefs they had), so a pet knows its own product and nothing else.
//
// tools: where the pet's presets are shown. "bar": as chips above the composer, for a product with no left
// panel of its own. "panel": in the product's own left panel (Jam's and Macaron's), which says which of its
// workspaces is open with setRoom() and sends the words of a tool with tell(); such a product's bar is one
// row (the face, the words, the model, the send key), where the others' is a card with its keys under the words.
//
// Its only imports are Jam's and Macaron's own harness data (web/js/jam-harness.js, web/js/macaron-harness.js: the pet,
// the workspaces, the tools), plain data like this module, so the server's tests can read the registry as well as the page.
import { PICKLE, WORKSPACES, PRESETS as JAM_PRESETS, PLACEHOLDER as JAM_PLACEHOLDER } from "./jam-harness.js";
import { BRIOCHE, PRESETS as MACARON_PRESETS, PLACEHOLDER as MACARON_PLACEHOLDER } from "./macaron-harness.js";

const p = (label, text) => ({ label, text });

export const HARNESSES = {
  // the director's studio: one pet in front of every room's own assistant
  kitchen: {
    pet: "ketkout",
    name: "Ketkout",
    tag: "head chef",
    face: "brand/cast/ketkout-face.webp",
    tools: "bar",
    placeholders: {
      story: "Ask Ketkout — add a scene where Mara finds the jellyfish",
      stage: "Ask Ketkout — two people arguing by a wall, low angle",
      shot: "Ask Ketkout — describe the shot · @ for a file",
      cut: "Ask Ketkout — trim the first shot to 3 s and put rain under scene 2",
    },
    presets: {
      story: [p("Add a scene", "Add a scene that raises the stakes"), p("Tighten the lines", "Tighten the lines: shorter, nothing that doesn't move the story"), p("Stronger ending", "Make the ending land harder")],
      stage: [p("Two people talking", "Two people talking, a wall behind them, wide shot"), p("Low angle", "Put the camera low, looking up at them"), p("Slow push-in", "The camera pushes in slowly over five seconds"), p("Add a table", "Add a table between them")],
      shot: [p("Slow push-in", "Make the camera a slow push-in"), p("Draft test", "Set it to draft quality, one take, so I can test fast"), p("Add a line", "Add one short line of dialogue that fits"), p("Next shot", "Open the next shot from the last frame of my latest take")],
      cut: [p("Dissolve every join", "Dissolve between every clip"), p("Warm grade", "Grade every clip warm"), p("Fade out", "Fade the last clip out to black over one second"), p("Trim to 3 s", "Trim every clip to 3 seconds")],
    },
  },

  // trends, made yours
  mixer: {
    pet: "praline",
    name: "Praline",
    tag: "trend boss",
    face: "brand/mixer/crew/praline-face.webp",
    tools: "bar",
    placeholders: { trends: "Ask Praline — the hottest trend with Mochi in the lead, then make it" },
    presets: {
      trends: [p("Hottest trend", "Pick the hottest trend on the shelf"), p("Swap the lead", "Swap the lead for another of the crew"), p("My last mix", "Open my last mix"), p("Make it", "Make it")],
    },
  },

  // music videos from a track: Pickle, his four workspaces, their words and their tools are Jam's own data, read as they are
  jam: {
    pet: PICKLE.id,
    name: PICKLE.name,
    tag: PICKLE.tag,
    face: PICKLE.face,
    tools: "panel",
    home: WORKSPACES[0].id,
    placeholders: JAM_PLACEHOLDER,
    presets: Object.fromEntries(Object.entries(JAM_PRESETS).map(([room, list]) => [room, list.map((t) => p(t.label, t.ask))])),
  },

  // brand content: Brioche, her three workspaces and her tools are Macaron's own data; the bar offers the tools said to her
  // in words (the ones the page does itself, a picker or a window, stay in her panel)
  macaron: {
    pet: BRIOCHE.id,
    name: BRIOCHE.name,
    tag: BRIOCHE.tag,
    face: BRIOCHE.face,
    tools: "panel",
    home: "content",
    placeholders: MACARON_PLACEHOLDER,
    presets: Object.fromEntries(Object.entries(MACARON_PRESETS).map(([room, list]) => [room, list.filter((t) => t.ask).map((t) => p(t.label, t.ask))])),
  },

  // one-tool jobs: the workspaces are the shelf's three groups
  utensils: {
    pet: "truffle",
    name: "Truffle",
    tag: "toolsmith",
    face: "brand/cast/truffle-face.webp",
    tools: "bar",
    placeholders: {
      picture: "Ask Truffle — upscale my latest picture, or cut out its subject",
      video: "Ask Truffle — extend my latest clip, or add sound to it",
      sound: "Ask Truffle — a warm acoustic track, a glass jar lid popping open",
    },
    presets: {
      picture: [p("Upscale", "Upscale my latest picture"), p("Remove background", "Remove the background of my latest picture"), p("Four variations", "Four variations of my latest picture")],
      video: [p("Extend", "Extend my latest clip by five seconds"), p("Add sound", "Add sound to my latest clip"), p("Upscale video", "Upscale my latest clip to 1080p")],
      sound: [p("A track", "Make a track: warm acoustic folk, 30 seconds"), p("A sound effect", "Make a sound effect: a glass jar lid popping open")],
    },
  },
};

export const harnessOf = (product) => HARNESSES[product] ?? null;

// the workspace a product has open when its own panel says so (Kitchen's rooms are their pages instead)
const open = {};
const listeners = new Set();
/** The workspace of a product that is open now: the last one told, else its first. */
export function roomOf(product) {
  const h = HARNESSES[product];
  return h ? (open[product] in h.placeholders ? open[product] : h.home in h.placeholders ? h.home : Object.keys(h.placeholders)[0]) : null;
}
/** A product's panel says which of its workspaces is open, so the bar asks and offers what fits it. */
export function setRoom(product, room) {
  if (!HARNESSES[product] || !(room in HARNESSES[product].placeholders) || open[product] === room) return;
  open[product] = room;
  for (const fn of listeners) fn(product, room);
}
export const onRoom = (fn) => listeners.add(fn);

/** What the bar asks, and the presets it offers, in a room: a Kitchen page, or the workspace open in another product. */
export function barOf(product, room = roomOf(product)) {
  const h = HARNESSES[product];
  const at = room in h.placeholders ? room : roomOf(product);
  return { placeholder: h.placeholders[at], presets: h.presets[at] ?? [] };
}

// what a preset sends: the chat bar says how, once it is on screen
let teller = null;
export const setTeller = (fn) => (teller = fn);
/** Says something to the pet of the page, as if typed in its bar (a preset chip in a left panel). */
export const tell = (text) => teller?.(text);

/** A pet's name and tag, as a face says it: "Praline · trend boss". */
export const introOf = (product) => (HARNESSES[product] ? `${HARNESSES[product].name} · ${HARNESSES[product].tag}` : "");
