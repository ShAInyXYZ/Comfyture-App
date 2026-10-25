// Toaster's 3D server: the three Trellis2 workflows as saved in workflows/3d/ are whole and wired one to the next, a quality changes
// only the numbers it should, and with no ComfyUI to make a model on the server says so plainly (no browser, no ComfyUI).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tune, createToaster3d } from "../server/toaster-3d.ts";

const root = join(import.meta.dirname, "..");
const graph = (name: string) => JSON.parse(readFileSync(join(root, "workflows", "3d", `${name}.api.json`), "utf8"));

test("each workflow is an API-format graph whose every link points at a node that is there", () => {
  for (const name of ["shape", "refine", "texture"]) {
    const g = graph(name);
    for (const [id, node] of Object.entries<any>(g)) {
      assert.ok(node.class_type, `${name} ${id} has a class`);
      for (const v of Object.values<any>(node.inputs)) if (Array.isArray(v)) assert.ok(g[String(v[0])], `${name} ${id} links to ${v[0]}`);
    }
  }
});

test("the shape, the refiner and the texturing are the user's v2 workflows, and each ends in one saved mesh", () => {
  const classes = (n: string) => new Set(Object.values<any>(graph(n)).map((x) => x.class_type));
  assert.ok(classes("shape").has("OtiaTrellis2ShapeCascadeMultiView") && classes("shape").has("Trellis2SparseMultiViewGenerator"));
  assert.ok(classes("refine").has("OtiaTrellis2MeshRefiner") && classes("refine").has("OtiaTrellis2SolidRepairV22") && classes("refine").has("RMBG"));
  assert.ok(classes("texture").has("OtiaTrellis2MeshTexturingMultiView") && classes("texture").has("OtiaTrellis2AutoColorMatch"));
  for (const n of ["shape", "refine", "texture"]) {
    const g = graph(n);
    const savers = Object.keys(g).filter((k) => g[k].class_type === "KAISaveMesh" && !Object.values<any>(g).some((x) => Object.values<any>(x.inputs).some((v) => Array.isArray(v) && v[0] === k)));
    assert.equal(savers.length, 1, `${n} saves one mesh`);
  }
  // the mesh of a stage is loaded by the next: refine's node 25 and texture's node 10 read a file path
  assert.equal(graph("refine")["25"].class_type, "Trellis2LoadMesh");
  assert.equal(graph("texture")["10"].class_type, "Trellis2LoadMesh");
  // four views for the shape and the texture, the front for the refiner
  for (const [n, loaders] of [["shape", ["1", "3", "5", "7"]], ["texture", ["1", "3", "5", "7"]], ["refine", ["1"]]] as const) for (const id of loaders) assert.equal(graph(n)[id].class_type, "Trellis2LoadImageWithTransparency");
  assert.equal(graph("texture")["13"].inputs.texture_alpha_mode, "OPAQUE", "props are opaque");
});

test("'fine' leaves the saved workflows as they are; 'web' lightens them and keeps them wired", () => {
  for (const n of ["shape", "refine", "texture"] as const) {
    const fine = tune(n, graph(n), "fine", 7);
    for (const [id, node] of Object.entries<any>(graph(n))) assert.deepEqual(Object.keys(fine[id].inputs).sort(), Object.keys(node.inputs).sort(), `${n} ${id}: the same inputs`);
  }
  const web = tune("shape", graph("shape"), "web", 7);
  assert.equal(web["18"], undefined, "the 1536 cascade is left out");
  assert.deepEqual(web["23"].inputs.mesh, ["14", 0], "the delivery is the 1024 decode");
  for (const node of Object.values<any>(web)) for (const v of Object.values<any>(node.inputs)) if (Array.isArray(v)) assert.ok(web[String(v[0])], "still wired");
  assert.deepEqual([web["11"].inputs.seed, web["12"].inputs.seed, web["13"].inputs.seed], [7, 8, 9], "each sampler has its own seed, one apart");
  const refine = tune("refine", graph("refine"), "web", 7);
  assert.equal(refine["15"].inputs.resolution, 1024);
  assert.ok(refine["36"].inputs.target_faces <= 100000);
  const texture = tune("texture", graph("texture"), "web", 7);
  assert.equal(texture["13"].inputs.resolution, 1024);
  assert.ok(texture["11"].inputs.target_face_num <= 100000);
  assert.notEqual(graph("shape")["23"].inputs.target_face_num, web["23"].inputs.target_face_num, "the saved graph is not changed by tuning a copy");
});

test("with no ComfyUI to make a model on, the server says why, and refuses a job plainly", async () => {
  process.env.COMFYUI_URL = "http://127.0.0.1:9";
  const t = createToaster3d({ data: join(root, "data-test-unused"), root, photoPath: (f) => f });
  const target = (await t.handle("GET", "target", {})).body as any;
  assert.equal(target.local.ok, false);
  assert.match(target.local.why, /No ComfyUI answers at http:\/\/127\.0\.0\.1:9/);
  const refused = await t.handle("POST", "make", { views: { front: "a.png", back: "b.png", left: "c.png", right: "d.png" } });
  assert.equal(refused.status, 501);
  const bad = await t.handle("POST", "make", { views: { front: "../x" } });
  assert.equal(bad.status, 400, "four plain file names are needed");
  assert.equal((await t.handle("GET", "job/nope", {})).status, 404);
});
