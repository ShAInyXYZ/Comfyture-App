#!/usr/bin/env python3
"""Inspect Comfyture's delivered GLBs independently of Blender.

Run from any directory: python models-src/verify_library.py
Optional reference audit: python models-src/verify_library.py --reference
Requires Python 3 and NumPy. It never modifies an asset or application file.
The report distinguishes binary/geometry validation from the separate Blender
re-import and human visual pose review required by TASK.md.
"""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import json
from pathlib import Path
import struct
import sys
import traceback

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SPEC = ROOT / "models-src/spec"
DTYPES = {5120: "i1", 5121: "u1", 5122: "<i2", 5123: "<u2", 5125: "<u4", 5126: "<f4"}
WIDTHS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT2": 4, "MAT3": 9, "MAT4": 16}


def close(a, b, atol=2e-5, rtol=0):
    try:
        return bool(np.allclose(a, b, atol=atol, rtol=rtol))
    except (ValueError, TypeError):
        return False


def same_json(a, b):
    if isinstance(a, dict) and isinstance(b, dict):
        return set(a) == set(b) and all(same_json(a[k], b[k]) for k in a)
    if isinstance(a, (list, tuple)) and isinstance(b, (list, tuple)):
        return len(a) == len(b) and all(same_json(x, y) for x, y in zip(a, b))
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return abs(a - b) <= 1e-5
    return a == b


def finite_vector(value, length):
    return isinstance(value, (list, tuple)) and len(value) == length and bool(np.isfinite(value).all())


def matrix(node):
    if "matrix" in node:
        return np.asarray(node["matrix"], dtype=float).reshape(4, 4).T
    x, y, z, w = node.get("rotation", [0, 0, 0, 1])
    r = np.array([[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)],
                  [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)],
                  [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]])
    m = np.eye(4)
    m[:3, :3] = r @ np.diag(node.get("scale", [1, 1, 1]))
    m[:3, 3] = node.get("translation", [0, 0, 0])
    return m


