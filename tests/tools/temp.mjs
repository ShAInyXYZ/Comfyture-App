// A test's own folder in the system's temp, removed when the test's process ends, pass or fail: the browser tests used to leave theirs
// (401 folders, 12 GB of /tmp by 25 October). KEEP_TEST_DATA=1 keeps them, to look into after a failure.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const made = [];
process.on("exit", () => {
  if (process.env.KEEP_TEST_DATA) return;
  for (const dir of made) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {}
  }
});

/** A new empty folder in the system's temp, named `<prefix>XXXXXX`, gone when the process exits. */
export function tempDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  made.push(dir);
  return dir;
}
