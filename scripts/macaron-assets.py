#!/usr/bin/env python3
"""Prepare the pictures of Macaron's Comfyture project: the app's screens, the jar, Brioche, work made
with Comfyture. Reads the sources named below, writes web/brand/macaron/comfyture/ (small WebP files).

  python3 scripts/macaron-assets.py            # every step
  python3 scripts/macaron-assets.py app jar    # some

Cut-outs (a subject on a clear background) come from the app's own tool first:
  node scripts/macaron-cutout.ts in.png out.png     (a server must be running)
and the generated pictures from scripts/macaron-image.ts. Pass their paths as environment
variables when they are not where the defaults say:  CUT_BRIOCHE=... CUT_JAR=... GEN_DIR=..."""
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "web/brand/macaron/comfyture")
GEN = os.environ.get("GEN_DIR", os.path.join(ROOT, "docs-private/goals/overnight/macaron-gen"))


def save(im, name, quality=84, width=None):
    """A picture as WebP (kept clear where it has alpha), at most `width` wide."""
    path = os.path.join(OUT, name)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if width and im.width > width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    im.save(path, "WEBP", quality=quality, method=6, **({"alpha_quality": 92} if im.mode == "RGBA" else {}))
    print(f"{name}: {im.width}x{im.height}, {os.path.getsize(path) // 1024} KB")


def trimmed(im, pad=0.02):
    """A cut-out cropped to its subject, with a little room."""
    box = im.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
    p = round(max(box[2] - box[0], box[3] - box[1]) * pad)
    return im.crop((max(0, box[0] - p), max(0, box[1] - p), min(im.width, box[2] + p), min(im.height, box[3] + p)))


def app():
    # the app's own screens (the website's captures), one per room
    src = os.path.join(ROOT, "www/media/app")
    for name, out in [("home", "home"), ("story", "story"), ("stage-kitchen", "stage"), ("shot", "shot"), ("cut", "cut"), ("library", "library")]:
        save(Image.open(os.path.join(src, f"{name}.jpg")).convert("RGB"), f"app/{out}.webp", 82, 1600)


def jar():
    save(Image.open(os.path.join(ROOT, "docs/brand/props/comfyture-jar-v1.png")).convert("RGB"), "jar.webp", 88, 1200)
    cut = os.environ.get("CUT_JAR", os.path.join(GEN, "jar-cutout.png"))
    if os.path.exists(cut):
        save(trimmed(Image.open(cut).convert("RGBA")), "jar-cutout.webp", 88, 1100)


def brioche():
    for key, name in [("CUT_BRIOCHE", "brioche"), ("CUT_BRIOCHE_CHEER", "brioche-cheer")]:
        cut = os.environ.get(key, os.path.join(GEN, f"{name}-cut.png"))
        if os.path.exists(cut):
            save(trimmed(Image.open(cut).convert("RGBA")), f"{name}.webp", 90, 900)


def made():
    # real takes made in Comfyture (the website's take log) and Mixer's trends are used where they are
    src = os.path.join(ROOT, "www/media/takes")
    for name in ["finding-life", "observing-sky", "rescue-arrival", "waking-up", "chef-lip-sync", "thunder-god-extended"]:
        p = os.path.join(src, f"{name}.jpg")
        if os.path.exists(p):
            save(Image.open(p).convert("RGB"), f"made/{name}.webp", 84, 1100)


def refs():
    # what the work looks to: the approved identity board, Brioche's sheet, the Mixer crew
    for src, out, w in [("docs/brand/approved/comfyture-identity-reference.png", "refs/identity-board.webp", 1536), ("docs/brand/cast/brioche-sheet.png", "refs/brioche-sheet.webp", 1536), ("docs/brand/mixer-crew/crew-lineup-v1.png", "refs/mixer-crew.webp", 1400)]:
        save(Image.open(os.path.join(ROOT, src)).convert("RGB"), out, 86, w)


def trends():
    # snapshots of Mixer's covers, work made with Comfyture (the trends keep changing: these are the pictures the designs were made with)
    src = os.path.join(ROOT, "web/brand/mixer/trends")
    for name in ["state-property", "lights-off", "three-kittens", "black-cat-clapping", "ramalama", "hotel-lobby"]:
        p = os.path.join(src, f"{name}.webp")
        if os.path.exists(p):
            save(Image.open(p).convert("RGB"), f"made/{name}.webp", 84, 720)


def generated():
    # pictures made for the project with scripts/macaron-image.ts, once chosen: the jar of shots (cut out, its label left blank
    # so the real logo goes on it as a layer) and the plum macro (a ground)
    cut = os.path.join(GEN, "jar-of-shots-cut.png")
    if os.path.exists(cut):
        save(trimmed(Image.open(cut).convert("RGBA")), "jar-of-shots.webp", 88, 1000)
    p = os.path.join(GEN, "plum-macro.png")
    if os.path.exists(p):
        save(Image.open(p).convert("RGB"), "plum-macro.webp", 84, 1080)


STEPS = {"app": app, "jar": jar, "brioche": brioche, "made": made, "refs": refs, "trends": trends, "generated": generated}
if __name__ == "__main__":
    for step in sys.argv[1:] or STEPS:
        STEPS[step]()
