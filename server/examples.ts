// The examples every product ships, put into the data folder by one set of rules (the lego every product's seeding is built from):
//
// - examples/<product>/<id>/ holds one example: its spec file (the product's own format) beside its media;
// - an example is put in the first time it is missing;
// - a newer version of it (its `rev`, or `version`) replaces the copy kept only while nobody has touched it (updatedAt is still createdAt);
// - one the person deleted stays deleted, and one they worked on is left as it is;
// - one taken out of the app (its folder gone) is taken out of the data folder too, unless the person worked on it.
//
// What was put in is kept in the store's ledger (`.seeded`): "id" (version 1), "id@3" (version 3), "id@retired". A product says where its
// examples are, how to read the copy it keeps, how to put one in and how to take one out; the bookkeeping is here, once.
import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";

/** What a kept copy says about itself: enough to know whether the person has touched it. */
export interface Kept {
  createdAt?: string;
  updatedAt?: string;
}

export interface ExampleKind<Spec = any> {
  /** for the messages: "spice", "jam", "toaster"... */
  name: string;
  /** the folder of this product's examples */
  dir: string;
  /** the spec file in each example's folder ("shot.json"), or, for examples that are single files, their ending ("*.brand.json") */
  spec: string;
  /** the ledger: <data>/<store>/.seeded */
  ledger: string;
  /** an example's id, when the spec does not say it as `id` */
  idOf?: (spec: Spec, folder: string) => string;
  /** the copy kept of an example, if there is one */
  kept: (id: string) => Promise<Kept | null>;
  /** puts the example in (its media into the data folder, its project into its store) */
  put: (spec: Spec, folder: string, id: string, rev: number) => Promise<void>;
  /** takes an untouched copy of a retired example out */
  drop: (id: string) => Promise<void>;
  /** an example already in, at its version: what a newer version of the app adds to it (Macaron's brands are topped up) */
  topUp?: (spec: Spec, id: string) => Promise<void>;
}

const ID = /^[\w-]+$/;
const untouched = (k: Kept | null) => !!k && k.updatedAt === k.createdAt;

/** The ledger's entries, from the JSON list Spice and Macaron wrote or the lines Jam wrote. */
export function readLedger(text: string): string[] {
  const t = text.trim();
  if (!t) return [];
  if (t.startsWith("[")) {
    try {
      const list = JSON.parse(t);
      return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : [];
    } catch {
      return [];
    }
  }
  return t.split("\n").map((l) => l.trim()).filter(Boolean);
}

/** Each id the ledger knows, with the highest version put in, or "retired". */
export function ledgerState(entries: string[]): Map<string, number | "retired"> {
  const had = new Map<string, number | "retired">();
  for (const e of entries) {
    const [id, v] = e.split("@");
    if (v === "retired") had.set(id, "retired");
    else if (had.get(id) !== "retired") had.set(id, Math.max(Number(had.get(id) ?? 0), Number(v) > 1 ? Number(v) : 1));
  }
  return had;
}

/** The version a spec says it is (`rev` or `version`), 1 when it says nothing. */
export const revOf = (spec: any) => Math.max(1, Math.floor(Number(spec?.rev ?? spec?.version) || 1));

/** What one seeding did, for the logs and the tests. */
export interface Seeded {
  added: string[];
  replaced: string[];
  kept: string[];
  retired: string[];
}

