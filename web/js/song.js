// What a song is asked for: the choices ACE-Step 1.5 takes (its keys, languages and time signatures as the model's
// own node lists them), the lengths on offer, the structures lyrics are laid out in, and what a song costs. The page
// and the server share this file, so what is shown is what is accepted.

const NOTES = ["C", "C#", "Db", "D", "D#", "Eb", "E", "F", "F#", "Gb", "G", "G#", "Ab", "A", "A#", "Bb", "B"];
/** The 34 keys the model names: major, then minor. */
export const KEYS = ["major", "minor"].flatMap((mode) => NOTES.map((n) => `${n} ${mode}`));

export const LANGUAGES = [
  ["en", "English"], ["es", "Spanish"], ["fr", "French"], ["de", "German"], ["it", "Italian"], ["pt", "Portuguese"],
  ["ja", "Japanese"], ["ko", "Korean"], ["zh", "Chinese"], ["yue", "Cantonese"], ["ru", "Russian"], ["ar", "Arabic"],
  ["hi", "Hindi"], ["tr", "Turkish"], ["nl", "Dutch"], ["sv", "Swedish"], ["pl", "Polish"], ["uk", "Ukrainian"],
  ["id", "Indonesian"], ["th", "Thai"], ["vi", "Vietnamese"], ["he", "Hebrew"], ["fa", "Persian"], ["la", "Latin"],
].map(([value, label]) => ({ value, label }));

export const SIGNATURES = [
  { value: "4", label: "4/4", desc: "most songs" },
  { value: "3", label: "3/4", desc: "a waltz" },
  { value: "6", label: "6/8", desc: "a lilt" },
  { value: "2", label: "2/4", desc: "a march" },
];

/** How long the song runs, in seconds: it sets the length of the latent and the duration the text node is told. */
/** (A short song with a short prompt comes out poorly: a whole one is made, 200 to 300 s (E minor works great there), and the best part is cut from it later.) */
export const LENGTHS = [60, 120, 200, 240, 300];
export const DEFAULT_SONG = { seconds: 240, bpm: 120, key: "E minor", signature: "4", language: "en", structure: "pop", passes: 3, temperature: 0.75, adherence: 2.5, thinking: true, seed: 0, lora: "" };

/** The twelve notes and the two modes a key is chosen from (the model names them "A minor", "C# major"). */
export const PITCHES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export const MODES = ["major", "minor"];
export const noteOf = (key) => key.split(" ")[0].replace("Db", "C#").replace("Eb", "D#").replace("Gb", "F#").replace("Ab", "G#").replace("Bb", "A#");
export const modeOf = (key) => (key.endsWith("major") ? "major" : "minor");

/** Words a style is built from, a press adds or takes away: each lands in the style's tags. */
export const STYLE_WORDS = [
  ["Genre", ["lo-fi hip hop", "pop", "indie pop", "K-pop", "city pop", "R&B", "hip-hop", "trap", "rock", "EDM", "house", "synthwave", "jazz", "bossa nova", "folk", "cinematic"]],
  ["Mood", ["dreamy", "chill", "cozy", "playful", "energetic", "romantic", "melancholic", "dark", "uplifting", "nostalgic", "epic"]],
  ["Sound", ["soft Rhodes", "piano", "acoustic guitar", "electric guitar", "synth pads", "808 bass", "slap bass", "strings", "brass stabs", "tight drums", "vinyl crackle", "handclaps"]],
  ["Voice", ["female vocal", "male vocal", "duet vocals", "gang vocal chant", "breathy", "rapid-fire rap", "raw human voice, no autotune"]],
];

/** How a song is made: a draft is the first pass alone, the full song the first pass and two refinements of it. */
export const QUALITY = [[1, "Draft", "the first pass alone: quicker, cheaper"], [3, "Full", "three passes: what the XL is at its best"]];
export const MAX_SECONDS = 300;
export const lengthLabel = (s) => (s < 60 ? `${s} s` : s % 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : `${s / 60} min`);

/** The section tags a lyric is laid out in, as ACE-Step reads them: the tag on its own line, a short hint after a dash. */
export const SECTIONS = ["Intro", "Verse", "Pre-Chorus", "Chorus", "Bridge", "Outro", "Instrumental"];

/** The shapes a song takes: what each is for, and the sections it is laid out in (lyrics of a few lines each go under them). */
export const STRUCTURES = [
  { id: "hook", label: "A hook", desc: "a chorus that repeats", sections: ["Chorus", "Verse", "Chorus"] },
  { id: "short", label: "Verse and chorus", desc: "for a short video", sections: ["Verse 1", "Chorus"] },
  { id: "pop", label: "A full song", desc: "verses, choruses, a bridge", sections: ["Intro", "Verse 1", "Pre-Chorus", "Chorus", "Verse 2", "Pre-Chorus", "Chorus", "Bridge", "Final Chorus", "Outro"] },
  { id: "rap", label: "Rap with a hook", desc: "fast verses, a chant", sections: ["Intro - chant", "Verse 1 - rapid rap", "Chorus - chant hook", "Verse 2 - rapid rap", "Chorus - chant hook", "Outro"] },
  { id: "chant", label: "A chant", desc: "a crowd, a beat", sections: ["Intro - gang vocal chant", "Chorus - chant hook", "Chorus - chant hook"] },
  { id: "instrumental", label: "No words", desc: "music only", sections: [] },
];

/** The skeleton of a structure, to write words under: each section's tag and an empty line. */
export const skeleton = (id) => (STRUCTURES.find((s) => s.id === id)?.sections ?? []).map((s) => `[${s}]\n`).join("\n");

/** A line of the lyrics is a section tag. */
export const isTag = (line) => /^\s*\[[^\]]+\]\s*$/.test(line);

/** What the key that makes the song shows, roughly: Comfy Cloud bills a GPU second at 0.266 credits and the XL takes about a second and a half of them a second of music (a first pass of 50 steps, two of 20 and 15), with a little over for loading. */
export const costOfSong = (seconds, passes = 3) => Math.max(3, Math.round(((passes === 1 ? 0.9 : 1.45) * seconds + 12) * 0.266));

/** The style LoRAs on offer (on the person's own ComfyUI only: Comfy Cloud has none): the id, what it is for. Trigger words are the server's. */
export const STYLE_LORAS = [["lo_fi", "Lo-fi"], ["jazz", "Jazz"], ["pop", "Pop"], ["indie", "Indie"], ["acoustic", "Acoustic"], ["dream_pop", "Dream pop"], ["electropop", "Electropop"], ["j_pop", "J-pop"], ["experimental", "Experimental"]];
