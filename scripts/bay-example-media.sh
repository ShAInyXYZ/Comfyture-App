#!/bin/bash
# The clips and stills of the bay's example shot (examples/bay/lantern/), made from its three pictures (drawn with Codex's GPT Image:
# docs/brand/products/bay-v1/): eight seconds at 24 fps, 1280x720, a slow push-in over each picture, the same move on every one so the
# wipe between the footage and a take lines up. (The pictures stay on disk, not in the history: run.sh there draws them again.) Run from the repo root with ffmpeg; nothing is sent anywhere.
set -e
src=docs/brand/products/bay-v1
out=examples/bay/lantern
mkdir -p "$out"
for name in plate clean direct; do
  ffmpeg -v error -y -loop 1 -i "$src/$name.png" -vf "scale=2560:-2,zoompan=z='1+0.06*on/191':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=192:s=1280x720:fps=24,format=yuv420p" -frames:v 192 -c:v libx264 -preset slow -crf 25 -movflags +faststart "$out/$name.mp4"
  ffmpeg -v error -y -i "$src/$name.png" -vf "scale=1280:-2" -q:v 3 "$out/$name.jpg"
done
# (Conform's take is the footage as it is, ready for the editors, and Finish's the last pass exported: the spec points them at the same files)
