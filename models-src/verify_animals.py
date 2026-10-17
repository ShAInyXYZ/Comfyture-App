#!/usr/bin/env python3
"""Independently verify batch 3's six delivered animal GLBs in Blender.

Run ``python3 models-src/verify_animals.py`` from any directory. The launcher
uses the installed Blender, or ``--blender /path/to/blender``. It can also run
directly with Blender's ``--background --python ... --`` arguments. The binary
checks do not import any modelling helpers. Re-import checks evaluate the actual
deformed meshes at every 24-fps frame and every intervening half frame, including
both endpoints. This script writes only its JSON report, never model files.

Numeric validation complements the required visual review: geometry alone
cannot prove that a silhouette looks like a particular cute baby animal.
"""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import traceback

ROOT = Path(__file__).resolve().parents[1]
HEIGHTS = {"baby-chick": .30, "baby-squirrel": .36, "puppy": .40,
           "kitten": .36, "bunny": .36, "piglet": .34}
CLIPS = ["stand", "sit", "lie", "walk", "hop"]
MATERIALS = ["body", "accent", "eye"]
GROUND_TOLERANCE = .01
PENETRATION_TOLERANCE = .0002
CENTER_TOLERANCE = .002
SIZE_TOLERANCE = .001
LOOP_TOLERANCE = .00002
DTYPES = {5120: "i1", 5121: "u1", 5122: "<i2", 5123: "<u2", 5125: "<u4", 5126: "<f4"}
WIDTHS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT2": 4, "MAT3": 9, "MAT4": 16}


class GLB:
    def __init__(self, path):
        blob = path.read_bytes()
        magic, version, length = struct.unpack_from("<III", blob)
        if magic != 0x46546C67 or version != 2 or length != len(blob):
            raise ValueError("Not a complete GLB version 2 file")
        self.document, self.binary = None, None
        offset = 12
        while offset < len(blob):
            size, kind = struct.unpack_from("<II", blob, offset)
            offset += 8
            chunk = blob[offset:offset + size]
            if len(chunk) != size:
                raise ValueError("Truncated GLB chunk")
            if kind == 0x4E4F534A:
                self.document = json.loads(chunk.decode("utf-8").rstrip(" \0"))
            elif kind == 0x004E4942:
                self.binary = chunk
            offset += size
        if self.document is None or self.binary is None:
            raise ValueError("GLB must contain JSON and an embedded binary buffer")
        self.sha256 = hashlib.sha256(blob).hexdigest()

    def accessor(self, index):
        import numpy as np
        data = self.document["accessors"][index]
        if "sparse" in data:
            raise ValueError("Sparse accessors are not supported by this verifier")
        view = self.document["bufferViews"][data["bufferView"]]
        if view.get("buffer", 0) != 0:
            raise ValueError("External buffers are not self-contained")
        dtype = np.dtype(DTYPES[data["componentType"]])
        width, count = WIDTHS[data["type"]], data["count"]
        offset = view.get("byteOffset", 0) + data.get("byteOffset", 0)
        stride = view.get("byteStride", width * dtype.itemsize)
        result = np.ndarray((count, width), dtype=dtype, buffer=self.binary,
                            offset=offset, strides=(stride, dtype.itemsize)).copy()
        if data.get("normalized"):
            if dtype.kind == "u":
                result = result.astype(float) / np.iinfo(dtype).max
            elif dtype.kind == "i":
                result = np.maximum(result.astype(float) / np.iinfo(dtype).max, -1)
        return result


def check(errors, condition, message):
    if not condition:
        errors.append(message)


