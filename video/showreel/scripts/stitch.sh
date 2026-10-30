#!/usr/bin/env bash
# Join the rendered sections into the full showreel: out/comfyture-showreel.mp4
set -euo pipefail
cd "$(dirname "$0")/.."
list=out/sections.txt
: > $list
for s in s1-public-property s2-mixer s3-toaster-cabinet s4-jam s5-ending; do echo "file '$s.mp4'" >> $list; done
ffmpeg -v error -y -f concat -safe 0 -i $list -c:v libx264 -crf 17 -preset medium -pix_fmt yuv420p -r 30 \
  -af "aresample=async=1,loudnorm=I=-14:TP=-1.5:LRA=11" -ar 48000 -c:a aac -b:a 256k -movflags +faststart out/comfyture-showreel.mp4
rm $list
# Two minutes max: keep it just under, the sound fading with the end card.
ffmpeg -v error -y -i out/comfyture-showreel.mp4 -t 119.8 -c:v copy -af "afade=t=out:st=119.2:d=0.6" -c:a aac -b:a 256k -ar 48000 -movflags +faststart out/tmp.mp4 && mv out/tmp.mp4 out/comfyture-showreel.mp4
ffprobe -v error -show_entries format=duration -of csv=p=0 out/comfyture-showreel.mp4
