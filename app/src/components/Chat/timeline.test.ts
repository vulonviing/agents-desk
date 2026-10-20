import {expect,it} from 'vitest';
import {chatTimeline} from './timeline';
import type {Observation} from '../../types';
const at=(n:number)=>new Date(n*1000).toISOString();
const event=(n:number,id=String(n)):Observation=>({id,kind:'completed',at:at(n),roomId:'cv',provider:'codex',sessionId:'s',from:null,to:'',file:null,tool:'turn'});
it('old completion cards stay before the next question and duplicate observations collapse',()=>{
 const items=chatTimeline([{role:'user',text:'First',at:at(1)},{role:'user',text:'Next',at:at(30)}],[event(10),event(11)]);
 expect(items.map(x=>x.type==='message'?x.message.text:x.event.kind)).toEqual(['First','completed','Next']);
});
it('a Desk answer replaces its completion card while separate fast turns retain their outcomes',()=>{
 expect(chatTimeline([{role:'assistant',text:'Answer',at:at(10)}],[event(10)]).map(x=>x.type)).toEqual(['message']);
 expect(chatTimeline([{role:'user',text:'Another',at:at(11)}],[event(10),event(12)]).filter(x=>x.type==='event')).toHaveLength(2);
});
