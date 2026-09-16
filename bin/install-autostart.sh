#!/bin/zsh
# Installs only the direct Stream Deck bridge as a per-user launchd service.
set -euo pipefail
start_service=true; dry_run=false
for argument in "$@"; do case "$argument" in --no-start) start_service=false ;; --dry-run) dry_run=true ;; *) print -u2 "Verwendung: $0 [--no-start] [--dry-run]"; exit 2 ;; esac; done

source_dir="$(cd "$(dirname "$0")/.." && pwd -P)"
user_name="$(/usr/bin/id -un)"
user_home="$(/usr/bin/dscl . -read "/Users/$user_name" NFSHomeDirectory 2>/dev/null | /usr/bin/awk '{print $2}')"
[[ -n "$user_home" && -d "$user_home" ]] || { print -u2 "Codex Stream Deck: Home-Verzeichnis des aktuellen Benutzers nicht gefunden."; exit 1; }
runtime_dir="$user_home/Library/Application Support/CodexMicro"; runtime_link="$user_home/.codex-micro"; logs_dir="$user_home/Library/Logs/CodexMicro"
agent_plist="$user_home/Library/LaunchAgents/de.kundel.codex-micro.plist"; plist_source="$source_dir/launchd/de.kundel.codex-micro.plist"; label="de.kundel.codex-micro"; uid="$(/usr/bin/id -u)"
stamp="$(date +%Y%m%d-%H%M%S)"; stage_dir="${runtime_dir}.stage-${stamp}-$$"; runtime_backup="${runtime_dir}.backup-${stamp}"; retired_runtime="${runtime_dir}.retired-${stamp}"; plist_backup="${agent_plist}.backup-${stamp}"
fail() { print -u2 "Codex Stream Deck: $*"; exit 1; }
cleanup_stage() { [[ -d "$stage_dir" ]] && /usr/bin/find "$stage_dir" -depth -delete; }
trap cleanup_stage EXIT

[[ -f "$source_dir/package.json" && -f "$source_dir/bin/codex-streamdeck-direct.js" && -f "$plist_source" && -d "$source_dir/src" && -d "$source_dir/node_modules" ]] || fail "Projektdateien oder npm-Abhängigkeiten fehlen. Bitte npm install ausführen."
[[ ! -e "$runtime_link" || -L "$runtime_link" ]] || fail "$runtime_link existiert und ist kein Symlink."
requested_node="${CODEX_NODE_BIN:-}"; node_candidate="${requested_node:-$(command -v node || true)}"
[[ -n "$node_candidate" && -x "$node_candidate" ]] || fail "Node.js wurde nicht gefunden. Setze CODEX_NODE_BIN oder installiere Node.js >= 22.13."
node_bin="$($node_candidate -p 'process.execPath' 2>/dev/null || true)"; [[ -n "$node_bin" && -x "$node_bin" ]] || fail "Der gefundene Node-Prozess ist nicht ausführbar."
node_version="$($node_bin -p 'process.versions.node' 2>/dev/null || true)"; node_major="${node_version%%.*}"; node_minor="${node_version#*.}"; node_minor="${node_minor%%.*}"
[[ "$node_major" == <-> && "$node_minor" == <-> ]] || fail "Die Node-Version konnte nicht bestimmt werden."
(( node_major > 22 || (node_major == 22 && node_minor >= 13) )) || fail "Node.js >= 22.13 ist erforderlich (gefunden: $node_version)."
(
  cd "$source_dir"
  "$node_bin" --input-type=module -e 'import { DatabaseSync } from "node:sqlite"; new DatabaseSync(":memory:").close(); await import("sharp"); await import("node-hid"); await import("@elgato-stream-deck/node");'
) >/dev/null 2>&1 || fail "node:sqlite oder eine native npm-Abhängigkeit (sharp/node-hid/Stream Deck) ist nicht ladbar."
if $dry_run; then
  print "Node: $node_bin (v$node_version; sqlite und native npm-Abhängigkeiten verfügbar)"
  print "Quelle: $source_dir"; print "Laufzeit: $runtime_dir"
  print "DRY-RUN: Runtime und launchd-Datei würden staged und validiert; danach würde ausschließlich $label neu geladen."
  exit 0
