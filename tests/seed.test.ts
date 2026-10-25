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
/**
 * The music videos Jam ships (examples/jam/), and the version of each. Toc Toc and Hotel Lobby, which played the Mixer trends' original
 * recordings, were retired on 25 October: a data folder from before still has them, and the first start takes out an untouched copy.
 */
const SHIPPED = ["jam-la-calabaza", "jam-three-kittens", "jam-walk-moonlit-oolong"];
const VERSIONS = { "jam-la-calabaza": 2, "jam-three-kittens": 2, "jam-walk-moonlit-oolong": 2 };
const freePort = () => new Promise<number>((done) => {
  const s = createServer().listen(0, () => {
    const { port } = s.address() as { port: number };
    s.close(() => done(port));
  });
});

/** The server, started on a data folder of its own and stopped when the job is done: its start is what seeds. `send` is a request with a body, `status` the status of one. */
async function started(data: string, job: (get: (path: string) => Promise<any>, send: (path: string, method: string, body: unknown) => Promise<any>, status: (path: string) => Promise<number>) => Promise<void>) {
  const port = await freePort();
  const server = spawn(process.execPath, ["server/main.ts"], { cwd: root, env: { ...process.env, PORT: String(port), COMFYTURE_DATA: data, COMFY_API_KEY: "", COMFY_BASE_URL: "http://127.0.0.1:9" }, stdio: "ignore" });
  try {
    for (let i = 0; i < 150; i++) {
      if (await fetch(`http://127.0.0.1:${port}/api/jams`).then((r) => r.ok, () => false)) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    await job(
      (path) => fetch(`http://127.0.0.1:${port}/${path}`).then((r) => r.json()),
      (path, method, body) => fetch(`http://127.0.0.1:${port}/${path}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json()),
      (path) => fetch(`http://127.0.0.1:${port}/${path}`).then((r) => r.status),
    );
  } finally {
    server.kill();
    await new Promise((r) => setTimeout(r, 300));
  }
}

test("a newer version of a showcase replaces an older copy nobody has touched, keeps one that was edited, and takes out one no longer shipped", { timeout: 120000 }, async (t) => {
  const data = await mkdtemp(join(tmpdir(), "seed-"));
  t.after(() => rm(data, { recursive: true, force: true }));
  // the first start puts them in: our three videos at their version, and Kitchen's example film with its takes and its edit
  await started(data, async (get, _send, status) => {
    const film = (await get("api/stories")).stories.find((x: any) => x.name === "The Great Jam Chase");
    assert.ok(film?.thumb?.startsWith("/media/photos/"), "Kitchen's example film is there, with its picture");
    assert.ok((await get("api/runs")).filter((r: any) => r.status === "done" && r.video).length >= 3, "its three takes are in the take log at once");
    assert.ok((await get("api/cuts")).cuts.some((c: any) => c.project === film.id), "and its edit, the story's own");
    const jams = (await get("api/jams")).jams;
    assert.deepEqual(jams.map((j: any) => j.id).sort(), SHIPPED, "our three music videos ship, and no other: Toc Toc, Hotel Lobby, Ramalama and the old test video are not among them");
    // they go in a moment apart, in the order of their folders: the last one is the newest, the one Jam opens first
    assert.equal(jams[0].id, "jam-walk-moonlit-oolong", "Moonlit Oolong Walk is the newest");
    const moonlit = (await get("api/jams/jam-walk-moonlit-oolong")).project;
    assert.ok(moonlit.body.film?.url && moonlit.body.part?.file && moonlit.body.stems?.vocals && moonlit.body.lines.length === 6, "it comes whole: its part, its stems, its words and its film");
    assert.equal((await get("api/cuts/cut-jam-walk-moonlit-oolong")).project.body.tracks.find((t: any) => t.main).items.length, 7, "and its edit, its seven shots");
    // its song wears Taro's picture as its cover (a picture of the example's folder, put into photos), the one The song page shows
    const song = (await get("api/audio")).find((a: any) => a.file === moonlit.body.track.file);
    assert.equal(song?.cover, "/media/photos/jam-walk-moonlit-oolong-artist.jpg", "the song has its cover");
    assert.equal(moonlit.body.track.cover, song.cover, "and the video's track says the same");
    assert.equal(await status(song.cover.slice(1)), 200, "the cover is served");
    // each finished film is a reel (a film of the Library, with its details beside it), as the app's own Export keeps one
    const reels = await get("api/reels");
    assert.deepEqual(reels.map((r: any) => r.id).sort(), ["jam-la-calabaza-film", "jam-three-kittens-film", "jam-walk-moonlit-oolong-film"], "the three films are films of the Library");
    for (const r of reels) {
      assert.ok(r.url === `/media/reels/${r.id}.mp4` && r.seconds > 5 && r.cut === `cut-${r.id.replace(/-film$/, "")}` && r.name, `${r.id} has its details`);
      assert.equal((await get(`api/jams/${r.id.replace(/-film$/, "")}`)).project.body.film.id, r.id, `${r.id} is the film its video names`);
    }
  });
  // the ledger says what went in, at which version (server/examples.ts)
  const versions = async () => Object.fromEntries(ledgerState(readLedger(await readFile(join(data, "jams", ".seeded"), "utf8"))));
  assert.deepEqual(await versions(), VERSIONS);
  // a data folder from before: ours were put in at an older version, one untouched, one at its version already and one edited since; and
  // three videos the app no longer ships are still there, each with its edit: the showcase made for an earlier test and Hotel Lobby
  // (untouched), and Toc Toc, which someone worked on (the last two played the Mixer trends' recordings and were retired on 25 October)
  await writeFile(join(data, "jams", ".seeded"), ["jam-hotel-lobby@3", "jam-toc-toc@2", "jam-walk-moonlit-oolong", "jam-test-showcase", "jam-la-calabaza@2", "jam-three-kittens"].sort().join("\n"));
  const at = "2026-10-20T08:57:00.000Z";
  for (const [id, name] of [["jam-test-showcase", "Sun in the jar (test)"], ["jam-hotel-lobby", "Hotel Lobby"], ["jam-toc-toc", "Toc Toc"]]) {
    await writeFile(join(data, "jams", `${id}.json`), JSON.stringify({ id, name, createdAt: at, updatedAt: at, body: {} }));
    await writeFile(join(data, "cuts", `cut-${id}.json`), JSON.stringify({ id: `cut-${id}`, name, createdAt: at, updatedAt: at, body: {} }));
  }
  const edit = async (kind: string, id: string, change: (p: any) => void) => {
    const path = join(data, kind, `${id}.json`);
    const p = JSON.parse(await readFile(path, "utf8"));
    change(p);
    await writeFile(path, JSON.stringify(p));
  };
  await edit("jams", "jam-toc-toc", (p) => ((p.name = "My Toc Toc"), (p.updatedAt = "2030-01-01T00:00:00.000Z")));
  await edit("jams", "jam-three-kittens", (p) => ((p.name = "My Kittens"), (p.updatedAt = "2030-01-01T00:00:00.000Z")));
  await edit("jams", "jam-walk-moonlit-oolong", (p) => (p.name = "Old Moonlit"));
  await edit("jams", "jam-la-calabaza", (p) => (p.name = "Calabaza as it was"));
  // (and the person has given the Moonlit song a cover of their own since)
  const index = join(data, "audio", "index.json");
  const songs = JSON.parse(await readFile(index, "utf8"));
  songs["jam-walk-moonlit-oolong-track.mp3"].cover = "/media/photos/my-cover.png";
  await writeFile(index, JSON.stringify(songs));
  await started(data, async (get) => {
    const names = Object.fromEntries((await get("api/jams")).jams.map((j: any) => [j.id, j.name]));
    assert.equal(names["jam-walk-moonlit-oolong"], "Moonlit Oolong Walk", "an untouched older copy is replaced");
    assert.equal(names["jam-three-kittens"], "My Kittens", "one that was edited is left as it is");
    assert.equal(names["jam-la-calabaza"], "Calabaza as it was", "one at its version is not put in again");
    assert.equal(names["jam-test-showcase"], undefined, "one the app no longer ships goes, untouched as it was");
    assert.equal(names["jam-hotel-lobby"], undefined, "so does Hotel Lobby, retired for playing a commercial recording: an untouched copy goes");
    assert.equal(names["jam-toc-toc"], "My Toc Toc", "and a Toc Toc that someone worked on stays");
    assert.equal((await get("api/audio")).find((a: any) => a.file === "jam-walk-moonlit-oolong-track.mp3").cover, "/media/photos/my-cover.png", "a song the person gave another cover keeps it when its example is put in again");
  });
  const gone = (kind: string, id: string) => access(join(data, kind, `${id}.json`)).then(() => false, () => true);
  assert.ok((await gone("jams", "jam-test-showcase")) && (await gone("cuts", "cut-jam-test-showcase")), "with its edit");
  assert.ok((await gone("jams", "jam-hotel-lobby")) && (await gone("cuts", "cut-jam-hotel-lobby")), "Hotel Lobby goes with its edit");
  assert.ok(!(await gone("jams", "jam-toc-toc")) && !(await gone("cuts", "cut-jam-toc-toc")), "and the Toc Toc someone worked on keeps its edit too");
  assert.deepEqual(await versions(), { ...VERSIONS, "jam-test-showcase": "retired", "jam-hotel-lobby": "retired", "jam-toc-toc": "retired" }, "an older ledger (one id a line) is read, and the versions now in, and the videos retired, are noted");
});

test("a video saved with only what Jam measures when it opens one is not changed: a newer version still replaces it, and a real change still keeps it", { timeout: 120000 }, async (t) => {
  const data = await mkdtemp(join(tmpdir(), "seed-"));
  t.after(() => rm(data, { recursive: true, force: true }));
  // Jam measures a song's drop and loudest stretch when it opens a video that has none, and saves them: the body as the page holds it (what
  // the page leaves out filled in with nothing) with the two measures in. That is not anyone's work, so it keeps the time of the last change.
  const measured = (project: any) => ({ ...project.body, spare: [], nothing: null, track: { ...project.body.track, drop: 3.5, loud: 6.25 } });
  await started(data, async (get, send) => {
    const calabaza = (await get("api/jams/jam-la-calabaza")).project;
    await send("api/jams/jam-la-calabaza", "PUT", { name: calabaza.name, body: measured(calabaza), thumb: calabaza.body.artist.url });
    const after = (await get("api/jams/jam-la-calabaza")).project;
    assert.equal(after.body.track.drop, 3.5, "what Jam measured is kept");
    assert.equal(after.updatedAt, after.createdAt, "a video saved with only that is not changed");
    // the same save with something a person did in it (the captions), or a new name, is a change
    const kittens = (await get("api/jams/jam-three-kittens")).project;
    await send("api/jams/jam-three-kittens", "PUT", { name: kittens.name, body: { ...measured(kittens), captions: "pop" } });
    const renamed = (await get("api/jams/jam-walk-moonlit-oolong")).project;
    await send("api/jams/jam-walk-moonlit-oolong", "PUT", { name: "My walk", body: measured(renamed) });
    for (const id of ["jam-three-kittens", "jam-walk-moonlit-oolong"]) {
      const p = (await get(`api/jams/${id}`)).project;
      assert.notEqual(p.updatedAt, p.createdAt, `${id} was changed`);
    }
  });
  // a newer version of each, at the next start: the one that was only measured is replaced, the two that were worked on are left alone
  await writeFile(join(data, "jams", ".seeded"), ["jam-la-calabaza", "jam-three-kittens", "jam-walk-moonlit-oolong"].join("\n"));
  await started(data, async (get) => {
    const calabaza = (await get("api/jams/jam-la-calabaza")).project;
    assert.equal(calabaza.body.track.drop, null, "the video that was only opened is the shipped one again");
    assert.equal((await get("api/jams/jam-three-kittens")).project.body.captions, "pop", "one whose captions were changed is left as it is");
    assert.equal((await get("api/jams/jam-walk-moonlit-oolong")).project.name, "My walk", "and one that was renamed");
  });
});
