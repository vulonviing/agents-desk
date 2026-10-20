import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createDeskServer } from '../server/server.js';

function request(port, path, { method = 'GET', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method, headers }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, body, type: res.headers['content-type'] }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('server: serves the page, blocks foreign hosts/origins and path traversal', async (t) => {
  const server = createDeskServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  const { port } = server.address();

  const page = await request(port, '/');
  assert.equal(page.status, 200);
  assert.match(page.type, /text\/html/);

  const foreignHost = await request(port, '/', { headers: { host: 'evil.example' } });
  assert.equal(foreignHost.status, 403);

  const foreignOrigin = await request(port, '/api/rescan', { method: 'POST', headers: { origin: 'http://evil.example' } });
  assert.equal(foreignOrigin.status, 403);

  const traversal = await request(port, '/..%2fpackage.json');
  assert.equal(traversal.status, 404);

  const post = await request(port, '/index.html', { method: 'POST' });
  assert.equal(post.status, 405);
});

// ---------- Phase 2 API: plans, runs, approvals, events, conversations ----------

import { join as pjoin } from 'node:path';
import { tmp as mktmp, write as mkwrite } from './helpers.js';

const FAKE = pjoin(import.meta.dirname, 'fake-claude.mjs');
const SID = 'aaaaaaaa-1111-2222-3333-bbbbbbbbbbbb';

