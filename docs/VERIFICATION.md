# Verification status

Release candidate 0.2.0, checked on 2026-09-16 on macOS / Apple Silicon.

| Check | Evidence / limit |
| --- | --- |
| Automated suite | 56 passing tests on Node 24.20.0, including a clean checkout installed with `npm ci`. Synthetic catalog/events, mapping, usage, rendering, action stubs, lifecycle and plist generation. |
| Dependency audit | `npm audit --audit-level=high`: zero reported vulnerabilities after updating sharp and tar. This is a registry check, not a guarantee of no vulnerabilities. |
| Native dependencies | sharp, node-hid and the Stream Deck library imported successfully; actual gauge/key buffers rendered. |
| Setup | Read-only doctor and installer dry-run passed. Fresh generated plist passed `plutil -lint`. |
| Installed bridge | Staged replacement and backup completed; launchd reports running and the direct bridge reports device ready. The already-running Codex process was preserved. |
| Local data | Read-only catalog returned five entries with usable states; weekly query returned a valid value. No real task titles or usage values are published here. |
| Shortcut scripts | All action variants compiled with `osacompile` without executing them. Current installed app metadata confirms Cmd+Shift+A for archive. |
| Physical/UI acceptance | User confirmed task switching, usage display and Open Codex, then confirmed keyboard operation after granting macOS Accessibility permission. Bridge diagnostics also recorded archive and Quick Chat shortcut delivery. This is not an exhaustive acceptance of every action, customized shortcut or app version; approval keys, Fast/fork and voice need deliberate per-user checking. |
| Reboot / fresh Mac | Not performed. Loading a login service is not a reboot test or a fresh-machine install test. |
| Stream Deck + / other models | Not physically tested. Dial mappings have synthetic coverage only. |
| GitHub Actions | Workflow prepared for macOS with Node 22 and 24; a local pass does not establish a hosted CI result. |

An app update, customized shortcut, missing Accessibility grant or changed catalog format can affect operation. The README intentionally describes this as an experimental community integration.
