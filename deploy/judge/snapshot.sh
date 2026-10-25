#!/bin/sh
# Once a day from cron: a copy of the judges' data folder (what they made, the ledger of their runs), checked against the folder,
# and only then the oldest copies past three removed. Nothing is moved: a copy that does not check out is kept aside and said.
#   17 4 * * * /opt/comfyture/deploy/judge/snapshot.sh
set -eu
DATA="${DATA:-/var/lib/comfyture/data}"
KEEP="${KEEP:-/var/lib/comfyture/snapshots}"
mkdir -p "$KEEP"
day=$(date +%Y-%m-%d)
dest="$KEEP/$day"

# copy, then check: a second pass that would still change something means the copy is not the folder
rsync -a --delete "$DATA/" "$dest/"
if [ -n "$(rsync -a --delete --checksum --dry-run --itemize-changes "$DATA/" "$dest/")" ]; then
  mv "$dest" "$dest.unchecked"
  echo "snapshot $day differs from $DATA: kept as $dest.unchecked, older copies left alone" >&2
  exit 1
fi

# the copy is good: keep the three newest checked ones
ls -1d "$KEEP"/????-??-?? 2>/dev/null | sort | head -n -3 | while read -r old; do rm -rf -- "$old"; done
