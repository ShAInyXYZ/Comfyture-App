// The song designer's writer: Pickle, who asked for a song idea, answers with the whole setting for ACE-Step 1.5 XL
// (the style as tags, the lyrics laid out in sections, the tempo, key, language and time signature). What he answers is
// checked against the choices the model takes (web/js/song.js) before the page sees it.
import { KEYS, LANGUAGES, SIGNATURES, STRUCTURES, MAX_SECONDS } from "../web/js/song.js";
import { loose } from "./story.ts";

const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const clamp = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
};

export const SONG_BRIEF = `You are Pickle, the little green frog, Jam's band leader. The user gives you an idea for a song; you set up ACE-Step 1.5 XL, the model that makes it. Answer with JSON only, no other words:
{"name": "2-4 word title", "tags": "...", "lyrics": "...", "bpm": 120, "key": "A minor", "language": "en", "timesignature": "4", "seconds": 30}

TAGS: one line of comma-separated descriptors, English whatever the language of the words, 25 to 60 words:
 - the genre and sub-genre ("warm pop-funk", "lo-fi boom-bap", "Japanese comedy hip-hop"), the mood and energy ("playful high-energy", "melancholic late-night")
 - three to five instruments and the drum feel ("slap bass, bright brass stabs, tight live drums, bouncy breakbeat")
 - the voice: gender and delivery ("clear natural female lead vocal", "rapid-fire male rap", "breathy whisper", "gang vocal chant hooks"); add "no autotune, raw human voice" when it should sound human
 - one production word at most ("dry and close", "wide and glossy"). Never artist names, never lyrics, never a bpm or a key (they are set apart).
LYRICS: sections, each tag on its own line in square brackets with a blank line between sections. The tags: [Intro], [Verse 1], [Pre-Chorus - building], [Chorus - chant hook], [Verse 2], [Bridge - stripped beat], [Final Chorus - peak energy], [Outro], [Instrumental]. After the dash a short hint of the delivery ("rapid rap", "whispered", "gang vocal chant") is welcome, never more than four words.
 - Each line is short, six to ten syllables, sung or rapped in one breath; one line is about three seconds of song (a rap line about two). Count: about (seconds minus 6) divided by 3 lines in all, never more. A 30 s song is an intro of a line or two, a verse of four lines and a chorus of four.
 - A chorus repeats word for word each time it comes. Rhyme the ends of lines in pairs. Say one concrete thing in a line, not an abstraction.
 - Write the words in the language asked for; only the tags stay in English. For a song without words, the lyrics are exactly "[Instrumental]".
 - Never write a line that names a real person or quotes a real song.
SETTINGS: bpm 60 to 200 to suit the genre (hip-hop 85 to 100 or 130 to 150 double-time, pop 100 to 125, dance 120 to 130, ballad 60 to 80). key is one of: ${KEYS.join(", ")}; minor for dark or driving, major for bright. timesignature "4" unless it is a waltz ("3") or a lilt ("6"). language is the code asked for: ${LANGUAGES.map((l) => l.value).join(", ")}. seconds is the length asked for; keep it.
When a CURRENT song is given and the user asks for a change, change only what they asked and keep the rest as it is. When the user gave their own lyrics, keep their words, only laying them out in sections.`;

export function songPrompt(v: { idea?: string; seconds?: number; language?: string; structure?: string; current?: { tags?: string; lyrics?: string; bpm?: number; key?: string } }) {
  const lines = [`THE IDEA: ${text(v.idea, 600) || "a catchy song for a short music video"}`, `LENGTH: ${clamp(v.seconds, 10, MAX_SECONDS, 30)} seconds`, `LANGUAGE: ${LANGUAGES.find((l) => l.value === v.language)?.value ?? "en"}`];
  const shape = STRUCTURES.find((s) => s.id === v.structure);
  if (shape) lines.push(`STRUCTURE: ${shape.label}: ${shape.sections.length ? shape.sections.map((s) => `[${s}]`).join(" ") : "no words, music only"}`);
  const c = v.current;
  if (c?.tags || c?.lyrics) lines.push("", "CURRENT SONG:", `tags: ${text(c.tags, 500)}`, `bpm: ${clamp(c.bpm, 10, 300, 120)}, key: ${text(c.key, 20)}`, `lyrics:\n${String(c.lyrics ?? "").slice(0, 2500)}`);
  return lines.join("\n");
}

/** The song as the page can use it: every setting one the model takes, the lyrics' sections each on their own line. */
export function readSong(reply: string, seconds: number, language: string) {
  let raw: any;
  try {
    raw = loose(reply);
  } catch {
    throw new Error("Pickle's answer didn't come back whole. Try again?");
  }
  const tags = text(raw?.tags, 600);
  if (!tags) throw new Error("Pickle wrote no style for it. Try again?");
  const lyrics = String(raw?.lyrics ?? "").replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 3000);
  const key = KEYS.find((k) => k.toLowerCase() === text(raw?.key, 12).toLowerCase()) ?? "C major";
  return {
    name: text(raw?.name, 40) || "New song",
    tags,
    lyrics: lyrics || "[Instrumental]",
    bpm: clamp(raw?.bpm, 40, 220, 120),
    key,
    language: LANGUAGES.find((l) => l.value === raw?.language)?.value ?? language,
    timesignature: SIGNATURES.find((s) => s.value === String(raw?.timesignature))?.value ?? "4",
    seconds,
  };
}
