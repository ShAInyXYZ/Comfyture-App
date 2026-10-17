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

## Batch 2

Delivered 17 October 2026: **321 new set pieces — all 233 P1 and all 88 P2**, including the separately requested watch stand. **98** pieces also have right/left hand grips and compatible pose IDs. No P2 pieces were omitted. The manifest now contains 372 assets, 10 original hand props and eight bodies; including the three existing modules, the library has **393 GLB files**.

| Category | New pieces | Triangle range |
|---|---:|---:|
| Food | 57 | 132–1,838 |
| Objects | 70 | 284–4,760 |
| Products | 52 | 44–2,464 |
| Studio | 21 | 624–3,360 |
| Furniture | 39 | 644–5,756 |
| Vehicles | 8 | 2,332–10,340 |
| Outdoor | 42 | 360–4,468 |
| Architecture | 4 | 960–5,184 |
| Fantasy | 19 | 640–4,728 |
| Creatures | 9 | 1,550–7,372 |

### Files and finish

New files are `web/models/props/<type>.glb`. The original 72 GLBs are byte-for-byte unchanged, verified against SHA-256 values recorded before work in `batch1-baseline.json`. Existing asset, module and hand-prop records gained only `themes` and `tags`; their remaining metadata is unchanged. No app files, git operations, system packages or external asset services were used.

Each new piece has its own editable `blender/batch2-<type>.blend`. `blender/batch2-held.blend` contains the delivered adult mannequin holding the mug. The modelling sources are `batch2_food_products.py`, `batch2_home_studio.py` and `batch2_world.py`, using `batch2_common.py` and the `build_batch2.py` entry point. Representative models and the final preview/attachment passes were run through the connected Blender MCP session; bulk exports and re-import verification also used the same Blender 5.2.1 binary headlessly.

The batch matches the first library: metre-scale named parts, softened manufactured edges, opaque matte `prop` and optional `accent`, geometry-only bands and details, and no textures or UVs. Hollow cups, bowls, sink openings, the toilet, kayak and wheelbarrow have actual interior geometry. Final corner normals are rebuilt after welding and triangulation, preventing stale custom normals from striping curved bands. Small objects peak at 2,472 / 2,500 triangles; medium pieces at 5,756 / 6,000; vehicles at 10,340 / 15,000; creatures at 7,372 / 12,000.

### Placement and attachment

Every new asset has a single identity root at its base centre, with actual mesh bounds centred on X/Z and grounded at Y=0. Coordinates remain +Y up and +Z forward. `size` is [width, height, depth]. Seat anchors and usable top surfaces account for the final centring translation. Hanging or mounted pieces (pendant, awning, curtains, wall cabinets and boards) are supplied as grounded standalone components; place them at the desired installation height. Creatures are unrigged standing/sitting blockouts. Cloth/backdrop panels and facade components are intentionally thin; windows, mirrors and glass are opaque accent clay for depth/normal passes.

Unlike batch 1’s palm-origin hand GLBs, batch 2 holdables retain their **base-origin** set-piece geometry. Apply `holdable.grips[hand]` to a holder parented under the named hand joint. The supplied quaternion is [x,y,z,w]; preserve the left grip’s `scale: [-1,1,1]`. `holdable.gripPoint` is the contact point in the piece’s base frame, and `referenceSocket` is the adult reference socket. Both transformed contact points are independently verified against [-.075,-.018,0] for the right hand and [.075,-.018,0] for the left.

**Integration detail for non-default hand sizes:** preserve the object’s physical dimensions and scale only the socket component of the holder translation:

```js
position = grip.position + (bodySocket - holdable.referenceSocket[hand]);
// If the loader has a scalar k instead of bodySocket:
position = grip.position + (k - 1) * holdable.referenceSocket[hand];
```

These are vector operations. The current `web/js/control/mannequin.js` scales the entire `grip.position` in `setHold`; that remains correct for batch 1 palm-origin props, but for batch 2 it also scales the base-to-grip compensation. Use the formula above for `assets[].holdable` when adapting the loader. The reference adult (k=1) already uses the recorded transform directly. App code was not changed, as requested. The current model loader already discovers manifest assets and their holdable grips.

The hands remain batch 1’s rigid open mittens. Attachment previews show actual contact and intentional rigid intersections, not articulated fingers. Wrist orientation and a supporting second hand are pose/shot choices.

### P2 coverage

