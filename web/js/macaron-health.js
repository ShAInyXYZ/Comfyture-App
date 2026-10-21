// The brand's health: what the left panel shows under the five workspaces, in place of a row of tools. A few honest lines about
// where the brand stands (the brief filled, the palette, the logo files, the voice, the product, what waits for review, what the
// brand guard flags), each with a lamp, and a score made of them. Each line goes to the place that fixes it. Computed from the
// brand's own data every time the panel is drawn: nothing here is stored.
import { macaron, setSpace, openDesign } from "./macaron.js";
import { kitOf, prepare } from "./design.js";
import { openWin, closeAll } from "./macaron-win.js";
import { auditOf } from "./macaron-book-audit.js";

const BRIEF_FIELDS = ["goal", "audience", "message", "tone", "deliverables", "constraints", "channels"];
const KINDS = [["wordmark", "wordmark"], ["mark", "mark"], ["icon", "app icon"]];
const WEIGHT = { ok: 1, warn: 0.5, crit: 0 };
const RANK = { crit: 0, warn: 1, ok: 2 };

/** Goes somewhere: a workspace, a window over it. */
const go = (space, win) => () => (closeAll(), setSpace(space), win && openWin(win));

/** The lines: { id, text, tone: "ok" | "warn" | "crit", go }, in the order they matter. */
export function healthLines(b) {
  const body = b.body;
  const kit = kitOf(body);
  const lines = [];

  const filled = BRIEF_FIELDS.filter((k) => (body.brief?.[k] ?? "").trim()).length;
  lines.push({ id: "brief", text: `Brief ${filled} of ${BRIEF_FIELDS.length}`, tone: filled === BRIEF_FIELDS.length ? "ok" : filled >= 4 ? "warn" : "crit", go: go("idea", "brief") });

  const colours = kit.palette.length;
  lines.push({ id: "palette", text: colours ? `Palette ${colours} ${colours === 1 ? "colour" : "colours"}` : "No palette yet", tone: colours >= 3 ? "ok" : colours ? "warn" : "crit", go: go("kit", "palette") });

  // the logo files: each kind there, in the colours the wordmark has
  const tones = [...new Set(kit.logos.filter((l) => l.kind === "wordmark").map((l) => l.tone))];
  const missing = KINDS.filter(([k]) => !kit.logos.some((l) => l.kind === k));
  const thin = KINDS.find(([k]) => tones.length && kit.logos.filter((l) => l.kind === k).length < tones.length);
  if (!kit.logos.length) lines.push({ id: "logos", text: "No logo files yet", tone: "crit", go: go("kit", "logos") });
  else if (missing.length) lines.push({ id: "logos", text: `No ${missing[0][1]}`, tone: "warn", go: go("kit", "logos") });
  else if (thin) lines.push({ id: "logos", text: `${thin[1][0].toUpperCase()}${thin[1].slice(1)} in ${kit.logos.filter((l) => l.kind === thin[0]).length} of ${tones.length} colours`, tone: "warn", go: go("kit", "logos") });
  else lines.push({ id: "logos", text: "Logo files complete", tone: "ok", go: go("kit", "logos") });

  const voice = body.kit.voice ?? {};
  const words = (voice.words ?? []).length;
  lines.push({ id: "voice", text: words ? `Voice ${words} ${words === 1 ? "word" : "words"}` : "No voice yet", tone: words && (voice.summary || (voice.lines ?? []).length) ? "ok" : words ? "warn" : "crit", go: go("kit", "voice") });

  const product = (body.products ?? [])[0];
  lines.push({ id: "product", text: product ? `Product: ${product.name}` : "No product yet", tone: product ? "ok" : "warn", go: go("studio", "product") });

  const posts = (body.designs ?? []).filter((d) => !d.variant && !d.motion && !d.graphic);
  const review = posts.filter((d) => d.status === "review").length;
  if (review) lines.push({ id: "review", text: `${review} ${review === 1 ? "post" : "posts"} to review`, tone: "warn", go: go("create", "posts") });
  else lines.push({ id: "review", text: posts.length ? `${posts.length} ${posts.length === 1 ? "post" : "posts"}, none waiting` : "No posts yet", tone: posts.length ? "ok" : "warn", go: go("create", "posts") });

  // the brand guard: what the Brand book's audit finds in the posts (one source, so the two always agree)
  const flagged = auditOf(b).items.filter((x) => x.design);
  const bad = flagged.filter((x) => x.level === "bad").length;
  const first = flagged[0]?.design ?? null;
  const flags = flagged.length;
  lines.push({ id: "guard", text: flags ? `${flags} ${flags === 1 ? "post" : "posts"} flagged by the guard` : "Brand guard is quiet", tone: bad ? "crit" : flags ? "warn" : "ok", go: () => (first ? (closeAll(), setSpace("create"), openDesign(first), openWin("editor")) : go("book")()) });

  return lines;
}

/** The score: how ready the brand is, 0 to 100, and the lines to show (the ones that need care first, at most five). */
export function brandHealth(b) {
  const all = healthLines(b);
  const score = Math.round((all.reduce((n, l) => n + WEIGHT[l.tone], 0) / all.length) * 100);
  const shown = [...all].sort((a, c) => RANK[a.tone] - RANK[c.tone]).slice(0, 5);
  return { score, lines: shown, all };
}

const warmed = new Set();
/** Gets the brand's designs ready to be measured (their logos and pictures read), once each: answers whether any was not. */
export async function warmDesigns(b) {
  const todo = (b.body.designs ?? []).filter((d) => !d.variant && !warmed.has(`${d.id}:${d.updatedAt}`));
  if (!todo.length) return false;
  const kit = kitOf(b.body);
  await Promise.all(todo.map((d) => prepare(d, kit).then(() => warmed.add(`${d.id}:${d.updatedAt}`), () => {})));
  return true;
}
