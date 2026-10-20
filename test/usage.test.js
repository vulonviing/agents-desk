import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createUsage, pickUsage } from '../server/usage.js';

const claude = { provider: 'claude', windows: ['fiveHour', { usedPercent: 42.4, kind: 'fiveHour' }, 'sevenDay', { usedPercent: 89, kind: 'sevenDay' }] };
const codex = { provider: 'codex', windows: ['sevenDay', { usedPercent: 31 }, 'fiveHour', { usedPercent: 0 }] };
const agy = { provider: 'antigravity', windows: [], groupedWindows: ['geminiModels', ['sevenDay', { available: { _0: { usedPercent: 10 } } }], 'gemini4Argon', ['sevenDay', { available: { _0: { usedPercent: 99 } } }]] };

test('pickUsage keeps one window per provider: 5-hour for Claude/Codex, weekly Gemini 4 Argon for Antigravity', () => {
  assert.deepEqual(pickUsage('claude', claude), { percent: 42, window: '5 saat' });
  assert.deepEqual(pickUsage('codex', codex), { percent: 0, window: '5 saat' });
  assert.deepEqual(pickUsage('antigravity', agy), { percent: 99, window: 'haftalık' });
  assert.equal(pickUsage('claude', { windows: [] }), null);
  assert.equal(pickUsage('claude', { windows: ['fiveHour', { usedPercent: 'x' }] }), null);
  assert.equal(pickUsage('other', claude), null);
});

test('createUsage reads rows through the injected runner, caches briefly and degrades to unavailable', async () => {
  const store = join(mkdtempSync(join(tmpdir(), 'usage-')), 'History.store');
  writeFileSync(store, '');
  let calls = 0, t = 1000;
  const rows = [claude, codex, agy, { provider: 'evil' }].map((p) => ({ provider: p.provider, at: 814211417, payload: JSON.stringify(p) }));
  const u = createUsage({ store, now: () => t, run: async () => { calls++; return JSON.stringify(rows); } });
  const first = await u.read();
  assert.equal(first.available, true);
  assert.deepEqual(Object.keys(first.providers).sort(), ['antigravity', 'claude', 'codex']);
  assert.equal(first.providers.claude.percent, 42);
  assert.ok(first.providers.claude.capturedAt > 1.7e12);
  await u.read();
  assert.equal(calls, 1);
  t += 30_000;
  await u.read();
  assert.equal(calls, 2);
  const broken = createUsage({ store, run: async () => { throw new Error('locked'); } });
  assert.deepEqual(await broken.read(), { available: false, providers: {} });
  assert.deepEqual(await createUsage({ store: join(tmpdir(), 'missing.store') }).read(), { available: false, providers: {} });
});
