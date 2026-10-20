import { create } from 'zustand';
import { getJson, postJson } from '../services/api';
import type { DispatchResult, ManagerCliEntry, ManagerMessage } from '../types';
import { useOffice } from './officeStore';

export interface ManagerThread {
  messages: ManagerMessage[];
  last: DispatchResult | null;
  error: string | null;
}
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
    set({ provider, threads: {} });
  },
  busy: false,
  busyManagerId: null,
  threads: {},
  terminal: [],
  applyTerminal(entry) { set((s) => ({ terminal: mergeEntries([...s.terminal, entry]) })); },
  async loadTerminal(managerId) {
    const provider = get().provider;
    const r = await getJson<{ entries: ManagerCliEntry[] }>(`/api/managers/${encodeURIComponent(managerId)}/terminal?provider=${provider}`);
    set((s) => ({ terminal: mergeEntries([...s.terminal, ...r.entries]) }));
  },
  async dispatch(text, managerId = 'manager:master', options = {}) {
    if (get().busy) return null;
    const { provider } = get();
    const thread = get().threads[managerId] ?? EMPTY_THREAD;
    const push = (role: ManagerMessage['role'], text: string) => set((s) => {
      const t = s.threads[managerId] ?? EMPTY_THREAD;
      return { threads: { ...s.threads, [managerId]: { ...t, messages: [...t.messages, { role, text, at: new Date().toISOString() }].slice(-40) } } };
    });
    set({ busy: true, busyManagerId: managerId });
    set((s) => ({ threads: { ...s.threads, [managerId]: { ...thread, error: null } } }));
    push('user', text);
    try {
      const r = await postJson<DispatchResult>('/api/dispatch', { text, provider, managerId, ...options, clarificationId: thread.last?.clarification?.id });
      const reply = r.clarification?.question ?? (r.plan ? r.plan.plan.summary : `${r.route.at(-1)?.target ?? 'İlgili'} ofisini buldum. ${r.route.at(-1)?.reason ?? ''}`);
      push('assistant', reply);
      set((s) => ({ threads: { ...s.threads, [managerId]: { ...s.threads[managerId]!, last: r } } }));
      if (options.targetId && r.go) useOffice.getState().enterRoom(r.go.roomId);
      return r;
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Yöneticiye ulaşılamadı.';
      push('error', error);
      set((s) => ({ threads: { ...s.threads, [managerId]: { ...s.threads[managerId]!, error } } }));
      return null;
    } finally { set({ busy: false, busyManagerId: null }); }
  },
  clear(managerId = 'manager:master') {
    if (get().busyManagerId === managerId) return;
    set((s) => ({ threads: { ...s.threads, [managerId]: EMPTY_THREAD } }));
  },
}));
