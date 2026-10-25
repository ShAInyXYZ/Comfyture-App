# workflows/3d — Toaster's 3D models (Trellis2, on your own ComfyUI)

Toaster's 3D page makes the scene's objects real **one at a time**. For each object an image model draws its four-view sheet, the
sheet is cut into front, back, left and right, and these three graphs turn the four views into a textured GLB, each stage's mesh
the next stage's input. `server/toaster-3d.ts` runs them in this order on the ComfyUI at `COMFYUI_URL` (default
`http://127.0.0.1:8188`). Microsoft's TRELLIS.2 is open weights, and it runs on your GPU: no credit is spent.

| File | Made from (ComfyUI UI workflow) | What it does |
|---|---|---|
| `shape.api.json` | `Trellis2-MVShapegen-v2` | four views → sparse structure → 512 shape → 1024 / 1536 cascade → one mesh (`3D/Comfyture/<job>-shape_*.glb`) |
| `refine.api.json` | `Trellis2-ShapeRefiner-v2.2` | the shape refined against the front view (RMBG cut-out, mesh refiner), exterior patches repaired, the surface closed |
| `texture.api.json` | `Trellis2-MVTexturing-v2` | the refined shape textured from the four views (4-view texturing, PBR bake), colours matched to the views |

## Which version, and why

The v2 files, for the three stages. v2 of the shape generator samples with Heun and a seed per stage, goes 32-grid → 512 →
1024 / 1536, and saves the raw master without hole filling, remeshing or smoothing (v1 filled holes, quad-remeshed and decimated
what it made, which hides the generator's real shape and its intentional openings). v2 of the texturing is the four-view texturer with
a PBR bake and an automatic colour match against the four views (v1 baked 25 steps at 1024 and decimated the mesh to
40 000 faces first). The refiner between them is v2.2 (the plain one, not `-PreparedGuide`): it adds the exterior-patch repair
and the closed-surface rebuild that texturing wants for its input.

## How they differ from the UI files

Converted to ComfyUI's API format (the widget order of each node read from ComfyUI's `/object_info`), then:

- the Preview3D nodes are gone (nothing in the app shows them), and the raw-geometry and raw-texture side saves are gone: each graph
  ends in **one** `KAISaveMesh`;
- `refine`'s `ShinyLoad3DView` is a `Trellis2LoadMesh` (it reads the path the stage before saved), and `texture`'s mesh loader too;
- the image loaders hold placeholder names (`front.png`…): the server uploads the four views and sets them;
- `RMBG`'s widget order is written out by name;
- `texture_alpha_mode` is `OPAQUE` (props are solid; the saved graph said `BLEND`).

## Quality

The graphs as saved are **"fine"** (1536 cascade and refinement, a 1 000 000-face refiner target, 500 000 faces and a 2048 texture for the texturing). The server's
**"web"** quality, used by default, changes numbers only (`tune()` in `server/toaster-3d.ts`, covered by `tests/toaster-3d.test.ts`):
the 1024 cascade is the delivery (the 1536 branch is left out), 16 steps instead of 24, the refiner at 1024, meshes of about 100 000
faces, the same 2048 texture at a lighter 1024 sampling. An object then fits a page and a scene of a dozen of them opens.

## Needs

ComfyUI-Trellis2 with its Otia nodes (`OtiaTrellis2*`), `Trellis2*`, ComfyUI-RMBG, and the TRELLIS.2-4B weights
(`microsoft/TRELLIS.2-4B`). The server asks ComfyUI for these nodes before it takes a job and says which ones are missing.
Without a ComfyUI of your own (a hosted copy) the page makes the model on Comfy Cloud instead, with Pixal3D's multi-view template.
