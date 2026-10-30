#!/usr/bin/env bash
# Copy what the showreel shows into public/ (ignored by git: these are copies, or not ours to publish).
set -euo pipefail
cd "$(dirname "$0")/.."
R=../..
mkdir -p public/media/tiles public/media/pets public/fonts public/brand
# Our crew's State Property, with the meme's sound (kept on disk only).
ffmpeg -v error -y -i $R/docs/brand/mixer-crew/reference-match-v2/videos/state-property/state-property-crew-v3.mp4 \
  -vf scale=1080:1920:flags=lanczos -c:v libx264 -crf 16 -preset fast -g 12 -c:a aac -b:a 256k public/media/state-property.mp4
cp $R/web/brand/mixer/trends/*.webp public/media/tiles/
cp $R/www/media/pets/*.webp public/media/pets/
cp $R/web/fonts/manrope-400-800.woff2 $R/web/fonts/ibm-plex-mono-500.woff2 $R/web/fonts/ibm-plex-mono-600.woff2 public/fonts/
cp $R/web/brand/mark.svg $R/web/brand/mark-ink.svg $R/web/brand/wordmark.svg $R/web/brand/wordmark-ink.svg public/brand/
