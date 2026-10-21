// The band's data (web/js/jam-band-model.js): the line-up around the lead, the words that put it in a frame and what a stretch costs.
import test from "node:test";
import assert from "node:assert/strict";
import { ROLES, SUPPORT, MAX_BAND, bandOf, castOf, withBand, creditsFor } from "../web/js/jam-band-model.js";

const person = (name: string, role: string, extra: Record<string, unknown> = {}) => ({ file: `${name}.png`, url: `/media/photos/${name}.png`, name, role, show: true, ...extra });

test("the line-up is the performers kept, at most two, those not shown left out of the scenes", () => {
  const b = { band: [person("Praline", "guitarist"), person("Mochi", "dancer", { show: false }), person("Sesame", "drummer")] };
  assert.equal(castOf(b).length, MAX_BAND);
  assert.deepEqual(castOf(b).map((p) => p.name), ["Praline", "Mochi"]);
  assert.deepEqual(bandOf(b).map((p) => p.name), ["Praline"]);
  assert.deepEqual(bandOf({}), []);
  assert.deepEqual(bandOf({ band: [{ name: "no file" }, null] }), []);
});

test("every role a supporting performer can take has a name and a way to be told to the picture model", () => {
  for (const r of SUPPORT) assert.ok(ROLES[r][0] && ROLES[r][1], r);
  assert.equal(ROLES.lead[0], "Lead");
});

test("without performers a prompt is as it was; with them they stand beside the lead, each as their own reference", () => {
  const base = "A vertical frame: @artist singing.";
  assert.deepEqual(withBand({ band: [] }, base), { prompt: base, refs: [] });
  const out = withBand({ band: [person("Praline", "guitarist"), person("Mochi", "dancer")] }, base);
  assert.ok(out.prompt.startsWith(base));
  assert.match(out.prompt, /@performer1 \(Praline, playing an electric guitar\)/);
  assert.match(out.prompt, /@performer2 \(Mochi, dancing with a lot of energy\)/);
  assert.deepEqual(out.refs, [{ file: "Praline.png", name: "performer1" }, { file: "Mochi.png", name: "performer2" }]);
});

test("a stretch of video costs about what Comfy Cloud bills for it, never less than one credit", () => {
  assert.equal(creditsFor(0), 1);
  assert.equal(creditsFor(10), Math.round(10 * 18 * 0.266));
  assert.ok(creditsFor(4) > creditsFor(2));
});
