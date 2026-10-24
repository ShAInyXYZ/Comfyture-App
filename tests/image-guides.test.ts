// The image models' guides: read from a folder, found by model id, and picked up again when a file changes or one is added.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, utimesSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { guideFor, guidesList } from "../server/image-guides.ts";

const guide = (models: string, maker: string, body: string) => `---\nmodels: ${models}\nmaker: ${maker}\nsources:\n  - https://example.com (docs)\n---\n# ${maker}: how to prompt it\n${body}\n`;

test("a guide is found by any model id it names, without its frontmatter", () => {
  const dir = mkdtempSync(join(tmpdir(), "guides-"));
  try {
    writeFileSync(join(dir, "alpha.md"), guide("[alpha-1, alpha-2]", "Alpha Labs", "Write short sentences."));
    writeFileSync(join(dir, "beta.md"), guide("[beta-1]", "Beta", "Name the pictures."));
    writeFileSync(join(dir, "notes.txt"), "not a guide");
    assert.deepEqual(guidesList(dir).map((g) => g.file), ["alpha.md", "beta.md"]);
    const a = guideFor("alpha-2", dir)!;
    assert.equal(a.file, "alpha.md");
    assert.equal(a.maker, "Alpha Labs");
    assert.ok(a.text.startsWith("# Alpha Labs: how to prompt it") && a.text.includes("Write short sentences."));
    assert.ok(!a.text.includes("sources") && !a.text.includes("example.com") && !a.text.includes("models:"));
    assert.equal(guideFor("beta-1", dir)!.maker, "Beta");
    assert.equal(guideFor("gamma", dir), null);
    assert.equal(guideFor("alpha-1", join(dir, "nowhere")), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a guide added or changed while the server runs is picked up", () => {
  const dir = mkdtempSync(join(tmpdir(), "guides-"));
  try {
    const file = join(dir, "alpha.md");
    writeFileSync(file, guide("[alpha-1]", "Alpha", "First."));
    assert.ok(guideFor("alpha-1", dir)!.text.includes("First."));
    writeFileSync(file, guide("[alpha-1, alpha-3]", "Alpha", "Second."));
    utimesSync(file, new Date(), new Date(Date.now() + 5000));
    assert.ok(guideFor("alpha-1", dir)!.text.includes("Second."));
    assert.ok(guideFor("alpha-3", dir));
    writeFileSync(join(dir, "gamma.md"), guide("\n  - gamma-1\n  - gamma-2", "Gamma", "Third."));
    assert.ok(guideFor("gamma-2", dir)!.text.includes("Third."), "a block list of models reads too");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
