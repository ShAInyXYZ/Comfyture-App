#!/bin/bash
# Run by git filter-branch on each commit: drops the trend songs, docs/brand, Jam's old project homes,
# examples/ (but its README and Kitchen's Ketkout — A Grand Entrance, the judges' template), and every old version of a trend preview (the ones listed in strip.txt).
STRIP="$(dirname "$0")/strip.txt"
git -c core.quotepath=off ls-files -s | awk -v strip="$STRIP" '
  BEGIN { while ((getline l < strip) > 0) bad[l] = 1 }
  { p = $0; sub(/^[^\t]*\t/, "", p)
    if (p ~ /^web\/brand\/mixer\/trends\/[^\/]+\/(sound|vocals)\.m4a$/ ||
        p ~ /^docs\/brand\// ||
        p ~ /^web\/brand\/jam\/projects\// ||
        (p ~ /^examples\// && p != "examples/README.md" && p !~ /^examples\/kitchen\/ketkout-a-grand-entrance\//) ||
        (p ~ /^web\/brand\/mixer\/trends\/.*preview.*\.mp4$/ && ($2 in bad))) print p }' |
  git update-index --force-remove --stdin
