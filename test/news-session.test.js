import test from 'node:test';
import assert from 'node:assert/strict';
import { createNewsSession } from '../server/news-session.js';
import { createNewsBoard } from '../server/news-board.js';
import { createDialogues } from '../server/dialogues.js';
import { tmp } from './helpers.js';

function fixture() {
  let time = 1_790_000_000_000, budget = true, fail = null, boardStage = null, pools = [];
  const dataDir = tmp();
  const calls = [], publications = [], events = [];
  const board = {
    async refresh(force, edition) { calls.push(['board', edition]); boardStage = { articles: ['new'] }; },
    hasStaged: () => !!boardStage, staged: () => boardStage,
    restoreStaged: v => { boardStage = v; }, discard: () => { boardStage = null; },
    publish: () => { publications.push('board'); boardStage = null; },
  };
  const dialogues = {
    budgetLeft: () => budget,
    async refresh(id, ctx) {
      calls.push([id, ctx.edition]);
      if (id === fail) { budget = false; return false; }
      pools.push([id, { lines: ['new'] }]); return true;
    },
    staged: () => pools, restoreStaged: v => { pools = v; }, discard: () => { pools = []; },
    publish: () => { publications.push(...pools.map(([id]) => id)); pools = []; },
  };
  const options = { dataDir, board, dialogues, emit: (type, state) => events.push(state), scopes: () => ['cv', 'check', 'news', 'floor:growth'].map(id => ({ id, ctx: {} })), now: () => time };
  return { options, calls, publications, events, advance: ms => { time += ms; }, exhaust: () => { budget = false; }, restoreBudget: () => { budget = true; }, fail: id => { fail = id; } };
}

test('hourly session stages every scope, waits for disk insertion, and publishes exactly once', async () => {
  const f = fixture(), s = createNewsSession(f.options);
  const [a, b] = await Promise.all([s.run(), s.run()]);
  assert.equal(a.status, 'ready'); assert.equal(a.edition, b.edition);
  assert.equal(f.calls.length, 5); assert.equal(new Set(f.calls.map(c => c[1])).size, 1);
  assert.deepEqual(f.publications, []);
  await s.run(); assert.equal(f.calls.length, 5);
  assert.equal(s.publish('stale').ok, false);
  assert.equal(s.publish(a.edition).ok, true);
  assert.equal(s.publish(a.edition).ok, true);
  assert.deepEqual(f.publications, ['board', 'cv', 'check', 'news', 'floor:growth']);
  assert.equal(s.snapshot().nextAt - s.snapshot().startedAt, 3_600_000);
});

test('a complete prepared edition survives restart without spending more tokens', async () => {
  const f = fixture(), first = createNewsSession(f.options);
  const ready = await first.run();
  f.options.board.discard(); f.options.dialogues.discard();
  const restarted = createNewsSession(f.options);
  assert.equal(restarted.snapshot().edition, ready.edition);
  await restarted.run(); assert.equal(f.calls.length, 5);
  assert.equal(restarted.publish(ready.edition).ok, true);
  assert.equal(createNewsSession(f.options).publish(ready.edition).ok, true);
});

test('budget exhaustion before or during preparation leaves the published edition untouched', async () => {
  const f = fixture(); f.exhaust();
  assert.equal((await createNewsSession(f.options).run()).status, 'stopped');
  assert.equal(f.calls.length, 0);
  const partial = fixture(); partial.fail('check');
  const session = createNewsSession(partial.options);
  const result = await session.run();
  assert.equal(result.status, 'stopped'); assert.equal(result.edition, null);
  assert.equal(partial.options.board.hasStaged(), true);
  assert.deepEqual(partial.options.dialogues.staged().map(([id]) => id), ['cv']);
  assert.equal(session.publish('anything').ok, false);
  assert.deepEqual(partial.publications, []);
});

