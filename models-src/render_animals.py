"""Render batch 3 from the delivered GLBs using Blender, without restyling them.

From Blender Python::

    import render_animals
    render_animals.render()  # imports GLBs; writes tiles and preview sources

Or::

    blender --background --python models-src/render_animals.py -- --force

All models use the same orthographic camera and world scale. Materials, mesh
geometry, animation tracks and the ground correction remain those of the GLBs.
"""
from __future__ import annotations

import argparse
import contextlib
import hashlib
import io
import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "models-src"
OUT = SRC / "previews"
TILES = OUT / "animals-tiles"
IDS = ("baby-chick", "baby-squirrel", "puppy", "kitten", "bunny", "piglet")
CLIPS = ("stand", "sit", "lie", "walk", "hop")
RESOLUTION = 480
CAMERA_SCALE = 0.61
CAMERA_TARGET = (0.0, 0.0, 0.205)
CAMERA_DIRECTION = (0.33, -1.0, 0.40)


def clear():
    """Clear only this headless preview scene and its orphaned datablocks."""
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    # Imported actions retain fake users. Always remove them in this isolated
    # preview scene, otherwise the next GLB gets .001 action names and an old
    # animal's exact-name action can be selected accidentally.
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)
    for pool in (bpy.data.meshes, bpy.data.armatures, bpy.data.materials,
                 bpy.data.cameras, bpy.data.lights,
                 bpy.data.worlds):
        for data in list(pool):
            if not data.users:
                pool.remove(data)


def import_animal(animal_id):
    clear()
    path = ROOT / "web/models/animals" / f"{animal_id}.glb"
    prior_objects = set(bpy.data.objects)
    prior_actions = set(bpy.data.actions)
    with contextlib.redirect_stdout(io.StringIO()):
        bpy.ops.import_scene.gltf(filepath=str(path), disable_bone_shape=True)
    objects = list(set(bpy.data.objects) - prior_objects)
    actions = {a.name: a for a in set(bpy.data.actions) - prior_actions}
    if set(actions) != set(CLIPS):
        raise RuntimeError(f"{animal_id}: expected exactly {CLIPS}; got {sorted(actions)}")
    for action in actions.values():
        action.use_fake_user = True
    return objects, actions, path


def pose(objects, action, clip):
    """Activate an imported glTF action, including Blender 5 action slots."""
    for ob in objects:
        ad = ob.animation_data
        if ad:
            for track in ad.nla_tracks:
                track.mute = True
            ad.action = None
    assigned = 0
    for ob in objects:
        slots = [slot for slot in action.slots
                 if slot.target_id_type == "OBJECT" and
                 (slot.identifier[2:] == ob.name or slot.name_display == ob.name)]
        if not slots and ob.type == "ARMATURE":
            # The importer may retain a GLB node name in its single rig slot.
            slots = [slot for slot in action.slots if slot.target_id_type == "OBJECT"]
            if len(slots) != 1:
                slots = []
        if slots:
            ob.animation_data_create()
            ob.animation_data.action = action
            ob.animation_data.action_slot = slots[0]
            assigned += 1
    if not assigned:
        raise RuntimeError(f"Cannot bind imported action {action.name!r} to its target")
    scene = bpy.context.scene
    scene.render.fps = 24
    # glTF import starts at frame 1. A 1 s, 24 fps clip ends at frame 25.
    # Use the actual exported range so a different importer start remains valid.
    start, end = action.frame_range
    frame = start + 12.0 if clip in ("walk", "hop") else start
    if frame > end + 0.001:
        raise RuntimeError(f"{clip}: clip shorter than 0.5 s")
    scene.frame_set(int(frame), subframe=frame % 1.0)
    bpy.context.view_layer.update()
    return float(frame)


def aim(ob, target):
    ob.rotation_euler = (Vector(target) - ob.location).to_track_quat("-Z", "Y").to_euler()


