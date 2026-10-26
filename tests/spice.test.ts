// Spice's rules (web/js/spice-model.js) and its engine's registry and example seeder (server/spice.ts): a scenario as it is kept, the
// chain of passes and the bin, the prices, the tools there are, and an example folder put into the store.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm, mkdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, normalize, sep } from "node:path";
import { execFileSync } from "node:child_process";
import * as m from "../web/js/spice-model.js";
import { createSpice, STORE } from "../server/spice.ts";
import { PAPRIKA, WORKSPACES, PLACEHOLDER, OFFERS } from "../web/js/spice-harness.js";

const root = resolve(import.meta.dirname, "..");
const clip = (file: string, seconds = 1) => ({ kind: "video", url: `/media/videos/${file}`, file, width: 1280, height: 704, seconds });

test("a scenario kept by an earlier Spice, or junk, is filled in and never thrown at", () => {
  for (const junk of [null, undefined, 5, "x", [], {}]) {
    const b = m.normaliseBody(junk);
    assert.deepEqual(b, { v: 3, logline: "", shots: [], open: null, log: [] });
  }
  const b = m.normaliseBody({ logline: "x".repeat(400), open: "sh2", shots: [{ id: "sh1", name: "One", plate: clip("a.mp4", 5), passes: [{ id: "p1", tool: "deblur", name: "Deblur", media: clip("b.mp4", 5), input: clip("a.mp4", 5), on: null, credits: "3.5", params: { size: "standard", strength: 9, seconds: 0, aspect: 2.39, height: 1080, region: { x: 2, y: -1, w: 0.5, h: 0.5 } } }, { id: "bad", tool: "x" }], bin: [{ id: "t1", tool: "water", media: clip("c.mp4") }], sel: "p1" }, { nope: true }], log: [{ at: "2026-10-26T10:00:00.000Z", shot: "sh1", tool: "deblur", label: "Deblur", credits: 3.5 }] });
  assert.equal(b.logline.length, 300);
  assert.equal(b.shots.length, 1, "a shot without an id is dropped");
  assert.equal(b.open, "sh1", "an open shot that is not there falls back to the first");
  const s = b.shots[0];
  assert.equal(s.passes.length, 1, "a pass without a clip is dropped");
  assert.deepEqual(s.passes[0].params, { size: "standard", strength: 3, seconds: 1, aspect: 2.39, height: 1080, region: { x: 1, y: 0, w: 0.5, h: 0.5 } }, "every number within its range");
  assert.equal(s.passes[0].credits, 3.5);
  assert.equal(s.bin.length, 1);
  assert.equal(b.log[0].credits, 3.5);
  assert.equal(m.lookingAt(s)?.id, "p1");
  assert.equal(m.outputOf(s)?.file, "b.mp4");
});

test("a shot keeps Paprika's read: her words cut to size, her chains with only real steps, junk dropped", () => {
  const s = m.shotOf({ id: "sh1", name: "One", plate: clip("plate.mp4", 5), read: { at: "2026-10-26T19:00:00.000Z", text: "x".repeat(600), off: "a van", question: "what?", suggestions: [{ title: "Night", why: "w", steps: [{ tool: "deblur", words: "y", size: "standard" }, { nope: 1 }, { tool: "outpaint", size: "huge" }] }, { title: "Empty", steps: [] }, null] } })!;
  assert.equal(s.read?.text.length, 500);
  assert.deepEqual(s.read?.suggestions, [{ title: "Night", why: "w", steps: [{ tool: "deblur", words: "y", size: "standard" }, { tool: "outpaint", words: "" }] }]);
  assert.equal(m.shotOf({ id: "sh2", name: "Two", read: { text: "" } })!.read, null, "an empty read is none");
  assert.equal(m.readOf({ suggestions: [{ title: "A", steps: [{ tool: "x" }] }] })?.title, undefined);
});

test("the chain: a run goes on the pass looked at; a pass taken off waits in the bin with what was on top of it; put back, the chain is rebuilt", () => {
  const s = m.shotOf({ id: "sh1", name: "One", plate: clip("plate.mp4", 5), passes: [
    { id: "p1", tool: "obscura", name: "Obscura", on: null, input: clip("plate.mp4"), media: clip("p1.mp4") },
    { id: "p2", tool: "day-to-night", name: "Day to night", on: "p1", input: clip("p1.mp4"), media: clip("p2.mp4") },
    { id: "p3", tool: "outpaint", name: "Outpaint", on: "p2", input: clip("p2.mp4"), media: clip("p3.mp4") },
  ], bin: [], sel: "p2" })!;
  assert.equal(m.inputFor(s)?.file, "p2.mp4", "a new run goes on the pass looked at");
  assert.ok(m.takeOff(s, "p2"));
  assert.deepEqual(s.passes.map((p) => p.id), ["p1"]);
  assert.deepEqual(s.bin.map((p) => p.id), ["p2", "p3"], "the passes made on top of it went to the bin too");
  assert.equal(s.sel, "p1");
  assert.ok(!m.putBack(s, "p3"), "p3 was made on p2, which is in the bin: it cannot go back yet");
  assert.deepEqual(s.passes.map((p) => p.id), ["p1"]);
  assert.ok(m.putBack(s, "p2"));
  assert.deepEqual(s.passes.map((p) => p.id), ["p1", "p2"]);
  assert.deepEqual(s.bin.map((p) => p.id), ["p3"]);
  assert.ok(m.putBack(s, "p3"));
  assert.deepEqual(s.passes.map((p) => p.id), ["p1", "p2", "p3"]);
  assert.deepEqual(s.bin, []);
  assert.equal(s.sel, "p3");
  m.forget(s, "nope");
  assert.ok(!m.takeOff(s, "nope"));
});