async function api(t, { script = [] } = {}) {
  const dir = mktmp();
  const sessions = mktmp();
  const apprPath = mktmp();
  const planPath = mktmp();
  mkwrite(dir, 'plan.json', JSON.stringify({ summary: 'Ilani incele', steps: [{ stationId: 'skill:style', action: 'oku' }, { stationId: 'prep', action: 'uret' }, { stationId: 'ghost', action: 'x' }] }));
  mkwrite(dir, 'script.json', JSON.stringify(typeof script === 'function' ? script(apprPath) : script));
  Object.assign(process.env, { DESK_AGY_BIN: pjoin(import.meta.dirname, 'fake-agy.mjs'), DESK_CLAUDE_BIN: FAKE, DESK_FAKE_PLAN: pjoin(dir, 'plan.json'), DESK_FAKE_SCRIPT: pjoin(dir, 'script.json') });
  t.after(() => ['DESK_AGY_BIN', 'DESK_CLAUDE_BIN', 'DESK_FAKE_PLAN', 'DESK_FAKE_SCRIPT'].forEach((k) => delete process.env[k]));
  const mk = (id, name, path) => ({
    id, name, path, embedded: [], skills: [], triggers: [], lastCommit: null, level: 'plan',
    stations: [
      { id: 'skill:style', skill: 'style', name: 'style', kind: 'skill', risk: 'readonly', runsOn: 'local', scripts: [], paths: [] },
      { id: 'prep', skill: null, name: 'Prep', kind: 'task', risk: 'effect', runsOn: 'local', scripts: [], paths: ['out/'] },
    ],
  });
  const rooms = [mk('approve-room', 'Approve Room', apprPath), mk('plan-room', 'Plan Room', planPath)];
  const server = createDeskServer({
    dataDir: dir,
    briefing: async () => ({ sources: [] }),
    manifestDir: mktmp(),
    projects: () => ({ floors: [{ id: 'f', name: 'F', rooms }] }),
    loadConfig: () => ({ levels: { default: 'plan', 'Approve Room': 'approve' }, sessions: { projectsDir: sessions }, dialogues: { batchesPerRefresh: 1 } }),
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const port = server.address().port;
  const call = async (method, path, body, headers = {}) => {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  // Server-sent events: collect frames as they arrive.
  const frames = [];
  const ctrl = new AbortController();
  t.after(() => ctrl.abort());
  fetch(`http://127.0.0.1:${port}/api/events`, { signal: ctrl.signal }).then(async (res) => {
    let buf = '';
    for await (const chunk of res.body) {
      buf += Buffer.from(chunk).toString('utf8');
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const raw = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const type = raw.match(/^event: (.+)$/m)?.[1];
        const data = raw.match(/^data: (.+)$/m)?.[1];
        if (type) frames.push({ type, ...JSON.parse(data) });
      }
    }
  }).catch(() => {});
  const waitFrame = async (pred, ms = 8000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const f = frames.find(pred);
      if (f) return f;
      await new Promise((r) => setTimeout(r, 15));
    }
    throw new Error('timeout waiting for event');
  };
  return { call, frames, waitFrame, sessions, apprPath, port };
}

test('route: validation, unknown rooms, and a validated plan with the level applied', async (t) => {
  const { call } = await api(t);
  assert.equal((await call('POST', '/api/rooms/approve-room/route', { text: 'merhaba' }, { 'content-type': 'text/plain' })).status, 415);
  assert.equal((await call('POST', '/api/rooms/approve-room/route', { text: 'x' })).status, 400);
  assert.equal((await call('POST', '/api/rooms/approve-room/route', { text: 'y'.repeat(4001) })).status, 400);
  assert.equal((await call('POST', '/api/rooms/nope/route', { text: 'merhaba dunya' })).status, 404);
  assert.equal((await call('POST', '/api/rooms/approve-room/route', { text: 'merhaba dunya' }, { origin: 'http://evil.example' })).status, 403);

  const ok = await call('POST', '/api/rooms/approve-room/route', { text: 'şu ilana bak https://example.com/job' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.plan.level, 'approve');
  assert.deepEqual(ok.body.plan.steps.map((s) => [s.stationId, s.executable]), [['skill:style', true], ['prep', true]]);
  assert.match(ok.body.plan.warnings.join(), /ghost/);
  const planOnly = await call('POST', '/api/rooms/plan-room/route', { text: 'şu ilana bak' });
  assert.equal(planOnly.body.plan.executable, false);
  assert.equal((await call('GET', `/api/plans/${ok.body.id}`)).body.text, 'şu ilana bak https://example.com/job');
});

test('run: a plan-level room refuses, an approve-level room runs and asks before editing', async (t) => {
  const { call, waitFrame, frames, apprPath } = await api(t, { script: (p) => [{ tool: 'Skill', input: { skill: 'style' } }, { tool: 'Edit', input: { file_path: pjoin(p, 'out/a.md') } }, { tool: 'Bash', input: { command: 'sudo reboot' } }] });
  const planRoomPlan = (await call('POST', '/api/rooms/plan-room/route', { text: 'bir görev yaz' })).body;
  assert.equal((await call('POST', `/api/plans/${planRoomPlan.id}/run`)).status, 403); // plan level: nothing runs from the office

  const plan = (await call('POST', '/api/rooms/approve-room/route', { text: 'şu ilana bak' })).body;
  const run = await call('POST', `/api/plans/${plan.id}/run`);
  assert.equal(run.status, 202);
  assert.equal((await call('POST', `/api/plans/${plan.id}/run`)).status, 409); // already running

  const card = await waitFrame((f) => f.type === 'approval');
  assert.match(card.summary, /^Edit: /);
  assert.equal((await call('GET', '/api/state')).body.approvals.length, 1);
  assert.equal((await call('POST', `/api/approvals/${card.id}`, { decision: 'maybe' })).status, 400);
  assert.equal((await call('POST', `/api/approvals/${card.id}`, { decision: 'allow' }, { origin: 'http://evil.example' })).status, 403);
  assert.equal((await call('POST', `/api/approvals/${card.id}`, { decision: 'allow' })).status, 200);
  await waitFrame((f) => f.type === 'run' && f.state === 'done');
  assert.equal((await call('POST', `/api/approvals/${card.id}`, { decision: 'allow' })).status, 404); // already settled

  const log = (await call('GET', `/api/runs/${run.body.id}/log`)).body;
  assert.ok(log.some((l) => l.kind === 'denied' && /sudo/.test(l.text)));
  assert.ok(frames.some((f) => f.type === 'plan' && f.status === 'running'));
  assert.equal((await call('GET', `/api/plans/${plan.id}`)).body.status, 'done');
  assert.ok(apprPath);
});

test('run: cancelling stops the session', async (t) => {
  const { call, waitFrame } = await api(t, { script: [{ sleep: 5000 }] });
  const plan = (await call('POST', '/api/rooms/approve-room/route', { text: 'uzun bir görev' })).body;
  const run = (await call('POST', `/api/plans/${plan.id}/run`)).body;
  assert.equal((await call('POST', `/api/runs/${run.id}/cancel`)).status, 200);
  await waitFrame((f) => f.type === 'run' && f.state === 'cancelled');
  assert.equal((await call('POST', `/api/runs/${run.id}/cancel`)).status, 409);
});

test('permission endpoint: unknown runs and wrong tokens are denied', async (t) => {
  const { call } = await api(t);
  const r = await call('POST', '/api/permission/request', { runId: 'nope', token: 'x', tool_name: 'Bash', input: { command: 'ls' } });
  assert.deepEqual([r.status, r.body.behavior], [200, 'deny']);
});

test('conversations: listed and read per room, path tricks refused', async (t) => {
  const { call, sessions, apprPath } = await api(t);
  const dir = apprPath.replace(/[^a-zA-Z0-9]/g, '-');
  mkwrite(sessions, `${dir}/${SID}.jsonl`, JSON.stringify({ type: 'user', timestamp: '2026-10-19T10:00:00Z', message: { content: 'Merhaba oda' } }) + '\n' + JSON.stringify({ type: 'assistant', timestamp: '2026-10-19T10:00:05Z', message: { content: [{ type: 'text', text: 'Selam' }] } }) + '\n');
  const list = (await call('GET', '/api/rooms/approve-room/sessions')).body;
  assert.deepEqual(list.map((s) => [s.id, s.preview]), [[SID, 'Merhaba oda']]);
  const conv = (await call('GET', `/api/rooms/approve-room/sessions/${SID}`)).body;
  assert.deepEqual(conv.messages.map((m) => [m.role, m.text]), [['user', 'Merhaba oda'], ['assistant', 'Selam']]);
  assert.equal((await call('GET', '/api/rooms/plan-room/sessions/' + SID)).status, 404); // another room's folder
  assert.equal((await call('GET', '/api/rooms/nope/sessions')).status, 404);
  assert.equal((await call('GET', '/api/rooms/approve-room/sessions/..%2F..%2Fetc%2Fpasswd')).status, 404);
});

test('agent chat: talk to a project agent, keep history, reset, and refuse bad requests', async (t) => {
  const { call } = await api(t);
  const id = encodeURIComponent('approve-room#project');
  assert.equal((await call('POST', `/api/agents/${encodeURIComponent('approve-room#nope')}/chat`, { message: 'selam' })).status, 404);
  assert.equal((await call('POST', `/api/agents/${id}/chat`, { message: 'selam' }, { origin: 'http://evil.example' })).status, 403);
  assert.equal((await call('POST', `/api/agents/${id}/chat`, { message: '' })).status, 400);
  const sent = await call('POST', `/api/agents/${id}/chat`, { message: 'nasılsın' });
  assert.equal(sent.status, 200);
  assert.deepEqual(sent.body.messages.map((m) => [m.role, m.text]), [['user', 'nasılsın'], ['assistant', 'yanıt: nasılsın']]);
  assert.equal((await call('GET', `/api/agents/${id}/chat`)).body.messages.length, 2);
  assert.deepEqual((await call('POST', `/api/agents/${id}/chat/reset`)).body.messages, []);
  assert.equal((await call('GET', `/api/agents/${id}/chat`)).body.messages.length, 0);
});

test('managers: office snapshot lists only master; work requests navigate directly to an office without preparing a plan', async (t) => {
  const { call } = await api(t);
  process.env.DESK_FAKE_PICK = 'plan-room';
  t.after(() => delete process.env.DESK_FAKE_PICK);
  const office = (await call('GET', '/api/office')).body;
  assert.deepEqual(office.managers.map((m) => [m.id, m.kind]), [['manager:master', 'master']]);
  assert.equal(office.managers[0].offices, 2);

  assert.equal((await call('POST', '/api/dispatch', { text: 'x' })).status, 400);
  assert.equal((await call('POST', '/api/dispatch', { text: 'cv hazırla' }, { origin: 'http://evil.example' })).status, 403);
  const res = await call('POST', '/api/dispatch', { text: 'bu ilan için cv hazırla https://linkedin.com/jobs/1' });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.route.map((r) => [r.by, r.target]), [['Master Yönetici', 'Plan Room']]);
  assert.equal(res.body.plan, null);
  assert.equal(res.body.go.roomId, 'plan-room');
  assert.deepEqual((await call('GET', '/api/state')).body.plans, []);

  // a manager that picks something it was not offered is refused
  process.env.DESK_FAKE_PICK = 'nowhere';
  assert.equal((await call('POST', '/api/dispatch', { text: 'cv hazırla' })).status, 502);

  // managers chat too
  const chat = await call('POST', `/api/agents/${encodeURIComponent('manager:master')}/chat`, { message: 'selam' });
  assert.equal(chat.status, 200);
  assert.equal(chat.body.messages.at(-1).role, 'assistant');
});

test('managers: "take me to" goes to the office without a plan; model failure never falls back to keywords', async (t) => {
  const { call } = await api(t);
  Object.assign(process.env, { DESK_FAKE_PICK: 'approve-room', DESK_FAKE_INTENT: 'git' });
  t.after(() => ['DESK_FAKE_PICK', 'DESK_FAKE_INTENT', 'DESK_FAKE_FAIL'].forEach((k) => delete process.env[k]));
  const go = await call('POST', '/api/dispatch', { text: 'beni approve room a götür' });
  assert.equal(go.status, 200);
  assert.equal(go.body.plan, null);
  assert.deepEqual(go.body.go, { floorId: 'f', roomId: 'approve-room' });

  // Even an exact project name cannot route when the chosen model fails.
  process.env.DESK_FAKE_FAIL = '1';
  const fb = await call('POST', '/api/dispatch', { text: 'plan room a götür' });
  assert.equal(fb.status, 502);
  assert.equal(fb.body.go, undefined);
  assert.equal((await call('POST', '/api/dispatch', { text: 'bambaşka bir şey' })).status, 502);
});


test('managers: clarification preserves task and chosen provider; rejects stale continuations', async (t) => {
  const { call } = await api(t);
  Object.assign(process.env, { DESK_FAKE_PICK: 'approve-room', DESK_FAKE_INTENT: 'git', DESK_FAKE_CLARIFY: '1' });
  t.after(() => ['DESK_FAKE_PICK', 'DESK_FAKE_INTENT', 'DESK_FAKE_CLARIFY'].forEach((k) => delete process.env[k]));
  const ask = await call('POST', '/api/dispatch', { text: 'cv', provider: 'claude' });
  assert.equal(ask.status, 200);
  assert.equal(ask.body.go, null);
  assert.equal(ask.body.plan, null);
  assert.match(ask.body.clarification.question, /Hangi/);
  const id = ask.body.clarification.id;
  assert.equal((await call('POST', '/api/dispatch', { text: 'aç', provider: 'codex', clarificationId: id })).status, 400);
  const answer = await call('POST', '/api/dispatch', { text: 'Approve Room ofisine git', provider: 'claude', clarificationId: id });
  assert.equal(answer.status, 200);
  assert.equal(answer.body.go.roomId, 'approve-room');
  assert.equal((await call('POST', '/api/dispatch', { text: 'aç', clarificationId: id })).status, 400);
  assert.equal((await call('POST', '/api/dispatch', { text: 'cv', provider: 'other' })).status, 400);
});

test('the sole master routes directly and exposes actual CLI output over REST and SSE', async (t) => {
  const { call, waitFrame } = await api(t);
  Object.assign(process.env, { DESK_FAKE_PICK: 'approve-room', DESK_FAKE_INTENT: 'git' });
  t.after(() => ['DESK_FAKE_PICK', 'DESK_FAKE_INTENT'].forEach((k) => delete process.env[k]));
  const id = 'manager:master';
  const endpoint = `/api/managers/${encodeURIComponent(id)}/terminal`;
  assert.deepEqual((await call('GET', endpoint)).body.entries, []);
  const result = await call('POST', '/api/dispatch', { text: 'Approve Room ofisini aç', managerId: id });
  assert.equal(result.status, 200);
  assert.equal(result.body.route.length, 1);
  assert.equal(result.body.route[0].by, 'Master Yönetici');
  assert.equal(result.body.go.roomId, 'approve-room');
  const live = await waitFrame((e) => e.type === 'manager-cli' && e.managerId === id && e.kind === 'output');
  assert.match(live.text, /approve-room/);
  const terminal = (await call('GET', endpoint)).body.entries;
  assert.ok(terminal.some((e) => e.kind === 'status' && e.text.includes('claude')));
  assert.ok(terminal.some((e) => e.kind === 'output'));
  assert.ok(terminal.every((e) => e.managerId === id && e.provider === 'claude'));
  assert.deepEqual((await call('GET', endpoint + '?provider=codex')).body.entries, []);
  assert.equal((await call('GET', `/api/managers/${encodeURIComponent('manager:floor:f')}/terminal`)).status, 404);
  assert.equal((await call('POST', '/api/dispatch', { text: 'ofisi aç', managerId: 'manager:floor:f' })).status, 404);
  assert.equal((await call('POST', `/api/agents/${encodeURIComponent('manager:floor:f')}/chat`, { message: 'selam' })).status, 404);
  assert.equal((await call('GET', '/api/managers/unknown/terminal')).status, 404);
  assert.equal((await call('POST', '/api/dispatch', { text: 'selam', managerId: 'unknown' })).status, 404);
});

test('offered office choices navigate immediately without another LLM call or plan', async (t) => {
  const { call } = await api(t);
  Object.assign(process.env, { DESK_FAKE_PICK: 'approve-room', DESK_FAKE_CLARIFY: '1', DESK_FAKE_CANDIDATES: 'approve-room,plan-room' });
  t.after(() => ['DESK_FAKE_PICK','DESK_FAKE_CLARIFY','DESK_FAKE_CANDIDATES','DESK_FAKE_FAIL'].forEach((k) => delete process.env[k]));
  const ask = (await call('POST','/api/dispatch',{text:'cv yapacağım'})).body;
  assert.deepEqual(ask.clarification.options.map((o) => o.id), ['approve-room','plan-room']);
  const endpoint = `/api/managers/${encodeURIComponent('manager:master')}/terminal`;
  const count = (await call('GET',endpoint)).body.entries.length;
  process.env.DESK_FAKE_FAIL = '1';
  assert.equal((await call('POST','/api/dispatch',{text:'başka',targetId:'unoffered',clarificationId:ask.clarification.id})).status,400);
  const choice = await call('POST','/api/dispatch',{text:'Approve Room',targetId:'approve-room',clarificationId:ask.clarification.id});
  assert.equal(choice.status,200);
  assert.equal(choice.body.go.roomId,'approve-room');
  assert.equal(choice.body.plan,null);
  assert.equal((await call('GET',endpoint)).body.entries.length,count);
  assert.deepEqual((await call('GET','/api/state')).body.plans,[]);
});

test('an alternative explanation reconsiders routing from the master with the original context', async (t) => {
  const { call } = await api(t);
  Object.assign(process.env, { DESK_FAKE_PICK: 'approve-room', DESK_FAKE_CLARIFY: '1', DESK_FAKE_CANDIDATES: 'approve-room,plan-room' });
  t.after(() => ['DESK_FAKE_PICK','DESK_FAKE_CLARIFY','DESK_FAKE_CANDIDATES'].forEach((k) => delete process.env[k]));
  const ask = (await call('POST','/api/dispatch',{text:'cv yapacağım'})).body;
  process.env.DESK_FAKE_PICK='plan-room';
  const result = await call('POST','/api/dispatch',{text:'başka bir proje kastettim, plan room',reconsider:true,clarificationId:ask.clarification.id});
  assert.equal(result.status,200);
  assert.equal(result.body.go.roomId,'plan-room');
  assert.equal(result.body.route[0].by,'Master Yönetici');
  const entries = (await call('GET',`/api/managers/${encodeURIComponent('manager:master')}/terminal`)).body.entries;
  assert.equal(entries.filter((e) => e.kind==='output' && e.label==='Master Yönetici').length,2);
});

test('dialogues API: pool per office, validation, refill through the fake small model', async (t) => {
  const { call } = await api(t);
  assert.equal((await call('GET', '/api/dialogues?office=../etc')).status, 400);
  assert.equal((await call('GET', '/api/dialogues?office=nope')).status, 404);
  const first = await call('GET', '/api/dialogues?office=plan-room');
  assert.equal(first.status, 200);
  assert.ok(first.body.lines.length > 5);
  let second;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 100));
    second = await call('GET', '/api/dialogues?office=plan-room');
    if (second.body.source === 'antigravity') break;
  }
  assert.equal(second.body.source, 'antigravity');
  assert.ok(second.body.lines.some((l) => l.text === 'Kahvenin kokusu koridora kadar geliyor.'));
  const status = await call('GET', '/api/dialogues/status');
  assert.equal(status.body.usage.calls, 2);
});

