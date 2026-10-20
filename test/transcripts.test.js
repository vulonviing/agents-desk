import test from 'node:test';
import assert from 'node:assert/strict';
import { symlinkSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { listSessions, readConversation } from '../server/transcripts.js';
import { tmp, write } from './helpers.js';

const line = (o) => JSON.stringify(o) + '\n';
const user = (text, extra = {}) => line({ type: 'user', timestamp: '2026-10-19T10:00:00Z', message: { content: text }, ...extra });
const asst = (content) => line({ type: 'assistant', timestamp: '2026-10-19T10:00:05Z', message: { content } });
const SID = 'aaaaaaaa-1111-2222-3333-bbbbbbbbbbbb';

function fixture() {
  const root = tmp();
  const room = { id: 'cv', path: '/D/Emrecan CV', embedded: [] };
  write(root, `-D-Emrecan-CV/${SID}.jsonl`,
    user('<system-reminder>noise</system-reminder>Merhaba, şu ilana bak') +
    asst([{ type: 'text', text: 'Bakıyorum.' }, { type: 'tool_use', name: 'Read', input: { file_path: '/D/Emrecan CV/base/master.json', secret: 'X' } }]) +
    line({ type: 'user', message: { content: [{ type: 'tool_result', content: 'HUGE TOOL OUTPUT' }] } }) +
    user('meta', { isMeta: true }) +
    asst([{ type: 'text', text: 'side', }]).replace('"type":"assistant"', '"type":"assistant","isSidechain":true') +
    asst([{ type: 'text', text: 'Bitti.' }]));
  write(root, '-D-Other/bbbbbbbb-1111-2222-3333-cccccccccccc.jsonl', user('başka proje'));
  return { root, room, config: { sessions: { projectsDir: root } } };
}

test('listSessions: only the room\'s sessions, newest first, with a one-line preview', async () => {
  const { root, room, config } = fixture();
  write(root, '-D-Emrecan-CV/cccccccc-1111-2222-3333-dddddddddddd.jsonl', user('daha eski oturum'));
  utimesSync(join(root, '-D-Emrecan-CV/cccccccc-1111-2222-3333-dddddddddddd.jsonl'), 1000, 1000);
  const list = await listSessions(room, config);
  assert.deepEqual(list.map((s) => s.id), [SID, 'cccccccc-1111-2222-3333-dddddddddddd']);
  assert.equal(list[0].preview, 'Merhaba, şu ilana bak');
});

test('readConversation: user and assistant text and tool names; no tool output, meta or side chains', async () => {
  const { room, config } = fixture();
  const conv = await readConversation(room, SID, config);
  assert.deepEqual(conv.messages.map((m) => [m.role, m.text]), [['user', 'Merhaba, şu ilana bak'], ['assistant', 'Bakıyorum.'], ['assistant', 'Bitti.']]);
  assert.deepEqual(conv.messages[1].tools, [{ name: 'Read', file: 'master.json' }]);
  const dump = JSON.stringify(conv);
  assert.ok(!dump.includes('HUGE TOOL OUTPUT') && !dump.includes('"secret"') && !dump.includes('noise'));
});

test('readConversation: bad ids, other projects and symlinks out of the projects folder are refused', async () => {
  const { root, room, config } = fixture();
  assert.equal(await readConversation(room, '../../etc/passwd', config), null);
  assert.equal(await readConversation(room, 'short', config), null);
  assert.equal(await readConversation(room, 'bbbbbbbb-1111-2222-3333-cccccccccccc', config), null); // belongs to another project
  const outside = tmp();
  write(outside, 'leak.jsonl', user('secret'));
  symlinkSync(join(outside, 'leak.jsonl'), join(root, '-D-Emrecan-CV/dddddddd-1111-2222-3333-eeeeeeeeeeee.jsonl'));
  assert.equal(await readConversation(room, 'dddddddd-1111-2222-3333-eeeeeeeeeeee', config), null);
});

test('readConversation: keeps the last 200 messages and says so', async () => {
  const root = tmp();
  let body = '';
  for (let i = 0; i < 250; i++) body += user(`message ${i}`);
  write(root, `-D-Emrecan-CV/${SID}.jsonl`, body);
  const conv = await readConversation({ id: 'cv', path: '/D/Emrecan CV', embedded: [] }, SID, { sessions: { projectsDir: root } });
  assert.equal(conv.messages.length, 200);
  assert.equal(conv.total, 250);
  assert.equal(conv.truncated, true);
  assert.equal(conv.messages.at(-1).text, 'message 249');
});

test('listSessions with a missing projects folder is empty', async () => {
  assert.deepEqual(await listSessions({ id: 'x', path: '/D/x', embedded: [] }, { sessions: { projectsDir: '/nonexistent-xyz' } }), []);
});
