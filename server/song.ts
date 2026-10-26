// The song designer's writer: Pickle, who asked for a song idea, answers with the whole setting for ACE-Step 1.5 XL
// (the style as tags, the lyrics laid out in sections, the tempo, key, language and time signature). What he answers is
// checked against the choices the model takes (web/js/song.js) before the page sees it.
import { KEYS, LANGUAGES, SIGNATURES, STRUCTURES, MAX_SECONDS, DEFAULT_SONG } from "../web/js/song.js";
import { loose } from "./story.ts";
import { SONG_GUIDE, SONG_LORAS } from "./song-guide.ts";

const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const clamp = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
};

export const SONG_BRIEF = `You are Pickle, the little green frog, Jam's band leader. The user gives you an idea for a song; you set up ACE-Step 1.5 XL, the model that makes it, by the guide below. Answer with JSON only, no other words:
{"name": "2-4 word title", "tags": "...", "lyrics": "...", "bpm": 120, "key": "E minor", "language": "en", "timesignature": "4", "seconds": 240, "lora": ""}
tags and lyrics are written as the guide says. key is one of: ${KEYS.join(", ")}. language is the code asked for: ${LANGUAGES.map((l) => l.value).join(", ")}. seconds is the length asked for; keep it. lora is "" or the id of a style LoRA of the guide's table when the song is that genre and the user asked for the best sound (it only works on their own ComfyUI): the server puts the trigger word in the tags for you, so never write it. Never write a line that names a real person or quotes a real song; for a song without words the lyrics are exactly "[Instrumental]". When a CURRENT song is given and the user asks for a change, change only what they asked and keep the rest as it is. When the user gave their own lyrics, keep their words, only laying them out in sections.

${SONG_GUIDE}`;

export function songPrompt(v: { idea?: string; seconds?: number; language?: string; structure?: string; current?: { tags?: string; lyrics?: string; bpm?: number; key?: string } }) {
  const lines = [`THE IDEA: ${text(v.idea, 600) || "a catchy song for a short music video"}`, `LENGTH: ${clamp(v.seconds, 10, MAX_SECONDS, DEFAULT_SONG.seconds)} seconds`, `LANGUAGE: ${LANGUAGES.find((l) => l.value === v.language)?.value ?? "en"}`];
  const shape = STRUCTURES.find((s) => s.id === v.structure);
  if (shape) lines.push(`STRUCTURE: ${shape.label}: ${shape.sections.length ? shape.sections.map((s) => `[${s}]`).join(" ") : "no words, music only"}`);
  const c = v.current;
  if (c?.tags || c?.lyrics) lines.push("", "CURRENT SONG:", `tags: ${text(c.tags, 500)}`, `bpm: ${clamp(c.bpm, 10, 300, DEFAULT_SONG.bpm)}, key: ${text(c.key, 20)}`, `lyrics:\n${String(c.lyrics ?? "").slice(0, 2500)}`);
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
  const key = KEYS.find((k) => k.toLowerCase() === text(raw?.key, 12).toLowerCase()) ?? DEFAULT_SONG.key;
  return {
    name: text(raw?.name, 40) || "New song",
    tags,
    lyrics: lyrics || "[Instrumental]",
    bpm: clamp(raw?.bpm, 40, 220, DEFAULT_SONG.bpm),
    key,
    language: LANGUAGES.find((l) => l.value === raw?.language)?.value ?? language,
    timesignature: SIGNATURES.find((s) => s.value === String(raw?.timesignature))?.value ?? "4",
    seconds,
    lora: SONG_LORAS.find((l) => l.id === raw?.lora)?.id ?? "",
  };
}
