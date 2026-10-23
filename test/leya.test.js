import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
function setup(random) {
 const math=Object.create(Math);if(random!==undefined)math.random=()=>random;
 const context=vm.createContext({window:{OfficeI18n:{t:k=>k}},Math:math,console});
 for(const file of ['layout','nav','leya'])vm.runInContext(readFileSync(`office/public/js/${file}.js`,'utf8'),context);
 const L=context.window.OfficeLayout, Cat=context.window.OfficeCat;
 const nav=new context.window.OfficeNav(L.W,L.H,[[0,0,L.W,L.WALL_H+15],[L.LRUN.x,L.LRUN.y,L.LRUN.x+L.LRUN.w,L.LRUN.y+L.LRUN.h]]);
 const said=[];
 const view={t:0,cat:Cat.create(L.CAT_HOME),nav,agents:[],byId:{},st:{},pinned:new Set(),fx:{},darkness:()=>0.5,isAway:()=>false,speaking:()=>false,hearts(){},say(id,text){said.push({id,text});}};
 return {view,Cat,L,said};
}
function step(view,Cat,seconds=0.1){view.t+=seconds;Cat.update(view);}
function until(view,Cat,goal,limit=1500){for(let i=0;i<limit;i++){if(goal())return;step(view,Cat);}assert.fail('cat transition timed out: '+view.cat.mode);}
test('Leya rests longer, keeps her identity, and can be petted without a new model call',()=>{
 const {view:v,Cat,said}=setup();assert.equal(v.cat.name,'Leya');assert.equal(v.cat.sex,'female');
 for(let i=0;i<600;i++)step(v,Cat);assert.equal(v.cat.mode,'sleep');
 Cat.poke(v);assert.equal(v.cat.mode,'pet');assert.equal(said.at(-1).text,'cat.purr');
});
test('a window visit looks out, meows once, and returns home',()=>{
 const {view:v,Cat,said}=setup();assert.equal(Cat.special(v,'window'),true);
 until(v,Cat,()=>v.cat.mode==='window-watch');const x=v.cat.x;
 for(let i=0;i<110;i++)step(v,Cat);assert.equal(v.cat.mode,'window-watch');assert.equal(v.cat.x,x);
 until(v,Cat,()=>v.cat.mode==='window-listen');assert.equal(said.filter(x=>x.text==='cat.meow').length,1);
 until(v,Cat,()=>v.cat.mode==='sleep');assert.equal(v.cat.surface,'floor');
});
test('counter jumps, slow surface walking and descent survive a plain-data snapshot',()=>{
 const {view:v,Cat}=setup();Cat.special(v,'counter');
 until(v,Cat,()=>v.cat.mode==='jump');step(v,Cat,0.4);assert.ok(v.cat.lift>10);
 const snapshot=JSON.parse(JSON.stringify(v.cat));v.cat=snapshot;
 until(v,Cat,()=>v.cat.mode==='counter-walk');assert.equal(v.cat.surface,'counter');
 const x=v.cat.x;step(v,Cat,1);assert.ok(v.cat.x>x);assert.ok(v.cat.x-x<=11);
 until(v,Cat,()=>v.cat.mode==='counter-rest');until(v,Cat,()=>v.cat.mode==='counter-down');assert.equal(v.cat.surface,'floor');
 until(v,Cat,()=>v.cat.mode==='sleep');
});
test('Leya examines the floor display, hops onto it, and naps in the lower-right corner',()=>{
 const {view:v,Cat,L}=setup();Cat.special(v,'floor');
 until(v,Cat,()=>v.cat.mode==='floor-look');until(v,Cat,()=>v.cat.mode==='jump');
 until(v,Cat,()=>v.cat.mode==='floor-nap');
 assert.ok(v.cat.x>L.FLOOR_LED.x+L.FLOOR_LED.w-50);
 assert.ok(v.cat.y>L.FLOOR_LED.y+L.FLOOR_LED.h-45);
 const p={x:v.cat.x,y:v.cat.y};for(let i=0;i<650;i++)step(v,Cat);
 assert.equal(v.cat.mode,'floor-nap');assert.equal(v.cat.x,p.x);assert.equal(v.cat.y,p.y);
});

test('Leya presses a power pad on landing, persists her task, and varies her meows',()=>{
 const {view:v,Cat,said}=setup(),actions=[];v.handlers={onCatControl:a=>actions.push({...a})};
 v.pinned.add('busy');assert.equal(Cat.control(v,{kind:'power',on:true}),false);v.pinned.clear();
 assert.equal(Cat.control(v,{kind:'power',on:true}),true);until(v,Cat,()=>v.cat.mode==='jump');assert.equal(actions.length,0);
 step(v,Cat,.4);v.cat=JSON.parse(JSON.stringify(v.cat));assert.equal(actions.length,0);until(v,Cat,()=>actions.length===1);assert.equal(actions[0].on,true);assert.ok(v.cat.controlMeows>=3);assert.ok(new Set(said.map(x=>x.text)).size>=3);
 until(v,Cat,()=>!v.cat.control);assert.equal(actions.length,1);
});

test('an old sleeping spot inside the new stove migrates by walking to the clear home spot',()=>{
 const {view:v,Cat,L}=setup();v.cat.home={x:300,y:316};v.cat.x=300;v.cat.y=316;
 step(v,Cat);assert.equal(v.cat.home.x,L.CAT_HOME.x);assert.equal(v.cat.mode,'return');
 until(v,Cat,()=>v.cat.mode==='knead');assert.ok(v.cat.x>400);
});

test('a legacy display-mode trip can still finish after removing its board card',()=>{
 const {view:v,Cat}=setup(),actions=[];v.handlers={onCatControl:a=>actions.push({...a})};
 assert.equal(Cat.control(v,{kind:'display',to:true}),true);
 until(v,Cat,()=>actions.length===1);assert.equal(actions[0].kind,'display');assert.equal(actions[0].to,true);
 until(v,Cat,()=>!v.cat.control);assert.equal(actions.length,1);
});


test('the shared environmental-control policy selects Leya below 75 percent and respects work/chat guards',()=>{
 for(const [random,expected]of [[0,true],[.7499,true],[.75,false],[.999,false]]){
  const {view:v,Cat}=setup(random);assert.equal(Cat.tryControl(v,{kind:'power',on:true}),expected);
 }
 const {view:v,Cat}=setup(.5);v.pinned.add('chat');assert.equal(Cat.tryControl(v,{kind:'refresh',to:true}),false);v.pinned.clear();v.st.a={status:'typing',chatting:true};assert.equal(Cat.tryControl(v,{kind:'usage',to:'claude'}),false);v.st.a={status:'typing'};assert.equal(Cat.tryControl(v,{kind:'usage',to:'claude'}),true);
});
