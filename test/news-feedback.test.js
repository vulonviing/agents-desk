import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createNewsFeedback } from '../server/news-feedback.js';
import { structureNews } from '../server/news-taxonomy.js';
import { createDialogueCreator } from '../server/dialogue-creator.js';
import { createDialogues } from '../server/dialogues.js';
import { createDeskServer } from '../server/server.js';

const scratch = resolve('.playwright-mcp/news-test-data'); mkdirSync(scratch, { recursive: true });
const tmp = () => mkdtempSync(join(scratch, 'case-'));
const source = (over = {}) => ({ id: 'ai:known:1', kind: 'news', topic: 'ai', publisher: 'Example News', title: 'New autonomous AI agents', url: 'https://news.example.com/agents?utm_source=feed', publishedAt: Date.now(), expiresAt: Date.now() + 3600000, ...over });

test('article identity survives feed/search URLs and restart; a vote is replaceable, reversible and metadata-only', () => {
  const dataDir = tmp(), feedback = createNewsFeedback({ dataDir });
  feedback.register([source(), source({ id: 'search:known', url: 'https://news.example.com/agents', query: 'autonomous agents', turns: 'PRIVATE TRANSCRIPT' })]);
  const first = feedback.set({ sourceId: 'search:known', value: 'like', reason: 'topic' });
  assert.equal(feedback.get('ai:known:1').article.articleId, first.article.articleId);
  assert.equal(first.feedback.value, 'like');
  assert.equal(feedback.set({ sourceId: 'search:known', value: 'like' }).revision, first.revision);
  const restarted = createNewsFeedback({ dataDir });
  assert.equal(restarted.get('ai:known:1').feedback.value, 'like');
  assert.ok(restarted.editorial().tags['ai-agents'] > 0);
  const raw = readFileSync(join(dataDir, 'news/preferences.json'), 'utf8');
  assert.doesNotMatch(raw, /PRIVATE TRANSCRIPT|turns|role|utm_source/);
  restarted.set({ sourceId: 'search:known', value: 'dislike', reason: 'style' });
  assert.deepEqual(restarted.editorial().categories, {});
  assert.equal(restarted.accepts(structureNews(source())), true);
  restarted.set({ sourceId: 'search:known', value: null });
  assert.equal(createNewsFeedback({ dataDir }).get('search:known').feedback, null);
  assert.throws(() => restarted.set({ sourceId: 'invented', value: 'like' }), /bulunamadı/);
  assert.throws(() => restarted.set({ sourceId: 'search:known', value: 'maybe' }), /Geçersiz/);
  assert.equal(structureNews(source({ url: 'http://127.0.0.1/private' })), null);
});

test('new feedback revises the cached editorial plan on the next search without model calls per vote', async () => {
  const dataDir = tmp(), feedback = createNewsFeedback({ dataDir }); feedback.register([source()]);
  let calls = 0;
  const creator = createDialogueCreator({ dataDir, feedback: feedback.editorial });
  const office = { name: 'Office', agents: [{ name: 'research', mission: 'Public technology research' }] };
  const call = async (_prompt, input) => { calls++; const p = JSON.parse(input).preferences;
    if (calls === 2) assert.equal(p.recent[0].value, 'dislike');
    return { topics: ['technology'], queries: [{ role: 'genel', query: 'coding tools releases', topic: 'ai', tags: ['coding-tools'] }] };
  };
  const plan = await creator.plan('floor:growth', office, call);
  assert.deepEqual(plan.queries[0].tags, ['coding-tools']); assert.ok(plan.topics.includes('ai'));
  await creator.plan('floor:growth', office, call); assert.equal(calls, 1);
  feedback.set({ sourceId: 'ai:known:1', value: 'dislike', reason: 'topic' }); assert.equal(calls, 1);
  await creator.plan('floor:growth', office, call); assert.equal(calls, 2);
});

test('a disliked article disappears from an existing dialogue pool without regenerating it', async () => {
  const dataDir = tmp(), feedback = createNewsFeedback({ dataDir }); let calls = 0;
  const dialogues = createDialogues({ dataDir, preferences: feedback, config: () => ({ dialogues: { batchesPerRefresh: 1 } }), briefing: async () => ({ sources: [source()] }), run: async () => { calls++; return { lines: [{ kind: 'news', text: 'Otonom araçların sınırlarını konuşalım.', sourceId: 'ai:known:1' }] }; } });
  const office = { name: 'Office', floor: 'Growth', agents: [], recent: [] };
  await dialogues.refresh('office', office);
  assert.ok(dialogues.get('office').lines.some(l => l.source));
  feedback.set({ sourceId: 'ai:known:1', value: 'dislike', reason: 'topic' });
  assert.ok(!dialogues.get('office').lines.some(l => l.source)); assert.equal(calls, 1);
});

test('news feedback API validates known articles and origins, and persists the rating', async t => {
  const dataDir = tmp(), known = createNewsFeedback({ dataDir }); known.register([source()]);
  const server = createDeskServer({ dataDir, projects: () => ({ generatedAt: 'test', warnings: [], floors: [] }), loadConfig: () => ({ sessions: { observeExternal: false, projectsDir: false, codexSessionsDir: false }, dialogues: { enabled: false } }) });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}/api/news/feedback`;
  const send = (data, origin) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) }, body: JSON.stringify(data) });
  assert.equal((await send({ sourceId: 'ai:known:1', value: 'like' }, 'https://evil.example')).status, 403);
  assert.equal((await send({ sourceId: 'unknown', value: 'like' })).status, 404);
  assert.equal((await send({ sourceId: 'ai:known:1', value: 'bad' })).status, 400);
  const response = await send({ sourceId: 'ai:known:1', value: 'like', reason: 'source', turns: ['PRIVATE CHAT'] });
  assert.equal(response.status, 200); assert.equal((await response.json()).feedback.reason, 'source');
  assert.equal((await (await fetch(url + '?sourceId=ai%3Aknown%3A1')).json()).feedback.value, 'like');
  assert.doesNotMatch(readFileSync(join(dataDir, 'news/preferences.json'), 'utf8'), /PRIVATE CHAT|turns/);
});

test('topic likes affect subtopic ranking; source and style votes remain distinct', () => {
  const feedback = createNewsFeedback({ dataDir: tmp() });
  const agents = source(), release = source({ id: 'release', title: 'New GPT model release', url: 'https://other.example.com/model', publisher: 'Other News' });
  feedback.register([agents, release]);
  feedback.set({ sourceId: agents.id, value: 'like', reason: 'topic' });
  assert.ok(feedback.score(agents) > feedback.score(release));
  feedback.set({ sourceId: agents.id, value: 'like', reason: 'source' });
  assert.deepEqual(feedback.editorial().categories, {});
  assert.ok(feedback.score(agents) > feedback.score(release));
  feedback.set({ sourceId: agents.id, value: 'dislike', reason: 'style' });
  assert.equal(feedback.score(agents), feedback.score(release));
});

test('a failed atomic save leaves the previous in-memory rating intact', async () => {
  const { renameSync, rmSync } = await import('node:fs');
  const dataDir = tmp(), feedback = createNewsFeedback({ dataDir }); feedback.register([source()]);
  const file = join(dataDir, 'news/preferences.json');
  renameSync(file, file + '.backup'); mkdirSync(file);
  try {
    assert.throws(() => feedback.set({ sourceId: 'ai:known:1', value: 'like' }), error => error.status === 503);
    assert.equal(feedback.get('ai:known:1').feedback, null);
  } finally { rmSync(file, { recursive: true }); renameSync(file + '.backup', file); }
});