fi

# Build and validate the complete replacement before touching the live bridge.
/bin/mkdir -p "$stage_dir" "$logs_dir" "${agent_plist:h}"
for item in package.json node_modules bin src assets; do [[ -e "$source_dir/$item" ]] && /usr/bin/ditto "$source_dir/$item" "$stage_dir/$item"; done
/bin/chmod 755 "$stage_dir/bin/codex-streamdeck-direct.js" "$stage_dir/bin/codex-micro-login.sh"
"$node_bin" "$source_dir/bin/generate-launchd-plist.js" "$plist_source" "$stage_dir/$label.plist" "$node_bin" "$runtime_dir" "$logs_dir" "$stage_dir/install-manifest.json"
/usr/bin/plutil -lint "$stage_dir/$label.plist" >/dev/null || fail "Die erzeugte launchd-Datei ist ungültig."
(
  cd "$stage_dir"
  "$node_bin" --check bin/codex-streamdeck-direct.js
  "$node_bin" --input-type=module -e 'await import("sharp"); await import("node-hid"); await import("@elgato-stream-deck/node");'
) >/dev/null 2>&1 || fail "Die staged Direct-Bridge oder eine native Abhängigkeit ist nicht ladbar."

# Protect the active runtime before stopping it, then require launchd to report
# it gone before rename/promote so it no longer owns the Stream Deck device.
[[ -e "$runtime_dir" ]] && /usr/bin/ditto "$runtime_dir" "$runtime_backup"
[[ -e "$agent_plist" ]] && /bin/cp -p "$agent_plist" "$plist_backup"
if /bin/launchctl print "gui/$uid/$label" >/dev/null 2>&1; then
  /bin/launchctl bootout "gui/$uid/$label" || fail "Die laufende Direct-Bridge konnte nicht entladen werden."
  unloaded=false; for _ in {1..40}; do if ! /bin/launchctl print "gui/$uid/$label" >/dev/null 2>&1; then unloaded=true; break; fi; /bin/sleep 0.25; done
  $unloaded || fail "Die Direct-Bridge ist noch aktiv; die Runtime bleibt unverändert."
fi
[[ -e "$runtime_dir" ]] && /bin/mv "$runtime_dir" "$retired_runtime"
/bin/mv "$stage_dir" "$runtime_dir"; /bin/cp "$runtime_dir/$label.plist" "$agent_plist"; /bin/rm -f "$runtime_dir/$label.plist"; /bin/ln -sfn "$runtime_dir" "$runtime_link"
rollback() {
  print -u2 "Codex Stream Deck: Neue Bridge fehlgeschlagen; vorherige Runtime und launchd-Datei werden wiederhergestellt und bleiben deaktiviert."
  /bin/launchctl bootout "gui/$uid/$label" 2>/dev/null || true
  [[ -e "$runtime_dir" ]] && /bin/mv "$runtime_dir" "${runtime_dir}.failed-${stamp}"
  [[ -e "$retired_runtime" ]] && /bin/mv "$retired_runtime" "$runtime_dir"
  if [[ -e "$plist_backup" ]]; then /bin/cp "$plist_backup" "$agent_plist"; else /bin/rm -f "$agent_plist"; fi
}
if $start_service; then
  /bin/launchctl enable "gui/$uid/$label"
  /bin/launchctl bootstrap "gui/$uid" "$agent_plist" || { rollback; fail "Die neue Direct-Bridge wurde nicht geladen; die vorherige Runtime wurde wiederhergestellt und nicht gestartet."; }
  print "Codex Stream Deck wurde installiert; nur die Direct-Bridge wurde neu geladen."
else
  /bin/launchctl disable "gui/$uid/$label"
  print "Codex Stream Deck wurde installiert und bleibt aber sicher deaktiviert (--no-start)."
fi
