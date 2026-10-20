import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BUILTIN, FOCUS, KINDS, createDialogues, sourcesFor, validateLines } from '../server/dialogues.js';

const office = { name: 'Emrecan CV', floor: 'Kişisel Gelişim', agents: [{ name: 'cv-tailoring-deep', mission: 'CV uyarlar' }], recent: ['CV atölyesi'] };
const tmp = () => mkdtempSync(join(tmpdir(), 'desk-dlg-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('validateLines keeps short safe lines of a known kind, drops links, markdown, long text, duplicates and one-sided visits', () => {
  const lines = validateLines([
    { kind: 'coffee', text: 'Bir kahve iyi gider.' },
    { kind: 'coffee', text: 'bir kahve iyi gider!' }, // duplicate
    { kind: 'news', text: 'Bak: https://x.example' },
    { kind: 'news', text: 'mail@x.com yazdı' },
    { kind: 'window', text: 'x'.repeat(200) },
    { kind: 'nope', text: 'bilinmeyen tür' },
    { kind: 'visit', text: '{other}, selam!' }, // no reply
    { kind: 'visit', text: '{other}, kahve?', reply: 'Olur {name}.' },
    { kind: 'desk', text: '**kalın** yazı' },
  ]);
  assert.deepEqual(lines.map((l) => l.text), ['Bir kahve iyi gider.', '{other}, kahve?']);
  assert.ok(KINDS.every((k) => BUILTIN.some((l) => l.kind === k)), 'built-in lines cover every kind');
});

test('pool: built-in lines at once, one background refresh when stale, cached and reused afterwards (no model call per line)', async () => {
  let calls = 0;
  const dlg = createDialogues({ config: () => ({ dialogues: { batchesPerRefresh: 1 } }), dataDir: tmp(), run: async (_s, input, _schema, o) => { calls++; assert.equal(o.model, 'latest-flash'); assert.match(input, /Emrecan CV/); assert.doesNotMatch(input, /prompt|transcript/i); return { lines: [{ kind: 'coffee', text: 'Model kahvesi.' }] }; } });
  const first = dlg.get('cv', office);
  assert.equal(first.source, 'builtin');
  assert.equal(first.refreshing, true);
  assert.ok(first.lines.length >= BUILTIN.length);
  await sleep(30);
  const second = dlg.get('cv', office);
  assert.equal(second.source, 'antigravity');
  assert.equal(second.lines[0].text, 'Model kahvesi.');
  for (let i = 0; i < 50; i++) dlg.get('cv', office); // reads are free
  assert.equal(calls, 1);
});

test('pool: refill is capped per day, can be disabled, survives CLI failures and is persisted', async () => {
  const dir = tmp();
  let t = Date.parse('2026-10-20T10:00:00Z');
  let calls = 0;
  const cfg = { dialogues: {batchesPerRefresh:1,  maxCallsPerDay: 2, refreshHours: 1 } };
  const dlg = createDialogues({ dataDir: dir, config: () => cfg, now: () => t, run: async () => { calls++; return { lines: [{ kind: 'desk', text: `Satır ${calls}.` }] }; } });
  for (let i = 0; i < 4; i++) { dlg.get('a', office); await sleep(20); t += 2 * 3_600_000; }
  assert.equal(calls, 2, 'daily budget');
  t += 24 * 3_600_000; // next day: budget resets
  dlg.get('a', office); await sleep(20);
  assert.equal(calls, 3);
  // persisted: a new instance reads the cache without calling the model
  const again = createDialogues({ dataDir: dir, config: () => ({ dialogues: {batchesPerRefresh:1,  enabled: false } }), now: () => t, run: async () => { throw new Error('must not run'); } });
  assert.ok(again.get('a', office).lines.some((l) => /Satır/.test(l.text)));
  // failures fall back to the built-in lines
  const broken = createDialogues({ config: () => ({ dialogues: { batchesPerRefresh: 1 } }), dataDir: tmp(), run: async () => { throw new Error('boom'); } });
  broken.get('b', office); await sleep(20);
  assert.equal(broken.get('b', office).source, 'builtin');
  assert.ok(broken.status().usage.calls >= 1);
});

test('failed refill backs off; persisted usage survives restart and prevents exceeding the daily cap', async () => {
  const dir = tmp(); let calls = 0;
  const config = () => ({ dialogues: {batchesPerRefresh:1,  maxCallsPerDay: 2 } });
  const run = async () => { calls++; throw new Error('unavailable'); };
  const d = createDialogues({ dataDir: dir, config, run });
  await d.refresh('x', office);
  for (let i = 0; i < 10; i++) d.get('x', office);
  assert.equal(calls, 1);
  const next = createDialogues({ dataDir: dir, config, run });
  await next.refresh('y', office);
  await next.refresh('z', office);
  assert.equal(calls, 2);
});

