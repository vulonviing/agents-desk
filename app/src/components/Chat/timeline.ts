import type { Observation } from '../../types';
import type { ChatMessage } from '../../stores/chatStore';
export type TimelineItem = { type: 'message'; message: ChatMessage; key: string } | { type: 'event'; event: Observation; key: string };
/** Merge observations into their real chronological position, keeping one outcome per turn. */
export function chatTimeline(messages: ChatMessage[], events: Observation[]): TimelineItem[] {
  const sorted = [...events].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
  const kept: Observation[] = [];
  for (const event of sorted) {
    if (event.kind === 'completed' || event.kind === 'error') {
      // A Desk answer already communicates this outcome; retain external outcomes without a message.
      const role = event.kind === 'completed' ? 'assistant' : 'error';
      if (messages.some(m=>m.role===role && Math.abs(Date.parse(m.at)-Date.parse(event.at))<5000)) continue;
      const previous = kept.at(-1);
      if (previous?.kind === event.kind && previous.sessionId === event.sessionId &&
        Date.parse(event.at)-Date.parse(previous.at)<3000 &&
        !messages.some(m=>m.role==='user'&&Date.parse(m.at)>Date.parse(previous.at)&&Date.parse(m.at)<=Date.parse(event.at))) continue;
    }
    kept.push(event);
  }
  return [
    ...messages.map((message,i):TimelineItem=>({type:'message',message,key:`message:${message.at}:${i}`})),
    ...kept.map((event):TimelineItem=>({type:'event',event,key:`event:${event.id}`})),
  ].sort((a,b)=>Date.parse(a.type==='message'?a.message.at:a.event.at)-Date.parse(b.type==='message'?b.message.at:b.event.at));
}
