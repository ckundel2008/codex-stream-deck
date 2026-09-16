import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_STATE = path.join(os.homedir(), ".codex", ".codex-global-state.json");
const stateCache = new Map();

/** Read only Codex's persisted unread flags; never modify the app's state. */
export function loadUnreadThreadIds(statePath = DEFAULT_STATE) {
  try {
    const stat = fs.statSync(statePath, { bigint: true });
    const signature = `${stat.mtimeNs}:${stat.ctimeNs}:${stat.size}`;
    const cached = stateCache.get(statePath);
    if (cached?.signature === signature) return cached.threadIds;
    const threadIds = unreadThreadIdsFromState(JSON.parse(fs.readFileSync(statePath, "utf8")));
    stateCache.delete(statePath);
    stateCache.set(statePath, { signature, threadIds });
    while (stateCache.size > 16) stateCache.delete(stateCache.keys().next().value);
    return threadIds;
  } catch {
    stateCache.delete(statePath);
    return null;
  }
}

/**
 * Codex v1 scopes unread IDs by account identity and execution host. Without
 * reading credentials we can resolve only one account and one local host.
 * Ambiguous or unsupported state stays unknown, never implicitly "read".
 */
export function unreadThreadIdsFromState(globalState) {
  const state = globalState?.["electron-thread-read-state-v1"];
  if (state?.version !== 1 || !isRecord(state.unreadByIdentity)) return null;
  const identities = Object.values(state.unreadByIdentity);
  if (identities.length !== 1 || !isRecord(identities[0])) return null;
  const localHosts = Object.entries(identities[0]).filter(([key]) => /^local:[0-9a-f]{64}$/i.test(key));
  if (localHosts.length !== 1) return null;
  const ids = localHosts[0][1];
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) return null;
  return new Set(ids);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
