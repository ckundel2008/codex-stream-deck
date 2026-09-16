#!/usr/bin/env bash
# Launch the ChatGPT app with the Codex Micro node-hid shim injected.
#
# NODE_OPTIONS is only honored at process start and is NOT propagated by macOS's
# `open`, so we exec the app's binary directly with the env set. The app's
# Electron fuses allow EnableNodeOptionsEnvironmentVariable, so --require works
# without modifying any app files.
#
# Start the bridge first (in another terminal):
#   node bin/codex-micro-emulator.js --mode shim
#
# Then run this script.
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP="${CHATGPT_APP:-/Applications/ChatGPT.app}"

if [ ! -d "$APP" ]; then
  echo "ChatGPT app not found at $APP (set CHATGPT_APP to override)." >&2
  exit 1
fi

# Resolve the actual executable (CFBundleExecutable), falling back to first file.
BIN_NAME="$(defaults read "$APP/Contents/Info" CFBundleExecutable 2>/dev/null || true)"
if [ -z "$BIN_NAME" ] || [ ! -x "$APP/Contents/MacOS/$BIN_NAME" ]; then
  BIN_NAME="$(ls "$APP/Contents/MacOS" | head -1)"
fi
BIN="$APP/Contents/MacOS/$BIN_NAME"

SOCK="${CODEX_MICRO_SOCKET:-${TMPDIR:-/tmp/}codex-micro-vhid.sock}"

export NODE_OPTIONS="--require $DIR/shim/preload.cjs"
export CODEX_MICRO_SOCKET="$SOCK"
export CODEX_MICRO_SHIM_LOG="${CODEX_MICRO_SHIM_LOG:-$DIR/shim.log}"
export CODEX_MICRO_AGENT_SLOTS="${CODEX_MICRO_AGENT_SLOTS:-$DIR/agent-slots.json}"

# NODE_OPTIONS only applies to a fresh launch. Never terminate an existing app;
# tell the user to close it themselves if they explicitly want a shimmed launch.
if ps ax -o command= | grep -q '^/Applications/ChatGPT.app/Contents/MacOS/ChatGPT$'; then
  echo "ChatGPT läuft bereits und bleibt geöffnet. Für einen Shim-Start bitte selbst schließen und dieses Programm erneut öffnen." >&2
  exit 2
fi

echo "Launching $BIN_NAME with the Codex Micro shim"
echo "  socket : $SOCK"
echo "  log    : $CODEX_MICRO_SHIM_LOG"
echo "Make sure the bridge is running:  node bin/codex-micro-emulator.js --mode shim"
exec "$BIN"