All optional pieces were made:
- **Food and drink**: `birthday-cake`, `salad-bowl`, `spaghetti-plate`, `soup-bowl`, `egg-carton`, `watermelon`, `pineapple`, `grapes`, `vegetable-crate`, `wine-rack`, `beer-keg`, `sushi-tray`, `cheese-board`.
- **Kitchen appliances and ware**: `stand-mixer`, `rice-cooker`, `spice-rack`, `dish-rack`.
- **Products and advertising**: `nail-polish`, `makeup-palette`, `razor`, `toothbrush`, `toothpaste`, `deodorant`, `sports-bottle`, `protein-tub`, `coffee-bag`, `chocolate-bar`, `chips-bag`, `medicine-bottle`, `drone`, `action-camera`, `power-bank`, `keyboard`, `computer-mouse`, `ring-box`, `necklace-bust`.
- **Studio and production**: `jib-crane`, `teleprompter`, `makeup-mirror`, `film-light`.
- **Home and daily life**: `dining-set`, `sectional-sofa`, `bean-bag`, `wardrobe-open`, `mirror-round`, `shoe-rack`, `coat-stand`, `alarm-clock`, `candles`, `cushion`.
- **Street and city**: `pickup-truck`, `taxi`, `tram`, `newspaper-stand`, `drinking-fountain`, `crosswalk-sign`, `bus-shelter-ad`, `electric-car-charger`.
- **Retail and hospitality**: `luggage-trolley`, `coat-check`, `buffet-table`, `high-table`.
- **Sports, music and leisure**: `bowling-pin`, `boxing-bag`, `bench-press`, `keyboard-stand`, `violin`, `saxophone`.
- **Nature, beach, camping and garden**: `fallen-tree`, `mushroom-cluster`, `sandcastle`, `garden-shed`, `garden-hose`, `birdhouse`, `hammock`.
- **Medical, school and office**: `lab-bench`, `microscope`, `server-rack`, `desk-phone`.
- **Fantasy and genre**: `sci-fi-crate`, `control-console`, `cauldron`, `banner-pole`, `weapon-rack`.
- **Creatures**: `cow`, `chicken`, `fish`, `deer`.

Omitted P2 pieces: **none**.

### Previews and verification

`previews/batch2-<category>.png` provides ten category sheets covering all 321 pieces, in batch 1’s sheet typography, lighting and clay treatment. `batch2-held.png` contains 12 actual right-mitten attachment close-ups; `batch2-held-mannequin.png` shows a complete posed mannequin. Individual render tiles are retained. Sheets are composed from unaltered renders of the delivered GLBs, with labels and margins added outside the renders.

Final evidence:

- `previews/batch2-validation.json`: **393 files, zero errors, zero warnings**. Coverage includes all P1/P2 IDs, unique paths, themes/tags, both grips and contact transforms, dimensions, grounding, budgets, finite unit normals, no degenerate triangles, no unreferenced vertices, material names, existing skeleton/anchor contracts, and original-file/metadata preservation.
- `previews/batch2-blender-reimport.json`: **393 of 393 files pass** Blender re-import, actual triangle counts, dimensions and the stricter triangle-area check. Batch 2 dimensions agree within 0.2 mm; legacy files retain batch 1’s declared-envelope tolerance.
- `previews/preview-composition.json`: sheet sources and hashes.
- `previews/batch2-review.json`: final coverage, image freshness and visual review record.

All category sheets and the held sheet were checked by eye. Iteration corrected handle contacts, hollow basins, foliage silhouettes, cloth clearance, chair orientation, board supports, creature contours and the final normal shading.

### Rebuild

In Blender Python, with `models-src` on `sys.path`:

```python
import build_batch2
build_batch2.run(group="food_products")  # or home_studio / world
build_batch2.write_spec()
```

Each group writes only its own new GLBs, sources and measured metadata. For a targeted rebuild, pass `ids=["mug"]` with the owning group. Then, from the repository root:

```sh
python3 models-src/assemble_batch2.py
python3 models-src/verify_library.py --report models-src/previews/batch2-validation.json
```

Use `render_batch2.tiles()` in Blender to regenerate missing/stale GLB tiles, `render_batch2.held()` and `full_hold_source()` for hand previews, and `render_batch2.reimport()` for the import pass. Finish with `python3 models-src/compose_batch2.py`. The original `assemble_manifest.py` also preserves the batch 2 additions through the shared assembly routine. The machine-readable checklist is `batch2-requirements.json`; authored budgets and priorities are recorded in `batch2-spec.json`.

## Batch 3

Delivered 18 October 2026: **six baby animals**, authored from scratch in the connected Blender 5.2.1 session against `reference/cute-style.png`. The previous bipedal attempt remains set aside in `blender/batch3-bipedal/`; its objects were removed from the open scene, and none of its geometry or rigs were reused.

| Animal | Stand height | Triangles | Natural form |
|---|---:|---:|---|
| Baby chick | 0.30 m | 5,696 | One egg-shaped body/head, wing nubs, a small orange beak and two little feet |
| Baby squirrel | 0.36 m | 7,480 | Seated haunches, tiny front paws, round ears and a large smooth tail curling up its back |
| Puppy | 0.40 m | 7,392 | Low rounded loaf on four short legs, a large head, floppy ears and a tiny tail |
| Kitten | 0.36 m | 7,424 | Four short legs, a large head, rounded triangular ears and a long curved tail |
| Bunny | 0.36 m, ears included | 7,512 | Round seated body, long rounded ears, little paws and a pom-pom tail |
| Piglet | 0.34 m | 7,812 | Round loaf on four tiny legs, folded ears, a flat oval snout and a curly tail |

