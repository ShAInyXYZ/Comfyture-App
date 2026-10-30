// Cabinet's shelves and the words a picture is asked with (web/js/cabinet-shelf.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { WARDROBE, POSES, WARDROBE_GROUPS, POSE_GROUPS, FORMATS, BACKDROPS, MOST, combos, shotPrompt } from "../web/js/cabinet-shelf.js";

test("every outfit and pose has its picture, its thumb, a group and words", () => {
  for (const [items, groups] of [[WARDROBE, WARDROBE_GROUPS], [POSES, POSE_GROUPS]]) {
    assert.equal(new Set(items.map((i) => i.id)).size, items.length, "ids are unique");
    for (const it of items) {
      assert.ok(it.group in groups, `${it.id}: its group is a shelf's`);
      assert.ok(it.words.length > 20, `${it.id}: said in words`);
      assert.ok(existsSync(new URL(`../web/${it.src}`, import.meta.url)), `${it.src} is there`);
      assert.ok(existsSync(new URL(`../web/${it.thumb}`, import.meta.url)), `${it.thumb} is there`);
    }
  }
});

test("a press makes every outfit in every pose, their own clothes or a natural pose when none is picked, at most MOST", () => {
  assert.deepEqual(combos([], []), [{ outfit: null, pose: null }]);
  assert.deepEqual(combos(["a", "b"], []), [{ outfit: "a", pose: null }, { outfit: "b", pose: null }]);
  assert.equal(combos(["a", "b"], ["x", "y"]).length, 4);
  assert.equal(combos(["a", "b", "c", "d"], ["w", "x", "y", "z"]).length, MOST);
});

test("the prompt names the three pictures by @name and says what the picture is for", () => {
  const p = shotPrompt({ who: { name: "Bagel", look: "the chubby corgi" }, outfit: WARDROBE[0], pose: POSES[0], format: "tryon", backdrop: "street", notes: "golden light" });
  assert.match(p, /@character/);
  assert.match(p, /@outfit/);
  assert.match(p, /@pose/);
  assert.match(p, /lookbook/);
  assert.match(p, new RegExp(BACKDROPS.street.words));
  assert.match(p, /Also: golden light$/);
  assert.match(p, /^A fashion lookbook/);
});

test("without an outfit or a pose, the prompt asks for neither picture", () => {
  const p = shotPrompt({ who: { name: "Josie", person: true } });
  assert.doesNotMatch(p, /@outfit|@pose/);
  assert.match(p, /their own clothes/);
  assert.match(p, /hair, skin/);
  assert.ok(Object.values(FORMATS).every((f) => /^\d+:\d+$/.test(f.aspect)));
});

test("the examples are on disk and made of the shelves' own outfits and poses", async () => {
  const { EXAMPLES, wardrobeItem, poseItem } = await import("../web/js/cabinet-shelf.js");
  for (const x of EXAMPLES) {
    assert.ok(existsSync(new URL(`../web/${x.src}`, import.meta.url)), x.src);
    assert.ok(wardrobeItem(x.outfit) && poseItem(x.pose) && FORMATS[x.format], `${x.who}'s example`);
  }
});
