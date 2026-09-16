import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline';

export function weeklyRemaining(data, now = Date.now()) {
  const bucket = data?.rateLimitsByLimitId != null
    ? data.rateLimitsByLimitId.codex : data?.rateLimits;
  if (!bucket || (bucket.limitId != null && bucket.limitId !== 'codex')) return null;
  const window = [bucket.primary, bucket.secondary].find(w => w?.windowDurationMins === 10080);
  if (!window || typeof window.usedPercent !== 'number' || !Number.isFinite(window.usedPercent)) return null;
  if (typeof window.resetsAt !== 'number' || !Number.isFinite(window.resetsAt) || window.resetsAt * 1000 <= now) return null;
  return Math.max(0, Math.min(100, Math.round(100 - window.usedPercent)));
}

export function resolveCodexCli({ binary, env = process.env, exists = existsSync } = {}) {
  if (binary) return binary;
  if (env.CODEX_CLI_BIN) return env.CODEX_CLI_BIN;
  for (const candidate of [
    '/Applications/Codex.app/Contents/Resources/codex',
    '/Applications/ChatGPT.app/Contents/Resources/codex',
  ]) {
    if (exists(candidate)) return candidate;
  }
  return 'codex';
}

// Use the supported app-server protocol; never read auth files or log payloads.
export function readWeeklyUsage({ binary, timeoutMs = 15000, env, exists, spawnProcess = spawn } = {}) {
  const cli = resolveCodexCli({ binary, env, exists });
  return new Promise(resolve => {
    let child;
    try {
      child = spawnProcess(cli, ['app-server', '--stdio'], { stdio: ['pipe', 'pipe', 'ignore'] });
    } catch {
      resolve(null);
      return;
    }
    let done = false;
    const finish = value => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      lines.close();
      child.stdin.destroy();
      child.kill();
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    const lines = createInterface({ input: child.stdout });
    const send = message => {
      try { child.stdin.write(JSON.stringify(message) + '\n'); } catch { finish(null); }
    };
    child.on('error', () => finish(null));
    child.on('exit', () => finish(null));
    child.stdin.on('error', () => finish(null));
    lines.on('line', line => {
      let message;
      try { message = JSON.parse(line); } catch { return; }
      if (!message || typeof message !== 'object' || Array.isArray(message)) return;
      if (message.id === 1) {
        if (message.error) return finish(null);
        send({ method: 'initialized' });
        send({ id: 2, method: 'account/rateLimits/read' });
      } else if (message.id === 2) finish(message.error ? null : weeklyRemaining(message.result));
    });
    send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'codex_micro_usage', version: '1.0.0' }, capabilities: null } });
  });
}

export function weeklyGaugeSvg(remaining, size = 96) {
  const valid = typeof remaining === 'number' && Number.isFinite(remaining);
  const value = valid ? Math.max(0, Math.min(100, Math.round(remaining))) : null;
  const point = p => { const a = Math.PI * (1 - p / 100); return [48 + 33 * Math.cos(a), 53 - 33 * Math.sin(a)]; };
  const arc = (a, b, color) => {
    const p = point(a), q = point(b);
    return `<path d="M${p} A33 33 0 0 1 ${q}" fill="none" stroke="${color}" stroke-width="7"/>`;
  };
  const tip = valid ? point(value) : null;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 96 96">
    <rect width="96" height="96" rx="10" fill="#10151e"/>
    <rect x="2" y="2" width="92" height="92" rx="9" fill="none" stroke="#596478" stroke-width="2"/>
    <g font-family="Arial,sans-serif" text-anchor="middle" fill="#f5f7fc" font-weight="bold">
    <text x="48" y="15" font-size="11">WOCHE</text>
    ${valid ? arc(0, 25, '#f56363') + arc(25, 60, '#ffc43d') + arc(60, 100, '#32d784') : arc(0, 100, '#596478')}
    ${valid ? `<path d="M48 53 L${tip}" stroke="#fff" stroke-width="3" stroke-linecap="round"/><circle cx="48" cy="53" r="3" fill="#aeb8c8"/>` : ''}
    <text x="48" y="76" font-size="25">${valid ? value + '%' : '–'}</text>
    <text x="48" y="88" font-size="9">${valid ? 'ÜBRIG' : 'KEINE DATEN'}</text></g></svg>`;
}

export async function renderWeeklyGauge(remaining, size) {
  const { default: sharp } = await import('sharp');
  return sharp(Buffer.from(weeklyGaugeSvg(remaining, size))).removeAlpha().raw().toBuffer();
}
