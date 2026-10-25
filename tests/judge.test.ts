// A judges' copy (COMFYTURE_JUDGE, server/judge.ts) keeps its key, where it renders and everything in it, and paces each visitor.
import { test } from "node:test";
import assert from "node:assert/strict";
import { judging, refused, createPace, visitorOf } from "../server/judge.ts";

const on = { COMFYTURE_JUDGE: "1" } as NodeJS.ProcessEnv;
const off = {} as NodeJS.ProcessEnv;

test("off, nothing is refused", () => {
  assert.equal(judging(off), false);
  assert.equal(refused("DELETE", "/api/stories/stori-x", off), null);
  assert.equal(refused("POST", "/api/account/key", off), null);
});

test("on, the key and where it renders cannot be changed, nor any address probed", () => {
  assert.equal(judging(on), true);
  for (const [m, p] of [["POST", "/api/account/key"], ["DELETE", "/api/account/key"], ["POST", "/api/account/target"], ["DELETE", "/api/account/target"], ["POST", "/api/account/target/test"]]) {
    assert.match(refused(m, p, on) ?? "", /set by its host/, `${m} ${p}`);
  }
  assert.equal(refused("GET", "/api/account", on), null, "reading the account stays open");
});

test("on, nothing kept can be deleted; making, editing and cancelling stay open", () => {
  for (const p of ["/api/stories/stori-the-great-jam-chase-39a425", "/api/cuts/cut-x", "/api/jams/jam-x", "/api/spice-shots/spice-example-x", "/api/toasts/toast-example-x", "/api/brands/brand-comfyture", "/api/runs/20261019-32648f63", "/api/reels/r1", "/api/control/stages/stage-x", "/api/control/poses/mine-x", "/api/control/models/obj-x"]) {
    assert.match(refused("DELETE", p, on) ?? "", /nothing can be deleted/, p);
  }
  assert.equal(refused("PUT", "/api/stories/stori-x", on), null, "a project is still saved");
  assert.equal(refused("POST", "/api/runs", on), null, "a take is still rolled");
  assert.equal(refused("DELETE", "/api/macaron/frames", on), null, "a render's own frames are cleaned up");
  assert.equal(refused("DELETE", "/api/utensils/templates/jobs/j1", on), null, "a run is still cancelled");
});

test("a visitor's pace: past the limit in the window, the next waits; another visitor is not held", () => {
  let t = 0;
  const pace = createPace({ limit: 3, windowMs: 1000, now: () => t });
  assert.deepEqual([pace.take("a"), pace.take("a"), pace.take("a"), pace.take("a")], [true, true, true, false]);
  assert.equal(pace.take("b"), true);
  t = 1001;
  assert.equal(pace.take("a"), true, "a new window");
});

test("the visitor is the address, or the first one a local proxy names", () => {
  assert.equal(visitorOf("203.0.113.9", undefined), "203.0.113.9");
  assert.equal(visitorOf("127.0.0.1", "198.51.100.7, 10.0.0.2"), "198.51.100.7");
  assert.equal(visitorOf("203.0.113.9", "198.51.100.7"), "203.0.113.9", "a header from afar is not believed");
});

test("the spend gate: a visitor's renders and words a day, every visitor's renders a day, kept across a restart", async (t) => {
  const { mkdtemp, rm, readFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { spend, asVisitor, keepLedger, leftFor } = await import("../server/judge.ts");
  const data = await mkdtemp(join(tmpdir(), "judge-"));
  t.after(() => rm(data, { recursive: true, force: true }));
  const env = { COMFYTURE_JUDGE: "1", COMFYTURE_JUDGE_RUNS: "2", COMFYTURE_JUDGE_RUNS_DAY: "3", COMFYTURE_JUDGE_WORDS: "1" } as NodeJS.ProcessEnv;
  const at = Date.parse("2026-10-28T10:00:00Z");
  keepLedger(data);
  assert.doesNotThrow(() => spend("render", {} as NodeJS.ProcessEnv, at), "not a judges' copy: free");
  asVisitor("ann", () => (spend("render", env, at), spend("render", env, at)));
  assert.throws(() => asVisitor("ann", () => spend("render", env, at)), (e: any) => e.status === 429 && /2 renders for this visitor/.test(e.message));
  asVisitor("bob", () => spend("render", env, at));
  assert.throws(() => asVisitor("cid", () => spend("render", env, at)), /today's 3 renders/, "every visitor's renders a day");
  asVisitor("bob", () => spend("words", env, at));
  assert.throws(() => asVisitor("bob", () => spend("words", env, at)), /1 answers/);
  assert.deepEqual(leftFor("ann", env, at), { renders: 0, words: 1 });
  // (an answer started in a job keeps its visitor across awaits)
  await assert.rejects(asVisitor("ann", async () => (await new Promise((r) => setTimeout(r, 5)), spend("render", env, at))), /for this visitor/);
  assert.equal(JSON.parse(await readFile(join(data, "judge.json"), "utf8")).all.render, 3, "kept on disk");
  keepLedger(data);
  assert.deepEqual(leftFor("bob", env, at), { renders: 0, words: 0 }, "a restart gives nothing back");
  assert.deepEqual(leftFor("bob", env, at + 86_400_000), { renders: 2, words: 1 }, "a new day starts again");
});
