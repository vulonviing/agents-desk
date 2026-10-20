import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createActivityWatch } from '../scanner/watch.js';
import { tmp, write } from './helpers.js';
const fixture = () => {
  const root = tmp(); mkdirSync(join(root,'sessions')); mkdirSync(join(root,'project'));
  return { root, data: { floors: [{ rooms: [{ path: join(root,'project') }] }] }, config: { sessions: { projectsDir: join(root,'sessions'), codexSessionsDir: false } } };
};
const waitFor = async predicate => { for (let i=0;i<200;i++) { if (predicate()) return; await delay(20); } throw new Error('Filesystem notification timed out'); };
test('native watch coalesces log writes, stays quiet while idle, and closes all handles', async t => {
  const f=fixture(), events=[]; const w=createActivityWatch(e=>events.push({...e,at:Date.now()}),60);t.after(()=>w.close());
  write(f.root,'sessions/session.jsonl','');w.configure(f.data,f.config); await delay(80);
  const start=Date.now(); appendFileSync(join(f.root,'sessions/session.jsonl'),'{}\n');appendFileSync(join(f.root,'sessions/session.jsonl'),'{}\n');
  await waitFor(()=>events.length);
  assert.ok(events[0].at-start < 4000);
  assert.equal(events[0].skillsChanged,false);
  const count=events.length; await delay(220);assert.equal(events.length,count);
  w.close(); assert.equal(w.count,0);
});
test('watch discovers new .agents roots and nested skill changes', async t => {
  const f=fixture(), events=[];const w=createActivityWatch(e=>events.push(e),40);t.after(()=>w.close());w.configure(f.data,f.config); await delay(80);
  write(f.root,'project/.agents/skills/new/SKILL.md','# skill');
  await waitFor(()=>events.some(e=>e.skillsChanged));
  events.length=0;
  appendFileSync(join(f.root,'project/.agents/skills/new/SKILL.md'),'\nupdated');
  await waitFor(()=>events.some(e=>e.skillsChanged));
});
