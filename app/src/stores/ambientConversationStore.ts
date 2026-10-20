import { create } from 'zustand';
import type { AmbientConversation } from '../game/bridge';
interface State {
  conversation: AmbientConversation | null;
  receive(data: AmbientConversation | null, open?: boolean): void;
  close(): void;
}
// Ambient, already-spoken lines only; bounded scene memory, never persisted or sent to a model.
export const useAmbientConversation = create<State>((set,get)=>({
  conversation:null,
  receive(data,open=false) {
    if (!data) { set({conversation:null}); return; }
    const current = get().conversation;
    // later updates of the same thread keep the position it was opened at (sims walk, the popup must not jump)
    if (open) set({conversation:data});
    else if (current?.id === data.id) set({conversation:{...data,anchor:current.anchor}});
  },
  close:()=>set({conversation:null}),
}));
