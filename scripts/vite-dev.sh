#!/bin/sh
set -eu

min_major=20

node_major() {
  "$1" -p "Number(process.versions.node.split('.')[0])" 2>/dev/null || true
}

is_supported_node() {
  major="$1"
  [ -n "$major" ] && [ "$major" -ge "$min_major" ] && [ $((major % 2)) -eq 0 ] 2>/dev/null
}

for candidate in \
  "${NODE_BIN:-}" \
  node \
  "$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node" \
  /opt/homebrew/opt/node@24/bin/node \
  /opt/homebrew/opt/node@22/bin/node \
  /opt/homebrew/opt/node@20/bin/node \
  /usr/local/opt/node@24/bin/node \
  /usr/local/opt/node@22/bin/node \
  /usr/local/opt/node@20/bin/node \
  /opt/homebrew/bin/node \
  /usr/local/bin/node; do
  if [ -z "$candidate" ] || ! command -v "$candidate" >/dev/null 2>&1; then
    continue
  fi

  major="$(node_major "$candidate")"
  if is_supported_node "$major"; then
    exec "$candidate" node_modules/vite/bin/vite.js dev "$@"
  fi
done

echo "Vite local dev requires an even-major Node.js ${min_major}+ runtime." >&2
echo "Install or activate Node 20, 22, or 24, then rerun: bun run dev" >&2
exit 1
