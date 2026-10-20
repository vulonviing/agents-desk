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

export const useOffice = create<OfficeState>((set, get) => ({
  projects: null,
  office: null,
  connection: 'connecting',
  demo: false,
  inMaster: true,
  floorsOpen: true,
  goMaster: () => set({ inMaster: true, roomId: null, selectedManagerId: null, selectedAgentId: null, chatAgentId: null, selectedStationId: null, panelOpen: false }),
  toggleFloors: () => set({ floorsOpen: !get().floorsOpen }),
  floorId: null,
  roomId: null,
  selectedAgentId: null,
  chatAgentId: null,
  openChat: (id) => set({ chatAgentId: id }),
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
    set({ inMaster: false, floorId: id, roomId: null, selectedManagerId: null, selectedAgentId: null, chatAgentId: null, selectedStationId: null, panelOpen: false, panelTab: 'agent' });
  },
  enterRoom(roomId) {
    const floor = get().projects?.floors.find((f) => f.rooms.some((r) => r.id === roomId));
    if (!floor) return;
    set({ inMaster: false, floorId: floor.id, roomId, selectedAgentId: null, chatAgentId: null, selectedManagerId: null, selectedStationId: null, panelOpen: true, panelTab: 'activity' });
  },
  leaveRoom: () => set({ roomId: null, selectedStationId: null, selectedAgentId: null, chatAgentId: null, panelOpen: false, panelTab: 'agent' }),
  selectAgent(id) {
    if (!id) return set({ selectedAgentId: null, chatAgentId: null, ...(get().roomId ? {} : { panelOpen: false }) });
    set({ selectedAgentId: id, chatAgentId: get().chatAgentId === id ? id : null, selectedManagerId: null, panelOpen: true, panelTab: 'agent' });
  },
  selectManager(id) {
    if (!id) return set({ selectedManagerId: null, ...(get().roomId ? {} : { panelOpen: false }) });
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
