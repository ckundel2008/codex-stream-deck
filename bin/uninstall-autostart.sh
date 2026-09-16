#!/bin/zsh
# Removes only a runtime carrying this installer's manifest.
set -euo pipefail
dry_run=false
if [[ "${1:-}" == "--dry-run" ]]; then dry_run=true; elif [[ $# -gt 0 ]]; then print -u2 "Verwendung: $0 [--dry-run]"; exit 2; fi
user_name="$(/usr/bin/id -un)"; user_home="$(/usr/bin/dscl . -read "/Users/$user_name" NFSHomeDirectory 2>/dev/null | /usr/bin/awk '{print $2}')"
[[ -n "$user_home" && -d "$user_home" ]] || { print -u2 "Codex Stream Deck: Home-Verzeichnis des aktuellen Benutzers nicht gefunden."; exit 1; }
runtime_dir="$user_home/Library/Application Support/CodexMicro"; runtime_link="$user_home/.codex-micro"; agent_plist="$user_home/Library/LaunchAgents/de.kundel.codex-micro.plist"; trash_dir="$user_home/.Trash"; label="de.kundel.codex-micro"; uid="$(/usr/bin/id -u)"; stamp="$(date +%Y%m%d-%H%M%S)"
fail() { print -u2 "Codex Stream Deck: $*"; exit 1; }; run() { if $dry_run; then print "DRY-RUN: $*"; else "$@"; fi; }
[[ -d "$trash_dir" ]] || fail "Der Papierkorb ist nicht verfügbar; es wurde nichts entfernt."
if [[ -e "$runtime_dir" ]]; then [[ -f "$runtime_dir/install-manifest.json" ]] || fail "Die Runtime hat kein Installationsmanifest; es wurde nichts entfernt."; /usr/bin/grep -Fq '"label":"de.kundel.codex-micro"' "$runtime_dir/install-manifest.json" || fail "Die Runtime gehört nicht eindeutig zu diesem Installer."; fi
if [[ -L "$runtime_link" ]]; then [[ "$(/usr/bin/readlink "$runtime_link")" == "$runtime_dir" ]] || fail "Der vorhandene Symlink gehört nicht zu dieser Runtime."; elif [[ -e "$runtime_link" ]]; then fail "Der vorhandene .codex-micro-Pfad ist kein Symlink."; fi
if [[ -e "$agent_plist" ]]; then /usr/libexec/PlistBuddy -c 'Print :Label' "$agent_plist" 2>/dev/null | /usr/bin/grep -Fxq "$label" || fail "Die launchd-Datei gehört nicht zu diesem Dienst."; fi
if ! $dry_run && /bin/launchctl print "gui/$uid/$label" >/dev/null 2>&1; then
  /bin/launchctl bootout "gui/$uid/$label" || fail "Die Direct-Bridge konnte nicht entladen werden."
  unloaded=false; for _ in {1..40}; do if ! /bin/launchctl print "gui/$uid/$label" >/dev/null 2>&1; then unloaded=true; break; fi; /bin/sleep 0.25; done
  $unloaded || fail "Die Direct-Bridge ist noch aktiv; es wurde nichts entfernt."
fi
run /bin/launchctl disable "gui/$uid/$label" 2>/dev/null || true
[[ -L "$runtime_link" ]] && run /bin/rm "$runtime_link"
[[ -e "$agent_plist" ]] && run /bin/mv "$agent_plist" "$trash_dir/${label}.plist-${stamp}"
[[ -e "$runtime_dir" ]] && run /bin/mv "$runtime_dir" "$trash_dir/CodexMicro-${stamp}"
print "Codex Stream Deck wurde entfernt. Laufzeit und launchd-Datei liegen wiederherstellbar im Papierkorb."