test('real held board and bilingual pools remain invisible until the complete edition is published', async () => {
  const dataDir = tmp(), now = () => 1_790_000_000_000;
  let generation = 1, calls = 0;
  const source = { id: 'source', kind: 'news', title: 'A new public tool', publisher: 'Example', url: 'https://example.com/news', publishedAt: now() - 1000, expiresAt: now() + 86_400_000, topic: 'ai' };
  const dialogues = createDialogues({ dataDir, now, hold: true, config: () => ({ dialogues: { batchesPerRefresh: 1 } }),
    run: async (system, input, schema) => {
      calls++;
      if (schema.properties.articles) return { articles: JSON.parse(input).articles.map(a => ({ articleId: a.articleId, titleTr: 'Yeni bir araç', titleEn: 'A new tool', explanation: 'Yeni araç duyuruldu.', explanationEn: 'A new tool was announced.' })) };
      return { lines: [{ kind: 'desk', text: `Yeni fikir ${generation}.`, en: { text: `New idea ${generation}.` } }] };
    },
  });
  const board = createNewsBoard({ dataDir, now, hold: true, collect: async () => ({ sources: [source] }), editorial: job => dialogues.editorial(job) });
  const session = createNewsSession({ dataDir, now, board, dialogues, scopes: () => [{ id: 'news', ctx: { name: 'News', floor: 'Office', agents: [], recent: [] } }] });
  const ready = await session.run();
  assert.equal(ready.status, 'ready');
  assert.equal(board.get().articles.length, 0);
  assert.equal(dialogues.get('news').lines.some(l => l.text === 'Yeni fikir 1.'), false);
  session.publish(ready.edition);
  assert.equal(board.get().articles[0].titleEn, 'A new tool');
  assert.equal(dialogues.get('news').lines.some(l => l.en?.text === 'New idea 1.'), true);
  generation++;
  const second = await session.run();
  assert.equal(second.status, 'ready');
  assert.equal(dialogues.get('news').lines.some(l => l.text === 'Yeni fikir 2.'), false);
  session.publish(second.edition);
  assert.equal(dialogues.get('news').lines.some(l => l.text === 'Yeni fikir 1.'), false);
  assert.equal(dialogues.get('news').lines.some(l => l.text === 'Yeni fikir 2.'), true);
  assert.equal(calls, 4);
});

test('provider quota failure blocks subsequent calls and remains blocked after restart', async () => {
  const dataDir = tmp(); let calls = 0;
  const now = () => 1_790_000_000_000;
  const options = { dataDir, now, hold: true, run: async () => { calls++; throw new Error('antigravity-quota-exhausted'); } };
  const first = createDialogues(options);
  await assert.rejects(first.editorial(call => call('public data', '{}', {})), /quota-exhausted/);
  assert.equal(first.budgetLeft(), false);
  await assert.rejects(first.editorial(call => call('public data', '{}', {})), /provider-backoff/);
  const restarted = createDialogues(options);
  assert.equal(restarted.budgetLeft(), false);
  assert.equal(calls, 1);
});

test('location invalidation updates persisted prepared pools before a restart', async () => {
  const f = fixture(), session = createNewsSession(f.options);
  const ready = await session.run();
  const scrubbed = [['news', { lines: [{ kind: 'desk', text: 'Public everyday line.' }] }]];
  f.options.dialogues.restoreStaged(scrubbed);
  session.syncPreparedPools();
  f.options.dialogues.discard();
  const restarted = createNewsSession(f.options);
  assert.equal(restarted.snapshot().edition, ready.edition);
  assert.deepEqual(f.options.dialogues.staged(), scrubbed);
});


test('reported progress advances only after completed preparation stages and respects refresh availability', async () => {
  const f = fixture(), original = f.options.board.refresh;
  let proceed;
  const gate = new Promise(resolve => { proceed = resolve; });
  f.options.board.refresh = async (...args) => { await gate; return original(...args); };
  const session = createNewsSession(f.options);
  assert.equal(session.snapshot().canRefresh, true);
  const running = session.run();
  assert.equal(session.snapshot().status, 'preparing');
  assert.equal(session.snapshot().progress.percent, 0);
  assert.equal(session.snapshot().canRefresh, false);
  assert.equal(session.run(), running);
  proceed(); await running;
  assert.deepEqual(f.events.map(e => e.progress.percent), [0, 20, 40, 60, 80, 100]);
  assert.equal(session.snapshot().progress.completed, 5);
  assert.equal(session.snapshot().progress.total, 5);
  assert.equal(session.snapshot().canRefresh, false);
  session.publish(session.snapshot().edition);
  assert.equal(session.snapshot().progress.stage, 'published');
  assert.equal(session.snapshot().progress.percent, 100);
  assert.equal(session.snapshot().canRefresh, true);
});

