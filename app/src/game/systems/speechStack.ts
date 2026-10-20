import type Phaser from 'phaser';
interface Rect { x:number; y:number; width:number; height:number }
const overlaps=(a:Rect,b:Rect)=>a.x<b.x+b.width+8&&a.x+a.width+8>b.x&&a.y<b.y+b.height+8&&a.y+a.height+8>b.y;
/** Find a free screen rectangle; returning null is preferable to covering another conversation. */
export function placeSpeechBlock(wanted:Rect, placed:Rect[], width:number,height:number):Rect|null {
  const xs=[wanted.x,...placed.flatMap(r=>[r.x+r.width+10,r.x-wanted.width-10])];
  const ys=[wanted.y,...placed.flatMap(r=>[r.y-wanted.height-10,r.y+r.height+10])];
  for(const y of ys)for(const x of xs){
    const r={...wanted,x:Math.max(8,Math.min(width-wanted.width-8,x)),y:Math.max(8,Math.min(height-wanted.height-8,y))};
    if(r.width>width-16||r.height>height-16||placed.some(p=>overlaps(r,p)))continue;
    return r;
  }
  return null;
}
interface Bubble {
  owner:{id:string;x:number;y:number}; box:Phaser.GameObjects.Container; width:number;height:number;
  expires:number; observed:boolean; thread:string; order:number; open?:()=>void;
}
const scenes=new WeakMap<Phaser.Scene,Bubble[]>();let sequence=0;
export function clearSpeech(scene:Phaser.Scene,id:string,ambientOnly=false){
  const keep=(scenes.get(scene)??[]).filter(b=>{if(b.owner.id!==id||ambientOnly&&b.observed)return true;b.box.destroy(true);return false;});scenes.set(scene,keep);
}
export function addSpeech(scene:Phaser.Scene,owner:Bubble['owner'],box:Bubble['box'],width:number,height:number,duration:number,observed:boolean,thread?:string,open?:()=>void){
  const list=scenes.get(scene)??[],key=thread??`solo:${owner.id}`;
  // Previous messages in a conversation move upward instead of being overwritten.
  if(thread){for(const b of list)if(b.thread===key)b.expires=Math.max(b.expires,scene.time.now+duration*2);}
  else clearSpeech(scene,owner.id);
  const current=thread?list:scenes.get(scene)??[];
  current.push({owner,box,width,height,expires:scene.time.now+duration,observed,thread:key,order:++sequence,open});
  const same=current.filter(b=>b.thread===key);
  while(same.length>3){const oldest=same.shift()!;oldest.box.destroy(true);current.splice(current.indexOf(oldest),1);}
  scenes.set(scene,current);layoutSpeech(scene);
}
export function layoutSpeech(scene:Phaser.Scene){
  const camera=scene.cameras.main,z=camera.zoom,view=camera.worldView;
  const list=(scenes.get(scene)??[]).filter(b=>{if(!b.box.scene||scene.time.now>b.expires){if(b.box.scene)b.box.destroy(true);return false;}b.box.setVisible(false);return true;});
  scenes.set(scene,list);const groups=new Map<string,Bubble[]>();
  for(const b of list){const group=groups.get(b.thread)??[];group.push(b);groups.set(b.thread,group);}
  const placed:Rect[]=[];
  for(const group of [...groups.values()].sort((a,b)=>b.at(-1)!.order-a.at(-1)!.order)){
    if(!group.some(b=>view.contains(b.owner.x,b.owner.y)))continue;
    const cards=group.map(b=>{const scale=Math.min(Math.max(1,1.8/z),(camera.width-24)/(b.width*z));return{b,scale,w:b.width*scale*z,h:(b.height+5)*scale*z};});
    let total=cards.reduce((sum,c)=>sum+c.h+8,0)-8;
    while(cards.length>1&&total>camera.height-20){const c=cards.shift()!;total-=c.h+8;}
    if(total>camera.height-20)continue;
    const w=Math.max(...cards.map(c=>c.w)),anchor=group.at(-1)!.owner;
    const x=(anchor.x-view.left)*z-w/2,y=(anchor.y-44-view.top)*z-total;
    const block=placeSpeechBlock({x,y,width:w,height:total},placed,camera.width,camera.height);if(!block)continue;
    placed.push(block);let top=block.y;
    for(const c of cards){
      c.b.box.setVisible(true).setScale(c.scale).setAlpha(1);
      c.b.box.setPosition(view.left+(block.x+block.width/2)/z,view.top+(top+c.b.height*c.scale*z)/z);
      top+=c.h+8;
    }
  }
}

/** Foreground speech consumes clicks before agents, stations or room navigation underneath. */
export function speechAt(scene:Phaser.Scene,x:number,y:number){
  return [...(scenes.get(scene)??[])].reverse().find(b=>b.box.scene&&b.box.visible&&x>=b.box.x-b.width*b.box.scaleX/2&&x<=b.box.x+b.width*b.box.scaleX/2&&y>=b.box.y-b.height*b.box.scaleY&&y<=b.box.y+5*b.box.scaleY);
}
