#!/usr/bin/env bash
# Render section 1 and bring it to -14 LUFS for review.
set -euo pipefail
cd "$(dirname "$0")/.."
for pair in "S1PublicProperty:s1-public-property"; do
  id=${pair%%:*}; name=${pair##*:}
  nice -n 10 npx remotion render "$id" "out/$name.raw.mp4" --concurrency=8 --log=error
  ffmpeg -v error -y -i "out/$name.raw.mp4" -c:v copy -af "loudnorm=I=-14:TP=-1.5:LRA=11" -ar 48000 -c:a aac -b:a 256k -movflags +faststart "out/$name.mp4"
  rm "out/$name.raw.mp4"
  echo "out/$name.mp4"
done
