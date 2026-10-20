import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHAT_TOOLS, chatArgs, chatPrompt, createChats, findAgent, parseAgentId, runChat } from '../server/chat.js';
import { tmp } from './helpers.js';

const FAKE = join(import.meta.dirname, 'fake-claude.mjs');
const skill = (name) => ({ id: `skill:${name}`, skill: name, name, kind: 'skill' });
const room = (path) => ({ id: 'cv', name: 'CV', path, level: 'plan', embedded: [], stations: [skill('style'), skill('math')] });
const env = (log) => Object.assign(process.env, { DESK_CLAUDE_BIN: FAKE, DESK_FAKE_LOG: log });
const clean = () => ['DESK_CLAUDE_BIN', 'DESK_FAKE_LOG', 'DESK_FAKE_FAIL', 'ANTHROPIC_API_KEY'].forEach((k) => delete process.env[k]);
const calls = (log) => readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l));

test('parseAgentId and findAgent resolve skill and project agents of a room', () => {
  assert.deepEqual(parseAgentId('cv#skill:style'), { roomId: 'cv', key: 'skill:style' });
  assert.equal(parseAgentId('nohash'), null);
  const r = room('/x');
  assert.equal(findAgent(r, 'cv#skill:style').name, 'style');
  assert.equal(findAgent(r, 'cv#skill:ghost'), null);
  assert.equal(findAgent(r, 'other#skill:style'), null);
  assert.equal(findAgent({ ...r, stations: [] }, 'cv#project').kind, 'project');
});

