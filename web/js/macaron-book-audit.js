// The brand guard's audit of everything the brand made, and of the kit it is made from: the posts the guard flags (palette,
// logo, safe zones, readability), the logo files a colour lacks, a type weight too light to read. Each item says what, where,
// how serious, and goes to the place that fixes it; the score is what is left of 100 after them.
import { macaron, guardOf, setSpace, openDesign } from "./macaron.js";
import { kitOf } from "./design.js";
import { openWin, closeAll } from "./macaron-win.js";
import { examplesOf } from "./macaron-book-model.js";

const COST = { bad: 8, warn: 3 };
const KINDS = [["wordmark", "wordmark"], ["mark", "mark"], ["icon", "app icon"]];

/** What the audit finds in a brand: { score (null when there is nothing to measure), items: [{ id, level: "bad" | "warn", title, sub, design?, logo?, glyph?, go }] }, worst first. */
export function auditOf(b) {
  const body = b.body;
  const kit = kitOf(body);
  const items = [];
  const goKit = (win) => () => (closeAll(), setSpace("kit"), openWin(win));

  // the posts, read by the guard in their own formats
  for (const d of examplesOf(body)) {
    let flags = [];
    try {
      flags = guardOf(d, d.format);
    } catch {}
    if (!flags.length) continue;
    const worst = flags.find((g) => g.level === "bad") ?? flags[0];
    items.push({ id: `guard:${d.id}`, level: flags.some((g) => g.level === "bad") ? "bad" : "warn", title: worst.text, sub: `${d.name}${flags.length > 1 ? ` · ${flags.length} in all` : ""}`, design: d.id, cost: flags.reduce((n, g) => n + COST[g.level === "bad" ? "bad" : "warn"], 0), go: () => (closeAll(), setSpace("create"), openDesign(d.id), openWin("editor")) });
  }

  // the logo files: each kind in each colour the wordmark comes in
  const tones = [...new Set(kit.logos.filter((l) => l.kind === "wordmark").map((l) => l.tone))];
  for (const [kind, name] of KINDS) {
    const files = kit.logos.filter((l) => l.kind === kind);
    if (!files.length) items.push({ id: `logo:${kind}`, level: "warn", title: `No ${name} file`, sub: "Logo files", glyph: "logo", cost: COST.warn, go: goKit("logos") });
    else if (tones.length > 1 && files.length < tones.length) items.push({ id: `logo:${kind}`, level: "warn", title: `${name[0].toUpperCase()}${name.slice(1)} in ${files.length} of ${tones.length} colours`, sub: "Logo files", logo: files[0].url, cost: COST.warn, go: goKit("logos") });
  }

  // the type: a weight that is too light to read at the sizes the posts use
  for (const role of ["display", "text", "mono"]) {
    const t = kit.type[role];
    if (t && t.weight < 400) items.push({ id: `type:${role}`, level: "warn", title: `${role[0].toUpperCase()}${role.slice(1)} weight is light`, sub: `${t.family} ${t.weight}`, glyph: "Aa", cost: COST.warn, go: goKit("type") });
  }

  items.sort((a, c) => (a.level === c.level ? c.cost - a.cost : a.level === "bad" ? -1 : 1));
  // nothing made and no logo files: there is nothing for the guard to measure yet, and a score would say more than it knows
  const measured = examplesOf(body).length || kit.logos.length;
  const score = measured ? Math.max(0, 100 - items.reduce((n, i) => n + i.cost, 0)) : null;
  return { score, items };
}
