// Shared character-anchored, draggable desk windows. Coordinates are viewport CSS pixels.
(function(){
 'use strict';
 function attach(panel,{view,agentId}){
  let drag=null,moved=false;
  const header=panel.querySelector('header');panel.classList.add('desk-window');
  const clamp=()=>{
   if(panel.hidden)return;const r=panel.getBoundingClientRect();
   panel.style.left=Math.max(8,Math.min(innerWidth-r.width-8,parseFloat(panel.style.left)||8))+'px';
   panel.style.top=Math.max(8,Math.min(innerHeight-r.height-8,parseFloat(panel.style.top)||8))+'px';
  };
  function position(){
   if(panel.hidden)return;
   if(!moved){
    const a=view.byId[typeof agentId==='function'?agentId():agentId];if(!a||!view.view)return;
    const pos=view.posOf(a.id)??view.ent(a,view.seatX(a),a.y);
    const rect=view.canvas.getBoundingClientRect(),point=view.scr(pos.x,pos.y-15),r=panel.getBoundingClientRect();
    let x=rect.left+point[0]/view.dpr+22,y=rect.top+point[1]/view.dpr-r.height/2;
    if(x+r.width>innerWidth-8)x=rect.left+point[0]/view.dpr-r.width-22;
    panel.style.left=x+'px';panel.style.top=y+'px';
   }
   clamp();
  }
  header.addEventListener('pointerdown',e=>{
   if(e.target.closest('button,a,input,select')||e.button!==0)return;
   const r=panel.getBoundingClientRect();drag={x:e.clientX,y:e.clientY,left:r.left,top:r.top};moved=true;
   header.setPointerCapture(e.pointerId);e.preventDefault();
  });
  header.addEventListener('pointermove',e=>{if(!drag)return;panel.style.left=drag.left+e.clientX-drag.x+'px';panel.style.top=drag.top+e.clientY-drag.y+'px';clamp();});
  const end=()=>{drag=null;};header.addEventListener('pointerup',end);header.addEventListener('pointercancel',end);header.addEventListener('lostpointercapture',end);
  addEventListener('resize',clamp);
  let previous=0;const loop=t=>{if(t-previous>80){position();previous=t;}requestAnimationFrame(loop);};requestAnimationFrame(loop);
  return {open(){moved=false;position();},snapshot(){return {moved,left:parseFloat(panel.style.left)||8,top:parseFloat(panel.style.top)||8};},restore(s){if(!s)return;moved=!!s.moved;panel.style.left=s.left+'px';panel.style.top=s.top+'px';position();}};
 }
 window.OfficeDeskPopup={attach};
})();
