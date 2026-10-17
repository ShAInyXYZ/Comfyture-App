# Comfyture Stage model library

Delivered 17 October 2026. All geometry was authored in the connected Blender 5.2.1 session through MCP, using the editable modelling scripts in this directory. The current GLBs were inspected as dimensional/hierarchy references; their mesh geometry was not reused. No external assets, textures, generated images, system packages, or application changes are required.

## Delivery

| Group | Count | Location | Exported triangle range |
|---|---:|---|---:|
| Mannequins | 8 | `web/models/bodies/` | 23,456–23,648 |
| Existing set pieces | 35 | `web/models/props/` | 140–10,092 |
| New set pieces | 16 | `web/models/props/` | 876–5,352 |
| Reusable modules | 3 | `web/models/props/` | 188–376 |
| Hand props | 10 | `web/models/hand/` | 612–4,836 |

There are **72 self-contained GLB files**. Every body is below 25,000 triangles. Every set piece other than the car is below 6,000; the car is 10,092, below its 15,000 limit. Counts include all mesh parts and are checked against actual GLB indices.

The new set pieces are **fridge, stove, kitchen-island, office-chair, wardrobe, bathtub, piano, bus-stop, trash-bin, mailbox, phone-booth, tent, campfire, pine-tree, palm-tree, rowing-boat**. The hand props are **phone, cup, book, camera, sword, pistol, umbrella, bag, guitar, steering-wheel**.

`blender/` contains one editable source per GLB (`body-`, `props-`, `new-`, or `hand-` filename prefix), plus `preview-stand.blend` and `pose-tests.blend`. The latter contains all eight bodies imported from the delivered GLBs, with labelled timeline poses at frames 1, 25, 49, 73, 97, 121 and 145. Production GLBs remain in the unrotated T-pose and contain no animations.

## Shape and finish

Bodies use authored, smoothly interpolated mesh cages for the chest, abdomen, pelvis, limbs, head, mittens and feet. These are closed rigid parts, with darker inset ball joints and overlapping socket ends. The chest has a shaped lower seam; the pelvis has rising leg openings; the head has a broad cranium, a quieter front plane and a narrower chin. The mitten has a separate thumb and shallow finger scallops. The forefoot cap moves with its own toe node.

The woman's bust is integrated into the chest surface, rather than attached spheres. The child and toddler have larger heads relative to their bodies, rounded bellies and short legs. The elder keeps the forward head and thoracic displacement. The heavy body has a rounded, low overhanging belly and thicker limbs. The athletic body has broader shoulders, a narrower waist and fuller upper arms and thighs.

Set pieces use bevelled manufactured edges and separate named components. Hollow forms are modelled where they matter: the cup, bathtub, boat, bin opening and tent entrance. The piano has separate keys and pedals; the car has wheel wells and inset glazing; the umbrella has a canopy, ribs and hooked handle. Detail is geometry, with no texture dependency.

Joint/socket overlap is intentional. These are rigid artist's mannequins, so deep flexion can make adjacent plates overlap rather than compress like skin. Hands are single rigid mittens with a separate thumb; there is no finger rig. Palm attachment previews show the actual intersections/contact of that rigid representation.

## Loader contract

`web/models/manifest.json` is version 1. File paths are relative to `web/models/`; for example, serve `bodies/man.glb` as `/models/bodies/man.glb`.

- `bodies`: `id`, `file`, measured `triangles`, and 21 exported `joints` with `name`, `parent`, `local`, `world`. Additional `headBounds`, `handSocketScale` and `handSockets` support placement.
- `assets`: 51 entries, each with `type`, `name`, `category`, `file`, measured `size` in **[width, height, depth]**, `seat`, `top`, `triangles`, and `modules`. A null anchor means no supported anchor.
- `handProps`: 10 entries with `type`, `name`, `file`, `triangles`, `modelGripOrigin`, `gripCoordinateSpace`, both `grips`, and compatible `poses`.
- The three module descriptors live inside their parent stairs/fence entries. They include their own path, size and triangle count, plus assembly translations.

All exported values are metres, **+Y up**, with character left **+X** and facing **+Z**. Blender authoring uses `(x, -z, y)`, followed by the glTF exporter's Y-up conversion. No loader-side coordinate conversion is needed. Joint nodes have identity rest rotations and unit scale. There are no skins, weights, morph targets, cameras, lights, UVs or textures in the GLBs.

Find each joint by its exact name. Rotate that node directly; preserve its exported rest translation and hierarchy. Every body mesh is a child of its owning joint, named `<Joint>.<part>`. A mesh's own local transform is part of the exported model and should be preserved.

Body materials are exactly **`plate`** and **`joint`**. Tint cloned material instances per character, retaining the darker joint ratio. Prop/hand materials are **`prop`**, with **`accent`** where needed. Screens, glass and inset details are opaque matte clay; they remain useful in depth/normal/ID passes. Preview colours are display-only and do not add extra production materials.

For OpenPose, use exported joint world transforms. `body.headBounds` gives the actual head mesh bounds and centre **in the Head node's local frame**. Do not reuse the old procedural `headFrame()` dimensions without adapting them to this head geometry.

## Skeleton changes

All 21 names and parents are unchanged. Shoulder and hip spacing was widened to accommodate rounder plates and sockets. Positive-side joint X positions are below; the right side is the exact negative. Forearm/hand positions translate with the shoulder, and knee/ankle/toe positions translate with the hip. The manifest records every final position.