test('source-bound lines inherit trusted metadata, expire, and never accept invented source ids', async () => {
  let clock=Date.parse('2026-10-20T10:00:00Z');
  const source={id:'n1',kind:'news',publisher:'BBC',url:'https://www.bbc.com/news/example',publishedAt:clock,expiresAt:clock+1000};
  const d=createDialogues({ config: () => ({ dialogues: { batchesPerRefresh: 1 } }),dataDir:tmp(),now:()=>clock,briefing:async()=>({sources:[source]}),run:async()=>({lines:[{kind:'news',text:'Kaynağı birlikte inceleyelim.',sourceId:'n1'},{kind:'news',text:'Uydurulmuş haber.',sourceId:'missing'}]})});
  await d.refresh('a',office);
  assert.equal(d.get('a').lines.find(l=>l.source)?.source.url,source.url);
  assert.ok(!d.get('a').lines.some(l=>l.text==='Uydurulmuş haber.'));
  clock+=2000;assert.ok(!d.get('a').lines.some(l=>l.source));
});
test('quota and token guards stop refills without trying to spend to the limit', async () => {
  let calls=0;
  const d=createDialogues({dataDir:tmp(),config:()=>({dialogues:{batchesPerRefresh:1,maxQuotaPointsPerDay:1}}),run:async()=>{calls++;return {lines:[{kind:'desk',text:'Kısa bir fikir.'}],quota:{points:1,after:{remaining:0.8}}};}});
  await d.refresh('a',office);await d.refresh('b',office);assert.equal(calls,1);
});

test('an office named usage cannot overwrite persistent budget metadata', async () => {
  const dataDir=tmp(),config=()=>({dialogues:{batchesPerRefresh:1,maxCallsPerDay:1}}),run=async()=>({lines:[{kind:'desk',text:'Küçük bir fikir.'}]});
  await createDialogues({dataDir,config,run}).refresh('usage',office);
  const restarted=createDialogues({dataDir,config,run});
  assert.equal(await restarted.refresh('other',office),false);
  assert.equal(restarted.status().usage.calls,1);
});

test('different scopes serialize model refills and recheck the daily budget before each call', async () => {
  let active=0,maxActive=0,calls=0;
  const d=createDialogues({dataDir:tmp(),config:()=>({dialogues:{batchesPerRefresh:1,maxCallsPerDay:1}}),run:async()=>{calls++;active++;maxActive=Math.max(maxActive,active);await sleep(10);active--;return {lines:[{kind:'desk',text:'Yeni bir fikir.'}]};}});
  const [first,second]=await Promise.all([d.refresh('a',office),d.refresh('floor:growth',office)]);
  assert.equal(first,true);assert.equal(second,false);assert.equal(calls,1);assert.equal(maxActive,1);
});

 test('clearing location removes unloaded caches and rejects weather from an in-flight refill', async () => {
  const dataDir = tmp(), source = { id: 'weather:1', kind: 'weather', url: 'https://open-meteo.com/', expiresAt: Date.now()+60000 };
  let release;
  const run = async () => ({ lines: [{ kind: 'window', text: 'Hava bugün serin.', sourceId: source.id }, { kind: 'desk', text: 'Bu düzen okunaklı.' }] });
  const first = createDialogues({ config: () => ({ dialogues: { batchesPerRefresh: 1 } }), dataDir, run, briefing: async () => ({sources:[source]}) });
  await first.refresh('old', office);
  const next = createDialogues({ config: () => ({ dialogues: { batchesPerRefresh: 1 } }), dataDir, run: async () => { await new Promise(r => {release=r;}); return run(); }, briefing: async () => ({sources:[source]}) });
  const pending = next.refresh('new',office); while (!release) await sleep(1);
  next.invalidate(); release(); await pending;
  assert.ok(next.get('new').lines.every(l=>l.source?.kind!=='weather'));
  assert.ok(next.get('old').lines.every(l=>l.source?.kind!=='weather'));
 });

test('one refill makes several calls with different focus (life, news, role talk) and a pool far larger than one batch; Gemini medium is requested', async () => {
  const seen = []; let n = 0;
  const d = createDialogues({ dataDir: tmp(), config: () => ({ dialogues: { batchesPerRefresh: 5 } }), run: async (_s, input, _schema, o) => { seen.push({ input, effort: o.effort }); n++; return { lines: [{ kind: 'desk', text: `Fikir ${n} a.` }, { kind: 'desk', text: `Fikir ${n} b.` }] }; } });
  await d.refresh('a', office);
  assert.equal(seen.length, 5);
  assert.ok(seen.every((c) => c.effort === 'medium'));
  assert.match(seen[0].input, /gündelik hayat/);
  assert.match(seen[1].input, /YAPAY ZEKÂ HABERLERİ/);
  assert.match(seen[2].input, /SİYASET/);
  assert.match(seen[3].input, /Elon Musk/);
  assert.match(seen[4].input, /mesleki merak/);
  assert.equal(d.status().usage.calls, 5);
  assert.ok(d.get('a').lines.filter((l) => /^Fikir/.test(l.text)).length === 10);
});

