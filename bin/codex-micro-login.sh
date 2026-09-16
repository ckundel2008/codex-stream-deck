#!/bin/zsh
set -uo pipefail

project_dir="$(cd "$(dirname "$0")/.." && pwd)"
node_candidate="${CODEX_NODE_BIN:-$(command -v node || true)}"
if [[ -z "$node_candidate" || ! -x "$node_candidate" ]]; then
  print -u2 "Codex Stream Deck: Node.js wurde nicht gefunden."
  exit 1
fi
node_bin="$($node_candidate -p 'process.execPath' 2>/dev/null || true)"
if [[ -z "$node_bin" || ! -x "$node_bin" ]]; then
  print -u2 "Codex Stream Deck: Die Node-Laufzeit ist nicht ausführbar."
  exit 1
fi

cd "$project_dir" || exit 1

# This process owns only the Stream Deck. It never launches, quits, replaces,
# or supervises ChatGPT/Codex. App updates therefore need no bridge restart.
exec env -u NODE_OPTIONS "$node_bin" bin/codex-streamdeck-direct.js