test("frames are slate numbers from 1001; the prices follow what Comfy Cloud was measured to charge", () => {
  assert.equal(m.FIRST, 1001);
  assert.equal(m.lastFrame(clip("a.mp4", 5)), 1001 + 120 - 1);
  assert.equal(m.lastFrame({ kind: "image", url: "/x", file: "x.png", width: 1, height: 1 } as any), 1001);
  assert.equal(m.secondsAt(1025), 1);
  assert.equal(m.frameAt(2), 1049);
  assert.equal(m.icCredits(5, "draft"), 6);
  assert.equal(m.icCredits(5, "standard"), 30);
  assert.equal(m.shotCredits(5), 24);
  assert.equal(m.priceOf({ kind: "iclora" }, { seconds: 2, size: "draft" }), 2);
  assert.equal(m.priceOf({ kind: "engine", gpu: 10 }, { seconds: 5 }), 13);
  assert.equal(m.priceOf({ kind: "template", credits: 41 }), 41);
  assert.equal(m.priceOf({ kind: "template", credits: null }), null);
  assert.equal(m.nextShotName([{}, {}]), "SH030");
  assert.equal(m.nextScenarioName([{ name: "Scenario 1" }]), "Scenario 2");
});

test("the day's credits are the log's, and a run's cost is logged once", () => {
  const b = m.blankBody();
  m.logCredits(b, { shot: "sh1", tool: "deblur", label: "Deblur", credits: 6 });
  m.logCredits(b, { shot: "sh1", tool: "sound", label: "Sound", credits: 0 });
  assert.equal(b.log.length, 1);
  assert.equal(m.creditsToday(b), 6);
  assert.equal(m.creditsToday(b, new Date("2000-01-01")), 0);
});

test("Paprika's harness: one room, the suite, with her words and her offers", () => {
  assert.equal(PAPRIKA.id, "paprika");
  assert.deepEqual(WORKSPACES.map((w) => w.id), ["suite"]);
  assert.ok(PLACEHOLDER.suite.startsWith("Ask Paprika"));
  assert.ok(OFFERS.suite.length >= 3 && OFFERS.suite.every((o) => o.label && o.ask));
});

const fakeDeps = (data: string) => ({
  data, root, ffmpeg: true, engine: null, templates: null,
  probeVideo: async () => ({ width: 1280, height: 704, frames: 24, duration: 1 }),
  exec: async () => ({ stdout: "" }),
  inside: (folder: string, rel: string) => (normalize(join(folder, rel)).startsWith(folder + sep) ? normalize(join(folder, rel)) : null),
  exists: async (p: string) => stat(p).then(() => true, () => false),
  readProject: async () => null,
  writeProject: async (_kind: string, p: any) => void (written = p),
  stamp: () => "2026-10-26T12:00:00.000Z",
});
let written: any = null;

test("the registry: every IC-LoRA of the suite, the app's own graphs and the catalog's templates, by family", async () => {
  const spice = createSpice(fakeDeps("/nope") as any);
  const r = await spice.registry();
  assert.ok(r.tools.length >= 44, `${r.tools.length} tools`);
  const kinds = new Set(r.tools.map((t) => t.kind));
  assert.deepEqual([...kinds].sort(), ["engine", "iclora", "template"]);
  for (const id of ["deblur", "day-to-night", "outpaint", "obscura", "cutout", "upscale", "sound", "restyle", "slowmo"]) assert.ok(r.tools.some((t) => t.id === id), id);
  assert.ok(r.tools.every((t) => t.preview === undefined || /^brand\/spice\/previews\/[\w-]+\.jpg$/.test(t.preview)), "a preview is a picture of ours");
  const outpaint = r.tools.find((t) => t.id === "outpaint")!;
  assert.ok(outpaint.takes.includes("aspect"), "a widening tool takes an aspect");
  assert.ok(r.tools.find((t) => t.id === "upscale")!.takes.includes("height"));
  assert.ok(r.tools.find((t) => t.id === "ingredients")!.needs?.length, "a tool that needs more than a clip says so");
  for (const t of r.tools) assert.ok(r.families.some((f) => f.id === t.family), `${t.id} is in a family (${t.family})`);
  assert.equal(STORE, "spice-scenarios");
});

