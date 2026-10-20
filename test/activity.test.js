import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { buildMatcher, matchEvent } from '../scanner/stations.js';
import { hitsFromLine, scanActivity } from '../scanner/activity.js';
import { tmp, write } from './helpers.js';

const NOW = Date.parse('2026-10-19T20:00:00Z');
const DAYMS = 86400000;
const iso = (daysAgo, extraMs = 0) => new Date(NOW - daysAgo * DAYMS + extraMs).toISOString();
const tool = (name, input, daysAgo, extra = 0) => JSON.stringify({ type: 'assistant', timestamp: iso(daysAgo, extra), message: { content: [{ type: 'tool_use', name, input }] } }) + '\n';

const room = {
  id: 'cv',
  path: '/D/Emrecan CV',
  embedded: [{ id: 'dil', name: 'DIL Application', path: '/D/DIL Application' }],
  stations: [
    { id: 'skill:cover-letter-style', skill: 'cover-letter-style', paths: ['.agents/skills/cover-letter-style/'], scripts: [], repo: null },
    { id: 'linkedin', skill: null, paths: ['linkedin_collector/', 'README.md'], scripts: ['collect.py', 'filter.py'], repo: null },
    { id: 'repo:dil', skill: null, paths: [], scripts: [], repo: 'DIL Application' },
  ],
};

test('matchEvent: skills (with plugin namespace), paths, skill files, scripts and embedded repos', () => {
  const m = buildMatcher(room);
  assert.equal(matchEvent(m, { skill: 'cover-letter-style' }), 'skill:cover-letter-style');
  assert.equal(matchEvent(m, { skill: 'plugin:cover-letter-style' }), 'skill:cover-letter-style');
  assert.equal(matchEvent(m, { skill: 'unknown' }), null);
  assert.equal(matchEvent(m, { path: '/D/Emrecan CV/linkedin_collector/collect.py' }), 'linkedin');
  assert.equal(matchEvent(m, { path: '/D/Emrecan CV/README.md' }), 'linkedin');
  assert.equal(matchEvent(m, { path: '/D/Emrecan CV/README.md.bak' }), null);
  assert.equal(matchEvent(m, { path: '/D/Emrecan CV/.claude/skills/cover-letter-style/SKILL.md' }), 'skill:cover-letter-style');
  assert.equal(matchEvent(m, { path: '/elsewhere/file.py' }), null);
  assert.equal(matchEvent(m, { command: 'python3 linkedin_collector/filter.py --x' }), 'linkedin');
  assert.equal(matchEvent(m, { command: 'ls -la' }), null);
  assert.equal(matchEvent(m, { path: '/D/DIL Application/anything.md' }), 'repo:dil');
});

test('hitsFromLine: only assistant tool calls count, text is ignored', () => {
  const m = buildMatcher(room);
  assert.deepEqual(hitsFromLine(tool('Skill', { skill: 'cover-letter-style' }, 1), m).map((h) => [h.id, h.tool]), [['skill:cover-letter-style', 'Skill']]);
  assert.deepEqual(hitsFromLine(JSON.stringify({ type: 'user', timestamp: iso(1), message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: 'cover-letter-style' } }] } }), m), []);
  assert.deepEqual(hitsFromLine('{ broken "tool_use"', m), []);
  assert.deepEqual(hitsFromLine(tool('Grep', { pattern: 'collect.py' }, 1), m), []);
});

function fixture() {
  const root = tmp();
  const dir = join(root, '-D-Emrecan-CV');
  write(root, '-D-Emrecan-CV/a.jsonl',
    tool('Skill', { skill: 'cover-letter-style' }, 0, -1000) +
    tool('Skill', { skill: 'cover-letter-style' }, 2) +
    tool('Edit', { file_path: '/D/Emrecan CV/linkedin_collector/collect.py', old_string: 'SECRET' }, 9) +
    tool('Bash', { command: 'python3 filter.py SECRET-ARG' }, 20));
  write(root, '-D-DIL-Application/b.jsonl', tool('Read', { file_path: '/D/DIL Application/x.md' }, 1));
  return { root, dir, config: { sessions: { projectsDir: root } }, data: { floors: [{ rooms: [room] }] } };
}

test('scanActivity: last use, 7-day count, per-day buckets, embedded repo station, window cut-off', () => {
  const { data, config } = fixture();
  const { rooms } = scanActivity(data, config, NOW, new Map());
  const skill = rooms.cv['skill:cover-letter-style'];
  assert.equal(skill.count7d, 2);
  assert.equal(skill.lastTool, 'Skill');
  assert.equal(skill.lastAt, iso(0, -1000));
  assert.equal(skill.byDay[0], 1);
  assert.equal(skill.byDay[2], 1);
  assert.equal(rooms.cv.linkedin.count7d, 0);
  assert.equal(rooms.cv.linkedin.byDay[9], 1);
  assert.equal(rooms.cv.linkedin.lastAt, iso(9));
  assert.equal(rooms.cv['repo:dil'].count7d, 1);
});

test('scanActivity: incremental scans pick up appended lines and wait for half-written ones', () => {
  const { data, config, root } = fixture();
  const cache = new Map();
  scanActivity(data, config, NOW, cache);
  const file = join(root, '-D-Emrecan-CV/a.jsonl');
  const line = tool('Skill', { skill: 'cover-letter-style' }, 0, -500);
  appendFileSync(file, line.slice(0, 40)); // half-written line
  utimesSync(file, NOW / 1000, NOW / 1000);
  assert.equal(scanActivity(data, config, NOW, cache).rooms.cv['skill:cover-letter-style'].count7d, 2);
  appendFileSync(file, line.slice(40));
  assert.equal(scanActivity(data, config, NOW, cache).rooms.cv['skill:cover-letter-style'].count7d, 3);
});

test('scanActivity never keeps message or command text', () => {
  const { data, config } = fixture();
  const cache = new Map();
  scanActivity(data, config, NOW, cache);
  assert.ok(!JSON.stringify([...cache.values()]).includes('SECRET'));
});

test('scanActivity: a folder of a longer project key is not counted for the shorter one', () => {
  const root = tmp();
  write(root, '-D-agents-deck-public/s.jsonl', tool('Read', { file_path: '/D/agents-deck-public/README.md' }, 1));
  const mk = (id, name) => ({ id, path: `/D/${name}`, embedded: [], stations: [{ id: 'docs', skill: null, paths: ['README.md'], scripts: [], repo: null }] });
  const data = { floors: [{ rooms: [mk('agents-deck', 'agents-deck'), mk('agents-deck-public', 'agents-deck-public')] }] };
  const { rooms } = scanActivity(data, { sessions: { projectsDir: root } }, NOW, new Map());
  assert.equal(rooms['agents-deck-public'].docs.count7d, 1);
  assert.equal(rooms['agents-deck'].docs.count7d, 0);
});

test('scanActivity: missing projects dir gives empty stations', () => {
  const { rooms } = scanActivity({ floors: [{ rooms: [room] }] }, { sessions: { projectsDir: '/nonexistent-xyz' } }, NOW, new Map());
  assert.equal(rooms.cv.linkedin.lastAt, null);
});
