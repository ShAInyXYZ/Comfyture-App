// Truffle's harness on Utensils' side: who she is, the eight workspaces the shelf is organised in and what the chat bar says
// in the one that is open. Her brief and the actions she may take are the server's (server/utensils-assist.ts); what she is
// told of the shelf is in utensils-assist.js. Plain data with no imports, so the pet registry (harnesses.js), the chat bar,
// the panel and the server's tests all read the same words.

export const TRUFFLE = {
  id: "truffle",
  name: "Truffle",
  tag: "shelf keeper",
  face: "brand/cast/truffle-face.webp",
  portrait: "brand/cast/truffle.png",
};

/**
 * The workspaces, in the order of the left panel. `icon` is a sprite name of the app. Home is where Utensils opens: a dashboard
 * that shows what every other workspace offers. Shelf is the bookcase: a book for every tool, coloured by the workspace it belongs to.
 * Picture, Video and Audio hold the one-job tools of each medium, VFX the effects that change a clip, Edit the free tools that run on
 * this machine, Templates the official ComfyUI workflows run on Comfy Cloud: the LIBRARY, which is not a page of the list but a frame
 * that opens in front of any workspace (its key under the list, utensils-library-frame.js; setWorkspace("templates") opens it). `color` is the workspace's own colour (the cloth of its
 * books on the Shelf, its brass plate's chip, the dot of its row in the panel): set here once so every part of Utensils agrees; Home
 * and Shelf have none (they are of every workspace).
 */
export const WORKSPACES = [
  { id: "home", name: "Home", icon: "tool-home" },
  { id: "shelf", name: "Shelf", icon: "tool-shelf" },
  { id: "picture", name: "Picture", icon: "image-library", color: "#d8673f" },
  { id: "video", name: "Video", icon: "film-make", color: "#b3273f" },
  { id: "audio", name: "Audio", icon: "audio-music", color: "#7a4fd6" },
  { id: "vfx", name: "VFX", icon: "tool-vfx", color: "#1f9484" },
  { id: "edit", name: "Edit", icon: "tool-edit", color: "#7f8a35" },
  { id: "templates", name: "Library", icon: "tool-templates", color: "#3a5bb5" },
];

/** What Truffle says at the left of her ledge in each workspace (a line, not a preset: her bar is where she is asked). */
export const SAY = {
  home: "What shall we make or fix?",
  shelf: "Which book do you need today?",
  picture: "Bring me a picture: I'll make it better.",
  video: "Give me a clip and say what it needs.",
  audio: "Music, a voice, a sound: what shall we hear?",
  vfx: "Which shot needs a trick?",
  edit: "Trim, crop, caption: free, on this machine.",
  templates: "Which workflow are you after?",
};

/** What the chat bar says in each workspace (no canned presets: Truffle's bar is her words). */
export const PLACEHOLDER = {
  home: "Ask Truffle — what do you want to make or fix?",
  shelf: "Ask Truffle — which book do you need?",
  picture: "Ask Truffle — upscale my latest picture, cut out its subject, make it night",
  video: "Ask Truffle — extend my latest clip, add sound to it, upscale it to 1080p",
  audio: "Ask Truffle — heavy rain on a tin roof, a warm acoustic track, split the stems",
  vfx: "Ask Truffle — remove the passer-by, relight the face, add rain",
  edit: "Ask Truffle — trim the first 3 seconds, crop for social, add captions",
  templates: "Ask Truffle — which workflow animates a photo? one for 3D from an image?",
};

const o = (label, ask) => ({ label, ask });
/** What Truffle offers above her bar in each workspace: words said to her, as if typed (a run that costs credits still waits for a yes). */
export const OFFERS = {
  home: [o("A better picture", "Upscale my latest picture"), o("Cut it out", "Cut out the subject of my latest picture"), o("Sound for a clip", "Add sound to my latest clip")],
  shelf: [o("Which book?", "Which book should I read to make a short film?")],
  picture: [o("Upscale it", "Upscale my latest picture"), o("Cut it out", "Cut out its subject"), o("Make it night", "Make it night")],
  video: [o("Extend it", "Extend my latest clip"), o("Add sound", "Add sound to my latest clip"), o("Upscale to 1080p", "Upscale my latest clip to 1080p")],
  audio: [o("Rain on a tin roof", "Heavy rain on a tin roof"), o("A warm acoustic track", "A warm acoustic track, 30 seconds"), o("Split the stems", "Split the stems of my latest song")],
  vfx: [o("Remove the passer-by", "Remove the passer-by from my latest clip"), o("Relight the face", "Relight the face, warm from the left"), o("Add rain", "Add rain to my latest clip")],
  edit: [o("Trim to 5 s", "Trim my latest clip to 5 seconds"), o("Make it vertical", "Reframe my latest clip to 9:16"), o("Captions", "Add captions to my latest clip")],
  templates: [o("Text to video", "Show me the best text to video workflows"), o("Upscale a video", "Which workflow upscales a video?")],
};
