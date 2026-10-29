// Pickle's harness on Jam's side: the workspaces and what the chat bar says in each one.
// His brief and the actions he may take are the server's (server/cut.ts, jamBrief); what he is told of the jam, and the
// actions Jam carries out, are in jam.js. Plain data, so the pet registry and the chat bar can read it.

export const PICKLE = {
  id: "pickle",
  name: "Pickle",
  tag: "band leader",
  face: "brand/cast/pickle-face.webp",
  portrait: "brand/cast/pickle.png",
};

/**
 * Jam's workspaces, from the song and its timeline through visual scenes, captions, performance and the edit. `title` is
 * the page's big title, `tag` the three short lines of mono under it that say what the workspace is for.
 */
export const WORKSPACES = [
  { id: "song", name: "The song", title: "The song", tag: ["Say what it is about", "Shape it", "Make it"] },
  { id: "track", name: "The track", title: "The track", tag: ["Hear the song", "Isolate the stems", "Find the beat", "Choose your cut"] },
  { id: "backstage", name: "Backstage", title: "Backstage", tag: ["Plan the scenes", "Create your cast", "Build the visual story"] },
  { id: "words", name: "The words", title: "The words", tag: ["Edit the synced lyrics", "Choose original or romaji", "Style the captions"] },
  { id: "band", name: "The band", title: "The band", tag: ["Cast the crew", "Copy the dance", "Pick the look"] },
  { id: "edit", name: "The edit", title: "The edit", tag: ["Cut on the beat", "Add the effects", "Export the video"] },
];

/**
 * Pickle has no row of canned tools (they were sentences sent to him, acting on whatever happened to be open): what the panel
 * shows under the workspaces is the video's pipeline, and the bar is his words. The registry still wants a list per room.
 */
export const PRESETS = { song: [], track: [], backstage: [], words: [], band: [], edit: [] };

/** What the chat bar says in each workspace. */
export const PLACEHOLDER = {
  song: "Ask Pickle — a dreamy winter song, in Japanese",
  track: "Ask Pickle — find the drop, trim the track, use the chorus",
  backstage: "Ask Pickle — help me plan a visual story for this song",
  words: "Ask Pickle — time the words, try a style, make them bigger",
  band: "Ask Pickle — copy the dance, sync the chorus, swap the artist",
  edit: "Ask Pickle — cut on the beat, zoom on the drop, add a whip",
};
export const jamPlaceholder = (workspace) => PLACEHOLDER[workspace] ?? PLACEHOLDER.track;

const o = (label, ask) => ({ label, ask });
/**
 * What Pickle offers above his bar in each workspace: words said to him, as if typed, about the workspace open (so they act on what is in
 * front of you). Making a song, hearing the words and making the video still wait for your key, with their price.
 */
export const OFFERS = {
  song: [o("A sunny pop song", "Write a sunny pop song about a frog band on a summer night, in English"), o("Slower, dreamier", "Make it slower and dreamier"), o("In Japanese", "Make the song in Japanese")],
  track: [o("Use the chorus", "Start the part at the chorus"), o("15 seconds", "Make the video 15 seconds"), o("From the drop", "Start the part at the drop")],
  backstage: [],
  words: [o("Karaoke", "Karaoke captions"), o("Bigger words", "Make the words bigger"), o("Neon", "Neon captions")],
  band: [o("Who can sing it?", "Who of the crew could perform it?"), o("A cosy vibe", "Set the vibe: a cosy room with fairy lights"), o("A shot every bar", "Cut a shot every bar")],
  edit: [o("A first edit", "Make a first edit on the beat"), o("Zoom on every bar", "Zoom on every bar"), o("Export it", "Export the video")],
};
