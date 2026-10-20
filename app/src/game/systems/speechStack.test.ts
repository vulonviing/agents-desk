import{expect,it}from'vitest';
import{placeSpeechBlock}from'./speechStack';
import{turnDuration}from'./conversations';
it('places a new thread without covering an existing stack and stays inside the viewport',()=>{
 const a={x:100,y:100,width:250,height:200};const b=placeSpeechBlock(a,[a],900,600)!;
 expect(b).not.toBeNull();expect(b.x>=a.x+a.width+8||b.y>=a.y+a.height+8||b.x+b.width+8<=a.x||b.y+b.height+8<=a.y).toBe(true);
 expect(b.x+b.width<=892&&b.y+b.height<=592).toBe(true);
 expect(placeSpeechBlock({x:0,y:0,width:380,height:400},[],390,300)).toBeNull();
});
it('allows comfortable reading time for short and long turns',()=>{expect(turnDuration('Selam.')).toBe(6500);expect(turnDuration('x'.repeat(80))).toBe(10600);});
