#!/bin/bash
# Publishes main to the public repo, ShAInyXYZ/Comfyture-App, with a cleaned history: every commit and date kept, but no trend
# songs, no docs/brand/, no old trend previews and no examples/ (filter.sh says exactly what goes). The filter gives the same
# commit ids each time, so each publish is a plain push on top of the last. To publish a curated example, let filter.sh keep it.
#
#   bash scripts/public/publish.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"; repo="$(cd "$here/../.." && pwd)"
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
git clone -q --no-local --single-branch --branch main "$repo" "$work/pub"
cd "$work/pub"
FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch -f --index-filter "$here/filter.sh" -- main >/dev/null
# grep without -q reads every line: with -q it can stop early, break the pipe and, under pipefail, let a song through
if git log main --name-only --format= | grep '\.m4a$' >/dev/null; then echo "a song is still in the history; not publishing" >&2; exit 1; fi
git push https://github.com/ShAInyXYZ/Comfyture-App.git main:main
