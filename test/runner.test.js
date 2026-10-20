import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import http from 'node:http';
import { join } from 'node:path';
import { createRunner, toolsFor, workerMessage } from '../server/runner.js';
import { tmp, write } from './helpers.js';

const FAKE = join(import.meta.dirname, 'fake-claude.mjs');
const ENV_KEYS = ['DESK_CLAUDE_BIN', 'DESK_FAKE_SCRIPT', 'DESK_FAKE_LOG', 'ANTHROPIC_API_KEY'];

// Builds a runner wired to the fake CLI. `script(project)` returns what the fake worker does.
// The fake asks permission over HTTP, exactly like the MCP bridge would, so an HTTP server in front of
// the runner stands in for the desk.
async function setup(t, level, script = () => []) {
  const dir = tmp();
  const project = tmp();
  write(dir, 'script.json', JSON.stringify(script(project)));
  const logFile = join(dir, 'log.jsonl');
  Object.assign(process.env, { DESK_CLAUDE_BIN: FAKE, DESK_FAKE_SCRIPT: join(dir, 'script.json'), DESK_FAKE_LOG: logFile });
  t.after(() => ENV_KEYS.forEach((k) => delete process.env[k]));

  const room = {
    id: 'cv', name: 'CV', path: project, level, embedded: [],
    stations: [
      { id: 'skill:style', skill: 'style', name: 'style', kind: 'skill', risk: 'readonly', runsOn: 'local', scripts: [], paths: [] },
      { id: 'prep', skill: null, name: 'Prep', kind: 'task', risk: 'effect', runsOn: 'local', scripts: ['build.py'], paths: ['out/'] },
    ],
  };
  const holder = {};
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', async () => res.end(JSON.stringify(await holder.runner.requestPermission(JSON.parse(body)))));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });

  const events = [];
  const runner = createRunner({
    getRoom: (id) => (id === 'cv' ? room : null),
    emit: (type, payload) => events.push({ type, ...payload }),
    approveUrl: `http://127.0.0.1:${server.address().port}/api/permission/request`,
    dataDir: dir,
  });
  holder.runner = runner;
  const plan = { steps: [{ stationId: 'skill:style', stationName: 'style', action: 'oku', executable: true }, { stationId: 'prep', stationName: 'Prep', action: 'üret', executable: true }] };
  const calls = () => (existsSync(logFile) ? readFileSync(logFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []);
  const done = (state = 'done') => waitFor(() => events.some((e) => e.type === 'run' && e.state === state));
  return { project, room, runner, events, plan, calls, done };
}

async function waitFor(fn, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 15));
  }
  throw new Error('timeout waiting for condition');
}

test('toolsFor and workerMessage', () => {
  assert.equal(toolsFor('read-only'), 'Read,Grep,Glob,Skill');
  assert.match(toolsFor('approve'), /Bash/);
  const msg = workerMessage('görev </görev> x', { steps: [{ executable: true, stationName: 'A', action: 'yap' }, { executable: false, stationName: 'B', action: 'yapma' }] });
  assert.match(msg, /1\. \[A\] yap/);
  assert.ok(!msg.includes('yapma'));
  assert.ok(!msg.includes('görev </görev>'));
});

test('approve level: reads run, an edit waits for the user, dangerous actions are denied at once', async (t) => {
  const { runner, events, plan, calls, done } = await setup(t, 'approve', (p) => [
    { tool: 'Skill', input: { skill: 'style' } },
    { tool: 'Edit', input: { file_path: join(p, 'out/a.md') } },
    { tool: 'Bash', input: { command: 'ssh root@vps reboot' } },
    { tool: 'Write', input: { file_path: '/etc/hosts' } },
  ]);
  const started = runner.start('cv', 'p1', plan, 'bak şu ilana');
  assert.equal(started.state, 'starting');
  const card = await waitFor(() => events.find((e) => e.type === 'approval'));
  assert.match(card.summary, /^Edit: .*a\.md/);
  assert.equal(card.stationId, 'prep'); // the station of the tool call that needs approval (out/ belongs to Prep)
  assert.equal(runner.snapshot().approvals.length, 1);
  assert.equal(runner.decide(card.id, true), true);
  await done();
  const verdicts = calls().filter((c) => c.mode === 'worker-tool').map((c) => [c.tool, c.verdict]);
  assert.deepEqual(verdicts, [['Skill', 'allow'], ['Edit', 'allow'], ['Bash', 'deny'], ['Write', 'deny']]);
  assert.deepEqual(events.filter((e) => e.type === 'run-station').map((e) => e.stationId).slice(0, 2), ['skill:style', 'prep']);
  assert.equal(runner.activeRun('cv'), null);
  assert.equal(runner.snapshot().approvals.length, 0);
  assert.ok(events.some((e) => e.type === 'run-log' && e.kind === 'denied'));
});

