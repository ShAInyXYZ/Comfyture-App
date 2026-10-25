// Where the renders go (server/target.ts): Comfy Cloud, or your own ComfyUI through comfy-api-proxy; a local address is asked what it
// is before it is taken, the choice is kept and outranks .env's, and Reset goes back to .env's.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanUrl, probe, createTarget, targetOf, LOCAL_URL } from "../server/target.ts";

/** A fetch that answers as the given addresses do: the bridge (v2 job list), a bare ComfyUI (system stats), nothing. */
const world = (routes: Record<string, { status: number; body?: unknown }>) =>
  (async (url: string) => {
    const hit = Object.entries(routes).find(([prefix]) => String(url).startsWith(prefix));
    if (!hit) throw new Error("connection refused");
    return new Response(JSON.stringify(hit[1].body ?? {}), { status: hit[1].status });
  }) as unknown as typeof fetch;

test("an address is cleaned as the SDK takes it", () => {
  assert.equal(cleanUrl("127.0.0.1:8189/"), "http://127.0.0.1:8189");
  assert.equal(cleanUrl(" https://gpu.example.com/comfy/?x=1#y "), "https://gpu.example.com/comfy");
  assert.equal(cleanUrl("ftp://x"), null);
  assert.equal(cleanUrl("http://user:pass@host"), null, "no credentials in the address");
  assert.equal(cleanUrl(""), null);
  assert.deepEqual(targetOf("https://cloud.comfy.org"), { kind: "comfy-cloud", url: "https://cloud.comfy.org" });
  assert.equal(targetOf(LOCAL_URL).kind, "self-hosted");
});

test("an address says what it is: the bridge, a ComfyUI without it, or nothing", async () => {
  const f = world({
    "http://bridge/api/v2/jobs": { status: 200, body: { jobs: [] } },
    "http://keyed/api/v2/jobs": { status: 401 },
    "http://comfy/api/v2/jobs": { status: 404 },
    "http://comfy/system_stats": { status: 200, body: { devices: [{ name: "cuda:0 NVIDIA GeForce RTX 3090 : cudaMallocAsync" }] } },
  });
  assert.deepEqual((await probe("http://bridge", f)).found, "bridge");
  assert.equal((await probe("http://keyed", f)).ok, true, "a bridge that wants a key still answers as the bridge");
  const bare = await probe("http://comfy", f);
  assert.equal(bare.found, "comfyui");
  assert.equal(bare.ok, false);
  assert.match(bare.detail, /comfy-api-proxy/);
  assert.match(bare.detail, /RTX 3090/);
  assert.equal((await probe("http://nowhere", f)).found, "nothing");
});

test("the choice is checked, kept, outranks .env's, and Reset goes back to it", async (t) => {
  const data = await mkdtemp(join(tmpdir(), "target-"));
  t.after(() => rm(data, { recursive: true, force: true }));
  const env: NodeJS.ProcessEnv = { COMFY_BASE_URL: "http://from-env:8189" };
  const f = world({ "http://bridge:8189/api/v2/jobs": { status: 200 }, "http://comfy:8188/system_stats": { status: 200 } });
  const where = createTarget({ data, env, fetch: f });
  await where.init();
  assert.deepEqual(where.current(), { kind: "self-hosted", url: "http://from-env:8189" }, ".env decides while nothing is saved");
  await assert.rejects(where.set("self-hosted", "http://comfy:8188"), /without the bridge/, "a ComfyUI with no bridge in front is refused, with why");
  assert.equal(env.COMFY_BASE_URL, "http://from-env:8189", "a refused address changes nothing");
  const got = await where.set("self-hosted", "bridge:8189");
  assert.deepEqual(got.target, { kind: "self-hosted", url: "http://bridge:8189" });
  assert.equal(env.COMFY_BASE_URL, "http://bridge:8189", "the SDK reads the bridge's address");
  assert.deepEqual(JSON.parse(await readFile(join(data, "target.json"), "utf8")), { kind: "self-hosted", url: "http://bridge:8189" });
  await where.set("comfy-cloud");
  assert.equal(env.COMFY_BASE_URL, undefined, "Comfy Cloud: no base URL, the SDK's default");
  // a new start takes the saved choice over .env's
  const env2: NodeJS.ProcessEnv = { COMFY_BASE_URL: "http://from-env:8189" };
  const again = createTarget({ data, env: env2, fetch: f });
  await again.init();
  assert.equal(again.current().kind, "comfy-cloud");
  assert.equal(again.saved()?.kind, "comfy-cloud");
  assert.deepEqual(await again.reset(), { kind: "self-hosted", url: "http://from-env:8189" }, "Reset goes back to .env's");
  await assert.rejects(again.set("somewhere"), /Comfy Cloud or your ComfyUI/);
});
