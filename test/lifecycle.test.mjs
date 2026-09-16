import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const login = readFileSync(new URL("../bin/codex-micro-login.sh", import.meta.url), "utf8");
const installer = readFileSync(new URL("../bin/install-autostart.sh", import.meta.url), "utf8");
const uninstaller = readFileSync(new URL("../bin/uninstall-autostart.sh", import.meta.url), "utf8");
const doctor = readFileSync(new URL("../bin/doctor.js", import.meta.url), "utf8");
const plistGenerator = readFileSync(new URL("../bin/generate-launchd-plist.js", import.meta.url), "utf8");
const plist = readFileSync(new URL("../launchd/de.kundel.codex-micro.plist", import.meta.url), "utf8");

test("autostart owns only the Stream Deck and never supervises ChatGPT", () => {
  assert.doesNotMatch(login, /quit app ["']ChatGPT/);
  assert.doesNotMatch(login, /kill[^\n]*chat_pid/);
  assert.doesNotMatch(login, /NODE_OPTIONS=[^\n]*preload/);
  assert.doesNotMatch(login, /codex-micro-emulator\.js/);
  assert.match(login, /codex-streamdeck-direct\.js/);
  assert.match(login, /never launches, quits, replaces/);
});

test("autostart has no failure restart loop", () => {
  assert.match(plist, /<key>KeepAlive<\/key>\s*<false\/>/);
  assert.doesNotMatch(installer, /kickstart\s+-k/);
  assert.match(installer, /launchctl bootout "gui\/\$uid\/\$label"/);
  assert.match(installer, /launchctl bootstrap "gui\/\$uid"/);
});

test("installer keeps a stable runtime independent of the source folder", () => {
  assert.match(installer, /ln -sfn "\$runtime_dir" "\$runtime_link"/);
  assert.match(installer, /codex-streamdeck-direct\.js/);
  assert.doesNotMatch(installer, /\/Users\/ckundel/);
  assert.match(installer, /--dry-run/);
  assert.match(installer, /node:sqlite/);
});

test("launchd is a portable template with no restart loop", () => {
  assert.match(plist, /__CODEX_NODE_BIN__/);
  assert.match(plist, /__CODEX_MICRO_RUNTIME__/);
  assert.doesNotMatch(plist, /\/Users\/ckundel/);
});

test("installer preserves only documented direct-mode overrides", () => {
  for (const name of ["CODEX_DECK_LOCALE", "CODEX_DECK_FAST_COMMAND", "CODEX_DECK_SPLIT_COMMAND", "CODEX_CLI_BIN"]) {
    assert.match(plistGenerator, new RegExp(name));
  }
  assert.match(plist, /__CODEX_MICRO_ENVIRONMENT__/);
  assert.doesNotMatch(installer, /\$source_dir\/shim/);
  assert.doesNotMatch(installer, /shim\.log/);
});

test("uninstall is recoverable and only targets this bridge", () => {
  assert.match(uninstaller, /\.Trash/);
  assert.match(uninstaller, /de\.kundel\.codex-micro/);
  assert.doesNotMatch(uninstaller, /\/usr\/bin\/(open|osascript)/);
  assert.match(uninstaller, /--dry-run/);
});

test("doctor remains read-only and does not claim a Stream Deck", () => {
  assert.match(doctor, /node:sqlite/);
  assert.match(doctor, /Codex CLI/);
  assert.doesNotMatch(doctor, /StreamDeckBackend|node-hid|\.open\(/);
  assert.match(doctor, /Read-only/);
});

test("installer dry-run validates native dependencies without changing launchd", () => {
  const result = spawnSync("zsh", ["bin/install-autostart.sh", "--dry-run", "--no-start"], {
    cwd: new URL("..", import.meta.url), encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /native npm-Abhängigkeiten verfügbar/);
  assert.match(result.stdout, /DRY-RUN/);
});

test("plist generator persists the selected Node path and only allowlisted environment", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "codex-micro-plist-"));
  const output = path.join(dir, "agent.plist");
  const manifest = path.join(dir, "install-manifest.json");
  const result = spawnSync(process.execPath, ["bin/generate-launchd-plist.js", "launchd/de.kundel.codex-micro.plist", output, "/tmp/node", "/tmp/runtime", "/tmp/logs", manifest], {
    cwd: new URL("..", import.meta.url), encoding: "utf8", env: { ...process.env, CODEX_DECK_LOCALE: "en", CODEX_DECK_FAST_COMMAND: "codex --fast" },
  });
  assert.equal(result.status, 0, result.stderr);
  const generated = readFileSync(output, "utf8");
  assert.match(generated, /<string>\/tmp\/node<\/string>/);
  assert.match(generated, /CODEX_DECK_LOCALE/);
  assert.match(generated, /CODEX_DECK_FAST_COMMAND/);
  assert.doesNotMatch(generated, /CODEX_DECK_SPLIT_COMMAND/);
  assert.match(readFileSync(manifest, "utf8"), /de\.kundel\.codex-micro/);
});

test("installer supports a repair mode that cannot start ChatGPT", () => {
  assert.match(installer, /--no-start/);
  assert.match(installer, /launchctl disable/);
  assert.match(installer, /bleibt aber sicher deaktiviert/);
});
