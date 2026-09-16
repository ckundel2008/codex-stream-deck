# Codex Stream Deck

A local macOS bridge that puts **Codex tasks, shortcuts and weekly usage** on an Elgato Stream Deck. Built around the 15-key Stream Deck MK.2, with a separate Stream Deck + layout.

**Community project · MIT license · experimental desktop integration**

[Deutsche Anleitung](docs/README.de.md) · [Troubleshooting](docs/TROUBLESHOOTING.md) · [Development](DEVELOPMENT.md)

![Example MK.2 key layout with synthetic task names and example usage](assets/layout-preview.png)

The image is a software-rendered example, not a hardware acceptance test.

## What it does

- Shows five local tasks, prioritizing running tasks. Press a task key to open it in Codex.
- Uses blue for a running turn, green for a finished unread result, gray once Codex marks it read, and red for an aborted turn. Unknown run state displays recency instead. If read state is unavailable, finished results remain green.
- Displays the remaining ordinary Codex weekly allowance. Unavailable or expired data displays **KEINE DATEN**, never a guessed percentage.
- Provides action keys for Enter, Escape, Fast mode, fork, Quick Chat, archive, voice and opening Codex.
- Runs independently of Codex: no app patching, injected shim or app restart is needed in the recommended direct mode.

## Compatibility and limits

- **macOS only**, Node.js **22.13 or newer** (Node 24 recommended), Codex desktop app and a USB Stream Deck.
- Main hardware target: **Stream Deck MK.2, 15 keys**. Stream Deck + has a layout and unit-tested dial mapping, but is not physically verified by this release. Other models are experimental.
- Requires Codex's local `~/.codex/sqlite/codex-dev.db` catalog and `~/.codex/sessions` layout. Read status uses `electron-thread-read-state-v1` in `~/.codex/.codex-global-state.json`, when it resolves to one account and one local execution host. These are internal formats and can change after Codex updates. Remote/cloud tasks are not represented by local running-state discovery.
- Default key captions and command searches are **German**. English command-search presets are available; see configuration below. App shortcuts may differ with customization, version or language.
- **Approve is Enter; Reject is Escape.** They act on the currently focused Codex control. Enter can also send a draft. They do not validate or select a specific pending approval. Use only while looking at Codex.
- Fast/fork use the command palette and depend on the exact visible command name. Voice is a toggle shortcut, not push-to-talk. Direct-mode reasoning dials require configuring Codex shortcuts; see the troubleshooting guide.
- Key input needs macOS **Accessibility** and **Automation** permission for the process running the bridge. The installer does not grant permissions.
- Software tests and successful USB writes do not prove a physical key's app effect. See [verification status](docs/VERIFICATION.md).

## Install

1. Install [Node.js](https://nodejs.org/en/download) and the Codex desktop app. Open Codex and sign in normally.
2. Download this repository with **Code → Download ZIP**, unpack it, and open Terminal in that folder. Alternatively:

   ```bash
   git clone https://github.com/ckundel2008/codex-stream-deck.git
   cd codex-stream-deck
   ```

3. Install and check:

   ```bash
   npm ci
   npm test
   npm run doctor
   ```

4. Quit the Elgato Stream Deck application using its menu, so the two programs do not compete for the device. Connect the deck and start:

   ```bash
   npm start
   ```

5. Allow the bridge's Node runtime/Terminal to control the Mac when macOS requests it. If shortcuts fail, use [Troubleshooting](docs/TROUBLESHOOTING.md). First test a task key or **Open Codex**; do not use approval keys as a connection test.

Keep the Terminal open while using manual mode. Press **Ctrl+C** to stop it before enabling autostart.

### Start at login

```bash
npm run install:autostart -- --dry-run
npm run install:autostart
```

This copies the runtime into `~/Library/Application Support/CodexMicro`, saves the actual Node executable path, and loads only `de.kundel.codex-micro`. An existing runtime/plist is backed up before replacement. It never quits/restarts Codex or modifies Elgato settings. Disable Elgato's own login startup yourself if it takes the device after login.

To install without starting: `npm run install:autostart -- --no-start`.

To remove the login bridge:

```bash
npm run uninstall:autostart
```

Runtime files and the service plist are moved to Trash. Logs and backups remain for recovery. Reopen Elgato manually to return to its profiles. No Codex tasks or settings are removed.

## Layout (MK.2)

| 1 | 2 | 3 | 4 | 5 |
| --- | --- | --- | --- | --- |
| Task 1 | Task 2 | Task 3 | Task 4 | Task 5 |
| Enter / approve | Escape / reject | Weekly remaining | Fast mode | Fork |
| Quick Chat | Blank | Archive current task | Voice | Open Codex |

Tasks refresh every two seconds. Resumed old tasks are reconciled at least every 30 seconds; discovery is bounded to recent candidates. The weekly value refreshes every minute. A stale `task_started` marker after an app crash may still look running: this is last recorded state, not a liveness guarantee.

## Configuration

Environment variables can be set when starting manually or installing autostart. Only the documented command/CLI overrides are copied to the service:

```bash
CODEX_DECK_LOCALE=en npm start
CODEX_DECK_LOCALE=en npm run install:autostart
```

| Variable | Meaning |
| --- | --- |
| `CODEX_DECK_LOCALE` | Command palette language: `de` (default) or `en`. Does not translate key captions. |
| `CODEX_DECK_FAST_COMMAND` | Exact Fast-mode command palette title, if the preset does not match. |
| `CODEX_DECK_SPLIT_COMMAND` | Exact fork command palette title, if the preset does not match. |
| `CODEX_CLI_BIN` | Absolute path to the Codex CLI used for the weekly gauge. |
| `CODEX_NODE_BIN` | Absolute path to Node used by the installer. Use a normal Node distribution. |

Weekly CLI discovery tries the configured path, Codex.app, the older ChatGPT.app bundle, then `codex` on PATH. A login service has a minimal PATH: configure `CODEX_CLI_BIN` if Codex is installed elsewhere. Reinstall autostart after moving/removing the saved Node version.

## Privacy

The bridge reads task titles, IDs, recency and event markers from the local Codex catalog/session files, plus unread flags from Codex's global state file. It does not change Codex's read flags. Session files can contain conversations, but this integration uses their state markers and does not transmit or log conversation content. Task names are visible to anyone looking at the deck.

The weekly gauge starts the locally installed Codex CLI and calls `account/rateLimits/read`; that CLI uses the user's existing authentication and may contact OpenAI. No separate API key or model request is needed. The bridge itself has no telemetry/upload feature. **Do not upload your `.codex` folder, databases, logs, credentials or real session captures to issues.**

## Credits and license

Derived from [Marcel Pociot's codex-micro-stream-deck-emulator](https://github.com/mpociot/codex-micro-stream-deck-emulator), baseline `7093bd4`. The original MIT copyright notice is retained in [LICENSE](LICENSE). This variant adds the independent direct bridge, MK.2 layout, local task-state discovery, weekly gauge and portable lifecycle tools.

Icons are provided by [Lucide](https://lucide.dev) under its ISC license; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Not affiliated with or endorsed by OpenAI, Elgato or Work Louder. Product names remain their owners' trademarks.
