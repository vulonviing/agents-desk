import type { Approval, OfficeSnapshot, Plan, Projects, Run } from '../../types';
import { getJson, postJson } from '../api';
import { refreshLoadedPool } from '../dialogues';
import type { AdapterHandlers, AgentAdapter } from './types';

// Live data from the desk server: projects over REST, everything that changes over one server-sent-events
// stream (no polling). EventSource reconnects by itself; we only report the state and reload on reconnect.
export function createLiveAdapter(): AgentAdapter {
  let es: EventSource | null = null;
  let handlers: AdapterHandlers | null = null;
  let stopped = false;
  let everOpen = false;

  const loadProjects = async () => {
    handlers?.onProjects(await getJson<Projects>('/api/projects'));
  };
  const loadTaskState = async () => {
    const st = await getJson<{ plans: Plan[]; runs: Run[]; approvals: Approval[] }>('/api/state');
    handlers?.onTaskState(st);
  };
  const on = <T,>(name: string, fn: (data: T) => void) => es!.addEventListener(name, (e) => fn(JSON.parse((e as MessageEvent<string>).data) as T));

  function connect() {
    if (stopped) return;
    es = new EventSource('/api/events');
    es.addEventListener('open', () => {
      everOpen = true;
      handlers?.onConnection('live');
      void loadProjects().catch(() => {});
      void loadTaskState().catch(() => {});
    });
    es.addEventListener('error', () => {
      // EventSource retries on its own while readyState is CONNECTING; CLOSED means the browser gave up
      handlers?.onConnection(es?.readyState === EventSource.CLOSED ? 'offline' : everOpen ? 'reconnecting' : 'connecting');
      if (es?.readyState === EventSource.CLOSED && !stopped) setTimeout(() => { es?.close(); connect(); }, 3000);
    });
    on<import('../../types').ManagerCliEntry>('manager-cli', (e) => handlers?.onManagerCli?.(e));
    on<{scope:string}>('dialogues', ({scope}) => { void refreshLoadedPool(scope); });
    on<Projects>('projects', (p) => handlers?.onProjects(p));
    on<OfficeSnapshot>('office', (s) => handlers?.onSnapshot(s));
    on<Plan>('plan', (payload) => handlers?.onTask({ type: 'plan', payload }));
    on<Run>('run', (payload) => handlers?.onTask({ type: 'run', payload }));
    on<never>('run-log', (payload) => handlers?.onTask({ type: 'run-log', payload }));
    on<never>('run-station', (payload) => handlers?.onTask({ type: 'run-station', payload }));
    on<Approval>('approval', (payload) => handlers?.onTask({ type: 'approval', payload }));
    on<{ id: string }>('approval-resolved', (payload) => handlers?.onTask({ type: 'approval-resolved', payload }));
  }

  return {
    isDemo: false,
    start(h) {
      handlers = h;
      stopped = false;
      h.onConnection('connecting');
      connect();
    },
    stop() {
      stopped = true;
      es?.close();
      es = null;
      handlers = null;
    },
    async refreshProjects() {
      handlers?.onProjects(await postJson<Projects>('/api/rescan'));
    },
  };
}
