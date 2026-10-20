#!/usr/bin/env python3
"""Build the Comfyture brand assets from the approved identity board.

  python3 scripts/brand-build.py

Reads  docs/brand/approved/comfyture-identity-reference.png
Writes web/brand/  mark / icon / wordmark SVGs in every colourway, PNG sizes,
favicon.ico, apple-touch-icon, a maskable icon and the web manifest.

The mark is the script C with its fitted jar lid: two shapes, traced together,
so the lid is never lost. Needs: pillow, numpy, scipy, potrace (pypotrace)."""
import json, os
import numpy as np
import potrace
from PIL import Image, ImageDraw
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "docs/brand/approved/comfyture-identity-reference.png")
OUT = os.path.join(ROOT, "web/brand")
os.makedirs(OUT, exist_ok=True)

YELLOW, INK, PLUM, WHITE = "#F2FF59", "#211927", "#49378B", "#F0EFED"
board = Image.open(SRC).convert("RGB")


def n(v):
    s = f"{v:.1f}".rstrip("0").rstrip(".")
    return s


def trace(mask):
    """Boolean mask -> SVG path data (curves, evenodd)."""
    pl = potrace.Bitmap(~mask).trace(turdsize=60, alphamax=1.15, opttolerance=0.5)
    d = []
    for c in pl:
        s = c.start_point
        d.append(f"M{n(s.x)} {n(s.y)}")
        for g in c.segments:
            if g.is_corner:
                d.append(f"L{n(g.c.x)} {n(g.c.y)}L{n(g.end_point.x)} {n(g.end_point.y)}")
            else:
                d.append(f"C{n(g.c1.x)} {n(g.c1.y)} {n(g.c2.x)} {n(g.c2.y)} {n(g.end_point.x)} {n(g.end_point.y)}")
        d.append("Z")
    return "".join(d)


def crop_mask(box, up, pick, pad=8):
    c = board.crop(box).resize(((box[2] - box[0]) * up, (box[3] - box[1]) * up), Image.LANCZOS)
    m = pick(np.asarray(c).astype(int))
    lab, k = ndimage.label(m)
    sizes = ndimage.sum(m, lab, range(1, k + 1))
    m = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s > 1500])
    ys, xs = np.where(m)
    return m[max(ys.min() - pad, 0):ys.max() + pad, max(xs.min() - pad, 0):xs.max() + pad]


# the mark: dark C + lid inside the yellow app tile on the board
mark_m = crop_mask((98, 650, 358, 902), 6, lambda p: p.sum(2) < 330)
# the wordmark: yellow script on the dark banner
word_m = crop_mask((150, 100, 1450, 540), 3, lambda p: (p[..., 0] > 150) & (p[..., 1] > 170) & (p[..., 2] < 170))
mark_d, word_d = trace(mark_m), trace(word_m)
MW, MH = mark_m.shape[1], mark_m.shape[0]
WW, WH = word_m.shape[1], word_m.shape[0]


def write(name, text):
    with open(os.path.join(OUT, name), "w") as f:
        f.write(text if text.endswith("\n") else text + "\n")


def svg(w, h, body, extra=""):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}"{extra}>{body}</svg>'


# ── flat marks and wordmarks, one per colourway
for tag, col in (("", YELLOW), ("-ink", INK), ("-white", WHITE), ("-plum", PLUM)):
    write(f"mark{tag}.svg", svg(MW, MH, f'<path fill="{col}" fill-rule="evenodd" d="{mark_d}"/>'))
    write(f"wordmark{tag}.svg", svg(WW, WH, f'<path fill="{col}" fill-rule="evenodd" d="{word_d}"/>'))

# ── app icon tiles: the mark centred on a 512 tile, 60 % of its height
T = 512
SC = (T * 0.60) / MH
TX, TY = (T - MW * SC) / 2, (T - MH * SC) / 2 - T * 0.004


def tile(bg, fg, radius=0.225, full_bleed=False, scale=1.0):
    sc = SC * scale
    tx, ty = (T - MW * sc) / 2, (T - MH * sc) / 2 - T * 0.004
    r = 0 if full_bleed else T * radius
    return svg(T, T, f'<rect width="{T}" height="{T}" rx="{n(r)}" fill="{bg}"/>'
                     f'<path fill="{fg}" fill-rule="evenodd" transform="translate({n(tx)} {n(ty)}) scale({sc:.4f})" d="{mark_d}"/>')