test('chat prompt: a skill agent speaks as the skill, a project agent is the CLI of the project; both are read-only', () => {
  const r = room('/x');
  const s = chatPrompt(r, findAgent(r, 'cv#skill:style'));
  assert.match(s, /"style" skill'isin/);
  assert.match(s, /SKILL\.md|Skill aracı/);
  assert.match(s, /salt-okunur/);
  const p = chatPrompt({ ...r, stations: [] }, findAgent({ ...r, stations: [] }, 'cv#project'));
  assert.match(p, /projesinin ajanısın/);
  assert.match(p, /salt-okunur/);
  const args = chatArgs(r, findAgent(r, 'cv#skill:style'), 'sess-1');
  assert.ok(args.includes('--restricted') && args.includes('--strict-mcp-config'));
  assert.equal(args[args.indexOf('--tools') + 1], CHAT_TOOLS);
  assert.equal(args[args.indexOf('--permission-prompts') + 1], 'none');
  assert.equal(args[args.indexOf('--resume') + 1], 'sess-1');
  assert.ok(!chatArgs(r, findAgent(r, 'cv#skill:style'), null).includes('--resume'));
});

test('a turn runs in the project folder without API keys and returns the reply and the session id', async (t) => {
  const log = join(tmp(), 'log.jsonl');
  const project = tmp();
  env(log);
  process.env.ANTHROPIC_API_KEY = 'k';
  t.after(clean);
  const r = room(project);
  const out = await runChat(r, findAgent(r, 'cv#skill:style'), 'merhaba');
  assert.deepEqual(out, { reply: 'yanıt: merhaba', sessionId: 'chat-session-1' });
  const c = calls(log)[0];
  assert.deepEqual([c.mode, c.anthropicEnv, c.stdin], ['chat', [], 'merhaba']);
});

test('the history continues the same CLI session, and a failure is recorded and surfaced', async (t) => {
  const log = join(tmp(), 'log.jsonl');
  env(log);
  t.after(clean);
  const r = room(tmp());
  const def = findAgent(r, 'cv#skill:math');
  const lifecycle = [];
  const chats = createChats({onChange:event=>lifecycle.push(event)});
  await chats.send(r, def, 'cv#skill:math', 'bir');
  const msgs = await chats.send(r, def, 'cv#skill:math', 'iki');
  assert.deepEqual(msgs.map((m) => [m.role, m.text]), [['user', 'bir'], ['assistant', 'yanıt: bir'], ['user', 'iki'], ['assistant', 'yanıt: iki']]);
  assert.equal(calls(log)[1].args[calls(log)[1].args.indexOf('--resume') + 1], 'chat-session-1');
  assert.equal(lifecycle.filter(e=>e.phase==='completed').at(-1).ok,true);
  process.env.DESK_FAKE_FAIL = '1';
  await assert.rejects(chats.send(r, def, 'cv#skill:math', 'üç'), (e) => e.status === 502 && /Hata/.test(e.message));
  assert.equal(chats.history('cv#skill:math').messages.at(-1).role, 'error');
  assert.equal(lifecycle.filter(e=>e.phase==='completed').at(-1).ok,false);
  chats.reset('cv#skill:math');
  assert.deepEqual(chats.history('cv#skill:math').messages, []);
});

test('chat validates the message and refuses a second message while one is running', async (t) => {
  env(join(tmp(), 'log.jsonl'));
  t.after(clean);
  const r = room(tmp());
  const def = findAgent(r, 'cv#skill:style');
  const chats = createChats();
  await assert.rejects(chats.send(r, def, 'cv#skill:style', '   '), (e) => e.status === 400);
  await assert.rejects(chats.send(r, def, 'cv#skill:style', 'x'.repeat(2001)), (e) => e.status === 400);
  const first = chats.send(r, def, 'cv#skill:style', 'uzun');
  await assert.rejects(chats.send(r, def, 'cv#skill:style', 'ikinci'), (e) => e.status === 409);
  await first;
});

test('Codex coordinators start a persistent CLI and delegate to a validated skill in the same session', async t => {
  const log = join(tmp(), 'codex.jsonl');
  Object.assign(process.env, { DESK_CODEX_BIN: join(import.meta.dirname,'fake-codex.mjs'), DESK_CODEX_LOG: log, DESK_CODEX_STATION: 'skill:style' });
  t.after(()=>['DESK_CODEX_BIN','DESK_CODEX_LOG','DESK_CODEX_STATION'].forEach(k=>delete process.env[k]));
  const r=room(tmp()), events=[];
  const chats=createChats({onChange:e=>events.push(e)});
  const result=await chats.send(r,{...findAgent(r,'cv#project'),coordinator:true},'codex:cv#project','CV metnimi incele','codex');
  const invocations=calls(log);
  assert.equal(invocations.length,2);
  assert.ok(!invocations[0].args.includes('--ephemeral'));
  assert.ok(invocations[1].args.includes('resume'));
  assert.ok(invocations[1].args.includes('11111111-1111-4111-8111-111111111111'));
  assert.equal(invocations[0].apiKeys.length,0);
  assert.ok(events.some(e=>e.phase==='delegation'&&e.stationId==='skill:style'));
  assert.match(result.at(-1).text,/style/);
  assert.equal(chats.state('cv#project').sessionId,'11111111-1111-4111-8111-111111111111');
});

test('Codex coordinator: an unknown skill id degrades to a normal chat reply, not an error', async t => {
  const log = join(tmp(), 'codex.jsonl');
  Object.assign(process.env, { DESK_CODEX_BIN: join(import.meta.dirname,'fake-codex.mjs'), DESK_CODEX_LOG: log, DESK_CODEX_STATION: 'skill:does-not-exist' });
  t.after(()=>['DESK_CODEX_BIN','DESK_CODEX_LOG','DESK_CODEX_STATION'].forEach(k=>delete process.env[k]));
  const r=room(tmp()), events=[];
  const chats=createChats({onChange:e=>events.push(e)});
  const result=await chats.send(r,{...findAgent(r,'cv#project'),coordinator:true},'codex:cv#project','nasıl bir proje bu','codex');
  assert.equal(result.at(-1).role,'assistant');
  assert.ok(!events.some(e=>e.phase==='delegation'));
  assert.equal(calls(log).length,1);
});

test('a coordinator can resume a known external Claude session', async t => {
  const log=join(tmp(),'claude.jsonl'); env(log);t.after(clean);
  const r=room(tmp());
  await createChats().send(r,findAgent(r,'cv#project'),'claude:cv#project','devam et','claude',{resumeSessionId:'known-session'});
  assert.equal(calls(log)[0].args[calls(log)[0].args.indexOf('--resume')+1],'known-session');
});
