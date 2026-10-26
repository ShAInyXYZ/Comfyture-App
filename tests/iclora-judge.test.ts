// The IC-LoRA suite on a judges' copy, with no key and no Comfy Cloud: a run is counted as a render and refused past the caps (its job fails with
// the words of the cap, before anything is sent), and the open-weights switch does not refuse it: the IC-LoRAs are open weights, so only a
// partner's model is kept out by COMFYTURE_OPEN_WEIGHTS.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");

async function lab(env: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), "ic-judge-"));
  mkdirSync(join(dir, "none"));
  const port: number = await new Promise((done) => {
    const s = createServer().listen(0, () => {
      const { port } = s.address() as { port: number };
      s.close(() => done(port));
    });
  });
  const server = spawn(process.execPath, ["server/main.ts"], { cwd: root, env: { ...process.env, PORT: String(port), COMFYTURE_DATA: dir, COMFYTURE_EXAMPLES: join(dir, "none"), COMFY_API_KEY: "test-key-not-real", ...env }, stdio: "ignore" });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    if (await fetch(`${base}/api/spice/tools`).then((r) => r.ok, () => false)) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  return { base, dir, stop: () => (server.kill(), rmSync(dir, { recursive: true, force: true })) };
}

/** Starts a run of a tool on a clip of this machine's and answers how its job ended. */
async function runOnce(base: string, dir: string, tool = "deblur") {
  const clip = join(dir, "clip.mp4");
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=320x576:r=24:d=2.1", "-pix_fmt", "yuv420p", clip]);
  const up = await (await fetch(`${base}/api/videos`, { method: "POST", headers: { "Content-Type": "video/mp4" }, body: readFileSync(clip) })).json();
  // (the events are listened to before the run starts: a refused one ends at once)
  const sse = await fetch(`${base}/api/events`);
  const reader = sse.body!.getReader();
  const res = await fetch(`${base}/api/spice/run`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ video: up.file, tool, seconds: 2, size: "draft" }) });
  const job = await res.json();
  if (!res.ok) return (await reader.cancel().catch(() => {}), { refused: job.error as string });
  const dec = new TextDecoder();
  let buf = "";
  const until = Date.now() + 30_000;
  while (Date.now() < until) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value);
    for (const chunk of buf.split("\n\n")) {
      const data = chunk.split("\n").find((l) => l.startsWith("data:"))?.slice(5);
      try {
        const j = data && JSON.parse(data);
        if (j && j.id === job.id && ["done", "failed", "canceled"].includes(j.status)) return (await reader.cancel().catch(() => {}), { status: j.status as string, error: String(j.error ?? "") });
      } catch {}
    }
  }
  await reader.cancel().catch(() => {});
  return { status: "timeout", error: "" };
}

test("a judges' copy counts an IC-LoRA run as a render and refuses it past the cap, before anything is sent", async () => {
  const l = await lab({ COMFYTURE_JUDGE: "1", COMFYTURE_JUDGE_RUNS: "0", COMFYTURE_JUDGE_RUNS_DAY: "0" });
  try {
    const out = await runOnce(l.base, l.dir);
    assert.equal(out.status, "failed");
    assert.match(out.error ?? "", /renders/, "the cap's words");
    assert.doesNotMatch(out.error ?? "", /Open weights/);
  } finally {
    l.stop();
  }
});

test("a tool that needs more than a clip is not run, with what it needs said", async () => {
  const l = await lab({});
  try {
    const out = await runOnce(l.base, l.dir, "ingredients");
    assert.match(out.refused ?? "", /needs a reference sheet/);
    const none = await runOnce(l.base, l.dir, "no-such-tool");
    assert.match(none.refused ?? "", /not in the suite/);
  } finally {
    l.stop();
  }
});

test("open weights only does not refuse an IC-LoRA run: it goes as far as the cloud (here, a key that is not real) and fails there, not on a partner's gate", async () => {
  const l = await lab({ COMFYTURE_OPEN_WEIGHTS: "1" });
  try {
    const out = await runOnce(l.base, l.dir);
    assert.notEqual(out.status, "done");
    assert.doesNotMatch(out.error ?? "", /Open weights only|partner/i);
  } finally {
    l.stop();
  }
});
