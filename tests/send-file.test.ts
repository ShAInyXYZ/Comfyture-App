// Static files are sent once (server/media.ts sendFile): a browser's copy that is still the file gets a 304 with no body; code, styles,
// data and models go gzipped to a browser that takes it; a range (a video seeking) is never compressed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request } from "node:http";
import { gunzipSync } from "node:zlib";
import { sendFile } from "../server/media.ts";

/** A raw GET (no automatic decompression), with the headers given. */
const get = (port: number, path: string, headers: Record<string, string> = {}) =>
  new Promise<{ status: number; headers: Record<string, any>; body: Buffer }>((done, fail) => {
    const req = request({ host: "127.0.0.1", port, path, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => done({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on("error", fail);
    req.end();
  });

test("a file is sent once: validators, 304, gzip for code, plain ranges", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "send-"));
  const js = "export const x = 1;\n".repeat(200);
  await writeFile(join(dir, "app.js"), js);
  await writeFile(join(dir, "clip.mp4"), Buffer.alloc(4096, 7));
  const server = createServer((req, res) => void sendFile(req, res, join(dir, req.url!.slice(1)), "no-cache")).listen(0);
  t.after(async () => (server.close(), await rm(dir, { recursive: true, force: true })));
  await new Promise((r) => server.once("listening", r));
  const port = (server.address() as any).port;

  const first = await get(port, "/app.js");
  assert.equal(first.status, 200);
  assert.ok(first.headers.etag && first.headers["last-modified"], "it says which version it is");
  assert.equal(first.body.toString(), js, "a browser that takes no gzip gets the file as it is");
  const again = await get(port, "/app.js", { "If-None-Match": first.headers.etag });
  assert.deepEqual([again.status, again.body.length], [304, 0], "the browser's copy is still the file: no body");
  const since = await get(port, "/app.js", { "If-Modified-Since": first.headers["last-modified"] });
  assert.equal(since.status, 304);
  const zipped = await get(port, "/app.js", { "Accept-Encoding": "gzip, br" });
  assert.equal(zipped.headers["content-encoding"], "gzip");
  assert.ok(zipped.body.length < js.length / 4, `compressed: ${zipped.body.length} of ${js.length} bytes`);
  assert.equal(gunzipSync(zipped.body).toString(), js);
  const part = await get(port, "/clip.mp4", { "Accept-Encoding": "gzip", Range: "bytes=0-99" });
  assert.deepEqual([part.status, part.body.length, part.headers["content-encoding"]], [206, 100, undefined], "a range is sent plain");
  const video = await get(port, "/clip.mp4", { "Accept-Encoding": "gzip" });
  assert.equal(video.headers["content-encoding"], undefined, "a video is not compressed");
});