def binary_checks(path, entry, report):
    import numpy as np
    errors = report["errors"]
    glb = GLB(path)
    doc = glb.document
    report["sha256"] = glb.sha256
    check(errors, not doc.get("cameras"), "GLB contains a camera")
    check(errors, not doc.get("extensions", {}).get("KHR_lights_punctual"), "GLB contains lights")
    check(errors, not doc.get("textures") and not doc.get("images"), "GLB contains textures/images")
    check(errors, all("uri" not in buffer for buffer in doc.get("buffers", [])), "External buffer dependency")
    material_names = [item.get("name") for item in doc.get("materials", [])]
    check(errors, Counter(material_names) == Counter(MATERIALS), f"Materials must be exactly {MATERIALS}; got {material_names}")
    report["materials"] = material_names
    for material in doc.get("materials", []):
        name = material.get("name")
        pbr = material.get("pbrMetallicRoughness")
        check(errors, pbr is not None, f"{name}: missing PBR material")
        if pbr:
            roughness = pbr.get("roughnessFactor", 1)
            check(errors, .15 <= roughness <= .55, f"{name}: roughness {roughness} outside glossy-vinyl range")
            check(errors, pbr.get("metallicFactor", 1) <= .01, f"{name}: vinyl must not be metallic")
            if name == "eye":
                colour = pbr.get("baseColorFactor", [1, 1, 1, 1])
                check(errors, max(colour[:3]) <= .08, "Eye material is not a plain near-black colour")
        check(errors, "KHR_materials_unlit" not in material.get("extensions", {}), f"{name}: unlit material")
        check(errors, material.get("alphaMode", "OPAQUE") == "OPAQUE", f"{name}: translucent material")
        check(errors, "Texture" not in json.dumps(material), f"{name}: texture input")

    mesh_nodes = [node for node in doc.get("nodes", []) if "mesh" in node]
    node_names = [node.get("name") for node in mesh_nodes]
    check(errors, Counter(node_names) == Counter(["Body", "Eye.L", "Eye.R"]),
          f"Expected one Body and two eye mesh nodes, got {node_names}")
    check(errors, len(doc.get("skins", [])) == 1, f"Expected one skeleton skin, got {len(doc.get('skins', []))}")
    nodes_by_name = {node.get("name"): node for node in doc.get("nodes", [])}
    for required in ["Root", "Spine", "Chest", "Head"]:
        check(errors, required in nodes_by_name, f"Missing skeleton node {required}")
    for node in mesh_nodes:
        if node.get("name") == "Body":
            check(errors, "skin" in node, "Body mesh is not skinned")
    skin_joints = set(doc.get("skins", [{}])[0].get("joints", [])) if doc.get("skins") else set()
    for name in ["Root", "Spine", "Chest", "Head"]:
        idx = next((i for i, node in enumerate(doc.get("nodes", [])) if node.get("name") == name), None)
        check(errors, idx in skin_joints, f"{name} is not a skin joint")

    triangles = 0
    blended_vertices = 0
    for node in mesh_nodes:
        mesh = doc["meshes"][node["mesh"]]
        for primitive in mesh.get("primitives", []):
            check(errors, primitive.get("mode", 4) == 4, f"{node['name']}: primitive is not triangles")
            check(errors, "indices" in primitive, f"{node['name']}: expected indexed triangles")
            if "indices" not in primitive:
                continue
            indices = glb.accessor(primitive["indices"]).ravel()
            check(errors, len(indices) % 3 == 0, "Triangle index count is not divisible by three")
            triangles += len(indices) // 3
            positions = glb.accessor(primitive["attributes"]["POSITION"])
            check(errors, bool(np.isfinite(positions).all()), "Nonfinite vertex coordinates")
            check(errors, bool(np.all(indices < len(positions))), "Out-of-range triangle index")
            check(errors, "NORMAL" in primitive["attributes"], "Missing smooth normals")
            if "NORMAL" in primitive["attributes"]:
                normals = glb.accessor(primitive["attributes"]["NORMAL"])
                check(errors, bool(np.isfinite(normals).all()) and bool(np.allclose(np.linalg.norm(normals, axis=1), 1, atol=.002)),
                      "Nonfinite or nonunit vertex normals")
            if len(indices) % 3 == 0 and np.all(indices < len(positions)):
                tri = positions[indices.reshape(-1, 3)]
                areas = np.linalg.norm(np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0]), axis=1) / 2
                check(errors, bool(np.all(areas > 1e-12)), f"{node['name']}: zero-area triangles")
            attributes = primitive["attributes"]
            if node.get("name") == "Body":
                check(errors, "WEIGHTS_0" in attributes and "JOINTS_0" in attributes, "Body primitive lacks joint weights")
                if "WEIGHTS_0" in attributes:
                    weights = glb.accessor(attributes["WEIGHTS_0"])
                    check(errors, bool(np.isfinite(weights).all()) and bool(np.all(weights >= 0)) and bool(np.allclose(weights.sum(axis=1), 1, atol=.002)),
                          "Invalid or unnormalized skin weights")
                    blended_vertices += int(np.count_nonzero((weights > .02).sum(axis=1) >= 2))
            if node.get("name", "").startswith("Eye."):
                material = doc["materials"][primitive.get("material", 0)].get("name")
                check(errors, material == "eye", f"{node['name']}: eye does not use eye material")
    check(errors, 0 < triangles <= 8000, f"Triangle count {triangles} outside 1–8000 budget")
    check(errors, triangles == entry.get("triangles"), f"Manifest triangles {entry.get('triangles')} != actual indexed count {triangles}")
    check(errors, blended_vertices > 0, "Body has no smoothly blended skin weights")
    report.update(triangles=triangles, blended_skin_vertices=blended_vertices)

    animations = doc.get("animations", [])
    names = [animation.get("name") for animation in animations]
    check(errors, Counter(names) == Counter(CLIPS), f"Expected exactly five named clips, got {names}")
    report["binary_clips"] = {}
    for animation in animations:
        name = animation.get("name")
        check(errors, bool(animation.get("channels")), f"{name}: empty animation")
        times = [glb.accessor(sampler["input"]).ravel() for sampler in animation.get("samplers", [])]
        if not times:
            continue
        all_times = np.concatenate(times)
        start, end = float(all_times.min()), float(all_times.max())
        duration = end - start
        report["binary_clips"][name] = {"start_seconds": start, "end_seconds": end, "duration_seconds": duration,
                                         "unique_key_times": len(np.unique(all_times))}
        check(errors, bool(np.isfinite(all_times).all()), f"{name}: nonfinite animation times")
        check(errors, all(bool(np.all(np.diff(t) > 0)) for t in times), f"{name}: non-increasing sampler times")
        if name in ("walk", "hop"):
            check(errors, abs(duration - 1) <= 1e-5, f"{name}: duration {duration:.8f}s is not 1s")
            check(errors, bool(np.allclose((all_times - start) * 24, np.round((all_times - start) * 24), atol=2e-4)),
                  f"{name}: key times are not on a 24-fps grid")
    return glb


