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

test("a shelf is searched by every word: names, words, countries and peoples, the group's other names, kinds and slips", async () => {
  const { find, WARDROBE, POSES, WARDROBE_GROUPS, POSE_GROUPS, WARDROBE_GROUP_TAGS, POSE_GROUP_TAGS } = await import("../web/js/cabinet-shelf.js");
  const w = (q) => find(WARDROBE, q, WARDROBE_GROUPS, WARDROBE_GROUP_TAGS).map((x) => x.id);
  const p = (q) => find(POSES, q, POSE_GROUPS, POSE_GROUP_TAGS).map((x) => x.id);
  assert.ok(WARDROBE.length >= 100 && POSES.length >= 90, "a full wardrobe and a full pose shelf");
  assert.deepEqual(find(WARDROBE, "", WARDROBE_GROUPS), WARDROBE);
  assert.deepEqual(w("  Chef  "), ["chef"]);
  const algeria = ["karakou", "burnous", "caftan-light", "chedda", "qachabiya", "kabyle-dress", "chaoui", "tuareg-men", "tuareg-women"];
  for (const q of ["Algeria", "algerian", "alger", "Algérie", "algérien", "algerien"]) assert.deepEqual(w(q), algeria, q);
  for (const q of ["Morocco", "moroccan", "Maroc", "marocaine"]) assert.deepEqual(w(q), ["caftan", "djellaba"], q);
  assert.deepEqual(w("north africa"), ["caftan", "djellaba", ...algeria, "galabeya"]);
  assert.deepEqual(w("touareg femme"), ["tuareg-women"]);
  assert.deepEqual(w("caftan").slice(0, 2).sort(), ["caftan", "caftan-light"], "both caftans, whatever their names");
  for (const id of ["burnous", "kabyle-dress", "chaoui", "tuareg-men", "tuareg-women"]) assert.ok(w("amazigh").includes(id), `${id} is Amazigh`);
  assert.ok(!w("amazigh").includes("karakou") && !w("amazigh").includes("caftan"), "the city costumes are not");
  assert.deepEqual(w("kabyle"), ["kabyle-dress"]);
  assert.deepEqual(w("kachabia"), ["qachabiya"]);
  const regions = new Set(["africa", "middle-east", "asia", "europe", "americas"]);
  assert.ok(w("traditional").length >= 70 && w("traditional").every((id) => regions.has(WARDROBE.find((x) => x.id === id).group)), "the regions by another name");
  for (const [q, id] of [["Poland", "goral"], ["polonais", "krakowiak"], ["France", "bigouden"], ["breton", "bigouden"], ["Japan", "furisode"], ["chinese", "hanfu"], ["Norway", "bunad"], ["viking", "norse-women"], ["germanic", "bollenhut"], ["nordic", "gakti"], ["Mexique", "charro"]]) assert.ok(w(q).includes(id), `${q} finds ${id}`);
  assert.ok(["sundress", "gown", "sari", "little-black"].every((id) => w("dresses").includes(id)), "dresses of every kind");
  assert.ok(!w("dresses").includes("robot"), "not every costume is a dress");
  assert.ok(w("hats").includes("tuareg-men") && w("hats").includes("cowboy"), "a turban and a cowboy hat are hats");
  assert.ok(["parka", "peacoat", "qachabiya"].every((id) => w("winter coat").includes(id)), "winter coats, the qachabiya among them");
  assert.ok(p("holding").length >= 10, "a group's name is searched too");
  assert.deepEqual(w("nothing like this"), []);
});

test("no outfit says a country in its name; its words may", async () => {
  const { WARDROBE } = await import("../web/js/cabinet-shelf.js");
  const countries = /\b(alger|morocc|japan|korea|india|scot|german|bavaria|china|chinese|africa|peru|andean|mexic)/i;
  for (const it of WARDROBE) assert.doesNotMatch(it.name, countries, it.name);
  for (const id of ["karakou", "burnous", "caftan", "caftan-light", "djellaba", "qachabiya", "kabyle-dress", "chaoui", "chedda"]) assert.match(WARDROBE.find((x) => x.id === id).words, /Algerian|Moroccan|Algeria/);
});