test('manual refresh bypasses a transient pool retry delay, never the enabled or budget guard', async () => {
  let calls = 0, succeeds = false, enabled = true;
  const pool = createDialogues({ dataDir: tmp(), now: () => 1_790_000_000_000, hold: true,
    config: () => ({ dialogues: { enabled, batchesPerRefresh: 1 } }),
    run: async () => {
      calls++;
      if (!succeeds) throw new Error('antigravity-failed');
      return { lines: [{ kind: 'desk', text: 'Yeni notlar hazırladım.', en: { text: 'I prepared fresh notes.' } }] };
    },
  });
  const ctx = { name: 'News', floor: 'Office', agents: [], recent: [] };
  assert.equal(await pool.refresh('news', ctx), false);
  succeeds = true;
  assert.equal(await pool.refresh('news', ctx), false);
  assert.equal(calls, 1);
  assert.equal(await pool.refresh('news', ctx, { force: true }), true);
  assert.equal(calls, 2);
  enabled = false;
  assert.equal(await pool.refresh('news', ctx, { force: true }), false);
  assert.equal(calls, 2);
});

test('refill diagnostics distinguish empty bilingual output without retaining model text or error bodies', async () => {
  const pool = createDialogues({ dataDir: tmp(), hold: true, config: () => ({ dialogues: { batchesPerRefresh: 1 } }),
    run: async () => ({ lines: [{ kind: 'desk', text: 'Yalnız Türkçe bir satır.' }] }),
  });
  assert.equal(await pool.refresh('news', { name: 'News', agents: [], recent: [] }), false);
  assert.deepEqual(Object.fromEntries(['code', 'step', 'batch', 'received', 'accepted', 'bilingual'].map(k => [k, pool.failure()[k]])),
    { code: 'dialogue-empty', step: 'validating', batch: 1, received: 1, accepted: 1, bilingual: 0 });
  assert.ok(!JSON.stringify(pool.failure()).includes('Yalnız Türkçe'));
  const broken = createDialogues({ dataDir: tmp(), hold: true, creator: { plan() { throw new TypeError('untrusted private error text'); } }, run: async () => ({}) });
  await broken.refresh('news', { name: 'News', agents: [], recent: [] });
  assert.equal(broken.failure().step, 'planning');
  assert.equal(broken.failure().type, 'TypeError');
  assert.ok(!JSON.stringify(broken.status()).includes('untrusted private error text'));
});

test('hourly pools share the verified edition, require English, and make one bounded Flash call each', async () => {
  let calls = 0;
  const source = { id: 'search:trusted', kind: 'news', title: 'Verified tool release', publisher: 'Example', url: 'https://example.com/release', publishedAt: Date.now(), expiresAt: Date.now() + 3600000, topic: 'ai' };
  const pool = createDialogues({ dataDir: tmp(), hold: true,
    creator: { plan() { throw new Error('hourly pools must reuse the news search plan'); } },
    briefing: async () => { throw new Error('hourly pools must reuse the verified sources'); },
    run: async (system, input, schema) => {
      calls++;
      assert.equal(schema.properties.lines.maxItems, 32);
      assert.ok(schema.properties.lines.items.required.includes('textEn'));
      assert.ok(input.includes('search:trusted'));
      assert.ok(input.includes('İstenen satır sayısı: 32'));
      return { lines: [{ kind: 'news', text: 'Yeni araç duyurulmuş.', textEn: 'A new tool was announced.', sourceId: 'search:trusted' }] };
    },
  });
  const ctx = { name: 'News', agents: [], recent: [] };
  assert.equal(await pool.refresh('news', ctx, { editionBatch: true, editionSources: [source] }), true);
  assert.equal(calls, 1);
  assert.equal(pool.staged()[0][1].lines[0].source.id, 'search:trusted');
});

