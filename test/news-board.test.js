import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createNewsBoard } from '../server/news-board.js';
import { createNewsFeedback } from '../server/news-feedback.js';
import { createDialogues } from '../server/dialogues.js';

const source = now => ({id:'feed:one',kind:'news',title:'AI agents get a new tool',description:'A public feed description.',topic:'ai',publisher:'Example',url:'https://example.com/agents',publishedAt:now-1000,expiresAt:now+6*3600000});
const temp = t => { const dir=(mkdirSync('.playwright-mcp',{recursive:true}),mkdtempSync(join('.playwright-mcp','desk-board-')));t.after(()=>rmSync(dir,{recursive:true,force:true}));return dir; };
test('board explains a canonical article once, persists it, and applies feedback without a model call',async t=>{
  const dir=temp(t);let now=Date.now(),calls=0;
  const preferences=createNewsFeedback({dataDir:dir,now:()=>now});
  const opts={dataDir:dir,now:()=>now,preferences,collect:async()=>({sources:[source(now),{...source(now),id:'search:alias',url:source(now).url+'?utm_source=rss'}]}),editorial:async job=>job(async(_s,input)=>{calls++;const data=JSON.parse(input);return {articles:data.articles.map(a=>({articleId:a.articleId,explanation:'Bu haber yeni bir ajan aracını konu alıyor.',explanationEn:'This story is about a new agent tool.',titleTr:'Yeni ajan aracı',titleEn:'New agent tool'}))};})};
  const board=createNewsBoard(opts);await board.refresh();assert.equal(calls,1);assert.equal(board.get().articles.length,1);
  const article=board.get().articles[0];assert.equal(article.explanationStatus,'ready');assert.deepEqual([article.explanationEn,article.titleTr,article.titleEn],['This story is about a new agent tool.','Yeni ajan aracı','New agent tool']);
  for(let i=0;i<5;i++)board.read();assert.equal(calls,1);
  now+=3600001;await board.refresh();assert.equal(calls,1,'same public content reuses its explanation');
  const reloaded=createNewsBoard(opts);assert.equal(reloaded.get().articles[0].explanation,article.explanation);
  preferences.set({sourceId:article.articleId,value:'dislike'});assert.equal(board.get().articles.length,0);assert.equal(calls,1);
  preferences.set({sourceId:article.articleId,value:null});assert.equal(board.get().articles.length,1);
  assert.ok(!readFileSync(join(dir,'news/board.json'),'utf8').includes('participants'));
});
test('quota failure preserves published headlines, rejects unknown explanation IDs and expires old facts',async t=>{
  const dir=temp(t);let now=Date.now(),fail=true;
  const board=createNewsBoard({dataDir:dir,now:()=>now,collect:async()=>({sources:[source(now)]}),editorial:async job=>job(async()=>{if(fail)throw new Error('daily-budget');return {articles:[{articleId:'unknown',explanation:'Never publish this.'}]};})});
  await board.refresh();assert.equal(board.get().articles.length,1);assert.equal(board.get().articles[0].explanation,null);assert.ok(board.get().error);
  fail=false;await board.refresh(true);assert.equal(board.get().articles[0].explanation,null);
  now+=7*3600000;assert.equal(board.get().articles.length,0);
});
test('news editorial serializes calls and persists informational usage without daily caps',async t=>{
  const dir=temp(t);let active=0,max=0,calls=0;
  const dialogues=createDialogues({dataDir:dir,config:()=>({dialogues:{maxCallsPerDay:2}}),run:async()=>{active++;max=Math.max(max,active);calls++;await new Promise(r=>setTimeout(r,15));active--;return {articles:[]};}});
  await Promise.all([dialogues.editorial(call=>call('a','b',{})),dialogues.editorial(call=>call('a','b',{}))]);
  assert.equal(max,1);assert.equal(calls,2);assert.equal(dialogues.status().usage.calls,2);
  await dialogues.editorial(call=>call('a','b',{}));assert.equal(calls,3);
  const restored=createDialogues({dataDir:dir,config:()=>({dialogues:{maxCallsPerDay:2}}),run:async()=>({articles:[]})});
  assert.equal(restored.status().usage.calls,3);
  await restored.editorial(call=>call('a','b',{}));
  assert.equal(restored.status().usage.calls,4);
});
test('a failed preparation backs off instead of creating a GET/SSE refresh loop',async t=>{
  const dir=temp(t);let attempts=0;
  const board=createNewsBoard({dataDir:dir,collect:async()=>{throw new Error('must not reach');},editorial:async()=>{attempts++;throw new Error('daily-budget');}});
  await board.refresh();for(let i=0;i<10;i++)board.read();await new Promise(r=>setTimeout(r,0));assert.equal(attempts,1);assert.ok(board.get().error);
});


test('LED editorial constrains both languages and rejects overflow without replacing the live edition', async t => {
  const dir = temp(t), now = Date.now();
  let oversized = false, labeled = false;
  const board = createNewsBoard({ dataDir: dir, now: () => now, hold: true,
    collect: async () => ({ sources: [source(now)] }),
    details: async articles => articles.map(a => ({ url: a.url, text: 'Input per million tokens: Haiku $0.10; Argon $2.00.' })),
    editorial: async job => job(async (prompt, input, schema) => {
      assert.match(prompt, /tek paragraf/u);
      assert.match(prompt, /etiketleri.*KULLANMA/u);
      assert.match(prompt, /sonuç uydurma/u);
      assert.match(prompt, /hangi model en pahalı, hangi model en ucuz/u);
      assert.match(prompt, /Genel bilgiden fiyat ya da model sıralaması tahmin etme/u);
      assert.match(JSON.parse(input).articles[0].articleText, /Haiku \$0\.10/);
      const fields = schema.properties.articles.items.properties;
      for (const field of ['titleTr', 'titleEn']) assert.equal(fields[field].maxLength, 72);
      for (const field of ['explanation', 'explanationEn']) assert.equal(fields[field].maxLength, 220);
      return { articles: JSON.parse(input).articles.map(a => ({ articleId: a.articleId,
        titleTr: 'Yeni ajan aracı', titleEn: oversized ? 'x'.repeat(73) : 'New agent tool',
        explanation: labeled ? 'Problem: Access. Method: A tool. Result: Unreported.' : 'Yeni araç ajanların erişimini kolaylaştırıyor. Ölçülmüş test sonucu henüz paylaşılmadı.',
        explanationEn: 'The new tool makes agent access easier. No measured benchmark result has been reported.',
      })) };
    }),
  });
  await board.refresh(true); assert.equal(board.hasStaged(), true); board.publish();
  const published = board.get();
  oversized = true;
  await board.refresh(true);
  assert.equal(board.hasStaged(), false);
  assert.equal(board.failure().code, 'news-incomplete');
  assert.deepEqual(board.get().articles, published.articles);
  oversized = false; labeled = true;
  await board.refresh(true);
  assert.equal(board.hasStaged(), false, 'labeled model output is rejected');
  assert.deepEqual(board.get().articles, published.articles);
});
