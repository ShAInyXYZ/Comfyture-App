"""Compose the batch 3 sheets from unmodified native-resolution GLB renders.

The supplied reference is only fitted into its column; it is never repainted,
cropped, colour-corrected or used as a substitute for a rendered animal.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "models-src"
OUT = SRC / "previews"
TILES = OUT / "animals-tiles"
IDS = ("baby-chick", "baby-squirrel", "puppy", "kitten", "bunny", "piglet")
NAMES = ("Baby chick", "Baby squirrel", "Puppy", "Kitten", "Bunny", "Piglet")
CLIPS = ("stand", "sit", "lie", "walk", "hop")
BG = (255, 255, 255)
INK = (47, 48, 49)
MUTED = (117, 118, 116)
RULE = (222, 222, 216)
MARGIN = 48
GAP = 16


def font(size, weight="Book"):
    path = Path("/usr/share/fonts/opentype/fira") / f"FiraSans-{weight}.otf"
    if not path.exists():
        path = Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
    return ImageFont.truetype(str(path), size)


def centered(draw, text, x, y, size=25, fill=INK, weight="Book"):
    f = font(size, weight)
    width = draw.textlength(text, font=f)
    draw.text((round(x - width / 2), y), text, font=f, fill=fill)


def header(draw, title, subtitle, width):
    draw.text((MARGIN, 30), "COMFYTURE / STAGE", font=font(17, "Medium"), fill=MUTED)
    draw.text((MARGIN, 66), title, font=font(40, "Medium"), fill=INK)
    draw.text((MARGIN, 121), subtitle, font=font(21), fill=MUTED)
    draw.line((MARGIN, 166, width - MARGIN, 166), fill=RULE, width=1)


def record(name, image, sources, note):
    image.save(OUT / name, compress_level=6)
    path = OUT / "batch3-preview-composition.json"
    report = json.loads(path.read_text()) if path.exists() else {}
    report[name] = {
        "size": list(image.size),
        "method": note,
        "sources": [{"file": str(p.relative_to(ROOT)),
                     "sha256": hashlib.sha256(p.read_bytes()).hexdigest()} for p in sources],
    }
    path.write_text(json.dumps(report, indent=2) + "\n")
    print(f"{OUT / name} {image.size}", flush=True)


def stand_sheet():
    paths = [TILES / f"{animal_id}-stand.png" for animal_id in IDS]
    tiles = [Image.open(p).convert("RGB") for p in paths]
    w, h = tiles[0].size
    if any(im.size != (w, h) for im in tiles):
        raise ValueError("All render tiles must have the same native resolution")
    width = MARGIN * 2 + 7 * w + 6 * GAP
    height = 190 + h + 130
    out = Image.new("RGB", (width, height), BG)
    draw = ImageDraw.Draw(out)
    header(draw, "Six little animals", "Batch 3 · stand pose · six models at one physical scale · three-quarter front", width)
    reference_path = SRC / "reference/cute-style.png"
    reference = Image.open(reference_path).convert("RGB")
    # Preserve the whole reference, including its white margin, and only fit.
    # Its image is a style guide; only the six models carry physical scale.
    reference.thumbnail((round(w * 0.71), round(h * 0.71)), Image.Resampling.LANCZOS)
    out.paste(reference, (MARGIN + (w - reference.width) // 2,
                          190 + round(h * 0.815 - reference.height * 0.895)))
    centered(draw, "Style reference", MARGIN + w / 2, 190 + h + 12, 26, weight="Medium")
    centered(draw, "Supplied chick image", MARGIN + w / 2, 190 + h + 49, 19, MUTED)
    manifest = json.loads((ROOT / "web/models/manifest.json").read_text())
    records = {a["type"]: a for a in manifest["animals"]}
    for i, (animal_id, name, tile) in enumerate(zip(IDS, NAMES, tiles), start=1):
        x = MARGIN + i * (w + GAP)
        out.paste(tile, (x, 190))
        centered(draw, name, x + w / 2, 190 + h + 12, 26, weight="Medium")
        size = records[animal_id]["size"]
        label = f"{size[1]:.2f} m tall · {records[animal_id]['triangles']:,} triangles"
        centered(draw, label, x + w / 2, 190 + h + 49, 19, MUTED)
    draw.text((MARGIN, height - 35), "Delivered GLBs re-imported into Blender. Original geometry, materials and stand clips.", font=font(18), fill=MUTED)
    record("batch3-animals.png", out, [reference_path] + paths,
           "Six native-resolution unchanged Blender renders at one orthographic world scale; supplied reference fitted intact into the adjacent column; labels added outside renders.")


def pose_sheet():
    paths = [TILES / f"{animal_id}-{clip}.png" for animal_id in IDS for clip in CLIPS]
    tiles = [Image.open(p).convert("RGB") for p in paths]
    w, h = tiles[0].size
    if any(im.size != (w, h) for im in tiles):
        raise ValueError("All render tiles must have the same native resolution")
    label_width = 190
    row_gap = 30
    top = 246
    width = MARGIN * 2 + label_width + 5 * w + 4 * GAP
    height = top + 6 * h + 5 * row_gap + 70
    out = Image.new("RGB", (width, height), BG)
    draw = ImageDraw.Draw(out)
    header(draw, "Six animals, five clips", "Batch 3 · actual exported clips · same camera and physical scale in every tile", width)
    for col, clip in enumerate(CLIPS):
        x = MARGIN + label_width + col * (w + GAP) + w / 2
        centered(draw, clip, x, 185, 26, weight="Medium")
        centered(draw, "0.50 s" if clip in ("walk", "hop") else "held pose", x, 218, 18, MUTED)
    for row, (animal_id, name) in enumerate(zip(IDS, NAMES)):
        y = top + row * (h + row_gap)
        draw.text((MARGIN, y + h / 2 - 14), name, font=font(25, "Medium"), fill=INK)
        for col in range(5):
            x = MARGIN + label_width + col * (w + GAP)
            out.paste(tiles[row * 5 + col], (x, y))
        if row < 5:
            draw.line((MARGIN, y + h + row_gap / 2, width - MARGIN, y + h + row_gap / 2), fill=RULE, width=1)
    draw.text((MARGIN, height - 35), "walk and hop shown at the middle of their 1-second loops. Geometry and poses are taken directly from the delivered GLBs.", font=font(18), fill=MUTED)
    record("batch3-poses.png", out, paths,
           "Thirty unchanged native-resolution Blender renders of GLB animations; five columns per animal at the same world scale; labels added outside renders.")


def validate_sources():
    """Refuse to label stale render tiles as the current delivered assets."""
    evidence = json.loads((OUT / "batch3-render-evidence.json").read_text())["tiles"]
    for animal_id in IDS:
        glb = ROOT / "web/models/animals" / f"{animal_id}.glb"
        source_hash = hashlib.sha256(glb.read_bytes()).hexdigest()
        for clip in CLIPS:
            path = TILES / f"{animal_id}-{clip}.png"
            entry = evidence.get(path.name, {})
            if entry.get("glbSha256") != source_hash:
                raise ValueError(f"Render is stale for current GLB: {path.name}")
            if entry.get("sha256") != hashlib.sha256(path.read_bytes()).hexdigest():
                raise ValueError(f"Render hash differs from evidence: {path.name}")


def compose():
    OUT.mkdir(exist_ok=True)
    validate_sources()
    stand_sheet()
    pose_sheet()


if __name__ == "__main__":
    compose()