class GLB:
    def __init__(self, path):
        self.path = Path(path)
        raw = self.path.read_bytes()
        assert len(raw) >= 20, "file is too short"
        magic, version, total = struct.unpack_from("<4sII", raw)
        assert magic == b"glTF" and version == 2, "not a GLB v2 file"
        assert total == len(raw), "GLB total length mismatch"
        chunks = []
        offset = 12
        while offset < total:
            length, kind = struct.unpack_from("<II", raw, offset)
            offset += 8
            assert length % 4 == 0 and offset + length <= total, "invalid GLB chunk"
            chunks.append((kind, raw[offset:offset+length]))
            offset += length
        assert chunks and chunks[0][0] == 0x4E4F534A, "first chunk is not JSON"
        self.doc = json.loads(chunks[0][1])
        bins = [data for kind, data in chunks if kind == 0x004E4942]
        assert len(bins) == 1, "must contain one embedded BIN chunk"
        self.bin = bins[0]
        buffers = self.doc.get("buffers", [])
        assert len(buffers) == 1 and "uri" not in buffers[0], "must be self-contained"
        assert buffers[0]["byteLength"] <= len(self.bin), "buffer exceeds BIN chunk"
        self.nodes = self.doc.get("nodes", [])
        self.parents = {}
        for i, node in enumerate(self.nodes):
            for child in node.get("children", []):
                assert 0 <= child < len(self.nodes), "invalid child node"
                assert child not in self.parents, "node has multiple parents"
                self.parents[child] = i
        self._world = {}
        self._accessors = {}

    def accessor(self, index):
        if index in self._accessors:
            return self._accessors[index]
        a = self.doc["accessors"][index]
        assert "sparse" not in a, "sparse accessors are not expected in this library"
        width = WIDTHS[a["type"]]
        dtype = np.dtype(DTYPES[a["componentType"]])
        view = self.doc["bufferViews"][a["bufferView"]]
        assert view.get("buffer", 0) == 0, "external buffer view"
        stride = view.get("byteStride", width*dtype.itemsize)
        offset = view.get("byteOffset", 0) + a.get("byteOffset", 0)
        assert offset + max(0, a["count"]-1)*stride + width*dtype.itemsize <= len(self.bin), "accessor exceeds buffer"
        result = np.ndarray((a["count"], width), dtype=dtype, buffer=self.bin, offset=offset,
                            strides=(stride, dtype.itemsize)).copy()
        self._accessors[index] = result
        return result

    def world(self, index, stack=()):
        assert index not in stack, "cyclic node hierarchy"
        if index not in self._world:
            own = matrix(self.nodes[index])
            parent = self.parents.get(index)
            self._world[index] = own if parent is None else self.world(parent, stack+(index,)) @ own
        return self._world[index]

    def inspect(self):
        d = self.doc
        errors, warnings = [], []
        triangles = vertices = degenerates = unused = 0
        bounds = []
        primitive_details = []
        if d.get("skins") or any("skin" in node for node in self.nodes):
            errors.append("Contains skinning; pieces must be rigid")
        if d.get("textures") or d.get("images"):
            errors.append("Contains textures/images")
        if d.get("animations"):
            warnings.append("Contains animation; library files are expected in rest pose")
        for ni, node in enumerate(self.nodes):
            if "mesh" not in node:
                continue
            m = self.world(ni)
            if not np.isfinite(m).all():
                errors.append(f"{node.get('name', ni)}: non-finite node transform")
            for pi, prim in enumerate(d["meshes"][node["mesh"]]["primitives"]):
                label = f"{node.get('name', ni)} primitive {pi}"
                if prim.get("mode", 4) != 4:
                    errors.append(f"{label}: primitive is not triangles (loose lines/points forbidden)")
                    continue
                p = self.accessor(prim["attributes"]["POSITION"]).astype(float)
                if not np.isfinite(p).all():
                    errors.append(f"{label}: non-finite positions")
                idx = self.accessor(prim["indices"]).ravel().astype(np.int64) if "indices" in prim else np.arange(len(p))
                if len(idx) % 3 or len(idx) == 0:
                    errors.append(f"{label}: empty or non-triangular index count")
                    continue
                if idx.min() < 0 or idx.max() >= len(p):
                    errors.append(f"{label}: index outside positions")
                    continue
                tri = p[idx.reshape(-1, 3)]
                area2 = np.linalg.norm(np.cross(tri[:, 1]-tri[:, 0], tri[:, 2]-tri[:, 0]), axis=1)
                deg = int((area2 <= 1e-14).sum())
                orphan = len(p)-len(np.unique(idx))
                if deg:
                    errors.append(f"{label}: {deg} degenerate triangles")
                if orphan:
                    errors.append(f"{label}: {orphan} unreferenced vertices")
                degenerates += deg
                unused += orphan
                normals = prim["attributes"].get("NORMAL")
                if normals is None:
                    errors.append(f"{label}: no vertex normals")
                else:
                    n = self.accessor(normals).astype(float)
                    norm = np.linalg.norm(n, axis=1)
                    if len(n) != len(p) or not np.isfinite(n).all() or np.any(norm < .9) or np.any(norm > 1.1):
                        errors.append(f"{label}: missing, non-finite, or non-unit normals")
                worldp = p @ m[:3, :3].T + m[:3, 3]
                bounds.extend([worldp.min(axis=0), worldp.max(axis=0)])
                count = len(idx)//3
                triangles += count
                vertices += len(p)
                primitive_details.append({"node": node.get("name", str(ni)), "triangles": count, "vertices": len(p),
                                          "degenerateTriangles": deg, "unusedVertices": orphan,
                                          "minDoubleArea": float(area2.min())})
        if not triangles:
            errors.append("No triangle meshes")
        bbox = np.asarray(bounds)
        lo = bbox.min(axis=0).tolist() if bounds else [0, 0, 0]
        hi = bbox.max(axis=0).tolist() if bounds else [0, 0, 0]
        result = {"file": str(self.path.relative_to(ROOT)) if self.path.is_relative_to(ROOT) else str(self.path),
                  "bytes": self.path.stat().st_size, "triangles": triangles, "vertices": vertices,
                  "meshNodes": len([n for n in self.nodes if "mesh" in n]), "nodes": len(self.nodes),
                  "materials": [m.get("name", "") for m in d.get("materials", [])],
                  "bounds": {"min": lo, "max": hi, "size": (np.asarray(hi)-lo).tolist()},
                  "degenerateTriangles": degenerates, "unusedVertices": unused,
                  "primitives": primitive_details, "errors": errors, "warnings": warnings}
        return result


