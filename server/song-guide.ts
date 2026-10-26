// The guide Pickle writes songs by (knowledge/jam/acestep-guide.md): how to write tags, lyrics and settings for ACE-Step 1.5 XL and how
// they fit each other. Read once at start. The core (everything before "## Recipes") goes to Pickle in the chat bar, the whole of it, with
// the genre recipes and the LoRAs, to the one who sets a song up.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const file = join(resolve(import.meta.dirname, ".."), "knowledge", "jam", "acestep-guide.md");
export const SONG_GUIDE = readFileSync(file, "utf8").replace(/^<!--[\s\S]*?-->\n/, "").trim();
const at = SONG_GUIDE.indexOf("\n## Recipes");
export const SONG_GUIDE_CORE = (at > 0 ? SONG_GUIDE.slice(0, at) : SONG_GUIDE).trim();

/** How strongly a style LoRA is applied: half. At 1.0 (the strength they were made for) the sung words came through worse in our tests (Petit Matin with the acoustic LoRA: 51% of the words recovered by Whisper against 92% plain; at 0.5, 93%). */
export const LORA_STRENGTH = 0.5;

/** The style LoRAs the guide names, by the id the song form and the server use (the file's own table: genre, LoRA, trigger word). */
export const SONG_LORAS: { id: string; folder: string; trigger: string; genres: string }[] = [...SONG_GUIDE.matchAll(/^\| (.+?) \| (\w+) \| (roti-\w+) \|$/gm)].map((m) => ({ id: m[2], folder: `${m[2]}-acestep1.5-xl-v1`.replace(/^j_pop-acestep1\.5-xl-v1$/, "j_pop-xl-v1"), trigger: m[3], genres: m[1] }));
