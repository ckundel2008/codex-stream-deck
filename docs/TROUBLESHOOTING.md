# Troubleshooting / Fehlerbehebung

Start with `npm run doctor`. It checks the environment without opening the Stream Deck or sending input. It does not prove macOS permission grants or hardware operation.

| Symptom | Check |
| --- | --- |
| No Stream Deck found / device busy | USB connection; quit Elgato through its menu; stop duplicate manual bridges. Never run manual and login mode together. |
| No task titles | Codex must have a local catalog and local tasks. A changed database schema is a compatibility issue; do not edit the database. |
| Old task state | A crashed turn can leave a running marker; old resumed tasks are reconciled every 30 seconds. |
| Weekly gauge shows no data | Sign in normally to Codex; check `CODEX_CLI_BIN`. Unsupported, expired or unavailable account data intentionally stays unknown. |
| Task key works, archive/action keys do not | Deep links need no keyboard automation; action keys need macOS Accessibility and Automation permissions. Check the bridge log for a categorized error. |
| Archive appears to do nothing | It sends Cmd+Shift+A to the active Codex task. Confirm that a task is open and its shortcut is unchanged; an active task may have additional app behavior. Test with a disposable task. |
| Fast/fork selects no command | Match `CODEX_DECK_LOCALE` to the app and override the exact command title if necessary. |
| Reasoning dial does nothing | Current app builds may have no default reasoning shortcuts. Assign Cmd+Ctrl+Up / Cmd+Ctrl+Down in Codex keyboard settings, or change `src/direct-controller.js`. Plus hardware is unverified. |
| Login worked before a Node update | The installer records a specific Node executable. Reinstall the bridge after removing/moving that Node installation. |
| Icons missing / native module error | Use a standard Node runtime matching the Mac architecture, then `npm ci`. App-embedded signed runtimes may reject external native modules. |

## macOS permissions

In **System Settings → Privacy & Security → Accessibility**, enable the process macOS identifies as sending keyboard input (the actual Node executable or Terminal for a manual run). In **Automation**, permit the relevant process to control Codex and System Events if requested. Login mode can need a separate grant from Terminal mode. The bridge does not modify the macOS permission database or bypass a denied permission.

German: **Systemeinstellungen → Datenschutz & Sicherheit → Bedienungshilfen** und **Automation**. Aufgabentasten können ohne diese Freigaben funktionieren, während Archivieren und andere Tastenkürzel fehlschlagen.

Read logs locally:

```bash
tail -n 30 "$HOME/Library/Logs/CodexMicro/launch.log"
launchctl print "gui/$(id -u)/de.kundel.codex-micro"
```

Do not paste whole logs publicly. The log distinguishes a delivered keyboard shortcut from a verified application effect.

## Recovery

The installer keeps timestamped `.backup-*` siblings of the prior runtime and plist. To return to a backup, stop only `de.kundel.codex-micro`, preserve the failed runtime, restore the matching runtime/plist pair and load that plist again. Do not delete or overwrite an unknown directory. For ordinary removal prefer `npm run uninstall:autostart`, which uses Trash.

An `IOHIDDeviceSetReport` timeout is not solved by restarting Codex. Stop this bridge, reconnect the USB cable and restart the bridge. The native USB-reset source is reserved for deliberate developer troubleshooting of one exact serial; it is never run automatically.
