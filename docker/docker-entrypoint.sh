#!/usr/bin/env bash
# Starts the container's servers (docker/Dockerfile, docs/MCP.md "In a container").
#   MCP_MODE=browser (default): the development server on :8080, with the relay a player's tab dials, and the MCP server
#     on :7777 driving that tab.
#   MCP_MODE=headless: only the MCP server, with a game of its own.
# Everything after the image name goes to scripts/mcp.js (node scripts/mcp.js --help lists the options).
set -uo pipefail
cd /series-of-tubes

mode=${MCP_MODE:-browser}
case "$mode" in
  browser|headless) ;;
  *) echo "[entrypoint] MCP_MODE must be browser or headless, not '$mode'" >&2; exit 1 ;;
esac

extra=("$@")
has() { local a; for a in "${extra[@]}"; do [ "$a" = "$1" ] && return 0; done; return 1; }

# A container must listen beyond loopback to be reachable at all; --http in the arguments overrides it.
http=(--http 0.0.0.0:7777)
has --http && http=()

# Listening beyond loopback, the MCP server would take orders from anyone who reaches the port (its Host check stops
# browsers, not other clients), so it gets a token. None given (SOT_MCP_TOKEN or --token-file): this run makes one and
# prints it. MCP_NO_TOKEN=1 turns that off, for a port published to 127.0.0.1 only.
if [ -z "${SOT_MCP_TOKEN:-}" ] && ! has --token-file && [ "${MCP_NO_TOKEN:-}" != 1 ]; then
  SOT_MCP_TOKEN=$(node -e "process.stdout.write(require('node:crypto').randomBytes(24).toString('base64url'))")
  export SOT_MCP_TOKEN
  echo "[entrypoint] No SOT_MCP_TOKEN given: this run's token is $SOT_MCP_TOKEN" >&2
  echo "[entrypoint]   claude mcp add --transport http seriesoftubes http://127.0.0.1:7777/mcp --header \"Authorization: Bearer $SOT_MCP_TOKEN\"" >&2
fi

pids=()
start() { "$@" & pids+=("$!"); }
shutdown() {
  trap '' TERM INT
  kill -TERM "${pids[@]}" 2>/dev/null || true
  wait "${pids[@]}" 2>/dev/null || true
  exit "${1:-0}"
}
trap shutdown TERM INT

# node directly, not npm run: one process less, and signals reach the server.
if [ "$mode" = browser ]; then
  start node scripts/dev.js --host 0.0.0.0 --port 8080
  start node scripts/mcp.js --browser "${http[@]}" "${extra[@]}"
else
  start node scripts/mcp.js "${http[@]}" "${extra[@]}"
fi

# One server stopping stops the container, with its status, so a restart policy can bring both back.
status=0
wait -n || status=$?
echo "[entrypoint] a server exited with status $status; stopping the container" >&2
shutdown "$status"
