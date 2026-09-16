import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_CATALOG = path.join(os.homedir(), ".codex", "sqlite", "codex-dev.db");
const DEFAULT_SESSIONS = path.join(os.homedir(), ".codex", "sessions");
const DEFAULT_SLOTS = path.join(
  os.homedir(), "Library", "Application Support", "CodexMicro", "agent-slots.json",
);
const rolloutStateCache = new Map();
const rolloutPathCache = new Map();
const workingRolloutPaths = new Map();
const sessionScanState = new Map();
const RECENT_SESSION_DAYS = 2;
const FULL_RECONCILE_MS = 30_000;
const CACHE_LIMIT = 512;

// Opening verbs and filler words carry little meaning on a 72 px key. Prefer
// the first distinctive word, optionally joined with one short neighbour.
const TITLE_FILLERS = new Set([
  "der", "die", "das", "den", "dem", "des", "ein", "eine", "einen",
  "und", "oder", "mit", "für", "auf", "von", "zu", "im", "in",
  "mach", "mache", "prüfe", "pruefe", "check", "räume", "raeume",
  "erweitere", "repariere", "behebe", "erstelle", "baue", "stabilisiere",
  "unsichere",
]);

/** Turn a full Codex task title into a readable Stream Deck label. */
export function compactAgentTitle(title, maxLength = 11) {
  const words = String(title ?? "")
    .replace(/[–—]/g, "-")
    .split(/[\s/]+/)
    .map((word) => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}-]+$/gu, ""))
    .filter(Boolean);
  const meaningful = words.filter((word) => !TITLE_FILLERS.has(word.toLocaleLowerCase("de-DE")));
  const selected = meaningful.length ? meaningful : words;
  if (!selected.length) return "AGENT";

  let label = selected[0];
  if (label.length > maxLength && label.includes("-")) {
    const parts = label.split("-").filter(Boolean);
    const firstTwo = parts.slice(0, 2).join("-");
    label = firstTwo.length <= maxLength ? firstTwo : parts[0];
  }
  if (selected[1] && label.length <= 6 && `${label} ${selected[1]}`.length <= maxLength) {
    label = `${label} ${selected[1]}`;
  }
  if (label.length > maxLength) label = label.slice(0, maxLength);
  return label.toLocaleUpperCase("de-DE");
}

/** Read the same local recent-task catalogue used by the Codex desktop app. */
export function loadAgentTitles(
  limit = 5,
  dbPath = DEFAULT_CATALOG,
  slotsPath = DEFAULT_SLOTS,
  sessionsRoot = DEFAULT_SESSIONS,
) {
  return loadAgentEntries(limit, dbPath, slotsPath, sessionsRoot).map((entry) => entry.title);
}

/**
 * Read task ids, labels, and recency for Stream Deck agent keys.
 * Pass `null` as slotsPath for the standalone/direct mode: it deliberately
 * follows Codex's live recent-task catalogue instead of a stale shim capture.
 */
export function loadAgentEntries(
  limit = 5,
  dbPath = DEFAULT_CATALOG,
  slotsPath = DEFAULT_SLOTS,
  sessionsRoot = DEFAULT_SESSIONS,
) {
  let db;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
    const capturedThreadIds = slotsPath === null ? null : loadAgentThreadIds(slotsPath);
    if (capturedThreadIds !== null) {
      const threadIds = capturedThreadIds.slice(0, limit);
      const findTitle = db.prepare(
        `SELECT thread_id, display_title, source_recency_at
           FROM local_thread_catalog
          WHERE thread_id = ?
            AND missing_candidate = 0
            AND display_title <> ''
          ORDER BY source_recency_at DESC
          LIMIT 1`,
      );
      return threadIds.map((threadId) => {
        if (!threadId) return { threadId: null, title: "AGENT", recencyAt: null };
        const row = findTitle.get(threadId);
        return row
          ? {
              threadId: row.thread_id,
              title: compactAgentTitle(row.display_title),
              fullTitle: row.display_title,
              recencyAt: Number(row.source_recency_at) || null,
              runState: loadThreadRunState(row.thread_id, sessionsRoot),
            }
          : { threadId, title: "AGENT", recencyAt: null, runState: "unknown" };
      });
    }
    const recentRows = db.prepare(
      `SELECT thread_id, display_title, source_recency_at
         FROM local_thread_catalog
        WHERE host_id = 'local'
          AND missing_candidate = 0
          AND display_title <> ''
        ORDER BY source_recency_at DESC, source_created_at DESC, thread_id
        LIMIT ?`,
    ).all(Math.max(limit * 3, limit));
    const findLiveTitle = db.prepare(
      `SELECT thread_id, display_title, source_recency_at
         FROM local_thread_catalog
        WHERE host_id = 'local'
          AND thread_id = ?
          AND missing_candidate = 0
          AND display_title <> ''
        LIMIT 1`,
    );
    const liveRows = loadWorkingThreadIds(sessionsRoot)
      .map((threadId) => findLiveTitle.get(threadId))
      .filter(Boolean);
    const seen = new Set();
    const rows = [...liveRows, ...recentRows]
      .filter((row) => {
        if (seen.has(row.thread_id)) return false;
        seen.add(row.thread_id);
        return true;
      })
      .slice(0, limit);
    return rows.map((row) => ({
      threadId: row.thread_id,
      title: compactAgentTitle(row.display_title),
      fullTitle: row.display_title,
      recencyAt: Number(row.source_recency_at) || null,
      runState: loadThreadRunState(row.thread_id, sessionsRoot),
    }));
  } catch {
    return [];
  } finally {
    try { db?.close(); } catch { /* read-only best effort */ }
  }
}

