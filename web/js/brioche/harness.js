// Brioche's harness: the engine over the five workspaces' specs (space-kit.js, space-idea.js, space-studio.js, space-create.js,
// space-book.js). A workspace is described once, there: what it holds, what she is told of it, and every action with its line in
// her brief, its fields and how they are kept. From those this file makes the three things the server needs (her brief, her
// tool, her answer read and checked) and what she is told each time; the page asks it which actions are hers. Nothing here
// touches the page or the server, so both import it, and so do the tests: adding an action is one entry in one spec.
import kit from "./space-kit.js";
import idea from "./space-idea.js";
import studio from "./space-studio.js";
import create from "./space-create.js";
import book from "./space-book.js";

/** The workspaces of Macaron, in the order the room shows them: Brioche works in the one that is open. */
export const SPACES = ["kit", "idea", "studio", "create", "book"];
const SPECS = { kit, idea, studio, create, book };

/** (what an older page sent as Content is Create) */
export const spaceOf = (v) => (SPACES.includes(v) ? v : "create");
/** The spec of a workspace. */
export const specOf = (space) => SPECS[spaceOf(space)];
/** The ops of a workspace: its own actions, and open_space, which every workspace has. */
export const opsOf = (space) => [...Object.keys(specOf(space).actions), "open_space"];

// ------------------------------------------------------------------ her brief

const COUNT = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const andList = (items) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);

/** The sentence every brief carries: the workspaces, in order, with what each holds and what is made only there. */
const workspaces = () =>
  `Macaron has ${COUNT[SPACES.length]} workspaces, in this order: ${andList(SPACES.map((id) => {
    const s = SPECS[id];
    return `${s.name} (${[s.holds, ...(s.owns ?? []).map((o) => `${o} is made here and only here`)].join("; ")})`;
  }))}.`;

const COMMON = `You are Brioche, the baby bunny who runs Comfyture's Macaron room, the brand room: you know brand work and nothing else. You are warm, brief and practical; you speak in one or two short sentences. You answer through the macaron_answer tool: a reply and the actions to take.

`;
const COMMON_AFTER = " You work in the one that is open now, and only its actions are yours. When what is asked belongs to another workspace, say so in a sentence and offer to open it (the open_space action opens it; then the user asks again). When the user only asks a question or for advice, answer it and take no action. Never promise what you did not do. Use the ids shown below, never invent one.";

/** Her brief for a workspace: who she is, what the room is, and only what she can do there. */
export function briefOf(space = "create") {
  const s = specOf(space);
  const lines = Object.entries(s.actions).map(([op, a]) => `- ${op} ${a.doc}`);
  lines.push("- open_space {space}.");
  return `${COMMON}${workspaces()}${COMMON_AFTER}\n\n${s.intro}\n\nActions (op and its fields):\n${lines.join("\n")}\n\n${s.rules}`;
}

/** The field names a doc opens with: "{id, hex}: ..." is [id, hex]. (a nested list, as in beats[{kind, line}], is one name) */
export function docFields(doc) {
  if (!doc.startsWith("{")) return null;
  let depth = 0;
  let end = -1;
  for (let i = 0; i < doc.length && end < 0; i++) {
    if (doc[i] === "{" || doc[i] === "[") depth++;
    else if (doc[i] === "}" || doc[i] === "]") if (--depth === 0) end = i;
  }
  if (end < 0) return null;
  const names = [];
  let at = 0;
  let name = "";
  for (const ch of doc.slice(1, end)) {
    if (ch === "[" || ch === "{") at++;
    else if (ch === "]" || ch === "}") at--;
    else if (ch === "," && at === 0) { names.push(name.trim()); name = ""; }
    else if (at === 0) name += ch;
  }
  if (name.trim()) names.push(name.trim());
  return names;
}

// ------------------------------------------------------------------ her tool

// what only the reader of an answer needs: the tool's schema leaves it out
const READER_ONLY = ["maxLength", "minimum", "maximum", "maxItems", "pattern", "breaks"];
function schemaOf(def) {
  const out = {};
  for (const [k, v] of Object.entries(def)) {
    if (READER_ONLY.includes(k)) continue;
    out[k] = k === "items" && v && typeof v === "object" ? schemaOf(v) : k === "properties" ? Object.fromEntries(Object.entries(v).map(([n, p]) => [n, schemaOf(p)])) : v;
  }
  return out;
}

/** The fields of all a workspace's actions, as one list of properties: a field two actions define differently is one property that says so. */
function propertiesOf(spec) {
  const byField = new Map();
  for (const [op, a] of Object.entries(spec.actions)) {
    for (const [name, def] of Object.entries(a.fields)) {
      const defs = byField.get(name) ?? [];
      const key = JSON.stringify(schemaOf(def));
      const same = defs.find((d) => d.key === key);
      if (same) same.ops.push(op);
      else defs.push({ key, ops: [op], def: schemaOf(def) });
      byField.set(name, defs);
    }
  }
  const props = {};
  for (const [name, defs] of byField) {
    if (defs.length === 1) { props[name] = defs[0].def; continue; }
    const said = defs.filter((d) => d.def.description);
    props[name] = { ...defs[0].def, description: said.map((d) => `For ${d.ops.join("/")}: ${d.def.description}`).join("; ") };
  }
  return props;
}