def body_checks(glb, report, entry, skeleton):
    errors = report["errors"]
    expected = skeleton["bodies"][entry["id"]]["joints"]
    names = Counter(n.get("name") for n in glb.nodes)
    by_name = {n.get("name"): i for i, n in enumerate(glb.nodes)}
    actual_joints = []
    for name, joint in expected.items():
        if names[name] != 1:
            errors.append(f"Joint {name}: expected exactly once, found {names[name]}")
            continue
        i = by_name[name]
        node = glb.nodes[i]
        parent = glb.nodes[glb.parents[i]].get("name") if i in glb.parents else None
        if parent != joint["parent"]:
            errors.append(f"Joint {name}: parent {parent!r}, expected {joint['parent']!r}")
        local = matrix(node)
        if not close(local[:3, :3], np.eye(3), atol=1e-5):
            errors.append(f"Joint {name}: nonidentity rest rotation/scale")
        if "mesh" in node:
            errors.append(f"Joint {name} must be an Empty, not a mesh")
        actual_joints.append({"name": name, "parent": parent, "local": local[:3, 3].tolist(),
                              "world": glb.world(i)[:3, 3].tolist()})
    for i, node in enumerate(glb.nodes):
        if "mesh" not in node:
            continue
        name = node.get("name", "")
        parent = glb.nodes[glb.parents[i]].get("name") if i in glb.parents else None
        if parent not in expected or not name.startswith(str(parent)+".") or not name.split(".", 1)[-1]:
            errors.append(f"Mesh {name!r} must be named <Joint>.<part> and be a direct child of that joint; parent={parent!r}")
    if set(report["materials"]) != {"plate", "joint"} or len(report["materials"]) != 2:
        errors.append(f"Body materials must be exactly plate and joint, found {report['materials']}")
    supplied = entry.get("joints", [])
    if isinstance(supplied, dict):
        supplied = [dict(value, name=name) for name, value in supplied.items()]
    supplied = {j["name"]: j for j in supplied}
    if set(supplied) != set(expected):
        errors.append("Manifest must list exactly the 21 exported joint names")
    for joint in actual_joints:
        other = supplied.get(joint["name"], {})
        if other.get("parent") != joint["parent"] or not close(other.get("local"), joint["local"]) or not close(other.get("world"), joint["world"]):
            errors.append(f"Manifest joint mismatch: {joint['name']}")
    report["joints"] = actual_joints
    report["jointOffsetsChangedFromSpec"] = [j["name"] for j in actual_joints if not close(j["local"], expected[j["name"]]["local"], atol=1e-4)]


def prop_checks(report, entry, original):
    errors = report["errors"]
    if not set(report["materials"]) <= {"prop", "accent"} or "prop" not in report["materials"]:
        errors.append(f"Asset materials must be prop and optional accent, found {report['materials']}")
    if entry.get("category") not in {"Furniture", "Architecture", "Outdoor", "Basic"}:
        errors.append("Invalid category")
    size = entry.get("size")
    if not finite_vector(size, 3) or any(v <= 0 for v in size):
        errors.append("Invalid size")
    elif not close(size, report["bounds"]["size"], atol=.002, rtol=.002):
        errors.append(f"Manifest size {size} != geometry bounds {report['bounds']['size']}")
    if abs(report["bounds"]["min"][1]) > .002:
        errors.append(f"Asset is not grounded at y=0: minY={report['bounds']['min'][1]:.6f}")
    lo, hi = np.asarray(report["bounds"]["min"]), np.asarray(report["bounds"]["max"])
    if any(abs(((hi+lo)/2)[axis]) > .003 for axis in [0, 2]):
        report["warnings"].append("Bounds are not centered on X/Z; review any intentionally asymmetric protrusion")
    if "seat" not in entry or "top" not in entry or "modules" not in entry:
        errors.append("Asset requires seat, top, and modules fields (use null/[] where appropriate)")
    seat = entry.get("seat")
    if seat is not None:
        if not isinstance(seat, dict) or not isinstance(seat.get("x"), list) or not seat.get("x") or not all(isinstance(seat.get(k), (int, float)) for k in ["y", "z"]):
            errors.append("Invalid seat anchor")
        elif not np.isfinite([seat["y"], seat["z"], *seat["x"]]).all():
            errors.append("Non-finite seat anchor")
    top = entry.get("top")
    if top is not None and (not isinstance(top, (int, float)) or not np.isfinite(top)):
        errors.append("Invalid top anchor")
    if original is not None:
        for key, source in [("size", "size_at_defaults"), ("seat", "seat_at_defaults"), ("top", "top_at_defaults")]:
            if not same_json(entry.get(key), original[source]):
                errors.append(f"Existing asset {key} differs from spec: {entry.get(key)} != {original[source]}")
        if entry.get("name") != original["name"] or entry.get("category") != original["category"]:
            errors.append("Existing asset name/category differs from spec")


