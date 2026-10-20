import {expect,it} from 'vitest';
import {chatTimeline} from './timeline';
import type {Observation} from '../../types';
const at=(n:number)=>new Date(n*1000).toISOString();
const event=(n:number,id=String(n)):Observation=>({id,kind:'completed',at:at(n),roomId:'cv',provider:'codex',sessionId:'s',from:null,to:'',file:null,tool:'turn'});
it('completed turns are not listed; errors still are and duplicates collapse',()=>{
 const err=(n:number):Observation=>({...event(n),kind:'error'});
 expect(chatTimeline([{role:'user',text:'First',at:at(1)},{role:'user',text:'Next',at:at(30)}],[event(10),event(11)]).map(x=>x.type)).toEqual(['message','message']);
 expect(chatTimeline([{role:'user',text:'First',at:at(1)}],[err(10),err(11)]).filter(x=>x.type==='event')).toHaveLength(1);
});
