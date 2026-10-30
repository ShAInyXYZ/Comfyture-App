#!/bin/bash
# Run by git filter-branch on each commit: drops the trend songs (and the hero song's first .m4a copy, now an .mp3), docs/brand, Jam's old project homes,
# examples/ (but its README and the starter projects: Kitchen's Ketkout — A Grand Entrance, Jam's Ketkout no Koe and Praline Lo-Fi, Macaron's Comfyture brand, Toaster's four sets, Cabinet's shoots), and every old version of a trend preview (the ones listed in strip.txt).
STRIP="$(dirname "$0")/strip.txt"
git -c core.quotepath=off ls-files -s | awk -v strip="$STRIP" '
  BEGIN { while ((getline l < strip) > 0) bad[l] = 1 }
  { p = $0; sub(/^[^\t]*\t/, "", p)
    if (p ~ /^web\/brand\/mixer\/trends\/[^\/]+\/(sound|vocals)\.m4a$/ || p == "www/media/hero/praline-lofi.m4a" ||
        p ~ /^docs\/brand\// ||
        p ~ /^web\/brand\/mixer\/trends\/(ramalama|toc-toc)(\/|\.webp$)/ || p == "web/brand/macaron/comfyture/made/ramalama.webp" ||
        p ~ /^web\/brand\/jam\/projects\// ||
        (p ~ /^examples\// && p != "examples/README.md" && p !~ /^examples\/kitchen\/ketkout-a-grand-entrance\// && p !~ /^examples\/jam\/jam-(ketkout-no-koe|praline-lo-fi)\// && p != "examples/macaron/comfyture.brand.json" && p !~ /^examples\/toaster\/toast-example-(woodshop|pickle-leap|perfume|stage)\// && p !~ /^examples\/cabinet\//) ||
        (p ~ /^web\/brand\/mixer\/trends\/.*preview.*\.mp4$/ && ($2 in bad))) print p }' |
  git update-index --force-remove --stdin
