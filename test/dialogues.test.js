import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BUILTIN, KINDS, createDialogues, validateLines } from '../server/dialogues.js';

const office = { name: 'Emrecan CV', floor: 'Kişisel Gelişim', agents: [{ name: 'cv-tailoring-deep', mission: 'CV uyarlar' }], recent: ['CV atölyesi'] };
const tmp = () => mkdtempSync(join(tmpdir(), 'desk-dlg-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('validateLines keeps short safe lines of a known kind, drops links, markdown, long text, duplicates and one-sided visits', () => {
  const lines = validateLines([
    { kind: 'coffee', text: 'Bir kahve iyi gider.' },
    { kind: 'coffee', text: 'bir kahve iyi gider!' }, // duplicate
    { kind: 'news', text: 'Bak: https://x.example' },
    { kind: 'news', text: 'mail@x.com yazdı' },
    { kind: 'window', text: 'x'.repeat(200) },
    { kind: 'nope', text: 'bilinmeyen tür' },
    { kind: 'visit', text: '{other}, selam!' }, // no reply
    { kind: 'visit', text: '{other}, kahve?', reply: 'Olur {name}.' },
    { kind: 'desk', text: '**kalın** yazı' },
  ]);
  assert.deepEqual(lines.map((l) => l.text), ['Bir kahve iyi gider.', '{other}, kahve?']);
  assert.ok(KINDS.every((k) => BUILTIN.some((l) => l.kind === k)), 'built-in lines cover every kind');
});

test('pool: built-in lines at once, one background refresh when stale, cached and reused afterwards (no model call per line)', async () => {
  let calls = 0;
  const dlg = createDialogues({ dataDir: tmp(), run: async (_s, input, _schema, o) => { calls++; assert.equal(o.model, 'haiku'); assert.match(input, /Emrecan CV/); assert.doesNotMatch(input, /prompt|transcript/i); return { lines: [{ kind: 'coffee', text: 'Model kahvesi.' }] }; } });
  const first = dlg.get('cv', office);
  assert.equal(first.source, 'builtin');
  assert.equal(first.refreshing, true);
  assert.ok(first.lines.length >= BUILTIN.length);
  await sleep(30);
  const second = dlg.get('cv', office);
  assert.equal(second.source, 'haiku');
  assert.equal(second.lines[0].text, 'Model kahvesi.');
  for (let i = 0; i < 50; i++) dlg.get('cv', office); // reads are free
  assert.equal(calls, 1);
});

test('pool: refill is capped per day, can be disabled, survives CLI failures and is persisted', async () => {
  const dir = tmp();
  let t = Date.parse('2026-10-20T10:00:00Z');
  let calls = 0;
  const cfg = { dialogues: { maxCallsPerDay: 2, refreshHours: 1 } };
  const dlg = createDialogues({ dataDir: dir, config: () => cfg, now: () => t, run: async () => { calls++; return { lines: [{ kind: 'desk', text: `Satır ${calls}.` }] }; } });
  for (let i = 0; i < 4; i++) { dlg.get('a', office); await sleep(20); t += 2 * 3_600_000; }
  assert.equal(calls, 2, 'daily budget');
  t += 24 * 3_600_000; // next day: budget resets
  dlg.get('a', office); await sleep(20);
  assert.equal(calls, 3);
  // persisted: a new instance reads the cache without calling the model
  const again = createDialogues({ dataDir: dir, config: () => ({ dialogues: { enabled: false } }), now: () => t, run: async () => { throw new Error('must not run'); } });
  assert.ok(again.get('a', office).lines.some((l) => /Satır/.test(l.text)));
  // failures fall back to the built-in lines
  const broken = createDialogues({ dataDir: tmp(), run: async () => { throw new Error('boom'); } });
  broken.get('b', office); await sleep(20);
  assert.equal(broken.get('b', office).source, 'builtin');
  assert.ok(broken.status().usage.calls >= 1);
});
