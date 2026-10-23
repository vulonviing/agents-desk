import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { selectNews, rankEvent, NEWS_POLICY } from '../server/news-selection.js';
import { createNewsFeedback } from '../server/news-feedback.js';
import { createNewsBoard } from '../server/news-board.js';
import { structureNews } from '../server/news-taxonomy.js';
const now = Date.now();
const source = (key, bucket = 'ai', host = 'example.com', rank = 1) => structureNews({ id: key + host, kind: 'news', topic: bucket, title: key, url: `https://${host}/${key}`, publisher: host, publishedAt: now - 1000, expiresAt: now + 6 * 3600000, discovery: [{ kind: 'search', rank }] });
const event = (key, bucket = 'ai', articles = [source(key, bucket)]) => ({ key, bucket, articles, major: false, consumedId: '' });
const fixture = () => [...Array.from({ length: 14 }, (_, i) => event(`model-${i}`)), ...['germany', 'turkey'].flatMap(b => [event(`${b}-first`, b), event(`${b}-second`, b), event(`${b}-third`, b)])];
const run = (events, preferences, rawTransform) => selectNews({ sources: events.flatMap(e => e.articles), preferences, now, call: async (prompt, input) => {
  assert.match(prompt, /across languages/); assert.ok(JSON.parse(input).consumed);
  const raw = { events: events.map(({ articles, ...e }) => ({ ...e, articleIds: articles.map(a => a.articleId) })) };
  return rawTransform ? rawTransform(raw) : raw;
} });
const temp = t => { mkdirSync('.qa', { recursive: true }); const dir = mkdtempSync(join('.qa', 'selection-')); t.after(() => rmSync(dir, { recursive: true, force: true })); return dir; };

test('15 distinct events satisfy 2 German politics, 2 Turkish politics and 11 AI, in popularity order', async () => {
  const events = fixture(); events[8].articles.push(source('same-model-other-site', 'ai', 'other.com'));
  const selected = await run(events);
  assert.equal(selected.length, 15);
  assert.deepEqual(Object.fromEntries(['germany', 'turkey', 'ai'].map(b => [b, selected.filter(a => a.category === b).length])), { germany: 2, turkey: 2, ai: 11 });
  assert.equal(new Set(selected.map(a => a.eventId)).size, 15);
  assert.equal(selected[0].eventKey, 'model-8');
  for (let i = 1; i < selected.length; i++) assert.ok(selected[i - 1].popularity.score >= selected[i].popularity.score);
});

test('a liked event is excluded across publishers and languages after restart; a new model version remains eligible', async t => {
  const dir = temp(t), prefs = createNewsFeedback({ dataDir: dir });
  const liked = source('Gemini-5-release');
  prefs.register([liked]); prefs.set({ sourceId: liked.articleId, value: 'like' });
  const restored = createNewsFeedback({ dataDir: dir });
  const events = fixture();
  const repeat = event('gemini-five-launch', 'ai', [source('Yeni-Gemini-modeli', 'ai', 'turkish.com'), source('Google-veroeffentlicht-Gemini', 'ai', 'german.de')]);
  repeat.consumedId = liked.articleId; repeat.major = true;
  const nextVersion = event('gemini-six-launch', 'ai', [source('Gemini-6', 'ai', 'six.com'), source('Gemini-6-news', 'ai', 'second.com')]);
  const selected = await run([repeat, nextVersion, ...events], restored);
  assert.ok(!selected.some(a => a.eventKey === repeat.key));
  assert.ok(selected.some(a => a.eventKey === nextVersion.key));
  assert.equal(restored.consumed().length, 1);
  restored.set({ sourceId: liked.articleId, value: null });
  assert.equal(restored.consumed().length, 0);
});

test('negative taste is excluded; a world-scale event may override it once, but likes and explicit dislikes never yield', async () => {
  const base = fixture();
  const major = key => ({ ...event(key, 'ai', ['reuters.com', 'apnews.com', 'theguardian.com', 'bbc.com', 'dw.com'].map(host => source(key, 'ai', host))), major: true });
  const disliked = major('rejected-event'), consumed = major('read-event'), first = major('world-event-one'), second = major('world-event-two');
  consumed.consumedId = consumed.articles[0].articleId;
  const preferences = { score: a => /^world|routine/.test(a.title) ? -1 : 0,
    accepts: a => a.title !== disliked.key, consumed: () => [{ articleId: consumed.consumedId }] };
  const selected = await run([event('routine-event'), first, second, disliked, consumed, ...base], preferences);
  assert.equal(selected.filter(a => a.preferenceOverride).length, 1);
  assert.ok(!selected.some(a => [disliked.key, consumed.key, 'routine-event'].includes(a.eventKey)));
  const fakeMajor = major('world-undercovered'); fakeMajor.articles = fakeMajor.articles.slice(0, 4);
  assert.ok(!(await run([fakeMajor, ...base], preferences)).some(a => a.eventKey === fakeMajor.key));
});

