// The showcase projects Jam ships are put into a data folder at start: once, a newer version replaces an older copy
// nobody has touched, and one that was edited (or that the user made) is left alone.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readLedger, ledgerState } from "../server/examples.ts";

const root = resolve(import.meta.dirname, "..");
const freePort = () => new Promise<number>((done) => {
  const s = createServer().listen(0, () => {
    const { port } = s.address() as { port: number };
    s.close(() => done(port));
  });
});

/** The server, started on a data folder of its own and stopped when the job is done: its start is what seeds. */
async function started(data: string, job: (get: (path: string) => Promise<any>) => Promise<void>) {
  const port = await freePort();
  const server = spawn(process.execPath, ["server/main.ts"], { cwd: root, env: { ...process.env, PORT: String(port), COMFYTURE_DATA: data, COMFY_API_KEY: "", COMFY_BASE_URL: "http://127.0.0.1:9" }, stdio: "ignore" });
  try {
    for (let i = 0; i < 150; i++) {
      if (await fetch(`http://127.0.0.1:${port}/api/jams`).then((r) => r.ok, () => false)) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    await job((path) => fetch(`http://127.0.0.1:${port}/${path}`).then((r) => r.json()));
  } finally {
    server.kill();
    await new Promise((r) => setTimeout(r, 300));
  }
}

test("a newer version of a showcase replaces an older copy nobody has touched, and keeps one that was edited", { timeout: 120000 }, async (t) => {
  const data = await mkdtemp(join(tmpdir(), "seed-"));
  t.after(() => rm(data, { recursive: true, force: true }));
  // the first start puts them in: the trend ones at their version
  await started(data, async (get) => {
    const ids = (await get("api/jams")).jams.map((j: any) => j.id).sort();
    assert.deepEqual(ids, ["jam-hotel-lobby", "jam-test-showcase", "jam-toc-toc"], "Hotel Lobby and Toc Toc ship; Ramalama is not one of them");
  });
  // the ledger says what went in, at which version (server/examples.ts)
  const versions = async () => Object.fromEntries(ledgerState(readLedger(await readFile(join(data, "jams", ".seeded"), "utf8"))));
  assert.deepEqual(await versions(), { "jam-hotel-lobby": 3, "jam-test-showcase": 1, "jam-toc-toc": 2 });
  // they were put in at an older version (as a data folder from before is): one is untouched, one was edited since
  await writeFile(join(data, "jams", ".seeded"), ["jam-hotel-lobby", "jam-test-showcase", "jam-toc-toc"].join("\n"));
  const edit = async (kind: string, id: string, change: (p: any) => void) => {
    const path = join(data, kind, `${id}.json`);
    const p = JSON.parse(await readFile(path, "utf8"));
    change(p);
    await writeFile(path, JSON.stringify(p));
  };
  await edit("jams", "jam-hotel-lobby", (p) => (p.name = "Old Hotel"));
  await edit("jams", "jam-toc-toc", (p) => ((p.name = "My Toc Toc"), (p.updatedAt = "2030-01-01T00:00:00.000Z")));
  await started(data, async (get) => {
    const names = Object.fromEntries((await get("api/jams")).jams.map((j: any) => [j.id, j.name]));
    assert.equal(names["jam-hotel-lobby"], "Hotel Lobby", "an untouched older copy is replaced");
    assert.equal(names["jam-toc-toc"], "My Toc Toc", "one that was edited is left as it is");
    assert.equal(names["jam-test-showcase"], "Sun in the jar (test)", "one at its version is not touched");
  });
  assert.deepEqual(await versions(), { "jam-hotel-lobby": 3, "jam-test-showcase": 1, "jam-toc-toc": 2 }, "an older ledger (one id a line) is read, and the versions now in are noted");
});
