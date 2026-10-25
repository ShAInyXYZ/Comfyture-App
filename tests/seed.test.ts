// The showcase projects Jam ships are put into a data folder at start: once, a newer version replaces an older copy
// nobody has touched, one that was edited (or that the user made) is left alone, and one the app no longer ships goes.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, readFile, writeFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readLedger, ledgerState } from "../server/examples.ts";

const root = resolve(import.meta.dirname, "..");
/** The music videos Jam ships (examples/jam/), and the version of each. */
const SHIPPED = ["jam-hotel-lobby", "jam-la-calabaza", "jam-three-kittens", "jam-toc-toc", "jam-walk-moonlit-oolong"];
const VERSIONS = { "jam-hotel-lobby": 3, "jam-la-calabaza": 1, "jam-three-kittens": 1, "jam-toc-toc": 2, "jam-walk-moonlit-oolong": 1 };
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

test("a newer version of a showcase replaces an older copy nobody has touched, keeps one that was edited, and takes out one no longer shipped", { timeout: 120000 }, async (t) => {
  const data = await mkdtemp(join(tmpdir(), "seed-"));
  t.after(() => rm(data, { recursive: true, force: true }));
  // the first start puts them in: the trend ones at their version, and Kitchen's example film with its takes and its edit
  await started(data, async (get) => {
    const film = (await get("api/stories")).stories.find((x: any) => x.name === "The Great Jam Chase");
    assert.ok(film?.thumb?.startsWith("/media/photos/"), "Kitchen's example film is there, with its picture");
    assert.ok((await get("api/runs")).filter((r: any) => r.status === "done" && r.video).length >= 3, "its three takes are in the take log at once");
    assert.ok((await get("api/cuts")).cuts.some((c: any) => c.project === film.id), "and its edit, the story's own");
    const jams = (await get("api/jams")).jams;
    assert.deepEqual(jams.map((j: any) => j.id).sort(), SHIPPED, "our three music videos ship beside Hotel Lobby and Toc Toc; Ramalama and the old test video are not among them");
    // they go in a moment apart, in the order of their folders: the last one is the newest, the one Jam opens first
    assert.equal(jams[0].id, "jam-walk-moonlit-oolong", "Moonlit Oolong Walk is the newest");
    const moonlit = (await get("api/jams/jam-walk-moonlit-oolong")).project;
    assert.ok(moonlit.body.film?.url && moonlit.body.part?.file && moonlit.body.stems?.vocals && moonlit.body.lines.length === 6, "it comes whole: its part, its stems, its words and its film");
    assert.equal((await get("api/cuts/cut-jam-walk-moonlit-oolong")).project.body.tracks.find((t: any) => t.main).items.length, 7, "and its edit, its seven shots");
  });
  // the ledger says what went in, at which version (server/examples.ts)
  const versions = async () => Object.fromEntries(ledgerState(readLedger(await readFile(join(data, "jams", ".seeded"), "utf8"))));
  assert.deepEqual(await versions(), VERSIONS);
  // they were put in at an older version (as a data folder from before is): one is untouched, one was edited since; and the
  // showcase made for an earlier test, which the app no longer ships, is still there untouched (with its edit)
  await writeFile(join(data, "jams", ".seeded"), [...SHIPPED, "jam-test-showcase"].sort().join("\n"));
  const at = "2026-10-20T08:57:00.000Z";
  await writeFile(join(data, "jams", "jam-test-showcase.json"), JSON.stringify({ id: "jam-test-showcase", name: "Sun in the jar (test)", createdAt: at, updatedAt: at, body: {} }));
  await writeFile(join(data, "cuts", "cut-jam-test-showcase.json"), JSON.stringify({ id: "cut-jam-test-showcase", name: "Sun in the jar (test)", createdAt: at, updatedAt: at, body: {} }));
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
    assert.equal(names["jam-walk-moonlit-oolong"], "Moonlit Oolong Walk", "one at its version is not touched");
    assert.equal(names["jam-test-showcase"], undefined, "one the app no longer ships goes, untouched as it was");
  });
  const gone = (kind: string, id: string) => access(join(data, kind, `${id}.json`)).then(() => false, () => true);
  assert.ok((await gone("jams", "jam-test-showcase")) && (await gone("cuts", "cut-jam-test-showcase")), "with its edit");
  assert.deepEqual(await versions(), { ...VERSIONS, "jam-test-showcase": "retired" }, "an older ledger (one id a line) is read, and the versions now in are noted");
});
