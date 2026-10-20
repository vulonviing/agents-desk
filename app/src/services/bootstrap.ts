import { useManagers } from '../stores/managersStore';
import { useOffice } from '../stores/officeStore';
import { useTasks } from '../stores/tasksStore';
import { createAdapter, type AgentAdapter } from './agentAdapter';

// Connects the adapter to the stores once. Everything after this is event driven (no polling).
let adapter: AgentAdapter | null = null;

export function startData(): AgentAdapter {
  if (adapter) return adapter;
  adapter = createAdapter();
  useOffice.getState().setDemo(adapter.isDemo);
  adapter.start({
    onManagerCli: (e) => useManagers.getState().applyTerminal(e),
    onProjects: (p) => useOffice.getState().setProjects(p),
    onSnapshot: (s) => useOffice.getState().applyOffice(s),
    onConnection: (c) => useOffice.getState().setConnection(c),
    onTask: (e) => useTasks.getState().applyTaskEvent(e),
    onTaskState: (s) => useTasks.getState().setTaskState(s),
  });
  return adapter;
}

export const getAdapter = () => adapter;
