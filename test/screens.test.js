import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
function screens() {
 let entropy=31;
 const context=vm.createContext({window:{},Uint32Array,crypto:{getRandomValues(a){a[0]=entropy++;}},Math});
 vm.runInContext(readFileSync('office/public/js/screens.js','utf8'),context);
 return context.window.OfficeScreens;
}
test('idle monitors start independently, vary their durations, and exclude the last three scenes',()=>{
 const s=screens(), history=[], lengths=new Set();let t=100;
 const initial=[1,2,3,4,5].map(seed=>s.sceneAt(seed,t).id);
 assert.ok(new Set(initial).size>1);
 for(let i=0;i<200;i++){
  const scene=s.sceneAt(1,t);
  assert.ok(!history.slice(-3).includes(scene.id),'three intervening scenes before a repeat');
  history.push(scene.id);lengths.add(scene.left.toFixed(3));t+=scene.left+0.001;
 }
 assert.equal(new Set(history).size,Object.keys(s.SCENES).length);
 assert.ok(lengths.size>20);
 assert.notDeepEqual(history.slice(0,14),history.slice(14,28),'no fixed repeating playlist');
});
test('monitor snapshots preserve scene phase and future randomness; active work pauses the idle stream',()=>{
 const s=screens();let t=23;
 const start=s.sceneAt(7,t);const saved=JSON.parse(JSON.stringify(s.snapshot()));
 const advance=()=>{const ids=[];let at=t;for(let i=0;i<30;i++){const p=s.sceneAt(7,at);ids.push(p.id);at+=p.left+0.001;}return ids;};
 const first=advance();s.restore(saved);assert.deepEqual(advance(),first);
 s.restore(saved);s.setStatus(7,'typing',t);
 assert.equal(s.sceneAt(7,t+300).id,start.id);
 assert.equal(s.sceneAt(7,t+300).s,start.s);
 s.setStatus(7,'idle',t+300);
 assert.equal(s.sceneAt(7,t+300).id,start.id);
 assert.ok(Math.abs(s.sceneAt(7,t+300).s-start.s)<1e-9);
 const a=s.sceneAt(7,t+301);const tint=s.tint(7,t+301);const drawn=s.draw(()=>{},7,t+301);
 assert.equal(a.id,tint.id);assert.equal(a.id,drawn,'visible screen and illumination use the same selection');
});
