// Shared types: what the desk server sends, and what the game and the UI use.

export type AgentStatus = 'idle' | 'working' | 'thinking' | 'moving' | 'completed' | 'error' | 'offline';
export type Level = 'plan' | 'read-only' | 'approve';
export type Risk = 'readonly' | 'effect' | 'unknown';

export interface Station {
  id: string;
  skill: string | null;
  name: string;
  description: string;
  kind: 'skill' | 'task';
  risk: Risk;
  runsOn: string;
  scripts: string[];
  paths: string[];
  repo: string | null;
  source: string;
}

export interface Embedded {
  id: string;
  name: string;
  path: string;
  skills: { name: string; description: string }[];
  lastCommit: { date: string; subject: string } | null;
}

export interface Room {
  id: string;
  name: string;
  path: string;
  level: Level;
  lastCommit: { date: string; subject: string } | null;
  branch: string | null;
  dirty: number;
  ahead: number | null;
  remote: string | null;
  ageDays: number | null;
  dust: 0 | 1 | 2 | 3;
  lamp: 'active' | 'week' | 'idle' | 'unpushed';
  readmeSummary: string;
  notes: string;
  skills: { name: string; description: string }[];
  triggers: string[];
  stations: Station[];
  embedded: Embedded[];
}

export interface Floor {
  id: string;
  name: string;
  rooms: Room[];
}

export interface Projects {
  generatedAt: string;
  floors: Floor[];
  warnings: string[];
}

export interface RecentStation {
  stationId: string;
  name: string;
  lastAt: string;
  tool: string | null;
  count7d: number;
}

// One office character, as the server describes it. `moving` is decided by the game while it walks.
export interface AgentDTO {
  coordinator?: boolean;
  stationWorker?: boolean;
  sessionId?: string | null;
  sessionProvider?: 'claude' | 'codex' | null;
  sessionMode?: 'ready' | 'observed' | 'desk';
  targetStationId?: string | null;
  id: string;
  roomId: string;
  floorId: string;
  /** 'skill': a skill of the room (named after the skill); 'project': the project's own agent (named after the project) */
  kind: 'skill' | 'project';
  skill: string | null;
  name: string;
  role: string;
  variant: string;
  status: Exclude<AgentStatus, 'moving'>;
  cliActive?: boolean;
  observation?: { provider: 'claude' | 'codex'; tool: string | null; file: string | null; ageSec: number; state: string } | null;
  waiting: boolean;
  currentTask: string | null;
  model: string | null;
  deskId: string | null;
  deskName: string | null;
  lastActivity: string | null;
  recent: RecentStation[];
  level: Level;
}

// The agent as the app uses it (matches the brief's data model, plus what the panel needs).
export interface Agent extends Omit<AgentDTO, 'status' | 'currentTask' | 'model' | 'deskId' | 'lastActivity'> {
  status: AgentStatus;
  currentTask?: string;
  model?: string;
  deskId?: string;
  position: { x: number; y: number };
  lastActivity?: string;
}

export interface LiveSession {
  provider?: 'claude' | 'codex';
  state: 'working' | 'waiting';
  reason: string;
  roomId: string;
  stationId: string | null;
  tool: string | null;
  file: string | null;
  ageSec: number;
  sessions: number;
  model?: string | null;
}

export interface StationActivity {
  lastAt: string | null;
  lastTool: string | null;
  count7d: number;
  byDay: number[];
}

export interface Summary {
  total: number;
  working: number;
  thinking: number;
  idle: number;
  offline: number;
  completed: number;
  error: number;
}

// The sole master routes directly to offices using the selected CLI.
export interface ManagerDTO {
  id: string;
  kind: 'master';
  floorId: string | null;
  name: string;
  role: string;
  variant: string;
  status: 'idle' | 'thinking';
  offices: number;
}

export interface DispatchResult {
  route: { by: string; floorId?: string; roomId?: string; target: string; reason: string }[];
  /** null when the user only asked to be taken to an office */
  plan: Plan | null;
  provider?: 'claude' | 'codex';
  go: { floorId: string; roomId: string } | null;
  clarification?: { id: string; by: string; question: string; options: { id: string; name: string }[] };
}

export interface Observation { sessionId?: string; coordinatorId?: string; id: string; kind: 'activation' | 'handoff'; at: string; roomId: string; provider: 'claude' | 'codex'; from: string | null; to: string; file: string | null; tool: string }

export interface OfficeSnapshot {
  observations?: Observation[];
  at: string;
  summary: Summary;
  agents: AgentDTO[];
  managers?: ManagerDTO[];
  live: Record<string, LiveSession>;
  activity: { generatedAt: string; windowDays: number; rooms: Record<string, Record<string, StationActivity>> };
}

export type ConnectionState = 'connecting' | 'live' | 'reconnecting' | 'offline';

// ---------- tasks (plans, runs, approvals) ----------

export interface PlanStep {
  stationId: string;
  stationName: string;
  action: string;
  risk: 'readonly' | 'effect';
  needsApproval: boolean;
  executable: boolean;
  blockedReason: string | null;
}

export interface Plan {
  id: string;
  roomId: string;
  createdAt: string;
  status: 'ready' | 'running' | 'done' | 'failed' | 'cancelled';
  runId: string | null;
  text: string;
  plan: { summary: string; steps: PlanStep[]; warnings: string[]; level: Level; executable: boolean };
}

export interface Run {
  id: string;
  roomId: string;
  planId: string;
  state: 'starting' | 'running' | 'cancelling' | 'done' | 'failed' | 'cancelled';
  startedAt: string;
  endedAt: string | null;
  sessionId: string | null;
  stationId: string | null;
  result: { ok: boolean; text: string } | null;
  error: string | null;
}

export interface RunLogEntry {
  runId: string;
  roomId: string;
  at: string;
  kind: 'say' | 'tool' | 'denied' | 'approval';
  text?: string;
  tool?: string;
  file?: string | null;
  stationId?: string | null;
}

export interface Approval {
  id: string;
  runId: string;
  roomId: string;
  tool: string;
  summary: string;
  reason: string;
  stationId: string | null;
  createdAt: string;
}

export interface SessionInfo {
  id: string;
  lastAt: string;
  size: number;
  preview: string;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  ts: string | null;
  text: string;
  tools: { name: string; file: string | null }[];
}

export interface Conversation {
  id: string;
  truncated: boolean;
  total: number;
  messages: ConversationMessage[];
}

export interface ManagerMessage {
  role: 'user' | 'assistant' | 'error';
  text: string;
  at: string;
}
export interface ManagerCliEntry {
  id: string;
  at: string;
  provider: 'claude' | 'codex';
  managerId: string;
  label: string;
  kind: 'status' | 'output' | 'error';
  text: string;
}