/**
 * Discover currently running local tasks by rollout activity. The catalogue's
 * source_recency_at is only committed after some active turns finish, so it
 * cannot by itself keep the five physical keys current.
 */
export function loadWorkingThreadIds(sessionsRoot = DEFAULT_SESSIONS, candidateLimit = 32, now = Date.now()) {
  const knownWorking = workingRolloutPaths.get(sessionsRoot) ?? new Map();
  cacheSet(workingRolloutPaths, sessionsRoot, knownWorking, 32);
  const active = [];
  for (const [threadId, filePath] of knownWorking) {
    cacheSet(rolloutPathCache, rolloutCacheKey(threadId, sessionsRoot), filePath);
    if (loadThreadRunState(threadId, sessionsRoot) === "working") active.push(threadId);
    else knownWorking.delete(threadId);
  }

  const candidates = [];
  try {
    // The first scan and a periodic reconciliation discover resumes in older
    // sessions. The 2-second refresh otherwise checks only recent days and
    // already-known working rollouts.
    const scanState = sessionScanState.get(sessionsRoot);
    const fullReconciliation = !scanState || now - scanState.lastFullAt >= FULL_RECONCILE_MS;
    const dayPaths = sessionDayPaths(sessionsRoot, fullReconciliation ? null : RECENT_SESSION_DAYS);
    if (fullReconciliation) cacheSet(sessionScanState, sessionsRoot, { lastFullAt: now }, 32);
    for (const dayPath of dayPaths) {
      for (const file of fs.readdirSync(dayPath, { withFileTypes: true })) {
        if (!file.isFile() || !file.name.endsWith(".jsonl")) continue;
        const match = file.name.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i);
        if (!match || knownWorking.has(match[1])) continue;
        const filePath = path.join(dayPath, file.name);
        try {
          candidates.push({
            threadId: match[1],
            filePath,
            mtimeMs: fs.statSync(filePath).mtimeMs,
          });
        } catch {
          /* file disappeared during a catalogue refresh */
        }
      }
    }
  } catch {
    return [];
  }

  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const seen = new Set();
  for (const candidate of candidates.slice(0, candidateLimit)) {
    if (seen.has(candidate.threadId)) continue;
    seen.add(candidate.threadId);
    cacheSet(rolloutPathCache, rolloutCacheKey(candidate.threadId, sessionsRoot), candidate.filePath);
    if (loadThreadRunState(candidate.threadId, sessionsRoot) === "working") {
      knownWorking.set(candidate.threadId, candidate.filePath);
      if (!active.includes(candidate.threadId)) active.push(candidate.threadId);
    }
  }
  return active;
}

function sessionDayPaths(sessionsRoot, limit) {
  const days = [];
  try {
    for (const year of fs.readdirSync(sessionsRoot, { withFileTypes: true })) {
      if (!year.isDirectory()) continue;
      const yearPath = path.join(sessionsRoot, year.name);
      for (const month of fs.readdirSync(yearPath, { withFileTypes: true })) {
        if (!month.isDirectory()) continue;
        const monthPath = path.join(yearPath, month.name);
        for (const day of fs.readdirSync(monthPath, { withFileTypes: true })) {
          if (day.isDirectory()) days.push(path.join(monthPath, day.name));
        }
      }
    }
  } catch {
    return [];
  }
  days.sort((a, b) => b.localeCompare(a));
  return limit == null ? days : days.slice(0, limit);
}

/**
 * Read only the tail of a task rollout and determine its current turn state.
 * The newest task_started/task_complete marker wins; message contents are
 * deliberately ignored.
 */
