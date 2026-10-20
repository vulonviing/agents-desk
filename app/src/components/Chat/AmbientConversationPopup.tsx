import { useEffect, useRef } from 'react';
import { useOffice } from '../../stores/officeStore';
import { gameApi } from '../../game/gameApi';
import { useAmbientConversation } from '../../stores/ambientConversationStore';

export function AmbientConversationPopup() {
  const conversation = useAmbientConversation(s=>s.conversation);
  const close = useAmbientConversation(s=>s.close);
  const end = useRef<HTMLDivElement>(null);
  const popup = useRef<HTMLElement>(null);
  useEffect(()=>{end.current?.scrollIntoView({block:'nearest'});},[conversation?.turns.length]);
  useEffect(()=>{
    if(!conversation)return;
    const dismiss=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.stopPropagation();close();}};
    const outside=(e:PointerEvent)=>{if(popup.current&&!popup.current.contains(e.target as Node))close();};
    document.addEventListener('keydown',dismiss);document.addEventListener('pointerdown',outside);
    return()=>{document.removeEventListener('keydown',dismiss);document.removeEventListener('pointerdown',outside);};
  },[conversation?.id,close]);
  if(!conversation)return null;
  const name=(id:string)=>conversation.participants.find(p=>p.id===id)?.name??'Sim';
  // next to the speakers: right of them when there is room, else left; kept inside the viewport
  const W = Math.min(360, window.innerWidth - 24), H = Math.min(420, window.innerHeight * 0.65), a = conversation.anchor;
  const style = a ? {
    left: Math.max(12, Math.min(window.innerWidth - W - 12, a.x + 40 + W > window.innerWidth ? a.x - 40 - W : a.x + 40)),
    top: Math.max(12, Math.min(window.innerHeight - H - 12, a.y - H / 2)),
    bottom: 'auto', transform: 'none',
  } as const : undefined;
  return <section ref={popup} className="ambient-conversation" style={style} role="dialog" aria-label="Simlerin konuşması">
    <header><strong>{conversation.participants.map(p=>p.name).join(' · ')}</strong><button type="button" onClick={close} aria-label="Konuşmayı kapat">✕</button></header>
    <div className="ambient-turns" aria-live="polite" aria-relevant="additions">
      {conversation.turns.map((turn,i)=><div className={`ambient-turn ${turn.speakerId===conversation.participants[1]?.id?'reply':''}`} key={i}><button className="ambient-speaker" title="Sim profilini aç" onClick={()=>{useOffice.getState().selectAgent(turn.speakerId);gameApi.host?.focusAgent(turn.speakerId);close();}}>{name(turn.speakerId)}</button><p>{turn.text}</p></div>)}
      {conversation.active&&<span className="ambient-next">Konuşuyorlar…</span>}
      <div ref={end}/>
    </div>
    {!conversation.source&&conversation.sourceUrl&&<a href={conversation.sourceUrl} target="_blank" rel="noopener noreferrer">Kaynak ↗</a>}
    {conversation.source&&<a href={conversation.source.url} target="_blank" rel="noopener noreferrer">{conversation.source.publisher} · {new Date(conversation.source.publishedAt).toLocaleDateString('tr-TR')} ↗</a>}
  </section>;
}
