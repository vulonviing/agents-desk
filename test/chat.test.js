import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHAT_TOOLS, chatArgs, chatPrompt, createChats, runChat } from '../server/chat.js';
import { tmp } from './helpers.js';

const FAKE = join(import.meta.dirname, 'fake-claude.mjs');
const room = (path) => ({ id: 'cv', name: 'CV', path });
const coordinator = { kind: 'project', key: 'project', name: 'CV Koordinatörü', coordinator: true };
const env = (log) => Object.assign(process.env, { DESK_CLAUDE_BIN: FAKE, DESK_FAKE_LOG: log });
const clean = () => ['DESK_CLAUDE_BIN', 'DESK_FAKE_LOG', 'DESK_FAKE_FAIL', 'ANTHROPIC_API_KEY'].forEach((k) => delete process.env[k]);
const calls = (log) => readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l));

test('chat prompt and args: a coordinator is the read-only CLI of its project', () => {
  const r = room('/x');
  assert.match(chatPrompt(r, coordinator), /koordinatörüsün/);
  assert.match(chatPrompt(r, coordinator), /salt-okunur/);
  const args = chatArgs(r, coordinator, 'sess-1');
  assert.ok(args.includes('--restricted') && args.includes('--strict-mcp-config'));
  assert.equal(args[args.indexOf('--tools') + 1], CHAT_TOOLS);
  assert.equal(args[args.indexOf('--permission-prompts') + 1], 'none');
  assert.equal(args[args.indexOf('--resume') + 1], 'sess-1');
  assert.ok(!chatArgs(r, coordinator, null).includes('--resume'));
});

test('a turn runs in the project folder without API keys and returns the reply and the session id', async (t) => {
  const log = join(tmp(), 'log.jsonl');
  env(log);
  process.env.ANTHROPIC_API_KEY = 'k';
  t.after(clean);
  const out = await runChat(room(tmp()), coordinator, 'merhaba');
  assert.deepEqual(out, { reply: 'yanıt: merhaba', sessionId: 'chat-session-1' });
  const c = calls(log)[0];
  assert.deepEqual([c.mode, c.anthropicEnv, c.stdin], ['chat', [], 'merhaba']);
});

test('the history continues the same CLI session, and a failure is recorded and surfaced', async (t) => {
  const log = join(tmp(), 'log.jsonl');
  env(log);
  t.after(clean);
  const r = room(tmp());
  const lifecycle = [];
  const chats = createChats({ onChange: (event) => lifecycle.push(event) });
  await chats.send(r, coordinator, 'claude:cv#project', 'bir');
  const msgs = await chats.send(r, coordinator, 'claude:cv#project', 'iki');
  assert.deepEqual(msgs.map((m) => [m.role, m.text]), [['user', 'bir'], ['assistant', 'yanıt: bir'], ['user', 'iki'], ['assistant', 'yanıt: iki']]);
  assert.equal(calls(log)[1].args[calls(log)[1].args.indexOf('--resume') + 1], 'chat-session-1');
  assert.equal(lifecycle.filter((e) => e.phase === 'completed').at(-1).ok, true);
  process.env.DESK_FAKE_FAIL = '1';
  await assert.rejects(chats.send(r, coordinator, 'claude:cv#project', 'üç'), (e) => e.status === 502 && /Hata/.test(e.message));
  assert.equal(chats.history('claude:cv#project').messages.at(-1).role, 'error');
  assert.equal(lifecycle.filter((e) => e.phase === 'completed').at(-1).ok, false);
  chats.reset('claude:cv#project');
  assert.deepEqual(chats.history('claude:cv#project').messages, []);
});

test('chat validates the message and refuses a second message while one is running', async (t) => {
  env(join(tmp(), 'log.jsonl'));
  t.after(clean);
  const r = room(tmp());
  const chats = createChats();
  await assert.rejects(chats.send(r, coordinator, 'claude:cv#project', '   '), (e) => e.status === 400);
  await assert.rejects(chats.send(r, coordinator, 'claude:cv#project', 'x'.repeat(2001)), (e) => e.status === 400);
  const first = chats.send(r, coordinator, 'claude:cv#project', 'uzun');
  await assert.rejects(chats.send(r, coordinator, 'claude:cv#project', 'ikinci'), (e) => e.status === 409);
  await first;
});

test('Codex coordinators run a real read-only session in the project folder and resume the same thread', async (t) => {
  const log = join(tmp(), 'codex.jsonl');
  Object.assign(process.env, { DESK_CODEX_BIN: join(import.meta.dirname, 'fake-codex.mjs'), DESK_CODEX_LOG: log });
  t.after(() => ['DESK_CODEX_BIN', 'DESK_CODEX_LOG'].forEach((k) => delete process.env[k]));
  const r = room(tmp()), cli = [];
  const chats = createChats();
  const first = await chats.send(r, coordinator, 'codex:cv#project', 'en çok hangi şirkete başvurdum?', 'codex', { onEvent: (e) => cli.push(e) });
  await chats.send(r, coordinator, 'codex:cv#project', 'devam et', 'codex');
  const invocations = calls(log);
  assert.equal(invocations.length, 2);
  assert.ok(!invocations[0].args.includes('--ephemeral'));
  assert.ok(invocations[0].args.includes('read-only'));
  assert.ok(invocations[1].args.includes('resume'));
  assert.ok(invocations[1].args.includes('11111111-1111-4111-8111-111111111111'));
  assert.equal(invocations[0].apiKeys.length, 0);
  assert.equal(first.at(-1).text, 'codex chat reply');
  assert.ok(cli.some((e) => e.kind === 'status' && e.text.includes('komut: rg')));
  assert.equal(chats.state('cv#project').sessionId, '11111111-1111-4111-8111-111111111111');
});

test('CLI session ids (never message text) survive a server restart through sessionsFile; a reset forgets them', async (t) => {
  const log = join(tmp(), 'log.jsonl');
  env(log);
  t.after(clean);
  const file = join(tmp(), 'sessions.json');
  const r = room(tmp());
  const first = createChats({ sessionsFile: file });
  await first.send(r, coordinator, 'claude:cv#project', 'merhaba');
  assert.doesNotMatch(readFileSync(file, 'utf8'), /merhaba|yanıt/);
  const second = createChats({ sessionsFile: file });
  assert.equal(second.state('cv#project').sessionId, 'chat-session-1');
  await second.send(r, coordinator, 'claude:cv#project', 'devam');
  assert.equal(calls(log).at(-1).args[calls(log).at(-1).args.indexOf('--resume') + 1], 'chat-session-1');
  second.reset('claude:cv#project');
  assert.equal(createChats({ sessionsFile: file }).state('cv#project'), null);
});

test('news research enables native web tools while keeping the existing CLI session', () => {
  const def={kind:'news',name:'Bora',lang:'tr'};
  const args=chatArgs(room('/x'),def,'existing-session');
  assert.equal(args[args.indexOf('--tools')+1],'WebSearch,WebFetch');
  assert.equal(args[args.indexOf('--allowedTools')+1],'WebSearch,WebFetch');
  assert.equal(args[args.indexOf('--resume')+1],'existing-session');
  assert.match(chatPrompt(room('/x'),def),/native public web search/);
});
