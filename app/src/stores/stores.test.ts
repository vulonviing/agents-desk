import { beforeEach, describe, expect, it } from 'vitest';
import type { AgentDTO, Approval, OfficeSnapshot, Plan, Projects, Run } from '../types';
import { activeRunOf, approvalsOf, plansOf, useTasks } from './tasksStore';
import { toAgent, useOffice } from './officeStore';

const projects = (): Projects => ({
  generatedAt: 't1', warnings: [],
  floors: [
    { id: 'f1', name: 'F1', rooms: [{ id: 'a', name: 'A', stations: [] } as never, { id: 'b', name: 'B', stations: [] } as never] },
    { id: 'f2', name: 'F2', rooms: [{ id: 'c', name: 'C', stations: [] } as never] },
  ],
});
const dto = (id: string, over: Partial<AgentDTO> = {}): AgentDTO => ({ id, roomId: 'a', floorId: 'f1', kind: 'project', skill: null, name: 'Ada', role: 'r', variant: 'adam0', status: 'idle', waiting: false, currentTask: null, model: null, deskId: null, deskName: null, lastActivity: null, recent: [], level: 'plan', ...over });
const snap = (agents: AgentDTO[]): OfficeSnapshot => ({ at: 'x', summary: { total: agents.length, working: 0, thinking: 0, idle: 0, offline: 0, completed: 0, error: 0 }, agents, live: {}, activity: { generatedAt: 'x', windowDays: 14, rooms: {} } });
const run = (over: Partial<Run> = {}): Run => ({ id: 'r1', roomId: 'a', planId: 'p1', state: 'running', startedAt: '2026-10-20T10:00:00Z', endedAt: null, sessionId: null, stationId: null, result: null, error: null, ...over });
const approval = (id: string): Approval => ({ id, runId: 'r1', roomId: 'a', tool: 'Edit', summary: 'Edit: x', reason: '', stationId: null, createdAt: 't' });

beforeEach(() => {
  useOffice.setState({ projects: null, office: null, floorId: null, roomId: null, selectedAgentId: null, selectedStationId: null, panelOpen: false, movingIds: [], inMaster: true, floorsOpen: true });
  useTasks.setState({ plans: {}, runs: {}, approvals: {}, logs: {}, routing: {}, errors: {}, drafts: {} });
});

