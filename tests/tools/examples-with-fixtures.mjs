// The examples the app ships with the two music videos Jam no longer ships put back beside them (tests/fixtures/jam/: Three Kittens and
// La Calabaza, retired on 26 October for their 13 and 15 s songs): the browser and seeding tests edit, save and reopen several videos.
// Answers a folder for COMFYTURE_EXAMPLES, gone when the test's process ends: every product's examples linked, Jam's copied (the seeder
// reads a product's folder of folders, and a link to a folder is not one).
import { cp, readdir, symlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tempDir } from "./temp.mjs";

const root = resolve(import.meta.dirname, "..", "..");

export async function examplesWithFixtures() {
  const out = tempDir("examples-");
  for (const d of await readdir(join(root, "examples"), { withFileTypes: true })) {
    if (d.isDirectory() && d.name !== "jam") await symlink(join(root, "examples", d.name), join(out, d.name));
  }
  for (const from of [join(root, "examples", "jam"), join(root, "tests", "fixtures", "jam")]) {
    for (const id of await readdir(from)) await cp(join(from, id), join(out, "jam", id), { recursive: true });
  }
  return out;
}