test('weather location is opt-in, rounded, validated and removable', async t => {
  const {call}=await api(t);
  assert.equal((await call('GET','/api/dialogues/location')).body.configured,false);
  assert.equal((await call('POST','/api/dialogues/location',{latitude:999,longitude:29})).status,400);
  assert.equal((await call('POST','/api/dialogues/location',{latitude:41.012345,longitude:29.02345})).body.configured,true);
  assert.deepEqual((await call('GET','/api/dialogues/location')).body,{configured:true});
  assert.equal((await call('POST','/api/dialogues/location',{clear:true})).body.configured,false);
});

test('floor dialogue pools are shared across offices without creating a floor manager', async t => {
  const {call}=await api(t);
  const first=await call('GET','/api/dialogues?floor=f');
  assert.equal(first.status,200);assert.equal(first.body.office,'floor:f');
  assert.ok(first.body.lines.some(l=>l.kind==='visit'&&l.followUp&&l.answer));
  assert.equal((await call('GET','/api/dialogues?floor=missing')).status,404);
  const state=(await call('GET','/api/office')).body;
  assert.equal(state.managers.filter(m=>m.kind==='master').length,1);
  assert.ok(!state.agents.some(a=>a.id.startsWith('manager:floor')));
});

test('resume command: only for a coordinator with a real session, one-click copyable, path safely quoted', async (t) => {
  const { resumeCommand, shellQuote } = await import('../server/resume.js');
  assert.equal(shellQuote("a'b"), "'a'\\''b'");
  assert.equal(resumeCommand('claude', 'abc-12345678', '/p/My Proj'), "cd '/p/My Proj' && claude --resume abc-12345678");
  assert.equal(resumeCommand('codex', 'abc-12345678', '/p'), "cd '/p' && codex resume abc-12345678");
  const { call } = await api(t);
  assert.equal((await call('GET', `/api/agents/${encodeURIComponent('nope#project')}/resume`)).status, 404);
  assert.equal((await call('GET', `/api/agents/${encodeURIComponent('approve-room#project')}/resume`)).status, 404, 'no session yet');
  const sent = await call('POST', `/api/agents/${encodeURIComponent('approve-room#project')}/chat`, { message: 'selam', provider: 'claude' });
  assert.equal(sent.status, 200);
  const r = await call('GET', `/api/agents/${encodeURIComponent('approve-room#project')}/resume?provider=claude`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.match(r.body.command, /^cd '.*' && claude --resume chat-session-1$/);
});

test('a coordinator chat turn leaves a bounded CLI output log, like the Master', async (t) => {
  const { call } = await api(t);
  const id = 'approve-room#project';
  const endpoint = `/api/agents/${encodeURIComponent(id)}/terminal`;
  assert.deepEqual((await call('GET', endpoint)).body.entries, []);
  assert.equal((await call('POST', `/api/agents/${encodeURIComponent(id)}/chat`, { message: 'selam', provider: 'claude' })).status, 200);
  const entries = (await call('GET', endpoint)).body.entries;
  assert.ok(entries.some((e) => e.kind === 'status' && e.text.includes('claude')));
  assert.ok(entries.some((e) => e.kind === 'output'));
  assert.ok(entries.every((e) => e.managerId === id && e.provider === 'claude'));
  assert.deepEqual((await call('GET', endpoint + '?provider=codex')).body.entries, []);
});
