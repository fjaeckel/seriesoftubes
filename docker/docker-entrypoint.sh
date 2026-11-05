#!/usr/bin/env bash
set -u
cd /series-of-tubes

# MCP_MODE picks what runs: browser (default) serves the game page and relays the
# player's tab to the MCP server; headless runs a game of its own, no page needed.
mode=${MCP_MODE:-browser}
case "$mode" in
  browser|headless) ;;
  *) echo "[entrypoint] MCP_MODE must be browser or headless, not '$mode'" >&2; exit 1 ;;
esac

# Everything after the image name is passed to the MCP server as well
# (node scripts/mcp.js --help lists the options).
extra=("$@")

# A container needs 0.0.0.0 to be reachable at all; default --http unless given.
http=(--http 0.0.0.0:7777)
for a in "${extra[@]}"; do [ "$a" = --http ] && http=(); done

pids=()
start() { "$@" & pids+=("$!"); }

shutdown() {
  trap '' TERM INT
  kill -TERM "${pids[@]}" 2>/dev/null
  wait "${pids[@]}" 2>/dev/null
  exit 0
}
trap shutdown TERM INT

if [ "$mode" = browser ]; then
  start npm run dev -- --host 0.0.0.0 --port 8080
  start npm run mcp -- --browser "${http[@]}" "${extra[@]}"
else
  start npm run mcp -- "${http[@]}" "${extra[@]}"
fi

status=0
wait -n || status=$?
echo "[entrypoint] a process exited with status $status; stopping the container" >&2
shutdown