def hand_checks(report, entry):
    errors = report["errors"]
    grips = entry.get("grips", {})
    for hand in ["left", "right"]:
        grip = grips.get(hand, {})
        if not finite_vector(grip.get("position"), 3) or not finite_vector(grip.get("quaternion"), 4):
            errors.append(f"Invalid {hand} grip: requires position xyz and quaternion xyzw")
        elif abs(np.linalg.norm(grip["quaternion"])-1) > 1e-4:
            errors.append(f"{hand} grip quaternion is not normalized")
        scale = grip.get("scale", [1, 1, 1])
        if not finite_vector(scale, 3) or not close(np.abs(scale), [1, 1, 1]):
            errors.append(f"{hand} grip scale must contain unit magnitudes (reflection is allowed)")
    coordinate_space = entry.get("gripCoordinateSpace", grips.get("coordinateSpace", "model-local"))
    report["gripCoordinateSpace"] = coordinate_space
    local_space = coordinate_space not in {"hand-joint-local", "joint-local", "hand-local"}
    model_origin = entry.get("modelGripOrigin", [0, 0, 0])
    if not finite_vector(model_origin, 3) or not close(model_origin, [0, 0, 0]):
        errors.append("Authored model grip origin must be [0,0,0]")
    right = grips.get("right", {})
    if local_space and finite_vector(right.get("position"), 3) and not close(right["position"], [0, 0, 0]):
        errors.append("Right-hand grip must be at the GLB origin")
    if finite_vector(right.get("quaternion"), 4) and not (close(right["quaternion"], [0, 0, 0, 1]) or close(right["quaternion"], [0, 0, 0, -1])):
        errors.append("Right-hand mesh must already be oriented in the hand frame (identity grip quaternion)")
    if not entry.get("poses") or not isinstance(entry["poses"], list) or not all(isinstance(p, str) and p for p in entry["poses"]):
        errors.append("Hand prop requires non-empty pose names")


def module_entries(modules):
    """Accept string paths or objects carrying file/type/triangles metadata."""
    if isinstance(modules, dict):
        modules = [dict(v, type=k) if isinstance(v, dict) else {"type": k, "file": v} for k, v in modules.items()]
    for module in modules or []:
        yield {"file": module} if isinstance(module, str) else module