def activate_clip(objects, name):
    """Use the importer's stashed action and slot, including Blender 5.2 slots."""
    bound = 0
    for obj in objects:
        animation = obj.animation_data
        if animation is None:
            continue
        animation.action = None
        for track in animation.nla_tracks:
            track.mute = True
            if track.name == name and track.strips:
                strip = track.strips[0]
                animation.action = strip.action
                if hasattr(strip, "action_slot"):
                    animation.action_slot = strip.action_slot
                bound += 1
    return bound


def evaluated_geometry(meshes):
    import bpy
    import numpy as np
    depsgraph = bpy.context.evaluated_depsgraph_get()
    coordinates = {}
    for obj in meshes:
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        try:
            values = np.empty(len(mesh.vertices) * 3, dtype=np.float64)
            mesh.vertices.foreach_get("co", values)
            values = values.reshape(-1, 3)
            matrix = np.array(evaluated.matrix_world, dtype=float)
            coordinates[obj.name] = values @ matrix[:3, :3].T + matrix[:3, 3]
        finally:
            evaluated.to_mesh_clear()
    return coordinates


def import_checks(path, entry, report):
    import bpy
    import numpy as np
    from mathutils import Vector
    errors = report["errors"]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    check(errors, len(bpy.data.objects) == 0 and len(bpy.data.actions) == 0,
          "Isolated re-import scene retains objects or actions from another file")
    scene = bpy.context.scene
    scene.render.fps = 24
    scene.render.fps_base = 1
    # Blender 5.2 otherwise creates an unrelated hidden Icosphere as the bone
    # display shape. Disabling that UI helper keeps bounds asset-only.
    bpy.ops.import_scene.gltf(filepath=str(path), disable_bone_shape=True)
    imported_actions = [action.name for action in bpy.data.actions]
    check(errors, Counter(imported_actions) == Counter(CLIPS),
          f"Imported action datablocks differ from this GLB's five clips: {imported_actions}")
    report["imported_actions"] = imported_actions
    objects = list(scene.objects)
    meshes = [obj for obj in objects if obj.type == "MESH"]
    rigs = [obj for obj in objects if obj.type == "ARMATURE"]
    check(errors, len(meshes) == 3, f"Re-import has {len(meshes)} meshes, expected three")
    check(errors, len(rigs) == 1, f"Re-import has {len(rigs)} armatures, expected one")
    check(errors, not any(obj.type in {"CAMERA", "LIGHT"} for obj in objects), "Re-import contains a camera/light")
    if len(rigs) != 1 or not {"Body", "Eye.L", "Eye.R"}.issubset({obj.name for obj in meshes}):
        return
    rig = rigs[0]
    body = next(obj for obj in meshes if obj.name == "Body")
    check(errors, any(modifier.type == "ARMATURE" and modifier.object == rig for modifier in body.modifiers), "Body lacks armature deformation on re-import")
    for required in ("Root", "Spine", "Chest", "Head"):
        check(errors, required in rig.data.bones, f"Re-import is missing {required} bone")
    if not {"Root", "Head"}.issubset(rig.data.bones.keys()):
        return
    root = rig.data.bones["Root"]
    check(errors, root.parent is None, "Root bone is not the skeleton root")
    root_rest_world = rig.matrix_world @ root.head_local
    check(errors, root_rest_world.length <= .01, f"Root rest origin is not at ground centre: {list(root_rest_world)}")
    report["rig"] = {"name": rig.name, "bones": len(rig.data.bones), "bone_names": list(rig.data.bones.keys()),
                     "root_rest_world_blender": list(root_rest_world)}
    check(errors, all(poly.use_smooth for poly in body.data.polygons), "Re-imported Body contains flat-shaded polygons")
    head_group = body.vertex_groups.get("Head")
    head_indices = []
    if head_group:
        for vertex in body.data.vertices:
            if any(group.group == head_group.index and group.weight >= .5 for group in vertex.groups):
                head_indices.append(vertex.index)
    check(errors, bool(head_indices), "Cannot establish facing: no Body vertices weighted >=0.5 to Head")
    rest_object_transforms = {obj.name: (obj.location.copy(), obj.rotation_quaternion.copy(), obj.rotation_euler.copy(), obj.scale.copy()) for obj in objects}
    report["clips"] = {}
    for name in CLIPS:
        if name not in report["binary_clips"]:
            continue
        for obj in objects:
            if obj.animation_data:
                obj.animation_data.action = None
            loc, quat, euler, scale = rest_object_transforms[obj.name]
            obj.location, obj.rotation_quaternion, obj.rotation_euler, obj.scale = loc, quat, euler, scale
        for bone in rig.pose.bones:
            bone.matrix_basis.identity()
        bound = activate_clip(objects, name)
        check(errors, bound > 0, f"{name}: no imported action slot could be activated")
        timing = report["binary_clips"][name]
        # glTF seconds import to frame zero at 24 fps, independent of scene start.
        start, end = timing["start_seconds"] * 24, timing["end_seconds"] * 24
        count = max(1, int(round((end - start) * 2)) + 1)
        sample_frames = np.linspace(start, end, count)
        sample_records = []
        endpoint_geometry, endpoint_bones = [], []
        minimums, centering, facing_scores, root_turns = [], [], [], []
        variation = 0.0
        first_geometry = None
        for frame in sample_frames:
            whole = math.floor(float(frame))
            scene.frame_set(whole, subframe=float(frame) - whole)
            bpy.context.view_layer.update()
            geometry = evaluated_geometry(meshes)
            all_vertices = np.concatenate(list(geometry.values()))
            lower, upper = all_vertices.min(axis=0), all_vertices.max(axis=0)
            centre = (lower + upper) / 2
            minimums.append(float(lower[2]))
            centering.append(float(max(abs(centre[0]), abs(centre[1]))))
            sample_records.append({"frame": round(float(frame), 5), "ground_m": round(float(lower[2]), 8),
                                   "centre_xz_m": [round(float(centre[0]), 8), round(float(-centre[1]), 8)]})
            if first_geometry is None:
                first_geometry = all_vertices.copy()
            else:
                variation = max(variation, float(np.linalg.norm(all_vertices - first_geometry, axis=1).max()))
            if head_indices:
                head_centre = geometry["Body"][head_indices].mean(axis=0)
                left_eye = geometry["Eye.L"].mean(axis=0)
                right_eye = geometry["Eye.R"].mean(axis=0)
                direction = (left_eye + right_eye) / 2 - head_centre
                length = float(np.linalg.norm(direction[:2]))
                facing_scores.append(float(-direction[1] / length) if length > 1e-8 else -1)
                check(errors, left_eye[0] > right_eye[0], f"{name} frame {frame:g}: eye pair reversed from +Z-facing convention")
            pose_root = rig.pose.bones["Root"]
            root_delta = pose_root.matrix.to_3x3() @ root.matrix_local.to_3x3().inverted()
            forward = root_delta @ Vector((0, -1, 0))
            root_turns.append(abs(math.degrees(math.atan2(forward.x, -forward.y))))
            if frame == sample_frames[0] or frame == sample_frames[-1]:
                endpoint_geometry.append(all_vertices.copy())
                endpoint_bones.append(np.array([rig.matrix_world @ bone.matrix for bone in rig.pose.bones]))
            if name == "stand" and frame == sample_frames[0]:
                size = upper - lower
                gltf_size = [float(size[0]), float(size[2]), float(size[1])]
                report["stand_size_m"] = gltf_size
                check(errors, len(entry.get("size", [])) == 3 and bool(np.allclose(gltf_size, entry["size"], atol=SIZE_TOLERANCE, rtol=0)),
                      f"Stand size {gltf_size} differs from manifest {entry.get('size')}")
                check(errors, abs(gltf_size[1] - HEIGHTS[entry["type"]]) <= SIZE_TOLERANCE,
                      f"Stand height {gltf_size[1]:.6f} differs from required {HEIGHTS[entry['type']]:.2f}m")
        check(errors, min(minimums) >= -PENETRATION_TOLERANCE,
              f"{name}: lowest vertex penetrates ground by {-min(minimums):.6f}m")
        check(errors, max(abs(value) for value in minimums) <= GROUND_TOLERANCE,
              f"{name}: ground contact exceeds 1cm (range {min(minimums):.6f}–{max(minimums):.6f}m)")
        check(errors, max(centering) <= CENTER_TOLERANCE, f"{name}: horizontal bounds centre drifts {max(centering):.6f}m")
        minimum_facing = min(facing_scores) if facing_scores else None
        check(errors, minimum_facing is None or minimum_facing >= .9,
              f"{name}: eye/head geometry does not face +Z (minimum dot {minimum_facing})")
        check(errors, max(root_turns) <= 10, f"{name}: Root turns away from +Z by {max(root_turns):.4f} degrees")
        clip_report = {"sample_count": count, "ground_range_m": [min(minimums), max(minimums)],
                       "max_horizontal_centre_error_m": max(centering), "minimum_front_dot": min(facing_scores) if facing_scores else None,
                       "max_root_yaw_degrees": max(root_turns), "maximum_vertex_displacement_m": variation,
                       "frames": sample_records}
        clip_report["action_bindings"] = [
            {"object": obj.name, "action": obj.animation_data.action.name,
             "slot": obj.animation_data.action_slot.identifier if obj.animation_data.action_slot else None}
            for obj in objects if obj.animation_data and obj.animation_data.action
        ]
        if name in ("walk", "hop"):
            geometry_delta = float(np.linalg.norm(endpoint_geometry[-1] - endpoint_geometry[0], axis=1).max())
            bones_delta = float(np.max(np.abs(endpoint_bones[-1] - endpoint_bones[0])))
            check(errors, geometry_delta <= LOOP_TOLERANCE, f"{name}: loop vertex seam {geometry_delta:.8f}m")
            check(errors, bones_delta <= LOOP_TOLERANCE, f"{name}: loop bone-transform seam {bones_delta:.8f}")
            check(errors, variation >= .001, f"{name}: loop has no meaningful animation")
            clip_report.update(loop_vertex_seam_m=geometry_delta, loop_bone_matrix_seam=bones_delta)
        else:
            check(errors, variation <= LOOP_TOLERANCE, f"{name}: held pose changes by {variation:.8f}m")
        report["clips"][name] = clip_report


