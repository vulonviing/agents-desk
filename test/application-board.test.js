import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,symlinkSync,mkdtempSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {field,parsePosting,locate,createApplicationBoard,safeLink} from '../server/application-board.js';
import {classifyJob,cvPreparation} from '../server/application-metadata.js';

test('job categories use role and contract evidence without interpreting candidate requirements',()=>{
 assert.deepEqual(classifyJob({title:'PhD AI Researcher',contract:'Full-time'}).types,['phd']);
 assert.deepEqual(classifyJob({title:'Internship / Master Thesis AI'}).types,['intern']);
 assert.deepEqual(classifyJob({title:'Research Associate',contract:'Doctoral position, full-time'}).types,['phd']);
 assert.deepEqual(classifyJob({title:'Data Analyst',employment:'Full-time'}).types,['full_time']);
 assert.deepEqual(classifyJob({title:'Working Student AI'}).types,['other']);
 assert.deepEqual(classifyJob({title:'Junior Research Engineer'}).types,['unknown']);
 const r=parsePosting('# Data Scientist\n## Requirements\n- PhD preferred\n- Internship experience\n','2020-01-01-Company');
 assert.deepEqual(r.jobTypes,['unknown']);
 const contract=parsePosting('# Research Associate\n| H | Contract type | YES | PhD position, Full-time |','Company');
 assert.deepEqual(contract.jobTypes,['phd']);
});

test('CV preparation uses source creation metadata, refreshes, and rejects symlink dates',async t=>{
 const scratch=resolve('.qa');mkdirSync(scratch,{recursive:true});const root=mkdtempSync(join(scratch,'metadata-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const folder=join(root,'application_preparer/applications/reviewed/2000-01-01-Example');mkdirSync(folder,{recursive:true});
 writeFileSync(join(folder,'job-posting.md'),'# AI Internship\nLocation: Berlin');
 const board=createApplicationBoard({root});assert.equal((await board.read()).reviewed[0].preparedAt,null);
 const cv=join(folder,'Emrecan CV - Example.json');writeFileSync(cv,'private CV contents');
 const row=(await board.read({fresh:true})).reviewed[0];
 assert.deepEqual(row.jobTypes,['intern']);assert.equal(row.preparedAtSource,'cv_json_birthtime');
 assert.equal(row.preparedAt,new Date((await (await import('node:fs/promises')).stat(cv)).birthtimeMs).toISOString());
 assert.ok(!JSON.stringify(row).includes('private CV contents'));
 symlinkSync(cv,join(folder,'Emrecan CV - Link.pdf'));
 assert.equal((await cvPreparation(folder,['Emrecan CV - Link.pdf'],root)).at,null);
});

test('posting metadata parses both templates and never mistakes original posting text for metadata',()=>{
 const text='Source URL: https://example.com/job\n# Data Analyst\n- **Location:** Berlin, Germany\n## Evaluation summary\nStrong overlap.\n### Matched evidence\n- Python analysis\n### Material gaps\n- Domain knowledge\n## Original Job Posting (verbatim)\nLocation: London\nYour tasks\n- Analyze data\nRequirements\n- Python';
 const r=parsePosting(text,'2026-10-21-Example-Data-Analyst-iyi_uyum',['Emrecan CV - Example.json']);
 assert.equal(r.location,'Berlin, Germany');assert.equal(r.company,'Example');assert.equal(r.tier,'iyi_uyum');assert.equal(r.url,'https://example.com/job');assert.deepEqual(r.evidence,['Python analysis']);assert.deepEqual(r.description,['Analyze data']);
 assert.equal(field('| Location | Munich |','Location'),'Munich');
 assert.equal(safeLink('javascript:alert(1)'),null);assert.equal(safeLink('https://user:pass@example.com'),null);
});

test('German city matching disambiguates aliases, avoids state names and parenthetical relocation notes',()=>{
 assert.equal(locate('München, Bayern, Deutschland').city.name,'Munich');
 assert.equal(locate('Frankfurt, Hesse, Germany').city.name,'Frankfurt am Main');
 assert.equal(locate('Frankfurt (Oder), Germany').city.name,'Frankfurt (Oder)');
 assert.equal(locate('Mannheim, Baden-Württemberg, Germany').city.name,'Mannheim');
 assert.equal(locate('Garching, Bavaria, Germany').city.id,'2922582');
 assert.equal(locate('Berlin, Germany (relocation from Munich)').city.name,'Berlin');
 assert.equal(locate('Germany (main hub Munich)').reason,'remote');
 assert.equal(locate('Remote (Berlin optional)').reason,'remote');
 assert.equal(locate('Munich, Berlin, or Dublin').reason,'multiple');
 assert.equal(locate('Not stated; company headquartered in Berlin').reason,'unknown');
});

test('read-only board deduplicates submitted jobs, separates reviewed jobs and rejects symlinks',async t=>{
 const scratch=resolve('.qa');mkdirSync(scratch,{recursive:true});const root=mkdtempSync(join(scratch,'board-test-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const base=join(root,'application_preparer/applications'),applied=join(base,'BAŞVURULDU'),reviewed=join(base,'reviewed');mkdirSync(applied,{recursive:true});mkdirSync(reviewed,{recursive:true});
 const add=(parent,name,city,url)=>{const p=join(parent,name);mkdirSync(p);writeFileSync(join(p,'job-posting.md'),`# Analyst\nSource URL: ${url}\nLocation: ${city}\n`);};
 add(applied,'2026-10-21-A-iyi_uyum','Berlin, Germany','https://example.com/a');add(applied,'2026-10-21-A-duplicate','Berlin, Germany','https://example.com/a/');add(applied,'2026-10-21-B-iyi_uyum','Germany (Remote)','https://example.com/b');add(reviewed,'2026-10-21-C-iyi_uyum','Hamburg','https://example.com/c');
 symlinkSync(applied,join(reviewed,'external-link'));
 const trap=join(reviewed,'2026-10-21-Trap');mkdirSync(trap);writeFileSync(join(root,'private.txt'),'secret');symlinkSync(join(root,'private.txt'),join(trap,'job-posting.md'));
 const before=(await import('node:fs/promises')).stat(join(applied,'2026-10-21-A-iyi_uyum/job-posting.md'));
 const board=createApplicationBoard({root});const data=await board.read();assert.equal(data.reviewed.length,1);assert.equal(data.reviewedMap.total,1);assert.equal(data.reviewedMap.cities[0].name,'Hamburg');assert.equal(data.map.cities[0].name,'Berlin');assert.equal(data.map.total,2);assert.equal(data.map.duplicates,1);assert.equal(data.map.mapped,1);assert.equal(data.map.unmapped.length,1);assert.equal(data.skipped,1);assert.ok(!JSON.stringify(data).includes('secret'));
 add(reviewed,'2026-10-21-D-iyi_uyum','Berlin','https://example.com/d');assert.equal((await board.read()).reviewed.length,1);assert.equal((await board.read({fresh:true})).reviewed.length,2);
 assert.equal((await before).mtimeMs,(await (await import('node:fs/promises')).stat(join(applied,'2026-10-21-A-iyi_uyum/job-posting.md'))).mtimeMs);
});