describe('office store', () => {
  it('selects the first floor when projects arrive and keeps the room if it still exists', () => {
    useOffice.getState().setProjects(projects());
    expect(useOffice.getState().floorId).toBe('f1');
    useOffice.getState().enterRoom('c');
    expect([useOffice.getState().floorId, useOffice.getState().roomId, useOffice.getState().panelOpen]).toEqual(['f2', 'c', true]);
    useOffice.getState().setProjects(projects());
    expect(useOffice.getState().roomId).toBe('c');
    useOffice.getState().setProjects({ ...projects(), floors: [projects().floors[0]!] });
    expect(useOffice.getState().roomId).toBeNull();
  });
  it('starts at Master with floor navigation open and keeps navigation when returning', () => {
    useOffice.getState().goMaster();
    useOffice.getState().setProjects(projects());
    expect(useOffice.getState().inMaster).toBe(true);
    expect(useOffice.getState().floorsOpen).toBe(true);
    useOffice.getState().toggleFloors();
    expect(useOffice.getState().inMaster).toBe(true);
    useOffice.getState().setFloor('f1');
    expect(useOffice.getState().inMaster).toBe(false);
    useOffice.getState().goMaster();
    expect(useOffice.getState().inMaster).toBe(true);
    expect(useOffice.getState().projects?.floors).toHaveLength(2);
  });
  it('changing the floor leaves the room and clears selection', () => {
    const s = useOffice.getState();
    s.setProjects(projects());
    s.enterRoom('a');
    s.selectAgent('a#0');
    useOffice.getState().setFloor('f2');
    const n = useOffice.getState();
    expect([n.floorId, n.roomId, n.selectedAgentId, n.panelOpen]).toEqual(['f2', null, null, false]);
  });
  it('selecting an agent opens the panel; deselecting on the floor closes it', () => {
    const s = useOffice.getState();
    s.setProjects(projects());
    s.selectAgent('a#0');
    expect([useOffice.getState().panelOpen, useOffice.getState().panelTab]).toEqual([true, 'agent']);
    useOffice.getState().selectAgent(null);
    expect(useOffice.getState().panelOpen).toBe(false);
  });
  it('drops a selected agent that disappears from the snapshot', () => {
    useOffice.getState().applyOffice(snap([dto('a#0')]));
    useOffice.getState().selectAgent('a#0');
    useOffice.getState().applyOffice(snap([dto('b#0')]));
    expect(useOffice.getState().selectedAgentId).toBeNull();
  });
  it('setMoving ignores identical lists', () => {
    useOffice.getState().setMoving(['a']);
    const before = useOffice.getState().movingIds;
    useOffice.getState().setMoving(['a']);
    expect(useOffice.getState().movingIds).toBe(before);
  });
  it('maps a DTO to the app agent: moving overrides, offline stays offline, nulls become undefined', () => {
    expect(toAgent(dto('x', { status: 'working', currentTask: 't' }), true).status).toBe('moving');
    expect(toAgent(dto('x', { status: 'offline' }), true).status).toBe('offline');
    const a = toAgent(dto('x'), false, { x: 3, y: 4 });
    expect([a.currentTask, a.model, a.position]).toEqual([undefined, undefined, { x: 3, y: 4 }]);
  });
});

describe('tasks store', () => {
  it('follows plan → run → approval → resolved, and clears approvals when the run ends', () => {
    const t = () => useTasks.getState();
    t().applyTaskEvent({ type: 'plan', payload: { id: 'p1', roomId: 'a', createdAt: '1', status: 'ready' } as Plan });
    expect(plansOf(t(), 'a')).toHaveLength(1);
    t().applyTaskEvent({ type: 'run', payload: run() });
    expect(activeRunOf(t(), 'a')?.id).toBe('r1');
    t().applyTaskEvent({ type: 'approval', payload: approval('x1') });
    t().applyTaskEvent({ type: 'approval', payload: approval('x2') });
    expect(approvalsOf(t(), 'a')).toHaveLength(2);
    t().applyTaskEvent({ type: 'approval-resolved', payload: { id: 'x1' } });
    expect(approvalsOf(t(), 'a')).toHaveLength(1);
    t().applyTaskEvent({ type: 'run', payload: run({ state: 'done' }) });
    expect(approvalsOf(t(), 'a')).toHaveLength(0);
    expect(activeRunOf(t(), 'a')).toBeNull();
  });
  it('keeps the last 80 log entries per run', () => {
    for (let i = 0; i < 100; i++) useTasks.getState().applyTaskEvent({ type: 'run-log', payload: { runId: 'r1', roomId: 'a', at: String(i), kind: 'say', text: String(i) } });
    const log = useTasks.getState().logs.r1!;
    expect([log.length, log[0]!.text, log.at(-1)!.text]).toEqual([80, '20', '99']);
  });
  it('replaces everything on a full task state (after a reconnect)', () => {
    useTasks.getState().applyTaskEvent({ type: 'approval', payload: approval('old') });
    useTasks.getState().setTaskState({ plans: [], runs: [run()], approvals: [approval('new')] });
    expect(Object.keys(useTasks.getState().approvals)).toEqual(['new']);
  });
  it('remembers one draft per room', () => {
    useTasks.getState().setDraft('a', 'merhaba');
    useTasks.getState().setDraft('b', 'dünya');
    expect([useTasks.getState().drafts.a, useTasks.getState().drafts.b]).toEqual(['merhaba', 'dünya']);
  });
});
