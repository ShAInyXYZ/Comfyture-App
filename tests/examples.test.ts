// The examples every product ships are put in by one set of rules (server/examples.ts): once; a newer version replaces an untouched copy
// only; a deleted one stays deleted; one the person worked on is left alone; a retired one goes unless worked on; files named
// "example:<file>" are copied in and named by their id.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { seedExamples, readLedger, ledgerState, placeMedia, placeThumb, shelfOf, type ExampleKind } from "../server/examples.ts";

/** A product with a folder of examples and a store of its own, both in a scratch folder. */
async function product(t: any) {
  const root = await mkdtemp(join(tmpdir(), "examples-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dir = join(root, "examples");
  const store = join(root, "data", "things");
  await mkdir(store, { recursive: true });
  const example = async (id: string, spec: object) => {
    await mkdir(join(dir, id), { recursive: true });
    await writeFile(join(dir, id, "spec.json"), JSON.stringify({ id, ...spec }));
  };
  const read = async (id: string) => JSON.parse(await readFile(join(store, `${id}.json`), "utf8").catch(() => "null"));
  const save = (p: any) => writeFile(join(store, `${p.id}.json`), JSON.stringify(p));
  const kind: ExampleKind = {
    name: "things",
    dir,
    spec: "spec.json",
    ledger: join(store, ".seeded"),
    kept: read,
    drop: (id) => rm(join(store, `${id}.json`), { force: true }),
    put: async (spec: any, _folder, id, rev) => {
      const at = new Date().toISOString();
      await save({ id, name: spec.name, rev, createdAt: at, updatedAt: at });
    },
  };
  return { root, dir, store, example, read, save, kind };
}

test("an example goes in once, and a deleted one stays deleted", async (t) => {
  const p = await product(t);
  await p.example("a", { name: "Alpha" });
  assert.deepEqual((await seedExamples(p.kind)).added, ["a"]);
  assert.equal((await p.read("a")).name, "Alpha");
  assert.deepEqual((await seedExamples(p.kind)).added, [], "a second start puts nothing in again");
  await rm(join(p.store, "a.json"));
  const again = await seedExamples(p.kind);
  assert.deepEqual([again.added, again.replaced], [[], []]);
  assert.equal(await p.read("a"), null, "deleted, it stays deleted");
});

test("a newer version replaces an untouched copy, and leaves one the person worked on", async (t) => {
  const p = await product(t);
  await p.example("a", { name: "Alpha" });
  await p.example("b", { name: "Beta" });
  await seedExamples(p.kind);
  const b = await p.read("b");
  await p.save({ ...b, name: "My Beta", updatedAt: "2031-01-01T00:00:00.000Z" });
  await p.example("a", { name: "Alpha 2", rev: 2 });
  await p.example("b", { name: "Beta 2", rev: 2 });
  const done = await seedExamples(p.kind);
  assert.deepEqual([done.replaced, done.kept], [["a"], ["b"]]);
  assert.equal((await p.read("a")).name, "Alpha 2");
  assert.equal((await p.read("b")).name, "My Beta", "worked on: left as it is");
  assert.deepEqual(Object.fromEntries(ledgerState(readLedger(await readFile(p.kind.ledger, "utf8")))), { a: 2, b: 2 });
});

test("a project of an example's id that did not come from it is the person's own", async (t) => {
  const p = await product(t);
  await p.save({ id: "a", name: "Mine", createdAt: "2030-01-01", updatedAt: "2030-01-01" });
  await p.example("a", { name: "Alpha" });
  assert.deepEqual((await seedExamples(p.kind)).kept, ["a"]);
  assert.equal((await p.read("a")).name, "Mine");
});

test("a retired example goes unless the person worked on it", async (t) => {
  const p = await product(t);
  await p.example("a", { name: "Alpha" });
  await p.example("b", { name: "Beta" });
  await seedExamples(p.kind);
  await p.save({ ...(await p.read("b")), updatedAt: "2031-01-01T00:00:00.000Z" });
  await rm(join(p.dir, "a"), { recursive: true });
  await rm(join(p.dir, "b"), { recursive: true });
  assert.deepEqual((await seedExamples(p.kind)).retired.sort(), ["a", "b"]);
  assert.equal(await p.read("a"), null, "untouched: taken out with the example");
  assert.equal((await p.read("b")).name, "Beta", "worked on: kept");
  assert.deepEqual((await seedExamples(p.kind)).retired, [], "retired once");
});

test("the ledger reads Spice's JSON list and Jam's lines alike", () => {
  assert.deepEqual(readLedger('["a","a@2","b@retired"]'), ["a", "a@2", "b@retired"]);
  assert.deepEqual(readLedger("a\nb@3\n"), ["a", "b@3"]);
  assert.deepEqual(readLedger(""), []);
  assert.deepEqual(Object.fromEntries(ledgerState(["a", "a@3", "a@2", "b@retired", "b@4"])), { a: 3, b: "retired" });
});

test("examples that are single files (Macaron's brands) are topped up once they are in", async (t) => {
  const p = await product(t);
  await mkdir(p.dir, { recursive: true });
  await writeFile(join(p.dir, "comfyture.brand.json"), JSON.stringify({ id: "brand-comfyture", name: "Comfyture" }));
  const topped: string[] = [];
  const kind = { ...p.kind, spec: "*.brand.json", topUp: async (_s: any, id: string) => void topped.push(id) };
  assert.deepEqual((await seedExamples(kind)).added, ["brand-comfyture"]);
  assert.deepEqual(topped, []);
  await seedExamples(kind);
  assert.deepEqual(topped, ["brand-comfyture"], "the next start tops the copy up");
});

test("files named example:<file> go into the data folder by their kind, named by the example's id", async (t) => {
  const p = await product(t);
  const folder = join(p.dir, "toast-x");
  await mkdir(folder, { recursive: true });
  for (const f of ["render.png", "clip.mp4", "song.mp3", "model.glb", "thumb.jpg"]) await writeFile(join(folder, f), f);
  const data = join(p.root, "data");
  const { body, files } = await placeMedia({ photo: { file: "example:render.png", url: "example:render.png" }, clips: ["example:clip.mp4"], song: "example:song.mp3", model: { url: "example:model.glb" }, note: "example of nothing" }, folder, "toast-x", data);
  assert.deepEqual(body, { photo: { file: "toast-x-render.png", url: "/media/photos/toast-x-render.png" }, clips: ["/media/videos/toast-x-clip.mp4"], song: "/media/audio/toast-x-song.mp3", model: { url: "/media/models/toast-x-model.glb" }, note: "example of nothing" });
  assert.deepEqual(files.sort(), ["audio/toast-x-song.mp3", "models/toast-x-model.glb", "photos/toast-x-render.png", "videos/toast-x-clip.mp4"]);
  assert.deepEqual(await readdir(join(data, "photos")), ["toast-x-render.png"]);
  assert.equal(await placeThumb("thumb.jpg", folder, "toast-x", data), "/media/photos/toast-x-thumb.jpg");
  assert.equal(await placeThumb("brand/old/thumb.jpg", folder, "toast-x", data), "brand/old/thumb.jpg", "a path of the app is kept as it is");
  await assert.rejects(placeMedia("example:../secret.png", folder, "toast-x", data), /own folder/);
  assert.equal(shelfOf("notes.txt"), null);
});