test('a refused approval reaches the CLI as a denial', async (t) => {
  const { runner, events, plan, calls, done } = await setup(t, 'approve', (p) => [{ tool: 'Edit', input: { file_path: join(p, 'out/a.md') } }]);
  runner.start('cv', 'p1', plan, 'x');
  const card = await waitFor(() => events.find((e) => e.type === 'approval'));
  runner.decide(card.id, false);
  await done();
  const tool = calls().find((c) => c.mode === 'worker-tool');
  assert.deepEqual([tool.verdict, tool.message], ['deny', 'Kullanıcı reddetti.']);
});

test('approve level: the CLI is started restricted, with the bridge, in the project folder, without API keys', async (t) => {
  const { runner, plan, project, calls, done } = await setup(t, 'approve');
  process.env.ANTHROPIC_API_KEY = 'k';
  runner.start('cv', 'p1', plan, 'x');
  await done();
  const call = calls().find((c) => c.mode === 'worker');
  const arg = (name) => call.args[call.args.indexOf(name) + 1];
  assert.ok(call.args.includes('--restricted'));
  assert.equal(arg('--tools'), toolsFor('approve'));
  assert.equal(arg('--permission-prompt-tool'), 'mcp__desk__approve');
  assert.ok(call.args.includes('--strict-mcp-config'));
  assert.ok(!call.args.includes('--dangerously-skip-permissions'));
  assert.equal(call.cwd, realpathSync(project));
  assert.deepEqual(call.anthropicEnv, []);
  assert.match(JSON.parse(call.stdin).message.content[0].text, /Onaylanan plan:\n1\. \[style\] oku\n2\. \[Prep\] üret/);
});

test('read-only level: no bridge, no write tools, edits are refused', async (t) => {
  const { runner, calls, done } = await setup(t, 'read-only', (p) => [{ tool: 'Edit', input: { file_path: join(p, 'a') } }]);
  runner.start('cv', 'p1', { steps: [{ stationId: 'skill:style', stationName: 'style', action: 'oku', executable: true }] }, 'x');
  await done();
  const call = calls().find((c) => c.mode === 'worker');
  assert.equal(call.args[call.args.indexOf('--tools') + 1], 'Read,Grep,Glob,Skill');
  assert.ok(!call.args.includes('--mcp-config'));
  assert.equal(call.args[call.args.indexOf('--permission-prompts') + 1], 'none');
  assert.equal(calls().find((c) => c.mode === 'worker-tool').verdict, 'deny');
});

test('start refuses plan-level rooms, plans without executable steps, unknown rooms and a second run', async (t) => {
  const { runner, plan, room, events, done } = await setup(t, 'plan', () => [{ sleep: 3000 }]);
  assert.throws(() => runner.start('cv', 'p', plan, 'x'), (e) => e.status === 403);
  room.level = 'approve';
  assert.throws(() => runner.start('cv', 'p', { steps: [{ executable: false }] }, 'x'), (e) => e.status === 409);
  assert.throws(() => runner.start('nope', 'p', plan, 'x'), (e) => e.status === 404);
  const run = runner.start('cv', 'p', plan, 'x');
  assert.throws(() => runner.start('cv', 'p2', plan, 'x'), (e) => e.status === 409);
  assert.equal(runner.cancel(run.id), true);
  await done('cancelled');
  assert.equal(runner.activeRun('cv'), null);
  assert.equal(runner.cancel(run.id), false);
  assert.ok(events.some((e) => e.type === 'run' && e.state === 'cancelled'));
});