test('malformed or incomplete grouping fails closed; insufficient quotas do not silently substitute other topics', async () => {
  await assert.rejects(run(fixture(), null, raw => ({ events: raw.events.slice(1) })), /news-selection-invalid/);
  await assert.rejects(run(fixture(), null, raw => ({ events: [...raw.events, raw.events[0]] })), /news-selection-invalid/);
  await assert.rejects(run(fixture().filter(e => e.bucket !== 'turkey')), /news-insufficient-coverage/);
});

test('popularity counts independent publishers, not duplicate articles; community votes are distinguished from readership', () => {
  const single = source('one', 'ai', 'bbc.com'), alias = source('two', 'ai', 'www.bbc.co.uk');
  assert.equal(rankEvent([single, alias], now).publishers, 1);
  assert.equal(rankEvent([source('one', 'turkey', 'aa.com.tr'), source('two', 'turkey', 'hurriyet.com.tr')], now).publishers, 2);
  assert.equal(rankEvent([source('one', 'ai', 'blog.google'), source('two', 'ai', 'deepmind.google')], now).publishers, 1);
  const community = { ...single, discovery: [{ kind: 'community-ranking', rank: 2, votes: 300 }] };
  const rank = rankEvent([community], now);
  assert.equal(rank.communityVotes, 300); assert.equal(rank.communityRank, 2);
  assert.ok(!('views' in rank));
});

test('liking the current board keeps it visible; the next edition replaces that event and persists fixed selection', async t => {
  const dir = temp(t), prefs = createNewsFeedback({ dataDir: dir });
  let events = fixture(), fail = false;
  const options = { dataDir: dir, hold: true, preferences: prefs, now: () => now, selection: selectNews,
    collect: async () => ({ sources: events.flatMap(e => e.articles) }),
    editorial: job => job(async (_prompt, input, schema) => {
      if (schema.properties.events) {
        const consumed = JSON.parse(input).consumed;
        return { events: events.map(({ articles, ...e }) => ({ ...e, consumedId: consumed.find(c => c.title === articles[0].title)?.articleId ?? '', articleIds: articles.map(a => a.articleId) })) };
      }
      return { articles: JSON.parse(input).articles.map(a => ({ articleId: a.articleId, titleTr: 'Somut haber', titleEn: 'Concrete news', explanation: 'Yeni araç yayımlandı. Sonuçlar paylaşıldı.', explanationEn: fail ? 'x'.repeat(221) : 'The new tool launched. Results were reported.' })) };
    }) };
  const board = createNewsBoard(options); await board.refresh(true); assert.equal(board.hasStaged(), true); assert.equal(board.staged().selectionPolicy, NEWS_POLICY); board.publish();
  const liked = board.get().articles.find(a => a.category === 'ai'); prefs.set({ sourceId: liked.articleId, value: 'like' });
  assert.equal(board.get().articles.length, 15); assert.ok(board.get().articles.some(a => a.articleId === liked.articleId));
  await board.refresh(true); assert.equal(board.hasStaged(), true); board.publish();
  assert.equal(board.get().articles.length, 15); assert.ok(!board.get().articles.some(a => a.eventId === liked.eventId));
  assert.deepEqual(createNewsBoard(options).get().articles, board.get().articles);
  const old = board.get().articles;
  events = events.filter(e => e.bucket !== 'turkey'); await board.refresh(true);
  assert.equal(board.failure().code, 'news-insufficient-coverage'); assert.equal(board.hasStaged(), false); assert.deepEqual(board.get().articles, old);
  events = fixture(); fail = true; await board.refresh(true); assert.equal(board.hasStaged(), false); assert.deepEqual(board.get().articles, old);
});

test('the single major-event exception is reserved for a category that needs it to complete its quota', async () => {
  const events = fixture().filter(e => e.bucket !== 'germany');
  const major = (key, bucket) => ({ ...event(key, bucket, ['reuters.com', 'apnews.com', 'theguardian.com', 'bbc.com', 'dw.com'].map(h => source(key, bucket, h))), major: true });
  const ai = major('major-ai', 'ai'); ai.articles.push(source('major-ai-sixth', 'ai', 'sixth.com'));
  const german = major('major-germany', 'germany');
  const selected = await run([ai, german, event('normal-germany', 'germany'), ...events], { score: a => a.title.startsWith('major-') ? -1 : 0 });
  assert.equal(selected.filter(a => a.preferenceOverride).length, 1);
  assert.equal(selected.find(a => a.preferenceOverride).category, 'germany');
});

