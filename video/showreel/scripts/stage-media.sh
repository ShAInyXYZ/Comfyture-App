#!/usr/bin/env bash
# Copy what the showreel shows into public/ (ignored by git: these are copies, or not ours to publish).
set -euo pipefail
cd "$(dirname "$0")/.."
R=../..
mkdir -p public/media/tiles public/media/pets public/fonts public/brand/icons
# Our crew's State Property with its original sound, from the Share folder (kept on disk only).
cp ~/Share/Comfyture-Mixer/state-property.mp4 public/media/state-property.mp4
cp $R/web/brand/mixer/trends/*.webp public/media/tiles/
cp $R/www/media/pets/*.webp public/media/pets/
cp $R/web/fonts/manrope-400-800.woff2 $R/web/fonts/ibm-plex-mono-500.woff2 $R/web/fonts/ibm-plex-mono-600.woff2 public/fonts/
cp $R/web/brand/mark.svg $R/web/brand/mark-ink.svg $R/web/brand/wordmark.svg $R/web/brand/wordmark-ink.svg public/brand/
# Section 2, Mixer: the crew's faces, Ivy's trend preview and Moon's guitar version (the 28 Oct mix, from the app's data).
mkdir -p public/media/crew
cp $R/web/brand/mixer/crew/*-face.webp public/media/crew/
cp $R/web/brand/mixer/trends/my-reaction/preview.mp4 public/media/ivy-plant-problem.mp4
cp $R/data/reels/20261028-0a78bd.mp4 public/media/moon-guitar-problem.mp4
python3 - "$R" <<'PY'
import re, sys
s = open(f"{sys.argv[1]}/web/icons/icons.svg").read()
for m in re.finditer(r'<symbol id="(product-[a-z]+)"([^>]*)>(.*?)</symbol>', s, re.S):
    vb = re.search(r'viewBox="([^"]+)"', m.group(2)).group(1)
    extra = " ".join(a for a in re.findall(r'(\w[\w-]*="[^"]*")', m.group(2)) if not a.startswith(("viewBox", "id"))).replace("currentColor", "#000")
    open(f"public/brand/icons/{m.group(1)}.svg", "w").write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" {extra}>{m.group(3).replace("currentColor", "#000")}</svg>')
PY