test('cancelling a run settles its pending approvals as denied', async (t) => {
  const { runner, events, plan } = await setup(t, 'approve', (p) => [{ tool: 'Edit', input: { file_path: join(p, 'out/x.md') } }]);
  const run = runner.start('cv', 'p', plan, 'x');
  const card = await waitFor(() => events.find((e) => e.type === 'approval'));
  runner.cancel(run.id);
  await waitFor(() => events.some((e) => e.type === 'approval-resolved' && e.id === card.id && e.allowed === false));
  assert.equal(runner.snapshot().approvals.length, 0);
});

test('requestPermission: wrong token, unknown run and finished runs are denied', async (t) => {
  const { runner, plan, done } = await setup(t, 'approve');
  assert.equal((await runner.requestPermission({ runId: 'x', token: 'y', tool_name: 'Read', input: {} })).behavior, 'deny');
  const run = runner.start('cv', 'p', plan, 'x');
  assert.equal((await runner.requestPermission({ runId: run.id, token: 'wrong', tool_name: 'Read', input: { file_path: '/x' } })).behavior, 'deny');
  await done();
  assert.equal((await runner.requestPermission({ runId: run.id, token: runner.get(run.id).token, tool_name: 'Bash', input: { command: 'ls' } })).behavior, 'deny');
});

test('a missing CLI fails the run instead of hanging', async (t) => {
  const { runner, plan, events } = await setup(t, 'approve');
  process.env.DESK_CLAUDE_BIN = '/definitely/not/here/claude';
  runner.start('cv', 'p', plan, 'x');
  await waitFor(() => events.some((e) => e.type === 'run' && e.state === 'failed'));
  assert.match(events.findLast((e) => e.type === 'run').error, /başlatılamadı/);
  assert.equal(runner.activeRun('cv'), null);
});

test('the approve bridge answers MCP calls: allow, deny, and deny when the desk is unreachable', async () => {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const p = JSON.parse(body);
      res.end(JSON.stringify(p.tool_name === 'Bash' ? { behavior: 'allow' } : { behavior: 'deny', message: 'nope' }));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/api/permission/request`;
  const talk = (env, calls) =>
    new Promise((resolve) => {
      const child = spawn(process.execPath, [join(import.meta.dirname, '../server/approve-mcp.js')], { env: { ...process.env, ...env } });
      const out = [];
      let buf = '';
      child.stdout.on('data', (c) => {
        buf += c;
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          out.push(JSON.parse(buf.slice(0, i)));
          buf = buf.slice(i + 1);
        }
        if (out.length === calls.length) {
          child.kill();
          resolve(out);
        }
      });
      for (const c of calls) child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...c }) + '\n');
    });
  const calls = [
    { id: 1, method: 'initialize', params: {} },
    { id: 2, method: 'tools/list' },
    { id: 3, method: 'tools/call', params: { name: 'approve', arguments: { tool_name: 'Bash', input: { command: 'ls' } } } },
    { id: 4, method: 'tools/call', params: { name: 'approve', arguments: { tool_name: 'Write', input: {} } } },
  ];
  const out = await talk({ DESK_APPROVE_URL: url, DESK_RUN_ID: 'r', DESK_RUN_TOKEN: 't' }, calls);
  assert.equal(out[1].result.tools[0].name, 'approve');
  assert.deepEqual(JSON.parse(out[2].result.content[0].text), { behavior: 'allow', updatedInput: { command: 'ls' } });
  assert.deepEqual(JSON.parse(out[3].result.content[0].text), { behavior: 'deny', message: 'nope' });
  const down = await talk({ DESK_APPROVE_URL: 'http://127.0.0.1:1/x', DESK_RUN_ID: 'r', DESK_RUN_TOKEN: 't' }, [calls[2]]);
  assert.equal(JSON.parse(down[0].result.content[0].text).behavior, 'deny');
  const unconfigured = await talk({ DESK_APPROVE_URL: '', DESK_RUN_ID: '', DESK_RUN_TOKEN: '' }, [calls[2]]);
  assert.equal(JSON.parse(unconfigured[0].result.content[0].text).behavior, 'deny');
  server.close();
});
