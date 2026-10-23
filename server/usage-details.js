// Read only normalized, aggregate Agents Deck records; never CLI configuration or conversations.
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
const STORE=process.env.DESK_AGENTS_DECK_STORE||join(homedir(),'Library','Application Support','Agents Deck','History','History.store');
const EPOCH=978307200000, IDS=['claude','codex','antigravity'];
const count=v=>Number.isSafeInteger(v)&&v>=0?v:null;
const stamp=v=>Number.isFinite(v)&&v>=0?Math.round(EPOCH+v*1000):null;
const text=v=>typeof v==='string'?v.replace(/[\x00-\x1f\x7f]/g,'').slice(0,100):null;
function day(d){
 if(!d||![d.year,d.month,d.day].every(Number.isInteger))return null;
 const s=`${d.year}-${String(d.month).padStart(2,'0')}-${String(d.day).padStart(2,'0')}`;
 if(!/^20\d\d-\d\d-\d\d$/.test(s))return null;
 const parsed=new Date(s+'T12:00:00Z');return Number.isFinite(parsed.getTime())&&parsed.toISOString().startsWith(s)?s:null;
}
function pairs(v){if(!Array.isArray(v))return {};const o={};for(let i=0;i+1<v.length;i+=2)if(typeof v[i]==='string')Object.defineProperty(o,v[i],{value:v[i+1],enumerable:true,configurable:true});return o;}
const pct=v=>Number.isFinite(v)&&v>=0&&v<=100?v:null;
function windows(payload){
 const result=[];
 const add=(group,kind,w)=>{if(!['fiveHour','sevenDay'].includes(kind)||pct(w?.usedPercent)===null)return;result.push({group,kind,percent:pct(w.usedPercent),resetsAt:stamp(w.resetsAt)});};
 for(const [kind,w]of Object.entries(pairs(payload?.windows)))add(null,kind,w);
 for(const [g,ws]of Object.entries(pairs(payload?.groupedWindows)))if(['gemini4Argon','geminiModels','claudeAndGPTModels','claudeAndGPT'].includes(g))for(const [kind,w]of Object.entries(pairs(ws)))add(g,kind,w?.available?._0);
 return result;
}
export function normalizeActivity(provider,payload){
 if(provider==='claude'){
  const daily=(Array.isArray(payload?.dailyBuckets)?payload.dailyBuckets:[]).slice(-365).flatMap(b=>{const date=day(b.day);if(!date)return [];const modelEntries=Object.entries(b.tokensByModel??{}).slice(0,64).filter(([,n])=>count(n)!==null);const valid=b.tokensByModel&&typeof b.tokensByModel==='object'&&!Array.isArray(b.tokensByModel)&&Object.keys(b.tokensByModel).length<=64&&Object.values(b.tokensByModel).every(n=>count(n)!==null);const tokens=valid?modelEntries.reduce((s,[,n])=>s+n,0):null;return [{date,tokens:count(tokens),messages:count(b.messageCount),sessions:count(b.sessionCount),tools:count(b.toolCallCount)}];});
  const models=(Array.isArray(payload?.modelUsage)?payload.modelUsage:[]).slice(0,64).flatMap(m=>text(m.modelID)?[{name:text(m.modelID),input:count(m.inputTokens),output:count(m.outputTokens)}]:[]);
  return {kind:'local',capturedAt:stamp(payload?.capturedAt),computedThrough:day(payload?.computedThrough),daily,models,summary:{tokens:count(payload?.allTimeSummary?.totalTokens),messages:count(payload?.allTimeSummary?.totalMessages),sessions:count(payload?.allTimeSummary?.totalSessions)}};
 }
 const a=payload?.tokenActivity;if(provider!=='codex'||!a)return null;
 return {kind:'verified',capturedAt:stamp(a.capturedAt),computedThrough:null,daily:Array.isArray(a.dailyBuckets)?a.dailyBuckets.slice(-365).flatMap(b=>day(b.day)&&count(b.tokens)!==null?[{date:day(b.day),tokens:count(b.tokens)}]:[]):null,models:[],summary:{tokens:count(a.summary?.lifetimeTokens),peak:count(a.summary?.peakDailyTokens),streak:count(a.summary?.currentStreakDays)}};
}
const runSql=(store,sql)=>new Promise((resolve,reject)=>execFile('/usr/bin/sqlite3',['-readonly','-json',store,sql],{timeout:4000,maxBuffer:4_000_000},(e,out)=>e?reject(e):resolve(out)));
export function createUsageDetails({store=STORE,run=runSql,now=Date.now}={}){
 let memo;
 return {async read({fresh=false}={}){
  if(!fresh&&memo&&now()-memo.at<20000)return memo.value;
  const providers=Object.fromEntries(IDS.map(id=>[id,{windows:[],capturedAt:null,activity:null,history:[]}]));
  if(!existsSync(store))return {available:false,providers};
  const queries=[
   'SELECT ZPROVIDERRAW AS provider, ZCAPTUREDAT AS at, CAST(ZPAYLOAD AS TEXT) AS payload FROM ZLATESTUSAGERECORD LIMIT 3',
   "SELECT 'claude' AS provider, CAST(ZPAYLOAD AS TEXT) AS payload FROM ZLATESTCLAUDESTATSRECORD LIMIT 1",
   "SELECT 'codex' AS provider, CAST(ZPAYLOAD AS TEXT) AS payload FROM ZLATESTCODEXACCOUNTRECORD LIMIT 1",
   // One last observed quota sample per local day/provider. This is never a daily consumption total.
   "SELECT r.ZPROVIDERRAW AS provider,r.ZCAPTUREDAT AS at,r.ZFIVEHOURPERCENT AS fiveHour,r.ZSEVENDAYPERCENT AS sevenDay,CAST(r.ZGROUPEDWINDOWSPAYLOAD AS TEXT) AS groups FROM ZUSAGERECORD r JOIN (SELECT ZPROVIDERRAW,MAX(ZCAPTUREDAT) AS at FROM ZUSAGERECORD WHERE ZCAPTUREDAT > strftime('%s','now','-365 days')-978307200 GROUP BY ZPROVIDERRAW,date(ZCAPTUREDAT+978307200,'unixepoch','localtime')) d ON r.ZPROVIDERRAW=d.ZPROVIDERRAW AND r.ZCAPTUREDAT=d.at ORDER BY r.ZCAPTUREDAT DESC LIMIT 1095"
  ];
  const results=await Promise.allSettled(queries.map(q=>run(store,q)));
  for(let i=0;i<results.length;i++){
   const r=results[i];if(r.status!=='fulfilled')continue;
   let rows;try{rows=JSON.parse(r.value||'[]');}catch{continue;}if(!Array.isArray(rows))continue;
   for(const row of rows){if(!IDS.includes(row.provider))continue;const p=providers[row.provider];
    try{
     if(i===0){p.windows=windows(JSON.parse(row.payload));p.capturedAt=stamp(row.at);}
     else if(i<3)p.activity=normalizeActivity(row.provider,JSON.parse(row.payload));
     else if(p.history.length<365){const ws=windows({windows:['fiveHour',{usedPercent:row.fiveHour},'sevenDay',{usedPercent:row.sevenDay}],groupedWindows:row.groups?JSON.parse(row.groups):[]});if(ws.length)p.history.push({capturedAt:stamp(row.at),windows:ws});}
    }catch{/* Unsupported or malformed records cannot cross the aggregate boundary. */}
   }
  }
  const value={available:Object.values(providers).some(p=>p.windows.length||p.activity||p.history.length),providers};memo={at:now(),value};return value;
 }};
}
