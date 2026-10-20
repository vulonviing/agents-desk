import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createAntigravityRunner, latestFlash, geminiQuota } from '../server/antigravity.js';
import { tmp } from './helpers.js';
const bin = join(import.meta.dirname, 'fake-agy.mjs');
test('Antigravity selects the newest available low-effort Flash, never Pro or another provider', () => {
  assert.equal(latestFlash('gemini-3.9-flash-low\tFlash\ngemini-3.10-flash-low\tNew\ngemini-4-argon-low\tArgon'), 'gemini-3.10-flash-low');
  assert.throws(() => latestFlash('claude-sonnet-low\ngemini-4-argon-low'), /unavailable/);
});
test('Antigravity parses structured output and actual token usage; errors and unexpected tools fail closed', async t => {
  const run = createAntigravityRunner({ dataDir: tmp(), bin });
  const out = await run('JSON only', 'roles', {}, {});
  assert.equal(out.model, 'gemini-3.8-flash-low');
  assert.equal(out.usage.input_tokens, 100);
  assert.equal(out.lines.length, 3);
  await assert.rejects(() => run('', '', {}, { model: 'haiku' }), /flash-model-required/);
  t.after(() => delete process.env.DESK_FAKE_AGY);
  process.env.DESK_FAKE_AGY = 'long-stream';
  assert.equal((await createAntigravityRunner({ dataDir: tmp(), bin })('', '', {})).lines.length, 3);
  for (const mode of ['tool', 'fail']) {
    process.env.DESK_FAKE_AGY = mode;
    const broken = createAntigravityRunner({ dataDir: tmp(), bin });
    await assert.rejects(() => broken('', '', {}), /antigravity-/);
  }
});

test('quota monitoring reads only the verified Gemini Models five-hour bucket', () => {
  const value={command:{data:{groups:[{name:'Gemini Models',buckets:[{id:'gemini-5h',remaining_fraction:0.75,reset_time:'reset'}]}]}}};
  assert.deepEqual(geminiQuota(value),{remaining:0.75,resetAt:'reset'});
  value.command.data.groups[0].buckets[0].disabled=true;
  assert.equal(geminiQuota(value),null);assert.equal(geminiQuota({}),null);
});
