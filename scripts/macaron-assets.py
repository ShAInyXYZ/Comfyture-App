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
PRODUCT = os.path.join(ROOT, "web/brand/macaron")
OUT = os.path.join(PRODUCT, "comfyture")
GEN = os.environ.get("GEN_DIR", os.path.join(ROOT, "docs-private/goals/overnight/macaron-gen"))
# the pictures made for Macaron v2 with Codex's image generation (the workspace tiles, Brioche's portrait, the moodboard, ...)
GEN2 = os.environ.get("GEN_V2", os.path.join(ROOT, "docs-private/goals/overnight/macaron-v2-gen"))


def save(im, name, quality=84, width=None, root=None):
    """A picture as WebP (kept clear where it has alpha), at most `width` wide."""
    path = os.path.join(root or OUT, name)
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


def svg(name, width):
    """A brand file (SVG) as a clear PNG of a width, so it can be laid on a picture exactly as it is supplied."""
    import io
    import cairosvg

    data = cairosvg.svg2png(url=os.path.join(ROOT, "web/brand", name), output_width=width)
    return Image.open(io.BytesIO(data)).convert("RGBA")


def laid(paper, mark, centre, angle, ink, strength=0.9):
    """A brand file pressed into a photograph of paper: its colour multiplied in, so the grain shows through."""
    from PIL import ImageChops, ImageFilter

    mark = mark.rotate(angle, expand=True, resample=Image.BICUBIC)
    alpha = Image.new("L", paper.size, 0)
    alpha.paste(mark.getchannel("A").point(lambda a: round(a * strength)), (round(centre[0] - mark.width / 2), round(centre[1] - mark.height / 2)))
    alpha = alpha.filter(ImageFilter.GaussianBlur(0.8))
    colour = Image.composite(Image.new("RGB", paper.size, ink), Image.new("RGB", paper.size, (255, 255, 255)), alpha)
    return ImageChops.multiply(paper, colour)


def v2():
    """The pictures of Macaron v2. The product's own (web/brand/macaron/): the three workspace tiles and Brioche's portrait.
    Comfyture's (comfyture/v2/): the moodboard, the three directions, the brief's notebook with the real wordmark laid on its
    page, and the counter the product stands on. Each is an image that Codex made once; they are kept as small WebP files."""
    g = lambda n: os.path.join(GEN2, n)
    for name in ["idea", "kit", "content"]:
        if os.path.exists(g(f"tile-{name}.png")):
            save(trimmed(Image.open(g(f"tile-{name}.png")).convert("RGBA"), 0.03), f"tile-{name}.webp", 90, 360, root=PRODUCT)
    if os.path.exists(g("portrait.png")):
        save(Image.open(g("portrait.png")).convert("RGB"), "brioche-portrait.webp", 88, 384, root=PRODUCT)
    for i in range(1, 7):
        if os.path.exists(g(f"mb-{i}.png")):
            save(Image.open(g(f"mb-{i}.png")).convert("RGB"), f"v2/mood-{i}.webp", 82, 900)
    for name in ["warm", "craft", "night"]:
        if os.path.exists(g(f"dir-{name}.png")):
            save(Image.open(g(f"dir-{name}.png")).convert("RGB"), f"v2/dir-{name}.webp", 84, 960)
    if os.path.exists(g("product-counter.png")):
        save(Image.open(g("product-counter.png")).convert("RGB"), "v2/counter.webp", 82, 1100)
    if os.path.exists(g("brief-notebook.png")):
        paper = Image.open(g("brief-notebook.png")).convert("RGB")
        ink = (0x49, 0x37, 0x8B)
        # the left page: the mark above the wordmark, turned to the page's own tilt
        paper = laid(paper, svg("mark-plum.svg", 118), (684, 462), 7, ink)
        paper = laid(paper, svg("wordmark-plum.svg", 400), (700, 590), 7, ink)
        save(paper, "v2/brief-notebook.webp", 84, 1100)


STEPS = {"app": app, "jar": jar, "brioche": brioche, "made": made, "refs": refs, "trends": trends, "generated": generated, "v2": v2}
if __name__ == "__main__":
    for step in sys.argv[1:] or STEPS:
        STEPS[step]()
