// The JSON style of a Spice example's spec (examples/spice/<shot>/shot.json) and the plain rules scripts/spice-examples.mjs changes one by:
// the formatter gives every spec there is back byte for byte, a pass the app made is written as the shipped ones are, and a build list is
// checked. (The script itself needs a browser and ffmpeg: scripts/spice-examples.mjs.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { formatShot, inline, buildOf, withoutBuilt, madeEntry, withMade } from "../scripts/spice-shot-json.mjs";

const spiceDir = resolve(import.meta.dirname, "..", "examples", "spice");
/** Every spec the app ships: [folder, text]. */
async function specs() {
  const folders = (await readdir(spiceDir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  const list = [];
  for (const f of folders) list.push([f, await readFile(join(spiceDir, f, "shot.json"), "utf8").catch(() => null)]);
  return list.filter(([, text]) => text !== null);
}

test("the formatter gives every spec the app ships back byte for byte", async () => {
  const all = await specs();
  assert.ok(all.length >= 6, "the shipped specs are there");
  for (const [folder, text] of all) assert.equal(formatShot(JSON.parse(text)), text, `${folder}/shot.json`);
});

test("the style: one space of indent, a pass a line, a department a line, FX's layers a line each, the rest on one line", () => {
  const spec = {
    id: "x", rev: 2, name: "X", about: "Un été · flambé", build: ["light", "fx"],
    passes: { plate: { file: "plate.jpg", width: 2, height: 1, name: "P" }, fx: { file: "fx.jpg", width: 2, height: 1, note: "2 layers baked", source: "free" } },
    set: { roto: { subjects: [{ id: "s", points: [], media: null, eye: true }], open: "s" }, fx: { layers: [{ id: "a", el: "dust", amount: 0.5 }, { id: "b", el: "sparkles" }] }, comp: { picFormat: "webp" } },
  };
  assert.equal(formatShot(spec), [
    "{",
    ' "id": "x",',
    ' "rev": 2,',
    ' "name": "X",',
    ' "about": "Un été · flambé",',
    ' "build": ["light", "fx"],',
    ' "passes": {',
    '  "plate": {"file": "plate.jpg", "width": 2, "height": 1, "name": "P"},',
    '  "fx": {"file": "fx.jpg", "width": 2, "height": 1, "note": "2 layers baked", "source": "free"}',
    " },",
    ' "set": {',
    '  "roto": {"subjects": [{"id": "s", "points": [], "media": null, "eye": true}], "open": "s"},',
    '  "fx": { "layers": [',
    '   {"id": "a", "el": "dust", "amount": 0.5},',
    '   {"id": "b", "el": "sparkles"}',
    "  ] },",
    '  "comp": {"picFormat": "webp"}',
    " }",
    "}",
    "",
  ].join("\n"));
  // what FX keeps beside its layers goes on the same line, in the order the spec has it, and the text reads back as the same spec
  const finished = { ...spec, set: { ...spec.set, fx: { layers: spec.set.fx.layers, finish: { grain: 0.2 } } } };
  const text = formatShot(finished);
  assert.ok(text.includes('\n  ], "finish": {"grain": 0.2} },\n'), text);
  assert.deepEqual(JSON.parse(text), finished);
  assert.equal(formatShot(JSON.parse(text)), text, "and writing it again changes nothing");
  assert.equal(inline({ a: [], b: {}, c: undefined, d: [1, "x", null] }), '{"a": [], "b": {}, "d": [1, "x", null]}');
});

test("a spec is changed without being reflowed: the passes the app made go where the pipeline puts them, rev goes up only when a file changed", async () => {
  for (const [folder, text] of await specs()) {
    const spec = JSON.parse(text);
    // the app makes again exactly what the spec holds: nothing changes
    const made = Object.fromEntries(["light", "fx", "comp"].filter((d) => spec.passes[d]).map((d) => [d, madeEntry(spec.passes[d])]));
    assert.equal(formatShot(withMade(spec, made, false)), text, `${folder}: its own made passes written again`);
  }
  const paprika = JSON.parse(await readFile(join(spiceDir, "sh050-paprika", "shot.json"), "utf8"));
  // the passes that were not there go where the pipeline puts them, whatever the order they were made in, and rev goes up by one when a file changed
  const bare = { ...paprika, passes: { plate: paprika.passes.plate, roto: paprika.passes.roto } };
  const light = madeEntry({ file: "light.jpg", width: 1536, height: 1024, note: "warm · ffmpeg" });
  const next = withMade(bare, { comp: paprika.passes.comp, fx: paprika.passes.fx, light }, true);
  assert.deepEqual(Object.keys(next.passes), ["plate", "roto", "light", "fx", "comp"]);
  assert.equal(next.rev, paprika.rev + 1);
  assert.equal(withMade(paprika, {}, false).rev, paprika.rev, "nothing changed: the same rev");
  assert.equal(bare.rev, paprika.rev, "and the spec it was made from is not changed");
  // a clip's entry has its seconds, a picture's has none; the note is what the app said
  assert.deepEqual(Object.keys(madeEntry({ file: "fx.mp4", seconds: 3.042, width: 1280, height: 704, note: "3 layers baked" })), ["file", "seconds", "width", "height", "note", "source"]);
  assert.deepEqual(Object.keys(madeEntry({ file: "fx.jpg", width: 1536, height: 1024, note: "4 layers baked" })), ["file", "width", "height", "note", "source"]);
});

test("a build list names the departments the app makes, once each, in the pipeline's order; the spec the seeder gets has none of their passes", async () => {
  assert.equal(buildOf({}), null, "no list: nothing is built");
  assert.deepEqual(buildOf({ build: ["light", "fx", "comp"] }), ["light", "fx", "comp"]);
  assert.deepEqual(buildOf({ build: ["fx", "comp"] }), ["fx", "comp"]);
  assert.throws(() => buildOf({ build: ["paint"] }), /"paint"/, "Paint is a hand-made pass or a paid one");
  assert.throws(() => buildOf({ build: ["comp", "fx"] }), /order of the pipeline/);
  assert.throws(() => buildOf({ build: ["fx", "fx"] }), /once/);
  const jam = JSON.parse(await readFile(join(spiceDir, "sh060-jam-chase", "shot.json"), "utf8"));
  const seeded = withoutBuilt({ ...jam, build: ["light", "fx", "comp"], set: { ...jam.set, comp: { ...jam.set.comp, exports: [{ url: "x" }] }, fx: { ...jam.set.fx, baked: "sig" } } });
  assert.deepEqual(Object.keys(seeded.passes), ["plate", "roto", "paint"], "the passes about to be made are gone, the shipped ones stay");
  assert.equal(seeded.set.comp.exports, undefined);
  assert.equal(seeded.set.fx.baked, undefined);
  assert.deepEqual(seeded.set.fx.layers, jam.set.fx.layers, "and the settings are as they were");
  assert.ok(jam.passes.fx, "the spec it was made from is not changed");
});
