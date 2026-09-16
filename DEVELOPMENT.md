# Development

## Direct mode (recommended)

`bin/codex-streamdeck-direct.js` creates a `StreamDeckBackend`, reads local task state and reconnects after device errors. No Codex process is patched or supervised.

| Module | Responsibility |
| --- | --- |
| `src/mapping.js` | MK.2/Plus key positions and dial mapping |
| `src/streamdeck.js` | USB control, serialized rendering, key events and refresh timers |
| `src/agent-titles.js` | Read-only SQLite catalog, bounded rollout-tail cache and running task discovery |
| `src/direct-controller.js` | Validated task deep links and foreground-guarded macOS shortcuts |
| `src/weekly-usage.js` | Codex app-server usage query and gauge rendering |
| `src/renderer.js`, `src/keycaps.js` | Local Lucide key rendering |
| `bin/install-autostart.sh` | Staged per-user runtime installation; only the bridge service is reloaded |

Use Node >=22.13 (built-in `node:sqlite`). Native dependencies must match the Node architecture. Standard Node distributions avoid the native-library signing restrictions of app-embedded runtimes.

```bash
npm ci
npm test
npm audit
npm run doctor
npm run install:autostart -- --dry-run
```

Tests inject subprocess/device stubs and use synthetic SQLite/JSONL fixtures. They must never activate applications, archive real tasks, send input, claim physical HID devices or read authentication files. Local inspection of app command metadata is evidence about that app version, not a cross-version compatibility promise.

## Runtime boundaries

Read-only catalog location: `~/.codex/sqlite/codex-dev.db`, table `local_thread_catalog`. Running state comes from the latest `event_msg` marker (`task_started`, `task_complete`, `turn_aborted`) in local rollout files. Unknown/missing data must stay unknown. Older resumed tasks are reconciled periodically to avoid scanning all history every two seconds. Discovery considers a bounded set of recently modified candidates; it is not an exhaustive task manager.

The weekly query exchanges only app-server initialization and `account/rateLimits/read`. It selects the `codex` bucket and a 10080-minute window, validates reset time, and displays unavailable data conservatively. No response payload is written to logs.

Action scripts identify `com.openai.codex` rather than relying on an application filename. After a user key press, activation must succeed and the frontmost process must still be Codex before keys are sent. Shortcuts are UI automation, not an approval API. The focused control and customized app keybindings still matter. macOS permissions are managed by the user.

## Hardware acceptance

Check the actual deck separately from tests: correct labels, current status, a task key opening exactly the displayed task, then each configured shortcut on a disposable task. Never use a real pending approval as a connectivity test. Test both manual and login mode; reboot persistence requires a real logout/reboot. Plus dials need a real Plus before claiming support.

The bridge loads `enableNonExclusiveHid()` before the Elgato wrapper. Do not open a second bridge to test the live deck. Stop only this project's LaunchAgent before a deliberate reconnect; do not kill or restart Codex.

## Legacy protocol experiments

`bin/codex-micro-emulator.js`, `shim/`, `native/CodexMicroVirtualHID/`, `scripts/start.sh` and the transport modules preserve the upstream virtual-device experiments. They are **not part of the supported installation path**, are not installed by the direct-mode installer, and are not required to use this project. Their app-version compatibility and Apple entitlement requirements have not been revalidated for this release. Do not run the legacy sudo/helper launcher as a normal setup step.

The original protocol framing is covered by tests: 64-byte HID reports, report ID 0x06, RPC channel 2, 61-byte payloads. Inbound bare JSON is reassembled by balanced braces; outbound messages end with a newline. Keep the upstream MIT notice when redistributing this code.

`native/reset-streamdeck-usb.c` is a manual troubleshooting source, not an automatic repair mechanism. It requires the explicitly selected device serial. Never reset arbitrary USB devices or run it against a device owned by another program.

## Release checks

- Clean `npm ci`, all tests, dependency audit and doctor.
- Inspect the exact Git tree for local paths, logs, captures, database files and credentials.
- Keep README compatibility and `docs/VERIFICATION.md` honest about physical/UI tests.
- Preserve upstream attribution and dependency notices.
- CI runs synthetic tests on Node 22 and 24; no user data or secrets are needed.
