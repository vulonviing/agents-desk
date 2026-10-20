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
test('news editorial uses the same serialized queue and persistent daily cap as dialogues',async t=>{
  const dir=temp(t);let active=0,max=0,calls=0;
  const dialogues=createDialogues({dataDir:dir,config:()=>({dialogues:{maxCallsPerDay:2}}),run:async()=>{active++;max=Math.max(max,active);calls++;await new Promise(r=>setTimeout(r,15));active--;return {articles:[]};}});
  await Promise.all([dialogues.editorial(call=>call('a','b',{})),dialogues.editorial(call=>call('a','b',{}))]);
  assert.equal(max,1);assert.equal(calls,2);assert.equal(dialogues.status().usage.calls,2);
  await assert.rejects(dialogues.editorial(call=>call('a','b',{})),/daily-budget/);assert.equal(calls,2);
  const restored=createDialogues({dataDir:dir,config:()=>({dialogues:{maxCallsPerDay:2}}),run:async()=>{throw new Error('must not run');}});
  await assert.rejects(restored.editorial(call=>call('a','b',{})),/daily-budget/);
});
test('a failed preparation backs off instead of creating a GET/SSE refresh loop',async t=>{
  const dir=temp(t);let attempts=0;
  const board=createNewsBoard({dataDir:dir,collect:async()=>{throw new Error('must not reach');},editorial:async()=>{attempts++;throw new Error('daily-budget');}});
  await board.refresh();for(let i=0;i<10;i++)board.read();await new Promise(r=>setTimeout(r,0));assert.equal(attempts,1);assert.ok(board.get().error);
});
