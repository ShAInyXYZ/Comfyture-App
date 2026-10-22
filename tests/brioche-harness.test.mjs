// Brioche's harness: every workspace is one spec (web/js/brioche/space-*.js) and everything she is given is made from it, so these
// checks fail the moment an action is half-added: no line in her brief, a field the tool does not carry, an example the reader
// drops, a workspace sentence that forgot a thing, or a spec action the page has no handler for (or the other way round).
// No model is called.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SPACES, specOf, opsOf, briefOf, toolOf, cleanAnswer, promptOf, docFields, spaceOf } from "../web/js/brioche/harness.js";

const root = join(import.meta.dirname, "..");

// what the page's summary() sends, as far as an example needs it: the kit, the brief and directions, the design open and the others
const FIXTURE = {
  name: "Comfyture",
  kit: {
    about: "A creation desk.",
    tagline: "Shots worth keeping.",
    palette: [{ id: "yellow", name: "Yellow", hex: "#F2FF59", role: "Signal", share: 10 }, { id: "ink", name: "Ink", hex: "#211927", role: "Ground", share: 50 }, { id: "plum", name: "Plum", hex: "#49378B", role: "Second ground", share: 20 }, { id: "white", name: "Warm white", hex: "#F0EFED", role: "Text", share: 20 }],
    type: { display: { family: "Inter", weight: 700 }, text: { family: "Inter", weight: 400 }, mono: { family: "JetBrains Mono", weight: 400 } },
    logos: [{ id: "wordmark-yellow", kind: "wordmark", tone: "yellow", ground: "ink" }, { id: "mark-ink", kind: "mark", tone: "ink", ground: "yellow" }],
    voice: { summary: "Warm and plain.", words: ["warm"], dos: ["Be plain"], donts: ["No hype"] },
  },
  brief: { pitch: "A warm home for jam.", goals: ["Feel welcoming"] },
  directions: [{ id: "dir-warm", name: "Warm and bold", note: "Confident.", picked: true }],
  design: {
    id: "launch", name: "Launch", purpose: "Launch", status: "draft", format: "4:5", openFormat: "4:5",
    layers: [{ id: "headline", type: "text", role: "headline", x: 0.1, y: 0.1, w: 0.8, size: 0.08, fontRole: "display", colorRole: "white", align: "left", text: "Shots worth keeping" }, { id: "logo", type: "logo", role: "logo", x: 0.1, y: 0.8, w: 0.3, logo: "wordmark-yellow" }, { id: "photo", type: "image", role: "hero", x: 0, y: 0.4, w: 1, src: "/a.png", fit: "cover" }],
  },
  designs: [{ id: "launch", name: "Launch", purpose: "Launch", format: "4:5", status: "draft" }, { id: "other", name: "Other", purpose: "Offer", format: "1:1", status: "draft" }],
};

test("every action's doc opens with the list of its fields, and the list is its fields", () => {
  for (const space of SPACES) {
    for (const [op, a] of Object.entries(specOf(space).actions)) {
      assert.deepEqual(docFields(a.doc), Object.keys(a.fields), `${space}.${op}: the doc lists {${Object.keys(a.fields).join(", ")}}`);
      assert.equal(typeof a.example, "function", `${space}.${op} has an example`);
    }
  }
  assert.deepEqual(docFields("{persona, hook, beats[{kind, line}], fresh}: x"), ["persona", "hook", "beats", "fresh"], "a nested list is one name");
  assert.deepEqual(docFields("{}: sets"), []);
  assert.equal(docFields("no list"), null);
});

test("every op is in her brief and in her tool, and the tool's ops are the spec's", () => {
  for (const space of SPACES) {
    const ops = opsOf(space);
    assert.equal(ops.at(-1), "open_space");
    assert.deepEqual(ops.slice(0, -1), Object.keys(specOf(space).actions));
    const brief = briefOf(space);
    const tool = toolOf(space);
    const item = tool.input_schema.properties.actions.items;
    assert.deepEqual(item.properties.op.enum, ops, `${space}: the tool's ops`);
    for (const op of ops) assert.ok(brief.includes(`- ${op} `), `${space}: the brief has a line for ${op}`);
    for (const a of Object.values(specOf(space).actions)) for (const f of Object.keys(a.fields)) assert.ok(f in item.properties, `${space}: the tool carries ${f}`);
    assert.ok("space" in item.properties);
    assert.equal(tool.description, specOf(space).description);
  }
});

