import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createAntigravityRunner, latestFlash, geminiQuota } from '../server/antigravity.js';
import { tmp } from './helpers.js';
const bin = join(import.meta.dirname, 'fake-agy.mjs');
test('Antigravity selects the newest available Flash at medium effort by default, never Pro, Argon or another provider', () => {
  const list = 'gemini-3.9-flash-medium\tFlash\ngemini-3.10-flash-medium\tNew\ngemini-3.11-flash-low\tLow\ngemini-4-argon-medium\tArgon\nclaude-sonnet-5-5-medium';
  assert.equal(latestFlash(list), 'gemini-3.10-flash-medium');
  assert.equal(latestFlash(list, 'low'), 'gemini-3.11-flash-low');
  assert.throws(() => latestFlash('claude-sonnet-low\ngemini-4-argon-medium'), /unavailable/);
  assert.throws(() => latestFlash(list, 'turbo'), /flash-model-required/);
});
test('Antigravity parses structured output and actual token usage; errors and unexpected tools fail closed', async t => {
  const run = createAntigravityRunner({ dataDir: tmp(), bin });
  const out = await run('JSON only', 'roles', {}, {});
  assert.equal(out.model, 'gemini-3.8-flash-medium');
  assert.equal(out.usage.input_tokens, 100);
  assert.equal(out.lines.length, 3);
  await assert.rejects(() => run('', '', {}, { model: 'haiku' }), /flash-model-required/);
  t.after(() => delete process.env.DESK_FAKE_AGY);
  process.env.DESK_FAKE_AGY = 'long-stream';
  assert.equal((await createAntigravityRunner({ dataDir: tmp(), bin })('', '', {})).lines.length, 3);
  for (const mode of ['tool', 'fail']) {
    process.env.DESK_FAKE_AGY = mode;
    const broken = createAntigravityRunner({ dataDir: tmp(), bin });
    if (mode === 'tool') await assert.rejects(() => broken('', '', {}), err => err.message === 'antigravity-unexpected-tool' && err.tool === 'view_file' && err.delegated === false);
    else await assert.rejects(() => broken('', '', {}), /antigravity-/);
  }
});

test('quota monitoring reads only the verified Gemini Models five-hour bucket', () => {
  const value={command:{data:{groups:[{name:'Gemini Models',buckets:[{id:'gemini-5h',remaining_fraction:0.75,reset_time:'reset'}]}]}}};
  assert.deepEqual(geminiQuota(value),{remaining:0.75,resetAt:'reset'});
  value.command.data.groups[0].buckets[0].disabled=true;
  assert.equal(geminiQuota(value),null);assert.equal(geminiQuota({}),null);
});

test('Flash can use remaining provider quota below ten percent; actual exhaustion still stops it', async t => {
  t.after(() => delete process.env.DESK_FAKE_AGY);
  process.env.DESK_FAKE_AGY = 'low-quota';
  const available = createAntigravityRunner({ dataDir: tmp(), bin });
  assert.equal((await available('JSON only', '{}', {})).quota.before.remaining, 0.05);
  process.env.DESK_FAKE_AGY = 'empty-quota';
  const empty = createAntigravityRunner({ dataDir: tmp(), bin });
  await assert.rejects(empty('JSON only', '{}', {}), /quota-exhausted/);
});
