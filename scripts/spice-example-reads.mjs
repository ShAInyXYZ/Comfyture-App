// Paprika's read of each shot of the example scenario, made for real (one frame of each plate to the assistant model) and written into
// examples/spice/heist/scenario.json, so a fresh install shows her read of every shot without a key. Runs against a server of this branch
// with the keys of .env (the model on Comfy Router):
//   SERVER=http://127.0.0.1:5594 node scripts/spice-example-reads.mjs        (ONLY=sh010,sh030 to redo some)
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const SERVER = (process.env.SERVER ?? "http://127.0.0.1:5594").replace(/\/$/, "");
const file = join(root, "examples", "spice", "heist", "scenario.json");
const spec = JSON.parse(await readFile(file, "utf8"));
const only = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;
const api = async (path, init) => {
  const res = await fetch(`${SERVER}${path}`, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path}: ${body.error ?? res.status}`);
  return body;
};
// the example is seeded in the server's library by the first read of its store
await api("/api/spice-scenarios");
for (const s of spec.shots) {
  if (only && !only.has(s.id)) continue;
  if (s.read && !only) {
    console.log(`${s.id}: read already`);
    continue;
  }
  const video = `${spec.id}-${s.id}-plate.mp4`;
  console.log(`${s.id}: Paprika reads ${video}`);
  const out = await api("/api/spice/read", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ video, name: s.name, about: s.about, words: s.made?.words ?? "" }) });
  s.read = { at: out.at, text: out.text, off: out.off, question: out.question, suggestions: out.suggestions };
  console.log(`  ${out.text.slice(0, 140)}`);
  console.log(`  off: ${out.off.slice(0, 120)}`);
  for (const c of out.suggestions) console.log(`  chain: ${c.title}: ${c.steps.map((st) => st.tool).join(" > ")}`);
  await writeFile(file, `${JSON.stringify(spec, null, 1)}\n`);
}
console.log("done");
