// Canelle, Cabinet's stylist: what she is told of the shoot and the shelves, and how her answer is read (no model is called).
import { test } from "node:test";
import assert from "node:assert/strict";
import { cabinetPrompt, readCabinetAnswer } from "../server/cabinet-assist.ts";

const summary = {
  current: { shoot: "Josie's shoot", active: 1 },
  characters: [{ id: "picture-2", name: "Mona", role: "brought in from a picture" }, { id: "josie", name: "Josie", role: "Creator", look: "curls" }, { id: "shiny", name: "Shiny", role: "Owner", look: "beard" }],
  cast: [{ who: "josie (Josie)", outfits: ["kabyle-dress"], poses: ["hand-hip"] }],
  format: "post",
  backdrop: "studio",
  price: { pictures: 1, credits: 3 },
};
const read = (actions: unknown[], s = summary) => readCabinetAnswer(JSON.stringify({ reply: "Voilà.", actions }), s).actions;

test("she is told the shoot by name, the cast with whoever came from a picture, and every shelf with where a traditional outfit comes from", () => {
  const p = cabinetPrompt(summary, [{ role: "user", text: "an Algerian wedding" }]);
  assert.match(p, /THE SHOOT OPEN: "Josie's shoot"/);
  assert.match(p, /picture-2 = Mona/);
  assert.match(p, /1\. josie \(Josie\), wearing Kabyle dress, posed Hand on hip/);
  assert.match(p, /karakou = Karakou \(Algeria Algerian/);
  assert.match(p, /arms-crossed = Arms crossed/);
  assert.match(p, /anime = Anime/);
  assert.match(p, /about 3 credits/);
  assert.match(p, /User: an Algerian wedding/);
});

test("only her own actions, with ids of the cast and the shelves, a group dressed one of each, and shoot last", () => {
  const actions = read([
    { op: "shoot" },
    { op: "cast", characters: ["josie", "shiny", "nobody", "picture-2", "josie"] },
    { op: "dress", character: 2, outfits: ["burnous", "tuxedo"], poses: ["arms-crossed", "nothing"] },
    { op: "dress", character: 4, outfits: ["chef"] },
    { op: "style", style: "watercolour" },
    { op: "frame", format: "shoot", backdrop: "the moon" },
    { op: "notes", notes: "Shiny turns toward Josie, his hands in the robe's side slits" },
    { op: "fly" },
  ]);
  assert.deepEqual(actions, [
    { op: "cast", characters: ["josie", "shiny", "picture-2"] },
    { op: "dress", character: 2, outfits: ["burnous"], poses: ["arms-crossed"] },
    { op: "style", style: "watercolour" },
    { op: "frame", format: "shoot" },
    { op: "notes", notes: "Shiny turns toward Josie, his hands in the robe's side slits" },
    { op: "shoot" },
  ]);
});

test("alone, a character tries up to four of each; none is no style; a dress that names neither keeps the look", () => {
  assert.deepEqual(read([{ op: "dress", character: 1, outfits: ["chef", "pirate", "gown", "tuxedo", "suit"] }]), [{ op: "dress", character: 1, outfits: ["chef", "pirate", "gown", "tuxedo"] }]);
  assert.deepEqual(read([{ op: "style", style: "none" }, { op: "style", style: "photoreal" }]), [{ op: "style", style: null }]);
  assert.deepEqual(read([{ op: "dress", character: 1 }]), [{ op: "dress", character: 1 }]);
  assert.equal(readCabinetAnswer("not json at all", summary).actions.length, 0);
});
