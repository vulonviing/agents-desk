import test from 'node:test';
import assert from 'node:assert/strict';
import { artifactPhase, cliProviders, createApplicationActivity } from '../server/application-activity.js';

test('workflow observation recognizes outputs, excludes queue edits, code, secrets and transcript files', () => {
  for (const p of ['linkedin_collector/descriptions.json','jobbot/state/collect/steps.log','jobbot/state/collect/outbox/2026.json']) assert.equal(artifactPhase(p),'search');
  for (const p of ['linkedin_collector/state.json','linkedin_collector/classified.md','jobbot/state/inbox/batch.json']) assert.equal(artifactPhase(p),'evaluate');
  for (const p of ['job-posting.md','Emrecan CV - Acme.json','Emrecan CV - Acme.pdf','Cover Letter - Acme.md','Bundle - Acme.pdf']) assert.equal(artifactPhase('application_preparer/applications/reviewed/2026-Acme/'+p),'prepare');
  for (const p of ['.env','.git/index','AGENTS.md','application_preparer/queue/jobs.md','jobbot/state/status.json','session.jsonl','linkedin_collector/filter.py']) assert.equal(artifactPhase(p),null);
});

test('CLI discovery uses executable and cwd only, matches subfolders, never requests arguments or transcripts', async () => {
  const calls=[];
  const run=async (bin,args) => { calls.push([bin,args]); return {stdout:bin.endsWith('ps')
    ? '10 /opt/bin/claude\n11 /opt/bin/codex\n12 /opt/bin/codex-code-mode-host\n13 /opt/bin/claude\n14 /opt/bin/claude\n'
    : 'p10\nn/projects/cv\np11\nn/projects/cv/application_preparer\np13\nn/projects/cv-other\np14\nn/other\n'}; };
  assert.deepEqual(await cliProviders('/projects/cv',run),['claude','codex']);
  assert.deepEqual(calls[0][1],['-axo','pid=,comm=']);
  assert.ok(!calls[1][1].join(' ').includes('12'));
  assert.ok(calls[1][1].includes('cwd'));
});

test('observed phase requires a CLI, handles phase transitions, expires and clears after exit or probe failure', async () => {
  let now=1000, active=['codex'], fail=false;
  const tracker=createApplicationActivity({root:'/project',now:()=>now,providers:async()=>{if(fail)throw Error('private');return active;}});
  await tracker.poll();assert.equal(tracker.snapshot(),null);
  tracker.observe('linkedin_collector/descriptions.json');await tracker.poll();assert.equal(tracker.snapshot().phase,'search');
  now+=2000;tracker.observe('linkedin_collector/state.json');tracker.observe('linkedin_collector/library.json');await tracker.poll();assert.equal(tracker.snapshot().phase,'evaluate');
  now+=2000;tracker.observe('application_preparer/applications/a/Emrecan CV - Acme.json');await tracker.poll();assert.equal(tracker.snapshot().phase,'prepare');
  assert.deepEqual(Object.keys(tracker.snapshot()).sort(),['observedAt','phase','providers']);
  now+=120001;await tracker.poll();assert.equal(tracker.snapshot(),null);
  tracker.observe('linkedin_collector/state.json');active=[];await tracker.poll();assert.equal(tracker.snapshot(),null);
  active=['claude'];await tracker.poll();assert.equal(tracker.snapshot(),null,'closed CLI must not revive old work');
  tracker.observe('linkedin_collector/state.json');fail=true;await tracker.poll();assert.equal(tracker.snapshot(),null);
  tracker.stop();
});
