// Plain-data drink and washing choreography; cups stay attached to hands or real surfaces.
(function(){
 'use strict';
 const L=window.OfficeLayout,S=L.ENTITY_SCALE??1.5,colors=['#df7181','#80b9db','#eee5cf','#c9a65e','#87b59c'];
 class Kitchen {
  constructor(life){this.life=life;this.v=life.view;this.drinks={};this.clean=null;this.stored=[];this.v.kitchen=this;}
  reserved(id){return !!this.drinks[id]&&this.drinks[id].phase!=='drinking'||this.clean?.id===id;}
  schedule(delay,step,id){this.v.schedule(delay,{type:'kitchen-step',step,id});}
  move(id,to,kind){const v=this.v,cur=v.walkerOf(id),from=cur?v.walkPos(cur):null;if(cur)v.walks[id]={};return v.walkTo(id,to,{from,backToDesk:true,hold:true,pose:'stand',kind,act:{type:'kitchen-walk',kind}});}
  drink(free,kind){const a=free.find(a=>!this.drinks[a.id]);if(!a||Object.values(this.drinks).some(d=>d.kind===kind&&['fetch','fill','pickup'].includes(d.phase)))return false;const v=this.v,id=a.id;this.drinks[id]={id,kind,vessel:kind==='coffee'?'mug':Math.random()<.5?'glass':'mug',tone:Math.floor(Math.random()*colors.length),phase:'fetch',at:v.t,fill:1};if(!this.move(id,kind==='coffee'?L.SPOTS.coffee:{x:L.CL.x+L.CL.w+13,y:L.CL.y+55},'drink')){delete this.drinks[id];return false;}this.life.busy++;return true;}
  startClean(free){if(this.clean||this.v.dishes.length<L.DISH_LIMIT||!free.length)return false;this.clean={id:free[0].id,phase:'tap-on',at:this.v.t,water:false,item:null};this.life.cleaning=true;this.life.busy++;if(!this.move(this.clean.id,this.sink(),'clean')){this.clean=null;this.life.cleaning=false;this.life.busy--;return false;}return true;}
  sink(){return {x:L.VCOUNTER.x+L.VCOUNTER.w+11,y:L.VCOUNTER.y+86};}
  phase(record,phase){record.phase=phase;record.at=this.v.t;}
  onWalk(id,event,act){const v=this.v;
   if(act.kind==='drink'){const d=this.drinks[id];if(!d)return;
    if(event==='arrive'){if(d.phase==='fetch'){this.phase(d,'fill');v.fx[d.kind==='coffee'?'coffee':'cooler']={t0:v.t,night:v.darkness()>=.3};this.schedule(2.2,'pickup',id);}else if(d.phase==='return'){this.phase(d,'deposit');const slots=new Set(v.dishes.map(x=>x.slot)),slot=[...Array(L.DISH_MAX).keys()].find(x=>!slots.has(x));if(slot===undefined){this.schedule(10,'retry-return',id);return;}d.dirtySlot=slot;v.dishes.push({kind:d.vessel,slot,tone:d.tone,born:v.t,held:true});this.schedule(1,'deposit-done',id);}}
    else if(d.phase==='carry-home'){this.life.busy=Math.max(0,this.life.busy-1);this.phase(d,'place');this.schedule(1,'seated',id);}
    else if(['fetch','fill','pickup'].includes(d.phase)){this.life.busy=Math.max(0,this.life.busy-1);this.phase(d,'place');this.schedule(1,'seated',id);}
    else if(d.phase==='deposited'){delete this.drinks[id];this.life.busy=Math.max(0,this.life.busy-1);}
   }else{const c=this.clean;if(!c||c.id!==id)return;if(event!=='arrive'){if(c.item){const dish=v.dishes.find(x=>x.slot===c.item.slot);if(dish)dish.held=false;}this.clean=null;this.life.cleaning=false;this.life.busy=Math.max(0,this.life.busy-1);return;}
    this.schedule(c.phase==='wash'?2.4:.9,c.phase,id);
   }
  }
  nextDirty(){const c=this.clean,v=this.v;const dish=v.dishes.find(d=>!d.held);if(!dish){this.phase(c,'tap-off');this.move(c.id,this.sink(),'clean');return;}c.item={...dish};this.phase(c,'reach');this.move(c.id,L.SPOTS.dishes,'clean');}
  onSched(act){const v=this.v,id=act.id,d=this.drinks[id],c=this.clean;
   if(d){switch(act.step){
    case 'pickup':if(d.phase!=='fill')return;this.phase(d,'pickup');this.schedule(.8,'carry-home',id);return;
    case 'carry-home':if(d.phase!=='pickup')return;this.phase(d,'carry-home');v.release(id);return;
    case 'seated':if(d.phase!=='place')return;this.phase(d,'drinking');d.started=v.t;d.until=v.t+120+Math.random()*120;this.schedule(12,'sip',id);return;
    case 'sip':if(d.phase!=='drinking')return;if(v.t>=d.until){this.schedule(0,'finish',id);return;}if(!v.pinned.has(id)&&!v.isAway(id)&&v.st[id]?.status==='idle'){this.phase(d,'sip');this.schedule(2.4,'sip-done',id);}else this.schedule(12,'sip',id);return;
    case 'sip-done':d.fill=Math.max(0,(d.until-v.t)/(d.until-d.started));this.phase(d,'drinking');this.schedule(12+Math.random()*10,'sip',id);return;
    case 'finish':if(v.pinned.has(id)||v.isAway(id)||v.st[id]?.status!=='idle'){this.schedule(10,'finish',id);return;}this.phase(d,'collect');d.fill=0;this.schedule(.9,'return',id);return;
    case 'return':this.phase(d,'return');this.move(id,L.SPOTS.dishes,'drink');this.life.busy++;return;
    case 'retry-return':if(d.dirtySlot===undefined){this.phase(d,'return');this.onWalk(id,'arrive',{kind:'drink'});}return;
    case 'deposit-done':{const dish=v.dishes.find(x=>x.slot===d.dirtySlot);if(dish)dish.held=false;this.phase(d,'deposited');v.release(id);return;}
   }}
   if(!c||c.id!==id)return;
   switch(act.step){
    case 'tap-on':c.water=true;this.nextDirty();break;
    case 'reach':{const dish=v.dishes.find(x=>x.slot===c.item?.slot);if(!dish){this.nextDirty();break;}dish.held=true;this.phase(c,'lift');this.schedule(.9,'to-sink',id);break;}
    case 'to-sink':this.phase(c,'wash');this.move(id,this.sink(),'clean');break;
    case 'wash':this.phase(c,'rinse');this.schedule(1.5,'rinse',id);break;
    case 'rinse':this.phase(c,'dry');this.schedule(1.1,'dry',id);break;
    case 'dry':this.phase(c,'store');this.move(id,{x:L.VCOUNTER.x+L.VCOUNTER.w+14,y:L.VCOUNTER.y+112},'clean');break;
    case 'store':v.dishes=v.dishes.filter(x=>x.slot!==c.item?.slot);this.stored.push({...c.item,clean:true});this.stored=this.stored.slice(-6);c.item=null;this.nextDirty();break;
    case 'tap-off':c.water=false;this.phase(c,'done');v.release(id);break;
   }
  }
  snapshot(){return {drinks:this.drinks,clean:this.clean,stored:this.stored};}
  restore(s){this.drinks=s?.drinks??{};this.clean=s?.clean??null;this.stored=s?.stored??[];}
  cup(item,x,y,fill=0){const v=this.v;v.scaled(x,y,()=>this.cupPixels(item,x,y,fill),S);}
  cupPixels(item,x,y,fill=0){const v=this.v,col=colors[(item.tone??0)%colors.length];if(item.vessel==='glass'||item.kind==='glass'){v.P(x,y-5,4,6,'#b5dbe3');v.P(x+1,y-4,2,4,'#42616d');if(fill>0)v.P(x+1,y-Math.ceil(fill*4),2,Math.ceil(fill*4),'#85d4e8');v.P(x,y-5,1,5,'#e4f9ff');}else if(item.kind==='plate'){v.P(x-1,y-1,8,2,'#ede9d9');}else{v.P(x,y-4,5,5,col);v.P(x+1,y-4,3,1,fill>0?(item.kind==='water'?'#85d4e8':'#6a4b31'):'#cdd6d2');v.P(x+5,y-3,2,3,col);v.P(x+5,y-2,1,1,'#1d3038');}}
  // All drink coordinates use the same left tabletop slot and the same hand grip.
  deskPoint(id){const a=this.v.byId[id];return this.v.ent(a,a.x+1,a.y+5);}
  usesArm(id){const d=this.drinks[id],c=this.clean;return !!(d&&!['fetch','fill','drinking','deposited'].includes(d.phase)&&!(this.v.isAway(id)&&['sip','place','collect'].includes(d.phase))||c?.id===id&&c.item&&['lift','wash','rinse','dry','store'].includes(c.phase));}
  arm(id,shoulder,cup,pose){
   const v=this.v,K=window.PixelKit,a=v.byId[id];
   const dy=cup.y-S-shoulder.y;
   pose??=dy < -S ? 'sip' : dy < 3*S ? 'reach' : 'carry';
   const image=v.spr(`${id}:drink-arm:${pose}`,()=>K.drinkArm(a.look,pose)),grip=K.DRINK_GRIPS[pose];
   v.scaled(shoulder.x,shoulder.y,()=>v.blit(image,shoulder.x-8,shoulder.y-5),S);
   return {x:shoulder.x+grip.x*S,y:shoulder.y+grip.y*S};
  }
  heldCup(id,shoulder,point,item,fill,reach=point,detached=false,pose){
   const wrist=this.arm(id,shoulder,reach,pose),socket={x:wrist.x-5*S,y:wrist.y+S};
   const position=detached?point:socket;
   this.cup(item,position.x,position.y,fill);
   this.v.P(wrist.x-S/2,wrist.y-S/2,1.5*S,1.5*S,this.v.byId[id].look.skin);
  }

  drawBase(){const v=this.v,c=this.clean;for(const d of Object.values(this.drinks))if(d.phase==='fill'){const x=d.kind==='coffee'?L.COFFEE.x+10:L.CL.x+8,y=d.kind==='coffee'?L.COFFEE.y+22:L.CL.y+35;this.cup(d,x,y,Math.min(1,(v.t-d.at)/2.2));}if(c?.water){const x=L.VCOUNTER.x+20,y=L.VCOUNTER.y+60;v.P(x,y,1,19,'#9ce4f2');for(let i=0;i<4;i++)v.P(x-3+(i%3)*2,y+17+Math.sin(v.t*9+i)*2,1,1,'#d9ffff');}for(const [i,d]of this.stored.entries())this.cup(d,L.VCOUNTER.x+6+(i%2)*9,L.VCOUNTER.y+106+Math.floor(i/2)*7);}
  drawDesk(id){const d=this.drinks[id],v=this.v;if(d&&(d.phase==='drinking'||v.isAway(id)&&['sip','place'].includes(d.phase))){const p=this.deskPoint(id);this.cup(d,p.x,p.y,d.fill);}}
  drawActor(id){
   const v=this.v,a=v.byId[id];if(!a)return;
   const walk=v.walkerOf(id),p=walk?v.walkPos(walk):null,record=this.drinks[id],d=record?.phase==='drinking'||record&&walk&&['sip','place','collect'].includes(record.phase)?null:record,c=this.clean?.id===id?this.clean:null;
   const lift=p?.moving&&Math.floor(v.t*8)%2?S:0,breathe=Math.floor(v.t*1.2+v.st[id].seed)%2?1:0;
   const shoulder=p?{x:Math.round(p.x)-5*S,y:Math.round(p.y)-13*S-lift}:v.ent(a,v.seatX(a)-5,a.y+4+breathe);
   const hand=p?{x:Math.round(p.x)-13*S,y:Math.round(p.y)-10*S-lift}:v.ent(a,v.seatX(a)-12,a.y+5);
   const mix=(from,to,q)=>{q=Math.max(0,Math.min(1,q));q=q*q*(3-2*q);return {x:from.x+(to.x-from.x)*q,y:from.y+(to.y-from.y)*q};};
   if(d){const desk=this.deskPoint(id),mouth=v.ent(a,v.seatX(a)-8,a.y-1),q=(v.t-d.at)/.8;let point=hand,reach,detached=false;
    if(['place','sip','collect'].includes(d.phase)){
     if(d.phase==='place'){reach=mix(hand,desk,Math.min(q/.55,1));point=q>=.55?desk:reach;detached=q>=.55;}
     if(d.phase==='collect'){reach=mix(hand,desk,Math.min(q/.45,1));point=q<.45?desk:mix(desk,hand,(q-.45)/.55);if(q>=.45)reach=point;detached=q<.45;}
     if(d.phase==='sip'){const age=v.t-d.at,k=Math.min((age-.2)/.5,(2.2-age)/.5,1);point=mix(desk,mouth,k);if(age<.2){reach=mix(hand,desk,age/.2);detached=true;}else if(age>2.2){reach=mix(desk,hand,(age-2.2)/.2);detached=true;}}
    }else if(['fill','fetch','deposited'].includes(d.phase))return;
    else if(d.phase==='pickup'){const src=d.kind==='coffee'?{x:L.COFFEE.x+10,y:L.COFFEE.y+22}:{x:L.CL.x+8,y:L.CL.y+35};point=mix(src,hand,(q-.3)/.7);if(q<.3){reach=mix(hand,src,q/.3);detached=true;}}
    else if(d.phase==='deposit'){if(d.dirtySlot===undefined)return;const slot=v.dishSlot(d.dirtySlot);reach=mix(hand,slot,Math.min(q/.65,1));point=q>=.65?slot:reach;detached=q>=.65;}
    this.heldCup(id,shoulder,point,d,d.fill,reach,detached);
   }
   if(c?.item&&['lift','wash','rinse','dry','store'].includes(c.phase)){
    let point=hand;const age=v.t-c.at;
    if(c.phase==='lift')point=mix(v.dishSlot(c.item.slot),hand,age/.9);
    if(['wash','rinse','dry'].includes(c.phase)&&!p?.moving){point={x:L.VCOUNTER.x+19+Math.sin(v.t*12)*(c.phase==='wash'?2:0),y:L.VCOUNTER.y+78};if(c.phase==='wash')for(let i=0;i<5;i++)v.P(point.x-3+((i*7)%10),point.y-3-Math.sin(v.t*5+i)*3,2,1,'#d8f7f7');}
    const pose=['wash','rinse','dry'].includes(c.phase)&&!p?.moving?'wash'+(Math.floor(v.t*5)%2):'carry';
    this.heldCup(id,shoulder,point,c.item,0,point,false,pose);
   }
  }

 }
 window.OfficeKitchen={Kitchen,colors};
})();
