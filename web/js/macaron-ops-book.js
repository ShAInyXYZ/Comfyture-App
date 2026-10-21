// Brioche in the Brand book, the page's side: what she is told of it (summary), which actions are hers there (OPS) and how
// each is made (run). The book is built from the kit, so what she writes here is only its own words: the story page, the
// notes under the imagery, the cover's line. A thin page is fixed in the kit: she says where (open_fix takes the person there).
// server/macaron-book.ts is the server's side (her brief and how her fields are kept); the two list the same ops.
import { macaron, setKit, save } from "./macaron.js";
import { changed } from "./store.js";
import { pageStatus, bookText, imageryOf, TEXT_PAGES, PAGE_IDS, FIXES } from "./macaron-book-model.js";
import { auditOf } from "./macaron-book-audit.js";
import { fixPage } from "./macaron-book.js";

/** The ops she may take in the Brand book, besides open_space (which every workspace has). */
export const OPS = ["write_page", "set_tagline", "open_fix"];

/** What she is told of the Brand book, on top of what every workspace is told of the brand: only what the book is made of. */
export function summary() {
  const b = macaron.brand;
  const body = b.body;
  const dir = (body.directions ?? []).find((d) => d.picked);
  return {
    pages: pageStatus(body).map(({ id, name, ok, reason }) => ({ id, name, ok, reason })),
    // (the words written for a page are an optional note on it: the page itself is made of the brief and the pictures, so it is whole without them)
    written: Object.fromEntries(TEXT_PAGES.map((id) => [id, bookText(body, id)])),
    madeOf: { story: "the brief's pitch and goals and the direction picked", imagery: `${imageryOf(body).length} pictures of the moodboard, the product and what was made` },
    audit: auditOf(b).items.slice(0, 8).map((i) => ({ design: i.sub, text: i.title, level: i.level })),
    brief: { pitch: body.brief?.pitch ?? "", goals: body.brief?.goals ?? [], message: body.brief?.message ?? "", tone: body.brief?.tone ?? "" },
    direction: dir ? { name: dir.name, note: dir.note } : null,
    voiceWords: body.kit?.voice?.words ?? [],
    type: Object.fromEntries(Object.entries(body.kit?.type ?? {}).map(([k, v]) => [k, `${v.family} ${v.weight}`])),
  };
}

/** One action of the Brand book, made. Answers what to tell the user, or null when it is not made. */
export function run(a, _later) {
  switch (a.op) {
    case "write_page": {
      if (!TEXT_PAGES.includes(a.page)) return null;
      const text = String(a.text ?? "").trim().slice(0, 900);
      if (!text) return null;
      ((macaron.brand.body.book ??= { pages: {} }).pages ??= {})[a.page] = text;
      save();
      changed("macaron");
      return `The ${a.page} page: written`;
    }
    case "set_tagline": {
      const text = String(a.text ?? "").trim().slice(0, 80);
      if (!text) return null;
      setKit("tagline", text);
      changed("macaron");
      return `Tagline: ${text}`;
    }
    case "open_fix": {
      if (!PAGE_IDS.includes(a.page)) return null;
      fixPage(a.page);
      return `Opened ${FIXES[a.page].label}`;
    }
    default:
      return null;
  }
}