test('warm keeps every scope fresh: stale scopes are refilled one after another, fresh or disabled ones are left alone', async () => {
  let t = Date.parse('2026-10-20T06:00:00Z'); const asked = [];
  const mk = (cfg = {}) => createDialogues({ dataDir: tmp(), now: () => t, config: () => ({ dialogues: { batchesPerRefresh: 1, refreshHours: 8, ...cfg } }), run: async (_s, input) => { asked.push(input.match(/Ofis: ([^\n(]+)/)?.[1].trim()); return { lines: [{ kind: 'desk', text: `Satır ${asked.length}.` }] }; } });
  const d = mk();
  const scopes = [{ id: 'a', ctx: { ...office, name: 'A' } }, { id: 'floor:x', ctx: { ...office, name: 'X' } }];
  assert.equal(d.warm(scopes), 2);
  await sleep(80);
  assert.deepEqual(asked, ['A', 'X']);
  assert.equal(d.warm(scopes), 0, 'fresh pools are not refilled');
  t += 9 * 3_600_000; // eight hours later: three refills a day
  assert.equal(d.warm(scopes), 2);
  assert.equal(mk({ enabled: false }).warm(scopes), 0);
  assert.equal(mk({ warmAll: false }).warm(scopes), 0);
  await sleep(80);
});

test('news batches only get fitting sources: AI, politics and tech each see their own headlines; the life batch sees none', () => {
  const src = [
    { id: '1', title: 'OpenAI releases GPT-6', topic: 'ai' },
    { id: '2', title: 'AfD leads new poll', topic: 'germany' },
    { id: '3', title: 'Erdogan speaks on economy', query: 'Erdogan Turkey politics' },
    { id: '4', title: 'Musk shows flying car prototype', query: 'Elon Musk flying car' },
    { id: '5', title: 'Chip maker earnings', topic: 'technology' },
  ];
  const ids = (key) => sourcesFor(key, src).map((s) => s.id);
  assert.deepEqual(ids('ai'), ['1']);
  assert.deepEqual(ids('politics'), ['2', '3']);
  assert.deepEqual(ids('tech'), ['4', '5']);
  assert.deepEqual(ids('life'), []);
  assert.equal(ids('roles').length, 5);
  assert.deepEqual(FOCUS.map((f) => f.key), ['life', 'ai', 'politics', 'tech', 'roles']);
});

test('English mirrors: kept when valid, dropped when unsafe or one-sided, and legacy lines are translated through the shared queue', async () => {
  const lines = validateLines([
    { kind: 'desk', text: 'Yarın için not alayım.', textEn: 'Let me jot a note for tomorrow.' },
    { kind: 'desk', text: 'Bir not daha alayım.', textEn: 'See https://x.example' }, // unsafe mirror: the Turkish line stays
    { kind: 'visit', text: 'Kahve?', reply: 'Olur.', followUp: 'Ne içiyoruz?', answer: 'Filtre.', textEn: 'Coffee?', replyEn: 'Sure.', followUpEn: 'What are we having?', answerEn: 'Filter.' },
    { kind: 'visit', text: 'Su?', reply: 'Evet.', textEn: 'Water?' }, // visit mirror without a reply is dropped
  ]);
  assert.deepEqual(lines.map((l) => l.en?.text ?? null), ['Let me jot a note for tomorrow.', null, 'Coffee?', null]);
  assert.equal(lines[2].en.answer, 'Filter.');
  assert.ok(BUILTIN.length > 0);

  const dataDir = tmp();
  let calls = 0;
  const dlg = createDialogues({
    dataDir,
    config: () => ({ dialogues: { batchesPerRefresh: 1 } }),
    run: async (system, input) => { calls++; assert.match(system, /translate/i); const items = JSON.parse(input); return { items: items.map(({ i, text, reply }) => ({ i, text: `EN ${text}`, ...(reply ? { reply: `EN ${reply}` } : {}) })) }; },
  });
  // seed a legacy pool through the public API: refresh() is not needed, translate() works on what load() finds on disk
  const { writeFileSync, mkdirSync } = await import('node:fs');
  mkdirSync(join(dataDir, 'dialogues'), { recursive: true });
  writeFileSync(join(dataDir, 'dialogues', 'lab.json'), JSON.stringify({ version: 11, updatedAt: Date.now(), lines: [{ kind: 'desk', text: 'Masam dağınık.' }, { kind: 'visit', text: 'Kahve?', reply: 'Olur.' }] }));
  assert.equal(dlg.status().pools.length, 0);
  assert.equal(await dlg.translate('lab'), true);
  const pool = dlg.get('lab', null);
  const desk = pool.lines.find((l) => l.text === 'Masam dağınık.');
  assert.equal(desk.en.text, 'EN Masam dağınık.');
  assert.equal(pool.lines.find((l) => l.kind === 'visit' && l.text === 'Kahve?').en.reply, 'EN Olur.');
  assert.equal(await dlg.translate('lab'), false, 'nothing left to translate: no further model call');
  assert.equal(calls, 1);
});
