import { create } from 'zustand';
import type { Agent, AgentDTO, ConnectionState, OfficeSnapshot, Projects, Room, Summary } from '../types';

// App-wide state. The game reads it through GameHost (outside React) and React components subscribe with
// hooks, so a status change never re-initializes the canvas.

export type PanelTab = 'agent' | 'activity' | 'sessions' | 'info';

export interface Hover {
  id: string;
  x: number;
  y: number;
}

interface OfficeState {
  effectsEnabled: boolean;
  toggleEffects(): void;
  projects: Projects | null;
  office: OfficeSnapshot | null;
  connection: ConnectionState;
  demo: boolean;
  inMaster: boolean;
  floorsOpen: boolean;
  goMaster(): void;
  toggleFloors(): void;
  floorId: string | null;
  roomId: string | null;
  selectedAgentId: string | null;
  /** the agent whose chat is open in the left panel */
  chatAgentId: string | null;
  openChat(id: string | null): void;
  /** chats left open when navigating away; restored within the keep-alive time (see chatKeepMs) */
  chatMemory: Record<string, { kind: 'agent' | 'manager'; id: string; at: number }>;
  selectedManagerId: string | null;
  selectedStationId: string | null;
  hover: Hover | null;
  movingIds: string[];
  zoom: number;
  panelTab: PanelTab;
  panelOpen: boolean;
  setProjects(p: Projects): void;
  applyOffice(s: OfficeSnapshot): void;
  setConnection(c: ConnectionState): void;
  setDemo(on: boolean): void;
  setFloor(id: string): void;
  enterRoom(roomId: string): void;
  leaveRoom(): void;
  selectAgent(id: string | null): void;
  selectManager(id: string | null): void;
  selectStation(id: string | null): void;
  setHover(h: Hover | null): void;
  setMoving(ids: string[]): void;
  setZoom(z: number): void;
  setTab(t: PanelTab): void;
  closePanel(): void;
}

const roomsOf = (p: Projects | null) => p?.floors.flatMap((f) => f.rooms) ?? [];

// A chat is kept for a while after the user leaves its floor/office (people go back by accident or on purpose); after this time
// the panel is not restored. The conversation itself (resume id, history) is kept until the user starts a new one.
export const chatKeepMs = () => { try { return Math.max(1, Number(localStorage.getItem('desk-chat-keep-min')) || 20) * 60_000; } catch { return 20 * 60_000; } };
type Memory = OfficeState['chatMemory'];
function remembered(state: Pick<OfficeState, 'chatAgentId' | 'selectedManagerId' | 'office' | 'chatMemory'>, now = Date.now()): Memory {
  const memory: Memory = Object.fromEntries(Object.entries(state.chatMemory).filter(([, m]) => now - m.at < chatKeepMs()));
  const agent = state.chatAgentId ? state.office?.agents.find((a) => a.id === state.chatAgentId) : null;
  if (agent) memory[agent.roomId] = { kind: 'agent', id: agent.id, at: now };
  if (state.selectedManagerId) memory.master = { kind: 'manager', id: state.selectedManagerId, at: now };
  return memory;
}
const restorable = (memory: Memory, key: string, now = Date.now()) => (memory[key] && now - memory[key]!.at < chatKeepMs() ? memory[key]! : null);

