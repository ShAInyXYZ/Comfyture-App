// Brioche in the Brand book: the guidelines document built from the kit (the cover, the story, the logo, the colour, the type,
// the voice, the imagery, the rules, the examples), the brand guard's audit of everything made and the handoff package. What she
// is told here, the actions she may take and how her fields are kept are this module's; server/macaron.ts reads it like the
// other workspaces. The book is built from the kit, so she writes only its own words (the story page, the notes under the
// imagery, the cover's line) and says where a thin page is fixed: she never edits the kit from here.

/** The pages of the book, in order (web/js/macaron-book-model.js lists the same). */
export const PAGES = ["cover", "story", "logo", "colour", "type", "voice", "imagery", "rules", "examples"] as const;
/** The pages that take words of their own. */
export const TEXT_PAGES = ["story", "imagery"] as const;

export const OPS: readonly string[] = ["write_page", "set_tagline", "open_fix", "open_space"];

const str = (description: string, extra: Record<string, unknown> = {}) => ({ type: "string", description, ...extra });
/** The fields those ops carry, as the tool's schema describes them. */
export const PROPS: Record<string, unknown> = {
  page: str("A page of the book: for write_page the story or the imagery, for open_fix any page.", { enum: [...PAGES] }),
  text: str("For write_page: the page's words (up to 900 characters). For set_tagline: the cover's line (up to 80)."),
};

export const DESCRIPTION = "Answer the user: one short, warm sentence, and the actions to take on the brand book (none when they only ask a question).";

export const BRIEF = `THE OPEN WORKSPACE: Brand book. It is the brand's guidelines document, built from the kit: nine pages (cover, story, logo, colour, type, voice, imagery, rules, in use), each drawn from what the kit holds. It also holds the brand guard's audit of everything made and the handoff package (the book as a PDF, the colours and type as CSS, the logo files).

A page the list calls whole IS complete, with or without words written for it: the story page is made of the brief's pitch and goals and the direction picked, the imagery page of the moodboard's, the product's and the made pictures. Words you write for those two are an optional note on top, so when asked what is missing never say a whole page lacks words; offer a note only as an extra.

THE BOOK IS BUILT FROM THE KIT. You do not edit the kit from here: a thin page is thin because the kit is thin, and it is fixed there. Each page below says whether it is whole or thin and why; when the person asks what is missing, say which pages are thin, why, and where it is fixed (the logo files and the palette, the type, the voice and the rules in Brand kit; the brief, the directions and the moodboard in Design idea; the posts in Create). You write only the book's own words.

Actions (op and its fields):
- write_page {page, text}: the words of a page that takes them: story (where the brand comes from: three or four short lines, built on the brief's idea and goals, in the brand's voice) or imagery (one or two lines on what the pictures look and feel like, from the moodboard).
- set_tagline {text}: the cover's line, one short line of up to eight words in the brand's voice; it is also the foot of every page.
- open_fix {page}: opens the place that fixes a thin page (the logo window, the palette, the voice, the posts...) so the person can do it. Use it when they ask to fix a page that is not yours to write.
- open_space {space}.

What a good page says: concrete, short, no hype; the story names what the brand is and who it is for and never repeats the brief word for word; the imagery note says what to show and what to leave out. Write in the brand's voice and never use its don'ts. Use only the page ids shown below.`;

/** Extra string fields (name: max length) and list fields this workspace's actions may carry. */
export const STRINGS: Record<string, number> = { page: 12 };
export const LISTS: string[] = [];

/** What Brioche is told of the Brand book each time, from the page's summary of it: only what the book is made of. */
export function promptLines(s: Record<string, any>, cut: (v: unknown, n: number) => string): string[] {
  const lines: string[] = [];
  const pages: any[] = Array.isArray(s.pages) ? s.pages : [];
  lines.push(`THE BOOK, page by page (id: whole or thin): ${pages.map((p) => `${p.id} ${p.ok ? "whole" : `THIN, ${cut(p.reason, 60)}`}`).join("; ") || "no pages"}`);
  const w = s.written ?? {};
  // (the story and the imagery pages are made of the brief and the pictures: the words written for them are only an optional note on the page)
  lines.push(`OPTIONAL NOTES WRITTEN FOR THE BOOK (a page is whole without one): story ${w.story ? `"${cut(w.story, 300)}"` : "none"} · imagery ${w.imagery ? `"${cut(w.imagery, 200)}"` : "none"}`);
  if (s.madeOf) lines.push(`WHAT THE TWO WORDY PAGES ARE MADE OF: story page from ${cut(s.madeOf.story, 100)}; imagery page from ${cut(s.madeOf.imagery, 100)}`);
  lines.push(`Tagline on the cover: "${cut(s.kit?.tagline, 80)}"`);
  const br = s.brief ?? {};
  lines.push(`THE BRIEF: pitch "${cut(br.pitch, 260)}" · goals ${(br.goals ?? []).map((g: string) => `"${cut(g, 40)}"`).join(", ") || "none"} · message: ${cut(br.message, 200)} · tone: ${cut(br.tone, 140)}`);
  if (s.direction) lines.push(`DIRECTION PICKED: ${cut(s.direction.name, 40)}: ${cut(s.direction.note, 100)}`);
  lines.push(`Voice words: ${(s.voiceWords ?? []).join(", ") || "none"} · Type: ${Object.entries(s.type ?? {}).map(([k, v]) => `${k} ${v}`).join("; ")}`);
  const audit: any[] = Array.isArray(s.audit) ? s.audit : [];
  lines.push(`THE BRAND GUARD'S AUDIT: ${audit.map((a) => `${cut(a.design, 50)} (${a.level}): ${cut(a.text, 90)}`).join(" | ") || "nothing flagged"}`);
  return lines;
}

/** Keeps the fields of one action of this workspace to what is allowed (macaron.ts keeps the shared ones); null drops the action. */
export function clean(a: Record<string, any>): Record<string, unknown> | null {
  const page = typeof a.page === "string" ? a.page.trim().toLowerCase() : "";
  const words = (n: number) => String(a.text ?? "").replace(/\\n/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
  if (a.op === "write_page") {
    // only a page that takes words of its own is written, and never with nothing
    const text = words(900);
    return (TEXT_PAGES as readonly string[]).includes(page) && text ? { page, text } : null;
  }
  if (a.op === "set_tagline") {
    const text = words(80).replace(/^["“]|["”]$/g, "");
    return text ? { text } : null;
  }
  if (a.op === "open_fix") return (PAGES as readonly string[]).includes(page) ? { page } : null;
  return {};
}
