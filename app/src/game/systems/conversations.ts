import type { Point } from '../constants';
import type { DialogueSource } from '../../services/dialogues';
export interface Exchange { text: string; reply?: string; followUp?: string; answer?: string; source?: DialogueSource; concept?: string }
export interface Participant { id: string; pos: Point; busy: boolean }
export interface ConversationTranscript { id: string; a: string; b: string; turns: { speakerId: string; text: string }[]; active: boolean; source?: DialogueSource }
interface Conversation { id: string; a: string; b: string; lines: string[]; nextAt: number; index: number; source?: DialogueSource; concept?: string }
export interface Speech { id: string; text: string; duration: number; source?: DialogueSource; concept?: string }

/** Four timed turns, physical proximity, and interruption; no model calls or fabricated work. */
export class ConversationDirector {
  private conversations: Conversation[] = [];
  private sequence = 0;
  private history: ConversationTranscript[] = [];
  private cooldown = new Map<string, number>();
  constructor(private readonly capacity = 2, private readonly wallNow = Date.now) {}
  holds(id: string) { return this.conversations.some(c => c.a === id || c.b === id); }
  partner(id: string) { const c=this.conversations.find(c=>c.a===id||c.b===id);return c ? c.a===id?c.b:c.a : null; }
  canStart(a: Participant, b: Participant, now: number) {
    return a.id !== b.id && !a.busy && !b.busy && Math.hypot(a.pos.x-b.pos.x,a.pos.y-b.pos.y) <= 3 &&
      this.conversations.length < this.capacity && !this.holds(a.id) && !this.holds(b.id) &&
      now >= (this.cooldown.get(a.id) ?? 0) && now >= (this.cooldown.get(b.id) ?? 0);
  }
  start(a: Participant, b: Participant, exchange: Exchange, now: number) {
    if (!this.canStart(a,b,now)) return false;
    const lines = [exchange.text,exchange.reply,exchange.followUp,exchange.answer].filter((v): v is string => !!v);
    if (lines.length < 2) return false;
    const id = `conversation:${++this.sequence}`;
    this.history.push({id,a:a.id,b:b.id,turns:[],active:true,source:exchange.source});
    if(this.history.length>20)this.history.shift();
    this.conversations.push({id,a:a.id,b:b.id,lines,index:0,nextAt:now,source:exchange.source,concept:exchange.concept});
    return true;
  }
  tick(now: number, actors: Map<string, Participant>) {
    const speeches: Speech[] = [], ended: string[] = [];
    this.conversations = this.conversations.filter(c => {
      const a=actors.get(c.a),b=actors.get(c.b);
      const invalid=!a || !b || a.busy || b.busy || Math.hypot(a.pos.x-b.pos.x,a.pos.y-b.pos.y)>3 || !!c.source && c.source.expiresAt <= this.wallNow();
      if (invalid || c.index >= c.lines.length && now >= c.nextAt) {
        const record=this.history.find(h=>h.id===c.id);if(record)record.active=false;
        for (const id of [c.a,c.b]) { this.cooldown.set(id,now+60_000);ended.push(id); }
        return false;
      }
      if (now >= c.nextAt) {
        const text=c.lines[c.index]!,duration=Math.max(2200,Math.min(5000,1000+text.length*45));
        speeches.push({id:c.index%2===0?c.a:c.b,text,duration,source:c.source,concept:c.concept});
        this.history.find(h=>h.id===c.id)?.turns.push({speakerId:c.index%2===0?c.a:c.b,text});
        c.index++;c.nextAt=now+duration;
      }
      return true;
    });
    if(this.cooldown.size>300)for(const [id,at]of this.cooldown)if(now>=at)this.cooldown.delete(id);
    return {speeches,ended};
  }
  transcriptFor(id: string) { return this.history.findLast(h=>h.a===id||h.b===id); }
  clear() {this.conversations=[];this.cooldown.clear();this.history=[];}
  debug() {return this.conversations.map(c=>({a:c.a,b:c.b,turn:c.index,total:c.lines.length}));}
}
