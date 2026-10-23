// Read bounded public posting metadata from configured application folders; no CV contents or chat transcripts.
import { open, readdir, lstat, realpath } from 'node:fs/promises';
import { readFileSync, constants } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { postingEvidence } from './application-classifier.js';
import { classifyJob, cvPreparation, JOB_TYPES } from './application-metadata.js';

const gazetteer = JSON.parse(readFileSync(new URL('./german-cities.json', import.meta.url))).cities;
const ALIASES = { '2925533':['Frankfurt'], '2867714':['München','Muenchen'], '2886242':['Cologne','Koeln'], '2934246':['Dusseldorf','Duesseldorf'], '2913759':['Hannover','Hanover'], '2922582':['Garching'], '2884210':['Kronberg'] };
export const normalize = s => String(s).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/ß/g,'ss').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const clean = s => String(s??'').replace(/\*\*|`/g,'').replace(/\[([^\]]+)\]\([^)]+\)/g,'$1').replace(/\s+/g,' ').trim();
const clip = (s,n=220) => clean(s).slice(0,n);
const tiers = ['harika_uyum','cok_iyi_uyum','iyi_uyum','uyumlu','uyumsuz','untiered'];
export function field(text, label) {
  for(const line of text.split('\n')) {
    const row=line.startsWith('|')?line.split('|').slice(1,-1).map(clean):null;
    if(row && normalize(row[0])===normalize(label))return row.slice(1).join(' | ').trim();
    const m=line.replace(/^\s*[-*]\s+/,'').replaceAll('**','').match(/^([^:]{1,55}):\s*(.*)$/);
    if(m&&normalize(m[1])===normalize(label))return clean(m[2]);
  }
  return '';
}
function section(text, names) {
 const lines=text.split('\n');let collecting=false,out=[];
 for(const line of lines){const m=line.match(/^#{1,5}\s+(.+)/);if(m){if(collecting)break;collecting=names.includes(normalize(m[1]));continue;}if(collecting)out.push(line);}
 return out.join('\n').trim();
}
const bullets = text => text.split('\n').filter(l=>/^\s*[-*]\s+/.test(l)).map(l=>clip(l.replace(/^\s*[-*]\s+/,''),180)).slice(0,4);
export function safeLink(value) {
 const match=String(value).match(/https:\/\/[^\s<>)|]+/);
 try {const u=new URL(match?.[0]);return u.protocol==='https:'&&!u.username&&!u.password?u.href.slice(0,1200):null;}catch{return null;}
}
export function parsePosting(text, folder, files=[]) {
 const meta=text.split(/^#{1,4}\s+Original (?:Job )?Posting.*$/im)[0];
 const company=files.map(f=>f.match(/^Emrecan CV - (.+)\.(?:json|pdf)$/)?.[1]).find(Boolean)||field(meta,'Company')||folder.replace(/^.*?\d{4}-\d{2}-\d{2}-/,'').split('-')[0];
 const title=field(meta,'Position')||field(meta,'Role')||meta.match(/^#\s+(.+)/m)?.[1]||folder;
 const tier=tiers.find(t=>folder.endsWith('-'+t))||tiers.find(t=>field(meta,'Canonical tier').includes(t))||'untiered';
 const summary=clip(section(meta,['evaluation summary','fit summary'])||field(meta,'Evaluation summary'),360);
 const original=text.split(/^#{1,4}\s+Original (?:Job )?Posting.*$/im)[1]??'';
 const contract=meta.split('\n').map(line=>line.startsWith('|')?line.split('|').slice(1,-1).map(clean):[]).find(c=>c.some(v=>normalize(v)==='contract type'))?.at(-1)||field(meta,'Contract type');
 const job=classifyJob({title,employment:field(meta,'Employment type')||field(meta,'Job type'),contract});
 const tasks=original.match(/(?:^|\n)(?:Your tasks|Your responsibilities|Responsibilities|Main tasks|What you.ll do)\s*:?\s*\n([\s\S]*?)(?:\n(?:Your profile|Requirements|Qualifications|What you bring)\b|$)/i)?.[1]??'';
 return {id:createHash('sha256').update(folder).digest('hex').slice(0,20),company:clip(company,100),title:clip(title.replace(/^Job [Pp]osting\s*[-—:]?\s*/,''),200),location:clip(field(meta,'Location'),500),tier,jobTypes:job.types,jobTypeSource:job.source,date:folder.match(/\d{4}-\d{2}-\d{2}/)?.[0]??'',url:safeLink(field(meta,'Source URL')||field(meta,'Source')||field(meta,'URL')),summary,description:bullets(section(meta,['responsibilities','key responsibilities'])||tasks),evidence:bullets(section(meta,['matched evidence','fit evidence'])),gaps:bullets(section(meta,['material gaps','gaps'])),folder:clip(folder,240)};
}
export function locate(location,cities=gazetteer) {
 // Never infer cities from relocation notes, employer headquarters or other parenthetical explanations.
 let head=String(location).replace(/Frankfurt\s*\(Oder\)/i,'Frankfurt Oder').split(/[;(]/)[0];
 if(/fully remote|fully-remote|^remote\b/i.test(head))return {reason:'remote'};
 if(/not stated|not specified|unconfirmed/i.test(head))return {reason:'unknown'};
 const text=' '+normalize(head)+' ';
 const found=cities.flatMap(c=>{
  const names=[c.name,...c.aliases.slice(0,2),...(ALIASES[c.id]??[])].map(normalize).filter(s=>s.length>=4);
  const matches=names.map(n=>({index:text.indexOf(' '+n+' '),span:n.length})).filter(m=>m.index>=0).sort((a,b)=>a.index-b.index||b.span-a.span);
  return matches.length?[{city:c,...matches[0]}]:[];
 }).sort((a,b)=>a.index-b.index||b.span-a.span||b.city.population-a.city.population);
 const positions=new Map();for(const f of found)if(!positions.has(f.index))positions.set(f.index,f);
 const unique=[...positions.values()];
 if(unique.length>1)return {reason:'multiple'};
 if(!unique.length)return {reason:/remote/i.test(head)||/^(?:germany|deutschland)\b/i.test(head.trim())?'remote':'unknown'};
 return {city:unique[0].city,uncertain:/unverified|assumed|not in the posting|not stated|metadata/i.test(location)};
}
function buildMap(rows) {
 const groups=new Map(),unmapped=[],seen=new Set();let duplicates=0;
 for(const row of rows){
  const key=row.url?.replace(/[?#].*$/,'').replace(/\/$/,'')||row.id;
  if(seen.has(key)){duplicates++;continue;}seen.add(key);
  const point=locate(row.location);
  if(!point.city){unmapped.push({...row,reason:point.reason});continue;}
  const c=point.city;
  if(!groups.has(c.id))groups.set(c.id,{id:c.id,name:c.name,lat:c.lat,lon:c.lon,applications:[],uncertain:0});
  const g=groups.get(c.id);g.applications.push(row);if(point.uncertain)g.uncertain++;
 }
 const cities=[...groups.values()].map(c=>({...c,count:c.applications.length,companies:new Set(c.applications.map(a=>a.company)).size,tiers:Object.fromEntries(tiers.map(t=>[t,c.applications.filter(a=>a.tier===t).length]))})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name));
 return {total:seen.size,duplicates,mapped:cities.reduce((n,c)=>n+c.count,0),cities,unmapped};
}
async function boundedText(file,root,limit=64000){
 const info=await lstat(file);if(!info.isFile()||info.isSymbolicLink())throw Error('invalid');
 const real=await realpath(file);if(!real.startsWith(root+sep))throw Error('outside');
 const f=await open(real,constants.O_RDONLY|constants.O_NOFOLLOW);try{const b=Buffer.alloc(limit);const {bytesRead}=await f.read(b,0,b.length,0);return b.subarray(0,bytesRead).toString('utf8');}finally{await f.close();}
}
export function createApplicationBoard({root,now=Date.now,classifier}={}) {
 let cache=null,at=0,pending=null,pendingFresh=false;
 async function load({fresh=false,provider='claude'}={}){
  if(!root)return {available:false,reviewed:[],map:buildMap([]),skipped:0};
  const base=resolve(root,'application_preparer/applications');let names;
  try{names=await readdir(base,{withFileTypes:true});}catch{return {available:false,reviewed:[],map:buildMap([]),skipped:0};}
  const realBase=await realpath(base);if(realBase!==base)return {available:false,reviewed:[],map:buildMap([]),skipped:0};
  let skipped=0;const jobs=[];const sets={reviewed:[],applied:[]};
  let evaluations={};try{evaluations=JSON.parse(await boundedText(join(root,'linkedin_collector/state.json'),await realpath(root),2*1024*1024)).records??{};}catch{}
  for(const [kind,category] of [['reviewed','reviewed'],['applied','BAŞVURULDU']]){
   const dir=names.find(n=>n.isDirectory()&&n.name.normalize('NFC')===category);if(!dir)continue;
   const categoryPath=join(base,dir.name),entries=await readdir(categoryPath,{withFileTypes:true});
   for(const entry of entries.filter(e=>e.isDirectory()).slice(0,2000)){
    try{const folder=join(categoryPath,entry.name),files=(await readdir(folder)).slice(0,80);const text=await boundedText(join(folder,'job-posting.md'),realBase);const row=parsePosting(text,entry.name,files),ev=row.url?(evaluations[row.url]??Object.values(evaluations).find(e=>e.url?.replace(/\/$/,'')===row.url.replace(/\/$/,''))):null;
     const prepared=await cvPreparation(folder,files,realBase);row.preparedAt=prepared.at;row.preparedAtSource=prepared.source;
     if(ev){if(!row.evidence.length)row.evidence=(ev.matched_evidence??[]).slice(0,4).map(s=>clip(s,160));if(!row.gaps.length)row.gaps=(ev.gaps??[]).slice(0,4).map(s=>clip(s,160));if(!row.summary)row.summary=clip(ev.summary,360);}
     if(kind==='reviewed')jobs.push({id:row.id,title:row.title,description:postingEvidence(text),row});
     sets[kind].push(row);}catch{skipped++;}
   }
  }
  const classification=classifier?await classifier.resolve(jobs,{refresh:fresh,provider}):null;
  return {available:true,classification,metadataVersion:2,jobTypes:JOB_TYPES,updatedAt:now(),reviewed:sets.reviewed,reviewedMap:buildMap(sets.reviewed),map:buildMap(sets.applied),skipped};
 }
 return {async read({fresh=false,provider='claude'}={}){if(!fresh&&cache&&now()-at<15000)return cache;if(fresh&&pending&&!pendingFresh)await pending;if(!pending){pendingFresh=fresh;pending=load({fresh,provider}).then(value=>{cache=value;at=now();return value;}).finally(()=>{pending=null;pendingFresh=false;});}return pending;}};
}
