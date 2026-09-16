import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyActionError, directActionForKeycode, directActionScript, openCodexThread, runDirectCodexAction } from "../src/direct-controller.js";

test("deep links validate IDs and explicitly target the Codex bundle", () => {
  const calls = [];
  const run = (...args) => calls.push(args);
  const id = "00000000-0000-4000-8000-000000000001";
  assert.equal(openCodexThread(id, run), true);
  assert.deepEqual(calls[0].slice(0, 2), ["/usr/bin/open", ["-b", "com.openai.codex", `codex://threads/${id}`]]);
  assert.equal(openCodexThread("invalid; command", run), false);
  assert.equal(calls.length, 1);
});

test("direct actions map to the intended shortcut", () => {
  for (const [key, action] of Object.entries({ ACT06: "fast", ACT07: "approve", ACT08: "reject", ACT09: "split", ACT10: "voice", ACT12: "submit" })) {
    assert.equal(directActionForKeycode(key), action);
  }
  assert.match(directActionScript("approve"), /key code 36/);
  assert.match(directActionScript("reject"), /key code 53/);
});

test("commands support configured locale and reject control characters", () => {
  assert.match(directActionScript("fast", { env: {} }), /Schnellmodus umschalten/);
  assert.match(directActionScript("split", { env: {}, locale: "en" }), /Fork chat/);
  assert.equal(directActionScript("fast", { env: {}, locale: "unknown" }), null);
  assert.equal(directActionScript("fast", { env: { CODEX_DECK_FAST_COMMAND: 'x\nkey code 36' } }), null);
  assert.ok(directActionScript("fast", { env: { CODEX_DECK_FAST_COMMAND: 'Custom "fast"' } }).includes(JSON.stringify('Custom "fast"')));
});

test("no shortcut is sent before activation or after activation failure", () => {
  const calls = [];
  const run = (...args) => calls.push(args);
  assert.equal(runDirectCodexAction("voice", { execFile: run }), true);
  assert.equal(calls.length, 1);
  calls[0][2](new Error("not installed"));
  assert.equal(calls.length, 1);
  assert.equal(runDirectCodexAction("unknown", { execFile: run }), false);
  assert.equal(calls.length, 1);
});

test("successful activation sends one bounded, focus-guarded script", () => {
  const calls = [];
  const run = (...args) => calls.push(args);
  runDirectCodexAction("voice", { execFile: run });
  calls[0][2](null);
  assert.equal(calls[1][0], "/usr/bin/osascript");
  assert.equal(calls[1][2].timeout, 8000);
  const script = calls[1][1][1];
  assert.match(script, /application id "com.openai.codex"/);
  assert.match(script, /frontmost is true/);
  assert.doesNotMatch(script, /application "ChatGPT"/);
});

test("open-codex only activates and never sends a key", () => {
  const calls = [];
  runDirectCodexAction("open-codex", { execFile: (...args) => calls.push(args) });
  calls[0][2](null);
  assert.equal(calls.length, 1);
});

test("action failures distinguish privacy permissions without logging raw errors", () => {
  assert.match(classifyActionError({ message: "private text (-1743)" }), /Automation permission/);
  assert.match(classifyActionError({ stderr: "not allowed to send keystrokes. (1002)" }), /Accessibility permission/);
  assert.match(classifyActionError({ message: "Codex is not frontmost" }), /lost focus/);
  assert.doesNotMatch(classifyActionError({ message: "private text", code: 1 }), /private text/);
});
