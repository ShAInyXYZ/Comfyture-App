// Utensils' knowledge: what every tool and every Library workflow is, how it works, what it takes and gives, what it costs and what
// goes before and after it (knowledge/utensils/tools.json, written by hand, and workflows.json, built by scripts/utensils-knowledge.ts).
// Truffle is given the best matches for a job from here (server/utensils-assist.ts), the Library and the guide read entries by id.
// The files are read once and read again when they change on disk; the search is BM25 over the entries' words.
import { readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

export type Kind = "image" | "video" | "audio" | "words" | "3d" | "mask" | "none";
export interface Entry {
  id: string;
  kind: "tool" | "workflow";
  name: string;
  section: string;
  category: string;
  what: string;
  how: string;
  takes: Kind[];
  gives: Kind[];
  goodFor: string[];
  limits: string[];
  use: string[];
  models: string[];
  cost: "free" | "gpu" | "partner";
  credits: number | null;
  before: string[];
  after: string[];
  tutorial: string | null;
  open: { workspace: string; tool?: string; workflow?: string };
  keywords: string[];
  curated: string[];
}
export interface Hit { entry: Entry; score: number }

const ROOT = resolve(import.meta.dirname, "..");
const FILES = ["tools.json", "workflows.json"];

// ---------------------------------------------------------------- words

const STOP = new Set("a an the my our your his her their its of to from into in on at by with for and or but me i we you it this that these those is are be can could would should will do does did how what which who want need like please some any just get make made makes using use one two".split(" "));
/** Words that mean the same job: any of them in a question also looks for the others (a little less strongly). */
const SYNONYMS: string[][] = [
  ["background", "bg", "backdrop"],
  ["upscale", "upscaler", "sharpen", "enlarge", "bigger", "larger", "resolution", "4k", "hd", "upres"],
  ["video", "clip", "footage", "movie"],
  ["music", "song", "track", "tune", "soundtrack", "instrumental"],
  ["voice", "speech", "tts", "narration", "voiceover", "narrate", "speaking"],
  ["talk", "speak", "lipsync", "lip", "mouth", "talking"],
  ["picture", "image", "photo", "pic", "photograph", "still"],
  ["remove", "erase", "delete", "rid"],
  ["sfx", "foley"],
  ["3d", "mesh", "glb", "splat"],
  ["trim", "shorten", "cut"],
  ["animate", "motion", "alive", "moving"],
  ["caption", "subtitle"],
  ["relight", "lighting", "light"],
  ["green", "chroma", "greenscreen"],
  ["stabilise", "stabilize", "shaky", "steady"],
  ["slowmo", "slow"],
  ["reframe", "crop", "vertical", "aspect"],
  ["merge", "join", "combine", "concatenate"],
  ["stem", "separate", "isolate", "vocal", "karaoke", "acapella"],
  ["clean", "denoise", "noisy", "hiss"],
  ["master", "loudness", "loud"],
  ["extend", "longer", "continue", "lengthen"],
  ["variation", "version", "variant", "alternative"],
  ["grade", "color", "colour", "tint"],
  ["restyle", "style", "stylize", "stylise"],
  ["clone", "cloned", "mimic"],
  ["logo", "watermark"],
  ["reverse", "backward", "backwards"],
  ["gif", "animated"],
  ["sparkle", "spark", "particle", "glitter"],
  ["retouch", "skin", "blemish"],
];
const SYN = new Map<string, string[]>();
for (const group of SYNONYMS) for (const w of group) SYN.set(stem(w), group.map(stem).filter((x) => x !== stem(w)));

/** A word made plain: lower case, a plural s taken off (photos is photo, stories is story). */
function stem(w: string) {
  if (w.length > 4 && w.endsWith("ies")) return `${w.slice(0, -3)}y`;
  if (w.length > 3 && w.endsWith("s") && !/(ss|us|is)$/.test(w)) return w.slice(0, -1);
  return w;
}
/** The words of a text, made plain, the small ones left out. */
export function words(text: string): string[] {
  return String(text ?? "")
    .toLowerCase()
    .replace(/colour/g, "color")
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !STOP.has(w))
    .map(stem);
}

// ---------------------------------------------------------------- the index

interface Doc { entry: Entry; tf: Map<string, number>; len: number }
interface Loaded { stamp: string; entries: Entry[]; byId: Map<string, Entry>; docs: Doc[]; df: Map<string, number>; avg: number }
let loaded: Loaded | null = null;
let loadedRoot = "";

/** How strongly each field speaks for an entry. */
const FIELDS: [keyof Entry, number][] = [["name", 3], ["keywords", 2], ["goodFor", 2], ["what", 1], ["how", 1], ["category", 1]];

