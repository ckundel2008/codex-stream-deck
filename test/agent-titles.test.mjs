import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  compactAgentTitle,
  loadAgentEntries,
  loadAgentTitles,
  loadThreadRunState,
  loadWorkingThreadIds,
} from "../src/agent-titles.js";

function catalogue() {
  const dir = mkdtempSync(join(tmpdir(), "codex-micro-titles-"));
  const dbPath = join(dir, "catalog.db");
  const sessionsRoot = join(dir, "sessions");
  mkdirSync(sessionsRoot);
  const db = new DatabaseSync(dbPath);
  db.exec(`CREATE TABLE local_thread_catalog (
    host_id TEXT, thread_id TEXT, display_title TEXT,
    source_created_at REAL, source_recency_at REAL,
    missing_candidate INTEGER
  )`);
  const insert = db.prepare("INSERT INTO local_thread_catalog VALUES (?, ?, ?, ?, ?, 0)");
  insert.run("local", "00000000-0000-0000-0000-000000000001", "Erste Aufgabe", 1, 10);
  insert.run("local", "00000000-0000-0000-0000-000000000002", "Zweite Aufgabe", 2, 20);
  db.close();
  return { dir, dbPath, missingSlots: join(dir, "missing-slots.json"), sessionsRoot };
}

test("recent task names update when the catalogue order changes", () => {
  const { dbPath, missingSlots, sessionsRoot } = catalogue();
  assert.deepEqual(loadAgentTitles(2, dbPath, missingSlots, sessionsRoot), ["ZWEITE", "ERSTE"]);

  const db = new DatabaseSync(dbPath);
  db.exec("UPDATE local_thread_catalog SET source_recency_at = 30 WHERE thread_id LIKE '%0001'");
  db.close();
  assert.deepEqual(loadAgentTitles(2, dbPath, missingSlots, sessionsRoot), ["ERSTE", "ZWEITE"]);
});

test("captured Codex slot order wins without shifting empty slots", () => {
  const { dir, dbPath, sessionsRoot } = catalogue();
  const slots = join(dir, "slots.json");
  writeFileSync(slots, JSON.stringify({
    threadKeys: [
      "local:00000000-0000-0000-0000-000000000001",
      null,
      "local:00000000-0000-0000-0000-000000000002",
    ],
  }));
  assert.deepEqual(loadAgentTitles(3, dbPath, slots, sessionsRoot), ["ERSTE", "AGENT", "ZWEITE"]);
});

test("long task titles remain readable on a Stream Deck key", () => {
  assert.equal(compactAgentTitle("Unsichere IP-Anzeige beheben"), "IP-ANZEIGE");
});

test("the newest rollout marker distinguishes working from complete", () => {
  const threadId = syntheticThreadId(new Date(2026, 7, 31, 12));
  const root = mkdtempSync(join(tmpdir(), "codex-micro-sessions-"));
  const directory = join(root, "2026", "08", "31");
  const rollout = join(directory, `rollout-test-${threadId}.jsonl`);
  mkdirSync(directory, { recursive: true });
  writeFileSync(rollout, [
    JSON.stringify({ type: "event_msg", payload: { type: "task_started" } }),
    JSON.stringify({ type: "event_msg", payload: { type: "task_complete" } }),
    JSON.stringify({ type: "event_msg", payload: { type: "task_started" } }),
    "",
  ].join("\n"));

  assert.equal(loadThreadRunState(threadId, root), "working");
  appendFileSync(rollout, `${JSON.stringify({
    type: "event_msg",
    payload: { type: "task_complete" },
  })}\n`);
  assert.equal(loadThreadRunState(threadId, root), "complete");
});

test("a marker completed after an initial partial write updates its state", () => {
  const threadId = syntheticThreadId(new Date(2026, 7, 31, 12));
  const root = mkdtempSync(join(tmpdir(), "codex-micro-partial-rollout-"));
  const directory = join(root, "2026", "08", "31");
  const rollout = join(directory, `rollout-partial-${threadId}.jsonl`);
  mkdirSync(directory, { recursive: true });
  writeFileSync(rollout, '{"type":"event_msg","payload":{"type":"task_started"');

  assert.equal(loadThreadRunState(threadId, root), "unknown");
  appendFileSync(rollout, "}}\n");
  assert.equal(loadThreadRunState(threadId, root), "working");
});

