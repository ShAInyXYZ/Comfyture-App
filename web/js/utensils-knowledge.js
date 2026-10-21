// Utensils' knowledge, on the page: what a tool or a Library workflow is, how it works, what it takes and gives, what it costs and what
// goes before and after it (server/utensils-knowledge.ts, from knowledge/utensils/). Entries are fetched once and kept.

const kept = new Map();

/** The entries that best fit a question, best first: [{ ...entry, score }]. opts: { k, kind: "tool" | "workflow" }. */
export async function searchKnowledge(q, { k = 12, kind } = {}) {
  const params = new URLSearchParams({ q: String(q ?? ""), k: String(k) });
  if (kind) params.set("kind", kind);
  try {
    const r = await fetch(`api/utensils/knowledge?${params}`);
    if (!r.ok) return [];
    const { items } = await r.json();
    for (const e of items ?? []) if (!kept.has(e.id)) kept.set(e.id, Promise.resolve(e));
    return items ?? [];
  } catch {
    return [];
  }
}

/** One entry by its id (a tool's id, or wf:<template name>), or null when there is none. */
export function knowledgeOf(id) {
  const key = String(id ?? "");
  if (!key) return Promise.resolve(null);
  if (!kept.has(key)) {
    const asked = fetch(`api/utensils/knowledge/${encodeURIComponent(key)}`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((e) => (e === null && kept.delete(key), e));
    kept.set(key, asked);
  }
  return kept.get(key);
}

/** The id a tool or a template is known by: a tool's id, a mini app's workflow (app-<id> is wf:<its template>), a template's wf:<name>. */
export function knowledgeIdOf(x) {
  if (!x) return null;
  if (typeof x === "string") return x.startsWith("app-") ? null : x;
  if (x.app && x.appName) return `wf:${x.appName}`;
  if (x.id && !x.app) return x.id;
  if (x.name) return `wf:${x.name}`;
  return null;
}

/** The entry for a tool (as registerTool keeps it) or a template (as the Library lists it), or null. */
export function entryFor(toolOrTemplate) {
  return knowledgeOf(knowledgeIdOf(toolOrTemplate));
}

let makers = null;
/**
 * Who made the model at the core of each tool (utensils-makers.js), from what the knowledge says each tool runs: a Map of tool id to
 * maker id, fetched once (empty when the knowledge does not answer; a tool that runs on this machine, ffmpeg, has none).
 */
export function toolMakers() {
  makers ??= Promise.all([import("./utensils-makers.js"), fetch("api/utensils/knowledge?kind=tool&k=200").then((r) => (r.ok ? r.json() : { items: [] }))])
    .then(([{ makerOf }, { items }]) => new Map((items ?? []).map((e) => [e.id, makerOf({ models: e.models ?? [], title: e.name ?? "" })]).filter(([, m]) => m)))
    .catch(() => new Map());
  return makers;
}
