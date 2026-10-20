import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, symlinkSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { createObserver } from '../scanner/observer.js';
import { encodeProjectDir } from '../scanner/sessions.js';
import { tmp, write } from './helpers.js';

const NOW = Date.now();
const station = name => ({ id: `skill:${name}`, skill: name, paths: [], scripts: [] });
function fixture(t) {
  const root = tmp();
  const room = { id: 'cv', path: join(root, 'project'), stations: [station('collector'), station('tailor')] };
  const data = { floors: [{ rooms: [room] }] };
  const claude = join(root, 'claude'), codex = join(root, 'codex');
  const file = join(claude, encodeProjectDir(room.path), 'session.jsonl');
  write(root, file.slice(root.length + 1), '');
  const config = { sessions: { projectsDir: claude, codexSessionsDir: codex } };
  return { root, room, data, file, codex, config, observer: createObserver() };
}
const rec = (type, fields, at) => JSON.stringify({ type, timestamp: new Date(at).toISOString(), ...fields }) + '\n';
const tool = (id, name, input, at) => rec('assistant', { message: { model: 'test-model', content: [{ type: 'tool_use', id, name, input }] } }, at);
const result = (id, at, error = false) => rec('user', { message: { content: [{ type: 'tool_result', tool_use_id: id, is_error: error, content: 'SECRET OUTPUT' }] } }, at);
const skill = (name, at) => tool(`skill-${name}`, 'Skill', { skill: name }, at);

test('observer correlates successful artifact write/read across skills without retaining conversation text', t => {
  const f = fixture(t), at = NOW;
  f.observer.poll(f.data, f.config, at);
  appendFileSync(f.file, skill('collector', at + 1000) + tool('w', 'Write', { file_path: join(f.room.path, 'posting.md'), content: 'SECRET BODY' }, at + 1001) + result('w', at + 1002) + skill('tailor', at + 1003) + tool('r', 'Read', { file_path: join(f.room.path, 'posting.md') }, at + 1004) + result('r', at + 1005));
  const observed = f.observer.poll(f.data, f.config, at + 2500);
  assert.equal(observed.events.filter(e => e.kind === 'handoff').length, 1);
  assert.deepEqual(observed.events.find(e => e.kind === 'handoff').from, 'skill:collector');
  assert.equal(observed.live.cv.stationId, 'skill:tailor');
  assert.equal(observed.events.at(-1).file, 'posting.md');
  assert.ok(!JSON.stringify(observed).includes('SECRET'));
  assert.ok(!JSON.stringify(observed).includes(f.room.path));
  assert.equal(f.observer.poll(f.data, f.config, at + 5000).events.length, observed.events.length);
});

test('failed tools, secret paths, stale events and unknown writers never produce transfers', t => {
  const f = fixture(t); f.observer.poll(f.data, f.config, NOW);
  let content = skill('collector', NOW + 1);
  for (const [i, path] of ['failed.md', '.env.local', '../outside.md', 'auth.json', 'secret.key'].entries()) {
    const p = join(f.room.path, path);
    content += skill('collector', NOW + 2) + tool(`w${i}`, 'Write', { file_path: p }, NOW + 3) + result(`w${i}`, NOW + 4, i === 0) + skill('tailor', NOW + 5) + tool(`r${i}`, 'Read', { file_path: p }, NOW + 6) + result(`r${i}`, NOW + 7);
  }
  appendFileSync(f.file, content);
  const out = f.observer.poll(f.data, f.config, NOW + 3000);
  assert.equal(out.events.filter(e => e.kind === 'handoff').length, 0);
  assert.ok(!JSON.stringify(out).includes('.env'));
  assert.deepEqual(f.observer.poll(f.data, f.config, NOW + 200_000).live, {});
});

test('Codex native events expose activity; code-mode text is never interpreted as an artifact or skill', t => {
  const f = fixture(t); const codexFile = join(f.codex, '2026', '10', '20', 'rollout.jsonl');
  write(f.root, codexFile.slice(f.root.length + 1), rec('session_meta', { payload: { cwd: f.room.path, base_instructions: 'SECRET INSTRUCTIONS' } }, NOW));
  f.observer.poll(f.data, f.config, NOW);
  appendFileSync(codexFile, rec('turn_context', { payload: { cwd: f.room.path, model: 'gpt-test' } }, NOW + 1) + rec('response_item', { payload: { type: 'custom_tool_call', call_id: 'x', name: 'exec', input: 'SECRET CODE pretending to read collector/SKILL.md' } }, NOW + 2));
  const out = f.observer.poll(f.data, f.config, NOW + 2500);
  assert.equal(out.live.cv.provider, 'codex');
  assert.equal(out.live.cv.stationId, null);
  assert.equal(out.live.cv.tool, 'exec');
  assert.equal(out.events.length, 0);
  assert.ok(!JSON.stringify(out).includes('SECRET'));
  appendFileSync(codexFile, rec('event_msg', { payload: { type: 'task_complete' } }, NOW + 3000));
  assert.equal(f.observer.poll(f.data, f.config, NOW + 5000).live.cv.state, 'waiting');
});

test('cold start does not replay history; partial lines and multiple sessions remain independent', t => {
  const f = fixture(t);
  appendFileSync(f.file, skill('collector', NOW - 1000));
  assert.equal(f.observer.poll(f.data, f.config, NOW).events.length, 0);
  const line = skill('tailor', NOW + 2000);
  appendFileSync(f.file, line.slice(0, -5));
  assert.equal(f.observer.poll(f.data, f.config, NOW + 3000).live.cv.stationId, 'skill:collector');
  appendFileSync(f.file, line.slice(-5));
  assert.equal(f.observer.poll(f.data, f.config, NOW + 5000).live.cv.stationId, 'skill:tailor');
  const other = join(f.file, '..', 'other.jsonl');
  write(f.root, other.slice(f.root.length + 1), skill('collector', NOW + 5100));
  assert.equal(f.observer.poll(f.data, f.config, NOW + 7500).sessions.length, 2);
});

test('observer excludes symlink logs and supports disabling external observation', t => {
  const f = fixture(t);
  const outside = join(f.root, 'outside.jsonl');
  write(f.root, 'outside.jsonl', skill('collector', NOW));
  symlinkSync(outside, join(f.file, '..', 'link.jsonl'));
  unlinkSync(f.file);
  assert.equal(f.observer.poll(f.data, f.config, NOW).sessions.length, 0);
  assert.deepEqual(createObserver().poll(f.data, { sessions: { observeExternal: false } }, NOW), { live: {}, events: [] });
});
