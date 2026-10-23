import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
function setup(){
 const listeners=[],said=[],spokenAt=new Map();let pinned=new Set();
 const view={t:5,bubbles:[],byId:{'emrecan-cv#project':{name:'Deniz'}},st:{'emrecan-cv#project':{workflow:true}},pinned,clearSpeech(){},isAway:()=>false,speaking:()=>false,say:(id,text)=>said.push({id,text})};
 const life={view,nextAt:0,free:()=>[{id:'cv-checker#project'}],pools:{spokenAt,pick:()=>null}};
 const context=vm.createContext({window:{OfficeI18n:{t:k=>k,onChange:f=>listeners.push(f)}},document:{hidden:false},Date,Math});
 vm.runInContext(readFileSync('office/public/js/application-workflow.js','utf8'),context);
 const W=context.window.OfficeWorkflow,w=new W.Workflow(life);
 return {view,life,said,w,W,listeners};
}
test('work scenes and pending colleague replies retain phase through serialization; chats block speech',()=>{
 const {w,view,life,said,listeners}=setup();w.set({phase:'search',observedAt:Date.now(),providers:['codex']});
 w.tick();assert.equal(said[0].id,'emrecan-cv#project');
 view.t+=26;w.tick();assert.ok(w.reply);const saved=JSON.parse(JSON.stringify(w.snapshot()));
 w.restore(saved);view.t+=7;w.tick();assert.equal(said.at(-1).id,'cv-checker#project');
 const count=said.length;view.pinned.add('emrecan-cv#project');view.t+=26;w.tick();assert.equal(said.length,count);
 view.pinned.clear();w.restore(saved);listeners[0]();assert.equal(w.reply,null);
 w.set({phase:'prepare',observedAt:Date.now(),providers:['claude']});assert.equal(w.scene.phase,'prepare');assert.equal(w.reply,null);
 w.set(null);assert.equal(w.current(),null);assert.equal(view.applicationWorkflow,null);
 view.bubbles=[{act:{type:'workflow-bubble'}}];w.restore(saved);
 assert.equal(w.reply,null);assert.equal(view.bubbles.length,0,'inactive work must not reappear after refresh');
});
test('nine distinct animated monitor scenes remain within the monitor and advance from saved sim time',()=>{
 const {W}=setup(),hashes=new Set();
 for(const phase of ['search','evaluate','prepare'])for(let variant=0;variant<3;variant++){
  const calls=[];W.screen((x,y,w,h,c)=>{assert.ok(x>=0&&y>=0&&x+w<=20&&y+h<=11);calls.push([x,y,w,h,c]);},{phase,at:0},variant*9+0.3);
  assert.equal(W.frame({phase,at:0},variant*9+0.3).variant,variant);hashes.add(JSON.stringify(calls));
 }
 assert.equal(hashes.size,9);
});
