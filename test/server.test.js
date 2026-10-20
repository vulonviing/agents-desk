import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { join } from 'node:path';
import { createDeskServer } from '../server/server.js';
import { tmp } from './helpers.js';

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

const FAKE = join(import.meta.dirname, 'fake-claude.mjs');
async function start(t) {
  const project = tmp();
  Object.assign(process.env, { DESK_CLAUDE_BIN: FAKE });
  t.after(() => delete process.env.DESK_CLAUDE_BIN);
  const server = createDeskServer({
    dataDir: tmp(),
    briefing: async () => ({ sources: [] }),
    loadConfig: () => ({ dialogues: { enabled: false }, desks: [{ id: 'cv', name: 'CV', path: project, coordinator: 'CV Koordinatörü', description: 'CV hattı' }] }),
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const port = server.address().port;
  const call = async (method, path, body, headers = {}) => {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  return { port, call };
}

test('server: serves the office page, blocks foreign hosts/origins and path traversal', async (t) => {
  const { port } = await start(t);
  const page = await request(port, '/');
  assert.equal(page.status, 200);
  assert.match(page.type, /text\/html/);
  assert.equal((await request(port, '/', { headers: { host: 'evil.example' } })).status, 403);
  assert.equal((await request(port, '/api/agents/cv%23project/chat', { method: 'POST', headers: { origin: 'http://evil.example' } })).status, 403);
  assert.equal((await request(port, '/..%2fpackage.json')).status, 404);
  assert.equal((await request(port, '/index.html', { method: 'POST' })).status, 405);
});

test('office snapshot: one coordinator per desk', async (t) => {
  const { call } = await start(t);
  const { body } = await call('GET', '/api/office');
  assert.deepEqual(body.desks.map((d) => d.id), ['cv']);
  assert.equal(body.agents[0].id, 'cv#project');
  assert.equal(body.agents[0].name, 'CV Koordinatörü');
  assert.equal(body.managers, undefined);
});

test('a coordinator chat keeps one resumable session; resume gives the paste-able command; reset clears it', async (t) => {
  const { call } = await start(t);
  assert.equal((await call('GET', '/api/agents/cv%23project/resume?provider=claude')).status, 404);
  const first = await call('POST', '/api/agents/cv%23project/chat', { message: 'merhaba', provider: 'claude' });
  assert.equal(first.status, 200);
  assert.equal(first.body.messages.at(-1).text, 'yanıt: merhaba');
  const resume = await call('GET', '/api/agents/cv%23project/resume?provider=claude');
  assert.match(resume.body.command, /^cd '.+' && claude --resume chat-session-1$/);
  assert.equal((await call('GET', '/api/agents/cv%23project/chat?provider=claude')).body.messages.length, 2);
  await call('POST', '/api/agents/cv%23project/chat/reset', { provider: 'claude' });
  assert.deepEqual((await call('GET', '/api/agents/cv%23project/chat?provider=claude')).body.messages, []);
  assert.equal((await call('POST', '/api/agents/ghost%23project/chat', { message: 'x', provider: 'claude' })).status, 404);
  assert.equal((await call('POST', '/api/agents/cv%23project/chat', { message: 'x', provider: 'bash' })).status, 400);
});

test('there is no Master: its chat and resume endpoints do not exist', async (t) => {
  const { call } = await start(t);
  assert.equal((await call('POST', '/api/agents/manager%3Amaster/chat', { message: 'x', provider: 'claude' })).status, 404);
});