export const useOffice = create<OfficeState>((set, get) => ({
  effectsEnabled: true,
  toggleEffects: () => set({ effectsEnabled: !get().effectsEnabled }),
  projects: null,
  office: null,
  connection: 'connecting',
  demo: false,
  inMaster: true,
  floorsOpen: true,
  goMaster() {
    const memory = remembered(get());
    const back = restorable(memory, 'master');
    set({ chatMemory: memory, inMaster: true, roomId: null, selectedManagerId: back?.id ?? null, selectedAgentId: null, chatAgentId: null, selectedStationId: null, panelOpen: !!back });
  },
  toggleFloors: () => set({ floorsOpen: !get().floorsOpen }),
  floorId: null,
  roomId: null,
  selectedAgentId: null,
  chatAgentId: null,
  chatMemory: {},
  openChat: (id) => {
    const { chatAgentId, office, chatMemory } = get();
    // closing a chat on purpose forgets it: it must not come back on its own
    const closing = !id && chatAgentId ? office?.agents.find((a) => a.id === chatAgentId)?.roomId : null;
    set({ chatAgentId: id, ...(closing ? { chatMemory: Object.fromEntries(Object.entries(chatMemory).filter(([k]) => k !== closing)) } : {}) });
  },
  selectedManagerId: null,
  selectedStationId: null,
  hover: null,
  movingIds: [],
  zoom: 1,
  panelTab: 'agent',
  panelOpen: false,

  setProjects(projects) {
    const { floorId, roomId } = get();
    const floor = projects.floors.find((f) => f.id === floorId) ?? projects.floors[0];
    const stillThere = roomId && roomsOf(projects).some((r) => r.id === roomId);
    set({ projects, floorId: floor?.id ?? null, roomId: stillThere ? roomId : null });
  },
  applyOffice(office) {
    const { selectedAgentId } = get();
    const gone = selectedAgentId && !office.agents.some((a) => a.id === selectedAgentId);
    set({ office, ...(gone ? { selectedAgentId: null, chatAgentId: null } : {}) });
  },
  setConnection: (connection) => set({ connection }),
  setDemo: (demo) => set({ demo }),
  setFloor(id) {
    if (!get().inMaster && get().floorId === id && !get().roomId) return;
    set({ chatMemory: remembered(get()), inMaster: false, floorId: id, roomId: null, selectedManagerId: null, selectedAgentId: null, chatAgentId: null, selectedStationId: null, panelOpen: false, panelTab: 'agent' });
  },
  enterRoom(roomId) {
    const floor = get().projects?.floors.find((f) => f.rooms.some((r) => r.id === roomId));
    if (!floor) return;
    const memory = remembered(get());
    const back = restorable(memory, roomId);
    const agent = back ? get().office?.agents.find((a) => a.id === back.id) : null;
    // coming back within the keep-alive time reopens the conversation where it was left
    set({ chatMemory: memory, inMaster: false, floorId: floor.id, roomId, selectedAgentId: agent?.id ?? null, chatAgentId: agent?.id ?? null, selectedManagerId: null, selectedStationId: null, panelOpen: true, panelTab: agent ? 'agent' : 'activity' });
  },
  leaveRoom: () => set({ chatMemory: remembered(get()), roomId: null, selectedStationId: null, selectedAgentId: null, chatAgentId: null, panelOpen: false, panelTab: 'agent' }),
  selectAgent(id) {
    if (!id) { get().openChat(null); return set({ selectedAgentId: null, chatAgentId: null, ...(get().roomId ? {} : { panelOpen: false }) }); }
    set({ selectedAgentId: id, chatAgentId: get().chatAgentId === id ? id : null, selectedManagerId: null, panelOpen: true, panelTab: 'agent' });
  },
  selectManager(id) {
    if (!id) return set({ selectedManagerId: null, chatMemory: Object.fromEntries(Object.entries(get().chatMemory).filter(([k]) => k !== 'master')), ...(get().roomId ? {} : { panelOpen: false }) });
    set({ selectedManagerId: id, selectedAgentId: null, chatAgentId: null, panelOpen: true });
  },
  selectStation(id) {
    set({ selectedStationId: id, ...(id ? { panelOpen: true, panelTab: 'activity' as PanelTab } : {}) });
  },
  setHover: (hover) => set({ hover }),
  setMoving(ids) {
    const cur = get().movingIds;
    if (cur.length === ids.length && cur.every((x, i) => x === ids[i])) return;
    set({ movingIds: ids });
  },
  setZoom: (zoom) => set({ zoom }),
  setTab: (panelTab) => set({ panelTab, panelOpen: true }),
  closePanel: () => set({ panelOpen: false, selectedAgentId: get().roomId ? get().selectedAgentId : null, chatAgentId: get().roomId ? get().chatAgentId : null }),
}));

// ---------- selectors ----------

export const selectRoom = (s: Pick<OfficeState, 'projects' | 'roomId'>): Room | null => roomsOf(s.projects).find((r) => r.id === s.roomId) ?? null;

export const EMPTY_SUMMARY: Summary = { total: 0, working: 0, thinking: 0, idle: 0, offline: 0, completed: 0, error: 0 };

export function toAgent(dto: AgentDTO, moving: boolean, position = { x: 0, y: 0 }): Agent {
  return {
    ...dto,
    status: moving && dto.status !== 'offline' ? 'moving' : dto.status,
    currentTask: dto.currentTask ?? undefined,
    model: dto.model ?? undefined,
    deskId: dto.deskId ?? undefined,
    lastActivity: dto.lastActivity ?? undefined,
    position,
  };
}
