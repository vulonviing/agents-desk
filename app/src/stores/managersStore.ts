import { create } from 'zustand';
import { getJson, postJson } from '../services/api';
import type { DispatchResult, ManagerCliEntry, ManagerMessage } from '../types';
import { useOffice } from './officeStore';

export interface ManagerThread {
  messages: ManagerMessage[];
  last: DispatchResult | null;
  error: string | null;
}
/** a Master conversation belongs to the CLI that answers it: switching CLI switches thread, nothing is reset */
export const threadKey = (provider: 'claude' | 'codex', managerId: string) => `${provider}:${managerId}`;
export const EMPTY_THREAD: ManagerThread = { messages: [], last: null, error: null };
export interface DispatchOptions { targetId?: string; reconsider?: boolean; }
interface ManagersState {
  provider: 'claude' | 'codex';
  setProvider(p: 'claude' | 'codex'): void;
  busy: boolean;
  busyManagerId: string | null;
  threads: Record<string, ManagerThread>;
  terminal: ManagerCliEntry[];
  loadTerminal(managerId: string): Promise<void>;
  applyTerminal(entry: ManagerCliEntry): void;
  dispatch(text: string, managerId?: string, options?: DispatchOptions): Promise<DispatchResult | null>;
  clear(managerId?: string): void;
}
const mergeEntries = (entries: ManagerCliEntry[]) => [...new Map(entries.map((e) => [e.id, e])).values()].sort((a, b) => a.at.localeCompare(b.at)).slice(-200);
export const useManagers = create<ManagersState>((set, get) => ({
  provider: (() => { try { return localStorage.getItem('desk-cli') === 'codex' ? 'codex' : 'claude'; } catch { return 'claude'; } })(),
  setProvider(provider) {
    if (get().busy) return;
    try { localStorage.setItem('desk-cli', provider); } catch { /* optional preference */ }
    set({ provider });
  },
  busy: false,
  busyManagerId: null,
  threads: {},
  terminal: [],
  applyTerminal(entry) { set((s) => ({ terminal: mergeEntries([...s.terminal, entry]) })); },
  async loadTerminal(managerId) {
    const provider = get().provider;
    const r = await getJson<{ entries: ManagerCliEntry[] }>(`/api/${managerId.startsWith('manager:') ? 'managers' : 'agents'}/${encodeURIComponent(managerId)}/terminal?provider=${provider}`);
    set((s) => ({ terminal: mergeEntries([...s.terminal, ...r.entries]) }));
  },
  async dispatch(text, managerId = 'manager:master', options = {}) {
    if (get().busy) return null;
    const { provider } = get();
    const key = threadKey(provider, managerId);
    const thread = get().threads[key] ?? EMPTY_THREAD;
    const push = (role: ManagerMessage['role'], text: string) => set((s) => {
      const t = s.threads[key] ?? EMPTY_THREAD;
      return { threads: { ...s.threads, [key]: { ...t, messages: [...t.messages, { role, text, at: new Date().toISOString() }].slice(-40) } } };
    });
    set({ busy: true, busyManagerId: managerId });
    set((s) => ({ threads: { ...s.threads, [key]: { ...thread, error: null } } }));
    push('user', text);
    try {
      const r = await postJson<DispatchResult>('/api/dispatch', { text, provider, managerId, ...options, clarificationId: thread.last?.clarification?.id });
      const reply = r.clarification?.question ?? (r.plan ? r.plan.plan.summary : `${r.route.at(-1)?.target ?? 'İlgili'} ofisini buldum. ${r.route.at(-1)?.reason ?? ''}`);
      push('assistant', reply);
      set((s) => ({ threads: { ...s.threads, [key]: { ...s.threads[key]!, last: r } } }));
      if (options.targetId && r.go) useOffice.getState().enterRoom(r.go.roomId);
      return r;
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Yöneticiye ulaşılamadı.';
      push('error', error);
      set((s) => ({ threads: { ...s.threads, [key]: { ...s.threads[key]!, error } } }));
      return null;
    } finally { set({ busy: false, busyManagerId: null }); }
  },
  clear(managerId = 'manager:master') {
    if (get().busyManagerId === managerId) return;
    set((s) => ({ threads: { ...s.threads, [threadKey(s.provider, managerId)]: EMPTY_THREAD } }));
  },
}));
