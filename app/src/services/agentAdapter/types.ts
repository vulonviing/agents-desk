import type { Approval, ConnectionState, OfficeSnapshot, Plan, Projects, Run, RunLogEntry } from '../../types';

// Where agent data comes from. The live adapter talks to the desk server; the mock adapter is a separate,
// clearly labelled demo provider. Both feed the same store, nothing else in the app knows the difference.

export type TaskEvent =
  | { type: 'plan'; payload: Plan }
  | { type: 'run'; payload: Run }
  | { type: 'run-log'; payload: RunLogEntry }
  | { type: 'run-station'; payload: { runId: string; roomId: string; stationId: string } }
  | { type: 'approval'; payload: Approval }
  | { type: 'approval-resolved'; payload: { id: string } };

export interface AdapterHandlers {
  onManagerCli?(entry: import('../../types').ManagerCliEntry): void;
  onProjects(projects: Projects): void;
  onSnapshot(snapshot: OfficeSnapshot): void;
  onConnection(state: ConnectionState): void;
  onTask(event: TaskEvent): void;
  /** full task state after a (re)connect */
  onTaskState(state: { plans: Plan[]; runs: Run[]; approvals: Approval[] }): void;
}

export interface AgentAdapter {
  readonly isDemo: boolean;
  start(handlers: AdapterHandlers): void;
  stop(): void;
  /** re-read the projects (after "Yeniden tara") */
  refreshProjects(): Promise<void>;
}
