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
# Section 3, Toaster (Pickle's leap: clay, colour ID, render, sheet, and the Tripo model turning) and Cabinet (Josie's shoot).
mkdir -p public/media/toaster public/media/cabinet/wardrobe
cp $R/data/photos/38f1355cc3dd2851.png public/media/toaster/pickle-clay.png
cp $R/data/photos/0e7ea4970100c9b3.png public/media/toaster/pickle-colour-id.png
cp $R/data/photos/5bb91cdb29f0de6c.png public/media/toaster/pickle-render.png
cp $R/data/photos/fc4f731cf5bcd819.png public/media/toaster/pickle-sheet.png
# The turntable: blender -b --python scripts/turntable.py -- data/models/4be5281504f31410.glb (Tripo, single image) <dir>/f_ 120, then
# ffmpeg -framerate 30 -i <dir>/f_%04d.png -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 4M public/media/toaster/pickle-turntable.webm
cp $R/web/brand/mixer/crew/josie.png $R/web/brand/mixer/crew/shiny.png public/media/cabinet/
cp $R/web/brand/cabinet/wardrobe/kabyle-dress.webp $R/web/brand/cabinet/wardrobe/burnous.webp $R/web/brand/cabinet/poses/hand-hip.webp $R/web/brand/cabinet/poses/arms-crossed.webp public/media/cabinet/
for f in 2e01293d611e5204 9124e1e7095f2a44 37691be560533bb9 2acbb4ef00e549f1 cd9b658b329f3591 bfdc3950abb11c5b; do cp $R/data/photos/$f.jpg public/media/cabinet/shot-$f.jpg; done
for n in blazer boho biker barista ballet basketball astronaut kabyle-dress burnous; do cp $R/web/brand/cabinet/wardrobe/$n.thumb.webp public/media/cabinet/wardrobe/$n.webp; done
cp $R/web/brand/cast/canelle-face.webp $R/web/brand/cast/crumpet-face.webp $R/web/brand/cast/pickle-face.webp public/media/crew/
# Section 4, Jam: Ketkout no Koe from its edit (cuts-new-song-6f333b): the four scenes, the 30 s part, the covers.
mkdir -p public/media/jam/covers
for f in cb1e5857f937c73d 4d4266de5acd5f24 e5f31a1fe4186668 550846f155ed31fc; do cp $R/data/videos/$f.mp4 public/media/jam/; done
cp "$(find $R/data -name 50a9359d71de4667.mp3 | head -1)" public/media/jam/ketkout-no-koe-part.mp3
cp $R/data/photos/e983168bd8058f4f.jpg public/media/jam/covers/ketkout-no-koe.jpg
for d in $R/examples/songs/*/; do cp $d/cover.jpg public/media/jam/covers/$(basename $d).jpg; done
cp $R/examples/jam/jam-walk-moonlit-oolong/look.jpg public/media/jam/covers/moonlit-oolong.jpg
cp $R/web/fonts/comfyture-lyric.ttf public/fonts/
# Section 5, the ending: Utensils' shelf (keyframe) and Kitchen's Ketkout — A Grand Entrance (30 Oct export).
mkdir -p public/media/end
cp $R/docs/competition/keyframes/k18-utensils.webp public/media/end/utensils.webp
cp $R/data/reels/20261030-476735.mp4 public/media/end/kitchen-grand-entrance.mp4
