// Where each render job runs (server/route.ts, server/target.ts): what a ComfyUI has is read from its /object_info, a job names what it
// lacks, and "Both" (hybrid) is a target of its own, kept across restarts beside the bridge's address.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installedFrom, missing, lacking, createInstalled } from "../server/route.ts";
import { createTarget } from "../server/target.ts";

const INFO = {
  LoadImage: { input: { required: { image: [["a.png"]] } } },
  UNETLoader: { input: { required: { unet_name: [["qwen_image_2.1.safetensors", "sub/ltx-2.3.safetensors"]] } } },
  SaveImage: { input: { required: {} } },
};

test("a ComfyUI's nodes and model files are read from its object_info, by file name", () => {
  const have = installedFrom(INFO);
  assert.ok(have.nodes.has("UNETLoader"));
  assert.ok(have.files.has("ltx-2.3.safetensors"), "a file in a subfolder is known by its name");
  assert.ok(!have.files.has("a.png"), "pictures are not models");
});

test("a job names the nodes and model files the ComfyUI lacks", () => {
  const have = installedFrom(INFO);
  const ok = { a: { class_type: "UNETLoader", inputs: { unet_name: "qwen_image_2.1.safetensors" } }, b: { class_type: "SaveImage", inputs: { images: ["a", 0] } } };
  assert.deepEqual(missing(ok, have), []);
  const not = { a: { class_type: "UNETLoader", inputs: { unet_name: "ltx-2.5-22b.safetensors" } }, b: { class_type: "AudioBPMDetector", inputs: {} } };
  assert.deepEqual(missing(not, have), ["ltx-2.5-22b.safetensors", "the AudioBPMDetector node"]);
  assert.match(lacking(["x.safetensors"], false), /Both or Comfy Cloud/);
  assert.match(lacking(["x.safetensors"], true), /goes to Comfy Cloud/);
  assert.match(lacking(["1", "2", "3", "4", "5", "6"], true), /and 2 more/);
});

test("the ComfyUI behind a bridge is the one the bridge names, asked once a minute", async () => {
  let asked = 0;
  const f = (async (url: string) => {
    if (url === "http://gpu:8189/api/v2/health") return new Response(JSON.stringify({ upstream: "http://127.0.0.1:8188" }));
    if (url === "http://gpu:8188/object_info") return asked++, new Response(JSON.stringify(INFO));
    throw new Error("refused");
  }) as unknown as typeof fetch;
  const installed = createInstalled(f);
  const have = await installed("http://gpu:8189");
  assert.ok(have?.nodes.has("SaveImage"), "a bridge's 127.0.0.1 is its own machine's");
  await installed("http://gpu:8189");
  assert.equal(asked, 1);
  assert.equal(await createInstalled((async () => { throw new Error("refused"); }) as unknown as typeof fetch)("http://none:8189"), null);
});

test("Both is a target of its own: kept, taken again at start, and left for Comfy Cloud", async () => {
  const data = await mkdtemp(join(tmpdir(), "route-"));
  const env: NodeJS.ProcessEnv = {};
  const f = (async () => new Response("{}", { status: 200 })) as unknown as typeof fetch;
  try {
    const where = createTarget({ data, env, fetch: f });
    const { target } = await where.set("hybrid", "http://127.0.0.1:8189");
    assert.deepEqual(target, { kind: "hybrid", url: "http://127.0.0.1:8189" });
    assert.equal(env.COMFY_BASE_URL, "http://127.0.0.1:8189");
    assert.deepEqual(JSON.parse(await readFile(join(data, "target.json"), "utf8")), { kind: "hybrid", url: "http://127.0.0.1:8189" });
    const again = createTarget({ data, env: {}, fetch: f });
    await again.init();
    assert.equal(again.current().kind, "hybrid");
    assert.equal((await where.set("comfy-cloud")).target.kind, "comfy-cloud");
    assert.equal(env.COMFYTURE_HYBRID, undefined);
    assert.equal((await where.set("self-hosted", "http://127.0.0.1:8189")).target.kind, "self-hosted");
  } finally {
    await rm(data, { recursive: true, force: true });
  }
});

test("a job's files become uploads of the client that runs it; the graph and its saved copy keep their names", async () => {
  const { bindFiles, FileRef } = await import("../server/engine.ts");
  const made: string[] = [];
  const client = { assets: { fromFile: (p: string) => (made.push(p), { handle: p }) } } as any;
  const graph = { a: { class_type: "LoadImage", inputs: { image: new FileRef("/data/photos/cast.png"), size: 3, list: [new FileRef("/x/b.png")] } } };
  const bound = bindFiles(graph, client);
  assert.deepEqual(bound.a.inputs.image, { handle: "/data/photos/cast.png" });
  assert.deepEqual(made, ["/data/photos/cast.png", "/x/b.png"]);
  assert.ok(graph.a.inputs.image instanceof FileRef, "the graph itself is kept as it was");
  assert.equal(JSON.parse(JSON.stringify(graph)).a.inputs.image, "cast.png");
});
