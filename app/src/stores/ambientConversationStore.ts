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
    if (!data || open || get().conversation?.id === data.id) set({conversation:data});
  },
  close:()=>set({conversation:null}),
}));