test("every brief names every workspace with what it holds, and what is made in one place only", () => {
  for (const space of SPACES) {
    const brief = briefOf(space);
    for (const id of SPACES) {
      const s = specOf(id);
      assert.ok(brief.includes(`${s.name} (${s.holds}`), `${space}'s brief names ${s.name} and what it holds`);
      for (const o of s.owns ?? []) assert.ok(brief.includes(`${o} is made here and only here`), `${space}'s brief says ${o} is made only in ${s.name}`);
    }
    assert.ok(brief.includes(`THE OPEN WORKSPACE: ${specOf(space).name}`), "and the open one's own text");
    assert.match(brief, /Macaron has five workspaces, in this order: Brand kit \(.*\), Design idea \(.*\), Studio \(.*\), Create \(.*\) and Brand book \(/);
  }
});

test("every action's example is kept by the reader, field by field", () => {
  for (const space of SPACES) {
    for (const [op, a] of Object.entries(specOf(space).actions)) {
      const example = a.example(FIXTURE);
      const kept = cleanAnswer(JSON.stringify({ reply: "", actions: [{ op, ...example }] }), space).actions;
      assert.equal(kept.length, 1, `${space}.${op}: the example is kept`);
      assert.equal(kept[0].op, op);
      for (const k of Object.keys(example)) assert.notEqual(kept[0][k], undefined, `${space}.${op}: the example's ${k} is kept`);
      // and only in its own workspace
      for (const other of SPACES.filter((x) => x !== space)) assert.ok(!cleanAnswer(JSON.stringify({ reply: "", actions: [{ op, ...example }] }), other).actions.some((x) => x.op === op), `${op} is not read in ${other}`);
    }
  }
});

test("an example for a nested action is kept inside make_variation, and the others are not", () => {
  const create = specOf("create").actions;
  const nested = Object.entries(create).filter(([, a]) => a.nested).map(([op]) => op);
  assert.deepEqual(nested, ["edit_text", "set_layer", "add_layer", "remove_layer", "set_background", "apply_kit", "suggest_layout", "adapt_format"]);
  const actions = Object.entries(create).map(([op, a]) => ({ op, ...a.example(FIXTURE) }));
  const [v] = cleanAnswer(JSON.stringify({ reply: "", actions: [{ op: "make_variation", kind: "copy", actions }] }), "create").actions;
  assert.deepEqual(v.actions.map((x) => x.op), nested);
});

test("what is not an action is dropped: an op she made up, one of the object's own names, a field that is not the action's", () => {
  const out = cleanAnswer(JSON.stringify({ reply: "x", actions: [{ op: "constructor" }, { op: "toString" }, { op: "rename", name: "A", evil: 1, layer: "headline" }, null, 3, { op: "open_space", space: "nowhere" }] }), "create").actions;
  assert.deepEqual(out, [{ op: "rename", name: "A" }, { op: "open_space" }]);
  assert.equal(cleanAnswer("{}", "kit").actions.length, 0);
  assert.equal(spaceOf("content"), "create");
});

test("every action of a spec has a handler on the page, and every handler an action", () => {
  for (const space of SPACES) {
    const page = readFileSync(join(root, `web/js/brioche/run-${space}.js`), "utf8");
    const handlers = [...page.slice(page.indexOf("export const RUN")).split("\n};")[0].matchAll(/^  (\w+)\(/gm)].map((m) => m[1]);
    assert.deepEqual(handlers.sort(), Object.keys(specOf(space).actions).sort(), `run-${space}.js and space-${space}.js list the same actions`);
  }
});

test("what she is told names the workspace open, and each workspace gives its own lines", () => {
  for (const space of SPACES) {
    const text = promptOf({ ...FIXTURE, space }, [{ role: "user", text: "Hello" }]);
    assert.match(text, new RegExp(`WORKSPACE OPEN: ${specOf(space).name}`));
    assert.match(text, /User: Hello/);
    assert.equal(/Palette \(ids\)/.test(text), space !== "idea", "the palette is told everywhere but in Design idea");
  }
});
