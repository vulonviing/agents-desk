import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,rmSync}from'node:fs';
import {resolve}from'node:path';
import {createDialogues,validateLines}from'../server/dialogues.js';
const office={name:'Office',floor:'Office',agents:[],recent:[]};
const line={kind:'fireplace',text:'Leya minderine kıvrıldı.',reply:'Yanına biraz yer açalım.',followUp:'Gel güzel kız, seni okşayayım.',answer:'Şimdi mırıldanıyor.',textEn:'Leya curled up on her cushion.',replyEn:'Let us make some room beside her.',followUpEn:'Come here, sweet girl. Let me pet you.',answerEn:'She is purring now.'};
const wait=()=>new Promise(r=>setTimeout(r,25));
function dir(){mkdirSync('.qa',{recursive:true});return mkdtempSync(resolve('.qa/fireplace-dialogues-'));}
test('the bilingual night library uses the shared queue once, persists, and never replaces news editions',async()=>{
 const dataDir=dir();let active=0,max=0,calls=0;const changes=[];
 try{
 const d=createDialogues({dataDir,hold:true,onChange:id=>changes.push(id),run:async(system,input,schema)=>{calls++;active++;max=Math.max(active,max);assert.match(system,/Leya/);assert.doesNotMatch(input,/prompt|transcript|lonely|yalnız/i);assert.equal(schema.properties.lines.maxItems,32);await wait();active--;return{lines:[line]};}});
 const editorial=d.editorial(async call=>{await call('Leya editorial','{}',{properties:{lines:{maxItems:32}}});});
 const first=d.get('floor:growth',office);assert.ok(first.lines.some(l=>l.kind==='fireplace'));for(let i=0;i<10;i++)d.get('floor:growth',office);
 await editorial;for(let i=0;i<20&&d.status().fireplace.refreshing;i++)await wait();
 assert.equal(calls,2);assert.equal(max,1);assert.equal(d.status().fireplace.lines,1);assert.equal(changes.at(-1),'floor:growth');assert.equal(d.get('floor:growth',office).lines[0].text,line.text);
 assert.equal(d.status().pools.find(p=>p.id==='floor:growth').lines,0);
 const restored=createDialogues({dataDir,hold:true,run:async()=>{throw Error('must remain cached');}});assert.equal(restored.get('floor:growth',office).lines[0].text,line.text);await wait();assert.equal(restored.status().usage.calls,2);
 }finally{rmSync(dataDir,{recursive:true,force:true});}
});
test('a provider quota failure backs off and leaves the public fallback library usable',async()=>{
 const dataDir=dir();let calls=0;try{const d=createDialogues({dataDir,hold:true,run:async()=>{calls++;throw Error('provider-quota');}});d.get('floor:growth',office);await wait();for(let i=0;i<10;i++)d.get('floor:growth',office);await wait();assert.equal(calls,1);assert.equal(d.status().fireplace.lines,0);assert.ok(d.get('floor:growth',office).lines.some(l=>l.kind==='fireplace'&&l.en));}finally{rmSync(dataDir,{recursive:true,force:true});}
});
test('fireplace exchanges reject single-sided conversations and unsafe text',()=>{assert.equal(validateLines([{kind:'fireplace',text:'Hi'}]).length,0);assert.equal(validateLines([{...line,reply:'https://bad.example'}]).length,0);assert.equal(validateLines([line])[0].en.answer,line.answerEn);});