def run(args):
    report = {"generated_at": datetime.now(timezone.utc).isoformat(), "passed": False,
              "scope": "Six batch 3 animals only; independent GLB binary inspection and Blender re-import evaluation",
              "fps": 24, "sample_step_frames": .5,
              "tolerances_m": {"ground_contact": GROUND_TOLERANCE, "penetration": PENETRATION_TOLERANCE,
                               "horizontal_bounds_centre": CENTER_TOLERANCE, "stand_size": SIZE_TOLERANCE,
                               "loop_vertex_seam": LOOP_TOLERANCE}, "errors": [], "animals": {}}
    errors = report["errors"]
    manifest = json.loads((ROOT / "web/models/manifest.json").read_text())
    baseline_path = ROOT / "models-src/batch3-baseline.json"
    if baseline_path.is_file():
        baseline = json.loads(baseline_path.read_text())
        current_existing = {key: value for key, value in manifest.items() if key != "animals"}
        baseline_existing = {key: value for key, value in baseline["manifest"].items() if key != "animals"}
        manifest_unchanged = current_existing == baseline_existing
        check(errors, manifest_unchanged, "Manifest content outside animals changed from the batch 3 baseline")
        changed = []
        for relative, digest in baseline["glbs"].items():
            original = ROOT / relative
            if not original.is_file() or hashlib.sha256(original.read_bytes()).hexdigest() != digest:
                changed.append(relative)
        check(errors, not changed, f"Existing GLBs changed or disappeared: {changed}")
        report["preservation"] = {"baseline": str(baseline_path.relative_to(ROOT)),
                                  "existing_glbs_checked": len(baseline["glbs"]),
                                  "changed_glbs": changed, "nonanimal_manifest_unchanged": manifest_unchanged}
    entries = manifest.get("animals", [])
    check(errors, isinstance(entries, list), "Manifest animals must be an array")
    check(errors, Counter(entry.get("type") for entry in entries) == Counter(HEIGHTS.keys()),
          f"animals array must contain exactly {list(HEIGHTS)}")
    disk_ids = {path.stem for path in (ROOT / "web/models/animals").glob("*.glb")}
    check(errors, disk_ids == set(HEIGHTS), f"animals/ GLB files differ from required six: {sorted(disk_ids)}")
    for animal_id in HEIGHTS:
        animal_report = {"errors": []}
        report["animals"][animal_id] = animal_report
        entry = next((item for item in entries if item.get("type") == animal_id), None)
        if entry is None:
            animal_report["errors"].append("Missing manifest entry")
            continue
        local_errors = animal_report["errors"]
        expected_path = f"animals/{animal_id}.glb"
        check(local_errors, entry.get("file") == expected_path, f"Manifest file must be {expected_path}")
        check(local_errors, entry.get("clips") == CLIPS, f"Manifest clips must be {CLIPS}")
        check(local_errors, entry.get("loops") == ["walk", "hop"], "Manifest loops must be walk and hop")
        check(local_errors, entry.get("materials") == MATERIALS, f"Manifest materials must be {MATERIALS}")
        check(local_errors, {"animals", "kids"}.issubset(entry.get("themes", [])), "Missing animals/kids themes")
        check(local_errors, {"baby", "cute"}.issubset(entry.get("tags", [])), "Missing baby/cute search tags")
        check(local_errors, bool(entry.get("name")), "Missing display name")
        path = ROOT / "web/models" / expected_path
        if not path.is_file():
            local_errors.append("GLB file missing")
            continue
        try:
            binary_checks(path, entry, animal_report)
            import_checks(path, entry, animal_report)
        except Exception as exc:
            local_errors.append(f"Verifier exception: {exc}")
            animal_report["traceback"] = traceback.format_exc()
        animal_report["passed"] = not local_errors
        print(f"{animal_id}: {'PASS' if not local_errors else 'FAIL'} ({len(local_errors)} errors)", flush=True)
        for error in local_errors:
            print(f"  {error}", flush=True)
    report["error_count"] = len(errors) + sum(len(animal["errors"]) for animal in report["animals"].values())
    report["passed"] = report["error_count"] == 0
    import bpy
    report["blender_version"] = bpy.app.version_string
    output = Path(args.report).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + "\n")
    print(f"Batch 3: {'PASS' if report['passed'] else 'FAIL'} — {len(report['animals'])} animals, {report['error_count']} errors. Report: {output}", flush=True)
    return 0 if report["passed"] else 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", default=str(ROOT / "models-src/previews/batch3-validation.json"))
    parser.add_argument("--blender", default=shutil.which("blender"))
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    args = parser.parse_args(argv)
    try:
        import bpy  # noqa: F401
    except ImportError:
        if not args.blender:
            parser.error("Blender was not found; provide --blender /path/to/blender")
        command = [args.blender, "--background", "-noaudio", "--factory-startup", "--python-exit-code", "1",
                   "--python", str(Path(__file__).resolve()), "--", "--report", str(Path(args.report).resolve())]
        return subprocess.run(command, check=False).returncode
    return run(args)


if __name__ == "__main__":
    code = main()
    try:
        import bpy
    except ImportError:
        pass
    else:
        if bpy.app.background:
            # This host's PulseAudio teardown can hang even with -noaudio.
            # The isolated read-only verifier has already written and closed its
            # report, so bypass unrelated Blender shutdown handlers. Preserve
            # the true verification exit status; never do this in the live UI.
            sys.stdout.flush()
            sys.stderr.flush()
            os._exit(code)
    if code:
        raise SystemExit(code)
