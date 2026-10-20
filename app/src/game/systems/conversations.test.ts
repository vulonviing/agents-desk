import { describe, expect, it } from 'vitest';
import { ConversationDirector } from './conversations';
const a={id:'a',pos:{x:1,y:1},busy:false},b={id:'b',pos:{x:2,y:1},busy:false};
const exchange={text:'Bir dakikan var mı?',reply:'Tabii.',followUp:'Somut örnek mi kısa cümle mi?',answer:'Örnek kalsın, cümle kısa olsun.'};
describe('four-turn ambient conversations',()=>{
 it('continues after the greeting and keeps both participants reserved until the final answer',()=>{
  const d=new ConversationDirector(),actors=new Map([['a',{...a}],['b',{...b}]]);
  expect(d.start(a,b,exchange,100)).toBe(true);
  const spoken=[];
  for(let t=100;t<60_000;t+=100){const r=d.tick(t,actors);spoken.push(...r.speeches);if(spoken.length===3)expect(d.holds('a')).toBe(true);}
  expect(spoken.map(s=>s.id)).toEqual(['a','b','a','b']);
  expect(spoken.map(s=>s.text)).toEqual(Object.values(exchange));expect(d.holds('a')).toBe(false);
  expect(d.start(a,b,exchange,30_000)).toBe(false);expect(d.start(a,b,exchange,120_000)).toBe(true);
 });
 it('cancels on real work, removal or separation and does not speak for an absent listener',()=>{
  const d=new ConversationDirector(),actors=new Map([['a',{...a}],['b',{...b}]]);d.start(a,b,exchange,0);d.tick(0,actors);
  actors.get('b')!.busy=true;expect(d.tick(3000,actors).speeches).toEqual([]);expect(d.holds('a')).toBe(false);
  expect(new ConversationDirector().start(a,{...b,pos:{x:20,y:20}},exchange,0)).toBe(false);
 });
 it('rejects expired public context using the injected wall clock',()=>{
  const d=new ConversationDirector(2,()=>1000),actors=new Map([['a',a],['b',b]]);
  d.start(a,b,{...exchange,source:{kind:'news',publisher:'BBC',url:'https://www.bbc.com/',publishedAt:0,expiresAt:500}},0);
  expect(d.tick(0,actors).speeches).toEqual([]);
 });
});

it('conversation inspection reveals only spoken turns and retains them after completion',()=>{
 const d=new ConversationDirector(),actors=new Map([['a',a],['b',b]]);d.start(a,b,exchange,0);
 expect(d.transcriptFor('a')?.turns).toEqual([]);d.tick(0,actors);
 expect(d.transcriptFor('b')?.turns.map(t=>t.text)).toEqual([exchange.text]);
 for(let t=100;t<60000;t+=100)d.tick(t,actors);
 expect(d.transcriptFor('a')?.turns).toHaveLength(4);expect(d.transcriptFor('a')?.active).toBe(false);
 d.clear();expect(d.transcriptFor('a')).toBeUndefined();
});

it('after one conversation starts, no other starts for the quiet gap',()=>{
 const d=new ConversationDirector(2),c={id:'c',pos:{x:1,y:0},busy:false},e={id:'e',pos:{x:2,y:0},busy:false};
 expect(d.start(a,b,exchange,0)).toBe(true);
 expect(d.canStart(c,e,5_000)).toBe(false);
 expect(d.canStart(c,e,25_000)).toBe(true);
});
