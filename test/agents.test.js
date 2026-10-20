import test from 'node:test';
import assert from 'node:assert/strict';
import { VARIANTS, agentDefs, buildAgents, roomLive, summarize } from '../server/agents.js';

const NOW = Date.parse('2026-10-20T10:00:00Z');
const ago = (ms) => new Date(NOW - ms).toISOString();
const skill = (name) => ({ id: `skill:${name}`, skill: name, name, kind: 'skill' });
const task = (id, name = id) => ({ id, skill: null, name, kind: 'task' });
const room = (id, stations, over = {}) => ({ id, name: id.toUpperCase(), dust: 0, level: 'plan', embedded: [], stations, ...over });
const data = (...rooms) => ({ floors: [{ id: 'f', name: 'F', rooms }] });
const byName = (agents) => Object.fromEntries(agents.map((a) => [a.name, a]));

test('two or more skills: one agent per skill, named after the skill, no human names', () => {
  const agents = buildAgents({ data: data(room('cv', [skill('style'), skill('math'), skill('check')])), now: NOW });
  assert.deepEqual(agents.map((a) => a.name).sort(), ['check', 'math', 'style']);
  assert.ok(agents.every((a) => a.kind === 'skill' && a.role === 'CV · skill' && VARIANTS.includes(a.variant)));
  assert.deepEqual(agents.map((a) => a.id).sort(), ['cv#skill:check', 'cv#skill:math', 'cv#skill:style']);
  assert.equal(byName(agents).style.deskId, 'skill:style');
});

test('skills plus task stations add a project agent that owns the tasks', () => {
  const agents = buildAgents({ data: data(room('cv', [skill('a'), skill('b'), task('collector', 'Toplayıcı'), task('jobbot')])), now: NOW });
  const project = agents.find((a) => a.kind === 'project');
  assert.deepEqual([agents.length, project.name, project.id, project.deskId, project.role], [3, 'CV', 'cv#project', 'collector', 'CV · proje ajanı']);
});

test('fewer than two skills: a single project agent named after the project, whatever the stations are', () => {
  for (const stations of [[], [skill('only')], [task('a'), task('b')], [skill('only'), task('t')]]) {
    const agents = buildAgents({ data: data(room('vps', stations)), now: NOW });
    assert.deepEqual([agents.length, agents[0].name, agents[0].kind, agents[0].skill], [1, 'VPS', 'project', null], JSON.stringify(stations.map((s) => s.id)));
  }
  assert.equal(buildAgents({ data: data(room('vps', [skill('only')])), now: NOW })[0].deskId, 'skill:only');
});

test('agentDefs: owned stations', () => {
  const d = agentDefs(room('r', [skill('a'), skill('b'), task('t')]));
  assert.deepEqual(d.map((x) => [x.kind, x.owned]), [['skill', ['skill:a']], ['skill', ['skill:b']], ['project', ['t']]]);
  assert.deepEqual(agentDefs(room('r', [skill('a'), task('t')])).map((x) => x.owned), [['skill:a', 't']]);
});

test('status: a hot station makes only its own skill agent work; the others stay idle; neglected rooms are offline', () => {
  const r = room('cv', [skill('a'), skill('b'), skill('c')]);
  const activity = { rooms: { cv: { 'skill:b': { lastAt: ago(20_000), lastTool: 'Skill', count7d: 3 } } } };
  const agents = byName(buildAgents({ data: data(r), activity, now: NOW }));
  assert.deepEqual([agents.a.status, agents.b.status, agents.c.status], ['idle', 'working', 'idle']);
  assert.equal(agents.b.currentTask, 'b');
  assert.equal(agents.b.recent[0].count7d, 3);
  const dormant = buildAgents({ data: data({ ...r, dust: 2 }), now: NOW });
  assert.ok(dormant.every((a) => a.status === 'offline'));
});

test('a live session: its station\'s agent gets the tool, file, model and waiting means thinking', () => {
  const r = room('cv', [skill('a'), skill('b'), task('t')]);
  const live = { cv: { state: 'working', reason: 'tool', tool: 'Edit', file: 'x.js', stationId: 'skill:a', ageSec: 4, model: 'claude-opus-5-5' } };
  const agents = byName(buildAgents({ data: data(r), live, now: NOW }));
  assert.deepEqual([agents.a.status, agents.a.currentTask, agents.a.model, agents.b.status, agents.CV.status], ['working', 'Edit: x.js', 'claude-opus-5-5', 'idle', 'idle']);
  const waiting = byName(buildAgents({ data: data(r), live: { cv: { state: 'waiting', reason: 'tool', stationId: null, ageSec: 20 } }, now: NOW }));
  assert.deepEqual([waiting.CV.status, waiting.CV.waiting, waiting.CV.currentTask, waiting.a.status], ['thinking', true, 'Cevap / izin bekliyor', 'idle']);
  const ended = byName(buildAgents({data:data(r),live:{cv:{state:'waiting',reason:'turn',stationId:null,ageSec:20}},now:NOW}));
  assert.deepEqual([ended.CV.status,ended.CV.waiting,ended.CV.cliActive],['idle',false,false]);
});

