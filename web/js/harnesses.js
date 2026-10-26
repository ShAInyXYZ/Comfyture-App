// The pets: one harness per product. A harness says who answers in the chat bar (the pet), what to call
// them, their face, what the bar asks in each room or workspace, and the quick actions (presets) offered
// there. It is data only. A pet's brief and the actions it may take live on the server, beside the reader
// that checks its answer (server/mixer-assist.ts, server/utensils-assist.ts, server/spice-assist.ts, server/macaron.ts; Kitchen's
// rooms keep the briefs they had), so a pet knows its own product and nothing else.
//
// tools: where the pet's presets are shown. "bar": as chips above the composer, for a product with no left
// panel of its own. "panel": in the product's own left panel (Macaron's), which says which of its workspaces is
// open with setRoom() and sends the words of a tool with tell().
// offers: what the pet offers above its bar in each room, whatever its tools: words said to it ({ label, ask }). A page may offer
// its own instead (setOffers: Toaster's Render page offers to dress the frame, write the prompt, rebuild from a photo), and every pet
// with a tour (web/js/tours/) offers to show you around.
//
// Its only imports are Jam's and Macaron's own harness data (web/js/jam-harness.js, web/js/macaron-harness.js: the pet,
// the workspaces, the tools), plain data like this module, so the server's tests can read the registry as well as the page.
import { PICKLE, WORKSPACES, PRESETS as JAM_PRESETS, PLACEHOLDER as JAM_PLACEHOLDER, OFFERS as JAM_OFFERS } from "./jam-harness.js";
import { BRIOCHE, PRESETS as MACARON_PRESETS, PLACEHOLDER as MACARON_PLACEHOLDER } from "./macaron-harness.js";
import { PAPRIKA, PLACEHOLDER as SPICE1_PLACEHOLDER, OFFERS as SPICE1_OFFERS } from "./spice-harness.js";
// (Spice is one room, the suite, of the one bar)
const SPICE_PLACEHOLDER = SPICE1_PLACEHOLDER;
const SPICE_OFFERS = SPICE1_OFFERS;
import { TRUFFLE, PLACEHOLDER as UTENSILS_PLACEHOLDER, OFFERS as UTENSILS_OFFERS } from "./utensils-harness.js";
import { CRUMPET, PLACEHOLDER as TOASTER_PLACEHOLDER, OFFERS as TOASTER_OFFERS } from "./toaster-harness.js";

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

  // music videos from a song: Pickle, his five workspaces and their words are Jam's own data, read as they are (no canned chips: his panel shows the video's pipeline)
  jam: {
    pet: PICKLE.id,
    name: PICKLE.name,
    tag: PICKLE.tag,
    face: PICKLE.face,
    tools: "panel",
    home: WORKSPACES[0].id,
    placeholders: JAM_PLACEHOLDER,
    presets: Object.fromEntries(Object.entries(JAM_PRESETS).map(([room, list]) => [room, list.map((t) => p(t.label, t.ask))])),
    offers: JAM_OFFERS,
  },

  // brand content: Brioche, her three workspaces and her tools are Macaron's own data; the bar offers the tools said to her
  // in words (the ones the page does itself, a picker or a window, stay in her panel)
  macaron: {
    pet: BRIOCHE.id,
    name: BRIOCHE.name,
    tag: BRIOCHE.tag,
    face: BRIOCHE.face,
    tools: "panel",
    home: "create",
    placeholders: MACARON_PLACEHOLDER,
    presets: Object.fromEntries(Object.entries(MACARON_PRESETS).map(([room, list]) => [room, list.filter((t) => t.ask).map((t) => p(t.label, t.ask))])),
  },

  // the VFX house: Paprika and the suite are Spice's own data (web/js/spice-harness.js); she has no canned tools: her panel shows the
  // scenario's shots, and her bar is her words
  spice: {
    pet: PAPRIKA.id,
    name: PAPRIKA.name,
    tag: PAPRIKA.tag,
    face: PAPRIKA.face,
    tools: "panel",
    home: "suite",
    placeholders: SPICE_PLACEHOLDER,
    presets: Object.fromEntries(Object.keys(SPICE_PLACEHOLDER).map((room) => [room, []])),
    offers: SPICE_OFFERS,
  },

  // the model maker: Crumpet, the baby beaver who builds the scene with you (web/js/toaster-harness.js); he has no canned tools: Toaster's
  // left panel is the draft, and his bar is his words
  toaster: {
    pet: CRUMPET.id,
    name: CRUMPET.name,
    tag: CRUMPET.tag,
    face: CRUMPET.face,
    tools: "panel",
    home: "toaster",
    placeholders: TOASTER_PLACEHOLDER,
    presets: { toaster: [] },
    offers: TOASTER_OFFERS,
  },

  // one-tool jobs: Truffle, her seven workspaces and what the bar says in each are Utensils' own data (web/js/utensils-harness.js);
  // she has no canned tools: her panel shows the queue and the recent results, and her bar is her words
  utensils: {
    pet: TRUFFLE.id,
    name: TRUFFLE.name,
    tag: TRUFFLE.tag,
    face: TRUFFLE.face,
    tools: "panel",
    home: "home",
    placeholders: UTENSILS_PLACEHOLDER,
    presets: Object.fromEntries(Object.keys(UTENSILS_PLACEHOLDER).map((room) => [room, []])),
    offers: UTENSILS_OFFERS,
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

// what a page offers for itself above its pet's bar, when it knows better than the harness (fn(room) → [{ label, ask } | { label, run, icon? }])
const pageOffers = new Map();
/** A page's own offers for its product's bar (null gives the harness's back). */
export function setOffers(product, fn) {
  if (fn) pageOffers.set(product, fn);
  else pageOffers.delete(product);
}
/**
 * The chips above a pet's bar in a room: the page's own offers when it gives them, else the room's presets (on a "bar" product) and the
 * pet's offers for the room. Each is { label, ask } (words said to the pet) or { label, run } (something the page does).
 */
export function offersOf(product, room = roomOf(product)) {
  const h = HARNESSES[product];
  if (!h) return [];
  const own = pageOffers.get(product)?.(room);
  if (own) return own;
  const presets = h.tools === "bar" ? (h.presets[room] ?? []).map((x) => ({ label: x.label, ask: x.text })) : [];
  return [...presets, ...(h.offers?.[room] ?? [])];
}

/** A pet's name and tag, as a face says it: "Praline · trend boss". */
export const introOf = (product) => (HARNESSES[product] ? `${HARNESSES[product].name} · ${HARNESSES[product].tag}` : "");