def verify(model_root, report_path):
    manifest = json.loads((model_root/"manifest.json").read_text())
    skeleton = json.loads((SPEC/"skeleton.json").read_text())
    originals = {a["type"]: a for a in json.loads((SPEC/"assets.json").read_text())["assets"]}
    errors, reports, files = [], [], set()
    if manifest.get("units") not in {"metres", "meters", "m"} or manifest.get("up") != "+Y" or manifest.get("forward") != "+Z":
        errors.append("Manifest must declare units metres, up +Y, and forward +Z")
    if "version" not in manifest:
        errors.append("Manifest version missing")
    bodies, props, hands = manifest.get("bodies", []), manifest.get("assets", []), manifest.get("handProps", [])
    bodyids = [e.get("id") for e in bodies]
    propids = [e.get("type") for e in props]
    handids = [e.get("type") for e in hands]
    if len(bodyids) != 8 or set(bodyids) != set(skeleton["bodies"]):
        errors.append("Manifest must contain each of the eight body IDs exactly once")
    if not set(originals) <= set(propids):
        errors.append(f"Missing existing assets: {sorted(set(originals)-set(propids))}")
    new_assets = set(propids)-set(originals)
    if len(new_assets) < 15:
        errors.append(f"Only {len(new_assets)} new set pieces, requires >=15")
    if len(set(handids)) < 10:
        errors.append(f"Only {len(set(handids))} hand props, requires >=10")
    for category, identifiers in [("assets", propids), ("handProps", handids)]:
        duplicates = [key for key, value in Counter(identifiers).items() if value > 1]
        if duplicates:
            errors.append(f"Duplicate {category} IDs: {duplicates}")
    required_modules = {"stairs.step.glb", "fence.post.glb", "fence.rail.glb"}
    modules_seen = set()
    all_entries = [("body", e, 25000) for e in bodies] + [("asset", e, 15000 if e.get("type") == "car" else 6000) for e in props] + [("hand", e, None) for e in hands]
    for asset in props:
        for module in module_entries(asset.get("modules")):
            modules_seen.add(Path(module.get("file", "")).name)
            all_entries.append(("module", module, 6000))
    if not required_modules <= modules_seen:
        errors.append(f"Missing module entries: {sorted(required_modules-modules_seen)}")
    for kind, entry, budget in all_entries:
        rel = entry.get("file", "")
        expected_dir = {"body": "bodies", "asset": "props", "hand": "hand", "module": "props"}[kind]
        path = model_root/rel
        if not rel or Path(rel).is_absolute() or ".." in Path(rel).parts or Path(rel).parts[0] != expected_dir or Path(rel).suffix != ".glb":
            errors.append(f"Invalid {kind} path: {rel!r}")
            continue
        if rel in files:
            errors.append(f"Duplicate file reference: {rel}")
            continue
        files.add(rel)
        identifier = entry.get("id") if kind == "body" else entry.get("type")
        if kind != "module" and Path(rel).stem != identifier:
            errors.append(f"{kind} file must be named after its ID: {rel!r} != {identifier!r}.glb")
        try:
            glb = GLB(path)
            report = glb.inspect()
            report["kind"] = kind
            report["id"] = entry.get("id", entry.get("type", Path(rel).stem))
            if budget is not None and report["triangles"] > budget:
                report["errors"].append(f"{report['triangles']} triangles exceeds budget {budget}")
            if "triangles" in entry and entry["triangles"] != report["triangles"]:
                report["errors"].append(f"Manifest triangles {entry['triangles']} != GLB {report['triangles']}")
            elif kind != "module" and "triangles" not in entry:
                report["errors"].append("Manifest triangle count missing")
            if kind == "body" and entry.get("id") in skeleton["bodies"]:
                body_checks(glb, report, entry, skeleton)
            elif kind == "asset":
                prop_checks(report, entry, originals.get(entry.get("type")))
            elif kind == "hand":
                hand_checks(report, entry)
            reports.append(report)
        except Exception as exc:
            errors.append(f"{rel}: {type(exc).__name__}: {exc}")
    actual_files = {str(path.relative_to(model_root)) for path in model_root.rglob("*.glb")}
    if actual_files != files:
        errors.append(f"Manifest/file coverage mismatch: unlisted={sorted(actual_files-files)}, missing={sorted(files-actual_files)}")
    output = {"generatedAt": datetime.now(timezone.utc).isoformat(), "validator": "verify_library.py",
              "scope": "Independent GLB v2 binary, mesh, skeleton and manifest checks; visual pose review and Blender re-import are recorded separately.",
              "counts": {"bodies": len(bodies), "existingAssets": len(set(propids)&set(originals)), "newAssets": len(new_assets), "handProps": len(hands), "modules": len(modules_seen), "glbFiles": len(actual_files)},
              "errors": errors, "files": reports}
    output["errorCount"] = len(errors)+sum(len(r["errors"]) for r in reports)
    output["warningCount"] = sum(len(r["warnings"]) for r in reports)
    output["passed"] = output["errorCount"] == 0
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(output, indent=2)+"\n")
    print(json.dumps({key: output[key] for key in ["passed", "counts", "errorCount", "warningCount", "errors"]}, indent=2))
    for report in reports:
        for error in report["errors"]:
            print(f"ERROR {report['file']}: {error}")
    return output["passed"]


def reference_audit(report_path):
    reports = []
    for path in sorted((ROOT/"models-src/reference/current").glob("*.glb")):
        try:
            report = GLB(path).inspect()
            reports.append(report)
        except Exception as exc:
            reports.append({"file": str(path.relative_to(ROOT)), "errors": [str(exc)]})
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps({"scope": "Current reference library audit, not delivery validation", "files": reports}, indent=2)+"\n")
    for r in reports:
        print(Path(r["file"]).name, "tris", r.get("triangles"), "meshes", r.get("meshNodes"), "bounds", r.get("bounds"), "errors", len(r["errors"]))
    return True


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--models", type=Path, default=ROOT/"web/models")
    parser.add_argument("--report", type=Path)
    parser.add_argument("--reference", action="store_true")
    args = parser.parse_args()
    report_path = args.report or ROOT/"models-src/previews"/("reference-validation.json" if args.reference else "validation.json")
    try:
        passed = reference_audit(report_path) if args.reference else verify(args.models.resolve(), report_path)
    except Exception:
        traceback.print_exc()
        sys.exit(2)
    sys.exit(0 if passed else 1)