test('liking an article while semantic grouping runs invalidates the draft instead of publishing stale exclusions', async t => {
  const dir = temp(t), preferences = createNewsFeedback({ dataDir: dir });
  const events = fixture(); const first = events[0].articles[0];
  const board = createNewsBoard({ dataDir: dir, hold: true, preferences, selection: selectNews,
    collect: async () => ({ sources: events.flatMap(e => e.articles) }), editorial: job => job(async (_p, _i, schema) => {
      assert.ok(schema.properties.events);
      preferences.set({ sourceId: first.articleId, value: 'like' });
      return { events: events.map(({ articles, ...e }) => ({ ...e, articleIds: articles.map(a => a.articleId) })) };
    }) });
  await board.refresh(true); assert.equal(board.hasStaged(), false); assert.equal(board.failure().code, 'news-preferences-changed');
});

test('older liked events are checked in bounded history batches rather than forgotten', async () => {
  const events = fixture(); events[0].articles.push(source('old-story-translated', 'ai', 'second.com'));
  const consumed = Array.from({ length: 210 }, (_, i) => ({ articleId: `history-${i}`, title: `Old story ${i}` }));
  let grouped = false, historical = 0;
  const selected = await selectNews({ sources: events.flatMap(e => e.articles), preferences: { consumed: () => consumed }, now,
    call: async (_p, input, schema) => {
      const data = JSON.parse(input);
      if (schema.properties.events) { assert.equal(data.consumed.length, 64); grouped = true; return { events: events.map(({ articles, ...e }) => ({ ...e, articleIds: articles.map(a => a.articleId) })) }; }
      assert.ok(grouped); assert.ok(data.consumed.length <= 128); historical++;
      return { matches: historical === 1 ? [{ eventKey: events[0].key, articleId: data.consumed[0].articleId }] : [] };
    } });
  assert.equal(historical, 2); assert.equal(selected.length, 15); assert.ok(!selected.some(a => a.eventKey === events[0].key));
});

test('short Flash references map back to canonical article IDs without accepting unknown or duplicate aliases', async () => {
  const events = fixture(), sources = events.flatMap(e => e.articles);
  const call = async (_p, input) => {
    const candidates = JSON.parse(input).candidates;
    assert.ok(candidates.every(a => /^c\d+$/.test(a.articleId)));
    return { events: events.map((e, i) => ({ key: e.key, bucket: e.bucket, major: false, consumedId: '', articleIds: [candidates[i].articleId] })) };
  };
  const selected = await selectNews({ sources, call, now });
  assert.equal(selected.length, 15); assert.ok(selected.every(a => a.articleId.startsWith('news:')));
  await assert.rejects(selectNews({ sources, now, call: async (...args) => { const result = await call(...args); result.events[0].articleIds = ['c999999']; return result; } }), /news-selection-invalid/);
});

test('format failures retry once inside selection; quota errors never retry; unrelated references remain validated', async () => {
  const events = fixture(), unrelated = source('sports-news', 'general'), sources = [...events.flatMap(e => e.articles), unrelated];
  let calls = 0;
  const request = async (_p, input, schema) => {
    calls++; if (calls === 1) throw new Error('antigravity-invalid-json');
    assert.equal(schema.properties.ignoredArticleIds.type, 'array');
    const candidates = JSON.parse(input).candidates;
    return { events: events.map((e, i) => ({ key: e.key, bucket: e.bucket, major: false, consumedId: '', articleIds: [candidates[i].articleId] })), ignoredArticleIds: [candidates.at(-1).articleId] };
  };
  assert.equal((await selectNews({ sources, call: request, now })).length, 15); assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(selectNews({ sources, now, call: async () => { calls++; throw new Error('antigravity-quota-exhausted'); } }), /quota/);
  assert.equal(calls, 1);
});

test('critical non-AI security updates may occupy technology slots without being mislabeled AI', async () => {
 const events=fixture();
 const security={...event('php-rce-fix','security',[{...source('php-rce-fix','technology','php.net'),title:'PHP critical security update fixes remote code execution'},{...source('php-rce-news','technology','second.com'),title:'PHP critical security update fixes remote code execution'}]),major:true};
 const selected=await run([security,...events]);
 const item=selected.find(a=>a.eventKey===security.key);
 assert.ok(item);assert.equal(item.category,'technology');assert.equal(item.criticalSecurity,true);
 assert.equal(selected.length,15);assert.equal(selected.filter(a=>a.category==='ai').length,10);
 const mundane={...security,key:'routine-php-update',articles:[{...source('routine-php-update','technology'),title:'PHP routine version update'}]};
 assert.ok(!(await run([mundane,...events])).some(a=>a.eventKey===mundane.key));
});
