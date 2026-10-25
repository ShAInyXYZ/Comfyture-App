// How a prompt's @names reach each partner image model: "image 1"… on most, <<<image_1>>> on Kling, and on Runway each picture's own tag.
import { test } from "node:test";
import assert from "node:assert/strict";
import { routerPrompt, refTag } from "../server/router-images.ts";

test("a prompt's @names become the model's own references, in the order the pictures are sent", () => {
  const names = ["frame", "colour-id", "crumpet"];
  assert.equal(routerPrompt({ tag: "image {n}", refs: 3 }, "Redraw @frame; @colour-id says who is who; @crumpet sits.", names, 3).prompt, "Redraw image 1; image 2 says who is who; image 3 sits.");
  assert.equal(routerPrompt({ tag: "<<<image_{n}>>>", refs: 10 }, "@crumpet at the desk", names, 3).prompt, "<<<image_3>>> at the desk");
  assert.equal(routerPrompt({ tag: "", refs: 9 }, "@colour-id map", names, 3).prompt, "colour id map", "a model without tags reads the plain word");
});

test("Runway: each picture goes with a tag of its own, and the prompt calls it by @tag", () => {
  const out = routerPrompt({ tag: "@", refs: 3 }, "Redraw @frame with @crumpet; @colour-id says who is who; @mood is left out.", ["frame", "colour-id", "crumpet", "mood"], 3);
  assert.deepEqual(out.tags, ["frame", "colour_id", "crumpet"]);
  assert.equal(out.prompt, "Redraw @frame with @crumpet; @colour_id says who is who; mood is left out.", "a picture past the three it takes is only a word");
  assert.equal(refTag("1st"), "r_1st");
  assert.equal(refTag("a"), "a__", "at least three long");
  assert.equal(refTag("warm-office-mood-board"), "warm_office_mood", "at most sixteen");
  assert.deepEqual(routerPrompt({ tag: "@", refs: 3 }, "", ["warm-office-mood-board", "warm-office-mood-boards"], 2).tags, ["warm_office_mood", "warm_office_m_2"], "two names cut alike stay apart");
});
