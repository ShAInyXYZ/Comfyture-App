// Pickle's harness on Jam's side: who he is, the four workspaces he is told about, what he offers in each
// (his tools: a few words he sends himself), and what the chat bar says to the one that is open. His brief
// and the actions he may take are the server's (server/cut.ts, jamBrief); what he is told of the jam, and
// the actions Jam carries out, are in jam.js. Plain data, so the pet registry and the chat bar can read it.

export const PICKLE = {
  id: "pickle",
  name: "Pickle",
  tag: "band leader",
  face: "brand/cast/pickle-face.webp",
  portrait: "brand/cast/pickle.png",
};

/** Jam's four workspaces, in the order a music video is made. */
export const WORKSPACES = [
  { id: "track", name: "The track", title: "The track" },
  { id: "words", name: "The words", title: "The words" },
  { id: "band", name: "The band", title: "The band" },
  { id: "edit", name: "The edit", title: "The edit" },
];

/**
 * Pickle's tools: for each workspace, three things to ask of him with one press. `ask` is what is said to him
 * (it shows in the chat as the user's own words); `icon` names one of Jam's icons.
 */
export const PRESETS = {
  track: [
    { id: "drop", icon: "drop", label: "Find the drop", ask: "Start the video at the drop of the track." },
    { id: "trim", icon: "crop", label: "Trim to 15 s", ask: "Make the video 15 seconds long." },
    { id: "chorus", icon: "loop", label: "Use the chorus", ask: "Start the video at the loudest stretch of the track, the chorus." },
  ],
  words: [
    { id: "write", icon: "pencil", label: "Write the lyrics", ask: "Write short lyrics for this track, a line each, enough lines to fill the part, and put them on it." },
    { id: "split", icon: "words", label: "Split by words", ask: "Time every word of every line again, evenly." },
    { id: "bigger", icon: "size", label: "Bigger captions", ask: "Make the captions bigger." },
  ],
  band: [
    { id: "dance", icon: "copy", label: "Copy the dance", ask: "Make the shots dance shots, copying the dance." },
    { id: "lipsync", icon: "mic", label: "Lip-sync the chorus", ask: "Make the shots where the words are sung performance shots, so they are lip-synced." },
    { id: "swap", icon: "swap", label: "Swap the artist", ask: "Swap the artist for another of the crew." },
  ],
  edit: [
    { id: "bars", icon: "scissors", label: "Cut on every bar", ask: "Cut on every bar: move the cuts onto the nearest bar." },
    { id: "zoom", icon: "zoom", label: "Zoom on the drop", ask: "Put a zoom on every beat for the first eight seconds from the drop." },
    { id: "whip", icon: "whip", label: "Add a whip", ask: "Make the second clip come in with a whip." },
  ],
};

/** What the chat bar says in each workspace. */
export const PLACEHOLDER = {
  track: "Ask Pickle — find the drop, trim the track, use the chorus",
  words: "Ask Pickle — time the words, try a style, make them bigger",
  band: "Ask Pickle — copy the dance, sync the chorus, swap the artist",
  edit: "Ask Pickle — cut on the beat, zoom on the drop, add a whip",
};
export const jamPlaceholder = (workspace) => PLACEHOLDER[workspace] ?? PLACEHOLDER.track;
