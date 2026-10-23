import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync,readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createApplicationClassifier,postingEvidence} from '../server/application-classifier.js';
const job=(id='one',description='Build data products full-time')=>({id,title:'Research Engineer',description,row:{summary:'PRIVATE FIT',folder:'PRIVATE PATH',preparedAt:'2026-10-22',jobTypes:['unknown']}});

test('classification only receives public posting inputs, caches decisions across restarts, and refreshes changes',async t=>{
 mkdirSync('.qa',{recursive:true});const dir=mkdtempSync(resolve('.qa/classifier-test-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const file=join(dir,'labels.json');let calls=0;
 const run=async(prompt,text,schema,options)=>{calls++;assert.equal(options.provider,'codex');assert.ok(!text.includes('PRIVATE'));assert.ok(!text.includes('preparedAt'));assert.ok(!schema.properties.jobs.items.properties.types.items.enum.includes('unknown'));return {jobs:JSON.parse(text).map(j=>({id:j.id,types:['full_time'],inferred:true}))};};
 const c=createApplicationClassifier({file,run});const jobs=[job()];assert.equal((await c.resolve(jobs)).pending,1);assert.equal(calls,0);
 assert.deepEqual(await c.resolve(jobs,{refresh:true,provider:'codex'}),{failed:false,pending:0});assert.deepEqual(jobs[0].row.jobTypes,['full_time']);assert.equal(calls,1);
 await c.resolve([job()],{refresh:true,provider:'codex'});assert.equal(calls,1);
 const restarted=createApplicationClassifier({file,run});const next=[job()];assert.equal((await restarted.resolve(next)).pending,0);assert.equal(calls,1);
 await restarted.resolve([job('one','Updated full description')],{refresh:true,provider:'codex'});assert.equal(calls,2);
 const persisted=readFileSync(file,'utf8');assert.ok(!persisted.includes('PRIVATE'));assert.ok(!persisted.includes('Build data'));assert.ok(!persisted.includes('Updated full'));
});

test('incomplete or invalid CLI labels never silently become a fabricated classification',async()=>{
 for(const answer of [{jobs:[]},{jobs:[{id:'wrong',types:['full_time'],inferred:false}]},{jobs:[{id:'one',types:['unknown'],inferred:false}]}]){
  const c=createApplicationClassifier({run:async()=>answer}),jobs=[job()];assert.deepEqual(await c.resolve(jobs,{refresh:true}),{failed:true,pending:1});assert.deepEqual(jobs[0].row.jobTypes,['unknown']);
 }
});

test('classifier checkpoints completed batches and retries only unfinished jobs',async()=>{
 let calls=0,fail=true;const c=createApplicationClassifier({run:async(p,text)=>{calls++;const jobs=JSON.parse(text);if(calls===2&&fail)throw Error('quota');return {jobs:jobs.map(j=>({id:j.id,types:['full_time'],inferred:true}))};}});
 const jobs=Array.from({length:13},(_,n)=>job('job-'+n));assert.deepEqual(await c.resolve(jobs,{refresh:true}),{failed:true,pending:1});fail=false;assert.deepEqual(await c.resolve(jobs,{refresh:true}),{failed:false,pending:0});assert.equal(calls,3);
});

test('public description extraction excludes fit summaries, CV details, and tailoring notes',()=>{
 const text='# Title\n## Fit Summary\nPRIVATE FIT\n## Job Requirements\n### Must-have\n- Python\n## Tailoring Notes\nPRIVATE CV\n## Responsibilities\n- Build tools\n## Evaluation summary\nPRIVATE EVIDENCE';
 const result=postingEvidence(text);assert.match(result,/Python/);assert.match(result,/Build tools/);assert.ok(!result.includes('PRIVATE'));
 assert.equal(postingEvidence('PRIVATE CV\n## Original Job Posting\nPublic tasks\n## Tailoring Notes\nPRIVATE CV'),'Public tasks');
 assert.equal(postingEvidence('## Original Job Posting\n'+'x'.repeat(20000)).length,12000);
});
