# Verification status

Working tree based on release 0.2.0, checked on 2026-09-16 on macOS / Apple Silicon.

| Check | Evidence / limit |
| --- | --- |
| Automated suite | 63 passing tests on Node 24.20.0. Synthetic catalog/events, unread flags, green/gray repaint transitions, mapping, usage, rendering, action stubs, lifecycle and plist generation. The original 56-test release also passed in a clean checkout installed with `npm ci`. |
| Dependency audit | `npm audit --audit-level=high`: zero reported vulnerabilities after updating sharp and tar. This is a registry check, not a guarantee of no vulnerabilities. |
| Native dependencies | sharp, node-hid and the Stream Deck library imported successfully; actual gauge/key buffers rendered. |
| Setup | Read-only doctor and installer dry-run passed. Fresh generated plist passed `plutil -lint`. |
| Installed bridge | Staged replacement and backup completed; launchd reports running and the direct bridge reports device ready. The already-running Codex process was preserved. |
| Local data | Read-only catalog returned five entries with usable states; weekly query returned a valid value. No real task titles or usage values are published here. |
| Read status | Codex's persisted v1 unread state resolved to one account and one local execution host. Installed live readback included finished/unread (`FERTIG`, green) and finished/read (`BEREIT`, gray). Synthetic tests also prove repaint after a new unread result. A physical completion/read transition still needs user observation. |
| Shortcut scripts | All action variants compiled with `osacompile` without executing them. Current installed app metadata confirms Cmd+Shift+A for archive. |
| Physical/UI acceptance | User confirmed task switching, usage display and Open Codex, then confirmed keyboard operation after granting macOS Accessibility permission. Bridge diagnostics also recorded archive and Quick Chat shortcut delivery. This is not an exhaustive acceptance of every action, customized shortcut or app version; approval keys, Fast/fork and voice need deliberate per-user checking. |
| Reboot / fresh Mac | Not performed. Loading a login service is not a reboot test or a fresh-machine install test. |
| Stream Deck + / other models | Not physically tested. Dial mappings have synthetic coverage only. |
| GitHub Actions | Tests run on Node 22 and 24; CodeQL scans Actions, JavaScript, C and Swift. See the [latest hosted results](https://github.com/ckundel2008/codex-stream-deck/actions) for each published commit. Local test results do not establish a hosted CI result. |

An app update, customized shortcut, missing Accessibility grant or changed catalog format can affect operation. The README intentionally describes this as an experimental community integration.
