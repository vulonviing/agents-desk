// Daytime breaks and night companionship uses the existing dialogue library, never a model call per turn.
(function () {
  'use strict';
  const L = window.OfficeLayout, I = window.OfficeI18n;
  class Hearth {
    constructor(life) { this.life = life; this.v = life.view; this.v.fireplace = this; this.scene = null; this.nextAt = 0; this.dayAt = null; this.fallback = 0; }
    lit() { return this.v.darkness() >= .45; }
    available() {
      const v = this.v, life = this.life;
      return !v.pinned.size && !v.pinAnim && !v.cat.control && !life.screenPower && !life.delivery && life.newsSession.status !== 'preparing' && life.newsSession.status !== 'ready' && !life.workflow.current() && v.agents.every(a => v.st[a.id]?.status === 'idle');
    }
    relaxing(id) {
      const person=this.scene?.people.find(p=>p.id===id);
      return !!person && (this.v.t-this.scene.at+person.seat*13)%48<3;
    }
    reserved(id) { return !!this.scene?.people.some(p => p.id === id); }
    seated(id) { return this.reserved(id) && this.v.walkerOf(id)?.phase === 'stay'; }
    petting(id) { return id === this.scene?.petId && this.v.t < this.scene.petUntil && this.v.cat.hearth && ['pet','sleep','knead','groom','look'].includes(this.v.cat.mode); }
    dismiss() {
      if (!this.scene) return;
      const v = this.v;
      for (const p of this.scene.people) {
        const c = v.walkerOf(p.id);
        if(c?.act?.type === 'hearth') {
          // Turn around where the person actually is, even halfway to the hearth.
          const from = v.walkPos(c); c.back = v.nav.path(from,v.side(v.byId[p.id]));
          c.backLen = c.back.slice(1).reduce((n,p,i)=>n+Math.hypot(p.x-c.back[i].x,p.y-c.back[i].y),0);
          c.phase = 'back'; c.t0 = v.t; c.hold = false; c.pose = 'stand';
        }
      }
      v.bubbles = v.bubbles.filter(b => b.act?.type !== 'hearth-bubble');
      window.OfficeCat.hearth(v,false);
      if(this.scene.mode==='break')this.dayAt=v.t+720+Math.random()*480;
      this.scene = null; this.nextAt = v.t + 75;
    }
    tick() {
      const v = this.v, life = this.life;
      if(!this.available()) { this.dismiss(); return false; }
      const mode=this.lit()?'night':'break';
      if(this.scene && (this.scene.mode??'night')!==mode){this.dismiss();return false;}
      if(mode==='break' && !this.scene){
        this.dayAt??=v.t+180+Math.random()*240;
        if(v.t<this.dayAt)return false;
      }
      if(!this.scene) {
        if(document.hidden || v.t < this.nextAt || v.t < life.nextAt || life.busy) return false;
        const free = life.free().slice(0,L.HEARTH.seats.length);
        if(free.length < 2) return false;
        const people = [];
        for(const a of free) {
          const seat = free.length===2 ? people.length*2 : people.length;
          if(v.walkTo(a.id,L.HEARTH.seats[seat],{hold:true,pose:'lounge',kind:'hearth',act:{type:'hearth'}})) people.push({id:a.id,seat});
        }
        if(people.length < 2){for(const p of people)v.release(p.id);return false;}
        this.scene = {people,mode,at:v.t,until:v.t+(mode==='break'?120+Math.random()*60:210),nextTurn:v.t+12,turns:[],index:0,petAt:v.t+18,petUntil:0};
        const a=people[0];v.say(a.id,I.t(mode==='break'?'break.invite':'hearth.invite'),{duration:5,act:{type:'hearth-bubble'}});
        life.nextAt=v.t+25;
      }
      const s=this.scene;
      if(v.t >= s.until || s.people.some(p=>!v.walkerOf(p.id))) {this.dismiss();return false;}
      const seated=s.people.filter(p=>this.seated(p.id));
      if(seated.length < 2) return true;
      window.OfficeCat.hearth(v,true);
      if(v.t >= s.petAt && v.cat.hearth && ['sleep','knead','groom','look','pet'].includes(v.cat.mode)) {
        // The right chair is beside Leya's cushion, within a normal bent arm's reach.
        const person=seated.find(p=>p.seat===2);
        if(person){s.petId=person.id;s.petUntil=v.t+4;window.OfficeCat.poke(v);}
        s.petAt=v.t+38+Math.random()*20;
      }
      if(document.hidden || v.t < s.nextTurn) return true;
      if(s.index >= s.turns.length) {
        if(v.t < life.nextAt) return true;
        const line=life.pools.pick(life.floor,s.mode==='break'?'visit':'fireplace',v.byId[seated[0].id].name) ?? this.fallbackLine();
        if(!line){s.nextTurn=v.t+12;return true;}
        const offset=Math.floor(Math.random()*seated.length), ids=seated.map(p=>p.id);
        s.turns=['text','reply','followUp','answer'].filter(k=>line[k]).map((k,i)=>({id:ids[(offset+i%2)%ids.length],text:line[k]}));
        s.index=0;life.nextAt=v.t+25;
      }
      const turn=s.turns[s.index++];
      if(turn){v.say(turn.id,turn.text,{duration:7,act:{type:'hearth-bubble'}});s.nextTurn=v.t+8;}
      if(s.index >= s.turns.length)s.nextTurn=v.t+25;
      return true;
    }
    fallbackLine() {
      const spoken=this.life.pools.spokenAt;
      for(let i=0;i<3;i++){
        const key=`${this.scene?.mode==='break'?'break':'hearth'}.${this.fallback++%3}`;
        if(Date.now()-(spoken.get(key)??-Infinity)<600000)continue;
        spoken.set(key,Date.now());
        return Object.fromEntries(['text','reply','followUp','answer'].map(k=>[k,I.t(`${key}.${k}`)]));
      }
      return null;
    }
    onWalk(id,event){if(event==='arrive'&&!this.reserved(id))this.v.release(id);}
    snapshot(){return {scene:this.scene,nextAt:this.nextAt,dayAt:this.dayAt,fallback:this.fallback};}
    restore(s){this.scene=s?.scene??null;this.nextAt=s?.nextAt??0;this.dayAt=s?.dayAt??null;this.fallback=s?.fallback??0;}
    drawRug(){
      const v=this.v,P=(...a)=>v.P(...a);
      P(199,345,202,49,'#514048');P(201,347,198,45,'#956b61');P(204,350,192,39,'#735663');
      for(let x=208;x<395;x+=9){P(x,352,4,1,'#b08a75');P(x,386,4,1,'#b08a75');}
      P(339,362,26,10,'#c6a17b');P(341,363,22,7,'#e1c29c');P(343,364,18,1,'#eddbc1');
    }
    entities(ents){
      ents.push({y:350,fn:()=>this.drawStove()});
      for(const [i,p]of L.HEARTH.seats.entries())ents.push({y:p.y-.1,fn:()=>this.drawChair(p,i)});
    }
    drawChair(p,i){this.v.scaled(p.x,p.y,()=>this.drawChairInner(p,i),1.2);}
    drawChairInner(p,i){
      const v=this.v,x=p.x-14,y=p.y-27,P=(...a)=>v.P(...a),col=['#806057','#6a7c75','#806057'][i];
      v.shadow(p.x,p.y+1,16,3,.22);
      P(x+2,y,24,18,'#3c3039');P(x+3,y+1,22,16,col);P(x+5,y+3,18,11,window.PixelKit.tone(col,.15));
      P(x+3,y+15,22,9,col);P(x+5,y+16,18,3,window.PixelKit.tone(col,.25));
      P(x,y+11,4,12,'#4c3b42');P(x+24,y+11,4,12,'#4c3b42');P(x+1,y+11,2,10,col);P(x+25,y+11,2,10,col);
      P(x+4,y+24,3,3,'#352c34');P(x+21,y+24,3,3,'#352c34');
      // A folded wool throw over one arm.
      if(i===1){P(x+23,y+10,6,9,'#c09c73');P(x+24,y+11,1,8,'#e0c69d');}
    }
    drawStove(){
      const v=this.v,x=L.HEARTH.x-18,y=L.HEARTH.y-38,P=(...a)=>v.P(...a);
      v.shadow(x+18,y+41,23,3,.3);
      P(x+13,y-10,10,13,'#36323c');P(x+14,y-10,2,12,'#66616b');P(x+11,y-11,14,2,'#292733');
      P(x-3,y+34,42,8,'#39323c');P(x-2,y+34,40,2,'#8e7a75');
      P(x,y,36,35,'#332c36');P(x+1,y+1,34,32,'#79605a');P(x-2,y-2,40,4,'#bc9a7f');P(x,y-2,36,1,'#d7b99a');
      P(x+5,y+6,26,26,'#42313a');P(x+7,y+7,22,23,'#171d29');P(x+29,y+15,1,6,'#b69c7f');
      P(x+3,y+3,3,27,'#9c7a65');P(x+31,y+3,2,27,'#60494b');
      if(this.lit())this.drawFlame();else{P(x+9,y+26,18,3,'#634435');P(x+12,y+24,13,2,'#84624a');}
      P(x+4,y+36,5,4,'#292731');P(x+27,y+36,5,4,'#292731');
      P(x+40,y+26,14,12,'#504048');P(x+41,y+24,12,11,'#83644f');
      for(let i=0;i<3;i++){P(x+42+i*3,y+26,3,7,'#bb9571');P(x+43+i*3,y+26,1,6,'#6b4d40');}
    }
    drawFlame(){
      const v=this.v,x=L.HEARTH.x-10,y=L.HEARTH.y-14,P=(...a)=>v.P(...a),phase=Math.floor(v.t*4);
      P(x,y+1,20,5,'#9b4533');P(x+1,y+3,17,3,'#e17b3c');
      for(let i=0;i<5;i++){const h=5+((phase+i*7)%4);P(x+1+i*4,y+3-h,3,h,'#e78c40');P(x+2+i*4,y+4-h/2,1,Math.ceil(h/2),'#ffe0a1');}
      P(x,y+6,19,2,'#684534');P(x+3,y+6,9,1,'#c67b41');
    }
    captureLight(){
      if(!this.lit())return;
      // Restore illuminated scene pixels through a feathered mask, including the actual seated sprites.
      // This keeps faces readable at night without a flat orange fog or rectangular sprite cutouts.
      const v=this.v,r=v.buf.width/L.W;
      if(!this.lightCanvas){this.lightCanvas=document.createElement('canvas');this.lightCanvas.width=260*r;this.lightCanvas.height=130*r;}
      const c=this.lightCanvas.getContext('2d');c.setTransform(r,0,0,r,0,0);c.globalCompositeOperation='source-over';c.clearRect(0,0,260,130);
      c.drawImage(v.buf,170*r,270*r,260*r,130*r,0,0,260,130);
      c.globalCompositeOperation='destination-in';const mask=c.createRadialGradient(130,82,2,130,82,120);
      mask.addColorStop(0,'rgba(255,255,255,.78)');mask.addColorStop(.6,'rgba(255,255,255,.58)');mask.addColorStop(1,'rgba(255,255,255,0)');
      c.fillStyle=mask;c.fillRect(0,0,260,130);c.globalCompositeOperation='source-over';
    }
    drawLight(){
      if(!this.lit())return;
      const v=this.v,b=v.b,x=L.HEARTH.x,y=L.HEARTH.y-8;
      b.save();if(this.lightCanvas)b.drawImage(this.lightCanvas,170,270,260,130);b.globalCompositeOperation='lighter';
      const glow=b.createRadialGradient(x,y,2,x,y,99);const flicker=.96+.04*Math.sin(v.t*2.3);
      glow.addColorStop(0,`rgba(255,173,88,${.23*flicker})`);glow.addColorStop(.48,`rgba(239,128,61,${.10*flicker})`);glow.addColorStop(1,'rgba(239,128,61,0)');b.fillStyle=glow;b.fillRect(x-99,y-99,198,198);
      b.globalCompositeOperation='source-over';this.drawFlame();b.restore();
    }
  }
  window.OfficeHearth={Hearth};
})();
