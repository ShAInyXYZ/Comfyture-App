// The bay's example shot: its clip and the takes it ships go into the library, and the shot is written as the bay keeps one.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { putBayExample } from "../server/bay-example.ts";
import { passOf, ledger, stepDone, normaliseBody } from "../web/js/spice2-model.js";

const root = join(import.meta.dirname, "..");

test("an example is put in: the clip and each take in the library, the stages with their marks, the plan, the thumbnail, every take told as an example's", async () => {
  const data = mkdtempSync(join(tmpdir(), "bay-ex-data-"));
  const folder = mkdtempSync(join(tmpdir(), "bay-ex-src-"));
  for (const f of ["plate.mp4", "plate.jpg", "conform.mp4", "clean.mp4", "clean.jpg", "../escape.mp4"]) writeFileSync(join(folder, f.replace("../", "")), "x");
  let n = 0;
  const stamp = () => new Date(Date.UTC(2026, 9, 26, 10, 0, n++)).toISOString();
  let written: any = null;
  const spec = {
    id: "bay-example-yard", name: "The yard at dusk", brief: "Taro walks with a lantern; the van must go.",
    clip: { file: "plate.mp4", still: "plate.jpg", name: "yard.mp4", width: 1280, height: 720, seconds: 8, fps: 24 },
    plan: [{ stage: "conform" }, { stage: "clean", engine: "utility_void_video_inpainting", text: "the van", why: "shadow too" }],
    stages: {
      conform: { takes: [{ file: "conform.mp4", title: "Conform", engine: "local:conform", mode: "local", source: "local", mark: true, width: 1280, height: 720, seconds: 8 }] },
      clean: { takes: [{ file: "clean.mp4", still: "clean.jpg", title: "VOID", engine: "utility_void_video_inpainting", prompt: "the van", note: "Drawn to stand in.", mark: true, width: 1280, height: 720, seconds: 8 }, { file: "../escape.mp4", title: "bad" }, { file: "missing name" }] },
    },
  };
  await putBayExample(spec, folder, "bay-example-yard", 1, { data, stamp, write: async (p) => void (written = p) });
  try {
    const b = normaliseBody(written.body);
    assert.equal(written.id, "bay-example-yard");
    assert.equal(written.name, "The yard at dusk");
    assert.ok(written.thumb?.startsWith("/media/photos/bay-example-yard-clip-still"), "the shot's card is the clip's still");
    assert.equal(b.clip.media.url, "/media/videos/bay-example-yard-clip.mp4");
    assert.equal(b.clip.fps, 24);
    assert.ok(existsSync(join(data, "videos", "bay-example-yard-clip.mp4")) && existsSync(join(data, "photos", "bay-example-yard-clip-still.jpg")));
    assert.equal(b.stages.conform.takes[0].source, "local");
    const clean = b.stages.clean.takes;
    assert.equal(clean.length, 1, "a name with a path in it, or that is no file name, is not put in");
    assert.equal(clean[0].source, "example", "a result the example stands in for says so");
    assert.equal(clean[0].credits, 0);
    assert.equal(passOf(b, "clean").id, clean[0].id);
    assert.ok(b.plan.length === 2 && stepDone(b, b.plan[0]) && stepDone(b, b.plan[1]), "the plan's steps are done by the takes shipped");
    const rows = ledger(b).rows;
    assert.deepEqual(rows.map((r: any) => r.stage), ["conform", "clean"], "the ledger reads in the order the takes were made");
    assert.equal(ledger(b).spent, 0);
    assert.ok(!existsSync(join(data, "videos", "bay-example-yard-clean1-r2.mp4")));
    // a newer version keeps the older copy's files and takes its own names
    await putBayExample(spec, folder, "bay-example-yard", 2, { data, stamp, write: async (p) => void (written = p) });
    assert.match(written.body.clip.media.url, /-r2\.mp4$/);
    assert.ok(readdirSync(join(data, "videos")).includes("bay-example-yard-clip.mp4"));
  } finally {
    rmSync(data, { recursive: true, force: true });
    rmSync(folder, { recursive: true, force: true });
  }
});

test("the examples the app ships for the bay: each has its pictures and clips, takes that point at real engines, and nothing that costs", () => {
  const dir = join(root, "examples", "bay");
  if (!existsSync(dir)) return;
  for (const folder of readdirSync(dir)) {
    const spec = JSON.parse(readFileSync(join(dir, folder, "bay.json"), "utf8"));
    assert.match(spec.id, /^bay-example-[\w-]+$/);
    assert.ok(Number.isInteger(spec.rev) && spec.rev >= 1);
    assert.ok(spec.name && spec.brief);
    assert.ok(existsSync(join(dir, folder, spec.clip.file)) && existsSync(join(dir, folder, spec.clip.still)), "the clip and its still");
    for (const [stage, s] of Object.entries<any>(spec.stages)) {
      assert.ok(s.takes.length, `${stage} has a take`);
      for (const t of s.takes) {
        assert.ok(existsSync(join(dir, folder, t.file)), t.file);
        assert.ok(t.engine, `${stage}: a take names the engine it stands for`);
        assert.ok(t.source === "local" || t.source === "example", "a shipped take is local or an example's");
        assert.ok(!t.credits, "nothing costs");
      }
    }
    assert.ok(spec.plan.length >= 3, "the plan has its steps");
  }
});
