import { create } from 'zustand';
import type { Approval, Conversation, Plan, Run, RunLogEntry, SessionInfo } from '../types';
import { useManagers } from './managersStore';
import { getJson, postJson } from '../services/api';
import type { TaskEvent } from '../services/agentAdapter';

const MAX_LOG = 80;
const ACTIVE = new Set(['starting', 'running', 'cancelling']);

interface TasksState {
  plans: Record<string, Plan>;
  runs: Record<string, Run>;
  approvals: Record<string, Approval>;
  logs: Record<string, RunLogEntry[]>;
  routing: Record<string, boolean>;
  errors: Record<string, string>;
  drafts: Record<string, string>;
  setTaskState(s: { plans: Plan[]; runs: Run[]; approvals: Approval[] }): void;
  applyTaskEvent(e: TaskEvent): void;
  setDraft(roomId: string, text: string): void;
  route(roomId: string, text: string): Promise<void>;
  run(planId: string, roomId: string): Promise<void>;
  cancel(runId: string, roomId: string): Promise<void>;
  decide(id: string, allow: boolean, roomId: string): Promise<void>;
}

const byId = <T extends { id: string }>(list: T[]) => Object.fromEntries(list.map((x) => [x.id, x]));

export const useTasks = create<TasksState>((set, get) => ({
  plans: {}, runs: {}, approvals: {}, logs: {}, routing: {}, errors: {}, drafts: {},

  setTaskState: (s) => set({ plans: byId(s.plans), runs: byId(s.runs), approvals: byId(s.approvals) }),

  applyTaskEvent(e) {
    set((st) => {
      switch (e.type) {
        case 'plan': return { plans: { ...st.plans, [e.payload.id]: e.payload } };
        case 'run': {
          const runs = { ...st.runs, [e.payload.id]: e.payload };
          // a finished run has no pending approvals any more
          const approvals = ACTIVE.has(e.payload.state) ? st.approvals : Object.fromEntries(Object.entries(st.approvals).filter(([, a]) => a.runId !== e.payload.id));
          return { runs, approvals };
        }
        case 'run-log': {
          const list = [...(st.logs[e.payload.runId] ?? []), e.payload].slice(-MAX_LOG);
          return { logs: { ...st.logs, [e.payload.runId]: list } };
        }
        case 'run-station': return {};
        case 'approval': return { approvals: { ...st.approvals, [e.payload.id]: e.payload } };
        case 'approval-resolved': {
          const { [e.payload.id]: _gone, ...rest } = st.approvals;
          return { approvals: rest };
        }
      }
    });
  },

  setDraft: (roomId, text) => set((st) => ({ drafts: { ...st.drafts, [roomId]: text } })),

  async route(roomId, text) {
    set((st) => ({ routing: { ...st.routing, [roomId]: true }, errors: { ...st.errors, [roomId]: '' } }));
    try {
      const plan = await postJson<Plan>(`/api/rooms/${roomId}/route`, { text, provider: useManagers.getState().provider });
      set((st) => ({ plans: { ...st.plans, [plan.id]: plan } }));
    } catch (err) {
      set((st) => ({ errors: { ...st.errors, [roomId]: (err as Error).message } }));
    } finally {
      set((st) => ({ routing: { ...st.routing, [roomId]: false } }));
    }
  },
  async run(planId, roomId) {
    set((st) => ({ errors: { ...st.errors, [roomId]: '' } }));
    try {
      const run = await postJson<Run>(`/api/plans/${planId}/run`);
      set((st) => ({ runs: { ...st.runs, [run.id]: run } }));
    } catch (err) {
      set((st) => ({ errors: { ...st.errors, [roomId]: (err as Error).message } }));
    }
  },
  async cancel(runId, roomId) {
    try {
      await postJson(`/api/runs/${runId}/cancel`);
    } catch (err) {
      set((st) => ({ errors: { ...st.errors, [roomId]: (err as Error).message } }));
    }
  },
  async decide(id, allow, roomId) {
    try {
      await postJson(`/api/approvals/${id}`, { decision: allow ? 'allow' : 'deny' });
      get();
    } catch (err) {
      set((st) => ({ errors: { ...st.errors, [roomId]: (err as Error).message } }));
    }
  },
}));

// ---------- selectors ----------

export const plansOf = (s: Pick<TasksState, 'plans'>, roomId: string) => Object.values(s.plans).filter((p) => p.roomId === roomId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
export const runsOf = (s: Pick<TasksState, 'runs'>, roomId: string) => Object.values(s.runs).filter((r) => r.roomId === roomId).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
export const activeRunOf = (s: Pick<TasksState, 'runs'>, roomId: string) => runsOf(s, roomId).find((r) => ACTIVE.has(r.state)) ?? null;
export const approvalsOf = (s: Pick<TasksState, 'approvals'>, roomId: string) => Object.values(s.approvals).filter((a) => a.roomId === roomId);

export const fetchSessions = (roomId: string) => getJson<SessionInfo[]>(`/api/rooms/${roomId}/sessions`);
export const fetchConversation = (roomId: string, id: string) => getJson<Conversation>(`/api/rooms/${roomId}/sessions/${encodeURIComponent(id)}`);