| Body | LeftArm X, old → new | LeftUpLeg X, old → new |
|---|---:|---:|
| man | .1958 → .215 | .0889 → .108 |
| woman | .1494 → .177 | .0984 → .119 |
| teen | .1504 → .175 | .0790 → .088 |
| child | .1122 → .133 | .0622 → .079 |
| toddler | .0810 → .102 | .0487 → .062 |
| elder | .1596 → .184 | .0891 → .108 |
| heavy | .1866 → .239 | .1007 → .140 |
| athletic | .2282 → .249 | .0899 → .108 |

Joint Y/Z positions come from the spec's **world positions**. For the elder, those world positions already include the stoop, whereas some source `local` values describe a straight chain. New local offsets were computed by subtracting the parent's world position. This preserves the stooped placement while keeping every exported rest-node rotation at identity. Existing IK/pose presets should solve against the new offsets and lengths, rather than reinstating the procedural skeleton's translations.

## Asset anchors and legacy exceptions

All 35 original default sizes and seat/top values are retained. Structural parts remain separate for later stretching; these GLBs implement the default sizes, not the application's parameter-update logic.

The supplied conventions contain two legacy exceptions worth handling explicitly:

1. **Car:** the original 4.3 × 1.45 × 1.84 m envelope has its length along X and its front toward **+X**. This explicit footprint was preserved. The car entry therefore declares `front: [1,0,0]` and supplies `frontRotationToPositiveZ`, a −90° Y rotation. Applying it faces +Z and swaps the X/Z footprint. Other set pieces follow the general +Z convention.
2. **Rock:** the spec's nominal `top: .536` is 12.9 mm above its .5231 m envelope. The original anchor is retained as placement clearance rather than silently changing app behaviour.

Stairs are now centred in depth, from −.75 to +.75 m, ascending toward +Z. The original seat anchor **y=.36, z=−.3** lies on the second tread. `stairs.step` is a 1 × .18 × .3 m module; translations are in the manifest. Fill underneath higher treads with additional step modules to reproduce the solid default staircase.

Fence post and rail placements are recorded explicitly. The streetlamp's asymmetric arm is centred within the original footprint; its pole sits at X=−.43 m. New set pieces are grounded and centred, with measured sizes and authored usable seat/top anchors.

## Hand attachment

Every hand GLB root has its origin at the model's grip point. Geometry is already oriented for **RightHand: finger axis −X, palm −Y, thumb +Z**. Quaternions use **[x,y,z,w]**.

`gripCoordinateSpace` is **`hand-joint-local`**: each `grips[hand]` transform places the prop's grip-origin root under that hand node. The reference right position is `[-.075,-.018,0]`; the left is `[.075,-.018,0]`. Both use identity rotation. The left additionally uses `scale: [-1,1,1]` to mirror across X while retaining the palm and thumb directions. Three.js handles the negative determinant; preserve that transform instead of baking an incorrectly reversed winding.

Use the selected body's `handSockets[hand].position`, or multiply the reference grip position by `body.handSocketScale`. This follows the authored palm scale (`height / 1.78 × profile.hands`). Prop physical dimensions should normally stay unchanged. The displayed palm checks use the unscaled reference offsets.

The camera and pistol aim along the finger axis. Cup, sword and umbrella shafts follow the thumb axis. Phone screens and book pages face the palm side. Pose tags identify compatible starting poses; the app still attaches the prop and solves any supporting second hand (book, camera, guitar, steering wheel). Re-solve IK after selecting a body, and tune wrist rotation for the particular shot. No application attachment code was changed.

## Verification and previews

- `previews/turntable-sheet.png`: eight bodies at common scale, front / three-quarter / side / back.
- `previews/pose-test.png`: every body standing, seated at 90° hips/knees, elbows at 130°, arms overhead, head turned 60°, and spine leaned forward 30°.
- `previews/asset-sheet.png`: 35 originals, 16 additions and three modules.
- `previews/hand-prop-sheet.png`: all ten hand props displayed upright for inspection. This display rotation is not baked into the production files.
- `previews/hand-grip-check.png`: all ten attached to the actual imported right mitten at the reference palm transform.
- Individual render rows and tiles are also retained. These are Blender renders of the delivered GLBs; contact-sheet composition only adds margins and labels.

The independent binary verifier passed all **72 files**, with **zero errors and warnings**. It checks manifest coverage, actual indexed triangle counts, budgets, finite positions/unit normals, zero degenerate triangles, no unreferenced vertices, material names, grounding, actual dimensions, original anchors, joint hierarchy, identity rest transforms and mesh ownership. Every GLB also re-imported in Blender and passed a second triangle-area check. The pine tip was refined after that stricter re-import check found a numerical sliver.

The preview sheets were inspected against the target and each other. Required poses remain connected, body silhouettes are distinct, all props fit their preview frames, and tube/edge artifacts found during review were corrected.

Evidence: `previews/validation.json`, `previews/blender-reimport.json`, and `previews/preview-composition.json`. Preliminary audit files and the reference audit are retained separately; the two final reports above describe the shipped library.

## Reproduction

The modelling sources are `build_bodies.py`, `build_existing.py` and `build_new.py`. Each exposes `build(...)` and `run(...)` for Blender Python. They replace the working scene, so run them in an empty scene or one of this delivery's own sources. `render_library.py` imports the GLBs to produce previews and the animated pose-test source.

After any re-export, run from the repository root:

```sh
python3 models-src/assemble_manifest.py
python3 models-src/verify_library.py
python3 models-src/compose_previews.py --all
```

Regenerate affected Blender renders before composing sheets. Python composition needs Pillow; independent verification/manifest assembly needs NumPy. Both were already available. No app code or git state was touched.