test('a live session in an embedded repo counts for the room', () => {
  assert.equal(roomLive(room('cv', [], { embedded: [{ id: 'dil' }] }), { dil: { state: 'working' } }).state, 'working');
});

test('runs from the office: the station owner works, the project agent completes or errors, then back to idle', () => {
  const r = room('cv', [skill('a'), skill('b'), task('t')]);
  const plans = { p1: { plan: { summary: 'İlanı incele' }, text: 'x' } };
  const running = [{ roomId: 'cv', planId: 'p1', state: 'running', startedAt: ago(5000) }];
  const a1 = byName(buildAgents({ data: data(r), runs: running, plans, runStations: { cv: 'skill:b' }, now: NOW }));
  assert.deepEqual([a1.b.status, a1.b.currentTask, a1.a.status, a1.CV.status], ['working', 'İlanı incele', 'idle', 'idle']);
  const a2 = byName(buildAgents({ data: data(r), runs: running, plans, now: NOW }));
  assert.deepEqual([a2.CV.status, a2.CV.currentTask], ['working', 'İlanı incele']);
  const done = (msAgo) => [{ roomId: 'cv', planId: 'p1', state: 'done', startedAt: ago(60000), endedAt: ago(msAgo), result: { ok: true, text: 'CV hazır' } }];
  assert.deepEqual([byName(buildAgents({ data: data(r), runs: done(3000), now: NOW })).CV.status, byName(buildAgents({ data: data(r), runs: done(20000), now: NOW })).CV.status], ['completed', 'idle']);
  const failed = (msAgo) => [{ roomId: 'cv', planId: 'p1', state: 'failed', startedAt: ago(90000), endedAt: ago(msAgo), error: 'beklenmedik' }];
  const err = byName(buildAgents({ data: data(r), runs: failed(10000), now: NOW })).CV;
  assert.deepEqual([err.status, err.currentTask], ['error', 'beklenmedik']);
});

test('order inside a room: live and busy agents first, then the most recently active', () => {
  const r = room('cv', [skill('a'), skill('b'), skill('c'), skill('d')]);
  const activity = { rooms: { cv: { 'skill:c': { lastAt: ago(600_000) }, 'skill:d': { lastAt: ago(30_000) } } } };
  const live = { cv: { state: 'working', tool: 'Read', stationId: 'skill:b', ageSec: 2 } };
  assert.deepEqual(buildAgents({ data: data(r), live, activity, now: NOW }).map((a) => a.name), ['b', 'd', 'c', 'a']);
});

test('summarize counts statuses', () => {
  assert.deepEqual(summarize([{ status: 'idle' }, { status: 'working' }, { status: 'working' }, { status: 'error' }, { status: 'offline' }]), { total: 5, working: 2, thinking: 0, idle: 1, offline: 1, completed: 0, error: 1 });
});

test('simultaneous CLI sessions activate their own skill agents; historical activity alone has no live diamond', () => {
  const r = room('cv', [skill('a'), skill('b'), task('collector')]);
  const observedSessions = ['a', 'b'].map((name, i) => ({ roomId: 'cv', stationId: `skill:${name}`, provider: i ? 'codex' : 'claude', state: 'working', ageSec: 1, tool: 'Read', file: 'report.md', model: null }));
  const agents = byName(buildAgents({ data: data(r), observedSessions, now: NOW }));
  assert.equal(agents.a.cliActive, true);
  assert.equal(agents.b.cliActive, true);
  assert.equal(agents.a.observation.provider, 'claude');
  assert.equal(agents.b.observation.provider, 'codex');
  assert.equal(agents.CV.cliActive, false);
  const hot = buildAgents({ data: data(r), activity: { rooms: { cv: { 'skill:a': { lastAt: ago(1000) } } } }, now: NOW });
  assert.equal(hot.find(a => a.name === 'a').status, 'working');
  assert.equal(hot.find(a => a.name === 'a').cliActive, false);
});
