// The image models' prompt guides: one markdown file per family in server/image-guides/, each starting with a frontmatter that lists the
// model ids it covers. The writer of Toaster's prompts reads the guide of the model that will render. A guide added or changed while the
// server runs is picked up: the folder is looked at again on every call, and a file is read again only when its time changed.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const FOLDER = fileURLToPath(new URL("./image-guides/", import.meta.url));

export interface Guide { file: string; maker: string; models: string[]; text: string }

const cache = new Map<string, { mtime: number; guide: Guide | null }>();

/** One list value: "[a, b]" or the "- a" lines under the key. */
const listOf = (value: string, rest: string[]) => {
  const inline = value.match(/^\[(.*)\]$/);
  const items = inline ? inline[1].split(",") : rest.map((l) => l.match(/^\s*-\s+(.*)$/)?.[1] ?? "");
  return items.map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
};

/** A guide file read: its models and maker from the frontmatter, its text the body after it (the sources stay in the file). */
function parse(file: string, raw: string): Guide | null {
  const m = raw.replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return null;
  const lines = m[1].split("\n");
  let models: string[] = [];
  let maker = "";
  lines.forEach((line, i) => {
    const key = line.match(/^(\w+):\s*(.*)$/);
    if (!key) return;
    if (key[1] === "maker") maker = key[2].trim().replace(/^["']|["']$/g, "");
    if (key[1] === "models") {
      const rest: string[] = [];
      for (const l of lines.slice(i + 1)) if (/^\s+-\s/.test(l)) rest.push(l);
      else break;
      models = listOf(key[2].trim(), rest);
    }
  });
  const text = m[2].trim();
  return models.length && text ? { file, maker: maker || file.replace(/\.md$/, ""), models, text } : null;
}

/** Every guide in the folder, in file order. */
export function guidesList(folder = FOLDER): Guide[] {
  let files: string[] = [];
  try {
    files = readdirSync(folder).filter((f) => f.endsWith(".md")).sort();
  } catch {
    return [];
  }
  const out: Guide[] = [];
  for (const f of files) {
    const path = folder + (folder.endsWith("/") ? "" : "/") + f;
    try {
      const mtime = statSync(path).mtimeMs;
      let hit = cache.get(path);
      if (!hit || hit.mtime !== mtime) cache.set(path, (hit = { mtime, guide: parse(f, readFileSync(path, "utf8")) }));
      if (hit.guide) out.push(hit.guide);
    } catch {
      // (a file that vanished or cannot be read is no guide)
    }
  }
  return out;
}

/** The guide that names this image model: { file, maker, text }, or null when none does. */
export function guideFor(modelId: string, folder = FOLDER): { file: string; maker: string; text: string } | null {
  const g = guidesList(folder).find((x) => x.models.includes(String(modelId)));
  return g ? { file: g.file, maker: g.maker, text: g.text } : null;
}
