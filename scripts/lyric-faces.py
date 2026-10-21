"""Writes web/js/lyric-faces.js: the advance widths of the faces the caption styles are drawn in (the preview and the film's
subtitles lay a line out from them, so both place a word alike). Run from the repo root: python3 scripts/lyric-faces.py
Needs fontTools. The faces are in web/fonts (SIL Open Font License: Bangers, Caveat Brush, IBM Plex Mono)."""
from fontTools.ttLib import TTFont
from collections import defaultdict

FACES = {
    "type": ("IBM Plex Mono SemiBold", "IBMPlexMono-SemiBold.ttf"),
    "hand": ("Caveat Brush", "CaveatBrush-Regular.ttf"),
    "comic": ("Bangers", "Bangers-Regular.ttf"),
}
RANGES = [(0x20, 0x7E), (0xA0, 0x17F), (0x2010, 0x2027), (0x2030, 0x203A)]

out = ["// The caption faces beyond the lyric one (Manrope, in lyrics.js): their family, file, units per em, ascent and descent",
       "// (the win metrics libass sizes a line by) and the advance width of each character, grouped by width. Written by",
       "// scripts/lyric-faces.py from the fonts in web/fonts: do not edit by hand.", "export const FACES = {"]
for key, (family, file) in FACES.items():
    f = TTFont(f"web/fonts/{file}")
    upm = f["head"].unitsPerEm
    os2 = f["OS/2"]
    cmap = f.getBestCmap()
    hmtx = f["hmtx"]
    groups = defaultdict(list)
    widths = []
    for lo, hi in RANGES:
        for cp in range(lo, hi + 1):
            g = cmap.get(cp)
            if g is None:
                continue
            w = hmtx[g][0]
            widths.append(w)
            groups[w].append(chr(cp))
    fallback = round(sum(widths) / len(widths))
    # libass puts a line by the win metrics, a browser by the hhea ones: how far lower (in em) the film draws a face than the preview
    hh = f["hhea"]
    drop = round(((os2.usWinAscent - os2.usWinDescent) - (hh.ascent + hh.descent)) / 2 / upm, 4)
    out.append(f'  {key}: {{ family: {family!r}, file: {file!r}, upm: {upm}, asc: {os2.usWinAscent}, desc: {os2.usWinDescent}, drop: {drop}, fallback: {fallback}, widths: {{')
    for w in sorted(groups):
        chars = "".join(groups[w]).replace("\\", "\\\\").replace('"', '\\"')
        out.append(f'    {w}: "{chars}",')
    out.append("  } },")
out.append("};")
open("web/js/lyric-faces.js", "w").write("\n".join(out) + "\n")
print("written")
