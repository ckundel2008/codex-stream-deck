import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadUnreadThreadIds, unreadThreadIdsFromState } from "../src/thread-read-state.js";

const threadId = "00000000-0000-4000-8000-000000000011";
const localHost = `local:${"a".repeat(64)}`;
function state(ids = [threadId]) {
  return { "electron-thread-read-state-v1": {
    version: 1,
    unreadByIdentity: { account: { [localHost]: ids, "remote-ssh-discovered:example": [] } },
  } };
}

test("Codex's current local unread list distinguishes unread and read tasks", () => {
  assert.equal(unreadThreadIdsFromState(state()).has(threadId), true);
  assert.equal(unreadThreadIdsFromState(state([])).has(threadId), false);
});

test("unread flags update after Codex marks a task read without modifying its state file", () => {
  const p = join(mkdtempSync(join(tmpdir(), "codex-deck-read-state-")), "state.json");
  const unread = JSON.stringify(state());
  writeFileSync(p, unread);
  assert.equal(loadUnreadThreadIds(p).has(threadId), true);
  assert.equal(readFileSync(p, "utf8"), unread);
  writeFileSync(p, JSON.stringify(state([])));
  assert.equal(loadUnreadThreadIds(p).has(threadId), false);
});

test("multiple accounts or local hosts are ambiguous instead of marking results read", () => {
  const accounts = state();
  accounts["electron-thread-read-state-v1"].unreadByIdentity.other = { [localHost]: [] };
  assert.equal(unreadThreadIdsFromState(accounts), null);
  const hosts = state();
  hosts["electron-thread-read-state-v1"].unreadByIdentity.account[`local:${"b".repeat(64)}`] = [];
  assert.equal(unreadThreadIdsFromState(hosts), null);
});

test("unsupported, malformed or missing unread state remains unknown", () => {
  assert.equal(loadUnreadThreadIds(join(tmpdir(), "missing-codex-read-state.json")), null);
  for (const invalid of [null, {}, state(null), state([42]), state(["not-a-thread-id"])]) {
    assert.equal(unreadThreadIdsFromState(invalid), null);
  }
  const unsupported = state();
  unsupported["electron-thread-read-state-v1"].version = 2;
  assert.equal(unreadThreadIdsFromState(unsupported), null);
});
