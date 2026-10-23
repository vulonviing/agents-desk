import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync}from'node:fs';
import {tmpdir}from'node:os';
import {join}from'node:path';
import {createUsageDetails,normalizeActivity}from'../server/usage-details.js';
const date={year:2026,month:10,day:20};
test('aggregate boundary keeps daily counts and drops private or unsupported fields',()=>{
 const claude=normalizeActivity('claude',{capturedAt:800000000,computedThrough:date,dailyBuckets:[{day:date,tokensByModel:{model:42},sessionCount:3,messageCount:9,toolCallCount:4,prompt:'private'}],modelUsage:[{modelID:'test',inputTokens:30,outputTokens:12,sessionID:'secret'}],allTimeSummary:{totalTokens:42},credential:'secret'});
 assert.equal(claude.daily[0].tokens,42);assert.equal(claude.daily[0].date,'2026-10-20');assert.equal(claude.summary.sessions,null);assert.equal(JSON.stringify(claude).includes('secret'),false);assert.equal(JSON.stringify(claude).includes('private'),false);
 assert.deepEqual(normalizeActivity('claude',{dailyBuckets:[{day:{year:2026,month:99,day:1}}]}).daily,[]);
 assert.equal(normalizeActivity('codex',{}),null);
 assert.equal(normalizeActivity('codex',{tokenActivity:{dailyBuckets:null}}).daily,null);
 assert.equal(normalizeActivity('antigravity',{}),null);
 assert.equal(normalizeActivity('claude',{dailyBuckets:[{day:date}]}).daily[0].tokens,null);
 assert.equal(normalizeActivity('claude',{dailyBuckets:[{day:date,tokensByModel:{bad:-1,ok:42}}]}).daily[0].tokens,null);
});
test('read-only detail queries tolerate missing optional tables, cache, and limit output',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'usage-detail-')),store=join(dir,'History.store');writeFileSync(store,'');let calls=0,now=100;
 try{
 const reader=createUsageDetails({store,now:()=>now,run:async(_,sql)=>{calls++;assert.match(sql,/LIMIT/);assert.doesNotMatch(sql,/INSERT|UPDATE|DELETE/);if(sql.includes('LATESTCLAUDE'))throw Error('older schema');if(sql.includes('LATESTCODEX'))return JSON.stringify([{provider:'codex',payload:JSON.stringify({tokenActivity:{capturedAt:800000000,summary:{lifetimeTokens:50},dailyBuckets:[{day:date,tokens:50}]}})}]);if(sql.includes('ZLATESTUSAGE'))return JSON.stringify([{provider:'antigravity',at:800000000,payload:JSON.stringify({groupedWindows:['gemini4Argon',['sevenDay',{available:{_0:{usedPercent:27}}}]]})}]);return '[]';}});
 const d=await reader.read();assert.equal(d.available,true);assert.equal(d.providers.claude.activity,null);assert.equal(d.providers.codex.activity.daily[0].tokens,50);assert.equal(d.providers.antigravity.windows[0].percent,27);assert.equal(d.providers.antigravity.activity,null);
 await reader.read();assert.equal(calls,4);await reader.read({fresh:true});assert.equal(calls,8);now+=21000;await reader.read();assert.equal(calls,12);
 assert.equal((await createUsageDetails({store,run:async()=>{throw Error('locked');}}).read()).available,false);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