write("icon.svg", tile(YELLOW, INK))             # the app icon and the favicon
write("icon-ink.svg", tile(INK, YELLOW))         # dark surfaces, docks
write("icon-plum.svg", tile(PLUM, YELLOW))       # the plum alternative
write("icon-white.svg", tile(WHITE, INK))
write("favicon.svg", tile(YELLOW, INK, radius=0.2, scale=1.2))   # bigger mark: it has to read at 16 px
write("icon-maskable.svg", tile(YELLOW, INK, full_bleed=True, scale=0.78))

# ── PNGs, drawn from the same masks so every size is antialiased from the source
mark_img = Image.fromarray((mark_m * 255).astype("uint8"))


def hexrgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def png_tile(size, bg, fg, radius=0.225, full_bleed=False, scale=1.0):
    S = size * 4
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = 0 if full_bleed else int(S * radius)
    d.rounded_rectangle((0, 0, S - 1, S - 1), radius=r, fill=hexrgb(bg) + (255,))
    h = S * 0.60 * scale
    w = h * MW / MH
    m = mark_img.resize((max(1, round(w)), max(1, round(h))), Image.LANCZOS)
    layer = Image.new("RGBA", m.size, hexrgb(fg) + (255,))
    img.paste(layer, (round((S - w) / 2), round((S - h) / 2 - S * 0.004)), m)
    return img.resize((size, size), Image.LANCZOS)


def png_mark(height, col):
    w = round(height * MW / MH)
    m = mark_img.resize((w, height), Image.LANCZOS)
    img = Image.new("RGBA", (w, height), hexrgb(col) + (0,))
    img.putalpha(m)
    return img


for s in (16, 32, 48, 64, 128, 180, 192, 256, 512, 1024):
    png_tile(s, YELLOW, INK, scale=1.2 if s <= 48 else 1.0).save(os.path.join(OUT, f"icon-{s}.png"))
png_tile(180, YELLOW, INK, radius=0, full_bleed=True, scale=0.86).save(os.path.join(OUT, "apple-touch-icon.png"))
png_tile(512, YELLOW, INK, full_bleed=True, scale=0.78).save(os.path.join(OUT, "icon-maskable-512.png"))
png_tile(512, INK, YELLOW).save(os.path.join(OUT, "icon-ink-512.png"))
png_mark(1024, YELLOW).save(os.path.join(OUT, "mark-1024.png"))
png_mark(1024, INK).save(os.path.join(OUT, "mark-ink-1024.png"))
ico = [png_tile(s, YELLOW, INK, radius=0.2, scale=1.2) for s in (16, 32, 48)]
ico[2].save(os.path.join(OUT, "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)], append_images=ico[:2])
ww = 2400
word = Image.new("RGBA", (ww, round(ww * WH / WW)), hexrgb(YELLOW) + (0,))
word.putalpha(Image.fromarray((word_m * 255).astype("uint8")).resize(word.size, Image.LANCZOS))
word.save(os.path.join(OUT, "wordmark-2400.png"))

write("site.webmanifest", json.dumps({
    "name": "Comfyture", "short_name": "Comfyture", "start_url": "/", "display": "standalone",
    "background_color": INK, "theme_color": "#19191c",
    "icons": [{"src": "icon-192.png", "sizes": "192x192", "type": "image/png"},
              {"src": "icon-512.png", "sizes": "512x512", "type": "image/png"},
              {"src": "icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}],
}, indent=2))

# ── the story: the mark taken apart (C and lid), and the exploration boards that led here
lab, k = ndimage.label(mark_m)
sizes = ndimage.sum(mark_m, lab, range(1, k + 1))
lid_i = int(np.argmin(sizes)) + 1
c_d, lid_d = trace((lab > 0) & (lab != lid_i)), trace(lab == lid_i)
os.makedirs(os.path.join(OUT, "story"), exist_ok=True)
write("story/anatomy.svg", svg(MW, MH, f'<path fill="{YELLOW}" fill-rule="evenodd" d="{c_d}"/><path fill="{WHITE}" fill-rule="evenodd" d="{lid_d}"/>'))
CONCEPTS = os.path.join(ROOT, "docs/brand/2026-10-16-concepts")
for name in ("01_preserve_seal", "02_jar_monogram", "03_ribbon_wordmark", "07_fitted_lid"):
    im = Image.open(os.path.join(CONCEPTS, name + ".png")).convert("RGB")
    im = im.resize((1000, round(im.size[1] * 1000 / im.size[0])), Image.LANCZOS)
    im.save(os.path.join(OUT, "story", name + ".jpg"), quality=84, optimize=True)

print("mark", MW, MH, "wordmark", WW, WH, "->", len(os.listdir(OUT)), "files in web/brand")
