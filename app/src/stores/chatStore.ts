import { create } from 'zustand';
import { useManagers } from './managersStore';
import { getJson, postJson } from '../services/api';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'error';
  text: string;
  at: string;
}

interface ChatState {
  byAgent: Record<string, ChatMessage[]>;
  busy: Record<string, boolean>;
  load: (agentId: string) => Promise<void>;
  send: (agentId: string, text: string) => Promise<void>;
  reset: (agentId: string) => Promise<void>;
}

const url = (id: string) => `/api/agents/${encodeURIComponent(id)}/chat`;
const provider = () => useManagers.getState().provider;

export const useChat = create<ChatState>((set, get) => ({
  byAgent: {},
  busy: {},
  async load(id) {
    const cli = provider();
    const key = `${cli}:${id}`;
    try {
      const r = await getJson<{ messages: ChatMessage[]; busy: boolean }>(url(id) + `?provider=${cli}`);
      set((s) => ({ byAgent: { ...s.byAgent, [key]: r.messages }, busy: { ...s.busy, [key]: r.busy } }));
    } catch {
      /* history is optional */
    }
  },
  async send(id, text) {
    const cli = provider();
    const key = `${cli}:${id}`;
    if (get().busy[key]) return;
    const at = new Date().toISOString();
    set((s) => ({ byAgent: { ...s.byAgent, [key]: [...(s.byAgent[key] ?? []), { role: 'user', text, at }] }, busy: { ...s.busy, [key]: true } }));
    try {
      const r = await postJson<{ messages: ChatMessage[] }>(url(id), { message: text, provider: cli });
      set((s) => ({ byAgent: { ...s.byAgent, [key]: r.messages } }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Hata';
      set((s) => ({ byAgent: { ...s.byAgent, [key]: [...(s.byAgent[key] ?? []), { role: 'error', text: msg, at: new Date().toISOString() }] } }));
    } finally {
      set((s) => ({ busy: { ...s.busy, [key]: false } }));
    }
  },
  async reset(id) {
    const cli = provider();
    const key = `${cli}:${id}`;
    if (get().busy[key]) return;
    try {
      await postJson(`${url(id)}/reset`, { provider: cli });
    } catch {
      /* ignore */
    }
    set((s) => ({ byAgent: { ...s.byAgent, [key]: [] } }));
  },
}));