test('failed preparation state survives restart without appearing to run a nonexistent worker', async () => {
  const f = fixture(); f.fail('check');
  const first = createNewsSession(f.options);
  const failed = await first.run();
  const restored = createNewsSession(f.options).snapshot();
  assert.equal(restored.status, 'stopped');
  assert.equal(restored.reason, 'budget');
  assert.equal(restored.progress.percent, failed.progress.percent);
  assert.notEqual(restored.status, 'preparing');
});

test('a failed last scope resumes from its persisted checkpoint without repeating searches or completed pools', async () => {
  const f = fixture(); f.fail('floor:growth');
  const session = createNewsSession(f.options);
  assert.equal((await session.run()).status, 'stopped');
  assert.deepEqual(f.options.dialogues.staged().map(([id]) => id), ['cv', 'check', 'news']);
  f.fail(null); f.restoreBudget();
  const restarted = createNewsSession(f.options);
  assert.equal((await restarted.run({ force: true })).status, 'ready');
  assert.equal(f.calls.filter(([id]) => id === 'board').length, 1);
  assert.equal(f.calls.filter(([id]) => id === 'cv').length, 1);
  assert.equal(f.calls.filter(([id]) => id === 'floor:growth').length, 2);
  assert.equal(restarted.publish(restarted.snapshot().edition).ok, true);
  assert.deepEqual(f.publications, ['board', 'cv', 'check', 'news', 'floor:growth']);
});

test('a denied tool stays denied and one bounded retry can complete an hourly pool', async () => {
  let calls = 0;
  const pool = createDialogues({ dataDir: tmp(), hold: true, run: async (system, input, schema) => {
    if (++calls === 1) throw Object.assign(new Error('antigravity-unexpected-tool'), { tool: 'run_command' });
    assert.equal(schema.properties.lines.maxItems, 8);
    return { lines: [{ kind: 'desk', text: 'Yeni bir fikir buldum.', textEn: 'I found a fresh idea.' }] };
  } });
  assert.equal(await pool.refresh('news', { name: 'News', agents: [], recent: [] }, { editionBatch: true, editionSources: [] }), true);
  assert.equal(calls, 2);
  let denied = 0;
  const blocked = createDialogues({ dataDir: tmp(), hold: true, run: async () => { denied++; throw Object.assign(new Error('antigravity-unexpected-tool'), { tool: 'run_command' }); } });
  assert.equal(await blocked.refresh('news', { name: 'News', agents: [], recent: [] }, { editionBatch: true, editionSources: [] }), false);
  assert.equal(denied, 2);
  assert.equal(blocked.failure().tool, 'run_command');
});

test('selection-policy changes discard obsolete staged editions and rerun collection instead of publishing them', async () => {
  const f = fixture(), original = createNewsSession(f.options);
  const old = await original.run();
  let valid = false;
  f.options.board.compatible = () => valid;
  const restored = createNewsSession(f.options);
  assert.equal(restored.snapshot().edition, null);
  assert.equal(restored.publish(old.edition).ok, false);
  valid = true;
  const updated = await restored.run({ force: true });
  assert.equal(updated.status, 'ready');
  assert.notEqual(updated.edition, old.edition);
  assert.equal(f.calls.filter(([id]) => id === 'board').length, 2);
});

test('a preference change invalidates a ready disk before it can publish and permits a fresh manual edition', async () => {
  const f = fixture(), session = createNewsSession(f.options);
  const old = await session.run();
  session.invalidateSelection();
  assert.equal(session.snapshot().status, 'idle');
  assert.equal(session.snapshot().canRefresh, true);
  assert.equal(session.publish(old.edition).ok, false);
  const next = await session.run({ force: true });
  assert.equal(next.status, 'ready'); assert.notEqual(next.edition, old.edition);
});