def studio(samples=32):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 6
    scene.cycles.diffuse_bounces = 3
    scene.cycles.glossy_bounces = 4
    scene.render.resolution_x = RESOLUTION
    scene.render.resolution_y = RESOLUTION
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = -0.35
    scene.view_settings.gamma = 1.0
    world = bpy.data.worlds.new("Preview.studio-world")
    world.use_nodes = True
    background = next(node for node in world.node_tree.nodes if node.type == "BACKGROUND")
    background.inputs["Color"].default_value = (1.0, 0.98, 0.94, 1.0)
    background.inputs["Strength"].default_value = 0.35
    scene.world = world

    floor_material = bpy.data.materials.new("Preview.near-white-floor")
    floor_material.use_nodes = True
    shader = next(node for node in floor_material.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    shader.inputs["Base Color"].default_value = (0.87, 0.85, 0.81, 1.0)
    shader.inputs["Roughness"].default_value = 0.8
    bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -0.0003))
    floor = bpy.context.object
    floor.name = "Preview.floor"
    floor.data.materials.append(floor_material)
    for name, position, energy, size in (
        ("key", (-0.8, -1.0, 1.4), 22, 1.3),
        ("fill", (1.0, -0.4, 0.8), 8, 1.4),
        ("rim", (0.2, 1.0, 1.3), 20, 1.0),
    ):
        data = bpy.data.lights.new("Preview." + name, "AREA")
        data.energy = energy
        data.shape = "DISK"
        data.size = size
        ob = bpy.data.objects.new(data.name, data)
        scene.collection.objects.link(ob)
        ob.location = position
        aim(ob, (0, 0, 0.17))
    data = bpy.data.cameras.new("Preview.camera")
    camera = bpy.data.objects.new(data.name, data)
    scene.collection.objects.link(camera)
    camera.location = Vector(CAMERA_TARGET) + Vector(CAMERA_DIRECTION).normalized() * 5
    aim(camera, CAMERA_TARGET)
    data.type = "ORTHO"
    data.ortho_scale = CAMERA_SCALE
    data.lens = 50
    data.clip_start = 0.01
    scene.camera = camera
    return scene


def render(ids=None, clips=None, skip=True, save_source=True, samples=32):
    """Render requested IDs/clips; default is all 30 actual GLB pose tiles."""
    TILES.mkdir(parents=True, exist_ok=True)
    (SRC / "blender").mkdir(exist_ok=True)
    selected_ids = tuple(ids or IDS)
    selected_clips = tuple(clips or CLIPS)
    renderer_hash = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    if set(selected_ids) - set(IDS) or set(selected_clips) - set(CLIPS):
        raise ValueError("Unknown animal ID or clip")
    report_path = OUT / "batch3-render-evidence.json"
    evidence = json.loads(report_path.read_text()) if report_path.exists() else {}
    evidence.update({
        "source": "Delivered GLBs, re-imported into Blender",
        "resolution": [RESOLUTION, RESOLUTION],
        "camera": {"orthographicScaleMetres": CAMERA_SCALE,
                   "target": CAMERA_TARGET, "direction": CAMERA_DIRECTION},
        "materialPolicy": "Original GLB materials, without overrides",
        "tiles": evidence.get("tiles", {}),
    })
    for animal_id in selected_ids:
        objects, actions, source = import_animal(animal_id)
        source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
        scene = studio(samples)
        for clip in selected_clips:
            dest = TILES / f"{animal_id}-{clip}.png"
            frame = pose(objects, actions[clip], clip)
            prior = evidence["tiles"].get(dest.name, {})
            fresh = (dest.exists() and prior.get("glbSha256") == source_hash and
                     prior.get("samples") == samples and
                     prior.get("rendererSha256") == renderer_hash)
            if not (skip and fresh):
                scene.render.filepath = str(dest)
                bpy.ops.render.render(write_still=True)
            evidence["tiles"][dest.name] = {
                "glb": str(source.relative_to(ROOT)), "glbSha256": source_hash,
                "clip": clip, "frame": frame, "seconds": 0.5 if clip in ("walk", "hop") else 0.0,
                "samples": samples, "sha256": hashlib.sha256(dest.read_bytes()).hexdigest(),
                "rendererSha256": renderer_hash,
            }
            report_path.write_text(json.dumps(evidence, indent=2) + "\n")
            print(f"ANIMAL_PREVIEW {animal_id} {clip} frame={frame:g} {dest}", flush=True)
        if save_source:
            pose(objects, actions["stand"], "stand")
            scene.frame_start = 1
            scene.frame_end = 25
            bpy.ops.object.select_all(action="DESELECT")
            rig = next(ob for ob in objects if ob.type == "ARMATURE")
            rig.select_set(True)
            bpy.context.view_layer.objects.active = rig
            for screen in bpy.data.screens:
                for area in screen.areas:
                    if area.type == "VIEW_3D":
                        area.spaces.active.region_3d.view_perspective = "CAMERA"
            dest = SRC / "blender" / f"batch3-preview-{animal_id}.blend"
            bpy.ops.wm.save_as_mainfile(filepath=str(dest), compress=True)
    return evidence


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ids", nargs="+", choices=IDS)
    parser.add_argument("--clips", nargs="+", choices=CLIPS)
    parser.add_argument("--samples", type=int, default=32)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--no-source", action="store_true")
    options = parser.parse_args(args)
    render(options.ids, options.clips, not options.force, not options.no_source, options.samples)
