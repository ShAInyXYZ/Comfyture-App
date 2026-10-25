// The Stage's examples (examples/stage/) go in by the same rules as every product's (server/examples.ts): on a fresh install each is
// put in once under an id of its own, the first newest; one added to the app later reaches an install that had the others; and an
// install from before the ledger, which holds them under ids of their own, does not get them twice.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readLedger } from "../server/examples.ts";

const root = resolve(import.meta.dirname, "..");
const freePort = () => new Promise<number>((done) => {
  const s = createServer().listen(0, () => {
    const { port } = s.address() as { port: number };
    s.close(() => done(port));
  });
});

/** The server on a data folder of its own, with no key and nothing behind it: the Stage's list is what seeds its examples. */
async function started(data: string, job: (get: (path: string) => Promise<any>) => Promise<void>) {
  const port = await freePort();
  const server = spawn(process.execPath, ["server/main.ts"], { cwd: root, env: { ...process.env, PORT: String(port), COMFYTURE_DATA: data, COMFY_API_KEY: "", COMFY_BASE_URL: "http://127.0.0.1:9" }, stdio: "ignore" });
  try {
    for (let i = 0; i < 150; i++) {
      if (await fetch(`http://127.0.0.1:${port}/api/info`).then((r) => r.ok, () => false)) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    await job((path) => fetch(`http://127.0.0.1:${port}/${path}`).then((r) => r.json()));
  } finally {
    server.kill();
    await new Promise((r) => setTimeout(r, 300));
  }
}
const stagesOf = async (get: (path: string) => Promise<any>) => {
  const d = await get("api/control/stages");
  return (Array.isArray(d) ? d : d.stages) as { id: string; name: string; updatedAt: string }[];
};

test("the Stage's examples go in once each, under their own ids, the first file the newest; one added later still arrives", { timeout: 120000 }, async () => {
  const shipped = (await readdir(join(root, "examples", "stage"))).filter((f) => f.endsWith(".stage.json")).sort();
  const ids = shipped.map((f) => `stage-example-${f.replace(/^\d+-/, "").replace(/\.stage\.json$/, "")}`);
  const data = await mkdtemp(join(tmpdir(), "stage-examples-"));
  try {
    await started(data, async (get) => {
      const stages = await stagesOf(get);
      assert.deepEqual(stages.map((s) => s.id).sort(), [...ids].sort(), "every example, under its own id");
      assert.equal(stages[0].id, ids[0], "the first file is the newest, so it is the one the Stage opens");
      // Kitchen's example film stays the newest project on a first visit
      const { projects } = await get("api/projects");
      assert.equal(projects[0].kind, "story", JSON.stringify(projects.slice(0, 2).map((p: any) => p.name)));
    });
    const ledger = join(data, "control", "stages", ".seeded");
    assert.deepEqual(readLedger(await readFile(ledger, "utf8")).sort(), [...ids].sort());
    // started again: nothing twice
    await started(data, async (get) => assert.equal((await stagesOf(get)).length, ids.length));
    // an example the install never had (as when a newer app adds one) is put in
    const last = ids.at(-1)!;
    await writeFile(ledger, JSON.stringify(readLedger(await readFile(ledger, "utf8")).filter((x) => x !== last)));
    await rm(join(data, "control", "stages", `${last}.json`));
    await started(data, async (get) => assert.ok((await stagesOf(get)).some((s) => s.id === last), "the new example arrives"));
  } finally {
    await rm(data, { recursive: true, force: true });
  }
});

test("an install from before the ledger keeps the examples it has under their old ids, and gets none of them twice", { timeout: 120000 }, async () => {
  const data = await mkdtemp(join(tmpdir(), "stage-legacy-"));
  try {
    const dir = join(data, "control", "stages");
    await mkdir(dir, { recursive: true });
    const shipped = (await readdir(join(root, "examples", "stage"))).filter((f) => f.endsWith(".stage.json")).sort();
    const at = new Date(Date.now() - 86_400_000).toISOString();
    for (const [i, f] of shipped.entries()) {
      const { name } = JSON.parse(await readFile(join(root, "examples", "stage", f), "utf8"));
      const id = `stage-old-${i}-abc123`;
      await writeFile(join(dir, `${id}.json`), JSON.stringify({ id, name, createdAt: at, updatedAt: at, scene: { characters: [], props: [] } }));
    }
    await started(data, async (get) => {
      const stages = await stagesOf(get);
      assert.equal(stages.length, shipped.length, JSON.stringify(stages.map((s) => s.id)));
      assert.ok(stages.every((s) => s.id.startsWith("stage-old-")), "the ones it had, as they were");
    });
    assert.equal(readLedger(await readFile(join(dir, ".seeded"), "utf8")).length, shipped.length, "each noted as put in");
  } finally {
    await rm(data, { recursive: true, force: true });
  }
});
