#!/bin/sh
# Every five minutes from cron: is the judges' copy up, and how much of the key's balance is left? Tells your phone through ntfy
# when it is down, and once at each of 50, 80 and 100 % of the budget spent.
#   */5 * * * * NTFY=https://ntfy.sh/<a topic only you know> START=<credits on the key at the start> /opt/comfyture/deploy/judge/health.sh
# NTFY is any ntfy topic URL (a public ntfy.sh topic with a long random name, or your own server's). START is the balance in
# credits when judging began (the account window shows it). It reads the server on this machine, so it needs no password.
set -u
URL="${URL:-http://127.0.0.1:5177}"
STATE="${STATE:-/var/lib/comfyture/health}"
mkdir -p "$STATE"
say() { curl -fsS -m 10 -H "Title: Comfyture judges" -d "$1" "$NTFY" >/dev/null 2>&1 || true; }

if ! curl -fsS -m 10 "$URL/api/info" >/dev/null 2>&1; then
  # once while it stays down, again when it comes back
  [ -e "$STATE/down" ] || { say "The judges' copy is not answering at $URL."; touch "$STATE/down"; }
  exit 1
fi
[ -e "$STATE/down" ] && { say "The judges' copy answers again."; rm -f "$STATE/down"; }

left=$(curl -fsS -m 15 "$URL/api/account?refresh=1" | sed -n 's/.*"credits":\([0-9.]*\).*/\1/p')
[ -n "$left" ] && [ -n "${START:-}" ] || exit 0
spent=$(awk -v s="$START" -v l="$left" 'BEGIN { if (s <= 0) print 0; else printf "%d", (s - l) * 100 / s }')
for mark in 50 80 100; do
  if [ "$spent" -ge "$mark" ] && [ ! -e "$STATE/spent-$mark" ]; then
    say "Judges have spent $spent % of the budget: $left credits left of $START."
    touch "$STATE/spent-$mark"
  fi
done
