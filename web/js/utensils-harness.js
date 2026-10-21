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
 * that shows what every other workspace offers. Shelf is the plain catalogue of every tool. Picture, Video and Audio hold the
 * one-job tools of each medium, VFX the effects that change a clip, Edit the free tools that run on this machine, Templates the
 * official ComfyUI workflows run on Comfy Cloud.
 */
export const WORKSPACES = [
  { id: "home", name: "Home", icon: "tool-home" },
  { id: "shelf", name: "Shelf", icon: "tool-shelf" },
  { id: "picture", name: "Picture", icon: "image-library" },
  { id: "video", name: "Video", icon: "film-make" },
  { id: "audio", name: "Audio", icon: "audio-music" },
  { id: "vfx", name: "VFX", icon: "tool-vfx" },
  { id: "edit", name: "Edit", icon: "tool-edit" },
  { id: "templates", name: "Templates", icon: "tool-templates" },
];

/** What the chat bar says in each workspace (no canned presets: Truffle's bar is her words). */
export const PLACEHOLDER = {
  home: "Ask Truffle — what do you want to make or fix?",
  shelf: "Ask Truffle — upscale my last picture, take the wind out of this clip",
  picture: "Ask Truffle — upscale my latest picture, cut out its subject, make it night",
  video: "Ask Truffle — extend my latest clip, add sound to it, upscale it to 1080p",
  audio: "Ask Truffle — heavy rain on a tin roof, a warm acoustic track, split the stems",
  vfx: "Ask Truffle — remove the passer-by, relight the face, add rain",
  edit: "Ask Truffle — trim the first 3 seconds, crop for social, add captions",
  templates: "Ask Truffle — a template that animates a photo, one for 3D from an image",
};