function indexOf(entries: Entry[]) {
  const docs: Doc[] = entries.map((entry) => {
    const tf = new Map<string, number>();
    let len = 0;
    for (const [f, weight] of FIELDS) {
      const v = entry[f];
      for (const w of words(Array.isArray(v) ? v.join(" ") : String(v ?? ""))) {
        tf.set(w, (tf.get(w) ?? 0) + weight);
        len += weight;
      }
    }
    return { entry, tf, len };
  });
  const df = new Map<string, number>();
  for (const d of docs) for (const w of d.tf.keys()) df.set(w, (df.get(w) ?? 0) + 1);
  const avg = docs.reduce((n, d) => n + d.len, 0) / Math.max(1, docs.length);
  return { docs, df, avg };
}

/** Every entry, tools first: read once, and again when a file changes. */
export function loadKnowledge(root = ROOT): Entry[] {
  const dir = join(root, "knowledge", "utensils");
  const stamp = FILES.map((f) => {
    try {
      const s = statSync(join(dir, f));
      return `${s.mtimeMs}:${s.size}`;
    } catch {
      return "none";
    }
  }).join("|");
  if (loaded && loadedRoot === root && loaded.stamp === stamp) return loaded.entries;
  const entries: Entry[] = FILES.flatMap((f) => {
    try {
      const list = JSON.parse(readFileSync(join(dir, f), "utf8"));
      return Array.isArray(list) ? list.filter((e) => e && typeof e.id === "string") : [];
    } catch {
      return [];
    }
  });
  loaded = { stamp, entries, byId: new Map(entries.map((e) => [e.id, e])), ...indexOf(entries) };
  loadedRoot = root;
  return entries;
}

/** One entry by its id (a tool's id, or wf:<template name>), or null. */
export function knowledgeById(id: string, root = ROOT): Entry | null {
  loadKnowledge(root);
  return loaded?.byId.get(String(id ?? "")) ?? null;
}

// ---------------------------------------------------------------- the search

/** Words that name what the job is about (a song, a clip, a photo, a 3D model): an entry that neither takes nor gives it falls back. */
const MEDIUM: Record<string, string[]> = {
  audio: ["song", "music", "sound", "audio", "voice", "sfx", "track", "tune", "podcast", "speech", "narration", "voiceover", "jingle", "beat"],
  video: ["video", "clip", "footage", "film", "movie", "animation", "animate", "reel", "tiktok", "short"],
  image: ["picture", "image", "photo", "pic", "poster", "illustration", "drawing", "thumbnail", "portrait", "photograph", "logo"],
  "3d": ["3d", "mesh", "glb", "splat"],
};
const MEDIUM_OF = new Map(Object.entries(MEDIUM).flatMap(([kind, ws]) => ws.map((w) => [stem(w), kind] as const)));

const K1 = 1.2;
const B = 0.75;
/** A tool is the first answer when it does the same job as a workflow: a small push up. */
const TOOL_BOOST = 1.15;

/**
 * The entries that best fit a question, best first: BM25 over name (x3), keywords and good-for (x2), what, how and category, the
 * question's words made plain and widened by their synonyms. An empty question gives the entries in order (tools first).
 */
export function searchKnowledge(query: string, { k = 12, kinds, sections, root = ROOT }: { k?: number; kinds?: string[]; sections?: string[]; root?: string } = {}): Hit[] {
  loadKnowledge(root);
  const L = loaded!;
  const keep = (e: Entry) => (!kinds?.length || kinds.includes(e.kind)) && (!sections?.length || sections.includes(e.section));
  const n = Math.max(1, Math.min(1000, Math.round(Number(k)) || 12));
  const asked = [...new Set(words(query))];
  if (!asked.length) return L.entries.filter(keep).slice(0, n).map((entry) => ({ entry, score: 0 }));
  // each word asked counts fully; its synonyms count a little less, and only once for the word
  const terms = new Map<string, number>();
  for (const w of asked) {
    terms.set(w, Math.max(terms.get(w) ?? 0, 1));
    for (const s of SYN.get(w) ?? []) terms.set(s, Math.max(terms.get(s) ?? 0, 0.6));
  }
  const media = new Set(asked.map((w) => MEDIUM_OF.get(w)).filter(Boolean) as string[]);
  const N = L.docs.length;
  const hits: Hit[] = [];
  for (const d of L.docs) {
    if (!keep(d.entry)) continue;
    let score = 0;
    let found = 0;
    for (const w of asked) {
      // a word and its synonyms: the best of them counts
      let best = 0;
      for (const t of [w, ...(SYN.get(w) ?? [])]) {
        const tf = d.tf.get(t);
        if (!tf) continue;
        const df = L.df.get(t) ?? 0;
        const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
        const s = (terms.get(t) ?? 0) * idf * ((tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * d.len) / L.avg)));
        if (s > best) best = s;
      }
      if (best > 0) found++;
      score += best;
    }
    if (score <= 0) continue;
    // an entry that answers more of the words asked comes first
    score *= 0.5 + found / asked.length / 2;
    if (d.entry.kind === "tool") score *= TOOL_BOOST;
    if (media.size) score *= [...d.entry.takes, ...d.entry.gives].some((x) => media.has(x)) ? 1.2 : 0.65;
    hits.push({ entry: d.entry, score: Math.round(score * 1000) / 1000 });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, n);
}