/** How Brioche answers in a workspace: the tool she is made to call, with only the actions of that workspace. */
export function toolOf(space = "create") {
  const s = specOf(space);
  return {
    name: "macaron_answer",
    description: s.description,
    input_schema: {
      type: "object",
      properties: {
        reply: { type: "string", description: "One or two short sentences, in Brioche's voice: what you did, or the answer." },
        actions: {
          type: "array",
          description: "The changes to make, in order. Each has an op and its fields, as the brief lists them.",
          items: { type: "object", properties: { op: { type: "string", enum: opsOf(space) }, ...propertiesOf(s), space: { type: "string", enum: [...SPACES], description: "For open_space: the workspace to open." } }, required: ["op"] },
        },
      },
      required: ["reply", "actions"],
    },
  };
}

// ------------------------------------------------------------------ what she is told

const cut = (s, n) => String(s ?? "").replace(/\s+/g, " ").slice(0, n);

/** What Brioche is told each time: the workspace open and its things, the talk so far. Nothing of the other workspaces. */
export function promptOf(s, turns) {
  const space = spaceOf(s.space);
  const spec = SPECS[space];
  const kit = s.kit ?? {};
  const lines = [];
  lines.push(`THE BRAND: ${cut(s.name, 60)}. ${cut(kit.about, 240)}`);
  lines.push(`WORKSPACE OPEN: ${spec.name}`);
  lines.push(`Voice: ${cut(kit.voice?.summary, 200)} Do: ${(kit.voice?.dos ?? []).slice(0, 5).map((x) => cut(x, 90)).join(" | ")} Don't: ${(kit.voice?.donts ?? []).slice(0, 5).map((x) => cut(x, 90)).join(" | ")}`);
  if (!spec.noPalette) lines.push(`Palette (ids): ${(kit.palette ?? []).map((p) => `${p.id} ${p.hex}${p.name ? ` ${cut(p.name, 24)}` : ""} (${cut(p.role, 30)}${p.share ? `, ${p.share}% of a page` : ""})`).join("; ")}`);
  lines.push(`Logos (ids): ${(kit.logos ?? []).map((l) => `${l.id} (${l.kind}, ${l.tone}, for ${cut(l.ground, 40)})`).join("; ")}`);
  lines.push(...spec.promptLines(s, cut));
  lines.push("");
  lines.push("THE CONVERSATION");
  for (const t of turns.slice(-8)) lines.push(`${t.role === "user" ? "User" : "Brioche"}: ${cut(t.text, 600)}`);
  return lines.join("\n");
}

// ------------------------------------------------------------------ her answer, read

/** One field of an action, kept to what its definition allows; undefined when it is not allowed (or is for the action's own clean to read). */
function cleanField(def, v) {
  if (def.type === "string") {
    if (typeof v !== "string") return undefined;
    let text = def.pattern ? v.trim() : v;
    if (def.enum) {
      const plain = text.trim().toLowerCase();
      return def.enum.includes(text) ? text : def.enum.includes(plain) ? plain : undefined;
    }
    if (def.pattern && !new RegExp(def.pattern).test(text)) return undefined;
    if (def.breaks) text = text.replace(/\\n/g, "\n");
    return text.slice(0, def.maxLength ?? 200);
  }
  if (def.type === "number") {
    if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
    return Math.min(def.maximum ?? Infinity, Math.max(def.minimum ?? -Infinity, v));
  }
  if (def.type === "boolean") return typeof v === "boolean" ? v : undefined;
  if (def.type === "array" && def.items?.type === "string") {
    if (!Array.isArray(v)) return undefined;
    return v.filter((x) => typeof x === "string").map((x) => x.slice(0, def.items.maxLength ?? 140)).slice(0, def.maxItems ?? 8);
  }
  return undefined;
}

function cleanAction(a, space, nested = false) {
  if (!a || typeof a !== "object") return null;
  if (a.op === "open_space") return nested ? null : { op: "open_space", ...(SPACES.includes(a.space) ? { space: a.space } : {}) };
  const spec = specOf(space);
  const def = typeof a.op === "string" && Object.hasOwn(spec.actions, a.op) ? spec.actions[a.op] : null;
  if (!def || (nested && !def.nested)) return null;
  const out = { op: a.op };
  for (const [name, f] of Object.entries(def.fields)) {
    const v = cleanField(f, a[name]);
    if (v !== undefined) out[name] = v;
  }
  // what a definition cannot say (a field inside a field, a rule between fields) is the action's own: it may drop the action
  return def.clean ? def.clean(a, out, { nested: (x) => cleanAction(x, space, true) }) ?? null : out;
}

/** Brioche's answer, read whole and checked: only the actions of the workspace it was asked in, with their fields kept to what is allowed. */
export function cleanAnswer(reply, space = "create") {
  const from = reply.indexOf("{");
  const to = reply.lastIndexOf("}");
  let raw;
  try {
    raw = JSON.parse(reply.slice(from, to + 1));
  } catch {
    return { reply: reply.replace(/[{}"]/g, "").trim().slice(0, 400) || "I didn't catch that. Say it again?", actions: [] };
  }
  return { reply: String(raw.reply ?? "").slice(0, 500), actions: (Array.isArray(raw.actions) ? raw.actions : []).map((a) => cleanAction(a, space)).filter(Boolean).slice(0, 16) };
}
