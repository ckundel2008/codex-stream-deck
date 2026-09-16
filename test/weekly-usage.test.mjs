import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { weeklyRemaining, renderWeeklyGauge, weeklyGaugeSvg, readWeeklyUsage, resolveCodexCli } from '../src/weekly-usage.js';
import { DEFAULT_LAYOUT, resolveKey } from '../src/mapping.js';
import { StreamDeckBackend } from '../src/streamdeck.js';
const window = { usedPercent: 2, windowDurationMins: 10080, resetsAt: 2000000000 };
const snapshot = primary => ({ rateLimitsByLimitId: { codex: { primary } } });
test('weekly primary and secondary; excludes model-specific limits', () => {
  assert.equal(weeklyRemaining(snapshot(window)), 98);
  assert.equal(weeklyRemaining({ rateLimitsByLimitId: { codex: { primary: { ...window, windowDurationMins: 300 }, secondary: window }, codex_bengalfox: { primary: { ...window, usedPercent: 99 } } } }), 98);
  assert.equal(weeklyRemaining({ rateLimits: { primary: window } }), 98);
  assert.equal(weeklyRemaining({ rateLimitsByLimitId: {}, rateLimits: { primary: window } }), null);
});
test('missing, expired and invalid values never become free quota', () => {
  for (const usedPercent of [null, undefined, '2', NaN, Infinity]) assert.equal(weeklyRemaining(snapshot({ ...window, usedPercent })), null);
  for (const resetsAt of [1, NaN, Infinity]) assert.equal(weeklyRemaining(snapshot({ ...window, resetsAt })), null);
  assert.equal(weeklyRemaining(snapshot({ ...window, windowDurationMins: 300 })), null);
  assert.equal(weeklyRemaining(snapshot({ ...window, usedPercent: 110 })), 0);
  assert.equal(weeklyRemaining(snapshot({ ...window, usedPercent: -5 })), 100);
});
test('actual RGB renders at hardware size, missing data has no needle', async () => {
  for (const value of [0, 38, 98, 100, null]) assert.equal((await renderWeeklyGauge(value, 72)).length, 72 * 72 * 3);
  assert.match(weeklyGaugeSvg(null), /KEINE DATEN/);
  assert.doesNotMatch(weeklyGaugeSvg(null), /<circle/);
});
test('only the approved blank key becomes a read-only gauge', () => {
  assert.equal(DEFAULT_LAYOUT.length, 15);
  assert.equal(DEFAULT_LAYOUT[7].kind, 'usage');
  assert.equal(DEFAULT_LAYOUT[11].kind, 'empty');
  assert.equal(resolveKey(7), null);
  assert.equal(resolveKey(6).keycode, 'ACT08');
  assert.equal(resolveKey(8).keycode, 'ACT06');
});
test('refresh writes success and unavailable values, stop prevents a late write', async () => {
  const backend = new StreamDeckBackend({ lighting: {} }, { readWeeklyUsage: async () => 98 });
  backend.deck = {};
  const writes = [];
  backend._drawUsage = async (i, value) => writes.push([i, value]);
  await backend._refreshUsage();
  backend.readWeeklyUsage = async () => { throw Error('offline'); };
  await backend._refreshUsage();
  assert.deepEqual(writes, [[7, 98], [7, null]]);
  let finish;
  backend.readWeeklyUsage = () => new Promise(resolve => { finish = resolve; });
  const pending = backend._refreshUsage();
  await backend.stop();
  finish(50);
  await pending;
  assert.equal(writes.length, 2);
});
test('CLI discovery prefers explicit configuration and supports both macOS app bundles', () => {
  assert.equal(resolveCodexCli({ binary: '/custom/codex' }), '/custom/codex');
  assert.equal(resolveCodexCli({ env: { CODEX_CLI_BIN: '/configured/codex' } }), '/configured/codex');
  assert.equal(resolveCodexCli({ env: {}, exists: path => path.includes('/Codex.app/') }), '/Applications/Codex.app/Contents/Resources/codex');
  assert.equal(resolveCodexCli({ env: {}, exists: path => path.includes('/ChatGPT.app/') }), '/Applications/ChatGPT.app/Contents/Resources/codex');
  assert.equal(resolveCodexCli({ env: {}, exists: () => false }), 'codex');
});

test('app-server spawn and protocol failures fail closed', async () => {
  assert.equal(await readWeeklyUsage({ spawnProcess: () => { throw Error('missing'); } }), null);
  for (const outcome of ['error', 'initialize-error', 'rate-limit-error', 'null-message']) {
    const child = fakeChild();
    const result = readWeeklyUsage({ timeoutMs: 100, spawnProcess: () => child });
    queueMicrotask(() => {
      if (outcome === 'error') child.emit('error', Error('offline'));
      else if (outcome === 'null-message') {
        child.stdout.write('null\n');
        child.emit('error', Error('offline'));
      } else child.stdout.write(`${JSON.stringify(outcome === 'initialize-error'
          ? { id: 1, error: { message: 'nope' } }
          : { id: 2, error: { message: 'nope' } })}\n`);
    });
    assert.equal(await result, null);
  }
});

function fakeChild() {
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.kill = () => {};
  return child;
}