function syntheticThreadId(date) {
  // Rollout lookup derives the creation day from a UUIDv7 timestamp.
  const hex = date.getTime().toString(16).padStart(12, "0");
  return `${hex.slice(0, 8)}-${hex.slice(8)}-7000-8000-000000000011`;
}

test("known long-running tasks stay visible while only recent sessions are rescanned", () => {
  const workingId = "00000000-0000-4000-8000-000000000011";
  const root = mkdtempSync(join(tmpdir(), "codex-micro-known-working-"));
  const oldDirectory = join(root, "2026", "08", "31");
  const newDirectory = join(root, "2026", "09", "01");
  mkdirSync(oldDirectory, { recursive: true });
  mkdirSync(newDirectory, { recursive: true });
  writeFileSync(
    join(oldDirectory, `rollout-working-${workingId}.jsonl`),
    `${JSON.stringify({ type: "event_msg", payload: { type: "task_started" } })}\n`,
  );
  assert.deepEqual(loadWorkingThreadIds(root), [workingId]);
  writeFileSync(
    join(newDirectory, "rollout-complete-00000000-0000-4000-8000-000000000012.jsonl"),
    `${JSON.stringify({ type: "event_msg", payload: { type: "task_complete" } })}\n`,
  );
  assert.deepEqual(loadWorkingThreadIds(root), [workingId]);
});

test("periodic reconciliation discovers an older task resumed after the initial scan", () => {
  const threadId = "00000000-0000-4000-8000-000000000011";
  const root = mkdtempSync(join(tmpdir(), "codex-micro-reconcile-"));
  const oldDirectory = join(root, "2026", "08", "31");
  mkdirSync(oldDirectory, { recursive: true });
  const rollout = join(oldDirectory, `rollout-old-${threadId}.jsonl`);
  writeFileSync(rollout, `${JSON.stringify({ type: "event_msg", payload: { type: "task_complete" } })}\n`);
  for (const day of ["01", "02"]) {
    const directory = join(root, "2026", "09", day);
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      join(directory, `rollout-new-${day}-00000000-0000-4000-8000-000000000012.jsonl`),
      `${JSON.stringify({ type: "event_msg", payload: { type: "task_complete" } })}\n`,
    );
  }

  assert.deepEqual(loadWorkingThreadIds(root, 32, 1_000), []);
  appendFileSync(rollout, `${JSON.stringify({ type: "event_msg", payload: { type: "task_started" } })}\n`);
  assert.deepEqual(loadWorkingThreadIds(root, 32, 1_001), []);
  assert.deepEqual(loadWorkingThreadIds(root, 32, 31_000), [threadId]);
});

test("working tasks precede a delayed recent-task catalogue", () => {
  const workingId = "00000000-0000-4000-8000-000000000011";
  const recentId = "00000000-0000-4000-8000-000000000012";
  const root = mkdtempSync(join(tmpdir(), "codex-micro-live-sessions-"));
  const directory = join(root, "2026", "08", "31");
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    join(directory, `rollout-working-${workingId}.jsonl`),
    `${JSON.stringify({ type: "event_msg", payload: { type: "task_started" } })}\n`,
  );
  writeFileSync(
    join(directory, `rollout-recent-${recentId}.jsonl`),
    `${JSON.stringify({ type: "event_msg", payload: { type: "task_complete" } })}\n`,
  );

  const dbPath = join(root, "catalog.db");
  const db = new DatabaseSync(dbPath);
  db.exec(`CREATE TABLE local_thread_catalog (
    host_id TEXT, thread_id TEXT, display_title TEXT,
    source_created_at REAL, source_recency_at REAL,
    missing_candidate INTEGER
  )`);
  const insert = db.prepare("INSERT INTO local_thread_catalog VALUES ('local', ?, ?, ?, ?, 0)");
  insert.run(workingId, "Laufende Aufgabe", 1, 10);
  insert.run(recentId, "Neuere fertige Aufgabe", 2, 20);
  db.close();

  assert.deepEqual(loadWorkingThreadIds(root), [workingId]);
  assert.deepEqual(
    loadAgentEntries(2, dbPath, null, root).map((entry) => [entry.threadId, entry.runState]),
    [[workingId, "working"], [recentId, "complete"]],
  );
});
