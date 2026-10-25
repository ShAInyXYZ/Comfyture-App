// The shape of examples/spice/<shot>/shot.json, and the plain rules scripts/spice-examples.mjs changes a spec by. The formatter writes the
// style the shipped specs are written in, so a script can update one without reflowing it:
//   - one space of indent;
//   - every pass on one line, every department of `set` on one line;
//   - FX's layers one to a line (`"fx": { "layers": [` ... `] }`);
//   - anything else (`build`, `about`...) on one line.
// formatShot(JSON.parse(text)) gives `text` back, byte for byte, for every spec there is (tests/spice-examples.test.mjs).
// No imports and nothing run here, so the tests read every function.

/** The departments, in the order a shot goes through them (web/js/spice-harness.js). */
export const DEPARTMENTS = ["plate", "roto", "paint", "light", "fx", "comp"];
/** The departments whose passes the app makes free, on this machine, for a spec's `build` list. */
export const BUILDABLE = ["light", "fx", "comp"];

// ---------------------------------------------------------------- the style

/** JSON on one line, with a space after every colon and comma (`{"file": "fx.mp4", "width": 1280}`). */
export function inline(value) {
  if (Array.isArray(value)) return `[${value.map(inline).join(", ")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).filter(([, v]) => v !== undefined).map(([k, v]) => `${JSON.stringify(k)}: ${inline(v)}`).join(", ")}}`;
  }
  return JSON.stringify(value);
}

/** A department of `set` on one line, except a department with layers: its layers go one to a line. */
function department(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || !Array.isArray(value.layers) || !value.layers.length) return inline(value);
  const members = Object.entries(value).filter(([, v]) => v !== undefined).map(([k, v]) =>
    k === "layers" ? `"layers": [\n${v.map((layer) => `   ${inline(layer)}`).join(",\n")}\n  ]` : `${JSON.stringify(k)}: ${inline(v)}`);
  return `{ ${members.join(", ")} }`;
}

const isObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);

/** A spec as text, in the shipped style, with a newline at the end. */
export function formatShot(spec) {
  const members = Object.entries(spec).filter(([, v]) => v !== undefined).map(([key, value]) => {
    if ((key === "passes" || key === "set") && isObject(value) && Object.keys(value).length) {
      const rows = Object.entries(value).filter(([, v]) => v !== undefined).map(([k, v]) => `  ${JSON.stringify(k)}: ${key === "set" ? department(v) : inline(v)}`);
      return ` ${JSON.stringify(key)}: {\n${rows.join(",\n")}\n }`;
    }
    return ` ${JSON.stringify(key)}: ${inline(value)}`;
  });
  return `{\n${members.join(",\n")}\n}\n`;
}

// ---------------------------------------------------------------- what a spec says to build, and the changes a build makes to it

/** The departments a spec's `build` list names, checked: known, ones the app makes free, once each, in the pipeline's order. */
export function buildOf(spec) {
  const list = spec?.build;
  if (!Array.isArray(list)) return null;
  const bad = list.find((d) => !BUILDABLE.includes(d));
  if (bad !== undefined) throw new Error(`build names ${JSON.stringify(bad)}: the app makes ${BUILDABLE.join(", ")} here (the others are taken as shipped)`);
  const order = list.map((d) => BUILDABLE.indexOf(d));
  if (order.some((n, i) => i && n <= order[i - 1])) throw new Error(`build is ${JSON.stringify(list)}: list each department once, in the order of the pipeline (${BUILDABLE.join(", ")})`);
  return list;
}

/**
 * The spec as the seeder is given it for a build: without the passes about to be made (and what would mark them as made), so a shipped
 * pass cannot be mistaken for the new one. Everything else is as it is.
 */
export function withoutBuilt(spec) {
  const build = buildOf(spec) ?? [];
  const out = structuredClone(spec);
  for (const d of build) delete out.passes?.[d];
  if (build.includes("fx") && isObject(out.set?.fx)) delete out.set.fx.baked;
  if (build.includes("comp") && isObject(out.set?.comp)) delete out.set.comp.exports;
  return out;
}

/** The entry of a pass the app made, as the shipped specs write one: { file, seconds?, width, height, note, source }. */
export function madeEntry({ file, seconds, width, height, note }) {
  return { file, ...(Number.isFinite(seconds) && seconds > 0 ? { seconds } : {}), width, height, note: String(note ?? ""), source: "free" };
}

/**
 * The spec with the passes the app made put in (an entry that was there keeps its place; a new one goes where the pipeline puts it), and
 * `rev` one higher when `changed` says a file's bytes changed. `made` is { department: entry }.
 */
export function withMade(spec, made, changed) {
  const out = structuredClone(spec);
  const have = { ...(out.passes ?? {}), ...made };
  const known = DEPARTMENTS.filter((d) => d in have);
  out.passes = Object.fromEntries([...known, ...Object.keys(have).filter((d) => !known.includes(d))].map((d) => [d, have[d]]));
  if (changed) out.rev = (Number(out.rev) || 1) + 1;
  return out;
}
