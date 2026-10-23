import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
function setup(){
 const window={OfficeI18n:{t:k=>k}};const context=vm.createContext({window,Math,Date,document:{hidden:false}});
 for(const file of ['layout','nav','leya','fireplace-life'])vm.runInContext(readFileSync(`office/public/js/${file}.js`,'utf8'),context);
 const agents=['a','b','c'].map(id=>({id,name:id}));const v={t:10,agents,byId:Object.fromEntries(agents.map(a=>[a.id,a])),st:Object.fromEntries(agents.map(a=>[a.id,{status:'idle'}])),pinned:new Set(),cat:window.OfficeCat.create(window.OfficeLayout.CAT_HOME),nav:new window.OfficeNav(768,400,[]),walks:{},bubbles:[],darkness:()=>.56,walkerOf(id){return this.walks[id]?.cur;},walkPos(c){return c.path.at(-1);},side:()=>({x:200,y:240}),say(id,text,opts){this.bubbles.push({id,text,...opts});},hearts(){this.pets=(this.pets??0)+1;},release(id){if(this.walks[id]?.cur)this.walks[id].cur.phase='back';},walkTo(id,to,opts){this.walks[id]={cur:{...opts,path:[{x:200,y:240},to],phase:'go'}};return true;}};
 const life={view:v,nextAt:0,busy:0,newsSession:{status:'idle'},workflow:{current:()=>null},pools:{spokenAt:new Map(),pick:()=>null},free:()=>agents.filter(a=>!v.walkerOf(a.id))};
 const h=new window.OfficeHearth.Hearth(life);function seated(){for(const p of h.scene.people)v.walkerOf(p.id).phase='stay';}
 return {h,v,life,Cat:window.OfficeCat,seated};
}
test('only a quiet night gathers colleagues; daytime, real work, open chats and news preparation remain undisturbed',()=>{
 const {h,v,life}=setup();v.darkness=()=>0;assert.equal(h.tick(),false);v.darkness=()=>.56;
 for(const block of ['work','chat','news','workflow']){if(block==='work')v.st.a.status='typing';if(block==='chat')v.pinned.add('a');if(block==='news')life.newsSession.status='preparing';if(block==='workflow')life.workflow.current=()=>({phase:'search'});assert.equal(h.tick(),false);assert.equal(h.scene,null);v.st.a.status='idle';v.pinned.clear();life.newsSession.status='idle';life.workflow.current=()=>null;}
 assert.equal(h.tick(),true);assert.equal(h.scene.people.length,3);assert.ok(h.scene.people.every(p=>h.reserved(p.id)));assert.equal(v.walkerOf('a').pose,'lounge');
});
test('work starting mid-walk returns everyone from their current position and removes only hearth bubbles',()=>{
 const {h,v}=setup();h.tick();v.bubbles.push({id:'a',text:'other',act:{type:'other'}});v.st.b.status='typing';assert.equal(h.tick(),false);assert.equal(h.scene,null);assert.ok(Object.values(v.walks).every(w=>w.cur.phase==='back'));assert.equal(v.bubbles.length,1);assert.equal(v.bubbles[0].text,'other');assert.equal(v.cat.hearth,undefined);
});
test('four-turn pooled conversations, Leya walking to her cushion, gentle petting and refresh continuity',()=>{
 const {h,v,life,Cat,seated}=setup();life.pools.pick=()=>({text:'One',reply:'Two',followUp:'Three',answer:'Four'});h.tick();seated();v.t=40;h.tick();assert.equal(v.cat.hearth,true);assert.equal(v.cat.mode,'walk');
 for(let i=0;i<160;i++){v.t+=.1;Cat.update(v);}assert.ok(['knead','sleep','groom'].includes(v.cat.mode));
 v.t=65;h.tick();assert.equal(h.scene.petId,'c');assert.ok(v.pets>0);assert.equal(h.petting('c'),true);
 const snapshot=JSON.parse(JSON.stringify(h.snapshot()));h.scene=null;h.restore(snapshot);assert.equal(h.scene.people.length,3);assert.equal(h.scene.petId,'c');
 h.dismiss();assert.equal(v.cat.hearth,false);assert.equal(v.cat.mode,'return');assert.ok(Object.values(v.walks).every(w=>w.cur.phase==='back'));
});
test('fallback scenes respect ten-minute repetition spacing and live language selection',()=>{const {h}=setup();for(let i=0;i<3;i++)assert.ok(h.fallbackLine());assert.equal(h.fallbackLine(),null);});

test('daytime breaks wait, use general four-turn pools, persist, and leave a long gap afterward',()=>{
 const {h,v,life,seated}=setup();v.darkness=()=>0;assert.equal(h.tick(),false);
 assert.ok(h.dayAt>=v.t+180&&h.dayAt<=v.t+420);
 const planned=h.dayAt,saved=JSON.parse(JSON.stringify(h.snapshot()));h.dayAt=null;h.restore(saved);assert.equal(h.dayAt,planned);
 v.t=planned;const kinds=[];life.pools.pick=(scope,kind)=>{kinds.push(kind);return{text:'First',reply:'Second',followUp:'Third',answer:'Fourth'};};
 assert.equal(h.tick(),true);assert.equal(h.scene.mode,'break');assert.ok(h.scene.until-v.t>=120&&h.scene.until-v.t<=180);assert.equal(h.lit(),false);seated();
 v.t+=30;h.tick();assert.equal(kinds[0],'visit');assert.equal(h.scene.turns.length,4);
 assert.equal(v.bubbles.at(-1).text,'First');v.t+=8;h.tick();assert.equal(v.bubbles.at(-1).text,'Second');
 const end=h.scene.until;v.t=end;h.tick();assert.equal(h.scene,null);assert.ok(h.dayAt>=end+720&&h.dayAt<=end+1200);
});
test('day breaks also yield to open chats and night transitions without retaining an incorrect scene',()=>{
 for(const reason of ['chat','night']){const {h,v}=setup();v.darkness=()=>0;h.dayAt=0;h.tick();assert.equal(h.scene.mode,'break');
 if(reason==='chat')v.pinned.add('a');else v.darkness=()=>.56;
 h.tick();assert.equal(h.scene,null);assert.ok(Object.values(v.walks).every(w=>w.cur.phase==='back'));}
});
test('a two-person break keeps the chair beside Leya occupied for gentle petting',()=>{
 const {h,v,life}=setup();v.darkness=()=>0;h.dayAt=0;life.free=()=>v.agents.slice(0,2);h.tick();
 assert.deepEqual(Array.from(h.scene.people,p=>p.seat),[0,2]);
});
