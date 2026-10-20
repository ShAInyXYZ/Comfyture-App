// The save kept a moment after the last change, one for each thing: A is not forgotten when B is changed
// quickly after it, and what is pending can be sent now.

import { test } from "node:test";
import assert from "node:assert/strict";
import { keyedSaver } from "../web/js/saving.js";

const later = (ms: number) => new Promise((done) => setTimeout(done, ms));

test("two things changed one after the other are both kept, each a moment after its own last change", async () => {
  const sent: [string, unknown][] = [];
  const saver = keyedSaver(30, (key: string, value: unknown) => void sent.push([key, value]));
  saver.save("a", { name: "Alpha" });
  saver.save("b", { name: "Beta" }); // the old single timer would have forgotten A here
  await later(120);
  assert.deepEqual(sent.map(([k]) => k).sort(), ["a", "b"]);
  assert.equal(saver.size, 0);
});

test("a thing changed again before its moment is up is sent once, as it is then", async () => {
  const sent: any[] = [];
  const saver = keyedSaver(40, (_key: string, value: any) => void sent.push(JSON.stringify(value)));
  const thing = { n: 1 };
  saver.save("a", thing);
  await later(15);
  thing.n = 2; // changed in place
  saver.save("a", thing);
  await later(120);
  assert.deepEqual(sent, ['{"n":2}']);
});

test("flush sends what is pending now and answers when it is sent; a flush with nothing pending answers at once", async () => {
  const sent: string[] = [];
  const saver = keyedSaver(10_000, async (key: string) => {
    await later(20);
    sent.push(key);
  });
  saver.save("a", 1);
  saver.save("b", 2);
  assert.equal(saver.has("a"), true);
  await saver.flush("a");
  assert.deepEqual(sent, ["a"]);
  assert.equal(saver.has("a"), false);
  await saver.flush();
  assert.deepEqual(sent, ["a", "b"]);
  await saver.flush("c");
});

test("a thing let go is not sent, and a send that fails does not stop the others", async () => {
  const sent: string[] = [];
  const saver = keyedSaver(20, (key: string) => {
    if (key === "bad") throw new Error("no");
    sent.push(key);
  });
  saver.save("gone", 1);
  saver.drop("gone");
  saver.save("bad", 2);
  saver.save("good", 3);
  await saver.flush();
  await later(60);
  assert.deepEqual(sent, ["good"]);
});