test("a run is refused in words before anything is sent: an unknown tool, a tool that needs more than a clip, a missing clip", async () => {
  const spice = createSpice(fakeDeps("/nope") as any);
  await assert.rejects(spice.run({ tool: "nope", video: "x.mp4" }), /not in the suite/);
  await assert.rejects(spice.run({ tool: "ingredients", video: "x.mp4" }), /needs .* not offered yet/);
  await assert.rejects(spice.run({ tool: "deblur", video: "../../etc/passwd" }), /missing/);
  await assert.rejects(spice.run({ tool: "deblur", video: "gone.mp4" }), /missing/);
});

test("an example scenario folder is put into the store: its clips into the library, each pass on the one before, nothing of it counted as spent", async () => {
  const data = await mkdtemp(join(tmpdir(), "spice-data-"));
  const folder = await mkdtemp(join(tmpdir(), "spice-example-"));
  try {
    for (const f of ["plate.mp4", "p1.mp4", "p2.mp4"]) execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=gray:s=64x32:r=24", "-t", "0.5", "-pix_fmt", "yuv420p", join(folder, f)]);
    await writeFile(join(folder, "still.jpg"), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    const spec = { id: "spice-example-test", rev: 2, name: "Test heist", logline: "A test.", shots: [{ id: "sh010", name: "SH010", about: "x", plate: { file: "plate.mp4", width: 64, height: 32, seconds: 0.5, still: "still.jpg" }, made: { words: "it moves", seconds: 5 }, passes: [{ tool: "deblur", name: "Deblur", words: "", media: { file: "p1.mp4", width: 64, height: 32, seconds: 0.5 }, credits: 9 }, { tool: "sound", name: "Sound", words: "wind", media: { file: "p2.mp4", width: 64, height: 32, seconds: 0.5 } }] }] };
    const spice = createSpice(fakeDeps(data) as any);
    await spice.putExample(spec, folder, spec.id, 2);
    assert.equal(written.id, "spice-example-test");
    assert.equal(written.createdAt, written.updatedAt, "untouched: a newer rev may replace it");
    assert.equal(written.thumb, "/media/photos/spice-example-test-r2-still.jpg");
    const s = written.body.shots[0];
    assert.equal(s.plate.url, "/media/videos/spice-example-test-r2-plate.mp4");
    assert.ok((await stat(join(data, "videos", "spice-example-test-r2-plate.mp4"))).size > 0);
    assert.deepEqual(s.passes.map((p: any) => [p.on, p.input.file, p.media.file, p.credits, p.example]), [[null, "spice-example-test-r2-plate.mp4", "spice-example-test-r2-p1.mp4", 0, true], ["ex-0-0", "spice-example-test-r2-p1.mp4", "spice-example-test-r2-p2.mp4", 0, true]]);
    assert.equal(s.sel, "ex-0-1", "the shot opens on its last pass");
    assert.deepEqual(written.body.log, [], "nothing of an example is counted as spent");
    assert.deepEqual(spice.info(written.body), { shots: 1, passes: 2, log: [] });
  } finally {
    await rm(data, { recursive: true, force: true });
    await rm(folder, { recursive: true, force: true });
  }
});

test("the scenario Spice ships is whole: each shot its plate, every clip it names in its folder, the passes chained, the folder small enough", async () => {
  const dir = join(root, "examples", "spice");
  const { readdir } = await import("node:fs/promises");
  const folders = (await readdir(dir, { withFileTypes: true }).catch(() => [])).filter((d) => d.isDirectory()).map((d) => d.name);
  assert.ok(folders.length >= 1, "Spice ships at least one scenario");
  for (const folder of folders) {
    const spec = JSON.parse(await readFile(join(dir, folder, "scenario.json"), "utf8"));
    assert.match(spec.id, /^spice-example-[\w-]+$/);
    assert.ok(spec.shots.length >= 3, `${folder}: a scenario of a few shots`);
    let bytes = 0;
    for (const s of spec.shots) {
      for (const f of [s.plate.file, s.plate.still, ...s.passes.flatMap((p: any) => [p.media.file, p.input?.file, ...Object.values(p.extra ?? {}).map((x: any) => x.file)])].filter(Boolean)) {
        const size = (await stat(join(dir, folder, f))).size;
        assert.ok(size > 1000, `${folder}/${f} is there`);
        bytes += size;
      }
      assert.ok(s.passes.length >= 1, `${folder}: ${s.name} has a pass`);
    }
    assert.ok(bytes < 26e6, `${folder} is under 26 MB (${(bytes / 1e6).toFixed(1)} MB)`);
  }
});
