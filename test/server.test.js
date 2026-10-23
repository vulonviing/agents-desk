import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { join } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createNewsFeedback } from '../server/news-feedback.js';
import { structureNews } from '../server/news-taxonomy.js';
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

test('news publishing validates edition and origin; the news coordinator can open a read-only chat', async t => {
  const server = createDeskServer({ dataDir: tmp(), loadConfig: () => ({ dialogues: { enabled: false }, desks: [{ id: 'news', name: 'Haber Masası', kind: 'news', coordinator: 'Bora', path: '.' }] }) });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const url = `http://127.0.0.1:${server.address().port}`;
  const state = await (await fetch(url + '/api/news/session')).json();
  assert.equal(state.intervalMs, 3_600_000);
  const refreshed = await fetch(url + '/api/news/session/refresh', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(refreshed.status, 202);
  const paused = await refreshed.json();
  assert.equal(paused.status, 'stopped');
  assert.equal(paused.progress.percent, 0);
  assert.equal(paused.canRefresh, false);
  assert.equal((await fetch(url + '/api/news/session/refresh', { method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json' }, body: '{}' })).status, 403);
  assert.equal((await fetch(url + '/api/news/session/refresh', { method: 'POST', body: '{}' })).status, 415);

  assert.equal((await fetch(url + '/api/news/session/publish', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 409);
  assert.equal((await fetch(url + '/api/news/session/publish', { method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json' }, body: '{}' })).status, 403);
  assert.equal((await fetch(url + '/api/agents/news%23project/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: 'hi', articleId: 'unknown', provider: 'claude' }) })).status, 404);
});


test('news chat binds server-owned article evidence, switches articles in the same CLI, and persists no bodies', async t => {
 const dir=tmp(), log=join(dir,'fake.jsonl');
 Object.assign(process.env,{DESK_CLAUDE_BIN:FAKE,DESK_FAKE_LOG:log});
 t.after(()=>{delete process.env.DESK_CLAUDE_BIN;delete process.env.DESK_FAKE_LOG;});
 const articles=['deepinfer','php-security'].map((key,i)=>structureNews({id:key,kind:'news',title:i?'PHP security update':'DeepSeek DeepInfer',url:`https://example.com/${key}`,publisher:'Example',publishedAt:Date.now(),expiresAt:Date.now()+3600000}));
 createNewsFeedback({dataDir:dir}).register(articles);
 let reads=0;
 const server=createDeskServer({dataDir:dir,briefing:async (_dir,args)=>{reads++;return {details:args.articleUrls.map(url=>({url,text:'EPHEMERAL_ARTICLE_EVIDENCE '+url}))};},loadConfig:()=>({dialogues:{enabled:false},desks:[{id:'news',kind:'news',name:'News Desk',coordinator:'Bora',path:dir}]})});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>{server.closeAllConnections();server.close();});
 const base=`http://127.0.0.1:${server.address().port}/api/agents/news%23project`;
 const post=body=>fetch(base+'/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 const first=await post({message:'Explain this framework.',provider:'claude',articleId:articles[0].articleId,articleText:'FORGED_CONTENT'});assert.equal(first.status,200);
 await post({message:'More detail?',provider:'claude',articleId:articles[0].articleId});assert.equal(reads,1);
 await post({message:'And this update?',provider:'claude',articleId:articles[1].articleId});assert.equal(reads,2);
 const calls=readFileSync(log,'utf8').trim().split('\n').map(JSON.parse);
 assert.equal(calls.length,3);assert.ok(calls[1].args.includes('--resume'));assert.ok(calls[2].args.includes('chat-session-1'));
 const prompt=c=>c.args[c.args.indexOf('--append-system-prompt')+1];
 assert.match(prompt(calls[0]),/Bora/);assert.match(prompt(calls[0]),/EPHEMERAL_ARTICLE_EVIDENCE/);assert.ok(!prompt(calls[0]).includes('FORGED_CONTENT'));
 assert.match(prompt(calls[2]),/PHP security update/);assert.ok(!prompt(calls[2]).includes('DeepSeek DeepInfer'));
 assert.ok(!readFileSync(join(dir,'chat-sessions.json'),'utf8').includes('EPHEMERAL'));
 assert.equal((await post({message:'Unknown',provider:'claude',articleId:'unknown'})).status,404);
 const resume=await(await fetch(base+'/resume?provider=claude')).json();assert.match(resume.command,/claude --resume chat-session-1/);
});
