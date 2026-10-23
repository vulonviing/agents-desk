import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync}from'node:fs';
import vm from'node:vm';
function setup(){
 const updates=[],scheduled=[],speeches=[];let released=0;
 const view={t:5,pulseFloor(){},byId:{a:{},b:{}},pinned:new Set(),st:{b:{status:'idle'}},walkerOf:()=>({phase:'stay'}),say:(id,text)=>speeches.push({id,text}),schedule:(delay,act)=>scheduled.push(act),release:()=>released++};
 const context=vm.createContext({window:{OfficeI18n:{t:k=>k},OfficeApi:{},OfficeLayout:{FLOOR_SIGNAL:{travel:4},FLOOR_LED:{x:500,y:244},FLOOR_POWER_PADS:{on:{x:508,y:231,w:15,h:8},off:{x:529,y:231,w:15,h:8}}},OfficeWorkflow:{Workflow:class{}}},Date,Math,Map,Set,clearInterval});
 vm.runInContext(readFileSync('office/public/js/life.js','utf8'),context);
 const life=new context.window.OfficeLife.Life(view,{onConversationUpdate:r=>updates.push({turns:r.turns.length,active:r.active})});
 life.history=[{id:'one',a:'a',b:'b',lines:['first','second','third','fourth'],turns:[],active:true}];
 return {life,view,updates,scheduled,speeches,released:()=>released};
}
test('each visible turn updates its conversation and completion is announced before walking home',()=>{
 const {life,updates,speeches,released}=setup();for(let i=0;i<5;i++)life.speak('one',i);
 assert.equal(speeches.length,4);assert.deepEqual(updates,[{turns:1,active:true},{turns:2,active:true},{turns:3,active:true},{turns:4,active:true},{turns:4,active:false}]);assert.equal(released(),1);
 life.finishConversation('one');assert.equal(updates.length,5);
});
test('interrupted conversations finish without adding a turn',()=>{
 const {life,view,updates,speeches}=setup();life.speak('one',0);view.pinned.add('b');life.speak('one',1);
 assert.equal(speeches.length,1);assert.deepEqual(updates.at(-1),{turns:1,active:false});
});

test('screen power changes only after an available coordinator reaches its switch',()=>{
 const {life,view,scheduled,released}=setup(),changes=[];
 life.onScreenPower=on=>changes.push(on);life.free=()=>[];
 life.requestScreenPower(true);assert.equal(view.floorPowerPending,true);assert.deepEqual(changes,[]);assert.equal(life.screenPower.id,null);
 life.free=()=>[{id:'a'}];view.walkTo=()=>true;life.startScreenPower();assert.equal(life.screenPower.id,'a');
 life.onWalk('a','arrive',{type:'screen-power'});assert.deepEqual(changes,[]);assert.equal(view.floorPowerPending,true);life.onSched(scheduled.at(-2));assert.deepEqual(changes,[]);assert.equal(view.floorPowerPending,true);life.onSched({type:'screen-power-arrived',at:life.screenPower.at});assert.deepEqual(changes,[true]);assert.equal(view.floorPowerPending,null);
 life.onSched(scheduled.find(a=>a.type==='screen-power-release'));assert.equal(released(),1);
 life.requestScreenPower(false);assert.deepEqual(changes,[true]);life.onWalk('a','arrive',{type:'screen-power'});assert.deepEqual(changes,[true]);life.onSched(scheduled.at(-2));assert.deepEqual(changes,[true,false]);
});
