// The names of the live demo's snapshot files, and the file URLs made relative and absolute again.
import test from "node:test";
import assert from "node:assert/strict";
import { absoluteUrls, relativeUrls, snapshotFile } from "../web/js/snapshot.js";

test("a read is a file: its query sorted, anything unsafe in a name written as ~ and its code", () => {
  assert.equal(snapshotFile("api/stories"), "api/stories.json");
  assert.equal(snapshotFile("/api/stories?b=2&a=1"), "api/stories__a=1&b=2.json");
  assert.equal(snapshotFile("api/stories?a=1&b=2"), snapshotFile("api/stories?b=2&a=1"));
  assert.equal(snapshotFile("api/x?q=a%2Fb c"), "api/x__q=a~2fb~20c.json");
  assert.ok(snapshotFile(`api/x?q=${"y".repeat(300)}`).length < 160);
  assert.notEqual(snapshotFile(`api/x?q=${"y".repeat(300)}1`), snapshotFile(`api/x?q=${"y".repeat(300)}2`));
});

test("file URLs go relative in the snapshot and come back absolute under the folder the site is served from", () => {
  const answer = '{"thumb":"/media/photos/a.jpg","pic":"presets/b.png","note":"/not-a-folder/c"}';
  assert.equal(relativeUrls(answer), '{"thumb":"media/photos/a.jpg","pic":"presets/b.png","note":"/not-a-folder/c"}');
  assert.equal(absoluteUrls(relativeUrls(answer), "/Comfyture/"), '{"thumb":"/Comfyture/media/photos/a.jpg","pic":"/Comfyture/presets/b.png","note":"/not-a-folder/c"}');
  assert.equal(absoluteUrls(relativeUrls(answer), "/"), answer.replace('"presets/', '"/presets/'));
});