/** Puts a product's examples in by the rules above. Never throws for one bad example: it is skipped with a warning. */
export async function seedExamples<Spec>(kind: ExampleKind<Spec>): Promise<Seeded> {
  const done: Seeded = { added: [], replaced: [], kept: [], retired: [] };
  const entries = readLedger(await readFile(kind.ledger, "utf8").catch(() => ""));
  const had = ledgerState(entries);
  let changed = false;
  const note = (entry: string) => (entries.push(entry), (changed = true));

  // the examples there are: a folder each, or a file each
  const single = kind.spec.startsWith("*");
  const items = (await readdir(kind.dir, { withFileTypes: true }).catch(() => []))
    .filter((d) => (single ? d.isFile() && d.name.endsWith(kind.spec.slice(1)) : d.isDirectory()))
    .map((d) => d.name)
    .sort();
  const current = new Set<string>();
  for (const item of items) {
    const folder = single ? kind.dir : join(kind.dir, item);
    let spec: Spec;
    try {
      spec = JSON.parse(await readFile(single ? join(kind.dir, item) : join(folder, kind.spec), "utf8"));
    } catch (e) {
      console.warn(`${kind.name}: the example ${item} could not be read:`, (e as Error).message);
      continue;
    }
    const id = kind.idOf?.(spec, item) ?? (spec as any)?.id;
    if (typeof id !== "string" || !ID.test(id)) continue;
    current.add(id);
    const rev = revOf(spec);
    const before = had.get(id);
    try {
      // in already, at this version or newer: only what a newer app adds to it
      if (typeof before === "number" && before >= rev) {
        if (kind.topUp && (await kind.kept(id))) await kind.topUp(spec, id);
        continue;
      }
      const kept = await kind.kept(id);
      if (typeof before === "number") {
        // an older version is in: replaced only while untouched; deleted, or worked on, it stays as the person left it
        if (!untouched(kept)) {
          note(rev > 1 ? `${id}@${rev}` : id);
          done.kept.push(id);
          continue;
        }
        await kind.put(spec, folder, id, rev);
        done.replaced.push(id);
      } else {
        // never put in: a project of that id that did not come from here is the person's own
        if (kept && before !== "retired") {
          note(rev > 1 ? `${id}@${rev}` : id);
          done.kept.push(id);
          continue;
        }
        if (kept) continue;
        await kind.put(spec, folder, id, rev);
        done.added.push(id);
      }
      note(rev > 1 ? `${id}@${rev}` : id);
    } catch (e) {
      console.warn(`${kind.name}: the example ${id} was not added:`, (e as Error).message);
    }
  }
  // the examples the app no longer has: their untouched copies go
  for (const [id, v] of had) {
    if (v === "retired" || current.has(id) || !ID.test(id)) continue;
    if (untouched(await kind.kept(id))) await kind.drop(id).catch(() => {});
    note(`${id}@retired`);
    done.retired.push(id);
  }
  if (changed) {
    await mkdir(dirname(kind.ledger), { recursive: true });
    await writeFile(kind.ledger, JSON.stringify(entries));
  }
  return done;
}

// ---------------------------------------------------------------- media named "example:<file>"

const PICTURE = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const CLIP = new Set([".mp4", ".webm", ".mov"]);
const SOUND = new Set([".mp3", ".m4a", ".wav", ".ogg", ".flac"]);
const MODEL = new Set([".glb"]);

/** Where a file of an example goes in the data folder, by its kind: photos, videos, audio or models. */
export function shelfOf(file: string): string | null {
  const ext = extname(file).toLowerCase();
  return PICTURE.has(ext) ? "photos" : CLIP.has(ext) ? "videos" : SOUND.has(ext) ? "audio" : MODEL.has(ext) ? "models" : null;
}

/**
 * An example's body with its own files put in place: every string "example:<file>" names a file of the example's folder, which is copied
 * into the data folder as "<id>-<file>" (photos, videos, audio or models, by its kind); the string becomes the file's name where the key
 * is `file`, and its URL ("/media/photos/<id>-<file>") everywhere else. Returns the body and the files copied.
 */
export async function placeMedia(body: unknown, folder: string, id: string, data: string): Promise<{ body: any; files: string[] }> {
  const files = new Set<string>();
  const copied = new Map<string, { shelf: string; name: string }>();
  const place = async (ref: string) => {
    const own = ref.slice("example:".length);
    if (!/^[\w.-]+$/.test(own) || own.startsWith(".")) throw new Error(`${ref}: a file of the example's own folder, by its name`);
    const shelf = shelfOf(own);
    if (!shelf) throw new Error(`${ref}: not a picture, a clip, a sound or a model`);
    if (!copied.has(own)) {
      const name = `${id}-${own}`;
      await mkdir(join(data, shelf), { recursive: true });
      await copyFile(join(folder, own), join(data, shelf, name));
      copied.set(own, { shelf, name });
      files.add(`${shelf}/${name}`);
    }
    return copied.get(own)!;
  };
  const walk = async (v: unknown, key?: string): Promise<unknown> => {
    if (typeof v === "string" && v.startsWith("example:")) {
      const { shelf, name } = await place(v);
      return key === "file" ? name : `/media/${shelf}/${name}`;
    }
    if (Array.isArray(v)) return Promise.all(v.map((x) => walk(x)));
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) out[k] = await walk(x, k);
      return out;
    }
    return v;
  };
  return { body: await walk(body), files: [...files] };
}

/** "example:thumb.jpg" (or a bare "thumb.jpg") as the URL of the copy put in; anything else as it is. */
export async function placeThumb(thumb: unknown, folder: string, id: string, data: string): Promise<string | undefined> {
  if (typeof thumb !== "string" || !thumb) return undefined;
  const own = thumb.startsWith("example:") ? thumb : !thumb.includes("/") ? `example:${thumb}` : null;
  if (!own) return thumb.slice(0, 400);
  return (await placeMedia(own, folder, id, data)).body as string;
}

/** The name of an example's file as it is put in ("<id>-<file>"): for specs that name their files themselves. */
export const placedName = (id: string, file: string) => `${id}-${basename(file)}`;