export function loadThreadRunState(threadId, sessionsRoot = DEFAULT_SESSIONS) {
  const rolloutPath = rolloutPathForThread(threadId, sessionsRoot);
  if (!rolloutPath) return "unknown";

  let fd;
  try {
    fd = fs.openSync(rolloutPath, "r");
    const size = fs.fstatSync(fd).size;
    let cached = rolloutStateCache.get(rolloutPath);
    if (!cached || size < cached.size) {
      const initial = latestRunStateFromFile(fd, size);
      cached = {
        size,
        state: initial.state,
        partial: initial.partial,
      };
      cacheSet(rolloutStateCache, rolloutPath, cached);
      return cached.state;
    }
    if (size === cached.size) return cached.state;

    const appended = Buffer.alloc(size - cached.size);
    fs.readSync(fd, appended, 0, appended.length, cached.size);
    const lines = `${cached.partial}${appended.toString("utf8")}`.split("\n");
    cached.partial = lines.pop() ?? "";
    for (const line of lines) cached.state = runStateFromLine(line) ?? cached.state;
    cached.size = size;
    return cached.state;
  } catch {
    return "unknown";
  } finally {
    try { if (fd !== undefined) fs.closeSync(fd); } catch { /* read-only best effort */ }
  }
}

function latestRunStateFromFile(fd, size) {
  let position = size;
  let trailingFragment = "";
  let finalPartial = "";
  let state = null;
  let firstChunk = true;
  while (position > 0) {
    const length = Math.min(position, 256 * 1024);
    position -= length;
    const buffer = Buffer.alloc(length);
    fs.readSync(fd, buffer, 0, length, position);
    const lines = `${buffer.toString("utf8")}${trailingFragment}`.split("\n");
    if (firstChunk) {
      finalPartial = lines.pop() ?? "";
      state = runStateFromLine(finalPartial);
      firstChunk = false;
    }
    trailingFragment = lines.shift() ?? "";
    for (let index = lines.length - 1; index >= 0; index--) {
      state = runStateFromLine(lines[index]);
      if (state) return { state, partial: finalPartial };
    }
  }
  return { state: state ?? runStateFromLine(trailingFragment) ?? "unknown", partial: finalPartial };
}

function runStateFromLine(line) {
  if (!line) return null;
  try {
    const record = JSON.parse(line);
    if (record?.type !== "event_msg") return null;
    if (record.payload?.type === "task_started") return "working";
    if (record.payload?.type === "task_complete") return "complete";
    if (record.payload?.type === "turn_aborted") return "error";
  } catch {
    // A record can be incomplete while Codex is appending it.
  }
  return null;
}

function rolloutPathForThread(threadId, sessionsRoot) {
  const cacheKey = rolloutCacheKey(threadId, sessionsRoot);
  const cached = rolloutPathCache.get(cacheKey);
  if (cached && fs.existsSync(cached)) return cached;
  const compact = String(threadId ?? "").replaceAll("-", "");
  if (!/^[0-9a-f]{32}$/i.test(compact)) return null;
  const createdAt = new Date(Number.parseInt(compact.slice(0, 12), 16));
  if (!Number.isFinite(createdAt.getTime())) return null;

  const year = String(createdAt.getFullYear());
  const month = String(createdAt.getMonth() + 1).padStart(2, "0");
  const day = String(createdAt.getDate()).padStart(2, "0");
  const directory = path.join(sessionsRoot, year, month, day);
  try {
    const suffix = `${threadId}.jsonl`;
    const matches = fs.readdirSync(directory)
      .filter((name) => name.endsWith(suffix))
      .sort();
    const found = matches.length ? path.join(directory, matches.at(-1)) : null;
    if (found) cacheSet(rolloutPathCache, cacheKey, found);
    return found;
  } catch {
    return null;
  }
}

function rolloutCacheKey(threadId, sessionsRoot) {
  return `${sessionsRoot}\u0000${threadId}`;
}

function cacheSet(cache, key, value, limit = CACHE_LIMIT) {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > limit) cache.delete(cache.keys().next().value);
}

/** Read Codex's captured slot keys and normalize local/remote key formats. */
export function loadAgentThreadIds(slotsPath = DEFAULT_SLOTS) {
  try {
    const payload = JSON.parse(fs.readFileSync(slotsPath, "utf8"));
    if (!Array.isArray(payload.threadKeys)) return null;
    return payload.threadKeys
      .map((key) => {
        if (typeof key === "string") {
          const match = key.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
          return match?.[0] ?? null;
        }
        if (key && typeof key === "object") {
          return key.threadId ?? key.thread_id ?? key.id ?? null;
        }
        return null;
      });
  } catch {
    return null;
  }
}