The production files are `web/models/animals/<id>.glb`; IDs are `baby-chick`, `baby-squirrel`, `puppy`, `kitten`, `bunny` and `piglet`. A new top-level `animals` array in `web/models/manifest.json` records paths, measured stand dimensions, actual indexed triangle counts, clips, loops, themes, tags and materials. All 393 earlier GLBs and all existing manifest entries remain unchanged, checked against `batch3-baseline.json`. No application code, git state or system packages were changed.

### Shape, material and rig

Each animal has one skinned `Body` mesh, two separate plain `Eye.L` / `Eye.R` meshes weighted to `Head`, and its own natural `AnimalRig`. Large rounded masses and overlapping appendage volumes share one body mesh; smooth weight blends across the torso and two-bone limbs keep deformation soft. There are no mouths, blush, patches, stripes, spots, fur, whiskers, toes, eye-highlight meshes, textures or external dependencies.

The three PBR materials are exactly `body`, `accent` and `eye`. Body and accent roughness are 0.4; eyes are near-black glossy dots with roughness 0.28. Highlights come from lighting. Smooth normals are exported. The GLBs contain no cameras or lights.

`Root` starts at the ground under the model centre, followed by `Spine`, `Chest` and `Head`. The chick has two two-bone leg chains and wing bones. The other animals have their own fore/hind two-bone chains, ears and tail; the squirrel and kitten also have a tail-tip bone. These are animal skeletons, not the earlier 21-joint mannequin hierarchy. Head scale compensation keeps the mammals' heads round during body movement. Everything needed for playback is baked into the exported clips; no runtime IK or constraints are required.

### Clips and integration

Every GLB contains exactly **`stand`, `sit`, `lie`, `walk`, `hop`**. `stand`, `sit` and `lie` are still clips with two identical keys at frames 1 and 2. Squirrel and bunny `stand` is their normal upright seated stance. The resting poses recline or tuck the body and keep visible supporting paws on the floor.

`walk` and `hop` are one-second, 24-fps loops with matching endpoints at frames 1 and 25. Walking is in place. **`hop` is a grounded squash/stretch bounce**: the brief explicitly requires contact with the floor in every frame, so there is no airborne interval. Animated contact clearance is approximately 0.6 mm to keep interpolated frames above the floor; held poses touch zero. Small baked `Root` translations keep the evaluated bounds centred and grounded. Preserve these tracks; they are pose compensation, not travel/root motion.

For the loader, discover entries from `manifest.animals`, resolve `file` relative to `/models/`, and load each GLB with its skin and animations. Models are already in metres, **+Y up, facing +Z**, centred on X/Z; `size` is `[width, height, depth]` in `stand`. Use an animation mixer and select clips by exact name. Play still poses once and hold/clamp their final frame; repeat `walk` and `hop`. Move the containing model object along the Stage timeline for travel. Clone the skeleton as well as the scene when instancing a skinned animal (for example, Three.js `SkeletonUtils.clone`). The existing humanoid pose presets must not be applied to these rigs. App integration itself is intentionally outside this batch.

### Sources, previews and checks

Editable native sources are `blender/animal-<id>.blend`. `blender/batch3-animals-review.blend` presents the six delivered GLBs together and is left open in Blender; `blender/batch3-preview-<id>.blend` retains each animal's studio setup and imported clips. The modelling and animation source is `build_animals.py`, with per-animal measured metadata in `animal-<id>-metadata.json`.

- `previews/batch3-animals.png`: all six in `stand`, side by side at one world scale and in a soft three-quarter studio view, with the supplied reference beside the modelled chick.
- `previews/batch3-poses.png`: six rows by five clips; walk and hop show the 0.50-second frame.
- `previews/animals-tiles/`: actual GLB renders used by both sheets; composition only adds labels, margins and the supplied reference.
- `previews/batch3-render-evidence.json` and `previews/batch3-preview-composition.json`: render source hashes and sheet composition evidence.
- `previews/batch3-validation.json`: independent binary checks plus Blender re-import, **six passes and zero errors**. Every frame and intervening half frame is evaluated for contact and centring. Exact clip names/timing, loop seams, orientation, stand size/height, skin/eye structure, material names, texture absence and triangle limits are checked. The report also verifies preservation of the earlier library and records each imported action binding.

Both sheets were visually reviewed against the reference for species silhouettes, restrained detail, rounded shapes, paw contact and distinct resting poses. Final validation found exact loop endpoint agreement, less than 0.7 mm ground clearance and less than 0.2 mm horizontal centring error.

Rebuild from the repository root (Blender is already installed):

```sh
blender -b -noaudio --python models-src/build_animals.py
python3 models-src/verify_animals.py
blender -b -noaudio --python models-src/render_animals.py -- --force
python3 models-src/compose_animals.py
```

In the open Blender Python session, put `models-src` on `sys.path`, then use `build_animals.run()` or `build_animals.run(ids=["puppy"])`. The builder replaces only its own `Batch3.Animal` collection, writes only the six animal deliveries and refreshes the `animals` manifest member. Re-render and re-verify after changes. The verifier exits its isolated background process after flushing the report to avoid this host's unrelated PulseAudio shutdown hang.
