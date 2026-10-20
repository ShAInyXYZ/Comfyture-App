// The trends we have made, held against what Make it does with them: every file a recipe names is
// there, every take fits LTX's 8n + 1 grid and its control, every chained take starts inside the take
// before it, and the prompts name the cast only through role slots, so a recast leaves nobody behind.
// Needs ffprobe.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readdir, readFile, access } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { CREW } from "../web/js/mixer-trends.js";

const run = promisify(execFile);
const root = join(import.meta.dirname, "..", "web", "brand", "mixer", "trends");
const frames = async (path: string) =>
  Number((await run("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v", "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", path])).stdout.trim());

const ids = (await readdir(root, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
const recipes = await Promise.all(ids.map(async (id) => ({ id, recipe: JSON.parse(await readFile(join(root, id, "recipe.json"), "utf8")) })));

for (const { id, recipe } of recipes) {
  test(`${id}: the files it names are there`, async () => {
    const files = [recipe.preview, recipe.poster, recipe.look, recipe.sound?.mix, recipe.sound?.vocals, ...recipe.shots.flatMap((s: any) => [s.pose, s.guide, s.look, s.keypoints])];
    for (const f of files.filter(Boolean)) await access(join(root, id, f));
  });

  test(`${id}: each take fits the grid and its control`, async () => {
    for (const s of recipe.shots) {
      assert.equal((s.frames - 1) % 8, 0, `${s.from}: ${s.frames} frames is not 8n + 1`);
      assert.ok(s.frames <= 257, `${s.from}: ${s.frames} frames is longer than a take`);
      const control = s.pose ?? s.guide;
      assert.ok(control, `${s.from}: no control`);
      assert.ok((await frames(join(root, id, control))) >= s.frames, `${s.from}: ${control} is shorter than the take`);
      assert.ok(s.to > s.from && (s.to - s.from) * 24 <= s.frames + 0.5, `${s.from}: the shot is longer than its take`);
    }
  });

  test(`${id}: a chained take starts inside the take before`, () => {
    recipe.shots.forEach((s: any, i: number) => {
      if (!i || !(s.chain ?? recipe.take.chain)) return;
      const join = Math.round((s.from - recipe.shots[i - 1].from) * 24);
      assert.ok(join > 0 && join < recipe.shots[i - 1].frames, `shot ${i + 1} starts on frame ${join} of a ${recipe.shots[i - 1].frames}-frame take`);
    });
    if (!recipe.take.chain) recipe.shots.forEach((s: any, i: number) => assert.ok(s.chain || s.look || (i === 0 && recipe.look), `shot ${i + 1} has no first frame`));
  });

  test(`${id}: the prompts name the cast only through role slots`, () => {
    const roles = (recipe.roles ?? []).map((r: any) => r.role);
    const slots = new Set(["Pair", ...roles, ...roles.map((r: string) => `${r}Name`)]);
    const names = new RegExp(`\\b(${CREW.map((c: any) => c.name).join("|")})\\b`);
    for (const s of recipe.shots) {
      for (const [, slot] of s.prompt.matchAll(/\{(\w+)\}/g)) assert.ok(slots.has(slot), `{${slot}} is not one of ${[...slots].join(", ")}`);
      assert.doesNotMatch(s.prompt, names, `a crew name outside a slot: ${s.prompt.slice(0, 120)}`);
    }
  });
}
