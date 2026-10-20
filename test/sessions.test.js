import test from 'node:test';
import assert from 'node:assert/strict';
import { utimesSync } from 'node:fs';
import { join } from 'node:path';
import { classify, encodeProjectDir, lastTurn, scanSessions } from '../scanner/sessions.js';
import { tmp, write } from './helpers.js';

const NOW = Date.parse('2026-10-19T20:00:00Z');
const line = (o) => JSON.stringify(o) + '\n';
const assistant = (content, stop_reason) => line({ type: 'assistant', message: { content, stop_reason } });
const user = (content) => line({ type: 'user', message: { content } });

function transcript(root, dirName, body, ageSec) {
  write(root, `${dirName}/s1.jsonl`, body);
  const t = (NOW - ageSec * 1000) / 1000;
  utimesSync(join(root, dirName, 's1.jsonl'), t, t);
}

test('encodeProjectDir mirrors Claude Code folder naming', () => {
  assert.equal(encodeProjectDir('/Users/emrecanulu/Documents/Emrecan CV'), '-Users-emrecanulu-Documents-Emrecan-CV');
});

test('lastTurn keeps only tool name and file basename, never message text', () => {
  const root = tmp();
  write(root, 'a.jsonl',
    user('SECRET prompt text') +
    assistant([{ type: 'text', text: 'SECRET reply' }, { type: 'tool_use', name: 'Edit', input: { file_path: '/x/y/scan.js', old_string: 'SECRET' } }], 'tool_use'));
  const turn = lastTurn(join(root, 'a.jsonl'));
  assert.deepEqual(turn, { model: null, role: 'assistant', stopReason: 'tool_use', toolUse: { name: 'Edit', file: 'scan.js' } });
  assert.ok(!JSON.stringify(turn).includes('SECRET'));
});

test('lastTurn skips sidechain, attachment and system records and survives garbage lines', () => {
  const root = tmp();
  write(root, 'a.jsonl', user('hi') + 'not json\n' + line({ type: 'attachment' }) + line({ type: 'assistant', isSidechain: true, message: { content: [] } }));
  assert.equal(lastTurn(join(root, 'a.jsonl')).role, 'user');
});

test('classify: working, waiting (turn / tool) and stale', () => {
  const live = 600_000;
  const tool = { role: 'assistant', stopReason: 'tool_use', toolUse: { name: 'Bash', file: null } };
  assert.equal(classify(tool, 5_000, live).state, 'working');
  assert.deepEqual(classify(tool, 30_000, live), { state: 'waiting', reason: 'tool' });
  assert.deepEqual(classify({ role: 'assistant', stopReason: 'end_turn', toolUse: null }, 60_000, live), { state: 'waiting', reason: 'turn' });
  assert.equal(classify({ role: 'user', stopReason: null, toolUse: null }, 10_000, live).state, 'working');
  assert.equal(classify({ role: 'user', stopReason: null, toolUse: null }, 200_000, live), null);
  assert.equal(classify(tool, 700_000, live), null);
});

test('scanSessions maps folders to the longest matching desk and ignores old transcripts', () => {
  const root = tmp();
  const data = { floors: [{ rooms: [
    { id: 'agents-deck', path: '/D/agents-deck' },
    { id: 'agents-deck-public', path: '/D/agents-deck-public' },
    { id: 'mahur', path: '/D/mahur' },
    { id: 'cv', path: '/D/Emrecan CV', embedded: [{ id: 'dil', path: '/D/DIL Application' }] },
  ] }] };
  transcript(root, '-D-agents-deck-public', assistant([{ type: 'text', text: 'x' }], 'end_turn'), 30);
  transcript(root, '-D-mahur', user('go'), 10);
  transcript(root, '-D-DIL-Application', assistant([{ type: 'tool_use', name: 'Read', input: { file_path: '/p/a.md' } }], 'tool_use'), 40);
  transcript(root, '-D-agents-deck', user('old'), 99_999);
  const { live } = scanSessions(data, { sessions: { projectsDir: root, liveMinutes: 10 } }, NOW);
  assert.equal(live['agents-deck-public'].state, 'waiting');
  assert.equal(live['agents-deck'], undefined);
  assert.equal(live.mahur.state, 'working');
  assert.deepEqual([live.dil.state, live.dil.tool, live.dil.file], ['waiting', 'Read', 'a.md']);
  assert.equal(live.cv, undefined);
});

test('scanSessions with a missing projects dir returns no live sessions', () => {
  assert.deepEqual(scanSessions({ floors: [] }, { sessions: { projectsDir: '/nonexistent-dir-xyz' } }, NOW).live, {});
});

test('scanSessions reports the station a session is working at (never the raw tool input)', () => {
  const root = tmp();
  const room = {
    id: 'cv', path: '/D/Emrecan CV', embedded: [{ id: 'dil', name: 'DIL Application', path: '/D/DIL Application' }],
    stations: [
      { id: 'skill:style', skill: 'style', paths: [], scripts: [], repo: null },
      { id: 'linkedin', skill: null, paths: ['linkedin_collector/'], scripts: ['collect.py'], repo: null },
      { id: 'repo:dil', skill: null, paths: [], scripts: [], repo: 'DIL Application' },
    ],
  };
  transcript(root, '-D-Emrecan-CV', assistant([{ type: 'tool_use', name: 'Skill', input: { skill: 'style' } }], 'tool_use'), 40);
  transcript(root, '-D-DIL-Application', assistant([{ type: 'text', text: 'SECRET' }], 'end_turn'), 40);
  const { live } = scanSessions({ floors: [{ rooms: [room] }] }, { sessions: { projectsDir: root } }, NOW);
  assert.equal(live.cv.stationId, 'skill:style');
  assert.equal(live.cv.roomId, 'cv');
  assert.equal(live.dil.stationId, 'repo:dil');
  assert.equal(live.dil.roomId, 'cv');
  assert.ok(!JSON.stringify(live).includes('SECRET'));
});
