import test from 'node:test';
import assert from 'node:assert/strict';
import {createDialogueCreator,CREATIVE_DIRECTION} from '../server/dialogue-creator.js';
import {createDialogues} from '../server/dialogues.js';
import {tmp} from './helpers.js';
const office={name:'Private CV Office',floor:'Growth',agents:[{name:'resume-builder',mission:'Build CVs'}],recent:[]};
test('Flash curates daily role searches, validates public queries and reuses the plan across restart',async()=>{
 let now=Date.parse('2026-10-20T10:00:00Z'),calls=0;const dataDir=tmp();
 const run=async()=>{calls++;return{queries:[{role:'resume-builder',query:'hiring recruitment'},{role:'unknown',query:'anything'},{role:'resume-builder',query:'https://internal.local/secret'}]};};
 const creator=createDialogueCreator({dataDir,now:()=>now});
 assert.deepEqual(await creator.prepare('cv',office,run),[{role:'resume-builder',query:'hiring recruitment'}]);
 await createDialogueCreator({dataDir,now:()=>now}).prepare('cv',office,run);assert.equal(calls,1);
 now+=86400000;await creator.prepare('cv',office,run);assert.equal(calls,2);assert.match(CREATIVE_DIRECTION,/isimle hitap ETMESİN/);
});
test('curation and dialogue both consume the shared model budget; invented role addresses are dropped',async()=>{
 const dataDir=tmp(),creator=createDialogueCreator({dataDir});let calls=0,queries;
 const d=createDialogues({ config: () => ({ dialogues: { batchesPerRefresh: 1 } }),dataDir,creator,briefing:async office=>{queries=office.searchQueries;return{sources:[]};},run:async(_s,_i,schema)=>{calls++;return schema.properties.queries?{queries:[{role:'resume-builder',query:'resume hiring'}],usage:{input_tokens:10,output_tokens:10}}:{lines:[{kind:'desk',text:'Bir şey öğrenmek bazen hızdan daha kıymetli.'},{kind:'desk',text:'resume-builder, buraya gelir misin?'}],usage:{input_tokens:10,output_tokens:10}};}});
 await d.refresh('cv',office);assert.equal(calls,2);assert.equal(d.status().usage.calls,2);assert.equal(d.status().usage.inputTokens,20);assert.equal(queries[0].query,'resume hiring');assert.ok(!d.get('cv').lines.some(l=>l.text.includes('resume-builder')));
});

test('Gemini plans the news topics and searches; AI is always included, unknown topics are dropped, "genel" searches are allowed',async()=>{
 const creator=createDialogueCreator({dataDir:tmp()});
 const plan=await creator.plan('cv',office,async(prompt)=>{assert.match(prompt,/ai/);assert.match(prompt,/Almanya siyaseti/);assert.match(prompt,/Türkiye siyaseti/);return{topics:['germany','nonsense','turkey'],queries:[{role:'genel',query:'Elon Musk flying car'},{role:'unknown',query:'x'}]};});
 assert.deepEqual(plan.topics,['ai','germany','turkey']);
 assert.deepEqual(plan.queries,[{role:'genel',query:'Elon Musk flying car'}]);
 const onlyBad=await createDialogueCreator({dataDir:tmp()}).plan('cv2',office,async()=>({topics:[],queries:[]}));
 assert.deepEqual(onlyBad.topics,['ai']);
});
