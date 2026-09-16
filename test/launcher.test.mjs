import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const launcher = readFileSync(
  new URL("../launcher/Codex Stream Deck.applescript", import.meta.url),
  "utf8",
);

test("clickable launcher never terminates ChatGPT", () => {
  assert.doesNotMatch(launcher, /quit application|quit app|kill\s/i);
  assert.doesNotMatch(launcher, /vollständig schließen|erneut öffnen/);
  assert.match(launcher, /Kein App-Neustart nötig/);
});

test("clickable launcher starts the safe service without forced kickstart", () => {
  assert.match(launcher, /launchctl enable/);
  assert.match(launcher, /launchctl bootstrap/);
  assert.match(launcher, /launchctl kickstart/);
  assert.doesNotMatch(launcher, /kickstart\s+-k/);
});

test("clickable launcher derives the current user's home directory", () => {
  assert.match(launcher, /path to home folder/);
  assert.doesNotMatch(launcher, /\/Users\/ckundel/);
});
