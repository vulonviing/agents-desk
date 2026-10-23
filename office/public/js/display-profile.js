// The board can toggle distance typography without resetting the office or floor display.
(function(){
 'use strict';
 let enabled=new URLSearchParams(window.location.search).get('display')==='external';
 try{const saved=JSON.parse(localStorage.getItem('desk-session-v2')??'null');if(typeof saved?.view?.displayMode==='boolean')enabled=saved.view.displayMode;}catch{}
 const listeners=new Set();
 function setEnabled(value){
  enabled=!!value;document.documentElement.classList.toggle('external-display',enabled);
  for(const listener of listeners)listener(enabled);
 }
 window.OfficeDisplayProfile=Object.freeze({
  get external(){return enabled;},get textScale(){return enabled?1.5:1;},
  entityScale:1.5,catScale:1.1,setEnabled,
  onChange(listener){listeners.add(listener);return()=>listeners.delete(listener);}
 });
 setEnabled(enabled);
})();
