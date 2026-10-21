// Pickle's harness on Jam's side: who he is, the five workspaces he is told about, and what the chat bar says to the one that
// is open. His brief and the actions he may take are the server's (server/cut.ts, jamBrief); what he is told of the jam, and the
// actions Jam carries out, are in jam.js. Plain data, so the pet registry and the chat bar can read it.

export const PICKLE = {
  id: "pickle",
  name: "Pickle",
  tag: "band leader",
  face: "brand/cast/pickle-face.webp",
  portrait: "brand/cast/pickle.png",
};

/**
 * Jam's five workspaces, in the order a music video is made: the song, then its track, its words, its band, its edit. `title` is
 * the page's big title, `tag` the three short lines of mono under it that say what the workspace is for.
 */
export const WORKSPACES = [
  { id: "song", name: "The song", title: "The song", tag: ["Say what it is about", "Shape it", "Make it"] },
  { id: "track", name: "The track", title: "The track", tag: ["Hear the song", "Isolate the stems", "Find the beat", "Choose your cut"] },
  { id: "words", name: "The words", title: "The words", tag: ["Hear the lyrics", "Style the captions", "Bring the song to life"] },
  { id: "band", name: "The band", title: "The band", tag: ["Cast the crew", "Copy the dance", "Pick the look"] },
  { id: "edit", name: "The edit", title: "The edit", tag: ["Cut on the beat", "Add the effects", "Export the video"] },
];

/**
 * Pickle has no row of canned tools (they were sentences sent to him, acting on whatever happened to be open): what the panel
 * shows under the workspaces is the video's pipeline, and the bar is his words. The registry still wants a list per room.
 */
export const PRESETS = { song: [], track: [], words: [], band: [], edit: [] };

/** What the chat bar says in each workspace. */
export const PLACEHOLDER = {
  song: "Ask Pickle — a dreamy winter song, in Japanese",
  track: "Ask Pickle — find the drop, trim the track, use the chorus",
  words: "Ask Pickle — time the words, try a style, make them bigger",
  band: "Ask Pickle — copy the dance, sync the chorus, swap the artist",
  edit: "Ask Pickle — cut on the beat, zoom on the drop, add a whip",
};
export const jamPlaceholder = (workspace) => PLACEHOLDER[workspace] ?? PLACEHOLDER.track;
